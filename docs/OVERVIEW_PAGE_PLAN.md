# Overview Page — Real Data Implementation Plan

Scraped from `console.alisx.com/build/landing-zone/voyage/vp/overview` on 2026-06-06.

---

## What the Overview Tab Shows

Three visual zones populated by two API calls:

```
┌─────────────────────────────────────┬──────────────────────────────────────┐
│ Welcome, {firstName}                │ Project Details                      │
│ ...description...                   │  Folder Identifier   1051179234025   │
│                                     │  Project Identifier  voyage-vp-…pi4  │
│                                     │  Project Number      189302744309    │
│                                     │  Billing Account     Alis Managed    │
│                                     │  Default Region      us-east4        │
├─────────────────────────────────────┤                                      │
│ <> Git Repository                   ├──────────────────────────────────────┤
│  ⬡  Git Remote Server      [copy][↗]│ Environments                         │
│  ⬡  Cloud Run Instance          [↗] │  staging      ● Active               │
│  ⬡  Compute Engine VM           [↗] │  Production   ● Active               │
│  ⬡  Cloud Storage Bucket        [↗] │  Development  ● Active               │
├─────────────────────────────────────┤                                      │
│ 🔷 Google Artifact Registry         │                                      │
│    Internal Packages                │                                      │
│  Go  Go package registry        [↗] │                                      │
│      Python package registry    [↗] │                                      │
│      Typescript package registry[↗] │                                      │
└─────────────────────────────────────┴──────────────────────────────────────┘
```

---

## API Calls Required

### 1. `GetProduct`

```
POST https://console.alisx.com/alis.os.products.v1.ProductsService/GetProduct
Content-Type: application/grpc-web+proto
Authorization: Bearer <token>
```

**Request protobuf wire encoding:**
```
field 1 (name, string):      "organisations/{org}/products/{product}"
field 2 (read_mask, message): FieldMask { paths: ["name","display_name","state",
                               "google_project","git_repo",
                               "internal_package_registries","docker_registries"] }
```

**Response protobuf field map (confirmed from live binary):**

| Field # | Name | Wire | Go Type |
|---------|------|------|---------|
| 1 | name | len | string |
| 2 | display_name | len | string |
| 3 | description | len | string |
| 5 | google_project | len | *GoogleProject |
| 8 | git_repo | len | *GitRepo |
| 9 | internal_package_registries | len | *PackageRegistries |
| 11 | docker_registries | len | *DockerRegistries |
| 21 | state | varint | int32 (1=ACTIVE) |

---

### 2. `ListEnvironments`

```
POST https://console.alisx.com/alis.os.products.v1.EnvironmentsService/ListEnvironments
Content-Type: application/grpc-web+proto
Authorization: Bearer <token>
```

**Request protobuf wire encoding:**
```
field 1 (parent, string):    "organisations/{org}/products/{product}"
field 4 (read_mask, message): FieldMask { paths: ["name","display_name",
                               "google_project","state"] }
```

**Response is repeated `Environment` messages (each a gRPC-web data frame or a single frame with repeated field 1):**

| Field # | Name | Wire | Go Type |
|---------|------|------|---------|
| 1 | name | len | string ("organisations/…/environments/{id}") |
| 2 | display_name | len | string |
| 5 | google_project | len | *GoogleProject |
| 7 | type | varint | int32 |
| 21 | state | varint | int32 (1=ACTIVE) |

**Live environment data decoded:**

| displayName | googleProject.id | googleProject.number | state |
|-------------|-----------------|----------------------|-------|
| staging | voyage-vp-dev-vzu | 1026238877752 | 1 (ACTIVE) |
| Production | voyage-vp-prod-m6z | 696061729288 | 1 (ACTIVE) |
| Development | voyage-vp-dev-7ll | 153213375393 | 1 (ACTIVE) |

---

## Nested Message Field Maps (all confirmed from live JS proto)

### `GoogleProject`
| Field # | Name | Go Type |
|---------|------|---------|
| 1 | folder_id | string |
| 2 | id | string ("voyage-vp-product-pi4") |
| 3 | number | string ("189302744309") |
| 4 | region | string ("us-east4") |
| 5 | billing_account_id | string |
| 6 | cloudrun_hash | string |
| 7 | managed_billing_account | bool (true → display "Alis Managed") |
| 8 | cloud_uri | string (GCP console URL) |

### `GitRepo`
| Field # | Name | Go Type |
|---------|------|---------|
| 1 | remote_uri | string |
| 2 | cloudrun | *GitRepoCloudrun { field 1: console_uri string } |
| 3 | vm | *GitRepoVm { field 1: console_uri string } |
| 4 | bucket | *GitRepoBucket { field 1: console_uri string } |

