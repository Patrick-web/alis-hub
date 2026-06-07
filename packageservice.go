package main

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

// PackageService orchestrates the Manage Packages flow: scan → GeneratePackageScripts → run scripts.
type PackageService struct {
	mu         sync.Mutex
	alisClient *AlisClient
	processes  sync.Map // map[runID]*packageProcess
}

type packageProcess struct {
	mu     sync.Mutex
	buf    bytes.Buffer
	done   bool
	errMsg string
	cancel context.CancelFunc
}

type packageProcessWriter struct{ p *packageProcess }

func (w *packageProcessWriter) Write(b []byte) (int, error) {
	w.p.mu.Lock()
	defer w.p.mu.Unlock()
	return w.p.buf.Write(b)
}

func NewPackageService() *PackageService {
	return &PackageService{}
}

func (s *PackageService) initClient() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.alisClient != nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	c, err := NewAlisClient(ctx)
	if err != nil {
		return fmt.Errorf("alis client: %w", err)
	}
	s.alisClient = c
	return nil
}

// PreparePackageScripts scans the neuron build directory for language manifests, then calls
// VscodeService/GeneratePackageScripts to obtain the shell commands for each folder.
func (s *PackageService) PreparePackageScripts(org, product, neuron, version string) ([]PackageScript, error) {
	if err := s.initClient(); err != nil {
		return nil, err
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	buildDir := filepath.Join(home, "alis.build", org, "build", product, neuron, version)
	productDir := filepath.Join(home, "alis.build", org, "build", product)
	folderName := neuron + "-" + version // e.g. "asana-v1"

	locations, names, err := scanBuildDirForLocations(buildDir, productDir, folderName)
	if err != nil {
		return nil, err
	}
	if len(locations) == 0 {
		return nil, fmt.Errorf("no language files found in %s", buildDir)
	}

	definition := fmt.Sprintf("definitions/%s.%s", org, product)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	scripts, err := s.alisClient.GeneratePackageScripts(ctx, definition, locations)
	if err != nil {
		return nil, err
	}
	// Populate Name from the scan's computed display name, matched by workDir.
	for i := range scripts {
		if n, ok := names[scripts[i].WorkDir]; ok {
			scripts[i].Name = n
		}
	}

	// Auth: write ~/.netrc, ~/.npmrc (and dart pub-tokens.json if needed).
	hasDart := false
	for _, s := range scripts {
		if s.Lang == "dart" {
			hasDart = true
			break
		}
	}
	authCtx, authCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer authCancel()
	if err := s.alisClient.AuthSetupPackages(authCtx, org, product, hasDart); err != nil {
		return nil, fmt.Errorf("auth setup: %w", err)
	}

	return scripts, nil
}

// scanBuildDirForLocations finds language manifest files and returns PackageScriptLocations
// along with a map of workDir → display name (e.g. "asana-v1" or "asana-v1/proto").
func scanBuildDirForLocations(buildDir, productDir, folderName string) ([]PackageScriptLocation, map[string]string, error) {
	if _, err := os.Stat(buildDir); err != nil {
		return nil, nil, fmt.Errorf("build dir not found at %s: %w", buildDir, err)
	}

	manifests := map[string]int{
		"go.mod":           vscodeLanguageGO,
		"package.json":     vscodeLanguageNODE,
		"requirements.txt": vscodeLanguagePYTHON,
		"pubspec.yaml":     vscodeLanguageDART,
	}

	seen := map[string]bool{}
	var locations []PackageScriptLocation
	names := map[string]string{} // workDir → display name
	err := filepath.WalkDir(buildDir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		langEnum, ok := manifests[d.Name()]
		if !ok {
			return nil
		}
		dir := filepath.Dir(path)
		key := fmt.Sprintf("%d:%s", langEnum, dir)
		if seen[key] {
			return nil
		}
		seen[key] = true
		locations = append(locations, PackageScriptLocation{
			WorkingDirectory: dir,
			Language:         langEnum,
			BuildDirectory:   productDir,
		})
		rel, _ := filepath.Rel(buildDir, dir)
		if rel == "" || rel == "." {
			names[dir] = folderName
		} else {
			names[dir] = folderName + "/" + rel
		}
		return nil
	})
	return locations, names, err
}

// StartPackageScript launches a script in a goroutine and stores its state under runID.
// The shell command is run via bash -c so it inherits PATH and env.
func (s *PackageService) StartPackageScript(runID, command, workDir string) error {
	if _, loaded := s.processes.LoadOrStore(runID, nil); loaded {
		return fmt.Errorf("run %s already exists", runID)
	}

	ctx, cancel := context.WithCancel(context.Background())
	p := &packageProcess{cancel: cancel}
	s.processes.Store(runID, p)

	go func() {
		w := &packageProcessWriter{p}
		shell := os.Getenv("SHELL")
		if shell == "" {
			shell = "/bin/bash"
		}
		cmd := exec.CommandContext(ctx, shell, "-l", "-c", command)
		cmd.Dir = workDir
		cmd.Stdout = w
		cmd.Stderr = w
		runErr := cmd.Run()
		p.mu.Lock()
		p.done = true
		if runErr != nil && ctx.Err() == nil {
			p.errMsg = runErr.Error()
		}
		p.mu.Unlock()
	}()

	return nil
}

// PollPackageRun returns new output since offset. Reuses the LocalBuildChunk type from buildservice.
func (s *PackageService) PollPackageRun(runID string, offset int) (*LocalBuildChunk, error) {
	val, ok := s.processes.Load(runID)
	if !ok {
		return nil, fmt.Errorf("unknown run %s", runID)
	}
	p := val.(*packageProcess)

	p.mu.Lock()
	all := p.buf.Bytes()
	done := p.done
	errMsg := p.errMsg
	p.mu.Unlock()

	if offset > len(all) {
		offset = len(all)
	}
	chunk := &LocalBuildChunk{
		Content:    string(all[offset:]),
		NextOffset: len(all),
		Done:       done,
		Error:      errMsg,
	}
	return chunk, nil
}

// CancelPackageRun cancels a running script.
func (s *PackageService) CancelPackageRun(runID string) error {
	val, ok := s.processes.Load(runID)
	if !ok {
		return fmt.Errorf("unknown run %s", runID)
	}
	p := val.(*packageProcess)
	p.cancel()
	return nil
}

// CheckVenvExists returns true if a .venv directory exists at the product build root.
func (s *PackageService) CheckVenvExists(org, product string) bool {
	home, err := os.UserHomeDir()
	if err != nil {
		return false
	}
	venvPath := filepath.Join(home, "alis.build", org, "build", product, ".venv")
	_, err = os.Stat(venvPath)
	return err == nil
}

// StartVenvSetup launches the Python venv creation command as a tracked process.
// Mirrors the extension's Imt() — fires and does not block waiting for completion.
// Command: python3 -m venv .venv && .venv/bin/python3 -m pip install keyring keyrings.google-artifactregistry-auth wheel && gcloud auth application-default login
func (s *PackageService) StartVenvSetup(runID, org, product string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	workDir := filepath.Join(home, "alis.build", org, "build", product)
	cmd := "python3 -m venv .venv && " +
		".venv/bin/python3 -m pip install keyring keyrings.google-artifactregistry-auth wheel && " +
		"gcloud auth application-default login"
	return s.StartPackageScript(runID, cmd, workDir)
}
