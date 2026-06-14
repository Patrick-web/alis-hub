package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/creack/pty"
)

// GCloudService exposes GCP REST API tools to the frontend.
// Auth is via `gcloud auth print-access-token` — cached for 45 minutes.
type GCloudService struct {
	mu             sync.Mutex
	cachedToken    string
	tokenExpiry    time.Time
	setupProcesses sync.Map // map[runID]*setupProcess
}

// ── Prerequisite check ────────────────────────────────────────────────────────

type GCloudStatus struct {
	GCloudInstalled bool   `json:"gcloudInstalled"`
	GCloudPath      string `json:"gcloudPath,omitempty"`
	Authenticated   bool   `json:"authenticated"`
	AuthAccount     string `json:"authAccount,omitempty"`
}

// CheckGCloudStatus reports whether gcloud is installed and can produce a valid
// access token. It uses print-access-token (not just auth list) so it matches
// exactly what the API calls require.
func (g *GCloudService) CheckGCloudStatus() GCloudStatus {
	bin, err := gcloudBin()
	if err != nil {
		return GCloudStatus{}
	}

	// Derive the active account name for display (best-effort).
	accountOut, _ := exec.Command(bin, "auth", "list",
		"--format=value(account)", "--filter=status:ACTIVE").Output()
	account := strings.TrimSpace(string(accountOut))

	// Actually try to get a token — this is the same test the API calls use.
	tokenOut, tokenErr := exec.Command(bin, "auth", "print-access-token").Output()
	token := strings.TrimSpace(string(tokenOut))
	authenticated := tokenErr == nil && token != ""

	// Warm the cache so the first API call doesn't pay the cost again.
	if authenticated {
		g.mu.Lock()
		g.cachedToken = token
		g.tokenExpiry = time.Now().Add(45 * time.Minute)
		g.mu.Unlock()
	}

	return GCloudStatus{
		GCloudInstalled: true,
		GCloudPath:      bin,
		Authenticated:   authenticated,
		AuthAccount:     account,
	}
}

// ── Interactive setup terminal (PTY) ─────────────────────────────────────────

type setupProcess struct {
	mu     sync.Mutex
	buf    bytes.Buffer
	done   bool
	errMsg string
	cancel context.CancelFunc
	ptmx   *os.File
}

type SetupChunk struct {
	Data   string `json:"data"`
	Done   bool   `json:"done"`
	ErrMsg string `json:"errMsg,omitempty"`
}

// StartSetupSession launches an interactive login shell. If command is non-empty
// it is sent to the shell after a short delay, exactly like the package terminal.
func (g *GCloudService) StartSetupSession(runID, command string) error {
	if _, loaded := g.setupProcesses.LoadOrStore(runID, nil); loaded {
		return fmt.Errorf("setup session %s already exists", runID)
	}

	home, _ := os.UserHomeDir()
	ctx, cancel := context.WithCancel(context.Background())
	p := &setupProcess{cancel: cancel}
	g.setupProcesses.Store(runID, p)

	go func() {
		defer cancel()

		shell := os.Getenv("SHELL")
		if shell == "" {
			shell = "/bin/bash"
		}
		cmd := exec.Command(shell, "-l")
		cmd.Dir = home

		ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: 24, Cols: 220})
		if err != nil {
			p.mu.Lock()
			p.done = true
			p.errMsg = err.Error()
			p.mu.Unlock()
			return
		}

		p.mu.Lock()
		p.ptmx = ptmx
		p.mu.Unlock()

		go func() {
			<-ctx.Done()
			ptmx.Close()
			if cmd.Process != nil {
				cmd.Process.Kill()
			}
		}()

		if command != "" {
			go func() {
				time.Sleep(300 * time.Millisecond)
				ptmx.Write([]byte(command + "\n"))
			}()
		}

		exitErrCh := make(chan error, 1)
		go func() {
			exitErrCh <- cmd.Wait()
			ptmx.Close()
		}()

		buf := make([]byte, 4096)
		for {
			n, readErr := ptmx.Read(buf)
			if n > 0 {
				p.mu.Lock()
				p.buf.Write(buf[:n])
				p.mu.Unlock()
			}
			if readErr != nil {
				break
			}
		}

		exitErr := <-exitErrCh
		p.mu.Lock()
		p.ptmx = nil
		if exitErr != nil && ctx.Err() == nil {
			fmt.Fprintf(&p.buf, "\r\n\x1b[31m[session ended: %v]\x1b[0m\r\n", exitErr)
			p.errMsg = exitErr.Error()
		} else {
			p.buf.WriteString("\r\n\x1b[2m[session ended]\x1b[0m\r\n")
		}
		p.done = true
		p.mu.Unlock()
	}()

	return nil
}

