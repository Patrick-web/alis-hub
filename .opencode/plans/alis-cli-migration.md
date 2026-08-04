# alis CLI Migration — Implementation Plan

> Branch: `experiment/alis-cli-migration`  
> CLI version: 1.64.4  
> Test service: `voyage.vp.asana.v1` (package: `voyage.vp.asana.v1`, neuron: `organisations/voyage/products/vp/neurons/asana-v1`)

---

## Strategy: Zero Frontend Changes

The existing Wails-bound Go methods (`RunDefine`, `PollDefineOperation`, etc.) keep their
**exact same signatures and return types**. The frontend bindings are
auto-generated and must not change. Only the Go implementation switches from
direct gRPC to `exec.Command("alis", ...)`.

The response types (`RunDefineResult`, `RunBuildResult`, `RunDeployResult`, etc.)
are plain Go structs with JSON tags — they serve as the stable API contract
between backend and frontend.

---

## Phase 1 — CLI Wrapper Package (foundation)

### 1.1 Create `internal/cliwrap/cli.go`

A thin, testable Go package that wraps `exec.Command("alis", ...)`. This is the
single point of CLI interaction used by all migrated services.

```go
package cliwrap

type Runner struct {
    AlisPath string // default "alis"
}

// Run executes `alis [args] --json` and returns parsed stdout + raw stderr + exit code.
func (r *Runner) Run(ctx context.Context, args ...string) (*Result, error)

// RunAsync executes with --async, returns the parsed operation name immediately.
func (r *Runner) RunAsync(ctx context.Context, args ...string) (string, error)

// Describe calls `alis operations describe <opName> --json`, returns parsed JSON.
func (r *Runner) Describe(ctx context.Context, opName string) (*OperationState, error)

// Wait calls `alis operations wait <opName> --json` and streams NDJSON progress on stderr
// to the provided callback. Blocks until completion or context cancellation.
func (r *Runner) Wait(ctx context.Context, opName string, onProgress func(ProgressEvent)) (*OperationState, error)

type Result struct {
    Stdout   json.RawMessage
    ExitCode int
    RetryCmd string
}

type OperationState struct {
    Name     string
    Done     bool
    Error    string
    Response json.RawMessage
    Metadata json.RawMessage
}

type ProgressEvent struct {
    Note string `json:"note,omitempty"`
}
```

### 1.2 Unit tests for `cliwrap`

- `TestParseAsyncOutput` — Parses `{"name":"operations/..."}` from `alis define --json --async`
- `TestParseDescribeOutput` — Parses `operations describe` result (done, error, response fields)
- `TestParseErrorEnvelope` — Exit 3 `PRODUCTION_CONFIRMATION_REQUIRED` → extracts `retry` field
- `TestExitCode3` — Exit code 3 mapped to a typed `ErrConfirmationRequired`
- `TestExitCode4` — Exit code 4 mapped to a typed `ErrUnauthenticated`
- `TestCLINotFound` — `alis` not in PATH → clear error message
- `TestNeuronToPackageID` — resource name → package ID conversion (`organisations/x/products/y/neurons/a-v1` → `x.y.a.v1`)
- `TestExtractEnvID` — environment resource name → ID extraction

---

## Phase 2 — Define Service Migration

### 2.1 Replace gRPC with CLI

**Current:** `defineservice.go:RunDefine` → `s.alisClient.RunDefine(ctx, req)` via gRPC-web to `auth.alis.build`.

**New:** shells out to `alis define <pkg> --json --async`.

| Current Go param | CLI equivalent |
|---|---|
| `neuron` (resource name) | Convert to package ID `voyage.vp.asana.v1` |
| `commit` (SHA) | `--commit <sha>` |
| `releaseType` | Omit (use default) |

```go
func (d *DefineService) RunDefine(neuron, commit, releaseType string) (*RunDefineResult, error) {
    pkg := neuronToPackageID(neuron)
    args := []string{"define", pkg, "--json", "--async"}
    if commit != "" { args = append(args, "--commit", commit) }

    opName, err := d.cli.RunAsync(ctx, args...)
    if err != nil { return nil, err }

    return &RunDefineResult{OperationName: opName, Done: false}, nil
}
```

`PollDefineOperation` calls `d.cli.Describe(ctx, name)` → maps `OperationState` to `RunDefineResult`.

**Keep as-is:** `ExplainDefine` (Glass AI — no CLI equivalent), `GetDefineCommits` (local git), `ScanNeuronPackages` (local filesystem).

### 2.2 Tests — Define with asana-v1

| Test | CLI command |
|---|---|
| `TestCLIDefine_AsanaV1_Async` | `alis define voyage.vp.asana.v1 --json --async` |
| `TestCLIDefine_AsanaV1_Poll` | `alis operations describe <opName> --json` |
| `TestCLIDefine_AsanaV1_Blocking` | `alis define voyage.vp.asana.v1 --json` (full blocking) |

