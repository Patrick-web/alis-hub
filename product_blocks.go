package main

import (
	"alis-hub-v3/internal/alisclient"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"google.golang.org/protobuf/encoding/protowire"
)

// ListInstallOrgs returns all organisations the user belongs to (for install location picker).
func (s *ProductService) ListInstallOrgs() ([]Organisation, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	protoBytes := marshalListOrganisationsRequest([]string{"name", "display_name"})
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
	return parseListOrganisationsResponse(body[5:])
}

// ListInstallNeurons returns the neurons (packages) in the given org/product for install location picker.
func (s *ProductService) ListInstallNeurons(org, product string) ([]InstallNeuron, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	parent := fmt.Sprintf("organisations/%s/products/%s", org, product)
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, parent)
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
	return parseInstallNeuronsResponse(body[5:]), nil
}

// ListBlockPlans returns the available entitlement plans for a block.
func (s *ProductService) ListBlockPlans(blockId string) ([]BlockPlan, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, "blocks/"+blockId)
	fm := marshalFieldMask([]string{"name", "display_name"})
	buf = protowire.AppendTag(buf, 5, protowire.BytesType)
	buf = protowire.AppendBytes(buf, fm)
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
	return parseBlockPlansResponse(body[5:]), nil
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

	// Step 5: Poll the install operation until done; capture the final response data.
	opData, err := s.pollOperation(ctx, "alis.bl.blocks.v1.BlocksService/GetOperation", opName)
	if err != nil {
		return nil, fmt.Errorf("DoInstallBlock: operation failed: %w", err)
	}

	// Suppress unused variable — opData is kept for future use but branch is fetched via GetInstance.
	_ = opData

	// Step 6: Fetch the instance to get git_branch (field 6 of Instance).
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
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, instanceName)
	fm := marshalFieldMask([]string{"git_branch"})
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendBytes(buf, fm)

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
	// Instance.git_branch is field 6.
	return parseStringFieldN(body[5:], 6), nil
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
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, "blocks/"+blockId)
	buf = protowire.AppendTag(buf, 6, protowire.BytesType)
	buf = protowire.AppendString(buf, filter)
	body, grpcStatus, _, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.EntitlementsService/ListEntitlements", buf)
	if err != nil || grpcStatus != 0 || len(body) < 5 {
		return "", nil // ignore errors, just proceed to create
	}
	return parseFirstEntitlementName(body[5:]), nil
}

func (s *ProductService) createEntitlement(ctx context.Context, blockId, planName, accountID string) (string, error) {
	// Entitlement sub-message: f2=entitlement_plan_reference, f3=account, f8=type(2=PLAN_USE).
	// Matches what the real console sends on install (verified against its JS bundle); state
	// (f7) is intentionally left unset there too — the server defaults it on create.
	var entMsg []byte
	entMsg = protowire.AppendTag(entMsg, 2, protowire.BytesType)
	entMsg = protowire.AppendString(entMsg, planName)
	entMsg = protowire.AppendTag(entMsg, 3, protowire.BytesType)
	entMsg = protowire.AppendString(entMsg, accountID)
	entMsg = protowire.AppendTag(entMsg, 8, protowire.VarintType)
	entMsg = protowire.AppendVarint(entMsg, 2)

	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, "blocks/"+blockId)
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendBytes(buf, entMsg)

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
	name := parseStringField1(body[5:])
	if name == "" {
		return "", fmt.Errorf("empty entitlement name in response")
	}
	return name, nil
}

func (s *ProductService) addBlock(ctx context.Context, blockId, pkg, entitlement string) (string, error) {
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, "blocks/"+blockId)
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendString(buf, pkg)
	buf = protowire.AppendTag(buf, 3, protowire.BytesType)
	buf = protowire.AppendString(buf, entitlement)

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
	name := parseStringField1(body[5:])
	if name == "" {
		return "", fmt.Errorf("empty instance name in AddBlock response")
	}
	return name, nil
}

