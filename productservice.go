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
	"sort"
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

type DeploymentEnvVar struct {
	Name    string
	Value   string
	Managed bool
}

// ── Install Block types ───────────────────────────────────────────────────────

type InstallNeuron struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	Package     string `json:"package"`
}

type BlockPlan struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
}

type InstallBlockParams struct {
	BlockID      string `json:"blockId"`
	Package      string `json:"package"`
	PlanName     string `json:"planName"`
	BuildFolder  string `json:"buildFolder"`
	BlockVersion string `json:"blockVersion"`
}

type InstallBlockResult struct {
	InstanceName   string `json:"instanceName"`
	BranchName     string `json:"branchName"`
	RepoPath       string `json:"repoPath"`
	DefineRepoPath string `json:"defineRepoPath"`
}

// ── Codeblocks ────────────────────────────────────────────────────────────────

type Codeblock struct {
	Name             string             `json:"name"`
	DisplayName      string             `json:"displayName"`
	ReleaseLevel     int32              `json:"releaseLevel"`
	Publisher        string             `json:"publisher"`
	LatestVersion    string             `json:"latestVersion"`
	Tagline          string             `json:"tagline"`
	Headline         string             `json:"headline"`
	Description      string             `json:"description"`
	BannerURL        string             `json:"bannerUrl"`
	InstallCount     int32              `json:"installCount"`
	Highlights       []string           `json:"highlights"`
	KeyFeatures      []CodeblockFeature `json:"keyFeatures"`
	CodeArchitecture []CodeblockLayer   `json:"codeArchitecture"`
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

type ContributeBlockParams struct {
	BlockID      string              `json:"blockId"`
	VersionTag   string              `json:"versionTag"`
	ReleaseNotes string              `json:"releaseNotes"`
	ReleaseLevel int32               `json:"releaseLevel"` // 3=EXPERIMENTAL,6=ALPHA,9=BETA,12=RC,99=GA
	ProtoFiles   []CodeblockFileItem `json:"protoFiles"`
	InfraFiles   []CodeblockFileItem `json:"infraFiles"`
	BuildFiles   []CodeblockFileItem `json:"buildFiles"`
}

type BlockCommit struct {
	Hash     string `json:"hash"`     // short 8-char hash
	FullHash string `json:"fullHash"` // full 40-char hash
	Date     string `json:"date"`     // ISO 8601
	Message  string `json:"message"`  // first line of commit message
	Author   string `json:"author"`   // author name
}

type CreateCodeblockParams struct {
	BlockID          string             `json:"blockId"`
	DisplayName      string             `json:"displayName"`
	Tagline          string             `json:"tagline"`
	HeroStatement    string             `json:"heroStatement"`
	Description      string             `json:"description"`
	Highlights       []string           `json:"highlights"`
	KeyFeatures      []CodeblockFeature `json:"keyFeatures"`
	CodeArchitecture []CodeblockLayer   `json:"codeArchitecture"`
}

type CodeblockFeature struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

type CodeblockLayer struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

type ScannedNeuronFile struct {
	Path     string `json:"path"`     // relative path within its category folder
	Category string `json:"category"` // "build" or "infra"
	Selected bool   `json:"selected"`
}

type NeuronScanResult struct {
	Files   []ScannedNeuronFile `json:"files"`
	Package string              `json:"package"`
	Error   string              `json:"error,omitempty"` // soft error — caller checks, not throws
}

type BootstrapBlockParams struct {
	BlockID     string              `json:"blockId"`
	DisplayName string              `json:"displayName"`
	Tagline     string              `json:"tagline"`
	Package     string              `json:"package"` // e.g. "packages/myorg.myproduct.my-service.v1"
	Files       []ScannedNeuronFile `json:"files"`
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

// CheckAuth returns true when a valid, refreshable auth token can be obtained.
// Unlike IsLoggedIn, this actually tries to fetch/refresh the token, so it
// returns false when the refresh token has expired even if the credentials
// file still exists.
func (s *ProductService) CheckAuth() bool {
	ts, err := NewConsoleTokenSource()
	if err != nil {
		return false
	}
	_, err = ts.Token()
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

// retrieveDeploymentEnvs calls DeploymentsService/RetrieveDeploymentEnvs with
// migrated=true and returns all vars with their managed flag.
func (s *ProductService) retrieveDeploymentEnvs(envName string) ([]DeploymentEnvVar, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, envName)
	buf = protowire.AppendTag(buf, 3, protowire.VarintType)
	buf = protowire.AppendVarint(buf, 1) // migrated = true

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.neurons.v1.DeploymentsService/RetrieveDeploymentEnvs", buf)
	if err != nil {
		return nil, fmt.Errorf("retrieveDeploymentEnvs: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("retrieveDeploymentEnvs: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("retrieveDeploymentEnvs: response too short (%d bytes)", len(body))
	}

	// Parse top-level field 2 (repeated Env) from the response payload.
	data := body[5:]
	var vars []DeploymentEnvVar
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		data = data[m:]
		if typ != protowire.BytesType || num != 2 {
			continue
		}
		// Parse Env sub-message: field 1=name, field 2=value, field 3=managed
		var v DeploymentEnvVar
		sub := b
		for len(sub) > 0 {
			fn, ft, fn2 := protowire.ConsumeTag(sub)
			if fn2 < 0 {
				break
			}
			sub = sub[fn2:]
			switch ft {
			case protowire.BytesType:
				sb, sm := protowire.ConsumeBytes(sub)
				if sm < 0 {
					sub = nil
					break
				}
				sub = sub[sm:]
				switch fn {
				case 1:
					v.Name = string(sb)
				case 2:
					v.Value = string(sb)
				}
			case protowire.VarintType:
				sv, sm := protowire.ConsumeVarint(sub)
				if sm < 0 {
					sub = nil
					break
				}
				sub = sub[sm:]
				if fn == 3 {
					v.Managed = sv != 0
				}
			default:
				sm := protowire.ConsumeFieldValue(fn, ft, sub)
				if sm < 0 {
					sub = nil
					break
				}
				sub = sub[sm:]
			}
		}
		if v.Name != "" {
			vars = append(vars, v)
		}
	}
	return vars, nil
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
		[]string{"name", "display_name", "release_level", "publisher", "releases", "tagline", "overview_details"})
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

// DeleteCodeblock permanently deletes a block by its ID.
func (s *ProductService) DeleteCodeblock(blockId string) error {
	if err := s.initTokens(); err != nil {
		return err
	}
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, "blocks/"+blockId)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx,
		"alis.bl.blocks.v1.BlocksService/DeleteBlock", buf)
	if err != nil {
		return fmt.Errorf("DeleteCodeblock: %w", err)
	}
	if grpcStatus != 0 {
		return fmt.Errorf("DeleteCodeblock: grpc %d: %s", grpcStatus, grpcMsg)
	}
	return nil
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

// GetCodeblockVersion returns full details for a block version including files.
// versionName is the resource name, e.g. "blocks/bb6b/versions/1.0.0-experimental1".
func (s *ProductService) GetCodeblockVersion(versionName string) (*CodeblockVersion, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, versionName)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlockVersionsService/GetBlockVersion", buf)
	if err != nil {
		return nil, fmt.Errorf("GetCodeblockVersion: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("GetCodeblockVersion: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("GetCodeblockVersion: response too short (%d bytes)", len(body))
	}
	v := parseCodeblockVersion(body[5:])
	return &v, nil
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

// ListMyCodeblocks returns only the blocks published by the current user's account.
func (s *ProductService) ListMyCodeblocks() ([]Codeblock, error) {
	all, err := s.ListCodeblocks()
	if err != nil {
		return nil, err
	}
	myIDs := s.myAccountIDs()
	var mine []Codeblock
	for _, cb := range all {
		if myIDs[cb.Publisher] {
			mine = append(mine, cb)
		}
	}
	return mine, nil
}

// ListInstallOrgs returns all organisations the user belongs to (for install location picker).
func (s *ProductService) ListInstallOrgs() ([]Organisation, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	protoBytes := marshalListOrganisationsRequest([]string{"name", "display_name"})
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.OrganisationsService/ListOrganisations", protoBytes)
	if err != nil {
		return nil, fmt.Errorf("ListInstallOrgs: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListInstallOrgs: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListInstallOrgs: response too short (%d bytes)", len(body))
	}
	return parseListOrganisationsResponse(body[5:])
}

// ListInstallNeurons returns the neurons (packages) in the given org/product for install location picker.
func (s *ProductService) ListInstallNeurons(org, product string) ([]InstallNeuron, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	parent := fmt.Sprintf("organisations/%s/products/%s", org, product)
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, parent)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.neurons.v1.NeuronsService/ListNeurons", buf)
	if err != nil {
		return nil, fmt.Errorf("ListInstallNeurons: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListInstallNeurons: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListInstallNeurons: response too short (%d bytes)", len(body))
	}
	return parseInstallNeuronsResponse(body[5:]), nil
}

// ListBlockPlans returns the available entitlement plans for a block.
func (s *ProductService) ListBlockPlans(blockId string) ([]BlockPlan, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, "blocks/"+blockId)
	fm := marshalFieldMask([]string{"name", "display_name"})
	buf = protowire.AppendTag(buf, 5, protowire.BytesType)
	buf = protowire.AppendBytes(buf, fm)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.EntitlementPlansService/ListEntitlementPlans", buf)
	if err != nil {
		return nil, fmt.Errorf("ListBlockPlans: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListBlockPlans: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListBlockPlans: response too short (%d bytes)", len(body))
	}
	return parseBlockPlansResponse(body[5:]), nil
}

