//go:build alis_integration

// Live tests for the local-git half of GitService, against a real checkout under
// ~/alis.build. Excluded from `go test ./...` by the alis_integration build tag.
//
// The pull request tests that used to live here moved to
// prservice_integration_test.go when the PR feature stopped going through a
// local clone. What remains covers the commit inspection the commit graph still
// does with local git.

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func voyageBuildPath(t *testing.T) string {
	t.Helper()
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("home dir: %v", err)
	}
	path := filepath.Join(home, "alis.build", "voyage", "build", "vp")
	if _, err := os.Stat(filepath.Join(path, ".git")); err != nil {
		t.Skipf("no checkout at %s", path)
	}
	return path
}

// TestCommitFilesAndDiff covers GetCommitFiles and GetCommitFileDiff, which the
// commit graph uses to show what a commit touched.
func TestCommitFilesAndDiff(t *testing.T) {
	svc := NewGitService()
	repoPath := voyageBuildPath(t)

	commits, err := svc.GetLog(repoPath, 10)
	if err != nil {
		t.Fatalf("GetLog: %v", err)
	}
	if len(commits) == 0 {
		t.Skip("no commits in the checkout")
	}

	// Walk back until a commit with files is found: a merge commit can report
	// none against its first parent.
	for _, commit := range commits {
		files, err := svc.GetCommitFiles(repoPath, commit.Hash)
		if err != nil {
			t.Fatalf("GetCommitFiles(%s): %v", commit.Hash[:7], err)
		}
		if len(files) == 0 {
			continue
		}
		t.Logf("commit %s %q touched %d files", commit.Hash[:7], commit.Subject, len(files))

		first := files[0]
		diff, err := svc.GetCommitFileDiff(repoPath, commit.Hash, first.Path)
		if err != nil {
			t.Fatalf("GetCommitFileDiff(%s, %s): %v", commit.Hash[:7], first.Path, err)
		}
		if len(diff.Hunks) == 0 {
			t.Fatalf("no hunks for %s, so the diff viewer would render it blank", first.Path)
		}
		// @git-diff-view/core parses each entry as a standalone diff.
		if !strings.HasPrefix(diff.Hunks[0], "diff --git ") {
			t.Fatalf("hunks[0] must start with \"diff --git \", got %.60q", diff.Hunks[0])
		}
		t.Logf("diff for %s: oldLen=%d newLen=%d hunks=%d",
			first.Path, len(diff.OldContent), len(diff.NewContent), len(diff.Hunks))
		return
	}
	t.Skip("no commit with file changes in the last 10")
}
