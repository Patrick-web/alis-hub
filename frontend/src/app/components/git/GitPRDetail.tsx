import { useEffect, useState } from "react";
import { ChevronDown, GitMerge, GitPullRequest, Loader2, MessageSquare, X } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ForgejoPR, PRCommit, PRComment, GitFileDiff } from "./types";
import { GitDiffViewer } from "./GitDiffViewer";
import * as GitService from "../../../../bindings/alis-hub-v3/gitservice";
import type { CommitFile } from "../../../../bindings/alis-hub-v3/models";

type Tab = "overview" | "commits" | "files" | "conversation";
type MergeStyle = "merge" | "rebase" | "squash";

interface Props {
  pr: ForgejoPR;
  repoPath: string;
  merging: boolean;
  onMerge: (number: number, style: MergeStyle) => Promise<void>;
  onClose: () => void;
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

function statusColor(code: string) {
  if (code === "A") return "text-green-400";
  if (code === "D") return "text-red-400";
  if (code === "R") return "text-blue-400";
  return "text-yellow-400";
}

export function GitPRDetail({ pr, repoPath, merging, onMerge, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [mergeStyle, setMergeStyle] = useState<MergeStyle>("merge");

  // Commits tab
  const [commits, setCommits] = useState<PRCommit[]>([]);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<PRCommit | null>(null);
  const [commitFiles, setCommitFiles] = useState<CommitFile[]>([]);
  const [loadingCommitFiles, setLoadingCommitFiles] = useState(false);
  const [selectedCommitFile, setSelectedCommitFile] = useState<string | null>(null);
  const [commitFileDiff, setCommitFileDiff] = useState<GitFileDiff | null>(null);
  const [loadingCommitDiff, setLoadingCommitDiff] = useState(false);

  // Files Changed tab
  const [prFiles, setPRFiles] = useState<CommitFile[]>([]);
  const [loadingPRFiles, setLoadingPRFiles] = useState(false);
  const [selectedPRFile, setSelectedPRFile] = useState<string | null>(null);
  const [prFileDiff, setPRFileDiff] = useState<GitFileDiff | null>(null);
  const [loadingPRDiff, setLoadingPRDiff] = useState(false);

  // Conversation tab
  const [comments, setComments] = useState<PRComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  // Load data when tab changes
  useEffect(() => {
    if (tab === "commits" && commits.length === 0) loadCommits();
    if (tab === "files" && prFiles.length === 0) loadPRFiles();
    if (tab === "conversation" && comments.length === 0) loadComments();
  }, [tab]);

  // Reset per-PR state when PR changes
  useEffect(() => {
    setTab("overview");
    setCommits([]);
    setSelectedCommit(null);
    setCommitFiles([]);
    setSelectedCommitFile(null);
    setCommitFileDiff(null);
    setPRFiles([]);
    setSelectedPRFile(null);
    setPRFileDiff(null);
    setComments([]);
    setNewComment("");
  }, [pr.number]);

  async function loadCommits() {
    setLoadingCommits(true);
    try {
      const result = await GitService.GetPRCommits(repoPath, pr.number);
      setCommits((result as any as PRCommit[]) ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoadingCommits(false);
    }
  }

  async function loadPRFiles() {
    setLoadingPRFiles(true);
    try {
      const result = await GitService.GetPRFiles(repoPath, pr.number);
      setPRFiles((result as any as CommitFile[]) ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoadingPRFiles(false);
    }
  }

  async function loadComments() {
    setLoadingComments(true);
    try {
      const result = await GitService.GetPRComments(repoPath, pr.number);
      setComments((result as any as PRComment[]) ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoadingComments(false);
    }
  }

  async function handleSelectCommit(commit: PRCommit) {
    setSelectedCommit(commit);
    setSelectedCommitFile(null);
    setCommitFileDiff(null);
    setLoadingCommitFiles(true);
    try {
      const result = await GitService.GetCommitFiles(repoPath, commit.sha);
      setCommitFiles((result as any as CommitFile[]) ?? []);
    } catch {
      setCommitFiles([]);
    } finally {
      setLoadingCommitFiles(false);
    }
  }

  async function handleSelectCommitFile(path: string) {
    if (!selectedCommit) return;
    setSelectedCommitFile(path);
    setLoadingCommitDiff(true);
    setCommitFileDiff(null);
    try {
      const d = await GitService.GetCommitFileDiff(repoPath, selectedCommit.sha, path);
      setCommitFileDiff((d as any as GitFileDiff) ?? null);
    } catch {
      setCommitFileDiff(null);
    } finally {
      setLoadingCommitDiff(false);
    }
  }

  async function handleSelectPRFile(path: string) {
    setSelectedPRFile(path);
    setLoadingPRDiff(true);
    setPRFileDiff(null);
    try {
      const d = await GitService.GetPRFileDiff(repoPath, pr.baseBranch, pr.headBranch, path);
      setPRFileDiff((d as any as GitFileDiff) ?? null);
    } catch {
      setPRFileDiff(null);
    } finally {
      setLoadingPRDiff(false);
    }
  }

  async function handlePostComment() {
    if (!newComment.trim()) return;
    setPostingComment(true);
    try {
      const result = await GitService.AddPRComment(repoPath, pr.number, newComment.trim());
      if (result) setComments((prev) => [...prev, result as any as PRComment]);
      setNewComment("");
    } catch {
      /* ignore */
    } finally {
      setPostingComment(false);
    }
  }

  const mergeStyleLabels: Record<MergeStyle, string> = {
    merge: "Create a merge commit",
    rebase: "Rebase and merge",
    squash: "Squash and merge",
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-foreground/10 px-4 py-3">
        <div className="flex items-start gap-3">
          <GitPullRequest size={15} className="mt-0.5 shrink-0 text-green-400" />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-xs text-foreground/30 shrink-0">#{pr.number}</span>
              <span className="text-sm font-medium text-foreground/90 leading-snug">
                {pr.title}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-green-500/40 bg-green-500/10 text-green-400 shrink-0">
                {pr.state}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-foreground/35 flex-wrap">
              <span className="font-mono text-pink-400/70">{pr.headBranch}</span>
              <span>→</span>
              <span className="font-mono text-foreground/50">{pr.baseBranch}</span>
              <span>·</span>
              <span>{pr.author}</span>
              <span>·</span>
              <span>{relativeTime(pr.createdAt)}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1 rounded hover:bg-foreground/5 text-foreground/30 hover:text-foreground/60 transition-colors"
            title="Close PR"
          >
            <X size={14} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-0.5 mt-3">
          {(
            [
              ["overview", "Overview", null],
              ["commits", "Commits", commits.length > 0 ? commits.length : null],
              ["files", "Files Changed", prFiles.length > 0 ? prFiles.length : null],
              ["conversation", "Conversation", comments.length > 0 ? comments.length : null],
            ] as [Tab, string, number | null][]
          ).map(([id, label, count]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-t border-b-2 transition-colors ${
                tab === id
                  ? "border-pink-500 text-foreground/80 bg-pink-500/5"
                  : "border-transparent text-foreground/35 hover:text-foreground/60 hover:bg-foreground/[0.03]"
              }`}
            >
              {label}
              {count !== null && (
                <span className="text-[10px] bg-foreground/10 text-foreground/50 rounded px-1 py-0.5 min-w-[16px] text-center">
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab body */}
      <div className="flex-1 overflow-hidden">
        {tab === "overview" && <OverviewTab pr={pr} />}
        {tab === "commits" && (
          <CommitsTab
            commits={commits}
            loading={loadingCommits}
            selectedCommit={selectedCommit}
            commitFiles={commitFiles}
            loadingCommitFiles={loadingCommitFiles}
            selectedCommitFile={selectedCommitFile}
            commitFileDiff={commitFileDiff}
            loadingCommitDiff={loadingCommitDiff}
            onSelectCommit={handleSelectCommit}
            onSelectCommitFile={handleSelectCommitFile}
          />
        )}
        {tab === "files" && (
          <FilesTab
            files={prFiles}
            loading={loadingPRFiles}
            selectedFile={selectedPRFile}
            diff={prFileDiff}
            loadingDiff={loadingPRDiff}
            onSelectFile={handleSelectPRFile}
          />
        )}
        {tab === "conversation" && (
          <ConversationTab
            comments={comments}
            loading={loadingComments}
            newComment={newComment}
            posting={postingComment}
            onChangeComment={setNewComment}
            onPost={handlePostComment}
          />
        )}
      </div>

      {/* Merge footer */}
      <div className="shrink-0 border-t border-foreground/10 px-4 py-3 flex items-center justify-between gap-3 bg-foreground/[0.015]">
        <div className="flex items-center gap-2 text-[11px] text-foreground/40">
          {pr.mergeable ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400/70 shrink-0" />
              This branch has no conflicts
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70 shrink-0" />
              Cannot automatically merge
            </>
          )}
        </div>
        <div className="flex items-center gap-0">
          <button
            onClick={() => onMerge(pr.number, mergeStyle)}
            disabled={merging || !pr.mergeable}
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-green-600/25 text-green-400 border border-green-600/30 hover:bg-green-600/35 disabled:opacity-40 transition-colors rounded-l"
          >
            {merging ? <Loader2 size={11} className="animate-spin" /> : <GitMerge size={11} />}
            {mergeStyleLabels[mergeStyle]}
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                disabled={merging || !pr.mergeable}
                className="flex items-center px-1.5 py-1.5 bg-green-600/25 text-green-400 border border-green-600/30 border-l-green-600/15 hover:bg-green-600/35 disabled:opacity-40 transition-colors rounded-r border-l"
              >
                <ChevronDown size={12} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="z-50 min-w-[200px] rounded-md bg-background border border-foreground/10 shadow-xl py-1 text-xs"
                sideOffset={4}
                align="end"
              >
                {(["merge", "rebase", "squash"] as MergeStyle[]).map((style) => (
                  <DropdownMenu.Item
                    key={style}
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-foreground/5 outline-none text-foreground/60"
                    onSelect={() => setMergeStyle(style)}
                  >
                    {style === mergeStyle && <span className="text-green-400 text-[10px]">✓</span>}
                    <span style={{ marginLeft: style === mergeStyle ? 0 : 14 }}>
                      {mergeStyleLabels[style]}
                    </span>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ pr }: { pr: ForgejoPR }) {
  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      {pr.body ? (
        <div className="text-sm text-foreground/70 whitespace-pre-wrap leading-relaxed max-w-prose">
          {pr.body}
        </div>
      ) : (
        <p className="text-sm text-foreground/25 italic">No description provided.</p>
      )}
    </div>
  );
}

interface CommitsTabProps {
  commits: PRCommit[];
  loading: boolean;
  selectedCommit: PRCommit | null;
  commitFiles: CommitFile[];
  loadingCommitFiles: boolean;
  selectedCommitFile: string | null;
  commitFileDiff: GitFileDiff | null;
  loadingCommitDiff: boolean;
  onSelectCommit: (c: PRCommit) => void;
  onSelectCommitFile: (path: string) => void;
}

function CommitsTab({
  commits,
  loading,
  selectedCommit,
  commitFiles,
  loadingCommitFiles,
  selectedCommitFile,
  commitFileDiff,
  loadingCommitDiff,
  onSelectCommit,
  onSelectCommitFile,
}: CommitsTabProps) {
  if (loading) return <LoadingPane />;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Commit list */}
      <div className="w-64 shrink-0 border-r border-foreground/8 overflow-y-auto">
        {commits.length === 0 ? (
          <EmptyPane message="No commits found" />
        ) : (
          commits.map((c) => (
            <button
              key={c.sha}
              onClick={() => onSelectCommit(c)}
              className={`w-full text-left px-3 py-2.5 border-b border-foreground/8 transition-colors ${
                selectedCommit?.sha === c.sha
                  ? "bg-pink-600/10 border-l-2 border-l-pink-500"
                  : "hover:bg-foreground/[0.03]"
              }`}
            >
              <div className="text-[10px] font-mono text-foreground/40 mb-0.5">
                {c.sha.slice(0, 7)}
              </div>
              <div className="text-[11px] text-foreground/80 leading-snug truncate">
                {c.message}
              </div>
              <div className="text-[10px] text-foreground/30 mt-0.5">
                {c.author} · {relativeTime(c.timestamp)}
              </div>
            </button>
          ))
        )}
      </div>

      {/* File list for selected commit */}
      <div className="w-48 shrink-0 border-r border-foreground/8 overflow-y-auto">
        {!selectedCommit ? (
          <EmptyPane message="Select a commit" />
        ) : loadingCommitFiles ? (
          <LoadingPane />
        ) : commitFiles.length === 0 ? (
          <EmptyPane message="No files" />
        ) : (
          commitFiles.map((f: any) => (
            <button
              key={f.path}
              onClick={() => onSelectCommitFile(f.path)}
              className={`w-full text-left flex items-center gap-1.5 px-2.5 py-1.5 border-b border-foreground/8 transition-colors ${
                selectedCommitFile === f.path
                  ? "bg-pink-600/10 border-l-2 border-l-pink-500"
                  : "hover:bg-foreground/[0.03]"
              }`}
            >
              <span className={`text-[10px] font-mono w-3 shrink-0 ${statusColor(f.statusCode)}`}>
                {f.statusCode}
              </span>
              <span className="text-[10px] text-foreground/70 truncate">
                {f.path.split("/").pop()}
              </span>
            </button>
          ))
        )}
      </div>

      {/* Diff */}
      <div className="flex-1 overflow-hidden">
        {loadingCommitDiff ? (
          <LoadingPane />
        ) : (
          <GitDiffViewer
            diff={commitFileDiff}
            filePath={selectedCommitFile}
            staged={false}
            commitHash={selectedCommit?.sha ?? null}
          />
        )}
      </div>
    </div>
  );
}

interface FilesTabProps {
  files: CommitFile[];
  loading: boolean;
  selectedFile: string | null;
  diff: GitFileDiff | null;
  loadingDiff: boolean;
  onSelectFile: (path: string) => void;
}

function FilesTab({
  files,
  loading,
  selectedFile,
  diff,
  loadingDiff,
  onSelectFile,
}: FilesTabProps) {
  if (loading) return <LoadingPane />;

  return (
    <div className="flex h-full overflow-hidden">
      {/* File list */}
      <div className="w-56 shrink-0 border-r border-foreground/8 overflow-y-auto">
        {files.length === 0 ? (
          <EmptyPane message="No files changed" />
        ) : (
          files.map((f: any) => (
            <button
              key={f.path}
              onClick={() => onSelectFile(f.path)}
              className={`w-full text-left flex items-center gap-1.5 px-2.5 py-2 border-b border-foreground/8 transition-colors ${
                selectedFile === f.path
                  ? "bg-pink-600/10 border-l-2 border-l-pink-500"
                  : "hover:bg-foreground/[0.03]"
              }`}
            >
              <span className={`text-[10px] font-mono w-3 shrink-0 ${statusColor(f.statusCode)}`}>
                {f.statusCode}
              </span>
              <div className="min-w-0">
                <div className="text-[11px] text-foreground/75 truncate">
                  {f.path.split("/").pop()}
                </div>
                <div className="text-[9px] text-foreground/30 truncate">{f.path}</div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Diff */}
      <div className="flex-1 overflow-hidden">
        {loadingDiff ? (
          <LoadingPane />
        ) : (
          <GitDiffViewer diff={diff} filePath={selectedFile} staged={false} />
        )}
      </div>
    </div>
  );
}

interface ConversationTabProps {
  comments: PRComment[];
  loading: boolean;
  newComment: string;
  posting: boolean;
  onChangeComment: (v: string) => void;
  onPost: () => void;
}

function ConversationTab({
  comments,
  loading,
  newComment,
  posting,
  onChangeComment,
  onPost,
}: ConversationTabProps) {
  if (loading) return <LoadingPane />;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {comments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-1">
            <MessageSquare size={18} className="text-foreground/15" />
            <p className="text-[11px] text-foreground/30">No comments yet</p>
          </div>
        )}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <div className="w-6 h-6 rounded-full bg-pink-600/20 border border-pink-500/20 flex items-center justify-center shrink-0 text-[10px] text-pink-400 font-semibold">
              {c.author.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[11px] font-medium text-foreground/70">{c.author}</span>
                <span className="text-[10px] text-foreground/30">{relativeTime(c.createdAt)}</span>
              </div>
              <div className="text-[12px] text-foreground/65 whitespace-pre-wrap leading-relaxed bg-foreground/[0.03] border border-foreground/8 rounded px-3 py-2">
                {c.body}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Comment input */}
      <div className="shrink-0 border-t border-foreground/8 px-4 py-3 flex flex-col gap-2">
        <textarea
          className="text-xs bg-foreground/5 border border-foreground/15 rounded px-3 py-2 text-foreground/80 outline-none focus:border-pink-500/40 w-full resize-none"
          placeholder="Leave a comment…"
          rows={3}
          value={newComment}
          onChange={(e) => onChangeComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onPost();
          }}
        />
        <div className="flex justify-end">
          <button
            onClick={onPost}
            disabled={!newComment.trim() || posting}
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-pink-600/25 text-pink-400 border border-pink-500/30 hover:bg-pink-600/35 disabled:opacity-40 transition-colors rounded"
          >
            {posting && <Loader2 size={10} className="animate-spin" />}
            Comment
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingPane() {
  return (
    <div className="flex items-center justify-center h-full text-foreground/30">
      <Loader2 size={16} className="animate-spin" />
    </div>
  );
}

function EmptyPane({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full py-8 text-[11px] text-foreground/30">
      {message}
    </div>
  );
}
