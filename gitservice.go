package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// GitService provides local git operations for the block merge flow.
type GitService struct {
	tokens          *ConsoleTokenSource
	mu              sync.Mutex
	app             *application.App
	watcher         *fsnotify.Watcher
	pathToRepo      map[string]string // watched fs path → repoPath
	debounceTimers  map[string]*time.Timer
	configFixTimers map[string]*time.Timer // debounced SyncGitAuth reruns on .git/config writes
}

func NewGitService() *GitService {
	w, _ := fsnotify.NewWatcher()
	tokens, _ := NewConsoleTokenSource() // nil if not logged in yet
	svc := &GitService{
		tokens:          tokens,
		watcher:         w,
		pathToRepo:      make(map[string]string),
		debounceTimers:  make(map[string]*time.Timer),
		configFixTimers: make(map[string]*time.Timer),
	}
	go svc.watchLoop()
	return svc
}

func (g *GitService) watchLoop() {
	for {
		select {
		case event, ok := <-g.watcher.Events:
			if !ok {
				return
			}
			g.mu.Lock()
			repoPath, found := g.pathToRepo[filepath.Dir(event.Name)]
			if !found {
				repoPath, found = g.pathToRepo[event.Name]
			}
			if found {
				if t, exists := g.debounceTimers[repoPath]; exists {
					t.Stop()
				}
				rp := repoPath
				g.debounceTimers[repoPath] = time.AfterFunc(400*time.Millisecond, func() {
					g.emitChanged(rp)
				})
			}
			// .git/config itself changed — an external tool (e.g. the old VS
			// Code "alis-build" extension) may have just reintroduced its own
			// git-auth include. Re-run SyncGitAuth so it gets stripped right
			// away instead of waiting for this app's own next credential-helper
			// invocation, which could be minutes away or never (if the next git
			// command also happens to come from that same external tool).
			if found && filepath.Base(event.Name) == "config" && filepath.Dir(event.Name) == filepath.Join(repoPath, ".git") {
				if t, exists := g.configFixTimers[repoPath]; exists {
					t.Stop()
				}
				g.configFixTimers[repoPath] = time.AfterFunc(300*time.Millisecond, func() {
					if err := SyncGitAuth(); err != nil {
						fmt.Fprintf(os.Stderr, "alis-hub: re-sync git auth after external .git/config change: %v\n", err)
					}
				})
			}
			g.mu.Unlock()
		case <-g.watcher.Errors:
			// ignore
		}
	}
}

// WatchRepo begins watching repoPath/.git for external changes.
// Idempotent — safe to call multiple times for the same path.
func (g *GitService) WatchRepo(repoPath string) error {
	gitDir := filepath.Join(repoPath, ".git")
	refsDir := filepath.Join(gitDir, "refs", "heads")

	g.mu.Lock()
	defer g.mu.Unlock()

	if _, already := g.pathToRepo[gitDir]; already {
		return nil
	}

	if err := g.watcher.Add(gitDir); err != nil {
		return err
	}
	g.pathToRepo[gitDir] = repoPath

	// Best-effort: refs/heads may not exist yet on a fresh clone
	if _, err := os.Stat(refsDir); err == nil {
		if err2 := g.watcher.Add(refsDir); err2 == nil {
			g.pathToRepo[refsDir] = repoPath
		}
	}
	return nil
}

func (g *GitService) emitChanged(repoPath string) {
	g.mu.Lock()
	app := g.app
	g.mu.Unlock()
	if app != nil {
		app.Event.Emit("git:changed", repoPath)
	}
}

func (g *GitService) SetApp(app *application.App) {
	g.mu.Lock()
	g.app = app
	g.mu.Unlock()
}

func (g *GitService) emitLog(line string) {
	g.mu.Lock()
	app := g.app
	g.mu.Unlock()
	if app != nil {
		app.Event.Emit("git:log", line)
	}
}

func (g *GitService) emitAuthExpired() {
	g.mu.Lock()
	app := g.app
	g.mu.Unlock()
	if app != nil {
		app.Event.Emit("auth:expired")
	}
}

// GitSyncResult is returned by PushOrigin, PullOrigin, and CheckoutBranch with a classified outcome.
// Kind values: "ok" | "up_to_date" | "push_rejected" | "pull_conflict" |
//
//	"uncommitted_changes" | "network_error" | "auth_error" | "index_lock" | "other_error"
type GitSyncResult struct {
	Kind          string   `json:"kind"`
	Message       string   `json:"message"`
	ConflictFiles []string `json:"conflictFiles"`
}

// classifyGitOutput maps combined git stdout+stderr to a typed outcome.
// Used by PushOrigin/PullOrigin (remote sync) and CheckoutBranch (local checkout failures).
func classifyGitOutput(output string, err error) (kind, message string) {
	if err == nil {
		lower := strings.ToLower(output)
		if strings.Contains(lower, "everything up-to-date") || strings.Contains(lower, "already up to date") {
			return "up_to_date", "Already up to date."
		}
		return "ok", ""
	}
	lower := strings.ToLower(output)
	switch {
	case strings.Contains(lower, "! [rejected]") || strings.Contains(lower, "failed to push some refs"):
		return "push_rejected", "The remote has changes you don't have locally. Pull first, then push."
	case strings.Contains(output, "CONFLICT") || strings.Contains(output, "Automatic merge failed"):
		return "pull_conflict", "Merge conflicts detected. Resolve the conflicts to complete the pull."
	case strings.Contains(lower, "already up to date"):
		return "up_to_date", "Already up to date."
	case strings.Contains(lower, "please commit your changes or stash"):
		return "uncommitted_changes", "You have local changes that would be overwritten. Commit or stash them first."
	case strings.Contains(lower, "would be overwritten by checkout"):
		return "uncommitted_changes", "Local changes would be overwritten by checkout. Commit, stash, or discard them first."
	case strings.Contains(lower, "could not read from remote") || strings.Contains(lower, "unable to access") || strings.Contains(lower, "failed to connect"):
		return "network_error", "Could not reach the remote repository. Check your network connection."
	case strings.Contains(lower, "authentication failed") || strings.Contains(lower, "token has expired") ||
		strings.Contains(lower, "returned error: 403") || strings.Contains(lower, "returned error: 401"):
		// Matched against the "returned error: <code>" form git itself prints for
		// HTTP-level rejections, not a bare "403"/"401" substring — a bare match
		// can appear incidentally (commit messages, branch-protection errors
		// unrelated to the token) and would misclassify an unrelated failure as
		// auth_error, spuriously popping the re-login modal.
		return "auth_error", "Authentication failed. Your session may have expired."
	case strings.Contains(lower, "index.lock"):
		// "fatal: Unable to create '.../.git/index.lock': File exists." — a
		// previous git process crashed (or another one is still running) and
		// left the lock behind. Surfaced as its own kind so the UI can offer
		// a one-click "clear lock" action (ClearIndexLock).
		return "index_lock", "Git is locked by a stale index.lock file, likely left behind by a crashed git process. Clear the lock to continue."
	default:
		msg := strings.TrimSpace(output)
		if msg == "" {
			msg = err.Error()
		}
		return "other_error", msg
	}
}

