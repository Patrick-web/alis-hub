package main

import (
	"bytes"
	"context"
	"fmt"
	htmlpkg "html"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	dbdv1 "alis-hub-v3/dbdv1"
	"alis-hub-v3/internal/alisclient"
)

// BuildService is a Wails-bound service that orchestrates the Build flow.
type BuildService struct {
	alisClient  *alisclient.AlisClient
	backend     DBDBackend
	productSvc  *ProductService
	localBuilds sync.Map // map[string]*localBuildState
	logCache    logTextCache
}

// localBuildState holds output from a running docker build.
type localBuildState struct {
	mu  sync.Mutex
	buf bytes.Buffer
	// done and errMsg are set when the build goroutine exits.
	done   bool
	errMsg string
}

// lockedWriter implements io.Writer over localBuildState so docker build
// output is appended safely from the goroutine.
type lockedWriter struct{ s *localBuildState }

func (w *lockedWriter) Write(p []byte) (int, error) {
	w.s.mu.Lock()
	defer w.s.mu.Unlock()
	return w.s.buf.Write(p)
}

func NewBuildService() *BuildService {
	return &BuildService{}
}

func (s *BuildService) setBackend(b DBDBackend) {
	s.backend = b
}

func (s *BuildService) initProductSvc() {
	if s.productSvc == nil {
		s.productSvc = NewProductService()
	}
}

// buildLogsURL constructs the alisproxy logs URL from the operation name and product's GCP project.
// Pattern: https://git-v2-alisproxy-{number}.{region}.run.app/executions/{uuid}/BUILD
func (s *BuildService) buildLogsURL(operationName, neuron string) string {
	uuid := strings.TrimPrefix(operationName, "operations/")
	if uuid == operationName || uuid == "" {
		return ""
	}

	// Extract org/product from neuron resource: organisations/{org}/products/{product}/neurons/...
	parts := strings.Split(neuron, "/")
	if len(parts) < 4 {
		return ""
	}
	org, product := parts[1], parts[3]

	s.initProductSvc()
	overview, err := s.productSvc.GetProductOverview(org, product)
	if err != nil || overview.GoogleProject == nil {
		log.Printf("[build] buildLogsURL: could not get GCP project for %s/%s: %v", org, product, err)
		return ""
	}

	gp := overview.GoogleProject
	region := gp.Region
	if region == "" {
		region = "us-east4"
	}
	url := fmt.Sprintf("https://git-v2-alisproxy-%s.%s.run.app/executions/%s", gp.Number, region, uuid)
	log.Printf("[build] buildLogsURL: constructed %s", url)
	return url
}

func (s *BuildService) initClient() error {
	if s.alisClient != nil {
		return nil
	}
	log.Println("[build] initialising Alis gRPC client")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	client, err := newAlisClient(ctx)
	if err != nil {
		return fmt.Errorf("connecting to Alis backend: %w", err)
	}
	s.alisClient = client
	log.Println("[build] gRPC client ready")
	return nil
}

// GetBuildBranches lists remote branches in the build repository for a given product.
func (s *BuildService) GetBuildBranches(org, product string) ([]string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	repoDir := filepath.Join(home, "alis.build", org, "build", product)

	cmd := exec.Command("git", "branch", "-r")
	cmd.Dir = repoDir
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git branch -r: %w", err)
	}

	var branches []string
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.Contains(line, "HEAD ->") {
			continue
		}
		branch := strings.TrimPrefix(line, "origin/")
		if branch != "" {
			branches = append(branches, branch)
		}
	}
	log.Printf("[build] GetBuildBranches: %s/%s → %d branches", org, product, len(branches))
	return branches, nil
}

