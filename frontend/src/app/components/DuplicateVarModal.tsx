import { useEffect, useState } from 'react';

function parseError(err: unknown): string {
  const s = String(err);
  try {
    const obj = JSON.parse(s);
    if (obj && typeof obj.message === 'string') return obj.message;
  } catch { /* not JSON */ }
  return s;
}
import { Icon } from '@iconify/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { Button } from './Button';
import { Loader } from './Loader';
import type { LoadedEnv } from '../stores/workspace';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';

interface DuplicateVarModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  varLabel: string;
  varValue: string;
  sourceEnvName: string;
  loadedEnvs: LoadedEnv[];
}

interface TargetEnvState {
  env: LoadedEnv;
  checked: boolean;
  hasConflict: boolean;
  loading: boolean;
  error: string | null;
}

export function DuplicateVarModal({
  open,
  onOpenChange,
  varLabel,
  varValue,
  sourceEnvName,
  loadedEnvs,
}: DuplicateVarModalProps) {
  const [targets, setTargets] = useState<TargetEnvState[]>([]);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [prodConfirmed, setProdConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const otherEnvs = loadedEnvs.filter(e => e.name !== sourceEnvName);

  useEffect(() => {
    if (!open) return;
    setProdConfirmed(false);
    setGlobalError(null);
    setSubmitting(false);

    const initial: TargetEnvState[] = otherEnvs.map(env => ({
      env,
      checked: false,
      hasConflict: false,
      loading: true,
      error: null,
    }));
    setTargets(initial);
    setFetchLoading(true);

    const promises = otherEnvs.map(env =>
      (ProductService.GetEnvironmentVariables as (envName: string) => Promise<any[]>)(env.name)
        .then(vars => {
          const hasConflict = vars.some((v: any) => v.label === varLabel);
          setTargets(prev => prev.map(t =>
            t.env.name === env.name ? { ...t, hasConflict, loading: false } : t,
          ));
        })
        .catch(err => {
          setTargets(prev => prev.map(t =>
            t.env.name === env.name ? { ...t, loading: false, error: String(err) } : t,
          ));
        })
    );

    Promise.all(promises).finally(() => setFetchLoading(false));
  }, [open, varLabel]);

  const toggle = (envName: string) => {
    setTargets(prev => prev.map(t =>
      t.env.name === envName ? { ...t, checked: !t.checked } : t,
    ));
    setProdConfirmed(false);
  };

  const selectedTargets = targets.filter(t => t.checked);
  const needsProdConfirm = selectedTargets.some(
    t => t.hasConflict && t.env.envType === 3,
  );
  const canSubmit =
    selectedTargets.length > 0 &&
    !submitting &&
    (!needsProdConfirm || prodConfirmed);

  const handleSubmit = async () => {
    setSubmitting(true);
    setGlobalError(null);

    for (const target of selectedTargets) {
      try {
        const existing = await (ProductService.GetEnvironmentVariables as (envName: string) => Promise<any[]>)(target.env.name);
        const merged = [
          ...existing
            .filter((v: any) => v.label !== varLabel)
            .map((v: any) => ({ label: v.label as string, value: v.value as string })),
          { label: varLabel, value: varValue },
        ];
        await (ProductService.SetEnvironmentVariables as (envName: string, vars: any[]) => Promise<void>)(
          target.env.name,
          merged,
        );
      } catch (err) {
        setGlobalError(`Failed for ${target.env.displayName}: ${parseError(err)}`);
        setSubmitting(false);
        return;
      }
    }

    setSubmitting(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="text-foreground p-0 gap-0 sm:max-w-[500px]">
        <DialogHeader className="px-[20px] py-[14px] border-b border-border">
          <div className="flex items-center gap-[10px]">
            <Icon icon="solar:copy-linear" className="text-brand text-xl" />
            <DialogTitle className="text-foreground font-mono text-[13px] font-bold">
              Duplicate Variable
            </DialogTitle>
          </div>
          <p className="font-mono text-[11px] text-foreground/50 mt-[4px]">
            Copy <span className="text-foreground">{varLabel}</span> to other environments
          </p>
        </DialogHeader>

        <div className="px-[20px] py-[16px] flex flex-col gap-[8px] max-h-[320px] overflow-y-auto">
          {fetchLoading && targets.every(t => t.loading) ? (
            <div className="flex items-center justify-center py-[20px]">
              <Loader size={20} />
            </div>
          ) : targets.length === 0 ? (
            <p className="font-mono text-[11px] text-foreground/40 text-center py-[20px]">
              No other environments available.
            </p>
          ) : (
            targets.map(target => (
              <div
                key={target.env.name}
                className={`flex items-start gap-[10px] p-[12px] rounded-[4px] border transition-colors cursor-pointer ${
                  target.checked ? 'border-brand-fill bg-[rgba(248,129,169,0.06)]' : 'border-border hover:bg-foreground/[3%]'
                }`}
                onClick={() => !target.loading && toggle(target.env.name)}
              >
                <div className={`w-[16px] h-[16px] mt-[1px] rounded-[3px] border shrink-0 flex items-center justify-center transition-colors ${
                  target.checked ? 'border-brand-fill bg-brand-fill' : 'border-border'
                }`}>
                  {target.checked && <Icon icon="solar:check-linear" className="text-foreground text-[10px]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-[8px]">
                    <span className="font-mono text-[12px] text-foreground">
                      {target.env.displayName}
                    </span>
                    {target.env.envType === 3 && (
                      <span className="font-mono text-[9px] uppercase text-brand border border-brand-fill px-[4px] py-[1px] rounded-[3px]">
                        prod
                      </span>
                    )}
                    {target.loading && <Loader size={14} />}
                  </div>
                  {target.error && (
                    <p className="font-mono text-[10px] text-destructive mt-[2px]">
                      {target.error}
                    </p>
                  )}
                  {!target.loading && target.hasConflict && (
                    <div className="flex items-center gap-[5px] mt-[4px]">
                      <Icon
                        icon="solar:danger-triangle-linear"
                        className={`text-[13px] ${target.env.envType === 3 ? 'text-warning' : 'text-foreground/40'}`}
                      />
                      <span className={`font-mono text-[10px] ${target.env.envType === 3 ? 'text-warning' : 'text-foreground/40'}`}>
                        Already exists — will override
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {needsProdConfirm && !prodConfirmed && selectedTargets.some(t => t.hasConflict && t.env.envType === 3) && (
          <div className="mx-[20px] mb-[4px] p-[12px] rounded-[4px] bg-[rgba(245,166,35,0.08)] border border-warning flex items-start gap-[10px]">
            <Icon icon="solar:danger-triangle-bold" className="text-warning text-[16px] shrink-0 mt-[1px]" />
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[11px] text-warning font-bold">
                Production override warning
              </p>
              <p className="font-mono text-[10px] text-[rgba(245,166,35,0.8)] mt-[2px]">
                You are about to override a variable in a PRODUCTION environment. This action cannot be undone.
              </p>
              <button
                onClick={() => setProdConfirmed(true)}
                className="mt-[8px] font-mono text-[10px] font-bold uppercase text-warning border border-warning px-[8px] py-[3px] rounded-[3px] hover:bg-[rgba(245,166,35,0.12)] transition-colors"
              >
                I understand, continue
              </button>
            </div>
          </div>
        )}

        {globalError && (
          <p className="mx-[20px] mb-[4px] font-mono text-[11px] text-destructive break-all">
            {globalError}
          </p>
        )}

        <DialogFooter className="px-[20px] py-[14px] border-t border-border flex-row gap-[8px]">
          <Button
            variant="secondary"
            className="flex-1 h-[34px] text-[11px] font-bold uppercase"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1 h-[34px] text-[11px] font-bold uppercase"
            onClick={handleSubmit}
            disabled={!canSubmit}
            icon={submitting ? <Icon icon="solar:refresh-linear" className="text-xl animate-spin" /> : undefined}
          >
            Duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
