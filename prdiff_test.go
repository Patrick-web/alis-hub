package main

import (
	"strings"
	"testing"
)

func TestSplitUnifiedDiffMultipleFiles(t *testing.T) {
	raw := `diff --git a/console/v2/internal/spa/spa.go b/console/v2/internal/spa/spa.go
index 1111111..2222222 100644
--- a/console/v2/internal/spa/spa.go
+++ b/console/v2/internal/spa/spa.go
@@ -10,6 +10,7 @@ func Handler() http.Handler {
 	mux := http.NewServeMux()
-	old line
+	new line
 	return mux
diff --git a/frontend/src/main.ts b/frontend/src/main.ts
index 3333333..4444444 100644
--- a/frontend/src/main.ts
+++ b/frontend/src/main.ts
@@ -1,2 +1,2 @@
-console.log("a")
+console.log("b")
`

	files := splitUnifiedDiff(raw)
	if len(files) != 2 {
		t.Fatalf("got %d files, want 2: %+v", len(files), files)
	}

	if files[0].Path != "console/v2/internal/spa/spa.go" {
		t.Errorf("files[0].Path = %q", files[0].Path)
	}
	if files[0].Diff.Language != "go" {
		t.Errorf("files[0] language = %q, want go", files[0].Diff.Language)
	}
	if files[1].Path != "frontend/src/main.ts" {
		t.Errorf("files[1].Path = %q", files[1].Path)
	}
	if files[1].Diff.Language != "typescript" {
		t.Errorf("files[1] language = %q, want typescript", files[1].Diff.Language)
	}

	for i, f := range files {
		if f.StatusCode != "M" {
			t.Errorf("files[%d].StatusCode = %q, want M", i, f.StatusCode)
		}
		if len(f.Diff.Hunks) != 1 {
			t.Fatalf("files[%d] has %d hunk entries, want 1", i, len(f.Diff.Hunks))
		}
		// @git-diff-view/core parses each entry as a standalone diff, so every
		// entry has to begin with its own header. The integration tests assert
		// the same thing against the live instance.
		if !strings.HasPrefix(f.Diff.Hunks[0], "diff --git ") {
			t.Errorf("files[%d].Hunks[0] = %.40q, want a leading \"diff --git \"", i, f.Diff.Hunks[0])
		}
	}

	// Each slice must carry only its own file.
	if strings.Contains(files[0].Diff.Hunks[0], "main.ts") {
		t.Error("files[0] leaked content from the next file")
	}
	if strings.Contains(files[1].Diff.Hunks[0], "spa.go") {
		t.Error("files[1] leaked content from the previous file")
	}
}

func TestSplitUnifiedDiffStatusCodes(t *testing.T) {
	tests := []struct {
		name       string
		raw        string
		wantPath   string
		wantOld    string
		wantStatus string
	}{
		{
			name: "added",
			raw: `diff --git a/new.go b/new.go
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/new.go
@@ -0,0 +1 @@
+package main
`,
			wantPath:   "new.go",
			wantStatus: "A",
		},
		{
			name: "deleted",
			raw: `diff --git a/gone.go b/gone.go
deleted file mode 100644
index 1111111..0000000
--- a/gone.go
+++ /dev/null
@@ -1 +0,0 @@
-package main
`,
			wantPath:   "gone.go",
			wantStatus: "D",
		},
		{
			name: "renamed with edits",
			raw: `diff --git a/old/name.go b/new/name.go
similarity index 88%
rename from old/name.go
rename to new/name.go
index 1111111..2222222 100644
--- a/old/name.go
+++ b/new/name.go
@@ -1,2 +1,2 @@
-a
+b
`,
			wantPath:   "new/name.go",
			wantOld:    "old/name.go",
			wantStatus: "R",
		},
		{
			name: "pure rename with no hunks",
			raw: `diff --git a/old.go b/new.go
similarity index 100%
rename from old.go
rename to new.go
`,
			wantPath:   "new.go",
			wantOld:    "old.go",
			wantStatus: "R",
		},
		{
			name: "mode change only",
			raw: `diff --git a/script.sh b/script.sh
old mode 100644
new mode 100755
`,
			wantPath:   "script.sh",
			wantStatus: "M",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			files := splitUnifiedDiff(tt.raw)
			if len(files) != 1 {
				t.Fatalf("got %d files, want 1: %+v", len(files), files)
			}
			f := files[0]
			if f.Path != tt.wantPath {
				t.Errorf("Path = %q, want %q", f.Path, tt.wantPath)
			}
			if f.OldPath != tt.wantOld {
				t.Errorf("OldPath = %q, want %q", f.OldPath, tt.wantOld)
			}
			if f.StatusCode != tt.wantStatus {
				t.Errorf("StatusCode = %q, want %q", f.StatusCode, tt.wantStatus)
			}
		})
	}
}

