import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useReducer,
  useEffect,
  type ReactNode,
} from 'react';

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';
export type NotificationSource =
  | 'system'
  | 'build'
  | 'deploy'
  | 'git'
  | 'update'
  | 'general';

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

type StoreAction =
  | { type: 'ADD'; payload: AppNotification }
  | { type: 'MARK_READ'; payload: string }
  | { type: 'MARK_ALL_READ' }
  | { type: 'DISMISS'; payload: string }
  | { type: 'CLEAR_ALL' };

interface NotificationContextValue {
  state: NotificationState;
  addNotification: (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
  unreadCount: number;
}

const STORAGE_KEY = 'alis:notifications';

function loadFromStorage(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToStorage(notifications: AppNotification[]) {
  try {
    // Strip action closures — they can't be serialised
    const serialisable = notifications
      .filter(n => n.persistent)
      .map(({ actions: _actions, ...n }) => n);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialisable));
  } catch {}
}

function reducer(state: NotificationState, action: StoreAction): NotificationState {
  switch (action.type) {
    case 'ADD':
      return { notifications: [action.payload, ...state.notifications] };
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

  useEffect(() => {
    saveToStorage(state.notifications);
  }, [state.notifications]);

  const addNotification = useCallback(
    (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
      dispatch({
        type: 'ADD',
        payload: { ...n, id: crypto.randomUUID(), timestamp: Date.now(), read: false },
      });
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
      value={{ state, addNotification, markRead, markAllRead, dismiss, clearAll, unreadCount }}
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
