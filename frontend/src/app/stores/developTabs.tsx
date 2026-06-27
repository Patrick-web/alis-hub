import { create } from 'zustand';
import type { AppNotification, TaskType } from './notifications';

export interface DevelopTab {
  id: string;
  type: TaskType;
  neuron: string;
  notificationId?: string;
  restore?: AppNotification;
}

interface DevelopTabsStore {
  tabs: DevelopTab[];
  activeTabId: string | null;
  openTab: (type: TaskType, neuron: string, restore?: AppNotification) => void;
  closeTab: (id: string) => void;
  closeMultiple: (ids: string[]) => void;
  activateTab: (id: string) => void;
  setTabNotificationId: (tabId: string, notifId: string) => void;
}

export const useDevelopTabs = create<DevelopTabsStore>((set) => ({
  tabs: [],
  activeTabId: null,
  openTab: (type, neuron, restore) => set(state => {
    const existing = state.tabs.find(t => t.type === type && t.neuron === neuron);
    if (existing) return { activeTabId: existing.id };
    const id = crypto.randomUUID();
    return { tabs: [...state.tabs, { id, type, neuron, restore }], activeTabId: id };
  }),
  closeTab: (id) => set(state => {
    const next = state.tabs.filter(t => t.id !== id);
    return { tabs: next, activeTabId: state.activeTabId === id ? (next[next.length - 1]?.id ?? null) : state.activeTabId };
  }),
  closeMultiple: (ids) => set(state => {
    const idSet = new Set(ids);
    const next = state.tabs.filter(t => !idSet.has(t.id));
    const activeStillPresent = next.some(t => t.id === state.activeTabId);
    return { tabs: next, activeTabId: activeStillPresent ? state.activeTabId : (next[next.length - 1]?.id ?? null) };
  }),
  activateTab: (id) => set({ activeTabId: id }),
  setTabNotificationId: (tabId, notifId) => set(state => ({
    tabs: state.tabs.map(t => t.id === tabId ? { ...t, notificationId: notifId } : t),
  })),
}));