// A removed line whose content starts with "--" renders as "---" inside a hunk.
// Scanning header markers past the first @@ would read it as a path and rewrite
// the file's identity.
func TestSplitUnifiedDiffIgnoresMarkersInsideHunks(t *testing.T) {
	raw := `diff --git a/real/path.md b/real/path.md
index 1111111..2222222 100644
--- a/real/path.md
+++ b/real/path.md
@@ -1,5 +1,5 @@
 title
---- underline
++++ replacement
 body
-+++ b/decoy/path.md
+--- a/decoy/path.md
`

	files := splitUnifiedDiff(raw)
	if len(files) != 1 {
		t.Fatalf("got %d files, want 1", len(files))
	}
	if files[0].Path != "real/path.md" {
		t.Errorf("Path = %q, want real/path.md: hunk content was parsed as a header", files[0].Path)
	}
	if files[0].StatusCode != "M" {
		t.Errorf("StatusCode = %q, want M", files[0].StatusCode)
	}
}

func TestSplitUnifiedDiffBinary(t *testing.T) {
	raw := `diff --git a/logo.png b/logo.png
index 1111111..2222222 100644
Binary files a/logo.png and b/logo.png differ
`
	files := splitUnifiedDiff(raw)
	if len(files) != 1 {
		t.Fatalf("got %d files, want 1", len(files))
	}
	if !files[0].Binary {
		t.Error("Binary = false, want true")
	}
	if files[0].Path != "logo.png" {
		t.Errorf("Path = %q, want logo.png", files[0].Path)
	}
	// Handing the viewer a header with no hunks would draw an empty diff and
	// read as "no changes" rather than "not text".
	if len(files[0].Diff.Hunks) != 0 {
		t.Errorf("Hunks = %v, want none for a binary file", files[0].Diff.Hunks)
	}
}

func TestSplitUnifiedDiffQuotedAndSpacedPaths(t *testing.T) {
	raw := `diff --git a/dir/file with spaces.txt b/dir/file with spaces.txt
index 1111111..2222222 100644
--- a/dir/file with spaces.txt
+++ b/dir/file with spaces.txt
@@ -1 +1 @@
-a
+b
`
	files := splitUnifiedDiff(raw)
	if len(files) != 1 {
		t.Fatalf("got %d files, want 1", len(files))
	}
	if files[0].Path != "dir/file with spaces.txt" {
		t.Errorf("Path = %q, want the spaced path intact", files[0].Path)
	}
}

func TestSplitUnifiedDiffEmpty(t *testing.T) {
	for _, raw := range []string{"", "   ", "\n\n"} {
		if got := splitUnifiedDiff(raw); got != nil {
			t.Errorf("splitUnifiedDiff(%q) = %+v, want nil", raw, got)
		}
	}
}

func TestDiffHeaderPath(t *testing.T) {
	tests := []struct {
		rest, prefix, want string
	}{
		{"a/main.go", "a/", "main.go"},
		{"b/main.go", "b/", "main.go"},
		{"/dev/null", "a/", ""},
		{"a/main.go\t2026-08-09 12:00:00", "a/", "main.go"},
		{`"a/odd\path.go"`, "a/", `odd\path.go`},
		{"  a/main.go  ", "a/", "main.go"},
	}
	for _, tt := range tests {
		if got := diffHeaderPath(tt.rest, tt.prefix); got != tt.want {
			t.Errorf("diffHeaderPath(%q, %q) = %q, want %q", tt.rest, tt.prefix, got, tt.want)
		}
	}
}

