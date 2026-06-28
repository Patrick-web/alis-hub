//go:build windows

package main

import (
	"os/exec"
	"syscall"
)

// hideWindow prevents a console window from flashing when spawning
// subprocesses (git, credential helpers) from a GUI application.
func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}
