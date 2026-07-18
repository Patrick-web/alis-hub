import { create } from "zustand";
import { Events } from "@wailsio/runtime";
import * as GitService from "../../../bindings/alis-hub-v3/gitservice";
import type {
  GitBranch,
  GitCommit,
  GitFileDiff,
  GitStatus,
  ForgejoPR,
} from "../components/git/types";
import { useLabs } from "./labs";
import { useSuggestions } from "./suggestions";
import { useLocalAI } from "./localai";
import { wireOnce } from "./lib/wireOnce";

const LOG_LIMIT = 200;

const PACKAGE_FILE_NAMES = [
  "go.mod",
  "go.sum",
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "requirements.txt",
  "pipfile",
  "pipfile.lock",
  "pyproject.toml",
  "pubspec.yaml",
  "pubspec.lock",
  "cargo.toml",
  "cargo.lock",
  "build.gradle",
  "build.gradle.kts",
  "pom.xml",
  "gemfile",
  "gemfile.lock",
  "composer.json",
  "composer.lock",
];

export interface GitSyncResult {
  kind: string;
  message: string;
  conflictFiles?: string[];
}

export interface RepoState {
  status: GitStatus;
  currentBranch: string;
  branches: GitBranch[];
  commits: GitCommit[];
  commitMessage: string;
  committing: boolean;
  generatingCommitMsg: boolean;
  pushing: boolean;
  pulling: boolean;
  ahead: number;
  behind: number;
  error: string;
  syncResult: GitSyncResult | null;
  lastSyncOp: "push" | "pull" | null;
  isMerging: boolean;
  showConflictEditor: boolean;
  conflictEditorInitialFile: string | null;
  discardPending: string[] | null;
  discarding: boolean;
  checkoutPending: string | null;
  checkingOut: boolean;
}

const EMPTY_STATUS: GitStatus = { staged: [], unstaged: [], untracked: [], conflicted: [] };

export const EMPTY_REPO: RepoState = {
  status: EMPTY_STATUS,
  currentBranch: "",
  branches: [],
  commits: [],
  commitMessage: "",
  committing: false,
  generatingCommitMsg: false,
  pushing: false,
  pulling: false,
  ahead: 0,
  behind: 0,
  error: "",
  syncResult: null,
  lastSyncOp: null,
  isMerging: false,
  showConflictEditor: false,
  conflictEditorInitialFile: null,
  discardPending: null,
  discarding: false,
  checkoutPending: null,
  checkingOut: false,
};

export type GitTab = "code" | "prs";
export type PrRepo = "build" | "define";

export interface SelectedCommitFile {
  repoPath: string;
  hash: string;
  path: string;
}

interface GitStoreState {
  repos: Record<string, RepoState>;
  activeTab: GitTab;
  buildPath: string;
  definePath: string;
  pathsKey: string; // `${org}/${product}` the loaded paths belong to
  pathsLoading: boolean;
  // Diff selection
  selectedRepoPath: string;
  selectedFile: string | null;
  selectedStaged: boolean;
  selectedCommitFile: SelectedCommitFile | null;
  diff: GitFileDiff | null;
  diffLoading: boolean;
  diffError: string;
  // Graph
  activeGraphRepoPath: string;
  graphSelectedHash: string | null;
  localOnly: boolean;
  undoPending: boolean;
  undoing: boolean;
  undoError: string;
  // Forgejo / PRs
  buildIsForgejo: boolean;
  defineIsForgejo: boolean;
  prRepo: PrRepo;
  prs: ForgejoPR[];
  loadingPRs: boolean;
  creatingPR: boolean;
  mergingPR: boolean;
  selectedPR: ForgejoPR | null;
  showCreatePR: boolean;
}

export const useGitStore = create<GitStoreState>(() => ({
  repos: {},
  activeTab: "code",
  buildPath: "",
  definePath: "",
  pathsKey: "",
  pathsLoading: true,
  selectedRepoPath: "",
  selectedFile: null,
  selectedStaged: false,
  selectedCommitFile: null,
  diff: null,
  diffLoading: false,
  diffError: "",
  activeGraphRepoPath: "",
  graphSelectedHash: null,
  localOnly: false,
  undoPending: false,
  undoing: false,
  undoError: "",
  buildIsForgejo: false,
  defineIsForgejo: false,
  prRepo: "build",
  prs: [],
  loadingPRs: false,
  creatingPR: false,
  mergingPR: false,
  selectedPR: null,
  showCreatePR: false,
}));

