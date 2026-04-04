package main

type Service struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Status      string `json:"status"`
	LatestBuild string `json:"latestBuild"`
}

type ServiceManager struct{}

func (s *ServiceManager) GetServices() []Service {
	return []Service{
		{ID: "1", Name: "bookings-v1", Status: "running", LatestBuild: "1.0.167"},
		{ID: "2", Name: "bundles-v1", Status: "running", LatestBuild: "1.0.167"},
		{ID: "3", Name: "charters-v1", Status: "stopped", LatestBuild: "1.0.167"},
		{ID: "4", Name: "chartertmps-v1", Status: "running", LatestBuild: "1.0.167"},
		{ID: "5", Name: "commissions-v1", Status: "running", LatestBuild: "1.0.167"},
		{ID: "6", Name: "iam-v1", Status: "running", LatestBuild: "1.0.167"},
		{ID: "7", Name: "products-v1", Status: "running", LatestBuild: "1.0.167"},
		{ID: "8", Name: "packages-v1", Status: "running", LatestBuild: "1.0.167"},
	}
}
