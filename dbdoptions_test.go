package main

import (
	"strings"
	"testing"
)

// joined renders args for readable assertions and substring checks.
func joined(args []string) string { return strings.Join(args, " ") }

// hasFlagValue reports whether args contains `flag value` adjacently. Checking
// adjacency matters: a flag whose value landed elsewhere in the slice would
// still pass a naive "contains" test while meaning something different to the CLI.
func hasFlagValue(args []string, flag, value string) bool {
	for i := 0; i < len(args)-1; i++ {
		if args[i] == flag && args[i+1] == value {
			return true
		}
	}
	return false
}

func countFlag(args []string, flag string) int {
	n := 0
	for _, a := range args {
		if a == flag {
			n++
		}
	}
	return n
}

func TestDefineArgs(t *testing.T) {
	t.Run("zero options reproduce the plain define", func(t *testing.T) {
		got := defineArgs("voyage.zz.dummy.v1", DefineOptions{})
		want := "define voyage.zz.dummy.v1 --json"
		if joined(got) != want {
			t.Errorf("got %q, want %q", joined(got), want)
		}
	})

	t.Run("commit pin", func(t *testing.T) {
		got := defineArgs("p", DefineOptions{Commit: "abc123"})
		if !hasFlagValue(got, "--commit", "abc123") {
			t.Errorf("commit not passed: %v", got)
		}
	})

	t.Run("install chaining", func(t *testing.T) {
		got := defineArgs("p", DefineOptions{Install: true, InstallLanguage: "go"})
		if countFlag(got, "--install") != 1 {
			t.Errorf("--install missing: %v", got)
		}
		if !hasFlagValue(got, "--install-language", "go") {
			t.Errorf("--install-language not passed: %v", got)
		}
	})

	t.Run("install-language is dropped without install", func(t *testing.T) {
		// The CLI only accepts it alongside --install; emitting it alone would
		// be a usage error rather than a no-op.
		got := defineArgs("p", DefineOptions{InstallLanguage: "go"})
		if strings.Contains(joined(got), "--install-language") {
			t.Errorf("--install-language emitted without --install: %v", got)
		}
	})
}

func TestBuildArgs(t *testing.T) {
	t.Run("zero options reproduce the plain build", func(t *testing.T) {
		got := buildArgs("voyage.zz.dummy.v1", BuildOptions{})
		want := "build voyage.zz.dummy.v1 --json"
		if joined(got) != want {
			t.Errorf("got %q, want %q", joined(got), want)
		}
	})

	t.Run("commit and branch", func(t *testing.T) {
		got := buildArgs("p", BuildOptions{Commit: "sha1", Branch: "master"})
		if !hasFlagValue(got, "--commit", "sha1") || !hasFlagValue(got, "--branch", "master") {
			t.Errorf("commit/branch not passed: %v", got)
		}
	})

	t.Run("repeatable build and retag paths", func(t *testing.T) {
		got := buildArgs("p", BuildOptions{
			BuildPaths: []string{".", "worker"},
			Retag:      true,
			RetagPaths: []string{"sidecar"},
		})
		if countFlag(got, "--build-path") != 2 {
			t.Errorf("expected two --build-path flags: %v", got)
		}
		if !hasFlagValue(got, "--build-path", ".") || !hasFlagValue(got, "--build-path", "worker") {
			t.Errorf("build paths not passed: %v", got)
		}
		if countFlag(got, "--retag") != 1 {
			t.Errorf("--retag missing: %v", got)
		}
		if !hasFlagValue(got, "--retag-path", "sidecar") {
			t.Errorf("retag path not passed: %v", got)
		}
	})

	t.Run("confirm-no-paths", func(t *testing.T) {
		got := buildArgs("p", BuildOptions{ConfirmNoPaths: true})
		if countFlag(got, "--confirm-no-paths") != 1 {
			t.Errorf("--confirm-no-paths missing: %v", got)
		}
	})

	t.Run("chained deploy passes environment ids, not resource names", func(t *testing.T) {
		got := buildArgs("p", BuildOptions{
			Deploy: true,
			Environments: []string{
				"organisations/voyage/products/zz/environments/1y2ozw2i3fsru",
				"bare-env-id",
			},
			PlanOnly: true,
		})
		if countFlag(got, "--deploy") != 1 {
			t.Errorf("--deploy missing: %v", got)
		}
		// A full resource name would be rejected; -e takes the bare id.
		if !hasFlagValue(got, "-e", "1y2ozw2i3fsru") {
			t.Errorf("resource name not reduced to an env id: %v", got)
		}
		if !hasFlagValue(got, "-e", "bare-env-id") {
			t.Errorf("bare env id not passed through: %v", got)
		}
		if countFlag(got, "--plan-only") != 1 {
			t.Errorf("--plan-only missing: %v", got)
		}
	})

	t.Run("deploy-only flags are suppressed without deploy", func(t *testing.T) {
		// These are only valid alongside --deploy. Emitting --plan-only on a
		// bare build is a usage error, and worse, emitting -e would look like
		// the caller asked to deploy.
		got := buildArgs("p", BuildOptions{
			Environments:        []string{"dev"},
			PlanOnly:            true,
			AllowBranchMismatch: true,
			ConfirmProduction:   true,
		})
		for _, flag := range []string{"-e", "--plan-only", "--allow-branch-mismatch", "--confirm-production"} {
			if strings.Contains(joined(got), flag) {
				t.Errorf("%s emitted without --deploy: %v", flag, got)
			}
		}
	})

	t.Run("production confirmation is only ever explicit", func(t *testing.T) {
		// Nothing may add --confirm-production on its own; it appears only when
		// the caller set it after human approval.
		got := buildArgs("p", BuildOptions{Deploy: true, Environments: []string{"prod"}})
		if strings.Contains(joined(got), "--confirm-production") {
			t.Errorf("--confirm-production added implicitly: %v", got)
		}
		got = buildArgs("p", BuildOptions{Deploy: true, Environments: []string{"prod"}, ConfirmProduction: true})
		if !strings.Contains(joined(got), "--confirm-production") {
			t.Errorf("--confirm-production not passed when requested: %v", got)
		}
	})
}

