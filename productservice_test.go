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
	"regexp"
	"strings"
	"testing"
	"time"

	"google.golang.org/protobuf/encoding/protowire"
)

// TestProbeRaw makes a raw HTTP request to console.alisx.com and prints the full
// response — status, headers, body — so we can diagnose auth issues without
// launching the Wails app.
func TestProbeRaw(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}

	credsPath := filepath.Join(home, ".alis/credentials.json")
	data, err := os.ReadFile(credsPath)
	if err != nil {
		t.Skipf("no credentials at %s: %v", credsPath, err)
	}

	var creds struct {
		AccessToken  string    `json:"access_token"`
		IDToken      string    `json:"id_token"`
		RefreshToken string    `json:"refresh_token"`
		Expiry       time.Time `json:"expiry"`
		TokenType    string    `json:"token_type"`
	}
	if err := json.Unmarshal(data, &creds); err != nil {
		t.Fatalf("parse credentials: %v", err)
	}

	t.Logf("access_token length: %d", len(creds.AccessToken))
	t.Logf("id_token length:     %d", len(creds.IDToken))
	t.Logf("token_type:          %s", creds.TokenType)
	t.Logf("expiry:              %s", creds.Expiry)
	if creds.AccessToken != "" {
		t.Logf("access_token prefix: %s", creds.AccessToken[:min(40, len(creds.AccessToken))])
	}
	if creds.IDToken != "" {
		t.Logf("id_token prefix:     %s", creds.IDToken[:min(40, len(creds.IDToken))])
	}

	// Try each token variant in order.
	tokens := []struct {
		label string
		value string
	}{
		{"access_token", creds.AccessToken},
		{"id_token", creds.IDToken},
	}

	for _, tok := range tokens {
		if tok.value == "" {
			t.Logf("[%s] empty — skipping", tok.label)
			continue
		}
		t.Logf("--- trying %s ---", tok.label)
		status, headers, body := probeConsole(t, tok.value)
		t.Logf("HTTP status: %d", status)
		for k, vs := range headers {
			t.Logf("  header %s: %s", k, strings.Join(vs, ", "))
		}
		t.Logf("body (%d bytes): %q", len(body), truncate(body, 400))
	}
}

// TestGetProductOverviewLive calls the real API with the real credentials.
func TestGetProductOverviewLive(t *testing.T) {
	svc := NewProductService()
	ts, err := NewConsoleTokenSource()
	if err != nil {
		t.Skipf("no console credentials: %v (run ProductService.Login() first)", err)
	}
	svc.tokens = ts

	ov, err := svc.GetProductOverview("voyage", "vp")
	if err != nil {
		t.Fatalf("GetProductOverview: %v", err)
	}

	t.Logf("Name:        %s", ov.Name)
	t.Logf("DisplayName: %s", ov.DisplayName)
	t.Logf("State:       %d", ov.State)
	if ov.GoogleProject != nil {
		t.Logf("Project.ID:     %s", ov.GoogleProject.ID)
		t.Logf("Project.Number: %s", ov.GoogleProject.Number)
		t.Logf("Project.Region: %s", ov.GoogleProject.Region)
		t.Logf("Project.Managed: %v", ov.GoogleProject.ManagedBillingAccount)
	}
	if ov.GitRepo != nil {
		t.Logf("GitRepo.RemoteURI:   %s", ov.GitRepo.RemoteURI)
		t.Logf("GitRepo.CloudRunURI: %s", ov.GitRepo.CloudRunURI)
	}
	if ov.PackageRegistries != nil {
		t.Logf("Pkgs.Go:   %s", ov.PackageRegistries.Go)
		t.Logf("Pkgs.JS:   %s", ov.PackageRegistries.JavaScript)
		t.Logf("Pkgs.Py:   %s", ov.PackageRegistries.Python)
	}
}

// TestListLandingZonesLive calls the real ListOrganisations API and prints own vs shared orgs.
func TestListLandingZonesLive(t *testing.T) {
	svc := NewProductService()
	ts, err := NewConsoleTokenSource()
	if err != nil {
		t.Skipf("no console credentials: %v (run ProductService.Login() first)", err)
	}
	svc.tokens = ts

	data, err := svc.ListLandingZones()
	if err != nil {
		t.Fatalf("ListLandingZones: %v", err)
	}

	t.Logf("Own orgs (%d):", len(data.Own))
	for _, o := range data.Own {
		t.Logf("  %-30s account=%-20s desc=%s", o.DisplayName, o.Account, o.Description)
	}
	t.Logf("Shared orgs (%d):", len(data.Shared))
	for _, o := range data.Shared {
		t.Logf("  %-30s account=%-20s desc=%s", o.DisplayName, o.Account, o.Description)
	}
}

// TestListEnvironmentsLive calls the real ListEnvironments API.
func TestListEnvironmentsLive(t *testing.T) {
	svc := NewProductService()
	ts, err := NewConsoleTokenSource()
	if err != nil {
		t.Skipf("no console credentials: %v (run ProductService.Login() first)", err)
	}
	svc.tokens = ts
	envs, err := svc.ListEnvironments("voyage", "vp")
	if err != nil {
		t.Fatalf("ListEnvironments: %v", err)
	}

	t.Logf("Found %d environments", len(envs))
	for _, env := range envs {
		t.Logf("  %-20s state=%d  project=%s", env.DisplayName, env.State,
			func() string {
				if env.GCPProject != nil {
					return env.GCPProject.ID
				}
				return "(none)"
			}(),
		)
	}
}

