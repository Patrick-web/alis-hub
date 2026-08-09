package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"alis-hub-v3/internal/cliwrap"
)

func TestParseForgejoURL(t *testing.T) {
	tests := []struct {
		name      string
		raw       string
		wantErr   bool
		wantOwner string
		wantName  string
		wantBase  string
		wantCred  string
	}{
		{
			name:      "build repo with .git suffix",
			raw:       "https://forgejo-231410899422.us-east4.run.app/voyage/vp.git",
			wantOwner: "voyage",
			wantName:  "vp",
			wantBase:  "https://forgejo-231410899422.us-east4.run.app",
			wantCred:  "voyage/vp.git",
		},
		{
			name:      "no .git suffix",
			raw:       "https://forgejo-231410899422.us-east4.run.app/voyage/vp",
			wantOwner: "voyage",
			wantName:  "vp",
			wantCred:  "voyage/vp.git",
		},
		{
			name:      "surrounding whitespace is tolerated",
			raw:       "  https://forgejo-1.us-east4.run.app/org/repo.git\n",
			wantOwner: "org",
			wantName:  "repo",
		},
		{name: "github is not forgejo", raw: "https://github.com/org/repo.git", wantErr: true},
		{name: "custom domain is not matched", raw: "https://git.example.com/org/repo.git", wantErr: true},
		{name: "forgejo host without numeric id", raw: "https://forgejo.us-east4.run.app/org/repo.git", wantErr: true},
		{name: "missing repo segment", raw: "https://forgejo-1.us-east4.run.app/voyage", wantErr: true},
		{name: "bare .git repo segment", raw: "https://forgejo-1.us-east4.run.app/voyage/.git", wantErr: true},
		{name: "empty", raw: "", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseForgejoURL(tt.raw)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("parseForgejoURL(%q) = %+v, want error", tt.raw, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("parseForgejoURL(%q): %v", tt.raw, err)
			}
			if got.Owner != tt.wantOwner {
				t.Errorf("Owner = %q, want %q", got.Owner, tt.wantOwner)
			}
			if got.Name != tt.wantName {
				t.Errorf("Name = %q, want %q", got.Name, tt.wantName)
			}
			if tt.wantBase != "" && got.BaseURL != tt.wantBase {
				t.Errorf("BaseURL = %q, want %q", got.BaseURL, tt.wantBase)
			}
			if tt.wantCred != "" && got.CredPath != tt.wantCred {
				t.Errorf("CredPath = %q, want %q", got.CredPath, tt.wantCred)
			}
		})
	}
}

// jwt builds an unsigned token carrying exp, which is all jwtExpiry reads.
func jwt(t *testing.T, exp int64) string {
	t.Helper()
	payload, err := json.Marshal(map[string]int64{"exp": exp})
	if err != nil {
		t.Fatal(err)
	}
	return "header." + base64.RawURLEncoding.EncodeToString(payload) + ".signature"
}

