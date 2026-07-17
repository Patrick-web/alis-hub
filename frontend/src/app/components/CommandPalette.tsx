import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  NavigationIcon,
  HammerIcon,
  WrenchIcon,
  FileCodeIcon,
  PackageIcon,
  RocketIcon,
  ServerIcon,
  GitBranchIcon,
  LayersIcon,
  BlocksIcon,
  InfoIcon,
  CheckCircleIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from './ui/command';
import { Loader } from './Loader';
import { CheckCircle } from './develop/CheckCircle';
import {
  useCommandPalette,
  PalettePageProvider,
  type CommandItem as PaletteCommandItem,
  type CommandPaletteContext,
  type CommandResult,
  type CommandResultAction,
  type PaletteFooterAction,
  type PaletteListItem,
  type PaletteListPage,
  type PalettePage,
} from '../stores/commandPalette';
import { commandScore } from '../lib/commandScore';

// ── Navigation commands (core built-in) ───────────────────────────────────────

interface NavCommand {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  keywords: string[];
}

const NAV_COMMANDS: NavCommand[] = [
  { id: 'nav-about',        title: 'Go to About',         icon: InfoIcon,         path: '/about',        keywords: ['about', 'home'] },
  { id: 'nav-develop',      title: 'Go to Develop',        icon: HammerIcon,       path: '/develop',      keywords: ['develop', 'services', 'neurons'] },
  { id: 'nav-builds',       title: 'Go to Builds',         icon: WrenchIcon,       path: '/builds',       keywords: ['builds', 'build'] },
  { id: 'nav-deployments',  title: 'Go to Deployments',    icon: RocketIcon,       path: '/deployments',  keywords: ['deployments', 'deploy'] },
  { id: 'nav-environments', title: 'Go to Environments',   icon: ServerIcon,       path: '/environments', keywords: ['environments', 'env'] },
  { id: 'nav-tools',        title: 'Go to Tools',          icon: LayersIcon,       path: '/tools',        keywords: ['tools', 'gcloud', 'cloud'] },
  { id: 'nav-git',          title: 'Go to Source Control', icon: GitBranchIcon,    path: '/git',          keywords: ['git', 'source', 'control', 'vcs'] },
  { id: 'nav-buildkit',     title: 'Go to BuildKit',       icon: BlocksIcon,       path: '/buildkit',     keywords: ['buildkit', 'agents', 'mcp'] },
  { id: 'nav-codeblocks',   title: 'Go to Codeblocks',     icon: FileCodeIcon,     path: '/codeblocks',   keywords: ['codeblocks', 'code'] },
];

// ── ResultPanel — generic post-action view ────────────────────────────────────