// TestAuthMethods tries different ways to authenticate to console.alisx.com.
func TestAuthMethods(t *testing.T) {
	home, _ := os.UserHomeDir()
	data, err := os.ReadFile(filepath.Join(home, ".alis/credentials.json"))
	if err != nil {
		t.Skip("no credentials")
	}

	var creds struct {
		AccessToken  string `json:"access_token"`
		IDToken      string `json:"id_token"`
		RefreshToken string `json:"refresh_token"`
	}
	json.Unmarshal(data, &creds)

	// 1. Try refreshing to get an id_token from identity.alisx.com
	if creds.RefreshToken != "" {
		t.Log("--- refreshing token via identity.alisx.com ---")
		refreshed := doRefresh(t, creds.RefreshToken)
		t.Logf("refresh response keys:")
		for k, v := range refreshed {
			if s, ok := v.(string); ok {
				t.Logf("  %s: %d chars (prefix: %s)", k, len(s), truncateStr(s, 30))
			} else {
				t.Logf("  %s: %v", k, v)
			}
		}

		if idTok, _ := refreshed["id_token"].(string); idTok != "" {
			t.Log("--- trying id_token as cookie alis_id_token_fvc ---")
			status, hdrs, body := probeConsoleWithCookie(t, "alis_id_token_fvc", idTok)
			t.Logf("status: %d  body: %q", status, truncate(body, 200))
			t.Logf("grpc-status header: %s", hdrs.Get("grpc-status"))

			t.Log("--- trying id_token as Bearer ---")
			status, _, body = probeConsoleWithBearer(t, idTok)
			t.Logf("status: %d  body: %q", status, truncate(body, 200))
		}

		if accTok, _ := refreshed["access_token"].(string); accTok != "" {
			t.Log("--- trying refreshed access_token as cookie alis_access_token_fvc ---")
			status, _, body := probeConsoleWithCookie(t, "alis_access_token_fvc", accTok)
			t.Logf("status: %d  body: %q", status, truncate(body, 200))
		}
	}

	// 2. Try the stored access_token as a cookie
	if creds.AccessToken != "" {
		t.Log("--- trying stored access_token as cookie alis_access_token_fvc ---")
		status, _, body := probeConsoleWithCookie(t, "alis_access_token_fvc", creds.AccessToken)
		t.Logf("status: %d  body: %q", status, truncate(body, 200))
	}
}

// --- helpers ---

func buildGRPCWebFrame(t *testing.T) string {
	t.Helper()
	name := "organisations/voyage/products/vp"
	var pb []byte
	pb = protowire.AppendTag(pb, 1, protowire.BytesType)
	pb = protowire.AppendString(pb, name)
	frame := make([]byte, 5+len(pb))
	frame[0] = 0
	frame[1] = byte(len(pb) >> 24)
	frame[2] = byte(len(pb) >> 16)
	frame[3] = byte(len(pb) >> 8)
	frame[4] = byte(len(pb))
	copy(frame[5:], pb)
	return base64.StdEncoding.EncodeToString(frame)
}

func probeConsoleWithBearer(t *testing.T, token string) (int, http.Header, []byte) {
	t.Helper()
	req, _ := http.NewRequest("POST",
		"https://console.alisx.com/alis.os.products.v1.ProductsService/GetProduct",
		strings.NewReader(buildGRPCWebFrame(t)))
	req.Header.Set("Content-Type", "application/grpc-web-text")
	req.Header.Set("Accept", "application/grpc-web-text")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("x-grpc-web", "1")
	return doProbe(t, req)
}

func probeConsoleWithCookie(t *testing.T, name, value string) (int, http.Header, []byte) {
	t.Helper()
	req, _ := http.NewRequest("POST",
		"https://console.alisx.com/alis.os.products.v1.ProductsService/GetProduct",
		strings.NewReader(buildGRPCWebFrame(t)))
	req.Header.Set("Content-Type", "application/grpc-web-text")
	req.Header.Set("Accept", "application/grpc-web-text")
	req.Header.Set("x-grpc-web", "1")
	req.AddCookie(&http.Cookie{Name: name, Value: value})
	return doProbe(t, req)
}

func probeConsole(t *testing.T, token string) (int, http.Header, []byte) {
	return probeConsoleWithBearer(t, token)
}

func doProbe(t *testing.T, req *http.Request) (int, http.Header, []byte) {
	t.Helper()
	client := &http.Client{
		Timeout: 15 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse // don't follow redirects
		},
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, resp.Header, body
}

func doRefresh(t *testing.T, refreshToken string) map[string]any {
	t.Helper()
	form := "grant_type=refresh_token&refresh_token=" + refreshToken
	req, _ := http.NewRequest("POST", "https://identity.alisx.com/token",
		strings.NewReader(form))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}
	defer resp.Body.Close()
	var result map[string]any
	json.NewDecoder(resp.Body).Decode(&result)
	return result
}

func truncateStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func truncate(b []byte, n int) []byte {
	if len(b) <= n {
		return b
	}
	return append(b[:n], []byte("…")...)
}

