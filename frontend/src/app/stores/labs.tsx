import {
  createContext,
  useContext,
  useCallback,
  useReducer,
  useEffect,
  type ReactNode,
} from 'react';

export type SuggestionCategory =
  | 'Build & Deploy'
  | 'Define'
  | 'Environment Hygiene'
  | 'Release Readiness';

export interface SuggestionDefinition {
  id: string;
  category: SuggestionCategory;
  title: string;
  description: string;
  enabled: boolean;
}

export const SUGGESTION_REGISTRY: SuggestionDefinition[] = [
  {
    id: 'build-success-deploy',
    category: 'Build & Deploy',
    title: 'Suggest deploy after build',
    description: 'When a build completes successfully, suggest deploying to dev.',
    enabled: true,
  },
  {
    id: 'build-failure-verbose',
    category: 'Build & Deploy',
    title: 'Suggest verbose re-run on failure',
    description: 'When a build fails, offer to re-run with verbose output.',
    enabled: true,
  },
];

export const SUGGESTION_CATEGORY_ORDER: SuggestionCategory[] = [
  'Build & Deploy',
  'Define',
  'Environment Hygiene',
  'Release Readiness',
];

interface LabsState {
  masterEnabled: boolean;
  enabledMap: Record<string, boolean>;
}

type LabsAction =
  | { type: 'SET_MASTER'; payload: boolean }
  | { type: 'SET_SUGGESTION'; payload: { id: string; enabled: boolean } };

interface LabsContextValue {
  state: LabsState;
  isSuggestionEnabled: (id: string) => boolean;
  setSuggestionEnabled: (id: string, enabled: boolean) => void;
  setMasterEnabled: (enabled: boolean) => void;
}

const STORAGE_KEY = 'alis:labs';

function loadFromStorage(): LabsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { masterEnabled: true, enabledMap: {} };
    return JSON.parse(raw);
  } catch {
    return { masterEnabled: true, enabledMap: {} };
  }
}

function saveToStorage(state: LabsState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function reducer(state: LabsState, action: LabsAction): LabsState {
  switch (action.type) {
    case 'SET_MASTER':
      return { ...state, masterEnabled: action.payload };
    case 'SET_SUGGESTION':
      return {
        ...state,
        enabledMap: { ...state.enabledMap, [action.payload.id]: action.payload.enabled },
      };
    default:
      return state;
  }
}

const LabsContext = createContext<LabsContextValue | null>(null);

export function LabsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadFromStorage);

  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  const isSuggestionEnabled = useCallback(
    (id: string) => {
      if (!state.masterEnabled) return false;
      const override = state.enabledMap[id];
      if (override !== undefined) return override;
      return SUGGESTION_REGISTRY.find(d => d.id === id)?.enabled ?? false;
    },
    [state],
  );

  const setSuggestionEnabled = useCallback((id: string, enabled: boolean) => {
    dispatch({ type: 'SET_SUGGESTION', payload: { id, enabled } });
  }, []);

  const setMasterEnabled = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_MASTER', payload: enabled });
  }, []);

  return (
    <LabsContext.Provider value={{ state, isSuggestionEnabled, setSuggestionEnabled, setMasterEnabled }}>
      {children}
    </LabsContext.Provider>
  );
}

export function useLabs() {
  const ctx = useContext(LabsContext);
  if (!ctx) throw new Error('useLabs must be used within LabsProvider');
  return ctx;
}