---

## Phase 3 — Build Service Migration

### 3.1 Replace gRPC with CLI

**Current:** `buildservice.go:RunBuild` → `s.alisClient.RunBuild(ctx, req)`.

**New:** `alis build <pkg> --json --async`.

| Current Go param | CLI equivalent |
|---|---|
| `neuron` | Convert to package ID |
| `commit` | `--commit <sha>` |
| Dockerfile paths (auto-scanned) | CLI auto-detects (default) |

`PollBuildOperation` → calls `d.cli.Describe(ctx, name)`, parses `logsUri`, `version`, `neuronVersion`, `notes`.

**Keep as-is:** `StartLocalBuild`/`PollLocalBuild` (local Docker), `GetBuildCommits`/`GetBuildBranches`/`GetCurrentBranch` (local git), `FetchBuildLogs` (HTTP fetch — logsUri now sourced from CLI operation result).

### 3.2 Tests — Build with asana-v1

| Test | CLI command |
|---|---|
| `TestCLIBuild_AsanaV1_Async` | `alis build voyage.vp.asana.v1 --json --async` |
| `TestCLIBuild_AsanaV1_Poll` | `alis operations describe <opName> --json` |
| `TestCLIBuild_AsanaV1_Retag` | `alis build voyage.vp.asana.v1 --json --retag --async` |
| `TestCLIBuild_AsanaV1_WithDeploy` | `alis build voyage.vp.asana.v1 --json --deploy -e <dev-env> --plan-only` |

---

## Phase 4 — Deploy Service Migration

### 4.1 Replace gRPC with CLI

**Current:** `deployservice.go:RunDeploy` → `s.alisClient.RunDeploy(ctx, req)`.

**New:** `alis deploy <pkg> --json --async -e <env-id>`.

| Current Go param | CLI equivalent |
|---|---|
| `neuron` | Convert to package ID |
| `version` | `--version <v>` |
| `environments` (resource names) | `-e <env-id>` (repeatable) |
| `planOnly` | `--plan-only` |
| `beta` | Omit (CLI handles beta deploys) |

`PollDeployOperation` → calls `d.cli.Describe(ctx, name)`, parses `version`, `deployments[]` (with per-env `logsUri`).

**Special handling for exit code 3:**
```go
if errors.Is(err, cliwrap.ErrConfirmationRequired) {
    return &RunDeployResult{
        Error: "PRODUCTION_CONFIRMATION_REQUIRED",
        Notes: err.RetryCmd, // retry command with --confirm-production
    }, nil
}
```

**Keep as-is:** `ListNeuronVersions` (no CLI equivalent), `FetchDeployLogs` (HTTP fetch).

### 4.2 Tests — Deploy with asana-v1

| Test | CLI command |
|---|---|
| `TestCLIDeploy_AsanaV1_PlanOnly` | `alis deploy voyage.vp.asana.v1 --json -e <dev-env> --plan-only` |
| `TestCLIDeploy_AsanaV1_Poll` | `alis operations describe <opName> --json` |
| `TestCLIDeploy_ProductionGate` | `alis deploy voyage.vp.asana.v1 --json -e <prod-env>` (expect exit 3) |

All deploy tests use `--plan-only` (Terraform plan, no infrastructure changes).

---

## Phase 5 — Packages Migration

### 5.1 Replace script generation + PTY with CLI

**Current:** `packageservice.go` scans manifests → calls VSCode service → runs scripts in PTY.

**New:** direct CLI calls.

| Operation | CLI command |
|---|---|
| Install | `alis packages install voyage.vp.asana.v1 --json` |
| Upgrade | `alis packages upgrade voyage.vp.asana.v1 --json` |
| Upgrade all | `alis packages upgrade voyage.vp.asana.v1 --json --all` |
| Add package | `alis packages add voyage.vp.asana.v1 --json` |

**Keep:** `StartVenvSetup` (local Python venv — no CLI equivalent).

---

## Phase 6 — Code Blocks Migration

Replace Console API calls (`doConsoleGRPCWeb` to `console.alisx.com`) with CLI.

| Current Go method | CLI equivalent |
|---|---|
| `ListCodeblocks` | `alis blocks list voyage.vp.asana.v1 --json` |
| `DoInstallBlock` | `alis blocks install <blockId> voyage.vp.asana.v1 --json` |
| `UpgradeCodeblockInstance` | `alis blocks upgrade <blockId> voyage.vp.asana.v1 --json` |
| `UninstallCodeblockInstance` | `alis blocks uninstall <blockId> voyage.vp.asana.v1 --json` |
| `CreateCodeblock` | `alis blocks create <blockId> voyage.vp.asana.v1 --json` |
| `ContributeBlock` | `alis blocks publish <blockId> voyage.vp.asana.v1 --json` |
| `MergeBlockInstance` | `alis blocks merge <blockId> voyage.vp.asana.v1 --json` |
| `ListCodeblockVersions` | `alis blocks versions <blockId> --json` |

