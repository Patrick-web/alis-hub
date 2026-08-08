//go:build alis_integration

// Live tests against the DBD backend and the alisproxy log pages for
// voyage/vp. Excluded from `go test ./...` by the alis_integration build tag —
// they need credentials and network access.

package main

import (
	"context"
	"os"
	"testing"
	"time"
)

// TestFetchBuildLogs fetches and incrementally polls logs from the alisproxy for a known build.
// Set ALIS_LOGS_URL to a logs URL from a previous build, e.g.:
//
//	ALIS_LOGS_URL=https://git-v2-alisproxy-12345.us-east4.run.app/executions/<uuid> go test -v -run TestFetchBuildLogs ./...
func TestFetchBuildLogs(t *testing.T) {
	logsUrl := os.Getenv("ALIS_LOGS_URL")
	if logsUrl == "" {
		t.Skip("set ALIS_LOGS_URL to a known alisproxy URL to run this test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client, err := newAlisClient(ctx)
	if err != nil {
		t.Skipf("no alis credentials: %v", err)
	}

	svc := NewBuildService()
	svc.alisClient = client

	// Full fetch from offset 0.
	r, err := svc.FetchBuildLogs(logsUrl, 0)
	if err != nil {
		t.Fatalf("FetchBuildLogs(offset=0): %v", err)
	}
	t.Logf("Full fetch: %d bytes, nextOffset=%d", len(r.Content), r.NextOffset)
	if len(r.Content) > 0 {
		preview := r.Content
		if len(preview) > 800 {
			preview = preview[:800]
		}
		t.Logf("Content preview:\n%s", preview)
	}

	if r.NextOffset == 0 {
		t.Log("No content returned — the URL may require different auth or the build has no logs yet")
		return
	}

	// Incremental fetch: simulate polling by requesting only bytes past the midpoint.
	mid := r.NextOffset / 2
	r2, err := svc.FetchBuildLogs(logsUrl, mid)
	if err != nil {
		t.Fatalf("FetchBuildLogs(offset=%d): %v", mid, err)
	}
	t.Logf("Incremental fetch from offset=%d: %d bytes, nextOffset=%d", mid, len(r2.Content), r2.NextOffset)

	// Past-end fetch — should return 0 bytes (416 handled gracefully).
	r3, err := svc.FetchBuildLogs(logsUrl, r.NextOffset+1000)
	if err != nil {
		t.Fatalf("FetchBuildLogs(past-end): %v", err)
	}
	t.Logf("Past-end fetch: %d bytes (expected 0)", len(r3.Content))
}

// TestStreamBuildLogs_BffV1 starts a build and streams logs to stdout as they arrive.
// Runs until the build completes or the timeout fires (10 min).
func TestStreamBuildLogs_BffV1(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	client, err := newAlisClient(ctx)
	if err != nil {
		t.Skipf("no alis credentials: %v", err)
	}

	svc := NewBuildService()
	svc.alisClient = client

	commits, err := svc.GetBuildCommits("voyage", "vp", "bff", "v1", "master", 1)
	if err != nil || len(commits) == 0 {
		t.Fatalf("GetBuildCommits: %v (len=%d)", err, len(commits))
	}
	neuron := "organisations/voyage/products/vp/neurons/bff-v1"
	commit := commits[0].SHA
	t.Logf("Starting build: commit=%s", commit[:8])

	result, err := svc.RunBuild(neuron, commit)
	if err != nil {
		t.Fatalf("RunBuild: %v", err)
	}
	if result.Error != "" {
		t.Fatalf("RunBuild error: %s", result.Error)
	}
	t.Logf("Operation: %s", result.OperationName)

	var logOffset int64
	deadline := time.Now().Add(10 * time.Minute)
	pollTick := time.NewTicker(5 * time.Second)
	logTick := time.NewTicker(3 * time.Second)
	defer pollTick.Stop()
	defer logTick.Stop()

	var logsUrl string
	done := result.Done

	for !done && time.Now().Before(deadline) {
		select {
		case <-pollTick.C:
			poll, err := svc.PollBuildOperation(result.OperationName, neuron)
			if err != nil {
				t.Logf("poll error: %v", err)
				continue
			}
			if poll.LogsURL != "" && logsUrl == "" {
				logsUrl = poll.LogsURL
				t.Logf("Got logsUrl: %s", logsUrl)
			}
			done = poll.Done
			if poll.Notes != "" {
				t.Logf("Notes: %s", poll.Notes)
			}
			if done {
				if poll.Error != "" {
					t.Logf("Build failed: %s", poll.Error)
				} else {
					t.Logf("Build complete: neuronVersion=%s", poll.NeuronVersion)
				}
			}

		case <-logTick.C:
			if logsUrl == "" {
				continue
			}
			chunk, err := svc.FetchBuildLogs(logsUrl, logOffset)
			if err != nil {
				t.Logf("log fetch error: %v", err)
				continue
			}
			if len(chunk.Content) > 0 {
				t.Logf("LOG +%d bytes:\n%s", len(chunk.Content), chunk.Content)
				logOffset = chunk.NextOffset
			}
		}
	}

	// Final log drain.
	if logsUrl != "" {
		chunk, err := svc.FetchBuildLogs(logsUrl, logOffset)
		if err == nil && len(chunk.Content) > 0 {
			t.Logf("LOG final +%d bytes:\n%s", len(chunk.Content), chunk.Content)
		}
	}

	if !done {
		t.Error("build did not complete within deadline")
	}
}

// TestStreamBuildLogs_HubspotV1 starts a hubspot-v1 build and streams logs to stdout as they arrive.
func TestStreamBuildLogs_HubspotV1(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	client, err := newAlisClient(ctx)
	if err != nil {
		t.Skipf("no alis credentials: %v", err)
	}

	svc := NewBuildService()
	svc.alisClient = client

	neuron := "organisations/voyage/products/vp/neurons/hubspot-v1"
	commits, err := svc.GetBuildCommits("voyage", "vp", "hubspot", "v1", "master", 1)
	if err != nil || len(commits) == 0 {
		t.Fatalf("GetBuildCommits: %v (len=%d)", err, len(commits))
	}
	commit := commits[0].SHA
	t.Logf("Starting build: commit=%s %q", commit[:8], commits[0].Message)

	result, err := svc.RunBuild(neuron, commit)
	if err != nil {
		t.Fatalf("RunBuild: %v", err)
	}
	if result.Error != "" {
		t.Fatalf("RunBuild error: %s", result.Error)
	}
	t.Logf("Operation: %s  done=%v", result.OperationName, result.Done)
	if result.Done {
		t.Logf("Completed immediately: logsUrl=%s", result.LogsURL)
		return
	}

	var logOffset int64
	deadline := time.Now().Add(10 * time.Minute)
	pollTick := time.NewTicker(5 * time.Second)
	logTick := time.NewTicker(3 * time.Second)
	defer pollTick.Stop()
	defer logTick.Stop()

	var logsUrl string
	done := false

	for !done && time.Now().Before(deadline) {
		select {
		case <-pollTick.C:
			poll, err := svc.PollBuildOperation(result.OperationName, neuron)
			if err != nil {
				t.Logf("poll error: %v", err)
				continue
			}
			if poll.LogsURL != "" && logsUrl == "" {
				logsUrl = poll.LogsURL
				t.Logf("[STATUS] Got logsUrl: %s", logsUrl)
			}
			if poll.Notes != "" {
				t.Logf("[STATUS] %s", poll.Notes)
			}
			done = poll.Done
			if done {
				if poll.Error != "" {
					t.Logf("[STATUS] Build FAILED: %s", poll.Error)
				} else {
					t.Logf("[STATUS] Build complete: neuronVersion=%s", poll.NeuronVersion)
				}
			}

		case <-logTick.C:
			if logsUrl == "" {
				continue
			}
			chunk, err := svc.FetchBuildLogs(logsUrl, logOffset)
			if err != nil {
				t.Logf("[LOG] fetch error: %v", err)
				continue
			}
			if len(chunk.Content) > 0 {
				t.Logf("[LOG +%d bytes]\n%s", len(chunk.Content), chunk.Content)
				logOffset = chunk.NextOffset
			}
		}
	}

	// Final log drain.
	if logsUrl != "" {
		if chunk, err := svc.FetchBuildLogs(logsUrl, logOffset); err == nil && len(chunk.Content) > 0 {
			t.Logf("[LOG final +%d bytes]\n%s", len(chunk.Content), chunk.Content)
		}
	}

	if !done {
		t.Error("build did not complete within deadline")
	}
}

// TestBuildGetCommits_BffV1 verifies commit listing from the build repo.
func TestBuildGetCommits_BffV1(t *testing.T) {
	svc := NewBuildService()
	commits, err := svc.GetBuildCommits("voyage", "vp", "bff", "v1", "master", 10)
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

	client, err := newAlisClient(ctx)
	if err != nil {
		t.Skipf("no alis credentials: %v", err)
	}

	svc := NewBuildService()
	svc.alisClient = client

	// Get the latest build commit.
	commits, err := svc.GetBuildCommits("voyage", "vp", "bff", "v1", "master", 1)
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
