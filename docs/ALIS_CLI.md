# Alis CLI Binary Analysis

> Extracted from `/Users/jp/.alis/bin/alis` (Mach-O 64-bit arm64, ~33.8 MB).
> Version: 1.0.54 (built for darwin-arm64)

## Overview

Go-compiled TUI application using Google ADK (Agent Development Kit). Communicates with internal gRPC microservices. Requires no local config files — configured via environment variables and Google Cloud ADC.

## Commands

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

## Configuration

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

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `https://cli.alisx.com/releases/v%s/alis-%s-v%s` | Binary updates |
| `https://identity.alisx.com` | Identity/auth service |
| `https://iamcredentials.googleapis.com` | Service account impersonation |
| `https://generativelanguage.googleapis.com` | Gemini API |
| `https://telemetry.googleapis.com/v1/traces` | OpenTelemetry traces |

## TUI Framework

Built with Bubble Tea (Go TUI framework). Views:
- `HomeView` — landing dashboard
- `LandingZoneView` — organisation selection
- `ProductView` — product management

## MCP Server

The CLI runs a local MCP server on port 9712 for AI agent tooling.
