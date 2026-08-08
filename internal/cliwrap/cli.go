// Package cliwrap wraps the `alis` CLI binary as the app's execution plane for
// platform operations. See docs/ALIS_CLI_FEATURES.md for the CLI's output
// contract and the verified JSON response shapes this package decodes.
package cliwrap

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// DefaultTimeout bounds any CLI call made without an explicit deadline. The
// CLI's blocking commands wait indefinitely by default, so without this a
// hung network call would wedge the calling Wails method for the life of the
// process. Long-running DBD work is not affected: it is started with --async
// and polled, so each individual invocation is short.
const DefaultTimeout = 2 * time.Minute

// pipeDrainGrace bounds how long a killed CLI's output pipes may stay open
// before Run gives up on them. See the WaitDelay comment in RunIn.
const pipeDrainGrace = 5 * time.Second

// MinVersion is the lowest `alis` release this app is verified against. The
// migration depends on surface added after 1.64.4 (notably `environment
// branches` and block instances), so anything older is reported to the user
// rather than failing later with an opaque flag error.
const MinVersion = "1.64.4"

// Runner wraps the `alis` CLI binary.
type Runner struct {
	AlisPath string
	// Dir is the working directory for CLI invocations. The CLI resolves the
	// organisation, product and service from the cwd when arguments are
	// omitted; a GUI process launched from Finder inherits "/", where that
	// resolution yields nothing. Callers that rely on cwd resolution must set
	// this (or use RunIn); callers that pass a full reference need not.
	Dir string
}

// New creates a Runner, verifying that alis is available.
func New(alisPath string) (*Runner, error) {
	if _, err := exec.LookPath(alisPath); err != nil {
		return nil, fmt.Errorf("alis CLI not found at %q: %w", alisPath, err)
	}
	return &Runner{AlisPath: alisPath}, nil
}

// Result holds the parsed stdout, exit code, and retry command from a CLI invocation.
type Result struct {
	Stdout   json.RawMessage
	ExitCode int
	RetryCmd string
}

// OperationState is the flattened operation description returned by
// `alis operations describe`. The CLI flattens google.longrunning.Operation
// rather than passing it through, so Error is a string, not a rpc.Status.
type OperationState struct {
	Done    bool   `json:"done"`
	Version string `json:"version"`
	Notes   string `json:"notes"`
	Error   string `json:"error"`
	// Build operations include a logsUri.
	LogsURI string `json:"logsUri,omitempty"`
	// Define operations include artifacts.
	Artifacts []OperationArtifact `json:"artifacts,omitempty"`
	// Deploy operations include per-environment results. Note the field name:
	// the operation view uses logsUri, per-deployment entries use logsUrl.
	// They are distinct proto fields — do not normalise one to the other.
	Deployments []OperationDeployment `json:"deployments,omitempty"`
}

// OperationArtifact represents a single artifact in a define operation.
type OperationArtifact struct {
	Name         string `json:"name"`
	State        string `json:"state"`
	ErrorDetails string `json:"errorDetails,omitempty"`
}

// OperationDeployment represents a per-environment deploy result.
type OperationDeployment struct {
	LogsURL string `json:"logsUrl"`
}

// ErrorEnvelope is returned on pre-flight failures or exit-code-3 confirmations.
type ErrorEnvelope struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Retry   string `json:"retry"`
		Agent   string `json:"agent"`
	} `json:"error"`
}

// Error envelope codes the app reacts to specifically.
const (
	CodeProductionConfirmation = "PRODUCTION_CONFIRMATION_REQUIRED"
	CodeApprovalRequired       = "APPROVAL_REQUIRED"
	CodeActiveBuildAccount     = "ACTIVE_BUILD_ACCOUNT_REQUIRED"
	CodeBackendOutdated        = "backend_outdated"
)

// ErrConfirmationRequired is returned when the CLI exits with code 3. That
// covers two distinct cases, told apart by Code: a production deploy needing
// --confirm-production, and the caller's automation tier gating the command
// (APPROVAL_REQUIRED).
//
// A GUI app shelling out to alis is not a harness with a standing approval
// grant, so tier-gated commands reach here for every user on the "manual"
// tier. Neither case may be resolved by injecting --approve or
// --confirm-production automatically: RetryCmd must be surfaced to the user.
type ErrConfirmationRequired struct {
	Code     string
	RetryCmd string
	Message  string
	Agent    string
}

func (e *ErrConfirmationRequired) Error() string {
	code := e.Code
	if code == "" {
		code = "confirmation required"
	}
	if e.RetryCmd != "" {
		return fmt.Sprintf("%s: %s (retry with: %s)", code, e.Message, e.RetryCmd)
	}
	return fmt.Sprintf("%s: %s", code, e.Message)
}

