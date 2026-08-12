package appflavor

import "testing"

func TestIsBeta(t *testing.T) {
	tests := []struct {
		version string
		want    bool
	}{
		{version: "v0.15.0-beta.1", want: true},
		{version: "0.15.0-beta.1", want: true},
		{version: "v1.0.0-rc.2", want: true},
		{version: "v0.14.7", want: false},
		{version: "0.14.7", want: false},
		{version: "dev", want: false},
		{version: "", want: false},
	}
	for _, tt := range tests {
		if got := IsBeta(tt.version); got != tt.want {
			t.Errorf("IsBeta(%q) = %v, want %v", tt.version, got, tt.want)
		}
	}
}

func TestEnvOverride(t *testing.T) {
	t.Run("forces beta", func(t *testing.T) {
		t.Setenv(FlavorEnv, "beta")
		if !IsBeta("v0.14.7") {
			t.Error("IsBeta = false with the override set to beta")
		}
	})
	t.Run("forces stable", func(t *testing.T) {
		t.Setenv(FlavorEnv, "STABLE") // case-insensitive
		if IsBeta("v0.15.0-beta.1") {
			t.Error("IsBeta = true with the override set to stable")
		}
	})
	t.Run("ignores an unrecognised value", func(t *testing.T) {
		t.Setenv(FlavorEnv, "nightly")
		if !IsBeta("v0.15.0-beta.1") {
			t.Error("an unrecognised override should fall back to the version string")
		}
	})
}

// Every identity the OS keys on has to differ between the two flavors, or the
// installs collide instead of sitting side by side.
func TestIdentitiesAreDistinct(t *testing.T) {
	const stableV, betaV = "v0.14.7", "v0.15.0-beta.1"

	identities := map[string]func(string) string{
		"Name":          Name,
		"BundleID":      BundleID,
		"URLScheme":     URLScheme,
		"ConfigDirName": ConfigDirName,
		"Channel":       Channel,
	}
	for name, fn := range identities {
		stable, beta := fn(stableV), fn(betaV)
		if stable == beta {
			t.Errorf("%s is %q for both flavors, want distinct values", name, stable)
		}
		if stable == "" || beta == "" {
			t.Errorf("%s returned an empty value (stable=%q beta=%q)", name, stable, beta)
		}
	}

	// The stable side must keep the values already shipped, or existing installs
	// would lose their data directory and deep links on upgrade.
	if got := Name(stableV); got != "AlisHub" {
		t.Errorf("Name(stable) = %q, want %q", got, "AlisHub")
	}
	if got := BundleID(stableV); got != "com.patrickweb.alishub" {
		t.Errorf("BundleID(stable) = %q, want the shipped identifier", got)
	}
	if got := URLScheme(stableV); got != "alishub" {
		t.Errorf("URLScheme(stable) = %q, want %q", got, "alishub")
	}
	if got := ConfigDirName(stableV); got != StableConfigDirName() {
		t.Errorf("ConfigDirName(stable) = %q, want %q", got, StableConfigDirName())
	}
}
