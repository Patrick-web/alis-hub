import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { Icon } from "@iconify/react";
import { Button } from "../Button";
import { useWorkspace } from "../../stores/workspace";
import { useNotifications } from "../../stores/notifications";
import { useDevelopTabs } from "../../stores/developTabs";
import {
  useDevelopSessions,
  initialDefineSession,
  patchSession,
  getSession,
  registerSessionController,
  unregisterSessionController,
  type DefineSession,
} from "../../stores/developSessions";
import type { AppNotification } from "../../stores/notifications";
import type { DefineCommit, DefineResult, DefineStep, GlassResult } from "./types";
import { parseNeuron, formatTimestamp } from "./types";
import { completeTaskNotification } from "../../lib/taskNotify";
import { CommitList } from "./shared/CommitList";
import { DefineRunView } from "./shared/DefineRunView";
import { GlassView } from "./shared/GlassView";
import * as DefineService from "../../../../bindings/alis-hub-v3/defineservice";

const MAX_POLL_FAILURES = 3;

interface DefinePaneProps {
  tabId: string;
  neuron: string;
  restore?: AppNotification;
}

export function DefinePane({ tabId, neuron, restore }: DefinePaneProps) {
  const { state } = useWorkspace();
  const { addNotification, updateNotification, setFocusTaskId } = useNotifications();
  const { setTabNotificationId } = useDevelopTabs();
  const navigate = useNavigate();

  const session = useDevelopSessions((s) => s.sessions[tabId]) as DefineSession | undefined;
  const patch = (p: Partial<DefineSession>) => patchSession<DefineSession>(tabId, p);

  const taskIdRef = useRef<string | null>(null);
  const definePollFailuresRef = useRef(0);

  // Stable refs for org/product so effects don't re-run on every render
  const orgRef = useRef(state.organisation);
  const productRef = useRef(state.product);
  orgRef.current = state.organisation;
  productRef.current = state.product;

  useEffect(() => {
    useDevelopSessions.getState().ensureSession(initialDefineSession(tabId, neuron));
    if (restore?.task) {
      const { step: savedStep, meta } = restore.task;
      taskIdRef.current = restore.id;
      patchSession<DefineSession>(tabId, {
        step: savedStep as DefineStep,
        commitsLoading: false,
        ...(savedStep === "running" && meta.operationName
          ? {
              defineResult: {
                operationName: meta.operationName as string,
                definition: "",
                version: "",
                notes: "",
                definitionArtifacts: [],
                done: false,
              },
            }
          : {}),
      });
    } else if (getSession<DefineSession>(tabId)?.commitsLoading) {
      loadCommits();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Imperative controller so other surfaces (command palette) can drive this flow.
  useEffect(() => {
    registerSessionController(tabId, {
      kind: "define",
      loadCommits: () => loadCommitsRef.current(),
      runDefine: () => runDefineRef.current(),
    });
    return () => unregisterSessionController(tabId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  async function loadCommits() {
    patchSession<DefineSession>(tabId, {
      step: "commits",
      commits: [],
      selectedCommit: null,
      defineResult: null,
      glassResult: null,
      progressMsg: "Loading commits...",
      commitsLoading: true,
      defineError: null,
    });
    const parsed = parseNeuron(neuron);
    try {
      const result = await DefineService.GetDefineCommits(
        orgRef.current,
        productRef.current,
        parsed.id,
        parsed.version,
        30,
      );
      patchSession<DefineSession>(tabId, {
        commits: result as DefineCommit[],
        commitsLoading: false,
      });
    } catch {
      patchSession<DefineSession>(tabId, { commits: [], commitsLoading: false });
    }
  }
  const loadCommitsRef = useRef(loadCommits);
  loadCommitsRef.current = loadCommits;

  async function handleRunDefine() {
    const selectedCommit = getSession<DefineSession>(tabId)?.selectedCommit;
    if (!selectedCommit) return;
    const neuronResource = `organisations/${orgRef.current}/products/${productRef.current}/neurons/${neuron}`;
    patchSession<DefineSession>(tabId, {
      step: "running",
      defineError: null,
      progressMsg: "Starting Define...",
    });
    const taskId = addNotification({
      severity: "info",
      source: "define",
      title: "Define started",
      body: neuron,
      persistent: true,
      task: {
        type: "define",
        status: "running",
        neuronId: neuron,
        step: "running",
        startedAt: Date.now(),
        logBuffer: [],
        meta: {},
      },
    });
    taskIdRef.current = taskId;
    setTabNotificationId(tabId, taskId);
    try {
      const result = await DefineService.RunDefine(neuronResource, selectedCommit.sha, "");
      patchSession<DefineSession>(tabId, { defineResult: result as DefineResult });
      updateNotification(taskId, {
        task: { meta: { operationName: (result as DefineResult).operationName } },
      });
    } catch (e: any) {
      const errMsg = e?.message || String(e) || "Failed to start define";
      patchSession<DefineSession>(tabId, { defineError: errMsg });
      completeTaskNotification(updateNotification, {
        id: taskId,
        severity: "error",
        title: "Define failed",
        body: errMsg,
        taskStatus: "error",
      });
      taskIdRef.current = null;
    }
  }
  const runDefineRef = useRef(handleRunDefine);
  runDefineRef.current = handleRunDefine;

  const defineResult = session?.defineResult ?? null;
  const step = session?.step ?? "commits";

  // Poll define operation
  useEffect(() => {
    if (!defineResult || defineResult.done || step !== "running") return;
    const neuronResource = `organisations/${orgRef.current}/products/${productRef.current}/neurons/${neuron}`;
    definePollFailuresRef.current = 0;
    const interval = setInterval(async () => {
      try {
        const result = await DefineService.PollDefineOperation(defineResult.operationName);
        definePollFailuresRef.current = 0;
        patchSession<DefineSession>(tabId, { defineResult: result as DefineResult });
        if (result?.done) {
          clearInterval(interval);
          if (!result.error) {
            patchSession<DefineSession>(tabId, {
              step: "glass",
              glassLoading: true,
              progressMsg: "Define complete — loading Glass...",
            });
            if (taskIdRef.current) {
              const doneId = taskIdRef.current;
              completeTaskNotification(updateNotification, {
                id: doneId,
                severity: "success",
                title: "Define complete",
                taskStatus: "done",
                taskPatch: { step: "glass" },
                actions: [
                  {
                    label: "Open in Develop",
                    variant: "primary",
                    onClick: () => {
                      setFocusTaskId(doneId);
                      navigate("/develop");
                    },
                  },
                ],
              });
              taskIdRef.current = null;
            }
            try {
              const glass = await DefineService.ExplainDefine(
                result.definition,
                result.definitionArtifacts ?? [],
                neuronResource,
              );
              patchSession<DefineSession>(tabId, {
                glassResult: glass as GlassResult,
                glassLoading: false,
              });
            } catch {
              patchSession<DefineSession>(tabId, { glassLoading: false });
            }
          } else {
            const errMsg = result.error || "Define failed";
            patchSession<DefineSession>(tabId, { defineError: errMsg });
            if (taskIdRef.current) {
              completeTaskNotification(updateNotification, {
                id: taskIdRef.current,
                severity: "error",
                title: "Define failed",
                body: errMsg,
                taskStatus: "error",
                taskPatch: { step: "running" },
              });
              taskIdRef.current = null;
            }
          }
        } else if (result?.notes) {
          patchSession<DefineSession>(tabId, { progressMsg: result.notes });
        }
      } catch {
        definePollFailuresRef.current += 1;
        if (definePollFailuresRef.current >= MAX_POLL_FAILURES) {
          clearInterval(interval);
          const errMsg = "Lost connection to define status.";
          patchSession<DefineSession>(tabId, { defineError: errMsg });
          if (taskIdRef.current) {
            completeTaskNotification(updateNotification, {
              id: taskIdRef.current,
              severity: "error",
              title: "Define status unknown",
              body: errMsg,
              taskStatus: "error",
              taskPatch: { step: "running" },
            });
            taskIdRef.current = null;
          }
        }
      }
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defineResult?.operationName, defineResult?.done, step]);

  if (!session) return null;

  return (
    <>
      {/* Step: commits */}
      {session.step === "commits" && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="shrink-0 flex items-center justify-end px-[14px] py-[7px] border-b border-border">
            <button
              onClick={loadCommits}
              disabled={session.commitsLoading}
              className="flex items-center justify-center size-[24px] rounded-[4px] text-foreground/35 hover:text-foreground hover:bg-card transition-colors disabled:opacity-40"
              title="Refresh commits"
            >
              <Icon icon="solar:refresh-linear" className="text-sm" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <CommitList
              commits={session.commits}
              loading={session.commitsLoading}
              emptyText="No commits found in define repo."
              onSelect={(c) => patch({ selectedCommit: c, step: "confirm" })}
            />
          </div>
        </div>
      )}

      {/* Step: confirm */}
      {session.step === "confirm" && session.selectedCommit && (
        <div className="flex-1 overflow-y-auto px-[16px] py-[20px]">
          <button
            onClick={() => patch({ step: "commits" })}
            className="flex items-center gap-[6px] text-[10px] text-foreground/40 hover:text-foreground mb-[20px] transition-colors"
          >
            <Icon icon="solar:alt-arrow-left-linear" className="text-sm" />
            Back to commits
          </button>
          <div className="bg-card border border-border rounded-[8px] p-[16px] mb-[20px]">
            <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono mb-[10px]">
              Selected Commit
            </p>
            <p className="text-[11px] text-foreground leading-[1.5] mb-[10px]">
              {session.selectedCommit.message}
            </p>
            <span className="text-[10px] font-bold font-mono text-brand">
              {session.selectedCommit.sha.substring(0, 12)}
            </span>
            <p className="text-[9px] text-foreground/40 mt-[4px]">
              {session.selectedCommit.author} · {formatTimestamp(session.selectedCommit.timestamp)}
            </p>
          </div>
          <Button
            variant="primary"
            className="w-full justify-center py-[10px]"
            onClick={handleRunDefine}
          >
            Run Define
          </Button>
        </div>
      )}

      {/* Step: running */}
      {session.step === "running" && (
        <DefineRunView
          error={session.defineError}
          progressMsg={session.progressMsg}
          version={session.defineResult?.version}
          onRetry={loadCommits}
        />
      )}

      {/* Step: glass */}
      {session.step === "glass" && (
        <GlassView
          defineResult={session.defineResult}
          glassResult={session.glassResult}
          glassLoading={session.glassLoading}
          onRerun={loadCommits}
        />
      )}
    </>
  );
}
