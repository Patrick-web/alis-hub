package main

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"alis-hub-v3/internal/cliwrap"
)

// Platform commands with no equivalent elsewhere in the app: ask, doctor,
// accounts, resource creation, credential repair and operation inspection.

const (
	askTimeout      = 3 * time.Minute
	platformTimeout = 60 * time.Second
)

// ── Ask ───────────────────────────────────────────────────────────────────────

// AskAnswer is a cited answer over the caller's own platform content.
type AskAnswer struct {
	// Answer is the full text. The CLI calls this field answerDelta despite it
	// not being a delta under --json.
	Answer string `json:"answer"`
	// Session carries multi-turn context. Pass it back to AskFollowUp so the
	// next question resolves against this one; without it each ask stands alone.
	Session   string        `json:"session"`
	Citations []AskCitation `json:"citations"`
	// RelatedQuestions are suggested follow-ups.
	RelatedQuestions []string `json:"relatedQuestions"`
}

// AskCitation is a typed reference backing part of an answer.
type AskCitation struct {
	// Kind is SKILL, SESSION or TICKET. A SKILL name is a bare id loadable with
	// SkillsLoad; SESSION is contexts/{id}; TICKET is tickets/{id}.
	Kind  string `json:"kind"`
	Name  string `json:"name"`
	Title string `json:"title"`
}

