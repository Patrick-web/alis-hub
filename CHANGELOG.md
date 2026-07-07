# Changelog

## [v0.12.0] - 2026-07-07

### What's New
- After pushing to the Define repo, you'll now get a suggestion to run Define for any service whose protos changed
- Workflow inputs are now simplified to two fixed argument types — Environment and Neuron — with real select pickers instead of free-text boxes, and Deploy steps can bind their Neuron/Environments fields to those inputs
- Added a live streaming toggle to the Logs tool
- The workflow you had selected is now remembered when you navigate away from and back to the Workflows page

### Bug Fixes
- Fixed an issue where concurrent auth token refreshes (e.g. a git push landing near the periodic session check) could race and cause a spurious "session expired" prompt
- Fixed an issue where exporting a workflow silently did nothing — it now uses a native save dialog
- Fixed an issue where some buttons' icons were misaligned due to being placed in the label area instead of the icon slot
- Fixed gcloud auto-install on Windows to use a silent installer instead of a command that only works on Unix shells

## [v0.11.0] - 2026-07-07

### What's New
- Introduced Workflows: build multi-step automations (define, build, upgrade packages, git actions, deploy) with a visual step editor, live run logs, and named input arguments you fill in at run time
- Workflow runs now continue in the background — navigate away and come back, and a status strip chip shows live progress with a log preview
- You can now start a workflow run from any step, skipping the ones before it
- Deploy steps can specify a build version (or default to the latest) and no longer require a Cloud Build step to run first
- Added copy-to-clipboard buttons to workflow, build, and deploy logs
- Workflow titles and descriptions can now be edited inline
- Interactive shell steps (like package upgrades) can now receive input while running, so prompts don't hang the workflow
- Workflows are now gated behind Labs, with built-in default templates removed in favor of your own
- Added a Local AI test tab, with a status strip indicator while it's generating
- Build, Deploy, and Define actions in the Develop tab now show toast and native OS notifications
- Added a developer settings modal with a title-bar override option
- Git: periodic background fetch, batched folder staging, a local-only graph toggle, and the ability to undo a commit
- Status strip chips now close along with their tab and show details on hover
- Codeblocks: added an "Update" flow for publishing new versions without needing a running instance
- Window chrome now feels more native, with thinner scrollbars, fixed title-bar dragging, and double-click to maximize

### Bug Fixes
- Fixed an issue where git auth configuration could go stale immediately after logging in
- Fixed an issue where workflow runs didn't surface real git errors or per-step logs
- Fixed an issue where shell-based workflow steps didn't load your shell's PATH setup
- Fixed an issue where all workflow steps expanded at once instead of just the active one
- Fixed an issue where the Define step's log stream could appear to stall
- Fixed an issue where package upgrade steps ran as raw shell commands instead of using the proper package service
- Fixed an issue where the Define step used a shell command instead of the dedicated Define service
- Fixed an issue where codeblock access roles didn't match production role behavior
- Fixed an issue where fetching block roles used a broken API call

## [v0.10.0] - 2026-07-02

### What's New
- Source Control has been redesigned with GitHub-style tabs separating Code and Pull Requests for a cleaner workflow
- You can now set per-tool default project context in a new Tools tab in Settings — no more re-selecting context every time
- Branch switching now uses a searchable modal instead of a dropdown, making it easier to find branches in large repos
- You'll now see a warning before checking out when you have uncommitted changes
- PR creation now validates required fields and warns you if you're about to create an empty commit

### Bug Fixes
- Fixed an issue where the "Download Update" button in Settings now correctly opens the same update overlay as the rest of the app
- Fixed an issue where Smart Sort commit lookups failed due to a mismatch with the versioned neuron directory layout
- Fixed an issue where build and define errors only appeared in the status strip instead of the main pane
- Fixed an issue where tool defaults weren't being read reliably from storage
- Fixed an issue where checkout conflicts weren't being classified correctly; git pull now uses merge strategy
- Fixed the Source Control tab icon in the top navigation bar

## [v0.9.3] - 2026-06-29

### Bug Fixes
- Fixed an issue where the wrong window controls (macOS-style dots) were shown on the hub screen on Windows
- Fixed window dragging not working on Windows

## [v0.9.2] - 2026-06-29

### What's New
- The notifications and suggestions panels can now be detached and float as translucent, rounded windows
- Windows users now get a proper installer that integrates with the system (Start Menu, desktop shortcut, Add/Remove Programs) instead of a plain zip

## [v0.9.1] - 2026-06-29

### What's New
- Windows now shows custom minimize, maximize, and close buttons in the title bar, styled to match Windows 11 conventions

### Bug Fixes
- Fixed an issue where the user profile avatar and name wouldn't always load correctly across app screens

## [v0.9.0] - 2026-06-29

### What's New
- You can now refresh the commits list in the Develop panel with a single click
- Spanner Explorer now supports read-write transaction mode (available in Labs), with improved streaming query reliability
- Develop settings are now stored per-product, with smart sorting and folder ignore controls
- Git operation errors now surface as clear, actionable messages in the UI rather than failing silently
- Commit timestamps in the commit list and git graph now show both date and time
- Source control has been redesigned with a VSCode-style layout

