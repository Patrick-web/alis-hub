import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { Icon } from "@iconify/react";
import { Button } from "../Button";
import { Loader } from "../Loader";
import { CheckCircle } from "./CheckCircle";
import { useWorkspace } from "../../stores/workspace";
import { useDevelopSettings } from "../../stores/developSettings";
import { useNotifications } from "../../stores/notifications";
import { useDevelopTabs } from "../../stores/developTabs";
import {
  useDevelopSessions,
  initialBuildSession,
  patchSession,
  getSession,
  registerSessionController,
  unregisterSessionController,
  type BuildSession,
} from "../../stores/developSessions";
import { getLogBus } from "../../lib/logBus";
import type { AppNotification } from "../../stores/notifications";
import type {
  DefineCommit,
  BuildResult,
  BuildStep,
  BuildMode,
  DeployEnv,
  EnvRunState,
} from "./types";
import { parseNeuron, formatTimestamp } from "./types";
import { completeTaskNotification } from "../../lib/taskNotify";
import { CommitList } from "./shared/CommitList";
import { BuildRunView } from "./shared/BuildRunView";
import { EnvRunView } from "./shared/EnvRunView";
import * as BuildService from "../../../../bindings/alis-hub-v3/buildservice";
import * as DeployService from "../../../../bindings/alis-hub-v3/deployservice";
import * as ProductService from "../../../../bindings/alis-hub-v3/productservice";
import { SearchableSelect } from "../ui/searchable-select";

const MAX_POLL_FAILURES = 3;

interface BuildPaneProps {
  tabId: string;
  neuron: string;
  restore?: AppNotification;
}

