package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"text/template"
	"time"
)

// errAuthRejected indicates the identity server *definitively* rejected the
// refresh token (e.g. invalid_grant / expired refresh token), meaning the user
// genuinely must sign in again. Transient failures — network errors, timeouts,
// 5xx — must NOT use this, so freshCreds can keep serving a still-valid on-disk
// token instead of surfacing a spurious "session expired" (common right after
// the laptop wakes, when the poll/focus check fires before the network is up).
var errAuthRejected = errors.New("refresh token rejected by identity server")

const (
	alisConsoleCredentialsPath = ".alis/console-credentials.json"
	alisConsoleTokenRefGrace   = 5 * time.Minute
)

// alisConsoleIdentityURL is the OAuth2 token/authorize endpoint host. It is a
// var (not a const) so tests can point the refresh flow at a mock server.
var alisConsoleIdentityURL = "https://identity.alisx.com"

type consoleCredentials struct {
	AccessToken  string    `json:"access_token"`
	IDToken      string    `json:"id_token,omitempty"`
	RefreshToken string    `json:"refresh_token"`
	Expiry       time.Time `json:"expiry,omitempty"`
}

// ConsoleTokenSource reads/refreshes tokens from ~/.alis/console-credentials.json.
// These tokens are issued by identity.alisx.com via PKCE and accepted by console.alisx.com.
type ConsoleTokenSource struct {
	path string
	mu   sync.Mutex
}

var (
	consoleTokenSourceOnce sync.Once
	consoleTokenSourceInst *ConsoleTokenSource
	consoleTokenSourceErr  error
)

// NewConsoleTokenSource returns the process-wide ConsoleTokenSource singleton.
// GitService, ProductService, AlisClient, etc. all call this, so they must
// share one instance: a refresh triggered by, say, a git push and the 5-minute
// CheckAuth poll firing around the same time both go through the same mutex
// instead of racing to redeem the same refresh token independently (which,
// if the identity server rotates refresh tokens on use, makes the loser's
// refresh fail and surface as a spurious session-expired).
func NewConsoleTokenSource() (*ConsoleTokenSource, error) {
	consoleTokenSourceOnce.Do(func() {
		home, err := os.UserHomeDir()
		if err != nil {
			consoleTokenSourceErr = fmt.Errorf("home dir: %w", err)
			return
		}
		consoleTokenSourceInst = &ConsoleTokenSource{path: filepath.Join(home, alisConsoleCredentialsPath)}
	})
	return consoleTokenSourceInst, consoleTokenSourceErr
}

func (s *ConsoleTokenSource) Token() (string, error) {
	creds, err := s.freshCreds()
	if err != nil {
		return "", err
	}
	if creds.IDToken != "" {
		return creds.IDToken, nil
	}
	return creds.AccessToken, nil
}

// AccessToken returns the raw OAuth2 access token (not the ID token).
// Use this for services that validate bearer tokens server-side, such as Forgejo git HTTP auth.
func (s *ConsoleTokenSource) AccessToken() (string, error) {
	creds, err := s.freshCreds()
	if err != nil {
		return "", err
	}
	return creds.AccessToken, nil
}

// CookieHeader returns the "Cookie: ..." value required by console.alisx.com.
// The server requires all three alis cookies to be present simultaneously.
func (s *ConsoleTokenSource) CookieHeader() (string, error) {
	creds, err := s.freshCreds()
	if err != nil {
		return "", err
	}
	return fmt.Sprintf(
		"alis_access_token_fvc=%s; alis_id_token_fvc=%s; alis_refresh_token_fvc=%s",
		creds.AccessToken, creds.IDToken, creds.RefreshToken,
	), nil
}