func TestJWTExpiry(t *testing.T) {
	want := time.Now().Add(12 * time.Hour).Unix()
	got, ok := jwtExpiry(jwt(t, want))
	if !ok {
		t.Fatal("jwtExpiry returned not-ok for a valid token")
	}
	if got.Unix() != want {
		t.Errorf("expiry = %d, want %d", got.Unix(), want)
	}

	for _, bad := range []string{
		"",
		"not-a-jwt",
		"only.two",
		"a.!!!not-base64!!!.c",
		"a." + base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"x"}`)) + ".c", // no exp
	} {
		if _, ok := jwtExpiry(bad); ok {
			t.Errorf("jwtExpiry(%.20q) = ok, want not-ok", bad)
		}
	}
}

// testClient returns a client pointed at srv with a pre-cached token, so no test
// ever shells out to the CLI.
func testClient(t *testing.T, srv *httptest.Server) (*ForgejoClient, forgejoTarget) {
	t.Helper()
	c := NewForgejoClient(nil)
	target := forgejoTarget{
		BaseURL:  srv.URL,
		Host:     "forgejo-1.us-east4.run.app",
		Owner:    "voyage",
		Name:     "vp",
		CredPath: "voyage/vp.git",
	}
	c.tokens[target.Host+"/"+target.CredPath] = cachedToken{
		token:  "test-token",
		expiry: time.Now().Add(time.Hour),
	}
	return c, target
}

// pagedItems serves n items in pages of forgejoPageSize, the way Forgejo does:
// with X-Total-Count and X-HasMore, and clamping any larger requested limit.
func pagedItems(n int, hasMoreHeader bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page < 1 {
			page = 1
		}
		start := (page - 1) * forgejoPageSize
		end := min(start+forgejoPageSize, n)
		items := []map[string]int{}
		for i := start; i < end; i++ {
			items = append(items, map[string]int{"id": i})
		}
		w.Header().Set("X-Total-Count", strconv.Itoa(n))
		if hasMoreHeader {
			w.Header().Set("X-HasMore", strconv.FormatBool(end < n))
		}
		_ = json.NewEncoder(w).Encode(items)
	}
}

func TestForgejoListPaginates(t *testing.T) {
	type item struct {
		ID int `json:"id"`
	}

	// 226 is the changed-file count of the largest open PR on the reference
	// instance, the case where the old limit=100 silently returned 50.
	tests := []struct {
		name          string
		total         int
		hasMoreHeader bool
	}{
		{"multiple pages with X-HasMore", 226, true},
		{"multiple pages without X-HasMore", 226, false},
		{"exactly one full page", forgejoPageSize, true},
		{"empty", 0, true},
		{"single item", 1, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var requests int
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests++
				if got := r.Header.Get("Authorization"); got != "Bearer test-token" {
					t.Errorf("Authorization = %q, want the cached bearer token", got)
				}
				pagedItems(tt.total, tt.hasMoreHeader)(w, r)
			}))
			defer srv.Close()

			c, target := testClient(t, srv)
			got, meta, err := forgejoList[item](context.Background(), c, target, "repos/voyage/vp/pulls?state=open")
			if err != nil {
				t.Fatalf("forgejoList: %v", err)
			}
			if len(got) != tt.total {
				t.Errorf("collected %d items, want %d (requests=%d)", len(got), tt.total, requests)
			}
			if meta.Total != tt.total {
				t.Errorf("meta.Total = %d, want %d", meta.Total, tt.total)
			}
			if meta.Truncated {
				t.Errorf("meta.Truncated = true, want false: every page was read")
			}
			// Items must arrive in order and without gaps, which a mis-built
			// page parameter would break.
			for i, it := range got {
				if it.ID != i {
					t.Fatalf("item[%d].ID = %d, want %d", i, it.ID, i)
				}
			}
		})
	}
}

func TestForgejoListReportsTruncation(t *testing.T) {
	// A server that claims far more than it will ever hand over: the read must
	// stop and say so rather than looping or pretending it saw everything.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Total-Count", "9999")
		w.Header().Set("X-HasMore", "true")
		items := make([]map[string]int, forgejoPageSize)
		for i := range items {
			items[i] = map[string]int{"id": i}
		}
		_ = json.NewEncoder(w).Encode(items)
	}))
	defer srv.Close()

	type item struct {
		ID int `json:"id"`
	}
	c, target := testClient(t, srv)
	got, meta, err := forgejoList[item](context.Background(), c, target, "repos/voyage/vp/pulls")
	if err != nil {
		t.Fatalf("forgejoList: %v", err)
	}
	if !meta.Truncated {
		t.Error("meta.Truncated = false, want true")
	}
	if len(got) != forgejoPageSize*forgejoMaxPages {
		t.Errorf("collected %d items, want the page ceiling %d", len(got), forgejoPageSize*forgejoMaxPages)
	}
}

func TestForgejoListPassesPageAndLimit(t *testing.T) {
	var gotQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		_ = json.NewEncoder(w).Encode([]map[string]int{})
	}))
	defer srv.Close()

	type item struct{}
	c, target := testClient(t, srv)
	if _, _, err := forgejoList[item](context.Background(), c, target, "repos/voyage/vp/pulls?state=open"); err != nil {
		t.Fatalf("forgejoList: %v", err)
	}
	for _, want := range []string{"state=open", "page=1", "limit=" + strconv.Itoa(forgejoPageSize)} {
		if !strings.Contains(gotQuery, want) {
			t.Errorf("query %q missing %q", gotQuery, want)
		}
	}
}

func TestForgejoErrorMapping(t *testing.T) {
	tests := []struct {
		status       int
		body         string
		wantUnauth   bool
		wantConflict bool
		wantNotFound bool
		wantMessage  string
	}{
		{status: 401, body: `{"message":"token expired"}`, wantUnauth: true, wantMessage: "token expired"},
		{status: 403, body: `{"message":"forbidden"}`, wantUnauth: true, wantMessage: "forbidden"},
		{status: 409, body: `{"message":"pull request already exists"}`, wantConflict: true, wantMessage: "pull request already exists"},
		{status: 404, body: `{"message":"not found"}`, wantNotFound: true, wantMessage: "not found"},
		{status: 500, body: "plain text failure", wantMessage: "plain text failure"},
	}

	for _, tt := range tests {
		t.Run(strconv.Itoa(tt.status), func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tt.status)
				_, _ = w.Write([]byte(tt.body))
			}))
			defer srv.Close()

			c, target := testClient(t, srv)
			var out map[string]any
			err := c.getJSON(context.Background(), target, "repos/voyage/vp", &out)
			if err == nil {
				t.Fatal("expected an error")
			}
			if IsUnauthorized(err) != tt.wantUnauth {
				t.Errorf("IsUnauthorized = %v, want %v", IsUnauthorized(err), tt.wantUnauth)
			}
			if IsConflict(err) != tt.wantConflict {
				t.Errorf("IsConflict = %v, want %v", IsConflict(err), tt.wantConflict)
			}
			if IsNotFound(err) != tt.wantNotFound {
				t.Errorf("IsNotFound = %v, want %v", IsNotFound(err), tt.wantNotFound)
			}
			if !strings.Contains(err.Error(), tt.wantMessage) {
				t.Errorf("error %q does not carry %q", err, tt.wantMessage)
			}
		})
	}
}

// A 401 usually means the cached token aged out mid-session. One retry with a
// fresh credential should recover without the user seeing anything.
func TestDoRetriesOnceAfter401(t *testing.T) {
	var calls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Header.Get("Authorization") == "Bearer stale" {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"message":"expired"}`))
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"default_branch": "master"})
	}))
	defer srv.Close()

	c := NewForgejoClient(nil)
	target := forgejoTarget{BaseURL: srv.URL, Host: "h", Owner: "voyage", Name: "vp", CredPath: "voyage/vp.git"}
	key := target.Host + "/" + target.CredPath
	c.tokens[key] = cachedToken{token: "stale", expiry: time.Now().Add(time.Hour)}

	// Stand in for the CLI: the retry re-mints, so seed a good token at the
	// moment the stale one is dropped.
	c.mint = func(context.Context, forgejoTarget) (string, error) {
		return "fresh", nil
	}

	var out struct {
		DefaultBranch string `json:"default_branch"`
	}
	if err := c.getJSON(context.Background(), target, "repos/voyage/vp", &out); err != nil {
		t.Fatalf("getJSON: %v", err)
	}
	if out.DefaultBranch != "master" {
		t.Errorf("DefaultBranch = %q, want master", out.DefaultBranch)
	}
	if calls != 2 {
		t.Errorf("server saw %d calls, want 2 (one rejected, one retried)", calls)
	}
}

