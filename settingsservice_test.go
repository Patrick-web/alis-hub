package main

import (
	"database/sql"
	"testing"
)

func TestSettingsServiceCRUD(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)"); err != nil {
		t.Fatalf("create table: %v", err)
	}
	defer db.Close()

	svc := NewSettingsService(db)

	// Get non-existent key.
	val, err := svc.GetSetting("nonexistent")
	if err != nil {
		t.Errorf("GetSetting(nonexistent) error = %v", err)
	}
	if val != "" {
		t.Errorf("GetSetting(nonexistent) = %q, want empty", val)
	}

	// Set and get.
	if err := svc.SetSetting("theme", "dark"); err != nil {
		t.Fatalf("SetSetting: %v", err)
	}
	val, err = svc.GetSetting("theme")
	if err != nil {
		t.Fatalf("GetSetting: %v", err)
	}
	if val != "dark" {
		t.Errorf("GetSetting(theme) = %q, want dark", val)
	}

	// Update existing key.
	if err := svc.SetSetting("theme", "light"); err != nil {
		t.Fatalf("SetSetting update: %v", err)
	}
	val, _ = svc.GetSetting("theme")
	if val != "light" {
		t.Errorf("GetSetting(theme) after update = %q, want light", val)
	}

	// Multiple keys.
	svc.SetSetting("font", "mono")
	svc.SetSetting("size", "14")
	all, err := svc.GetAllSettings()
	if err != nil {
		t.Fatalf("GetAllSettings: %v", err)
	}
	if len(all) != 3 {
		t.Errorf("GetAllSettings len = %d, want 3", len(all))
	}
	if all["theme"] != "light" {
		t.Errorf("all[theme] = %q, want light", all["theme"])
	}

	// Delete.
	if err := svc.DeleteSetting("font"); err != nil {
		t.Fatalf("DeleteSetting: %v", err)
	}
	val, _ = svc.GetSetting("font")
	if val != "" {
		t.Errorf("GetSetting(font) after delete = %q, want empty", val)
	}

	// GetAll after delete.
	all, _ = svc.GetAllSettings()
	if len(all) != 2 {
		t.Errorf("GetAllSettings after delete len = %d, want 2", len(all))
	}
	if _, ok := all["font"]; ok {
		t.Error("font should not be in settings after delete")
	}
}

func TestSettingsServiceDeleteNonExistent(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)"); err != nil {
		t.Fatalf("create table: %v", err)
	}
	defer db.Close()

	svc := NewSettingsService(db)
	// Deleting a non-existent key should not error.
	if err := svc.DeleteSetting("never_set"); err != nil {
		t.Errorf("DeleteSetting(never_set) error = %v, want nil", err)
	}
}

func TestSettingsServiceEmptyTable(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)"); err != nil {
		t.Fatalf("create table: %v", err)
	}
	defer db.Close()

	svc := NewSettingsService(db)
	all, err := svc.GetAllSettings()
	if err != nil {
		t.Fatalf("GetAllSettings: %v", err)
	}
	if len(all) != 0 {
		t.Errorf("GetAllSettings empty table len = %d, want 0", len(all))
	}
}
