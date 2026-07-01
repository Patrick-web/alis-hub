import { useState, useEffect, useReducer, useMemo } from 'react';
import { useTheme } from 'next-themes';
import { marked } from 'marked';
import { Loader } from './Loader';
import { Icon } from '@iconify/react';
import { Browser, Events } from '@wailsio/runtime';
import { isSystemNotificationsEnabled, setSystemNotificationsEnabled, requestNotificationAuthorization } from '../lib/systemNotify';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogPortal, DialogOverlay } from './ui/dialog';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';
import * as UpdaterService from '../../../bindings/alis-hub-v3/internal/updater/service';
import * as ChangelogService from '../../../bindings/alis-hub-v3/changelogservice';
import * as BuildService from '../../../bindings/alis-hub-v3/buildservice';
import { SearchableSelect } from './ui/searchable-select';
import { useWorkspace } from '../stores/workspace';
import { useLabs, SUGGESTION_REGISTRY, SUGGESTION_CATEGORY_ORDER, type SuggestionCategory } from '../stores/labs';
import { useSourceControl } from '../stores/sourceControl';
import { useDevelopSettings, type SmartSortKey } from '../stores/developSettings';
import { getToolDefault, setToolDefault } from '../stores/toolsSettings';
import { useAccentColor, ACCENT_COLORS } from '../stores/accent';
import { useUserProfile } from '../stores/userProfile';
import { LocalAISetupCard } from './LocalAISetupCard';
import { ReleaseNotesModal } from './ReleaseNotesModal';

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Tab = 'account' | 'appearance' | 'notifications' | 'labs' | 'updates' | 'source-control' | 'develop' | 'tools';

interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes: string;
}

interface DownloadProgress {
  downloaded: number;
  total: number;
  done: boolean;
  error?: string;
  path?: string;
}

interface AppInfo {
  version: string;
  go: string;
  os: string;
  arch: string;
  executable: string;
}

function Avatar({ name, picture, size = 48 }: { name: string; picture: string; size?: number }) {
  const [imgError, setImgError] = useState(false);

  if (picture && !imgError) {
    return (
      <img
        src={picture}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
        onError={() => setImgError(true)}
      />
    );
  }

  const initials = name
    ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div
      className="rounded-full bg-[rgba(248,129,169,0.15)] border border-[rgba(248,129,169,0.3)] flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <span className="text-brand font-bold font-mono" style={{ fontSize: size * 0.35 }}>
        {initials}
      </span>
    </div>
  );
}

function SettingRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-[12px] py-[8px] border-b border-border last:border-0">
      <span className="text-[12px] text-foreground/70 font-medium">{label}</span>
      {value && <span className="text-[11px] text-foreground/45 font-mono">{value}</span>}
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-mono uppercase tracking-[1.5px] text-foreground/25 px-[2px] pb-[2px]">
      {children}
    </div>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-foreground/[0.04] rounded-[9px] border border-border overflow-hidden">
      {children}
    </div>
  );
}

const SIDEBAR_GROUPS = [
  {
    label: 'Personal',
    items: [
      { id: 'account' as Tab,       label: 'Account',       icon: 'solar:user-circle-linear',    color: '#f881a9' },
      { id: 'appearance' as Tab,    label: 'Appearance',    icon: 'solar:palette-linear',         color: undefined },
      { id: 'notifications' as Tab, label: 'Notifications', icon: 'solar:bell-linear',            color: undefined },
    ],
  },
  {
    label: 'Advanced',
    items: [
      { id: 'labs' as Tab,           label: 'Labs',           icon: 'solar:test-tube-linear',        color: '#bf5af2' },
      { id: 'updates' as Tab,        label: 'Updates',        icon: 'solar:refresh-circle-linear',   color: '#3b82f6' },
      { id: 'source-control' as Tab, label: 'Source Control', icon: 'solar:git-branch-linear',       color: undefined },
      { id: 'develop' as Tab,        label: 'Develop',        icon: 'solar:code-square-linear',        color: undefined },
      { id: 'tools' as Tab,          label: 'Tools',          icon: 'solar:cloud-storage-linear',       color: undefined },
    ],
  },
];

