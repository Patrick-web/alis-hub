//go:build alis_integration

package main

import (
	"context"
	"os/exec"
	"strings"
	"testing"
	"time"

	"alis-hub-v3/internal/cliwrap"
)

// Shared fixture for live tests, pointed at the voyage.zz sandbox product.
//
// Sandbox limitations, verified 2026-08-08 — read this before adding a test:
//
//   - The product exists and has three services (demo-v1, dummy-v1,
//     dummy-two-v1) and one non-production environment.
//   - Its build repo 404s, both from a local `git ls-remote` and server-side.
//     `alis define` fails with "downloading proto files: api returned status:
//     404 Not Found", so define, build and deploy cannot complete here.
//   - demo/v1 has no files at all; dummy/v1 and dummy/two/v1 have committed
//     protos in the shared define repo.
//
// So live DBD round trips are not testable in this sandbox. Tests here stick to
// read-only commands, and the failure paths the sandbox does exercise well
// (which is how the already-done-and-failed async envelope was found). Parsing
// and argument construction are covered by fixture-backed unit tests in
// cli_fixtures_test.go, which run without credentials.
const (
	sandboxOrg     = "voyage"
	sandboxProduct = "zz"
	sandboxRef     = sandboxOrg + "." + sandboxProduct

	// dummy-v1 is the sandbox service with committed protos; demo-v1 is empty.
	sandboxService = "dummy"
	sandboxVersion = "v1"
	sandboxPkg     = sandboxRef + "." + sandboxService + "." + sandboxVersion
	sandboxNeuron  = "organisations/voyage/products/zz/neurons/dummy-v1"

	// The sandbox's only environment. Non-production, so no deploy of it can
	// trip the production gate.
	sandboxEnvID = "1y2ozw2i3fsru"
	sandboxEnv   = "organisations/voyage/products/zz/environments/" + sandboxEnvID
)

// requireCLI skips unless the alis CLI is installed and authenticated.
func requireCLI(t *testing.T) *cliwrap.Runner {
	t.Helper()
	if _, err := exec.LookPath("alis"); err != nil {
		t.Skipf("alis not in PATH: %v", err)
	}
	r, err := cliwrap.New("alis")
	if err != nil {
		t.Fatalf("cliwrap.New: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if _, err := r.Run(ctx, "whoami", "--json"); err != nil {
		t.Skipf("alis not authenticated: %v", err)
	}
	return r
}

// sandboxCtx returns a context with a sensible bound for a live CLI call.
func sandboxCtx(t *testing.T, d time.Duration) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), d)
	t.Cleanup(cancel)
	return ctx
}

func TestSandbox_ContextViewResolvesProduct(t *testing.T) {
	r := requireCLI(t)

	result, err := r.Run(sandboxCtx(t, 30*time.Second), "context", "view", sandboxRef, "--json")
	if err != nil {
		t.Fatalf("context view: %v", err)
	}
	var v contextViewResponse
	mustUnmarshal(t, result.Stdout, &v)

	if v.Organisation != sandboxOrg || v.Product != sandboxProduct {
		t.Errorf("resolved %s.%s, want %s", v.Organisation, v.Product, sandboxRef)
	}
	if len(v.Environments) == 0 {
		t.Fatal("expected at least one environment")
	}
	var found bool
	for _, e := range v.Environments {
		if e.ID == sandboxEnvID {
			found = true
			if e.Production {
				t.Errorf("sandbox env %s is flagged production — tests assume it is not", e.ID)
			}
		}
	}
	if !found {
		t.Errorf("sandbox env %s not present in %+v", sandboxEnvID, v.Environments)
	}
}

func TestSandbox_ProductViewShape(t *testing.T) {
	r := requireCLI(t)

	result, err := r.Run(sandboxCtx(t, 60*time.Second), "product", "view", sandboxRef, "--json")
	if err != nil {
		t.Fatalf("product view: %v", err)
	}
	var v productViewResponse
	mustUnmarshal(t, result.Stdout, &v)

	if len(v.Neurons) == 0 {
		t.Fatal("expected the sandbox product to report services")
	}
	if len(v.Environments) == 0 {
		t.Fatal("expected the sandbox product to report environments")
	}
	// Guards the live shape against drift: deployments must stay a map keyed by
	// neuron id. A change to an array would decode to an empty map, not an error.
	for _, e := range v.Environments {
		for id, d := range e.Deployments {
			if id == "" {
				t.Error("deployment map has an empty key")
			}
			if d.ID != "" && d.ID != id {
				t.Errorf("deployment key %q disagrees with nested id %q", id, d.ID)
			}
		}
	}
}

