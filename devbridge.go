//go:build !production

package main

import (
	"bytes"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// The dev bridge exposes the running app's asset + runtime handler on a plain
// TCP port so a normal browser can act as a second client of the *same* app
// instance. Wails' JS runtime talks to the Go side over HTTP POSTs to
// /wails/runtime, and Assets.Middleware wraps the full handler chain (assets,
// runtime.js and the runtime endpoint), so re-serving that chain over TCP is
// enough to make the frontend fully functional in Chrome — including every
// bound service call.
//
// Go→JS events are a separate problem: Wails pushes those into native windows
// via ExecJS, which a browser tab never sees. devTransport replaces the default
// HTTP transport so it also receives every dispatched event and re-broadcasts
// it to browser clients over SSE (see devbridge_transport below).
//
// This exists for automated UI driving (CDP / Playwright / chrome-devtools MCP)
// and manual debugging in Chrome DevTools. It is compiled out of production
// builds and, even in dev builds, stays off unless ALIS_HUB_DEV_BRIDGE is set.
//
//	ALIS_HUB_DEV_BRIDGE=1 wails3 dev      # then open http://127.0.0.1:34115
const (
	devBridgeDefaultAddr = "127.0.0.1:34115"
	devBridgeEventsPath  = "/wails/events"
	devBridgeScriptPath  = "/wails/devbridge.js"
)

func devBridgeEnabled() bool { return os.Getenv("ALIS_HUB_DEV_BRIDGE") != "" }

// devBridgeMiddleware is installed as the app's outermost asset middleware. It
// passes requests through untouched and, on first invocation, starts the
// bridge listener against the very handler chain it wraps.
func devBridgeMiddleware(next http.Handler) http.Handler {
	if !devBridgeEnabled() {
		return next
	}

	addr := os.Getenv("ALIS_HUB_DEV_BRIDGE_ADDR")
	if addr == "" {
		addr = devBridgeDefaultAddr
	}

	go serveDevBridge(addr, next)

	return next
}

func serveDevBridge(addr string, handler http.Handler) {
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		log.Printf("[devbridge] listen %s: %v", addr, err)
		return
	}

	log.Printf("[devbridge] app reachable at http://%s", ln.Addr())

	srv := &http.Server{
		Handler:           devBridgeHandler(handler),
		ReadHeaderTimeout: 10 * time.Second,
	}
	if err := srv.Serve(ln); err != nil {
		log.Printf("[devbridge] serve: %v", err)
	}
}

// devBridgeHandler serves the app chain to browser clients, adding the client
// script and injecting it into HTML responses. Only requests arriving on the
// bridge listener pass through here, so the native webview is untouched.
func devBridgeHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, req *http.Request) {
		if req.URL.Path == devBridgeScriptPath {
			rw.Header().Set("Content-Type", "application/javascript")
			rw.Header().Set("Cache-Control", "no-store")
			_, _ = rw.Write(devBridgeShim)
			return
		}

		injector := &injectingWriter{ResponseWriter: rw}
		next.ServeHTTP(injector, req)
		injector.finish()
	})
}

// injectingWriter buffers HTML responses so the bridge client script can be
// added before the document is sent. Non-HTML responses stream through
// untouched.
type injectingWriter struct {
	http.ResponseWriter

	buf         bytes.Buffer
	capture     bool
	wroteHeader bool
	status      int
}

func (w *injectingWriter) WriteHeader(status int) {
	if w.wroteHeader {
		return
	}
	w.wroteHeader = true
	w.status = status

	if strings.HasPrefix(w.Header().Get("Content-Type"), "text/html") {
		// Hold the header back: the injected body changes Content-Length.
		w.capture = true
		return
	}

	w.ResponseWriter.WriteHeader(status)
}

func (w *injectingWriter) Write(p []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	if w.capture {
		return w.buf.Write(p)
	}
	return w.ResponseWriter.Write(p)
}

