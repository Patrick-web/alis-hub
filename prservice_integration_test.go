//go:build alis_integration

// Live tests against the real Forgejo instance, keyed on an organisation and
// product rather than on a local checkout: the remote and the token both come
// from the alis CLI now, so these need no clone.
//
// Excluded from `go test ./...` by the alis_integration build tag. Run with:
//
//	go test -tags alis_integration -run TestForgejo -v .
//
// TestForgejoCreatePR writes: it opens a real pull request and closes it again
// in t.Cleanup. An earlier version of this file had no cleanup and left its PRs
// open on voyage/vp indefinitely.

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"
)

// The reference product. Override with ALIS_TEST_PRODUCT=<org>.<product>.
const (
	defaultTestOrg     = "voyage"
	defaultTestProduct = "vp"
)

func testProduct(t *testing.T) (org, product string) {
	t.Helper()
	if ref := os.Getenv("ALIS_TEST_PRODUCT"); ref != "" {
		org, product, ok := strings.Cut(ref, ".")
		if !ok {
			t.Fatalf("ALIS_TEST_PRODUCT must be <org>.<product>, got %q", ref)
		}
		return org, product
	}
	return defaultTestOrg, defaultTestProduct
}

// newPRSvc builds a service and skips unless it can actually reach the API.
//
// The check is a live call on purpose. The previous guard tested whether a
// ConsoleTokenSource was non-nil, which it almost always is: that constructor
// only fails when the home directory cannot be resolved, so a signed-out run
// failed instead of skipping.
func newPRSvc(t *testing.T) (*PRService, string, string) {
	t.Helper()
	org, product := testProduct(t)
	svc := NewPRService(NewCLIService())

	if _, err := svc.RepoInfo(org, product, "build"); err != nil {
		t.Skipf("cannot reach Forgejo for %s.%s (%v)", org, product, err)
	}
	return svc, org, product
}

func TestForgejoRepoInfo(t *testing.T) {
	svc, org, product := newPRSvc(t)

	for _, repo := range []string{"build", "define"} {
		info, err := svc.RepoInfo(org, product, repo)
		if err != nil {
			t.Fatalf("RepoInfo(%s): %v", repo, err)
		}
		if info.DefaultBranch == "" {
			t.Errorf("%s: DefaultBranch is empty", repo)
		}
		if !info.HasPullRequests {
			t.Errorf("%s: HasPullRequests is false", repo)
		}
		t.Logf("%s: default=%s mergeStyle=%s merge=%v rebase=%v squash=%v",
			repo, info.DefaultBranch, info.DefaultMergeStyle,
			info.AllowMerge, info.AllowRebase, info.AllowSquash)
	}
}

func TestForgejoPRsAvailable(t *testing.T) {
	svc, org, product := newPRSvc(t)

	ok, err := svc.PRsAvailable(org, product, "build")
	if err != nil {
		t.Fatalf("PRsAvailable: %v", err)
	}
	if !ok {
		t.Error("expected pull requests to be available")
	}

	// An unknown product must report a reason, not silently answer false: the UI
	// shows the reason instead of latching "unavailable" for the session.
	if _, err := svc.PRsAvailable(org, "no-such-product-xyz", "build"); err == nil {
		t.Error("expected an error for an unknown product")
	}
}

func TestForgejoCurrentUser(t *testing.T) {
	svc, org, product := newPRSvc(t)

	user, err := svc.CurrentUser(org, product, "build")
	if err != nil {
		t.Fatalf("CurrentUser: %v", err)
	}
	if user.Login == "" {
		t.Error("Login is empty; self-approval cannot be suppressed without it")
	}
	t.Logf("signed in as %s", user.Login)
}

func TestForgejoListPRs(t *testing.T) {
	svc, org, product := newPRSvc(t)

	list, err := svc.ListPRs(org, product, "build", "open")
	if err != nil {
		t.Fatalf("ListPRs: %v", err)
	}
	t.Logf("open PRs: %d (server total %d, truncated=%v)", len(list.PRs), list.Total, list.Truncated)
	for _, pr := range list.PRs {
		t.Logf("  #%d %q  %s → %s  mergeable=%v draft=%v files=%d +%d-%d",
			pr.Number, pr.Title, pr.HeadBranch, pr.BaseBranch,
			pr.Mergeable, pr.Draft, pr.ChangedFiles, pr.Additions, pr.Deletions)
	}
	// The list must not silently stop short of what the server reports.
	if list.Total > 0 && !list.Truncated && len(list.PRs) != list.Total {
		t.Errorf("collected %d of %d PRs but Truncated is false", len(list.PRs), list.Total)
	}
}

