import * as Collapsible from '@radix-ui/react-collapsible';
import { Icon } from '@iconify/react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, FolderTree, List, Minus, Plus, RefreshCw, RotateCcw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useSourceControl } from '../../stores/sourceControl';
import { getFileIcon } from '../../utils/fileIcon';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { GitFileStatus, GitStatus } from './types';

interface Props {
  status: GitStatus;
  selectedFile: string | null;
  selectedStaged: boolean;
  commitMessage: string;
  committing: boolean;
  generatingCommitMsg: boolean;
  ahead?: number;
  behind?: number;
  isMerging?: boolean;
  onSelectFile: (path: string, staged: boolean) => void;
  onSelectConflictFile?: (path: string) => void;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onStageMany: (paths: string[]) => void;
  onUnstageMany: (paths: string[]) => void;
  onDiscard: (paths: string[]) => void;
  onStageAll: () => void;
  onCommit: () => void;
  onContinueMerge?: () => void;
  onCommitMessageChange: (msg: string) => void;
  onGenerateCommitMessage: () => void;
  onSync?: () => void;
}

interface TreeNode {
  name: string;
  key: string;
  children: Map<string, TreeNode>;
  items: Array<GitFileStatus | string>;
}

function buildTree(files: Array<GitFileStatus | string>): TreeNode {
  const root: TreeNode = { name: '', key: 'root', children: new Map(), items: [] };
  for (const file of files) {
    const path = typeof file === 'string' ? file : file.path;
    const parts = path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (!node.children.has(seg)) {
        node.children.set(seg, { name: seg, key: `${node.key}/${seg}`, children: new Map(), items: [] });
      }
      node = node.children.get(seg)!;
    }
    node.items.push(file);
  }
  return root;
}

function collectPaths(node: TreeNode): string[] {
  const paths: string[] = [];
  for (const item of node.items) {
    paths.push(typeof item === 'string' ? item : item.path);
  }
  for (const child of node.children.values()) {
    paths.push(...collectPaths(child));
  }
  return paths;
}

function statusIcon(code: string) {
  switch (code) {
    case 'A': return <span className="text-green-400 text-[10px] font-bold w-3 shrink-0">A</span>;
    case 'D': return <span className="text-red-400 text-[10px] font-bold w-3 shrink-0">D</span>;
    case 'R': return <span className="text-blue-400 text-[10px] font-bold w-3 shrink-0">R</span>;
    case '?': return <span className="text-green-400/70 text-[10px] font-bold w-3 shrink-0">U</span>;
    default:  return <span className="text-yellow-400 text-[10px] font-bold w-3 shrink-0">M</span>;
  }
}

function conflictStatusIcon() {
  return <span className="text-red-400 text-[10px] font-bold w-3 shrink-0">!</span>;
}

function filePart(path: string) {
  return path.split('/').pop() ?? path;
}