// ─── Internal helpers ───────────────────────────────────────────────────────

function repoOf(repoPath: string): RepoState {
  return useGitStore.getState().repos[repoPath] ?? EMPTY_REPO;
}

function patchRepo(repoPath: string, patch: Partial<RepoState>) {
  useGitStore.setState((s) => ({
    repos: { ...s.repos, [repoPath]: { ...(s.repos[repoPath] ?? EMPTY_REPO), ...patch } },
  }));
}

/** "Build" or "Define" — used to scope suggestion side effects. */
function labelOf(repoPath: string): string {
  return repoPath === useGitStore.getState().definePath ? "Define" : "Build";
}

const watched = new Set<string>();

function ensureWatched(repoPath: string) {
  if (watched.has(repoPath)) return;
  watched.add(repoPath);
  GitService.WatchRepo(repoPath);
}

// ─── Actions ────────────────────────────────────────────────────────────────

async function refreshRepo(repoPath: string): Promise<void> {
  if (!repoPath) return;
  patchRepo(repoPath, { error: "" });
  try {
    const [status, branch, branches, log, ab, merging] = await Promise.all([
      GitService.GetStatus(repoPath),
      GitService.GetCurrentBranch(repoPath),
      GitService.GetBranches(repoPath),
      GitService.GetLog(repoPath, LOG_LIMIT),
      GitService.GetAheadBehind(repoPath),
      GitService.IsMerging(repoPath),
    ]);
    patchRepo(repoPath, {
      ...(status ? { status } : {}),
      currentBranch: branch ?? "",
      branches: branches ?? [],
      commits: log ?? [],
      ...(ab ? { ahead: ab.ahead, behind: ab.behind } : {}),
      isMerging: !!merging,
    });
    if (merging) {
      const msg = await GitService.GetMergeMessage(repoPath);
      if (msg && !repoOf(repoPath).commitMessage) patchRepo(repoPath, { commitMessage: msg });
    }
  } catch (e) {
    patchRepo(repoPath, { error: String(e) });
  }
}

/** Ensures a repo entry exists, starts its fsnotify watcher, and refreshes.
 * Existing state is kept (stale-while-revalidate) so revisiting the page
 * renders instantly from the last known state. */
function initRepo(repoPath: string): void {
  if (!repoPath) return;
  useGitStore.setState((s) =>
    s.repos[repoPath] ? s : { repos: { ...s.repos, [repoPath]: EMPTY_REPO } },
  );
  ensureWatched(repoPath);
  void refreshRepo(repoPath);
}

function setCommitMessage(repoPath: string, message: string): void {
  patchRepo(repoPath, { commitMessage: message });
}

async function stage(repoPath: string, path: string): Promise<void> {
  try {
    await GitService.StageFile(repoPath, path);
    void refreshRepo(repoPath);
  } catch (e) {
    patchRepo(repoPath, { error: String(e) });
  }
}

async function unstage(repoPath: string, path: string): Promise<void> {
  try {
    await GitService.UnstageFile(repoPath, path);
    void refreshRepo(repoPath);
  } catch (e) {
    patchRepo(repoPath, { error: String(e) });
  }
}

async function stageMany(repoPath: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await GitService.StageFiles(repoPath, paths);
    void refreshRepo(repoPath);
  } catch (e) {
    patchRepo(repoPath, { error: String(e) });
  }
}

async function unstageMany(repoPath: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await GitService.UnstageFiles(repoPath, paths);
    void refreshRepo(repoPath);
  } catch (e) {
    patchRepo(repoPath, { error: String(e) });
  }
}

async function stageAll(repoPath: string): Promise<void> {
  await GitService.StageAll(repoPath);
  void refreshRepo(repoPath);
}

function requestDiscard(repoPath: string, paths: string[]): void {
  patchRepo(repoPath, { discardPending: paths });
}

function cancelDiscard(repoPath: string): void {
  patchRepo(repoPath, { discardPending: null });
}

async function confirmDiscard(repoPath: string): Promise<void> {
  const { discardPending, status } = repoOf(repoPath);
  if (!discardPending) return;
  patchRepo(repoPath, { discarding: true });
  try {
    const untrackedSet = new Set(status.untracked);
    const tracked = discardPending.filter((p) => !untrackedSet.has(p));
    const untracked = discardPending.filter((p) => untrackedSet.has(p));
    if (tracked.length > 0) await GitService.DiscardFiles(repoPath, tracked);
    if (untracked.length > 0) await GitService.DiscardUntracked(repoPath, untracked);
    void refreshRepo(repoPath);
  } catch (e) {
    patchRepo(repoPath, { error: String(e) });
  } finally {
    patchRepo(repoPath, { discarding: false, discardPending: null });
  }
}

