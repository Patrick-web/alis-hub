package main

// Pull request feature, backed by the Forgejo REST API.
//
// Split out of GitService for two reasons. Its source of truth is different:
// every method keys on (organisation, product, repo) and resolves the remote
// through the alis CLI, so nothing here needs a local clone, whereas
// GitService is entirely about the working tree. And its credential path is
// different: see the header of forgejo.go.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"alis-hub-v3/internal/cliwrap"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// prCallTimeout bounds one PR operation end to end, including a token mint.
// Tighter than cliwrap.DefaultTimeout on purpose: these calls sit directly
// behind a spinner in the UI.
const prCallTimeout = 60 * time.Second

// prDiffSizeLimit caps a PR diff we are willing to pull over the bridge and
// parse. For scale, the largest open PR on the reference instance (226 changed
// files) is 1.4MB.
const prDiffSizeLimit = 8 << 20

// PRService exposes pull request operations to the frontend.
type PRService struct {
	client *ForgejoClient
	app    *application.App
}

func NewPRService(cli *CLIService) *PRService {
	return &PRService{client: NewForgejoClient(cli)}
}

func (s *PRService) SetApp(app *application.App) { s.app = app }

// --- wire types ---

// ForgejoPR is a pull request. The fields beyond the obvious ones are all
// present in the list payload and were previously discarded, which is why the
// UI could not tell a draft from a conflict or show a diffstat.
type ForgejoPR struct {
	Number             int      `json:"number"`
	Title              string   `json:"title"`
	Body               string   `json:"body"`
	State              string   `json:"state"`
	HeadBranch         string   `json:"headBranch"`
	BaseBranch         string   `json:"baseBranch"`
	HeadRepo           string   `json:"headRepo"` // set when the PR comes from a fork
	Author             string   `json:"author"`
	HTMLURL            string   `json:"htmlUrl"`
	CreatedAt          string   `json:"createdAt"`
	UpdatedAt          string   `json:"updatedAt"`
	Mergeable          bool     `json:"mergeable"`
	Draft              bool     `json:"draft"`
	Merged             bool     `json:"merged"`
	ChangedFiles       int      `json:"changedFiles"`
	Additions          int      `json:"additions"`
	Deletions          int      `json:"deletions"`
	Comments           int      `json:"comments"`
	ReviewComments     int      `json:"reviewComments"`
	Assignees          []string `json:"assignees"`
	RequestedReviewers []string `json:"requestedReviewers"`
	MergeBase          string   `json:"mergeBase"`
}

// PRList is a page-complete list of pull requests. Total and Truncated exist so
// a short read can be labelled rather than passed off as everything.
type PRList struct {
	PRs       []ForgejoPR `json:"prs"`
	Total     int         `json:"total"`
	Truncated bool        `json:"truncated"`
}

// PRCommit is a commit included in a pull request.
type PRCommit struct {
	SHA       string `json:"sha"`
	Message   string `json:"message"`
	Author    string `json:"author"`
	Timestamp string `json:"timestamp"`
}

type PRCommitList struct {
	Commits   []PRCommit `json:"commits"`
	Total     int        `json:"total"`
	Truncated bool       `json:"truncated"`
}

// PRAttachment is a file or image attached to a pull request comment.
type PRAttachment struct {
	ID                 int    `json:"id"`
	Name               string `json:"name"`
	Size               int64  `json:"size"`
	UUID               string `json:"uuid"`
	BrowserDownloadURL string `json:"browserDownloadUrl"`
	CreatedAt          string `json:"createdAt"`
}

// PRComment is a conversation comment on a pull request.
type PRComment struct {
	ID        int             `json:"id"`
	Body      string          `json:"body"`
	Author    string          `json:"author"`
	CreatedAt string          `json:"createdAt"`
	UpdatedAt string          `json:"updatedAt"`
	HTMLURL   string          `json:"htmlUrl"`
	Assets    []PRAttachment  `json:"assets"`
}

type PRCommentList struct {
	Comments  []PRComment `json:"comments"`
	Total     int         `json:"total"`
	Truncated bool        `json:"truncated"`
}

// PRTimelineEvent is one entry in a pull request's conversation timeline.
// Forgejo's timeline endpoint returns comments, commits, reviews and ref events
// already interleaved in the order they happened, so the frontend renders them
// as a single stream the way Forgejo and GitHub do instead of grouping them by
// kind. Type carries the raw CommentType word ("comment", "commit", "review",
// "close", "reopen", "merge", …); the commit and review fields below are only
// populated for the entries that have them.
type PRTimelineEvent struct {
	ID        int    `json:"id"`
	Type      string `json:"type"`
	Author    string `json:"author"`
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
	HTMLURL   string `json:"htmlUrl"`

	// Commit entries: the SHA in sha and the message in message (the timeline's
	// body field doubles as the message for commit entries).
	SHA     string `json:"sha"`
	Message string `json:"message"`

	// Review entries.
	ReviewID int `json:"reviewId"`

	// Ref and other events, used to describe what happened without a body.
	RefAction string `json:"refAction"`
	OldRef    string `json:"oldRef"`
	NewRef    string `json:"newRef"`
	OldTitle  string `json:"oldTitle"`
	NewTitle  string `json:"newTitle"`
}

