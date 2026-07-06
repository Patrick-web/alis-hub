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
  fetchIntervalMinutes: number;
}

type SourceControlAction =
  | { type: 'SET_FILE_LIST_VIEW'; payload: 'list' | 'tree' }
  | { type: 'SET_DIFF_VIEW'; payload: 'unified' | 'split' }
  | { type: 'SET_FETCH_INTERVAL'; payload: number };

interface SourceControlContextValue {
  state: SourceControlState;
  setFileListView: (view: 'list' | 'tree') => void;
  setDiffView: (view: 'unified' | 'split') => void;
  setFetchIntervalMinutes: (minutes: number) => void;
}

const STORAGE_KEY = 'alis:source-control';

const DEFAULT_STATE: SourceControlState = {
  fileListView: 'list',
  diffView: 'unified',
  fetchIntervalMinutes: 5,
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
    case 'SET_FETCH_INTERVAL':
      return { ...state, fetchIntervalMinutes: action.payload };
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

  const setFetchIntervalMinutes = useCallback((minutes: number) => {
    dispatch({ type: 'SET_FETCH_INTERVAL', payload: minutes });
  }, []);

  return (
    <SourceControlContext.Provider value={{ state, setFileListView, setDiffView, setFetchIntervalMinutes }}>
      {children}
    </SourceControlContext.Provider>
  );
}

export function useSourceControl(): SourceControlContextValue {
  const ctx = useContext(SourceControlContext);
  if (!ctx) throw new Error('useSourceControl must be used within SourceControlProvider');
  return ctx;
}
