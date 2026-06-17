const REPO = "Patrick-web/alis-hub";

const PLATFORM_MATCHERS = {
  macos: (name) => name.toLowerCase().includes("macos") && name.endsWith(".dmg"),
  linux: (name) => name.toLowerCase().includes("linux") && name.endsWith(".tar.gz"),
  windows: (name) => name.toLowerCase().includes("windows") && name.endsWith(".zip"),
};

async function fetchLatestRelease(token) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "alishub-worker",
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.json();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // GET /api/release — return version + per-platform download paths
    if (url.pathname === "/api/release") {
      try {
        const release = await fetchLatestRelease(env.GITHUB_TOKEN);
        const platforms = {};
        for (const [key, match] of Object.entries(PLATFORM_MATCHERS)) {
          const asset = release.assets?.find((a) => match(a.name));
          if (asset) platforms[key] = `/download/${key}`;
        }
        return Response.json({ version: release.tag_name, platforms });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 502 });
      }
    }

    // GET /download/:platform — proxy the asset from GitHub
    const downloadMatch = url.pathname.match(/^\/download\/(macos|linux|windows)$/);
    if (downloadMatch) {
      const platform = downloadMatch[1];
      try {
        const release = await fetchLatestRelease(env.GITHUB_TOKEN);
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