type ConflictHunk struct {
	Index    int      `json:"index"`
	Before   []string `json:"before"`
	Current  []string `json:"current"`
	Incoming []string `json:"incoming"`
	After    []string `json:"after"`
}

type ConflictFileContent struct {
	Path  string         `json:"path"`
	Hunks []ConflictHunk `json:"hunks"`
}

// gitCmdStream runs a git command, streams combined output via emitLog, and returns combined output on error.
func (g *GitService) gitCmdStream(dir string, args ...string) (string, error) {
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")

	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()
	if err := cmd.Start(); err != nil {
		return "", err
	}

	var combined strings.Builder
	forward := func(r io.Reader) {
		scanner := bufio.NewScanner(r)
		for scanner.Scan() {
			line := scanner.Text() + "\r\n"
			combined.WriteString(line)
			g.emitLog(line)
		}
	}
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); forward(stdout) }()
	go func() { defer wg.Done(); forward(stderr) }()
	wg.Wait()

	err := cmd.Wait()
	return combined.String(), err
}

// IsMerging reports whether repoPath currently has a merge in progress.
func (g *GitService) IsMerging(repoPath string) (bool, error) {
	_, err := os.Stat(filepath.Join(repoPath, ".git", "MERGE_HEAD"))
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// GetMergeMessage returns the pre-filled merge commit message (from
// .git/MERGE_MSG), or "" if the repo isn't mid-merge.
func (g *GitService) GetMergeMessage(repoPath string) (string, error) {
	data, err := os.ReadFile(filepath.Join(repoPath, ".git", "MERGE_MSG"))
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	return strings.TrimSpace(string(data)), nil
}

// GetConflictFiles returns the list of files with unmerged conflicts.
func (g *GitService) GetConflictFiles(repoPath string) ([]string, error) {
	out, _ := gitCmd(repoPath, "git", "diff", "--name-only", "--diff-filter=U")
	var files []string
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		if line != "" {
			files = append(files, line)
		}
	}
	return files, nil
}

// GetConflictContent reads a conflicted file and parses its conflict hunks.
func (g *GitService) GetConflictContent(repoPath, filePath string) (*ConflictFileContent, error) {
	fullPath := filepath.Join(repoPath, filePath)
	f, err := os.Open(fullPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	result := &ConflictFileContent{Path: filePath}

	type state int
	const (
		stateNormal state = iota
		stateCurrent
		stateIncoming
	)

	var (
		st          = stateNormal
		normalLines []string
		hunk        ConflictHunk
	)

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		switch {
		case strings.HasPrefix(line, "<<<<<<< "):
			// Capture up to 3 context lines before the hunk.
			start := len(normalLines) - 3
			if start < 0 {
				start = 0
			}
			hunk = ConflictHunk{Index: len(result.Hunks), Before: append([]string(nil), normalLines[start:]...)}
			normalLines = nil
			st = stateCurrent

		case st == stateCurrent && line == "=======":
			st = stateIncoming

		case st == stateIncoming && strings.HasPrefix(line, ">>>>>>> "):
			st = stateNormal
			result.Hunks = append(result.Hunks, hunk)
			hunk = ConflictHunk{}

		case st == stateCurrent:
			hunk.Current = append(hunk.Current, line)

		case st == stateIncoming:
			hunk.Incoming = append(hunk.Incoming, line)

		default:
			normalLines = append(normalLines, line)
		}
	}

	// Populate After context for each hunk using next hunk's Before lines.
	for i := range result.Hunks {
		if i+1 < len(result.Hunks) {
			before := result.Hunks[i+1].Before
			end := 3
			if end > len(before) {
				end = len(before)
			}
			result.Hunks[i].After = append([]string(nil), before[:end]...)
		}
	}

	return result, scanner.Err()
}

// SaveConflictResolution replaces each conflict marker block in the file with the
// corresponding resolved lines (one entry per hunk, in order), writes the file, and
// stages it with git add. resolutions[i] is the newline-joined content for hunk i.
func (g *GitService) SaveConflictResolution(repoPath, filePath string, resolutions []string) error {
	fullPath := filepath.Join(repoPath, filePath)

	f, err := os.Open(fullPath)
	if err != nil {
		return err
	}

	type section struct {
		isConflict bool
		lines      []string
	}
	var sections []section
	var current section
	hunkIdx := 0

	type state int
	const (
		sNormal state = iota
		sCurrent
		sIncoming
	)
	st := sNormal

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		switch {
		case st == sNormal && strings.HasPrefix(line, "<<<<<<< "):
			if len(current.lines) > 0 {
				sections = append(sections, current)
			}
			current = section{isConflict: true}
			st = sCurrent

		case st == sCurrent && line == "=======":
			st = sIncoming

		case st == sIncoming && strings.HasPrefix(line, ">>>>>>> "):
			sections = append(sections, section{isConflict: true, lines: []string{strconv.Itoa(hunkIdx)}})
			hunkIdx++
			current = section{}
			st = sNormal

		case st == sNormal:
			current.lines = append(current.lines, line)
		}
	}
	f.Close()
	if err := scanner.Err(); err != nil {
		return err
	}
	if len(current.lines) > 0 {
		sections = append(sections, current)
	}

	var out []string
	for _, sec := range sections {
		if sec.isConflict {
			idx, _ := strconv.Atoi(sec.lines[0])
			if idx < len(resolutions) {
				if resolutions[idx] != "" {
					out = append(out, strings.Split(resolutions[idx], "\n")...)
				}
			}
		} else {
			out = append(out, sec.lines...)
		}
	}

	content := strings.Join(out, "\n")
	if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
		return err
	}
	_, err = gitCmd(repoPath, "git", "add", filePath)
	return err
}

