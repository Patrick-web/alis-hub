# Bootstrap Block — Reverse Engineered from alis VS Code Extension

Source: `~/.vscode/extensions/alisexchange.alis-build-2.0.410/dist/extension.js`
Extension version: 2.0.410

---

## Feature Overview

"Convert to CodeBlock" lets a user take files from a neuron's local workspace and
bootstrap a new (or populate an existing) Codeblock entry on the alis platform.

---

## VS Code Commands

| Command ID | Title | Category |
|---|---|---|
| `alis.blocks.bootstrap.init-files` | Convert to CodeBlock | alis • 🅱 |
| `alis.blocks.bootstrap.add-files` | Add to CodeBlock staging | alis • 🅱 |
| `alis.blocks.bootstrap.commit` | Commit CodeBlock | alis • 🅱 |
| `alis.blocks.bootstrap.discard` | Discard Codeblock | alis • 🅱 |
| `alis.blocks.bootstrap.remove-file` | Remove from Codeblock | alis • 🅱 |

---

## User Flow

1. User right-clicks files/folders in the VS Code explorer → **Convert to CodeBlock**
2. Selected URIs are staged into a sidebar tree view (`alis-codeblocks.views.bootstrap`),
   organised by neuron/package.
3. Files are categorised by their local path:
   - Build repo, `infra/` subdirectory → `infra_files`
   - Build repo, everything else → `build_files`
   - Define repo → `proto_files`
4. User clicks **Commit CodeBlock** on the package node in the staging view.
5. A QuickPick shows:
   - All existing blocks that do not yet have contributed content (to add files to an existing block)
   - **Create new block** option
6. If creating new, input boxes collect:
   - `block_id` — short lowercase ID, e.g. `sendgrid` (immutable after creation)
   - `display_name` — human-readable name, e.g. `SendGrid Email Dispatcher`
   - `tagline` — one-liner description (optional)
   - `account` — the publisher account (from ListAccounts)
7. If adding to existing: IAM permissions are checked first
   (`BootstrapBlock`, `UpdateBlock`, `CreateBlockVersion`), and the block must have
   zero contributed files already.
8. `BootstrapBlock` RPC is called with the staged files + block metadata.
9. On success: a VS Code info message is shown with a **View** link to
   `https://console.alisx.com/build/{block.name}/overview`.

---

## gRPC API

### Method

```
alis.bl.blocks.v1.BlocksService/BootstrapBlock
```

### BootstrapBlockRequest (proto field numbers)

```
field 2: block (Block)
           display_name (string)
           publisher (Block.Publisher)
             account (string)  — e.g. "accounts/abc123"
           overview_details (Block.OverviewDetails)
             tagline (string)
field 3: block_id (string)     — e.g. "sendgrid"
field 4: package (string)      — e.g. "packages/myorg.myproduct.my-service.v1"
field 5: contributed_content (BlockVersion.Content)
           field 1: build_files[]  (File)
           field 2: infra_files[]  (File)
           field 3: proto_files[]  (File)
```

### File (proto)

```
field 1: filename (string)  — relative path within the folder
field 2: content  (bytes)   — raw file bytes
```

### BootstrapBlockResponse (proto field numbers)

```
field 1: block (Block)  — created/updated block, includes name + display_name
```

---

## Package ID Derivation

The `package` field in the request is derived from the local workspace path:

```
Local path:   ~/alis.build/{orgId}/{productId}/build/{neuron-name}/{version}/...
Package name: packages/{orgId}.{productId}.{neuron-name}.{version}

Example:
  ~/alis.build/myorg/myproduct/build/my-service/v1/
  → packages/myorg.myproduct.my-service.v1
```

Regex used to extract the neuron root from a workspace folder URI:
```
/^(.+?\/v\d+)/
```

Path-to-category mapping:
```
{neuron-root}/build/infra/**  → infra_files
{neuron-root}/build/**        → build_files
{neuron-root}/define/**       → proto_files  (define repo)
```

---

## Related APIs (also present in extension)

The extension also calls these before/after BootstrapBlock:

- `ListBlocks` — to show existing blocks in the QuickPick
  - Filter: `"Block.release_level != 'GA'"`
  - ReadMask: `name, display_name, publisher, agent`
- `ListBlockVersions` — to check if an existing block already has content
  - PageSize: 1; ReadMask: `name, contributed_content`
- `TestIamPermissions` — to verify user has permission before adding to an existing block
  - Permissions checked: `BootstrapBlock`, `UpdateBlock`, `CreateBlockVersion`

---

## Hub Implementation Status

`productservice.go` has **no `BootstrapBlock` implementation** as of the time of this writing.
The hub does have `CreateCodeblock` (→ `BlocksService/CreateBlock`) and `ContributeBlock`
(→ `BlockVersionsService/CreateBlockVersion`), but these are separate RPCs that do not
bootstrap from a local neuron package.
