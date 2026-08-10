package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"
)

// Skills: curated, platform-maintained instruction documents, one per task.
//
// The agent workflow is search → load → resource. `alis skills list` is for
// human browsing and returns the whole catalog with richer metadata; search
// ranks semantically and is what an agent should use.
//
// Skills can also be installed into a local agent harness (Claude Code), which
// is what makes this worth surfacing in a desktop app: the user can browse the
// registry and install into their own harness without leaving it.
//
// On a backend that predates the skills surface every command here exits 1 with
// an error envelope whose code is `backend_outdated`; callers should treat that
// as "not available yet" rather than a failure to retry.

const skillsTimeout = 60 * time.Second

// SkillDetail is a catalog entry from `alis skills list`, which carries more
// than search results do.
type SkillDetail struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	Description string `json:"description"`
	State       string `json:"state"`
	Source      string `json:"source"`
	SourceURI   string `json:"sourceUri"`
	Version     string `json:"version"`
	CreateTime  string `json:"createTime"`
	UpdateTime  string `json:"updateTime"`
	ContentHash string `json:"contentHash"`
	// LoadCount and InstallCount are protobuf int64s and arrive as strings.
	LoadCount    string `json:"loadCount"`
	InstallCount string `json:"installCount"`
}

// InstalledSkill is one local install, from `alis skills installed`.
type InstalledSkill struct {
	SkillID string `json:"skillId"`
	Harness string `json:"harness"`
	Path    string `json:"path"`
	// Project distinguishes a repo-scoped install from a user-scope one. Path
	// alone cannot: a project install is only recognisable by knowing which
	// directories are repos, and the UI needs the distinction to say where a
	// skill actually lives and what removing it would take with it.
	Project bool   `json:"project"`
	Version string `json:"version"`
	// ContentHash is how `skills upgrade` decides what actually changed.
	ContentHash string `json:"contentHash"`
	InstallTime string `json:"installTime"`
}

func (s *CLIService) runSkills(label string, args ...string) ([]byte, error) {
	return s.runSkillsIn("", label, args...)
}

// runSkillsIn is runSkills with an explicit working directory, for `skills
// install --project`: the CLI resolves "the project" as the git repo containing
// the cwd, and has no flag that substitutes for it. An empty dir inherits the
// app's own cwd, which is "/" under a Finder launch — fine for every other
// skills command, since none of the rest read the cwd.
func (s *CLIService) runSkillsIn(dir, label string, args ...string) ([]byte, error) {
	if !s.available() {
		return nil, fmt.Errorf("alis CLI not available")
	}
	ctx, cancel := context.WithTimeout(context.Background(), skillsTimeout)
	defer cancel()

	result, err := s.runner.RunIn(ctx, dir, args...)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", label, err)
	}
	return result.Stdout, nil
}

// SkillsSearch ranks the catalog semantically for a natural-language query.
func (s *CLIService) SkillsSearch(query string) ([]SkillSummary, error) {
	if query == "" {
		return nil, fmt.Errorf("query is required")
	}
	stdout, err := s.runSkills("skills search", "skills", "search", query, "--json")
	if err != nil {
		return nil, err
	}
	var v skillsSearchResponse
	if err := json.Unmarshal(stdout, &v); err != nil {
		return nil, fmt.Errorf("parse skills search: %w", err)
	}
	return v.QueriedSkills, nil
}

// SkillsList returns the whole catalog, for browsing rather than searching.
func (s *CLIService) SkillsList() ([]SkillDetail, error) {
	stdout, err := s.runSkills("skills list", "skills", "list", "--json")
	if err != nil {
		return nil, err
	}
	var v struct {
		Skills []SkillDetail `json:"skills"`
	}
	if err := json.Unmarshal(stdout, &v); err != nil {
		return nil, fmt.Errorf("parse skills list: %w", err)
	}
	return v.Skills, nil
}

// SkillsLoad returns a skill's markdown instructions.
//
// session attributes the load to a coding session; empty lets the CLI fall back
// to $CLAUDE_SESSION_ID and then $ALIS_SESSION_ID.
func (s *CLIService) SkillsLoad(id, session string) (string, error) {
	if id == "" {
		return "", fmt.Errorf("skill id is required")
	}
	args := []string{"skills", "load", id, "--json"}
	if session != "" {
		args = append(args, "--session", session)
	}
	stdout, err := s.runSkills("skills load", args...)
	if err != nil {
		return "", err
	}
	var v skillsLoadResponse
	if err := json.Unmarshal(stdout, &v); err != nil {
		return "", fmt.Errorf("parse skills load: %w", err)
	}
	return v.Markdown, nil
}