func (w *injectingWriter) Flush() {
	if w.capture {
		return
	}
	if flusher, ok := w.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (w *injectingWriter) finish() {
	if !w.capture {
		return
	}

	body := injectBridgeScript(w.buf.Bytes())
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	w.ResponseWriter.WriteHeader(w.status)
	_, _ = w.ResponseWriter.Write(body)
}

var bridgeScriptTag = []byte(`<script src="` + devBridgeScriptPath + `"></script>`)

func injectBridgeScript(body []byte) []byte {
	if bytes.Contains(body, bridgeScriptTag) {
		return body
	}
	for _, marker := range [][]byte{[]byte("</head>"), []byte("</body>")} {
		if idx := bytes.Index(body, marker); idx != -1 {
			out := make([]byte, 0, len(body)+len(bridgeScriptTag))
			out = append(out, body[:idx]...)
			out = append(out, bridgeScriptTag...)
			out = append(out, body[idx:]...)
			return out
		}
	}
	return append(body, bridgeScriptTag...)
}

// devBridgeShim stands in for the native injections a WKWebView/WebView2 host
// would provide, subscribes to the SSE event stream and replays events into the
// Wails runtime exactly as ExecJS would in the native window, and exposes
// window.devBridge so an automation agent can call bound methods, emit events
// and assert on what the Go side pushed back. See docs/AI_UI_AUTOMATION.md.
var devBridgeShim = []byte(`
(function () {
  if (window.__wailsDevBridge) return;
  window.__wailsDevBridge = true;

  window._wails = window._wails || {};
  window._wails.invoke = window._wails.invoke || function () {};
  window._wails.setResizable = window._wails.setResizable || function () {};
  window._wails.flags = window._wails.flags || {};

  var RUNTIME = '/wails/runtime';
  var OBJECT_CALL = 0;
  var OBJECT_EVENTS = 3;
  var CALL_BINDING = 0;
  var EMIT_METHOD = 0;
  var MAX_RECORDED = 500;

  var recorded = [];
  var pending = [];
  var seq = 0;

  // The runtime mounts dispatchWailsEvent when its module loads, which may be
  // after this script runs. Queue events until it appears rather than dropping
  // whatever arrives during boot.
  function dispatch(event) {
    if (window._wails && window._wails.dispatchWailsEvent) {
      window._wails.dispatchWailsEvent(event);
      return;
    }
    pending.push(event);
  }

  function drain() {
    if (!window._wails || !window._wails.dispatchWailsEvent) return;
    while (pending.length) window._wails.dispatchWailsEvent(pending.shift());
  }

  setInterval(drain, 100);

  function runtimeCall(object, method, args) {
    return fetch(RUNTIME, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-wails-client-id': 'devbridge' },
      body: JSON.stringify({ object: object, method: method, args: args })
    }).then(function (response) {
      return response.text().then(function (text) {
        if (!response.ok) throw new Error(text || ('HTTP ' + response.status));
        if (!text) return null;
        try { return JSON.parse(text); } catch (err) { return text; }
      });
    });
  }

  window.devBridge = {
    connected: false,

    // call invokes a bound Go method by the numeric ID in
    // frontend/bindings/**/*.ts, e.g. devBridge.call(1411160069, 'agent').
    call: function (methodID) {
      var args = Array.prototype.slice.call(arguments, 1);
      seq += 1;
      return runtimeCall(OBJECT_CALL, CALL_BINDING, {
        'call-id': 'devbridge-' + seq,
        methodID: methodID,
        args: args
      });
    },

    // emit sends an event through the Go event processor, which fans it back
    // out to every client. Use it to stand in for native menu items.
    emit: function (name, data) {
      return runtimeCall(OBJECT_EVENTS, EMIT_METHOD, { name: name, data: data === undefined ? null : data });
    },

    // events returns everything the Go side pushed to this tab, newest last.
    events: function (name) {
      return name ? recorded.filter(function (e) { return e.name === name; }) : recorded.slice();
    },

    clear: function () { recorded.length = 0; },

    // waitFor resolves with the next matching event, ignoring earlier ones.
    waitFor: function (name, timeoutMs) {
      var start = Date.now();
      var limit = timeoutMs || 5000;
      return new Promise(function (resolve, reject) {
        var timer = setInterval(function () {
          for (var i = recorded.length - 1; i >= 0; i--) {
            if (recorded[i].name === name && recorded[i].receivedAt >= start) {
              clearInterval(timer);
              resolve(recorded[i]);
              return;
            }
          }
          if (Date.now() - start > limit) {
            clearInterval(timer);
            reject(new Error('timed out waiting for event: ' + name));
          }
        }, 50);
      });
    }
  };

  var source = new EventSource('` + devBridgeEventsPath + `');

  source.onopen = function () { window.devBridge.connected = true; };

  source.onmessage = function (message) {
    try {
      var event = JSON.parse(message.data);
      event.receivedAt = Date.now();
      recorded.push(event);
      if (recorded.length > MAX_RECORDED) recorded.shift();
      dispatch(event);
    } catch (err) {
      console.error('[devbridge] bad event payload', err, message.data);
    }
  };

  source.onerror = function () {
    // EventSource reconnects on its own; surface it for debugging.
    window.devBridge.connected = false;
    console.warn('[devbridge] event stream interrupted, reconnecting');
  };

  console.info('[devbridge] ready: window.devBridge.call / emit / events / waitFor');
})();
`)

// sseHub fans dispatched Wails events out to connected browser clients.
type sseHub struct {
	mu      sync.Mutex
	clients map[chan []byte]struct{}
}

func newSSEHub() *sseHub {
	return &sseHub{clients: make(map[chan []byte]struct{})}
}

func (h *sseHub) add() chan []byte {
	ch := make(chan []byte, 64)
	h.mu.Lock()
	h.clients[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *sseHub) size() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.clients)
}

