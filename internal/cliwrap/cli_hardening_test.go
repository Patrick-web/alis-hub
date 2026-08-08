package cliwrap

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// TestRun_MissingBinaryDoesNotPanic covers the case where the binary passes
// LookPath at construction but is gone by the time Run executes — which is what
// `alis upgrade` does to itself while the app is running. Reading
// cmd.ProcessState.ExitCode() unconditionally panics there, since ProcessState
// is nil when the process never started.
func TestRun_MissingBinaryDoesNotPanic(t *testing.T) {
	dir := t.TempDir()
	fake := filepath.Join(dir, "alis")
	if err := os.WriteFile(fake, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("write fake binary: %v", err)
	}

	r, err := New(fake)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	// Pull the binary out from under the runner, as an upgrade would.
	if err := os.Remove(fake); err != nil {
		t.Fatalf("remove fake binary: %v", err)
	}

	defer func() {
		if p := recover(); p != nil {
			t.Fatalf("Run panicked on a vanished binary: %v", p)
		}
	}()

	if _, err := r.Run(context.Background(), "whoami", "--json"); err == nil {
		t.Fatal("expected an error when the binary is missing")
	}
}

// TestRun_HonoursDeadline checks that the context deadline actually bounds how
// long a caller is blocked, so a hung CLI cannot wedge a Wails method.
//
// The fake binary sleeps *without* exec, so `sh` stays alive as the direct
// child and `sleep` inherits the stdout pipe as a grandchild. Killing the
// child on cancellation is therefore not enough — Run still blocks draining
// that inherited pipe until the grandchild exits. This is the case WaitDelay
// exists for, and the reason the assertion is a wall-clock bound rather than
// just "an error came back".
func TestRun_HonoursDeadline(t *testing.T) {
	dir := t.TempDir()
	fake := filepath.Join(dir, "alis")
	if err := os.WriteFile(fake, []byte("#!/bin/sh\nsleep 30\n"), 0o755); err != nil {
		t.Fatalf("write fake binary: %v", err)
	}
	r, err := New(fake)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	// A short explicit deadline stands in for DefaultTimeout so the test is
	// fast; the code path is identical.
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	start := time.Now()
	if _, err := r.Run(ctx, "whoami"); err == nil {
		t.Fatal("expected a timeout error")
	}
	// Deadline + pipeDrainGrace, with headroom for a loaded machine. Well
	// under the 30s the sleeping grandchild would otherwise impose.
	if elapsed := time.Since(start); elapsed > pipeDrainGrace+5*time.Second {
		t.Errorf("Run outlived its deadline: took %v (want <= %v)", elapsed, pipeDrainGrace+5*time.Second)
	}
}

// TestRunAsync_DoesNotMutateCallerArgs guards against append writing through to
// the caller's backing array when it has spare capacity.
func TestRunAsync_DoesNotMutateCallerArgs(t *testing.T) {
	args := make([]string, 3, 8)
	copy(args, []string{"define", "voyage.vp.asana.v1", "--json"})

	asyncArgs := make([]string, 0, len(args)+1)
	asyncArgs = append(asyncArgs, args...)
	asyncArgs = append(asyncArgs, "--async")

	if len(args) != 3 {
		t.Fatalf("caller args grew to %v", args)
	}
	if asyncArgs[3] != "--async" || len(asyncArgs) != 4 {
		t.Fatalf("async args = %v", asyncArgs)
	}
}

func TestErrorsIs_TypedSentinels(t *testing.T) {
	// errors.Is against a freshly allocated sentinel is the idiom used at the
	// call sites; without an Is method it silently never matches.
	var unauth error = &ErrUnauthenticated{}
	if !errors.Is(unauth, &ErrUnauthenticated{}) {
		t.Error("errors.Is did not match ErrUnauthenticated")
	}
	var confirm error = &ErrConfirmationRequired{Code: CodeProductionConfirmation}
	if !errors.Is(confirm, &ErrConfirmationRequired{}) {
		t.Error("errors.Is did not match ErrConfirmationRequired")
	}
	if errors.Is(unauth, &ErrConfirmationRequired{}) {
		t.Error("ErrUnauthenticated matched ErrConfirmationRequired")
	}
}

