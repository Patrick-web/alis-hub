package main

// Forgejo REST client for the pull request feature.
//
// Both halves of "which repo" and "with what credential" come from the alis
// CLI, not from a local clone:
//
//   - The remote URL comes from `alis git configure <org>.<product> --json`
//     (CLIService.GitRemotesForProduct). The app used to read it back out of
//     ~/alis.build/<org>/... with `git remote get-url origin`, which meant the
//     PR tab silently required a clone and burned a subprocess per API call.
//   - The token comes from `alis git credential get`, the same Forgejo-scoped
//     credential git itself uses (claims: email/exp/sub/uid). The app used to
//     send the full Console identity token, which carries the user's groups,
//     policy and scopes and is far more than Forgejo needs to answer for one
//     repo.
//
// Both CLI calls cost roughly a second, so both are cached. The token is
// cached against its own `exp` (12h in practice, so about one call per repo
// per session) and dropped on a 401; the remote is cached until something
// invalidates it.

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	// forgejoPageSize is the server's own per-page cap. Asking for more is not
	// an error and not honoured: the deployed Forgejo silently clamps to 50, so
	// the previous code's `limit=100` returned 50 files for a 226-file PR and
	// reported nothing missing.
	forgejoPageSize = 50

	// forgejoMaxPages bounds a paginated read. 50 pages is 2500 items, well
	// past any reviewable PR, and stops a bad X-HasMore from looping forever.
	forgejoMaxPages = 50

	// forgejoHTTPTimeout bounds a single request. Forgejo runs on Cloud Run
	// here, so a cold start is the common slow case; without a bound a hung
	// request left the UI spinning for the life of the process.
	forgejoHTTPTimeout = 30 * time.Second

	// forgejoTokenGrace is how long before expiry a cached token is considered
	// spent, covering clock skew and a slow request.
	forgejoTokenGrace = 2 * time.Minute

	// forgejoRemoteTTL bounds how long a resolved remote is trusted. Remotes
	// effectively never change, so this is a backstop against a stale entry
	// outliving a repo move, not a cache-correctness mechanism.
	forgejoRemoteTTL = 30 * time.Minute
)

// ForgejoError is a non-2xx response from the Forgejo API. It carries the
// status so callers can distinguish "sign in again" (401) from "that PR already
// exists" (409) from a genuine failure, all of which the previous code
// flattened into one opaque string.
type ForgejoError struct {
	Status  int
	Message string
}

func (e *ForgejoError) Error() string {
	if e.Message == "" {
		return fmt.Sprintf("forgejo: %s", http.StatusText(e.Status))
	}
	return fmt.Sprintf("forgejo %d: %s", e.Status, e.Message)
}

// IsUnauthorized reports whether err is a 401 or 403 from Forgejo.
func IsUnauthorized(err error) bool {
	var fe *ForgejoError
	if !errors.As(err, &fe) {
		return false
	}
	return fe.Status == http.StatusUnauthorized || fe.Status == http.StatusForbidden
}

// IsConflict reports whether err is a 409, which is how Forgejo rejects a
// duplicate pull request and a merge that no longer applies.
func IsConflict(err error) bool {
	var fe *ForgejoError
	return errors.As(err, &fe) && fe.Status == http.StatusConflict
}

// IsNotFound reports whether err is a 404.
func IsNotFound(err error) bool {
	var fe *ForgejoError
	return errors.As(err, &fe) && fe.Status == http.StatusNotFound
}

// forgejoTarget is a resolved repository: everything needed to address the API
// and to ask the credential helper for a token scoped to it.
type forgejoTarget struct {
	BaseURL  string // https://forgejo-….run.app
	Host     string // forgejo-….run.app
	Owner    string // voyage
	Name     string // vp
	CredPath string // voyage/vp.git, the path git sends to the credential helper
}

func (t forgejoTarget) repoPath() string { return t.Owner + "/" + t.Name }

// listMeta describes a paginated read: how many items the server says exist,
// and whether the read stopped short of them. Truncation has to be reported,
// not inferred, or the UI shows 50 of 226 files as though it were all of them.
type listMeta struct {
	Total     int  `json:"total"`
	Truncated bool `json:"truncated"`
}

type cachedRemote struct {
	target  forgejoTarget
	fetched time.Time
}