**Keep Console API for:** `GetCodeblockDoc`, `GetCodeblockMembers`, `ListMyCodeblocks`, IAM management (no CLI equivalents).

---

## Phase 7 — Environment & Context (Complement)

### 7.1 Environment variables

Supplement Console API with CLI for mutation operations (which have production safety gates):

| Operation | CLI command |
|---|---|
| List env vars | `alis environment variables voyage.vp --json` |
| Set env var | `alis environment set voyage.vp.<env> KEY=VALUE --json` |
| Unset env var | `alis environment unset voyage.vp.<env> KEY --json` |
| Refresh .env | `alis environment refresh voyage.vp.<env> --json` |
| Branch designation | `alis environment branches voyage.vp.<env> --json` |

### 7.2 Context

Use `alis context view voyage.vp --json` as canonical source for environment IDs and production flags (replaces path-parsing heuristics).

---

## Dual-Backend Interface (Safety Net)

```go
type DBDBackend interface {
    RunDefine(ctx context.Context, pkg, commit string) (string, error)
    PollDefine(ctx context.Context, opName string) (*RunDefineResult, error)
    RunBuild(ctx context.Context, pkg, commit string) (string, error)
    PollBuild(ctx context.Context, opName, neuron string) (*RunBuildResult, error)
    RunDeploy(ctx context.Context, pkg, version string, envs []string, planOnly bool) (string, error)
    PollDeploy(ctx context.Context, opName string) (*RunDeployResult, error)
}

type CLIBackend struct { runner *cliwrap.Runner }
type GRPCBackend struct { client *alisclient.AlisClient }
```

At startup: if `alis` found in PATH → `CLIBackend`, else → `GRPCBackend`. This enables incremental rollout and easy rollback.

---

## Test Strategy

### Test Pyramid

```
         ┌─────────┐
         │  E2E    │  Manual: full DBD cycle on asana-v1 in the running app
         │─────────│
         │ Integr. │  Go tests: real CLI + real backend + real asana-v1 service
         │─────────│
         │  Unit   │  cliwrap: JSON parsing, package ID conversion, exit codes
         └─────────┘
```

### Unit Tests (`internal/cliwrap/cli_test.go`)

Pure logic, no external deps:
- `TestParseAsyncOutput` — `{"name":"operations/..."}` → operation name
- `TestParseDescribeOutput` — done/error/response fields
- `TestParseErrorEnvelope` — exit 3 → retry field extraction
- `TestExitCodeMapping` — 0/1/3/4 → typed errors
- `TestCLINotFound` — binary missing → descriptive error
- `TestNeuronToPackageID` — resource name ↔ package ID conversion
- `TestExtractEnvID` — resource name → env ID

### Integration Tests (real CLI + backend)

Run with `go test -tags=cli ./...`. Skip if `alis` not found or not logged in.

| Test | What it validates |
|---|---|
| `TestCLI_DefineStart` | `alis define voyage.vp.asana.v1 --json --async` → non-empty op name |
| `TestCLI_DefineFull` | Blocking define → done=true, version, artifacts |
| `TestCLI_BuildStart` | `alis build voyage.vp.asana.v1 --json --async` → non-empty op name |
| `TestCLI_BuildFull` | Blocking build → version, logsUri |
| `TestCLI_DeployPlanOnly` | `alis deploy ... -e <dev> --plan-only` → done, deployments[] |
| `TestCLI_PackagesInstall` | `alis packages install voyage.vp.asana.v1 --json` → success |
| `TestCLI_OperationsDescribe` | Async start → `operations describe` → state transitions |
| `TestCLI_ProductionGate` | Deploy to prod without confirm → exit 3 + retry field |
| `TestCLI_ContextView` | `alis context view voyage.vp --json` → environments + production flag |

```go
func TestCLI_DefineStart(t *testing.T) {
    if _, err := exec.LookPath("alis"); err != nil {
        t.Skip("alis CLI not installed")
    }
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    cli := cliwrap.New("alis")
    opName, err := cli.RunAsync(ctx, "define", "voyage.vp.asana.v1")
    if errors.Is(err, cliwrap.ErrUnauthenticated) {
        t.Skip("not logged in to alis")
    }
    if err != nil {
        t.Fatalf("define async: %v", err)
    }
    if opName == "" {
        t.Fatal("expected non-empty operation name")
    }
    t.Logf("Operation: %s", opName)

    result, err := cli.Describe(ctx, opName)
    if err != nil {
        t.Fatalf("describe: %v", err)
    }
    t.Logf("Done: %v, Error: %s", result.Done, result.Error)
}
```

### Manual E2E Verification

