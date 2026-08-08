import { create } from "zustand";
import { Events } from "@wailsio/runtime";
import { wireOnce } from "./lib/wireOnce";

/**
 * Live progress for define / build / deploy operations.
 *
 * The Go side follows each operation with `alis operations wait` and forwards
 * the CLI's stderr NDJSON as `dbd:progress`, then `dbd:done` when it settles.
 * That stream reports state changes as they happen, where the panes' poll loop
 * only sees them on its next tick.
 *
 * This store is deliberately *additive*. The poll remains the source of truth
 * for step transitions, notifications and chaining — everything with
 * consequences. What lands here is status text to fill the silence between
 * polls, so if the stream never arrives (no CLI, gRPC backend, a dropped
 * pipe) the panes behave exactly as they did before.
 *
 * Entries are keyed by operation name so several concurrent runs — a build in
 * one tab, a deploy in another — never overwrite each other.
 */

export interface DbdProgressEvent {
  operation: string;
  /** "define", "build" or "deploy". */
  kind: string;
  version: string;
  notes: string;
  state: string;
  logsUri: string;
  done: boolean;
  error: string;
  /** When this arrived, for staleness checks in the UI. */
  receivedAt: number;
}

interface DbdProgressState {
  byOperation: Record<string, DbdProgressEvent>;
}

interface DbdProgressStore {
  state: DbdProgressState;
  /** Drop an operation's entry once a pane is done with it. */
  clear: (operation: string) => void;
  /** Drop everything; used when a workspace switches. */
  clearAll: () => void;
}

export const useDbdProgress = create<DbdProgressStore>((set) => ({
  state: { byOperation: {} },
  clear: (operation) =>
    set((s) => {
      if (!s.state.byOperation[operation]) return s;
      const next = { ...s.state.byOperation };
      delete next[operation];
      return { state: { byOperation: next } };
    }),
  clearAll: () => set({ state: { byOperation: {} } }),
}));

function record(ev: unknown, done: boolean) {
  // Wails delivers the payload as either the event or its `data` field
  // depending on version, so accept both rather than depending on one.
  const d = ((ev as { data?: unknown })?.data ?? ev) as Partial<DbdProgressEvent> | undefined;
  const operation = d?.operation;
  if (!operation) return;

  useDbdProgress.setState((s) => {
    const prev = s.state.byOperation[operation];
    return {
      state: {
        byOperation: {
          ...s.state.byOperation,
          [operation]: {
            operation,
            kind: d?.kind ?? prev?.kind ?? "",
            // Progress lines carry only what changed, so an absent field means
            // "unchanged" rather than "cleared" — hence the fallback to prev.
            version: d?.version || prev?.version || "",
            notes: d?.notes || prev?.notes || "",
            state: d?.state || prev?.state || "",
            logsUri: d?.logsUri || prev?.logsUri || "",
            done: done || Boolean(d?.done),
            error: d?.error || prev?.error || "",
            receivedAt: Date.now(),
          },
        },
      },
    };
  });
}

wireOnce("dbd:events", () => {
  Events.On("dbd:progress", (ev: unknown) => record(ev, false));
  Events.On("dbd:done", (ev: unknown) => record(ev, true));
});

/**
 * Latest progress for one operation, or null when nothing has arrived.
 *
 * Pass the operation name a pane is currently running; an empty name yields
 * null, so callers need no conditional hook.
 */
export function useOperationProgress(operation: string | undefined | null) {
  return useDbdProgress((s) => (operation ? (s.state.byOperation[operation] ?? null) : null));
}

/**
 * The line to show for an operation: the CLI's own note, falling back to a
 * humanised state. Returns "" when there is nothing worth showing, so a caller
 * can render nothing rather than an empty box.
 */
export function progressLabel(ev: DbdProgressEvent | null): string {
  if (!ev) return "";
  if (ev.error) return ev.error;
  if (ev.notes) return ev.notes;
  if (!ev.state) return "";
  // States arrive as protobuf enum names.
  return ev.state.toLowerCase().replace(/_/g, " ");
}
