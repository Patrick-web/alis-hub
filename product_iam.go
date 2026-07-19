package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	accountsv1pb "alis-hub-v3/gen/go/alis/os/accounts/v1"
	iamv2pb "alis-hub-v3/gen/go/alis/os/iam/v2"

	iampb "cloud.google.com/go/iam/apiv1/iampb"
	"google.golang.org/protobuf/proto"
)

// ── Account users (for IAM pickers) ──────────────────────────────────────────

type AccountUser struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	Email       string `json:"email"`
	PhotoURL    string `json:"photoUrl"`
}

// ListAccountUsers returns all users in the caller's primary account, used to
// populate IAM member pickers.
func (s *ProductService) ListAccountUsers() ([]AccountUser, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	accountID := s.myPrimaryAccountID()
	if accountID == "" {
		return nil, fmt.Errorf("ListAccountUsers: could not determine account")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req := &accountsv1pb.RetrieveMaskedUsersRequest{Account: accountID}
	reqBytes, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("ListAccountUsers: marshal request: %w", err)
	}

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.accounts.v1.AccountsService/RetrieveMaskedUsers", reqBytes)
	if err != nil {
		return nil, fmt.Errorf("ListAccountUsers: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListAccountUsers: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListAccountUsers: response too short")
	}

	resp := &accountsv1pb.RetrieveMaskedUsersResponse{}
	if err := proto.Unmarshal(body[5:], resp); err != nil {
		return nil, fmt.Errorf("ListAccountUsers: unmarshal response: %w", err)
	}

	result := make([]AccountUser, 0, len(resp.GetMaskedUsers()))
	for _, m := range resp.GetMaskedUsers() {
		u := iamUserFromAccountsMasked(m)
		displayName := strings.TrimSpace(u.FirstName + " " + u.LastName)
		if displayName == "" {
			displayName = u.Email
		}
		if u.Name == "" {
			continue
		}
		result = append(result, AccountUser{
			Name:        u.Name,
			DisplayName: displayName,
			Email:       u.Email,
			PhotoURL:    u.PhotoURL,
		})
	}
	return result, nil
}

// ── Block IAM access ──────────────────────────────────────────────────────────

type BlockRole struct {
	Name  string `json:"name"`
	Title string `json:"title"`
}

// ListBlockRoles returns the fixed set of IAM roles usable on a block's access policy.
// Blocks don't sit under an organisations/*/products/* parent, so the generic
// RolesService/ListRoles RPC (which requires one) can't be used here; the role set
// mirrors the roles/block.* names recognized by blockRoleLabel.
func (s *ProductService) ListBlockRoles(blockId string) ([]BlockRole, error) {
	return []BlockRole{
		{Name: "roles/block.admin", Title: "Admin"},
		{Name: "roles/block.contributor", Title: "Contributor"},
	}, nil
}

type BlockAccessMember struct {
	Member      string `json:"member"`
	DisplayName string `json:"displayName"`
	Email       string `json:"email"`
	PhotoURL    string `json:"photoUrl"`
	Role        string `json:"role"`
	RoleLabel   string `json:"roleLabel"`
}

type BlockAccessData struct {
	Members []BlockAccessMember `json:"members"`
}

