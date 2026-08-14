package updater

import (
	"archive/zip"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	"alis-hub-v3/internal/appflavor"

	"github.com/blang/semver"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// workerBase is a var rather than a const so tests can point it at an httptest
// server. Not intended to change at runtime.
var workerBase = "https://alishub.justpatrick.workers.dev"

const (
	// The all-releases page rather than /latest: a beta build will not be the
	// latest stable release, so /latest would show the wrong notes.
	releasesURL = "https://github.com/Patrick-web/alis-hub/releases"

	// ChannelStable only ever resolves to full releases. ChannelBeta resolves to
	// whichever of the newest prerelease and the newest stable release ranks
	// higher by semver, so betas are superseded by the stable release they lead
	// up to. The Worker does the actual filtering; see website/worker.js.
	ChannelStable = appflavor.Stable
	ChannelBeta   = appflavor.Beta
)

type UpdateInfo struct {
	Available      bool   `json:"available"`
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	ReleaseURL     string `json:"releaseUrl"`
	ReleaseNotes   string `json:"releaseNotes"`
	Channel        string `json:"channel"`
	IsPrerelease   bool   `json:"isPrerelease"`
}

// DownloadProgress is emitted on the "update:progress" event during a
// DownloadUpdate call.
type DownloadProgress struct {
	Downloaded int64  `json:"downloaded"`
	Total      int64  `json:"total"`
	Done       bool   `json:"done"`
	Error      string `json:"error,omitempty"`
	Path       string `json:"path,omitempty"`
	Version    string `json:"version,omitempty"`
}

type Service struct {
	version string

	mu         sync.Mutex
	app        *application.App
	staged     string // filesystem path of the extracted .app once downloaded
	lastRelURL string // html_url of the most recently resolved release
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

// Channel returns the release channel this install follows. It is fixed by the
// build, not chosen by the user: stable and beta are separate applications, so
// an in-place switch would leave a beta binary sitting in the stable install's
// bundle. Moving between channels means running the other application.
func (s *Service) Channel() string {
	return appflavor.Channel(s.version)
}

// IsBeta reports whether this is the beta application, so the UI can label
// itself without having to parse the version string.
func (s *Service) IsBeta() bool {
	return appflavor.IsBeta(s.version)
}

func (s *Service) rememberReleaseURL(u string) {
	if u == "" {
		return
	}
	s.mu.Lock()
	s.lastRelURL = u
	s.mu.Unlock()
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

// workerRelease is the response shape from the Cloudflare Worker /api/release endpoint.
type workerRelease struct {
	Version    string            `json:"version"`
	URL        string            `json:"url"`
	Notes      string            `json:"notes"`
	Channel    string            `json:"channel"`
	Prerelease bool              `json:"prerelease"`
	Platforms  map[string]string `json:"platforms"` // "macos" | "linux" | "windows" → "/download/<platform>?channel=<channel>"
}

func fetchWorkerRelease(channel string) (*workerRelease, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(workerBase + "/api/release?channel=" + url.QueryEscape(channel))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("worker: %s", resp.Status)
	}
	var rel workerRelease
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return nil, err
	}
	if rel.Version == "" {
		return nil, fmt.Errorf("worker returned empty version")
	}
	return &rel, nil
}

func (s *Service) CheckForUpdate() (UpdateInfo, error) {
	channel := s.Channel()
	info := UpdateInfo{CurrentVersion: s.version, Channel: channel}

	rel, err := fetchWorkerRelease(channel)
	if err != nil {
		return info, fmt.Errorf("update check failed: %w", err)
	}
	info.IsPrerelease = rel.Prerelease
	s.rememberReleaseURL(rel.URL)

	// semver.Parse handles prerelease identifiers, and blang's ordering follows
	// the spec: 0.15.0 outranks 0.15.0-beta.3, so a beta user is carried onto
	// the stable release without any special casing here.
	latest, err := semver.Parse(trimV(rel.Version))
	if err != nil {
		return info, fmt.Errorf("parse latest version %q: %w", rel.Version, err)
	}
	current, err := semver.Parse(trimV(s.version))
	if err != nil {
		info.Available = true
		info.LatestVersion = latest.String()
		info.ReleaseURL = rel.URL
		info.ReleaseNotes = inlineImages(rel.Notes)
		return info, nil
	}

	info.LatestVersion = latest.String()
	if latest.GT(current) {
		info.Available = true
		info.ReleaseURL = rel.URL
		info.ReleaseNotes = inlineImages(rel.Notes)
	}
	return info, nil
}

// BetaRelease resolves the newest release on the beta channel so the stable
// app can offer it. Reports Available only when it is a genuine prerelease
// ahead of what this build is: with no beta published, the beta channel
// resolves to stable and there is nothing to advertise.
//
// Deliberately does not download anything. The beta is a separate application
// that installs alongside this one, so the user fetches and installs it the
// same way they would any other app.
func (s *Service) BetaRelease() (UpdateInfo, error) {
	info := UpdateInfo{CurrentVersion: s.version, Channel: ChannelBeta}

	rel, err := fetchWorkerRelease(ChannelBeta)
	if err != nil {
		return info, fmt.Errorf("beta release lookup failed: %w", err)
	}

	info.LatestVersion = trimV(rel.Version)
	info.ReleaseURL = rel.URL
	info.IsPrerelease = rel.Prerelease
	info.ReleaseNotes = inlineImages(rel.Notes)
	info.Available = rel.Prerelease && trimV(rel.Version) != trimV(s.version)
	return info, nil
}

// OpenBetaDownload sends the user to the beta release page in their browser.
func (s *Service) OpenBetaDownload() error {
	rel, err := fetchWorkerRelease(ChannelBeta)
	if err != nil || rel.URL == "" {
		return openInBrowser(releasesURL)
	}
	return openInBrowser(rel.URL)
}

// platformKey maps runtime.GOOS to the key used in the Worker's platforms map.
func platformKey() (string, error) {
	switch runtime.GOOS {
	case "darwin":
		return "macos", nil
	case "linux":
		return "linux", nil
	case "windows":
		return "windows", nil
	default:
		return "", fmt.Errorf("no update asset for %s", runtime.GOOS)
	}
}

// DownloadUpdate pulls the appropriate artifact for this platform via the
// Cloudflare Worker proxy, extracts it to a temp directory, and stashes
// the resulting path. Progress is reported over the "update:progress" event
// every ~100ms.
//
// Returns the path to the extracted .app (macOS), directory (Linux), or
// .exe (Windows).
func (s *Service) DownloadUpdate() (string, error) {
	return s.download(s.Channel())
}

func (s *Service) download(channel string) (string, error) {
	// Every exit from here has to emit a terminal update:progress. The frontend
	// latches a "downloading" flag when it starts and only clears it on a Done
	// or Error event, so a silent return wedges the UI until restart.
	fail := func(err error) (string, error) {
		s.emit("update:progress", DownloadProgress{Done: true, Error: err.Error()})
		return "", err
	}

	rel, err := fetchWorkerRelease(channel)
	if err != nil {
		return fail(err)
	}

	key, err := platformKey()
	if err != nil {
		return fail(err)
	}
	path, ok := rel.Platforms[key]
	if !ok {
		return fail(fmt.Errorf("no download available for %s", runtime.GOOS))
	}
	// The Worker already encodes ?channel= into these paths.
	downloadURL := workerBase + path

	tmpDir, err := os.MkdirTemp("", "alishub-update-*")
	if err != nil {
		return fail(fmt.Errorf("mkdir temp: %w", err))
	}

	// TODO(security): verify checksum of downloaded artifact before use.
	// The worker should return a SHA-256 hash alongside the download URL so the
	// client can verify integrity before extracting/running it.
	var newPath string
	if runtime.GOOS == "windows" {
		// The Windows release asset is a raw NSIS installer .exe (see
		// build/windows/nsis/project.nsi), not an archive — download it
		// directly and hand it to applyWindows, which runs the installer
		// (it self-elevates via its manifest) rather than swapping files.
		installerPath := filepath.Join(tmpDir, key+"-"+trimV(rel.Version)+"-installer.exe")
		if err := s.downloadFile(downloadURL, installerPath, 0); err != nil {
			_ = os.RemoveAll(tmpDir)
			return fail(err)
		}
		newPath = installerPath
	} else {
		archiveName := key + "-" + trimV(rel.Version) + map[string]string{"macos": ".zip", "linux": ".tar.gz"}[key]
		archivePath := filepath.Join(tmpDir, archiveName)
		if err := s.downloadFile(downloadURL, archivePath, 0); err != nil {
			_ = os.RemoveAll(tmpDir)
			return fail(err)
		}

		extractDir := filepath.Join(tmpDir, "extracted")
		if err := os.MkdirAll(extractDir, 0o755); err != nil {
			_ = os.RemoveAll(tmpDir)
			return fail(err)
		}
		switch runtime.GOOS {
		case "darwin":
			if err := unzip(archivePath, extractDir); err != nil {
				_ = os.RemoveAll(tmpDir)
				return fail(fmt.Errorf("unzip: %w", err))
			}
			newPath, err = findAppBundle(extractDir)
			if err != nil {
				_ = os.RemoveAll(tmpDir)
				return fail(err)
			}
		case "linux":
			if err := untarGz(archivePath, extractDir); err != nil {
				_ = os.RemoveAll(tmpDir)
				return fail(fmt.Errorf("untar: %w", err))
			}
			newPath = extractDir
		}
	}

	s.mu.Lock()
	s.staged = newPath
	s.mu.Unlock()

	s.emit("update:progress", DownloadProgress{
		Done:    true,
		Path:    newPath,
		Version: trimV(rel.Version),
	})
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
// relaunches. Supported on macOS and Windows; Linux returns an error.
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
	case "windows":
		return s.applyWindows(staged)
	default:
		return fmt.Errorf("auto-apply not supported on %s", runtime.GOOS)
	}
}

