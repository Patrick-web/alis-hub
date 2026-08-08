package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"alis-hub-v3/internal/cliwrap"
)

// CLI-backed implementations of the code block operations.
//
// The Console API path in product_blocks.go stays as the fallback: it speaks
// gRPC-web to console.alisx.com with session cookies and hand-rolled operation
// polling, which works but is reverse-engineered. The CLI drives the same
// server-side service and additionally performs the local git merge that an
// install or upgrade needs, so it is preferred where it can express the call.
//
// Instance resource names line up exactly with what --instance takes
// ("blocks/<block-id>/instances/<n>"), so the two paths are interchangeable
// from a caller's point of view.

// blocksCLITimeout bounds a block operation. Install and upgrade run
// server-side and then merge and push two git repos locally, so they are slow.
const blocksCLITimeout = 10 * time.Minute

// blockIDFromInstance extracts the block id from an instance resource name:
// "blocks/demogreeter/instances/959" -> "demogreeter".
//
// The CLI needs the block id as a positional argument even when --instance
// already identifies the install, so every instance-scoped call goes through
// this rather than asking callers to pass both.
func blockIDFromInstance(instance string) (string, error) {
	parts := strings.Split(instance, "/")
	if len(parts) < 4 || parts[0] != "blocks" || parts[2] != "instances" || parts[1] == "" {
		return "", fmt.Errorf("malformed block instance name %q: want blocks/<block-id>/instances/<n>", instance)
	}
	return parts[1], nil
}

// blockVersionTag reduces a version resource name to the bare tag the CLI's
// --version flag takes: "blocks/bb6b/versions/1.0.0-experimental1" ->
// "1.0.0-experimental1". A bare tag is returned unchanged.
func blockVersionTag(blockVersion string) string {
	if i := strings.LastIndex(blockVersion, "/versions/"); i >= 0 {
		return blockVersion[i+len("/versions/"):]
	}
	return blockVersion
}

// blocksCLIAvailable reports whether the CLI path can be used.
func (s *ProductService) blocksCLIAvailable() bool { return s.alisCli != nil }

// runBlocksCLI executes a blocks subcommand and returns raw stdout.
func (s *ProductService) runBlocksCLI(label string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), blocksCLITimeout)
	defer cancel()

	result, err := s.alisCli.Run(ctx, args...)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", label, err)
	}
	return result.Stdout, nil
}

