import { create } from 'zustand';
import { disposeLogBuses } from '../lib/logBus';
import type {
  BuildMode,
  BuildResult,
  BuildStep,
  DefineCommit,
  DefineResult,
  DefineStep,
  DeployEnv,
  DeployStep,
  EnvRunState,
  GlassResult,
  PackageScript,
  PackagesStep,
} from '../components/develop/types';

// ── Session shapes ─────────────────────────────────────────────────────────────
// One session per Develop tab, keyed by tab id. Sessions hold the full step
// machine for each task flow so multiple surfaces (the Develop task panel and
// the command palette) can render and drive the same flow. Side effects
// (polling, log streaming) are owned exclusively by the always-mounted panes.

export interface DefineSession {
  kind: 'define';
  tabId: string;
  neuron: string;
  step: DefineStep;
  commits: DefineCommit[];
  commitsLoading: boolean;
  selectedCommit: DefineCommit | null;
  defineResult: DefineResult | null;
  progressMsg: string;
  glassResult: GlassResult | null;
  glassLoading: boolean;
  defineError: string | null;
}

export interface BuildSession {
  kind: 'build';
  tabId: string;
  neuron: string;
  step: BuildStep;
  commits: DefineCommit[];
  commitsLoading: boolean;
  selectedCommit: DefineCommit | null;
  buildResult: BuildResult | null;
  progressMsg: string;
  branch: string;
  branches: string[];
  buildMode: BuildMode;
  localBuildId: string | null;
  deployEnvs: DeployEnv[];
  selectedDeployEnvs: string[];
  envsLoading: boolean;
  buildPhase: 'build' | 'deploy';
  deployRuns: EnvRunState[];
  activeRunEnv: string;
}

export interface DeploySession {
  kind: 'deploy';
  tabId: string;
  neuron: string;
  step: DeployStep;
  deployError: string | null;
  envs: DeployEnv[];
  selectedEnvs: string[];
  versions: { name: string; version: string; createTime: number }[];
  version: string;
  planOnly: boolean;
  beta: boolean;
  envRuns: EnvRunState[];
  activeRunEnv: string;
}

export interface PackagesSession {
  kind: 'packages';
  tabId: string;
  neuron: string;
  neuronNames: string[];
  step: PackagesStep;
  action: 'upgrade_defined' | 'upgrade' | 'install' | 'add';
  scripts: PackageScript[];
  selectedScripts: string[];
  error: string;
}

export type DevelopSession = DefineSession | BuildSession | DeploySession | PackagesSession;

export function initialDefineSession(tabId: string, neuron: string): DefineSession {
  return {
    kind: 'define', tabId, neuron,
    step: 'commits', commits: [], commitsLoading: true, selectedCommit: null,
    defineResult: null, progressMsg: 'Starting...', glassResult: null,
    glassLoading: false, defineError: null,
  };
}

export function initialBuildSession(tabId: string, neuron: string): BuildSession {
  return {
    kind: 'build', tabId, neuron,
    step: 'commits', commits: [], commitsLoading: true, selectedCommit: null,
    buildResult: null, progressMsg: 'Starting...', branch: 'master', branches: ['master'],
    buildMode: 'cloud', localBuildId: null, deployEnvs: [], selectedDeployEnvs: [],
    envsLoading: false, buildPhase: 'build', deployRuns: [], activeRunEnv: '',
  };
}

export function initialDeploySession(tabId: string, neuron: string): DeploySession {
  return {
    kind: 'deploy', tabId, neuron,
    step: 'loading', deployError: null, envs: [], selectedEnvs: [],
    versions: [], version: '', planOnly: false, beta: false,
    envRuns: [], activeRunEnv: '',
  };
}

export function initialPackagesSession(tabId: string, neuron: string, neuronNames: string[]): PackagesSession {
  return {
    kind: 'packages', tabId, neuron, neuronNames,
    step: 'scan', action: 'upgrade_defined', scripts: [], selectedScripts: [], error: '',
  };
}

// ── Controllers ────────────────────────────────────────────────────────────────
// Panes register an imperative controller on mount. Any surface (palette,
// pane UI) triggers flow actions through the controller so effect ownership
// stays with the always-mounted pane and actions are never duplicated.

export interface DefineController {
  kind: 'define';
  loadCommits: () => void;
  runDefine: () => void;
}

export interface BuildController {
  kind: 'build';
  loadCommits: (branch: string) => void;
  changeBranch: (branch: string) => void;
  runBuild: () => void;
}

export interface DeployController {
  kind: 'deploy';
  reload: () => void;
  /** Starts the deploy immediately — protected-environment confirmation must
   * be handled by the calling surface before invoking this. */
  runDeployNow: () => void;
}

export interface PackagesController {
  kind: 'packages';
  scan: () => void;
  /** Resolves after the venv pre-check; read the session step afterwards to
   * know whether the flow moved to 'venv-setup' or started running. */
  runPackages: () => Promise<void>;
  runScripts: (withVenv: boolean) => void;
}

export type SessionController = DefineController | BuildController | DeployController | PackagesController;

const controllers = new Map<string, SessionController>();

export function registerSessionController(tabId: string, controller: SessionController): void {
  controllers.set(tabId, controller);
}

export function unregisterSessionController(tabId: string): void {
  controllers.delete(tabId);
}

export function getSessionController(tabId: string): SessionController | undefined {
  return controllers.get(tabId);
}

// ── Store ──────────────────────────────────────────────────────────────────────

interface DevelopSessionsStore {
  sessions: Record<string, DevelopSession>;
  ensureSession: (session: DevelopSession) => void;
  patchSession: (tabId: string, patch: Partial<DevelopSession>) => void;
  removeSession: (tabId: string) => void;
}

export const useDevelopSessions = create<DevelopSessionsStore>((set) => ({
  sessions: {},
  ensureSession: (session) => set(state => {
    if (state.sessions[session.tabId]) return state;
    return { sessions: { ...state.sessions, [session.tabId]: session } };
  }),
  patchSession: (tabId, patch) => set(state => {
    const existing = state.sessions[tabId];
    if (!existing) return state;
    return { sessions: { ...state.sessions, [tabId]: { ...existing, ...patch } as DevelopSession } };
  }),
  removeSession: (tabId) => set(state => {
    if (!state.sessions[tabId]) return state;
    unregisterSessionController(tabId);
    disposeLogBuses(tabId);
    const next = { ...state.sessions };
    delete next[tabId];
    return { sessions: next };
  }),
}));

export function patchSession<T extends DevelopSession>(tabId: string, patch: Partial<T>): void {
  useDevelopSessions.getState().patchSession(tabId, patch as Partial<DevelopSession>);
}

export function getSession<T extends DevelopSession>(tabId: string): T | undefined {
  return useDevelopSessions.getState().sessions[tabId] as T | undefined;
}
