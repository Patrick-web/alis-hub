# Alis CLI — Complete Feature Reference (v1.64.4)

> Verified against `alis` v1.64.4 (darwin-arm64). This supersedes the older
> `ALIS_CLI.md` which was based on v1.54.0. All output below sourced from
> `alis --help`, `alis <cmd> --help`, and `alis docs`.

## Architecture

Alis Build development is a single loop: **Define → Build → Deploy (DBD)**.

| Phase | What it does |
|---|---|
| **Define** | Compiles `.proto` files into versioned, consumable language packages |
| **Build** | Turns a product build-repo commit into a deployable service version (Docker images) |
| **Deploy** | Provisions a built version into an environment via Terraform |

The `alis` CLI is the **local execution plane**. Anything that runs where a
shell exists goes through the CLI. The MCP server (`mcp.alis.build`) is the
**control plane / headless fallback**.

### Disk layout

```
~/alis.build/<org>/define/<org>/<product>/…   # Definitions (protos)
~/alis.build/<org>/build/<product>/<service-path>/…   # Implementations
```

### Package IDs

Services are addressed by package ID: `<org>.<product>.<path>.<vN>`, e.g. `alis.os.cli.v1`.
When run inside the service directory, the package ID can be omitted — the CLI
resolves it from the cwd.

---

## Top-Level Commands

### 1. Authentication & Identity

| Command | Purpose |
|---|---|
| `alis login [code] [--flags]` | Sign in to Alis Build via browser auth flow. `--open` opens the login URL. If a code is provided, exchanges it; otherwise prints the URL and prompts. |
| `alis whoami` | Show the authenticated user |
| `alis accounts list` | List available accounts for Build subscription/billing |
| `alis accounts select accounts/<id>` | Set the active Build account and refresh the session |
| `alis authorise [<org>.<product>]` (alias `a`) | Configure git credential helper for a product's define/build repos; refresh short-lived Go/npm/Docker/Dart package credentials. Run once for externally-cloned repos or when auth breaks. |

### 2. Org & Product Management

| Command | Purpose |
|---|---|
| `alis org list` | List all organisations you have access to |
| `alis org view [<org>]` | Show an organisation and its products |
| `alis product new <org>.<product>` | Create a new product in an organisation |
| `alis product view [<org>.<product>]` | Show a product with its services and environments |
| `alis service new <package-id>` | Create a new service in a product |

### 3. The DBD Loop

| Command | Purpose |
|---|---|
| `alis define [<package-id>]` | Compile a service's `.proto` files in the definitions repo, creating a new version with generated language packages. `--commit <sha>` pins a specific commit; `--install` chains `packages install` after success; `--install-language` limits install to one language (go/node/python/dart). |
| `alis build [<package-id>]` | Create a new service version from the product build repo and build its Docker images. `--commit <sha>` / `--branch <branch>` pin the source; `--build-path <path>` adds Dockerfile paths; `--retag` retags previous images (infra-only changes); `--retag-path <path>` specifies retag paths. `--deploy` chains a deploy operation after build; `--environment/-e <env-id>` (repeatable) sets target environments. |
| `alis deploy [<package-id>]` | Deploy a built version to product environments via Terraform. `--version <v>` picks a specific build version; `-e/--environment <env-id>` (repeatable) targets environments; `--plan-only` runs Terraform plan without apply. Deploying to production requires `--confirm-production` (see Safety below). |

### 4. Operation Management

Long-running commands (`define`, `build`, `deploy`) block by default, streaming
progress to stderr. All support these flags:

| Flag | Purpose |
|---|---|
| `--async` | Start the operation, print its name, return immediately |
| `--timeout <dur>` | Give up waiting client-side (operation keeps running server-side) |
| `--poll-interval <dur>` | How often to poll (default 2s) |
| `--quiet` | Suppress stderr progress |

