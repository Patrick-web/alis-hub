import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { Button } from '../Button';
import { Loader } from '../Loader';
import { useWorkspace } from '../../stores/workspace';
import { useNotifications } from '../../stores/notifications';
import { usePackageSessions } from '../../stores/packageSessions';
import type { TerminalSession } from '../PackageTerminalPane';
import type { PackageScript, PackagesStep } from './types';
import { parseNeuron } from './types';
import * as PackageService from '../../../../bindings/alis-hub-v3/packageservice';

interface PackagesPaneProps {
  tabId: string;
  neuron: string;
  neuronNames: string[];
}

export function PackagesPane({ neuronNames }: PackagesPaneProps) {
  const { state } = useWorkspace();
  const { addNotification } = useNotifications();
  const { sessions: packageSessions, addSessions, setTaskId } = usePackageSessions();

  const [step, setStep] = useState<PackagesStep>('scan');
  const [action, setAction] = useState<'upgrade_defined' | 'upgrade' | 'install' | 'add'>('upgrade_defined');
  const [scripts, setScripts] = useState<PackageScript[]>([]);
  const [selectedScripts, setSelectedScripts] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  // Scan on mount
  useEffect(() => { scan(); }, []);

  async function scan() {
    setStep('scan');
    setScripts([]);
    setSelectedScripts(new Set());
    setError('');
    try {
      const allScripts: PackageScript[] = [];
      for (const name of neuronNames) {
        const parsed = parseNeuron(name);
        const result = await PackageService.PreparePackageScripts(state.organisation, state.product, parsed.id, parsed.version);
        allScripts.push(...(result as PackageScript[]));
      }
      setScripts(allScripts);
      setSelectedScripts(new Set(allScripts.map(s => s.workDir)));
      setStep('select-action');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('select-action');
    }
  }

  const doRunScripts = useCallback(async (withVenv: boolean) => {
    const toRun = scripts.filter(s => selectedScripts.has(s.workDir));
    if (toRun.length === 0 && !withVenv) return;
    setStep('preparing');
    const newSessions: TerminalSession[] = [];

    if (withVenv) {
      const venvRunID = `pkg-venv-${Date.now()}`;
      try {
        await PackageService.StartVenvSetup(venvRunID, state.organisation, state.product);
        newSessions.push({ runID: venvRunID, title: '.venv setup', lang: 'python', done: false });
      } catch {}
    }

    for (const script of toRun) {
      const cmd = action === 'upgrade_defined' ? script.upgradeDefined
        : action === 'upgrade' ? script.upgrade
        : action === 'install' ? script.install
        : script.add;
      if (!cmd) continue;
      const runID = `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const title = script.name || script.workDir.split('/').slice(-2).join('/');
      try {
        await PackageService.StartPackageScript(runID, cmd, script.workDir);
        newSessions.push({ runID, title, lang: script.lang, done: false });
      } catch {}
    }

    if (newSessions.length > 0) {
      addSessions(newSessions);
      setStep('running');
      const neuronLabel = neuronNames.length === 1 ? neuronNames[0] : `${neuronNames.length} neurons`;
      const taskId = addNotification({
        severity: 'info', source: 'packages', title: 'Packages running', body: neuronLabel, persistent: true,
        task: { type: 'packages', status: 'running', neuronId: neuronLabel, step: 'running', startedAt: Date.now(), logBuffer: [], meta: { sessionIds: newSessions.map(s => s.runID) } },
      });
      setTaskId(taskId);
    } else {
      setError('Failed to start any package scripts');
      setStep('select-folders');
    }
  }, [scripts, selectedScripts, action, neuronNames, state.organisation, state.product, addSessions, addNotification, setTaskId]);

  async function handleRunPackages() {
    const toRun = scripts.filter(s => selectedScripts.has(s.workDir));
    if (toRun.length === 0) return;
    const hasPython = toRun.some(s => s.lang === 'python');
    if (hasPython) {
      const venvExists = await PackageService.CheckVenvExists(state.organisation, state.product);
      if (!venvExists) { setStep('venv-setup'); return; }
    }
    await doRunScripts(false);
  }

  return (
    <>
      {step === 'scan' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-[12px]">
            <Loader size={20} />
            <p className="text-[11px] text-foreground/40">Scanning packages...</p>
          </div>
        </div>
      )}

      {step === 'select-action' && (
        <div className="flex-1 overflow-y-auto px-[16px] py-[16px]">
          {error && (
            <div className="flex items-start gap-[8px] p-[10px] bg-[rgba(255,92,95,0.1)] border border-[rgba(255,92,95,0.3)] rounded-[6px] mb-[16px]">
              <Icon icon="solar:danger-triangle-linear" className="text-destructive text-sm shrink-0 mt-[1px]" />
              <p className="text-[10px] text-foreground/70 leading-relaxed">{error}</p>
            </div>
          )}
          <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono mb-[10px]">Action</p>
          <div className="flex flex-col gap-[2px] mb-[20px]">
            {([
              { value: 'upgrade_defined', label: 'Upgrade Defined', desc: 'Upgrade packages generated by Define' },
              { value: 'upgrade', label: 'Upgrade All', desc: 'Upgrade all specified packages' },
              { value: 'install', label: 'Install', desc: 'Install all relevant packages' },
              { value: 'add', label: 'Add', desc: 'Add packages from your Define steps' },
            ] as const).map(({ value, label, desc }) => (
              <button
                key={value}
                onClick={() => setAction(value)}
                className={`flex items-center gap-[10px] px-[12px] py-[10px] rounded-[6px] border transition-colors text-left ${
                  action === value
                    ? 'bg-[rgba(248,129,169,0.08)] border-[rgba(248,129,169,0.35)] text-foreground'
                    : 'bg-background border-border text-foreground/50 hover:border-border hover:text-foreground/70'
                }`}
              >
                <span className={`size-[6px] rounded-full shrink-0 ${action === value ? 'bg-brand' : 'bg-accent'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium">{label}</p>
                  <p className="text-[9px] text-foreground/35 leading-snug mt-[1px]">{desc}</p>
                </div>
              </button>
            ))}
          </div>
          <Button
            variant="primary"
            className="w-full justify-center py-[10px]"
            disabled={scripts.length === 0}
            onClick={() => scripts.length === 1 ? handleRunPackages() : setStep('select-folders')}
          >
            {scripts.length === 1 ? 'Run' : 'Next →'}
          </Button>
          {scripts.length === 0 && !error && (
            <p className="text-[10px] text-foreground/30 text-center mt-[12px]">No package scripts available</p>
          )}
        </div>
      )}

      {step === 'select-folders' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto">
            <div className="px-[16px] pt-[14px] pb-[8px]">
              <button onClick={() => setStep('select-action')} className="flex items-center gap-[6px] text-[10px] text-foreground/40 hover:text-foreground mb-[12px] transition-colors">
                <Icon icon="solar:alt-arrow-left-linear" className="text-sm" />
                Back
              </button>
              <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono">Select Folders</p>
            </div>
            <div className="flex flex-col">
              {scripts.map((s) => {
                const checked = selectedScripts.has(s.workDir);
                return (
                  <button
                    key={s.workDir}
                    onClick={() => setSelectedScripts(prev => {
                      const next = new Set(prev);
                      if (next.has(s.workDir)) next.delete(s.workDir); else next.add(s.workDir);
                      return next;
                    })}
                    className={`text-left px-[16px] py-[10px] border-b border-border flex items-center gap-[10px] transition-colors ${checked ? 'bg-[rgba(248,129,169,0.04)]' : 'hover:bg-foreground/[2%]'}`}
                  >
                    <span className={`size-[14px] rounded-[3px] border flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-brand border-brand' : 'border-border'}`}>
                      {checked && <Icon icon="solar:check-linear" className="text-brand-foreground text-[9px]" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-foreground truncate">{s.name || s.workDir.split('/').slice(-2).join('/')}</p>
                      <p className="text-[9px] text-foreground/35 font-mono uppercase leading-snug mt-[1px]">{s.lang}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="shrink-0 px-[14px] py-[10px] border-t border-border">
            <Button variant="primary" className="w-full justify-center py-[10px]" disabled={selectedScripts.size === 0} onClick={handleRunPackages}>
              Run · {selectedScripts.size} folder{selectedScripts.size !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      )}

      {step === 'venv-setup' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-[16px] py-[16px]">
          <div className="flex items-start gap-[10px] p-[12px] bg-[rgba(248,129,169,0.08)] border border-[rgba(248,129,169,0.25)] rounded-[6px] mb-[20px]">
            <Icon icon="solar:info-circle-linear" className="text-brand text-base shrink-0 mt-[1px]" />
            <div>
              <p className="text-[11px] font-medium text-foreground leading-snug">Python virtual environment not found</p>
              <p className="text-[10px] text-foreground/50 leading-relaxed mt-[4px]">
                A <code className="font-mono text-brand">.venv</code> is required before running Python package scripts.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-[8px]">
            <Button variant="primary" className="w-full justify-center py-[10px]" onClick={() => doRunScripts(true)}>
              Create .venv &amp; Run
            </Button>
            <button onClick={() => doRunScripts(false)} className="w-full py-[9px] text-[10px] text-foreground/40 hover:text-foreground transition-colors font-mono uppercase">
              Skip &amp; Run Anyway
            </button>
            <button onClick={() => setStep('select-folders')} className="w-full py-[9px] text-[10px] text-foreground/30 hover:text-foreground transition-colors font-mono">
              ← Back
            </button>
          </div>
        </div>
      )}

      {step === 'preparing' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-[12px]">
            <Loader size={20} />
            <p className="text-[11px] text-foreground/40">Starting scripts...</p>
          </div>
        </div>
      )}

      {step === 'running' && (
        <div className="flex-1 overflow-y-auto px-[16px] py-[16px]">
          <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono mb-[12px]">
            Running · {packageSessions.filter(s => !s.done).length} active
          </p>
          <div className="flex flex-col gap-[6px] mb-[16px]">
            {packageSessions.map(s => (
              <div key={s.runID} className="flex items-center gap-[8px] px-[10px] py-[8px] bg-background border border-border rounded-[6px]">
                {s.error ? (
                  <Icon icon="solar:close-circle-bold" className="text-red-400 text-sm shrink-0" />
                ) : s.done ? (
                  <Icon icon="solar:check-circle-bold" className="text-green-400 text-sm shrink-0" />
                ) : (
                  <span className="w-[8px] h-[8px] rounded-full bg-brand animate-pulse shrink-0" />
                )}
                <span className="text-[10px] text-foreground font-mono flex-1 truncate min-w-0">{s.title}</span>
                <span className="text-[9px] text-foreground/30 shrink-0 uppercase">{s.lang}</span>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-foreground/30 text-center">Output in the terminal pane ↓</p>
        </div>
      )}
    </>
  );
}
