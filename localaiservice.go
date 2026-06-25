package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// LocalAIService integrates with a locally-managed Ollama instance for
// on-device LLM inference (commit message generation, smart suggestions).
// The app downloads the Ollama binary and manages its lifecycle — no
// external installation is required from the user.
type LocalAIService struct {
	mu        sync.Mutex
	app       *application.App
	ollamaCmd *exec.Cmd // the running Ollama subprocess; nil when not started
	ollamaURL string    // base URL; defaults to http://localhost:11434
}

func NewLocalAIService() *LocalAIService {
	return &LocalAIService{ollamaURL: "http://localhost:11434"}
}

func (s *LocalAIService) SetApp(app *application.App) {
	s.mu.Lock()
	s.app = app
	s.mu.Unlock()
}

// ServiceShutdown is called automatically by Wails when the app exits.
func (s *LocalAIService) ServiceShutdown() error {
	s.StopOllama()
	return nil
}

func (s *LocalAIService) emit(event string, data any) {
	s.mu.Lock()
	app := s.app
	s.mu.Unlock()
	if app != nil {
		app.Event.Emit(event, data)
	}
}

// OllamaStatus describes the current state of the managed Ollama runtime.
type OllamaStatus struct {
	BinaryReady bool `json:"binaryReady"` // binary exists on disk
	Running     bool `json:"running"`     // HTTP API is responding
}

// ollamaBinaryPath returns the path where we store the Ollama binary, creating the directory if needed.
func (s *LocalAIService) ollamaBinaryPath() (string, error) {
	cfgDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	binDir := filepath.Join(cfgDir, "alis-hub", "bin")
	if err := os.MkdirAll(binDir, 0755); err != nil {
		return "", err
	}
	name := "ollama"
	if runtime.GOOS == "windows" {
		name = "ollama.exe"
	}
	return filepath.Join(binDir, name), nil
}

// GetOllamaStatus returns whether the binary is on disk and whether the API is responding.
func (s *LocalAIService) GetOllamaStatus() OllamaStatus {
	path, err := s.ollamaBinaryPath()
	if err != nil {
		return OllamaStatus{}
	}
	_, statErr := os.Stat(path)
	binaryReady := statErr == nil

	running := s.CheckOllama()
	return OllamaStatus{BinaryReady: binaryReady, Running: running}
}

// CheckOllama returns true if an Ollama instance is reachable at the default address.
func (s *LocalAIService) CheckOllama() bool {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(s.ollamaURL + "/api/version")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}

// fetchLatestOllamaVersion returns the latest Ollama release tag from GitHub, with a fallback.
func fetchLatestOllamaVersion() string {
	const fallback = "v0.9.2"
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get("https://api.github.com/repos/ollama/ollama/releases/latest")
	if err != nil {
		return fallback
	}
	defer resp.Body.Close()
	var release struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil || release.TagName == "" {
		return fallback
	}
	return release.TagName
}

// ollamaDownloadURL returns the GitHub release URL for the current platform.
func ollamaDownloadURL(version string) string {
	base := fmt.Sprintf("https://github.com/ollama/ollama/releases/download/%s", version)
	switch runtime.GOOS {
	case "darwin":
		return base + "/ollama-darwin"
	case "linux":
		if runtime.GOARCH == "arm64" {
			return base + "/ollama-linux-arm64"
		}
		return base + "/ollama-linux-amd64"
	case "windows":
		return base + "/ollama-windows-amd64.zip"
	}
	return base + "/ollama-linux-amd64"
}

// DownloadOllamaBinary downloads the Ollama binary for the current platform.
// It runs asynchronously and emits progress events:
//
//	localai:ollama-download-progress { pct int, label string }
//	localai:ollama-download-done
//	localai:ollama-download-error { error string }
func (s *LocalAIService) DownloadOllamaBinary() {
	go func() {
		destPath, err := s.ollamaBinaryPath()
		if err != nil {
			s.emit("localai:ollama-download-error", map[string]string{"error": err.Error()})
			return
		}

		version := fetchLatestOllamaVersion()
		url := ollamaDownloadURL(version)

		s.emit("localai:ollama-download-progress", map[string]any{"pct": 0, "label": "Fetching Ollama " + version + "…"})

		resp, err := http.Get(url)
		if err != nil {
			s.emit("localai:ollama-download-error", map[string]string{"error": err.Error()})
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			s.emit("localai:ollama-download-error", map[string]string{"error": fmt.Sprintf("download failed: HTTP %d", resp.StatusCode)})
			return
		}

		total := resp.ContentLength
		var buf bytes.Buffer
		buf.Grow(int(total))

		const chunkSize = 256 * 1024 // 256 KB
		chunk := make([]byte, chunkSize)
		var downloaded int64
		lastEmit := int64(-1)

		for {
			n, readErr := resp.Body.Read(chunk)
			if n > 0 {
				buf.Write(chunk[:n])
				downloaded += int64(n)
				if total > 0 {
					pct := int(downloaded * 100 / total)
					if pct != int(lastEmit) {
						s.emit("localai:ollama-download-progress", map[string]any{
							"pct":   pct,
							"label": fmt.Sprintf("Downloading Ollama… %d%%", pct),
						})
						lastEmit = int64(pct)
					}
				}
			}
			if readErr == io.EOF {
				break
			}
			if readErr != nil {
				s.emit("localai:ollama-download-error", map[string]string{"error": readErr.Error()})
				return
			}
		}

		// For Windows, extract the binary from the zip archive.
		if runtime.GOOS == "windows" {
			extracted, err := extractOllamaFromZip(buf.Bytes())
			if err != nil {
				s.emit("localai:ollama-download-error", map[string]string{"error": "zip extract: " + err.Error()})
				return
			}
			if err := os.WriteFile(destPath, extracted, 0755); err != nil {
				s.emit("localai:ollama-download-error", map[string]string{"error": err.Error()})
				return
			}
		} else {
			if err := os.WriteFile(destPath, buf.Bytes(), 0755); err != nil {
				s.emit("localai:ollama-download-error", map[string]string{"error": err.Error()})
				return
			}
		}

		s.emit("localai:ollama-download-done", nil)
	}()
}

