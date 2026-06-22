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
import type { AppNotification, NotificationSource } from '../stores/notifications';
import { NotificationItem } from './NotificationItem';
import { useWorkspace } from '../stores/workspace';

const SOURCE_ICON: Record<NotificationSource, string> = {
  build: 'solar:box-linear',
  deploy: 'solar:cloud-upload-linear',
  define: 'solar:magic-stick-linear',
  packages: 'solar:folder-with-files-linear',
  git: 'solar:code-square-linear',
  update: 'solar:refresh-linear',
  system: 'solar:monitor-linear',
  general: 'solar:bell-linear',
};

const SOURCE_COLOR: Record<NotificationSource, string> = {
  build: '#34c759',
  deploy: '#3b82f6',
  define: '#fac800',
  packages: '#3b82f6',
  git: 'rgba(240,240,240,0.45)',
  update: '#f881a9',
  system: 'rgba(240,240,240,0.45)',
  general: 'rgba(240,240,240,0.45)',
};

const SOURCE_BG: Record<NotificationSource, string> = {
  build: 'rgba(52,199,89,0.12)',
  deploy: 'rgba(59,130,246,0.12)',
  define: 'rgba(250,200,0,0.12)',
  packages: 'rgba(59,130,246,0.12)',
  git: 'rgba(255,255,255,0.06)',
  update: 'rgba(248,129,169,0.12)',
  system: 'rgba(255,255,255,0.06)',
  general: 'rgba(255,255,255,0.06)',
};

interface DateGroup {
  today: AppNotification[];
  yesterday: AppNotification[];
  earlier: AppNotification[];
}

interface SourceGroup {
  source: NotificationSource;
  notifications: AppNotification[];
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

function groupBySource(notifications: AppNotification[]): SourceGroup[] {
  const map = new Map<NotificationSource, AppNotification[]>();
  for (const n of notifications) {
    if (!map.has(n.source)) map.set(n.source, []);
    map.get(n.source)!.push(n);
  }
  return Array.from(map.entries()).map(([source, notifications]) => ({ source, notifications }));
}

function SourceSection({
  source,
  notifications,
  onMarkRead,
  onDismiss,
  onTaskClick,
}: {
  source: NotificationSource;
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onTaskClick: (id: string) => void;
}) {
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="mx-[10px] mb-[8px] rounded-[11px] overflow-hidden border border-foreground/[0.05] bg-foreground/[0.03]">
      <div className="flex items-center gap-[8px] px-[11px] py-[8px] border-b border-foreground/[0.05]">
        <div
          className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center shrink-0"
          style={{ background: SOURCE_BG[source] }}
        >
          <Icon
            icon={SOURCE_ICON[source]}
            className="text-[11px]"
            style={{ color: SOURCE_COLOR[source] }}
          />
        </div>
        <span className="flex-1 text-[11.5px] font-semibold text-foreground/70 capitalize">
          {source}
        </span>
        <span className="text-[9px] font-mono text-foreground/30 bg-foreground/[0.06] px-[6px] py-[2px] rounded-[4px]">
          {unreadCount > 0 ? `${unreadCount} new` : 'read'}
        </span>
      </div>
      {notifications.map(n => (
        <NotificationItem
          key={n.id}
          notification={n}
          onMarkRead={onMarkRead}
          onDismiss={onDismiss}
          onTaskClick={onTaskClick}
        />
      ))}
    </div>
  );
}

function DateSection({
  label,
  notifications,
  onMarkRead,
  onDismiss,
  onTaskClick,
}: {
  label: string;
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onTaskClick: (id: string) => void;
}) {
  if (notifications.length === 0) return null;
  const sourceGroups = groupBySource(notifications);

  return (
    <div>
      <div className="px-[15px] py-[10px] text-[10.5px] font-bold text-foreground/20 uppercase tracking-[0.8px] sticky top-0 z-10" style={{ background: 'rgba(18,18,22,0.9)' }}>
        {label}
      </div>
      {sourceGroups.map(({ source, notifications: items }) => (
        <SourceSection
          key={source}
          source={source}
          notifications={items}
          onMarkRead={onMarkRead}
          onDismiss={onDismiss}
          onTaskClick={onTaskClick}
        />
      ))}
    </div>
  );
}

export function NotificationCenter() {
  const { state, unreadCount, markRead, markAllRead, dismiss, clearAll, setFocusTaskId } = useNotifications();
  const { state: wsState, setPhase } = useWorkspace();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  function openDebugPage() {
    setOpen(false);
    if (wsState.phase === 'hub') setPhase('standalone');
    navigate('/debug/notifications');
  }

  function handleTaskClick(id: string) {
    setOpen(false);
    setFocusTaskId(id);
    navigate('/develop');
  }
  const grouped = groupByDate(state.notifications);
  const isEmpty = state.notifications.length === 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="relative h-full flex items-center px-[10px] border-l border-border hover:bg-foreground/5 transition-colors focus:outline-none"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="Notifications"
        >
          <Icon icon="solar:bell-linear" className="text-foreground text-[17px]" />
          {unreadCount > 0 && (
            <span className="absolute top-[6px] right-[5px] min-w-[14px] h-[14px] rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold flex items-center justify-center px-[3px] font-mono">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </SheetTrigger>

      <SheetContent
        side="right"
        overlayClassName="bg-black/20"
        className="border-l border-white/[0.08] text-foreground w-[360px] max-w-[360px] gap-0 p-0 flex flex-col"
        style={{
          background: 'rgba(18,18,22,0.82)',
          backdropFilter: 'blur(32px) saturate(160%)',
          WebkitBackdropFilter: 'blur(32px) saturate(160%)',
        } as React.CSSProperties}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-[15px] pt-[13px] pb-[11px] border-b border-border pr-[44px]">
          <div className="flex items-center gap-[7px]">
            <span className="text-[13px] font-bold text-foreground tracking-[-0.3px]">
              Notifications
            </span>
            {unreadCount > 0 && (
              <span className="text-[8.5px] bg-brand text-[#111] px-[5px] py-[2px] rounded-[4px] font-mono font-bold tracking-[0.3px]">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-[11px] font-medium text-brand hover:bg-brand/10 px-[6px] py-[3px] rounded-[6px] transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Notification list */}
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-[10px] text-foreground/20">
            <Icon icon="solar:bell-off-linear" className="text-[36px]" />
            <span className="text-[12px] font-mono">No notifications</span>
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <DateSection
              label="Today"
              notifications={grouped.today}
              onMarkRead={markRead}
              onDismiss={dismiss}
              onTaskClick={handleTaskClick}
            />
            <DateSection
              label="Yesterday"
              notifications={grouped.yesterday}
              onMarkRead={markRead}
              onDismiss={dismiss}
              onTaskClick={handleTaskClick}
            />
            <DateSection
              label="Earlier"
              notifications={grouped.earlier}
              onMarkRead={markRead}
              onDismiss={dismiss}
              onTaskClick={handleTaskClick}
            />
          </ScrollArea>
        )}

        {/* Footer */}
        <div className="border-t border-border px-[15px] py-[8px] flex items-center justify-between">
          <button
            onClick={openDebugPage}
            className="flex items-center gap-[5px] text-[10.5px] text-foreground/20 hover:text-foreground/40 transition-colors"
          >
            <Icon icon="solar:bug-linear" className="text-[11px]" />
            debug
          </button>
          {!isEmpty && (
            <button
              onClick={clearAll}
              className="text-[10.5px] font-medium text-foreground/20 hover:text-destructive transition-colors px-[6px] py-[3px] rounded-[5px] hover:bg-destructive/5"
            >
              Clear all
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
