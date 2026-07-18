import { create } from "zustand";

export type ProfileTab =
  | "account"
  | "appearance"
  | "tabs"
  | "notifications"
  | "labs"
  | "updates"
  | "source-control"
  | "develop"
  | "tools"
  | "environments";

interface ProfileModalState {
  isOpen: boolean;
  initialTab: ProfileTab | null;
  open: (tab?: ProfileTab) => void;
  close: () => void;
}

export const useProfileModal = create<ProfileModalState>((set) => ({
  isOpen: false,
  initialTab: null,
  open: (tab) => set({ isOpen: true, initialTab: tab ?? null }),
  close: () => set({ isOpen: false }),
}));
