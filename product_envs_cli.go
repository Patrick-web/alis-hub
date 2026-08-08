package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"alis-hub-v3/internal/cliwrap"
)

// CLI-backed environment management.
//
// The Console API path in product_envs.go handles environment CRUD and the
// app's own .alis/.env activation. This adds what only the CLI can do:
//
//   - the production gate and automation-tier gates on variable writes;
//   - branch designation (`alis environment branches`), which has no Console
//     equivalent and is what --allow-branch-mismatch overrides on deploy;
//   - `environment refresh`, which renders the .env the platform would use;
//   - the canUpdate permission flag, so a UI can disable editing rather than
//     letting the write fail.

const envCLITimeout = 3 * time.Minute

// Approval carries a human's decision to let a gated command run.
//
// The two gates are separate and one does not satisfy the other: --approve
// clears an automation-tier gate, while a production environment needs
// --confirm-production (or an interactive yes). Passing --approve to a
// production deploy does nothing.
//
// The zero value means "not approved", so a first call always attempts the
// operation ungated and reports back what it would change. Only after the user
// has seen that and agreed should a caller retry with these set — which is what
// the ApprovalGate dialog does. Nothing may set them on the user's behalf.
type Approval struct {
	// Approve satisfies an APPROVAL_REQUIRED automation-tier gate.
	Approve bool `json:"approve"`
	// ConfirmProduction satisfies a PRODUCTION_CONFIRMATION_REQUIRED gate.
	ConfirmProduction bool `json:"confirmProduction"`
}

// forGate returns the approval that clears the given gate code, so a caller can
// turn a gate result straight into the retry without re-deriving which flag
// applies.
func approvalForGate(code string) Approval {
	switch code {
	case cliwrap.CodeProductionConfirmation:
		return Approval{ConfirmProduction: true}
	default:
		return Approval{Approve: true}
	}
}

// flags renders the approval as CLI flags.
func (a Approval) flags() []string {
	var out []string
	if a.Approve {
		out = append(out, "--approve")
	}
	if a.ConfirmProduction {
		out = append(out, "--confirm-production")
	}
	return out
}

// EnvGateResult reports an operation that the CLI refused pending approval.
//
// Exit 3 covers two situations, and the UI must tell them apart: a production
// environment needs explicit confirmation of that specific change, while the
// caller's automation tier gates the command class. Both carry a RetryCmd that
// is the exact command to re-run once the user has approved. Neither may be
// resolved by adding --approve or --confirm-production automatically.
type EnvGateResult struct {
	// Gated is true when the operation did not run.
	Gated bool `json:"gated"`
	// Code is PRODUCTION_CONFIRMATION_REQUIRED or APPROVAL_REQUIRED.
	Code string `json:"code"`
	// Message explains what the command would change, in the CLI's words.
	Message string `json:"message"`
	// RetryCmd is the exact command to run after approval.
	RetryCmd string `json:"retryCmd"`
	// Output is the CLI's stdout when the operation did run.
	Output string `json:"output,omitempty"`
	// Approval is what would clear this gate, ready to pass back on the retry.
	Approval Approval `json:"approval"`
}

// runEnvCLI executes an environment command, turning an exit-3 gate into an
// EnvGateResult rather than an error — being gated is an expected outcome here,
// not a failure. `environment unset` is destructive and so is gated on the
// default "balanced" tier; every write to a production environment is gated at
// every tier.
func (s *ProductService) runEnvCLI(label string, args ...string) (*EnvGateResult, error) {
	if s.alisCli == nil {
		return nil, fmt.Errorf("alis CLI not available")
	}
	ctx, cancel := context.WithTimeout(context.Background(), envCLITimeout)
	defer cancel()

	result, err := s.alisCli.Run(ctx, args...)
	if err != nil {
		if cerr, ok := cliwrap.AsConfirmationRequired(err); ok {
			code := cerr.Code
			if code == "" {
				code = cliwrap.CodeApprovalRequired
			}
			return &EnvGateResult{
				Gated:    true,
				Code:     code,
				Message:  cerr.Message,
				RetryCmd: cerr.RetryCmd,
				Approval: approvalForGate(code),
			}, nil
		}
		return nil, fmt.Errorf("%s: %w", label, err)
	}
	return &EnvGateResult{Output: string(result.Stdout)}, nil
}

// envRef builds the <org>.<product>.<env> reference the CLI takes.
func envRef(org, product, env string) string {
	return org + "." + product + "." + env
}

// ── Variables ─────────────────────────────────────────────────────────────────

