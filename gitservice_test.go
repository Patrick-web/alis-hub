package main

import (
	"os"
	"path/filepath"
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

	prs, err := svc.ListPRs(repoPath)
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
