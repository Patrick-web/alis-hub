package updater

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/blang/semver"
	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	repo       = "Patrick-web/alis-hub-v3"
	apiLatest  = "https://api.github.com/repos/" + repo + "/releases/latest"
	releaseURL = "https://github.com/" + repo + "/releases/latest"
)

type UpdateInfo struct {
	Available      bool   `json:"available"`
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	ReleaseURL     string `json:"releaseUrl"`
	ReleaseNotes   string `json:"releaseNotes"`
}

// DownloadProgress is emitted on the "update:progress" event during a
// DownloadUpdate call.
type DownloadProgress struct {
	Downloaded int64  `json:"downloaded"`
	Total      int64  `json:"total"`
	Done       bool   `json:"done"`
	Error      string `json:"error,omitempty"`
	Path       string `json:"path,omitempty"`
}

type Service struct {
	version string

	mu     sync.Mutex
	app    *application.App
	staged string // filesystem path of the extracted .app once downloaded
}

func NewService(version string) *Service {
	if version == "" {
		version = "0.0.0"
	}
	return &Service{version: version}
}

// SetApp wires the Wails app so the service can emit runtime events.
func (s *Service) SetApp(app *application.App) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.app = app
}

func (s *Service) emit(event string, data any) {
	s.mu.Lock()
	app := s.app
	s.mu.Unlock()
	if app != nil {
		app.Event.Emit(event, data)
	}
}

func (s *Service) CurrentVersion() string { return s.version }

// githubRelease matches the subset of GitHub's releases-API JSON we consume.
type githubRelease struct {
	TagName    string        `json:"tag_name"`
	HTMLURL    string        `json:"html_url"`
	Body       string        `json:"body"`
	Draft      bool          `json:"draft"`
	Prerelease bool          `json:"prerelease"`
	Assets     []githubAsset `json:"assets"`
}

type githubAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

func fetchLatestRelease() (*githubRelease, error) {
	req, err := http.NewRequest("GET", apiLatest, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "AlisHub-updater")
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("github: %s", resp.Status)
	}
	var rel githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return nil, err
	}
	return &rel, nil
}

func (s *Service) CheckForUpdate() (UpdateInfo, error) {
	info := UpdateInfo{CurrentVersion: s.version}

	rel, err := fetchLatestRelease()
	if err != nil {
		return info, fmt.Errorf("update check failed: %w", err)
	}
	if rel.Draft || rel.Prerelease {
		return info, nil
	}

	latest, err := semver.Parse(trimV(rel.TagName))
	if err != nil {
		return info, fmt.Errorf("parse latest tag %q: %w", rel.TagName, err)
	}
	current, err := semver.Parse(trimV(s.version))
	if err != nil {
		info.Available = true
		info.LatestVersion = latest.String()
		info.ReleaseURL = rel.HTMLURL
		info.ReleaseNotes = rel.Body
		return info, nil
	}

	info.LatestVersion = latest.String()
	if latest.GT(current) {
		info.Available = true
		info.ReleaseURL = rel.HTMLURL
		info.ReleaseNotes = rel.Body
	}
	return info, nil
}

// pickAsset returns the release asset that matches the current platform.
// macOS: prefer the .zip (contains Alis Hub.app), not the .dmg.
func pickAsset(assets []githubAsset) (*githubAsset, error) {
	var wantOS, wantExt string
	switch runtime.GOOS {
	case "darwin":
		wantOS, wantExt = "macos", ".zip"
	case "linux":
		wantOS, wantExt = "linux", ".tar.gz"
	case "windows":
		wantOS, wantExt = "windows", ".zip"
	default:
		return nil, fmt.Errorf("no update asset for %s", runtime.GOOS)
	}
	for i := range assets {
		name := strings.ToLower(assets[i].Name)
		if strings.Contains(name, wantOS) && strings.HasSuffix(name, wantExt) {
			return &assets[i], nil
		}
	}
	return nil, fmt.Errorf("no asset matching %s%s in release", wantOS, wantExt)
}

