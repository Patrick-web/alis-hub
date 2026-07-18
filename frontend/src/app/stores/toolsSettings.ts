import { create } from "zustand";
import { persist } from "zustand/middleware";
import { hydrateWhenReady, persistSqlite } from "./lib/persistSqlite";

type ToolTab = "buckets" | "logs" | "artifactregistry" | "secrets" | "spanner" | "backups";

// 'env' means "follow the active environment"; 'org'/'product' match context IDs directly.
const BUILTIN_DEFAULTS: Record<ToolTab, string> = {
  buckets: "env",
  logs: "env",
  artifactregistry: "product",
  secrets: "product",
  spanner: "org",
  backups: "org",
};

type DefaultsMap = Record<string, Record<string, string>>;

interface ToolsSettingsStore {
  map: DefaultsMap;
  setDefault: (org: string, product: string, toolId: string, ctxId: string) => void;
}

export const useToolsSettings = create<ToolsSettingsStore>()(
  persist(
    (set) => ({
      map: {},
      setDefault: (org, product, toolId, ctxId) =>
        set((s) => {
          const key = `${org}/${product}`;
          return { map: { ...s.map, [key]: { ...s.map[key], [toolId]: ctxId } } };
        }),
    }),
    persistSqlite<ToolsSettingsStore, DefaultsMap>({
      key: "alis:tools-context-defaults",
      partialize: (s) => s.map,
      merge: (persisted, current) => ({
        ...current,
        map: persisted && typeof persisted === "object" ? (persisted as DefaultsMap) : {},
      }),
    }),
  ),
);

hydrateWhenReady(useToolsSettings);

export function getToolDefault(org: string, product: string, toolId: string): string {
  const key = `${org}/${product}`;
  return (
    useToolsSettings.getState().map[key]?.[toolId] ?? BUILTIN_DEFAULTS[toolId as ToolTab] ?? "env"
  );
}

export function setToolDefault(org: string, product: string, toolId: string, ctxId: string): void {
  useToolsSettings.getState().setDefault(org, product, toolId, ctxId);
}
