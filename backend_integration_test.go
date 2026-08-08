//go:build alis_integration

// Live integration tests against a real Alis Build product.
//
// These are excluded from `go test ./...` by the alis_integration build tag on
// purpose: they are not read-only. TestCLIBackend_DefineAsanaV1 creates a real
// definition version and TestCLIBackend_BuildAsanaV1 a real build version, both
// against voyage.vp.asana.v1, and the deploy test runs a real Terraform plan.
// A plain `go test` on a developer machine with valid credentials would
// otherwise mutate the live product as a side effect of running the suite.
//
// Run deliberately with:
//
//	go test -tags alis_integration -run TestCLIBackend -v -timeout 30m .

package main

import (
	"context"
	"errors"
	"testing"
	"time"

	"alis-hub-v3/internal/cliwrap"
)

func TestCLIBackend_DefineAsanaV1(t *testing.T) {
	cli, err := NewCLIBackend()
	if err != nil {
		t.Skipf("CLI backend not available: %v", err)
	}

	neuron := "organisations/voyage/products/vp/neurons/asana-v1"

	startCtx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	result, err := cli.RunDefine(startCtx, neuron, "")
	if err != nil {
		if errors.Is(err, &cliwrap.ErrUnauthenticated{}) {
			t.Skip("not logged in to alis")
		}
		t.Fatalf("RunDefine: %v", err)
	}
	t.Logf("Operation: %s", result.OperationName)
	if result.OperationName == "" {
		t.Fatal("expected non-empty operation name")
	}
	if result.Done {
		t.Log("operation completed immediately (already done)")
		return
	}

	deadline := time.Now().Add(5 * time.Minute)
	for time.Now().Before(deadline) {
		time.Sleep(3 * time.Second)
		pollCtx, pollCancel := context.WithTimeout(context.Background(), 30*time.Second)
		poll, err := cli.PollDefine(pollCtx, result.OperationName)
		pollCancel()
		if err != nil {
			t.Fatalf("PollDefine: %v", err)
		}
		t.Logf("done=%v version=%q notes=%q artifacts=%d error=%q",
			poll.Done, poll.Version, poll.Notes, len(poll.DefinitionArtifacts), poll.Error)
		if poll.Done {
			if poll.Error != "" {
				t.Logf("Define completed with error: %s", poll.Error)
			} else {
				t.Logf("Define complete: version=%s", poll.Version)
			}
			return
		}
	}
	t.Fatal("define did not complete within 5 minutes")
}

func TestCLIBackend_BuildAsanaV1(t *testing.T) {
	cli, err := NewCLIBackend()
	if err != nil {
		t.Skipf("CLI backend not available: %v", err)
	}

	neuron := "organisations/voyage/products/vp/neurons/asana-v1"

	startCtx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	result, err := cli.RunBuild(startCtx, neuron, "")
	if err != nil {
		if errors.Is(err, &cliwrap.ErrUnauthenticated{}) {
			t.Skip("not logged in to alis")
		}
		t.Fatalf("RunBuild: %v", err)
	}
	t.Logf("Operation: %s", result.OperationName)
	if result.OperationName == "" {
		t.Fatal("expected non-empty operation name")
	}
	if result.Done {
		t.Log("build completed immediately")
		return
	}

	// Poll until done or timeout, using a fresh context for each poll.
	deadline := time.Now().Add(15 * time.Minute)
	for time.Now().Before(deadline) {
		time.Sleep(5 * time.Second)
		pollCtx, pollCancel := context.WithTimeout(context.Background(), 30*time.Second)
		poll, err := cli.PollBuild(pollCtx, result.OperationName, neuron)
		pollCancel()
		if err != nil {
			t.Fatalf("PollBuild: %v", err)
		}
		t.Logf("done=%v version=%q logsUri=%q notes=%q error=%q",
			poll.Done, poll.Version, poll.LogsURL, poll.Notes, poll.Error)
		if poll.Done {
			if poll.Error != "" {
				t.Logf("Build completed with error: %s", poll.Error)
			} else {
				t.Logf("Build complete: version=%s", poll.Version)
			}
			if poll.LogsURL != "" {
				t.Logf("Logs: %s", poll.LogsURL)
			}
			return
		}
	}
	t.Fatal("build did not complete within 15 minutes")
}

func TestCLIBackend_DeployAsanaV1_PlanOnly(t *testing.T) {
	cli, err := NewCLIBackend()
	if err != nil {
		t.Skipf("CLI backend not available: %v", err)
	}

	neuron := "organisations/voyage/products/vp/neurons/asana-v1"
	envs := []string{"organisations/voyage/products/vp/environments/1y2ozw7e5ss4b"} // development

	startCtx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	result, err := cli.RunDeploy(startCtx, neuron, "", envs, true) // plan-only
	if err != nil {
		if errors.Is(err, &cliwrap.ErrUnauthenticated{}) {
			t.Skip("not logged in to alis")
		}
		t.Fatalf("RunDeploy: %v", err)
	}

	// Check for production confirmation (should not happen for development env)
	if result.Error == "PRODUCTION_CONFIRMATION_REQUIRED" {
		t.Logf("Deploy requires confirmation: %s", result.Notes)
		return
	}

	t.Logf("Operation: %s", result.OperationName)
	if result.OperationName == "" {
		t.Fatal("expected non-empty operation name")
	}
	if result.Done {
		t.Log("deploy completed immediately")
		return
	}

	deadline := time.Now().Add(15 * time.Minute)
	for time.Now().Before(deadline) {
		time.Sleep(5 * time.Second)
		pollCtx, pollCancel := context.WithTimeout(context.Background(), 30*time.Second)
		poll, err := cli.PollDeploy(pollCtx, result.OperationName)
		pollCancel()
		if err != nil {
			t.Fatalf("PollDeploy: %v", err)
		}
		t.Logf("done=%v version=%q notes=%q deployments=%d error=%q",
			poll.Done, poll.Version, poll.Notes, len(poll.Deployments), poll.Error)
		if poll.Done {
			if poll.Error != "" {
				t.Logf("Deploy completed with error: %s", poll.Error)
			} else {
				t.Logf("Deploy complete: version=%s", poll.Version)
			}
			return
		}
	}
	t.Fatal("deploy did not complete within 15 minutes")
}
