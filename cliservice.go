package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"alis-hub-v3/internal/cliwrap"
)

// CLIService is the Wails-bound surface for alis CLI capabilities that have
// no counterpart elsewhere in the app: skills, ask, diagnostics, accounts,
// resource creation and operation inspection (see cliservice_skills.go and
// cliservice_platform.go), plus package management and context resolution.
//
// Code blocks and environments deliberately live on ProductService instead,
// next to their Console API counterparts and with decoded result types —
// two doors to the same command is how the two paths drift apart.
type CLIService struct {
	runner *cliwrap.Runner
}

// Timeouts by command class. Operations that run server-side (blocks
// install/upgrade/uninstall) are started with --async and polled, so no single
// invocation needs to outlast cliLongTimeout.
const (
	cliQuickTimeout = 30 * time.Second
	cliLongTimeout  = 5 * time.Minute
)

func NewCLIService() *CLIService {
	svc := &CLIService{}
	if r, err := cliwrap.New("alis"); err == nil {
		svc.runner = r
	}
	return svc
}

func (s *CLIService) available() bool { return s.runner != nil }

// run executes a CLI command with a bounded timeout and returns raw stdout.
// Exit-3 approval and production gates are surfaced verbatim so the frontend
// can show the retry command; they must never be auto-approved here.
func (s *CLIService) run(timeout time.Duration, label string, args ...string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	result, err := s.runner.Run(ctx, args...)
	if err != nil {
		return "", fmt.Errorf("%s: %w", label, err)
	}
	return string(result.Stdout), nil
}

// runIn is run with an explicit working directory, for commands that resolve
// their target from the cwd when the reference is omitted. A GUI process
// launched from Finder has cwd "/", where that resolution finds nothing.
func (s *CLIService) runIn(timeout time.Duration, dir, label string, args ...string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	result, err := s.runner.RunIn(ctx, dir, args...)
	if err != nil {
		return "", fmt.Errorf("%s: %w", label, err)
	}
	return string(result.Stdout), nil
}

// =============================================================================
// Packages (delegated to CLI)
// =============================================================================

// CLIPackagesInstall runs `alis packages install <pkg> --json`.
// language, when set, limits the run to one of go/node/python/dart.
func (s *CLIService) CLIPackagesInstall(pkg, language, version string) (string, error) {
	args := []string{"packages", "install", pkg, "--json"}
	if language != "" {
		args = append(args, "--language", language)
	}
	if version != "" {
		args = append(args, "--version", version)
	}
	return s.run(cliLongTimeout, "packages install", args...)
}

// CLIPackagesUpgrade runs `alis packages upgrade <pkg> --json`.
//
// all upgrades third-party packages too, not just alis.build ones. paths
// selects specific package folders or manifests relative to the service, which
// is how nested modules are addressed.
func (s *CLIService) CLIPackagesUpgrade(pkg string, all bool, language string, paths []string) (string, error) {
	args := []string{"packages", "upgrade", pkg, "--json"}
	if all {
		args = append(args, "--all")
	}
	if language != "" {
		args = append(args, "--language", language)
	}
	for _, p := range paths {
		args = append(args, "--path", p)
	}
	return s.run(cliLongTimeout, "packages upgrade", args...)
}

// =============================================================================
// Context
// =============================================================================

// CLIContextView runs `alis context view [<ref>] --json`.
//
// Which fields come back depends on the working directory: packageId and
// serviceFolder appear only when dir is inside a service folder, and the
// environments array only when it is not. Pass dir explicitly — the app's own
// cwd is "/" under a Finder launch, where nothing resolves.
func (s *CLIService) CLIContextView(ref, dir string) (string, error) {
	args := []string{"context", "view", "--json"}
	if ref != "" {
		args = append(args, ref)
	}
	return s.runIn(cliQuickTimeout, dir, "context view", args...)
}

// =============================================================================
// Diagnostics
// =============================================================================

// CLIVersion returns the installed alis CLI version, or an empty string when
// the CLI is not available.
func (s *CLIService) CLIVersion() (string, error) {
	if !s.available() {
		return "", nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), cliQuickTimeout)
	defer cancel()
	return s.runner.Version(ctx)
}

// init registers log output.
func init() {
	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	log.SetPrefix("[cli-svc] ")
}