// Pagination is the whole point of the rewrite: the previous code asked for
// limit=100, which the server clamps to 50, and reported nothing missing.
func TestForgejoPaginationReadsPastOnePage(t *testing.T) {
	svc, org, product := newPRSvc(t)

	list, err := svc.ListPRs(org, product, "build", "all")
	if err != nil {
		t.Fatalf("ListPRs(all): %v", err)
	}

	// Find a PR big enough to need more than one page of files or commits.
	var big *ForgejoPR
	for i := range list.PRs {
		if list.PRs[i].ChangedFiles > forgejoPageSize || list.PRs[i].Comments > forgejoPageSize {
			big = &list.PRs[i]
			break
		}
	}
	if big == nil {
		t.Skipf("no PR with more than %d changed files to test paging against", forgejoPageSize)
	}
	t.Logf("using #%d, which reports %d changed files", big.Number, big.ChangedFiles)

	files, err := svc.GetPRFiles(org, product, "build", big.Number)
	if err != nil {
		t.Fatalf("GetPRFiles: %v", err)
	}
	if len(files.Files) <= forgejoPageSize {
		t.Errorf("got %d files, want more than one page (%d): pagination is not reading past page 1",
			len(files.Files), forgejoPageSize)
	}
	if files.Total > 0 && len(files.Files) < files.Total && !files.Truncated {
		t.Errorf("collected %d of %d files but Truncated is false", len(files.Files), files.Total)
	}
	t.Logf("collected %d files (server total %d)", len(files.Files), files.Total)

	commits, err := svc.GetPRCommits(org, product, "build", big.Number)
	if err != nil {
		t.Fatalf("GetPRCommits: %v", err)
	}
	t.Logf("collected %d commits (server total %d)", len(commits.Commits), commits.Total)
}

func TestForgejoPRDiff(t *testing.T) {
	svc, org, product := newPRSvc(t)

	list, err := svc.ListPRs(org, product, "build", "open")
	if err != nil {
		t.Fatalf("ListPRs: %v", err)
	}
	if len(list.PRs) == 0 {
		t.Skip("no open PRs to test against")
	}

	// Prefer a small PR: the point is the parse, not the transfer.
	pr := list.PRs[0]
	for _, candidate := range list.PRs {
		if candidate.ChangedFiles > 0 && candidate.ChangedFiles < pr.ChangedFiles {
			pr = candidate
		}
	}
	t.Logf("using #%d %q (%d files)", pr.Number, pr.Title, pr.ChangedFiles)

	diff, err := svc.GetPRDiff(org, product, "build", pr.Number)
	if err != nil {
		t.Fatalf("GetPRDiff: %v", err)
	}
	if diff.TooLarge {
		t.Skipf("diff is %d bytes, over the render limit", diff.Bytes)
	}
	if len(diff.Files) == 0 {
		t.Fatal("no files in the diff")
	}
	t.Logf("diff: %d bytes, %d files", diff.Bytes, len(diff.Files))

	for _, f := range diff.Files {
		if f.Path == "" {
			t.Error("a file in the diff has no path")
		}
		if f.Binary {
			continue
		}
		if len(f.Diff.Hunks) == 0 {
			t.Errorf("%s: no hunks, so the viewer would render it blank", f.Path)
			continue
		}
		// @git-diff-view/core parses each entry as a standalone diff.
		if !strings.HasPrefix(f.Diff.Hunks[0], "diff --git ") {
			t.Errorf("%s: hunks[0] must start with \"diff --git \", got %.60q", f.Path, f.Diff.Hunks[0])
		}
	}

	// The file list from the diff should agree with the API's own count.
	files, err := svc.GetPRFiles(org, product, "build", pr.Number)
	if err != nil {
		t.Fatalf("GetPRFiles: %v", err)
	}
	if len(files.Files) != len(diff.Files) {
		t.Errorf("diff has %d files, the files endpoint reports %d", len(diff.Files), len(files.Files))
	}
}

