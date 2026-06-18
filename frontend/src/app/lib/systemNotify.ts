import * as NotificationService from '../../../bindings/github.com/wailsapp/wails/v3/pkg/services/notifications/notificationservice';

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

export async function requestNotificationAuthorization(): Promise<boolean> {
  try {
    return await NotificationService.RequestNotificationAuthorization();
  } catch {
    return false;
  }
}

/**
 * Fires a native macOS notification via the Wails notification service.
 * Best-effort: silently swallows errors.
 * No-ops if the user has not opted in via alis:systemNotifications.
 */
export async function systemNotify(title: string, body: string): Promise<void> {
  if (!isSystemNotificationsEnabled()) return;
  try {
    await NotificationService.SendNotification({
      id: crypto.randomUUID(),
      title,
      body,
    });
  } catch {
    // best-effort — system notifications are never critical
  }
}