// SkillsResource fetches a file a skill's instructions reference. The path must
// be written exactly as it appears in those instructions.
func (s *CLIService) SkillsResource(id, path string) (string, error) {
	if id == "" || path == "" {
		return "", fmt.Errorf("skill id and resource path are required")
	}
	stdout, err := s.runSkills("skills resource", "skills", "resource", id, path, "--json")
	if err != nil {
		return "", err
	}
	var v skillsResourceResponse
	if err := json.Unmarshal(stdout, &v); err != nil {
		return "", fmt.Errorf("parse skills resource: %w", err)
	}
	return v.Content, nil
}

// SkillsInstalled lists skills installed into local agent harnesses.
//
// This response is a bare JSON array, not an object with a wrapper key — unlike
// every other skills command.
func (s *CLIService) SkillsInstalled() ([]InstalledSkill, error) {
	stdout, err := s.runSkills("skills installed", "skills", "installed", "--json")
	if err != nil {
		return nil, err
	}
	var installed []InstalledSkill
	if err := json.Unmarshal(stdout, &installed); err != nil {
		return nil, fmt.Errorf("parse skills installed: %w", err)
	}
	return installed, nil
}

// skillsInstallArgs builds `alis skills install <id> --json [...]`.
func skillsInstallArgs(id, harness string, project, force bool) []string {
	args := []string{"skills", "install", id, "--json"}
	if harness != "" {
		args = append(args, "--harness", harness)
	}
	if project {
		args = append(args, "--project")
	}
	if force {
		args = append(args, "--force")
	}
	return args
}

// SkillsInstall installs a registry skill into a local agent harness.
//
// project installs into dir/.claude/skills/<id> instead of the user scope, and
// dir is how the caller says which project — the CLI takes the folder straight
// from the working directory and has no flag for it. It does not require a git
// repo: whatever the cwd is becomes the project root, so an unset dir under a
// Finder launch would install into /.claude/skills. Hence the hard error rather
// than a default.
//
// force takes over a target folder that exists but was not written by alis —
// which is why it is opt-in: without it the CLI reports `unmanaged_target`
// rather than overwriting someone's hand-written skill.
func (s *CLIService) SkillsInstall(id, harness string, project, force bool, dir string) (string, error) {
	if id == "" {
		return "", fmt.Errorf("skill id is required")
	}
	if project {
		if dir == "" {
			return "", fmt.Errorf("a project install needs a target directory")
		}
		info, err := os.Stat(dir)
		if err != nil {
			return "", fmt.Errorf("target directory %s: %w", dir, err)
		}
		if !info.IsDir() {
			return "", fmt.Errorf("target %s is not a directory", dir)
		}
	} else {
		// A user-scope install writes to the harness config dir wherever it is
		// run from, so carrying a dir here would only imply a target it does
		// not have.
		dir = ""
	}
	stdout, err := s.runSkillsIn(dir, "skills install", skillsInstallArgs(id, harness, project, force)...)
	return string(stdout), err
}

// SkillsUninstall removes a locally installed skill.
//
// There is no working directory here, and that is not an oversight: unlike
// install, uninstall ignores the cwd. Verified by installing one skill into two
// separate repos and running this with project set from inside the first — both
// copies were deleted. project therefore selects a scope *kind*, not a place:
// set, it removes every project install and spares the user-scope one; unset, it
// removes every install of the id anywhere. Callers must not present it as
// removing one location.
func (s *CLIService) SkillsUninstall(id, harness string, project bool) (string, error) {
	if id == "" {
		return "", fmt.Errorf("skill id is required")
	}
	args := []string{"skills", "uninstall", id, "--json"}
	if harness != "" {
		args = append(args, "--harness", harness)
	}
	if project {
		args = append(args, "--project")
	}
	stdout, err := s.runSkills("skills uninstall", args...)
	return string(stdout), err
}

// SkillsUpgrade upgrades tracked installs. With no ids, all is required —
// upgrading nothing silently would look like success.
func (s *CLIService) SkillsUpgrade(ids []string, all bool) (string, error) {
	if len(ids) == 0 && !all {
		return "", fmt.Errorf("pass skill ids or set all")
	}
	args := []string{"skills", "upgrade"}
	args = append(args, ids...)
	args = append(args, "--json")
	if all {
		args = append(args, "--all")
	}
	stdout, err := s.runSkills("skills upgrade", args...)
	return string(stdout), err
}

