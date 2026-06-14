import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { useWorkspace } from '../stores/workspace';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';
import type { SyncReposResult } from '../../../bindings/alis-hub-v3/models';
import { Loader } from '../components/Loader';

function isAuthError(e: unknown): boolean {
  const s = String(e);
  return s.includes('invalid_grant') || s.includes('refresh token has expired') || s.includes('console token expired');
}

type ProductSummary = {
  name: string;
  displayName: string;
  state: number;
};

function StateIndicator({ state }: { state: number }) {
  if (state === 1) {
    return (
      <span className="flex items-center gap-[4px]">
        <span className="size-[6px] rounded-full bg-[#34C759] shrink-0" />
        <span className="text-[10px] font-['JetBrains_Mono',sans-serif] text-[#34C759]">Active</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-[4px]">
      <span className="size-[6px] rounded-full bg-[rgba(255,255,255,0.3)] shrink-0" />
      <span className="text-[10px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.3)]">Inactive</span>
    </span>
  );
}

export function ProductPickerPage() {
  const { state, setProduct, setPhase } = useWorkspace();
  const org = state.selectedOrg!;
  const orgId = org.name.replace('organisations/', '');

  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingProduct, setPendingProduct] = useState<ProductSummary | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    (ProductService.ListProducts as (org: string) => Promise<ProductSummary[]>)(orgId)
      .then(result => setProducts(result ?? []))
      .catch((e: unknown) => {
        if (isAuthError(e)) { setPhase('login'); return; }
        setError(String(e));
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [orgId]);

  const filtered = products.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.displayName.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
  });

  const handleSelect = async (p: ProductSummary) => {
    const productId = p.name.split('/products/')[1] ?? p.name;
    setSyncState('syncing');
    setSyncError(null);
    setPendingProduct(p);
    try {
      const result = await (ProductService.SyncRepos as (org: string, product: string) => Promise<SyncReposResult | null>)(orgId, productId);
      if (result?.error) {
        setSyncState('error');
        setSyncError(result.error);
        return;
      }
    } catch (e) {
      setSyncState('error');
      setSyncError(String(e));
      return;
    }
    setSyncState('idle');
    setProduct(orgId, org.displayName, productId, p.displayName);
  };

  const proceedAnyway = () => {
    if (!pendingProduct) return;
    const productId = pendingProduct.name.split('/products/')[1] ?? pendingProduct.name;
    setSyncState('idle');
    setSyncError(null);
    setProduct(orgId, org.displayName, productId, pendingProduct.displayName);
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#1e1e1e]">
      {/* Back + header */}
      <div className="px-[24px] pt-[24px] pb-[16px] shrink-0">
        <button
          onClick={() => setPhase('picking-org')}
          className="flex items-center gap-[6px] text-[rgba(255,255,255,0.4)] hover:text-white transition-colors mb-[16px] text-[11px]"
        >
          <Icon icon="solar:alt-arrow-left-linear" className="text-sm" />
          All landing zones
        </button>

        <div className="flex items-center gap-[12px]">
          {org.logo ? (
            <img
              src={org.logo}
              alt={org.displayName}
              className="size-[40px] rounded-[10px] object-cover shrink-0 border border-[rgba(255,255,255,0.08)]"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="size-[40px] rounded-[10px] bg-[rgba(248,129,169,0.12)] border border-[rgba(248,129,169,0.2)] flex items-center justify-center shrink-0">
              <span className="text-[16px] font-bold text-[#F881A9]">
                {org.displayName[0]?.toUpperCase() ?? '?'}
              </span>
            </div>
          )}
          <div>
            <h1 className="text-[20px] font-bold text-white">{org.displayName}</h1>
            <p className="text-[11px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.3)]">{orgId}</p>
          </div>
        </div>

        <p className="text-[12px] text-[rgba(255,255,255,0.4)] mt-[12px]">
          Select a product to open its workspace
        </p>
      </div>

      {/* Search */}
      <div className="px-[24px] pb-[14px] shrink-0 flex items-center gap-[10px]">
        <div className="flex-1 flex items-center gap-[8px] bg-[#2c2c2c] border border-[#3a3a3a] rounded-[8px] px-[12px] h-[34px]">
          <Icon icon="solar:magnifer-linear" className="text-[rgba(255,255,255,0.3)] text-sm shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products…"
            className="flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-[rgba(255,255,255,0.25)]"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-[rgba(255,255,255,0.3)] hover:text-white">
              <Icon icon="solar:close-circle-linear" className="text-sm" />
            </button>
          )}
        </div>
        {!loading && (
          <button onClick={load} className="text-[rgba(255,255,255,0.4)] hover:text-white transition-colors" title="Refresh">
            <Icon icon="solar:refresh-linear" className="text-base" />
          </button>
        )}
      </div>

      {/* Product list */}
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
              <button onClick={load} className="mt-[10px] text-[10px] text-[#F881A9] hover:underline">Try again</button>
            </div>
          </div>
        )}

        {!loading && !error && (
          <div className="flex flex-col gap-[4px]">
            {syncState === 'error' && syncError && (
              <div className="mb-[8px] p-[12px] bg-[rgba(255,92,95,0.1)] border border-[rgba(255,92,95,0.3)] rounded-[8px]">
                <p className="text-[11px] text-[rgba(255,255,255,0.7)] mb-[8px]">Failed to sync repositories: {syncError}</p>
                <div className="flex gap-[8px]">
                  <button onClick={proceedAnyway} className="text-[10px] text-[#F881A9] hover:underline">Proceed anyway</button>
                  <button onClick={() => { setSyncState('idle'); setSyncError(null); }} className="text-[10px] text-[rgba(255,255,255,0.4)] hover:underline">Cancel</button>
                </div>
              </div>
            )}
            {filtered.map(p => {
              const productId = p.name.split('/products/')[1] ?? p.name;
              const isSyncing = syncState === 'syncing' && pendingProduct?.name === p.name;
              return (
                <button
                  key={p.name}
                  onClick={() => handleSelect(p)}
                  disabled={syncState === 'syncing'}
                  className="flex items-center gap-[14px] px-[14px] py-[12px] rounded-[8px] bg-[#2c2c2c] border border-[#3a3a3a] hover:border-[#F881A9] hover:bg-[#333] transition-all text-left group disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-[#3a3a3a] disabled:hover:bg-[#2c2c2c]"
                >
                  <div className="size-[32px] rounded-[7px] bg-[rgba(248,129,169,0.08)] border border-[rgba(248,129,169,0.15)] flex items-center justify-center shrink-0">
                    <Icon icon="solar:box-linear" className="text-[#F881A9] text-base" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-white group-hover:text-[#F881A9] transition-colors truncate">
                      {p.displayName}
                    </p>
                    <p className="text-[10px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.3)] mt-[1px]">
                      {isSyncing ? 'Syncing repositories…' : productId}
                    </p>
                  </div>
                  <StateIndicator state={p.state} />
                  {isSyncing
                    ? <Loader size={16} />
                    : <Icon icon="solar:alt-arrow-right-linear" className="text-[rgba(255,255,255,0.2)] group-hover:text-[#F881A9] text-base shrink-0 transition-colors" />
                  }
                </button>
              );
            })}

            {filtered.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center pt-[60px] gap-[8px]">
                <Icon icon="solar:box-linear" className="text-[rgba(255,255,255,0.15)] text-4xl" />
                <p className="text-[12px] text-[rgba(255,255,255,0.3)]">
                  {search ? 'No matching products' : 'No products found'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