// Ask answers a question from the caller's coding sessions, support
// conversations and shared skills. Access is enforced at retrieval, so it can
// only ever draw on what this user can already see.
//
// session continues an earlier conversation; pass the Session from a previous
// answer. Exit 1 with `no_answer` means rephrase rather than retry.
func (s *CLIService) Ask(question, session string) (*AskAnswer, error) {
	if !s.available() {
		return nil, fmt.Errorf("alis CLI not available")
	}
	if question == "" {
		return nil, fmt.Errorf("question is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), askTimeout)
	defer cancel()

	args := []string{"ask", question, "--json"}
	if session != "" {
		args = append(args, "--session", session)
	}
	result, err := s.runner.Run(ctx, args...)
	if err != nil {
		return nil, fmt.Errorf("ask: %w", err)
	}
	var v askResponse
	if err := json.Unmarshal(result.Stdout, &v); err != nil {
		return nil, fmt.Errorf("parse ask: %w", err)
	}

	answer := &AskAnswer{
		Answer:           v.AnswerDelta,
		Session:          v.Session,
		RelatedQuestions: v.RelatedQuestions,
		Citations:        make([]AskCitation, 0, len(v.Citations)),
	}
	for _, c := range v.Citations {
		answer.Citations = append(answer.Citations, AskCitation(c))
	}
	return answer, nil
}

// ── Diagnostics ───────────────────────────────────────────────────────────────

// Diagnostics is the local environment snapshot from `alis doctor`.
type Diagnostics struct {
	CLIVersion string `json:"cliVersion"`
	OS         string `json:"os"`
	Arch       string `json:"arch"`
	Terminal   string `json:"terminal"`
	Shell      string `json:"shell"`
	CreatedAt  string `json:"createdAt"`
	Authorized bool   `json:"authorized"`
	// BuildAccount is the account owning Build subscriptions and billing.
	BuildAccount string `json:"buildAccount"`
	// AutomationTier is "manual", "balanced" or "autonomous" — it decides which
	// commands come back as an exit-3 approval gate.
	AutomationTier string `json:"automationTier"`
	// SafeModeEnabled restricts platform commands to SafeModeOrganisations.
	SafeModeEnabled       bool                  `json:"safeModeEnabled"`
	SafeModeOrganisations []string              `json:"safeModeOrganisations"`
	Components            []DiagnosticComponent `json:"components"`
	Setup                 []DiagnosticSetupItem `json:"setup"`
	DetectedBinaries      map[string]string     `json:"detectedBinaries"`
}

type DiagnosticComponent struct {
	Name     string `json:"name"`
	Version  string `json:"version"`
	Detected bool   `json:"detected"`
}

type DiagnosticSetupItem struct {
	Name      string `json:"name"`
	Installed bool   `json:"installed"`
	Detail    string `json:"detail"`
}

// Doctor collects a local diagnostics snapshot.
//
// Nothing is uploaded: --ticket is deliberately not exposed here, so this stays
// a read-only local call. The log tail is excluded too, since it can contain
// paths and command lines the user has not chosen to share.
func (s *CLIService) Doctor() (*Diagnostics, error) {
	if !s.available() {
		return nil, fmt.Errorf("alis CLI not available")
	}
	ctx, cancel := context.WithTimeout(context.Background(), platformTimeout)
	defer cancel()

	result, err := s.runner.Run(ctx, "doctor", "--json", "--no-logs")
	if err != nil {
		return nil, fmt.Errorf("doctor: %w", err)
	}
	var v doctorResponse
	if err := json.Unmarshal(result.Stdout, &v); err != nil {
		return nil, fmt.Errorf("parse doctor: %w", err)
	}

	d := &Diagnostics{
		CLIVersion:            v.CLIVersion,
		OS:                    v.OS,
		Arch:                  v.Arch,
		Terminal:              v.Terminal,
		Shell:                 v.Shell,
		CreatedAt:             v.CreatedAt,
		Authorized:            v.Auth.Authorized,
		BuildAccount:          v.Auth.BuildAccount,
		AutomationTier:        automationTierFrom(v.Settings.Approvals),
		SafeModeEnabled:       v.Settings.SafeMode.Enabled,
		SafeModeOrganisations: v.Settings.SafeMode.AllowedOrganisationIDs,
		DetectedBinaries:      v.Bins,
	}
	for _, c := range v.Components {
		d.Components = append(d.Components, DiagnosticComponent(c))
	}
	for _, item := range v.Setup {
		d.Setup = append(d.Setup, DiagnosticSetupItem(item))
	}
	return d, nil
}

// automationTierFrom reads the tier out of doctor's settings.approvals.
// An absent or empty object means the default, "balanced".
func automationTierFrom(approvals map[string]any) string {
	if len(approvals) == 0 {
		return "balanced"
	}
	for _, key := range []string{"tier", "level", "mode"} {
		if v, ok := approvals[key].(string); ok && v != "" {
			return v
		}
	}
	return "balanced"
}

// ── Accounts ──────────────────────────────────────────────────────────────────

// BuildAccount is an account eligible to own Build subscriptions and billing.
type BuildAccountInfo struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	Active      bool   `json:"active"`
}

// ListAccounts returns the accounts eligible to own Build usage.
//
// This is the one command that returns snake_case keys.
func (s *CLIService) ListAccounts() ([]BuildAccountInfo, error) {
	if !s.available() {
		return nil, fmt.Errorf("alis CLI not available")
	}
	ctx, cancel := context.WithTimeout(context.Background(), platformTimeout)
	defer cancel()

	result, err := s.runner.Run(ctx, "accounts", "list", "--json")
	if err != nil {
		return nil, fmt.Errorf("accounts list: %w", err)
	}
	var v accountsListResponse
	if err := json.Unmarshal(result.Stdout, &v); err != nil {
		return nil, fmt.Errorf("parse accounts list: %w", err)
	}
	out := make([]BuildAccountInfo, 0, len(v.Accounts))
	for _, a := range v.Accounts {
		out = append(out, BuildAccountInfo{Name: a.Name, DisplayName: a.DisplayName, Active: a.Active})
	}
	return out, nil
}

// SelectAccount sets the active Build account.
//
// Never call this on the user's behalf. When a command fails with
// ACTIVE_BUILD_ACCOUNT_REQUIRED, list the accounts, ask which should own Build
// subscriptions and billing, and only then select — it is a billing decision.
func (s *CLIService) SelectAccount(account string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	if account == "" {
		return "", fmt.Errorf("account is required, e.g. accounts/8na6ap")
	}
	ctx, cancel := context.WithTimeout(context.Background(), platformTimeout)
	defer cancel()

	result, err := s.runner.Run(ctx, "accounts", "select", account, "--json")
	if err != nil {
		return "", fmt.Errorf("accounts select: %w", err)
	}
	return string(result.Stdout), nil
}

// ── Resource creation ─────────────────────────────────────────────────────────

// NewProduct creates a product via `alis product new <org>.<product>`.
func (s *CLIService) NewProduct(org, product, displayName string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	if org == "" || product == "" {
		return "", fmt.Errorf("org and product are required")
	}
	args := []string{"product", "new", org + "." + product, "--json"}
	if displayName != "" {
		args = append(args, "--display-name", displayName)
	}
	return s.runPlatform("product new", args...)
}

// NewService creates a service via `alis service new <package-id>`.
//
// packageID is the full <org>.<product>.<path>.<vN> form, which maps
// deterministically to the neuron resource and the on-disk folders.
func (s *CLIService) NewService(packageID string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	if packageID == "" {
		return "", fmt.Errorf("package id is required, e.g. voyage.zz.demo.v1")
	}
	return s.runPlatform("service new", "service", "new", packageID, "--json")
}

func (s *CLIService) runPlatform(label string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), platformTimeout)
	defer cancel()

	result, err := s.runner.Run(ctx, args...)
	if err != nil {
		return "", fmt.Errorf("%s: %w", label, err)
	}
	return string(result.Stdout), nil
}

// ── Operations ────────────────────────────────────────────────────────────────

// OperationSnapshot is a one-shot poll of a long-running operation.
type OperationSnapshot struct {
	Name    string `json:"name"`
	Done    bool   `json:"done"`
	Version string `json:"version"`
	Notes   string `json:"notes"`
	LogsURI string `json:"logsUri"`
	// Error is the operation's own failure, flattened to a string by
	// `operations describe`. The --async envelope reports it as an object
	// instead, so the two shapes must not share a decoder.
	Error string `json:"error,omitempty"`
}