// GetBuildCommits lists recent commits from the build repository.
// branch is the remote branch name (without "origin/" prefix); defaults to "master" if empty.
func (s *BuildService) GetBuildCommits(org, product, neuron, version, branch string, count int) ([]DefineCommit, error) {
	if count <= 0 {
		count = 50
	}
	if branch == "" {
		branch = "master"
	}
	remote := "origin/" + branch

	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	repoDir := filepath.Join(home, "alis.build", org, "build", product)
	log.Printf("[build] GetBuildCommits: repo=%s branch=%s filter=%s/%s count=%d", repoDir, branch, neuron, version, count)

	if _, err := os.Stat(repoDir); err != nil {
		log.Printf("[build] GetBuildCommits: repo not found: %v", err)
		return nil, fmt.Errorf("build repo not found at %s: %w", repoDir, err)
	}

	targetSubdir := filepath.Join(neuron, version)

	args := []string{
		"log", remote,
		"--first-parent",
		"--max-count", fmt.Sprintf("%d", count),
		"--format=format:%H|%ct|%an|%ae|%s",
		"--", targetSubdir,
	}

	cmd := exec.Command("git", args...)
	cmd.Dir = repoDir
	out, err := cmd.CombinedOutput()
	if err != nil || len(out) == 0 {
		log.Printf("[build] GetBuildCommits: path-filtered log empty, falling back to full log (err=%v)", err)
		fallback := exec.Command("git", "log", remote,
			"--first-parent",
			"--max-count", fmt.Sprintf("%d", count),
			"--format=format:%H|%ct|%an|%ae|%s",
		)
		fallback.Dir = repoDir
		out, err = fallback.CombinedOutput()
		if err != nil {
			log.Printf("[build] GetBuildCommits: fallback git log failed: %v", err)
			return nil, fmt.Errorf("git log failed: %w\n%s", err, string(out))
		}
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) == 1 && lines[0] == "" {
		log.Printf("[build] GetBuildCommits: no commits found for %s/%s", neuron, version)
		return []DefineCommit{}, nil
	}

	commits := make([]DefineCommit, 0, len(lines))
	for _, line := range lines {
		parts := strings.SplitN(line, "|", 5)
		if len(parts) < 5 {
			continue
		}
		ts := int64(0)
		fmt.Sscanf(parts[1], "%d", &ts)
		commits = append(commits, DefineCommit{
			SHA:         parts[0],
			Timestamp:   ts,
			Author:      parts[2],
			AuthorEmail: parts[3],
			Message:     parts[4],
		})
	}

	log.Printf("[build] GetBuildCommits: returned %d commits", len(commits))
	return commits, nil
}

// RunBuildResult is returned to the frontend after initiating a Build.
type RunBuildResult struct {
	OperationName string `json:"operationName"`
	Version       string `json:"version"`
	NeuronVersion string `json:"neuronVersion"`
	LogsURL       string `json:"logsUrl"`
	Notes         string `json:"notes"`
	Done          bool   `json:"done"`
	Error         string `json:"error,omitempty"`
}

// scanDockerfiles returns a map of Dockerfile context directories (relative to the neuron directory) → BUILD action.
// The extension uses path.dirname(dockerfilePath) relative to the neuron root, so a Dockerfile at
// bff/v1/Dockerfile produces key "." — matching the "BUILD ." step name on the alisproxy.
func (s *BuildService) scanDockerfiles(neuron string) map[string]dbdv1.RunBuildAction {
	// neuron = "organisations/{org}/products/{product}/neurons/{id}-{version}"
	parts := strings.Split(neuron, "/")
	if len(parts) < 6 {
		return nil
	}
	org, product, neuronID := parts[1], parts[3], parts[5]

	// Split neuronID into id and version (e.g. "bff-v1" → "bff", "v1")
	dashIdx := strings.LastIndex(neuronID, "-")
	if dashIdx < 0 {
		return nil
	}
	nID, nVer := neuronID[:dashIdx], neuronID[dashIdx+1:]

	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	neuronDir := filepath.Join(home, "alis.build", org, "build", product, nID, nVer)

	images := make(map[string]dbdv1.RunBuildAction)
	err = filepath.WalkDir(neuronDir, func(p string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if d.Name() == "Dockerfile" {
			// Key = directory containing the Dockerfile, relative to the neuron root.
			// e.g. bff/v1/Dockerfile → dir=bff/v1 → rel to bff/v1 = "."
			contextDir := filepath.Dir(p)
			rel, relErr := filepath.Rel(neuronDir, contextDir)
			if relErr == nil {
				images[rel] = dbdv1.RunBuildActionBuild
			}
		}
		return nil
	})
	if err != nil {
		log.Printf("[build] scanDockerfiles: walk error: %v", err)
	}
	log.Printf("[build] scanDockerfiles: found %d Dockerfiles in %s", len(images), neuronDir)
	return images
}

