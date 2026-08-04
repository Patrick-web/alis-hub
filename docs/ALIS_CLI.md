# Alis CLI — current command reference (v1.54.0, superseded)

> **This document has been superseded by [ALIS_CLI_FEATURES.md](./ALIS_CLI_FEATURES.md)**
> which covers the latest CLI version (v1.64.4) with complete feature documentation.
> See also [ALIS_CLI_MIGRATION_ANALYSIS.md](./ALIS_CLI_MIGRATION_ANALYSIS.md) for
> what this project can switch to using the CLI.

> Originally verified against `alis` v1.54.0 (darwin-arm64). The binary
> reverse-engineering notes in the appendix describe an older TUI-era build
> (v1.0.54) and are kept for historical/internal-wiring context only.

## Purpose of this doc

This repo (AlisHub) reimplements/wraps the same platform surface the `alis`
CLI exposes. This document is retained for historical reference on the
underlying gRPC wiring and the rationale for preferring the CLI over the
MCP server or direct gRPC calls.

## Command surface (`alis --help`)

| Command | Purpose |
|---|---|
| `accounts [command]` | Choose the Build-subscription/billing account |
| `authorise [<org>.<product>]` (alias `a`) | Refresh git + package credentials for a product |
| `blocks [command]` | Browse/manage a service's code blocks |
| `build [<package-id>]` | Build a service into a new version; `--deploy` chains a deploy |
| `context [command]` | Workspace context / telemetry for local coding-agent sessions |
| `define [<package-id>]` | Compile a service's protos into a new version; `--install` pulls generated packages |
| `deploy [<package-id>]` | Deploy a built version to one or more environments (Terraform-backed) |
| `docs [<topic>]` | Print the operating manual (see topics below) |
| `doctor` | Diagnose the local Alis Build environment; `--ticket <id>` uploads to support |
| `environment [command]` | Manage/refresh environment env-vars |
| `gcloud [command]` | `gcloud auth <org>.<product>` — artifact registry / npm / dart auth tokens |
| `login [code]` / `whoami` | Auth |
| `operations [command]` | `describe <op>` (one-shot poll), `wait <op>` (reattach + stream) |
| `org [command]` / `product [command]` / `service [command]` | Org/product/service management (`service new <package-id>`) |
| `packages [command]` | `install`, `upgrade` (`--all` for third-party too) |
| `skills [command]` | `search`, `load`, `resource` — discover/load Alis Build skills |
| `support [command]` | Interact with Alis Build support conversations |
| `upgrade` / `version` | CLI self-update / print version |

Global flags on every command: `--json`, `-h/--help`, `--approve` (records
human pre-approval; never satisfies the production gate by itself).

## `alis docs` topics

`overview, dbd, output, exit-codes, safety, context, skills, workflows, codeblocks`
— `alis docs <topic>` for one section, `alis docs --list` for one-liners, no
argument for the full manual.

## The DBD loop

```
alis define <pkg> --json --install      # protos -> generated packages
alis build  <pkg> --json                # commit -> deployable version
alis deploy <pkg> --json -e <env>       # version -> environment (terraform apply)
alis build  <pkg> --json --deploy -e <env>   # chain build straight into deploy
```

- Package ID (`org.product.service-vN`) maps deterministically to the org/product/
  neuron resource path and to the service folder on disk; omit it when the
  cwd is inside the service directory.
- `--commit <sha>` pins define/build to a specific reviewed commit; without it,
  the latest pushed commit is used.
- `--plan-only` on `deploy`/`build --deploy` runs Terraform plan only.
- Production deploys are gated: interactive `[y/N]`, or non-interactively
  `--confirm-production` after a human has explicitly approved (exit code 3
  until that flag is present — this is a hard safety gate, not a formality).

## Output contract (for scripting/CI)

- `--json` makes stdout carry **exactly one machine-readable result** — for
  long-running ops (define/build/deploy/blocks/operations wait) that's the
  final operation object, printed even on failure. Always parse stdout first;
  never parse stderr for the result.
- stderr carries progress: one NDJSON event per state change under `--json`,
  human-readable lines otherwise.
- Exit code is non-zero on failure (see `alis docs exit-codes`); exit 3 is
  specifically "production deploy needs `--confirm-production`"; exit 4 means
  re-run `alis login`.
- Pre-flight failures (before an operation exists) print a structured error
  envelope: `{"error": {"code", "message", "retry", "agent"}}` — `retry` is the
  exact command to re-run, `agent` is a machine-actionable instruction.

## Long-running operations / streaming

- `define`/`build`/`deploy` **block by default**, streaming progress to
  stderr (NDJSON under `--json`) until the operation completes.
- `--async` starts the operation and returns immediately, printing its name.
- `alis operations wait <name> --json` re-attaches to an async or
  Ctrl-C-interrupted operation and resumes streaming — this is the supported
  way to "tail" a build/define/deploy; there is no separate `alis logs tail`.
- `alis operations describe <name> --json` is a one-shot state poll (no
  blocking) if you only need a snapshot.
- On completion the result JSON includes a `logsUri` pointing at the
  underlying Cloud Build/Terraform log for that operation — that's the link
  to open for the full raw log, not something the CLI streams inline.
