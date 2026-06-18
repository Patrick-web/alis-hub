import { Icon } from '@iconify/react';
import { ScrollArea } from '../components/ui/scroll-area';
import { useNotifications } from '../stores/notifications';
import type { AppNotification } from '../stores/notifications';
import { NotificationItem } from '../components/NotificationItem';

interface DateGroup {
  today: AppNotification[];
  yesterday: AppNotification[];
  earlier: AppNotification[];
}

function groupByDate(notifications: AppNotification[]): DateGroup {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  const groups: DateGroup = { today: [], yesterday: [], earlier: [] };

  for (const n of notifications) {
    const d = new Date(n.timestamp).toDateString();
    if (d === today) groups.today.push(n);
    else if (d === yesterday) groups.yesterday.push(n);
    else groups.earlier.push(n);
  }
  return groups;
}

function DateSection({ label, notifications, onMarkRead, onDismiss }: {
  label: string;
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  if (notifications.length === 0) return null;
  return (
    <div>
      <div className="px-[20px] py-[6px] sticky top-0 bg-[#1e1e1e] z-10 border-b border-[#464646]">
        <span className="text-[10px] text-[rgba(255,255,255,0.3)] font-bold uppercase tracking-widest font-['JetBrains_Mono',sans-serif]">
          {label}
        </span>
      </div>
      {notifications.map(n => (
        <NotificationItem
          key={n.id}
          notification={n}
          onMarkRead={onMarkRead}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}

export function NotificationsPage() {
  const { state, unreadCount, markRead, markAllRead, dismiss, clearAll } = useNotifications();
  const grouped = groupByDate(state.notifications);
  const isEmpty = state.notifications.length === 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#1e1e1e]">
      {/* Header */}
      <div className="border-b border-[#464646] px-[20px] py-[10px] flex items-center justify-between shrink-0 h-[51px]">
        <div className="flex items-center gap-[8px]">
          <Icon icon="solar:bell-bold" className="text-[#f881a9] text-[16px]" />
          <h1 className="font-['JetBrains_Mono',sans-serif] font-bold text-[13px] text-white uppercase leading-[1.2]">
            Notifications
          </h1>
          {unreadCount > 0 && (
            <span className="text-[10px] bg-[rgba(248,129,169,0.15)] text-[#f881a9] px-[6px] py-[1px] rounded-full font-['JetBrains_Mono',sans-serif] font-bold">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-[12px]">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-[11px] text-[rgba(255,255,255,0.4)] hover:text-white transition-colors font-['JetBrains_Mono',sans-serif]"
            >
              Mark all read
            </button>
          )}
          {!isEmpty && (
            <button
              onClick={clearAll}
              className="text-[11px] text-[rgba(255,255,255,0.4)] hover:text-[#ff5c5f] transition-colors font-['JetBrains_Mono',sans-serif]"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-[10px] text-[rgba(255,255,255,0.2)]">
          <Icon icon="solar:bell-off-linear" className="text-[36px]" />
          <span className="text-[12px] font-['JetBrains_Mono',sans-serif]">No notifications</span>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="max-w-[600px]">
            <DateSection label="Today" notifications={grouped.today} onMarkRead={markRead} onDismiss={dismiss} />
            <DateSection label="Yesterday" notifications={grouped.yesterday} onMarkRead={markRead} onDismiss={dismiss} />
            <DateSection label="Earlier" notifications={grouped.earlier} onMarkRead={markRead} onDismiss={dismiss} />
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