// RunBuild starts a Build operation on the Alis backend.
func (s *BuildService) RunBuild(neuron, commit string) (*RunBuildResult, error) {
	log.Printf("[build] RunBuild: neuron=%s commit=%s backend=%T", neuron, commit, s.backend)
	if s.backend != nil {
		result, err := s.backend.RunBuild(context.Background(), neuron, commit)
		if err == nil && result != nil {
			dbdProgress.Follow(result.OperationName, "build")
		}
		return result, err
	}
	return s.runBuildGRPC(context.Background(), neuron, commit)
}

// RunBuildOptions starts a build with the full option set: commit or branch
// pinning, explicit Dockerfile paths, retagging for infra-only changes, and a
// chained deploy. Prefer it over RunBuild for new call sites.
//
// A chained build+deploy is a single operation, so the deploy cannot be lost
// between two round trips the way the app's separate build and deploy pages
// allow today.
func (s *BuildService) RunBuildOptions(neuron string, opts BuildOptions) (*RunBuildResult, error) {
	log.Printf("[build] RunBuildOptions: neuron=%s opts=%+v backend=%T", neuron, opts, s.backend)
	if s.backend == nil {
		return s.runBuildGRPC(context.Background(), neuron, opts.Commit)
	}
	result, err := s.backend.RunBuildOptions(context.Background(), neuron, opts)
	if err == nil && result != nil {
		dbdProgress.Follow(result.OperationName, "build")
	}
	return result, err
}

// runBuildGRPC is the original gRPC implementation of RunBuild.
func (s *BuildService) runBuildGRPC(ctx context.Context, neuron, commit string) (*RunBuildResult, error) {
	if err := s.initClient(); err != nil {
		return nil, err
	}

	log.Printf("[build] RunBuild: neuron=%s commit=%s", neuron, commit)

	images := s.scanDockerfiles(neuron)
	for path := range images {
		log.Printf("[build] RunBuild: imagesMap %s → BUILD", path)
	}

	req := &dbdv1.RunBuildRequest{
		Neuron: neuron,
		Commit: commit,
		Images: images,
	}

	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	op, err := s.alisClient.RunBuild(ctx, req)
	if err != nil {
		log.Printf("[build] RunBuild: gRPC error: %v", err)
		return nil, fmt.Errorf("RunBuild: %w", err)
	}

	log.Printf("[build] RunBuild: operation started name=%s done=%v", op.Name, op.Done)

	result := &RunBuildResult{
		OperationName: op.Name,
		Done:          op.Done,
	}

	if e, ok := op.Result.(*dbdv1.OperationError); ok {
		log.Printf("[build] RunBuild: operation returned error immediately: %s", e.Message)
		result.Error = e.Message
	}

	return result, nil
}

// BuildLogsResult is returned by FetchBuildLogs.
// NextOffset is the character count of all log text seen so far; pass it back on the
// next call so only newly-appended lines are returned.
type BuildLogsResult struct {
	Content    string `json:"content"`
	NextOffset int64  `json:"nextOffset"`
	// Reset tells the caller that Content is the whole log rather than an
	// addition to it, so the terminal must be cleared before writing.
	//
	// The offset scheme assumes the page's text only ever grows, and the
	// alisproxy page is a structured view that rewrites in place — a step's
	// duration lands, a status flips to Completed — so the text the caller
	// already holds can stop being a prefix of the current text. Splicing at
	// the old offset then joins two unrelated points in the output.
	Reset bool `json:"reset"`
}

// htmlTagRe matches an HTML tag, allowing `>` inside quoted attribute values.
//
// The naive `<[^>]+>` ends at the first `>` in the source, which lands inside
// attributes like class="[&>svg]:size-4" — the alisproxy pages are full of
// those Tailwind arbitrary variants — and leaks the rest of the attribute into
// the log as if it were output. That accounted for 22% of the text on a real
// build page.
var htmlTagRe = regexp.MustCompile(`<[a-zA-Z/!?][^>"']*(?:"[^"]*"[^>"']*|'[^']*'[^>"']*)*>`)