// TestSandbox_ServicesOverviewCLI exercises the real end-to-end mapping the
// services page depends on.
func TestSandbox_ServicesOverviewCLI(t *testing.T) {
	requireCLI(t)

	svc := NewProductService()
	if svc.alisCli == nil {
		t.Skip("alis CLI not wired into ProductService")
	}
	overview, err := svc.servicesOverviewCLI(sandboxOrg, sandboxProduct)
	if err != nil {
		t.Fatalf("servicesOverviewCLI: %v", err)
	}
	if len(overview.Neurons) == 0 {
		t.Error("expected services in the overview")
	}
	for _, e := range overview.Environments {
		if e.Name == "" {
			t.Error("environment resource name not populated")
		}
		// Deployment rows must be stably ordered — the source is a Go map.
		for i := 1; i < len(e.Deployments); i++ {
			if e.Deployments[i-1].NeuronID > e.Deployments[i].NeuronID {
				t.Errorf("deployments not sorted in env %s", e.Name)
				break
			}
		}
	}
}

// TestSandbox_OperationDescribeFlattensError pins the difference that cost a
// bug: `operations describe` reports error as a plain string, while the --async
// envelope reports it as a Status object.
func TestSandbox_OperationDescribeFlattensError(t *testing.T) {
	r := requireCLI(t)

	// A real failed define from this sandbox (its build repo 404s server-side).
	const failedOp = "operations/59b166d7-e5a9-4c12-9037-587a7f8172d6"

	state, err := r.Describe(sandboxCtx(t, 30*time.Second), failedOp)
	if err != nil {
		t.Skipf("sandbox operation no longer retrievable: %v", err)
	}
	if !state.Done {
		t.Error("expected the recorded failed operation to be done")
	}
	if state.Error == "" {
		t.Error("expected a non-empty error string from operations describe")
	}
}

// TestSandbox_WaitOnFailedOperation exercises the progress-streaming path
// end-to-end against a real operation.
//
// This is the awkward case: `alis operations wait` exits 1 for a failed
// operation, yet stdout still holds a valid flattened operation. Treating a
// non-zero exit as a CLI-level failure would throw that away and report a
// stream error instead of the operation's own error. stderr meanwhile mixes
// NDJSON progress lines with a human-formatted ERROR block, so the scanner has
// to skip unparseable lines rather than choke on them.
func TestSandbox_WaitOnFailedOperation(t *testing.T) {
	r := requireCLI(t)

	const failedOp = "operations/59b166d7-e5a9-4c12-9037-587a7f8172d6"

	var events []cliwrap.ProgressEvent
	state, err := r.Wait(sandboxCtx(t, 60*time.Second), failedOp, func(ev cliwrap.ProgressEvent) {
		events = append(events, ev)
	})
	if err != nil {
		t.Fatalf("Wait surfaced a stream error instead of the operation result: %v", err)
	}
	if !state.Done {
		t.Error("expected done=true")
	}
	if state.Error == "" {
		t.Error("expected the operation's own error to be reported")
	}
	// The NDJSON progress line for a finished operation carries done/error.
	t.Logf("received %d progress event(s)", len(events))
	for _, ev := range events {
		if ev.Error != "" {
			return
		}
	}
	if len(events) > 0 {
		t.Log("progress events arrived but none carried an error field")
	}
}

// TestSandbox_ListServiceBlocks covers the blocks read path against a service
// that really has two installs, so the instance refs the mutating calls depend
// on are exercised for real rather than only against a fixture.
func TestSandbox_ListServiceBlocks(t *testing.T) {
	requireCLI(t)

	svc := NewProductService()
	if svc.alisCli == nil {
		t.Skip("alis CLI not wired into ProductService")
	}
	overview, err := svc.ListServiceBlocks(sandboxPkg)
	if err != nil {
		t.Fatalf("ListServiceBlocks: %v", err)
	}
	if len(overview.Available) == 0 {
		t.Error("expected a non-empty block catalog")
	}
	for _, b := range overview.Installed {
		if b.Instance == "" {
			t.Errorf("install %s has no instance ref", b.BlockID)
			continue
		}
		id, err := blockIDFromInstance(b.Instance)
		if err != nil {
			t.Errorf("install %s: unusable instance %q: %v", b.BlockID, b.Instance, err)
		} else if id != b.BlockID {
			t.Errorf("instance %q does not belong to block %q", b.Instance, b.BlockID)
		}
	}
	t.Logf("%d installed, %d available", len(overview.Installed), len(overview.Available))
}