// extractOllamaFromZip finds and returns the ollama executable bytes from a zip archive.
func extractOllamaFromZip(data []byte) ([]byte, error) {
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, err
	}
	for _, f := range r.File {
		if strings.EqualFold(filepath.Base(f.Name), "ollama.exe") {
			rc, err := f.Open()
			if err != nil {
				return nil, err
			}
			defer rc.Close()
			return io.ReadAll(rc)
		}
	}
	return nil, fmt.Errorf("ollama.exe not found in zip")
}

// StartOllama starts the managed Ollama subprocess if it isn't already running.
// Returns an error if the process fails to start or doesn't become ready within 10 seconds.
func (s *LocalAIService) StartOllama() error {
	if s.CheckOllama() {
		return nil // already running (could be user's own Ollama install)
	}

	path, err := s.ollamaBinaryPath()
	if err != nil {
		return err
	}
	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("ollama binary not found — download it first")
	}

	cmd := exec.Command(path, "serve")
	cmd.Env = append(os.Environ(),
		"OLLAMA_HOST=127.0.0.1:11434",
		"OLLAMA_ORIGINS=*",
	)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start ollama: %w", err)
	}

	s.mu.Lock()
	s.ollamaCmd = cmd
	s.mu.Unlock()

	// Wait up to 10 s for the API to respond.
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if s.CheckOllama() {
			return nil
		}
		time.Sleep(300 * time.Millisecond)
	}
	return fmt.Errorf("ollama did not become ready within 10 seconds")
}

// StopOllama terminates the managed Ollama subprocess.
func (s *LocalAIService) StopOllama() {
	s.mu.Lock()
	cmd := s.ollamaCmd
	s.ollamaCmd = nil
	s.mu.Unlock()

	if cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
}

// GetPulledModels returns the names of all models currently available in Ollama.
func (s *LocalAIService) GetPulledModels() ([]string, error) {
	resp, err := http.Get(s.ollamaURL + "/api/tags")
	if err != nil {
		return nil, fmt.Errorf("ollama not reachable: %w", err)
	}
	defer resp.Body.Close()
	var tags struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tags); err != nil {
		return nil, err
	}
	names := make([]string, len(tags.Models))
	for i, m := range tags.Models {
		names[i] = m.Name
	}
	return names, nil
}

// PullModel starts an async model download and emits progress events:
//
//	localai:pull-progress  { status, completed, total }
//	localai:pull-done      (no payload)
//	localai:pull-error     { error }
func (s *LocalAIService) PullModel(model string) {
	go func() {
		body, _ := json.Marshal(map[string]any{"name": model})
		resp, err := http.Post(s.ollamaURL+"/api/pull", "application/json", bytes.NewReader(body))
		if err != nil {
			s.emit("localai:pull-error", map[string]string{"error": err.Error()})
			return
		}
		defer resp.Body.Close()
		dec := json.NewDecoder(resp.Body)
		for {
			var event map[string]any
			if err := dec.Decode(&event); err != nil {
				if err == io.EOF {
					break
				}
				s.emit("localai:pull-error", map[string]string{"error": err.Error()})
				return
			}
			if status, _ := event["status"].(string); status == "success" {
				break
			}
			s.emit("localai:pull-progress", event)
		}
		s.emit("localai:pull-done", nil)
	}()
}

// Generate calls Ollama's generate endpoint synchronously and returns the response text.
func (s *LocalAIService) Generate(model, systemPrompt, userPrompt string) (string, error) {
	reqBody, _ := json.Marshal(map[string]any{
		"model":  model,
		"system": systemPrompt,
		"prompt": userPrompt,
		"stream": false,
	})
	resp, err := http.Post(s.ollamaURL+"/api/generate", "application/json", bytes.NewReader(reqBody))
	if err != nil {
		return "", fmt.Errorf("ollama generate: %w", err)
	}
	defer resp.Body.Close()
	var result struct {
		Response string `json:"response"`
		Error    string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if result.Error != "" {
		return "", fmt.Errorf("ollama: %s", result.Error)
	}
	return strings.TrimSpace(result.Response), nil
}

const commitSystemPrompt = `You are a git expert. Write a single conventional commit message for the staged changes shown below.
Use the format: <type>(<scope>): <description>
Types: feat, fix, chore, refactor, docs, test, style, perf, build, ci
Return only the commit message — no explanation, no markdown, no quotes.`

// GenerateCommitMessage generates a conventional commit message from the current staged diff in repoPath.
func (s *LocalAIService) GenerateCommitMessage(repoPath, model string) (string, error) {
	diff, err := gitCmd(repoPath, "git", "diff", "--cached", "--no-color", "-U3")
	if err != nil || strings.TrimSpace(diff) == "" {
		return "", fmt.Errorf("no staged changes to summarise")
	}
	const maxLen = 4000
	if len(diff) > maxLen {
		diff = diff[:maxLen] + "\n... (truncated)"
	}
	return s.Generate(model, commitSystemPrompt, "Staged diff:\n"+diff)
}
