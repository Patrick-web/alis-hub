package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	blocksv1pb "alis-hub-v3/gen/go/alis/bl/blocks/v1"
	neuronsv1pb "alis-hub-v3/gen/go/alis/os/neurons/v1"
	productsv1pb "alis-hub-v3/gen/go/alis/os/products/v1"

	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	longrunningpb "cloud.google.com/go/longrunning/autogen/longrunningpb"
)

// ListInstallOrgs returns all organisations the user belongs to (for install location picker).
func (s *ProductService) ListInstallOrgs() ([]Organisation, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	req := &productsv1pb.ListOrganisationsRequest{
		ReadMask: &fieldmaskpb.FieldMask{Paths: []string{"name", "display_name"}},
	}
	protoBytes, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("ListInstallOrgs: marshal request: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.products.v1.OrganisationsService/ListOrganisations", protoBytes)
	if err != nil {
		return nil, fmt.Errorf("ListInstallOrgs: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListInstallOrgs: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListInstallOrgs: response too short (%d bytes)", len(body))
	}
	resp := &productsv1pb.ListOrganisationsResponse{}
	if err := proto.Unmarshal(body[5:], resp); err != nil {
		return nil, fmt.Errorf("ListInstallOrgs: unmarshal response: %w", err)
	}
	orgs := make([]Organisation, 0, len(resp.GetOrganisations()))
	for _, o := range resp.GetOrganisations() {
		orgs = append(orgs, Organisation{Name: o.GetName(), DisplayName: o.GetDisplayName()})
	}
	return orgs, nil
}

// ListInstallNeurons returns the neurons (packages) in the given org/product for install location picker.
func (s *ProductService) ListInstallNeurons(org, product string) ([]InstallNeuron, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	req := &neuronsv1pb.ListNeuronsRequest{Parent: fmt.Sprintf("organisations/%s/products/%s", org, product)}
	buf, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("ListInstallNeurons: marshal request: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.neurons.v1.NeuronsService/ListNeurons", buf)
	if err != nil {
		return nil, fmt.Errorf("ListInstallNeurons: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListInstallNeurons: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListInstallNeurons: response too short (%d bytes)", len(body))
	}
	resp := &neuronsv1pb.ListNeuronsResponse{}
	if err := proto.Unmarshal(body[5:], resp); err != nil {
		return nil, fmt.Errorf("ListInstallNeurons: unmarshal response: %w", err)
	}
	neurons := make([]InstallNeuron, 0, len(resp.GetNeurons()))
	for _, n := range resp.GetNeurons() {
		neuron := installNeuronFromProto(n)
		if neuron.Name != "" {
			neurons = append(neurons, neuron)
		}
	}
	return neurons, nil
}

// installNeuronFromProto maps a neurons.v1.Neuron onto InstallNeuron. Package is derived
// from the neuron resource name when the server doesn't set it; there is no display_name
// field on Neuron, so the neuron ID segment of the name is used instead.
func installNeuronFromProto(n *neuronsv1pb.Neuron) InstallNeuron {
	out := InstallNeuron{Name: n.GetName(), Package: n.GetPackage()}
	if out.Name == "" {
		return out
	}
	if out.Package == "" {
		out.Package = neuronNameToPackage(out.Name)
	}
	if i := strings.LastIndex(out.Name, "/"); i >= 0 {
		out.DisplayName = out.Name[i+1:]
	}
	return out
}

// neuronNameToPackage converts "organisations/{org}/products/{product}/neurons/{id}"
// to "packages/{org}.{product}.{id}" where the neuron ID's "-" are replaced with ".".
func neuronNameToPackage(neuronName string) string {
	parts := strings.Split(neuronName, "/")
	if len(parts) != 6 {
		return ""
	}
	neuronID := strings.ReplaceAll(parts[5], "-", ".")
	return "packages/" + parts[1] + "." + parts[3] + "." + neuronID
}

