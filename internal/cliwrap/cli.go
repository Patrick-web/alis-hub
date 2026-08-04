package cliwrap

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
)

// Runner wraps the `alis` CLI binary.
type Runner struct {
	AlisPath string
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

// OperationState is the flattened operation description returned by `alis operations describe`.
type OperationState struct {
	Done    bool   `json:"done"`
	Version string `json:"version"`
	Notes   string `json:"notes"`
	Error   string `json:"error"`
	// Build operations include a logsUri.
	LogsURI string `json:"logsUri,omitempty"`
	// Define operations include artifacts.
	Artifacts []OperationArtifact `json:"artifacts,omitempty"`
	// Deploy operations include per-environment results (response field).
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

// ErrConfirmationRequired is returned when the CLI exits with code 3 and provides a retry command.
type ErrConfirmationRequired struct {
	RetryCmd string
	Message  string
}

func (e *ErrConfirmationRequired) Error() string {
	return fmt.Sprintf("confirmation required: %s (retry with: %s)", e.Message, e.RetryCmd)
}

// ErrUnauthenticated is returned on exit code 4.
type ErrUnauthenticated struct{}

func (e *ErrUnauthenticated) Error() string {
	return "not authenticated: run `alis login` first"
}

// Run executes `alis [args...]` and returns the parsed result. All commands
// should pass --json as one of the args to get machine-readable output.
func (r *Runner) Run(ctx context.Context, args ...string) (*Result, error) {
	cmd := exec.CommandContext(ctx, r.AlisPath, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	runErr := cmd.Run()
	exitCode := cmd.ProcessState.ExitCode()

	stdoutBytes := stdout.Bytes()

	switch exitCode {
	case 0:
		return &Result{Stdout: stdoutBytes, ExitCode: 0}, nil
	case 3:
		if env := parseErrorEnvelope(stdoutBytes); env != nil {
			return nil, &ErrConfirmationRequired{
				RetryCmd: env.Error.Retry,
				Message:  env.Error.Message,
			}
		}
		return nil, &ErrConfirmationRequired{Message: string(bytes.TrimSpace(stdoutBytes))}
	case 4:
		return nil, &ErrUnauthenticated{}
	default:
		if env := parseErrorEnvelope(stdoutBytes); env != nil {
			return nil, fmt.Errorf("alis error [%s]: %s", env.Error.Code, env.Error.Message)
		}
		if runErr != nil {
			return nil, fmt.Errorf("alis exited %d: %w\nstderr: %s", exitCode, runErr, stderr.String())
		}
		return nil, fmt.Errorf("alis exited %d", exitCode)
	}
}

// RunAsync runs a command with --async appended and returns the operation name.
func (r *Runner) RunAsync(ctx context.Context, args ...string) (string, error) {
	asyncArgs := append(args, "--async")
	result, err := r.Run(ctx, asyncArgs...)
	if err != nil {
		return "", err
	}
	return parseAsyncName(result.Stdout)
}

// Describe calls `alis operations describe <opName> --json` and returns the parsed state.
func (r *Runner) Describe(ctx context.Context, opName string) (*OperationState, error) {
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

// progressEvent is an NDJSON line from stderr during `alis operations wait --json`.
type progressEvent struct {
	Version string `json:"version"`
	Notes   string `json:"notes"`
	LogsURI string `json:"logsUri"`
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
