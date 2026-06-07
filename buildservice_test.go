package main

import (
	"context"
	"testing"
	"time"
)

// TestBuildGetCommits_BffV1 verifies commit listing from the build repo.
func TestBuildGetCommits_BffV1(t *testing.T) {
	svc := NewBuildService()
	commits, err := svc.GetBuildCommits("voyage", "vp", "bff", "v1", 10)
	if err != nil {
		t.Fatalf("GetBuildCommits: %v", err)
	}
	t.Logf("Found %d commits", len(commits))
	for i, c := range commits {
		t.Logf("  [%d] %s — %s (%s)", i, c.SHA[:8], c.Message, c.Author)
	}
	if len(commits) == 0 {
		t.Error("expected at least one commit from the build repo")
	}
}

// TestBuildScanDockerfiles_BffV1 verifies Dockerfile discovery for the bff neuron.
func TestBuildScanDockerfiles_BffV1(t *testing.T) {
	svc := NewBuildService()
	images := svc.scanDockerfiles("organisations/voyage/products/vp/neurons/bff-v1")
	t.Logf("Found %d Dockerfile(s):", len(images))
	for path, action := range images {
		t.Logf("  %s → action=%d", path, action)
	}
	if len(images) == 0 {
		t.Error("expected at least one Dockerfile under bff/v1")
	}
}

// TestRunBuild_BffV1 runs a full build against the real Alis backend and polls until done.
// Uses the latest commit from the build repo. Expects a logsUrl on completion.
func TestRunBuild_BffV1(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	client, err := NewAlisClient(ctx)
	if err != nil {
		t.Skipf("no alis credentials: %v", err)
	}

	svc := NewBuildService()
	svc.alisClient = client

	// Get the latest build commit.
	commits, err := svc.GetBuildCommits("voyage", "vp", "bff", "v1", 1)
	if err != nil || len(commits) == 0 {
		t.Fatalf("GetBuildCommits: %v (len=%d)", err, len(commits))
	}
	commit := commits[0].SHA
	neuron := "organisations/voyage/products/vp/neurons/bff-v1"
	t.Logf("Using commit %s: %s", commit[:8], commits[0].Message)

	// Verify imagesMap will be sent.
	images := svc.scanDockerfiles(neuron)
	t.Logf("imagesMap: %d Dockerfile(s)", len(images))
	for p, a := range images {
		t.Logf("  %s → %d", p, a)
	}

	// Start the build.
	result, err := svc.RunBuild(neuron, commit)
	if err != nil {
		t.Fatalf("RunBuild: %v", err)
	}
	t.Logf("Operation: %s  done=%v", result.OperationName, result.Done)
	if result.Error != "" {
		t.Fatalf("RunBuild returned error: %s", result.Error)
	}
	if result.OperationName == "" {
		t.Fatal("expected a non-empty operation name")
	}
	if result.Done {
		t.Logf("Build completed immediately: version=%s logsUrl=%s", result.Version, result.LogsURL)
		return
	}

	// Poll until done (up to 10 minutes).
	t.Log("Polling build operation...")
	deadline := time.Now().Add(10 * time.Minute)
	for time.Now().Before(deadline) {
		time.Sleep(5 * time.Second)
		poll, err := svc.PollBuildOperation(result.OperationName, neuron)
		if err != nil {
			t.Fatalf("PollBuildOperation: %v", err)
		}
		t.Logf("  done=%v  version=%q  logsUrl=%q  notes=%q  error=%q",
			poll.Done, poll.Version, poll.LogsURL, poll.Notes, poll.Error)
		if poll.Done {
			if poll.Error != "" {
				// Build failed in Cloud Build — log the error and logsUrl for debugging.
				t.Logf("Build completed with error: %s", poll.Error)
				t.Logf("View logs at: %s", poll.LogsURL)
			} else {
				t.Logf("Build complete: neuronVersion=%s", poll.NeuronVersion)
			}
			if poll.LogsURL == "" {
				t.Error("expected a logsUrl — check that imagesMap was sent correctly")
			}
			return
		}
	}
	t.Fatal("build did not complete within 10 minutes")
}