| Sub-command | Purpose |
|---|---|
| `alis operations describe <name>` | One-shot state poll of an operation |
| `alis operations wait <name>` | Re-attach to an async or interrupted operation and stream to completion |

### 5. Package Management

| Command | Purpose |
|---|---|
| `alis packages install [<package-id>]` | Install all language packages and pull the latest version of the service's own defined package. Refreshes registry credentials automatically. |
| `alis packages upgrade [<package-id>]` | Upgrade the service's `alis.build` packages. `--all` upgrades every package, including third-party. |
| `alis packages add [<package-id>]` | Add the service's Alis-defined package (e.g. to a new project). |

### 6. Code Blocks

Code blocks are reusable packages of proto, infra, and build files installed
into a service's package. The blocks service generates files server-side and
commits them to a `block/*` branch in both the product's build repo and the
org's define repo, then the CLI merges to main.

| Command | Purpose |
|---|---|
| `alis blocks list [<package-id>]` | List installed and available code blocks for a service |
| `alis blocks install <block-id> [<package-id>]` | Install a code block into a service. `--build-folder` sets root folder for build files. |
| `alis blocks upgrade <block-id> [<package-id>]` | Upgrade an installed code block |
| `alis blocks uninstall <block-id> [<package-id>]` | Uninstall a code block from a service |
| `alis blocks create <block-id> [<package-id>]` | Create a new code block from a service's existing code |
| `alis blocks publish <block-id> [<package-id>]` | Publish a new block version from commits on the block's branch |
| `alis blocks merge <block-id> [<package-id>]` | Merge an installed block's git branch into local repos |
| `alis blocks versions <block-id>` | List a block's versions, newest first |
| `alis blocks accounts` | List accounts eligible for publishing code blocks |

### 7. Environment Management

| Command | Purpose |
|---|---|
| `alis environment new [<org>.<product>]` | Create a new environment in a product |
| `alis environment variables [<org>.<product>]` | List environment variables of every environment in a product |
| `alis environment set [<org>.<product>.<env>] NAME=VALUE [...]` | Set environment variables in an environment |
| `alis environment unset [<org>.<product>.<env>] NAME [...]` | Remove environment variables from an environment |
| `alis environment refresh <org>.<product>.<env>` | Print the `.env` file for an environment |
| `alis environment branches [<org>.<product>.<env>]` | View or designate the git branches an environment deploys from |

### 8. Skills System

Skills are curated, platform-maintained markdown documents teaching how to do
one thing well on Alis Build. Agent workflow: **search → load → resource**.

| Command | Purpose |
|---|---|
| `alis skills search <query>` | Search skills with a natural-language query (returns ranked candidates) |
| `alis skills load <id>` | Load a skill's full markdown instructions |
| `alis skills resource <id> <path>` | Fetch a file referenced by a skill's instructions |
| `alis skills list` | List the whole skills catalog (for human browsing) |
| `alis skills install <id>` | Install a skill into the local agent harness (Claude Code, etc.). `--project` installs into the repo's `.claude/skills/<id>`. |
| `alis skills installed` | List skills installed into local harnesses |
| `alis skills upgrade [<id>...]` | Upgrade installed skills to the registry version. `--all` upgrades all. |
| `alis skills uninstall <id>` | Remove a locally installed skill |
| `alis skills create <id>` | Start a new skill of your own in a local workspace |
| `alis skills edit <id>` | Open one of your published skills in a workspace for editing. `--refresh` discards local edits and re-downloads. |
| `alis skills publish <id>` | Validate and publish a skill workspace to the registry. `--force` overwrites remote changes; `--clean` removes workspace after publish. |
| `alis skills delete <id>` | Delete one of your skills from the registry (soft delete; republishing restores it) |
| `alis skills share <id>` | Share one of your skills with colleagues |
| `alis skills feedback <id> [message]` | Send feedback about a skill to its owner |
| `alis skills request` | Request a new skill from the Alis Build team. Flags: `--name`, `--description`, `--use-case`, `--notes`. |
| `alis skills search <query>` | Semantic search over the skills catalog |

