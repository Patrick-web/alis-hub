const REPO = "Patrick-web/alis-hub";

// Release channels. Betas are published as GitHub prereleases (see
// .github/workflows/release.yml), so "stable" is simply everything that isn't
// flagged as a prerelease. The beta channel sees both, because a stable release
// supersedes an older beta.
const CHANNELS = new Set(["stable", "beta"]);
const DEFAULT_CHANNEL = "stable";

const PLATFORM_MATCHERS = {
  macos: (name) => name.toLowerCase().includes("macos") && name.endsWith(".zip"),
  linux: (name) => name.toLowerCase().includes("linux") && name.endsWith(".tar.gz"),
  windows: (name) => name.toLowerCase().includes("windows") && name.endsWith("-installer.exe"),
};

// Unknown or missing ?channel= falls back to stable, so every existing client
// that predates this parameter keeps behaving exactly as before.
function channelOf(url) {
  const c = url.searchParams.get("channel") || DEFAULT_CHANNEL;
  return CHANNELS.has(c) ? c : DEFAULT_CHANNEL;
}

function parseSemver(tag) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(tag || "");
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split(".") : null };
}

// Semver precedence: 0.15.0 outranks 0.15.0-beta.3, and beta.10 outranks beta.2.
// GitHub returns releases in created_at order, which gets this wrong whenever a
// hotfix is tagged after a beta.
function cmp(a, b) {
  for (const k of ["major", "minor", "patch"]) {
    if (a[k] !== b[k]) return a[k] - b[k];
  }
  if (!a.pre && !b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) {
      if (+x !== +y) return +x - +y;
    } else if (nx !== ny) {
      return nx ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

async function fetchRelease(token, channel) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=50`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "alishub-worker",
    },
    // Every running app polls this 30s after launch, and it now serves two
    // audiences, so keep GitHub out of the hot path.
    cf: { cacheTtl: 60, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const all = await res.json();

  let best = null;
  let bestVersion = null;
  for (const release of all) {
    if (release.draft) continue;
    if (channel !== "beta" && release.prerelease) continue;
    const version = parseSemver(release.tag_name);
    if (!version) {
      console.log(`skipping unparseable tag: ${release.tag_name}`);
      continue;
    }
    if (!bestVersion || cmp(version, bestVersion) > 0) {
      best = release;
      bestVersion = version;
    }
  }
  if (!best) throw new Error(`no release available on the ${channel} channel`);
  return best;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const channel = channelOf(url);

    // GET /api/release[?channel=] — return version + per-platform download paths
    if (url.pathname === "/api/release") {
      try {
        const release = await fetchRelease(env.GITHUB_TOKEN, channel);
        const platforms = {};
        for (const [key, match] of Object.entries(PLATFORM_MATCHERS)) {
          const asset = release.assets?.find((a) => match(a.name));
          // Carry the channel forward so callers can use these paths verbatim.
          if (asset) platforms[key] = `/download/${key}?channel=${channel}`;
        }
        return Response.json({
          version: release.tag_name,
          url: release.html_url,
          notes: release.body ?? "",
          channel,
          prerelease: Boolean(release.prerelease),
          platforms,
        });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 502 });
      }
    }

    // GET /download/:platform[?channel=] — proxy the asset from GitHub
    const downloadMatch = url.pathname.match(/^\/download\/(macos|linux|windows)$/);
    if (downloadMatch) {
      const platform = downloadMatch[1];
      try {
        const release = await fetchRelease(env.GITHUB_TOKEN, channel);
        const match = PLATFORM_MATCHERS[platform];
        const asset = release.assets?.find((a) => match(a.name));
        if (!asset) return new Response("Asset not found", { status: 404 });

        // Stream the asset from GitHub using the token
        const fileRes = await fetch(asset.url, {
          headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: "application/octet-stream",
            "User-Agent": "alishub-worker",
          },
          redirect: "follow",
        });
        if (!fileRes.ok) return new Response("Upstream error", { status: 502 });

        return new Response(fileRes.body, {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="${asset.name}"`,
            "Content-Length": asset.size.toString(),
          },
        });
      } catch (e) {
        return new Response(e.message, { status: 502 });
      }
    }

    // All other requests fall through to static assets
    return env.ASSETS.fetch(request);
  },
};