After all phases, run the app and perform a full DBD cycle on asana-v1:
1. Open Develop → select asana-v1
2. Run Define (verify operation starts, polls, completes)
3. Run Build (verify operation starts, streams logs, completes with version)
4. Run Deploy to development with `--plan-only` (verify Terraform plan output)
5. Install/upgrade packages (verify CLI calls succeed)

---

## Implementation Order

| Step | Phase | Effort | Dependencies |
|---|---|---|---|
| 1 | Create `internal/cliwrap/cli.go` | 1 day | — |
| 2 | Unit tests for cliwrap | 0.5 day | Step 1 |
| 3 | Capture CLI JSON output fixtures | 0.5 day | Steps 1-2 |
| 4 | Add `DBDBackend` interface + `CLIBackend` | 1 day | Steps 1-3 |
| 5 | Migrate `DefineService` to `DBDBackend` | 0.5 day | Step 4 |
| 6 | Define integration tests (asana-v1) | 0.5 day | Step 5 |
| 7 | Migrate `BuildService` to `DBDBackend` | 0.5 day | Step 4 |
| 8 | Build integration tests (asana-v1) | 0.5 day | Step 7 |
| 9 | Migrate `DeployService` to `DBDBackend` | 0.5 day | Step 4 |
| 10 | Deploy integration tests (asana-v1, plan-only) | 0.5 day | Step 9 |
| 11 | Migrate `PackageService` install/upgrade | 0.5 day | Step 1 |
| 12 | Migrate code blocks (`product_blocks.go`) | 1 day | Step 1 |
| 13 | Environment variables (`product_envs.go`) | 0.5 day | Step 1 |
| 14 | Context view integration | 0.5 day | Step 1 |
| 15 | Remove unused gRPC code (manual protowire) | 0.5 day | Steps 5-10 verified |
| 16 | Manual E2E: full DBD cycle on asana-v1 | 0.5 day | All |

**Total: ~8-9 days.**

---

## Files Created / Modified

### New files
| File | Purpose |
|---|---|
| `internal/cliwrap/cli.go` | CLI execution wrapper |
| `internal/cliwrap/cli_test.go` | Unit tests for CLI wrapper |
| `internal/cliwrap/testdata/*.json` | Captured CLI JSON output fixtures |
| `internal/cliwrap/operations.go` | Operation-specific JSON parsing |
| `internal/cliwrap/pkgid.go` | Package ID ↔ resource name conversion |
| `deployservice_test.go` | Deploy integration tests |

### Modified files
| File | Change |
|---|---|
| `defineservice.go` | Use `DBDBackend` instead of `*alisclient.AlisClient` |
| `defineservice_test.go` | Add CLI-backed tests |
| `buildservice.go` | Use `DBDBackend` |
| `buildservice_test.go` | Add CLI-backed tests |
| `deployservice.go` | Use `DBDBackend` |
| `packageservice.go` | Add CLI install/upgrade methods |
| `product_blocks.go` | Add CLI-backed block operations |
| `product_envs.go` | Add CLI-backed variable management |
| `main.go` | Backend selection: CLI vs gRPC |

### NOT modified
| File | Reason |
|---|---|
| `frontend/bindings/alis-hub-v3/*.ts` | Auto-generated; signatures unchanged |
| `frontend/src/app/components/develop/*.tsx` | No frontend changes needed |
| `internal/alisclient/client.go` | Kept for Glass AI, VSCode, Console API |

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| `alis` CLI not installed | `cliwrap.New("alis")` checks `exec.LookPath`; fall back to gRPC `DBDBackend` |
| CLI version incompatibility | `cliwrap` checks `alis version --json`; logs warning if below minimum |
| JSON output format changes | Captured fixture snapshots in `testdata/`; unit tests validate parsing |
| Exit code 3 blocking deploys | Surfaces as `result.Error = "PRODUCTION_CONFIRMATION_REQUIRED"` with retry cmd in `Notes` |
| gRPC still needed for some APIs | Keep `AlisClient` for Glass AI, VSCode, Console API calls |
| Tests create real resources | Deploy tests use `--plan-only`; define/build create versions but don't deploy |

---

## Open Questions

1. **CLI output shapes** — Exact JSON fields from `alis operations describe --json` to be verified and captured as fixtures early in Phase 1.

2. **Environment ID format** — Does `alis deploy -e` accept numeric ID (`1y2ozw66zv6p3`) or display name (`staging`)? Verify during implementation.

3. **`--install` chaining** — Should `alis define --install` replace the separate package flow? Currently the app has distinct define and package steps.

4. **Local build** — Keep `StartLocalBuild` path (`docker build` directly) for debugging, as CLI has no local build equivalent.

5. **Credential sharing** — Both app and CLI use `~/.alis` for OAuth state. Verify no conflicts when both access credentials concurrently.
