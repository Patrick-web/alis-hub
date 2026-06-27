import { useCallback, useEffect, useState } from 'react';
import { GitBranchBar } from '../components/git/GitBranchBar';
import { GitDiffViewer } from '../components/git/GitDiffViewer';
import { GitFileList } from '../components/git/GitFileList';
import { GitGraph } from '../components/git/GitGraph';
import { GitPRList } from '../components/git/GitPRList';
import { GitPRDetail } from '../components/git/GitPRDetail';
import { GitSyncLog } from '../components/git/GitSyncLog';
import { GitOperationBanner } from '../components/git/GitOperationBanner';
import { GitConflictEditor } from '../components/git/GitConflictEditor';
import { GitBranch, GitCommit, GitFileDiff, GitStatus, ForgejoPR } from '../components/git/types';

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../components/ui/resizable';
import { useWorkspace } from '../stores/workspace';
import { useLabs } from '../stores/labs';
import { useSuggestions } from '../stores/suggestions';
import * as GitService from '../../../bindings/alis-hub-v3/gitservice';
import * as LocalAIService from '../../../bindings/alis-hub-v3/localaiservice';
import { Events } from '@wailsio/runtime';
import { Loader } from '../components/Loader';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useLocalAI } from '../stores/localai';

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

// ─── RepoSection ────────────────────────────────────────────────────────────

interface RepoSectionProps {
  repoPath: string;
  label: string;
  selectedFile: string | null;
  selectedStaged: boolean;
  selectedCommitFile: { hash: string; path: string } | null;
  onSelectFile: (repoPath: string, path: string, staged: boolean) => void;
  onSelectCommitFile: (repoPath: string, hash: string, path: string) => void;
  setCommits: React.Dispatch<React.SetStateAction<GitCommit[]>>;
  isSuggestionEnabled: (id: string) => boolean;
  addSuggestion: (s: any) => void;
  localAIEnabled: boolean;
  localAIModelPulled: boolean;
  localAIModel: string;
}

