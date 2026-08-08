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

Backed by 171 unit tests (no credentials or network), 16 live sandbox tests
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

UI at `/skills`, `/ask` and `/diagnostics`.

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
res, err := svc.UnsetEnvironmentVariablesCLI(org, product, env, names, false, false)
// err == nil, res.Gated == true, res.RetryCmd == "alis environment unset … --approve"
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

**Authentication.** The app keeps its own PKCE flow. `CheckAuth` deliberately
treats the Console token as authoritative rather than `alis whoami`: large parts
of the app still call the Console and gRPC APIs directly, so a working CLI
session says nothing about whether those calls will succeed. Treating it as
sufficient would let the UI past the login gate and then fail every
non-migrated request.

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

---

## Build environment

`go env GOFLAGS` is set to an invalid value (`somehing`) and the private Go
proxy returns 401 for public modules, so builds need:

```
GOFLAGS= GOPROXY='https://proxy.golang.org,direct' go build ./...
```

`alis authorise <org>.<product>` refreshes package registry credentials when
they expire.
