import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from '@iconify/react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Dialog, DialogContent } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { MultiSelect } from '../components/ui/multi-select';
import { useWorkspace } from '../stores/workspace';
import * as WorkflowService from '../../../bindings/alis-hub-v3/workflowservice';
import * as BuildService from '../../../bindings/alis-hub-v3/buildservice';

// ─── Types ────────────────────────────────────────────────────────────────────

type Workflow = {
  id: string;
  name: string;
  description: string;
  isTemplate: boolean;
  createdAt: number;
  updatedAt: number;
  steps: WorkflowStep[];
};

type WorkflowStep = {
  id: string;
  workflowId: string;
  position: number;
  type: string;
  params: string;
  onFailure: string;
};

type StepType = {
  id: string;
  label: string;
  icon: string;
  color: string;
  defaultParams: object;
  fields: StepField[];
  summary: (params: Record<string, any>) => string;
  computeDefaults?: (priorSteps: WorkflowStep[]) => Partial<Record<string, any>>;
};

type StepField = {
  key: string;
  label: string;
  type: 'text' | 'mono' | 'select' | 'tags' | 'neuron' | 'neuron-full' | 'neuron-multi' | 'commit' | 'env-multi';
  placeholder?: string;
  options?: string[];
};

type StepRunStatus = {
  id: string;
  stepId: string;
  position: number;
  type: string;
  label: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  startedAt?: number;
  completedAt?: number;
};

type RunLogChunk = {
  stepRuns: StepRunStatus[];
  logText: string;
  nextOffset: number;
  done: boolean;
};

// ─── Step type helpers ────────────────────────────────────────────────────────

function lastParamFrom(steps: WorkflowStep[], types: string[], key: string): string {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (types.includes(steps[i].type)) {
      try {
        const p = JSON.parse(steps[i].params || '{}');
        if (p[key]) return p[key];
      } catch { /**/ }
    }
  }
  return '';
}

function lastNeuronsFrom(steps: WorkflowStep[], types: string[]): string[] {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (types.includes(steps[i].type)) {
      try {
        const p = JSON.parse(steps[i].params || '{}');
        if (p.neuron) return [p.neuron];
        if (Array.isArray(p.neurons) && p.neurons.length > 0) return p.neurons;
      } catch { /**/ }
    }
  }
  return [];
}

// ─── Step type definitions ────────────────────────────────────────────────────

const STEP_TYPES: StepType[] = [
  {
    id: 'define',
    label: 'Define Neuron',
    icon: 'solar:code-square-linear',
    color: 'text-blue-400',
    defaultParams: { neuron: '', workdir: '' },
    fields: [
      { key: 'neuron', label: 'Neuron path', type: 'neuron', placeholder: 'neurons/bff-v1' },
      { key: 'workdir', label: 'Working directory', type: 'text', placeholder: '~/alis.build/org/define/product' },
    ],
    summary: (p) => p.neuron || 'No neuron set',
  },
  {
    id: 'build-cloud',
    label: 'Cloud Build',
    icon: 'solar:cloud-upload-linear',
    color: 'text-brand',
    defaultParams: { neuron: '', commit: '' },
    fields: [
      { key: 'neuron', label: 'Neuron', type: 'neuron-full', placeholder: 'organisations/org/products/product/neurons/bff-v1' },
      { key: 'commit', label: 'Commit SHA (leave blank for latest)', type: 'commit', placeholder: '' },
    ],
    summary: (p) => p.neuron ? p.neuron.split('/').slice(-1)[0] : 'No neuron set',
  },
  {
    id: 'deploy',
    label: 'Deploy',
    icon: 'solar:rocket-linear',
    color: 'text-purple-400',
    defaultParams: { neuron: '', environments: [] },
    fields: [
      { key: 'neuron', label: 'Neuron', type: 'neuron-full', placeholder: 'organisations/org/products/product/neurons/bff-v1' },
      { key: 'environments', label: 'Environments', type: 'env-multi' },
    ],
    summary: (p) => p.neuron ? p.neuron.split('/').slice(-1)[0] : 'No neuron set',
    computeDefaults: (priorSteps) => ({ neuron: lastParamFrom(priorSteps, ['build-cloud'], 'neuron') }),
  },
  {
    id: 'upgrade-packages',
    label: 'Upgrade Packages',
    icon: 'solar:refresh-circle-linear',
    color: 'text-cyan-400',
    defaultParams: { neurons: [], repoPath: '' },
    fields: [
      { key: 'neurons', label: 'Neurons', type: 'neuron-multi' },
      { key: 'repoPath', label: 'Build repo path', type: 'text', placeholder: '~/alis.build/org/build/product' },
    ],
    summary: (p) => Array.isArray(p.neurons) && p.neurons.length > 0 ? `${p.neurons.length} neuron(s)` : 'No neurons set',
    computeDefaults: (priorSteps) => ({ neurons: lastNeuronsFrom(priorSteps, ['build-cloud', 'define']) }),
  },
  {
    id: 'git-stage-all',
    label: 'Git: Stage All',
    icon: 'solar:file-add-linear',
    color: 'text-green-400',
    defaultParams: { repoPath: '' },
    fields: [
      { key: 'repoPath', label: 'Repository path', type: 'text', placeholder: '~/alis.build/org/build/product' },
    ],
    summary: (p) => p.repoPath || 'No repo set',
    computeDefaults: (priorSteps) => ({ repoPath: lastParamFrom(priorSteps, ['upgrade-packages'], 'repoPath') }),
  },
  {
    id: 'git-commit',
    label: 'Git: Commit',
    icon: 'solar:check-circle-linear',
    color: 'text-green-400',
    defaultParams: { repoPath: '', message: '' },
    fields: [
      { key: 'repoPath', label: 'Repository path', type: 'text', placeholder: '~/alis.build/org/build/product' },
      { key: 'message', label: 'Commit message', type: 'text', placeholder: 'chore: update' },
    ],
    summary: (p) => p.message || 'No message set',
    computeDefaults: (priorSteps) => {
      const repoPath = lastParamFrom(priorSteps, ['upgrade-packages'], 'repoPath');
      const hasUpgrade = priorSteps.some((s) => s.type === 'upgrade-packages');
      return { repoPath, ...(hasUpgrade ? { message: 'chore: upgrade packages' } : {}) };
    },
  },
  {
    id: 'git-push',
    label: 'Git: Push',
    icon: 'solar:upload-linear',
    color: 'text-green-400',
    defaultParams: { repoPath: '' },
    fields: [
      { key: 'repoPath', label: 'Repository path', type: 'text', placeholder: '~/alis.build/org/build/product' },
    ],
    summary: (p) => p.repoPath || 'No repo set',
    computeDefaults: (priorSteps) => ({ repoPath: lastParamFrom(priorSteps, ['upgrade-packages', 'git-stage-all', 'git-commit'], 'repoPath') }),
  },
  {
    id: 'git-pull',
    label: 'Git: Pull',
    icon: 'solar:download-linear',
    color: 'text-green-400',
    defaultParams: { repoPath: '' },
    fields: [
      { key: 'repoPath', label: 'Repository path', type: 'text', placeholder: '~/alis.build/org/build/product' },
    ],
    summary: (p) => p.repoPath || 'No repo set',
    computeDefaults: (priorSteps) => ({ repoPath: lastParamFrom(priorSteps, ['upgrade-packages', 'git-stage-all', 'git-commit'], 'repoPath') }),
  },
  {
    id: 'shell',
    label: 'Shell Command',
    icon: 'solar:terminal-linear',
    color: 'text-yellow-400',
    defaultParams: { command: '', workdir: '' },
    fields: [
      { key: 'command', label: 'Command', type: 'mono', placeholder: 'alis define neurons/bff-v1' },
      { key: 'workdir', label: 'Working directory (optional)', type: 'text', placeholder: '' },
    ],
    summary: (p) => p.command || 'No command set',
  },
  {
    id: 'wait',
    label: 'Wait',
    icon: 'solar:hourglass-linear',
    color: 'text-orange-400',
    defaultParams: { seconds: '5' },
    fields: [
      { key: 'seconds', label: 'Seconds', type: 'text', placeholder: '5' },
    ],
    summary: (p) => `Wait ${p.seconds || '5'}s`,
  },
];

