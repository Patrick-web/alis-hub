package main

import (
	"encoding/json"
	"testing"
)

// The timeline endpoint is heterogenous, so the mapping has to move each
// entry's scattered fields into the flat shape the frontend reads. These tests
// drive that mapping straight from JSON, the way Forgejo would hand it over.
func TestRawTimelineEventToEvent(t *testing.T) {
	comment := `{
		"id": 1, "type": "comment", "body": "looks good",
		"created_at": "2024-01-01T00:00:00Z",
		"user": {"login": "alice"}
	}`
	var c rawTimelineEvent
	if err := json.Unmarshal([]byte(comment), &c); err != nil {
		t.Fatal(err)
	}
	ev := c.toEvent()
	if ev.Type != "comment" || ev.Body != "looks good" || ev.Author != "alice" || ev.ID != 1 {
		t.Errorf("comment event = %+v", ev)
	}

	rename := `{
		"id": 3, "type": "change_title",
		"old_title": "Old", "new_title": "New",
		"created_at": "2024-01-03T00:00:00Z",
		"user": {"login": "carol"}
	}`
	var r rawTimelineEvent
	if err := json.Unmarshal([]byte(rename), &r); err != nil {
		t.Fatal(err)
	}
	ev = r.toEvent()
	if ev.Type != "change_title" || ev.OldTitle != "Old" || ev.NewTitle != "New" {
		t.Errorf("rename event = %+v", ev)
	}
}

func TestExpandTimeline(t *testing.T) {
	// A comment, a push carrying two commits, then another comment. The push's
	// body is Forgejo's PushActionContent JSON. Commit #2 is authored after the
	// trailing comment, so expanding and re-sorting must move it last.
	raws := []rawTimelineEvent{
		{ID: 1, Type: "comment", Body: "first", CreatedAt: "2024-01-01T00:00:00Z"},
		{ID: 2, Type: "pull_push", Body: `{"is_force_push":false,"commit_ids":["aaa","bbb"]}`,
			CreatedAt: "2024-01-02T00:00:00Z"},
		{ID: 3, Type: "comment", Body: "last", CreatedAt: "2024-01-03T00:00:00Z"},
	}
	raws[1].User.Login = "bob"

	commits := map[string]PRCommit{
		"aaa": {SHA: "aaa", Message: "one", Author: "bob", Timestamp: "2024-01-02T00:00:00Z"},
		"bbb": {SHA: "bbb", Message: "two", Author: "bob", Timestamp: "2024-01-05T00:00:00Z"},
	}

	events := expandTimeline(raws, commits)

	var order []string
	for _, e := range events {
		order = append(order, e.Type)
	}
	want := []string{"comment", "commit", "comment", "commit"}
	if len(events) != 4 {
		t.Fatalf("events = %d, want 4: %+v", len(events), events)
	}
	for i := range want {
		if order[i] != want[i] {
			t.Fatalf("order = %v, want %v", order, want)
		}
	}
	// Commit "two" (2024-01-05) must sort after the trailing comment (2024-01-03).
	if events[3].SHA != "bbb" || events[3].Message != "two" {
		t.Errorf("last event = %+v, want commit bbb", events[3])
	}
	if events[1].SHA != "aaa" || events[1].Message != "one" {
		t.Errorf("events[1] = %+v, want commit aaa", events[1])
	}

	// A force push renders as a single ref event, not per-commit entries.
	force := []rawTimelineEvent{
		{ID: 9, Type: "pull_push", Body: `{"is_force_push":true,"commit_ids":["old","new"]}`,
			CreatedAt: "2024-01-01T00:00:00Z"},
	}
	got := expandTimeline(force, commits)
	if len(got) != 1 || got[0].Type != "pull_push" || got[0].RefAction != "force-pushed" {
		t.Errorf("force push = %+v, want a single force-pushed event", got)
	}
}

func TestRawCommentToComment(t *testing.T) {
	raw := `{
		"id": 7, "body": "![shot](/attachments/uuid)",
		"html_url": "https://forgejo-1.example.com/owner/repo/issues/1#issuecomment-7",
		"created_at": "2024-01-01T00:00:00Z",
		"updated_at": "2024-01-01T00:01:00Z",
		"user": {"login": "alice"},
		"assets": [
			{"id": 10, "name": "shot.png", "size": 2048, "uuid": "uuid",
			 "browser_download_url": "https://forgejo-1.example.com/attachments/uuid",
			 "created_at": "2024-01-01T00:00:00Z"}
		]
	}`
	var c rawComment
	if err := json.Unmarshal([]byte(raw), &c); err != nil {
		t.Fatal(err)
	}
	got := c.toComment()
	if got.ID != 7 || got.Author != "alice" || got.HTMLURL == "" {
		t.Errorf("comment = %+v", got)
	}
	if len(got.Assets) != 1 {
		t.Fatalf("assets = %d, want 1", len(got.Assets))
	}
	a := got.Assets[0]
	if a.Name != "shot.png" || a.Size != 2048 || a.BrowserDownloadURL == "" {
		t.Errorf("attachment = %+v", a)
	}
}
