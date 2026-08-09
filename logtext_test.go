package main

import (
	"strings"
	"testing"
)

// realPageFragment is trimmed from a live alisproxy build page. The Tailwind
// arbitrary variants — class="[&>svg]:size-5" — are the point: they carry a `>`
// inside a quoted attribute value, which is what the old tag regex could not
// survive.
const realPageFragment = `<div id="rightPanel" class="fc font-mono text-sm" :class="wrap ? 'a' : 'b'">` +
	`<div class="fr ic gap-2"><span class="[&>svg]:size-4"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg></span>` +
	`<span class="text-sm font-semibold">Docker build</span> <span>— 9/9 steps &middot; 2 cached</span></div>` +
	`<div class="border-b"><div class="fr ic gap-3"><span class="[&>svg]:size-5 text-primary" data-tip="Completed"><svg viewBox="0 0 24 24"></svg></span>` +
	`<div class="fc"><span class="truncate">[internal] load .dockerignore</span><span class="text-xs">112ms</span></div></div></div>` +
	`<div class="border-b"><div class="fr ic gap-3"><span class="[&>svg]:size-5" data-tip="Served from the build cache"><svg viewBox="0 0 24 24"></svg></span>` +
	`<div class="fc"><span class="truncate">[builder 2/6] WORKDIR /app</span><span class="text-xs">CACHED</span></div></div></div>` +
	`<script>window.x = 1 > 0;</script>` +
	`</div></div>`

// TestExtractBuildLogText_NoAttributeLeakage is the regression this whole fix
// exists for: `<[^>]+>` ends at the first `>` in the source, which for
// class="[&>svg]:size-5" is inside the attribute, so the remainder — `svg]:size-5
// text-primary" data-tip="Completed">` — was written to the terminal as if the
// build had printed it. On a real page that was 22% of the text.
func TestExtractBuildLogText_NoAttributeLeakage(t *testing.T) {
	got := extractBuildLogText(realPageFragment)

	for _, fragment := range []string{"svg]", "data-tip", "class=", "text-primary", `">`} {
		if strings.Contains(got, fragment) {
			t.Errorf("markup %q leaked into the log text:\n%s", fragment, got)
		}
	}
	if !strings.Contains(got, "[internal] load .dockerignore") {
		t.Errorf("real output missing:\n%s", got)
	}
	if strings.Contains(got, "window.x") {
		t.Errorf("script contents leaked into the log text:\n%s", got)
	}
}

// TestExtractBuildLogText_KeepsLineStructure guards the other half: the pages
// carry no newlines of their own, so without block tags becoming line breaks a
// whole build renders as one enormous row.
func TestExtractBuildLogText_KeepsLineStructure(t *testing.T) {
	got := extractBuildLogText(realPageFragment)
	lines := strings.Split(got, "\n")
	// Header, then one line per step — the source HTML has no newlines at all,
	// so anything less means they ran together.
	if len(lines) != 3 {
		t.Fatalf("expected 3 lines, got %d:\n%s", len(lines), got)
	}
	if !strings.HasPrefix(lines[1], "[internal] load .dockerignore") ||
		!strings.HasPrefix(lines[2], "[builder 2/6] WORKDIR /app") {
		t.Errorf("steps did not land on their own lines:\n%s", got)
	}
	for _, line := range lines {
		if line != strings.TrimSpace(line) {
			t.Errorf("line not trimmed: %q", line)
		}
		if line == "" {
			t.Error("blank line survived")
		}
	}
	// Entities are decoded, not passed through.
	if !strings.Contains(got, "·") {
		t.Errorf("entity not decoded:\n%s", got)
	}
}

// TestExtractBuildLogText_LogLineSpans keeps the older page format working.
// Current pages carry none of these, but a page that still does should not
// regress to the structured-view path.
func TestExtractBuildLogText_LogLineSpans(t *testing.T) {
	page := `<span class="log-line">step one</span><span class="log-line">step<br>two</span>`
	got := extractBuildLogText(page)
	if got != "step one\nstep\ntwo" {
		t.Errorf("got %q", got)
	}
}

func TestExtractBuildLogText_NoPanel(t *testing.T) {
	if got := extractBuildLogText(`<html><body>nothing here</body></html>`); got != "" {
		t.Errorf("expected empty, got %q", got)
	}
}

// TestLogTextCacheDiff covers the streaming contract. The offset scheme assumes
// the page's text only grows; the structured view rewrites in place, so the
// cache exists to notice when the caller's copy is no longer a prefix and ask
// for a replace rather than splicing two unrelated points together.
func TestLogTextCacheDiff(t *testing.T) {
	const url = "https://proxy/executions/abc"

	var c logTextCache

	if got := c.diff(url, "hello", 0); got.Content != "hello" || got.NextOffset != 5 || got.Reset {
		t.Errorf("first fetch = %+v, want the whole text appended", got)
	}
	if got := c.diff(url, "hello world", 5); got.Content != " world" || got.NextOffset != 11 || got.Reset {
		t.Errorf("append = %+v, want only the tail", got)
	}
	if got := c.diff(url, "hello world", 11); got.Content != "" || got.NextOffset != 11 || got.Reset {
		t.Errorf("no change = %+v, want nothing", got)
	}

	// The page rewrote a step the caller already holds. Appending from offset 11
	// would splice "hello world" onto text that no longer starts with it.
	rewritten := "hello WORLD, and more"
	got := c.diff(url, rewritten, 11)
	if !got.Reset || got.Content != rewritten || got.NextOffset != int64(len(rewritten)) {
		t.Errorf("rewrite = %+v, want a full reset", got)
	}

	// An offset past the end cannot be a position in this text.
	if got := c.diff(url, "short", 999); !got.Reset || got.Content != "short" {
		t.Errorf("stale offset = %+v, want a full reset", got)
	}
}

// TestLogTextCacheDiff_SeparateURLs guards against one run's text being
// compared with another's: two environments deploy concurrently through the
// same service instance.
func TestLogTextCacheDiff_SeparateURLs(t *testing.T) {
	var c logTextCache
	c.diff("url-a", "aaaa", 0)
	if got := c.diff("url-b", "bbbb", 0); got.Reset {
		t.Errorf("a different page reset unnecessarily: %+v", got)
	}
	if got := c.diff("url-a", "aaaabbbb", 4); got.Reset || got.Content != "bbbb" {
		t.Errorf("first page lost its history: %+v", got)
	}
}

// TestLogTextCacheDiff_ColdCacheAssumesAppend documents the one case the cache
// cannot judge: a pane reconnecting after a restart holds an offset the backend
// has no memory of. Assuming an append matches the old behaviour rather than
// resetting a terminal that is probably correct.
func TestLogTextCacheDiff_ColdCacheAssumesAppend(t *testing.T) {
	var c logTextCache
	got := c.diff("url", "hello world", 5)
	if got.Reset || got.Content != " world" {
		t.Errorf("cold cache = %+v, want an append", got)
	}
}
