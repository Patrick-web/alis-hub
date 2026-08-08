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
