package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	iamv2pb "alis-hub-v3/gen/go/alis/os/iam/v2"
	productsv1pb "alis-hub-v3/gen/go/alis/os/products/v1"

	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
)

func (s *ProductService) ListLandingZones() (*LandingZonesData, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	myAccounts := s.myAccountIDs()
	req := &productsv1pb.ListOrganisationsRequest{
		ReadMask: &fieldmaskpb.FieldMask{Paths: []string{"name", "display_name", "account", "description", "logo"}},
	}
	protoBytes, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("ListOrganisations: marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.OrganisationsService/ListOrganisations", protoBytes)
	if err != nil {
		return nil, fmt.Errorf("ListOrganisations: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListOrganisations: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListOrganisations: response too short (%d bytes)", len(body))
	}

	resp := &productsv1pb.ListOrganisationsResponse{}
	if err := proto.Unmarshal(body[5:], resp); err != nil {
		return nil, fmt.Errorf("ListOrganisations: unmarshal response: %w", err)
	}

	result := &LandingZonesData{Own: []Organisation{}, Shared: []Organisation{}}
	for _, o := range resp.GetOrganisations() {
		org := Organisation{
			Name:          o.GetName(),
			DisplayName:   o.GetDisplayName(),
			Description:   o.GetDescription(),
			Logo:          o.GetLogo(),
			Account:       o.GetAccount(),
			GoogleProject: convertGoogleProject(o.GetGoogleProject()),
		}
		if myAccounts[org.Account] {
			result.Own = append(result.Own, org)
		} else {
			result.Shared = append(result.Shared, org)
		}
	}
	return result, nil
}

func (s *ProductService) ListProducts(org string) ([]ProductSummary, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	req := &productsv1pb.ListProductsRequest{
		Parent:   fmt.Sprintf("organisations/%s", org),
		ReadMask: &fieldmaskpb.FieldMask{Paths: []string{"name", "display_name", "state"}},
	}
	protoBytes, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("ListProducts: marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.ProductsService/ListProducts", protoBytes)
	if err != nil {
		return nil, fmt.Errorf("ListProducts: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListProducts: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListProducts: response too short (%d bytes)", len(body))
	}

	resp := &productsv1pb.ListProductsResponse{}
	if err := proto.Unmarshal(body[5:], resp); err != nil {
		return nil, fmt.Errorf("ListProducts: unmarshal response: %w", err)
	}

	products := make([]ProductSummary, 0, len(resp.GetProducts()))
	for _, p := range resp.GetProducts() {
		products = append(products, ProductSummary{
			Name:        p.GetName(),
			DisplayName: p.GetDisplayName(),
			State:       int32(p.GetState()),
		})
	}
	return products, nil
}

// myAccountIDs fetches the current user's account resource names via RetrieveMyUser,
// returning a set of "accounts/<id>" strings for O(1) lookup.
// The JWT tokens do not carry an accounts claim, so an API call is required.
func (s *ProductService) myAccountIDs() map[string]bool {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	body, grpcStatus, _, err := s.doConsoleGRPCWeb(ctx, "alis.os.iam.v2.UsersService/RetrieveMyUser", []byte{})
	if err != nil || grpcStatus != 0 || len(body) < 5 {
		return nil
	}
	user := &iamv2pb.User{}
	if err := proto.Unmarshal(body[5:], user); err != nil {
		return nil
	}
	result := make(map[string]bool, len(user.GetAccounts()))
	for key := range user.GetAccounts() {
		if !strings.HasPrefix(key, "accounts/") {
			key = "accounts/" + key
		}
		result[key] = true
	}
	return result
}

