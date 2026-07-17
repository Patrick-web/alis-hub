import React, { useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Icon } from '@iconify/react';
import { Tab } from './Tab';
import { useWorkspace } from '../stores/workspace';
import { useProfileModal } from '../stores/profileModal';
import { useUserProfile } from '../stores/userProfile';
import { usePlatform } from '../stores/platform';
import { MacWindowControls, WindowsWindowControls, LinuxWindowControls } from './WindowControls';
import { handleTitleBarDoubleClick } from '../lib/titlebar';

const standaloneTabs = [
  { id: 'buildkit', label: 'Build Kit', icon: <Icon icon="solar:rocket-2-linear" className="text-lg" />, route: '/buildkit' },
  { id: 'learn', label: 'Learn', icon: <Icon icon="solar:diploma-linear" className="text-lg" />, route: '/learn' },
  { id: 'codeblocks', label: 'Codeblocks', icon: <Icon icon="solar:code-linear" className="text-lg" />, route: '/codeblocks' },
];

export function StandaloneTopNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setPhase } = useWorkspace();
  const { effective } = usePlatform();
  const isWindows = effective === 'windows';
  const isLinux = effective === 'linux';
  const isMac = effective === 'darwin';
  const { open: openProfile } = useProfileModal();
  const [avatarImgError, setAvatarImgError] = useState(false);

  const { profile } = useUserProfile();
  const avatarUrl = profile?.picture ?? '';
  const avatarName = profile?.name ?? '';

  const activeTab = location.pathname.split('/')[1] || '';

  const allTabs = [
    ...standaloneTabs,
    { id: 'picking-org', label: 'Landing Zones', icon: <Icon icon="solar:buildings-2-linear" className="text-lg" />, route: null },
  ];

  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [tabFocusIndex, setTabFocusIndex] = useState(-1);

  function handleTabKeyDown(e: React.KeyboardEvent, idx: number) {
    const n = allTabs.length;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = (idx + 1) % n;
      setTabFocusIndex(next);
      tabRefs.current.get(allTabs[next].id)?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = (idx - 1 + n) % n;
      setTabFocusIndex(next);
      tabRefs.current.get(allTabs[next].id)?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setTabFocusIndex(0);
      tabRefs.current.get(allTabs[0].id)?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      const last = n - 1;
      setTabFocusIndex(last);
      tabRefs.current.get(allTabs[last].id)?.focus();
    }
  }

  return (
    <div
      className="bg-card border-b border-border h-[40px] flex items-center shrink-0 w-full overflow-x-hidden"
      style={{ '--wails-draggable': 'drag' } as React.CSSProperties}
      onDoubleClick={handleTitleBarDoubleClick}
    >
      {/* Left: Window controls + home */}
      <div className="flex items-center h-full" style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}>
        {isMac && (
          <div className="px-[10px] flex items-center justify-center">
            <MacWindowControls />
          </div>
        )}
        <button
          onClick={() => setPhase('hub')}
          className={`${isMac ? 'border-l' : ''} border-border h-full px-[12px] flex items-center opacity-70 hover:opacity-100 transition-opacity`}
          title="Back to hub"
        >
          <Icon icon="solar:home-2-linear" className="text-foreground text-[17px]" />
        </button>
      </div>

      {/* Center: Tabs */}
      <div className="flex h-full flex-1 justify-center overflow-x-auto no-scrollbar">
        <div
          className="flex h-full border-r border-border"
          style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}
        >
          {allTabs.map((tab, i) => (
            <Tab
              key={tab.id}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.id, el);
                else tabRefs.current.delete(tab.id);
              }}
              label={tab.label}
              icon={tab.icon}
              active={activeTab === tab.id}
              tabIndex={
                tabFocusIndex >= 0
                  ? tabFocusIndex === i ? 0 : -1
                  : activeTab === tab.id ? 0 : -1
              }
              onKeyDown={(e) => handleTabKeyDown(e, i)}
              onClick={() => tab.route ? navigate(tab.route) : setPhase('picking-org')}
            />
          ))}
        </div>
      </div>

      {/* Right: Profile + Windows controls */}
      <div
        className="flex items-stretch h-full"
        style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}
      >
        <div className="flex items-center h-full px-[10px]">
          <button
            onClick={() => openProfile()}
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
              <div className="size-[24px] rounded-full bg-brand-fill/20 border border-brand-fill/40 flex items-center justify-center">
                <span className="text-[9px] font-bold text-brand font-mono">
                  {avatarName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                </span>
              </div>
            ) : (
              <Icon icon="solar:user-circle-linear" className="text-foreground text-[22px]" />
            )}
          </button>
        </div>
        {isWindows && <WindowsWindowControls />}
        {isLinux && <LinuxWindowControls />}
      </div>
    </div>
  );
}
