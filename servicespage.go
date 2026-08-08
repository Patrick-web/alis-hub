package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"

	neuronsv1pb "alis-hub-v3/gen/go/alis/os/neurons/v1"

	"google.golang.org/protobuf/proto"
)

type NeuronItem struct {
	ID      string `json:"id"`
	Version string `json:"version"`
	State   int32  `json:"state"`
}

type DeploymentItem struct {
	NeuronID string `json:"neuronId"`
	Version  string `json:"version"`
	State    int32  `json:"state"`
	LogsURL  string `json:"logsUrl"`
}

type EnvDeployments struct {
	Name        string           `json:"name"`
	DisplayName string           `json:"displayName"`
	Deployments []DeploymentItem `json:"deployments"`
}

type ServicesOverview struct {
	Neurons      []NeuronItem     `json:"neurons"`
	Environments []EnvDeployments `json:"environments"`
}

// GetServicesOverview fetches neurons and per-environment deployments in parallel.
// CreateNeuron creates a new neuron (service) under the given org/product.
// neuronId must follow the pattern: lowercase letters/digits/hyphens, ending with -v{N}.
func (s *ProductService) CreateNeuron(org, product, neuronId string) (*NeuronItem, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	req := &neuronsv1pb.CreateNeuronRequest{
		Parent:   fmt.Sprintf("organisations/%s/products/%s", org, product),
		NeuronId: neuronId,
	}
	buf, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("CreateNeuron: marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.neurons.v1.NeuronsService/CreateNeuron", buf)
	if err != nil {
		return nil, fmt.Errorf("CreateNeuron: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("CreateNeuron: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("CreateNeuron: response too short (%d bytes)", len(body))
	}
	n := &neuronsv1pb.Neuron{}
	if err := proto.Unmarshal(body[5:], n); err != nil {
		return nil, fmt.Errorf("CreateNeuron: unmarshal response: %w", err)
	}
	return neuronItemFromProto(n), nil
}

// GetServicesOverview returns every service in a product plus the per-environment
// deployment state of each.
//
// `alis product view --json` answers all of this in a single call — it returns
// the neuron list *and* an environments array whose `deployments` object is
// keyed by neuron id. The gRPC path below needs 2+N round trips for the same
// data (ListNeurons, ListEnvironments, then one ListDeployments per
// environment), so the CLI is tried first and gRPC is the fallback.
func (s *ProductService) GetServicesOverview(org, product string) (*ServicesOverview, error) {
	if s.alisCli != nil {
		if overview, err := s.servicesOverviewCLI(org, product); err == nil {
			return overview, nil
		} else {
			log.Printf("[services] CLI product view failed, falling back to gRPC: %v", err)
		}
	}
	return s.servicesOverviewGRPC(org, product)
}

// productViewResponse is the verified shape of `alis product view --json`.
// See docs/ALIS_CLI_FEATURES.md § Verified JSON Response Shapes.
type productViewResponse struct {
	Neurons []struct {
		ID      string `json:"id"`
		Version string `json:"version"`
		Status  string `json:"status"`
	} `json:"neurons"`
	Environments []struct {
		ID          string `json:"id"`
		DisplayName string `json:"displayName"`
		// deployments is a JSON object keyed by neuron id, not an array.
		Deployments map[string]struct {
			ID      string `json:"id"`
			Version string `json:"version"`
			Status  string `json:"status"`
			LogsURI string `json:"logsUri"`
		} `json:"deployments"`
	} `json:"environments"`
}

// servicesOverviewCLI builds the whole overview from one `alis product view`.
func (s *ProductService) servicesOverviewCLI(org, product string) (*ServicesOverview, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	ref := org + "." + product
	result, err := s.alisCli.Run(ctx, "product", "view", ref, "--json")
	if err != nil {
		return nil, err
	}
	var v productViewResponse
	if err := json.Unmarshal(result.Stdout, &v); err != nil {
		return nil, fmt.Errorf("parse product view: %w", err)
	}

	neurons := make([]NeuronItem, 0, len(v.Neurons))
	for _, n := range v.Neurons {
		neurons = append(neurons, NeuronItem{
			ID:      n.ID,
			Version: n.Version,
			State:   neuronStateFromCLI(n.Status),
		})
	}

	envDeployments := make([]EnvDeployments, 0, len(v.Environments))
	for _, e := range v.Environments {
		deps := make([]DeploymentItem, 0, len(e.Deployments))
		for neuronID, d := range e.Deployments {
			// The map key is authoritative; the nested id repeats it.
			deps = append(deps, DeploymentItem{
				NeuronID: neuronID,
				Version:  d.Version,
				State:    deploymentStateFromCLI(d.Status),
				LogsURL:  d.LogsURI,
			})
		}
		// Map iteration is unordered — sort so the UI doesn't reshuffle rows
		// between refreshes.
		sort.Slice(deps, func(i, j int) bool { return deps[i].NeuronID < deps[j].NeuronID })

		envDeployments = append(envDeployments, EnvDeployments{
			// The frontend keys environments off the full resource name, which
			// the CLI reports only as a bare id.
			Name:        fmt.Sprintf("organisations/%s/products/%s/environments/%s", org, product, e.ID),
			DisplayName: e.DisplayName,
			Deployments: deps,
		})
	}

	return &ServicesOverview{Neurons: neurons, Environments: envDeployments}, nil
}

// neuronStateFromCLI maps a protojson NeuronVersion_State string onto the
// numeric state the frontend expects (BUILT=1, RETAGGED=2, BUILDING=3, …).
func neuronStateFromCLI(status string) int32 {
	if v, ok := neuronsv1pb.NeuronVersion_State_value[status]; ok {
		return v
	}
	return int32(neuronsv1pb.NeuronVersion_UNSPECIFIED)
}

// deploymentStateFromCLI maps a protojson Deployment_State string onto the
// numeric state the frontend expects (RUNNING=1, DEPLOY_FAILED=3, PLANNED=5, …).
func deploymentStateFromCLI(status string) int32 {
	if v, ok := neuronsv1pb.Deployment_State_value[status]; ok {
		return v
	}
	return int32(neuronsv1pb.Deployment_STATE_UNSPECIFIED)
}

// servicesOverviewGRPC is the Console API path: ListNeurons and
// ListEnvironments in parallel, then one ListDeployments per environment.
func (s *ProductService) servicesOverviewGRPC(org, product string) (*ServicesOverview, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	parent := fmt.Sprintf("organisations/%s/products/%s", org, product)

	var (
		neurons    []NeuronItem
		envs       []EnvInfo
		neuronsErr error
		envsErr    error
		wg         sync.WaitGroup
	)

	wg.Add(2)
	go func() {
		defer wg.Done()
		neurons, neuronsErr = s.fetchNeurons(parent)
	}()
	go func() {
		defer wg.Done()
		envs, envsErr = s.ListEnvironments(org, product)
	}()
	wg.Wait()

	if neuronsErr != nil {
		return nil, neuronsErr
	}
	if envsErr != nil {
		return nil, envsErr
	}

	envDeployments := make([]EnvDeployments, len(envs))
	var (
		mu          sync.Mutex
		firstDepErr error
		wg2         sync.WaitGroup
	)
	for i, env := range envs {
		wg2.Add(1)
		go func(idx int, envInfo EnvInfo) {
			defer wg2.Done()
			deps, err := s.fetchDeployments(envInfo.Name)
			if err != nil {
				mu.Lock()
				if firstDepErr == nil {
					firstDepErr = err
				}
				mu.Unlock()
				return
			}
			envDeployments[idx] = EnvDeployments{
				Name:        envInfo.Name,
				DisplayName: envInfo.DisplayName,
				Deployments: deps,
			}
		}(i, env)
	}
	wg2.Wait()

	if firstDepErr != nil {
		return nil, firstDepErr
	}

	return &ServicesOverview{
		Neurons:      neurons,
		Environments: envDeployments,
	}, nil
}

func (s *ProductService) fetchNeurons(parent string) ([]NeuronItem, error) {
	req := &neuronsv1pb.ListNeuronsRequest{Parent: parent}
	buf, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("ListNeurons: marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.neurons.v1.NeuronsService/ListNeurons", buf)
	if err != nil {
		return nil, fmt.Errorf("ListNeurons: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListNeurons: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListNeurons: response too short (%d bytes)", len(body))
	}
	resp := &neuronsv1pb.ListNeuronsResponse{}
	if err := proto.Unmarshal(body[5:], resp); err != nil {
		return nil, fmt.Errorf("ListNeurons: unmarshal response: %w", err)
	}
	neurons := make([]NeuronItem, 0, len(resp.GetNeurons()))
	for _, n := range resp.GetNeurons() {
		neurons = append(neurons, *neuronItemFromProto(n))
	}
	return neurons, nil
}

func (s *ProductService) fetchDeployments(envResourceName string) ([]DeploymentItem, error) {
	req := &neuronsv1pb.ListDeploymentsRequest{Parent: envResourceName}
	buf, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("ListDeployments: marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.neurons.v1.DeploymentsService/ListDeployments", buf)
	if err != nil {
		return nil, fmt.Errorf("ListDeployments: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListDeployments: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListDeployments: response too short (%d bytes)", len(body))
	}
	resp := &neuronsv1pb.ListDeploymentsResponse{}
	if err := proto.Unmarshal(body[5:], resp); err != nil {
		return nil, fmt.Errorf("ListDeployments: unmarshal response: %w", err)
	}
	deps := make([]DeploymentItem, 0, len(resp.GetDeployments()))
	for _, d := range resp.GetDeployments() {
		deps = append(deps, DeploymentItem{
			NeuronID: lastPathSegment(d.GetName()),
			Version:  d.GetVersion(),
			State:    int32(d.GetState()),
			LogsURL:  d.GetLogsUrl(),
		})
	}
	return deps, nil
}

// neuronItemFromProto maps a neurons.v1.Neuron onto NeuronItem, using the last
// path segment of the resource name as the ID.
func neuronItemFromProto(n *neuronsv1pb.Neuron) *NeuronItem {
	return &NeuronItem{
		ID:      lastPathSegment(n.GetName()),
		Version: n.GetVersion(),
		State:   n.GetLatestVersionState(),
	}
}

// lastPathSegment returns the final "/"-separated segment of a resource name.
func lastPathSegment(name string) string {
	parts := strings.Split(name, "/")
	return parts[len(parts)-1]
}