// ListBlockPlans returns the available entitlement plans for a block.
func (s *ProductService) ListBlockPlans(blockId string) ([]BlockPlan, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	req := &blocksv1pb.ListEntitlementPlansRequest{
		Parent:   "blocks/" + blockId,
		ReadMask: &fieldmaskpb.FieldMask{Paths: []string{"name", "display_name"}},
	}
	buf, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("ListBlockPlans: marshal request: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.EntitlementPlansService/ListEntitlementPlans", buf)
	if err != nil {
		return nil, fmt.Errorf("ListBlockPlans: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListBlockPlans: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListBlockPlans: response too short (%d bytes)", len(body))
	}
	resp := &blocksv1pb.ListEntitlementPlansResponse{}
	if err := proto.Unmarshal(body[5:], resp); err != nil {
		return nil, fmt.Errorf("ListBlockPlans: unmarshal response: %w", err)
	}
	plans := make([]BlockPlan, 0, len(resp.GetEntitlementPlans()))
	for _, e := range resp.GetEntitlementPlans() {
		p := BlockPlan{Name: e.GetName(), DisplayName: e.GetDisplayName()}
		if p.DisplayName == "" && p.Name != "" {
			if i := strings.LastIndex(p.Name, "/"); i >= 0 {
				p.DisplayName = p.Name[i+1:]
			}
		}
		if p.Name != "" {
			plans = append(plans, p)
		}
	}
	return plans, nil
}