// DoInstallBlock creates an entitlement, creates the instance, then runs the installation pipeline.
// It polls until the deployment operation completes (up to 5 minutes) before returning.
func (s *ProductService) DoInstallBlock(params InstallBlockParams) (*InstallBlockResult, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	accountID := s.myPrimaryAccountID()
	if accountID == "" {
		return nil, fmt.Errorf("DoInstallBlock: could not determine account ID")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	// Step 1: Check for existing redeemable entitlement.
	existingEntitlement, err := s.findExistingEntitlement(ctx, params.BlockID, accountID)
	if err != nil {
		return nil, fmt.Errorf("DoInstallBlock: check entitlement: %w", err)
	}

	entitlementName := existingEntitlement
	if entitlementName == "" {
		// Step 2: Create a new entitlement.
		entitlementName, err = s.createEntitlement(ctx, params.BlockID, params.PlanName, accountID)
		if err != nil {
			return nil, fmt.Errorf("DoInstallBlock: create entitlement: %w", err)
		}
	}

	// Step 3: AddBlock — creates the instance.
	instanceName, err := s.addBlock(ctx, params.BlockID, params.Package, entitlementName)
	if err != nil {
		return nil, fmt.Errorf("DoInstallBlock: add block: %w", err)
	}

	// Step 4: Resolve block version — BlocksService/InstallBlock requires it.
	blockVersion := params.BlockVersion
	if blockVersion == "" {
		versions, vErr := s.ListCodeblockVersions(params.BlockID)
		if vErr != nil || len(versions) == 0 {
			return nil, fmt.Errorf("DoInstallBlock: could not resolve latest block version: %v", vErr)
		}
		blockVersion = versions[0].Name
	}

	// Step 5: InstallBlock — runs the deployment pipeline (returns an LRO).
	buildFolder := params.BuildFolder
	if buildFolder == "" {
		buildFolder = "./"
	}
	opName, err := s.installBlockLRO(ctx, params.BlockID, params.Package, instanceName, buildFolder, blockVersion)
	if err != nil {
		return nil, fmt.Errorf("DoInstallBlock: install block: %w", err)
	}

	// Step 5: Poll the install operation until done; capture the final response data.
	opData, err := s.pollOperation(ctx, "alis.bl.blocks.v1.BlocksService/GetOperation", opName)
	if err != nil {
		return nil, fmt.Errorf("DoInstallBlock: operation failed: %w", err)
	}

	// Suppress unused variable — opData is kept for future use but branch is fetched via GetInstance.
	_ = opData

	// Step 6: Fetch the instance to get git_branch (field 6 of Instance).
	branchName, _ := s.getInstanceGitBranch(ctx, instanceName)

	// Derive local repo path from the package: packages/{org}.{product}.{...} → ~/alis.build/{org}/build/{product}
	repoPath := packageToRepoPath(params.Package)

	return &InstallBlockResult{
		InstanceName:   instanceName,
		BranchName:     branchName,
		RepoPath:       repoPath,
		DefineRepoPath: packageToDefineRepoPath(params.Package),
	}, nil
}

// getInstanceGitBranch calls InstancesService/GetInstance and returns the git_branch field.
func (s *ProductService) getInstanceGitBranch(ctx context.Context, instanceName string) (string, error) {
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, instanceName)
	fm := marshalFieldMask([]string{"git_branch"})
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendBytes(buf, fm)

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.InstancesService/GetInstance", buf)
	if err != nil {
		return "", err
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("response too short")
	}
	// Instance.git_branch is field 6.
	return parseStringFieldN(body[5:], 6), nil
}

// packageToRepoPath converts a package resource name to the local alis build repo path.
// "packages/voyage.vp.bff.v1" → "~/alis.build/voyage/build/vp"
func packageToRepoPath(pkg string) string {
	pkg = strings.TrimPrefix(pkg, "packages/")
	parts := strings.SplitN(pkg, ".", 3)
	if len(parts) < 2 {
		return ""
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, "alis.build", parts[0], "build", parts[1])
}

// packageToDefineRepoPath converts a package resource name to the local alis define repo path.
// "packages/voyage.vp.bff.v1" → "~/alis.build/voyage/define"
func packageToDefineRepoPath(pkg string) string {
	pkg = strings.TrimPrefix(pkg, "packages/")
	parts := strings.SplitN(pkg, ".", 2)
	if len(parts) < 1 || parts[0] == "" {
		return ""
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, "alis.build", parts[0], "define")
}

func (s *ProductService) findExistingEntitlement(ctx context.Context, blockId, accountID string) (string, error) {
	filter := fmt.Sprintf("Entitlement.account = '%s' AND Entitlement.state = REDEEMABLE", accountID)
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, "blocks/"+blockId)
	buf = protowire.AppendTag(buf, 6, protowire.BytesType)
	buf = protowire.AppendString(buf, filter)
	body, grpcStatus, _, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.EntitlementsService/ListEntitlements", buf)
	if err != nil || grpcStatus != 0 || len(body) < 5 {
		return "", nil // ignore errors, just proceed to create
	}
	return parseFirstEntitlementName(body[5:]), nil
}

func (s *ProductService) createEntitlement(ctx context.Context, blockId, planName, accountID string) (string, error) {
	// Entitlement sub-message: f2=entitlement_plan, f3=account, f8=state(2=REDEEMABLE)
	var entMsg []byte
	entMsg = protowire.AppendTag(entMsg, 2, protowire.BytesType)
	entMsg = protowire.AppendString(entMsg, planName)
	entMsg = protowire.AppendTag(entMsg, 3, protowire.BytesType)
	entMsg = protowire.AppendString(entMsg, accountID)
	entMsg = protowire.AppendTag(entMsg, 8, protowire.VarintType)
	entMsg = protowire.AppendVarint(entMsg, 2)

	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, "blocks/"+blockId)
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendBytes(buf, entMsg)

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.EntitlementsService/CreateEntitlement", buf)
	if err != nil {
		return "", err
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("response too short (%d bytes)", len(body))
	}
	name := parseStringField1(body[5:])
	if name == "" {
		return "", fmt.Errorf("empty entitlement name in response")
	}
	return name, nil
}

func (s *ProductService) addBlock(ctx context.Context, blockId, pkg, entitlement string) (string, error) {
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, "blocks/"+blockId)
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendString(buf, pkg)
	buf = protowire.AppendTag(buf, 3, protowire.BytesType)
	buf = protowire.AppendString(buf, entitlement)

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/AddBlock", buf)
	if err != nil {
		return "", err
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("response too short (%d bytes)", len(body))
	}
	name := parseStringField1(body[5:])
	if name == "" {
		return "", fmt.Errorf("empty instance name in AddBlock response")
	}
	return name, nil
}

func (s *ProductService) installBlockLRO(ctx context.Context, blockId, pkg, instanceName, buildFolder, blockVersion string) (string, error) {
	// BlocksService/InstallBlock: f1=block, f2=package, f3=build_folder, f4=instance, f5=block_version
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, "blocks/"+blockId)
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendString(buf, pkg)
	if buildFolder != "" {
		buf = protowire.AppendTag(buf, 3, protowire.BytesType)
		buf = protowire.AppendString(buf, buildFolder)
	}
	buf = protowire.AppendTag(buf, 4, protowire.BytesType)
	buf = protowire.AppendString(buf, instanceName)
	if blockVersion != "" {
		buf = protowire.AppendTag(buf, 5, protowire.BytesType)
		buf = protowire.AppendString(buf, blockVersion)
	}

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/InstallBlock", buf)
	if err != nil {
		return "", err
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("response too short (%d bytes)", len(body))
	}
	// Response is a google.longrunning.Operation — field 1 = name.
	opName := parseStringField1(body[5:])
	if opName == "" {
		return "", fmt.Errorf("empty operation name in InstallBlock response")
	}
	return opName, nil
}

// pollOperation polls until the LRO is done and returns the raw proto bytes of the
// final Operation (after the 5-byte gRPC frame header). Returns an error if the
// operation fails or the context times out.
// method is the full gRPC method path for GetOperation on the relevant service,
// e.g. "alis.bl.blocks.v1.BlocksService/GetOperation" or "google.longrunning.Operations/GetOperation".
func (s *ProductService) pollOperation(ctx context.Context, method string, opName string) ([]byte, error) {
	for {
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("timed out waiting for operation %s", opName)
		case <-time.After(3 * time.Second):
		}

		body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx,
			method, marshalGetOperationRequest(opName))
		if err != nil {
			return nil, fmt.Errorf("GetOperation: %w", err)
		}
		if grpcStatus != 0 {
			return nil, fmt.Errorf("GetOperation: grpc %d: %s", grpcStatus, grpcMsg)
		}
		if len(body) < 5 {
			continue
		}
		data := body[5:]
		done, errMsg := parseOperationStatus(data)
		if errMsg != "" {
			return nil, fmt.Errorf("operation error: %s", errMsg)
		}
		if done {
			return data, nil
		}
	}
}