// TestDebugGetProduct inspects the raw binary frame from GetProduct.
func TestDebugGetProduct(t *testing.T) {
	svc := NewProductService()
	ts, err := NewConsoleTokenSource()
	if err != nil {
		t.Skipf("no console credentials")
	}
	svc.tokens = ts

	cookieHdr, _ := ts.CookieHeader()

	// Build request
	name := "organisations/voyage/products/vp"
	fields := []string{"name", "display_name", "state", "google_project", "git_repo", "internal_package_registries", "docker_registries"}
	protoBytes := marshalGetProductRequest(name, fields)

	frame := make([]byte, 5+len(protoBytes))
	frame[0] = 0
	frame[1] = byte(len(protoBytes) >> 24)
	frame[2] = byte(len(protoBytes) >> 16)
	frame[3] = byte(len(protoBytes) >> 8)
	frame[4] = byte(len(protoBytes))
	copy(frame[5:], protoBytes)
	encoded := base64.StdEncoding.EncodeToString(frame)

	req, _ := http.NewRequest("POST",
		"https://console.alisx.com/alis.os.products.v1.ProductsService/GetProduct",
		strings.NewReader(encoded))
	req.Header.Set("Content-Type", "application/grpc-web-text")
	req.Header.Set("Accept", "application/grpc-web-text")
	req.Header.Set("Cookie", cookieHdr)
	req.Header.Set("x-grpc-web", "1")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	rawBody, _ := io.ReadAll(resp.Body)
	t.Logf("HTTP %d, body len=%d", resp.StatusCode, len(rawBody))

	// Strip and decode
	clean := strings.Map(func(r rune) rune {
		switch r {
		case '\n', '\r', ' ', '\t', '=':
			return -1
		}
		return r
	}, string(rawBody))
	decoded, err := base64.RawStdEncoding.DecodeString(clean)
	if err != nil {
		t.Fatalf("base64 decode: %v", err)
	}
	t.Logf("decoded len=%d", len(decoded))
	t.Logf("first 40 bytes (hex): %x", decoded[:min(40, len(decoded))])

	// Try parseProduct directly on the payload
	if len(decoded) >= 5 {
		length := int(decoded[1])<<24 | int(decoded[2])<<16 | int(decoded[3])<<8 | int(decoded[4])
		if len(decoded) >= 5+length {
			payload := decoded[5 : 5+length]
			p, err := parseProduct(payload)
			if err != nil {
				t.Logf("parseProduct error: %v", err)
			} else {
				t.Logf("parseProduct result: Name=%q DisplayName=%q State=%d", p.Name, p.DisplayName, p.State)
				if p.GoogleProject != nil { t.Logf("  GoogleProject.ID=%q Region=%q", p.GoogleProject.ID, p.GoogleProject.Region) }
				if p.GitRepo != nil { t.Logf("  GitRepo.RemoteURI=%q", p.GitRepo.RemoteURI) }
				if p.PackageRegistries != nil { t.Logf("  Pkgs.Go=%q", p.PackageRegistries.Go) }
			}
		}
	}

	// Parse all top-level fields from the payload
	if len(decoded) >= 5 {
		flags := decoded[0]
		length := int(decoded[1])<<24 | int(decoded[2])<<16 | int(decoded[3])<<8 | int(decoded[4])
		t.Logf("frame: flags=%d length=%d", flags, length)
		if len(decoded) >= 5+length {
			payload := decoded[5 : 5+length]
			t.Logf("scanning %d bytes of payload for top-level fields:", len(payload))
			data := payload
			for len(data) > 0 {
				num, typ, n := protowire.ConsumeTag(data)
				if n < 0 {
					break
				}
				data = data[n:]
				switch typ {
				case protowire.VarintType:
					v, m := protowire.ConsumeVarint(data)
					if m < 0 { break }
					t.Logf("  field %d (varint) = %d", num, v)
					data = data[m:]
				case protowire.BytesType:
					b, m := protowire.ConsumeBytes(data)
					if m < 0 { break }
					printable := true
					for _, c := range b {
						if c < 32 && c != '\n' && c != '\r' { printable = false; break }
					}
					if printable && len(b) < 100 {
						t.Logf("  field %d (bytes, %d) = %q", num, len(b), string(b))
					} else {
						t.Logf("  field %d (bytes, %d) = %x...", num, len(b), b[:min(20, len(b))])
					}
					data = data[m:]
				default:
					m := protowire.ConsumeFieldValue(num, typ, data)
					if m < 0 { break }
					t.Logf("  field %d (type %d, skip %d bytes)", num, typ, m)
					data = data[m:]
				}
			}
		}
	}
}

// TestProbeGetEnvironment dumps raw proto fields from GetEnvironment to discover variables.
func TestProbeGetEnvironment(t *testing.T) {
	svc := NewProductService()
	ts, err := NewConsoleTokenSource()
	if err != nil {
		t.Skipf("no console credentials: %v", err)
	}
	svc.tokens = ts

	envs, err := svc.ListEnvironments("voyage", "vp")
	if err != nil || len(envs) == 0 {
		t.Skipf("ListEnvironments: %v", err)
	}

	for _, env := range envs {
		t.Logf("=== Probing environment: %s (%s) ===", env.DisplayName, env.Name)

		// Try GetEnvironment with broad field masks
		for _, fields := range [][]string{
			{"name", "display_name", "state", "google_project", "variables", "env_variables", "environment_variables"},
			{"name", "variables"},
			nil, // no field mask = all fields
		} {
			var buf []byte
			buf = protowire.AppendTag(buf, 1, protowire.BytesType)
			buf = protowire.AppendString(buf, env.Name)
			if len(fields) > 0 {
				fm := marshalFieldMask(fields)
				buf = protowire.AppendTag(buf, 2, protowire.BytesType)
				buf = protowire.AppendBytes(buf, fm)
			}

			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			body, grpcStatus, grpcMsg, reqErr := svc.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/GetEnvironment", buf)
			cancel()

			t.Logf("  fields=%v → grpcStatus=%d grpcMsg=%q bodyLen=%d reqErr=%v", fields, grpcStatus, grpcMsg, len(body), reqErr)
			if reqErr != nil || grpcStatus != 0 || len(body) < 5 {
				continue
			}

			// Dump all top-level proto fields
			data := body[5:]
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
						break
					}
					t.Logf("    field %d (varint) = %d", num, v)
					data = data[m:]
				case protowire.BytesType:
					b, m := protowire.ConsumeBytes(data)
					if m < 0 {
						break
					}
					printable := true
					for _, c := range b {
						if c < 32 && c != '\n' && c != '\r' {
							printable = false
							break
						}
					}
					if printable && len(b) < 200 {
						t.Logf("    field %d (string, %d) = %q", num, len(b), string(b))
					} else {
						t.Logf("    field %d (bytes, %d) hex=%x", num, len(b), b[:min(30, len(b))])
					}
					data = data[m:]
				default:
					m := protowire.ConsumeFieldValue(num, typ, data)
					if m < 0 {
						break
					}
					t.Logf("    field %d (type %d, skip %d)", num, typ, m)
					data = data[m:]
				}
			}
		}
		break // just probe the first environment
	}
}

