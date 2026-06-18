package main

import (
	"os"
	"os/exec"
	"runtime"
)

// platformShell returns the binary and arguments for an interactive shell
// on the current OS. Commands are sent to the shell via stdin after startup.
//
// On Windows we prefer PowerShell (reads commands from stdin with -Command -)
// and fall back to cmd.exe. On Unix we use $SHELL or /bin/bash with -l so
// the user's PATH and tool installations are available.
func platformShell() (bin string, args []string) {
	if runtime.GOOS == "windows" {
		if ps, err := exec.LookPath("powershell.exe"); err == nil {
			return ps, []string{"-NoLogo", "-Command", "-"}
		}
		return "cmd.exe", []string{"/Q", "/K"}
	}
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/bash"
	}
	return shell, []string{"-l"}
}

// platformShellExitSuffix returns a shell fragment to append to a one-shot
// command so the shell exits with the command's exit code once it finishes.
func platformShellExitSuffix() string {
	if runtime.GOOS == "windows" {
		return "; exit $LASTEXITCODE"
	}
	return "; exit $?"
}