### Bug Fixes
- Fixed duplicate branch labels appearing in the git graph, and added push status indicators
- Fixed flickering console windows when running git operations on Windows
- Fixed deployment environment variables not loading correctly
- Fixed git clone failures now showing a clear error message; git credentials are also configured automatically on first launch
- Fixed git sync logs from one repository appearing in another
- Fixed an issue where multiple comma-separated service names weren't being handled correctly in the Packages pane
- Fixed Spanner partitioned DML operations to use the correct transaction type

## [v0.8.0] - 2026-06-26

### What's New
- Local AI is now available: run Gemma on-device via Ollama to generate commit messages and smart suggestions without sending data to the cloud
- Spanner Backups are now viewable in GCloud Tools
- Dropdowns throughout the app now use a searchable select component with filtering support

### Bug Fixes
- Fixed an issue where the app icon appeared too large in the macOS Dock
- Fixed Ollama download and setup not completing correctly
- Fixed Ollama model detection and updated to use Gemma 4 models
- Fixed git pull/push operations failing due to missing authentication token and terminal prompt interference
- Fixed deployments failing when the version string format didn't match what the VSCode extension expected
- Fixed development tab state being lost on navigation; added a route error boundary to prevent full-app crashes
- Fixed an issue where the user profile wasn't pre-loaded, and replaced window traffic lights with a close button

## [v0.7.1] - 2026-06-24

### Bug Fixes
- Fixed an issue where the app would restart automatically after downloading an update without asking — you now choose when to install

## [v0.7.0] - 2026-06-24

### What's New
- You can now switch between Build mode and Deploy mode directly in the Build pane
- Pull requests from Forgejo repos now open in a dedicated full-screen PR experience
- File type icons (VSCode-style) now appear in the source control file list

### Bug Fixes
- Fixed an issue where the env switcher's `.env` output didn't match the VSCode extension format
- Fixed an issue where git operations could hang due to credential prompts on non-interactive terminals
- Fixed terminal rendering on Windows by switching to ConPTY
- Fixed CodeMirror theme not applying correctly when switching themes
- Fixed several Windows compatibility issues: git credential helper, file manager integration, and path handling
- Fixed the app icon not appearing on Windows executables
- Fixed opening URLs on Windows
- Fixed git fetch authentication for HTTPS remotes in PR diff views
- Fixed PR diff viewer failing in shallow clones

## [v0.6.1] - 2026-06-24

### Bug Fixes
- Fixed an issue where deploy logs never appeared in the terminal during a deployment
- Fixed an issue where deploying to more than one environment at a time would always fail with a timeout error

## [v0.6.0] - 2026-06-23

### What's New
- Deploying to multiple environments now opens a separate terminal for each, so you can watch each deployment's logs independently with its own status indicator
- The Git panel now highlights commits that haven't been pushed yet and adds sync buttons to push or pull directly from the graph
- Git state now refreshes automatically when you focus the app window or when files change on disk — no more manual refreshes
- Source control view preferences are now persisted across sessions, and there's a new Settings tab in the source control panel
- A new command palette (Cmd+K) lets you quickly jump to actions across the app
- Smart suggestions now prompt you to commit after installing packages or to upgrade packages after a pull
- A dismissable toast now appears when the app loses internet connectivity
- A loading indicator and toast now appear when switching environments

### Bug Fixes
- Fixed an issue where the command palette shortcut (Cmd+K) wasn't working after navigating away
- Fixed the command palette to open reliably via the native macOS menu accelerator
- Fixed update checks incorrectly running in dev builds

## [v0.5.1] - 2026-06-22

### Bug Fixes
- Fixed an issue where an expired session in the workspace showed a raw error instead of redirecting to the login screen.
- Fixed an issue where alis-hub was overwriting the VS Code extension's git credential configuration, breaking git auth for the alis extension.
- Fixed an issue where the right panel in the Develop page did not stretch to full height.
- Improved the update flow: downloads now start automatically when an update is detected, with better progress states and install error recovery.

## [v0.5.0] - 2026-06-22

### What's New
- The Develop page now supports multiple concurrent tasks in a tab-based panel — open Build, Deploy, Define, and Packages for different services side-by-side without losing state
- Each task tab persists when you navigate away from the Develop page and back
- The right pane is now resizable — drag the left edge to make it wider or narrower
- A re-login modal now appears automatically when your session expires, so you don't lose your place
- The app now manages Git credentials for the VS Code extension, removing the need to authenticate separately in the editor
- Git SCM now has stage and discard buttons at the folder level, making it faster to manage changes across multiple files

### Bug Fixes
- Fixed an issue where clicking "Open in Develop" or "Deploy" in a notification did nothing if you had navigated away from the Develop page
- Fixed an issue where deploy pane errors were not shown and auth failures left the pane in a broken state
- Fixed an issue where authentication to auth.alis.build failed due to a gRPC transport mismatch
- Clicking a task notification or status strip chip now correctly focuses the corresponding tab in the Develop panel

## [v0.4.0] - 2026-06-21

