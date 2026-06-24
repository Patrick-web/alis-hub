import { useState } from 'react';
import { GitBranch, ForgejoPR } from './types';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { RefreshCw, Plus, ChevronDown, GitPullRequest, ChevronRight, Loader2 } from 'lucide-react';

interface Props {
  repoPath: string;
  currentBranch: string;
  branches: GitBranch[];
  prs: ForgejoPR[];
  loading: boolean;
  creating: boolean;
  merging: number | null;
  onRefresh: () => void;
  onCreate: (title: string, body: string, head: string, base: string) => Promise<void>;
  onMerge: (number: number, style: 'merge' | 'rebase' | 'squash') => Promise<void>;
}

const MERGE_STYLES: { value: 'merge' | 'rebase' | 'squash'; label: string }[] = [
  { value: 'merge', label: 'Create a merge commit' },
  { value: 'rebase', label: 'Rebase and fast-forward' },
  { value: 'squash', label: 'Squash and merge' },
];

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function GitPRPanel({
  currentBranch, branches, prs, loading, creating, merging,
  onRefresh, onCreate, onMerge,
}: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [head, setHead] = useState(currentBranch);
  const [base, setBase] = useState('main');
  const [expandedPR, setExpandedPR] = useState<number | null>(null);
  const [mergeStyle, setMergeStyle] = useState<'merge' | 'rebase' | 'squash'>('merge');

  const localBranches = branches.filter(b => !b.isRemote).map(b => b.name);

  async function handleCreate() {
    if (!title.trim()) return;
    await onCreate(title.trim(), body.trim(), head, base);
    setTitle('');
    setBody('');
    setShowCreate(false);
  }

  function toggleCreate() {
    if (!showCreate) {
      setHead(currentBranch);
    }
    setShowCreate(v => !v);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-foreground/10">
        <GitPullRequest size={13} className="text-foreground/40 shrink-0" />
        <span className="text-xs text-foreground/60 flex-1">
          Pull Requests
          {prs.length > 0 && (
            <span className="ml-1.5 text-[10px] bg-pink-600/30 text-pink-400 border border-pink-500/30 rounded px-1.5 py-0.5">
              {prs.length}
            </span>
          )}
        </span>
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Refresh"
          className="p-1 rounded hover:bg-foreground/5 text-foreground/40 hover:text-foreground/70 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={toggleCreate}
          title="New pull request"
          className={`p-1 rounded transition-colors ${
            showCreate
              ? 'bg-pink-600/20 text-pink-400'
              : 'hover:bg-foreground/5 text-foreground/40 hover:text-foreground/70'
          }`}
        >
          <Plus size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* New PR form */}
        <Collapsible.Root open={showCreate}>
          <Collapsible.Content>
            <div className="px-3 py-2.5 border-b border-foreground/10 flex flex-col gap-2 bg-foreground/[0.02]">
              <input
                autoFocus={showCreate}
                className="text-xs bg-foreground/5 border border-foreground/15 rounded px-2 py-1.5 text-foreground/80 outline-none focus:border-pink-500/40 w-full"
                placeholder="Pull request title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleCreate()}
              />
              <textarea
                className="text-xs bg-foreground/5 border border-foreground/15 rounded px-2 py-1.5 text-foreground/80 outline-none focus:border-pink-500/40 w-full resize-none"
                placeholder="Description (optional)"
                rows={3}
                value={body}
                onChange={e => setBody(e.target.value)}
              />
              <div className="flex gap-1.5">
                <BranchSelect
                  label="From"
                  value={head}
                  options={localBranches}
                  onChange={setHead}
                />
                <span className="text-foreground/30 text-xs self-center">→</span>
                <BranchSelect
                  label="Into"
                  value={base}
                  options={localBranches}
                  onChange={setBase}
                />
              </div>
              <div className="flex gap-1.5 justify-end">
                <button
                  onClick={() => setShowCreate(false)}
                  className="text-[11px] text-foreground/40 hover:text-foreground/60 px-2 py-1 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!title.trim() || creating}
                  className="text-[11px] bg-pink-600/30 text-pink-400 border border-pink-500/30 hover:bg-pink-600/40 disabled:opacity-40 px-2.5 py-1 rounded transition-colors flex items-center gap-1"
                >
                  {creating && <Loader2 size={10} className="animate-spin" />}
                  Create PR
                </button>
              </div>
            </div>
          </Collapsible.Content>
        </Collapsible.Root>

        {/* PR list */}
        {loading && prs.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-foreground/30">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : prs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-1">
            <GitPullRequest size={20} className="text-foreground/15" />
            <p className="text-xs text-foreground/30">No open pull requests</p>
          </div>
        ) : (
          <div>
            {prs.map(pr => {
              const isExpanded = expandedPR === pr.number;
              const isMerging = merging === pr.number;
              return (
                <div key={pr.number} className="border-b border-foreground/8 last:border-b-0">
                  <button
                    onClick={() => setExpandedPR(isExpanded ? null : pr.number)}
                    className="w-full flex items-start gap-1.5 px-3 py-2.5 hover:bg-foreground/[0.03] transition-colors text-left"
                  >
                    <ChevronRight
                      size={11}
                      className={`mt-0.5 shrink-0 text-foreground/30 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5 min-w-0">
                        <span className="text-[10px] text-foreground/30 shrink-0">#{pr.number}</span>
                        <span className="text-xs text-foreground/80 truncate">{pr.title}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] text-pink-400/70 font-mono truncate max-w-[80px]">{pr.headBranch}</span>
                        <span className="text-[10px] text-foreground/25">→</span>
                        <span className="text-[10px] text-foreground/40 font-mono truncate max-w-[80px]">{pr.baseBranch}</span>
                        <span className="text-[10px] text-foreground/25 ml-auto shrink-0">
                          {pr.author} · {relativeTime(pr.createdAt)}
                        </span>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 bg-foreground/[0.02] border-t border-foreground/5">
                      {pr.body && (
                        <p className="text-xs text-foreground/50 mt-2 mb-3 whitespace-pre-wrap leading-relaxed">
                          {pr.body}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-2">
                        {!pr.mergeable && (
                          <span className="text-[10px] text-amber-400/70">Not mergeable</span>
                        )}
                        <div className="flex-1" />
                        {/* Merge style picker */}
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <button className="flex items-center gap-1 text-[10px] text-foreground/40 hover:text-foreground/60 px-1.5 py-1 rounded hover:bg-foreground/5 transition-colors">
                              {MERGE_STYLES.find(s => s.value === mergeStyle)?.label ?? 'Merge'}
                              <ChevronDown size={10} />
                            </button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content
                              className="z-50 min-w-[180px] rounded-md bg-background border border-foreground/10 shadow-xl py-1 text-xs"
                              sideOffset={4}
                              align="end"
                            >
                              {MERGE_STYLES.map(s => (
                                <DropdownMenu.Item
                                  key={s.value}
                                  className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-foreground/5 outline-none text-foreground/70"
                                  onSelect={() => setMergeStyle(s.value)}
                                >
                                  {mergeStyle === s.value && (
                                    <span className="text-pink-400 text-[10px]">✓</span>
                                  )}
                                  <span style={{ marginLeft: mergeStyle === s.value ? 0 : 14 }}>
                                    {s.label}
                                  </span>
                                </DropdownMenu.Item>
                              ))}
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                        <button
                          onClick={() => onMerge(pr.number, mergeStyle)}
                          disabled={!pr.mergeable || isMerging}
                          className="text-[11px] bg-pink-600/30 text-pink-400 border border-pink-500/30 hover:bg-pink-600/40 disabled:opacity-40 px-2.5 py-1 rounded transition-colors flex items-center gap-1"
                        >
                          {isMerging && <Loader2 size={10} className="animate-spin" />}
                          Merge
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function BranchSelect({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex items-center gap-1 text-[10px] bg-foreground/5 border border-foreground/15 rounded px-1.5 py-1 text-foreground/70 hover:border-foreground/25 transition-colors flex-1 min-w-0">
          <span className="text-foreground/30 shrink-0">{label}</span>
          <span className="font-mono truncate flex-1">{value}</span>
          <ChevronDown size={9} className="shrink-0 text-foreground/30" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[160px] max-h-[200px] overflow-y-auto rounded-md bg-background border border-foreground/10 shadow-xl py-1 text-xs"
          sideOffset={4}
        >
          {options.map(opt => (
            <DropdownMenu.Item
              key={opt}
              className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-foreground/5 outline-none text-foreground/70 font-mono"
              onSelect={() => onChange(opt)}
            >
              {opt === value && <span className="text-pink-400 text-[10px]">✓</span>}
              <span style={{ marginLeft: opt === value ? 0 : 14 }}>{opt}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
