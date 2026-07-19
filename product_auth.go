package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"google.golang.org/protobuf/encoding/protowire"
)

// newAuthProxyHandler returns an http.Handler that reverse-proxies to base,
// injecting a fresh Bearer token on every outbound request (including
// WebSocket upgrades) and stripping headers that would prevent the WebView
// from rendering the response correctly.
func newAuthProxyHandler(base string, port int, tokens *ConsoleTokenSource) (http.Handler, error) {
	target, err := url.Parse(base)
	if err != nil {
		return nil, err
	}
	proxyBase := fmt.Sprintf("http://127.0.0.1:%d", port)
	return &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(target)
			pr.Out.Host = target.Host
			// Rewrite any self-referencing Referer/Origin to the upstream host.
			for _, name := range []string{"Referer", "Origin"} {
				if v := pr.In.Header.Get(name); v != "" {
					pr.Out.Header.Set(name, strings.ReplaceAll(v, proxyBase, base))
				}
			}
			// Inject the alis Bearer token so upstream authenticates without OAuth redirect.
			if token, tokErr := tokens.AccessToken(); tokErr == nil && token != "" {
				pr.Out.Header.Set("Authorization", "Bearer "+token)
			}
		},
		ModifyResponse: func(resp *http.Response) error {
			// Strip: these would block the WebView from rendering.
			resp.Header.Del("X-Frame-Options")
			resp.Header.Del("Content-Security-Policy")
			// Strip Secure flag so the browser accepts cookies over http://127.0.0.1.
			if cookies := resp.Header["Set-Cookie"]; len(cookies) > 0 {
				rewritten := make([]string, 0, len(cookies))
				for _, v := range cookies {
					v = strings.ReplaceAll(v, "; Secure", "")
					v = strings.ReplaceAll(v, ";Secure", "")
					rewritten = append(rewritten, v)
				}
				resp.Header["Set-Cookie"] = rewritten
			}
			// Rewrite redirect targets to stay within the proxy.
			if locs := resp.Header["Location"]; len(locs) > 0 {
				rewritten := make([]string, 0, len(locs))
				for _, v := range locs {
					rewritten = append(rewritten, strings.ReplaceAll(v, base, proxyBase))
				}
				resp.Header["Location"] = rewritten
			}
			return nil
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			http.Error(w, "proxy: upstream error", http.StatusBadGateway)
		},
	}, nil
}

// ensureAuthProxy starts (or reuses) a local HTTP proxy for base and returns
// the port it is listening on. The proxy injects a fresh Bearer token on every
// outbound request so upstream authenticates without an OAuth redirect.
func (s *ProductService) ensureAuthProxy(base string) (int, error) {
	if err := s.initTokens(); err != nil {
		return 0, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if p, ok := s.proxies[base]; ok {
		return p.port, nil
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	port := ln.Addr().(*net.TCPAddr).Port
	h, err := newAuthProxyHandler(base, port, s.tokens)
	if err != nil {
		ln.Close()
		return 0, err
	}
	srv := &http.Server{Handler: h}
	go srv.Serve(ln) //nolint:errcheck
	if s.proxies == nil {
		s.proxies = map[string]*authProxy{}
	}
	s.proxies[base] = &authProxy{server: srv, port: port, base: base}
	return port, nil
}

func (s *ProductService) emitSyncLog(text string) {
	s.mu.Lock()
	app := s.app
	s.mu.Unlock()
	if app != nil {
		app.Event.Emit("sync:log", text)
	}
}

func (s *ProductService) initTokens() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.tokens != nil {
		return nil
	}
	ts, err := NewConsoleTokenSource()
	if err != nil {
		return err
	}
	s.tokens = ts
	return nil
}

// IsLoggedIn returns true when console credentials exist.
func (s *ProductService) IsLoggedIn() bool {
	home, err := os.UserHomeDir()
	if err != nil {
		return false
	}
	_, err = os.Stat(filepath.Join(home, alisConsoleCredentialsPath))
	return err == nil
}

// CheckAuth returns true when a valid, refreshable auth token can be obtained.
// Unlike IsLoggedIn, this actually tries to fetch/refresh the token, so it
// returns false when the refresh token has expired even if the credentials
// file still exists.
func (s *ProductService) CheckAuth() bool {
	ts, err := NewConsoleTokenSource()
	if err != nil {
		log.Printf("[auth] CheckAuth: token source unavailable: %v", err)
		return false
	}
	if _, err = ts.Token(); err != nil {
		log.Printf("[auth] CheckAuth: FAILED, will prompt re-login: %v", err)
		return false
	}
	return true
}

// Login triggers the PKCE OAuth2 flow. The browser opens, the user authenticates,
// and tokens are saved to ~/.alis/console-credentials.json.
func (s *ProductService) Login() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	err := PKCELogin(ctx, openBrowserURL)
	if err == nil {
		// Force re-init of token source after login.
		s.mu.Lock()
		s.tokens = nil
		s.mu.Unlock()

		// Refresh the on-disk git-auth.gitconfig with the new token. Without
		// this, repos keep the stale extraHeader from app launch (or an
		// earlier login) and git commands fail auth even after logging in.
		if syncErr := SyncGitAuth(); syncErr != nil {
			fmt.Fprintf(os.Stderr, "alis-hub: sync git auth after login: %v\n", syncErr)
		}
	}
	return err
}

