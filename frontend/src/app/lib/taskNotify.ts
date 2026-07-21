import type { useNotifications, NotificationAction } from "../stores/notifications";
import { notify } from "./notify";
import { systemNotify } from "./systemNotify";

type UpdateNotification = ReturnType<typeof useNotifications>["updateNotification"];

interface CompleteTaskOptions {
  id: string;
  severity: "success" | "error";
  title: string;
  body?: string;
  taskStatus: "done" | "error";
  taskPatch?: Record<string, unknown>;
  actions?: NotificationAction[];
}

// Updates the persistent task notification and fires the matching
// toast + native OS notification. Call once per Run outcome, never on start.
export function completeTaskNotification(
  updateNotification: UpdateNotification,
  opts: CompleteTaskOptions,
): void {
  updateNotification(opts.id, {
    severity: opts.severity,
    title: opts.title,
    ...(opts.body !== undefined ? { body: opts.body } : {}),
    ...(opts.actions ? { actions: opts.actions } : {}),
    task: { status: opts.taskStatus, ...opts.taskPatch },
  });

  const primary = opts.actions?.[0];
  const toastFn = opts.severity === "success" ? notify.success : notify.error;
  toastFn(opts.title, {
    description: opts.body,
    action: primary ? { label: primary.label, onClick: primary.onClick } : undefined,
  });

  systemNotify(opts.title, opts.body ?? opts.title);
}
