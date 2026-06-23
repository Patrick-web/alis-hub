import {
  createContext,
  useContext,
  useCallback,
  useReducer,
  useEffect,
  type ReactNode,
} from 'react';

interface SourceControlState {
  fileListView: 'list' | 'tree';
  diffView: 'unified' | 'split';
}

type SourceControlAction =
  | { type: 'SET_FILE_LIST_VIEW'; payload: 'list' | 'tree' }
  | { type: 'SET_DIFF_VIEW'; payload: 'unified' | 'split' };

interface SourceControlContextValue {
  state: SourceControlState;
  setFileListView: (view: 'list' | 'tree') => void;
  setDiffView: (view: 'unified' | 'split') => void;
}

const STORAGE_KEY = 'alis:source-control';

const DEFAULT_STATE: SourceControlState = {
  fileListView: 'list',
  diffView: 'unified',
};

function loadFromStorage(): SourceControlState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveToStorage(state: SourceControlState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function reducer(state: SourceControlState, action: SourceControlAction): SourceControlState {
  switch (action.type) {
    case 'SET_FILE_LIST_VIEW':
      return { ...state, fileListView: action.payload };
    case 'SET_DIFF_VIEW':
      return { ...state, diffView: action.payload };
    default:
      return state;
  }
}

const SourceControlContext = createContext<SourceControlContextValue | null>(null);

export function SourceControlProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadFromStorage);

  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  const setFileListView = useCallback((view: 'list' | 'tree') => {
    dispatch({ type: 'SET_FILE_LIST_VIEW', payload: view });
  }, []);

  const setDiffView = useCallback((view: 'unified' | 'split') => {
    dispatch({ type: 'SET_DIFF_VIEW', payload: view });
  }, []);

  return (
    <SourceControlContext.Provider value={{ state, setFileListView, setDiffView }}>
      {children}
    </SourceControlContext.Provider>
  );
}

export function useSourceControl(): SourceControlContextValue {
  const ctx = useContext(SourceControlContext);
  if (!ctx) throw new Error('useSourceControl must be used within SourceControlProvider');
  return ctx;
}
