You are reviewing alis-hub-v3, a Wails desktop app (Go + React) that replicates the alis VS Code
extension and the alis web console (console.alisx.com). The app was built by reverse-engineering
those two references — no official proto files exist. Your job is to produce a structured feature
parity report: for each feature area, rate it as FUNCTIONAL / PARTIAL / STUB / MISSING, list what
works, what is absent, and flag any constraint the next implementer must respect.

---

CODEBASE LAYOUT
- Go backend services: productservice.go, servicespage.go, defineservice.go, buildservice.go,
  deployservice.go, packageservice.go, sharepage.go, servicemanager.go
- Frontend pages: frontend/src/app/pages/ (one file per page, see routes.tsx for full list)
- Wails bindings auto-generated into frontend/bindings/alis-hub-v3/

KNOWN CONSTRAINTS (must be preserved in any new work)
1. Auth: cookie-based via ConsoleTokenSource. Cookies named alis_access_token_fvc,
   alis_id_token_fvc, alis_refresh_token_fvc. Stored at ~/.alis/console-credentials.json.
   Login flow triggers the system browser via `alis auth login` subprocess.
2. Transport: all console API calls use grpc-web-text (base64 framing). doConsoleGRPCWeb()
   is the shared helper. Never use raw HTTP JSON to the console endpoints.
3. Proto field numbers are reverse-engineered and hardcoded — do not renumber them.
   - ListOrganisations: response field 1 = []Organisation (f1=name, f2=display_name,
     f3=description, f4=logo, f12=account)
   - ListProducts: request f1=parent, f4=read_mask; response f1=[]Product
     (f1=name, f2=display_name, f21=state varint where 1=Active)
   - GetProduct: request f1=name, f2=read_mask
4. App phase state machine (workspace.tsx): init → login → picking-org → picking-product →
   workspace. Pages inside the workspace phase read org/product from useWorkspace().state.
   Any new page must do the same — never hardcode org or product strings.
5. All backend methods exposed to the frontend must be registered as Wails services in main.go.
   Check that any new Go method is wired up there.

WHAT TO AUDIT — go through each page in routes.tsx and evaluate:

About (/about)
  - Shows product overview, active environment card, environment switcher
  - Check: does GetProductOverview actually populate all fields? Is logout wired up?

Services (/services)
  - Shows neurons (services), allows creating a new neuron via CreateNeuron
  - Check: does the create flow complete end-to-end? Are deployment states per neuron shown?

Develop (/develop)
  - Define tab: select neuron → pick commit → run define → poll → show Glass explanation
  - Build tab: select neuron → pick branch/commit → run build (local or cloud) → stream logs
  - Deploy tab: currently STUB ("Coming soon") — compare to extension's deploy flow
  - Check: is PollDefineOperation correctly streaming? Is the local build terminal (xterm.js)
    fully wired to StartLocalBuild / PollLocalBuild / WritePackageInput / ResizePackageTerminal?

Builds (/builds)
  - Browse version history, trigger cloud build, view logs, see deployed envs per version
  - Check: is changelog (commits between versions) implemented? Is deployedEnvsMap populated?

Deployments (/deployments)
  - Select neuron + version + environments → plan-only or full deploy → poll + stream logs
  - Check: is ListNeuronVersions wired up? Is beta deploy flag surfaced?

Environments (/environments)
  - List environments, CRUD env vars, create/update/delete environments
  - Check: CreateEnvironment, UpdateEnvironment, DeleteEnvironment — are all three flows
    complete in both the Go service and the UI?

Share (/share)
  - Shows IAM policy (role bindings), users, invites
  - Check: is invite creation implemented? Is role assignment editable or read-only?

Codeblocks (/codeblocks, /codeblocks/create, /codeblocks/:id)
  - List codeblocks (ListCodeblocks is implemented in Go)
  - Create and detail pages appear to be STUB shells — evaluate what fields the alis extension
    exposes for codeblock creation and what is still missing

Agents (/agents)
  - UI shell only — Init Launchpad, Register Agent, MCP Server, Client Interfaces buttons
    have no backend wiring
  - Compare to what the alis console exposes under /manage/agents and document what proto
    calls would be needed

Tools (/tools)
  - Identity tab (OAuth/OIDC domain config) and MCP tab — check if any backend methods exist
    or if this is entirely a static UI

BuildKit (/buildkit and sub-routes)
  - /buildkit: landing page for guided walkthroughs
  - /buildkit/custom-apis: step-by-step guide for creating a custom gRPC API
  - /buildkit/agent: step-by-step guide for creating an agent
  - /buildkit/agent-tool: step-by-step guide for adding a tool to an agent
  - /buildkit/launchpad: links out to console.alisx.com/manage/agents/register — STUB
  - /buildkit/reporting: appears to be a STUB
  - Evaluate: which steps in the guided flows are interactive (call real backend) vs static copy?

---

REFERENCE SOURCES TO CHECK
- The alis extension's command palette entries are your ground truth for what operations exist.
  Known extension commands include: alis define, alis build, alis deploy, alis package,
  alis neurons list/create, alis environments list/create/update/delete, alis share,
  alis codeblocks, alis auth login/logout, alis product sync
- The alis web console (console.alisx.com) has sections: Products, Services, Environments,
  Builds, Deployments, Share, Agents, Developer Tools

OUTPUT FORMAT
For each feature area output a block like:

  [AREA] Status: FUNCTIONAL | PARTIAL | STUB | MISSING
  Works: <bullet list of what is complete>
  Gaps: <bullet list of what is absent or broken>
  Constraints: <any proto field numbers, auth requirements, or API shapes to preserve>
  Suggested next steps: <1-3 concrete tasks>

End with a prioritized top-5 list of the most impactful gaps to close first.