func TestForgejoCommitDiff(t *testing.T) {
	svc, org, product := newPRSvc(t)

	list, err := svc.ListPRs(org, product, "build", "open")
	if err != nil {
		t.Fatalf("ListPRs: %v", err)
	}
	if len(list.PRs) == 0 {
		t.Skip("no open PRs to test against")
	}

	commits, err := svc.GetPRCommits(org, product, "build", list.PRs[0].Number)
	if err != nil {
		t.Fatalf("GetPRCommits: %v", err)
	}
	if len(commits.Commits) == 0 {
		t.Fatal("expected at least one commit")
	}
	first := commits.Commits[0]
	t.Logf("commit %s %q by %s", first.SHA[:7], first.Message, first.Author)

	diff, err := svc.GetCommitDiff(org, product, "build", first.SHA)
	if err != nil {
		t.Fatalf("GetCommitDiff: %v", err)
	}
	if diff.TooLarge {
		t.Skipf("commit diff is %d bytes, over the render limit", diff.Bytes)
	}
	if len(diff.Files) == 0 {
		t.Fatal("no files in the commit diff")
	}
	t.Logf("commit diff: %d bytes, %d files", diff.Bytes, len(diff.Files))
}

func TestForgejoComments(t *testing.T) {
	svc, org, product := newPRSvc(t)

	list, err := svc.ListPRs(org, product, "build", "open")
	if err != nil {
		t.Fatalf("ListPRs: %v", err)
	}
	if len(list.PRs) == 0 {
		t.Skip("no open PRs to test against")
	}
	number := list.PRs[0].Number

	comments, err := svc.GetPRComments(org, product, "build", number)
	if err != nil {
		t.Fatalf("GetPRComments: %v", err)
	}
	t.Logf("#%d has %d comments (total %d)", number, len(comments.Comments), comments.Total)

	reviews, err := svc.GetPRReviews(org, product, "build", number)
	if err != nil {
		t.Fatalf("GetPRReviews: %v", err)
	}
	t.Logf("#%d has %d reviews", number, len(reviews))
	for _, r := range reviews {
		t.Logf("  %s by %s (%d inline comments, stale=%v)", r.State, r.Author, r.Comments, r.Stale)
		if r.Comments == 0 {
			continue
		}
		inline, err := svc.GetReviewComments(org, product, "build", number, r.ID)
		if err != nil {
			t.Errorf("GetReviewComments(%d): %v", r.ID, err)
			continue
		}
		for _, c := range inline {
			t.Logf("    %s:%d %.40q", c.Path, c.Line, c.Body)
		}
	}
}

// TestForgejoCreatePR opens a real pull request and closes it again.
func TestForgejoCreatePR(t *testing.T) {
	svc, org, product := newPRSvc(t)

	info, err := svc.RepoInfo(org, product, "build")
	if err != nil {
		t.Fatalf("RepoInfo: %v", err)
	}

	// Build the PR from an existing remote branch that is not the default one and
	// has no open PR into it already. Picking any non-default branch is not
	// enough: the busiest branch is usually the one that already has a PR open
	// against the default branch, so the create would be rejected as a duplicate
	// and the test would skip itself every run.
	list, err := svc.ListPRs(org, product, "build", "all")
	if err != nil {
		t.Fatalf("ListPRs: %v", err)
	}
	taken := map[string]bool{}
	for _, pr := range list.PRs {
		if pr.State == "open" && pr.BaseBranch == info.DefaultBranch {
			taken[pr.HeadBranch] = true
		}
	}
	head := ""
	for _, pr := range list.PRs {
		if pr.HeadBranch == info.DefaultBranch || pr.HeadRepo != "" || taken[pr.HeadBranch] {
			continue
		}
		head = pr.HeadBranch
		break
	}
	if head == "" {
		t.Skip("no branch without an existing pull request into the default branch")
	}
	t.Logf("opening %s → %s", head, info.DefaultBranch)

	title := "alis-hub integration test, safe to close"
	pr, err := svc.CreatePR(org, product, "build", title,
		"Opened by TestForgejoCreatePR. Closed automatically when the test finishes.",
		head, info.DefaultBranch)
	if err != nil {
		// A PR for this pair may already be open, which is a pass for the create
		// path: the conflict is reported as a sentence rather than swallowed.
		if strings.Contains(err.Error(), "already exists") {
			t.Skipf("a pull request for %s → %s is already open", head, info.DefaultBranch)
		}
		t.Fatalf("CreatePR: %v", err)
	}
	t.Logf("created #%d %q  %s → %s", pr.Number, pr.Title, pr.HeadBranch, pr.BaseBranch)

	// Close it however the test ends, so the repo is not left with test litter.
	t.Cleanup(func() {
		if err := closePR(svc, org, product, "build", pr.Number); err != nil {
			t.Errorf("could not close #%d, close it by hand: %v", pr.Number, err)
			return
		}
		t.Logf("closed #%d", pr.Number)
	})

	if pr.Number == 0 {
		t.Error("created PR has no number")
	}
	if pr.HTMLURL == "" {
		t.Error("created PR has no html url; the UI links out with it")
	}

	// A duplicate must come back as a readable conflict, not an opaque 409.
	_, err = svc.CreatePR(org, product, "build", title, "duplicate", head, info.DefaultBranch)
	if err == nil {
		t.Error("expected a duplicate pull request to be rejected")
	} else if !strings.Contains(err.Error(), "already exists") {
		t.Errorf("duplicate error = %q, want it to say the PR already exists", err)
	}
}

