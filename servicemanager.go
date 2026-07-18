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

// GetServices returns an empty services list. The Services page was replaced by
// the dynamic neuron-based UI served via ProductService.GetServicesOverview.
func (s *ServiceManager) GetServices() []Service {
	return nil
}

// GetWorkspaceInfo returns an empty workspace. The frontend populates workspace
// info from the active product context via ProductService.GetProductOverview and
// ProductService.GetUserProfile.
func (s *ServiceManager) GetWorkspaceInfo() WorkspaceInfo {
	return WorkspaceInfo{}
}
