# Alis Extension Build Flow Reference

Source: `~/.vscode/extensions/alisexchange.alis-build-2.0.398/dist/extension.js`
Command: `alis.dbd.run-build` — handler function `Vct()`

---

## Flow Sequence

### 1. Neuron Selection
- QuickPick title: `"ⓢ ⓓ Ⓑ Ⓓ • Build • Select Service"`
- Fetches active neurons from workspace context via `getActiveNeuronsList()`
- Falls back to `ListNeuronsRequest` via `neuronsClient.listNeurons()` if none active
- Neuron resource format: `organisations/{org}/products/{product}/neurons/{id}-{version}`

### 2. Commit Selection
- QuickPick title: `"ⓢ ⓓ Ⓑ Ⓓ • Build • {neuronId}"`
- Calls `getNeuronCommits(neuron, "build", 50, branch)` — fetches up to 50 commits
- Each item shows: commit message as label, `"{relative time} • {author} • {short SHA}"` as detail
- Appends a separator + "Other Branches" option at the bottom

### 3. Branch Selection (conditional)
- Only triggered if user picks "Other Branches" from commit picker
- Calls `getAvailableBranches("build")`
- QuickPick of branch names
- After selection, re-runs commit picker scoped to that branch

### 4. Dockerfile Selection
- Search path: `{build-root}/{org}/build/{product}/{neuronPath}`
- Finds all files named `Dockerfile` recursively via `xct(path, "Dockerfile")`
- Multi-select QuickPick (`canPickMany: true`)
- Returns `{ allPaths: [], selectedPaths: [] }`

### 5. Build Strategy Selection
| Option | ID | Condition |
|--------|----|-----------|
| Build | `build_cloud` | Always shown |
| Build and Deploy | `build_cloud_and_deploy` | Always shown |
| Build Locally | `build_local` | Only on local/nix workstation with Dockerfiles |

### 6. Deploy Options (if "Build and Deploy")
- Channel: Stable or Beta
- Mode: Deploy or Plan Only
- Constructs a `RunDeployRequest` with selected environments

---

## API: gRPC + Protobuf

Libraries: `@grpc/grpc-js`, `@internal.os.alis.services/protobuf`, `@internal.bl.alis.services/protobuf`

### RunBuildRequest fields
```
neuron:    "organisations/{org}/products/{product}/neurons/{id}-{version}"
commit:    "<git sha>"
imagesMap: { dockerfile_path → BUILD | RETAG | BUILT_LOCALLY }
```

### RunBuildResponse fields
```
buildLogsUrl    string
version         string
neuronVersion   string   // full neuron version resource
deploymentsList []DeploymentMetadata { logsUrl }
```

### Other gRPC calls
| Method | Client | Purpose |
|--------|--------|---------|
| `listNeurons` | `neuronsClient` | Fetch available neurons |
| `getNeuronCommits(neuron, "build", 50, branch)` | `tp(e)` | Load commit history |
| `getAvailableBranches("build")` | `tp(e)` | Load branch list |
| `runBuild(RunBuildRequest)` | `dbdClient` | Submit build |
| `runDeploy(RunDeployRequest)` | `dbdClient` | Submit deploy |

---

## Progress Tracking

- Polling interval: **5 seconds**
- Timeout: **49 minutes**
- Polling function: `f1()` — polls long-running operation metadata
- Parses `RunBuildMetadata` each tick: version, logs URL, deploy logs URLs, notes

Progress notification format:
```
{Version} [🅑 Logs]({buildLogsUrl}) [🅓 Logs]({deployLogsUrl}) • {notes} • ({elapsed} ago)
```

State machine:
```
QUEUED → BUILDING → BUILT → DEPLOYING → DEPLOYED
```

Error notification format:
```
{Version} • [🅑 Logs]({buildLogsUrl}) • {error message}
```

---

## Implementation Notes for alis-hub-v3

- The branch picker is **not always shown** — it's an escape hatch from the commit picker ("Other Branches" item)
- Dockerfile selection maps each file to an action (`BUILD` / `RETAG` / `BUILT_LOCALLY`); local builds require gcloud CLI + docker-credential-gcr
- The build strategy step drives whether deploy options are collected at all
- After a successful build-only run, the extension offers a follow-up "Deploy?" prompt rather than chaining immediately
- Long-running op polling mirrors the Define operation pattern already in `alisclient.go` — same `f1()`-style loop, different metadata type (`RunBuildMetadata` vs `RunDefineMetadata`)