const TOOL_SETTINGS = [
  { id: 'buckets',         label: 'Buckets' },
  { id: 'logs',            label: 'Logs' },
  { id: 'artifactregistry',label: 'Artifact Registry' },
  { id: 'secrets',         label: 'Secret Manager' },
  { id: 'spanner',         label: 'Spanner' },
  { id: 'backups',         label: 'Backups' },
];

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { state, setPhase } = useWorkspace();
  const { theme, setTheme } = useTheme();
  const { accentId, setAccent, customHex, setCustomAccent } = useAccentColor();
  const contrastForCustom = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#1a1a1a' : '#ffffff';
  };
  const { state: labsState, isSuggestionEnabled, setSuggestionEnabled, setMasterEnabled } = useLabs();
  const { state: scState, setFileListView, setDiffView } = useSourceControl();
  const {
    settings: devSettings,
    setIgnoreHiddenFolders,
    setIgnoredFolderPatterns,
    setDefaultBranch,
    setSmartSortEnabled,
    setSmartSortKey,
  } = useDevelopSettings();
  const [activeTab, setActiveTab] = useState<Tab>('account');
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const { profile, profileError, clearProfile } = useUserProfile();

  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadPct, setDownloadPct] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [changelogHtml, setChangelogHtml] = useState('');
  const [sysNotifications, setSysNotifications] = useState(() => isSystemNotificationsEnabled());
  const [, forceToolDefaultsUpdate] = useReducer(x => x + 1, 0);

  function handleToolDefaultChange(toolId: string, level: string) {
    setToolDefault(state.organisation ?? '', state.product ?? '', toolId, level);
    forceToolDefaultsUpdate();
  }

  async function handleSysNotifToggle() {
    if (!sysNotifications) {
      const granted = await requestNotificationAuthorization();
      if (granted) {
        setSysNotifications(true);
        setSystemNotificationsEnabled(true);
      }
    } else {
      setSysNotifications(false);
      setSystemNotificationsEnabled(false);
    }
  }

  useEffect(() => {
    if (!open || activeTab !== 'develop') return;
    if (!state.organisation || !state.product) return;
    BuildService.GetBuildBranches(state.organisation, state.product)
      .then((bs: any) => { if (bs && bs.length > 0) setAvailableBranches(bs as string[]); })
      .catch(() => {});
  }, [open, activeTab, state.organisation, state.product]);

  useEffect(() => {
    if (!open) return;

    UpdaterService.AppInfo().then((info: any) => {
      if (info) setAppInfo(info as AppInfo);
    }).catch(() => {});

    UpdaterService.CurrentVersion().then((v: string) => {
      setUpdateInfo(prev => prev ? { ...prev, currentVersion: v } : { available: false, currentVersion: v, latestVersion: '', releaseUrl: '', releaseNotes: '' });
    }).catch(() => {});

    ChangelogService.GetReleaseNotes().then(async (notes: string) => {
      const html = await marked.parse(notes || '');
      setChangelogHtml(html);
    }).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const off = Events.On('update:available', (ev: any) => {
      setUpdateInfo(ev.data as UpdateInfo);
    });
    const offProgress = Events.On('update:progress', (ev: any) => {
      const p = ev.data as DownloadProgress;
      if (p.error) { setDownloading(false); setUpdateError(p.error); return; }
      if (p.done) { setDownloading(false); setDownloadPct(0); return; }
      if (p.total > 0) setDownloadPct(Math.round((p.downloaded / p.total) * 100));
    });
    return () => { off(); offProgress(); };
  }, [open]);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateError(null);
    try {
      const info = await UpdaterService.CheckForUpdate() as any;
      setUpdateInfo(info);
    } catch (e) {
      setUpdateError(String(e));
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleDownload = async () => {
    if (!updateInfo) return;
    if (navigator.userAgent.includes('Windows')) {
      Browser.OpenURL(updateInfo.releaseUrl);
      return;
    }
    setDownloading(true);
    setDownloadPct(0);
    setUpdateError(null);
    try {
      await UpdaterService.DownloadUpdate();
    } catch (e) {
      setDownloading(false);
      setUpdateError(String(e));
    }
  };

  const handleApply = async () => {
    try {
      await UpdaterService.ApplyUpdate();
    } catch (e) {
      setUpdateError(String(e));
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await ProductService.Logout();
      clearProfile();
      onOpenChange(false);
      setPhase('login');
    } catch (e) {
      setLoggingOut(false);
    }
  };

  const groupedRegistry = useMemo(() => {
    const map: Partial<Record<SuggestionCategory, typeof SUGGESTION_REGISTRY>> = {};
    for (const def of SUGGESTION_REGISTRY) {
      (map[def.category] ??= []).push(def);
    }
    return map;
  }, []);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogPortal>
          {/* Thin overlay — let app content show through for vibrancy */}
          <DialogOverlay className="bg-black/25" />

          <DialogPrimitive.Content
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-[640px] rounded-[14px] overflow-hidden text-foreground
                       border border-border
                       data-[state=open]:animate-in data-[state=closed]:animate-out
                       data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
                       data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95
                       duration-200"
            style={{
              background: 'var(--modal-bg)',
              backdropFilter: 'blur(40px) saturate(180%)',
              WebkitBackdropFilter: 'blur(40px) saturate(180%)',
              boxShadow: '0 0 0 0.5px rgba(255,255,255,0.06) inset, 0 32px 64px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.35)',
            }}
          >
            {/* Title bar */}
            <div className="flex items-center px-[14px] pt-[12px] pb-[9px] border-b border-border">
              <div className="w-[52px]" />
              <span className="flex-1 text-center text-[13px] font-semibold text-foreground/45 tracking-[-0.2px]">
                Settings
              </span>
              <div className="w-[52px] flex justify-end">
                <button
                  onClick={() => onOpenChange(false)}
                  className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.07] transition-colors"
                >
                  <Icon icon="solar:close-circle-linear" className="text-[15px]" />
                </button>
              </div>
            </div>

            <div className="flex min-h-[440px]">

              {/* Sidebar */}
              <div className="w-[160px] border-r border-border flex flex-col shrink-0">
                {SIDEBAR_GROUPS.map((group, gi) => (
                  <div key={group.label} className={gi > 0 ? 'mt-[2px]' : ''}>
                    <div className="px-[12px] pt-[10px] pb-[3px]">
                      <span className="text-[9px] font-mono uppercase tracking-[1.5px] text-foreground/20">
                        {group.label}
                      </span>
                    </div>
                    {group.items.map(item => (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`flex items-center gap-[8px] text-left mx-[5px] px-[9px] py-[7px] rounded-[7px] transition-colors ${
                          activeTab === item.id
                            ? 'bg-foreground/[0.07]'
                            : 'hover:bg-foreground/[0.04]'
                        }`}
                        style={{ width: 'calc(100% - 10px)' }}
                      >
                        <Icon
                          icon={item.icon}
                          className={`text-[15px] shrink-0 ${
                            activeTab === item.id
                              ? (item.color ? '' : 'text-foreground/90')
                              : 'text-foreground/35'
                          }`}
                          style={activeTab === item.id && item.color ? { color: item.color } : undefined}
                        />
                        <span
                          className={`text-[12px] font-medium ${
                            activeTab === item.id
                              ? (item.color ? '' : 'text-foreground/90')
                              : 'text-foreground/45'
                          }`}
                          style={activeTab === item.id && item.color ? { color: item.color } : undefined}
                        >
                          {item.label}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}

                <div className="flex-1" />

                <div className="p-[6px] border-t border-border">
                  <button
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="flex items-center gap-[7px] w-full px-[9px] py-[7px] rounded-[7px] text-[rgba(255,92,95,0.65)] hover:text-destructive hover:bg-[rgba(255,92,95,0.08)] transition-colors disabled:opacity-50"
                  >
                    <Icon icon="solar:logout-linear" className="text-[14px] shrink-0" />
                    <span className="text-[12px] font-medium">Sign out</span>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">

                {/* ── Account ── */}
                {activeTab === 'account' && (
                  <div className="p-[14px] flex flex-col gap-[12px]">
                    <div className="flex items-center gap-[12px] p-[12px] bg-foreground/[0.04] rounded-[9px] border border-border">
                      <Avatar name={profile?.name || ''} picture={profile?.picture || ''} size={44} />
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-foreground tracking-[-0.3px] truncate">
                          {profile?.name || '—'}
                        </p>
                        <p className="text-[11px] text-foreground/45 font-mono truncate mt-[2px]">
                          {profile?.email || '—'}
                        </p>
                      </div>
                    </div>

                    {profileError && (
                      <p className="text-[10px] text-destructive font-mono">{profileError}</p>
                    )}

                    <div className="flex flex-col gap-[5px]">
                      <SectionTitle>Profile</SectionTitle>
                      <SettingsCard>
                        <SettingRow label="Name" value={profile?.name || '—'} />
                        <SettingRow label="Email" value={profile?.email || '—'} />
                      </SettingsCard>
                    </div>

                    <button
                      onClick={() => Browser.OpenURL('https://console.alisx.com/profile')}
                      className="flex items-center gap-[5px] text-[11px] text-foreground/30 hover:text-foreground/55 transition-colors font-mono"
                    >
                      <Icon icon="solar:link-square-linear" className="text-sm" />
                      Edit profile on console.alisx.com
                    </button>
                  </div>
                )}

                {/* ── Appearance ── */}
                {activeTab === 'appearance' && (
                  <div className="p-[14px] flex flex-col gap-[12px]">
                    <div className="flex flex-col gap-[5px]">
                      <SectionTitle>Theme</SectionTitle>
                      <SettingsCard>
                        <SettingRow label="Mode">
                          <div className="flex items-center gap-[2px] bg-foreground/[0.06] rounded-[6px] p-[2px]">
                            <button
                              onClick={() => setTheme('light')}
                              className={`px-[8px] py-[3px] rounded-[4px] text-[10px] font-mono transition-colors ${theme === 'light' ? 'bg-foreground/[0.1] text-foreground' : 'text-foreground/35 hover:text-foreground/70'}`}
                            >
                              Light
                            </button>
                            <button
                              onClick={() => setTheme('dark')}
                              className={`px-[8px] py-[3px] rounded-[4px] text-[10px] font-mono transition-colors ${theme === 'dark' ? 'bg-foreground/[0.1] text-foreground' : 'text-foreground/35 hover:text-foreground/70'}`}
                            >
                              Dark
                            </button>
                            <button
                              onClick={() => setTheme('system')}
                              className={`px-[8px] py-[3px] rounded-[4px] text-[10px] font-mono transition-colors ${theme === 'system' ? 'bg-foreground/[0.1] text-foreground' : 'text-foreground/35 hover:text-foreground/70'}`}
                            >
                              System
                            </button>
                          </div>
                        </SettingRow>
                      </SettingsCard>
                    </div>

                    <div className="flex flex-col gap-[5px]">
                      <SectionTitle>Accent color</SectionTitle>
                      <SettingsCard>
                        <div className="px-[12px] py-[11px] flex items-center gap-[10px] flex-wrap">
                          {ACCENT_COLORS.map(color => (
                            <button
                              key={color.id}
                              title={color.label}
                              onClick={() => setAccent(color.id)}
                              className="relative w-[24px] h-[24px] rounded-full transition-transform hover:scale-110 shrink-0 focus:outline-none"
                              style={{ background: color.brand }}
                            >
                              {accentId === color.id && (
                                <span className="absolute inset-0 flex items-center justify-center">
                                  <Icon icon="solar:check-bold" className="text-[11px]" style={{ color: color.brandFg }} />
                                </span>
                              )}
                              {accentId === color.id && (
                                <span className="absolute inset-[-3px] rounded-full border-[1.5px] pointer-events-none" style={{ borderColor: color.brand }} />
                              )}
                            </button>
                          ))}

                          {/* Custom color */}
                          <label
                            title="Custom color"
                            className="relative w-[24px] h-[24px] rounded-full cursor-pointer hover:scale-110 transition-transform shrink-0 overflow-hidden"
                            style={
                              accentId === 'custom'
                                ? { background: customHex }
                                : { background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }
                            }
                          >
                            {accentId === 'custom' && (
                              <span className="absolute inset-0 flex items-center justify-center">
                                <Icon icon="solar:check-bold" className="text-[11px]" style={{ color: contrastForCustom(customHex) }} />
                              </span>
                            )}
                            {accentId === 'custom' && (
                              <span className="absolute inset-[-3px] rounded-full border-[1.5px] pointer-events-none" style={{ borderColor: customHex }} />
                            )}
                            <input
                              type="color"
                              value={customHex}
                              onChange={e => setCustomAccent(e.target.value)}
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            />
                          </label>
                        </div>
                      </SettingsCard>
                    </div>
                  </div>
                )}

                {/* ── Notifications ── */}
                {activeTab === 'notifications' && (
                  <div className="p-[14px] flex flex-col gap-[12px]">
                    <div className="flex flex-col gap-[5px]">
                      <SectionTitle>System</SectionTitle>
                      <SettingsCard>
                        <SettingRow label="System notifications">
                          <button
                            onClick={handleSysNotifToggle}
                            className={`relative w-[32px] h-[18px] rounded-full transition-colors shrink-0 ${sysNotifications ? 'bg-success' : 'bg-foreground/[0.1]'}`}
                          >
                            <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${sysNotifications ? 'left-[16px]' : 'left-[2px]'}`} />
                          </button>
                        </SettingRow>
                      </SettingsCard>
                    </div>
                  </div>
                )}

                {/* ── Labs ── */}
                {activeTab === 'labs' && (
                  <div className="p-[14px] flex flex-col gap-[12px]">
                    <div className="flex flex-col gap-[5px]">
                      <SectionTitle>Local AI</SectionTitle>
                      <LocalAISetupCard />
                    </div>

                    <div className="flex flex-col gap-[5px]">
                      <SectionTitle>Smart Suggestions</SectionTitle>
                      <SettingsCard>
                        <SettingRow label="Smart Suggestions">
                          <button
                            onClick={() => setMasterEnabled(!labsState.masterEnabled)}
                            className={`relative w-[32px] h-[18px] rounded-full transition-colors shrink-0 ${labsState.masterEnabled ? 'bg-success' : 'bg-foreground/[0.1]'}`}
                          >
                            <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${labsState.masterEnabled ? 'left-[16px]' : 'left-[2px]'}`} />
                          </button>
                        </SettingRow>
                      </SettingsCard>
                    </div>

                    {SUGGESTION_CATEGORY_ORDER.filter(c => groupedRegistry[c]?.length).map(category => (
                      <div key={category} className="flex flex-col gap-[5px]">
                        <SectionTitle>{category}</SectionTitle>
                        <SettingsCard>
                          {groupedRegistry[category]!.map(def => (
                            <SettingRow key={def.id} label={def.title}>
                              <button
                                onClick={() => setSuggestionEnabled(def.id, !isSuggestionEnabled(def.id))}
                                disabled={!labsState.masterEnabled}
                                className={`relative w-[32px] h-[18px] rounded-full transition-colors shrink-0 disabled:opacity-40 ${isSuggestionEnabled(def.id) ? 'bg-success' : 'bg-foreground/[0.1]'}`}
                                title={def.description}
                              >
                                <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${isSuggestionEnabled(def.id) ? 'left-[16px]' : 'left-[2px]'}`} />
                              </button>
                            </SettingRow>
                          ))}
                        </SettingsCard>
                      </div>
                    ))}

                    <p className="text-[10px] text-foreground/25 font-mono leading-relaxed">
                      Labs features are experimental and may change without notice.
                    </p>
                  </div>
                )}

                {/* ── Updates ── */}
                {activeTab === 'updates' && (
                  <div className="p-[14px] flex flex-col gap-[12px]">
                    <div className="flex items-center gap-[10px] p-[12px] bg-foreground/[0.04] rounded-[9px] border border-border">
                      <div className="size-[34px] rounded-[8px] bg-[rgba(248,129,169,0.12)] border border-[rgba(248,129,169,0.2)] flex items-center justify-center shrink-0">
                        <Icon icon="solar:cloud-bold" className="text-brand text-base" />
                      </div>
                      <div>
                        <p className="text-[13px] font-bold text-foreground tracking-[-0.2px]">AlisHub</p>
                        <p className="text-[11px] text-foreground/40 font-mono mt-[1px]">
                          v{appInfo?.version || updateInfo?.currentVersion || '—'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-[5px]">
                      <SectionTitle>Version</SectionTitle>
                      <SettingsCard>
                        <SettingRow label="Current version" value={updateInfo?.currentVersion || appInfo?.version || '—'} />
                        <SettingRow label="OS" value={appInfo ? `${appInfo.os}/${appInfo.arch}` : '—'} />
                        <SettingRow label="Go" value={appInfo?.go || '—'} />
                        {updateInfo?.available && (
                          <SettingRow label="Latest version">
                            <span className="text-[11px] font-bold text-success font-mono">
                              v{updateInfo.latestVersion}
                            </span>
                          </SettingRow>
                        )}
                      </SettingsCard>
                    </div>

                    {updateError && (
                      <p className="text-[10px] text-destructive font-mono">{updateError}</p>
                    )}

                    {updateInfo?.available && (
                      <div className="flex items-center justify-between bg-[rgba(52,199,89,0.08)] border border-[rgba(52,199,89,0.2)] rounded-[9px] px-[12px] py-[9px]">
                        <div className="flex items-center gap-[8px]">
                          <Icon icon="solar:download-minimalistic-linear" className="text-success text-base" />
                          <div>
                            <p className="text-[11px] font-bold text-foreground">Update available</p>
                            <p className="text-[10px] text-foreground/50 font-mono mt-[1px]">
                              v{updateInfo.currentVersion} → v{updateInfo.latestVersion}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-[6px]">
                          <button
                            onClick={() => setNotesOpen(true)}
                            className="text-[10px] text-foreground/40 hover:text-foreground transition-colors font-mono uppercase tracking-wide"
                          >
                            Notes
                          </button>
                          {!downloading ? (
                            <button
                              onClick={handleDownload}
                              className="text-[10px] font-bold bg-success text-black px-[8px] py-[4px] rounded-full font-mono uppercase tracking-wide"
                            >
                              Download
                            </button>
                          ) : (
                            <button
                              onClick={handleApply}
                              className="text-[10px] font-bold bg-success text-black px-[8px] py-[4px] rounded-full font-mono"
                            >
                              {downloadPct < 100 ? `${downloadPct}%` : 'Apply & Restart'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {updateInfo && !updateInfo.available && (
                      <div className="flex items-center gap-[8px] px-[12px] py-[9px] bg-[rgba(52,199,89,0.06)] border border-[rgba(52,199,89,0.18)] rounded-[9px]">
                        <Icon icon="solar:check-circle-linear" className="text-success text-base shrink-0" />
                        <p className="text-[11px] text-foreground/70 font-mono">You're on the latest version.</p>
                      </div>
                    )}

                    <button
                      onClick={handleCheckUpdate}
                      disabled={checkingUpdate}
                      className="flex items-center justify-center gap-[7px] h-[32px] rounded-[7px] bg-foreground/[0.05] hover:bg-foreground/[0.08] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-[11px] text-foreground/70 font-mono"
                    >
                      {checkingUpdate ? <Loader size={14} /> : <Icon icon="solar:refresh-linear" className="text-sm" />}
                      {checkingUpdate ? 'Checking…' : 'Check for updates'}
                    </button>

                    {changelogHtml && (
                      <div className="flex flex-col gap-[5px]">
                        <SectionTitle>Changelog</SectionTitle>
                        <div
                          className="prose prose-invert prose-sm max-w-none font-mono text-[12px] text-foreground/75 [&_h3]:text-[10px] [&_h3]:uppercase [&_h3]:tracking-wide [&_h3]:text-foreground/35 [&_h3]:mt-[12px] [&_h3]:mb-[4px] [&_ul]:pl-4 [&_li]:my-[2px] [&_p]:text-foreground/55"
                          dangerouslySetInnerHTML={{ __html: changelogHtml }}
                        />
                      </div>
                    )}

                    <div className="flex flex-col gap-[5px] pt-[2px]">
                      <button
                        onClick={() => Browser.OpenURL('https://github.com/Patrick-web/alis-hub-v3')}
                        className="flex items-center gap-[5px] text-[11px] text-foreground/30 hover:text-foreground/55 transition-colors font-mono"
                      >
                        <Icon icon="solar:link-square-linear" className="text-sm" />
                        View on GitHub
                      </button>
                      <button
                        onClick={() => Browser.OpenURL('https://console.alisx.com')}
                        className="flex items-center gap-[5px] text-[11px] text-foreground/30 hover:text-foreground/55 transition-colors font-mono"
                      >
                        <Icon icon="solar:link-square-linear" className="text-sm" />
                        Alis Console
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Source Control ── */}
                {activeTab === 'source-control' && (
                  <div className="p-[14px] flex flex-col gap-[12px]">
                    <div className="flex flex-col gap-[5px]">
                      <SectionTitle>File List</SectionTitle>
                      <SettingsCard>
                        <SettingRow label="View">
                          <div className="flex items-center gap-[2px] bg-foreground/[0.06] rounded-[6px] p-[2px]">
                            <button
                              onClick={() => setFileListView('list')}
                              className={`px-[8px] py-[3px] rounded-[4px] text-[10px] font-mono transition-colors ${scState.fileListView === 'list' ? 'bg-foreground/[0.1] text-foreground' : 'text-foreground/35 hover:text-foreground/70'}`}
                            >
                              List
                            </button>
                            <button
                              onClick={() => setFileListView('tree')}
                              className={`px-[8px] py-[3px] rounded-[4px] text-[10px] font-mono transition-colors ${scState.fileListView === 'tree' ? 'bg-foreground/[0.1] text-foreground' : 'text-foreground/35 hover:text-foreground/70'}`}
                            >
                              Tree
                            </button>
                          </div>
                        </SettingRow>
                      </SettingsCard>
                    </div>

                    <div className="flex flex-col gap-[5px]">
                      <SectionTitle>Diff Viewer</SectionTitle>
                      <SettingsCard>
                        <SettingRow label="Mode">
                          <div className="flex items-center gap-[2px] bg-foreground/[0.06] rounded-[6px] p-[2px]">
                            <button
                              onClick={() => setDiffView('unified')}
                              className={`px-[8px] py-[3px] rounded-[4px] text-[10px] font-mono transition-colors ${scState.diffView === 'unified' ? 'bg-foreground/[0.1] text-foreground' : 'text-foreground/35 hover:text-foreground/70'}`}
                            >
                              Unified
                            </button>
                            <button
                              onClick={() => setDiffView('split')}
                              className={`px-[8px] py-[3px] rounded-[4px] text-[10px] font-mono transition-colors ${scState.diffView === 'split' ? 'bg-foreground/[0.1] text-foreground' : 'text-foreground/35 hover:text-foreground/70'}`}
                            >
                              Split
                            </button>
                          </div>
                        </SettingRow>
                      </SettingsCard>
                    </div>
                  </div>
                )}

                {/* ── Develop ── */}
                {activeTab === 'develop' && (
                  <div className="p-[14px] flex flex-col gap-[12px]">
                    {state.organisation && state.product && (
                      <p className="text-[10px] font-mono text-foreground/30 px-[1px]">
                        Settings for {state.organisation}/{state.product}
                      </p>
                    )}

                    <div className="flex flex-col gap-[5px]">
                      <SectionTitle>Folder Scanning</SectionTitle>
                      <SettingsCard>
                        <SettingRow label="Ignore hidden folders">
                          <button
                            onClick={() => setIgnoreHiddenFolders(!devSettings.ignoreHiddenFolders)}
                            className={`relative w-[32px] h-[18px] rounded-full transition-colors shrink-0 ${devSettings.ignoreHiddenFolders ? 'bg-success' : 'bg-foreground/[0.1]'}`}
                          >
                            <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${devSettings.ignoreHiddenFolders ? 'left-[16px]' : 'left-[2px]'}`} />
                          </button>
                        </SettingRow>
                      </SettingsCard>
                      <div className="flex flex-col gap-[4px]">
                        <span className="text-[9px] font-mono uppercase tracking-[1.5px] text-foreground/25 px-[2px]">
                          Ignored folder patterns
                        </span>
                        <SettingsCard>
                          <textarea
                            value={devSettings.ignoredFolderPatterns.join('\n')}
                            onChange={e => {
                              const lines = e.target.value.split('\n').map(l => l.trim()).filter(Boolean);
                              setIgnoredFolderPatterns(lines);
                            }}
                            placeholder={"node_modules\nbuild\ndist"}
                            rows={4}
                            spellCheck={false}
                            className="w-full bg-transparent text-[11px] font-mono text-foreground/70 placeholder:text-foreground/20 px-[12px] py-[9px] resize-none outline-none"
                          />
                        </SettingsCard>
                        <p className="text-[10px] text-foreground/25 font-mono px-[1px]">One folder name or glob per line.</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-[5px]">
                      <SectionTitle>Git</SectionTitle>
                      <SettingsCard>
                        <SettingRow label="Default branch">
                          <div className="flex items-center gap-[6px]">
                            <div className="flex items-center gap-[2px] bg-foreground/[0.06] rounded-[6px] p-[2px]">
                              <button
                                onClick={() => setDefaultBranch('local')}
                                className={`px-[8px] py-[3px] rounded-[4px] text-[10px] font-mono transition-colors ${devSettings.defaultBranch === 'local' ? 'bg-foreground/[0.1] text-foreground' : 'text-foreground/35 hover:text-foreground/70'}`}
                              >
                                Local
                              </button>
                              <button
                                onClick={() => {
                                  if (devSettings.defaultBranch === 'local') {
                                    setDefaultBranch(availableBranches[0] || 'master');
                                  }
                                }}
                                className={`px-[8px] py-[3px] rounded-[4px] text-[10px] font-mono transition-colors ${devSettings.defaultBranch !== 'local' ? 'bg-foreground/[0.1] text-foreground' : 'text-foreground/35 hover:text-foreground/70'}`}
                              >
                                Custom
                              </button>
                            </div>
                            {devSettings.defaultBranch !== 'local' && (
                              <SearchableSelect
                                value={devSettings.defaultBranch}
                                options={availableBranches.length > 0 ? availableBranches : [devSettings.defaultBranch]}
                                onChange={setDefaultBranch}
                                placeholder="Select branch…"
                                className="w-[130px]"
                              />
                            )}
                          </div>
                        </SettingRow>
                      </SettingsCard>
                    </div>

                    <div className="flex flex-col gap-[5px]">
                      <SectionTitle>Smart Sort</SectionTitle>
                      <SettingsCard>
                        <SettingRow label="Smart Sort">
                          <button
                            onClick={() => setSmartSortEnabled(!devSettings.smartSortEnabled)}
                            className={`relative w-[32px] h-[18px] rounded-full transition-colors shrink-0 ${devSettings.smartSortEnabled ? 'bg-success' : 'bg-foreground/[0.1]'}`}
                          >
                            <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${devSettings.smartSortEnabled ? 'left-[16px]' : 'left-[2px]'}`} />
                          </button>
                        </SettingRow>
                        {devSettings.smartSortEnabled && (
                          <SettingRow label="Sort by">
                            <div className="flex items-center gap-[2px] bg-foreground/[0.06] rounded-[6px] p-[2px]">
                              {(['defined', 'built', 'deployed', 'committed'] as SmartSortKey[]).map(k => (
                                <button
                                  key={k}
                                  onClick={() => setSmartSortKey(k)}
                                  className={`px-[8px] py-[3px] rounded-[4px] text-[10px] font-mono transition-colors ${devSettings.smartSortKey === k ? 'bg-foreground/[0.1] text-foreground' : 'text-foreground/35 hover:text-foreground/70'}`}
                                >
                                  {k.charAt(0).toUpperCase() + k.slice(1)}
                                </button>
                              ))}
                            </div>
                          </SettingRow>
                        )}
                      </SettingsCard>
                      <p className="text-[10px] text-foreground/25 font-mono leading-relaxed">
                        Sorts services by the most recently touched, based on local activity or git history.
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Tools ── */}
                {activeTab === 'tools' && (
                  <div className="p-[14px] flex flex-col gap-[12px]">
                    {state.organisation && state.product && (
                      <p className="text-[10px] font-mono text-foreground/30 px-[1px]">
                        Settings for {state.organisation}/{state.product}
                      </p>
                    )}
                    <div className="flex flex-col gap-[5px]">
                      <SectionTitle>Tool Context Defaults</SectionTitle>
                      <p className="text-[10px] text-foreground/25 font-mono px-[1px] pb-[2px]">
                        Set which project level each tool opens at by default.
                      </p>
                      <SettingsCard>
                        {TOOL_SETTINGS.map(tool => {
                          const current = getToolDefault(state.organisation ?? '', state.product ?? '', tool.id);
                          return (
                            <SettingRow key={tool.id} label={tool.label}>
                              <div className="flex items-center gap-[2px] bg-foreground/[0.06] rounded-[6px] p-[2px]">
                                {(['org', 'product', 'env'] as const).map(level => {
                                  const levelLabel = level === 'org' ? 'Org' : level === 'product' ? 'Product' : 'Env';
                                  const isActive = current === level;
                                  return (
                                    <button
                                      key={level}
                                      onClick={() => handleToolDefaultChange(tool.id, level)}
                                      className={`px-[8px] py-[3px] rounded-[4px] text-[10px] font-mono transition-colors ${isActive ? 'bg-foreground/[0.1] text-foreground' : 'text-foreground/35 hover:text-foreground/70'}`}
                                    >
                                      {levelLabel}
                                    </button>
                                  );
                                })}
                              </div>
                            </SettingRow>
                          );
                        })}
                      </SettingsCard>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>

      {updateInfo?.available && (
        <ReleaseNotesModal
          open={notesOpen}
          onOpenChange={setNotesOpen}
          currentVersion={updateInfo.currentVersion}
          latestVersion={updateInfo.latestVersion}
          releaseNotes={updateInfo.releaseNotes}
          releaseUrl={updateInfo.releaseUrl}
        />
      )}
    </>
  );
}
