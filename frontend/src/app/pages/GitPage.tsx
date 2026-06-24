import { useCallback, useEffect, useState } from 'react';
import { GitPullRequest, Loader2, RefreshCw, X } from 'lucide-react';
import { GitBranchBar } from '../components/git/GitBranchBar';
import { GitDiffViewer } from '../components/git/GitDiffViewer';
import { GitFileList } from '../components/git/GitFileList';
import { GitGraph } from '../components/git/GitGraph';
import { GitPRList } from '../components/git/GitPRList';
import { GitPRDetail } from '../components/git/GitPRDetail';
import { GitSyncLog } from '../components/git/GitSyncLog';
import { GitBranch, GitCommit, GitFileDiff, GitStatus, ForgejoPR } from '../components/git/types';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../components/ui/resizable';
import { useWorkspace } from '../stores/workspace';
import { useLabs } from '../stores/labs';
import { useSuggestions } from '../stores/suggestions';
import * as GitService from '../../../bindings/alis-hub-v3/gitservice';
import { Events } from '@wailsio/runtime';
import { Loader } from '../components/Loader';
import { ConfirmDialog } from '../components/ConfirmDialog';

const LOG_LIMIT = 200;

const PACKAGE_FILE_NAMES = [
  'go.mod', 'go.sum',
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'requirements.txt', 'pipfile', 'pipfile.lock', 'pyproject.toml',
  'pubspec.yaml', 'pubspec.lock',
  'cargo.toml', 'cargo.lock',
  'build.gradle', 'build.gradle.kts', 'pom.xml',
  'gemfile', 'gemfile.lock',
  'composer.json', 'composer.lock',
];

type ActiveRepo = 'build' | 'define';

