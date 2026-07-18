import { Icon } from "@iconify/react";
import { Browser } from "@wailsio/runtime";
import { Loader } from "../../Loader";
import type { DefineResult, GlassArtifact, GlassResult } from "../types";

interface GlassViewProps {
  defineResult: DefineResult | null;
  glassResult: GlassResult | null;
  glassLoading: boolean;
  onRerun?: () => void;
}

/** The Define "glass" step — completion banner + Glass artifacts. */
export function GlassView({ defineResult, glassResult, glassLoading, onRerun }: GlassViewProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      {defineResult?.error && (
        <div className="px-[16px] py-[16px] border-b border-border">
          <div className="flex items-start gap-[8px] p-[10px] bg-[rgba(255,92,95,0.1)] border border-[rgba(255,92,95,0.3)] rounded-[6px]">
            <Icon
              icon="solar:close-circle-linear"
              className="text-destructive text-sm shrink-0 mt-[1px]"
            />
            <p className="text-[10px] text-foreground/70 leading-relaxed">{defineResult.error}</p>
          </div>
        </div>
      )}
      {!defineResult?.error && (
        <div className="px-[16px] py-[14px] border-b border-border bg-[rgba(52,199,89,0.05)]">
          <div className="flex items-center gap-[8px] mb-[4px]">
            <Icon icon="solar:check-circle-linear" className="text-success text-base" />
            <p className="text-[11px] font-bold text-foreground">Define Complete</p>
          </div>
          {defineResult?.version && (
            <p className="text-[9px] text-foreground/40 font-mono">
              {defineResult.definition} · v{defineResult.version}
            </p>
          )}
        </div>
      )}
      {glassLoading && (
        <div className="flex items-center gap-[10px] px-[16px] py-[16px]">
          <Loader size={20} />
          <span className="text-[10px] text-foreground/40">Loading Glass...</span>
        </div>
      )}
      {!glassLoading && glassResult && (
        <div className="px-[16px] py-[16px]">
          {glassResult.title && (
            <p className="text-[13px] font-bold text-foreground mb-[6px]">{glassResult.title}</p>
          )}
          {glassResult.summary && (
            <p className="text-[11px] text-foreground/55 leading-[1.6] mb-[16px]">
              {glassResult.summary}
            </p>
          )}
          {(glassResult.definition?.version || glassResult.definition?.releaseType) && (
            <div className="flex gap-[6px] mb-[16px]">
              {glassResult.definition.version && (
                <span className="text-[9px] uppercase font-bold font-mono px-[6px] py-[2px] rounded bg-card border border-border text-foreground/50">
                  {glassResult.definition.version}
                </span>
              )}
              {glassResult.definition.releaseType && (
                <span className="text-[9px] uppercase font-bold font-mono px-[6px] py-[2px] rounded bg-brand-fill/10 border border-brand-fill/30 text-brand">
                  {glassResult.definition.releaseType}
                </span>
              )}
            </div>
          )}
          {glassResult.artifacts && glassResult.artifacts.length > 0 && (
            <div>
              <p className="text-[9px] uppercase font-bold text-foreground/30 mb-[10px] font-mono">
                Artifacts ({glassResult.artifacts.length})
              </p>
              <div className="flex flex-col gap-[2px]">
                {glassResult.artifacts.map((a: GlassArtifact, i: number) => (
                  <div
                    key={i}
                    className="flex items-center gap-[10px] px-[10px] py-[9px] rounded-[6px] bg-background border border-border group"
                  >
                    <span
                      className="size-[6px] rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          a.state === 3
                            ? "#34C759"
                            : a.state === 4
                              ? "#FF5C5F"
                              : a.state === 2
                                ? "#ff9500"
                                : "#7a7a7a",
                      }}
                    />
                    <span className="text-[10px] font-bold font-mono text-foreground flex-1 min-w-0 truncate">
                      {a.type}
                    </span>
                    {a.extra && (
                      <span className="text-[9px] text-foreground/35 max-w-[100px] truncate shrink-0">
                        {a.extra}
                      </span>
                    )}
                    {a.locationUri && (
                      <button
                        onClick={() => Browser.OpenURL(a.locationUri)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-foreground/40 hover:text-brand"
                        title={a.locationUri}
                      >
                        <Icon icon="solar:arrow-right-up-linear" className="text-sm" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {(!glassResult.artifacts || glassResult.artifacts.length === 0) && !glassResult.title && (
            <p className="text-[10px] text-foreground/30">No Glass data available.</p>
          )}
        </div>
      )}
      {!glassLoading && !glassResult && !defineResult?.error && (
        <div className="px-[16px] py-[12px]">
          <p className="text-[10px] text-foreground/30">
            Glass data not available for this definition.
          </p>
        </div>
      )}
      {onRerun && (
        <div className="px-[16px] py-[12px] border-t border-border mt-[8px]">
          <button
            onClick={onRerun}
            className="text-[10px] text-foreground/35 hover:text-foreground transition-colors flex items-center gap-[6px]"
          >
            <Icon icon="solar:refresh-linear" className="text-sm" />
            Run Define again
          </button>
        </div>
      )}
    </div>
  );
}
