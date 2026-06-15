package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"google.golang.org/protobuf/encoding/protowire"
)

const alisProductHost = "console.alisx.com"

// ── Product summary (for picker) ─────────────────────────────────────────────

type ProductSummary struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	State       int32  `json:"state"`
}

// ── Landing zones ─────────────────────────────────────────────────────────────

type Organisation struct {
	Name          string      `json:"name"`
	DisplayName   string      `json:"displayName"`
	Description   string      `json:"description"`
	Logo          string      `json:"logo"`
	Account       string      `json:"account"`
	GoogleProject *GCPProject `json:"googleProject,omitempty"`
}

type LandingZonesData struct {
	Own    []Organisation `json:"own"`
	Shared []Organisation `json:"shared"`
}

// ── Sync repos ───────────────────────────────────────────────────────────────

type SyncReposResult struct {
	DefineDir    string `json:"defineDir"`
	BuildDir     string `json:"buildDir"`
	DefineAction string `json:"defineAction"`
	BuildAction  string `json:"buildAction"`
	Error        string `json:"error,omitempty"`
}

// ── Product overview ──────────────────────────────────────────────────────────

type ProductOverview struct {
	Name              string         `json:"name"`
	DisplayName       string         `json:"displayName"`
	State             int32          `json:"state"`
	GoogleProject     *GCPProject    `json:"googleProject,omitempty"`
	GitRepo           *GitRepoInfo   `json:"gitRepo,omitempty"`
	PackageRegistries *PkgRegistries `json:"packageRegistries,omitempty"`
	DockerRegistry    string         `json:"dockerRegistry,omitempty"`
}

type GCPProject struct {
	FolderID              string `json:"folderId"`
	ID                    string `json:"id"`
	Number                string `json:"number"`
	Region                string `json:"region"`
	BillingAccountID      string `json:"billingAccountId"`
	ManagedBillingAccount bool   `json:"managedBillingAccount"`
	CloudURI              string `json:"cloudUri"`
}

type GitRepoInfo struct {
	RemoteURI   string `json:"remoteUri"`
	CloudRunURI string `json:"cloudRunUri"`
	VMURI       string `json:"vmUri"`
	BucketURI   string `json:"bucketUri"`
}

type PkgRegistries struct {
	Go         string `json:"go"`
	JavaScript string `json:"javascript"`
	Python     string `json:"python"`
}

type EnvInfo struct {
	Name        string      `json:"name"`
	DisplayName string      `json:"displayName"`
	State       int32       `json:"state"`
	EnvType     int32       `json:"envType"`
	GCPProject  *GCPProject `json:"gcpProject,omitempty"`
}

type EnvVariable struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

// ── Codeblocks ────────────────────────────────────────────────────────────────

type Codeblock struct {
	Name          string `json:"name"`
	DisplayName   string `json:"displayName"`
	ReleaseLevel  int32  `json:"releaseLevel"`
	Publisher     string `json:"publisher"`
	LatestVersion string `json:"latestVersion"`
	Headline      string `json:"headline"`
	Description   string `json:"description"`
	BannerURL     string `json:"bannerUrl"`
	InstallCount  int32  `json:"installCount"`
}

type CodeblockVersion struct {
	Name         string            `json:"name"`
	VersionTag   string            `json:"versionTag"`
	ReleaseLevel int32             `json:"releaseLevel"`
	CreateTime   string            `json:"createTime"`
	UpdateTime   string            `json:"updateTime"`
	ReleaseNotes string            `json:"releaseNotes"`
	Files        []CodeblockFolder `json:"files"`
}

type CodeblockFolder struct {
	Name  string              `json:"name"`
	Files []CodeblockFileItem `json:"files"`
}

type CodeblockFileItem struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

type CodeblockInstance struct {
	Name         string `json:"name"`
	ShortID      string `json:"shortId"`
	Package      string `json:"package"`
	State        int32  `json:"state"`
	Block        string `json:"block"`
	BlockVersion string `json:"blockVersion"`
	CreateTime   string `json:"createTime"`
	UpdateTime   string `json:"updateTime"`
	Entitlement  string `json:"entitlement"`
}

type CodeblockMember struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	PhotoURL    string `json:"photoUrl"`
}

type ProductService struct {
	tokens *ConsoleTokenSource
	mu     sync.Mutex
	app    *application.App
	proxy  *forgeProxy
}

// forgeProxy holds the local reverse-proxy server for one Forgejo host.
type forgeProxy struct {
	server    *http.Server
	port      int
	forgeBase string
}

// forgeProxyHandler is the http.Handler for the local Forgejo reverse proxy.
// It injects a fresh Bearer token on every outbound request and strips headers
// that would prevent the WebView from rendering the response correctly.
type forgeProxyHandler struct {
	forgeBase string
	port      int
	tokens    *ConsoleTokenSource
	client    *http.Client
}