type cachedToken struct {
	token  string
	expiry time.Time
}

// ForgejoClient resolves repositories and performs authenticated API calls.
type ForgejoClient struct {
	cli  *CLIService
	http *http.Client

	// mint obtains a fresh credential for a target. It is a field rather than a
	// direct call so tests can drive the cache and the 401 retry without a CLI.
	mint func(context.Context, forgejoTarget) (string, error)

	mu      sync.Mutex
	remotes map[string]cachedRemote // key: org/product/repo
	tokens  map[string]cachedToken  // key: host/credPath
}

func NewForgejoClient(cli *CLIService) *ForgejoClient {
	c := &ForgejoClient{
		cli:     cli,
		http:    &http.Client{Timeout: forgejoHTTPTimeout},
		remotes: make(map[string]cachedRemote),
		tokens:  make(map[string]cachedToken),
	}
	c.mint = c.mintFromCLI
	return c
}

// parseForgejoURL turns a git remote URL into an API target, rejecting hosts
// that are not Alis-hosted Forgejo. Kept separate from any I/O so it can be
// tested directly.
func parseForgejoURL(raw string) (forgejoTarget, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return forgejoTarget{}, fmt.Errorf("empty remote url")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return forgejoTarget{}, fmt.Errorf("parse remote url: %w", err)
	}
	if !forgejoHostRe.MatchString(u.Host) {
		return forgejoTarget{}, fmt.Errorf("not a forgejo host: %s", u.Host)
	}
	parts := strings.SplitN(strings.Trim(u.Path, "/"), "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return forgejoTarget{}, fmt.Errorf("unexpected remote path: %s", u.Path)
	}
	name := strings.TrimSuffix(parts[1], ".git")
	if name == "" {
		return forgejoTarget{}, fmt.Errorf("unexpected remote path: %s", u.Path)
	}
	return forgejoTarget{
		BaseURL:  u.Scheme + "://" + u.Host,
		Host:     u.Host,
		Owner:    parts[0],
		Name:     name,
		CredPath: parts[0] + "/" + name + ".git",
	}, nil
}

// resolve returns the target for a product's define or build repo. repo is
// "build" or "define".
func (c *ForgejoClient) resolve(org, product, repo string) (forgejoTarget, error) {
	if org == "" || product == "" {
		return forgejoTarget{}, fmt.Errorf("organisation and product are required")
	}
	if repo != "build" && repo != "define" {
		return forgejoTarget{}, fmt.Errorf("repo must be \"build\" or \"define\", got %q", repo)
	}
	key := org + "/" + product + "/" + repo

	c.mu.Lock()
	if hit, ok := c.remotes[key]; ok && time.Since(hit.fetched) < forgejoRemoteTTL {
		c.mu.Unlock()
		return hit.target, nil
	}
	c.mu.Unlock()

	remotes, err := c.cli.GitRemotesForProduct(org, product)
	if err != nil {
		return forgejoTarget{}, fmt.Errorf("resolve %s.%s remote: %w", org, product, err)
	}
	raw := remotes.BuildRemoteURL
	if repo == "define" {
		raw = remotes.DefineRemoteURL
	}
	if raw == "" {
		return forgejoTarget{}, fmt.Errorf("no %s remote for %s.%s", repo, org, product)
	}
	target, err := parseForgejoURL(raw)
	if err != nil {
		return forgejoTarget{}, err
	}

	c.mu.Lock()
	c.remotes[key] = cachedRemote{target: target, fetched: time.Now()}
	c.mu.Unlock()
	return target, nil
}

// InvalidateProduct drops cached remotes for a product, for use when the
// workspace switches or a repo is re-pointed.
func (c *ForgejoClient) InvalidateProduct(org, product string) {
	prefix := org + "/" + product + "/"
	c.mu.Lock()
	defer c.mu.Unlock()
	for k := range c.remotes {
		if strings.HasPrefix(k, prefix) {
			delete(c.remotes, k)
		}
	}
}

