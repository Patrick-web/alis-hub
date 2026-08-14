import { create } from "zustand";
import { Events } from "@wailsio/runtime";
import * as GitService from "../../../bindings/alis-hub-v3/gitservice";
import * as PRService from "../../../bindings/alis-hub-v3/prservice";
import type {
  GitBranch,
  GitCommit,
  GitFileDiff,
  GitStatus,
  ForgejoPR,
  PRRepoInfo,
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
  //
  // Keyed on organisation and product rather than on a repo path: the remote and
  // the token both come from the alis CLI now, so none of this needs a clone.
  prOrg: string;
  prProduct: string;
  prRepo: PrRepo;
  // null while unknown. Re-probed on every visit rather than latched, so a repo
  // that was not ready a moment ago is not written off for the session.
  prsAvailable: boolean | null;
  prRepoInfo: PRRepoInfo | null;
  prUser: string;
  prs: ForgejoPR[];
  prTotal: number;
  prTruncated: boolean;
  // Filters apply to the loaded list rather than the query: every page is already
  // fetched, so narrowing is instant and needs no round trip. "" means no filter.
  prAuthorFilter: string;
  prAssigneeFilter: string;
  loadingPRs: boolean;
  prError: GitSyncResult | null;
  creatingPR: boolean;
  createPRError: string;
  mergingPR: boolean;
  settingReady: boolean;
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
  prOrg: "",
  prProduct: "",
  prRepo: "build",
  prsAvailable: null,
  prRepoInfo: null,
  prUser: "",
  prs: [],
  prTotal: 0,
  prTruncated: false,
  prAuthorFilter: "",
  prAssigneeFilter: "",
  loadingPRs: false,
  prError: null,
  creatingPR: false,
  createPRError: "",
  mergingPR: false,
  settingReady: false,
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

function ensureWatched(repoPath: string) {
  wireOnce(`git:watch:${repoPath}`, () => GitService.WatchRepo(repoPath));
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
        // PR state belongs to the product, so it resets with it. Availability
        // goes back to unknown rather than false: the tab re-probes when opened.
        prOrg: organisation,
        prProduct: product,
        prsAvailable: null,
        prRepoInfo: null,
        prUser: "",
        prs: [],
        prTotal: 0,
        prTruncated: false,
        prAuthorFilter: "",
        prAssigneeFilter: "",
        prError: null,
        createPRError: "",
        selectedPR: null,
        showCreatePR: false,
      });
      // Drop the cached remote so a re-pointed repo is not served from cache.
      void PRService.InvalidateProduct(organisation, product).catch(() => {});
      if (useGitStore.getState().activeTab === "prs") void openPRTab();
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
  if (tab === "prs") void openPRTab();
}

function setPrRepo(prRepo: PrRepo): void {
  useGitStore.setState({ prRepo });
  if (useGitStore.getState().activeTab === "prs") void openPRTab();
}

/**
 * Turns a rejected PR call into the shape GitOperationBanner renders, so the PR
 * tab gets the same retry and sign-in affordances as push and pull instead of
 * failing silently. The backend formats API failures as "forgejo <status>: …",
 * which is what the status match reads.
 */
function toPRBanner(e: unknown): GitSyncResult {
  const message = String((e as Error)?.message ?? e ?? "").replace(/^Error:\s*/, "");
  const status = Number(/forgejo (\d{3}):/.exec(message)?.[1] ?? 0);
  // Either side can mean "sign in again": Forgejo rejects a dead token with 401,
  // and the CLI refuses to mint one when the alis session itself has gone.
  if (status === 401 || status === 403 || /not authenticated|alis login/i.test(message)) {
    return { kind: "auth_error", message };
  }
  if (
    status === 0 &&
    /timeout|deadline|connection refused|network|EOF|no such host/i.test(message)
  ) {
    return { kind: "network_error", message };
  }
  return { kind: "other_error", message };
}

/** prTarget is the (org, product, repo) triple the PR calls are keyed on. */
function prTarget(): { org: string; product: string; repo: PrRepo } | null {
  const { prOrg, prProduct, prRepo } = useGitStore.getState();
  if (!prOrg || !prProduct) return null;
  return { org: prOrg, product: prProduct, repo: prRepo };
}

/**
 * Loads everything the PR tab needs: whether the repo has pull requests at all,
 * its merge settings and default branch, the signed-in identity, and the list.
 */
async function openPRTab(): Promise<void> {
  useGitStore.setState({
    prs: [],
    prTotal: 0,
    prTruncated: false,
    selectedPR: null,
    showCreatePR: false,
    prError: null,
    createPRError: "",
  });

  const t = prTarget();
  if (!t) return;

  useGitStore.setState({ loadingPRs: true });
  try {
    const available = await PRService.PRsAvailable(t.org, t.product, t.repo);
    useGitStore.setState({ prsAvailable: available ?? false });
    if (!available) return;
  } catch (e) {
    useGitStore.setState({ prsAvailable: false, prError: toPRBanner(e) });
    return;
  } finally {
    useGitStore.setState({ loadingPRs: false });
  }

  // Repo settings and identity are only needed to render, so a failure here
  // must not take the list down with it.
  void PRService.RepoInfo(t.org, t.product, t.repo)
    .then((info) => useGitStore.setState({ prRepoInfo: info ?? null }))
    .catch(() => {});
  void PRService.CurrentUser(t.org, t.product, t.repo)
    .then((user) => useGitStore.setState({ prUser: user?.login ?? "" }))
    .catch(() => {});

  await fetchPRs();
}

