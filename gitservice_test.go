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
	return filepath.Join(home, "alis.build", "voyage", "build", "vp")
}

func newGitSvcWithAuth(t *testing.T) *GitService {
	t.Helper()
	svc := NewGitService()
	if svc.tokens == nil {
		t.Skip("no alis credentials available")
	}
	return svc
}

// TestForgejoIsForgejo verifies that the voyage/vp build repo is detected as Forgejo.
func TestForgejoIsForgejo(t *testing.T) {
	svc := newGitSvcWithAuth(t)
	repoPath := voyageBuildPath(t)

	ok, err := svc.IsForgejo(repoPath)
	if err != nil {
		t.Fatalf("IsForgejo: %v", err)
	}
	if !ok {
		t.Fatal("expected voyage/vp to be a Forgejo repo")
	}
	t.Log("IsForgejo: ✓")
}

// TestForgejoListPRs lists open PRs on voyage/vp.
func TestForgejoListPRs(t *testing.T) {
	svc := newGitSvcWithAuth(t)
	repoPath := voyageBuildPath(t)

	prs, err := svc.ListPRs(repoPath, "open")
	if err != nil {
		t.Fatalf("ListPRs: %v", err)
	}
	t.Logf("open PRs: %d", len(prs))
	for _, pr := range prs {
		t.Logf("  #%d %q  %s → %s  (mergeable=%v)", pr.Number, pr.Title, pr.HeadBranch, pr.BaseBranch, pr.Mergeable)
	}
}

// TestForgejoCreatePR creates a PR from staging → master on voyage/vp.
// Run with: go test -v -run TestForgejoCreatePR ./...
func TestForgejoCreatePR(t *testing.T) {
	svc := newGitSvcWithAuth(t)
	repoPath := voyageBuildPath(t)

	pr, err := svc.CreatePR(repoPath,
		"staging → master",
		"Merge staging branch into master.",
		"staging",
		"master",
	)
	if err != nil {
		t.Fatalf("CreatePR: %v", err)
	}
	t.Logf("created PR #%d: %q  %s → %s  url=%s", pr.Number, pr.Title, pr.HeadBranch, pr.BaseBranch, pr.HTMLURL)
}

// TestForgejoPRCommitFiles verifies GetPRCommits + GetCommitFiles + GetCommitFileDiff
// against the first open PR on voyage/vp.
func TestForgejoPRCommitFiles(t *testing.T) {
	svc := newGitSvcWithAuth(t)
	repoPath := voyageBuildPath(t)

	prs, err := svc.ListPRs(repoPath, "open")
	if err != nil {
		t.Fatalf("ListPRs: %v", err)
	}
	if len(prs) == 0 {
		t.Skip("no open PRs to test against")
	}
	pr := prs[0]
	t.Logf("using PR #%d %q  %s → %s", pr.Number, pr.Title, pr.HeadBranch, pr.BaseBranch)

	commits, err := svc.GetPRCommits(repoPath, pr.Number)
	if err != nil {
		t.Fatalf("GetPRCommits: %v", err)
	}
	t.Logf("commits in PR: %d", len(commits))
	if len(commits) == 0 {
		t.Fatal("expected at least one commit in the PR")
	}

	commit := commits[0]
	t.Logf("first commit: %s %q by %s", commit.SHA[:7], commit.Message, commit.Author)

	files, err := svc.GetCommitFiles(repoPath, commit.SHA)
	if err != nil {
		t.Fatalf("GetCommitFiles(%s): %v", commit.SHA[:7], err)
	}
	t.Logf("files changed in commit: %d", len(files))
	for _, f := range files {
		t.Logf("  %s %s", f.StatusCode, f.Path)
	}
	if len(files) == 0 {
		t.Fatal("expected at least one file changed in the commit")
	}

	// Test diff for the first file — exercises the shallow-clone fallback path
	firstFile := files[0]
	diff, err := svc.GetCommitFileDiff(repoPath, commit.SHA, firstFile.Path)
	if err != nil {
		t.Fatalf("GetCommitFileDiff(%s, %s): %v", commit.SHA[:7], firstFile.Path, err)
	}
	t.Logf("diff for %s: oldLen=%d newLen=%d hunks=%d", firstFile.Path, len(diff.OldContent), len(diff.NewContent), len(diff.Hunks))
	if len(diff.NewContent) == 0 {
		t.Fatalf("GetCommitFileDiff: expected non-empty new content for %s", firstFile.Path)
	}
	if len(diff.Hunks) == 0 {
		t.Fatalf("GetCommitFileDiff: expected non-empty hunks for %s (diff viewer will show blank)", firstFile.Path)
	}
	// Hunks must start with diff --git so @git-diff-view/core can parse them
	if !strings.HasPrefix(diff.Hunks[0], "diff --git ") {
		t.Fatalf("GetCommitFileDiff: hunks[0] must start with 'diff --git', got: %.60q", diff.Hunks[0])
	}
}

// TestForgejoPRFileDiff verifies GetPRFiles + GetPRFileDiff against the first open PR.
func TestForgejoPRFileDiff(t *testing.T) {
	svc := newGitSvcWithAuth(t)
	repoPath := voyageBuildPath(t)

	prs, err := svc.ListPRs(repoPath, "open")
	if err != nil {
		t.Fatalf("ListPRs: %v", err)
	}
	if len(prs) == 0 {
		t.Skip("no open PRs to test against")
	}
	pr := prs[0]
	t.Logf("using PR #%d %q  %s → %s", pr.Number, pr.Title, pr.HeadBranch, pr.BaseBranch)

	files, err := svc.GetPRFiles(repoPath, pr.Number)
	if err != nil {
		t.Fatalf("GetPRFiles: %v", err)
	}
	t.Logf("files changed in PR: %d", len(files))
	for _, f := range files {
		t.Logf("  %s %s", f.StatusCode, f.Path)
	}
	if len(files) == 0 {
		t.Fatal("expected at least one file changed in the PR")
	}

	firstFile := files[0]
	diff, err := svc.GetPRFileDiff(repoPath, pr.BaseBranch, pr.HeadBranch, firstFile.Path)
	if err != nil {
		t.Fatalf("GetPRFileDiff(%s): %v", firstFile.Path, err)
	}
	t.Logf("PR file diff for %s: oldLen=%d newLen=%d hunks=%d",
		firstFile.Path, len(diff.OldContent), len(diff.NewContent), len(diff.Hunks))
	if len(diff.NewContent) == 0 && len(diff.OldContent) == 0 {
		t.Fatal("expected non-empty diff content")
	}
	if len(diff.Hunks) == 0 {
		t.Fatal("expected non-empty hunks (diff viewer will show blank without them)")
	}
	if !strings.HasPrefix(diff.Hunks[0], "diff --git ") {
		t.Fatalf("hunks[0] must start with 'diff --git', got: %.60q", diff.Hunks[0])
	}
}
