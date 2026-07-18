import { createContext, useContext, type ReactNode } from "react";
import { create } from "zustand";

// ── Paging API ─────────────────────────────────────────────────────────────────
// The palette supports Raycast-style sub-pages. Extensions push pages onto a
// stack; Backspace (on an empty query) and Escape pop back. Two page kinds:
//
//  - list: renders palette-native rows with page-scoped fuzzy search and full
//    cmdk keyboard navigation. Items come from a `useItems` hook so pages can
//    subscribe to live stores (sessions, workspace, ...).
//  - view: renders an arbitrary component (confirm summaries, progress
//    mirrors, ...). The search input is hidden.

export interface PaletteListItem {
  id: string;
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  keywords?: string[];
  /** Right-aligned hint text (e.g. relative time, version). */
  hint?: string;
  /** Multi-select check state; renders a check circle when defined. */
  checked?: boolean;
  /** Pinned items bypass filtering and stay at the top of the list. */
  pinned?: boolean;
  disabled?: boolean;
  onSelect: (ctx: CommandPaletteContext) => void;
}

export interface PaletteFooterAction {
  label: string;
  /** Display hint, e.g. '⌘↵'. */
  keys: string;
  combo: { key: string; meta?: boolean; shift?: boolean; alt?: boolean };
  onAction: (ctx: CommandPaletteContext) => void;
}

interface PalettePageBase {
  id: string;
  /** Breadcrumb label. */
  title: string;
  placeholder?: string;
  footerActions?: PaletteFooterAction[];
}

export interface PaletteListPage extends PalettePageBase {
  kind: "list";
  /** Hook returning the live items for this page. Called from a component
   * keyed by page id, so it may use any React hooks / store subscriptions. */
  useItems: () => { items: PaletteListItem[]; loading?: boolean; empty?: string };
  /** Optional header rendered above the list (e.g. a commit summary). */
  Header?: React.ComponentType;
}

export interface PaletteViewPage extends PalettePageBase {
  kind: "view";
  Component: React.ComponentType;
}

export type PalettePage = PaletteListPage | PaletteViewPage;

// Context passed to onSelect — extensions call these to control the palette
export interface CommandPaletteContext {
  close: () => void;
  showResult: (result: CommandResult) => void;
  push: (page: PalettePage) => void;
  /** Replaces the top of the stack (or pushes when at root). */
  replace: (page: PalettePage) => void;
  pop: () => void;
  popToRoot: () => void;
}

export interface CommandResultAction {
  label: string;
  variant?: "primary" | "secondary";
  onAction: () => void;
}

export interface CommandResult {
  title: string;
  subtitle?: string;
  actions: CommandResultAction[];
}

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
  groupOrder?: number;
  icon?: React.ComponentType<{ className?: string }>;
  keywords?: string[];
  badge?: { text: string; variant: "warning" | "error" | "info" };
  onSelect: (ctx: CommandPaletteContext) => void;
}

export interface CommandExtension {
  id: string;
  commands: CommandItem[];
}

interface CommandPaletteState {
  isOpen: boolean;
  extensions: Record<string, CommandExtension>;
  pages: PalettePage[];
  open: () => void;
  close: () => void;
  toggle: () => void;
  registerExtension: (ext: CommandExtension) => void;
  unregisterExtension: (id: string) => void;
  push: (page: PalettePage) => void;
  replace: (page: PalettePage) => void;
  pop: () => void;
  popToRoot: () => void;
}

export const useCommandPalette = create<CommandPaletteState>((set) => ({
  isOpen: false,
  extensions: {},
  pages: [],
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, pages: [] }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen, pages: [] })),
  registerExtension: (ext) => set((s) => ({ extensions: { ...s.extensions, [ext.id]: ext } })),
  unregisterExtension: (id) =>
    set((s) => {
      const next = { ...s.extensions };
      delete next[id];
      return { extensions: next };
    }),
  push: (page) => set((s) => ({ pages: [...s.pages, page] })),
  replace: (page) =>
    set((s) => ({ pages: s.pages.length === 0 ? [page] : [...s.pages.slice(0, -1), page] })),
  pop: () => set((s) => ({ pages: s.pages.slice(0, -1) })),
  popToRoot: () => set({ pages: [] }),
}));

// ── Page-level context ─────────────────────────────────────────────────────────
// Pages (list `useItems` hooks, `Header` and view `Component`s) render without
// props from the palette; this context gives them access to palette navigation.
// Stays a React context: it is render-tree-scoped composition, not global state.

const PalettePageCtx = createContext<CommandPaletteContext | null>(null);

export function PalettePageProvider({
  value,
  children,
}: {
  value: CommandPaletteContext;
  children: ReactNode;
}) {
  return <PalettePageCtx.Provider value={value}>{children}</PalettePageCtx.Provider>;
}

export function usePalettePage(): CommandPaletteContext {
  const ctx = useContext(PalettePageCtx);
  if (!ctx) throw new Error("usePalettePage must be used within an open command palette page");
  return ctx;
}