- `--timeout <dur>` gives up waiting client-side without cancelling the
  server-side operation (resume hint printed to stderr); `--quiet` suppresses
  stderr progress entirely.
- Never poll with `sleep` loops — `--async` + `operations wait` blocks
  efficiently server-side.

## Division of labor vs. the MCP server / this app

- **`alis` CLI** = local execution plane: anything run where a shell exists
  (DBD, package installs, context detection, skills discovery/loading).
  Deterministic, resolves context from cwd, chains steps in one call.
- **Alis Build MCP server** = control plane + headless fallback: `SpecIt`,
  and server-side `RunDefine`/`RunBuild`/`RunDeploy`/skills tools for agents
  with no shell. Its `RunBuild`/`RunDeploy` have been observed to report a
  false-positive `BUILT`/success with no image actually pushed to Artifact
  Registry — the CLI's blocking wait + real operation polling doesn't have
  this failure mode, which is the concrete reason to prefer it wherever a
  shell is available (e.g. GitHub Actions runners).
- Editor/agent plugins (this app included, insofar as it drives the same
  backend) are session glue — they don't replace either of the above.

---

## Appendix — binary internals (v1.0.54, historical)

> Kept for reference on the underlying gRPC wiring; command names/behaviour
> above are current and take precedence over anything below.

Extracted from `/Users/jp/.alis/bin/alis` (Mach-O 64-bit arm64, ~33.8 MB) at
the time: Go-compiled TUI application using Google ADK (Agent Development
Kit). Communicates with internal gRPC microservices. Requires no local config
files — configured via environment variables and Google Cloud ADC.

### gRPC Service Methods (`alis.os.cli.v1.CliService`)

| Command | Description |
|---------|-------------|
| `ViewLandingZone` / `ViewLandingZones` | List/view organisations |
| `ViewProduct` / `ViewHome` | View products and home dashboard |
| `ConfigureGit` | Set up git credentials (writes `~/.netrc` and `~/.npmrc`) |
| `Build` | Create neuron version + build Docker images |
| `Define` | Compile .proto files |
| `Deploy` | Run terraform apply |
| `GetBuildOperation` | Poll build status |
| `GetDefineOperation` | Poll define status |
| `GetDeployOperation` | Poll deploy status |
| `ViewBuildLogs` / `ViewDeployLogs` | View Docker build / Terraform logs |
| `Whoami` | Return user identity |
| `GcloudAuth` | Authenticate via gcloud |
| `NewNeuron` / `RemoveNeuron` | Create/manage neurons |
| `NewEnvironment` | Create deployment environments |
| `RetrieveAppVersions` | List app versions |
| `RetrieveBuildVersions` | List build versions |
| `RefreshEnvs` | Refresh environment configs |
| `UseProductServiceAccount` | Switch service accounts |

### Build Agent Methods (`alis.os.build.agent.v1`)

| Method | Purpose |
|--------|---------|
| `BuildRequest` | Trigger build |
| `CreateNeuronRequest` / `DeleteNeuronRequest` | Neuron lifecycle |
| `ListNeuronsResponse` / `ListProductsResponse` | List resources |
| `ListEnvironmentsRequest` | List environments |
| `GetOrganisationRequest` | Get org details |
| `EditOrganisationDisplayName` | Edit display name |
| `EditProductDisplayName` | Edit product name |
| `PutProductMember` / `RemoveOrganisationMember` | Member management |
| `GitLogResponse` | Read git logs |
| `ReadFileRequest` / `ReadProtoFileResponse` | Read files |

### Other Referenced gRPC Services

| Service | Methods |
|---------|---------|
| `alis.open.iam.v1` | CreateUser, ListUsers, SyncGroup |
| `alis.open.agent.v1` | GetTask, ListTasks, StreamResponse |
| `alis.open.options.v1` | Options/fields |
| `alis.os.neurons.v1` | NeuronVersion CRUD |
| `alis.os.dbd.v1.DbdService` | RunDefine, RunDeploy, TestIamPermissions |

### Configuration

**No config files** — configured via environment variables:

| Variable | Purpose |
|----------|---------|
| `ALIS_INSTALL` | Installation path (`~/.alis`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | GCP auth |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID |
| `GOOGLE_CLOUD_LOCATION` | GCP location |
| `GOOGLE_CLOUD_REGION` | GCP region |
| `GOOGLE_API_KEY` / `GEMINI_API_KEY` | AI API keys |
| `ALIS_OS_PROJECT` | Alis OS project |

Also reads: `~/.netrc`, `~/.npmrc`, `credentials.json`, `key.json`, `service_account_key`

### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `https://cli.alisx.com/releases/v%s/alis-%s-v%s` | Binary updates |
| `https://identity.alisx.com` | Identity/auth service |
| `https://iamcredentials.googleapis.com` | Service account impersonation |
| `https://generativelanguage.googleapis.com` | Gemini API |
| `https://telemetry.googleapis.com/v1/traces` | OpenTelemetry traces |

### TUI Framework

Built with Bubble Tea (Go TUI framework). Views:
- `HomeView` — landing dashboard
- `LandingZoneView` — organisation selection
- `ProductView` — product management

### MCP Server

The CLI runs a local MCP server on port 9712 for AI agent tooling.