// DoInstallBlock creates an entitlement, creates the instance, then runs the installation pipeline.
// It polls until the deployment operation completes (up to 5 minutes) before returning.
func (s *ProductService) DoInstallBlock(params InstallBlockParams) (*InstallBlockResult, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	accountID := s.myPrimaryAccountID()
	if accountID == "" {
		return nil, fmt.Errorf("DoInstallBlock: could not determine account ID")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	// Step 1: Check for existing redeemable entitlement.
	existingEntitlement, err := s.findExistingEntitlement(ctx, params.BlockID, accountID)
	if err != nil {
		return nil, fmt.Errorf("DoInstallBlock: check entitlement: %w", err)
	}

	entitlementName := existingEntitlement
	if entitlementName == "" {
		// Step 2: Create a new entitlement.
		entitlementName, err = s.createEntitlement(ctx, params.BlockID, params.PlanName, accountID)
		if err != nil {
			return nil, fmt.Errorf("DoInstallBlock: create entitlement: %w", err)
		}
	}

	// Step 3: AddBlock — creates the instance.
	instanceName, err := s.addBlock(ctx, params.BlockID, params.Package, entitlementName)
	if err != nil {
		return nil, fmt.Errorf("DoInstallBlock: add block: %w", err)
	}

	// Step 4: Resolve block version — BlocksService/InstallBlock requires it.
	blockVersion := params.BlockVersion
	if blockVersion == "" {
		versions, vErr := s.ListCodeblockVersions(params.BlockID)
		if vErr != nil || len(versions) == 0 {
			return nil, fmt.Errorf("DoInstallBlock: could not resolve latest block version: %v", vErr)
		}
		blockVersion = versions[0].Name
	}

	// Step 5: InstallBlock — runs the deployment pipeline (returns an LRO).
	buildFolder := params.BuildFolder
	if buildFolder == "" {
		buildFolder = "./"
	}
	opName, err := s.installBlockLRO(ctx, params.BlockID, params.Package, instanceName, buildFolder, blockVersion)
	if err != nil {
		return nil, fmt.Errorf("DoInstallBlock: install block: %w", err)
	}

	// Step 5: Poll the install operation until done.
	if _, err := s.pollOperation(ctx, "alis.bl.blocks.v1.BlocksService/GetOperation", opName); err != nil {
		return nil, fmt.Errorf("DoInstallBlock: operation failed: %w", err)
	}

	// Step 6: Fetch the instance to get its git branch.
	branchName, _ := s.getInstanceGitBranch(ctx, instanceName)

	// Derive local repo path from the package: packages/{org}.{product}.{...} → ~/alis.build/{org}/build/{product}
	repoPath := packageToRepoPath(params.Package)

	return &InstallBlockResult{
		InstanceName:   instanceName,
		BranchName:     branchName,
		RepoPath:       repoPath,
		DefineRepoPath: packageToDefineRepoPath(params.Package),
	}, nil
}

// getInstanceGitBranch calls InstancesService/GetInstance and returns the git_branch field.
func (s *ProductService) getInstanceGitBranch(ctx context.Context, instanceName string) (string, error) {
	req := &blocksv1pb.GetInstanceRequest{
		Name:     instanceName,
		ReadMask: &fieldmaskpb.FieldMask{Paths: []string{"git_branch"}},
	}
	buf, err := proto.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.InstancesService/GetInstance", buf)
	if err != nil {
		return "", err
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("response too short")
	}
	inst := &blocksv1pb.Instance{}
	if err := proto.Unmarshal(body[5:], inst); err != nil {
		return "", fmt.Errorf("unmarshal response: %w", err)
	}
	return inst.GetGitBranch(), nil
}

// packageToRepoPath converts a package resource name to the local alis build repo path.
// "packages/voyage.vp.bff.v1" → "~/alis.build/voyage/build/vp"
func packageToRepoPath(pkg string) string {
	pkg = strings.TrimPrefix(pkg, "packages/")
	parts := strings.SplitN(pkg, ".", 3)
	if len(parts) < 2 {
		return ""
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, "alis.build", parts[0], "build", parts[1])
}

// packageToDefineRepoPath converts a package resource name to the local alis define repo path.
// "packages/voyage.vp.bff.v1" → "~/alis.build/voyage/define"
func packageToDefineRepoPath(pkg string) string {
	pkg = strings.TrimPrefix(pkg, "packages/")
	parts := strings.SplitN(pkg, ".", 2)
	if len(parts) < 1 || parts[0] == "" {
		return ""
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, "alis.build", parts[0], "define")
}

func (s *ProductService) findExistingEntitlement(ctx context.Context, blockId, accountID string) (string, error) {
	filter := fmt.Sprintf("Entitlement.account = '%s' AND Entitlement.state = REDEEMABLE", accountID)
	req := &blocksv1pb.ListEntitlementsRequest{Parent: "blocks/" + blockId, Filter: filter}
	buf, err := proto.Marshal(req)
	if err != nil {
		return "", nil // ignore errors, just proceed to create
	}
	body, grpcStatus, _, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.EntitlementsService/ListEntitlements", buf)
	if err != nil || grpcStatus != 0 || len(body) < 5 {
		return "", nil // ignore errors, just proceed to create
	}
	resp := &blocksv1pb.ListEntitlementsResponse{}
	if err := proto.Unmarshal(body[5:], resp); err != nil || len(resp.GetEntitlements()) == 0 {
		return "", nil
	}
	return resp.GetEntitlements()[0].GetName(), nil
}

func (s *ProductService) createEntitlement(ctx context.Context, blockId, planName, accountID string) (string, error) {
	// Type=2 (PLAN_USE) matches what the real console sends on install (verified against its
	// JS bundle); state is intentionally left unset there too — the server defaults it on create.
	req := &blocksv1pb.CreateEntitlementRequest{
		Parent: "blocks/" + blockId,
		Entitlement: &blocksv1pb.Entitlement{
			EntitlementPlanReference: planName,
			Account:                  accountID,
			Type:                     blocksv1pb.Entitlement_Type(2),
		},
	}
	buf, err := proto.Marshal(req)
	if err != nil {
		return "", err
	}
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.EntitlementsService/CreateEntitlement", buf)
	if err != nil {
		return "", err
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("response too short (%d bytes)", len(body))
	}
	ent := &blocksv1pb.Entitlement{}
	if err := proto.Unmarshal(body[5:], ent); err != nil {
		return "", fmt.Errorf("unmarshal response: %w", err)
	}
	if ent.GetName() == "" {
		return "", fmt.Errorf("empty entitlement name in response")
	}
	return ent.GetName(), nil
}

func (s *ProductService) addBlock(ctx context.Context, blockId, pkg, entitlement string) (string, error) {
	req := &blocksv1pb.AddBlockRequest{Block: "blocks/" + blockId, Package: pkg, Entitlement: entitlement}
	buf, err := proto.Marshal(req)
	if err != nil {
		return "", err
	}
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/AddBlock", buf)
	if err != nil {
		return "", err
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("response too short (%d bytes)", len(body))
	}
	resp := &blocksv1pb.AddBlockResponse{}
	if err := proto.Unmarshal(body[5:], resp); err != nil {
		return "", fmt.Errorf("unmarshal response: %w", err)
	}
	if resp.GetInstance() == "" {
		return "", fmt.Errorf("empty instance name in AddBlock response")
	}
	return resp.GetInstance(), nil
}

func (s *ProductService) installBlockLRO(ctx context.Context, blockId, pkg, instanceName, buildFolder, blockVersion string) (string, error) {
	req := &blocksv1pb.InstallBlockRequest{
		Block:        "blocks/" + blockId,
		Package:      pkg,
		BuildFolder:  buildFolder,
		Instance:     instanceName,
		BlockVersion: blockVersion,
	}
	buf, err := proto.Marshal(req)
	if err != nil {
		return "", err
	}
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/InstallBlock", buf)
	if err != nil {
		return "", err
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("response too short (%d bytes)", len(body))
	}
	op := &longrunningpb.Operation{}
	if err := proto.Unmarshal(body[5:], op); err != nil {
		return "", fmt.Errorf("unmarshal response: %w", err)
	}
	if op.GetName() == "" {
		return "", fmt.Errorf("empty operation name in InstallBlock response")
	}
	return op.GetName(), nil
}

// pollOperation polls until the LRO is done and returns the final Operation. Returns an
// error if the operation fails or the context times out. method is the full gRPC method
// path for GetOperation on the relevant service, e.g. "alis.bl.blocks.v1.BlocksService/GetOperation"
// or "google.longrunning.Operations/GetOperation".
func (s *ProductService) pollOperation(ctx context.Context, method string, opName string) (*longrunningpb.Operation, error) {
	req := &longrunningpb.GetOperationRequest{Name: opName}
	buf, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("GetOperation: marshal request: %w", err)
	}
	for {
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("timed out waiting for operation %s", opName)
		case <-time.After(3 * time.Second):
		}

		body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, method, buf)
		if err != nil {
			return nil, fmt.Errorf("GetOperation: %w", err)
		}
		if grpcStatus != 0 {
			return nil, fmt.Errorf("GetOperation: grpc %d: %s", grpcStatus, grpcMsg)
		}
		if len(body) < 5 {
			continue
		}
		op := &longrunningpb.Operation{}
		if err := proto.Unmarshal(body[5:], op); err != nil {
			return nil, fmt.Errorf("GetOperation: unmarshal response: %w", err)
		}
		if opErr := op.GetError(); opErr != nil && opErr.GetMessage() != "" {
			return nil, fmt.Errorf("operation error: %s", opErr.GetMessage())
		}
		if op.GetDone() {
			return op, nil
		}
	}
}

