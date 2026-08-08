package main

import (
	"strings"
	"testing"
)

func TestEnvSetArgs(t *testing.T) {
	t.Run("multiple variables in one call", func(t *testing.T) {
		got := envSetArgs("voyage.zz.dev", []EnvVariable{
			{Label: "A", Value: "1"},
			{Label: "B", Value: "2"},
		}, false, false)
		want := "environment set voyage.zz.dev A=1 B=2 --json"
		if strings.Join(got, " ") != want {
			t.Errorf("got %q, want %q", strings.Join(got, " "), want)
		}
	})

	t.Run("a value containing = stays one argument", func(t *testing.T) {
		// The CLI documents that a value may contain '='. Splitting it, or
		// passing name and value separately, would silently truncate it.
		got := envSetArgs("ref", []EnvVariable{
			{Label: "DSN", Value: "postgres://u:p@h/db?opt=1&x=2"},
		}, false, false)
		var found bool
		for _, a := range got {
			if a == "DSN=postgres://u:p@h/db?opt=1&x=2" {
				found = true
			}
		}
		if !found {
			t.Errorf("value with '=' was not passed intact: %v", got)
		}
	})

	t.Run("deploy and production confirmation", func(t *testing.T) {
		got := envSetArgs("ref", []EnvVariable{{Label: "A", Value: "1"}}, true, true)
		if countFlag(got, "--deploy") != 1 {
			t.Errorf("--deploy missing: %v", got)
		}
		if countFlag(got, "--confirm-production") != 1 {
			t.Errorf("--confirm-production missing: %v", got)
		}
	})

	t.Run("no implicit production confirmation", func(t *testing.T) {
		got := envSetArgs("ref", []EnvVariable{{Label: "A", Value: "1"}}, false, false)
		if strings.Contains(strings.Join(got, " "), "--confirm-production") {
			t.Errorf("--confirm-production added implicitly: %v", got)
		}
	})

	t.Run("an empty value is still a set, not a removal", func(t *testing.T) {
		got := envSetArgs("ref", []EnvVariable{{Label: "A", Value: ""}}, false, false)
		var found bool
		for _, a := range got {
			if a == "A=" {
				found = true
			}
		}
		if !found {
			t.Errorf("empty value not passed as A=: %v", got)
		}
	})
}

func TestEnvUnsetArgs(t *testing.T) {
	got := envUnsetArgs("voyage.zz.dev", []string{"A", "B"}, true, false)
	want := "environment unset voyage.zz.dev A B --json --deploy"
	if strings.Join(got, " ") != want {
		t.Errorf("got %q, want %q", strings.Join(got, " "), want)
	}
}

func TestEnvBranchesArgs(t *testing.T) {
	t.Run("allow is repeatable", func(t *testing.T) {
		got := envBranchesArgs("ref", []string{"master", "release"}, false)
		if countFlag(got, "--allow") != 2 {
			t.Errorf("expected two --allow flags: %v", got)
		}
		if !hasFlagValue(got, "--allow", "master") || !hasFlagValue(got, "--allow", "release") {
			t.Errorf("branches not passed: %v", got)
		}
	})

	t.Run("clear", func(t *testing.T) {
		got := envBranchesArgs("ref", nil, true)
		if countFlag(got, "--clear") != 1 {
			t.Errorf("--clear missing: %v", got)
		}
	})
}

func TestSetEnvironmentBranchesValidation(t *testing.T) {
	svc := &ProductService{}

	// Neither a branch list nor clear: this would be a read, not a write, and
	// silently doing nothing would look like success.
	if _, err := svc.SetEnvironmentBranchesCLI("o", "p", "e", nil, false); err == nil {
		t.Error("expected an error when neither allow nor clear is given")
	}
	// Both together is contradictory.
	if _, err := svc.SetEnvironmentBranchesCLI("o", "p", "e", []string{"main"}, true); err == nil {
		t.Error("expected an error when clear and allow are combined")
	}
}

