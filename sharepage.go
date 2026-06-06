package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"google.golang.org/protobuf/encoding/protowire"
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
	var reqBuf []byte
	reqBuf = protowire.AppendTag(reqBuf, 1, protowire.BytesType)
	reqBuf = protowire.AppendString(reqBuf, resource)

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
	bindings := parseIamPolicy(body[5:])

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
		var buf []byte
		for id := range userIDs {
			buf = protowire.AppendTag(buf, 1, protowire.BytesType)
			buf = protowire.AppendString(buf, "users/"+id)
		}
		resp, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx,
			"alis.os.iam.v2.UsersService/BatchRetrieveMaskedUsers", buf)
		if err == nil && grpcStatus == 0 && len(resp) >= 5 {
			for _, u := range parseBatchUsersResponse(resp[5:]) {
				userMap[strings.TrimPrefix(u.Name, "users/")] = u
			}
		} else if grpcStatus != 0 {
			// non-fatal: continue without user details
			_ = grpcMsg
		}
	}

	// ── RetrieveMaskedAccounts ────────────────────────────────────────────────
	accountMap := map[string]iamAccount{}
	if len(accountIDs) > 0 {
		var buf []byte
		for id := range accountIDs {
			buf = protowire.AppendTag(buf, 1, protowire.BytesType)
			buf = protowire.AppendString(buf, "accounts/"+id)
		}
		resp, grpcStatus, grpcMsg, err := s.doConsoleGRPCWeb(ctx,
			"alis.os.accounts.v1.AccountsService/RetrieveMaskedAccounts", buf)
		if err == nil && grpcStatus == 0 && len(resp) >= 5 {
			for _, a := range parseMaskedAccountsResponse(resp[5:]) {
				accountMap[strings.TrimPrefix(a.Name, "accounts/")] = a
			}
		} else if grpcStatus != 0 {
			_ = grpcMsg
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

// ─── IAM Policy parsing ───────────────────────────────────────────────────────

type iamBinding struct {
	Role    string
	Members []string
}

func parseIamPolicy(data []byte) []iamBinding {
	var bindings []iamBinding
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
			if num == 4 { // Policy.bindings is field 4 per google.iam.v1.Policy
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
	return bindings
}

func parseIamBinding(data []byte) iamBinding {
	var b iamBinding
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ == protowire.BytesType {
			s, m := protowire.ConsumeBytes(data)
			if m < 0 {
				break
			}
			switch num {
			case 1:
				b.Role = string(s)
			case 2:
				b.Members = append(b.Members, string(s))
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
	return b
}

// ─── BatchRetrieveMaskedUsers parsing ─────────────────────────────────────────

type iamUser struct {
	Name      string
	Email     string
	FirstName string
	LastName  string
	PhotoURL  string
}

func parseBatchUsersResponse(data []byte) []iamUser {
	var users []iamUser
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
				users = append(users, parseMaskedUser(b))
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
	return users
}

func parseMaskedUser(data []byte) iamUser {
	var u iamUser
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ == protowire.BytesType {
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return u
			}
			switch num {
			case 1:
				u.Name = string(b)
			case 4:
				u.Email = string(b)
			case 7:
				u.FirstName = string(b)
			case 8:
				u.LastName = string(b)
			case 9:
				u.PhotoURL = string(b)
			}
			data = data[m:]
		} else {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return u
			}
			data = data[m:]
		}
	}
	return u
}

// ─── RetrieveMaskedAccounts parsing ───────────────────────────────────────────

type iamAccount struct {
	Name        string
	DisplayName string
	PartnerRef  string // non-empty → external/partner account
}

func parseMaskedAccountsResponse(data []byte) []iamAccount {
	var accounts []iamAccount
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
				acc := parseSingleMaskedAccount(b)
				if acc.Name != "" {
					accounts = append(accounts, acc)
				}
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
	return accounts
}

// parseSingleMaskedAccount parses one MaskedAccount message.
// The proto has field 1 (name) at the outer level and field 2 (nested details)
// which contains the display name (inner field 2) and optional partner ref (inner field 4).
func parseSingleMaskedAccount(data []byte) iamAccount {
	var acc iamAccount
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ == protowire.BytesType {
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return acc
			}
			switch num {
			case 1:
				if strings.HasPrefix(string(b), "accounts/") {
					acc.Name = string(b)
				}
			case 2:
				inner := parseMaskedAccountInner(b)
				if acc.Name == "" && inner.Name != "" {
					acc.Name = inner.Name
				}
				if inner.DisplayName != "" {
					acc.DisplayName = inner.DisplayName
				}
				if inner.PartnerRef != "" {
					acc.PartnerRef = inner.PartnerRef
				}
			}
			data = data[m:]
		} else {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return acc
			}
			data = data[m:]
		}
	}
	return acc
}

