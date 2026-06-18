import * as NotificationService from '../../../bindings/alis-hub-v3/internal/notifications/service';

const PREF_KEY = 'alis:systemNotifications';

export function isSystemNotificationsEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setSystemNotificationsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, String(enabled));
  } catch {}
}

/**
 * Fires a native macOS notification. Best-effort: silently swallows errors.
 * No-ops if the user has not opted in via alis:systemNotifications.
 */
export async function systemNotify(title: string, body: string): Promise<void> {
  if (!isSystemNotificationsEnabled()) return;
  try {
    await NotificationService.Send(title, body);
  } catch {
    // best-effort — system notifications are never critical
  }
}
