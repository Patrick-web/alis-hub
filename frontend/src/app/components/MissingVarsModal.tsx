import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './Button';
import { Loader } from './Loader';
import { DuplicateVarModal } from './DuplicateVarModal';
import type { LoadedEnv } from '../stores/workspace';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';

interface MissingVarsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadedEnvs: LoadedEnv[];
}

interface EnvVarMap {
  [envName: string]: { label: string; value: string }[];
}

interface Gap {
  label: string;
  sourceEnv: LoadedEnv;
  sourceValue: string;
  missingEnvs: LoadedEnv[];
}

interface ResolveTarget {
  label: string;
  value: string;
  sourceEnvName: string;
  targetEnvNames: string[];
}

export function MissingVarsModal({ open, onOpenChange, loadedEnvs }: MissingVarsModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [envVarMap, setEnvVarMap] = useState<EnvVarMap>({});
  const [resolveTarget, setResolveTarget] = useState<ResolveTarget | null>(null);

  useEffect(() => {
    if (!open || loadedEnvs.length === 0) return;
    setLoading(true);
    setError(null);
    setGaps([]);

    const promises = loadedEnvs.map(env =>
      (ProductService.GetEnvironmentVariables as (envName: string) => Promise<any[]>)(env.name)
        .then(vars => ({ envName: env.name, vars: vars.map((v: any) => ({ label: v.label as string, value: v.value as string })) }))
        .catch(() => ({ envName: env.name, vars: [] }))
    );

    Promise.all(promises).then(results => {
      const map: EnvVarMap = {};
      for (const r of results) {
        map[r.envName] = r.vars;
      }
      setEnvVarMap(map);

      // Build union of all labels
      const allLabels = new Set<string>();
      for (const vars of Object.values(map)) {
        for (const v of vars) allLabels.add(v.label);
      }

      const foundGaps: Gap[] = [];
      for (const label of Array.from(allLabels).sort()) {
        const envsWith = loadedEnvs.filter(e => map[e.name]?.some(v => v.label === label));
        const envsWithout = loadedEnvs.filter(e => !map[e.name]?.some(v => v.label === label));

        if (envsWithout.length > 0 && envsWith.length > 0) {
          const sourceEnv = envsWith[0];
          const sourceValue = map[sourceEnv.name].find(v => v.label === label)?.value ?? '';
          foundGaps.push({ label, sourceEnv, sourceValue, missingEnvs: envsWithout });
        }
      }

      setGaps(foundGaps);
    }).catch(err => {
      setError(String(err));
    }).finally(() => setLoading(false));
  }, [open]);

  const handleResolveAfterDuplicate = () => {
    setResolveTarget(null);
    // Re-fetch to update the gaps view
    if (!open) return;
    setLoading(true);
    const promises = loadedEnvs.map(env =>
      (ProductService.GetEnvironmentVariables as (envName: string) => Promise<any[]>)(env.name)
        .then(vars => ({ envName: env.name, vars: vars.map((v: any) => ({ label: v.label as string, value: v.value as string })) }))
        .catch(() => ({ envName: env.name, vars: [] }))
    );
    Promise.all(promises).then(results => {
      const map: EnvVarMap = {};
      for (const r of results) map[r.envName] = r.vars;
      setEnvVarMap(map);
      const allLabels = new Set<string>();
      for (const vars of Object.values(map)) for (const v of vars) allLabels.add(v.label);
      const foundGaps: Gap[] = [];
      for (const label of Array.from(allLabels).sort()) {
        const envsWith = loadedEnvs.filter(e => map[e.name]?.some(v => v.label === label));
        const envsWithout = loadedEnvs.filter(e => !map[e.name]?.some(v => v.label === label));
        if (envsWithout.length > 0 && envsWith.length > 0) {
          const sourceEnv = envsWith[0];
          const sourceValue = map[sourceEnv.name].find(v => v.label === label)?.value ?? '';
          foundGaps.push({ label, sourceEnv, sourceValue, missingEnvs: envsWithout });
        }
      }
      setGaps(foundGaps);
    }).finally(() => setLoading(false));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card border border-border text-white p-0 gap-0 sm:max-w-[600px]">
          <DialogHeader className="px-[20px] py-[14px] border-b border-border">
            <div className="flex items-center gap-[10px]">
              <Icon icon="solar:danger-triangle-linear" className="text-brand text-xl" />
              <DialogTitle className="text-white font-mono text-[13px] font-bold">
                Check Missing Variables
              </DialogTitle>
            </div>
            <p className="font-mono text-[11px] text-[rgba(255,255,255,0.5)] mt-[4px]">
              Variables that exist in some environments but not others
            </p>
          </DialogHeader>

          <div className="px-[20px] py-[16px] min-h-[200px] max-h-[420px] overflow-y-auto flex flex-col gap-[6px]">
            {loading ? (
              <div className="flex items-center justify-center h-full py-[40px]">
                <Loader />
              </div>
            ) : error ? (
              <p className="font-mono text-[11px] text-destructive text-center py-[20px]">
                {error}
              </p>
            ) : gaps.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-[40px] gap-[10px]">
                <Icon icon="solar:check-circle-linear" className="text-success text-[32px]" />
                <p className="font-mono text-[12px] text-[rgba(255,255,255,0.5)]">
                  All environments are in sync
                </p>
              </div>
            ) : (
              gaps.map(gap => (
                <div
                  key={gap.label}
                  className="flex items-start gap-[12px] p-[12px] rounded-[4px] border border-border bg-[rgba(255,255,255,0.02)]"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-[12px] text-white font-bold truncate">
                      {gap.label}
                    </p>
                    <div className="flex items-center gap-[6px] mt-[4px] flex-wrap">
                      <span className="font-mono text-[10px] text-[rgba(255,255,255,0.4)]">
                        Present in:
                      </span>
                      {loadedEnvs
                        .filter(e => envVarMap[e.name]?.some(v => v.label === gap.label))
                        .map(e => (
                          <span
                            key={e.name}
                            className="font-mono text-[9px] text-[rgba(255,255,255,0.7)] border border-border px-[5px] py-[1px] rounded-[3px]"
                          >
                            {e.displayName}
                          </span>
                        ))
                      }
                    </div>
                    <div className="flex items-center gap-[6px] mt-[3px] flex-wrap">
                      <span className="font-mono text-[10px] text-destructive">
                        Missing in:
                      </span>
                      {gap.missingEnvs.map(e => (
                        <span
                          key={e.name}
                          className="font-mono text-[9px] text-destructive border border-[rgba(255,80,80,0.4)] px-[5px] py-[1px] rounded-[3px]"
                        >
                          {e.displayName}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    className="h-[28px] px-[10px] text-[10px] font-bold uppercase shrink-0"
                    onClick={() => setResolveTarget({
                      label: gap.label,
                      value: gap.sourceValue,
                      sourceEnvName: gap.sourceEnv.name,
                      targetEnvNames: gap.missingEnvs.map(e => e.name),
                    })}
                  >
                    Resolve
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="px-[20px] py-[14px] border-t border-border flex justify-end">
            <Button
              variant="secondary"
              className="h-[34px] px-[20px] text-[11px] font-bold uppercase"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {resolveTarget && (
        <DuplicateVarModal
          open={Boolean(resolveTarget)}
          onOpenChange={(o) => {
            if (!o) handleResolveAfterDuplicate();
          }}
          varLabel={resolveTarget.label}
          varValue={resolveTarget.value}
          sourceEnvName={resolveTarget.sourceEnvName}
          loadedEnvs={loadedEnvs.filter(e =>
            resolveTarget.targetEnvNames.includes(e.name) || e.name === resolveTarget.sourceEnvName
          )}
        />
      )}
    </>
  );
}