async function commit(repoPath: string): Promise<void> {
  const { commitMessage } = repoOf(repoPath);
  if (!commitMessage.trim()) return;
  patchRepo(repoPath, { committing: true });
  try {
    await GitService.Commit(repoPath, commitMessage.trim());
    patchRepo(repoPath, { commitMessage: "" });
    void refreshRepo(repoPath);
  } catch (e) {
    patchRepo(repoPath, { error: String(e) });
  } finally {
    patchRepo(repoPath, { committing: false });
  }
}

async function continueMerge(repoPath: string): Promise<void> {
  patchRepo(repoPath, { committing: true });
  try {
    await GitService.CompleteMerge(repoPath);
    patchRepo(repoPath, { commitMessage: "", isMerging: false });
    void refreshRepo(repoPath);
  } catch (e) {
    patchRepo(repoPath, { error: String(e) });
  } finally {
    patchRepo(repoPath, { committing: false });
  }
}

async function generateCommitMessage(repoPath: string): Promise<void> {
  if (!repoPath) return;
  patchRepo(repoPath, { generatingCommitMsg: true });
  try {
    const localAI = useLocalAI.getState();
    const msg = await localAI.generateCommitMessage(repoPath, localAI.state.model);
    if (msg) patchRepo(repoPath, { commitMessage: msg });
  } catch (e) {
    patchRepo(repoPath, { error: String(e) });
  } finally {
    patchRepo(repoPath, { generatingCommitMsg: false });
  }
}

async function push(repoPath: string): Promise<void> {
  const { commits, ahead } = repoOf(repoPath);
  patchRepo(repoPath, { pushing: true, lastSyncOp: "push", syncResult: null });
  const pushedCommits = commits.slice(0, ahead);
  const result = (await GitService.PushOrigin(repoPath)) as GitSyncResult | null;
  const { isSuggestionEnabled } = useLabs.getState();
  const { addSuggestion } = useSuggestions.getState();
  if (result && result.kind !== "ok" && result.kind !== "up_to_date") {
    patchRepo(repoPath, { syncResult: result });
  } else if (
    result?.kind === "ok" &&
    labelOf(repoPath) === "Define" &&
    isSuggestionEnabled("push-define-run-service") &&
    pushedCommits.length > 0
  ) {
    try {
      const fileResults = await Promise.all(
        pushedCommits.map((c) => GitService.GetCommitFiles(repoPath, c.hash)),
      );
      const protoFiles = fileResults
        .flat()
        .filter((f: any) => f.path.toLowerCase().endsWith(".proto") && f.statusCode !== "D");
      const services = new Map<string, string>();
      for (const f of protoFiles) {
        const parts = f.path.split("/");
        if (parts.length >= 4) services.set(parts[2], parts[3]);
      }
      for (const [neuron, version] of services) {
        addSuggestion({
          definitionId: `push-define-run-service:${neuron}`,
          category: "Define",
          title: `Run Define for ${neuron}?`,
          body: `Proto changes for ${neuron} (${version}) were pushed. Run Define to regenerate code.`,
          priority: "passive",
        });
      }
    } catch {
      // suggestion detection is best-effort
    }
  }
  patchRepo(repoPath, { pushing: false });
  void refreshRepo(repoPath);
}

