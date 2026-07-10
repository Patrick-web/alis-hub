import { useState } from 'react';
import { Icon } from '@iconify/react';
import { notify } from '../lib/notify';
import { systemNotify, isSystemNotificationsEnabled, setSystemNotificationsEnabled, requestNotificationAuthorization } from '../lib/systemNotify';
import { useNotifications } from '../stores/notifications';
import type { NotificationSeverity, NotificationSource } from '../stores/notifications';

// ─── helpers ───────────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex items-center gap-[8px] pb-[8px] border-b border-border">
        <Icon icon={icon} className="text-brand text-[15px]" />
        <span className="text-[11px] font-bold text-foreground uppercase tracking-widest font-mono">
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
    default:  'bg-accent text-foreground hover:bg-border',
    success:  'bg-[rgba(52,199,89,0.15)] text-success border border-[rgba(52,199,89,0.3)] hover:bg-[rgba(52,199,89,0.25)]',
    error:    'bg-[rgba(212,24,61,0.15)] text-destructive border border-[rgba(212,24,61,0.3)] hover:bg-[rgba(212,24,61,0.25)]',
    warning:  'bg-[rgba(250,200,0,0.12)] text-warning border border-[rgba(250,200,0,0.3)] hover:bg-[rgba(250,200,0,0.22)]',
    info:     'bg-[rgba(59,130,246,0.15)] text-info border border-[rgba(59,130,246,0.3)] hover:bg-[rgba(59,130,246,0.25)]',
    ghost:    'bg-transparent text-foreground/40 border border-border hover:text-foreground hover:border-border',
    danger:   'bg-[rgba(255,92,95,0.1)] text-destructive hover:bg-[rgba(255,92,95,0.2)]',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-[6px] px-[10px] py-[5px] rounded-[5px] text-[11px] font-mono transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${colors[variant]}`}
    >
      {icon && <Icon icon={icon} className="text-[13px] shrink-0" />}
      {label}
    </button>
  );
}

function Tag({ label, value }: { label: string; value: string | number | boolean }) {
  return (
    <div className="flex items-center gap-[6px] text-[10px] font-mono">
      <span className="text-foreground/30 uppercase tracking-wide">{label}</span>
      <span className="text-foreground font-bold">{String(value)}</span>
    </div>
  );
}

// ─── page ──────────────────────────────────────────────────────────────────

const SEVERITIES: NotificationSeverity[] = ['info', 'success', 'warning', 'error'];
const SOURCES: NotificationSource[] = ['build', 'deploy', 'define', 'packages', 'git', 'update', 'system', 'general'];

const SEVERITY_VARIANT: Record<NotificationSeverity, 'info' | 'success' | 'warning' | 'error'> = {
  info: 'info', success: 'success', warning: 'warning', error: 'error',
};

export function NotificationsDebugPage() {
  const { state, addNotification, updateNotification, markAllRead, clearAll, unreadCount } = useNotifications();

  const [severity, setSeverity] = useState<NotificationSeverity>('info');
  const [source, setSource] = useState<NotificationSource>('general');
  const [withBody, setWithBody] = useState(true);
  const [withActions, setWithActions] = useState(false);
  const [persistent, setPersistent] = useState(true);

  const [sysEnabled, setSysEnabled] = useState(() => isSystemNotificationsEnabled());

  async function toggleSysNotif() {
    if (!sysEnabled) {
      const granted = await requestNotificationAuthorization();
      if (granted) {
        setSysEnabled(true);
        setSystemNotificationsEnabled(true);
      }
    } else {
      setSysEnabled(false);
      setSystemNotificationsEnabled(false);
    }
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
    const combos: Array<[NotificationSeverity, NotificationSource]> = [
      ['success', 'build'],
      ['info',    'deploy'],
      ['warning', 'define'],
      ['error',   'define'],
      ['success', 'packages'],
      ['info',    'git'],
      ['warning', 'system'],
      ['info',    'update'],
    ];
    for (const [sev, src] of combos) {
      addNotification({
        severity: sev,
        source: src,
        title: `${sev.charAt(0).toUpperCase() + sev.slice(1)} from ${src}`,
        body: `Automated test notification — ${sev}/${src}.`,
        persistent: true,
      });
    }
  }

  function pushRunningTask() {
    const id = addNotification({
      severity: 'info',
      source: 'build',
      title: 'Build in progress — alis-hub-v3',
      body: 'Compiling packages…',
      persistent: true,
      task: {
        type: 'build',
        status: 'running',
        neuronId: 'test-neuron',
        step: 'Compiling',
        startedAt: Date.now(),
        logBuffer: [],
        meta: {},
      },
    });
    setTimeout(() => {
      updateNotification(id, {
        severity: 'success',
        title: 'Build succeeded — alis-hub-v3',
        body: 'All packages compiled successfully.',
        task: { status: 'done' },
      });
    }, 4000);
  }

  return (
    <div className="flex flex-col gap-[32px] p-[28px] max-w-[800px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-[4px]">
          <div className="flex items-center gap-[10px]">
            <Icon icon="solar:bell-bing-bold" className="text-brand text-[22px]" />
            <h1 className="text-[16px] font-bold text-foreground font-mono">
              Notifications Debug
            </h1>
          </div>
          <p className="text-[11px] text-foreground/35 font-mono ml-[32px]">
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
        <div className="bg-muted rounded-[8px] border border-border p-[14px] flex flex-col gap-[12px]">
          {/* Severity */}
          <div className="flex items-center gap-[10px]">
            <span className="text-[10px] text-foreground/30 font-mono uppercase tracking-wide w-[70px] shrink-0">Severity</span>
            <div className="flex gap-[6px]">
              {SEVERITIES.map(s => (
                <button
                  key={s}
                  onClick={() => setSeverity(s)}
                  className={`px-[8px] py-[3px] rounded text-[10px] font-mono transition-colors ${
                    severity === s
                      ? 'bg-brand-fill text-brand-foreground font-bold'
                      : 'bg-accent text-foreground/50 hover:text-foreground'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Source */}
          <div className="flex items-center gap-[10px]">
            <span className="text-[10px] text-foreground/30 font-mono uppercase tracking-wide w-[70px] shrink-0">Source</span>
            <div className="flex flex-wrap gap-[6px]">
              {SOURCES.map(s => (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  className={`px-[8px] py-[3px] rounded text-[10px] font-mono transition-colors ${
                    source === s
                      ? 'bg-brand-fill text-brand-foreground font-bold'
                      : 'bg-accent text-foreground/50 hover:text-foreground'
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
                className="flex items-center gap-[7px] text-[10px] font-mono text-foreground/50 hover:text-foreground transition-colors"
              >
                <span className={`relative w-[28px] h-[16px] rounded-full transition-colors ${val ? 'bg-brand-fill' : 'bg-accent'}`}>
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
          <Btn label="Push all sources" icon="solar:layers-linear" onClick={pushAll} />
          <Btn label="Running task → done (4s)" icon="solar:refresh-linear" variant="info" onClick={pushRunningTask} />
        </Row>
        <Row>
          <Btn label="Mark all read" icon="solar:check-read-linear" variant="ghost" onClick={markAllRead} disabled={unreadCount === 0} />
          <Btn label="Clear all" icon="solar:trash-bin-2-linear" variant="danger" onClick={clearAll} disabled={state.notifications.length === 0} />
        </Row>

        {/* Live store preview — grouped by source, matching notification center layout */}
        {state.notifications.length > 0 && (() => {
          const grouped = new Map<string, typeof state.notifications>();
          for (const n of state.notifications) {
            if (!grouped.has(n.source)) grouped.set(n.source, []);
            grouped.get(n.source)!.push(n);
          }
          return (
            <div className="bg-muted rounded-[8px] border border-border overflow-hidden">
              <div className="px-[12px] py-[8px] border-b border-border flex items-center gap-[6px]">
                <span className="text-[9px] text-foreground/30 font-mono uppercase tracking-widest">Store state — grouped by source</span>
                <span className="text-[9px] bg-brand-fill/15 text-brand px-[5px] py-[1px] rounded-full font-mono font-bold">
                  {state.notifications.length}
                </span>
              </div>
              <div className="max-h-[280px] overflow-y-auto divide-y divide-border">
                {Array.from(grouped.entries()).map(([source, items]) => {
                  const unread = items.filter(n => !n.read).length;
                  return (
                    <div key={source}>
                      <div className="px-[12px] py-[5px] bg-foreground/[0.02] flex items-center gap-[8px]">
                        <span className="text-[9px] font-bold font-mono text-foreground/40 uppercase tracking-wide flex-1">{source}</span>
                        {unread > 0 && (
                          <span className="text-[8px] font-mono text-brand bg-brand-fill/10 px-[5px] py-[1px] rounded-[3px]">{unread} new</span>
                        )}
                      </div>
                      {items.map(n => (
                        <div
                          key={n.id}
                          className={`flex items-center gap-[10px] px-[12px] py-[6px] text-[10px] font-mono border-t border-border/50 ${n.read ? 'opacity-35' : ''}`}
                        >
                          <span className={`shrink-0 w-[5px] h-[5px] rounded-full ${
                            n.severity === 'success' ? 'bg-success' :
                            n.severity === 'warning' ? 'bg-warning' :
                            n.severity === 'error'   ? 'bg-destructive' : 'bg-info'
                          }`} />
                          <span className="flex-1 text-foreground truncate">{n.title}</span>
                          <div className="flex items-center gap-[6px] shrink-0">
                            {n.task?.status === 'running' && <span className="text-info">running</span>}
                            {n.task?.status === 'done' && <span className="text-success">done</span>}
                            {n.task?.status === 'error' && <span className="text-destructive">error</span>}
                            <span className="text-foreground/25">{n.severity}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </Section>

      {/* ── 3. System (OS) Notifications ─────────────────────────────── */}
      <Section title="System Notifications (macOS)" icon="solar:monitor-linear">
        <div className="bg-muted rounded-[8px] border border-border p-[14px] flex flex-col gap-[12px]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-foreground font-mono">macOS notification center</p>
              <p className="text-[10px] text-foreground/35 font-mono mt-[2px]">
                Fires a native notification via UserNotifications. Also togglable in Profile → System notifications.
              </p>
            </div>
            <button
              onClick={toggleSysNotif}
              className={`relative w-[32px] h-[18px] rounded-full transition-colors shrink-0 ${sysEnabled ? 'bg-success' : 'bg-accent'}`}
              title={sysEnabled ? 'Disable' : 'Enable'}
            >
              <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${sysEnabled ? 'left-[16px]' : 'left-[2px]'}`} />
            </button>
          </div>

          {!sysEnabled && (
            <p className="text-[10px] text-warning font-mono">
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