// EnvironmentVariables is one environment's variables plus whether the caller
// may change them.
type EnvironmentVariables struct {
	EnvironmentID string        `json:"environmentId"`
	DisplayName   string        `json:"displayName"`
	Variables     []EnvVariable `json:"variables"`
	// CanUpdate reflects roles/environment.admin. Editing without it fails
	// server-side, so a UI should disable the controls instead.
	CanUpdate bool `json:"canUpdate"`
}

// ListEnvironmentVariablesCLI returns every environment's variables for a
// product in one call, via `alis environment variables <org>.<product> --json`.
func (s *ProductService) ListEnvironmentVariablesCLI(org, product string) ([]EnvironmentVariables, error) {
	if s.alisCli == nil {
		return nil, fmt.Errorf("alis CLI not available")
	}
	ctx, cancel := context.WithTimeout(context.Background(), envCLITimeout)
	defer cancel()

	result, err := s.alisCli.Run(ctx, "environment", "variables", org+"."+product, "--json")
	if err != nil {
		return nil, fmt.Errorf("environment variables: %w", err)
	}
	var v envVariablesResponse
	if err := json.Unmarshal(result.Stdout, &v); err != nil {
		return nil, fmt.Errorf("parse environment variables: %w", err)
	}

	out := make([]EnvironmentVariables, 0, len(v.Environments))
	for _, e := range v.Environments {
		vars := make([]EnvVariable, 0, len(e.Envs))
		for _, kv := range e.Envs {
			vars = append(vars, EnvVariable{Label: kv.Name, Value: kv.Value})
		}
		out = append(out, EnvironmentVariables{
			EnvironmentID: e.EnvironmentID,
			DisplayName:   e.DisplayName,
			Variables:     vars,
			CanUpdate:     e.CanUpdate,
		})
	}
	return out, nil
}

// envSetArgs builds `alis environment set <ref> NAME=VALUE ... --json [...]`.
//
// Values may themselves contain '=', so each pair is passed as a single
// argument and never re-split. Names are UPPER_SNAKE_CASE by convention.
func envSetArgs(ref string, vars []EnvVariable, deploy bool, approval Approval) []string {
	args := []string{"environment", "set", ref}
	for _, v := range vars {
		args = append(args, v.Label+"="+v.Value)
	}
	args = append(args, "--json")
	if deploy {
		args = append(args, "--deploy")
	}
	return append(args, approval.flags()...)
}

// envUnsetArgs builds `alis environment unset <ref> NAME ... --json [...]`.
func envUnsetArgs(ref string, names []string, deploy bool, approval Approval) []string {
	args := []string{"environment", "unset", ref}
	args = append(args, names...)
	args = append(args, "--json")
	if deploy {
		args = append(args, "--deploy")
	}
	return append(args, approval.flags()...)
}

// SetEnvironmentVariablesCLI sets one or more variables in a single call.
//
// deploy also triggers an environment deploy: without it the values are stored
// immediately but running services keep the old ones until their next deploy.
//
// confirmProduction lifts the production gate and must only be set after the
// user has approved this specific change. Concurrent edits (this app versus the
// console) are last-writer-wins with no merge, so re-read after writing rather
// than trusting the local view.
func (s *ProductService) SetEnvironmentVariablesCLI(org, product, env string, vars []EnvVariable, deploy bool, approval Approval) (*EnvGateResult, error) {
	if len(vars) == 0 {
		return nil, fmt.Errorf("no variables to set")
	}
	for _, v := range vars {
		if v.Label == "" {
			return nil, fmt.Errorf("variable name cannot be empty")
		}
	}
	args := envSetArgs(envRef(org, product, env), vars, deploy, approval)
	return s.runEnvCLI("environment set", args...)
}

// UnsetEnvironmentVariablesCLI removes variables from an environment.
// Unset is destructive and gated on the default automation tier, so a gated
// result is the common case rather than an edge case.
func (s *ProductService) UnsetEnvironmentVariablesCLI(org, product, env string, names []string, deploy bool, approval Approval) (*EnvGateResult, error) {
	if len(names) == 0 {
		return nil, fmt.Errorf("no variables to unset")
	}
	args := envUnsetArgs(envRef(org, product, env), names, deploy, approval)
	return s.runEnvCLI("environment unset", args...)
}

// ── Refresh ───────────────────────────────────────────────────────────────────

// RefreshEnvironmentCLI renders the .env for an environment via
// `alis environment refresh`.
//
// keyPath, when set, is where the service account key is written, and becomes
// GOOGLE_APPLICATION_CREDENTIALS in the emitted .env. The result contains live
// credentials — do not log it.
func (s *ProductService) RefreshEnvironmentCLI(org, product, env, keyPath string) (string, error) {
	if s.alisCli == nil {
		return "", fmt.Errorf("alis CLI not available")
	}
	ctx, cancel := context.WithTimeout(context.Background(), envCLITimeout)
	defer cancel()

	args := []string{"environment", "refresh", envRef(org, product, env), "--json"}
	if keyPath != "" {
		args = append(args, "--key-path", keyPath)
	}
	result, err := s.alisCli.Run(ctx, args...)
	if err != nil {
		return "", fmt.Errorf("environment refresh: %w", err)
	}
	return string(result.Stdout), nil
}