// CompleteMerge finalises the merge with a commit (non-interactive).
func (g *GitService) CompleteMerge(repoPath string) error {
	g.emitLog("$ git merge --continue\r\n")
	cmd := exec.Command("git", "-c", "core.editor=true", "merge", "--continue")
	cmd.Dir = repoPath
	cmd.Env = append(os.Environ(), "GIT_EDITOR=true")
	out, err := cmd.CombinedOutput()
	for _, line := range strings.Split(string(out), "\n") {
		if line != "" {
			g.emitLog(line + "\r\n")
		}
	}
	return err
}

// AbortMerge aborts an in-progress merge.
func (g *GitService) AbortMerge(repoPath string) error {
	g.emitLog("$ git merge --abort\r\n")
	_, err := g.gitCmdStream(repoPath, "git", "merge", "--abort")
	return err
}

// gitCmd runs a git command in the given directory and returns combined output.
// The first element of args must be "git".
func gitCmd(dir string, args ...string) (string, error) {
	if len(args) == 0 || args[0] != "git" {
		return "", fmt.Errorf("gitCmd: first arg must be 'git'")
	}
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	out, err := cmd.CombinedOutput()
	return string(out), err
}

// gitCmdAuth runs a git command with an injected Bearer token for HTTPS remotes.
// git -c http.extraHeader="Authorization: Bearer {token}" {rest of args}
func (g *GitService) gitCmdAuth(dir string, args ...string) (string, error) {
	if len(args) == 0 || args[0] != "git" {
		return "", fmt.Errorf("gitCmdAuth: first arg must be 'git'")
	}
	token, err := g.tokens.AccessToken()
	if err != nil || token == "" {
		return gitCmd(dir, args...)
	}
	// Inject as a -c flag between "git" and the subcommand.
	authArgs := make([]string, 0, len(args)+2)
	authArgs = append(authArgs, "git", "-c", "http.extraHeader=Authorization: Bearer "+token)
	authArgs = append(authArgs, args[1:]...)
	cmd := exec.Command(authArgs[0], authArgs[1:]...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	out, cerr := cmd.CombinedOutput()
	return string(out), cerr
}

// ProductRepoPaths holds the local filesystem paths for a product's git repos.
type ProductRepoPaths struct {
	BuildDir  string `json:"buildDir"`
	DefineDir string `json:"defineDir"`
}

// GetProductRepoPaths returns the local build and define repo paths for the given product.
// org and product are short names (e.g. "voyage", "vp").
func (g *GitService) GetProductRepoPaths(org, product string) (*ProductRepoPaths, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	return &ProductRepoPaths{
		BuildDir:  filepath.Join(home, "alis.build", org, "build", product),
		DefineDir: filepath.Join(home, "alis.build", org, "define"),
	}, nil
}

// --- Source Control (SCM) types ---

type GitStatus struct {
	Staged     []GitFileStatus `json:"staged"`
	Unstaged   []GitFileStatus `json:"unstaged"`
	Untracked  []string        `json:"untracked"`
	Conflicted []GitFileStatus `json:"conflicted"`
}

type GitFileStatus struct {
	Path       string `json:"path"`
	StatusCode string `json:"statusCode"`
	OldPath    string `json:"oldPath"`
}

type GitFileDiff struct {
	OldContent string   `json:"oldContent"`
	NewContent string   `json:"newContent"`
	Language   string   `json:"language"`
	Hunks      []string `json:"hunks"`
}

type GitBranch struct {
	Name      string `json:"name"`
	IsCurrent bool   `json:"isCurrent"`
	IsRemote  bool   `json:"isRemote"`
}

type GitCommit struct {
	Hash         string   `json:"hash"`
	ParentHashes []string `json:"parentHashes"`
	Subject      string   `json:"subject"`
	AuthorName   string   `json:"authorName"`
	Timestamp    int64    `json:"timestamp"`
	RefNames     []string `json:"refNames"`
}

func (g *GitService) emitScmLog(repoPath, line string) {
	g.mu.Lock()
	app := g.app
	g.mu.Unlock()
	if app != nil {
		app.Event.Emit("git:scm:log", map[string]string{"repoPath": repoPath, "line": line})
	}
}

// CommitFile describes a file changed in a single commit.
type CommitFile struct {
	Path       string `json:"path"`
	StatusCode string `json:"statusCode"`
	OldPath    string `json:"oldPath"`
}

// GetCommitFiles returns the list of files changed by a specific commit.
func (g *GitService) GetCommitFiles(repoPath, hash string) ([]CommitFile, error) {
	// git show handles shallow clones and missing parents gracefully; diff-tree silently
	// returns empty output when the parent commit is not in the local object store.
	out, err := gitCmd(repoPath, "git", "show", "--name-status", "--format=", hash)
	if err != nil {
		// Commit is not in the local clone; fetch it and retry.
		g.gitCmdAuth(repoPath, "git", "fetch", "--depth=1", "origin", hash) //nolint:errcheck
		out, err = gitCmd(repoPath, "git", "show", "--name-status", "--format=", hash)
		if err != nil {
			return nil, fmt.Errorf("show: %w", err)
		}
	}
	var files []CommitFile
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 3)
		if len(parts) < 2 {
			continue
		}
		code := parts[0]
		// Rename/copy: "R100\told\tnew" → keep new path, record old path
		if (strings.HasPrefix(code, "R") || strings.HasPrefix(code, "C")) && len(parts) == 3 {
			files = append(files, CommitFile{Path: parts[2], StatusCode: string(code[0]), OldPath: parts[1]})
			continue
		}
		files = append(files, CommitFile{Path: parts[1], StatusCode: code})
	}
	return files, nil
}

