import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';

const LABEL_REGEX = /^[a-zA-Z][-_a-zA-Z0-9]{2,100}$/;

function parseError(err: unknown): string {
  const s = String(err);
  try {
    const obj = JSON.parse(s);
    if (obj && typeof obj.message === 'string') return obj.message;
  } catch { /* not JSON */ }
  return s;
}
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from './ui/sheet';
import { Input } from './Input';
import { Button } from './Button';
import type { LoadedEnv } from '../stores/workspace';

export interface PropagationTarget {
  envName: string;
  displayName: string;
  value: string;
}

interface VarFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initialLabel?: string;
  initialValue?: string;
  onSubmit: (label: string, value: string, propagations?: PropagationTarget[]) => Promise<void>;
  loadedEnvs?: LoadedEnv[];
  currentEnvName?: string;
}

interface PropagationState {
  envName: string;
  displayName: string;
  checked: boolean;
  useCustom: boolean;
  customValue: string;
  envType?: number;
}

export function VarFormSheet({
  open,
  onOpenChange,
  mode,
  initialLabel = '',
  initialValue = '',
  onSubmit,
  loadedEnvs,
  currentEnvName,
}: VarFormSheetProps) {
  const [label, setLabel] = useState(initialLabel);
  const [value, setValue] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [propagateOpen, setPropagateOpen] = useState(false);
  const [propagations, setPropagations] = useState<PropagationState[]>([]);

  const otherEnvs = (loadedEnvs ?? []).filter(e => e.name !== currentEnvName);

  useEffect(() => {
    if (open) {
      setLabel(initialLabel);
      setValue(initialValue);
      setError(null);
      setLoading(false);
      setPropagateOpen(false);
      setPropagations(
        otherEnvs.map(env => ({
          envName: env.name,
          displayName: env.displayName,
          checked: false,
          useCustom: false,
          customValue: '',
          envType: env.envType,
        }))
      );
    }
  }, [open, initialLabel, initialValue]);

  const toggleEnv = (envName: string) => {
    setPropagations(prev => prev.map(p =>
      p.envName === envName ? { ...p, checked: !p.checked } : p,
    ));
  };

  const toggleCustom = (envName: string) => {
    setPropagations(prev => prev.map(p =>
      p.envName === envName ? { ...p, useCustom: !p.useCustom } : p,
    ));
  };

  const setCustomValue = (envName: string, val: string) => {
    setPropagations(prev => prev.map(p =>
      p.envName === envName ? { ...p, customValue: val } : p,
    ));
  };

  const handleSubmit = async () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    if (mode === 'create' && !LABEL_REGEX.test(trimmed)) {
      setError('Label must start with a letter and contain only letters, digits, hyphens, or underscores (3–101 characters).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const selectedPropagations: PropagationTarget[] = propagations
        .filter(p => p.checked)
        .map(p => ({
          envName: p.envName,
          displayName: p.displayName,
          value: p.useCustom ? p.customValue : value,
        }));
      await onSubmit(trimmed, value, selectedPropagations.length > 0 ? selectedPropagations : undefined);
      onOpenChange(false);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const checkedCount = propagations.filter(p => p.checked).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="bg-card border-l border-border text-foreground w-[380px] sm:max-w-[380px] flex flex-col p-0"
      >
        <SheetHeader className="px-[20px] py-[14px] border-b border-border">
          <div className="flex items-center gap-[10px]">
            <Icon icon="solar:code-square-linear" className="text-brand text-xl" />
            <SheetTitle className="text-foreground font-mono text-[13px] font-bold">
              {mode === 'create' ? 'New Variable' : 'Edit Variable'}
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-[16px] px-[20px] py-[20px] flex-1 overflow-y-auto">
          <div className="flex flex-col gap-[6px]">
            <p className="font-mono text-[10px] font-bold text-foreground/50 uppercase">
              Label
            </p>
            <Input
              placeholder="VARIABLE_NAME"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={loading || mode === 'edit'}
              className={`font-mono text-[12px] ${mode === 'create' && label && !LABEL_REGEX.test(label.trim()) ? 'border-destructive focus:border-destructive' : ''}`}
            />
            {mode === 'create' && label && !LABEL_REGEX.test(label.trim()) && (
              <p className="font-mono text-[10px] text-destructive">
                Must start with a letter; letters, digits, <span className="opacity-70">-</span> and <span className="opacity-70">_</span> only; 3–101 chars total.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-[6px]">
            <p className="font-mono text-[10px] font-bold text-foreground/50 uppercase">
              Value
            </p>
            <textarea
              placeholder="value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={loading}
              rows={6}
              className="w-full bg-background border border-border rounded-[4px] px-[12px] py-[8px] text-foreground font-mono text-[12px] resize-none focus:outline-none focus:border-brand-fill disabled:opacity-50 placeholder:text-foreground/30"
            />
          </div>

          {mode === 'create' && otherEnvs.length > 0 && (
            <div className="flex flex-col gap-0 border border-border rounded-[4px] overflow-hidden">
              <button
                onClick={() => setPropagateOpen(v => !v)}
                disabled={loading}
                className="flex items-center justify-between px-[12px] py-[10px] hover:bg-foreground/[3%] transition-colors"
              >
                <div className="flex items-center gap-[8px]">
                  <Icon icon="solar:copy-linear" className="text-foreground/50 text-[15px]" />
                  <span className="font-mono text-[11px] font-bold text-foreground/60 uppercase">
                    Propagate to other environments
                  </span>
                  {checkedCount > 0 && (
                    <span className="font-mono text-[9px] text-brand border border-brand-fill px-[5px] py-[1px] rounded-[3px]">
                      {checkedCount}
                    </span>
                  )}
                </div>
                <Icon
                  icon={propagateOpen ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
                  className="text-foreground/40 text-[14px]"
                />
              </button>

              {propagateOpen && (
                <div className="border-t border-border flex flex-col gap-0">
                  {propagations.map(p => (
                    <div key={p.envName} className="flex flex-col border-b border-border last:border-b-0">
                      <div
                        className="flex items-center gap-[10px] px-[12px] py-[10px] cursor-pointer hover:bg-foreground/[2%] transition-colors"
                        onClick={() => !loading && toggleEnv(p.envName)}
                      >
                        <div className={`w-[15px] h-[15px] rounded-[3px] border shrink-0 flex items-center justify-center transition-colors ${
                          p.checked ? 'border-brand-fill bg-brand-fill' : 'border-border'
                        }`}>
                          {p.checked && <Icon icon="solar:check-linear" className="text-foreground text-[9px]" />}
                        </div>
                        <span className="font-mono text-[11px] text-foreground flex-1">
                          {p.displayName}
                        </span>
                        {p.envType === 3 && (
                          <span className="font-mono text-[9px] text-brand border border-brand-fill px-[4px] py-[1px] rounded-[3px]">
                            prod
                          </span>
                        )}
                      </div>

                      {p.checked && (
                        <div className="px-[12px] pb-[10px] flex flex-col gap-[8px]">
                          <div className="flex gap-[6px]">
                            <button
                              onClick={() => !loading && p.useCustom && toggleCustom(p.envName)}
                              className={`flex-1 px-[8px] py-[5px] rounded-[3px] border font-mono text-[10px] font-bold uppercase transition-colors ${
                                !p.useCustom
                                  ? 'border-brand-fill bg-[rgba(248,129,169,0.08)] text-brand'
                                  : 'border-border text-foreground/40 hover:bg-foreground/[3%]'
                              }`}
                            >
                              Same value
                            </button>
                            <button
                              onClick={() => !loading && !p.useCustom && toggleCustom(p.envName)}
                              className={`flex-1 px-[8px] py-[5px] rounded-[3px] border font-mono text-[10px] font-bold uppercase transition-colors ${
                                p.useCustom
                                  ? 'border-brand-fill bg-[rgba(248,129,169,0.08)] text-brand'
                                  : 'border-border text-foreground/40 hover:bg-foreground/[3%]'
                              }`}
                            >
                              Custom value
                            </button>
                          </div>
                          {p.useCustom && (
                            <textarea
                              placeholder="Custom value for this environment"
                              value={p.customValue}
                              onChange={(e) => setCustomValue(p.envName, e.target.value)}
                              disabled={loading}
                              rows={3}
                              className="w-full bg-background border border-border rounded-[4px] px-[10px] py-[6px] text-foreground font-mono text-[11px] resize-none focus:outline-none focus:border-brand-fill disabled:opacity-50 placeholder:text-foreground/30"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-[11px] text-destructive font-mono break-all">
              {error}
            </p>
          )}
        </div>

        <SheetFooter className="px-[20px] py-[14px] border-t border-border flex-row gap-[8px]">
          <Button
            variant="secondary"
            className="flex-1 h-[34px] text-[11px] font-bold uppercase"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1 h-[34px] text-[11px] font-bold uppercase"
            onClick={handleSubmit}
            disabled={loading || !label.trim() || (mode === 'create' && !LABEL_REGEX.test(label.trim()))}
            icon={loading ? <Icon icon="solar:refresh-linear" className="text-xl animate-spin" /> : undefined}
          >
            {mode === 'create' ? 'Create' : 'Save'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
