import { create } from "zustand";
import { Events } from "@wailsio/runtime";
import * as UpdaterService from "../../../bindings/alis-hub-v3/internal/updater/service";
import { notify } from "../lib/notify";
import { useNotificationsStore } from "./notifications";
import { wireOnce } from "./lib/wireOnce";

export type UpdateChannel = "stable" | "beta";

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes: string;
  channel: UpdateChannel;
  isPrerelease: boolean;
}

export interface DownloadProgress {
  downloaded: number;
  total: number;
  done: boolean;
  error?: string;
  path?: string;
  version?: string;
}

interface UpdateStore {
  updateInfo: UpdateInfo | null;
  downloadProgress: DownloadProgress | null;
  installError: string | null;
  notesOpen: boolean;
  updateDismissed: boolean;
  checkingUpdate: boolean;
  /**
   * Release channel this build follows. Fixed at build time, not a setting:
   * stable and beta are separate applications that install side by side.
   */
  channel: UpdateChannel;
  /** In-flight download guard. Lives in state so the UI can disable controls. */
  downloading: boolean;
  /** Newest beta release, so the stable app can offer it. Null in the beta app. */
  betaInfo: UpdateInfo | null;
  setNotesOpen: (open: boolean) => void;
  dismissUpdate: () => void;
  loadChannel: () => Promise<void>;
  refreshBeta: () => Promise<void>;
  openBetaDownload: () => Promise<void>;
  checkForUpdate: () => Promise<UpdateInfo>;
  startDownload: (info?: UpdateInfo) => Promise<void>;
  applyUpdate: () => Promise<void>;
}

export const useUpdate = create<UpdateStore>((set, get) => ({
  updateInfo: null,
  downloadProgress: null,
  installError: null,
  notesOpen: false,
  updateDismissed: false,
  checkingUpdate: false,
  channel: "stable",
  downloading: false,
  betaInfo: null,
  setNotesOpen: (notesOpen) => set({ notesOpen }),
  dismissUpdate: () => set({ updateDismissed: true }),
  loadChannel: async () => {
    try {
      const channel = (await UpdaterService.Channel()) as UpdateChannel;
      set({ channel: channel === "beta" ? "beta" : "stable" });
    } catch {
      // Go defaults to stable; leave the store's default in place.
    }
  },
  refreshBeta: async () => {
    try {
      set({ betaInfo: (await UpdaterService.BetaRelease()) as UpdateInfo });
    } catch {
      set({ betaInfo: null });
    }
  },
  openBetaDownload: async () => {
    try {
      await UpdaterService.OpenBetaDownload();
    } catch (err) {
      notify.error(`Could not open the beta download: ${String(err)}`);
    }
  },
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
    if (!target || get().downloading) return;

    set({
      downloading: true,
      installError: null,
      downloadProgress: { downloaded: 0, total: 0, done: false },
    });

    let settled = false;
    const offProgress = Events.On("update:progress", (ev) => {
      const p = ev.data as DownloadProgress;
      if (p.error) {
        settled = true;
        set({ downloadProgress: null, downloading: false });
        notify.error(`Download failed: ${p.error}`);
        offProgress();
        return;
      }
      if (p.done) {
        settled = true;
        offProgress();
        set({
          downloading: false,
          downloadProgress: {
            downloaded: p.downloaded,
            total: p.total,
            done: true,
            version: p.version,
          },
        });
        return;
      }
      set({
        downloadProgress: { downloaded: p.downloaded, total: p.total, done: false },
      });
    });

    try {
      await UpdaterService.DownloadUpdate();
    } catch (err) {
      // Go emits a terminal update:progress on every failure path, but if it
      // ever returns without one, clear the guard here so the next download
      // isn't blocked forever.
      if (!settled) {
        offProgress();
        set({ downloadProgress: null, downloading: false });
        notify.error(`Download failed: ${String(err)}`);
      }
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
    useUpdate.setState({
      updateInfo: info,
      updateDismissed: false,
      downloadProgress: null,
      installError: null,
      downloading: false,
      channel: info.channel === "beta" ? "beta" : "stable",
    });
    useNotificationsStore.getState().addNotification({
      severity: "info",
      source: "update",
      title:
        info.channel === "beta"
          ? `Beta update available: v${info.latestVersion}`
          : `Update available: v${info.latestVersion}`,
      persistent: true,
      actions: [
        {
          label: "Release Notes",
          variant: "ghost",
          onClick: () => useUpdate.setState({ notesOpen: true }),
        },
      ],
    });
    // Auto-start download — overlay is the single place to monitor progress.
    // Only ever fires for real upgrades: this event comes from the background
    // check, which never uses the rollback path.
    void useUpdate.getState().startDownload(info);
  });
});
