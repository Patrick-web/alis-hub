import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

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

const ProfileModalContext = createContext<ProfileModalState | null>(null);

export function ProfileModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<ProfileTab | null>(null);

  const open = useCallback((tab?: ProfileTab) => {
    setInitialTab(tab ?? null);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <ProfileModalContext.Provider value={{ isOpen, initialTab, open, close }}>
      {children}
    </ProfileModalContext.Provider>
  );
}

export function useProfileModal(): ProfileModalState {
  const ctx = useContext(ProfileModalContext);
  if (!ctx) throw new Error("useProfileModal must be used within ProfileModalProvider");
  return ctx;
}