// blockTagRe matches the tags that end a visual line. The pages carry no
// newlines of their own, so without this every step, timing and log line
// concatenates into one enormous row.
var blockTagRe = regexp.MustCompile(`(?i)</?(?:div|p|li|tr|section|article|header|footer|h[1-6]|pre|details|summary)\b[^>]*>|<br\s*/?>`)

// scriptStyleRe matches script and style elements including their contents,
// which are not visible text and must not reach the terminal.
var scriptStyleRe = regexp.MustCompile(`(?is)<(script|style)\b[^>]*>.*?</(?:script|style)>`)

// spaceRunRe collapses the whitespace left behind by stripped inline markup.
var spaceRunRe = regexp.MustCompile(`[ \t]+`)

// htmlToText renders an HTML fragment as the plain text a reader would see:
// block tags become line breaks, everything else is dropped, entities are
// decoded, and blank lines are removed.
func htmlToText(fragment string) string {
	s := scriptStyleRe.ReplaceAllString(fragment, "")
	s = blockTagRe.ReplaceAllString(s, "\n")
	s = htmlTagRe.ReplaceAllString(s, " ")
	s = htmlpkg.UnescapeString(s)

	var buf strings.Builder
	for _, line := range strings.Split(s, "\n") {
		line = strings.TrimSpace(spaceRunRe.ReplaceAllString(line, " "))
		if line == "" {
			continue
		}
		buf.WriteString(line)
		buf.WriteString("\n")
	}
	return strings.TrimRight(buf.String(), "\n")
}

// extractBuildLogText pulls the plain-text log out of the alisproxy HTML page.
//
// Older pages wrapped each line in <span class="log-line">. Current pages do
// not — a build and a deploy page both come back with none — and instead render
// a structured view whose expandable steps carry the raw command output. The
// span path is kept for pages that still use it; everything else falls through
// to the rightPanel, which is the panel the tab strip swaps.
//
// Note that ?tab=logs does nothing: the page serves the structured tab whatever
// the query says, so this is scraping that view, not a raw log endpoint.
func extractBuildLogText(pageHTML string) string {
	// Try log-line spans first (older build pages).
	marker := `<span class="log-line">`
	if strings.Contains(pageHTML, marker) {
		var buf strings.Builder
		searchFrom := 0
		for {
			start := strings.Index(pageHTML[searchFrom:], marker)
			if start == -1 {
				break
			}
			start = searchFrom + start + len(marker)
			end := strings.Index(pageHTML[start:], "</span>")
			if end == -1 {
				break
			}
			if buf.Len() > 0 {
				buf.WriteString("\n")
			}
			buf.WriteString(htmlToText(pageHTML[start : start+end]))
			searchFrom = start + end + len("</span>")
		}
		return buf.String()
	}

	// Fallback for the structured build and deploy pages.
	panelStart := strings.Index(pageHTML, `id="rightPanel"`)
	if panelStart == -1 {
		return ""
	}
	// Find the rightPanel opening tag's >
	tagEnd := strings.Index(pageHTML[panelStart:], ">")
	if tagEnd == -1 {
		return ""
	}
	contentStart := panelStart + tagEnd + 1

	// Find the closing div by counting nested divs.
	depth := 0
	contentEnd := -1
	for i := contentStart; i < len(pageHTML)-6; i++ {
		if pageHTML[i:i+4] == "<div" {
			depth++
		} else if pageHTML[i:i+6] == "</div>" {
			if depth == 0 {
				contentEnd = i
				break
			}
			depth--
		}
	}
	if contentEnd == -1 {
		return ""
	}
	return htmlToText(pageHTML[contentStart:contentEnd])
}

// logTextCache remembers the last text extracted from each log page, which is
// what lets a re-render be told apart from an append.
type logTextCache struct {
	mu   sync.Mutex
	last map[string]string
}

// logTextCacheMax bounds the cache. A session holds one entry per log page it
// has followed — a handful — so reaching this means something is generating
// URLs, and dropping the lot costs only one extra Reset each.
const logTextCacheMax = 64

