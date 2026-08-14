package updater

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"alis-hub-v3/internal/appflavor"
)

func TestChannelIsPinnedToTheBuild(t *testing.T) {
	tests := []struct {
		name    string
		version string
		want    string
		beta    bool
	}{
		{name: "stable release", version: "v0.14.7", want: ChannelStable},
		{name: "beta release", version: "v0.15.0-beta.1", want: ChannelBeta, beta: true},
		{name: "release candidate", version: "v1.0.0-rc.2", want: ChannelBeta, beta: true},
		{name: "dev build behaves like stable", version: "dev", want: ChannelStable},
		{name: "empty version", version: "", want: ChannelStable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := NewService(tt.version)
			if got := s.Channel(); got != tt.want {
				t.Errorf("Channel() = %q, want %q", got, tt.want)
			}
			if got := s.IsBeta(); got != tt.beta {
				t.Errorf("IsBeta() = %v, want %v", got, tt.beta)
			}
		})
	}
}

// The flavor override exists so a dev build can exercise the beta identity.
func TestFlavorEnvOverride(t *testing.T) {
	t.Setenv(appflavor.FlavorEnv, "beta")
	if got := NewService("v0.14.7").Channel(); got != ChannelBeta {
		t.Errorf("Channel() = %q with %s=beta, want %q", got, appflavor.FlavorEnv, ChannelBeta)
	}

	t.Setenv(appflavor.FlavorEnv, "stable")
	if got := NewService("v0.15.0-beta.1").Channel(); got != ChannelStable {
		t.Errorf("Channel() = %q with %s=stable, want %q", got, appflavor.FlavorEnv, ChannelStable)
	}
}

// releaseServer stands in for the Cloudflare Worker. It records the channel
// each request asked for and answers with the release registered for it.
type releaseServer struct {
	*httptest.Server
	requested []string
}

func newReleaseServer(t *testing.T, byChannel map[string]workerRelease) *releaseServer {
	t.Helper()
	rs := &releaseServer{}
	rs.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		channel := r.URL.Query().Get("channel")
		rs.requested = append(rs.requested, channel)
		rel, ok := byChannel[channel]
		if !ok {
			http.Error(w, "no release for channel "+channel, http.StatusBadGateway)
			return
		}
		rel.Channel = channel
		_ = json.NewEncoder(w).Encode(rel)
	}))
	t.Cleanup(rs.Close)

	old := workerBase
	workerBase = rs.URL
	t.Cleanup(func() { workerBase = old })
	return rs
}

func TestCheckForUpdateUsesTheBuildsChannel(t *testing.T) {
	stable := workerRelease{Version: "v0.14.8", URL: "https://example.test/stable", Notes: "stable notes"}
	beta := workerRelease{Version: "v0.15.0-beta.1", URL: "https://example.test/beta", Notes: "beta notes", Prerelease: true}

	tests := []struct {
		name          string
		current       string
		wantRequested string
		wantAvailable bool
		wantLatest    string
		wantPre       bool
	}{
		{
			name:          "stable build never sees a prerelease",
			current:       "v0.14.7",
			wantRequested: ChannelStable,
			wantAvailable: true,
			wantLatest:    "0.14.8",
		},
		{
			name:          "beta build follows the beta line",
			current:       "v0.15.0-beta.0",
			wantRequested: ChannelBeta,
			wantAvailable: true,
			wantLatest:    "0.15.0-beta.1",
			wantPre:       true,
		},
		{
			name:          "beta build already ahead of the offered prerelease",
			current:       "v0.15.0-beta.3",
			wantRequested: ChannelBeta,
			wantAvailable: false,
			wantLatest:    "0.15.0-beta.1",
			wantPre:       true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newReleaseServer(t, map[string]workerRelease{
				ChannelStable: stable,
				ChannelBeta:   beta,
			})
			s := NewService(tt.current)

			info, err := s.CheckForUpdate()
			if err != nil {
				t.Fatalf("CheckForUpdate() error = %v", err)
			}
			if len(srv.requested) != 1 || srv.requested[0] != tt.wantRequested {
				t.Errorf("worker asked for channels %v, want [%s]", srv.requested, tt.wantRequested)
			}
			if info.Available != tt.wantAvailable {
				t.Errorf("Available = %v, want %v", info.Available, tt.wantAvailable)
			}
			if info.LatestVersion != tt.wantLatest {
				t.Errorf("LatestVersion = %q, want %q", info.LatestVersion, tt.wantLatest)
			}
			if info.IsPrerelease != tt.wantPre {
				t.Errorf("IsPrerelease = %v, want %v", info.IsPrerelease, tt.wantPre)
			}
		})
	}
}

