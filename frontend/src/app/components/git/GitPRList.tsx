import { useState } from "react";
import { ForgejoPR } from "./types";
import { ArrowUpDown, GitPullRequest, Loader2, Plus, RefreshCw, Search, X } from "lucide-react";
import { relativeTime } from "../../lib/relativeTime";
import { SearchableSelect } from "../ui/searchable-select";

/** Sentinel for "has nobody assigned", which is distinct from "any assignee". */
export const UNASSIGNED = "\u0000unassigned";

type SortKey = "newest" | "oldest" | "updated" | "comments" | "title";

const SORT_OPTIONS: [SortKey, string][] = [
  ["newest", "Newest"],
  ["oldest", "Oldest"],
  ["updated", "Recently updated"],
  ["comments", "Most comments"],
  ["title", "Title A–Z"],
];

function sortPRs(prs: ForgejoPR[], key: SortKey): ForgejoPR[] {
  const sorted = [...prs];
  switch (key) {
    case "newest":
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case "oldest":
      return sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "updated":
      return sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    case "comments":
      return sorted.sort((a, b) => b.comments + b.reviewComments - (a.comments + a.reviewComments));
    case "title":
      return sorted.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      );
  }
}

interface Props {
  prs: ForgejoPR[];
  selectedPR: ForgejoPR | null;
  loading: boolean;
  total: number;
  truncated: boolean;
  /** Login of the signed-in user, so the filters can offer "me" first. */
  currentUser: string;
  authorFilter: string;
  assigneeFilter: string;
  onChangeAuthorFilter: (value: string) => void;
  onChangeAssigneeFilter: (value: string) => void;
  onSelect: (pr: ForgejoPR) => void;
  onNewPR: () => void;
  onRefresh: () => void;
}

