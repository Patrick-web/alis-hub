import { GitBranch } from "./types";
import { ChevronDown, GitBranch as BranchIcon, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Icon } from "@iconify/react";
import { Dialog, DialogContent } from "../ui/dialog";

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
  ahead?: number;
  behind?: number;
}

export function GitBranchBar({
  currentBranch,
  branches,
  onCheckout,
  onCreateBranch,
  onPush,
  onPull,
  onRefresh,
  pushing,
  pulling,
  ahead,
  behind,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [filter, setFilter] = useState("");

  function submitCreate() {
    const name = newBranchName.trim();
    if (!name) return;
    onCreateBranch(name);
    setCreating(false);
    setNewBranchName("");
  }

  function handleSelect(name: string) {
    onCheckout(name);
    setBranchModalOpen(false);
  }

  const localBranches = branches.filter((b) => !b.isRemote);
  const remoteBranches = branches.filter((b) => b.isRemote);

  const lowerFilter = filter.toLowerCase();
  const filteredLocal = localBranches.filter((b) => b.name.toLowerCase().includes(lowerFilter));
  const filteredRemote = remoteBranches.filter((b) => b.name.toLowerCase().includes(lowerFilter));
  const isEmpty = filteredLocal.length === 0 && filteredRemote.length === 0;

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-foreground/10">
      <BranchIcon size={13} className="text-foreground/40 shrink-0" />

      <button
        onClick={() => setBranchModalOpen(true)}
        className="flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground transition-colors min-w-0"
      >
        <span className="truncate max-w-[120px]">{currentBranch || "HEAD"}</span>
        <ChevronDown size={11} className="shrink-0 text-foreground/40" />
      </button>

      <Dialog
        open={branchModalOpen}
        onOpenChange={(o) => {
          setBranchModalOpen(o);
          if (!o) setFilter("");
        }}
      >
        <DialogContent className="text-foreground p-0 max-w-[360px] overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-[10px] px-[16px] pt-[16px] pb-[12px] border-b border-border">
            <Icon icon="solar:branching-paths-down-linear" className="text-brand text-lg" />
            <span className="text-[13px] font-bold text-foreground font-mono">Switch Branch</span>
          </div>

          {/* Filter input */}
          <div className="px-[16px] py-[10px] border-b border-border">
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setBranchModalOpen(false)}
              placeholder="Filter branches…"
              className="w-full bg-transparent text-[12px] font-mono text-foreground outline-none placeholder:text-foreground/30"
            />
          </div>

          {/* Branch list */}
          <div className="overflow-y-auto max-h-[300px] py-[6px]">
            {isEmpty ? (
              <p className="px-[16px] py-[12px] text-[11px] text-foreground/40 font-mono">
                No branches found
              </p>
            ) : (
              <>
                {filteredLocal.length > 0 && (
                  <>
                    <p className="px-[16px] py-[4px] text-[9px] font-mono uppercase tracking-widest text-foreground/30">
                      Local
                    </p>
                    {filteredLocal.map((b) => (
                      <button
                        key={b.name}
                        onClick={() => handleSelect(b.name)}
                        className={`w-full flex items-center justify-between px-[16px] py-[9px] transition-colors text-left ${
                          b.isCurrent
                            ? "bg-brand-fill/8 text-brand"
                            : "text-foreground hover:bg-foreground/[4%]"
                        }`}
                      >
                        <span className="text-[12px] font-mono">{b.name}</span>
                        {b.isCurrent && (
                          <Icon
                            icon="solar:check-circle-bold"
                            className="text-brand text-base shrink-0"
                          />
                        )}
                      </button>
                    ))}
                  </>
                )}

                {filteredRemote.length > 0 && (
                  <>
                    {filteredLocal.length > 0 && (
                      <div className="my-[4px] border-t border-border" />
                    )}
                    <p className="px-[16px] py-[4px] text-[9px] font-mono uppercase tracking-widest text-foreground/30">
                      Remote
                    </p>
                    {filteredRemote.map((b) => {
                      const displayName = b.name.replace(/^remotes\/origin\//, "");
                      const checkoutName = b.name.replace(/^remotes\//, "");
                      return (
                        <button
                          key={b.name}
                          onClick={() => handleSelect(checkoutName)}
                          className="w-full flex items-center px-[16px] py-[9px] transition-colors text-left text-foreground/60 hover:bg-foreground/[4%]"
                        >
                          <span className="text-[12px] font-mono">{displayName}</span>
                        </button>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex-1" />

      {creating ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            className="text-xs bg-foreground/5 border border-foreground/20 rounded px-2 py-0.5 text-foreground/80 outline-none w-32"
            placeholder="branch name"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitCreate();
              if (e.key === "Escape") {
                setCreating(false);
                setNewBranchName("");
              }
            }}
          />
          <button onClick={submitCreate} className="text-[10px] text-pink-400 hover:text-pink-300">
            Create
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          title="New branch"
          className="p-1 rounded hover:bg-foreground/5 text-foreground/40 hover:text-foreground/70 transition-colors"
        >
          <Plus size={13} />
        </button>
      )}

      <button
        onClick={onPull}
        disabled={pulling}
        title={behind ? `Pull (${behind} behind)` : "Pull"}
        className="flex items-center gap-0.5 p-1 rounded hover:bg-foreground/5 text-foreground/40 hover:text-foreground/70 transition-colors disabled:opacity-40"
      >
        {!!behind && <span className="text-[10px] font-medium leading-none">{behind}</span>}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 19V5M5 12l7 7 7-7" />
        </svg>
      </button>

      <button
        onClick={onPush}
        disabled={pushing}
        title={ahead ? `Push (${ahead} ahead)` : "Push"}
        className="flex items-center gap-0.5 p-1 rounded hover:bg-foreground/5 text-foreground/40 hover:text-foreground/70 transition-colors disabled:opacity-40"
      >
        {!!ahead && <span className="text-[10px] font-medium leading-none">{ahead}</span>}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 5v14M19 12l-7-7-7 7" />
        </svg>
      </button>

      <button
        onClick={onRefresh}
        title="Refresh"
        className="p-1 rounded hover:bg-foreground/5 text-foreground/40 hover:text-foreground/70 transition-colors"
      >
        <RefreshCw size={12} />
      </button>
    </div>
  );
}