// MergeBlockBranchResult is the decoded InstancesService/MergeBlockBranch response.
type MergeBlockBranchResult struct {
	Branch          string `json:"branch"`
	BuildCommitSHA  string `json:"buildCommitSha"`
	DefineCommitSHA string `json:"defineCommitSha"`
}

// MergeBlockInstance calls InstancesService/MergeBlockBranch to merge the git branch that
// InstallBlock creates into both the product's build and define repositories, then polls
// the resulting LRO. Unlike a manually opened pull request, this is instance-scoped on the
// backend (mirrors the VS Code "alis.blocks.scm.merge" command) and always merges into each
// repo's "master" branch — it does not accept an alternate base branch.
func (s *ProductService) MergeBlockInstance(instanceName string) (*MergeBlockBranchResult, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	req := &blocksv1pb.MergeBlockBranchRequest{
		Instance:              instanceName,
		MergeBuildRepository:  true,
		MergeDefineRepository: true,
	}
	buf, err := proto.Marshal(req)
	if err != nil {
		return nil, err
	}

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx,
		"alis.bl.blocks.v1.InstancesService/MergeBlockBranch", buf)
	if err != nil {
		return nil, err
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("response too short (%d bytes)", len(body))
	}
	op := &longrunningpb.Operation{}
	if err := proto.Unmarshal(body[5:], op); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}
	if op.GetName() == "" {
		return nil, fmt.Errorf("empty operation name in MergeBlockBranch response")
	}
	finalOp, err := s.pollOperation(ctx, "alis.bl.blocks.v1.BlocksService/GetOperation", op.GetName())
	if err != nil {
		return nil, err
	}

	result := &MergeBlockBranchResult{}
	if resp := finalOp.GetResponse(); resp != nil {
		mbr := &blocksv1pb.MergeBlockBranchResponse{}
		if err := resp.UnmarshalTo(mbr); err == nil {
			result.Branch = mbr.GetBranch()
			result.BuildCommitSHA = mbr.GetBuildCommitSha()
			result.DefineCommitSHA = mbr.GetDefineCommitSha()
		}
	}
	return result, nil
}