// TestProbeListEnvironmentsAllFields lists environments with all fields to discover variables.
func TestProbeListEnvironmentsAllFields(t *testing.T) {
	svc := NewProductService()
	ts, err := NewConsoleTokenSource()
	if err != nil {
		t.Skipf("no console credentials: %v", err)
	}
	svc.tokens = ts

	// Try with extended field mask
	parent := "organisations/voyage/products/vp"
	for _, fields := range [][]string{
		{"name", "display_name", "state", "google_project", "variables", "env_variables"},
		nil, // no field mask
	} {
		var buf []byte
		buf = protowire.AppendTag(buf, 1, protowire.BytesType)
		buf = protowire.AppendString(buf, parent)
		if len(fields) > 0 {
			fm := marshalFieldMask(fields)
			buf = protowire.AppendTag(buf, 4, protowire.BytesType)
			buf = protowire.AppendBytes(buf, fm)
		}

		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		body, grpcStatus, grpcMsg, reqErr := svc.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/ListEnvironments", buf)
		cancel()

		t.Logf("fields=%v → grpcStatus=%d grpcMsg=%q bodyLen=%d reqErr=%v", fields, grpcStatus, grpcMsg, len(body), reqErr)
		if reqErr != nil || grpcStatus != 0 || len(body) < 5 {
			continue
		}

		// Dump first 400 bytes of the first environment message
		data := body[5:]
		envCount := 0
		for len(data) > 0 && envCount < 2 {
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
					envCount++
					t.Logf("  env[%d] raw hex (%d bytes): %x", envCount, len(b), b[:min(100, len(b))])
					// Dump fields inside the env message
					inner := b
					for len(inner) > 0 {
						fn, ft, fn2 := protowire.ConsumeTag(inner)
						if fn2 < 0 {
							break
						}
						inner = inner[fn2:]
						switch ft {
						case protowire.VarintType:
							v, m2 := protowire.ConsumeVarint(inner)
							if m2 < 0 {
								break
							}
							t.Logf("    field %d (varint) = %d", fn, v)
							inner = inner[m2:]
						case protowire.BytesType:
							bv, m2 := protowire.ConsumeBytes(inner)
							if m2 < 0 {
								break
							}
							printable := true
							for _, c := range bv {
								if c < 32 && c != '\n' && c != '\r' {
									printable = false
									break
								}
							}
							if printable && len(bv) < 200 {
								t.Logf("    field %d (string) = %q", fn, string(bv))
							} else {
								t.Logf("    field %d (bytes, %d) hex=%x", fn, len(bv), bv[:min(30, len(bv))])
							}
							inner = inner[m2:]
						default:
							m2 := protowire.ConsumeFieldValue(fn, ft, inner)
							if m2 < 0 {
								break
							}
							t.Logf("    field %d (type %d skip %d)", fn, ft, m2)
							inner = inner[m2:]
						}
					}
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
	}
}

// TestGetServicesOverviewLive calls the real API to list neurons and deployments.
func TestGetServicesOverviewLive(t *testing.T) {
	svc := NewProductService()
	ts, err := NewConsoleTokenSource()
	if err != nil {
		t.Skipf("no console credentials: %v (run ProductService.Login() first)", err)
	}
	svc.tokens = ts

	overview, err := svc.GetServicesOverview("voyage", "vp")
	if err != nil {
		t.Fatalf("GetServicesOverview: %v", err)
	}

	t.Logf("Found %d neurons", len(overview.Neurons))
	for i, n := range overview.Neurons {
		if i >= 5 {
			t.Logf("  ... and %d more", len(overview.Neurons)-5)
			break
		}
		t.Logf("  %-30s version=%s state=%d", n.ID, n.Version, n.State)
	}

	t.Logf("Found %d environments", len(overview.Environments))
	for _, env := range overview.Environments {
		t.Logf("  %-20s (%d deployments)", env.DisplayName, len(env.Deployments))
		for j, dep := range env.Deployments {
			if j >= 3 {
				t.Logf("    ... and %d more", len(env.Deployments)-3)
				break
			}
			t.Logf("    %-28s version=%s state=%d", dep.NeuronID, dep.Version, dep.State)
		}
	}
}

// TestProbeListBlocks tries candidate gRPC methods for the blocks service to discover the correct endpoint.
func TestProbeListBlocks(t *testing.T) {
	svc := NewProductService()
	ts, err := NewConsoleTokenSource()
	if err != nil {
		t.Skipf("no console credentials: %v", err)
	}
	svc.tokens = ts

	candidates := []string{
		// More namespace guesses
		"alis.hub.v1.HubService/ListBlocks",
		"alis.hub.v1.HubService/ListCodeblocks",
		"alis.os.marketplace.v1.MarketplaceService/ListBlocks",
		"alis.os.marketplace.v1.MarketplaceService/ListCodeblocks",
		"alis.os.products.v1.OrganisationsService/ListBlocks",
		"alis.os.packages.v1.PackagesService/ListBlocks",
		"alis.os.packages.v1.PackagesService/ListCodeblocks",
		"alis.os.neurons.v1.BlocksService/ListBlocks",
		// Singular/different capitalisation
		"alis.os.block.v1.BlockService/ListBlocks",
		"alis.os.codeblock.v1.CodeblockService/ListCodeblocks",
		"alis.build.block.v1.BlockService/ListBlocks",
		// Version variations
		"alis.os.blocks.v2.BlocksService/ListBlocks",
		// Store/registry pattern
		"alis.os.store.v1.StoreService/ListBlocks",
		"alis.os.registry.v1.RegistryService/ListBlocks",
		// Raw resource names
		"alis.os.products.v1.ProductsService/ListCodeblocks",
	}

	for _, method := range candidates {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		body, grpcStatus, grpcMsg, reqErr := svc.doConsoleGRPCWeb(ctx, method, nil)
		cancel()
		t.Logf("%-65s → err=%v grpcStatus=%d grpcMsg=%q bodyLen=%d",
			method, reqErr, grpcStatus, truncateStr(grpcMsg, 60), len(body))
	}
}

// TestProbeGetBlock fetches one block and dumps all proto field numbers to discover the schema.
// Update the blockName constant after TestProbeListBlocks reveals valid block resource names.
func TestProbeGetBlock(t *testing.T) {
	svc := NewProductService()
	ts, err := NewConsoleTokenSource()
	if err != nil {
		t.Skipf("no console credentials: %v", err)
	}
	svc.tokens = ts

	// First discover a block name from ListBlocks
	method := "alis.build.blocks.v1.BlocksService/ListBlocks"
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	body, grpcStatus, grpcMsg, reqErr := svc.doConsoleGRPCWeb(ctx, method, nil)
	cancel()
	if reqErr != nil || grpcStatus != 0 || len(body) < 5 {
		t.Skipf("ListBlocks failed: err=%v grpcStatus=%d grpcMsg=%q", reqErr, grpcStatus, grpcMsg)
	}

	t.Logf("ListBlocks body len=%d", len(body))
	// Dump top-level fields of the list response
	data := body[5:]
	blockCount := 0
	var firstBlockName string
	for len(data) > 0 && blockCount < 3 {
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
		blockCount++
		t.Logf("=== block[%d] raw (%d bytes) ===", blockCount, len(b))
		inner := b
		for len(inner) > 0 {
			fn, ft, fn2 := protowire.ConsumeTag(inner)
			if fn2 < 0 {
				break
			}
			inner = inner[fn2:]
			switch ft {
			case protowire.VarintType:
				v, m2 := protowire.ConsumeVarint(inner)
				if m2 < 0 {
					break
				}
				t.Logf("  field %d (varint) = %d", fn, v)
				inner = inner[m2:]
			case protowire.BytesType:
				bv, m2 := protowire.ConsumeBytes(inner)
				if m2 < 0 {
					break
				}
				printable := true
				for _, c := range bv {
					if c < 32 && c != '\n' && c != '\r' {
						printable = false
						break
					}
				}
				s := string(bv)
				if printable && len(bv) < 300 {
					t.Logf("  field %d (string, %d) = %q", fn, len(bv), s)
					if fn == 1 && firstBlockName == "" {
						firstBlockName = s
					}
				} else {
					t.Logf("  field %d (bytes, %d) hex=%x", fn, len(bv), bv[:min(30, len(bv))])
				}
				inner = inner[m2:]
			default:
				m2 := protowire.ConsumeFieldValue(fn, ft, inner)
				if m2 < 0 {
					break
				}
				t.Logf("  field %d (type %d, skip %d)", fn, ft, m2)
				inner = inner[m2:]
			}
		}
	}

	if firstBlockName == "" {
		t.Log("could not extract a block resource name from ListBlocks response")
		return
	}
	t.Logf("first block name: %q", firstBlockName)
}

// TestPKCELoginFlow opens a browser window and completes the real OAuth2 login.
// Run manually: go test -v -run TestPKCELoginFlow -timeout 2m .
func TestPKCELoginFlow(t *testing.T) {
	if os.Getenv("ALIS_TEST_LOGIN") == "" {
		t.Skip("set ALIS_TEST_LOGIN=1 to run the browser-based auth flow")
	}
	svc := NewProductService()
	if err := svc.Login(); err != nil {
		t.Fatalf("Login: %v", err)
	}
	t.Log("Login successful — credentials saved to ~/.alis/console-credentials.json")

	// Immediately verify by listing environments.
	envs, err := svc.ListEnvironments("voyage", "vp")
	if err != nil {
		t.Fatalf("ListEnvironments after login: %v", err)
	}
	t.Logf("Found %d environments after login", len(envs))
}

// TestWithEnvToken lets you test the API using a token you copied from the browser.
// Usage: ALIS_CONSOLE_TOKEN=<your_id_token_fvc_cookie> go test -v -run TestWithEnvToken .
func TestWithEnvToken(t *testing.T) {
	tok := os.Getenv("ALIS_CONSOLE_TOKEN")
	if tok == "" {
		t.Skip("set ALIS_CONSOLE_TOKEN=<alis_id_token_fvc cookie value from browser> to run this test")
	}

	t.Log("Testing with env token as Bearer...")
	status, hdrs, body := probeConsoleWithBearer(t, tok)
	t.Logf("Bearer → HTTP %d  grpc-status: %s", status, hdrs.Get("grpc-status"))
	if status == 200 {
		t.Logf("body (base64): %.80s", string(body))
	} else {
		t.Logf("body: %q", truncate(body, 200))
	}

	t.Log("Testing with env token as cookie alis_id_token_fvc...")
	status, hdrs, body = probeConsoleWithCookie(t, "alis_id_token_fvc", tok)
	t.Logf("Cookie → HTTP %d  grpc-status: %s", status, hdrs.Get("grpc-status"))
	if status == 200 {
		t.Logf("body (base64): %.80s", string(body))
	} else {
		t.Logf("body: %q", truncate(body, 200))
	}
}

func TestDecodeCredentials(t *testing.T) {
	home, _ := os.UserHomeDir()
	data, err := os.ReadFile(filepath.Join(home, ".alis/credentials.json"))
	if err != nil {
		t.Skip("no credentials")
	}

	// Pretty-print the keys (not values — tokens are sensitive).
	var raw map[string]any
	json.Unmarshal(data, &raw)
	for k, v := range raw {
		switch val := v.(type) {
		case string:
			t.Logf("  %s: string (%d chars)", k, len(val))
		default:
			t.Logf("  %s: %T = %v", k, v, v)
		}
	}
	fmt.Println() // visible even without -v
}

// TestGetEnvironmentVariablesLive tests the new GetEnvironmentVariables method.
func TestGetEnvironmentVariablesLive(t *testing.T) {
	svc := NewProductService()
	ts, err := NewConsoleTokenSource()
	if err != nil {
		t.Skipf("no console credentials: %v", err)
	}
	svc.tokens = ts

	envs, err := svc.ListEnvironments("voyage", "vp")
	if err != nil || len(envs) == 0 {
		t.Fatalf("ListEnvironments: %v", err)
	}

	env := envs[0]
	t.Logf("Fetching variables for: %s (%s)", env.DisplayName, env.Name)

	vars, err := svc.GetEnvironmentVariables(env.Name)
	if err != nil {
		t.Fatalf("GetEnvironmentVariables: %v", err)
	}
	t.Logf("Got %d variables", len(vars))
	for i, v := range vars {
		if i >= 10 {
			t.Logf("  ... and %d more", len(vars)-10)
			break
		}
		t.Logf("  %-40s = %s", v.Label, truncateStr(v.Value, 50))
	}
}

// TestProbeVariableCRUDMethods probes what variable CRUD methods exist on EnvironmentsService.
func TestProbeVariableCRUDMethods(t *testing.T) {
	svc := NewProductService()
	ts, err := NewConsoleTokenSource()
	if err != nil {
		t.Skipf("no console credentials: %v", err)
	}
	svc.tokens = ts

	envs, err := svc.ListEnvironments("voyage", "vp")
	if err != nil || len(envs) == 0 {
		t.Skipf("ListEnvironments: %v", err)
	}
	envName := envs[0].Name // staging
	t.Logf("Using env: %s", envName)

	// Try common method names with a minimal request (just the env name / parent)
	methods := []string{
		"alis.os.products.v1.EnvironmentsService/CreateVariable",
		"alis.os.products.v1.EnvironmentsService/UpdateVariable",
		"alis.os.products.v1.EnvironmentsService/DeleteVariable",
		"alis.os.products.v1.EnvironmentsService/SetVariable",
		"alis.os.products.v1.EnvironmentsService/UpsertVariable",
		"alis.os.products.v1.EnvironmentsService/ListVariables",
		"alis.os.products.v1.EnvironmentsService/GetVariable",
		"alis.os.products.v1.EnvironmentsService/UpdateEnvironment",
		"alis.os.products.v1.EnvironmentsService/BatchUpdateVariables",
		"alis.os.products.v1.EnvironmentsService/PatchVariable",
	}

	for _, method := range methods {
		// Send a minimal request: field 1 = env name (parent or name)
		var buf []byte
		buf = protowire.AppendTag(buf, 1, protowire.BytesType)
		buf = protowire.AppendString(buf, envName)

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		body, grpcStatus, grpcMsg, reqErr := svc.doConsoleGRPCWeb(ctx, method, buf)
		cancel()

		t.Logf("%-70s → http_err=%v grpcStatus=%d grpcMsg=%q bodyLen=%d",
			method, reqErr, grpcStatus, truncateStr(grpcMsg, 60), len(body))
	}
}

// TestProbeBuildsPageBackend exercises every backend call made by BuildsPage
// against the real voyage/vp/bff-v1 stack so we know what works before running the app.
func TestProbeBuildsPageBackend(t *testing.T) {
	const org, product, neuron = "voyage", "vp", "bff-v1"

	svc := NewProductService()
	buildSvc := &BuildService{}

	t.Run("GetServicesOverview — neurons and deployed-envs map", func(t *testing.T) {
		overview, err := svc.GetServicesOverview(org, product)
		if err != nil {
			t.Fatalf("GetServicesOverview: %v", err)
		}
		t.Logf("neurons (%d):", len(overview.Neurons))
		for _, n := range overview.Neurons {
			t.Logf("  id=%q version=%q state=%d", n.ID, n.Version, n.State)
		}
		t.Logf("environments (%d):", len(overview.Environments))
		for _, env := range overview.Environments {
			t.Logf("  env=%q (%s) deployments=%d", env.DisplayName, env.Name, len(env.Deployments))
			for _, d := range env.Deployments {
				t.Logf("    neuronId=%q version=%q state=%d", d.NeuronID, d.Version, d.State)
			}
		}
		// Verify the deployedEnvsMap key format used by BuildsPage: "neuronId::version"
		for _, env := range overview.Environments {
			for _, d := range env.Deployments {
				key := d.NeuronID + "::" + d.Version
				t.Logf("  deployedEnvsMap key=%q → %q", key, env.DisplayName)
			}
		}
	})

	t.Run("GetProductOverview — gitRepo.remoteUri for GCSR links", func(t *testing.T) {
		overview, err := svc.GetProductOverview(org, product)
		if err != nil {
			t.Fatalf("GetProductOverview: %v", err)
		}
		t.Logf("product: displayName=%q", overview.DisplayName)
		if overview.GitRepo != nil {
			t.Logf("gitRepo.remoteUri=%q", overview.GitRepo.RemoteURI)
			// Test the buildGCSRUrl helper with a fake SHA
			if overview.GitRepo.RemoteURI != "" {
				url := buildGCSRUrlTest(overview.GitRepo.RemoteURI, "abc123def456")
				t.Logf("buildGCSRUrl result: %q", url)
				if url == "" {
					t.Log("  WARNING: remoteUri did not match expected Google Cloud Source Repositories format")
					t.Logf("  remoteUri pattern: %q", overview.GitRepo.RemoteURI)
				}
			}
		} else {
			t.Log("gitRepo is nil — 'View commit' and 'View changes' buttons will not appear")
		}
	})

	t.Run("GetBuildCommits — changelog data", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		client, err := NewAlisClient(ctx)
		if err != nil {
			t.Fatal(err)
		}
		bsvc := &BuildService{alisClient: client}
		// bff → id="bff", version="v1"
		commits, err := bsvc.GetBuildCommits(org, product, "bff", "v1", "master", 10)
		if err != nil {
			t.Fatalf("GetBuildCommits: %v", err)
		}
		t.Logf("commits on master (%d):", len(commits))
		for i, c := range commits {
			if i >= 5 { break }
			t.Logf("  sha=%s author=%q ts=%d msg=%q", c.SHA[:7], c.Author, c.Timestamp, truncateStr(c.Message, 60))
		}
	})

	t.Run("FetchBuildLogs — full pipeline for latest and an old version", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		client, err := NewAlisClient(ctx)
		if err != nil {
			t.Fatal(err)
		}
		vers, err := client.ListNeuronVersions(ctx,
			fmt.Sprintf("organisations/%s/products/%s/neurons/%s", org, product, neuron))
		if err != nil || len(vers) == 0 {
			t.Fatalf("ListNeuronVersions: %v count=%d", err, len(vers))
		}

		probes := []int{0, 5, 20}
		for _, i := range probes {
			if i >= len(vers) { continue }
			v := vers[i]
			if v.LogsURL == "" {
				t.Logf("[%d] version=%s — no logsUrl (retagged)", i, v.Version)
				continue
			}
			result, fetchErr := buildSvc.FetchBuildLogs(v.LogsURL, 0)
			if fetchErr != nil {
				t.Logf("[%d] version=%s — FetchBuildLogs ERROR: %v", i, v.Version, fetchErr)
				continue
			}
			t.Logf("[%d] version=%s — OK: %d chars", i, v.Version, len(result.Content))
			if len(result.Content) > 0 {
				snippet := result.Content
				if len(snippet) > 200 { snippet = snippet[:200] }
				t.Logf("  first 200 chars:\n%s", snippet)
			}
		}
	})
}

