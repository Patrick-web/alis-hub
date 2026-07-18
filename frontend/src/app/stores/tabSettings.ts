import { useSyncExternalStore } from "react";
import * as settingsClient from "../lib/settingsClient";

export interface TabDefinition {
  id: string;
  label: string;
  icon: string;
  requiresWorkflows?: boolean;
}

export const TAB_REGISTRY: TabDefinition[] = [
  { id: "about", label: "About", icon: "solar:info-circle-linear" },
  { id: "develop", label: "Develop", icon: "solar:code-2-linear" },
  { id: "builds", label: "Builds", icon: "solar:box-linear" },
  { id: "deployments", label: "Deployments", icon: "solar:cloud-upload-linear" },
  { id: "environments", label: "Environments", icon: "solar:server-linear" },
  { id: "tools", label: "Tools", icon: "solar:settings-linear" },
  { id: "git", label: "Source Control", icon: "solar:code-scan-linear" },
  { id: "workflows", label: "Workflows", icon: "solar:playlist-2-linear", requiresWorkflows: true },
];

const REGISTRY_IDS = TAB_REGISTRY.map((t) => t.id);
const DEFAULT_TAB = "about";

export const STORAGE_KEY = "alis:tab-settings";

interface TabSettings {
  order: string[];
  defaultTab: string;
}

interface StoredTabSettings {
  order?: string[];
  defaultTab?: string;
}

/** Reconciles a stored order against the current registry: keeps known ids in
 * their saved position, appends any new registry ids, drops stale ones. */
function reconcileOrder(saved: string[] | undefined): string[] {
  const known = (saved ?? []).filter((id) => REGISTRY_IDS.includes(id));
  const missing = REGISTRY_IDS.filter((id) => !known.includes(id));
  return [...known, ...missing];
}

function load(): TabSettings {
  let parsed: StoredTabSettings = {};
  try {
    const raw = settingsClient.getCached(STORAGE_KEY);
    if (raw) parsed = JSON.parse(raw) as StoredTabSettings;
  } catch {
    parsed = {};
  }
  const order = reconcileOrder(parsed.order);
  const defaultTab =
    parsed.defaultTab && REGISTRY_IDS.includes(parsed.defaultTab) ? parsed.defaultTab : DEFAULT_TAB;
  return { order, defaultTab };
}

// Not initialized eagerly at module scope: this module is pulled in by the
// static import graph (App -> ... -> TopNav) and evaluated before
// settingsClient.init() has loaded SQLite into its cache, so calling load()
// here would always see an empty cache and silently fall back to defaults —
// with nothing ever reloading it afterward. Deferring to first real access
// (which happens once React actually renders, after init() has resolved)
// avoids that race.
let state: TabSettings | null = null;
const listeners = new Set<() => void>();

function ensureLoaded(): TabSettings {
  if (state === null) state = load();
  return state;
}

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  settingsClient.set(STORAGE_KEY, JSON.stringify(ensureLoaded()));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): TabSettings {
  return ensureLoaded();
}

export function getTabOrder(): string[] {
  return ensureLoaded().order;
}

export function setTabOrder(order: string[]): void {
  state = { ...ensureLoaded(), order: reconcileOrder(order) };
  persist();
  emit();
}

export function getDefaultTab(): string {
  return ensureLoaded().defaultTab;
}

export function setDefaultTab(id: string): void {
  if (!REGISTRY_IDS.includes(id)) return;
  state = { ...ensureLoaded(), defaultTab: id };
  persist();
  emit();
}

/** Route to open when entering a landing zone. Falls back to About when the
 * default tab is Workflows but the Workflows feature is disabled. */
export function getDefaultRoute(workflowsEnabled: boolean): string {
  const s = ensureLoaded();
  const tab = TAB_REGISTRY.find((t) => t.id === s.defaultTab);
  if (tab?.requiresWorkflows && !workflowsEnabled) return `/${DEFAULT_TAB}`;
  return `/${s.defaultTab}`;
}

/** Ordered, feature-filtered tab definitions for rendering the nav. */
export function getVisibleTabs(workflowsEnabled: boolean): TabDefinition[] {
  return ensureLoaded()
    .order.map((id) => TAB_REGISTRY.find((t) => t.id === id))
    .filter((t): t is TabDefinition => !!t)
    .filter((t) => (t.requiresWorkflows ? workflowsEnabled : true));
}

export function useTabSettings(): TabSettings {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
