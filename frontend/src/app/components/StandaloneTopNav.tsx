import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Icon } from '@iconify/react';
import { System } from '@wailsio/runtime';
import { Tab } from './Tab';
import { useWorkspace } from '../stores/workspace';
import { ProfileModal } from './ProfileModal';
import { useUserProfile } from '../stores/userProfile';
import { MacWindowControls, WindowsWindowControls } from './WindowControls';
import { handleTitleBarDoubleClick } from '../lib/titlebar';

const isWindows = System.IsWindows();

const standaloneTabs = [
  { id: 'buildkit', label: 'Build Kit', icon: <Icon icon="solar:rocket-2-linear" className="text-lg" />, route: '/buildkit' },
  { id: 'learn', label: 'Learn', icon: <Icon icon="solar:diploma-linear" className="text-lg" />, route: '/learn' },
  { id: 'codeblocks', label: 'Codeblocks', icon: <Icon icon="solar:code-linear" className="text-lg" />, route: '/codeblocks' },
];

export function StandaloneTopNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setPhase } = useWorkspace();
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarImgError, setAvatarImgError] = useState(false);

  const { profile } = useUserProfile();
  const avatarUrl = profile?.picture ?? '';
  const avatarName = profile?.name ?? '';

  const activeTab = location.pathname.split('/')[1] || '';

  return (
    <div
      className="bg-card border-b border-border h-[40px] flex items-center shrink-0 w-full overflow-x-hidden"
      style={{ '--wails-draggable': 'drag' } as React.CSSProperties}
      onDoubleClick={handleTitleBarDoubleClick}
    >
      {/* Left: Window controls + home */}
      <div className="flex items-center h-full" style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}>
        {!isWindows && (
          <div className="px-[10px] flex items-center justify-center">
            <MacWindowControls />
          </div>
        )}
        <button
          onClick={() => setPhase('hub')}
          className={`${!isWindows ? 'border-l' : ''} border-border h-full px-[12px] flex items-center opacity-70 hover:opacity-100 transition-opacity`}
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
          {standaloneTabs.map((tab) => (
            <Tab
              key={tab.id}
              label={tab.label}
              icon={tab.icon}
              active={activeTab === tab.id}
              onClick={() => navigate(tab.route)}
            />
          ))}
          <Tab
            label="Landing Zones"
            icon={<Icon icon="solar:buildings-2-linear" className="text-lg" />}
            active={false}
            onClick={() => setPhase('picking-org')}
          />
        </div>
      </div>

      {/* Right: Profile + Windows controls */}
      <div
        className="flex items-stretch h-full"
        style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}
      >
        <div className="flex items-center h-full px-[10px]">
          <button
            onClick={() => setProfileOpen(true)}
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
      </div>

      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}