func (h *sseHub) remove(ch chan []byte) {
	h.mu.Lock()
	delete(h.clients, ch)
	h.mu.Unlock()
}

// broadcast never blocks the emitting goroutine: a client that cannot keep up
// loses the event rather than stalling the app.
func (h *sseHub) broadcast(payload []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.clients {
		select {
		case ch <- payload:
		default:
			log.Printf("[devbridge] event stream backed up, dropping event")
		}
	}
}

func (h *sseHub) serve(rw http.ResponseWriter, req *http.Request) {
	flusher, ok := rw.(http.Flusher)
	if !ok {
		http.Error(rw, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	rw.Header().Set("Content-Type", "text/event-stream")
	rw.Header().Set("Cache-Control", "no-store")
	rw.Header().Set("Connection", "keep-alive")
	rw.WriteHeader(http.StatusOK)
	flusher.Flush()

	ch := h.add()
	defer h.remove(ch)

	// Keep-alive comments stop idle proxies and browsers from closing the
	// stream when the app is quiet.
	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()

	for {
		select {
		case <-req.Context().Done():
			return
		case payload := <-ch:
			if _, err := fmt.Fprintf(rw, "data: %s\n\n", payload); err != nil {
				return
			}
			flusher.Flush()
		case <-ping.C:
			if _, err := fmt.Fprint(rw, ": ping\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

// devTransport is the default HTTP transport plus event fan-out to browser
// clients. Wails auto-wires a transport that implements WailsEventListener as
// *the* event listener, which displaces its built-in EventIPCTransport, so this
// type is also responsible for delivering events to the native windows.
type devTransport struct {
	*application.HTTPTransport

	appRef func() *application.App
	hub    *sseHub
}

// devBridgeTransport returns the transport to install in application.Options,
// or nil to leave Wails' default in place when the bridge is disabled.
func devBridgeTransport(appRef func() *application.App) application.Transport {
	if !devBridgeEnabled() {
		return nil
	}
	return &devTransport{
		HTTPTransport: application.NewHTTPTransport(),
		appRef:        appRef,
		hub:           newSSEHub(),
	}
}

// DispatchWailsEvent mirrors Wails' EventIPCTransport (push to every window)
// and then forwards the same payload to browser clients.
func (t *devTransport) DispatchWailsEvent(event *application.CustomEvent) {
	windows := 0
	if app := t.appRef(); app != nil {
		for _, window := range app.Window.GetAll() {
			if event.IsCancelled() {
				return
			}
			window.DispatchWailsEvent(event)
			windows++
		}
	}

	if os.Getenv("ALIS_HUB_DEV_BRIDGE_VERBOSE") != "" {
		log.Printf("[devbridge] event %q -> %d window(s), %d browser client(s)", event.Name, windows, t.hub.size())
	}

	if event.IsCancelled() {
		return
	}

	if payload := event.ToJSON(); payload != "" {
		t.hub.broadcast([]byte(payload))
	}
}

// Handler adds the SSE endpoint ahead of the standard /wails/runtime handling.
func (t *devTransport) Handler() func(next http.Handler) http.Handler {
	inner := t.HTTPTransport.Handler()
	return func(next http.Handler) http.Handler {
		runtime := inner(next)
		return http.HandlerFunc(func(rw http.ResponseWriter, req *http.Request) {
			if req.URL.Path == devBridgeEventsPath {
				t.hub.serve(rw, req)
				return
			}
			runtime.ServeHTTP(rw, req)
		})
	}
}
