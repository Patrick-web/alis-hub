import { useEffect, useState } from 'react';
import { Events, Browser } from '@wailsio/runtime';
import { toast } from 'sonner';
import * as UpdaterService from '../../../bindings/alis-hub-v3/internal/updater/service';
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

export function UpdateToast() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    const offAvailable = Events.On('update:available', (ev) => {
      const info = ev.data as UpdateInfo;
      setUpdateInfo(info);
      toast(`Update available: v${info.latestVersion}`, {
        duration: Infinity,
        action: {
          label: 'Download',
          onClick: () => handleDownload(info),
        },
        cancel: {
          label: 'Release notes',
          onClick: () => setNotesOpen(true),
        },
      });
    });

    return () => { offAvailable(); };
  }, []);

  async function handleDownload(info: UpdateInfo) {
    // Windows: open release page instead
    if (navigator.userAgent.includes('Windows')) {
      Browser.OpenURL(info.releaseUrl);
      return;
    }

    const toastId = toast.loading('Downloading update…', { duration: Infinity });

    const offProgress = Events.On('update:progress', (ev) => {
      const p = ev.data as DownloadProgress;
      if (p.error) {
        toast.error(`Download failed: ${p.error}`, { id: toastId });
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
        toast.loading(`Downloading… ${pct}%`, { id: toastId });
      }
    });

    try {
      await UpdaterService.DownloadUpdate();
    } catch (err) {
      toast.error(`Download failed: ${String(err)}`, { id: toastId });
    }
  }

  async function applyUpdate(toastId: string | number) {
    try {
      await UpdaterService.ApplyUpdate();
      toast.success('Restarting…', { id: toastId });
    } catch (err) {
      toast.error(`Failed to apply update: ${String(err)}`, { id: toastId });
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
