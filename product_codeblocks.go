package main

import (
	"context"
	"fmt"
	"time"

	"google.golang.org/protobuf/encoding/protowire"
)

// ListCodeblocks fetches all available codeblocks from alis.bl.blocks.v1.BlocksService.
func (s *ProductService) ListCodeblocks() ([]Codeblock, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	fields := []string{"name", "display_name", "release_level", "publisher", "releases", "overview_details"}
	fm := marshalFieldMask(fields)
	var buf []byte
	buf = protowire.AppendTag(buf, 3, protowire.BytesType)
	buf = protowire.AppendBytes(buf, fm)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/RetrieveBlockDetails", buf)
	if err != nil {
		return nil, fmt.Errorf("ListCodeblocks: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListCodeblocks: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListCodeblocks: response too short (%d bytes)", len(body))
	}
	return parseCodeblocksResponse(body[5:])
}

// GetCodeblock fetches a single block by its short ID (e.g. "skills").
func (s *ProductService) GetCodeblock(blockId string) (*Codeblock, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	buf := marshalGetProductRequest("blocks/"+blockId,
		[]string{"name", "display_name", "release_level", "publisher", "releases", "tagline", "overview_details"})
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/GetBlock", buf)
	if err != nil {
		return nil, fmt.Errorf("GetCodeblock: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("GetCodeblock: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("GetCodeblock: response too short (%d bytes)", len(body))
	}
	var cb Codeblock
	parseBlockInto(body[5:], &cb)
	return &cb, nil
}

// DeleteCodeblock permanently deletes a block by its ID.
func (s *ProductService) DeleteCodeblock(blockId string) error {
	if err := s.initTokens(); err != nil {
		return err
	}
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, "blocks/"+blockId)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx,
		"alis.bl.blocks.v1.BlocksService/DeleteBlock", buf)
	if err != nil {
		return fmt.Errorf("DeleteCodeblock: %w", err)
	}
	if grpcStatus != 0 {
		return fmt.Errorf("DeleteCodeblock: grpc %d: %s", grpcStatus, grpcMsg)
	}
	return nil
}

// ListCodeblockVersions lists available versions for a block.
func (s *ProductService) ListCodeblockVersions(blockId string) ([]CodeblockVersion, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, "blocks/"+blockId)
	buf = protowire.AppendTag(buf, 2, protowire.VarintType)
	buf = protowire.AppendVarint(buf, 100)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlockVersionsService/ListBlockVersions", buf)
	if err != nil {
		return nil, fmt.Errorf("ListCodeblockVersions: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListCodeblockVersions: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListCodeblockVersions: response too short (%d bytes)", len(body))
	}
	return parseCodeblockVersionsResponse(body[5:]), nil
}

// GetCodeblockDoc returns documentation markdown for a specific block version.
// audience is "user" or "agent".
func (s *ProductService) GetCodeblockDoc(versionName, audience string) (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}
	fm := marshalFieldMask([]string{"name", "documentation"})
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, versionName)
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendBytes(buf, fm)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlockVersionsService/GetBlockVersion", buf)
	if err != nil {
		return "", fmt.Errorf("GetCodeblockDoc: %w", err)
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("GetCodeblockDoc: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("GetCodeblockDoc: response too short (%d bytes)", len(body))
	}
	userContent, agentContent := parseCodeblockDoc(body[5:])
	if audience == "agent" {
		return agentContent, nil
	}
	return userContent, nil
}

// GetCodeblockVersion returns full details for a block version including files.
// versionName is the resource name, e.g. "blocks/bb6b/versions/1.0.0-experimental1".
func (s *ProductService) GetCodeblockVersion(versionName string) (*CodeblockVersion, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, versionName)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlockVersionsService/GetBlockVersion", buf)
	if err != nil {
		return nil, fmt.Errorf("GetCodeblockVersion: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("GetCodeblockVersion: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("GetCodeblockVersion: response too short (%d bytes)", len(body))
	}
	v := parseCodeblockVersion(body[5:])
	return &v, nil
}

// ListCodeblockInstances lists installed instances for a block.
func (s *ProductService) ListCodeblockInstances(blockId string) ([]CodeblockInstance, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	fm := marshalFieldMask([]string{
		"name", "package", "state", "block", "block_version",
		"create_time", "update_time", "entitlement",
	})
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, "blocks/"+blockId)
	buf = protowire.AppendTag(buf, 4, protowire.BytesType) // field 4, not 2
	buf = protowire.AppendBytes(buf, fm)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.InstancesService/ListInstances", buf)
	if err != nil {
		return nil, fmt.Errorf("ListCodeblockInstances: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListCodeblockInstances: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListCodeblockInstances: response too short (%d bytes)", len(body))
	}
	return parseCodeblockInstancesResponse(body[5:]), nil
}

// GetCodeblockMembers fetches the IAM members for a block and resolves their avatar URLs.
// It chains GetIamPolicy → BatchRetrieveMaskedUsers.
func (s *ProductService) GetCodeblockMembers(blockId string) ([]CodeblockMember, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	// Step 1: GetIamPolicy to collect member IDs.
	var req1 []byte
	req1 = protowire.AppendTag(req1, 1, protowire.BytesType)
	req1 = protowire.AppendString(req1, "blocks/"+blockId)
	ctx1, cancel1 := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel1()
	body1, status1, msg1, err := s.doConsoleGRPCWeb(ctx1, "alis.bl.blocks.v1.BlocksService/GetIamPolicy", req1)
	if err != nil {
		return nil, fmt.Errorf("GetCodeblockMembers/GetIamPolicy: %w", err)
	}
	if status1 != 0 {
		return nil, fmt.Errorf("GetCodeblockMembers/GetIamPolicy: grpc %d: %s", status1, msg1)
	}
	if len(body1) < 5 {
		return nil, nil
	}
	members := parseIamPolicyMembers(body1[5:])
	if len(members) == 0 {
		return nil, nil
	}

	// Step 2: BatchRetrieveMaskedUsers for avatar URLs.
	var req2 []byte
	for _, m := range members {
		req2 = protowire.AppendTag(req2, 1, protowire.BytesType)
		req2 = protowire.AppendString(req2, m)
	}
	ctx2, cancel2 := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel2()
	body2, status2, msg2, err := s.doConsoleGRPCWeb(ctx2, "alis.os.iam.v2.UsersService/BatchRetrieveMaskedUsers", req2)
	if err != nil {
		return nil, fmt.Errorf("GetCodeblockMembers/BatchRetrieveMaskedUsers: %w", err)
	}
	if status2 != 0 {
		return nil, fmt.Errorf("GetCodeblockMembers/BatchRetrieveMaskedUsers: grpc %d: %s", status2, msg2)
	}
	if len(body2) < 5 {
		return nil, nil
	}
	return parseCodeblockMembers(body2[5:]), nil
}

// ListMyCodeblocks returns only the blocks published by the current user's account.
func (s *ProductService) ListMyCodeblocks() ([]Codeblock, error) {
	all, err := s.ListCodeblocks()
	if err != nil {
		return nil, err
	}
	myIDs := s.myAccountIDs()
	var mine []Codeblock
	for _, cb := range all {
		if myIDs[cb.Publisher] {
			mine = append(mine, cb)
		}
	}
	return mine, nil
}