// A beta user must be carried onto the stable release once it ships, because
// semver ranks 0.15.0 above 0.15.0-beta.3.
func TestBetaIsSupersededByItsStableRelease(t *testing.T) {
	newReleaseServer(t, map[string]workerRelease{
		ChannelBeta: {Version: "v0.15.0", URL: "https://example.test/stable"},
	})
	s := NewService("v0.15.0-beta.3")

	info, err := s.CheckForUpdate()
	if err != nil {
		t.Fatalf("CheckForUpdate() error = %v", err)
	}
	if !info.Available {
		t.Error("Available = false, want true: v0.15.0 supersedes v0.15.0-beta.3")
	}
	if info.LatestVersion != "0.15.0" {
		t.Errorf("LatestVersion = %q, want %q", info.LatestVersion, "0.15.0")
	}
}

func TestBetaRelease(t *testing.T) {
	t.Run("advertises a genuine prerelease to the stable build", func(t *testing.T) {
		srv := newReleaseServer(t, map[string]workerRelease{
			ChannelBeta: {Version: "v0.15.0-beta.1", URL: "https://example.test/beta", Prerelease: true},
		})
		s := NewService("v0.14.7")

		info, err := s.BetaRelease()
		if err != nil {
			t.Fatalf("BetaRelease() error = %v", err)
		}
		if len(srv.requested) != 1 || srv.requested[0] != ChannelBeta {
			t.Errorf("worker asked for channels %v, want [beta]", srv.requested)
		}
		if !info.Available {
			t.Error("Available = false, want true")
		}
		if info.LatestVersion != "0.15.0-beta.1" {
			t.Errorf("LatestVersion = %q, want %q", info.LatestVersion, "0.15.0-beta.1")
		}
	})

	// With no beta published the beta channel resolves to the stable release,
	// which must not be advertised as "the beta".
	t.Run("stays quiet when no beta is published", func(t *testing.T) {
		newReleaseServer(t, map[string]workerRelease{
			ChannelBeta: {Version: "v0.14.7", URL: "https://example.test/stable", Prerelease: false},
		})
		s := NewService("v0.14.7")

		info, err := s.BetaRelease()
		if err != nil {
			t.Fatalf("BetaRelease() error = %v", err)
		}
		if info.Available {
			t.Error("Available = true, want false: the beta channel resolved to a stable release")
		}
	})
}

// A beta build's release is not reachable from /releases/latest, so the menu
// item has to open the release resolved by the last check.
func TestOpenReleasePageRemembersTheResolvedRelease(t *testing.T) {
	s := NewService("v0.14.7")
	s.mu.Lock()
	got := s.lastRelURL
	s.mu.Unlock()
	if got != "" {
		t.Fatalf("lastRelURL = %q on a fresh service, want empty", got)
	}

	newReleaseServer(t, map[string]workerRelease{
		ChannelBeta: {Version: "v0.15.0-beta.1", URL: "https://example.test/beta", Prerelease: true},
	})
	s = NewService("v0.15.0-beta.0")
	if _, err := s.CheckForUpdate(); err != nil {
		t.Fatalf("CheckForUpdate() error = %v", err)
	}
	s.mu.Lock()
	got = s.lastRelURL
	s.mu.Unlock()
	if got != "https://example.test/beta" {
		t.Errorf("lastRelURL = %q, want the resolved prerelease URL", got)
	}
}

func TestIsTranslocated(t *testing.T) {
	translocated := "/private/var/folders/ab/cd/AppTranslocation/1a2b/d/AlisHub Beta.app"
	if !isTranslocated(translocated) {
		t.Errorf("isTranslocated(%q) = false, want true", translocated)
	}
	for _, p := range []string{
		"/Applications/AlisHub Beta.app",
		"/Users/jp/Downloads/AlisHub Beta.app",
	} {
		if isTranslocated(p) {
			t.Errorf("isTranslocated(%q) = true, want false", p)
		}
	}
}

func TestRelocatableAppError(t *testing.T) {
	if err := relocatableAppError("/private/var/folders/x/AppTranslocation/1a2b/d/AlisHub Beta.app"); err == nil {
		t.Error("translocated bundle passed, want an error")
	} else if !strings.Contains(err.Error(), "Applications") {
		t.Errorf("error %q does not point the user at Applications", err)
	}

	if err := relocatableAppError(filepath.Join(t.TempDir(), "nonexistent", "AlisHub Beta.app")); err == nil {
		t.Error("bundle in a missing directory passed, want an error")
	}

	dir := t.TempDir()
	if err := relocatableAppError(filepath.Join(dir, "AlisHub Beta.app")); err != nil {
		t.Errorf("writable bundle dir returned error %v, want nil", err)
	}
}

func TestDirWritable(t *testing.T) {
	if !dirWritable(t.TempDir()) {
		t.Error("dirWritable = false for a fresh temp dir, want true")
	}
	if dirWritable(filepath.Join(t.TempDir(), "missing")) {
		t.Error("dirWritable = true for a nonexistent dir, want false")
	}
}
