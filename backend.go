package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"alis-hub-v3/internal/cliwrap"
)

// DBDBackend abstracts define/build/deploy operations behind either the CLI or gRPC.
//
// The Run*Options methods are the full surface; the narrow Run* forms are kept
// because the existing UI calls them and they read better at those call sites.
// Options the chosen backend cannot express are reported as errors rather than
// dropped — see errCLIOnlyOption.
type DBDBackend interface {
	// RunDefine starts a define operation and returns the operation name.
	RunDefine(ctx context.Context, neuron, commit string) (*RunDefineResult, error)
	// RunDefineOptions starts a define with the full option set.
	RunDefineOptions(ctx context.Context, neuron string, opts DefineOptions) (*RunDefineResult, error)
	// PollDefine polls a running define operation.
	PollDefine(ctx context.Context, opName string) (*RunDefineResult, error)
	// RunBuild starts a build operation and returns the operation name.
	RunBuild(ctx context.Context, neuron, commit string) (*RunBuildResult, error)
	// RunBuildOptions starts a build with the full option set, including a
	// chained deploy.
	RunBuildOptions(ctx context.Context, neuron string, opts BuildOptions) (*RunBuildResult, error)
	// PollBuild polls a running build operation.
	PollBuild(ctx context.Context, opName, neuron string) (*RunBuildResult, error)
	// RunDeploy starts a deploy operation and returns the operation name.
	RunDeploy(ctx context.Context, neuron, version string, environments []string, planOnly bool) (*RunDeployResult, error)
	// RunDeployOptions starts a deploy with the full option set.
	RunDeployOptions(ctx context.Context, neuron string, opts DeployOptions) (*RunDeployResult, error)
	// PollDeploy polls a running deploy operation.
	PollDeploy(ctx context.Context, opName string) (*RunDeployResult, error)
}

// CLIBackend implements DBDBackend by shelling out to the `alis` CLI.
type CLIBackend struct {
	runner *cliwrap.Runner
}

// deployAsyncMeta holds the metadata from `alis deploy --json --async` output.
// This is the raw longrunning.Operation envelope, so error is a Status object —
// unlike `alis operations describe`, which flattens it to a string.
type deployAsyncMeta struct {
	Name     string              `json:"name"`
	Done     bool                `json:"done"`
	Metadata deployAsyncMetadata `json:"metadata"`
	Error    *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

type deployAsyncMetadata struct {
	Version     string                  `json:"version"`
	Notes       string                  `json:"notes"`
	Deployments []deployAsyncDeployment `json:"deployments"`
}

type deployAsyncDeployment struct {
	Name    string `json:"name"`
	State   string `json:"state"`
	LogsURL string `json:"logsUrl"`
}

// NewCLIBackend creates a CLIBackend. Returns an error if alis is not in PATH.
func NewCLIBackend() (*CLIBackend, error) {
	runner, err := cliwrap.New("alis")
	if err != nil {
		return nil, fmt.Errorf("CLI backend unavailable: %w", err)
	}
	return &CLIBackend{runner: runner}, nil
}

// Runner exposes the underlying CLI runner for callers that need to probe the
// installed binary (version checks, diagnostics).
func (b *CLIBackend) Runner() *cliwrap.Runner { return b.runner }

// reportCLIVersion logs the installed CLI version and warns when it predates
// the version this app is verified against. It runs off the startup path
// because it costs a process spawn, and never blocks launch: an old CLI still
// works for most flows, it just fails later on newer flags (block instances,
// `environment branches`) with an opaque usage error unless we say so here.
func reportCLIVersion(b *CLIBackend) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	version, ok, err := b.runner.CheckMinVersion(ctx)
	switch {
	case err != nil:
		log.Printf("[main] could not determine alis CLI version: %v", err)
	case !ok:
		log.Printf("[main] WARNING: alis CLI %s is older than the verified minimum %s — "+
			"run `alis upgrade`; some operations may fail with usage errors",
			version, cliwrap.MinVersion)
	default:
		log.Printf("[main] alis CLI %s (verified minimum %s)", version, cliwrap.MinVersion)
	}
}