// ── Branch designation ────────────────────────────────────────────────────────

// EnvironmentBranches is an environment's deploy-branch designation.
type EnvironmentBranches struct {
	Organisation string `json:"organisation"`
	Product      string `json:"product"`
	Environment  string `json:"environment"`
	// AllowedBranches lists the branches that may deploy here. Empty means no
	// designation, i.e. any branch may deploy — the CLI reports that as null.
	AllowedBranches []string `json:"allowedBranches"`
	// Updated is true when the call changed the designation.
	Updated bool `json:"updated"`
}

// Unrestricted reports whether any branch may deploy to this environment.
func (e EnvironmentBranches) Unrestricted() bool { return len(e.AllowedBranches) == 0 }

// GetEnvironmentBranchesCLI reads the branch designation for an environment.
// This is what a deploy is checked against, and what --allow-branch-mismatch
// overrides.
func (s *ProductService) GetEnvironmentBranchesCLI(org, product, env string) (*EnvironmentBranches, error) {
	if s.alisCli == nil {
		return nil, fmt.Errorf("alis CLI not available")
	}
	ctx, cancel := context.WithTimeout(context.Background(), envCLITimeout)
	defer cancel()

	result, err := s.alisCli.Run(ctx, "environment", "branches", envRef(org, product, env), "--json")
	if err != nil {
		return nil, fmt.Errorf("environment branches: %w", err)
	}
	var v EnvironmentBranches
	if err := json.Unmarshal(result.Stdout, &v); err != nil {
		return nil, fmt.Errorf("parse environment branches: %w", err)
	}
	return &v, nil
}

// envBranchesArgs builds the mutating form of `alis environment branches`.
func envBranchesArgs(ref string, allow []string, clear bool, approval Approval) []string {
	args := []string{"environment", "branches", ref, "--json"}
	if clear {
		args = append(args, "--clear")
	}
	for _, b := range allow {
		args = append(args, "--allow", b)
	}
	return append(args, approval.flags()...)
}

// SetEnvironmentBranchesCLI designates which branches may deploy to an
// environment.
//
// allow REPLACES the current designation rather than adding to it, so callers
// must pass the complete list. clear removes the designation entirely, letting
// any branch deploy.
func (s *ProductService) SetEnvironmentBranchesCLI(org, product, env string, allow []string, clear bool, approval Approval) (*EnvGateResult, error) {
	if !clear && len(allow) == 0 {
		return nil, fmt.Errorf("pass at least one branch to allow, or clear the designation")
	}
	if clear && len(allow) > 0 {
		return nil, fmt.Errorf("clear and allow are mutually exclusive")
	}
	args := envBranchesArgs(envRef(org, product, env), allow, clear, approval)
	return s.runEnvCLI("environment branches", args...)
}

// ── Create ────────────────────────────────────────────────────────────────────

// envNewArgs builds `alis environment new <org>.<product> --json [...]`.
func envNewArgs(org, product, displayName string, production bool, approval Approval) []string {
	args := []string{"environment", "new", org + "." + product, "--json"}
	if displayName != "" {
		args = append(args, "--display-name", displayName)
	}
	if production {
		args = append(args, "--production")
	}
	return append(args, approval.flags()...)
}

// CreateEnvironmentCLI creates an environment via `alis environment new`.
//
// production marks it as a production environment, which permanently subjects
// every later deploy and variable write to the production gate. It cannot be
// inferred from the display name — "Production" is just a label — so callers
// must set it deliberately.
func (s *ProductService) CreateEnvironmentCLI(org, product, displayName string, production bool, approval Approval) (*EnvGateResult, error) {
	if org == "" || product == "" {
		return nil, fmt.Errorf("org and product are required")
	}
	args := envNewArgs(org, product, displayName, production, approval)
	return s.runEnvCLI("environment new", args...)
}

// parseEnvFile turns the .env text from RefreshEnvironmentCLI into pairs.
// Blank lines and # comments are skipped; a value may contain '='.
func parseEnvFile(content string) []EnvVariable {
	var out []EnvVariable
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		name, value, found := strings.Cut(line, "=")
		if !found {
			continue
		}
		out = append(out, EnvVariable{
			Label: strings.TrimSpace(name),
			Value: strings.Trim(strings.TrimSpace(value), `"`),
		})
	}
	return out
}