type PRTimelineList struct {
	Events    []PRTimelineEvent `json:"events"`
	Total     int               `json:"total"`
	Truncated bool              `json:"truncated"`
}

type PRFileList struct {
	Files     []CommitFile `json:"files"`
	Total     int          `json:"total"`
	Truncated bool         `json:"truncated"`
}

// PRReview is one submitted review.
type PRReview struct {
	ID          int    `json:"id"`
	Author      string `json:"author"`
	State       string `json:"state"` // APPROVED | REQUEST_CHANGES | COMMENT | PENDING
	Body        string `json:"body"`
	SubmittedAt string `json:"submittedAt"`
	Comments    int    `json:"comments"`
	Stale       bool   `json:"stale"`
	Official    bool   `json:"official"`
}

// PRReviewComment is a review comment anchored to a line of the diff.
type PRReviewComment struct {
	ID        int    `json:"id"`
	ReviewID  int    `json:"reviewId"`
	Author    string `json:"author"`
	Body      string `json:"body"`
	Path      string `json:"path"`
	Line      int    `json:"line"`     // position in the new file
	OldLine   int    `json:"oldLine"`  // position in the old file
	DiffHunk  string `json:"diffHunk"` // context Forgejo captured at comment time
	CreatedAt string `json:"createdAt"`
}

// ReviewDraftComment is an inline comment submitted as part of a review.
type ReviewDraftComment struct {
	Path        string `json:"path"`
	Body        string `json:"body"`
	NewPosition int    `json:"newPosition"`
}

// PRDiffFile is one file's slice of a pull request's unified diff. Diff is the
// shape GitDiffViewer already consumes, so the viewer needs no changes.
type PRDiffFile struct {
	Path       string      `json:"path"`
	OldPath    string      `json:"oldPath"`
	StatusCode string      `json:"statusCode"`
	Binary     bool        `json:"binary"`
	Diff       GitFileDiff `json:"diff"`
}

// PRDiff is a whole pull request's diff, split per file. One request replaces
// the previous per-file round trip through a local clone.
type PRDiff struct {
	Files    []PRDiffFile `json:"files"`
	Bytes    int          `json:"bytes"`
	TooLarge bool         `json:"tooLarge"`
}

// PRRepoInfo carries the repository settings the PR UI needs: what to default
// the base branch to, and which merge styles the repo actually permits.
type PRRepoInfo struct {
	DefaultBranch     string `json:"defaultBranch"`
	DefaultMergeStyle string `json:"defaultMergeStyle"`
	AllowMerge        bool   `json:"allowMerge"`
	AllowRebase       bool   `json:"allowRebase"`
	AllowSquash       bool   `json:"allowSquash"`
	DeleteBranchAfter bool   `json:"deleteBranchAfter"`
	HasPullRequests   bool   `json:"hasPullRequests"`
	HTMLURL           string `json:"htmlUrl"`
}

// PRUser is the signed-in Forgejo identity, needed to suppress self-approval.
type PRUser struct {
	Login    string `json:"login"`
	FullName string `json:"fullName"`
}

// --- raw API shapes ---
//
// Named once rather than re-declared per call site: ListPRs and CreatePR used
// to carry byte-identical anonymous structs.

type rawPR struct {
	Number int    `json:"number"`
	Title  string `json:"title"`
	Body   string `json:"body"`
	State  string `json:"state"`
	Head   struct {
		Ref  string `json:"ref"`
		Repo *struct {
			FullName string `json:"full_name"`
		} `json:"repo"`
	} `json:"head"`
	Base struct {
		Ref  string `json:"ref"`
		Repo *struct {
			FullName string `json:"full_name"`
		} `json:"repo"`
	} `json:"base"`
	User struct {
		Login string `json:"login"`
	} `json:"user"`
	Assignee *struct {
		Login string `json:"login"`
	} `json:"assignee"`
	Assignees []struct {
		Login string `json:"login"`
	} `json:"assignees"`
	RequestedReviewers []struct {
		Login string `json:"login"`
	} `json:"requested_reviewers"`
	HTMLURL        string `json:"html_url"`
	CreatedAt      string `json:"created_at"`
	UpdatedAt      string `json:"updated_at"`
	Mergeable      bool   `json:"mergeable"`
	Draft          bool   `json:"draft"`
	Merged         bool   `json:"merged"`
	ChangedFiles   int    `json:"changed_files"`
	Additions      int    `json:"additions"`
	Deletions      int    `json:"deletions"`
	Comments       int    `json:"comments"`
	ReviewComments int    `json:"review_comments"`
	MergeBase      string `json:"merge_base"`
}

