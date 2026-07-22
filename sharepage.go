package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	accountsv1pb "alis-hub-v3/gen/go/alis/os/accounts/v1"
	iamv2pb "alis-hub-v3/gen/go/alis/os/iam/v2"

	iampb "cloud.google.com/go/iam/apiv1/iampb"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

// ─── IAM-based share data ────────────────────────────────────────────────────

type SharePerson struct {
	Member      string `json:"member"`
	DisplayName string `json:"displayName"`
	Email       string `json:"email"`
	PhotoURL    string `json:"photoUrl"`
	Role        string `json:"role"`
	IsGroup     bool   `json:"isGroup"`
}

type ShareAccount struct {
	AccountID   string `json:"accountId"`
	DisplayName string `json:"displayName"`
	Role        string `json:"role"`
	IsExternal  bool   `json:"isExternal"`
}

type ShareData struct {
	People           []SharePerson  `json:"people"`
	Accounts         []ShareAccount `json:"accounts"`
	ExternalAccounts []ShareAccount `json:"externalAccounts"`
}

// GetShareData fetches the IAM policy for the product and enriches each member
// with display names via BatchRetrieveMaskedUsers and RetrieveMaskedAccounts.
func (s *ProductService) GetShareData(org, product string) (*ShareData, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Own account — used to distinguish "Accounts with access" vs "External Accounts".
	ownAccount, _ := s.getUserAccount(ctx)
	ownAccountID := strings.TrimPrefix(ownAccount, "accounts/")

	// ── GetIamPolicy ──────────────────────────────────────────────────────────
	resource := fmt.Sprintf("organisations/%s/products/%s", org, product)
	getReq := &iampb.GetIamPolicyRequest{Resource: resource}
	reqBuf, err := proto.Marshal(getReq)
	if err != nil {
		return nil, fmt.Errorf("GetIamPolicy: marshal request: %w", err)
	}

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx,
		"alis.os.products.v1.ProductsService/GetIamPolicy", reqBuf)
	if err != nil {
		return nil, fmt.Errorf("GetIamPolicy: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("GetIamPolicy: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("GetIamPolicy: empty response")
	}
	policy := &iampb.Policy{}
	if err := proto.Unmarshal(body[5:], policy); err != nil {
		return nil, fmt.Errorf("GetIamPolicy: unmarshal response: %w", err)
	}
	bindings := policyBindingsToIamBindings(policy)

	// ── Collect user IDs and account IDs ──────────────────────────────────────
	userIDs := map[string]struct{}{}
	accountIDs := map[string]struct{}{}
	for _, b := range bindings {
		for _, m := range b.Members {
			switch {
			case strings.HasPrefix(m, "user:"):
				userIDs[strings.TrimPrefix(m, "user:")] = struct{}{}
			case strings.HasPrefix(m, "account:"):
				accountIDs[strings.TrimPrefix(m, "account:")] = struct{}{}
			}
		}
	}

	// ── BatchRetrieveMaskedUsers ───────────────────────────────────────────────
	userMap := map[string]iamUser{}
	if len(userIDs) > 0 {
		usersReq := &iamv2pb.BatchRetrieveMaskedUsersRequest{}
		for id := range userIDs {
			usersReq.Users = append(usersReq.Users, "users/"+id)
		}
		if buf, mErr := proto.Marshal(usersReq); mErr == nil {
			resp, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx,
				"alis.os.iam.v2.UsersService/BatchRetrieveMaskedUsers", buf)
			if err == nil && grpcStatus == 0 && len(resp) >= 5 {
				usersResp := &iamv2pb.BatchRetrieveMaskedUsersResponse{}
				if proto.Unmarshal(resp[5:], usersResp) == nil {
					for _, m := range usersResp.GetMaskedUsers() {
						u := iamUserFromV2Masked(m)
						userMap[strings.TrimPrefix(u.Name, "users/")] = u
					}
				}
			} else if grpcStatus != 0 {
				// non-fatal: continue without user details
				_ = grpcMsg
			}
		}
	}

	// ── RetrieveMaskedAccounts ────────────────────────────────────────────────
	accountMap := map[string]iamAccount{}
	if len(accountIDs) > 0 {
		acctReq := &accountsv1pb.RetrieveMaskedAccountsRequest{}
		for id := range accountIDs {
			acctReq.Accounts = append(acctReq.Accounts, "accounts/"+id)
		}
		if buf, mErr := proto.Marshal(acctReq); mErr == nil {
			resp, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx,
				"alis.os.accounts.v1.AccountsService/RetrieveMaskedAccounts", buf)
			if err == nil && grpcStatus == 0 && len(resp) >= 5 {
				maResp := &accountsv1pb.RetrieveMaskedAccountsResponse{}
				if proto.Unmarshal(resp[5:], maResp) == nil {
					for key, ma := range maResp.GetMaskedAccounts() {
						id := strings.TrimPrefix(key, "accounts/")
						accountMap[id] = iamAccount{
							Name:        key,
							DisplayName: ma.GetDisplayName(),
							PartnerRef:  ma.GetBuildPartner(),
						}
					}
				}
			} else if grpcStatus != 0 {
				_ = grpcMsg
			}
		}
	}

	// ── Build result ──────────────────────────────────────────────────────────
	result := &ShareData{}

	for _, binding := range bindings {
		role := iamRoleLabel(binding.Role)
		for _, m := range binding.Members {
			switch {
			case strings.HasPrefix(m, "user:"):
				id := strings.TrimPrefix(m, "user:")
				u := userMap[id]
				name := strings.TrimSpace(u.FirstName + " " + u.LastName)
				if name == "" {
					name = u.Email
				}
				if name == "" {
					name = id
				}
				result.People = append(result.People, SharePerson{
					Member:      m,
					DisplayName: name,
					Email:       u.Email,
					PhotoURL:    u.PhotoURL,
					Role:        role,
				})

			case strings.HasPrefix(m, "admins:") || strings.HasPrefix(m, "group:"):
				result.People = append(result.People, SharePerson{
					Member:      m,
					DisplayName: m,
					Role:        role,
					IsGroup:     true,
				})

			case strings.HasPrefix(m, "account:"):
				id := strings.TrimPrefix(m, "account:")
				a := accountMap[id]
				displayName := a.DisplayName
				if displayName == "" {
					displayName = id
				}
				isExternal := ownAccountID != "" && id != ownAccountID
				acct := ShareAccount{
					AccountID:   id,
					DisplayName: displayName,
					Role:        role,
					IsExternal:  isExternal,
				}
				if isExternal {
					result.ExternalAccounts = append(result.ExternalAccounts, acct)
				} else {
					result.Accounts = append(result.Accounts, acct)
				}
			}
		}
	}

	return result, nil
}

