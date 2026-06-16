import { createContext, useContext, useCallback, useState, type ReactNode } from 'react';

export type AppPhase = 'init' | 'login' | 'hub' | 'picking-org' | 'picking-product' | 'workspace' | 'standalone';

export interface RecentLandingZone {
  org: string;
  orgDisplayName: string;
  product: string;
  productDisplayName: string;
}

export interface Organisation {
  name: string;
  displayName: string;
  description: string;
  logo: string;
  account: string;
}

export interface Neuron {
  id: string;
  name: string;
  type: number;
  state: number;
  latestBuild: string;
  envs: { name: string; value: string; description?: string; optional?: boolean }[];
}

export interface Environment {
  id: string;
  name: string;
  type: 'dev' | 'staging' | 'prod';
  googleProjectId: string;
  googleRegion: string;
}

export interface LoadedEnv {
  name: string;        // full resource name e.g. organisations/voyage/products/vp/environments/...
  displayName: string; // e.g. "Production"
  state: number;
  envType?: number;    // 1=DEV, 2=STAGING, 3=PROD
}

export interface WorkspaceState {
  phase: AppPhase;
  recentLandingZone: RecentLandingZone | null;
  organisation: string;
  organisationDisplayName: string;
  selectedOrg: Organisation | null;
  product: string;
  productDisplayName: string;
  environment: string;
  environmentDisplayName: string;
  environmentGoogleProjectId: string;
  environmentGoogleRegion: string;
  rootDirectory: string;
  neurons: Neuron[];
  environments: Environment[];
  activeNeuronIds: string[];
  loadedEnvs: LoadedEnv[];
  activeEnvName: string;
  envsError: string | null;
}

type WorkspaceAction =
  | { type: 'SET_PHASE'; payload: AppPhase }
  | { type: 'SET_WORKSPACE'; payload: Partial<WorkspaceState> }
  | { type: 'SET_ORG'; payload: Organisation }
  | { type: 'SET_PRODUCT'; payload: { org: string; orgDisplayName: string; product: string; productDisplayName: string } }
  | { type: 'SET_NEURONS'; payload: Neuron[] }
  | { type: 'SET_ENVIRONMENTS'; payload: Environment[] }
  | { type: 'SET_ACTIVE_NEURONS'; payload: string[] }
  | { type: 'SET_ENVIRONMENT'; payload: string }
  | { type: 'SET_LOADED_ENVS'; payload: LoadedEnv[] }
  | { type: 'SET_ACTIVE_ENV'; payload: string };

function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.payload };
    case 'SET_WORKSPACE':
      return { ...state, ...action.payload };
    case 'SET_ORG':
      return { ...state, selectedOrg: action.payload, phase: 'picking-product' };
    case 'SET_PRODUCT': {
      const recent: RecentLandingZone = {
        org: action.payload.org,
        orgDisplayName: action.payload.orgDisplayName,
        product: action.payload.product,
        productDisplayName: action.payload.productDisplayName,
      };
      try { localStorage.setItem('alis:recentLandingZone', JSON.stringify(recent)); } catch {}
      return {
        ...state,
        organisation: action.payload.org,
        organisationDisplayName: action.payload.orgDisplayName,
        product: action.payload.product,
        productDisplayName: action.payload.productDisplayName,
        phase: 'workspace',
        recentLandingZone: recent,
        environment: initialState.environment,
        environmentDisplayName: initialState.environmentDisplayName,
        environmentGoogleProjectId: '',
        environmentGoogleRegion: '',
        rootDirectory: '',
        neurons: [],
        environments: [],
        activeNeuronIds: [],
        loadedEnvs: [],
        activeEnvName: '',
        envsError: null,
      };
    }
    case 'SET_NEURONS':
      return { ...state, neurons: action.payload };
    case 'SET_ENVIRONMENTS':
      return { ...state, environments: action.payload };
    case 'SET_ACTIVE_NEURONS':
      return { ...state, activeNeuronIds: action.payload };
    case 'SET_ENVIRONMENT':
      return { ...state, environment: action.payload };
    case 'SET_LOADED_ENVS':
      return { ...state, loadedEnvs: action.payload };
    case 'SET_ACTIVE_ENV':
      return { ...state, activeEnvName: action.payload };
    default:
      return state;
  }
}

const savedRecentLandingZone = (() => {
  try {
    const raw = localStorage.getItem('alis:recentLandingZone');
    return raw ? (JSON.parse(raw) as RecentLandingZone) : null;
  } catch { return null; }
})();

const initialState: WorkspaceState = {
  phase: 'init',
  recentLandingZone: savedRecentLandingZone,
  organisation: '',
  organisationDisplayName: '',
  selectedOrg: null,
  product: '',
  productDisplayName: '',
  environment: 'production',
  environmentDisplayName: 'Production',
  environmentGoogleProjectId: '',
  environmentGoogleRegion: '',
  rootDirectory: '',
  neurons: [],
  activeNeuronIds: [],
  environments: [],
  loadedEnvs: [],
  activeEnvName: '',
  envsError: null,
};

interface WorkspaceContextValue {
  state: WorkspaceState;
  setPhase: (phase: AppPhase) => void;
  setOrg: (org: Organisation) => void;
  setProduct: (org: string, orgDisplayName: string, product: string, productDisplayName: string) => void;
  setNeurons: (neurons: Neuron[]) => void;
  setActiveNeurons: (ids: string[]) => void;
  setEnvironment: (envId: string) => void;
  setLoadedEnvs: (envs: LoadedEnv[]) => void;
  setActiveEnv: (envName: string) => void;
  updateWorkspace: (partial: Partial<WorkspaceState>) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>(initialState);

  const dispatch = useCallback((action: WorkspaceAction) => {
    setState(prev => workspaceReducer(prev, action));
  }, []);

  const setPhase = useCallback((phase: AppPhase) => dispatch({ type: 'SET_PHASE', payload: phase }), [dispatch]);
  const setOrg = useCallback((org: Organisation) => dispatch({ type: 'SET_ORG', payload: org }), [dispatch]);
  const setProduct = useCallback((org: string, orgDisplayName: string, product: string, productDisplayName: string) => {
    dispatch({ type: 'SET_PRODUCT', payload: { org, orgDisplayName, product, productDisplayName } });
  }, [dispatch]);
  const setNeurons = useCallback((neurons: Neuron[]) => dispatch({ type: 'SET_NEURONS', payload: neurons }), [dispatch]);
  const setActiveNeurons = useCallback((ids: string[]) => dispatch({ type: 'SET_ACTIVE_NEURONS', payload: ids }), [dispatch]);
  const setEnvironment = useCallback((envId: string) => dispatch({ type: 'SET_ENVIRONMENT', payload: envId }), [dispatch]);
  const setLoadedEnvs = useCallback((envs: LoadedEnv[]) => dispatch({ type: 'SET_LOADED_ENVS', payload: envs }), [dispatch]);
  const setActiveEnv = useCallback((envName: string) => dispatch({ type: 'SET_ACTIVE_ENV', payload: envName }), [dispatch]);
  const updateWorkspace = useCallback((partial: Partial<WorkspaceState>) => dispatch({ type: 'SET_WORKSPACE', payload: partial }), [dispatch]);

  return (
    <WorkspaceContext.Provider value={{ state, setPhase, setOrg, setProduct, setNeurons, setActiveNeurons, setEnvironment, setLoadedEnvs, setActiveEnv, updateWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within a WorkspaceProvider');
  return ctx;
}
