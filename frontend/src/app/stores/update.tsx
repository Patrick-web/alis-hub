import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Events, Browser } from "@wailsio/runtime";
import * as UpdaterService from "../../../bindings/alis-hub-v3/internal/updater/service";
import { notify } from "../lib/notify";
import { useNotifications } from "./notifications";

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

interface UpdateContextValue {
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

const UpdateContext = createContext<UpdateContextValue | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const { addNotification } = useNotifications();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const addRef = useRef(addNotification);
  addRef.current = addNotification;
  const updateInfoRef = useRef(updateInfo);
  updateInfoRef.current = updateInfo;
  // Guard so the auto-start only fires once per detected update
  const downloadingRef = useRef(false);

  const startDownload = useCallback(async (info?: UpdateInfo) => {
    const target = info ?? updateInfoRef.current;
    if (!target || downloadingRef.current) return;

    if (navigator.userAgent.includes("Windows")) {
      Browser.OpenURL(target.releaseUrl);
      return;
    }

    downloadingRef.current = true;
    setInstallError(null);
    setDownloadProgress({ downloaded: 0, total: 0, done: false });

    const offProgress = Events.On("update:progress", (ev) => {
      const p = ev.data as DownloadProgress;
      if (p.error) {
        setDownloadProgress(null);
        downloadingRef.current = false;
        notify.error(`Download failed: ${p.error}`);
        offProgress();
        return;
      }
      if (p.done) {
        offProgress();
        downloadingRef.current = false;
        setDownloadProgress({ downloaded: p.downloaded, total: p.total, done: true });
        return;
      }
      setDownloadProgress({ downloaded: p.downloaded, total: p.total, done: false });
    });

    try {
      await UpdaterService.DownloadUpdate();
    } catch {
      // errors are surfaced via the update:progress event
    }
  }, []);

  useEffect(() => {
    const offAvailable = Events.On("update:available", (ev) => {
      const info = ev.data as UpdateInfo;
      setUpdateInfo(info);
      setUpdateDismissed(false);
      setDownloadProgress(null);
      setInstallError(null);
      downloadingRef.current = false;
      addRef.current({
        severity: "info",
        source: "update",
        title: `Update available: v${info.latestVersion}`,
        persistent: true,
        actions: [
          {
            label: "Release Notes",
            variant: "ghost",
            onClick: () => setNotesOpen(true),
          },
        ],
      });
      // Auto-start download — overlay is the single place to monitor progress
      startDownload(info);
    });

    return () => {
      offAvailable();
    };
  }, [startDownload]);

  const checkForUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      const info = (await UpdaterService.CheckForUpdate()) as UpdateInfo;
      setUpdateInfo(info);
      return info;
    } finally {
      setCheckingUpdate(false);
    }
  }, []);

  const applyUpdate = useCallback(async () => {
    setInstallError(null);
    try {
      await UpdaterService.ApplyUpdate();
      // Go will quit the app after ~300ms
    } catch (err) {
      const msg = String(err);
      setInstallError(msg);
      notify.error(`Failed to install update: ${msg}`);
    }
  }, []);

  const dismissUpdate = useCallback(() => setUpdateDismissed(true), []);

  return (
    <UpdateContext.Provider
      value={{
        updateInfo,
        downloadProgress,
        installError,
        notesOpen,
        updateDismissed,
        checkingUpdate,
        setNotesOpen,
        dismissUpdate,
        checkForUpdate,
        startDownload,
        applyUpdate,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}

export function useUpdate() {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error("useUpdate must be used within UpdateProvider");
  return ctx;
}