async function pull(repoPath: string): Promise<void> {
  const { commits } = repoOf(repoPath);
  patchRepo(repoPath, { pulling: true, lastSyncOp: "pull", syncResult: null });
  const oldHead = commits[0]?.hash ?? null;
  const result = (await GitService.PullOrigin(repoPath)) as GitSyncResult | null;
  const { isSuggestionEnabled } = useLabs.getState();
  const { addSuggestion } = useSuggestions.getState();
  if (result?.kind === "pull_conflict") {
    patchRepo(repoPath, { syncResult: result, showConflictEditor: true });
  } else if (result && result.kind !== "ok" && result.kind !== "up_to_date") {
    patchRepo(repoPath, { syncResult: result });
  } else if (result?.kind === "ok" && oldHead) {
    try {
      const repoLabel = labelOf(repoPath);
      const newLog = await GitService.GetLog(repoPath, LOG_LIMIT);
      const newHead = newLog?.[0]?.hash ?? null;
      if (newHead && newHead !== oldHead) {
        if (repoLabel === "Define" && isSuggestionEnabled("git-pull-define-upgrade")) {
          addSuggestion({
            definitionId: "git-pull-define-upgrade",
            category: "Define",
            title: "New define changes pulled",
            body: "Run package install to pick up the latest generated code.",
            priority: "passive",
          });
        } else if (repoLabel === "Build" && isSuggestionEnabled("git-pull-build-upgrade")) {
          const oldHeadIdx = newLog?.findIndex((c) => c.hash === oldHead) ?? -1;
          const newCommits = newLog?.slice(0, oldHeadIdx === -1 ? undefined : oldHeadIdx) ?? [];
          if (newCommits.length > 0) {
            const fileResults = await Promise.all(
              newCommits.map((c) => GitService.GetCommitFiles(repoPath, c.hash)),
            );
            const allFiles = fileResults.flat().map((f: any) => f.path.toLowerCase());
            const hasPackageFiles = allFiles.some((p: string) =>
              PACKAGE_FILE_NAMES.some((name) => p === name || p.endsWith("/" + name)),
            );
            if (hasPackageFiles) {
              addSuggestion({
                definitionId: "git-pull-build-upgrade",
                category: "Build & Deploy",
                title: "Dependency files changed",
                body: "Package management files were updated in the pull. Run install to sync.",
                priority: "passive",
              });
            }
          }
        }
      }
      const localAI = useLocalAI.getState();
      if (
        localAI.state.enabled &&
        localAI.state.modelPulled &&
        isSuggestionEnabled("ai-contextual-insight")
      ) {
        const context = `A git pull just completed on the ${repoLabel} repo. New commits were pulled.`;
        localAI
          .generate(
            localAI.state.model,
            "You are a helpful development assistant. Given a development event, suggest one concise actionable next step in 1-2 sentences. Be specific and practical.",
            context,
          )
          .then((body) => {
            if (body)
              addSuggestion({
                definitionId: "ai-contextual-insight",
                category: "AI Insights",
                title: "AI suggestion",
                body,
                priority: "passive",
              });
          })
          .catch(() => {});
      }
    } catch {
      // suggestion detection is best-effort
    }
  }
  patchRepo(repoPath, { pulling: false });
  void refreshRepo(repoPath);
}

async function sync(repoPath: string): Promise<void> {
  const { behind, ahead } = repoOf(repoPath);
  if (behind > 0) await pull(repoPath);
  if (ahead > 0) await push(repoPath);
}

async function clearIndexLock(repoPath: string): Promise<void> {
  await GitService.ClearIndexLock(repoPath);
  const { lastSyncOp } = repoOf(repoPath);
  patchRepo(repoPath, { syncResult: null });
  if (lastSyncOp === "push") await push(repoPath);
  else if (lastSyncOp === "pull") await pull(repoPath);
  else void refreshRepo(repoPath);
}

async function checkout(repoPath: string, name: string): Promise<void> {
  const { status } = repoOf(repoPath);
  const dirty = status.staged.length + status.unstaged.length + status.untracked.length > 0;
  if (dirty) {
    patchRepo(repoPath, { checkoutPending: name });
    return;
  }
  patchRepo(repoPath, { syncResult: null, lastSyncOp: null });
  try {
    const result = (await GitService.CheckoutBranch(repoPath, name)) as GitSyncResult | null;
    if (result && result.kind !== "ok" && result.kind !== "up_to_date") {
      patchRepo(repoPath, { syncResult: result });
    }
    void refreshRepo(repoPath);
  } catch (e) {
    patchRepo(repoPath, { error: String(e) });
  }
}

function cancelCheckout(repoPath: string): void {
  patchRepo(repoPath, { checkoutPending: null });
}

async function confirmCheckout(repoPath: string): Promise<void> {
  const { checkoutPending } = repoOf(repoPath);
  if (!checkoutPending) return;
  patchRepo(repoPath, { checkingOut: true, syncResult: null, lastSyncOp: null });
  try {
    const result = (await GitService.CheckoutBranch(
      repoPath,
      checkoutPending,
    )) as GitSyncResult | null;
    if (result && result.kind !== "ok" && result.kind !== "up_to_date") {
      patchRepo(repoPath, { syncResult: result });
    }
    void refreshRepo(repoPath);
  } catch (e) {
    patchRepo(repoPath, { error: String(e) });
  } finally {
    patchRepo(repoPath, { checkingOut: false, checkoutPending: null });
  }
}

