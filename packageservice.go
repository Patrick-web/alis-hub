package main

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"alis-hub-v3/internal/alisclient"
	"alis-hub-v3/internal/cliwrap"
	"alis-hub-v3/internal/terminal"
)

// PackageService orchestrates the Manage Packages flow: scan → GeneratePackageScripts → run scripts.
type PackageService struct {
	mu         sync.Mutex
	alisClient *alisclient.AlisClient
	cliRunner  *cliwrap.Runner
	processes  sync.Map // map[runID]*packageProcess
}

type packageProcess struct {
	mu     sync.Mutex
	buf    bytes.Buffer
	done   bool
	errMsg string
	cancel context.CancelFunc
	ptmx   terminal.PTY // nil once the process has exited
}

func NewPackageService() *PackageService {
	svc := &PackageService{}
	if r, err := cliwrap.New("alis"); err == nil {
		svc.cliRunner = r
	}
	return svc
}

func (s *PackageService) initClient() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.alisClient != nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	c, err := newAlisClient(ctx)
	if err != nil {
		return fmt.Errorf("alis client: %w", err)
	}
	s.alisClient = c
	return nil
}

// PreparePackageScripts scans the neuron build directory for language manifests, then calls
// VscodeService/GeneratePackageScripts to obtain the shell commands for each folder.
func (s *PackageService) PreparePackageScripts(org, product, neuron, version string, ignoreHidden bool, extraPatterns []string) ([]alisclient.PackageScript, error) {
	if err := s.initClient(); err != nil {
		return nil, err
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	buildDir := filepath.Join(home, "alis.build", org, "build", product, neuron, version)
	productDir := filepath.Join(home, "alis.build", org, "build", product)
	folderName := neuron + "-" + version

	locations, names, err := scanBuildDirForLocations(buildDir, productDir, folderName, ignoreHidden, extraPatterns)
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
	for i := range scripts {
		if n, ok := names[scripts[i].WorkDir]; ok {
			scripts[i].Name = n
		}
	}

	hasDart := false
	for _, sc := range scripts {
		if sc.Lang == "dart" {
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
func scanBuildDirForLocations(buildDir, productDir, folderName string, ignoreHidden bool, extraPatterns []string) ([]alisclient.PackageScriptLocation, map[string]string, error) {
	if _, err := os.Stat(buildDir); err != nil {
		return nil, nil, fmt.Errorf("build dir not found at %s: %w", buildDir, err)
	}

	manifests := map[string]int{
		"go.mod":           alisclient.VscodeLanguageGO,
		"package.json":     alisclient.VscodeLanguageNODE,
		"requirements.txt": alisclient.VscodeLanguagePYTHON,
		"pubspec.yaml":     alisclient.VscodeLanguageDART,
	}

	skipDirs := map[string]bool{
		"node_modules":     true,
		".dart_tool":       true,
		".symlinks":        true,
		".plugin_symlinks": true,
		".venv":            true,
		"venv":             true,
		"__pypackages__":   true,
	}

	seen := map[string]bool{}
	var locations []alisclient.PackageScriptLocation
	names := map[string]string{}
	err := filepath.WalkDir(buildDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if skipDirs[d.Name()] {
				return filepath.SkipDir
			}
			if ignoreHidden && len(d.Name()) > 0 && d.Name()[0] == '.' {
				return filepath.SkipDir
			}
			for _, pat := range extraPatterns {
				if matched, _ := filepath.Match(pat, d.Name()); matched {
					return filepath.SkipDir
				}
			}
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
		locations = append(locations, alisclient.PackageScriptLocation{
			WorkingDirectory: dir,
			Language:         langEnum,
			BuildDirectory:   productDir,
		})
		rel, _ := filepath.Rel(buildDir, dir)
		if rel == "" || rel == "." {
			names[dir] = folderName
		} else {
			names[dir] = folderName + "/" + filepath.ToSlash(rel)
		}
		return nil
	})
	return locations, names, err
}

// StartPackageScript launches a command in a PTY so the terminal is fully interactive.
func (s *PackageService) StartPackageScript(runID, command, workDir string) error {
	if _, loaded := s.processes.LoadOrStore(runID, nil); loaded {
		return fmt.Errorf("run %s already exists", runID)
	}

	ctx, cancel := context.WithCancel(context.Background())
	p := &packageProcess{cancel: cancel}
	s.processes.Store(runID, p)

	go func() {
		defer cancel()

		shellBin, shellArgs := platformShell()
		cmd := exec.Command(shellBin, shellArgs...)
		cmd.Dir = workDir

		ptmx, err := terminal.Start(cmd, 24, 220)
		if err != nil {
			p.mu.Lock()
			p.done = true
			p.errMsg = err.Error()
			p.mu.Unlock()
			return
		}

		p.mu.Lock()
		p.ptmx = ptmx
		p.mu.Unlock()

		// Kill process when context is cancelled (e.g. user closes the tab).
		go func() {
			<-ctx.Done()
			ptmx.Close()
			if cmd.Process != nil {
				cmd.Process.Kill()
			}
		}()

		// Send the command to the shell once it has had time to initialize.
		go func() {
			time.Sleep(200 * time.Millisecond)
			ptmx.Write([]byte(command + platformShellExitSuffix() + "\n"))
		}()

		exitErrCh := make(chan error, 1)
		go func() {
			exitErrCh <- cmd.Wait()
			ptmx.Close()
		}()

		// Drain PTY output into the buffer.
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
			if n > 0 {
				p.mu.Lock()
				p.buf.Write(buf[:n])
				p.mu.Unlock()
			}
			if err != nil {
				break
			}
		}

		exitErr := <-exitErrCh

		p.mu.Lock()
		p.ptmx = nil
		// If the shell was killed by context cancellation (user closed the tab),
		// don't treat it as an error.
		if exitErr != nil && ctx.Err() == nil {
			fmt.Fprintf(&p.buf, "\r\n\x1b[31m[session ended: %v]\x1b[0m\r\n", exitErr)
			p.errMsg = exitErr.Error()
		} else {
			p.buf.WriteString("\r\n\x1b[2m[session ended]\x1b[0m\r\n")
		}
		p.done = true
		p.mu.Unlock()
	}()

	return nil
}

// WritePackageInput sends keystrokes to the PTY stdin of a running process.
func (s *PackageService) WritePackageInput(runID, data string) error {
	val, ok := s.processes.Load(runID)
	if !ok {
		return fmt.Errorf("unknown run %s", runID)
	}
	p := val.(*packageProcess)
	p.mu.Lock()
	ptmx := p.ptmx
	p.mu.Unlock()
	if ptmx == nil {
		return nil // process already done; silently ignore
	}
	_, err := ptmx.Write([]byte(data))
	return err
}

// ResizePackageTerminal updates the PTY window size, keeping line-wrapping correct.
func (s *PackageService) ResizePackageTerminal(runID string, cols, rows int) error {
	val, ok := s.processes.Load(runID)
	if !ok {
		return fmt.Errorf("unknown run %s", runID)
	}
	p := val.(*packageProcess)
	p.mu.Lock()
	ptmx := p.ptmx
	p.mu.Unlock()
	if ptmx == nil {
		return nil
	}
	return ptmx.Resize(uint16(rows), uint16(cols))
}

// PollPackageRun returns new output since offset. Reuses LocalBuildChunk from buildservice.
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
	return &LocalBuildChunk{
		Content:    string(all[offset:]),
		NextOffset: len(all),
		Done:       done,
		Error:      errMsg,
	}, nil
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

// StartVenvSetup launches the Python venv creation command as a PTY process.
// Mirrors the extension's Imt() — fires without blocking.
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

// =============================================================================
// CLI-backed package operations (alis packages * --json)
// =============================================================================

// CLIPackageResult holds the output of a CLI package command.
type CLIPackageResult struct {
	Output string `json:"output"`
	Error  string `json:"error,omitempty"`
}

// CLIPackagesInstall runs `alis packages install <pkg> --json`.
func (s *PackageService) CLIPackagesInstall(org, product, neuron, version string) (*CLIPackageResult, error) {
	if s.cliRunner == nil {
		return nil, fmt.Errorf("alis CLI not available")
	}
	pkg := org + "." + product + "." + neuron + "." + version
	log.Printf("[packages] CLI install: %s", pkg)
	result, err := s.cliRunner.Run(context.Background(), "packages", "install", pkg, "--json")
	if err != nil {
		return nil, fmt.Errorf("packages install: %w", err)
	}
	return &CLIPackageResult{Output: string(result.Stdout)}, nil
}

// CLIPackagesUpgrade runs `alis packages upgrade <pkg> --json`.
func (s *PackageService) CLIPackagesUpgrade(org, product, neuron, version string, all bool) (*CLIPackageResult, error) {
	if s.cliRunner == nil {
		return nil, fmt.Errorf("alis CLI not available")
	}
	pkg := org + "." + product + "." + neuron + "." + version
	args := []string{"packages", "upgrade", pkg, "--json"}
	if all {
		args = append(args, "--all")
	}
	log.Printf("[packages] CLI upgrade: %s all=%v", pkg, all)
	result, err := s.cliRunner.Run(context.Background(), args...)
	if err != nil {
		return nil, fmt.Errorf("packages upgrade: %w", err)
	}
	return &CLIPackageResult{Output: string(result.Stdout)}, nil
}

// CLIDefineWithInstall runs `alis define <pkg> --json --install` — define + install in one call.
func (s *PackageService) CLIDefineWithInstall(org, product, neuron, version string, commit string) (*CLIPackageResult, error) {
	if s.cliRunner == nil {
		return nil, fmt.Errorf("alis CLI not available")
	}
	pkg := org + "." + product + "." + neuron + "." + version
	args := []string{"define", pkg, "--json", "--install"}
	if commit != "" {
		args = append(args, "--commit", commit)
	}
	log.Printf("[packages] CLI define+install: %s", pkg)
	result, err := s.cliRunner.Run(context.Background(), args...)
	if err != nil {
		return nil, fmt.Errorf("define --install: %w", err)
	}
	return &CLIPackageResult{Output: string(result.Stdout)}, nil
}
