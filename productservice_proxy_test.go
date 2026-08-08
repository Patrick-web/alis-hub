//go:build alis_integration

// Live test: starts the local reverse proxy against the real Forgejo instance.
// See the note in productservice_test.go for why this sits behind the
// alis_integration tag.

package main

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
)

// TestForgejoProxy starts the local reverse proxy against the real Forgejo
// instance and verifies that:
//   - a known repo page returns 200 (not a redirect to the OAuth login)
//   - Set-Cookie headers have the Secure flag stripped
//   - X-Frame-Options is absent from the response
//
// Requires ~/.alis/console-credentials.json to exist (i.e. the user is logged in).
// Run with: go test -run TestForgejoProxy -v -timeout 30s
func TestForgejoProxy(t *testing.T) {
	const forgeBase = "https://forgejo-231410899422.us-east4.run.app"
	const probePath = "/voyage/proto"

	ps := NewProductService()
	port, err := ps.ensureAuthProxy(forgeBase)
	if err != nil {
		t.Fatalf("ensureAuthProxy: %v", err)
	}
	t.Logf("proxy listening on 127.0.0.1:%d", port)

	// Use a client that does NOT follow redirects so we see the raw status code.
	client := &http.Client{
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	url := fmt.Sprintf("http://127.0.0.1:%d%s", port, probePath)
	resp, err := client.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))

	t.Logf("status: %d", resp.StatusCode)

	// Should be 200; a redirect to identity.alisx.com means auth injection failed.
	if resp.StatusCode != http.StatusOK {
		loc := resp.Header.Get("Location")
		t.Fatalf("expected 200, got %d (Location: %s)\nbody: %s", resp.StatusCode, loc, body)
	}

	// X-Frame-Options must be stripped.
	if v := resp.Header.Get("X-Frame-Options"); v != "" {
		t.Errorf("X-Frame-Options should be stripped, got %q", v)
	}

	// No Set-Cookie header should contain the Secure flag.
	for _, cookie := range resp.Header["Set-Cookie"] {
		if strings.Contains(cookie, "Secure") {
			t.Errorf("Set-Cookie still contains Secure: %s", cookie)
		}
	}

	t.Logf("Set-Cookie headers: %v", resp.Header["Set-Cookie"])
	t.Log("PASS: proxy authenticated the request and response is clean")
}
