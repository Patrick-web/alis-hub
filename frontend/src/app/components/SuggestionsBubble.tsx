import { useState } from 'react';
import { Icon } from '@iconify/react';
import { useSuggestions } from '../stores/suggestions';
import { SuggestionsPanel } from './SuggestionsPanel';

export function SuggestionsBubble() {
  const { count } = useSuggestions();
  const [panelOpen, setPanelOpen] = useState(false);

  if (count === 0) return null;

  return (
    <>
      <button
        style={{ position: 'fixed', bottom: 38, right: 16, zIndex: 9998 }}
        onClick={() => setPanelOpen(true)}
        className="flex items-center gap-[6px] h-[28px] px-[10px] rounded-full bg-card border border-border shadow-[0_4px_16px_rgba(0,0,0,0.5)] hover:border-[rgba(248,129,169,0.4)] transition-all"
      >
        <Icon icon="solar:lightbulb-linear" className="text-brand text-[13px]" />
        <span className="text-[10px] font-bold font-mono text-brand">
          {count} suggestion{count !== 1 ? 's' : ''}
        </span>
        <span className="w-[5px] h-[5px] rounded-full bg-brand animate-pulse" />
      </button>
      <SuggestionsPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
}
