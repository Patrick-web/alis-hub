import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { Button } from '../Button';
import { Loader } from '../Loader';
import { Browser } from '@wailsio/runtime';
import { useWorkspace } from '../../stores/workspace';
import { useNotifications } from '../../stores/notifications';
import { useDevelopTabs } from '../../stores/developTabs';
import type { AppNotification } from '../../stores/notifications';
import type { DefineCommit, DefineResult, DefineStep, GlassArtifact, GlassResult } from './types';
import { parseNeuron, formatTimestamp } from './types';
import * as DefineService from '../../../../bindings/alis-hub-v3/defineservice';

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

  const [step, setStep] = useState<DefineStep>('commits');
  const [commits, setCommits] = useState<DefineCommit[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<DefineCommit | null>(null);
  const [defineResult, setDefineResult] = useState<DefineResult | null>(null);
  const [progressMsg, setProgressMsg] = useState('Starting...');
  const [glassResult, setGlassResult] = useState<GlassResult | null>(null);
  const [glassLoading, setGlassLoading] = useState(false);
  const taskIdRef = useRef<string | null>(null);

  // Stable refs for org/product so effects don't re-run on every render
  const orgRef = useRef(state.organisation);
  const productRef = useRef(state.product);
  orgRef.current = state.organisation;
  productRef.current = state.product;

  useEffect(() => {
    if (restore?.task) {
      const { step: savedStep, meta } = restore.task;
      setStep(savedStep as DefineStep);
      taskIdRef.current = restore.id;
      if (savedStep === 'running' && meta.operationName) {
        setDefineResult({ operationName: meta.operationName as string, definition: '', version: '', notes: '', definitionArtifacts: [], done: false });
      }
    } else {
      loadCommits();
    }
  }, []);

  async function loadCommits() {
    setStep('commits');
    setCommits([]);
    setSelectedCommit(null);
    setDefineResult(null);
    setGlassResult(null);
    setProgressMsg('Loading commits...');
    setCommitsLoading(true);
    const parsed = parseNeuron(neuron);
    try {
      const result = await DefineService.GetDefineCommits(
        orgRef.current, productRef.current, parsed.id, parsed.version, 30
      );
      setCommits(result as DefineCommit[]);
    } catch {
      setCommits([]);
    } finally {
      setCommitsLoading(false);
    }
  }

  async function handleRunDefine() {
    if (!selectedCommit) return;
    const neuronResource = `organisations/${orgRef.current}/products/${productRef.current}/neurons/${neuron}`;
    setStep('running');
    setProgressMsg('Starting Define...');
    const taskId = addNotification({
      severity: 'info', source: 'define', title: 'Define started', body: neuron, persistent: true,
      task: { type: 'define', status: 'running', neuronId: neuron, step: 'running', startedAt: Date.now(), logBuffer: [], meta: {} },
    });
    taskIdRef.current = taskId;
    setTabNotificationId(tabId, taskId);
    try {
      const result = await DefineService.RunDefine(neuronResource, selectedCommit.sha, '');
      setDefineResult(result as DefineResult);
      updateNotification(taskId, { task: { meta: { operationName: (result as DefineResult).operationName } } });
    } catch (e: any) {
      setProgressMsg(`Failed: ${e?.message || e}`);
      updateNotification(taskId, { severity: 'error', title: 'Define failed', task: { status: 'error' } });
      taskIdRef.current = null;
    }
  }

  // Poll define operation
  useEffect(() => {
    if (!defineResult || defineResult.done || step !== 'running') return;
    const neuronResource = `organisations/${orgRef.current}/products/${productRef.current}/neurons/${neuron}`;
    const interval = setInterval(async () => {
      try {
        const result = await DefineService.PollDefineOperation(defineResult.operationName);
        setDefineResult(result as DefineResult);
        if (result?.done) {
          clearInterval(interval);
          if (!result.error) {
            setStep('glass');
            setGlassLoading(true);
            setProgressMsg('Define complete — loading Glass...');
            if (taskIdRef.current) {
              const doneId = taskIdRef.current;
              updateNotification(doneId, {
                severity: 'success', title: 'Define complete', task: { status: 'done', step: 'glass' },
                actions: [{ label: 'Open in Develop', variant: 'primary', onClick: () => { setFocusTaskId(doneId); navigate('/develop'); } }],
              });
              taskIdRef.current = null;
            }
            try {
              const glass = await DefineService.ExplainDefine(
                result.definition, result.definitionArtifacts ?? [], neuronResource
              );
              setGlassResult(glass as GlassResult);
            } catch {
              // glass not available
            } finally {
              setGlassLoading(false);
            }
          } else {
            setProgressMsg(`Define failed: ${result.error}`);
            if (taskIdRef.current) {
              updateNotification(taskIdRef.current, { severity: 'error', title: 'Define failed', task: { status: 'error', step: 'running' } });
              taskIdRef.current = null;
            }
          }
        } else if (result?.notes) {
          setProgressMsg(result.notes);
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [defineResult?.operationName, defineResult?.done, step]);

  return (
    <>
      {/* Step: commits */}
      {step === 'commits' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="shrink-0 flex items-center justify-end px-[14px] py-[7px] border-b border-border">
            <button
              onClick={loadCommits}
              disabled={commitsLoading}
              className="flex items-center justify-center size-[24px] rounded-[4px] text-foreground/35 hover:text-foreground hover:bg-card transition-colors disabled:opacity-40"
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
              <p className="text-[11px] text-foreground/40">No commits found in define repo.</p>
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
                    <span className="text-[10px] text-foreground leading-tight">{c.message}</span>
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
          <button
            onClick={() => setStep('commits')}
            className="flex items-center gap-[6px] text-[10px] text-foreground/40 hover:text-foreground mb-[20px] transition-colors"
          >
            <Icon icon="solar:alt-arrow-left-linear" className="text-sm" />
            Back to commits
          </button>
          <div className="bg-card border border-border rounded-[8px] p-[16px] mb-[20px]">
            <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono mb-[10px]">Selected Commit</p>
            <p className="text-[11px] text-foreground leading-[1.5] mb-[10px]">{selectedCommit.message}</p>
            <span className="text-[10px] font-bold font-mono text-brand">{selectedCommit.sha.substring(0, 12)}</span>
            <p className="text-[9px] text-foreground/40 mt-[4px]">{selectedCommit.author} · {formatTimestamp(selectedCommit.timestamp)}</p>
          </div>
          <Button variant="primary" className="w-full justify-center py-[10px]" onClick={handleRunDefine}>
            Run Define
          </Button>
        </div>
      )}

      {/* Step: running */}
      {step === 'running' && (
        <div className="flex-1 overflow-y-auto px-[16px] py-[24px]">
          <div className="flex flex-col items-center gap-[16px]">
            <div className="size-[48px] rounded-full bg-[rgba(248,129,169,0.1)] border border-[rgba(248,129,169,0.3)] flex items-center justify-center">
              <Loader size={20} />
            </div>
            <div className="text-center">
              <p className="text-[12px] font-bold text-foreground mb-[6px]">Running Define</p>
              <p className="text-[10px] text-foreground/50 leading-[1.5] max-w-[280px] text-center">{progressMsg}</p>
            </div>
            {defineResult?.version && (
              <div className="bg-card border border-border rounded-[6px] px-[12px] py-[6px]">
                <span className="text-[9px] font-bold font-mono text-foreground/50">v{defineResult.version}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step: glass */}
      {step === 'glass' && (
        <div className="flex-1 overflow-y-auto">
          {defineResult?.error && (
            <div className="px-[16px] py-[16px] border-b border-border">
              <div className="flex items-start gap-[8px] p-[10px] bg-[rgba(255,92,95,0.1)] border border-[rgba(255,92,95,0.3)] rounded-[6px]">
                <Icon icon="solar:close-circle-linear" className="text-destructive text-sm shrink-0 mt-[1px]" />
                <p className="text-[10px] text-foreground/70 leading-relaxed">{defineResult.error}</p>
              </div>
            </div>
          )}
          {!defineResult?.error && (
            <div className="px-[16px] py-[14px] border-b border-border bg-[rgba(52,199,89,0.05)]">
              <div className="flex items-center gap-[8px] mb-[4px]">
                <Icon icon="solar:check-circle-linear" className="text-success text-base" />
                <p className="text-[11px] font-bold text-foreground">Define Complete</p>
              </div>
              {defineResult?.version && (
                <p className="text-[9px] text-foreground/40 font-mono">{defineResult.definition} · v{defineResult.version}</p>
              )}
            </div>
          )}
          {glassLoading && (
            <div className="flex items-center gap-[10px] px-[16px] py-[16px]">
              <Loader size={20} />
              <span className="text-[10px] text-foreground/40">Loading Glass...</span>
            </div>
          )}
          {!glassLoading && glassResult && (
            <div className="px-[16px] py-[16px]">
              {glassResult.title && <p className="text-[13px] font-bold text-foreground mb-[6px]">{glassResult.title}</p>}
              {glassResult.summary && <p className="text-[11px] text-foreground/55 leading-[1.6] mb-[16px]">{glassResult.summary}</p>}
              {(glassResult.definition?.version || glassResult.definition?.releaseType) && (
                <div className="flex gap-[6px] mb-[16px]">
                  {glassResult.definition.version && (
                    <span className="text-[9px] uppercase font-bold font-mono px-[6px] py-[2px] rounded bg-card border border-border text-foreground/50">
                      {glassResult.definition.version}
                    </span>
                  )}
                  {glassResult.definition.releaseType && (
                    <span className="text-[9px] uppercase font-bold font-mono px-[6px] py-[2px] rounded bg-[rgba(248,129,169,0.1)] border border-[rgba(248,129,169,0.3)] text-brand">
                      {glassResult.definition.releaseType}
                    </span>
                  )}
                </div>
              )}
              {glassResult.artifacts && glassResult.artifacts.length > 0 && (
                <div>
                  <p className="text-[9px] uppercase font-bold text-foreground/30 mb-[10px] font-mono">
                    Artifacts ({glassResult.artifacts.length})
                  </p>
                  <div className="flex flex-col gap-[2px]">
                    {glassResult.artifacts.map((a: GlassArtifact, i: number) => (
                      <div key={i} className="flex items-center gap-[10px] px-[10px] py-[9px] rounded-[6px] bg-background border border-border group">
                        <span className="size-[6px] rounded-full shrink-0" style={{
                          backgroundColor: a.state === 3 ? '#34C759' : a.state === 4 ? '#FF5C5F' : a.state === 2 ? '#ff9500' : '#7a7a7a',
                        }} />
                        <span className="text-[10px] font-bold font-mono text-foreground flex-1 min-w-0 truncate">{a.type}</span>
                        {a.extra && <span className="text-[9px] text-foreground/35 max-w-[100px] truncate shrink-0">{a.extra}</span>}
                        {a.locationUri && (
                          <button onClick={() => Browser.OpenURL(a.locationUri)} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-foreground/40 hover:text-brand" title={a.locationUri}>
                            <Icon icon="solar:arrow-right-up-linear" className="text-sm" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(!glassResult.artifacts || glassResult.artifacts.length === 0) && !glassResult.title && (
                <p className="text-[10px] text-foreground/30">No Glass data available.</p>
              )}
            </div>
          )}
          {!glassLoading && !glassResult && !defineResult?.error && (
            <div className="px-[16px] py-[12px]">
              <p className="text-[10px] text-foreground/30">Glass data not available for this definition.</p>
            </div>
          )}
          <div className="px-[16px] py-[12px] border-t border-border mt-[8px]">
            <button onClick={loadCommits} className="text-[10px] text-foreground/35 hover:text-foreground transition-colors flex items-center gap-[6px]">
              <Icon icon="solar:refresh-linear" className="text-sm" />
              Run Define again
            </button>
          </div>
        </div>
      )}
    </>
  );
}
