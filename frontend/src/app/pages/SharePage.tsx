import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { useWorkspace } from '../stores/workspace';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';

type InviteUser = {
  user: string;
  email: string;
  displayName: string;
  profilePicture: string;
  domain: string;
  claimed: boolean;
  role: number;
};

type Invite = {
  name: string;
  buildSeat: number;
  manageSeat: number;
  allowAll: boolean;
  domains: string[];
  users: InviteUser[];
  inviter: string;
};

function SeatBadge({ buildSeat, manageSeat }: { buildSeat: number; manageSeat: number }) {
  if (buildSeat === 1) {
    return (
      <span className="inline-flex items-center gap-[4px] px-[8px] py-[2px] rounded-[4px] bg-[rgba(248,129,169,0.12)] border border-[rgba(248,129,169,0.25)]">
        <Icon icon="solar:hammer-linear" className="text-[#F881A9] text-[10px]" />
        <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[#F881A9]">Builder</span>
      </span>
    );
  }
  if (buildSeat === 2) {
    return (
      <span className="inline-flex items-center gap-[4px] px-[8px] py-[2px] rounded-[4px] bg-[rgba(10,132,255,0.12)] border border-[rgba(10,132,255,0.25)]">
        <Icon icon="solar:ruler-linear" className="text-[#0A84FF] text-[10px]" />
        <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[#0A84FF]">Architect</span>
      </span>
    );
  }
  if (buildSeat === 3) {
    return (
      <span className="inline-flex items-center gap-[4px] px-[8px] py-[2px] rounded-[4px] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)]">
        <Icon icon="solar:eye-linear" className="text-[rgba(255,255,255,0.4)] text-[10px]" />
        <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.4)]">Viewer</span>
      </span>
    );
  }
  if (manageSeat === 1) {
    return (
      <span className="inline-flex items-center gap-[4px] px-[8px] py-[2px] rounded-[4px] bg-[rgba(52,199,89,0.12)] border border-[rgba(52,199,89,0.25)]">
        <Icon icon="solar:shield-keyhole-linear" className="text-[#34C759] text-[10px]" />
        <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[#34C759]">Manager</span>
      </span>
    );
  }
  return <span className="text-[10px] text-[rgba(255,255,255,0.25)]">—</span>;
}

function ClaimedBadge({ claimed }: { claimed: boolean }) {
  if (claimed) {
    return (
      <div className="inline-flex items-center gap-[4px]">
        <Icon icon="solar:check-circle-linear" className="text-[#34C759] text-[13px]" />
        <span className="text-[11px] text-[rgba(255,255,255,0.5)]">Claimed</span>
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-[4px]">
      <Icon icon="solar:clock-circle-linear" className="text-[#FF9F0A] text-[13px]" />
      <span className="text-[11px] text-[rgba(255,255,255,0.35)]">Pending</span>
    </div>
  );
}

function UserAvatar({ name, picture }: { name: string; picture: string }) {
  if (picture) {
    return (
      <img
        src={picture}
        alt={name}
        className="size-[28px] rounded-full object-cover shrink-0 border border-[rgba(255,255,255,0.1)]"
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div className="size-[28px] rounded-full bg-[rgba(248,129,169,0.2)] border border-[rgba(248,129,169,0.3)] flex items-center justify-center shrink-0">
      <span className="text-[10px] font-bold text-[#F881A9]">{initials || '?'}</span>
    </div>
  );
}

export function SharePage() {
  const { state } = useWorkspace();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    ProductService.ListInvites(state.organisation, state.product)
      .then((result: any) => setInvites(result ?? []))
      .catch((err: any) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [state.organisation, state.product]);

  // Flatten all users across all invites for display
  const rows = invites?.flatMap(inv =>
    inv.users.length > 0
      ? inv.users.map(u => ({ ...u, buildSeat: inv.buildSeat, manageSeat: inv.manageSeat, inviteName: inv.name }))
      : [{ user: '', email: '', displayName: inv.allowAll ? 'Anyone' : inv.domains.join(', '), profilePicture: '', domain: '', claimed: false, role: 0, buildSeat: inv.buildSeat, manageSeat: inv.manageSeat, inviteName: inv.name }]
  ) ?? [];

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#1e1e1e]">
      {/* Header */}
      <div className="px-[20px] py-[6px] border-b border-[#464646] flex items-center justify-between shrink-0">
        <p className="font-['JetBrains_Mono',sans-serif] font-bold text-[10px] text-[rgba(255,255,255,0.5)] uppercase">
          Sharing
        </p>
        {invites && (
          <p className="text-[10px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif]">
            {rows.length} {rows.length === 1 ? 'member' : 'members'}
          </p>
        )}
      </div>

      {/* Toolbar */}
      <div className="border-b border-[#464646] px-[20px] py-[8px] flex items-center gap-[8px] shrink-0">
        {!loading && !error && (
          <button
            onClick={load}
            className="flex items-center gap-[4px] px-[8px] h-[34px] text-[rgba(255,255,255,0.5)] hover:text-white transition-colors text-[10px]"
            title="Refresh"
          >
            <Icon icon="solar:refresh-linear" className="text-base" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-full gap-[8px]">
            <Icon icon="solar:spinner-linear" className="text-[#f881a9] text-xl animate-spin" />
            <span className="text-[12px] text-[rgba(255,255,255,0.5)]">Loading members...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="p-[16px] bg-[rgba(255,92,95,0.1)] border border-[rgba(255,92,95,0.3)] rounded-[6px] max-w-[400px]">
              <div className="flex items-center gap-[8px] mb-[8px]">
                <Icon icon="solar:close-circle-linear" className="text-[#FF5C5F] text-lg" />
                <p className="text-[12px] font-bold text-white">Failed to load</p>
              </div>
              <p className="text-[11px] text-[rgba(255,255,255,0.6)]">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && invites !== null && (
          <>
            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-[8px]">
                <Icon icon="solar:users-group-rounded-linear" className="text-[rgba(255,255,255,0.2)] text-4xl" />
                <p className="text-[12px] text-[rgba(255,255,255,0.3)]">No members yet</p>
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10 bg-[#1e1e1e]">
                  <tr className="border-b border-[#464646]">
                    <th className="text-left px-[20px] py-[8px]">
                      <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.4)] uppercase">Member</span>
                    </th>
                    <th className="text-left px-[16px] py-[8px] w-[140px]">
                      <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.4)] uppercase">Access</span>
                    </th>
                    <th className="text-left px-[16px] py-[8px] w-[120px]">
                      <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.4)] uppercase">Status</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={`${row.inviteName}-${i}`}
                      className="border-b border-[#2e2e2e] hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                    >
                      <td className="px-[20px] py-[12px]">
                        <div className="flex items-center gap-[10px]">
                          <UserAvatar name={row.displayName} picture={row.profilePicture} />
                          <div className="flex flex-col gap-[2px]">
                            <span className="text-[12px] font-bold text-white leading-tight">
                              {row.displayName || row.email || row.domain || '—'}
                            </span>
                            {row.email && (
                              <span className="text-[10px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.4)]">
                                {row.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-[16px] py-[12px]">
                        <SeatBadge buildSeat={row.buildSeat} manageSeat={row.manageSeat} />
                      </td>
                      <td className="px-[16px] py-[12px]">
                        <ClaimedBadge claimed={row.claimed} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
