# Alis Build DBD Pipeline

> Extracted from the Alis VSCode extension (`alis-build-2.0.392`).
> The Define-Build-Deploy pipeline is the core engineering workflow.

## Contents

1. [Overview](#1-overview)
2. [6-Stage DBD Wizard](#2-6-stage-dbd-wizard)
3. [Neuron Resolution](#3-neuron-resolution)
4. [Define Step (RunDefine)](#4-define-step-rundefine)
5. [Build Step (RunBuild)](#5-build-step-runbuild)
6. [Deploy Step (RunDeploy)](#6-deploy-step-rundeploy)
7. [Glass Mode](#7-glass-mode)
8. [BuildSpec Tracking](#8-buildspec-tracking)
9. [CodeBlock Installation in DBD](#9-codeblock-installation-in-dbd)
10. [Image Naming Convention](#10-image-naming-convention)

---

## 1. Overview

The DBD pipeline moves a service through three phases:

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Define  │ ──▶ │  Build  │ ──▶ │ Deploy  │
│ Proto   │     │   Go    │     │ Cloud   │
│ Files   │     │  Logic  │     │  Run    │
└─────────┘     └─────────┘     └─────────┘
```

Each phase is a gRPC long-running operation (`google.longrunning.Operation`) with progress metadata.

---

## 2. 6-Stage DBD Wizard

From `CustomApis.vue` — a left-nav / content split layout with 6 stages:

| Stage | Eyebrow | User Actions | Gating |
|-------|---------|-------------|--------|
| **Overview** | DBD | View animated D3 pipeline diagram | None |
| **Quick Start** | Setup | Select/create neuron, install `blocks/simpleapi` | Exactly 1 active neuron |
| **Define** | API contract | Edit `.proto`, commit, run Define | defineUpdated + defineChangesCommitted checked |
| **Build** | Implementation | Edit `methods.go`, commit, run Build | buildUpdated + buildChangesCommitted checked |
| **Deploy** | Infrastructure | Review `cloudrun.tf`, run Deploy | deployReviewed checked |
| **Playground** | Validation | Open `.playground/main_test.go`, run test | None |

Commands dispatched via `window.vscode.postMessage({ command: 'executeCommand', commandId: 'alis.flows.dbd.*', args })`.

---

## 3. Neuron Resolution

The target service (neuron) is resolved consistently:

1. **Single active neuron** → use automatically
2. **Multiple active** → prompt user with QuickPick
3. **None active** → `ListNeurons` RPC → prompt user
4. **URI-based override** → parse from file path:
   - Define: `/alis.build/{org}/define/{product}/{neuron_id}/{version}/*.proto`
   - Build/Deploy: `/alis.build/{org}/build/{product}/{neuron_id}/{version}/*`

Resource name format: `organisations/{org}/products/{product}/neurons/{id}-{version}`

---

## 4. Define Step (RunDefine)

### Flow

1. **Commit selection** — User picks from last 50 commits in the **define repository worktree**
2. **Package scanning** — Scan neuron build directory for source files per language:
   - Go: `*.go`
   - Node/JS: `*.js`, `package.json`
   - Python: `*.py`, `requirements.txt`
   - Dart: `*.dart`, `pubspec.yaml`
3. **Send RunDefineRequest** (gRPC) to backend with neuron + commit SHA
4. **Backend compiles** protos using protoc, generates artifacts for each configured language
5. **Poll** every 2 seconds for completion, reporting progress by artifact
6. **On success** — auto-install generated packages, trigger playground sync, show Glass Mode

### Generated Artifacts

| Artifact | Language | Registry |
|----------|----------|----------|
| `GOLANG` | Go | `{region}-go.pkg.dev` |
| `JAVASCRIPT` | JavaScript | Artifact Registry (npm) |
| `PYTHON` | Python | Artifact Registry (PyPI) |
| `DART` | Dart | Artifact Registry |
| `DOT_NET` | C#/.NET | Artifact Registry |
| `ECMASCRIPT_PUBLIC` | JS (public) | Public npm |
| `GOOGLE_CLOUD_SPANNER` | — | Spanner databases |
| `GOOGLE_CLOUD_PUBSUB` | — | Pub/Sub topics |

Artifact state lifecycle: `QUEUED → GENERATING → READY` or `FAILED`

### Commit Locking

The define step **pins** definitions to a specific commit SHA. The backend checks out that exact commit before compiling. Version is forever associated with that commit.

### Protobuf Messages

| Message | Purpose |
|---------|---------|
| `RunDefineRequest` | Neuron + commit SHA → backend compiles protos |
| `RunDefineResponse` | Definition name, version, artifact names |
| `RunDefineMetadata` | Version, notes (shown in progress UI) |

---

## 5. Build Step (RunBuild)

### Flow

1. **Commit selection** — User picks from last 50 commits in the **build repository worktree** (not define)
2. **Dockerfile discovery** — Scan build directory for `Dockerfile` files
3. **Strategy selection**:
   - `build_cloud` — Cloud Build (Docker + push)
   - `build_cloud_and_deploy` — Build then auto-deploy
   - `build_local` — Local Docker build + push
4. **Image action assignment** per Dockerfile: `BUILD` or `RETAG`
5. **Execute** — send `RunBuildRequest`, poll every 5 seconds (timeout: 49 min)
6. **On success** — if auto-deploy, deploy runs automatically

### Local Build (`build_local`)

1. Auth via `gcloud` + `docker-credential-gcr`
2. Clone build repo to `~/.alis-local-builds/{neuron}-{sha}/`
3. Transform Dockerfile (inject ADC bind mount, cache mounts for Go/pnpm)
4. Run: `docker build --platform linux/amd64 -t {image} . && docker push {image}`
5. Monitor via `/tmp/alis-build-{uuid}` status file

### Cloud Build

Backend clones repo at specified commit, runs Docker via Google Cloud Build, pushes to Artifact Registry.

### Protobuf Messages

| Message | Purpose |
|---------|---------|
| `RunBuildRequest` | Neuron + commit SHA + image actions (BUILD/RETAG) + optional deploy |
| `RunBuildResponse` | Build logs URL, deployments, neuron version |
| `RunBuildMetadata` | Version, logs URL, optional deploy metadata |
| `RunBuildAndDeployRequest` | Combined build + deploy request |
| `RunBuildAndDeployMetadata` | Combined build + deploy metadata |

---

## 6. Deploy Step (RunDeploy)

### Flow

1. **Version selection** — List `NeuronVersion` entries in `BUILT`/`RETAGGED` state
2. **Environment selection** — List active `Environment` objects, pre-select dev
3. **Mode selection**:
   - **Stable**: Deploy (apply) or Plan Only (dry run)
   - **Beta**: Deploy to Beta (sets `ALIS_BETA_VERSION` + `ALIS_BETA_VERSION_COMMIT_SHA`) or Plan Only
4. **Execute** — send `RunDeployRequest`, poll every 5 seconds (timeout: 10 min)
5. **Backend** — runs Terraform apply, creates/updates Cloud Run service, sets env vars
6. **On completion** — shows deployment logs URLs

### Terraform + Cloud Run

Deploy backend:
1. Runs Terraform using neuron's deploy workspace (`cloudrun.tf`)
2. Applies configuration (or plans only)
3. Creates/updates Cloud Run service
4. Sets environment variables
5. Returns logs URLs per deployment

### Protobuf Messages

| Message | Purpose |
|---------|---------|
| `RunDeployRequest` | Neuron + version + environments + planOnly + isBeta |
| `RunDeployResponse` | Version, deployments with logs URLs |
| `RunDeployMetadata` | Version, deployments with logs URLs, notes |

---

## 7. Glass Mode

Post-define explanation layer. Triggered by `Wye` function after Define completes.

### Data Sources
- `DefineExplanation.getDefinition()` — Definition name, commit, version, release type
- `DefineExplanation.getArtifacts()` — Artifact collection

### Sections
1. **Definition Source** — Locked commit SHA (copyable, openable), generated version, release type badge
2. **Artifact Cards** — Per language collapsible panels showing:
   - State pill (READY/GENERATING/QUEUED/FAILED/UNSPECIFIED)
   - Notes
   - Installation instructions (registry link, package path, install command)
   - How it was generated
   - Usage example (copyable code block)
   - Spanner: synchronized databases with type listings
   - Pub/Sub: synchronized environments with topic listings

### Trigger
```
ExplainDefineRequest = { definition, version, neuron, rootDirectory, artifacts }
→ GlassService.ExplainDefine() → opens webview panel
```

---

## 8. BuildSpec Tracking

### BuildSpec Lifecycle

| Status | Meaning |
|--------|---------|
| `STATE_UNSPECIFIED` | Unknown |
| `NEW` | Just created |
| `ACTIVE` | Work in progress |
| `COMPLETED` | Done |

### Sync on Workspace Open

When a workspace opens via a BuildSpec link:
1. `GenerateBuildSpecRequest` created with `WorkspaceContext`
2. gRPC returns `GenerateBuildSpecResponse`:
   - `filesList` — files to materialize
   - `buildSpecEtag` — change tracking ETag
   - `neuronsToAddList` — neurons to activate
3. Files written to workspace
4. ETag stored for incremental updates

### WorkspaceContext Fields

| Field | Purpose |
|-------|---------|
| `buildSpec` | Active BuildSpec resource name |
| `buildSpecEtag` | Change tracking version |

---

## 9. CodeBlock Installation in DBD

In Quick Start stage, user installs `blocks/simpleapi`:

```typescript
// 1. Register codeblock with package
const request = new AddBlockRequest()
  .setBlock("blocks/simpleapi")
  .setPackage(derivedPackageName);
blocksClient.addBlock(request);

// 2. Trigger install
commands.executeCommand("alis.blocks.install", instance);
```

### Install Flow (`alis.blocks.install`)

1. Resolve instance (direct or by name)
2. Fetch block details (display name, agent config)
3. Version selection (GA + pre-release versions)
4. Build folder selection (default `./`)
5. Send `InstallBlockRequest`:
   - `block`, `instance`, `package`, `blockVersion`, `buildFolder`
6. Poll every 5 seconds (timeout: 10 min)
7. **Agentic install**: If block has `agenticInstallEnabled`, redirect to Alis Console

### Explorer Tree Display

```
Neuron
  ├── Instance (codeblock)
  │    ├── Display name + version
  │    ├── State (ACTIVE / PENDING_INSTALLATION)
  │    └── Pending update badge
  └── Deployments
```

---

## 10. Image Naming Convention

```
{region}-docker.pkg.dev/{gcp_project}/neurons/{org}.{product}.{neuron_id}:{commit_sha}
```

Example: `us-central1-docker.pkg.dev/voyage-vp-prod/neurons/voyage.vp.bookings:v1:abc123def`