// DescribeOperation polls an operation without blocking. Use it to re-check an
// operation the app started earlier, for instance after a restart.
func (s *CLIService) DescribeOperation(name string) (*OperationSnapshot, error) {
	if !s.available() {
		return nil, fmt.Errorf("alis CLI not available")
	}
	ctx, cancel := context.WithTimeout(context.Background(), platformTimeout)
	defer cancel()

	state, err := s.runner.Describe(ctx, name)
	if err != nil {
		return nil, fmt.Errorf("operations describe: %w", err)
	}
	return &OperationSnapshot{
		Name:    name,
		Done:    state.Done,
		Version: state.Version,
		Notes:   state.Notes,
		LogsURI: state.LogsURI,
		Error:   state.Error,
	}, nil
}

// FollowOperation re-attaches to an operation and streams its progress as
// dbd:progress / dbd:done events, the same channel the DBD services use.
//
// It returns immediately. Interrupting a wait never cancels the operation, so
// this is safe to call repeatedly — following an operation already being
// followed is a no-op.
func (s *CLIService) FollowOperation(name, kind string) error {
	if !s.available() {
		return fmt.Errorf("alis CLI not available")
	}
	if err := cliwrap.ValidateOperationName(name); err != nil {
		return err
	}
	if kind == "" {
		kind = "operation"
	}
	dbdProgress.Follow(name, kind)
	return nil
}

// ── Credentials ───────────────────────────────────────────────────────────────

// GcloudAuthHosts reports which registry hosts the CLI has configured
// credentials for. The tokens themselves are deliberately not returned.
type GcloudAuthHosts struct {
	NetrcHosts []string `json:"netrcHosts"`
	NpmrcHosts []string `json:"npmrcHosts"`
	DartHosts  []string `json:"dartHosts"`
}

// GcloudAuthHostsForProduct lists the configured registry hosts for a product.
//
// `alis gcloud auth --json` also returns live access tokens; those are dropped
// here rather than crossing the Wails boundary into a renderer where they could
// end up in logs or devtools.
func (s *CLIService) GcloudAuthHostsForProduct(org, product string) (*GcloudAuthHosts, error) {
	if !s.available() {
		return nil, fmt.Errorf("alis CLI not available")
	}
	ctx, cancel := context.WithTimeout(context.Background(), platformTimeout)
	defer cancel()

	result, err := s.runner.Run(ctx, "gcloud", "auth", org+"."+product, "--json")
	if err != nil {
		return nil, fmt.Errorf("gcloud auth: %w", err)
	}
	var v struct {
		NetrcHosts []string `json:"netrcHosts"`
		NpmrcHosts []string `json:"npmrcHosts"`
		DartHosts  []string `json:"dartHosts"`
	}
	if err := json.Unmarshal(result.Stdout, &v); err != nil {
		return nil, fmt.Errorf("parse gcloud auth: %w", err)
	}
	return &GcloudAuthHosts{NetrcHosts: v.NetrcHosts, NpmrcHosts: v.NpmrcHosts, DartHosts: v.DartHosts}, nil
}

// GitRemotes reports a product's define and build repo URLs and the git
// identity the CLI configures.
//
// `alis git configure --json` also returns live ID tokens; those are dropped
// here for the same reason as in GcloudAuthHostsForProduct.
type GitRemotes struct {
	DefineRemoteURL string `json:"defineRemoteUrl"`
	BuildRemoteURL  string `json:"buildRemoteUrl"`
	UserName        string `json:"userName"`
	UserEmail       string `json:"userEmail"`
}

// GitRemotesForProduct returns the product's repo URLs and git identity.
func (s *CLIService) GitRemotesForProduct(org, product string) (*GitRemotes, error) {
	if !s.available() {
		return nil, fmt.Errorf("alis CLI not available")
	}
	ctx, cancel := context.WithTimeout(context.Background(), platformTimeout)
	defer cancel()

	result, err := s.runner.Run(ctx, "git", "configure", org+"."+product, "--json")
	if err != nil {
		return nil, fmt.Errorf("git configure: %w", err)
	}
	var v gitConfigureResponse
	if err := json.Unmarshal(result.Stdout, &v); err != nil {
		return nil, fmt.Errorf("parse git configure: %w", err)
	}
	return &GitRemotes{
		DefineRemoteURL: v.DefineGitConfig.RemoteURL,
		BuildRemoteURL:  v.BuildGitConfig.RemoteURL,
		UserName:        v.UserName,
		UserEmail:       v.UserEmail,
	}, nil
}

// ── Context telemetry ─────────────────────────────────────────────────────────

// PushSession saves a local coding-agent session transcript to Alis history.
// harness narrows the search to claude-code, codex or gemini.
func (s *CLIService) PushSession(session, harness string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	args := []string{"context", "push-session", "--json"}
	if session != "" {
		args = append(args, "--session", session)
	}
	if harness != "" {
		args = append(args, "--harness", harness)
	}
	return s.runPlatform("context push-session", args...)
}

// ScanSessions scans local harness transcripts once and pushes telemetry events.
func (s *CLIService) ScanSessions() (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	return s.runPlatform("context scan", "context", "scan", "--json")
}
