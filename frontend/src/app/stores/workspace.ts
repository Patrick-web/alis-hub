import { create } from "zustand";
import * as settingsClient from "../lib/settingsClient";
import { onSettingsReady } from "./lib/persistSqlite";

export type AppPhase =
  "init" | "login" | "hub" | "picking-org" | "picking-product" | "workspace" | "standalone";

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
  type: "dev" | "staging" | "prod";
  googleProjectId: string;
  googleRegion: string;
}

export interface LoadedEnv {
  name: string; // full resource name e.g. organisations/voyage/products/vp/environments/...
  displayName: string; // e.g. "Production"
  state: number;
  envType?: number; // 1=DEV, 2=STAGING, 3=PROD
  gcpProjectId?: string;
  gcpProjectNumber?: string;
  gcpRegion?: string;
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

interface WorkspaceStore {
  state: WorkspaceState;
  setPhase: (phase: AppPhase) => void;
  setOrg: (org: Organisation) => void;
  setProduct: (
    org: string,
    orgDisplayName: string,
    product: string,
    productDisplayName: string,
  ) => void;
  setNeurons: (neurons: Neuron[]) => void;
  setActiveNeurons: (ids: string[]) => void;
  setEnvironment: (envId: string) => void;
  setLoadedEnvs: (envs: LoadedEnv[]) => void;
  setActiveEnv: (envName: string) => void;
  updateWorkspace: (partial: Partial<WorkspaceState>) => void;
}

const INITIAL_STATE: WorkspaceState = {
  phase: "init",
  recentLandingZone: null,
  organisation: "",
  organisationDisplayName: "",
  selectedOrg: null,
  product: "",
  productDisplayName: "",
  environment: "production",
  environmentDisplayName: "Production",
  environmentGoogleProjectId: "",
  environmentGoogleRegion: "",
  rootDirectory: "",
  neurons: [],
  activeNeuronIds: [],
  environments: [],
  loadedEnvs: [],
  activeEnvName: "",
  envsError: null,
};

export const useWorkspace = create<WorkspaceStore>((set) => ({
  state: INITIAL_STATE,
  setPhase: (phase) => set((s) => ({ state: { ...s.state, phase } })),
  setOrg: (org) =>
    set((s) => ({ state: { ...s.state, selectedOrg: org, phase: "picking-product" } })),
  setProduct: (org, orgDisplayName, product, productDisplayName) => {
    const recent: RecentLandingZone = { org, orgDisplayName, product, productDisplayName };
    settingsClient.set("alis:recentLandingZone", JSON.stringify(recent));
    settingsClient.set("alis:activeEnvName", "");
    set((s) => ({
      state: {
        ...s.state,
        organisation: org,
        organisationDisplayName: orgDisplayName,
        product,
        productDisplayName,
        phase: "workspace",
        recentLandingZone: recent,
        environment: "production",
        environmentDisplayName: "Production",
        environmentGoogleProjectId: "",
        environmentGoogleRegion: "",
        rootDirectory: "",
        neurons: [],
        environments: [],
        activeNeuronIds: [],
        loadedEnvs: [],
        activeEnvName: "",
        envsError: null,
      },
    }));
  },
  setNeurons: (neurons) => set((s) => ({ state: { ...s.state, neurons } })),
  setActiveNeurons: (activeNeuronIds) => set((s) => ({ state: { ...s.state, activeNeuronIds } })),
  setEnvironment: (environment) => set((s) => ({ state: { ...s.state, environment } })),
  setLoadedEnvs: (loadedEnvs) => set((s) => ({ state: { ...s.state, loadedEnvs } })),
  setActiveEnv: (activeEnvName) => {
    settingsClient.set("alis:activeEnvName", activeEnvName);
    set((s) => ({ state: { ...s.state, activeEnvName } }));
  },
  updateWorkspace: (partial) => set((s) => ({ state: { ...s.state, ...partial } })),
}));

// recentLandingZone and activeEnvName are persisted manually (raw keys shared
// with the pre-zustand store), so seed them once the settings cache is ready.
onSettingsReady(() => {
  let recentLandingZone: RecentLandingZone | null = null;
  try {
    const raw = settingsClient.getCached("alis:recentLandingZone");
    recentLandingZone = raw ? (JSON.parse(raw) as RecentLandingZone) : null;
  } catch {
    recentLandingZone = null;
  }
  const activeEnvName = settingsClient.getCached("alis:activeEnvName") ?? "";
  useWorkspace.setState((s) => ({ state: { ...s.state, recentLandingZone, activeEnvName } }));
});
