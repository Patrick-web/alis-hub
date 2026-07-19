package main

import (
	"context"
	"fmt"
	"net/url"
	"time"

	controllerv1pb "alis-hub-v3/gen/go/alis/ws/controller/v1"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

	longrunningpb "cloud.google.com/go/longrunning/autogen/longrunningpb"
	"google.golang.org/protobuf/proto"
)

// GetWorkstationURI returns the web IDE URI for the current user's workstation.
// Returns "" (no error) if the workstation is still being provisioned or is unavailable.
func (s *ProductService) GetWorkstationURI() (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	reqBytes, err := proto.Marshal(&controllerv1pb.RetrieveMyWorkstationRequest{})
	if err != nil {
		return "", fmt.Errorf("RetrieveMyWorkstation: marshal request: %w", err)
	}
	dataFrame, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx,
		"alis.ws.controller.v1.WorkstationsService/RetrieveMyWorkstation", reqBytes)
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
		op := &longrunningpb.Operation{}
		if err := proto.Unmarshal(dataFrame[5:], op); err != nil {
			return "", fmt.Errorf("unmarshal operation: %w", err)
		}
		if op.GetDone() {
			var uri string
			if resp := op.GetResponse(); resp != nil {
				wsResp := &controllerv1pb.RetrieveMyWorkstationResponse{}
				if err := resp.UnmarshalTo(wsResp); err == nil {
					uri = wsResp.GetUri()
				}
			}
			return uri, nil
		}
		if op.GetName() == "" {
			return "", nil // provisioning but no op name to poll with
		}
		select {
		case <-ctx.Done():
			return "", nil // still provisioning after timeout
		case <-time.After(time.Second):
		}
		getOpReqBytes, err := proto.Marshal(&longrunningpb.GetOperationRequest{Name: op.GetName()})
		if err != nil {
			return "", fmt.Errorf("GetOperation: marshal request: %w", err)
		}
		dataFrame, grpcStatus, grpcMsg, err = s.doConsoleGRPCWeb(ctx,
			"google.longrunning.Operations/GetOperation", getOpReqBytes)
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