// runBlocksGated is runBlocksCLI for the destructive subcommands, reporting an
// exit-3 gate as a result rather than an error. `blocks uninstall` and
// `blocks create` are gated on the default automation tier, so being stopped is
// the common path, not an edge case.
func (s *ProductService) runBlocksGated(label string, args ...string) (*EnvGateResult, error) {
	if !s.blocksCLIAvailable() {
		return nil, fmt.Errorf("alis CLI not available")
	}
	ctx, cancel := context.WithTimeout(context.Background(), blocksCLITimeout)
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

// ── List ──────────────────────────────────────────────────────────────────────

// BlocksOverview is the CLI's view of a service's blocks: what is installed
// into it and what else is available to install.
type BlocksOverview struct {
	Installed []BlockInstallInfo `json:"installed"`
	Available []BlockCatalogInfo `json:"available"`
}

// BlockInstallInfo describes one install of a block into a service.
type BlockInstallInfo struct {
	BlockID     string `json:"blockId"`
	DisplayName string `json:"displayName"`
	Tagline     string `json:"tagline"`
	// Instance is what every mutating call must be given when a block is
	// installed more than once into the same service.
	Instance         string `json:"instance"`
	InstalledVersion string `json:"installedVersion"`
	LatestVersion    string `json:"latestVersion"`
	State            string `json:"state"`
	BuildFolder      string `json:"buildFolder"`
	// GitBranch is the block/* branch the install was committed to — the branch
	// MergeBlockInstance folds into main.
	GitBranch          string `json:"gitBranch"`
	UpgradeAvailable   bool   `json:"upgradeAvailable"`
	AgenticInstallOnly bool   `json:"agenticInstallOnly"`
}

// BlockCatalogInfo describes a block available to install.
type BlockCatalogInfo struct {
	BlockID       string `json:"blockId"`
	DisplayName   string `json:"displayName"`
	Tagline       string `json:"tagline"`
	ReleaseLevel  string `json:"releaseLevel"`
	LatestVersion string `json:"latestVersion"`
	TotalInstalls int32  `json:"totalInstalls"`
	// AgenticInstallOnly blocks must not be offered a plain install action;
	// Deprecated blocks must not be offered for new installs at all.
	AgenticInstallOnly bool `json:"agenticInstallOnly"`
	Deprecated         bool `json:"deprecated"`
}

// ListServiceBlocks returns the installed and available blocks for a service,
// via `alis blocks list <pkg> --json`.
//
// This is the only call that reports instance refs and per-install state, so it
// is what a UI must read before offering upgrade, uninstall or merge.
func (s *ProductService) ListServiceBlocks(pkg string) (*BlocksOverview, error) {
	if !s.blocksCLIAvailable() {
		return nil, fmt.Errorf("alis CLI not available")
	}
	args := []string{"blocks", "list", "--json"}
	if pkg != "" {
		args = append(args, pkg)
	}
	stdout, err := s.runBlocksCLI("blocks list", args...)
	if err != nil {
		return nil, err
	}

	var v blocksListResponse
	if err := json.Unmarshal(stdout, &v); err != nil {
		return nil, fmt.Errorf("parse blocks list: %w", err)
	}

	out := &BlocksOverview{
		Installed: make([]BlockInstallInfo, 0, len(v.Installed)),
		Available: make([]BlockCatalogInfo, 0, len(v.Available)),
	}
	for _, b := range v.Installed {
		out.Installed = append(out.Installed, BlockInstallInfo{
			BlockID:            b.BlockID,
			DisplayName:        b.DisplayName,
			Tagline:            b.Tagline,
			Instance:           b.Instance,
			InstalledVersion:   b.InstalledVersion,
			LatestVersion:      b.LatestVersion,
			State:              b.State,
			BuildFolder:        b.BuildFolder,
			GitBranch:          b.GitBranch,
			UpgradeAvailable:   b.UpgradeAvailable,
			AgenticInstallOnly: b.AgenticInstallOnly,
		})
	}
	for _, b := range v.Available {
		out.Available = append(out.Available, BlockCatalogInfo{
			BlockID:            b.BlockID,
			DisplayName:        b.DisplayName,
			Tagline:            b.Tagline,
			ReleaseLevel:       b.ReleaseLevel,
			LatestVersion:      b.LatestVersion,
			TotalInstalls:      b.TotalInstalls,
			AgenticInstallOnly: b.AgenticInstallOnly,
			Deprecated:         b.Deprecated,
		})
	}
	return out, nil
}

// ── Install / upgrade / uninstall / merge ─────────────────────────────────────

// BlockInstallOptions covers `alis blocks install`.
type BlockInstallOptions struct {
	BlockID string `json:"blockId"`
	// Package is the target service, e.g. "voyage.zz.dummy.v1".
	Package string `json:"package"`
	// Version pins the block version; empty installs the latest stable.
	Version string `json:"version"`
	// BuildFolder is the root for the block's build files within the package,
	// defaulting to "./".
	BuildFolder string `json:"buildFolder"`
	// NoMerge skips the local git merge that otherwise follows a successful
	// install. See InstallBlockCLI for why a caller might want that.
	NoMerge bool `json:"noMerge"`
}

// blocksInstallArgs builds `alis blocks install <block-id> [<pkg>] --json [...]`.
// Block id first, package id second — `alis docs codeblocks` shows the reverse,
// but `alis blocks install --help` is authoritative.
func blocksInstallArgs(o BlockInstallOptions) []string {
	args := []string{"blocks", "install", o.BlockID}
	if o.Package != "" {
		args = append(args, o.Package)
	}
	args = append(args, "--json")
	if o.Version != "" {
		args = append(args, "--version", o.Version)
	}
	if o.BuildFolder != "" {
		args = append(args, "--build-folder", o.BuildFolder)
	}
	if o.NoMerge {
		args = append(args, "--no-merge")
	}
	return args
}

// InstallBlockCLI installs a block via `alis blocks install`.
//
// The install runs server-side and commits the generated files to a block/*
// branch in both the product build repo and the org define repo. The CLI then
// merges that branch into main in both local repos and pushes — unless NoMerge
// is set. Those are the same working trees this app's git UI operates on, so a
// caller that cannot guarantee a clean tree should set NoMerge and call
// MergeBlockInstanceCLI once the user has dealt with their local changes.
func (s *ProductService) InstallBlockCLI(opts BlockInstallOptions) (string, error) {
	if !s.blocksCLIAvailable() {
		return "", fmt.Errorf("alis CLI not available")
	}
	if opts.BlockID == "" {
		return "", fmt.Errorf("blockId is required")
	}
	stdout, err := s.runBlocksCLI("blocks install", blocksInstallArgs(opts)...)
	if err != nil {
		return "", err
	}
	return string(stdout), nil
}

// blocksInstanceArgs builds an instance-scoped blocks command:
// `alis blocks <verb> <block-id> --instance <ref> --json [extra...]`.
func blocksInstanceArgs(verb, instance string, extra ...string) ([]string, error) {
	blockID, err := blockIDFromInstance(instance)
	if err != nil {
		return nil, err
	}
	args := []string{"blocks", verb, blockID, "--instance", instance, "--json"}
	return append(args, extra...), nil
}

// UpgradeBlockInstanceCLI upgrades one install via `alis blocks upgrade`.
// blockVersion accepts either a bare tag or a full version resource name.
func (s *ProductService) UpgradeBlockInstanceCLI(instance, blockVersion string, noMerge bool) error {
	if !s.blocksCLIAvailable() {
		return fmt.Errorf("alis CLI not available")
	}
	var extra []string
	if tag := blockVersionTag(blockVersion); tag != "" {
		extra = append(extra, "--version", tag)
	}
	if noMerge {
		extra = append(extra, "--no-merge")
	}
	args, err := blocksInstanceArgs("upgrade", instance, extra...)
	if err != nil {
		return err
	}
	_, err = s.runBlocksCLI("blocks upgrade", args...)
	return err
}

// UninstallBlockInstanceCLI uninstalls one install via `alis blocks uninstall`.
//
// Uninstall is classed as destructive, so every automation tier except
// "autonomous" gates it: expect an exit-3 APPROVAL_REQUIRED envelope and show
// the user its retry command rather than passing --approve.
func (s *ProductService) UninstallBlockInstanceCLI(instance string, approval Approval) (*EnvGateResult, error) {
	if !s.blocksCLIAvailable() {
		return nil, fmt.Errorf("alis CLI not available")
	}
	args, err := blocksInstanceArgs("uninstall", instance, approval.flags()...)
	if err != nil {
		return nil, err
	}
	return s.runBlocksGated("blocks uninstall", args...)
}

// MergeBlockInstanceCLI merges an install's block/* branch into the local build
// and define repos — the deferred half of an install or upgrade run with
// NoMerge.
func (s *ProductService) MergeBlockInstanceCLI(instance string) error {
	if !s.blocksCLIAvailable() {
		return fmt.Errorf("alis CLI not available")
	}
	args, err := blocksInstanceArgs("merge", instance)
	if err != nil {
		return err
	}
	_, err = s.runBlocksCLI("blocks merge", args...)
	return err
}

// ── Authoring ─────────────────────────────────────────────────────────────────

// BlockCreateOptions covers `alis blocks create`. Account and DisplayName are
// required by the CLI.
type BlockCreateOptions struct {
	BlockID     string `json:"blockId"`
	Package     string `json:"package"`
	Account     string `json:"account"`
	DisplayName string `json:"displayName"`
	Tagline     string `json:"tagline"`
}

func blocksCreateArgs(o BlockCreateOptions) []string {
	args := []string{"blocks", "create", o.BlockID}
	if o.Package != "" {
		args = append(args, o.Package)
	}
	args = append(args, "--json", "--account", o.Account, "--display-name", o.DisplayName)
	if o.Tagline != "" {
		args = append(args, "--tagline", o.Tagline)
	}
	return args
}

// CreateBlockCLI creates a new code block from a service's existing code.
func (s *ProductService) CreateBlockCLI(opts BlockCreateOptions, approval Approval) (*EnvGateResult, error) {
	if !s.blocksCLIAvailable() {
		return nil, fmt.Errorf("alis CLI not available")
	}
	switch {
	case opts.BlockID == "":
		return nil, fmt.Errorf("blockId is required")
	case opts.Account == "":
		return nil, fmt.Errorf("account is required (see ListBlockAccounts)")
	case opts.DisplayName == "":
		return nil, fmt.Errorf("displayName is required")
	}
	args := append(blocksCreateArgs(opts), approval.flags()...)
	return s.runBlocksGated("blocks create", args...)
}

// BlockPublishOptions covers `alis blocks publish`. Notes and ReleaseLevel are
// required by the CLI.
type BlockPublishOptions struct {
	// Instance identifies which install to publish from. Required when the
	// block is installed more than once.
	Instance string `json:"instance"`
	BlockID  string `json:"blockId"`
	Package  string `json:"package"`
	// ReleaseLevel is GA, RC, BETA, ALPHA or EXPERIMENTAL. A block's skill only
	// syncs for GA, RC and BETA.
	ReleaseLevel string `json:"releaseLevel"`
	Notes        string `json:"notes"`
	// BuildCommit and DefineCommit pin the commits on the block's branch;
	// empty means the latest on each.
	BuildCommit  string `json:"buildCommit"`
	DefineCommit string `json:"defineCommit"`
}

func blocksPublishArgs(o BlockPublishOptions) []string {
	args := []string{"blocks", "publish", o.BlockID}
	if o.Package != "" {
		args = append(args, o.Package)
	}
	args = append(args, "--json", "--release-level", o.ReleaseLevel, "--notes", o.Notes)
	if o.Instance != "" {
		args = append(args, "--instance", o.Instance)
	}
	if o.BuildCommit != "" {
		args = append(args, "--build-commit", o.BuildCommit)
	}
	if o.DefineCommit != "" {
		args = append(args, "--define-commit", o.DefineCommit)
	}
	return args
}

// PublishBlockCLI publishes a new block version from commits on the block's
// branch, via `alis blocks publish`.
func (s *ProductService) PublishBlockCLI(opts BlockPublishOptions) (string, error) {
	if !s.blocksCLIAvailable() {
		return "", fmt.Errorf("alis CLI not available")
	}
	// The block id can be recovered from the instance ref, sparing callers from
	// having to pass both.
	if opts.BlockID == "" && opts.Instance != "" {
		id, err := blockIDFromInstance(opts.Instance)
		if err != nil {
			return "", err
		}
		opts.BlockID = id
	}
	switch {
	case opts.BlockID == "":
		return "", fmt.Errorf("blockId or instance is required")
	case opts.ReleaseLevel == "":
		return "", fmt.Errorf("releaseLevel is required (GA, RC, BETA, ALPHA or EXPERIMENTAL)")
	case opts.Notes == "":
		return "", fmt.Errorf("notes are required")
	}
	stdout, err := s.runBlocksCLI("blocks publish", blocksPublishArgs(opts)...)
	if err != nil {
		return "", err
	}
	return string(stdout), nil
}

// BlockAccount is an account eligible to own a published block.
type BlockAccount struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
}

