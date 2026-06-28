package main

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

var forgejoHostRe = regexp.MustCompile(`^forgejo-\d+\.[a-z0-9-]+\.run\.app$`)

// SyncGitAuth discovers Forgejo repos under ~/alis.build/, writes
// ~/.alis/git-auth.gitconfig with a fresh Bearer token for each host,
// migrates existing repo configs away from the VS Code extension paths,
// and installs the credential helper symlink. Safe to call on every startup.
func SyncGitAuth() error {
	ts, err := NewConsoleTokenSource()
	if err != nil {
		return nil // not logged in yet
	}
	token, err := ts.AccessToken()
	if err != nil {
		return fmt.Errorf("get access token: %w", err)
	}

	// Always install and configure the credential helper, even on a fresh install
	// where no repos have been cloned yet. This ensures it's available as a
	// fallback the first time a private Forgejo repo is cloned.
	if err := installCredentialHelper(); err != nil {
		fmt.Fprintf(os.Stderr, "alis-hub: install credential helper: %v\n", err)
	}
	if err := configureGlobalCredentialHelper(); err != nil {
		fmt.Fprintf(os.Stderr, "alis-hub: configure credential helper: %v\n", err)
	}

	repos, err := discoverForgejoRepos()
	if err != nil {
		return fmt.Errorf("discover repos: %w", err)
	}
	if len(repos) == 0 {
		return nil
	}

	authConfigPath, err := writeGitAuthConfig(token, repos)
	if err != nil {
		return fmt.Errorf("write git-auth.gitconfig: %w", err)
	}

	for _, r := range repos {
		if err := migrateRepoConfig(r.configPath, authConfigPath); err != nil {
			// Non-fatal: log and continue.
			fmt.Fprintf(os.Stderr, "alis-hub: migrate %s: %v\n", r.configPath, err)
		}
	}

	return nil
}

type forgejoRepo struct {
	configPath string // absolute path to .git/config
	host       string // e.g. forgejo-231410899422.us-east4.run.app
}

func discoverForgejoRepos() ([]forgejoRepo, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	alisDir := filepath.Join(home, "alis.build")
	if _, err := os.Stat(alisDir); err != nil {
		return nil, nil
	}

	var repos []forgejoRepo

	// Find all .git/config files two levels deep: ~/alis.build/<org>/{define,build/<product>}
	entries, err := os.ReadDir(alisDir)
	if err != nil {
		return nil, err
	}
	for _, org := range entries {
		if !org.IsDir() {
			continue
		}
		orgDir := filepath.Join(alisDir, org.Name())

		// Check ~/alis.build/<org>/define/.git/config
		candidates := []string{filepath.Join(orgDir, "define")}

		// Check ~/alis.build/<org>/build/*/
		buildDir := filepath.Join(orgDir, "build")
		if builds, err := os.ReadDir(buildDir); err == nil {
			for _, b := range builds {
				if b.IsDir() {
					candidates = append(candidates, filepath.Join(buildDir, b.Name()))
				}
			}
		}

		for _, repoDir := range candidates {
			cfgPath := filepath.Join(repoDir, ".git", "config")
			host, err := parseForgejoHost(cfgPath)
			if err != nil || host == "" {
				continue
			}
			repos = append(repos, forgejoRepo{configPath: cfgPath, host: host})
		}
	}
	return repos, nil
}

func parseForgejoHost(configPath string) (string, error) {
	f, err := os.Open(configPath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "url") {
			continue
		}
		// url = https://forgejo-XXXX.region.run.app/org/repo.git
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		rawURL := strings.TrimSpace(parts[1])
		// Strip scheme
		withoutScheme := strings.TrimPrefix(rawURL, "https://")
		withoutScheme = strings.TrimPrefix(withoutScheme, "http://")
		host := strings.SplitN(withoutScheme, "/", 2)[0]
		if forgejoHostRe.MatchString(host) {
			return host, nil
		}
	}
	return "", scanner.Err()
}