// UninstallCodeblockInstance uninstalls an instance by resource name (e.g. "blocks/bb6b/instances/631").
// The configuration is preserved on the server for potential reinstallation.
// Returns after the resulting LRO completes (up to 5 minutes).
func (s *ProductService) UninstallCodeblockInstance(instanceName string) error {
	if err := s.initTokens(); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	req := &blocksv1pb.UninstallBlockRequest{Instance: instanceName}
	buf, err := proto.Marshal(req)
	if err != nil {
		return fmt.Errorf("UninstallBlock: marshal request: %w", err)
	}

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/UninstallBlock", buf)
	if err != nil {
		return fmt.Errorf("UninstallBlock: %w", err)
	}
	if grpcStatus != 0 {
		return fmt.Errorf("UninstallBlock: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return fmt.Errorf("UninstallBlock: response too short (%d bytes)", len(body))
	}
	op := &longrunningpb.Operation{}
	if err := proto.Unmarshal(body[5:], op); err != nil {
		return fmt.Errorf("UninstallBlock: unmarshal response: %w", err)
	}
	if op.GetName() == "" {
		return fmt.Errorf("UninstallBlock: empty operation name in response")
	}
	_, err = s.pollOperation(ctx, "alis.bl.blocks.v1.BlocksService/GetOperation", op.GetName())
	return err
}

// UpgradeCodeblockInstance upgrades an instance to a different block version.
// instanceName is the full resource name (e.g. "blocks/bb6b/instances/631").
// blockVersionName is the full version resource name (e.g. "blocks/bb6b/versions/1.0.0-experimental1").
// Returns after the resulting LRO completes (up to 5 minutes).
func (s *ProductService) UpgradeCodeblockInstance(instanceName, blockVersionName string) error {
	if err := s.initTokens(); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	req := &blocksv1pb.UpgradeBlockRequest{Instance: instanceName, BlockVersion: blockVersionName}
	buf, err := proto.Marshal(req)
	if err != nil {
		return fmt.Errorf("UpgradeBlock: marshal request: %w", err)
	}

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/UpgradeBlock", buf)
	if err != nil {
		return fmt.Errorf("UpgradeBlock: %w", err)
	}
	if grpcStatus != 0 {
		return fmt.Errorf("UpgradeBlock: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return fmt.Errorf("UpgradeBlock: response too short (%d bytes)", len(body))
	}
	op := &longrunningpb.Operation{}
	if err := proto.Unmarshal(body[5:], op); err != nil {
		return fmt.Errorf("UpgradeBlock: unmarshal response: %w", err)
	}
	if op.GetName() == "" {
		return fmt.Errorf("UpgradeBlock: empty operation name in response")
	}
	_, err = s.pollOperation(ctx, "alis.bl.blocks.v1.BlocksService/GetOperation", op.GetName())
	return err
}

// CreateCodeblock creates a new code block and returns its resource name (e.g. "blocks/myblock").
func (s *ProductService) CreateCodeblock(params CreateCodeblockParams) (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}
	accountName := s.myPrimaryAccountID()
	req := buildCreateBlockRequest(params, accountName)
	buf, err := proto.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("CreateBlock: marshal request: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/CreateBlock", buf)
	if err != nil {
		return "", fmt.Errorf("CreateBlock: %w", err)
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("CreateBlock: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("CreateBlock: response too short (%d bytes)", len(body))
	}
	block := &blocksv1pb.Block{}
	if err := proto.Unmarshal(body[5:], block); err != nil {
		return "", fmt.Errorf("CreateBlock: unmarshal response: %w", err)
	}
	return block.GetName(), nil
}

// GetMyPrimaryAccountID returns the caller's primary account resource name (e.g. "accounts/8na6ap").
func (s *ProductService) GetMyPrimaryAccountID() (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}
	return s.myPrimaryAccountID(), nil
}

// myPrimaryAccountID returns the first "accounts/<id>" from the JWT access token.
func (s *ProductService) myPrimaryAccountID() string {
	for id := range s.myAccountIDs() {
		return id
	}
	return ""
}

// buildOverviewDetails builds a Block.OverviewDetails message from the shared create/update
// params, or nil if none of its source fields are set (so the field is omitted on the wire
// rather than sent as an empty submessage).
func buildOverviewDetails(p CreateCodeblockParams) *blocksv1pb.Block_OverviewDetails {
	if p.HeroStatement == "" && p.Description == "" && len(p.Highlights) == 0 &&
		len(p.KeyFeatures) == 0 && len(p.CodeArchitecture) == 0 {
		return nil
	}
	ov := &blocksv1pb.Block_OverviewDetails{
		HeroStatement: p.HeroStatement,
		Description:   p.Description,
	}
	for _, h := range p.Highlights {
		if h != "" {
			ov.Highlights = append(ov.Highlights, h)
		}
	}
	for _, kf := range p.KeyFeatures {
		ov.KeyFeatures = append(ov.KeyFeatures, &blocksv1pb.Block_OverviewDetails_KeyFeature{
			Title: kf.Title, Description: kf.Description,
		})
	}
	for _, al := range p.CodeArchitecture {
		ov.CodeArchitecture = append(ov.CodeArchitecture, &blocksv1pb.Block_OverviewDetails_CodeArchitectureLayer{
			Title: al.Title, Description: al.Description,
		})
	}
	return ov
}

func buildCreateBlockRequest(p CreateCodeblockParams, accountName string) *blocksv1pb.CreateBlockRequest {
	block := &blocksv1pb.Block{
		DisplayName:     p.DisplayName,
		Tagline:         p.Tagline,
		OverviewDetails: buildOverviewDetails(p),
	}
	if accountName != "" {
		block.Publisher = &blocksv1pb.Block_Publisher{Account: accountName}
	}
	return &blocksv1pb.CreateBlockRequest{Block: block, BlockId: p.BlockID}
}

// UpdateCodeblock calls BlocksService/UpdateBlock with the given params.
func (s *ProductService) UpdateCodeblock(params CreateCodeblockParams) error {
	if err := s.initTokens(); err != nil {
		return err
	}
	blockName := "blocks/" + params.BlockID
	req := buildUpdateBlockRequest(blockName, params)
	buf, err := proto.Marshal(req)
	if err != nil {
		return fmt.Errorf("UpdateBlock: marshal request: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/UpdateBlock", buf)
	if err != nil {
		return err
	}
	if grpcStatus != 0 {
		return fmt.Errorf("update block: gRPC status %d: %s", grpcStatus, grpcMsg)
	}
	return nil
}

func buildUpdateBlockRequest(blockName string, p CreateCodeblockParams) *blocksv1pb.UpdateBlockRequest {
	block := &blocksv1pb.Block{
		Name:            blockName,
		DisplayName:     p.DisplayName,
		Tagline:         p.Tagline,
		OverviewDetails: buildOverviewDetails(p),
	}
	return &blocksv1pb.UpdateBlockRequest{
		Block:      block,
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"display_name", "tagline", "overview_details"}},
	}
}

