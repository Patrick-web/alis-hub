import { useState } from 'react';
import { Icon } from '@iconify/react';
import { Browser } from '@wailsio/runtime';
import { Loader } from '../../Loader';
import { LogBusTerminal } from './LogBusTerminal';
import type { LogBus } from '../../../lib/logBus';
import type { EnvRunState } from '../types';

interface EnvRunViewProps {
  runs: EnvRunState[];
  activeEnv: string;
  onSelectEnv: (env: string) => void;
  step: 'running' | 'result';
  busFor: (env: string) => LogBus;
  planOnly?: boolean;
  fallbackVersion?: string;
  runningLabel?: string;
  onRerun?: () => void;
}

/**
 * Per-environment deploy progress view: env tab strip (when >1), status
 * header and terminal per environment. Shared by the Deploy pane, the Build
 * pane's build+deploy phase, and the command palette progress pages.
 */
export function EnvRunView({
  runs,
  activeEnv,
  onSelectEnv,
  step,
  busFor,
  planOnly = false,
  fallbackVersion = '',
  runningLabel,
  onRerun,
}: EnvRunViewProps) {
  const [copiedEnv, setCopiedEnv] = useState<string | null>(null);
  function copyLog(env: string) {
    navigator.clipboard.writeText(busFor(env).getSnapshot().join(''));
    setCopiedEnv(env);
    setTimeout(() => setCopiedEnv((cur) => (cur === env ? null : cur)), 1500);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {runs.length > 1 && (
        <div className="shrink-0 flex border-b border-border overflow-x-auto">
          {runs.map(run => (
            <button
              key={run.env}
              onClick={() => onSelectEnv(run.env)}
              className={`flex items-center gap-[6px] px-[12px] py-[8px] text-[10px] shrink-0 border-r border-border transition-colors ${
                activeEnv === run.env
                  ? 'text-foreground border-b-2 border-b-brand bg-foreground/[2%]'
                  : 'text-foreground/40 hover:text-foreground/60 hover:bg-foreground/[2%]'
              }`}
            >
              {run.done && run.error ? (
                <Icon icon="solar:close-circle-linear" className="text-destructive text-[11px] shrink-0" />
              ) : run.done ? (
                <Icon icon="solar:check-circle-linear" className="text-success text-[11px] shrink-0" />
              ) : (
                <Loader size={10} />
              )}
              <span className="font-medium">{run.displayName}</span>
            </button>
          ))}
        </div>
      )}

      {runs.map(run => (
        <div
          key={run.env}
          className="flex-1 flex flex-col min-h-0"
          style={{ display: (activeEnv === run.env || runs.length === 1) ? 'flex' : 'none' }}
        >
          {step === 'running' && !run.done && (
            <div className="shrink-0 flex items-center gap-[10px] px-[14px] py-[10px] border-b border-border">
              <Loader size={20} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-foreground leading-tight">
                  {runningLabel ?? (planOnly ? 'Planning' : 'Deploying')}{(run.version || fallbackVersion) ? ` · ${run.version || fallbackVersion}` : ''}
                </p>
                <p className="text-[9px] text-foreground/40 truncate leading-tight mt-[1px]">{run.progressMsg}</p>
              </div>
              <button onClick={() => copyLog(run.env)} className="shrink-0 text-foreground/30 hover:text-foreground transition-colors" title="Copy log">
                <Icon icon={copiedEnv === run.env ? 'solar:check-circle-linear' : 'solar:copy-linear'} className="text-sm" />
              </button>
            </div>
          )}
          {(step === 'result' || run.done) && (
            <div className={`shrink-0 px-[14px] py-[10px] border-b border-border ${run.error ? 'bg-[rgba(255,92,95,0.05)]' : 'bg-[rgba(52,199,89,0.05)]'}`}>
              {run.error ? (
                <div className="flex items-start gap-[8px]">
                  <Icon icon="solar:close-circle-linear" className="text-destructive text-sm shrink-0 mt-[1px]" />
                  <p className="text-[10px] text-foreground/70 leading-relaxed flex-1">{run.error}</p>
                  <button onClick={() => copyLog(run.env)} className="shrink-0 text-foreground/30 hover:text-foreground transition-colors" title="Copy log">
                    <Icon icon={copiedEnv === run.env ? 'solar:check-circle-linear' : 'solar:copy-linear'} className="text-sm" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-[8px]">
                  <Icon icon="solar:check-circle-linear" className="text-success text-sm shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-foreground leading-tight">{planOnly ? 'Plan Complete' : 'Deploy Complete'}</p>
                    {(run.version || fallbackVersion) && (
                      <p className="text-[9px] text-foreground/40 font-mono truncate leading-tight mt-[1px]">{run.version || fallbackVersion}</p>
                    )}
                  </div>
                  <div className="ml-auto flex items-center gap-[10px] shrink-0">
                    <button onClick={() => copyLog(run.env)} className="text-foreground/30 hover:text-foreground transition-colors" title="Copy log">
                      <Icon icon={copiedEnv === run.env ? 'solar:check-circle-linear' : 'solar:copy-linear'} className="text-sm" />
                    </button>
                    {run.logsUrl && (
                      <button onClick={() => Browser.OpenURL(run.logsUrl)} className="text-foreground/30 hover:text-brand transition-colors" title="Open in browser">
                        <Icon icon="solar:arrow-right-up-linear" className="text-sm" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <LogBusTerminal bus={busFor(run.env)} className="flex-1 min-h-0" />
        </div>
      ))}

      {step === 'result' && onRerun && (
        <div className="shrink-0 px-[14px] py-[10px] border-t border-border">
          <button onClick={onRerun} className="text-[10px] text-foreground/35 hover:text-foreground transition-colors flex items-center gap-[6px]">
            <Icon icon="solar:refresh-linear" className="text-sm" />
            Run again
          </button>
        </div>
      )}
    </div>
  );
}
