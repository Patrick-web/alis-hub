import { useEffect, useRef, useState, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Button } from "./Button";
import { BuildTerminal, type BuildTerminalHandle } from "./BuildTerminal";
import * as WorkflowService from "../../../bindings/alis-hub-v3/workflowservice";

type StepRunStatus = {
  id: string;
  stepId: string;
  position: number;
  type: string;
  label: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  startedAt?: number;
  completedAt?: number;
};

type RunLogChunk = {
  stepRuns: StepRunStatus[];
  logText: string;
  nextOffset: number;
  done: boolean;
};

const STATUS_ICON: Record<string, string> = {
  pending: "solar:circle-linear",
  running: "solar:spinner-linear",
  success: "solar:check-circle-bold",
  failed: "solar:close-circle-bold",
  skipped: "solar:minus-circle-linear",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "text-foreground/20",
  running: "text-blue-400",
  success: "text-green-400",
  failed: "text-red-400",
  skipped: "text-foreground/20",
};

function formatDuration(startedAt?: number, completedAt?: number): string {
  if (!startedAt) return "";
  const end = completedAt ?? Math.floor(Date.now() / 1000);
  const s = end - startedAt;
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function WorkflowRunModal({
  workflowId,
  workflowName,
  onClose,
}: {
  workflowId: string;
  workflowName: string;
  onClose: () => void;
}) {
  const [runId, setRunId] = useState<string | null>(null);
  const [stepRuns, setStepRuns] = useState<StepRunStatus[]>([]);
  const [done, setDone] = useState(false);
  const [finalStatus, setFinalStatus] = useState<string>("running");
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  const termRef = useRef<BuildTerminalHandle>(null);
  const offsetRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runIdRef = useRef<string | null>(null);

  // Stable identity (empty deps) so BuildTerminal's onData listener, wired once
  // at mount, always forwards to whichever run is currently active via the ref.
  const handleTerminalInput = useCallback((data: string) => {
    if (runIdRef.current) {
      WorkflowService.SendRunInput(runIdRef.current, data).catch(() => {});
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const poll = useCallback(
    async (id: string) => {
      try {
        const chunk = (await WorkflowService.PollRunLogs(id, offsetRef.current)) as RunLogChunk;
        if (!chunk) return;

        if (chunk.logText) {
          termRef.current?.write(chunk.logText);
          offsetRef.current = chunk.nextOffset;
        }

        if (chunk.stepRuns) setStepRuns(chunk.stepRuns);

        if (chunk.done) {
          stopPolling();
          setDone(true);
          const failed = chunk.stepRuns?.some((s) => s.status === "failed");
          const stopped =
            chunk.stepRuns?.some((s) => s.status === "failed") &&
            chunk.stepRuns?.some((s) => s.status === "skipped");
          setFinalStatus(failed ? (stopped ? "stopped" : "failed") : "success");
        }
      } catch (e) {
        console.error("PollRunLogs error:", e);
      }
    },
    [stopPolling],
  );

  // Start the run on mount
  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const id = (await WorkflowService.RunWorkflow(workflowId, {}, 0)) as string;
        if (cancelled) return;
        setRunId(id);
        runIdRef.current = id;
        offsetRef.current = 0;
        pollRef.current = setInterval(() => poll(id), 500);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      }
    }
    start();
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [workflowId, poll, stopPolling]);

  const handleStop = async () => {
    if (!runId || stopping) return;
    setStopping(true);
    try {
      await WorkflowService.StopRun(runId);
    } catch {
      // ignore
    } finally {
      setStopping(false);
    }
  };

  const handleClose = () => {
    stopPolling();
    onClose();
  };

  const completedCount = stepRuns.filter((s) =>
    ["success", "failed", "skipped"].includes(s.status),
  ).length;
  const progress = stepRuns.length > 0 ? Math.round((completedCount / stepRuns.length) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-[580px] max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-border">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">{workflowName}</div>
            <div className="text-xs text-foreground/40 mt-0.5">
              {done
                ? finalStatus === "success"
                  ? "Completed successfully"
                  : finalStatus === "stopped"
                    ? "Stopped"
                    : "Completed with errors"
                : error
                  ? "Failed to start"
                  : "Running…"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!done && !error && (
              <Button
                variant="ghost"
                onClick={handleStop}
                disabled={stopping}
                className="text-red-400 hover:text-red-300 hover:bg-red-400/10 text-xs h-7 px-2"
                icon={<Icon icon="solar:stop-circle-linear" className="text-sm" />}
              >
                Stop
              </Button>
            )}
            {(done || error) && (
              <Button variant="secondary" onClick={handleClose} className="text-xs h-7 px-3">
                Close
              </Button>
            )}
          </div>
        </div>

        {/* Step status list */}
        {stepRuns.length > 0 && (
          <div className="px-5 py-3 border-b border-border flex flex-col gap-1.5">
            {stepRuns.map((sr) => (
              <div key={sr.id} className="flex items-center gap-2.5">
                <Icon
                  icon={STATUS_ICON[sr.status] ?? STATUS_ICON.pending}
                  className={`text-sm flex-shrink-0 ${STATUS_COLOR[sr.status] ?? ""} ${sr.status === "running" ? "animate-spin" : ""}`}
                />
                <span
                  className={`text-xs flex-1 truncate ${sr.status === "pending" || sr.status === "skipped" ? "text-foreground/30" : ""}`}
                >
                  {sr.label}
                </span>
                {(sr.status === "success" || sr.status === "failed") && sr.startedAt && (
                  <span className="text-[10px] text-foreground/25 flex-shrink-0">
                    {formatDuration(sr.startedAt, sr.completedAt)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Error state (failed to start) */}
        {error && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <Icon
                icon="solar:danger-triangle-linear"
                className="text-red-400 text-3xl mx-auto mb-2"
              />
              <p className="text-sm text-red-400 font-medium">Failed to start workflow</p>
              <p className="text-xs text-foreground/40 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Log terminal */}
        {!error && (
          <div className="flex-1 overflow-hidden" style={{ minHeight: 200 }}>
            <BuildTerminal ref={termRef} className="h-full" onInput={handleTerminalInput} />
          </div>
        )}

        {/* Footer progress bar */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-t border-border">
          <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                finalStatus === "success"
                  ? "bg-green-400"
                  : finalStatus === "failed"
                    ? "bg-red-400"
                    : "bg-brand-fill"
              }`}
              style={{ width: `${done ? 100 : progress}%` }}
            />
          </div>
          <span className="text-[10px] text-foreground/30 flex-shrink-0">
            {done
              ? finalStatus === "success"
                ? "Done"
                : finalStatus
              : `${completedCount} / ${stepRuns.length}`}
          </span>
        </div>
      </div>
    </div>
  );
}
