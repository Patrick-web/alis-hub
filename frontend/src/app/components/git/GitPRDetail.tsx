import { useEffect, useState } from "react";
import {
  ChevronDown,
  CircleDot,
  ExternalLink,
  FileDiff,
  GitMerge,
  GitPullRequest,
  Loader2,
  MessageSquare,
  X,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ForgejoPR,
  PRCommit,
  PRComment,
  PRDiff,
  PRDiffFile,
  PRRepoInfo,
  PRReview,
  PRReviewComment,
  ReviewDraftComment,
} from "./types";
import { GitDiffViewer } from "./GitDiffViewer";
import { Markdown } from "../Markdown";
import { relativeTime } from "../../lib/relativeTime";
import * as PRService from "../../../../bindings/alis-hub-v3/prservice";

type Tab = "overview" | "commits" | "files" | "conversation";
type MergeStyle = "merge" | "rebase" | "squash";
type ReviewEvent = "COMMENT" | "APPROVED" | "REQUEST_CHANGES";

interface Props {
  pr: ForgejoPR;
  org: string;
  product: string;
  repo: "build" | "define";
  repoInfo: PRRepoInfo | null;
  currentUser: string;
  merging: boolean;
  settingReady: boolean;
  onMerge: (number: number, style: MergeStyle, deleteBranch: boolean) => Promise<void>;
  onSetReady: (number: number) => Promise<void>;
  onRefresh: () => void;
  onClose: () => void;
}

function statusColor(code: string) {
  if (code === "A") return "text-green-400";
  if (code === "D") return "text-red-400";
  if (code === "R" || code === "C") return "text-blue-400";
  return "text-yellow-400";
}

/** errText renders a rejected call as a sentence rather than swallowing it. */
function errText(e: unknown): string {
  return String((e as Error)?.message ?? e ?? "").replace(/^Error:\s*/, "");
}

