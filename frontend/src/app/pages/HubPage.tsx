import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { useWorkspace } from '../stores/workspace';
import { NotificationCenter } from '../components/NotificationCenter';
import { ProfileModal } from '../components/ProfileModal';
import { useUserProfile } from '../stores/userProfile';
import { usePlatform } from '../stores/platform';
import { MacWindowControls, WindowsWindowControls } from '../components/WindowControls';
import { handleTitleBarDoubleClick } from '../lib/titlebar';

export function HubPage() {
  const navigate = useNavigate();
  const { state, setPhase, setProduct } = useWorkspace();
  const { effective } = usePlatform();
  const isWindows = effective === 'windows';
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarImgError, setAvatarImgError] = useState(false);

  const { profile } = useUserProfile();
  const avatarUrl = profile?.picture ?? '';
  const avatarName = profile?.name ?? '';

  const goStandalone = (path: string) => {
    setPhase('standalone');
    navigate(path);
  };

  const resumeRecent = () => {
    if (!state.recentLandingZone) return;
    const { org, orgDisplayName, product, productDisplayName } = state.recentLandingZone;
    setProduct(org, orgDisplayName, product, productDisplayName);
    navigate('/about');
  };

  const shortcuts = [
    {
      id: 'buildkit',
      label: 'Build Kit',
      description: 'Configure APIs, agents, and integrations',
      icon: 'solar:rocket-2-linear',
      action: () => goStandalone('/buildkit'),
    },
    {
      id: 'learn',
      label: 'Learn',
      description: 'Modules and guides for working with Alis',
      icon: 'solar:diploma-linear',
      action: () => goStandalone('/learn'),
    },
    {
      id: 'codeblocks',
      label: 'Codeblocks',
      description: 'Browse and contribute reusable code blocks',
      icon: 'solar:code-linear',
      action: () => goStandalone('/codeblocks'),
    },
    {
      id: 'landing-zones',
      label: 'Landing Zones',
      description: 'Select an organisation and product to work in',
      icon: 'solar:buildings-2-linear',
      action: () => setPhase('picking-org'),
    },
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
      {/* Title bar — only this strip is draggable */}
      <div
        className="h-[40px] flex items-center justify-between shrink-0 border-b border-border"
        style={{ '--wails-draggable': 'drag' } as React.CSSProperties}
        onDoubleClick={handleTitleBarDoubleClick}
      >
        <div className="flex items-center gap-[10px] px-[10px]" style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}>
          {!isWindows && <MacWindowControls />}
        </div>
        <div className="flex items-stretch h-full" style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}>
        <div className="flex items-center gap-[10px] px-[10px]">
          <NotificationCenter />
          <button
            onClick={() => setProfileOpen(true)}
            className="opacity-70 hover:opacity-100 transition-opacity"
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
              <div className="size-[24px] rounded-full flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--brand) 20%, transparent)', border: '1px solid color-mix(in srgb, var(--brand) 40%, transparent)' }}>
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto flex flex-col items-center justify-center px-[32px] py-[40px]">
        <div className="w-full max-w-[640px] flex flex-col gap-[32px]">
          {/* Header */}
          <div className="flex flex-col items-center text-center gap-[14px]">
            <img src="/appicon.png" alt="Alis" className="size-[64px] rounded-[16px]" />
            <div>
              <h1 className="text-[24px] font-bold text-foreground tracking-tight">AlisHub</h1>
              <p className="text-[13px] text-foreground/45 mt-[5px] italic tracking-wide">
                From Idea to Impact, Faster
              </p>
            </div>
          </div>

          {/* Recent landing zone */}
          {state.recentLandingZone && (
            <div>
              <p className="text-[10px] font-mono text-foreground/30 uppercase tracking-wide mb-[10px]">
                Recent
              </p>
              <button
                onClick={resumeRecent}
                className="w-full text-left bg-card border border-border hover:border-brand-fill rounded-[10px] p-[16px] transition-all group"
              >
                <div className="flex items-center gap-[12px]">
                  <div className="size-[36px] rounded-[8px] flex items-center justify-center shrink-0" style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--brand) 20%, transparent)' }}>
                    <Icon icon="solar:map-point-linear" className="text-brand text-lg" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-foreground group-hover:text-brand transition-colors truncate">
                      {state.recentLandingZone.orgDisplayName || state.recentLandingZone.org}
                    </p>
                    <p className="text-[11px] text-foreground/40 mt-[1px] truncate">
                      {state.recentLandingZone.productDisplayName || state.recentLandingZone.product}
                    </p>
                  </div>
                  <div className="flex items-center gap-[6px] shrink-0">
                    <span className="text-[10px] font-mono text-foreground/30 group-hover:text-brand transition-colors">
                      Resume
                    </span>
                    <Icon icon="solar:alt-arrow-right-linear" className="text-foreground/30 group-hover:text-brand text-base transition-colors" />
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Shortcut cards */}
          <div>
            {state.recentLandingZone && (
              <p className="text-[10px] font-mono text-foreground/30 uppercase tracking-wide mb-[10px]">
                Explore
              </p>
            )}
            <div className="grid grid-cols-2 gap-[10px]">
              {shortcuts.map((s) => (
                <button
                  key={s.id}
                  onClick={s.action}
                  className="text-left bg-card border border-border hover:border-brand-fill rounded-[10px] p-[16px] transition-all group"
                >
                  <div className="size-[32px] rounded-[8px] flex items-center justify-center mb-[12px]" style={{ background: 'color-mix(in srgb, var(--brand) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--brand) 15%, transparent)' }}>
                    <Icon icon={s.icon} className="text-brand text-base" />
                  </div>
                  <p className="text-[13px] font-semibold text-foreground group-hover:text-brand transition-colors">
                    {s.label}
                  </p>
                  <p className="text-[11px] text-foreground/35 mt-[3px] leading-snug">
                    {s.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}
