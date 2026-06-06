package main

import (
	"context"
	"fmt"
	"time"

	"google.golang.org/protobuf/encoding/protowire"
)

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

// ListInvites returns the invites for a product's build landing zone.
// The parent resource is organisations/{org}/products/{product}.
func (s *ProductService) ListInvites(org, product string) ([]InviteInfo, error) {
	if err := s.initTokens(); err != nil {
		return nil, err
	}

	parent := fmt.Sprintf("organisations/%s/products/%s", org, product)
	protoBytes := marshalListInvitesRequest(parent)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

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
				// claimedTime Timestamp — presence means the invite was claimed
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