// confirmationRequired converts an exit-3 error into the (code, retry) pair the
// frontend renders as an approval prompt.
//
// Exit 3 covers both the production deploy gate and the caller's automation
// tier gating a mutating command. A desktop app is not a harness with a
// standing approval grant, so users on the "manual" tier hit this on every
// define/build/deploy. In both cases the app must show the retry command and
// let the user decide — never inject --approve or --confirm-production itself.
func confirmationRequired(err error) (code, retry string, ok bool) {
	cerr, ok := cliwrap.AsConfirmationRequired(err)
	if !ok {
		return "", "", false
	}
	code = cerr.Code
	if code == "" {
		code = cliwrap.CodeApprovalRequired
	}
	return code, cerr.RetryCmd, true
}

func (b *CLIBackend) RunDefine(ctx context.Context, neuron, commit string) (*RunDefineResult, error) {
	return b.RunDefineOptions(ctx, neuron, DefineOptions{Commit: commit})
}

func (b *CLIBackend) RunDefineOptions(ctx context.Context, neuron string, opts DefineOptions) (*RunDefineResult, error) {
	if opts.needsGRPC() {
		return nil, errCLIOnlyOption("releaseType")
	}
	pkg := cliwrap.NeuronToPackageID(neuron)
	args := defineArgs(pkg, opts)

	op, err := b.runner.RunAsyncOperation(ctx, args...)
	if err != nil {
		if code, retry, ok := confirmationRequired(err); ok {
			return &RunDefineResult{Error: code, Notes: retry}, nil
		}
		return nil, fmt.Errorf("RunDefine: %w", err)
	}
	// A define can fail server-side before --async returns — unreachable proto
	// files, for instance — arriving already done, with the failure only in the
	// envelope and an exit code of 0. Report it now instead of handing the
	// caller an operation to poll that will never change.
	return &RunDefineResult{
		OperationName: op.Name,
		Done:          op.Done,
		Error:         op.ErrorMessage(),
	}, nil
}

func (b *CLIBackend) PollDefine(ctx context.Context, opName string) (*RunDefineResult, error) {
	state, err := b.runner.Describe(ctx, opName)
	if err != nil {
		return nil, fmt.Errorf("poll define: %w", err)
	}

	result := &RunDefineResult{
		OperationName: opName,
		Done:          state.Done,
		Version:       state.Version,
		Notes:         state.Notes,
		Error:         state.Error,
	}
	for _, a := range state.Artifacts {
		result.DefinitionArtifacts = append(result.DefinitionArtifacts, a.Name)
	}
	return result, nil
}

func (b *CLIBackend) RunBuild(ctx context.Context, neuron, commit string) (*RunBuildResult, error) {
	return b.RunBuildOptions(ctx, neuron, BuildOptions{Commit: commit})
}

func (b *CLIBackend) RunBuildOptions(ctx context.Context, neuron string, opts BuildOptions) (*RunBuildResult, error) {
	pkg := cliwrap.NeuronToPackageID(neuron)
	args := buildArgs(pkg, opts)

	op, err := b.runner.RunAsyncOperation(ctx, args...)
	if err != nil {
		if code, retry, ok := confirmationRequired(err); ok {
			return &RunBuildResult{Error: code, Notes: retry}, nil
		}
		return nil, fmt.Errorf("RunBuild: %w", err)
	}
	// See RunDefine: a build can arrive already failed with exit code 0.
	return &RunBuildResult{
		OperationName: op.Name,
		Done:          op.Done,
		Error:         op.ErrorMessage(),
	}, nil
}