### What's New
- The settings modal has been redesigned with a macOS Sonoma-style look, including an accent color picker to personalize the app's highlight color
- The notification center now groups notifications by source, matching the familiar macOS layout
- The app now supports full light and dark mode with a new semantic color system — you can switch themes from the settings modal
- Smart Suggestions is now available as a Labs feature, offering AI-powered next-step hints after builds and other actions
- Update notifications now appear as a macOS-style notification card instead of a toast popup

### Bug Fixes
- Fixed an issue where the terminal and SQL editor didn't respect the selected light/dark theme
- Fixed an issue where light mode showed white text on white backgrounds in some areas
- Fixed an issue where an expired session didn't redirect you back to the login page
- Fixed an issue where navigating back could fail due to a stale reference
- Fixed an issue where terminal output lines weren't starting at the correct column
- Fixed an issue where the notification center appeared as a full page instead of an overlay in the workspace

## [v0.3.1] - 2026-06-20

### Bug Fixes
- Fixed an issue where release note images were not displaying in the update modal

## [v0.3.0] - 2026-06-20

### What's New
- Updated app icon and website favicon to the new logo
- Added a SQL canvas with syntax highlighting, multi-tab support, resizing, and tab renaming
- You can now toggle between unified and split diff views, and switch between list and tree view in Source Control
- Source Control is now product-aware and supports expanding commit files
- You can now bootstrap a codeblock directly from a local neuron file using a file picker
- Proto files are now included when bootstrapping, with a visual "generating" state shown on the doc tab

### Bug Fixes
- Fixed an issue where diffs weren't rendering correctly due to missing raw diff content
- Fixed an issue where diff hunks weren't parsing correctly

## [v0.2.5] - 2026-06-19

### Bug Fixes
- Fixed an issue where installing a codeblock would fail to merge the define repository alongside the build repository.
- Fixed an issue where manifest scanning would incorrectly traverse node_modules and other package cache directories.

## [v0.2.4] - 2026-06-18

### What's New
- Notifications now appear on the main page for better visibility, with an error boundary to prevent crashes if something goes wrong

## [v0.2.3] - 2026-06-18

### What's New
- Added an in-app notification center — build, deploy, update, and system alerts now appear in a bell icon in the top nav with unread counts and a persistent history panel
- Added toast notifications for real-time feedback on actions
- Native macOS notifications now use the UserNotifications framework for reliable delivery (requires allowing notifications in System Settings when first enabled)

### Bug Fixes
- Package scripts now correctly mark as complete when the command finishes, rather than when the terminal shell exits

## [v0.2.2] - 2026-06-18

### What's New
- A Changelog tab is now available in Profile & Settings, showing what changed in the current version.
- The Builds page now shows the version state for each service.
- The app website has been updated with new branding — alis red theme, updated favicon, and the dot logo.

### Bug Fixes
- Fixed the auto-updater failing to download updates from private repositories.
- Fixed an issue where local builds weren't being registered with the backend correctly.
- Fixed an artifact appearing in the favicon icon.

---

## [v0.2.1] - 2026-06-17

### Bug Fixes
- Fixed an issue where environment variable labels weren't displaying correctly on the Develop page.

---

## [v0.2.0] - 2026-06-17

### What's New
- You can now switch environments and the app will remember your choice across sessions.
- You can now select multiple packages at once on the Develop page to act on them in bulk.
- The environment picker now applies across all tabs, not just the current one.
- You can now filter services by name in the Builds sidebar and on the Develop page.
- The top-level hub now includes standalone sections for Build Kit, Learn, and Codeblocks — no product selection required.
- Codeblocks now support Mermaid diagrams in their documentation.
- Contributing to a codeblock now uses folder upload with a visual file tree.
- You can now publish new versions to codeblocks you contribute to.
- Codeblock version history now shows syntax-highlighted file previews.
- Installing a codeblock now walks you through an interactive merge step.
- You can now create and edit codeblocks you own.
- The About page has a new tile layout with cleaner product identity information.
- Product cards on the hub now expand in place with clone options and status.
- Deleting an environment variable now requires typing the label to confirm.
- Environment variables now show a "Shared" indicator and a Duplicate action.
- The GCloud tools suite replaces the old Developer Tools page with a richer set of tools including a Spanner explorer, bucket explorer, and Logs Explorer.

### Bug Fixes
- Fixed the title bar drag region being too large.
- Fixed an issue where the environment dropdown was clipped by the top navigation bar.
- Fixed an issue where switching products didn't reset workspace state correctly.
- Fixed git authentication for Forgejo and GitHub repositories.
- Fixed HTTP auth headers accumulating duplicate tokens on re-login.

---

## [v0.1.0] - 2026-06-08

Initial release of Alis Hub — a desktop app for managing your Alis platform products.

### What's New
- Log in with your Alis account and pick your organisation and product.
- Browse and manage your product's services from the Builds tab.
- Deploy services and monitor deployments from the Deployments tab.
- View and manage environment variables from the Environments tab.
- Access GCloud tools and repository browsing from the Tools tab.
- Auto-update support: the app checks for new versions on launch and downloads updates in the background.
