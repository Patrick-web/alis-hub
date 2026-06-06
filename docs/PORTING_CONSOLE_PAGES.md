# Porting Console Pages to alis-hub

Step-by-step guide for replicating a page from `console.alisx.com` into the desktop app.
Written from the experience of implementing the Overview page (`/build/landing-zone/{org}/{product}/overview`).

---

## Step 1 — Inspect the Target Page

Open the page in Chrome with DevTools → **Network** tab → filter by **Fetch/XHR**.

Interact with the page (load it, click tabs) and watch for requests to `console.alisx.com`. These will be gRPC-web calls. Each one tells you:

- **URL path** = the gRPC method, e.g. `alis.os.products.v1.ProductsService/GetProduct`
- **Request payload** = base64-encoded protobuf (the request message)
- **Response payload** = base64-encoded protobuf (the response message)

In the **Headers** tab of each request, note:
- `Content-Type: application/grpc-web-text` ← this is the transport (base64, not binary)
- `Cookie: alis_access_token_fvc=...; alis_id_token_fvc=...; alis_refresh_token_fvc=...`

> **Important:** the console uses cookie auth, not Bearer tokens. You need all three cookies simultaneously.

---

## Step 2 — Find the Proto Field Numbers

The browser ships the proto definitions as compiled JS. In DevTools → **Sources**, search (Cmd+Shift+F) for the service name, e.g. `GetProduct`. You'll find a file like `combined.js` or a chunk file.

Look for the message class and its field accessors — they expose the field numbers directly:

```js
// Example from combined.js
proto.alis.os.products.v1.Product.prototype.getName = function() { ... field 1 ... };
proto.alis.os.products.v1.Product.prototype.getGoogleProject = function() { ... field 5 ... };
```

Map every field you need. Pay attention to:
- Scalar fields (string, int32, bool) → `protowire.BytesType` or `protowire.VarintType`
- Nested messages → `protowire.BytesType` with a recursive parse
- Repeated fields → appear multiple times in the wire bytes

You can also decode a live request/response payload to verify. Copy the base64 from DevTools and decode it to confirm field numbers match what you expect.

---

## Step 3 — Understand the Transport

`console.alisx.com` uses **gRPC-web-text** (`application/grpc-web-text`), which is base64.

### Request format
Encode the gRPC frame as base64:
```
[0x00][4-byte big-endian length][proto bytes]
```
Then base64-encode the whole thing and send as the POST body.

### Response format
The response body is **two independently base64-encoded frames concatenated**:
1. A data frame (flag byte `0x00`)
2. A trailer frame (flag byte `0x80`) containing `grpc-status` and `grpc-message`

**Do not** decode the whole body as one base64 string — the `=` padding of frame 1 appears mid-string and will cause a decode error.

Instead, decode frame-by-frame:
```
1. Read 8 chars → base64 decode → 6 bytes → first 5 = frame header
2. header[0] = flags, header[1:5] = big-endian payload length
3. b64Len = ((5 + frameLen + 2) / 3) * 4   ← full frame length in base64 chars
4. Decode clean[pos : pos+b64Len] with StdEncoding
5. Advance pos by b64Len, repeat
```

This logic lives in `decodeGRPCWebTextFrames()` in `alisclient.go` and is reused by all console API calls.

---

## Step 4 — Authentication

Console cookies come from an OAuth2 PKCE flow against `identity.alisx.com`. After login, they're stored in `~/.alis/console-credentials.json`:

```json
{
  "access_token": "...",
  "id_token": "...",
  "refresh_token": "...",
  "expiry": "..."
}
```

**All three cookies must be sent simultaneously** in every request:
```
Cookie: alis_access_token_fvc=<access_token>; alis_id_token_fvc=<id_token>; alis_refresh_token_fvc=<refresh_token>
```

The `ConsoleTokenSource` in `alisauth.go` handles reading, refreshing, and formatting this header. Use it in any new service:

```go
type MyNewService struct {
    tokens *ConsoleTokenSource
}

func NewMyNewService() *MyNewService {
    ts, _ := NewConsoleTokenSource() // nil if not logged in
    return &MyNewService{tokens: ts}
}
```

If `~/.alis/console-credentials.json` doesn't exist, call `PKCELogin()`. This is already wired up via `ProductService.Login()` — if your new service needs auth too, you can call the same `PKCELogin` function from `alisauth.go`.

---

## Step 5 — Implement the Go Service

Create a new file e.g. `environmentsservice.go` (or add to an existing service file).

