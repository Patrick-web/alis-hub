import { create } from "zustand";
import { Events, Browser } from "@wailsio/runtime";
import * as UpdaterService from "../../../bindings/alis-hub-v3/internal/updater/service";
import { notify } from "../lib/notify";
import { useNotificationsStore } from "./notifications";
import { wireOnce } from "./lib/wireOnce";

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes: string;
}

export interface DownloadProgress {
  downloaded: number;
  total: number;
  done: boolean;
  error?: string;
  path?: string;
}

interface UpdateStore {
  updateInfo: UpdateInfo | null;
  downloadProgress: DownloadProgress | null;
  installError: string | null;
  notesOpen: boolean;
  updateDismissed: boolean;
  checkingUpdate: boolean;
  setNotesOpen: (open: boolean) => void;
  dismissUpdate: () => void;
  checkForUpdate: () => Promise<UpdateInfo>;
  startDownload: (info?: UpdateInfo) => Promise<void>;
  applyUpdate: () => Promise<void>;
}

// Guard so the auto-start only fires once per detected update
let downloading = false;

export const useUpdate = create<UpdateStore>((set, get) => ({
  updateInfo: null,
  downloadProgress: null,
  installError: null,
  notesOpen: false,
  updateDismissed: false,
  checkingUpdate: false,
  setNotesOpen: (notesOpen) => set({ notesOpen }),
  dismissUpdate: () => set({ updateDismissed: true }),
  checkForUpdate: async () => {
    set({ checkingUpdate: true });
    try {
      const info = (await UpdaterService.CheckForUpdate()) as UpdateInfo;
      set({ updateInfo: info });
      return info;
    } finally {
      set({ checkingUpdate: false });
    }
  },
  startDownload: async (info) => {
    const target = info ?? get().updateInfo;
    if (!target || downloading) return;

    if (navigator.userAgent.includes("Windows")) {
      Browser.OpenURL(target.releaseUrl);
      return;
    }

    downloading = true;
    set({ installError: null, downloadProgress: { downloaded: 0, total: 0, done: false } });

    const offProgress = Events.On("update:progress", (ev) => {
      const p = ev.data as DownloadProgress;
      if (p.error) {
        set({ downloadProgress: null });
        downloading = false;
        notify.error(`Download failed: ${p.error}`);
        offProgress();
        return;
      }
      if (p.done) {
        offProgress();
        downloading = false;
        set({ downloadProgress: { downloaded: p.downloaded, total: p.total, done: true } });
        return;
      }
      set({ downloadProgress: { downloaded: p.downloaded, total: p.total, done: false } });
    });

    try {
      await UpdaterService.DownloadUpdate();
    } catch {
      // errors are surfaced via the update:progress event
    }
  },
  applyUpdate: async () => {
    set({ installError: null });
    try {
      await UpdaterService.ApplyUpdate();
      // Go will quit the app after ~300ms
    } catch (err) {
      const msg = String(err);
      set({ installError: msg });
      notify.error(`Failed to install update: ${msg}`);
    }
  },
}));

wireOnce("update:events", () => {
  Events.On("update:available", (ev) => {
    const info = ev.data as UpdateInfo;
    downloading = false;
    useUpdate.setState({
      updateInfo: info,
      updateDismissed: false,
      downloadProgress: null,
      installError: null,
    });
    useNotificationsStore.getState().addNotification({
      severity: "info",
      source: "update",
      title: `Update available: v${info.latestVersion}`,
      persistent: true,
      actions: [
        {
          label: "Release Notes",
          variant: "ghost",
          onClick: () => useUpdate.setState({ notesOpen: true }),
        },
      ],
    });
    // Auto-start download — overlay is the single place to monitor progress
    void useUpdate.getState().startDownload(info);
  });
});
