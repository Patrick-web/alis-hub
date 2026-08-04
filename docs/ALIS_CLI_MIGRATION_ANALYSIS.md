# Alis CLI Migration Analysis — What alis-hub-v3 Can Switch to the CLI

> This document maps where alis-hub-v3 reimplements platform functionality
> that could instead shell out to the `alis` CLI. The CLI is the canonical,
> supported interface to the Alis Build platform and has been observed to be
> more reliable than direct gRPC calls (particularly for build/deploy
> operations). See `ALIS_CLI_FEATURES.md` for the full CLI feature reference.

## Summary

alis-hub-v3 reimplements 12+ areas of platform interaction via a combination of
reverse-engineered gRPC-web-text calls to `console.alisx.com` and direct gRPC
calls to `auth.alis.build`. Of these, **6 areas are high-value candidates** for
immediate replacement with CLI calls, **3 are viable as complements**, and
**the rest are unique to the app or better kept as-is**.

---

## High-Value Candidates — Switch to CLI

These are areas where the app's current implementation is complex, fragile
(reverse-engineered protos/APIs), or known to have reliability issues, and
where the CLI provides a more stable, supported alternative.

### 1. Define — Proto Compilation Pipeline

**Current implementation:** `defineservice.go` — calls `alis.os.dbd.v1.DbdService/RunDefine` via direct gRPC/HTTP2 (`internal/alisclient/client.go`), then polls `google.longrunning.Operations/GetOperation` in a loop, parses operation results, and calls Glass AI for explanations.

```go
// Current: ~400 lines of manual gRPC wire encoding + polling + error handling
func (d *DefineService) RunDefine(...) (*alis_os_dbd_v1.Define, error)
func (d *DefineService) PollDefineOperation(...) (*alis_os_dbd_v1.Define, error)
func (d *DefineService) ExplainDefine(...) (*alis_os_glass_v1.ExplainDefineResponse, error)
```

**CLI replacement:**

```
alis define <pkg> --json --install
```

- `--json` gives machine-readable operation result on stdout
- `--install` chains package install automatically (removes the need for the separate package step)
- `--async` + `alis operations wait <name>` replaces manual polling with a ~20-line blocking call
- The CLI handles all the gRPC wire encoding, operation polling, error envelopes, and exit codes
- Glass AI explanations would still need to be called separately if needed

**Benefits:**
- Eliminates ~400 lines of fragile manual proto wire encoding
- No need to maintain reverse-engineered DBD proto types
- Built-in safety gates (production deploy confirmation, automation tier checks)
- Proper error handling via structured error envelopes
- Logs URI included in operation result

**Effort:** Medium — replace direct gRPC calls with `exec.Command("alis", "define", ...)` and parse JSON stdout

---

### 2. Build — Docker Image Building

**Current implementation:** `buildservice.go` — calls `alis.os.dbd.v1.DbdService/RunBuild` via direct gRPC, polls operations, fetches build logs, plus a separate local `docker build` path.

```go
func (b *BuildService) RunBuild(...) (*build.CloudBuildResponse, error)
func (b *BuildService) StartLocalBuild(...) error
func (b *BuildService) PollBuildOperation(...) (*build.PollResponse, error)
func (b *BuildService) FetchBuildLogs(...) ([]build.LogEntry, error)
```

**CLI replacement:**

```
alis build <pkg> --json [--deploy -e <env>] [--branch <branch>] [--commit <sha>]
```

- `--json` gives the final build result with `version` and `logsUri`
- `--deploy -e <env>` chains deploy onto build (combines two app pages into one CLI call)
- `--async` + `alis operations wait <name>` replaces polling
- `--retag` handles infra-only changes
- `--build-path` / `--retag-path` replace Dockerfile auto-detection

**Benefits:**
- Eliminates manual gRPC wire encoding (~500 lines)
- CLI's blocking wait is more reliable than manual polling (MCP server's `RunBuild` has been observed to report false-positive success)
- `--retag` path covers a use case the app currently handles separately
- Combines build + deploy into one atomic call (currently two separate app pages)