func TestForgejoMergeStyleValidation(t *testing.T) {
	svc, org, product := newPRSvc(t)

	// Rejected before any request goes out, so this cannot merge anything.
	err := svc.MergePR(org, product, "build", 999999, "fast-forward", false)
	if err == nil {
		t.Fatal("expected an unknown merge style to be rejected")
	}
	if !strings.Contains(err.Error(), "merge style") {
		t.Errorf("error = %q, want it to name the invalid merge style", err)
	}
}

func TestForgejoNotFoundIsTyped(t *testing.T) {
	svc, org, product := newPRSvc(t)

	_, err := svc.GetPR(org, product, "build", 999999)
	if err == nil {
		t.Fatal("expected an error for a nonexistent PR")
	}
	if !IsNotFound(err) {
		t.Errorf("IsNotFound = false for %v, want true", err)
	}
}

// TestForgejoTimeline reads the conversation timeline for the first open PR and
// logs what came back, so the exact event types and field mapping can be checked
// against the live instance rather than assumed from the swagger docs.
func TestForgejoTimeline(t *testing.T) {
	svc, org, product := newPRSvc(t)

	list, err := svc.ListPRs(org, product, "build", "open")
	if err != nil {
		t.Fatalf("ListPRs: %v", err)
	}
	if len(list.PRs) == 0 {
		t.Skip("no open PRs to test against")
	}
	number := list.PRs[0].Number

	timeline, err := svc.GetPRTimeline(org, product, "build", number)
	if err != nil {
		t.Fatalf("GetPRTimeline: %v", err)
	}
	t.Logf("#%d has %d timeline events (total %d)", number, len(timeline.Events), timeline.Total)
	for _, ev := range timeline.Events {
		switch ev.Type {
		case "comment":
			t.Logf("  comment %d by %s: %.40q", ev.ID, ev.Author, ev.Body)
		case "commit":
			t.Logf("  commit %s by %s: %.40q (action=%s)", ev.SHA, ev.Author, ev.Message, ev.RefAction)
		case "review":
			t.Logf("  review %d by %s: %.40q", ev.ReviewID, ev.Author, ev.Body)
		default:
			t.Logf("  %s by %s (action=%s, old=%q new=%q)", ev.Type, ev.Author, ev.RefAction, ev.OldRef+ev.OldTitle, ev.NewRef+ev.NewTitle)
		}
	}
}

// closePR closes a pull request, used to clean up after the create test.
func closePR(svc *PRService, org, product, repo string, number int) error {
	t, err := svc.client.resolve(org, product, repo)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), prCallTimeout)
	defer cancel()

	body, err := json.Marshal(map[string]string{"state": "closed"})
	if err != nil {
		return err
	}
	_, _, err = svc.client.do(ctx, t, http.MethodPatch,
		fmt.Sprintf("repos/%s/pulls/%d", t.repoPath(), number), body)
	return err
}