function FileRow({
  file, staged, selected, onSelect, onAction1, onAction2,
  action1Icon, action2Icon, action1Title, action2Title, indent, conflict,
}: {
  file: GitFileStatus | string;
  staged: boolean;
  selected: boolean;
  onSelect: () => void;
  onAction1?: () => void;
  onAction2?: () => void;
  action1Icon?: React.ReactNode;
  action2Icon?: React.ReactNode;
  action1Title?: string;
  action2Title?: string;
  indent?: number;
  conflict?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const path = typeof file === 'string' ? file : file.path;
  const code = typeof file === 'string' ? '?' : file.statusCode;

  return (
    <div
      className={`group flex items-center gap-1.5 py-[3px] pr-3 cursor-pointer text-xs transition-colors ${
        selected ? 'bg-pink-500/15 text-foreground' : 'text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80'
      }`}
      style={{ paddingLeft: `${indent ?? 12}px` }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onSelect}
      title={path}
    >
      {conflict ? conflictStatusIcon() : statusIcon(code)}
      <Icon icon={getFileIcon(path)} className="shrink-0 text-sm" />
      <span className="flex-1 truncate">{filePart(path)}</span>
      {hover && (
        <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
          {onAction1 && (
            <button title={action1Title} onClick={onAction1} className="p-0.5 rounded hover:bg-foreground/10 text-foreground/50 hover:text-foreground/90">
              {action1Icon}
            </button>
          )}
          {onAction2 && (
            <button title={action2Title} onClick={onAction2} className="p-0.5 rounded hover:bg-foreground/10 text-foreground/50 hover:text-foreground/90">
              {action2Icon}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TreeDir({
  node, depth, staged, selectedFile, selectedStaged,
  onSelectFile, onAction1, onAction2, action1Icon, action2Icon, action1Title, action2Title,
  onFolderAction1, onFolderAction2, conflict,
}: {
  node: TreeNode;
  depth: number;
  staged: boolean;
  selectedFile: string | null;
  selectedStaged: boolean;
  onSelectFile: (path: string, staged: boolean) => void;
  onAction1?: (path: string) => void;
  onAction2?: (path: string) => void;
  action1Icon?: React.ReactNode;
  action2Icon?: React.ReactNode;
  action1Title?: string;
  action2Title?: string;
  onFolderAction1?: (paths: string[]) => void;
  onFolderAction2?: (paths: string[]) => void;
  conflict?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [folderHover, setFolderHover] = useState(false);
  const dirs = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));
  const pl = depth * 12;

  const folderPaths = collectPaths(node);

  return (
    <>
      {node.name && (
        <div
          className="flex items-center gap-1 py-[3px] pr-3 cursor-pointer text-xs text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5 select-none"
          style={{ paddingLeft: `${pl}px` }}
          onMouseEnter={() => setFolderHover(true)}
          onMouseLeave={() => setFolderHover(false)}
          onClick={() => setOpen(o => !o)}
        >
          {open
            ? <ChevronDown size={10} className="shrink-0" />
            : <ChevronRight size={10} className="shrink-0" />
          }
          {open
            ? <FolderOpen size={11} className="shrink-0 text-foreground/30" />
            : <Folder size={11} className="shrink-0 text-foreground/30" />
          }
          <span className="flex-1 truncate">{node.name}</span>
          {folderHover && (onFolderAction1 || onFolderAction2) && (
            <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
              {onFolderAction1 && (
                <button
                  title={action1Title}
                  onClick={() => onFolderAction1(folderPaths)}
                  className="p-0.5 rounded hover:bg-foreground/10 text-foreground/50 hover:text-foreground/90"
                >
                  {action1Icon}
                </button>
              )}
              {onFolderAction2 && (
                <button
                  title={action2Title}
                  onClick={() => onFolderAction2(folderPaths)}
                  className="p-0.5 rounded hover:bg-foreground/10 text-foreground/50 hover:text-foreground/90"
                >
                  {action2Icon}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {open && (
        <>
          {dirs.map(child => (
            <TreeDir
              key={child.key}
              node={child}
              depth={depth + 1}
              staged={staged}
              selectedFile={selectedFile}
              selectedStaged={selectedStaged}
              onSelectFile={onSelectFile}
              onAction1={onAction1}
              onAction2={onAction2}
              action1Icon={action1Icon}
              action2Icon={action2Icon}
              action1Title={action1Title}
              action2Title={action2Title}
              onFolderAction1={onFolderAction1}
              onFolderAction2={onFolderAction2}
              conflict={conflict}
            />
          ))}
          {node.items.map(file => {
            const path = typeof file === 'string' ? file : file.path;
            return (
              <FileRow
                key={path}
                file={file}
                staged={staged}
                selected={selectedFile === path && staged === selectedStaged}
                onSelect={() => onSelectFile(path, staged)}
                onAction1={onAction1 ? () => onAction1(path) : undefined}
                onAction2={onAction2 ? () => onAction2(path) : undefined}
                action1Icon={action1Icon}
                action2Icon={action2Icon}
                action1Title={action1Title}
                action2Title={action2Title}
                indent={pl + 12}
                conflict={conflict}
              />
            );
          })}
        </>
      )}
    </>
  );
}

function Section({
  title, count, defaultOpen, children, headerAction, hideCount,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  headerAction?: React.ReactNode;
  hideCount?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger asChild>
        <div className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer hover:bg-foreground/5 group">
          {open ? <ChevronDown size={11} className="text-foreground/40 shrink-0" /> : <ChevronRight size={11} className="text-foreground/40 shrink-0" />}
          <span className="text-[10px] uppercase tracking-wider text-foreground/50 font-semibold flex-1">{title}</span>
          {!hideCount && <span className="text-[10px] text-foreground/30">{count}</span>}
          {headerAction && <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>{headerAction}</div>}
        </div>
      </Collapsible.Trigger>
      <Collapsible.Content>{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}

export function GitFileList({
  status, selectedFile, selectedStaged, commitMessage, committing, generatingCommitMsg,
  ahead, behind, isMerging,
  onSelectFile, onSelectConflictFile, onStage, onUnstage, onStageMany, onUnstageMany, onDiscard, onStageAll, onCommit, onContinueMerge, onCommitMessageChange, onGenerateCommitMessage,
  onSync,
}: Props) {
  const { state: scState, setFileListView } = useSourceControl();
  const treeMode = scState.fileListView === 'tree';
  const mergeUntracked = scState.mergeUntracked;
  const canCommit = status.staged.length > 0 && commitMessage.trim().length > 0 && !committing;
  const canContinue = isMerging && status.conflicted.length === 0 && !committing;

  const changesItems: Array<GitFileStatus | string> = mergeUntracked
    ? [...status.unstaged, ...status.untracked]
    : status.unstaged;
  const changesPaths = changesItems.map(f => (typeof f === 'string' ? f : f.path));

  const conflictedTree = buildTree(status.conflicted);
  const stagedTree = buildTree(status.staged);
  const unstagedTree = buildTree(changesItems);
  const untrackedTree = buildTree(status.untracked);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Commit box — at top like VSCode */}
      <div className="shrink-0 border-b border-foreground/10 p-3 flex flex-col gap-2">
        <textarea
          className="w-full bg-foreground/5 border border-foreground/10 rounded text-xs text-foreground/80 placeholder-white/25 p-2 resize-none outline-none focus:border-pink-500/40 transition-colors"
          rows={3}
          placeholder="Commit message…"
          value={commitMessage}
          onChange={e => onCommitMessageChange(e.target.value)}
        />
        {!isMerging && (
          <button
            onClick={onGenerateCommitMessage}
            disabled={status.staged.length === 0 || generatingCommitMsg || committing}
            className="w-full py-1 rounded text-[11px] font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-foreground/[0.06] hover:bg-foreground/[0.1] text-foreground/60 flex items-center justify-center gap-1.5"
          >
            <Sparkles size={11} className="text-purple-400/80" />
            {generatingCommitMsg ? 'Generating…' : 'Generate with AI'}
          </button>
        )}
        {isMerging ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onContinueMerge}
                disabled={!canContinue}
                className="w-full py-1.5 rounded text-[11px] font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white"
              >
                {committing ? 'Continuing…' : 'Continue'}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {status.conflicted.length > 0 ? 'Resolve all conflicts to continue the merge' : 'Continue Merge'}
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={onCommit}
            disabled={!canCommit}
            className="w-full py-1.5 rounded text-[11px] font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-pink-600 hover:bg-pink-500 text-foreground"
          >
            {committing ? 'Committing…' : `Commit (${status.staged.length} file${status.staged.length !== 1 ? 's' : ''})`}
          </button>
        )}
        {(!!ahead || !!behind) && onSync && (
          <button
            onClick={onSync}
            className="w-full py-1.5 rounded text-[11px] font-semibold transition-colors bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-1.5"
          >
            <RefreshCw size={11} />
            Sync Changes{ahead ? ` ${ahead}↑` : ''}{behind ? ` ${behind}↓` : ''}
          </button>
        )}
      </div>

      {/* View toggle */}
      <div className="shrink-0 flex items-center justify-end gap-1 px-2 py-1 border-b border-foreground/10">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setFileListView('list')}
              className={`p-1 rounded transition-colors ${!treeMode ? 'text-foreground/80 bg-foreground/10' : 'text-foreground/30 hover:text-foreground/50'}`}
            >
              <List size={12} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">List view</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setFileListView('tree')}
              className={`p-1 rounded transition-colors ${treeMode ? 'text-foreground/80 bg-foreground/10' : 'text-foreground/30 hover:text-foreground/50'}`}
            >
              <FolderTree size={12} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Tree view</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Merge conflicts */}
        {status.conflicted.length > 0 && (
          <Section title="Merge Changes" count={status.conflicted.length}>
            {treeMode ? (
              <TreeDir
                node={conflictedTree}
                depth={1}
                staged={false}
                selectedFile={selectedFile}
                selectedStaged={selectedStaged}
                onSelectFile={(path) => onSelectConflictFile?.(path)}
                conflict
              />
            ) : (
              status.conflicted.map(f => (
                <FileRow
                  key={f.path}
                  file={f}
                  staged={false}
                  selected={false}
                  onSelect={() => onSelectConflictFile?.(f.path)}
                  conflict
                />
              ))
            )}
          </Section>
        )}

        {/* Staged */}
        <Section
          title="Staged Changes"
          count={status.staged.length}
          headerAction={
            status.staged.length > 0 ? (
              <button
                title="Unstage all"
                onClick={() => onUnstageMany(status.staged.map(f => f.path))}
                className="p-0.5 rounded hover:bg-foreground/10 text-foreground/30 hover:text-foreground/70"
              >
                <Minus size={11} />
              </button>
            ) : undefined
          }
        >
          {treeMode ? (
            <TreeDir
              node={stagedTree}
              depth={1}
              staged
              selectedFile={selectedFile}
              selectedStaged={selectedStaged}
              onSelectFile={onSelectFile}
              onAction1={onUnstage}
              action1Icon={<Minus size={11} />}
              action1Title="Unstage"
              onFolderAction1={onUnstageMany}
            />
          ) : (
            status.staged.map(f => (
              <FileRow
                key={f.path}
                file={f}
                staged
                selected={selectedFile === f.path && selectedStaged}
                onSelect={() => onSelectFile(f.path, true)}
                onAction1={() => onUnstage(f.path)}
                action1Icon={<Minus size={11} />}
                action1Title="Unstage"
              />
            ))
          )}
          {status.staged.length === 0 && (
            <div className="px-3 py-1 text-[11px] text-foreground/20 italic">No staged changes</div>
          )}
        </Section>

        {/* Unstaged */}
        <Section
          title="Changes"
          count={changesItems.length}
          hideCount={changesItems.length > 0}
          headerAction={
            changesItems.length > 0 ? (
              <>
                <button
                  title="Discard all changes"
                  onClick={() => onDiscard(changesPaths)}
                  className="p-0.5 rounded hover:bg-foreground/10 text-foreground/30 hover:text-foreground/70"
                >
                  <RotateCcw size={11} />
                </button>
                <button
                  title="Stage all changes"
                  onClick={onStageAll}
                  className="p-0.5 rounded hover:bg-foreground/10 text-foreground/30 hover:text-foreground/70"
                >
                  <Plus size={11} />
                </button>
              </>
            ) : undefined
          }
        >
          {treeMode ? (
            <TreeDir
              node={unstagedTree}
              depth={1}
              staged={false}
              selectedFile={selectedFile}
              selectedStaged={selectedStaged}
              onSelectFile={onSelectFile}
              onAction1={onStage}
              onAction2={(path) => onDiscard([path])}
              action1Icon={<Plus size={11} />}
              action2Icon={<RotateCcw size={11} />}
              action1Title="Stage"
              action2Title="Discard changes"
              onFolderAction1={onStageMany}
              onFolderAction2={onDiscard}
            />
          ) : (
            changesItems.map(f => {
              const path = typeof f === 'string' ? f : f.path;
              return (
                <FileRow
                  key={path}
                  file={f}
                  staged={false}
                  selected={selectedFile === path && !selectedStaged}
                  onSelect={() => onSelectFile(path, false)}
                  onAction1={() => onStage(path)}
                  onAction2={() => onDiscard([path])}
                  action1Icon={<Plus size={11} />}
                  action2Icon={<RotateCcw size={11} />}
                  action1Title="Stage"
                  action2Title="Discard changes"
                />
              );
            })
          )}
          {changesItems.length === 0 && (
            <div className="px-3 py-1 text-[11px] text-foreground/20 italic">No changes</div>
          )}
        </Section>

        {/* Untracked */}
        {!mergeUntracked && status.untracked.length > 0 && (
          <Section title="Untracked" count={status.untracked.length} defaultOpen={false}>
            {treeMode ? (
              <TreeDir
                node={untrackedTree}
                depth={1}
                staged={false}
                selectedFile={selectedFile}
                selectedStaged={selectedStaged}
                onSelectFile={onSelectFile}
                onAction1={onStage}
                action1Icon={<Plus size={11} />}
                action1Title="Stage file"
                onFolderAction1={onStageMany}
              />
            ) : (
              status.untracked.map(p => (
                <FileRow
                  key={p}
                  file={{ path: p, statusCode: '?', oldPath: '' }}
                  staged={false}
                  selected={false}
                  onSelect={() => onSelectFile(p, false)}
                  onAction1={() => onStage(p)}
                  action1Icon={<Plus size={11} />}
                  action1Title="Stage file"
                />
              ))
            )}
          </Section>
        )}
      </div>

    </div>
  );
}
