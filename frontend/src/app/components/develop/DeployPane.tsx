import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "@iconify/react";
import { Button } from "../Button";
import { Loader } from "../Loader";
import { CheckCircle } from "./CheckCircle";
import { useWorkspace } from "../../stores/workspace";
import { useNotifications } from "../../stores/notifications";
import { useDevelopTabs } from "../../stores/developTabs";
import { useProtectedEnvironments } from "../../stores/protectedEnvironments";
import {
  useDevelopSessions,
  initialDeploySession,
  patchSession,
  getSession,
  registerSessionController,
  unregisterSessionController,
  type DeploySession,
} from "../../stores/developSessions";
import { getLogBus } from "../../lib/logBus";
import type { AppNotification } from "../../stores/notifications";
import type { DeployEnv, DeployStep, EnvRunState } from "./types";
import { isAuthError, formatRelativeTime } from "./types";
import { completeTaskNotification } from "../../lib/taskNotify";
import { ConfirmDialog } from "../ConfirmDialog";
import { EnvRunView } from "./shared/EnvRunView";
import * as DeployService from "../../../../bindings/alis-hub-v3/deployservice";
import * as ProductService from "../../../../bindings/alis-hub-v3/productservice";

interface DeployPaneProps {
  tabId: string;
  neuron: string;
  restore?: AppNotification;
}

