import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { Icon } from "@iconify/react";
import { marked } from "marked";
import { Loader } from "../components/Loader";
import { Button } from "../components/Button";
import { copyToClipboard } from "../lib/clipboard";
import * as CLI from "../../../bindings/alis-hub-v3/cliservice";
import type { SkillSummary, InstalledSkill } from "../../../bindings/alis-hub-v3/models";

/**
 * Browse the Alis Build skills registry and install skills into the local
 * agent harness.
 *
 * Skills are curated instruction documents, one per task. The platform's own
 * workflow is search -> load -> resource: search ranks the catalog
 * semantically, load returns the markdown. Installing writes the skill into
 * the user's Claude Code skills directory, which is the part that makes this
 * worth having in a desktop app rather than only in a terminal.
 */

type Tab = "catalog" | "installed";

/** Rows the list renders, from either search results or the full catalog. */
interface SkillRow {
  id: string;
  displayName: string;
  description: string;
  loadCount: string;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <span className="text-[9px] text-foreground/25 font-mono uppercase tracking-[0.12em]">
      {children}
    </span>
  );
}

/**
 * Skills open with YAML front matter, which is metadata rather than prose. The
 * name and description are already shown in the header above, so strip it.
 */
function stripFrontMatter(source: string): string {
  const trimmed = source.trimStart();
  if (!trimmed.startsWith("---")) return source;
  const end = trimmed.indexOf("\n---", 3);
  return end === -1 ? source : trimmed.slice(end + 4).trimStart();
}

/**
 * Skills are written as markdown, so render them as markdown. They lean on
 * headings, tables and fenced code, none of which reads well as raw text.
 */
