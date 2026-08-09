package main

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	neuronsv1pb "alis-hub-v3/gen/go/alis/os/neurons/v1"
	productsv1pb "alis-hub-v3/gen/go/alis/os/products/v1"
	"alis-hub-v3/internal/cliwrap"
)

// Mutating CLI integration tests live in backend_integration_test.go behind the
// alis_integration build tag. Everything here is read-only or pure.

func TestCLIBackend_ContextView(t *testing.T) {
	runner, err := cliwrap.New("alis")
	if err != nil {
		t.Skipf("alis not available: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	result, err := runner.Run(ctx, "context", "view", "voyage.vp", "--json")
	if err != nil {
		t.Fatalf("context view: %v", err)
	}
	t.Logf("Context: %s", string(result.Stdout))
}

func TestProductStateFromCLI(t *testing.T) {
	tests := []struct {
		status string
		want   int32
	}{
		{"ACTIVE", int32(productsv1pb.Product_ACTIVE)},
		{"FAILED", int32(productsv1pb.Product_FAILED)},
		{"CREATING", int32(productsv1pb.Product_CREATING)},
		{"DELETING", int32(productsv1pb.Product_DELETING)},
		{"STATE_UNSPECIFIED", int32(productsv1pb.Product_STATE_UNSPECIFIED)},
		// A status this build doesn't know must not be reported as ACTIVE.
		{"SOMETHING_NEW", int32(productsv1pb.Product_STATE_UNSPECIFIED)},
		{"", int32(productsv1pb.Product_STATE_UNSPECIFIED)},
	}
	for _, tt := range tests {
		if got := productStateFromCLI(tt.status); got != tt.want {
			t.Errorf("productStateFromCLI(%q) = %d, want %d", tt.status, got, tt.want)
		}
	}
}

func TestNeuronStateFromCLI(t *testing.T) {
	tests := []struct {
		status string
		want   int32
	}{
		{"BUILT", int32(neuronsv1pb.NeuronVersion_BUILT)},
		{"RETAGGED", int32(neuronsv1pb.NeuronVersion_RETAGGED)},
		{"BUILDING", int32(neuronsv1pb.NeuronVersion_BUILDING)},
		{"WAT", int32(neuronsv1pb.NeuronVersion_UNSPECIFIED)},
	}
	for _, tt := range tests {
		if got := neuronStateFromCLI(tt.status); got != tt.want {
			t.Errorf("neuronStateFromCLI(%q) = %d, want %d", tt.status, got, tt.want)
		}
	}
}

func TestDeploymentStateFromCLI(t *testing.T) {
	// These are the statuses `alis product view` was observed to emit; the
	// hand-rolled switch this replaced mapped none of them.
	tests := []struct {
		status string
		want   int32
	}{
		{"RUNNING", int32(neuronsv1pb.Deployment_RUNNING)},
		{"PLANNED", int32(neuronsv1pb.Deployment_PLANNED)},
		{"DEPLOY_FAILED", int32(neuronsv1pb.Deployment_DEPLOY_FAILED)},
		{"DESTROYED", int32(neuronsv1pb.Deployment_DESTROYED)},
		{"WAT", int32(neuronsv1pb.Deployment_STATE_UNSPECIFIED)},
	}
	for _, tt := range tests {
		if got := deploymentStateFromCLI(tt.status); got != tt.want {
			t.Errorf("deploymentStateFromCLI(%q) = %d, want %d", tt.status, got, tt.want)
		}
	}
}

// TestProductViewResponse_DeploymentsAreAMap guards the shape most likely to be
// got wrong: environments[].deployments is a JSON object keyed by neuron id,
// not an array. Decoding it as a list yields nothing, silently.
func TestProductViewResponse_DeploymentsAreAMap(t *testing.T) {
	const raw = `{
	  "neurons": [
	    {"id": "asana-v1", "version": "1.11.1", "status": "BUILT"},
	    {"id": "bff-v1", "version": "1.36.1", "status": "BUILDING"}
	  ],
	  "environments": [
	    {
	      "id": "1y2ozw66zv6p3",
	      "displayName": "staging",
	      "deployments": {
	        "bff-v1":   {"id": "bff-v1",   "version": "1.30.0", "status": "RUNNING",       "logsUri": "https://logs/b"},
	        "asana-v1": {"id": "asana-v1", "version": "1.9.1",  "status": "DEPLOY_FAILED", "logsUri": "https://logs/a"}
	      }
	    }
	  ]
	}`

	var v productViewResponse
	if err := json.Unmarshal([]byte(raw), &v); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(v.Neurons) != 2 {
		t.Fatalf("neurons = %d, want 2", len(v.Neurons))
	}
	if len(v.Environments) != 1 {
		t.Fatalf("environments = %d, want 1", len(v.Environments))
	}
	deps := v.Environments[0].Deployments
	if len(deps) != 2 {
		t.Fatalf("deployments = %d, want 2", len(deps))
	}
	if got := deps["asana-v1"].Version; got != "1.9.1" {
		t.Errorf("asana-v1 deployed version = %q, want 1.9.1", got)
	}
	if got := deploymentStateFromCLI(deps["asana-v1"].Status); got != int32(neuronsv1pb.Deployment_DEPLOY_FAILED) {
		t.Errorf("asana-v1 state = %d, want DEPLOY_FAILED", got)
	}
	// The deployed version is independent of the built version — that gap is
	// how the UI shows drift, so it must survive decoding.
	if v.Neurons[0].Version == deps["asana-v1"].Version {
		t.Error("built and deployed versions collapsed into one value")
	}
}

// TestOperationDeploymentLogsLink guards the field name that cost the deploy
// pane its logs: `alis operations describe` spells the per-deployment log link
// logsUri, not logsUrl. Decoding only logsUrl leaves every entry blank, the
// frontend never starts a log stream, and the terminal stays empty for the
// whole deploy with nothing reported anywhere.
//
// The JSON below is real output from `alis operations describe` on a deploy
// operation, trimmed to the fields that matter.
func TestOperationDeploymentLogsLink(t *testing.T) {
	const raw = `{
	  "done": true,
	  "notes": "Updating deployment",
	  "logsUri": "https://alisproxy.example/executions/op",
	  "error": "",
	  "deployProgress": [],
	  "deployments": [
	    {
	      "name": "organisations/o/products/p/environments/e/deployments/asana-v1",
	      "state": "RUNNING",
	      "logsUri": "https://alisproxy.example/executions/dep",
	      "progress": null,
	      "error": null
	    }
	  ]
	}`

	var state cliwrap.OperationState
	if err := json.Unmarshal([]byte(raw), &state); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(state.Deployments) != 1 {
		t.Fatalf("deployments = %d, want 1", len(state.Deployments))
	}
	if got := state.Deployments[0].LogsLink(); got != "https://alisproxy.example/executions/dep" {
		t.Errorf("LogsLink() = %q, want the per-deployment logsUri", got)
	}
}

// TestOperationDeploymentLogsLinkFallsBackToLogsUrl covers the gRPC spelling,
// so accepting logsUri did not trade one blank field for another.
func TestOperationDeploymentLogsLinkFallsBackToLogsUrl(t *testing.T) {
	var d cliwrap.OperationDeployment
	if err := json.Unmarshal([]byte(`{"logsUrl":"https://alisproxy.example/x"}`), &d); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got := d.LogsLink(); got != "https://alisproxy.example/x" {
		t.Errorf("LogsLink() = %q, want the logsUrl value", got)
	}
}

// TestDeployItems covers the substitution that keeps a deploy streaming when
// only the operation-level link came back. The previous fallback checked
// whether the deployments list was empty, so a list of entries with blank
// links — exactly what the logsUri mismatch produced — skipped it entirely.
func TestDeployItems(t *testing.T) {
	tests := []struct {
		name  string
		links []string
		opURI string
		want  []string
	}{
		{"per-deployment links win", []string{"a", "b"}, "op", []string{"a", "b"}},
		{"blank entries fall back", []string{"", ""}, "op", []string{"op", "op"}},
		{"mixed", []string{"a", ""}, "op", []string{"a", "op"}},
		{"no entries at all", nil, "op", []string{"op"}},
		{"nothing to show", nil, "", nil},
		{"blank entries and no fallback", []string{""}, "", []string{""}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := deployItems(tt.links, tt.opURI)
			if len(got) != len(tt.want) {
				t.Fatalf("got %d items, want %d", len(got), len(tt.want))
			}
			for i := range got {
				if got[i].LogsURL != tt.want[i] {
					t.Errorf("item %d = %q, want %q", i, got[i].LogsURL, tt.want[i])
				}
			}
		})
	}
}

// TestDeployAsyncDeploymentLogsLink pins the same spelling tolerance on the
// `alis deploy --async` envelope, which feeds the log link the pane now uses
// before the first poll comes back.
func TestDeployAsyncDeploymentLogsLink(t *testing.T) {
	const raw = `{
	  "name": "operations/abc",
	  "done": false,
	  "metadata": {
	    "version": "1.12.1",
	    "notes": "Updating deployment",
	    "logsUri": "https://alisproxy.example/executions/op",
	    "deployments": [
	      {"name": "…/deployments/asana-v1", "state": "RUNNING", "logsUri": "https://alisproxy.example/executions/dep"},
	      {"name": "…/deployments/bff-v1", "state": "RUNNING"}
	    ]
	  }
	}`

	var meta deployAsyncMeta
	if err := json.Unmarshal([]byte(raw), &meta); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got := meta.Metadata.Deployments[0].logsLink(); got != "https://alisproxy.example/executions/dep" {
		t.Errorf("deployment 0 link = %q, want the per-deployment logsUri", got)
	}
	if got := meta.Metadata.Deployments[1].logsLink(); got != "" {
		t.Errorf("deployment 1 link = %q, want empty before the fallback", got)
	}
}
