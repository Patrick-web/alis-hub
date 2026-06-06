package main

type Service struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Type        int    `json:"type"`
	State       int    `json:"state"`
	LatestBuild string `json:"latestBuild"`
}

type WorkspaceInfo struct {
	Organisation               string `json:"organisation"`
	OrganisationDisplayName    string `json:"organisationDisplayName"`
	Product                    string `json:"product"`
	ProductDisplayName         string `json:"productDisplayName"`
	Environment                string `json:"environment"`
	EnvironmentDisplayName     string `json:"environmentDisplayName"`
	EnvironmentGoogleProjectID string `json:"environmentGoogleProjectId"`
	EnvironmentGoogleRegion    string `json:"environmentGoogleRegion"`
	RootDirectory              string `json:"rootDirectory"`
}

type ServiceManager struct{}

func (s *ServiceManager) GetServices() []Service {
	return []Service{
		{ID: "1", Name: "bookings-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "2", Name: "bundles-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "3", Name: "charters-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "4", Name: "chartertypes-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "5", Name: "commissions-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "6", Name: "iam-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "7", Name: "products-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "8", Name: "packages-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "9", Name: "pricingrules-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "10", Name: "productcategories-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "11", Name: "yachts-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "12", Name: "yachtowners-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "13", Name: "experiences-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "14", Name: "bff-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "15", Name: "customerportal-v2", Type: 1, State: 1, LatestBuild: "1.0.167"},
		{ID: "16", Name: "console-v2", Type: 1, State: 1, LatestBuild: "1.0.167"},
		{ID: "17", Name: "hubspot-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "18", Name: "payments-v2", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "19", Name: "leads-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "20", Name: "sendgrid-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "21", Name: "referrals-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "22", Name: "asana-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "23", Name: "monitoring-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "24", Name: "reporting-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "25", Name: "twilio-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "26", Name: "salesforce-v1", Type: 2, State: 4, LatestBuild: "0.0.1"},
		{ID: "27", Name: "mockplacetopay-v1", Type: 2, State: 1, LatestBuild: "1.0.167"},
		{ID: "28", Name: "charters-v2", Type: 2, State: 4, LatestBuild: "0.0.1"},
	}
}

func (s *ServiceManager) GetWorkspaceInfo() WorkspaceInfo {
	return WorkspaceInfo{
		Organisation:               "voyage",
		OrganisationDisplayName:    "Voyage",
		Product:                    "vp",
		ProductDisplayName:         "Voyage Platform",
		Environment:                "production",
		EnvironmentDisplayName:     "Production",
		EnvironmentGoogleProjectID: "voyage-vp-prod",
		EnvironmentGoogleRegion:    "us-east4",
		RootDirectory:              "/Users/jp/alis.build/voyage/build/vp",
	}
}
