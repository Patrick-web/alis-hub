package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	_ "modernc.org/sqlite"

	"alis-hub-v3/internal/terminal"
)

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkflowStep struct {
	ID         string `json:"id"`
	WorkflowID string `json:"workflowId"`
	Position   int    `json:"position"`
	Type       string `json:"type"`
	Params     string `json:"params"`    // raw JSON blob
	OnFailure  string `json:"onFailure"` // "stop" | "continue"
}

type WorkflowArg struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

type Workflow struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	IsTemplate  bool           `json:"isTemplate"`
	CreatedAt   int64          `json:"createdAt"`
	UpdatedAt   int64          `json:"updatedAt"`
	Steps       []WorkflowStep `json:"steps"`
	Args        []WorkflowArg  `json:"args"`
}

type WorkflowRun struct {
	ID           string          `json:"id"`
	WorkflowID   string          `json:"workflowId"`
	WorkflowName string          `json:"workflowName"`
	Status       string          `json:"status"` // running|success|failed|stopped
	StartedAt    int64           `json:"startedAt"`
	CompletedAt  *int64          `json:"completedAt"`
	StepRuns     []StepRunStatus `json:"stepRuns"`
}

type StepRunStatus struct {
	ID          string `json:"id"`
	StepID      string `json:"stepId"`
	Position    int    `json:"position"`
	Type        string `json:"type"`
	Label       string `json:"label"`
	Status      string `json:"status"` // pending|running|success|failed|skipped
	StartedAt   *int64 `json:"startedAt"`
	CompletedAt *int64 `json:"completedAt"`
	Log         string `json:"log"` // persisted once the step completes; empty while running/pending
}

type RunLogChunk struct {
	StepRuns   []StepRunStatus `json:"stepRuns"`
	LogText    string          `json:"logText"`
	NextOffset int             `json:"nextOffset"`
	Done       bool            `json:"done"`
}

type UpsertWorkflowParams struct {
	Name        string             `json:"name"`
	Description string             `json:"description"`
	Steps       []UpsertStepParams `json:"steps"`
	Args        []WorkflowArg      `json:"args"`
}

type UpsertStepParams struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Params    string `json:"params"` // raw JSON blob
	OnFailure string `json:"onFailure"`
}

// ─── Active-run state ─────────────────────────────────────────────────────────

type activeRun struct {
	cancel context.CancelFunc
	mu     sync.Mutex
	buf    bytes.Buffer
	ptmx   terminal.PTY // set while a step's shell is running and interactive input can be sent
}

func (r *activeRun) Write(p []byte) (n int, err error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.buf.Write(p)
}

func (r *activeRun) slice(offset int) []byte {
	r.mu.Lock()
	defer r.mu.Unlock()
	b := r.buf.Bytes()
	if offset >= len(b) {
		return nil
	}
	out := make([]byte, len(b)-offset)
	copy(out, b[offset:])
	return out
}

func (r *activeRun) len() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.buf.Len()
}

func (r *activeRun) setPTY(p terminal.PTY) {
	r.mu.Lock()
	r.ptmx = p
	r.mu.Unlock()
}

func (r *activeRun) writeInput(data string) error {
	r.mu.Lock()
	p := r.ptmx
	r.mu.Unlock()
	if p == nil {
		return fmt.Errorf("run has no interactive shell running")
	}
	_, err := p.Write([]byte(data))
	return err
}

// ─── WorkflowService ──────────────────────────────────────────────────────────

type WorkflowService struct {
	db             *sql.DB
	buildService   *BuildService
	gitService     *GitService
	deployService  *DeployService
	defineService  *DefineService
	packageService *PackageService
	activeRuns     sync.Map // runId → *activeRun
}

func NewWorkflowService(bs *BuildService, gs *GitService, ds *DeployService, def *DefineService, pkg *PackageService) *WorkflowService {
	return &WorkflowService{
		buildService:   bs,
		gitService:     gs,
		deployService:  ds,
		defineService:  def,
		packageService: pkg,
	}
}

// Open opens (or creates) the SQLite database and runs migrations.
func (s *WorkflowService) Open() error {
	dir, err := os.UserConfigDir()
	if err != nil {
		return fmt.Errorf("config dir: %w", err)
	}
	appDir := filepath.Join(dir, "AlisHub")
	if err := os.MkdirAll(appDir, 0700); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}
	db, err := sql.Open("sqlite", filepath.Join(appDir, "hub.db"))
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;"); err != nil {
		return fmt.Errorf("db pragma: %w", err)
	}
	s.db = db
	if err := s.migrate(); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	return nil
}

// ─── Migrations ───────────────────────────────────────────────────────────────

