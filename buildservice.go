package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	dbdv1 "alis-hub-v3/dbdv1"
)

// BuildService is a Wails-bound service that orchestrates the Build flow.
type BuildService struct {
	alisClient *AlisClient
}

func NewBuildService() *BuildService {
	return &BuildService{}
}

func (s *BuildService) initClient() error {
	if s.alisClient != nil {
		return nil
	}
	log.Println("[build] initialising Alis gRPC client")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	client, err := NewAlisClient(ctx)
	if err != nil {
		return fmt.Errorf("connecting to Alis backend: %w", err)
	}
	s.alisClient = client
	log.Println("[build] gRPC client ready")
	return nil
}

// GetBuildCommits lists recent commits from the build repository.
func (s *BuildService) GetBuildCommits(org, product, neuron, version string, count int) ([]DefineCommit, error) {
	if count <= 0 {
		count = 50
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	repoDir := filepath.Join(home, "alis.build", org, "build", product)
	log.Printf("[build] GetBuildCommits: repo=%s filter=%s/%s count=%d", repoDir, neuron, version, count)

	if _, err := os.Stat(repoDir); err != nil {
		log.Printf("[build] GetBuildCommits: repo not found: %v", err)
		return nil, fmt.Errorf("build repo not found at %s: %w", repoDir, err)
	}

	targetSubdir := filepath.Join(neuron, version)

	args := []string{
		"log", "origin/master",
		"--first-parent",
		"--max-count", fmt.Sprintf("%d", count),
		"--format=format:%H|%ct|%an|%ae|%s",
		"--", targetSubdir,
	}

	cmd := exec.Command("git", args...)
	cmd.Dir = repoDir
	out, err := cmd.CombinedOutput()
	if err != nil || len(out) == 0 {
		log.Printf("[build] GetBuildCommits: path-filtered log empty, falling back to full log (err=%v)", err)
		fallback := exec.Command("git", "log", "origin/master",
			"--first-parent",
			"--max-count", fmt.Sprintf("%d", count),
			"--format=format:%H|%ct|%an|%ae|%s",
		)
		fallback.Dir = repoDir
		out, err = fallback.CombinedOutput()
		if err != nil {
			log.Printf("[build] GetBuildCommits: fallback git log failed: %v", err)
			return nil, fmt.Errorf("git log failed: %w\n%s", err, string(out))
		}
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) == 1 && lines[0] == "" {
		log.Printf("[build] GetBuildCommits: no commits found for %s/%s", neuron, version)
		return []DefineCommit{}, nil
	}

	commits := make([]DefineCommit, 0, len(lines))
	for _, line := range lines {
		parts := strings.SplitN(line, "|", 5)
		if len(parts) < 5 {
			continue
		}
		ts := int64(0)
		fmt.Sscanf(parts[1], "%d", &ts)
		commits = append(commits, DefineCommit{
			SHA:         parts[0],
			Timestamp:   ts,
			Author:      parts[2],
			AuthorEmail: parts[3],
			Message:     parts[4],
		})
	}

	log.Printf("[build] GetBuildCommits: returned %d commits", len(commits))
	return commits, nil
}

// RunBuildResult is returned to the frontend after initiating a Build.
type RunBuildResult struct {
	OperationName string `json:"operationName"`
	Version       string `json:"version"`
	NeuronVersion string `json:"neuronVersion"`
	LogsURL       string `json:"logsUrl"`
	Notes         string `json:"notes"`
	Done          bool   `json:"done"`
	Error         string `json:"error,omitempty"`
}

// RunBuild starts a Build operation on the Alis backend.
func (s *BuildService) RunBuild(neuron, commit string) (*RunBuildResult, error) {
	if err := s.initClient(); err != nil {
		return nil, err
	}

	log.Printf("[build] RunBuild: neuron=%s commit=%s", neuron, commit)

	req := &dbdv1.RunBuildRequest{
		Neuron: neuron,
		Commit: commit,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	op, err := s.alisClient.RunBuild(ctx, req)
	if err != nil {
		log.Printf("[build] RunBuild: gRPC error: %v", err)
		return nil, fmt.Errorf("RunBuild: %w", err)
	}

	log.Printf("[build] RunBuild: operation started name=%s done=%v", op.Name, op.Done)

	result := &RunBuildResult{
		OperationName: op.Name,
		Done:          op.Done,
	}

	if e, ok := op.Result.(*dbdv1.OperationError); ok {
		log.Printf("[build] RunBuild: operation returned error immediately: %s", e.Message)
		result.Error = e.Message
	}

	return result, nil
}

// PollBuildOperation checks the status of a running Build operation.
func (s *BuildService) PollBuildOperation(name string) (*RunBuildResult, error) {
	if s.alisClient == nil {
		return nil, fmt.Errorf("not connected to Alis backend")
	}

	log.Printf("[build] PollBuildOperation: polling %s", name)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	op, err := s.alisClient.GetOperation(ctx, name)
	if err != nil {
		log.Printf("[build] PollBuildOperation: GetOperation error: %v", err)
		return nil, fmt.Errorf("poll operation: %w", err)
	}

	log.Printf("[build] PollBuildOperation: done=%v", op.Done)

	result := &RunBuildResult{
		OperationName: op.Name,
		Done:          op.Done,
	}

	meta := unpackBuildMetadata(op)
	if meta != nil {
		log.Printf("[build] PollBuildOperation: metadata version=%q logsUrl=%q notes=%q", meta.Version, meta.LogsURL, meta.Notes)
		result.Version = meta.Version
		result.LogsURL = meta.LogsURL
		result.Notes = meta.Notes
	} else {
		log.Printf("[build] PollBuildOperation: no metadata in operation")
	}

	if op.Done {
		if resp := parseBuildResponse(op); resp != nil {
			log.Printf("[build] PollBuildOperation: response neuronVersion=%q buildLogsUrl=%q version=%q",
				resp.NeuronVersion, resp.BuildLogsURL, resp.Version)
			if resp.BuildLogsURL != "" {
				result.LogsURL = resp.BuildLogsURL
			}
			if resp.Version != "" {
				result.Version = resp.Version
			}
			if resp.NeuronVersion != "" {
				result.NeuronVersion = resp.NeuronVersion
			}
		} else {
			log.Printf("[build] PollBuildOperation: done=true but no response body parsed")
		}
	}

	if e, ok := op.Result.(*dbdv1.OperationError); ok {
		log.Printf("[build] PollBuildOperation: operation failed: code=%d message=%s", e.Code, e.Message)
		result.Error = e.Message
	}

	return result, nil
}
