# Alis CLI Migration — Delivered State and Parity Audit

> This document records what the `alis` CLI now backs in alis-hub-v3, what
> deliberately still does not, and where the CLI cannot reach parity with the
> gRPC/Console paths it replaces. It supersedes the pre-migration plan of the
> same name.
>
> Verified against `alis` v1.69.7. Response shapes and flags:
> [ALIS_CLI_FEATURES.md](./ALIS_CLI_FEATURES.md).

## Summary

Every top-level `alis` command is reachable from Go. The surface is:

| Layer | Where | Count |
|---|---|---|
| CLI-native capability (skills, ask, doctor, accounts, support, …) | `cliservice*.go` | 37 methods |
| Code blocks and environments | `product_blocks_cli.go`, `product_envs_cli.go` | 16 methods |
| Define / Build / Deploy with full flag coverage | `backend.go`, `dbdoptions.go` | 3 `Run*Options` + narrow forms |

Backed by 168 unit tests (no credentials or network), 17 live sandbox tests
behind the `alis_integration` tag, and 19 captured response fixtures.

```
go test ./...                          # unit + fixtures, hermetic
go test -tags alis_integration ./...   # live, needs credentials
```

---

## What the CLI now backs

### Define, Build, Deploy

`DefineOptions` / `BuildOptions` / `DeployOptions` cover every flag the CLI
exposes: commit and branch pinning, explicit Dockerfile build/retag paths,
`--retag` for infra-only changes, `--confirm-no-paths`, chained build+deploy,
`--plan-only`, `--allow-branch-mismatch`, `--confirm-production`, and define's
`--install` / `--install-language`.

The zero value of each option set reproduces the original narrow calls exactly,
which is why the existing Develop/Builds/Deployments UI works unchanged.

Operations are followed with `alis operations wait`, streaming the CLI's stderr
NDJSON to the frontend as `dbd:progress` / `dbd:done`. This runs *alongside* the
existing poll loop rather than replacing it — polling stays the source of truth,
so a dropped stream degrades to the previous behaviour instead of breaking.

### Code blocks

`ListServiceBlocks`, `InstallBlockCLI`, `UpgradeBlockInstanceCLI`,
`UninstallBlockInstanceCLI`, `MergeBlockInstanceCLI`, `CreateBlockCLI`,
`PublishBlockCLI`, `ListBlockAccounts`, `ListBlockVersionsCLI`.

The CLI reaches things the Console path never exposed: instance addressing for
multi-install services, per-install state (`installedVersion`, `state`,
`buildFolder`, `gitBranch`, `upgradeAvailable`), the `agenticInstallOnly` and
`deprecated` catalog flags, publishable accounts, and `blocks publish`.

### Environments

`ListEnvironmentVariablesCLI`, `SetEnvironmentVariablesCLI`,
`UnsetEnvironmentVariablesCLI`, `RefreshEnvironmentCLI`,
`GetEnvironmentBranchesCLI`, `SetEnvironmentBranchesCLI`,
`CreateEnvironmentCLI`.

New capability: branch designation (no Console equivalent, and precisely what
`--allow-branch-mismatch` overrides), the `canUpdate` permission flag,
`--deploy` on variable writes, `--key-path` on refresh, and `--production` on
create.

### CLI-only capability

Skills (search / load / resource / list / installed / install / uninstall /
upgrade / create / edit / publish / delete / share / feedback / request), ask
with multi-turn sessions, doctor, accounts list/select, product and service
creation, operation describe/follow, authorise, packages add, support
send-message / send-session, CLI self-upgrade, and `alis docs`.

### UI

| Page / pane | Route | What the CLI gives it |
|---|---|---|
| Skills | `/skills` | browse or search the registry, read instructions, install into the local Claude Code harness |
| Ask | `/ask` | multi-turn Q&A with clickable SKILL citations |
| Diagnostics | `/diagnostics` | `alis doctor`, incl. automation tier and safe-mode allowlist |
| Service blocks | `/services/:neuronId/blocks` | per-service installs with instance refs, `upgradeAvailable`, `gitBranch`, and `agenticInstallOnly`/`deprecated` gating |
| Environments | `/environments` | deploy-branch designation, `canUpdate` permission gating, gated variable deletion |
| Define / Build panes | Develop | live `dbd:progress`; retag for infra-only builds |
| Deploy pane | Develop | production gate handling, live progress |

20 of the 56 new methods have a UI call site. The remaining 36 are reachable
from Go and covered by tests, but have no screen yet — mostly skill authoring
(create/edit/publish/share/delete), support, accounts selection, and resource
creation.

