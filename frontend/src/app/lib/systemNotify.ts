import * as NotificationService from '../../../bindings/github.com/wailsapp/wails/v3/pkg/services/notifications/notificationservice';
import * as settingsClient from './settingsClient';

const PREF_KEY = 'alis:systemNotifications';

export function isSystemNotificationsEnabled(): boolean {
  return settingsClient.getCached(PREF_KEY) === 'true';
}

export function setSystemNotificationsEnabled(enabled: boolean): void {
  settingsClient.set(PREF_KEY, String(enabled));
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
export async function systemNotify(title: string, body: string, deeplink?: string): Promise<void> {
  if (!isSystemNotificationsEnabled()) return;
  try {
    await NotificationService.SendNotification({
      id: crypto.randomUUID(),
      title,
      body,
      ...(deeplink ? { data: { deeplink } } : {}),
    });
  } catch {
  }
}
