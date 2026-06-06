import { createContext, useContext, useCallback, useState, type ReactNode } from 'react';

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

export interface WorkspaceState {
  organisation: string;
  organisationDisplayName: string;
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
}

type WorkspaceAction =
  | { type: 'SET_WORKSPACE'; payload: Partial<WorkspaceState> }
  | { type: 'SET_NEURONS'; payload: Neuron[] }
  | { type: 'SET_ENVIRONMENTS'; payload: Environment[] }
  | { type: 'SET_ACTIVE_NEURONS'; payload: string[] }
  | { type: 'SET_ENVIRONMENT'; payload: string };

function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'SET_WORKSPACE':
      return { ...state, ...action.payload };
    case 'SET_NEURONS':
      return { ...state, neurons: action.payload };
    case 'SET_ENVIRONMENTS':
      return { ...state, environments: action.payload };
    case 'SET_ACTIVE_NEURONS':
      return { ...state, activeNeuronIds: action.payload };
    case 'SET_ENVIRONMENT':
      return { ...state, environment: action.payload };
    default:
      return state;
  }
}

export const defaultWorkspace: WorkspaceState = {
  organisation: 'voyage',
  organisationDisplayName: 'Voyage',
  product: 'vp',
  productDisplayName: 'Voyage Platform',
  environment: 'production',
  environmentDisplayName: 'Production',
  environmentGoogleProjectId: 'voyage-vp-prod',
  environmentGoogleRegion: 'us-east4',
  rootDirectory: '/Users/jp/alis.build/voyage/build/vp',
  neurons: [
    { id: '1', name: 'bookings-v1', type: 2, state: 1, latestBuild: '1.0.167', envs: [] },
    { id: '2', name: 'bundles-v1', type: 2, state: 1, latestBuild: '1.0.167', envs: [] },
    { id: '3', name: 'charters-v1', type: 2, state: 1, latestBuild: '1.0.167', envs: [] },
    { id: '4', name: 'chartertypes-v1', type: 2, state: 1, latestBuild: '1.0.167', envs: [] },
    { id: '5', name: 'commissions-v1', type: 2, state: 1, latestBuild: '1.0.167', envs: [] },
    { id: '6', name: 'iam-v1', type: 2, state: 1, latestBuild: '1.0.167', envs: [] },
    { id: '7', name: 'products-v1', type: 2, state: 1, latestBuild: '1.0.167', envs: [] },
    { id: '8', name: 'packages-v1', type: 2, state: 1, latestBuild: '1.0.167', envs: [] },
    { id: '9', name: 'pricingrules-v1', type: 2, state: 1, latestBuild: '1.0.167', envs: [] },
    { id: '10', name: 'yachts-v1', type: 2, state: 1, latestBuild: '1.0.167', envs: [] },
    { id: '11', name: 'yachtowners-v1', type: 2, state: 1, latestBuild: '1.0.167', envs: [] },
    { id: '12', name: 'experiences-v1', type: 2, state: 1, latestBuild: '1.0.167', envs: [] },
    { id: '13', name: 'bff-v1', type: 2, state: 1, latestBuild: '1.0.167', envs: [] },
    { id: '14', name: 'customerportal-v2', type: 1, state: 1, latestBuild: '1.0.167', envs: [] },
    { id: '15', name: 'console-v2', type: 1, state: 1, latestBuild: '1.0.167', envs: [] },
    { id: '16', name: 'hubspot-v1', type: 2, state: 1, latestBuild: '1.0.167', envs: [] },
    { id: '17', name: 'payments-v2', type: 2, state: 1, latestBuild: '1.0.167', envs: [] },
    { id: '18', name: 'leads-v1', type: 2, state: 1, latestBuild: '1.0.167', envs: [] },
    { id: '19', name: 'sendgrid-v1', type: 2, state: 1, latestBuild: '1.0.167', envs: [] },
    { id: '20', name: 'referrals-v1', type: 2, state: 1, latestBuild: '1.0.167', envs: [] },
  ],
  activeNeuronIds: [],
  environments: [
    { id: 'prod', name: 'Production', type: 'prod', googleProjectId: 'voyage-vp-prod', googleRegion: 'us-east4' },
    { id: 'staging', name: 'Staging', type: 'staging', googleProjectId: 'voyage-vp-staging', googleRegion: 'us-east4' },
    { id: 'dev', name: 'Development', type: 'dev', googleProjectId: 'voyage-vp-dev', googleRegion: 'us-east4' },
  ],
};

interface WorkspaceContextValue {
  state: WorkspaceState;
  setNeurons: (neurons: Neuron[]) => void;
  setActiveNeurons: (ids: string[]) => void;
  setEnvironment: (envId: string) => void;
  updateWorkspace: (partial: Partial<WorkspaceState>) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>(defaultWorkspace);

  const dispatch = useCallback((action: WorkspaceAction) => {
    setState(prev => workspaceReducer(prev, action));
  }, []);

  const setNeurons = useCallback((neurons: Neuron[]) => {
    dispatch({ type: 'SET_NEURONS', payload: neurons });
  }, [dispatch]);

  const setActiveNeurons = useCallback((ids: string[]) => {
    dispatch({ type: 'SET_ACTIVE_NEURONS', payload: ids });
  }, [dispatch]);

  const setEnvironment = useCallback((envId: string) => {
    dispatch({ type: 'SET_ENVIRONMENT', payload: envId });
  }, [dispatch]);

  const updateWorkspace = useCallback((partial: Partial<WorkspaceState>) => {
    dispatch({ type: 'SET_WORKSPACE', payload: partial });
  }, [dispatch]);

  return (
    <WorkspaceContext.Provider value={{ state, setNeurons, setActiveNeurons, setEnvironment, updateWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
}
