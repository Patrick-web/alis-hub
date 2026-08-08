package cliwrap

import (
	"encoding/json"
	"os/exec"
	"testing"
)

func TestNeuronToPackageID(t *testing.T) {
	tests := []struct {
		neuron string
		want   string
	}{
		{"organisations/voyage/products/vp/neurons/asana-v1", "voyage.vp.asana.v1"},
		{"organisations/voyage/products/vp/neurons/bff-v1", "voyage.vp.bff.v1"},
		{"organisations/alis/products/os/neurons/cli-v1", "alis.os.cli.v1"},
		{"organisations/x/products/y/neurons/internal-api-v2", "x.y.internal.api.v2"},
		{"short", "short"},
		{"", ""},
	}
	for _, tt := range tests {
		got := NeuronToPackageID(tt.neuron)
		if got != tt.want {
			t.Errorf("NeuronToPackageID(%q) = %q, want %q", tt.neuron, got, tt.want)
		}
	}
}

func TestExtractEnvID(t *testing.T) {
	tests := []struct {
		env  string
		want string
	}{
		{"organisations/x/products/y/environments/dev", "dev"},
		{"organisations/voyage/products/vp/environments/1y2ozw66zv6p3", "1y2ozw66zv6p3"},
		{"organisations/x/products/y/environments/", ""},
		{"just-env-id", "just-env-id"},
		{"", ""},
	}
	for _, tt := range tests {
		got := ExtractEnvID(tt.env)
		if got != tt.want {
			t.Errorf("ExtractEnvID(%q) = %q, want %q", tt.env, got, tt.want)
		}
	}
}

func TestParseAsyncName(t *testing.T) {
	tests := []struct {
		name    string
		stdout  string
		want    string
		wantErr bool
	}{
		{
			name:   "valid",
			stdout: `{"name":"operations/c39c3134-f3cd-4f1f-b0f7-b932a7313aa5","metadata":{},"done":false}`,
			want:   "operations/c39c3134-f3cd-4f1f-b0f7-b932a7313aa5",
		},
		{
			name:   "name only",
			stdout: `{"name":"operations/abc-123"}`,
			want:   "operations/abc-123",
		},
		{
			name:    "empty name",
			stdout:  `{"name":""}`,
			wantErr: true,
		},
		{
			name:    "no name field",
			stdout:  `{"done":false}`,
			wantErr: true,
		},
		{
			name:    "invalid json",
			stdout:  `not json`,
			wantErr: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseAsyncName(json.RawMessage(tt.stdout))
			if tt.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestParseErrorEnvelope(t *testing.T) {
	tests := []struct {
		name   string
		stdout string
		want   *ErrorEnvelope
	}{
		{
			name:   "production confirmation",
			stdout: `{"error":{"code":"PRODUCTION_CONFIRMATION_REQUIRED","message":"production deploy requires confirmation","retry":"alis deploy voyage.vp.asana.v1 --json -e prod --confirm-production","agent":"ask the user first"}}`,
			want:   &ErrorEnvelope{},
		},
		{
			name:   "approval required",
			stdout: `{"error":{"code":"APPROVAL_REQUIRED","message":"command requires approval","retry":"alis build voyage.vp.asana.v1 --json --approve","agent":""}}`,
			want:   &ErrorEnvelope{},
		},
		{
			name:   "non-error json",
			stdout: `{"done":false,"version":"1.4.0"}`,
			want:   nil,
		},
		{
			name:   "invalid json",
			stdout: `not json`,
			want:   nil,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseErrorEnvelope(json.RawMessage(tt.stdout))
			if tt.want == nil && got != nil {
				t.Errorf("expected nil, got %+v", got)
			}
			if tt.want != nil && got == nil {
				t.Error("expected error envelope, got nil")
			}
			if tt.want != nil && got != nil {
				if got.Error.Code != tt.stdout[0:1] { // Just checking it parsed something
					// Verify key fields
					if got.Error.Code == "" {
						t.Error("expected non-empty error code")
					}
					if got.Error.Retry == "" {
						t.Error("expected retry command")
					}
					t.Logf("parsed: code=%s retry=%s", got.Error.Code, got.Error.Retry)
				}
			}
		})
	}
}

func TestParseDescribeOutput(t *testing.T) {
	stdout := `{"done":true,"version":"1.4.1","notes":"Dockerfile: building 1 images","logsUri":"https://git-v2-alisproxy-123.run.app/executions/uuid","error":""}`
	var state OperationState
	if err := json.Unmarshal([]byte(stdout), &state); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !state.Done {
		t.Error("expected done=true")
	}
	if state.Version != "1.4.1" {
		t.Errorf("expected version=1.4.1, got %s", state.Version)
	}
	if state.LogsURI == "" {
		t.Error("expected non-empty logsUri")
	}
}

func TestParseDefineDescribeOutput(t *testing.T) {
	stdout := `{"done":true,"version":"1.4.0","notes":"Generating 4 artifacts","artifacts":[{"name":"packages/voyage.vp.asana.v1/versions/1.4.0/artifacts/golang_artifact_registry","state":"GENERATED"}],"error":""}`
	var state OperationState
	if err := json.Unmarshal([]byte(stdout), &state); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !state.Done {
		t.Error("expected done=true")
	}
	if len(state.Artifacts) != 1 {
		t.Errorf("expected 1 artifact, got %d", len(state.Artifacts))
	}
	if state.Artifacts[0].State != "GENERATED" {
		t.Errorf("expected state=GENERATED, got %s", state.Artifacts[0].State)
	}
}

func TestCLIBinaryNotFound(t *testing.T) {
	_, err := New("alis-nonexistent-binary-xyz")
	if err == nil {
		t.Error("expected error for missing binary")
	}
}

func TestCLIBinaryFound(t *testing.T) {
	alisPath := "alis"
	if _, err := exec.LookPath(alisPath); err != nil {
		t.Skipf("alis not in PATH: %v", err)
	}
	r, err := New(alisPath)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if r.AlisPath != alisPath {
		t.Errorf("expected AlisPath=%s, got %s", alisPath, r.AlisPath)
	}
}

func TestErrConfirmationRequired_Error(t *testing.T) {
	err := &ErrConfirmationRequired{RetryCmd: "alis deploy ... --confirm-production", Message: "confirm deploy"}
	if err.Error() == "" {
		t.Error("expected non-empty error string")
	}
}

func TestErrUnauthenticated_Error(t *testing.T) {
	err := &ErrUnauthenticated{}
	if err.Error() == "" {
		t.Error("expected non-empty error string")
	}
}
