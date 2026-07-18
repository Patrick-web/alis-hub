package main

import (
	"alis-hub-v3/internal/alisclient"
	"context"
	"encoding/base64"
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
	dataFrame, grpcStatus, grpcMessage, err := alisclient.DecodeGRPCWebTextFrames(rawBody)
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
		hideWindow(cmd)
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
