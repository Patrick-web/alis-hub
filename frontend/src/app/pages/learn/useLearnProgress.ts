import { useState, useCallback } from "react";
import { LearningModule } from "./types";
import * as settingsClient from "../../lib/settingsClient";

const STORAGE_KEY = "alis-learn-progress";

function loadCompleted(): Set<string> {
  try {
    const raw = settingsClient.getCached(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { completedSteps: string[] };
      return new Set(parsed.completedSteps);
    }
  } catch {}
  return new Set<string>();
}

export function useLearnProgress() {
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(loadCompleted);

  const markComplete = useCallback((stepId: string) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.add(stepId);
      settingsClient.set(STORAGE_KEY, JSON.stringify({ completedSteps: [...next] }));
      return next;
    });
  }, []);

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
