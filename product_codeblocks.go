package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	accountsv1pb "alis-hub-v3/gen/go/alis/os/accounts/v1"
	iamv2pb "alis-hub-v3/gen/go/alis/os/iam/v2"

	blocksv1pb "alis-hub-v3/gen/go/alis/bl/blocks/v1"

	iampb "cloud.google.com/go/iam/apiv1/iampb"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
)

// ListCodeblocks fetches all available codeblocks from alis.bl.blocks.v1.BlocksService.
func (s *ProductService) ListCodeblocks() ([]Codeblock, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	req := &blocksv1pb.RetrieveBlockDetailsRequest{
		ReadMask: &fieldmaskpb.FieldMask{Paths: []string{
			"name", "display_name", "release_level", "publisher", "releases", "overview_details",
		}},
	}
	buf, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("ListCodeblocks: marshal request: %w", err)
	}

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

	resp := &blocksv1pb.RetrieveBlockDetailsResponse{}
	if err := proto.Unmarshal(body[5:], resp); err != nil {
		return nil, fmt.Errorf("ListCodeblocks: unmarshal response: %w", err)
	}

	var blocks []Codeblock
	for _, bd := range resp.GetInstalledBlocks() {
		cb := blockDetailToCodeblock(bd)
		if cb.Name != "" {
			blocks = append(blocks, cb)
		}
	}
	for _, bd := range resp.GetAvailableBlocks() {
		cb := blockDetailToCodeblock(bd)
		if cb.Name != "" {
			blocks = append(blocks, cb)
		}
	}

	s.resolvePublisherDisplayNames(ctx, blocks)

	return blocks, nil
}

// GetCodeblock fetches a single block by its short ID (e.g. "skills").
func (s *ProductService) GetCodeblock(blockId string) (*Codeblock, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	req := &blocksv1pb.GetBlockRequest{
		Name: "blocks/" + blockId,
		ReadMask: &fieldmaskpb.FieldMask{Paths: []string{
			"name", "display_name", "release_level", "publisher", "releases", "tagline", "overview_details",
		}},
	}
	buf, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("GetCodeblock: marshal request: %w", err)
	}
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
	block := &blocksv1pb.Block{}
	if err := proto.Unmarshal(body[5:], block); err != nil {
		return nil, fmt.Errorf("GetCodeblock: unmarshal response: %w", err)
	}
	cb := blockToCodeblock(block)
	if cb.Publisher != "" {
		blocks := []Codeblock{cb}
		s.resolvePublisherDisplayNames(ctx, blocks)
		cb = blocks[0]
	}
	return &cb, nil
}

// DeleteCodeblock permanently deletes a block by its ID.
func (s *ProductService) DeleteCodeblock(blockId string) error {
	if err := s.initTokens(); err != nil {
		return err
	}
	req := &blocksv1pb.DeleteBlockRequest{Name: "blocks/" + blockId}
	buf, err := proto.Marshal(req)
	if err != nil {
		return fmt.Errorf("DeleteCodeblock: marshal request: %w", err)
	}
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

// GetCodeblockDoc returns documentation markdown for a specific block version.
// audience is "user" or "agent".
func (s *ProductService) GetCodeblockDoc(versionName, audience string) (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}
	req := &blocksv1pb.GetBlockVersionRequest{
		Name:     versionName,
		ReadMask: &fieldmaskpb.FieldMask{Paths: []string{"name", "documentation"}},
	}
	buf, err := proto.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("GetCodeblockDoc: marshal request: %w", err)
	}
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
	bv := &blocksv1pb.BlockVersion{}
	if err := proto.Unmarshal(body[5:], bv); err != nil {
		return "", fmt.Errorf("GetCodeblockDoc: unmarshal response: %w", err)
	}
	doc := bv.GetDocumentation()
	if audience == "agent" {
		return doc.GetAgentContent().GetContent(), nil
	}
	return doc.GetUserContent().GetContent(), nil
}

