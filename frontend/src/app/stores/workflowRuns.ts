import { create } from "zustand";
import * as WorkflowService from "../../../bindings/alis-hub-v3/workflowservice";
import { useNotificationsStore } from "./notifications";
import { completeTaskNotification } from "../lib/taskNotify";
import { wireOnce } from "./lib/wireOnce";

export type StepRunStatus = {
  id: string;
  stepId: string;
  position: number;
  type: string;
  label: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  startedAt?: number;
  completedAt?: number;
  log?: string;
};

type RunLogChunk = {
  stepRuns: StepRunStatus[];
  logText: string;
  nextOffset: number;
  done: boolean;
};

export interface WorkflowRunEntry {
  runId: string;
  workflowName: string;
  startedAt: number;
  stepRuns: StepRunStatus[];
  logSegments: Record<string, string>;
  collapsedSections: Record<string, boolean>;
  currentStepRunId: string | null;
  offset: number;
  done: boolean;
  finalStatus: "running" | "success" | "failed";
  stopping: boolean;
  notificationId: string | null;
  notifyLogBuffer: string[]; // full accumulated log, mirrored into the status-bar notification's hover card
}

interface WorkflowRunsStore {
  runs: Record<string, WorkflowRunEntry>;
  startRun: (
    workflowId: string,
    workflowName: string,
    argValues: Record<string, string>,
    startPosition: number,
  ) => Promise<void>;
  stopRun: (workflowId: string) => Promise<void>;
  toggleSection: (workflowId: string, stepRunId: string) => void;
  // Which workflow is selected in the Workflows page list. Lives here (above
  // the router) rather than as local page state so it survives navigating
  // away from and back to the Workflows page.
  selectedWorkflowId: string | null;
  setSelectedWorkflowId: (id: string | null) => void;
}

export const useWorkflowRuns = create<WorkflowRunsStore>((set, get) => ({
  runs: {},
  selectedWorkflowId: null,
  setSelectedWorkflowId: (selectedWorkflowId) => set({ selectedWorkflowId }),
  startRun: async (workflowId, workflowName, argValues, startPosition) => {
    const { addNotification, updateNotification } = useNotificationsStore.getState();
    const notificationId = addNotification({
      severity: "info",
      source: "general",
      title: `Running workflow: ${workflowName}`,
      persistent: true,
      task: {
        type: "workflow",
        status: "running",
        neuronId: workflowName,
        step: "Starting…",
        startedAt: Date.now(),
        logBuffer: [],
        meta: { workflowId, workflowName },
      },
    });

    try {
      const runId = (await WorkflowService.RunWorkflow(
        workflowId,
        argValues,
        startPosition,
      )) as string;
      set((prev) => ({
        runs: {
          ...prev.runs,
          [workflowId]: {
            runId,
            workflowName,
            startedAt: Date.now(),
            stepRuns: [],
            logSegments: {},
            collapsedSections: {},
            currentStepRunId: null,
            offset: 0,
            done: false,
            finalStatus: "running",
            stopping: false,
            notificationId,
            notifyLogBuffer: [],
          },
        },
      }));
    } catch (e) {
      completeTaskNotification(updateNotification, {
        id: notificationId,
        severity: "error",
        title: `Workflow failed to start: ${workflowName}`,
        body: e instanceof Error ? e.message : String(e),
        taskStatus: "error",
      });
      throw e;
    }
  },
  stopRun: async (workflowId) => {
    const entry = get().runs[workflowId];
    if (!entry || entry.stopping) return;
    const patchStopping = (stopping: boolean) =>
      set((prev) =>
        prev.runs[workflowId]
          ? { runs: { ...prev.runs, [workflowId]: { ...prev.runs[workflowId], stopping } } }
          : prev,
      );
    patchStopping(true);
    try {
      await WorkflowService.StopRun(entry.runId);
    } catch {
      // ignore — completion is observed via the next poll
    } finally {
      patchStopping(false);
    }
  },
  toggleSection: (workflowId, stepRunId) =>
    set((prev) => {
      const cur = prev.runs[workflowId];
      if (!cur) return prev;
      return {
        runs: {
          ...prev.runs,
          [workflowId]: {
            ...cur,
            collapsedSections: {
              ...cur.collapsedSections,
              [stepRunId]: !cur.collapsedSections[stepRunId],
            },
          },
        },
      };
    }),
}));

