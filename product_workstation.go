package main

import (
	"alis-hub-v3/internal/alisclient"
	"context"
	"fmt"
	"net/url"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"google.golang.org/protobuf/encoding/protowire"
)

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
			"google.longrunning.Operations/GetOperation", alisclient.MarshalGetOperationRequest(opName))
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
		if port, proxyErr := s.ensureAuthProxy(forgeBase); proxyErr == nil {
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

// OpenEditorWindow opens the web IDE for the given product in a new WebView
// window, and reuses an existing editor window if one is already open.
//
// Unlike Forgejo, the workstation host authenticates via its own ws_access_token/
// ws_refresh_token/ws_id_token cookies (minted by identity.alisx.com), not the
// alis console Bearer token, so it is opened directly rather than through the
// auth-injecting local proxy. On first use the WebView completes an interactive
// login exactly as a browser tab would; the window's cookie jar then carries
// that session for subsequent opens.
func (s *ProductService) OpenEditorWindow(productName string) error {
	s.mu.Lock()
	app := s.app
	s.mu.Unlock()
	if app == nil {
		return fmt.Errorf("app not initialised")
	}

	uri, err := s.GetWorkstationURI()
	if err != nil {
		return fmt.Errorf("get workstation: %w", err)
	}
	if uri == "" {
		return fmt.Errorf("workstation not yet available")
	}

	u, err := url.Parse(uri)
	if err != nil {
		return fmt.Errorf("parse workstation uri: %w", err)
	}
	query := u.Query()
	query.Set("product", productName)
	u.RawQuery = query.Encode()
	localURL := u.String()

	s.mu.Lock()
	win, prevURL := s.editorWindow, s.editorURL
	s.mu.Unlock()
	if win != nil {
		if localURL != prevURL {
			win.SetURL(localURL)
			s.mu.Lock()
			s.editorURL = localURL
			s.mu.Unlock()
		}
		win.Show()
		win.Focus()
		return nil
	}

	win = app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "Editor",
		Width:  1280,
		Height: 900,
		URL:    localURL,
		Mac: application.MacWindow{
			Backdrop: application.MacBackdropNormal,
		},
	})
	win.OnWindowEvent(events.Common.WindowClosing, func(_ *application.WindowEvent) {
		s.mu.Lock()
		if s.editorWindow == win {
			s.editorWindow = nil
			s.editorURL = ""
		}
		s.mu.Unlock()
	})
	s.mu.Lock()
	s.editorWindow = win
	s.editorURL = localURL
	s.mu.Unlock()
	win.Show()
	win.Focus()
	return nil
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
		return s.OpenEditorWindow(productName)
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
