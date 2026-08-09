import { useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { Loader } from "../../Loader";

export interface DefineArtifactStatus {
  name: string;
  state: string;
  errorDetails?: string;
}

interface DefineRunViewProps {
  error: string | null;
  progressMsg: string;
  version?: string;
  onRetry?: () => void;
  /** Every line the operation has reported, oldest first. */
  transcript?: string[];
  /** Per-artifact outcome, which is where a define's real failure reason lives. */
  artifacts?: DefineArtifactStatus[];
}

/** An artifact state that means the artifact did not come out. */
function isArtifactFailure(state: string): boolean {
  const s = state.toUpperCase();
  return s.includes("FAIL") || s.includes("ERROR");
}

/**
 * The running transcript.
 *
 * A define has no logs page — the CLI documents logsUri as build-and-deploy
 * only — so these events, one per state change from `alis operations wait`, are
 * the whole account of what happened. Rendering only the newest as a single
 * replaced line discarded the rest.
 */
function Transcript({ lines }: { lines: string[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  return (
    <div className="w-full max-h-[220px] overflow-y-auto bg-card border border-border rounded-[6px] px-[10px] py-[8px]">
      {lines.map((line, i) => (
        <p
          key={i}
          className={`text-[9px] font-mono leading-[1.6] break-words ${
            i === lines.length - 1 ? "text-foreground/70" : "text-foreground/35"
          }`}
        >
          {line}
        </p>
      ))}
      <div ref={endRef} />
    </div>
  );
}

/** The Define "running" step — spinner/error, live transcript, artifact outcomes. */
export function DefineRunView({
  error,
  progressMsg,
  version,
  onRetry,
  transcript = [],
  artifacts = [],
}: DefineRunViewProps) {
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

        {artifacts.length > 0 && (
          <div className="w-full flex flex-col gap-[4px]">
            <span className="text-[9px] text-foreground/25 font-mono uppercase tracking-[0.12em]">
              Artifacts
            </span>
            {artifacts.map((a) => {
              const failed = isArtifactFailure(a.state);
              return (
                <div
                  key={a.name}
                  className="bg-card border border-border rounded-[6px] px-[10px] py-[7px]"
                >
                  <div className="flex items-start gap-[8px]">
                    <Icon
                      icon={failed ? "solar:close-circle-linear" : "solar:check-circle-linear"}
                      className={`text-[12px] shrink-0 mt-[1px] ${
                        failed ? "text-destructive" : "text-success"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-mono text-foreground/70 break-all">{a.name}</p>
                      <p className="text-[9px] font-mono text-foreground/35 mt-[1px]">
                        {a.state.toLowerCase().replace(/_/g, " ")}
                      </p>
                      {/* The reason a define failed lives here and nowhere else. */}
                      {a.errorDetails && (
                        <p className="text-[9px] text-destructive/80 leading-relaxed mt-[3px] break-words">
                          {a.errorDetails}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {transcript.length > 0 && <Transcript lines={transcript} />}

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
