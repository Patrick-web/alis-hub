import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { useWorkspace, type Organisation } from '../stores/workspace';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';
import { Loader } from '../components/Loader';

function isAuthError(e: unknown): boolean {
  const s = String(e);
  return s.includes('invalid_grant') || s.includes('refresh token has expired') || s.includes('console token expired');
}

type LandingZonesData = {
  own: Organisation[];
  shared: Organisation[];
};

function OrgCard({ org, onClick }: { org: Organisation; onClick: () => void }) {
  const orgId = org.name.replace('organisations/', '');
  return (
    <button
      onClick={onClick}
      className="text-left bg-[#2c2c2c] border border-[#3a3a3a] rounded-[10px] p-[16px] hover:border-[#F881A9] hover:bg-[#333] transition-all cursor-pointer group"
    >
      <div className="flex items-start gap-[12px]">
        {org.logo ? (
          <img
            src={org.logo}
            alt={org.displayName}
            className="size-[36px] rounded-[8px] object-cover shrink-0 border border-[rgba(255,255,255,0.08)]"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="size-[36px] rounded-[8px] bg-[rgba(248,129,169,0.12)] border border-[rgba(248,129,169,0.2)] flex items-center justify-center shrink-0">
            <span className="text-[14px] font-bold text-[#F881A9]">
              {org.displayName[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white group-hover:text-[#F881A9] transition-colors truncate">
            {org.displayName}
          </p>
          {org.description && (
            <p className="text-[11px] text-[rgba(255,255,255,0.4)] mt-[2px] truncate">{org.description}</p>
          )}
          <p className="text-[10px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.25)] mt-[6px]">
            {orgId}
          </p>
        </div>
        <Icon icon="solar:alt-arrow-right-linear" className="text-[rgba(255,255,255,0.2)] group-hover:text-[#F881A9] text-base shrink-0 mt-[2px] transition-colors" />
      </div>
    </button>
  );
}

export function LandingZonesPage() {
  const { setOrg, setPhase } = useWorkspace();
  const [data, setData] = useState<LandingZonesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    setError(null);
    (ProductService.ListLandingZones as () => Promise<LandingZonesData>)()
      .then(result => setData(result ?? { own: [], shared: [] }))
      .catch((e: unknown) => {
        if (isAuthError(e)) { setPhase('login'); return; }
        setError(String(e));
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filterOrg = (org: Organisation) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      org.displayName.toLowerCase().includes(q) ||
      org.name.toLowerCase().includes(q) ||
      org.description.toLowerCase().includes(q)
    );
  };

  const filteredOwn = data?.own.filter(filterOrg) ?? [];
  const filteredShared = data?.shared.filter(filterOrg) ?? [];
  const total = (data?.own.length ?? 0) + (data?.shared.length ?? 0);

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#1e1e1e]">
      {/* Page header */}
      <div className="px-[24px] pt-[28px] pb-[20px] shrink-0">
        <button
          onClick={() => setPhase('hub')}
          className="flex items-center gap-[6px] text-[11px] text-[rgba(255,255,255,0.4)] hover:text-white transition-colors mb-[16px] font-['JetBrains_Mono',sans-serif]"
        >
          <Icon icon="solar:alt-arrow-left-linear" className="text-sm" />
          Back
        </button>
        <h1 className="text-[20px] font-bold text-white">Landing Zones</h1>
        <p className="text-[12px] text-[rgba(255,255,255,0.4)] mt-[4px]">
          Select a landing zone to browse its products
        </p>
      </div>

      {/* Search + count */}
      <div className="px-[24px] pb-[16px] shrink-0 flex items-center gap-[10px]">
        <div className="flex-1 flex items-center gap-[8px] bg-[#2c2c2c] border border-[#3a3a3a] rounded-[8px] px-[12px] h-[34px]">
          <Icon icon="solar:magnifer-linear" className="text-[rgba(255,255,255,0.3)] text-sm shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search landing zones…"
            className="flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-[rgba(255,255,255,0.25)]"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-[rgba(255,255,255,0.3)] hover:text-white">
              <Icon icon="solar:close-circle-linear" className="text-sm" />
            </button>
          )}
        </div>
        {!loading && data && (
          <span className="text-[10px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.3)] shrink-0">
            {total} zone{total !== 1 ? 's' : ''}
          </span>
        )}
        {!loading && (
          <button
            onClick={load}
            className="text-[rgba(255,255,255,0.4)] hover:text-white transition-colors"
            title="Refresh"
          >
            <Icon icon="solar:refresh-linear" className="text-base" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-[24px] pb-[24px]">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="p-[16px] bg-[rgba(255,92,95,0.1)] border border-[rgba(255,92,95,0.3)] rounded-[8px] max-w-[400px]">
              <div className="flex items-center gap-[8px] mb-[8px]">
                <Icon icon="solar:close-circle-linear" className="text-[#FF5C5F] text-lg" />
                <p className="text-[12px] font-bold text-white">Failed to load</p>
              </div>
              <p className="text-[11px] text-[rgba(255,255,255,0.6)]">{error}</p>
              <button onClick={load} className="mt-[10px] text-[10px] text-[#F881A9] hover:underline">
                Try again
              </button>
            </div>
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-[28px]">
            {/* Own orgs */}
            {filteredOwn.length > 0 && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[10px]">
                {filteredOwn.map(org => (
                  <OrgCard key={org.name} org={org} onClick={() => setOrg(org)} />
                ))}
              </div>
            )}

            {/* Shared divider */}
            {filteredShared.length > 0 && (
              <div>
                <div className="flex items-center gap-[12px] mb-[14px]">
                  <div className="h-px flex-1 bg-[#2e2e2e]" />
                  <div className="flex items-center gap-[6px]">
                    <Icon icon="solar:users-group-two-rounded-linear" className="text-[rgba(255,255,255,0.25)] text-sm" />
                    <span className="text-[10px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.3)] uppercase tracking-wide">
                      Shared from other Accounts
                    </span>
                  </div>
                  <div className="h-px flex-1 bg-[#2e2e2e]" />
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[10px]">
                  {filteredShared.map(org => (
                    <OrgCard key={org.name} org={org} onClick={() => setOrg(org)} />
                  ))}
                </div>
              </div>
            )}

            {filteredOwn.length === 0 && filteredShared.length === 0 && (
              <div className="flex flex-col items-center justify-center pt-[80px] gap-[8px]">
                <Icon icon="solar:cloud-linear" className="text-[rgba(255,255,255,0.15)] text-5xl" />
                <p className="text-[13px] text-[rgba(255,255,255,0.3)]">
                  {search ? 'No matching landing zones' : 'No landing zones found'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
