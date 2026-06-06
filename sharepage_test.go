package main

import (
	"testing"
)

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