// GetCommitFileDiff returns the diff for a single file within a specific commit.
func (g *GitService) GetCommitFileDiff(repoPath, hash, filePath string) (*GitFileDiff, error) {
	// Ensure the commit is available locally.
	if _, err := gitCmd(repoPath, "git", "cat-file", "-t", hash); err != nil {
		g.gitCmdAuth(repoPath, "git", "fetch", "--depth=2", "origin", hash) //nolint:errcheck
	}

	lang := gitLang(filePath)
	diff := &GitFileDiff{Language: lang}

	// New content: file at this commit.
	if new_, err := gitCmd(repoPath, "git", "show", hash+":"+filePath); err == nil {
		diff.NewContent = new_
	}

	// Old content: silently empty for new files or shallow-clone boundaries (parent not available).
	if old, err := gitCmd(repoPath, "git", "show", hash+"^:"+filePath); err == nil {
		diff.OldContent = old
	}

	// Diff between parent and this commit.
	rawDiff, diffErr := gitCmd(repoPath, "git", "diff", "--no-color", "-U3", hash+"^", hash, "--", filePath)
	if diffErr != nil {
		rawDiff = ""
	}
	if rawDiff == "" {
		// Parent unavailable (new file, initial commit, shallow-clone boundary): fall back to
		// git show which outputs the whole-file diff. Strip the commit header it prepends.
		if showOut, err := gitCmd(repoPath, "git", "show", "--no-color", "-U3", hash, "--", filePath); err == nil {
			if idx := strings.Index(showOut, "\ndiff --git "); idx >= 0 {
				rawDiff = showOut[idx+1:]
			} else if strings.HasPrefix(showOut, "diff --git ") {
				rawDiff = showOut
			}
		}
	}
	diff.Hunks = gitParseHunks(rawDiff)

	return diff, nil
}

// GetStatus returns staged, unstaged, and untracked file lists.
func (g *GitService) GetStatus(repoPath string) (*GitStatus, error) {
	out, err := gitCmd(repoPath, "git", "status", "--porcelain=v1", "-u")
	if err != nil {
		return nil, fmt.Errorf("git status: %w", err)
	}
	status := &GitStatus{}
	for _, line := range strings.Split(out, "\n") {
		if len(line) < 4 {
			continue
		}
		x, y := string(line[0]), string(line[1])
		rest := line[3:]

		if x == "?" && y == "?" {
			status.Untracked = append(status.Untracked, rest)
			continue
		}

		// Renames: "ORIG -> NEW"
		oldPath := ""
		path := rest
		if (x == "R" || y == "R" || x == "C" || y == "C") && strings.Contains(rest, " -> ") {
			parts := strings.SplitN(rest, " -> ", 2)
			oldPath, path = parts[0], parts[1]
		}

		// Unmerged/conflicted paths: either side is "U", or both sides agree
		// on an add-add / delete-delete conflict. These don't belong in the
		// staged/unstaged buckets.
		if x == "U" || y == "U" || (x == "A" && y == "A") || (x == "D" && y == "D") {
			status.Conflicted = append(status.Conflicted, GitFileStatus{Path: path, StatusCode: x + y, OldPath: oldPath})
			continue
		}

		if x != " " && x != "!" {
			status.Staged = append(status.Staged, GitFileStatus{Path: path, StatusCode: x, OldPath: oldPath})
		}
		if y != " " && y != "!" {
			status.Unstaged = append(status.Unstaged, GitFileStatus{Path: path, StatusCode: y, OldPath: oldPath})
		}
	}
	return status, nil
}

// AheadBehind holds the number of commits the current branch is ahead/behind its upstream.
type AheadBehind struct {
	Ahead  int `json:"ahead"`
	Behind int `json:"behind"`
}

// GetAheadBehind returns how many commits the current branch is ahead/behind its upstream.
// Returns zeros when no upstream is configured or when the comparison fails.
func (g *GitService) GetAheadBehind(repoPath string) (*AheadBehind, error) {
	out, err := gitCmd(repoPath, "git", "rev-list", "--left-right", "--count", "HEAD...@{upstream}")
	if err != nil {
		return &AheadBehind{}, nil
	}
	parts := strings.Fields(strings.TrimSpace(out))
	if len(parts) != 2 {
		return &AheadBehind{}, nil
	}
	ahead, _ := strconv.Atoi(parts[0])
	behind, _ := strconv.Atoi(parts[1])
	return &AheadBehind{Ahead: ahead, Behind: behind}, nil
}

// GetBranchCommitCount returns how many commits head has that base does not,
// comparing the remote tracking refs (origin/head vs origin/base).
// Returns 0 when the refs don't exist or the branches are already in sync.
func (g *GitService) GetBranchCommitCount(repoPath, head, base string) (int, error) {
	out, err := gitCmd(repoPath, "git", "rev-list", "--count", "origin/"+base+".."+"origin/"+head)
	if err != nil {
		return 0, nil
	}
	count, _ := strconv.Atoi(strings.TrimSpace(out))
	return count, nil
}

// GetFileDiff returns old and new file content plus diff hunks for the diff viewer.
// staged=true shows index vs HEAD; staged=false shows working tree vs index.
func (g *GitService) GetFileDiff(repoPath, filePath string, staged bool) (*GitFileDiff, error) {
	lang := gitLang(filePath)
	diff := &GitFileDiff{Language: lang}

	if staged {
		old, _ := gitCmd(repoPath, "git", "show", "HEAD:"+filePath)
		new_, _ := gitCmd(repoPath, "git", "show", ":"+filePath)
		diff.OldContent = old
		diff.NewContent = new_
		rawDiff, _ := gitCmd(repoPath, "git", "diff", "--cached", "--no-color", "-U3", "--", filePath)
		diff.Hunks = gitParseHunks(rawDiff)
	} else {
		old, _ := gitCmd(repoPath, "git", "show", ":"+filePath)
		diff.OldContent = old
		newBytes, err := os.ReadFile(filepath.Join(repoPath, filePath))
		if err != nil {
			return nil, err
		}
		diff.NewContent = string(newBytes)
		rawDiff, _ := gitCmd(repoPath, "git", "diff", "--no-color", "-U3", "--", filePath)
		diff.Hunks = gitParseHunks(rawDiff)
	}
	return diff, nil
}

// gitParseHunks returns the raw diff as a single-element slice.
// @git-diff-view/core's parseInstance.parse() expects a full diff string
// (including the --- / +++ header) per element, not individual hunk lines.
func gitParseHunks(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	return []string{raw}
}

// StageFile stages a single file.
func (g *GitService) StageFile(repoPath, filePath string) error {
	out, err := gitCmd(repoPath, "git", "add", "--", filePath)
	if err != nil {
		return fmt.Errorf("git add: %w\n%s", err, strings.TrimSpace(out))
	}
	return nil
}

// StageFiles stages multiple files in a single git invocation, avoiding the
// .git/index.lock race that firing one StageFile call per path concurrently
// would cause.
func (g *GitService) StageFiles(repoPath string, paths []string) error {
	args := append([]string{"git", "add", "--"}, paths...)
	out, err := gitCmd(repoPath, args...)
	if err != nil {
		return fmt.Errorf("git add: %w\n%s", err, strings.TrimSpace(out))
	}
	return nil
}

