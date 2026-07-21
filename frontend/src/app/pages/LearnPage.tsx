import { useState, useEffect } from "react";
import { LearningModule } from "./learn/types";
import { useLearnProgress } from "./learn/useLearnProgress";
import { ModuleSidebar } from "./learn/ModuleSidebar";
import { StepView } from "./learn/StepView";
import { module1 } from "./learn/content/module1-what-is-alis";
import { module2 } from "./learn/content/module2-define";
import { module3 } from "./learn/content/module3-build";
import { module4 } from "./learn/content/module4-deploy";
import { module5 } from "./learn/content/module5-the-map";

const modules: LearningModule[] = [module1, module2, module3, module4, module5];

export function LearnPage() {
  const { markComplete, isStepComplete, isModuleComplete, firstIncompleteModuleId } =
    useLearnProgress();

  const [activeModuleId, setActiveModuleId] = useState<string>(() =>
    firstIncompleteModuleId(modules),
  );
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);

  // On first load, jump to the first incomplete step in the resumed module
  useEffect(() => {
    const mod = modules.find((m) => m.id === activeModuleId);
    if (!mod) return;
    const firstIncomplete = mod.steps.findIndex((s) => !isStepComplete(s.id));
    setActiveStepIndex(firstIncomplete === -1 ? 0 : firstIncomplete);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeModule = modules.find((m) => m.id === activeModuleId) ?? modules[0];
  const activeStep = activeModule.steps[activeStepIndex];
  const moduleIndex = modules.findIndex((m) => m.id === activeModuleId);
  const isLastStep = activeStepIndex === activeModule.steps.length - 1;
  const isLastModule = moduleIndex === modules.length - 1;

  const handleSelectModule = (id: string) => {
    setActiveModuleId(id);
    const mod = modules.find((m) => m.id === id)!;
    const firstIncomplete = mod.steps.findIndex((s) => !isStepComplete(s.id));
    setActiveStepIndex(firstIncomplete === -1 ? 0 : firstIncomplete);
  };

  const handleNext = () => {
    markComplete(activeStep.id);
    if (!isLastStep) {
      setActiveStepIndex(activeStepIndex + 1);
    } else if (!isLastModule) {
      const nextModule = modules[moduleIndex + 1];
      setActiveModuleId(nextModule.id);
      setActiveStepIndex(0);
    }
  };

  const handlePrev = () => {
    if (activeStepIndex > 0) {
      setActiveStepIndex(activeStepIndex - 1);
    } else if (moduleIndex > 0) {
      const prevModule = modules[moduleIndex - 1];
      setActiveModuleId(prevModule.id);
      setActiveStepIndex(prevModule.steps.length - 1);
    }
  };

  const canGoPrev = activeStepIndex > 0 || moduleIndex > 0;

  return (
    <div className="flex flex-1 overflow-hidden">
      <ModuleSidebar
        modules={modules}
        activeModuleId={activeModuleId}
        activeStepIndex={activeStepIndex}
        isModuleComplete={isModuleComplete}
        isStepComplete={isStepComplete}
        onSelectModule={handleSelectModule}
        onSelectStep={(moduleId, stepIndex) => {
          setActiveModuleId(moduleId);
          setActiveStepIndex(stepIndex);
        }}
      />
      <StepView
        module={activeModule}
        step={activeStep}
        stepIndex={activeStepIndex}
        onNext={handleNext}
        onPrev={canGoPrev ? handlePrev : undefined}
        isLastStep={isLastStep}
        isLastModule={isLastModule}
      />
    </div>
  );
}
