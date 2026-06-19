package main

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// GitService provides local git operations for the block merge flow.
type GitService struct {
	mu  sync.Mutex
	app *application.App
}

func NewGitService() *GitService { return &GitService{} }

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

type LocalMergeResult struct {
	RepoPath      string   `json:"repoPath"`
	BranchName    string   `json:"branchName"`
	HasConflicts  bool     `json:"hasConflicts"`
	ConflictFiles []string `json:"conflictFiles"`
	ErrorMessage  string   `json:"errorMessage"`
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

// StartLocalMerge runs: git fetch, checkout master, pull, then merge origin/{branchName}.
// Returns conflict file list if exit code 1 (conflicts detected).
// Git command output is streamed via "git:log" Wails events.
func (g *GitService) StartLocalMerge(repoPath, branchName string) (*LocalMergeResult, error) {
	result := &LocalMergeResult{RepoPath: repoPath, BranchName: branchName}

	cmds := [][]string{
		{"git", "fetch", "--all", "--prune"},
		{"git", "checkout", "master"},
		{"git", "pull", "--no-ff", "origin", "master"},
	}
	for _, args := range cmds {
		g.emitLog("$ " + strings.Join(args, " ") + "\r\n")
		out, err := g.gitCmdStream(repoPath, args...)
		if err != nil {
			result.ErrorMessage = fmt.Sprintf("%s: %s", strings.Join(args, " "), strings.TrimSpace(out))
			return result, nil
		}
	}

	// Merge the block branch — exit code 1 means conflicts, not a hard error.
	mergeArgs := []string{"git", "merge", "--no-ff", "origin/" + branchName}
	g.emitLog("$ " + strings.Join(mergeArgs, " ") + "\r\n")
	out, err := g.gitCmdStream(repoPath, mergeArgs...)
	if err != nil {
		// Check if it's a conflict (exit 1) vs a real error.
		conflicts, listErr := g.GetConflictFiles(repoPath)
		if listErr != nil || len(conflicts) == 0 {
			result.ErrorMessage = strings.TrimSpace(out)
			return result, nil
		}
		result.HasConflicts = true
		result.ConflictFiles = conflicts
		return result, nil
	}

	return result, nil
}

// gitCmdStream runs a git command, streams combined output via emitLog, and returns combined output on error.
func (g *GitService) gitCmdStream(dir string, args ...string) (string, error) {
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Dir = dir

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
	out, err := cmd.CombinedOutput()
	return string(out), err
}

func gitCmdEnv(dir string, env []string, args ...string) (string, error) {
	if len(args) == 0 || args[0] != "git" {
		return "", fmt.Errorf("gitCmdEnv: first arg must be 'git'")
	}
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), env...)
	out, err := cmd.CombinedOutput()
	return string(out), err
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
	Staged    []GitFileStatus `json:"staged"`
	Unstaged  []GitFileStatus `json:"unstaged"`
	Untracked []string        `json:"untracked"`
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

