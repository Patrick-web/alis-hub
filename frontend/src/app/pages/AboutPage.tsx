import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { Browser } from '@wailsio/runtime';
import { Loader } from '../components/Loader';
import { Button } from '../components/Button';
import { useWorkspace } from '../stores/workspace';
import * as PS from '../../../bindings/alis-hub-v3/productservice';

function TileLink({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-[10px] w-[150px] h-[90px] bg-[#2c2c2c] border border-[#3a3a3a] hover:border-[rgba(248,129,169,0.35)] hover:bg-[rgba(248,129,169,0.04)] transition-all"
    >
      <Icon icon={icon} className="text-[#f881a9] text-[22px]" />
      <span className="text-[10px] text-[rgba(255,255,255,0.65)] font-['Fira_Code',sans-serif] text-center leading-tight px-[10px]">{label}</span>
    </button>
  );
}

function TileMeta({ icon, label, value, onClick }: { icon: string; label: string; value: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-[5px] w-[150px] h-[90px] bg-[#2c2c2c] border border-[#3a3a3a] hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.03)] transition-all group"
    >
      <Icon icon={icon} className="text-[rgba(255,255,255,0.25)] group-hover:text-[rgba(255,255,255,0.45)] text-[16px] transition-colors" />
      <span className="text-[8px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif] uppercase tracking-widest">{label}</span>
      <span className="text-[10px] text-[rgba(255,255,255,0.8)] font-['JetBrains_Mono',sans-serif] truncate max-w-[134px]">{value || '—'}</span>
    </button>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <span className="text-[9px] text-[rgba(255,255,255,0.25)] font-['JetBrains_Mono',sans-serif] uppercase tracking-[0.12em]">
      {children}
    </span>
  );
}

export function AboutPage() {
  const { state } = useWorkspace();
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ov = await PS.GetProductOverview(state.organisation, state.product);
      setOverview(ov);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [state.organisation, state.product]);

  useEffect(() => {
    PS.IsLoggedIn().then((ok) => {
      setLoggedIn(ok);
      if (ok) loadData();
      else setLoading(false);
    }).catch(() => { setLoggedIn(false); setLoading(false); });
  }, [loadData]);

  const handleLogin = async () => {
    setLoggingIn(true);
    setError(null);
    try {
      await PS.Login();
      setLoggedIn(true);
      loadData();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoggingIn(false);
    }
  };

  const openURL = (url: string) => { if (url) Browser.OpenURL(url); };
  const copy = (text: string) => { navigator.clipboard.writeText(text); };

  const productName = state.product?.split('/').pop() ?? state.product;
  const orgName = state.organisation?.split('/').pop() ?? state.organisation;
  const gp = overview?.googleProject;
  const git = overview?.gitRepo;
  const reg = overview?.packageRegistries;
  const hasInfra = git || reg?.go || reg?.python || reg?.javascript;

  if (loggedIn === false && !loggingIn) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-[16px] max-w-[320px] text-center">
          <Icon icon="solar:lock-keyhole-linear" className="text-[48px] text-[rgba(255,255,255,0.2)]" />
          <p className="text-[13px] text-white font-bold">Sign in to Alis</p>
          <p className="text-[11px] text-[rgba(255,255,255,0.5)] leading-[1.6]">
            Your browser will open to complete authentication with identity.alisx.com.
          </p>
          {error && <p className="text-[11px] text-[#ff5c5f]">{error}</p>}
          <Button variant="primary" onClick={handleLogin} className="w-full">Sign In</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto flex flex-col">
      {/* Product Identity Header */}
      <div className="bg-[#2c2c2c] border-b border-[#464646] px-[20px] py-[16px] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-[12px]">
          <div className="size-[38px] bg-[rgba(248,129,169,0.08)] border border-[rgba(248,129,169,0.18)] flex items-center justify-center shrink-0">
            <Icon icon="solar:box-minimalistic-linear" className="text-[#f881a9] text-lg" />
          </div>
          <div>
            <p className="font-['Fira_Code',sans-serif] font-medium text-[17px] text-white leading-tight">{productName}</p>
            <p className="text-[10px] text-[rgba(255,255,255,0.35)] font-['JetBrains_Mono',sans-serif] mt-[2px]">{orgName}</p>
          </div>
        </div>
        <div className="flex items-center gap-[14px]">
          {!loading && gp?.region && (
            <div className="px-[8px] py-[3px] bg-[rgba(255,255,255,0.05)] border border-[#3a3a3a]">
              <span className="text-[10px] text-[rgba(255,255,255,0.45)] font-['JetBrains_Mono',sans-serif]">{gp.region}</span>
            </div>
          )}
          {!loading && gp?.id && (
            <div className="flex items-center gap-[6px]">
              <span className="text-[11px] text-[rgba(255,255,255,0.55)] font-['JetBrains_Mono',sans-serif]">{gp.id}</span>
              <button onClick={() => copy(gp.id)} className="text-[rgba(255,255,255,0.3)] hover:text-white transition-colors">
                <Icon icon="solar:copy-linear" className="text-sm" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-[40px]">
        <div className="flex flex-col gap-[36px] w-full max-w-[720px]">
        {error && (
          <div className="px-[12px] py-[8px] bg-[rgba(255,92,95,0.08)] border border-[rgba(255,92,95,0.3)] text-[#ff5c5f] text-[11px] font-['JetBrains_Mono',sans-serif]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-[40px]">
            <Loader size={28} />
          </div>
        ) : (
          <>
            {/* Infrastructure */}
            {hasInfra && (
              <div className="flex flex-col gap-[14px]">
                <SectionLabel>Infrastructure</SectionLabel>
                <div className="flex flex-wrap gap-[10px] justify-center">
                  {git?.remoteUri && (
                    <TileMeta
                      icon="solar:code-square-linear"
                      label="Remote URI"
                      value={git.remoteUri}
                      onClick={() => copy(git.remoteUri)}
                    />
                  )}
                  {git?.remoteUri && (
                    <TileLink
                      icon="solar:code-square-linear"
                      label="Browse Repository"
                      onClick={() => PS.OpenForgejoWindow(git.remoteUri.replace(/\.git$/, ''))}
                    />
                  )}
                  {git?.cloudRunUri && (
                    <TileLink icon="solar:server-linear" label="Cloud Run Instance" onClick={() => openURL(git.cloudRunUri)} />
                  )}
                  {git?.vmUri && (
                    <TileLink icon="solar:server-2-linear" label="Compute Engine VM" onClick={() => openURL(git.vmUri)} />
                  )}
                  {git?.bucketUri && (
                    <TileLink icon="solar:database-linear" label="Cloud Storage Bucket" onClick={() => openURL(git.bucketUri)} />
                  )}
                  {reg?.go && (
                    <TileLink icon="solar:box-linear" label="Go Package Registry" onClick={() => openURL(reg.go)} />
                  )}
                  {reg?.python && (
                    <TileLink icon="solar:box-linear" label="Python Package Registry" onClick={() => openURL(reg.python)} />
                  )}
                  {reg?.javascript && (
                    <TileLink icon="solar:box-linear" label="TypeScript Package Registry" onClick={() => openURL(reg.javascript)} />
                  )}
                </div>
              </div>
            )}

            {/* Project Details */}
            <div className="flex flex-col gap-[14px]">
              <SectionLabel>Project</SectionLabel>
              <div className="flex flex-wrap gap-[10px] justify-center">
                {gp?.folderId && (
                  <TileMeta icon="solar:folder-linear" label="Folder ID" value={gp.folderId} onClick={() => copy(gp.folderId)} />
                )}
                {gp?.id && (
                  <TileMeta icon="solar:tag-linear" label="Project ID" value={gp.id} onClick={() => copy(gp.id)} />
                )}
                {gp?.number && (
                  <TileMeta icon="solar:hashtag-linear" label="Project Number" value={String(gp.number)} onClick={() => copy(String(gp.number))} />
                )}
                {(gp?.billingAccountId || gp?.managedBillingAccount) && (
                  <TileMeta
                    icon="solar:card-linear"
                    label="Billing Account"
                    value={gp.managedBillingAccount ? 'Alis Managed' : gp.billingAccountId}
                    onClick={() => copy(gp.managedBillingAccount ? 'Alis Managed' : gp.billingAccountId)}
                  />
                )}
                {gp?.region && (
                  <TileMeta icon="solar:map-point-linear" label="Default Region" value={gp.region} onClick={() => copy(gp.region)} />
                )}
                {gp?.cloudUri && (
                  <TileLink icon="solar:link-square-linear" label="Google Cloud Console" onClick={() => openURL(gp.cloudUri)} />
                )}
              </div>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