// ── Polling loop — stays alive regardless of which page is mounted ────────────

/** Pure merge of a poll chunk into a run entry. */
function mergeChunk(cur: WorkflowRunEntry, chunk: RunLogChunk): WorkflowRunEntry {
  let { currentStepRunId, collapsedSections, logSegments } = cur;

  if (chunk.stepRuns) {
    const running = chunk.stepRuns.find((s) => s.status === "running");
    if (currentStepRunId === null && chunk.stepRuns.length > 0) {
      const initial: Record<string, boolean> = {};
      for (const sr of chunk.stepRuns) initial[sr.id] = sr.status !== "running";
      collapsedSections = initial;
      if (running) currentStepRunId = running.id;
    } else if (running && running.id !== currentStepRunId) {
      const prevId = currentStepRunId;
      collapsedSections = {
        ...collapsedSections,
        ...(prevId ? { [prevId]: true } : {}),
        [running.id]: false,
      };
      currentStepRunId = running.id;
    }
  }

  if (chunk.logText) {
    const key = currentStepRunId ?? chunk.stepRuns?.[0]?.id;
    if (key) {
      logSegments = { ...logSegments, [key]: (logSegments[key] ?? "") + chunk.logText };
    }
  }

  const notifyLogBuffer = chunk.logText
    ? [...cur.notifyLogBuffer, chunk.logText]
    : cur.notifyLogBuffer;
  const stepRuns = chunk.stepRuns ?? cur.stepRuns;
  const done = chunk.done;
  const failed = stepRuns.some((s) => s.status === "failed");
  const finalStatus: WorkflowRunEntry["finalStatus"] = done
    ? failed
      ? "failed"
      : "success"
    : "running";
  if (done && currentStepRunId) {
    collapsedSections = { ...collapsedSections, [currentStepRunId]: true };
  }

  return {
    ...cur,
    stepRuns,
    logSegments,
    collapsedSections,
    currentStepRunId,
    offset: chunk.nextOffset,
    done,
    finalStatus,
    notifyLogBuffer,
  };
}

async function pollTick() {
  const running = Object.entries(useWorkflowRuns.getState().runs).filter(([, r]) => !r.done);
  for (const [workflowId, entry] of running) {
    try {
      const chunk = (await WorkflowService.PollRunLogs(entry.runId, entry.offset)) as RunLogChunk;
      if (!chunk) continue;

      const cur = useWorkflowRuns.getState().runs[workflowId];
      if (!cur || cur.runId !== entry.runId) continue;

      const next = mergeChunk(cur, chunk);
      useWorkflowRuns.setState((prev) => {
        const c = prev.runs[workflowId];
        if (!c || c.runId !== entry.runId) return prev;
        return { runs: { ...prev.runs, [workflowId]: next } };
      });

      // Notification side effects, outside the state updater
      const { updateNotification } = useNotificationsStore.getState();
      if (next.done && cur.notificationId) {
        const failed = next.finalStatus === "failed";
        completeTaskNotification(updateNotification, {
          id: cur.notificationId,
          severity: failed ? "error" : "success",
          title: failed
            ? `Workflow failed: ${cur.workflowName}`
            : `Workflow complete: ${cur.workflowName}`,
          taskStatus: failed ? "error" : "done",
        });
      } else if (cur.notificationId) {
        const runningLabel = next.stepRuns.find((s) => s.status === "running")?.label ?? "";
        updateNotification(cur.notificationId, {
          task: { step: runningLabel, logBuffer: next.notifyLogBuffer },
        });
      }
    } catch {
      // ignore individual poll errors — next tick retries
    }
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

function syncPolling() {
  const hasRunning = Object.values(useWorkflowRuns.getState().runs).some((r) => !r.done);
  if (hasRunning && pollTimer === null) {
    pollTimer = setInterval(() => void pollTick(), 500);
  } else if (!hasRunning && pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

wireOnce("workflowRuns:polling", () => {
  useWorkflowRuns.subscribe(syncPolling);
});
