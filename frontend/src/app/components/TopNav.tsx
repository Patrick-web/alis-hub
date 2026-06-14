import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Icon } from '@iconify/react';
import { Tab } from './Tab';
import { Dropdown } from './Dropdown';
import { useWorkspace } from '../stores/workspace';
import { Events, Window } from '@wailsio/runtime';
import { ReleaseNotesModal } from './ReleaseNotesModal';
import { ProfileModal } from './ProfileModal';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  releaseUrl: string;
}

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
  { id: 'codeblocks', label: 'Codeblocks', icon: <Icon icon="solar:code-linear" className="text-lg" /> },
  { id: 'buildkit', label: 'Build Kit', icon: <Icon icon="solar:rocket-launch-linear" className="text-lg" /> },
];

export function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, setPhase, setLoadedEnvs, setActiveEnv } = useWorkspace();
  const [pendingUpdate, setPendingUpdate] = useState<UpdateInfo | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarName, setAvatarName] = useState('');
  const [avatarImgError, setAvatarImgError] = useState(false);

  useEffect(() => {
    const off = Events.On('update:available', (ev) => {
      setPendingUpdate(ev.data as UpdateInfo);
    });
    return () => { off(); };
  }, []);

  useEffect(() => {
    ProductService.GetUserProfile().then((p: any) => {
      if (p) {
        setAvatarUrl(p.picture || '');
        setAvatarName(p.name || '');
      }
    }).catch(() => {});
  }, []);

  const [envsLoading, setEnvsLoading] = useState(false);
  const [envsError, setEnvsError] = useState<string | null>(null);
  const envsLoadingRef = useRef(false);
  useEffect(() => {
    if (!state.organisation || !state.product) return;
    if (state.loadedEnvs.length > 0 || envsLoadingRef.current) return;
    envsLoadingRef.current = true;
    setEnvsLoading(true);
    setEnvsError(null);
    (ProductService.ListEnvironments as (org: string, product: string) => Promise<any[]>)(
      state.organisation,
      state.product,
    ).then((envs) => {
      const loaded = envs.map((e: any) => ({ name: e.name as string, displayName: e.displayName as string, state: e.state as number }));
      setLoadedEnvs(loaded);
      if (!state.activeEnvName && loaded.length > 0) setActiveEnv(loaded[0].name);
    }).catch((err) => {
      setEnvsError(String(err));
    }).finally(() => { envsLoadingRef.current = false; setEnvsLoading(false); });
  }, [state.organisation, state.product, state.loadedEnvs.length]);

  const activeEnvDisplay = state.loadedEnvs.find(e => e.name === state.activeEnvName)?.displayName ?? 'Environment';

  const getActiveTab = () => {
    const path = location.pathname.split('/')[1] || 'about';
    if (path === 'services') return 'develop';
    return path;
  };

  const activeTab = getActiveTab();

  const handleTabClick = (tabId: string) => navigate(`/${tabId}`);

  const handleHomeClick = () => setPhase('picking-org');
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
        <Dropdown
          label={activeEnvDisplay}
          options={state.loadedEnvs.map(e => e.displayName)}
          loading={envsLoading}
          error={envsError}
          onSelect={(displayName) => {
            const env = state.loadedEnvs.find(e => e.displayName === displayName);
            if (env) setActiveEnv(env.name);
          }}
          onSettingsClick={() => navigate('/environments')}
        />
        <div className="h-full w-px bg-[#464646]" />
        {pendingUpdate && (
          <button
            onClick={() => setNotesOpen(true)}
            className="text-[10px] font-['JetBrains_Mono',sans-serif] font-bold bg-[#34C759] text-black px-[6px] py-[2px] rounded-full uppercase tracking-wide hover:bg-[#2eaf4f] transition-colors"
            title={`Update available: v${pendingUpdate.latestVersion}`}
          >
            Update
          </button>
        )}
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

      {pendingUpdate && (
        <ReleaseNotesModal
          open={notesOpen}
          onOpenChange={setNotesOpen}
          currentVersion={pendingUpdate.currentVersion}
          latestVersion={pendingUpdate.latestVersion}
          releaseNotes={pendingUpdate.releaseNotes}
          releaseUrl={pendingUpdate.releaseUrl}
        />
      )}

      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}
