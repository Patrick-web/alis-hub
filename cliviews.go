package main

// Decoders for the `alis ... --json` responses this app consumes.
//
// The CLI documents an output contract (one result on stdout, progress on
// stderr, an error envelope on failure) but publishes no response schemas, so
// every shape here was captured from a live invocation and is pinned by
// fixture-backed tests in cli_fixtures_test.go against testdata/cli/*.json.
// docs/ALIS_CLI_FEATURES.md § Verified JSON Response Shapes carries the same
// information in prose.
//
// Two things to keep in mind when extending these:
//
//   - Output is protojson. Enums arrive as strings, unset scalars may be
//     omitted or present as zero values, and new fields can appear without
//     notice — so decode leniently and never assume a field's presence.
//   - Key casing is not uniform. Almost everything is lowerCamelCase, but
//     `alis accounts list` returns display_name in snake_case.

// ── alis whoami ───────────────────────────────────────────────────────────────

// whoamiResponse carries no display name and no avatar; anything needing those
// has to go to the identity API.
type whoamiResponse struct {
	ID           string `json:"id"`
	Email        string `json:"email"`
	BuildProfile struct {
		PreferredHarness string   `json:"preferredHarness"`
		ExperienceLevel  string   `json:"experienceLevel"`
		PreferredIDE     string   `json:"preferredIde"`
		DefaultTerminal  string   `json:"defaultTerminalApp"`
		LocalSetupDone   bool     `json:"localEnvironmentSetupComplete"`
		OperatingSystem  string   `json:"os"`
		Environments     []string `json:"environments"`
	} `json:"buildProfile"`
}

// ── alis version ──────────────────────────────────────────────────────────────

type versionResponse struct {
	Version string `json:"version"`
}

// ── alis accounts list ────────────────────────────────────────────────────────

// accountsListResponse is the one command that returns snake_case.
type accountsListResponse struct {
	Accounts []struct {
		Name        string `json:"name"`
		DisplayName string `json:"display_name"`
		Active      bool   `json:"active"`
	} `json:"accounts"`
}

// ── alis org list / org view ──────────────────────────────────────────────────

// orgListResponse uses the legacy "landingZones" key even though the command is
// `alis org`, and carries no owned-vs-shared distinction.
type orgListResponse struct {
	LandingZones []struct {
		ID          string `json:"id"`
		Status      string `json:"status"`
		DisplayName string `json:"displayName"`
	} `json:"landingZones"`
}

type orgViewResponse struct {
	DisplayName string `json:"displayName"`
	Description string `json:"description"`
	Products    []struct {
		ID                      string `json:"id"`
		Status                  string `json:"status"`
		DisplayName             string `json:"displayName"`
		LatestDefinitionVersion string `json:"latestDefinitionVersion"`
		LatestDefinitionStatus  string `json:"latestDefinitionStatus"`
		GitRemoteURL            string `json:"gitRemoteUrl"`
		GoogleProjectID         string `json:"googleProjectId"`
	} `json:"products"`
}

// ── alis product view ─────────────────────────────────────────────────────────

// productViewResponse answers the whole services-overview question in one call:
// the service list and, per environment, what is deployed there.
type productViewResponse struct {
	DisplayName  string                   `json:"displayName"`
	Description  string                   `json:"description"`
	ProjectID    string                   `json:"projectId"`
	GitRemoteURL string                   `json:"gitRemoteUrl"`
	Neurons      []productViewNeuron      `json:"neurons"`
	Environments []productViewEnvironment `json:"environments"`
}

type productViewNeuron struct {
	ID      string `json:"id"`
	Version string `json:"version"` // latest BUILD version
	Status  string `json:"status"`  // NeuronVersion_State as a string
	LogsURI string `json:"logsUri"`
	// DefinedVersion is the latest DEFINE version and moves independently of
	// Version; it is often empty.
	DefinedVersion         string   `json:"definedVersion"`
	BuildTime              string   `json:"buildTime"`
	BuiltBy                string   `json:"builtBy"`
	Type                   string   `json:"type"`
	Source                 string   `json:"source"`
	InstalledBlocks        []string `json:"installedBlocks"`
	AutoDeployEnvironments []string `json:"autoDeployEnvironments"`
	ReleaseEnvs            []string `json:"releaseEnvs"`
}