// Is lets errors.Is match any *ErrConfirmationRequired regardless of contents.
func (e *ErrConfirmationRequired) Is(target error) bool {
	_, ok := target.(*ErrConfirmationRequired)
	return ok
}

// IsProduction reports whether this is the production deploy gate rather than
// an automation-tier gate.
func (e *ErrConfirmationRequired) IsProduction() bool {
	return e.Code == CodeProductionConfirmation
}

// ErrUnauthenticated is returned on exit code 4.
type ErrUnauthenticated struct{}

func (e *ErrUnauthenticated) Error() string {
	return "not authenticated: run `alis login` first"
}

// Is lets errors.Is match any *ErrUnauthenticated. Without this, the usual
// errors.Is(err, &ErrUnauthenticated{}) comparison never matches, because
// errors.Is falls back to pointer equality between two distinct allocations.
func (e *ErrUnauthenticated) Is(target error) bool {
	_, ok := target.(*ErrUnauthenticated)
	return ok
}

// ErrCLIFailure carries a non-zero exit that produced a structured envelope.
type ErrCLIFailure struct {
	Code     string
	Message  string
	RetryCmd string
	Agent    string
	ExitCode int
}

func (e *ErrCLIFailure) Error() string {
	return fmt.Sprintf("alis error [%s]: %s", e.Code, e.Message)
}

// Run executes `alis [args...]` and returns the parsed result. All commands
// should pass --json as one of the args to get machine-readable output.
// A context without a deadline gets DefaultTimeout applied.
func (r *Runner) Run(ctx context.Context, args ...string) (*Result, error) {
	return r.RunIn(ctx, r.Dir, args...)
}

// RunIn is Run with an explicit working directory, for the commands whose
// result depends on cwd-based context resolution (`context view` with no
// reference, `environment branches` with no reference, `blocks list` with no
// package id). An empty dir inherits the process's cwd.
func (r *Runner) RunIn(ctx context.Context, dir string, args ...string) (*Result, error) {
	if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, DefaultTimeout)
		defer cancel()
	}

	cmd := exec.CommandContext(ctx, r.AlisPath, args...)
	cmd.Dir = dir
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	// Cancelling the context kills the CLI, but Run still blocks until the
	// stdout/stderr pipes close — and any grandchild the CLI spawned (a package
	// manager, a git subprocess) inherits those pipes and can hold them open
	// long past the deadline. WaitDelay caps that tail so the timeout above is
	// the real bound on how long a caller can be blocked.
	cmd.WaitDelay = pipeDrainGrace

	runErr := cmd.Run()

	// ProcessState is nil when the process never started — the binary was
	// removed or replaced between New's LookPath and now, which `alis upgrade`
	// does routinely. Reading ExitCode() unconditionally panics there.
	if cmd.ProcessState == nil {
		if ctx.Err() != nil {
			return nil, fmt.Errorf("alis %s: %w", firstArg(args), ctx.Err())
		}
		return nil, fmt.Errorf("alis %s: could not start %q: %w", firstArg(args), r.AlisPath, runErr)
	}
	exitCode := cmd.ProcessState.ExitCode()
	stdoutBytes := stdout.Bytes()

	switch exitCode {
	case 0:
		return &Result{Stdout: stdoutBytes, ExitCode: 0}, nil
	case 3:
		if env := parseErrorEnvelope(stdoutBytes); env != nil {
			return nil, &ErrConfirmationRequired{
				Code:     env.Error.Code,
				RetryCmd: env.Error.Retry,
				Message:  env.Error.Message,
				Agent:    env.Error.Agent,
			}
		}
		return nil, &ErrConfirmationRequired{Message: fallbackMessage(stdoutBytes, stderr.Bytes())}
	case 4:
		return nil, &ErrUnauthenticated{}
	default:
		if env := parseErrorEnvelope(stdoutBytes); env != nil {
			return nil, &ErrCLIFailure{
				Code:     env.Error.Code,
				Message:  env.Error.Message,
				RetryCmd: env.Error.Retry,
				Agent:    env.Error.Agent,
				ExitCode: exitCode,
			}
		}
		// Not every failure produces an envelope: `operations describe` with a
		// malformed name exits 1 with a human-formatted block and no JSON,
		// even under --json. Fall back to whatever text we have.
		return nil, fmt.Errorf("alis %s exited %d: %s", firstArg(args), exitCode,
			fallbackMessage(stdoutBytes, stderr.Bytes()))
	}
}

// RunAsync runs a command with --async appended and returns the full stdout as raw JSON.
func (r *Runner) RunAsync(ctx context.Context, args ...string) (json.RawMessage, error) {
	// Copy rather than append in place: append can write through to the
	// caller's backing array when it has spare capacity.
	asyncArgs := make([]string, 0, len(args)+1)
	asyncArgs = append(asyncArgs, args...)
	asyncArgs = append(asyncArgs, "--async")

	result, err := r.Run(ctx, asyncArgs...)
	if err != nil {
		return nil, err
	}
	return result.Stdout, nil
}

