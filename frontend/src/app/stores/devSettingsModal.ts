import { create } from "zustand";

export type DevSettingsTab = "platform" | "notifications" | "ai" | "logs";

interface DevSettingsModalState {
  isOpen: boolean;
  activeTab: DevSettingsTab;
  open: (tab?: DevSettingsTab) => void;
  close: () => void;
  toggle: () => void;
}

export const useDevSettingsModal = create<DevSettingsModalState>((set) => ({
  isOpen: false,
  activeTab: "platform",
  open: (tab) => set((s) => ({ isOpen: true, activeTab: tab ?? s.activeTab })),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));