// mergeBlockBranch calls InstancesService/MergeBlockBranch to merge the git branch that
// InstallBlock creates in the product's build repository, then polls the resulting LRO.
func (s *ProductService) mergeBlockBranch(ctx context.Context, instanceName string) error {
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, instanceName)
	buf = protowire.AppendTag(buf, 2, protowire.VarintType)
	buf = protowire.AppendVarint(buf, 1) // merge_build_repository = true

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx,
		"alis.bl.blocks.v1.InstancesService/MergeBlockBranch", buf)
	if err != nil {
		return err
	}
	if grpcStatus != 0 {
		return fmt.Errorf("grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return fmt.Errorf("response too short (%d bytes)", len(body))
	}
	opName := parseStringField1(body[5:])
	if opName == "" {
		return fmt.Errorf("empty operation name in MergeBlockBranch response")
	}
	_, err = s.pollOperation(ctx, "alis.bl.blocks.v1.BlocksService/GetOperation", opName)
	return err
}

// parseInstallBlockBranch extracts the branch name from a completed google.longrunning.Operation
// whose Any response (field 5) contains a serialized InstallBlockResponse (f2=branch).
func parseInstallBlockBranch(data []byte) string {
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
		if num != 5 { // field 5 = response (google.protobuf.Any)
			continue
		}
		// Parse the Any: f1=type_url, f2=value(serialized InstallBlockResponse)
		anyData := b
		for len(anyData) > 0 {
			fn, _, fn2 := protowire.ConsumeTag(anyData)
			if fn2 < 0 {
				break
			}
			anyData = anyData[fn2:]
			ab, am := protowire.ConsumeBytes(anyData)
			if am < 0 {
				break
			}
			anyData = anyData[am:]
			if fn == 2 { // value bytes = serialized InstallBlockResponse
				// InstallBlockResponse: f1=instance, f2=branch
				return parseStringFieldN(ab, 2)
			}
		}
	}
	return ""
}

// parseStringFieldN extracts field n (string/bytes) from a proto message.
func parseStringFieldN(data []byte, fieldNum protowire.Number) string {
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
			if num == fieldNum {
				return string(b)
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
	return ""
}

// parseOperationStatus reads a google.longrunning.Operation and returns (done, errorMessage).
// f1=name, f3=done(varint bool), f4=error(Status: f1=code, f2=message).
func parseOperationStatus(data []byte) (done bool, errMsg string) {
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
			if num == 3 {
				done = v != 0
			}
			data = data[m:]
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return
			}
			if num == 4 {
				_, msg := parseStatus(b)
				if msg != "" {
					errMsg = msg
				}
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
	return
}

// parseStringField1 extracts field 1 (string) from a proto message — used for name fields.
func parseStringField1(data []byte) string {
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
			if num == 1 {
				return string(b)
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
	return ""
}

// parseFirstEntitlementName returns the name (field 1) of the first Entitlement in a ListEntitlements response.
func parseFirstEntitlementName(data []byte) string {
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
			name := parseStringField1(b)
			if name != "" {
				return name
			}
		}
	}
	return ""
}

// parseInstallNeuronsResponse parses a ListNeurons response.
// Outer field 1 = repeated Neuron (f1=name, f2=display_name).
// Package is derived from the neuron resource name.
func parseInstallNeuronsResponse(data []byte) []InstallNeuron {
	var neurons []InstallNeuron
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
			neuron := parseInstallNeuron(b)
			if neuron.Name != "" {
				neurons = append(neurons, neuron)
			}
		}
	}
	return neurons
}

func parseInstallNeuron(data []byte) InstallNeuron {
	// Neuron proto fields: f1=name, f2=version, f3=build_commit, f4=package,
	// f5=latest_version_state(enum), f6=last_version_logs_uri. No display_name field.
	var n InstallNeuron
	for len(data) > 0 {
		num, typ, nn := protowire.ConsumeTag(data)
		if nn < 0 {
			break
		}
		data = data[nn:]
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
			n.Name = string(b)
		case 4:
			n.Package = string(b)
		}
	}
	if n.Name != "" {
		// Derive package from name if the server didn't include it.
		if n.Package == "" {
			n.Package = neuronNameToPackage(n.Name)
		}
		// Display name = neuron ID segment (no display_name in the Neuron proto).
		if i := strings.LastIndex(n.Name, "/"); i >= 0 {
			n.DisplayName = n.Name[i+1:]
		}
	}
	return n
}

// neuronNameToPackage converts "organisations/{org}/products/{product}/neurons/{id}"
// to "packages/{org}.{product}.{id}" where the neuron ID's "-" are replaced with ".".
func neuronNameToPackage(neuronName string) string {
	parts := strings.Split(neuronName, "/")
	if len(parts) != 6 {
		return ""
	}
	neuronID := strings.ReplaceAll(parts[5], "-", ".")
	return "packages/" + parts[1] + "." + parts[3] + "." + neuronID
}

// parseBlockPlansResponse parses a ListEntitlementPlans response.
// Outer field 1 = repeated EntitlementPlan (f1=name, f2=display_name).
func parseBlockPlansResponse(data []byte) []BlockPlan {
	var plans []BlockPlan
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
			plan := parseBlockPlan(b)
			if plan.Name != "" {
				plans = append(plans, plan)
			}
		}
	}
	return plans
}

func parseBlockPlan(data []byte) BlockPlan {
	var p BlockPlan
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
			p.Name = string(b)
		case 2:
			p.DisplayName = string(b)
		}
	}
	if p.DisplayName == "" && p.Name != "" {
		if i := strings.LastIndex(p.Name, "/"); i >= 0 {
			p.DisplayName = p.Name[i+1:]
		}
	}
	return p
}

// UninstallCodeblockInstance uninstalls an instance by resource name (e.g. "blocks/bb6b/instances/631").
// The configuration is preserved on the server for potential reinstallation.
// Returns after the resulting LRO completes (up to 5 minutes).
func (s *ProductService) UninstallCodeblockInstance(instanceName string) error {
	if err := s.initTokens(); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, instanceName)

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/UninstallBlock", buf)
	if err != nil {
		return fmt.Errorf("UninstallBlock: %w", err)
	}
	if grpcStatus != 0 {
		return fmt.Errorf("UninstallBlock: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return fmt.Errorf("UninstallBlock: response too short (%d bytes)", len(body))
	}
	opName := parseStringField1(body[5:])
	if opName == "" {
		return fmt.Errorf("UninstallBlock: empty operation name in response")
	}
	_, err = s.pollOperation(ctx, "alis.bl.blocks.v1.BlocksService/GetOperation", opName)
	return err
}

// UpgradeCodeblockInstance upgrades an instance to a different block version.
// instanceName is the full resource name (e.g. "blocks/bb6b/instances/631").
// blockVersionName is the full version resource name (e.g. "blocks/bb6b/versions/1.0.0-experimental1").
// Returns after the resulting LRO completes (up to 5 minutes).
func (s *ProductService) UpgradeCodeblockInstance(instanceName, blockVersionName string) error {
	if err := s.initTokens(); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, instanceName)
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendString(buf, blockVersionName)

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/UpgradeBlock", buf)
	if err != nil {
		return fmt.Errorf("UpgradeBlock: %w", err)
	}
	if grpcStatus != 0 {
		return fmt.Errorf("UpgradeBlock: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return fmt.Errorf("UpgradeBlock: response too short (%d bytes)", len(body))
	}
	opName := parseStringField1(body[5:])
	if opName == "" {
		return fmt.Errorf("UpgradeBlock: empty operation name in response")
	}
	_, err = s.pollOperation(ctx, "alis.bl.blocks.v1.BlocksService/GetOperation", opName)
	return err
}

// CreateCodeblock creates a new code block and returns its resource name (e.g. "blocks/myblock").
func (s *ProductService) CreateCodeblock(params CreateCodeblockParams) (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}
	accountName := s.myPrimaryAccountID()
	protoBytes := marshalCreateBlockRequest(params, accountName)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/CreateBlock", protoBytes)
	if err != nil {
		return "", fmt.Errorf("CreateBlock: %w", err)
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("CreateBlock: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("CreateBlock: response too short (%d bytes)", len(body))
	}
	return parseCreateBlockName(body[5:]), nil
}

// GetMyPrimaryAccountID returns the caller's primary account resource name (e.g. "accounts/8na6ap").
func (s *ProductService) GetMyPrimaryAccountID() (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}
	return s.myPrimaryAccountID(), nil
}

// myPrimaryAccountID returns the first "accounts/<id>" from the JWT access token.
func (s *ProductService) myPrimaryAccountID() string {
	for id := range s.myAccountIDs() {
		return id
	}
	return ""
}

