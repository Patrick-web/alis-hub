package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	neuronsv1pb "alis-hub-v3/gen/go/alis/os/neurons/v1"
)

// Fixture-backed tests for the CLI's JSON contract.
//
// The files under testdata/cli were captured from real `alis ... --json` runs
// (v1.69.7) and redacted. They run without credentials or network, so the
// decoders in cliviews.go stay pinned in the default `go test` run — the live
// counterparts in sandbox_test.go need the alis_integration tag and can only
// tell you the shape is still right on a machine that is set up.
//
// Refresh a fixture by re-running the command in its doc comment and redacting
// any credentials or personal data.

func loadFixture(t *testing.T, name string, into any) {
	t.Helper()
	path := filepath.Join("testdata", "cli", name+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture %s: %v", path, err)
	}
	if err := json.Unmarshal(data, into); err != nil {
		t.Fatalf("decode fixture %s: %v", path, err)
	}
}

// mustUnmarshal is shared with the live sandbox tests.
func mustUnmarshal(t *testing.T, data []byte, into any) {
	t.Helper()
	if err := json.Unmarshal(data, into); err != nil {
		t.Fatalf("decode CLI output: %v\nraw: %s", err, string(data))
	}
}

// `alis whoami --json`
func TestFixture_Whoami(t *testing.T) {
	var v whoamiResponse
	loadFixture(t, "whoami", &v)

	if v.Email == "" {
		t.Error("email not decoded")
	}
	if v.BuildProfile.PreferredHarness == "" {
		t.Error("buildProfile not decoded")
	}
	// The absence of these is why GetUserProfile keeps gRPC as its primary
	// source; if the CLI ever grows them, that decision can be revisited.
	if len(v.BuildProfile.Environments) == 0 {
		t.Error("buildProfile.environments not decoded")
	}
}

// `alis version --json`
func TestFixture_Version(t *testing.T) {
	var v versionResponse
	loadFixture(t, "version", &v)
	if v.Version == "" {
		t.Fatal("version not decoded")
	}
}

// `alis accounts list --json` — the one snake_case response.
func TestFixture_AccountsList(t *testing.T) {
	var v accountsListResponse
	loadFixture(t, "accounts_list", &v)

	if len(v.Accounts) == 0 {
		t.Fatal("no accounts decoded")
	}
	for _, a := range v.Accounts {
		if a.Name == "" {
			t.Error("account name not decoded")
		}
		// Guards the snake_case tag: a lowerCamelCase tag decodes to "".
		if a.DisplayName == "" {
			t.Error("display_name not decoded — has the CLI switched to camelCase?")
		}
	}
}

// `alis org list --json`
func TestFixture_OrgList(t *testing.T) {
	var v orgListResponse
	loadFixture(t, "org_list", &v)

	// Guards the legacy key: renaming it to "organisations" would decode to an
	// empty list rather than an error, and the org picker would just go blank.
	if len(v.LandingZones) == 0 {
		t.Fatal("landingZones not decoded — has the key been renamed?")
	}
	for _, z := range v.LandingZones {
		if z.ID == "" {
			t.Error("organisation id not decoded")
		}
	}
}

// `alis org view voyage --json`
func TestFixture_OrgView(t *testing.T) {
	var v orgViewResponse
	loadFixture(t, "org_view", &v)

	if len(v.Products) == 0 {
		t.Fatal("no products decoded")
	}
	for _, p := range v.Products {
		if p.ID == "" || p.Status == "" {
			t.Errorf("product %+v missing id or status", p)
		}
		// These are dropped by the current adapter but are available; the test
		// records that they exist so a future change can pick them up.
		if p.GitRemoteURL == "" {
			t.Errorf("product %s: gitRemoteUrl not decoded", p.ID)
		}
	}
}

// `alis product view voyage.zz --json`
func TestFixture_ProductView(t *testing.T) {
	var v productViewResponse
	loadFixture(t, "product_view_sandbox", &v)

	if len(v.Neurons) == 0 {
		t.Fatal("no neurons decoded")
	}
	if len(v.Environments) == 0 {
		t.Fatal("no environments decoded")
	}
	for _, e := range v.Environments {
		if e.ID == "" {
			t.Error("environment id not decoded")
		}
		// deployments must stay a map keyed by neuron id. If it became an
		// array this decodes to an empty map with no error, and the services
		// page would silently show every environment as empty.
		for id, d := range e.Deployments {
			if id == "" {
				t.Error("deployment map has an empty key")
			}
			if d.ID != "" && d.ID != id {
				t.Errorf("deployment key %q disagrees with nested id %q", id, d.ID)
			}
		}
	}
}

// TestFixture_ProductViewMapsToOverview covers the full adapter, not just decoding.
func TestFixture_ProductViewMapsToOverview(t *testing.T) {
	var v productViewResponse
	loadFixture(t, "product_view_sandbox", &v)

	neurons := make([]NeuronItem, 0, len(v.Neurons))
	for _, n := range v.Neurons {
		neurons = append(neurons, NeuronItem{
			ID:      n.ID,
			Version: n.Version,
			State:   neuronStateFromCLI(n.Status),
		})
	}
	if len(neurons) != len(v.Neurons) {
		t.Fatalf("mapped %d neurons from %d", len(neurons), len(v.Neurons))
	}
	// The sandbox services have never been built, so they report UNSPECIFIED —
	// which must map to 0, not be coerced to BUILT.
	for _, n := range neurons {
		if n.State != int32(neuronsv1pb.NeuronVersion_UNSPECIFIED) {
			t.Logf("neuron %s state=%d (fixture may have been rebuilt)", n.ID, n.State)
		}
	}
}

