package main

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// fixPathEnv widens this process's PATH for GUI launches. Apps started from
// Finder/Dock (or a Linux desktop launcher) inherit the init process's minimal
// PATH — typically /usr/bin:/bin:/usr/sbin:/sbin — not the user's shell PATH.
// Tools installed under /usr/local/bin, /opt/homebrew/bin, or ~/.docker/bin
// (docker, notably) then fail with `exec: "docker": executable file not found
// in $PATH` even though they run fine from a terminal. Merging the login-shell
// PATH plus a few well-known locations fixes every bare exec.Command lookup in
// the app at once.
func fixPathEnv() {
	if runtime.GOOS == "windows" {
		return
	}

	sep := string(os.PathListSeparator)
	var entries []string
	seen := make(map[string]bool)
	add := func(dir string) {
		if dir != "" && !seen[dir] {
			seen[dir] = true
			entries = append(entries, dir)
		}
	}
	for _, dir := range strings.Split(os.Getenv("PATH"), sep) {
		add(dir)
	}

	// The login shell's PATH reflects whatever the user actually has
	// (Homebrew shellenv, version managers, custom prefixes, …). Bounded by a
	// short timeout so slow dotfiles can't stall app startup.
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/bash"
	}
	if out, err := exec.CommandContext(ctx, shell, "-l", "-c", `printf %s "$PATH"`).Output(); err == nil {
		for _, dir := range strings.Split(strings.TrimSpace(string(out)), sep) {
			add(dir)
		}
	}

	// Well-known fallbacks in case the shell query failed or the user's
	// dotfiles don't export them.
	home, _ := os.UserHomeDir()
	for _, dir := range []string{
		"/usr/local/bin",
		"/opt/homebrew/bin",
		filepath.Join(home, ".docker", "bin"),
		filepath.Join(home, ".local", "bin"),
		filepath.Join(home, "bin"),
	} {
		add(dir)
	}

	os.Setenv("PATH", strings.Join(entries, sep))
}