function SkillMarkdown({ source }: { source: string }) {
  const html = useMemo(() => {
    const body = stripFrontMatter(source);
    return body ? (marked.parse(body) as string) : "";
  }, [source]);

  return (
    <div
      className="prose prose-invert prose-sm max-w-none break-words
        text-[12px] leading-[1.7] text-foreground/75
        [&_h1]:font-mono [&_h1]:text-[15px] [&_h1]:font-bold [&_h1]:uppercase [&_h1]:text-foreground [&_h1]:mb-[12px]
        [&_h2]:font-mono [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:uppercase [&_h2]:text-foreground [&_h2]:mt-[20px] [&_h2]:mb-[8px]
        [&_h3]:font-mono [&_h3]:text-[12px] [&_h3]:font-bold [&_h3]:text-foreground [&_h3]:mt-[16px] [&_h3]:mb-[6px]
        [&_h4]:text-[12px] [&_h4]:font-semibold [&_h4]:text-foreground [&_h4]:mb-[4px]
        [&_p]:text-foreground/70 [&_p]:mb-[10px]
        [&_code]:text-brand [&_code]:bg-foreground/5 [&_code]:px-[4px] [&_code]:py-[1px] [&_code]:rounded [&_code]:text-[11px]
        [&_pre]:bg-card [&_pre]:border [&_pre]:border-border [&_pre]:rounded-[4px] [&_pre]:text-[11px] [&_pre]:p-[12px] [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words
        [&_pre_code]:bg-transparent [&_pre_code]:text-foreground/80 [&_pre_code]:p-0
        [&_a]:text-brand [&_a]:no-underline hover:[&_a]:underline
        [&_strong]:text-foreground
        [&_li]:text-foreground/70 [&_li]:mb-[4px]
        [&_ul]:mb-[10px] [&_ol]:mb-[10px]
        [&_table]:w-full [&_table]:border-collapse [&_table]:mb-[12px] [&_table]:block [&_table]:overflow-x-auto
        [&_th]:border [&_th]:border-border [&_th]:bg-card [&_th]:px-[8px] [&_th]:py-[5px] [&_th]:text-left [&_th]:text-[10px] [&_th]:font-mono [&_th]:uppercase [&_th]:text-foreground/60
        [&_td]:border [&_td]:border-border [&_td]:px-[8px] [&_td]:py-[5px] [&_td]:text-[11px] [&_td]:align-top
        [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-[10px] [&_blockquote]:text-foreground/50
        [&_hr]:border-border [&_hr]:my-[20px]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function SkillsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>("catalog");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SkillRow[]>([]);
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);

  const installedIds = useMemo(
    () => new Set(installed.map((s) => s.skillId)),
    [installed],
  );

  const refreshInstalled = useCallback(async () => {
    try {
      setInstalled((await CLI.SkillsInstalled()) ?? []);
    } catch (e) {
      // A missing harness is normal — it just means nothing is installed here.
      console.warn("skills installed:", e);
      setInstalled([]);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    setLoadingList(true);
    setError("");
    try {
      const skills = (await CLI.SkillsList()) ?? [];
      setRows(
        skills.map((s) => ({
          id: s.id,
          displayName: s.displayName || s.id,
          description: s.description,
          loadCount: s.loadCount,
        })),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingList(false);
    }
  }, []);

  const runSearch = useCallback(async () => {
    if (!query.trim()) {
      void loadCatalog();
      return;
    }
    setLoadingList(true);
    setError("");
    try {
      const found: SkillSummary[] = (await CLI.SkillsSearch(query.trim())) ?? [];
      setRows(
        found.map((s) => ({
          id: s.id,
          displayName: s.displayName || s.id,
          description: s.description,
          loadCount: s.loadCount,
        })),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingList(false);
    }
  }, [query, loadCatalog]);

  useEffect(() => {
    void loadCatalog();
    void refreshInstalled();
  }, [loadCatalog, refreshInstalled]);

  const openSkill = useCallback(async (id: string) => {
    setSelected(id);
    setMarkdown("");
    setLoadingDetail(true);
    setError("");
    setCopied(false);
    try {
      setMarkdown(await CLI.SkillsLoad(id, ""));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // Ask cites the skills an answer came from and links here as
  // `/skills?open=<id>`. Consume the parameter and clear it, so that opening a
  // citation lands on the instructions rather than an empty detail pane, and a
  // later manual selection is not overridden by a stale deep link.
  const openParam = searchParams.get("open");
  useEffect(() => {
    if (!openParam) return;
    void openSkill(openParam);
    setSearchParams({}, { replace: true });
  }, [openParam, openSkill, setSearchParams]);

  // The raw document is what gets copied, front matter included, since that is
  // the form a harness expects when the text is pasted back into one.
  const copyMarkdown = useCallback(async () => {
    if (!markdown) return;
    try {
      await copyToClipboard(markdown);
      setCopied(true);
    } catch (e) {
      setError(String(e));
    }
  }, [markdown]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const install = useCallback(
    async (id: string, project: boolean) => {
      setBusyAction(true);
      setError("");
      setNotice("");
      try {
        // force is deliberately not offered: without it the CLI refuses to
        // overwrite a folder it did not write, which is what protects a
        // hand-authored skill of the same name.
        await CLI.SkillsInstall(id, "claude", project, false);
        setNotice(`Installed ${id}${project ? " into this project" : ""}`);
        await refreshInstalled();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusyAction(false);
      }
    },
    [refreshInstalled],
  );

  const uninstall = useCallback(
    async (id: string) => {
      setBusyAction(true);
      setError("");
      setNotice("");
      try {
        await CLI.SkillsUninstall(id, "claude", false);
        setNotice(`Removed ${id}`);
        await refreshInstalled();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusyAction(false);
      }
    },
    [refreshInstalled],
  );

  const listed: SkillRow[] =
    tab === "catalog"
      ? rows
      : installed.map((s) => ({
          id: s.skillId,
          displayName: s.skillId,
          description: `${s.harness} · ${s.version || "unversioned"}`,
          loadCount: "",
        }));

  return (
    <div className="flex flex-1 flex-col h-full min-w-0 min-h-0">
      <div className="flex items-center gap-[12px] px-[20px] py-[14px] border-b border-border shrink-0">
        <Icon icon="solar:book-bookmark-linear" className="text-brand text-[20px]" />
        <div className="flex flex-col">
          <span className="text-[13px] text-foreground font-mono">Skills</span>
          <span className="text-[10px] text-foreground/40 font-mono">
            Platform instructions, installable into your local agent harness
          </span>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-[2px] bg-card border border-border p-[2px]">
          {(["catalog", "installed"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-[10px] font-mono px-[10px] py-[4px] transition-colors ${
                tab === t
                  ? "bg-brand-fill text-brand-foreground"
                  : "text-foreground/50 hover:text-foreground"
              }`}
            >
              {t === "catalog" ? "Catalog" : `Installed (${installed.length})`}
            </button>
          ))}
        </div>
      </div>

      {tab === "catalog" && (
        <div className="flex items-center gap-[8px] px-[20px] py-[10px] border-b border-border shrink-0">
          <Icon icon="solar:magnifer-linear" className="text-foreground/30 text-[14px]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
            }}
            placeholder="Describe the task, e.g. deploy a service to production"
            className="flex-1 bg-transparent text-[11px] text-foreground font-mono outline-none placeholder:text-foreground/25"
          />
          <Button variant="secondary" onClick={() => void runSearch()} className="text-[10px]">
            Search
          </Button>
          {query && (
            <Button
              variant="ghost"
              onClick={() => {
                setQuery("");
                void loadCatalog();
              }}
              className="text-[10px]"
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {(error || notice) && (
        <div
          className={`px-[20px] py-[8px] text-[10px] font-mono border-b border-border shrink-0 ${
            error ? "text-red-400" : "text-brand"
          }`}
        >
          {error || notice}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* A flex column, because the rows are <button> elements: left as
            inline-block they sit on a text baseline and inherit the
            container's line-height strut, which shows up as unexplained
            vertical space between rows. Flex items are blockified. */}
        <div className="w-[340px] border-r border-border overflow-y-auto shrink-0 flex flex-col">
          {loadingList ? (
            <div className="flex justify-center py-[40px]">
              <Loader size={28} />
            </div>
          ) : listed.length === 0 ? (
            <div className="px-[20px] py-[30px] text-[10px] text-foreground/35 font-mono text-center">
              {tab === "installed" ? "No skills installed yet" : "No skills found"}
            </div>
          ) : (
            listed.map((s) => (
              <button
                key={s.id}
                onClick={() => void openSkill(s.id)}
                className={`w-full shrink-0 text-left px-[16px] py-[11px] border-b border-border hover:bg-foreground/[3%] transition-colors ${
                  selected === s.id ? "bg-brand-fill/8 border-l-2 border-l-brand" : ""
                }`}
              >
                <div className="flex items-center gap-[6px]">
                  <span className="text-[11px] text-foreground font-mono truncate">
                    {s.displayName}
                  </span>
                  {installedIds.has(s.id) && (
                    <span className="shrink-0" title="Installed locally">
                      <Icon icon="solar:check-circle-bold" className="text-brand text-[12px]" />
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-foreground/40 font-mono mt-[3px] line-clamp-2 leading-[1.45]">
                  {s.description}
                </p>
              </button>
            ))
          )}
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full gap-[10px] text-foreground/25">
              <Icon icon="solar:document-text-linear" className="text-[32px]" />
              <span className="text-[10px] font-mono">Select a skill to read its instructions</span>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-[10px] px-[20px] py-[12px] border-b border-border shrink-0">
                <SectionLabel>SKILL</SectionLabel>
                <span className="text-[11px] text-foreground font-mono truncate">{selected}</span>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  disabled={!markdown || loadingDetail}
                  onClick={() => void copyMarkdown()}
                  className="text-[10px]"
                  icon={<Icon icon="solar:copy-linear" className="text-sm" />}
                  title="Copy the skill markdown"
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
                {installedIds.has(selected) ? (
                  <Button
                    variant="secondary"
                    disabled={busyAction}
                    onClick={() => void uninstall(selected)}
                    className="text-[10px]"
                  >
                    Uninstall
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      disabled={busyAction}
                      onClick={() => void install(selected, true)}
                      className="text-[10px]"
                      title="Install into this repository's .claude/skills"
                    >
                      Install to project
                    </Button>
                    <Button
                      variant="primary"
                      disabled={busyAction}
                      onClick={() => void install(selected, false)}
                      className="text-[10px]"
                      title="Install into your user-scope Claude Code skills"
                    >
                      Install
                    </Button>
                  </>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-[20px] py-[16px]">
                {loadingDetail ? (
                  <div className="flex justify-center py-[40px]">
                    <Loader size={28} />
                  </div>
                ) : (
                  <SkillMarkdown source={markdown} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
