import { useEffect } from "react";
import { Icon } from "@iconify/react";
import { useLocalAI, type LocalAIModel, type LocalAIState } from "../stores/localai";

const MODELS: { id: LocalAIModel; label: string; size: string }[] = [
  { id: "gemma4:e2b", label: "e2b · fast", size: "~1.5 GB" },
  { id: "gemma4:12b", label: "12b · better", size: "~7 GB" },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-[32px] h-[18px] rounded-full transition-colors shrink-0 ${checked ? "bg-success" : "bg-foreground/[0.1]"}`}
    >
      <span
        className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${checked ? "left-[16px]" : "left-[2px]"}`}
      />
    </button>
  );
}

function ProgressBar({ pct, indeterminate }: { pct: number; indeterminate?: boolean }) {
  return (
    <div className="h-[3px] rounded-full bg-foreground/[0.08] overflow-hidden">
      <div
        className="h-full bg-purple-400/60 rounded-full transition-all duration-300"
        style={
          indeterminate
            ? { width: "40%", animation: "pulse 1.5s ease-in-out infinite" }
            : { width: `${pct}%` }
        }
      />
    </div>
  );
}

function StatusBadge({ state }: { state: LocalAIState }) {
  if (state.binaryDownloading)
    return <span className="text-[10px] text-purple-300/80 font-mono">Downloading Ollama…</span>;
  if (state.ollamaStarting)
    return <span className="text-[10px] text-foreground/40 font-mono">Starting…</span>;
  if (state.pulling)
    return <span className="text-[10px] text-purple-300/80 font-mono">Downloading model…</span>;
  if (state.modelPulled) return <span className="text-[10px] text-success font-mono">Ready</span>;
  if (state.ollamaRunning)
    return <span className="text-[10px] text-amber-400/80 font-mono">Model not downloaded</span>;
  if (state.binaryReady)
    return <span className="text-[10px] text-amber-400/80 font-mono">Ollama not running</span>;
  if (state.binaryError)
    return <span className="text-[10px] text-destructive/70 font-mono">Download failed</span>;
  return <span className="text-[10px] text-foreground/30 font-mono">Not set up</span>;
}

