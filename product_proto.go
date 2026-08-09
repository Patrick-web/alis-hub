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

// gitHostAuthArgs returns the "-c" flag pairs to authenticate git commands
// against remoteURL: the system credential helper for GitHub (which won't
// accept an Alis credential), or the alis CLI's credential helper for every
// other host (e.g. Forgejo).
//
// The empty http.extraHeader= clears any value inherited from an include.path,
// left by the old VS Code extension or by a build of this app that predates the
// CLI cutover. Those includes carry a token nothing refreshes any more, and git
// sends every matching header, so leaving one attached makes the server reject
// the request over the dead header even though the helper supplied a good
// credential.
func gitHostAuthArgs(remoteURL string) []string {
	if strings.Contains(remoteURL, "github.com") {
		return []string{"-c", "credential.helper=" + systemCredentialHelper()}
	}
	return append([]string{"-c", "http.extraHeader="}, gitCredentialArgs()...)
}

func syncOneRepo(dir, remoteURL string, emit func(string)) (string, error) {
	gitEnv := noPromptEnv()
	ew := &emitWriter{emit: emit}

	baseArgs := gitHostAuthArgs(remoteURL)

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
