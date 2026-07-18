import {
  createContext,
  useContext,
  useCallback,
  useReducer,
  useEffect,
  type ReactNode,
} from "react";
import { useWorkspace } from "./workspace";
import * as settingsClient from "../lib/settingsClient";

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

type DevelopSettingsAction =
  | { type: "SET_IGNORE_HIDDEN"; key: string; payload: boolean }
  | { type: "SET_IGNORED_PATTERNS"; key: string; payload: string[] }
  | { type: "SET_DEFAULT_BRANCH"; key: string; payload: string }
  | { type: "SET_SMART_SORT_ENABLED"; key: string; payload: boolean }
  | { type: "SET_SMART_SORT_KEY"; key: string; payload: SmartSortKey };

interface DevelopSettingsContextValue {
  settings: ProductDevelopSettings;
  setIgnoreHiddenFolders: (v: boolean) => void;
  setIgnoredFolderPatterns: (v: string[]) => void;
  setDefaultBranch: (v: string) => void;
  setSmartSortEnabled: (v: boolean) => void;
  setSmartSortKey: (v: SmartSortKey) => void;
}

const STORAGE_KEY = "alis:develop-settings";

function loadFromStorage(): DevelopSettingsMap {
  try {
    const raw = settingsClient.getCached(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as DevelopSettingsMap;
  } catch {
    return {};
  }
}

function saveToStorage(map: DevelopSettingsMap) {
  settingsClient.set(STORAGE_KEY, JSON.stringify(map));
}

function reducer(state: DevelopSettingsMap, action: DevelopSettingsAction): DevelopSettingsMap {
  const prev = state[action.key] ?? DEFAULT_PRODUCT_SETTINGS;
  switch (action.type) {
    case "SET_IGNORE_HIDDEN":
      return { ...state, [action.key]: { ...prev, ignoreHiddenFolders: action.payload } };
    case "SET_IGNORED_PATTERNS":
      return { ...state, [action.key]: { ...prev, ignoredFolderPatterns: action.payload } };
    case "SET_DEFAULT_BRANCH":
      return { ...state, [action.key]: { ...prev, defaultBranch: action.payload } };
    case "SET_SMART_SORT_ENABLED":
      return { ...state, [action.key]: { ...prev, smartSortEnabled: action.payload } };
    case "SET_SMART_SORT_KEY":
      return { ...state, [action.key]: { ...prev, smartSortKey: action.payload } };
    default:
      return state;
  }
}

const DevelopSettingsContext = createContext<DevelopSettingsContextValue | null>(null);

export function DevelopSettingsProvider({ children }: { children: ReactNode }) {
  const { state: workspace } = useWorkspace();
  const [map, dispatch] = useReducer(reducer, undefined, loadFromStorage);

  useEffect(() => {
    saveToStorage(map);
  }, [map]);

  const key = `${workspace.organisation}/${workspace.product}`;
  const settings: ProductDevelopSettings = map[key] ?? DEFAULT_PRODUCT_SETTINGS;

  const setIgnoreHiddenFolders = useCallback(
    (v: boolean) => {
      dispatch({ type: "SET_IGNORE_HIDDEN", key, payload: v });
    },
    [key],
  );

  const setIgnoredFolderPatterns = useCallback(
    (v: string[]) => {
      dispatch({ type: "SET_IGNORED_PATTERNS", key, payload: v });
    },
    [key],
  );

  const setDefaultBranch = useCallback(
    (v: string) => {
      dispatch({ type: "SET_DEFAULT_BRANCH", key, payload: v });
    },
    [key],
  );

  const setSmartSortEnabled = useCallback(
    (v: boolean) => {
      dispatch({ type: "SET_SMART_SORT_ENABLED", key, payload: v });
    },
    [key],
  );

  const setSmartSortKey = useCallback(
    (v: SmartSortKey) => {
      dispatch({ type: "SET_SMART_SORT_KEY", key, payload: v });
    },
    [key],
  );

  return (
    <DevelopSettingsContext.Provider
      value={{
        settings,
        setIgnoreHiddenFolders,
        setIgnoredFolderPatterns,
        setDefaultBranch,
        setSmartSortEnabled,
        setSmartSortKey,
      }}
    >
      {children}
    </DevelopSettingsContext.Provider>
  );
}

export function useDevelopSettings(): DevelopSettingsContextValue {
  const ctx = useContext(DevelopSettingsContext);
  if (!ctx) throw new Error("useDevelopSettings must be used within DevelopSettingsProvider");
  return ctx;
}
