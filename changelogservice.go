package main

import (
	_ "embed"
	"strings"
)

//go:embed CHANGELOG.md
var changelogMD string

type ChangelogService struct{ version string }

func NewChangelogService(version string) *ChangelogService {
	return &ChangelogService{version: version}
}

// GetReleaseNotes returns the markdown body for the current version from CHANGELOG.md.
// Returns an empty string if no matching section is found.
func (s *ChangelogService) GetReleaseNotes() string {
	v := s.version
	if !strings.HasPrefix(v, "v") {
		v = "v" + v
	}
	target := "## [" + v + "]"

	lines := strings.Split(changelogMD, "\n")
	var (
		collecting bool
		result     []string
	)
	for _, line := range lines {
		if strings.HasPrefix(line, "## [") {
			if collecting {
				break
			}
			if strings.HasPrefix(line, target) {
				collecting = true
			}
			continue
		}
		if collecting {
			result = append(result, line)
		}
	}
	return strings.TrimSpace(strings.Join(result, "\n"))
}
