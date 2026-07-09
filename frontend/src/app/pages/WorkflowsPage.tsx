import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from '@iconify/react';
import { Dialogs } from '@wailsio/runtime';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Dialog, DialogContent } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { MultiSelect } from '../components/ui/multi-select';
import { SearchableSelect } from '../components/ui/searchable-select';
import { Switch } from '../components/ui/switch';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../components/ui/resizable';
import { useWorkspace } from '../stores/workspace';
import { useWorkflowRuns, type StepRunStatus } from '../stores/workflowRuns';
import { useNotifications } from '../stores/notifications';
import { useProtectedEnvironments } from '../stores/protectedEnvironments';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { notify } from '../lib/notify';
import * as WorkflowService from '../../../bindings/alis-hub-v3/workflowservice';
import * as BuildService from '../../../bindings/alis-hub-v3/buildservice';
import * as DeployService from '../../../bindings/alis-hub-v3/deployservice';

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkflowArg = {
  key: string;
  label: string;
};

const ARG_DEFS: WorkflowArg[] = [
  { key: 'environment', label: 'Environment' },
  { key: 'neuron', label: 'Neuron' },
  { key: 'branch', label: 'Git Branch' },
];

type Workflow = {
  id: string;
  name: string;
  description: string;
  isTemplate: boolean;
  createdAt: number;
  updatedAt: number;
  steps: WorkflowStep[];
  args: WorkflowArg[];
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
  type: 'text' | 'mono' | 'select' | 'tags' | 'neuron' | 'neuron-full' | 'neuron-multi' | 'commit' | 'build-version' | 'env-multi' | 'repo-select' | 'branch';
  placeholder?: string;
  options?: string[];
};

// ─── Step type helpers ────────────────────────────────────────────────────────

