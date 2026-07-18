import { Icon } from "@iconify/react";
import { Loader } from "../../Loader";

interface DefineRunViewProps {
  error: string | null;
  progressMsg: string;
  version?: string;
  onRetry?: () => void;
}

/** The Define "running" step — spinner/error with live progress notes. */
export function DefineRunView({ error, progressMsg, version, onRetry }: DefineRunViewProps) {
  return (
    <div className="flex-1 overflow-y-auto px-[16px] py-[24px]">
      <div className="flex flex-col items-center gap-[16px]">
        {error ? (
          <div className="size-[48px] rounded-full bg-[rgba(255,92,95,0.1)] border border-[rgba(255,92,95,0.3)] flex items-center justify-center">
            <Icon icon="solar:close-circle-linear" className="text-destructive text-xl" />
          </div>
        ) : (
          <div className="size-[48px] rounded-full bg-brand-fill/10 border border-brand-fill/30 flex items-center justify-center">
            <Loader size={20} />
          </div>
        )}
        <div className="text-center">
          <p className="text-[12px] font-bold text-foreground mb-[6px]">
            {error ? "Define Failed" : "Running Define"}
          </p>
          <p className="text-[10px] text-foreground/50 leading-[1.5] max-w-[280px] text-center">
            {error || progressMsg}
          </p>
        </div>
        {!error && version && (
          <div className="bg-card border border-border rounded-[6px] px-[12px] py-[6px]">
            <span className="text-[9px] font-bold font-mono text-foreground/50">v{version}</span>
          </div>
        )}
        {error && onRetry && (
          <button
            onClick={onRetry}
            className="text-[10px] text-foreground/35 hover:text-foreground transition-colors flex items-center gap-[6px]"
          >
            <Icon icon="solar:refresh-linear" className="text-sm" />
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
