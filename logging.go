package main

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"sync"
)

const (
	logFileName     = "alishub.log"
	logMaxSizeBytes = 10 * 1024 * 1024 // rotate once the active file passes 10 MiB
	logMaxBackups   = 5                // keep alishub.log.1 … alishub.log.5
)

// logFilePathOnce caches the resolved log file path for LogFilePath().
var (
	logFilePathOnce sync.Once
	logFilePathVal  string
)

// logDir returns the OS-conventional directory for application logs.
//
//	macOS:   ~/Library/Logs/AlisHub
//	Windows: %LocalAppData%\AlisHub\Logs
//	Linux:   $XDG_STATE_HOME/alishub/logs  (falls back to ~/.local/state/alishub/logs)
//
// If the home directory cannot be determined it falls back to the app's own
// ~/.alis/logs directory so logging still works.
func logDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(home, "Library", "Logs", "AlisHub")
	case "windows":
		base := os.Getenv("LocalAppData")
		if base == "" {
			base = filepath.Join(home, "AppData", "Local")
		}
		return filepath.Join(base, "AlisHub", "Logs")
	default:
		base := os.Getenv("XDG_STATE_HOME")
		if base == "" {
			base = filepath.Join(home, ".local", "state")
		}
		return filepath.Join(base, "alishub", "logs")
	}
}

// LogFilePath returns the absolute path of the active log file.
func LogFilePath() string {
	logFilePathOnce.Do(func() {
		logFilePathVal = filepath.Join(logDir(), logFileName)
	})
	return logFilePathVal
}

// SetupLogging redirects the standard library logger to a size-rotated log
// file while still echoing to stderr. Because every service in this app logs
// through the package-level log.Printf/log.Println functions, this single call
// captures all of them (build, deploy, git, auth, hubdb, …) into the file.
//
// It is safe to call from any entry point (the main app and the
// git-credential-alis helper process both call it); each process appends to
// the same file.
func SetupLogging() {
	dir := logDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		// Fall back to stderr-only logging; never crash on logging setup.
		log.SetFlags(log.LstdFlags)
		log.Printf("[log] could not create log dir %s: %v (logging to stderr only)", dir, err)
		return
	}

	rw := &rotatingWriter{
		path:       filepath.Join(dir, logFileName),
		maxSize:    logMaxSizeBytes,
		maxBackups: logMaxBackups,
	}
	if err := rw.open(); err != nil {
		log.SetFlags(log.LstdFlags)
		log.Printf("[log] could not open log file %s: %v (logging to stderr only)", rw.path, err)
		return
	}

	log.SetOutput(io.MultiWriter(os.Stderr, rw))
	log.SetFlags(log.LstdFlags) // date + time prefix on every line
	log.Printf("[log] logging to %s (pid=%d)", rw.path, os.Getpid())
}

// rotatingWriter is a minimal size-based rotating file writer with no external
// dependencies. When the active file would exceed maxSize it is renamed to
// <name>.1 (shifting older backups up to maxBackups) and a fresh file opened.
type rotatingWriter struct {
	path       string
	maxSize    int64
	maxBackups int

	mu   sync.Mutex
	f    *os.File
	size int64
}

func (w *rotatingWriter) open() error {
	f, err := os.OpenFile(w.path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return err
	}
	info, err := f.Stat()
	if err != nil {
		f.Close()
		return err
	}
	w.f = f
	w.size = info.Size()
	return nil
}

func (w *rotatingWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.f == nil {
		return len(p), nil
	}
	if w.size+int64(len(p)) > w.maxSize {
		w.rotate()
	}
	n, err := w.f.Write(p)
	w.size += int64(n)
	return n, err
}

// rotate closes the active file, shifts backups (.1→.2, …), renames the active
// file to .1, and opens a fresh file. Any error leaves the previous file in
// place so we never lose the ability to keep writing.
func (w *rotatingWriter) rotate() {
	if w.f != nil {
		w.f.Close()
		w.f = nil
	}

	oldest := fmt.Sprintf("%s.%d", w.path, w.maxBackups)
	_ = os.Remove(oldest)
	for i := w.maxBackups - 1; i >= 1; i-- {
		_ = os.Rename(fmt.Sprintf("%s.%d", w.path, i), fmt.Sprintf("%s.%d", w.path, i+1))
	}
	_ = os.Rename(w.path, w.path+".1")

	if err := w.open(); err != nil {
		// Best effort: reattach to the (still-named) file if possible.
		if f, e := os.OpenFile(w.path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644); e == nil {
			w.f = f
			w.size = 0
		}
	}
}
