import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown, ChevronRight, Folder, FolderOpen, FolderTree, List, Minus, Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { GitFileStatus, GitStatus } from './types';

interface Props {
  status: GitStatus;
  selectedFile: string | null;
  selectedStaged: boolean;
  commitMessage: string;
  committing: boolean;
  onSelectFile: (path: string, staged: boolean) => void;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onDiscard: (path: string) => void;
  onStageAll: () => void;
  onCommit: () => void;
  onCommitMessageChange: (msg: string) => void;
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

function statusIcon(code: string) {
  switch (code) {
    case 'A': return <span className="text-green-400 text-[10px] font-bold w-3 shrink-0">A</span>;
    case 'D': return <span className="text-red-400 text-[10px] font-bold w-3 shrink-0">D</span>;
    case 'R': return <span className="text-blue-400 text-[10px] font-bold w-3 shrink-0">R</span>;
    default:  return <span className="text-yellow-400 text-[10px] font-bold w-3 shrink-0">M</span>;
  }
}

function filePart(path: string) {
  return path.split('/').pop() ?? path;
}

function FileRow({
  file, staged, selected, onSelect, onAction1, onAction2,
  action1Icon, action2Icon, action1Title, action2Title, indent,
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
}) {
  const [hover, setHover] = useState(false);
  const path = typeof file === 'string' ? file : file.path;
  const code = typeof file === 'string' ? '?' : file.statusCode;

  return (
    <div
      className={`group flex items-center gap-1.5 py-[3px] pr-3 cursor-pointer text-xs transition-colors ${
        selected ? 'bg-pink-500/15 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/80'
      }`}
      style={{ paddingLeft: `${indent ?? 12}px` }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onSelect}
      title={path}
    >
      {statusIcon(code)}
      <span className="flex-1 truncate">{filePart(path)}</span>
      {hover && (
        <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
          {onAction1 && (
            <button title={action1Title} onClick={onAction1} className="p-0.5 rounded hover:bg-white/10 text-white/50 hover:text-white/90">
              {action1Icon}
            </button>
          )}
          {onAction2 && (
            <button title={action2Title} onClick={onAction2} className="p-0.5 rounded hover:bg-white/10 text-white/50 hover:text-white/90">
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
}) {
  const [open, setOpen] = useState(true);
  const dirs = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));
  const pl = depth * 12;

  return (
    <>
      {node.name && (
        <div
          className="flex items-center gap-1 py-[3px] pr-3 cursor-pointer text-xs text-white/40 hover:text-white/60 hover:bg-white/5 select-none"
          style={{ paddingLeft: `${pl}px` }}
          onClick={() => setOpen(o => !o)}
        >
          {open
            ? <ChevronDown size={10} className="shrink-0" />
            : <ChevronRight size={10} className="shrink-0" />
          }
          {open
            ? <FolderOpen size={11} className="shrink-0 text-white/30" />
            : <Folder size={11} className="shrink-0 text-white/30" />
          }
          <span className="truncate">{node.name}</span>
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
              />
            );
          })}
        </>
      )}
    </>
  );
}

function Section({
  title, count, defaultOpen, children, headerAction,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  headerAction?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger asChild>
        <div className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer hover:bg-white/5 group">
          {open ? <ChevronDown size={11} className="text-white/40 shrink-0" /> : <ChevronRight size={11} className="text-white/40 shrink-0" />}
          <span className="text-[10px] uppercase tracking-wider text-white/50 font-semibold flex-1">{title}</span>
          <span className="text-[10px] text-white/30">{count}</span>
          {headerAction && <div onClick={e => e.stopPropagation()}>{headerAction}</div>}
        </div>
      </Collapsible.Trigger>
      <Collapsible.Content>{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}

export function GitFileList({
  status, selectedFile, selectedStaged, commitMessage, committing,
  onSelectFile, onStage, onUnstage, onDiscard, onStageAll, onCommit, onCommitMessageChange,
}: Props) {
  const [treeMode, setTreeMode] = useState(false);
  const canCommit = status.staged.length > 0 && commitMessage.trim().length > 0 && !committing;

  const stagedTree = buildTree(status.staged);
  const unstagedTree = buildTree(status.unstaged);
  const untrackedTree = buildTree(status.untracked);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* View toggle */}
      <div className="shrink-0 flex items-center justify-end gap-1 px-2 py-1 border-b border-white/10">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setTreeMode(false)}
              className={`p-1 rounded transition-colors ${!treeMode ? 'text-white/80 bg-white/10' : 'text-white/30 hover:text-white/50'}`}
            >
              <List size={12} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">List view</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setTreeMode(true)}
              className={`p-1 rounded transition-colors ${treeMode ? 'text-white/80 bg-white/10' : 'text-white/30 hover:text-white/50'}`}
            >
              <FolderTree size={12} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Tree view</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Staged */}
        <Section
          title="Staged Changes"
          count={status.staged.length}
          headerAction={
            status.staged.length > 0 ? (
              <button
                title="Unstage all"
                onClick={() => status.staged.forEach(f => onUnstage(f.path))}
                className="p-0.5 rounded hover:bg-white/10 text-white/30 hover:text-white/70"
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
            <div className="px-3 py-1 text-[11px] text-white/20 italic">No staged changes</div>
          )}
        </Section>

        {/* Unstaged */}
        <Section
          title="Changes"
          count={status.unstaged.length}
          headerAction={
            status.unstaged.length > 0 ? (
              <button
                title="Stage all changes"
                onClick={onStageAll}
                className="p-0.5 rounded hover:bg-white/10 text-white/30 hover:text-white/70"
              >
                <Plus size={11} />
              </button>
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
              onAction2={onDiscard}
              action1Icon={<Plus size={11} />}
              action2Icon={<RotateCcw size={11} />}
              action1Title="Stage"
              action2Title="Discard changes"
            />
          ) : (
            status.unstaged.map(f => (
              <FileRow
                key={f.path}
                file={f}
                staged={false}
                selected={selectedFile === f.path && !selectedStaged}
                onSelect={() => onSelectFile(f.path, false)}
                onAction1={() => onStage(f.path)}
                onAction2={() => onDiscard(f.path)}
                action1Icon={<Plus size={11} />}
                action2Icon={<RotateCcw size={11} />}
                action1Title="Stage"
                action2Title="Discard changes"
              />
            ))
          )}
          {status.unstaged.length === 0 && (
            <div className="px-3 py-1 text-[11px] text-white/20 italic">No changes</div>
          )}
        </Section>

        {/* Untracked */}
        {status.untracked.length > 0 && (
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

      {/* Commit box */}
      <div className="shrink-0 border-t border-white/10 p-3 flex flex-col gap-2">
        <textarea
          className="w-full bg-white/5 border border-white/10 rounded text-xs text-white/80 placeholder-white/25 p-2 resize-none outline-none focus:border-pink-500/40 transition-colors"
          rows={3}
          placeholder="Commit message…"
          value={commitMessage}
          onChange={e => onCommitMessageChange(e.target.value)}
        />
        <button
          onClick={onCommit}
          disabled={!canCommit}
          className="w-full py-1.5 rounded text-[11px] font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-pink-600 hover:bg-pink-500 text-white"
        >
          {committing ? 'Committing…' : `Commit (${status.staged.length} file${status.staged.length !== 1 ? 's' : ''})`}
        </button>
      </div>
    </div>
  );
}