func writeGitAuthConfig(token string, repos []forgejoRepo) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".alis")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}

	seen := map[string]bool{}
	var sb strings.Builder
	sb.WriteString("# Managed by alis-hub. Do not edit manually.\n")
	for _, r := range repos {
		if seen[r.host] {
			continue
		}
		seen[r.host] = true
		fmt.Fprintf(&sb, "[http \"https://%s/\"]\n\textraHeader = Authorization: Bearer %s\n", r.host, token)
	}

	authPath := filepath.Join(dir, "git-auth.gitconfig")
	if err := os.WriteFile(authPath, []byte(sb.String()), 0600); err != nil {
		return "", err
	}
	return authPath, nil
}

// migrateRepoConfig ensures the hub's authConfigPath is included in the repo's
// .git/config without disturbing any existing entries (including those managed
// by the VS Code extension).
func migrateRepoConfig(configPath, authConfigPath string) error {
	data, err := os.ReadFile(configPath)
	if err != nil {
		return err
	}

	// Git requires forward slashes in [include] path values on all platforms.
	gitConfigPath := filepath.ToSlash(authConfigPath)

	if strings.Contains(string(data), gitConfigPath) || strings.Contains(string(data), authConfigPath) {
		return nil
	}

	appended := string(data)
	if !strings.HasSuffix(appended, "\n") {
		appended += "\n"
	}
	appended += "[include]\n\tpath = " + gitConfigPath + "\n"
	return os.WriteFile(configPath, []byte(appended), 0600)
}

// installCredentialHelper installs git-credential-alis into ~/.alis/bin/.
// On Windows, os.Symlink requires elevated privileges, so we copy the exe instead.
func installCredentialHelper() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	// Resolve symlinks so we point to the real binary.
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return err
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	binDir := filepath.Join(home, ".alis", "bin")
	if err := os.MkdirAll(binDir, 0755); err != nil {
		return err
	}

	helperName := "git-credential-alis"
	if runtime.GOOS == "windows" {
		helperName += ".exe"
	}
	helperPath := filepath.Join(binDir, helperName)
	// Always recreate so path stays current after updates.
	_ = os.Remove(helperPath)
	if runtime.GOOS == "windows" {
		return copyExe(exe, helperPath)
	}
	return os.Symlink(exe, helperPath)
}

func copyExe(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

// RunAsCredentialHelper implements the git credential helper protocol.
// Called when os.Args[0] is "git-credential-alis".
// It refreshes the auth config as a side effect, then exits.
func RunAsCredentialHelper() {
	if len(os.Args) < 2 {
		os.Exit(1)
	}
	action := os.Args[1]

	switch action {
	case "get":
		credentialGet()
	default:
		// store / erase: no-op
		os.Exit(0)
	}
}

func credentialGet() {
	// Parse git's stdin (key=value pairs terminated by blank line).
	var host string
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			break
		}
		if strings.HasPrefix(line, "host=") {
			host = strings.TrimPrefix(line, "host=")
		}
	}

	if !forgejoHostRe.MatchString(host) {
		os.Exit(1)
	}

	ts, err := NewConsoleTokenSource()
	if err != nil {
		os.Exit(1)
	}
	token, err := ts.AccessToken()
	if err != nil {
		os.Exit(1)
	}

	// Refresh the on-disk gitconfig so the extraHeader stays current.
	// Errors here are non-fatal; the credential output below is the fallback.
	_ = SyncGitAuth()

	// Output credentials for git (Basic auth fallback).
	fmt.Printf("username=alis\npassword=%s\n", token)
}

// configureGlobalCredentialHelper adds the alis credential helper to ~/.gitconfig
// under a [credential] block scoped to forgejo hosts. Safe to call repeatedly.
func configureGlobalCredentialHelper() error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	helperName := "git-credential-alis"
	if runtime.GOOS == "windows" {
		helperName += ".exe"
	}
	helperPath := filepath.Join(home, ".alis", "bin", helperName)

	// git config --global credential.https://forgejo-*.run.app.helper <path>
	// Unfortunately git doesn't support wildcards in credential URLs, so we set
	// the global default helper instead, guarded by the helper's own host check.
	getCmd := exec.Command("git", "config", "--global", "--get", "credential.helper")
	hideWindow(getCmd)
	out, _ := getCmd.Output()
	if strings.TrimSpace(string(out)) == helperPath {
		return nil
	}
	setCmd := exec.Command("git", "config", "--global", "credential.helper", helperPath)
	hideWindow(setCmd)
	return setCmd.Run()
}