// When the retry cannot obtain a replacement credential, the caller must still
// see the 401: "sign in again" is keyed off it, and reporting the mint failure
// instead would hide the expired session behind a CLI error.
func TestDoKeeps401WhenRetryCannotMint(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"message":"token expired"}`))
	}))
	defer srv.Close()

	c, target := testClient(t, srv)
	c.mint = func(context.Context, forgejoTarget) (string, error) {
		return "", fmt.Errorf("alis CLI not available")
	}

	var out map[string]any
	err := c.getJSON(context.Background(), target, "repos/voyage/vp", &out)
	if err == nil {
		t.Fatal("expected an error")
	}
	if !IsUnauthorized(err) {
		t.Errorf("IsUnauthorized = false for %v, want true", err)
	}
	if !strings.Contains(err.Error(), "token expired") {
		t.Errorf("error = %v, want the server's 401 message", err)
	}
}

func TestTokenCacheAvoidsRefetch(t *testing.T) {
	c := NewForgejoClient(nil)
	target := forgejoTarget{Host: "h", CredPath: "voyage/vp.git"}

	var mints int
	c.mint = func(context.Context, forgejoTarget) (string, error) {
		mints++
		return jwt(t, time.Now().Add(12*time.Hour).Unix()), nil
	}

	for range 5 {
		if _, err := c.token(context.Background(), target); err != nil {
			t.Fatalf("token: %v", err)
		}
	}
	if mints != 1 {
		t.Errorf("minted %d times, want 1: a 12h token must be cached", mints)
	}

	// A token inside the grace window is treated as spent.
	c.tokens[target.Host+"/"+target.CredPath] = cachedToken{
		token:  "nearly-dead",
		expiry: time.Now().Add(forgejoTokenGrace / 2),
	}
	if _, err := c.token(context.Background(), target); err != nil {
		t.Fatalf("token: %v", err)
	}
	if mints != 2 {
		t.Errorf("minted %d times, want 2: a token inside the grace window must be replaced", mints)
	}
}

// The UI prompts for sign-in off a single signal, so both rejections that mean
// "your session is gone" have to reach it: Forgejo's 401 and the CLI's exit 4.
func TestIsAuthFailure(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"forgejo 401", &ForgejoError{Status: 401, Message: "expired"}, true},
		{"forgejo 403", &ForgejoError{Status: 403}, true},
		{"cli exit 4", &cliwrap.ErrUnauthenticated{}, true},
		{"wrapped cli exit 4", fmt.Errorf("git credential: %w", &cliwrap.ErrUnauthenticated{}), true},
		{"wrapped forgejo 401", fmt.Errorf("list prs: %w", &ForgejoError{Status: 401}), true},
		{"forgejo 404", &ForgejoError{Status: 404}, false},
		{"forgejo 409", &ForgejoError{Status: 409}, false},
		{"plain error", errors.New("boom"), false},
		{"nil", nil, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isAuthFailure(tt.err); got != tt.want {
				t.Errorf("isAuthFailure(%v) = %v, want %v", tt.err, got, tt.want)
			}
		})
	}
}

func TestForgejoMessage(t *testing.T) {
	tests := []struct{ body, want string }{
		{`{"message":"pull request already exists"}`, "pull request already exists"},
		{`{"errors":["x"]}`, `{"errors":["x"]}`},
		{"  plain text  ", "plain text"},
		{"", ""},
	}
	for _, tt := range tests {
		if got := forgejoMessage([]byte(tt.body)); got != tt.want {
			t.Errorf("forgejoMessage(%q) = %q, want %q", tt.body, got, tt.want)
		}
	}

	long := strings.Repeat("x", 500)
	got := forgejoMessage([]byte(long))
	if len(got) > 310 {
		t.Errorf("forgejoMessage did not cap a long body: got %d chars", len(got))
	}
}

func TestResolveRejectsBadArguments(t *testing.T) {
	c := NewForgejoClient(nil)
	tests := []struct{ org, product, repo string }{
		{"", "vp", "build"},
		{"voyage", "", "build"},
		{"voyage", "vp", "worktree"},
		{"voyage", "vp", ""},
	}
	for _, tt := range tests {
		if _, err := c.resolve(tt.org, tt.product, tt.repo); err == nil {
			t.Errorf("resolve(%q, %q, %q) = nil error, want one", tt.org, tt.product, tt.repo)
		}
	}
}

func TestInvalidateProductDropsOnlyThatProduct(t *testing.T) {
	c := NewForgejoClient(nil)
	keep := forgejoTarget{Owner: "voyage", Name: "other"}
	c.remotes["voyage/vp/build"] = cachedRemote{fetched: time.Now()}
	c.remotes["voyage/vp/define"] = cachedRemote{fetched: time.Now()}
	c.remotes["voyage/other/build"] = cachedRemote{target: keep, fetched: time.Now()}

	c.InvalidateProduct("voyage", "vp")

	if len(c.remotes) != 1 {
		t.Fatalf("remotes = %v, want only voyage/other/build", c.remotes)
	}
	if got := c.remotes["voyage/other/build"].target; got.Name != "other" {
		t.Errorf("kept entry = %+v, want the untouched product", got)
	}
}

// The client must not hang forever on a stalled server, which is what
// http.DefaultClient with no timeout used to allow.
func TestHTTPClientHasTimeout(t *testing.T) {
	c := NewForgejoClient(nil)
	if c.http.Timeout == 0 {
		t.Fatal("client has no timeout")
	}
	if c.http.Timeout > 2*time.Minute {
		t.Errorf("timeout %v is too generous for a call behind a spinner", c.http.Timeout)
	}
}

func TestContextCancellationPropagates(t *testing.T) {
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-release
	}))
	defer srv.Close()
	defer close(release)

	c, target := testClient(t, srv)
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	var out map[string]any
	err := c.getJSON(ctx, target, "repos/voyage/vp", &out)
	if err == nil {
		t.Fatal("expected a deadline error")
	}
	if !strings.Contains(err.Error(), "context deadline exceeded") {
		t.Errorf("error = %v, want a deadline error", err)
	}
}

// Guards the assumption the whole pagination design rests on: the deployed
// Forgejo clamps limit to 50, so asking for 100 is not a way to avoid paging.
func TestPageSizeMatchesServerCap(t *testing.T) {
	if forgejoPageSize != 50 {
		t.Errorf("forgejoPageSize = %d, want 50 (the server's own per-page cap)", forgejoPageSize)
	}
}

func ExampleForgejoError() {
	err := &ForgejoError{Status: http.StatusConflict, Message: "pull request already exists"}
	fmt.Println(err)
	// Output: forgejo 409: pull request already exists
}
