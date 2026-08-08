# Agent Testing Runbook — alis CLI migration

> Written for an LLM agent that has a shell on this machine and needs to build,
> run and verify alis-hub after the `alis` CLI became its execution engine.
>
> Read [ALIS_CLI_MIGRATION_ANALYSIS.md](./ALIS_CLI_MIGRATION_ANALYSIS.md) for
> *what* changed and *why*. This document is about *how to exercise it and tell
> pass from fail*.
>
> Every command below was run on this machine on 2026-08-08. Where something is
> broken or missing, that is stated rather than glossed over — the point of this
> file is that you do not lose an hour rediscovering it.

---

## 0. Read this first — three traps

These will each cost you time if you meet them cold.

**1. The build fails out of the box.** `go env GOFLAGS` is set to the invalid
value `somehing`, and the first entry in `GOPROXY` is a private Artifact
Registry that returns **401 for public modules** (a 401 is fatal in Go's proxy
chain — only 404/410 fall through). Every Go command in this file therefore
carries the same prefix:

```
GOFLAGS= GOPROXY='https://proxy.golang.org,direct'
```

Export it once for your session instead of repeating it:

```bash
export GOFLAGS=
export GOPROXY='https://proxy.golang.org,direct'
```

If you see `401 Unauthorized` from `us-east4-go.pkg.dev`, you forgot this.

**2. `task` is not installed.** The README and `Taskfile.yml` route everything
through `task`, which is absent here. Use the `wails3` and `go` commands in
§3 directly, or install it (`brew install go-task`).

**3. Server mode does not build.** `go build -tags server` fails inside Wails
v3.0.0-alpha.74 itself:

```
application/clipboard_darwin.go:54:6: newClipboardImpl redeclared in this block
application/dialogs_darwin.go:447:6: newDialogImpl redeclared in this block
```

That is an upstream bug — the darwin files are not excluded under the `server`
tag. **There is no headless HTTP mode available**, so a GUI-free agent cannot
drive the app end to end today. Plan around §5.

---

## 1. Prerequisites and how to check them

```bash
alis --version          # expect >= 1.64.4; verified against 1.69.7
alis whoami --json      # exit 0 means authenticated; exit 4 means run `alis login`
go version              # go1.26.4 darwin/arm64
node --version          # v22.15.0
wails3 version          # v3.0.0-alpha.74
```

**Package registry credentials expire.** When a Go build starts 401-ing against
`us-east4-go.pkg.dev` *even with the GOPROXY override*, refresh them:

```bash
alis authorise voyage.vp --json     # also fixes git auth for that product
```

**Do not run `alis login` yourself.** It opens a browser and needs a human. If
`alis whoami` exits 4, stop and report that the user must sign in.

---

## 2. Test tiers

Three tiers, in increasing cost and decreasing coverage.

### Tier 1 — hermetic (always run this)

No credentials, no network. ~5s. This is your regression gate.

```bash
go test ./... -count=1
```

Expect three `ok` lines (`alis-hub-v3`, `internal/alisclient`,
`internal/cliwrap`) and nothing else. **Any failure here is a real regression.**

Covers 168 tests: argument construction for every CLI command, response
decoding against 19 captured fixtures in `testdata/cli/`, enum mapping, the
approval-flag safety properties, and the `cliwrap` hardening cases.

### Tier 2 — live sandbox (run when touching CLI interaction)

Needs `alis` authenticated. ~30s. Hits the real platform, read-only.

```bash
go test -tags alis_integration . -run TestSandbox -count=1 -v
```

Expect 17 `PASS`. A `SKIP` means the CLI is missing or signed out — that is not
a pass, investigate it.

These assert the live JSON shapes still match `cliviews.go`. **When the CLI is
upgraded, this tier is what tells you whether anything drifted.**

### Tier 3 — everything, including mutating tests

```bash
go test -tags alis_integration ./... -count=1
```

