import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { useWorkspace } from '../stores/workspace';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';
import { Loader } from '../components/Loader';

type SharePerson = {
  member: string;
  displayName: string;
  email: string;
  photoUrl: string;
  role: string;
  isGroup: boolean;
};

type ShareAccount = {
  accountId: string;
  displayName: string;
  role: string;
  isExternal: boolean;
};

type ShareData = {
  people: SharePerson[];
  accounts: ShareAccount[];
  externalAccounts: ShareAccount[];
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function Avatar({ name, photoUrl, isGroup }: { name: string; photoUrl: string; isGroup?: boolean }) {
  if (isGroup) {
    return (
      <div className="size-[28px] rounded-full bg-[rgba(10,132,255,0.15)] border border-[rgba(10,132,255,0.3)] flex items-center justify-center shrink-0">
        <Icon icon="solar:users-group-rounded-linear" className="text-[#0A84FF] text-[13px]" />
      </div>
    );
  }
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
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

function AccountAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div className="size-[28px] rounded-[6px] bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.12)] flex items-center justify-center shrink-0">
      <span className="text-[10px] font-bold text-[rgba(255,255,255,0.6)]">{initials || '?'}</span>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  switch (role) {
    case 'Admin':
      return (
        <span className="inline-flex items-center gap-[4px] px-[8px] py-[2px] rounded-[4px] bg-[rgba(10,132,255,0.12)] border border-[rgba(10,132,255,0.25)]">
          <Icon icon="solar:shield-keyhole-linear" className="text-[#0A84FF] text-[10px]" />
          <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[#0A84FF]">Admin</span>
        </span>
      );
    case 'Builder':
      return (
        <span className="inline-flex items-center gap-[4px] px-[8px] py-[2px] rounded-[4px] bg-[rgba(248,129,169,0.12)] border border-[rgba(248,129,169,0.25)]">
          <Icon icon="solar:hammer-linear" className="text-[#F881A9] text-[10px]" />
          <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[#F881A9]">Builder</span>
        </span>
      );
    case 'Viewer':
      return (
        <span className="inline-flex items-center gap-[4px] px-[8px] py-[2px] rounded-[4px] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)]">
          <Icon icon="solar:eye-linear" className="text-[rgba(255,255,255,0.4)] text-[10px]" />
          <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.4)]">Viewer</span>
        </span>
      );
    default:
      return (
        <span className="text-[10px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.4)]">{role}</span>
      );
  }
}

function SectionHeader({ title, tooltip }: { title: string; tooltip?: string }) {
  return (
    <div className="flex items-center gap-[6px] px-[20px] py-[10px] border-b border-[#2e2e2e]">
      <span className="text-[11px] font-bold text-white">{title}</span>
      {tooltip && (
        <div className="relative group">
          <Icon icon="solar:info-circle-linear" className="text-[rgba(255,255,255,0.3)] text-[12px] cursor-help" />
          <div className="absolute left-0 bottom-[calc(100%+4px)] hidden group-hover:block z-50 bg-[#2a2a2a] border border-[#464646] rounded-[6px] p-[8px] w-[200px] shadow-lg">
            <p className="text-[10px] text-[rgba(255,255,255,0.6)] leading-[1.4]">{tooltip}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function PersonRow({ person }: { person: SharePerson }) {
  const label = person.isGroup
    ? person.member
    : (person.displayName || person.email || person.member);

  return (
    <div className="flex items-center gap-[12px] px-[20px] py-[10px] border-b border-[#2a2a2a] hover:bg-[rgba(255,255,255,0.02)] transition-colors">
      <Avatar name={person.displayName} photoUrl={person.photoUrl} isGroup={person.isGroup} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-white leading-tight truncate">{label}</p>
        {!person.isGroup && person.email && (
          <p className="text-[10px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.4)] truncate">
            {person.email}
          </p>
        )}
      </div>
      <RoleBadge role={person.role} />
    </div>
  );
}

function AccountRow({ account }: { account: ShareAccount }) {
  const subtitle = account.isExternal
    ? `All users that are part of ${account.displayName}`
    : 'Everyone in the associated account';
  return (
    <div className="flex items-center gap-[12px] px-[20px] py-[10px] border-b border-[#2a2a2a] hover:bg-[rgba(255,255,255,0.02)] transition-colors">
      <AccountAvatar name={account.displayName} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-white leading-tight truncate">{account.displayName}</p>
        <p className="text-[10px] text-[rgba(255,255,255,0.4)] truncate">{subtitle}</p>
      </div>
      <RoleBadge role={account.role} />
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function SharePage() {
  const { state } = useWorkspace();
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    (ProductService.GetShareData as (org: string, product: string) => Promise<ShareData>)(
      state.organisation,
      state.product,
    )
      .then(result => setData(result ?? { people: [], accounts: [], externalAccounts: [] }))
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [state.organisation, state.product]);

  const peopleCount = (data?.people?.length ?? 0) + (data?.accounts?.length ?? 0) + (data?.externalAccounts?.length ?? 0);

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#1e1e1e]">
      {/* Header */}
      <div className="px-[20px] py-[6px] border-b border-[#464646] flex items-center justify-between shrink-0">
        <p className="font-['JetBrains_Mono',sans-serif] font-bold text-[10px] text-[rgba(255,255,255,0.5)] uppercase">
          Sharing
        </p>
        {data && (
          <p className="text-[10px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif]">
            {peopleCount} {peopleCount === 1 ? 'member' : 'members'}
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
          <div className="flex items-center justify-center h-full">
            <Loader />
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
              <button
                onClick={load}
                className="mt-[10px] text-[10px] text-[#F881A9] hover:underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {!loading && !error && data && (
          <div>
            {/* People with access */}
            {(data.people?.length ?? 0) > 0 && (
              <section>
                <SectionHeader title="People with access" />
                {data.people.map((p, i) => (
                  <PersonRow key={`${p.member}-${i}`} person={p} />
                ))}
              </section>
            )}

            {/* Accounts with access */}
            {(data.accounts?.length ?? 0) > 0 && (
              <section>
                <SectionHeader title="Accounts with access" />
                {data.accounts.map((a, i) => (
                  <AccountRow key={`${a.accountId}-${i}`} account={a} />
                ))}
              </section>
            )}

            {/* External Accounts */}
            {(data.externalAccounts?.length ?? 0) > 0 && (
              <section>
                <SectionHeader
                  title="External Accounts"
                  tooltip="Accounts from outside your organisation that have been granted access to this product."
                />
                {data.externalAccounts.map((a, i) => (
                  <AccountRow key={`${a.accountId}-${i}`} account={a} />
                ))}
              </section>
            )}

            {/* Empty state */}
            {peopleCount === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-[8px] pt-[80px]">
                <Icon icon="solar:users-group-rounded-linear" className="text-[rgba(255,255,255,0.2)] text-4xl" />
                <p className="text-[12px] text-[rgba(255,255,255,0.3)]">No members yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