func (r rawPR) toPR() ForgejoPR {
	pr := ForgejoPR{
		Number:         r.Number,
		Title:          r.Title,
		Body:           r.Body,
		State:          r.State,
		HeadBranch:     r.Head.Ref,
		BaseBranch:     r.Base.Ref,
		Author:         r.User.Login,
		HTMLURL:        r.HTMLURL,
		CreatedAt:      r.CreatedAt,
		UpdatedAt:      r.UpdatedAt,
		Mergeable:      r.Mergeable,
		Draft:          r.Draft,
		Merged:         r.Merged,
		ChangedFiles:   r.ChangedFiles,
		Additions:      r.Additions,
		Deletions:      r.Deletions,
		Comments:       r.Comments,
		ReviewComments: r.ReviewComments,
		MergeBase:      r.MergeBase,
	}
	// Only meaningful when it differs from the base: a same-repo PR needs no
	// fork labelling, and the diff path treats a set HeadRepo as "not ours".
	if r.Head.Repo != nil && r.Base.Repo != nil && r.Head.Repo.FullName != r.Base.Repo.FullName {
		pr.HeadRepo = r.Head.Repo.FullName
	}
	pr.RequestedReviewers = make([]string, 0, len(r.RequestedReviewers))
	for _, rev := range r.RequestedReviewers {
		pr.RequestedReviewers = append(pr.RequestedReviewers, rev.Login)
	}
	// Forgejo still returns the pre-multi-assignee `assignee` field alongside the
	// list, and older PRs can carry only that one.
	pr.Assignees = make([]string, 0, len(r.Assignees))
	for _, a := range r.Assignees {
		pr.Assignees = append(pr.Assignees, a.Login)
	}
	if len(pr.Assignees) == 0 && r.Assignee != nil && r.Assignee.Login != "" {
		pr.Assignees = append(pr.Assignees, r.Assignee.Login)
	}
	return pr
}

type rawComment struct {
	ID   int    `json:"id"`
	Body string `json:"body"`
	User struct {
		Login string `json:"login"`
	} `json:"user"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
	HTMLURL   string          `json:"html_url"`
	Assets    []rawAttachment `json:"assets"`
}

type rawAttachment struct {
	ID                 int64  `json:"id"`
	Name               string `json:"name"`
	Size               int64  `json:"size"`
	UUID               string `json:"uuid"`
	BrowserDownloadURL string `json:"browser_download_url"`
	CreatedAt          string `json:"created_at"`
}

// rawTimelineEvent is one entry of Forgejo's issue timeline. The endpoint is
// heterogenous: every entry shares id/type/body/user/created_at, and the rest
// of the fields are only present on the comment types that use them.
type rawTimelineEvent struct {
	ID   int    `json:"id"`
	Type string `json:"type"`
	User struct {
		Login string `json:"login"`
	} `json:"user"`
	Body      string `json:"body"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
	HTMLURL   string `json:"html_url"`

	RefAction string `json:"ref_action"`
	ReviewID  int    `json:"review_id"`

	OldRef   string `json:"old_ref"`
	NewRef   string `json:"new_ref"`
	OldTitle string `json:"old_title"`
	NewTitle string `json:"new_title"`
}

// toEvent normalises one timeline entry. Commit entries are not produced here:
// GetPRTimeline expands push events into "commit" entries itself, so the shared
// fields below are all a generic entry needs.
func (r rawTimelineEvent) toEvent() PRTimelineEvent {
	return PRTimelineEvent{
		ID:        r.ID,
		Type:      r.Type,
		Author:    r.User.Login,
		Body:      r.Body,
		CreatedAt: r.CreatedAt,
		HTMLURL:   r.HTMLURL,
		ReviewID:  r.ReviewID,
		RefAction: r.RefAction,
		OldRef:    r.OldRef,
		NewRef:    r.NewRef,
		OldTitle:  r.OldTitle,
		NewTitle:  r.NewTitle,
	}
}

// --- helpers ---

func (s *PRService) ctx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), prCallTimeout)
}

// fail reports an error to the caller, first raising auth:expired when the
// cause is an expired session. push/pull/fetch already emit this and
// RootLayout already listens; the PR path used to swallow it, so an expired
// session rendered as "No open PRs".
//
// Two different rejections mean the same thing to the user. Forgejo answers 401
// when the token it was handed is dead, and the CLI exits 4 when it cannot mint
// one at all because the alis session itself is gone.
func (s *PRService) fail(err error) error {
	if isAuthFailure(err) && s.app != nil {
		s.app.Event.Emit("auth:expired")
	}
	return err
}

// isAuthFailure reports whether err means "sign in again", from either side.
func isAuthFailure(err error) bool {
	return IsUnauthorized(err) || errors.Is(err, &cliwrap.ErrUnauthenticated{})
}