// TestSandbox_ListBlockAccounts checks the accounts that `blocks create`
// requires for --account.
func TestSandbox_ListBlockAccounts(t *testing.T) {
	requireCLI(t)

	svc := NewProductService()
	if svc.alisCli == nil {
		t.Skip("alis CLI not wired into ProductService")
	}
	accounts, err := svc.ListBlockAccounts()
	if err != nil {
		t.Fatalf("ListBlockAccounts: %v", err)
	}
	for _, a := range accounts {
		if !strings.HasPrefix(a.Name, "accounts/") {
			t.Errorf("unexpected account name format %q", a.Name)
		}
	}
	t.Logf("%d publishable account(s)", len(accounts))
}

// TestSandbox_EnvironmentVariables covers the read path and the canUpdate flag.
func TestSandbox_EnvironmentVariables(t *testing.T) {
	requireCLI(t)

	svc := NewProductService()
	if svc.alisCli == nil {
		t.Skip("alis CLI not wired into ProductService")
	}
	envs, err := svc.ListEnvironmentVariablesCLI(sandboxOrg, sandboxProduct)
	if err != nil {
		t.Fatalf("ListEnvironmentVariablesCLI: %v", err)
	}
	if len(envs) == 0 {
		t.Fatal("expected at least one environment")
	}
	for _, e := range envs {
		if e.EnvironmentID == "" {
			t.Error("environment id not populated")
		}
		t.Logf("env %s (%s): %d variable(s), canUpdate=%v",
			e.EnvironmentID, e.DisplayName, len(e.Variables), e.CanUpdate)
	}
}

// TestSandbox_EnvironmentBranches reads the deploy-branch designation — the
// thing --allow-branch-mismatch overrides.
func TestSandbox_EnvironmentBranches(t *testing.T) {
	requireCLI(t)

	svc := NewProductService()
	if svc.alisCli == nil {
		t.Skip("alis CLI not wired into ProductService")
	}
	branches, err := svc.GetEnvironmentBranchesCLI(sandboxOrg, sandboxProduct, sandboxEnvID)
	if err != nil {
		t.Fatalf("GetEnvironmentBranchesCLI: %v", err)
	}
	if branches.Environment != sandboxEnvID {
		t.Errorf("environment = %q, want %q", branches.Environment, sandboxEnvID)
	}
	if branches.Updated {
		t.Error("a read reported updated=true")
	}
	t.Logf("allowed branches: %v (unrestricted=%v)", branches.AllowedBranches, branches.Unrestricted())
}

// TestSandbox_ApprovalGateIsReportedNotSwallowed drives a genuinely gated
// command and checks the result is a structured gate carrying a retry command,
// rather than an opaque error.
//
// `environment unset` is destructive, so every automation tier except
// "autonomous" gates it. The target variable does not exist, so nothing is
// removed either way — the point is the exit-3 path, which is the common case
// for this command rather than an edge case.
func TestSandbox_ApprovalGateIsReportedNotSwallowed(t *testing.T) {
	requireCLI(t)

	svc := NewProductService()
	if svc.alisCli == nil {
		t.Skip("alis CLI not wired into ProductService")
	}
	res, err := svc.UnsetEnvironmentVariablesCLI(
		sandboxOrg, sandboxProduct, sandboxEnvID,
		[]string{"NO_SUCH_VAR_ALIS_HUB_PROBE"},
		false, false,
	)
	if err != nil {
		t.Fatalf("a gated command must not surface as an error: %v", err)
	}
	if !res.Gated {
		// An "autonomous" tier would run it; nothing was removed either way.
		t.Skipf("command was not gated on this automation tier (output: %s)", res.Output)
	}
	if res.Code != cliwrap.CodeApprovalRequired && res.Code != cliwrap.CodeProductionConfirmation {
		t.Errorf("unexpected gate code %q", res.Code)
	}
	if res.RetryCmd == "" {
		t.Error("gate carried no retry command — the user would have no way forward")
	}
	if res.Message == "" {
		t.Error("gate carried no message explaining what would change")
	}
	t.Logf("gate=%s retry=%q", res.Code, res.RetryCmd)
}

func TestSandbox_VersionMeetsMinimum(t *testing.T) {
	r := requireCLI(t)

	version, ok, err := r.CheckMinVersion(sandboxCtx(t, 20*time.Second))
	if err != nil {
		t.Fatalf("CheckMinVersion: %v", err)
	}
	t.Logf("alis %s (minimum %s)", version, cliwrap.MinVersion)
	if !ok {
		t.Errorf("installed alis %s is below the verified minimum %s", version, cliwrap.MinVersion)
	}
}