// diff works out what to send for a log page that was just re-fetched, and
// remembers the text for next time.
//
// Normally the text has grown and only the tail is new. When the page instead
// rewrote something the caller already holds, there is no safe splice point, so
// the whole text goes back with Reset set. A cold cache cannot tell the two
// apart and assumes an append, which is no worse than having no cache at all.
func (c *logTextCache) diff(url, text string, seen int64) *BuildLogsResult {
	c.mu.Lock()
	if c.last == nil || len(c.last) >= logTextCacheMax {
		c.last = make(map[string]string, logTextCacheMax)
	}
	prev, known := c.last[url]
	c.last[url] = text
	c.mu.Unlock()

	if seen < 0 || seen > int64(len(text)) || (known && !strings.HasPrefix(text, prev)) {
		return &BuildLogsResult{Content: text, NextOffset: int64(len(text)), Reset: true}
	}
	if seen == int64(len(text)) {
		return &BuildLogsResult{NextOffset: seen}
	}
	return &BuildLogsResult{Content: text[seen:], NextOffset: int64(len(text))}
}

// FetchBuildLogs fetches the current log page from the alisproxy, extracts plain text,
// and returns only the characters past textOffset. Pass 0 on the first call;
// pass the returned NextOffset on each subsequent call to stream only new lines.
func (s *BuildService) FetchBuildLogs(logsUrl string, textOffset int64) (*BuildLogsResult, error) {
	if err := s.initClient(); err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, _, err := s.alisClient.FetchURL(ctx, logsUrl, 0)
	if err != nil {
		return nil, fmt.Errorf("fetch build logs: %w", err)
	}

	text := extractBuildLogText(string(body))
	result := s.logCache.diff(logsUrl, text, textOffset)

	log.Printf("[build] FetchBuildLogs: textLen=%d offset=%d new=%d reset=%v",
		len(text), textOffset, len(result.Content), result.Reset)
	return result, nil
}

// PollBuildOperation checks the status of a running Build operation.
// neuron is the full neuron resource name (needed to construct the logs URL when the API doesn't return one).
func (s *BuildService) PollBuildOperation(name, neuron string) (*RunBuildResult, error) {
	if s.backend != nil {
		return s.backend.PollBuild(context.Background(), name, neuron)
	}
	return s.pollBuildGRPC(context.Background(), name, neuron)
}

// pollBuildGRPC is the original gRPC implementation of PollBuildOperation.
func (s *BuildService) pollBuildGRPC(ctx context.Context, name, neuron string) (*RunBuildResult, error) {
	if err := s.initClient(); err != nil {
		return nil, err
	}

	log.Printf("[build] PollBuildOperation: polling %s", name)

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	op, err := s.alisClient.GetOperation(ctx, name)
	if err != nil {
		log.Printf("[build] PollBuildOperation: GetOperation error: %v", err)
		return nil, fmt.Errorf("poll operation: %w", err)
	}

	log.Printf("[build] PollBuildOperation: done=%v", op.Done)

	result := &RunBuildResult{
		OperationName: op.Name,
		Done:          op.Done,
	}

	meta := alisclient.UnpackBuildMetadata(op)
	if meta != nil {
		log.Printf("[build] PollBuildOperation: metadata version=%q logsUrl=%q notes=%q", meta.Version, meta.LogsURL, meta.Notes)
		result.Version = meta.Version
		result.LogsURL = meta.LogsURL
		result.Notes = meta.Notes
	} else {
		log.Printf("[build] PollBuildOperation: no metadata in operation")
	}

	if op.Done {
		if resp := alisclient.ParseBuildResponse(op); resp != nil {
			log.Printf("[build] PollBuildOperation: response neuronVersion=%q buildLogsUrl=%q version=%q",
				resp.NeuronVersion, resp.BuildLogsURL, resp.Version)
			if resp.BuildLogsURL != "" {
				result.LogsURL = resp.BuildLogsURL
			}
			if resp.Version != "" {
				result.Version = resp.Version
			}
			if resp.NeuronVersion != "" {
				result.NeuronVersion = resp.NeuronVersion
			}
		} else {
			log.Printf("[build] PollBuildOperation: done=true but no response body parsed")
		}

		// If the API didn't return a logs URL, try constructing one from the operation UUID + product GCP project.
		// This covers fast builds where the API omits the field, as long as the project is reachable.
		if result.LogsURL == "" && neuron != "" {
			if constructed := s.buildLogsURL(op.Name, neuron); constructed != "" {
				result.LogsURL = constructed
			}
		}
	}

	if e, ok := op.Result.(*dbdv1.OperationError); ok {
		log.Printf("[build] PollBuildOperation: operation failed: code=%d message=%s", e.Code, e.Message)
		result.Error = e.Message
	}

	log.Printf("[build] PollBuildOperation: final logsUrl=%q", result.LogsURL)
	return result, nil
}

