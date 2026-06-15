//go:build windows

package updater

import (
	"os/exec"
	"syscall"
)

const detachedProcess = 0x00000008

// detachCmd arranges for cmd to outlive the parent on Windows by setting
// DETACHED_PROCESS and hiding the console window.
func detachCmd(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: detachedProcess,
	}
}
