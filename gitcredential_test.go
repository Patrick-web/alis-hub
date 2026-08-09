package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// The CLI's helper identifies the Forgejo repository from the URL path, which
// git only sends when useHttpPath is set; without it the helper depends on
// resolving the repository from context instead. The reset must also come
// before the helper, since git appends helpers rather than replacing them.
func TestGitCredentialArgsShape(t *testing.T) {
	args := gitCredentialArgs()
	joined := strings.Join(args, " ")

	resetAt, helperAt := -1, -1
	for i, a := range args {
		if a == "credential.helper=" {
			resetAt = i
		}
		if strings.HasPrefix(a, "credential.helper=!") {
			helperAt = i
		}
	}
	if resetAt < 0 {
		t.Fatalf("no credential.helper reset in %q", joined)
	}
	if helperAt < 0 {
		t.Fatalf("no alis credential helper in %q", joined)
	}
	if resetAt > helperAt {
		t.Errorf("reset must precede the helper, got reset=%d helper=%d in %q", resetAt, helperAt, joined)
	}
	if !strings.Contains(joined, "credential.useHttpPath=true") {
		t.Errorf("useHttpPath=true missing from %q; the CLI helper cannot resolve the repo without it", joined)
	}
	if !strings.Contains(args[helperAt], "git credential") {
		t.Errorf("helper should invoke `git credential`, got %q", args[helperAt])
	}
}