// ContributeBlock publishes a new block version with code files via BlockVersionsService/CreateBlockVersion (LRO).
// Returns the created version resource name, e.g. "blocks/myblock/versions/v1.0.0-experimental1".
func (s *ProductService) ContributeBlock(params ContributeBlockParams) (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}

	bv := &blocksv1pb.BlockVersion{
		// version (field 2) must stay empty — the ID is sent as block_version_id.
		ReleaseNotes: params.ReleaseNotes,
		ReleaseLevel: blocksv1pb.BlockVersion_ReleaseLevel(params.ReleaseLevel),
	}
	if len(params.BuildFiles) > 0 || len(params.InfraFiles) > 0 || len(params.ProtoFiles) > 0 {
		bv.ContributedContent = &blocksv1pb.BlockVersion_Content{
			BuildFiles: buildFileList(params.BuildFiles),
			InfraFiles: buildFileList(params.InfraFiles),
			ProtoFiles: buildFileList(params.ProtoFiles),
		}
	}
	req := &blocksv1pb.CreateBlockVersionRequest{
		Parent:         "blocks/" + params.BlockID,
		BlockVersion:   bv,
		BlockVersionId: params.VersionTag,
	}
	buf, err := proto.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("ContributeBlock: marshal request: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlockVersionsService/CreateBlockVersion", buf)
	if err != nil {
		return "", fmt.Errorf("ContributeBlock: %w", err)
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("ContributeBlock: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("ContributeBlock: response too short (%d bytes)", len(body))
	}
	op := &longrunningpb.Operation{}
	if err := proto.Unmarshal(body[5:], op); err != nil {
		return "", fmt.Errorf("ContributeBlock: unmarshal response: %w", err)
	}
	if op.GetName() == "" {
		return "", fmt.Errorf("ContributeBlock: empty operation name in response")
	}
	if _, err := s.pollOperation(ctx, "alis.bl.blocks.v1.BlocksService/GetOperation", op.GetName()); err != nil {
		return "", fmt.Errorf("ContributeBlock: operation failed: %w", err)
	}
	return "blocks/" + params.BlockID + "/versions/" + params.VersionTag, nil
}

