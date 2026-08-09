package main

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

// Git authentication is owned by the alis CLI.
//
// The app used to run a second, parallel credential lifecycle beside the CLI's:
// it symlinked its own binary over ~/.alis/bin/git-credential-alis, pointed the
// *global* credential.helper at that symlink (so every git credential request on
// the machine, for any host, was answered by this app), and baked a static
// Console access token into ~/.alis/git-auth.gitconfig which each alis repo then
// [include]d as an http.extraHeader.
//
// The CLI configures the same repos its own way — `credential.helper = !alis git
// credential`, a helper that mints a Forgejo-scoped token on demand — so which
// mechanism a given repo used came down to whichever tool touched it last. The
// two also carry different tokens: the CLI's is Forgejo-scoped (email/exp/sub/uid),
// the app's was the full Console identity token.
//
// Now the app never issues git credentials itself. It borrows the CLI's helper
// for its own git commands (see gitCredentialArgs) and undoes the old scheme
// where it finds it (see CleanupLegacyGitAuth).

var forgejoHostRe = regexp.MustCompile(`^forgejo-\d+\.[a-z0-9-]+\.run\.app$`)

// alisCredentialHelper returns the value for credential.helper that delegates to
// the CLI, matching what `alis authorise` writes into a repo config.
//
// The absolute path is preferred over a bare "alis": git runs a "!"-prefixed
// helper through the shell, which does not inherit the PATH widening fixPathEnv
// applies to this process, so a GUI launch would otherwise fail to find the CLI.
func alisCredentialHelper() string {
	return "!" + shellQuote(alisBinaryPath()) + " git credential"
}

// alisBinaryPath resolves the alis CLI, falling back to its default install
// location so a PATH that has not been widened yet still produces a usable
// helper rather than a silently broken one.
func alisBinaryPath() string {
	if p, err := exec.LookPath("alis"); err == nil {
		if abs, err := filepath.Abs(p); err == nil {
			return abs
		}
		return p
	}
	if home, err := os.UserHomeDir(); err == nil {
		name := "alis"
		if runtime.GOOS == "windows" {
			name += ".exe"
		}
		return filepath.Join(home, ".alis", "bin", name)
	}
	return "alis"
}

// shellQuote wraps s for the shell git uses to run "!" helpers. Home directories
// with spaces are the common case this protects against.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// gitCredentialArgs are the -c flags that put a git command on the CLI's
// credential helper, regardless of what the repo config happens to say.
//
// All three matter. The empty helper first resets any helper inherited from
// global or repo config (git appends rather than replaces, so without the reset
// a stale helper would still be consulted first).
//
// useHttpPath tells git to send the URL path, which is how `alis git credential`
// identifies the Forgejo repository it is minting a token for. Git omits the
// path by default, and the helper then falls back to resolving the repository
// from context; that fallback was observed working from a normal repo and from
// a worktree under os.TempDir(), but it fails outright ("invalid Forgejo
// repository path") when invoked somewhere with no repository context at all.
// Sending the path removes the dependency on that fallback, and matches what
// `alis authorise` writes into repo config.
func gitCredentialArgs() []string {
	return []string{
		"-c", "credential.helper=",
		"-c", "credential.helper=" + alisCredentialHelper(),
		"-c", "credential.useHttpPath=true",
	}
}

// legacyGitAuthConfigPath is the file the old scheme wrote its Bearer token into.
func legacyGitAuthConfigPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".alis", "git-auth.gitconfig"), nil
}

// legacyHelperPath is where the old scheme symlinked (or, on Windows, copied)
// this binary so git would invoke it as a credential helper.
func legacyHelperPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	name := "git-credential-alis"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	return filepath.Join(home, ".alis", "bin", name), nil
}