// buildGCSRUrlTest is the same pure function used in BuildsPage — copied here for testing.
func buildGCSRUrlTest(remoteUri string, sha string) string {
	m := regexp.MustCompile(`source\.developers\.google\.com/p/([^/]+)/r/([^/]+)`).FindStringSubmatch(remoteUri)
	if m == nil { return "" }
	return fmt.Sprintf("https://source.cloud.google.com/%s/%s/+/%s", m[1], m[2], sha)
}

// TestProbeBFFNeuronVersionLogs tests the full FetchBuildLogs pipeline against
// bff-v1 versions — checking recent, mid, and old builds to find the retention
// cutoff, and confirming the parsed log text is usable for in-app display.
func TestProbeBFFNeuronVersionLogs(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	client, err := NewAlisClient(ctx)
	if err != nil {
		t.Fatal(err)
	}
	svc := &BuildService{alisClient: client}

	vers, err := client.ListNeuronVersions(ctx, "organisations/voyage/products/vp/neurons/bff-v1")
	if err != nil || len(vers) == 0 {
		t.Fatalf("ListNeuronVersions: err=%v count=%d", err, len(vers))
	}
	t.Logf("Total versions: %d (newest: %s, oldest: %s)", len(vers), vers[0].Version, vers[len(vers)-1].Version)

	// Test a spread: index 0 (newest), 10, 30, 64 (oldest)
	probeIdxs := []int{0, 10, 30, len(vers) - 1}
	for _, i := range probeIdxs {
		if i >= len(vers) {
			continue
		}
		v := vers[i]
		t.Logf("\n--- [%d] version=%s createTime=%d logsUrl=%s", i, v.Version, v.CreateTime, v.LogsURL)

		result, fetchErr := svc.FetchBuildLogs(v.LogsURL, 0)
		if fetchErr != nil {
			t.Logf("  FetchBuildLogs ERROR: %v", fetchErr)
			continue
		}
		t.Logf("  FetchBuildLogs OK: nextOffset=%d contentLen=%d", result.NextOffset, len(result.Content))
		if len(result.Content) > 0 {
			// Show first 300 chars of parsed log text
			snippet := result.Content
			if len(snippet) > 300 {
				snippet = snippet[:300]
			}
			t.Logf("  content snippet:\n%s", snippet)
		} else {
			t.Logf("  (no content extracted from HTML)")
		}
	}
}