**Effort:** Medium — replace gRPC calls with `exec.Command("alis", "build", ...)`; keep local `docker build` path as it's unique

---

### 3. Deploy — Terraform Provisioning

**Current implementation:** `deployservice.go` — calls `alis.os.dbd.v1.DbdService/RunDeploy` via direct gRPC, polls operations, fetches deploy logs.

```go
func (d *DeployService) RunDeploy(...) (*alis_os_dbd_v1.DeployResponse, error)
func (d *DeployService) PollDeployOperation(...) (*DeployPollResponse, error)
func (d *DeployService) FetchDeployLogs(...) ([]DeployLogEntry, error)
```

**CLI replacement:**

```
alis deploy <pkg> --json -e <env-id> [--version <v>] [--plan-only]
```

- `--plan-only` gives Terraform plan without apply (not gated for production)
- `-e` is repeatable for multi-environment deploys
- Production gate: exit code 3 with `PRODUCTION_CONFIRMATION_REQUIRED` — the app can detect this and show its own confirmation UI, then re-run with `--confirm-production`
- `--allow-branch-mismatch` for branch mismatch scenarios

**Benefits:**
- Eliminates manual gRPC wire encoding (~300 lines)
- Built-in production safety gates (the CLI properly enforces them, unlike the app which would need to implement its own checks)
- `--plan-only` is not gated — safer preview workflow
- Proper error envelopes with `retry` commands

**Effort:** Medium — replace gRPC calls with `exec.Command("alis", "deploy", ...)`

---

### 4. Operation Polling — Long-Running Operations

**Current implementation:** Every DBD service has its own polling loop — `PollDefineOperation`, `PollBuildOperation`, `PollDeployOperation` — each with custom timeout logic, progress parsing, and error handling. Combined ~200 lines of polling infrastructure.

**CLI replacement:**

```
alis <cmd> --async              # start + return operation name
alis operations wait <name> --json   # re-attach + stream to completion
alis operations describe <name> --json   # one-shot state poll
```

- `--async` returns immediately with the operation name
- `operations wait` blocks efficiently (no sleep loops) and streams progress to stderr
- `operations describe` gives a snapshot without blocking
- `--timeout <dur>` controls client-side wait without cancelling the server-side operation
- Ctrl-C / SIGTERM never cancels the operation — re-attach with `operations wait`