async function createBranch(repoPath: string, name: string): Promise<void> {
  await GitService.CreateBranch(repoPath, name);
  void refreshRepo(repoPath);
}

function dismissSyncResult(repoPath: string): void {
  patchRepo(repoPath, { syncResult: null });
}

function openConflictEditor(repoPath: string, initialFile?: string): void {
  patchRepo(repoPath, {
    showConflictEditor: true,
    conflictEditorInitialFile: initialFile ?? null,
  });
}

function closeConflictEditor(repoPath: string): void {
  patchRepo(repoPath, {
    showConflictEditor: false,
    conflictEditorInitialFile: null,
    syncResult: null,
  });
  void refreshRepo(repoPath);
}

// ── Page-level actions ──────────────────────────────────────────────────────

async function loadPaths(organisation: string, product: string): Promise<void> {
  if (!organisation || !product) {
    useGitStore.setState({ pathsLoading: false });
    return;
  }
  const key = `${organisation}/${product}`;
  const s = useGitStore.getState();
  if (s.pathsKey === key && (s.buildPath || s.definePath)) return;
  useGitStore.setState({ pathsLoading: true });
  try {
    const paths = await GitService.GetProductRepoPaths(organisation, product);
    if (paths) {
      useGitStore.setState({
        buildPath: paths.buildDir,
        definePath: paths.defineDir,
        pathsKey: key,
        // Reset cross-product page state
        selectedRepoPath: "",
        selectedFile: null,
        selectedStaged: false,
        selectedCommitFile: null,
        diff: null,
        diffError: "",
        activeGraphRepoPath: "",
        graphSelectedHash: null,
        undoError: "",
        buildIsForgejo: false,
        defineIsForgejo: false,
        prs: [],
        selectedPR: null,
        showCreatePR: false,
      });
      if (paths.buildDir) {
        GitService.IsForgejo(paths.buildDir)
          .then((r) => useGitStore.setState({ buildIsForgejo: r ?? false }))
          .catch(() => useGitStore.setState({ buildIsForgejo: false }));
      }
      if (paths.defineDir) {
        GitService.IsForgejo(paths.defineDir)
          .then((r) => useGitStore.setState({ defineIsForgejo: r ?? false }))
          .catch(() => useGitStore.setState({ defineIsForgejo: false }));
      }
    }
  } catch {
    // keep previous paths on failure
  } finally {
    useGitStore.setState({ pathsLoading: false });
  }
}

async function loadWorkingDiff(): Promise<void> {
  const { selectedFile, selectedStaged, selectedRepoPath } = useGitStore.getState();
  if (!selectedFile || !selectedRepoPath) return;
  useGitStore.setState({ diffLoading: true, diffError: "" });
  try {
    const d = await GitService.GetFileDiff(selectedRepoPath, selectedFile, selectedStaged);
    const now = useGitStore.getState();
    if (now.selectedFile === selectedFile && now.selectedRepoPath === selectedRepoPath) {
      useGitStore.setState({ diff: d, diffLoading: false });
    }
  } catch (e) {
    useGitStore.setState({ diff: null, diffError: String(e), diffLoading: false });
  }
}

async function loadCommitDiff(): Promise<void> {
  const { selectedCommitFile } = useGitStore.getState();
  if (!selectedCommitFile) return;
  useGitStore.setState({ diffLoading: true, diffError: "" });
  try {
    const d = await GitService.GetCommitFileDiff(
      selectedCommitFile.repoPath,
      selectedCommitFile.hash,
      selectedCommitFile.path,
    );
    if (useGitStore.getState().selectedCommitFile === selectedCommitFile) {
      useGitStore.setState({ diff: d, diffLoading: false });
    }
  } catch (e) {
    useGitStore.setState({ diff: null, diffError: String(e), diffLoading: false });
  }
}

function selectFile(repoPath: string, path: string, staged: boolean): void {
  useGitStore.setState({
    selectedRepoPath: repoPath,
    selectedFile: path,
    selectedStaged: staged,
    selectedCommitFile: null,
    activeGraphRepoPath: repoPath,
  });
  void loadWorkingDiff();
}

function selectCommitFile(repoPath: string, hash: string, path: string): void {
  useGitStore.setState({
    selectedCommitFile: { repoPath, hash, path },
    selectedFile: null,
    activeGraphRepoPath: repoPath,
  });
  void loadCommitDiff();
}