export function GitPRDetail({
  pr,
  org,
  product,
  repo,
  repoInfo,
  currentUser,
  merging,
  settingReady,
  onMerge,
  onSetReady,
  onRefresh,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  // Null means "follow the repo's own preference". Storing the choice outright
  // would need an effect to catch up once repoInfo arrives.
  const [styleChoice, setStyleChoice] = useState<MergeStyle | null>(null);
  const [deleteChoice, setDeleteChoice] = useState<boolean | null>(null);

  // Commits
  const [commits, setCommits] = useState<PRCommit[] | null>(null);
  const [commitsTruncated, setCommitsTruncated] = useState<{ shown: number; total: number } | null>(
    null,
  );
  const [commitsError, setCommitsError] = useState("");
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<PRCommit | null>(null);
  const [commitDiff, setCommitDiff] = useState<PRDiff | null>(null);
  const [commitDiffError, setCommitDiffError] = useState("");
  const [loadingCommitDiff, setLoadingCommitDiff] = useState(false);
  const [selectedCommitFile, setSelectedCommitFile] = useState<string | null>(null);

  // Files changed
  const [diff, setDiff] = useState<PRDiff | null>(null);
  const [diffError, setDiffError] = useState("");
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [fallbackFiles, setFallbackFiles] = useState<PRDiffFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Conversation
  const [comments, setComments] = useState<PRComment[] | null>(null);
  const [commentsTruncated, setCommentsTruncated] = useState<{
    shown: number;
    total: number;
  } | null>(null);
  const [reviews, setReviews] = useState<PRReview[]>([]);
  const [reviewComments, setReviewComments] = useState<PRReviewComment[]>([]);
  const [conversationError, setConversationError] = useState("");
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  // Review composer
  const [reviewEvent, setReviewEvent] = useState<ReviewEvent>("COMMENT");
  const [reviewBody, setReviewBody] = useState("");
  const [draftComments, setDraftComments] = useState<ReviewDraftComment[]>([]);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState("");

  // All of the state above is per-PR, and GitPage gives this component a key of
  // repo plus PR number, so switching PRs remounts it and the state resets on its
  // own. Clearing twenty fields in an effect instead would re-render the old PR's
  // data once before wiping it.
  //
  // A null data slot means "not loaded yet", which is what stops an empty result
  // from being refetched on every tab visit: keying on length === 0, as the
  // previous version did, reloaded forever.
  useEffect(() => {
    if (tab === "commits" && commits === null && !loadingCommits) void loadCommits();
    if (tab === "files" && diff === null && !loadingDiff) void loadDiff();
    if (tab === "conversation" && comments === null && !loadingConversation)
      void loadConversation();
  }, [tab, commits, diff, comments]);

  async function loadCommits() {
    setLoadingCommits(true);
    setCommitsError("");
    try {
      const result = await PRService.GetPRCommits(org, product, repo, pr.number);
      const list = result?.commits ?? [];
      setCommits(list);
      setCommitsTruncated(result?.truncated ? { shown: list.length, total: result.total } : null);
    } catch (e) {
      setCommits([]);
      setCommitsError(errText(e));
    } finally {
      setLoadingCommits(false);
    }
  }

  async function loadDiff() {
    setLoadingDiff(true);
    setDiffError("");
    try {
      const result = await PRService.GetPRDiff(org, product, repo, pr.number);
      setDiff(result ?? null);
      // A diff too large to render still leaves the question of what changed,
      // which the file list can answer on its own.
      if (result?.tooLarge) {
        const files = await PRService.GetPRFiles(org, product, repo, pr.number);
        setFallbackFiles(
          (files?.files ?? []).map((f) => ({
            path: f.path,
            oldPath: f.oldPath,
            statusCode: f.statusCode,
            binary: false,
            diff: { oldContent: "", newContent: "", language: "", hunks: [] },
          })) as PRDiffFile[],
        );
      }
    } catch (e) {
      setDiff(null);
      setDiffError(errText(e));
    } finally {
      setLoadingDiff(false);
    }
  }

  async function loadConversation() {
    setLoadingConversation(true);
    setConversationError("");
    try {
      const [commentList, reviewList] = await Promise.all([
        PRService.GetPRComments(org, product, repo, pr.number),
        PRService.GetPRReviews(org, product, repo, pr.number),
      ]);
      const list = commentList?.comments ?? [];
      setComments(list);
      setCommentsTruncated(
        commentList?.truncated ? { shown: list.length, total: commentList.total } : null,
      );

      const submitted = (reviewList ?? []).filter((r) => r.state !== "PENDING");
      setReviews(submitted);

      // Inline comments hang off their review, so they need one fetch each.
      const withComments = submitted.filter((r) => r.comments > 0);
      const threads = await Promise.all(
        withComments.map((r) =>
          PRService.GetReviewComments(org, product, repo, pr.number, r.id).catch(() => []),
        ),
      );
      setReviewComments(threads.flat().filter(Boolean) as PRReviewComment[]);
    } catch (e) {
      setComments([]);
      setConversationError(errText(e));
    } finally {
      setLoadingConversation(false);
    }
  }

  async function handleSelectCommit(commit: PRCommit) {
    setSelectedCommit(commit);
    setSelectedCommitFile(null);
    setCommitDiff(null);
    setCommitDiffError("");
    setLoadingCommitDiff(true);
    try {
      const result = await PRService.GetCommitDiff(org, product, repo, commit.sha);
      setCommitDiff(result ?? null);
      setSelectedCommitFile(result?.files?.[0]?.path ?? null);
    } catch (e) {
      setCommitDiffError(errText(e));
    } finally {
      setLoadingCommitDiff(false);
    }
  }

  async function handlePostComment() {
    if (!newComment.trim()) return;
    setPostingComment(true);
    setConversationError("");
    try {
      const created = await PRService.AddPRComment(
        org,
        product,
        repo,
        pr.number,
        newComment.trim(),
      );
      if (created) setComments((prev) => [...(prev ?? []), created]);
      setNewComment("");
    } catch (e) {
      setConversationError(errText(e));
    } finally {
      setPostingComment(false);
    }
  }

  async function handleSubmitReview() {
    setSubmittingReview(true);
    setReviewError("");
    try {
      await PRService.SubmitReview(
        org,
        product,
        repo,
        pr.number,
        reviewEvent,
        reviewBody.trim(),
        draftComments,
      );
      setReviewBody("");
      setDraftComments([]);
      setReviewEvent("COMMENT");
      setComments(null); // force a reload of the timeline
      await loadConversation();
      onRefresh();
    } catch (e) {
      setReviewError(errText(e));
    } finally {
      setSubmittingReview(false);
    }
  }

  function stageDraftComment(path: string, line: number, body: string) {
    setDraftComments((prev) => [...prev, { path, body, newPosition: line }]);
  }

  const mergeStyleLabels: Record<MergeStyle, string> = {
    merge: "Create a merge commit",
    rebase: "Rebase and merge",
    squash: "Squash and merge",
  };

  // Only offer what the repo permits, defaulting to its own preference.
  const allowedStyles = (["merge", "rebase", "squash"] as MergeStyle[]).filter((s) => {
    if (!repoInfo) return true;
    if (s === "merge") return repoInfo.allowMerge;
    if (s === "rebase") return repoInfo.allowRebase;
    return repoInfo.allowSquash;
  });

  // The effective style: the user's pick when the repo still permits it, else the
  // repo's default, else whatever it does allow.
  const preferredStyle = repoInfo?.defaultMergeStyle as MergeStyle | undefined;
  const mergeStyle =
    (styleChoice && allowedStyles.includes(styleChoice) && styleChoice) ||
    (preferredStyle && allowedStyles.includes(preferredStyle) && preferredStyle) ||
    allowedStyles[0] ||
    "merge";
  const deleteBranch = deleteChoice ?? repoInfo?.deleteBranchAfter ?? false;

  const filesForList = diff?.tooLarge ? fallbackFiles : (diff?.files ?? []);
  const activeDiffFile = filesForList.find((f) => f.path === selectedFile) ?? null;
  const commitFiles = commitDiff?.files ?? [];
  const activeCommitFile = commitFiles.find((f) => f.path === selectedCommitFile) ?? null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-foreground/10 px-4 py-3">
        <div className="flex items-start gap-3">
          <GitPullRequest
            size={15}
            className={`mt-0.5 shrink-0 ${pr.merged ? "text-purple-400" : pr.draft ? "text-foreground/40" : "text-green-400"}`}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-xs text-foreground/30 shrink-0">#{pr.number}</span>
              <span className="text-sm font-medium text-foreground/90 leading-snug">
                {pr.title}
              </span>
              <PRStateBadge pr={pr} />
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-foreground/35 flex-wrap">
              {pr.headRepo && <span className="font-mono text-amber-400/80">{pr.headRepo}</span>}
              <span className="font-mono text-brand/70">{pr.headBranch}</span>
              <span>→</span>
              <span className="font-mono text-foreground/50">{pr.baseBranch}</span>
              <span>·</span>
              <span>{pr.author}</span>
              <span>·</span>
              <span>{relativeTime(pr.createdAt)}</span>
              {(pr.additions > 0 || pr.deletions > 0) && (
                <>
                  <span>·</span>
                  <span className="text-green-400/80">+{pr.additions}</span>
                  <span className="text-red-400/80">-{pr.deletions}</span>
                  <span className="text-foreground/30">
                    in {pr.changedFiles} file{pr.changedFiles === 1 ? "" : "s"}
                  </span>
                </>
              )}
            </div>
            {pr.requestedReviewers.length > 0 && (
              <div className="mt-1 text-[10px] text-foreground/35">
                Review requested from {pr.requestedReviewers.join(", ")}
              </div>
            )}
          </div>
          {pr.htmlUrl && (
            <a
              href={pr.htmlUrl}
              target="_blank"
              rel="noreferrer"
              title="Open in Forgejo"
              className="shrink-0 p-1 rounded hover:bg-foreground/5 text-foreground/30 hover:text-foreground/60 transition-colors"
            >
              <ExternalLink size={13} />
            </a>
          )}
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
              ["commits", "Commits", commits?.length ?? null],
              ["files", "Files Changed", pr.changedFiles || null],
              ["conversation", "Conversation", (comments?.length ?? 0) + reviews.length || null],
            ] as [Tab, string, number | null][]
          ).map(([id, label, count]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-t border-b-2 transition-colors ${
                tab === id
                  ? "border-brand text-foreground/80 bg-brand/5"
                  : "border-transparent text-foreground/35 hover:text-foreground/60 hover:bg-foreground/[0.03]"
              }`}
            >
              {label}
              {count !== null && count > 0 && (
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
        {tab === "overview" && <OverviewTab pr={pr} reviews={reviews} />}

        {tab === "commits" &&
          (loadingCommits ? (
            <LoadingPane />
          ) : commitsError ? (
            <ErrorPane message={commitsError} onRetry={() => void loadCommits()} />
          ) : (
            <div className="flex h-full overflow-hidden">
              <div className="w-64 shrink-0 border-r border-foreground/8 overflow-y-auto">
                {commitsTruncated && (
                  <TruncationNotice
                    shown={commitsTruncated.shown}
                    total={commitsTruncated.total}
                    noun="commits"
                    htmlUrl={pr.htmlUrl}
                  />
                )}
                {(commits ?? []).length === 0 ? (
                  <EmptyPane message="No commits found" />
                ) : (
                  (commits ?? []).map((c) => (
                    <button
                      key={c.sha}
                      onClick={() => void handleSelectCommit(c)}
                      className={`w-full text-left px-3 py-2.5 border-b border-foreground/8 transition-colors ${
                        selectedCommit?.sha === c.sha
                          ? "bg-brand/10 border-l-2 border-l-brand"
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

              <div className="w-48 shrink-0 border-r border-foreground/8 overflow-y-auto">
                {!selectedCommit ? (
                  <EmptyPane message="Select a commit" />
                ) : loadingCommitDiff ? (
                  <LoadingPane />
                ) : commitDiffError ? (
                  <ErrorPane message={commitDiffError} />
                ) : commitFiles.length === 0 ? (
                  <EmptyPane message="No files" />
                ) : (
                  commitFiles.map((f) => (
                    <FileRow
                      key={f.path}
                      file={f}
                      selected={selectedCommitFile === f.path}
                      onSelect={() => setSelectedCommitFile(f.path)}
                    />
                  ))
                )}
              </div>

              <div className="flex-1 overflow-hidden">
                {commitDiff?.tooLarge ? (
                  <TooLargePane bytes={commitDiff.bytes} htmlUrl={pr.htmlUrl} />
                ) : (
                  <GitDiffViewer
                    diff={activeCommitFile?.diff ?? null}
                    filePath={selectedCommitFile}
                    staged={false}
                    commitHash={selectedCommit?.sha ?? null}
                  />
                )}
              </div>
            </div>
          ))}

        {tab === "files" &&
          (loadingDiff ? (
            <LoadingPane />
          ) : diffError ? (
            <ErrorPane message={diffError} onRetry={() => void loadDiff()} />
          ) : (
            <div className="flex h-full overflow-hidden">
              <div className="w-56 shrink-0 border-r border-foreground/8 overflow-y-auto">
                {filesForList.length === 0 ? (
                  <EmptyPane message="No files changed" />
                ) : (
                  filesForList.map((f) => (
                    <FileRow
                      key={f.path}
                      file={f}
                      showPath
                      commentCount={
                        reviewComments.filter((c) => c.path === f.path).length +
                        draftComments.filter((c) => c.path === f.path).length
                      }
                      selected={selectedFile === f.path}
                      onSelect={() => setSelectedFile(f.path)}
                    />
                  ))
                )}
              </div>

              <div className="flex-1 overflow-hidden">
                {diff?.tooLarge ? (
                  <TooLargePane bytes={diff.bytes} htmlUrl={pr.htmlUrl} />
                ) : (
                  <GitDiffViewer
                    diff={activeDiffFile?.diff ?? null}
                    filePath={selectedFile}
                    staged={false}
                    label={`#${pr.number}`}
                    comments={reviewComments.filter((c) => c.path === selectedFile)}
                    onAddComment={
                      selectedFile
                        ? async (line, body) => stageDraftComment(selectedFile, line, body)
                        : undefined
                    }
                  />
                )}
              </div>
            </div>
          ))}

        {tab === "conversation" &&
          (loadingConversation ? (
            <LoadingPane />
          ) : (
            <ConversationTab
              comments={comments ?? []}
              commentsTruncated={commentsTruncated}
              reviews={reviews}
              reviewComments={reviewComments}
              error={conversationError}
              htmlUrl={pr.htmlUrl}
              newComment={newComment}
              posting={postingComment}
              onChangeComment={setNewComment}
              onPost={() => void handlePostComment()}
              // Review composer
              isOwnPR={!!currentUser && currentUser === pr.author}
              reviewEvent={reviewEvent}
              reviewBody={reviewBody}
              draftComments={draftComments}
              submitting={submittingReview}
              reviewError={reviewError}
              onChangeReviewEvent={setReviewEvent}
              onChangeReviewBody={setReviewBody}
              onDropDraft={(i) => setDraftComments((prev) => prev.filter((_, idx) => idx !== i))}
              onSubmitReview={() => void handleSubmitReview()}
            />
          ))}
      </div>

      {/* Merge footer */}
      <div className="shrink-0 border-t border-foreground/10 px-4 py-3 flex items-center justify-between gap-3 bg-foreground/[0.015]">
        <MergeStatus pr={pr} reviews={reviews} />
        <div className="flex items-center gap-2">
          {pr.draft ? (
            <button
              onClick={() => void onSetReady(pr.number)}
              disabled={settingReady}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded bg-brand/25 text-brand border border-brand/30 hover:bg-brand/35 disabled:opacity-40 transition-colors"
            >
              {settingReady && <Loader2 size={11} className="animate-spin" />}
              Ready for review
            </button>
          ) : pr.merged ? null : (
            <>
              <label className="flex items-center gap-1.5 text-[10px] text-foreground/40 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deleteBranch}
                  onChange={(e) => setDeleteChoice(e.target.checked)}
                  className="accent-brand"
                />
                Delete branch
              </label>
              <div className="flex items-center gap-0">
                <button
                  onClick={() => void onMerge(pr.number, mergeStyle, deleteBranch)}
                  disabled={merging || !pr.mergeable || allowedStyles.length === 0}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-green-600/25 text-green-400 border border-green-600/30 hover:bg-green-600/35 disabled:opacity-40 transition-colors rounded-l"
                >
                  {merging ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <GitMerge size={11} />
                  )}
                  {mergeStyleLabels[mergeStyle]}
                </button>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      disabled={merging || !pr.mergeable || allowedStyles.length < 2}
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
                      {allowedStyles.map((style) => (
                        <DropdownMenu.Item
                          key={style}
                          className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-foreground/5 outline-none text-foreground/60"
                          onSelect={() => setStyleChoice(style)}
                        >
                          {style === mergeStyle && (
                            <span className="text-green-400 text-[10px]">✓</span>
                          )}
                          <span style={{ marginLeft: style === mergeStyle ? 0 : 14 }}>
                            {mergeStyleLabels[style]}
                          </span>
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PRStateBadge({ pr }: { pr: ForgejoPR }) {
  const [label, cls] = pr.merged
    ? ["merged", "border-purple-500/40 bg-purple-500/10 text-purple-400"]
    : pr.draft
      ? ["draft", "border-foreground/20 bg-foreground/5 text-foreground/50"]
      : pr.state === "closed"
        ? ["closed", "border-red-500/40 bg-red-500/10 text-red-400"]
        : ["open", "border-green-500/40 bg-green-500/10 text-green-400"];
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${cls}`}>{label}</span>
  );
}

/**
 * Says why a PR cannot be merged, rather than blaming conflicts for everything.
 * A draft used to read "Cannot automatically merge", which is the wrong reason
 * and offers no way forward.
 */
function MergeStatus({ pr, reviews }: { pr: ForgejoPR; reviews: PRReview[] }) {
  const approvals = reviews.filter((r) => r.state === "APPROVED" && !r.stale).length;
  const rejections = reviews.filter((r) => r.state === "REQUEST_CHANGES" && !r.stale).length;

  const [dot, text] = pr.merged
    ? ["bg-purple-400/70", "This pull request has been merged"]
    : pr.draft
      ? ["bg-foreground/40", "Draft, not ready for review"]
      : !pr.mergeable
        ? ["bg-amber-400/70", "Conflicting files must be resolved before merging"]
        : rejections > 0
          ? ["bg-red-400/70", `${rejections} reviewer asked for changes`]
          : approvals > 0
            ? ["bg-green-400/70", `Approved by ${approvals} reviewer${approvals === 1 ? "" : "s"}`]
            : ["bg-green-400/70", "This branch has no conflicts"];

  return (
    <div className="flex items-center gap-2 text-[11px] text-foreground/40">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {text}
    </div>
  );
}

function OverviewTab({ pr, reviews }: { pr: ForgejoPR; reviews: PRReview[] }) {
  return (
    <div className="h-full overflow-y-auto px-4 py-4 flex flex-col gap-4">
      {pr.body ? (
        <div className="max-w-prose">
          <Markdown source={pr.body} untrusted />
        </div>
      ) : (
        <p className="text-sm text-foreground/25 italic">No description provided.</p>
      )}
      {reviews.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] text-foreground/40 uppercase tracking-wider font-semibold">
            Reviews
          </span>
          {reviews.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-[11px]">
              <ReviewStateBadge state={r.state} stale={r.stale} />
              <span className="text-foreground/60">{r.author}</span>
              <span className="text-foreground/25">{relativeTime(r.submittedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewStateBadge({ state, stale }: { state: string; stale?: boolean }) {
  const map: Record<string, [string, string]> = {
    APPROVED: ["approved", "border-green-500/40 bg-green-500/10 text-green-400"],
    REQUEST_CHANGES: ["changes requested", "border-red-500/40 bg-red-500/10 text-red-400"],
    COMMENT: ["commented", "border-foreground/20 bg-foreground/5 text-foreground/50"],
  };
  const [label, cls] = map[state] ?? [
    state.toLowerCase(),
    "border-foreground/20 text-foreground/50",
  ];
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${cls}`}>
      {label}
      {stale ? " (stale)" : ""}
    </span>
  );
}

function FileRow({
  file,
  selected,
  showPath,
  commentCount,
  onSelect,
}: {
  file: PRDiffFile;
  selected: boolean;
  showPath?: boolean;
  commentCount?: number;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left flex items-center gap-1.5 px-2.5 py-2 border-b border-foreground/8 transition-colors ${
        selected ? "bg-brand/10 border-l-2 border-l-brand" : "hover:bg-foreground/[0.03]"
      }`}
    >
      <span className={`text-[10px] font-mono w-3 shrink-0 ${statusColor(file.statusCode)}`}>
        {file.statusCode}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-foreground/75 truncate">
          {file.path.split("/").pop()}
          {file.binary && <span className="ml-1 text-foreground/30">(binary)</span>}
        </div>
        {showPath && <div className="text-[9px] text-foreground/30 truncate">{file.path}</div>}
      </div>
      {!!commentCount && (
        <span className="shrink-0 flex items-center gap-0.5 text-[9px] text-brand">
          <MessageSquare size={9} />
          {commentCount}
        </span>
      )}
    </button>
  );
}

interface ConversationTabProps {
  comments: PRComment[];
  commentsTruncated: { shown: number; total: number } | null;
  reviews: PRReview[];
  reviewComments: PRReviewComment[];
  error: string;
  htmlUrl: string;
  newComment: string;
  posting: boolean;
  onChangeComment: (v: string) => void;
  onPost: () => void;
  isOwnPR: boolean;
  reviewEvent: ReviewEvent;
  reviewBody: string;
  draftComments: ReviewDraftComment[];
  submitting: boolean;
  reviewError: string;
  onChangeReviewEvent: (e: ReviewEvent) => void;
  onChangeReviewBody: (v: string) => void;
  onDropDraft: (index: number) => void;
  onSubmitReview: () => void;
}

function ConversationTab({
  comments,
  commentsTruncated,
  reviews,
  reviewComments,
  error,
  htmlUrl,
  newComment,
  posting,
  onChangeComment,
  onPost,
  isOwnPR,
  reviewEvent,
  reviewBody,
  draftComments,
  submitting,
  reviewError,
  onChangeReviewEvent,
  onChangeReviewBody,
  onDropDraft,
  onSubmitReview,
}: ConversationTabProps) {
  // One timeline: plain comments and reviews interleaved by time, which is the
  // order they happened in.
  const timeline = [
    ...comments.map((c) => ({ kind: "comment" as const, at: c.createdAt, comment: c })),
    ...reviews.map((r) => ({ kind: "review" as const, at: r.submittedAt, review: r })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const reviewEvents: [ReviewEvent, string][] = [
    ["COMMENT", "Comment"],
    ["APPROVED", "Approve"],
    ["REQUEST_CHANGES", "Request changes"],
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {error && <InlineError message={error} />}
        {commentsTruncated && (
          <TruncationNotice
            shown={commentsTruncated.shown}
            total={commentsTruncated.total}
            noun="comments"
            htmlUrl={htmlUrl}
          />
        )}
        {timeline.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-8 gap-1">
            <MessageSquare size={18} className="text-foreground/15" />
            <p className="text-[11px] text-foreground/30">No comments or reviews yet</p>
          </div>
        )}
        {timeline.map((entry) =>
          entry.kind === "comment" ? (
            <Comment
              key={`c${entry.comment.id}`}
              author={entry.comment.author}
              at={entry.comment.createdAt}
              body={entry.comment.body}
            />
          ) : (
            <div key={`r${entry.review.id}`} className="flex flex-col gap-1.5">
              <Comment
                author={entry.review.author}
                at={entry.review.submittedAt}
                body={entry.review.body}
                badge={<ReviewStateBadge state={entry.review.state} stale={entry.review.stale} />}
              />
              {reviewComments
                .filter((rc) => rc.reviewId === entry.review.id)
                .map((rc) => (
                  <div key={rc.id} className="ml-8 border-l-2 border-brand/20 pl-3">
                    <div className="text-[9px] font-mono text-foreground/35 truncate">
                      {rc.path}
                      {rc.line ? `:${rc.line}` : ""}
                    </div>
                    <Markdown source={rc.body} compact untrusted />
                  </div>
                ))}
            </div>
          ),
        )}
      </div>

      {/* Review composer */}
      <div className="shrink-0 border-t border-foreground/8 px-4 py-3 flex flex-col gap-2">
        {draftComments.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-foreground/40 uppercase tracking-wider font-semibold">
              {draftComments.length} pending inline comment
              {draftComments.length === 1 ? "" : "s"}
            </span>
            {draftComments.map((d, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px] text-foreground/50">
                <FileDiff size={10} className="mt-0.5 shrink-0 text-brand/60" />
                <span className="font-mono truncate">
                  {d.path}:{d.newPosition}
                </span>
                <span className="truncate flex-1">{d.body}</span>
                <button
                  onClick={() => onDropDraft(i)}
                  className="shrink-0 text-foreground/30 hover:text-red-400"
                  title="Discard"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          className="text-xs bg-foreground/5 border border-foreground/15 rounded px-3 py-2 text-foreground/80 outline-none focus:border-brand/40 w-full resize-none"
          placeholder={
            reviewEvent === "COMMENT" ? "Leave a comment…" : "Explain what needs to change…"
          }
          rows={3}
          value={reviewEvent === "COMMENT" ? newComment : reviewBody}
          onChange={(e) =>
            reviewEvent === "COMMENT"
              ? onChangeComment(e.target.value)
              : onChangeReviewBody(e.target.value)
          }
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
            if (reviewEvent === "COMMENT" && draftComments.length === 0) onPost();
            else onSubmitReview();
          }}
        />

        {reviewError && <InlineError message={reviewError} />}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {reviewEvents.map(([ev, label]) => {
              const blocked = ev === "APPROVED" && isOwnPR;
              return (
                <button
                  key={ev}
                  onClick={() => onChangeReviewEvent(ev)}
                  disabled={blocked}
                  title={blocked ? "You cannot approve your own pull request" : undefined}
                  className={`text-[10px] px-2 py-1 rounded border transition-colors disabled:opacity-30 ${
                    reviewEvent === ev
                      ? "border-brand/40 bg-brand/15 text-brand"
                      : "border-foreground/10 text-foreground/40 hover:text-foreground/60"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => {
              // A plain comment with no inline notes is an issue comment; the
              // moment either a verdict or an inline note is attached, it is a
              // review.
              if (reviewEvent === "COMMENT" && draftComments.length === 0) onPost();
              else onSubmitReview();
            }}
            disabled={
              submitting ||
              posting ||
              (reviewEvent === "COMMENT"
                ? !newComment.trim() && draftComments.length === 0
                : reviewEvent === "REQUEST_CHANGES" &&
                  !reviewBody.trim() &&
                  draftComments.length === 0)
            }
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-brand/25 text-brand border border-brand/30 hover:bg-brand/35 disabled:opacity-40 transition-colors rounded"
          >
            {(posting || submitting) && <Loader2 size={10} className="animate-spin" />}
            {reviewEvent === "COMMENT" && draftComments.length === 0 ? "Comment" : "Submit review"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Comment({
  author,
  at,
  body,
  badge,
}: {
  author: string;
  at: string;
  body: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5">
      <div className="w-6 h-6 rounded-full bg-brand/20 border border-brand/20 flex items-center justify-center shrink-0 text-[10px] text-brand font-semibold">
        {author.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1 flex-wrap">
          <span className="text-[11px] font-medium text-foreground/70">{author}</span>
          {badge}
          <span className="text-[10px] text-foreground/30">{relativeTime(at)}</span>
        </div>
        {body && (
          <div className="bg-foreground/[0.03] border border-foreground/8 rounded px-3 py-2">
            <Markdown source={body} compact untrusted />
          </div>
        )}
      </div>
    </div>
  );
}

function TruncationNotice({
  shown,
  total,
  noun,
  htmlUrl,
}: {
  shown: number;
  total: number;
  noun: string;
  htmlUrl: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2 text-[10px] text-amber-400 bg-amber-500/10 border-b border-amber-500/20">
      <CircleDot size={10} className="shrink-0" />
      <span>
        Showing {shown} of {total} {noun}.
      </span>
      {htmlUrl && (
        <a href={htmlUrl} target="_blank" rel="noreferrer" className="underline hover:no-underline">
          Open in Forgejo
        </a>
      )}
    </div>
  );
}

function TooLargePane({ bytes, htmlUrl }: { bytes: number; htmlUrl: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
      <FileDiff size={20} className="text-foreground/20" />
      <p className="text-[12px] text-foreground/40">
        This diff is {(bytes / (1024 * 1024)).toFixed(1)}MB, too large to render here.
      </p>
      {htmlUrl && (
        <a
          href={htmlUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-brand hover:underline flex items-center gap-1"
        >
          <ExternalLink size={11} /> Open in Forgejo
        </a>
      )}
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/20 text-[11px] text-red-400 break-words">
      {message}
    </div>
  );
}

function ErrorPane({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 px-6">
      <p className="text-[11px] text-red-400 text-center break-words max-w-md">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-[11px] px-2.5 py-1 rounded border border-foreground/15 text-foreground/50 hover:text-foreground/80 hover:border-foreground/30 transition-colors"
        >
          Try again
        </button>
      )}
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