func TestStripWIPPrefix(t *testing.T) {
	tests := []struct {
		title    string
		want     string
		wantFlag bool
	}{
		{"WIP: add the thing", "add the thing", true},
		{"wip: lowercase marker", "lowercase marker", true},
		{"[WIP] bracketed", "bracketed", true},
		{"  WIP: leading space", "leading space", true},
		{"feat: not a draft", "feat: not a draft", false},
		{"", "", false},
		// Nothing left after the marker: refuse rather than blank the title.
		{"WIP:", "WIP:", false},
		{"WIP: ", "WIP: ", false},
		// A title that merely begins with those letters is not a draft.
		{"WIPE the slate", "WIPE the slate", false},
		{"Wiper blades", "Wiper blades", false},
	}
	for _, tt := range tests {
		got, ok := stripWIPPrefix(tt.title)
		if got != tt.want || ok != tt.wantFlag {
			t.Errorf("stripWIPPrefix(%q) = (%q, %v), want (%q, %v)", tt.title, got, ok, tt.want, tt.wantFlag)
		}
	}
}

func TestForgejoStatusCode(t *testing.T) {
	tests := map[string]string{
		"added":    "A",
		"modified": "M",
		"deleted":  "D",
		"removed":  "D",
		"renamed":  "R",
		"copied":   "C",
		"":         "M",
		"unknown":  "M",
	}
	for in, want := range tests {
		if got := forgejoStatusCode(in); got != want {
			t.Errorf("forgejoStatusCode(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestValidateMergeStyle(t *testing.T) {
	all := &PRRepoInfo{AllowMerge: true, AllowRebase: true, AllowSquash: true}
	mergeOnly := &PRRepoInfo{AllowMerge: true}

	for _, style := range []string{"merge", "rebase", "squash"} {
		if err := validateMergeStyle(style, all); err != nil {
			t.Errorf("validateMergeStyle(%q, all allowed) = %v", style, err)
		}
	}
	for _, style := range []string{"rebase", "squash"} {
		if err := validateMergeStyle(style, mergeOnly); err == nil {
			t.Errorf("validateMergeStyle(%q, merge only) = nil, want an error", style)
		}
	}
	for _, style := range []string{"", "fast-forward", "MERGE"} {
		if err := validateMergeStyle(style, all); err == nil {
			t.Errorf("validateMergeStyle(%q) = nil, want an error", style)
		}
	}
}

// Forgejo returns both the modern `assignees` list and the pre-multi-assignee
// `assignee` field. A PR created before the list existed carries only the latter,
// so the filter would show it as unassigned if the fallback were missing.
func TestRawPRAssignees(t *testing.T) {
	person := func(login string) *struct {
		Login string `json:"login"`
	} {
		return &struct {
			Login string `json:"login"`
		}{Login: login}
	}

	t.Run("list wins when present", func(t *testing.T) {
		var raw rawPR
		raw.Assignee = person("legacy")
		raw.Assignees = []struct {
			Login string `json:"login"`
		}{{Login: "first"}, {Login: "second"}}
		got := raw.toPR().Assignees
		if len(got) != 2 || got[0] != "first" || got[1] != "second" {
			t.Errorf("Assignees = %v, want [first second]", got)
		}
	})

	t.Run("falls back to the single field", func(t *testing.T) {
		var raw rawPR
		raw.Assignee = person("legacy")
		got := raw.toPR().Assignees
		if len(got) != 1 || got[0] != "legacy" {
			t.Errorf("Assignees = %v, want [legacy]", got)
		}
	})

	t.Run("unassigned is empty, never nil", func(t *testing.T) {
		var raw rawPR
		got := raw.toPR().Assignees
		if got == nil {
			t.Error("Assignees is nil; the frontend filter reads .length on it")
		}
		if len(got) != 0 {
			t.Errorf("Assignees = %v, want empty", got)
		}
	})

	t.Run("an empty login is not an assignee", func(t *testing.T) {
		var raw rawPR
		raw.Assignee = person("")
		if got := raw.toPR().Assignees; len(got) != 0 {
			t.Errorf("Assignees = %v, want empty", got)
		}
	})
}
