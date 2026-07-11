package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// LogService exposes the on-disk application log to the frontend so it can be
// viewed and downloaded from Developer Settings, and lets developers open the
// web inspector on demand.
type LogService struct {
	app *application.App
}

func NewLogService() *LogService { return &LogService{} }

func (s *LogService) SetApp(app *application.App) { s.app = app }

// LogInfo describes the active log file.
type LogInfo struct {
	Path      string `json:"path"`
	Exists    bool   `json:"exists"`
	SizeBytes int64  `json:"sizeBytes"`
}

// GetLogInfo returns the location and size of the active log file.
func (s *LogService) GetLogInfo() (*LogInfo, error) {
	path := LogFilePath()
	info := &LogInfo{Path: path}
	if fi, err := os.Stat(path); err == nil {
		info.Exists = true
		info.SizeBytes = fi.Size()
	}
	return info, nil
}

// ReadLog returns the tail of the log file (the last maxBytes bytes, or the
// whole file if it is smaller). When maxBytes <= 0 a sane default is used.
// Only the tail is returned so the viewer stays responsive on large logs.
func (s *LogService) ReadLog(maxBytes int) (string, error) {
	if maxBytes <= 0 {
		maxBytes = 512 * 1024
	}
	f, err := os.Open(LogFilePath())
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	defer f.Close()

	fi, err := f.Stat()
	if err != nil {
		return "", err
	}
	size := fi.Size()

	var start int64
	if size > int64(maxBytes) {
		start = size - int64(maxBytes)
	}
	if _, err := f.Seek(start, io.SeekStart); err != nil {
		return "", err
	}
	data, err := io.ReadAll(f)
	if err != nil {
		return "", err
	}

	out := string(data)
	if start > 0 {
		// Drop the partial first line, then note that the head was truncated.
		if idx := strings.IndexByte(out, '\n'); idx >= 0 {
			out = out[idx+1:]
		}
		out = fmt.Sprintf("… truncated — showing last %d KB of %d KB …\n\n", maxBytes/1024, size/1024) + out
	}
	return out, nil
}

// DownloadLog opens a native Save dialog and copies the current log file to the
// chosen location. Returns the saved path, or "" if the user cancelled.
func (s *LogService) DownloadLog() (string, error) {
	if s.app == nil {
		return "", fmt.Errorf("application not ready")
	}
	data, err := os.ReadFile(LogFilePath())
	if err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("no log file has been created yet")
		}
		return "", err
	}

	dialog := s.app.Dialog.SaveFile()
	dialog.SetFilename(fmt.Sprintf("alishub-%s.log", time.Now().Format("2006-01-02-150405")))
	dialog.AddFilter("Log files", "*.log")
	dialog.AllowsOtherFileTypes(true)
	if cur := s.app.Window.Current(); cur != nil {
		dialog.AttachToWindow(cur)
	}

	dest, err := dialog.PromptForSingleSelection()
	if err != nil {
		return "", err
	}
	if dest == "" {
		return "", nil // cancelled
	}
	if err := os.WriteFile(dest, data, 0o644); err != nil {
		return "", fmt.Errorf("write %s: %w", dest, err)
	}
	return dest, nil
}

// RevealLog opens the folder containing the log file in the system file manager,
// selecting the file where the platform supports it.
func (s *LogService) RevealLog() error {
	path := LogFilePath()
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", "-R", path)
	case "windows":
		cmd = exec.Command("explorer", "/select,"+filepath.FromSlash(path))
	default:
		cmd = exec.Command("xdg-open", filepath.Dir(path))
	}
	hideWindow(cmd)
	return cmd.Start()
}

// OpenInspector opens the web inspector (developer tools) for the current
// window. Devtools are available in non-production builds.
func (s *LogService) OpenInspector() error {
	if s.app == nil {
		return fmt.Errorf("application not ready")
	}
	win := s.app.Window.Current()
	if win == nil {
		return fmt.Errorf("no active window")
	}
	win.OpenDevTools()
	return nil
}
