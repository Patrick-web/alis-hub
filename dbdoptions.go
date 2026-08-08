package main

import (
	"fmt"

	"alis-hub-v3/internal/cliwrap"
)

// Option sets for Define, Build and Deploy, covering everything the `alis` CLI
// can express plus the few things only the gRPC path can.
//
// These cross the Wails boundary, so they are plain structs with JSON tags. The
// zero value of each reproduces the behaviour of the original narrow
// RunDefine/RunBuild/RunDeploy calls, which is what keeps the existing UI
// working unchanged.
//
// Argument construction lives here as pure functions so it can be tested
// without running anything — see dbdoptions_test.go.

// DefineOptions covers `alis define`.
type DefineOptions struct {
	// Commit pins the definitions-repo commit. Empty means the latest pushed
	// commit, which is the normal case.
	Commit string `json:"commit"`
	// Install chains `alis packages install` once the define succeeds, so
	// generated packages are refreshed in the same operation.
	Install bool `json:"install"`
	// InstallLanguage limits that install to one of go/node/python/dart.
	InstallLanguage string `json:"installLanguage"`
	// ReleaseType has no CLI equivalent; setting it routes the call to gRPC.
	ReleaseType string `json:"releaseType"`
}

// BuildOptions covers `alis build`.
type BuildOptions struct {
	// Commit pins the build-repo commit; empty means the latest commit
	// touching the service folder.
	Commit string `json:"commit"`
	// Branch requires the built commit to come from this branch. Without
	// Commit, it builds that branch's latest commit for the service.
	Branch string `json:"branch"`
	// BuildPaths are Dockerfile paths relative to the service folder. Empty
	// lets the CLI auto-detect, which is the normal case.
	BuildPaths []string `json:"buildPaths"`
	// Retag retags the previous images instead of building, for changes that
	// touch only deployment infrastructure.
	Retag bool `json:"retag"`
	// RetagPaths narrows what Retag applies to.
	RetagPaths []string `json:"retagPaths"`
	// ConfirmNoPaths acknowledges that the service has no images to build or
	// retag. Without it such a build fails rather than silently doing nothing.
	ConfirmNoPaths bool `json:"confirmNoPaths"`

	// Deploy chains a deploy onto a successful build.
	Deploy bool `json:"deploy"`
	// Environments are the ids to deploy to when Deploy is set. They come from
	// `alis context view`, never from guessing.
	Environments []string `json:"environments"`
	// PlanOnly runs Terraform plan without applying. Not gated for production,
	// so it is the safe way to preview one.
	PlanOnly bool `json:"planOnly"`
	// AllowBranchMismatch proceeds when the built branch is not designated for
	// a target environment (see `alis environment branches`).
	AllowBranchMismatch bool `json:"allowBranchMismatch"`
	// ConfirmProduction lifts the production gate. Set it only after a human
	// has explicitly approved this specific deploy.
	ConfirmProduction bool `json:"confirmProduction"`
}

// DeployOptions covers `alis deploy`.
type DeployOptions struct {
	// Version selects a build version; empty deploys the latest.
	Version string `json:"version"`
	// Environments are the ids to deploy to. When empty and the product has
	// exactly one environment, the CLI uses it; otherwise it errors and lists
	// the ids rather than choosing.
	Environments        []string `json:"environments"`
	PlanOnly            bool     `json:"planOnly"`
	AllowBranchMismatch bool     `json:"allowBranchMismatch"`
	// ConfirmProduction lifts the production gate — human approval only.
	ConfirmProduction bool `json:"confirmProduction"`
	// Beta has no CLI equivalent; setting it routes the call to gRPC.
	Beta bool `json:"beta"`
}

// needsGRPC reports options the CLI cannot express.
func (o DefineOptions) needsGRPC() bool { return o.ReleaseType != "" }
func (o DeployOptions) needsGRPC() bool { return o.Beta }

// defineArgs builds `alis define <pkg> --json [...]`.
func defineArgs(pkg string, o DefineOptions) []string {
	args := []string{"define", pkg, "--json"}
	if o.Commit != "" {
		args = append(args, "--commit", o.Commit)
	}
	if o.Install {
		args = append(args, "--install")
		// --install-language is only meaningful alongside --install.
		if o.InstallLanguage != "" {
			args = append(args, "--install-language", o.InstallLanguage)
		}
	}
	return args
}

// buildArgs builds `alis build <pkg> --json [...]`.
func buildArgs(pkg string, o BuildOptions) []string {
	args := []string{"build", pkg, "--json"}
	if o.Commit != "" {
		args = append(args, "--commit", o.Commit)
	}
	if o.Branch != "" {
		args = append(args, "--branch", o.Branch)
	}
	for _, p := range o.BuildPaths {
		args = append(args, "--build-path", p)
	}
	if o.Retag {
		args = append(args, "--retag")
	}
	for _, p := range o.RetagPaths {
		args = append(args, "--retag-path", p)
	}
	if o.ConfirmNoPaths {
		args = append(args, "--confirm-no-paths")
	}

	// The deploy-related flags are only accepted alongside --deploy.
	if o.Deploy {
		args = append(args, "--deploy")
		for _, env := range o.Environments {
			args = append(args, "-e", cliwrap.ExtractEnvID(env))
		}
		if o.PlanOnly {
			args = append(args, "--plan-only")
		}
		if o.AllowBranchMismatch {
			args = append(args, "--allow-branch-mismatch")
		}
		if o.ConfirmProduction {
			args = append(args, "--confirm-production")
		}
	}
	return args
}

// deployArgs builds `alis deploy <pkg> --json [...]`.
func deployArgs(pkg string, o DeployOptions) []string {
	args := []string{"deploy", pkg, "--json"}
	if o.Version != "" {
		args = append(args, "--version", o.Version)
	}
	for _, env := range o.Environments {
		args = append(args, "-e", cliwrap.ExtractEnvID(env))
	}
	if o.PlanOnly {
		args = append(args, "--plan-only")
	}
	if o.AllowBranchMismatch {
		args = append(args, "--allow-branch-mismatch")
	}
	if o.ConfirmProduction {
		args = append(args, "--confirm-production")
	}
	return args
}

// errCLIOnlyOption reports an option the gRPC fallback cannot honour. Returning
// this rather than ignoring the field keeps the failure visible: a silently
// dropped --retag or --plan-only is the difference between a preview and a
// real apply.
func errCLIOnlyOption(option string) error {
	return fmt.Errorf("%s requires the alis CLI backend; it has no gRPC equivalent", option)
}