func (g *GitService) emitScmLog(line string) {
	g.mu.Lock()
	app := g.app
	g.mu.Unlock()
	if app != nil {
		app.Event.Emit("git:scm:log", line)
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
	out, err := gitCmd(repoPath, "git", "diff-tree", "--no-commit-id", "-r", "--name-status", hash)
	if err != nil {
		return nil, fmt.Errorf("diff-tree: %w", err)
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
	lang := gitLang(filePath)
	diff := &GitFileDiff{Language: lang}

	// New content: file at this commit
	new_, _ := gitCmd(repoPath, "git", "show", hash+":"+filePath)
	diff.NewContent = new_

	// Old content: file at parent; fails gracefully for new files or initial commits
	old, _ := gitCmd(repoPath, "git", "show", hash+"^:"+filePath)
	diff.OldContent = old

	// Diff between parent and this commit
	rawDiff, _ := gitCmd(repoPath, "git", "diff", "--no-color", "-U3", hash+"^", hash, "--", filePath)
	if rawDiff == "" {
		// New file in initial commit — synthesise an all-addition diff
		rawDiff2, _ := gitCmd(repoPath, "git", "show", "--no-color", "-U0", "--", hash, filePath)
		rawDiff = rawDiff2
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

		if x != " " && x != "!" {
			status.Staged = append(status.Staged, GitFileStatus{Path: path, StatusCode: x, OldPath: oldPath})
		}
		if y != " " && y != "!" {
			status.Unstaged = append(status.Unstaged, GitFileStatus{Path: path, StatusCode: y, OldPath: oldPath})
		}
	}
	return status, nil
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
	_, err := gitCmd(repoPath, "git", "add", "--", filePath)
	return err
}

// UnstageFile removes a file from the staging area.
func (g *GitService) UnstageFile(repoPath, filePath string) error {
	_, err := gitCmd(repoPath, "git", "restore", "--staged", "--", filePath)
	return err
}

// DiscardFile discards working tree changes for a file.
func (g *GitService) DiscardFile(repoPath, filePath string) error {
	_, err := gitCmd(repoPath, "git", "restore", "--", filePath)
	return err
}

// StageAll stages all changes.
func (g *GitService) StageAll(repoPath string) error {
	_, err := gitCmd(repoPath, "git", "add", "-A")
	return err
}

// Commit creates a commit with the given message.
func (g *GitService) Commit(repoPath, message string) error {
	_, err := gitCmd(repoPath, "git", "commit", "-m", message)
	return err
}

// GetBranches returns all local and remote branches.
func (g *GitService) GetBranches(repoPath string) ([]GitBranch, error) {
	out, err := gitCmd(repoPath, "git", "branch", "-a", "--format=%(refname:short)|%(HEAD)")
	if err != nil {
		return nil, err
	}
	var branches []GitBranch
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "|", 2)
		if len(parts) != 2 {
			continue
		}
		name, head := strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
		branches = append(branches, GitBranch{
			Name:      name,
			IsCurrent: head == "*",
			IsRemote:  strings.HasPrefix(name, "remotes/"),
		})
	}
	return branches, nil
}

// GetCurrentBranch returns the name of the currently checked-out branch.
func (g *GitService) GetCurrentBranch(repoPath string) (string, error) {
	out, err := gitCmd(repoPath, "git", "rev-parse", "--abbrev-ref", "HEAD")
	return strings.TrimSpace(out), err
}

// CheckoutBranch switches to an existing branch.
func (g *GitService) CheckoutBranch(repoPath, branchName string) error {
	_, err := gitCmd(repoPath, "git", "checkout", branchName)
	return err
}

// CreateBranch creates and switches to a new branch.
func (g *GitService) CreateBranch(repoPath, branchName string) error {
	_, err := gitCmd(repoPath, "git", "checkout", "-b", branchName)
	return err
}

// PushOrigin pushes the current branch to origin, streaming output.
func (g *GitService) PushOrigin(repoPath string) error {
	g.emitScmLog("$ git push origin HEAD\r\n")
	cmd := exec.Command("git", "push", "origin", "HEAD")
	cmd.Dir = repoPath
	return g.streamScm(cmd)
}

// PullOrigin pulls the current branch from origin, streaming output.
func (g *GitService) PullOrigin(repoPath string) error {
	g.emitScmLog("$ git pull\r\n")
	cmd := exec.Command("git", "pull")
	cmd.Dir = repoPath
	return g.streamScm(cmd)
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

// streamScm runs a command and streams stdout+stderr via emitScmLog.
func (g *GitService) streamScm(cmd *exec.Cmd) error {
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()
	if err := cmd.Start(); err != nil {
		return err
	}
	forward := func(r io.Reader) {
		scanner := bufio.NewScanner(r)
		for scanner.Scan() {
			g.emitScmLog(scanner.Text() + "\r\n")
		}
	}
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); forward(stdout) }()
	go func() { defer wg.Done(); forward(stderr) }()
	wg.Wait()
	return cmd.Wait()
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