// relocatableAppError reports whether the running bundle can be replaced in
// place. It has to be checked before the swap is handed to the detached
// relaunch script, whose rm -rf and mv failures the user never sees: without
// this the app quits, the old bundle survives, and the relaunch silently brings
// back the version the user was already running.
//
// The two ways a bundle becomes un-swappable both trace back to running it
// somewhere other than Applications. A quarantined app launched from Downloads
// or a mounted disk image runs under App Translocation, which maps it to a
// randomized read-only path under /var/folders; and a bundle on a mounted image
// sits on a read-only volume.
func relocatableAppError(appPath string) error {
	if isTranslocated(appPath) {
		return fmt.Errorf("AlisHub is running from a temporary read-only location. Move it to Applications and try the update again")
	}
	if !dirWritable(filepath.Dir(appPath)) {
		return fmt.Errorf("AlisHub is installed somewhere it cannot be updated in place. Move it to Applications and try the update again")
	}
	return nil
}

func isTranslocated(path string) bool {
	return strings.Contains(path, "AppTranslocation")
}

// dirWritable probes the directory the bundle lives in by creating and removing
// a scratch file, which is exactly the permission the in-place swap needs.
func dirWritable(dir string) bool {
	f, err := os.CreateTemp(dir, ".alishub-write-test-*")
	if err != nil {
		return false
	}
	name := f.Name()
	_ = f.Close()
	_ = os.Remove(name)
	return true
}