// TestSyncReposLive clones (or fetches) the define and build repos for a real
// product and verifies that the Forgejo Bearer-token auth works end-to-end.
// Run with: go test -v -run TestSyncReposLive -timeout 120s .
func TestSyncReposLive(t *testing.T) {
	const org, product = "voyage", "vp"

	svc := NewProductService()
	ts, err := NewConsoleTokenSource()
	if err != nil {
		t.Skipf("no console credentials: %v (run Login() first)", err)
	}
	svc.tokens = ts

	// Verify the access token is present before trying git.
	tok, err := ts.AccessToken()
	if err != nil {
		t.Fatalf("AccessToken: %v", err)
	}
	t.Logf("access token length: %d", len(tok))

	// Resolve the URLs the same way SyncRepos does, so we can log them.
	overview, err := svc.GetProductOverview(org, product)
	if err != nil {
		t.Fatalf("GetProductOverview: %v", err)
	}
	orgBaseURL, err := svc.getOrganisationGitRepo(org)
	if err != nil {
		t.Fatalf("getOrganisationGitRepo: %v", err)
	}
	defineURL := strings.TrimRight(orgBaseURL, "/") + "/proto"
	buildURL := strings.TrimRight(overview.GitRepo.RemoteURI, "/") + "/" + product
	t.Logf("define URL: %s", defineURL)
	t.Logf("build  URL: %s", buildURL)

	// Run the actual sync, routing git output to t.Log.
	t.Log("syncing repos ...")
	result, err := svc.SyncRepos(org, product)
	if err != nil {
		t.Fatalf("SyncRepos returned error: %v", err)
	}
	if result.Error != "" {
		t.Fatalf("SyncRepos result.Error: %s", result.Error)
	}
	t.Logf("define  → %s (%s)", result.DefineDir, result.DefineAction)
	t.Logf("build   → %s (%s)", result.BuildDir, result.BuildAction)
}