func marshalCreateBlockRequest(p CreateCodeblockParams, accountName string) []byte {
	// overview_details (field 31 of Block)
	var overview []byte
	if p.HeroStatement != "" {
		overview = protowire.AppendTag(overview, 2, protowire.BytesType)
		overview = protowire.AppendString(overview, p.HeroStatement)
	}
	if p.Description != "" {
		overview = protowire.AppendTag(overview, 3, protowire.BytesType)
		overview = protowire.AppendString(overview, p.Description)
	}
	for _, h := range p.Highlights {
		if h != "" {
			overview = protowire.AppendTag(overview, 6, protowire.BytesType)
			overview = protowire.AppendString(overview, h)
		}
	}
	for _, kf := range p.KeyFeatures {
		var feat []byte
		feat = protowire.AppendTag(feat, 1, protowire.BytesType)
		feat = protowire.AppendString(feat, kf.Title)
		feat = protowire.AppendTag(feat, 2, protowire.BytesType)
		feat = protowire.AppendString(feat, kf.Description)
		overview = protowire.AppendTag(overview, 7, protowire.BytesType)
		overview = protowire.AppendBytes(overview, feat)
	}
	for _, al := range p.CodeArchitecture {
		var layer []byte
		layer = protowire.AppendTag(layer, 1, protowire.BytesType)
		layer = protowire.AppendString(layer, al.Title)
		layer = protowire.AppendTag(layer, 2, protowire.BytesType)
		layer = protowire.AppendString(layer, al.Description)
		overview = protowire.AppendTag(overview, 8, protowire.BytesType)
		overview = protowire.AppendBytes(overview, layer)
	}

	// publisher (field 30 of Block)
	var publisher []byte
	if accountName != "" {
		publisher = protowire.AppendTag(publisher, 1, protowire.BytesType)
		publisher = protowire.AppendString(publisher, accountName)
	}

	// Block message (field 2 of CreateBlockRequest)
	var block []byte
	if p.DisplayName != "" {
		block = protowire.AppendTag(block, 2, protowire.BytesType)
		block = protowire.AppendString(block, p.DisplayName)
	}
	if p.Tagline != "" {
		block = protowire.AppendTag(block, 13, protowire.BytesType)
		block = protowire.AppendString(block, p.Tagline)
	}
	if len(publisher) > 0 {
		block = protowire.AppendTag(block, 30, protowire.BytesType)
		block = protowire.AppendBytes(block, publisher)
	}
	if len(overview) > 0 {
		block = protowire.AppendTag(block, 31, protowire.BytesType)
		block = protowire.AppendBytes(block, overview)
	}

	// CreateBlockRequest: f2=block, f3=block_id
	var req []byte
	req = protowire.AppendTag(req, 2, protowire.BytesType)
	req = protowire.AppendBytes(req, block)
	req = protowire.AppendTag(req, 3, protowire.BytesType)
	req = protowire.AppendString(req, p.BlockID)
	return req
}

// parseCreateBlockName extracts the resource name (field 1) from the returned Block.
// UpdateCodeblock calls BlocksService/UpdateBlock with the given params.
func (s *ProductService) UpdateCodeblock(params CreateCodeblockParams) error {
	if err := s.initTokens(); err != nil {
		return err
	}
	blockName := "blocks/" + params.BlockID
	buf := marshalUpdateBlockRequest(blockName, params)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/UpdateBlock", buf)
	if err != nil {
		return err
	}
	if grpcStatus != 0 {
		return fmt.Errorf("update block: gRPC status %d: %s", grpcStatus, grpcMsg)
	}
	return nil
}

func marshalUpdateBlockRequest(blockName string, p CreateCodeblockParams) []byte {
	// overview_details sub-message (same layout as create)
	var overview []byte
	if p.HeroStatement != "" {
		overview = protowire.AppendTag(overview, 2, protowire.BytesType)
		overview = protowire.AppendString(overview, p.HeroStatement)
	}
	if p.Description != "" {
		overview = protowire.AppendTag(overview, 3, protowire.BytesType)
		overview = protowire.AppendString(overview, p.Description)
	}
	for _, h := range p.Highlights {
		overview = protowire.AppendTag(overview, 6, protowire.BytesType)
		overview = protowire.AppendString(overview, h)
	}
	for _, kf := range p.KeyFeatures {
		var feat []byte
		feat = protowire.AppendTag(feat, 1, protowire.BytesType)
		feat = protowire.AppendString(feat, kf.Title)
		feat = protowire.AppendTag(feat, 2, protowire.BytesType)
		feat = protowire.AppendString(feat, kf.Description)
		overview = protowire.AppendTag(overview, 7, protowire.BytesType)
		overview = protowire.AppendBytes(overview, feat)
	}
	for _, al := range p.CodeArchitecture {
		var layer []byte
		layer = protowire.AppendTag(layer, 1, protowire.BytesType)
		layer = protowire.AppendString(layer, al.Title)
		layer = protowire.AppendTag(layer, 2, protowire.BytesType)
		layer = protowire.AppendString(layer, al.Description)
		overview = protowire.AppendTag(overview, 8, protowire.BytesType)
		overview = protowire.AppendBytes(overview, layer)
	}

	// Block message: f1=name, f2=display_name, f13=tagline, f31=overview_details
	var block []byte
	block = protowire.AppendTag(block, 1, protowire.BytesType)
	block = protowire.AppendString(block, blockName)
	if p.DisplayName != "" {
		block = protowire.AppendTag(block, 2, protowire.BytesType)
		block = protowire.AppendString(block, p.DisplayName)
	}
	if p.Tagline != "" {
		block = protowire.AppendTag(block, 13, protowire.BytesType)
		block = protowire.AppendString(block, p.Tagline)
	}
	if len(overview) > 0 {
		block = protowire.AppendTag(block, 31, protowire.BytesType)
		block = protowire.AppendBytes(block, overview)
	}

	// update_mask (FieldMask): f1=paths repeated
	var mask []byte
	for _, path := range []string{"display_name", "tagline", "overview_details"} {
		mask = protowire.AppendTag(mask, 1, protowire.BytesType)
		mask = protowire.AppendString(mask, path)
	}

	// UpdateBlockRequest: f1=block, f2=update_mask
	var req []byte
	req = protowire.AppendTag(req, 1, protowire.BytesType)
	req = protowire.AppendBytes(req, block)
	req = protowire.AppendTag(req, 2, protowire.BytesType)
	req = protowire.AppendBytes(req, mask)
	return req
}

// ContributeBlock publishes a new block version with code files via BlockVersionsService/CreateBlockVersion (LRO).
// Returns the created version resource name, e.g. "blocks/myblock/versions/v1.0.0-experimental1".
func (s *ProductService) ContributeBlock(params ContributeBlockParams) (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}
	buf := marshalCreateBlockVersionRequest(params)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlockVersionsService/CreateBlockVersion", buf)
	if err != nil {
		return "", fmt.Errorf("ContributeBlock: %w", err)
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("ContributeBlock: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("ContributeBlock: response too short (%d bytes)", len(body))
	}
	opName := parseStringField1(body[5:])
	if opName == "" {
		return "", fmt.Errorf("ContributeBlock: empty operation name in response")
	}
	if _, err := s.pollOperation(ctx, "alis.bl.blocks.v1.BlocksService/GetOperation", opName); err != nil {
		return "", fmt.Errorf("ContributeBlock: operation failed: %w", err)
	}
	return "blocks/" + params.BlockID + "/versions/" + params.VersionTag, nil
}

func marshalCreateBlockVersionRequest(p ContributeBlockParams) []byte {
	// File sub-message: f1=filename, f2=content (bytes)
	marshalFile := func(f CodeblockFileItem) []byte {
		var b []byte
		b = protowire.AppendTag(b, 1, protowire.BytesType)
		b = protowire.AppendString(b, f.Name)
		b = protowire.AppendTag(b, 2, protowire.BytesType)
		b = protowire.AppendBytes(b, []byte(f.Content))
		return b
	}

	// BlockVersion.Content: f1=build_files, f2=infra_files, f3=proto_files
	var content []byte
	for _, f := range p.BuildFiles {
		content = protowire.AppendTag(content, 1, protowire.BytesType)
		content = protowire.AppendBytes(content, marshalFile(f))
	}
	for _, f := range p.InfraFiles {
		content = protowire.AppendTag(content, 2, protowire.BytesType)
		content = protowire.AppendBytes(content, marshalFile(f))
	}
	for _, f := range p.ProtoFiles {
		content = protowire.AppendTag(content, 3, protowire.BytesType)
		content = protowire.AppendBytes(content, marshalFile(f))
	}

	// BlockVersion: f3=contributed_content, f4=release_notes, f9=release_level
	// Note: version (f2) must be empty — the ID is sent as block_version_id on the request.
	var bv []byte
	if len(content) > 0 {
		bv = protowire.AppendTag(bv, 3, protowire.BytesType)
		bv = protowire.AppendBytes(bv, content)
	}
	if p.ReleaseNotes != "" {
		bv = protowire.AppendTag(bv, 4, protowire.BytesType)
		bv = protowire.AppendString(bv, p.ReleaseNotes)
	}
	if p.ReleaseLevel != 0 {
		bv = protowire.AppendTag(bv, 9, protowire.VarintType)
		bv = protowire.AppendVarint(bv, uint64(p.ReleaseLevel))
	}

	// CreateBlockVersionRequest: f1=parent, f2=block_version, f3=block_version_id
	var req []byte
	req = protowire.AppendTag(req, 1, protowire.BytesType)
	req = protowire.AppendString(req, "blocks/"+p.BlockID)
	req = protowire.AppendTag(req, 2, protowire.BytesType)
	req = protowire.AppendBytes(req, bv)
	if p.VersionTag != "" {
		req = protowire.AppendTag(req, 3, protowire.BytesType)
		req = protowire.AppendString(req, p.VersionTag)
	}
	return req
}