func (s *ProductService) installBlockLRO(ctx context.Context, blockId, pkg, instanceName, buildFolder, blockVersion string) (string, error) {
	// BlocksService/InstallBlock: f1=block, f2=package, f3=build_folder, f4=instance, f5=block_version
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, "blocks/"+blockId)
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendString(buf, pkg)
	if buildFolder != "" {
		buf = protowire.AppendTag(buf, 3, protowire.BytesType)
		buf = protowire.AppendString(buf, buildFolder)
	}
	buf = protowire.AppendTag(buf, 4, protowire.BytesType)
	buf = protowire.AppendString(buf, instanceName)
	if blockVersion != "" {
		buf = protowire.AppendTag(buf, 5, protowire.BytesType)
		buf = protowire.AppendString(buf, blockVersion)
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
	// Response is a google.longrunning.Operation — field 1 = name.
	opName := parseStringField1(body[5:])
	if opName == "" {
		return "", fmt.Errorf("empty operation name in InstallBlock response")
	}
	return opName, nil
}

// pollOperation polls until the LRO is done and returns the raw proto bytes of the
// final Operation (after the 5-byte gRPC frame header). Returns an error if the
// operation fails or the context times out.
// method is the full gRPC method path for GetOperation on the relevant service,
// e.g. "alis.bl.blocks.v1.BlocksService/GetOperation" or "google.longrunning.Operations/GetOperation".
func (s *ProductService) pollOperation(ctx context.Context, method string, opName string) ([]byte, error) {
	for {
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("timed out waiting for operation %s", opName)
		case <-time.After(3 * time.Second):
		}

		body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx,
			method, alisclient.MarshalGetOperationRequest(opName))
		if err != nil {
			return nil, fmt.Errorf("GetOperation: %w", err)
		}
		if grpcStatus != 0 {
			return nil, fmt.Errorf("GetOperation: grpc %d: %s", grpcStatus, grpcMsg)
		}
		if len(body) < 5 {
			continue
		}
		data := body[5:]
		done, errMsg := parseOperationStatus(data)
		if errMsg != "" {
			return nil, fmt.Errorf("operation error: %s", errMsg)
		}
		if done {
			return data, nil
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

	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, instanceName)
	buf = protowire.AppendTag(buf, 2, protowire.VarintType)
	buf = protowire.AppendVarint(buf, 1) // merge_build_repository = true
	buf = protowire.AppendTag(buf, 3, protowire.VarintType)
	buf = protowire.AppendVarint(buf, 1) // merge_define_repository = true

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
	opName := parseStringField1(body[5:])
	if opName == "" {
		return nil, fmt.Errorf("empty operation name in MergeBlockBranch response")
	}
	data, err := s.pollOperation(ctx, "alis.bl.blocks.v1.BlocksService/GetOperation", opName)
	if err != nil {
		return nil, err
	}
	return parseMergeBlockBranchResponse(data), nil
}

// parseMergeBlockBranchResponse extracts MergeBlockBranchResponse{branch=1,
// build_commit_sha=2, define_commit_sha=3} from a completed Operation's Any response
// (field 5), mirroring parseInstallBlockBranch's approach for InstallBlockResponse.
func parseMergeBlockBranchResponse(data []byte) *MergeBlockBranchResult {
	out := &MergeBlockBranchResult{}
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		data = data[m:]
		if num != 5 { // field 5 = response (google.protobuf.Any)
			continue
		}
		anyData := b
		for len(anyData) > 0 {
			fn, ftyp, fn2 := protowire.ConsumeTag(anyData)
			if fn2 < 0 {
				break
			}
			anyData = anyData[fn2:]
			if ftyp != protowire.BytesType {
				m := protowire.ConsumeFieldValue(fn, ftyp, anyData)
				if m < 0 {
					break
				}
				anyData = anyData[m:]
				continue
			}
			ab, am := protowire.ConsumeBytes(anyData)
			if am < 0 {
				break
			}
			anyData = anyData[am:]
			if fn == 2 { // value bytes = serialized MergeBlockBranchResponse
				out.Branch = parseStringFieldN(ab, 1)
				out.BuildCommitSHA = parseStringFieldN(ab, 2)
				out.DefineCommitSHA = parseStringFieldN(ab, 3)
				return out
			}
		}
	}
	return out
}