// TestSyncReposGitDiag runs the git fetch manually so we can see raw git stderr.
func TestSyncReposGitDiag(t *testing.T) {
	ts, err := NewConsoleTokenSource()
	if err != nil {
		t.Skipf("no console credentials: %v", err)
	}
	tok, err := ts.AccessToken()
	if err != nil {
		t.Fatalf("AccessToken: %v", err)
	}
	t.Logf("token length: %d prefix: %.20s", len(tok), tok)

	defineDir := filepath.Join(os.Getenv("HOME"), "alis.build", "voyage", "define")
	if _, err := os.Stat(defineDir); err != nil {
		t.Skipf("define repo not cloned yet at %s", defineDir)
	}

	svc := NewProductService()
	svc.tokens = ts
	orgBaseURL, err := svc.getOrganisationGitRepo("voyage")
	if err != nil {
		t.Fatalf("getOrganisationGitRepo: %v", err)
	}
	defineURL := strings.TrimRight(orgBaseURL, "/") + "/proto"
	t.Logf("fetch URL: %s", defineURL)

	cmd := exec.Command("git",
		"-c", "http.extraHeader=",
		"-c", "http.extraHeader=Authorization: Bearer "+tok,
		"-C", defineDir,
		"fetch", defineURL,
	)
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	out, runErr := cmd.CombinedOutput()
	t.Logf("exit: %v\noutput:\n%s", runErr, string(out))
	if runErr != nil {
		t.Fail()
	}
}