func parseCreateBlockName(data []byte) string {
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
			if num == 1 {
				return string(b)
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
	return ""
}

// OpenBlockWorktrees creates git worktrees for an instance's build and define repos.
// It returns the root worktree path, e.g. "{tmpdir}/.alis-blocks-worktrees/{blockId}/{packageId}/{instanceId}/".
func (s *ProductService) OpenBlockWorktrees(instanceName string) (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Get the instance's package and git_branch.
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, instanceName)
	fm := marshalFieldMask([]string{"package", "git_branch"})
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendBytes(buf, fm)

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.InstancesService/GetInstance", buf)
	if err != nil {
		return "", fmt.Errorf("OpenBlockWorktrees: GetInstance: %w", err)
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("OpenBlockWorktrees: GetInstance: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("OpenBlockWorktrees: GetInstance: response too short")
	}
	data := body[5:]
	pkg := parseStringFieldN(data, 2)    // Instance.package
	branch := parseStringFieldN(data, 6) // Instance.git_branch
	if pkg == "" {
		return "", fmt.Errorf("OpenBlockWorktrees: instance has no package field")
	}
	if branch == "" {
		return "", fmt.Errorf("OpenBlockWorktrees: instance has no git_branch field")
	}

	// Derive the block ID and instance short ID from the resource name.
	// instanceName = "blocks/{blockId}/instances/{instanceId}"
	parts := strings.Split(instanceName, "/")
	if len(parts) < 4 {
		return "", fmt.Errorf("OpenBlockWorktrees: unexpected instance name format: %s", instanceName)
	}
	blockID := parts[1]
	instanceID := parts[3]
	packageID := strings.TrimPrefix(pkg, "packages/")

	// Build repo: ~/alis.build/{org}/build/{product}
	buildRepo := packageToRepoPath(pkg)
	// Define repo: ~/alis.build/{org}/define
	defineRepo := packageToDefineRepoPath(pkg)
	if buildRepo == "" || defineRepo == "" {
		return "", fmt.Errorf("OpenBlockWorktrees: could not derive repo paths from package %s", pkg)
	}

	// Create the worktree root directory.
	worktreeRoot := filepath.Join(os.TempDir(), ".alis-blocks-worktrees", blockID, packageID, instanceID)
	if err := os.MkdirAll(worktreeRoot, 0755); err != nil {
		return "", fmt.Errorf("OpenBlockWorktrees: mkdir: %w", err)
	}

	// Fetch latest refs in both repos.
	gitCmd(buildRepo, "git", "fetch", "--all", "--prune")
	gitCmd(defineRepo, "git", "fetch", "--all", "--prune")

	// Add build worktree (remove stale one first if it exists but isn't registered).
	buildWorktreePath := filepath.Join(worktreeRoot, "build")
	if _, statErr := os.Stat(buildWorktreePath); statErr != nil {
		if _, wtErr := gitCmd(buildRepo, "git", "worktree", "add", "-B", branch, buildWorktreePath, "origin/"+branch); wtErr != nil {
			// Try without -B in case branch doesn't exist on origin yet.
			if _, wtErr2 := gitCmd(buildRepo, "git", "worktree", "add", "-b", branch, buildWorktreePath, "origin/HEAD"); wtErr2 != nil {
				return "", fmt.Errorf("OpenBlockWorktrees: build worktree: %w", wtErr)
			}
		}
	}

	// Add define worktree.
	defineWorktreePath := filepath.Join(worktreeRoot, "define")
	if _, statErr := os.Stat(defineWorktreePath); statErr != nil {
		if _, wtErr := gitCmd(defineRepo, "git", "worktree", "add", "-B", branch, defineWorktreePath, "origin/"+branch); wtErr != nil {
			if _, wtErr2 := gitCmd(defineRepo, "git", "worktree", "add", "-b", branch, defineWorktreePath, "origin/HEAD"); wtErr2 != nil {
				return "", fmt.Errorf("OpenBlockWorktrees: define worktree: %w", wtErr)
			}
		}
	}

	return worktreeRoot, nil
}

// GetBlockCommits returns recent commits from the build or define repo for a given instance.
// repoType must be "build" or "define".
func (s *ProductService) GetBlockCommits(instanceName, repoType string, limit int) ([]BlockCommit, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Fetch instance package + git_branch.
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, instanceName)
	fm := marshalFieldMask([]string{"package", "git_branch"})
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendBytes(buf, fm)

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.InstancesService/GetInstance", buf)
	if err != nil {
		return nil, fmt.Errorf("GetBlockCommits: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("GetBlockCommits: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("GetBlockCommits: response too short")
	}
	data := body[5:]
	pkg := parseStringFieldN(data, 2)
	branch := parseStringFieldN(data, 6)
	if pkg == "" || branch == "" {
		return nil, fmt.Errorf("GetBlockCommits: missing package or git_branch on instance")
	}

	var repoPath string
	switch repoType {
	case "build":
		repoPath = packageToRepoPath(pkg)
	case "define":
		repoPath = packageToDefineRepoPath(pkg)
	default:
		return nil, fmt.Errorf("GetBlockCommits: repoType must be 'build' or 'define', got %q", repoType)
	}
	if repoPath == "" {
		return nil, fmt.Errorf("GetBlockCommits: could not derive repo path from package %s", pkg)
	}

	if limit <= 0 {
		limit = 50
	}
	// Format: hash|fullHash|date|author|message
	format := "%h|%H|%aI|%an|%s"
	out, err := gitCmd(repoPath, "git", "log", "origin/"+branch,
		"--format="+format, "-n", strconv.Itoa(limit))
	if err != nil {
		return nil, fmt.Errorf("GetBlockCommits: git log: %w", err)
	}

	var commits []BlockCommit
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		if line == "" {
			continue
		}
		fields := strings.SplitN(line, "|", 5)
		if len(fields) < 5 {
			continue
		}
		commits = append(commits, BlockCommit{
			Hash:     fields[0],
			FullHash: fields[1],
			Date:     fields[2],
			Author:   fields[3],
			Message:  fields[4],
		})
	}
	return commits, nil
}

// ContributeBlockFromCommits publishes a new block version using define and build commit SHAs.
// This is the production path that matches the VSCode extension's worktree-based flow.
func (s *ProductService) ContributeBlockFromCommits(instanceName, defineCommitSha, buildCommitSha string, releaseLevel int32, releaseNotes string) (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}

	// Derive blockId from instanceName: "blocks/{blockId}/instances/{instanceId}"
	parts := strings.Split(instanceName, "/")
	if len(parts) < 2 {
		return "", fmt.Errorf("ContributeBlockFromCommits: unexpected instance name: %s", instanceName)
	}
	blockID := parts[1]

	req := marshalCreateBlockVersionFromCommitsRequest(blockID, instanceName, defineCommitSha, buildCommitSha, releaseLevel, releaseNotes)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlockVersionsService/CreateBlockVersion", req)
	if err != nil {
		return "", fmt.Errorf("ContributeBlockFromCommits: %w", err)
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("ContributeBlockFromCommits: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("ContributeBlockFromCommits: response too short (%d bytes)", len(body))
	}
	opName := parseStringField1(body[5:])
	if opName == "" {
		return "", fmt.Errorf("ContributeBlockFromCommits: empty operation name in response")
	}
	if _, err := s.pollOperation(ctx, "alis.bl.blocks.v1.BlocksService/GetOperation", opName); err != nil {
		return "", fmt.Errorf("ContributeBlockFromCommits: operation failed: %w", err)
	}
	return "blocks/" + blockID, nil
}

func marshalCreateBlockVersionFromCommitsRequest(blockID, instanceName, defineCommitSha, buildCommitSha string, releaseLevel int32, releaseNotes string) []byte {
	// BlockVersion.Source sub-message: f1=instance, f2=commit_sha
	marshalSource := func(inst, sha string) []byte {
		var b []byte
		b = protowire.AppendTag(b, 1, protowire.BytesType)
		b = protowire.AppendString(b, inst)
		b = protowire.AppendTag(b, 2, protowire.BytesType)
		b = protowire.AppendString(b, sha)
		return b
	}

	// BlockVersion: f5=define_source, f6=build_source, f4=release_notes, f9=release_level
	var bv []byte
	if defineCommitSha != "" {
		bv = protowire.AppendTag(bv, 5, protowire.BytesType)
		bv = protowire.AppendBytes(bv, marshalSource(instanceName, defineCommitSha))
	}
	if buildCommitSha != "" {
		bv = protowire.AppendTag(bv, 6, protowire.BytesType)
		bv = protowire.AppendBytes(bv, marshalSource(instanceName, buildCommitSha))
	}
	if releaseNotes != "" {
		bv = protowire.AppendTag(bv, 4, protowire.BytesType)
		bv = protowire.AppendString(bv, releaseNotes)
	}
	if releaseLevel != 0 {
		bv = protowire.AppendTag(bv, 9, protowire.VarintType)
		bv = protowire.AppendVarint(bv, uint64(releaseLevel))
	}

	// CreateBlockVersionRequest: f1=parent, f2=block_version
	var req []byte
	req = protowire.AppendTag(req, 1, protowire.BytesType)
	req = protowire.AppendString(req, "blocks/"+blockID)
	req = protowire.AppendTag(req, 2, protowire.BytesType)
	req = protowire.AppendBytes(req, bv)
	return req
}

// OpenWorktreeInFinder opens the given directory in the system file manager.
func (s *ProductService) OpenWorktreeInFinder(path string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", path)
	case "windows":
		cmd = exec.Command("explorer", path)
	default:
		cmd = exec.Command("xdg-open", path)
	}
	return cmd.Start()
}

// neuronVersionRoot derives ~/alis.build/{org}/build/{product}/{neuron}/{version} from a package string.
func neuronVersionRoot(pkg string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	p := strings.TrimPrefix(pkg, "packages/")
	parts := strings.SplitN(p, ".", 4)
	if len(parts) < 4 {
		return "", fmt.Errorf("invalid package: %s", pkg)
	}
	org, product, neuron, version := parts[0], parts[1], parts[2], parts[3]
	return filepath.Join(home, "alis.build", org, "build", product, neuron, version), nil
}