export function DeployPane({ tabId, neuron, restore }: DeployPaneProps) {
  const { state, setPhase } = useWorkspace();
  const { addNotification, updateNotification, setFocusTaskId } = useNotifications();
  const { setTabNotificationId } = useDevelopTabs();
  const { isProtected } = useProtectedEnvironments();
  const navigate = useNavigate();

  const session = useDevelopSessions((s) => s.sessions[tabId]) as DeploySession | undefined;
  const patch = (p: Partial<DeploySession>) => patchSession<DeploySession>(tabId, p);

  const [protectedConfirmOpen, setProtectedConfirmOpen] = useState(false);

  const logOffsetRefs = useRef<Record<string, number>>({});
  const taskIdRef = useRef<string | null>(null);

  const orgRef = useRef(state.organisation);
  const productRef = useRef(state.product);
  const activeEnvRef = useRef(state.activeEnvName);
  orgRef.current = state.organisation;
  productRef.current = state.product;
  activeEnvRef.current = state.activeEnvName;

  useEffect(() => {
    useDevelopSessions.getState().ensureSession(initialDeploySession(tabId, neuron));
    if (restore?.task) {
      const { step: savedStep, meta } = restore.task;
      taskIdRef.current = restore.id;
      if (savedStep === "running" && Array.isArray(meta.envOps)) {
        const ops = meta.envOps as EnvRunState[];
        ops.forEach((op) => {
          logOffsetRefs.current[op.env] = 0;
          (restore.task!.logBuffer ?? []).forEach((chunk) => getLogBus(tabId, op.env).write(chunk));
        });
        patchSession<DeploySession>(tabId, {
          step: savedStep as DeployStep,
          envRuns: ops.map((op) => ({ ...op, done: false, progressMsg: "Reconnecting..." })),
          activeRunEnv: ops[0]?.env ?? "",
        });
      } else {
        patchSession<DeploySession>(tabId, { step: savedStep as DeployStep });
      }
    } else if (getSession<DeploySession>(tabId)?.step === "loading") {
      loadDeployInfo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Imperative controller so other surfaces (command palette) can drive this flow.
  useEffect(() => {
    registerSessionController(tabId, {
      kind: "deploy",
      reload: () => loadDeployInfoRef.current(),
      runDeployNow: () => runDeployNowRef.current(),
    });
    return () => unregisterSessionController(tabId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  async function loadDeployInfo() {
    patchSession<DeploySession>(tabId, {
      step: "loading",
      deployError: null,
      envs: [],
      versions: [],
      selectedEnvs: [],
      version: "",
      envRuns: [],
    });
    logOffsetRefs.current = {};
    const neuronResource = `organisations/${orgRef.current}/products/${productRef.current}/neurons/${neuron}`;
    try {
      const [overview, versionList] = await Promise.all([
        ProductService.GetServicesOverview(orgRef.current, productRef.current),
        DeployService.ListNeuronVersions(neuronResource),
      ]);
      const builtVersions = (versionList ?? [])
        .filter((v) => v !== null)
        .map((v) => ({
          name: v!.name,
          version: v!.version,
          createTime: v!.createTime,
        }));
      patchSession<DeploySession>(tabId, {
        versions: builtVersions,
        ...(builtVersions.length > 0 ? { version: builtVersions[0].version } : {}),
      });
      const envList: DeployEnv[] = (overview?.environments ?? []).map((env) => {
        const dep = env.deployments?.find((d: any) => d.neuronId === neuron);
        return { name: env.name, displayName: env.displayName, currentVersion: dep?.version ?? "" };
      });
      patchSession<DeploySession>(tabId, { envs: envList });
      if (activeEnvRef.current) {
        const active = envList.find((e) => e.name === activeEnvRef.current);
        if (active) patchSession<DeploySession>(tabId, { selectedEnvs: [active.name] });
      }
    } catch (e: unknown) {
      if (isAuthError(e)) {
        setPhase("login");
        return;
      }
      patchSession<DeploySession>(tabId, {
        deployError: e instanceof Error ? e.message : String(e),
      });
    } finally {
      patchSession<DeploySession>(tabId, { step: "confirm" });
    }
  }
  const loadDeployInfoRef = useRef(loadDeployInfo);
  loadDeployInfoRef.current = loadDeployInfo;

  const selectedEnvs = session?.selectedEnvs ?? [];
  const envs = session?.envs ?? [];
  const protectedSelectedEnvs = selectedEnvs.filter(isProtected);
  const protectedSelectedLabels = envs
    .filter((e) => protectedSelectedEnvs.includes(e.name))
    .map((e) => e.displayName);

  function handleRunDeploy() {
    const current = getSession<DeploySession>(tabId);
    if (!current || current.selectedEnvs.length === 0 || !current.version) return;
    if (current.selectedEnvs.filter(isProtected).length > 0) {
      setProtectedConfirmOpen(true);
      return;
    }
    runDeployNow();
  }

  async function runDeployNow() {
    const current = getSession<DeploySession>(tabId);
    if (!current) return;
    const neuronResource = `organisations/${orgRef.current}/products/${productRef.current}/neurons/${neuron}`;
    patchSession<DeploySession>(tabId, { step: "running" });

    // Reset per-env offsets
    logOffsetRefs.current = {};
    current.selectedEnvs.forEach((env) => {
      logOffsetRefs.current[env] = 0;
    });

    // Init run states
    const initialRuns: EnvRunState[] = current.selectedEnvs.map((envName) => {
      const envObj = current.envs.find((e) => e.name === envName);
      return {
        env: envName,
        displayName: envObj?.displayName || envName,
        operationName: "",
        logsUrl: "",
        version: "",
        progressMsg: "Starting...",
        done: false,
      };
    });
    patchSession<DeploySession>(tabId, {
      envRuns: initialRuns,
      activeRunEnv: current.selectedEnvs[0],
    });

    const taskId = addNotification({
      severity: "info",
      source: "deploy",
      title: "Deploy started",
      body: neuron,
      persistent: true,
      task: {
        type: "deploy",
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

    // Start a single deploy for all environments
    let startError: string | null = null;
    const deployResult = await DeployService.RunDeploy(
      neuronResource,
      current.version,
      current.selectedEnvs,
      current.planOnly,
      current.beta,
    ).catch((e: unknown) => {
      startError = e instanceof Error ? e.message : String(e);
      return null;
    });

    const updatedRuns: EnvRunState[] = initialRuns.map((run, i) => {
      if (deployResult) {
        return {
          ...run,
          operationName: deployResult.operationName ?? "",
          deploymentIndex: i,
          progressMsg: deployResult.notes || "Running...",
        };
      }
      return {
        ...run,
        done: true,
        error: startError ?? "Failed to start",
        progressMsg: `Failed: ${startError}`,
      };
    });
    patchSession<DeploySession>(tabId, { envRuns: updatedRuns });

    // Persist env ops in notification meta for restore
    updateNotification(taskId, {
      task: {
        meta: {
          envOps: updatedRuns.map((r) => ({
            env: r.env,
            displayName: r.displayName,
            operationName: r.operationName,
            logsUrl: r.logsUrl,
            version: r.version,
            deploymentIndex: r.deploymentIndex,
          })),
        },
      },
    });
  }
  const runDeployNowRef = useRef(runDeployNow);
  runDeployNowRef.current = runDeployNow;

  const step = session?.step ?? "loading";
  const envRuns = session?.envRuns ?? [];

  // Poll all running operations
  const pollKey = envRuns
    .filter((r) => r.operationName && !r.done)
    .map((r) => r.operationName)
    .join(",");
  useEffect(() => {
    if (!pollKey || step !== "running") return;
    const interval = setInterval(async () => {
      const currentRuns = getSession<DeploySession>(tabId)?.envRuns ?? [];
      const running = currentRuns.filter((r) => r.operationName && !r.done);
      if (running.length === 0) return;

      const uniqueOpNames = [...new Set(running.map((r) => r.operationName))];
      const polled = await Promise.allSettled(
        uniqueOpNames.map((name) => DeployService.PollDeployOperation(name)),
      );

      const prev = getSession<DeploySession>(tabId)?.envRuns ?? [];
      const next = [...prev];
      uniqueOpNames.forEach((opName, opIdx) => {
        const res = polled[opIdx];
        const envMatches = next.filter((r) => r.operationName === opName && !r.done);
        envMatches.forEach((run) => {
          const idx = next.findIndex((r) => r.env === run.env);
          if (idx === -1) return;
          if (res.status === "fulfilled" && res.value) {
            const r = res.value;
            next[idx] = {
              ...next[idx],
              done: r.done ?? false,
              error: r.error || undefined,
              version: r.version || next[idx].version,
              logsUrl: r.deployments?.[run.deploymentIndex ?? 0]?.logsUrl || next[idx].logsUrl,
              progressMsg: r.notes || next[idx].progressMsg,
            };
          } else if (res.status === "rejected") {
            next[idx] = {
              ...next[idx],
              done: true,
              error: (res.reason as any)?.message || "Poll failed",
            };
          }
        });
      });
      patchSession<DeploySession>(tabId, { envRuns: next });
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollKey, step]);

  // Transition to result and update notification when all runs finish
  useEffect(() => {
    if (step !== "running" || envRuns.length === 0) return;
    const allDone = envRuns.every((r) => r.done);
    if (!allDone) return;
    patchSession<DeploySession>(tabId, { step: "result" });
    if (taskIdRef.current) {
      const doneId = taskIdRef.current;
      taskIdRef.current = null;
      const hasError = envRuns.some((r) => r.error);
      if (hasError) {
        completeTaskNotification(updateNotification, {
          id: doneId,
          severity: "error",
          title: "Deploy failed",
          taskStatus: "error",
          taskPatch: { step: "result" },
        });
      } else {
        completeTaskNotification(updateNotification, {
          id: doneId,
          severity: "success",
          title: "Deploy complete",
          body: neuron,
          taskStatus: "done",
          taskPatch: { step: "result" },
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
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envRuns, step]);

  // Stream logs for all envs
  const logsKey = envRuns
    .filter((r) => r.logsUrl)
    .map((r) => r.logsUrl + r.done)
    .join(",");
  useEffect(() => {
    const withLogs = envRuns.filter((r) => r.logsUrl);
    if (withLogs.length === 0) return;

    const intervals: (ReturnType<typeof setInterval> | null)[] = withLogs.map((run) => {
      const fetchLogs = async () => {
        try {
          const chunk = await DeployService.FetchDeployLogs(
            run.logsUrl,
            logOffsetRefs.current[run.env] ?? 0,
          );
          if (chunk?.content) {
            getLogBus(tabId, run.env).write(chunk.content);
            logOffsetRefs.current[run.env] = chunk.nextOffset;
            if (taskIdRef.current) {
              const currentRuns = getSession<DeploySession>(tabId)?.envRuns ?? [];
              const combined = currentRuns.flatMap((r) => getLogBus(tabId, r.env).getSnapshot());
              updateNotification(taskIdRef.current, { task: { logBuffer: combined } });
            }
          }
        } catch {}
      };
      if (run.done) {
        fetchLogs();
        return null;
      }
      return setInterval(fetchLogs, 3000);
    });

    return () =>
      intervals.forEach((i) => {
        if (i !== null) clearInterval(i);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logsKey]);

  if (!session) return null;

  return (
    <>
      {/* Step: loading */}
      {session.step === "loading" && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-[12px]">
            <Loader size={20} />
            <p className="text-[11px] text-foreground/40">Loading deployment info...</p>
          </div>
        </div>
      )}

      {/* Step: confirm */}
      {session.step === "confirm" && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto">
            {session.deployError && (
              <div className="mx-[14px] mt-[14px] flex items-start gap-[8px] p-[10px] bg-[rgba(255,92,95,0.1)] border border-[rgba(255,92,95,0.3)] rounded-[6px]">
                <Icon
                  icon="solar:danger-triangle-linear"
                  className="text-destructive text-sm shrink-0 mt-[1px]"
                />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-foreground/80 mb-[2px]">
                    Failed to load deploy info
                  </p>
                  <p className="text-[9px] text-foreground/50 leading-relaxed break-words">
                    {session.deployError}
                  </p>
                </div>
              </div>
            )}
            <div className="border-b border-border">
              <div className="px-[16px] pt-[14px] pb-[8px]">
                <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono">
                  Build Version
                </p>
              </div>
              {session.versions.length === 0 ? (
                <div className="px-[16px] pb-[12px]">
                  <p className="text-[11px] text-foreground/30">No built versions found.</p>
                </div>
              ) : (
                <div className="max-h-[160px] overflow-y-auto">
                  {session.versions.map((v) => {
                    const selected = session.version === v.version;
                    const ago = v.createTime > 0 ? formatRelativeTime(v.createTime) : "";
                    return (
                      <button
                        key={v.name}
                        onClick={() => patch({ version: v.version })}
                        className={`w-full text-left px-[16px] py-[9px] border-b border-border flex items-center gap-[10px] transition-colors ${
                          selected ? "bg-brand-fill/8" : "hover:bg-foreground/[2%]"
                        }`}
                      >
                        <CheckCircle selected={selected} size={14} />
                        <span
                          className={`text-[12px] font-bold font-mono ${selected ? "text-brand" : "text-foreground"}`}
                        >
                          {v.version}
                        </span>
                        {ago && (
                          <span className="ml-auto text-[9px] text-foreground/30 shrink-0">
                            {ago}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-[16px] pt-[12px] pb-[4px]">
              <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono mb-[8px]">
                Target Environments
              </p>
            </div>
            {session.envs.length === 0 ? (
              <div className="px-[16px] pb-[12px]">
                <p className="text-[11px] text-foreground/30">No environments found.</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {session.envs.map((env) => {
                  const selected = session.selectedEnvs.includes(env.name);
                  const isCurrent = env.currentVersion === session.version;
                  const hasDeployment = !!env.currentVersion;
                  return (
                    <button
                      key={env.name}
                      onClick={() =>
                        patch({
                          selectedEnvs: selected
                            ? session.selectedEnvs.filter((e) => e !== env.name)
                            : [...session.selectedEnvs, env.name],
                        })
                      }
                      className={`text-left px-[16px] py-[11px] border-b border-border transition-colors flex items-center gap-[10px] ${selected ? "bg-brand-fill/5" : "hover:bg-foreground/[2%]"}`}
                    >
                      <CheckCircle selected={selected} size={15} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-foreground leading-tight">
                          {env.displayName || env.name}
                        </p>
                      </div>
                      {hasDeployment ? (
                        isCurrent ? (
                          <span className="text-[9px] font-bold font-mono text-success shrink-0">
                            {env.currentVersion} ✓
                          </span>
                        ) : (
                          <div className="flex items-center gap-[4px] shrink-0">
                            <span className="text-[9px] font-mono text-foreground/30 line-through">
                              {env.currentVersion}
                            </span>
                            <Icon
                              icon="solar:alt-arrow-right-linear"
                              className="text-foreground/25 text-[10px]"
                            />
                            <span className="text-[9px] font-bold font-mono text-brand">
                              {session.version || "?"}
                            </span>
                          </div>
                        )
                      ) : (
                        <span className="text-[9px] text-foreground/25 shrink-0">not deployed</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="px-[16px] pt-[14px] pb-[16px] border-t border-border mt-[4px]">
              <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono mb-[10px]">
                Options
              </p>
              <div className="flex flex-col gap-[8px]">
                <label className="flex items-center gap-[8px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={session.planOnly}
                    onChange={(e) => patch({ planOnly: e.target.checked })}
                    className="accent-brand"
                  />
                  <div>
                    <span className="text-[10px] text-foreground/70">Plan only</span>
                    <span className="text-[9px] text-foreground/30 ml-[6px]">
                      terraform plan, no apply
                    </span>
                  </div>
                </label>
                <label className="flex items-center gap-[8px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={session.beta}
                    onChange={(e) => patch({ beta: e.target.checked })}
                    className="accent-brand"
                  />
                  <div>
                    <span className="text-[10px] text-foreground/70">Beta</span>
                    <span className="text-[9px] text-foreground/30 ml-[6px]">
                      sets ALIS_BETA_VERSION
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>
          <div className="shrink-0 px-[14px] py-[10px] border-t border-border">
            <Button
              variant="primary"
              className="w-full justify-center py-[10px]"
              disabled={!session.version || session.selectedEnvs.length === 0}
              onClick={handleRunDeploy}
            >
              {session.planOnly ? "Run Plan" : "Run Deploy"} · {session.selectedEnvs.length} env
              {session.selectedEnvs.length !== 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      )}

      {/* Steps: running + result — one terminal per env */}
      {(session.step === "running" || session.step === "result") && (
        <EnvRunView
          runs={session.envRuns}
          activeEnv={session.activeRunEnv}
          onSelectEnv={(env) => patch({ activeRunEnv: env })}
          step={session.step}
          busFor={(env) => getLogBus(tabId, env)}
          planOnly={session.planOnly}
          fallbackVersion={session.version}
          onRerun={session.step === "result" ? loadDeployInfo : undefined}
        />
      )}

      <ConfirmDialog
        open={protectedConfirmOpen}
        onOpenChange={setProtectedConfirmOpen}
        title="Protected Environment"
        description={
          <>
            {protectedSelectedLabels.join(", ")} {protectedSelectedLabels.length > 1 ? "are" : "is"}{" "}
            protected. Type the phrase below to confirm this deploy.
          </>
        }
        confirmLabel={session.planOnly ? "Run Plan" : "Run Deploy"}
        requireText={`Deploy to ${protectedSelectedLabels.join(", ")}`}
        onConfirm={() => {
          setProtectedConfirmOpen(false);
          runDeployNow();
        }}
      />
    </>
  );
}
