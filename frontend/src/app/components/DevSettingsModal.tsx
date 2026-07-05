import { useState } from 'react';
import { Icon } from '@iconify/react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogPortal, DialogOverlay } from './ui/dialog';
import { useDevSettingsModal, type DevSettingsTab } from '../stores/devSettingsModal';
import { usePlatform, type PlatformOverride } from '../stores/platform';
import { useLocalAI } from '../stores/localai';
import { SettingRow, SectionTitle, SettingsCard } from './ProfileModal';
import { NotificationsDebugPage } from '../pages/NotificationsDebugPage';
import { Loader } from './Loader';

const SIDEBAR_ITEMS: { id: DevSettingsTab; label: string; icon: string }[] = [
  { id: 'platform', label: 'Title Bar', icon: 'solar:window-frame-linear' },
  { id: 'notifications', label: 'Notifications', icon: 'solar:bell-bing-linear' },
  { id: 'ai', label: 'Local AI', icon: 'solar:cpu-bolt-linear' },
];

const OVERRIDE_OPTIONS: { id: PlatformOverride; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'darwin', label: 'macOS' },
  { id: 'windows', label: 'Windows' },
];

// Inert, icon-only previews — deliberately NOT the real MacWindowControls /
// WindowsWindowControls, which wire up Window.Close()/Minimise() and (for
// Windows) a live maximise-state subscription. A "preview" must not be able
// to actually close or minimise the app.
function MacControlsPreview() {
  return (
    <div className="flex items-center gap-[6px]">
      <span className="w-[12px] h-[12px] rounded-full bg-destructive/70" />
      <span className="w-[12px] h-[12px] rounded-full bg-warning/70" />
      <span className="w-[12px] h-[12px] rounded-full bg-success/70" />
    </div>
  );
}

function WindowsControlsPreview() {
  return (
    <div className="flex items-stretch h-[28px]">
      <div className="flex items-center justify-center w-[36px] h-full text-foreground/50">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <line x1="0" y1="7" x2="10" y2="7" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      </div>
      <div className="flex items-center justify-center w-[36px] h-full text-foreground/50">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      </div>
      <div className="flex items-center justify-center w-[36px] h-full text-foreground/50">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      </div>
    </div>
  );
}

