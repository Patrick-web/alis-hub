package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	neuronsv1pb "alis-hub-v3/gen/go/alis/os/neurons/v1"
	productsv1pb "alis-hub-v3/gen/go/alis/os/products/v1"

	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
)

// GetEnvironmentVariables fetches the variables for a single environment.
// envName is the full resource name, e.g. "organisations/voyage/products/vp/environments/1y2ozw66zv6p3".
func (s *ProductService) GetEnvironmentVariables(envName string) ([]EnvVariable, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	req := &productsv1pb.GetEnvironmentRequest{Name: envName}
	buf, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("GetEnvironmentVariables: marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/GetEnvironment", buf)
	if err != nil {
		return nil, fmt.Errorf("GetEnvironmentVariables: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("GetEnvironmentVariables: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("GetEnvironmentVariables: response too short (%d bytes)", len(body))
	}
	env := &productsv1pb.Environment{}
	if err := proto.Unmarshal(body[5:], env); err != nil {
		return nil, fmt.Errorf("GetEnvironmentVariables: unmarshal response: %w", err)
	}
	vars := make([]EnvVariable, 0, len(env.GetEnvs()))
	for _, e := range env.GetEnvs() {
		if e.GetName() != "" {
			vars = append(vars, EnvVariable{Label: e.GetName(), Value: e.GetValue()})
		}
	}
	return vars, nil
}

// retrieveDeploymentEnvs calls DeploymentsService/RetrieveDeploymentEnvs with
// migrated=true and returns all vars with their managed flag.
func (s *ProductService) retrieveDeploymentEnvs(envName string) ([]DeploymentEnvVar, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	req := &neuronsv1pb.RetrieveDeploymentEnvsRequest{Environment: envName, Migrated: true}
	buf, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("retrieveDeploymentEnvs: marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.neurons.v1.DeploymentsService/RetrieveDeploymentEnvs", buf)
	if err != nil {
		return nil, fmt.Errorf("retrieveDeploymentEnvs: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("retrieveDeploymentEnvs: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("retrieveDeploymentEnvs: response too short (%d bytes)", len(body))
	}
	resp := &neuronsv1pb.RetrieveDeploymentEnvsResponse{}
	if err := proto.Unmarshal(body[5:], resp); err != nil {
		return nil, fmt.Errorf("retrieveDeploymentEnvs: unmarshal response: %w", err)
	}
	vars := make([]DeploymentEnvVar, 0, len(resp.GetEnvs()))
	for _, e := range resp.GetEnvs() {
		if e.GetName() != "" {
			vars = append(vars, DeploymentEnvVar{Name: e.GetName(), Value: e.GetValue(), Managed: e.GetManaged()})
		}
	}
	return vars, nil
}

// SetEnvironmentVariables replaces all variables on an environment by calling
// UpdateEnvironment with an update_mask of "envs".
func (s *ProductService) SetEnvironmentVariables(envName string, vars []EnvVariable) error {
	if err := s.initTokens(); err != nil {
		return err
	}

	env := &productsv1pb.Environment{Name: envName}
	for _, v := range vars {
		env.Envs = append(env.Envs, &productsv1pb.Environment_Env{Name: v.Label, Value: v.Value})
	}
	req := &productsv1pb.UpdateEnvironmentRequest{
		Environment: env,
		UpdateMask:  &fieldmaskpb.FieldMask{Paths: []string{"envs"}},
	}
	buf, err := proto.Marshal(req)
	if err != nil {
		return fmt.Errorf("SetEnvironmentVariables: marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/UpdateEnvironment", buf)
	if err != nil {
		return fmt.Errorf("SetEnvironmentVariables: %w", err)
	}
	if grpcStatus != 0 {
		return fmt.Errorf("SetEnvironmentVariables: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	return nil
}

// environmentToEnvInfo maps a products.v1.Environment onto the app's EnvInfo JSON-facing struct.
func environmentToEnvInfo(env *productsv1pb.Environment) *EnvInfo {
	return &EnvInfo{
		Name:        env.GetName(),
		DisplayName: env.GetDisplayName(),
		State:       int32(env.GetState()),
		EnvType:     int32(env.GetType()),
		GCPProject:  convertGoogleProject(env.GetGoogleProject()),
	}
}

// CreateEnvironment creates a new environment under the given org/product.
// envType: 1=DEV, 2=STAGING, 3=PROD. region must be a valid GCP region.
func (s *ProductService) CreateEnvironment(org, product, displayName, region string, envType int32) (*EnvInfo, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	req := &productsv1pb.CreateEnvironmentRequest{
		Parent: fmt.Sprintf("organisations/%s/products/%s", org, product),
		Environment: &productsv1pb.Environment{
			DisplayName:   displayName,
			GoogleProject: &productsv1pb.GoogleProject{Region: region},
			Type:          productsv1pb.Environment_Type(envType),
		},
	}
	buf, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("CreateEnvironment: marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/CreateEnvironment", buf)
	if err != nil {
		return nil, fmt.Errorf("CreateEnvironment: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("CreateEnvironment: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("CreateEnvironment: response too short (%d bytes)", len(body))
	}
	env := &productsv1pb.Environment{}
	if err := proto.Unmarshal(body[5:], env); err != nil {
		return nil, fmt.Errorf("CreateEnvironment: unmarshal response: %w", err)
	}
	return environmentToEnvInfo(env), nil
}

// UpdateEnvironment updates the displayName of an existing environment.
// envName is the full resource name.
func (s *ProductService) UpdateEnvironment(envName, displayName string) (*EnvInfo, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	req := &productsv1pb.UpdateEnvironmentRequest{
		Environment: &productsv1pb.Environment{Name: envName, DisplayName: displayName},
		UpdateMask:  &fieldmaskpb.FieldMask{Paths: []string{"display_name"}},
	}
	buf, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("UpdateEnvironment: marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/UpdateEnvironment", buf)
	if err != nil {
		return nil, fmt.Errorf("UpdateEnvironment: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("UpdateEnvironment: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("UpdateEnvironment: response too short (%d bytes)", len(body))
	}
	env := &productsv1pb.Environment{}
	if err := proto.Unmarshal(body[5:], env); err != nil {
		return nil, fmt.Errorf("UpdateEnvironment: unmarshal response: %w", err)
	}
	return environmentToEnvInfo(env), nil
}

// DeleteEnvironment deletes the environment with the given full resource name.
func (s *ProductService) DeleteEnvironment(envName string) error {
	if err := s.initTokens(); err != nil {
		return err
	}

	req := &productsv1pb.DeleteEnvironmentRequest{Name: envName}
	buf, err := proto.Marshal(req)
	if err != nil {
		return fmt.Errorf("DeleteEnvironment: marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/DeleteEnvironment", buf)
	if err != nil {
		return fmt.Errorf("DeleteEnvironment: %w", err)
	}
	if grpcStatus != 0 {
		return fmt.Errorf("DeleteEnvironment: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	return nil
}

// generateServiceAccountKey calls EnvironmentsService/GenerateServiceAccountKey
// to mint a fresh service-account key for envName. This mirrors what the Alis
// VSCode extension downloads to .alis/key.json on every environment switch,
// so that GOOGLE_APPLICATION_CREDENTIALS always points at a key that's valid
// for the environment currently active in .env (not a stale one left behind
// by whichever environment was active before).
func (s *ProductService) generateServiceAccountKey(envName string) ([]byte, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	req := &productsv1pb.GenerateServiceAccountKeyRequest{Resource: envName}
	buf, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("generateServiceAccountKey: marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.EnvironmentsService/GenerateServiceAccountKey", buf)
	if err != nil {
		return nil, fmt.Errorf("generateServiceAccountKey: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("generateServiceAccountKey: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("generateServiceAccountKey: response too short (%d bytes)", len(body))
	}
	resp := &productsv1pb.GenerateServiceAccountKeyResponse{}
	if err := proto.Unmarshal(body[5:], resp); err != nil {
		return nil, fmt.Errorf("generateServiceAccountKey: unmarshal response: %w", err)
	}
	keyData := resp.GetServiceAccountKey().GetPrivateKeyData()
	if len(keyData) == 0 {
		return nil, fmt.Errorf("generateServiceAccountKey: no private_key_data in response")
	}
	return keyData, nil
}

// SwitchEnvironment rewrites the local .alis/.env and .alis/key.json files to
// match the output produced by the Alis VSCode extension when switching
// environments.
func (s *ProductService) SwitchEnvironment(org, product, envName, projectID, projectNumber, region string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("home dir: %w", err)
	}

	envParts := strings.Split(envName, "/")
	envID := envParts[len(envParts)-1]

	alisDir := filepath.Join(home, "alis.build", org, "build", product, ".alis")
	envFilePath := filepath.Join(alisDir, ".env")
	keyFilePath := filepath.Join(alisDir, "key.json")

	keyData, err := s.generateServiceAccountKey(envName)
	if err != nil {
		return fmt.Errorf("generate service account key: %w", err)
	}

	vars, err := s.retrieveDeploymentEnvs(envName)
	if err != nil {
		return fmt.Errorf("retrieve deployment envs: %w", err)
	}

	var managed, nonManaged []DeploymentEnvVar
	for _, v := range vars {
		if v.Managed {
			managed = append(managed, v)
		} else {
			nonManaged = append(nonManaged, v)
		}
	}
	sort.Slice(managed, func(i, j int) bool { return managed[i].Name > managed[j].Name })
	sort.Slice(nonManaged, func(i, j int) bool { return nonManaged[i].Name > nonManaged[j].Name })

	builderURL := fmt.Sprintf("https://console.alisx.com/build/landing-zone/%s/%s/environments/%s/variables", org, product, envID)

	var sb strings.Builder
	sb.WriteString("# Alis Build Managed\n")
	for _, v := range managed {
		sb.WriteString(v.Name)
		sb.WriteString(`="`)
		sb.WriteString(v.Value)
		sb.WriteString("\"\n")
	}
	sb.WriteString("\n# Local Authentication\n")
	sb.WriteString(`GOOGLE_APPLICATION_CREDENTIALS="`)
	sb.WriteString(keyFilePath)
	sb.WriteString("\"\n")
	sb.WriteString("\n# Builder Managed via the Alis Build Console at ")
	sb.WriteString(builderURL)
	sb.WriteByte('\n')
	for _, v := range nonManaged {
		sb.WriteString(v.Name)
		sb.WriteString(`="`)
		sb.WriteString(v.Value)
		sb.WriteString("\"\n")
	}

	if err := os.MkdirAll(alisDir, 0755); err != nil {
		return fmt.Errorf("mkdir alis dir: %w", err)
	}
	if err := os.WriteFile(keyFilePath, keyData, 0600); err != nil {
		return fmt.Errorf("write key.json: %w", err)
	}
	return os.WriteFile(envFilePath, []byte(sb.String()), 0644)
}