func (s *ConsoleTokenSource) freshCreds() (*consoleCredentials, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, err := os.Stat(s.path); err != nil {
		return nil, fmt.Errorf("console credentials not found — run Login() first")
	}

	creds, err := s.read()
	if err != nil {
		return nil, err
	}

	tok := creds.IDToken
	if tok == "" {
		tok = creds.AccessToken
	}

	if tok != "" && !creds.Expiry.IsZero() && time.Until(creds.Expiry) > alisConsoleTokenRefGrace {
		log.Printf("[auth] console token valid, no refresh needed (expiry=%s, in %s)",
			creds.Expiry.Format(time.RFC3339), time.Until(creds.Expiry).Round(time.Second))
		return creds, nil
	}

	log.Printf("[auth] console token needs refresh (hasToken=%t expiry=%s untilExpiry=%s hasRefreshToken=%t)",
		tok != "", formatExpiry(creds.Expiry), time.Until(creds.Expiry).Round(time.Second), creds.RefreshToken != "")

	if creds.RefreshToken == "" {
		if tok != "" {
			log.Printf("[auth] no refresh token on disk; returning existing (possibly expired) token")
			return creds, nil
		}
		log.Printf("[auth] console token expired and no refresh token — re-login required")
		return nil, fmt.Errorf("console token expired and no refresh token — run Login() again")
	}

	newCreds, err := s.refresh(creds.RefreshToken)
	if err != nil {
		log.Printf("[auth] console token refresh FAILED: %v", err)
		// Definitive rejection (invalid_grant / expired refresh token): the
		// session is genuinely dead, so propagate and let the UI prompt re-login.
		if errors.Is(err, errAuthRejected) {
			return nil, fmt.Errorf("console token refresh: %w", err)
		}
		// Transient failure (network down after wake, timeout, 5xx). If the
		// current access token is still valid, keep using it rather than
		// flashing a spurious "session expired"; the next poll/focus retries.
		if tok != "" && !creds.Expiry.IsZero() && time.Until(creds.Expiry) > 0 {
			log.Printf("[auth] refresh failed transiently but on-disk token still valid (expiry=%s, in %s) — serving it",
				creds.Expiry.Format(time.RFC3339), time.Until(creds.Expiry).Round(time.Second))
			return creds, nil
		}
		return nil, fmt.Errorf("console token refresh: %w", err)
	}
	if err := s.write(newCreds); err != nil {
		// The refresh itself succeeded — newCreds is a valid, usable token even
		// though persisting it to disk failed (e.g. a transient disk I/O error).
		// Serve it rather than surfacing a spurious "session expired": failing
		// here would tell the caller the session is dead when it's actually
		// fine, and the next successful write will catch disk back up.
		log.Printf("[auth] refresh succeeded but writing credentials FAILED (serving in-memory token): %v", err)
		return newCreds, nil
	}
	log.Printf("[auth] console token refreshed OK (newExpiry=%s, rotatedRefreshToken=%t)",
		formatExpiry(newCreds.Expiry), newCreds.RefreshToken != creds.RefreshToken)
	return newCreds, nil
}

// formatExpiry renders a token expiry for logs, tolerating the zero value.
func formatExpiry(t time.Time) string {
	if t.IsZero() {
		return "unknown"
	}
	return t.Format(time.RFC3339)
}

func (s *ConsoleTokenSource) read() (*consoleCredentials, error) {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return nil, err
	}
	var c consoleCredentials
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("parsing console credentials: %w", err)
	}
	return &c, nil
}

func (s *ConsoleTokenSource) write(c *consoleCredentials) error {
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(s.path, data, 0600)
}

