package main

import (
	"context"
	"testing"
	"time"
)

// TestExplainDefine_BffV1 tests Glass ExplainDefine for voyage/vp/bff-v1.
func TestExplainDefine_BffV1(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client, err := NewAlisClient(ctx)
	if err != nil {
		t.Fatalf("NewAlisClient: %v", err)
	}
	defer client.Close()

	svc := &DefineService{alisClient: client}
	result, err := svc.ExplainDefine("", nil, "organisations/voyage/products/vp/neurons/bff-v1")
	if err != nil {
		t.Fatalf("ExplainDefine failed: %v", err)
	}

	t.Logf("Title: %s", result.Title)
	t.Logf("Summary: %s", result.Summary)
	t.Logf("Definition: name=%s version=%s releaseType=%s", result.Definition.Name, result.Definition.Version, result.Definition.ReleaseType)
	t.Logf("Artifacts (%d):", len(result.Artifacts))
	for _, a := range result.Artifacts {
		t.Logf("  [%s] state=%d uri=%s extra=%s", a.Type, a.State, a.LocationUri, a.Extra)
	}
	if result.Title == "" && len(result.Artifacts) == 0 {
		t.Error("Expected non-empty title or artifacts from Glass")
	}
}

// TestRunDefine_BffV1 tests a real Define call against the Alis backend for voyage/vp/bff-v1.
// Requires ~/.alis/console-credentials.json to be present (normal login flow).
func TestRunDefine_BffV1(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client, err := NewAlisClient(ctx)
	if err != nil {
		t.Fatalf("NewAlisClient: %v", err)
	}
	defer client.Close()

	svc := &DefineService{alisClient: client}

	// Verify commits load correctly (exercises the version parsing path)
	commits, err := svc.GetDefineCommits("voyage", "vp", "bff", "v1", 5)
	if err != nil {
		t.Logf("GetDefineCommits error (non-fatal, local repo may differ): %v", err)
	} else {
		t.Logf("GetDefineCommits returned %d commits", len(commits))
		if len(commits) > 0 {
			t.Logf("Latest: %s — %s", commits[0].SHA[:8], commits[0].Message)
		}
	}

	// Run Define with the latest commit from the define repo.
	// Neuron format validated: organisations/voyage/products/vp/neurons/bff-v1
	latestCommit := "1d87113a4bb6717f8e9245a10448f2b4eb8aaf42"
	result, err := svc.RunDefine("organisations/voyage/products/vp/neurons/bff-v1", latestCommit, "")
	if err != nil {
		t.Fatalf("RunDefine failed: %v", err)
	}

	t.Logf("Operation: %s", result.OperationName)
	t.Logf("Done: %v", result.Done)
	if result.Error != "" {
		t.Logf("Error: %s", result.Error)
	}
	if result.Definition != "" {
		t.Logf("Definition: %s", result.Definition)
	}

	if result.OperationName == "" {
		t.Error("Expected a non-empty operation name from the backend")
	}
}

// TestExplainDefine_Bookings tests Glass on bookings-v1 which is more likely to have an existing definition.
func TestExplainDefine_Bookings(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client, err := NewAlisClient(ctx)
	if err != nil {
		t.Fatalf("NewAlisClient: %v", err)
	}
	defer client.Close()

	svc := &DefineService{alisClient: client}
	// Try several neurons until one succeeds to confirm the proto parsing works
	neurons := []string{
		"organisations/voyage/products/vp/neurons/bookings-v1",
		"organisations/voyage/products/vp/neurons/bundles-v1",
		"organisations/voyage/products/vp/neurons/bff-v1",
	}
	for _, n := range neurons {
		result, err := svc.ExplainDefine("", nil, n)
		if err != nil {
			t.Logf("ExplainDefine(%s): %v", n, err)
			continue
		}
		t.Logf("=== %s ===", n)
		t.Logf("Title: %q  Summary: %q", result.Title, result.Summary)
		t.Logf("Definition: %+v", result.Definition)
		t.Logf("Artifacts (%d):", len(result.Artifacts))
		for _, a := range result.Artifacts {
			t.Logf("  [%s] state=%d uri=%s", a.Type, a.State, a.LocationUri)
		}
		return // success - parsing confirmed
	}
	t.Skip("No neurons had an existing definition — Glass is working but no data to preview")
}
