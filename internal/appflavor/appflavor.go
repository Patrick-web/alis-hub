// Package appflavor derives the build's identity from its version string.
//
// Stable and beta ship as two separate applications that can be installed and
// run side by side, so almost everything that names the app has to differ
// between them: the bundle, the single-instance lock, the deep-link scheme, and
// the directory holding hub.db. All of it keys off one fact, decided at build
// time by the tag CI built from.
package appflavor

import (
	"os"
	"strings"
)

const (
	Stable = "stable"
	Beta   = "beta"
)

// FlavorEnv forces a flavor regardless of version, for exercising the beta
// build's identity from a dev build. Set to "beta" or "stable".
const FlavorEnv = "ALIS_HUB_FLAVOR"

// IsBeta reports whether this build came from a semver prerelease tag such as
// v0.15.0-beta.1. Dev builds report false and therefore behave like stable,
// which keeps `wails3 dev` pointed at the same data it has always used.
func IsBeta(version string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(FlavorEnv))) {
	case Beta:
		return true
	case Stable:
		return false
	}
	return strings.Contains(version, "-")
}

// Channel is the release channel this build follows. It is a property of the
// build, not a user setting: a beta install updates along the beta line and a
// stable install along the stable line, and you move between them by running
// the other application.
func Channel(version string) string {
	if IsBeta(version) {
		return Beta
	}
	return Stable
}

// Name is the user-facing application name.
func Name(version string) string {
	if IsBeta(version) {
		return "AlisHub Beta"
	}
	return "AlisHub"
}

// BundleID identifies the app to the OS. Distinct per flavor so macOS treats
// the two installs as different applications rather than two copies of one.
func BundleID(version string) string {
	if IsBeta(version) {
		return "com.patrickweb.alishub.beta"
	}
	return "com.patrickweb.alishub"
}

// URLScheme is the deep-link scheme. Two apps cannot share one scheme without
// the OS resolving links to an arbitrary one of them.
func URLScheme(version string) string {
	if IsBeta(version) {
		return "alishub-beta"
	}
	return "alishub"
}

// ConfigDirName is the per-flavor directory under os.UserConfigDir holding
// hub.db. Separate databases are what make rollback safe: a schema migration
// shipped in a beta can never leave the stable install reading a database it
// does not understand.
func ConfigDirName(version string) string {
	if IsBeta(version) {
		return "AlisHub Beta"
	}
	return "AlisHub"
}

// StableConfigDirName is always the stable directory, used to seed a fresh beta
// install from the user's existing settings.
func StableConfigDirName() string { return "AlisHub" }