func (b *CLIBackend) PollBuild(ctx context.Context, opName, neuron string) (*RunBuildResult, error) {
	state, err := b.runner.Describe(ctx, opName)
	if err != nil {
		return nil, fmt.Errorf("poll build: %w", err)
	}

	return &RunBuildResult{
		OperationName: opName,
		Done:          state.Done,
		Version:       state.Version,
		LogsURL:       state.LogsURI,
		Notes:         state.Notes,
		Error:         state.Error,
	}, nil
}

func (b *CLIBackend) RunDeploy(ctx context.Context, neuron, version string, environments []string, planOnly bool) (*RunDeployResult, error) {
	return b.RunDeployOptions(ctx, neuron, DeployOptions{
		Version:      version,
		Environments: environments,
		PlanOnly:     planOnly,
	})
}

func (b *CLIBackend) RunDeployOptions(ctx context.Context, neuron string, opts DeployOptions) (*RunDeployResult, error) {
	if opts.needsGRPC() {
		return nil, errCLIOnlyOption("beta")
	}
	pkg := cliwrap.NeuronToPackageID(neuron)
	args := deployArgs(pkg, opts)

	stdout, err := b.runner.RunAsync(ctx, args...)
	if err != nil {
		// Exit 3 is either the production gate or an automation-tier gate;
		// report whichever it actually was rather than assuming production.
		if code, retry, ok := confirmationRequired(err); ok {
			return &RunDeployResult{Error: code, Notes: retry}, nil
		}
		return nil, fmt.Errorf("RunDeploy: %w", err)
	}

	// Parse the full --async output to get operation name + per-environment deployments.
	var meta deployAsyncMeta
	if err := json.Unmarshal(stdout, &meta); err != nil {
		return nil, fmt.Errorf("parse deploy async: %w", err)
	}

	result := &RunDeployResult{
		OperationName: meta.Name,
		// See RunDefine: a deploy can arrive already failed with exit code 0,
		// its failure carried only in the envelope's error object.
		Done:    meta.Done,
		Version: meta.Metadata.Version,
		Notes:   meta.Metadata.Notes,
	}
	if meta.Error != nil {
		result.Error = meta.Error.Message
	}
	for _, d := range meta.Metadata.Deployments {
		result.Deployments = append(result.Deployments, &DeployItem{LogsURL: d.LogsURL})
	}
	return result, nil
}

func (b *CLIBackend) PollDeploy(ctx context.Context, opName string) (*RunDeployResult, error) {
	state, err := b.runner.Describe(ctx, opName)
	if err != nil {
		return nil, fmt.Errorf("poll deploy: %w", err)
	}

	result := &RunDeployResult{
		OperationName: opName,
		Done:          state.Done,
		Version:       state.Version,
		Notes:         state.Notes,
		Error:         state.Error,
	}
	for _, d := range state.Deployments {
		result.Deployments = append(result.Deployments, &DeployItem{LogsURL: d.LogsURL})
	}
	// Fallback: if no per-environment deployments but a top-level logsUri is present,
	// surface it so FetchDeployLogs can stream it.
	if len(result.Deployments) == 0 && state.LogsURI != "" {
		result.Deployments = []*DeployItem{{LogsURL: state.LogsURI}}
	}
	return result, nil
}

// GRPCBackend implements DBDBackend using the existing AlisClient gRPC calls.
type GRPCBackend struct {
	defineSvc *DefineService
	buildSvc  *BuildService
	deploySvc *DeployService
}

// NewGRPCBackend creates a GRPCBackend wrapping the existing gRPC services.
// The services' alisClient is initialized lazily on first use.
func NewGRPCBackend(defineSvc *DefineService, buildSvc *BuildService, deploySvc *DeployService) *GRPCBackend {
	return &GRPCBackend{defineSvc: defineSvc, buildSvc: buildSvc, deploySvc: deploySvc}
}

// RunDefine defines with the server's default release type. Callers needing a
// specific release type go through DefineService.RunDefine, which routes
// straight to the gRPC implementation — the DBDBackend interface deliberately
// stays at the intersection of what both backends can express.
func (b *GRPCBackend) RunDefine(ctx context.Context, neuron, commit string) (*RunDefineResult, error) {
	return b.defineSvc.runDefineGRPC(ctx, neuron, commit, "")
}