async function fetchPRs(): Promise<void> {
  const t = prTarget();
  if (!t) return;
  useGitStore.setState({ loadingPRs: true, prError: null });
  try {
    const result = await PRService.ListPRs(t.org, t.product, t.repo, "open");
    useGitStore.setState({
      prs: result?.prs ?? [],
      prTotal: result?.total ?? 0,
      prTruncated: result?.truncated ?? false,
    });
  } catch (e) {
    useGitStore.setState({ prs: [], prError: toPRBanner(e) });
  } finally {
    useGitStore.setState({ loadingPRs: false });
  }
}

/**
 * Selects a PR and refetches it. The list's view of mergeability and counts is
 * a snapshot from whenever the list was loaded, so acting on it (the merge
 * button in particular) means acting on possibly stale state.
 */
function selectPR(pr: ForgejoPR): void {
  useGitStore.setState({ selectedPR: pr, showCreatePR: false, prError: null });
  const t = prTarget();
  if (!t) return;
  void PRService.GetPR(t.org, t.product, t.repo, pr.number)
    .then((fresh) => {
      if (!fresh) return;
      const current = useGitStore.getState().selectedPR;
      if (current?.number !== pr.number) return; // selection moved on
      useGitStore.setState({ selectedPR: fresh });
    })
    .catch(() => {
      // Keep the list's version: it is stale, not wrong, and the detail view is
      // still usable.
    });
}

/**
 * Refetches the currently selected PR, for the detail view's refresh button.
 * Unlike selectPR this does not touch selection: it only replaces the snapshot
 * the detail renders, so a stale mergeability verdict or count is corrected in
 * place.
 */
function refreshPR(): void {
  const t = prTarget();
  if (!t) return;
  const pr = useGitStore.getState().selectedPR;
  if (!pr) return;
  void PRService.GetPR(t.org, t.product, t.repo, pr.number)
    .then((fresh) => {
      if (!fresh) return;
      const current = useGitStore.getState().selectedPR;
      if (current?.number !== pr.number) return; // selection moved on
      useGitStore.setState({ selectedPR: fresh });
    })
    .catch(() => {
      // Leave the current snapshot: it is stale, not wrong.
    });
}

async function createPR(title: string, body: string, head: string, base: string): Promise<void> {
  const t = prTarget();
  if (!t) return;
  useGitStore.setState({ creatingPR: true, createPRError: "" });
  try {
    const created = await PRService.CreatePR(t.org, t.product, t.repo, title, body, head, base);
    useGitStore.setState({ showCreatePR: false });
    await fetchPRs();
    // Land on the new PR rather than making the user find it in the list.
    if (created) selectPR(created);
  } catch (e) {
    useGitStore.setState({ createPRError: toPRBanner(e).message });
  } finally {
    useGitStore.setState({ creatingPR: false });
  }
}

async function mergePR(
  number: number,
  style: "merge" | "rebase" | "squash",
  deleteBranch = false,
): Promise<void> {
  const t = prTarget();
  if (!t) return;
  useGitStore.setState({ mergingPR: true, prError: null });
  try {
    await PRService.MergePR(t.org, t.product, t.repo, number, style, deleteBranch);
    useGitStore.setState({ selectedPR: null });
    await fetchPRs();
    // The merge changed the remote, so local ahead/behind and the branch list
    // are now stale for whichever repo this was.
    const repoPath = useGitStore.getState()[t.repo === "build" ? "buildPath" : "definePath"];
    if (repoPath && useGitStore.getState().repos[repoPath]) void refreshRepo(repoPath);
  } catch (e) {
    useGitStore.setState({ prError: toPRBanner(e) });
    // Refetch so the footer reflects why it failed rather than what the list
    // believed before the attempt.
    void PRService.GetPR(t.org, t.product, t.repo, number)
      .then((fresh) => fresh && useGitStore.setState({ selectedPR: fresh }))
      .catch(() => {});
  } finally {
    useGitStore.setState({ mergingPR: false });
  }
}

/** Takes a draft out of draft by stripping its WIP title marker. */
async function setPRReady(number: number): Promise<void> {
  const t = prTarget();
  if (!t) return;
  useGitStore.setState({ settingReady: true, prError: null });
  try {
    const updated = await PRService.SetPRReady(t.org, t.product, t.repo, number);
    if (updated) useGitStore.setState({ selectedPR: updated });
    await fetchPRs();
  } catch (e) {
    useGitStore.setState({ prError: toPRBanner(e) });
  } finally {
    useGitStore.setState({ settingReady: false });
  }
}

function dismissPRError(): void {
  useGitStore.setState({ prError: null });
}

/** Narrows the list to one author. "" clears the filter. */
function setPRAuthorFilter(prAuthorFilter: string): void {
  useGitStore.setState({ prAuthorFilter });
}

/** Narrows the list to one assignee, or to unassigned via UNASSIGNED. */
function setPRAssigneeFilter(prAssigneeFilter: string): void {
  useGitStore.setState({ prAssigneeFilter });
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
  openPRTab,
  fetchPRs,
  selectPR,
  refreshPR,
  createPR,
  mergePR,
  setPRReady,
  dismissPRError,
  setPRAuthorFilter,
  setPRAssigneeFilter,
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
