package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	alisConsoleCredentialsPath = ".alis/console-credentials.json"
	alisConsoleIdentityURL     = "https://identity.alisx.com"
	alisConsoleTokenRefGrace   = 5 * time.Minute
)

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

func NewConsoleTokenSource() (*ConsoleTokenSource, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("home dir: %w", err)
	}
	p := filepath.Join(home, alisConsoleCredentialsPath)
	if _, err := os.Stat(p); err != nil {
		return nil, fmt.Errorf("console credentials not found — run Login() first")
	}
	return &ConsoleTokenSource{path: p}, nil
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

	creds, err := s.read()
	if err != nil {
		return nil, err
	}

	tok := creds.IDToken
	if tok == "" {
		tok = creds.AccessToken
	}

	if tok != "" && !creds.Expiry.IsZero() && time.Until(creds.Expiry) > alisConsoleTokenRefGrace {
		return creds, nil
	}

	if creds.RefreshToken == "" {
		if tok != "" {
			return creds, nil
		}
		return nil, fmt.Errorf("console token expired and no refresh token — run Login() again")
	}

	newCreds, err := s.refresh(creds.RefreshToken)
	if err != nil {
		return nil, fmt.Errorf("console token refresh: %w", err)
	}
	if err := s.write(newCreds); err != nil {
		return nil, fmt.Errorf("writing console credentials: %w", err)
	}
	return newCreds, nil
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
	return os.WriteFile(s.path, data, 0600)
}

func (s *ConsoleTokenSource) refresh(refreshToken string) (*consoleCredentials, error) {
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
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
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
		code := r.URL.Query().Get("code")
		if errParam := r.URL.Query().Get("error"); errParam != "" {
			errCh <- fmt.Errorf("auth error: %s — %s", errParam, r.URL.Query().Get("error_description"))
			fmt.Fprintf(w, "<html><body><p>Authentication failed. You can close this tab.</p></body></html>")
			return
		}
		if code == "" {
			errCh <- fmt.Errorf("no code in callback")
			fmt.Fprintf(w, "<html><body><p>Authentication failed. You can close this tab.</p></body></html>")
			return
		}
		codeCh <- code
		fmt.Fprintf(w, "<html><body><p>Authenticated successfully! You can close this tab.</p></body></html>")
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
	data, err := json.MarshalIndent(creds, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(credsPath, data, 0600); err != nil {
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
