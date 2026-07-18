import { create } from "zustand";

export type ToolTab = "buckets" | "logs" | "artifactregistry" | "secrets" | "spanner" | "backups";

interface GCloudStore {
  ready: boolean;
  activeTab: ToolTab;
  setReady: (ready: boolean) => void;
  setActiveTab: (tab: ToolTab) => void;
  openTool: (tab: ToolTab) => void;
  isAuthError: (e: unknown) => boolean;
  handleError: (e: unknown) => boolean;
}

export const useGCloud = create<GCloudStore>((set, get) => ({
  ready: false,
  activeTab: "buckets",
  setReady: (ready) => set({ ready }),
  setActiveTab: (activeTab) => set({ activeTab }),
  openTool: (activeTab) => set({ activeTab, ready: true }),
  isAuthError: (e) => {
    const s = String(e).toLowerCase();
    return (
      s.includes("not authenticated") ||
      s.includes("gcloud auth login") ||
      s.includes("empty token")
    );
  },
  handleError: (e) => {
    if (get().isAuthError(e)) {
      set({ ready: false });
      return true;
    }
    return false;
  },
}));
