import { useCallback } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useWorkspace } from "./workspace";
import { hydrateWhenReady, persistSqlite } from "./lib/persistSqlite";

export type SmartSortKey = "defined" | "built" | "deployed" | "committed";

export interface ProductDevelopSettings {
  ignoreHiddenFolders: boolean;
  ignoredFolderPatterns: string[];
  defaultBranch: string;
  smartSortEnabled: boolean;
  smartSortKey: SmartSortKey;
}

const DEFAULT_PRODUCT_SETTINGS: ProductDevelopSettings = {
  ignoreHiddenFolders: true,
  ignoredFolderPatterns: [],
  defaultBranch: "local",
  smartSortEnabled: false,
  smartSortKey: "built",
};

type DevelopSettingsMap = Record<string, ProductDevelopSettings>;

interface DevelopSettingsStore {
  map: DevelopSettingsMap;
  update: (key: string, patch: Partial<ProductDevelopSettings>) => void;
}

export const useDevelopSettingsStore = create<DevelopSettingsStore>()(
  persist(
    (set) => ({
      map: {},
      update: (key, patch) =>
        set((s) => ({
          map: {
            ...s.map,
            [key]: { ...DEFAULT_PRODUCT_SETTINGS, ...s.map[key], ...patch },
          },
        })),
    }),
    persistSqlite<DevelopSettingsStore, DevelopSettingsMap>({
      key: "alis:develop-settings",
      partialize: (s) => s.map,
      merge: (persisted, current) => ({
        ...current,
        map: persisted && typeof persisted === "object" ? (persisted as DevelopSettingsMap) : {},
      }),
    }),
  ),
);

hydrateWhenReady(useDevelopSettingsStore);

interface DevelopSettingsValue {
  settings: ProductDevelopSettings;
  setIgnoreHiddenFolders: (v: boolean) => void;
  setIgnoredFolderPatterns: (v: string[]) => void;
  setDefaultBranch: (v: string) => void;
  setSmartSortEnabled: (v: boolean) => void;
  setSmartSortKey: (v: SmartSortKey) => void;
}

/** Develop settings scoped to the active workspace (org/product). */
export function useDevelopSettings(): DevelopSettingsValue {
  const { state: workspace } = useWorkspace();
  const key = `${workspace.organisation}/${workspace.product}`;
  const settings = useDevelopSettingsStore((s) => s.map[key]) ?? DEFAULT_PRODUCT_SETTINGS;
  const update = useDevelopSettingsStore((s) => s.update);

  const setIgnoreHiddenFolders = useCallback(
    (v: boolean) => update(key, { ignoreHiddenFolders: v }),
    [key, update],
  );
  const setIgnoredFolderPatterns = useCallback(
    (v: string[]) => update(key, { ignoredFolderPatterns: v }),
    [key, update],
  );
  const setDefaultBranch = useCallback(
    (v: string) => update(key, { defaultBranch: v }),
    [key, update],
  );
  const setSmartSortEnabled = useCallback(
    (v: boolean) => update(key, { smartSortEnabled: v }),
    [key, update],
  );
  const setSmartSortKey = useCallback(
    (v: SmartSortKey) => update(key, { smartSortKey: v }),
    [key, update],
  );

  return {
    settings,
    setIgnoreHiddenFolders,
    setIgnoredFolderPatterns,
    setDefaultBranch,
    setSmartSortEnabled,
    setSmartSortKey,
  };
}
