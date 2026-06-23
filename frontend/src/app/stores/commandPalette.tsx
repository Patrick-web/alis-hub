import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

// Context passed to onSelect — extensions call these to control the palette
export interface CommandPaletteContext {
  close: () => void;
  showResult: (result: CommandResult) => void;
}

export interface CommandResultAction {
  label: string;
  variant?: 'primary' | 'secondary';
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
  badge?: { text: string; variant: 'warning' | 'error' | 'info' };
  onSelect: (ctx: CommandPaletteContext) => void;
}

export interface CommandExtension {
  id: string;
  commands: CommandItem[];
}

interface CommandPaletteState {
  isOpen: boolean;
  extensions: Record<string, CommandExtension>;
  open: () => void;
  close: () => void;
  toggle: () => void;
  registerExtension: (ext: CommandExtension) => void;
  unregisterExtension: (id: string) => void;
}

const CommandPaletteContext = createContext<CommandPaletteState | null>(null);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [extensions, setExtensions] = useState<Record<string, CommandExtension>>({});

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(v => !v), []);

  const registerExtension = useCallback((ext: CommandExtension) => {
    setExtensions(prev => ({ ...prev, [ext.id]: ext }));
  }, []);

  const unregisterExtension = useCallback((id: string) => {
    setExtensions(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  return (
    <CommandPaletteContext.Provider
      value={{ isOpen, extensions, open, close, toggle, registerExtension, unregisterExtension }}
    >
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error('useCommandPalette must be used within CommandPaletteProvider');
  return ctx;
}
