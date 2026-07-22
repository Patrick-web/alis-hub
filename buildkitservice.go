package main

import (
	"alis-hub-v3/internal/alisclient"
	"context"
	"fmt"
	"log"
	"time"

	buildspecsv1pb "alis-hub-v3/gen/go/alis/os/buildspecs/v1"

	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
)

// BuildSpecItem is a summary of a single build specification.
type BuildSpecItem struct {
	Name        string   `json:"name"`
	DisplayName string   `json:"displayName"`
	Status      int32    `json:"status"` // 0=unspecified, 1=new, 2=active, 3=completed
	Summary     string   `json:"summary"`
	Products    []string `json:"products"` // resource names: organisations/{org}/products/{product}
}

// BuildKitService is a Wails-bound service for Build Kit operations.
type BuildKitService struct {
	alisClient *alisclient.AlisClient
}

func NewBuildKitService() *BuildKitService {
	return &BuildKitService{}
}

func (s *BuildKitService) initClient() error {
	if s.alisClient != nil {
		return nil
	}
	log.Println("[buildkit] initialising Alis gRPC client")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	client, err := newAlisClient(ctx)
	if err != nil {
		return fmt.Errorf("connecting to Alis backend: %w", err)
	}
	s.alisClient = client
	log.Println("[buildkit] gRPC client ready")
	return nil
}

// ListBuildSpecs returns all build specs accessible to the current user.
// Status values: 0=UNSPECIFIED, 1=NEW, 2=ACTIVE, 3=COMPLETED
func (s *BuildKitService) ListBuildSpecs() ([]BuildSpecItem, error) {
	if err := s.initClient(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req := &buildspecsv1pb.ListBuildSpecsRequest{
		PageSize: 100,
		ReadMask: &fieldmaskpb.FieldMask{Paths: []string{"name", "display_name", "status", "summary", "products"}},
	}
	reqBytes, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("ListBuildSpecs: marshal request: %w", err)
	}

	body, grpcStatus, grpcMsg, err := s.alisClient.DoGRPC(ctx, "alis.os.buildspecs.v1.BuildSpecsService/ListBuildSpecs", reqBytes)
	if err != nil {
		return nil, fmt.Errorf("ListBuildSpecs: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListBuildSpecs: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return []BuildSpecItem{}, nil
	}
	resp := &buildspecsv1pb.ListBuildSpecsResponse{}
	if err := proto.Unmarshal(body[5:], resp); err != nil {
		return nil, fmt.Errorf("ListBuildSpecs: unmarshal response: %w", err)
	}
	items := make([]BuildSpecItem, 0, len(resp.GetBuildSpecs()))
	for _, bs := range resp.GetBuildSpecs() {
		items = append(items, BuildSpecItem{
			Name:        bs.GetName(),
			DisplayName: bs.GetDisplayName(),
			Status:      int32(bs.GetStatus()),
			Summary:     bs.GetSummary(),
			Products:    bs.GetProducts(),
		})
	}
	return items, nil
}
