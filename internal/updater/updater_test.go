package updater

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// fakeStore is an in-memory SettingsStore. A nil map models a store that has
// never been written to.
type fakeStore struct {
	values  map[string]string
	getErr  error
	setErr  error
	setCall int
}

func (f *fakeStore) GetSetting(key string) (string, error) {
	if f.getErr != nil {
		return "", f.getErr
	}
	return f.values[key], nil
}

func (f *fakeStore) SetSetting(key, value string) error {
	f.setCall++
	if f.setErr != nil {
		return f.setErr
	}
	if f.values == nil {
		f.values = map[string]string{}
	}
	f.values[key] = value
	return nil
}

func TestChannelDefaultsToStable(t *testing.T) {
	tests := []struct {
		name  string
		store SettingsStore
		want  string
	}{
		{name: "no settings store wired", store: nil, want: ChannelStable},
		{name: "setting never written", store: &fakeStore{}, want: ChannelStable},
		{name: "explicitly stable", store: &fakeStore{values: map[string]string{channelKey: "stable"}}, want: ChannelStable},
		{name: "explicitly beta", store: &fakeStore{values: map[string]string{channelKey: "beta"}}, want: ChannelBeta},
		{name: "unrecognised value", store: &fakeStore{values: map[string]string{channelKey: "nightly"}}, want: ChannelStable},
		{name: "read error", store: &fakeStore{getErr: http.ErrServerClosed}, want: ChannelStable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := NewService("0.14.7", tt.store)
			if got := s.Channel(); got != tt.want {
				t.Errorf("Channel() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestSetChannel(t *testing.T) {
	t.Run("rejects unknown channel without writing", func(t *testing.T) {
		store := &fakeStore{}
		s := NewService("0.14.7", store)

		if err := s.SetChannel("nightly"); err == nil {
			t.Fatal("SetChannel(\"nightly\") = nil, want error")
		}
		if store.setCall != 0 {
			t.Errorf("SetSetting called %d times, want 0", store.setCall)
		}
		if got := s.Channel(); got != ChannelStable {
			t.Errorf("Channel() = %q after rejected write, want %q", got, ChannelStable)
		}
	})

	t.Run("persists a valid channel", func(t *testing.T) {
		store := &fakeStore{}
		s := NewService("0.14.7", store)

		if err := s.SetChannel(ChannelBeta); err != nil {
			t.Fatalf("SetChannel(beta) = %v, want nil", err)
		}
		if got := store.values[channelKey]; got != ChannelBeta {
			t.Errorf("stored value = %q, want %q", got, ChannelBeta)
		}
		if got := s.Channel(); got != ChannelBeta {
			t.Errorf("Channel() = %q, want %q", got, ChannelBeta)
		}
	})

	t.Run("errors when no store is wired", func(t *testing.T) {
		s := NewService("0.14.7", nil)
		if err := s.SetChannel(ChannelBeta); err == nil {
			t.Fatal("SetChannel with nil store = nil, want error")
		}
	})
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

func serviceOnChannel(t *testing.T, version, channel string) *Service {
	t.Helper()
	return NewService(version, &fakeStore{values: map[string]string{channelKey: channel}})
}

func TestCheckForUpdateHonoursChannel(t *testing.T) {
	stable := workerRelease{Version: "v0.14.8", URL: "https://example.test/stable", Notes: "stable notes"}
	beta := workerRelease{Version: "v0.15.0-beta.1", URL: "https://example.test/beta", Notes: "beta notes", Prerelease: true}

	tests := []struct {
		name          string
		channel       string
		current       string
		wantRequested string
		wantAvailable bool
		wantLatest    string
		wantPre       bool
	}{
		{
			name:          "stable channel never sees a prerelease",
			channel:       ChannelStable,
			current:       "v0.14.7",
			wantRequested: ChannelStable,
			wantAvailable: true,
			wantLatest:    "0.14.8",
		},
		{
			name:          "beta channel accepts a prerelease",
			channel:       ChannelBeta,
			current:       "v0.14.7",
			wantRequested: ChannelBeta,
			wantAvailable: true,
			wantLatest:    "0.15.0-beta.1",
			wantPre:       true,
		},
		{
			name:          "beta already ahead of the offered prerelease",
			channel:       ChannelBeta,
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
			s := serviceOnChannel(t, tt.current, tt.channel)

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
			if info.Channel != tt.channel {
				t.Errorf("Channel = %q, want %q", info.Channel, tt.channel)
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
	s := serviceOnChannel(t, "v0.15.0-beta.3", ChannelBeta)

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

func TestStableRollback(t *testing.T) {
	t.Run("offers a downgrade off a beta build", func(t *testing.T) {
		srv := newReleaseServer(t, map[string]workerRelease{
			ChannelStable: {Version: "v0.14.7", URL: "https://example.test/stable"},
			ChannelBeta:   {Version: "v0.15.0-beta.3", Prerelease: true},
		})
		// Still configured for beta: the rollback must ignore that and ask for
		// stable anyway.
		s := serviceOnChannel(t, "v0.15.0-beta.3", ChannelBeta)

		info, err := s.StableRollback()
		if err != nil {
			t.Fatalf("StableRollback() error = %v", err)
		}
		if len(srv.requested) != 1 || srv.requested[0] != ChannelStable {
			t.Errorf("worker asked for channels %v, want [stable]", srv.requested)
		}
		if !info.Available {
			t.Error("Available = false, want true: rollback must ignore semver ordering")
		}
		if info.LatestVersion != "0.14.7" {
			t.Errorf("LatestVersion = %q, want %q", info.LatestVersion, "0.14.7")
		}
		if info.Channel != ChannelStable {
			t.Errorf("Channel = %q, want %q", info.Channel, ChannelStable)
		}
	})

	t.Run("nothing to do when already on stable", func(t *testing.T) {
		newReleaseServer(t, map[string]workerRelease{
			ChannelStable: {Version: "v0.14.7", URL: "https://example.test/stable"},
		})
		s := serviceOnChannel(t, "v0.14.7", ChannelStable)

		info, err := s.StableRollback()
		if err != nil {
			t.Fatalf("StableRollback() error = %v", err)
		}
		if info.Available {
			t.Error("Available = true, want false: already running the stable build")
		}
	})
}

func TestOpenReleasePageFallsBackToAllReleases(t *testing.T) {
	s := NewService("v0.14.7", nil)
	s.mu.Lock()
	got := s.lastRelURL
	s.mu.Unlock()
	if got != "" {
		t.Fatalf("lastRelURL = %q on a fresh service, want empty", got)
	}

	// After a check, the resolved release URL is what the menu item should open,
	// since a beta build is not reachable from /releases/latest.
	newReleaseServer(t, map[string]workerRelease{
		ChannelBeta: {Version: "v0.15.0-beta.1", URL: "https://example.test/beta", Prerelease: true},
	})
	s = serviceOnChannel(t, "v0.14.7", ChannelBeta)
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