func iamRoleLabel(role string) string {
	switch role {
	case "roles/product.admin":
		return "Admin"
	case "roles/product.builder":
		return "Builder"
	case "roles/product.viewer":
		return "Viewer"
	default:
		r := strings.TrimPrefix(role, "roles/product.")
		if r == role {
			r = strings.TrimPrefix(role, "roles/")
		}
		return strings.ToUpper(r[:1]) + r[1:]
	}
}

// ─── IAM Policy conversion ──────────────────────────────────────────────────

type iamBinding struct {
	Role    string
	Members []string
}

// policyBindingsToIamBindings maps a google.iam.v1.Policy onto the app's
// internal iamBinding slice.
func policyBindingsToIamBindings(p *iampb.Policy) []iamBinding {
	bindings := make([]iamBinding, 0, len(p.GetBindings()))
	for _, b := range p.GetBindings() {
		bindings = append(bindings, iamBinding{Role: b.GetRole(), Members: b.GetMembers()})
	}
	return bindings
}

// iamBindingsToPolicyBindings is the inverse of policyBindingsToIamBindings,
// used when building a SetIamPolicy request.
func iamBindingsToPolicyBindings(bindings []iamBinding) []*iampb.Binding {
	out := make([]*iampb.Binding, 0, len(bindings))
	for _, b := range bindings {
		out = append(out, &iampb.Binding{Role: b.Role, Members: b.Members})
	}
	return out
}

// ─── BatchRetrieveMaskedUsers parsing ─────────────────────────────────────────

type iamUser struct {
	Name      string
	Email     string
	FirstName string
	LastName  string
	PhotoURL  string
}

// iamUserFromV2Masked maps alis.os.iam.v2.MaskedUser onto the app's iamUser.
func iamUserFromV2Masked(m *iamv2pb.MaskedUser) iamUser {
	return iamUser{
		Name:      m.GetName(),
		Email:     m.GetMaskedEmail(),
		FirstName: m.GetGivenName(),
		LastName:  m.GetFamilyName(),
		PhotoURL:  m.GetPicture(),
	}
}

// iamUserFromAccountsMasked maps alis.os.accounts.v1.RetrieveMaskedUsersResponse_MaskedUser
// onto the app's iamUser.
func iamUserFromAccountsMasked(m *accountsv1pb.RetrieveMaskedUsersResponse_MaskedUser) iamUser {
	return iamUser{
		Name:      m.GetName(),
		Email:     m.GetMaskedEmail(),
		FirstName: m.GetGivenName(),
		LastName:  m.GetFamilyName(),
		PhotoURL:  m.GetPicture(),
	}
}

// ─── Masked account type ──────────────────────────────────────────────────────

type iamAccount struct {
	Name        string
	DisplayName string
	PartnerRef  string // non-empty → external/partner account
}