export function BuildPane({ tabId, neuron, restore }: BuildPaneProps) {
  const { state } = useWorkspace();
  const { settings: devSettings } = useDevelopSettings();
  const { addNotification, updateNotification } = useNotifications();
  const { openTab, setTabNotificationId } = useDevelopTabs();
  const navigate = useNavigate();

  const session = useDevelopSessions((s) => s.sessions[tabId]) as BuildSession | undefined;
  const patch = (p: Partial<BuildSession>) => patchSession<BuildSession>(tabId, p);

  const buildBus = getLogBus(tabId, "build");
  const logOffsetRef = useRef<number>(0);
  const taskIdRef = useRef<string | null>(null);
  const cloudBuildPollFailuresRef = useRef(0);
  const localBuildPollFailuresRef = useRef(0);
  const deployLogOffsets = useRef<Record<string, number>>({});

  const orgRef = useRef(state.organisation);
  const productRef = useRef(state.product);
  const activeEnvRef = useRef(state.activeEnvName);
  orgRef.current = state.organisation;
  productRef.current = state.product;
  activeEnvRef.current = state.activeEnvName;

  useEffect(() => {
    useDevelopSessions.getState().ensureSession(initialBuildSession(tabId, neuron));
    if (restore?.task) {
      const { step: savedStep, meta } = restore.task;
      taskIdRef.current = restore.id;
      restore.task.logBuffer.forEach((chunk) => buildBus.write(chunk));
      patchSession<BuildSession>(tabId, {
        step: savedStep as BuildStep,
        commitsLoading: false,
        ...(savedStep === "running" && meta.operationName
          ? {
              buildResult: {
                operationName: meta.operationName as string,
                version: "",
                neuronVersion: "",
                logsUrl: (meta.logsUrl as string) || "",
                notes: "",
                done: false,
              },
            }
          : {}),
      });
    } else if (getSession<BuildSession>(tabId)?.commitsLoading) {
      resolveDefaultBranchAndLoad();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Imperative controller so other surfaces (command palette) can drive this flow.
  useEffect(() => {
    registerSessionController(tabId, {
      kind: "build",
      loadCommits: (b: string) => loadCommitsRef.current(b),
      changeBranch: (b: string) => changeBranchRef.current(b),
      runBuild: () => runBuildRef.current(),
    });
    return () => unregisterSessionController(tabId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  async function resolveDefaultBranchAndLoad() {
    let initialBranch = "master";
    if (devSettings.defaultBranch === "local") {
      try {
        const local = await BuildService.GetCurrentBranch(orgRef.current, productRef.current);
        if (local) initialBranch = local;
      } catch {
        // fall back to master
      }
    } else if (devSettings.defaultBranch) {
      initialBranch = devSettings.defaultBranch;
    }
    loadCommits(initialBranch);
  }

  async function loadCommits(b: string) {
    patchSession<BuildSession>(tabId, {
      step: "commits",
      commits: [],
      selectedCommit: null,
      buildResult: null,
      buildMode: "cloud",
      branch: b,
      localBuildId: null,
      buildPhase: "build",
      deployRuns: [],
      activeRunEnv: "",
      selectedDeployEnvs: [],
      commitsLoading: true,
    });
    logOffsetRef.current = 0;
    const parsed = parseNeuron(neuron);
    const [, commitsResult] = await Promise.allSettled([
      BuildService.GetBuildBranches(orgRef.current, productRef.current).then((bs) => {
        if (bs && bs.length > 0) patchSession<BuildSession>(tabId, { branches: bs as string[] });
      }),
      BuildService.GetBuildCommits(
        orgRef.current,
        productRef.current,
        parsed.id,
        parsed.version,
        b,
        30,
      ),
    ]);
    patchSession<BuildSession>(tabId, {
      commitsLoading: false,
      commits:
        commitsResult.status === "fulfilled" && commitsResult.value
          ? (commitsResult.value as DefineCommit[])
          : [],
    });
  }
  const loadCommitsRef = useRef(loadCommits);
  loadCommitsRef.current = loadCommits;

  async function handleBranchChange(b: string) {
    patchSession<BuildSession>(tabId, {
      branch: b,
      selectedCommit: null,
      commitsLoading: true,
      commits: [],
    });
    const parsed = parseNeuron(neuron);
    try {
      const result = await BuildService.GetBuildCommits(
        orgRef.current,
        productRef.current,
        parsed.id,
        parsed.version,
        b,
        30,
      );
      patchSession<BuildSession>(tabId, {
        commits: result as DefineCommit[],
        commitsLoading: false,
      });
    } catch {
      patchSession<BuildSession>(tabId, { commits: [], commitsLoading: false });
    }
  }
  const changeBranchRef = useRef(handleBranchChange);
  changeBranchRef.current = handleBranchChange;

  async function loadDeployEnvs() {
    patchSession<BuildSession>(tabId, { envsLoading: true, deployEnvs: [] });
    try {
      const overview = await ProductService.GetServicesOverview(orgRef.current, productRef.current);
      const envList: DeployEnv[] = (overview?.environments ?? []).map((env: any) => ({
        name: env.name,
        displayName: env.displayName,
        currentVersion: "",
      }));
      patchSession<BuildSession>(tabId, { deployEnvs: envList });
      if (activeEnvRef.current) {
        const active = envList.find((e) => e.name === activeEnvRef.current);
        if (active) patchSession<BuildSession>(tabId, { selectedDeployEnvs: [active.name] });
      }
    } catch {
    } finally {
      patchSession<BuildSession>(tabId, { envsLoading: false });
    }
  }

  const buildMode = session?.buildMode ?? "cloud";
  useEffect(() => {
    if (buildMode !== "deploy") return;
    loadDeployEnvs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildMode]);

  async function handleRunBuild() {
    const current = getSession<BuildSession>(tabId);
    const selectedCommit = current?.selectedCommit;
    if (!current || !selectedCommit) return;
    const neuronResource = `organisations/${orgRef.current}/products/${productRef.current}/neurons/${neuron}`;

    if (current.buildMode === "local") {
      patchSession<BuildSession>(tabId, { step: "running", progressMsg: "Building locally..." });
      const taskId = addNotification({
        severity: "info",
        source: "build",
        title: "Local build started",
        body: neuron,
        persistent: true,
        task: {
          type: "build",
          status: "running",
          neuronId: neuron,
          step: "running",
          startedAt: Date.now(),
          logBuffer: [],
          meta: { mode: "local" },
        },
      });
      taskIdRef.current = taskId;
      setTabNotificationId(tabId, taskId);
      try {
        const result = await BuildService.StartLocalBuild(neuronResource, selectedCommit.sha);
        if (result) patchSession<BuildSession>(tabId, { localBuildId: result.buildId });
      } catch (e: any) {
        const errMsg = e?.message || "Failed to start local build";
        patchSession<BuildSession>(tabId, {
          step: "result",
          buildResult: {
            operationName: "",
            version: "",
            neuronVersion: "",
            logsUrl: "",
            notes: "",
            done: true,
            error: errMsg,
          },
        });
        completeTaskNotification(updateNotification, {
          id: taskId,
          severity: "error",
          title: "Local build failed",
          body: errMsg,
          taskStatus: "error",
          taskPatch: { step: "result" },
        });
        taskIdRef.current = null;
      }
      return;
    }

    // Cloud build (both 'cloud' and 'deploy' modes)
    patchSession<BuildSession>(tabId, {
      step: "running",
      buildPhase: "build",
      progressMsg: "Starting Build...",
    });
    const taskId = addNotification({
      severity: "info",
      source: "build",
      title: "Build started",
      body: neuron,
      persistent: true,
      task: {
        type: "build",
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
      const result = await BuildService.RunBuild(neuronResource, selectedCommit.sha);
      patchSession<BuildSession>(tabId, { buildResult: result as BuildResult });
      updateNotification(taskId, {
        task: {
          meta: {
            operationName: (result as BuildResult).operationName,
            logsUrl: (result as BuildResult).logsUrl,
          },
        },
      });
    } catch (e: any) {
      const errMsg = e?.message || String(e) || "Failed to start build";
      patchSession<BuildSession>(tabId, {
        step: "result",
        buildResult: {
          operationName: "",
          version: "",
          neuronVersion: "",
          logsUrl: "",
          notes: "",
          done: true,
          error: errMsg,
        },
      });
      buildBus.write(`\r\n\x1b[31mBuild failed: ${errMsg}\x1b[0m\r\n`);
      completeTaskNotification(updateNotification, {
        id: taskId,
        severity: "error",
        title: "Build failed",
        body: errMsg,
        taskStatus: "error",
        taskPatch: { step: "result" },
      });
      taskIdRef.current = null;
    }
  }
  const runBuildRef = useRef(handleRunBuild);
  runBuildRef.current = handleRunBuild;

  async function handleStartDeploy(version: string) {
    patchSession<BuildSession>(tabId, { buildPhase: "deploy", progressMsg: "Starting Deploy..." });
    deployLogOffsets.current = {};

    const current = getSession<BuildSession>(tabId);
    const neuronResource = `organisations/${orgRef.current}/products/${productRef.current}/neurons/${neuron}`;
    const envs = current?.selectedDeployEnvs ?? [];
    const envObjList = current?.deployEnvs ?? [];

    envs.forEach((env) => {
      deployLogOffsets.current[env] = 0;
    });

    const initialRuns: EnvRunState[] = envs.map((envName) => {
      const envObj = envObjList.find((e) => e.name === envName);
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
    patchSession<BuildSession>(tabId, { deployRuns: initialRuns, activeRunEnv: envs[0] || "" });

    let startError: string | null = null;
    const deployResult = await DeployService.RunDeploy(
      neuronResource,
      version,
      envs,
      false,
      false,
    ).catch((e: unknown) => {
      startError = e instanceof Error ? e.message : String(e);
      return null;
    });

    const updatedRuns: EnvRunState[] = initialRuns.map((run, i) => ({
      ...run,
      operationName: deployResult?.operationName ?? "",
      deploymentIndex: i,
      progressMsg: startError ? `Failed: ${startError}` : deployResult?.notes || "Running...",
      done: !!startError,
      error: startError ?? undefined,
    }));
    patchSession<BuildSession>(tabId, { deployRuns: updatedRuns });
  }

  const step = session?.step ?? "commits";
  const buildResult = session?.buildResult ?? null;
  const buildPhase = session?.buildPhase ?? "build";
  const localBuildId = session?.localBuildId ?? null;
  const deployRuns = session?.deployRuns ?? [];

  // Poll cloud build
  useEffect(() => {
    if (!buildResult || buildResult.done || step !== "running") return;
    cloudBuildPollFailuresRef.current = 0;
    const interval = setInterval(async () => {
      try {
        const neuronResource = `organisations/${orgRef.current}/products/${productRef.current}/neurons/${neuron}`;
        const result = await BuildService.PollBuildOperation(
          buildResult.operationName,
          neuronResource,
        );
        cloudBuildPollFailuresRef.current = 0;
        patchSession<BuildSession>(tabId, { buildResult: result as BuildResult });
        if (result?.done) {
          clearInterval(interval);
          if (!result.error) {
            if (getSession<BuildSession>(tabId)?.buildMode === "deploy") {
              const version = result.version || result.neuronVersion;
              patchSession<BuildSession>(tabId, { step: "running" });
              handleStartDeploy(version);
            } else {
              patchSession<BuildSession>(tabId, { step: "result" });
              const version = result.neuronVersion || result.version;
              const body = version ? `${neuron} · ${version}` : neuron;
              if (taskIdRef.current) {
                completeTaskNotification(updateNotification, {
                  id: taskIdRef.current,
                  severity: "success",
                  title: "Build complete",
                  body,
                  taskStatus: "done",
                  taskPatch: { step: "result" },
                  actions: [
                    {
                      label: "Deploy",
                      variant: "primary",
                      onClick: () => {
                        openTab("deploy", neuron);
                        navigate("/develop");
                      },
                    },
                  ],
                });
                taskIdRef.current = null;
              }
            }
          } else {
            patchSession<BuildSession>(tabId, { step: "result" });
            if (taskIdRef.current) {
              completeTaskNotification(updateNotification, {
                id: taskIdRef.current,
                severity: "error",
                title: "Build failed",
                body: result.error,
                taskStatus: "error",
                taskPatch: { step: "result" },
              });
              taskIdRef.current = null;
            }
          }
        } else if (result?.notes) {
          patchSession<BuildSession>(tabId, { progressMsg: result.notes });
        }
      } catch {
        cloudBuildPollFailuresRef.current += 1;
        if (cloudBuildPollFailuresRef.current >= MAX_POLL_FAILURES) {
          clearInterval(interval);
          patchSession<BuildSession>(tabId, { step: "result" });
          if (taskIdRef.current) {
            completeTaskNotification(updateNotification, {
              id: taskIdRef.current,
              severity: "error",
              title: "Build status unknown",
              body: "Lost connection to build status — check Cloud Build for the actual result.",
              taskStatus: "error",
              taskPatch: { step: "result" },
            });
            taskIdRef.current = null;
          }
        }
      }
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildResult?.operationName, buildResult?.done, step]);

  // Stream cloud build logs
  useEffect(() => {
    if (!buildResult?.logsUrl) return;
    const fetchLogs = async () => {
      try {
        const chunk = await BuildService.FetchBuildLogs(buildResult.logsUrl, logOffsetRef.current);
        if (chunk?.content) {
          buildBus.write(chunk.content);
          logOffsetRef.current = chunk.nextOffset;
          if (taskIdRef.current)
            updateNotification(taskIdRef.current, {
              task: { logBuffer: [...buildBus.getSnapshot()] },
            });
        }
      } catch {}
    };
    if (buildResult.done) {
      fetchLogs();
      return;
    }
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildResult?.logsUrl, buildResult?.done]);

  // Poll local build
  useEffect(() => {
    if (!localBuildId || step !== "running") return;
    let offset = 0;
    localBuildPollFailuresRef.current = 0;
    const interval = setInterval(async () => {
      try {
        const chunk = await BuildService.PollLocalBuild(localBuildId, offset);
        localBuildPollFailuresRef.current = 0;
        if (chunk?.content) {
          buildBus.write(chunk.content);
          offset = chunk.nextOffset;
          if (taskIdRef.current)
            updateNotification(taskIdRef.current, {
              task: { logBuffer: [...buildBus.getSnapshot()] },
            });
        }
        if (chunk?.done) {
          clearInterval(interval);
          patchSession<BuildSession>(tabId, {
            step: "result",
            buildResult: {
              operationName: "",
              version: "",
              neuronVersion: "",
              logsUrl: "",
              notes: "",
              done: true,
              error: chunk.error || undefined,
            },
          });
          if (!chunk.error) {
            if (taskIdRef.current) {
              completeTaskNotification(updateNotification, {
                id: taskIdRef.current,
                severity: "success",
                title: "Local build complete",
                body: neuron,
                taskStatus: "done",
                taskPatch: { step: "result" },
                actions: [
                  {
                    label: "Deploy",
                    variant: "primary",
                    onClick: () => {
                      openTab("deploy", neuron);
                      navigate("/develop");
                    },
                  },
                ],
              });
              taskIdRef.current = null;
            }
          } else if (taskIdRef.current) {
            completeTaskNotification(updateNotification, {
              id: taskIdRef.current,
              severity: "error",
              title: "Local build failed",
              body: chunk.error,
              taskStatus: "error",
              taskPatch: { step: "result" },
            });
            taskIdRef.current = null;
          }
        }
      } catch {
        localBuildPollFailuresRef.current += 1;
        if (localBuildPollFailuresRef.current >= MAX_POLL_FAILURES) {
          clearInterval(interval);
          patchSession<BuildSession>(tabId, { step: "result" });
          if (taskIdRef.current) {
            completeTaskNotification(updateNotification, {
              id: taskIdRef.current,
              severity: "error",
              title: "Local build status unknown",
              body: "Lost connection to build status.",
              taskStatus: "error",
              taskPatch: { step: "result" },
            });
            taskIdRef.current = null;
          }
        }
      }
    }, 500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localBuildId, step]);

  // Poll deploy operations (build+deploy mode)
  const deployPollKey = deployRuns
    .filter((r) => r.operationName && !r.done)
    .map((r) => r.operationName)
    .join(",");
  useEffect(() => {
    if (!deployPollKey || step !== "running" || buildPhase !== "deploy") return;
    const interval = setInterval(async () => {
      const currentRuns = getSession<BuildSession>(tabId)?.deployRuns ?? [];
      const running = currentRuns.filter((r) => r.operationName && !r.done);
      if (running.length === 0) return;

      const uniqueOpNames = [...new Set(running.map((r) => r.operationName))];
      const polled = await Promise.allSettled(
        uniqueOpNames.map((name) => DeployService.PollDeployOperation(name)),
      );

      const prev = getSession<BuildSession>(tabId)?.deployRuns ?? [];
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
      patchSession<BuildSession>(tabId, { deployRuns: next });
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployPollKey, step, buildPhase]);

  // Stream deploy logs (build+deploy mode)
  const deployLogsKey = deployRuns
    .filter((r) => r.logsUrl)
    .map((r) => r.logsUrl + r.done)
    .join(",");
  useEffect(() => {
    const withLogs = deployRuns.filter((r) => r.logsUrl);
    if (withLogs.length === 0) return;

    const intervals: (ReturnType<typeof setInterval> | null)[] = withLogs.map((run) => {
      const fetchLogs = async () => {
        try {
          const chunk = await DeployService.FetchDeployLogs(
            run.logsUrl,
            deployLogOffsets.current[run.env] ?? 0,
          );
          if (chunk?.content) {
            getLogBus(tabId, run.env).write(chunk.content);
            deployLogOffsets.current[run.env] = chunk.nextOffset;
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
  }, [deployLogsKey]);

  // Transition to result when all deploy runs finish
  useEffect(() => {
    if (step !== "running" || buildPhase !== "deploy" || deployRuns.length === 0) return;
    if (!deployRuns.every((r) => r.done)) return;
    patchSession<BuildSession>(tabId, { step: "result" });
    if (taskIdRef.current) {
      const doneId = taskIdRef.current;
      taskIdRef.current = null;
      const hasError = deployRuns.some((r) => r.error);
      if (hasError) {
        completeTaskNotification(updateNotification, {
          id: doneId,
          severity: "error",
          title: "Build & Deploy failed",
          taskStatus: "error",
          taskPatch: { step: "result" },
        });
      } else {
        completeTaskNotification(updateNotification, {
          id: doneId,
          severity: "success",
          title: "Build & Deploy complete",
          body: neuron,
          taskStatus: "done",
          taskPatch: { step: "result" },
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployRuns, step, buildPhase]);

  if (!session) return null;

  return (
    <>
      {/* Step: commits */}
      {session.step === "commits" && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="shrink-0 flex items-center gap-[8px] px-[14px] py-[9px] border-b border-border">
            <Icon icon="solar:branch-linear" className="text-foreground/35 text-sm shrink-0" />
            <SearchableSelect
              value={session.branch}
              options={session.branches}
              onChange={handleBranchChange}
              className="flex-1 min-w-0"
            />
            <button
              onClick={() => loadCommits(session.branch)}
              disabled={session.commitsLoading}
              className="flex items-center justify-center size-[24px] rounded-[4px] text-foreground/35 hover:text-foreground hover:bg-card transition-colors disabled:opacity-40 shrink-0"
              title="Refresh commits"
            >
              <Icon icon="solar:refresh-linear" className="text-sm" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <CommitList
              commits={session.commits}
              loading={session.commitsLoading}
              emptyText="No commits found for this branch."
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
          <div className="bg-card border border-border rounded-[8px] p-[14px] mb-[20px]">
            <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono mb-[8px]">
              {session.branch} · {session.selectedCommit.sha.substring(0, 7)}
            </p>
            <p className="text-[11px] text-foreground leading-[1.5] mb-[8px]">
              {session.selectedCommit.message}
            </p>
            <p className="text-[9px] text-foreground/40">
              {session.selectedCommit.author} · {formatTimestamp(session.selectedCommit.timestamp)}
            </p>
          </div>
          <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono mb-[8px]">
            Action
          </p>
          <div className="flex flex-col gap-[2px] mb-[20px]">
            {[
              { mode: "cloud" as BuildMode, icon: "solar:cloud-bolt-linear", label: "Cloud Build" },
              { mode: "local" as BuildMode, icon: "solar:laptop-linear", label: "Build Locally" },
              {
                mode: "deploy" as BuildMode,
                icon: "solar:rocket-2-linear",
                label: "Build and Deploy",
              },
            ].map(({ mode, icon, label }) => (
              <button
                key={mode}
                onClick={() => patch({ buildMode: mode })}
                className={`flex items-center gap-[10px] px-[12px] py-[10px] rounded-[6px] border transition-colors text-left ${
                  session.buildMode === mode
                    ? "bg-brand-fill/8 border-brand-fill/35 text-foreground"
                    : "bg-background border-border text-foreground/50 hover:border-border hover:text-foreground/70"
                }`}
              >
                <span
                  className={`size-[6px] rounded-full shrink-0 ${session.buildMode === mode ? "bg-brand-fill" : "bg-accent"}`}
                />
                <Icon icon={icon} className="text-sm shrink-0" />
                <span className="text-[11px] font-medium flex-1">{label}</span>
              </button>
            ))}
          </div>

          {/* Environment picker — shown only for Build and Deploy mode */}
          {session.buildMode === "deploy" && (
            <div className="mb-[20px]">
              <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono mb-[8px]">
                Target Environments
              </p>
              {session.envsLoading ? (
                <div className="flex items-center gap-[8px] text-[10px] text-foreground/40">
                  <Loader size={14} />
                  Loading...
                </div>
              ) : session.deployEnvs.length === 0 ? (
                <p className="text-[10px] text-foreground/30">No environments found.</p>
              ) : (
                <div className="flex flex-col gap-[2px]">
                  {session.deployEnvs.map((env) => {
                    const selected = session.selectedDeployEnvs.includes(env.name);
                    return (
                      <button
                        key={env.name}
                        onClick={() =>
                          patch({
                            selectedDeployEnvs: selected
                              ? session.selectedDeployEnvs.filter((e) => e !== env.name)
                              : [...session.selectedDeployEnvs, env.name],
                          })
                        }
                        className={`flex items-center gap-[10px] px-[12px] py-[9px] rounded-[6px] border transition-colors text-left ${
                          selected
                            ? "bg-brand-fill/8 border-brand-fill/35 text-foreground"
                            : "bg-background border-border text-foreground/50 hover:text-foreground/70"
                        }`}
                      >
                        <CheckCircle selected={selected} size={13} />
                        <span className="text-[11px] font-medium flex-1">
                          {env.displayName || env.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <Button
            variant="primary"
            className="w-full justify-center py-[10px]"
            disabled={session.buildMode === "deploy" && session.selectedDeployEnvs.length === 0}
            onClick={handleRunBuild}
          >
            {session.buildMode === "cloud"
              ? "Run Cloud Build"
              : session.buildMode === "local"
                ? "Build Locally"
                : "Build and Deploy"}
          </Button>
        </div>
      )}

      {/* Steps: running + result — build phase (single terminal) */}
      {(session.step === "running" || session.step === "result") &&
        session.buildPhase === "build" && (
          <BuildRunView
            step={session.step}
            progressMsg={session.progressMsg}
            buildResult={session.buildResult}
            bus={buildBus}
            onRerun={session.step === "result" ? () => loadCommits("master") : undefined}
          />
        )}

      {/* Steps: running + result — deploy phase (per-env terminals) */}
      {(session.step === "running" || session.step === "result") &&
        session.buildPhase === "deploy" && (
          <EnvRunView
            runs={session.deployRuns}
            activeEnv={session.activeRunEnv}
            onSelectEnv={(env) => patch({ activeRunEnv: env })}
            step={session.step}
            busFor={(env) => getLogBus(tabId, env)}
            onRerun={session.step === "result" ? () => loadCommits("master") : undefined}
          />
        )}
    </>
  );
}
