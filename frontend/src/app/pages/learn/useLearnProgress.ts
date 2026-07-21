import { useCallback } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LearningModule } from "./types";
import { hydrateWhenReady, persistSqlite } from "../../stores/lib/persistSqlite";

interface LearnProgressStore {
  completedSteps: Set<string>;
  markComplete: (stepId: string) => void;
}

/** Legacy on-disk shape (predates the zustand persist envelope). */
interface PersistedLearnProgress {
  completedSteps: string[];
}

export const useLearnProgressStore = create<LearnProgressStore>()(
  persist(
    (set) => ({
      completedSteps: new Set<string>(),
      markComplete: (stepId) =>
        set((prev) => {
          if (prev.completedSteps.has(stepId)) return prev;
          const next = new Set(prev.completedSteps);
          next.add(stepId);
          return { completedSteps: next };
        }),
    }),
    persistSqlite<LearnProgressStore, PersistedLearnProgress>({
      key: "alis-learn-progress",
      partialize: (s) => ({ completedSteps: [...s.completedSteps] }),
      merge: (persisted, current) => {
        const persistedSteps =
          persisted &&
          typeof persisted === "object" &&
          Array.isArray((persisted as PersistedLearnProgress).completedSteps)
            ? (persisted as PersistedLearnProgress).completedSteps
            : [];
        // Union rather than replace: completion is monotonic, so any step
        // marked complete before hydration finishes stays complete.
        return { ...current, completedSteps: new Set([...current.completedSteps, ...persistedSteps]) };
      },
    }),
  ),
);

hydrateWhenReady(useLearnProgressStore);

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
