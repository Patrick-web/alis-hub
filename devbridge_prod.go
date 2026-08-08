//go:build production

package main

import (
	"net/http"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// The browser bridge only exists in dev builds (see devbridge.go); production
// gets a pass-through middleware and Wails' default transport.
func devBridgeMiddleware(next http.Handler) http.Handler { return next }

func devBridgeTransport(func() *application.App) application.Transport { return nil }
