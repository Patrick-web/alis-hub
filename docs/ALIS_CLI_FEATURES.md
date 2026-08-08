# Alis CLI — Complete Feature Reference (v1.69.7)

> Verified against `alis` v1.69.7 (darwin-arm64). This supersedes the older
> `ALIS_CLI.md` which was based on v1.54.0. Command and flag tables are sourced
> from `alis --help`, `alis <cmd> --help`, and `alis docs`; the response shapes
> in [Verified JSON Response Shapes](#verified-json-response-shapes) were
> captured from live `--json` invocations, since `alis docs` documents the
> output *contract* but not a single response *schema*.
>
> See [What changed since v1.64.4](#what-changed-since-v1644) for the flag delta
> against the version this document previously described.

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
| `alis build [<package-id>]` | Create a new service version from the product build repo and build its Docker images. `--commit <sha>` / `--branch <branch>` pin the source; `--build-path <path>` adds Dockerfile paths; `--retag` retags previous images (infra-only changes); `--retag-path <path>` specifies retag paths. `--deploy` chains a deploy operation after build; `--environment/-e <env-id>` (repeatable) sets target environments; `--plan-only` (with `--deploy`) runs Terraform plan only. |
| `alis deploy [<package-id>]` | Deploy a built version to product environments via Terraform. `--version <v>` picks a specific build version; `-e/--environment <env-id>` (repeatable) targets environments; `--plan-only` runs Terraform plan without apply. Deploying to production requires `--confirm-production` (see Safety below). |

**Gating and pre-flight flags on `build`/`deploy`** — easy to miss, and each one
turns into an otherwise-opaque failure when a caller doesn't pass it:

| Flag | On | Purpose |
|---|---|---|
| `--confirm-production` | `build`, `deploy` | Lifts the production gate. Never pass without explicit human approval. |
| `--allow-branch-mismatch` | `build` (with `--deploy`), `deploy` | Proceed when the version's branch is not designated for a target environment (see `alis environment branches`). Without it, a mismatch is a hard failure. |
| `--confirm-no-paths` | `build` | Confirm the service genuinely has no Docker images to build or retag. A service with no detected Dockerfiles fails until this is passed. |

`--commit`/`--branch` interact: with `--branch` but no `--commit`, `build` uses
the branch's latest commit *for this service's folder*.

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
| `alis packages install [<package-id>]` | Install all language packages and pull the latest version of the service's own defined package. Refreshes registry credentials automatically. `--version <definition-version>` installs an exact definition version (Go, Node, Python only); `--language go\|node\|python\|dart` limits to one language. |
| `alis packages upgrade [<package-id>]` | Upgrade the service's `alis.build` packages. `--all` upgrades every package, including third-party. `--path <folder-or-manifest>` (repeatable) selects specific package folders, relative to the service — needed for nested modules. `--language` limits to one language. |
| `alis packages add [<package-id>]` | Add the service's Alis-defined package (e.g. to a new project). `--language` limits to one language. |

`<package-id>` always selects **the service whose manifests change**, never the
dependency. For a nested module: `alis packages upgrade alis.os.cli.v1 --path tui --language go --json`.

Never run `go get`, `go mod tidy`, `pnpm`, `pip` or `dart` directly for private
Alis packages — these commands refresh registry credentials first.

### 6. Code Blocks

Code blocks are reusable packages of proto, infra, and build files installed
into a service's package. The blocks service generates files server-side and
commits them to a `block/*` branch in both the product's build repo and the
org's define repo, then the CLI merges to main.

| Command | Flags |
|---|---|
| `alis blocks list [<package-id>]` | — |
| `alis blocks install <block-id> [<package-id>]` | `--version <v>` (default: latest stable), `--build-folder <path>` (default `./`), `--no-merge`, `--async`, `--timeout`, `--poll-interval`, `--quiet` |
| `alis blocks upgrade <block-id> [<package-id>]` | `--version <v>` (default: latest, GA preferred), `--instance`, `--no-merge`, `--async`, `--timeout`, `--poll-interval`, `--quiet` |
| `alis blocks uninstall <block-id> [<package-id>]` | `--instance`, `--yes`, `--timeout`, `--poll-interval`, `--quiet` |
| `alis blocks create <block-id> [<package-id>]` | `--account` **(required)**, `--display-name` **(required)**, `--tagline`, `--yes` |
| `alis blocks publish <block-id> [<package-id>]` | `--notes` **(required)**, `--release-level` **(required)**, `--build-commit`, `--define-commit`, `--instance`, `--timeout`, `--poll-interval`, `--quiet` |
| `alis blocks merge <block-id> [<package-id>]` | `--instance` |
| `alis blocks versions <block-id>` | — |
| `alis blocks accounts` | — (lists accounts eligible for `--account` on `create`) |

Note the argument order: **block id first, package id second**. `alis docs
codeblocks` shows the reverse (`alis blocks install <pkg> <block-id>`) — that is
a bug in the CLI's own manual; `alis blocks install --help` is authoritative.

### Block instances

A block can be installed into the same service **more than once**. Each install
is an *instance*, addressed as `blocks/<block-id>/instances/<n>`. When a block
has multiple instances, `upgrade`, `uninstall`, `merge` and `publish` require
`--instance <ref>` to disambiguate — a bare block id is not enough and the
command will fail or act on the wrong install. Use `alis blocks list --json` to
enumerate installed instances first.

### Install/upgrade write to your local repos

`blocks install` and `blocks upgrade` run server-side, commit the generated
files to a `block/*` branch in **both** the product's build repo and the
organisation's define repo, and then — by default — the CLI merges that branch
into `main` in both local repos and pushes.

That is a local, destructive-adjacent git operation on `~/alis.build/<org>/…`.
Pass `--no-merge` to skip it and merge later with `alis blocks merge`. Any tool
driving these commands over repos that may hold uncommitted work should either
pass `--no-merge` or verify the working tree is clean first.

### Catalog flags that gate the UI

`alis blocks list --json` returns two flags per available block that a catalog
front-end must respect:

- `agenticInstallOnly: true` — the block is not installable through a plain
  install action; it expects an agent-driven flow. (`resources` is one.)
- `deprecated: true` — do not offer for new installs.

`releaseLevel` is one of `GA`, `RC`, `BETA`, `ALPHA`, `EXPERIMENTAL`. A block's
skill only syncs for GA, RC and BETA.

### 7. Environment Management

| Command | Purpose |
|---|---|
| `alis environment new [<org>.<product>]` | Create a new environment. `--display-name`, `--production` (marks it as a production environment). |
| `alis environment variables [<org>.<product>]` | List environment variables of every environment in a product |
| `alis environment set [<org>.<product>.<env>] NAME=VALUE [...]` | Set environment variables. `--deploy` also triggers an environment deploy now; `--confirm-production`; `--yes`. |
| `alis environment unset [<org>.<product>.<env>] NAME [...]` | Remove environment variables. `--deploy`, `--confirm-production`, `--yes`. |
| `alis environment refresh <org>.<product>.<env>` | Print the `.env` file for an environment. `--key-path <path>` is where the service-account key gets written, and sets `GOOGLE_APPLICATION_CREDENTIALS` in the emitted `.env`. |
| `alis environment branches [<org>.<product>.<env>]` | View or designate the git branches an environment deploys from. `--allow <branch>` (repeatable, **replaces** the current designation), `--clear` (any branch may deploy), `--yes`. |

Semantics worth knowing before automating variable writes:

- Names are `UPPER_SNAKE_CASE`; a value may itself contain `=`.
- Writes require the environment admin role (`roles/environment.admin`) — the
  per-environment `canUpdate` flag in `environment variables --json` reports
  whether the caller has it.
- Concurrent edits (CLI vs. console) are **last-writer-wins**, with no merge.
  There is no read-modify-write guard; `set` replaces the named keys only.
- Variables land on the environment immediately and flow into `environment
  refresh` straight away, but **deployed services only pick them up at their
  next deploy** unless `--deploy` is passed.
- The reference can be omitted inside a product directory when the first
  argument contains `=`.

`environment branches` is what `--allow-branch-mismatch` on `build`/`deploy`
overrides — the designation set here is the thing a deploy is checked against.

### 8. Skills System

Skills are curated, platform-maintained markdown documents teaching how to do
one thing well on Alis Build. Agent workflow: **search → load → resource**.

| Command | Purpose |
|---|---|
| `alis skills search <query>` | Search skills with a natural-language query (returns ranked candidates) |
| `alis skills load <id>` | Load a skill's full markdown instructions |
| `alis skills resource <id> <path>` | Fetch a file referenced by a skill's instructions |
| `alis skills list` | List the whole skills catalog (for human browsing) |
| `alis skills install <id>` | Install a skill into the local agent harness. `--harness claude` selects the harness; `--project` installs into the repo's `.claude/skills/<id>` instead of user scope; `--force` takes over an existing unmanaged folder. |
| `alis skills installed` | List skills installed into local harnesses |
| `alis skills upgrade [<id>...]` | Upgrade installed skills to the registry version. `--all` upgrades every tracked install. |
| `alis skills uninstall <id>` | Remove a locally installed skill. `--harness`, `--project` (only remove project-scope installs). |
| `alis skills create <id>` | Start a new skill of your own in a local workspace. `--description`, `--name`. |
| `alis skills edit <id>` | Open one of your published skills in a workspace for editing. `--refresh` discards local edits and re-downloads. |
| `alis skills publish <id>` | Validate and publish a skill workspace to the registry. `--force` overwrites remote changes; `--clean` removes workspace after publish; `--name` updates the display name. |
| `alis skills delete <id>` | Delete one of your skills from the registry (soft delete; republishing restores it) |
| `alis skills share <id>` | Share one of your skills. `--email <addr>` (your own domain only), `--domain` (everyone at your email domain), `--remove` revokes instead of grants. |
| `alis skills feedback <id> [message]` | Send feedback about a skill to its owner. `--rating up\|down`. |
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
| `alis support send-message` | Send a text message on a support conversation. `--ticket <tickets/ID\|ID>`, `--message <text>` (omit or `-` reads stdin), `--yes`. |
| `alis support send-session` | Share a local coding-agent session transcript. `--ticket`, `--session <harness-session-id>`, `--harness claude-code\|codex\|gemini`, `--yes`. |
| `alis doctor` | Collect a diagnostics snapshot: CLI, IDE extension, agent plugins, terminal/host shape, settings, recent log tail (no credentials ever). `--ticket <id>` uploads to a support conversation after confirmation; `--no-logs` excludes log tail; `--yes` skips the upload confirmation. |

`alis doctor --json` runs entirely locally unless `--ticket` is passed, which
makes it a cheap way to read local state programmatically — notably
`cliVersion`, `auth.authorized`, `auth.buildAccount`, and `settings.safeMode`.
See the response shape below.

### 11. Context & Telemetry

| Command | Purpose |
|---|---|
| `alis context view [<org>.<product>]` | Show the resolved workspace context: organisation, product, service (package ID), local folders, and product environments (id, display name, status, production flag). **Fields are conditional on the working directory** — see the response shape below. |
| `alis context push-session` | Save a local coding-agent session's full transcript to Alis history. `--session <id>`, `--harness claude-code\|codex\|gemini`, `--yes`. |
| `alis context scan` | Scan local harness transcripts once and push telemetry events |

### 12. Utility Commands

| Command | Purpose |
|---|---|
| `alis docs [<topic>]` | Print the operating manual. Topics: `overview`, `dbd`, `output`, `exit-codes`, `safety`, `context`, `skills`, `ask`, `workflows`, `codeblocks`. `--list` shows topic descriptions. |
| `alis gcloud auth [<org>.<product>]` | Show artifact registry / npm / dart auth tokens for the product. **Emits live credentials on stdout** — see the warning below. |
| `alis git configure [<org>.<product>]` | Show git configuration for the product's define and build repos. **Emits live ID tokens on stdout** — see the warning below. |
| `alis upgrade` | Upgrade the CLI to the latest version |
| `alis version` | Print the CLI version. `--json` → `{"version":"1.69.7"}` — the machine-readable way to enforce a minimum CLI version. |
| `alis completion <shell>` | Generate autocompletion for bash, fish, zsh, or powershell |

> **Credential-bearing output.** `alis git configure --json` returns
> `defineGitConfig.idToken` and `buildGitConfig.idToken`; `alis gcloud auth
> --json` returns `accessToken`, `dartIdToken` and `dartTokens`. Callers must
> not log, cache to disk, or surface these in error messages or UI. Every other
> `--json` command in this reference is safe to log.

---

## Global Flags

| Flag | Purpose |
|---|---|
| `--json` | Output as JSON. Stdout carries exactly one machine-readable result. Stderr carries NDJSON progress events. |
| `-h/--help` | Help |
| `--approve` | Record human pre-approval (never satisfies the production gate by itself; only `--confirm-production` or interactive `[y/N]` lifts that) |
| `-v/--version` | Print CLI version |

`--yes` appears on individual commands that prompt (`blocks create`, `blocks
uninstall`, `environment set/unset/branches`, `doctor`, `support send-message`,
`support send-session`, `context push-session`) and is equivalent to the global
`--approve` for that command. Like `--approve`, it never satisfies the
production gate.

---

## Output Contract

- **stdout** = exactly one machine-readable result under `--json`. For long-running ops, it's the final operation object — even on failure. Always parse stdout before stderr.
- **stderr** = progress: NDJSON events per state change under `--json`; human-readable lines otherwise.
- **Pre-flight failures** (before an operation exists) print a structured error envelope: `{"error": {"code": "…", "message": "…", "retry": "…", "agent": "…"}}`. `retry` is the exact re-run command; `agent` is a machine-actionable instruction.
- A result is **never an empty object**. Exit 0 + populated object = success. `AlreadyExists` failures include `"agent": "…"` saying to move on.

### Observed deviations from the contract

Verified against v1.69.7 — parsers must tolerate these:

- **Not every failure produces an error envelope.** `alis operations describe
  operations/bad-name --json` exits 1 with a *human-formatted* error block and
  no JSON on stdout, despite `--json`. A parser that assumes exit 1 implies a
  parseable envelope will fall through to an empty/garbage result. Always guard
  the envelope parse and keep stderr for the fallback message.
- Operation names must match `^operations/[a-z0-9-]{36}$`; a malformed name is
  rejected client-side as `InvalidArgument` before any RPC.
- Output is **protojson**, not encoding/json. Consequences: enum values arrive
  as strings (`"ACTIVE"`, `"BUILT"`, `"GA"`), not integers; unset scalars may be
  omitted *or* present as `""`/`false`; new fields can appear without notice, so
  decode into structs that ignore unknown fields rather than exact maps.
- Key casing is **not uniform**. Nearly everything is `lowerCamelCase`, but
  `alis accounts list --json` returns `display_name` in snake_case. Do not
  assume a single casing convention across commands.
- protojson emits two spaces after the colon (`"id":  "voyage"`) on most
  commands and one on others (`alis context view`). Cosmetic, but it means the
  output is not byte-stable — never diff or hash it.

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

The CLI resolves approvals automatically when it detects a harness auto-accept
mode (Claude Code `acceptEdits`/`bypassPermissions`, an opencode auto-allowed
command). **A GUI application shelling out to `alis` is not such a harness** —
it gets exit 3 on every gated command and must surface the envelope's `retry`
string to the user rather than injecting `--approve` itself.

The caller's effective tier is readable locally from
`alis doctor --json` → `settings.approvals` (an empty object means the default,
**balanced**).

### Safe mode — organisation allowlisting

Undocumented in `alis docs`, but present in local settings and readable via
`alis doctor --json`:

```json
"safeMode": { "enabled": true, "allowedOrganisationIds": ["rezco", "techbridge", "voyage"] }
```

When `enabled` is true, platform commands are restricted to the listed
organisation ids. Any tool that enumerates organisations (e.g. from `alis org
list`) and then acts on one should expect commands against a non-allowlisted
org to fail, and should read this list rather than assuming every visible org is
actionable.

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

## Verified JSON Response Shapes

`alis docs` specifies the output *contract* (one result on stdout, progress on
stderr, envelopes on failure) but publishes **no response schemas**. The shapes
below were captured from live `--json` invocations against `alis` v1.69.7 on
2026-08-08. Treat them as observed-and-current, not guaranteed: they are
protojson, so re-verify after a CLI upgrade and decode leniently.

Credential fields are shown by key name only, never by value.

### `alis whoami --json`

```jsonc
{
  "id": "1085588…",                    // numeric string
  "email": "user@example.com",
  "buildProfile": {
    "preferredHarness": "HARNESS_CLAUDE_CLI",
    "experienceLevel": "EXPERIENCE_LEVEL_BEGINNER",
    "preferredIde": "IDE_VS_CODE",
    "defaultTerminalApp": "TERMINAL_APP_APPLE_TERMINAL",
    "harnesses": [{ "harness": "…", "accessMethod": "…", "pluginVersion": "" }],
    "localEnvironmentSetupComplete": true,
    "os": "OPERATING_SYSTEM_MAC",
    "environments": ["ENVIRONMENT_REMOTE_WORKSTATION", "ENVIRONMENT_LOCAL"]
  }
}
```

**No display name and no avatar.** Anything needing those must still call the
identity API — `whoami` cannot back a full user-profile UI on its own.

### `alis version --json`

```jsonc
{ "version": "1.69.7" }
```

### `alis accounts list --json`

```jsonc
{ "accounts": [ { "name": "accounts/8na6ap", "display_name": "…", "active": true } ] }
```

Note `display_name` — snake_case, unlike every other command.

### `alis org list --json`

```jsonc
{ "landingZones": [ { "id": "voyage", "status": "ACTIVE", "displayName": "Voyage Charters" } ] }
```

The key is `landingZones`, not `organisations` — the legacy landing-zone naming
leaks into the payload even though the command is `org`. There is **no
own-vs-shared distinction** in this response; consumers that need it must use
the platform API.

### `alis org view <org> --json`

```jsonc
{
  "displayName": "Voyage Charters",
  "description": "",
  "products": [
    {
      "id": "vp",
      "status": "ACTIVE",
      "displayName": "Voyage Portal",
      "latestDefinitionVersion": "",
      "latestDefinitionStatus": "",
      "gitRemoteUrl": "https://forgejo-….run.app/voyage/vp.git",
      "googleProjectId": "voyage-vp-product-pi4"
    }
  ]
}
```

### `alis product view <org>.<product> --json`

The richest response in the CLI, and the one most worth reading in full — it
carries the complete services-overview payload in a single call.

```jsonc
{
  "displayName": "Voyage Portal",
  "description": "",
  "projectId": "voyage-vp-product-pi4",
  "gitRemoteUrl": "https://forgejo-….run.app/voyage/vp.git",
  "neurons": [
    {
      "id": "asana-v1",                 // service id, path with '/' → '-'
      "version": "1.11.1",              // latest BUILD version
      "status": "BUILT",                // BUILT | RETAGGED | BUILDING | FAILED | …
      "logsUri": "https://…-alisproxy-….run.app/executions/<uuid>",
      "type": "",
      "source": "",
      "releaseTargetOrganisations": [],
      "buildTime": "2026-08-04T19:00:26.536216562Z",
      "builtBy": "",
      "autoDeployEnvironments": [],
      "installedBlocks": [],
      "definedVersion": "1.11.0",       // latest DEFINE version; may be "" 
      "releaseEnvs": []
    }
  ],
  "environments": [
    {
      "id": "1y2ozw66zv6p3",            // opaque id — this is what -e takes
      "displayName": "staging",
      "projectId": "voyage-vp-dev-vzu",
      "status": "ACTIVE",
      "production": false,
      "allowedBranches": [],            // set by `alis environment branches`
      "deployments": {                  // MAP keyed by neuron id, not a list
        "asana-v1": {
          "id": "asana-v1",
          "version": "1.9.1",           // deployed version, ≠ built version
          "status": "RUNNING",          // RUNNING | PLANNED | DEPLOY_FAILED | …
          "logsUri": "https://…/executions/<uuid>",
          "updateTime": "2026-08-04T14:41:42.202854469Z",
          "deployedBy": ""
        }
      }
    }
  ]
}
```

Two things to note:

- `environments[].deployments` is a **JSON object keyed by neuron id**, not an
  array. Decoding it as a list silently yields nothing.
- The per-environment deployed `version` is independent of the neuron's built
  `version`; comparing them is how you detect drift.

### `alis context view [<ref>] --json`

**Fields are conditional on the working directory.** Outside a service folder:

```jsonc
{
  "organisation": "voyage",
  "product": "vp",
  "defineFolder": "/Users/…/alis.build/voyage/define/voyage/vp",
  "environments": [
    { "id": "1y2ozw66zv6p3", "displayName": "staging", "status": "ACTIVE", "production": false }
  ]
}
```

Inside `~/alis.build/<org>/build/<product>/<service-path>`, two more keys appear
and `defineFolder` narrows to the service:

```jsonc
{
  "organisation": "voyage",
  "product": "vp",
  "packageId": "voyage.vp.asana.v1",
  "serviceFolder": "/Users/…/alis.build/voyage/build/vp/asana/v1",
  "defineFolder": "/Users/…/alis.build/voyage/define/voyage/vp/asana/v1"
}
```

Note that the environments list is **absent** in the service-folder form. There
is no `buildFolder` key in either. A caller that needs `packageId` must set the
subprocess working directory into the service folder — the CLI has no flag that
substitutes for cwd here.

### `alis blocks list [<pkg>] --json`

```jsonc
{
  "installed": [],
  "available": [
    {
      "blockId": "resources",
      "displayName": "Backend Resource APIs",
      "tagline": "Go from data model to live backend in minutes",
      "releaseLevel": "GA",             // GA | RC | BETA | ALPHA | EXPERIMENTAL
      "latestVersion": "1.3.0",
      "totalInstalls": 188,
      "agenticInstallOnly": true,       // gate the install action on this
      "deprecated": false
    }
  ]
}
```

### `alis blocks versions <block-id> --json`

```jsonc
{ "versions": [ { "name": "…", "version": "1.3.0", "releaseLevel": "GA", "createTime": "…" } ] }
```

### `alis environment variables <org>.<product> --json`

```jsonc
{
  "environments": [
    {
      "environmentId": "1y2ozw66zv6p3",
      "displayName": "staging",
      "envs": [ { "name": "SOME_KEY", "value": "…" } ],
      "canUpdate": true                 // caller holds roles/environment.admin
    }
  ]
}
```

Values are returned in the clear — same handling rules as the credential-bearing
commands above.

### `alis skills search "<query>" --json`

```jsonc
{
  "queriedSkills": [
    { "id": "deploy-service", "displayName": "…", "description": "…", "version": "…", "loadCount": "42" }
  ]
}
```

`loadCount` is a **string**, not a number (protobuf int64).

### `alis git configure <org>.<product> --json` — ⚠️ credentials

```jsonc
{
  "defineGitConfig": { "remoteUrl": "…", "idToken": "<REDACTED>" },
  "buildGitConfig":  { "remoteUrl": "…", "idToken": "<REDACTED>" },
  "userName": "…",
  "userEmail": "…"
}
```

### `alis gcloud auth <org>.<product> --json` — ⚠️ credentials

```jsonc
{
  "accessToken": "<REDACTED>",
  "netrcHosts": ["…"],
  "npmrcHosts": ["…"],
  "dartHosts": ["…"],
  "dartIdToken": "<REDACTED>",
  "dartTokens": { "https://dartpubserver-….run.app": "<REDACTED>" }
}
```

### `alis doctor --json [--no-logs]`

Runs locally; uploads nothing unless `--ticket` is passed.

```jsonc
{
  "version": 1, "createdAt": "…",
  "cliVersion": "1.69.7",
  "os": "…", "arch": "…", "terminal": "…", "host": "…", "shell": "…",
  "path": ["…"],
  "auth": { "authorized": true, "buildAccount": "accounts/8na6ap" },
  "components": [ { "name": "…", "version": "…", "detected": true } ],
  "cachedProbe": { "detectedAt": "…", "cliVersion": "…", "fingerprint": "…", "components": [ … ] },
  "bins": { "claude": "…", "codex": "…", "cursor": "…", "gemini": "…", "opencode": "…", "windsurf": "…", "code": "…", "agy": "…" },
  "setup": [ { "name": "…", "installed": true, "detail": "…" } ],
  "settings": {
    "approvals": {},                    // {} = default (balanced) tier
    "safeMode": { "enabled": true, "allowedOrganisationIds": ["voyage", "…"] },
    "contextTelemetry": { … }, "notifications": { … }, "releaseNotes": { … },
    "sessionCapture": { … }, "workspace": { … }
  }
}
```

### Long-running operations

`define`/`build`/`deploy`/`blocks install|upgrade` under `--async` print the
operation envelope; `alis operations describe <name> --json` prints a
**flattened** operation view (`done`, `version`, `notes`, `error` as a *string*,
`logsUri`, plus `artifacts[]` for define and `deployments[]` for deploy) rather
than a raw `google.longrunning.Operation`.

Note the field-name split confirmed in the CLI binary: the flattened operation
view uses `logs_uri`/`logsUri`, while the per-deployment entries use
`logs_url`/`logsUrl`. They are distinct proto fields — do not normalise one to
the other.

---

## What changed since v1.64.4

Everything below exists in v1.69.7 and was absent from this document's v1.64.4
revision. Some entries are genuinely new in the CLI; others existed earlier and
were simply never written down — the two are indistinguishable without release
notes, so treat the list as "surface you may not have known about" rather than a
strict version diff. Nothing was removed.

| Command | Added / newly documented |
|---|---|
| `build` | `--allow-branch-mismatch`, `--confirm-no-paths`, `--plan-only`, `--confirm-production` |
| `deploy` | `--allow-branch-mismatch` |
| `blocks install` | `--version`, `--no-merge`, `--async` |
| `blocks upgrade` | `--version`, `--no-merge`, `--instance` |
| `blocks uninstall` / `merge` / `publish` | `--instance` (block-instance addressing) |
| `blocks create` | `--account`, `--display-name`, `--tagline`, `--yes` (first two required) |
| `blocks publish` | `--notes`, `--release-level` (required), `--build-commit`, `--define-commit` |
| `blocks list` (response) | `agenticInstallOnly`, `deprecated` |
| `environment set` / `unset` | `--deploy`, `--confirm-production`, `--yes` |
| `environment refresh` | `--key-path` |
| `environment new` | `--display-name`, `--production` |
| `environment branches` | `--allow` (repeatable), `--clear`, `--yes` |
| `packages install` | `--version`, `--language` |
| `packages upgrade` | `--path` (repeatable), `--language` |
| `packages add` | `--language` |
| `skills install` | `--harness`, `--force` |
| `skills uninstall` | `--harness`, `--project` |
| `skills create` | `--name` |
| `skills publish` | `--name` |
| `skills share` | `--email`, `--domain`, `--remove` |
| `skills feedback` | `--rating` |
| `context push-session` | `--session`, `--harness`, `--yes` |
| `support send-message` | `--message`, `--ticket`, `--yes` |
| `support send-session` | `--session`, `--harness`, `--ticket`, `--yes` |
| global | `--yes` as a per-command `--approve` alias |
| settings | `safeMode` organisation allowlist (via `alis doctor --json`) |

Command *surface* is unchanged: `org` still exposes only `list`/`view`,
`product` only `new`/`view`, `service` only `new`. There is no `org new`, no
`environment delete`, and no `service list`/`view`.

---

## Installation & Configuration

- Installed at: `~/.alis/bin/alis`
- No config files — configured via environment variables
- Key env vars: `ALIS_INSTALL`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT`
- Upgrade: `alis upgrade`
- Shell completions: `alis completion bash|fish|zsh|powershell`