### `PackageRegistries`
| Field # | Name | Go Type |
|---------|------|---------|
| 1 | go_registry_uri | string |
| 2 | javascript_registry_uri | string |
| 3 | python_registry_uri | string |
| 4 | dart_run_uri | string |
| 5 | dart_bucket_uri | string |

### `DockerRegistries`
| Field # | Name | Go Type |
|---------|------|---------|
| 1 | internal_uri | string |

### `FieldMask` (google.protobuf.FieldMask)
| Field # | Name | Go Type |
|---------|------|---------|
| 1 | paths | repeated string |

---

## gRPC-Web Transport

The Go client should use **gRPC-web binary** (not the text/base64 variant the browser uses):

```
Content-Type: application/grpc-web+proto    ← binary frames
Accept: application/grpc-web+proto
Authorization: Bearer <token>               ← from ~/.alis/credentials.json
x-grpc-web: 1
```

Request framing (same as existing `alisclient.go`):
```
byte[0]    = 0x00 (uncompressed, data frame)
bytes[1:5] = big-endian uint32 length of proto payload
bytes[5:]  = proto-encoded message
```

Response parsing:
- Read 5-byte frame header → length
- Skip header, read `length` bytes as proto message
- Check for trailer frame (byte[0] == 0x80) which contains `grpc-status`

**Endpoint:** `https://console.alisx.com` (same-origin gRPC-web proxy)  
No need to discover a separate backend; the console is the gateway.

---

## What Needs to Be Built

### Backend: `productservice.go` (new file)

```go
// Go types
type ProductOverview struct {
    Name          string       `json:"name"`
    DisplayName   string       `json:"displayName"`
    State         int32        `json:"state"`
    GoogleProject *GCPProject  `json:"googleProject,omitempty"`
    GitRepo       *GitRepoInfo `json:"gitRepo,omitempty"`
    PackageRegistries *PkgRegistries `json:"packageRegistries,omitempty"`
    DockerRegistry string       `json:"dockerRegistry,omitempty"`
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

// Service methods
type ProductService struct{ alisClient *AlisClient }
func (s *ProductService) GetProductOverview(org, product string) (*ProductOverview, error)
func (s *ProductService) ListEnvironments(org, product string) ([]EnvInfo, error)
```

**Protobuf serialisation helpers needed:**
- `marshalGetProductRequest(name, fields []string) []byte` — hand-encode using `protowire`
- `marshalListEnvironmentsRequest(parent string, fields []string) []byte`
- `marshalFieldMask(paths []string) []byte`
- `parseProduct(data []byte) (*ProductOverview, error)` — parse fields 1,2,5,8,9,11,21
- `parseGoogleProject(data []byte) (*GCPProject, error)` — parse fields 1-8
- `parseGitRepo(data []byte) (*GitRepoInfo, error)` — parse fields 1-4
- `parsePackageRegistries(data []byte) (*PkgRegistries, error)` — parse fields 1-3
- `parseListEnvironmentsResponse(data []byte) ([]EnvInfo, error)` — repeated field 1

### Frontend: Update `AboutPage.tsx` → `OverviewPage.tsx`

Wire up to new Wails bindings and display:
1. **Project Details card** — `ProductOverview.GoogleProject.*`
2. **Git Repository card** — `ProductOverview.GitRepo.*` with copy-to-clipboard for `remoteUri` and `window.open()` links for `cloudRunUri`, `vmUri`, `bucketUri`
3. **Artifact Registry card** — `ProductOverview.PackageRegistries.*` with external links
4. **Environments list** — `[]EnvInfo` with state badge (1=Active=green, else yellow/red)

### Registration in `main.go`

```go
application.NewService(NewProductService()),
```

---

## Authentication Note (deferred)

The `AlisClient.doGRPC` in `alisclient.go` already reads `~/.alis/credentials.json` via `AlisTokenSource` and sends `Authorization: Bearer <token>`. The same token works for `console.alisx.com` — that's the same Alis identity system used in the browser (browser uses a cookie, Go client uses the header).

**No auth changes needed** — reuse existing `AlisClient` and change only `alisDbdHost` to `console.alisx.com:443` for these calls, or add a second client instance with that host.

---

## Implementation Order

1. Add `marshalFieldMask`, `marshalGetProductRequest`, `marshalListEnvironmentsRequest` to `alisclient.go`
2. Add parse functions for Product and Environment wire formats
3. Create `productservice.go` with `ProductService` and two exported methods
4. Register in `main.go`
5. Run `wails generate bindings` to emit TypeScript bindings
6. Update `AboutPage.tsx` with real data, loading states, and external link handling