// parseMaskedAccountInner scans all fields of the nested details message.
// Field 1 = name, field 2 = display_name (short), field 4 = partner ref.
// The description (field 3) can be very long; we skip it.
func parseMaskedAccountInner(data []byte) iamAccount {
	var acc iamAccount
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			break
		}
		data = data[n:]
		if typ == protowire.BytesType {
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return acc
			}
			s := string(b)
			switch num {
			case 1:
				if strings.HasPrefix(s, "accounts/") {
					acc.Name = s
				}
			case 2:
				// display_name — short string; description is at field 3
				if len(s) <= 100 {
					acc.DisplayName = s
				}
			case 4:
				if strings.HasPrefix(s, "partners/") {
					acc.PartnerRef = s
				}
			}
			data = data[m:]
		} else {
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return acc
			}
			data = data[m:]
		}
	}
	return acc
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

	protoBytes := marshalListInvitesRequest(account)

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
	return parseListInvitesResponse(body[5:])
}

func marshalListInvitesRequest(parent string) []byte {
	var buf []byte
	buf = protowire.AppendTag(buf, 1, protowire.BytesType)
	buf = protowire.AppendString(buf, parent)
	return buf
}

func parseListInvitesResponse(data []byte) ([]InviteInfo, error) {
	var invites []InviteInfo
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
				return invites, nil
			}
			if num == 1 {
				inv, _ := parseInvite(b)
				if inv != nil {
					invites = append(invites, *inv)
				}
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return invites, nil
			}
			data = data[m:]
		}
	}
	return invites, nil
}

func parseInvite(data []byte) (*InviteInfo, error) {
	inv := &InviteInfo{}
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
				return inv, nil
			}
			switch num {
			case 3:
				inv.BuildSeat = int32(v)
			case 4:
				inv.ManageSeat = int32(v)
			case 10:
				inv.AllowAll = v != 0
			}
			data = data[m:]
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return inv, nil
			}
			switch num {
			case 1:
				inv.Name = string(b)
			case 11:
				inv.Domains = append(inv.Domains, string(b))
			case 12:
				user, _ := parseInviteUser(b)
				if user != nil {
					inv.Users = append(inv.Users, *user)
				}
			case 97:
				inv.Inviter = string(b)
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return inv, nil
			}
			data = data[m:]
		}
	}
	return inv, nil
}

func parseInviteUser(data []byte) (*InviteUserInfo, error) {
	u := &InviteUserInfo{}
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
				return u, nil
			}
			if num == 7 {
				u.Role = int32(v)
			}
			data = data[m:]
		case protowire.BytesType:
			b, m := protowire.ConsumeBytes(data)
			if m < 0 {
				return u, nil
			}
			switch num {
			case 1:
				u.User = string(b)
			case 2:
				u.Email = string(b)
			case 3:
				u.DisplayName = string(b)
			case 4:
				u.ProfilePicture = string(b)
			case 5:
				u.Domain = string(b)
			case 6:
				u.Claimed = len(b) > 0
			}
			data = data[m:]
		default:
			m := protowire.ConsumeFieldValue(num, typ, data)
			if m < 0 {
				return u, nil
			}
			data = data[m:]
		}
	}
	return u, nil
}
