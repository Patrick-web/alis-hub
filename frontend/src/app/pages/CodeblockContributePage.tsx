import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { Icon } from "@iconify/react";
import { Button } from "../components/Button";
import { Loader } from "../components/Loader";
import * as ProductService from "../../../bindings/alis-hub-v3/productservice";
import type { CodeblockInstance, BlockCommit } from "../../../bindings/alis-hub-v3/models";
import { SearchableSelect } from "../components/ui/searchable-select";

type Step = "instance" | "edit" | "version";

import { PUBLISH_RELEASE_LEVELS } from "../lib/releaseLevels";

const STATE_LABEL: Record<number, string> = {
  1: "Pending",
  2: "Deploying",
  3: "Active",
  4: "Error",
};
const STATE_COLOR: Record<number, string> = {
  1: "text-yellow-400 bg-yellow-400/10",
  2: "text-blue-400 bg-blue-400/10",
  3: "text-green-400 bg-green-400/10",
  4: "text-red-400 bg-red-400/10",
};

const labelClass = "text-[10px] font-bold uppercase text-foreground/40 mb-[4px]";
const textareaClass =
  "bg-background border border-border rounded-[4px] p-[10px] text-foreground text-[12px] font-mono outline-none focus:border-brand-fill resize-none w-full transition-colors";

function relativeDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function CodeblockContributePage() {
  const navigate = useNavigate();
  const { id: blockId } = useParams<{ id: string }>();

  const [step, setStep] = useState<Step>("instance");

  // Step 1 state
  const [instances, setInstances] = useState<CodeblockInstance[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(true);
  const [selectedInstance, setSelectedInstance] = useState<CodeblockInstance | null>(null);
  const [openingWorktrees, setOpeningWorktrees] = useState(false);
  const [worktreePath, setWorktreePath] = useState("");

  // Step 3 state
  const [defineCommits, setDefineCommits] = useState<BlockCommit[]>([]);
  const [buildCommits, setBuildCommits] = useState<BlockCommit[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [selectedDefineCommit, setSelectedDefineCommit] = useState("");
  const [selectedBuildCommit, setSelectedBuildCommit] = useState("");
  const [releaseLevel, setReleaseLevel] = useState(3);
  const [releaseNotes, setReleaseNotes] = useState("");
  const [publishing, setPublishing] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!blockId) return;
    (ProductService.ListCodeblockInstances as (id: string) => Promise<CodeblockInstance[]>)(blockId)
      .then((list) => setInstances(list ?? []))
      .catch((e) => setError(String(e)))
      .finally(() => setInstancesLoading(false));
  }, [blockId]);

  async function handleOpenWorktrees() {
    if (!selectedInstance) return;
    setError(null);
    setOpeningWorktrees(true);
    try {
      const path = await (ProductService.OpenBlockWorktrees as (name: string) => Promise<string>)(
        selectedInstance.name,
      );
      setWorktreePath(path);
      setStep("edit");
    } catch (e) {
      setError(String(e));
    } finally {
      setOpeningWorktrees(false);
    }
  }

  async function handleOpenInFinder() {
    try {
      await (ProductService.OpenWorktreeInFinder as (path: string) => Promise<void>)(worktreePath);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleProceedToVersion() {
    if (!selectedInstance) return;
    setError(null);
    setCommitsLoading(true);
    setStep("version");
    try {
      const [define, build] = await Promise.all([
        (
          ProductService.GetBlockCommits as (
            inst: string,
            type: string,
            limit: number,
          ) => Promise<BlockCommit[]>
        )(selectedInstance.name, "define", 50),
        (
          ProductService.GetBlockCommits as (
            inst: string,
            type: string,
            limit: number,
          ) => Promise<BlockCommit[]>
        )(selectedInstance.name, "build", 50),
      ]);
      setDefineCommits(define ?? []);
      setBuildCommits(build ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setCommitsLoading(false);
    }
  }

  async function handlePublish() {
    if (!selectedInstance || !selectedDefineCommit || !selectedBuildCommit) return;
    setError(null);
    setPublishing(true);
    try {
      await (
        ProductService.ContributeBlockFromCommits as (
          instanceName: string,
          defineCommitSha: string,
          buildCommitSha: string,
          releaseLevel: number,
          releaseNotes: string,
        ) => Promise<string>
      )(
        selectedInstance.name,
        selectedDefineCommit,
        selectedBuildCommit,
        releaseLevel,
        releaseNotes,
      );
      navigate(`/codeblocks/${blockId}/versions`);
    } catch (e) {
      setError(String(e));
    } finally {
      setPublishing(false);
    }
  }

  const canPublish = !!selectedDefineCommit && !!selectedBuildCommit && !publishing;

  return (
    <div className="flex-1 overflow-hidden flex flex-row bg-background">
      {/* Sidebar */}
      <div className="w-[260px] shrink-0 flex flex-col border-r border-border">
        <button
          onClick={() => navigate(`/codeblocks/${blockId}/versions`)}
          className="flex items-center gap-[8px] px-[16px] py-[12px] text-[11px] text-foreground/50 hover:text-foreground/80 border-b border-border transition-colors"
        >
          <Icon icon="solar:arrow-left-linear" />
          Versions
        </button>

        <div className="flex-1 overflow-auto p-[16px] flex flex-col gap-[20px]">
          <div>
            <p className="text-[11px] font-bold text-foreground mb-[12px]">Contribute Version</p>
            <div className="flex flex-col gap-[8px]">
              <StepIndicator
                index={1}
                label="Pick Instance"
                active={step === "instance"}
                done={step === "edit" || step === "version"}
              />
              <StepIndicator
                index={2}
                label="Open Worktrees"
                active={step === "edit"}
                done={step === "version"}
              />
              <StepIndicator
                index={3}
                label="Publish Version"
                active={step === "version"}
                done={false}
              />
            </div>
          </div>

          {selectedInstance && (
            <div className="bg-card border border-border rounded-[4px] p-[12px]">
              <p className={labelClass}>Selected Instance</p>
              <p className="text-[12px] font-bold text-foreground font-mono">
                {selectedInstance.shortId}
              </p>
              <p className="text-[10px] text-foreground/40 font-mono mt-[2px] break-all">
                {selectedInstance.package}
              </p>
            </div>
          )}

          {worktreePath && (
            <div className="bg-card border border-border rounded-[4px] p-[12px]">
              <p className={labelClass}>Worktree Path</p>
              <p className="text-[10px] text-foreground/60 font-mono break-all">{worktreePath}</p>
            </div>
          )}
        </div>

        {step === "version" && (
          <div className="p-[10px] border-t border-border flex flex-col gap-[8px]">
            <div className="mb-[4px]">
              <p className={labelClass}>Release Level</p>
              <SearchableSelect
                value={String(releaseLevel)}
                options={PUBLISH_RELEASE_LEVELS.map((l) => ({ label: l.label, value: String(l.value) }))}
                onChange={(v) => setReleaseLevel(Number(v))}
                className="w-full"
              />
            </div>
            <div className="mb-[8px]">
              <p className={labelClass}>Release Notes</p>
              <textarea
                className={`${textareaClass} h-[80px]`}
                placeholder="Describe what changed in this version"
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
              />
            </div>
            {error && (
              <div className="text-[11px] text-destructive bg-[rgba(255,107,107,0.08)] border border-[rgba(255,107,107,0.2)] rounded-[4px] p-[10px]">
                {error}
              </div>
            )}
            <Button
              variant="primary"
              className="w-full"
              icon={
                <Icon
                  icon={publishing ? "solar:spinner-linear" : "solar:upload-linear"}
                  className={publishing ? "animate-spin" : ""}
                />
              }
              onClick={handlePublish}
              disabled={!canPublish}
            >
              {publishing ? "Publishing…" : "Publish Version"}
            </Button>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {step === "instance" && (
          <InstancePickerStep
            instances={instances}
            loading={instancesLoading}
            selected={selectedInstance}
            onSelect={setSelectedInstance}
            onOpen={handleOpenWorktrees}
            opening={openingWorktrees}
            error={step === "instance" ? error : null}
          />
        )}
        {step === "edit" && (
          <EditStep
            worktreePath={worktreePath}
            onOpenFinder={handleOpenInFinder}
            onProceed={handleProceedToVersion}
            error={step === "edit" ? error : null}
          />
        )}
        {step === "version" && (
          <CommitPickerStep
            defineCommits={defineCommits}
            buildCommits={buildCommits}
            loading={commitsLoading}
            selectedDefine={selectedDefineCommit}
            selectedBuild={selectedBuildCommit}
            onSelectDefine={setSelectedDefineCommit}
            onSelectBuild={setSelectedBuildCommit}
            error={step === "version" ? error : null}
          />
        )}
      </div>
    </div>
  );
}

// ── Step Indicator ─────────────────────────────────────────────────────────────

function StepIndicator({
  index,
  label,
  active,
  done,
}: {
  index: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-[10px] ${active ? "opacity-100" : done ? "opacity-60" : "opacity-30"}`}
    >
      <div
        className={`w-[20px] h-[20px] rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
          done
            ? "bg-brand-fill/20 text-brand"
            : active
              ? "bg-brand-fill text-brand-foreground"
              : "bg-foreground/10 text-brand-foreground/40"
        }`}
      >
        {done ? <Icon icon="solar:check-circle-bold" className="text-xs" /> : index}
      </div>
      <span
        className={`text-[11px] ${active ? "text-foreground font-bold" : "text-foreground/60"}`}
      >
        {label}
      </span>
    </div>
  );
}

// ── Step 1: Instance Picker ────────────────────────────────────────────────────

function InstancePickerStep({
  instances,
  loading,
  selected,
  onSelect,
  onOpen,
  opening,
  error,
}: {
  instances: CodeblockInstance[];
  loading: boolean;
  selected: CodeblockInstance | null;
  onSelect: (inst: CodeblockInstance) => void;
  onOpen: () => void;
  opening: boolean;
  error: string | null;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-[24px] py-[16px] border-b border-border flex items-center justify-between">
        <div>
          <p className="text-[13px] font-bold text-foreground">Pick an Instance</p>
          <p className="text-[11px] text-foreground/40 mt-[2px]">
            Select the instance whose branch you want to contribute to
          </p>
        </div>
        <Button
          variant="primary"
          icon={
            <Icon
              icon={opening ? "solar:spinner-linear" : "solar:code-square-linear"}
              className={opening ? "animate-spin" : ""}
            />
          }
          onClick={onOpen}
          disabled={!selected || opening}
        >
          {opening ? "Opening…" : "Open Worktrees"}
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-[24px]">
        {loading ? (
          <div className="flex items-center justify-center h-[120px]">
            <Loader />
          </div>
        ) : instances.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[120px] gap-[8px] text-foreground/30">
            <Icon icon="solar:box-linear" className="text-[32px]" />
            <p className="text-[12px]">No instances found for this block</p>
          </div>
        ) : (
          <div className="flex flex-col gap-[8px]">
            {instances.map((inst) => {
              const isSelected = selected?.name === inst.name;
              return (
                <button
                  key={inst.name}
                  onClick={() => onSelect(inst)}
                  className={`w-full text-left bg-card border rounded-[4px] p-[16px] transition-colors ${
                    isSelected
                      ? "border-brand-fill bg-brand-fill/6"
                      : "border-border hover:border-border"
                  }`}
                >
                  <div className="flex items-center justify-between mb-[8px]">
                    <div className="flex items-center gap-[10px]">
                      <span className="font-mono font-bold text-[13px] text-foreground">
                        {inst.shortId}
                      </span>
                      {inst.state > 0 && (
                        <span
                          className={`text-[9px] font-bold uppercase rounded px-[6px] py-[2px] ${STATE_COLOR[inst.state] ?? "text-foreground/50 bg-foreground/5"}`}
                        >
                          {STATE_LABEL[inst.state] ?? "Unknown"}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <Icon icon="solar:check-circle-bold" className="text-brand text-base" />
                    )}
                  </div>
                  <p className="text-[11px] text-foreground/50 font-mono">{inst.package}</p>
                  {inst.blockVersion && (
                    <p className="text-[10px] text-foreground/30 mt-[6px] font-mono">
                      {inst.blockVersion.split("/").pop()}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <div className="mt-[16px] text-[11px] text-destructive bg-[rgba(255,107,107,0.08)] border border-[rgba(255,107,107,0.2)] rounded-[4px] p-[12px]">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 2: Edit & Push ────────────────────────────────────────────────────────

function EditStep({
  worktreePath,
  onOpenFinder,
  onProceed,
  error,
}: {
  worktreePath: string;
  onOpenFinder: () => void;
  onProceed: () => void;
  error: string | null;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-[24px] py-[16px] border-b border-border">
        <p className="text-[13px] font-bold text-foreground">Edit & Push</p>
        <p className="text-[11px] text-foreground/40 mt-[2px]">
          Make your changes in the worktree, commit, and push
        </p>
      </div>

      <div className="flex-1 overflow-auto p-[24px] flex flex-col gap-[24px]">
        <div className="bg-card border border-border rounded-[4px] p-[16px]">
          <p className="text-[10px] font-bold uppercase text-foreground/40 mb-[8px]">
            Worktree Location
          </p>
          <div className="flex items-start gap-[12px]">
            <code className="flex-1 text-[11px] text-foreground/80 font-mono break-all leading-[1.6]">
              {worktreePath}
            </code>
            <button
              onClick={onOpenFinder}
              className="shrink-0 flex items-center gap-[6px] text-[11px] text-foreground/50 hover:text-foreground/80 border border-border hover:border-border rounded px-[10px] py-[6px] transition-colors"
            >
              <Icon icon="solar:folder-open-linear" className="text-sm" />
              Open in Finder
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-[12px]">
          <p className="text-[11px] font-bold text-foreground">How to contribute</p>
          <div className="flex flex-col gap-[8px]">
            {[
              {
                n: 1,
                icon: "solar:folder-open-linear",
                text: "Open the worktree folder in Finder or your editor",
              },
              {
                n: 2,
                icon: "solar:pen-linear",
                text: "Edit files inside the build/ and define/ sub-folders",
              },
              {
                n: 3,
                icon: "solar:code-linear",
                text: "Commit your changes with git and push to origin",
              },
              {
                n: 4,
                icon: "solar:arrow-right-linear",
                text: 'Return here and click "Choose Commits" to select what to publish',
              },
            ].map(({ n, icon, text }) => (
              <div key={n} className="flex items-center gap-[12px] text-[12px] text-foreground/60">
                <div className="w-[22px] h-[22px] rounded-full bg-foreground/5 flex items-center justify-center text-[10px] font-bold text-foreground/30 shrink-0">
                  {n}
                </div>
                <Icon icon={icon} className="text-foreground/30 text-base shrink-0" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="text-[11px] text-destructive bg-[rgba(255,107,107,0.08)] border border-[rgba(255,107,107,0.2)] rounded-[4px] p-[12px]">
            {error}
          </div>
        )}

        <Button
          variant="primary"
          icon={<Icon icon="solar:alt-arrow-right-linear" />}
          onClick={onProceed}
          className="self-start"
        >
          Choose Commits
        </Button>
      </div>
    </div>
  );
}

// ── Step 3: Commit Picker ──────────────────────────────────────────────────────

function CommitPickerStep({
  defineCommits,
  buildCommits,
  loading,
  selectedDefine,
  selectedBuild,
  onSelectDefine,
  onSelectBuild,
  error,
}: {
  defineCommits: BlockCommit[];
  buildCommits: BlockCommit[];
  loading: boolean;
  selectedDefine: string;
  selectedBuild: string;
  onSelectDefine: (sha: string) => void;
  onSelectBuild: (sha: string) => void;
  error: string | null;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-[24px] py-[16px] border-b border-border">
        <p className="text-[13px] font-bold text-foreground">Choose Commits</p>
        <p className="text-[11px] text-foreground/40 mt-[2px]">
          Select the define and build commits to include in this version
        </p>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader />
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-row divide-x divide-border">
          <CommitList
            label="Define Repo"
            commits={defineCommits}
            selected={selectedDefine}
            onSelect={onSelectDefine}
          />
          <CommitList
            label="Build Repo"
            commits={buildCommits}
            selected={selectedBuild}
            onSelect={onSelectBuild}
          />
        </div>
      )}

      {error && (
        <div className="mx-[24px] mb-[16px] text-[11px] text-destructive bg-[rgba(255,107,107,0.08)] border border-[rgba(255,107,107,0.2)] rounded-[4px] p-[12px]">
          {error}
        </div>
      )}
    </div>
  );
}

function CommitList({
  label,
  commits,
  selected,
  onSelect,
}: {
  label: string;
  commits: BlockCommit[];
  selected: string;
  onSelect: (sha: string) => void;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-[16px] py-[10px] border-b border-border flex items-center justify-between shrink-0">
        <p className="text-[10px] font-bold uppercase text-foreground/40">{label}</p>
        {selected && (
          <span className="text-[10px] text-brand font-mono">
            {commits.find((c) => c.fullHash === selected)?.hash ?? selected.slice(0, 8)}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {commits.length === 0 ? (
          <div className="flex items-center justify-center h-[80px] text-[11px] text-foreground/30">
            No commits found on this branch
          </div>
        ) : (
          commits.map((commit) => {
            const isSelected = selected === commit.fullHash;
            return (
              <button
                key={commit.fullHash}
                onClick={() => onSelect(commit.fullHash)}
                className={`w-full text-left px-[16px] py-[10px] border-b border-border transition-colors hover:bg-foreground/[3%] ${
                  isSelected ? "bg-brand-fill/7 border-l-2 border-l-brand-fill" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-[8px]">
                  <code className="text-[11px] text-brand font-mono shrink-0">{commit.hash}</code>
                  <span className="text-[10px] text-foreground/30 shrink-0">
                    {relativeDate(commit.date)}
                  </span>
                </div>
                <p className="text-[11px] text-foreground/80 mt-[2px] truncate">{commit.message}</p>
                <p className="text-[10px] text-foreground/40 mt-[1px]">{commit.author}</p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
