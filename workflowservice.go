package main

import (
	"bytes"
	"context"
	"database/sql"
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
	"time"

	_ "modernc.org/sqlite"
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

type Workflow struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	IsTemplate  bool           `json:"isTemplate"`
	CreatedAt   int64          `json:"createdAt"`
	UpdatedAt   int64          `json:"updatedAt"`
	Steps       []WorkflowStep `json:"steps"`
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

// ─── WorkflowService ──────────────────────────────────────────────────────────

type WorkflowService struct {
	db            *sql.DB
	buildService  *BuildService
	gitService    *GitService
	deployService *DeployService
	activeRuns    sync.Map // runId → *activeRun
}

func NewWorkflowService(bs *BuildService, gs *GitService, ds *DeployService) *WorkflowService {
	return &WorkflowService{
		buildService:  bs,
		gitService:    gs,
		deployService: ds,
	}
}

// Open opens (or creates) the SQLite database, runs migrations, and seeds default templates.
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
	return s.seedTemplates()
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

// ─── Default templates ────────────────────────────────────────────────────────

type templateSeed struct {
	id    string
	name  string
	desc  string
	steps []templateStepSeed
}

type templateStepSeed struct {
	id        string
	typ       string
	params    string
	onFailure string
}

var defaultTemplates = []templateSeed{
	{
		id:   "tpl-define",
		name: "Define Neurons",
		desc: "Run alis define on a neuron to regenerate its definition",
		steps: []templateStepSeed{
			{id: "tpl-define-s1", typ: "define", params: `{"neuron":"","workdir":""}`, onFailure: "stop"},
		},
	},
	{
		id:   "tpl-build",
		name: "Build Neurons",
		desc: "Trigger a cloud build for a neuron",
		steps: []templateStepSeed{
			{id: "tpl-build-s1", typ: "build-cloud", params: `{"neuron":"","commit":""}`, onFailure: "stop"},
		},
	},
	{
		id:   "tpl-define-build",
		name: "Define → Build",
		desc: "Define then build a neuron in sequence",
		steps: []templateStepSeed{
			{id: "tpl-db-s1", typ: "define", params: `{"neuron":"","workdir":""}`, onFailure: "stop"},
			{id: "tpl-db-s2", typ: "build-cloud", params: `{"neuron":"","commit":""}`, onFailure: "stop"},
		},
	},
	{
		id:   "tpl-git-commit-push",
		name: "Git: Commit & Push",
		desc: "Stage all, commit with a message, and push to origin",
		steps: []templateStepSeed{
			{id: "tpl-git-s1", typ: "git-stage-all", params: `{"repoPath":""}`, onFailure: "stop"},
			{id: "tpl-git-s2", typ: "git-commit", params: `{"repoPath":"","message":""}`, onFailure: "stop"},
			{id: "tpl-git-s3", typ: "git-push", params: `{"repoPath":""}`, onFailure: "stop"},
		},
	},
	{
		id:   "tpl-build-deploy",
		name: "Build & Deploy (Sequential)",
		desc: "Build a neuron then deploy it to one or more environments",
		steps: []templateStepSeed{
			{id: "tpl-bd-s1", typ: "build-cloud", params: `{"neuron":"","commit":""}`, onFailure: "stop"},
			{id: "tpl-bd-s2", typ: "deploy", params: `{"neuron":"","environments":[]}`, onFailure: "stop"},
		},
	},
}

func (s *WorkflowService) seedTemplates() error {
	now := time.Now().Unix()
	for _, t := range defaultTemplates {
		// Upsert the workflow row (INSERT OR IGNORE — never overwrite user edits)
		_, err := s.db.Exec(
			`INSERT OR IGNORE INTO workflows (id,name,description,is_template,created_at,updated_at) VALUES (?,?,?,1,?,?)`,
			t.id, t.name, t.desc, now, now,
		)
		if err != nil {
			return fmt.Errorf("seed template %s: %w", t.id, err)
		}
		// Upsert steps (replace to pick up step additions in new app versions)
		for i, st := range t.steps {
			onFail := st.onFailure
			if onFail == "" {
				onFail = "stop"
			}
			_, err = s.db.Exec(
				`INSERT OR REPLACE INTO workflow_steps (id,workflow_id,position,type,params,on_failure) VALUES (?,?,?,?,?,?)`,
				st.id, t.id, i, st.typ, st.params, onFail,
			)
			if err != nil {
				return fmt.Errorf("seed step %s: %w", st.id, err)
			}
		}
	}
	return nil
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

func (s *WorkflowService) ListWorkflows() ([]Workflow, error) {
	rows, err := s.db.Query(`SELECT id,name,description,is_template,created_at,updated_at FROM workflows ORDER BY is_template DESC, created_at ASC`)
	if err != nil {
		return nil, err
	}
	// Drain rows before making nested queries — single connection would deadlock otherwise.
	var out []Workflow
	for rows.Next() {
		var w Workflow
		var isT int
		if err := rows.Scan(&w.ID, &w.Name, &w.Description, &isT, &w.CreatedAt, &w.UpdatedAt); err != nil {
			rows.Close()
			return nil, err
		}
		w.IsTemplate = isT == 1
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
	err := s.db.QueryRow(
		`SELECT id,name,description,is_template,created_at,updated_at FROM workflows WHERE id=?`, id,
	).Scan(&w.ID, &w.Name, &w.Description, &isT, &w.CreatedAt, &w.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("workflow not found: %s", id)
	}
	if err != nil {
		return nil, err
	}
	w.IsTemplate = isT == 1
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
	if _, err := tx.Exec(
		`INSERT INTO workflows (id,name,description,is_template,created_at,updated_at) VALUES (?,?,?,0,?,?)`,
		id, params.Name, params.Description, now, now,
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
	if _, err := tx.Exec(
		`UPDATE workflows SET name=?,description=?,updated_at=? WHERE id=?`,
		params.Name, params.Description, now, id,
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
	})
}

// ─── Execution ────────────────────────────────────────────────────────────────

func (s *WorkflowService) RunWorkflow(id string) (string, error) {
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

	go s.executeRun(ctx, runID, wf, ar)
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
		`SELECT id,step_id,position,type,label,status,started_at,completed_at FROM workflow_step_runs WHERE run_id=? ORDER BY position`,
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
		if err := rows.Scan(&sr.ID, &sr.StepID, &sr.Position, &sr.Type, &sr.Label, &sr.Status, &startedAt, &completedAt); err != nil {
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

func (s *WorkflowService) executeRun(ctx context.Context, runID string, wf *Workflow, ar *activeRun) {
	defer func() {
		s.activeRuns.Delete(runID)
		ar.cancel()
	}()

	finalStatus := "success"
	stopped := false
	stepVars := make(map[string]string) // shared state passed between steps (e.g. build version → deploy)

	for _, step := range wf.Steps {
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
		execErr := s.executeStep(ctx, step, stepVars, w)
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
				fmt.Fprintf(ar, "\n✗ failed: %v\n", execErr)
			}
		} else {
			stepStatus = "success"
			fmt.Fprintf(ar, "\n✓ done in %.1fs\n", elapsed.Seconds())
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

func (s *WorkflowService) executeStep(ctx context.Context, step WorkflowStep, stepVars map[string]string, w io.Writer) error {
	var params map[string]interface{}
	if err := json.Unmarshal([]byte(step.Params), &params); err != nil {
		return fmt.Errorf("invalid step params: %w", err)
	}

	str := func(key string) string {
		v, _ := params[key].(string)
		return v
	}

	switch step.Type {
	case "shell":
		return s.runShell(ctx, str("command"), str("workdir"), w)

	case "define":
		neuron := str("neuron")
		if neuron == "" {
			return fmt.Errorf("define step: neuron param is required")
		}
		return s.runShell(ctx, "alis define "+neuron, str("workdir"), w)

	case "build-cloud":
		neuron := str("neuron")
		if neuron == "" {
			return fmt.Errorf("build-cloud step: neuron param is required")
		}
		builtVersion, err := s.executeBuildCloud(ctx, neuron, str("commit"), w)
		if err == nil && builtVersion != "" {
			stepVars["last_build_version"] = builtVersion
		}
		return err

	case "deploy":
		neuron := str("neuron")
		if neuron == "" {
			return fmt.Errorf("deploy step: neuron param is required")
		}
		version := stepVars["last_build_version"]
		if version == "" {
			return fmt.Errorf("deploy step: no build version available — add a Cloud Build step before Deploy")
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
		repoPath := str("repoPath")
		fmt.Fprintf(w, "Staging all changes in %s\n", repoPath)
		return s.gitService.StageAll(repoPath)

	case "git-commit":
		repoPath := str("repoPath")
		message := str("message")
		if message == "" {
			return fmt.Errorf("git-commit step: message param is required")
		}
		fmt.Fprintf(w, "Committing: %s\n", message)
		return s.gitService.Commit(repoPath, message)

	case "git-push":
		repoPath := str("repoPath")
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
		repoPath := str("repoPath")
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

func (s *WorkflowService) runShell(ctx context.Context, command, workdir string, w io.Writer) error {
	if command == "" {
		return fmt.Errorf("shell step: command is empty")
	}
	fmt.Fprintf(w, "$ %s\n", command)
	cmd := exec.CommandContext(ctx, "sh", "-c", command)
	if workdir != "" {
		cmd.Dir = workdir
	}
	cmd.Stdout = w
	cmd.Stderr = w
	return cmd.Run()
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

	var logOffset int64
	for !result.Done {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(3 * time.Second):
		}
		if len(result.Deployments) > 0 && result.Deployments[0].LogsURL != "" {
			if lr, err := s.deployService.FetchDeployLogs(result.Deployments[0].LogsURL, logOffset); err == nil && lr.Content != "" {
				fmt.Fprint(w, lr.Content)
				logOffset = lr.NextOffset
			}
		}
		result, err = s.deployService.PollDeployOperation(result.OperationName)
		if err != nil {
			return fmt.Errorf("poll deploy: %w", err)
		}
		if result.Error != "" {
			return fmt.Errorf("deploy failed: %s", result.Error)
		}
	}
	// Drain remaining logs
	if len(result.Deployments) > 0 && result.Deployments[0].LogsURL != "" {
		if lr, err := s.deployService.FetchDeployLogs(result.Deployments[0].LogsURL, logOffset); err == nil && lr.Content != "" {
			fmt.Fprint(w, lr.Content)
		}
	}
	fmt.Fprintf(w, "Deploy complete. Version: %s\n", result.Version)
	return nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
	b := make([]byte, 8)
	for i := range b {
		b[i] = "abcdefghijklmnopqrstuvwxyz0123456789"[time.Now().UnixNano()>>uint(i*5)&35]
	}
	return string(b)
}
