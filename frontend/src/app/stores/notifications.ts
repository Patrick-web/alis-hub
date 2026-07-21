import { create } from "zustand";
import { persist } from "zustand/middleware";
import { hydrateWhenReady, persistSqlite } from "./lib/persistSqlite";

export type NotificationSeverity = "info" | "success" | "warning" | "error";
export type NotificationSource =
  "system" | "build" | "deploy" | "define" | "packages" | "git" | "update" | "general";

export type TaskType = "define" | "build" | "deploy" | "packages" | "workflow";
export type TaskStatus = "running" | "done" | "error";

export interface TaskProgress {
  type: TaskType;
  status: TaskStatus;
  neuronId: string;
  step: string;
  startedAt: number;
  logBuffer: string[];
  meta: Record<string, unknown>;
}

export interface NotificationAction {
  label: string;
  variant: "primary" | "destructive" | "ghost";
  onClick: () => void;
}

export interface AppNotification {
  id: string;
  severity: NotificationSeverity;
  source: NotificationSource;
  title: string;
  body?: string;
  timestamp: number;
  read: boolean;
  persistent: boolean;
  actions?: NotificationAction[];
  task?: TaskProgress;
  deeplink?: string;
}

export interface WailsNotificationPayload {
  severity: NotificationSeverity;
  source: NotificationSource;
  title: string;
  body?: string;
  persistent?: boolean;
  deeplink?: string;
  actions?: {
    label: string;
    variant: "primary" | "destructive" | "ghost";
    event?: string;
  }[];
}

interface NotificationState {
  notifications: AppNotification[];
}

type NotificationPatch = Partial<Omit<AppNotification, "id" | "task">> & {
  task?: Partial<TaskProgress>;
};

export interface PendingPaneOpen {
  type: "deploy" | "build" | "define" | "packages";
  neuron: string;
}

interface NotificationsStore {
  state: NotificationState;
  focusTaskId: string | null;
  pendingOpen: PendingPaneOpen | null;
  addNotification: (n: Omit<AppNotification, "id" | "timestamp" | "read">) => string;
  updateNotification: (id: string, patch: NotificationPatch) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
  setFocusTaskId: (id: string | null) => void;
  setPendingOpen: (action: PendingPaneOpen | null) => void;
}

/** Actions (functions) are stripped and running-task log buffers dropped
 * before writing to SQLite; only persistent, settled notifications survive. */
type PersistedNotification = Omit<AppNotification, "actions">;

export const useNotificationsStore = create<NotificationsStore>()(
  persist(
    (set) => ({
      state: { notifications: [] },
      focusTaskId: null,
      pendingOpen: null,
      addNotification: (n) => {
        const id = crypto.randomUUID();
        set((s) => ({
          state: {
            notifications: [
              { ...n, id, timestamp: Date.now(), read: false },
              ...s.state.notifications,
            ],
          },
        }));
        return id;
      },
      updateNotification: (id, patch) =>
        set((s) => ({
          state: {
            notifications: s.state.notifications.map((n) => {
              if (n.id !== id) return n;
              const { task: taskPatch, ...rest } = patch;
              return {
                ...n,
                ...rest,
                task: taskPatch ? { ...(n.task ?? ({} as TaskProgress)), ...taskPatch } : n.task,
              };
            }),
          },
        })),
      markRead: (id) =>
        set((s) => ({
          state: {
            notifications: s.state.notifications.map((n) =>
              n.id === id ? { ...n, read: true } : n,
            ),
          },
        })),
      markAllRead: () =>
        set((s) => ({
          state: { notifications: s.state.notifications.map((n) => ({ ...n, read: true })) },
        })),
      dismiss: (id) =>
        set((s) => ({
          state: { notifications: s.state.notifications.filter((n) => n.id !== id) },
        })),
      clearAll: () => set({ state: { notifications: [] } }),
      setFocusTaskId: (focusTaskId) => set({ focusTaskId }),
      setPendingOpen: (pendingOpen) => set({ pendingOpen }),
    }),
    persistSqlite<NotificationsStore, PersistedNotification[]>({
      key: "alis:notifications",
      partialize: (s) =>
        s.state.notifications
          .filter((n) => n.persistent && n.task?.status !== "running")
          .map(({ actions: _actions, task, ...n }) => ({
            ...n,
            ...(task ? { task: { ...task, logBuffer: [] } } : {}),
          })),
      merge: (persisted, current) => {
        const persistedList = Array.isArray(persisted) ? (persisted as AppNotification[]) : [];
        // Keep any notification added between module load and hydration completing
        // (e.g. a backend event wired via wireOnce at import time) instead of
        // wholesale replacing with only the persisted set.
        const persistedIds = new Set(persistedList.map((n) => n.id));
        const pending = current.state.notifications.filter((n) => !persistedIds.has(n.id));
        return {
          ...current,
          state: {
            notifications: [...pending, ...persistedList].sort((a, b) => b.timestamp - a.timestamp),
          },
        };
      },
    }),
  ),
);

hydrateWhenReady(useNotificationsStore);

interface NotificationsValue extends NotificationsStore {
  unreadCount: number;
}

export function useNotifications(): NotificationsValue {
  const store = useNotificationsStore();
  return {
    ...store,
    unreadCount: store.state.notifications.filter((n) => !n.read).length,
  };
}