func (s *ProductService) GetProductOverview(org, product string) (*ProductOverview, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	req := &productsv1pb.GetProductRequest{
		Name: fmt.Sprintf("organisations/%s/products/%s", org, product),
		ReadMask: &fieldmaskpb.FieldMask{Paths: []string{
			"name", "display_name", "state", "google_project", "git_repo",
			"internal_package_registries", "docker_registries",
		}},
	}
	protoBytes, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("GetProduct: marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.ProductsService/GetProduct", protoBytes)
	if err != nil {
		return nil, fmt.Errorf("GetProduct: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("GetProduct: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("GetProduct: response too short (%d bytes)", len(body))
	}

	p := &productsv1pb.Product{}
	if err := proto.Unmarshal(body[5:], p); err != nil {
		return nil, fmt.Errorf("GetProduct: unmarshal response: %w", err)
	}
	return &ProductOverview{
		Name:              p.GetName(),
		DisplayName:       p.GetDisplayName(),
		State:             int32(p.GetState()),
		GoogleProject:     convertGoogleProject(p.GetGoogleProject()),
		GitRepo:           convertGitRepo(p.GetGitRepo()),
		PackageRegistries: convertPackageRegistries(p.GetInternalPackageRegistries()),
		DockerRegistry:    p.GetDockerRegistries().GetInternalUri(),
	}, nil
}

// convertGoogleProject maps the generated GoogleProject message onto the app's
// GCPProject JSON-facing struct.
func convertGoogleProject(gp *productsv1pb.GoogleProject) *GCPProject {
	if gp == nil {
		return nil
	}
	return &GCPProject{
		FolderID:              gp.GetFolderId(),
		ID:                    gp.GetId(),
		Number:                gp.GetNumber(),
		Region:                gp.GetRegion(),
		BillingAccountID:      gp.GetBillingAccountId(),
		ManagedBillingAccount: gp.GetManagedBillingAccount(),
		CloudURI:              gp.GetCloudUri(),
	}
}

// convertGitRepo maps the generated GitRepo message onto the app's GitRepoInfo
// JSON-facing struct.
func convertGitRepo(gr *productsv1pb.GitRepo) *GitRepoInfo {
	if gr == nil {
		return nil
	}
	return &GitRepoInfo{
		RemoteURI:   gr.GetRemoteUri(),
		CloudRunURI: gr.GetCloudrun().GetConsoleUri(),
		VMURI:       gr.GetVm().GetConsoleUri(),
		BucketURI:   gr.GetBucket().GetConsoleUri(),
	}
}

// convertPackageRegistries maps the generated PackageRegistries message onto
// the app's PkgRegistries JSON-facing struct.
func convertPackageRegistries(pr *productsv1pb.PackageRegistries) *PkgRegistries {
	if pr == nil {
		return nil
	}
	return &PkgRegistries{
		Go:         pr.GetGoRegistryUri(),
		JavaScript: pr.GetJavascriptRegistryUri(),
		Python:     pr.GetPythonRegistryUri(),
	}
}

func (s *ProductService) ListEnvironments(org, product string) ([]EnvInfo, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	req := &productsv1pb.ListEnvironmentsRequest{
		Parent:   fmt.Sprintf("organisations/%s/products/%s", org, product),
		ReadMask: &fieldmaskpb.FieldMask{Paths: []string{"name", "display_name", "google_project", "state", "type"}},
	}
	protoBytes, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("ListEnvironments: marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/ListEnvironments", protoBytes)
	if err != nil {
		return nil, fmt.Errorf("ListEnvironments: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListEnvironments: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListEnvironments: response too short (%d bytes)", len(body))
	}
	resp := &productsv1pb.ListEnvironmentsResponse{}
	if err := proto.Unmarshal(body[5:], resp); err != nil {
		return nil, fmt.Errorf("ListEnvironments: unmarshal response: %w", err)
	}
	envs := make([]EnvInfo, 0, len(resp.GetEnvironments()))
	for _, e := range resp.GetEnvironments() {
		envs = append(envs, *environmentToEnvInfo(e))
	}
	return envs, nil
}

func (s *ProductService) getOrganisationGitRepo(org string) (string, error) {
	req := &productsv1pb.GetOrganisationRequest{
		Name:     fmt.Sprintf("organisations/%s", org),
		ReadMask: &fieldmaskpb.FieldMask{Paths: []string{"git_repo"}},
	}
	protoBytes, err := proto.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("GetOrganisation: marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.OrganisationsService/GetOrganisation", protoBytes)
	if err != nil {
		return "", fmt.Errorf("GetOrganisation: %w", err)
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("GetOrganisation: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("GetOrganisation: response too short (%d bytes)", len(body))
	}
	org2 := &productsv1pb.Organisation{}
	if err := proto.Unmarshal(body[5:], org2); err != nil {
		return "", fmt.Errorf("GetOrganisation: unmarshal response: %w", err)
	}
	return org2.GetGitRepo().GetRemoteUri(), nil
}

// GetOrganisationProject returns the GCP project associated with an organisation.
func (s *ProductService) GetOrganisationProject(org string) (*GCPProject, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	req := &productsv1pb.GetOrganisationRequest{
		Name:     fmt.Sprintf("organisations/%s", org),
		ReadMask: &fieldmaskpb.FieldMask{Paths: []string{"google_project"}},
	}
	protoBytes, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("GetOrganisation: marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.OrganisationsService/GetOrganisation", protoBytes)
	if err != nil {
		return nil, fmt.Errorf("GetOrganisation: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("GetOrganisation: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("GetOrganisation: response too short (%d bytes)", len(body))
	}
	org2 := &productsv1pb.Organisation{}
	if err := proto.Unmarshal(body[5:], org2); err != nil {
		return nil, fmt.Errorf("GetOrganisation: unmarshal response: %w", err)
	}
	return convertGoogleProject(org2.GetGoogleProject()), nil
}

func (s *ProductService) SyncRepos(org, product string) (*SyncReposResult, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	overview, err := s.GetProductOverview(org, product)
	if err != nil {
		return &SyncReposResult{Error: fmt.Sprintf("get product: %s", err)}, nil
	}
	if overview.GitRepo == nil || overview.GitRepo.RemoteURI == "" {
		return &SyncReposResult{Error: "product has no git repo configured"}, nil
	}
	// The API returns the org base URL (e.g. https://host/org); the build repo
	// is named after the product and the define repo is always "proto".
	buildRepoURL := strings.TrimRight(overview.GitRepo.RemoteURI, "/") + "/" + product

	orgBaseURL, err := s.getOrganisationGitRepo(org)
	if err != nil {
		return &SyncReposResult{Error: fmt.Sprintf("get organisation: %s", err)}, nil
	}
	if orgBaseURL == "" {
		return &SyncReposResult{Error: "organisation has no git repo configured"}, nil
	}
	defineRepoURL := strings.TrimRight(orgBaseURL, "/") + "/proto"

	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("home dir: %w", err)
	}
	defineDir := filepath.Join(home, "alis.build", org, "define")
	buildDir := filepath.Join(home, "alis.build", org, "build", product)

	gitToken, err := s.tokens.AccessToken()
	if err != nil {
		return &SyncReposResult{Error: fmt.Sprintf("get git token: %s", err)}, nil
	}
	emit := func(text string) { s.emitSyncLog(text) }

	result := &SyncReposResult{DefineDir: defineDir, BuildDir: buildDir}

	result.DefineAction, err = syncOneRepo(defineDir, defineRepoURL, gitToken, emit)
	if err != nil {
		result.Error = fmt.Sprintf("define repo: %s", err)
		return result, nil
	}

	result.BuildAction, err = syncOneRepo(buildDir, buildRepoURL, gitToken, emit)
	if err != nil {
		result.Error = fmt.Sprintf("build repo: %s", err)
		return result, nil
	}

	return result, nil
}

// CheckProductCloneStatus returns true if both the define and build repos for
// the given product are already present on the local filesystem.
func (s *ProductService) CheckProductCloneStatus(org, product string) bool {
	home, err := os.UserHomeDir()
	if err != nil {
		return false
	}
	defineDir := filepath.Join(home, "alis.build", org, "define")
	buildDir := filepath.Join(home, "alis.build", org, "build", product)
	_, dErr := os.Stat(defineDir)
	_, bErr := os.Stat(buildDir)
	return !os.IsNotExist(dErr) && !os.IsNotExist(bErr)
}
