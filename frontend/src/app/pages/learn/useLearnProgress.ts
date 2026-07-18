import { useCallback } from "react";
import { create } from "zustand";
import { LearningModule } from "./types";
import * as settingsClient from "../../lib/settingsClient";
import { onSettingsReady } from "../../stores/lib/persistSqlite";

const STORAGE_KEY = "alis-learn-progress";

interface LearnProgressStore {
  completedSteps: Set<string>;
  markComplete: (stepId: string) => void;
}

export const useLearnProgressStore = create<LearnProgressStore>((set) => ({
  completedSteps: new Set<string>(),
  markComplete: (stepId) =>
    set((prev) => {
      if (prev.completedSteps.has(stepId)) return prev;
      const next = new Set(prev.completedSteps);
      next.add(stepId);
      settingsClient.set(STORAGE_KEY, JSON.stringify({ completedSteps: [...next] }));
      return { completedSteps: next };
    }),
}));

onSettingsReady(() => {
  try {
    const raw = settingsClient.getCached(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { completedSteps: string[] };
      useLearnProgressStore.setState({ completedSteps: new Set(parsed.completedSteps) });
    }
  } catch {
    // keep empty progress on malformed payloads
  }
});

export function useLearnProgress() {
  const completedSteps = useLearnProgressStore((s) => s.completedSteps);
  const markComplete = useLearnProgressStore((s) => s.markComplete);

  const isStepComplete = useCallback(
    (stepId: string) => completedSteps.has(stepId),
    [completedSteps],
  );

  const isModuleComplete = useCallback(
    (module: LearningModule) => module.steps.every((s) => completedSteps.has(s.id)),
    [completedSteps],
  );

  const firstIncompleteModuleId = useCallback(
    (modules: LearningModule[]) =>
      (modules.find((m) => !m.steps.every((s) => completedSteps.has(s.id))) ?? modules[0]).id,
    [completedSteps],
  );

  return { markComplete, isStepComplete, isModuleComplete, firstIncompleteModuleId };
}