// RunAsyncName runs a command with --async and extracts just the operation name.
func (r *Runner) RunAsyncName(ctx context.Context, args ...string) (string, error) {
	stdout, err := r.RunAsync(ctx, args...)
	if err != nil {
		return "", err
	}
	return parseAsyncName(stdout)
}

// Describe calls `alis operations describe <opName> --json` and returns the parsed state.
func (r *Runner) Describe(ctx context.Context, opName string) (*OperationState, error) {
	if err := ValidateOperationName(opName); err != nil {
		return nil, err
	}
	result, err := r.Run(ctx, "operations", "describe", opName, "--json")
	if err != nil {
		return nil, err
	}
	var state OperationState
	if err := json.Unmarshal(result.Stdout, &state); err != nil {
		return nil, fmt.Errorf("parse operations describe: %w", err)
	}
	return &state, nil
}

// ProgressEvent is one NDJSON line from stderr during a streaming command.
type ProgressEvent struct {
	Version string `json:"version"`
	Notes   string `json:"notes"`
	State   string `json:"state"`
	LogsURI string `json:"logsUri"`
}

// Wait re-attaches to an operation with `alis operations wait <name> --json`,
// forwarding each stderr NDJSON progress event to onProgress and returning the
// final operation state from stdout. This is the CLI's supported way to follow
// a long-running operation; it blocks server-side rather than sleep-polling.
//
// The caller's context governs how long to wait. Interrupting the wait does
// not cancel the server-side operation — call Wait again to re-attach.
func (r *Runner) Wait(ctx context.Context, opName string, onProgress func(ProgressEvent)) (*OperationState, error) {
	if err := ValidateOperationName(opName); err != nil {
		return nil, err
	}

	cmd := exec.CommandContext(ctx, r.AlisPath, "operations", "wait", opName, "--json")
	cmd.Dir = r.Dir
	cmd.WaitDelay = pipeDrainGrace
	var stdout bytes.Buffer
	cmd.Stdout = &stdout

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("operations wait: stderr pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("operations wait: start: %w", err)
	}

	var stderrTail []string
	scanner := bufio.NewScanner(stderrPipe)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		// Keep a bounded tail for diagnostics when the operation fails.
		stderrTail = append(stderrTail, line)
		if len(stderrTail) > 20 {
			stderrTail = stderrTail[1:]
		}
		if onProgress == nil {
			continue
		}
		var ev ProgressEvent
		if err := json.Unmarshal([]byte(line), &ev); err == nil {
			onProgress(ev)
		}
	}
	// A scan error only costs us progress events; the authoritative result is
	// still on stdout, so record it and carry on to cmd.Wait.
	if err := scanner.Err(); err != nil {
		stderrTail = append(stderrTail, fmt.Sprintf("(progress stream ended: %v)", err))
	}

	waitErr := cmd.Wait()
	if cmd.ProcessState == nil {
		return nil, fmt.Errorf("operations wait: %w", waitErr)
	}
	if code := cmd.ProcessState.ExitCode(); code != 0 {
		if env := parseErrorEnvelope(stdout.Bytes()); env != nil {
			return nil, &ErrCLIFailure{
				Code: env.Error.Code, Message: env.Error.Message,
				RetryCmd: env.Error.Retry, Agent: env.Error.Agent, ExitCode: code,
			}
		}
		// The operation's own failure still arrives as a parseable operation on
		// stdout — parse it before treating this as a CLI-level error.
		var state OperationState
		if err := json.Unmarshal(stdout.Bytes(), &state); err == nil && state.Done {
			return &state, nil
		}
		return nil, fmt.Errorf("operations wait exited %d: %s", code, strings.Join(stderrTail, "; "))
	}

	var state OperationState
	if err := json.Unmarshal(stdout.Bytes(), &state); err != nil {
		return nil, fmt.Errorf("parse operations wait: %w", err)
	}
	return &state, nil
}

// Version returns the installed CLI version via `alis version --json`.
func (r *Runner) Version(ctx context.Context) (string, error) {
	result, err := r.Run(ctx, "version", "--json")
	if err != nil {
		return "", err
	}
	var v struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(result.Stdout, &v); err != nil {
		return "", fmt.Errorf("parse version: %w", err)
	}
	if v.Version == "" {
		return "", fmt.Errorf("empty version in `alis version` output")
	}
	return v.Version, nil
}