⚠️ **This tier mutates real state.** It contains tests that open real pull
requests, push real commits, create real define/build versions, and publish a
real code block version. Two of them fail against the current backend for
unrelated reasons. Do not run it casually; prefer Tier 2 plus a named `-run`.

### Frontend

```bash
cd frontend
npx tsc --noEmit                    # expect: 0 errors
npx vite build                      # expect: "✓ built in ~6s"
npx eslint src                      # 8 errors, all pre-existing, all in pages/learn/diagrams/
```

The 8 eslint errors are `react/no-unknown-property` in three diagram files that
predate this work. **Treat 8 as the baseline; 9 means you introduced one.**

Warnings are ~334 and noisy. To check whether *you* added one, compare the same
file before and after:

```bash
count() { (cd frontend && npx eslint "$1" --format json 2>/dev/null \
  | python3 -c "import sys,json;print(len(json.load(sys.stdin)[0]['messages']))"); }
git stash -q; before=$(count src/app/pages/EnvironmentsPage.tsx)
git stash pop -q; after=$(count src/app/pages/EnvironmentsPage.tsx)
echo "before=$before after=$after"
```

Run `count` from the repo root — `cd frontend` inside the subshell fails
silently if you are already there, and you will get a meaningless `0`.

---

## 3. Building and running the app

```bash
export GOFLAGS= GOPROXY='https://proxy.golang.org,direct'

go build ./internal/... .                    # compile check, no artifact
go vet ./internal/... .                      # both tag sets:
go vet -tags alis_integration .              #   the integration tests must compile too

wails3 generate bindings -clean=true -ts     # after ANY exported Go signature change
```

**Regenerate bindings whenever you change an exported method on a Wails-bound
service.** Skipping it leaves `frontend/bindings/` stale and `tsc` will either
fail or, worse, typecheck against a signature that no longer exists.

To run the GUI (needs a display; opens a window):

```bash
wails3 dev -config ./build/config.yml -port 9245     # hot-reload dev mode
# or a production binary:
go build -o bin/alis-hub-v3 . && ./bin/alis-hub-v3
```

`go build ./build/ios` fails (`function main is undeclared`) — pre-existing
scaffolding, ignore it. Use `go build ./internal/... .` rather than `./...` to
avoid it.

### Where the running app keeps state

| What | Path (macOS) |
|---|---|
| Logs | `~/Library/Logs/AlisHub/alishub.log` (+ `.1`…`.5`) |
| SQLite settings/session DB | `~/Library/Application Support/AlisHub/hub.db` |
| alis CLI state | `~/.alis/` |
| Local repos the app operates on | `~/alis.build/<org>/{define,build}/…` |

**The log file is your main observability channel for a GUI run.** Every
CLI-backed path logs with a bracketed prefix:

```bash
tail -f ~/Library/Logs/AlisHub/alishub.log | grep -E '\[(dbd|build|deploy|define|orgs|services|auth|packages|cli-svc|main)\]'
```

Useful lines to look for on startup:

```
[main] alis CLI backend available — DBD operations will use alis commands
[main] alis 1.69.7 (verified minimum 1.64.4)
```

If you instead see `alis CLI not found … falling back to gRPC backend`, the
entire migration is inactive and every CLI-specific behaviour below will be
absent. Check `~/.alis/bin` is on `PATH`.

---

## 4. The sandbox, and what it cannot do

`voyage.zz` is the sandbox product. Use it for anything mutating; never
`voyage.vp`, which is live.

| | |
|---|---|
| Product | `voyage.zz` |
| Services | `demo-v1` (empty), `dummy-v1` (has protos + 2 installed blocks), `dummy-two-v1` |
| Fixture service | `voyage.zz.dummy.v1` |
| Environment | `1y2ozw2i3fsru` ("Development", **not** production) |

**Its build repo 404s**, both from `git ls-remote` and server-side. So:

```
alis define voyage.zz.dummy.v1 --json
→ "downloading proto files: api returned status: 404 Not Found"
```