// parseStringFieldN extracts field n (string/bytes) from a proto message.
func parseStringFieldN(data []byte, fieldNum protowire.Number) string {
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
			if num == fieldNum {
				return string(b)
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
	return ""
}

// parseOperationStatus reads a google.longrunning.Operation and returns (done, errorMessage).
// f1=name, f3=done(varint bool), f4=error(Status: f1=code, f2=message).
func parseOperationStatus(data []byte) (done bool, errMsg string) {
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		switch typ {
		case protowire.VarintType:
			v, m := protowire.ConsumeVarint(data)
			if m < 0 {
				return
			}
			if num == 3 {
				done = v != 0
			}
			data = data[m:]
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return
			}
			if num == 4 {
				_, msg := alisclient.ParseStatus(b)
				if msg != "" {
					errMsg = msg
				}
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return
			}
			data = data[m:]
		}
	}
	return
}

// parseStringField1 extracts field 1 (string) from a proto message — used for name fields.
func parseStringField1(data []byte) string {
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
			if num == 1 {
				return string(b)
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
	return ""
}

// parseFirstEntitlementName returns the name (field 1) of the first Entitlement in a ListEntitlements response.
func parseFirstEntitlementName(data []byte) string {
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		data = data[m:]
		if num == 1 {
			name := parseStringField1(b)
			if name != "" {
				return name
			}
		}
	}
	return ""
}

// parseInstallNeuronsResponse parses a ListNeurons response.
// Outer field 1 = repeated Neuron (f1=name, f2=display_name).
// Package is derived from the neuron resource name.
func parseInstallNeuronsResponse(data []byte) []InstallNeuron {
	var neurons []InstallNeuron
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		data = data[m:]
		if num == 1 {
			neuron := parseInstallNeuron(b)
			if neuron.Name != "" {
				neurons = append(neurons, neuron)
			}
		}
	}
	return neurons
}

func parseInstallNeuron(data []byte) InstallNeuron {
	// Neuron proto fields: f1=name, f2=version, f3=build_commit, f4=package,
	// f5=latest_version_state(enum), f6=last_version_logs_uri. No display_name field.
	var n InstallNeuron
	for len(data) > 0 {
		num, typ, nn := protowire.ConsumeTag(data)
		if nn < 0 {
			break
		}
		data = data[nn:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		data = data[m:]
		switch num {
		case 1:
			n.Name = string(b)
		case 4:
			n.Package = string(b)
		}
	}
	if n.Name != "" {
		// Derive package from name if the server didn't include it.
		if n.Package == "" {
			n.Package = neuronNameToPackage(n.Name)
		}
		// Display name = neuron ID segment (no display_name in the Neuron proto).
		if i := strings.LastIndex(n.Name, "/"); i >= 0 {
			n.DisplayName = n.Name[i+1:]
		}
	}
	return n
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

// parseBlockPlansResponse parses a ListEntitlementPlans response.
// Outer field 1 = repeated Entitlement (the plan list reuses the Entitlement message;
// f1=name, f9=display_name — f2 is entitlement_plan_reference, not display_name).
func parseBlockPlansResponse(data []byte) []BlockPlan {
	var plans []BlockPlan
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		data = data[m:]
		if num == 1 {
			plan := parseBlockPlan(b)
			if plan.Name != "" {
				plans = append(plans, plan)
			}
		}
	}
	return plans
}

func parseBlockPlan(data []byte) BlockPlan {
	var p BlockPlan
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ != protowire.BytesType {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				break
			}
			data = data[m:]
			continue
		}
		b, m := protowire.ConsumeBytes(data)
		if m < 0 {
			break
		}
		data = data[m:]
		switch num {
		case 1:
			p.Name = string(b)
		case 9:
			p.DisplayName = string(b)
		}
	}
	if p.DisplayName == "" && p.Name != "" {
		if i := strings.LastIndex(p.Name, "/"); i >= 0 {
			p.DisplayName = p.Name[i+1:]
		}
	}
	return p
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

	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, instanceName)

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
	opName := parseStringField1(body[5:])
	if opName == "" {
		return fmt.Errorf("UninstallBlock: empty operation name in response")
	}
	_, err = s.pollOperation(ctx, "alis.bl.blocks.v1.BlocksService/GetOperation", opName)
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

	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, instanceName)
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendString(buf, blockVersionName)

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
	opName := parseStringField1(body[5:])
	if opName == "" {
		return fmt.Errorf("UpgradeBlock: empty operation name in response")
	}
	_, err = s.pollOperation(ctx, "alis.bl.blocks.v1.BlocksService/GetOperation", opName)
	return err
}