func dumpAllFields(t *testing.T, data []byte, indent string) {
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
				return
			}
			s := string(b)
			if len(s) > 200 {
				s = s[:200] + "…"
			}
			t.Logf("%sfield %d (bytes len=%d): %q", indent, num, len(b), s)
			// Try to recursively parse as a sub-message if it looks like proto
			if len(b) > 2 && b[0] != 0 {
				sub := tryParseSubMessage(b)
				if sub != "" {
					t.Logf("%s  [sub-message]: %s", indent, sub)
				}
			}
			data = data[m:]
		case protowire.VarintType:
			v, m := protowire.ConsumeVarint(data)
			if m < 0 {
				return
			}
			t.Logf("%sfield %d (varint): %d", indent, num, v)
			data = data[m:]
		case protowire.Fixed64Type:
			v, m := protowire.ConsumeFixed64(data)
			if m < 0 {
				return
			}
			t.Logf("%sfield %d (fixed64): %d", indent, num, v)
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

func tryParseSubMessage(data []byte) string {
	var parts []string
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			return ""
		}
		data = data[n:]
		if typ == protowire.BytesType {
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return ""
			}
			s := string(b)
			if len(s) > 100 {
				s = s[:100]
			}
			parts = append(parts, fmt.Sprintf("f%d=%q", num, s))
			data = data[m:]
		} else {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return ""
			}
			data = data[m:]
		}
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, " ")
}
