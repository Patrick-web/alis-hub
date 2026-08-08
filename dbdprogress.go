package main

import (
	"context"
	"log"
	"sync"
	"time"

	"alis-hub-v3/internal/cliwrap"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// Live progress for long-running DBD operations.
//
// The CLI streams one NDJSON progress event per state change to stderr while
// `alis operations wait` blocks server-side. That is the supported way to
// follow an operation, and it is strictly better than sleep-polling
// `operations describe`: no fixed interval to trade latency against load, and
// state changes arrive as they happen.
//
// This runs *alongside* the existing poll loop rather than replacing it. The
// frontend keeps polling as its source of truth, so nothing breaks if the
// stream dies or the CLI is unavailable; these events only make the UI livelier
// in between polls. Once the UI consumes them, the poll interval can be
// relaxed.
//
// Events emitted, all carrying {operation, kind, version, notes, state, logsUri}:
//
//	dbd:progress  — a state change while the operation runs
//	dbd:done      — the operation finished (check `error`)
const (
	eventDBDProgress = "dbd:progress"
	eventDBDDone     = "dbd:done"
)

// progressStreamTimeout caps a single follow. Builds and deploys can legitimately
// run for a long time; this only bounds the streaming goroutine, never the
// operation, which continues server-side regardless.
const progressStreamTimeout = 45 * time.Minute

// DBDProgress is one progress notification sent to the frontend.
type DBDProgress struct {
	// Operation is the operations/<id> name, so a listener can match an event
	// to the run it started.
	Operation string `json:"operation"`
	// Kind is "define", "build" or "deploy".
	Kind    string `json:"kind"`
	Version string `json:"version"`
	Notes   string `json:"notes"`
	State   string `json:"state"`
	LogsURI string `json:"logsUri"`
	Done    bool   `json:"done"`
	Error   string `json:"error,omitempty"`
}

// progressStreamer follows operations and emits Wails events for them.
type progressStreamer struct {
	mu     sync.Mutex
	app    *application.App
	runner *cliwrap.Runner
	active map[string]context.CancelFunc
}

func newProgressStreamer() *progressStreamer {
	return &progressStreamer{active: make(map[string]context.CancelFunc)}
}

func (p *progressStreamer) setApp(app *application.App) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.app = app
}

func (p *progressStreamer) setRunner(r *cliwrap.Runner) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.runner = r
}

func (p *progressStreamer) emit(name string, ev DBDProgress) {
	p.mu.Lock()
	app := p.app
	p.mu.Unlock()
	if app == nil {
		return
	}
	app.Event.Emit(name, ev)
}

// Follow starts streaming an operation's progress in the background. It is a
// no-op when the CLI is unavailable, when no app is attached, or when the same
// operation is already being followed — so callers can invoke it
// unconditionally right after starting an operation.
func (p *progressStreamer) Follow(opName, kind string) {
	if opName == "" {
		return
	}
	if err := cliwrap.ValidateOperationName(opName); err != nil {
		log.Printf("[dbd] not following %q: %v", opName, err)
		return
	}

	p.mu.Lock()
	runner, app := p.runner, p.app
	if runner == nil || app == nil {
		p.mu.Unlock()
		return
	}
	if _, exists := p.active[opName]; exists {
		p.mu.Unlock()
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), progressStreamTimeout)
	p.active[opName] = cancel
	p.mu.Unlock()

	go func() {
		defer func() {
			cancel()
			p.mu.Lock()
			delete(p.active, opName)
			p.mu.Unlock()
		}()

		state, err := runner.Wait(ctx, opName, func(ev cliwrap.ProgressEvent) {
			p.emit(eventDBDProgress, DBDProgress{
				Operation: opName,
				Kind:      kind,
				Version:   ev.Version,
				Notes:     ev.Notes,
				State:     ev.State,
				LogsURI:   ev.LogsURI,
				Done:      ev.Done,
				Error:     ev.Error,
			})
		})
		if err != nil {
			// The poll loop remains the source of truth, so a broken stream is
			// worth a log line but must not surface as a failed operation.
			log.Printf("[dbd] progress stream for %s ended: %v", opName, err)
			return
		}

		p.emit(eventDBDDone, DBDProgress{
			Operation: opName,
			Kind:      kind,
			Version:   state.Version,
			Notes:     state.Notes,
			LogsURI:   state.LogsURI,
			Done:      state.Done,
			Error:     state.Error,
		})
	}()
}

// StopAll cancels every in-flight stream. Cancelling a wait does not cancel the
// server-side operation — re-attaching later resumes from wherever it is.
func (p *progressStreamer) StopAll() {
	p.mu.Lock()
	defer p.mu.Unlock()
	for name, cancel := range p.active {
		cancel()
		delete(p.active, name)
	}
}

// dbdProgress is the process-wide streamer, shared by the three DBD services.
var dbdProgress = newProgressStreamer()
