package main

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"google.golang.org/protobuf/encoding/protowire"
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

	parent := fmt.Sprintf("organisations/%s/products/%s", org, product)

	// CreateNeuronRequest: field 1=parent, field 3=neuronId
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, parent)
	buf = protowire.AppendTag(buf, 3, protowire.BytesType)
	buf = protowire.AppendString(buf, neuronId)

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
	neuron, err := parseNeuronItem(body[5:])
	if err != nil {
		return nil, fmt.Errorf("CreateNeuron: parse response: %w", err)
	}
	return neuron, nil
}

func (s *ProductService) GetServicesOverview(org, product string) (*ServicesOverview, error) {
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
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, parent)

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
	return parseNeuronsResponse(body[5:])
}

func (s *ProductService) fetchDeployments(envResourceName string) ([]DeploymentItem, error) {
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, envResourceName)

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
	return parseDeploymentsResponse(body[5:])
}

func parseNeuronsResponse(data []byte) ([]NeuronItem, error) {
	var neurons []NeuronItem
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return neurons, nil
			}
			if num == 1 {
				neuron, _ := parseNeuronItem(b)
				if neuron != nil {
					neurons = append(neurons, *neuron)
				}
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return neurons, nil
			}
			data = data[m:]
		}
	}
	return neurons, nil
}

func parseNeuronItem(data []byte) (*NeuronItem, error) {
	n := &NeuronItem{}
	for len(data) > 0 {
		num, typ, m := protowire.ConsumeTag(data)
		if m < 0 {
			break
		}
		data = data[m:]
		switch typ {
		case protowire.VarintType:
			v, m := protowire.ConsumeVarint(data)
			if m < 0 {
				return n, nil
			}
			if num == 5 {
				n.State = int32(v)
			}
			data = data[m:]
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return n, nil
			}
			switch num {
			case 1:
				parts := strings.Split(string(b), "/")
				n.ID = parts[len(parts)-1]
			case 2:
				n.Version = string(b)
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return n, nil
			}
			data = data[m:]
		}
	}
	return n, nil
}

func parseDeploymentsResponse(data []byte) ([]DeploymentItem, error) {
	var deps []DeploymentItem
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return deps, nil
			}
			if num == 1 {
				dep, _ := parseDeploymentItem(b)
				if dep != nil {
					deps = append(deps, *dep)
				}
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return deps, nil
			}
			data = data[m:]
		}
	}
	return deps, nil
}

func parseDeploymentItem(data []byte) (*DeploymentItem, error) {
	d := &DeploymentItem{}
	for len(data) > 0 {
		num, typ, m := protowire.ConsumeTag(data)
		if m < 0 {
			break
		}
		data = data[m:]
		switch typ {
		case protowire.VarintType:
			v, m := protowire.ConsumeVarint(data)
			if m < 0 {
				return d, nil
			}
			if num == 4 {
				d.State = int32(v)
			}
			data = data[m:]
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return d, nil
			}
			switch num {
			case 1:
				parts := strings.Split(string(b), "/")
				d.NeuronID = parts[len(parts)-1]
			case 2:
				d.Version = string(b)
			case 5:
				d.LogsURL = string(b)
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return d, nil
			}
			data = data[m:]
		}
	}
	return d, nil
}