// WriteSetupInput forwards keystrokes to the PTY.
func (g *GCloudService) WriteSetupInput(runID, data string) error {
	val, ok := g.setupProcesses.Load(runID)
	if !ok {
		return nil
	}
	p, _ := val.(*setupProcess)
	if p == nil {
		return nil
	}
	p.mu.Lock()
	ptmx := p.ptmx
	p.mu.Unlock()
	if ptmx == nil {
		return nil
	}
	_, err := ptmx.Write([]byte(data))
	return err
}

// ResizeSetupTerminal updates the PTY window size.
func (g *GCloudService) ResizeSetupTerminal(runID string, cols, rows int) error {
	val, ok := g.setupProcesses.Load(runID)
	if !ok {
		return nil
	}
	p, _ := val.(*setupProcess)
	if p == nil {
		return nil
	}
	p.mu.Lock()
	ptmx := p.ptmx
	p.mu.Unlock()
	if ptmx == nil {
		return nil
	}
	return pty.Setsize(ptmx, &pty.Winsize{
		Rows: uint16(rows),
		Cols: uint16(cols),
	})
}

// PollSetupOutput returns new terminal output since offset.
func (g *GCloudService) PollSetupOutput(runID string, offset int) (*SetupChunk, error) {
	val, ok := g.setupProcesses.Load(runID)
	if !ok {
		return &SetupChunk{Done: true}, nil
	}
	p, _ := val.(*setupProcess)
	if p == nil {
		return &SetupChunk{Done: true}, nil
	}
	p.mu.Lock()
	data := string(p.buf.Bytes())
	done := p.done
	errMsg := p.errMsg
	p.mu.Unlock()

	chunk := data
	if offset < len(data) {
		chunk = data[offset:]
	} else {
		chunk = ""
	}
	return &SetupChunk{Data: chunk, Done: done, ErrMsg: errMsg}, nil
}

// StopSetupSession cancels and removes a setup session.
func (g *GCloudService) StopSetupSession(runID string) {
	val, ok := g.setupProcesses.LoadAndDelete(runID)
	if !ok {
		return
	}
	p, _ := val.(*setupProcess)
	if p != nil {
		p.cancel()
	}
}

func NewGCloudService() *GCloudService {
	return &GCloudService{}
}

// gcloudBin finds the gcloud binary, checking common macOS install locations
// since desktop apps don't inherit the shell's PATH.
func gcloudBin() (string, error) {
	// Direct lookup (works if PATH is set correctly)
	if path, err := exec.LookPath("gcloud"); err == nil {
		return path, nil
	}
	home, _ := os.UserHomeDir()
	candidates := []string{
		filepath.Join(home, "google-cloud-sdk", "bin", "gcloud"),
		filepath.Join(home, "Downloads", "google-cloud-sdk", "bin", "gcloud"),
		"/usr/local/bin/gcloud",
		"/opt/homebrew/bin/gcloud",
		"/opt/homebrew/share/google-cloud-sdk/bin/gcloud",
		"/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/bin/gcloud",
		"/usr/local/google-cloud-sdk/bin/gcloud",
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	return "", fmt.Errorf("gcloud CLI not found — install from https://cloud.google.com/sdk/docs/install")
}

func (g *GCloudService) accessToken() (string, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.cachedToken != "" && time.Now().Before(g.tokenExpiry) {
		return g.cachedToken, nil
	}
	bin, err := gcloudBin()
	if err != nil {
		return "", err
	}
	out, err := exec.Command(bin, "auth", "print-access-token").Output()
	if err != nil {
		return "", fmt.Errorf("gcloud not authenticated — run 'gcloud auth login' in your terminal")
	}
	token := strings.TrimSpace(string(out))
	if token == "" {
		return "", fmt.Errorf("gcloud returned an empty token — run 'gcloud auth login'")
	}
	g.cachedToken = token
	g.tokenExpiry = time.Now().Add(45 * time.Minute)
	return token, nil
}

func (g *GCloudService) apiGet(apiURL string, out any) error {
	token, err := g.accessToken()
	if err != nil {
		return err
	}
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}
	return json.Unmarshal(body, out)
}

func (g *GCloudService) apiPost(apiURL string, payload, out any) error {
	token, err := g.accessToken()
	if err != nil {
		return err
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBody))
	}
	return json.Unmarshal(respBody, out)
}