type UserProfile struct {
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

// readIDTokenClaims decodes the email and sub claims from the stored ID token
// (or access token as fallback) without verifying the signature — verification
// isn't needed since we're only reading claims from a token we already trust
// (stored locally after a successful login).
func readIDTokenClaims() (email, sub string, err error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", "", err
	}
	data, err := os.ReadFile(filepath.Join(home, alisConsoleCredentialsPath))
	if err != nil {
		return "", "", fmt.Errorf("not logged in")
	}
	var creds consoleCredentials
	if err := json.Unmarshal(data, &creds); err != nil {
		return "", "", fmt.Errorf("bad credentials: %w", err)
	}
	tok := creds.IDToken
	if tok == "" {
		tok = creds.AccessToken
	}
	if tok == "" {
		return "", "", fmt.Errorf("no token found")
	}
	parts := strings.Split(tok, ".")
	if len(parts) < 2 {
		return "", "", fmt.Errorf("invalid token format")
	}
	decoded, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", "", fmt.Errorf("decode token claims: %w", err)
	}
	var claims struct {
		Email string `json:"email"`
		Sub   string `json:"sub"`
	}
	if err := json.Unmarshal(decoded, &claims); err != nil {
		return "", "", fmt.Errorf("parse claims: %w", err)
	}
	return claims.Email, claims.Sub, nil
}

// GetUserProfile fetches name and photo for the logged-in user via
// BatchRetrieveMaskedUsers, using the sub from the stored token as the user ID.
func (s *ProductService) GetUserProfile() (*UserProfile, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	email, sub, err := readIDTokenClaims()
	if err != nil {
		return nil, err
	}

	profile := &UserProfile{Email: email}

	// Fetch first/last name and photo from BatchRetrieveMaskedUsers.
	if sub != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var buf []byte
		buf = protowire.AppendTag(buf, 1, protowire.BytesType)
		buf = protowire.AppendString(buf, "users/"+sub)

		resp, grpcStatus, _, err := s.doConsoleGRPCWeb(ctx,
			"alis.os.iam.v2.UsersService/BatchRetrieveMaskedUsers", buf)
		if err == nil && grpcStatus == 0 && len(resp) >= 5 {
			users := parseBatchUsersResponse(resp[5:])
			if len(users) > 0 {
				u := users[0]
				name := strings.TrimSpace(u.FirstName + " " + u.LastName)
				profile.Name = name
				profile.Picture = u.PhotoURL
			}
		}
	}

	return profile, nil
}

// GetMyUserID returns the caller's own user resource name (e.g. "users/abc123"),
// used to match against block IAM policy members ("user:abc123") to determine
// the current viewer's own role on a block.
func (s *ProductService) GetMyUserID() (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}
	_, sub, err := readIDTokenClaims()
	if err != nil {
		return "", err
	}
	if sub == "" {
		return "", fmt.Errorf("no sub claim in token")
	}
	return "users/" + sub, nil
}

// Logout removes the stored console credentials, signing the user out.
func (s *ProductService) Logout() error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	path := filepath.Join(home, alisConsoleCredentialsPath)
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	s.mu.Lock()
	s.tokens = nil
	s.mu.Unlock()
	return nil
}
