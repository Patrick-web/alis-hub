import {
  createContext,
  useContext,
  useCallback,
  useReducer,
  useEffect,
  type ReactNode,
} from 'react';
import { useWorkspace } from './workspace';
import * as settingsClient from '../lib/settingsClient';

export interface ProtectedEnvSettings {
  protectedEnvNames: string[];
}

const DEFAULT_PRODUCT_SETTINGS: ProtectedEnvSettings = {
  protectedEnvNames: [],
};

type ProtectedEnvironmentsMap = Record<string, ProtectedEnvSettings>;

type ProtectedEnvironmentsAction = {
  type: 'TOGGLE_PROTECTED';
  key: string;
  payload: string;
};

interface ProtectedEnvironmentsContextValue {
  protectedEnvNames: string[];
  isProtected: (envName: string) => boolean;
  toggleProtected: (envName: string) => void;
}

const STORAGE_KEY = 'alis:protected-environments';

function loadFromStorage(): ProtectedEnvironmentsMap {
  try {
    const raw = settingsClient.getCached(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ProtectedEnvironmentsMap;
  } catch {
    return {};
  }
}

function saveToStorage(map: ProtectedEnvironmentsMap) {
  settingsClient.set(STORAGE_KEY, JSON.stringify(map));
}

function reducer(state: ProtectedEnvironmentsMap, action: ProtectedEnvironmentsAction): ProtectedEnvironmentsMap {
  const prev = state[action.key] ?? DEFAULT_PRODUCT_SETTINGS;
  switch (action.type) {
    case 'TOGGLE_PROTECTED': {
      const isCurrentlyProtected = prev.protectedEnvNames.includes(action.payload);
      const protectedEnvNames = isCurrentlyProtected
        ? prev.protectedEnvNames.filter(name => name !== action.payload)
        : [...prev.protectedEnvNames, action.payload];
      return { ...state, [action.key]: { ...prev, protectedEnvNames } };
    }
    default:
      return state;
  }
}

const ProtectedEnvironmentsContext = createContext<ProtectedEnvironmentsContextValue | null>(null);

export function ProtectedEnvironmentsProvider({ children }: { children: ReactNode }) {
  const { state: workspace } = useWorkspace();
  const [map, dispatch] = useReducer(reducer, undefined, loadFromStorage);

  useEffect(() => {
    saveToStorage(map);
  }, [map]);

  const key = `${workspace.organisation}/${workspace.product}`;
  const settings: ProtectedEnvSettings = map[key] ?? DEFAULT_PRODUCT_SETTINGS;

  const toggleProtected = useCallback((envName: string) => {
    dispatch({ type: 'TOGGLE_PROTECTED', key, payload: envName });
  }, [key]);

  const isProtected = useCallback((envName: string) => {
    return settings.protectedEnvNames.includes(envName);
  }, [settings.protectedEnvNames]);

  return (
    <ProtectedEnvironmentsContext.Provider value={{
      protectedEnvNames: settings.protectedEnvNames,
      isProtected,
      toggleProtected,
    }}>
      {children}
    </ProtectedEnvironmentsContext.Provider>
  );
}

export function useProtectedEnvironments(): ProtectedEnvironmentsContextValue {
  const ctx = useContext(ProtectedEnvironmentsContext);
  if (!ctx) throw new Error('useProtectedEnvironments must be used within ProtectedEnvironmentsProvider');
  return ctx;
}
