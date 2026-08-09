import { useMemo, useState } from "react";
import { useSourceControl } from "../../stores/sourceControl";
import { DiffFile, DiffModeEnum, DiffView, SplitSide } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view-pure.css";
import { Columns2, AlignJustify, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { GitFileDiff, PRReviewComment } from "./types";
import { Markdown } from "../Markdown";
import { relativeTime } from "../../lib/relativeTime";

interface Props {
  diff: GitFileDiff | null;
  filePath: string | null;
  staged: boolean;
  commitHash?: string | null;
  /**
   * Overrides the staged/unstaged annotation. A pull request file is neither, so
   * without this the header claims "(unstaged)" for a diff that has nothing to do
   * with the working tree.
   */
  label?: string;
  /**
   * Existing review comments on this file. When onAddComment is also given, the
   * gutter becomes clickable so a new comment can be started on any line of the
   * new side. Both are optional, so working-tree callers are unaffected.
   */
  comments?: PRReviewComment[];
  onAddComment?: (line: number, body: string) => Promise<void>;
}

export function GitDiffViewer({
  diff,
  filePath,
  staged,
  commitHash,
  label,
  comments,
  onAddComment,
}: Props) {
  const { state: scState, setDiffView } = useSourceControl();
  const splitMode = scState.diffView === "split";

  // Comments are anchored to lines of the new side, which is where a reviewer
  // comments in practice.
  const extendData = useMemo(() => {
    if (!comments?.length) return undefined;
    const newFile: Record<string, { data: PRReviewComment[] }> = {};
    for (const c of comments) {
      if (!c.line) continue;
      const key = String(c.line);
      (newFile[key] ??= { data: [] }).data.push(c);
    }
    return { newFile };
  }, [comments]);

  const diffFile = useMemo(() => {
    if (!diff || !filePath) return null;
    const file = DiffFile.createInstance({
      oldFile: { fileName: filePath, fileLang: diff.language, content: diff.oldContent },
      newFile: { fileName: filePath, fileLang: diff.language, content: diff.newContent },
      hunks: diff.hunks,
    });
    file.init();
    file.buildUnifiedDiffLines();
    file.buildSplitDiffLines();
    return file;
  }, [diff, filePath]);

  if (!diffFile || !filePath) {
    return (
      <div className="flex items-center justify-center h-full text-foreground/20 text-sm select-none">
        Select a file to view changes
      </div>
    );
  }

  const allLines = diff!.hunks.flatMap((h) => h.split("\n"));
  const addCount = allLines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
  const delCount = allLines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-foreground/10 text-xs text-foreground/60">
        <span className="truncate font-mono">{filePath}</span>
        <span className="shrink-0 text-foreground/30">
          {commitHash
            ? `@${commitHash.slice(0, 7)}`
            : (label ?? (staged ? "(staged)" : "(unstaged)"))}
        </span>
        {diff!.hunks.length > 0 && (
          <span className="shrink-0 text-foreground/30">
            +{addCount} -{delCount}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setDiffView("unified")}
                className={`p-1 rounded transition-colors ${!splitMode ? "text-foreground/80 bg-foreground/10" : "text-foreground/30 hover:text-foreground/50"}`}
              >
                <AlignJustify size={13} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Unified</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setDiffView("split")}
                className={`p-1 rounded transition-colors ${splitMode ? "text-foreground/80 bg-foreground/10" : "text-foreground/30 hover:text-foreground/50"}`}
              >
                <Columns2 size={13} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Split</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div
        className="flex-1 overflow-auto"
        style={
          {
            "--diff-plain-content--": "#1e1e1e",
            "--diff-plain-lineNumber--": "#1e1e1e",
          } as React.CSSProperties
        }
      >
        <DiffView<PRReviewComment[]>
          diffFile={diffFile}
          diffViewTheme="dark"
          diffViewMode={splitMode ? DiffModeEnum.Split : DiffModeEnum.Unified}
          diffViewHighlight
          diffViewFontSize={11}
          extendData={extendData}
          renderExtendLine={({ data }) => <ReviewCommentThread comments={data} />}
          diffViewAddWidget={!!onAddComment}
          renderWidgetLine={
            onAddComment
              ? ({ lineNumber, side, onClose }) => (
                  <ReviewCommentComposer
                    lineNumber={lineNumber}
                    disabled={side === SplitSide.old}
                    onSubmit={onAddComment}
                    onClose={onClose}
                  />
                )
              : undefined
          }
        />
      </div>
    </div>
  );
}

/** Existing review comments, rendered inline under the line they annotate. */
function ReviewCommentThread({ comments }: { comments: PRReviewComment[] }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-2 bg-foreground/[0.04] border-y border-foreground/10">
      {comments.map((c) => (
        <div key={c.id} className="flex gap-2">
          <div className="w-5 h-5 rounded-full bg-brand/20 border border-brand/20 flex items-center justify-center shrink-0 text-[9px] text-brand font-semibold">
            {c.author.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-medium text-foreground/70">{c.author}</span>
              <span className="text-[9px] text-foreground/30">{relativeTime(c.createdAt)}</span>
            </div>
            <Markdown source={c.body} compact untrusted />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Composes a new review comment on one line. Comments can only be anchored to
 * the new side, which is what the API takes, so the old side says so rather than
 * accepting text it would have to throw away.
 */
function ReviewCommentComposer({
  lineNumber,
  disabled,
  onSubmit,
  onClose,
}: {
  lineNumber: number;
  disabled: boolean;
  onSubmit: (line: number, body: string) => Promise<void>;
  onClose: () => void;
}) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (disabled) {
    return (
      <div className="px-4 py-2 text-[11px] text-foreground/40 bg-foreground/[0.04] border-y border-foreground/10">
        Comments attach to the new side of the diff.{" "}
        <button onClick={onClose} className="text-brand hover:underline">
          Close
        </button>
      </div>
    );
  }

  async function submit() {
    if (!body.trim()) return;
    setSaving(true);
    setError("");
    try {
      await onSubmit(lineNumber, body.trim());
      setBody("");
      onClose();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 px-4 py-2 bg-foreground/[0.04] border-y border-foreground/10">
      <span className="text-[10px] text-foreground/40">Comment on line {lineNumber}</span>
      <textarea
        autoFocus
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          if (e.key === "Escape") onClose();
        }}
        placeholder="Leave a review comment…"
        className="text-xs bg-foreground/5 border border-foreground/15 rounded px-2 py-1.5 text-foreground/80 outline-none focus:border-brand/40 w-full resize-none"
      />
      {error && <span className="text-[10px] text-red-400">{error}</span>}
      <div className="flex items-center gap-1.5 justify-end">
        <button
          onClick={onClose}
          className="text-[10px] text-foreground/40 hover:text-foreground/60 px-2 py-1"
        >
          Cancel
        </button>
        <button
          onClick={() => void submit()}
          disabled={!body.trim() || saving}
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-brand/25 text-brand border border-brand/30 hover:bg-brand/35 disabled:opacity-40"
        >
          {saving && <Loader2 size={9} className="animate-spin" />}
          Add comment
        </button>
      </div>
    </div>
  );
}
