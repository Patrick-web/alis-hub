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
  | 'Release Readiness'
  | 'AI Insights'
  | 'Tools';

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
  {
    id: 'packages-installed-commit',
    category: 'Build & Deploy',
    title: 'Suggest commit after package install',
    description: 'After packages install successfully, suggest committing the updated files.',
    enabled: true,
  },
  {
    id: 'git-pull-define-upgrade',
    category: 'Define',
    title: 'Suggest package install after define repo pull',
    description: 'When new commits are pulled on the define repo, suggest installing packages.',
    enabled: true,
  },
  {
    id: 'git-pull-build-upgrade',
    category: 'Build & Deploy',
    title: 'Suggest package install after build repo pull with dependency changes',
    description: 'When a build repo pull includes dependency files (go.mod, package.json, etc.), suggest installing packages.',
    enabled: true,
  },
  {
    id: 'ai-contextual-insight',
    category: 'AI Insights',
    title: 'AI contextual suggestions',
    description: 'Generate context-aware next-step suggestions using your local Gemma model after key events.',
    enabled: true,
  },
  {
    id: 'spanner-rw-transaction',
    category: 'Tools',
    title: 'Spanner read-write transaction mode',
    description: 'Execute DML in a read-write transaction that holds changes open until you choose to commit or rollback.',
    enabled: true,
  },
];

export const SUGGESTION_CATEGORY_ORDER: SuggestionCategory[] = [
  'Build & Deploy',
  'Define',
  'Environment Hygiene',
  'Release Readiness',
  'AI Insights',
  'Tools',
];

interface LabsState {
  masterEnabled: boolean;
  enabledMap: Record<string, boolean>;
  workflowsEnabled: boolean;
}

type LabsAction =
  | { type: 'SET_MASTER'; payload: boolean }
  | { type: 'SET_SUGGESTION'; payload: { id: string; enabled: boolean } }
  | { type: 'SET_WORKFLOWS'; payload: boolean };

interface LabsContextValue {
  state: LabsState;
  isSuggestionEnabled: (id: string) => boolean;
  setSuggestionEnabled: (id: string, enabled: boolean) => void;
  setMasterEnabled: (enabled: boolean) => void;
  setWorkflowsEnabled: (enabled: boolean) => void;
}

const STORAGE_KEY = 'alis:labs';

const DEFAULT_STATE: LabsState = { masterEnabled: true, enabledMap: {}, workflowsEnabled: false };

function loadFromStorage(): LabsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
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
    case 'SET_WORKFLOWS':
      return { ...state, workflowsEnabled: action.payload };
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

  const setWorkflowsEnabled = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_WORKFLOWS', payload: enabled });
  }, []);

  return (
    <LabsContext.Provider value={{ state, isSuggestionEnabled, setSuggestionEnabled, setMasterEnabled, setWorkflowsEnabled }}>
      {children}
    </LabsContext.Provider>
  );
}

export function useLabs() {
  const ctx = useContext(LabsContext);
  if (!ctx) throw new Error('useLabs must be used within LabsProvider');
  return ctx;
}