// target resolves a product's repo, mapping resolution failures through fail so
// an expired CLI session surfaces the same way an expired API session does.
func (s *PRService) target(org, product, repo string) (forgejoTarget, error) {
	t, err := s.client.resolve(org, product, repo)
	if err != nil {
		return forgejoTarget{}, s.fail(err)
	}
	return t, nil
}

// InvalidateProduct drops cached remotes for a product. Called when the
// workspace switches products.
func (s *PRService) InvalidateProduct(org, product string) {
	s.client.InvalidateProduct(org, product)
}

// --- availability ---

// PRsAvailable reports whether the repo is an Alis-hosted Forgejo repo with
// pull requests enabled. Unlike the IsForgejo it replaces, this asks the CLI and
// the server rather than a local clone, and returns the reason on failure so the
// UI can show it instead of latching "not available" forever.
func (s *PRService) PRsAvailable(org, product, repo string) (bool, error) {
	info, err := s.RepoInfo(org, product, repo)
	if err != nil {
		return false, err
	}
	return info.HasPullRequests, nil
}

// RepoInfo returns the repository settings the PR UI needs.
func (s *PRService) RepoInfo(org, product, repo string) (*PRRepoInfo, error) {
	t, err := s.target(org, product, repo)
	if err != nil {
		return nil, err
	}
	ctx, cancel := s.ctx()
	defer cancel()

	var raw struct {
		DefaultBranch     string `json:"default_branch"`
		DefaultMergeStyle string `json:"default_merge_style"`
		AllowMerge        bool   `json:"allow_merge_commits"`
		AllowRebase       bool   `json:"allow_rebase"`
		AllowSquash       bool   `json:"allow_squash_merge"`
		DeleteBranchAfter bool   `json:"default_delete_branch_after_merge"`
		HasPullRequests   bool   `json:"has_pull_requests"`
		HTMLURL           string `json:"html_url"`
	}
	if err := s.client.getJSON(ctx, t, "repos/"+t.repoPath(), &raw); err != nil {
		return nil, s.fail(err)
	}
	return &PRRepoInfo{
		DefaultBranch:     raw.DefaultBranch,
		DefaultMergeStyle: raw.DefaultMergeStyle,
		AllowMerge:        raw.AllowMerge,
		AllowRebase:       raw.AllowRebase,
		AllowSquash:       raw.AllowSquash,
		DeleteBranchAfter: raw.DeleteBranchAfter,
		HasPullRequests:   raw.HasPullRequests,
		HTMLURL:           raw.HTMLURL,
	}, nil
}

// CurrentUser returns the signed-in Forgejo identity.
func (s *PRService) CurrentUser(org, product, repo string) (*PRUser, error) {
	t, err := s.target(org, product, repo)
	if err != nil {
		return nil, err
	}
	ctx, cancel := s.ctx()
	defer cancel()

	var raw struct {
		Login    string `json:"login"`
		FullName string `json:"full_name"`
	}
	if err := s.client.getJSON(ctx, t, "user", &raw); err != nil {
		return nil, s.fail(err)
	}
	return &PRUser{Login: raw.Login, FullName: raw.FullName}, nil
}

// --- pull requests ---

// ListPRs returns pull requests for a product's repo. state is "open",
// "closed", or "all"; it defaults to "open".
func (s *PRService) ListPRs(org, product, repo, state string) (*PRList, error) {
	t, err := s.target(org, product, repo)
	if err != nil {
		return nil, err
	}
	if state == "" {
		state = "open"
	}
	ctx, cancel := s.ctx()
	defer cancel()

	raws, meta, err := forgejoList[rawPR](ctx, s.client, t,
		fmt.Sprintf("repos/%s/pulls?state=%s", t.repoPath(), state))
	if err != nil {
		return nil, s.fail(err)
	}
	prs := make([]ForgejoPR, len(raws))
	for i, r := range raws {
		prs[i] = r.toPR()
	}
	return &PRList{PRs: prs, Total: meta.Total, Truncated: meta.Truncated}, nil
}

// GetPR fetches a single pull request. The list endpoint's view of mergeability
// and counts goes stale as soon as anyone pushes, so the detail view refetches
// rather than trusting what the list said when it was opened.
func (s *PRService) GetPR(org, product, repo string, number int) (*ForgejoPR, error) {
	t, err := s.target(org, product, repo)
	if err != nil {
		return nil, err
	}
	ctx, cancel := s.ctx()
	defer cancel()

	var raw rawPR
	if err := s.client.getJSON(ctx, t, fmt.Sprintf("repos/%s/pulls/%d", t.repoPath(), number), &raw); err != nil {
		return nil, s.fail(err)
	}
	pr := raw.toPR()
	return &pr, nil
}

