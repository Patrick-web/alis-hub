import { create } from "zustand";
import { persist } from "zustand/middleware";
import { hydrateWhenReady, persistSqlite } from "./lib/persistSqlite";

interface SourceControlState {
  fileListView: "list" | "tree";
  diffView: "unified" | "split";
  fetchIntervalMinutes: number;
  mergeUntracked: boolean;
}

interface SourceControlStore {
  state: SourceControlState;
  setFileListView: (view: "list" | "tree") => void;
  setDiffView: (view: "unified" | "split") => void;
  setFetchIntervalMinutes: (minutes: number) => void;
  setMergeUntracked: (merge: boolean) => void;
}

const DEFAULT_STATE: SourceControlState = {
  fileListView: "list",
  diffView: "unified",
  fetchIntervalMinutes: 5,
  mergeUntracked: false,
};

export const useSourceControl = create<SourceControlStore>()(
  persist(
    (set) => ({
      state: DEFAULT_STATE,
      setFileListView: (view) => set((s) => ({ state: { ...s.state, fileListView: view } })),
      setDiffView: (view) => set((s) => ({ state: { ...s.state, diffView: view } })),
      setFetchIntervalMinutes: (minutes) =>
        set((s) => ({ state: { ...s.state, fetchIntervalMinutes: minutes } })),
      setMergeUntracked: (merge) => set((s) => ({ state: { ...s.state, mergeUntracked: merge } })),
    }),
    persistSqlite<SourceControlStore, SourceControlState>({
      key: "alis:source-control",
      partialize: (s) => s.state,
      merge: (persisted, current) => ({
        ...current,
        state: { ...DEFAULT_STATE, ...(persisted as Partial<SourceControlState> | null) },
      }),
    }),
  ),
);

hydrateWhenReady(useSourceControl);
