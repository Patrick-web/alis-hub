package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"alis-hub-v3/internal/cliwrap"
)

// CLIService provides CLI-backed operations for packages, code blocks, and
// environment management. It is a Wails-bound service that can be called
// from the frontend as an alternative to the gRPC/Console API paths.
//
// Every method returns the CLI's raw JSON stdout as a string. Callers on the
// frontend parse it against the shapes recorded in
// docs/ALIS_CLI_FEATURES.md § Verified JSON Response Shapes.
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

// blockArgs assembles `<block-id> [<pkg>] [--instance <ref>]`.
//
// Argument order is block id first, package id second — `alis docs codeblocks`
// shows the reverse, but `alis blocks install --help` is authoritative.
//
// instance addresses one install when the same block is installed into a
// service more than once ("blocks/<block-id>/instances/<n>"). The CLI requires
// it in that case; a bare block id either fails or acts on the wrong install.
// Callers get instance refs from CLIBlocksList.
func blockArgs(blockID, pkg, instance string) []string {
	args := []string{blockID}
	if pkg != "" {
		args = append(args, pkg)
	}
	if instance != "" {
		args = append(args, "--instance", instance)
	}
	return args
}

// =============================================================================
// Code blocks
// =============================================================================

// CLIBlocksList runs `alis blocks list [<pkg>] --json`.
//
// The response splits into `installed` and `available`. Two flags on available
// blocks gate the UI: `agenticInstallOnly` blocks cannot be installed through a
// plain install action, and `deprecated` blocks should not be offered at all.
func (s *CLIService) CLIBlocksList(pkg string) (string, error) {
	args := []string{"blocks", "list", "--json"}
	if pkg != "" {
		args = append(args, pkg)
	}
	return s.run(cliQuickTimeout, "blocks list", args...)
}

// CLIBlocksInstall runs `alis blocks install <blockId> [<pkg>] --json`.
//
// noMerge maps to --no-merge. Without it the CLI, after the server-side install
// completes, merges the generated block/* branch into main in *both* the
// product build repo and the org define repo and pushes. Those are the same
// working trees this app's git UI operates on, so callers that cannot
// guarantee a clean tree should pass noMerge and run CLIBlocksMerge later.
func (s *CLIService) CLIBlocksInstall(blockID, pkg, version, buildFolder string, noMerge bool) (string, error) {
	args := append([]string{"blocks", "install"}, blockArgs(blockID, pkg, "")...)
	args = append(args, "--json")
	if version != "" {
		args = append(args, "--version", version)
	}
	if buildFolder != "" {
		args = append(args, "--build-folder", buildFolder)
	}
	if noMerge {
		args = append(args, "--no-merge")
	}
	return s.run(cliLongTimeout, "blocks install", args...)
}

// CLIBlocksUpgrade runs `alis blocks upgrade <blockId> [<pkg>] --json`.
// See CLIBlocksInstall for the noMerge and instance semantics.
func (s *CLIService) CLIBlocksUpgrade(blockID, pkg, instance, version string, noMerge bool) (string, error) {
	args := append([]string{"blocks", "upgrade"}, blockArgs(blockID, pkg, instance)...)
	args = append(args, "--json")
	if version != "" {
		args = append(args, "--version", version)
	}
	if noMerge {
		args = append(args, "--no-merge")
	}
	return s.run(cliLongTimeout, "blocks upgrade", args...)
}

// CLIBlocksUninstall runs `alis blocks uninstall <blockId> [<pkg>] --json`.
// Uninstall is classed as destructive, so it is gated on every automation tier
// except "autonomous" — expect an exit-3 APPROVAL_REQUIRED envelope and show
// the user its retry command rather than passing --approve here.
func (s *CLIService) CLIBlocksUninstall(blockID, pkg, instance string) (string, error) {
	args := append([]string{"blocks", "uninstall"}, blockArgs(blockID, pkg, instance)...)
	args = append(args, "--json")
	return s.run(cliLongTimeout, "blocks uninstall", args...)
}

// CLIBlocksMerge runs `alis blocks merge <blockId> [<pkg>] --json`, merging an
// installed block's branch into the local build and define repos. This is the
// deferred half of an install or upgrade run with --no-merge.
func (s *CLIService) CLIBlocksMerge(blockID, pkg, instance string) (string, error) {
	args := append([]string{"blocks", "merge"}, blockArgs(blockID, pkg, instance)...)
	args = append(args, "--json")
	return s.run(cliLongTimeout, "blocks merge", args...)
}

// CLIBlocksVersions runs `alis blocks versions <blockId> --json`.
func (s *CLIService) CLIBlocksVersions(blockID string) (string, error) {
	return s.run(cliQuickTimeout, "blocks versions", "blocks", "versions", blockID, "--json")
}

