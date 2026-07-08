package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// OpenHubDB opens (or creates) the shared AlisHub SQLite database
// (workflows + settings) and runs all pending migrations.
func OpenHubDB() (*sql.DB, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return nil, fmt.Errorf("config dir: %w", err)
	}
	appDir := filepath.Join(dir, "AlisHub")
	if err := os.MkdirAll(appDir, 0700); err != nil {
		return nil, fmt.Errorf("create config dir: %w", err)
	}
	db, err := sql.Open("sqlite", filepath.Join(appDir, "hub.db"))
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;"); err != nil {
		return nil, fmt.Errorf("db pragma: %w", err)
	}
	if err := runMigrations(db); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return db, nil
}

// ─── Migrations ───────────────────────────────────────────────────────────────

var migrations = []string{
	// v1 — initial workflow schema
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
	// v4 — generic settings key/value store, migrated from frontend localStorage
	`CREATE TABLE IF NOT EXISTS settings (
		key        TEXT PRIMARY KEY,
		value      TEXT NOT NULL,
		updated_at INTEGER NOT NULL
	);`,
}

func runMigrations(db *sql.DB) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS hub_meta (schema_version INTEGER PRIMARY KEY)`); err != nil {
		return err
	}
	var version int
	_ = db.QueryRow(`SELECT COALESCE(MAX(schema_version),0) FROM hub_meta`).Scan(&version)
	for i, m := range migrations {
		v := i + 1
		if v <= version {
			continue
		}
		if _, err := db.Exec(m); err != nil {
			return fmt.Errorf("migration v%d: %w", v, err)
		}
		if _, err := db.Exec(`INSERT OR REPLACE INTO hub_meta VALUES (?)`, v); err != nil {
			return fmt.Errorf("bump schema_version: %w", err)
		}
		log.Printf("[hubdb] applied migration v%d", v)
	}
	return nil
}
