package main

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"

	"alis-hub-v3/internal/appflavor"
)

// writeStableDB builds a stable-flavor hub.db holding one settings row.
func writeStableDB(t *testing.T, configDir, value string) string {
	t.Helper()
	dir := filepath.Join(configDir, appflavor.StableConfigDirName())
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "hub.db")

	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	// WAL specifically: a naive file copy of a WAL database can miss the most
	// recent writes, which is why seeding uses VACUUM INTO.
	if _, err := db.Exec(`PRAGMA journal_mode=WAL`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO settings VALUES (?, ?, ?)`, "alis:accent", value, time.Now().Unix()); err != nil {
		t.Fatal(err)
	}
	return path
}

func readSetting(t *testing.T, path, key string) (string, bool) {
	t.Helper()
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var value string
	err = db.QueryRow(`SELECT value FROM settings WHERE key = ?`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", false
	}
	if err != nil {
		t.Fatal(err)
	}
	return value, true
}

func useVersion(t *testing.T, v string) {
	t.Helper()
	old := version
	version = v
	t.Cleanup(func() { version = old })
}

func TestSeedFromStable(t *testing.T) {
	t.Run("copies the stable database into a fresh beta install", func(t *testing.T) {
		useVersion(t, "v0.15.0-beta.1")
		configDir := t.TempDir()
		writeStableDB(t, configDir, "violet")

		betaDir := filepath.Join(configDir, appflavor.ConfigDirName(version))
		if err := os.MkdirAll(betaDir, 0o700); err != nil {
			t.Fatal(err)
		}
		betaPath := filepath.Join(betaDir, "hub.db")

		if err := seedFromStable(configDir, betaPath); err != nil {
			t.Fatalf("seedFromStable() = %v", err)
		}
		got, ok := readSetting(t, betaPath, "alis:accent")
		if !ok || got != "violet" {
			t.Errorf("seeded setting = %q (present=%v), want %q", got, ok, "violet")
		}
	})

	t.Run("never overwrites an existing beta database", func(t *testing.T) {
		useVersion(t, "v0.15.0-beta.1")
		configDir := t.TempDir()
		writeStableDB(t, configDir, "violet")

		betaDir := filepath.Join(configDir, appflavor.ConfigDirName(version))
		if err := os.MkdirAll(betaDir, 0o700); err != nil {
			t.Fatal(err)
		}
		betaPath := filepath.Join(betaDir, "hub.db")

		// Seed once, then diverge: the beta's own choice must survive.
		if err := seedFromStable(configDir, betaPath); err != nil {
			t.Fatal(err)
		}
		db, err := sql.Open("sqlite", betaPath)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(`UPDATE settings SET value = ? WHERE key = ?`, "amber", "alis:accent"); err != nil {
			t.Fatal(err)
		}
		db.Close()

		if err := seedFromStable(configDir, betaPath); err != nil {
			t.Fatalf("second seedFromStable() = %v", err)
		}
		if got, _ := readSetting(t, betaPath, "alis:accent"); got != "amber" {
			t.Errorf("setting = %q after re-seeding, want the beta's own value %q", got, "amber")
		}
	})

	t.Run("is a no-op for the stable flavor", func(t *testing.T) {
		useVersion(t, "v0.14.7")
		configDir := t.TempDir()
		writeStableDB(t, configDir, "violet")

		target := filepath.Join(configDir, "somewhere-else.db")
		if err := seedFromStable(configDir, target); err != nil {
			t.Fatalf("seedFromStable() = %v", err)
		}
		if _, err := os.Stat(target); !os.IsNotExist(err) {
			t.Error("stable flavor wrote a seed database; it should do nothing")
		}
	})

	t.Run("starts empty when there is no stable install", func(t *testing.T) {
		useVersion(t, "v0.15.0-beta.1")
		configDir := t.TempDir() // no stable hub.db at all

		betaDir := filepath.Join(configDir, appflavor.ConfigDirName(version))
		if err := os.MkdirAll(betaDir, 0o700); err != nil {
			t.Fatal(err)
		}
		betaPath := filepath.Join(betaDir, "hub.db")

		if err := seedFromStable(configDir, betaPath); err != nil {
			t.Fatalf("seedFromStable() = %v, want nil when there is nothing to copy", err)
		}
		if _, err := os.Stat(betaPath); !os.IsNotExist(err) {
			t.Error("seeded a database despite there being no stable install")
		}
	})
}

// The whole point of the split: a migration applied by the beta must not be
// visible to stable.
func TestBetaAndStableDatabasesAreSeparate(t *testing.T) {
	configDir := t.TempDir()
	stablePath := writeStableDB(t, configDir, "violet")

	useVersion(t, "v0.15.0-beta.1")
	betaDir := filepath.Join(configDir, appflavor.ConfigDirName(version))
	if err := os.MkdirAll(betaDir, 0o700); err != nil {
		t.Fatal(err)
	}
	betaPath := filepath.Join(betaDir, "hub.db")
	if err := seedFromStable(configDir, betaPath); err != nil {
		t.Fatal(err)
	}
	if stablePath == betaPath {
		t.Fatal("beta and stable resolved to the same database path")
	}

	// Beta applies a schema change.
	beta, err := sql.Open("sqlite", betaPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := beta.Exec(`ALTER TABLE settings ADD COLUMN flavor TEXT NOT NULL DEFAULT 'beta'`); err != nil {
		t.Fatal(err)
	}
	beta.Close()

	// Stable must be untouched by it.
	stable, err := sql.Open("sqlite", stablePath)
	if err != nil {
		t.Fatal(err)
	}
	defer stable.Close()
	if err := stable.QueryRow(`SELECT flavor FROM settings LIMIT 1`).Scan(new(string)); err == nil {
		t.Error("the beta's schema change leaked into the stable database")
	}
}