// ── Authoring ─────────────────────────────────────────────────────────────────

// SkillsCreate scaffolds a new skill workspace under ~/.alis/skills/workspaces.
// Skill ids are global, so this fails with `skill_exists` if taken.
func (s *CLIService) SkillsCreate(id, name, description string) (string, error) {
	if id == "" {
		return "", fmt.Errorf("skill id is required")
	}
	args := []string{"skills", "create", id, "--json"}
	if name != "" {
		args = append(args, "--name", name)
	}
	if description != "" {
		args = append(args, "--description", description)
	}
	stdout, err := s.runSkills("skills create", args...)
	return string(stdout), err
}

// SkillsEdit downloads one of your published skills into a workspace.
// refresh discards local edits and re-downloads. Only skills you authored are
// editable; others fail with `not_editable`.
func (s *CLIService) SkillsEdit(id string, refresh bool) (string, error) {
	if id == "" {
		return "", fmt.Errorf("skill id is required")
	}
	args := []string{"skills", "edit", id, "--json"}
	if refresh {
		args = append(args, "--refresh")
	}
	stdout, err := s.runSkills("skills edit", args...)
	return string(stdout), err
}

// SkillsPublish validates and publishes a workspace.
//
// If the registry changed since the workspace was downloaded the CLI exits 3
// with `remote_changed`; force overwrites. clean removes the workspace after a
// successful publish.
func (s *CLIService) SkillsPublish(id, name string, force, clean bool) (string, error) {
	if id == "" {
		return "", fmt.Errorf("skill id is required")
	}
	args := []string{"skills", "publish", id, "--json"}
	if name != "" {
		args = append(args, "--name", name)
	}
	if force {
		args = append(args, "--force")
	}
	if clean {
		args = append(args, "--clean")
	}
	stdout, err := s.runSkills("skills publish", args...)
	return string(stdout), err
}

// SkillsDelete soft-deletes a skill you administer; republishing restores it.
// Deletion is destructive, so expect an exit-3 approval gate.
func (s *CLIService) SkillsDelete(id string) (string, error) {
	if id == "" {
		return "", fmt.Errorf("skill id is required")
	}
	stdout, err := s.runSkills("skills delete", "skills", "delete", id, "--json")
	return string(stdout), err
}

// SkillsShare grants or revokes access to one of your skills. email shares with
// a colleague on your own domain; domain shares with everyone on it; remove
// revokes the given access instead of granting it.
func (s *CLIService) SkillsShare(id, email string, domain, remove bool) (string, error) {
	if id == "" {
		return "", fmt.Errorf("skill id is required")
	}
	if email == "" && !domain {
		return "", fmt.Errorf("pass an email address or set domain")
	}
	args := []string{"skills", "share", id, "--json"}
	if email != "" {
		args = append(args, "--email", email)
	}
	if domain {
		args = append(args, "--domain")
	}
	if remove {
		args = append(args, "--remove")
	}
	stdout, err := s.runSkills("skills share", args...)
	return string(stdout), err
}

// SkillsFeedback sends feedback to a skill's owner. rating is "up" or "down".
func (s *CLIService) SkillsFeedback(id, message, rating string) (string, error) {
	if id == "" {
		return "", fmt.Errorf("skill id is required")
	}
	if rating != "" && rating != "up" && rating != "down" {
		return "", fmt.Errorf("rating must be \"up\" or \"down\"")
	}
	args := []string{"skills", "feedback", id}
	if message != "" {
		args = append(args, message)
	}
	args = append(args, "--json")
	if rating != "" {
		args = append(args, "--rating", rating)
	}
	stdout, err := s.runSkills("skills feedback", args...)
	return string(stdout), err
}

// SkillsRequest asks the Alis Build team for a skill that does not exist yet.
func (s *CLIService) SkillsRequest(name, description, useCase, notes string) (string, error) {
	if name == "" || description == "" {
		return "", fmt.Errorf("name and description are required")
	}
	args := []string{"skills", "request", "--json", "--name", name, "--description", description}
	if useCase != "" {
		args = append(args, "--use-case", useCase)
	}
	if notes != "" {
		args = append(args, "--notes", notes)
	}
	stdout, err := s.runSkills("skills request", args...)
	return string(stdout), err
}