function ResultPanel({
  result,
  onDismiss,
}: {
  result: CommandResult;
  onDismiss: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-green-500" />
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{result.title}</span>
          {result.subtitle && (
            <span className="text-muted-foreground text-xs">{result.subtitle}</span>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        {result.actions.map((action: CommandResultAction, i) => (
          <button
            key={i}
            onClick={action.onAction}
            className={
              action.variant === 'primary'
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors'
                : 'border-border text-foreground hover:bg-accent inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium transition-colors'
            }
          >
            {action.label}
          </button>
        ))}
        {!result.actions.some(a => a.label === 'Dismiss') && (
          <button
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────

function CommandBadge({ text, variant }: { text: string; variant: 'warning' | 'error' | 'info' }) {
  const colors = {
    warning: 'bg-amber-500/15 text-amber-500',
    error: 'bg-red-500/15 text-red-500',
    info: 'bg-blue-500/15 text-blue-500',
  };
  return (
    <span className={`ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${colors[variant]}`}>
      {variant === 'warning' && <TriangleAlertIcon className="size-2.5" />}
      {text}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

// Unified command shape covering both core navigation and extension commands.
interface UnifiedCommand {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
  groupOrder: number;
  icon?: React.ComponentType<{ className?: string }>;
  keywords: string[];
  badge?: { text: string; variant: 'warning' | 'error' | 'info' };
  isNav: boolean;
  run: (ctx: CommandPaletteContext, navigate: ReturnType<typeof useNavigate>) => void;
}

function CommandRow({
  cmd,
  ctx,
  navigate,
}: {
  cmd: UnifiedCommand;
  ctx: CommandPaletteContext;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const IconComp = cmd.icon;
  return (
    <CommandItem
      value={cmd.id}
      keywords={[cmd.title, ...cmd.keywords]}
      onSelect={() => cmd.run(ctx, navigate)}
    >
      {IconComp ? (
        <IconComp className="text-muted-foreground size-4" />
      ) : (
        <PackageIcon className="text-muted-foreground size-4" />
      )}
      <span>{cmd.title}</span>
      {cmd.subtitle && (
        <span className="text-muted-foreground ml-1 text-xs">{cmd.subtitle}</span>
      )}
      {cmd.isNav && <NavigationIcon className="text-muted-foreground ml-auto size-3 opacity-50" />}
      {cmd.badge && <CommandBadge text={cmd.badge.text} variant={cmd.badge.variant} />}
    </CommandItem>
  );
}

// ── Sub-page rendering ────────────────────────────────────────────────────────

function PaletteItemRow({ item, ctx }: { item: PaletteListItem; ctx: CommandPaletteContext }) {
  const IconComp = item.icon;
  return (
    <CommandItem
      value={item.id}
      keywords={[item.title, ...(item.keywords ?? [])]}
      disabled={item.disabled}
      onSelect={() => item.onSelect(ctx)}
    >
      {item.checked !== undefined && <CheckCircle selected={item.checked} size={14} />}
      {IconComp && <IconComp className="text-muted-foreground size-4" />}
      <div className="flex min-w-0 flex-col">
        <span className="truncate">{item.title}</span>
        {item.subtitle && (
          <span className="text-muted-foreground truncate text-xs">{item.subtitle}</span>
        )}
      </div>
      {item.hint && (
        <span className="text-muted-foreground ml-auto shrink-0 text-xs">{item.hint}</span>
      )}
    </CommandItem>
  );
}

function PaletteListPageView({
  page,
  query,
  ctx,
}: {
  page: PaletteListPage;
  query: string;
  ctx: CommandPaletteContext;
}) {
  const { items, loading, empty } = page.useItems();
  const q = query.trim();

  const visible = useMemo(() => {
    const pinned = items.filter(i => i.pinned);
    const rest = items.filter(i => !i.pinned);
    if (!q) return [...pinned, ...rest];
    const matched = rest
      .map(item => ({ item, score: commandScore(item.title, q, [...(item.keywords ?? []), ...(item.subtitle ? [item.subtitle] : [])]) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
      .map(({ item }) => item);
    return [...pinned, ...matched];
  }, [items, q]);

  const Header = page.Header;

  return (
    <>
      {Header && <Header />}
      <CommandList className="max-h-[420px]">
        {loading ? (
          <div className="flex items-center gap-2.5 px-4 py-5">
            <Loader size={18} />
            <span className="text-muted-foreground text-xs">Loading...</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="text-muted-foreground py-6 text-center text-sm">
            {q ? 'No results found.' : (empty ?? 'Nothing here.')}
          </div>
        ) : (
          <CommandGroup>
            {visible.map(item => (
              <PaletteItemRow key={item.id} item={item} ctx={ctx} />
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </>
  );
}

function isEditableTarget(e: React.KeyboardEvent | KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

function matchesCombo(e: React.KeyboardEvent, combo: PaletteFooterAction['combo']): boolean {
  if (e.key.toLowerCase() !== combo.key.toLowerCase()) return false;
  const wantsMeta = !!combo.meta;
  const hasMeta = e.metaKey || e.ctrlKey;
  if (wantsMeta !== hasMeta) return false;
  if (!!combo.shift !== e.shiftKey) return false;
  if (!!combo.alt !== e.altKey) return false;
  return true;
}

function FooterHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
      {label}
      <kbd className="bg-accent text-accent-foreground rounded px-1 py-0.5 font-mono text-[10px]">{keys}</kbd>
    </span>
  );
}

export function CommandPalette() {
  const {
    isOpen, close, extensions, pages,
    push, replace, pop, popToRoot,
  } = useCommandPalette();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const activePage: PalettePage | null = pages.length > 0 ? pages[pages.length - 1] : null;

  const ctx: CommandPaletteContext = useMemo(() => ({
    close,
    push,
    replace,
    pop,
    popToRoot,
    showResult: (result: CommandResult) => {
      push({
        kind: 'view',
        id: `result-${Date.now()}`,
        title: 'Result',
        Component: () => <ResultPanel result={result} onDismiss={close} />,
      });
    },
  }), [close, push, replace, pop, popToRoot]);

  // Page-scoped query: reset when navigating between pages.
  const pageKey = activePage ? `${pages.length}:${activePage.id}` : 'root';
  useEffect(() => {
    setQuery('');
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [pageKey]);

  function handleOpenChange(open: boolean) {
    if (!open) {
      close();
      setQuery('');
    }
  }

  // Escape pops one level; closes only at root.
  const handleEscapeKeyDown = useCallback((e: KeyboardEvent) => {
    if (pages.length > 0) {
      e.preventDefault();
      pop();
    }
  }, [pages.length, pop]);

  // Footer action combos + Backspace navigation on view pages.
  function handleRootKeyDown(e: React.KeyboardEvent) {
    for (const action of activePage?.footerActions ?? []) {
      if (matchesCombo(e, action.combo)) {
        e.preventDefault();
        e.stopPropagation();
        action.onAction(ctx);
        return;
      }
    }
    if (
      e.key === 'Backspace' &&
      pages.length > 0 &&
      activePage?.kind === 'view' &&
      !isEditableTarget(e)
    ) {
      e.preventDefault();
      pop();
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && query === '' && pages.length > 0) {
      e.preventDefault();
      pop();
    }
  }

  // Flatten all commands (core navigation + extensions) into a single list.
  const allCommands = useMemo<UnifiedCommand[]>(() => {
    const nav: UnifiedCommand[] = NAV_COMMANDS.map(cmd => ({
      id: cmd.id,
      title: cmd.title,
      group: 'Navigation',
      groupOrder: 0,
      icon: cmd.icon,
      keywords: cmd.keywords,
      isNav: true,
      run: (_ctx, nav) => { nav(cmd.path); close(); },
    }));

    const ext: UnifiedCommand[] = Object.values(extensions)
      .flatMap(e => e.commands)
      .map((cmd: PaletteCommandItem) => ({
        id: cmd.id,
        title: cmd.title,
        subtitle: cmd.subtitle,
        group: cmd.group,
        groupOrder: cmd.groupOrder ?? 99,
        icon: cmd.icon,
        keywords: cmd.keywords ?? [],
        badge: cmd.badge,
        isNav: false,
        run: (ctx) => cmd.onSelect(ctx),
      }));

    return [...nav, ...ext];
  }, [extensions, close]);

  // Grouped view for the empty query, preserving category order.
  const groups = useMemo(() => {
    const map = new Map<string, { order: number; items: UnifiedCommand[] }>();
    for (const cmd of allCommands) {
      if (!map.has(cmd.group)) map.set(cmd.group, { order: cmd.groupOrder, items: [] });
      map.get(cmd.group)!.items.push(cmd);
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([heading, { items }]) => ({ heading, items }));
  }, [allCommands]);

  // Flat relevance-ranked results while searching — ignores category boundaries.
  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return allCommands
      .map(cmd => ({ cmd, score: commandScore(cmd.title, q, cmd.keywords) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.cmd.groupOrder - b.cmd.groupOrder || a.cmd.title.localeCompare(b.cmd.title))
      .map(({ cmd }) => cmd);
  }, [allCommands, query]);

  const searching = query.trim().length > 0;
  const showInput = !activePage || activePage.kind === 'list';

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={handleOpenChange}
      onEscapeKeyDown={handleEscapeKeyDown}
      contentClassName="sm:max-w-[620px]"
      shouldFilter={false}
    >
      <PalettePageProvider value={ctx}>
      <div className="flex flex-col" onKeyDown={handleRootKeyDown}>
        {/* Breadcrumbs */}
        {pages.length > 0 && (
          <div className="flex items-center gap-1 border-b px-3 py-2">
            <button
              onClick={popToRoot}
              className="text-muted-foreground hover:text-foreground bg-accent/50 rounded px-1.5 py-0.5 text-[11px] transition-colors"
            >
              Home
            </button>
            {pages.map((p, i) => (
              <span key={`${i}-${p.id}`} className="flex items-center gap-1">
                <span className="text-muted-foreground text-[11px]">›</span>
                {i === pages.length - 1 ? (
                  <span className="text-foreground bg-accent rounded px-1.5 py-0.5 text-[11px] font-medium">{p.title}</span>
                ) : (
                  <button
                    onClick={() => { for (let n = pages.length - 1; n > i; n--) pop(); }}
                    className="text-muted-foreground hover:text-foreground bg-accent/50 rounded px-1.5 py-0.5 text-[11px] transition-colors"
                  >
                    {p.title}
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {showInput && (
          <CommandInput
            ref={inputRef}
            placeholder={activePage?.placeholder ?? 'Search commands...'}
            value={query}
            onValueChange={setQuery}
            onKeyDown={handleInputKeyDown}
          />
        )}

        {/* Body */}
        {!activePage ? (
          <CommandList className="max-h-[420px]">
            <CommandEmpty>No commands found.</CommandEmpty>

            {searching ? (
              <CommandGroup>
                {results.map(cmd => (
                  <CommandRow key={cmd.id} cmd={cmd} ctx={ctx} navigate={navigate} />
                ))}
              </CommandGroup>
            ) : (
              groups.map(group => (
                <CommandGroup key={group.heading} heading={group.heading}>
                  {group.items.map(cmd => (
                    <CommandRow key={cmd.id} cmd={cmd} ctx={ctx} navigate={navigate} />
                  ))}
                </CommandGroup>
              ))
            )}
          </CommandList>
        ) : activePage.kind === 'list' ? (
          <PaletteListPageView key={activePage.id} page={activePage} query={query} ctx={ctx} />
        ) : (
          <div key={activePage.id} className="flex max-h-[440px] min-h-[200px] flex-col overflow-y-auto">
            <activePage.Component />
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-3 py-2">
          <div className="flex items-center gap-3">
            {activePage?.kind !== 'view' && <FooterHint keys="↵" label="Select" />}
            {pages.length > 0 && <FooterHint keys="⌫" label="Back" />}
          </div>
          <div className="flex items-center gap-2">
            {(activePage?.footerActions ?? []).map(action => (
              <button
                key={action.label}
                onClick={() => action.onAction(ctx)}
                className="text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] transition-colors"
              >
                {action.label}
                <kbd className="bg-accent text-accent-foreground rounded px-1 py-0.5 font-mono text-[10px]">{action.keys}</kbd>
              </button>
            ))}
          </div>
        </div>
      </div>
      </PalettePageProvider>
    </CommandDialog>
  );
}
