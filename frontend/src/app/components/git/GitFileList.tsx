import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown, ChevronRight, Minus, Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';
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


function statusIcon(code: string) {
  switch (code) {
    case 'A': return <span className="text-green-400 text-[10px] font-bold w-3 shrink-0">A</span>;
    case 'D': return <span className="text-red-400 text-[10px] font-bold w-3 shrink-0">D</span>;
    case 'R': return <span className="text-blue-400 text-[10px] font-bold w-3 shrink-0">R</span>;
    default:  return <span className="text-yellow-400 text-[10px] font-bold w-3 shrink-0">M</span>;
  }
}

function fileName(path: string) {
  return path.split('/').pop() ?? path;
}

function FileRow({
  file, staged, selected, onSelect, onAction1, onAction2, action1Icon, action2Icon, action1Title, action2Title,
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
}) {
  const [hover, setHover] = useState(false);
  const path = typeof file === 'string' ? file : file.path;
  const code = typeof file === 'string' ? '?' : file.statusCode;

  return (
    <div
      className={`group flex items-center gap-1.5 px-3 py-[3px] cursor-pointer text-xs transition-colors ${
        selected ? 'bg-pink-500/15 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/80'
      }`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onSelect}
      title={path}
    >
      {statusIcon(code)}
      <span className="flex-1 truncate">{fileName(path)}</span>
      {hover && (
        <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
          {onAction1 && (
            <button
              title={action1Title}
              onClick={onAction1}
              className="p-0.5 rounded hover:bg-white/10 text-white/50 hover:text-white/90"
            >
              {action1Icon}
            </button>
          )}
          {onAction2 && (
            <button
              title={action2Title}
              onClick={onAction2}
              className="p-0.5 rounded hover:bg-white/10 text-white/50 hover:text-white/90"
            >
              {action2Icon}
            </button>
          )}
        </div>
      )}
    </div>
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
  const canCommit = status.staged.length > 0 && commitMessage.trim().length > 0 && !committing;

  return (
    <div className="flex flex-col h-full overflow-hidden">
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
          {status.staged.map(f => (
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
          ))}
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
          {status.unstaged.map(f => (
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
          ))}
          {status.unstaged.length === 0 && (
            <div className="px-3 py-1 text-[11px] text-white/20 italic">No changes</div>
          )}
        </Section>

        {/* Untracked */}
        {status.untracked.length > 0 && (
          <Section title="Untracked" count={status.untracked.length} defaultOpen={false}>
            {status.untracked.map(p => (
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
            ))}
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
