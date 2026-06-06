# Current UI vs Alis Build Kit Blueprint

## Current State (alis-hub)

| Route | Component | Data | Notes |
|-------|-----------|------|-------|
| `/` `/about` | AboutPage | Hardcoded | Dashboard with project info |
| `/develop` | DevelopPage | Hardcoded | Neuron table with Define/Build/Deploy buttons |
| `/builds` | BuildsPage | Hardcoded | Build list + logs panel |
| `/deployments` | AboutPage (placeholder) | None | Route stub only |
| `/environments` | EnvironmentsPage | Hardcoded | Env variables table |
| `/tools` | AboutPage (placeholder) | None | Route stub only |
| `/agents` | AboutPage (placeholder) | None | Route stub only |
| `/codeblocks` | CodeblocksPage | Hardcoded | Grid of codeblock cards |
| `/codeblocks/create` | CodeblockCreatePage | Forms | Codeblock creation form |
| `/codeblocks/:id` | CodeblockDetailsPage | Hardcoded | Detail with tabs + sidebar |

**Layout:** TopNav (35px) + Sidebar (300px) + Outlet

**Stack:** React 18, Tailwind v4, react-router v7, Wails v3 bindings

## Alis Build Kit Blueprint (from Vue source)

| View | Blueprint Pattern | Key Components |
|------|-------------------|----------------|
| Home/Dashboard | Panel grid with BuildKit state | `ExtenstionTile`, inline cards |
| DBD Flow | 6-stage wizard with side nav | `DbdDiagram`, `StageCard`, `CommandAction`, `CodeBlock` |
| Identity Flow | 2-stage wizard with config panels | `StageCard`, `ConfigValue`, `CopyLinkButton` |
| MCP Flow | 3-stage wizard with agent panels | `StageCard`, `ConfigValue`, `CopyLinkButton` |
| Agent Flow | Documentation page w/ checklist | `ExecuteCommandBtn`, `CodeBlock` |
| Agent Tool | 4-stage pipeline | `AddToolDiagram`, `ExecuteAugmentedCommandBtn` |
| Agent Launchpad | Registry hub with cards | `ExecuteCommandBtn` |
| Gemini Launchpad | Multi-stage multi-group wizard | `FlowShell`, `StageNav`, `Checklist`, `StageCard` |
| Glass Mode | Standalone explanation page | `CodeBlock` |

**All pages use:** `PageLayout` shell (back button + title + banner + slot)

## What's Already Well-Aligned

- **TopNav tabs** — already cover all major sections
- **Develop page** — already has Define/Build/Deploy buttons per row
- **Codeblock pages** — marketplace grid and detail view exist
- **Sidebar** — context-switches based on current route
- **Dark theme** — matches Alis VS Code theme style
- **Custom components** — Button, Table, Input, Card exist as primitives

## What Needs Building (Phase 5)

### New Pages (replacing placeholders)

| Route | Page | Blueprint Source | Key Features |
|-------|------|-----------------|--------------|
| `/deployments` | DeploymentsPage | Alis DBD wizard | Stage-based: Define → Build → Deploy workflow |
| `/tools` | ToolsPage | Alis Identity/MCP flows | Identity setup, MCP server config |
| `/agents` | AgentsPage | Alis Agent Launchpad + Agent Tool | Agent registry, tool registration, Gemini setup |

### Enhanced Pages

| Route | Enhancement | Blueprint Source |
|-------|-------------|-----------------|
| `/develop` | Stage-based DBD wizard (modal or embedded) | CustomApis.vue |
| `/environments` | Group by environment type (Production/Staging/Dev) | WorkspaceContext model |
| `/builds` | Connect to actual backend (vp-build CLI) | Build runner patterns |

### New Shared Components

| Component | Blueprint Source | Purpose |
|-----------|-----------------|---------|
| `PageLayout` | PageLayout.vue | Standard page shell with back, title, actions slot |
| `StageCard` | StageCard.vue | Step card with number badge, icon, slot |
| `ConfigValue` | ConfigValue.vue | Label + read-only mono value (copyable) |
| `CommandAction` | CommandAction.vue | Button that triggers a command/action |
| `CodeBlock` | CodeBlock.vue | Syntax-highlighted code display |
| `DbdDiagram` | DbdDiagram.vue | D3 animated pipeline visualization |
| `ExecuteCommandBtn` | ExecuteCommandBtn.vue | Simple command button |
| `ExecuteAugmentedCommandBtn` | ExecuteAugmentedCommandBtn.vue | Split button with AI assistance |

### State Management

Blueprint uses **Pinia store** (`buildStore`) with protobuf-serialized state. Current app has no state management.

**Recommended additions:**
- A workspace/session context (store org, product, environment, active neurons)
- A build state store (build queue, logs, versions)
- A codeblock instance store (installed blocks, versions)
- A deployment/environment store

## Implementation Priority

1. **PageLayout component** — reusable shell that all pages should use
2. **DBD wizard** (`/deployments`) — the core workflow, replaces placeholder
3. **State management** — workspace context store, connects mock data path
4. **Enhanced Develop page** — stage navigation, DBD controls
5. **Agents page** (`/agents`) — Agent Launchpad hub
6. **Tools page** (`/tools`) — Identity + MCP setup flows
7. **Backend service wiring** — connect to Wails Go bindings
