# Changelog

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