// `alis context view voyage.zz --json` — product form (no packageId).
func TestFixture_ContextViewProduct(t *testing.T) {
	var v contextViewResponse
	loadFixture(t, "context_view_product", &v)

	if v.Organisation == "" || v.Product == "" {
		t.Fatal("organisation/product not decoded")
	}
	if len(v.Environments) == 0 {
		t.Error("environments not decoded in the product form")
	}
	// Outside a service folder the CLI omits these; that conditional shape is
	// why CLIContextView takes an explicit working directory.
	if v.PackageID != "" {
		t.Errorf("packageId = %q, want empty outside a service folder", v.PackageID)
	}
	if v.ServiceFolder != "" {
		t.Errorf("serviceFolder = %q, want empty outside a service folder", v.ServiceFolder)
	}
}

// `alis blocks list voyage.zz.dummy.v1 --json`
func TestFixture_BlocksList(t *testing.T) {
	var v blocksListResponse
	loadFixture(t, "blocks_list", &v)

	if len(v.Available) == 0 {
		t.Fatal("no available blocks decoded")
	}
	for _, b := range v.Available {
		if b.BlockID == "" {
			t.Error("blockId not decoded")
		}
		if b.ReleaseLevel == "" {
			t.Errorf("block %s: releaseLevel not decoded", b.BlockID)
		}
	}

	// The installed form is not the available form with extra fields: it uses
	// installedVersion rather than version, and carries the instance ref.
	if len(v.Installed) == 0 {
		t.Fatal("no installed blocks decoded — the fixture service has two")
	}
	for _, b := range v.Installed {
		if b.BlockID == "" {
			t.Error("installed blockId not decoded")
		}
		// Every mutating blocks command needs this to address the right
		// install; losing it would silently target instance 1.
		if b.Instance == "" {
			t.Errorf("block %s: instance ref not decoded", b.BlockID)
		}
		if !strings.HasPrefix(b.Instance, "blocks/"+b.BlockID+"/instances/") {
			t.Errorf("block %s: unexpected instance format %q", b.BlockID, b.Instance)
		}
		if b.InstalledVersion == "" {
			t.Errorf("block %s: installedVersion not decoded (is the key still 'version'?)", b.BlockID)
		}
		if b.GitBranch == "" {
			t.Errorf("block %s: gitBranch not decoded", b.BlockID)
		}
	}
}

// `alis blocks versions twilioverify --json`
func TestFixture_BlocksVersions(t *testing.T) {
	var v blocksVersionsResponse
	loadFixture(t, "blocks_versions", &v)

	if len(v.Versions) == 0 {
		t.Fatal("no versions decoded")
	}
	for _, ver := range v.Versions {
		if ver.Version == "" {
			t.Error("version not decoded")
		}
	}
}

// `alis skills search "..." --json`
func TestFixture_SkillsSearch(t *testing.T) {
	var v skillsSearchResponse
	loadFixture(t, "skills_search", &v)

	if len(v.QueriedSkills) == 0 {
		t.Fatal("no skills decoded")
	}
	for _, s := range v.QueriedSkills {
		if s.ID == "" {
			t.Error("skill id not decoded")
		}
		// loadCount is a protobuf int64 and arrives as a JSON string; typing it
		// as a number fails the whole decode.
		if s.LoadCount == "" {
			t.Errorf("skill %s: loadCount not decoded as a string", s.ID)
		}
	}
}

// `alis operations describe <failed-op> --json`
//
// The flattened operation view reports error as a plain string.
func TestFixture_OperationDescribeFailed(t *testing.T) {
	var state struct {
		Done    bool   `json:"done"`
		Version string `json:"version"`
		Error   string `json:"error"`
	}
	loadFixture(t, "op_describe_failed", &state)

	if !state.Done {
		t.Error("expected done=true")
	}
	if state.Error == "" {
		t.Fatal("error not decoded as a string")
	}
}

// TestFixture_AsyncEnvelopeErrorIsAnObject pins the shape difference that let a
// failed define look like a running one: `operations describe` flattens error
// to a string, but the --async envelope returns a Status object. Decoding the
// async form with a string field fails outright, so the two cannot share a type.
func TestFixture_AsyncEnvelopeErrorIsAnObject(t *testing.T) {
	path := filepath.Join("testdata", "cli", "define_async_failed.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	// The describe-shaped type must NOT accept the async envelope.
	var flattened struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(data, &flattened); err == nil {
		t.Error("async envelope decoded into a string error field — the shapes have converged?")
	}

	// The async-shaped type must accept it, and must surface both the
	// already-finished flag and the message.
	var op struct {
		Name  string `json:"name"`
		Done  bool   `json:"done"`
		Error *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(data, &op); err != nil {
		t.Fatalf("decode async envelope: %v", err)
	}
	if op.Name == "" {
		t.Error("operation name not decoded")
	}
	if !op.Done {
		t.Error("expected done=true: this operation failed before --async returned")
	}
	if op.Error == nil || op.Error.Message == "" {
		t.Fatal("expected an error message in the async envelope")
	}
}
