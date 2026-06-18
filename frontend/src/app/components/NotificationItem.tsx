import { Icon } from '@iconify/react';
import type { AppNotification, NotificationSeverity, NotificationSource } from '../stores/notifications';

const SEVERITY_COLOR: Record<NotificationSeverity, string> = {
  info: '#3b82f6',
  success: '#34C759',
  warning: '#FAC800',
  error: '#d4183d',
};

const SEVERITY_ICON: Record<NotificationSeverity, string> = {
  info: 'solar:info-circle-linear',
  success: 'solar:check-circle-linear',
  warning: 'solar:danger-triangle-linear',
  error: 'solar:close-circle-linear',
};

const SOURCE_ICON: Record<NotificationSource, string> = {
  build: 'solar:box-linear',
  deploy: 'solar:cloud-upload-linear',
  git: 'solar:code-square-linear',
  update: 'solar:refresh-linear',
  system: 'solar:monitor-linear',
  general: 'solar:bell-linear',
};

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'Just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;

  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface NotificationItemProps {
  notification: AppNotification;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
}

export function NotificationItem({ notification, onMarkRead, onDismiss }: NotificationItemProps) {
  const color = SEVERITY_COLOR[notification.severity];

  function handleClick() {
    if (!notification.read) onMarkRead(notification.id);
  }

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation();
    onDismiss(notification.id);
  }

  return (
    <div
      className={`relative flex gap-[10px] py-[10px] pr-[12px] border-b border-[#3a3a3a] cursor-pointer transition-colors ${
        notification.read
          ? 'opacity-50 hover:opacity-70'
          : 'hover:bg-[rgba(255,255,255,0.03)]'
      }`}
      style={{
        paddingLeft: '12px',
        borderLeft: `3px solid ${notification.read ? 'transparent' : color}`,
      }}
      onClick={handleClick}
    >
      {/* Unread dot */}
      {!notification.read && (
        <span className="absolute top-[12px] right-[10px] w-[6px] h-[6px] rounded-full bg-[#d4183d] shrink-0" />
      )}

      {/* Severity icon */}
      <Icon
        icon={SEVERITY_ICON[notification.severity]}
        className="text-[16px] shrink-0 mt-[1px]"
        style={{ color }}
      />

      <div className="flex-1 min-w-0 pr-[14px]">
        {/* Title + timestamp */}
        <div className="flex items-start justify-between gap-[6px]">
          <p className="text-[12px] font-semibold text-white leading-snug line-clamp-2 font-['JetBrains_Mono',sans-serif]">
            {notification.title}
          </p>
          <span className="text-[10px] text-[rgba(255,255,255,0.35)] shrink-0 font-['JetBrains_Mono',sans-serif] mt-[1px]">
            {formatRelativeTime(notification.timestamp)}
          </span>
        </div>

        {/* Body */}
        {notification.body && (
          <p className="text-[11px] text-[rgba(255,255,255,0.5)] mt-[3px] line-clamp-2 leading-relaxed">
            {notification.body}
          </p>
        )}

        {/* Source badge */}
        <div className="flex items-center gap-[4px] mt-[5px]">
          <Icon
            icon={SOURCE_ICON[notification.source]}
            className="text-[10px] text-[rgba(255,255,255,0.3)]"
          />
          <span className="text-[10px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif] capitalize">
            {notification.source}
          </span>
        </div>

        {/* Action buttons */}
        {notification.actions && notification.actions.length > 0 && (
          <div className="flex flex-wrap gap-[6px] mt-[8px]">
            {notification.actions.map((action, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); action.onClick(); }}
                className={`text-[10px] px-[8px] py-[3px] rounded font-['JetBrains_Mono',sans-serif] font-bold transition-colors ${
                  action.variant === 'destructive'
                    ? 'bg-[rgba(212,24,61,0.2)] text-[#ff5c5f] hover:bg-[rgba(212,24,61,0.35)]'
                    : action.variant === 'ghost'
                    ? 'bg-transparent text-[rgba(255,255,255,0.5)] hover:text-white hover:bg-[rgba(255,255,255,0.08)]'
                    : 'bg-[rgba(248,129,169,0.15)] text-[#f881a9] hover:bg-[rgba(248,129,169,0.25)]'
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-[10px] right-[28px] opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity shrink-0"
        title="Dismiss"
      >
        <Icon icon="solar:close-linear" className="text-[12px] text-white" />
      </button>
    </div>
  );
}
