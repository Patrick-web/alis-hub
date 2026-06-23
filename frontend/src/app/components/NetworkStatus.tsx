import { useEffect } from 'react';
import { notify } from '../lib/notify';

const TOAST_ID = 'network-offline';

export function NetworkStatus() {
  useEffect(() => {
    if (!navigator.onLine) {
      notify.warning('No internet connection', {
        id: TOAST_ID,
        description: 'Check your network and try again.',
        persistent: true,
      });
    }

    function handleOffline() {
      notify.warning('No internet connection', {
        id: TOAST_ID,
        description: 'Check your network and try again.',
        persistent: true,
      });
    }

    function handleOnline() {
      notify.dismiss(TOAST_ID);
      notify.success('Back online', { duration: 3000 });
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return null;
}
