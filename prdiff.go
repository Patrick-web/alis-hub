package main

// Splitting a pull request's unified diff into per-file diffs.
//
// Forgejo serves a whole PR (or commit) as one unified diff. The diff viewer
// wants one file at a time, in exactly the form `git diff` emits it, so the work
// here is to cut the stream on its file boundaries without disturbing the
// contents of each slice.
//
// Note that `.diff` is the right endpoint and `.patch` is not: patch output is
// per-commit, and on the reference instance the largest open PR is 1.4MB as a
// diff and 78.7MB as a patch.

import "strings"

// splitUnifiedDiff cuts a unified diff into one PRDiffFile per file.
func splitUnifiedDiff(raw string) []PRDiffFile {
	if strings.TrimSpace(raw) == "" {
		return nil
	}

	lines := strings.Split(raw, "\n")
	var files []PRDiffFile
	start := -1

	for i, line := range lines {
		if !strings.HasPrefix(line, "diff --git ") {
			continue
		}
		if start >= 0 {
			files = append(files, parseDiffSection(lines[start:i]))
		}
		start = i
	}
	if start >= 0 {
		files = append(files, parseDiffSection(lines[start:]))
	}
	return files
}

// parseDiffSection reads one file's diff. section[0] is its "diff --git" line.
func parseDiffSection(section []string) PRDiffFile {
	var oldPath, newPath string
	var sawOld, sawNew, binary, added, deleted bool

	// Only the header carries ---/+++ markers with meaning. Inside a hunk, a
	// removed line whose content begins with "--" is itself rendered as "---",
	// so scanning past the first @@ would misread content as a path.
	for _, line := range section[1:] {
		if strings.HasPrefix(line, "@@") {
			break
		}
		switch {
		case strings.HasPrefix(line, "--- "):
			oldPath, sawOld = diffHeaderPath(line[4:], "a/"), true
		case strings.HasPrefix(line, "+++ "):
			newPath, sawNew = diffHeaderPath(line[4:], "b/"), true
		case strings.HasPrefix(line, "new file mode"):
			added = true
		case strings.HasPrefix(line, "deleted file mode"):
			deleted = true
		case strings.HasPrefix(line, "rename from "):
			oldPath = strings.TrimSpace(strings.TrimPrefix(line, "rename from "))
		case strings.HasPrefix(line, "rename to "):
			newPath = strings.TrimSpace(strings.TrimPrefix(line, "rename to "))
		case strings.HasPrefix(line, "Binary files ") || strings.HasPrefix(line, "GIT binary patch"):
			binary = true
		}
	}

	// A mode-only change, and some binary changes, carry no ---/+++ pair at all.
	// The header line is the only path source then.
	if !sawOld && !sawNew && oldPath == "" && newPath == "" {
		oldPath, newPath = parseDiffGitHeader(section[0])
	}

	path := newPath
	if path == "" {
		path = oldPath
	}

	status := "M"
	switch {
	case deleted || (sawNew && newPath == ""):
		status = "D"
	case added || (sawOld && oldPath == ""):
		status = "A"
	case oldPath != "" && newPath != "" && oldPath != newPath:
		status = "R"
	}

	file := PRDiffFile{
		Path:       path,
		StatusCode: status,
		Binary:     binary,
		Diff:       GitFileDiff{Language: gitLang(path)},
	}
	if status == "R" {
		file.OldPath = oldPath
	}
	// A binary file has no renderable text, so hand the viewer nothing rather
	// than a header it would draw as an empty diff.
	if !binary {
		// The viewer takes each file's diff whole, headers included, which is
		// also what gitParseHunks produces for working-tree diffs.
		file.Diff.Hunks = gitParseHunks(strings.Join(section, "\n"))
	}
	return file
}

// diffHeaderPath cleans one side of a ---/+++ pair, returning "" for /dev/null.
func diffHeaderPath(rest, prefix string) string {
	// git appends a tab plus timestamp on some configurations.
	if tab := strings.IndexByte(rest, '\t'); tab >= 0 {
		rest = rest[:tab]
	}
	rest = strings.TrimSpace(rest)
	if rest == "/dev/null" {
		return ""
	}
	// Quoted when the path has unusual bytes; the quotes are not part of it.
	if len(rest) >= 2 && rest[0] == '"' && rest[len(rest)-1] == '"' {
		rest = rest[1 : len(rest)-1]
	}
	return strings.TrimPrefix(rest, prefix)
}

// parseDiffGitHeader recovers both paths from a "diff --git a/X b/Y" line, the
// fallback for sections with no ---/+++ pair. Paths containing " b/" are
// genuinely ambiguous in this form; git's own tooling has the same limit.
func parseDiffGitHeader(line string) (oldPath, newPath string) {
	rest := strings.TrimPrefix(line, "diff --git ")
	idx := strings.Index(rest, " b/")
	if idx < 0 {
		return "", ""
	}
	return strings.TrimPrefix(rest[:idx], "a/"), strings.TrimPrefix(rest[idx+1:], "b/")
}
