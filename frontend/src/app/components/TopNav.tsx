import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Icon } from '@iconify/react';
import { Tab } from './Tab';
import { useWorkspace } from '../stores/workspace';
import { Call, Window } from '@wailsio/runtime';
import { ProfileModal } from './ProfileModal';
import { Dialog, DialogContent } from './ui/dialog';
import { NotificationCenter } from './NotificationCenter';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';

function WindowControls() {
  return (
    <div className="flex items-center gap-[6px]" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        onClick={() => Window.Close()}
        className="w-[12px] h-[12px] rounded-full bg-[#FF5C5F] hover:bg-[#ff3b3e] transition-colors shrink-0 focus:outline-none"
        title="Close"
      />
      <button
        onClick={() => Window.Minimise()}
        className="w-[12px] h-[12px] rounded-full bg-[#FAC800] hover:bg-[#e0b300] transition-colors shrink-0 focus:outline-none"
        title="Minimise"
      />
      <button
        onClick={() => Window.ToggleMaximise()}
        className="w-[12px] h-[12px] rounded-full bg-[#34C759] hover:bg-[#2eaf4f] transition-colors shrink-0 focus:outline-none"
        title="Maximise"
      />
    </div>
  );
}

const tabs = [
  { id: 'about', label: 'About', icon: <Icon icon="solar:info-circle-linear" className="text-lg" /> },
  { id: 'develop', label: 'Develop', icon: <Icon icon="solar:code-2-linear" className="text-lg" /> },
  { id: 'builds', label: 'Builds', icon: <Icon icon="solar:box-linear" className="text-lg" /> },
  { id: 'deployments', label: 'Deployments', icon: <Icon icon="solar:cloud-upload-linear" className="text-lg" /> },
  { id: 'environments', label: 'Environments', icon: <Icon icon="solar:server-linear" className="text-lg" /> },
  { id: 'tools', label: 'Tools', icon: <Icon icon="solar:settings-linear" className="text-lg" /> },
  { id: 'agents', label: 'Agents', icon: <Icon icon="solar:users-group-two-rounded-linear" className="text-lg" /> },
];