function RepoSection({
  repoPath, label,
  selectedFile, selectedStaged, selectedCommitFile,
  onSelectFile, onSelectCommitFile, setCommits,
  isSuggestionEnabled, addSuggestion,
  localAIEnabled, localAIModelPulled, localAIModel,
}: RepoSectionProps) {
  const [gitStatus, setGitStatus] = useState<GitStatus>({ staged: [], unstaged: [], untracked: [] });
  const [currentBranch, setCurrentBranch] = useState('');
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [commits, setLocalCommits] = useState<GitCommit[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [generatingCommitMsg, setGeneratingCommitMsg] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [ahead, setAhead] = useState(0);
  const [behind, setBehind] = useState(0);
  const [error, setError] = useState('');
  const [syncResult, setSyncResult] = useState<{ kind: string; message: string; conflictFiles?: string[] } | null>(null);
  const [showConflictEditor, setShowConflictEditor] = useState(false);
  const [discardPending, setDiscardPending] = useState<string[] | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [isForgejo, setIsForgejo] = useState(false);
  const [showPRPanel, setShowPRPanel] = useState(false);
  const [prs, setPRs] = useState<ForgejoPR[]>([]);
  const [loadingPRs, setLoadingPRs] = useState(false);
  const [creatingPR, setCreatingPR] = useState(false);
  const [mergingPR, setMergingPR] = useState(false);
  const [selectedPR, setSelectedPR] = useState<ForgejoPR | null>(null);

  const repoLabel = label; // used in suggestion definitions

  const refresh = useCallback(async () => {
    if (!repoPath) return;
    setError('');
    try {
      const [s, branch, b, log, ab] = await Promise.all([
        GitService.GetStatus(repoPath),
        GitService.GetCurrentBranch(repoPath),
        GitService.GetBranches(repoPath),
        GitService.GetLog(repoPath, LOG_LIMIT),
        GitService.GetAheadBehind(repoPath),
      ]);
      if (s) setGitStatus(s);
      setCurrentBranch(branch ?? '');
      setBranches(b ?? []);
      const loadedCommits = log ?? [];
      setLocalCommits(loadedCommits);
      setCommits(loadedCommits);
      if (ab) { setAhead(ab.ahead); setBehind(ab.behind); }
    } catch (e: any) {
      setError(String(e));
    }
  }, [repoPath]);

  // Reset and load when repoPath changes
  useEffect(() => {
    if (repoPath) {
      setGitStatus({ staged: [], unstaged: [], untracked: [] });
      setCurrentBranch('');
      setBranches([]);
      setLocalCommits([]);
      setCommits([]);
      setAhead(0);
      setBehind(0);
      setCommitMessage('');
      setShowPRPanel(false);
      setIsForgejo(false);
      setPRs([]);
      setSelectedPR(null);
      refresh();
    }
  }, [repoPath]);

  // Check Forgejo
  useEffect(() => {
    if (!repoPath) return;
    GitService.IsForgejo(repoPath)
      .then(result => setIsForgejo(result ?? false))
      .catch(() => setIsForgejo(false));
  }, [repoPath]);

  // Load PRs when panel opened
  useEffect(() => {
    if (showPRPanel && repoPath) fetchPRs();
  }, [showPRPanel, repoPath]);

  // fsnotify watcher
  useEffect(() => {
    if (!repoPath) return;
    GitService.WatchRepo(repoPath);
    const off = Events.On('git:changed', (ev: any) => {
      if (ev.data === repoPath) refresh();
    });
    return () => off();
  }, [repoPath, refresh]);

  // Refresh on window focus
  useEffect(() => {
    const handle = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, [refresh]);

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

  async function handleStage(path: string) {
    try { await GitService.StageFile(repoPath, path); refresh(); }
    catch (e: any) { setError(String(e)); }
  }

  async function handleUnstage(path: string) {
    try { await GitService.UnstageFile(repoPath, path); refresh(); }
    catch (e: any) { setError(String(e)); }
  }

  function handleDiscard(paths: string[]) { setDiscardPending(paths); }

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

  async function handleGenerateCommitMessage() {
    if (!repoPath) return;
    setGeneratingCommitMsg(true);
    try {
      const msg = await LocalAIService.GenerateCommitMessage(repoPath, localAIModel);
      if (msg) setCommitMessage(msg);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setGeneratingCommitMsg(false);
    }
  }

  async function handlePush() {
    setPushing(true);
    setSyncResult(null);
    const result = await GitService.PushOrigin(repoPath) as any;
    if (result && result.kind !== 'ok' && result.kind !== 'up_to_date') {
      setSyncResult(result);
    }
    setPushing(false);
    refresh();
  }

  async function handlePull() {
    setPulling(true);
    setSyncResult(null);
    const oldHead = commits[0]?.hash ?? null;
    const result = await GitService.PullOrigin(repoPath) as any;
    if (result?.kind === 'pull_conflict') {
      setSyncResult(result);
      setShowConflictEditor(true);
    } else if (result && result.kind !== 'ok' && result.kind !== 'up_to_date') {
      setSyncResult(result);
    } else if (result?.kind === 'ok' && oldHead) {
      try {
        const newLog = await GitService.GetLog(repoPath, LOG_LIMIT);
        const newHead = newLog?.[0]?.hash ?? null;
        if (newHead && newHead !== oldHead) {
          if (repoLabel === 'Define' && isSuggestionEnabled('git-pull-define-upgrade')) {
            addSuggestion({
              definitionId: 'git-pull-define-upgrade',
              category: 'Define',
              title: 'New define changes pulled',
              body: 'Run package install to pick up the latest generated code.',
              priority: 'passive',
            });
          } else if (repoLabel === 'Build' && isSuggestionEnabled('git-pull-build-upgrade')) {
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
        if (localAIEnabled && localAIModelPulled && isSuggestionEnabled('ai-contextual-insight')) {
          const context = `A git pull just completed on the ${repoLabel} repo. New commits were pulled.`;
          LocalAIService.Generate(
            localAIModel,
            'You are a helpful development assistant. Given a development event, suggest one concise actionable next step in 1-2 sentences. Be specific and practical.',
            context,
          ).then(body => {
            if (body) addSuggestion({ definitionId: 'ai-contextual-insight', category: 'AI Insights', title: 'AI suggestion', body, priority: 'passive' });
          }).catch(() => {});
        }
      } catch {
        // suggestion detection is best-effort
      }
    }
    setPulling(false);
    refresh();
  }

  async function handleSync() {
    if (behind > 0) await handlePull();
    if (ahead > 0) await handlePush();
  }

  async function handleCheckout(name: string) {
    await GitService.CheckoutBranch(repoPath, name);
    refresh();
  }

  async function handleCreateBranch(name: string) {
    await GitService.CreateBranch(repoPath, name);
    refresh();
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

  const discardDescription = discardPending
    ? discardPending.length === 1
      ? <>Discard changes to <span className="text-foreground font-semibold">{discardPending[0].split('/').pop()}</span>? This cannot be undone.</>
      : <>Discard changes to <span className="text-foreground font-semibold">{discardPending.length} files</span>? This cannot be undone.</>
    : '';

  return (
    <div className="flex flex-col">
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

      {error && (
        <div className="shrink-0 px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400 truncate">
          {error}
        </div>
      )}

      <GitOperationBanner
        result={syncResult}
        onSync={handleSync}
        onResolve={() => setShowConflictEditor(true)}
        onRetry={syncResult?.kind === 'network_error' ? (pushing ? handlePush : handlePull) : undefined}
        onDismiss={() => setSyncResult(null)}
      />

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
          ahead={ahead}
          behind={behind}
          prCount={isForgejo ? prs.length : undefined}
          showingPRs={showPRPanel}
          onTogglePRs={isForgejo ? () => setShowPRPanel(v => !v) : undefined}
        />
      )}

      {showConflictEditor && syncResult?.conflictFiles && syncResult.conflictFiles.length > 0 ? (
        <GitConflictEditor
          repoPath={repoPath}
          conflictFiles={syncResult.conflictFiles}
          onComplete={() => { setShowConflictEditor(false); setSyncResult(null); refresh(); }}
          onAbort={() => { setShowConflictEditor(false); setSyncResult(null); refresh(); }}
        />
      ) : showPRPanel && selectedPR ? (
        <GitPRDetail
          pr={selectedPR}
          repoPath={repoPath}
          merging={mergingPR}
          onMerge={handleMergePR}
          onClose={() => setSelectedPR(null)}
        />
      ) : showPRPanel ? (
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
          generatingCommitMsg={generatingCommitMsg}
          ahead={ahead}
          behind={behind}
          onSelectFile={(path, staged) => onSelectFile(repoPath, path, staged)}
          onStage={handleStage}
          onUnstage={handleUnstage}
          onDiscard={handleDiscard}
          onStageAll={handleStageAll}
          onCommit={handleCommit}
          onCommitMessageChange={setCommitMessage}
          onGenerateCommitMessage={handleGenerateCommitMessage}
          onSync={handleSync}
        />
      )}

      <GitSyncLog repoPath={repoPath} />
    </div>
  );
}

// ─── GitPage ─────────────────────────────────────────────────────────────────

export function GitPage() {
  const { state } = useWorkspace();
  const { isSuggestionEnabled } = useLabs();
  const { addSuggestion } = useSuggestions();
  const { state: localAIState } = useLocalAI();

  const [buildPath, setBuildPath] = useState('');
  const [definePath, setDefinePath] = useState('');
  const [pathsLoading, setPathsLoading] = useState(true);

  // Lifted diff selection — carries repoPath so we know which repo to load diff from
  const [selectedRepoPath, setSelectedRepoPath] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedStaged, setSelectedStaged] = useState(false);
  const [selectedCommitFile, setSelectedCommitFile] = useState<{ repoPath: string; hash: string; path: string } | null>(null);

  // Commits per repo — each section gets a stable setter, no stale-closure issues
  const [buildCommits, setBuildCommits] = useState<GitCommit[]>([]);
  const [defineCommits, setDefineCommits] = useState<GitCommit[]>([]);
  const [activeGraphRepoPath, setActiveGraphRepoPath] = useState('');
  const [graphSelectedHash, setGraphSelectedHash] = useState<string | null>(null);

  const [diff, setDiff] = useState<GitFileDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState('');

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

  // Load working-tree diff when a file is selected
  useEffect(() => {
    if (!selectedFile || !selectedRepoPath) {
      if (!selectedCommitFile) setDiff(null);
      return;
    }
    setDiffLoading(true);
    setDiffError('');
    GitService.GetFileDiff(selectedRepoPath, selectedFile, selectedStaged)
      .then(d => { setDiff(d); })
      .catch(e => { setDiff(null); setDiffError(String(e)); })
      .finally(() => setDiffLoading(false));
  }, [selectedFile, selectedStaged, selectedRepoPath]);

  // Load commit file diff
  useEffect(() => {
    if (!selectedCommitFile) return;
    setDiffLoading(true);
    setDiffError('');
    GitService.GetCommitFileDiff(selectedCommitFile.repoPath, selectedCommitFile.hash, selectedCommitFile.path)
      .then(d => { setDiff(d); })
      .catch(e => { setDiff(null); setDiffError(String(e)); })
      .finally(() => setDiffLoading(false));
  }, [selectedCommitFile]);

  function handleSelectFile(repoPath: string, path: string, staged: boolean) {
    setSelectedRepoPath(repoPath);
    setSelectedFile(path);
    setSelectedStaged(staged);
    setSelectedCommitFile(null);
    setActiveGraphRepoPath(repoPath);
  }

  function handleSelectCommitFile(repoPath: string, hash: string, path: string) {
    setSelectedCommitFile({ repoPath, hash, path });
    setSelectedFile(null);
    setActiveGraphRepoPath(repoPath);
  }

  // Show graph commits for whichever repo was last interacted with; default to build
  const activeCommits = activeGraphRepoPath === definePath ? defineCommits : buildCommits;

  // Determine which selectedFile/selectedCommitFile belongs to the diff panel (for highlight in sections)
  const buildSelectedFile = selectedRepoPath === buildPath ? selectedFile : null;
  const defineSelectedFile = selectedRepoPath === definePath ? selectedFile : null;
  const buildSelectedCommitFile = selectedCommitFile?.repoPath === buildPath
    ? { hash: selectedCommitFile.hash, path: selectedCommitFile.path } : null;
  const defineSelectedCommitFile = selectedCommitFile?.repoPath === definePath
    ? { hash: selectedCommitFile.hash, path: selectedCommitFile.path } : null;

  const diffFilePath = selectedCommitFile?.path ?? selectedFile;
  const diffStaged = selectedCommitFile ? false : selectedStaged;

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

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left: stacked repo sections */}
          <ResizablePanel defaultSize={22} minSize={16} maxSize={40}>
            <div className="flex flex-col h-full overflow-y-auto divide-y divide-foreground/10">
              {buildPath && (
                <RepoSection
                  repoPath={buildPath}
                  label="Build"
                  selectedFile={buildSelectedFile}
                  selectedStaged={selectedStaged}
                  selectedCommitFile={buildSelectedCommitFile}
                  onSelectFile={handleSelectFile}
                  onSelectCommitFile={handleSelectCommitFile}
                  setCommits={setBuildCommits}
                  isSuggestionEnabled={isSuggestionEnabled}
                  addSuggestion={addSuggestion}
                  localAIEnabled={localAIState.enabled}
                  localAIModelPulled={localAIState.modelPulled}
                  localAIModel={localAIState.model}
                />
              )}
              {definePath && (
                <RepoSection
                  repoPath={definePath}
                  label="Define"
                  selectedFile={defineSelectedFile}
                  selectedStaged={selectedStaged}
                  selectedCommitFile={defineSelectedCommitFile}
                  onSelectFile={handleSelectFile}
                  onSelectCommitFile={handleSelectCommitFile}
                  setCommits={setDefineCommits}
                  isSuggestionEnabled={isSuggestionEnabled}
                  addSuggestion={addSuggestion}
                  localAIEnabled={localAIState.enabled}
                  localAIModelPulled={localAIState.modelPulled}
                  localAIModel={localAIState.model}
                />
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle />

          {/* Right: diff + graph */}
          <ResizablePanel defaultSize={78}>
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
                  <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-foreground/10">
                    <span className="text-[11px] text-foreground/40 uppercase tracking-wider font-semibold flex-1">
                      Git Graph · {activeCommits.length} commits
                    </span>
                    <div className="flex items-center rounded overflow-hidden border border-foreground/10">
                      <button
                        onClick={() => setActiveGraphRepoPath(buildPath)}
                        className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          activeGraphRepoPath !== definePath
                            ? 'bg-pink-600/30 text-pink-400'
                            : 'text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5'
                        }`}
                      >
                        Build
                      </button>
                      <div className="w-px h-3 bg-foreground/10" />
                      <button
                        onClick={() => setActiveGraphRepoPath(definePath)}
                        className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          activeGraphRepoPath === definePath
                            ? 'bg-pink-600/30 text-pink-400'
                            : 'text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5'
                        }`}
                      >
                        Define
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <GitGraph
                      commits={activeCommits}
                      repoPath={activeGraphRepoPath}
                      selectedHash={graphSelectedHash ?? selectedCommitFile?.hash ?? null}
                      selectedCommitFile={selectedCommitFile ? { hash: selectedCommitFile.hash, path: selectedCommitFile.path } : null}
                      onSelectCommit={(hash) => {
                        setGraphSelectedHash(hash);
                        setSelectedFile(null);
                      }}
                      onSelectCommitFile={(hash, path) => handleSelectCommitFile(activeGraphRepoPath, hash, path)}
                    />
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