### Approval gates in the UI

`ApprovalGate.tsx` renders both gate kinds. The flow is two-pass: the first
call runs ungated so the CLI itself reports what would change, and that message
is shown verbatim because it is what the user approves. Only then does the
retry carry the approval — as a typed `Approval` struct matched to the gate
code, never by replaying the envelope's command string, so a tier approval
cannot escalate into a production confirmation.

---

## Approval gates are results, not errors

Exit 3 is a normal outcome for a large part of this surface, not an edge case:

- `environment unset`, `blocks uninstall`, `blocks create` and `skills delete`
  are destructive, so they are gated on the **default** "balanced" tier.
- On the "manual" tier, `define`, `build`, `deploy`, `packages install` and
  `blocks install` are gated too.
- Every write to a production environment is gated at **every** tier.

A desktop GUI is not a harness with a standing approval grant, so these reach
the user. Gated calls return a structured result carrying the code, a message
describing what would change, and the CLI's exact retry command:

```go
// First pass: no approval, so the CLI reports what it would change.
res, err := svc.UnsetEnvironmentVariablesCLI(org, product, env, names, false, Approval{})
// err == nil, res.Gated == true, res.RetryCmd == "alis environment unset … --approve"
// Second pass, only after the user agrees, carrying exactly what the gate asked:
res, err = svc.UnsetEnvironmentVariablesCLI(org, product, env, names, false, res.Approval)
```

**Nothing in the app adds `--approve` or `--confirm-production` on the user's
behalf.** The retry string is echoed back for them to approve. The one place
`--yes` is passed is `support send-message`/`send-session`, where the user has
already clicked an explicit "send" action and the command is not gated.

---

## Where the CLI cannot reach parity

These are the cases where the CLI has no equivalent. Each keeps its gRPC or
Console path, and the option that cannot be expressed is **refused rather than
ignored** — a silently dropped `--plan-only` is the difference between
previewing a deploy and applying it.

| Capability | Why the CLI cannot do it | What happens |
|---|---|---|
| `releaseType` on define | No `--release-type` flag | `RunDefineOptions` routes to gRPC |
| `beta` on deploy | No beta flag | `RunDeployOptions` routes to gRPC |
| Owned vs shared organisations | `alis org list` returns a flat list with no ownership | gRPC is primary; CLI is a fallback that files everything under "Own" |
| User display name and avatar | `alis whoami` returns neither | gRPC is primary; CLI fallback yields an email-only profile |
| Glass AI define explanations | Not exposed by the CLI | Stays on `alis.os.glass.v1` |
| Environment update / delete | No CLI subcommand | Stays on the Console API |
| Codeblock docs, members, IAM | No CLI subcommand | Stays on the Console API |
| Block install returning worktree paths | The CLI merges into main instead | `DoInstallBlock` keeps the Console path; see below |
| "which services have this block?" | `blocks list` is per-service, not per-block | `ListCodeblockInstances` stays on the Console API — the two work on different axes and are not interchangeable |

Conversely, the gRPC fallback refuses CLI-only options (`branch`,
`confirmNoPaths`, `allowBranchMismatch`, `confirmProduction`, `planOnly` with
build, deploy chaining, retag/path selection, define `--install`) with a clear
error naming the option.

---

## Deliberate non-migrations

**Block install/upgrade defaults.** `InstallBlockCLI` exists and is fully
wired, but `DoInstallBlock` still runs the Console path by default. The CLI does
strictly more: after the server-side install it merges the `block/*` branch into
`main` in **both** the product build repo and the org define repo and pushes.
Those are the same working trees this app's own git UI operates on, so switching
the default silently changes what lands in the user's tree. `NoMerge` exposes
the choice and `MergeBlockInstanceCLI` is the deferred half — adopting the CLI
path is a UI decision about what to do with a dirty working tree, not a
mechanical swap.

**Authentication** splits in two, and the split is deliberate.

*Git credentials are the CLI's.* The app holds none of its own. `gitCmd` puts
every git command it runs on `!alis git credential` via `-c` flags, so auth works
even in a repo `alis authorise` has never touched. `CleanupLegacyGitAuth` runs at
startup to undo the scheme this app used to install: a symlink of its own binary
over `~/.alis/bin/git-credential-alis`, a *global* `credential.helper` pointing at
that symlink (which made this app answer every git credential request on the
machine, for any host), and a Console access token baked into
`~/.alis/git-auth.gitconfig` that each repo `[include]`d as an `http.extraHeader`.
That scheme and the CLI's raced per-repo on last-writer-wins, and carried
different tokens: the CLI's is Forgejo-scoped (`email`/`exp`/`sub`/`uid`), the
app's was the full Console identity token.

