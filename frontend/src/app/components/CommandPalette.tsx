import { useState, useCallback, useMemo } from 'react';
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
import {
  useCommandPalette,
  type CommandItem as PaletteCommandItem,
  type CommandPaletteContext,
  type CommandResult,
  type CommandResultAction,
} from '../stores/commandPalette';

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

export function CommandPalette() {
  const { isOpen, close, extensions } = useCommandPalette();
  const navigate = useNavigate();
  const [resultView, setResultView] = useState<CommandResult | null>(null);

  const showResult = useCallback((result: CommandResult) => setResultView(result), []);

  const ctx: CommandPaletteContext = useMemo(() => ({ close, showResult }), [close, showResult]);

  function handleOpenChange(open: boolean) {
    if (!open) {
      close();
      setResultView(null);
    }
  }

  // Aggregate and sort extension commands by groupOrder then group name
  const extensionGroups = useMemo(() => {
    const allCommands = Object.values(extensions).flatMap(ext => ext.commands);
    const grouped = new Map<string, { order: number; items: PaletteCommandItem[] }>();
    for (const cmd of allCommands) {
      if (!grouped.has(cmd.group)) {
        grouped.set(cmd.group, { order: cmd.groupOrder ?? 99, items: [] });
      }
      grouped.get(cmd.group)!.items.push(cmd);
    }
    return Array.from(grouped.entries())
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([heading, { items }]) => ({ heading, items }));
  }, [extensions]);

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={handleOpenChange}
      contentClassName="sm:max-w-[620px]"
    >
      {resultView ? (
        <ResultPanel result={resultView} onDismiss={() => { setResultView(null); close(); }} />
      ) : (
        <>
          <CommandInput placeholder="Search commands..." />
          <CommandList className="max-h-[420px]">
            <CommandEmpty>No commands found.</CommandEmpty>

            {/* Navigation — core built-in */}
            <CommandGroup heading="Navigation">
              {NAV_COMMANDS.map(cmd => (
                <CommandItem
                  key={cmd.id}
                  value={`${cmd.title} ${cmd.keywords.join(' ')}`}
                  onSelect={() => {
                    navigate(cmd.path);
                    close();
                  }}
                >
                  <cmd.icon className="text-muted-foreground size-4" />
                  <span>{cmd.title}</span>
                  <NavigationIcon className="text-muted-foreground ml-auto size-3 opacity-50" />
                </CommandItem>
              ))}
            </CommandGroup>

            {/* Extension groups */}
            {extensionGroups.map(group => (
              <CommandGroup key={group.heading} heading={group.heading}>
                {group.items.map(cmd => (
                  <CommandItem
                    key={cmd.id}
                    value={`${cmd.title} ${(cmd.keywords ?? []).join(' ')}`}
                    onSelect={() => cmd.onSelect(ctx)}
                  >
                    {cmd.icon ? (
                      <cmd.icon className="text-muted-foreground size-4" />
                    ) : (
                      <PackageIcon className="text-muted-foreground size-4" />
                    )}
                    <span>{cmd.title}</span>
                    {cmd.subtitle && (
                      <span className="text-muted-foreground ml-1 text-xs">{cmd.subtitle}</span>
                    )}
                    {cmd.badge && <CommandBadge text={cmd.badge.text} variant={cmd.badge.variant} />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </>
      )}
    </CommandDialog>
  );
}