function repoLabel(val: string): string {
  if (val === 'define-repo') return 'Define repo';
  if (val === 'build-repo') return 'Build repo';
  return val || 'No repo set';
}

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
    defaultParams: { neuron: '', commit: '' },
    fields: [
      { key: 'neuron', label: 'Neuron', type: 'neuron-full', placeholder: 'organisations/org/products/product/neurons/bff-v1' },
      { key: 'commit', label: 'Commit SHA (leave blank for latest)', type: 'commit', placeholder: '' },
    ],
    summary: (p) => p.neuron ? p.neuron.split('/').slice(-1)[0] : 'No neuron set',
  },
  {
    id: 'build-cloud',
    label: 'Cloud Build',
    icon: 'solar:cloud-upload-linear',
    color: 'text-brand',
    defaultParams: { neuron: '', branch: 'master', commit: '' },
    fields: [
      { key: 'neuron', label: 'Neuron', type: 'neuron-full', placeholder: 'organisations/org/products/product/neurons/bff-v1' },
      { key: 'branch', label: 'Branch', type: 'branch', placeholder: 'master' },
      { key: 'commit', label: 'Commit SHA (leave blank for latest)', type: 'commit', placeholder: 'Latest build' },
    ],
    summary: (p) => p.neuron ? `${p.neuron.split('/').slice(-1)[0]} @ ${p.branch || 'master'}` : 'No neuron set',
    computeDefaults: (priorSteps) => ({ neuron: lastParamFrom(priorSteps, ['define'], 'neuron') }),
  },
  {
    id: 'deploy',
    label: 'Deploy',
    icon: 'solar:rocket-linear',
    color: 'text-purple-400',
    defaultParams: { neuron: '', version: '', environments: [] },
    fields: [
      { key: 'neuron', label: 'Neuron', type: 'neuron-full', placeholder: 'organisations/org/products/product/neurons/bff-v1' },
      { key: 'version', label: 'Build version', type: 'build-version', placeholder: 'Latest build' },
      { key: 'environments', label: 'Environments', type: 'env-multi' },
    ],
    summary: (p) => p.neuron ? `${p.neuron.split('/').slice(-1)[0]} @ ${p.version || 'latest'}` : 'No neuron set',
    computeDefaults: (priorSteps) => ({ neuron: lastParamFrom(priorSteps, ['build-cloud'], 'neuron') }),
  },
  {
    id: 'upgrade-packages',
    label: 'Upgrade Packages',
    icon: 'solar:refresh-circle-linear',
    color: 'text-cyan-400',
    defaultParams: { neurons: [], action: 'upgrade_defined' },
    fields: [
      { key: 'neurons', label: 'Neurons', type: 'neuron-multi' },
      { key: 'action', label: 'Action', type: 'select', options: ['upgrade_defined', 'upgrade', 'install', 'add'] },
    ],
    summary: (p) => Array.isArray(p.neurons) && p.neurons.length > 0 ? `${p.neurons.length} neuron(s)` : 'No neurons set',
    computeDefaults: (priorSteps) => ({ neurons: lastNeuronsFrom(priorSteps, ['build-cloud', 'define']) }),
  },
  {
    id: 'git-stage-all',
    label: 'Git: Stage All',
    icon: 'solar:file-add-linear',
    color: 'text-green-400',
    defaultParams: { repoPath: 'build-repo' },
    fields: [
      { key: 'repoPath', label: 'Repository', type: 'repo-select' },
    ],
    summary: (p) => repoLabel(p.repoPath),
  },
  {
    id: 'git-commit',
    label: 'Git: Commit',
    icon: 'solar:check-circle-linear',
    color: 'text-green-400',
    defaultParams: { repoPath: 'build-repo', message: '' },
    fields: [
      { key: 'repoPath', label: 'Repository', type: 'repo-select' },
      { key: 'message', label: 'Commit message', type: 'text', placeholder: 'chore: update' },
    ],
    summary: (p) => p.message || 'No message set',
    computeDefaults: (priorSteps) => {
      const hasUpgrade = priorSteps.some((s) => s.type === 'upgrade-packages');
      return hasUpgrade ? { message: 'chore: upgrade packages' } : {};
    },
  },
  {
    id: 'git-push',
    label: 'Git: Push',
    icon: 'solar:upload-linear',
    color: 'text-green-400',
    defaultParams: { repoPath: 'build-repo' },
    fields: [
      { key: 'repoPath', label: 'Repository', type: 'repo-select' },
    ],
    summary: (p) => repoLabel(p.repoPath),
  },
  {
    id: 'git-pull',
    label: 'Git: Pull',
    icon: 'solar:download-linear',
    color: 'text-green-400',
    defaultParams: { repoPath: 'build-repo' },
    fields: [
      { key: 'repoPath', label: 'Repository', type: 'repo-select' },
    ],
    summary: (p) => repoLabel(p.repoPath),
  },
  {
    id: 'shell',
    label: 'Shell Command',
    icon: 'solar:terminal-linear',
    color: 'text-yellow-400',
    defaultParams: { command: '', workdir: '', timeout: '' },
    fields: [
      { key: 'command', label: 'Command', type: 'mono', placeholder: 'alis define neurons/bff-v1' },
      { key: 'workdir', label: 'Working directory (optional)', type: 'text', placeholder: '' },
      { key: 'timeout', label: 'Timeout in seconds (optional)', type: 'text', placeholder: 'e.g. 300' },
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

// Sentinel values a step field is set to when it's bound to a workflow
// argument instead of holding an explicit value. Resolved at run time via
// the same {{key}} templating used for freeform inputs.
const NEURON_ARG_SENTINEL = '{{neuron}}';
const ENV_ARG_SENTINEL = ['{{environment}}'];
const BRANCH_ARG_SENTINEL = '{{branch}}';

function isNeuronBound(v: any): boolean {
  return v === NEURON_ARG_SENTINEL;
}

function isEnvBound(v: any): boolean {
  return Array.isArray(v) && v.length === 1 && v[0] === ENV_ARG_SENTINEL[0];
}

function isBranchBound(v: any): boolean {
  return v === BRANCH_ARG_SENTINEL;
}

// When a workflow argument is disabled, un-bind any step fields that were
// referencing it so they don't silently keep pointing at a removed input.
function clearArgBinding(steps: WorkflowStep[], argKey: string): WorkflowStep[] {
  return steps.map((s) => {
    let params: Record<string, any> = {};
    try { params = JSON.parse(s.params || '{}'); } catch { return s; }
    let changed = false;
    for (const f of getStepType(s.type).fields) {
      if (argKey === 'neuron' && f.type === 'neuron-full' && isNeuronBound(params[f.key])) {
        params[f.key] = '';
        changed = true;
      }
      if (argKey === 'environment' && f.type === 'env-multi' && isEnvBound(params[f.key])) {
        params[f.key] = [];
        changed = true;
      }
      if (argKey === 'branch' && f.type === 'branch' && isBranchBound(params[f.key])) {
        params[f.key] = '';
        changed = true;
      }
    }
    return changed ? { ...s, params: JSON.stringify(params) } : s;
  });
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
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // ── Run tab state ──────────────────────────────────────────────────────────
  // Run/poll state itself lives in WorkflowRunsProvider so it survives navigating
  // away from this page — see frontend/src/app/stores/workflowRuns.tsx.
  const {
    runs,
    startRun: storeStartRun,
    stopRun: storeStopRun,
    toggleSection,
    selectedWorkflowId: activeId,
    setSelectedWorkflowId: setActiveId,
  } = useWorkflowRuns();
  const { state: notifState, focusTaskId, setFocusTaskId } = useNotifications();
  const { state: workspaceState } = useWorkspace();
  const { isProtected } = useProtectedEnvironments();
  const [protectedConfirmOpen, setProtectedConfirmOpen] = useState(false);
  const [protectedConfirmLabels, setProtectedConfirmLabels] = useState<string[]>([]);
  const pendingRunRef = useRef<{ argValues: Record<string, string>; startPosition: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'steps' | 'run'>('steps');
  const [startError, setStartError] = useState<string | null>(null);

  const [runArgsOpen, setRunArgsOpen] = useState(false);
  const [runArgValues, setRunArgValues] = useState<Record<string, string>>({});
  const [runBranches, setRunBranches] = useState<string[]>([]);
  const [runBranchesLoading, setRunBranchesLoading] = useState(false);

  const logBodyRef = useRef<HTMLDivElement>(null);

  const active = workflows.find((w) => w.id === activeId) ?? null;
  const runEntry = activeId ? runs[activeId] : undefined;

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

  // Switch tabs when the selected workflow changes: jump straight to the Run tab
  // if that workflow has an in-progress run, otherwise show its steps.
  useEffect(() => {
    setStartError(null);
    const entry = activeId ? runs[activeId] : undefined;
    setActiveTab(entry && !entry.done ? 'run' : 'steps');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // On first load, if some workflow has a run in progress in the background,
  // jump straight to it instead of showing the empty "select a workflow" state.
  const didAutoSelectRef = useRef(false);
  useEffect(() => {
    if (didAutoSelectRef.current || activeId || workflows.length === 0) return;
    const runningEntries = Object.entries(runs).filter(([, r]) => !r.done);
    if (runningEntries.length === 0) return;
    didAutoSelectRef.current = true;
    runningEntries.sort((a, b) => b[1].startedAt - a[1].startedAt);
    setActiveId(runningEntries[0][0]);
    setActiveTab('run');
  }, [runs, activeId, workflows]);

  // Clicking a workflow-run chip in the status strip jumps back here.
  useEffect(() => {
    if (!focusTaskId) return;
    const n = notifState.notifications.find((x) => x.id === focusTaskId);
    setFocusTaskId(null);
    const workflowId = n?.task?.type === 'workflow' ? (n.task.meta?.workflowId as string | undefined) : undefined;
    if (workflowId) {
      setActiveId(workflowId);
      setActiveTab('run');
    }
  }, [focusTaskId, notifState.notifications, setFocusTaskId]);

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

  // Auto-scroll log feed: on step transition scroll to the step's section start;
  // within the same step, follow live output.
  const prevStepRunIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!runEntry || runEntry.done || !logBodyRef.current) return;
    const body = logBodyRef.current;
    const stepId = runEntry.currentStepRunId;
    if (stepId && stepId !== prevStepRunIdRef.current) {
      prevStepRunIdRef.current = stepId;
      const el = body.querySelector(`[data-step-run-id="${stepId}"]`);
      if (el && el instanceof HTMLElement) {
        body.scrollTop = el.offsetTop;
      }
    } else {
      body.scrollTop = body.scrollHeight;
    }
  }, [runEntry?.logSegments, runEntry?.done, runEntry?.currentStepRunId]);

  // ── Run actions ─────────────────────────────────────────────────────────────

  const [pendingStartPosition, setPendingStartPosition] = useState(0);

  const startRunNow = async (argValues: Record<string, string>, startPosition: number) => {
    if (!editedWorkflow) return;
    setStartError(null);
    setActiveTab('run');
    try {
      await storeStartRun(editedWorkflow.id, editedWorkflow.name, argValues, startPosition);
    } catch (e: any) {
      setStartError(e?.message ?? String(e));
    }
  };

  // Resolves the environment(s) a run (from startPosition onward) would deploy to —
  // either literal step params or the {{environment}} run-arg binding — and returns
  // any that are marked protected, so doStartRun can gate them behind a confirmation.
  const getProtectedRunTargets = (argValues: Record<string, string>, startPosition: number) => {
    if (!editedWorkflow) return [];
    const targetNames = new Set<string>();
    for (const step of editedWorkflow.steps.slice(startPosition)) {
      if (step.type !== 'deploy') continue;
      let params: Record<string, any> = {};
      try { params = JSON.parse(step.params || '{}'); } catch { continue; }
      const envParam = params.environments;
      if (isEnvBound(envParam)) {
        if (argValues.environment) targetNames.add(argValues.environment);
      } else if (Array.isArray(envParam)) {
        envParam.forEach((name: string) => targetNames.add(name));
      }
    }
    return workspaceState.loadedEnvs.filter((e) => targetNames.has(e.name) && isProtected(e.name));
  };

  const doStartRun = async (argValues: Record<string, string>, startPosition: number = 0) => {
    if (!editedWorkflow) return;
    const protectedTargets = getProtectedRunTargets(argValues, startPosition);
    if (protectedTargets.length > 0) {
      pendingRunRef.current = { argValues, startPosition };
      setProtectedConfirmLabels(protectedTargets.map((e) => e.displayName));
      setProtectedConfirmOpen(true);
      return;
    }
    await startRunNow(argValues, startPosition);
  };

  const handleRun = (startPosition: number = 0) => {
    setPendingStartPosition(startPosition);
    const args = editedWorkflow?.args ?? [];
    if (args.length === 0) {
      doStartRun({}, startPosition);
    } else {
      const defaults: Record<string, string> = {};
      for (const a of args) defaults[a.key] = a.key === 'branch' ? 'master' : '';
      setRunArgValues(defaults);
      setActiveTab('run');
      setRunArgsOpen(true);
    }
  };

  useEffect(() => {
    if (!runArgsOpen) return;
    if (!(editedWorkflow?.args ?? []).some((a) => a.key === 'branch')) return;
    if (!workspaceState.organisation || !workspaceState.product) return;
    setRunBranchesLoading(true);
    BuildService.GetBuildBranches(workspaceState.organisation, workspaceState.product)
      .then((res) => setRunBranches(res ?? []))
      .catch(() => setRunBranches([]))
      .finally(() => setRunBranchesLoading(false));
  }, [runArgsOpen, editedWorkflow, workspaceState.organisation, workspaceState.product]);

  const handleStop = async () => {
    if (!activeId || !runEntry?.runId || runEntry.stopping) return;
    await storeStopRun(activeId);
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
        args: editedWorkflow.args ?? [],
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
      args: [],
    }) as Workflow;
    setNewName('');
    setNewDesc('');
    setShowNewModal(false);
    await load();
    if (created) setActiveId(created.id);
  };

  const handleExport = async (workflowId: string) => {
    const wf = workflows.find((w) => w.id === workflowId);
    const defaultName = `${(wf?.name ?? 'workflow').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.workflow.json`;
    try {
      // A browser blob+<a download> doesn't reliably trigger a save in the
      // Wails webview, so we ask the OS for a path and write the file from Go.
      const path = await Dialogs.SaveFile({
        Filename: defaultName,
        Title: 'Export workflow',
        Filters: [{ DisplayName: 'Workflow JSON', Pattern: '*.json' }],
      });
      if (!path) return;
      await WorkflowService.ExportWorkflow(workflowId, path);
      notify.success('Workflow exported');
    } catch (e: any) {
      notify.error('Failed to export workflow', { description: e?.message ?? String(e) });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    setImportError(null);
    try {
      const text = await file.text();
      let data: any;
      try { data = JSON.parse(text); } catch { throw new Error('Invalid JSON file'); }
      if (!data.name || !Array.isArray(data.steps)) throw new Error('Invalid workflow file: missing name or steps');
      const created = await WorkflowService.CreateWorkflow({
        name: data.name,
        description: data.description ?? '',
        args: Array.isArray(data.args) ? data.args.filter((a: any) => ARG_DEFS.some((d) => d.key === a.key)) : [],
        steps: (data.steps as any[]).map((s, i) => ({
          id: uid(),
          type: s.type ?? '',
          params: typeof s.params === 'string' ? s.params : JSON.stringify(s.params ?? {}),
          onFailure: s.onFailure ?? 'stop',
          position: i,
        })),
      }) as Workflow;
      await load();
      if (created) setActiveId(created.id);
    } catch (err: any) {
      setImportError(err?.message ?? 'Failed to import workflow');
    } finally {
      setImporting(false);
    }
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
  const isRunning = !!runEntry && !runEntry.done;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left panel */}
      <div className="w-[240px] flex-shrink-0 border-r border-border flex flex-col bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest font-mono">Workflows</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => importFileRef.current?.click()}
              disabled={importing}
              className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent transition-colors text-foreground/40 hover:text-foreground disabled:opacity-40"
              title="Import workflow"
            >
              <Icon icon="solar:import-linear" className="text-base" />
            </button>
            <button
              onClick={() => setShowNewModal(true)}
              className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent transition-colors text-foreground/40 hover:text-foreground"
              title="New workflow"
            >
              <Icon icon="solar:add-circle-linear" className="text-base" />
            </button>
          </div>
        </div>
        <input ref={importFileRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
        {importError && (
          <div className="mx-3 mt-1 px-2 py-1.5 bg-red-400/10 rounded text-[10px] text-red-400 leading-snug">
            {importError}
          </div>
        )}

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
                      onExport={() => handleExport(wf.id)}
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
                  onExport={() => handleExport(wf.id)}
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
            <Button variant="secondary" onClick={() => setShowNewModal(true)} icon={<Icon icon="solar:add-circle-linear" className="text-base" />}>
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
                  {editedWorkflow.isTemplate ? (
                    <span className="font-semibold text-sm truncate">{editedWorkflow.name}</span>
                  ) : (
                    <input
                      value={editedWorkflow.name}
                      onChange={(e) => setEditedWorkflow((wf) => wf ? { ...wf, name: e.target.value } : wf)}
                      placeholder="Workflow name"
                      className="flex-1 min-w-0 bg-transparent font-semibold text-sm rounded px-1 -mx-1 outline-none focus:bg-accent"
                    />
                  )}
                </div>
                {editedWorkflow.isTemplate ? (
                  editedWorkflow.description && (
                    <p className="text-xs text-foreground/40 mt-0.5 truncate">{editedWorkflow.description}</p>
                  )
                ) : (
                  <input
                    value={editedWorkflow.description}
                    onChange={(e) => setEditedWorkflow((wf) => wf ? { ...wf, description: e.target.value } : wf)}
                    placeholder="Add a description…"
                    className="w-full bg-transparent text-xs text-foreground/40 mt-0.5 rounded px-1 -mx-1 outline-none focus:bg-accent focus:text-foreground/70"
                  />
                )}
              </div>

              <Button
                variant="ghost"
                onClick={() => handleExport(editedWorkflow.id)}
                icon={<Icon icon="solar:export-linear" className="text-base" />}
                title="Export workflow"
              >
                Export
              </Button>

              {editedWorkflow.isTemplate ? (
                <Button
                  variant="secondary"
                  onClick={() => handleClone(editedWorkflow.id)}
                  icon={<Icon icon="solar:copy-linear" className="text-base" />}
                >
                  Clone to Edit
                </Button>
              ) : (
                <>
                  {isDirty && (
                    <Button variant="secondary" onClick={handleSave} disabled={saving || !editedWorkflow.name.trim()}>
                      {saving ? 'Saving…' : 'Save'}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => handleDelete(editedWorkflow.id)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                    icon={<Icon icon="solar:trash-bin-trash-linear" className="text-base" />}
                  >
                    Delete
                  </Button>
                </>
              )}

              <Button
                variant="primary"
                onClick={() => handleRun()}
                disabled={editedWorkflow.steps.length === 0 || isRunning}
                icon={<Icon icon={isRunning ? 'solar:spinner-linear' : 'solar:play-linear'} className={`text-base ${isRunning ? 'animate-spin' : ''}`} />}
              >
                {isRunning ? 'Running…' : 'Run'}
              </Button>
            </div>

            {/* Tab strip */}
            <div className="flex items-center border-b border-border bg-card px-5">
              <button
                onClick={() => setActiveTab('steps')}
                className={`h-9 px-1 mr-4 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === 'steps'
                    ? 'border-brand-fill text-brand'
                    : 'border-transparent text-foreground/40 hover:text-foreground/70'
                }`}
              >
                Steps
              </button>
              <button
                onClick={() => setActiveTab('run')}
                className={`h-9 px-1 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'run'
                    ? 'border-brand-fill text-brand'
                    : 'border-transparent text-foreground/40 hover:text-foreground/70'
                }`}
              >
                Run
                {isRunning && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                )}
                {runEntry?.done && runEntry.finalStatus === 'success' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                )}
                {runEntry?.done && runEntry.finalStatus === 'failed' && (
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
                  {/* Inputs panel */}
                  {!editedWorkflow.isTemplate && (
                    <div className="mb-5 bg-card border border-border rounded-lg overflow-hidden">
                      <div className="px-3 py-2 border-b border-border">
                        <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Inputs</span>
                      </div>
                      <div className="px-3 py-2 flex flex-col gap-2">
                        {ARG_DEFS.map((def) => {
                          const enabled = (editedWorkflow.args ?? []).some((a) => a.key === def.key);
                          return (
                            <div key={def.key} className="flex items-center justify-between gap-2">
                              <span className="text-xs">{def.label}</span>
                              <Switch
                                checked={enabled}
                                onCheckedChange={(checked) => setEditedWorkflow((wf) => {
                                  if (!wf) return wf;
                                  const args = checked
                                    ? [...(wf.args ?? []), def]
                                    : (wf.args ?? []).filter((a) => a.key !== def.key);
                                  const steps = checked ? wf.steps : clearArgBinding(wf.steps, def.key);
                                  return { ...wf, args, steps };
                                })}
                              />
                            </div>
                          );
                        })}
                        <p className="text-[10px] text-foreground/30 pt-1">
                          Prompted for at run time. Enable a step field's "Use workflow argument" toggle to bind it.
                        </p>
                      </div>
                    </div>
                  )}

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
                      workflowArgs={editedWorkflow.args ?? []}
                      onToggle={() => setExpandedSteps((e) => ({ ...e, [step.id]: !e[step.id] }))}
                      onParamChange={(key, val) => updateStepParam(step.id, key, val)}
                      onFailureChange={(val) => updateStep(step.id, { onFailure: val })}
                      onDuplicate={() => duplicateStep(step.id)}
                      onRemove={() => removeStep(step.id)}
                      onRunFromHere={() => handleRun(idx)}
                      runDisabled={isRunning}
                      onDragStart={() => onDragStart(idx)}
                      onDrop={() => onDrop(idx)}
                    />
                  ))}

                  {!editedWorkflow.isTemplate && (
                    <div className="relative mt-2" ref={pickerRef}>
                      <button
                        onClick={() => setShowPicker((v) => !v)}
                        className="w-full py-2.5 border border-dashed border-border rounded-lg text-xs text-foreground/30 hover:border-brand-fill hover:text-brand flex items-center justify-center gap-1.5 transition-colors"
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
                stepRuns={runEntry?.stepRuns ?? []}
                logSegments={runEntry?.logSegments ?? {}}
                collapsedSections={runEntry?.collapsedSections ?? {}}
                onToggleSection={(id) => activeId && toggleSection(activeId, id)}
                done={runEntry?.done ?? false}
                finalStatus={runEntry?.finalStatus ?? 'running'}
                error={startError}
                runId={runEntry?.runId ?? null}
                onStop={handleStop}
                stopping={runEntry?.stopping ?? false}
                logBodyRef={logBodyRef}
                currentStepRunId={runEntry?.currentStepRunId ?? null}
              />
            </div>
          </>
        )}
      </div>

      {/* Run args dialog */}
      {runArgsOpen && editedWorkflow && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-card border border-border rounded-xl w-[380px] shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold">Run: {editedWorkflow.name}</h2>
              <p className="text-xs text-foreground/40 mt-0.5">
                {pendingStartPosition > 0 && editedWorkflow.steps[pendingStartPosition]
                  ? `Fill in the inputs for this run — starting from "${getStepType(editedWorkflow.steps[pendingStartPosition].type).label}".`
                  : 'Fill in the inputs for this run.'}
              </p>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              {(editedWorkflow.args ?? []).map((arg) => (
                <div key={arg.key}>
                  <label className="text-xs text-foreground/50 mb-1 block">{arg.label}</label>
                  {arg.key === 'environment' ? (
                    <Select
                      value={runArgValues.environment ?? ''}
                      onValueChange={(v) => setRunArgValues((vals) => ({ ...vals, environment: v }))}
                    >
                      <SelectTrigger size="sm" className="h-8 text-xs w-full">
                        <SelectValue placeholder="Select environment…" />
                      </SelectTrigger>
                      <SelectContent>
                        {workspaceState.loadedEnvs.map((e) => (
                          <SelectItem key={e.name} value={e.name}>{e.displayName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : arg.key === 'neuron' ? (
                    <SearchableSelect
                      value={runArgValues.neuron ?? ''}
                      options={workspaceState.neurons.map((n) => ({
                        label: n.id,
                        value: `organisations/${workspaceState.organisation}/products/${workspaceState.product}/neurons/${n.id}`,
                      }))}
                      onChange={(v) => setRunArgValues((vals) => ({ ...vals, neuron: v }))}
                      placeholder="Select neuron…"
                    />
                  ) : arg.key === 'branch' ? (
                    <SearchableSelect
                      value={runArgValues.branch ?? 'master'}
                      options={runBranches}
                      onChange={(v) => setRunArgValues((vals) => ({ ...vals, branch: v }))}
                      placeholder={runBranchesLoading ? 'Loading branches…' : 'Select branch…'}
                    />
                  ) : null}
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRunArgsOpen(false)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={(editedWorkflow.args ?? []).some((a) => !runArgValues[a.key])}
                onClick={() => { setRunArgsOpen(false); doStartRun(runArgValues, pendingStartPosition); }}
                icon={<Icon icon="solar:play-linear" className="text-base" />}
              >
                Run
              </Button>
            </div>
          </div>
        </div>
      )}

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

      <ConfirmDialog
        open={protectedConfirmOpen}
        onOpenChange={setProtectedConfirmOpen}
        title="Protected Environment"
        description={
          <>
            {protectedConfirmLabels.join(', ')} {protectedConfirmLabels.length > 1 ? 'are' : 'is'} protected.
            Type the phrase below to confirm this run.
          </>
        }
        confirmLabel="Run"
        requireText={`Deploy to ${protectedConfirmLabels.join(', ')}`}
        onConfirm={() => {
          setProtectedConfirmOpen(false);
          const pending = pendingRunRef.current;
          pendingRunRef.current = null;
          if (pending) startRunNow(pending.argValues, pending.startPosition);
        }}
      />
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

// Replace any full neuron resource path in a step label with just its short id,
// e.g. "Build: organisations/o/products/p/neurons/svc-v1" → "Build: svc-v1".
function shortStepLabel(label: string): string {
  return label.replace(/organisations\/\S*?\/neurons\/([^\s/]+)/g, '$1');
}

function CommitPickerModal({ neuron, branch, onSelect, onClose }: {
  neuron: string;
  branch?: string;
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
      org, product, neuronId, version, branch || 'master', 30
    )
      .then((res) => setCommits(res ?? []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [neuron, branch, state.organisation, state.product]);

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

// ─── VersionPickerModal ───────────────────────────────────────────────────────

type VersionEntry = { name: string; version: string; createTime: number; buildCommit: string; logsUrl: string; state: number };

function VersionPickerModal({ neuron, onSelect, onClose }: {
  neuron: string;
  onSelect: (version: string) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState('');
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!neuron) {
      setError('Set the Neuron field first.');
      setLoading(false);
      return;
    }
    DeployService.ListNeuronVersions(neuron)
      .then((res) => setVersions((res ?? []).filter((v): v is VersionEntry => v !== null)))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [neuron]);

  const filtered = versions.filter((v) => v.version.includes(filter));

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="text-foreground p-0 max-w-[440px] overflow-hidden">
        <div className="flex items-center gap-[10px] px-[16px] pt-[16px] pb-[12px] border-b border-border">
          <Icon icon="solar:box-linear" className="text-brand text-lg" />
          <span className="text-[13px] font-bold text-foreground font-mono">Select Build Version</span>
        </div>
        <div className="px-[16px] py-[10px] border-b border-border">
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
            placeholder="Filter by version…"
            className="w-full bg-transparent text-[12px] font-mono text-foreground outline-none placeholder:text-foreground/30"
          />
        </div>
        <div className="overflow-y-auto max-h-[360px] py-[6px]">
          <button
            onClick={() => onSelect('')}
            className="w-full flex items-center gap-3 px-[16px] py-[10px] transition-colors text-left hover:bg-foreground/[4%]"
          >
            <span className="text-[12px] text-brand font-mono">Latest build (default)</span>
          </button>
          {loading ? (
            <p className="px-[16px] py-[12px] text-[11px] text-foreground/40 font-mono">Loading versions…</p>
          ) : error ? (
            <p className="px-[16px] py-[12px] text-[11px] text-red-400/70 font-mono">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="px-[16px] py-[12px] text-[11px] text-foreground/40 font-mono">No built versions found</p>
          ) : (
            filtered.map((v) => (
              <button
                key={v.name}
                onClick={() => onSelect(v.version)}
                className="w-full flex items-center gap-3 px-[16px] py-[10px] transition-colors text-left hover:bg-foreground/[4%]"
              >
                <span className="text-[12px] font-mono text-foreground truncate">{v.version}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── WorkflowListItem ─────────────────────────────────────────────────────────

function WorkflowListItem({ workflow, active, onClick, onExport }: {
  workflow: Workflow;
  active: boolean;
  onClick: () => void;
  onExport: () => void;
}) {
  return (
    <div
      className={`relative group flex items-stretch mx-1 rounded-lg transition-colors text-sm ${
        active ? 'bg-brand-fill/10 text-brand' : 'text-foreground hover:bg-accent'
      }`}
      style={{ width: 'calc(100% - 8px)' }}
    >
      <button onClick={onClick} className="flex-1 text-left px-3 py-2 min-w-0">
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
      <button
        onClick={(e) => { e.stopPropagation(); onExport(); }}
        className="opacity-0 group-hover:opacity-100 w-6 flex items-center justify-center text-foreground/40 hover:text-foreground transition-opacity flex-shrink-0 pr-1"
        title="Export workflow"
      >
        <Icon icon="solar:export-linear" className="text-xs" />
      </button>
    </div>
  );
}

// ─── StepCard ─────────────────────────────────────────────────────────────────

function StepCard({ step, index, expanded, isTemplate, workflowArgs, onToggle, onParamChange, onFailureChange, onDuplicate, onRemove, onRunFromHere, runDisabled, onDragStart, onDrop }: {
  step: WorkflowStep;
  index: number;
  expanded: boolean;
  isTemplate: boolean;
  workflowArgs: WorkflowArg[];
  onToggle: () => void;
  onParamChange: (key: string, val: string | string[]) => void;
  onFailureChange: (val: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onRunFromHere: () => void;
  runDisabled: boolean;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const [neuronPickerKey, setNeuronPickerKey] = useState<string | null>(null);
  const [commitPickerOpen, setCommitPickerOpen] = useState(false);
  const [versionPickerOpen, setVersionPickerOpen] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const { state } = useWorkspace();

  const type = getStepType(step.type);
  const summary = stepSummary(step);
  let params: Record<string, any> = {};
  try { params = JSON.parse(step.params); } catch { /**/ }

  const hasBranchField = type.fields.some((f) => f.type === 'branch');
  useEffect(() => {
    if (!expanded || !hasBranchField || !state.organisation || !state.product) return;
    setBranchesLoading(true);
    BuildService.GetBuildBranches(state.organisation, state.product)
      .then((res) => setBranches(res ?? []))
      .catch(() => setBranches([]))
      .finally(() => setBranchesLoading(false));
  }, [expanded, hasBranchField, state.organisation, state.product]);

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
              onClick={(e) => { e.stopPropagation(); if (!runDisabled) onRunFromHere(); }}
              disabled={runDisabled}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-accent text-foreground/40 hover:text-brand disabled:opacity-40 disabled:hover:text-foreground/40 transition-colors"
              title="Run from this step"
            >
              <Icon icon="solar:play-linear" className="text-xs" />
            </button>
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
                    className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-[11px] font-mono text-green-400 focus:outline-none focus:border-brand-fill resize-none"
                    rows={2}
                    value={params[f.key] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => onParamChange(f.key, e.target.value)}
                    disabled={isTemplate}
                  />
                ) : f.type === 'select' ? (
                  <Select
                    value={params[f.key] ?? f.options?.[0] ?? ''}
                    onValueChange={(v) => onParamChange(f.key, v)}
                    disabled={isTemplate}
                  >
                    <SelectTrigger size="sm" className="h-8 text-xs w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {f.options?.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (f.type === 'neuron' || f.type === 'neuron-full') ? (
                  <>
                    {f.type === 'neuron-full' && workflowArgs.some((a) => a.key === 'neuron') && (
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] text-foreground/40">Use workflow argument</span>
                        <Switch
                          checked={isNeuronBound(params[f.key])}
                          onCheckedChange={(checked) => onParamChange(f.key, checked ? NEURON_ARG_SENTINEL : '')}
                          disabled={isTemplate}
                        />
                      </div>
                    )}
                    {isNeuronBound(params[f.key]) ? (
                      <div className="w-full bg-background border border-dashed border-border rounded-md px-2.5 py-2 text-xs font-mono text-foreground/40">
                        {NEURON_ARG_SENTINEL}
                      </div>
                    ) : (
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
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 border border-dashed border-border rounded-md text-xs text-foreground/40 hover:text-brand hover:border-brand-fill transition-colors"
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
                        {params[f.key] ? params[f.key].slice(0, 12) : (f.placeholder || 'Latest commit')}
                      </span>
                      <Icon icon="solar:magnifer-linear" className="text-foreground/30 group-hover:text-foreground/60 flex-shrink-0 transition-colors" />
                    </button>
                    {commitPickerOpen && (
                      <CommitPickerModal
                        neuron={params['neuron'] ?? ''}
                        branch={params['branch'] || 'master'}
                        onSelect={(sha) => { onParamChange('commit', sha); setCommitPickerOpen(false); }}
                        onClose={() => setCommitPickerOpen(false)}
                      />
                    )}
                  </>
                ) : f.type === 'branch' ? (
                  <>
                    {workflowArgs.some((a) => a.key === 'branch') && (
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] text-foreground/40">Use workflow argument</span>
                        <Switch
                          checked={isBranchBound(params[f.key])}
                          onCheckedChange={(checked) => onParamChange(f.key, checked ? BRANCH_ARG_SENTINEL : 'master')}
                          disabled={isTemplate}
                        />
                      </div>
                    )}
                    {isBranchBound(params[f.key]) ? (
                      <div className="w-full bg-background border border-dashed border-border rounded-md px-2.5 py-2 text-xs font-mono text-foreground/40">
                        {BRANCH_ARG_SENTINEL}
                      </div>
                    ) : isTemplate ? (
                      <div className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-xs font-mono text-foreground/40">
                        {params[f.key] || f.placeholder || 'master'}
                      </div>
                    ) : (
                      <SearchableSelect
                        value={params[f.key] ?? 'master'}
                        options={branches}
                        onChange={(v) => onParamChange(f.key, v)}
                        placeholder={branchesLoading ? 'Loading branches…' : (f.placeholder || 'master')}
                        className="w-full h-8"
                      />
                    )}
                  </>
                ) : f.type === 'build-version' ? (
                  <>
                    <button
                      onClick={() => !isTemplate && setVersionPickerOpen(true)}
                      disabled={isTemplate}
                      className="w-full flex items-center justify-between gap-2 bg-background border border-border rounded-md px-2.5 py-2 text-xs hover:border-foreground/30 disabled:opacity-60 disabled:cursor-default transition-colors group"
                    >
                      <span className={`font-mono truncate ${params[f.key] ? 'text-foreground' : 'text-foreground/30'}`}>
                        {params[f.key] || (f.placeholder || 'Latest build')}
                      </span>
                      <Icon icon="solar:magnifer-linear" className="text-foreground/30 group-hover:text-foreground/60 flex-shrink-0 transition-colors" />
                    </button>
                    {versionPickerOpen && (
                      <VersionPickerModal
                        neuron={params['neuron'] ?? ''}
                        onSelect={(version) => { onParamChange(f.key, version); setVersionPickerOpen(false); }}
                        onClose={() => setVersionPickerOpen(false)}
                      />
                    )}
                  </>
                ) : f.type === 'repo-select' ? (
                  <Select
                    value={params[f.key] ?? 'build-repo'}
                    onValueChange={(v) => onParamChange(f.key, v)}
                    disabled={isTemplate}
                  >
                    <SelectTrigger size="sm" className="h-8 text-xs w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="build-repo">Build repo</SelectItem>
                      <SelectItem value="define-repo">Define repo</SelectItem>
                    </SelectContent>
                  </Select>
                ) : f.type === 'env-multi' ? (
                  <>
                    {workflowArgs.some((a) => a.key === 'environment') && (
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] text-foreground/40">Use workflow argument</span>
                        <Switch
                          checked={isEnvBound(params[f.key])}
                          onCheckedChange={(checked) => onParamChange(f.key, checked ? ENV_ARG_SENTINEL : [])}
                          disabled={isTemplate}
                        />
                      </div>
                    )}
                    {isEnvBound(params[f.key]) ? (
                      <div className="w-full bg-background border border-dashed border-border rounded-md px-2.5 py-2 text-xs font-mono text-foreground/40">
                        {ENV_ARG_SENTINEL[0]}
                      </div>
                    ) : (
                      <MultiSelect
                        options={state.loadedEnvs.map((e) => ({ value: e.name, label: e.displayName }))}
                        value={Array.isArray(params[f.key]) ? params[f.key] : []}
                        onChange={(vals) => onParamChange(f.key, vals)}
                        placeholder="Select environments…"
                        disabled={isTemplate}
                      />
                    )}
                  </>
                ) : (
                  <input
                    className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-xs focus:outline-none focus:border-brand-fill"
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

type SubTab = { id: string; label: string; text: string };

function parseSubTabs(logText: string): SubTab[] | null {
  if (!logText.includes('\x1fTAB:')) return null;
  const tabMap = new Map<string, SubTab>();
  const tabOrder: string[] = [];
  let currentId: string | null = null;
  for (const line of logText.split('\n')) {
    if (line.startsWith('\x1fTAB:')) {
      const rest = line.slice(5);
      const sep = rest.indexOf('\x1f');
      const id = sep >= 0 ? rest.slice(0, sep) : rest;
      const label = sep >= 0 ? rest.slice(sep + 1) : rest;
      currentId = id;
      if (!tabMap.has(id)) {
        tabMap.set(id, { id, label, text: '' });
        tabOrder.push(id);
      }
    } else if (currentId) {
      tabMap.get(currentId)!.text += line + '\n';
    }
  }
  const tabs = tabOrder.map((id) => tabMap.get(id)!);
  return tabs.length > 0 ? tabs : null;
}

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
  currentStepRunId,
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
  currentStepRunId: string | null;
}) {
  const isRunning = runId !== null && !done;
  const [activeSub, setActiveSub] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function copyLog(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
  }

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
            icon={<Icon icon="solar:stop-circle-linear" className="text-sm" />}
          >
            {stopping ? 'Stopping…' : 'Stop'}
          </Button>
        )}
      </div>

      {/* Split layout */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">
        {/* Left: timeline spine */}
        <ResizablePanel defaultSize={22} minSize={12} maxSize={45}>
          <div className="h-full border-r border-border overflow-y-auto py-5 px-4">
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
                    {shortStepLabel(sr.label)}
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
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right: log feed */}
        <ResizablePanel defaultSize={78}>
        <div ref={logBodyRef} className="h-full overflow-y-auto">
          {stepRuns.map((sr) => {
            const isOpen = !collapsedSections[sr.id];
            // Prefer the persisted per-step log once the backend has written it (i.e. the
            // step has finished) — the live `logSegments` reconstruction is a best-effort
            // heuristic based on which step polling observed as "running", and can
            // misattribute fast/non-streaming steps (e.g. git commit/push) to the wrong
            // section or leave them empty. Fall back to the live segment while running.
            const logText = sr.log || logSegments[sr.id] || '';
            const tabs = parseSubTabs(logText);
            const lines = tabs ? [] : logText.split('\n').filter(Boolean);
            const duration = formatDuration(sr.startedAt, sr.completedAt);
            // Active sub-tab: user selection or last tab (auto-follows newest)
            const activeTabId = tabs
              ? (activeSub[sr.id] ?? tabs[tabs.length - 1]?.id)
              : null;
            const activeTabText = tabs?.find((t) => t.id === activeTabId)?.text ?? '';

            return (
              <div key={sr.id} data-step-run-id={sr.id} className="border-b border-border/30 last:border-0">
                {/* Section header */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onToggleSection(sr.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggleSection(sr.id); }}
                  className="group w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-foreground/[2%] transition-colors select-none cursor-pointer"
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
                    {shortStepLabel(sr.label)}
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
                  {logText && (
                    <button
                      onClick={(e) => { e.stopPropagation(); copyLog(sr.id, tabs ? activeTabText : logText); }}
                      title="Copy log"
                      className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-foreground/30 hover:text-foreground transition-colors flex-shrink-0"
                    >
                      <Icon icon={copiedId === sr.id ? 'solar:check-circle-linear' : 'solar:copy-linear'} className="text-xs" />
                    </button>
                  )}
                </div>

                {/* Section body */}
                {isOpen && (
                  <div className="bg-background">
                    {tabs ? (
                      <>
                        {/* Sub-tab bar */}
                        <div className="flex border-b border-border/40 overflow-x-auto">
                          {tabs.map((tab) => (
                            <button
                              key={tab.id}
                              onClick={() => setActiveSub((s) => ({ ...s, [sr.id]: tab.id }))}
                              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono shrink-0 border-r border-border/30 transition-colors ${
                                activeTabId === tab.id
                                  ? 'text-foreground border-b-2 border-b-brand bg-foreground/[2%]'
                                  : 'text-foreground/40 hover:text-foreground/70'
                              }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>
                        {/* Active tab content */}
                        <div className="px-5 pb-3 pt-1">
                          {activeTabText.split('\n').filter(Boolean).length > 0 ? (
                            activeTabText.split('\n').filter(Boolean).map((line, i) => (
                              <LogLine key={i} text={line} />
                            ))
                          ) : (
                            <div className="text-[11px] text-foreground/20 font-mono py-1">
                              {sr.status === 'pending' ? 'Waiting to start…' : 'No output yet.'}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="px-5 pb-3 pt-1">
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
                )}
              </div>
            );
          })}
        </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
