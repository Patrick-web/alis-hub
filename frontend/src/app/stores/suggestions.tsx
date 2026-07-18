import { createContext, useContext, useCallback, useMemo, useReducer, type ReactNode } from "react";
import type { SuggestionCategory } from "./labs";

export interface Suggestion {
  id: string;
  definitionId: string;
  category: SuggestionCategory;
  title: string;
  body?: string;
  priority: "passive" | "interruptive";
  timestamp: number;
}

interface SuggestionsState {
  suggestions: Suggestion[];
}

type SuggestionsAction =
  | { type: "ADD"; payload: Suggestion }
  | { type: "DISMISS"; payload: string }
  | { type: "DISMISS_ALL" };

interface SuggestionsContextValue {
  state: SuggestionsState;
  addSuggestion: (s: Omit<Suggestion, "id" | "timestamp">) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  count: number;
}

function reducer(state: SuggestionsState, action: SuggestionsAction): SuggestionsState {
  switch (action.type) {
    case "ADD":
      if (state.suggestions.some((s) => s.definitionId === action.payload.definitionId)) {
        return state;
      }
      return { suggestions: [action.payload, ...state.suggestions] };
    case "DISMISS":
      return { suggestions: state.suggestions.filter((s) => s.id !== action.payload) };
    case "DISMISS_ALL":
      return { suggestions: [] };
    default:
      return state;
  }
}

const SuggestionsContext = createContext<SuggestionsContextValue | null>(null);

export function SuggestionsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { suggestions: [] });

  const addSuggestion = useCallback((s: Omit<Suggestion, "id" | "timestamp">) => {
    dispatch({ type: "ADD", payload: { ...s, id: crypto.randomUUID(), timestamp: Date.now() } });
  }, []);

  const dismiss = useCallback((id: string) => {
    dispatch({ type: "DISMISS", payload: id });
  }, []);

  const dismissAll = useCallback(() => {
    dispatch({ type: "DISMISS_ALL" });
  }, []);

  const count = useMemo(() => state.suggestions.length, [state.suggestions]);

  return (
    <SuggestionsContext.Provider value={{ state, addSuggestion, dismiss, dismissAll, count }}>
      {children}
    </SuggestionsContext.Provider>
  );
}

export function useSuggestions() {
  const ctx = useContext(SuggestionsContext);
  if (!ctx) throw new Error("useSuggestions must be used within SuggestionsProvider");
  return ctx;
}