// UnstageFile removes a file from the staging area.
func (g *GitService) UnstageFile(repoPath, filePath string) error {
	out, err := gitCmd(repoPath, "git", "restore", "--staged", "--", filePath)
	if err != nil {
		return fmt.Errorf("git restore: %w\n%s", err, strings.TrimSpace(out))
	}
	return nil
}

// UnstageFiles removes multiple files from the staging area in a single git
// invocation, avoiding the .git/index.lock race of concurrent per-file calls.
func (g *GitService) UnstageFiles(repoPath string, paths []string) error {
	args := append([]string{"git", "restore", "--staged", "--"}, paths...)
	out, err := gitCmd(repoPath, args...)
	if err != nil {
		return fmt.Errorf("git restore: %w\n%s", err, strings.TrimSpace(out))
	}
	return nil
}

// DiscardFile discards working tree changes for a file.
func (g *GitService) DiscardFile(repoPath, filePath string) error {
	_, err := gitCmd(repoPath, "git", "restore", "--", filePath)
	return err
}

// DiscardFiles discards working tree changes for multiple tracked files in a
// single git invocation, avoiding the .git/index.lock race of concurrent
// per-file calls.
func (g *GitService) DiscardFiles(repoPath string, paths []string) error {
	if len(paths) == 0 {
		return nil
	}
	args := append([]string{"git", "restore", "--"}, paths...)
	out, err := gitCmd(repoPath, args...)
	if err != nil {
		return fmt.Errorf("git restore: %w\n%s", err, strings.TrimSpace(out))
	}
	return nil
}

// DiscardUntracked deletes untracked files from the working tree. git restore
// only touches tracked files, so untracked paths are removed with git clean.
func (g *GitService) DiscardUntracked(repoPath string, paths []string) error {
	if len(paths) == 0 {
		return nil
	}
	args := append([]string{"git", "clean", "-f", "-d", "--"}, paths...)
	out, err := gitCmd(repoPath, args...)
	if err != nil {
		return fmt.Errorf("git clean: %w\n%s", err, strings.TrimSpace(out))
	}
	return nil
}

// StageAll stages all changes.
func (g *GitService) StageAll(repoPath string) error {
	out, err := gitCmd(repoPath, "git", "add", "-A")
	if err != nil {
		return gitOutputError(out, err)
	}
	return nil
}

// Commit creates a commit with the given message.
func (g *GitService) Commit(repoPath, message string) error {
	out, err := gitCmd(repoPath, "git", "commit", "-m", message)
	if err != nil {
		return gitOutputError(out, err)
	}
	return nil
}

// gitOutputError builds an error from a failed git command's combined
// output, falling back to the raw exec error (e.g. "exit status 1") only
// when git produced no output at all.
func gitOutputError(output string, err error) error {
	msg := strings.TrimSpace(output)
	if msg == "" {
		return err
	}
	return fmt.Errorf("%s", msg)
}

// GetBranches returns all local and remote branches.
func (g *GitService) GetBranches(repoPath string) ([]GitBranch, error) {
	// Include full refname so we can reliably detect remote tracking branches;
	// %(refname:short) alone strips "refs/remotes/" leaving "origin/branch" which
	// is indistinguishable from a local branch named "origin/branch".
	out, err := gitCmd(repoPath, "git", "branch", "-a", "--format=%(refname:short)|%(refname)|%(HEAD)")
	if err != nil {
		return nil, err
	}
	var branches []GitBranch
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "|", 3)
		if len(parts) != 3 {
			continue
		}
		name, fullRef, head := strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1]), strings.TrimSpace(parts[2])
		branches = append(branches, GitBranch{
			Name:      name,
			IsCurrent: head == "*",
			IsRemote:  strings.HasPrefix(fullRef, "refs/remotes/"),
		})
	}
	return branches, nil
}

// GetCurrentBranch returns the name of the currently checked-out branch.
func (g *GitService) GetCurrentBranch(repoPath string) (string, error) {
	out, err := gitCmd(repoPath, "git", "rev-parse", "--abbrev-ref", "HEAD")
	return strings.TrimSpace(out), err
}

// CheckoutBranch switches to an existing branch and returns a classified result.
func (g *GitService) CheckoutBranch(repoPath, branchName string) GitSyncResult {
	output, err := gitCmd(repoPath, "git", "checkout", branchName)
	kind, message := classifyGitOutput(output, err)
	return GitSyncResult{Kind: kind, Message: message}
}

// CreateBranch creates and switches to a new branch.
func (g *GitService) CreateBranch(repoPath, branchName string) error {
	_, err := gitCmd(repoPath, "git", "checkout", "-b", branchName)
	return err
}

// UndoLastCommit soft-resets HEAD by one commit, leaving the undone commit's
// changes staged. Purely local — callers are expected to only allow this when
// the commit hasn't been pushed yet (see GetAheadBehind).
func (g *GitService) UndoLastCommit(repoPath string) GitSyncResult {
	output, err := gitCmd(repoPath, "git", "reset", "--soft", "HEAD~1")
	kind, message := classifyGitOutput(output, err)
	return GitSyncResult{Kind: kind, Message: message}
}

// PushOrigin pushes the current branch to origin and returns a classified result.
func (g *GitService) PushOrigin(repoPath string) GitSyncResult {
	g.emitScmLog(repoPath, "$ git push origin HEAD\r\n")
	cmd := g.authedGitCmd("push", "origin", "HEAD")
	cmd.Dir = repoPath
	output, err := g.streamScm(cmd, repoPath)
	kind, message := classifyGitOutput(output, err)
	if kind == "auth_error" {
		g.emitAuthExpired()
	}
	return GitSyncResult{Kind: kind, Message: message}
}

// PullOrigin pulls the current branch from origin and returns a classified result.
// For pull_conflict, ConflictFiles is populated.
func (g *GitService) PullOrigin(repoPath string) GitSyncResult {
	// --no-rebase pins the merge strategy regardless of the user's global pull.rebase
	// config, so a conflict always leaves a merge (not rebase) in progress — matching
	// what CompleteMerge/AbortMerge assume.
	g.emitScmLog(repoPath, "$ git pull --no-rebase\r\n")
	cmd := g.authedGitCmd("pull", "--no-rebase")
	cmd.Dir = repoPath
	output, err := g.streamScm(cmd, repoPath)
	kind, message := classifyGitOutput(output, err)
	if kind == "auth_error" {
		g.emitAuthExpired()
	}
	result := GitSyncResult{Kind: kind, Message: message}
	if kind == "pull_conflict" {
		result.ConflictFiles, _ = g.GetConflictFiles(repoPath)
	}
	return result
}

