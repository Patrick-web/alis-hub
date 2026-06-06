import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { Browser } from '@wailsio/runtime';
import { Card, CardListItem } from '../components/Card';
import { ListItem } from '../components/ListItem';
import { Button } from '../components/Button';
import { useWorkspace } from '../stores/workspace';
import * as PS from '../../../bindings/alis-hub-v3/productservice';

export function AboutPage() {
  const { state } = useWorkspace();
  const [overview, setOverview] = useState<any>(null);
  const [environments, setEnvironments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, envs] = await Promise.all([
        PS.GetProductOverview(state.organisation, state.product),
        PS.ListEnvironments(state.organisation, state.product),
      ]);
      setOverview(ov);
      setEnvironments(envs || []);
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

  const openURL = (url: string) => {
    if (url) Browser.OpenURL(url);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (loggedIn === false && !loggingIn) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-[16px] max-w-[320px] text-center">
          <Icon icon="solar:lock-keyhole-linear" className="text-[48px] text-[rgba(255,255,255,0.2)]" />
          <p className="text-[13px] text-white font-bold">Sign in to Alis</p>
          <p className="text-[11px] text-[rgba(255,255,255,0.5)] leading-[1.6]">
            Your browser will open to complete authentication with identity.alisx.com.
          </p>
          {error && (
            <p className="text-[11px] text-[#ff5c5f]">{error}</p>
          )}
          <Button variant="primary" onClick={handleLogin} className="w-full">
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-[20px]">
      {error && (
        <div className="mb-[16px] px-[12px] py-[8px] bg-[rgba(255,92,95,0.08)] border border-[rgba(255,92,95,0.3)] rounded text-[#ff5c5f] text-[11px] font-['JetBrains_Mono',sans-serif]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-[20px] max-w-[1200px]">
        {/* Left column */}
        <div className="flex flex-col gap-[20px]">
          <Card title="Git Repository" className="w-[475px]">
            {loading ? (
              <LoadingRow />
            ) : (
              <>
                {overview?.gitRepo?.remoteUri && (
                  <div className="flex items-center justify-between px-[10px] py-[8px] border-b border-[#2c2c2c]">
                    <span className="text-[10px] text-[rgba(255,255,255,0.5)] uppercase font-bold w-[100px] shrink-0">Remote</span>
                    <div className="flex items-center gap-[6px] min-w-0">
                      <span className="text-[11px] text-white font-['JetBrains_Mono',sans-serif] truncate">{overview.gitRepo.remoteUri}</span>
                      <button
                        onClick={() => copyToClipboard(overview.gitRepo.remoteUri)}
                        className="shrink-0 text-[rgba(255,255,255,0.4)] hover:text-white transition-colors"
                      >
                        <Icon icon="solar:copy-linear" className="text-sm" />
                      </button>
                    </div>
                  </div>
                )}
                {overview?.gitRepo?.cloudRunUri ? (
                  <ListItem
                    label="Cloud Run Instance"
                    icon={<Icon icon="solar:server-linear" className="text-[#f881a9] text-xl" />}
                    onClick={() => openURL(overview.gitRepo.cloudRunUri)}
                  />
                ) : null}
                {overview?.gitRepo?.vmUri ? (
                  <ListItem
                    label="Compute Engine VM"
                    icon={<Icon icon="solar:server-2-linear" className="text-[#f881a9] text-xl" />}
                    onClick={() => openURL(overview.gitRepo.vmUri)}
                  />
                ) : null}
                {overview?.gitRepo?.bucketUri ? (
                  <ListItem
                    label="Cloud Storage Bucket"
                    icon={<Icon icon="solar:database-linear" className="text-[#f881a9] text-xl" />}
                    onClick={() => openURL(overview.gitRepo.bucketUri)}
                  />
                ) : null}
                {!overview?.gitRepo && (
                  <div className="px-[10px] py-[8px] text-[11px] text-[rgba(255,255,255,0.3)]">No repository data</div>
                )}
              </>
            )}
          </Card>

          <Card title="Google Artifact Registry" className="w-[475px]">
            {loading ? (
              <LoadingRow />
            ) : (
              <>
                {overview?.packageRegistries?.go ? (
                  <ListItem
                    label="Go Package Registry"
                    icon={<Icon icon="solar:box-linear" className="text-[#f881a9] text-xl" />}
                    onClick={() => openURL(overview.packageRegistries.go)}
                  />
                ) : null}
                {overview?.packageRegistries?.python ? (
                  <ListItem
                    label="Python Package Registry"
                    icon={<Icon icon="solar:box-linear" className="text-[#f881a9] text-xl" />}
                    onClick={() => openURL(overview.packageRegistries.python)}
                  />
                ) : null}
                {overview?.packageRegistries?.javascript ? (
                  <ListItem
                    label="TypeScript Package Registry"
                    icon={<Icon icon="solar:box-linear" className="text-[#f881a9] text-xl" />}
                    onClick={() => openURL(overview.packageRegistries.javascript)}
                  />
                ) : null}
                {!overview?.packageRegistries && (
                  <div className="px-[10px] py-[8px] text-[11px] text-[rgba(255,255,255,0.3)]">No registry data</div>
                )}
              </>
            )}
          </Card>

          <Card title="Quick Actions" className="w-[475px]">
            <ListItem label="Open DBD Pipeline" icon={<Icon icon="solar:code-2-linear" className="text-[#f881a9] text-xl" />} onClick={() => { window.location.href = '/deployments'; }} />
            <ListItem label="Manage Services" icon={<Icon icon="solar:layers-linear" className="text-[#f881a9] text-xl" />} onClick={() => { window.location.href = '/develop'; }} />
            <ListItem label="Browse Codeblocks" icon={<Icon icon="solar:box-linear" className="text-[#f881a9] text-xl" />} onClick={() => { window.location.href = '/codeblocks'; }} />
            <ListItem label="Agent Launchpad" icon={<Icon icon="solar:users-group-two-rounded-linear" className="text-[#f881a9] text-xl" />} onClick={() => { window.location.href = '/agents'; }} />
          </Card>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-[20px]">
          <Card title="Project Details" className="w-[475px]">
            {loading ? (
              <LoadingRow />
            ) : (
              <>
                <CardListItem label="Folder ID" value={overview?.googleProject?.folderId || '—'} />
                <CardListItem label="Project ID" value={overview?.googleProject?.id || '—'} />
                <CardListItem label="Project Number" value={overview?.googleProject?.number || '—'} />
                <CardListItem
                  label="Billing Account"
                  value={overview?.googleProject?.managedBillingAccount ? 'Alis Managed' : (overview?.googleProject?.billingAccountId || '—')}
                />
                <CardListItem label="Default Region" value={overview?.googleProject?.region || '—'} noBorder />
                {overview?.googleProject?.cloudUri && (
                  <div className="p-[10px]">
                    <Button
                      variant="secondary"
                      icon={<Icon icon="solar:link-square-linear" className="text-base" />}
                      className="w-full"
                      onClick={() => openURL(overview.googleProject.cloudUri)}
                    >
                      Open Google Cloud Console
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>

          <Card title="Environments" className="w-[475px]">
            {loading ? (
              <LoadingRow />
            ) : environments.length === 0 ? (
              <div className="px-[10px] py-[8px] text-[11px] text-[rgba(255,255,255,0.3)]">No environments found</div>
            ) : (
              environments.map((env: any, i: number) => (
                <div key={env.name || i} className={`flex items-center justify-between px-[10px] py-[8px] ${i < environments.length - 1 ? 'border-b border-[#2c2c2c]' : ''}`}>
                  <span className="text-[11px] text-white">{env.displayName || env.name}</span>
                  <div className="flex items-center gap-[4px]">
                    <div className={`size-[6px] rounded-full ${env.state === 1 ? 'bg-[#34C759]' : 'bg-[#FAC800]'}`} />
                    <span className={`text-[9px] font-bold uppercase font-['JetBrains_Mono',sans-serif] ${env.state === 1 ? 'text-[#34C759]' : 'text-[#FAC800]'}`}>
                      {env.state === 1 ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="px-[10px] py-[8px] text-[11px] text-[rgba(255,255,255,0.3)] animate-pulse">
      Loading...
    </div>
  );
}
