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
type DBDBackend interface {
	// RunDefine starts a define operation and returns the operation name.
	RunDefine(ctx context.Context, neuron, commit string) (*RunDefineResult, error)
	// PollDefine polls a running define operation.
	PollDefine(ctx context.Context, opName string) (*RunDefineResult, error)
	// RunBuild starts a build operation and returns the operation name.
	RunBuild(ctx context.Context, neuron, commit string) (*RunBuildResult, error)
	// PollBuild polls a running build operation.
	PollBuild(ctx context.Context, opName, neuron string) (*RunBuildResult, error)
	// RunDeploy starts a deploy operation and returns the operation name.
	RunDeploy(ctx context.Context, neuron, version string, environments []string, planOnly bool) (*RunDeployResult, error)
	// PollDeploy polls a running deploy operation.
	PollDeploy(ctx context.Context, opName string) (*RunDeployResult, error)
}

// CLIBackend implements DBDBackend by shelling out to the `alis` CLI.
type CLIBackend struct {
	runner *cliwrap.Runner
}

// deployAsyncMeta holds the metadata from `alis deploy --json --async` output.
type deployAsyncMeta struct {
	Name     string              `json:"name"`
	Metadata deployAsyncMetadata `json:"metadata"`
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
	pkg := cliwrap.NeuronToPackageID(neuron)
	args := []string{"define", pkg, "--json"}
	if commit != "" {
		args = append(args, "--commit", commit)
	}

	opName, err := b.runner.RunAsyncName(ctx, args...)
	if err != nil {
		if code, retry, ok := confirmationRequired(err); ok {
			return &RunDefineResult{Error: code, Notes: retry}, nil
		}
		return nil, fmt.Errorf("RunDefine: %w", err)
	}
	return &RunDefineResult{OperationName: opName, Done: false}, nil
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
	pkg := cliwrap.NeuronToPackageID(neuron)
	args := []string{"build", pkg, "--json"}
	if commit != "" {
		args = append(args, "--commit", commit)
	}

	opName, err := b.runner.RunAsyncName(ctx, args...)
	if err != nil {
		if code, retry, ok := confirmationRequired(err); ok {
			return &RunBuildResult{Error: code, Notes: retry}, nil
		}
		return nil, fmt.Errorf("RunBuild: %w", err)
	}
	return &RunBuildResult{OperationName: opName, Done: false}, nil
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
	pkg := cliwrap.NeuronToPackageID(neuron)
	args := []string{"deploy", pkg, "--json"}
	if version != "" {
		args = append(args, "--version", version)
	}
	for _, env := range environments {
		args = append(args, "-e", cliwrap.ExtractEnvID(env))
	}
	if planOnly {
		args = append(args, "--plan-only")
	}

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
		Done:          false,
		Version:       meta.Metadata.Version,
		Notes:         meta.Metadata.Notes,
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

func (b *GRPCBackend) PollDeploy(ctx context.Context, opName string) (*RunDeployResult, error) {
	return b.deploySvc.pollDeployGRPC(ctx, opName)
}