// CleanupLegacyGitAuth removes every trace of the app-owned credential scheme:
// the helper binary, the global credential.helper pointing at it, the token file,
// and the [include] each repo carried for that file. Safe to call on every
// startup and a no-op once there is nothing left to clean.
//
// This runs unconditionally rather than behind a "migrated" flag: the old scheme
// reinstalled itself on every launch, so a user who downgrades and relaunches
// gets it back, and an [include] can also be reintroduced by other tooling.
func CleanupLegacyGitAuth() error {
	var errs []string

	if err := removeLegacyHelper(); err != nil {
		errs = append(errs, fmt.Sprintf("helper binary: %v", err))
	}
	if err := unsetLegacyGlobalHelper(); err != nil {
		errs = append(errs, fmt.Sprintf("global credential.helper: %v", err))
	}
	if err := stripLegacyIncludes(); err != nil {
		errs = append(errs, fmt.Sprintf("repo includes: %v", err))
	}
	if err := removeLegacyAuthConfig(); err != nil {
		errs = append(errs, fmt.Sprintf("git-auth.gitconfig: %v", err))
	}

	if len(errs) > 0 {
		return fmt.Errorf("cleanup legacy git auth: %s", strings.Join(errs, "; "))
	}
	return nil
}

func removeLegacyHelper() error {
	path, err := legacyHelperPath()
	if err != nil {
		return err
	}
	// Only remove what this app installed. A future CLI could legitimately ship
	// its own binary under this name, and deleting that would break git for the
	// user rather than fixing anything.
	target, err := os.Readlink(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		// Not a symlink (Windows installs a copy). Fall back to identifying it
		// by name, which on Windows is all we have.
		if runtime.GOOS != "windows" {
			return nil
		}
		return removeIfExists(path)
	}
	if !strings.Contains(filepath.Base(target), "alis-hub") {
		log.Printf("[gitcred] leaving %s alone: points at %s, not this app", path, target)
		return nil
	}
	return removeIfExists(path)
}

func removeIfExists(path string) error {
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	log.Printf("[gitcred] removed legacy credential helper %s", path)
	return nil
}

// unsetLegacyGlobalHelper clears the global credential.helper only when it still
// points at the app's helper. A helper the user set themselves (or one the CLI
// installs) is left untouched.
func unsetLegacyGlobalHelper() error {
	helperPath, err := legacyHelperPath()
	if err != nil {
		return err
	}
	getCmd := exec.Command("git", "config", "--global", "--get-all", "credential.helper")
	hideWindow(getCmd)
	out, _ := getCmd.Output()
	if !strings.Contains(string(out), helperPath) {
		return nil
	}
	unsetCmd := exec.Command("git", "config", "--global", "--unset-all", "credential.helper", regexp.QuoteMeta(helperPath))
	hideWindow(unsetCmd)
	if err := unsetCmd.Run(); err != nil {
		return err
	}
	log.Printf("[gitcred] unset global credential.helper (was %s)", helperPath)
	return nil
}

func removeLegacyAuthConfig() error {
	path, err := legacyGitAuthConfigPath()
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	log.Printf("[gitcred] removed %s", path)
	return nil
}

// staleIncludeRe matches an [include] block pointing at a managed git-auth
// config, whether written by this app (~/.alis/git-auth.gitconfig) or by the old
// VS Code "alis-build" extension, which wrote its own under the extension's
// globalStorage directory.
//
// Both are worth stripping for the same reason: git sends http.extraHeader from
// every matching [include], so a leftover block keeps attaching a token nothing
// refreshes any more. Once its embedded token is signed by a key the identity
// server has rotated out, the server can reject the whole request over the dead
// header even when the CLI helper supplied a perfectly good credential.
var staleIncludeRe = regexp.MustCompile(`(?m)^\[include\]\n\s*path\s*=.*(?:alisexchange\.alis-build|git-auth\.gitconfig).*\n?`)

// stripLegacyIncludes removes those blocks from every alis repo on disk.
func stripLegacyIncludes() error {
	repos, err := discoverForgejoRepos()
	if err != nil {
		return err
	}
	var errs []string
	for _, r := range repos {
		if err := StripLegacyIncludeFromConfig(r.configPath); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", r.configPath, err))
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("%s", strings.Join(errs, "; "))
	}
	return nil
}

// StripLegacyIncludeFromConfig rewrites one .git/config without its managed
// git-auth [include]. It is also called when the file changes on disk, since an
// external tool can reintroduce the block at any time.
func StripLegacyIncludeFromConfig(configPath string) error {
	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	cleaned := staleIncludeRe.ReplaceAllString(string(data), "")
	if cleaned == string(data) {
		return nil
	}
	if err := os.WriteFile(configPath, []byte(cleaned), 0600); err != nil {
		return err
	}
	log.Printf("[gitcred] stripped stale git-auth include from %s", configPath)
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
