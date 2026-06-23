import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useMemo, useState, useCallback } from 'react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '../ui/context-menu';
import { GitCommit } from './types';
import * as GitService from '../../../../bindings/alis-hub-v3/gitservice';
import type { CommitFile } from '../../../../bindings/alis-hub-v3/models';

const LANE_COLORS = ['#f472b6', '#60a5fa', '#34d399', '#facc15', '#a78bfa', '#fb923c', '#22d3ee', '#f87171'];
const ROW_H = 28;
const FILE_ROW_H = 22;
const GRAPH_W = 14;
const DOT_R = 4;

interface Lane {
  hash: string;
  lane: number;
  color: string;
}

interface GraphRow {
  commit: GitCommit;
  lane: number;
  color: string;
  edges: { fromLane: number; toLane: number; color: string }[];
  activeLanes: Lane[];
}

type ListItem =
  | { kind: 'commit'; graphRow: GraphRow }
  | { kind: 'file'; commitHash: string; file: CommitFile };

function assignLanes(commits: GitCommit[]): GraphRow[] {
  const rows: GraphRow[] = [];
  const openLanes: Lane[] = [];

  function freeLane(): number {
    const used = new Set(openLanes.map(l => l.lane));
    let i = 0;
    while (used.has(i)) i++;
    return i;
  }

  for (const commit of commits) {
    const existing = openLanes.find(l => l.hash === commit.hash);
    const lane = existing ? existing.lane : freeLane();
    const color = LANE_COLORS[lane % LANE_COLORS.length];

    const edges: GraphRow['edges'] = [];
    const newLanes: Lane[] = [];
    let parentIdx = 0;
    for (const ol of openLanes) {
      if (ol.hash === commit.hash) continue;
      newLanes.push(ol);
    }
    for (const parentHash of commit.parentHashes) {
      const alreadyOpen = newLanes.find(l => l.hash === parentHash);
      if (!alreadyOpen) {
        const parentLane = parentIdx === 0 ? lane : freeLane();
        parentIdx++;
        const parentColor = LANE_COLORS[parentLane % LANE_COLORS.length];
        newLanes.push({ hash: parentHash, lane: parentLane, color: parentColor });
        edges.push({ fromLane: lane, toLane: parentLane, color: parentColor });
      } else {
        edges.push({ fromLane: lane, toLane: alreadyOpen.lane, color: alreadyOpen.color });
      }
    }

    openLanes.length = 0;
    openLanes.push(...newLanes.sort((a, b) => a.lane - b.lane));
    rows.push({ commit, lane, color, edges, activeLanes: [...openLanes] });
  }
  return rows;
}

