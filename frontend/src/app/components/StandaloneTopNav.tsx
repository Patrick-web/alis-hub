import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Icon } from '@iconify/react';
import { Window } from '@wailsio/runtime';
import { Tab } from './Tab';
import { useWorkspace } from '../stores/workspace';
import { ProfileModal } from './ProfileModal';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';

function WindowControls() {
  return (
    <div className="flex items-center gap-[6px]" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        onClick={() => Window.Close()}
        className="w-[12px] h-[12px] rounded-full bg-destructive hover:bg-destructive transition-colors shrink-0 focus:outline-none"
        title="Close"
      />
      <button
        onClick={() => Window.Minimise()}
        className="w-[12px] h-[12px] rounded-full bg-warning hover:bg-warning transition-colors shrink-0 focus:outline-none"
        title="Minimise"
      />
      <button
        onClick={() => Window.ToggleMaximise()}
        className="w-[12px] h-[12px] rounded-full bg-success hover:bg-success transition-colors shrink-0 focus:outline-none"
        title="Maximise"
      />
    </div>
  );
}

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
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarName, setAvatarName] = useState('');
  const [avatarImgError, setAvatarImgError] = useState(false);

  useEffect(() => {
    ProductService.GetUserProfile().then((p: any) => {
      if (p) {
        setAvatarUrl(p.picture || '');
        setAvatarName(p.name || '');
      }
    }).catch(() => {});
  }, []);

  const activeTab = location.pathname.split('/')[1] || '';

  return (
    <div
      className="bg-card border-b border-border h-[40px] flex items-center shrink-0 w-full overflow-x-hidden"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left: Window controls + home */}
      <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="px-[10px] flex items-center justify-center">
          <WindowControls />
        </div>
        <button
          onClick={() => setPhase('hub')}
          className="border-l border-border h-full px-[12px] flex items-center opacity-70 hover:opacity-100 transition-opacity"
          title="Back to hub"
        >
          <Icon icon="solar:home-2-linear" className="text-foreground text-[17px]" />
        </button>
      </div>

      {/* Center: Tabs */}
      <div
        className="flex h-full flex-1 justify-center overflow-x-auto no-scrollbar"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="flex h-full border-r border-border">
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

      {/* Right: Profile */}
      <div
        className="flex items-center h-full px-[10px]"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
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

      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}