// GetBlockAccessData fetches the IAM policy for a block and enriches each member with user details.
func (s *ProductService) GetBlockAccessData(blockId string) (*BlockAccessData, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	getReq := &iampb.GetIamPolicyRequest{Resource: "blocks/" + blockId}
	getReqBytes, err := proto.Marshal(getReq)
	if err != nil {
		return nil, fmt.Errorf("GetBlockAccessData: marshal request: %w", err)
	}

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/GetIamPolicy", getReqBytes)
	if err != nil {
		return nil, fmt.Errorf("GetBlockAccessData: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("GetBlockAccessData: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("GetBlockAccessData: response too short")
	}

	policy := &iampb.Policy{}
	if err := proto.Unmarshal(body[5:], policy); err != nil {
		return nil, fmt.Errorf("GetBlockAccessData: unmarshal response: %w", err)
	}
	bindings := policyBindingsToIamBindings(policy)

	userIDs := map[string]struct{}{}
	for _, b := range bindings {
		for _, m := range b.Members {
			if strings.HasPrefix(m, "user:") {
				userIDs[strings.TrimPrefix(m, "user:")] = struct{}{}
			}
		}
	}

	userMap := map[string]iamUser{}
	if len(userIDs) > 0 {
		usersReq := &iamv2pb.BatchRetrieveMaskedUsersRequest{}
		for id := range userIDs {
			usersReq.Users = append(usersReq.Users, "users/"+id)
		}
		if usersReqBytes, mErr := proto.Marshal(usersReq); mErr == nil {
			resp, st, _, batchErr := s.doConsoleGRPCWeb(ctx, "alis.os.iam.v2.UsersService/BatchRetrieveMaskedUsers", usersReqBytes)
			if batchErr == nil && st == 0 && len(resp) >= 5 {
				usersResp := &iamv2pb.BatchRetrieveMaskedUsersResponse{}
				if proto.Unmarshal(resp[5:], usersResp) == nil {
					for _, m := range usersResp.GetMaskedUsers() {
						u := iamUserFromV2Masked(m)
						userMap[strings.TrimPrefix(u.Name, "users/")] = u
					}
				}
			}
		}
	}

	result := &BlockAccessData{Members: []BlockAccessMember{}}
	for _, binding := range bindings {
		roleLabel := blockRoleLabel(binding.Role)
		for _, m := range binding.Members {
			am := BlockAccessMember{Member: m, Role: binding.Role, RoleLabel: roleLabel}
			if strings.HasPrefix(m, "user:") {
				id := strings.TrimPrefix(m, "user:")
				u := userMap[id]
				am.DisplayName = strings.TrimSpace(u.FirstName + " " + u.LastName)
				am.Email = u.Email
				am.PhotoURL = u.PhotoURL
				if am.DisplayName == "" {
					am.DisplayName = u.Email
				}
				if am.DisplayName == "" {
					am.DisplayName = id
				}
			} else {
				am.DisplayName = m
			}
			result.Members = append(result.Members, am)
		}
	}
	return result, nil
}

// UpdateBlockAccess adds or removes a single member from a role on a block's IAM policy.
// member must be in "user:ID" IAM form. grant=true to add, grant=false to remove.
func (s *ProductService) UpdateBlockAccess(blockId, role, member string, grant bool) error {
	if err := s.initTokens(); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	getReq := &iampb.GetIamPolicyRequest{Resource: "blocks/" + blockId}
	getReqBytes, err := proto.Marshal(getReq)
	if err != nil {
		return fmt.Errorf("UpdateBlockAccess: marshal GetIamPolicy request: %w", err)
	}

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/GetIamPolicy", getReqBytes)
	if err != nil {
		return fmt.Errorf("UpdateBlockAccess/GetIamPolicy: %w", err)
	}
	if grpcStatus != 0 {
		return fmt.Errorf("UpdateBlockAccess/GetIamPolicy: grpc %d: %s", grpcStatus, grpcMsg)
	}

	policy := &iampb.Policy{}
	if len(body) >= 5 {
		if err := proto.Unmarshal(body[5:], policy); err != nil {
			return fmt.Errorf("UpdateBlockAccess: unmarshal policy: %w", err)
		}
	}
	bindings := policyBindingsToIamBindings(policy)

	if grant {
		bindings = blockAddMember(bindings, role, member)
	} else {
		bindings = blockRemoveMember(bindings, role, member)
	}

	setReq := &iampb.SetIamPolicyRequest{
		Resource: "blocks/" + blockId,
		Policy: &iampb.Policy{
			Etag:     policy.GetEtag(),
			Bindings: iamBindingsToPolicyBindings(bindings),
		},
	}
	setReqBytes, err := proto.Marshal(setReq)
	if err != nil {
		return fmt.Errorf("UpdateBlockAccess: marshal SetIamPolicy request: %w", err)
	}

	_, grpcStatus, grpcMsg, err = s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/SetIamPolicy", setReqBytes)
	if err != nil {
		return fmt.Errorf("UpdateBlockAccess/SetIamPolicy: %w", err)
	}
	if grpcStatus != 0 {
		return fmt.Errorf("UpdateBlockAccess/SetIamPolicy: grpc %d: %s", grpcStatus, grpcMsg)
	}
	return nil
}

func blockRoleLabel(role string) string {
	switch role {
	case "roles/block.admin":
		return "Admin"
	case "roles/block.contributor":
		return "Contributor"
	default:
		r := strings.TrimPrefix(role, "roles/block.")
		if r == role {
			r = strings.TrimPrefix(role, "roles/")
		}
		if len(r) == 0 {
			return role
		}
		return strings.ToUpper(r[:1]) + r[1:]
	}
}

func blockAddMember(bindings []iamBinding, role, member string) []iamBinding {
	for i, b := range bindings {
		if b.Role == role {
			for _, m := range b.Members {
				if m == member {
					return bindings
				}
			}
			bindings[i].Members = append(bindings[i].Members, member)
			return bindings
		}
	}
	return append(bindings, iamBinding{Role: role, Members: []string{member}})
}

func blockRemoveMember(bindings []iamBinding, role, member string) []iamBinding {
	result := make([]iamBinding, 0, len(bindings))
	for _, b := range bindings {
		if b.Role == role {
			var filtered []string
			for _, m := range b.Members {
				if m != member {
					filtered = append(filtered, m)
				}
			}
			if len(filtered) > 0 {
				result = append(result, iamBinding{Role: b.Role, Members: filtered})
			}
		} else {
			result = append(result, b)
		}
	}
	return result
}