// CheckMinVersion reports whether the installed CLI is at least MinVersion.
// It returns the detected version alongside the verdict so callers can log or
// surface it. An unparseable version is treated as acceptable rather than
// blocking the app on a format change.
func (r *Runner) CheckMinVersion(ctx context.Context) (version string, ok bool, err error) {
	version, err = r.Version(ctx)
	if err != nil {
		return "", false, err
	}
	return version, CompareVersions(version, MinVersion) >= 0, nil
}

// CompareVersions compares dotted numeric versions, ignoring any pre-release
// suffix. Returns -1, 0 or 1. Non-numeric components compare as 0.
func CompareVersions(a, b string) int {
	segs := func(v string) []int {
		if i := strings.IndexAny(v, "-+"); i >= 0 {
			v = v[:i]
		}
		parts := strings.Split(strings.TrimPrefix(v, "v"), ".")
		out := make([]int, len(parts))
		for i, p := range parts {
			n, _ := strconv.Atoi(p)
			out[i] = n
		}
		return out
	}
	av, bv := segs(a), segs(b)
	for i := 0; i < len(av) || i < len(bv); i++ {
		var x, y int
		if i < len(av) {
			x = av[i]
		}
		if i < len(bv) {
			y = bv[i]
		}
		if x != y {
			if x < y {
				return -1
			}
			return 1
		}
	}
	return 0
}

// ValidateOperationName checks the name against the format the CLI enforces
// client-side (^operations/[a-z0-9-]{36}$). Catching it here turns what would
// be an exit-1 human-formatted error with no JSON envelope into a clear one.
func ValidateOperationName(name string) error {
	rest, ok := strings.CutPrefix(name, "operations/")
	if !ok || len(rest) != 36 {
		return fmt.Errorf("invalid operation name %q: want operations/<36 chars>", name)
	}
	for _, c := range rest {
		if (c < 'a' || c > 'z') && (c < '0' || c > '9') && c != '-' {
			return fmt.Errorf("invalid operation name %q: unexpected character %q", name, c)
		}
	}
	return nil
}

// parseAsyncName extracts the operation name from `alis <cmd> --json --async` output.
// Output format: {"name":"operations/..."}
func parseAsyncName(stdout json.RawMessage) (string, error) {
	var v struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(stdout, &v); err != nil {
		return "", fmt.Errorf("parse async output: %w (raw: %s)", err, string(stdout))
	}
	if v.Name == "" {
		return "", fmt.Errorf("empty operation name in async output: %s", string(stdout))
	}
	return v.Name, nil
}

// parseErrorEnvelope tries to parse a structured error envelope from stdout.
func parseErrorEnvelope(stdout json.RawMessage) *ErrorEnvelope {
	var env ErrorEnvelope
	if err := json.Unmarshal(stdout, &env); err != nil {
		return nil
	}
	if env.Error.Code == "" && env.Error.Message == "" {
		return nil
	}
	return &env
}

// fallbackMessage picks the most useful human text available when no envelope
// was produced, preferring stdout and capping length for log/UI use.
func fallbackMessage(stdout, stderr []byte) string {
	msg := strings.TrimSpace(string(stdout))
	if msg == "" {
		msg = strings.TrimSpace(string(stderr))
	}
	msg = strings.Join(strings.Fields(msg), " ")
	if len(msg) > 500 {
		msg = msg[:500] + "…"
	}
	if msg == "" {
		return "no output"
	}
	return msg
}

func firstArg(args []string) string {
	if len(args) == 0 {
		return ""
	}
	return args[0]
}

// AsConfirmationRequired extracts a *ErrConfirmationRequired from an error chain.
func AsConfirmationRequired(err error) (*ErrConfirmationRequired, bool) {
	var e *ErrConfirmationRequired
	ok := errors.As(err, &e)
	return e, ok
}

// AsCLIFailure extracts a *ErrCLIFailure from an error chain.
func AsCLIFailure(err error) (*ErrCLIFailure, bool) {
	var e *ErrCLIFailure
	ok := errors.As(err, &e)
	return e, ok
}

// NeuronToPackageID converts a neuron resource name to an alis package ID.
// "organisations/voyage/products/vp/neurons/asana-v1" -> "voyage.vp.asana.v1"
// "organisations/x/products/y/neurons/internal-api-v2" -> "x.y.internal.api.v2"
func NeuronToPackageID(neuron string) string {
	parts := strings.Split(neuron, "/")
	if len(parts) < 6 {
		return neuron
	}
	org := parts[1]
	product := parts[3]
	neuronID := parts[5]
	return org + "." + product + "." + strings.ReplaceAll(neuronID, "-", ".")
}

// ExtractEnvID extracts the environment identifier from a full resource name.
// "organisations/x/products/y/environments/dev" -> "dev"
func ExtractEnvID(env string) string {
	parts := strings.Split(env, "/")
	if len(parts) >= 6 {
		return parts[5]
	}
	return env
}