// neuronDefineRoot derives ~/alis.build/{org}/define/{org}/{product}/{neuron}/{version} from a package string.
func neuronDefineRoot(pkg string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	p := strings.TrimPrefix(pkg, "packages/")
	parts := strings.SplitN(p, ".", 4)
	if len(parts) < 4 {
		return "", fmt.Errorf("invalid package: %s", pkg)
	}
	org, product, neuron, version := parts[0], parts[1], parts[2], parts[3]
	return filepath.Join(home, "alis.build", org, "define", org, product, neuron, version), nil
}

// ScanNeuronFiles scans the local neuron version directory and returns build/infra files.
// Returns a soft error (NeuronScanResult.Error) when the path is missing or unreadable; no Go error.
func (s *ProductService) ScanNeuronFiles(neuronPackage string) (*NeuronScanResult, error) {
	versionRoot, err := neuronVersionRoot(neuronPackage)
	if err != nil {
		return &NeuronScanResult{Error: err.Error()}, nil
	}
	infraDir := filepath.Join(versionRoot, "infra")

	if _, err := os.Stat(versionRoot); os.IsNotExist(err) {
		return &NeuronScanResult{
			Package: neuronPackage,
			Error:   fmt.Sprintf("neuron not checked out locally — expected at %s", versionRoot),
		}, nil
	}

	skipDirs := map[string]bool{
		"node_modules": true, ".git": true, ".dart_tool": true,
		".symlinks": true, ".plugin_symlinks": true,
		".venv": true, "venv": true, "__pypackages__": true, "__pycache__": true,
	}

	var files []ScannedNeuronFile
	err = filepath.WalkDir(versionRoot, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			if path == versionRoot {
				return err // propagate root errors (e.g. EACCES); skip per-entry errors
			}
			return nil
		}
		if d.IsDir() {
			if skipDirs[d.Name()] {
				return filepath.SkipDir
			}
			return nil
		}
		rel, _ := filepath.Rel(versionRoot, path)
		if strings.HasPrefix(rel, "infra"+string(filepath.Separator)) {
			infraRel, _ := filepath.Rel(infraDir, path)
			files = append(files, ScannedNeuronFile{Path: infraRel, Category: "infra", Selected: true})
		} else {
			files = append(files, ScannedNeuronFile{Path: rel, Category: "build", Selected: true})
		}
		return nil
	})
	if err != nil {
		return &NeuronScanResult{Package: neuronPackage, Error: fmt.Sprintf("cannot scan neuron directory: %v", err)}, nil
	}

	// Append proto files from the define repo — optional, silently skip if not checked out.
	if defineRoot, derr := neuronDefineRoot(neuronPackage); derr == nil {
		if _, statErr := os.Stat(defineRoot); statErr == nil {
			_ = filepath.WalkDir(defineRoot, func(path string, d os.DirEntry, err error) error {
				if err != nil {
					return nil
				}
				if d.IsDir() {
					if skipDirs[d.Name()] {
						return filepath.SkipDir
					}
					return nil
				}
				rel, _ := filepath.Rel(defineRoot, path)
				files = append(files, ScannedNeuronFile{Path: rel, Category: "proto", Selected: true})
				return nil
			})
		}
	}

	return &NeuronScanResult{Package: neuronPackage, Files: files}, nil
}

func marshalBootstrapBlockRequest(p BootstrapBlockParams, accountName string) ([]byte, error) {
	versionRoot, err := neuronVersionRoot(p.Package)
	if err != nil {
		return nil, err
	}
	defineRoot, err := neuronDefineRoot(p.Package)
	if err != nil {
		return nil, err
	}
	infraDir := filepath.Join(versionRoot, "infra")
	buildPrefix := filepath.Clean(versionRoot) + string(filepath.Separator)
	infraPrefix := filepath.Clean(infraDir) + string(filepath.Separator)
	definePrefix := filepath.Clean(defineRoot) + string(filepath.Separator)

	marshalFile := func(relPath string, content []byte) []byte {
		var f []byte
		f = protowire.AppendTag(f, 1, protowire.BytesType)
		f = protowire.AppendString(f, relPath)
		f = protowire.AppendTag(f, 2, protowire.BytesType)
		f = protowire.AppendBytes(f, content)
		return f
	}

	// BlockVersion.Content: f1=build_files, f2=infra_files, f3=proto_files
	var content []byte
	for _, file := range p.Files {
		if !file.Selected {
			continue
		}
		var absPath, containmentPrefix string
		var fieldNum protowire.Number
		switch file.Category {
		case "build":
			absPath = filepath.Join(versionRoot, file.Path)
			containmentPrefix = buildPrefix
			fieldNum = 1
		case "infra":
			absPath = filepath.Join(infraDir, file.Path)
			containmentPrefix = infraPrefix
			fieldNum = 2
		case "proto":
			absPath = filepath.Join(defineRoot, file.Path)
			containmentPrefix = definePrefix
			fieldNum = 3
		default:
			continue
		}
		if !strings.HasPrefix(filepath.Clean(absPath)+string(filepath.Separator), containmentPrefix) {
			continue // skip paths that escaped their repo root
		}
		data, err := os.ReadFile(absPath)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", file.Path, err)
		}
		fileBytes := marshalFile(file.Path, data)
		content = protowire.AppendTag(content, fieldNum, protowire.BytesType)
		content = protowire.AppendBytes(content, fileBytes)
	}

	// Publisher sub-message: f1=account
	var publisher []byte
	if accountName != "" {
		publisher = protowire.AppendTag(publisher, 1, protowire.BytesType)
		publisher = protowire.AppendString(publisher, accountName)
	}

	// Block sub-message: f2=display_name, f13=tagline, f30=publisher
	var block []byte
	if p.DisplayName != "" {
		block = protowire.AppendTag(block, 2, protowire.BytesType)
		block = protowire.AppendString(block, p.DisplayName)
	}
	if p.Tagline != "" {
		block = protowire.AppendTag(block, 13, protowire.BytesType)
		block = protowire.AppendString(block, p.Tagline)
	}
	if len(publisher) > 0 {
		block = protowire.AppendTag(block, 30, protowire.BytesType)
		block = protowire.AppendBytes(block, publisher)
	}

	// BootstrapBlockRequest: f2=block, f3=block_id, f4=package, f5=contributed_content
	var req []byte
	req = protowire.AppendTag(req, 2, protowire.BytesType)
	req = protowire.AppendBytes(req, block)
	req = protowire.AppendTag(req, 3, protowire.BytesType)
	req = protowire.AppendString(req, p.BlockID)
	req = protowire.AppendTag(req, 4, protowire.BytesType)
	req = protowire.AppendString(req, p.Package)
	if len(content) > 0 {
		req = protowire.AppendTag(req, 5, protowire.BytesType)
		req = protowire.AppendBytes(req, content)
	}
	return req, nil
}

func (s *ProductService) BootstrapBlock(params BootstrapBlockParams) (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}
	accountName := s.myPrimaryAccountID()
	protoBytes, err := marshalBootstrapBlockRequest(params, accountName)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/BootstrapBlock", protoBytes)
	if err != nil {
		return "", fmt.Errorf("BootstrapBlock: %w", err)
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("BootstrapBlock: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("BootstrapBlock: response too short (%d bytes)", len(body))
	}
	// Response: BootstrapBlockResponse { f1: Block { f1: name (string) } }
	blockName := parseStringField1([]byte(parseStringFieldN(body[5:], 1)))
	if blockName == "" {
		return "", fmt.Errorf("BootstrapBlock: response contained no block name")
	}
	return blockName, nil
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
		// Use rundll32 to avoid cmd.exe treating & as a command separator,
		// which strips redirect_uri and other query parameters from OAuth URLs.
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
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

type emitWriter struct {
	emit func(string)
	mu   sync.Mutex
	buf  strings.Builder
}

func (w *emitWriter) Write(p []byte) (int, error) {
	w.emit(string(p))
	w.mu.Lock()
	w.buf.Write(p)
	w.mu.Unlock()
	return len(p), nil
}

func (w *emitWriter) output() string {
	w.mu.Lock()
	defer w.mu.Unlock()
	return strings.TrimSpace(w.buf.String())
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
			if out := ew.output(); out != "" {
				return "", fmt.Errorf("git clone: %w\n%s", err, out)
			}
			return "", fmt.Errorf("git clone: %w", err)
		}
		return "cloned", nil
	}

	if err := runGit("-C", dir, "fetch", remoteURL); err != nil {
		if out := ew.output(); out != "" {
			return "", fmt.Errorf("git fetch: %w\n%s", err, out)
		}
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

// parseCodeblocksResponse parses BlockDetails entries from RetrieveBlockDetails.
// The server uses field 1 for marketplace blocks and field 2 for the caller's own blocks,
// so we attempt to parse every bytes-type field as a BlockDetails message.
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
		_ = num
		cb := parseBlockDetails(b)
		if cb.Name != "" {
			blocks = append(blocks, cb)
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
			case 13:
				cb.Tagline = string(b)
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

// parseBlockOverviewInto fills overview fields from overview_details (f31).
// f1=banner_url, f2=hero_statement(headline), f3=description, f6=highlights, f7=key_features, f8=arch_layers, f10=short_title.
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
		case 6:
			cb.Highlights = append(cb.Highlights, string(b))
		case 7:
			cb.KeyFeatures = append(cb.KeyFeatures, parseTitleDescBytes(b))
		case 8:
			cb.CodeArchitecture = append(cb.CodeArchitecture, CodeblockLayer(parseTitleDescBytes(b)))
		case 10:
			if cb.Headline == "" {
				cb.Headline = string(b)
			}
		}
	}
}