// token returns a Forgejo-scoped token for the target, from cache when it has
// meaningful life left.
func (c *ForgejoClient) token(ctx context.Context, t forgejoTarget) (string, error) {
	key := t.Host + "/" + t.CredPath

	c.mu.Lock()
	if hit, ok := c.tokens[key]; ok && time.Until(hit.expiry) > forgejoTokenGrace {
		c.mu.Unlock()
		return hit.token, nil
	}
	c.mu.Unlock()

	tok, err := c.mint(ctx, t)
	if err != nil {
		return "", err
	}

	expiry, ok := jwtExpiry(tok)
	if !ok {
		// An opaque or unparsable credential still works; it just cannot be
		// cached against its own lifetime. Hold it briefly so a burst of calls
		// for one PR does not pay for the CLI each time.
		expiry = time.Now().Add(5*time.Minute + forgejoTokenGrace)
	}

	c.mu.Lock()
	c.tokens[key] = cachedToken{token: tok, expiry: expiry}
	c.mu.Unlock()
	return tok, nil
}

// mintFromCLI asks the CLI's credential helper for a token, speaking git's
// credential protocol on stdin. The path matters here for the same reason
// useHttpPath does in gitCredentialArgs: the helper derives the Forgejo
// repository from it and fails without it.
func (c *ForgejoClient) mintFromCLI(ctx context.Context, t forgejoTarget) (string, error) {
	if c.cli == nil || c.cli.runner == nil {
		return "", fmt.Errorf("alis CLI not available")
	}
	req := fmt.Sprintf("protocol=https\nhost=%s\npath=%s\n\n", t.Host, t.CredPath)
	result, err := c.cli.runner.RunWithStdin(ctx, []byte(req), "git", "credential", "get")
	if err != nil {
		return "", fmt.Errorf("git credential: %w", err)
	}
	for line := range strings.SplitSeq(string(result.Stdout), "\n") {
		if after, ok := strings.CutPrefix(strings.TrimSpace(line), "password="); ok {
			if after == "" {
				break
			}
			return after, nil
		}
	}
	return "", fmt.Errorf("git credential: no password in helper output for %s", t.repoPath())
}

// invalidateToken drops a cached token, so the next call mints a fresh one.
func (c *ForgejoClient) invalidateToken(t forgejoTarget) {
	c.mu.Lock()
	delete(c.tokens, t.Host+"/"+t.CredPath)
	c.mu.Unlock()
}

