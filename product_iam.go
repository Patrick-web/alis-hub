package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"google.golang.org/protobuf/encoding/protowire"
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

	var req []byte
	req = protowire.AppendTag(req, 1, protowire.BytesType)
	req = protowire.AppendString(req, accountID)

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.accounts.v1.AccountsService/RetrieveMaskedUsers", req)
	if err != nil {
		return nil, fmt.Errorf("ListAccountUsers: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListAccountUsers: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListAccountUsers: response too short")
	}

	raw := parseBatchUsersResponse(body[5:])
	result := make([]AccountUser, 0, len(raw))
	for _, u := range raw {
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

	var req []byte
	req = protowire.AppendTag(req, 1, protowire.BytesType)
	req = protowire.AppendString(req, "blocks/"+blockId)

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/GetIamPolicy", req)
	if err != nil {
		return nil, fmt.Errorf("GetBlockAccessData: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("GetBlockAccessData: grpc %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("GetBlockAccessData: response too short")
	}

	bindings := parseIamPolicy(body[5:])

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
		var buf []byte
		for id := range userIDs {
			buf = protowire.AppendTag(buf, 1, protowire.BytesType)
			buf = protowire.AppendString(buf, "users/"+id)
		}
		resp, st, _, batchErr := s.doConsoleGRPCWeb(ctx, "alis.os.iam.v2.UsersService/BatchRetrieveMaskedUsers", buf)
		if batchErr == nil && st == 0 && len(resp) >= 5 {
			for _, u := range parseBatchUsersResponse(resp[5:]) {
				userMap[strings.TrimPrefix(u.Name, "users/")] = u
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

	var getReq []byte
	getReq = protowire.AppendTag(getReq, 1, protowire.BytesType)
	getReq = protowire.AppendString(getReq, "blocks/"+blockId)

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/GetIamPolicy", getReq)
	if err != nil {
		return fmt.Errorf("UpdateBlockAccess/GetIamPolicy: %w", err)
	}
	if grpcStatus != 0 {
		return fmt.Errorf("UpdateBlockAccess/GetIamPolicy: grpc %d: %s", grpcStatus, grpcMsg)
	}

	var bindings []iamBinding
	var etag []byte
	if len(body) >= 5 {
		bindings, etag = parseIamPolicyFull(body[5:])
	}

	if grant {
		bindings = blockAddMember(bindings, role, member)
	} else {
		bindings = blockRemoveMember(bindings, role, member)
	}

	policyBytes := marshalBlockIamPolicy(bindings, etag)
	var setReq []byte
	setReq = protowire.AppendTag(setReq, 1, protowire.BytesType)
	setReq = protowire.AppendString(setReq, "blocks/"+blockId)
	setReq = protowire.AppendTag(setReq, 2, protowire.BytesType)
	setReq = protowire.AppendBytes(setReq, policyBytes)

	_, grpcStatus, grpcMsg, err = s.doConsoleGRPCWeb(ctx, "alis.bl.blocks.v1.BlocksService/SetIamPolicy", setReq)
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

// parseIamPolicyFull extracts both bindings (field 4) and etag (field 3) from a Policy proto.
func parseIamPolicyFull(data []byte) ([]iamBinding, []byte) {
	var bindings []iamBinding
	var etag []byte
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
			switch num {
			case 3:
				etag = append([]byte(nil), b...)
			case 4:
				bindings = append(bindings, parseIamBinding(b))
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
	return bindings, etag
}

func marshalBlockIamPolicy(bindings []iamBinding, etag []byte) []byte {
	var buf []byte
	if len(etag) > 0 {
		buf = protowire.AppendTag(buf, 3, protowire.BytesType)
		buf = protowire.AppendBytes(buf, etag)
	}
	for _, b := range bindings {
		var bindBuf []byte
		bindBuf = protowire.AppendTag(bindBuf, 1, protowire.BytesType)
		bindBuf = protowire.AppendString(bindBuf, b.Role)
		for _, m := range b.Members {
			bindBuf = protowire.AppendTag(bindBuf, 2, protowire.BytesType)
			bindBuf = protowire.AppendString(bindBuf, m)
		}
		buf = protowire.AppendTag(buf, 4, protowire.BytesType)
		buf = protowire.AppendBytes(buf, bindBuf)
	}
	return buf
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
