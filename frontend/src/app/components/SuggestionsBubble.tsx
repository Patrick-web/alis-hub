import React, { useState } from "react";
import { Icon } from "@iconify/react";
import { useSuggestions } from "../stores/suggestions";
import { SuggestionsPanel } from "./SuggestionsPanel";

export function SuggestionsBubble() {
  const count = useSuggestions((s) => s.suggestions.length);
  const [panelOpen, setPanelOpen] = useState(false);

  if (count === 0) return null;

  return (
    <>
      <button
        style={
          {
            position: "fixed",
            bottom: 38,
            right: 16,
            zIndex: 9998,
            background: "rgba(18,18,22,0.82)",
            backdropFilter: "blur(20px) saturate(160%)",
            WebkitBackdropFilter: "blur(20px) saturate(160%)",
          } as React.CSSProperties
        }
        onClick={() => setPanelOpen(true)}
        className="flex items-center gap-[6px] h-[28px] px-[10px] rounded-full border border-white/[0.12] shadow-[0_4px_16px_rgba(0,0,0,0.5)] hover:border-brand-fill/40 transition-all"
      >
        <Icon icon="solar:lightbulb-linear" className="text-brand text-[13px]" />
        <span className="text-[10px] font-bold font-mono text-brand">
          {count} suggestion{count !== 1 ? "s" : ""}
        </span>
        <span className="w-[5px] h-[5px] rounded-full bg-brand-fill animate-pulse" />
      </button>
      <SuggestionsPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
}