### Pattern
```go
type MyService struct {
    tokens    *ConsoleTokenSource
    httpClient *http.Client
}

func (s *MyService) initTokens() error { ... }  // lazy init, returns error if not logged in

func (s *MyService) GetSomething(org, product string) (*MyResult, error) {
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := s.initTokens(); err != nil {
        return nil, err
    }

    protoBytes := marshalMyRequest(...)
    dataFrame, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx,
        "alis.os.something.v1.SomeService/GetSomething", protoBytes)
    if err != nil {
        return nil, fmt.Errorf("GetSomething: %w", err)
    }
    if grpcStatus != 0 {
        return nil, fmt.Errorf("GetSomething: grpc %d: %s", grpcStatus, grpcMsg)
    }
    if len(dataFrame) < 5 {
        return nil, fmt.Errorf("GetSomething: response too short")
    }
    return parseSomething(dataFrame[5:])
}
```

### Protobuf helpers
Hand-encode requests using `google.golang.org/protobuf/encoding/protowire`:

```go
func marshalMyRequest(parent string) []byte {
    var buf []byte
    buf = protowire.AppendTag(buf, 1, protowire.BytesType)
    buf = protowire.AppendString(buf, parent)
    return buf
}
```

Parse responses the same way — consume tags, switch on field number, recurse for nested messages.

### HTTP call
`doConsoleGRPCWeb` in `productservice.go` is the shared helper. Copy or reference it — it sets the Cookie header, Content-Type `application/grpc-web-text`, and calls `decodeGRPCWebTextFrames`.

---

## Step 6 — Write a Test First

Before touching the frontend, verify the Go service works against the real API:

```go
// yourservice_test.go
func TestGetSomethingLive(t *testing.T) {
    svc := NewMyService()
    result, err := svc.GetSomething("voyage", "vp")
    if err != nil {
        t.Fatalf("GetSomething: %v", err)
    }
    t.Logf("Name: %s", result.Name)
    // log all fields so you can see what came back
}
```

Run it:
```sh
go test -v -run TestGetSomethingLive -timeout 30s
```

If you're not logged in yet:
```sh
ALIS_TEST_LOGIN=1 go test -v -run TestPKCELoginFlow -timeout 2m .
```

Fix any proto parsing issues at this level — it's much faster than running the full app.

---

## Step 7 — Register the Service and Generate Bindings

In `main.go`, add the new service to the `Services` list:
```go
application.NewService(NewMyService()),
```

Then regenerate the TypeScript bindings:
```sh
wails3 generate bindings
```

This emits `frontend/bindings/alis-hub-v3/myservice.ts` (and `.js`). The exported function names match your Go method names exactly.

---

## Step 8 — Implement the Frontend

Import the generated bindings in your page component:

```tsx
import * as MS from '../../../bindings/alis-hub-v3/myservice';
```

Standard pattern for a data-loading page:
```tsx
const [data, setData] = useState<any>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
    MS.GetSomething(org, product)
        .then(setData)
        .catch(e => setError(String(e)))
        .finally(() => setLoading(false));
}, [org, product]);
```

### Opening external links
**Never use `window.open()` in a Wails desktop app** — it does nothing in the webview.
Use the Wails runtime instead:

```tsx
import { Browser } from '@wailsio/runtime';

// In a click handler:
Browser.OpenURL(url);
```

---

## Quick Reference

| Thing | Where it lives |
|---|---|
| Cookie auth | `alisauth.go` → `ConsoleTokenSource`, `PKCELogin` |
| HTTP + frame decode | `productservice.go` → `doConsoleGRPCWeb` |
| Frame decoder | `alisclient.go` → `decodeGRPCWebTextFrames` |
| Trailer parser | `alisclient.go` → `parseGRPCWebTrailer` |
| Login test | `productservice_test.go` → `TestPKCELoginFlow` |
| Credentials file | `~/.alis/console-credentials.json` |
| Bindings output | `frontend/bindings/alis-hub-v3/` |

---

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| `response too short (0 bytes)` | Wrong Content-Type (binary proto instead of grpc-web-text) | Use `application/grpc-web-text`, base64-encode request |
| `HTTP 307` redirect | Sending Bearer token instead of cookies | Use `Cookie:` header with all three alis cookies |
| `HTTP 400: invalid email address` | Service account token (wrong identity) | Use console credentials from PKCE, not `~/.alis/credentials.json` |
| `illegal base64 data at input byte N` | Decoding whole response body as one base64 string | Use `decodeGRPCWebTextFrames` — frame-by-frame decode |
| Fields parse as empty/zero | Wrong field number | Check browser JS (`combined.js`) for the actual field accessors |
