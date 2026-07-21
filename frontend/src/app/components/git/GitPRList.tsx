import { ForgejoPR } from "./types";
import { GitPullRequest, Loader2, Plus, RefreshCw } from "lucide-react";

interface Props {
  prs: ForgejoPR[];
  selectedPR: ForgejoPR | null;
  loading: boolean;
  onSelect: (pr: ForgejoPR) => void;
  onNewPR: () => void;
  onRefresh: () => void;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

export function GitPRList({ prs, selectedPR, loading, onSelect, onNewPR, onRefresh }: Props) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-foreground/10">
        <GitPullRequest size={13} className="text-foreground/40 shrink-0" />
        <span className="text-xs text-foreground/60 flex-1">
          PRs
          {prs.length > 0 && (
            <span className="ml-1.5 text-[10px] bg-pink-600/30 text-pink-400 border border-pink-500/30 rounded px-1 py-0.5">
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
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
        <button
          onClick={onNewPR}
          title="New pull request"
          className="p-1 rounded hover:bg-foreground/5 text-foreground/40 hover:text-foreground/70 transition-colors"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* PR list */}
      <div className="flex-1 overflow-y-auto">
        {loading && prs.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-foreground/30">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : prs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-1">
            <GitPullRequest size={18} className="text-foreground/15" />
            <p className="text-[11px] text-foreground/30">No open PRs</p>
          </div>
        ) : (
          prs.map((pr) => {
            const isSelected = selectedPR?.number === pr.number;
            return (
              <button
                key={pr.number}
                onClick={() => onSelect(pr)}
                className={`w-full text-left flex items-start gap-2 px-3 py-2 border-b border-foreground/8 transition-colors ${
                  isSelected
                    ? "bg-pink-600/10 border-l-2 border-l-pink-500"
                    : "hover:bg-foreground/[0.03]"
                }`}
              >
                <GitPullRequest size={11} className="mt-0.5 shrink-0 text-green-400/70" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1 min-w-0">
                    <span className="text-[10px] text-foreground/30 shrink-0">#{pr.number}</span>
                    <span className="text-[11px] text-foreground/80 truncate leading-snug">
                      {pr.title}
                    </span>
                  </div>
                  <div className="text-[10px] text-foreground/35 truncate mt-0.5">
                    {pr.headBranch} → {pr.baseBranch}
                  </div>
                  <div className="text-[10px] text-foreground/25 mt-0.5">
                    {pr.author} · {relativeTime(pr.createdAt)}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
