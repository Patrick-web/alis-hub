import { useEffect, useRef, useState } from 'react';
import { Events, Browser } from '@wailsio/runtime';
import * as UpdaterService from '../../../bindings/alis-hub-v3/internal/updater/service';
import { notify } from '../lib/notify';
import { useNotifications } from '../stores/notifications';
import type { WailsNotificationPayload } from '../stores/notifications';
import { ReleaseNotesModal } from './ReleaseNotesModal';

interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes: string;
}

interface DownloadProgress {
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

  // Stable ref so closures inside useEffect always see the latest addNotification
  const addRef = useRef(addNotification);
  addRef.current = addNotification;
  const setNotesOpenRef = useRef(setNotesOpen);
  setNotesOpenRef.current = setNotesOpen;

  useEffect(() => {
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
    });

    const offAvailable = Events.On('update:available', (ev) => {
      const info = ev.data as UpdateInfo;
      setUpdateInfo(info);
      addRef.current({
        severity: 'info',
        source: 'update',
        title: `Update available: v${info.latestVersion}`,
        persistent: true,
        actions: [
          {
            label: 'Download',
            variant: 'primary',
            onClick: () => handleDownload(info),
          },
          {
            label: 'Release notes',
            variant: 'ghost',
            onClick: () => setNotesOpenRef.current(true),
          },
        ],
      });
      notify.info(`Update available: v${info.latestVersion}`, {
        persistent: true,
        action: { label: 'Download', onClick: () => handleDownload(info) },
        cancel: { label: 'Release notes', onClick: () => setNotesOpenRef.current(true) },
      });
    });

    return () => {
      offPush();
      offAvailable();
    };
  }, []);

  async function handleDownload(info: UpdateInfo) {
    if (navigator.userAgent.includes('Windows')) {
      Browser.OpenURL(info.releaseUrl);
      return;
    }

    const toastId = notify.loading('Downloading update…');

    const offProgress = Events.On('update:progress', (ev) => {
      const p = ev.data as DownloadProgress;
      if (p.error) {
        notify.error(`Download failed: ${p.error}`, { id: toastId });
        offProgress();
        return;
      }
      if (p.done && p.path) {
        offProgress();
        applyUpdate(toastId);
        return;
      }
      if (p.total > 0) {
        const pct = Math.round((p.downloaded / p.total) * 100);
        notify.loading(`Downloading… ${pct}%`, { id: toastId });
      }
    });

    try {
      await UpdaterService.DownloadUpdate();
    } catch {
      // error is surfaced via the update:progress event
    }
  }

  async function applyUpdate(toastId: string | number) {
    try {
      await UpdaterService.ApplyUpdate();
      notify.success('Restarting…', { id: toastId });
    } catch (err) {
      notify.error(`Failed to apply update: ${String(err)}`, { id: toastId });
    }
  }

  return (
    <>
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