// GetCodeblockVersion returns full details for a block version including files.
// versionName is the resource name, e.g. "blocks/bb6b/versions/1.0.0-experimental1".
func (s *ProductService) GetCodeblockVersion(versionName string) (*CodeblockVersion, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	req := &blocksv1pb.GetBlockVersionRequest{Name: versionName}
	buf, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("GetCodeblockVersion: marshal request: %w", err)
	}
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
	bv := &blocksv1pb.BlockVersion{}
	if err := proto.Unmarshal(body[5:], bv); err != nil {
		return nil, fmt.Errorf("GetCodeblockVersion: unmarshal response: %w", err)
	}
	v := blockVersionToCodeblockVersion(bv)
	return &v, nil
}

// ListCodeblockInstances lists installed instances for a block.
func (s *ProductService) ListCodeblockInstances(blockId string) ([]CodeblockInstance, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	req := &blocksv1pb.ListInstancesRequest{
		Parent: "blocks/" + blockId,
		ReadMask: &fieldmaskpb.FieldMask{Paths: []string{
			"name", "package", "state", "block", "block_version",
			"create_time", "update_time", "entitlement",
		}},
	}
	buf, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("ListCodeblockInstances: marshal request: %w", err)
	}
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
	resp := &blocksv1pb.ListInstancesResponse{}
	if err := proto.Unmarshal(body[5:], resp); err != nil {
		return nil, fmt.Errorf("ListCodeblockInstances: unmarshal response: %w", err)
	}
	instances := make([]CodeblockInstance, 0, len(resp.GetInstances()))
	for _, inst := range resp.GetInstances() {
		ci := instanceToCodeblockInstance(inst)
		if ci.Name != "" || ci.Package != "" {
			instances = append(instances, ci)
		}
	}
	return instances, nil
}