// CreatePR opens a pull request. head and base are branch names.
func (s *PRService) CreatePR(org, product, repo, title, body, head, base string) (*ForgejoPR, error) {
	t, err := s.target(org, product, repo)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(title) == "" {
		return nil, fmt.Errorf("title is required")
	}
	if head == base {
		return nil, fmt.Errorf("head and base must differ (both are %q)", head)
	}
	ctx, cancel := s.ctx()
	defer cancel()

	var raw rawPR
	in := map[string]string{"title": title, "body": body, "head": head, "base": base}
	if err := s.client.postJSON(ctx, t, "repos/"+t.repoPath()+"/pulls", in, &raw); err != nil {
		if IsConflict(err) {
			return nil, fmt.Errorf("a pull request for %s into %s already exists", head, base)
		}
		return nil, s.fail(err)
	}
	pr := raw.toPR()
	return &pr, nil
}

// MergePR merges a pull request. style is "merge", "rebase", or "squash", and is
// checked against what the repo permits before the request goes out.
func (s *PRService) MergePR(org, product, repo string, number int, style string, deleteBranch bool) error {
	t, err := s.target(org, product, repo)
	if err != nil {
		return err
	}
	info, err := s.RepoInfo(org, product, repo)
	if err != nil {
		return err
	}
	if err := validateMergeStyle(style, info); err != nil {
		return err
	}
	ctx, cancel := s.ctx()
	defer cancel()

	// "Do" is the field's real JSON name in the Forgejo API, not a Go export
	// artefact.
	in := map[string]any{"Do": style, "delete_branch_after_merge": deleteBranch}
	if err := s.client.postJSON(ctx, t, fmt.Sprintf("repos/%s/pulls/%d/merge", t.repoPath(), number), in, nil); err != nil {
		return s.fail(err)
	}
	return nil
}

// validateMergeStyle rejects a style the repo does not allow, so the failure
// reads as a sentence instead of a 405 from Forgejo.
func validateMergeStyle(style string, info *PRRepoInfo) error {
	switch style {
	case "merge":
		if !info.AllowMerge {
			return fmt.Errorf("this repo does not allow merge commits")
		}
	case "rebase":
		if !info.AllowRebase {
			return fmt.Errorf("this repo does not allow rebase merges")
		}
	case "squash":
		if !info.AllowSquash {
			return fmt.Errorf("this repo does not allow squash merges")
		}
	default:
		return fmt.Errorf("merge style must be \"merge\", \"rebase\" or \"squash\", got %q", style)
	}
	return nil
}

// wipPrefixes are the title markers Forgejo reads as "draft". Draft state is not
// a separate field to flip: the API derives it from the title, so taking a PR out
// of draft means rewriting the title.
//
// These are Forgejo's defaults (WORK_IN_PROGRESS_PREFIXES). Deliberately no bare
// "WIP" entry: it would strip the first three characters of any title that merely
// begins with those letters.
var wipPrefixes = []string{"WIP:", "[WIP]"}

// SetPRReady takes a draft out of draft by stripping the WIP marker from its
// title. It refuses rather than guessing when there is no marker to strip, so it
// can never silently rename a PR.
func (s *PRService) SetPRReady(org, product, repo string, number int) (*ForgejoPR, error) {
	t, err := s.target(org, product, repo)
	if err != nil {
		return nil, err
	}
	pr, err := s.GetPR(org, product, repo, number)
	if err != nil {
		return nil, err
	}
	title, ok := stripWIPPrefix(pr.Title)
	if !ok {
		return nil, fmt.Errorf("this pull request is not marked as a draft")
	}

	ctx, cancel := s.ctx()
	defer cancel()

	var raw rawPR
	in := map[string]string{"title": title}
	if err := s.client.patchJSON(ctx, t, fmt.Sprintf("repos/%s/pulls/%d", t.repoPath(), number), in, &raw); err != nil {
		return nil, s.fail(err)
	}
	updated := raw.toPR()
	return &updated, nil
}

// stripWIPPrefix removes a leading draft marker, reporting whether one was
// found.
func stripWIPPrefix(title string) (string, bool) {
	trimmed := strings.TrimSpace(title)
	for _, p := range wipPrefixes {
		if len(trimmed) < len(p) || !strings.EqualFold(trimmed[:len(p)], p) {
			continue
		}
		rest := strings.TrimSpace(trimmed[len(p):])
		if rest != "" {
			return rest, true
		}
	}
	return title, false
}

// --- commits, files, diffs ---

type rawPRCommit struct {
	SHA    string `json:"sha"`
	Commit struct {
		Message string `json:"message"`
		Author  struct {
			Name string `json:"name"`
			Date string `json:"date"`
		} `json:"author"`
	} `json:"commit"`
}

// prCommits fetches the commits in a pull request. Shared by GetPRCommits and
// GetPRTimeline, which needs the same list to expand push events into one
// timeline entry per commit.
func (s *PRService) prCommits(ctx context.Context, t forgejoTarget, number int) ([]PRCommit, listMeta, error) {
	raws, meta, err := forgejoList[rawPRCommit](ctx, s.client, t,
		fmt.Sprintf("repos/%s/pulls/%d/commits", t.repoPath(), number))
	if err != nil {
		return nil, meta, err
	}
	commits := make([]PRCommit, len(raws))
	for i, r := range raws {
		msg := r.Commit.Message
		if idx := strings.IndexByte(msg, '\n'); idx >= 0 {
			msg = msg[:idx]
		}
		commits[i] = PRCommit{
			SHA:       r.SHA,
			Message:   msg,
			Author:    r.Commit.Author.Name,
			Timestamp: r.Commit.Author.Date,
		}
	}
	return commits, meta, nil
}