func TestShellQuote(t *testing.T) {
	cases := map[string]string{
		"/usr/local/bin/alis":       `'/usr/local/bin/alis'`,
		"/Users/a b/.alis/bin/alis": `'/Users/a b/.alis/bin/alis'`,
		"/Users/o'brien/bin/alis":   `'/Users/o'\''brien/bin/alis'`,
	}
	for in, want := range cases {
		if got := shellQuote(in); got != want {
			t.Errorf("shellQuote(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestStripLegacyIncludeFromConfig(t *testing.T) {
	const base = "[core]\n\trepositoryformatversion = 0\n[remote \"origin\"]\n\turl = https://forgejo-123.us-east4.run.app/org/proto.git\n"

	cases := []struct {
		name    string
		config  string
		wantOut string
	}{
		{
			name:    "app managed include",
			config:  base + "[include]\n\tpath = /Users/jp/.alis/git-auth.gitconfig\n",
			wantOut: base,
		},
		{
			name:    "vs code extension include",
			config:  base + "[include]\n\tpath = /Users/jp/Library/App/alisexchange.alis-build/git-auth.config\n",
			wantOut: base,
		},
		{
			name:    "both includes",
			config:  base + "[include]\n\tpath = /Users/jp/.alis/git-auth.gitconfig\n[include]\n\tpath = /x/alisexchange.alis-build/g.config\n",
			wantOut: base,
		},
		{
			name:    "unrelated include is preserved",
			config:  base + "[include]\n\tpath = /Users/jp/.gitconfig-work\n",
			wantOut: base + "[include]\n\tpath = /Users/jp/.gitconfig-work\n",
		},
		{
			name:    "cli credential config is preserved",
			config:  base + "[credential]\n\thelper = \n\thelper = !alis git credential\n\tuseHttpPath = true\n",
			wantOut: base + "[credential]\n\thelper = \n\thelper = !alis git credential\n\tuseHttpPath = true\n",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "config")
			if err := os.WriteFile(path, []byte(tc.config), 0600); err != nil {
				t.Fatal(err)
			}
			if err := StripLegacyIncludeFromConfig(path); err != nil {
				t.Fatal(err)
			}
			got, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			if string(got) != tc.wantOut {
				t.Errorf("got:\n%q\nwant:\n%q", got, tc.wantOut)
			}

			// Idempotent: the watcher calls this on every .git/config write.
			if err := StripLegacyIncludeFromConfig(path); err != nil {
				t.Fatal(err)
			}
			again, _ := os.ReadFile(path)
			if string(again) != tc.wantOut {
				t.Errorf("second pass changed the file: %q", again)
			}
		})
	}
}

func TestStripLegacyIncludeMissingFileIsNoError(t *testing.T) {
	if err := StripLegacyIncludeFromConfig(filepath.Join(t.TempDir(), "absent")); err != nil {
		t.Errorf("missing config should be a no-op, got %v", err)
	}
}

func TestCleanupLegacyGitAuth(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink-based helper install is not the Windows path")
	}
	home := t.TempDir()
	t.Setenv("HOME", home)

	// The old scheme's three artifacts: the token file, the helper symlink
	// pointing at this app's binary, and a repo [include] for the token file.
	alisDir := filepath.Join(home, ".alis")
	binDir := filepath.Join(alisDir, "bin")
	if err := os.MkdirAll(binDir, 0755); err != nil {
		t.Fatal(err)
	}
	authCfg := filepath.Join(alisDir, "git-auth.gitconfig")
	if err := os.WriteFile(authCfg, []byte("[http \"https://x/\"]\n\textraHeader = Authorization: Bearer dead\n"), 0600); err != nil {
		t.Fatal(err)
	}
	appBinary := filepath.Join(home, "alis-hub-v3")
	if err := os.WriteFile(appBinary, []byte("binary"), 0755); err != nil {
		t.Fatal(err)
	}
	helper := filepath.Join(binDir, "git-credential-alis")
	if err := os.Symlink(appBinary, helper); err != nil {
		t.Fatal(err)
	}

	repoGit := filepath.Join(home, "alis.build", "acme", "define", ".git")
	if err := os.MkdirAll(repoGit, 0755); err != nil {
		t.Fatal(err)
	}
	repoCfg := filepath.Join(repoGit, "config")
	cfg := "[remote \"origin\"]\n\turl = https://forgejo-99.us-east4.run.app/acme/proto.git\n[include]\n\tpath = " + authCfg + "\n"
	if err := os.WriteFile(repoCfg, []byte(cfg), 0600); err != nil {
		t.Fatal(err)
	}

	if err := CleanupLegacyGitAuth(); err != nil {
		t.Fatalf("cleanup: %v", err)
	}

	if _, err := os.Lstat(helper); !os.IsNotExist(err) {
		t.Errorf("helper symlink survived cleanup (err=%v)", err)
	}
	if _, err := os.Stat(authCfg); !os.IsNotExist(err) {
		t.Errorf("git-auth.gitconfig survived cleanup (err=%v)", err)
	}
	out, err := os.ReadFile(repoCfg)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(out), "git-auth.gitconfig") {
		t.Errorf("repo config still includes the token file:\n%s", out)
	}
	if !strings.Contains(string(out), "forgejo-99") {
		t.Errorf("cleanup damaged the repo config:\n%s", out)
	}

	// Second run has nothing left to do and must still succeed.
	if err := CleanupLegacyGitAuth(); err != nil {
		t.Errorf("second cleanup: %v", err)
	}
}

// A helper this app did not install (a future CLI shipping its own binary under
// the same name) must survive cleanup: deleting it would break git rather than
// fix anything.
func TestCleanupLeavesForeignHelperAlone(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink-based helper install is not the Windows path")
	}
	home := t.TempDir()
	t.Setenv("HOME", home)

	binDir := filepath.Join(home, ".alis", "bin")
	if err := os.MkdirAll(binDir, 0755); err != nil {
		t.Fatal(err)
	}
	foreign := filepath.Join(home, "alis")
	if err := os.WriteFile(foreign, []byte("cli"), 0755); err != nil {
		t.Fatal(err)
	}
	helper := filepath.Join(binDir, "git-credential-alis")
	if err := os.Symlink(foreign, helper); err != nil {
		t.Fatal(err)
	}

	if err := CleanupLegacyGitAuth(); err != nil {
		t.Fatalf("cleanup: %v", err)
	}
	if _, err := os.Lstat(helper); err != nil {
		t.Errorf("cleanup removed a helper it did not install: %v", err)
	}
}
