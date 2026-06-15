import { Icon } from '@iconify/react';
import { LearningModule, LearningStep } from './types';

interface StepViewProps {
  module: LearningModule;
  step: LearningStep;
  stepIndex: number;
  onNext: () => void;
  onPrev?: () => void;
  isLastStep: boolean;
  isLastModule: boolean;
}

export function StepView({ module, step, stepIndex, onNext, onPrev, isLastStep, isLastModule }: StepViewProps) {
  const totalSteps = module.steps.length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#1e1e1e]">
      {/* Step header */}
      <div className="border-b border-[#464646] px-[28px] py-[14px] shrink-0">
        <div className="flex items-center gap-[8px] mb-[4px]">
          <span className="text-[10px] font-bold text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif] uppercase tracking-wide">
            {module.title}
          </span>
          <Icon icon="solar:alt-arrow-right-linear" className="text-[rgba(255,255,255,0.2)] text-[10px]" />
          <span className="text-[10px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.3)]">
            Step {stepIndex + 1} of {totalSteps}
          </span>
        </div>
        <h2 className="font-['JetBrains_Mono',sans-serif] font-bold text-[15px] text-white leading-[1.3]">
          {step.title}
        </h2>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-[28px] py-[24px] max-w-[760px] mx-auto">
          {/* Body text / content */}
          <div className="mb-[24px]">
            {step.body}
          </div>

          {/* Diagram (if any) */}
          {step.diagram && (
            <div className="mb-[24px]">
              <div className="flex items-center gap-[8px] mb-[12px]">
                <div className="h-px flex-1 bg-[#2c2c2c]" />
                <p className="text-[9px] text-[rgba(255,255,255,0.2)] font-['JetBrains_Mono',sans-serif] uppercase tracking-widest">
                  Diagram
                </p>
                <div className="h-px flex-1 bg-[#2c2c2c]" />
              </div>
              <div className="bg-[#252525] border border-[#464646] rounded-[4px] p-[20px] flex justify-center">
                {step.diagram}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation footer */}
      <div className="border-t border-[#464646] px-[28px] py-[14px] flex items-center justify-between shrink-0">
        {/* Step dots */}
        <div className="flex items-center gap-[6px]">
          {module.steps.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all ${
                i === stepIndex
                  ? 'size-[8px] bg-[#f881a9]'
                  : i < stepIndex
                  ? 'size-[6px] bg-[rgba(248,129,169,0.4)]'
                  : 'size-[6px] bg-[#464646]'
              }`}
            />
          ))}
        </div>

        {/* Prev / Next buttons */}
        <div className="flex items-center gap-[10px]">
          {onPrev && (
            <button
              onClick={onPrev}
              className="flex items-center gap-[6px] px-[14px] py-[7px] rounded-[4px] border border-[#464646] text-[rgba(255,255,255,0.6)] hover:text-white hover:border-[rgba(255,255,255,0.4)] transition-colors text-[11px] font-['JetBrains_Mono',sans-serif] font-bold"
            >
              <Icon icon="solar:alt-arrow-left-linear" className="text-[13px]" />
              Previous
            </button>
          )}

          <button
            onClick={onNext}
            className="flex items-center gap-[6px] px-[14px] py-[7px] rounded-[4px] bg-[#f881a9] text-black hover:bg-[#fa96b8] active:bg-[#e66e9a] transition-colors text-[11px] font-['JetBrains_Mono',sans-serif] font-bold"
          >
            {isLastStep && isLastModule ? (
              <>
                <Icon icon="solar:check-circle-bold" className="text-[13px]" />
                Finish
              </>
            ) : isLastStep ? (
              <>
                Next module
                <Icon icon="solar:alt-arrow-right-linear" className="text-[13px]" />
              </>
            ) : (
              <>
                Next
                <Icon icon="solar:alt-arrow-right-linear" className="text-[13px]" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
