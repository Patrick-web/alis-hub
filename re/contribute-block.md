# Contribute to CodeBlock — Reverse Engineered from alis VS Code Extension

Source: `~/.vscode/extensions/alisexchange.alis-build-2.0.410/dist/extension.js`
Extension version: 2.0.410

---

## Feature Overview

"Contribute to CodeBlock" lets a maintainer push new code into an installed block
instance by opening git worktrees for the product's build and define repos, making
commits, pushing them, then calling `CreateBlockVersion` to publish a new block version.

---

## VS Code Commands

| Command ID | Title |
|---|---|
| `alis.blocks.worktrees.init` | Contribute to CodeBlock |
| `alis.blocks.worktrees.add-files` | Add to CodeBlock worktree |
| `alis.blocks.worktrees.close` | Close CodeBlock worktree |
| `alis.blocks.createVersion` | Create CodeBlock version from commits |
| `alis.blocks.scm.merge` | Merge CodeBlock Branch |

---

## User Flow

### Phase 1 — Open worktrees (`worktrees.init`)

Triggered from a block **Instance** node in the tree view.

1. Derives org + product from `instance.getPackage()` (e.g. `packages/myorg.myproduct.my-service.v1`).
2. Gets the instance's git branch via `instance.getGitBranch()`.
3. Creates a temp directory:
   ```
   {os.tmpdir()}/.alis-blocks-worktrees/{blockId}/{packageId}/{instanceId}/
   ```
4. Adds a **build git worktree** at `{above}/build`:
   - Source repo: `~/alis.build/{orgId}/build/{productId}/`
   - Branch: the instance's git branch (creates it from `origin/{branch}` if missing)
   - Fetches `--all --prune` after adding
5. Adds a **define git worktree** at `{above}/define`:
   - Source repo: `~/alis.build/{orgId}/define/`
   - Same branch logic
   - Fetches `--all --prune` after adding
6. Adds the worktree folder to the VS Code workspace as
   `"Worktree • {branch}"`.
7. Optionally copies existing files from master branch into the worktree
   (user is asked via a modal).
8. Watches for SCM commits. When both build **and** define repos have been pushed
   (ahead-count goes from >0 to 0), automatically triggers `alis.blocks.createVersion`.

### Phase 2 — Make changes and push

User edits files inside the worktree folders in VS Code, commits via VS Code SCM,
and pushes the branch. The extension detects the push via the SCM `onDidChange` listener
(tracks `HEAD.ahead` count).

### Phase 3 — Create a new version (`createVersion`)

Can be triggered automatically after push or manually from the tree view.

1. Calls `ListBlockVersions` (pageSize=1) to find the latest version tag for display.
2. Shows a QuickPick of recent commits from the **define** repo branch (git log, max 50).
   - Reads local git log from `~/alis.build/{orgId}/define/` on branch `origin/{branch}`
   - User picks the define commit SHA.
3. Shows a QuickPick of recent commits from the **build** repo branch (git log, max 50).
   - Reads local git log from `~/alis.build/{orgId}/build/{productId}/`
   - User picks the build commit SHA.
4. Shows a QuickPick for release level:
   - Generally Available (GA = 99)
   - Release Candidate (RC = 12)
   - Beta (BETA = 9)
   - Alpha (ALPHA = 6)
   - Experimental (EXPERIMENTAL = 3)
5. Shows an input box for release notes.
6. Calls `CreateBlockVersion` (LRO). Progress notes from the operation metadata are
   streamed into the VS Code progress notification.
7. On success: VS Code workspace is refreshed; a success notification is shown.

---

## gRPC APIs

### ListBlockVersions (pre-flight)

```
alis.bl.blocks.v1.BlockVersionsService/ListBlockVersions
```

Used only to read the current latest version tag for display in the release level picker.

Request:
```
parent  = block resource name  (e.g. "blocks/sendgrid")
pageSize = 1
readMask = ["name", "version"]
```

---

### CreateBlockVersion (main call)

```
alis.bl.blocks.v1.BlockVersionsService/CreateBlockVersion
```

This is an **LRO** (Long-Running Operation). The response is polled every 3 seconds
until done.

**`CreateBlockVersionRequest`** (proto field numbers):

```
field 1: parent        (string)  — block resource name, e.g. "blocks/sendgrid"
field 2: block_version (BlockVersion)
```

**`BlockVersion`** fields set by this flow:

```
define_source (BlockVersion.Source)
  field 1: instance   (string)  — instance resource name, e.g. "blocks/sendgrid/instances/631"
  field 2: commit_sha (string)  — define repo commit SHA selected by user

build_source (BlockVersion.Source)
  field 1: instance   (string)  — same instance resource name
  field 2: commit_sha (string)  — build repo commit SHA selected by user

release_level (int32)
  EXPERIMENTAL = 3
  ALPHA        = 6
  BETA         = 9
  RC           = 12
  GA           = 99

release_notes (string)  — free-text release notes from input box
```

**`CreateBlockVersionMetadata`** (streamed during LRO polling):
- `progress_notes` — shown in VS Code progress notification

**Response**: the created `BlockVersion` message.

---

## Worktree Directory Layout

```
{os.tmpdir()}/
  .alis-blocks-worktrees/
    {blockId}/                   e.g. "sendgrid"
      {packageId}/               e.g. "myorg.myproduct.my-service.v1"
        {instanceId}/            e.g. "instance-123"
          build/                 ← git worktree of ~/alis.build/{org}/build/{product}/
          define/                ← git worktree of ~/alis.build/{org}/define/
```

The worktree folder is also added as a VS Code workspace folder named `"Worktree • {branch}"`.

---

## Commit Fetching (local git, not an API)

`getCodeBlockCommits(branch, type, limit=50)`:

- `type = "build"` → reads git log from `~/alis.build/{orgId}/build/{productId}/`
- `type = "define"` → reads git log from `~/alis.build/{orgId}/define/`
- Branch ref: `origin/{branch}` (i.e. the instance's `getGitBranch()` value prefixed with `origin/`)
- Format fields: `hash`, `date` (unix epoch), `message`, `author_name`, `author_email`
- Results are grouped by author in the QuickPick

---

## Relationship to Bootstrap

| Feature | Bootstrap | Contribute |
|---|---|---|
| Entry point | Files in explorer | Instance in tree view |
| How files get in | Copied from local workspace to staging | Git worktree on instance branch |
| API called | `BootstrapBlock` | `CreateBlockVersion` |
| When to use | First time — no content yet | Updating an existing block version |

See [`bootstrap-block.md`](./bootstrap-block.md) for the Bootstrap flow.

---

## Hub Implementation Status

`productservice.go` has a `ContributeBlock` function that calls
`BlockVersionsService/CreateBlockVersion`, but it uses the **file-upload approach**
(sending raw proto/infra/build files), not the **commit-SHA approach** used here.
The commit-SHA approach (`define_source` + `build_source`) is the production path
used by the extension for contributors working in local git worktrees.