function formatRelTime(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

function fileStatusColor(code: string): string {
  switch (code[0]) {
    case 'A': return 'text-green-400';
    case 'D': return 'text-red-400';
    case 'R': return 'text-blue-400';
    default:  return 'text-yellow-400';
  }
}

function fileName(path: string): string {
  return path.split('/').pop() ?? path;
}

interface Props {
  commits: GitCommit[];
  repoPath: string;
  onSelectCommit?: (hash: string) => void;
  onSelectCommitFile?: (hash: string, filePath: string) => void;
  selectedHash?: string | null;
  selectedCommitFile?: { hash: string; path: string } | null;
}

export function GitGraph({ commits, repoPath, onSelectCommit, onSelectCommitFile, selectedHash, selectedCommitFile }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const graphRows = useMemo(() => assignLanes(commits), [commits]);
  const maxLane = useMemo(() => Math.max(0, ...graphRows.map(r => r.lane)), [graphRows]);
  const svgWidth = (maxLane + 2) * GRAPH_W;

  const unpushedHashes = useMemo((): Set<string> => {
    const headCommit = commits.find(c => c.refNames.some(r => r.startsWith('HEAD -> ')));
    if (!headCommit) return new Set();
    const currentBranch = headCommit.refNames.find(r => r.startsWith('HEAD -> '))!.replace('HEAD -> ', '');
    const remoteRef = `origin/${currentBranch}`;
    const remoteCommit = commits.find(c => c.refNames.includes(remoteRef));
    if (!remoteCommit) return new Set();
    const commitMap = new Map(commits.map(c => [c.hash, c]));
    const unpushed = new Set<string>();
    const visited = new Set<string>();
    const queue = [headCommit.hash];
    while (queue.length > 0) {
      const hash = queue.shift()!;
      if (visited.has(hash) || hash === remoteCommit.hash) continue;
      visited.add(hash);
      unpushed.add(hash);
      for (const p of commitMap.get(hash)?.parentHashes ?? []) queue.push(p);
    }
    return unpushed;
  }, [commits]);

  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const [commitFilesCache, setCommitFilesCache] = useState<Record<string, CommitFile[]>>({});
  const [loadingHash, setLoadingHash] = useState<string | null>(null);

  const listItems = useMemo((): ListItem[] => {
    const result: ListItem[] = [];
    for (const gr of graphRows) {
      result.push({ kind: 'commit', graphRow: gr });
      if (gr.commit.hash === expandedHash) {
        const files = commitFilesCache[expandedHash] ?? [];
        for (const f of files) {
          result.push({ kind: 'file', commitHash: gr.commit.hash, file: f });
        }
      }
    }
    return result;
  }, [graphRows, expandedHash, commitFilesCache]);

  const virtualizer = useVirtualizer({
    count: listItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => listItems[i]?.kind === 'file' ? FILE_ROW_H : ROW_H,
    overscan: 10,
  });

  const handleCommitClick = useCallback(async (hash: string) => {
    onSelectCommit?.(hash);

    if (hash === expandedHash) {
      setExpandedHash(null);
      return;
    }

    setExpandedHash(hash);

    if (commitFilesCache[hash]) return;

    setLoadingHash(hash);
    try {
      const files = await GitService.GetCommitFiles(repoPath, hash);
      setCommitFilesCache(prev => ({ ...prev, [hash]: files ?? [] }));
    } catch {
      setCommitFilesCache(prev => ({ ...prev, [hash]: [] }));
    } finally {
      setLoadingHash(null);
    }
  }, [repoPath, expandedHash, commitFilesCache, onSelectCommit]);

  if (commits.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-foreground/20 text-sm">
        No commits
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-auto select-none">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(vItem => {
          const item = listItems[vItem.index];

          if (item.kind === 'file') {
            const isFileSelected = selectedCommitFile?.hash === item.commitHash && selectedCommitFile?.path === item.file.path;
            return (
              <div
                key={`${item.commitHash}:${item.file.path}`}
                style={{ position: 'absolute', top: vItem.start, height: FILE_ROW_H, width: '100%' }}
                className={`flex items-center gap-1.5 pl-6 pr-3 cursor-pointer transition-colors text-xs ${
                  isFileSelected ? 'bg-pink-500/15 text-foreground' : 'text-foreground/50 hover:bg-foreground/5 hover:text-foreground/80'
                }`}
                onClick={() => onSelectCommitFile?.(item.commitHash, item.file.path)}
              >
                <span className={`text-[10px] font-bold w-3 shrink-0 ${fileStatusColor(item.file.statusCode)}`}>
                  {item.file.statusCode[0]}
                </span>
                <span className="truncate flex-1 font-mono text-[11px]" title={item.file.path}>
                  {fileName(item.file.path)}
                </span>
                <span className="text-[10px] text-foreground/20 truncate shrink-0 max-w-[40%]" title={item.file.path}>
                  {item.file.path.includes('/') ? item.file.path.split('/').slice(0, -1).join('/') : ''}
                </span>
              </div>
            );
          }

          const { commit, lane, color, edges } = item.graphRow;
          const row = item.graphRow;
          const cx = lane * GRAPH_W + GRAPH_W / 2;
          const isSelected = commit.hash === selectedHash || commit.hash === expandedHash;
          const isExpanded = commit.hash === expandedHash;
          const isLoading = commit.hash === loadingHash;

          return (
            <ContextMenu key={commit.hash}>
              <ContextMenuTrigger asChild>
                <div
                  style={{ position: 'absolute', top: vItem.start, height: ROW_H, width: '100%' }}
                  className={`flex items-center gap-2 cursor-pointer transition-colors ${
                    isSelected ? 'bg-pink-500/10' : 'hover:bg-foreground/5'
                  }`}
                  onClick={() => handleCommitClick(commit.hash)}
                >
                  {/* SVG graph column */}
                  <svg width={svgWidth} height={ROW_H} style={{ flexShrink: 0 }}>
                    {row.activeLanes.map(al => {
                      const alCx = al.lane * GRAPH_W + GRAPH_W / 2;
                      if (al.hash === commit.hash) return null;
                      return (
                        <line
                          key={`cont-${al.hash}`}
                          x1={alCx} y1={0} x2={alCx} y2={ROW_H}
                          stroke={al.color} strokeWidth={1.5} opacity={0.5}
                        />
                      );
                    })}
                    {edges.map((e, i) => {
                      const fromX = e.fromLane * GRAPH_W + GRAPH_W / 2;
                      const toX = e.toLane * GRAPH_W + GRAPH_W / 2;
                      const d = fromX === toX
                        ? `M ${fromX} ${ROW_H / 2} L ${toX} ${ROW_H}`
                        : `M ${fromX} ${ROW_H / 2} C ${fromX} ${ROW_H * 0.8} ${toX} ${ROW_H * 0.8} ${toX} ${ROW_H}`;
                      return <path key={i} d={d} stroke={e.color} strokeWidth={1.5} fill="none" opacity={0.7} />;
                    })}
                    {unpushedHashes.has(commit.hash)
                      ? <circle cx={cx} cy={ROW_H / 2} r={DOT_R} fill="transparent" stroke={color} strokeWidth={1.5} />
                      : <circle cx={cx} cy={ROW_H / 2} r={DOT_R} fill={color} />
                    }
                  </svg>

                  {/* Text */}
                  <div className="flex-1 min-w-0 flex items-center gap-2 pr-3">
                    {/* Expand indicator */}
                    <span className="text-[9px] text-foreground/20 shrink-0 w-3 text-center">
                      {isLoading ? '…' : isExpanded ? '▾' : '▸'}
                    </span>
                    <span className="text-xs text-foreground/80 truncate flex-1">{commit.subject}</span>
                    {commit.refNames.length > 0 && (
                      <div className="flex items-center gap-1 shrink-0">
                        {commit.refNames.slice(0, 2).map(ref => (
                          <span key={ref} className="text-[9px] px-1.5 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30">
                            {ref.replace(/^HEAD -> /, '').replace(/^origin\//, '')}
                          </span>
                        ))}
                      </div>
                    )}
                    <span className="text-[10px] text-foreground/30 shrink-0 font-mono">{commit.hash.slice(0, 7)}</span>
                    <span className="text-[10px] text-foreground/30 shrink-0">{formatRelTime(commit.timestamp)}</span>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => navigator.clipboard.writeText(commit.hash)}>
                  Copy commit SHA
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => navigator.clipboard.writeText(commit.subject)}>
                  Copy commit message
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </div>
  );
}
