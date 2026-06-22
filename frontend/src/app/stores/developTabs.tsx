import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { AppNotification, TaskType } from './notifications';

export interface DevelopTab {
  id: string;
  type: TaskType;
  neuron: string;
  notificationId?: string;
  restore?: AppNotification;
}

interface DevelopTabsContextValue {
  tabs: DevelopTab[];
  activeTabId: string | null;
  openTab: (type: TaskType, neuron: string, restore?: AppNotification) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;
  setTabNotificationId: (tabId: string, notifId: string) => void;
}

const DevelopTabsContext = createContext<DevelopTabsContextValue | null>(null);

export function DevelopTabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<DevelopTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const openTab = useCallback((type: TaskType, neuron: string, restore?: AppNotification) => {
    setTabs(prev => {
      const existing = prev.find(t => t.type === type && t.neuron === neuron);
      if (existing) {
        setActiveTabId(existing.id);
        return prev;
      }
      const id = crypto.randomUUID();
      setActiveTabId(id);
      return [...prev, { id, type, neuron, restore }];
    });
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      setActiveTabId(cur => (cur === id ? (next[next.length - 1]?.id ?? null) : cur));
      return next;
    });
  }, []);

  const activateTab = useCallback((id: string) => setActiveTabId(id), []);

  const setTabNotificationId = useCallback((tabId: string, notifId: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, notificationId: notifId } : t));
  }, []);

  return (
    <DevelopTabsContext.Provider
      value={{ tabs, activeTabId, openTab, closeTab, activateTab, setTabNotificationId }}
    >
      {children}
    </DevelopTabsContext.Provider>
  );
}

export function useDevelopTabs() {
  const ctx = useContext(DevelopTabsContext);
  if (!ctx) throw new Error('useDevelopTabs must be used within DevelopTabsProvider');
  return ctx;
}