func buildFileList(items []CodeblockFileItem) []*blocksv1pb.File {
	out := make([]*blocksv1pb.File, 0, len(items))
	for _, f := range items {
		out = append(out, &blocksv1pb.File{Filename: f.Name, Content: []byte(f.Content)})
	}
	return out
}

// OpenBlockWorktrees creates git worktrees for an instance's build and define repos.
// It returns the root worktree path, e.g. "{tmpdir}/.alis-blocks-worktrees/{blockId}/{packageId}/{instanceId}/".
func (s *ProductService) OpenBlockWorktrees(instanceName string) (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pkg, branch, err := s.getInstancePackageAndBranch(ctx, instanceName)
	if err != nil {
		return "", fmt.Errorf("OpenBlockWorktrees: GetInstance: %w", err)
	}
	if pkg == "" {
		return "", fmt.Errorf("OpenBlockWorktrees: instance has no package field")
	}
	if branch == "" {
		return "", fmt.Errorf("OpenBlockWorktrees: instance has no git_branch field")
	}

	// Derive the block ID and instance short ID from the resource name.
	// instanceName = "blocks/{blockId}/instances/{instanceId}"
	parts := strings.Split(instanceName, "/")
	if len(parts) < 4 {
		return "", fmt.Errorf("OpenBlockWorktrees: unexpected instance name format: %s", instanceName)
	}
	blockID := parts[1]
	instanceID := parts[3]
	packageID := strings.TrimPrefix(pkg, "packages/")

	// Build repo: ~/alis.build/{org}/build/{product}
	buildRepo := packageToRepoPath(pkg)
	// Define repo: ~/alis.build/{org}/define
	defineRepo := packageToDefineRepoPath(pkg)
	if buildRepo == "" || defineRepo == "" {
		return "", fmt.Errorf("OpenBlockWorktrees: could not derive repo paths from package %s", pkg)
	}

	// Create the worktree root directory.
	worktreeRoot := filepath.Join(os.TempDir(), ".alis-blocks-worktrees", blockID, packageID, instanceID)
	if err := os.MkdirAll(worktreeRoot, 0755); err != nil {
		return "", fmt.Errorf("OpenBlockWorktrees: mkdir: %w", err)
	}

	// Fetch latest refs in both repos. gitCmd routes auth through the alis CLI
	// credential helper, which mints a token per request, so there is no stale
	// on-disk token to work around here.
	gitCmd(buildRepo, "git", "fetch", "--all", "--prune")
	gitCmd(defineRepo, "git", "fetch", "--all", "--prune")

	// Add build worktree (remove stale one first if it exists but isn't registered).
	buildWorktreePath := filepath.Join(worktreeRoot, "build")
	if _, statErr := os.Stat(buildWorktreePath); statErr != nil {
		if _, wtErr := gitCmd(buildRepo, "git", "worktree", "add", "-B", branch, buildWorktreePath, "origin/"+branch); wtErr != nil {
			// Try without -B in case branch doesn't exist on origin yet.
			if _, wtErr2 := gitCmd(buildRepo, "git", "worktree", "add", "-b", branch, buildWorktreePath, "origin/HEAD"); wtErr2 != nil {
				return "", fmt.Errorf("OpenBlockWorktrees: build worktree: %w", wtErr)
			}
		}
	}

	// Add define worktree.
	defineWorktreePath := filepath.Join(worktreeRoot, "define")
	if _, statErr := os.Stat(defineWorktreePath); statErr != nil {
		if _, wtErr := gitCmd(defineRepo, "git", "worktree", "add", "-B", branch, defineWorktreePath, "origin/"+branch); wtErr != nil {
			if _, wtErr2 := gitCmd(defineRepo, "git", "worktree", "add", "-b", branch, defineWorktreePath, "origin/HEAD"); wtErr2 != nil {
				return "", fmt.Errorf("OpenBlockWorktrees: define worktree: %w", wtErr)
			}
		}
	}

	return worktreeRoot, nil
}