// parseTitleDescBytes parses a proto message with f1=title, f2=description.
func parseTitleDescBytes(data []byte) CodeblockFeature {
	var f CodeblockFeature
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
			f.Title = string(b)
		case 2:
			f.Description = string(b)
		}
	}
	return f
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
			case 3, 7:
				// Both fields carry identical data (sub-field 1=Build, 2=Infra, 3=Proto).
				// Process only the first one encountered; skip the duplicate.
				if len(v.Files) > 0 {
					break
				}
				build, infra, proto := parseVersionAllFolders(b)
				if len(proto.Files) > 0 {
					v.Files = append(v.Files, proto)
				}
				if len(infra.Files) > 0 {
					v.Files = append(v.Files, infra)
				}
				if len(build.Files) > 0 {
					v.Files = append(v.Files, build)
				}
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

// parseVersionAllFolders extracts the three folder types from a block version container field.
// Sub-field 1 = Build files, sub-field 2 = Infra files, sub-field 3 = Proto files.
// The same container appears at both field 3 and field 7 of BlockVersion; callers should
// process only one of them.
func parseVersionAllFolders(data []byte) (build, infra, proto CodeblockFolder) {
	build.Name = "Build"
	infra.Name = "Infra"
	proto.Name = "Proto"
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
		entry := parseCodeblockFileEntry(b)
		if entry.Name == "" {
			continue
		}
		switch num {
		case 1:
			build.Files = append(build.Files, entry)
		case 2:
			infra.Files = append(infra.Files, entry)
		case 3:
			proto.Files = append(proto.Files, entry)
		}
	}
	return build, infra, proto
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

// GetWorkstationURI returns the web IDE URI for the current user's workstation.
// Returns "" (no error) if the workstation is still being provisioned or is unavailable.
func (s *ProductService) GetWorkstationURI() (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	dataFrame, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx,
		"alis.ws.controller.v1.WorkstationsService/RetrieveMyWorkstation", nil)
	if err != nil {
		return "", fmt.Errorf("RetrieveMyWorkstation: %w", err)
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("RetrieveMyWorkstation: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(dataFrame) < 5 {
		return "", fmt.Errorf("RetrieveMyWorkstation: empty response")
	}

	for {
		done, opName, uri := parseWorkstationOperation(dataFrame[5:])
		if done {
			return uri, nil
		}
		if opName == "" {
			return "", nil // provisioning but no op name to poll with
		}
		select {
		case <-ctx.Done():
			return "", nil // still provisioning after timeout
		case <-time.After(time.Second):
		}
		dataFrame, grpcStatus, grpcMsg, err = s.doConsoleGRPCWeb(ctx,
			"google.longrunning.Operations/GetOperation", marshalGetOperationRequest(opName))
		if err != nil {
			return "", fmt.Errorf("GetOperation: %w", err)
		}
		if grpcStatus != 0 {
			return "", fmt.Errorf("GetOperation: grpc %d: %s", grpcStatus, grpcMsg)
		}
		if len(dataFrame) < 5 {
			return "", fmt.Errorf("GetOperation: empty response")
		}
	}
}

// OpenInIDE opens the product in the specified IDE.
// ide must be "web", "vscode", or "cursor".
// productName is the full resource name, e.g. "organisations/voyage/products/vp".
func (s *ProductService) OpenInIDE(productName, ide string) error {
	switch ide {
	case "vscode":
		openBrowserURL("vscode://AlisExchange.alis-build/" + productName)
		return nil
	case "cursor":
		openBrowserURL("cursor://AlisExchange.alis-build/" + productName)
		return nil
	case "web":
		uri, err := s.GetWorkstationURI()
		if err != nil {
			return fmt.Errorf("get workstation: %w", err)
		}
		if uri == "" {
			return fmt.Errorf("workstation not yet available")
		}
		openBrowserURL(uri + "?product=" + productName)
		return nil
	default:
		return fmt.Errorf("unknown IDE %q", ide)
	}
}

// parseWorkstationOperation parses a google.longrunning.Operation for RetrieveMyWorkstation.
// Field 1=name, Field 3=done (varint bool), Field 5=response (google.protobuf.Any).
func parseWorkstationOperation(b []byte) (done bool, opName, uri string) {
	for len(b) > 0 {
		num, typ, n := protowire.ConsumeTag(b)
		if n < 0 {
			break
		}
		b = b[n:]
		switch typ {
		case protowire.VarintType:
			v, m := protowire.ConsumeVarint(b)
			if m < 0 {
				return
			}
			b = b[m:]
			if num == 3 {
				done = v != 0
			}
		case protowire.BytesType:
			val, m := protowire.ConsumeBytes(b)
			if m < 0 {
				return
			}
			b = b[m:]
			switch num {
			case 1:
				opName = string(val)
			case 5:
				uri = parseWorkstationAny(val)
			}
		default:
			m := protowire.ConsumeFieldValue(num, typ, b)
			if m < 0 {
				return
			}
			b = b[m:]
		}
	}
	return
}

// parseWorkstationAny unwraps a google.protobuf.Any and reads field 1 (uri) from
// RetrieveMyWorkstationResponse (Any.value field 2 holds the inner message bytes).
func parseWorkstationAny(anyBytes []byte) string {
	var valueBytes []byte
	for len(anyBytes) > 0 {
		num, typ, n := protowire.ConsumeTag(anyBytes)
		if n < 0 {
			break
		}
		anyBytes = anyBytes[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, anyBytes)
			if m < 0 {
				break
			}
			anyBytes = anyBytes[m:]
			continue
		}
		val, m := protowire.ConsumeBytes(anyBytes)
		if m < 0 {
			break
		}
		anyBytes = anyBytes[m:]
		if num == 2 {
			valueBytes = val
			break
		}
	}
	for len(valueBytes) > 0 {
		num, typ, n := protowire.ConsumeTag(valueBytes)
		if n < 0 {
			break
		}
		valueBytes = valueBytes[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, valueBytes)
			if m < 0 {
				break
			}
			valueBytes = valueBytes[m:]
			continue
		}
		val, m := protowire.ConsumeBytes(valueBytes)
		if m < 0 {
			break
		}
		valueBytes = valueBytes[m:]
		if num == 1 {
			return string(val)
		}
	}
	return ""
}

// SwitchEnvironment rewrites the local .alis/.env file to match the output
// produced by the Alis VSCode extension when switching environments.
func (s *ProductService) SwitchEnvironment(org, product, envName, projectID, projectNumber, region string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("home dir: %w", err)
	}

	envParts := strings.Split(envName, "/")
	envID := envParts[len(envParts)-1]

	alisDir := filepath.Join(home, "alis.build", org, "build", product, ".alis")
	envFilePath := filepath.Join(alisDir, ".env")
	keyFilePath := filepath.Join(alisDir, "key.json")

	vars, err := s.retrieveDeploymentEnvs(envName)
	if err != nil {
		return fmt.Errorf("retrieve deployment envs: %w", err)
	}

	var managed, nonManaged []DeploymentEnvVar
	for _, v := range vars {
		if v.Managed {
			managed = append(managed, v)
		} else {
			nonManaged = append(nonManaged, v)
		}
	}
	sort.Slice(managed, func(i, j int) bool { return managed[i].Name > managed[j].Name })
	sort.Slice(nonManaged, func(i, j int) bool { return nonManaged[i].Name > nonManaged[j].Name })

	builderURL := fmt.Sprintf("https://console.alisx.com/build/landing-zone/%s/%s/environments/%s/variables", org, product, envID)

	var sb strings.Builder
	sb.WriteString("# Alis Build Managed\n")
	for _, v := range managed {
		sb.WriteString(v.Name)
		sb.WriteString(`="`)
		sb.WriteString(v.Value)
		sb.WriteString("\"\n")
	}
	sb.WriteString("\n# Local Authentication\n")
	sb.WriteString(`GOOGLE_APPLICATION_CREDENTIALS="`)
	sb.WriteString(keyFilePath)
	sb.WriteString("\"\n")
	sb.WriteString("\n# Builder Managed via the Alis Build Console at ")
	sb.WriteString(builderURL)
	sb.WriteByte('\n')
	for _, v := range nonManaged {
		sb.WriteString(v.Name)
		sb.WriteString(`="`)
		sb.WriteString(v.Value)
		sb.WriteString("\"\n")
	}

	if err := os.MkdirAll(alisDir, 0755); err != nil {
		return fmt.Errorf("mkdir alis dir: %w", err)
	}
	return os.WriteFile(envFilePath, []byte(sb.String()), 0644)
}

// ── Account users (for IAM pickers) ──────────────────────────────────────────

type AccountUser struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	Email       string `json:"email"`
	PhotoURL    string `json:"photoUrl"`
}