// ── Cloud Storage ─────────────────────────────────────────────────────────────

type GCSBucket struct {
	Name         string `json:"name"`
	Location     string `json:"location"`
	StorageClass string `json:"storageClass"`
	TimeCreated  string `json:"timeCreated"`
}

type gcsListBucketsResp struct {
	Items []GCSBucket `json:"items"`
}

func (g *GCloudService) ListBuckets(projectID string) ([]GCSBucket, error) {
	u := "https://storage.googleapis.com/storage/v1/b?project=" + url.QueryEscape(projectID) + "&maxResults=100"
	var result gcsListBucketsResp
	if err := g.apiGet(u, &result); err != nil {
		return nil, err
	}
	if result.Items == nil {
		return []GCSBucket{}, nil
	}
	return result.Items, nil
}

type GCSObject struct {
	Name        string `json:"name"`
	Size        string `json:"size"`
	ContentType string `json:"contentType"`
	Updated     string `json:"updated"`
}

type GCSObjectList struct {
	Prefixes      []string    `json:"prefixes"`
	Items         []GCSObject `json:"items"`
	NextPageToken string      `json:"nextPageToken"`
}

func (g *GCloudService) ListObjects(bucket, prefix, pageToken string) (GCSObjectList, error) {
	u := "https://storage.googleapis.com/storage/v1/b/" + url.PathEscape(bucket) + "/o?delimiter=/&maxResults=200"
	if prefix != "" {
		u += "&prefix=" + url.QueryEscape(prefix)
	}
	if pageToken != "" {
		u += "&pageToken=" + url.QueryEscape(pageToken)
	}
	var result GCSObjectList
	if err := g.apiGet(u, &result); err != nil {
		return GCSObjectList{}, err
	}
	if result.Items == nil {
		result.Items = []GCSObject{}
	}
	if result.Prefixes == nil {
		result.Prefixes = []string{}
	}
	return result, nil
}

// ── Cloud Logging ─────────────────────────────────────────────────────────────

type LogResource struct {
	Type   string            `json:"type"`
	Labels map[string]string `json:"labels"`
}

