# Alis Build AI & Agent System Architecture

> Extracted from the Alis VSCode extension (`alis-build-2.0.392/build-kit/src/` and `dist/extension.js`).

## Contents

1. [Gemini Enterprise Launchpad](#1-gemini-enterprise-launchpad)
2. [MCP Server Setup](#2-mcp-server-setup)
3. [MCP Server Implementation](#3-mcp-server-implementation)
4. [Agent Initialization](#4-agent-initialization)
5. [Agent Tool Registration](#5-agent-tool-registration)
6. [Agent Launchpad Registry](#6-agent-launchpad-registry)
7. [Context Engineering](#7-context-engineering)
8. [Prompt/Entity AI System](#8-promptentity-ai-system)
9. [Agent Code Patterns](#9-agent-code-patterns)

---

## 1. Gemini Enterprise Launchpad

A multi-stage wizard for provisioning enterprise-grade AI on Google Cloud. Two flow groups:

| Group | Purpose |
|-------|---------|
| `launchpad` | Full infrastructure (services, domains, identity, workforce federation) |
| `gemini` | Gemini Enterprise-focused subset |

### Launchpad Context (`LaunchpadContext`)

| Field | Source |
|-------|--------|
| `productName`, `productDisplayName` | WorkspaceContext.getProduct() |
| `orgId`, `organisationDisplayName` | WorkspaceContext |
| `environmentGoogleProjectId` | WorkspaceContext |
| `activeNeurons`, `activeNeuron` | WorkspaceContext.getActiveNeuronsList() |
| `launchpadDomain` | Defaults to `{orgId}.launchpad.alisx.com` |
| `identityDomain` | Defaults to `identity.{orgId}.launchpad.alisx.com` |
| `workforce*` fields | Microsoft Entra federation settings |
| `superAdmins` | Comma-separated admin emails |

### Stages (launchpad group)

1. **Overview** — Explains what the launchpad provisions
2. **Prerequisites** — Confirm product, org, environment, configure subdomains, super admins
3. **Users Service** — Install `blocks/users` codeblock, configure OAuth (Google+Microsoft), connectors, env vars, build & deploy
4. **Workforce Federation** — Microsoft Entra OIDC setup (conditional): register app, capture client ID/tenant, create workforce pool in GCP, add OIDC provider
5. **Domains** — Import managed domain, configure DNS, validate SSL, grant product access, set up host-to-backend routes
6. **Launchpad Service** — Install `blocks/geminilaunchpad` codeblock, define, set `LAUNCHPAD_DOMAIN`, build & deploy
7. **Review & Deploy** — Final checklist (users.v1 deployed, launchpad-v1 deployed, routes configured)

### Gemini Enterprise Setup (gemini group)

1. **Gemini Prerequisites** — Confirm product/deployment, optional workforce federation
2. **Gemini Enterprise** — Create Gemini app, set up identity, grant IAM permissions
3. **Data Connectors** — 45+ connectors (Outlook, Teams, Google Calendar, Chat, Drive, Gmail as guided; 39 more as documented)

---

## 2. MCP Server Setup

3-stage wizard:

### Stage 1: Prerequisites
- Confirm product, org, environment
- Select/create MCP neuron (`mcp.v1`)
- Configure MCP domain (default: `{neuronId}-{projectNumber}.{region}.run.app`)
- Configure Identity domain for OIDC

### Stage 2: MCP Service
- Install `blocks/mcp` codeblock
- Define protobuf tools
- Configure server.go (HTTP + MCP + OAuth + logging)
- Configure tools.go (protobuf-backed JSON schemas)
- Set env vars: `MCP_SERVER_URL`, `IDENTITY_SERVICE_URL`
- Build & deploy to Cloud Run

### Stage 3: Install
- Configure MCP server name for agent configs
- Create OAuth app (scopes: `openid,email`, redirect URIs: localhost)
- Connect coding agents:
  - **Claude Code**: Coming soon (needs OAuth validation)
  - **Codex CLI**: `codex mcp add {name} --url {endpoint}` / `codex mcp login {name} --scopes email,openid`
  - **Gemini CLI**: Coming soon
  - **OpenCode**: Coming soon

---

## 3. MCP Server Implementation

**Protocol**: JSON-RPC 2.0 over Streamable HTTP with SSE

| Aspect | Detail |
|--------|--------|
| Path | `/mcp` |
| GET | Opens SSE stream (`text/event-stream`), `mcp-session-id` header |
| POST | JSON-RPC messages (`application/json`), validates session + protocol version |
| DELETE | Internal cleanup |
| Session | UUID via `mcp-session-id` header |
| Version | `mcp-protocol-version` header |
| Events | SSE stream with `event:` and `data:` fields |
| Replay | `Last-Event-ID` header via `_eventStore` |
| Auth | OAuth 2.0 / OIDC via identity service |
| Tool Schema | Protobuf-backed JSON Schema |
| Error Codes | `-32700` Parse, `-32600` Invalid Request, `-32000` Server, `-32603` Internal |

**JSON-RPC methods**: `initialize`, `initialized` (session lifecycle)

---

## 4. Agent Initialization

Command: `alis.agent.init`

Flow:
1. User provides agent **Name** and **Tagline**
2. System scaffolds Go service infrastructure (no black boxes — all files visible in explorer)
3. Automated artifact build
4. Immediate deployment to dev environment

Agent uses **Google Gemini** via Vertex AI + **Agent Development Kit (ADK)** pattern:
```go
func buildAgent(ctx context.Context) (agent.Agent, error) {
    model, err := gemini.NewModel(ctx, "gemini-2.5-flash", &genai.ClientConfig{
        Backend:  genai.BackendVertexAI,
        Project:  os.Getenv("ALIS_OS_PROJECT"),
        Location: os.Getenv("GOOGLE_CLOUD_LOCATION"),
    })
    // ... tools injected into agent config
}
```

---

## 5. Agent Tool Registration

4-stage process (Define → Build → Deploy → Register):

### Stage 1: Define
- Define tool interface in `.proto` (service, RPC, request/response messages)
- Command: `alis.dbd.run-define`

### Stage 2: Build
- Implement business logic in Go (`methods.go`)
- Command: `alis.dbd.run-build`

### Stage 3: Deploy
- Package via Terraform / Cloud Run
- Command: `alis.dbd.run-deploy`

### Stage 4: Register
- Tool uses protobuf-backed JSON schemas:
```go
func RetrieveUsersByEmailTool() tool.Tool {
    return rpctool.NewUnary(functiontool.Config{
        Name:          pbUsers.UsersService_RetrieveUserByEmail_FullMethodName,
        Description:   pbUsers.UsersService_RetrieveUserByEmail_FullMethodDescription,
        InputSchema:   (&pbUsers.RetrieveUserByEmailRequest{}).JsonSchema(),
        OutputSchema:  (&pbUsers.User{}).JsonSchema(),
        IsLongRunning: false,
    }, clients.Users.RetrieveUserByEmail, nil)
}
```
- Tool added to agent's `Tools` slice in `agent.go`

**AI augmentation**: Each stage has "Ask Gemini" buttons using prompt entity IDs:
- Define: `53db32f0-1263-4a8e-9b0d-aeb5c4ea7c3d`
- Build: `f556f513-8bb3-4d3f-a5c1-dd4dbe8ee312`
- Deploy: `137deb96-e926-44cd-bd8d-c378352a75be`
- Register: `e45c65cb-5523-4ee4-a7d9-eb619d1ae1a9`

---

## 6. Agent Launchpad Registry

Central hub at `src/views/Flows/AgentLaunchpad.vue`:

| Section | Command | Purpose |
|---------|---------|---------|
| Initialize Launchpad | `alis.agent.launchpad.init` | One-time environment scaffold |
| Agent Registry | `alis.agent.launchpad.register-agent` | Submit agent to `console.alisx.com/manage/agents/register` |
| MCP Registry | `alis.agent.launchpad.register-mcp` | Register MCP servers |
| Client Interfaces | `alis.agent.launchpad.register-client` | Register custom front-end interfaces for multi-agent interaction |

---

## 7. Context Engineering

An explicit subsystem that generates and maintains AI context for each workspace:

- Triggered on workspace state changes (product, environment, service selections)
- Context serialized to JSON, written to `.alis/claude.json` or similar
- Logged: "Context Engineering — Agent Context was updated"

**Claude Code integration** (`alis.workspace.claude`):
- Creates/shared terminal named `alis.claude`
- Selects active service (neuron) before launching
- Checks for `claude` CLI (with Nix fallback)
- Writes context engineering data to workspace filesystem

**Codex integration** (from MCP setup):
- `codex mcp add {name} --url {endpoint}`
- `codex mcp login {name} --scopes email,openid`

**Config generators** (VscodeService RPCs):
- `GenerateClaudeConfigsRequest/Response` — produces CLAUDE.md files with context, location, GCP project
- `GenerateCodexConfigsRequest/Response` — produces Codex config files
- `GenerateGeminiConfigsRequest/Response` — produces Gemini config files

---

## 8. Prompt/Entity AI System

The `alis.prompts.entity` command provides context-aware AI assistance throughout flows:

```
alis.prompts.entity
args: [{ prompt: "entities/alis.bl.blocks.v1.Block?name=blocks/agents/prompts/{UUID}", sessionID: "agents" }]
```

This allows Gemini to be invoked with pre-built prompts tied to specific blocks or workflow stages. Each development stage (define proto, implement logic, deploy infra, register tool) becomes AI-assisted.

---

## 9. Agent Code Patterns

From the Alis ADK (Agent Development Kit):

```
Agent
  ├── Name / Description / Instruction (system prompt)
  ├── Model (Gemini via Vertex AI: gemini-2.5-flash, etc.)
  ├── Tools (protobuf-backed RPC tools)
  │    ├── Input/Output: JSON Schema from protobuf
  │    ├── Long-running or unary
  │    └── Backed by gRPC client calls
  └── Environment
       ├── ALIS_OS_PROJECT (GCP project)
       └── GOOGLE_CLOUD_LOCATION (GCP region)
```

Tools are registered via `rpctool.NewUnary()` wrapping `functiontool.Config` with protobuf-generated JSON schemas.