*Console and gRPC credentials cannot move,* so `alisauth.go` still owns the PKCE
flow, `~/.alis/console-credentials.json`, and refresh. Two things block it. The
CLI keeps its own credentials in an AES-256-GCM envelope
(`~/.alis/credentials.json` + `credentials.key`) that does not decrypt with the
key file alone, so the app can neither read nor write it. And no CLI command
returns a Console-scoped token: `alis git credential` and `alis git configure`
return Forgejo-scoped ones, `alis gcloud auth` returns GCP/registry ones, and
none of them carry the `policy`, `scopes`, `groups` and `active_build_account`
claims that console.alisx.com and the gRPC services authorise against. Closing
this needs a token command from the platform team.

Consequently `CheckAuth` still treats the Console token as authoritative rather
than `alis whoami`: large parts of the app call the Console and gRPC APIs
directly, so a working CLI session says nothing about whether those calls will
succeed. Treating it as sufficient would let the UI past the login gate and then
fail every non-migrated request. The two PKCE grants are independent at the
identity server (both stores were observed refreshing minutes apart with both
remaining valid), so the duplication costs a second sign-in but does not
invalidate either session.

**Everything with no CLI counterpart** stays as-is: the git GUI, the GCP tools
(Spanner, Cloud Logging, Artifact Registry, Cloud Run), the workflow engine,
proto decoding, LocalAI, settings and the changelog.

---

## Sandbox limitations

`voyage.zz` is the sandbox product. Its build repo **404s** both from a local
`git ls-remote` and server-side, so `alis define` fails with
`downloading proto files: api returned status: 404 Not Found` — define, build
and deploy cannot complete there. `demo-v1` has no files; `dummy-v1` has
committed protos and two installed blocks, so it is the fixture service.

Live tests therefore cover read-only commands and failure paths. That
constraint turned out to be productive: the sandbox's failing define is what
exposed the already-done-and-failed async envelope, and its gated
`environment unset` is what verifies exit-3 handling end to end.

Parsing and argument construction are covered by the fixture-backed unit tests
instead, which run everywhere without credentials.

---

## Traps worth knowing

Each of these was found the hard way and is now pinned by a test.

1. **`operations describe` flattens `error` to a string; the `--async` envelope
   returns it as an object.** The two shapes cannot share a decoder. A define
   that fails before `--async` returns arrives as `done: true` with exit code 0
   and the failure only in the envelope — reading just `name` reports it as
   still running and polls forever.
2. **`operations wait` exits 1 on a failed operation but still prints a valid
   operation on stdout.** Treating a non-zero exit as a CLI-level failure
   discards the operation's own error.
3. **stderr mixes NDJSON progress with human-formatted error blocks**, so
   unparseable lines must be skipped rather than treated as corruption.
4. **`environments[].deployments` is an object keyed by neuron id, not an
   array.** Decoding it as a list yields nothing and reports no error.
5. **`blocks list` installed and available entries have different shapes** —
   installed uses `installedVersion`, not `version`.
6. **`skills installed` returns a bare JSON array**, unlike every other skills
   command.
7. **`accounts list` returns `display_name` in snake_case**, alone among all
   commands.
8. **`context view` fields depend on the working directory.** `packageId` and
   `serviceFolder` appear only inside a service folder. A GUI launched from
   Finder has cwd `/`, where nothing resolves — hence `RunIn`.
9. **`alis upgrade` replaces the binary in place**, which can pull it out from
   under a running command. `cliwrap` survives that rather than panicking.
10. **`alis docs codeblocks` documents `blocks install` argument order
    backwards.** `--help` is authoritative: block id first, package id second.
11. **A gated deploy is not a started deploy.** RunDeploy reports a production
    gate in-band (`error` = the gate code, `notes` = the retry command) and
    still returns without throwing. Treating any non-throwing result as a
    successful start leaves the UI polling an operation that was never created.
12. **The app's "protected environments" list is not the platform's production
    flag.** It is a local, user-maintained list, so the platform gate can fire
    for an environment the app never warned about.

---

## Build environment

`go env GOFLAGS` is set to an invalid value (`somehing`) and the private Go
proxy returns 401 for public modules, so builds need:

```
GOFLAGS= GOPROXY='https://proxy.golang.org,direct' go build ./...
```

`alis authorise <org>.<product>` refreshes package registry credentials when
they expire.