// CreateCodeblock creates a new code block and returns its resource name (e.g. "blocks/myblock").
func (s *ProductService) CreateCodeblock(params CreateCodeblockParams) (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}
	accountName := s.myPrimaryAccountID()
	protoBytes := marshalCreateBlockRequest(params, accountName)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/CreateBlock", protoBytes)
	if err != nil {
		return "", fmt.Errorf("CreateBlock: %w", err)
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("CreateBlock: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("CreateBlock: response too short (%d bytes)", len(body))
	}
	return parseCreateBlockName(body[5:]), nil
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

func marshalCreateBlockRequest(p CreateCodeblockParams, accountName string) []byte {
	// overview_details (field 31 of Block)
	var overview []byte
	if p.HeroStatement != "" {
		overview = protowire.AppendTag(overview, 2, protowire.BytesType)
		overview = protowire.AppendString(overview, p.HeroStatement)
	}
	if p.Description != "" {
		overview = protowire.AppendTag(overview, 3, protowire.BytesType)
		overview = protowire.AppendString(overview, p.Description)
	}
	for _, h := range p.Highlights {
		if h != "" {
			overview = protowire.AppendTag(overview, 6, protowire.BytesType)
			overview = protowire.AppendString(overview, h)
		}
	}
	for _, kf := range p.KeyFeatures {
		var feat []byte
		feat = protowire.AppendTag(feat, 1, protowire.BytesType)
		feat = protowire.AppendString(feat, kf.Title)
		feat = protowire.AppendTag(feat, 2, protowire.BytesType)
		feat = protowire.AppendString(feat, kf.Description)
		overview = protowire.AppendTag(overview, 7, protowire.BytesType)
		overview = protowire.AppendBytes(overview, feat)
	}
	for _, al := range p.CodeArchitecture {
		var layer []byte
		layer = protowire.AppendTag(layer, 1, protowire.BytesType)
		layer = protowire.AppendString(layer, al.Title)
		layer = protowire.AppendTag(layer, 2, protowire.BytesType)
		layer = protowire.AppendString(layer, al.Description)
		overview = protowire.AppendTag(overview, 8, protowire.BytesType)
		overview = protowire.AppendBytes(overview, layer)
	}

	// publisher (field 30 of Block)
	var publisher []byte
	if accountName != "" {
		publisher = protowire.AppendTag(publisher, 1, protowire.BytesType)
		publisher = protowire.AppendString(publisher, accountName)
	}

	// Block message (field 2 of CreateBlockRequest)
	var block []byte
	if p.DisplayName != "" {
		block = protowire.AppendTag(block, 2, protowire.BytesType)
		block = protowire.AppendString(block, p.DisplayName)
	}
	if p.Tagline != "" {
		block = protowire.AppendTag(block, 13, protowire.BytesType)
		block = protowire.AppendString(block, p.Tagline)
	}
	if len(publisher) > 0 {
		block = protowire.AppendTag(block, 30, protowire.BytesType)
		block = protowire.AppendBytes(block, publisher)
	}
	if len(overview) > 0 {
		block = protowire.AppendTag(block, 31, protowire.BytesType)
		block = protowire.AppendBytes(block, overview)
	}

	// CreateBlockRequest: f2=block, f3=block_id
	var req []byte
	req = protowire.AppendTag(req, 2, protowire.BytesType)
	req = protowire.AppendBytes(req, block)
	req = protowire.AppendTag(req, 3, protowire.BytesType)
	req = protowire.AppendString(req, p.BlockID)
	return req
}

// parseCreateBlockName extracts the resource name (field 1) from the returned Block.
// UpdateCodeblock calls BlocksService/UpdateBlock with the given params.
func (s *ProductService) UpdateCodeblock(params CreateCodeblockParams) error {
	if err := s.initTokens(); err != nil {
		return err
	}
	blockName := "blocks/" + params.BlockID
	buf := marshalUpdateBlockRequest(blockName, params)
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

func marshalUpdateBlockRequest(blockName string, p CreateCodeblockParams) []byte {
	// overview_details sub-message (same layout as create)
	var overview []byte
	if p.HeroStatement != "" {
		overview = protowire.AppendTag(overview, 2, protowire.BytesType)
		overview = protowire.AppendString(overview, p.HeroStatement)
	}
	if p.Description != "" {
		overview = protowire.AppendTag(overview, 3, protowire.BytesType)
		overview = protowire.AppendString(overview, p.Description)
	}
	for _, h := range p.Highlights {
		overview = protowire.AppendTag(overview, 6, protowire.BytesType)
		overview = protowire.AppendString(overview, h)
	}
	for _, kf := range p.KeyFeatures {
		var feat []byte
		feat = protowire.AppendTag(feat, 1, protowire.BytesType)
		feat = protowire.AppendString(feat, kf.Title)
		feat = protowire.AppendTag(feat, 2, protowire.BytesType)
		feat = protowire.AppendString(feat, kf.Description)
		overview = protowire.AppendTag(overview, 7, protowire.BytesType)
		overview = protowire.AppendBytes(overview, feat)
	}
	for _, al := range p.CodeArchitecture {
		var layer []byte
		layer = protowire.AppendTag(layer, 1, protowire.BytesType)
		layer = protowire.AppendString(layer, al.Title)
		layer = protowire.AppendTag(layer, 2, protowire.BytesType)
		layer = protowire.AppendString(layer, al.Description)
		overview = protowire.AppendTag(overview, 8, protowire.BytesType)
		overview = protowire.AppendBytes(overview, layer)
	}

	// Block message: f1=name, f2=display_name, f13=tagline, f31=overview_details
	var block []byte
	block = protowire.AppendTag(block, 1, protowire.BytesType)
	block = protowire.AppendString(block, blockName)
	if p.DisplayName != "" {
		block = protowire.AppendTag(block, 2, protowire.BytesType)
		block = protowire.AppendString(block, p.DisplayName)
	}
	if p.Tagline != "" {
		block = protowire.AppendTag(block, 13, protowire.BytesType)
		block = protowire.AppendString(block, p.Tagline)
	}
	if len(overview) > 0 {
		block = protowire.AppendTag(block, 31, protowire.BytesType)
		block = protowire.AppendBytes(block, overview)
	}

	// update_mask (FieldMask): f1=paths repeated
	var mask []byte
	for _, path := range []string{"display_name", "tagline", "overview_details"} {
		mask = protowire.AppendTag(mask, 1, protowire.BytesType)
		mask = protowire.AppendString(mask, path)
	}

	// UpdateBlockRequest: f1=block, f2=update_mask
	var req []byte
	req = protowire.AppendTag(req, 1, protowire.BytesType)
	req = protowire.AppendBytes(req, block)
	req = protowire.AppendTag(req, 2, protowire.BytesType)
	req = protowire.AppendBytes(req, mask)
	return req
}

// ContributeBlock publishes a new block version with code files via BlockVersionsService/CreateBlockVersion (LRO).
// Returns the created version resource name, e.g. "blocks/myblock/versions/v1.0.0-experimental1".
func (s *ProductService) ContributeBlock(params ContributeBlockParams) (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}
	buf := marshalCreateBlockVersionRequest(params)
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
	opName := parseStringField1(body[5:])
	if opName == "" {
		return "", fmt.Errorf("ContributeBlock: empty operation name in response")
	}
	if _, err := s.pollOperation(ctx, "alis.bl.blocks.v1.BlocksService/GetOperation", opName); err != nil {
		return "", fmt.Errorf("ContributeBlock: operation failed: %w", err)
	}
	return "blocks/" + params.BlockID + "/versions/" + params.VersionTag, nil
}

func marshalCreateBlockVersionRequest(p ContributeBlockParams) []byte {
	// File sub-message: f1=filename, f2=content (bytes)
	marshalFile := func(f CodeblockFileItem) []byte {
		var b []byte
		b = protowire.AppendTag(b, 1, protowire.BytesType)
		b = protowire.AppendString(b, f.Name)
		b = protowire.AppendTag(b, 2, protowire.BytesType)
		b = protowire.AppendBytes(b, []byte(f.Content))
		return b
	}

	// BlockVersion.Content: f1=build_files, f2=infra_files, f3=proto_files
	var content []byte
	for _, f := range p.BuildFiles {
		content = protowire.AppendTag(content, 1, protowire.BytesType)
		content = protowire.AppendBytes(content, marshalFile(f))
	}
	for _, f := range p.InfraFiles {
		content = protowire.AppendTag(content, 2, protowire.BytesType)
		content = protowire.AppendBytes(content, marshalFile(f))
	}
	for _, f := range p.ProtoFiles {
		content = protowire.AppendTag(content, 3, protowire.BytesType)
		content = protowire.AppendBytes(content, marshalFile(f))
	}

	// BlockVersion: f3=contributed_content, f4=release_notes, f9=release_level
	// Note: version (f2) must be empty — the ID is sent as block_version_id on the request.
	var bv []byte
	if len(content) > 0 {
		bv = protowire.AppendTag(bv, 3, protowire.BytesType)
		bv = protowire.AppendBytes(bv, content)
	}
	if p.ReleaseNotes != "" {
		bv = protowire.AppendTag(bv, 4, protowire.BytesType)
		bv = protowire.AppendString(bv, p.ReleaseNotes)
	}
	if p.ReleaseLevel != 0 {
		bv = protowire.AppendTag(bv, 9, protowire.VarintType)
		bv = protowire.AppendVarint(bv, uint64(p.ReleaseLevel))
	}

	// CreateBlockVersionRequest: f1=parent, f2=block_version, f3=block_version_id
	var req []byte
	req = protowire.AppendTag(req, 1, protowire.BytesType)
	req = protowire.AppendString(req, "blocks/"+p.BlockID)
	req = protowire.AppendTag(req, 2, protowire.BytesType)
	req = protowire.AppendBytes(req, bv)
	if p.VersionTag != "" {
		req = protowire.AppendTag(req, 3, protowire.BytesType)
		req = protowire.AppendString(req, p.VersionTag)
	}
	return req
}

func parseCreateBlockName(data []byte) string {
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
			if num == 1 {
				return string(b)
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
	return ""
}

// OpenBlockWorktrees creates git worktrees for an instance's build and define repos.
// It returns the root worktree path, e.g. "{tmpdir}/.alis-blocks-worktrees/{blockId}/{packageId}/{instanceId}/".
func (s *ProductService) OpenBlockWorktrees(instanceName string) (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Get the instance's package and git_branch.
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, instanceName)
	fm := marshalFieldMask([]string{"package", "git_branch"})
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendBytes(buf, fm)

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.InstancesService/GetInstance", buf)
	if err != nil {
		return "", fmt.Errorf("OpenBlockWorktrees: GetInstance: %w", err)
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("OpenBlockWorktrees: GetInstance: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("OpenBlockWorktrees: GetInstance: response too short")
	}
	data := body[5:]
	pkg := parseStringFieldN(data, 2)    // Instance.package
	branch := parseStringFieldN(data, 6) // Instance.git_branch
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

	// Fetch latest refs in both repos.
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

// GetBlockCommits returns recent commits from the build or define repo for a given instance.
// repoType must be "build" or "define".
func (s *ProductService) GetBlockCommits(instanceName, repoType string, limit int) ([]BlockCommit, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Fetch instance package + git_branch.
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, instanceName)
	fm := marshalFieldMask([]string{"package", "git_branch"})
	buf = protowire.AppendTag(buf, 2, protowire.BytesType)
	buf = protowire.AppendBytes(buf, fm)

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.InstancesService/GetInstance", buf)
	if err != nil {
		return nil, fmt.Errorf("GetBlockCommits: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("GetBlockCommits: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("GetBlockCommits: response too short")
	}
	data := body[5:]
	pkg := parseStringFieldN(data, 2)
	branch := parseStringFieldN(data, 6)
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

// ContributeBlockFromCommits publishes a new block version using define and build commit SHAs.
// This is the production path that matches the VSCode extension's worktree-based flow.
func (s *ProductService) ContributeBlockFromCommits(instanceName, defineCommitSha, buildCommitSha string, releaseLevel int32, releaseNotes string) (string, error) {
	if err := s.initTokens(); err != nil {
		return "", err
	}

	// Derive blockId from instanceName: "blocks/{blockId}/instances/{instanceId}"
	parts := strings.Split(instanceName, "/")
	if len(parts) < 2 {
		return "", fmt.Errorf("ContributeBlockFromCommits: unexpected instance name: %s", instanceName)
	}
	blockID := parts[1]

	req := marshalCreateBlockVersionFromCommitsRequest(blockID, instanceName, defineCommitSha, buildCommitSha, releaseLevel, releaseNotes)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlockVersionsService/CreateBlockVersion", req)
	if err != nil {
		return "", fmt.Errorf("ContributeBlockFromCommits: %w", err)
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("ContributeBlockFromCommits: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("ContributeBlockFromCommits: response too short (%d bytes)", len(body))
	}
	opName := parseStringField1(body[5:])
	if opName == "" {
		return "", fmt.Errorf("ContributeBlockFromCommits: empty operation name in response")
	}
	if _, err := s.pollOperation(ctx, "alis.bl.blocks.v1.BlocksService/GetOperation", opName); err != nil {
		return "", fmt.Errorf("ContributeBlockFromCommits: operation failed: %w", err)
	}
	return "blocks/" + blockID, nil
}

func marshalCreateBlockVersionFromCommitsRequest(blockID, instanceName, defineCommitSha, buildCommitSha string, releaseLevel int32, releaseNotes string) []byte {
	// BlockVersion.Source sub-message: f1=instance, f2=commit_sha
	marshalSource := func(inst, sha string) []byte {
		var b []byte
		b = protowire.AppendTag(b, 1, protowire.BytesType)
		b = protowire.AppendString(b, inst)
		b = protowire.AppendTag(b, 2, protowire.BytesType)
		b = protowire.AppendString(b, sha)
		return b
	}

	// BlockVersion: f5=define_source, f6=build_source, f4=release_notes, f9=release_level
	var bv []byte
	if defineCommitSha != "" {
		bv = protowire.AppendTag(bv, 5, protowire.BytesType)
		bv = protowire.AppendBytes(bv, marshalSource(instanceName, defineCommitSha))
	}
	if buildCommitSha != "" {
		bv = protowire.AppendTag(bv, 6, protowire.BytesType)
		bv = protowire.AppendBytes(bv, marshalSource(instanceName, buildCommitSha))
	}
	if releaseNotes != "" {
		bv = protowire.AppendTag(bv, 4, protowire.BytesType)
		bv = protowire.AppendString(bv, releaseNotes)
	}
	if releaseLevel != 0 {
		bv = protowire.AppendTag(bv, 9, protowire.VarintType)
		bv = protowire.AppendVarint(bv, uint64(releaseLevel))
	}

	// CreateBlockVersionRequest: f1=parent, f2=block_version
	var req []byte
	req = protowire.AppendTag(req, 1, protowire.BytesType)
	req = protowire.AppendString(req, "blocks/"+blockID)
	req = protowire.AppendTag(req, 2, protowire.BytesType)
	req = protowire.AppendBytes(req, bv)
	return req
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
