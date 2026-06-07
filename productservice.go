package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

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
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	Description string `json:"description"`
	Logo        string `json:"logo"`
	Account     string `json:"account"`
}

type LandingZonesData struct {
	Own    []Organisation `json:"own"`
	Shared []Organisation `json:"shared"`
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
	GCPProject  *GCPProject `json:"gcpProject,omitempty"`
}

type EnvVariable struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

type ProductService struct {
	tokens *ConsoleTokenSource
	mu     sync.Mutex
}

func NewProductService() *ProductService {
	return &ProductService{}
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
	fields := []string{"name", "display_name", "google_project", "state"}
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

// CreateEnvironment creates a new environment under the given org/product.
// envType: 1=DEV, 2=STAGING, 3=PROD
func (s *ProductService) CreateEnvironment(org, product, displayName string, envType int32) (*EnvInfo, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	parent := fmt.Sprintf("organisations/%s/products/%s", org, product)

	// Build environment sub-message: field 2=displayName, field 7=type
	var envBuf []byte
	envBuf = protowire.AppendTag(envBuf, 2, protowire.BytesType)
	envBuf = protowire.AppendString(envBuf, displayName)
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
			if num == 21 {
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