// DownloadUpdate pulls the appropriate artifact for this platform, extracts
// it to a temp directory, and stashes the resulting .app path. Progress is
// reported over the "update:progress" event every ~100ms.
//
// Returns the path to the extracted .app (macOS) or the binary (Linux).
// Windows is not yet supported end-to-end — falls back to the release URL.
func (s *Service) DownloadUpdate() (string, error) {
	if runtime.GOOS == "windows" {
		return releaseURL, fmt.Errorf("auto-download not supported on Windows — opening release page")
	}

	rel, err := fetchLatestRelease()
	if err != nil {
		s.emit("update:progress", DownloadProgress{Done: true, Error: err.Error()})
		return "", err
	}
	asset, err := pickAsset(rel.Assets)
	if err != nil {
		s.emit("update:progress", DownloadProgress{Done: true, Error: err.Error()})
		return "", err
	}

	tmpDir, err := os.MkdirTemp("", "alishub-update-*")
	if err != nil {
		return "", fmt.Errorf("mkdir temp: %w", err)
	}

	archivePath := filepath.Join(tmpDir, asset.Name)
	if err := s.downloadFile(asset.BrowserDownloadURL, archivePath, asset.Size); err != nil {
		_ = os.RemoveAll(tmpDir)
		s.emit("update:progress", DownloadProgress{Done: true, Error: err.Error()})
		return "", err
	}

	extractDir := filepath.Join(tmpDir, "extracted")
	if err := os.MkdirAll(extractDir, 0o755); err != nil {
		return "", err
	}
	var newPath string
	switch runtime.GOOS {
	case "darwin":
		if err := unzip(archivePath, extractDir); err != nil {
			_ = os.RemoveAll(tmpDir)
			s.emit("update:progress", DownloadProgress{Done: true, Error: err.Error()})
			return "", fmt.Errorf("unzip: %w", err)
		}
		newPath, err = findAppBundle(extractDir)
		if err != nil {
			_ = os.RemoveAll(tmpDir)
			s.emit("update:progress", DownloadProgress{Done: true, Error: err.Error()})
			return "", err
		}
	case "linux":
		if err := untarGz(archivePath, extractDir); err != nil {
			_ = os.RemoveAll(tmpDir)
			s.emit("update:progress", DownloadProgress{Done: true, Error: err.Error()})
			return "", fmt.Errorf("untar: %w", err)
		}
		newPath = extractDir
	}

	s.mu.Lock()
	s.staged = newPath
	s.mu.Unlock()

	s.emit("update:progress", DownloadProgress{Downloaded: asset.Size, Total: asset.Size, Done: true, Path: newPath})
	return newPath, nil
}

// downloadFile fetches url → dst, emitting progress events throughout.
func (s *Service) downloadFile(url, dst string, expectedSize int64) error {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "AlisHub-updater")
	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("download: %s", resp.Status)
	}

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	total := expectedSize
	if total <= 0 {
		total = resp.ContentLength
	}

	var downloaded int64
	buf := make([]byte, 64*1024)
	lastEmit := time.Now()
	for {
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := out.Write(buf[:n]); werr != nil {
				return werr
			}
			downloaded += int64(n)
			if time.Since(lastEmit) > 100*time.Millisecond {
				s.emit("update:progress", DownloadProgress{Downloaded: downloaded, Total: total})
				lastEmit = time.Now()
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			return rerr
		}
	}
	return nil
}

// ApplyUpdate swaps the running bundle/binary with the staged one and
// relaunches. macOS only for now; other platforms return an error.
func (s *Service) ApplyUpdate() error {
	s.mu.Lock()
	staged := s.staged
	s.mu.Unlock()
	if staged == "" {
		return fmt.Errorf("no update downloaded")
	}

	switch runtime.GOOS {
	case "darwin":
		return s.applyDarwin(staged)
	default:
		return fmt.Errorf("auto-apply not supported on %s", runtime.GOOS)
	}
}

