package main

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	dbdv1 "alis-hub-v3/dbdv1"
	"alis-hub-v3/internal/alisclient"
)

// DeployService is a Wails-bound service that orchestrates the Deploy flow.
type DeployService struct {
	alisClient *alisclient.AlisClient
	backend    DBDBackend
}

func NewDeployService() *DeployService {
	return &DeployService{}
}

func (s *DeployService) setBackend(b DBDBackend) {
	s.backend = b
}

func (s *DeployService) initClient() error {
	if s.alisClient != nil {
		return nil
	}
	log.Println("[deploy] initialising Alis gRPC client")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	client, err := newAlisClient(ctx)
	if err != nil {
		return fmt.Errorf("connecting to Alis backend: %w", err)
	}
	s.alisClient = client
	log.Println("[deploy] gRPC client ready")
	return nil
}

// RunDeployResult is returned to the frontend after initiating a Deploy.
type RunDeployResult struct {
	OperationName string        `json:"operationName"`
	Version       string        `json:"version"`
	Deployments   []*DeployItem `json:"deployments"`
	Notes         string        `json:"notes"`
	Done          bool          `json:"done"`
	Error         string        `json:"error,omitempty"`
}

// DeployItem is a single deployment entry returned from the backend.
type DeployItem struct {
	LogsURL string `json:"logsUrl"`
}

// NeuronVersionSummary is a neuron version returned to the frontend.
// State: 1=BUILT, 2=RETAGGED, 3=BUILDING, 4=FAILED.
type NeuronVersionSummary struct {
	Name        string `json:"name"`       // full resource name e.g. organisations/x/products/y/neurons/bff-v1/versions/1-0-65
	Version     string `json:"version"`    // short version string e.g. 1.0.65
	CreateTime  int64  `json:"createTime"` // unix seconds
	BuildCommit string `json:"buildCommit"`
	LogsURL     string `json:"logsUrl"`
	State       int32  `json:"state"`
}