### 9. Ask — AI Q&A Over Platform Content

`alis ask "<question>"` answers from the caller's coding sessions, support
conversations, and shared skills. The answer streams with citations and
suggested follow-up questions.

| Command | Purpose |
|---|---|
| `alis ask <question>` | Ask a natural-language question. `--session <id>` continues a previous conversation for multi-turn context. |

Citations carry kind + reference: `SKILL` (bare id → `alis skills load`),
`SESSION` (`contexts/{id}`), `TICKET` (`tickets/{id}`).

### 10. Support & Diagnostics

| Command | Purpose |
|---|---|
| `alis support send-message` | Send a text message on a support conversation |
| `alis support send-session` | Share a local coding-agent session transcript on a support conversation |
| `alis doctor` | Collect a diagnostics snapshot: CLI, IDE extension, agent plugins, terminal/host shape, settings, recent log tail (no credentials ever). `--ticket <id>` uploads to a support conversation after confirmation; `--no-logs` excludes log tail; `--yes` skips the upload confirmation. |

### 11. Context & Telemetry

| Command | Purpose |
|---|---|
| `alis context view [<org>.<product>]` | Show the resolved workspace context: organisation, product, service (package ID), local folders, and product environments (id, display name, status, production flag) |
| `alis context push-session` | Save a local coding-agent session's full transcript to Alis history |
| `alis context scan` | Scan local harness transcripts once and push telemetry events |

### 12. Utility Commands

| Command | Purpose |
|---|---|
| `alis docs [<topic>]` | Print the operating manual. Topics: `overview`, `dbd`, `output`, `exit-codes`, `safety`, `context`, `skills`, `ask`, `workflows`, `codeblocks`. `--list` shows topic descriptions. |
| `alis gcloud auth [<org>.<product>]` | Show artifact registry / npm / dart auth tokens for the product |
| `alis git configure [<org>.<product>]` | Show git configuration for the product's define and build repos |
| `alis upgrade` | Upgrade the CLI to the latest version |
| `alis version` | Print the CLI version |
| `alis completion <shell>` | Generate autocompletion for bash, fish, zsh, or powershell |

---

## Global Flags

| Flag | Purpose |
|---|---|
| `--json` | Output as JSON. Stdout carries exactly one machine-readable result. Stderr carries NDJSON progress events. |
| `-h/--help` | Help |
| `--approve` | Record human pre-approval (never satisfies the production gate by itself; only `--confirm-production` or interactive `[y/N]` lifts that) |
| `-v/--version` | Print CLI version |

---

## Output Contract

- **stdout** = exactly one machine-readable result under `--json`. For long-running ops, it's the final operation object — even on failure. Always parse stdout before stderr.
- **stderr** = progress: NDJSON events per state change under `--json`; human-readable lines otherwise.
- **Pre-flight failures** (before an operation exists) print a structured error envelope: `{"error": {"code": "…", "message": "…", "retry": "…", "agent": "…"}}`. `retry` is the exact re-run command; `agent` is a machine-actionable instruction.
- A result is **never an empty object**. Exit 0 + populated object = success. `AlreadyExists` failures include `"agent": "…"` saying to move on.

---

## Exit Codes

| Code | Meaning | Action |
|---|---|---|
| 0 | Success | Parse result on stdout |
| 1 | Failure (invalid usage or remote operation failed) | Diagnose from stdout error envelope and stderr |
| 3 | Confirmation required | Do NOT retry automatically. Ask user, then re-run the `retry` command. Covers: `PRODUCTION_CONFIRMATION_REQUIRED` (production deploy), `APPROVAL_REQUIRED` (automation tier gate) |
| 4 | Unauthenticated | User must run `alis login` |

---

## Safety — Hard Limits