function LocalAITestTab() {
  const { state, generate } = useLocalAI();
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful assistant.');
  const [userPrompt, setUserPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  const ready = state.ollamaRunning && state.modelPulled;

  async function handleRun() {
    setRunning(true);
    setError(null);
    setResponse(null);
    setElapsedMs(null);
    const start = performance.now();
    try {
      const result = await generate(state.model, systemPrompt, userPrompt);
      setResponse(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setElapsedMs(Math.round(performance.now() - start));
      setRunning(false);
    }
  }

  return (
    <div className="p-[14px] flex flex-col gap-[12px]">
      <div className="flex flex-col gap-[5px]">
        <SectionTitle>Status</SectionTitle>
        <SettingsCard>
          <SettingRow label="Enabled" value={state.enabled ? 'Yes' : 'No'} />
          <SettingRow label="Model" value={state.model} />
          <SettingRow label="Ollama running" value={state.ollamaRunning ? 'Yes' : 'No'} />
          <SettingRow label="Model pulled" value={state.modelPulled ? 'Yes' : 'No'} />
        </SettingsCard>
        {!ready && (
          <p className="text-[10px] text-warning font-mono leading-relaxed">
            Local AI isn't ready — set it up in Settings → Labs first.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-[5px]">
        <SectionTitle>System prompt</SectionTitle>
        <SettingsCard>
          <textarea
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            rows={2}
            spellCheck={false}
            className="w-full bg-transparent text-[11px] font-mono text-foreground/70 placeholder:text-foreground/20 px-[12px] py-[9px] resize-none outline-none"
          />
        </SettingsCard>
      </div>

      <div className="flex flex-col gap-[5px]">
        <SectionTitle>User prompt</SectionTitle>
        <SettingsCard>
          <textarea
            value={userPrompt}
            onChange={e => setUserPrompt(e.target.value)}
            placeholder="Ask something…"
            rows={3}
            spellCheck={false}
            className="w-full bg-transparent text-[11px] font-mono text-foreground/70 placeholder:text-foreground/20 px-[12px] py-[9px] resize-none outline-none"
          />
        </SettingsCard>
      </div>

      <button
        onClick={handleRun}
        disabled={!ready || running || !userPrompt.trim()}
        className="flex items-center justify-center gap-[7px] h-[32px] rounded-[7px] bg-foreground/[0.05] hover:bg-foreground/[0.08] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-[11px] text-foreground/70 font-mono"
      >
        {running ? <Loader size={14} /> : <Icon icon="solar:play-circle-linear" className="text-sm" />}
        {running ? 'Running…' : 'Run'}
      </button>

      {(response || error) && (
        <div className="flex flex-col gap-[5px]">
          <div className="flex items-center justify-between">
            <SectionTitle>{error ? 'Error' : 'Response'}</SectionTitle>
            {elapsedMs !== null && (
              <span className="text-[9px] text-foreground/25 font-mono">{elapsedMs}ms</span>
            )}
          </div>
          <SettingsCard>
            <pre className={`whitespace-pre-wrap break-words text-[11px] font-mono px-[12px] py-[9px] max-h-[200px] overflow-y-auto ${error ? 'text-destructive' : 'text-foreground/75'}`}>
              {error || response}
            </pre>
          </SettingsCard>
        </div>
      )}
    </div>
  );
}

export function DevSettingsModal() {
  const { isOpen, activeTab, close, open } = useDevSettingsModal();
  const { real, envInfo, override, effective, setOverride } = usePlatform();

  return (
    <Dialog open={isOpen} onOpenChange={v => (v ? open() : close())}>
      <DialogPortal>
        <DialogOverlay className="bg-black/25" />

        <DialogPrimitive.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-[840px] rounded-[14px] overflow-hidden text-foreground
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
              Developer Settings
            </span>
            <div className="w-[52px] flex justify-end">
              <button
                onClick={close}
                className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.07] transition-colors"
              >
                <Icon icon="solar:close-circle-linear" className="text-[15px]" />
              </button>
            </div>
          </div>

          <div className="flex min-h-[440px]">

            {/* Sidebar */}
            <div className="w-[160px] border-r border-border flex flex-col shrink-0">
              <div className="px-[12px] pt-[10px] pb-[3px]">
                <span className="text-[9px] font-mono uppercase tracking-[1.5px] text-foreground/20">
                  Developer
                </span>
              </div>
              {SIDEBAR_ITEMS.map(item => (
                <button
                  key={item.id}
                  onClick={() => open(item.id)}
                  className={`flex items-center gap-[8px] text-left mx-[5px] px-[9px] py-[7px] rounded-[7px] transition-colors ${
                    activeTab === item.id ? 'bg-foreground/[0.07]' : 'hover:bg-foreground/[0.04]'
                  }`}
                  style={{ width: 'calc(100% - 10px)' }}
                >
                  <Icon
                    icon={item.icon}
                    className={`text-[15px] shrink-0 ${activeTab === item.id ? 'text-foreground/90' : 'text-foreground/35'}`}
                  />
                  <span className={`text-[12px] font-medium ${activeTab === item.id ? 'text-foreground/90' : 'text-foreground/45'}`}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">

              {/* ── Title Bar ── */}
              {activeTab === 'platform' && (
                <div className="p-[14px] flex flex-col gap-[12px]">
                  <div className="flex flex-col gap-[5px]">
                    <SectionTitle>Diagnostics</SectionTitle>
                    <SettingsCard>
                      <SettingRow label="Detected platform" value={real} />
                      <SettingRow label="Raw OS (backend)" value={envInfo?.OS ?? 'pending…'} />
                    </SettingsCard>
                  </div>

                  <div className="flex flex-col gap-[5px]">
                    <SectionTitle>Title bar preview</SectionTitle>
                    <SettingsCard>
                      <SettingRow label="Render as">
                        <div className="flex items-center gap-[2px] bg-foreground/[0.06] rounded-[6px] p-[2px]">
                          {OVERRIDE_OPTIONS.map(opt => (
                            <button
                              key={opt.id}
                              onClick={() => setOverride(opt.id)}
                              className={`px-[8px] py-[3px] rounded-[4px] text-[10px] font-mono transition-colors ${override === opt.id ? 'bg-foreground/[0.1] text-foreground' : 'text-foreground/35 hover:text-foreground/70'}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </SettingRow>
                    </SettingsCard>
                    <div className="flex items-center justify-center bg-foreground/[0.03] border border-border rounded-[9px] py-[16px]">
                      {effective === 'windows' ? <WindowsControlsPreview /> : <MacControlsPreview />}
                    </div>
                    <p className="text-[10px] text-foreground/25 font-mono leading-relaxed">
                      Overrides which title bar chrome renders across the app, for previewing Windows
                      controls without Windows hardware. Persisted locally — doesn't change the real OS.
                    </p>
                  </div>
                </div>
              )}

              {/* ── Notifications ── */}
              {activeTab === 'notifications' && (
                <NotificationsDebugPage />
              )}

              {/* ── Local AI ── */}
              {activeTab === 'ai' && <LocalAITestTab />}

            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
