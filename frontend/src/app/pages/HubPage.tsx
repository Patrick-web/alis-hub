import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { Window } from '@wailsio/runtime';
import { useWorkspace } from '../stores/workspace';
import { ProfileModal } from '../components/ProfileModal';
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

export function HubPage() {
  const navigate = useNavigate();
  const { state, setPhase, setProduct } = useWorkspace();
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
      icon: 'solar:rocket-launch-linear',
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
    <div
      className="flex flex-col h-screen w-full bg-[#1e1e1e] overflow-hidden"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Title bar */}
      <div className="h-[40px] flex items-center justify-between px-[10px] shrink-0 border-b border-[#2c2c2c]">
        <div className="flex items-center gap-[10px]" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <WindowControls />
        </div>
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto flex flex-col items-center justify-center px-[32px] py-[40px]">
        <div className="w-full max-w-[640px] flex flex-col gap-[32px]">
          {/* Header */}
          <div>
            <h1 className="text-[22px] font-bold text-white">Alis Hub</h1>
            <p className="text-[12px] text-[rgba(255,255,255,0.4)] mt-[4px]">Select a destination to get started</p>
          </div>

          {/* Recent landing zone */}
          {state.recentLandingZone && (
            <div>
              <p className="text-[10px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.3)] uppercase tracking-wide mb-[10px]">
                Recent
              </p>
              <button
                onClick={resumeRecent}
                className="w-full text-left bg-[#2c2c2c] border border-[#3a3a3a] hover:border-[#F881A9] rounded-[10px] p-[16px] transition-all group"
              >
                <div className="flex items-center gap-[12px]">
                  <div className="size-[36px] rounded-[8px] bg-[rgba(248,129,169,0.12)] border border-[rgba(248,129,169,0.2)] flex items-center justify-center shrink-0">
                    <Icon icon="solar:map-point-linear" className="text-[#F881A9] text-lg" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-white group-hover:text-[#F881A9] transition-colors truncate">
                      {state.recentLandingZone.orgDisplayName || state.recentLandingZone.org}
                    </p>
                    <p className="text-[11px] text-[rgba(255,255,255,0.4)] mt-[1px] truncate">
                      {state.recentLandingZone.productDisplayName || state.recentLandingZone.product}
                    </p>
                  </div>
                  <div className="flex items-center gap-[6px] shrink-0">
                    <span className="text-[10px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.3)] group-hover:text-[#F881A9] transition-colors">
                      Resume
                    </span>
                    <Icon icon="solar:alt-arrow-right-linear" className="text-[rgba(255,255,255,0.3)] group-hover:text-[#F881A9] text-base transition-colors" />
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Shortcut cards */}
          <div>
            {state.recentLandingZone && (
              <p className="text-[10px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.3)] uppercase tracking-wide mb-[10px]">
                Explore
              </p>
            )}
            <div className="grid grid-cols-2 gap-[10px]">
              {shortcuts.map((s) => (
                <button
                  key={s.id}
                  onClick={s.action}
                  className="text-left bg-[#2c2c2c] border border-[#3a3a3a] hover:border-[#F881A9] rounded-[10px] p-[16px] transition-all group"
                >
                  <div className="size-[32px] rounded-[8px] bg-[rgba(248,129,169,0.08)] border border-[rgba(248,129,169,0.12)] flex items-center justify-center mb-[12px]">
                    <Icon icon={s.icon} className="text-[#F881A9] text-base" />
                  </div>
                  <p className="text-[13px] font-semibold text-white group-hover:text-[#F881A9] transition-colors">
                    {s.label}
                  </p>
                  <p className="text-[11px] text-[rgba(255,255,255,0.35)] mt-[3px] leading-snug">
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