// GetPRCommits returns the commits in a pull request.
func (s *PRService) GetPRCommits(org, product, repo string, number int) (*PRCommitList, error) {
	t, err := s.target(org, product, repo)
	if err != nil {
		return nil, err
	}
	ctx, cancel := s.ctx()
	defer cancel()

	commits, meta, err := s.prCommits(ctx, t, number)
	if err != nil {
		return nil, s.fail(err)
	}
	return &PRCommitList{Commits: commits, Total: meta.Total, Truncated: meta.Truncated}, nil
}

// GetPRFiles returns the files changed in a pull request.
func (s *PRService) GetPRFiles(org, product, repo string, number int) (*PRFileList, error) {
	t, err := s.target(org, product, repo)
	if err != nil {
		return nil, err
	}
	ctx, cancel := s.ctx()
	defer cancel()

	type rawFile struct {
		Filename string `json:"filename"`
		Status   string `json:"status"`
		OldName  string `json:"previous_filename"`
	}
	raws, meta, err := forgejoList[rawFile](ctx, s.client, t,
		fmt.Sprintf("repos/%s/pulls/%d/files", t.repoPath(), number))
	if err != nil {
		return nil, s.fail(err)
	}
	files := make([]CommitFile, len(raws))
	for i, r := range raws {
		files[i] = CommitFile{Path: r.Filename, StatusCode: forgejoStatusCode(r.Status), OldPath: r.OldName}
	}
	return &PRFileList{Files: files, Total: meta.Total, Truncated: meta.Truncated}, nil
}

// forgejoStatusCode maps the API's status words onto the single-letter codes the
// rest of the UI already colours.
func forgejoStatusCode(status string) string {
	switch status {
	case "added":
		return "A"
	case "deleted", "removed":
		return "D"
	case "renamed":
		return "R"
	case "copied":
		return "C"
	default:
		return "M"
	}
}

// GetPRDiff returns the whole pull request diff, split per file.
//
// One request, and no local clone: the previous implementation ran
// `git diff origin/base...origin/head` per file, which needed the repo cloned
// with both branches present on origin, silently produced an empty diff for a
// fork PR, and returned a nil error however badly it failed.
func (s *PRService) GetPRDiff(org, product, repo string, number int) (*PRDiff, error) {
	t, err := s.target(org, product, repo)
	if err != nil {
		return nil, err
	}
	ctx, cancel := s.ctx()
	defer cancel()

	raw, err := s.client.getRaw(ctx, t, fmt.Sprintf("repos/%s/pulls/%d.diff", t.repoPath(), number))
	if err != nil {
		return nil, s.fail(err)
	}
	if len(raw) > prDiffSizeLimit {
		return &PRDiff{Bytes: len(raw), TooLarge: true}, nil
	}
	return &PRDiff{Files: splitUnifiedDiff(string(raw)), Bytes: len(raw)}, nil
}

// GetCommitDiff returns one commit's diff, split per file, for the Commits tab.
func (s *PRService) GetCommitDiff(org, product, repo, sha string) (*PRDiff, error) {
	t, err := s.target(org, product, repo)
	if err != nil {
		return nil, err
	}
	if sha == "" {
		return nil, fmt.Errorf("commit sha is required")
	}
	ctx, cancel := s.ctx()
	defer cancel()

	raw, err := s.client.getRaw(ctx, t, fmt.Sprintf("repos/%s/git/commits/%s.diff", t.repoPath(), sha))
	if err != nil {
		return nil, s.fail(err)
	}
	if len(raw) > prDiffSizeLimit {
		return &PRDiff{Bytes: len(raw), TooLarge: true}, nil
	}
	return &PRDiff{Files: splitUnifiedDiff(string(raw)), Bytes: len(raw)}, nil
}

// --- conversation ---

// toComment converts a raw issue comment to the wire shape, including its
// attachments so the conversation tab can render images and file links.
func (r rawComment) toComment() PRComment {
	assets := make([]PRAttachment, 0, len(r.Assets))
	for _, a := range r.Assets {
		assets = append(assets, PRAttachment{
			ID:                 int(a.ID),
			Name:               a.Name,
			Size:               a.Size,
			UUID:               a.UUID,
			BrowserDownloadURL: a.BrowserDownloadURL,
			CreatedAt:          a.CreatedAt,
		})
	}
	return PRComment{
		ID:        r.ID,
		Body:      r.Body,
		Author:    r.User.Login,
		CreatedAt: r.CreatedAt,
		UpdatedAt: r.UpdatedAt,
		HTMLURL:   r.HTMLURL,
		Assets:    assets,
	}
}

