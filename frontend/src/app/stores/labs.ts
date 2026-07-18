import { create } from "zustand";
import { persist } from "zustand/middleware";
import { hydrateWhenReady, persistSqlite } from "./lib/persistSqlite";

export type SuggestionCategory =
  | "Build & Deploy"
  | "Define"
  | "Environment Hygiene"
  | "Release Readiness"
  | "AI Insights"
  | "Tools";

export interface SuggestionDefinition {
  id: string;
  category: SuggestionCategory;
  title: string;
  description: string;
  enabled: boolean;
}

export const SUGGESTION_REGISTRY: SuggestionDefinition[] = [
  {
    id: "build-success-deploy",
    category: "Build & Deploy",
    title: "Suggest deploy after build",
    description: "When a build completes successfully, suggest deploying to dev.",
    enabled: true,
  },
  {
    id: "build-failure-verbose",
    category: "Build & Deploy",
    title: "Suggest verbose re-run on failure",
    description: "When a build fails, offer to re-run with verbose output.",
    enabled: true,
  },
  {
    id: "packages-installed-commit",
    category: "Build & Deploy",
    title: "Suggest commit after package install",
    description: "After packages install successfully, suggest committing the updated files.",
    enabled: true,
  },
  {
    id: "git-pull-define-upgrade",
    category: "Define",
    title: "Suggest package install after define repo pull",
    description: "When new commits are pulled on the define repo, suggest installing packages.",
    enabled: true,
  },
  {
    id: "git-pull-build-upgrade",
    category: "Build & Deploy",
    title: "Suggest package install after build repo pull with dependency changes",
    description:
      "When a build repo pull includes dependency files (go.mod, package.json, etc.), suggest installing packages.",
    enabled: true,
  },
  {
    id: "push-define-run-service",
    category: "Define",
    title: "Suggest running Define after proto push",
    description:
      "When you push the define repo, detect which service's protos changed and suggest running Define for it.",
    enabled: true,
  },
  {
    id: "ai-contextual-insight",
    category: "AI Insights",
    title: "AI contextual suggestions",
    description:
      "Generate context-aware next-step suggestions using your local Gemma model after key events.",
    enabled: true,
  },
  {
    id: "spanner-rw-transaction",
    category: "Tools",
    title: "Spanner read-write transaction mode",
    description:
      "Execute DML in a read-write transaction that holds changes open until you choose to commit or rollback.",
    enabled: true,
  },
  {
    id: "spanner-proto-decode",
    category: "Tools",
    title: "Decode Spanner BYTES as proto JSON",
    description:
      'Adds a "Decode as proto" action to BYTES columns, using message types compiled from the org\'s cloned define repo.',
    enabled: true,
  },
];

export const SUGGESTION_CATEGORY_ORDER: SuggestionCategory[] = [
  "Build & Deploy",
  "Define",
  "Environment Hygiene",
  "Release Readiness",
  "AI Insights",
  "Tools",
];

interface LabsState {
  masterEnabled: boolean;
  enabledMap: Record<string, boolean>;
  workflowsEnabled: boolean;
}

interface LabsStore {
  state: LabsState;
  isSuggestionEnabled: (id: string) => boolean;
  setSuggestionEnabled: (id: string, enabled: boolean) => void;
  setMasterEnabled: (enabled: boolean) => void;
  setWorkflowsEnabled: (enabled: boolean) => void;
}

const DEFAULT_STATE: LabsState = { masterEnabled: true, enabledMap: {}, workflowsEnabled: false };

export const useLabs = create<LabsStore>()(
  persist(
    (set, get) => ({
      state: DEFAULT_STATE,
      isSuggestionEnabled: (id) => {
        const { masterEnabled, enabledMap } = get().state;
        if (!masterEnabled) return false;
        const override = enabledMap[id];
        if (override !== undefined) return override;
        return SUGGESTION_REGISTRY.find((d) => d.id === id)?.enabled ?? false;
      },
      setSuggestionEnabled: (id, enabled) =>
        set((s) => ({
          state: { ...s.state, enabledMap: { ...s.state.enabledMap, [id]: enabled } },
        })),
      setMasterEnabled: (enabled) =>
        set((s) => ({ state: { ...s.state, masterEnabled: enabled } })),
      setWorkflowsEnabled: (enabled) =>
        set((s) => ({ state: { ...s.state, workflowsEnabled: enabled } })),
    }),
    persistSqlite<LabsStore, LabsState>({
      key: "alis:labs",
      partialize: (s) => s.state,
      merge: (persisted, current) => ({
        ...current,
        state: { ...DEFAULT_STATE, ...(persisted as Partial<LabsState> | null) },
      }),
    }),
  ),
);

hydrateWhenReady(useLabs);
