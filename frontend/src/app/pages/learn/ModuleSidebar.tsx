import { Icon } from '@iconify/react';
import { LearningModule } from './types';

interface ModuleSidebarProps {
  modules: LearningModule[];
  activeModuleId: string;
  activeStepIndex: number;
  isModuleComplete: (m: LearningModule) => boolean;
  isStepComplete: (id: string) => boolean;
  onSelectModule: (id: string) => void;
  onSelectStep: (moduleId: string, stepIndex: number) => void;
}

export function ModuleSidebar({
  modules,
  activeModuleId,
  activeStepIndex,
  isModuleComplete,
  isStepComplete,
  onSelectModule,
  onSelectStep,
}: ModuleSidebarProps) {
  return (
    <div className="bg-[#2c2c2c] w-[260px] shrink-0 h-full flex flex-col overflow-hidden border-r border-[#464646]">
      <div className="px-[20px] py-[10px] border-b border-[#464646] shrink-0">
        <p className="font-['JetBrains_Mono',sans-serif] font-bold text-[11px] text-white uppercase opacity-50">
          Learning Path
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {modules.map((module, mIdx) => {
          const isActive = module.id === activeModuleId;
          const isDone = isModuleComplete(module);
          const totalSteps = module.steps.length;
          const completedCount = module.steps.filter(s => isStepComplete(s.id)).length;

          return (
            <div key={module.id}>
              {/* Module header */}
              <button
                onClick={() => onSelectModule(module.id)}
                className={`relative w-full text-left transition-colors ${
                  isActive
                    ? 'bg-[rgba(248,129,169,0.1)]'
                    : 'hover:bg-[rgba(255,255,255,0.04)]'
                }`}
              >
                <div
                  className={`absolute inset-0 pointer-events-none border-t ${
                    isActive ? 'border-[#f881a9]' : 'border-[#464646]'
                  }`}
                  aria-hidden="true"
                />
                <div className="flex items-center gap-[10px] px-[16px] py-[10px]">
                  <div className="shrink-0 flex items-center justify-center size-[20px]">
                    {isDone ? (
                      <Icon icon="solar:check-circle-bold" className="text-[#34C759] text-lg" />
                    ) : (
                      <span
                        className={`text-[11px] font-bold font-['JetBrains_Mono',sans-serif] ${
                          isActive ? 'text-[#f881a9]' : 'text-[rgba(255,255,255,0.35)]'
                        }`}
                      >
                        {mIdx + 1}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-[12px] font-bold font-['JetBrains_Mono',sans-serif] leading-[1.2] truncate ${
                        isActive ? 'text-[#f881a9]' : isDone ? 'text-[rgba(255,255,255,0.6)]' : 'text-white'
                      }`}
                    >
                      {module.title}
                    </p>
                    <p className="text-[10px] text-[rgba(255,255,255,0.3)] mt-[1px]">
                      {completedCount}/{totalSteps} steps
                    </p>
                  </div>
                  <Icon
                    icon={isActive ? 'solar:alt-arrow-down-linear' : 'solar:alt-arrow-right-linear'}
                    className={`text-[12px] shrink-0 ${isActive ? 'text-[#f881a9]' : 'text-[rgba(255,255,255,0.25)]'}`}
                  />
                </div>
              </button>

              {/* Steps (shown when module is active) */}
              {isActive && (
                <div className="bg-[rgba(0,0,0,0.15)]">
                  {module.steps.map((step, sIdx) => {
                    const isStepActive = sIdx === activeStepIndex;
                    const done = isStepComplete(step.id);
                    return (
                      <button
                        key={step.id}
                        onClick={() => onSelectStep(module.id, sIdx)}
                        className={`w-full text-left px-[16px] py-[8px] flex items-center gap-[10px] transition-colors ${
                          isStepActive
                            ? 'bg-[rgba(248,129,169,0.08)]'
                            : 'hover:bg-[rgba(255,255,255,0.03)]'
                        }`}
                      >
                        <div className="pl-[20px] shrink-0 flex items-center justify-center size-[16px]">
                          {done ? (
                            <Icon icon="solar:check-circle-bold" className="text-[#34C759] text-[14px]" />
                          ) : (
                            <div
                              className={`size-[6px] rounded-full ${
                                isStepActive ? 'bg-[#f881a9]' : 'bg-[rgba(255,255,255,0.2)]'
                              }`}
                            />
                          )}
                        </div>
                        <p
                          className={`text-[11px] font-['JetBrains_Mono',sans-serif] leading-[1.3] ${
                            isStepActive
                              ? 'text-[#f881a9]'
                              : done
                              ? 'text-[rgba(255,255,255,0.4)]'
                              : 'text-[rgba(255,255,255,0.65)]'
                          }`}
                        >
                          {step.title}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="px-[16px] py-[12px] border-t border-[#464646] shrink-0">
        {(() => {
          const total = modules.reduce((s, m) => s + m.steps.length, 0);
          const done = modules.reduce(
            (s, m) => s + m.steps.filter(st => isStepComplete(st.id)).length,
            0,
          );
          const pct = total === 0 ? 0 : Math.round((done / total) * 100);
          return (
            <>
              <div className="flex items-center justify-between mb-[6px]">
                <p className="text-[10px] text-[rgba(255,255,255,0.35)] font-['JetBrains_Mono',sans-serif]">
                  Overall progress
                </p>
                <p className="text-[10px] font-bold text-[rgba(255,255,255,0.5)] font-['JetBrains_Mono',sans-serif]">
                  {pct}%
                </p>
              </div>
              <div className="h-[3px] bg-[#464646] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#f881a9] rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
