package main

import (
	"errors"
	"testing"
)

func TestGitParseHunks(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want []string
	}{
		{"empty", "", nil},
		{"whitespace only", "   \n  \t  ", nil},
		{"single hunk", "@@ -1,3 +1,4 @@\n line1\n line2", []string{"@@ -1,3 +1,4 @@\n line1\n line2"}},
		{"single line", "one line", []string{"one line"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := gitParseHunks(tt.raw)
			if len(got) != len(tt.want) {
				t.Fatalf("len = %d, want %d", len(got), len(tt.want))
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Errorf("[%d] = %q, want %q", i, got[i], tt.want[i])
				}
			}
		})
	}
}

func TestGitOutputError(t *testing.T) {
	tests := []struct {
		name   string
		output string
		err    error
		want   string
	}{
		{
			name:   "empty output returns wrapped error",
			output: "",
			err:    errors.New("git failed"),
			want:   "git failed",
		},
		{
			name:   "non-empty output returns output as error",
			output: "fatal: not a git repository",
			err:    errors.New("exit status 128"),
			want:   "fatal: not a git repository",
		},
		{
			name:   "whitespace output returns error",
			output: "   ",
			err:    errors.New("something"),
			want:   "something",
		},
		{
			name:   "output with trailing newline",
			output: "error message\n",
			err:    errors.New("original"),
			want:   "error message",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := gitOutputError(tt.output, tt.err)
			if got.Error() != tt.want {
				t.Errorf("gitOutputError() = %q, want %q", got.Error(), tt.want)
			}
		})
	}
}

func TestGitLang(t *testing.T) {
	tests := []struct {
		path string
		want string
	}{
		{"main.go", "go"},
		{"component.tsx", "typescript"},
		{"utils.ts", "typescript"},
		{"app.jsx", "javascript"},
		{"app.js", "javascript"},
		{"config.json", "json"},
		{"docker-compose.yaml", "yaml"},
		{"docker-compose.yml", "yaml"},
		{"README.md", "markdown"},
		{"service.proto", "protobuf"},
		{"script.py", "python"},
		{"install.sh", "bash"},
		{"run.bash", "bash"},
		{"Makefile", "plaintext"},
		{"Dockerfile", "plaintext"},
		{"unknown.xyz", "plaintext"},
		{"", "plaintext"},
		{"/path/to/file.go", "go"},
		{"file.PROTO", "protobuf"},
		{"index.html", "html"},
		{"style.css", "css"},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			got := gitLang(tt.path)
			if got != tt.want {
				t.Errorf("gitLang(%q) = %q, want %q", tt.path, got, tt.want)
			}
		})
	}
}