// writeFileAtomic writes data to a temp file in the same directory and renames
// it into place, so readers never observe a missing or half-written file. A
// plain os.WriteFile truncates the target first, opening a window where a
// concurrent os.Stat/read (e.g. the SyncGitAuth ticker or the CheckAuth poll)
// sees no credentials and surfaces a spurious "session expired".
func writeFileAtomic(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".console-credentials-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Chmod(perm); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}

func (s *ConsoleTokenSource) refresh(refreshToken string) (*consoleCredentials, error) {
	log.Printf("[auth] requesting console token refresh from %s (pid=%d)", alisConsoleIdentityURL, os.Getpid())
	form := url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
	}
	req, err := http.NewRequest("POST", alisConsoleIdentityURL+"/token", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	req = req.WithContext(ctx)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("[auth] refresh request to identity server errored: %v", err)
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		log.Printf("[auth] identity server rejected refresh: status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
		// A 4xx with an OAuth error (invalid_grant / expired refresh token) is a
		// definitive rejection: the refresh token is no longer usable, so the
		// user must re-login. 5xx and other statuses are treated as transient by
		// the caller so a still-valid access token keeps working.
		if isDefinitiveAuthRejection(resp.StatusCode, body) {
			return nil, fmt.Errorf("%w: identity server returned %d: %s", errAuthRejected, resp.StatusCode, string(body))
		}
		return nil, fmt.Errorf("identity server returned %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		AccessToken  string `json:"access_token"`
		IDToken      string `json:"id_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse token response: %w", err)
	}

	creds := &consoleCredentials{
		AccessToken:  result.AccessToken,
		IDToken:      result.IDToken,
		RefreshToken: refreshToken,
	}
	if result.RefreshToken != "" {
		creds.RefreshToken = result.RefreshToken
	}
	if result.ExpiresIn > 0 {
		creds.Expiry = time.Now().Add(time.Duration(result.ExpiresIn) * time.Second)
	}
	return creds, nil
}

// isDefinitiveAuthRejection reports whether a non-200 token-endpoint response
// means the refresh token is permanently unusable (re-login required) rather
// than a transient server/network condition worth retrying. Per RFC 6749 the
// token endpoint returns 400 with an "error" of invalid_grant when the refresh
// token is expired/revoked; 401 invalid_client is likewise definitive.
func isDefinitiveAuthRejection(status int, body []byte) bool {
	if status != http.StatusBadRequest && status != http.StatusUnauthorized {
		return false
	}
	var parsed struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(body, &parsed); err == nil {
		switch parsed.Error {
		case "invalid_grant", "invalid_client", "unauthorized_client":
			return true
		case "":
			// No structured error; fall through to substring check below.
		default:
			return false
		}
	}
	b := strings.ToLower(string(body))
	return strings.Contains(b, "invalid_grant") ||
		strings.Contains(b, "invalid_client") ||
		strings.Contains(b, "expired")
}

// authResultPage renders the OAuth callback landing page using the Alis Hub
// design language (monospace, uppercase, brand pink, light/dark aware).
func authResultPage(success bool, detail string) string {
	var (
		accent   = "#e90d57"
		icon     = "&#10003;" // check
		title    = "Authenticated"
		message  = "You&rsquo;re signed in. Head back to Alis&nbsp;Hub to continue. You can close this tab."
		statusEl = `<span class="status ok">Success</span>`
	)
	if !success {
		accent = "#e53e3e"
		icon = "&#10005;" // cross
		title = "Authentication failed"
		message = "Something went wrong while signing you in. Return to Alis&nbsp;Hub and try again."
		statusEl = `<span class="status err">Failed</span>`
	}

	detailEl := ""
	if strings.TrimSpace(detail) != "" {
		detailEl = `<pre class="detail">` + template.HTMLEscapeString(detail) + `</pre>`
	}

	action := `<a class="btn" href="alishub://auth/callback">Return to Alis&nbsp;Hub</a>`
	if !success {
		action = `<a class="btn" href="alishub://auth/failed">Back to Alis&nbsp;Hub</a>`
	}

	return `<!DOCTYPE html>
<html lang="en" data-accent="` + accent + `">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>` + title + ` &middot; Alis Hub</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  :root {
    --accent: ` + accent + `;
    --bg: #ffffff;
    --fg: #1a1a1a;
    --muted: #666666;
    --card: #f5f5f5;
    --border: rgba(0,0,0,0.12);
    --radius: 0.625rem;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1e1e1e;
      --fg: #ffffff;
      --muted: #a0a0a0;
      --card: #2c2c2c;
      --border: rgba(255,255,255,0.12);
    }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    background: var(--bg);
    color: var(--fg);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    width: 100%;
    max-width: 420px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 40px 32px;
    text-align: center;
    box-shadow: 0 24px 60px -24px rgba(0,0,0,0.35);
  }
  .badge {
    width: 64px;
    height: 64px;
    margin: 0 auto 24px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 30px;
    color: #fff;
    background: var(--accent);
    box-shadow: 0 0 0 8px color-mix(in srgb, var(--accent) 16%, transparent);
  }
  .status {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 4px;
    margin-bottom: 16px;
    border: 1px solid var(--accent);
    color: var(--accent);
  }
  h1 {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    margin: 0 0 12px;
  }
  p {
    font-size: 13px;
    line-height: 1.6;
    color: var(--muted);
    margin: 0;
  }
  .detail {
    margin: 20px 0 0;
    padding: 12px;
    text-align: left;
    font-size: 11px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--muted);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) - 2px);
  }
  .brand {
    margin-top: 28px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .brand b { color: var(--accent); }
  .btn {
    display: inline-block;
    margin-top: 28px;
    padding: 10px 20px;
    font-family: inherit;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-decoration: none;
    color: #fff;
    background: var(--accent);
    border-radius: calc(var(--radius) - 2px);
    transition: filter 0.15s ease, transform 0.15s ease;
  }
  .btn:hover { filter: brightness(1.08); transform: translateY(-1px); }
  .btn:active { transform: translateY(0); }
</style>
</head>
<body>
  <main class="card">
    <div class="badge">` + icon + `</div>
    ` + statusEl + `
    <h1>` + title + `</h1>
    <p>` + message + `</p>
    ` + detailEl + `
    ` + action + `
    <div class="brand">Alis<b>&middot;</b>Hub</div>
  </main>
  <script>setTimeout(function () { try { window.close(); } catch (e) {} }, 8000);</script>
</body>
</html>`
}

// PKCELogin opens the browser to identity.alisx.com, waits for the OAuth2 callback
// on a local port, exchanges the code for tokens, and saves them to
// ~/.alis/console-credentials.json.
func PKCELogin(ctx context.Context, openBrowser func(string)) error {
	// Generate PKCE code_verifier (RFC 7636).
	verifierBytes := make([]byte, 32)
	if _, err := rand.Read(verifierBytes); err != nil {
		return fmt.Errorf("random: %w", err)
	}
	codeVerifier := base64.RawURLEncoding.EncodeToString(verifierBytes)

	hash := sha256.Sum256([]byte(codeVerifier))
	codeChallenge := base64.RawURLEncoding.EncodeToString(hash[:])

	// Start a local HTTP server on an available port.
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return fmt.Errorf("local listener: %w", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	redirectURI := fmt.Sprintf("http://localhost:%d/callback", port)

	codeCh := make(chan string, 1)
	errCh := make(chan error, 1)

	mux := http.NewServeMux()
	mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		code := r.URL.Query().Get("code")
		if errParam := r.URL.Query().Get("error"); errParam != "" {
			errCh <- fmt.Errorf("auth error: %s — %s", errParam, r.URL.Query().Get("error_description"))
			desc := r.URL.Query().Get("error_description")
			if desc == "" {
				desc = errParam
			}
			fmt.Fprint(w, authResultPage(false, desc))
			return
		}
		if code == "" {
			errCh <- fmt.Errorf("no code in callback")
			fmt.Fprint(w, authResultPage(false, "No authorization code was returned."))
			return
		}
		codeCh <- code
		fmt.Fprint(w, authResultPage(true, ""))
	})

	server := &http.Server{Handler: mux}
	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()
	defer server.Shutdown(context.Background())

	// Open browser to auth page.
	authURL := alisConsoleIdentityURL + "/authorize?" + url.Values{
		"response_type":         {"code"},
		"redirect_uri":          {redirectURI},
		"scope":                 {"openid email build:read build:write"},
		"code_challenge":        {codeChallenge},
		"code_challenge_method": {"S256"},
	}.Encode()
	openBrowser(authURL)

	// Wait for code or timeout.
	var code string
	select {
	case code = <-codeCh:
	case err := <-errCh:
		return err
	case <-ctx.Done():
		return fmt.Errorf("login timed out")
	}

	// Exchange code for tokens.
	creds, err := exchangeCode(code, redirectURI, codeVerifier)
	if err != nil {
		return fmt.Errorf("code exchange: %w", err)
	}

	// Save to ~/.alis/console-credentials.json.
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	credsPath := filepath.Join(home, alisConsoleCredentialsPath)
	if err := os.MkdirAll(filepath.Dir(credsPath), 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(creds, "", "  ")
	if err != nil {
		return err
	}
	if err := writeFileAtomic(credsPath, data, 0600); err != nil {
		return err
	}

	return nil
}

func exchangeCode(code, redirectURI, codeVerifier string) (*consoleCredentials, error) {
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {redirectURI},
		"code_verifier": {codeVerifier},
	}
	req, err := http.NewRequest("POST", alisConsoleIdentityURL+"/token", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("token exchange returned %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		AccessToken  string `json:"access_token"`
		IDToken      string `json:"id_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse token response: %w", err)
	}

	creds := &consoleCredentials{
		AccessToken:  result.AccessToken,
		IDToken:      result.IDToken,
		RefreshToken: result.RefreshToken,
	}
	if result.ExpiresIn > 0 {
		creds.Expiry = time.Now().Add(time.Duration(result.ExpiresIn) * time.Second)
	}
	return creds, nil
}
