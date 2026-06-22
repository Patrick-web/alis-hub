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
import type { DefineCommit, BuildResult, BuildStep, BuildMode } from './types';
import { parseNeuron, formatTimestamp } from './types';
import { notify } from '../../lib/notify';
import { systemNotify } from '../../lib/systemNotify';
import * as BuildService from '../../../../bindings/alis-hub-v3/buildservice';

interface BuildPaneProps {
  tabId: string;
  neuron: string;
  restore?: AppNotification;
}

export function BuildPane({ tabId, neuron, restore }: BuildPaneProps) {
  const { state } = useWorkspace();
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

  const termRef = useRef<BuildTerminalHandle>(null);
  const logOffsetRef = useRef<number>(0);
  const logBufferRef = useRef<string[]>([]);
  const taskIdRef = useRef<string | null>(null);

  const orgRef = useRef(state.organisation);
  const productRef = useRef(state.product);
  orgRef.current = state.organisation;
  productRef.current = state.product;

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
      loadCommits('master');
    }
  }, []);

  async function loadCommits(b: string) {
    setStep('commits');
    setCommits([]);
    setSelectedCommit(null);
    setBuildResult(null);
    setBuildMode('cloud');
    setBranch(b);
    setLocalBuildId(null);
    logOffsetRef.current = 0;
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

    if (buildMode === 'deploy') {
      setStep('running');
      setProgressMsg('Building and deploying...');
      setTimeout(() => {
        termRef.current?.write('\x1b[33m[deploy]\x1b[0m  Coming soon — not yet implemented.\r\n');
        setStep('result');
        setBuildResult({ operationName: '', version: '', neuronVersion: '', logsUrl: '', notes: '', done: true, stub: true });
      }, 200);
      return;
    }

    setStep('running');
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
      setProgressMsg(`Failed: ${e?.message || e}`);
      updateNotification(taskId, { severity: 'error', title: 'Build failed', task: { status: 'error' } });
      taskIdRef.current = null;
    }
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
          setStep('result');
          if (!result.error) {
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
          } else if (taskIdRef.current) {
            updateNotification(taskIdRef.current, { severity: 'error', title: 'Build failed', task: { status: 'error', step: 'result' } });
            taskIdRef.current = null;
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

  return (
    <>
      {/* Step: commits */}
      {step === 'commits' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="shrink-0 flex items-center gap-[8px] px-[14px] py-[9px] border-b border-border">
            <Icon icon="solar:branch-linear" className="text-foreground/35 text-sm shrink-0" />
            <div className="relative flex-1 min-w-0">
              <select
                value={branch}
                onChange={(e) => handleBranchChange(e.target.value)}
                className="w-full appearance-none bg-transparent text-[10px] text-foreground font-mono outline-none cursor-pointer pr-[16px]"
              >
                {branches.map((b) => (
                  <option key={b} value={b} className="bg-background text-foreground">{b}</option>
                ))}
              </select>
              <Icon icon="solar:alt-arrow-down-linear" className="absolute right-0 top-1/2 -translate-y-1/2 text-foreground/35 text-xs pointer-events-none" />
            </div>
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
          <Button variant="primary" className="w-full justify-center py-[10px]" onClick={handleRunBuild}>
            {buildMode === 'cloud' ? 'Run Cloud Build' : buildMode === 'local' ? 'Build Locally' : 'Build and Deploy'}
          </Button>
        </div>
      )}

      {/* Steps: running + result share the terminal */}
      {(step === 'running' || step === 'result') && (
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
              buildResult?.stub ? 'bg-[rgba(255,159,10,0.05)]' : buildResult?.error ? 'bg-[rgba(255,92,95,0.05)]' : 'bg-[rgba(52,199,89,0.05)]'
            }`}>
              {buildResult?.stub ? (
                <div className="flex items-center gap-[8px]">
                  <Icon icon="solar:clock-circle-linear" className="text-warning text-sm shrink-0" />
                  <p className="text-[10px] font-bold text-foreground/70 leading-tight">Build and Deploy — Coming Soon</p>
                </div>
              ) : buildResult?.error ? (
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
    </>
  );
}