function selectGraphCommit(hash: string): void {
  const { selectedCommitFile } = useGitStore.getState();
  useGitStore.setState({
    graphSelectedHash: hash,
    selectedFile: null,
    ...(selectedCommitFile ? {} : { diff: null, diffError: "" }),
  });
}

function setActiveTab(tab: GitTab): void {
  useGitStore.setState({ activeTab: tab });
  if (tab === "prs") {
    useGitStore.setState({ prs: [], selectedPR: null, showCreatePR: false });
    void fetchPRs();
  }
}

function setPrRepo(prRepo: PrRepo): void {
  useGitStore.setState({ prRepo });
  if (useGitStore.getState().activeTab === "prs") {
    useGitStore.setState({ prs: [], selectedPR: null, showCreatePR: false });
    void fetchPRs();
  }
}

function prRepoPath(): string {
  const s = useGitStore.getState();
  return s.prRepo === "build" ? s.buildPath : s.definePath;
}

async function fetchPRs(path?: string): Promise<void> {
  const repoPath = path ?? prRepoPath();
  if (!repoPath) return;
  useGitStore.setState({ loadingPRs: true });
  try {
    const result = await GitService.ListPRs(repoPath, "open");
    useGitStore.setState({ prs: (result as unknown as ForgejoPR[]) ?? [] });
  } catch {
    // ignore
  } finally {
    useGitStore.setState({ loadingPRs: false });
  }
}

async function createPR(title: string, body: string, head: string, base: string): Promise<void> {
  const repoPath = prRepoPath();
  if (!repoPath) return;
  useGitStore.setState({ creatingPR: true });
  try {
    await GitService.CreatePR(repoPath, title, body, head, base);
    useGitStore.setState({ showCreatePR: false });
    await fetchPRs();
  } catch {
    // ignore
  } finally {
    useGitStore.setState({ creatingPR: false });
  }
}

async function mergePR(number: number, style: "merge" | "rebase" | "squash"): Promise<void> {
  const repoPath = prRepoPath();
  if (!repoPath) return;
  useGitStore.setState({ mergingPR: true });
  try {
    await GitService.MergePR(repoPath, number, style);
    useGitStore.setState({ selectedPR: null });
    await fetchPRs();
  } catch {
    // ignore
  } finally {
    useGitStore.setState({ mergingPR: false });
  }
}

async function confirmUndo(): Promise<void> {
  const { activeGraphRepoPath, buildPath } = useGitStore.getState();
  const repoPath = activeGraphRepoPath || buildPath;
  if (!repoPath) return;
  useGitStore.setState({ undoing: true, undoError: "" });
  try {
    const result = (await GitService.UndoLastCommit(repoPath)) as {
      kind: string;
      message?: string;
    } | null;
    if (result && result.kind !== "ok") {
      useGitStore.setState({ undoError: result.message || "Undo failed." });
    }
    await refreshRepo(repoPath);
  } catch (e) {
    useGitStore.setState({ undoError: String(e) });
  } finally {
    useGitStore.setState({ undoing: false, undoPending: false });
  }
}

export const gitActions = {
  initRepo,
  refreshRepo,
  setCommitMessage,
  stage,
  unstage,
  stageMany,
  unstageMany,
  stageAll,
  requestDiscard,
  cancelDiscard,
  confirmDiscard,
  commit,
  continueMerge,
  generateCommitMessage,
  push,
  pull,
  sync,
  clearIndexLock,
  checkout,
  cancelCheckout,
  confirmCheckout,
  createBranch,
  dismissSyncResult,
  openConflictEditor,
  closeConflictEditor,
  loadPaths,
  selectFile,
  selectCommitFile,
  selectGraphCommit,
  setActiveTab,
  setPrRepo,
  fetchPRs,
  createPR,
  mergePR,
  confirmUndo,
};

// ─── Module-level wiring ────────────────────────────────────────────────────

wireOnce("git:events", () => {
  // fsnotify → refresh the affected repo, even when the Git page is unmounted
  Events.On("git:changed", (ev: { data?: unknown }) => {
    const repoPath = ev?.data;
    if (typeof repoPath === "string" && useGitStore.getState().repos[repoPath]) {
      void refreshRepo(repoPath);
    }
  });

  // Refresh known repos when the window regains visibility
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const { buildPath, definePath, repos } = useGitStore.getState();
    for (const p of [buildPath, definePath]) {
      if (p && repos[p]) void refreshRepo(p);
    }
  });
});