// ─── Legacy invite-based API (kept for reference) ─────────────────────────────

// BuildSeat values from proto.alis.os.accounts.v1.BuildSeat
const (
	BuildSeatUnspecified = 0
	BuildSeatBuilder     = 1
	BuildSeatArchitect   = 2
	BuildSeatViewer      = 3
)

// ManageSeat values from proto.alis.os.accounts.v1.ManageSeat
const (
	ManageSeatUnspecified = 0
	ManageSeatManager     = 1
	ManageSeatViewer      = 2
)

// InviteUserRole values from proto.alis.os.accounts.v1.Invite.User.Role
const (
	InviteRoleUnspecified = 0
	InviteRoleAdmin       = 1
	InviteRoleViewer      = 2
)

type InviteUserInfo struct {
	User           string `json:"user"`
	Email          string `json:"email"`
	DisplayName    string `json:"displayName"`
	ProfilePicture string `json:"profilePicture"`
	Domain         string `json:"domain"`
	Claimed        bool   `json:"claimed"`
	Role           int32  `json:"role"`
}

type InviteInfo struct {
	Name       string           `json:"name"`
	BuildSeat  int32            `json:"buildSeat"`
	ManageSeat int32            `json:"manageSeat"`
	AllowAll   bool             `json:"allowAll"`
	Domains    []string         `json:"domains"`
	Users      []InviteUserInfo `json:"users"`
	Inviter    string           `json:"inviter"`
}

// getUserAccount calls RetrieveSeatsFromAccessToken and returns the first account name.
func (s *ProductService) getUserAccount(ctx context.Context) (string, error) {
	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx,
		"alis.os.console.v2.ConsoleService/RetrieveSeatsFromAccessToken", nil)
	if err != nil {
		return "", fmt.Errorf("RetrieveSeatsFromAccessToken: %w", err)
	}
	if grpcStatus != 0 {
		return "", fmt.Errorf("RetrieveSeatsFromAccessToken: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return "", fmt.Errorf("RetrieveSeatsFromAccessToken: response too short")
	}
	return parseFirstAccountName(body[5:])
}

func parseFirstAccountName(data []byte) (string, error) {
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
		if num == 1 {
			name := parseAccountNameFromPlan(b)
			if name != "" {
				return name, nil
			}
		}
		data = data[m:]
	}
	return "", fmt.Errorf("no account found in RetrieveSeatsFromAccessToken response")
}

func parseAccountNameFromPlan(data []byte) string {
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
		if num == 1 {
			return parseNameField(b)
		}
		data = data[m:]
	}
	return ""
}

func parseNameField(data []byte) string {
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

func (s *ProductService) ListInvites(org, product string) ([]InviteInfo, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	account, err := s.getUserAccount(ctx)
	if err != nil {
		return nil, fmt.Errorf("ListInvites: resolving account: %w", err)
	}

	req := &accountsv1pb.ListInvitesRequest{Parent: account}
	protoBytes, err := proto.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("ListInvites: marshal request: %w", err)
	}

	body, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx, "alis.os.accounts.v1.InvitesService/ListInvites", protoBytes)
	if err != nil {
		return nil, fmt.Errorf("ListInvites: %w", err)
	}
	if grpcStatus != 0 {
		return nil, fmt.Errorf("ListInvites: grpc status %d: %s", grpcStatus, grpcMsg)
	}
	if len(body) < 5 {
		return nil, fmt.Errorf("ListInvites: response too short (%d bytes)", len(body))
	}

	resp := &accountsv1pb.ListInvitesResponse{}
	if err := proto.Unmarshal(body[5:], resp); err != nil {
		return nil, fmt.Errorf("ListInvites: unmarshal response: %w", err)
	}

	invites := make([]InviteInfo, 0, len(resp.GetInvites()))
	for _, inv := range resp.GetInvites() {
		users := make([]InviteUserInfo, 0, len(inv.GetUsers()))
		for _, u := range inv.GetUsers() {
			users = append(users, InviteUserInfo{
				User:           u.GetUser(),
				Email:          u.GetEmail(),
				DisplayName:    u.GetDisplayName(),
				ProfilePicture: u.GetProfilePictureUri(),
				Domain:         u.GetDomain(),
				Claimed:        u.GetClaimedTime() != nil,
				Role:           int32(u.GetRole()),
			})
		}
		invites = append(invites, InviteInfo{
			Name:       inv.GetName(),
			BuildSeat:  int32(inv.GetBuildSeat()),
			ManageSeat: int32(inv.GetManageSeat()),
			AllowAll:   inv.GetAllowAll(),
			Domains:    inv.GetDomains(),
			Users:      users,
			Inviter:    inv.GetInviter(),
		})
	}
	return invites, nil
}
