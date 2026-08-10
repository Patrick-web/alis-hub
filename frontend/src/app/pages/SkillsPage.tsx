import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { Icon } from "@iconify/react";
import { Loader } from "../components/Loader";
import { Button } from "../components/Button";
import { Markdown } from "../components/Markdown";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { InstallTargetPanel } from "../components/skills/InstallTargetPanel";
import { targetLabel, type InstallTarget } from "../components/skills/target";
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
 * Skill documents open with YAML front matter, which is metadata rather than
 * prose. The name and description are already shown in the header above.
 */
function stripFrontMatter(source: string): string {
  const trimmed = source.trimStart();
  if (!trimmed.startsWith("---")) return source;
  const end = trimmed.indexOf("\n---", 3);
  return end === -1 ? source : trimmed.slice(end + 4).trimStart();
}

/** Skills are documents, so they render at full document scale. */
function SkillMarkdown({ source }: { source: string }) {
  return <Markdown source={stripFrontMatter(source)} />;
}

/**
 * Names the landing zone and product a project install lives in.
 *
 * The CLI reports only an absolute path, and the app installs into
 * ~/alis.build/<org>/build/<product>, so the path is where the target has to be
 * read back from. Anything installed elsewhere falls back to the raw path
 * rather than being guessed at.
 */
function installLocation(skill: InstalledSkill): string {
  if (!skill.project) return "User scope";
  const m = skill.path.match(/\/alis\.build\/([^/]+)\/build\/([^/]+)\//);
  return m ? `${m[1]} · ${m[2]}` : skill.path;
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
  const [pickingTarget, setPickingTarget] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeScope, setRemoveScope] = useState<"project" | "all">("project");

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
    async (id: string, target: InstallTarget) => {
      setBusyAction(true);
      setError("");
      setNotice("");
      try {
        // force is deliberately not offered: without it the CLI refuses to
        // overwrite a folder it did not write, which is what protects a
        // hand-authored skill of the same name.
        await CLI.SkillsInstall(id, "claude", target !== null, false, target?.dir ?? "");
        setNotice(`Installed ${id} into ${targetLabel(target)}`);
        setPickingTarget(false);
        await refreshInstalled();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusyAction(false);
      }
    },
    [refreshInstalled],
  );

  // Every install of the selected skill, which is what decides removal: the CLI
  // deletes by scope, never by location.
  const selectedInstalls = useMemo(
    () => installed.filter((s) => s.skillId === selected),
    [installed, selected],
  );
  const projectInstalls = selectedInstalls.filter((s) => s.project);
  const hasUserInstall = selectedInstalls.some((s) => !s.project);
  // Sparing the user-scope copy is only a distinct outcome when there is one to
  // spare and something else to remove.
  const scopeChoice = projectInstalls.length > 0 && hasUserInstall;
  const doomed = scopeChoice && removeScope === "project" ? projectInstalls : selectedInstalls;

  const uninstall = useCallback(async () => {
    if (!selected) return;
    setBusyAction(true);
    setError("");
    setNotice("");
    try {
      // project=true spares the user-scope copy and removes every project one;
      // false removes the lot. There is no third option — the CLI cannot delete
      // a single location, which is why the dialog lists what actually goes.
      const projectOnly = scopeChoice ? removeScope === "project" : !hasUserInstall;
      await CLI.SkillsUninstall(selected, "claude", projectOnly);
      setNotice(`Removed ${doomed.length} install${doomed.length === 1 ? "" : "s"} of ${selected}`);
      setConfirmRemove(false);
      await refreshInstalled();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyAction(false);
    }
  }, [selected, scopeChoice, removeScope, hasUserInstall, doomed.length, refreshInstalled]);

  // One row per skill, not per install: the same skill installed into three
  // landing zones is still one thing to read and one thing to remove, and
  // repeating it would give the list duplicate keys.
  const installedRows: SkillRow[] = useMemo(() => {
    const byId = new Map<string, InstalledSkill[]>();
    for (const s of installed) {
      byId.set(s.skillId, [...(byId.get(s.skillId) ?? []), s]);
    }
    return [...byId.entries()].map(([id, entries]) => ({
      id,
      displayName: id,
      description: entries.map(installLocation).join(" · "),
      loadCount: "",
    }));
  }, [installed]);

  const listed: SkillRow[] = tab === "catalog" ? rows : installedRows;

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
                {installedIds.has(selected) && (
                  <Button
                    variant="secondary"
                    disabled={busyAction}
                    onClick={() => {
                      setRemoveScope("project");
                      setConfirmRemove(true);
                    }}
                    className="text-[10px]"
                  >
                    Uninstall
                  </Button>
                )}
                <Button
                  variant="primary"
                  disabled={busyAction}
                  onClick={() => setPickingTarget(true)}
                  className="text-[10px]"
                  title="Choose a landing zone, product, or your user scope"
                >
                  {installedIds.has(selected) ? "Install elsewhere" : "Install…"}
                </Button>
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

        {pickingTarget && selected && (
          <InstallTargetPanel
            skillId={selected}
            busy={busyAction}
            onInstall={(target) => void install(selected, target)}
            onClose={() => setPickingTarget(false)}
          />
        )}
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove ${selected ?? ""}?`}
        confirmLabel={`Remove ${doomed.length} install${doomed.length === 1 ? "" : "s"}`}
        loading={busyAction}
        loadingLabel="Removing…"
        onConfirm={() => void uninstall()}
        description={
          <div className="flex flex-col gap-[10px]">
            {scopeChoice && (
              // The CLI removes by scope, not by location, so these two are the
              // only outcomes it can produce. Offering a per-location choice
              // here would be a promise the platform cannot keep.
              <div className="flex flex-col gap-[4px]">
                {(["project", "all"] as const).map((scope) => (
                  <button
                    key={scope}
                    onClick={() => setRemoveScope(scope)}
                    className={`text-left px-[10px] py-[6px] rounded-[4px] border transition-colors ${
                      removeScope === scope
                        ? "border-brand-fill bg-brand-fill/10"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    <span className="text-[11px] font-mono text-foreground">
                      {scope === "project"
                        ? `Project installs only (${projectInstalls.length})`
                        : `Everywhere (${selectedInstalls.length})`}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-[2px]">
              <span className="text-[10px] font-mono text-foreground/50">
                This deletes {doomed.length === 1 ? "the folder" : "these folders"}:
              </span>
              {doomed.map((s) => (
                <span key={s.path} className="text-[10px] font-mono text-foreground/70 break-all">
                  {s.path}
                </span>
              ))}
            </div>
          </div>
        }
      />
    </div>
  );
}