func (s *Service) applyDarwin(newAppPath string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	// exe is like /Applications/Alis Hub.app/Contents/MacOS/alis-hub-v3
	// oldApp  = /Applications/Alis Hub.app
	oldApp := filepath.Dir(filepath.Dir(filepath.Dir(exe)))
	if !strings.HasSuffix(oldApp, ".app") {
		return fmt.Errorf("not running from an .app bundle (%s)", exe)
	}

	pid := os.Getpid()
	scriptPath := filepath.Join(filepath.Dir(newAppPath), "alishub-relaunch.sh")

	script := fmt.Sprintf(`#!/bin/bash
# Wait for the running Alis Hub to exit.
PID=%d
OLD=%q
NEW=%q
for i in $(seq 1 100); do
  kill -0 "$PID" 2>/dev/null || break
  sleep 0.2
done
sleep 0.5
# Atomically swap the app bundle.
rm -rf "$OLD"
mv "$NEW" "$OLD" || cp -R "$NEW" "$OLD"
# Clear any quarantine just in case.
xattr -dr com.apple.quarantine "$OLD" 2>/dev/null || true
# Launch the new app.
open "$OLD"
`, pid, oldApp, newAppPath)

	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		return fmt.Errorf("write relaunch script: %w", err)
	}

	cmd := exec.Command("/bin/bash", scriptPath)
	detachCmd(cmd)
	cmd.Stdout = nil
	cmd.Stderr = nil
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start relauncher: %w", err)
	}

	go func() {
		time.Sleep(300 * time.Millisecond)
		s.mu.Lock()
		app := s.app
		s.mu.Unlock()
		if app != nil {
			app.Quit()
		} else {
			os.Exit(0)
		}
	}()
	return nil
}

// OpenReleasePage asks the OS to open the latest-release URL in the default
// browser. Used as a fallback when auto-download isn't supported.
func (s *Service) OpenReleasePage() error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", releaseURL).Start()
	case "linux":
		return exec.Command("xdg-open", releaseURL).Start()
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", releaseURL).Start()
	}
	return fmt.Errorf("unsupported platform")
}

func (s *Service) AppInfo() map[string]string {
	exe, _ := os.Executable()
	return map[string]string{
		"version":    s.version,
		"go":         runtime.Version(),
		"os":         runtime.GOOS,
		"arch":       runtime.GOARCH,
		"executable": exe,
	}
}

func trimV(v string) string {
	v = strings.TrimSpace(v)
	if strings.HasPrefix(v, "v") || strings.HasPrefix(v, "V") {
		return v[1:]
	}
	return v
}

// -------- archive helpers --------

func unzip(archive, dst string) error {
	r, err := zip.OpenReader(archive)
	if err != nil {
		return err
	}
	defer r.Close()
	for _, f := range r.File {
		path := filepath.Join(dst, f.Name)
		if !strings.HasPrefix(path, filepath.Clean(dst)+string(os.PathSeparator)) {
			return fmt.Errorf("illegal path in zip: %s", f.Name)
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(path, f.Mode()); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			rc.Close()
			return err
		}
		if _, err := io.Copy(out, rc); err != nil {
			rc.Close()
			out.Close()
			return err
		}
		rc.Close()
		out.Close()
	}
	return nil
}

// untarGz shells out to /usr/bin/tar, which preserves symlinks + perms correctly.
func untarGz(archive, dst string) error {
	cmd := exec.Command("tar", "-xzf", archive, "-C", dst)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("tar: %s: %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}

func findAppBundle(dir string) (string, error) {
	var found string
	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() && strings.HasSuffix(path, ".app") {
			found = path
			return filepath.SkipDir
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if found == "" {
		return "", fmt.Errorf("no .app bundle found in extracted archive")
	}
	return found, nil
}

// BackgroundCheck runs an update check after a delay. If a new version is found,
// emits an "update:available" Wails event so the frontend can show a toast.
func BackgroundCheck(app *application.App, version string, delay time.Duration) {
	go func() {
		time.Sleep(delay)
		svc := NewService(version)
		info, err := svc.CheckForUpdate()
		if err != nil {
			log.Printf("update check: %v", err)
			return
		}
		if info.Available {
			log.Printf("update available: %s → %s (%s)", info.CurrentVersion, info.LatestVersion, info.ReleaseURL)
			if app != nil {
				app.Event.Emit("update:available", info)
			}
		}
	}()
}
