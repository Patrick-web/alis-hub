import { Loader } from "../../Loader";
import type { DefineCommit } from "../types";
import { formatTimestamp } from "../types";

interface CommitListProps {
  commits: DefineCommit[];
  loading: boolean;
  emptyText: string;
  onSelect: (commit: DefineCommit) => void;
}

/** Pane-style commit list shared by the Define and Build flows. */
export function CommitList({ commits, loading, emptyText, onSelect }: CommitListProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-[10px] px-[16px] py-[20px]">
        <Loader size={20} />
        <span className="text-[11px] text-foreground/50">Loading commits...</span>
      </div>
    );
  }
  if (commits.length === 0) {
    return (
      <div className="px-[16px] py-[20px]">
        <p className="text-[11px] text-foreground/40">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      {commits.map((c) => (
        <button
          key={c.sha}
          onClick={() => onSelect(c)}
          className="text-left px-[16px] py-[12px] border-b border-border hover:bg-card transition-colors"
        >
          <div className="flex items-center gap-[8px] mb-[3px]">
            <span className="text-[10px] font-bold font-mono text-brand">
              {c.sha.substring(0, 7)}
            </span>
            <span className="text-[10px] text-foreground leading-tight truncate">{c.message}</span>
          </div>
          <p className="text-[9px] text-foreground/35">
            {c.author} · {formatTimestamp(c.timestamp)}
          </p>
        </button>
      ))}
    </div>
  );
}
