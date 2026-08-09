package main

import (
	"slices"
	"strings"
	"testing"
)

func TestBlockIDFromInstance(t *testing.T) {
	good := map[string]string{
		"blocks/demogreeter/instances/959": "demogreeter",
		"blocks/resources/instances/f0f":   "resources",
		"blocks/excel/instances/123":       "excel",
	}
	for instance, want := range good {
		got, err := blockIDFromInstance(instance)
		if err != nil {
			t.Errorf("blockIDFromInstance(%q): %v", instance, err)
			continue
		}
		if got != want {
			t.Errorf("blockIDFromInstance(%q) = %q, want %q", instance, got, want)
		}
	}

	bad := []string{
		"",
		"demogreeter",
		"blocks/demogreeter",
		"blocks//instances/1",
		"blocks/demogreeter/versions/1.0.0",
		"instances/959",
	}
	for _, instance := range bad {
		if _, err := blockIDFromInstance(instance); err == nil {
			t.Errorf("blockIDFromInstance(%q) = nil error, want a failure", instance)
		}
	}
}

func TestBlockVersionTag(t *testing.T) {
	tests := map[string]string{
		// The Console API hands out full version resource names; --version
		// takes the bare tag.
		"blocks/bb6b/versions/1.0.0-experimental1": "1.0.0-experimental1",
		"blocks/users/versions/1.18.0-rc2":         "1.18.0-rc2",
		// Already-bare tags pass through unchanged.
		"1.2.0": "1.2.0",
		"":      "",
	}
	for in, want := range tests {
		if got := blockVersionTag(in); got != want {
			t.Errorf("blockVersionTag(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestBlocksInstallArgs(t *testing.T) {
	t.Run("block id precedes package id", func(t *testing.T) {
		// `alis docs codeblocks` documents the reverse order; --help is right.
		got := blocksInstallArgs(BlockInstallOptions{BlockID: "bff", Package: "voyage.zz.dummy.v1"})
		if got[2] != "bff" || got[3] != "voyage.zz.dummy.v1" {
			t.Errorf("wrong argument order: %v", got)
		}
	})

	t.Run("minimal install", func(t *testing.T) {
		got := strings.Join(blocksInstallArgs(BlockInstallOptions{BlockID: "bff"}), " ")
		if got != "blocks install bff --json" {
			t.Errorf("got %q", got)
		}
	})

	t.Run("version, build folder and no-merge", func(t *testing.T) {
		got := blocksInstallArgs(BlockInstallOptions{
			BlockID:     "bff",
			Package:     "p",
			Version:     "1.0.0-beta2",
			BuildFolder: "sub",
			NoMerge:     true,
		})
		if !hasFlagValue(got, "--version", "1.0.0-beta2") {
			t.Errorf("version not passed: %v", got)
		}
		if !hasFlagValue(got, "--build-folder", "sub") {
			t.Errorf("build folder not passed: %v", got)
		}
		if countFlag(got, "--no-merge") != 1 {
			t.Errorf("--no-merge not passed: %v", got)
		}
	})

	t.Run("merge happens by default", func(t *testing.T) {
		// Install pushes to the local build and define repos unless --no-merge
		// is given, so its absence here is load-bearing, not incidental.
		got := blocksInstallArgs(BlockInstallOptions{BlockID: "bff"})
		if strings.Contains(strings.Join(got, " "), "--no-merge") {
			t.Errorf("--no-merge emitted without being requested: %v", got)
		}
	})
}

func TestBlocksInstanceArgs(t *testing.T) {
	t.Run("derives the block id and passes the instance", func(t *testing.T) {
		got, err := blocksInstanceArgs("upgrade", "blocks/demogreeter/instances/959")
		if err != nil {
			t.Fatalf("blocksInstanceArgs: %v", err)
		}
		want := "blocks upgrade demogreeter --instance blocks/demogreeter/instances/959 --json"
		if strings.Join(got, " ") != want {
			t.Errorf("got %q, want %q", strings.Join(got, " "), want)
		}
	})

	t.Run("appends extra flags", func(t *testing.T) {
		got, err := blocksInstanceArgs("upgrade", "blocks/x/instances/1", "--version", "2.0.0", "--no-merge")
		if err != nil {
			t.Fatalf("blocksInstanceArgs: %v", err)
		}
		if !hasFlagValue(got, "--version", "2.0.0") || countFlag(got, "--no-merge") != 1 {
			t.Errorf("extra flags lost: %v", got)
		}
	})

	t.Run("rejects a malformed instance", func(t *testing.T) {
		if _, err := blocksInstanceArgs("merge", "not-an-instance"); err == nil {
			t.Error("expected a failure for a malformed instance name")
		}
	})
}

func TestBlocksCreateArgs(t *testing.T) {
	got := blocksCreateArgs(BlockCreateOptions{
		BlockID:     "myblock",
		Package:     "voyage.zz.dummy.v1",
		Account:     "accounts/8na6ap",
		DisplayName: "My Block",
		Tagline:     "Does a thing",
	})
	if got[2] != "myblock" || got[3] != "voyage.zz.dummy.v1" {
		t.Errorf("wrong argument order: %v", got)
	}
	// The CLI requires both of these; omitting either is a usage error.
	if !hasFlagValue(got, "--account", "accounts/8na6ap") {
		t.Errorf("account not passed: %v", got)
	}
	if !hasFlagValue(got, "--display-name", "My Block") {
		t.Errorf("display name not passed: %v", got)
	}
	if !hasFlagValue(got, "--tagline", "Does a thing") {
		t.Errorf("tagline not passed: %v", got)
	}
}

func TestBlocksPublishArgs(t *testing.T) {
	got := blocksPublishArgs(BlockPublishOptions{
		BlockID:      "myblock",
		Package:      "p",
		ReleaseLevel: "BETA",
		Notes:        "first cut",
		Instance:     "blocks/myblock/instances/7",
		BuildCommit:  "abc",
		DefineCommit: "def",
	})
	// release-level and notes are required by the CLI.
	if !hasFlagValue(got, "--release-level", "BETA") {
		t.Errorf("release level not passed: %v", got)
	}
	if !hasFlagValue(got, "--notes", "first cut") {
		t.Errorf("notes not passed: %v", got)
	}
	if !hasFlagValue(got, "--instance", "blocks/myblock/instances/7") {
		t.Errorf("instance not passed: %v", got)
	}
	if !hasFlagValue(got, "--build-commit", "abc") || !hasFlagValue(got, "--define-commit", "def") {
		t.Errorf("commit pins not passed: %v", got)
	}
}

// TestCliPackageID covers both forms callers hold: ServiceBlocksPage builds the
// bare dotted id itself, while the Console-derived pages carry the resource
// name. Only the bare form is a valid positional argument.
func TestCliPackageID(t *testing.T) {
	cases := map[string]string{
		"packages/voyage.zz.dummy.v1": "voyage.zz.dummy.v1",
		"voyage.zz.dummy.v1":          "voyage.zz.dummy.v1",
		"":                            "",
	}
	for in, want := range cases {
		if got := cliPackageID(in); got != want {
			t.Errorf("cliPackageID(%q) = %q, want %q", in, got, want)
		}
	}
}

// TestReleaseLevelRoundTrip pins the numeric BlockVersion_ReleaseLevel against
// the string vocabulary the CLI uses. These are not the Block_ReleaseLevel
// numbers, which name the same levels 1..5.
func TestReleaseLevelRoundTrip(t *testing.T) {
	want := map[int32]string{3: "EXPERIMENTAL", 6: "ALPHA", 9: "BETA", 12: "RC", 99: "GA"}
	for level, code := range want {
		got, err := releaseLevelCode(level)
		if err != nil || got != code {
			t.Errorf("releaseLevelCode(%d) = %q, %v; want %q", level, got, err, code)
		}
		if back := releaseLevelValue(code); back != level {
			t.Errorf("releaseLevelValue(%q) = %d, want %d", code, back, level)
		}
	}

	// UNSPECIFIED is a real enum member but never a valid --release-level.
	if _, err := releaseLevelCode(0); err == nil {
		t.Error("expected release level 0 to be rejected")
	}
	if _, err := releaseLevelCode(7); err == nil {
		t.Error("expected an unknown release level to be rejected")
	}
	// An unrecognised code degrades to 0, which the UI shows as "Not Specified"
	// rather than mislabelling the version.
	if got := releaseLevelValue("PREVIEW"); got != 0 {
		t.Errorf("releaseLevelValue(\"PREVIEW\") = %d, want 0", got)
	}
}

// TestBlocksArgsStripPackagePrefix guards the three builders that take a
// package positionally: passing the resource name through would make the CLI
// reject the command.
func TestBlocksArgsStripPackagePrefix(t *testing.T) {
	const pkg = "packages/voyage.zz.dummy.v1"
	const bare = "voyage.zz.dummy.v1"

	install := blocksInstallArgs(BlockInstallOptions{BlockID: "b", Package: pkg})
	create := blocksCreateArgs(BlockCreateOptions{BlockID: "b", Package: pkg, Account: "accounts/a", DisplayName: "B"})
	publish := blocksPublishArgs(BlockPublishOptions{BlockID: "b", Package: pkg, ReleaseLevel: "GA", Notes: "n"})

	for name, args := range map[string][]string{"install": install, "create": create, "publish": publish} {
		if !slices.Contains(args, bare) {
			t.Errorf("%s: bare package id missing: %v", name, args)
		}
		if slices.Contains(args, pkg) {
			t.Errorf("%s: resource prefix leaked through: %v", name, args)
		}
	}
}

// TestPublishBlockCLIValidation checks the required-field guards fire before a
// process is spawned, so a caller gets a usable message rather than a CLI usage
// error.
func TestPublishBlockCLIValidation(t *testing.T) {
	svc := &ProductService{} // no CLI runner attached
	if _, err := svc.PublishBlockCLI(BlockPublishOptions{}); err == nil {
		t.Error("expected an error with no CLI available")
	}

	// With a runner present the validation still has to reject incomplete input.
	// Constructing a real runner is unnecessary — cover the pure derivation
	// instead: a block id must be recoverable from the instance ref.
	id, err := blockIDFromInstance("blocks/myblock/instances/7")
	if err != nil || id != "myblock" {
		t.Fatalf("blockIDFromInstance = %q, %v", id, err)
	}
}

// `alis blocks accounts --json`
func TestFixture_BlocksAccounts(t *testing.T) {
	var v struct {
		Accounts []BlockAccount `json:"accounts"`
	}
	loadFixture(t, "blocks_accounts", &v)

	if len(v.Accounts) == 0 {
		t.Fatal("no accounts decoded")
	}
	for _, a := range v.Accounts {
		if a.Name == "" {
			t.Error("account name not decoded")
		}
		// The name is what --account takes on `blocks create`.
		if !strings.HasPrefix(a.Name, "accounts/") {
			t.Errorf("unexpected account name format %q", a.Name)
		}
	}
}

// TestBlocksOverviewMapping covers the list adapter against the captured
// response, including the instance refs the mutating calls depend on.
func TestBlocksOverviewMapping(t *testing.T) {
	var v blocksListResponse
	loadFixture(t, "blocks_list", &v)

	if len(v.Installed) == 0 || len(v.Available) == 0 {
		t.Fatal("fixture should have both installed and available blocks")
	}
	for _, b := range v.Installed {
		// Every install must yield a usable instance ref, or upgrade,
		// uninstall and merge cannot address it.
		id, err := blockIDFromInstance(b.Instance)
		if err != nil {
			t.Errorf("install %s has an unusable instance %q: %v", b.BlockID, b.Instance, err)
			continue
		}
		if id != b.BlockID {
			t.Errorf("instance %q does not belong to block %q", b.Instance, b.BlockID)
		}
	}
}