// FetchOrigin fetches from origin (updating remote-tracking refs and ahead/behind
// state) without touching the working tree or local branch. Used both for manual
// refresh and periodic background polling.
func (g *GitService) FetchOrigin(repoPath string) GitSyncResult {
	cmd := g.authedGitCmd("fetch", "--prune")
	cmd.Dir = repoPath
	output, err := g.streamScm(cmd, repoPath)
	kind, message := classifyGitOutput(output, err)
	if kind == "auth_error" {
		g.emitAuthExpired()
	}
	return GitSyncResult{Kind: kind, Message: message}
}

// ClearIndexLock removes a stale .git/index.lock left behind by a crashed or
// killed git process. Only invoked from the UI after an operation failed with
// kind "index_lock" — if another git process is genuinely still running, the
// next operation will simply recreate the lock.
func (g *GitService) ClearIndexLock(repoPath string) error {
	out, err := gitCmd(repoPath, "git", "rev-parse", "--git-dir")
	if err != nil {
		return fmt.Errorf("resolve git dir: %s", strings.TrimSpace(out))
	}
	gitDir := strings.TrimSpace(out)
	if !filepath.IsAbs(gitDir) {
		gitDir = filepath.Join(repoPath, gitDir)
	}
	lockPath := filepath.Join(gitDir, "index.lock")
	if err := os.Remove(lockPath); err != nil && !os.IsNotExist(err) {
		return err
	}
	g.emitChanged(repoPath)
	return nil
}

// authedGitCmd builds a git command with GIT_TERMINAL_PROMPT=0 and a Bearer
// token injected via -c http.extraHeader when a token is available.
// If the token cannot be obtained, an auth:expired event is emitted so the
// frontend can prompt the user to sign in again immediately.
func (g *GitService) authedGitCmd(args ...string) *exec.Cmd {
	env := append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	var cmdArgs []string
	if g.tokens == nil {
		g.tokens, _ = NewConsoleTokenSource()
	}
	if g.tokens != nil {
		token, err := g.tokens.AccessToken()
		if err != nil {
			// One short retry before concluding the session is dead: this call
			// runs on whatever fired the git op (including the periodic
			// background fetch), and a single transient blip here — e.g. the
			// network still reconnecting right as the laptop wakes, the exact
			// moment the fetch poll timer happens to fire — would otherwise pop
			// the re-login modal even though the token is fine a moment later.
			time.Sleep(300 * time.Millisecond)
			token, err = g.tokens.AccessToken()
		}
		if err == nil && token != "" {
			cmdArgs = append(cmdArgs, "-c", "http.extraHeader=Authorization: Bearer "+token)
		} else if err != nil {
			g.mu.Lock()
			app := g.app
			g.mu.Unlock()
			if app != nil {
				app.Event.Emit("auth:expired")
			}
		}
	}
	cmdArgs = append(cmdArgs, args...)
	cmd := exec.Command("git", cmdArgs...)
	cmd.Env = env
	return cmd
}

// GetLog returns commit history for the git graph.
func (g *GitService) GetLog(repoPath string, limit int) ([]GitCommit, error) {
	format := "%H|%P|%s|%an|%ct|%D"
	out, err := gitCmd(repoPath, "git", "log", "--all", "--format="+format, "-n", strconv.Itoa(limit))
	if err != nil {
		return nil, err
	}
	var commits []GitCommit
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "|", 6)
		if len(parts) < 6 {
			continue
		}
		ts, _ := strconv.ParseInt(strings.TrimSpace(parts[4]), 10, 64)
		var parents []string
		for _, p := range strings.Fields(parts[1]) {
			if p != "" {
				parents = append(parents, p)
			}
		}
		var refs []string
		for _, r := range strings.Split(parts[5], ", ") {
			r = strings.TrimSpace(r)
			if r != "" {
				refs = append(refs, r)
			}
		}
		commits = append(commits, GitCommit{
			Hash:         parts[0],
			ParentHashes: parents,
			Subject:      parts[2],
			AuthorName:   parts[3],
			Timestamp:    ts,
			RefNames:     refs,
		})
	}
	return commits, nil
}

// streamScm runs a command, streams stdout+stderr via emitScmLog, and returns the combined output.
func (g *GitService) streamScm(cmd *exec.Cmd, repoPath string) (string, error) {
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()
	if err := cmd.Start(); err != nil {
		return "", err
	}
	var mu sync.Mutex
	var combined strings.Builder
	forward := func(r io.Reader) {
		scanner := bufio.NewScanner(r)
		for scanner.Scan() {
			line := scanner.Text() + "\r\n"
			g.emitScmLog(repoPath, line)
			mu.Lock()
			combined.WriteString(line)
			mu.Unlock()
		}
	}
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); forward(stdout) }()
	go func() { defer wg.Done(); forward(stderr) }()
	wg.Wait()
	return combined.String(), cmd.Wait()
}

// --- Forgejo Pull Request API ---

// ForgejoPR represents a pull request on a Forgejo-hosted repository.
type ForgejoPR struct {
	Number     int    `json:"number"`
	Title      string `json:"title"`
	Body       string `json:"body"`
	State      string `json:"state"`
	HeadBranch string `json:"headBranch"`
	BaseBranch string `json:"baseBranch"`
	Author     string `json:"author"`
	HTMLURL    string `json:"htmlUrl"`
	CreatedAt  string `json:"createdAt"`
	Mergeable  bool   `json:"mergeable"`
}

