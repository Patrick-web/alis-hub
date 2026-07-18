import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";

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

const CommandPaletteContext = createContext<CommandPaletteState | null>(null);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [extensions, setExtensions] = useState<Record<string, CommandExtension>>({});
  const [pages, setPages] = useState<PalettePage[]>([]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setPages([]);
  }, []);
  const toggle = useCallback(() => {
    setIsOpen((v) => {
      if (v) setPages([]);
      return !v;
    });
  }, []);

  const registerExtension = useCallback((ext: CommandExtension) => {
    setExtensions((prev) => ({ ...prev, [ext.id]: ext }));
  }, []);

  const unregisterExtension = useCallback((id: string) => {
    setExtensions((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const push = useCallback((page: PalettePage) => {
    setPages((prev) => [...prev, page]);
  }, []);

  const replace = useCallback((page: PalettePage) => {
    setPages((prev) => (prev.length === 0 ? [page] : [...prev.slice(0, -1), page]));
  }, []);

  const pop = useCallback(() => {
    setPages((prev) => prev.slice(0, -1));
  }, []);

  const popToRoot = useCallback(() => setPages([]), []);

  const value = useMemo(
    () => ({
      isOpen,
      extensions,
      pages,
      open,
      close,
      toggle,
      registerExtension,
      unregisterExtension,
      push,
      replace,
      pop,
      popToRoot,
    }),
    [
      isOpen,
      extensions,
      pages,
      open,
      close,
      toggle,
      registerExtension,
      unregisterExtension,
      push,
      replace,
      pop,
      popToRoot,
    ],
  );

  return <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>;
}

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  return ctx;
}

// ── Page-level context ─────────────────────────────────────────────────────────
// Pages (list `useItems` hooks, `Header` and view `Component`s) render without
// props from the palette; this context gives them access to palette navigation.

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