func TestDeployArgs(t *testing.T) {
	t.Run("zero options reproduce the plain deploy", func(t *testing.T) {
		got := deployArgs("voyage.zz.dummy.v1", DeployOptions{})
		want := "deploy voyage.zz.dummy.v1 --json"
		if joined(got) != want {
			t.Errorf("got %q, want %q", joined(got), want)
		}
	})

	t.Run("version, environments and plan-only", func(t *testing.T) {
		got := deployArgs("p", DeployOptions{
			Version:      "1.2.3",
			Environments: []string{"organisations/o/products/p/environments/dev", "staging"},
			PlanOnly:     true,
		})
		if !hasFlagValue(got, "--version", "1.2.3") {
			t.Errorf("version not passed: %v", got)
		}
		if !hasFlagValue(got, "-e", "dev") || !hasFlagValue(got, "-e", "staging") {
			t.Errorf("environments not passed as ids: %v", got)
		}
		if countFlag(got, "--plan-only") != 1 {
			t.Errorf("--plan-only missing: %v", got)
		}
	})

	t.Run("gate flags", func(t *testing.T) {
		got := deployArgs("p", DeployOptions{AllowBranchMismatch: true, ConfirmProduction: true})
		if countFlag(got, "--allow-branch-mismatch") != 1 {
			t.Errorf("--allow-branch-mismatch missing: %v", got)
		}
		if countFlag(got, "--confirm-production") != 1 {
			t.Errorf("--confirm-production missing: %v", got)
		}
	})

	t.Run("no implicit production confirmation", func(t *testing.T) {
		got := deployArgs("p", DeployOptions{Environments: []string{"prod"}})
		if strings.Contains(joined(got), "--confirm-production") {
			t.Errorf("--confirm-production added implicitly: %v", got)
		}
	})
}

func TestOptionsNeedingGRPC(t *testing.T) {
	if !(DefineOptions{ReleaseType: "GA"}).needsGRPC() {
		t.Error("releaseType should route to gRPC")
	}
	if (DefineOptions{Commit: "x", Install: true}).needsGRPC() {
		t.Error("plain define options should not route to gRPC")
	}
	if !(DeployOptions{Beta: true}).needsGRPC() {
		t.Error("beta should route to gRPC")
	}
	if (DeployOptions{Version: "1.0.0", PlanOnly: true}).needsGRPC() {
		t.Error("plain deploy options should not route to gRPC")
	}
}

// TestGRPCBackendRefusesCLIOnlyOptions checks the fallback reports what it
// cannot do instead of quietly doing something else — a dropped --plan-only
// would turn a preview into a real apply.
func TestGRPCBackendRefusesCLIOnlyOptions(t *testing.T) {
	b := NewGRPCBackend(NewDefineService(), NewBuildService(), NewDeployService())
	const neuron = "organisations/voyage/products/zz/neurons/dummy-v1"

	buildCases := map[string]BuildOptions{
		"branch":              {Branch: "master"},
		"confirmNoPaths":      {ConfirmNoPaths: true},
		"allowBranchMismatch": {AllowBranchMismatch: true},
		"confirmProduction":   {ConfirmProduction: true},
		"planOnly":            {PlanOnly: true},
		"deploy chaining":     {Deploy: true},
		"retag":               {Retag: true},
		"buildPaths":          {BuildPaths: []string{"."}},
	}
	for name, opts := range buildCases {
		t.Run("build/"+name, func(t *testing.T) {
			if _, err := b.RunBuildOptions(t.Context(), neuron, opts); err == nil {
				t.Errorf("expected a refusal for %s", name)
			}
		})
	}

	deployCases := map[string]DeployOptions{
		"allowBranchMismatch": {AllowBranchMismatch: true},
		"confirmProduction":   {ConfirmProduction: true},
	}
	for name, opts := range deployCases {
		t.Run("deploy/"+name, func(t *testing.T) {
			if _, err := b.RunDeployOptions(t.Context(), neuron, opts); err == nil {
				t.Errorf("expected a refusal for %s", name)
			}
		})
	}

	t.Run("define/install", func(t *testing.T) {
		if _, err := b.RunDefineOptions(t.Context(), neuron, DefineOptions{Install: true}); err == nil {
			t.Error("expected a refusal for install chaining")
		}
	})
}
