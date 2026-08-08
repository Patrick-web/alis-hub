//go:build alis_integration

// Live probes against the real IAM/invites APIs. See the note in
// productservice_test.go for why these sit behind the alis_integration tag.

package main

import (
	"testing"
)

// TestGetShareDataLive calls the real GetIamPolicy + BatchRetrieveMaskedUsers + RetrieveMaskedAccounts APIs.
func TestGetShareDataLive(t *testing.T) {
	svc := NewProductService()
	ts, err := NewConsoleTokenSource()
	if err != nil {
		t.Skipf("no console credentials: %v (run ProductService.Login() first)", err)
	}
	svc.tokens = ts

	data, err := svc.GetShareData("voyage", "vp")
	if err != nil {
		t.Fatalf("GetShareData: %v", err)
	}

	t.Logf("People (%d):", len(data.People))
	for _, p := range data.People {
		t.Logf("  [%s] %-30s  email=%-40s  group=%v  member=%s", p.Role, p.DisplayName, p.Email, p.IsGroup, p.Member)
	}
	t.Logf("Accounts (%d):", len(data.Accounts))
	for _, a := range data.Accounts {
		t.Logf("  [%s] %s (id=%s)", a.Role, a.DisplayName, a.AccountID)
	}
	t.Logf("External Accounts (%d):", len(data.ExternalAccounts))
	for _, a := range data.ExternalAccounts {
		t.Logf("  [%s] %s (id=%s)", a.Role, a.DisplayName, a.AccountID)
	}
}

// TestListInvitesLive calls the real InvitesService/ListInvites API.
// Requires console credentials: run ProductService.Login() first.
func TestListInvitesLive(t *testing.T) {
	svc := NewProductService()
	ts, err := NewConsoleTokenSource()
	if err != nil {
		t.Skipf("no console credentials: %v (run ProductService.Login() first)", err)
	}
	svc.tokens = ts

	invites, err := svc.ListInvites("voyage", "vp")
	if err != nil {
		t.Fatalf("ListInvites: %v", err)
	}

	t.Logf("Found %d invites", len(invites))
	for _, inv := range invites {
		t.Logf("  Invite: %s  buildSeat=%d  manageSeat=%d  allowAll=%v  domains=%v  inviter=%s",
			inv.Name, inv.BuildSeat, inv.ManageSeat, inv.AllowAll, inv.Domains, inv.Inviter)
		for _, u := range inv.Users {
			t.Logf("    User: %-30s  email=%-40s  claimed=%v  role=%d",
				u.DisplayName, u.Email, u.Claimed, u.Role)
		}
	}
}
