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

// DefineService is a Wails-bound service that orchestrates the Define flow.
type DefineService struct {
	alisClient *AlisClient
}

func NewDefineService() *DefineService {
	return &DefineService{}
}

func (s *DefineService) initClient() error {
	if s.alisClient != nil {
		return nil
	}
	log.Println("[define] initialising Alis gRPC client")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	client, err := NewAlisClient(ctx)
	if err != nil {
		return fmt.Errorf("connecting to Alis backend: %w", err)
	}
	s.alisClient = client
	log.Println("[define] gRPC client ready")
	return nil
}

// DefineCommit represents a git commit in the define repository.
type DefineCommit struct {
	SHA         string `json:"sha"`
	Message     string `json:"message"`
	Author      string `json:"author"`
	AuthorEmail string `json:"authorEmail"`
	Timestamp   int64  `json:"timestamp"`
}

// GetDefineCommits lists recent commits from the define repository.
func (s *DefineService) GetDefineCommits(org, product, neuron, version string, count int) ([]DefineCommit, error) {
	if count <= 0 {
		count = 50
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	repoDir := filepath.Join(home, "alis.build", org, "define")
	log.Printf("[define] GetDefineCommits: repo=%s filter=%s/%s/%s/%s count=%d", repoDir, org, product, neuron, version, count)

	if _, err := os.Stat(repoDir); err != nil {
		log.Printf("[define] GetDefineCommits: repo not found: %v", err)
		return nil, fmt.Errorf("define repo not found at %s: %w", repoDir, err)
	}

	// git log for the define repo, filtering by the product subpath
	// The filesystem structure is: {org}/{product}/{neuron}/{version}/
	targetSubdir := filepath.Join(org, product, neuron, version)

	args := []string{
		"log",
		"origin/master",
		"--first-parent",
		"--max-count", fmt.Sprintf("%d", count),
		"--format=format:%H|%ct|%an|%ae|%s",
		"--", targetSubdir,
	}

	cmd := exec.Command("git", args...)
	cmd.Dir = repoDir
	out, err := cmd.CombinedOutput()
	if err != nil || len(out) == 0 {
		// Fallback: try without the path filter, use master (local)
		fallbackArgs := []string{
			"log", "master",
			"--first-parent",
			"--max-count", fmt.Sprintf("%d", count),
			"--format=format:%H|%ct|%an|%ae|%s",
		}
		// Also try origin/master
		cmd2 := exec.Command("git", append([]string{"log", "origin/master",
			"--first-parent",
			"--max-count", fmt.Sprintf("%d", count),
			"--format=format:%H|%ct|%an|%ae|%s",
		}, "--", targetSubdir)...)
		cmd2.Dir = repoDir
		out2, err2 := cmd2.CombinedOutput()
		if err2 != nil || len(out2) == 0 {
			// Final fallback: full log without path filter
			cmd3 := exec.Command("git", fallbackArgs...)
			cmd3.Dir = repoDir
			out, err = cmd3.CombinedOutput()
			if err != nil {
				return nil, fmt.Errorf("git log failed (dir=%s): %w\nstderr: %s", repoDir, err, string(out))
			}
		} else {
			out = out2
		}
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	// If the only line is empty, return empty
	if len(lines) == 1 && lines[0] == "" {
		log.Printf("[define] GetDefineCommits: no commits found")
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

	log.Printf("[define] GetDefineCommits: returned %d commits", len(commits))
	return commits, nil
}

// RunDefineResult is returned to the frontend after running a Define.
type RunDefineResult struct {
	OperationName       string   `json:"operationName"`
	Definition          string   `json:"definition"`
	Version             string   `json:"version"`
	Notes               string   `json:"notes"`
	DefinitionArtifacts []string `json:"definitionArtifacts"`
	Done                bool     `json:"done"`
	Error               string   `json:"error,omitempty"`
}

// RunDefine starts a Define operation on the Alis backend.
func (s *DefineService) RunDefine(neuron, commit, releaseType string) (*RunDefineResult, error) {
	if err := s.initClient(); err != nil {
		return nil, err
	}

	log.Printf("[define] RunDefine: neuron=%s commit=%s releaseType=%q", neuron, commit, releaseType)

	req := &dbdv1.RunDefineRequest{
		Neuron:      neuron,
		Commit:      commit,
		ReleaseType: releaseType,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	op, err := s.alisClient.RunDefine(ctx, req)
	if err != nil {
		log.Printf("[define] RunDefine: gRPC error: %v", err)
		return nil, fmt.Errorf("RunDefine: %w", err)
	}

	log.Printf("[define] RunDefine: operation started name=%s done=%v", op.Name, op.Done)

	result := &RunDefineResult{
		OperationName: op.Name,
		Done:          op.Done,
	}

	if err, ok := op.Result.(*dbdv1.OperationError); ok {
		log.Printf("[define] RunDefine: operation returned error immediately: %s", err.Message)
		result.Error = err.Message
	}

	return result, nil
}

// PollDefineOperation checks the status of a running Define operation.
func (s *DefineService) PollDefineOperation(name string) (*RunDefineResult, error) {
	if s.alisClient == nil {
		return nil, fmt.Errorf("not connected to Alis backend")
	}

	log.Printf("[define] PollDefineOperation: polling %s", name)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	op, err := s.alisClient.GetOperation(ctx, name)
	if err != nil {
		log.Printf("[define] PollDefineOperation: GetOperation error: %v", err)
		return nil, fmt.Errorf("poll operation: %w", err)
	}

	log.Printf("[define] PollDefineOperation: done=%v", op.Done)

	result := &RunDefineResult{
		OperationName: op.Name,
		Done:          op.Done,
	}

	meta := unpackDefineMetadata(op)
	if meta != nil {
		log.Printf("[define] PollDefineOperation: metadata definition=%q version=%q notes=%q artifacts=%d",
			meta.Definition, meta.Version, meta.Notes, len(meta.DefinitionArtifacts))
		result.Definition = meta.Definition
		result.Version = meta.Version
		result.Notes = meta.Notes
		result.DefinitionArtifacts = meta.DefinitionArtifacts
	} else {
		log.Printf("[define] PollDefineOperation: no metadata in operation")
	}

	if err, ok := op.Result.(*dbdv1.OperationError); ok {
		log.Printf("[define] PollDefineOperation: operation failed: code=%d message=%s", err.Code, err.Message)
		result.Error = err.Message
	}

	return result, nil
}

// DefineArtifactInfo is a simplified artifact representation for the frontend.
type DefineArtifactInfo struct {
	Name    string `json:"name"`
	State   string `json:"state"`
	Lang    string `json:"lang"`
	Version string `json:"version"`
	Notes   string `json:"notes"`
}

// ExplainDefine calls Glass to explain what a completed define produced.
// definition is from RunDefineResult.Definition (e.g. "definitions/voyage.vp").
// artifacts is from RunDefineResult.DefinitionArtifacts.
// neuron is the neuron resource name (e.g. "organisations/voyage/products/vp/neurons/bff-v1").
func (s *DefineService) ExplainDefine(definition string, artifacts []string, neuron string) (*GlassResult, error) {
	if err := s.initClient(); err != nil {
		return nil, err
	}
	log.Printf("[define] ExplainDefine: definition=%q neuron=%s artifacts=%d", definition, neuron, len(artifacts))
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	result, err := s.alisClient.ExplainDefine(ctx, definition, artifacts, neuron)
	if err != nil {
		log.Printf("[define] ExplainDefine: error: %v", err)
		return nil, err
	}
	log.Printf("[define] ExplainDefine: title=%q artifacts=%d", result.Title, len(result.Artifacts))
	return result, nil
}

// ScanNeuronPackages scans the neuron build directory for language config files.
type PackageInfo struct {
	Name       string `json:"name"`
	Language   string `json:"language"`
	ArtifactID string `json:"artifactId"`
}

func (s *DefineService) ScanNeuronPackages(org, product, neuron, version string) ([]PackageInfo, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	buildDir := filepath.Join(home, "alis.build", org, "build", product, neuron, version)
	if _, err := os.Stat(buildDir); err != nil {
		return nil, fmt.Errorf("build dir not found at %s: %w", buildDir, err)
	}

	var packages []PackageInfo

	// Check for Go modules
	goModules, _ := filepath.Glob(filepath.Join(buildDir, "**", "go.mod"))
	for _, mod := range goModules {
		rel, _ := filepath.Rel(buildDir, filepath.Dir(mod))
		packages = append(packages, PackageInfo{
			Name:       filepath.Join(neuron+"-"+version, rel),
			Language:   "go",
			ArtifactID: "golang",
		})
	}

	// Check for Node.js packages
	nodePkgs, _ := filepath.Glob(filepath.Join(buildDir, "**", "package.json"))
	for _, pkg := range nodePkgs {
		rel, _ := filepath.Rel(buildDir, filepath.Dir(pkg))
		packages = append(packages, PackageInfo{
			Name:       filepath.Join(neuron+"-"+version, rel),
			Language:   "javascript",
			ArtifactID: "javascript",
		})
	}

	// Check for Python
	pythonPkgs, _ := filepath.Glob(filepath.Join(buildDir, "**", "requirements.txt"))
	for _, pkg := range pythonPkgs {
		rel, _ := filepath.Rel(buildDir, filepath.Dir(pkg))
		packages = append(packages, PackageInfo{
			Name:       filepath.Join(neuron+"-"+version, rel),
			Language:   "python",
			ArtifactID: "python",
		})
	}

	// Check for Dart
	dartPkgs, _ := filepath.Glob(filepath.Join(buildDir, "**", "pubspec.yaml"))
	for _, pkg := range dartPkgs {
		rel, _ := filepath.Rel(buildDir, filepath.Dir(pkg))
		packages = append(packages, PackageInfo{
			Name:       filepath.Join(neuron+"-"+version, rel),
			Language:   "dart",
			ArtifactID: "dart",
		})
	}

	return packages, nil
}