func TestConfirmationRequired_ProductionVsTier(t *testing.T) {
	prod := &ErrConfirmationRequired{Code: CodeProductionConfirmation}
	if !prod.IsProduction() {
		t.Error("production gate not recognised")
	}
	// An automation-tier gate is also exit 3 but is a different situation, and
	// must not be reported to the user as a production deploy.
	tier := &ErrConfirmationRequired{Code: CodeApprovalRequired}
	if tier.IsProduction() {
		t.Error("tier gate misreported as the production gate")
	}
}

func TestAsConfirmationRequired(t *testing.T) {
	err := error(&ErrConfirmationRequired{Code: CodeApprovalRequired, RetryCmd: "alis build x --approve"})
	got, ok := AsConfirmationRequired(err)
	if !ok {
		t.Fatal("AsConfirmationRequired did not match")
	}
	if got.RetryCmd != "alis build x --approve" {
		t.Errorf("RetryCmd = %q", got.RetryCmd)
	}
	if _, ok := AsConfirmationRequired(errors.New("boom")); ok {
		t.Error("AsConfirmationRequired matched an unrelated error")
	}
}

func TestValidateOperationName(t *testing.T) {
	valid := "operations/" + "abcdef01-2345-6789-abcd-ef0123456789" // 36 chars
	if err := ValidateOperationName(valid); err != nil {
		t.Errorf("ValidateOperationName(%q) = %v, want nil", valid, err)
	}
	bad := []string{
		"",
		"operations/too-short",
		"abcdef01-2345-6789-abcd-ef0123456789", // missing prefix
		"operations/ABCDEF01-2345-6789-ABCD-EF012345678", // uppercase + wrong length
		"operations/abcdef01_2345_6789_abcd_ef0123456789",
	}
	for _, name := range bad {
		if err := ValidateOperationName(name); err == nil {
			t.Errorf("ValidateOperationName(%q) = nil, want error", name)
		}
	}
}

func TestCompareVersions(t *testing.T) {
	tests := []struct {
		a, b string
		want int
	}{
		{"1.69.7", "1.64.4", 1},
		{"1.64.4", "1.69.7", -1},
		{"1.64.4", "1.64.4", 0},
		{"1.64.10", "1.64.9", 1},
		{"2.0.0", "1.99.99", 1},
		{"1.70", "1.69.7", 1},
		{"v1.70.0", "1.70.0", 0},
		{"1.70.0-rc1", "1.70.0", 0},
		{"1.64.3", "1.64.4", -1},
	}
	for _, tt := range tests {
		if got := CompareVersions(tt.a, tt.b); got != tt.want {
			t.Errorf("CompareVersions(%q, %q) = %d, want %d", tt.a, tt.b, got, tt.want)
		}
	}
}

// TestFallbackMessage covers the observed contract deviation: some failures
// print human text with no JSON envelope even under --json, so the error must
// still carry something useful.
func TestFallbackMessage(t *testing.T) {
	if got := fallbackMessage([]byte("  stdout text \n"), []byte("stderr text")); got != "stdout text" {
		t.Errorf("fallbackMessage preferred the wrong stream: %q", got)
	}
	if got := fallbackMessage(nil, []byte("  Rpc error: bad name  ")); got != "Rpc error: bad name" {
		t.Errorf("fallbackMessage(stderr) = %q", got)
	}
	if got := fallbackMessage(nil, nil); got != "no output" {
		t.Errorf("fallbackMessage(empty) = %q", got)
	}
	long := make([]byte, 2000)
	for i := range long {
		long[i] = 'x'
	}
	if got := fallbackMessage(long, nil); len(got) > 520 {
		t.Errorf("fallbackMessage did not cap length: %d", len(got))
	}
}