**Define, build and deploy cannot complete in the sandbox.** Do not treat that
404 as a regression you introduced — it is the environment. Recreating the
`voyage/zz` build repo on Forgejo is what would unlock real DBD round trips.

The constants live in `sandbox_test.go`; read its header comment before adding
a live test.

---

## 5. What to verify, feature by feature

For each row: how to exercise it, what a pass looks like, and how it fails.
Items marked **GUI** cannot be verified from Go — they need a human or a
screen-driving agent.

### Approval gates (highest value — most likely to regress)

The single most important behaviour. Exit 3 is a *normal* outcome, not an error.

```bash
go test -tags alis_integration . -run TestSandbox_ApprovalGateIsReportedNotSwallowed -v
```

**Pass:** logs a line like
`gate=APPROVAL_REQUIRED retry="alis environment unset … --approve"`.

**Fail modes to watch for:**
- The call returns an `error` instead of a gate result → the UI will show a raw
  error with no way forward.
- `RetryCmd` is empty → the user has no path to approve.
- The code is `PRODUCTION_CONFIRMATION_REQUIRED` for a non-production
  environment → the two gates have been conflated.

Safety properties, hermetic:

```bash
go test . -run 'TestApproval' -v
```

`TestApprovalNeverImplicit` is the critical one: **no `--approve` or
`--confirm-production` may ever reach the CLI without an explicit human
decision.** If that test fails, stop and report it — it means the app can
silently self-approve a production change.

**GUI:** delete an environment variable in Environments. Expect an approval
dialog quoting the CLI's own message and showing a copyable equivalent command.
Cancel must leave the variable in place.

### Live operation progress

```bash
go test -tags alis_integration . -run TestSandbox_WaitOnFailedOperation -v
```

**Pass:** returns the *operation's* error, not a stream error, and logs
`received N progress event(s)`.

The trap this guards: `alis operations wait` exits 1 for a failed operation but
still prints a valid operation on stdout. Treating non-zero as a CLI failure
throws that away.

**GUI:** start a build; the status line should update between poll ticks.
Progress is additive — if it never appears, the build must still complete
normally via polling. A build that *stops* working because progress is missing
is a regression.

### Response shape drift (run after every CLI upgrade)

```bash
go test . -run 'TestFixture' -v                       # against captured fixtures
go test -tags alis_integration . -run TestSandbox -v  # against the live CLI
```

If a fixture test passes but its live counterpart fails, **the CLI changed its
output.** Re-capture (§6) and reconcile `cliviews.go`.

### Everything else

| Area | Command | Pass looks like |
|---|---|---|
| Blocks read path | `go test -tags alis_integration . -run TestSandbox_ListServiceBlocks -v` | `2 installed, 26 available`; every install has a parseable instance ref |
| Package-id derivation | `go test -tags alis_integration . -run TestSandbox_PackageID -v` | Go and the TS mirror agree, incl. `internal-api-v2` |
| Environments | `go test -tags alis_integration . -run 'TestSandbox_Environment' -v` | `canUpdate=true`, branches `unrestricted=true` |
| Skills | `go test -tags alis_integration . -run TestSandbox_Skills -v` | a searched id loads non-empty markdown |
| Doctor | `go test -tags alis_integration . -run TestSandbox_Doctor -v` | tier is one of manual/balanced/autonomous |
| No credential leaks | `go test -tags alis_integration . -run TestSandbox_GitRemotesExcludeTokens -v` | nothing JWT-shaped crosses the boundary |
| CLI version floor | `go test -tags alis_integration . -run TestSandbox_VersionMeetsMinimum -v` | installed ≥ 1.64.4 |

### GUI-only checks

None of these can be verified from Go. They are the gap.

