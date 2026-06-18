import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from './ui/sheet';
import { ScrollArea } from './ui/scroll-area';
import { useNotifications } from '../stores/notifications';
import type { AppNotification } from '../stores/notifications';
import { NotificationItem } from './NotificationItem';

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
      <div className="px-[14px] py-[6px] sticky top-0 bg-[#2c2c2c] z-10">
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

export function NotificationCenter() {
  const { state, unreadCount, markRead, markAllRead, dismiss, clearAll } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const grouped = groupByDate(state.notifications);
  const isEmpty = state.notifications.length === 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="relative h-full flex items-center px-[10px] border-l border-[#464646] hover:bg-[rgba(255,255,255,0.05)] transition-colors focus:outline-none"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="Notifications"
        >
          <Icon icon="solar:bell-linear" className="text-white text-[17px]" />
          {unreadCount > 0 && (
            <span className="absolute top-[6px] right-[5px] min-w-[14px] h-[14px] rounded-full bg-[#d4183d] text-white text-[8px] font-bold flex items-center justify-center px-[3px] font-['JetBrains_Mono',sans-serif]">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="bg-[#2c2c2c] border-l border-[#464646] text-white w-[360px] max-w-[360px] gap-0 p-0 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-[14px] pt-[14px] pb-[12px] border-b border-[#464646] pr-[44px]">
          <div className="flex items-center gap-[8px]">
            <Icon icon="solar:bell-bold" className="text-[#f881a9] text-[16px]" />
            <span className="text-[13px] font-bold text-white font-['JetBrains_Mono',sans-serif]">
              Notifications
            </span>
            {unreadCount > 0 && (
              <span className="text-[10px] bg-[rgba(248,129,169,0.15)] text-[#f881a9] px-[6px] py-[1px] rounded-full font-['JetBrains_Mono',sans-serif] font-bold">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-[8px]">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white transition-colors font-['JetBrains_Mono',sans-serif]"
              >
                Mark all read
              </button>
            )}
            {!isEmpty && (
              <button
                onClick={clearAll}
                className="text-[10px] text-[rgba(255,255,255,0.4)] hover:text-[#ff5c5f] transition-colors font-['JetBrains_Mono',sans-serif]"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Notification list */}
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-[10px] text-[rgba(255,255,255,0.2)]">
            <Icon icon="solar:bell-off-linear" className="text-[36px]" />
            <span className="text-[12px] font-['JetBrains_Mono',sans-serif]">No notifications</span>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <DateSection
              label="Today"
              notifications={grouped.today}
              onMarkRead={markRead}
              onDismiss={dismiss}
            />
            <DateSection
              label="Yesterday"
              notifications={grouped.yesterday}
              onMarkRead={markRead}
              onDismiss={dismiss}
            />
            <DateSection
              label="Earlier"
              notifications={grouped.earlier}
              onMarkRead={markRead}
              onDismiss={dismiss}
            />
          </ScrollArea>
        )}
        {/* Footer */}
        <div className="border-t border-[#3a3a3a] px-[14px] py-[8px] flex items-center justify-end">
          <button
            onClick={() => { setOpen(false); navigate('/debug/notifications'); }}
            className="flex items-center gap-[5px] text-[10px] text-[rgba(255,255,255,0.2)] hover:text-[rgba(255,255,255,0.5)] transition-colors font-['JetBrains_Mono',sans-serif]"
          >
            <Icon icon="solar:bug-linear" className="text-[11px]" />
            debug
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