type productViewEnvironment struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	ProjectID   string `json:"projectId"`
	Status      string `json:"status"`
	Production  bool   `json:"production"`
	// AllowedBranches is the designation set by `alis environment branches`;
	// empty means any branch may deploy.
	AllowedBranches []string `json:"allowedBranches"`
	// Deployments is keyed by neuron id — an object, not an array. Decoding it
	// as a list yields nothing and reports no error.
	Deployments map[string]productViewDeployment `json:"deployments"`
}

type productViewDeployment struct {
	ID      string `json:"id"`
	Version string `json:"version"` // deployed version, independent of the built one
	Status  string `json:"status"`  // Deployment_State as a string
	LogsURI string `json:"logsUri"`
	// UpdateTime is when this deployment last changed state.
	UpdateTime string `json:"updateTime"`
	DeployedBy string `json:"deployedBy"`
}

// ── alis context view ─────────────────────────────────────────────────────────

// contextViewResponse's fields depend on the working directory: PackageID and
// ServiceFolder appear only inside a service folder, and Environments only
// outside one. There is no buildFolder key in either form.
type contextViewResponse struct {
	Organisation  string `json:"organisation"`
	Product       string `json:"product"`
	PackageID     string `json:"packageId"`
	ServiceFolder string `json:"serviceFolder"`
	DefineFolder  string `json:"defineFolder"`
	Environments  []struct {
		ID          string `json:"id"`
		DisplayName string `json:"displayName"`
		Status      string `json:"status"`
		Production  bool   `json:"production"`
	} `json:"environments"`
}

// ── alis blocks ───────────────────────────────────────────────────────────────

type blocksListResponse struct {
	Installed []blocksInstalledItem `json:"installed"`
	Available []blocksAvailableItem `json:"available"`
}

// blocksInstalledItem describes one install. Note it does NOT mirror
// blocksAvailableItem: the installed form uses installedVersion (not version)
// and adds state, buildFolder and gitBranch.
type blocksInstalledItem struct {
	BlockID     string `json:"blockId"`
	DisplayName string `json:"displayName"`
	Tagline     string `json:"tagline"`
	// Instance addresses this install as "blocks/<block-id>/instances/<n>".
	// It is what --instance takes, and is required by upgrade/uninstall/merge/
	// publish whenever a block is installed into the service more than once.
	Instance         string `json:"instance"`
	InstalledVersion string `json:"installedVersion"`
	LatestVersion    string `json:"latestVersion"`
	State            string `json:"state"`
	// BuildFolder is the root the block's build files were installed under,
	// matching the --build-folder passed at install time.
	BuildFolder string `json:"buildFolder"`
	// GitBranch is the block/* branch the install was committed to; it is the
	// branch `alis blocks merge` folds into main.
	GitBranch          string `json:"gitBranch"`
	UpgradeAvailable   bool   `json:"upgradeAvailable"`
	AgenticInstallOnly bool   `json:"agenticInstallOnly"`
}

type blocksAvailableItem struct {
	BlockID       string `json:"blockId"`
	DisplayName   string `json:"displayName"`
	Tagline       string `json:"tagline"`
	ReleaseLevel  string `json:"releaseLevel"` // GA | RC | BETA | ALPHA | EXPERIMENTAL
	LatestVersion string `json:"latestVersion"`
	TotalInstalls int32  `json:"totalInstalls"`
	// AgenticInstallOnly blocks cannot be installed through a plain install
	// action; Deprecated blocks should not be offered for new installs.
	AgenticInstallOnly bool `json:"agenticInstallOnly"`
	Deprecated         bool `json:"deprecated"`
}

