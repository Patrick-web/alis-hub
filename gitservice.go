package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

// GitService provides local git operations for the block merge flow.
type GitService struct{}

func NewGitService() *GitService { return &GitService{} }

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
func (g *GitService) StartLocalMerge(repoPath, branchName string) (*LocalMergeResult, error) {
	result := &LocalMergeResult{RepoPath: repoPath, BranchName: branchName}

	cmds := [][]string{
		{"git", "fetch", "--all", "--prune"},
		{"git", "checkout", "master"},
		{"git", "pull", "--no-ff", "origin", "master"},
	}
	for _, args := range cmds {
		if out, err := gitCmd(repoPath, args...); err != nil {
			result.ErrorMessage = fmt.Sprintf("%s: %s", strings.Join(args, " "), strings.TrimSpace(out))
			return result, nil
		}
	}

	// Merge the block branch — exit code 1 means conflicts, not a hard error.
	out, err := gitCmd(repoPath, "git", "merge", "origin/"+branchName)
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
	_, err := gitCmdEnv(repoPath, []string{"GIT_EDITOR=true"}, "git", "-c", "core.editor=true", "merge", "--continue")
	return err
}

// AbortMerge aborts an in-progress merge.
func (g *GitService) AbortMerge(repoPath string) error {
	_, err := gitCmd(repoPath, "git", "merge", "--abort")
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
