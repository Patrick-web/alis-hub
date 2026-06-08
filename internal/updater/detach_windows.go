//go:build windows

package updater

import "os/exec"

// detachCmd is a no-op on Windows. Auto-apply isn't wired for Windows yet —
// the updater falls back to opening the release page in the browser.
func detachCmd(cmd *exec.Cmd) {}
