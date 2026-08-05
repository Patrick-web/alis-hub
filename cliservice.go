package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"alis-hub-v3/internal/cliwrap"
)

// CLIService provides CLI-backed operations for packages, code blocks, and
// environment management. It is a Wails-bound service that can be called
// from the frontend as an alternative to the gRPC/Console API paths.
type CLIService struct {
	runner *cliwrap.Runner
}

func NewCLIService() *CLIService {
	svc := &CLIService{}
	if r, err := cliwrap.New("alis"); err == nil {
		svc.runner = r
	}
	return svc
}

func (s *CLIService) available() bool { return s.runner != nil }

// =============================================================================
// Code blocks
// =============================================================================

// CLIBlocksList runs `alis blocks list [<pkg>] --json`.
func (s *CLIService) CLIBlocksList(pkg string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	args := []string{"blocks", "list", "--json"}
	if pkg != "" {
		args = append(args, pkg)
	}
	result, err := s.runner.Run(context.Background(), args...)
	if err != nil {
		return "", fmt.Errorf("blocks list: %w", err)
	}
	return string(result.Stdout), nil
}

// CLIBlocksInstall runs `alis blocks install <blockId> [<pkg>] --json`.
func (s *CLIService) CLIBlocksInstall(blockID, pkg string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	args := []string{"blocks", "install", blockID, "--json"}
	if pkg != "" {
		args = append(args, pkg)
	}
	result, err := s.runner.Run(context.Background(), args...)
	if err != nil {
		return "", fmt.Errorf("blocks install: %w", err)
	}
	return string(result.Stdout), nil
}

// CLIBlocksUpgrade runs `alis blocks upgrade <blockId> [<pkg>] --json`.
func (s *CLIService) CLIBlocksUpgrade(blockID, pkg string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	args := []string{"blocks", "upgrade", blockID, "--json"}
	if pkg != "" {
		args = append(args, pkg)
	}
	result, err := s.runner.Run(context.Background(), args...)
	if err != nil {
		return "", fmt.Errorf("blocks upgrade: %w", err)
	}
	return string(result.Stdout), nil
}

// CLIBlocksUninstall runs `alis blocks uninstall <blockId> [<pkg>] --json`.
func (s *CLIService) CLIBlocksUninstall(blockID, pkg string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	args := []string{"blocks", "uninstall", blockID, "--json"}
	if pkg != "" {
		args = append(args, pkg)
	}
	result, err := s.runner.Run(context.Background(), args...)
	if err != nil {
		return "", fmt.Errorf("blocks uninstall: %w", err)
	}
	return string(result.Stdout), nil
}

// CLIBlocksMerge runs `alis blocks merge <blockId> [<pkg>] --json`.
func (s *CLIService) CLIBlocksMerge(blockID, pkg string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	args := []string{"blocks", "merge", blockID, "--json"}
	if pkg != "" {
		args = append(args, pkg)
	}
	result, err := s.runner.Run(context.Background(), args...)
	if err != nil {
		return "", fmt.Errorf("blocks merge: %w", err)
	}
	return string(result.Stdout), nil
}

// CLIBlocksVersions runs `alis blocks versions <blockId> --json`.
func (s *CLIService) CLIBlocksVersions(blockID string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	result, err := s.runner.Run(context.Background(), "blocks", "versions", blockID, "--json")
	if err != nil {
		return "", fmt.Errorf("blocks versions: %w", err)
	}
	return string(result.Stdout), nil
}

// =============================================================================
// Git credential setup
// =============================================================================

// CLIAuthorise runs `alis authorise <org>.<product> --json` to configure git
// credential helpers and refresh package credentials for a product.
func (s *CLIService) CLIAuthorise(org, product string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	ref := org + "." + product
	result, err := s.runner.Run(context.Background(), "authorise", ref, "--json")
	if err != nil {
		return "", fmt.Errorf("authorise: %w", err)
	}
	return string(result.Stdout), nil
}

// CLIGitConfigure runs `alis git configure <org>.<product> --json` to show
// git remote URLs, auth tokens, and user identity for the product repos.
func (s *CLIService) CLIGitConfigure(org, product string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	ref := org + "." + product
	result, err := s.runner.Run(context.Background(), "git", "configure", ref, "--json")
	if err != nil {
		return "", fmt.Errorf("git configure: %w", err)
	}
	return string(result.Stdout), nil
}

