import { useState, useEffect, useMemo } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { marked } from 'marked';
import { Loader } from './Loader';
import { Icon } from '@iconify/react';
import { Browser, Events } from '@wailsio/runtime';
import { isSystemNotificationsEnabled, setSystemNotificationsEnabled, requestNotificationAuthorization } from '../lib/systemNotify';
import {
  Dialog,
  DialogContent,
} from './ui/dialog';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';
import * as UpdaterService from '../../../bindings/alis-hub-v3/internal/updater/service';
import * as ChangelogService from '../../../bindings/alis-hub-v3/changelogservice';
import { useWorkspace } from '../stores/workspace';
import { useLabs, SUGGESTION_REGISTRY, SUGGESTION_CATEGORY_ORDER, type SuggestionCategory } from '../stores/labs';
import { ReleaseNotesModal } from './ReleaseNotesModal';

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Tab = 'profile' | 'updates' | 'about' | 'changelog' | 'labs';

interface UserProfile {
  email: string;
  name: string;
  picture: string;
}

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
    <div className="flex items-center justify-between px-[14px] py-[10px] border-b border-border last:border-0">
      <span className="text-[11px] text-foreground/50 font-mono uppercase tracking-wide">{label}</span>
      {value && <span className="text-[11px] text-foreground font-mono">{value}</span>}
      {children}
    </div>
  );
}

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { setPhase } = useWorkspace();
  const { resolvedTheme, setTheme } = useTheme();
  const { state: labsState, isSuggestionEnabled, setSuggestionEnabled, setMasterEnabled } = useLabs();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

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
    if (!open) return;
    ProductService.GetUserProfile().then((p: any) => {
      if (p) setProfile(p);
    }).catch((e: any) => setProfileError(String(e)));

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
      onOpenChange(false);
      setPhase('login');
    } catch (e) {
      setLoggingOut(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'profile', label: 'Profile', icon: 'solar:user-circle-linear' },
    { id: 'updates', label: 'Updates', icon: 'solar:refresh-circle-linear' },
    { id: 'about', label: 'About', icon: 'solar:info-circle-linear' },
    { id: 'changelog', label: 'Changelog', icon: 'solar:history-linear' },
    { id: 'labs', label: 'Labs', icon: 'solar:test-tube-linear' },
  ];

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
        <DialogContent className="bg-card border border-border text-foreground p-0 max-w-[520px] overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-[10px] px-[16px] pt-[16px] pb-[12px] border-b border-border">
            <Icon icon="solar:user-circle-bold" className="text-brand text-xl" />
            <span className="text-[13px] font-bold text-foreground font-mono">Profile & Settings</span>
          </div>

          <div className="flex min-h-[380px]">
            {/* Sidebar tabs */}
            <div className="w-[130px] border-r border-border flex flex-col pt-[8px] shrink-0">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-[8px] px-[12px] py-[9px] text-left transition-colors ${
                    activeTab === tab.id
                      ? 'bg-[rgba(248,129,169,0.1)] text-brand'
                      : 'text-foreground/50 hover:text-foreground hover:bg-foreground/[4%]'
                  }`}
                >
                  <Icon icon={tab.icon} className="text-base shrink-0" />
                  <span className="text-[11px] font-mono">{tab.label}</span>
                </button>
              ))}

              <div className="flex-1" />

              {/* Sign out at bottom of sidebar */}
              <div className="p-[10px] border-t border-border">
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="flex items-center gap-[7px] w-full px-[8px] py-[7px] rounded text-[rgba(255,92,95,0.8)] hover:text-destructive hover:bg-[rgba(255,92,95,0.08)] transition-colors disabled:opacity-50"
                >
                  <Icon icon="solar:logout-linear" className="text-base shrink-0" />
                  <span className="text-[11px] font-mono">Sign out</span>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'profile' && (
                <div className="p-[16px] flex flex-col gap-[16px]">
                  {/* Avatar + name block */}
                  <div className="flex items-center gap-[14px]">
                    <Avatar name={profile?.name || ''} picture={profile?.picture || ''} size={52} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-foreground truncate">{profile?.name || '—'}</p>
                      <p className="text-[11px] text-foreground/50 font-mono truncate mt-[2px]">{profile?.email || '—'}</p>
                    </div>
                  </div>

                  {profileError && (
                    <p className="text-[10px] text-destructive font-mono">{profileError}</p>
                  )}

                  {/* Profile fields */}
                  <div className="bg-background rounded-[8px] border border-border overflow-hidden">
                    <SettingRow label="Name" value={profile?.name || '—'} />
                    <SettingRow label="Email" value={profile?.email || '—'} />
                  </div>

                  {/* Preferences */}
                  <div className="bg-background rounded-[8px] border border-border overflow-hidden">
                    <SettingRow label="Appearance">
                      <div className="flex items-center gap-[2px] bg-accent rounded-[6px] p-[2px]">
                        <button
                          onClick={() => setTheme('light')}
                          className={`flex items-center gap-[5px] px-[8px] py-[4px] rounded-[4px] text-[10px] font-mono transition-colors ${resolvedTheme === 'light' ? 'bg-card text-foreground shadow-sm' : 'text-foreground/40 hover:text-foreground'}`}
                          title="Light mode"
                        >
                          <Sun size={11} />
                          Light
                        </button>
                        <button
                          onClick={() => setTheme('dark')}
                          className={`flex items-center gap-[5px] px-[8px] py-[4px] rounded-[4px] text-[10px] font-mono transition-colors ${resolvedTheme === 'dark' ? 'bg-card text-foreground shadow-sm' : 'text-foreground/40 hover:text-foreground'}`}
                          title="Dark mode"
                        >
                          <Moon size={11} />
                          Dark
                        </button>
                      </div>
                    </SettingRow>
                    <SettingRow label="System notifications">
                      <button
                        onClick={handleSysNotifToggle}
                        className={`relative w-[32px] h-[18px] rounded-full transition-colors shrink-0 ${sysNotifications ? 'bg-success' : 'bg-accent'}`}
                        title={sysNotifications ? 'Disable system notifications' : 'Enable system notifications'}
                      >
                        <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${sysNotifications ? 'left-[16px]' : 'left-[2px]'}`} />
                      </button>
                    </SettingRow>
                  </div>

                  {/* Edit profile link */}
                  <button
                    onClick={() => Browser.OpenURL('https://console.alisx.com/profile')}
                    className="flex items-center gap-[6px] text-[11px] text-foreground/40 hover:text-foreground transition-colors font-mono"
                  >
                    <Icon icon="solar:link-square-linear" className="text-sm" />
                    Edit profile on console.alisx.com
                  </button>
                </div>
              )}

              {activeTab === 'updates' && (
                <div className="p-[16px] flex flex-col gap-[14px]">
                  <div className="bg-background rounded-[8px] border border-border overflow-hidden">
                    <SettingRow label="Current version" value={updateInfo?.currentVersion || appInfo?.version || '—'} />
                    {updateInfo?.available && (
                      <SettingRow label="Latest version">
                        <span className="text-[11px] font-bold text-success font-mono">
                          v{updateInfo.latestVersion}
                        </span>
                      </SettingRow>
                    )}
                  </div>

                  {updateError && (
                    <p className="text-[10px] text-destructive font-mono px-[2px]">{updateError}</p>
                  )}

                  {/* Update available banner */}
                  {updateInfo?.available && (
                    <div className="flex items-center justify-between bg-[rgba(52,199,89,0.08)] border border-[rgba(52,199,89,0.25)] rounded-[8px] px-[14px] py-[10px]">
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
                            className="text-[10px] font-bold bg-success text-black px-[8px] py-[4px] rounded-full hover:bg-success transition-colors font-mono uppercase tracking-wide"
                          >
                            Download
                          </button>
                        ) : (
                          <button
                            onClick={handleApply}
                            className="text-[10px] font-bold bg-success text-black px-[8px] py-[4px] rounded-full hover:bg-success transition-colors font-mono"
                          >
                            {downloadPct < 100 ? `${downloadPct}%` : 'Apply & Restart'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* No update available */}
                  {updateInfo && !updateInfo.available && (
                    <div className="flex items-center gap-[8px] px-[14px] py-[10px] bg-[rgba(52,199,89,0.06)] border border-[rgba(52,199,89,0.2)] rounded-[8px]">
                      <Icon icon="solar:check-circle-linear" className="text-success text-base shrink-0" />
                      <p className="text-[11px] text-foreground/70 font-mono">You're on the latest version.</p>
                    </div>
                  )}

                  <button
                    onClick={handleCheckUpdate}
                    disabled={checkingUpdate}
                    className="flex items-center justify-center gap-[8px] h-[34px] rounded-[6px] bg-accent hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-[11px] text-foreground font-mono"
                  >
                    {checkingUpdate ? (
                      <Loader size={16} />
                    ) : (
                      <Icon icon="solar:refresh-linear" className="text-base" />
                    )}
                    {checkingUpdate ? 'Checking…' : 'Check for updates'}
                  </button>
                </div>
              )}

              {activeTab === 'changelog' && (
                <div className="p-[16px] flex flex-col gap-[14px]">
                  <p className="text-[10px] font-bold text-foreground/30 font-mono uppercase tracking-wide">
                    v{appInfo?.version || updateInfo?.currentVersion || '—'}
                  </p>
                  {changelogHtml ? (
                    <div
                      className="prose prose-invert prose-sm max-w-none font-mono text-[12px] text-foreground/80 [&_h3]:text-[10px] [&_h3]:uppercase [&_h3]:tracking-wide [&_h3]:text-foreground/40 [&_h3]:mt-[12px] [&_h3]:mb-[4px] [&_ul]:pl-4 [&_li]:my-[2px] [&_p]:text-foreground/60"
                      dangerouslySetInnerHTML={{ __html: changelogHtml }}
                    />
                  ) : (
                    <p className="text-[11px] text-foreground/30 font-mono">No release notes for this version.</p>
                  )}
                </div>
              )}

              {activeTab === 'labs' && (
                <div className="p-[16px] flex flex-col gap-[16px]">
                  {/* Master toggle */}
                  <div className="bg-background rounded-[8px] border border-border overflow-hidden">
                    <SettingRow label="Smart Suggestions">
                      <button
                        onClick={() => setMasterEnabled(!labsState.masterEnabled)}
                        className={`relative w-[32px] h-[18px] rounded-full transition-colors shrink-0 ${labsState.masterEnabled ? 'bg-success' : 'bg-accent'}`}
                        title={labsState.masterEnabled ? 'Disable smart suggestions' : 'Enable smart suggestions'}
                      >
                        <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${labsState.masterEnabled ? 'left-[16px]' : 'left-[2px]'}`} />
                      </button>
                    </SettingRow>
                  </div>

                  {/* Per-category toggles */}
                  {SUGGESTION_CATEGORY_ORDER.filter(c => groupedRegistry[c]?.length).map(category => (
                    <div key={category} className="bg-background rounded-[8px] border border-border overflow-hidden">
                      <div className="px-[14px] py-[6px] border-b border-border">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-foreground/30 font-mono">
                          {category}
                        </span>
                      </div>
                      {groupedRegistry[category]!.map(def => (
                        <SettingRow key={def.id} label={def.title}>
                          <button
                            onClick={() => setSuggestionEnabled(def.id, !isSuggestionEnabled(def.id))}
                            disabled={!labsState.masterEnabled}
                            className={`relative w-[32px] h-[18px] rounded-full transition-colors shrink-0 disabled:opacity-40 ${isSuggestionEnabled(def.id) ? 'bg-success' : 'bg-accent'}`}
                            title={def.description}
                          >
                            <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${isSuggestionEnabled(def.id) ? 'left-[16px]' : 'left-[2px]'}`} />
                          </button>
                        </SettingRow>
                      ))}
                    </div>
                  ))}

                  <p className="text-[10px] text-foreground/25 font-mono leading-relaxed">
                    alis hub Labs features are experimental and may change without notice.
                  </p>
                </div>
              )}

              {activeTab === 'about' && (
                <div className="p-[16px] flex flex-col gap-[14px]">
                  <div className="flex items-center gap-[12px]">
                    <div className="size-[42px] rounded-[10px] bg-[rgba(248,129,169,0.12)] border border-[rgba(248,129,169,0.25)] flex items-center justify-center shrink-0">
                      <Icon icon="solar:cloud-bold" className="text-brand text-xl" />
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-foreground">AlisHub</p>
                      <p className="text-[11px] text-foreground/40 font-mono mt-[2px]">
                        v{appInfo?.version || updateInfo?.currentVersion || '—'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-background rounded-[8px] border border-border overflow-hidden">
                    <SettingRow label="Version" value={appInfo?.version || '—'} />
                    <SettingRow label="OS" value={appInfo ? `${appInfo.os}/${appInfo.arch}` : '—'} />
                    <SettingRow label="Go" value={appInfo?.go || '—'} />
                  </div>

                  <div className="flex flex-col gap-[6px]">
                    <button
                      onClick={() => Browser.OpenURL('https://github.com/Patrick-web/alis-hub-v3')}
                      className="flex items-center gap-[6px] text-[11px] text-foreground/40 hover:text-foreground transition-colors font-mono"
                    >
                      <Icon icon="solar:link-square-linear" className="text-sm" />
                      View on GitHub
                    </button>
                    <button
                      onClick={() => Browser.OpenURL('https://console.alisx.com')}
                      className="flex items-center gap-[6px] text-[11px] text-foreground/40 hover:text-foreground transition-colors font-mono"
                    >
                      <Icon icon="solar:link-square-linear" className="text-sm" />
                      Alis Console
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
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
