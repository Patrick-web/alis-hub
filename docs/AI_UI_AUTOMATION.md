# Driving the app from an AI agent

This document is written for an LLM agent working in this repo. It describes how to run
AlisHub so you can click through it, read what it renders, call its Go services, watch its
events, and verify a feature you just implemented, without a human relaying screenshots.

Read the whole page once before you start. The setup takes one command.

This page covers the browser. Its companion,
[AGENT_TESTING.md](./AGENT_TESTING.md), covers the shell: build traps, the three
test tiers, the sandbox product, and the definition of done for a change. Read
its "three traps" section before your first build, because a stale `GOFLAGS` and
a private `GOPROXY` make every Go command fail in a way that looks like a code
problem. The normal order is: implement, run the Go tiers, then verify the
screen here.

## What the setup is

AlisHub is a Wails v3 desktop app: a Go backend and a React frontend inside a native
WebView. You cannot attach Chrome DevTools to that WebView, because on macOS it is a
WKWebView and speaks the WebKit inspector protocol, not CDP.

The dev bridge solves this. Wails' JS runtime talks to Go over plain HTTP POSTs to
`/wails/runtime`, and the app's asset middleware wraps that whole handler chain. In dev
builds the bridge re-serves the same chain on a TCP port, so an ordinary Chrome tab
becomes a second, fully functional client of the **same running app process**.

```
                         ┌──────────────────────────────┐
   native window ───────▶│                              │
   (WKWebView)   ◀───────│   one running app process    │
                         │   services, SQLite, CLI      │
   Chrome tab   ────────▶│                              │
   (you)        ◀────────│   http://127.0.0.1:34115     │
                         └──────────────────────────────┘
```

What that gives you in the browser:

- Every bound Go service call, hitting the real backend, the real `hub.db`, the real
  `alis` / `git` / `gcloud` binaries.
- Every Go to JS event, relayed over Server-Sent Events (`/wails/events`).
- The real frontend bundle, the real router, the real stores.

Both clients are live at once. An event emitted by Go reaches the native window and your
tab. State written by one is visible to the other, because there is only one backend.

Source: `devbridge.go` (dev builds only), `devbridge_prod.go` (compiled-out stub),
one `Middleware` and one `Transport` line in `main.go`.

## Start the app

```bash
wails3 task dev:bridge          # builds a dev binary, runs it, bridge on :34115
```

Add `ALIS_HUB_DEV_BRIDGE_VERBOSE=1` to log event fan-out (`event "x" -> 2 window(s),
1 browser client(s)`), which is the fastest way to tell whether a missing UI update is a
Go problem or a frontend problem.

Run it in the background and check the log line `[devbridge] app reachable at
http://127.0.0.1:34115` before continuing. The app opens a native window as usual; leave
it running, you are not competing with it.

Manual equivalents, if you need them:

```bash
ALIS_HUB_DEV_BRIDGE=1 wails3 task run          # same thing, no rebuild
ALIS_HUB_DEV_BRIDGE=1 wails3 dev               # with Vite HMR for frontend work
ALIS_HUB_DEV_BRIDGE_ADDR=127.0.0.1:34999 ...   # different port
```

The bridge is off unless `ALIS_HUB_DEV_BRIDGE` is set, and does not exist at all in
production builds (`-tags production`).

## Connect Chrome

