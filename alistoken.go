package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const alisCredentialsPath = ".alis/credentials.json"
const alisIdentityTokenURL = "https://identity.alisx.com/token"
const alisTokenRefreshGrace = 5 * time.Minute

type alisCredentials struct {
	AccessToken  string `json:"access_token"`
	IDToken      string `json:"id_token,omitempty"`
	RefreshToken string `json:"refresh_token"`
	Expiry       time.Time `json:"expiry,omitempty"`
	TokenType    string `json:"token_type,omitempty"`
}

type AlisTokenSource struct {
	path string
	mu   sync.Mutex
}

func NewAlisTokenSource() (*AlisTokenSource, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("home dir: %w", err)
	}
	p := filepath.Join(home, alisCredentialsPath)
	if _, err := os.Stat(p); err != nil {
		return nil, fmt.Errorf("alis credentials not found at %s: %w", p, err)
	}
	return &AlisTokenSource{path: p}, nil
}

func (s *AlisTokenSource) Token() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	creds, err := s.read()
	if err != nil {
		return "", err
	}

	if creds.AccessToken != "" && !creds.Expiry.IsZero() && time.Until(creds.Expiry) > alisTokenRefreshGrace {
		return creds.AccessToken, nil
	}

	if creds.RefreshToken == "" {
		if creds.AccessToken != "" {
			return creds.AccessToken, nil
		}
		return "", fmt.Errorf("no refresh token available and access token is empty or expired")
	}

	newCreds, err := s.refresh(creds.RefreshToken)
	if err != nil {
		return "", fmt.Errorf("token refresh failed: %w", err)
	}

	if err := s.write(newCreds); err != nil {
		return "", fmt.Errorf("writing refreshed credentials: %w", err)
	}

	return newCreds.AccessToken, nil
}

func (s *AlisTokenSource) read() (*alisCredentials, error) {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return nil, err
	}
	var c alisCredentials
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("parsing %s: %w", s.path, err)
	}
	return &c, nil
}

func (s *AlisTokenSource) write(c *alisCredentials) error {
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0600)
}

func (s *AlisTokenSource) refresh(refreshToken string) (*alisCredentials, error) {
	form := url.Values{
		"refresh_token": {refreshToken},
		"grant_type":    {"refresh_token"},
	}

	req, err := http.NewRequest("POST", alisIdentityTokenURL, strings.NewReader(form.Encode()))
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

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("identity token refresh returned %d", resp.StatusCode)
	}

	var result struct {
		AccessToken  string `json:"access_token"`
		IDToken      string `json:"id_token,omitempty"`
		ExpiresIn   int    `json:"expires_in"`
		TokenType    string `json:"token_type"`
		RefreshToken string `json:"refresh_token,omitempty"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	creds := &alisCredentials{
		AccessToken:  result.AccessToken,
		IDToken:      result.IDToken,
		RefreshToken: refreshToken,
		TokenType:    result.TokenType,
	}
	if result.ExpiresIn > 0 {
		creds.Expiry = time.Now().Add(time.Duration(result.ExpiresIn) * time.Second)
	}
	if result.RefreshToken != "" {
		creds.RefreshToken = result.RefreshToken
	}

	return creds, nil
}
