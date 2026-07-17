import { useState } from 'react';
import { Icon } from '@iconify/react';
import { Browser } from '@wailsio/runtime';
import { Loader } from '../../Loader';
import { LogBusTerminal } from './LogBusTerminal';
import type { LogBus } from '../../../lib/logBus';
import type { BuildResult } from '../types';

interface BuildRunViewProps {
  step: 'running' | 'result';
  progressMsg: string;
  buildResult: BuildResult | null;
  bus: LogBus;
  onRerun?: () => void;
}

/** Single-terminal build progress/result view (cloud + local builds). */
export function BuildRunView({ step, progressMsg, buildResult, bus, onRerun }: BuildRunViewProps) {
  const [copied, setCopied] = useState(false);
  function copyLog() {
    navigator.clipboard.writeText(bus.getSnapshot().join(''));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {step === 'running' && (
        <div className="shrink-0 flex items-center gap-[10px] px-[14px] py-[10px] border-b border-border">
          <Loader size={20} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-foreground leading-tight">Running Build</p>
            <p className="text-[9px] text-foreground/40 truncate leading-tight mt-[1px]">{progressMsg}</p>
          </div>
          {buildResult?.version && (
            <span className="text-[9px] font-bold font-mono text-foreground/35 shrink-0">{buildResult.version}</span>
          )}
          <button onClick={copyLog} className="shrink-0 text-foreground/30 hover:text-foreground transition-colors" title="Copy log">
            <Icon icon={copied ? 'solar:check-circle-linear' : 'solar:copy-linear'} className="text-sm" />
          </button>
        </div>
      )}
      {step === 'result' && (
        <div className={`shrink-0 px-[14px] py-[10px] border-b border-border ${
          buildResult?.error ? 'bg-[rgba(255,92,95,0.05)]' : 'bg-[rgba(52,199,89,0.05)]'
        }`}>
          {buildResult?.error ? (
            <div className="flex items-start gap-[8px]">
              <Icon icon="solar:close-circle-linear" className="text-destructive text-sm shrink-0 mt-[1px]" />
              <p className="text-[10px] text-foreground/70 leading-relaxed flex-1">{buildResult.error}</p>
              <button onClick={copyLog} className="shrink-0 text-foreground/30 hover:text-foreground transition-colors" title="Copy log">
                <Icon icon={copied ? 'solar:check-circle-linear' : 'solar:copy-linear'} className="text-sm" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-[8px]">
              <Icon icon="solar:check-circle-linear" className="text-success text-sm shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-foreground leading-tight">Build Complete</p>
                {(buildResult?.neuronVersion || buildResult?.version) && (
                  <p className="text-[9px] text-foreground/40 font-mono truncate leading-tight mt-[1px]">
                    {buildResult.neuronVersion || buildResult.version}
                  </p>
                )}
              </div>
              <div className="ml-auto flex items-center gap-[10px] shrink-0">
                <button onClick={copyLog} className="text-foreground/30 hover:text-foreground transition-colors" title="Copy log">
                  <Icon icon={copied ? 'solar:check-circle-linear' : 'solar:copy-linear'} className="text-sm" />
                </button>
                {buildResult?.logsUrl && (
                  <button onClick={() => Browser.OpenURL(buildResult.logsUrl)} className="text-foreground/30 hover:text-brand transition-colors" title="Open in browser">
                    <Icon icon="solar:arrow-right-up-linear" className="text-sm" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <LogBusTerminal bus={bus} className="flex-1 min-h-0" />
      {step === 'result' && onRerun && (
        <div className="shrink-0 px-[14px] py-[10px] border-t border-border">
          <button onClick={onRerun} className="text-[10px] text-foreground/35 hover:text-foreground transition-colors flex items-center gap-[6px]">
            <Icon icon="solar:refresh-linear" className="text-sm" />
            Run Build again
          </button>
        </div>
      )}
    </div>
  );
}
