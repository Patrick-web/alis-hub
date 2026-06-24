import { useEffect, useRef, useState } from 'react';
import { Events, Browser } from '@wailsio/runtime';
import * as UpdaterService from '../../../bindings/alis-hub-v3/internal/updater/service';
import { notify } from '../lib/notify';
import { systemNotify, isSystemNotificationsEnabled, requestNotificationAuthorization, setSystemNotificationsEnabled } from '../lib/systemNotify';
import { useNotifications } from '../stores/notifications';
import type { WailsNotificationPayload } from '../stores/notifications';
import { ReleaseNotesModal } from './ReleaseNotesModal';
import { UpdateNotification } from './UpdateNotification';

interface UpdateInfo {
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

export function WailsNotificationBridge() {
  const { addNotification } = useNotifications();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  const addRef = useRef(addNotification);
  addRef.current = addNotification;
  const setNotesOpenRef = useRef(setNotesOpen);
  setNotesOpenRef.current = setNotesOpen;
  // Guard so the auto-start only fires once per detected update
  const downloadingRef = useRef(false);

  useEffect(() => {
    if (isSystemNotificationsEnabled()) {
      requestNotificationAuthorization().then(granted => {
        if (!granted) setSystemNotificationsEnabled(false);
      });
    }

    const offPush = Events.On('notification:push', (ev) => {
      const payload = ev.data as WailsNotificationPayload;
      addRef.current({
        severity: payload.severity,
        source: payload.source,
        title: payload.title,
        body: payload.body,
        persistent: payload.persistent ?? true,
        actions: payload.actions?.map(a => ({
          label: a.label,
          variant: a.variant,
          onClick: () => {
            if (a.event) Events.Emit(a.event);
          },
        })),
      });
      notify[payload.severity](payload.title, { description: payload.body });
      systemNotify(payload.title, payload.body ?? '');
    });

    const offAvailable = Events.On('update:available', (ev) => {
      const info = ev.data as UpdateInfo;
      setUpdateInfo(info);
      setUpdateDismissed(false);
      setDownloadProgress(null);
      setInstallError(null);
      downloadingRef.current = false;
      addRef.current({
        severity: 'info',
        source: 'update',
        title: `Update available: v${info.latestVersion}`,
        persistent: true,
        actions: [
          {
            label: 'Release Notes',
            variant: 'ghost',
            onClick: () => setNotesOpenRef.current(true),
          },
        ],
      });
      // Auto-start download — card is the single place to monitor progress
      startDownload(info);
    });

    return () => {
      offPush();
      offAvailable();
    };
  }, []);

  async function startDownload(info: UpdateInfo) {
    if (downloadingRef.current) return;

    if (navigator.userAgent.includes('Windows')) {
      Browser.OpenURL(info.releaseUrl);
      return;
    }

    downloadingRef.current = true;
    setDownloadProgress({ downloaded: 0, total: 0, done: false });

    const offProgress = Events.On('update:progress', (ev) => {
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
  }

  async function applyUpdate() {
    setInstallError(null);
    try {
      await UpdaterService.ApplyUpdate();
      // Go will quit the app after ~300ms
    } catch (err) {
      const msg = String(err);
      setInstallError(msg);
      notify.error(`Failed to install update: ${msg}`);
    }
  }

  return (
    <>
      {updateInfo && !updateDismissed && (
        <UpdateNotification
          info={updateInfo}
          progress={downloadProgress}
          installError={installError}
          onInstall={applyUpdate}
          onRetryDownload={() => startDownload(updateInfo)}
          onViewNotes={() => setNotesOpen(true)}
          onDismiss={() => setUpdateDismissed(true)}
        />
      )}
      {updateInfo && (
        <ReleaseNotesModal
          open={notesOpen}
          onOpenChange={setNotesOpen}
          currentVersion={updateInfo.currentVersion}
          latestVersion={updateInfo.latestVersion}
          releaseNotes={updateInfo.releaseNotes}
          releaseUrl={updateInfo.releaseUrl}
        />
      )}
    </>
  );
}
