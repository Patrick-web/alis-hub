export interface DefineCommit {
  sha: string;
  message: string;
  author: string;
  authorEmail: string;
  timestamp: number;
}

export interface GlassArtifact {
  type: string;
  state: number;
  notes: string;
  locationUri: string;
  extra: string;
}

export interface GlassResult {
  title: string;
  summary: string;
  definition: { name: string; version: string; commit: string; releaseType: string };
  artifacts: GlassArtifact[];
}

export interface DefineResult {
  operationName: string;
  definition: string;
  version: string;
  notes: string;
  definitionArtifacts: string[];
  done: boolean;
  error?: string;
}

export interface BuildResult {
  operationName: string;
  version: string;
  neuronVersion: string;
  logsUrl: string;
  notes: string;
  done: boolean;
  error?: string;
  stub?: boolean;
}

export interface DeployEnv {
  name: string;
  displayName: string;
  currentVersion: string;
}

export interface EnvRunState {
  env: string;
  displayName: string;
  operationName: string;
  logsUrl: string;
  version: string;
  progressMsg: string;
  done: boolean;
  error?: string;
  deploymentIndex?: number;
}

export interface DeployResult {
  operationName: string;
  version: string;
  deployments: { logsUrl: string }[];
  notes: string;
  done: boolean;
  error?: string;
}

export interface PackageScript {
  name: string;
  title: string;
  workDir: string;
  lang: string;
  install: string;
  upgrade: string;
  upgradeDefined: string;
  add: string;
}

export type DefineStep = 'commits' | 'confirm' | 'running' | 'glass';
export type BuildStep = 'commits' | 'confirm' | 'running' | 'result';
export type BuildMode = 'cloud' | 'local' | 'deploy';
export type DeployStep = 'loading' | 'confirm' | 'running' | 'result';
export type PackagesStep = 'scan' | 'select-action' | 'select-folders' | 'venv-setup' | 'preparing' | 'running';

export function parseNeuron(name: string) {
  const mDot = name.match(/^(.+)\.(v\d+)$/);
  if (mDot) return { id: mDot[1], version: mDot[2] };
  const mHyphen = name.match(/^(.+)-(v\d+)$/);
  if (mHyphen) return { id: mHyphen[1], version: mHyphen[2] };
  return { id: name, version: 'v1' };
}

export function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatRelativeTime(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function isAuthError(e: unknown): boolean {
  const s = String(e);
  return s.includes('invalid_grant') || s.includes('refresh token has expired') || s.includes('console token expired');
}
