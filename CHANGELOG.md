# Changelog

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