export function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, setPhase, setLoadedEnvs, setActiveEnv, setNeurons, updateWorkspace } = useWorkspace();
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarName, setAvatarName] = useState('');
  const [avatarImgError, setAvatarImgError] = useState(false);
  const [envModalOpen, setEnvModalOpen] = useState(false);

  useEffect(() => {
    ProductService.GetUserProfile().then((p: any) => {
      if (p) {
        setAvatarUrl(p.picture || '');
        setAvatarName(p.name || '');
      }
    }).catch(() => {});
  }, []);

  const [envsLoading, setEnvsLoading] = useState(false);
  const envsLoadingRef = useRef(false);
  useEffect(() => {
    if (!state.organisation || !state.product) return;
    if (state.loadedEnvs.length > 0 || envsLoadingRef.current) return;
    envsLoadingRef.current = true;
    setEnvsLoading(true);
    updateWorkspace({ envsError: null });
    (ProductService.ListEnvironments as (org: string, product: string) => Promise<any[]>)(
      state.organisation,
      state.product,
    ).then((envs) => {
      const loaded = envs.map((e: any) => ({
        name: e.name as string,
        displayName: e.displayName as string,
        state: e.state as number,
        gcpProjectId: e.gcpProject?.id ?? '',
        gcpProjectNumber: e.gcpProject?.number ?? '',
        gcpRegion: e.gcpProject?.region ?? '',
      }));
      setLoadedEnvs(loaded);
      if (!state.activeEnvName && loaded.length > 0) setActiveEnv(loaded[0].name);
    }).catch((err) => {
      updateWorkspace({ envsError: String(err) });
    }).finally(() => { envsLoadingRef.current = false; setEnvsLoading(false); });
  }, [state.organisation, state.product, state.loadedEnvs.length]);

  const neuronsLoadingRef = useRef(false);
  useEffect(() => {
    if (!state.organisation || !state.product) return;
    if (state.neurons.length > 0 || neuronsLoadingRef.current) return;
    neuronsLoadingRef.current = true;
    (ProductService.GetServicesOverview as (org: string, product: string) => Promise<any>)(
      state.organisation,
      state.product,
    ).then((overview) => {
      if (overview?.neurons?.length) {
        const loaded = overview.neurons.map((n: any) => ({
          id: n.id, name: n.id, type: 2, state: n.state, latestBuild: n.version, envs: [],
        }));
        setNeurons(loaded);
      }
    }).catch(() => {})
    .finally(() => { neuronsLoadingRef.current = false; });
  }, [state.organisation, state.product, state.neurons.length]);

  const activeEnvDisplay = state.loadedEnvs.find(e => e.name === state.activeEnvName)?.displayName ?? 'Environment';

  const getActiveTab = () => {
    const path = location.pathname.split('/')[1] || 'about';
    return path;
  };

  const activeTab = getActiveTab();

  const handleTabClick = (tabId: string) => navigate(`/${tabId}`);

  const handleHomeClick = () => setPhase('hub');
  const handleOrgClick = () => setPhase('picking-product');

  const openProfile = () => setProfileOpen(true);

  return (
    <div
      className="bg-[#2c2c2c] border-b border-[#464646] h-[40px] flex items-center shrink-0 w-full overflow-x-hidden"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left: Window controls and breadcrumb */}
      <div className="flex items-center h-full pr-[10px]" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="px-[10px] flex items-center justify-center">
          <WindowControls />
        </div>

        <div className="flex items-center gap-[6px] ml-[5px] border-l border-r border-[#464646] h-full px-[10px]">
          <button
            onClick={handleHomeClick}
            className="opacity-70 hover:opacity-100 transition-opacity"
            title="All landing zones"
          >
            <Icon icon="solar:home-2-linear" className="text-white text-[17px]" />
          </button>

          {state.organisation && (
            <>
              <Icon icon="solar:alt-arrow-right-linear" className="text-white text-[11px] opacity-40" />
              <button
                onClick={handleOrgClick}
                className="text-[12px] text-white font-['JetBrains_Mono',sans-serif] opacity-70 hover:opacity-100 transition-opacity"
                title="Change product"
              >
                {state.organisation}
              </button>
            </>
          )}

          {state.product && (
            <>
              <Icon icon="solar:alt-arrow-right-linear" className="text-white text-[11px] opacity-40" />
              <span className="text-[12px] text-white font-['JetBrains_Mono',sans-serif] opacity-70 font-bold">
                {state.product}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Center: Tabs */}
      <div className="flex h-full flex-1 justify-center overflow-x-auto no-scrollbar" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="flex h-full border-r border-[#464646]">
          {tabs.map((tab) => (
            <Tab
              key={tab.id}
              label={tab.label}
              icon={tab.icon}
              active={activeTab === tab.id}
              onClick={() => handleTabClick(tab.id)}
            />
          ))}
        </div>
      </div>

      {/* Right: Environment + Profile + Update badge */}
      <div className="flex items-center h-full px-[10px] gap-[10px]" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Environment picker — opens modal */}
        <div className="content-stretch flex h-full items-center shrink-0">
          <button
            onClick={() => setEnvModalOpen(true)}
            className="content-stretch flex gap-[5px] h-full items-center px-[12px] relative shrink-0 hover:bg-[rgba(255,255,255,0.05)] transition-colors border-l border-[#464646]"
          >
            <p className="font-['JetBrains_Mono',sans-serif] leading-normal not-italic relative shrink-0 text-[11px] text-white whitespace-nowrap">
              {activeEnvDisplay}
            </p>
            <Icon icon="solar:alt-arrow-down-linear" className="text-white text-xs opacity-50" />
          </button>
          <button
            onClick={() => navigate('/environments')}
            className="h-full border-l border-[#464646] flex items-center justify-center px-[10px] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
          >
            <Icon icon="solar:settings-linear" className="text-white text-base opacity-70" />
          </button>
        </div>

        <NotificationCenter />
        <button
          onClick={openProfile}
          className="opacity-70 hover:opacity-100 transition-opacity shrink-0"
          title="Open profile"
        >
          {avatarUrl && !avatarImgError ? (
            <img
              src={avatarUrl}
              alt={avatarName}
              className="size-[24px] rounded-full object-cover"
              onError={() => setAvatarImgError(true)}
            />
          ) : avatarName ? (
            <div className="size-[24px] rounded-full bg-[rgba(248,129,169,0.2)] border border-[rgba(248,129,169,0.4)] flex items-center justify-center">
              <span className="text-[9px] font-bold text-[#F881A9] font-['JetBrains_Mono',sans-serif]">
                {avatarName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
              </span>
            </div>
          ) : (
            <Icon icon="solar:user-circle-linear" className="text-white text-[22px]" />
          )}
        </button>
      </div>

      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />

      {/* Environment picker modal */}
      <Dialog open={envModalOpen} onOpenChange={setEnvModalOpen}>
        <DialogContent className="bg-[#2c2c2c] border border-[#464646] text-white p-0 max-w-[360px] overflow-hidden">
          <div className="flex items-center gap-[10px] px-[16px] pt-[16px] pb-[12px] border-b border-[#464646]">
            <Icon icon="solar:server-linear" className="text-[#f881a9] text-lg" />
            <span className="text-[13px] font-bold text-white font-['JetBrains_Mono',sans-serif]">Environment</span>
          </div>
          <div className="py-[6px]">
            {envsLoading ? (
              <p className="px-[16px] py-[12px] text-[11px] text-[rgba(255,255,255,0.4)] font-['JetBrains_Mono',sans-serif]">Loading…</p>
            ) : state.envsError ? (
              <p className="px-[16px] py-[12px] text-[11px] text-[#ff5c5f] font-['JetBrains_Mono',sans-serif]">Session expired — sign in again via your profile.</p>
            ) : state.loadedEnvs.length === 0 ? (
              <p className="px-[16px] py-[12px] text-[11px] text-[rgba(255,255,255,0.4)] font-['JetBrains_Mono',sans-serif]">No environments</p>
            ) : (
              state.loadedEnvs.map((env) => {
                const isActive = env.name === state.activeEnvName;
                return (
                  <button
                    key={env.name}
                    onClick={() => {
                      setActiveEnv(env.name);
                      setEnvModalOpen(false);
                      Call.ByName('main.ProductService.SwitchEnvironment',
                        state.organisation, state.product, env.name,
                        env.gcpProjectId ?? '', env.gcpProjectNumber ?? '', env.gcpRegion ?? ''
                      ).catch(console.error);
                    }}
                    className={`w-full flex items-center justify-between px-[16px] py-[11px] transition-colors text-left ${
                      isActive
                        ? 'bg-[rgba(248,129,169,0.08)] text-[#f881a9]'
                        : 'text-white hover:bg-[rgba(255,255,255,0.04)]'
                    }`}
                  >
                    <span className="text-[12px] font-['JetBrains_Mono',sans-serif]">{env.displayName}</span>
                    {isActive && <Icon icon="solar:check-circle-bold" className="text-[#f881a9] text-base shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-[#464646] px-[16px] py-[10px]">
            <button
              onClick={() => { setEnvModalOpen(false); navigate('/environments'); }}
              className="flex items-center gap-[6px] text-[11px] text-[rgba(255,255,255,0.4)] hover:text-white transition-colors font-['JetBrains_Mono',sans-serif]"
            >
              <Icon icon="solar:settings-linear" className="text-sm" />
              Manage environments
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
