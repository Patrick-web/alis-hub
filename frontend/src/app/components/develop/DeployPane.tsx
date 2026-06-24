import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { Button } from '../Button';
import { Loader } from '../Loader';
import { Browser } from '@wailsio/runtime';
import { BuildTerminal, type BuildTerminalHandle } from '../BuildTerminal';
import { useWorkspace } from '../../stores/workspace';
import { useNotifications } from '../../stores/notifications';
import { useDevelopTabs } from '../../stores/developTabs';
import type { AppNotification } from '../../stores/notifications';
import type { DeployEnv, DeployStep, EnvRunState } from './types';
import { isAuthError, formatRelativeTime } from './types';
import * as DeployService from '../../../../bindings/alis-hub-v3/deployservice';
import * as ProductService from '../../../../bindings/alis-hub-v3/productservice';

interface DeployPaneProps {
  tabId: string;
  neuron: string;
  restore?: AppNotification;
}

export function DeployPane({ tabId, neuron, restore }: DeployPaneProps) {
  const { state, setPhase } = useWorkspace();
  const { addNotification, updateNotification, setFocusTaskId } = useNotifications();
  const { setTabNotificationId } = useDevelopTabs();
  const navigate = useNavigate();

  const [step, setStep] = useState<DeployStep>('loading');
  const [deployError, setDeployError] = useState<string | null>(null);
  const [envs, setEnvs] = useState<DeployEnv[]>([]);
  const [selectedEnvs, setSelectedEnvs] = useState<string[]>([]);
  const [versions, setVersions] = useState<{ version: string; createTime: number }[]>([]);
  const [version, setVersion] = useState('');
  const [planOnly, setPlanOnly] = useState(false);
  const [beta, setBeta] = useState(false);

  // Per-environment run state
  const [envRuns, setEnvRuns] = useState<EnvRunState[]>([]);
  const [activeRunEnv, setActiveRunEnv] = useState('');

  const termRefsMap = useRef<Record<string, BuildTerminalHandle | null>>({});
  const logOffsetRefs = useRef<Record<string, number>>({});
  const logBufferRefs = useRef<Record<string, string[]>>({});
  const taskIdRef = useRef<string | null>(null);

  const orgRef = useRef(state.organisation);
  const productRef = useRef(state.product);
  const activeEnvRef = useRef(state.activeEnvName);
  orgRef.current = state.organisation;
  productRef.current = state.product;
  activeEnvRef.current = state.activeEnvName;

  useEffect(() => {
    if (restore?.task) {
      const { step: savedStep, meta } = restore.task;
      setStep(savedStep as DeployStep);
      taskIdRef.current = restore.id;
      if (savedStep === 'running' && Array.isArray(meta.envOps)) {
        const ops = meta.envOps as EnvRunState[];
        ops.forEach(op => {
          logOffsetRefs.current[op.env] = 0;
          logBufferRefs.current[op.env] = [...(restore.task!.logBuffer ?? [])];
        });
        setEnvRuns(ops.map(op => ({ ...op, done: false, progressMsg: 'Reconnecting...' })));
        setActiveRunEnv(ops[0]?.env ?? '');
      }
    } else {
      loadDeployInfo();
    }
  }, []);

  async function loadDeployInfo() {
    setStep('loading');
    setDeployError(null);
    setEnvs([]);
    setVersions([]);
    setSelectedEnvs([]);
    setVersion('');
    setEnvRuns([]);
    logOffsetRefs.current = {};
    logBufferRefs.current = {};
    const neuronResource = `organisations/${orgRef.current}/products/${productRef.current}/neurons/${neuron}`;
    try {
      const [overview, versionList] = await Promise.all([
        ProductService.GetServicesOverview(orgRef.current, productRef.current),
        DeployService.ListNeuronVersions(neuronResource),
      ]);
      const builtVersions = (versionList ?? []).filter(v => v !== null).map(v => ({
        version: v!.version, createTime: v!.createTime,
      }));
      setVersions(builtVersions);
      if (builtVersions.length > 0) setVersion(builtVersions[0].version);
      const envList: DeployEnv[] = (overview?.environments ?? []).map(env => {
        const dep = env.deployments?.find((d: any) => d.neuronId === neuron);
        return { name: env.name, displayName: env.displayName, currentVersion: dep?.version ?? '' };
      });
      setEnvs(envList);
      if (activeEnvRef.current) {
        const active = envList.find(e => e.name === activeEnvRef.current);
        if (active) setSelectedEnvs([active.name]);
      }
    } catch (e: unknown) {
      if (isAuthError(e)) { setPhase('login'); return; }
      setDeployError(e instanceof Error ? e.message : String(e));
    } finally {
      setStep('confirm');
    }
  }

  async function handleRunDeploy() {
    if (selectedEnvs.length === 0 || !version) return;
    const neuronResource = `organisations/${orgRef.current}/products/${productRef.current}/neurons/${neuron}`;
    setStep('running');

    // Reset per-env refs
    termRefsMap.current = {};
    logOffsetRefs.current = {};
    logBufferRefs.current = {};
    selectedEnvs.forEach(env => {
      logOffsetRefs.current[env] = 0;
      logBufferRefs.current[env] = [];
    });

    // Init run states
    const initialRuns: EnvRunState[] = selectedEnvs.map(envName => {
      const envObj = envs.find(e => e.name === envName);
      return {
        env: envName,
        displayName: envObj?.displayName || envName,
        operationName: '',
        logsUrl: '',
        version: '',
        progressMsg: 'Starting...',
        done: false,
      };
    });
    setEnvRuns(initialRuns);
    setActiveRunEnv(selectedEnvs[0]);

    const taskId = addNotification({
      severity: 'info', source: 'deploy', title: 'Deploy started', body: neuron, persistent: true,
      task: { type: 'deploy', status: 'running', neuronId: neuron, step: 'running', startedAt: Date.now(), logBuffer: [], meta: {} },
    });
    taskIdRef.current = taskId;
    setTabNotificationId(tabId, taskId);

    // Start a single deploy for all environments
    let startError: string | null = null;
    const deployResult = await DeployService.RunDeploy(neuronResource, version, selectedEnvs, planOnly, beta)
      .catch((e: unknown) => {
        startError = e instanceof Error ? e.message : String(e);
        return null;
      });

    const updatedRuns: EnvRunState[] = initialRuns.map((run, i) => {
      if (deployResult) {
        return {
          ...run,
          operationName: deployResult.operationName ?? '',
          deploymentIndex: i,
          progressMsg: deployResult.notes || 'Running...',
        };
      }
      return { ...run, done: true, error: startError ?? 'Failed to start', progressMsg: `Failed: ${startError}` };
    });
    setEnvRuns(updatedRuns);

    // Persist env ops in notification meta for restore
    updateNotification(taskId, {
      task: {
        meta: {
          envOps: updatedRuns.map(r => ({
            env: r.env, displayName: r.displayName, operationName: r.operationName,
            logsUrl: r.logsUrl, version: r.version, deploymentIndex: r.deploymentIndex,
          })),
        },
      },
    });
  }

  // Poll all running operations
  const pollKey = envRuns.filter(r => r.operationName && !r.done).map(r => r.operationName).join(',');
  useEffect(() => {
    if (!pollKey || step !== 'running') return;
    const interval = setInterval(async () => {
      let updatedRuns: EnvRunState[] | null = null;
      setEnvRuns(prev => {
        updatedRuns = prev;
        return prev;
      });
      if (!updatedRuns) return;

      const running = (updatedRuns as EnvRunState[]).filter(r => r.operationName && !r.done);
      if (running.length === 0) return;

      const uniqueOpNames = [...new Set(running.map(r => r.operationName))];
      const polled = await Promise.allSettled(
        uniqueOpNames.map(name => DeployService.PollDeployOperation(name))
      );

      setEnvRuns(prev => {
        const next = [...prev];
        uniqueOpNames.forEach((opName, opIdx) => {
          const res = polled[opIdx];
          const envs = next.filter(r => r.operationName === opName && !r.done);
          envs.forEach(run => {
            const idx = next.findIndex(r => r.env === run.env);
            if (idx === -1) return;
            if (res.status === 'fulfilled' && res.value) {
              const r = res.value;
              next[idx] = {
                ...next[idx],
                done: r.done ?? false,
                error: r.error || undefined,
                version: r.version || next[idx].version,
                logsUrl: r.deployments?.[run.deploymentIndex ?? 0]?.logsUrl || next[idx].logsUrl,
                progressMsg: r.notes || next[idx].progressMsg,
              };
            } else if (res.status === 'rejected') {
              next[idx] = { ...next[idx], done: true, error: res.reason?.message || 'Poll failed' };
            }
          });
        });
        return next;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [pollKey, step]);

  // Transition to result and update notification when all runs finish
  useEffect(() => {
    if (step !== 'running' || envRuns.length === 0) return;
    const allDone = envRuns.every(r => r.done);
    if (!allDone) return;
    setStep('result');
    if (taskIdRef.current) {
      const doneId = taskIdRef.current;
      taskIdRef.current = null;
      const hasError = envRuns.some(r => r.error);
      if (hasError) {
        updateNotification(doneId, { severity: 'error', title: 'Deploy failed', task: { status: 'error', step: 'result' } });
      } else {
        updateNotification(doneId, {
          severity: 'success', title: 'Deploy complete', task: { status: 'done', step: 'result' },
          actions: [{ label: 'Open in Develop', variant: 'primary', onClick: () => { setFocusTaskId(doneId); navigate('/develop'); } }],
        });
      }
    }
  }, [envRuns, step]);

  // Stream logs for all envs
  const logsKey = envRuns.filter(r => r.logsUrl).map(r => r.logsUrl + r.done).join(',');
  useEffect(() => {
    const withLogs = envRuns.filter(r => r.logsUrl);
    if (withLogs.length === 0) return;

    const intervals: (ReturnType<typeof setInterval> | null)[] = withLogs.map(run => {
      const fetchLogs = async () => {
        try {
          const chunk = await DeployService.FetchDeployLogs(run.logsUrl, logOffsetRefs.current[run.env] ?? 0);
          if (chunk?.content) {
            termRefsMap.current[run.env]?.write(chunk.content);
            logOffsetRefs.current[run.env] = chunk.nextOffset;
            logBufferRefs.current[run.env] = [...(logBufferRefs.current[run.env] ?? []), chunk.content];
            if (taskIdRef.current) {
              const combined = Object.values(logBufferRefs.current).flat();
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

    return () => intervals.forEach(i => { if (i !== null) clearInterval(i); });
  }, [logsKey]);

  return (
    <>
      {/* Step: loading */}
      {step === 'loading' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-[12px]">
            <Loader size={20} />
            <p className="text-[11px] text-foreground/40">Loading deployment info...</p>
          </div>
        </div>
      )}

      {/* Step: confirm */}
      {step === 'confirm' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto">
            {deployError && (
              <div className="mx-[14px] mt-[14px] flex items-start gap-[8px] p-[10px] bg-[rgba(255,92,95,0.1)] border border-[rgba(255,92,95,0.3)] rounded-[6px]">
                <Icon icon="solar:danger-triangle-linear" className="text-destructive text-sm shrink-0 mt-[1px]" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-foreground/80 mb-[2px]">Failed to load deploy info</p>
                  <p className="text-[9px] text-foreground/50 leading-relaxed break-words">{deployError}</p>
                </div>
              </div>
            )}
            <div className="border-b border-border">
              <div className="px-[16px] pt-[14px] pb-[8px]">
                <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono">Build Version</p>
              </div>
              {versions.length === 0 ? (
                <div className="px-[16px] pb-[12px]">
                  <p className="text-[11px] text-foreground/30">No built versions found.</p>
                </div>
              ) : (
                <div className="max-h-[160px] overflow-y-auto">
                  {versions.map((v) => {
                    const selected = version === v.version;
                    const ago = v.createTime > 0 ? formatRelativeTime(v.createTime) : '';
                    return (
                      <button
                        key={v.version}
                        onClick={() => setVersion(v.version)}
                        className={`w-full text-left px-[16px] py-[9px] border-b border-border flex items-center gap-[10px] transition-colors ${
                          selected ? 'bg-[rgba(248,129,169,0.08)]' : 'hover:bg-foreground/[2%]'
                        }`}
                      >
                        <span className={`size-[14px] rounded-full border flex items-center justify-center shrink-0 transition-colors ${selected ? 'bg-brand border-brand' : 'border-border'}`}>
                          {selected && <Icon icon="solar:check-linear" className="text-brand-foreground text-[9px]" />}
                        </span>
                        <span className={`text-[12px] font-bold font-mono ${selected ? 'text-brand' : 'text-foreground'}`}>{v.version}</span>
                        {ago && <span className="ml-auto text-[9px] text-foreground/30 shrink-0">{ago}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-[16px] pt-[12px] pb-[4px]">
              <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono mb-[8px]">Target Environments</p>
            </div>
            {envs.length === 0 ? (
              <div className="px-[16px] pb-[12px]">
                <p className="text-[11px] text-foreground/30">No environments found.</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {envs.map((env) => {
                  const selected = selectedEnvs.includes(env.name);
                  const isCurrent = env.currentVersion === version;
                  const hasDeployment = !!env.currentVersion;
                  return (
                    <button
                      key={env.name}
                      onClick={() => setSelectedEnvs(prev => selected ? prev.filter(e => e !== env.name) : [...prev, env.name])}
                      className={`text-left px-[16px] py-[11px] border-b border-border transition-colors flex items-center gap-[10px] ${selected ? 'bg-[rgba(248,129,169,0.05)]' : 'hover:bg-foreground/[2%]'}`}
                    >
                      <span className={`size-[14px] rounded-[3px] border flex items-center justify-center shrink-0 transition-colors ${selected ? 'bg-brand border-brand' : 'border-border'}`}>
                        {selected && <Icon icon="solar:check-linear" className="text-brand-foreground text-[9px]" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-foreground leading-tight">{env.displayName || env.name}</p>
                      </div>
                      {hasDeployment ? (
                        isCurrent ? (
                          <span className="text-[9px] font-bold font-mono text-success shrink-0">{env.currentVersion} ✓</span>
                        ) : (
                          <div className="flex items-center gap-[4px] shrink-0">
                            <span className="text-[9px] font-mono text-foreground/30 line-through">{env.currentVersion}</span>
                            <Icon icon="solar:alt-arrow-right-linear" className="text-foreground/25 text-[10px]" />
                            <span className="text-[9px] font-bold font-mono text-brand">{version || '?'}</span>
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
              <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono mb-[10px]">Options</p>
              <div className="flex flex-col gap-[8px]">
                <label className="flex items-center gap-[8px] cursor-pointer">
                  <input type="checkbox" checked={planOnly} onChange={(e) => setPlanOnly(e.target.checked)} className="accent-brand" />
                  <div>
                    <span className="text-[10px] text-foreground/70">Plan only</span>
                    <span className="text-[9px] text-foreground/30 ml-[6px]">terraform plan, no apply</span>
                  </div>
                </label>
                <label className="flex items-center gap-[8px] cursor-pointer">
                  <input type="checkbox" checked={beta} onChange={(e) => setBeta(e.target.checked)} className="accent-brand" />
                  <div>
                    <span className="text-[10px] text-foreground/70">Beta</span>
                    <span className="text-[9px] text-foreground/30 ml-[6px]">sets ALIS_BETA_VERSION</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
          <div className="shrink-0 px-[14px] py-[10px] border-t border-border">
            <Button
              variant="primary"
              className="w-full justify-center py-[10px]"
              disabled={!version || selectedEnvs.length === 0}
              onClick={handleRunDeploy}
            >
              {planOnly ? 'Run Plan' : 'Run Deploy'} · {selectedEnvs.length} env{selectedEnvs.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      )}

      {/* Steps: running + result — one terminal per env */}
      {(step === 'running' || step === 'result') && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Env tab bar — only shown when deploying to multiple environments */}
          {envRuns.length > 1 && (
            <div className="shrink-0 flex border-b border-border overflow-x-auto">
              {envRuns.map(run => (
                <button
                  key={run.env}
                  onClick={() => setActiveRunEnv(run.env)}
                  className={`flex items-center gap-[6px] px-[12px] py-[8px] text-[10px] shrink-0 border-r border-border transition-colors ${
                    activeRunEnv === run.env
                      ? 'text-foreground border-b-2 border-b-brand bg-foreground/[2%]'
                      : 'text-foreground/40 hover:text-foreground/60 hover:bg-foreground/[2%]'
                  }`}
                >
                  {run.done && run.error ? (
                    <Icon icon="solar:close-circle-linear" className="text-destructive text-[11px] shrink-0" />
                  ) : run.done ? (
                    <Icon icon="solar:check-circle-linear" className="text-success text-[11px] shrink-0" />
                  ) : (
                    <Loader size={10} />
                  )}
                  <span className="font-medium">{run.displayName}</span>
                </button>
              ))}
            </div>
          )}

          {/* Per-env terminal panes */}
          {envRuns.map(run => (
            <div
              key={run.env}
              className="flex-1 flex flex-col min-h-0"
              style={{ display: (activeRunEnv === run.env || envRuns.length === 1) ? 'flex' : 'none' }}
            >
              {/* Per-env status header */}
              {step === 'running' && !run.done && (
                <div className="shrink-0 flex items-center gap-[10px] px-[14px] py-[10px] border-b border-border">
                  <Loader size={20} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-foreground leading-tight">{planOnly ? 'Planning' : 'Deploying'} · {run.version || version}</p>
                    <p className="text-[9px] text-foreground/40 truncate leading-tight mt-[1px]">{run.progressMsg}</p>
                  </div>
                </div>
              )}
              {(step === 'result' || run.done) && (
                <div className={`shrink-0 px-[14px] py-[10px] border-b border-border ${run.error ? 'bg-[rgba(255,92,95,0.05)]' : 'bg-[rgba(52,199,89,0.05)]'}`}>
                  {run.error ? (
                    <div className="flex items-start gap-[8px]">
                      <Icon icon="solar:close-circle-linear" className="text-destructive text-sm shrink-0 mt-[1px]" />
                      <p className="text-[10px] text-foreground/70 leading-relaxed">{run.error}</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-[8px]">
                      <Icon icon="solar:check-circle-linear" className="text-success text-sm shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-foreground leading-tight">{planOnly ? 'Plan Complete' : 'Deploy Complete'}</p>
                        {(run.version || version) && (
                          <p className="text-[9px] text-foreground/40 font-mono truncate leading-tight mt-[1px]">{run.version || version}</p>
                        )}
                      </div>
                      {run.logsUrl && (
                        <button onClick={() => Browser.OpenURL(run.logsUrl)} className="ml-auto shrink-0 text-foreground/30 hover:text-brand transition-colors" title="Open in browser">
                          <Icon icon="solar:arrow-right-up-linear" className="text-sm" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              <BuildTerminal
                ref={r => { termRefsMap.current[run.env] = r; }}
                className="flex-1 min-h-0"
              />
            </div>
          ))}

          {step === 'result' && (
            <div className="shrink-0 px-[14px] py-[10px] border-t border-border">
              <button onClick={loadDeployInfo} className="text-[10px] text-foreground/35 hover:text-foreground transition-colors flex items-center gap-[6px]">
                <Icon icon="solar:refresh-linear" className="text-sm" />
                Run Deploy again
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