export function LocalAISetupCard() {
  const { state, setEnabled, setModel, startDownloadBinary, startOllama, startPull, refresh } =
    useLocalAI();

  // After binary download completes, auto-start Ollama
  useEffect(() => {
    if (
      state.binaryReady &&
      !state.ollamaRunning &&
      !state.ollamaStarting &&
      !state.binaryDownloading
    ) {
      startOllama();
    }
  }, [state.binaryReady]);

  // After Ollama starts, refresh model status
  useEffect(() => {
    if (state.ollamaRunning) {
      refresh();
    }
  }, [state.ollamaRunning]);

  const pullPct = state.pullProgress?.total
    ? Math.round((state.pullProgress.completed / state.pullProgress.total) * 100)
    : 0;

  return (
    <div className="bg-foreground/[0.04] rounded-[9px] border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-[12px] py-[8px] border-b border-foreground/10">
        <div className="flex items-center gap-[6px]">
          <Icon icon="solar:cpu-bolt-linear" className="text-[14px] text-purple-400/80" />
          <span className="text-[12px] text-foreground/70 font-medium">Local AI</span>
        </div>
        <Toggle checked={state.enabled} onChange={setEnabled} />
      </div>

      {/* Status row */}
      <div className="flex items-center justify-between px-[12px] py-[8px] border-b border-foreground/10">
        <span className="text-[12px] text-foreground/70 font-medium">Status</span>
        <div className="flex items-center gap-[6px]">
          <StatusBadge state={state} />
          {!state.binaryDownloading && !state.ollamaStarting && !state.pulling && (
            <button
              onClick={refresh}
              className="text-foreground/25 hover:text-foreground/55 transition-colors"
              title="Re-check"
            >
              <Icon icon="solar:refresh-linear" className="text-[12px]" />
            </button>
          )}
        </div>
      </div>

      {/* Model selector */}
      <div className="flex items-center justify-between px-[12px] py-[8px] border-b border-foreground/10">
        <span className="text-[12px] text-foreground/70 font-medium">Model</span>
        <div className="flex items-center gap-[2px] bg-foreground/[0.06] rounded-[6px] p-[2px]">
          {MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => setModel(m.id)}
              disabled={state.pulling || state.binaryDownloading}
              title={m.size}
              className={`px-[8px] py-[3px] rounded-[4px] text-[10px] font-mono transition-colors disabled:opacity-40 ${
                state.model === m.id
                  ? "bg-foreground/[0.1] text-foreground"
                  : "text-foreground/35 hover:text-foreground/70"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ready confirmation */}
      {state.enabled && state.modelPulled && (
        <div className="px-[12px] py-[8px] flex items-center gap-[6px] border-t border-foreground/[0.06]">
          <Icon icon="solar:check-circle-linear" className="text-[12px] text-success/60 shrink-0" />
          <span className="text-[10px] text-foreground/35 font-mono">
            Commit message generation and AI Insights are active
          </span>
        </div>
      )}

      {/* Action area */}
      {state.enabled && !state.modelPulled && (
        <div className="px-[12px] py-[8px] flex flex-col gap-[6px]">
          {/* Step 1: Download Ollama binary */}
          {!state.binaryReady && !state.binaryDownloading && !state.binaryError && (
            <button
              onClick={startDownloadBinary}
              className="w-full flex items-center justify-center gap-[5px] py-[5px] rounded-[6px] bg-purple-500/15 hover:bg-purple-500/20 border border-purple-500/20 text-[11px] text-purple-300/80 font-mono transition-colors"
            >
              <Icon icon="solar:download-minimalistic-linear" className="text-[13px]" />
              Set up Local AI
            </button>
          )}

          {/* Binary download progress */}
          {state.binaryDownloading && (
            <div className="flex flex-col gap-[4px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-foreground/40 font-mono">
                  {state.binaryDownloadLabel || "Preparing…"}
                </span>
                <span className="text-[10px] text-foreground/40 font-mono">
                  {state.binaryDownloadPct}%
                </span>
              </div>
              <ProgressBar pct={state.binaryDownloadPct} />
            </div>
          )}

          {/* Binary error with retry */}
          {state.binaryError && !state.binaryDownloading && (
            <div className="flex flex-col gap-[4px]">
              <div className="flex items-start gap-[5px]">
                <Icon
                  icon="solar:danger-triangle-linear"
                  className="text-[12px] text-destructive/70 shrink-0 mt-[1px]"
                />
                <p className="text-[10px] text-destructive/70 font-mono leading-relaxed flex-1">
                  {state.binaryError}
                </p>
              </div>
              <button
                onClick={startDownloadBinary}
                className="w-full flex items-center justify-center gap-[5px] py-[4px] rounded-[6px] bg-foreground/[0.06] hover:bg-foreground/[0.1] text-[10px] text-foreground/50 font-mono transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* Ollama starting indicator */}
          {state.ollamaStarting && (
            <div className="flex flex-col gap-[4px]">
              <span className="text-[10px] text-foreground/35 font-mono">
                Starting Ollama runtime…
              </span>
              <ProgressBar pct={0} indeterminate />
            </div>
          )}

          {/* Ollama start error */}
          {state.ollamaError && !state.ollamaStarting && (
            <div className="flex flex-col gap-[4px]">
              <div className="flex items-start gap-[5px]">
                <Icon
                  icon="solar:danger-triangle-linear"
                  className="text-[12px] text-destructive/70 shrink-0 mt-[1px]"
                />
                <p className="text-[10px] text-destructive/70 font-mono leading-relaxed">
                  {state.ollamaError}
                </p>
              </div>
              <button
                onClick={startOllama}
                className="w-full flex items-center justify-center gap-[5px] py-[4px] rounded-[6px] bg-foreground/[0.06] hover:bg-foreground/[0.1] text-[10px] text-foreground/50 font-mono transition-colors"
              >
                Retry start
              </button>
            </div>
          )}

          {/* Step 2: Download model */}
          {state.ollamaRunning && !state.modelPulled && !state.pulling && !state.pullError && (
            <button
              onClick={startPull}
              className="w-full flex items-center justify-center gap-[5px] py-[5px] rounded-[6px] bg-purple-500/15 hover:bg-purple-500/20 border border-purple-500/20 text-[11px] text-purple-300/80 font-mono transition-colors"
            >
              <Icon icon="solar:download-minimalistic-linear" className="text-[13px]" />
              Download {state.model} ({MODELS.find((m) => m.id === state.model)?.size})
            </button>
          )}

          {/* Model pull progress */}
          {state.pulling && (
            <div className="flex flex-col gap-[4px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-foreground/40 font-mono">
                  {state.pullProgress?.status || "Downloading…"}
                </span>
                {state.pullProgress?.total ? (
                  <span className="text-[10px] text-foreground/40 font-mono">{pullPct}%</span>
                ) : null}
              </div>
              <ProgressBar pct={pullPct} indeterminate={!state.pullProgress?.total} />
            </div>
          )}

          {/* Model pull error */}
          {state.pullError && !state.pulling && (
            <div className="flex flex-col gap-[4px]">
              <div className="flex items-start gap-[5px]">
                <Icon
                  icon="solar:danger-triangle-linear"
                  className="text-[12px] text-destructive/70 shrink-0 mt-[1px]"
                />
                <p className="text-[10px] text-destructive/70 font-mono leading-relaxed">
                  {state.pullError}
                </p>
              </div>
              <button
                onClick={startPull}
                className="w-full flex items-center justify-center gap-[5px] py-[4px] rounded-[6px] bg-foreground/[0.06] hover:bg-foreground/[0.1] text-[10px] text-foreground/50 font-mono transition-colors"
              >
                Retry download
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