// LocalBuildResult is returned when a local Docker build is started.
type LocalBuildResult struct {
	BuildID string `json:"buildId"`
}

// LocalBuildChunk is a polling response for a running local Docker build.
type LocalBuildChunk struct {
	Content    string `json:"content"`
	NextOffset int    `json:"nextOffset"`
	Done       bool   `json:"done"`
	Error      string `json:"error,omitempty"`
}

// StartLocalBuild launches a local Docker build in a goroutine and returns
// a build ID that can be passed to PollLocalBuild to stream output.
// neuron is the full resource name e.g. "organisations/voyage/products/vp/neurons/hubspot-v1".
func (s *BuildService) StartLocalBuild(neuron, commit string) (*LocalBuildResult, error) {
	if err := s.initClient(); err != nil {
		return nil, fmt.Errorf("connecting to Alis backend: %w", err)
	}

	parts := strings.Split(neuron, "/")
	if len(parts) < 6 {
		return nil, fmt.Errorf("invalid neuron resource: %s", neuron)
	}
	org, product, neuronID := parts[1], parts[3], parts[5]

	dashIdx := strings.LastIndex(neuronID, "-")
	if dashIdx < 0 {
		return nil, fmt.Errorf("invalid neuron ID (no version suffix): %s", neuronID)
	}
	nID, nVer := neuronID[:dashIdx], neuronID[dashIdx+1:]

	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	neuronDir := filepath.Join(home, "alis.build", org, "build", product, nID, nVer)
	if _, err := os.Stat(neuronDir); err != nil {
		return nil, fmt.Errorf("neuron dir not found at %s", neuronDir)
	}

	tag := fmt.Sprintf("%s-%s:%.8s", nID, nVer, commit)

	buildID := fmt.Sprintf("local-%d", time.Now().UnixNano())
	st := &localBuildState{}
	s.localBuilds.Store(buildID, st)

	go func() {
		lw := &lockedWriter{s: st}
		fmt.Fprintf(lw, "==> docker build --progress=plain -t %s .\n", tag)
		fmt.Fprintf(lw, "==> Context: %s\n\n", neuronDir)

		cmd := exec.Command("docker", "build", "--progress=plain", "-t", tag, ".")
		cmd.Dir = neuronDir
		cmd.Stdout = lw
		cmd.Stderr = lw

		runErr := cmd.Run()

		st.mu.Lock()
		st.done = true
		if runErr != nil {
			st.errMsg = runErr.Error()
			st.buf.WriteString("\n\nBuild failed: " + runErr.Error() + "\n")
		} else {
			st.buf.WriteString("\n\nBuild complete: " + tag + "\n")
		}
		st.mu.Unlock()

		go func(tag string, failed bool) {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			if err := s.alisClient.FinishLocalBuild(ctx, tag, failed); err != nil {
				log.Printf("[build] FinishLocalBuild: %v", err)
			}
		}(tag, runErr != nil)
	}()

	log.Printf("[build] StartLocalBuild: buildID=%s tag=%s dir=%s", buildID, tag, neuronDir)
	return &LocalBuildResult{BuildID: buildID}, nil
}