export function GitPRList({
  prs,
  selectedPR,
  loading,
  total,
  truncated,
  currentUser,
  authorFilter,
  assigneeFilter,
  onChangeAuthorFilter,
  onChangeAssigneeFilter,
  onSelect,
  onNewPR,
  onRefresh,
}: Props) {
  // Search and sort are pure view concerns: they narrow what is already loaded
  // rather than driving a refetch, so they live here rather than in the store.
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");

  // Options come from the loaded list, so they only ever offer people who
  // actually appear in it.
  const authors = [...new Set(prs.map((p) => p.author).filter(Boolean))].sort();
  const assignees = [...new Set(prs.flatMap((p) => p.assignees ?? []).filter(Boolean))].sort();

  // "me" is listed first when the user appears at all: it is the common case.
  const withMe = (people: string[]) =>
    currentUser && people.includes(currentUser)
      ? [
          { label: `${currentUser} (me)`, value: currentUser },
          ...people.filter((p) => p !== currentUser).map((p) => ({ label: p, value: p })),
        ]
      : people.map((p) => ({ label: p, value: p }));

  const authorOptions = [{ label: "Anyone", value: "" }, ...withMe(authors)];
  const assigneeOptions = [
    { label: "Anyone", value: "" },
    { label: "Unassigned", value: UNASSIGNED },
    ...withMe(assignees),
  ];

  const query = searchQuery.trim().toLowerCase();
  const searchByNumber = query.startsWith("#") ? query.slice(1) : query;

  const visible = sortPRs(
    prs.filter((pr) => {
      if (authorFilter && pr.author !== authorFilter) return false;
      const assigned = pr.assignees ?? [];
      if (assigneeFilter === UNASSIGNED) return assigned.length === 0;
      if (assigneeFilter && !assigned.includes(assigneeFilter)) return false;
      if (query && !pr.title.toLowerCase().includes(query) && String(pr.number) !== searchByNumber)
        return false;
      return true;
    }),
    sortKey,
  );

  const filtering = !!authorFilter || !!assigneeFilter || !!query;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-foreground/10">
        <GitPullRequest size={13} className="text-foreground/40 shrink-0" />
        <span className="text-xs text-foreground/60 flex-1">
          PRs
          {prs.length > 0 && (
            <span className="ml-1.5 text-[10px] bg-brand/30 text-brand border border-brand/30 rounded px-1 py-0.5">
              {filtering ? `${visible.length}/${prs.length}` : prs.length}
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

      {/* Search */}
      <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-b border-foreground/10">
        <div className="relative flex-1 min-w-0">
          <Search
            size={11}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-foreground/30 pointer-events-none"
          />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by number or title…"
            className="w-full text-[11px] bg-foreground/5 border border-foreground/15 rounded pl-6 pr-2 py-1 text-foreground/80 outline-none focus:border-brand/40"
          />
        </div>
        <div className="shrink-0 flex items-center gap-1">
          <ArrowUpDown size={10} className="text-foreground/30" />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="text-[10px] bg-foreground/5 border border-foreground/15 rounded px-1 py-1 text-foreground/60 outline-none focus:border-brand/40"
          >
            {SORT_OPTIONS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Filters */}
      <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-b border-foreground/10">
        <SearchableSelect
          label="Author"
          value={authorFilter}
          options={authorOptions}
          onChange={onChangeAuthorFilter}
          placeholder="Anyone"
          className="flex-1 min-w-0"
        />
        <SearchableSelect
          label="Assignee"
          value={assigneeFilter}
          options={assigneeOptions}
          onChange={onChangeAssigneeFilter}
          placeholder="Anyone"
          className="flex-1 min-w-0"
        />
        {filtering && (
          <button
            onClick={() => {
              onChangeAuthorFilter("");
              onChangeAssigneeFilter("");
              setSearchQuery("");
            }}
            title="Clear filters"
            className="shrink-0 p-1 rounded hover:bg-foreground/5 text-foreground/40 hover:text-foreground/70 transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* PR list */}
      <div className="flex-1 overflow-y-auto">
        {truncated && (
          <div className="px-3 py-1.5 text-[10px] text-amber-400 bg-amber-500/10 border-b border-amber-500/20">
            Showing {prs.length} of {total} open pull requests.
          </div>
        )}
        {loading && prs.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-foreground/30">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : prs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-1">
            <GitPullRequest size={18} className="text-foreground/15" />
            <p className="text-[11px] text-foreground/30">No open PRs</p>
          </div>
        ) : visible.length === 0 ? (
          // Distinct from "no open PRs": the list is not empty, the filter is.
          <div className="flex flex-col items-center justify-center py-8 gap-1.5 px-4">
            <GitPullRequest size={18} className="text-foreground/15" />
            <p className="text-[11px] text-foreground/30 text-center">
              None of the {prs.length} open pull requests match these filters.
            </p>
            <button
              onClick={() => {
                onChangeAuthorFilter("");
                onChangeAssigneeFilter("");
                setSearchQuery("");
              }}
              className="text-[10px] px-2 py-1 rounded border border-foreground/15 text-foreground/50 hover:text-foreground/80 hover:border-foreground/30 transition-colors"
            >
              Clear filters
            </button>
          </div>
        ) : (
          visible.map((pr) => {
            const isSelected = selectedPR?.number === pr.number;
            return (
              <button
                key={pr.number}
                onClick={() => onSelect(pr)}
                className={`w-full text-left flex items-start gap-2 px-3 py-2 border-b border-foreground/8 transition-colors ${
                  isSelected
                    ? "bg-brand/10 border-l-2 border-l-brand"
                    : "hover:bg-foreground/[0.03]"
                }`}
              >
                <GitPullRequest
                  size={11}
                  className={`mt-0.5 shrink-0 ${pr.draft ? "text-foreground/30" : "text-green-400/70"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1 min-w-0">
                    <span className="text-[10px] text-foreground/30 shrink-0">#{pr.number}</span>
                    {pr.draft && (
                      <span className="text-[9px] px-1 rounded-full border border-foreground/20 bg-foreground/5 text-foreground/45 shrink-0">
                        draft
                      </span>
                    )}
                    <span className="text-[11px] text-foreground/80 truncate leading-snug">
                      {pr.title}
                    </span>
                  </div>
                  <div className="text-[10px] text-foreground/35 truncate mt-0.5">
                    {pr.headBranch} → {pr.baseBranch}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-foreground/25 mt-0.5">
                    <span className="truncate">
                      {pr.author} · {relativeTime(pr.createdAt)}
                    </span>
                    {!pr.mergeable && !pr.draft && (
                      <span className="text-amber-400/70 shrink-0">· conflicts</span>
                    )}
                    {pr.comments + pr.reviewComments > 0 && (
                      <span className="shrink-0">· {pr.comments + pr.reviewComments} 💬</span>
                    )}
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