// =============================================================================
// Environment management
// =============================================================================

// CLIEnvVariables runs `alis environment variables <org>.<product> --json`.
func (s *CLIService) CLIEnvVariables(org, product string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	ref := org + "." + product
	result, err := s.runner.Run(context.Background(), "environment", "variables", ref, "--json")
	if err != nil {
		return "", fmt.Errorf("environment variables: %w", err)
	}
	return string(result.Stdout), nil
}

// CLIEnvSet runs `alis environment set <org>.<product>.<env> KEY=VALUE --json`.
func (s *CLIService) CLIEnvSet(org, product, env, key, value string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	ref := org + "." + product + "." + env
	pair := key + "=" + value
	result, err := s.runner.Run(context.Background(), "environment", "set", ref, pair, "--json")
	if err != nil {
		return "", fmt.Errorf("environment set: %w", err)
	}
	return string(result.Stdout), nil
}

// CLIEnvUnset runs `alis environment unset <org>.<product>.<env> KEY --json`.
func (s *CLIService) CLIEnvUnset(org, product, env, key string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	ref := org + "." + product + "." + env
	result, err := s.runner.Run(context.Background(), "environment", "unset", ref, key, "--json")
	if err != nil {
		return "", fmt.Errorf("environment unset: %w", err)
	}
	return string(result.Stdout), nil
}

// CLIEnvRefresh runs `alis environment refresh <org>.<product>.<env> --json`.
func (s *CLIService) CLIEnvRefresh(org, product, env string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	ref := org + "." + product + "." + env
	result, err := s.runner.Run(context.Background(), "environment", "refresh", ref, "--json")
	if err != nil {
		return "", fmt.Errorf("environment refresh: %w", err)
	}
	return string(result.Stdout), nil
}

// CLIEnvBranches runs `alis environment branches [<org>.<product>.<env>] --json`.
func (s *CLIService) CLIEnvBranches(ref string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	args := []string{"environment", "branches", "--json"}
	if ref != "" {
		args = append(args, ref)
	}
	result, err := s.runner.Run(context.Background(), args...)
	if err != nil {
		return "", fmt.Errorf("environment branches: %w", err)
	}
	return string(result.Stdout), nil
}

// =============================================================================
// Packages (delegated to CLI)
// =============================================================================

// CLIPackagesInstall runs `alis packages install <pkg> --json`.
func (s *CLIService) CLIPackagesInstall(pkg string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	result, err := s.runner.Run(context.Background(), "packages", "install", pkg, "--json")
	if err != nil {
		return "", fmt.Errorf("packages install: %w", err)
	}
	return string(result.Stdout), nil
}

// CLIPackagesUpgrade runs `alis packages upgrade <pkg> --json [--all]`.
func (s *CLIService) CLIPackagesUpgrade(pkg string, all bool) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	args := []string{"packages", "upgrade", pkg, "--json"}
	if all {
		args = append(args, "--all")
	}
	result, err := s.runner.Run(context.Background(), args...)
	if err != nil {
		return "", fmt.Errorf("packages upgrade: %w", err)
	}
	return string(result.Stdout), nil
}

// =============================================================================
// Context
// =============================================================================

// CLIContextView runs `alis context view [<ref>] --json`.
func (s *CLIService) CLIContextView(ref string) (string, error) {
	if !s.available() {
		return "", fmt.Errorf("alis CLI not available")
	}
	args := []string{"context", "view", "--json"}
	if ref != "" {
		args = append(args, ref)
	}
	result, err := s.runner.Run(context.Background(), args...)
	if err != nil {
		return "", fmt.Errorf("context view: %w", err)
	}
	return string(result.Stdout), nil
}

// =============================================================================
// Utility: parse a CLI JSON result into a Go map for frontend consumption.
// =============================================================================

// CLIParseJSON parses the JSON output from any CLI method into a generic map.
func (s *CLIService) parseJSON(raw string) (map[string]any, error) {
	var v map[string]any
	if err := json.Unmarshal([]byte(raw), &v); err != nil {
		return nil, fmt.Errorf("parse CLI output: %w", err)
	}
	return v, nil
}

// init registers log output.
func init() {
	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	log.SetPrefix("[cli-svc] ")
}
