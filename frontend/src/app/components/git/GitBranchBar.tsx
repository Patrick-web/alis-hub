import { GitBranch } from './types';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, GitBranch as BranchIcon, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';

interface Props {
  currentBranch: string;
  branches: GitBranch[];
  onCheckout: (name: string) => void;
  onCreateBranch: (name: string) => void;
  onPush: () => void;
  onPull: () => void;
  onRefresh: () => void;
  pushing: boolean;
  pulling: boolean;
}

export function GitBranchBar({
  currentBranch, branches, onCheckout, onCreateBranch, onPush, onPull, onRefresh, pushing, pulling,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  function submitCreate() {
    const name = newBranchName.trim();
    if (!name) return;
    onCreateBranch(name);
    setCreating(false);
    setNewBranchName('');
  }

  const localBranches = branches.filter(b => !b.isRemote);
  const remoteBranches = branches.filter(b => b.isRemote);

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-white/10">
      <BranchIcon size={13} className="text-white/40 shrink-0" />

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="flex items-center gap-1 text-xs text-white/80 hover:text-white transition-colors min-w-0">
            <span className="truncate max-w-[120px]">{currentBranch || 'HEAD'}</span>
            <ChevronDown size={11} className="shrink-0 text-white/40" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="z-50 min-w-[200px] max-h-[300px] overflow-y-auto rounded-md bg-[#1e1e1e] border border-white/10 shadow-xl py-1 text-xs"
            sideOffset={4}
          >
            {localBranches.length > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] text-white/30 uppercase tracking-wider">Local</div>
                {localBranches.map(b => (
                  <DropdownMenu.Item
                    key={b.name}
                    className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white/5 outline-none text-white/80"
                    onSelect={() => onCheckout(b.name)}
                  >
                    {b.isCurrent && <Check size={11} className="text-pink-400 shrink-0" />}
                    <span className={b.isCurrent ? 'text-pink-400' : ''} style={{ marginLeft: b.isCurrent ? 0 : 15 }}>
                      {b.name}
                    </span>
                  </DropdownMenu.Item>
                ))}
              </>
            )}
            {remoteBranches.length > 0 && (
              <>
                <DropdownMenu.Separator className="my-1 border-t border-white/10" />
                <div className="px-3 py-1 text-[10px] text-white/30 uppercase tracking-wider">Remote</div>
                {remoteBranches.map(b => (
                  <DropdownMenu.Item
                    key={b.name}
                    className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white/5 outline-none text-white/60"
                    onSelect={() => onCheckout(b.name.replace(/^remotes\//, ''))}
                  >
                    <span style={{ marginLeft: 15 }}>{b.name.replace(/^remotes\/origin\//, '')}</span>
                  </DropdownMenu.Item>
                ))}
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <div className="flex-1" />

      {creating ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            className="text-xs bg-white/5 border border-white/20 rounded px-2 py-0.5 text-white/80 outline-none w-32"
            placeholder="branch name"
            value={newBranchName}
            onChange={e => setNewBranchName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submitCreate();
              if (e.key === 'Escape') { setCreating(false); setNewBranchName(''); }
            }}
          />
          <button onClick={submitCreate} className="text-[10px] text-pink-400 hover:text-pink-300">Create</button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          title="New branch"
          className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors"
        >
          <Plus size={13} />
        </button>
      )}

      <button
        onClick={onPull}
        disabled={pulling}
        title="Pull"
        className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors disabled:opacity-40"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 19V5M5 12l7 7 7-7" />
        </svg>
      </button>

      <button
        onClick={onPush}
        disabled={pushing}
        title="Push"
        className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors disabled:opacity-40"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M19 12l-7-7-7 7" />
        </svg>
      </button>

      <button
        onClick={onRefresh}
        title="Refresh"
        className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors"
      >
        <RefreshCw size={12} />
      </button>
    </div>
  );
}
