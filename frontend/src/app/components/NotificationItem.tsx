import { Icon } from "@iconify/react";
import { Loader } from "./Loader";
import type {
  AppNotification,
  NotificationSeverity,
  NotificationSource,
} from "../stores/notifications";

const SEVERITY_COLOR: Record<NotificationSeverity, string> = {
  info: "#3b82f6",
  success: "#34C759",
  warning: "#FAC800",
  error: "#d4183d",
};

const SEVERITY_ICON: Record<NotificationSeverity, string> = {
  info: "solar:info-circle-linear",
  success: "solar:check-circle-linear",
  warning: "solar:danger-triangle-linear",
  error: "solar:close-circle-linear",
};

const SOURCE_ICON: Record<NotificationSource, string> = {
  build: "solar:box-linear",
  deploy: "solar:cloud-upload-linear",
  define: "solar:magic-stick-linear",
  packages: "solar:folder-with-files-linear",
  git: "solar:code-square-linear",
  update: "solar:refresh-linear",
  system: "solar:monitor-linear",
  general: "solar:bell-linear",
};

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "Just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;

  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

interface NotificationItemProps {
  notification: AppNotification;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
}

export function NotificationItem({
  notification,
  onMarkRead,
  onDismiss,
}: NotificationItemProps) {
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
      className={`relative flex gap-[10px] py-[10px] pr-[12px] border-b border-border cursor-pointer transition-colors ${
        notification.read
          ? "opacity-50 hover:opacity-70"
          : "hover:bg-foreground/[3%]"
      }`}
      style={{
        paddingLeft: "12px",
        borderLeft: `3px solid ${notification.read ? "transparent" : color}`,
      }}
      onClick={handleClick}
    >
      {/* Unread dot */}
      {!notification.read && (
        <span className="absolute top-[12px] right-[10px] w-[6px] h-[6px] rounded-full bg-destructive shrink-0" />
      )}

      {/* Severity icon — spinner for in-progress tasks */}
      {notification.task?.status === 'running' ? (
        <div className="shrink-0 mt-[1px]">
          <Loader size={14} />
        </div>
      ) : (
        <Icon
          icon={SEVERITY_ICON[notification.severity]}
          className="text-[16px] shrink-0 mt-[1px]"
          style={{ color }}
        />
      )}

      <div className="flex-1 min-w-0 pr-[14px]">
        {/* Title + timestamp */}
        <div className="flex items-start justify-between gap-[6px]">
          <p className="text-[12px] font-semibold text-foreground leading-snug line-clamp-2 font-mono">
            {notification.title}
          </p>
          <span className="text-[10px] text-foreground/35 shrink-0 font-mono mt-[1px]">
            {formatRelativeTime(notification.timestamp)}
          </span>
        </div>

        {/* Body */}
        {notification.body && (
          <p className="text-[11px] text-foreground/50 mt-[3px] line-clamp-2 leading-relaxed">
            {notification.body}
          </p>
        )}

        {/* Source badge */}
        <div className="flex items-center gap-[4px] mt-[5px]">
          <Icon
            icon={SOURCE_ICON[notification.source]}
            className="text-[10px] text-foreground/30"
          />
          <span className="text-[10px] text-foreground/30 font-mono capitalize">
            {notification.source}
          </span>
        </div>

        {/* Action buttons */}
        {notification.actions && notification.actions.length > 0 && (
          <div className="flex flex-wrap gap-[6px] mt-[8px]">
            {notification.actions.map((action, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  action.onClick();
                }}
                className={`text-[10px] px-[8px] py-[3px] rounded font-mono font-bold transition-colors ${
                  action.variant === "destructive"
                    ? "bg-[rgba(212,24,61,0.2)] text-destructive hover:bg-[rgba(212,24,61,0.35)]"
                    : action.variant === "ghost"
                      ? "bg-transparent text-foreground/50 hover:text-foreground hover:bg-foreground/[8%]"
                      : "bg-[rgba(248,129,169,0.15)] text-brand hover:bg-[rgba(248,129,169,0.25)]"
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
        <Icon
          icon="solar:close-circle-linear"
          className="text-[12px] text-foreground"
        />
      </button>
    </div>
  );
}
