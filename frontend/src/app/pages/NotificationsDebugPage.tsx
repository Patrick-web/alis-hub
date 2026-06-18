import { useState } from 'react';
import { Icon } from '@iconify/react';
import { notify } from '../lib/notify';
import { systemNotify, isSystemNotificationsEnabled, setSystemNotificationsEnabled } from '../lib/systemNotify';
import { useNotifications } from '../stores/notifications';
import type { NotificationSeverity, NotificationSource } from '../stores/notifications';

// ─── helpers ───────────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex items-center gap-[8px] pb-[8px] border-b border-[#3a3a3a]">
        <Icon icon={icon} className="text-[#f881a9] text-[15px]" />
        <span className="text-[11px] font-bold text-white uppercase tracking-widest font-['JetBrains_Mono',sans-serif]">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-[8px] items-center">{children}</div>;
}

function Btn({
  label,
  icon,
  onClick,
  variant = 'default',
  disabled,
}: {
  label: string;
  icon?: string;
  onClick: () => void;
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info' | 'ghost' | 'danger';
  disabled?: boolean;
}) {
  const colors: Record<string, string> = {
    default:  'bg-[#3a3a3a] text-white hover:bg-[#464646]',
    success:  'bg-[rgba(52,199,89,0.15)] text-[#34C759] border border-[rgba(52,199,89,0.3)] hover:bg-[rgba(52,199,89,0.25)]',
    error:    'bg-[rgba(212,24,61,0.15)] text-[#ff5c5f] border border-[rgba(212,24,61,0.3)] hover:bg-[rgba(212,24,61,0.25)]',
    warning:  'bg-[rgba(250,200,0,0.12)] text-[#FAC800] border border-[rgba(250,200,0,0.3)] hover:bg-[rgba(250,200,0,0.22)]',
    info:     'bg-[rgba(59,130,246,0.15)] text-[#60a5fa] border border-[rgba(59,130,246,0.3)] hover:bg-[rgba(59,130,246,0.25)]',
    ghost:    'bg-transparent text-[rgba(255,255,255,0.4)] border border-[#3a3a3a] hover:text-white hover:border-[#646464]',
    danger:   'bg-[rgba(255,92,95,0.1)] text-[#ff5c5f] hover:bg-[rgba(255,92,95,0.2)]',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-[6px] px-[10px] py-[5px] rounded-[5px] text-[11px] font-['JetBrains_Mono',sans-serif] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${colors[variant]}`}
    >
      {icon && <Icon icon={icon} className="text-[13px] shrink-0" />}
      {label}
    </button>
  );
}

function Tag({ label, value }: { label: string; value: string | number | boolean }) {
  return (
    <div className="flex items-center gap-[6px] text-[10px] font-['JetBrains_Mono',sans-serif]">
      <span className="text-[rgba(255,255,255,0.3)] uppercase tracking-wide">{label}</span>
      <span className="text-white font-bold">{String(value)}</span>
    </div>
  );
}

// ─── page ──────────────────────────────────────────────────────────────────

const SEVERITIES: NotificationSeverity[] = ['info', 'success', 'warning', 'error'];
const SOURCES: NotificationSource[] = ['general', 'build', 'deploy', 'git', 'update', 'system'];

const SEVERITY_VARIANT: Record<NotificationSeverity, 'info' | 'success' | 'warning' | 'error'> = {
  info: 'info', success: 'success', warning: 'warning', error: 'error',
};

export function NotificationsDebugPage() {
  const { state, addNotification, markAllRead, clearAll, unreadCount } = useNotifications();

  const [severity, setSeverity] = useState<NotificationSeverity>('info');
  const [source, setSource] = useState<NotificationSource>('general');
  const [withBody, setWithBody] = useState(true);
  const [withActions, setWithActions] = useState(false);
  const [persistent, setPersistent] = useState(true);

  const [sysEnabled, setSysEnabled] = useState(() => isSystemNotificationsEnabled());

  function toggleSysNotif() {
    const next = !sysEnabled;
    setSysEnabled(next);
    setSystemNotificationsEnabled(next);
  }

  // ── toast demos ────────────────────────────────────────────────────────

  function fireLoadingSuccess() {
    const id = notify.loading('Processing…');
    setTimeout(() => notify.success('Done!', { id, description: 'The operation completed successfully.' }), 2000);
  }

  function fireLoadingError() {
    const id = notify.loading('Processing…');
    setTimeout(() => notify.error('Failed', { id, description: 'Something went wrong. Please try again.' }), 2000);
  }

  function firePromise() {
    notify.promise(
      new Promise<string>((res) => setTimeout(() => res('payload'), 2500)),
      { loading: 'Fetching data…', success: 'Data loaded', error: 'Fetch failed' }
    );
  }

  function fireWithAction() {
    notify.info('New deployment ready', {
      description: 'prod-v2 is queued for rollout.',
      action: { label: 'Deploy now', onClick: () => notify.success('Deployment started') },
      cancel: { label: 'Later', onClick: () => {} },
    });
  }

  // ── notification center demos ───────────────────────────────────────────

  function pushNotification() {
    addNotification({
      severity,
      source,
      title: `Test ${severity} from ${source}`,
      body: withBody
        ? `This is a sample notification body. It can wrap across multiple lines to show how long content renders in the panel.`
        : undefined,
      persistent,
      actions: withActions
        ? [
            { label: 'Primary', variant: 'primary', onClick: () => notify.success('Primary clicked') },
            { label: 'Dismiss', variant: 'ghost', onClick: () => {} },
          ]
        : undefined,
    });
  }

  function pushAll() {
    for (const sev of SEVERITIES) {
      for (const src of ['build', 'deploy'] as NotificationSource[]) {
        addNotification({
          severity: sev,
          source: src,
          title: `${sev.charAt(0).toUpperCase() + sev.slice(1)} from ${src}`,
          body: `Automated test notification — ${sev}/${src}.`,
          persistent: true,
        });
      }
    }
  }

  return (
    <div className="flex flex-col gap-[32px] p-[28px] max-w-[800px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-[4px]">
          <div className="flex items-center gap-[10px]">
            <Icon icon="solar:bell-bing-bold" className="text-[#f881a9] text-[22px]" />
            <h1 className="text-[16px] font-bold text-white font-['JetBrains_Mono',sans-serif]">
              Notifications Debug
            </h1>
          </div>
          <p className="text-[11px] text-[rgba(255,255,255,0.35)] font-['JetBrains_Mono',sans-serif] ml-[32px]">
            Test all three notification layers
          </p>
        </div>
        <div className="flex items-center gap-[16px] mt-[4px]">
          <Tag label="in store" value={state.notifications.length} />
          <Tag label="unread" value={unreadCount} />
        </div>
      </div>

      {/* ── 1. Toast System ───────────────────────────────────────────── */}
      <Section title="Toast System" icon="solar:notification-lines-remove-linear">
        <Row>
          <Btn label="success" icon="solar:check-circle-linear" variant="success" onClick={() => notify.success('Operation succeeded', { description: 'Everything went as expected.' })} />
          <Btn label="error" icon="solar:close-circle-linear" variant="error" onClick={() => notify.error('Something failed', { description: 'Check the logs for details.' })} />
          <Btn label="warning" icon="solar:danger-triangle-linear" variant="warning" onClick={() => notify.warning('Proceed with caution', { description: 'This action may have side effects.' })} />
          <Btn label="info" icon="solar:info-circle-linear" variant="info" onClick={() => notify.info('Heads up', { description: 'Just a friendly notice.' })} />
          <Btn label="loading" icon="solar:refresh-linear" onClick={() => notify.loading('Working…')} />
        </Row>
        <Row>
          <Btn label="loading → success (2s)" icon="solar:hourglass-linear" variant="success" onClick={fireLoadingSuccess} />
          <Btn label="loading → error (2s)" icon="solar:hourglass-linear" variant="error" onClick={fireLoadingError} />
          <Btn label="promise (2.5s)" icon="solar:hourglass-line-linear" onClick={firePromise} />
        </Row>
        <Row>
          <Btn label="with action + cancel" icon="solar:cursor-linear" variant="info" onClick={fireWithAction} />
          <Btn label="persistent (no auto-dismiss)" icon="solar:pin-linear" onClick={() => notify.info('Pinned notification', { persistent: true, description: 'Click × to dismiss.' })} />
          <Btn label="dismiss all" icon="solar:close-square-linear" variant="ghost" onClick={() => notify.dismiss()} />
        </Row>
      </Section>

      {/* ── 2. In-App Notification Center ────────────────────────────── */}
      <Section title="Notification Center" icon="solar:bell-linear">

        {/* Controls */}
        <div className="bg-[#242424] rounded-[8px] border border-[#3a3a3a] p-[14px] flex flex-col gap-[12px]">
          {/* Severity */}
          <div className="flex items-center gap-[10px]">
            <span className="text-[10px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif] uppercase tracking-wide w-[70px] shrink-0">Severity</span>
            <div className="flex gap-[6px]">
              {SEVERITIES.map(s => (
                <button
                  key={s}
                  onClick={() => setSeverity(s)}
                  className={`px-[8px] py-[3px] rounded text-[10px] font-['JetBrains_Mono',sans-serif] transition-colors ${
                    severity === s
                      ? 'bg-[#f881a9] text-black font-bold'
                      : 'bg-[#3a3a3a] text-[rgba(255,255,255,0.5)] hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Source */}
          <div className="flex items-center gap-[10px]">
            <span className="text-[10px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif] uppercase tracking-wide w-[70px] shrink-0">Source</span>
            <div className="flex flex-wrap gap-[6px]">
              {SOURCES.map(s => (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  className={`px-[8px] py-[3px] rounded text-[10px] font-['JetBrains_Mono',sans-serif] transition-colors ${
                    source === s
                      ? 'bg-[#f881a9] text-black font-bold'
                      : 'bg-[#3a3a3a] text-[rgba(255,255,255,0.5)] hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-[20px]">
            {[
              { label: 'With body', val: withBody, set: setWithBody },
              { label: 'With actions', val: withActions, set: setWithActions },
              { label: 'Persistent', val: persistent, set: setPersistent },
            ].map(({ label, val, set }) => (
              <button
                key={label}
                onClick={() => set(!val)}
                className="flex items-center gap-[7px] text-[10px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.5)] hover:text-white transition-colors"
              >
                <span className={`relative w-[28px] h-[16px] rounded-full transition-colors ${val ? 'bg-[#f881a9]' : 'bg-[#3a3a3a]'}`}>
                  <span className={`absolute top-[2px] w-[12px] h-[12px] rounded-full bg-white shadow transition-all ${val ? 'left-[14px]' : 'left-[2px]'}`} />
                </span>
                {label}
              </button>
            ))}
          </div>
        </div>

        <Row>
          <Btn
            label={`Push ${severity}`}
            icon="solar:bell-bing-linear"
            variant={SEVERITY_VARIANT[severity]}
            onClick={pushNotification}
          />
          <Btn label="Push all (8 mix)" icon="solar:layers-linear" onClick={pushAll} />
          <Btn label="Mark all read" icon="solar:check-read-linear" variant="ghost" onClick={markAllRead} disabled={unreadCount === 0} />
          <Btn label="Clear all" icon="solar:trash-bin-2-linear" variant="danger" onClick={clearAll} disabled={state.notifications.length === 0} />
        </Row>

        {/* Live store preview */}
        {state.notifications.length > 0 && (
          <div className="bg-[#1a1a1a] rounded-[8px] border border-[#3a3a3a] overflow-hidden">
            <div className="px-[12px] py-[8px] border-b border-[#3a3a3a] flex items-center gap-[6px]">
              <span className="text-[9px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif] uppercase tracking-widest">Store state</span>
              <span className="text-[9px] bg-[rgba(248,129,169,0.15)] text-[#f881a9] px-[5px] py-[1px] rounded-full font-['JetBrains_Mono',sans-serif] font-bold">
                {state.notifications.length}
              </span>
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {state.notifications.map(n => (
                <div
                  key={n.id}
                  className={`flex items-start gap-[10px] px-[12px] py-[8px] border-b border-[#2a2a2a] last:border-0 text-[10px] font-['JetBrains_Mono',sans-serif] ${n.read ? 'opacity-40' : ''}`}
                >
                  <span className={`shrink-0 mt-[1px] w-[6px] h-[6px] rounded-full ${
                    n.severity === 'success' ? 'bg-[#34C759]' :
                    n.severity === 'warning' ? 'bg-[#FAC800]' :
                    n.severity === 'error'   ? 'bg-[#d4183d]' : 'bg-[#3b82f6]'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-[8px]">
                      <span className="text-white truncate">{n.title}</span>
                      {!n.read && <span className="text-[rgba(255,255,255,0.3)] shrink-0">unread</span>}
                      {n.persistent && <span className="text-[rgba(255,255,255,0.3)] shrink-0">persistent</span>}
                    </div>
                    <span className="text-[rgba(255,255,255,0.3)]">{n.source} · {n.severity}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ── 3. System (OS) Notifications ─────────────────────────────── */}
      <Section title="System Notifications (macOS)" icon="solar:monitor-linear">
        <div className="bg-[#242424] rounded-[8px] border border-[#3a3a3a] p-[14px] flex flex-col gap-[12px]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-white font-['JetBrains_Mono',sans-serif]">macOS notification center</p>
              <p className="text-[10px] text-[rgba(255,255,255,0.35)] font-['JetBrains_Mono',sans-serif] mt-[2px]">
                Fires a native notification via osascript. Also togglable in Profile → System notifications.
              </p>
            </div>
            <button
              onClick={toggleSysNotif}
              className={`relative w-[32px] h-[18px] rounded-full transition-colors shrink-0 ${sysEnabled ? 'bg-[#34C759]' : 'bg-[#3a3a3a]'}`}
              title={sysEnabled ? 'Disable' : 'Enable'}
            >
              <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${sysEnabled ? 'left-[16px]' : 'left-[2px]'}`} />
            </button>
          </div>

          {!sysEnabled && (
            <p className="text-[10px] text-[#FAC800] font-['JetBrains_Mono',sans-serif]">
              Toggle on above (or in Profile settings) to allow test fires.
            </p>
          )}
        </div>

        <Row>
          <Btn
            label="Send test notification"
            icon="solar:monitor-linear"
            disabled={!sysEnabled}
            onClick={() => systemNotify('AlisHub', 'This is a test system notification from the debug page.')}
          />
          <Btn
            label="Send with long body"
            icon="solar:monitor-linear"
            variant="ghost"
            disabled={!sysEnabled}
            onClick={() => systemNotify('Build Complete', 'organisations/voyage/products/vp — build #142 finished in 3m 27s. All checks passed.')}
          />
        </Row>
      </Section>
    </div>
  );
}