function getStepType(id: string): StepType {
  return STEP_TYPES.find((t) => t.id === id) ?? {
    id,
    label: id,
    icon: 'solar:question-circle-linear',
    color: 'text-foreground/40',
    defaultParams: {},
    fields: [],
    summary: () => id,
  };
}

function stepSummary(step: WorkflowStep): string {
  try {
    const p = JSON.parse(step.params);
    return getStepType(step.type).summary(p);
  } catch {
    return '';
  }
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function formatDuration(startedAt?: number, completedAt?: number): string {
  if (!startedAt) return '';
  const end = completedAt ?? Math.floor(Date.now() / 1000);
  const s = end - startedAt;
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

const STATUS_ICON: Record<string, string> = {
  pending: 'solar:circle-linear',
  running: 'solar:spinner-linear',
  success: 'solar:check-circle-bold',
  failed: 'solar:close-circle-bold',
  skipped: 'solar:minus-circle-linear',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-foreground/20',
  running: 'text-blue-400',
  success: 'text-green-400',
  failed: 'text-red-400',
  skipped: 'text-foreground/20',
};

// ─── WorkflowsPage ────────────────────────────────────────────────────────────

export function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedWorkflow, setEditedWorkflow] = useState<Workflow | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [showPicker, setShowPicker] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [dragSrc, setDragSrc] = useState<number | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // ── Run tab state ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'steps' | 'run'>('steps');
  const [runId, setRunId] = useState<string | null>(null);
  const [stepRuns, setStepRuns] = useState<StepRunStatus[]>([]);
  const [logSegments, setLogSegments] = useState<Record<string, string>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [runDone, setRunDone] = useState(false);
  const [runFinalStatus, setRunFinalStatus] = useState<string>('running');
  const [runError, setRunError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  const runOffsetRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentStepRunIdRef = useRef<string | null>(null);
  const logBodyRef = useRef<HTMLDivElement>(null);

  const active = workflows.find((w) => w.id === activeId) ?? null;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const list = await WorkflowService.ListWorkflows() as Workflow[];
      setWorkflows(list ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (activeId) {
      const wf = workflows.find((w) => w.id === activeId);
      setEditedWorkflow(wf ? JSON.parse(JSON.stringify(wf)) : null);
      setExpandedSteps({});
      setShowPicker(false);
    } else {
      setEditedWorkflow(null);
    }
  }, [activeId, workflows]);

  // Reset run state when switching to a different workflow
  const prevActiveIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeId !== prevActiveIdRef.current) {
      prevActiveIdRef.current = activeId;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      setActiveTab('steps');
      setRunId(null); setStepRuns([]); setLogSegments({});
      setCollapsedSections({}); setRunDone(false); setRunFinalStatus('running');
      setRunError(null); setStopping(false);
      runOffsetRef.current = 0; currentStepRunIdRef.current = null;
    }
  }, [activeId]);

  // Close picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Auto-scroll log feed when new text arrives (while running)
  useEffect(() => {
    if (!runDone && logBodyRef.current) {
      logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight;
    }
  }, [logSegments, runDone]);

  // ── Polling ─────────────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const pollRun = useCallback(async (id: string) => {
    try {
      const chunk = await WorkflowService.PollRunLogs(id, runOffsetRef.current) as RunLogChunk;
      if (!chunk) return;
      runOffsetRef.current = chunk.nextOffset;

      if (chunk.stepRuns) {
        setStepRuns(chunk.stepRuns);
        const running = chunk.stepRuns.find((s) => s.status === 'running');
        if (running && running.id !== currentStepRunIdRef.current) {
          const prev = currentStepRunIdRef.current;
          if (prev) setCollapsedSections((c) => ({ ...c, [prev]: true }));
          currentStepRunIdRef.current = running.id;
        }
      }

      if (chunk.logText) {
        const key = currentStepRunIdRef.current ?? chunk.stepRuns?.[0]?.id;
        if (key) {
          setLogSegments((prev) => ({ ...prev, [key]: (prev[key] ?? '') + chunk.logText }));
        }
      }

      if (chunk.done) {
        stopPolling();
        setRunDone(true);
        const failed = chunk.stepRuns?.some((s) => s.status === 'failed');
        setRunFinalStatus(failed ? 'failed' : 'success');
      }
    } catch (e) {
      console.error('PollRunLogs error:', e);
    }
  }, [stopPolling]);

  // ── Run actions ─────────────────────────────────────────────────────────────

  const handleRun = async () => {
    stopPolling();
    setRunId(null); setStepRuns([]); setLogSegments({});
    setCollapsedSections({}); setRunDone(false); setRunFinalStatus('running');
    setRunError(null); setStopping(false);
    runOffsetRef.current = 0; currentStepRunIdRef.current = null;
    setActiveTab('run');
    try {
      const id = await WorkflowService.RunWorkflow(editedWorkflow!.id) as string;
      setRunId(id);
      pollRef.current = setInterval(() => pollRun(id), 500);
    } catch (e: any) {
      setRunError(e?.message ?? String(e));
    }
  };

  const handleStop = async () => {
    if (!runId || stopping) return;
    setStopping(true);
    try { await WorkflowService.StopRun(runId); } catch { /* ignore */ }
    finally { setStopping(false); }
  };

  // ── Workflow actions ─────────────────────────────────────────────────────────

  const isDirty = editedWorkflow && active &&
    JSON.stringify(editedWorkflow) !== JSON.stringify(active);

  const handleSave = async () => {
    if (!editedWorkflow || editedWorkflow.isTemplate) return;
    setSaving(true);
    try {
      await WorkflowService.UpdateWorkflow(editedWorkflow.id, {
        name: editedWorkflow.name,
        description: editedWorkflow.description,
        steps: editedWorkflow.steps.map((s, i) => ({
          id: s.id,
          type: s.type,
          params: s.params,
          onFailure: s.onFailure,
          position: i,
        })),
      });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleClone = async (id: string) => {
    const cloned = await WorkflowService.CloneWorkflow(id) as Workflow;
    await load();
    if (cloned) setActiveId(cloned.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this workflow?')) return;
    await WorkflowService.DeleteWorkflow(id);
    await load();
    if (activeId === id) setActiveId(null);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const created = await WorkflowService.CreateWorkflow({
      name: newName.trim(),
      description: newDesc.trim(),
      steps: [],
    }) as Workflow;
    setNewName('');
    setNewDesc('');
    setShowNewModal(false);
    await load();
    if (created) setActiveId(created.id);
  };

  // ── Step editing ─────────────────────────────────────────────────────────────

  const updateStep = (stepId: string, patch: Partial<WorkflowStep>) => {
    setEditedWorkflow((wf) => {
      if (!wf) return wf;
      return { ...wf, steps: wf.steps.map((s) => s.id === stepId ? { ...s, ...patch } : s) };
    });
  };

  const updateStepParam = (stepId: string, key: string, value: string | string[]) => {
    setEditedWorkflow((wf) => {
      if (!wf) return wf;
      return {
        ...wf,
        steps: wf.steps.map((s) => {
          if (s.id !== stepId) return s;
          const p = JSON.parse(s.params || '{}');
          p[key] = value;
          return { ...s, params: JSON.stringify(p) };
        }),
      };
    });
  };

  const addStep = (typeId: string) => {
    const type = getStepType(typeId);
    const smartParams = { ...type.defaultParams, ...(type.computeDefaults?.(editedWorkflow!.steps) ?? {}) };
    const newStep: WorkflowStep = {
      id: uid(),
      workflowId: editedWorkflow!.id,
      position: editedWorkflow!.steps.length,
      type: typeId,
      params: JSON.stringify(smartParams),
      onFailure: 'stop',
    };
    const newId = newStep.id;
    setEditedWorkflow((wf) => wf ? { ...wf, steps: [...wf.steps, newStep] } : wf);
    setExpandedSteps((e) => ({ ...e, [newId]: true }));
    setShowPicker(false);
  };

  const removeStep = (stepId: string) => {
    setEditedWorkflow((wf) => wf ? { ...wf, steps: wf.steps.filter((s) => s.id !== stepId) } : wf);
  };

  const duplicateStep = (stepId: string) => {
    setEditedWorkflow((wf) => {
      if (!wf) return wf;
      const idx = wf.steps.findIndex((s) => s.id === stepId);
      if (idx < 0) return wf;
      const copy = { ...wf.steps[idx], id: uid() };
      const steps = [...wf.steps];
      steps.splice(idx + 1, 0, copy);
      return { ...wf, steps };
    });
  };

  const onDragStart = (i: number) => setDragSrc(i);
  const onDrop = (i: number) => {
    if (dragSrc === null || dragSrc === i) return;
    setEditedWorkflow((wf) => {
      if (!wf) return wf;
      const steps = [...wf.steps];
      const [moved] = steps.splice(dragSrc, 1);
      steps.splice(i, 0, moved);
      return { ...wf, steps };
    });
    setDragSrc(null);
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const templates = workflows.filter((w) => w.isTemplate);
  const userWorkflows = workflows.filter((w) => !w.isTemplate);
  const isRunning = runId !== null && !runDone;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left panel */}
      <div className="w-[240px] flex-shrink-0 border-r border-border flex flex-col bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest font-mono">Workflows</span>
          <button
            onClick={() => setShowNewModal(true)}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent transition-colors text-foreground/40 hover:text-foreground"
            title="New workflow"
          >
            <Icon icon="solar:add-circle-linear" className="text-base" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="px-4 py-6 text-center text-foreground/30 text-xs">Loading…</div>
          ) : (
            <>
              {templates.length > 0 && (
                <>
                  <div className="px-4 py-1.5">
                    <span className="text-[9px] font-bold text-foreground/30 uppercase tracking-widest">Templates</span>
                  </div>
                  {templates.map((wf) => (
                    <WorkflowListItem
                      key={wf.id}
                      workflow={wf}
                      active={activeId === wf.id}
                      onClick={() => setActiveId(wf.id)}
                    />
                  ))}
                  {userWorkflows.length > 0 && (
                    <div className="px-4 py-1.5 mt-1">
                      <span className="text-[9px] font-bold text-foreground/30 uppercase tracking-widest">My Workflows</span>
                    </div>
                  )}
                </>
              )}
              {userWorkflows.map((wf) => (
                <WorkflowListItem
                  key={wf.id}
                  workflow={wf}
                  active={activeId === wf.id}
                  onClick={() => setActiveId(wf.id)}
                />
              ))}
              {workflows.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs text-foreground/30">No workflows yet</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!editedWorkflow ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-foreground/30">
            <Icon icon="solar:playlist-2-linear" className="text-4xl opacity-30" />
            <p className="text-sm">Select a workflow or create a new one</p>
            <Button variant="secondary" onClick={() => setShowNewModal(true)}>
              <Icon icon="solar:add-circle-linear" className="text-base" />
              New Workflow
            </Button>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {editedWorkflow.isTemplate && (
                    <Icon icon="solar:lock-linear" className="text-foreground/30 text-sm flex-shrink-0" />
                  )}
                  <span className="font-semibold text-sm truncate">{editedWorkflow.name}</span>
                </div>
                {editedWorkflow.description && (
                  <p className="text-xs text-foreground/40 mt-0.5 truncate">{editedWorkflow.description}</p>
                )}
              </div>

              {editedWorkflow.isTemplate ? (
                <Button variant="secondary" onClick={() => handleClone(editedWorkflow.id)}>
                  <Icon icon="solar:copy-linear" className="text-base" />
                  Clone to Edit
                </Button>
              ) : (
                <>
                  {isDirty && (
                    <Button variant="secondary" onClick={handleSave} disabled={saving}>
                      {saving ? 'Saving…' : 'Save'}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => handleDelete(editedWorkflow.id)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                  >
                    <Icon icon="solar:trash-bin-trash-linear" className="text-base" />
                  </Button>
                </>
              )}

              <Button
                variant="primary"
                onClick={handleRun}
                disabled={editedWorkflow.steps.length === 0 || isRunning}
              >
                <Icon icon={isRunning ? 'solar:spinner-linear' : 'solar:play-linear'} className={`text-base ${isRunning ? 'animate-spin' : ''}`} />
                {isRunning ? 'Running…' : 'Run'}
              </Button>
            </div>

            {/* Tab strip */}
            <div className="flex items-center border-b border-border bg-card px-5">
              <button
                onClick={() => setActiveTab('steps')}
                className={`h-9 px-1 mr-4 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === 'steps'
                    ? 'border-brand text-brand'
                    : 'border-transparent text-foreground/40 hover:text-foreground/70'
                }`}
              >
                Steps
              </button>
              <button
                onClick={() => setActiveTab('run')}
                className={`h-9 px-1 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'run'
                    ? 'border-brand text-brand'
                    : 'border-transparent text-foreground/40 hover:text-foreground/70'
                }`}
              >
                Run
                {isRunning && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                )}
                {runDone && runFinalStatus === 'success' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                )}
                {runDone && runFinalStatus === 'failed' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                )}
              </button>
            </div>

            {/* Steps tab — kept mounted to preserve scroll position */}
            <div
              className="flex-1 flex flex-col overflow-hidden"
              style={{ display: activeTab === 'steps' ? undefined : 'none' }}
            >
              {editedWorkflow.isTemplate && (
                <div className="flex items-center gap-2 px-5 py-2.5 bg-blue-500/5 border-b border-blue-500/10 text-blue-400 text-xs">
                  <Icon icon="solar:info-circle-linear" className="text-sm flex-shrink-0" />
                  This is a read-only template. Clone it to create an editable copy.
                </div>
              )}
              <div className="flex-1 overflow-y-auto px-5 py-5">
                <div className="max-w-[600px] mx-auto">
                  {editedWorkflow.steps.length === 0 && (
                    <div className="text-center py-10 text-foreground/30">
                      <Icon icon="solar:playlist-2-linear" className="text-3xl mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No steps yet. Add a step to get started.</p>
                    </div>
                  )}

                  {editedWorkflow.steps.map((step, idx) => (
                    <StepCard
                      key={step.id}
                      step={step}
                      index={idx}
                      expanded={!!expandedSteps[step.id]}
                      isTemplate={editedWorkflow.isTemplate}
                      onToggle={() => setExpandedSteps((e) => ({ ...e, [step.id]: !e[step.id] }))}
                      onParamChange={(key, val) => updateStepParam(step.id, key, val)}
                      onFailureChange={(val) => updateStep(step.id, { onFailure: val })}
                      onDuplicate={() => duplicateStep(step.id)}
                      onRemove={() => removeStep(step.id)}
                      onDragStart={() => onDragStart(idx)}
                      onDrop={() => onDrop(idx)}
                    />
                  ))}

                  {!editedWorkflow.isTemplate && (
                    <div className="relative mt-2" ref={pickerRef}>
                      <button
                        onClick={() => setShowPicker((v) => !v)}
                        className="w-full py-2.5 border border-dashed border-border rounded-lg text-xs text-foreground/30 hover:border-brand hover:text-brand flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Icon icon="solar:add-circle-linear" className="text-sm" />
                        Add step
                      </button>
                      {showPicker && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                          <div className="px-3 py-2 border-b border-border">
                            <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider">Choose step type</span>
                          </div>
                          <div className="py-1 max-h-64 overflow-y-auto">
                            {STEP_TYPES.map((t) => (
                              <button
                                key={t.id}
                                onClick={() => addStep(t.id)}
                                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-accent transition-colors"
                              >
                                <Icon icon={t.icon} className={`text-base ${t.color} flex-shrink-0`} />
                                <span className="text-sm">{t.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Run tab — kept mounted to preserve log scroll position */}
            <div
              className="flex-1 flex flex-col overflow-hidden"
              style={{ display: activeTab === 'run' ? undefined : 'none' }}
            >
              <WorkflowRunView
                stepRuns={stepRuns}
                logSegments={logSegments}
                collapsedSections={collapsedSections}
                onToggleSection={(id) => setCollapsedSections((c) => ({ ...c, [id]: !c[id] }))}
                done={runDone}
                finalStatus={runFinalStatus}
                error={runError}
                runId={runId}
                onStop={handleStop}
                stopping={stopping}
                logBodyRef={logBodyRef}
              />
            </div>
          </>
        )}
      </div>

      {/* New workflow modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-card border border-border rounded-xl w-[380px] shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold">New Workflow</h2>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              <div>
                <label className="text-xs text-foreground/50 mb-1 block">Name</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Define & Build API"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-foreground/50 mb-1 block">Description (optional)</label>
                <Input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="What does this workflow do?"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setShowNewModal(false); setNewName(''); setNewDesc(''); }}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreate} disabled={!newName.trim()}>
                Create
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── NeuronPickerModal ────────────────────────────────────────────────────────

function NeuronPickerModal({ format, onSelect, onClose }: {
  format: 'short' | 'full';
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const { state } = useWorkspace();
  const [filter, setFilter] = useState('');

  const neurons = state.neurons;
  const org = state.organisation;
  const product = state.product;

  const lowerFilter = filter.toLowerCase();
  const filtered = neurons.filter((n) => n.id.toLowerCase().includes(lowerFilter));

  function handleSelect(neuronId: string) {
    const value = format === 'short'
      ? `neurons/${neuronId}`
      : `organisations/${org}/products/${product}/neurons/${neuronId}`;
    onSelect(value);
  }

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="text-foreground p-0 max-w-[360px] overflow-hidden">
        <div className="flex items-center gap-[10px] px-[16px] pt-[16px] pb-[12px] border-b border-border">
          <Icon icon="solar:cpu-bolt-linear" className="text-brand text-lg" />
          <span className="text-[13px] font-bold text-foreground font-mono">Select Neuron</span>
        </div>
        <div className="px-[16px] py-[10px] border-b border-border">
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
            placeholder="Filter neurons…"
            className="w-full bg-transparent text-[12px] font-mono text-foreground outline-none placeholder:text-foreground/30"
          />
        </div>
        <div className="overflow-y-auto max-h-[300px] py-[6px]">
          {neurons.length === 0 ? (
            <p className="px-[16px] py-[12px] text-[11px] text-foreground/40 font-mono">
              No neurons loaded — visit the Develop tab first.
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-[16px] py-[12px] text-[11px] text-foreground/40 font-mono">No neurons match</p>
          ) : (
            filtered.map((n) => (
              <button
                key={n.id}
                onClick={() => handleSelect(n.id)}
                className="w-full flex items-center px-[16px] py-[9px] transition-colors text-left text-foreground hover:bg-foreground/[4%]"
              >
                <span className="text-[12px] font-mono">{n.id}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── CommitPickerModal ────────────────────────────────────────────────────────

type CommitEntry = { sha: string; message: string; author: string; timestamp: number };

function parseNeuronId(neuron: string): { id: string; version: string } {
  const parts = neuron.split('/');
  const id = parts[parts.length - 1];
  const m = id.match(/[-.](v\d+)$/);
  return { id, version: m ? m[1] : 'v1' };
}

function CommitPickerModal({ neuron, onSelect, onClose }: {
  neuron: string;
  onSelect: (sha: string) => void;
  onClose: () => void;
}) {
  const { state } = useWorkspace();
  const [filter, setFilter] = useState('');
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const org = state.organisation;
    const product = state.product;
    const { id: neuronId, version } = parseNeuronId(neuron);

    if (!org || !product || !neuronId) {
      setError('Set the Neuron field first.');
      setLoading(false);
      return;
    }

    (BuildService.GetBuildCommits as (org: string, product: string, neuron: string, version: string, branch: string, count: number) => Promise<CommitEntry[]>)(
      org, product, neuronId, version, 'master', 30
    )
      .then((res) => setCommits(res ?? []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [neuron, state.organisation, state.product]);

  const lowerFilter = filter.toLowerCase();
  const filtered = commits.filter((c) =>
    c.sha.startsWith(filter) || c.message.toLowerCase().includes(lowerFilter)
  );

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="text-foreground p-0 max-w-[440px] overflow-hidden">
        <div className="flex items-center gap-[10px] px-[16px] pt-[16px] pb-[12px] border-b border-border">
          <Icon icon="solar:git-commit-linear" className="text-brand text-lg" />
          <span className="text-[13px] font-bold text-foreground font-mono">Select Commit</span>
        </div>
        <div className="px-[16px] py-[10px] border-b border-border">
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
            placeholder="Filter by SHA or message…"
            className="w-full bg-transparent text-[12px] font-mono text-foreground outline-none placeholder:text-foreground/30"
          />
        </div>
        <div className="overflow-y-auto max-h-[360px] py-[6px]">
          {loading ? (
            <p className="px-[16px] py-[12px] text-[11px] text-foreground/40 font-mono">Loading commits…</p>
          ) : error ? (
            <p className="px-[16px] py-[12px] text-[11px] text-red-400/70 font-mono">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="px-[16px] py-[12px] text-[11px] text-foreground/40 font-mono">No commits found</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.sha}
                onClick={() => onSelect(c.sha)}
                className="w-full flex items-start gap-3 px-[16px] py-[10px] transition-colors text-left hover:bg-foreground/[4%]"
              >
                <span className="text-[10px] font-mono text-foreground/40 flex-shrink-0 mt-0.5 w-[52px]">
                  {c.sha.slice(0, 7)}
                </span>
                <span className="text-[12px] text-foreground truncate leading-5">
                  {c.message.split('\n')[0]}
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── WorkflowListItem ─────────────────────────────────────────────────────────

function WorkflowListItem({ workflow, active, onClick }: {
  workflow: Workflow;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 mx-1 rounded-lg transition-colors text-sm ${
        active ? 'bg-brand/10 text-brand' : 'text-foreground hover:bg-accent'
      }`}
      style={{ width: 'calc(100% - 8px)' }}
    >
      <div className="flex items-center gap-1.5">
        {workflow.isTemplate && (
          <Icon icon="solar:lock-linear" className="text-[10px] text-foreground/30 flex-shrink-0" />
        )}
        <span className="font-medium truncate text-xs">{workflow.name}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-[10px] text-foreground/30">
          {workflow.steps.length} step{workflow.steps.length !== 1 ? 's' : ''}
        </span>
      </div>
    </button>
  );
}

// ─── StepCard ─────────────────────────────────────────────────────────────────

function StepCard({ step, index, expanded, isTemplate, onToggle, onParamChange, onFailureChange, onDuplicate, onRemove, onDragStart, onDrop }: {
  step: WorkflowStep;
  index: number;
  expanded: boolean;
  isTemplate: boolean;
  onToggle: () => void;
  onParamChange: (key: string, val: string | string[]) => void;
  onFailureChange: (val: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const [neuronPickerKey, setNeuronPickerKey] = useState<string | null>(null);
  const [commitPickerOpen, setCommitPickerOpen] = useState(false);
  const { state } = useWorkspace();

  const type = getStepType(step.type);
  const summary = stepSummary(step);
  let params: Record<string, any> = {};
  try { params = JSON.parse(step.params); } catch { /**/ }

  return (
    <div
      draggable={!isTemplate}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="mb-2 bg-card border border-border rounded-lg overflow-hidden hover:border-border/80 transition-colors"
    >
      <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none group" onClick={onToggle}>
        {!isTemplate && (
          <Icon
            icon="solar:list-linear"
            className="text-foreground/20 text-sm flex-shrink-0 cursor-grab group-hover:text-foreground/40 transition-colors"
          />
        )}
        <Icon icon={type.icon} className={`text-sm flex-shrink-0 ${type.color}`} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium">{type.label}</div>
          <div className="text-[10px] text-foreground/40 truncate font-mono mt-0.5">{summary}</div>
        </div>
        {!isTemplate && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-accent text-foreground/40 hover:text-foreground transition-colors"
              title="Duplicate"
            >
              <Icon icon="solar:copy-linear" className="text-xs" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-400/10 text-foreground/40 hover:text-red-400 transition-colors"
              title="Remove"
            >
              <Icon icon="solar:trash-bin-trash-linear" className="text-xs" />
            </button>
          </div>
        )}
        <Icon
          icon="solar:alt-arrow-right-linear"
          className={`text-foreground/30 text-xs transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
        />
      </div>

      {expanded && (
        <div className="border-t border-border px-3 pb-3">
          {type.fields.length === 0 ? (
            <p className="text-xs text-foreground/30 pt-3">No configuration needed.</p>
          ) : (
            type.fields.map((f) => (
              <div key={f.key} className="mt-3">
                <label className="text-[10px] font-medium text-foreground/50 block mb-1">{f.label}</label>
                {f.type === 'mono' ? (
                  <textarea
                    className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-[11px] font-mono text-green-400 focus:outline-none focus:border-brand resize-none"
                    rows={2}
                    value={params[f.key] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => onParamChange(f.key, e.target.value)}
                    disabled={isTemplate}
                  />
                ) : f.type === 'select' ? (
                  <select
                    className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-xs focus:outline-none focus:border-brand"
                    value={params[f.key] ?? f.options?.[0] ?? ''}
                    onChange={(e) => onParamChange(f.key, e.target.value)}
                    disabled={isTemplate}
                  >
                    {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (f.type === 'neuron' || f.type === 'neuron-full') ? (
                  <>
                    <button
                      onClick={() => !isTemplate && setNeuronPickerKey(f.key)}
                      disabled={isTemplate}
                      className="w-full flex items-center justify-between gap-2 bg-background border border-border rounded-md px-2.5 py-2 text-xs hover:border-foreground/30 disabled:opacity-60 disabled:cursor-default transition-colors group"
                    >
                      <span className={`font-mono truncate ${params[f.key] ? 'text-foreground' : 'text-foreground/30'}`}>
                        {params[f.key] ? params[f.key].split('/').pop() : 'Select neuron…'}
                      </span>
                      <Icon icon="solar:magnifer-linear" className="text-foreground/30 group-hover:text-foreground/60 flex-shrink-0 transition-colors" />
                    </button>
                    {neuronPickerKey === f.key && (
                      <NeuronPickerModal
                        format={f.type === 'neuron' ? 'short' : 'full'}
                        onSelect={(val) => { onParamChange(f.key, val); setNeuronPickerKey(null); }}
                        onClose={() => setNeuronPickerKey(null)}
                      />
                    )}
                  </>
                ) : f.type === 'neuron-multi' ? (
                  <>
                    <div className="space-y-1.5 mb-2">
                      {(Array.isArray(params[f.key]) ? params[f.key] : []).map((n: string, i: number) => (
                        <div key={i} className="flex items-center gap-2 bg-background border border-border rounded-md px-2.5 py-1.5">
                          <span className="flex-1 text-xs font-mono truncate text-foreground">{n.split('/').pop()}</span>
                          {!isTemplate && (
                            <button
                              onClick={() => {
                                const arr = [...params[f.key]];
                                arr.splice(i, 1);
                                onParamChange(f.key, arr);
                              }}
                              className="text-foreground/30 hover:text-red-400 transition-colors flex-shrink-0"
                            >
                              <Icon icon="solar:close-circle-linear" className="text-sm" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {!isTemplate && (
                      <button
                        onClick={() => setNeuronPickerKey(f.key)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 border border-dashed border-border rounded-md text-xs text-foreground/40 hover:text-brand hover:border-brand transition-colors"
                      >
                        <Icon icon="solar:add-circle-linear" className="text-sm" />
                        Add neuron
                      </button>
                    )}
                    {neuronPickerKey === f.key && (
                      <NeuronPickerModal
                        format="full"
                        onSelect={(val) => {
                          const current = Array.isArray(params[f.key]) ? params[f.key] : [];
                          onParamChange(f.key, [...current, val]);
                          setNeuronPickerKey(null);
                        }}
                        onClose={() => setNeuronPickerKey(null)}
                      />
                    )}
                  </>
                ) : f.type === 'commit' ? (
                  <>
                    <button
                      onClick={() => !isTemplate && setCommitPickerOpen(true)}
                      disabled={isTemplate}
                      className="w-full flex items-center justify-between gap-2 bg-background border border-border rounded-md px-2.5 py-2 text-xs hover:border-foreground/30 disabled:opacity-60 disabled:cursor-default transition-colors group"
                    >
                      <span className={`font-mono truncate ${params[f.key] ? 'text-foreground' : 'text-foreground/30'}`}>
                        {params[f.key] ? params[f.key].slice(0, 12) : 'Latest build'}
                      </span>
                      <Icon icon="solar:magnifer-linear" className="text-foreground/30 group-hover:text-foreground/60 flex-shrink-0 transition-colors" />
                    </button>
                    {commitPickerOpen && (
                      <CommitPickerModal
                        neuron={params['neuron'] ?? ''}
                        onSelect={(sha) => { onParamChange('commit', sha); setCommitPickerOpen(false); }}
                        onClose={() => setCommitPickerOpen(false)}
                      />
                    )}
                  </>
                ) : f.type === 'env-multi' ? (
                  <MultiSelect
                    options={state.loadedEnvs.map((e) => ({ value: e.name, label: e.displayName }))}
                    value={Array.isArray(params[f.key]) ? params[f.key] : []}
                    onChange={(vals) => onParamChange(f.key, vals)}
                    placeholder="Select environments…"
                    disabled={isTemplate}
                  />
                ) : (
                  <input
                    className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-xs focus:outline-none focus:border-brand"
                    value={params[f.key] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => onParamChange(f.key, e.target.value)}
                    disabled={isTemplate}
                  />
                )}
              </div>
            ))
          )}

          {!isTemplate && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
              <span className="text-[10px] text-foreground/40 flex-shrink-0">On failure:</span>
              <Select value={step.onFailure || 'stop'} onValueChange={onFailureChange}>
                <SelectTrigger size="sm" className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stop">Stop workflow</SelectItem>
                  <SelectItem value="continue">Continue anyway</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── LogLine ──────────────────────────────────────────────────────────────────

function LogLine({ text }: { text: string }) {
  let cls = 'text-foreground/50';
  if (text.startsWith('━━━')) cls = 'text-brand';
  else if (text.startsWith('✓') || text.endsWith('s') && text.includes('done in')) cls = 'text-green-400';
  else if (text.startsWith('✗') || text.includes('failed:') || text.includes('error')) cls = 'text-red-400';
  else if (text.startsWith('#') || text.startsWith('Operation:')) cls = 'text-foreground/30';
  else if (text.startsWith('Resolved') || text.startsWith('Starting') || text.startsWith('Build complete') || text.startsWith('Deploy complete')) cls = 'text-foreground/80';
  return <div className={`${cls} font-mono text-[11px] leading-relaxed`}>{text || ' '}</div>;
}

// ─── WorkflowRunView ──────────────────────────────────────────────────────────

function WorkflowRunView({
  stepRuns,
  logSegments,
  collapsedSections,
  onToggleSection,
  done,
  finalStatus,
  error,
  runId,
  onStop,
  stopping,
  logBodyRef,
}: {
  stepRuns: StepRunStatus[];
  logSegments: Record<string, string>;
  collapsedSections: Record<string, boolean>;
  onToggleSection: (id: string) => void;
  done: boolean;
  finalStatus: string;
  error: string | null;
  runId: string | null;
  onStop: () => void;
  stopping: boolean;
  logBodyRef: React.RefObject<HTMLDivElement>;
}) {
  const isRunning = runId !== null && !done;

  // No run started yet
  if (!runId && !error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-foreground/25">
        <Icon icon="solar:play-circle-linear" className="text-4xl opacity-30" />
        <p className="text-sm">Click Run to execute this workflow</p>
      </div>
    );
  }

  // Error starting the run
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
        <Icon icon="solar:danger-triangle-linear" className="text-red-400 text-4xl" />
        <p className="text-sm text-red-400 font-medium">Failed to start workflow</p>
        <p className="text-xs text-foreground/40 text-center max-w-xs">{error}</p>
      </div>
    );
  }

  // Waiting for first poll result
  if (runId && stepRuns.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-foreground/30">
        <Icon icon="solar:spinner-linear" className="text-2xl animate-spin" />
        <p className="text-xs">Starting…</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Run sub-header */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <>
              <Icon icon="solar:spinner-linear" className="text-blue-400 text-sm animate-spin" />
              <span className="text-xs text-foreground/50">Running…</span>
            </>
          ) : finalStatus === 'success' ? (
            <>
              <Icon icon="solar:check-circle-bold" className="text-green-400 text-sm" />
              <span className="text-xs text-foreground/50">Completed successfully</span>
            </>
          ) : (
            <>
              <Icon icon="solar:close-circle-bold" className="text-red-400 text-sm" />
              <span className="text-xs text-foreground/50">Completed with errors</span>
            </>
          )}
        </div>
        <div className="flex-1 h-px bg-border mx-2" />
        {isRunning && (
          <Button
            variant="ghost"
            onClick={onStop}
            disabled={stopping}
            className="text-red-400 hover:text-red-300 hover:bg-red-400/10 text-xs h-7 px-2"
          >
            <Icon icon="solar:stop-circle-linear" className="text-sm" />
            Stop
          </Button>
        )}
      </div>

      {/* Split layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: timeline spine */}
        <div className="w-[220px] flex-shrink-0 border-r border-border overflow-y-auto py-5 px-4">
          {stepRuns.map((sr, idx) => {
            const dotBase = 'w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 text-[9px] font-mono transition-all';
            const dotCls = sr.status === 'running'
              ? `${dotBase} border-blue-400 bg-blue-400/10 text-blue-400`
              : sr.status === 'success'
              ? `${dotBase} border-green-400/50 bg-green-400/10 text-green-400`
              : sr.status === 'failed'
              ? `${dotBase} border-red-400/50 bg-red-400/10 text-red-400`
              : `${dotBase} border-border bg-card text-foreground/20`;

            const lineCls = sr.status === 'success'
              ? 'w-px min-h-[20px] flex-1 bg-green-400/20 mx-auto mt-1'
              : sr.status === 'failed'
              ? 'w-px min-h-[20px] flex-1 bg-red-400/20 mx-auto mt-1'
              : 'w-px min-h-[20px] flex-1 bg-border mx-auto mt-1';

            const duration = formatDuration(sr.startedAt, sr.completedAt);

            return (
              <div key={sr.id} className="flex gap-2.5">
                <div className="flex flex-col items-center" style={{ width: 20 }}>
                  <div className={dotCls}>
                    {sr.status === 'running' ? (
                      <Icon icon="solar:spinner-linear" className="animate-spin text-[10px]" />
                    ) : sr.status === 'success' ? (
                      '✓'
                    ) : sr.status === 'failed' ? (
                      '✗'
                    ) : sr.status === 'skipped' ? (
                      '—'
                    ) : (
                      idx + 1
                    )}
                  </div>
                  {idx < stepRuns.length - 1 && <div className={lineCls} />}
                </div>
                <div className="flex-1 min-w-0 pb-5">
                  <div className={`text-xs font-medium truncate ${sr.status === 'running' ? 'text-foreground' : sr.status === 'pending' ? 'text-foreground/30' : ''}`}>
                    {sr.label}
                  </div>
                  {duration && (
                    <div className="text-[10px] text-foreground/30 font-mono mt-0.5">{duration}</div>
                  )}
                  {sr.status === 'running' && !duration && (
                    <div className="text-[10px] text-blue-400/50 mt-0.5">running…</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: log feed */}
        <div ref={logBodyRef} className="flex-1 overflow-y-auto">
          {stepRuns.map((sr) => {
            const isOpen = !collapsedSections[sr.id];
            const logText = logSegments[sr.id] ?? '';
            const lines = logText.split('\n').filter(Boolean);
            const duration = formatDuration(sr.startedAt, sr.completedAt);

            return (
              <div key={sr.id} className="border-b border-border/30 last:border-0">
                {/* Section header */}
                <button
                  onClick={() => onToggleSection(sr.id)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-foreground/[2%] transition-colors select-none"
                >
                  <Icon
                    icon="solar:alt-arrow-right-linear"
                    className={`text-foreground/25 text-[10px] flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                  />
                  <Icon
                    icon={STATUS_ICON[sr.status] ?? STATUS_ICON.pending}
                    className={`text-sm flex-shrink-0 ${STATUS_COLOR[sr.status] ?? ''} ${sr.status === 'running' ? 'animate-spin' : ''}`}
                  />
                  <span className={`text-xs font-medium flex-1 truncate ${sr.status === 'pending' ? 'text-foreground/30' : ''}`}>
                    {sr.label}
                  </span>
                  {sr.status === 'running' && (
                    <span className="text-[10px] text-blue-400/60 flex-shrink-0">running…</span>
                  )}
                  {sr.status === 'skipped' && (
                    <span className="text-[10px] text-foreground/20 flex-shrink-0">skipped</span>
                  )}
                  {duration && (sr.status === 'success' || sr.status === 'failed') && (
                    <span className="text-[10px] text-foreground/25 font-mono flex-shrink-0">{duration}</span>
                  )}
                </button>

                {/* Section body */}
                {isOpen && (
                  <div className="bg-background px-5 pb-3 pt-1">
                    {lines.length > 0 ? (
                      lines.map((line, i) => <LogLine key={i} text={line} />)
                    ) : (
                      <div className="text-[11px] text-foreground/20 font-mono py-1">
                        {sr.status === 'pending' ? 'Waiting to start…' : 'No output.'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
