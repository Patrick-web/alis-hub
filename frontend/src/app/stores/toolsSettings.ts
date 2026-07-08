import * as settingsClient from '../lib/settingsClient';

type ToolTab = 'buckets' | 'logs' | 'artifactregistry' | 'secrets' | 'spanner' | 'backups';

const STORAGE_KEY = 'alis:tools-context-defaults';

// 'env' means "follow the active environment"; 'org'/'product' match context IDs directly.
const BUILTIN_DEFAULTS: Record<ToolTab, string> = {
  buckets: 'env',
  logs: 'env',
  artifactregistry: 'product',
  secrets: 'product',
  spanner: 'org',
  backups: 'org',
};

type DefaultsMap = Record<string, Record<string, string>>;

function load(): DefaultsMap {
  try {
    const raw = settingsClient.getCached(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DefaultsMap) : {};
  } catch {
    return {};
  }
}

function save(map: DefaultsMap): void {
  settingsClient.set(STORAGE_KEY, JSON.stringify(map));
}

export function getToolDefault(org: string, product: string, toolId: string): string {
  const map = load();
  const key = `${org}/${product}`;
  return map[key]?.[toolId] ?? BUILTIN_DEFAULTS[toolId as ToolTab] ?? 'env';
}

export function setToolDefault(org: string, product: string, toolId: string, ctxId: string): void {
  const map = load();
  const key = `${org}/${product}`;
  if (!map[key]) map[key] = {};
  map[key][toolId] = ctxId;
  save(map);
}