// GetCurrentBranch returns the currently checked-out branch name in the product build directory.
func (s *BuildService) GetCurrentBranch(org, product string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "master", nil
	}
	productDir := filepath.Join(home, "alis.build", org, "build", product)
	out, err := exec.Command("git", "-C", productDir, "rev-parse", "--abbrev-ref", "HEAD").Output()
	if err != nil {
		log.Printf("[build] GetCurrentBranch: rev-parse failed for %s: %v, defaulting to master", productDir, err)
		return "master", nil
	}
	branch := strings.TrimSpace(string(out))
	if branch == "" || branch == "HEAD" {
		log.Printf("[build] GetCurrentBranch: detached/empty HEAD in %s, defaulting to master", productDir)
		return "master", nil
	}
	log.Printf("[build] GetCurrentBranch: org=%s product=%s branch=%s", org, product, branch)
	return branch, nil
}

var neuronVersionDirRe = regexp.MustCompile(`^v\d+$`)

// GetNeuronLastCommitTimes returns a map of neuron ID (e.g. "bff-v1") → ISO-8601 timestamp of
// the last commit that touched that neuron's directory on the given branch. Neuron directories
// on disk are laid out as <base>/<version>/ (e.g. bookings/v1, bookings/v2); this walks each
// base folder's version subdirectories and keys results as "<base>-<version>" to match the
// neuron ID convention used elsewhere (e.g. product overview, scanDockerfiles). Neurons with no
// matching commits are omitted from the result.
func (s *BuildService) GetNeuronLastCommitTimes(org, product, branch string) (map[string]string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	productDir := filepath.Join(home, "alis.build", org, "build", product)
	if _, err := os.Stat(productDir); err != nil {
		return nil, fmt.Errorf("product build dir not found: %w", err)
	}

	// Collect immediate subdirectory names (neuron base folders).
	entries, err := os.ReadDir(productDir)
	if err != nil {
		return nil, err
	}

	// Prefer the remote-tracking ref, but fall back to the local branch name
	// (e.g. a checked-out branch that hasn't been pushed to origin yet).
	ref := "origin/" + branch
	fellBack := false
	if err := exec.Command("git", "-C", productDir, "rev-parse", "--verify", "--quiet", ref).Run(); err != nil {
		log.Printf("[build] GetNeuronLastCommitTimes: %q did not resolve, falling back to local ref %q", ref, branch)
		ref = branch
		fellBack = true
	}
	log.Printf("[build] GetNeuronLastCommitTimes: org=%s product=%s requestedBranch=%s ref=%s fellBack=%v dirEntries=%d", org, product, branch, ref, fellBack, len(entries))

	result := make(map[string]string, len(entries))
	var skipped []string
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		baseName := entry.Name()
		versionEntries, err := os.ReadDir(filepath.Join(productDir, baseName))
		if err != nil {
			continue
		}
		for _, ve := range versionEntries {
			if !ve.IsDir() || !neuronVersionDirRe.MatchString(ve.Name()) {
				continue
			}
			neuronID := baseName + "-" + ve.Name()
			relPath := baseName + "/" + ve.Name() + "/"
			out, err := exec.Command(
				"git", "-C", productDir,
				"log", "-1", "--format=%aI", ref, "--", relPath,
			).Output()
			if err != nil || len(strings.TrimSpace(string(out))) == 0 {
				skipped = append(skipped, neuronID)
				continue
			}
			result[neuronID] = strings.TrimSpace(string(out))
		}
	}
	log.Printf("[build] GetNeuronLastCommitTimes: found=%d skipped=%d skippedNeurons=%v", len(result), len(skipped), skipped)
	return result, nil
}

// PollLocalBuild returns new output from a running local Docker build.
// Pass 0 as offset on first call; pass NextOffset from each response on subsequent calls.
func (s *BuildService) PollLocalBuild(buildID string, offset int) (*LocalBuildChunk, error) {
	val, ok := s.localBuilds.Load(buildID)
	if !ok {
		return nil, fmt.Errorf("local build not found: %s", buildID)
	}
	st := val.(*localBuildState)

	st.mu.Lock()
	defer st.mu.Unlock()

	all := st.buf.String()
	chunk := ""
	if offset < len(all) {
		chunk = all[offset:]
	}

	return &LocalBuildChunk{
		Content:    chunk,
		NextOffset: len(all),
		Done:       st.done,
		Error:      st.errMsg,
	}, nil
}
