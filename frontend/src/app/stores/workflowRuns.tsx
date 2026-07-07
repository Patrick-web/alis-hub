import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import * as WorkflowService from '../../../bindings/alis-hub-v3/workflowservice';
import { useNotifications } from './notifications';
import { completeTaskNotification } from '../lib/taskNotify';

export type StepRunStatus = {
  id: string;
  stepId: string;
  position: number;
  type: string;
  label: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
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
  finalStatus: 'running' | 'success' | 'failed';
  stopping: boolean;
  notificationId: string | null;
  notifyLogBuffer: string[]; // full accumulated log, mirrored into the status-bar notification's hover card
}

interface WorkflowRunsContextValue {
  runs: Record<string, WorkflowRunEntry>;
  startRun: (
    workflowId: string,
    workflowName: string,
    argValues: Record<string, string>,
    startPosition: number
  ) => Promise<void>;
  stopRun: (workflowId: string) => Promise<void>;
  toggleSection: (workflowId: string, stepRunId: string) => void;
  // Which workflow is selected in the Workflows page list. Lives here (above
  // the router) rather than as local page state so it survives navigating
  // away from and back to the Workflows page.
  selectedWorkflowId: string | null;
  setSelectedWorkflowId: (id: string | null) => void;
}

const WorkflowRunsContext = createContext<WorkflowRunsContextValue | null>(null);

export function WorkflowRunsProvider({ children }: { children: ReactNode }) {
  const [runs, setRuns] = useState<Record<string, WorkflowRunEntry>>({});
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const { addNotification, updateNotification } = useNotifications();

  // Polling loop — stays alive regardless of which page is mounted
  useEffect(() => {
    const running = Object.entries(runs).filter(([, r]) => !r.done);
    if (running.length === 0) return;
    const interval = setInterval(async () => {
      for (const [workflowId, entry] of running) {
        try {
          const chunk = await WorkflowService.PollRunLogs(entry.runId, entry.offset) as RunLogChunk;
          if (!chunk) continue;

          setRuns((prev) => {
            const cur = prev[workflowId];
            if (!cur || cur.runId !== entry.runId) return prev;

            let { currentStepRunId, collapsedSections, logSegments } = cur;

            if (chunk.stepRuns) {
              const running = chunk.stepRuns.find((s) => s.status === 'running');
              if (currentStepRunId === null && chunk.stepRuns.length > 0) {
                const initial: Record<string, boolean> = {};
                for (const sr of chunk.stepRuns) initial[sr.id] = sr.status !== 'running';
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
                logSegments = { ...logSegments, [key]: (logSegments[key] ?? '') + chunk.logText };
              }
            }

            const notifyLogBuffer = chunk.logText ? [...cur.notifyLogBuffer, chunk.logText] : cur.notifyLogBuffer;
            const stepRuns = chunk.stepRuns ?? cur.stepRuns;
            const done = chunk.done;
            const failed = stepRuns.some((s) => s.status === 'failed');
            const finalStatus: WorkflowRunEntry['finalStatus'] = done ? (failed ? 'failed' : 'success') : 'running';
            if (done && currentStepRunId) {
              collapsedSections = { ...collapsedSections, [currentStepRunId]: true };
            }

            if (done && cur.notificationId) {
              completeTaskNotification(updateNotification, {
                id: cur.notificationId,
                severity: failed ? 'error' : 'success',
                title: failed ? `Workflow failed: ${cur.workflowName}` : `Workflow complete: ${cur.workflowName}`,
                taskStatus: failed ? 'error' : 'done',
              });
            } else if (cur.notificationId) {
              const runningLabel = stepRuns.find((s) => s.status === 'running')?.label ?? '';
              updateNotification(cur.notificationId, {
                task: { step: runningLabel, logBuffer: notifyLogBuffer },
              });
            }

            return {
              ...prev,
              [workflowId]: {
                ...cur,
                stepRuns,
                logSegments,
                collapsedSections,
                currentStepRunId,
                offset: chunk.nextOffset,
                done,
                finalStatus,
                notifyLogBuffer,
              },
            };
          });
        } catch {
          // ignore individual poll errors — next tick retries
        }
      }
    }, 500);
    return () => clearInterval(interval);
  }, [runs, updateNotification]);

  const startRun = useCallback(async (
    workflowId: string,
    workflowName: string,
    argValues: Record<string, string>,
    startPosition: number
  ) => {
    const notificationId = addNotification({
      severity: 'info',
      source: 'general',
      title: `Running workflow: ${workflowName}`,
      persistent: true,
      task: {
        type: 'workflow',
        status: 'running',
        neuronId: workflowName,
        step: 'Starting…',
        startedAt: Date.now(),
        logBuffer: [],
        meta: { workflowId, workflowName },
      },
    });

    try {
      const runId = await WorkflowService.RunWorkflow(workflowId, argValues, startPosition) as string;
      setRuns((prev) => ({
        ...prev,
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
          finalStatus: 'running',
          stopping: false,
          notificationId,
          notifyLogBuffer: [],
        },
      }));
    } catch (e) {
      completeTaskNotification(updateNotification, {
        id: notificationId,
        severity: 'error',
        title: `Workflow failed to start: ${workflowName}`,
        body: e instanceof Error ? e.message : String(e),
        taskStatus: 'error',
      });
      throw e;
    }
  }, [addNotification, updateNotification]);

  const stopRun = useCallback(async (workflowId: string) => {
    const entry = runs[workflowId];
    if (!entry || entry.stopping) return;
    setRuns((prev) => (prev[workflowId] ? { ...prev, [workflowId]: { ...prev[workflowId], stopping: true } } : prev));
    try {
      await WorkflowService.StopRun(entry.runId);
    } catch {
      // ignore — completion is observed via the next poll
    } finally {
      setRuns((prev) => (prev[workflowId] ? { ...prev, [workflowId]: { ...prev[workflowId], stopping: false } } : prev));
    }
  }, [runs]);

  const toggleSection = useCallback((workflowId: string, stepRunId: string) => {
    setRuns((prev) => {
      const cur = prev[workflowId];
      if (!cur) return prev;
      return {
        ...prev,
        [workflowId]: {
          ...cur,
          collapsedSections: { ...cur.collapsedSections, [stepRunId]: !cur.collapsedSections[stepRunId] },
        },
      };
    });
  }, []);

  return (
    <WorkflowRunsContext.Provider
      value={{ runs, startRun, stopRun, toggleSection, selectedWorkflowId, setSelectedWorkflowId }}
    >
      {children}
    </WorkflowRunsContext.Provider>
  );
}

export function useWorkflowRuns() {
  const ctx = useContext(WorkflowRunsContext);
  if (!ctx) throw new Error('useWorkflowRuns must be used within WorkflowRunsProvider');
  return ctx;
}
