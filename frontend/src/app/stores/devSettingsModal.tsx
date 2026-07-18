import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type DevSettingsTab = "platform" | "notifications" | "ai" | "logs";

interface DevSettingsModalState {
  isOpen: boolean;
  activeTab: DevSettingsTab;
  open: (tab?: DevSettingsTab) => void;
  close: () => void;
  toggle: () => void;
}

const DevSettingsModalContext = createContext<DevSettingsModalState | null>(null);

export function DevSettingsModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DevSettingsTab>("platform");

  const open = useCallback((tab?: DevSettingsTab) => {
    if (tab) setActiveTab(tab);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  return (
    <DevSettingsModalContext.Provider value={{ isOpen, activeTab, open, close, toggle }}>
      {children}
    </DevSettingsModalContext.Provider>
  );
}

export function useDevSettingsModal(): DevSettingsModalState {
  const ctx = useContext(DevSettingsModalContext);
  if (!ctx) throw new Error("useDevSettingsModal must be used within DevSettingsModalProvider");
  return ctx;
}
