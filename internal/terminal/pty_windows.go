//go:build windows

package terminal

import (
	"io"
	"os"
	"os/exec"
)

// pipePTY drives a process via stdin/stdout pipes. There is no real PTY so
// ANSI colour codes are suppressed by most tools automatically. Resize is a
// no-op; everything else behaves identically to the Unix path.
type pipePTY struct {
	stdin io.WriteCloser
	pr    *os.File // read end of the stdout+stderr pipe
	cmd   *exec.Cmd
}

func (p *pipePTY) Read(b []byte) (int, error)  { return p.pr.Read(b) }
func (p *pipePTY) Write(b []byte) (int, error) { return p.stdin.Write(b) }
func (p *pipePTY) Resize(_, _ uint16) error    { return nil }
func (p *pipePTY) Close() error {
	p.stdin.Close()
	if p.cmd.Process != nil {
		p.cmd.Process.Kill()
	}
	return p.pr.Close()
}

func start(cmd *exec.Cmd, rows, cols uint16) (PTY, error) {
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}

	// Use an OS-level pipe so that pr.Read returns EOF automatically when
	// the child process exits and the OS closes the child's write end.
	pr, pw, err := os.Pipe()
	if err != nil {
		stdin.Close()
		return nil, err
	}
	cmd.Stdout = pw
	cmd.Stderr = pw

	if err := cmd.Start(); err != nil {
		stdin.Close()
		pw.Close()
		pr.Close()
		return nil, err
	}

	// Close the parent's write end — only the child holds it now.
	// When the child exits its copy closes and pr.Read returns EOF.
	pw.Close()

	return &pipePTY{stdin: stdin, pr: pr, cmd: cmd}, nil
}
