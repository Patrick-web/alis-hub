package main

import (
	"alis-hub-v3/internal/alisclient"
	"context"
	"fmt"
	"log"
	"time"

	"google.golang.org/protobuf/encoding/protowire"
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

	// google.protobuf.FieldMask: repeated field 1 = paths
	var readMask []byte
	for _, path := range []string{"name", "display_name", "status", "summary", "products"} {
		readMask = protowire.AppendTag(readMask, 1, protowire.BytesType)
		readMask = protowire.AppendString(readMask, path)
	}

	// ListBuildSpecsRequest: field 2=pageSize, field 5=read_mask
	var req []byte
	req = protowire.AppendTag(req, 2, protowire.VarintType)
	req = protowire.AppendVarint(req, 100)
	req = protowire.AppendTag(req, 5, protowire.BytesType)
	req = protowire.AppendBytes(req, readMask)

	body, grpcStatus, grpcMsg, err := s.alisClient.DoGRPC(ctx, "alis.os.buildspecs.v1.BuildSpecsService/ListBuildSpecs", req)
	if err != nil {
		return nil, fmt.Errorf("ListBuildSpecs: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListBuildSpecs: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return []BuildSpecItem{}, nil
	}
	return parseBuildSpecsList(body[5:]), nil
}

func parseBuildSpecsList(data []byte) []BuildSpecItem {
	var items []BuildSpecItem
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ == protowire.BytesType {
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				break
			}
			if num == 1 { // buildSpecsList
				items = append(items, parseBuildSpecItem(b))
			}
			data = data[m:]
		} else {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
		}
	}
	return items
}

func parseBuildSpecItem(data []byte) BuildSpecItem {
	item := BuildSpecItem{}
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
				return item
			}
			switch num {
			case 1:
				item.Name = string(b)
			case 2:
				item.DisplayName = string(b)
			case 4:
				item.Summary = string(b)
			case 6:
				item.Products = append(item.Products, string(b))
			}
			data = data[m:]
		case protowire.VarintType:
			v, m := protowire.ConsumeVarint(data)
			if m < 0 {
				return item
			}
			if num == 3 {
				item.Status = int32(v)
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return item
			}
			data = data[m:]
		}
	}
	return item
}
