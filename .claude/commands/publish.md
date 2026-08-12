# Publish a new version of alis-hub

Release flow: commit any pending changes → pick channel and version → tag → push (triggers CI).

There are two release channels. A plain `vX.Y.Z` tag is a **stable** release and reaches
everyone. A `vX.Y.Z-beta.N` tag is a **beta**: CI marks it a GitHub prerelease, and it only
reaches users who opted in under Settings → Updates → Release channel, or who clicked the
beta link on the website.

## Steps

**1. Check current state**

```bash
git status
# versionsort.suffix is required: without it plain `--sort=-version:refname` ranks
# v0.15.0-beta.1 ABOVE v0.15.0, so a beta looks like the newest release.
git -c versionsort.suffix=-beta -c versionsort.suffix=-rc tag --list 'v*' --sort=-version:refname | head -5
# newest stable only
git tag --list 'v*' --sort=-version:refname | grep -v -- '-' | head -1
```

Show the user the latest stable tag, any newer betas, and any uncommitted changes.

**2. Determine channel and next version**

First ask: **stable or beta?**

For a **stable** release, ask patch, minor, or major from the latest stable tag:
- Patch (default): bug fixes, small tweaks → e.g. v0.2.1 → v0.2.2
- Minor: new features → e.g. v0.2.1 → v0.3.0
- Major: breaking changes → e.g. v0.2.1 → v1.0.0

For a **beta**, the tag is `v<base>-beta.<N>` where:
- `<base>` is the version the beta line leads up to (bumped from the latest **stable** tag,
  not from another beta)
- `<N>` is 1, or one more than the highest existing beta for that same base

Never reuse an N: the Worker resolves the beta channel by semver, so a recycled tag can
leave testers stranded on an older build.

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

Betas get a full entry too, headed `## [v0.15.0-beta.1]`. Both the release workflow and the
in-app changelog (`changelogservice.go`) look the heading up by exact version, so a beta
without an entry ships with empty release notes.

**When cutting the stable release that graduates a beta line**, write a fresh consolidated
entry for `## [v<version>]` covering everything since the last **stable** tag
(`git log v0.14.7..HEAD --oneline`), not just the commits since the last beta. Someone
upgrading stable-to-stable never saw the beta entries, and `GetReleaseNotes` only ever
reads the section matching the exact version they are running. Leave the beta sections in
the file: testers still on a beta build need them.

Show the generated entry to the user and wait for their approval before continuing. If they want changes, apply them to `CHANGELOG.md` before proceeding.

**2c. Migration check (betas only)**

If the diff since the last stable tag touches the `migrations` slice in `hubdb.go`, warn the
user before tagging. Beta and stable share one install path and one `hub.db`, and
`runMigrations` is forward-only with no down migrations. So:

- Beta migrations must be strictly additive (`CREATE TABLE`, `ADD COLUMN` with a default).
  Never `DROP` or `RENAME` in a beta, or a user who rolls back to stable is left with a
  database the older build cannot read.
- Never renumber or replace a migration that has already shipped in a beta. Testers have
  already recorded that schema version and will skip the replacement forever.

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

**3b. Release image** (stable releases only — skip entirely for betas)

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

Pushing the tag triggers `.github/workflows/release.yml` which builds macOS (.dmg), Linux (.tar.gz), and Windows (.zip) artifacts and publishes them as a GitHub Release automatically. A tag containing a `-` suffix is published as a **prerelease**, which is what keeps it off the stable channel.

**4b. Verify the channel routing** (betas only)

The Worker caches release lookups for 60 seconds, so give it a moment, then:

```bash
gh release view v<version> --repo Patrick-web/alis-hub --json isPrerelease
curl -s https://alishub.justpatrick.workers.dev/api/release | jq .version                    # must still be the stable version
curl -s 'https://alishub.justpatrick.workers.dev/api/release?channel=beta' | jq '.version, .prerelease'
```

If `/api/release` (no channel) returns the beta version, the release was not flagged as a
prerelease and every stable user is about to be offered it. Fix it immediately with
`gh release edit v<version> --repo Patrick-web/alis-hub --prerelease`.

**5. Confirm**

After pushing, tell the user:
- The tag that was pushed, and which channel it goes to
- That CI is now building — they can watch at: https://github.com/Patrick-web/alis-hub/actions
- Once the release is published, the Cloudflare Worker at alishub.justpatrick.workers.dev will automatically serve the new version to the website and the in-app updater

For a **stable** release, that means everyone, including users on the beta channel whose
current beta is older than this release.

For a **beta**, only users who opted in under Settings → Updates → Release channel, or who
use the beta link on the download page, will be offered it. Everyone else stays on stable
and will not see it at all.
