import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Events } from '@wailsio/runtime';
import { useNotifications } from '../stores/notifications';
import { parseDeepLink } from '../lib/deepLink';

export function DeepLinkHandler() {
  const navigate = useNavigate();
  const { setPendingOpen } = useNotifications();
  const setPendingOpenRef = useRef(setPendingOpen);
  setPendingOpenRef.current = setPendingOpen;

  useEffect(() => {
    const off = Events.On('deep-link', (ev) => {
      const url = ev.data as string;
      if (!url) return;

      const parsed = parseDeepLink(url);
      if (!parsed) return;

      switch (parsed.route) {
        case '/develop':
          setPendingOpenRef.current(parsed.params);
          navigate('/develop');
          break;
      }
    });

    return () => off();
  }, [navigate, setPendingOpen]);

  return null;
}