// ListBlockAccounts returns the accounts that may publish code blocks, via
// `alis blocks accounts --json`. These are what BlockCreateOptions.Account takes.
func (s *ProductService) ListBlockAccounts() ([]BlockAccount, error) {
	if !s.blocksCLIAvailable() {
		return nil, fmt.Errorf("alis CLI not available")
	}
	stdout, err := s.runBlocksCLI("blocks accounts", "blocks", "accounts", "--json")
	if err != nil {
		return nil, err
	}
	var v struct {
		Accounts []BlockAccount `json:"accounts"`
	}
	if err := json.Unmarshal(stdout, &v); err != nil {
		return nil, fmt.Errorf("parse blocks accounts: %w", err)
	}
	return v.Accounts, nil
}

// BlockVersionInfo is one published version of a block.
type BlockVersionInfo struct {
	Name         string `json:"name"`
	Version      string `json:"version"`
	ReleaseLevel string `json:"releaseLevel"`
	CreateTime   string `json:"createTime"`
}

// ListBlockVersionsCLI lists a block's versions, newest first.
func (s *ProductService) ListBlockVersionsCLI(blockID string) ([]BlockVersionInfo, error) {
	if !s.blocksCLIAvailable() {
		return nil, fmt.Errorf("alis CLI not available")
	}
	stdout, err := s.runBlocksCLI("blocks versions", "blocks", "versions", blockID, "--json")
	if err != nil {
		return nil, err
	}
	var v blocksVersionsResponse
	if err := json.Unmarshal(stdout, &v); err != nil {
		return nil, fmt.Errorf("parse blocks versions: %w", err)
	}
	out := make([]BlockVersionInfo, 0, len(v.Versions))
	for _, ver := range v.Versions {
		out = append(out, BlockVersionInfo(ver))
	}
	return out, nil
}