func (b *GRPCBackend) PollDefine(ctx context.Context, opName string) (*RunDefineResult, error) {
	return b.defineSvc.pollDefineGRPC(ctx, opName)
}

func (b *GRPCBackend) RunBuild(ctx context.Context, neuron, commit string) (*RunBuildResult, error) {
	return b.buildSvc.runBuildGRPC(ctx, neuron, commit)
}

func (b *GRPCBackend) PollBuild(ctx context.Context, opName, neuron string) (*RunBuildResult, error) {
	return b.buildSvc.pollBuildGRPC(ctx, opName, neuron)
}

// RunDeploy deploys without the beta flag. Beta deploys go through
// DeployService.RunDeploy, which routes straight to the gRPC implementation.
func (b *GRPCBackend) RunDeploy(ctx context.Context, neuron, version string, environments []string, planOnly bool) (*RunDeployResult, error) {
	return b.deploySvc.runDeployGRPC(ctx, neuron, version, environments, planOnly, false)
}

// RunDefineOptions honours Commit and ReleaseType. Install chaining is a CLI
// feature — the gRPC service defines only, so callers must run the package
// install themselves rather than have it silently not happen.
func (b *GRPCBackend) RunDefineOptions(ctx context.Context, neuron string, opts DefineOptions) (*RunDefineResult, error) {
	if opts.Install {
		return nil, errCLIOnlyOption("install")
	}
	return b.defineSvc.runDefineGRPC(ctx, neuron, opts.Commit, opts.ReleaseType)
}

// RunBuildOptions honours Commit, the build/retag path selection and a chained
// deploy. Branch pinning and the three gate flags have no request field, so
// they are refused rather than ignored: silently building the wrong commit or
// dropping --plan-only would both be worse than failing.
func (b *GRPCBackend) RunBuildOptions(ctx context.Context, neuron string, opts BuildOptions) (*RunBuildResult, error) {
	switch {
	case opts.Branch != "":
		return nil, errCLIOnlyOption("branch")
	case opts.ConfirmNoPaths:
		return nil, errCLIOnlyOption("confirmNoPaths")
	case opts.AllowBranchMismatch:
		return nil, errCLIOnlyOption("allowBranchMismatch")
	case opts.ConfirmProduction:
		return nil, errCLIOnlyOption("confirmProduction")
	case opts.PlanOnly:
		// The nested gRPC deploy request does carry PlanOnly, but this backend
		// has no path that threads it through RunBuild today; refusing keeps a
		// plan-only request from becoming a real apply.
		return nil, errCLIOnlyOption("planOnly with build")
	case opts.Deploy || len(opts.Environments) > 0:
		return nil, errCLIOnlyOption("deploy chaining")
	case len(opts.BuildPaths) > 0 || len(opts.RetagPaths) > 0 || opts.Retag:
		return nil, errCLIOnlyOption("build/retag path selection")
	}
	return b.buildSvc.runBuildGRPC(ctx, neuron, opts.Commit)
}

// RunDeployOptions honours Version, Environments, PlanOnly and Beta. The gate
// flags exist only in the CLI.
func (b *GRPCBackend) RunDeployOptions(ctx context.Context, neuron string, opts DeployOptions) (*RunDeployResult, error) {
	switch {
	case opts.AllowBranchMismatch:
		return nil, errCLIOnlyOption("allowBranchMismatch")
	case opts.ConfirmProduction:
		return nil, errCLIOnlyOption("confirmProduction")
	}
	return b.deploySvc.runDeployGRPC(ctx, neuron, opts.Version, opts.Environments, opts.PlanOnly, opts.Beta)
}

func (b *GRPCBackend) PollDeploy(ctx context.Context, opName string) (*RunDeployResult, error) {
	return b.deploySvc.pollDeployGRPC(ctx, opName)
}
