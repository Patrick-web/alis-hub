import { useCallback } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useWorkspace } from "./workspace";
import { hydrateWhenReady, persistSqlite } from "./lib/persistSqlite";

export interface ProtectedEnvSettings {
  protectedEnvNames: string[];
}

const DEFAULT_PRODUCT_SETTINGS: ProtectedEnvSettings = {
  protectedEnvNames: [],
};

type ProtectedEnvironmentsMap = Record<string, ProtectedEnvSettings>;

interface ProtectedEnvironmentsStore {
  map: ProtectedEnvironmentsMap;
  toggle: (key: string, envName: string) => void;
}

export const useProtectedEnvironmentsStore = create<ProtectedEnvironmentsStore>()(
  persist(
    (set) => ({
      map: {},
      toggle: (key, envName) =>
        set((s) => {
          const prev = s.map[key] ?? DEFAULT_PRODUCT_SETTINGS;
          const isCurrentlyProtected = prev.protectedEnvNames.includes(envName);
          const protectedEnvNames = isCurrentlyProtected
            ? prev.protectedEnvNames.filter((name) => name !== envName)
            : [...prev.protectedEnvNames, envName];
          return { map: { ...s.map, [key]: { ...prev, protectedEnvNames } } };
        }),
    }),
    persistSqlite<ProtectedEnvironmentsStore, ProtectedEnvironmentsMap>({
      key: "alis:protected-environments",
      partialize: (s) => s.map,
      merge: (persisted, current) => ({
        ...current,
        map:
          persisted && typeof persisted === "object" ? (persisted as ProtectedEnvironmentsMap) : {},
      }),
    }),
  ),
);

hydrateWhenReady(useProtectedEnvironmentsStore);

interface ProtectedEnvironmentsValue {
  protectedEnvNames: string[];
  isProtected: (envName: string) => boolean;
  toggleProtected: (envName: string) => void;
}

/** Protected environments scoped to the active workspace (org/product). */
export function useProtectedEnvironments(): ProtectedEnvironmentsValue {
  const { state: workspace } = useWorkspace();
  const key = `${workspace.organisation}/${workspace.product}`;
  const protectedEnvNames =
    useProtectedEnvironmentsStore((s) => s.map[key]?.protectedEnvNames) ??
    DEFAULT_PRODUCT_SETTINGS.protectedEnvNames;
  const toggle = useProtectedEnvironmentsStore((s) => s.toggle);

  const isProtected = useCallback(
    (envName: string) => protectedEnvNames.includes(envName),
    [protectedEnvNames],
  );
  const toggleProtected = useCallback((envName: string) => toggle(key, envName), [key, toggle]);

  return { protectedEnvNames, isProtected, toggleProtected };
}
