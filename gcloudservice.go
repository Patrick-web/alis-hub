package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	"alis-hub-v3/internal/terminal"
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
	ptmx   terminal.PTY
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

		shellBin, shellArgs := platformShell()
		cmd := exec.Command(shellBin, shellArgs...)
		cmd.Dir = home

		ptmx, err := terminal.Start(cmd, 24, 220)
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
	return ptmx.Resize(uint16(rows), uint16(cols))
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

// gcloudBin finds the gcloud binary. Desktop apps don't inherit the shell's
// PATH, so we probe common install locations per platform.
func gcloudBin() (string, error) {
	if path, err := exec.LookPath("gcloud"); err == nil {
		return path, nil
	}
	// On Windows gcloud is a .cmd wrapper; LookPath may miss it if PATHEXT
	// is not set, so try explicitly.
	if runtime.GOOS == "windows" {
		if path, err := exec.LookPath("gcloud.cmd"); err == nil {
			return path, nil
		}
	}

	home, _ := os.UserHomeDir()
	var candidates []string

	if runtime.GOOS == "windows" {
		localAppData := os.Getenv("LOCALAPPDATA")
		programFiles := os.Getenv("ProgramFiles")
		programFilesX86 := os.Getenv("ProgramFiles(x86)")
		candidates = []string{
			filepath.Join(localAppData, "Google", "Cloud SDK", "google-cloud-sdk", "bin", "gcloud.cmd"),
			filepath.Join(programFiles, "Google", "Cloud SDK", "google-cloud-sdk", "bin", "gcloud.cmd"),
			filepath.Join(programFilesX86, "Google", "Cloud SDK", "google-cloud-sdk", "bin", "gcloud.cmd"),
			filepath.Join(home, "AppData", "Local", "Google", "Cloud SDK", "google-cloud-sdk", "bin", "gcloud.cmd"),
			filepath.Join(home, "google-cloud-sdk", "bin", "gcloud.cmd"),
		}
	} else {
		candidates = []string{
			filepath.Join(home, "google-cloud-sdk", "bin", "gcloud"),
			filepath.Join(home, "Downloads", "google-cloud-sdk", "bin", "gcloud"),
			"/usr/local/bin/gcloud",
			"/opt/homebrew/bin/gcloud",
			"/opt/homebrew/share/google-cloud-sdk/bin/gcloud",
			"/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/bin/gcloud",
			"/usr/local/google-cloud-sdk/bin/gcloud",
		}
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


func (g *GCloudService) ListBuckets(projectID string) ([]GCSBucket, error) {
	base := "https://storage.googleapis.com/storage/v1/b?project=" + url.QueryEscape(projectID) + "&maxResults=250"
	var all []GCSBucket
	pageToken := ""
	for {
		u := base
		if pageToken != "" {
			u += "&pageToken=" + url.QueryEscape(pageToken)
		}
		var result struct {
			Items         []GCSBucket `json:"items"`
			NextPageToken string      `json:"nextPageToken"`
		}
		if err := g.apiGet(u, &result); err != nil {
			return nil, err
		}
		all = append(all, result.Items...)
		if result.NextPageToken == "" {
			break
		}
		pageToken = result.NextPageToken
	}
	if all == nil {
		return []GCSBucket{}, nil
	}
	return all, nil
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

type GCSObjectMetadata struct {
	Name         string `json:"name"`
	Bucket       string `json:"bucket"`
	Size         string `json:"size"`
	ContentType  string `json:"contentType"`
	MD5Hash      string `json:"md5Hash"`
	CRC32C       string `json:"crc32c"`
	TimeCreated  string `json:"timeCreated"`
	Updated      string `json:"updated"`
	StorageClass string `json:"storageClass"`
	Etag         string `json:"etag"`
	Generation   string `json:"generation"`
}

func (g *GCloudService) GetObjectMetadata(bucket, object string) (*GCSObjectMetadata, error) {
	u := "https://storage.googleapis.com/storage/v1/b/" + url.PathEscape(bucket) + "/o/" + url.PathEscape(object)
	var result GCSObjectMetadata
	if err := g.apiGet(u, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// GetObjectContent downloads a GCS object and returns its content as a base64 string.
// Returns an error if the object exceeds 20 MB.
func (g *GCloudService) GetObjectContent(bucket, object string) (string, error) {
	token, err := g.accessToken()
	if err != nil {
		return "", err
	}
	u := "https://storage.googleapis.com/download/storage/v1/b/" + url.PathEscape(bucket) + "/o/" + url.PathEscape(object) + "?alt=media"
	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}
	const maxSize = 20 * 1024 * 1024
	lr := io.LimitReader(resp.Body, maxSize+1)
	data, err := io.ReadAll(lr)
	if err != nil {
		return "", err
	}
	if len(data) > maxSize {
		return "", fmt.Errorf("file exceeds 20 MB preview limit")
	}
	return base64.StdEncoding.EncodeToString(data), nil
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

// ── Cloud Run ─────────────────────────────────────────────────────────────────

type CloudRunService struct {
	// Full resource name: projects/P/locations/L/services/S
	Name        string `json:"name"`
	ServiceName string `json:"serviceName"` // short name extracted from Name
	Region      string `json:"region"`      // location extracted from Name
}

type cloudRunServiceListResp struct {
	Services      []struct{ Name string `json:"name"` } `json:"services"`
	NextPageToken string                                 `json:"nextPageToken"`
}

// ListCloudRunServices returns all Cloud Run services in the project across all regions.
func (g *GCloudService) ListCloudRunServices(projectID string) ([]CloudRunService, error) {
	u := fmt.Sprintf("https://run.googleapis.com/v2/projects/%s/locations/-/services?pageSize=200",
		url.PathEscape(projectID))
	var raw cloudRunServiceListResp
	if err := g.apiGet(u, &raw); err != nil {
		return nil, err
	}
	out := make([]CloudRunService, 0, len(raw.Services))
	for _, s := range raw.Services {
		// name = "projects/P/locations/L/services/S"
		parts := strings.Split(s.Name, "/")
		svc := CloudRunService{Name: s.Name}
		if len(parts) >= 6 {
			svc.Region = parts[3]
			svc.ServiceName = parts[5]
		}
		out = append(out, svc)
	}
	return out, nil
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

// ── Cloud Spanner ─────────────────────────────────────────────────────────────

type SpannerInstance struct {
	Name            string `json:"name"`
	DisplayName     string `json:"displayName"`
	Config          string `json:"config"`
	State           string `json:"state"`
	NodeCount       int    `json:"nodeCount"`
	ProcessingUnits int    `json:"processingUnits"`
}

type spannerInstanceListResp struct {
	Instances []SpannerInstance `json:"instances"`
}

type SpannerDatabase struct {
	Name                   string `json:"name"`
	State                  string `json:"state"`
	CreateTime             string `json:"createTime"`
	VersionRetentionPeriod string `json:"versionRetentionPeriod"`
}

type spannerDatabaseListResp struct {
	Databases []SpannerDatabase `json:"databases"`
}

type SpannerTable struct {
	Name string `json:"name"`
}

type spannerDDLResp struct {
	Statements []string `json:"statements"`
}

type SpannerQueryResult struct {
	Columns []string   `json:"columns"`
	Rows    [][]string `json:"rows"`
}

type spannerField struct {
	Name string `json:"name"`
}

type spannerRowType struct {
	Fields []spannerField `json:"fields"`
}

type spannerMetadata struct {
	RowType spannerRowType `json:"rowType"`
}


func (g *GCloudService) ListSpannerInstances(projectID string) ([]SpannerInstance, error) {
	u := fmt.Sprintf("https://spanner.googleapis.com/v1/projects/%s/instances", url.PathEscape(projectID))
	var result spannerInstanceListResp
	if err := g.apiGet(u, &result); err != nil {
		return nil, err
	}
	if result.Instances == nil {
		return []SpannerInstance{}, nil
	}
	return result.Instances, nil
}

// ListSpannerDatabases lists databases in a Spanner instance.
// instanceResourceName is the full name e.g. "projects/{project}/instances/{instance}".
func (g *GCloudService) ListSpannerDatabases(instanceResourceName string) ([]SpannerDatabase, error) {
	u := fmt.Sprintf("https://spanner.googleapis.com/v1/%s/databases", instanceResourceName)
	var result spannerDatabaseListResp
	if err := g.apiGet(u, &result); err != nil {
		return nil, err
	}
	if result.Databases == nil {
		return []SpannerDatabase{}, nil
	}
	return result.Databases, nil
}

// ListSpannerTables lists tables in a Spanner database by parsing its DDL.
// databaseResourceName is the full name e.g. "projects/{p}/instances/{i}/databases/{d}".
func (g *GCloudService) ListSpannerTables(databaseResourceName string) ([]SpannerTable, error) {
	u := fmt.Sprintf("https://spanner.googleapis.com/v1/%s/ddl", databaseResourceName)
	var result spannerDDLResp
	if err := g.apiGet(u, &result); err != nil {
		return nil, err
	}
	re := regexp.MustCompile(`(?i)CREATE TABLE\s+` + "`?" + `(\w+)` + "`?")
	seen := map[string]bool{}
	var tables []SpannerTable
	for _, stmt := range result.Statements {
		if m := re.FindStringSubmatch(stmt); len(m) > 1 {
			name := m[1]
			if !seen[name] {
				seen[name] = true
				tables = append(tables, SpannerTable{Name: name})
			}
		}
	}
	if tables == nil {
		return []SpannerTable{}, nil
	}
	return tables, nil
}

// ── Cloud Spanner Backups ──────────────────────────────────────────────────────

type SpannerBackup struct {
	Name            string   `json:"name"`
	Database        string   `json:"database"`
	State           string   `json:"state"`
	CreateTime      string   `json:"createTime"`
	ExpireTime      string   `json:"expireTime"`
	VersionTime     string   `json:"versionTime"`
	MaxExpireTime   string   `json:"maxExpireTime"`
	SizeBytes       string   `json:"sizeBytes"` // API returns as a JSON string
	DatabaseDialect string   `json:"databaseDialect"`
	BackupSchedules []string `json:"backupSchedules"`
}

type spannerBackupListResp struct {
	Backups []SpannerBackup `json:"backups"`
}

// ListSpannerBackups lists backups for a Spanner instance.
// instanceResourceName is the full resource name e.g. "projects/{p}/instances/{i}".
func (g *GCloudService) ListSpannerBackups(instanceResourceName string) ([]SpannerBackup, error) {
	u := fmt.Sprintf("https://spanner.googleapis.com/v1/%s/backups", instanceResourceName)
	var result spannerBackupListResp
	if err := g.apiGet(u, &result); err != nil {
		return nil, err
	}
	if result.Backups == nil {
		return []SpannerBackup{}, nil
	}
	return result.Backups, nil
}

// ExecuteSpannerQuery runs a read-only SQL query against a Spanner database.
// databaseResourceName is the full name e.g. "projects/{p}/instances/{i}/databases/{d}".
// Uses executeStreamingSql so result sets larger than 10 MB are handled correctly.
func (g *GCloudService) ExecuteSpannerQuery(databaseResourceName, sql string) (*SpannerQueryResult, error) {
	sessionURL := fmt.Sprintf("https://spanner.googleapis.com/v1/%s/sessions", databaseResourceName)
	var sessionResp struct {
		Name string `json:"name"`
	}
	if err := g.apiPost(sessionURL, map[string]interface{}{}, &sessionResp); err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}
	sessionName := sessionResp.Name
	defer g.deleteSpannerSession(sessionName)

	token, err := g.accessToken()
	if err != nil {
		return nil, err
	}
	payload := map[string]interface{}{
		"sql": sql,
		"transaction": map[string]interface{}{
			"singleUse": map[string]interface{}{
				"readOnly": map[string]interface{}{},
			},
		},
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST",
		fmt.Sprintf("https://spanner.googleapis.com/v1/%s:executeStreamingSql", sessionName),
		bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(b))
	}

	// The streaming endpoint returns a JSON array of PartialResultSet objects.
	// Values are flat row-major across all chunks. chunkedValue=true means the
	// last value in this chunk is a partial string continued in the next chunk.
	type partialResultSet struct {
		Metadata     spannerMetadata `json:"metadata"`
		Values       []interface{}   `json:"values"`
		ChunkedValue bool            `json:"chunkedValue"`
	}

	dec := json.NewDecoder(resp.Body)
	// Consume the opening '[' of the array.
	if t, err := dec.Token(); err != nil {
		return nil, fmt.Errorf("read stream: %w", err)
	} else if d, ok := t.(json.Delim); !ok || d != '[' {
		return nil, fmt.Errorf("unexpected stream format")
	}

	var columns []string
	var flat []interface{}
	var pendingChunk string // tail of a chunked string value
	hasPending := false

	for dec.More() {
		var chunk partialResultSet
		if err := dec.Decode(&chunk); err != nil {
			return nil, fmt.Errorf("decode chunk: %w", err)
		}
		if len(columns) == 0 && len(chunk.Metadata.RowType.Fields) > 0 {
			columns = make([]string, len(chunk.Metadata.RowType.Fields))
			for i, f := range chunk.Metadata.RowType.Fields {
				columns[i] = f.Name
			}
		}
		for i, v := range chunk.Values {
			isLast := i == len(chunk.Values)-1
			str := ""
			if v == nil {
				str = "NULL"
			} else {
				str = fmt.Sprintf("%v", v)
			}
			if hasPending {
				str = pendingChunk + str
				hasPending = false
				pendingChunk = ""
			}
			if isLast && chunk.ChunkedValue {
				pendingChunk = str
				hasPending = true
			} else {
				flat = append(flat, str)
			}
		}
	}
	// Flush any remaining pending chunk (shouldn't happen in a well-formed response).
	if hasPending {
		flat = append(flat, pendingChunk)
	}

	if len(columns) == 0 {
		return &SpannerQueryResult{Columns: []string{}, Rows: [][]string{}}, nil
	}
	numCols := len(columns)
	numRows := len(flat) / numCols
	rows := make([][]string, numRows)
	for i := range rows {
		cells := make([]string, numCols)
		for j := 0; j < numCols; j++ {
			if s, ok := flat[i*numCols+j].(string); ok {
				cells[j] = s
			}
		}
		rows[i] = cells
	}
	return &SpannerQueryResult{Columns: columns, Rows: rows}, nil
}

// SpannerDMLResult holds the outcome of a partitioned DML statement.
type SpannerDMLResult struct {
	RowsAffected int64 `json:"rowsAffected"`
}

// ExecuteSpannerDML runs a DELETE or UPDATE statement using a partitioned DML
// transaction, which does not require an explicit commit.
func (g *GCloudService) ExecuteSpannerDML(databaseResourceName, sql string) (*SpannerDMLResult, error) {
	sessionURL := fmt.Sprintf("https://spanner.googleapis.com/v1/%s/sessions", databaseResourceName)
	var sessionResp struct {
		Name string `json:"name"`
	}
	if err := g.apiPost(sessionURL, map[string]interface{}{}, &sessionResp); err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}
	sessionName := sessionResp.Name
	defer g.deleteSpannerSession(sessionName)

	// Partitioned DML must use a transaction created via BeginTransaction; inline
	// "begin" selectors are not supported for this transaction type.
	beginURL := fmt.Sprintf("https://spanner.googleapis.com/v1/%s:beginTransaction", sessionName)
	var txnResp struct {
		ID string `json:"id"`
	}
	if err := g.apiPost(beginURL, map[string]interface{}{
		"options": map[string]interface{}{
			"partitionedDml": map[string]interface{}{},
		},
	}, &txnResp); err != nil {
		return nil, fmt.Errorf("begin transaction: %w", err)
	}

	execURL := fmt.Sprintf("https://spanner.googleapis.com/v1/%s:executeSql", sessionName)
	payload := map[string]interface{}{
		"sql": sql,
		"transaction": map[string]interface{}{
			"id": txnResp.ID,
		},
	}
	var resp struct {
		Stats struct {
			RowCountExact string `json:"rowCountExact"`
		} `json:"stats"`
	}
	if err := g.apiPost(execURL, payload, &resp); err != nil {
		return nil, err
	}
	var rowsAffected int64
	if resp.Stats.RowCountExact != "" {
		fmt.Sscanf(resp.Stats.RowCountExact, "%d", &rowsAffected)
	}
	return &SpannerDMLResult{RowsAffected: rowsAffected}, nil
}

// SpannerRWTxnResult holds the open session and transaction details for a
// read-write transaction that has been started but not yet committed.
type SpannerRWTxnResult struct {
	SessionName   string `json:"sessionName"`
	TransactionID string `json:"transactionId"`
	RowsAffected  int64  `json:"rowsAffected"`
}

// BeginSpannerReadWriteTxn starts a read-write transaction, executes the given
// DML statement, and returns the open session/transaction so the caller can
// later commit or rollback. The session is intentionally not deleted here.
func (g *GCloudService) BeginSpannerReadWriteTxn(databaseResourceName, sql string) (*SpannerRWTxnResult, error) {
	sessionURL := fmt.Sprintf("https://spanner.googleapis.com/v1/%s/sessions", databaseResourceName)
	var sessionResp struct {
		Name string `json:"name"`
	}
	if err := g.apiPost(sessionURL, map[string]interface{}{}, &sessionResp); err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}
	sessionName := sessionResp.Name

	beginURL := fmt.Sprintf("https://spanner.googleapis.com/v1/%s:beginTransaction", sessionName)
	var txnResp struct {
		ID string `json:"id"`
	}
	if err := g.apiPost(beginURL, map[string]interface{}{
		"options": map[string]interface{}{
			"readWrite": map[string]interface{}{},
		},
	}, &txnResp); err != nil {
		g.deleteSpannerSession(sessionName)
		return nil, fmt.Errorf("begin transaction: %w", err)
	}

	execURL := fmt.Sprintf("https://spanner.googleapis.com/v1/%s:executeSql", sessionName)
	var execResp struct {
		Stats struct {
			RowCountExact string `json:"rowCountExact"`
		} `json:"stats"`
	}
	if err := g.apiPost(execURL, map[string]interface{}{
		"sql":         sql,
		"transaction": map[string]interface{}{"id": txnResp.ID},
	}, &execResp); err != nil {
		g.deleteSpannerSession(sessionName)
		return nil, err
	}

	var rowsAffected int64
	if execResp.Stats.RowCountExact != "" {
		fmt.Sscanf(execResp.Stats.RowCountExact, "%d", &rowsAffected)
	}
	return &SpannerRWTxnResult{
		SessionName:   sessionName,
		TransactionID: txnResp.ID,
		RowsAffected:  rowsAffected,
	}, nil
}

// CommitSpannerTransaction commits an open read-write transaction and cleans
// up the session.
func (g *GCloudService) CommitSpannerTransaction(sessionName, transactionID string) error {
	defer g.deleteSpannerSession(sessionName)
	commitURL := fmt.Sprintf("https://spanner.googleapis.com/v1/%s:commit", sessionName)
	var out struct{}
	return g.apiPost(commitURL, map[string]interface{}{
		"transactionId": transactionID,
	}, &out)
}

// RollbackSpannerTransaction rolls back an open read-write transaction and
// cleans up the session.
func (g *GCloudService) RollbackSpannerTransaction(sessionName, transactionID string) error {
	defer g.deleteSpannerSession(sessionName)
	rollbackURL := fmt.Sprintf("https://spanner.googleapis.com/v1/%s:rollback", sessionName)
	var out struct{}
	return g.apiPost(rollbackURL, map[string]interface{}{
		"transactionId": transactionID,
	}, &out)
}

func (g *GCloudService) deleteSpannerSession(sessionName string) {
	if sessionName == "" {
		return
	}
	token, err := g.accessToken()
	if err != nil {
		return
	}
	req, err := http.NewRequest("DELETE", "https://spanner.googleapis.com/v1/"+sessionName, nil)
	if err != nil {
		return
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err == nil {
		resp.Body.Close()
	}
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
	case "storage-object":
		// resource is "bucket/objectName"
		consoleURL = fmt.Sprintf("https://console.cloud.google.com/storage/browser/_details/%s;tab=live_object?project=%s",
			resource, url.QueryEscape(projectID))
	case "logs":
		consoleURL = "https://console.cloud.google.com/logs/query?project=" + url.QueryEscape(projectID)
	case "artifactregistry":
		consoleURL = "https://console.cloud.google.com/artifacts?project=" + url.QueryEscape(projectID)
	case "secrets":
		consoleURL = "https://console.cloud.google.com/security/secret-manager?project=" + url.QueryEscape(projectID)
	case "spanner":
		consoleURL = "https://console.cloud.google.com/spanner/instances?project=" + url.QueryEscape(projectID)
	case "spanner-backups":
		consoleURL = fmt.Sprintf(
			"https://console.cloud.google.com/spanner/instances/%s/backups?project=%s",
			url.PathEscape(resource), url.QueryEscape(projectID))
	default:
		consoleURL = "https://console.cloud.google.com/?project=" + url.QueryEscape(projectID)
	}
	openBrowserURL(consoleURL)
}