**Benefits:**
- Replaces 3 separate polling implementations with one uniform pattern
- No sleep-loop polling (the CLI uses efficient server-side wait)
- Proper interrupt handling (Ctrl-C doesn't abort server-side work)
- Progress events already parsed into NDJSON on stderr

**Effort:** Low — uniform pattern across all DBD commands

---

### 5. Package Management

**Current implementation:** `packageservice.go` — scans neuron builds for Go/Node/Python/Dart manifests, calls `alis.os.vscode.v2.VscodeService/GeneratePackageScripts` (another reverse-engineered gRPC), generates shell scripts, and runs them in an embedded PTY terminal.

```go
func (p *PackageService) ScanNeuronBuilds(...) ([]PackageScanResult, error)
func (p *PackageService) GenerateUpgradeScript(...) (string, error)
func (p *PackageService) GenerateInstallScript(...) (string, error)
func (p *PackageService) RunScriptInTerminal(...) error
```

**CLI replacement:**

```
alis packages install <pkg> --json       # install all packages + pull latest defined package
alis packages upgrade <pkg> --json       # upgrade alis.build packages
alis packages upgrade <pkg> --json --all # upgrade everything including third-party
alis packages add <pkg> --json           # add the service's Alis-defined package
```

- Credentials are refreshed automatically (no separate auth step needed)
- The CLI calls the same VS Code service internally but handles the scripting
- `--install` on `alis define` chains package install after define success

**Benefits:**
- Eliminates the reverse-engineered `VscodeService` gRPC call
- No need to generate and execute scripts in PTY
- Credential refresh is automatic
- Language filtering via `--install-language` on `alis define --install`

**Effort:** Medium — replace script generation + PTY execution with direct CLI calls

---

### 6. Code Blocks — Catalog, Install, Upgrade, Uninstall

**Current implementation:** `product_blocks.go` + `product_codeblocks.go` — calls `alis.bl.blocks.v1.BlocksService` via the Console API (gRPC-web-text + session cookies), handles entitlements and plans.

```go
func (p *ProductService) ListBlocks(...) ([]*alis_bl_blocks_v1.Block, error)
func (p *ProductService) GetBlock(...) (*alis_bl_blocks_v1.Block, error)
func (p *ProductService) InstallBlock(...) error
func (p *ProductService) UpdateBlock(...) error
func (p *ProductService) CreateBlock(...) error
func (p *ProductService) CreateBlockVersion(...) error
func (p *ProductService) MergeBlockBranches(...) error
```

**CLI replacement:**

```
alis blocks list [<pkg>] --json                    # installed + available blocks
alis blocks install <block-id> [<pkg>] --json       # install a block
alis blocks upgrade <block-id> [<pkg>] --json       # upgrade installed block
alis blocks uninstall <block-id> [<pkg>] --json     # uninstall a block
alis blocks versions <block-id> --json              # list block versions
alis blocks create <block-id> [<pkg>] --json        # create from existing code
alis blocks publish <block-id> [<pkg>] --json       # publish new version
alis blocks merge <block-id> [<pkg>] --json         # merge block git branch
alis blocks accounts --json                         # list publish-eligible accounts
```

**Benefits:**
- Eliminates Console API dependency for blocks (session cookies, gRPC-web-text encoding)
- `merge` handles the git merge step the app currently does manually
- `publish` handles version creation end-to-end
- `accounts` shows which accounts can publish — currently not easily surfaced in the app

**Effort:** Medium — replace Console API calls with CLI calls; keep the block catalog browsing UI but back it with `alis blocks list --json`

---

## Viable Complements — Use CLI Alongside Existing Code

These are areas where the app has its own implementation, but the CLI can
augment or simplify some operations.

### 7. Environment Management

**Current implementation:** `product_envs.go` — calls Console API (`EnvironmentsService`) for CRUD, environment variables, and activation (writes `.alis/.env`).

**CLI complement:**

```
alis environment new <org>.<product> --json         # create environment
alis environment variables <org>.<product> --json   # list all variables
alis environment set <org>.<product>.<env> KEY=VAL --json  # set variables
alis environment unset <org>.<product>.<env> KEY --json    # unset variables
alis environment refresh <org>.<product>.<env> --json      # print .env file
alis environment branches <org>.<product>.<env> --json     # view/set designated branches
```

**Recommendation:** Use CLI for `set`/`unset`/`refresh`/`branches` (production safety gates apply to variable changes on production environments). Keep the Console API for `new`/list/delete if the CLI doesn't support delete, and keep the app's environment activation logic (writing `.alis/.env`).

**Benefits:**
- Production safety gates on `environment set`/`unset` for production envs
- `refresh` handles `.env` generation (the CLI version may differ from the app's)
- `branches` for branch designation — no Console API equivalent

---

### 8. Context Resolution

**Current implementation:** Various Zustand stores (`workspace`, `platform`) track the current org, product, service, and environment. Context is inferred from the working directory and user selection.

**CLI complement:**

```
alis context view [<org>.<product>] --json
```

Returns: organisation, product, service (package ID), local folders, and **all product environments** with id, display name, status, and production flag. Environment IDs for `-e` come from here — never from guessing.

**Recommendation:** Use `alis context view --json` as the canonical source of truth for environment IDs and production flags. Keep the app's own workspace state for UI purposes, but source environment data from the CLI rather than the Console API.

**Benefits:**
- Environment IDs are guaranteed correct (no guessing)
- Production flag is authoritative (used for safety gates)
- Service/package ID resolution from cwd — less fragile than path parsing

---

### 9. Skills Discovery and Installation

**Current implementation:** `buildkitservice.go` — lists build specs from `BuildSpecsService`, including skills. A "BuildKit" page shows agent configuration. No skill loading/installation workflow.

**CLI complement:**

```
alis skills search "<query>" --json       # semantic skill search
alis skills load <id> --json             # load skill instructions (markdown)
alis skills resource <id> <path> --json   # fetch skill resource file
alis skills install <id> [--project] --json  # install into local agent harness
alis skills installed --json             # list installed skills
alis skills upgrade --all --json         # upgrade all installed skills
alis skills uninstall <id> --json        # remove installed skill
```

**Recommendation:** Add a skills browser/search page backed by `alis skills search` and `alis skills load`. This would provide the actual skill content (markdown instructions) that the current BuildKit page lacks. `alis skills install` would enable local agent integration (Claude Code, etc.) that isn't currently possible.

**Benefits:**
- Actual skill content (markdown) vs. just metadata from BuildSpecs
- Skills agent workflow: search → load → resource
- Local harness installation for AI coding agents
- Skill authoring pipeline (`create → edit → publish`)

---

## Not Recommended for CLI Migration

These are areas where the app's implementation is either better than the CLI's,
unique to the desktop use case, or complementary rather than overlapping.

| Area | Reason to Keep |
|---|---|
| **Git source control** (`gitservice.go`) | The app has a full git GUI (staging, diffs, branches, merge, stash, bisect). `alis git configure` only provides repo config. The app's git implementation is a major feature, not a CLI wrapper. |
| **GCloud tools** (`gcloudservice.go`) | The app has Spanner explorer, Cloud Logging, Artifact Registry, Cloud Storage, Secret Manager, Cloud Run. `alis gcloud auth` only provides auth tokens. The app's tools are a desktop-native GCP console. |
| **Workflows** (`workflowservice.go`) | Custom workflow engine with DAG steps (shell, define, build, deploy, git, wait). No CLI equivalent. The CLI's `build --deploy` chains build+deploy but doesn't do multi-step DAGs. |
| **ProtoDecode** (`protodecodeservice.go`) | Protobuf compilation and Spanner column decoding. No CLI equivalent. This is a unique debugging tool. |
| **LocalAI** (`localaiservice.go`) | Ollama integration for local AI (commit message generation, etc.). No CLI equivalent. Complementary to `alis ask` which queries platform content. |
| **Changelog** (`changelogservice.go`) | App-specific release notes from embedded CHANGELOG.md. No CLI equivalent. |
| **Auth** (`alisauth.go`, `alisclient_bridge.go`) | OAuth2 PKCE flow, token management, git credential helper. The app needs its own auth for identity and for the Console API calls it will keep. `alis login` could be an alternative entry point, but the app needs tokens for non-CLI API calls. |
| **Glass AI Explanations** (`defineservice.go`) | `ExplainDefine` calls `alis.os.glass.v1.GlassService` for natural-language explanations of define results. The CLI doesn't expose this. If the app switches to `alis define`, it could still call Glass AI separately. |
| **Build Kit** (`buildkitservice.go`) | Build specs for agents, tools, MCP servers, etc. The CLI doesn't expose build spec management. Keep this as-is, supplement with skills from the CLI. |
| **Dashboard / Home** | The app's home page, product overview, org listings, etc. The CLI provides `org list/view`, `product view`, `context view` but not a rich dashboard. Keep the app's UI. |
| **Settings** (`settingsservice.go`) | App-specific key/value settings in SQLite. No CLI equivalent. |
| **Logs** (`logservice.go`) | App-specific log viewing. No CLI equivalent. |

---

## Migration Roadmap

### Phase 1 — DBD Pipeline (highest impact)
Switch Define, Build, Deploy, and operations polling to the CLI. This is the
core loop that currently relies on the most fragile reverse-engineering.

1. Replace `RunDefine` + `PollDefineOperation` with `alis define --json [--install]`
2. Replace `RunBuild` + `PollBuildOperation` + `FetchBuildLogs` with `alis build --json`
3. Replace `RunDeploy` + `PollDeployOperation` + `FetchDeployLogs` with `alis deploy --json -e <env>`
4. Unify operation polling behind `alis operations wait --json`

### Phase 2 — Package Management
Replace script generation + PTY execution with direct CLI calls.

1. Replace `GenerateInstallScript` + `RunScriptInTerminal` with `alis packages install --json`
2. Replace `GenerateUpgradeScript` + `RunScriptInTerminal` with `alis packages upgrade --json`
3. Chain install into define via `alis define --json --install`

### Phase 3 — Code Blocks
Replace Console API calls with CLI for blocks operations.

1. Replace `ListBlocks` / `GetBlock` with `alis blocks list --json`
2. Replace `InstallBlock` with `alis blocks install --json`
3. Replace `UpdateBlock` with `alis blocks upgrade --json`
4. Replace `CreateBlock` / `CreateBlockVersion` with `alis blocks create --json` + `alis blocks publish --json`

### Phase 4 — Environment Management (partial)
Supplement Console API calls with CLI for variable management and branch designation.

1. Add `alis environment set/unset --json` for variable changes
2. Add `alis environment branches --json` for branch designation
3. Consider `alis context view --json` as canonical environment data source

### Phase 5 — Skills & Context
Add new features powered by the CLI.

1. Add a skills browser/search using `alis skills search/load/resource --json`
2. Add skill installation via `alis skills install --json`
3. Use `alis context view --json` as the canonical environment data provider
4. Consider `alis ask --json` for AI-powered Q&A over platform content
5. Consider `alis doctor --json` for diagnostics

---

## Implementation Pattern

For all CLI integrations, use a consistent Go wrapper:

```go
type CLIRunner struct{}

func (c *CLIRunner) Run(ctx context.Context, args ...string) (*CLIResult, error) {
    cmd := exec.CommandContext(ctx, "alis", args...)
    var stdout, stderr bytes.Buffer
    cmd.Stdout = &stdout
    cmd.Stderr = &stderr
    err := cmd.Run()

    result := &CLIResult{
        ExitCode: cmd.ProcessState.ExitCode(),
        Stdout:   stdout.Bytes(),
        Stderr:   stderr.Bytes(),
    }

    if err != nil {
        // Parse error envelope from stdout if --json was used
        if env := parseErrorEnvelope(result.Stdout); env != nil {
            result.Error = env
        }
    }

    return result, err
}
```

Key handling rules:
- Exit code 0: parse JSON result from stdout
- Exit code 1: parse error envelope from stdout, diagnose from stderr
- Exit code 3: prompt user for confirmation, re-run with `retry` command
- Exit code 4: user must run `alis login`
- Never parse stderr for results (it carries progress/NDJSON)
- Use `--json` on every call
- Stream progress from stderr (NDJSON) to the app's progress UI

### Progress Streaming

For long-running operations where the app wants to show progress, either:
1. Use `--async` + poll `alis operations describe <name> --json` periodically (for simple status bars)
2. Capture stderr NDJSON stream and parse `state` transitions (for rich progress UIs)

---

## Risks & Considerations

1. **CLI must be installed** — The app currently has no dependency on the `alis` CLI. Migration would require it to be present. Could bundle or install it as part of the app setup, or fall back to the current gRPC implementation if not found.

2. **Version compatibility** — The CLI evolves. The app should check `alis version` and warn if the installed version is below a known minimum.

3. **Auth state sharing** — The CLI uses the same `~/.alis` directory for auth state. If the app and CLI share auth, `alis login` / `alis authorise` may interact with the app's own auth. This is likely fine since both use OAuth2 with `~/.alis`.

4. **Latency** — Spawning a process (`exec.Command`) has more overhead than an in-process gRPC call. For the DBD pipeline (which takes minutes), this is negligible. For fast queries (context view, blocks list), measure and decide.

5. **Error surface** — The CLI's error envelopes are richer than what the app currently handles (structured `code`, `message`, `retry`, `agent` fields). The app should fully embrace this pattern for better error UX.

6. **Testability** — Direct gRPC calls are easier to mock in tests. CLI calls require either a test wrapper or integration tests against a real `alis` installation. Consider an interface-based abstraction.