var migrations = []string{
	// v1 — initial schema
	`CREATE TABLE IF NOT EXISTS workflows (
		id          TEXT PRIMARY KEY,
		name        TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		is_template INTEGER NOT NULL DEFAULT 0,
		created_at  INTEGER NOT NULL,
		updated_at  INTEGER NOT NULL
	);
	CREATE TABLE IF NOT EXISTS workflow_steps (
		id          TEXT PRIMARY KEY,
		workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
		position    INTEGER NOT NULL,
		type        TEXT NOT NULL,
		params      TEXT NOT NULL DEFAULT '{}',
		on_failure  TEXT NOT NULL DEFAULT 'stop'
	);
	CREATE TABLE IF NOT EXISTS workflow_runs (
		id             TEXT PRIMARY KEY,
		workflow_id    TEXT NOT NULL,
		workflow_name  TEXT NOT NULL,
		status         TEXT NOT NULL DEFAULT 'running',
		log            TEXT NOT NULL DEFAULT '',
		started_at     INTEGER NOT NULL,
		completed_at   INTEGER
	);
	CREATE TABLE IF NOT EXISTS workflow_step_runs (
		id           TEXT PRIMARY KEY,
		run_id       TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
		step_id      TEXT NOT NULL,
		position     INTEGER NOT NULL,
		type         TEXT NOT NULL,
		label        TEXT NOT NULL,
		status       TEXT NOT NULL DEFAULT 'pending',
		log          TEXT NOT NULL DEFAULT '',
		started_at   INTEGER,
		completed_at INTEGER
	);`,
	// v2 — workflow-level input arguments
	`ALTER TABLE workflows ADD COLUMN args TEXT NOT NULL DEFAULT '[]'`,
	// v3 — remove built-in workflow templates (feature removed); cascades to their steps
	`DELETE FROM workflows WHERE id IN ('tpl-define','tpl-build','tpl-define-build','tpl-git-commit-push','tpl-build-deploy')`,
}