// GetCodeblockMembers fetches the IAM members for a block and resolves their avatar URLs.
// It chains GetIamPolicy → BatchRetrieveMaskedUsers.
func (s *ProductService) GetCodeblockMembers(blockId string) ([]CodeblockMember, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	// Step 1: GetIamPolicy to collect member IDs.
	req1 := &iampb.GetIamPolicyRequest{Resource: "blocks/" + blockId}
	reqBytes1, err := proto.Marshal(req1)
	if err != nil {
		return nil, fmt.Errorf("GetCodeblockMembers: marshal request: %w", err)
	}
	ctx1, cancel1 := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel1()
	body1, status1, msg1, err := s.doConsoleGRPCWeb(ctx1, "alis.bl.blocks.v1.BlocksService/GetIamPolicy", reqBytes1)
	if err != nil {
		return nil, fmt.Errorf("GetCodeblockMembers/GetIamPolicy: %w", err)
	}
	if status1 != 0 {
		return nil, fmt.Errorf("GetCodeblockMembers/GetIamPolicy: grpc %d: %s", status1, msg1)
	}
	if len(body1) < 5 {
		return nil, nil
	}
	policy := &iampb.Policy{}
	if err := proto.Unmarshal(body1[5:], policy); err != nil {
		return nil, fmt.Errorf("GetCodeblockMembers: unmarshal policy: %w", err)
	}

	seen := map[string]bool{}
	var members []string
	for _, b := range policy.GetBindings() {
		for _, m := range b.GetMembers() {
			if strings.HasPrefix(m, "user:") {
				uid := "users/" + strings.TrimPrefix(m, "user:")
				if !seen[uid] {
					seen[uid] = true
					members = append(members, uid)
				}
			}
		}
	}
	if len(members) == 0 {
		return nil, nil
	}

	// Step 2: BatchRetrieveMaskedUsers for avatar URLs.
	req2 := &iamv2pb.BatchRetrieveMaskedUsersRequest{Users: members}
	reqBytes2, err := proto.Marshal(req2)
	if err != nil {
		return nil, fmt.Errorf("GetCodeblockMembers: marshal BatchRetrieveMaskedUsers request: %w", err)
	}
	ctx2, cancel2 := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel2()
	body2, status2, msg2, err := s.doConsoleGRPCWeb(ctx2, "alis.os.iam.v2.UsersService/BatchRetrieveMaskedUsers", reqBytes2)
	if err != nil {
		return nil, fmt.Errorf("GetCodeblockMembers/BatchRetrieveMaskedUsers: %w", err)
	}
	if status2 != 0 {
		return nil, fmt.Errorf("GetCodeblockMembers/BatchRetrieveMaskedUsers: grpc %d: %s", status2, msg2)
	}
	if len(body2) < 5 {
		return nil, nil
	}
	usersResp := &iamv2pb.BatchRetrieveMaskedUsersResponse{}
	if err := proto.Unmarshal(body2[5:], usersResp); err != nil {
		return nil, fmt.Errorf("GetCodeblockMembers: unmarshal users response: %w", err)
	}
	result := make([]CodeblockMember, 0, len(usersResp.GetMaskedUsers()))
	for _, mu := range usersResp.GetMaskedUsers() {
		cm := codeblockMemberFromV2Masked(mu)
		if cm.Name != "" || cm.DisplayName != "" {
			result = append(result, cm)
		}
	}
	return result, nil
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

// resolvePublisherDisplayNames populates PublisherDisplayName on each block by
// calling RetrieveMaskedAccounts for the unique publisher account IDs.
func (s *ProductService) resolvePublisherDisplayNames(ctx context.Context, blocks []Codeblock) {
	ids := make(map[string]bool)
	for _, cb := range blocks {
		if cb.Publisher != "" && strings.HasPrefix(cb.Publisher, "accounts/") {
			id := strings.TrimPrefix(cb.Publisher, "accounts/")
			ids[id] = true
		}
	}
	if len(ids) == 0 {
		return
	}

	req := &accountsv1pb.RetrieveMaskedAccountsRequest{}
	for id := range ids {
		req.Accounts = append(req.Accounts, "accounts/"+id)
	}
	buf, err := proto.Marshal(req)
	if err != nil {
		return
	}

	fetchCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	resp, grpcStatus, _, err := s.doConsoleGRPCWeb(fetchCtx,
		"alis.os.accounts.v1.AccountsService/RetrieveMaskedAccounts", buf)
	if err != nil || grpcStatus != 0 || len(resp) < 5 {
		return
	}

	maResp := &accountsv1pb.RetrieveMaskedAccountsResponse{}
	if err := proto.Unmarshal(resp[5:], maResp); err != nil {
		return
	}

	displayNames := make(map[string]string)
	for key, ma := range maResp.GetMaskedAccounts() {
		if ma.GetDisplayName() != "" {
			displayNames[key] = ma.GetDisplayName()
		}
	}

	for i, cb := range blocks {
		if name, ok := displayNames[cb.Publisher]; ok {
			blocks[i].PublisherDisplayName = name
		}
	}
}

// ── Block ↔ Codeblock conversion helpers ────────────────────────────────────

// blockDetailToCodeblock maps one RetrieveBlockDetailsResponse.BlockDetail onto
// a Codeblock, carrying over its total_installs count.
func blockDetailToCodeblock(bd *blocksv1pb.RetrieveBlockDetailsResponse_BlockDetail) Codeblock {
	var cb Codeblock
	if b := bd.GetBlock(); b != nil {
		cb = blockToCodeblock(b)
	}
	cb.InstallCount = bd.GetTotalInstalls()
	return cb
}

// blockToCodeblock maps a Block message onto the app's Codeblock JSON-facing struct.
func blockToCodeblock(b *blocksv1pb.Block) Codeblock {
	cb := Codeblock{
		Name:         b.GetName(),
		DisplayName:  b.GetDisplayName(),
		ReleaseLevel: int32(b.GetReleaseLevel()),
		Tagline:      b.GetTagline(),
		Publisher:    b.GetPublisher().GetAccount(),
	}
	if rel := b.GetReleases(); rel != nil {
		if rel.GetBeta() != "" {
			cb.LatestVersion = rel.GetBeta()
		} else {
			cb.LatestVersion = rel.GetGa()
		}
	}
	if ov := b.GetOverviewDetails(); ov != nil {
		cb.BannerURL = ov.GetBannerUri()
		cb.Headline = ov.GetHeroStatement()
		cb.Description = ov.GetDescription()
		cb.Highlights = ov.GetHighlights()
		for _, kf := range ov.GetKeyFeatures() {
			cb.KeyFeatures = append(cb.KeyFeatures, CodeblockFeature{Title: kf.GetTitle(), Description: kf.GetDescription()})
		}
		for _, layer := range ov.GetCodeArchitecture() {
			cb.CodeArchitecture = append(cb.CodeArchitecture, CodeblockLayer{Title: layer.GetTitle(), Description: layer.GetDescription()})
		}
		if cb.Headline == "" {
			cb.Headline = ov.GetTagline()
		}
	}
	return cb
}

// blockVersionToCodeblockVersion maps a BlockVersion message onto the app's
// CodeblockVersion JSON-facing struct.
func blockVersionToCodeblockVersion(bv *blocksv1pb.BlockVersion) CodeblockVersion {
	v := CodeblockVersion{
		Name:         bv.GetName(),
		ReleaseLevel: int32(bv.GetReleaseLevel()),
		ReleaseNotes: bv.GetReleaseNotes(),
	}
	if i := strings.LastIndex(v.Name, "/"); i >= 0 {
		v.VersionTag = v.Name[i+1:]
	} else {
		v.VersionTag = v.Name
	}
	if v.VersionTag == "" {
		v.VersionTag = bv.GetVersion()
	}
	if ct := bv.GetCreateTime(); ct != nil {
		v.CreateTime = ct.AsTime().UTC().Format(time.RFC3339)
	}
	if ut := bv.GetUpdateTime(); ut != nil {
		v.UpdateTime = ut.AsTime().UTC().Format(time.RFC3339)
	}

	// ContributedContent and SampleContent carry identical file layouts on the wire;
	// prefer ContributedContent, falling back to SampleContent if unset.
	content := bv.GetContributedContent()
	if content == nil {
		content = bv.GetSampleContent()
	}
	if content != nil {
		protoFolder := CodeblockFolder{Name: "Proto"}
		infraFolder := CodeblockFolder{Name: "Infra"}
		buildFolder := CodeblockFolder{Name: "Build"}
		for _, f := range content.GetProtoFiles() {
			protoFolder.Files = append(protoFolder.Files, CodeblockFileItem{Name: f.GetFilename(), Content: string(f.GetContent())})
		}
		for _, f := range content.GetInfraFiles() {
			infraFolder.Files = append(infraFolder.Files, CodeblockFileItem{Name: f.GetFilename(), Content: string(f.GetContent())})
		}
		for _, f := range content.GetBuildFiles() {
			buildFolder.Files = append(buildFolder.Files, CodeblockFileItem{Name: f.GetFilename(), Content: string(f.GetContent())})
		}
		if len(protoFolder.Files) > 0 {
			v.Files = append(v.Files, protoFolder)
		}
		if len(infraFolder.Files) > 0 {
			v.Files = append(v.Files, infraFolder)
		}
		if len(buildFolder.Files) > 0 {
			v.Files = append(v.Files, buildFolder)
		}
	}
	return v
}

// instanceToCodeblockInstance maps an Instance message onto the app's
// CodeblockInstance JSON-facing struct.
func instanceToCodeblockInstance(inst *blocksv1pb.Instance) CodeblockInstance {
	ci := CodeblockInstance{
		Name:         inst.GetName(),
		Package:      inst.GetPackage(),
		Block:        inst.GetBlock(),
		BlockVersion: inst.GetBlockVersion(),
		State:        int32(inst.GetState()),
		Entitlement:  inst.GetEntitlement(),
	}
	if i := strings.LastIndex(ci.Name, "/"); i >= 0 {
		ci.ShortID = ci.Name[i+1:]
	}
	if ct := inst.GetCreateTime(); ct != nil {
		ci.CreateTime = ct.AsTime().UTC().Format(time.RFC3339)
	}
	if ut := inst.GetUpdateTime(); ut != nil {
		ci.UpdateTime = ut.AsTime().UTC().Format(time.RFC3339)
	}
	return ci
}

// codeblockMemberFromV2Masked maps alis.os.iam.v2.MaskedUser onto CodeblockMember.
func codeblockMemberFromV2Masked(m *iamv2pb.MaskedUser) CodeblockMember {
	return CodeblockMember{
		Name:        m.GetName(),
		DisplayName: strings.TrimSpace(m.GetGivenName() + " " + m.GetFamilyName()),
		PhotoURL:    m.GetPicture(),
	}
}