| Page | Route | What to confirm |
|---|---|---|
| Skills | `/skills` | search returns rows; clicking loads markdown; Install marks the row; Uninstall clears it |
| Ask | `/ask` | an answer renders; a follow-up keeps context; SKILL citations navigate to `/skills` |
| Diagnostics | `/diagnostics` | CLI version, automation tier and its explanation, safe-mode orgs |
| Service blocks | `/services/dummy-v1/blocks` | installed rows show version→latest and the block branch; agent-only rows read "unavailable", not an Install button |
| Environments | `/environments` | branch bar reads "any branch"; New Variable disabled when read-only |
| Build pane | Develop | "Retag previous images" appears for cloud/deploy modes, hidden for local |
| Deploy pane | Develop | a production deploy opens the gate dialog instead of hanging on a phantom operation |

---

## 6. Refreshing fixtures after a CLI upgrade

Fixtures in `testdata/cli/` are real captured responses. To refresh one:

```bash
alis blocks list voyage.zz.dummy.v1 --json > testdata/cli/blocks_list.json
go test . -run TestFixture_BlocksList -v
```

**Redact before committing.** `whoami` and `accounts_list` contain personal
data and are already redacted — preserve that. **Never capture
`alis git configure` or `alis gcloud auth`: both return live credentials.**

Two fixtures are hand-written because they cannot be re-captured on demand:
`define_async_failed.json` and `error_approval_required.json`. They pin the
exact shapes behind two of the bugs this work fixed — do not regenerate them
casually.

---

## 7. Things that look like bugs and are not

Check this list before reporting a failure.

1. **`alis define voyage.zz.…` 404s.** The sandbox build repo does not exist.
2. **`go build ./...` fails on `build/ios`.** Pre-existing scaffolding with no
   `main`. Use `go build ./internal/... .`.
3. **8 eslint errors in `pages/learn/diagrams/`.** Pre-existing. Baseline is 8.
4. **`react-hooks/set-state-in-effect` warnings.** The codebase's load-on-mount
   idiom, present ~24 times before this work.
5. **`ld: warning: object file was built for newer macOS version`.** Toolchain
   noise, harmless. Filter with `| grep -v "^ld: warning"`.
6. **Deleting an environment variable now asks for approval.** Intentional. The
   old path rewrote the whole array and bypassed the platform's gate.
7. **`alis accounts list` returns `display_name` in snake_case.** Genuinely
   inconsistent with every other command; the decoder matches it deliberately.
8. **`skills installed` returns a bare JSON array**, not an object. Also
   deliberate.
9. **Two tests fail in Tier 3** (`TestGetWorkstationURI`, `TestContributeBlock`)
   against the current backend. Pre-existing, unrelated to this work.

---

## 8. Definition of done for a change

```bash
export GOFLAGS= GOPROXY='https://proxy.golang.org,direct'

gofmt -l $(git diff --name-only main...HEAD -- '*.go')   # expect: empty
go build ./internal/... .                                 # expect: clean
go vet ./internal/... . && go vet -tags alis_integration . # expect: clean
go test ./... -count=1                                    # expect: 3 × ok
go test -tags alis_integration . -run TestSandbox -count=1 # expect: ok, 17 pass

wails3 generate bindings -clean=true -ts                  # if a signature changed
cd frontend && npx tsc --noEmit && npx vite build         # expect: 0 errors, built
```

Plus: no new eslint errors (baseline 8), and no new warnings in files you
touched (compare with the `count` helper in §2).

---

## 9. What still cannot be checked automatically

Be honest about this in any report.

- **No page has been exercised in a running app.** Every UI change in this work
  was typechecked and built, never clicked. This is the largest untested
  surface.
- **No headless mode** (§0, trap 3), so a shell-only agent cannot drive the UI.
  Options: fix the Wails server-tag build upstream, add a thin debug HTTP
  surface behind a build tag, or drive the GUI with a screen-control tool.
- **DBD round trips are untested end to end** — the sandbox cannot complete a
  define, build or deploy.
- **36 of 56 new Go methods have no UI call site.** They are covered by Go
  tests but have never run through a real user action.
- **Mutating CLI paths are the least proven code here**: `support
  send-message`/`send-session`, `accounts select`, and `UpgradeCLI` have no
  test at all, because each is irreversible or changes billing.
