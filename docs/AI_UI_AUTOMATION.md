# Driving the app from an AI agent

This document is written for an LLM agent working in this repo. It describes how to run
AlisHub so you can click through it, read what it renders, call its Go services, watch its
events, and verify a feature you just implemented, without a human relaying screenshots.

Read the whole page once before you start. The setup takes one command.

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

The chrome-devtools MCP server drives Chrome over CDP. Chrome 136 and newer refuse remote
debugging on the default profile, so Chrome must be started with its own `--user-data-dir`:

```bash
open -na "Google Chrome Beta" --args \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/alishub-cdp-profile \
  http://127.0.0.1:34115/
```

Use whichever channel the MCP server is configured for (`--channel=beta` here); the flags
are the same for stable Chrome.

Then verify CDP is live before using any MCP tool:

```bash
curl -s http://127.0.0.1:9222/json/version
```

If the MCP server is configured with `--autoConnect`, it looks for `DevToolsActivePort`
inside the *default* profile directory and will not find this instance. The reliable
configuration is `--browserUrl=http://127.0.0.1:9222`, or no `--autoConnect` at all so the
MCP launches and owns its own Chrome.

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

If the feature you are testing *is* one of those, that part needs a human at the native
window. Say so plainly rather than reporting a pass from the browser.

## Rules for acting inside the app

The backend is real. Assume everything you click has real consequences.

- Do not run deploys, releases, or destructive git operations to "see if the button
  works". Verify the call is wired by other means (network panel, a dry-run method, a unit
  test) and say what you did not run.
- Prefer reading state to mutating it. When you must mutate, use scratch or test resources
  and clean up.
- `hub.db` holds the user's real settings and workflow history. Changing settings through
  the UI changes them for the user.
- Only one app instance runs at a time (single-instance lock). Kill the old process before
  starting a new one, and do not leave several bridge builds fighting for `:34115`.

## Troubleshooting

**`connection refused` on :34115** The app is not running, or was built without
`ALIS_HUB_DEV_BRIDGE=1`, or was built with `-tags production`. Check the log for
`[devbridge] app reachable`.

**`notifications require a valid bundle identifier` and the process exits** You ran the
bare binary. It must run from inside the `.app` bundle, which is what `wails3 task run`
and `dev:bridge` do.

**MCP says it cannot find `DevToolsActivePort`** See "Connect Chrome". Chrome must have a
non-default `--user-data-dir` for CDP to listen at all.

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
