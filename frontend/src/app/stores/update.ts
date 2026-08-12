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
  rollback?: boolean;
}

interface UpdateStore {
  updateInfo: UpdateInfo | null;
  downloadProgress: DownloadProgress | null;
  installError: string | null;
  notesOpen: boolean;
  updateDismissed: boolean;
  checkingUpdate: boolean;
  /** Release channel this install follows. Go owns the persisted value. */
  channel: UpdateChannel;
  switchingChannel: boolean;
  /** In-flight download guard. Lives in state so the UI can disable controls. */
  downloading: boolean;
  /** Current stable release, used to offer a rollback off a beta build. */
  stableInfo: UpdateInfo | null;
  setNotesOpen: (open: boolean) => void;
  dismissUpdate: () => void;
  loadChannel: () => Promise<void>;
  setChannel: (channel: UpdateChannel) => Promise<void>;
  refreshStable: () => Promise<void>;
  rollbackToStable: () => Promise<void>;
  checkForUpdate: () => Promise<UpdateInfo>;
  startDownload: (info?: UpdateInfo, opts?: { rollback?: boolean }) => Promise<void>;
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
  switchingChannel: false,
  downloading: false,
  stableInfo: null,
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
  setChannel: async (channel) => {
    if (get().channel === channel || get().downloading) return;
    set({ switchingChannel: true });
    try {
      // Awaited so the setting is committed before Go reads it back on the
      // check below. Switching also invalidates whatever the other channel said.
      await UpdaterService.SetChannel(channel);
      set({
        channel,
        updateInfo: null,
        downloadProgress: null,
        installError: null,
        updateDismissed: false,
      });
      await get().checkForUpdate();
      await get().refreshStable();
    } finally {
      set({ switchingChannel: false });
    }
  },
  refreshStable: async () => {
    try {
      set({ stableInfo: (await UpdaterService.StableRollback()) as UpdateInfo });
    } catch {
      set({ stableInfo: null });
    }
  },
  rollbackToStable: async () => {
    const target = get().stableInfo;
    if (!target || get().downloading) return;
    await get().startDownload(target, { rollback: true });
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
  startDownload: async (info, opts) => {
    const target = info ?? get().updateInfo;
    if (!target || get().downloading) return;

    const rollback = opts?.rollback ?? false;
    set({
      downloading: true,
      installError: null,
      downloadProgress: { downloaded: 0, total: 0, done: false, rollback },
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
            rollback: p.rollback ?? rollback,
          },
        });
        return;
      }
      set({
        downloadProgress: {
          downloaded: p.downloaded,
          total: p.total,
          done: false,
          rollback,
        },
      });
    });

    try {
      await (rollback ? UpdaterService.DownloadStable() : UpdaterService.DownloadUpdate());
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