func (s *WorkflowService) migrate() error {
	if _, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS hub_meta (schema_version INTEGER PRIMARY KEY)`); err != nil {
		return err
	}
	var version int
	_ = s.db.QueryRow(`SELECT COALESCE(MAX(schema_version),0) FROM hub_meta`).Scan(&version)
	for i, m := range migrations {
		v := i + 1
		if v <= version {
			continue
		}
		if _, err := s.db.Exec(m); err != nil {
			return fmt.Errorf("migration v%d: %w", v, err)
		}
		if _, err := s.db.Exec(`INSERT OR REPLACE INTO hub_meta VALUES (?)`, v); err != nil {
			return fmt.Errorf("bump schema_version: %w", err)
		}
		log.Printf("[workflow] applied migration v%d", v)
	}
	return nil
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

func (s *WorkflowService) ListWorkflows() ([]Workflow, error) {
	rows, err := s.db.Query(`SELECT id,name,description,is_template,created_at,updated_at,args FROM workflows ORDER BY is_template DESC, created_at ASC`)
	if err != nil {
		return nil, err
	}
	// Drain rows before making nested queries — single connection would deadlock otherwise.
	var out []Workflow
	for rows.Next() {
		var w Workflow
		var isT int
		var argsJSON string
		if err := rows.Scan(&w.ID, &w.Name, &w.Description, &isT, &w.CreatedAt, &w.UpdatedAt, &argsJSON); err != nil {
			rows.Close()
			return nil, err
		}
		w.IsTemplate = isT == 1
		_ = json.Unmarshal([]byte(argsJSON), &w.Args)
		if w.Args == nil {
			w.Args = []WorkflowArg{}
		}
		out = append(out, w)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	// Now load steps per workflow (connection is free).
	for i := range out {
		out[i].Steps, err = s.loadSteps(out[i].ID)
		if err != nil {
			return nil, err
		}
	}
	return out, nil
}

func (s *WorkflowService) GetWorkflow(id string) (*Workflow, error) {
	var w Workflow
	var isT int
	var argsJSON string
	err := s.db.QueryRow(
		`SELECT id,name,description,is_template,created_at,updated_at,args FROM workflows WHERE id=?`, id,
	).Scan(&w.ID, &w.Name, &w.Description, &isT, &w.CreatedAt, &w.UpdatedAt, &argsJSON)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("workflow not found: %s", id)
	}
	if err != nil {
		return nil, err
	}
	w.IsTemplate = isT == 1
	_ = json.Unmarshal([]byte(argsJSON), &w.Args)
	if w.Args == nil {
		w.Args = []WorkflowArg{}
	}
	w.Steps, err = s.loadSteps(id)
	return &w, err
}

func (s *WorkflowService) loadSteps(workflowID string) ([]WorkflowStep, error) {
	rows, err := s.db.Query(
		`SELECT id,workflow_id,position,type,params,on_failure FROM workflow_steps WHERE workflow_id=? ORDER BY position`,
		workflowID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var steps []WorkflowStep
	for rows.Next() {
		var st WorkflowStep
		if err := rows.Scan(&st.ID, &st.WorkflowID, &st.Position, &st.Type, &st.Params, &st.OnFailure); err != nil {
			return nil, err
		}
		steps = append(steps, st)
	}
	return steps, rows.Err()
}

func (s *WorkflowService) CreateWorkflow(params UpsertWorkflowParams) (*Workflow, error) {
	id := newWFID()
	now := time.Now().Unix()
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	argsJSON, _ := json.Marshal(params.Args)
	if argsJSON == nil {
		argsJSON = []byte("[]")
	}
	if _, err := tx.Exec(
		`INSERT INTO workflows (id,name,description,is_template,created_at,updated_at,args) VALUES (?,?,?,0,?,?,?)`,
		id, params.Name, params.Description, now, now, string(argsJSON),
	); err != nil {
		return nil, err
	}
	for i, st := range params.Steps {
		sid := st.ID
		if sid == "" {
			sid = newWFID()
		}
		onFail := st.OnFailure
		if onFail == "" {
			onFail = "stop"
		}
		p := st.Params
		if p == "" {
			p = "{}"
		}
		if _, err := tx.Exec(
			`INSERT INTO workflow_steps (id,workflow_id,position,type,params,on_failure) VALUES (?,?,?,?,?,?)`,
			sid, id, i, st.Type, p, onFail,
		); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.GetWorkflow(id)
}

func (s *WorkflowService) UpdateWorkflow(id string, params UpsertWorkflowParams) error {
	wf, err := s.GetWorkflow(id)
	if err != nil {
		return err
	}
	if wf.IsTemplate {
		return fmt.Errorf("built-in templates cannot be edited; clone it first")
	}
	now := time.Now().Unix()
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	argsJSONUp, _ := json.Marshal(params.Args)
	if argsJSONUp == nil {
		argsJSONUp = []byte("[]")
	}
	if _, err := tx.Exec(
		`UPDATE workflows SET name=?,description=?,updated_at=?,args=? WHERE id=?`,
		params.Name, params.Description, now, string(argsJSONUp), id,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM workflow_steps WHERE workflow_id=?`, id); err != nil {
		return err
	}
	for i, st := range params.Steps {
		sid := st.ID
		if sid == "" {
			sid = newWFID()
		}
		onFail := st.OnFailure
		if onFail == "" {
			onFail = "stop"
		}
		p := st.Params
		if p == "" {
			p = "{}"
		}
		if _, err := tx.Exec(
			`INSERT INTO workflow_steps (id,workflow_id,position,type,params,on_failure) VALUES (?,?,?,?,?,?)`,
			sid, id, i, st.Type, p, onFail,
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *WorkflowService) DeleteWorkflow(id string) error {
	wf, err := s.GetWorkflow(id)
	if err != nil {
		return err
	}
	if wf.IsTemplate {
		return fmt.Errorf("built-in templates cannot be deleted")
	}
	_, err = s.db.Exec(`DELETE FROM workflows WHERE id=?`, id)
	return err
}

// CloneWorkflow creates an editable copy of any workflow (including templates).
func (s *WorkflowService) CloneWorkflow(id string) (*Workflow, error) {
	wf, err := s.GetWorkflow(id)
	if err != nil {
		return nil, err
	}
	steps := make([]UpsertStepParams, len(wf.Steps))
	for i, st := range wf.Steps {
		steps[i] = UpsertStepParams{Type: st.Type, Params: st.Params, OnFailure: st.OnFailure}
	}
	return s.CreateWorkflow(UpsertWorkflowParams{
		Name:        wf.Name + " (copy)",
		Description: wf.Description,
		Steps:       steps,
		Args:        wf.Args,
	})
}

// ─── Execution ────────────────────────────────────────────────────────────────

// RunWorkflow starts a run of workflow id. startPosition lets the run begin
// partway through: steps whose Position is below it are recorded as
// 'skipped' up front and never executed, so a failed/edited step can be
// re-run without repeating earlier side-effecting steps. Pass 0 to run the
// whole workflow from the beginning.
func (s *WorkflowService) RunWorkflow(id string, argValues map[string]string, startPosition int) (string, error) {
	wf, err := s.GetWorkflow(id)
	if err != nil {
		return "", err
	}
	if len(wf.Steps) == 0 {
		return "", fmt.Errorf("workflow has no steps")
	}

	runID := newWFID()
	now := time.Now().Unix()

	tx, err := s.db.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(
		`INSERT INTO workflow_runs (id,workflow_id,workflow_name,status,started_at) VALUES (?,?,?,'running',?)`,
		runID, id, wf.Name, now,
	); err != nil {
		return "", err
	}
	for _, step := range wf.Steps {
		if step.Position < startPosition {
			if _, err := tx.Exec(
				`INSERT INTO workflow_step_runs (id,run_id,step_id,position,type,label,status,started_at,completed_at) VALUES (?,?,?,?,?,?,'skipped',?,?)`,
				newWFID(), runID, step.ID, step.Position, step.Type, stepLabel(step), now, now,
			); err != nil {
				return "", err
			}
			continue
		}
		if _, err := tx.Exec(
			`INSERT INTO workflow_step_runs (id,run_id,step_id,position,type,label,status) VALUES (?,?,?,?,?,?,'pending')`,
			newWFID(), runID, step.ID, step.Position, step.Type, stepLabel(step),
		); err != nil {
			return "", err
		}
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}

	ctx, cancel := context.WithCancel(context.Background())
	ar := &activeRun{cancel: cancel}
	s.activeRuns.Store(runID, ar)

	go s.executeRun(ctx, runID, wf, ar, argValues, startPosition)
	return runID, nil
}

func (s *WorkflowService) StopRun(runID string) error {
	val, ok := s.activeRuns.Load(runID)
	if !ok {
		return fmt.Errorf("run not active: %s", runID)
	}
	val.(*activeRun).cancel()
	return nil
}

// SendRunInput writes user-typed input to the currently running step's shell,
// e.g. to answer an interactive prompt (like corepack's download confirmation).
func (s *WorkflowService) SendRunInput(runID, data string) error {
	val, ok := s.activeRuns.Load(runID)
	if !ok {
		return fmt.Errorf("run not active: %s", runID)
	}
	return val.(*activeRun).writeInput(data)
}

func (s *WorkflowService) GetRun(runID string) (*WorkflowRun, error) {
	var r WorkflowRun
	var completedAt sql.NullInt64
	err := s.db.QueryRow(
		`SELECT id,workflow_id,workflow_name,status,started_at,completed_at FROM workflow_runs WHERE id=?`, runID,
	).Scan(&r.ID, &r.WorkflowID, &r.WorkflowName, &r.Status, &r.StartedAt, &completedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("run not found: %s", runID)
	}
	if err != nil {
		return nil, err
	}
	if completedAt.Valid {
		r.CompletedAt = &completedAt.Int64
	}
	r.StepRuns, err = s.loadStepRuns(runID)
	return &r, err
}

func (s *WorkflowService) ListRuns(workflowID string, limit int) ([]WorkflowRun, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := s.db.Query(
		`SELECT id,workflow_id,workflow_name,status,started_at,completed_at FROM workflow_runs WHERE workflow_id=? ORDER BY started_at DESC LIMIT ?`,
		workflowID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []WorkflowRun
	for rows.Next() {
		var r WorkflowRun
		var completedAt sql.NullInt64
		if err := rows.Scan(&r.ID, &r.WorkflowID, &r.WorkflowName, &r.Status, &r.StartedAt, &completedAt); err != nil {
			return nil, err
		}
		if completedAt.Valid {
			r.CompletedAt = &completedAt.Int64
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *WorkflowService) PollRunLogs(runID string, offset int) (*RunLogChunk, error) {
	var status string
	err := s.db.QueryRow(`SELECT status FROM workflow_runs WHERE id=?`, runID).Scan(&status)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("run not found: %s", runID)
	}
	if err != nil {
		return nil, err
	}

	done := status != "running"
	stepRuns, err := s.loadStepRuns(runID)
	if err != nil {
		return nil, err
	}

	var logBytes []byte
	if val, ok := s.activeRuns.Load(runID); ok {
		logBytes = val.(*activeRun).slice(offset)
	} else {
		// run completed — read from DB
		var fullLog string
		_ = s.db.QueryRow(`SELECT log FROM workflow_runs WHERE id=?`, runID).Scan(&fullLog)
		if offset < len(fullLog) {
			logBytes = []byte(fullLog[offset:])
		}
	}

	return &RunLogChunk{
		StepRuns:   stepRuns,
		LogText:    string(logBytes),
		NextOffset: offset + len(logBytes),
		Done:       done,
	}, nil
}

func (s *WorkflowService) loadStepRuns(runID string) ([]StepRunStatus, error) {
	rows, err := s.db.Query(
		`SELECT id,step_id,position,type,label,status,started_at,completed_at,log FROM workflow_step_runs WHERE run_id=? ORDER BY position`,
		runID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []StepRunStatus
	for rows.Next() {
		var sr StepRunStatus
		var startedAt, completedAt sql.NullInt64
		if err := rows.Scan(&sr.ID, &sr.StepID, &sr.Position, &sr.Type, &sr.Label, &sr.Status, &startedAt, &completedAt, &sr.Log); err != nil {
			return nil, err
		}
		if startedAt.Valid {
			sr.StartedAt = &startedAt.Int64
		}
		if completedAt.Valid {
			sr.CompletedAt = &completedAt.Int64
		}
		out = append(out, sr)
	}
	return out, rows.Err()
}

// ─── Execution engine ─────────────────────────────────────────────────────────

func (s *WorkflowService) executeRun(ctx context.Context, runID string, wf *Workflow, ar *activeRun, argValues map[string]string, startPosition int) {
	defer func() {
		s.activeRuns.Delete(runID)
		ar.cancel()
	}()

	finalStatus := "success"
	stopped := false
	stepVars := make(map[string]string) // shared state passed between steps (e.g. build version → deploy)
	for k, v := range argValues {
		stepVars[k] = v
	}

	for _, step := range wf.Steps {
		if step.Position < startPosition {
			// Pre-recorded as 'skipped' by RunWorkflow; nothing to execute or update.
			continue
		}

		var stepRunID string
		err := s.db.QueryRow(`SELECT id FROM workflow_step_runs WHERE run_id=? AND step_id=?`, runID, step.ID).Scan(&stepRunID)
		if err != nil {
			log.Printf("[workflow] %s: could not find step_run for step %s: %v", runID, step.ID, err)
			continue
		}

		if ctx.Err() != nil || stopped {
			now := time.Now().Unix()
			s.db.Exec(`UPDATE workflow_step_runs SET status='skipped',started_at=?,completed_at=? WHERE id=?`, now, now, stepRunID)
			continue
		}

		label := stepLabel(step)
		fmt.Fprintf(ar, "\n━━━ %s ━━━\n", label)

		startedAt := time.Now().Unix()
		s.db.Exec(`UPDATE workflow_step_runs SET status='running',started_at=? WHERE id=?`, startedAt, stepRunID)

		stepBuf := &bytes.Buffer{}
		w := io.MultiWriter(ar, stepBuf)

		start := time.Now()
		execErr := s.executeStep(ctx, step, stepVars, ar, w)
		elapsed := time.Since(start)
		completedAt := time.Now().Unix()

		var stepStatus string
		if execErr != nil {
			if ctx.Err() != nil {
				stepStatus = "failed"
				finalStatus = "stopped"
				stopped = true
			} else {
				stepStatus = "failed"
				finalStatus = "failed"
				fmt.Fprintf(w, "\n✗ failed: %v\n", execErr)
			}
		} else {
			stepStatus = "success"
			fmt.Fprintf(w, "\n✓ done in %.1fs\n", elapsed.Seconds())
		}

		s.db.Exec(
			`UPDATE workflow_step_runs SET status=?,log=?,completed_at=? WHERE id=?`,
			stepStatus, stepBuf.String(), completedAt, stepRunID,
		)

		if stepStatus == "failed" && step.OnFailure != "continue" {
			stopped = true
		}
	}

	// Mark any remaining pending steps as skipped
	now := time.Now().Unix()
	s.db.Exec(`UPDATE workflow_step_runs SET status='skipped',started_at=?,completed_at=? WHERE run_id=? AND status='pending'`, now, now, runID)

	// Flush full log to DB so PollRunLogs can serve it after the run struct is removed from activeRuns
	fullLog := string(ar.slice(0))
	s.db.Exec(`UPDATE workflow_runs SET status=?,log=?,completed_at=? WHERE id=?`, finalStatus, fullLog, now, runID)
}

func (s *WorkflowService) executeStep(ctx context.Context, step WorkflowStep, stepVars map[string]string, ar *activeRun, w io.Writer) error {
	var params map[string]interface{}
	if err := json.Unmarshal([]byte(step.Params), &params); err != nil {
		return fmt.Errorf("invalid step params: %w", err)
	}

	str := func(key string) string {
		v, _ := params[key].(string)
		return expandVars(v, stepVars)
	}

	switch step.Type {
	case "shell":
		return s.runShell(ctx, ar, str("command"), str("workdir"), w)

	case "define":
		neuron := str("neuron")
		if neuron == "" {
			return fmt.Errorf("define step: neuron param is required")
		}
		stepVars["last_define_neuron"] = neuron
		org, _, _, _ := parseNeuronResource(neuron)
		if home, err := os.UserHomeDir(); err == nil {
			stepVars["last_define_repo"] = filepath.Join(home, "alis.build", org, "define")
		}
		return s.executeDefine(ctx, neuron, str("commit"), w)

	case "build-cloud":
		neuron := str("neuron")
		if neuron == "" {
			return fmt.Errorf("build-cloud step: neuron param is required")
		}
		stepVars["last_build_neuron"] = neuron
		bOrg, bProduct, _, _ := parseNeuronResource(neuron)
		if home, err := os.UserHomeDir(); err == nil {
			stepVars["last_build_repo"] = filepath.Join(home, "alis.build", bOrg, "build", bProduct)
		}
		builtVersion, err := s.executeBuildCloud(ctx, neuron, str("commit"), w)
		if err == nil && builtVersion != "" {
			stepVars["last_build_version"] = builtVersion
		}
		return err

	case "upgrade-packages":
		var neurons []string
		if ns, ok := params["neurons"].([]interface{}); ok {
			for _, n := range ns {
				if nv, ok := n.(string); ok && nv != "" {
					neurons = append(neurons, nv)
				}
			}
		}
		if len(neurons) == 0 {
			return fmt.Errorf("upgrade-packages step: no neurons specified")
		}
		action := str("action")
		if action == "" {
			action = "upgrade_defined"
		}
		home, _ := os.UserHomeDir()
		var lastProductDir string
		for _, neuron := range neurons {
			shortName := neuron[strings.LastIndex(neuron, "/")+1:]
			writeSubTab(w, shortName, shortName)
			org, product, neuronID, version := parseNeuronResource(neuron)
			fmt.Fprintf(w, "━━ Preparing packages for %s\n", neuron)
			scripts, err := s.packageService.PreparePackageScripts(org, product, neuronID, version, false, nil)
			if err != nil {
				return fmt.Errorf("prepare packages for %s: %w", neuron, err)
			}
			if lastProductDir == "" {
				lastProductDir = filepath.Join(home, "alis.build", org, "build", product)
			}
			for _, script := range scripts {
				var cmd string
				switch action {
				case "upgrade_defined":
					cmd = script.UpgradeDefined
				case "upgrade":
					cmd = script.Upgrade
				case "install":
					cmd = script.Install
				case "add":
					cmd = script.Add
				}
				if cmd == "" {
					fmt.Fprintf(w, "  No %s command for %s, skipping\n", action, script.Name)
					continue
				}
				fmt.Fprintf(w, "  Running in %s\n", script.Name)
				if err := s.runShell(ctx, ar, cmd, script.WorkDir, w); err != nil {
					return fmt.Errorf("package script %s: %w", script.Name, err)
				}
			}
		}
		stepVars["last_upgrade_repo"] = lastProductDir
		stepVars["upgraded_neurons"] = strings.Join(neurons, ", ")
		return nil

	case "deploy":
		neuron := str("neuron")
		if neuron == "" {
			return fmt.Errorf("deploy step: neuron param is required")
		}
		version := str("version")
		if version == "" {
			version = stepVars["last_build_version"]
		}
		if version == "" {
			latest, err := s.deployService.ListNeuronVersions(neuron)
			if err != nil {
				return fmt.Errorf("deploy step: no build version specified and could not look up latest build: %w", err)
			}
			if len(latest) == 0 {
				return fmt.Errorf("deploy step: no build version specified and neuron has no built versions — run a Cloud Build first")
			}
			version = latest[0].Version
			fmt.Fprintf(w, "No build version specified, using latest build: %s\n", version)
		}
		var environments []string
		if envs, ok := params["environments"].([]interface{}); ok {
			for _, e := range envs {
				if es, ok := e.(string); ok && es != "" {
					environments = append(environments, es)
				}
			}
		}
		return s.executeDeploy(ctx, neuron, version, environments, w)

	case "git-stage-all":
		repoPath := resolveRepoPath(str("repoPath"), stepVars)
		fmt.Fprintf(w, "Staging all changes in %s\n", repoPath)
		return s.gitService.StageAll(repoPath)

	case "git-commit":
		repoPath := resolveRepoPath(str("repoPath"), stepVars)
		message := str("message")
		if message == "" {
			return fmt.Errorf("git-commit step: message param is required")
		}
		fmt.Fprintf(w, "Committing: %s\n", message)
		return s.gitService.Commit(repoPath, message)

	case "git-push":
		repoPath := resolveRepoPath(str("repoPath"), stepVars)
		fmt.Fprintf(w, "Pushing to origin...\n")
		result := s.gitService.PushOrigin(repoPath)
		if result.Kind == "error" || result.Kind == "push_rejected" {
			return fmt.Errorf("%s", result.Message)
		}
		if result.Message != "" {
			fmt.Fprintf(w, "%s\n", result.Message)
		}
		return nil

	case "git-pull":
		repoPath := resolveRepoPath(str("repoPath"), stepVars)
		fmt.Fprintf(w, "Pulling from origin...\n")
		result := s.gitService.PullOrigin(repoPath)
		if result.Kind == "error" {
			return fmt.Errorf("%s", result.Message)
		}
		if result.Kind == "conflict" {
			return fmt.Errorf("merge conflict in: %v", result.ConflictFiles)
		}
		if result.Message != "" {
			fmt.Fprintf(w, "%s\n", result.Message)
		}
		return nil

	case "wait":
		var seconds float64
		if v, ok := params["seconds"].(float64); ok {
			seconds = v
		} else {
			seconds = 5
		}
		fmt.Fprintf(w, "Waiting %.0fs...\n", seconds)
		select {
		case <-time.After(time.Duration(seconds * float64(time.Second))):
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}

	default:
		return fmt.Errorf("unknown step type: %s", step.Type)
	}
}

// runShell runs command in a PTY-backed login shell, matching the Develop tab
// (StartPackageScript in packageservice.go) so rc-file PATH setup (nvm, pnpm, etc.)
// is sourced the same way. A plain exec.Command with -c would skip that sourcing
// since many rc-file PATH snippets are gated on a real interactive terminal.
//
// The PTY is registered on ar for the duration of the command so SendRunInput
// can forward keystrokes to it — some commands (e.g. corepack's download
// confirmation) prompt interactively and would otherwise hang forever.
func (s *WorkflowService) runShell(ctx context.Context, ar *activeRun, command, workdir string, w io.Writer) error {
	if command == "" {
		return fmt.Errorf("shell step: command is empty")
	}
	fmt.Fprintf(w, "$ %s\n", command)

	shellBin, shellArgs := platformShell()
	cmd := exec.CommandContext(ctx, shellBin, shellArgs...)
	if workdir != "" {
		cmd.Dir = workdir
	}

	ptmx, err := terminal.Start(cmd, 24, 220)
	if err != nil {
		return err
	}
	if ar != nil {
		ar.setPTY(ptmx)
		defer ar.setPTY(nil)
	}

	go func() {
		time.Sleep(200 * time.Millisecond)
		ptmx.Write([]byte(command + platformShellExitSuffix() + "\n"))
	}()

	exitErrCh := make(chan error, 1)
	go func() {
		exitErrCh <- cmd.Wait()
		ptmx.Close()
	}()

	buf := make([]byte, 4096)
	for {
		n, rerr := ptmx.Read(buf)
		if n > 0 {
			w.Write(buf[:n])
		}
		if rerr != nil {
			break
		}
	}

	return <-exitErrCh
}

// parseNeuronResource splits "organisations/o/products/p/neurons/svc-v1" into
// (org="o", product="p", neuronID="svc", version="v1"), matching the build repo
// directory layout <neuronID>/<version>/ and the frontend parseNeuron() convention.
func parseNeuronResource(name string) (org, product, neuronID, version string) {
	parts := strings.Split(name, "/")
	raw := name
	if len(parts) == 6 {
		org, product, raw = parts[1], parts[3], parts[5]
	}
	// Split "svc-v2" → id="svc", ver="v2"; "svc.v2" → same; fallback to full+v1.
	verRe := regexp.MustCompile(`^(.+)[.-](v\d+)$`)
	if m := verRe.FindStringSubmatch(raw); m != nil {
		neuronID, version = m[1], m[2]
	} else {
		neuronID, version = raw, "v1"
	}
	return
}

func (s *WorkflowService) executeDefine(ctx context.Context, neuron, commit string, w io.Writer) error {
	if commit == "" {
		org, product, neuronID, version := parseNeuronResource(neuron)
		commits, err := s.defineService.GetDefineCommits(org, product, neuronID, version, 1)
		if err != nil || len(commits) == 0 {
			return fmt.Errorf("resolve latest define commit: %w", err)
		}
		commit = commits[0].SHA
		fmt.Fprintf(w, "Resolved latest commit: %s\n", commit[:min(8, len(commit))])
	}
	fmt.Fprintf(w, "Starting define: %s\n", neuron)
	result, err := s.defineService.RunDefine(neuron, commit, "")
	if err != nil {
		return fmt.Errorf("start define: %w", err)
	}
	if result.Error != "" {
		return fmt.Errorf("define: %s", result.Error)
	}
	fmt.Fprintf(w, "Operation: %s\nWaiting", result.OperationName)
	for !result.Done {
		select {
		case <-ctx.Done():
			fmt.Fprintf(w, "\n")
			return ctx.Err()
		case <-time.After(3 * time.Second):
		}
		fmt.Fprintf(w, ".")
		result, err = s.defineService.PollDefineOperation(result.OperationName)
		if err != nil {
			fmt.Fprintf(w, "\n")
			return fmt.Errorf("poll define: %w", err)
		}
		if result.Error != "" {
			fmt.Fprintf(w, "\n")
			return fmt.Errorf("define failed: %s", result.Error)
		}
	}
	fmt.Fprintf(w, "\n")
	if result.Version != "" {
		fmt.Fprintf(w, "Define complete. Version: %s\n", result.Version)
	} else {
		fmt.Fprintf(w, "Define complete.\n")
	}
	return nil
}

func (s *WorkflowService) executeBuildCloud(ctx context.Context, neuron, commit string, w io.Writer) (string, error) {
	if commit == "" {
		org, product, neuronID, version := parseNeuronResource(neuron)
		commits, err := s.buildService.GetBuildCommits(org, product, neuronID, version, "master", 1)
		if err != nil || len(commits) == 0 {
			return "", fmt.Errorf("resolve latest commit: %w", err)
		}
		commit = commits[0].SHA
		fmt.Fprintf(w, "Resolved latest commit: %s\n", commit[:min(8, len(commit))])
	}
	fmt.Fprintf(w, "Starting cloud build: %s\n", neuron)
	result, err := s.buildService.RunBuild(neuron, commit)
	if err != nil {
		return "", fmt.Errorf("start build: %w", err)
	}
	if result.Error != "" {
		return "", fmt.Errorf("build: %s", result.Error)
	}
	fmt.Fprintf(w, "Operation: %s\n", result.OperationName)

	var logOffset int64
	for !result.Done {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(3 * time.Second):
		}
		if result.LogsURL != "" {
			if lr, err := s.buildService.FetchBuildLogs(result.LogsURL, logOffset); err == nil && lr.Content != "" {
				fmt.Fprint(w, lr.Content)
				logOffset = lr.NextOffset
			}
		}
		result, err = s.buildService.PollBuildOperation(result.OperationName, neuron)
		if err != nil {
			return "", fmt.Errorf("poll build: %w", err)
		}
		if result.Error != "" {
			return "", fmt.Errorf("build failed: %s", result.Error)
		}
	}
	// Drain remaining logs
	if result.LogsURL != "" {
		if lr, err := s.buildService.FetchBuildLogs(result.LogsURL, logOffset); err == nil && lr.Content != "" {
			fmt.Fprint(w, lr.Content)
		}
	}
	fmt.Fprintf(w, "Build complete. Version: %s\n", result.Version)
	return result.Version, nil
}

func (s *WorkflowService) executeDeploy(ctx context.Context, neuron, version string, environments []string, w io.Writer) error {
	fmt.Fprintf(w, "Deploying %s @ %s to %v\n", neuron, version, environments)
	result, err := s.deployService.RunDeploy(neuron, version, environments, false, false)
	if err != nil {
		return fmt.Errorf("start deploy: %w", err)
	}
	if result.Error != "" {
		return fmt.Errorf("deploy: %s", result.Error)
	}
	fmt.Fprintf(w, "Operation: %s\n", result.OperationName)

	// Emit sub-tabs for all environments upfront so they appear immediately.
	for _, env := range environments {
		label := env[strings.LastIndex(env, "/")+1:]
		writeSubTab(w, label, label)
	}

	logOffsets := make([]int64, len(environments))
	for !result.Done {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(3 * time.Second):
		}
		for i, dep := range result.Deployments {
			if i >= len(environments) || dep.LogsURL == "" {
				continue
			}
			lr, lErr := s.deployService.FetchDeployLogs(dep.LogsURL, logOffsets[i])
			if lErr != nil || lr.Content == "" {
				continue
			}
			label := environments[i][strings.LastIndex(environments[i], "/")+1:]
			writeSubTab(w, label, label) // switch context to this env's tab
			fmt.Fprint(w, lr.Content)
			logOffsets[i] = lr.NextOffset
		}
		result, err = s.deployService.PollDeployOperation(result.OperationName)
		if err != nil {
			return fmt.Errorf("poll deploy: %w", err)
		}
		if result.Error != "" {
			return fmt.Errorf("deploy failed: %s", result.Error)
		}
	}
	// Drain remaining logs per environment
	for i, dep := range result.Deployments {
		if i >= len(environments) || dep.LogsURL == "" {
			continue
		}
		lr, lErr := s.deployService.FetchDeployLogs(dep.LogsURL, logOffsets[i])
		if lErr != nil || lr.Content == "" {
			continue
		}
		label := environments[i][strings.LastIndex(environments[i], "/")+1:]
		writeSubTab(w, label, label)
		fmt.Fprint(w, lr.Content)
	}
	fmt.Fprintf(w, "\nDeploy complete. Version: %s\n", result.Version)
	return nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func writeSubTab(w io.Writer, id, label string) {
	fmt.Fprintf(w, "\x1fTAB:%s\x1f%s\n", id, label)
}

func resolveRepoPath(val string, stepVars map[string]string) string {
	switch val {
	case "define-repo":
		return stepVars["last_define_repo"]
	case "build-repo":
		if p := stepVars["last_build_repo"]; p != "" {
			return p
		}
		return stepVars["last_upgrade_repo"]
	default:
		return val
	}
}

func expandVars(tmpl string, vars map[string]string) string {
	for k, v := range vars {
		tmpl = strings.ReplaceAll(tmpl, "{{"+k+"}}", v)
	}
	return tmpl
}

func stepLabel(step WorkflowStep) string {
	var params map[string]interface{}
	_ = json.Unmarshal([]byte(step.Params), &params)
	str := func(key string) string { v, _ := params[key].(string); return v }

	switch step.Type {
	case "shell":
		cmd := str("command")
		if len(cmd) > 50 {
			cmd = cmd[:50] + "…"
		}
		return "Shell: " + cmd
	case "define":
		if n := str("neuron"); n != "" {
			return "Define: " + n
		}
		return "Define Neuron"
	case "build-cloud":
		if n := str("neuron"); n != "" {
			return "Build: " + n
		}
		return "Cloud Build"
	case "deploy":
		if n := str("neuron"); n != "" {
			return "Deploy: " + n
		}
		return "Deploy"
	case "upgrade-packages":
		if ns, ok := params["neurons"].([]interface{}); ok && len(ns) > 0 {
			return fmt.Sprintf("Upgrade Packages (%d)", len(ns))
		}
		return "Upgrade Packages"
	case "git-stage-all":
		return "Git: Stage All"
	case "git-commit":
		if m := str("message"); m != "" {
			return "Git: Commit — " + m
		}
		return "Git: Commit"
	case "git-push":
		return "Git: Push"
	case "git-pull":
		return "Git: Pull"
	case "wait":
		if v, ok := params["seconds"].(float64); ok {
			return fmt.Sprintf("Wait %.0fs", v)
		}
		return "Wait"
	}
	return step.Type
}

func newWFID() string {
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err != nil {
		// crypto/rand failure is effectively unheard of; fall back to a
		// timestamp+counter mix so IDs stay unique even in that case.
		binary.BigEndian.PutUint64(raw[:], uint64(time.Now().UnixNano())+atomic.AddUint64(&wfIDCounter, 1))
	}
	b := make([]byte, 8)
	for i, v := range raw {
		b[i] = alphabet[v%byte(len(alphabet))]
	}
	return string(b)
}

var wfIDCounter uint64
