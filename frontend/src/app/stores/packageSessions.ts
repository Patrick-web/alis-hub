import type { RefObject } from "react";
import { create } from "zustand";
import type { TerminalSession, PackageTerminalPaneHandle } from "../components/PackageTerminalPane";
import { useNotificationsStore } from "./notifications";
import { completeTaskNotification } from "../lib/taskNotify";
import { useLabs } from "./labs";
import { useSuggestions } from "./suggestions";
import { useLocalAI } from "./localai";
import { wireOnce } from "./lib/wireOnce";
import * as PackageService from "../../../bindings/alis-hub-v3/packageservice";

interface PackageSessionsStore {
  sessions: TerminalSession[];
  paneRef: RefObject<PackageTerminalPaneHandle>;
  addSessions: (newSessions: TerminalSession[]) => void;
  updateSession: (runID: string, patch: Partial<TerminalSession>) => void;
  closeSession: (runID: string) => void;
  clearSessions: () => void;
  setTaskId: (id: string | null) => void;
  onCloseSession: (runID: string) => void;
  onInput: (runID: string, data: string) => void;
  onResize: (runID: string, cols: number, rows: number) => void;
}

// Transient values (rule: keep non-rendered values out of reactive state):
// the terminal pane handle, per-run poll offsets, and the active task
// notification id live at module scope instead of in the store.
const paneRef: RefObject<PackageTerminalPaneHandle> = { current: null };
const pkgOffsets: Record<string, number> = {};
let taskId: string | null = null;

function notifyCancelled() {
  if (!taskId) return;
  completeTaskNotification(useNotificationsStore.getState().updateNotification, {
    id: taskId,
    severity: "error",
    title: "Packages cancelled",
    body: "Cancelled by user",
    taskStatus: "error",
  });
  taskId = null;
}

export const usePackageSessions = create<PackageSessionsStore>((set, get) => ({
  sessions: [],
  paneRef,
  addSessions: (newSessions) => {
    newSessions.forEach((s) => {
      pkgOffsets[s.runID] = 0;
    });
    set((prev) => ({ sessions: [...prev.sessions, ...newSessions] }));
  },
  updateSession: (runID, patch) =>
    set((prev) => ({
      sessions: prev.sessions.map((s) => (s.runID === runID ? { ...s, ...patch } : s)),
    })),
  closeSession: (runID) => {
    const prev = get().sessions;
    const closing = prev.find((s) => s.runID === runID);
    const remaining = prev.filter((s) => s.runID !== runID);
    if (closing && !closing.done && !closing.error) {
      const stillRunning = remaining.some((s) => !s.done && !s.error);
      if (!stillRunning) notifyCancelled();
    }
    set({ sessions: remaining });
  },
  clearSessions: () => {
    const running = get().sessions.filter((s) => !s.done && !s.error);
    running.forEach((s) => {
      PackageService.CancelPackageRun(s.runID).catch(() => {});
    });
    if (running.length > 0) notifyCancelled();
    set({ sessions: [] });
  },
  setTaskId: (id) => {
    taskId = id;
  },
  onCloseSession: (runID) => {
    PackageService.CancelPackageRun(runID).catch(() => {});
    get().closeSession(runID);
  },
  onInput: (runID, data) => {
    PackageService.WritePackageInput(runID, data).catch(() => {});
  },
  onResize: (runID, cols, rows) => {
    PackageService.ResizePackageTerminal(runID, cols, rows).catch(() => {});
  },
}));

// ── Polling loop — stays alive regardless of which page is mounted ────────────

async function pollTick() {
  const running = usePackageSessions.getState().sessions.filter((s) => !s.done && !s.error);
  for (const session of running) {
    try {
      const chunk = await PackageService.PollPackageRun(
        session.runID,
        pkgOffsets[session.runID] ?? 0,
      );
      if (!chunk) continue;
      if (chunk.content) paneRef.current?.write(session.runID, chunk.content);
      pkgOffsets[session.runID] = chunk.nextOffset;
      if (chunk.done || chunk.error) {
        usePackageSessions.setState((prev) => ({
          sessions: prev.sessions.map((s) =>
            s.runID === session.runID
              ? { ...s, done: chunk.done, error: chunk.error || undefined }
              : s,
          ),
        }));
      }
    } catch {
      // ignore individual poll errors
    }
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

function syncPolling() {
  const hasRunning = usePackageSessions.getState().sessions.some((s) => !s.done && !s.error);
  if (hasRunning && pollTimer === null) {
    pollTimer = setInterval(() => void pollTick(), 500);
  } else if (!hasRunning && pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// Update the status-strip notification when all sessions finish (runs even
// when off the Develop page), then surface follow-up suggestions.
function checkAllDone() {
  const { sessions } = usePackageSessions.getState();
  if (sessions.length === 0 || !taskId) return;
  const allDone = sessions.every((s) => s.done || s.error);
  if (!allDone) return;

  const hasErrors = sessions.some((s) => s.error);
  completeTaskNotification(useNotificationsStore.getState().updateNotification, {
    id: taskId,
    severity: hasErrors ? "error" : "success",
    title: hasErrors ? "Packages failed" : "Packages complete",
    body: sessions.map((s) => s.title).join(", "),
    taskStatus: hasErrors ? "error" : "done",
  });

  const { isSuggestionEnabled } = useLabs.getState();
  const { addSuggestion } = useSuggestions.getState();
  if (!hasErrors && isSuggestionEnabled("build-success-deploy")) {
    addSuggestion({
      definitionId: "build-success-deploy",
      category: "Build & Deploy",
      title: "Ready to deploy?",
      body: "All packages built successfully.",
      priority: "passive",
    });
  }
  if (!hasErrors && isSuggestionEnabled("packages-installed-commit")) {
    addSuggestion({
      definitionId: "packages-installed-commit",
      category: "Build & Deploy",
      title: "Commit package changes?",
      body: "Packages installed successfully. Stage and commit the updated files.",
      priority: "passive",
    });
  }
  if (hasErrors && isSuggestionEnabled("build-failure-verbose")) {
    addSuggestion({
      definitionId: "build-failure-verbose",
      category: "Build & Deploy",
      title: "Build failed",
      body: "Re-run with verbose output to see more detail.",
      priority: "passive",
    });
  }

  // AI contextual suggestion (fire-and-forget)
  const { state: localAIState, generate } = useLocalAI.getState();
  if (
    localAIState.enabled &&
    localAIState.modelPulled &&
    isSuggestionEnabled("ai-contextual-insight")
  ) {
    const outcome = hasErrors ? "failed with errors" : "completed successfully";
    generate(
      localAIState.model,
      "You are a helpful development assistant. Given a development event, suggest one concise actionable next step in 1-2 sentences. Be specific and practical.",
      `A package build just ${outcome}.`,
    )
      .then((body) => {
        if (body)
          addSuggestion({
            definitionId: "ai-contextual-insight",
            category: "AI Insights",
            title: "AI suggestion",
            body,
            priority: "passive",
          });
      })
      .catch(() => {});
  }

  taskId = null;
}

wireOnce("packageSessions:wiring", () => {
  usePackageSessions.subscribe(() => {
    syncPolling();
    checkAllDone();
  });
});
