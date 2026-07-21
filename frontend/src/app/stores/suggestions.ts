import { create } from "zustand";
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

interface SuggestionsStore {
  suggestions: Suggestion[];
  addSuggestion: (s: Omit<Suggestion, "id" | "timestamp">) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

export const useSuggestions = create<SuggestionsStore>((set, get) => ({
  suggestions: [],
  addSuggestion: (s) => {
    if (get().suggestions.some((x) => x.definitionId === s.definitionId)) return;
    set((prev) => ({
      suggestions: [{ ...s, id: crypto.randomUUID(), timestamp: Date.now() }, ...prev.suggestions],
    }));
  },
  dismiss: (id) => set((prev) => ({ suggestions: prev.suggestions.filter((x) => x.id !== id) })),
  dismissAll: () => set({ suggestions: [] }),
}));
