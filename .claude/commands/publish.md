# Publish a new version of alis-hub

Release flow: commit any pending changes → pick next version → tag → push (triggers CI).

## Steps

**1. Check current state**

```bash
git status
git tag --sort=-version:refname | head -5
```

Show the user the latest tag and any uncommitted changes.

**2. Determine next version**

Ask the user: patch, minor, or major bump from the current latest tag?
- Patch (default): bug fixes, small tweaks → e.g. v0.2.1 → v0.2.2
- Minor: new features → e.g. v0.2.1 → v0.3.0
- Major: breaking changes → e.g. v0.2.1 → v1.0.0

**2b. Generate changelog entry**

Run:

```bash
git log v<last_tag>..HEAD --oneline
```

From those commits, write a plain-English entry for `CHANGELOG.md` in this format and prepend it below the `# Changelog` heading:

```markdown
## [v<version>] - <YYYY-MM-DD>

### What's New
- <user-facing sentence for each feat: commit>

### Bug Fixes
- <user-facing sentence for each fix: commit>
```

Rules:
- Omit `docs:`, `chore:`, `refactor:`, `style:` commits — users don't care
- Rephrase commit messages as plain-English sentences (e.g. "feat: add service filter input" → "You can now filter services by name in the Builds sidebar")
- Use "Fixed an issue where…" for bug fixes
- No code, no file paths, no technical internals
- Omit the section heading entirely if there are no entries for it (e.g. no bug fixes → no "### Bug Fixes" heading)

Show the generated entry to the user and wait for their approval before continuing. If they want changes, apply them to `CHANGELOG.md` before proceeding.

**3. Commit any uncommitted source changes**

If `git status` shows modified tracked files, stage and commit them:

```bash
git add <relevant files>
git commit -m "chore: prep for <version>"
```

Do NOT commit:
- `alis-hub-v3` (root binary — in .gitignore)
- `.claude/` directory
- Any `.env` files

**3b. Release image**

Check if the user has a release image for this version (e.g. `re/<feature-name>.png`). If they do:

1. Copy it into `website/release-images/` (NOT `release-images/` — the repo is private so `raw.githubusercontent.com` URLs are inaccessible without auth):
   ```bash
   cp re/<feature-name>.png website/release-images/<feature-name>.png
   git add website/release-images/<feature-name>.png
   git commit -m "chore: add v<version> release image to website static assets"
   git push origin main
   ```

2. Deploy the Cloudflare Worker so the image is publicly available:
   ```bash
   cd website && npx wrangler deploy
   ```
   The image will be live at: `https://alishub.justpatrick.workers.dev/release-images/<feature-name>.png`

3. After CI publishes the GitHub Release, edit the release body to prepend this line (before the changelog content):
   ```
   ![v<version> Release](https://alishub.justpatrick.workers.dev/release-images/<feature-name>.png)
   ```
   Use: `gh release edit v<version> --repo Patrick-web/alis-hub --notes "..."`

   The Cloudflare Worker serves `release.body` to the in-app update notification. The in-app updater's `inlineImages` function fetches the URL and converts it to base64 for the WebView — this only works with a public URL, which is why the Worker is used instead of raw GitHub URLs.

If there is no image yet, offer to generate a prompt using `re/release-image-prompt.md` as the base template, then wait for the user to generate and supply the image before continuing.

**4. Tag and push**

```bash
git tag v<version>
git push origin main
git push origin v<version>
```

Pushing the tag triggers `.github/workflows/release.yml` which builds macOS (.dmg), Linux (.tar.gz), and Windows (.zip) artifacts and publishes them as a GitHub Release automatically.

**5. Confirm**

After pushing, tell the user:
- The tag that was pushed
- That CI is now building — they can watch at: https://github.com/Patrick-web/alis-hub/actions
- Once the release is published, the Cloudflare Worker at alishub.justpatrick.workers.dev will automatically serve the new version to the website and the in-app updater
