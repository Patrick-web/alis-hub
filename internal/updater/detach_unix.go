//go:build !windows

package updater

import (
	"os/exec"
	"syscall"
)

// detachCmd arranges for cmd to outlive the parent process on Unix-like
// systems by starting it in a new session.
func detachCmd(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
}