// jwtExpiry reads the `exp` claim without verifying the signature, which is the
// server's job. Returns false for anything that is not a readable JWT.
func jwtExpiry(token string) (time.Time, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return time.Time{}, false
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return time.Time{}, false
	}
	var claims struct {
		Exp int64 `json:"exp"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil || claims.Exp == 0 {
		return time.Time{}, false
	}
	return time.Unix(claims.Exp, 0), true
}

// do performs one authenticated API call and returns the body and the response
// headers. Headers are part of the contract because pagination lives in them
// (Link, X-Total-Count, X-HasMore); the previous forgejoAPI returned the body
// alone, so paginating meant changing every caller.
//
// A 401 retries once with a freshly minted token, since the usual cause is a
// cached credential that expired mid-session.
func (c *ForgejoClient) do(ctx context.Context, t forgejoTarget, method, apiPath string, body []byte) ([]byte, http.Header, error) {
	data, hdr, err := c.doOnce(ctx, t, method, apiPath, body)
	if err == nil || !IsUnauthorized(err) {
		return data, hdr, err
	}

	c.invalidateToken(t)
	retryData, retryHdr, retryErr := c.doOnce(ctx, t, method, apiPath, body)
	if retryErr == nil {
		return retryData, retryHdr, nil
	}
	// Keep the server's verdict when the retry failed for an unrelated reason,
	// such as the CLI being unavailable to mint a replacement. Reporting that
	// instead would hide the expired session, and callers key "sign in again"
	// off the 401.
	var fe *ForgejoError
	if !errors.As(retryErr, &fe) {
		return nil, hdr, err
	}
	return retryData, retryHdr, retryErr
}

func (c *ForgejoClient) doOnce(ctx context.Context, t forgejoTarget, method, apiPath string, body []byte) ([]byte, http.Header, error) {
	token, err := c.token(ctx, t)
	if err != nil {
		return nil, nil, err
	}

	var reqBody io.Reader
	if body != nil {
		reqBody = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, t.BaseURL+"/api/v1/"+strings.TrimPrefix(apiPath, "/"), reqBody)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.Header, err
	}
	if resp.StatusCode >= 400 {
		return nil, resp.Header, &ForgejoError{Status: resp.StatusCode, Message: forgejoMessage(data)}
	}
	return data, resp.Header, nil
}

// forgejoMessage pulls the human-readable part out of an error body. Forgejo
// answers with {"message":…,"errors":[…]} for most failures and plain text for
// the rest.
func forgejoMessage(data []byte) string {
	var env struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal(data, &env); err == nil && env.Message != "" {
		return env.Message
	}
	msg := strings.TrimSpace(string(data))
	const cap = 300
	if len(msg) > cap {
		return msg[:cap] + "…"
	}
	return msg
}

// getJSON performs a GET and decodes the body into out.
func (c *ForgejoClient) getJSON(ctx context.Context, t forgejoTarget, apiPath string, out any) error {
	data, _, err := c.do(ctx, t, http.MethodGet, apiPath, nil)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, out); err != nil {
		return fmt.Errorf("parse %s: %w", apiPath, err)
	}
	return nil
}

// postJSON performs a POST with a JSON body and decodes the response into out,
// which may be nil for endpoints that return nothing useful.
func (c *ForgejoClient) postJSON(ctx context.Context, t forgejoTarget, apiPath string, in, out any) error {
	body, err := json.Marshal(in)
	if err != nil {
		return err
	}
	data, _, err := c.do(ctx, t, http.MethodPost, apiPath, body)
	if err != nil {
		return err
	}
	if out == nil || len(data) == 0 {
		return nil
	}
	if err := json.Unmarshal(data, out); err != nil {
		return fmt.Errorf("parse %s: %w", apiPath, err)
	}
	return nil
}

// patchJSON performs a PATCH with a JSON body and decodes the response into
// out.
func (c *ForgejoClient) patchJSON(ctx context.Context, t forgejoTarget, apiPath string, in, out any) error {
	body, err := json.Marshal(in)
	if err != nil {
		return err
	}
	data, _, err := c.do(ctx, t, http.MethodPatch, apiPath, body)
	if err != nil {
		return err
	}
	if out == nil || len(data) == 0 {
		return nil
	}
	if err := json.Unmarshal(data, out); err != nil {
		return fmt.Errorf("parse %s: %w", apiPath, err)
	}
	return nil
}

// getRaw performs a GET and returns the body undecoded, for the endpoints that
// answer with text rather than JSON (a PR's unified diff).
func (c *ForgejoClient) getRaw(ctx context.Context, t forgejoTarget, apiPath string) ([]byte, error) {
	data, _, err := c.do(ctx, t, http.MethodGet, apiPath, nil)
	return data, err
}

// forgejoList reads every page of a collection, up to forgejoMaxPages, and
// reports what the server says the total is so a short read can be labelled as
// one.
//
// apiPath must not carry page or limit; both are added here.
func forgejoList[T any](ctx context.Context, c *ForgejoClient, t forgejoTarget, apiPath string) ([]T, listMeta, error) {
	var all []T
	meta := listMeta{}

	for page := 1; page <= forgejoMaxPages; page++ {
		sep := "?"
		if strings.Contains(apiPath, "?") {
			sep = "&"
		}
		paged := fmt.Sprintf("%s%spage=%d&limit=%d", apiPath, sep, page, forgejoPageSize)

		data, hdr, err := c.do(ctx, t, http.MethodGet, paged, nil)
		if err != nil {
			return nil, meta, err
		}
		var batch []T
		if err := json.Unmarshal(data, &batch); err != nil {
			return nil, meta, fmt.Errorf("parse %s: %w", apiPath, err)
		}
		all = append(all, batch...)

		if total, err := strconv.Atoi(hdr.Get("X-Total-Count")); err == nil {
			meta.Total = total
		}
		// Stop on the server's own signal when it gives one, and on a short
		// page regardless. A full page with no X-HasMore means "ask again".
		if hdr.Get("X-HasMore") == "false" || len(batch) < forgejoPageSize {
			meta.Truncated = meta.Total > len(all)
			return all, meta, nil
		}
	}

	meta.Truncated = true
	if meta.Total < len(all) {
		meta.Total = len(all)
	}
	return all, meta, nil
}