// ListNeuronVersions returns built/retagged versions for a neuron, newest first.
// neuron is the full neuron resource name e.g. "organisations/x/products/y/neurons/bff-v1".
func (s *DeployService) ListNeuronVersions(neuron string) ([]*NeuronVersionSummary, error) {
	if err := s.initClient(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	items, err := s.alisClient.ListNeuronVersions(ctx, neuron)
	if err != nil {
		log.Printf("[deploy] ListNeuronVersions error: %v", err)
		return nil, fmt.Errorf("ListNeuronVersions: %w", err)
	}

	var out []*NeuronVersionSummary
	for _, item := range items {
		out = append(out, &NeuronVersionSummary{
			Name:        item.Name,
			Version:     item.Version,
			CreateTime:  item.CreateTime,
			BuildCommit: item.BuildCommit,
			LogsURL:     item.LogsURL,
			State:       item.State,
		})
	}
	// Already ordered newest-first by the server, but reverse if needed.
	log.Printf("[deploy] ListNeuronVersions: %d versions for %s", len(out), neuron)
	return out, nil
}

// RunDeploy starts a Deploy operation on the Alis backend.
// environments is a list of environment resource names (e.g. ["organisations/x/products/y/environments/dev"]).
// neuron is the full neuron resource name. version is the neuron version to deploy.
// planOnly runs terraform plan only; beta allows beta-state neurons to be deployed.
func (s *DeployService) RunDeploy(neuron, version string, environments []string, planOnly, beta bool) (*RunDeployResult, error) {
	log.Printf("[deploy] RunDeploy: neuron=%s version=%s envs=%v planOnly=%v beta=%v backend=%T", neuron, version, environments, planOnly, beta, s.backend)

	// `alis deploy` has no beta flag, so a beta deploy cannot be expressed
	// through the CLI. Route it to the gRPC path rather than dropping the
	// caller's intent and deploying as if beta had not been requested.
	if _, isCLI := s.backend.(*CLIBackend); isCLI && beta {
		log.Printf("[deploy] beta=true not expressible via alis CLI — using gRPC path")
		return s.runDeployGRPC(context.Background(), neuron, version, environments, planOnly, beta)
	}
	if s.backend != nil {
		return s.backend.RunDeploy(context.Background(), neuron, version, environments, planOnly)
	}
	return s.runDeployGRPC(context.Background(), neuron, version, environments, planOnly, beta)
}

// runDeployGRPC is the original gRPC implementation of RunDeploy.
func (s *DeployService) runDeployGRPC(ctx context.Context, neuron, version string, environments []string, planOnly, beta bool) (*RunDeployResult, error) {
	if err := s.initClient(); err != nil {
		return nil, err
	}

	// The server expects a dotted version string e.g. "1.0.66" (not a full resource name,
	// not dashes). If a full resource name was passed, extract the last segment and convert
	// hyphens to dots (e.g. ".../versions/1-0-66" → "1.0.66").
	versionID := version
	if idx := strings.LastIndex(version, "/"); idx >= 0 {
		versionID = strings.ReplaceAll(version[idx+1:], "-", ".")
	}

	log.Printf("[deploy] RunDeploy: neuron=%s versionID=%s envs=%v planOnly=%v beta=%v", neuron, versionID, environments, planOnly, beta)

	req := &dbdv1.RunDeployRequest{
		Neuron:       neuron,
		Version:      versionID,
		Environments: environments,
		PlanOnly:     planOnly,
		Beta:         beta,
	}

	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	op, err := s.alisClient.RunDeploy(ctx, req)
	if err != nil {
		log.Printf("[deploy] RunDeploy: gRPC error: %v", err)
		return nil, fmt.Errorf("RunDeploy: %w", err)
	}

	log.Printf("[deploy] RunDeploy: operation started name=%s done=%v", op.Name, op.Done)

	result := &RunDeployResult{
		OperationName: op.Name,
		Done:          op.Done,
	}

	if e, ok := op.Result.(*dbdv1.OperationError); ok {
		log.Printf("[deploy] RunDeploy: operation returned error immediately: %s", e.Message)
		result.Error = e.Message
	}

	return result, nil
}

// PollDeployOperation checks the status of a running Deploy operation.
func (s *DeployService) PollDeployOperation(name string) (*RunDeployResult, error) {
	if s.backend != nil {
		return s.backend.PollDeploy(context.Background(), name)
	}
	return s.pollDeployGRPC(context.Background(), name)
}

// pollDeployGRPC is the original gRPC implementation of PollDeployOperation.
func (s *DeployService) pollDeployGRPC(ctx context.Context, name string) (*RunDeployResult, error) {
	if s.alisClient == nil {
		return nil, fmt.Errorf("not connected to Alis backend")
	}

	log.Printf("[deploy] PollDeployOperation: polling %s", name)

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	op, err := s.alisClient.GetOperation(ctx, name)
	if err != nil {
		log.Printf("[deploy] PollDeployOperation: GetOperation error: %v", err)
		return nil, fmt.Errorf("poll operation: %w", err)
	}

	log.Printf("[deploy] PollDeployOperation: done=%v", op.Done)

	result := &RunDeployResult{
		OperationName: op.Name,
		Done:          op.Done,
	}

	meta := alisclient.UnpackDeployMetadata(op)
	if meta != nil {
		log.Printf("[deploy] PollDeployOperation: metadata version=%q notes=%q deployments=%d", meta.Version, meta.Notes, len(meta.Deployments))
		result.Version = meta.Version
		result.Notes = meta.Notes
		for _, d := range meta.Deployments {
			result.Deployments = append(result.Deployments, &DeployItem{LogsURL: d.LogsURL})
		}
	} else {
		log.Printf("[deploy] PollDeployOperation: no metadata in operation")
	}

	if e, ok := op.Result.(*dbdv1.OperationError); ok {
		log.Printf("[deploy] PollDeployOperation: operation failed: code=%d message=%s", e.Code, e.Message)
		result.Error = e.Message
	}

	return result, nil
}

// FetchDeployLogs fetches log output from a deploy logs URL.
// Pass 0 as textOffset on the first call; pass the returned NextOffset on subsequent calls.
// The deploy page defaults to a structured view; we fetch ?tab=logs for raw command output.
func (s *DeployService) FetchDeployLogs(logsUrl string, textOffset int64) (*BuildLogsResult, error) {
	if s.alisClient == nil {
		return nil, fmt.Errorf("not connected to Alis backend")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// The alisproxy deploy page defaults to the "Deploy" tab. The raw logs
	// are on the "Logs" tab, so append ?tab=logs if not already present.
	url := logsUrl
	if !strings.Contains(url, "?tab=") {
		if strings.Contains(url, "?") {
			url += "&tab=logs"
		} else {
			url += "?tab=logs"
		}
	}

	body, _, err := s.alisClient.FetchURL(ctx, url, 0)
	if err != nil {
		return nil, fmt.Errorf("fetch deploy logs: %w", err)
	}

	text := extractBuildLogText(string(body))
	newContent := ""
	nextOffset := textOffset
	if int64(len(text)) > textOffset {
		newContent = text[textOffset:]
		nextOffset = int64(len(text))
	}

	log.Printf("[deploy] FetchDeployLogs: textLen=%d offset=%d new=%d", len(text), textOffset, len(newContent))
	return &BuildLogsResult{
		Content:    newContent,
		NextOffset: nextOffset,
	}, nil
}