// GetPRComments returns the conversation comments on a pull request.
func (s *PRService) GetPRComments(org, product, repo string, number int) (*PRCommentList, error) {
	t, err := s.target(org, product, repo)
	if err != nil {
		return nil, err
	}
	ctx, cancel := s.ctx()
	defer cancel()

	raws, meta, err := forgejoList[rawComment](ctx, s.client, t,
		fmt.Sprintf("repos/%s/issues/%d/comments", t.repoPath(), number))
	if err != nil {
		return nil, s.fail(err)
	}
	comments := make([]PRComment, len(raws))
	for i, r := range raws {
		comments[i] = r.toComment()
	}
	return &PRCommentList{Comments: comments, Total: meta.Total, Truncated: meta.Truncated}, nil
}

// GetPRTimeline returns the pull request's conversation as one time-ordered
// stream of comments, commits, reviews and ref events, exactly as Forgejo
// presents it. The per-kind endpoints only tell part of the story: comments
// and commits are separate calls, so a timeline built from them would put every
// commit ahead of every comment regardless of when each actually happened.
//
// Forgejo's timeline records a push as a single "pull_push" entry whose body is
// a JSON array of commit IDs, not as one entry per commit. Forgejo's own UI
// expands that into individual commits (LoadPushCommits), so this does the same
// here: each commit becomes a "commit" event carrying its own message, author
// and timestamp, and the whole stream is re-sorted so commits interleave with
// the comments around them.
func (s *PRService) GetPRTimeline(org, product, repo string, number int) (*PRTimelineList, error) {
	t, err := s.target(org, product, repo)
	if err != nil {
		return nil, err
	}
	ctx, cancel := s.ctx()
	defer cancel()

	raws, meta, err := forgejoList[rawTimelineEvent](ctx, s.client, t,
		fmt.Sprintf("repos/%s/issues/%d/timeline", t.repoPath(), number))
	if err != nil {
		return nil, s.fail(err)
	}

	// The commit list is only needed to flesh out push events; a failure here
	// must not take the whole conversation down, so it degrades to unexpanded
	// events rather than an error.
	commitBySHA := map[string]PRCommit{}
	if commits, _, cerr := s.prCommits(ctx, t, number); cerr == nil {
		for _, c := range commits {
			commitBySHA[c.SHA] = c
		}
	}

	return &PRTimelineList{
		Events:    expandTimeline(raws, commitBySHA),
		Total:     meta.Total,
		Truncated: meta.Truncated,
	}, nil
}

// expandTimeline flattens push events into one entry per commit and re-sorts the
// stream, so commits interleave with the comments around them rather than
// clumping at each push's position. Pure so it can be tested without a client.
func expandTimeline(raws []rawTimelineEvent, commitBySHA map[string]PRCommit) []PRTimelineEvent {
	events := make([]PRTimelineEvent, 0, len(raws))
	for _, r := range raws {
		if r.Type != "pull_push" {
			events = append(events, r.toEvent())
			continue
		}
		var push struct {
			IsForcePush bool     `json:"is_force_push"`
			CommitIDs   []string `json:"commit_ids"`
		}
		if json.Unmarshal([]byte(r.Body), &push) != nil || len(push.CommitIDs) == 0 {
			events = append(events, r.toEvent())
			continue
		}
		if push.IsForcePush {
			ev := r.toEvent()
			ev.RefAction = "force-pushed"
			events = append(events, ev)
			continue
		}
		for _, sha := range push.CommitIDs {
			ev := PRTimelineEvent{
				ID:        r.ID,
				Type:      "commit",
				Author:    r.User.Login,
				CreatedAt: r.CreatedAt,
				HTMLURL:   r.HTMLURL,
				SHA:       sha,
			}
			if c, ok := commitBySHA[sha]; ok {
				ev.Message = c.Message
				ev.Author = c.Author
				ev.CreatedAt = c.Timestamp
			}
			events = append(events, ev)
		}
	}

	// Interleave commits with the comments around them rather than leaving each
	// push's commits clumped at the push's position.
	sort.SliceStable(events, func(i, j int) bool {
		return events[i].CreatedAt < events[j].CreatedAt
	})
	return events
}

// AddPRComment posts a conversation comment and returns it.
func (s *PRService) AddPRComment(org, product, repo string, number int, body string) (*PRComment, error) {
	t, err := s.target(org, product, repo)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(body) == "" {
		return nil, fmt.Errorf("comment body is required")
	}
	ctx, cancel := s.ctx()
	defer cancel()

	var raw rawComment
	in := map[string]string{"body": body}
	if err := s.client.postJSON(ctx, t, fmt.Sprintf("repos/%s/issues/%d/comments", t.repoPath(), number), in, &raw); err != nil {
		return nil, s.fail(err)
	}
	c := raw.toComment()
	return &c, nil
}

// --- reviews ---

