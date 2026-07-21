import { toast } from "sonner";

export type NotifyOptions = {
  description?: string;
  action?: { label: string; onClick: () => void };
  cancel?: { label: string; onClick: () => void };
  duration?: number;
  id?: string | number;
  persistent?: boolean;
};

const DURATIONS = {
  success: 4_000,
  error: 8_000,
  warning: 6_000,
  info: 4_000,
  loading: Infinity,
} as const;

function buildToastOptions(base: number, opts?: NotifyOptions) {
  return {
    description: opts?.description,
    action: opts?.action
      ? { label: opts.action.label, onClick: () => opts.action!.onClick() }
      : undefined,
    cancel: opts?.cancel
      ? { label: opts.cancel.label, onClick: () => opts.cancel!.onClick() }
      : undefined,
    duration: opts?.persistent ? Infinity : (opts?.duration ?? base),
    id: opts?.id,
  };
}

export const notify = {
  success(message: string, opts?: NotifyOptions) {
    return toast.success(message, buildToastOptions(DURATIONS.success, opts));
  },
  error(message: string, opts?: NotifyOptions) {
    return toast.error(message, buildToastOptions(DURATIONS.error, opts));
  },
  warning(message: string, opts?: NotifyOptions) {
    return toast.warning(message, buildToastOptions(DURATIONS.warning, opts));
  },
  info(message: string, opts?: NotifyOptions) {
    return toast.info(message, buildToastOptions(DURATIONS.info, opts));
  },
  loading(message: string, opts?: NotifyOptions) {
    return toast.loading(message, buildToastOptions(DURATIONS.loading, opts));
  },
  promise<T>(
    promise: Promise<T>,
    opts: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: unknown) => string);
    },
  ) {
    return toast.promise(promise, opts);
  },
  dismiss(id?: string | number) {
    toast.dismiss(id);
  },
};