The chrome-devtools MCP server drives Chrome over CDP. This machine runs it with
`--autoConnect --channel=beta` for this project, configured outside the repo (see "Where the
configuration lives"). The alternatives below exist for when that is not what you want, and
the choice is really about *whose* browser gets automated.

**`--autoConnect --channel=beta`** (configured) attaches to your own running Chrome Beta. It reads
`DevToolsActivePort` from that channel's default profile directory, which only exists once
remote debugging has been switched on inside that browser at
`chrome://inspect/#remote-debugging` (Chrome 144+). Enable it once and it persists for the
life of that Chrome process; restarting Chrome without re-enabling it removes the file and
the server reports "Could not find DevToolsActivePort". The automated tabs are real tabs in
your real session, so your logins are available and your windows are visible.

Check that mode yourself with the file and the port, not with curl:

```bash
cat "$HOME/Library/Application Support/Google/Chrome Beta/DevToolsActivePort"   # port, then ws path
lsof -nP -iTCP:9222 -sTCP:LISTEN                                                 # who holds it
```

A browser toggled on this way serves **only** the WebSocket endpoint named on the file's
second line. The discovery API is gone: `/json/version`, `/json/list` and `/` all return
404 (verified on Chrome Beta 152). That is normal for this mode, not a fault, and it is the
reason `--browserUrl` cannot be pointed at it.

**No connection flag** (`--channel=beta` alone) makes the server launch and own a browser
against a managed profile under `~/.cache/chrome-devtools-mcp/`. Nothing to enable, nothing
to start by hand, and it cannot disturb your session or compete for port 9222 — but it has
none of your logged-in state.

**`--browserUrl=http://127.0.0.1:9222`** attaches to a Chrome you started yourself with
explicit flags. It resolves the target over the `/json/version` HTTP API, which only a
`--remote-debugging-port` launch serves, so it is not interchangeable with the toggle above
even when both would be "Chrome Beta on 9222". See below.

> **If tool calls fail while the flags look right**, suspect the server process rather than
> the configuration. A chrome-devtools MCP server that failed to reach a browser once will
> keep reporting the same error for the rest of the session even after the browser becomes
> reachable. Restart the session, or test the flags against a fresh server process, before
> concluding the configuration is wrong.
>
> The signature is unmistakable once you know it: `DevToolsActivePort` is present, `lsof`
> shows Chrome Beta holding 9222, and every tool call still answers "Could not find
> DevToolsActivePort". Observed exactly that on 2026-08-12. Nothing about the browser needs
> fixing in that state.

### Where the configuration lives

The server is registered per project in `~/.claude.json`, under this repo's path, as
`chrome-devtools`:

```json
{ "type": "stdio",
  "command": "npx",
  "args": ["chrome-devtools-mcp@latest", "--autoConnect", "--channel=beta"] }
```

That is machine-local state, not repo state. It is not `.mcp.json`, nothing in the repo
declares it, and a fresh clone therefore has no browser tooling at all until someone adds
it:

```bash
claude mcp list      # the authority on what is actually loaded
claude mcp add chrome-devtools -- npx chrome-devtools-mcp@latest --autoConnect --channel=beta
```

Two things on this machine are easy to mistake for that entry. `~/.config/opencode/opencode.json`
carries the same server with the same flags for opencode, so both tools drive the same
Chrome Beta and the same enable-once toggle serves both. `~/.claude/mcp.json` defines a
server named `chrome` pointing at `--browserUrl http://127.0.0.1:9222`; Claude Code does not
load it, and `claude mcp list` not showing it is the proof. If you change a flag, change it
in `~/.claude.json` and confirm with `claude mcp list`.

### Two Chrome channels are installed

This is the detail that wastes the most time, because both channels are called Chrome and
only one of them is wired up.

| | Stable | Beta |
| --- | --- | --- |
| App | `/Applications/Google Chrome.app` | `/Applications/Google Chrome Beta.app` |
| Version here | 151.0.7922.109 | 152.0.7977.30 |
| Profile | `~/Library/Application Support/Google/Chrome` | `~/Library/Application Support/Google/Chrome Beta` |
| Automated | no | yes, via `--channel=beta` |

They are separate installs with separate profiles, separate logins, separate windows and
separate `DevToolsActivePort` files. Nothing carries across. So:

- Toggling `chrome://inspect/#remote-debugging` in stable Chrome does nothing for the MCP
  server. It reads the Beta profile, and only the Beta profile. Check the title bar or
  `chrome://version` if you are unsure which one you are looking at, since the two windows
  are hard to tell apart.
- The tabs an agent opens appear in a Chrome Beta window. If you are watching stable, you
  will see nothing happen and wrongly conclude the automation is broken.
- Your stable session is untouched by any of this, which is the reason to keep the beta
  channel for automation rather than pointing the tooling at your everyday browser.
- Only one channel can hold `127.0.0.1:9222`. If both have remote debugging on, the loser
  binds `[::1]:9222` and you can end up driving the browser you did not mean to. See the
  `lsof` note below.

To automate stable instead, change the flag to `--channel=stable` and enable remote
debugging in that browser. There is nothing special about beta here beyond it being the
channel this machine has wired up.

### Driving a Chrome you launched yourself

Only needed when the page must run in a session you control explicitly. Start Chrome with
its own profile:

```bash
open -na "Google Chrome Beta" --args \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/alishub-cdp-profile \
  http://127.0.0.1:34115/
```

`open -na` hands off to an already-running instance of that channel instead of starting a
new one, so if Chrome Beta is open the flags are silently dropped. Launch the binary
directly to get a genuinely separate instance:

```bash
"/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta" \
  --remote-debugging-port=9222 --user-data-dir=/tmp/alishub-cdp-profile
```

Then point the MCP server at it with `--browserUrl=http://127.0.0.1:9222` and verify CDP is
live first:

```bash
curl -s http://127.0.0.1:9222/json/version
```

This is the one mode where that curl means anything. A JSON body proves the flag launch
took; a 404 means you are talking to a toggle-enabled browser instead, and `--browserUrl`
will not attach to it.

If another Chrome already holds 9222 on IPv4, the second instance binds `[::1]:9222`
instead and `127.0.0.1` reaches the wrong browser — check `lsof -nP -iTCP:9222 -sTCP:LISTEN`
and use `http://[::1]:9222` when that happens.

Playwright works equally well against the same URL if you prefer scripted tests:
`chromium.connectOverCDP('http://127.0.0.1:9222')`.

## The agent loop

1. Implement the change (Go service, frontend component, or both).
2. Regenerate bindings if you touched a Go service signature:
   `wails3 task common:generate:bindings`.
3. Restart the app: kill the process, `wails3 task dev:bridge` again. Under `wails3 dev`
   frontend edits hot-reload and Go edits trigger a rebuild, so a browser reload is often
   enough.
4. Reload the tab, drive the UI, assert.
5. Report what you actually observed: the snapshot text, the event, the value the service
   returned.

Before you call it done, run the checklist in
[AGENT_TESTING.md §8](./AGENT_TESTING.md#8-definition-of-done-for-a-change). Its §5 lists,
page by page, what a pass looks like on each screen, which is the shortest way to know what
to click and what to expect once you get there.

## Recipes

### Look at the page

Prefer `take_snapshot` over screenshots. It returns the accessibility tree with a `uid`
for every element, which is what `click`, `fill` and `hover` take.

```
take_snapshot
→ uid=1_15 button "Landing Zones Select an organisation and product to work in"

click uid=1_15
take_snapshot
→ uid=3_4 button "R Rezco Asset Management rezco"
```

Take a screenshot only when the thing you are verifying is visual: layout, spacing,
colour, a chart. Text and structure are cheaper and more reliable in a snapshot.

Always check `list_console_messages` after an interaction. A React error or a rejected
service call shows up there first.

### Call a Go service directly

The page exposes `window.devBridge`. Method IDs are the numbers in the generated bindings
under `frontend/bindings/`, for example `frontend/bindings/alis-hub-v3/greetservice.ts`:

```ts
export function Greet(name: string): $CancellablePromise<string> {
    return $Call.ByID(1411160069, name);
}
```

```js
// evaluate_script
async () => await window.devBridge.call(1411160069, 'agent')
// → "Hello agent, It's show time!"
```

Use this to arrange state before a UI assertion (seed a setting, select a product), to
read backend state after one, and to test a new service method before any UI exists for
it. The call runs against the real backend, so treat it exactly as seriously as clicking
the button would.

From a shell, the same call is a plain HTTP request:

```bash
curl -s -X POST http://127.0.0.1:34115/wails/runtime \
  -H 'Content-Type: application/json' \
  -d '{"object":0,"method":0,"args":{"call-id":"probe-1","methodID":1411160069,"args":["agent"]}}'
```

### Assert on events

Everything Go pushes to the frontend is recorded in the tab.

```js
// evaluate_script
async () => {
  window.devBridge.clear();
  await window.devBridge.call(/* methodID that triggers work */);
  const done = await window.devBridge.waitFor('build:finished', 30000);
  return { done, all: window.devBridge.events().map(e => e.name) };
}
```

- `devBridge.events(name?)` returns recorded events, newest last.
- `devBridge.waitFor(name, timeoutMs)` resolves with the next matching event only,
  ignoring anything recorded earlier.
- `devBridge.clear()` resets the buffer, do this before the action you are measuring.
- `devBridge.connected` tells you the SSE stream is up.

This is how you verify long-running flows (builds, deploys, git operations, package
installs) instead of polling the DOM.

### Simulate native menu actions

Menu items, the tray and deep links emit events from Go. You cannot click a native menu
from the browser, but you can emit the same event, which reaches every client exactly as
the menu would:

```js
await window.devBridge.emit('menu:navigate', '/builds');       // Go menu → route change
await window.devBridge.emit('menu:command-palette');           // Cmd+K
await window.devBridge.emit('deep-link', 'alishub://auth/callback');
```

The emitters are in `main.go` (`menu:*`, `deep-link`) and in the services
(`git:log`, `sync:log`, `update:progress`, `localai:*`). Grep for `Event.Emit` to find the
exact name and payload before you fake one.

### Watch the network

`list_network_requests` shows every `/wails/runtime` POST, so you can see which service
methods a screen actually calls and what came back. This is usually faster than reading
the frontend store code when a screen renders empty.

## What is not available in the browser

The bridge gives you the frontend and the backend. It does not give you the native shell.

| Thing | Behaviour in the tab |
| --- | --- |
| Window controls, frameless drag, maximise | Buttons render, native calls are inert |
| Native dialogs, file pickers | Do not open, calls may error |
| System tray, app menu, accelerators | Not present, emit the event instead |
| OS notifications | Delivered by the app process, not the tab |
| Screen and clipboard runtime APIs | Unreliable, avoid asserting on them |

Most of the app's own modals are React components and work fine in the tab,
`ApprovalGate.tsx` included. `WorkflowsPage.tsx` is the exception: it calls the Wails
`Dialogs` runtime directly, so that flow needs the native window.

If the feature you are testing *is* one of those, that part needs a human at the native
window. Say so plainly rather than reporting a pass from the browser.

## Rules for acting inside the app

The backend is real. Assume everything you click has real consequences.

- Do not run deploys, releases, or destructive git operations to "see if the button
  works". Verify the call is wired by other means (network panel, a dry-run method, a unit
  test) and say what you did not run.
- Prefer reading state to mutating it. When you must mutate, use scratch or test resources
  and clean up.
- When you must work against a real product, use the sandbox `voyage.zz`, never the live
  `voyage.vp`. [AGENT_TESTING.md §4](./AGENT_TESTING.md#4-the-sandbox-and-what-it-cannot-do)
  has its services, environment, and the things it cannot complete.
- `hub.db` holds the user's real settings and workflow history. Changing settings through
  the UI changes them for the user.
- Only one app instance runs at a time (single-instance lock). Kill the old process before
  starting a new one, and do not leave several bridge builds fighting for `:34115`.

## Troubleshooting

**The build fails before the app ever starts** Almost certainly the `GOFLAGS` and `GOPROXY`
trap, not your code. See
[AGENT_TESTING.md §0](./AGENT_TESTING.md#0-read-this-first--three-traps).

**A page renders but its data is empty or errors** Check whether the failure is in the app
or in the CLI underneath it. `tail -f ~/Library/Logs/AlisHub/alishub.log` shows every
CLI-backed call with a bracketed prefix; AGENT_TESTING.md §3 lists the prefixes and the
startup lines that tell you the CLI backend is actually active.

**`connection refused` on :34115** The app is not running, or was built without
`ALIS_HUB_DEV_BRIDGE=1`, or was built with `-tags production`. Check the log for
`[devbridge] app reachable`.

**`notifications require a valid bundle identifier` and the process exits** You ran the
bare binary. It must run from inside the `.app` bundle, which is what `wails3 task run`
and `dev:bridge` do.

**MCP says it cannot find `DevToolsActivePort`** Three different causes, in the order they
are worth checking. The file really is absent, because remote debugging was never toggled on
in Chrome Beta or that Chrome has restarted since: re-enable it at
`chrome://inspect/#remote-debugging`. Or the file exists and 9222 is held, in which case the
MCP server process is stale and only a fresh session fixes it. Or you toggled the wrong
channel, since `--channel=beta` reads Chrome Beta's profile and ignores stable. Full detail
in "Connect Chrome".

**`window.devBridge is undefined`** The tab was opened against Vite (`:9245`) rather than
the bridge port, or the page was loaded before the app finished starting. The script is
injected into HTML served on `:34115` only.

**Events arrive in the tab but the UI does not update** The event reached the frontend, so
the bug is in the frontend listener. Confirm with
`window.devBridge.events('<name>')`, then look at the `Events.On` handler.

**Nothing arrives at all** Run with `ALIS_HUB_DEV_BRIDGE_VERBOSE=1`. If the log shows
`-> 2 window(s), 0 browser client(s)`, the SSE stream is not connected: reload the tab.
If the emitting code never logs, the Go side never emitted.

**A service method is missing from `window.devBridge.call`** There is no method list, only
IDs. Grep `frontend/bindings/` for the function name to get its `$Call.ByID` number, and
regenerate bindings if you just added the method.

## Worked example

Task: "the Landing Zones list should show the organisation ID under the name".

```
1. wails3 task dev:bridge                        # app + bridge running
2. open Chrome with a dedicated profile on :9222, load http://127.0.0.1:34115/
3. take_snapshot                                 # baseline
   click the "Landing Zones" uid
   take_snapshot                                 # note current row text
4. edit the component, restart, reload the tab
5. take_snapshot
   → uid=3_4 button "R Rezco Asset Management rezco"   # ID now rendered
6. list_console_messages                         # no new errors
7. report: what the row said before, what it says now, that the list came from
   ProductService and not a fixture
```

The verification that counts is the snapshot line showing the new text in a page that
loaded real data. "It builds" is not verification, and neither is "the code looks right".