// getInstancePackageAndBranch fetches an instance's package and git_branch fields.
func (s *ProductService) getInstancePackageAndBranch(ctx context.Context, instanceName string) (pkg, branch string, err error) {
	req := &blocksv1pb.GetInstanceRequest{
		Name:     instanceName,
		ReadMask: &fieldmaskpb.FieldMask{Paths: []string{"package", "git_branch"}},
	}
	buf, err := proto.Marshal(req)
	if err != nil {
		return "", "", fmt.Errorf("marshal request: %w", err)
	}
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.InstancesService/GetInstance", buf)
	if err != nil {
		return "", "", err
	}
	if grpcStatus != 0 {
		return "", "", fmt.Errorf("grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", "", fmt.Errorf("response too short")
	}
	inst := &blocksv1pb.Instance{}
	if err := proto.Unmarshal(body[5:], inst); err != nil {
		return "", "", fmt.Errorf("unmarshal response: %w", err)
	}
	return inst.GetPackage(), inst.GetGitBranch(), nil
}

// GetBlockCommits returns recent commits from the build or define repo for a given instance.
// repoType must be "build" or "define".
func (s *ProductService) GetBlockCommits(instanceName, repoType string, limit int) ([]BlockCommit, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	pkg, branch, err := s.getInstancePackageAndBranch(ctx, instanceName)
	if err != nil {
		return nil, fmt.Errorf("GetBlockCommits: %w", err)
	}
	if pkg == "" || branch == "" {
		return nil, fmt.Errorf("GetBlockCommits: missing package or git_branch on instance")
	}

	var repoPath string
	switch repoType {
	case "build":
		repoPath = packageToRepoPath(pkg)
	case "define":
		repoPath = packageToDefineRepoPath(pkg)
	default:
		return nil, fmt.Errorf("GetBlockCommits: repoType must be 'build' or 'define', got %q", repoType)
	}
	if repoPath == "" {
		return nil, fmt.Errorf("GetBlockCommits: could not derive repo path from package %s", pkg)
	}

	if limit <= 0 {
		limit = 50
	}
	// Format: hash|fullHash|date|author|message
	format := "%h|%H|%aI|%an|%s"
	out, err := gitCmd(repoPath, "git", "log", "origin/"+branch,
		"--format="+format, "-n", strconv.Itoa(limit))
	if err != nil {
		return nil, fmt.Errorf("GetBlockCommits: git log: %w", err)
	}

	var commits []BlockCommit
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		if line == "" {
			continue
		}
		fields := strings.SplitN(line, "|", 5)
		if len(fields) < 5 {
			continue
		}
		commits = append(commits, BlockCommit{
			Hash:     fields[0],
			FullHash: fields[1],
			Date:     fields[2],
			Author:   fields[3],
			Message:  fields[4],
		})
	}
	return commits, nil
}

// OpenWorktreeInFinder opens the given directory in the system file manager.
func (s *ProductService) OpenWorktreeInFinder(path string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", path)
	case "windows":
		cmd = exec.Command("explorer", path)
	default:
		cmd = exec.Command("xdg-open", path)
	}
	return cmd.Start()
}
