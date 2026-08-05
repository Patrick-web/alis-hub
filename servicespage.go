package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
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

func (s *ProductService) GetServicesOverview(org, product string) (*ServicesOverview, error) {
	// Try CLI for faster neuron listing.
	neurons, err := s.fetchNeuronsCLI(org, product)
	if err != nil {
		log.Printf("[services] CLI product view failed, falling back to gRPC: %v", err)
		neurons, err = nil, nil
	}

	// If CLI failed, use gRPC neuron listing.
	if neurons == nil {
		if err := s.initTokens(); err != nil {
			return nil, err
		}
		parent := fmt.Sprintf("organisations/%s/products/%s", org, product)
		neurons, err = s.fetchNeurons(parent)
		if err != nil {
			return nil, err
		}
	}

	// Environments and deployments still need gRPC.
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	envs, err := s.ListEnvironments(org, product)
	if err != nil {
		return nil, err
	}

	envDeployments := make([]EnvDeployments, len(envs))
	var (
		mu          sync.Mutex
		firstDepErr error
		wg          sync.WaitGroup
	)
	for i, env := range envs {
		wg.Add(1)
		go func(idx int, envInfo EnvInfo) {
			defer wg.Done()
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
	wg.Wait()

	if firstDepErr != nil {
		return nil, firstDepErr
	}

	return &ServicesOverview{
		Neurons:      neurons,
		Environments: envDeployments,
	}, nil
}

// fetchNeuronsCLI gets neuron items from alis product view --json.
func (s *ProductService) fetchNeuronsCLI(org, product string) ([]NeuronItem, error) {
	if s.alisCli == nil {
		return nil, fmt.Errorf("alis CLI not available")
	}
	ref := org + "." + product
	result, err := s.alisCli.Run(context.Background(), "product", "view", ref, "--json")
	if err != nil {
		return nil, err
	}
	var v struct {
		Neurons []struct {
			ID      string `json:"id"`
			Version string `json:"version"`
			Status  string `json:"status"`
		} `json:"neurons"`
	}
	if err := json.Unmarshal(result.Stdout, &v); err != nil {
		return nil, fmt.Errorf("parse product view neurons: %w", err)
	}
	neurons := make([]NeuronItem, 0, len(v.Neurons))
	for _, n := range v.Neurons {
		state := int32(0)
		switch n.Status {
		case "BUILT":
			state = 1
		case "RETAGGED":
			state = 2
		case "BUILDING":
			state = 3
		case "FAILED":
			state = 4
		}
		neurons = append(neurons, NeuronItem{
			ID:      n.ID,
			Version: n.Version,
			State:   state,
		})
	}
	return neurons, nil
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