// parseForgejoRemote reads the origin remote URL and returns the Forgejo base URL,
// owner, and repo name. Returns an error if the remote is not a Forgejo host.
func (g *GitService) parseForgejoRemote(repoPath string) (baseURL, owner, repoName string, err error) {
	out, err := gitCmd(repoPath, "git", "remote", "get-url", "origin")
	if err != nil {
		return "", "", "", fmt.Errorf("get remote url: %w", err)
	}
	u, err := url.Parse(strings.TrimSpace(out))
	if err != nil {
		return "", "", "", fmt.Errorf("parse remote url: %w", err)
	}
	if !forgejoHostRe.MatchString(u.Host) {
		return "", "", "", fmt.Errorf("not a forgejo host: %s", u.Host)
	}
	parts := strings.SplitN(strings.Trim(u.Path, "/"), "/", 2)
	if len(parts) != 2 {
		return "", "", "", fmt.Errorf("unexpected path: %s", u.Path)
	}
	return u.Scheme + "://" + u.Host, parts[0], strings.TrimSuffix(parts[1], ".git"), nil
}

// forgejoAPI makes an authenticated request to the Forgejo REST API.
func (g *GitService) forgejoAPI(baseURL, method, path string, body []byte) ([]byte, error) {
	if g.tokens == nil {
		var err error
		g.tokens, err = NewConsoleTokenSource()
		if err != nil {
			return nil, fmt.Errorf("not logged in")
		}
	}
	token, err := g.tokens.AccessToken()
	if err != nil {
		return nil, fmt.Errorf("get token: %w", err)
	}
	var reqBody io.Reader
	if body != nil {
		reqBody = bytes.NewReader(body)
	}
	req, err := http.NewRequest(method, baseURL+"/api/v1/"+path, reqBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("forgejo %s: %s", resp.Status, strings.TrimSpace(string(data)))
	}
	return data, nil
}

// parsePRResponse converts the Forgejo API response into a ForgejoPR.
func parsePRResponse(raw struct {
	Number int    `json:"number"`
	Title  string `json:"title"`
	Body   string `json:"body"`
	State  string `json:"state"`
	Head   struct {
		Ref string `json:"ref"`
	} `json:"head"`
	Base struct {
		Ref string `json:"ref"`
	} `json:"base"`
	User struct {
		Login string `json:"login"`
	} `json:"user"`
	HTMLURL   string `json:"html_url"`
	CreatedAt string `json:"created_at"`
	Mergeable bool   `json:"mergeable"`
}) ForgejoPR {
	return ForgejoPR{
		Number:     raw.Number,
		Title:      raw.Title,
		Body:       raw.Body,
		State:      raw.State,
		HeadBranch: raw.Head.Ref,
		BaseBranch: raw.Base.Ref,
		Author:     raw.User.Login,
		HTMLURL:    raw.HTMLURL,
		CreatedAt:  raw.CreatedAt,
		Mergeable:  raw.Mergeable,
	}
}

// IsForgejo returns true if the repo's origin remote is a Forgejo host.
func (g *GitService) IsForgejo(repoPath string) (bool, error) {
	_, _, _, err := g.parseForgejoRemote(repoPath)
	return err == nil, nil
}

// PRCommit is a commit included in a pull request.
type PRCommit struct {
	SHA       string `json:"sha"`
	Message   string `json:"message"`
	Author    string `json:"author"`
	Timestamp string `json:"timestamp"`
}

// PRComment is a conversation comment on a pull request.
type PRComment struct {
	ID        int    `json:"id"`
	Body      string `json:"body"`
	Author    string `json:"author"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// ListPRs returns pull requests for the given repo. state is "open", "closed", or "all".
func (g *GitService) ListPRs(repoPath, state string) ([]ForgejoPR, error) {
	baseURL, owner, repo, err := g.parseForgejoRemote(repoPath)
	if err != nil {
		return nil, err
	}
	if state == "" {
		state = "open"
	}
	data, err := g.forgejoAPI(baseURL, http.MethodGet,
		fmt.Sprintf("repos/%s/%s/pulls?state=%s&limit=50", owner, repo, state), nil)
	if err != nil {
		return nil, err
	}
	type rawPR struct {
		Number int    `json:"number"`
		Title  string `json:"title"`
		Body   string `json:"body"`
		State  string `json:"state"`
		Head   struct {
			Ref string `json:"ref"`
		} `json:"head"`
		Base struct {
			Ref string `json:"ref"`
		} `json:"base"`
		User struct {
			Login string `json:"login"`
		} `json:"user"`
		HTMLURL   string `json:"html_url"`
		CreatedAt string `json:"created_at"`
		Mergeable bool   `json:"mergeable"`
	}
	var raws []rawPR
	if err := json.Unmarshal(data, &raws); err != nil {
		return nil, fmt.Errorf("parse prs: %w", err)
	}
	prs := make([]ForgejoPR, len(raws))
	for i, r := range raws {
		prs[i] = parsePRResponse(r)
	}
	return prs, nil
}

// CreatePR creates a new pull request. head and base are branch names.
func (g *GitService) CreatePR(repoPath, title, body, head, base string) (*ForgejoPR, error) {
	baseURL, owner, repo, err := g.parseForgejoRemote(repoPath)
	if err != nil {
		return nil, err
	}
	payload, err := json.Marshal(map[string]string{"title": title, "body": body, "head": head, "base": base})
	if err != nil {
		return nil, err
	}
	data, err := g.forgejoAPI(baseURL, http.MethodPost,
		fmt.Sprintf("repos/%s/%s/pulls", owner, repo), payload)
	if err != nil {
		return nil, err
	}
	var raw struct {
		Number int    `json:"number"`
		Title  string `json:"title"`
		Body   string `json:"body"`
		State  string `json:"state"`
		Head   struct {
			Ref string `json:"ref"`
		} `json:"head"`
		Base struct {
			Ref string `json:"ref"`
		} `json:"base"`
		User struct {
			Login string `json:"login"`
		} `json:"user"`
		HTMLURL   string `json:"html_url"`
		CreatedAt string `json:"created_at"`
		Mergeable bool   `json:"mergeable"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parse created pr: %w", err)
	}
	pr := parsePRResponse(raw)
	return &pr, nil
}

// MergePR merges a pull request. mergeStyle is "merge", "rebase", or "squash".
func (g *GitService) MergePR(repoPath string, number int, mergeStyle string) error {
	baseURL, owner, repo, err := g.parseForgejoRemote(repoPath)
	if err != nil {
		return err
	}
	payload, err := json.Marshal(map[string]string{"Do": mergeStyle})
	if err != nil {
		return err
	}
	_, err = g.forgejoAPI(baseURL, http.MethodPost,
		fmt.Sprintf("repos/%s/%s/pulls/%d/merge", owner, repo, number), payload)
	return err
}