func (s *Service) applyDarwin(newAppPath string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	// exe is like /Applications/AlisHub.app/Contents/MacOS/alis-hub-v3
	// oldApp  = /Applications/AlisHub.app
	oldApp := filepath.Dir(filepath.Dir(filepath.Dir(exe)))
	if !strings.HasSuffix(oldApp, ".app") {
		return fmt.Errorf("not running from an .app bundle (%s)", exe)
	}
	if err := relocatableAppError(oldApp); err != nil {
		return err
	}

	pid := os.Getpid()
	scriptPath := filepath.Join(filepath.Dir(newAppPath), "alishub-relaunch.sh")

	script := fmt.Sprintf(`#!/bin/bash
# Wait for the running AlisHub to exit.
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

func (s *Service) applyWindows(installerPath string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, _ = filepath.EvalSymlinks(exe)

	pid := os.Getpid()

	// Escape single quotes so the paths are safe inside PS single-quoted strings.
	escapedOld := strings.ReplaceAll(exe, "'", "''")
	escapedInstaller := strings.ReplaceAll(installerPath, "'", "''")

	scriptPath := filepath.Join(filepath.Dir(installerPath), "alishub-relaunch.ps1")
	// The NSIS installer requests admin execution level (see
	// build/windows/nsis/project.nsi), so Start-Process here triggers a UAC
	// prompt the same way running it manually would. It upgrades in place
	// at the existing install path, so $oldExe is still correct afterward.
	script := fmt.Sprintf(`
$pidToWait = %d
$oldExe = '%s'
$installer = '%s'
for ($i = 0; $i -lt 100; $i++) {
    if (-not (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 200
}
Start-Sleep -Milliseconds 500
Start-Process -FilePath $installer -ArgumentList '/S' -Wait
Start-Process $oldExe
`, pid, escapedOld, escapedInstaller)

	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		return fmt.Errorf("write relaunch script: %w", err)
	}

	cmd := exec.Command("powershell.exe", "-WindowStyle", "Hidden", "-NonInteractive", "-File", scriptPath)
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

// OpenReleasePage asks the OS to open the release page in the default browser.
// Used as a fallback when auto-download isn't supported. Prefers the release
// resolved by the last check, since on the beta channel that is a prerelease
// and would not be reachable from /releases/latest.
func (s *Service) OpenReleasePage() error {
	s.mu.Lock()
	target := s.lastRelURL
	s.mu.Unlock()
	if target == "" {
		target = releasesURL
	}
	return openInBrowser(target)
}

func openInBrowser(target string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", target).Start()
	case "linux":
		return exec.Command("xdg-open", target).Start()
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", target).Start()
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

// inlineImages replaces markdown image URLs with base64 data URIs so the
// Wails WebView can render them without loading external resources.
var mdImageRe = regexp.MustCompile(`!\[([^\]]*)\]\((https?://[^)]+)\)`)

func inlineImages(notes string) string {
	client := &http.Client{Timeout: 10 * time.Second}
	return mdImageRe.ReplaceAllStringFunc(notes, func(match string) string {
		parts := mdImageRe.FindStringSubmatch(match)
		if len(parts) < 3 {
			return match
		}
		alt, imgURL := parts[1], parts[2]
		resp, err := client.Get(imgURL)
		if err != nil || resp.StatusCode != 200 {
			return match
		}
		defer resp.Body.Close()
		data, err := io.ReadAll(resp.Body)
		if err != nil {
			return match
		}
		ct := resp.Header.Get("Content-Type")
		if ct == "" {
			ct = "image/png"
		}
		encoded := base64.StdEncoding.EncodeToString(data)
		return fmt.Sprintf("![%s](data:%s;base64,%s)", alt, ct, encoded)
	})
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
//
// Takes the configured service rather than building its own: a fresh Service
// would have no settings store and would silently check the stable channel for
// every user, including those opted into beta.
func BackgroundCheck(app *application.App, svc *Service, delay time.Duration) {
	go func() {
		time.Sleep(delay)
		info, err := svc.CheckForUpdate()
		if err != nil {
			log.Printf("update check: %v", err)
			return
		}
		if info.Available {
			log.Printf("update available on %s: %s → %s (%s)", info.Channel, info.CurrentVersion, info.LatestVersion, info.ReleaseURL)
			if app != nil {
				app.Event.Emit("update:available", info)
			}
		}
	}()
}
