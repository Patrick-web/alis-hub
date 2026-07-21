import { create } from "zustand";
import { persist } from "zustand/middleware";
import { hydrateWhenReady, persistSqlite } from "./lib/persistSqlite";

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

interface TabSettingsState {
  order: string[];
  defaultTab: string;
  setTabOrder: (order: string[]) => void;
  setDefaultTab: (id: string) => void;
}

interface PersistedTabSettings {
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

export const useTabSettings = create<TabSettingsState>()(
  persist(
    (set) => ({
      order: [...REGISTRY_IDS],
      defaultTab: DEFAULT_TAB,
      setTabOrder: (order) => set({ order: reconcileOrder(order) }),
      setDefaultTab: (id) => {
        if (REGISTRY_IDS.includes(id)) set({ defaultTab: id });
      },
    }),
    persistSqlite<TabSettingsState, PersistedTabSettings>({
      key: "alis:tab-settings",
      partialize: (state) => ({ order: state.order, defaultTab: state.defaultTab }),
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as PersistedTabSettings;
        return {
          ...current,
          order: reconcileOrder(stored.order),
          defaultTab:
            stored.defaultTab && REGISTRY_IDS.includes(stored.defaultTab)
              ? stored.defaultTab
              : current.defaultTab,
        };
      },
    }),
  ),
);

hydrateWhenReady(useTabSettings);

/** Route to open when entering a landing zone. Falls back to About when the
 * default tab is Workflows but the Workflows feature is disabled. Reads the
 * store imperatively so navigation callbacks don't need a subscription. */
export function getDefaultRoute(workflowsEnabled: boolean): string {
  const { defaultTab } = useTabSettings.getState();
  const tab = TAB_REGISTRY.find((t) => t.id === defaultTab);
  if (tab?.requiresWorkflows && !workflowsEnabled) return `/${DEFAULT_TAB}`;
  return `/${defaultTab}`;
}

/** Ordered, feature-filtered tab definitions for rendering the nav. Pure so
 * callers subscribe to `order` via selector and derive during render. */
export function visibleTabsFor(order: string[], workflowsEnabled: boolean): TabDefinition[] {
  return order
    .map((id) => TAB_REGISTRY.find((t) => t.id === id))
    .filter((t): t is TabDefinition => !!t)
    .filter((t) => (t.requiresWorkflows ? workflowsEnabled : true));
}