type LogEntry struct {
	LogName     string            `json:"logName"`
	InsertID    string            `json:"insertId"`
	Timestamp   string            `json:"timestamp"`
	Severity    string            `json:"severity"`
	TextPayload string            `json:"textPayload,omitempty"`
	Resource    *LogResource      `json:"resource,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	JsonPayload map[string]any    `json:"jsonPayload,omitempty"`
}

type LogPage struct {
	Entries       []LogEntry `json:"entries"`
	NextPageToken string     `json:"nextPageToken"`
}

func (g *GCloudService) ListLogEntries(projectID, filter, pageToken string) (LogPage, error) {
	payload := map[string]any{
		"resourceNames": []string{"projects/" + projectID},
		"pageSize":      100,
		"orderBy":       "timestamp desc",
	}
	if filter != "" {
		payload["filter"] = filter
	}
	if pageToken != "" {
		payload["pageToken"] = pageToken
	}
	var result LogPage
	if err := g.apiPost("https://logging.googleapis.com/v2/entries:list", payload, &result); err != nil {
		return LogPage{}, err
	}
	if result.Entries == nil {
		result.Entries = []LogEntry{}
	}
	return result, nil
}

// ── Artifact Registry ─────────────────────────────────────────────────────────

type ARRepository struct {
	Name        string `json:"name"`
	Format      string `json:"format"`
	Description string `json:"description"`
	CreateTime  string `json:"createTime"`
}

type arRepositoryListResp struct {
	Repositories  []ARRepository `json:"repositories"`
	NextPageToken string         `json:"nextPageToken"`
}

func (g *GCloudService) ListRepositories(projectID, region string) ([]ARRepository, error) {
	u := fmt.Sprintf("https://artifactregistry.googleapis.com/v1/projects/%s/locations/%s/repositories?pageSize=50",
		url.PathEscape(projectID), url.PathEscape(region))
	var result arRepositoryListResp
	if err := g.apiGet(u, &result); err != nil {
		return nil, err
	}
	if result.Repositories == nil {
		return []ARRepository{}, nil
	}
	return result.Repositories, nil
}

type ARPackage struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	CreateTime  string `json:"createTime"`
	UpdateTime  string `json:"updateTime"`
}

type arPackageListResp struct {
	Packages      []ARPackage `json:"packages"`
	NextPageToken string      `json:"nextPageToken"`
}

func (g *GCloudService) ListPackages(projectID, region, repoName string) ([]ARPackage, error) {
	u := fmt.Sprintf("https://artifactregistry.googleapis.com/v1/projects/%s/locations/%s/repositories/%s/packages?pageSize=50",
		url.PathEscape(projectID), url.PathEscape(region), url.PathEscape(repoName))
	var result arPackageListResp
	if err := g.apiGet(u, &result); err != nil {
		return nil, err
	}
	if result.Packages == nil {
		return []ARPackage{}, nil
	}
	return result.Packages, nil
}

type ARVersion struct {
	Name       string `json:"name"`
	CreateTime string `json:"createTime"`
	UpdateTime string `json:"updateTime"`
}

type arVersionListResp struct {
	Versions      []ARVersion `json:"versions"`
	NextPageToken string      `json:"nextPageToken"`
}

// ListVersions lists versions for a package. packageResourceName is the full resource name
// from ARPackage.Name (e.g. "projects/.../packages/github.com%2Forg%2Fpkg").
func (g *GCloudService) ListVersions(packageResourceName string) ([]ARVersion, error) {
	u := "https://artifactregistry.googleapis.com/v1/" + packageResourceName + "/versions?pageSize=20&orderBy=createTime+desc"
	var result arVersionListResp
	if err := g.apiGet(u, &result); err != nil {
		return nil, err
	}
	if result.Versions == nil {
		return []ARVersion{}, nil
	}
	return result.Versions, nil
}

// ── Secret Manager ────────────────────────────────────────────────────────────

type SMSecret struct {
	Name       string            `json:"name"`
	CreateTime string            `json:"createTime"`
	Labels     map[string]string `json:"labels"`
}

type smSecretListResp struct {
	Secrets       []SMSecret `json:"secrets"`
	NextPageToken string     `json:"nextPageToken"`
}

func (g *GCloudService) ListSecrets(projectID string) ([]SMSecret, error) {
	u := fmt.Sprintf("https://secretmanager.googleapis.com/v1/projects/%s/secrets?pageSize=50",
		url.PathEscape(projectID))
	var result smSecretListResp
	if err := g.apiGet(u, &result); err != nil {
		return nil, err
	}
	if result.Secrets == nil {
		return []SMSecret{}, nil
	}
	return result.Secrets, nil
}

type SMSecretVersion struct {
	Name        string `json:"name"`
	CreateTime  string `json:"createTime"`
	State       string `json:"state"`
	DestroyTime string `json:"destroyTime,omitempty"`
}

type smVersionListResp struct {
	Versions      []SMSecretVersion `json:"versions"`
	NextPageToken string            `json:"nextPageToken"`
}

// ListSecretVersions lists versions for a secret. secretResourceName is the full resource name
// from SMSecret.Name (e.g. "projects/123/secrets/my-secret").
func (g *GCloudService) ListSecretVersions(secretResourceName string) ([]SMSecretVersion, error) {
	u := "https://secretmanager.googleapis.com/v1/" + secretResourceName + "/versions?pageSize=20"
	var result smVersionListResp
	if err := g.apiGet(u, &result); err != nil {
		return nil, err
	}
	if result.Versions == nil {
		return []SMSecretVersion{}, nil
	}
	return result.Versions, nil
}

// ── Console Links ─────────────────────────────────────────────────────────────

// OpenInConsole opens the Google Cloud Console page for the given section in the system browser.
// resource is optional (e.g. a bucket name for the storage section).
func (g *GCloudService) OpenInConsole(section, projectID, resource string) {
	var consoleURL string
	switch section {
	case "storage":
		if resource != "" {
			consoleURL = fmt.Sprintf("https://console.cloud.google.com/storage/browser/%s?project=%s",
				url.PathEscape(resource), url.QueryEscape(projectID))
		} else {
			consoleURL = "https://console.cloud.google.com/storage/browser?project=" + url.QueryEscape(projectID)
		}
	case "logs":
		consoleURL = "https://console.cloud.google.com/logs/query?project=" + url.QueryEscape(projectID)
	case "artifactregistry":
		consoleURL = "https://console.cloud.google.com/artifacts?project=" + url.QueryEscape(projectID)
	case "secrets":
		consoleURL = "https://console.cloud.google.com/security/secret-manager?project=" + url.QueryEscape(projectID)
	default:
		consoleURL = "https://console.cloud.google.com/?project=" + url.QueryEscape(projectID)
	}
	openBrowserURL(consoleURL)
}