func TestEnvNewArgs(t *testing.T) {
	got := envNewArgs("voyage", "zz", "Staging", false)
	if !hasFlagValue(got, "--display-name", "Staging") {
		t.Errorf("display name not passed: %v", got)
	}
	// Production must be explicit — a display name of "Production" means nothing.
	if strings.Contains(strings.Join(got, " "), "--production") {
		t.Errorf("--production inferred: %v", got)
	}

	got = envNewArgs("voyage", "zz", "Production", true)
	if countFlag(got, "--production") != 1 {
		t.Errorf("--production missing when requested: %v", got)
	}
}

func TestEnvironmentBranchesUnrestricted(t *testing.T) {
	// The CLI reports "no designation" as null, which decodes to a nil slice.
	if !(EnvironmentBranches{}).Unrestricted() {
		t.Error("a nil branch list should mean unrestricted")
	}
	if !(EnvironmentBranches{AllowedBranches: []string{}}).Unrestricted() {
		t.Error("an empty branch list should mean unrestricted")
	}
	if (EnvironmentBranches{AllowedBranches: []string{"master"}}).Unrestricted() {
		t.Error("a populated branch list should mean restricted")
	}
}

func TestParseEnvFile(t *testing.T) {
	got := parseEnvFile(`
# a comment
FOO=bar
DSN="postgres://u:p@h/db?a=1&b=2"

EMPTY=
NOT_A_PAIR
`)
	want := map[string]string{
		"FOO":   "bar",
		"DSN":   "postgres://u:p@h/db?a=1&b=2",
		"EMPTY": "",
	}
	if len(got) != len(want) {
		t.Fatalf("parsed %d vars, want %d: %+v", len(got), len(want), got)
	}
	for _, v := range got {
		w, ok := want[v.Label]
		if !ok {
			t.Errorf("unexpected variable %q", v.Label)
			continue
		}
		if v.Value != w {
			t.Errorf("%s = %q, want %q", v.Label, v.Value, w)
		}
	}
}

// `alis environment variables voyage.zz --json`
func TestFixture_EnvVariables(t *testing.T) {
	var v envVariablesResponse
	loadFixture(t, "env_variables", &v)

	if len(v.Environments) == 0 {
		t.Fatal("no environments decoded")
	}
	for _, e := range v.Environments {
		if e.EnvironmentID == "" {
			t.Error("environmentId not decoded")
		}
		// canUpdate gates the edit UI; losing it would silently let writes
		// through to a server-side permission error.
		if !e.CanUpdate {
			t.Logf("environment %s is read-only for this caller", e.EnvironmentID)
		}
	}
}

// `alis environment branches <ref> --json`
func TestFixture_EnvBranches(t *testing.T) {
	var v EnvironmentBranches
	loadFixture(t, "env_branches", &v)

	if v.Environment == "" {
		t.Fatal("environment id not decoded")
	}
	// The fixture has no designation, which the CLI reports as null.
	if !v.Unrestricted() {
		t.Errorf("expected an unrestricted environment, got %v", v.AllowedBranches)
	}
	if v.Updated {
		t.Error("a read should not report updated=true")
	}
}

// TestFixture_ApprovalRequiredEnvelope pins the exit-3 envelope captured from a
// real `alis environment unset` on the default automation tier.
func TestFixture_ApprovalRequiredEnvelope(t *testing.T) {
	var env struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
			Retry   string `json:"retry"`
			Agent   string `json:"agent"`
		} `json:"error"`
	}
	loadFixture(t, "error_approval_required", &env)

	if env.Error.Code != "APPROVAL_REQUIRED" {
		t.Errorf("code = %q, want APPROVAL_REQUIRED", env.Error.Code)
	}
	// The retry command is what the UI must show the user; without it a gated
	// operation is a dead end.
	if env.Error.Retry == "" {
		t.Fatal("retry command not decoded")
	}
	if !strings.Contains(env.Error.Retry, "--approve") {
		t.Errorf("retry command should carry --approve: %q", env.Error.Retry)
	}
	// The app must never synthesise this itself — it only ever echoes the CLI's
	// retry string back to the user.
	if env.Error.Agent == "" {
		t.Error("agent instruction not decoded")
	}
}
