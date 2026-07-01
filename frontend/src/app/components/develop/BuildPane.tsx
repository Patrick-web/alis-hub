import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { Button } from '../Button';
import { Loader } from '../Loader';
import { Browser } from '@wailsio/runtime';
import { BuildTerminal, type BuildTerminalHandle } from '../BuildTerminal';
import { useWorkspace } from '../../stores/workspace';
import { useDevelopSettings } from '../../stores/developSettings';
import { useNotifications } from '../../stores/notifications';
import { useDevelopTabs } from '../../stores/developTabs';
import type { AppNotification } from '../../stores/notifications';
import type { DefineCommit, BuildResult, BuildStep, BuildMode, DeployEnv, EnvRunState } from './types';
import { parseNeuron, formatTimestamp } from './types';
import { notify } from '../../lib/notify';
import { systemNotify } from '../../lib/systemNotify';
import * as BuildService from '../../../../bindings/alis-hub-v3/buildservice';
import * as DeployService from '../../../../bindings/alis-hub-v3/deployservice';
import * as ProductService from '../../../../bindings/alis-hub-v3/productservice';
import { SearchableSelect } from '../ui/searchable-select';

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

  const [step, setStep] = useState<BuildStep>('commits');
  const [commits, setCommits] = useState<DefineCommit[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<DefineCommit | null>(null);
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null);
  const [progressMsg, setProgressMsg] = useState('Starting...');
  const [branch, setBranch] = useState('master');
  const [branches, setBranches] = useState<string[]>(['master']);
  const [buildMode, setBuildMode] = useState<BuildMode>('cloud');
  const [localBuildId, setLocalBuildId] = useState<string | null>(null);

  // Build+Deploy state
  const [deployEnvs, setDeployEnvs] = useState<DeployEnv[]>([]);
  const [selectedDeployEnvs, setSelectedDeployEnvs] = useState<string[]>([]);
  const [envsLoading, setEnvsLoading] = useState(false);
  const [buildPhase, setBuildPhase] = useState<'build' | 'deploy'>('build');
  const [deployRuns, setDeployRuns] = useState<EnvRunState[]>([]);
  const [activeRunEnv, setActiveRunEnv] = useState('');

  const termRef = useRef<BuildTerminalHandle>(null);
  const logOffsetRef = useRef<number>(0);
  const logBufferRef = useRef<string[]>([]);
  const taskIdRef = useRef<string | null>(null);

  const orgRef = useRef(state.organisation);
  const productRef = useRef(state.product);
  const activeEnvRef = useRef(state.activeEnvName);
  orgRef.current = state.organisation;
  productRef.current = state.product;
  activeEnvRef.current = state.activeEnvName;

  // Refs for build+deploy phase
  const buildModeRef = useRef(buildMode);
  buildModeRef.current = buildMode;
  const selectedDeployEnvsRef = useRef(selectedDeployEnvs);
  selectedDeployEnvsRef.current = selectedDeployEnvs;
  const deployEnvsRef = useRef(deployEnvs);
  deployEnvsRef.current = deployEnvs;
  const deployTermsMap = useRef<Record<string, BuildTerminalHandle | null>>({});
  const deployLogOffsets = useRef<Record<string, number>>({});
  const deployLogBuffers = useRef<Record<string, string[]>>({});

  useEffect(() => {
    if (restore?.task) {
      const { step: savedStep, meta } = restore.task;
      setStep(savedStep as BuildStep);
      taskIdRef.current = restore.id;
      logBufferRef.current = [...restore.task.logBuffer];
      if (savedStep === 'running' && meta.operationName) {
        setBuildResult({
          operationName: meta.operationName as string, version: '', neuronVersion: '',
          logsUrl: (meta.logsUrl as string) || '', notes: '', done: false,
        });
      }
    } else {
      resolveDefaultBranchAndLoad();
    }
  }, []);

  async function resolveDefaultBranchAndLoad() {
    let initialBranch = 'master';
    if (devSettings.defaultBranch === 'local') {
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
    setStep('commits');
    setCommits([]);
    setSelectedCommit(null);
    setBuildResult(null);
    setBuildMode('cloud');
    setBranch(b);
    setLocalBuildId(null);
    logOffsetRef.current = 0;
    setBuildPhase('build');
    setDeployRuns([]);
    setActiveRunEnv('');
    setSelectedDeployEnvs([]);
    setCommitsLoading(true);
    const parsed = parseNeuron(neuron);
    const [, commitsResult] = await Promise.allSettled([
      BuildService.GetBuildBranches(orgRef.current, productRef.current).then(
        (bs) => { if (bs && bs.length > 0) setBranches(bs as string[]); }
      ),
      BuildService.GetBuildCommits(orgRef.current, productRef.current, parsed.id, parsed.version, b, 30),
    ]);
    setCommitsLoading(false);
    setCommits(commitsResult.status === 'fulfilled' && commitsResult.value ? commitsResult.value as DefineCommit[] : []);
  }

  async function handleBranchChange(b: string) {
    setBranch(b);
    setSelectedCommit(null);
    setCommitsLoading(true);
    setCommits([]);
    const parsed = parseNeuron(neuron);
    try {
      const result = await BuildService.GetBuildCommits(orgRef.current, productRef.current, parsed.id, parsed.version, b, 30);
      setCommits(result as DefineCommit[]);
    } catch {
      setCommits([]);
    } finally {
      setCommitsLoading(false);
    }
  }

  async function loadDeployEnvs() {
    setEnvsLoading(true);
    setDeployEnvs([]);
    try {
      const overview = await ProductService.GetServicesOverview(orgRef.current, productRef.current);
      const envList: DeployEnv[] = (overview?.environments ?? []).map((env: any) => ({
        name: env.name, displayName: env.displayName, currentVersion: '',
      }));
      setDeployEnvs(envList);
      if (activeEnvRef.current) {
        const active = envList.find(e => e.name === activeEnvRef.current);
        if (active) setSelectedDeployEnvs([active.name]);
      }
    } catch {} finally {
      setEnvsLoading(false);
    }
  }

  useEffect(() => {
    if (buildMode !== 'deploy') return;
    loadDeployEnvs();
  }, [buildMode]);

  async function handleRunBuild() {
    if (!selectedCommit) return;
    const neuronResource = `organisations/${orgRef.current}/products/${productRef.current}/neurons/${neuron}`;
    logBufferRef.current = [];

    if (buildMode === 'local') {
      setStep('running');
      setProgressMsg('Building locally...');
      const taskId = addNotification({
        severity: 'info', source: 'build', title: 'Local build started', body: neuron, persistent: true,
        task: { type: 'build', status: 'running', neuronId: neuron, step: 'running', startedAt: Date.now(), logBuffer: [], meta: { mode: 'local' } },
      });
      taskIdRef.current = taskId;
      setTabNotificationId(tabId, taskId);
      try {
        const result = await BuildService.StartLocalBuild(neuronResource, selectedCommit.sha);
        if (result) setLocalBuildId(result.buildId);
      } catch (e: any) {
        setStep('result');
        setBuildResult({ operationName: '', version: '', neuronVersion: '', logsUrl: '', notes: '', done: true, error: e?.message || 'Failed to start local build' });
        updateNotification(taskId, { severity: 'error', title: 'Local build failed', task: { status: 'error', step: 'result' } });
        taskIdRef.current = null;
      }
      return;
    }

    // Cloud build (both 'cloud' and 'deploy' modes)
    setStep('running');
    setBuildPhase('build');
    setProgressMsg('Starting Build...');
    const taskId = addNotification({
      severity: 'info', source: 'build', title: 'Build started', body: neuron, persistent: true,
      task: { type: 'build', status: 'running', neuronId: neuron, step: 'running', startedAt: Date.now(), logBuffer: [], meta: {} },
    });
    taskIdRef.current = taskId;
    setTabNotificationId(tabId, taskId);
    try {
      const result = await BuildService.RunBuild(neuronResource, selectedCommit.sha);
      setBuildResult(result as BuildResult);
      updateNotification(taskId, {
        task: { meta: { operationName: (result as BuildResult).operationName, logsUrl: (result as BuildResult).logsUrl } },
      });
    } catch (e: any) {
      const errMsg = e?.message || String(e) || 'Failed to start build';
      setStep('result');
      setBuildResult({ operationName: '', version: '', neuronVersion: '', logsUrl: '', notes: '', done: true, error: errMsg });
      termRef.current?.write(`\r\n\x1b[31mBuild failed: ${errMsg}\x1b[0m\r\n`);
      updateNotification(taskId, { severity: 'error', title: 'Build failed', task: { status: 'error', step: 'result' } });
      taskIdRef.current = null;
    }
  }

  async function handleStartDeploy(version: string) {
    setBuildPhase('deploy');
    setProgressMsg('Starting Deploy...');
    deployLogOffsets.current = {};
    deployLogBuffers.current = {};
    deployTermsMap.current = {};

    const neuronResource = `organisations/${orgRef.current}/products/${productRef.current}/neurons/${neuron}`;
    const envs = selectedDeployEnvsRef.current;
    const envObjList = deployEnvsRef.current;

    envs.forEach(env => {
      deployLogOffsets.current[env] = 0;
      deployLogBuffers.current[env] = [];
    });

    const initialRuns: EnvRunState[] = envs.map(envName => {
      const envObj = envObjList.find(e => e.name === envName);
      return { env: envName, displayName: envObj?.displayName || envName, operationName: '', logsUrl: '', version: '', progressMsg: 'Starting...', done: false };
    });
    setDeployRuns(initialRuns);
    setActiveRunEnv(envs[0] || '');

    let startError: string | null = null;
    const deployResult = await DeployService.RunDeploy(neuronResource, version, envs, false, false)
      .catch((e: unknown) => { startError = e instanceof Error ? e.message : String(e); return null; });

    const updatedRuns: EnvRunState[] = initialRuns.map((run, i) => ({
      ...run,
      operationName: deployResult?.operationName ?? '',
      deploymentIndex: i,
      progressMsg: startError ? `Failed: ${startError}` : (deployResult?.notes || 'Running...'),
      done: !!startError,
      error: startError ?? undefined,
    }));
    setDeployRuns(updatedRuns);
  }

  // Poll cloud build
  useEffect(() => {
    if (!buildResult || buildResult.done || step !== 'running') return;
    const interval = setInterval(async () => {
      try {
        const neuronResource = `organisations/${orgRef.current}/products/${productRef.current}/neurons/${neuron}`;
        const result = await BuildService.PollBuildOperation(buildResult.operationName, neuronResource);
        setBuildResult(result as BuildResult);
        if (result?.done) {
          clearInterval(interval);
          if (!result.error) {
            if (buildModeRef.current === 'deploy') {
              const version = result.version || result.neuronVersion;
              setStep('running');
              handleStartDeploy(version);
            } else {
              setStep('result');
              const version = result.neuronVersion || result.version;
              const body = version ? `${neuron} · ${version}` : neuron;
              if (taskIdRef.current) {
                updateNotification(taskIdRef.current, {
                  severity: 'success', title: 'Build complete', body,
                  task: { status: 'done', step: 'result' },
                  actions: [{ label: 'Deploy', variant: 'primary', onClick: () => { openTab('deploy', neuron); navigate('/develop'); } }],
                });
                taskIdRef.current = null;
              }
              notify.success('Build complete', {
                description: body,
                action: { label: 'Deploy', onClick: () => { openTab('deploy', neuron); navigate('/develop'); } },
              });
              systemNotify('Build complete', body);
            }
          } else {
            setStep('result');
            if (taskIdRef.current) {
              updateNotification(taskIdRef.current, { severity: 'error', title: 'Build failed', task: { status: 'error', step: 'result' } });
              taskIdRef.current = null;
            }
          }
        } else if (result?.notes) {
          setProgressMsg(result.notes);
        }
      } catch {
        clearInterval(interval);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [buildResult?.operationName, buildResult?.done, step]);

  // Stream cloud build logs
  useEffect(() => {
    if (!buildResult?.logsUrl) return;
    const fetchLogs = async () => {
      try {
        const chunk = await BuildService.FetchBuildLogs(buildResult.logsUrl, logOffsetRef.current);
        if (chunk?.content) {
          termRef.current?.write(chunk.content);
          logOffsetRef.current = chunk.nextOffset;
          logBufferRef.current.push(chunk.content);
          if (taskIdRef.current) updateNotification(taskIdRef.current, { task: { logBuffer: [...logBufferRef.current] } });
        }
      } catch {}
    };
    if (buildResult.done) { fetchLogs(); return; }
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [buildResult?.logsUrl, buildResult?.done]);

  // Poll local build
  useEffect(() => {
    if (!localBuildId || step !== 'running') return;
    let offset = 0;
    const interval = setInterval(async () => {
      try {
        const chunk = await BuildService.PollLocalBuild(localBuildId, offset);
        if (chunk?.content) {
          termRef.current?.write(chunk.content);
          offset = chunk.nextOffset;
          logBufferRef.current.push(chunk.content);
          if (taskIdRef.current) updateNotification(taskIdRef.current, { task: { logBuffer: [...logBufferRef.current] } });
        }
        if (chunk?.done) {
          clearInterval(interval);
          setStep('result');
          setBuildResult({ operationName: '', version: '', neuronVersion: '', logsUrl: '', notes: '', done: true, error: chunk.error || undefined });
          if (!chunk.error) {
            if (taskIdRef.current) {
              updateNotification(taskIdRef.current, {
                severity: 'success', title: 'Local build complete',
                task: { status: 'done', step: 'result' },
                actions: [{ label: 'Deploy', variant: 'primary', onClick: () => { openTab('deploy', neuron); navigate('/develop'); } }],
              });
              taskIdRef.current = null;
            }
            notify.success('Local build complete', {
              description: neuron,
              action: { label: 'Deploy', onClick: () => { openTab('deploy', neuron); navigate('/develop'); } },
            });
            systemNotify('Local build complete', neuron);
          } else if (taskIdRef.current) {
            updateNotification(taskIdRef.current, { severity: 'error', title: 'Local build failed', task: { status: 'error', step: 'result' } });
            taskIdRef.current = null;
          }
        }
      } catch {
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [localBuildId, step]);

  // Poll deploy operations (build+deploy mode)
  const deployPollKey = deployRuns.filter(r => r.operationName && !r.done).map(r => r.operationName).join(',');
  useEffect(() => {
    if (!deployPollKey || step !== 'running' || buildPhase !== 'deploy') return;
    const interval = setInterval(async () => {
      let updatedRuns: EnvRunState[] | null = null;
      setDeployRuns(prev => { updatedRuns = prev; return prev; });
      if (!updatedRuns) return;

      const running = (updatedRuns as EnvRunState[]).filter(r => r.operationName && !r.done);
      if (running.length === 0) return;

      const uniqueOpNames = [...new Set(running.map(r => r.operationName))];
      const polled = await Promise.allSettled(
        uniqueOpNames.map(name => DeployService.PollDeployOperation(name))
      );

      setDeployRuns(prev => {
        const next = [...prev];
        uniqueOpNames.forEach((opName, opIdx) => {
          const res = polled[opIdx];
          const envMatches = next.filter(r => r.operationName === opName && !r.done);
          envMatches.forEach(run => {
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
  }, [deployPollKey, step, buildPhase]);

  // Stream deploy logs (build+deploy mode)
  const deployLogsKey = deployRuns.filter(r => r.logsUrl).map(r => r.logsUrl + r.done).join(',');
  useEffect(() => {
    const withLogs = deployRuns.filter(r => r.logsUrl);
    if (withLogs.length === 0) return;

    const intervals: (ReturnType<typeof setInterval> | null)[] = withLogs.map(run => {
      const fetchLogs = async () => {
        try {
          const chunk = await DeployService.FetchDeployLogs(run.logsUrl, deployLogOffsets.current[run.env] ?? 0);
          if (chunk?.content) {
            deployTermsMap.current[run.env]?.write(chunk.content);
            deployLogOffsets.current[run.env] = chunk.nextOffset;
            deployLogBuffers.current[run.env] = [...(deployLogBuffers.current[run.env] ?? []), chunk.content];
          }
        } catch {}
      };
      if (run.done) { fetchLogs(); return null; }
      return setInterval(fetchLogs, 3000);
    });

    return () => intervals.forEach(i => { if (i !== null) clearInterval(i); });
  }, [deployLogsKey]);

  // Transition to result when all deploy runs finish
  useEffect(() => {
    if (step !== 'running' || buildPhase !== 'deploy' || deployRuns.length === 0) return;
    if (!deployRuns.every(r => r.done)) return;
    setStep('result');
    if (taskIdRef.current) {
      const doneId = taskIdRef.current;
      taskIdRef.current = null;
      const hasError = deployRuns.some(r => r.error);
      updateNotification(doneId, hasError
        ? { severity: 'error', title: 'Build & Deploy failed', task: { status: 'error', step: 'result' } }
        : { severity: 'success', title: 'Build & Deploy complete', body: neuron, task: { status: 'done', step: 'result' } });
    }
  }, [deployRuns, step, buildPhase]);

  return (
    <>
      {/* Step: commits */}
      {step === 'commits' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="shrink-0 flex items-center gap-[8px] px-[14px] py-[9px] border-b border-border">
            <Icon icon="solar:branch-linear" className="text-foreground/35 text-sm shrink-0" />
            <SearchableSelect
              value={branch}
              options={branches}
              onChange={handleBranchChange}
              className="flex-1 min-w-0"
            />
            <button
              onClick={() => loadCommits(branch)}
              disabled={commitsLoading}
              className="flex items-center justify-center size-[24px] rounded-[4px] text-foreground/35 hover:text-foreground hover:bg-card transition-colors disabled:opacity-40 shrink-0"
              title="Refresh commits"
            >
              <Icon icon="solar:refresh-linear" className="text-sm" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {commitsLoading ? (
              <div className="flex items-center gap-[10px] px-[16px] py-[20px]">
                <Loader size={20} />
                <span className="text-[11px] text-foreground/50">Loading commits...</span>
              </div>
            ) : commits.length === 0 ? (
              <div className="px-[16px] py-[20px]">
                <p className="text-[11px] text-foreground/40">No commits found for this branch.</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {commits.map((c) => (
                  <button
                    key={c.sha}
                    onClick={() => { setSelectedCommit(c); setStep('confirm'); }}
                    className="text-left px-[16px] py-[12px] border-b border-border hover:bg-card transition-colors"
                  >
                    <div className="flex items-center gap-[8px] mb-[3px]">
                      <span className="text-[10px] font-bold font-mono text-brand">{c.sha.substring(0, 7)}</span>
                      <span className="text-[10px] text-foreground leading-tight truncate">{c.message}</span>
                    </div>
                    <p className="text-[9px] text-foreground/35">{c.author} · {formatTimestamp(c.timestamp)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step: confirm */}
      {step === 'confirm' && selectedCommit && (
        <div className="flex-1 overflow-y-auto px-[16px] py-[20px]">
          <button onClick={() => setStep('commits')} className="flex items-center gap-[6px] text-[10px] text-foreground/40 hover:text-foreground mb-[20px] transition-colors">
            <Icon icon="solar:alt-arrow-left-linear" className="text-sm" />
            Back to commits
          </button>
          <div className="bg-card border border-border rounded-[8px] p-[14px] mb-[20px]">
            <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono mb-[8px]">
              {branch} · {selectedCommit.sha.substring(0, 7)}
            </p>
            <p className="text-[11px] text-foreground leading-[1.5] mb-[8px]">{selectedCommit.message}</p>
            <p className="text-[9px] text-foreground/40">{selectedCommit.author} · {formatTimestamp(selectedCommit.timestamp)}</p>
          </div>
          <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono mb-[8px]">Action</p>
          <div className="flex flex-col gap-[2px] mb-[20px]">
            {([
              { mode: 'cloud' as BuildMode, icon: 'solar:cloud-bolt-linear', label: 'Cloud Build' },
              { mode: 'local' as BuildMode, icon: 'solar:laptop-linear', label: 'Build Locally' },
              { mode: 'deploy' as BuildMode, icon: 'solar:rocket-2-linear', label: 'Build and Deploy' },
            ]).map(({ mode, icon, label }) => (
              <button
                key={mode}
                onClick={() => setBuildMode(mode)}
                className={`flex items-center gap-[10px] px-[12px] py-[10px] rounded-[6px] border transition-colors text-left ${
                  buildMode === mode
                    ? 'bg-[rgba(248,129,169,0.08)] border-[rgba(248,129,169,0.35)] text-foreground'
                    : 'bg-background border-border text-foreground/50 hover:border-border hover:text-foreground/70'
                }`}
              >
                <span className={`size-[6px] rounded-full shrink-0 ${buildMode === mode ? 'bg-brand' : 'bg-accent'}`} />
                <Icon icon={icon} className="text-sm shrink-0" />
                <span className="text-[11px] font-medium flex-1">{label}</span>
              </button>
            ))}
          </div>

          {/* Environment picker — shown only for Build and Deploy mode */}
          {buildMode === 'deploy' && (
            <div className="mb-[20px]">
              <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono mb-[8px]">Target Environments</p>
              {envsLoading ? (
                <div className="flex items-center gap-[8px] text-[10px] text-foreground/40">
                  <Loader size={14} />
                  Loading...
                </div>
              ) : deployEnvs.length === 0 ? (
                <p className="text-[10px] text-foreground/30">No environments found.</p>
              ) : (
                <div className="flex flex-col gap-[2px]">
                  {deployEnvs.map(env => {
                    const selected = selectedDeployEnvs.includes(env.name);
                    return (
                      <button
                        key={env.name}
                        onClick={() => setSelectedDeployEnvs(prev => selected ? prev.filter(e => e !== env.name) : [...prev, env.name])}
                        className={`flex items-center gap-[10px] px-[12px] py-[9px] rounded-[6px] border transition-colors text-left ${
                          selected
                            ? 'bg-[rgba(248,129,169,0.08)] border-[rgba(248,129,169,0.35)] text-foreground'
                            : 'bg-background border-border text-foreground/50 hover:text-foreground/70'
                        }`}
                      >
                        <span className={`size-[12px] rounded-[3px] border flex items-center justify-center shrink-0 transition-colors ${selected ? 'bg-brand border-brand' : 'border-border'}`}>
                          {selected && <Icon icon="solar:check-linear" className="text-brand-foreground text-[8px]" />}
                        </span>
                        <span className="text-[11px] font-medium flex-1">{env.displayName || env.name}</span>
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
            disabled={buildMode === 'deploy' && selectedDeployEnvs.length === 0}
            onClick={handleRunBuild}
          >
            {buildMode === 'cloud' ? 'Run Cloud Build' : buildMode === 'local' ? 'Build Locally' : 'Build and Deploy'}
          </Button>
        </div>
      )}

      {/* Steps: running + result — build phase (single terminal) */}
      {(step === 'running' || step === 'result') && buildPhase === 'build' && (
        <div className="flex-1 flex flex-col min-h-0">
          {step === 'running' && (
            <div className="shrink-0 flex items-center gap-[10px] px-[14px] py-[10px] border-b border-border">
              <Loader size={20} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-foreground leading-tight">Running Build</p>
                <p className="text-[9px] text-foreground/40 truncate leading-tight mt-[1px]">{progressMsg}</p>
              </div>
              {buildResult?.version && (
                <span className="text-[9px] font-bold font-mono text-foreground/35 shrink-0">{buildResult.version}</span>
              )}
            </div>
          )}
          {step === 'result' && (
            <div className={`shrink-0 px-[14px] py-[10px] border-b border-border ${
              buildResult?.error ? 'bg-[rgba(255,92,95,0.05)]' : 'bg-[rgba(52,199,89,0.05)]'
            }`}>
              {buildResult?.error ? (
                <div className="flex items-start gap-[8px]">
                  <Icon icon="solar:close-circle-linear" className="text-destructive text-sm shrink-0 mt-[1px]" />
                  <p className="text-[10px] text-foreground/70 leading-relaxed">{buildResult.error}</p>
                </div>
              ) : (
                <div className="flex items-center gap-[8px]">
                  <Icon icon="solar:check-circle-linear" className="text-success text-sm shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-foreground leading-tight">Build Complete</p>
                    {(buildResult?.neuronVersion || buildResult?.version) && (
                      <p className="text-[9px] text-foreground/40 font-mono truncate leading-tight mt-[1px]">
                        {buildResult.neuronVersion || buildResult.version}
                      </p>
                    )}
                  </div>
                  {buildResult?.logsUrl && (
                    <button onClick={() => Browser.OpenURL(buildResult!.logsUrl)} className="ml-auto shrink-0 text-foreground/30 hover:text-brand transition-colors" title="Open in browser">
                      <Icon icon="solar:arrow-right-up-linear" className="text-sm" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <BuildTerminal ref={termRef} className="flex-1 min-h-0" />
          {step === 'result' && (
            <div className="shrink-0 px-[14px] py-[10px] border-t border-border">
              <button onClick={() => loadCommits('master')} className="text-[10px] text-foreground/35 hover:text-foreground transition-colors flex items-center gap-[6px]">
                <Icon icon="solar:refresh-linear" className="text-sm" />
                Run Build again
              </button>
            </div>
          )}
        </div>
      )}

      {/* Steps: running + result — deploy phase (per-env terminals) */}
      {(step === 'running' || step === 'result') && buildPhase === 'deploy' && (
        <div className="flex-1 flex flex-col min-h-0">
          {deployRuns.length > 1 && (
            <div className="shrink-0 flex border-b border-border overflow-x-auto">
              {deployRuns.map(run => (
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

          {deployRuns.map(run => (
            <div
              key={run.env}
              className="flex-1 flex flex-col min-h-0"
              style={{ display: (activeRunEnv === run.env || deployRuns.length === 1) ? 'flex' : 'none' }}
            >
              {step === 'running' && !run.done && (
                <div className="shrink-0 flex items-center gap-[10px] px-[14px] py-[10px] border-b border-border">
                  <Loader size={20} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-foreground leading-tight">Deploying</p>
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
                        <p className="text-[11px] font-bold text-foreground leading-tight">Deploy Complete</p>
                        {run.version && (
                          <p className="text-[9px] text-foreground/40 font-mono truncate leading-tight mt-[1px]">{run.version}</p>
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
                ref={r => { deployTermsMap.current[run.env] = r; }}
                className="flex-1 min-h-0"
              />
            </div>
          ))}

          {step === 'result' && (
            <div className="shrink-0 px-[14px] py-[10px] border-t border-border">
              <button onClick={() => loadCommits('master')} className="text-[10px] text-foreground/35 hover:text-foreground transition-colors flex items-center gap-[6px]">
                <Icon icon="solar:refresh-linear" className="text-sm" />
                Run again
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