// GetPRReviews returns the submitted reviews on a pull request.
func (s *PRService) GetPRReviews(org, product, repo string, number int) ([]PRReview, error) {
	t, err := s.target(org, product, repo)
	if err != nil {
		return nil, err
	}
	ctx, cancel := s.ctx()
	defer cancel()

	type rawReview struct {
		ID   int `json:"id"`
		User struct {
			Login string `json:"login"`
		} `json:"user"`
		State       string `json:"state"`
		Body        string `json:"body"`
		SubmittedAt string `json:"submitted_at"`
		Comments    int    `json:"comments_count"`
		Stale       bool   `json:"stale"`
		Official    bool   `json:"official"`
	}
	raws, _, err := forgejoList[rawReview](ctx, s.client, t,
		fmt.Sprintf("repos/%s/pulls/%d/reviews", t.repoPath(), number))
	if err != nil {
		return nil, s.fail(err)
	}
	reviews := make([]PRReview, len(raws))
	for i, r := range raws {
		reviews[i] = PRReview{
			ID: r.ID, Author: r.User.Login, State: r.State, Body: r.Body,
			SubmittedAt: r.SubmittedAt, Comments: r.Comments, Stale: r.Stale, Official: r.Official,
		}
	}
	return reviews, nil
}

// GetReviewComments returns the inline comments belonging to one review.
func (s *PRService) GetReviewComments(org, product, repo string, number, reviewID int) ([]PRReviewComment, error) {
	t, err := s.target(org, product, repo)
	if err != nil {
		return nil, err
	}
	ctx, cancel := s.ctx()
	defer cancel()

	var raws []struct {
		ID   int `json:"id"`
		User struct {
			Login string `json:"login"`
		} `json:"user"`
		Body         string `json:"body"`
		Path         string `json:"path"`
		Position     int    `json:"position"`
		OriginalPos  int    `json:"original_position"`
		DiffHunk     string `json:"diff_hunk"`
		CreatedAt    string `json:"created_at"`
		PullReviewID int    `json:"pull_request_review_id"`
	}
	path := fmt.Sprintf("repos/%s/pulls/%d/reviews/%d/comments", t.repoPath(), number, reviewID)
	if err := s.client.getJSON(ctx, t, path, &raws); err != nil {
		return nil, s.fail(err)
	}
	comments := make([]PRReviewComment, len(raws))
	for i, r := range raws {
		comments[i] = PRReviewComment{
			ID: r.ID, ReviewID: r.PullReviewID, Author: r.User.Login, Body: r.Body,
			Path: r.Path, Line: r.Position, OldLine: r.OriginalPos,
			DiffHunk: r.DiffHunk, CreatedAt: r.CreatedAt,
		}
	}
	return comments, nil
}

// SubmitReview submits a review. event is "APPROVED", "REQUEST_CHANGES", or
// "COMMENT". comments may be empty for a review that only carries a body.
func (s *PRService) SubmitReview(org, product, repo string, number int, event, body string, comments []ReviewDraftComment) (*PRReview, error) {
	t, err := s.target(org, product, repo)
	if err != nil {
		return nil, err
	}
	switch event {
	case "APPROVED", "REQUEST_CHANGES", "COMMENT":
	default:
		return nil, fmt.Errorf("event must be APPROVED, REQUEST_CHANGES or COMMENT, got %q", event)
	}
	if event != "APPROVED" && strings.TrimSpace(body) == "" && len(comments) == 0 {
		return nil, fmt.Errorf("a %s review needs a comment", strings.ToLower(strings.ReplaceAll(event, "_", " ")))
	}
	ctx, cancel := s.ctx()
	defer cancel()

	type inComment struct {
		Path        string `json:"path"`
		Body        string `json:"body"`
		NewPosition int    `json:"new_position"`
	}
	in := struct {
		Event    string      `json:"event"`
		Body     string      `json:"body"`
		Comments []inComment `json:"comments,omitempty"`
	}{Event: event, Body: body}
	for _, c := range comments {
		in.Comments = append(in.Comments, inComment{Path: c.Path, Body: c.Body, NewPosition: c.NewPosition})
	}

	var raw struct {
		ID   int `json:"id"`
		User struct {
			Login string `json:"login"`
		} `json:"user"`
		State       string `json:"state"`
		Body        string `json:"body"`
		SubmittedAt string `json:"submitted_at"`
		Comments    int    `json:"comments_count"`
		Stale       bool   `json:"stale"`
		Official    bool   `json:"official"`
	}
	path := fmt.Sprintf("repos/%s/pulls/%d/reviews", t.repoPath(), number)
	if err := s.client.postJSON(ctx, t, path, in, &raw); err != nil {
		return nil, s.fail(err)
	}
	return &PRReview{
		ID: raw.ID, Author: raw.User.Login, State: raw.State, Body: raw.Body,
		SubmittedAt: raw.SubmittedAt, Comments: raw.Comments, Stale: raw.Stale, Official: raw.Official,
	}, nil
}
