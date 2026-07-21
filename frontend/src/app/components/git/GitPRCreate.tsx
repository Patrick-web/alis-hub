import { useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, GitPullRequest, Loader2 } from "lucide-react";
import { GitBranch } from "./types";
import { SearchableSelect } from "../ui/searchable-select";
import * as GitService from "../../../../bindings/alis-hub-v3/gitservice";

interface Props {
  repoPath: string;
  branches: GitBranch[];
  currentBranch: string;
  aheadCount: number;
  creating: boolean;
  onCreate: (title: string, body: string, head: string, base: string) => Promise<void>;
  onCancel: () => void;
}

export function GitPRCreate({
  repoPath,
  branches,
  currentBranch,
  aheadCount,
  creating,
  onCreate,
  onCancel,
}: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [head, setHead] = useState(currentBranch);
  const [base, setBase] = useState("main");
  const [commitCount, setCommitCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);

  const remoteBranches = branches
    .filter((b) => b.isRemote)
    .map((b) => b.name.replace(/^origin\//, ""))
    .filter((v, i, a) => a.indexOf(v) === i);

  const sameBranch = head === base;
  const hasUnpushed = head === currentBranch && aheadCount > 0;

  // Fetch commit count between head and base whenever they change
  useEffect(() => {
    if (sameBranch || !repoPath || !head || !base) {
      setCommitCount(null);
      return;
    }
    setCountLoading(true);
    setCommitCount(null);
    GitService.GetBranchCommitCount(repoPath, head, base)
      .then((n) => setCommitCount(n ?? 0))
      .catch(() => setCommitCount(null))
      .finally(() => setCountLoading(false));
  }, [repoPath, head, base, sameBranch]);

  async function handleCreate() {
    if (!title.trim() || sameBranch) return;
    await onCreate(title.trim(), body.trim(), head, base);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-foreground/10">
        <button
          onClick={onCancel}
          className="p-1 rounded hover:bg-foreground/5 text-foreground/40 hover:text-foreground/70 transition-colors"
          title="Back to pull requests"
        >
          <ChevronLeft size={14} />
        </button>
        <GitPullRequest size={13} className="text-foreground/40 shrink-0" />
        <span className="text-xs text-foreground/60 flex-1">New pull request</span>
      </div>

      {/* Unpushed commits warning */}
      {hasUnpushed && (
        <div className="shrink-0 flex items-start gap-2 px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-[11px] text-amber-400">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>
            This branch has {aheadCount} unpushed commit{aheadCount !== 1 ? "s" : ""}. Push before
            creating a PR or the PR may be empty.
          </span>
        </div>
      )}

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-foreground/40 uppercase tracking-wider font-semibold">
            Title
          </label>
          <input
            autoFocus
            className="text-xs bg-foreground/5 border border-foreground/15 rounded px-2 py-1.5 text-foreground/80 outline-none focus:border-pink-500/40 w-full"
            placeholder="Pull request title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleCreate()}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-foreground/40 uppercase tracking-wider font-semibold">
            Description
          </label>
          <textarea
            className="text-xs bg-foreground/5 border border-foreground/15 rounded px-2 py-1.5 text-foreground/80 outline-none focus:border-pink-500/40 w-full resize-none"
            placeholder="Description (optional)"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-foreground/40 uppercase tracking-wider font-semibold">
            Branches
          </label>
          <div className="flex items-center gap-1.5">
            <SearchableSelect
              label="From"
              value={head}
              options={remoteBranches}
              onChange={setHead}
              className="flex-1 min-w-0"
            />
            <span className="text-foreground/30 text-xs shrink-0">→</span>
            <SearchableSelect
              label="Into"
              value={base}
              options={remoteBranches}
              onChange={setBase}
              className="flex-1 min-w-0"
            />
          </div>

          {/* Branch validation / commit count */}
          {sameBranch ? (
            <p className="text-[11px] text-red-400">From and Into branches must be different.</p>
          ) : countLoading ? null : commitCount === 0 ? (
            <p className="text-[11px] text-amber-400 flex items-center gap-1">
              <AlertTriangle size={11} />0 commits between these branches — the branch may already
              be merged.
            </p>
          ) : commitCount !== null ? (
            <p className="text-[11px] text-foreground/30">
              {commitCount} commit{commitCount !== 1 ? "s" : ""} will be included
            </p>
          ) : null}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 flex items-center gap-1.5 justify-end px-3 py-2.5 border-t border-foreground/10">
        <button
          onClick={onCancel}
          className="text-[11px] text-foreground/40 hover:text-foreground/60 px-2 py-1 rounded transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={!title.trim() || sameBranch || creating}
          className="text-[11px] bg-pink-600/30 text-pink-400 border border-pink-500/30 hover:bg-pink-600/40 disabled:opacity-40 px-2.5 py-1 rounded transition-colors flex items-center gap-1"
        >
          {creating && <Loader2 size={10} className="animate-spin" />}
          Create PR
        </button>
      </div>
    </div>
  );
}