export function GitPage() {
  const { state } = useWorkspace();
  const { isSuggestionEnabled } = useLabs();
  const { addSuggestion } = useSuggestions();

  const [buildPath, setBuildPath] = useState('');
  const [definePath, setDefinePath] = useState('');
  const [pathsLoading, setPathsLoading] = useState(true);
  const [activeRepo, setActiveRepo] = useState<ActiveRepo>('build');

  const repoPath = activeRepo === 'build' ? buildPath : definePath;

  const [gitStatus, setGitStatus] = useState<GitStatus>({ staged: [], unstaged: [], untracked: [] });
  const [currentBranch, setCurrentBranch] = useState('');
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);

  // Working-tree file selection
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedStaged, setSelectedStaged] = useState(false);

  // Commit file selection
  const [selectedCommitFile, setSelectedCommitFile] = useState<{ hash: string; path: string } | null>(null);

  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [diff, setDiff] = useState<GitFileDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState('');

  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState('');
  const [discardPending, setDiscardPending] = useState<string[] | null>(null);
  const [discarding, setDiscarding] = useState(false);

  // Forgejo PR state
  const [isForgejo, setIsForgejo] = useState(false);
  const [showPRPanel, setShowPRPanel] = useState(false);
  const [prs, setPRs] = useState<ForgejoPR[]>([]);
  const [loadingPRs, setLoadingPRs] = useState(false);
  const [creatingPR, setCreatingPR] = useState(false);
  const [mergingPR, setMergingPR] = useState(false);
  const [selectedPR, setSelectedPR] = useState<ForgejoPR | null>(null);

  // Fetch build/define paths from the backend whenever the product changes
  useEffect(() => {
    if (!state.organisation || !state.product) {
      setPathsLoading(false);
      return;
    }
    setPathsLoading(true);
    GitService.GetProductRepoPaths(state.organisation, state.product)
      .then(paths => {
        if (paths) {
          setBuildPath(paths.buildDir);
          setDefinePath(paths.defineDir);
        }
      })
      .catch(() => {})
      .finally(() => setPathsLoading(false));
  }, [state.organisation, state.product]);

  const refresh = useCallback(async () => {
    if (!repoPath) return;
    setError('');
    try {
      const [s, branch, b, log] = await Promise.all([
        GitService.GetStatus(repoPath),
        GitService.GetCurrentBranch(repoPath),
        GitService.GetBranches(repoPath),
        GitService.GetLog(repoPath, LOG_LIMIT),
      ]);
      if (s) setGitStatus(s);
      setCurrentBranch(branch ?? '');
      setBranches(b ?? []);
      setCommits(log ?? []);
    } catch (e: any) {
      setError(String(e));
    }
  }, [repoPath]);

  // Reload git data when the active repo path changes
  useEffect(() => {
    if (repoPath) {
      setGitStatus({ staged: [], unstaged: [], untracked: [] });
      setCurrentBranch('');
      setBranches([]);
      setCommits([]);
      setSelectedFile(null);
      setSelectedCommitFile(null);
      setSelectedCommit(null);
      setDiff(null);
      setDiffError('');
      setCommitMessage('');
      setShowPRPanel(false);
      setIsForgejo(false);
      setPRs([]);
      setSelectedPR(null);
      refresh();
    }
  }, [repoPath]);

  // Check if the active repo is Forgejo-hosted
  useEffect(() => {
    if (!repoPath) return;
    GitService.IsForgejo(repoPath)
      .then(result => setIsForgejo(result ?? false))
      .catch(() => setIsForgejo(false));
  }, [repoPath]);

  // Load PRs when the PR panel is opened
  useEffect(() => {
    if (showPRPanel && repoPath) fetchPRs();
  }, [showPRPanel, repoPath]);

  // Start fsnotify watcher and refresh on backend-pushed change events
  useEffect(() => {
    if (!repoPath) return;
    GitService.WatchRepo(repoPath);
    const off = Events.On('git:changed', (ev: any) => {
      if (ev.data === repoPath) refresh();
    });
    return () => off();
  }, [repoPath, refresh]);

  // Refresh when the app window regains focus
  useEffect(() => {
    const handle = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, [refresh]);

  // Load working-tree diff when a file is selected
  useEffect(() => {
    if (!selectedFile || !repoPath) {
      if (!selectedCommitFile) setDiff(null);
      return;
    }
    setDiffLoading(true);
    setDiffError('');
    GitService.GetFileDiff(repoPath, selectedFile, selectedStaged)
      .then(d => { setDiff(d); })
      .catch(e => { setDiff(null); setDiffError(String(e)); })
      .finally(() => setDiffLoading(false));
  }, [selectedFile, selectedStaged, repoPath]);

  // Load commit file diff when a commit file is selected
  useEffect(() => {
    if (!selectedCommitFile || !repoPath) return;
    setDiffLoading(true);
    setDiffError('');
    GitService.GetCommitFileDiff(repoPath, selectedCommitFile.hash, selectedCommitFile.path)
      .then(d => { setDiff(d); })
      .catch(e => { setDiff(null); setDiffError(String(e)); })
      .finally(() => setDiffLoading(false));
  }, [selectedCommitFile, repoPath]);

  function selectFile(path: string, staged: boolean) {
    setSelectedFile(path);
    setSelectedStaged(staged);
    setSelectedCommitFile(null);
  }

  function switchRepo(repo: ActiveRepo) {
    if (repo === activeRepo) return;
    setActiveRepo(repo);
    setSelectedFile(null);
    setSelectedCommitFile(null);
    setSelectedCommit(null);
    setDiff(null);
    setDiffError('');
    setCommitMessage('');
    setError('');
  }

  function handleSelectCommitFile(hash: string, path: string) {
    setSelectedCommitFile({ hash, path });
    setSelectedFile(null);
  }

  async function handleStage(path: string) {
    await GitService.StageFile(repoPath, path);
    refresh();
  }

  async function handleUnstage(path: string) {
    await GitService.UnstageFile(repoPath, path);
    refresh();
  }

  function handleDiscard(paths: string[]) {
    setDiscardPending(paths);
  }

  async function confirmDiscard() {
    if (!discardPending) return;
    setDiscarding(true);
    try {
      for (const path of discardPending) {
        await GitService.DiscardFile(repoPath, path);
      }
      refresh();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setDiscarding(false);
      setDiscardPending(null);
    }
  }

  async function handleStageAll() {
    await GitService.StageAll(repoPath);
    refresh();
  }

  async function handleCommit() {
    if (!commitMessage.trim()) return;
    setCommitting(true);
    try {
      await GitService.Commit(repoPath, commitMessage.trim());
      setCommitMessage('');
      refresh();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setCommitting(false);
    }
  }

  async function handlePush() {
    setPushing(true);
    try { await GitService.PushOrigin(repoPath); } catch (e: any) { setError(String(e)); }
    finally { setPushing(false); refresh(); }
  }

  async function handlePull() {
    setPulling(true);
    const oldHead = commits[0]?.hash ?? null;
    try {
      await GitService.PullOrigin(repoPath);
      if (oldHead) {
        try {
          const newLog = await GitService.GetLog(repoPath, LOG_LIMIT);
          const newHead = newLog?.[0]?.hash ?? null;
          if (newHead && newHead !== oldHead) {
            if (activeRepo === 'define' && isSuggestionEnabled('git-pull-define-upgrade')) {
              addSuggestion({
                definitionId: 'git-pull-define-upgrade',
                category: 'Define',
                title: 'New define changes pulled',
                body: 'Run package install to pick up the latest generated code.',
                priority: 'passive',
              });
            } else if (activeRepo === 'build' && isSuggestionEnabled('git-pull-build-upgrade')) {
              const oldHeadIdx = newLog?.findIndex(c => c.hash === oldHead) ?? -1;
              const newCommits = newLog?.slice(0, oldHeadIdx === -1 ? undefined : oldHeadIdx) ?? [];
              if (newCommits.length > 0) {
                const fileResults = await Promise.all(
                  newCommits.map(c => GitService.GetCommitFiles(repoPath, c.hash))
                );
                const allFiles = fileResults.flat().map((f: any) => f.path.toLowerCase());
                const hasPackageFiles = allFiles.some((p: string) =>
                  PACKAGE_FILE_NAMES.some(name => p === name || p.endsWith('/' + name))
                );
                if (hasPackageFiles) {
                  addSuggestion({
                    definitionId: 'git-pull-build-upgrade',
                    category: 'Build & Deploy',
                    title: 'Dependency files changed',
                    body: 'Package management files were updated in the pull. Run install to sync.',
                    priority: 'passive',
                  });
                }
              }
            }
          }
        } catch {
          // suggestion detection is best-effort
        }
      }
    } catch (e: any) {
      setError(String(e));
    } finally {
      setPulling(false);
      refresh();
    }
  }

  async function fetchPRs() {
    if (!repoPath) return;
    setLoadingPRs(true);
    try {
      const result = await GitService.ListPRs(repoPath, 'open');
      setPRs((result as any as ForgejoPR[]) ?? []);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoadingPRs(false);
    }
  }

  async function handleCreatePR(title: string, body: string, head: string, base: string) {
    setCreatingPR(true);
    try {
      await GitService.CreatePR(repoPath, title, body, head, base);
      await fetchPRs();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setCreatingPR(false);
    }
  }

  async function handleMergePR(number: number, style: 'merge' | 'rebase' | 'squash') {
    setMergingPR(true);
    try {
      await GitService.MergePR(repoPath, number, style);
      setSelectedPR(null);
      await fetchPRs();
      refresh();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setMergingPR(false);
    }
  }

  async function handleCheckout(name: string) {
    await GitService.CheckoutBranch(repoPath, name);
    refresh();
  }

  async function handleCreateBranch(name: string) {
    await GitService.CreateBranch(repoPath, name);
    refresh();
  }

  // No product selected
  if (!state.organisation || !state.product) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <p className="text-sm text-foreground/40">Select a product to view source control.</p>
      </div>
    );
  }

  // Paths loading
  if (pathsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <Loader />
      </div>
    );
  }

  // Derive the file path and staged flag to show in the diff viewer
  const diffFilePath = selectedCommitFile?.path ?? selectedFile;
  const diffStaged = selectedCommitFile ? false : selectedStaged;

  const discardDescription = discardPending
    ? discardPending.length === 1
      ? <>Discard changes to <span className="text-foreground font-semibold">{discardPending[0].split('/').pop()}</span>? This cannot be undone.</>
      : <>Discard changes to <span className="text-foreground font-semibold">{discardPending.length} files</span>? This cannot be undone.</>
    : '';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <ConfirmDialog
        open={discardPending !== null}
        onOpenChange={(o) => { if (!o && !discarding) setDiscardPending(null); }}
        title="Discard changes"
        description={discardDescription}
        confirmLabel="Discard"
        loadingLabel="Discarding…"
        loading={discarding}
        onConfirm={confirmDiscard}
      />
      {/* Repo selector bar */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-1.5 border-b border-foreground/10 bg-black/10">
        <button
          onClick={() => switchRepo('build')}
          className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
            activeRepo === 'build'
              ? 'bg-pink-600/30 text-pink-400 border border-pink-500/30'
              : 'text-foreground/40 hover:text-foreground/70 border border-transparent'
          }`}
        >
          Build
        </button>
        <button
          onClick={() => switchRepo('define')}
          className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
            activeRepo === 'define'
              ? 'bg-pink-600/30 text-pink-400 border border-pink-500/30'
              : 'text-foreground/40 hover:text-foreground/70 border border-transparent'
          }`}
        >
          Define
        </button>
        <span className="text-[11px] text-foreground/25 font-mono truncate flex-1 ml-2">{repoPath}</span>
      </div>

      {error && (
        <div className="shrink-0 px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400 truncate">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left: file list or PR list */}
          <ResizablePanel defaultSize={22} minSize={16} maxSize={40}>
            <div className="flex flex-col h-full overflow-hidden">
              {!showPRPanel && (
                <GitBranchBar
                  currentBranch={currentBranch}
                  branches={branches}
                  onCheckout={handleCheckout}
                  onCreateBranch={handleCreateBranch}
                  onPush={handlePush}
                  onPull={handlePull}
                  onRefresh={refresh}
                  pushing={pushing}
                  pulling={pulling}
                  prCount={isForgejo ? prs.length : undefined}
                  showingPRs={showPRPanel}
                  onTogglePRs={isForgejo ? () => setShowPRPanel(v => !v) : undefined}
                />
              )}
              <div className="flex-1 overflow-hidden">
                {showPRPanel ? (
                  <GitPRList
                    prs={prs}
                    selectedPR={selectedPR}
                    loading={loadingPRs}
                    creating={creatingPR}
                    branches={branches}
                    currentBranch={currentBranch}
                    onSelect={setSelectedPR}
                    onCreate={handleCreatePR}
                    onRefresh={fetchPRs}
                  />
                ) : (
                  <GitFileList
                    status={gitStatus}
                    selectedFile={selectedCommitFile ? null : selectedFile}
                    selectedStaged={selectedStaged}
                    commitMessage={commitMessage}
                    committing={committing}
                    onSelectFile={selectFile}
                    onStage={handleStage}
                    onUnstage={handleUnstage}
                    onDiscard={handleDiscard}
                    onStageAll={handleStageAll}
                    onCommit={handleCommit}
                    onCommitMessageChange={setCommitMessage}
                  />
                )}
              </div>
              {!showPRPanel && <GitSyncLog />}
            </div>
          </ResizablePanel>

          <ResizableHandle />

          {/* Right: PR detail OR diff + graph */}
          <ResizablePanel defaultSize={78}>
            {showPRPanel ? (
              selectedPR ? (
                <GitPRDetail
                  pr={selectedPR}
                  repoPath={repoPath}
                  merging={mergingPR}
                  onMerge={handleMergePR}
                  onClose={() => setSelectedPR(null)}
                />
              ) : (
                <PRListOverview
                  prs={prs}
                  loading={loadingPRs}
                  onSelect={setSelectedPR}
                  onToggleOff={() => setShowPRPanel(false)}
                  onCreate={() => {/* PR creation is in GitPRList left panel */}}
                  onRefresh={fetchPRs}
                />
              )
            ) : (
              <ResizablePanelGroup direction="vertical">
                <ResizablePanel defaultSize={60} minSize={30}>
                  {diffLoading ? (
                    <div className="flex items-center justify-center h-full text-foreground/20 text-sm">
                      Loading diff…
                    </div>
                  ) : diffError ? (
                    <div className="flex items-center justify-center h-full px-6">
                      <p className="text-xs text-red-400 text-center">{diffError}</p>
                    </div>
                  ) : (
                    <GitDiffViewer
                      diff={diff}
                      filePath={diffFilePath}
                      staged={diffStaged}
                      commitHash={selectedCommitFile?.hash ?? null}
                    />
                  )}
                </ResizablePanel>

                <ResizableHandle />

                <ResizablePanel defaultSize={40} minSize={20}>
                  <div className="h-full flex flex-col overflow-hidden">
                    <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-foreground/10">
                      <span className="text-[11px] text-foreground/40 uppercase tracking-wider font-semibold flex-1">
                        Git Graph · {commits.length} commits
                      </span>
                      <button
                        onClick={handlePull}
                        disabled={pulling}
                        title="Pull"
                        className="p-1 rounded hover:bg-foreground/5 text-foreground/40 hover:text-foreground/70 transition-colors disabled:opacity-40"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 19V5M5 12l7 7 7-7" />
                        </svg>
                      </button>
                      <button
                        onClick={handlePush}
                        disabled={pushing}
                        title="Push"
                        className="p-1 rounded hover:bg-foreground/5 text-foreground/40 hover:text-foreground/70 transition-colors disabled:opacity-40"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 5v14M19 12l-7-7-7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={refresh}
                        title="Refresh"
                        className="p-1 rounded hover:bg-foreground/5 text-foreground/40 hover:text-foreground/70 transition-colors"
                      >
                        <RefreshCw size={12} />
                      </button>
                      {isForgejo && (
                        <button
                          onClick={() => setShowPRPanel(true)}
                          title="Pull Requests"
                          className="p-1 rounded hover:bg-foreground/5 text-foreground/40 hover:text-foreground/70 transition-colors"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/>
                            <path d="M6 9v3a6 6 0 006 6h3"/>
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <GitGraph
                        commits={commits}
                        repoPath={repoPath}
                        selectedHash={selectedCommit}
                        selectedCommitFile={selectedCommitFile}
                        onSelectCommit={setSelectedCommit}
                        onSelectCommitFile={handleSelectCommitFile}
                      />
                    </div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

function PRListOverview({
  prs, loading, onSelect, onToggleOff, onRefresh,
}: {
  prs: ForgejoPR[];
  loading: boolean;
  onSelect: (pr: ForgejoPR) => void;
  onToggleOff: () => void;
  onCreate: () => void;
  onRefresh: () => void;
}) {
  function relativeTime(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const s = Math.floor(ms / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString();
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-foreground/10">
        <GitPullRequest size={14} className="text-foreground/40 shrink-0" />
        <span className="text-sm text-foreground/70 font-medium flex-1">Pull Requests</span>
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Refresh"
          className="p-1 rounded hover:bg-foreground/5 text-foreground/40 hover:text-foreground/70 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={onToggleOff}
          title="Back to source control"
          className="p-1 rounded hover:bg-foreground/5 text-foreground/40 hover:text-foreground/70 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* PR table */}
      <div className="flex-1 overflow-y-auto">
        {loading && prs.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-foreground/30">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : prs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <GitPullRequest size={24} className="text-foreground/15" />
            <p className="text-sm text-foreground/30">No open pull requests</p>
          </div>
        ) : (
          prs.map(pr => (
            <button
              key={pr.number}
              onClick={() => onSelect(pr)}
              className="w-full text-left flex items-center gap-3 px-4 py-3 border-b border-foreground/8 hover:bg-foreground/[0.03] transition-colors group"
            >
              <GitPullRequest size={14} className="shrink-0 text-green-400/70" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-xs text-foreground/30 shrink-0">#{pr.number}</span>
                  <span className="text-sm text-foreground/80 truncate group-hover:text-foreground/90 transition-colors">
                    {pr.title}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-foreground/35">
                  <span className="font-mono text-pink-400/60">{pr.headBranch}</span>
                  <span>→</span>
                  <span className="font-mono">{pr.baseBranch}</span>
                  <span>·</span>
                  <span>{pr.author}</span>
                  <span>·</span>
                  <span>{relativeTime(pr.createdAt)}</span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
