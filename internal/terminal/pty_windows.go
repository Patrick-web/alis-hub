//go:build windows

package terminal

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"

	"github.com/UserExistsError/conpty"
)

// conPTY wraps a Windows ConPTY process (Windows 10 1809+).
type conPTY struct {
	cpty *conpty.ConPty
}

func (p *conPTY) Read(b []byte) (int, error)  { return p.cpty.Read(b) }
func (p *conPTY) Write(b []byte) (int, error) { return p.cpty.Write(b) }
func (p *conPTY) Resize(rows, cols uint16) error {
	return p.cpty.Resize(int(cols), int(rows)) // ConPty wants (width, height)
}
func (p *conPTY) Close() error { return p.cpty.Close() }

// pipePTY drives a process via stdin/stdout pipes. Used as a fallback on
// Windows versions that don't support ConPTY (pre-1809). ANSI escape codes
// are suppressed by most tools when they detect no TTY. Resize is a no-op.
type pipePTY struct {
	stdin io.WriteCloser
	pr    *os.File
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
	if conpty.IsConPtyAvailable() {
		return startConPTY(cmd, rows, cols)
	}
	return startPipe(cmd, rows, cols)
}

func startConPTY(cmd *exec.Cmd, rows, cols uint16) (PTY, error) {
	// Build a quoted Windows command line from the exec.Cmd.
	args := append([]string{cmd.Path}, cmd.Args[1:]...)
	commandLine := buildCommandLine(args)

	env := cmd.Env
	if env == nil {
		env = os.Environ()
	}

	opts := []conpty.ConPtyOption{
		conpty.ConPtyDimensions(int(cols), int(rows)),
		conpty.ConPtyEnv(env),
	}
	if cmd.Dir != "" {
		opts = append(opts, conpty.ConPtyWorkDir(cmd.Dir))
	}

	cpty, err := conpty.Start(commandLine, opts...)
	if err != nil {
		return nil, fmt.Errorf("start conpty: %w", err)
	}
	return &conPTY{cpty: cpty}, nil
}

func startPipe(cmd *exec.Cmd, rows, cols uint16) (PTY, error) {
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}

	// Use an OS-level pipe so pr.Read returns EOF when the child exits.
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
	pw.Close()

	return &pipePTY{stdin: stdin, pr: pr, cmd: cmd}, nil
}

// buildCommandLine constructs a Windows command-line string from a slice of
// arguments, quoting any argument that contains spaces, tabs, or double quotes.
func buildCommandLine(args []string) string {
	quoted := make([]string, len(args))
	for i, arg := range args {
		if strings.ContainsAny(arg, ` \t"`) {
			arg = `"` + strings.ReplaceAll(arg, `"`, `\"`) + `"`
		}
		quoted[i] = arg
	}
	return strings.Join(quoted, " ")
}
