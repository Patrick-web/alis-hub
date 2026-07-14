import { useEffect, useRef } from 'react';
import { Events } from '@wailsio/runtime';
import { notify } from '../lib/notify';
import { systemNotify, isSystemNotificationsEnabled, requestNotificationAuthorization, setSystemNotificationsEnabled } from '../lib/systemNotify';
import { useNotifications } from '../stores/notifications';
import type { WailsNotificationPayload } from '../stores/notifications';
import { useUpdate } from '../stores/update';
import { ReleaseNotesModal } from './ReleaseNotesModal';
import { UpdateNotification } from './UpdateNotification';

export function WailsNotificationBridge() {
  const { addNotification } = useNotifications();
  const {
    updateInfo,
    downloadProgress,
    installError,
    notesOpen,
    updateDismissed,
    setNotesOpen,
    dismissUpdate,
    startDownload,
    applyUpdate,
  } = useUpdate();

  const addRef = useRef(addNotification);
  addRef.current = addNotification;

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
        deeplink: payload.deeplink,
        actions: payload.actions?.map(a => ({
          label: a.label,
          variant: a.variant,
          onClick: () => {
            if (a.event) Events.Emit(a.event);
          },
        })),
      });
      notify[payload.severity](payload.title, {
        description: payload.body,
        ...(payload.deeplink
          ? {
              action: {
                label: 'View',
                onClick: () => Events.Emit('deep-link', payload.deeplink),
              },
            }
          : {}),
      });
      systemNotify(payload.title, payload.body ?? '', payload.deeplink);
    });

    return () => {
      offPush();
    };
  }, []);

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
          onDismiss={dismissUpdate}
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