func (h *forgeProxyHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	target := h.forgeBase + r.RequestURI

	var body []byte
	if r.Body != nil {
		body, _ = io.ReadAll(r.Body)
	}
	outReq, err := http.NewRequestWithContext(r.Context(), r.Method, target, bytes.NewReader(body))
	if err != nil {
		http.Error(w, "proxy: bad request", http.StatusBadGateway)
		return
	}

	// Forward request headers, rewriting any self-referencing Referer/Origin.
	proxyBase := fmt.Sprintf("http://127.0.0.1:%d", h.port)
	for name, vals := range r.Header {
		switch name {
		case "Host", "Content-Length":
			// Let the http.Client set these correctly.
		case "Referer", "Origin":
			for _, v := range vals {
				outReq.Header.Add(name, strings.ReplaceAll(v, proxyBase, h.forgeBase))
			}
		default:
			outReq.Header[name] = vals
		}
	}

	// Inject the alis Bearer token so Forgejo authenticates without OAuth redirect.
	if token, tokErr := h.tokens.AccessToken(); tokErr == nil && token != "" {
		outReq.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := h.client.Do(outReq)
	if err != nil {
		http.Error(w, "proxy: upstream error", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Copy response headers with selective modifications.
	for name, vals := range resp.Header {
		switch name {
		case "X-Frame-Options", "Content-Security-Policy":
			// Strip: these would block the WebView from rendering.
		case "Set-Cookie":
			// Strip Secure flag so the browser accepts cookies over http://127.0.0.1.
			for _, v := range vals {
				v = strings.ReplaceAll(v, "; Secure", "")
				v = strings.ReplaceAll(v, ";Secure", "")
				w.Header().Add("Set-Cookie", v)
			}
		case "Location":
			// Rewrite redirect targets to stay within the proxy.
			for _, v := range vals {
				w.Header().Add("Location", strings.ReplaceAll(v, h.forgeBase, proxyBase))
			}
		default:
			w.Header()[name] = vals
		}
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body) //nolint:errcheck
}

func NewProductService() *ProductService {
	return &ProductService{}
}

func (s *ProductService) SetApp(app *application.App) {
	s.mu.Lock()
	s.app = app
	s.mu.Unlock()
}

// ensureForgeProxy starts (or reuses) a local HTTP proxy for forgeBase and
// returns the port it is listening on. The proxy injects a fresh Bearer token
// on every outbound request so Forgejo authenticates without an OAuth redirect.
func (s *ProductService) ensureForgeProxy(forgeBase string) (int, error) {
	if err := s.initTokens(); err != nil {
		return 0, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.proxy != nil {
		if s.proxy.forgeBase == forgeBase {
			return s.proxy.port, nil
		}
		s.proxy.server.Close()
		s.proxy = nil
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	port := ln.Addr().(*net.TCPAddr).Port
	h := &forgeProxyHandler{
		forgeBase: forgeBase,
		port:      port,
		tokens:    s.tokens,
		client: &http.Client{
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
	srv := &http.Server{Handler: h}
	go srv.Serve(ln) //nolint:errcheck
	s.proxy = &forgeProxy{server: srv, port: port, forgeBase: forgeBase}
	return port, nil
}

// OpenForgejoWindow opens a new WebView window pointed at the given Forgejo URL.
// It routes the request through a local proxy that injects auth headers.
func (s *ProductService) OpenForgejoWindow(repoURL string) {
	s.mu.Lock()
	app := s.app
	s.mu.Unlock()
	if app == nil {
		return
	}

	localURL := repoURL
	if u, err := url.Parse(repoURL); err == nil {
		forgeBase := u.Scheme + "://" + u.Host
		if port, proxyErr := s.ensureForgeProxy(forgeBase); proxyErr == nil {
			localURL = fmt.Sprintf("http://127.0.0.1:%d%s", port, u.Path)
			if u.RawQuery != "" {
				localURL += "?" + u.RawQuery
			}
		}
	}

	win := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "Repository",
		Width:  1280,
		Height: 900,
		URL:    localURL,
		Mac: application.MacWindow{
			Backdrop: application.MacBackdropNormal,
		},
	})
	win.Show()
	win.Focus()
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
	}
	return err
}

type UserProfile struct {
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

// GetUserProfile fetches name and photo for the logged-in user via
// BatchRetrieveMaskedUsers, using the sub from the stored token as the user ID.
func (s *ProductService) GetUserProfile() (*UserProfile, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	// Decode sub and email from the stored token (no verification needed).
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(filepath.Join(home, alisConsoleCredentialsPath))
	if err != nil {
		return nil, fmt.Errorf("not logged in")
	}
	var creds consoleCredentials
	if err := json.Unmarshal(data, &creds); err != nil {
		return nil, fmt.Errorf("bad credentials: %w", err)
	}
	tok := creds.IDToken
	if tok == "" {
		tok = creds.AccessToken
	}
	if tok == "" {
		return nil, fmt.Errorf("no token found")
	}
	parts := strings.Split(tok, ".")
	if len(parts) < 2 {
		return nil, fmt.Errorf("invalid token format")
	}
	decoded, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("decode token claims: %w", err)
	}
	var claims struct {
		Email string `json:"email"`
		Sub   string `json:"sub"`
	}
	if err := json.Unmarshal(decoded, &claims); err != nil {
		return nil, fmt.Errorf("parse claims: %w", err)
	}

	profile := &UserProfile{Email: claims.Email}

	// Fetch first/last name and photo from BatchRetrieveMaskedUsers.
	if claims.Sub != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var buf []byte
		buf = protowire.AppendTag(buf, 1, protowire.BytesType)
		buf = protowire.AppendString(buf, "users/"+claims.Sub)

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

func (s *ProductService) ListLandingZones() (*LandingZonesData, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	myAccounts := s.myAccountIDs()
	protoBytes := marshalListOrganisationsRequest([]string{"name", "display_name", "account", "description", "logo"})

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.OrganisationsService/ListOrganisations", protoBytes)
	if err != nil {
		return nil, fmt.Errorf("ListOrganisations: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListOrganisations: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListOrganisations: response too short (%d bytes)", len(body))
	}

	orgs, err := parseListOrganisationsResponse(body[5:])
	if err != nil {
		return nil, err
	}

	result := &LandingZonesData{Own: []Organisation{}, Shared: []Organisation{}}
	for _, org := range orgs {
		if myAccounts[org.Account] {
			result.Own = append(result.Own, org)
		} else {
			result.Shared = append(result.Shared, org)
		}
	}
	return result, nil
}

func (s *ProductService) ListProducts(org string) ([]ProductSummary, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	parent := fmt.Sprintf("organisations/%s", org)
	protoBytes := marshalListProductsRequest(parent, []string{"name", "display_name", "state"})

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.ProductsService/ListProducts", protoBytes)
	if err != nil {
		return nil, fmt.Errorf("ListProducts: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListProducts: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListProducts: response too short (%d bytes)", len(body))
	}
	return parseListProductsResponse(body[5:])
}

// myAccountIDs parses the JWT access_token to extract the user's account IDs,
// returning a set of "accounts/<id>" strings for O(1) lookup.
func (s *ProductService) myAccountIDs() map[string]bool {
	creds, err := s.tokens.freshCreds()
	if err != nil {
		return nil
	}
	parts := strings.Split(creds.AccessToken, ".")
	if len(parts) != 3 {
		return nil
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil
	}
	var claims struct {
		Accounts map[string]json.RawMessage `json:"accounts"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil
	}
	result := make(map[string]bool, len(claims.Accounts))
	for id := range claims.Accounts {
		result["accounts/"+id] = true
	}
	return result
}

func (s *ProductService) GetProductOverview(org, product string) (*ProductOverview, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	name := fmt.Sprintf("organisations/%s/products/%s", org, product)
	fields := []string{"name", "display_name", "state", "google_project", "git_repo", "internal_package_registries", "docker_registries"}
	protoBytes := marshalGetProductRequest(name, fields)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.ProductsService/GetProduct", protoBytes)
	if err != nil {
		return nil, fmt.Errorf("GetProduct: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("GetProduct: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("GetProduct: response too short (%d bytes)", len(body))
	}
	return parseProduct(body[5:])
}

func (s *ProductService) ListEnvironments(org, product string) ([]EnvInfo, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	parent := fmt.Sprintf("organisations/%s/products/%s", org, product)
	fields := []string{"name", "display_name", "google_project", "state", "type"}
	protoBytes := marshalListEnvironmentsRequest(parent, fields)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/ListEnvironments", protoBytes)
	if err != nil {
		return nil, fmt.Errorf("ListEnvironments: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListEnvironments: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListEnvironments: response too short (%d bytes)", len(body))
	}
	return parseListEnvironmentsResponse(body[5:])
}

func (s *ProductService) getOrganisationGitRepo(org string) (string, error) {
	name := fmt.Sprintf("organisations/%s", org)
	protoBytes := marshalGetOrganisationRequest(name, []string{"git_repo"})

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.OrganisationsService/GetOrganisation", protoBytes)
	if err != nil {
		return "", fmt.Errorf("GetOrganisation: %w", err)
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("GetOrganisation: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("GetOrganisation: response too short (%d bytes)", len(body))
	}
	return parseOrganisationGitRepo(body[5:])
}

// GetOrganisationProject returns the GCP project associated with an organisation.
func (s *ProductService) GetOrganisationProject(org string) (*GCPProject, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	name := fmt.Sprintf("organisations/%s", org)
	protoBytes := marshalGetOrganisationRequest(name, []string{"google_project"})

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.OrganisationsService/GetOrganisation", protoBytes)
	if err != nil {
		return nil, fmt.Errorf("GetOrganisation: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("GetOrganisation: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("GetOrganisation: response too short (%d bytes)", len(body))
	}
	org2, err := parseOrganisation(body[5:])
	if err != nil || org2 == nil {
		return nil, err
	}
	return org2.GoogleProject, nil
}

func (s *ProductService) SyncRepos(org, product string) (*SyncReposResult, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	overview, err := s.GetProductOverview(org, product)
	if err != nil {
		return &SyncReposResult{Error: fmt.Sprintf("get product: %s", err)}, nil
	}
	if overview.GitRepo == nil || overview.GitRepo.RemoteURI == "" {
		return &SyncReposResult{Error: "product has no git repo configured"}, nil
	}
	// The API returns the org base URL (e.g. https://host/org); the build repo
	// is named after the product and the define repo is always "proto".
	buildRepoURL := strings.TrimRight(overview.GitRepo.RemoteURI, "/") + "/" + product

	orgBaseURL, err := s.getOrganisationGitRepo(org)
	if err != nil {
		return &SyncReposResult{Error: fmt.Sprintf("get organisation: %s", err)}, nil
	}
	if orgBaseURL == "" {
		return &SyncReposResult{Error: "organisation has no git repo configured"}, nil
	}
	defineRepoURL := strings.TrimRight(orgBaseURL, "/") + "/proto"

	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("home dir: %w", err)
	}
	defineDir := filepath.Join(home, "alis.build", org, "define")
	buildDir := filepath.Join(home, "alis.build", org, "build", product)

	gitToken, err := s.tokens.AccessToken()
	if err != nil {
		return &SyncReposResult{Error: fmt.Sprintf("get git token: %s", err)}, nil
	}
	emit := func(text string) { s.emitSyncLog(text) }

	result := &SyncReposResult{DefineDir: defineDir, BuildDir: buildDir}

	result.DefineAction, err = syncOneRepo(defineDir, defineRepoURL, gitToken, emit)
	if err != nil {
		result.Error = fmt.Sprintf("define repo: %s", err)
		return result, nil
	}

	result.BuildAction, err = syncOneRepo(buildDir, buildRepoURL, gitToken, emit)
	if err != nil {
		result.Error = fmt.Sprintf("build repo: %s", err)
		return result, nil
	}

	return result, nil
}

// CheckProductCloneStatus returns true if both the define and build repos for
// the given product are already present on the local filesystem.
func (s *ProductService) CheckProductCloneStatus(org, product string) bool {
	home, err := os.UserHomeDir()
	if err != nil {
		return false
	}
	defineDir := filepath.Join(home, "alis.build", org, "define")
	buildDir := filepath.Join(home, "alis.build", org, "build", product)
	_, dErr := os.Stat(defineDir)
	_, bErr := os.Stat(buildDir)
	return !os.IsNotExist(dErr) && !os.IsNotExist(bErr)
}

// GetEnvironmentVariables fetches the variables for a single environment.
// envName is the full resource name, e.g. "organisations/voyage/products/vp/environments/1y2ozw66zv6p3".
func (s *ProductService) GetEnvironmentVariables(envName string) ([]EnvVariable, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, envName)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/GetEnvironment", buf)
	if err != nil {
		return nil, fmt.Errorf("GetEnvironmentVariables: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("GetEnvironmentVariables: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("GetEnvironmentVariables: response too short (%d bytes)", len(body))
	}
	return parseEnvVariablesFromGetEnvironment(body[5:])
}

// SetEnvironmentVariables replaces all variables on an environment by calling
// UpdateEnvironment with an update_mask of "envs". Variables are field 8
// (repeated Environment.Env sub-messages: field 1=name/label, field 2=value).
func (s *ProductService) SetEnvironmentVariables(envName string, vars []EnvVariable) error {
	if err := s.initTokens(); err != nil {
		return err
	}

	// Build environment sub-message with name + all variables
	var envBuf []byte
	envBuf = protowire.AppendTag(envBuf, 1, protowire.BytesType)
	envBuf = protowire.AppendString(envBuf, envName)
	for _, v := range vars {
		var varBuf []byte
		varBuf = protowire.AppendTag(varBuf, 1, protowire.BytesType)
		varBuf = protowire.AppendString(varBuf, v.Label)
		varBuf = protowire.AppendTag(varBuf, 2, protowire.BytesType)
		varBuf = protowire.AppendString(varBuf, v.Value)
		envBuf = protowire.AppendTag(envBuf, 8, protowire.BytesType)
		envBuf = protowire.AppendBytes(envBuf, varBuf)
	}

	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendBytes(buf, envBuf)
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendBytes(buf, marshalFieldMask([]string{"envs"}))

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/UpdateEnvironment", buf)
	if err != nil {
		return fmt.Errorf("SetEnvironmentVariables: %w", err)
	}
	if grpcStatus != 0 {
		return fmt.Errorf("SetEnvironmentVariables: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	return nil
}

// CreateEnvironment creates a new environment under the given org/product.
// envType: 1=DEV, 2=STAGING, 3=PROD. region must be a valid GCP region.
func (s *ProductService) CreateEnvironment(org, product, displayName, region string, envType int32) (*EnvInfo, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	parent := fmt.Sprintf("organisations/%s/products/%s", org, product)

	// Build google_project sub-message (Environment field 5): field 4=region
	var gcpBuf []byte
	gcpBuf = protowire.AppendTag(gcpBuf, 4, protowire.BytesType)
	gcpBuf = protowire.AppendString(gcpBuf, region)

	// Build environment sub-message: field 2=displayName, field 5=googleProject, field 7=type
	var envBuf []byte
	envBuf = protowire.AppendTag(envBuf, 2, protowire.BytesType)
	envBuf = protowire.AppendString(envBuf, displayName)
	envBuf = protowire.AppendTag(envBuf, 5, protowire.BytesType)
	envBuf = protowire.AppendBytes(envBuf, gcpBuf)
	if envType != 0 {
		envBuf = protowire.AppendTag(envBuf, 7, protowire.VarintType)
		envBuf = protowire.AppendVarint(envBuf, uint64(envType))
	}

	// CreateEnvironmentRequest: field 1=parent, field 2=environment
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, parent)
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendBytes(buf, envBuf)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/CreateEnvironment", buf)
	if err != nil {
		return nil, fmt.Errorf("CreateEnvironment: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("CreateEnvironment: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("CreateEnvironment: response too short (%d bytes)", len(body))
	}
	return parseEnvInfoFromEnvironment(body[5:])
}

// UpdateEnvironment updates the displayName of an existing environment.
// envName is the full resource name.
func (s *ProductService) UpdateEnvironment(envName, displayName string) (*EnvInfo, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	// Build environment sub-message: field 1=name, field 2=displayName
	var envBuf []byte
	envBuf = protowire.AppendTag(envBuf, 1, protowire.BytesType)
	envBuf = protowire.AppendString(envBuf, envName)
	envBuf = protowire.AppendTag(envBuf, 2, protowire.BytesType)
	envBuf = protowire.AppendString(envBuf, displayName)

	// UpdateEnvironmentRequest: field 1=environment, field 2=update_mask
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendBytes(buf, envBuf)
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendBytes(buf, marshalFieldMask([]string{"display_name"}))

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/UpdateEnvironment", buf)
	if err != nil {
		return nil, fmt.Errorf("UpdateEnvironment: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("UpdateEnvironment: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("UpdateEnvironment: response too short (%d bytes)", len(body))
	}
	return parseEnvInfoFromEnvironment(body[5:])
}

// DeleteEnvironment deletes the environment with the given full resource name.
func (s *ProductService) DeleteEnvironment(envName string) error {
	if err := s.initTokens(); err != nil {
		return err
	}

	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, envName)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/DeleteEnvironment", buf)
	if err != nil {
		return fmt.Errorf("DeleteEnvironment: %w", err)
	}
	if grpcStatus != 0 {
		return fmt.Errorf("DeleteEnvironment: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	return nil
}

// ListCodeblocks fetches all available codeblocks from alis.bl.blocks.v1.BlocksService.
func (s *ProductService) ListCodeblocks() ([]Codeblock, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	fields := []string{"name", "display_name", "release_level", "publisher", "releases", "overview_details"}
	fm := marshalFieldMask(fields)
	var buf []byte
	buf = protowire.AppendTag(buf, 3, protowire.BytesType)
	buf = protowire.AppendBytes(buf, fm)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/RetrieveBlockDetails", buf)
	if err != nil {
		return nil, fmt.Errorf("ListCodeblocks: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListCodeblocks: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListCodeblocks: response too short (%d bytes)", len(body))
	}
	return parseCodeblocksResponse(body[5:])
}

// GetCodeblock fetches a single block by its short ID (e.g. "skills").
func (s *ProductService) GetCodeblock(blockId string) (*Codeblock, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	buf := marshalGetProductRequest("blocks/"+blockId,
		[]string{"name", "display_name", "release_level", "publisher", "releases", "overview_details"})
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/GetBlock", buf)
	if err != nil {
		return nil, fmt.Errorf("GetCodeblock: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("GetCodeblock: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("GetCodeblock: response too short (%d bytes)", len(body))
	}
	var cb Codeblock
	parseBlockInto(body[5:], &cb)
	return &cb, nil
}

// ListCodeblockVersions lists available versions for a block.
func (s *ProductService) ListCodeblockVersions(blockId string) ([]CodeblockVersion, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, "blocks/"+blockId)
	buf = protowire.AppendTag(buf, 2, protowire.VarintType)
	buf = protowire.AppendVarint(buf, 100)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlockVersionsService/ListBlockVersions", buf)
	if err != nil {
		return nil, fmt.Errorf("ListCodeblockVersions: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListCodeblockVersions: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListCodeblockVersions: response too short (%d bytes)", len(body))
	}
	return parseCodeblockVersionsResponse(body[5:]), nil
}

// GetCodeblockDoc returns documentation markdown for a specific block version.
// audience is "user" or "agent".
func (s *ProductService) GetCodeblockDoc(versionName, audience string) (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}
	fm := marshalFieldMask([]string{"name", "documentation"})
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, versionName)
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendBytes(buf, fm)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlockVersionsService/GetBlockVersion", buf)
	if err != nil {
		return "", fmt.Errorf("GetCodeblockDoc: %w", err)
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("GetCodeblockDoc: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("GetCodeblockDoc: response too short (%d bytes)", len(body))
	}
	userContent, agentContent := parseCodeblockDoc(body[5:])
	if audience == "agent" {
		return agentContent, nil
	}
	return userContent, nil
}

// ListCodeblockInstances lists installed instances for a block.
func (s *ProductService) ListCodeblockInstances(blockId string) ([]CodeblockInstance, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	fm := marshalFieldMask([]string{
		"name", "package", "state", "block", "block_version",
		"create_time", "update_time", "entitlement",
	})
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, "blocks/"+blockId)
	buf = protowire.AppendTag(buf, 4, protowire.BytesType) // field 4, not 2
	buf = protowire.AppendBytes(buf, fm)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.InstancesService/ListInstances", buf)
	if err != nil {
		return nil, fmt.Errorf("ListCodeblockInstances: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListCodeblockInstances: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListCodeblockInstances: response too short (%d bytes)", len(body))
	}
	return parseCodeblockInstancesResponse(body[5:]), nil
}

// GetCodeblockMembers fetches the IAM members for a block and resolves their avatar URLs.
// It chains GetIamPolicy → BatchRetrieveMaskedUsers.
func (s *ProductService) GetCodeblockMembers(blockId string) ([]CodeblockMember, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	// Step 1: GetIamPolicy to collect member IDs.
	var req1 []byte
	req1 = protowire.AppendTag(req1, 1, protowire.BytesType)
	req1 = protowire.AppendString(req1, "blocks/"+blockId)
	ctx1, cancel1 := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel1()
	body1, status1, msg1, err := s.doConsoleGRPCWeb(ctx1, "alis.bl.blocks.v1.BlocksService/GetIamPolicy", req1)
	if err != nil {
		return nil, fmt.Errorf("GetCodeblockMembers/GetIamPolicy: %w", err)
	}
	if status1 != 0 {
		return nil, fmt.Errorf("GetCodeblockMembers/GetIamPolicy: grpc %d: %s", status1, msg1)
	}
	if len(body1) < 5 {
		return nil, nil
	}
	members := parseIamPolicyMembers(body1[5:])
	if len(members) == 0 {
		return nil, nil
	}

	// Step 2: BatchRetrieveMaskedUsers for avatar URLs.
	var req2 []byte
	for _, m := range members {
		req2 = protowire.AppendTag(req2, 1, protowire.BytesType)
		req2 = protowire.AppendString(req2, m)
	}
	ctx2, cancel2 := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel2()
	body2, status2, msg2, err := s.doConsoleGRPCWeb(ctx2, "alis.os.iam.v2.UsersService/BatchRetrieveMaskedUsers", req2)
	if err != nil {
		return nil, fmt.Errorf("GetCodeblockMembers/BatchRetrieveMaskedUsers: %w", err)
	}
	if status2 != 0 {
		return nil, fmt.Errorf("GetCodeblockMembers/BatchRetrieveMaskedUsers: grpc %d: %s", status2, msg2)
	}
	if len(body2) < 5 {
		return nil, nil
	}
	return parseCodeblockMembers(body2[5:]), nil
}

// doConsoleGRPCWeb sends a grpc-web-text request to console.alisx.com.
// Authentication uses all three alis cookies — the server requires all of them.
func (s *ProductService) doConsoleGRPCWeb(ctx context.Context, method string, protoBytes []byte) ([]byte, int, string, error) {
	cookieHeader, err := s.tokens.CookieHeader()
	if err != nil {
		return nil, 0, "", fmt.Errorf("console tokens: %w", err)
	}

	frame := make([]byte, 5+len(protoBytes))
	frame[0] = 0
	frame[1] = byte(len(protoBytes) >> 24)
	frame[2] = byte(len(protoBytes) >> 16)
	frame[3] = byte(len(protoBytes) >> 8)
	frame[4] = byte(len(protoBytes))
	copy(frame[5:], protoBytes)
	encoded := base64.StdEncoding.EncodeToString(frame)

	url := fmt.Sprintf("https://%s/%s", alisProductHost, method)
	req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(encoded))
	if err != nil {
		return nil, 0, "", err
	}
	req.Header.Set("Content-Type", "application/grpc-web-text")
	req.Header.Set("Accept", "application/grpc-web-text")
	req.Header.Set("Cookie", cookieHeader)
	req.Header.Set("x-grpc-web", "1")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, "", fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, "", fmt.Errorf("read body: %w", err)
	}

	if resp.StatusCode != 200 {
		snippet := rawBody
		if len(snippet) > 200 {
			snippet = snippet[:200]
		}
		return nil, 0, "", fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(snippet)))
	}

	// Parse frames from the grpc-web-text body.
	dataFrame, grpcStatus, grpcMessage, err := decodeGRPCWebTextFrames(rawBody)
	if err != nil {
		return nil, 0, "", err
	}
	if grpcStatus == 0 {
		if s := resp.Header.Get("grpc-status"); s != "" {
			grpcStatus, _ = strconv.Atoi(s)
			grpcMessage = resp.Header.Get("grpc-message")
		}
	}
	return dataFrame, grpcStatus, grpcMessage, nil
}

// decodeGRPCWebTextFrames parses a grpc-web-text response body.
//
// The server independently base64-encodes each gRPC frame (5-byte header + payload),
// so '=' padding can appear between frames, making a naive whole-body decode fail.
// We decode frame-by-frame: first decode 8 chars to read the 5-byte header, compute
// the full frame's base64 length, then decode the complete frame with proper padding.
func decodeGRPCWebTextFrames(rawBody []byte) (dataFrame []byte, grpcStatus int, grpcMsg string, err error) {
	clean := strings.Map(func(r rune) rune {
		switch r {
		case '\n', '\r', ' ', '\t':
			return -1
		}
		return r
	}, string(rawBody))

	pos := 0
	for pos+8 <= len(clean) {
		// Decode first 8 base64 chars → 4–6 bytes; always covers the 5-byte header.
		hdr, e := base64.StdEncoding.DecodeString(clean[pos : pos+8])
		if e != nil || len(hdr) < 5 {
			break
		}

		flags := hdr[0]
		frameLen := int(hdr[1])<<24 | int(hdr[2])<<16 | int(hdr[3])<<8 | int(hdr[4])

		// Full base64 length: ceil((5+frameLen)/3)*4 = ((5+frameLen+2)/3)*4
		b64Len := ((5 + frameLen + 2) / 3) * 4
		if pos+b64Len > len(clean) {
			break
		}

		frameBytes, e := base64.StdEncoding.DecodeString(clean[pos : pos+b64Len])
		if e != nil {
			break
		}
		pos += b64Len

		if len(frameBytes) < 5+frameLen {
			break
		}
		payload := frameBytes[5 : 5+frameLen]

		if flags == 0x80 {
			grpcStatus, grpcMsg = parseGRPCWebTrailer(payload)
		} else if dataFrame == nil {
			header := []byte{flags, byte(frameLen >> 24), byte(frameLen >> 16), byte(frameLen >> 8), byte(frameLen)}
			dataFrame = append(header, payload...)
		}
	}
	return
}

// openBrowserURL opens url in the system default browser.
func openBrowserURL(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	default:
		cmd = exec.Command("cmd", "/c", "start", url)
	}
	cmd.Start()
}

// --- request marshal helpers ---

func marshalListProductsRequest(parent string, fields []string) []byte {
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, parent)
	if len(fields) > 0 {
		fm := marshalFieldMask(fields)
		buf = protowire.AppendTag(buf, 4, protowire.BytesType)
		buf = protowire.AppendBytes(buf, fm)
	}
	return buf
}

func parseListProductsResponse(data []byte) ([]ProductSummary, error) {
	var products []ProductSummary
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return products, nil
			}
			if num == 1 {
				p, _ := parseProductSummary(b)
				if p != nil {
					products = append(products, *p)
				}
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return products, nil
			}
			data = data[m:]
		}
	}
	return products, nil
}

func parseProductSummary(data []byte) (*ProductSummary, error) {
	p := &ProductSummary{}
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.VarintType:
			v, m := protowire.ConsumeVarint(data)
			if m < 0 {
				return p, nil
			}
			if num == 21 {
				p.State = int32(v)
			}
			data = data[m:]
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return p, nil
			}
			switch num {
			case 1:
				p.Name = string(b)
			case 2:
				p.DisplayName = string(b)
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return p, nil
			}
			data = data[m:]
		}
	}
	return p, nil
}

func marshalListOrganisationsRequest(fields []string) []byte {
	var buf []byte
	if len(fields) > 0 {
		fm := marshalFieldMask(fields)
		buf = protowire.AppendTag(buf, 4, protowire.BytesType)
		buf = protowire.AppendBytes(buf, fm)
	}
	return buf
}

func parseListOrganisationsResponse(data []byte) ([]Organisation, error) {
	var orgs []Organisation
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return orgs, nil
			}
			if num == 1 {
				org, _ := parseOrganisation(b)
				if org != nil {
					orgs = append(orgs, *org)
				}
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return orgs, nil
			}
			data = data[m:]
		}
	}
	return orgs, nil
}

func parseOrganisation(data []byte) (*Organisation, error) {
	org := &Organisation{}
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return org, nil
			}
			switch num {
			case 1:
				org.Name = string(b)
			case 2:
				org.DisplayName = string(b)
			case 3:
				org.Description = string(b)
			case 4:
				org.Logo = string(b)
			case 5:
				gp, _ := parseGoogleProject(b)
				org.GoogleProject = gp
			case 12:
				org.Account = string(b)
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return org, nil
			}
			data = data[m:]
		}
	}
	return org, nil
}

func marshalFieldMask(paths []string) []byte {
	var buf []byte
	for _, p := range paths {
		buf = protowire.AppendTag(buf, 1, protowire.BytesType)
		buf = protowire.AppendString(buf, p)
	}
	return buf
}

func marshalGetProductRequest(name string, fields []string) []byte {
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, name)
	if len(fields) > 0 {
		fm := marshalFieldMask(fields)
		buf = protowire.AppendTag(buf, 2, protowire.BytesType)
		buf = protowire.AppendBytes(buf, fm)
	}
	return buf
}

func marshalGetOrganisationRequest(name string, fields []string) []byte {
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, name)
	if len(fields) > 0 {
		fm := marshalFieldMask(fields)
		buf = protowire.AppendTag(buf, 2, protowire.BytesType)
		buf = protowire.AppendBytes(buf, fm)
	}
	return buf
}

// parseOrganisationGitRepo extracts remoteUri from Organisation field 9 (git_repo).
func parseOrganisationGitRepo(data []byte) (string, error) {
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return "", nil
			}
			if num == 9 {
				gr, _ := parseGitRepo(b)
				if gr != nil {
					return gr.RemoteURI, nil
				}
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return "", nil
			}
			data = data[m:]
		}
	}
	return "", nil
}

type emitWriter struct{ emit func(string) }

func (w *emitWriter) Write(p []byte) (int, error) {
	w.emit(string(p))
	return len(p), nil
}

func systemCredentialHelper() string {
	switch runtime.GOOS {
	case "darwin":
		return "osxkeychain"
	case "windows":
		return "wincred"
	default:
		return "cache"
	}
}

func syncOneRepo(dir, remoteURL, token string, emit func(string)) (string, error) {
	gitEnv := append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	ew := &emitWriter{emit: emit}

	// GitHub uses the system credential helper; all other hosts (Forgejo, etc.)
	// get the alis Bearer token injected as an HTTP header.
	// The leading empty http.extraHeader= clears any value inherited from an
	// include.path set by the VS Code extension, preventing duplicate headers.
	var baseArgs []string
	if strings.Contains(remoteURL, "github.com") {
		baseArgs = []string{"-c", "credential.helper=" + systemCredentialHelper()}
	} else if token != "" {
		baseArgs = []string{
			"-c", "http.extraHeader=",
			"-c", "http.extraHeader=Authorization: Bearer " + token,
		}
	}

	runGit := func(subcmd ...string) error {
		args := append(baseArgs, subcmd...)
		cmd := exec.Command("git", args...)
		cmd.Env = gitEnv
		cmd.Stdin = nil
		cmd.Stdout = ew
		cmd.Stderr = ew
		return cmd.Run()
	}

	if _, err := os.Stat(dir); os.IsNotExist(err) {
		if err := os.MkdirAll(filepath.Dir(dir), 0o755); err != nil {
			return "", fmt.Errorf("mkdir %s: %w", filepath.Dir(dir), err)
		}
		if err := runGit("clone", remoteURL, dir); err != nil {
			return "", fmt.Errorf("git clone: %w", err)
		}
		return "cloned", nil
	}

	if err := runGit("-C", dir, "fetch", remoteURL); err != nil {
		return "", fmt.Errorf("git fetch: %w", err)
	}
	return "fetched", nil
}

func marshalListEnvironmentsRequest(parent string, fields []string) []byte {
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, parent)
	if len(fields) > 0 {
		fm := marshalFieldMask(fields)
		buf = protowire.AppendTag(buf, 4, protowire.BytesType)
		buf = protowire.AppendBytes(buf, fm)
	}
	return buf
}

// --- response parse helpers ---

func parseProduct(data []byte) (*ProductOverview, error) {
	p := &ProductOverview{}
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.VarintType:
			v, m := protowire.ConsumeVarint(data)
			if m < 0 {
				return p, nil
			}
			if num == 21 {
				p.State = int32(v)
			}
			data = data[m:]
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return p, nil
			}
			switch num {
			case 1:
				p.Name = string(b)
			case 2:
				p.DisplayName = string(b)
			case 5:
				gp, _ := parseGoogleProject(b)
				p.GoogleProject = gp
			case 8:
				gr, _ := parseGitRepo(b)
				p.GitRepo = gr
			case 9:
				pr, _ := parsePackageRegistries(b)
				p.PackageRegistries = pr
			case 11:
				dr, _ := parseDockerRegistries(b)
				p.DockerRegistry = dr
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return p, nil
			}
			data = data[m:]
		}
	}
	return p, nil
}

func parseGoogleProject(data []byte) (*GCPProject, error) {
	gp := &GCPProject{}
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.VarintType:
			v, m := protowire.ConsumeVarint(data)
			if m < 0 {
				return gp, nil
			}
			if num == 7 {
				gp.ManagedBillingAccount = v != 0
			}
			data = data[m:]
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return gp, nil
			}
			switch num {
			case 1:
				gp.FolderID = string(b)
			case 2:
				gp.ID = string(b)
			case 3:
				gp.Number = string(b)
			case 4:
				gp.Region = string(b)
			case 5:
				gp.BillingAccountID = string(b)
			case 8:
				gp.CloudURI = string(b)
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return gp, nil
			}
			data = data[m:]
		}
	}
	return gp, nil
}

func parseGitRepo(data []byte) (*GitRepoInfo, error) {
	gr := &GitRepoInfo{}
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return gr, nil
			}
			switch num {
			case 1:
				gr.RemoteURI = string(b)
			case 2:
				gr.CloudRunURI = parseConsoleURI(b)
			case 3:
				gr.VMURI = parseConsoleURI(b)
			case 4:
				gr.BucketURI = parseConsoleURI(b)
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return gr, nil
			}
			data = data[m:]
		}
	}
	return gr, nil
}

// parseConsoleURI extracts field 1 (string) from nested messages like GitRepo.Cloudrun.
func parseConsoleURI(data []byte) string {
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ == protowire.BytesType && num == 1 {
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				break
			}
			return string(b)
		}
		m := protowire.ConsumeFieldValue(num, typ, data)
		if m < 0 {
			break
		}
		data = data[m:]
	}
	return ""
}

func parsePackageRegistries(data []byte) (*PkgRegistries, error) {
	pr := &PkgRegistries{}
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return pr, nil
			}
			switch num {
			case 1:
				pr.Go = string(b)
			case 2:
				pr.JavaScript = string(b)
			case 3:
				pr.Python = string(b)
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return pr, nil
			}
			data = data[m:]
		}
	}
	return pr, nil
}

func parseDockerRegistries(data []byte) (string, error) {
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ == protowire.BytesType && num == 1 {
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				break
			}
			return string(b), nil
		}
		m := protowire.ConsumeFieldValue(num, typ, data)
		if m < 0 {
			break
		}
		data = data[m:]
	}
	return "", nil
}

func parseListEnvironmentsResponse(data []byte) ([]EnvInfo, error) {
	var envs []EnvInfo
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return envs, nil
			}
			if num == 1 {
				env, _ := parseEnvironment(b)
				if env != nil {
					envs = append(envs, *env)
				}
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return envs, nil
			}
			data = data[m:]
		}
	}
	return envs, nil
}

func parseEnvironment(data []byte) (*EnvInfo, error) {
	env := &EnvInfo{}
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.VarintType:
			v, m := protowire.ConsumeVarint(data)
			if m < 0 {
				return env, nil
			}
			switch num {
			case 7:
				env.EnvType = int32(v)
			case 21:
				env.State = int32(v)
			}
			data = data[m:]
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return env, nil
			}
			switch num {
			case 1:
				env.Name = string(b)
			case 2:
				env.DisplayName = string(b)
			case 5:
				gp, _ := parseGoogleProject(b)
				env.GCPProject = gp
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return env, nil
			}
			data = data[m:]
		}
	}
	return env, nil
}

// parseEnvVariablesFromGetEnvironment extracts field 8 (variables) from a GetEnvironment response.
func parseEnvVariablesFromGetEnvironment(data []byte) ([]EnvVariable, error) {
	var vars []EnvVariable
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return vars, nil
			}
			if num == 8 {
				v := parseEnvVariable(b)
				if v.Label != "" {
					vars = append(vars, v)
				}
			}
			data = data[m:]
		case protowire.VarintType:
			_, m := protowire.ConsumeVarint(data)
			if m < 0 {
				return vars, nil
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return vars, nil
			}
			data = data[m:]
		}
	}
	return vars, nil
}

func parseEnvVariable(data []byte) EnvVariable {
	var v EnvVariable
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ == protowire.BytesType {
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				break
			}
			switch num {
			case 1:
				v.Label = string(b)
			case 2:
				v.Value = string(b)
			}
			data = data[m:]
		} else {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
		}
	}
	return v
}

// parseEnvInfoFromEnvironment parses a single Environment proto response (from Create/UpdateEnvironment).
// The response body starts directly with the Environment message fields (no outer list wrapper).
func parseEnvInfoFromEnvironment(data []byte) (*EnvInfo, error) {
	return parseEnvironment(data)
}

// ── Codeblock parse helpers ───────────────────────────────────────────────────

// parseCodeblocksResponse parses the outer repeated BlockDetails (field 1) from RetrieveBlockDetails.
func parseCodeblocksResponse(data []byte) ([]Codeblock, error) {
	var blocks []Codeblock
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		data = data[m:]
		if num == 1 { // BlockDetails message
			cb := parseBlockDetails(b)
			if cb.Name != "" {
				blocks = append(blocks, cb)
			}
		}
	}
	return blocks, nil
}

// parseBlockDetails parses one BlockDetails message:
// field 1 = Block, field 3 = install_count.
func parseBlockDetails(data []byte) Codeblock {
	var cb Codeblock
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.VarintType:
			v, m := protowire.ConsumeVarint(data)
			if m < 0 {
				return cb
			}
			if num == 3 {
				cb.InstallCount = int32(v)
			}
			data = data[m:]
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return cb
			}
			if num == 1 {
				parseBlockInto(b, &cb)
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return cb
			}
			data = data[m:]
		}
	}
	return cb
}

// parseBlockInto fills a Codeblock from a Block proto message.
// Key fields: f1=name, f2=display_name, f4=releases, f15=release_level, f30=publisher, f31=overview_details.
func parseBlockInto(data []byte, cb *Codeblock) {
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.VarintType:
			v, m := protowire.ConsumeVarint(data)
			if m < 0 {
				return
			}
			if num == 15 {
				cb.ReleaseLevel = int32(v)
			}
			data = data[m:]
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return
			}
			switch num {
			case 1:
				cb.Name = string(b)
			case 2:
				cb.DisplayName = string(b)
			case 4:
				cb.LatestVersion = parseBlockLatestVersion(b)
			case 30:
				cb.Publisher = parseBlockPublisherAccount(b)
			case 31:
				parseBlockOverviewInto(b, cb)
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return
			}
			data = data[m:]
		}
	}
}

// parseBlockLatestVersion extracts the most specific version from the releases message.
// f1=stable, f2=beta/primary, f5=experimental. Returns f2 if present, else f1.
func parseBlockLatestVersion(data []byte) string {
	var stable, primary string
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		data = data[m:]
		switch num {
		case 1:
			stable = string(b)
		case 2:
			primary = string(b)
		}
	}
	if primary != "" {
		return primary
	}
	return stable
}

// parseBlockPublisherAccount extracts the account resource name from the publisher message (f1).
func parseBlockPublisherAccount(data []byte) string {
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		data = data[m:]
		if num == 1 {
			return string(b)
		}
	}
	return ""
}

// parseBlockOverviewInto fills BannerURL, Headline, Description from overview_details (f31).
// f1=banner_url, f2=headline, f3=description, f10=short_title.
func parseBlockOverviewInto(data []byte, cb *Codeblock) {
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			return
		}
		data = data[m:]
		switch num {
		case 1:
			cb.BannerURL = string(b)
		case 2:
			cb.Headline = string(b)
		case 3:
			if cb.Description == "" {
				cb.Description = string(b)
			}
		case 10:
			if cb.Headline == "" {
				cb.Headline = string(b)
			}
		}
	}
}

// ── Codeblock detail parse helpers ───────────────────────────────────────────

// parseCodeblockVersionsResponse parses a ListBlockVersions response body (after the 5-byte frame).
// Outer field 1 = repeated BlockVersion.
func parseCodeblockVersionsResponse(data []byte) []CodeblockVersion {
	var versions []CodeblockVersion
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		data = data[m:]
		if num == 1 {
			v := parseCodeblockVersion(b)
			if v.Name != "" {
				versions = append(versions, v)
			}
		}
	}
	return versions
}

// parseCodeblockVersion parses one BlockVersion message.
// Field numbers confirmed via live test dumps:
// f1=name, f2=version_tag, f4=release_notes, f9=release_level(varint), f98=create_time, f99=update_time
func parseCodeblockVersion(data []byte) CodeblockVersion {
	var v CodeblockVersion
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.VarintType:
			val, m := protowire.ConsumeVarint(data)
			if m < 0 {
				return v
			}
			if num == 9 {
				v.ReleaseLevel = int32(val)
			}
			data = data[m:]
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return v
			}
			switch num {
			case 1:
				v.Name = string(b)
				if i := strings.LastIndex(v.Name, "/"); i >= 0 {
					v.VersionTag = v.Name[i+1:]
				} else {
					v.VersionTag = v.Name
				}
			case 2:
				if v.VersionTag == "" {
					v.VersionTag = string(b)
				}
			case 4:
				v.ReleaseNotes = string(b)
			case 98:
				v.CreateTime = parseTimestamp(b)
			case 99:
				v.UpdateTime = parseTimestamp(b)
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return v
			}
			data = data[m:]
		}
	}
	return v
}

// parseCodeblockVersionFolder parses a file-tree folder sub-message within a BlockVersion.
// The folder name is inferred from the field number (10=Proto, 11=Infra, 12=Build).
func parseCodeblockVersionFolder(data []byte, fieldNum protowire.Number) CodeblockFolder {
	folderNames := map[protowire.Number]string{
		10: "Proto",
		11: "Infra",
		12: "Build",
	}
	folder := CodeblockFolder{Name: folderNames[fieldNum]}
	if folder.Name == "" {
		folder.Name = fmt.Sprintf("Field%d", fieldNum)
	}
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		data = data[m:]
		// Each file entry: f1=filename, f2=content (or nested file message).
		entry := parseCodeblockFileEntry(b)
		if entry.Name != "" {
			folder.Files = append(folder.Files, entry)
		}
	}
	return folder
}

// parseCodeblockFileEntry parses one file entry (name + content).
func parseCodeblockFileEntry(data []byte) CodeblockFileItem {
	var item CodeblockFileItem
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		data = data[m:]
		switch num {
		case 1:
			item.Name = string(b)
		case 2:
			item.Content = string(b)
		}
	}
	return item
}

// parseTimestamp converts a google.protobuf.Timestamp (f1=seconds, f2=nanos) to RFC3339.
func parseTimestamp(data []byte) string {
	var sec int64
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.VarintType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		v, m := protowire.ConsumeVarint(data)
		if m < 0 {
			break
		}
		data = data[m:]
		if num == 1 {
			sec = int64(v)
		}
	}
	if sec == 0 {
		return ""
	}
	return time.Unix(sec, 0).UTC().Format(time.RFC3339)
}

// parseCodeblockDoc parses a GetBlockVersion response and returns (userContent, agentContent).
// The documentation sub-message is at field 8; inside: f1=user_content, f2=agent_content.
func parseCodeblockDoc(data []byte) (string, string) {
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		data = data[m:]
		if num == 8 {
			return parseDocSubMessage(b)
		}
	}
	return "", ""
}

// parseDocSubMessage parses the Documentation sub-message (field 8 of BlockVersion).
// Confirmed field layout (from live raw dumps):
// f10 = user-readable content (Content sub-message: f2=markdown text)
// f11 = agent-facing content (Content sub-message: f2=markdown text)
func parseDocSubMessage(data []byte) (string, string) {
	var user, agent string
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		data = data[m:]
		switch num {
		case 10:
			user = extractContentText(b)
		case 11:
			agent = extractContentText(b)
		}
	}
	return user, agent
}

// extractContentText extracts the markdown text (field 2) from a Content sub-message.
func extractContentText(data []byte) string {
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		data = data[m:]
		if num == 2 {
			return string(b)
		}
	}
	return ""
}

// parseCodeblockInstancesResponse parses a ListInstances response body (after the 5-byte frame).
// Outer field 1 = repeated Instance.
func parseCodeblockInstancesResponse(data []byte) []CodeblockInstance {
	var instances []CodeblockInstance
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		data = data[m:]
		if num == 1 {
			inst := parseCodeblockInstance(b)
			if inst.Name != "" || inst.Package != "" {
				instances = append(instances, inst)
			}
		}
	}
	return instances
}

// parseCodeblockInstance parses one Instance message.
// Field numbers confirmed via live test dumps:
// f1=name, f2=package, f3=block, f4=block_version, f7=state(varint), f11=entitlement, f98=create_time, f99=update_time
func parseCodeblockInstance(data []byte) CodeblockInstance {
	var inst CodeblockInstance
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.VarintType:
			v, m := protowire.ConsumeVarint(data)
			if m < 0 {
				return inst
			}
			if num == 7 {
				inst.State = int32(v)
			}
			data = data[m:]
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return inst
			}
			switch num {
			case 1:
				inst.Name = string(b)
				if i := strings.LastIndex(inst.Name, "/"); i >= 0 {
					inst.ShortID = inst.Name[i+1:]
				}
			case 2:
				inst.Package = string(b)
			case 3:
				inst.Block = string(b)
			case 4:
				inst.BlockVersion = string(b)
			case 11:
				inst.Entitlement = string(b)
			case 98:
				inst.CreateTime = parseTimestamp(b)
			case 99:
				inst.UpdateTime = parseTimestamp(b)
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return inst
			}
			data = data[m:]
		}
	}
	return inst
}

// parseIamPolicyMembers extracts unique user member IDs from a GetIamPolicy response.
// Returns resource names like "users/12345..." (with "user:" prefix stripped).
// Uses the same google.iam.v1.Policy structure as parseIamPolicy in sharepage.go:
// f4=repeated Binding (f1=role, f2=repeated member string).
func parseIamPolicyMembers(data []byte) []string {
	seen := map[string]bool{}
	var result []string
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		data = data[m:]
		if num != 4 {
			continue
		}
		// Parse binding sub-message.
		inner := b
		for len(inner) > 0 {
			fn, ft, fn2 := protowire.ConsumeTag(inner)
			if fn2 < 0 {
				break
			}
			inner = inner[fn2:]
			if ft != protowire.BytesType {
				m2 := protowire.ConsumeFieldValue(fn, ft, inner)
				if m2 < 0 {
					break
				}
				inner = inner[m2:]
				continue
			}
			bv, m2 := protowire.ConsumeBytes(inner)
			if m2 < 0 {
				break
			}
			inner = inner[m2:]
			if fn != 2 {
				continue
			}
			member := string(bv)
			if strings.HasPrefix(member, "user:") {
				uid := strings.TrimPrefix(member, "user:")
				userRes := "users/" + uid
				if !seen[userRes] {
					seen[userRes] = true
					result = append(result, userRes)
				}
			}
		}
	}
	return result
}

// parseCodeblockMembers parses a BatchRetrieveMaskedUsers response into CodeblockMember slice.
// f1=repeated MaskedUser (f1=name, f2=display_name, f3=photo_url).
func parseCodeblockMembers(data []byte) []CodeblockMember {
	var members []CodeblockMember
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		data = data[m:]
		if num != 1 {
			continue
		}
		member := parseOneCodeblockMember(b)
		if member.Name != "" || member.DisplayName != "" {
			members = append(members, member)
		}
	}
	return members
}

func parseOneCodeblockMember(data []byte) CodeblockMember {
	var m CodeblockMember
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			mv := protowire.ConsumeFieldValue(num, typ, data)
			if mv < 0 {
				break
			}
			data = data[mv:]
			continue
		}
		b, mv := protowire.ConsumeBytes(data)
		if mv < 0 {
			break
		}
		data = data[mv:]
		// Field numbers match parseMaskedUser in sharepage.go (verified working).
		switch num {
		case 1:
			m.Name = string(b)
		case 7:
			m.DisplayName = strings.TrimSpace(string(b) + " " + m.DisplayName)
		case 8:
			m.DisplayName = strings.TrimSpace(m.DisplayName + " " + string(b))
		case 9:
			m.PhotoURL = string(b)
		}
	}
	return m
}