// GetPRCommits returns the list of commits included in a pull request.
func (g *GitService) GetPRCommits(repoPath string, number int) ([]PRCommit, error) {
	baseURL, owner, repo, err := g.parseForgejoRemote(repoPath)
	if err != nil {
		return nil, err
	}
	data, err := g.forgejoAPI(baseURL, http.MethodGet,
		fmt.Sprintf("repos/%s/%s/pulls/%d/commits?limit=50", owner, repo, number), nil)
	if err != nil {
		return nil, err
	}
	var raw []struct {
		SHA    string `json:"sha"`
		Commit struct {
			Message   string `json:"message"`
			Author    struct {
				Name string `json:"name"`
				Date string `json:"date"`
			} `json:"author"`
		} `json:"commit"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parse commits: %w", err)
	}
	commits := make([]PRCommit, len(raw))
	for i, r := range raw {
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
	return commits, nil
}

// GetPRComments returns the conversation comments on a pull request.
func (g *GitService) GetPRComments(repoPath string, number int) ([]PRComment, error) {
	baseURL, owner, repo, err := g.parseForgejoRemote(repoPath)
	if err != nil {
		return nil, err
	}
	data, err := g.forgejoAPI(baseURL, http.MethodGet,
		fmt.Sprintf("repos/%s/%s/issues/%d/comments?limit=50", owner, repo, number), nil)
	if err != nil {
		return nil, err
	}
	var raw []struct {
		ID   int    `json:"id"`
		Body string `json:"body"`
		User struct {
			Login string `json:"login"`
		} `json:"user"`
		CreatedAt string `json:"created_at"`
		UpdatedAt string `json:"updated_at"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parse comments: %w", err)
	}
	comments := make([]PRComment, len(raw))
	for i, r := range raw {
		comments[i] = PRComment{
			ID:        r.ID,
			Body:      r.Body,
			Author:    r.User.Login,
			CreatedAt: r.CreatedAt,
			UpdatedAt: r.UpdatedAt,
		}
	}
	return comments, nil
}

// AddPRComment posts a new comment on a pull request and returns the created comment.
func (g *GitService) AddPRComment(repoPath string, number int, body string) (*PRComment, error) {
	baseURL, owner, repo, err := g.parseForgejoRemote(repoPath)
	if err != nil {
		return nil, err
	}
	payload, err := json.Marshal(map[string]string{"body": body})
	if err != nil {
		return nil, err
	}
	data, err := g.forgejoAPI(baseURL, http.MethodPost,
		fmt.Sprintf("repos/%s/%s/issues/%d/comments", owner, repo, number), payload)
	if err != nil {
		return nil, err
	}
	var raw struct {
		ID   int    `json:"id"`
		Body string `json:"body"`
		User struct {
			Login string `json:"login"`
		} `json:"user"`
		CreatedAt string `json:"created_at"`
		UpdatedAt string `json:"updated_at"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parse comment: %w", err)
	}
	return &PRComment{
		ID:        raw.ID,
		Body:      raw.Body,
		Author:    raw.User.Login,
		CreatedAt: raw.CreatedAt,
		UpdatedAt: raw.UpdatedAt,
	}, nil
}

// GetPRFiles returns the list of files changed in a pull request.
func (g *GitService) GetPRFiles(repoPath string, number int) ([]CommitFile, error) {
	baseURL, owner, repo, err := g.parseForgejoRemote(repoPath)
	if err != nil {
		return nil, err
	}
	data, err := g.forgejoAPI(baseURL, http.MethodGet,
		fmt.Sprintf("repos/%s/%s/pulls/%d/files?limit=100", owner, repo, number), nil)
	if err != nil {
		return nil, err
	}
	var raw []struct {
		Filename string `json:"filename"`
		Status   string `json:"status"` // "added", "modified", "deleted", "renamed"
		OldName  string `json:"previous_filename"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parse files: %w", err)
	}
	// Map Forgejo status strings to single-letter status codes
	statusMap := map[string]string{
		"added": "A", "modified": "M", "deleted": "D", "renamed": "R",
	}
	files := make([]CommitFile, len(raw))
	for i, r := range raw {
		code := statusMap[r.Status]
		if code == "" {
			code = "M"
		}
		files[i] = CommitFile{Path: r.Filename, StatusCode: code, OldPath: r.OldName}
	}
	return files, nil
}

// GetPRFileDiff returns the diff for a single file across the PR's head vs base branches.
// Uses a three-dot diff: git diff origin/{base}...origin/{head} -- {filePath}
func (g *GitService) GetPRFileDiff(repoPath, baseBranch, headBranch, filePath string) (*GitFileDiff, error) {
	// Fetch to update origin/{base} and origin/{head} refs, authenticated via bearer token.
	g.gitCmdAuth(repoPath, "git", "fetch", "origin", baseBranch, headBranch) //nolint:errcheck

	lang := gitLang(filePath)
	diff := &GitFileDiff{Language: lang}

	baseRef := "origin/" + baseBranch
	headRef := "origin/" + headBranch

	if old, err := gitCmd(repoPath, "git", "show", baseRef+":"+filePath); err == nil {
		diff.OldContent = old
	}
	if new_, err := gitCmd(repoPath, "git", "show", headRef+":"+filePath); err == nil {
		diff.NewContent = new_
	}

	// Three-dot diff shows changes on head since it diverged from base.
	// Falls back to two-dot when the merge-base isn't in the shallow clone.
	rawDiff, err := gitCmd(repoPath, "git", "diff", "--no-color", "-U3", baseRef+"..."+headRef, "--", filePath)
	if err != nil || rawDiff == "" {
		rawDiff, err = gitCmd(repoPath, "git", "diff", "--no-color", "-U3", baseRef+".."+headRef, "--", filePath)
	}
	if err == nil {
		diff.Hunks = gitParseHunks(rawDiff)
	}

	return diff, nil
}

// gitLang maps a file extension to a language identifier for the diff viewer.
func gitLang(path string) string {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".go":
		return "go"
	case ".ts", ".tsx":
		return "typescript"
	case ".js", ".jsx":
		return "javascript"
	case ".json":
		return "json"
	case ".yaml", ".yml":
		return "yaml"
	case ".md":
		return "markdown"
	case ".proto":
		return "protobuf"
	case ".py":
		return "python"
	case ".sh", ".bash":
		return "bash"
	case ".sql":
		return "sql"
	case ".html":
		return "html"
	case ".css":
		return "css"
	default:
		return "plaintext"
	}
}
