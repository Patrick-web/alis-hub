package main

import (
	"os"
	"path/filepath"
	"strings"
)

// Skill install targets.
//
// `alis skills install --project` writes into the working directory the CLI is
// given, and there is no flag that names a target instead. So the app has to
// hand it a folder, and the folders worth offering are the product build repos
// under ~/alis.build/<org>/build/<product>.
//
// A landing zone is not itself a target. The CLI calls <org> "the organisation
// id, historically called the landing zone", and an org owns no repo of its own
// — only its define repo and one build repo per product. Landing zones group
// the list; products are what a skill installs into.

// SkillInstallTarget is one product's local build repo, offered as a place to
// install a skill.
type SkillInstallTarget struct {
	Org         string `json:"org"`
	Product     string `json:"product"`
	DisplayName string `json:"displayName"`
	Dir         string `json:"dir"`
	// Cloned reports whether Dir exists. Installing into a product that was
	// never cloned would create a bare folder holding nothing but the skill, so
	// the UI shows these but does not let them be chosen.
	Cloned bool `json:"cloned"`
}

// ListSkillInstallTargets returns an organisation's products with the local
// build repo each one installs into.
//
// This deliberately does not reuse CheckProductCloneStatus: that reports on the
// define repo as well, and a skill install touches only the build repo. A
// product whose protos were never cloned is still a perfectly good target.
func (s *ProductService) ListSkillInstallTargets(org string) ([]SkillInstallTarget, error) {
	products, err := s.ListProducts(org)
	if err != nil {
		return nil, err
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	targets := make([]SkillInstallTarget, 0, len(products))
	for _, p := range products {
		id := p.Name
		if _, after, found := strings.Cut(p.Name, "/products/"); found {
			id = after
		}
		dir := filepath.Join(home, "alis.build", org, "build", id)
		info, statErr := os.Stat(dir)
		display := p.DisplayName
		if display == "" {
			display = id
		}
		targets = append(targets, SkillInstallTarget{
			Org:         org,
			Product:     id,
			DisplayName: display,
			Dir:         dir,
			Cloned:      statErr == nil && info.IsDir(),
		})
	}
	return targets, nil
}
