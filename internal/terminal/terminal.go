package terminal

import "os/exec"

// PTY abstracts a pseudo-terminal (Unix) or pipe-based terminal (Windows).
// The interface is intentionally minimal: read output, write input, resize, close.
type PTY interface {
	Read(p []byte) (n int, err error)
	Write(p []byte) (n int, err error)
	Resize(rows, cols uint16) error
	Close() error
}

// Start launches cmd attached to a PTY and returns the PTY end.
// On Unix a real pseudo-terminal is used; on Windows stdout/stderr pipes
// are used instead (no ANSI, but fully functional).
func Start(cmd *exec.Cmd, rows, cols uint16) (PTY, error) {
	return start(cmd, rows, cols)
}