// ListAccountUsers returns all users in the caller's primary account, used to
// populate IAM member pickers.
func (s *ProductService) ListAccountUsers() ([]AccountUser, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	accountID := s.myPrimaryAccountID()
	if accountID == "" {
		return nil, fmt.Errorf("ListAccountUsers: could not determine account")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var req []byte
	req = protowire.AppendTag(req, 1, protowire.BytesType)
	req = protowire.AppendString(req, accountID)

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.accounts.v1.AccountsService/RetrieveMaskedUsers", req)
	if err != nil {
		return nil, fmt.Errorf("ListAccountUsers: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListAccountUsers: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListAccountUsers: response too short")
	}

	raw := parseBatchUsersResponse(body[5:])
	result := make([]AccountUser, 0, len(raw))
	for _, u := range raw {
		displayName := strings.TrimSpace(u.FirstName + " " + u.LastName)
		if displayName == "" {
			displayName = u.Email
		}
		if u.Name == "" {
			continue
		}
		result = append(result, AccountUser{
			Name:        u.Name,
			DisplayName: displayName,
			Email:       u.Email,
			PhotoURL:    u.PhotoURL,
		})
	}
	return result, nil
}

// ── Block IAM access ──────────────────────────────────────────────────────────

type BlockRole struct {
	Name  string `json:"name"`
	Title string `json:"title"`
}

// ListBlockRoles returns the IAM roles available for a block via RolesService/ListRoles.
// Role proto: field 1 = name, field 5 = title.
func (s *ProductService) ListBlockRoles(blockId string) ([]BlockRole, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var req []byte
	req = protowire.AppendTag(req, 1, protowire.BytesType)
	req = protowire.AppendString(req, "blocks/"+blockId)

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.iam.v1.RolesService/ListRoles", req)
	if err != nil {
		return nil, fmt.Errorf("ListBlockRoles: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListBlockRoles: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListBlockRoles: response too short")
	}

	return parseBlockRoles(body[5:]), nil
}

// parseBlockRoles parses the outer ListRolesResponse (field 1 = repeated Role message).
// Each Role: field 1 = name (string), field 5 = title (string).
func parseBlockRoles(data []byte) []BlockRole {
	var roles []BlockRole
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
			if num == 1 {
				roles = append(roles, parseBlockRole(b))
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
	return roles
}

func parseBlockRole(data []byte) BlockRole {
	var r BlockRole
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
				r.Name = string(b)
			case 5:
				r.Title = string(b)
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
	return r
}

type BlockAccessMember struct {
	Member      string `json:"member"`
	DisplayName string `json:"displayName"`
	Email       string `json:"email"`
	PhotoURL    string `json:"photoUrl"`
	Role        string `json:"role"`
	RoleLabel   string `json:"roleLabel"`
}

type BlockAccessData struct {
	Members []BlockAccessMember `json:"members"`
}

// GetBlockAccessData fetches the IAM policy for a block and enriches each member with user details.
func (s *ProductService) GetBlockAccessData(blockId string) (*BlockAccessData, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var req []byte
	req = protowire.AppendTag(req, 1, protowire.BytesType)
	req = protowire.AppendString(req, "blocks/"+blockId)

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/GetIamPolicy", req)
	if err != nil {
		return nil, fmt.Errorf("GetBlockAccessData: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("GetBlockAccessData: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("GetBlockAccessData: response too short")
	}

	bindings := parseIamPolicy(body[5:])

	userIDs := map[string]struct{}{}
	for _, b := range bindings {
		for _, m := range b.Members {
			if strings.HasPrefix(m, "user:") {
				userIDs[strings.TrimPrefix(m, "user:")] = struct{}{}
			}
		}
	}

	userMap := map[string]iamUser{}
	if len(userIDs) > 0 {
		var buf []byte
		for id := range userIDs {
			buf = protowire.AppendTag(buf, 1, protowire.BytesType)
			buf = protowire.AppendString(buf, "users/"+id)
		}
		resp, st, _, batchErr := s.doConsoleGRPCWeb(ctx, "alis.os.iam.v2.UsersService/BatchRetrieveMaskedUsers", buf)
		if batchErr == nil && st == 0 && len(resp) >= 5 {
			for _, u := range parseBatchUsersResponse(resp[5:]) {
				userMap[strings.TrimPrefix(u.Name, "users/")] = u
			}
		}
	}

	result := &BlockAccessData{Members: []BlockAccessMember{}}
	for _, binding := range bindings {
		roleLabel := blockRoleLabel(binding.Role)
		for _, m := range binding.Members {
			am := BlockAccessMember{Member: m, Role: binding.Role, RoleLabel: roleLabel}
			if strings.HasPrefix(m, "user:") {
				id := strings.TrimPrefix(m, "user:")
				u := userMap[id]
				am.DisplayName = strings.TrimSpace(u.FirstName + " " + u.LastName)
				am.Email = u.Email
				am.PhotoURL = u.PhotoURL
				if am.DisplayName == "" {
					am.DisplayName = u.Email
				}
				if am.DisplayName == "" {
					am.DisplayName = id
				}
			} else {
				am.DisplayName = m
			}
			result.Members = append(result.Members, am)
		}
	}
	return result, nil
}

// UpdateBlockAccess adds or removes a single member from a role on a block's IAM policy.
// member must be in "user:ID" IAM form. grant=true to add, grant=false to remove.
func (s *ProductService) UpdateBlockAccess(blockId, role, member string, grant bool) error {
	if err := s.initTokens(); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var getReq []byte
	getReq = protowire.AppendTag(getReq, 1, protowire.BytesType)
	getReq = protowire.AppendString(getReq, "blocks/"+blockId)

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/GetIamPolicy", getReq)
	if err != nil {
		return fmt.Errorf("UpdateBlockAccess/GetIamPolicy: %w", err)
	}
	if grpcStatus != 0 {
		return fmt.Errorf("UpdateBlockAccess/GetIamPolicy: grpc %d: %s", grpcStatus, grpcMsg)
	}

	var bindings []iamBinding
	var etag []byte
	if len(body) >= 5 {
		bindings, etag = parseIamPolicyFull(body[5:])
	}

	if grant {
		bindings = blockAddMember(bindings, role, member)
	} else {
		bindings = blockRemoveMember(bindings, role, member)
	}

	policyBytes := marshalBlockIamPolicy(bindings, etag)
	var setReq []byte
	setReq = protowire.AppendTag(setReq, 1, protowire.BytesType)
	setReq = protowire.AppendString(setReq, "blocks/"+blockId)
	setReq = protowire.AppendTag(setReq, 2, protowire.BytesType)
	setReq = protowire.AppendBytes(setReq, policyBytes)

	_, grpcStatus, grpcMsg, err = s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/SetIamPolicy", setReq)
	if err != nil {
		return fmt.Errorf("UpdateBlockAccess/SetIamPolicy: %w", err)
	}
	if grpcStatus != 0 {
		return fmt.Errorf("UpdateBlockAccess/SetIamPolicy: grpc %d: %s", grpcStatus, grpcMsg)
	}
	return nil
}

func blockRoleLabel(role string) string {
	switch role {
	case "roles/block.admin":
		return "Admin"
	case "roles/block.developer":
		return "Developer"
	case "roles/block.viewer":
		return "Viewer"
	default:
		r := strings.TrimPrefix(role, "roles/block.")
		if r == role {
			r = strings.TrimPrefix(role, "roles/")
		}
		if len(r) == 0 {
			return role
		}
		return strings.ToUpper(r[:1]) + r[1:]
	}
}

// parseIamPolicyFull extracts both bindings (field 4) and etag (field 3) from a Policy proto.
func parseIamPolicyFull(data []byte) ([]iamBinding, []byte) {
	var bindings []iamBinding
	var etag []byte
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
			case 3:
				etag = append([]byte(nil), b...)
			case 4:
				bindings = append(bindings, parseIamBinding(b))
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
	return bindings, etag
}

func marshalBlockIamPolicy(bindings []iamBinding, etag []byte) []byte {
	var buf []byte
	if len(etag) > 0 {
		buf = protowire.AppendTag(buf, 3, protowire.BytesType)
		buf = protowire.AppendBytes(buf, etag)
	}
	for _, b := range bindings {
		var bindBuf []byte
		bindBuf = protowire.AppendTag(bindBuf, 1, protowire.BytesType)
		bindBuf = protowire.AppendString(bindBuf, b.Role)
		for _, m := range b.Members {
			bindBuf = protowire.AppendTag(bindBuf, 2, protowire.BytesType)
			bindBuf = protowire.AppendString(bindBuf, m)
		}
		buf = protowire.AppendTag(buf, 4, protowire.BytesType)
		buf = protowire.AppendBytes(buf, bindBuf)
	}
	return buf
}

func blockAddMember(bindings []iamBinding, role, member string) []iamBinding {
	for i, b := range bindings {
		if b.Role == role {
			for _, m := range b.Members {
				if m == member {
					return bindings
				}
			}
			bindings[i].Members = append(bindings[i].Members, member)
			return bindings
		}
	}
	return append(bindings, iamBinding{Role: role, Members: []string{member}})
}

func blockRemoveMember(bindings []iamBinding, role, member string) []iamBinding {
	result := make([]iamBinding, 0, len(bindings))
	for _, b := range bindings {
		if b.Role == role {
			var filtered []string
			for _, m := range b.Members {
				if m != member {
					filtered = append(filtered, m)
				}
			}
			if len(filtered) > 0 {
				result = append(result, iamBinding{Role: b.Role, Members: filtered})
			}
		} else {
			result = append(result, b)
		}
	}
	return result
}
