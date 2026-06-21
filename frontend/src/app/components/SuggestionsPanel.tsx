import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { Sheet, SheetContent } from './ui/sheet';
import { ScrollArea } from './ui/scroll-area';
import { useSuggestions, type Suggestion } from '../stores/suggestions';
import type { SuggestionCategory } from '../stores/labs';
import { SUGGESTION_CATEGORY_ORDER } from '../stores/labs';

interface SuggestionAction {
  label: string;
  variant: 'primary' | 'ghost';
  onClick: () => void;
}

type ActionFactory = (
  s: Suggestion,
  navigate: (path: string) => void,
  dismiss: (id: string) => void,
) => SuggestionAction[];

const ACTION_FACTORIES: Record<string, ActionFactory> = {
  'build-success-deploy': (s, navigate, dismiss) => [
    { label: 'Open Deploy', variant: 'primary', onClick: () => { navigate('/develop'); dismiss(s.id); } },
    { label: 'Dismiss', variant: 'ghost', onClick: () => dismiss(s.id) },
  ],
  'build-failure-verbose': (s, navigate, dismiss) => [
    { label: 'View Terminal', variant: 'primary', onClick: () => { navigate('/develop'); dismiss(s.id); } },
    { label: 'Dismiss', variant: 'ghost', onClick: () => dismiss(s.id) },
  ],
};

function SuggestionCard({ suggestion, actions }: { suggestion: Suggestion; actions: SuggestionAction[] }) {
  return (
    <div className="px-[14px] py-[12px] border-b border-border last:border-0">
      <p className="text-[12px] font-bold text-foreground font-mono">{suggestion.title}</p>
      {suggestion.body && (
        <p className="text-[11px] text-foreground/50 font-mono mt-[2px]">{suggestion.body}</p>
      )}
      {actions.length > 0 && (
        <div className="flex items-center gap-[6px] mt-[8px]">
          {actions.map(action => (
            <button
              key={action.label}
              onClick={action.onClick}
              className={`text-[10px] font-mono font-bold px-[8px] py-[4px] rounded-full transition-colors ${
                action.variant === 'primary'
                  ? 'bg-brand text-black hover:opacity-90'
                  : 'text-foreground/40 hover:text-foreground'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SuggestionsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dismiss, dismissAll, count } = useSuggestions();
  const navigate = useNavigate();

  const grouped = useMemo(() => {
    const map: Partial<Record<SuggestionCategory, Suggestion[]>> = {};
    for (const s of state.suggestions) {
      (map[s.category] ??= []).push(s);
    }
    return map;
  }, [state.suggestions]);

  const orderedCategories = SUGGESTION_CATEGORY_ORDER.filter(c => (grouped[c]?.length ?? 0) > 0);

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent
        side="right"
        className="bg-card border-l border-border text-foreground w-[360px] max-w-[360px] gap-0 p-0 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-[14px] pt-[14px] pb-[12px] border-b border-border pr-[44px]">
          <div className="flex items-center gap-[8px]">
            <Icon icon="solar:lightbulb-bold" className="text-brand text-[16px]" />
            <span className="text-[13px] font-bold text-foreground font-mono">Suggestions</span>
            {count > 0 && (
              <span className="text-[10px] bg-[rgba(248,129,169,0.15)] text-brand px-[6px] py-[1px] rounded-full font-mono font-bold">
                {count}
              </span>
            )}
          </div>
          {count > 0 && (
            <button
              onClick={dismissAll}
              className="text-[10px] text-foreground/40 hover:text-foreground transition-colors font-mono"
            >
              Dismiss all
            </button>
          )}
        </div>

        {/* Body */}
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-[10px] text-foreground/20">
            <Icon icon="solar:lightbulb-linear" className="text-[36px]" />
            <span className="text-[12px] font-mono">No suggestions</span>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            {orderedCategories.map(category => (
              <div key={category}>
                <div className="px-[14px] py-[6px] sticky top-0 bg-card z-10">
                  <span className="text-[10px] text-foreground/30 font-bold uppercase tracking-widest font-mono">
                    {category}
                  </span>
                </div>
                {grouped[category]!.map(s => {
                  const actions = ACTION_FACTORIES[s.definitionId]?.(s, navigate, dismiss) ?? [];
                  return <SuggestionCard key={s.id} suggestion={s} actions={actions} />;
                })}
              </div>
            ))}
          </ScrollArea>
        )}

        {/* Footer */}
        <div className="border-t border-border px-[14px] py-[8px] flex items-center justify-between">
          <span className="text-[10px] text-foreground/20 font-mono">alis hub Labs</span>
          <span className="text-[10px] bg-[rgba(248,129,169,0.1)] text-brand px-[6px] py-[1px] rounded-full font-mono uppercase tracking-wide">
            beta
          </span>
        </div>
      </SheetContent>
    </Sheet>
  );
}