type blocksVersionsResponse struct {
	Versions []struct {
		Name         string `json:"name"`
		Version      string `json:"version"`
		ReleaseLevel string `json:"releaseLevel"`
		CreateTime   string `json:"createTime"`
	} `json:"versions"`
}

// ── alis environment variables ────────────────────────────────────────────────

type envVariablesResponse struct {
	Environments []struct {
		EnvironmentID string `json:"environmentId"`
		DisplayName   string `json:"displayName"`
		Envs          []struct {
			Name  string `json:"name"`
			Value string `json:"value"`
		} `json:"envs"`
		// CanUpdate reports whether the caller holds roles/environment.admin.
		// Use it to disable editing rather than letting the write fail.
		CanUpdate bool `json:"canUpdate"`
	} `json:"environments"`
}

// ── alis skills ───────────────────────────────────────────────────────────────

type skillsSearchResponse struct {
	QueriedSkills []SkillSummary `json:"queriedSkills"`
}

// SkillSummary is exported: it crosses the Wails boundary to the skills UI.
// LoadCount is a string because it is a protobuf int64.
type SkillSummary struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	Description string `json:"description"`
	Version     string `json:"version"`
	LoadCount   string `json:"loadCount"`
}

type skillsLoadResponse struct {
	Markdown string `json:"markdown"`
}

type skillsResourceResponse struct {
	Content string `json:"content"`
}

// ── alis doctor ───────────────────────────────────────────────────────────────

// doctorResponse is a local-only snapshot unless --ticket is passed.
type doctorResponse struct {
	CLIVersion string   `json:"cliVersion"`
	OS         string   `json:"os"`
	Arch       string   `json:"arch"`
	Terminal   string   `json:"terminal"`
	Shell      string   `json:"shell"`
	Host       string   `json:"host"`
	CreatedAt  string   `json:"createdAt"`
	Path       []string `json:"path"`
	Auth       struct {
		Authorized   bool   `json:"authorized"`
		BuildAccount string `json:"buildAccount"`
	} `json:"auth"`
	Components []struct {
		Name     string `json:"name"`
		Version  string `json:"version"`
		Detected bool   `json:"detected"`
	} `json:"components"`
	Setup []struct {
		Name      string `json:"name"`
		Installed bool   `json:"installed"`
		Detail    string `json:"detail"`
	} `json:"setup"`
	Bins     map[string]string `json:"bins"`
	Settings struct {
		// Approvals is the automation tier. An empty object means the default,
		// "balanced".
		Approvals map[string]any `json:"approvals"`
		// SafeMode restricts platform commands to an allowlist of organisations.
		SafeMode struct {
			Enabled                bool     `json:"enabled"`
			AllowedOrganisationIDs []string `json:"allowedOrganisationIds"`
		} `json:"safeMode"`
	} `json:"settings"`
}

// ── alis ask ──────────────────────────────────────────────────────────────────

type askResponse struct {
	// AnswerDelta carries the full answer text despite the name.
	AnswerDelta string `json:"answerDelta"`
	Session     string `json:"session"`
	Citations   []struct {
		Kind  string `json:"kind"` // SKILL | SESSION | TICKET
		Name  string `json:"name"`
		Title string `json:"title"`
	} `json:"citations"`
	RelatedQuestions []string `json:"relatedQuestions"`
}

// ── alis git configure / gcloud auth ──────────────────────────────────────────

// gitConfigureResponse carries live ID tokens. Never log or persist it.
type gitConfigureResponse struct {
	DefineGitConfig struct {
		RemoteURL string `json:"remoteUrl"`
		IDToken   string `json:"idToken"`
	} `json:"defineGitConfig"`
	BuildGitConfig struct {
		RemoteURL string `json:"remoteUrl"`
		IDToken   string `json:"idToken"`
	} `json:"buildGitConfig"`
	UserName  string `json:"userName"`
	UserEmail string `json:"userEmail"`
}
