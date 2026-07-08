import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useReducer,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import * as settingsClient from '../lib/settingsClient';

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';
export type NotificationSource =
  | 'system'
  | 'build'
  | 'deploy'
  | 'define'
  | 'packages'
  | 'git'
  | 'update'
  | 'general';

export type TaskType = 'define' | 'build' | 'deploy' | 'packages' | 'workflow';
export type TaskStatus = 'running' | 'done' | 'error';

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
  variant: 'primary' | 'destructive' | 'ghost';
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
}

export interface WailsNotificationPayload {
  severity: NotificationSeverity;
  source: NotificationSource;
  title: string;
  body?: string;
  persistent?: boolean;
  actions?: {
    label: string;
    variant: 'primary' | 'destructive' | 'ghost';
    event?: string;
  }[];
}

interface NotificationState {
  notifications: AppNotification[];
}

type NotificationPatch = Partial<Omit<AppNotification, 'id' | 'task'>> & {
  task?: Partial<TaskProgress>;
};

type StoreAction =
  | { type: 'ADD'; payload: AppNotification }
  | { type: 'UPDATE'; payload: { id: string; patch: NotificationPatch } }
  | { type: 'MARK_READ'; payload: string }
  | { type: 'MARK_ALL_READ' }
  | { type: 'DISMISS'; payload: string }
  | { type: 'CLEAR_ALL' };

export interface PendingPaneOpen {
  type: 'deploy' | 'build' | 'define';
  neuron: string;
}

interface NotificationContextValue {
  state: NotificationState;
  addNotification: (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => string;
  updateNotification: (id: string, patch: Partial<Omit<AppNotification, 'id' | 'task'>> & { task?: Partial<TaskProgress> }) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
  unreadCount: number;
  focusTaskId: string | null;
  setFocusTaskId: (id: string | null) => void;
  pendingOpen: PendingPaneOpen | null;
  setPendingOpen: (action: PendingPaneOpen | null) => void;
}

const STORAGE_KEY = 'alis:notifications';

function loadFromStorage(): AppNotification[] {
  try {
    const raw = settingsClient.getCached(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToStorage(notifications: AppNotification[]) {
  const serialisable = notifications
    .filter(n => n.persistent && n.task?.status !== 'running')
    .map(({ actions: _actions, task, ...n }) => ({
      ...n,
      ...(task ? { task: { ...task, logBuffer: [] } } : {}),
    }));
  settingsClient.set(STORAGE_KEY, JSON.stringify(serialisable));
}

function reducer(state: NotificationState, action: StoreAction): NotificationState {
  switch (action.type) {
    case 'ADD':
      return { notifications: [action.payload, ...state.notifications] };
    case 'UPDATE':
      return {
        notifications: state.notifications.map(n => {
          if (n.id !== action.payload.id) return n;
          const { task: taskPatch, ...rest } = action.payload.patch;
          return {
            ...n,
            ...rest,
            task: taskPatch ? { ...(n.task ?? {} as TaskProgress), ...taskPatch } : n.task,
          };
        }),
      };
    case 'MARK_READ':
      return {
        notifications: state.notifications.map(n =>
          n.id === action.payload ? { ...n, read: true } : n
        ),
      };
    case 'MARK_ALL_READ':
      return { notifications: state.notifications.map(n => ({ ...n, read: true })) };
    case 'DISMISS':
      return { notifications: state.notifications.filter(n => n.id !== action.payload) };
    case 'CLEAR_ALL':
      return { notifications: [] };
    default:
      return state;
  }
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    notifications: loadFromStorage(),
  }));
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [pendingOpen, setPendingOpen] = useState<PendingPaneOpen | null>(null);

  useEffect(() => {
    saveToStorage(state.notifications);
  }, [state.notifications]);

  const addNotification = useCallback(
    (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>): string => {
      const id = crypto.randomUUID();
      dispatch({
        type: 'ADD',
        payload: { ...n, id, timestamp: Date.now(), read: false },
      });
      return id;
    },
    []
  );

  const updateNotification = useCallback(
    (id: string, patch: NotificationPatch) => {
      dispatch({ type: 'UPDATE', payload: { id, patch } });
    },
    []
  );

  const markRead = useCallback(
    (id: string) => dispatch({ type: 'MARK_READ', payload: id }),
    []
  );
  const markAllRead = useCallback(() => dispatch({ type: 'MARK_ALL_READ' }), []);
  const dismiss = useCallback(
    (id: string) => dispatch({ type: 'DISMISS', payload: id }),
    []
  );
  const clearAll = useCallback(() => dispatch({ type: 'CLEAR_ALL' }), []);

  const unreadCount = useMemo(
    () => state.notifications.filter(n => !n.read).length,
    [state.notifications]
  );

  return (
    <NotificationContext.Provider
      value={{
        state,
        addNotification,
        updateNotification,
        markRead,
        markAllRead,
        dismiss,
        clearAll,
        unreadCount,
        focusTaskId,
        setFocusTaskId,
        pendingOpen,
        setPendingOpen,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