### Production Deploy Gate
Deploying to a production environment (or changing its variables) is gated:
- Interactively: `[y/N]` prompt.
- Non-interactively (`--json`): exits **code 3** with `PRODUCTION_CONFIRMATION_REQUIRED`.

The gate is lifted by `--confirm-production`. **Never add `--confirm-production` on your own.** Stop, tell the user which environments are affected, and ask for approval.

`--plan-only` (Terraform plan, no apply) is **not** gated — use it to preview production deploys safely.

### Automation Tiers
The user's automation tier gates commands by risk class:
- **manual**: gates mutating (`define`, `build`, `deploy`, `packages`/`blocks install`, `environment set`) and destructive (`blocks create/uninstall`, `skills delete`, `environment unset`, diagnostics upload).
- **balanced** (default): gates destructive only.
- **autonomous**: gates neither.

When approval is required, exit **3** with `APPROVAL_REQUIRED` envelope. `--approve` (or `ALIS_APPROVE`) lifts non-production gates but **never** the production gate.

### Interrupts
Ctrl-C / SIGTERM never cancels server-side operations. Re-attach with `alis operations wait <name>`.

---

## Key Workflows

### Ship a Contract Change
```
alis define <pkg> --json --install
alis build <pkg> --json --deploy -e <dev-env-id>
```

### Promote to Production
```
alis context view --json                           # confirm env ids + production flag
alis deploy <pkg> --json -e <prod-env-id> --plan-only   # preview
# Get explicit human approval, then:
alis deploy <pkg> --json -e <prod-env-id> --confirm-production
```

### Infra-Only Change (No Code Change)
```
alis build <pkg> --json --retag --deploy -e <env-id>
```

### Create a New Service
```
alis service new <org>.<product>.<path>.<v1>
alis define <pkg> --json --install
# implement, push, then build & deploy
```

### Non-Blocking Operation
```
alis build <pkg> --json --async
alis operations wait <name> --json
```

---

## Skills Agent Contract

1. **search** ranks the catalog semantically → candidate skills with `id` and `description`
2. **load** returns the skill's markdown instructions → read and follow
3. **resource** fetches a file the instructions reference (path exactly as written)

`alis skills load` accepts `--session <id>` (defaults from `$CLAUDE_SESSION_ID` then `$ALIS_SESSION_ID`).

### Authoring
```
alis skills create <id> --description "…"   # scaffolds ~/.alis/skills/workspaces/<id>/
# edit SKILL.md + optional references/ scripts/ assets/
alis skills publish <id>                    # validates, zips, publishes
```

### Backend Compatibility
On older backends, skills commands exit 1 with code `backend_outdated`. Fall back to the MCP server's `SearchSkills`/`LoadSkill`/`LoadSkillResources` tools.

---

## Ask Contract

`alis ask` answers from coding sessions, support conversations, and shared skills.

```
alis ask "how did I fix the failing deploy last week?" --json   # → session: …
alis ask --session "<session>" "what was the root cause?" --json
```

Exit 1 `no_answer`: rephrase or search directly. `backend_outdated`: backend predates ask.

---

## Division of Labor

| Layer | Tool | When |
|---|---|---|
| Local execution plane | `alis` CLI | Shell available (terminals, GitHub Actions runners, local dev) |
| Control plane / headless | MCP server (`mcp.alis.build`) | No shell (IDE agents without terminal access) |
| Session glue | Editor/agent plugins | Inject primers, session IDs, permission ergonomics |

The CLI's blocking wait + real operation polling is more reliable than the MCP
server's `RunBuild`/`RunDeploy`, which have been observed to report false-positive
success with no image actually pushed to Artifact Registry. Prefer `alis` CLI
wherever a shell is available.

---

## Installation & Configuration

- Installed at: `~/.alis/bin/alis`
- No config files — configured via environment variables
- Key env vars: `ALIS_INSTALL`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT`
- Upgrade: `alis upgrade`
- Shell completions: `alis completion bash|fish|zsh|powershell`
