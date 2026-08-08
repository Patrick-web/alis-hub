package main

import (
	"strings"
	"testing"
)

func TestSkillsInstallArgs(t *testing.T) {
	t.Run("minimal", func(t *testing.T) {
		got := strings.Join(skillsInstallArgs("deploy-service", "", false, false), " ")
		if got != "skills install deploy-service --json" {
			t.Errorf("got %q", got)
		}
	})

	t.Run("harness, project scope and force", func(t *testing.T) {
		got := skillsInstallArgs("deploy-service", "claude", true, true)
		if !hasFlagValue(got, "--harness", "claude") {
			t.Errorf("harness not passed: %v", got)
		}
		if countFlag(got, "--project") != 1 || countFlag(got, "--force") != 1 {
			t.Errorf("project/force not passed: %v", got)
		}
	})

	t.Run("force is never implicit", func(t *testing.T) {
		// Without --force the CLI refuses to overwrite a folder it did not
		// write, which is what protects a hand-authored skill of the same name.
		got := skillsInstallArgs("x", "", false, false)
		if strings.Contains(strings.Join(got, " "), "--force") {
			t.Errorf("--force added implicitly: %v", got)
		}
	})
}

// Validation guards should fire before a process is spawned, so callers get a
// usable message rather than a CLI usage error.
func TestSkillsValidation(t *testing.T) {
	svc := &CLIService{} // no runner attached

	cases := map[string]func() error{
		"search with no query": func() error { _, err := svc.SkillsSearch(""); return err },
		"load with no id":      func() error { _, err := svc.SkillsLoad("", ""); return err },
		"resource with no path": func() error {
			_, err := svc.SkillsResource("id", "")
			return err
		},
		"install with no id": func() error { _, err := svc.SkillsInstall("", "", false, false); return err },
		// Upgrading nothing would report success while doing nothing.
		"upgrade with neither ids nor all": func() error { _, err := svc.SkillsUpgrade(nil, false); return err },
		// Sharing with neither target is a no-op that looks like a grant.
		"share with no target": func() error { _, err := svc.SkillsShare("id", "", false, false); return err },
		"feedback with a bad rating": func() error {
			_, err := svc.SkillsFeedback("id", "msg", "sideways")
			return err
		},
		"request with no description": func() error { _, err := svc.SkillsRequest("name", "", "", ""); return err },
	}
	for name, call := range cases {
		if err := call(); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

func TestAutomationTierFrom(t *testing.T) {
	// An empty approvals object is the default tier, which gates destructive
	// commands only. Reporting "unknown" here would be misleading in the UI.
	if got := automationTierFrom(nil); got != "balanced" {
		t.Errorf("nil approvals = %q, want balanced", got)
	}
	if got := automationTierFrom(map[string]any{}); got != "balanced" {
		t.Errorf("empty approvals = %q, want balanced", got)
	}
	for _, key := range []string{"tier", "level", "mode"} {
		if got := automationTierFrom(map[string]any{key: "autonomous"}); got != "autonomous" {
			t.Errorf("approvals[%s] = %q, want autonomous", key, got)
		}
	}
	if got := automationTierFrom(map[string]any{"unrelated": 1}); got != "balanced" {
		t.Errorf("unrecognised approvals = %q, want balanced", got)
	}
}

func TestPlatformValidation(t *testing.T) {
	svc := &CLIService{}
	if _, err := svc.Ask("", ""); err == nil {
		t.Error("Ask with no question should fail")
	}
	if _, err := svc.SelectAccount(""); err == nil {
		t.Error("SelectAccount with no account should fail")
	}
	if _, err := svc.NewProduct("", "p", ""); err == nil {
		t.Error("NewProduct with no org should fail")
	}
	if _, err := svc.NewService(""); err == nil {
		t.Error("NewService with no package id should fail")
	}
}

// `alis skills installed --json` returns a bare array, unlike every other
// skills command. Decoding it as an object silently yields nothing.
func TestFixture_SkillsInstalled(t *testing.T) {
	var installed []InstalledSkill
	loadFixture(t, "skills_installed", &installed)

	if len(installed) == 0 {
		t.Fatal("no installs decoded — is the response still a bare array?")
	}
	for _, s := range installed {
		if s.SkillID == "" {
			t.Error("skillId not decoded")
		}
		if s.Path == "" {
			t.Errorf("skill %s: install path not decoded", s.SkillID)
		}
		// contentHash is how upgrade decides what actually changed.
		if s.ContentHash == "" {
			t.Errorf("skill %s: contentHash not decoded", s.SkillID)
		}
	}
}

// `alis skills list --json`
func TestFixture_SkillsList(t *testing.T) {
	var v struct {
		Skills []SkillDetail `json:"skills"`
	}
	loadFixture(t, "skills_list", &v)

	if len(v.Skills) == 0 {
		t.Fatal("no skills decoded")
	}
	for _, s := range v.Skills {
		if s.ID == "" {
			t.Error("skill id not decoded")
		}
		// Both counters are protobuf int64s and arrive as strings; typing them
		// as numbers fails the whole decode.
		if s.LoadCount == "" {
			t.Errorf("skill %s: loadCount not decoded as a string", s.ID)
		}
	}
}

// `alis skills load <id> --json`
func TestFixture_SkillsLoad(t *testing.T) {
	var v skillsLoadResponse
	loadFixture(t, "skills_load", &v)

	if v.Markdown == "" {
		t.Fatal("markdown not decoded")
	}
	// Skills are markdown documents with YAML front matter.
	if !strings.HasPrefix(strings.TrimSpace(v.Markdown), "---") {
		t.Errorf("expected front matter at the start of the skill: %.60q", v.Markdown)
	}
}
