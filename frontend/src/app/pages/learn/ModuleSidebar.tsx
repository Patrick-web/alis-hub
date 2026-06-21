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
    <div className="bg-card w-[260px] shrink-0 h-full flex flex-col overflow-hidden border-r border-border">
      <div className="px-[20px] py-[10px] border-b border-border shrink-0">
        <p className="font-mono font-bold text-[11px] text-foreground uppercase opacity-50">
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
                    : 'hover:bg-foreground/[4%]'
                }`}
              >
                <div
                  className={`absolute inset-0 pointer-events-none border-t ${
                    isActive ? 'border-brand' : 'border-border'
                  }`}
                  aria-hidden="true"
                />
                <div className="flex items-center gap-[10px] px-[16px] py-[10px]">
                  <div className="shrink-0 flex items-center justify-center size-[20px]">
                    {isDone ? (
                      <Icon icon="solar:check-circle-bold" className="text-success text-lg" />
                    ) : (
                      <span
                        className={`text-[11px] font-bold font-mono ${
                          isActive ? 'text-brand' : 'text-foreground/35'
                        }`}
                      >
                        {mIdx + 1}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-[12px] font-bold font-mono leading-[1.2] truncate ${
                        isActive ? 'text-brand' : isDone ? 'text-foreground/60' : 'text-foreground'
                      }`}
                    >
                      {module.title}
                    </p>
                    <p className="text-[10px] text-foreground/30 mt-[1px]">
                      {completedCount}/{totalSteps} steps
                    </p>
                  </div>
                  <Icon
                    icon={isActive ? 'solar:alt-arrow-down-linear' : 'solar:alt-arrow-right-linear'}
                    className={`text-[12px] shrink-0 ${isActive ? 'text-brand' : 'text-foreground/25'}`}
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
                            : 'hover:bg-foreground/[3%]'
                        }`}
                      >
                        <div className="pl-[20px] shrink-0 flex items-center justify-center size-[16px]">
                          {done ? (
                            <Icon icon="solar:check-circle-bold" className="text-success text-[14px]" />
                          ) : (
                            <div
                              className={`size-[6px] rounded-full ${
                                isStepActive ? 'bg-brand' : 'bg-foreground/20'
                              }`}
                            />
                          )}
                        </div>
                        <p
                          className={`text-[11px] font-mono leading-[1.3] ${
                            isStepActive
                              ? 'text-brand'
                              : done
                              ? 'text-foreground/40'
                              : 'text-foreground/65'
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
      <div className="px-[16px] py-[12px] border-t border-border shrink-0">
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
                <p className="text-[10px] text-foreground/35 font-mono">
                  Overall progress
                </p>
                <p className="text-[10px] font-bold text-foreground/50 font-mono">
                  {pct}%
                </p>
              </div>
              <div className="h-[3px] bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full transition-all duration-300"
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
