import { Loader } from "./Loader";
import type { AppNotification, NotificationSeverity } from "../stores/notifications";
import { Icon } from "@iconify/react";

const SEVERITY_COLOR: Record<NotificationSeverity, string> = {
  info: "#3b82f6",
  success: "#34c759",
  warning: "#fac800",
  error: "#d4183d",
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
  onTaskClick?: (id: string) => void;
}

export function NotificationItem({
  notification,
  onMarkRead,
  onDismiss,
  onTaskClick,
}: NotificationItemProps) {
  const color = SEVERITY_COLOR[notification.severity];
  const isRunning = notification.task?.status === "running";

  function handleClick() {
    if (!notification.read) onMarkRead(notification.id);
    if (notification.task && onTaskClick) onTaskClick(notification.id);
  }

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation();
    onDismiss(notification.id);
  }

  return (
    <div
      className="group flex gap-[9px] px-[11px] py-[8px] cursor-pointer transition-colors border-b border-foreground/[0.035] last:border-b-0 relative hover:bg-foreground/[3%]"
      onClick={handleClick}
    >
      {/* Severity bar — spinner when task is running */}
      {isRunning ? (
        <div className="shrink-0 flex items-start pt-[4px]">
          <Loader size={10} />
        </div>
      ) : (
        <div
          className="w-[2.5px] rounded-[2px] self-stretch shrink-0 min-h-[14px]"
          style={{
            background: notification.read ? "rgba(255,255,255,0.08)" : color,
          }}
        />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 pr-[16px]">
        <div className="flex items-baseline gap-[6px]">
          <p
            className={`flex-1 text-[11.5px] leading-snug min-w-0 truncate tracking-[-0.1px] ${
              notification.read ? "text-foreground/40 font-normal" : "text-foreground font-semibold"
            }`}
          >
            {notification.title}
          </p>
          <span className="text-[9.5px] text-foreground/25 shrink-0 font-mono">
            {formatRelativeTime(notification.timestamp)}
          </span>
        </div>

        {notification.body && (
          <p className="text-[10.5px] text-foreground/40 mt-[2px] line-clamp-1 leading-relaxed">
            {notification.body}
          </p>
        )}

        {/* Action buttons */}
        {notification.actions && notification.actions.length > 0 && (
          <div className="flex flex-wrap gap-[4px] mt-[6px]">
            {notification.actions.map((action, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  action.onClick();
                }}
                className={`text-[10.5px] font-semibold px-[10px] py-[4px] rounded-[7px] border transition-colors ${
                  action.variant === "destructive"
                    ? "border-destructive/20 text-destructive bg-transparent hover:bg-destructive/5"
                    : action.variant === "ghost"
                      ? "border-foreground/10 text-foreground/50 bg-transparent hover:bg-foreground/[7%] hover:text-foreground/70"
                      : "border-brand-fill/25 text-brand bg-transparent hover:bg-brand-fill/10"
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Dismiss on hover */}
      <button
        onClick={handleDismiss}
        className="absolute top-[8px] right-[8px] opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity"
        title="Dismiss"
      >
        <Icon icon="solar:close-circle-linear" className="text-[11px] text-foreground" />
      </button>
    </div>
  );
}