// =============================================================================
// Git credential setup
// =============================================================================

// CLIAuthorise runs `alis authorise <org>.<product> --json` to configure git
// credential helpers and refresh package credentials for a product.
func (s *CLIService) CLIAuthorise(org, product string) (string, error) {
	return s.run(cliQuickTimeout, "authorise", "authorise", org+"."+product, "--json")
}

// CLIGitConfigure runs `alis git configure <org>.<product> --json`.
//
// The response contains live ID tokens (defineGitConfig.idToken,
// buildGitConfig.idToken). Callers must not log or persist it.
func (s *CLIService) CLIGitConfigure(org, product string) (string, error) {
	return s.run(cliQuickTimeout, "git configure", "git", "configure", org+"."+product, "--json")
}

// =============================================================================
// Environment management
// =============================================================================

// CLIEnvVariables runs `alis environment variables <org>.<product> --json`.
// Each environment carries a canUpdate flag reporting whether the caller holds
// roles/environment.admin; use it to disable editing rather than letting the
// write fail.
func (s *CLIService) CLIEnvVariables(org, product string) (string, error) {
	return s.run(cliQuickTimeout, "environment variables", "environment", "variables", org+"."+product, "--json")
}

// CLIEnvSet runs `alis environment set <org>.<product>.<env> KEY=VALUE --json`.
//
// deploy maps to --deploy: without it the variable is stored immediately but
// running services keep the old value until their next deploy.
//
// Writing to a production environment returns exit 3 with
// PRODUCTION_CONFIRMATION_REQUIRED. That is surfaced to the caller unchanged —
// --confirm-production is never added here.
//
// Concurrent edits (this app vs. the console) are last-writer-wins with no
// merge, so callers should re-read after writing rather than assuming the
// local view is current.
func (s *CLIService) CLIEnvSet(org, product, env, key, value string, deploy bool) (string, error) {
	args := []string{"environment", "set", org + "." + product + "." + env, key + "=" + value, "--json"}
	if deploy {
		args = append(args, "--deploy")
	}
	return s.run(cliLongTimeout, "environment set", args...)
}

// CLIEnvUnset runs `alis environment unset <org>.<product>.<env> KEY --json`.
// Unset is destructive, so it is gated at the "balanced" tier and above; see
// CLIEnvSet for the production and --deploy semantics.
func (s *CLIService) CLIEnvUnset(org, product, env, key string, deploy bool) (string, error) {
	args := []string{"environment", "unset", org + "." + product + "." + env, key, "--json"}
	if deploy {
		args = append(args, "--deploy")
	}
	return s.run(cliLongTimeout, "environment unset", args...)
}

// CLIEnvRefresh runs `alis environment refresh <org>.<product>.<env> --json`,
// returning the environment's .env content. keyPath, when set, is where the
// service account key is written and becomes GOOGLE_APPLICATION_CREDENTIALS in
// the emitted .env.
func (s *CLIService) CLIEnvRefresh(org, product, env, keyPath string) (string, error) {
	args := []string{"environment", "refresh", org + "." + product + "." + env, "--json"}
	if keyPath != "" {
		args = append(args, "--key-path", keyPath)
	}
	return s.run(cliQuickTimeout, "environment refresh", args...)
}

// CLIEnvBranches runs `alis environment branches <ref> --json` to view the git
// branches an environment may deploy from. dir supplies the working directory
// used to resolve the target when ref is empty.
func (s *CLIService) CLIEnvBranches(ref, dir string) (string, error) {
	args := []string{"environment", "branches", "--json"}
	if ref != "" {
		args = append(args, ref)
	}
	return s.runIn(cliQuickTimeout, dir, "environment branches", args...)
}

// CLIEnvSetBranches designates which branches may deploy to an environment.
// allow replaces the current designation wholesale; an empty allow with
// clear=true removes the designation so any branch may deploy.
func (s *CLIService) CLIEnvSetBranches(ref string, allow []string, clear bool) (string, error) {
	args := []string{"environment", "branches", "--json"}
	if ref != "" {
		args = append(args, ref)
	}
	if clear {
		args = append(args, "--clear")
	}
	for _, b := range allow {
		args = append(args, "--allow", b)
	}
	return s.run(cliQuickTimeout, "environment branches", args...)
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

// CLIDoctor runs `alis doctor --json --no-logs`, a local-only snapshot (nothing
// is uploaded without --ticket). Useful fields: cliVersion, auth.authorized,
// auth.buildAccount, settings.approvals (the automation tier; {} means the
// default "balanced") and settings.safeMode.allowedOrganisationIds.
func (s *CLIService) CLIDoctor() (string, error) {
	return s.run(cliQuickTimeout, "doctor", "doctor", "--json", "--no-logs")
}

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
