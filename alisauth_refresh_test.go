package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestIsDefinitiveAuthRejection(t *testing.T) {
	cases := []struct {
		name   string
		status int
		body   string
		want   bool
	}{
		{"invalid_grant 400", http.StatusBadRequest, `{"error":"invalid_grant"}`, true},
		{"invalid_client 401", http.StatusUnauthorized, `{"error":"invalid_client"}`, true},
		{"unauthorized_client 400", http.StatusBadRequest, `{"error":"unauthorized_client"}`, true},
		{"substring invalid_grant no json", http.StatusBadRequest, `error=invalid_grant`, true},
		{"generic 400 no error", http.StatusBadRequest, `{"error":"temporarily_unavailable"}`, false},
		{"500 transient", http.StatusInternalServerError, `boom`, false},
		{"502 transient", http.StatusBadGateway, `<html>bad gateway</html>`, false},
		{"429 transient", http.StatusTooManyRequests, `slow down`, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := isDefinitiveAuthRejection(c.status, []byte(c.body)); got != c.want {
				t.Fatalf("isDefinitiveAuthRejection(%d, %q) = %v, want %v", c.status, c.body, got, c.want)
			}
		})
	}
}

// writeTempCreds writes a console-credentials.json into a temp HOME and returns
// a ConsoleTokenSource pointed at it.
func writeTempCreds(t *testing.T, c *consoleCredentials) *ConsoleTokenSource {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "console-credentials.json")
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	return &ConsoleTokenSource{path: path}
}

// TestFreshCredsTransientFailureServesValidToken verifies that when the refresh
// endpoint is unreachable/erroring but the on-disk access token is still valid,
// freshCreds returns the existing token instead of a session-expired error.
func TestFreshCredsTransientFailureServesValidToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "upstream boom", http.StatusBadGateway)
	}))
	defer srv.Close()

	old := alisConsoleIdentityURL
	alisConsoleIdentityURL = srv.URL
	defer func() { alisConsoleIdentityURL = old }()

	// Token expires in 2m — inside the 5m refresh grace, so a refresh is
	// attempted, but it is still valid (>0), so the transient failure must fall
	// back to serving it.
	ts := writeTempCreds(t, &consoleCredentials{
		AccessToken:  "still-valid-access",
		IDToken:      "still-valid-id",
		RefreshToken: "refresh-abc",
		Expiry:       time.Now().Add(2 * time.Minute),
	})

	tok, err := ts.Token()
	if err != nil {
		t.Fatalf("expected transient failure to serve valid token, got error: %v", err)
	}
	if tok != "still-valid-id" {
		t.Fatalf("expected on-disk id token to be served, got %q", tok)
	}
}

// TestFreshCredsDefinitiveRejectionErrors verifies that an invalid_grant
// response propagates as an error even if the on-disk token is unexpired,
// because the refresh token is dead and re-login is genuinely required.
func TestFreshCredsDefinitiveRejectionErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"invalid_grant","error_description":"refresh token expired"}`))
	}))
	defer srv.Close()

	old := alisConsoleIdentityURL
	alisConsoleIdentityURL = srv.URL
	defer func() { alisConsoleIdentityURL = old }()

	ts := writeTempCreds(t, &consoleCredentials{
		AccessToken:  "access",
		IDToken:      "id",
		RefreshToken: "refresh-dead",
		Expiry:       time.Now().Add(2 * time.Minute),
	})

	if _, err := ts.Token(); err == nil {
		t.Fatal("expected definitive rejection to return an error, got nil")
	}
}

// TestFreshCredsRefreshSuccess verifies the happy path still writes and returns
// refreshed credentials.
func TestFreshCredsRefreshSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"access_token":"new-access","id_token":"new-id","refresh_token":"new-refresh","expires_in":300}`))
	}))
	defer srv.Close()

	old := alisConsoleIdentityURL
	alisConsoleIdentityURL = srv.URL
	defer func() { alisConsoleIdentityURL = old }()

	ts := writeTempCreds(t, &consoleCredentials{
		AccessToken:  "old-access",
		IDToken:      "old-id",
		RefreshToken: "old-refresh",
		Expiry:       time.Now().Add(1 * time.Minute),
	})

	tok, err := ts.Token()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tok != "new-id" {
		t.Fatalf("expected refreshed id token, got %q", tok)
	}
}
