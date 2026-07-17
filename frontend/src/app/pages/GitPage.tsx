import { useCallback, useEffect, useRef, useState } from 'react';
import { GitBranchBar } from '../components/git/GitBranchBar';
import { GitDiffViewer } from '../components/git/GitDiffViewer';
import { GitFileList } from '../components/git/GitFileList';
import { GitGraph } from '../components/git/GitGraph';
import { GitPRList } from '../components/git/GitPRList';
import { GitPRDetail } from '../components/git/GitPRDetail';
import { GitPRCreate } from '../components/git/GitPRCreate';
import { GitSyncLog } from '../components/git/GitSyncLog';
import { GitOperationBanner } from '../components/git/GitOperationBanner';
import { GitConflictEditor } from '../components/git/GitConflictEditor';
import { GitBranch, GitCommit, GitFileDiff, GitStatus, ForgejoPR } from '../components/git/types';

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../components/ui/resizable';
import { useWorkspace } from '../stores/workspace';
import { useLabs } from '../stores/labs';
import { useSuggestions } from '../stores/suggestions';
import * as GitService from '../../../bindings/alis-hub-v3/gitservice';
import { Events } from '@wailsio/runtime';
import { Loader } from '../components/Loader';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useLocalAI } from '../stores/localai';
import { useKeyboardShortcuts } from '../lib/keyboardShortcuts';
import { GitPullRequest, GitCommitVertical, Undo2 } from 'lucide-react';

type GitTab = 'code' | 'prs';

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
  onBranchesUpdated?: (branches: GitBranch[], currentBranch: string, ahead: number) => void;
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
  onBranchesUpdated,
  isSuggestionEnabled, addSuggestion,
  localAIEnabled, localAIModelPulled, localAIModel,
}: RepoSectionProps) {
  const { generate, generateCommitMessage } = useLocalAI();
  const [gitStatus, setGitStatus] = useState<GitStatus>({ staged: [], unstaged: [], untracked: [], conflicted: [] });
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
  const [lastSyncOp, setLastSyncOp] = useState<'push' | 'pull' | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [showConflictEditor, setShowConflictEditor] = useState(false);
  const [conflictEditorInitialFile, setConflictEditorInitialFile] = useState<string | null>(null);
  const [discardPending, setDiscardPending] = useState<string[] | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [checkoutPending, setCheckoutPending] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  const repoLabel = label;

  const refresh = useCallback(async () => {
    if (!repoPath) return;
    setError('');
    try {
      const [s, branch, b, log, ab, merging] = await Promise.all([
        GitService.GetStatus(repoPath),
        GitService.GetCurrentBranch(repoPath),
        GitService.GetBranches(repoPath),
        GitService.GetLog(repoPath, LOG_LIMIT),
        GitService.GetAheadBehind(repoPath),
        GitService.IsMerging(repoPath),
      ]);
      if (s) setGitStatus(s);
      setCurrentBranch(branch ?? '');
      setBranches(b ?? []);
      onBranchesUpdated?.(b ?? [], branch ?? '', ab?.ahead ?? 0);
      const loadedCommits = log ?? [];
      setLocalCommits(loadedCommits);
      setCommits(loadedCommits);
      if (ab) { setAhead(ab.ahead); setBehind(ab.behind); }
      setIsMerging(!!merging);
      if (merging) {
        const msg = await GitService.GetMergeMessage(repoPath);
        if (msg) setCommitMessage(prev => prev || msg);
      }
    } catch (e: any) {
      setError(String(e));
    }
  }, [repoPath]);

  // Reset and load when repoPath changes
  useEffect(() => {
    if (repoPath) {
      setGitStatus({ staged: [], unstaged: [], untracked: [], conflicted: [] });
      setCurrentBranch('');
      setBranches([]);
      setLocalCommits([]);
      setCommits([]);
      setAhead(0);
      setBehind(0);
      setCommitMessage('');
      setIsMerging(false);
      refresh();
    }
  }, [repoPath]);

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

  async function handleStage(path: string) {
    try { await GitService.StageFile(repoPath, path); refresh(); }
    catch (e: any) { setError(String(e)); }
  }

  async function handleUnstage(path: string) {
    try { await GitService.UnstageFile(repoPath, path); refresh(); }
    catch (e: any) { setError(String(e)); }
  }

  async function handleStageMany(paths: string[]) {
    if (paths.length === 0) return;
    try { await GitService.StageFiles(repoPath, paths); refresh(); }
    catch (e: any) { setError(String(e)); }
  }

  async function handleUnstageMany(paths: string[]) {
    if (paths.length === 0) return;
    try { await GitService.UnstageFiles(repoPath, paths); refresh(); }
    catch (e: any) { setError(String(e)); }
  }

  function handleDiscard(paths: string[]) { setDiscardPending(paths); }

  async function confirmDiscard() {
    if (!discardPending) return;
    setDiscarding(true);
    try {
      const untrackedSet = new Set(gitStatus.untracked);
      const tracked = discardPending.filter(p => !untrackedSet.has(p));
      const untracked = discardPending.filter(p => untrackedSet.has(p));
      if (tracked.length > 0) await GitService.DiscardFiles(repoPath, tracked);
      if (untracked.length > 0) await GitService.DiscardUntracked(repoPath, untracked);
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

  async function handleContinueMerge() {
    setCommitting(true);
    try {
      await GitService.CompleteMerge(repoPath);
      setCommitMessage('');
      setIsMerging(false);
      refresh();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setCommitting(false);
    }
  }

  function handleSelectConflictFile(path: string) {
    setConflictEditorInitialFile(path);
    setShowConflictEditor(true);
  }

  async function handleGenerateCommitMessage() {
    if (!repoPath) return;
    setGeneratingCommitMsg(true);
    try {
      const msg = await generateCommitMessage(repoPath, localAIModel);
      if (msg) setCommitMessage(msg);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setGeneratingCommitMsg(false);
    }
  }

  async function handlePush() {
    setPushing(true);
    setLastSyncOp('push');
    setSyncResult(null);
    const pushedCommits = commits.slice(0, ahead);
    const result = await GitService.PushOrigin(repoPath) as any;
    if (result && result.kind !== 'ok' && result.kind !== 'up_to_date') {
      setSyncResult(result);
    } else if (
      result?.kind === 'ok' &&
      repoLabel === 'Define' &&
      isSuggestionEnabled('push-define-run-service') &&
      pushedCommits.length > 0
    ) {
      try {
        const fileResults = await Promise.all(
          pushedCommits.map(c => GitService.GetCommitFiles(repoPath, c.hash))
        );
        const protoFiles = fileResults.flat().filter((f: any) =>
          f.path.toLowerCase().endsWith('.proto') && f.statusCode !== 'D'
        );
        const services = new Map<string, string>();
        for (const f of protoFiles) {
          const parts = f.path.split('/');
          if (parts.length >= 4) services.set(parts[2], parts[3]);
        }
        for (const [neuron, version] of services) {
          addSuggestion({
            definitionId: `push-define-run-service:${neuron}`,
            category: 'Define',
            title: `Run Define for ${neuron}?`,
            body: `Proto changes for ${neuron} (${version}) were pushed. Run Define to regenerate code.`,
            priority: 'passive',
          });
        }
      } catch {
        // suggestion detection is best-effort
      }
    }
    setPushing(false);
    refresh();
  }

  async function handlePull() {
    setPulling(true);
    setLastSyncOp('pull');
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
          generate(
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
    const dirty = gitStatus.staged.length + gitStatus.unstaged.length + gitStatus.untracked.length > 0;
    if (dirty) {
      setCheckoutPending(name);
      return;
    }
    setSyncResult(null);
    try {
      const result = await GitService.CheckoutBranch(repoPath, name) as any;
      if (result && result.kind !== 'ok' && result.kind !== 'up_to_date') {
        setSyncResult(result);
      }
      refresh();
    } catch (e: any) {
      setError(String(e));
    }
  }

  async function confirmCheckout() {
    if (!checkoutPending) return;
    setCheckingOut(true);
    setSyncResult(null);
    try {
      const result = await GitService.CheckoutBranch(repoPath, checkoutPending) as any;
      if (result && result.kind !== 'ok' && result.kind !== 'up_to_date') {
        setSyncResult(result);
      }
      refresh();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setCheckingOut(false);
      setCheckoutPending(null);
    }
  }

  async function handleCreateBranch(name: string) {
    await GitService.CreateBranch(repoPath, name);
    refresh();
  }

  const commitMessageRef = useRef(commitMessage);
  commitMessageRef.current = commitMessage;
  const handleCommitRef = useRef(handleCommit);
  handleCommitRef.current = handleCommit;
  const handlePushRef = useRef(handlePush);
  handlePushRef.current = handlePush;
  const handlePullRef = useRef(handlePull);
  handlePullRef.current = handlePull;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useKeyboardShortcuts([
    {
      id: `git-commit-${repoPath}`,
      keys: 'Ctrl+Enter',
      description: 'Commit staged changes',
      group: 'Source Control',
      scope: '/git',
      handler: () => { if (commitMessageRef.current.trim()) handleCommitRef.current(); },
    },
    {
      id: `git-push-${repoPath}`,
      keys: 'Ctrl+Shift+P',
      description: 'Push to origin',
      group: 'Source Control',
      scope: '/git',
      handler: () => handlePushRef.current(),
    },
    {
      id: `git-pull-${repoPath}`,
      keys: 'Ctrl+Shift+U',
      description: 'Pull from origin',
      group: 'Source Control',
      scope: '/git',
      handler: () => handlePullRef.current(),
    },
    {
      id: `git-fetch-${repoPath}`,
      keys: 'Ctrl+Shift+F',
      description: 'Fetch from origin',
      group: 'Source Control',
      scope: '/git',
      handler: () => refreshRef.current(),
    },
  ], [repoPath]);

  const conflictFilePaths = gitStatus.conflicted.length > 0
    ? gitStatus.conflicted.map(f => f.path)
    : (syncResult?.conflictFiles ?? []);

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

      <ConfirmDialog
        open={checkoutPending !== null}
        onOpenChange={(o) => { if (!o && !checkingOut) setCheckoutPending(null); }}
        title="Uncommitted changes"
        description={<>You have uncommitted changes. Switching to <span className="text-foreground font-semibold">{checkoutPending}</span> may fail or overwrite them. Continue?</>}
        confirmLabel="Checkout anyway"
        loadingLabel="Checking out…"
        loading={checkingOut}
        onConfirm={confirmCheckout}
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
        onRetry={
          syncResult?.kind === 'network_error' || syncResult?.kind === 'auth_error'
            ? (lastSyncOp === 'push' ? handlePush : handlePull)
            : undefined
        }
        onDismiss={() => setSyncResult(null)}
      />

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
      />

      {showConflictEditor && conflictFilePaths.length > 0 ? (
        <GitConflictEditor
          repoPath={repoPath}
          conflictFiles={conflictFilePaths}
          initialFile={conflictEditorInitialFile ?? undefined}
          onComplete={() => { setShowConflictEditor(false); setConflictEditorInitialFile(null); setSyncResult(null); refresh(); }}
          onAbort={() => { setShowConflictEditor(false); setConflictEditorInitialFile(null); setSyncResult(null); refresh(); }}
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
          isMerging={isMerging}
          onSelectFile={(path, staged) => onSelectFile(repoPath, path, staged)}
          onSelectConflictFile={handleSelectConflictFile}
          onStage={handleStage}
          onUnstage={handleUnstage}
          onStageMany={handleStageMany}
          onUnstageMany={handleUnstageMany}
          onDiscard={handleDiscard}
          onStageAll={handleStageAll}
          onCommit={handleCommit}
          onContinueMerge={handleContinueMerge}
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

  const [activeTab, setActiveTab] = useState<GitTab>('code');

  const [buildPath, setBuildPath] = useState('');
  const [definePath, setDefinePath] = useState('');
  const [pathsLoading, setPathsLoading] = useState(true);

  // Lifted diff selection
  const [selectedRepoPath, setSelectedRepoPath] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedStaged, setSelectedStaged] = useState(false);
  const [selectedCommitFile, setSelectedCommitFile] = useState<{ repoPath: string; hash: string; path: string } | null>(null);

  // Commits per repo
  const [buildCommits, setBuildCommits] = useState<GitCommit[]>([]);
  const [defineCommits, setDefineCommits] = useState<GitCommit[]>([]);
  const [activeGraphRepoPath, setActiveGraphRepoPath] = useState('');
  const [graphSelectedHash, setGraphSelectedHash] = useState<string | null>(null);
  const [localOnly, setLocalOnly] = useState(false);
  const [undoPending, setUndoPending] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState('');

  const [diff, setDiff] = useState<GitFileDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState('');

  // Branches per repo — fed from RepoSection callbacks, used in PR create form
  const [buildBranches, setBuildBranches] = useState<GitBranch[]>([]);
  const [buildCurrentBranch, setBuildCurrentBranch] = useState('');
  const [buildAhead, setBuildAhead] = useState(0);
  const [defineBranches, setDefineBranches] = useState<GitBranch[]>([]);
  const [defineCurrentBranch, setDefineCurrentBranch] = useState('');
  const [defineAhead, setDefineAhead] = useState(0);

  // Forgejo capability per repo
  const [buildIsForgejo, setBuildIsForgejo] = useState(false);
  const [defineIsForgejo, setDefineIsForgejo] = useState(false);

  // PR tab state
  const [prRepo, setPrRepo] = useState<'build' | 'define'>('build');
  const [prs, setPRs] = useState<ForgejoPR[]>([]);
  const [loadingPRs, setLoadingPRs] = useState(false);
  const [creatingPR, setCreatingPR] = useState(false);
  const [mergingPR, setMergingPR] = useState(false);
  const [selectedPR, setSelectedPR] = useState<ForgejoPR | null>(null);
  const [showCreatePR, setShowCreatePR] = useState(false);

  // Fetch build/define paths when product changes
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

  // Check Forgejo capability when paths are known
  useEffect(() => {
    if (!buildPath) return;
    GitService.IsForgejo(buildPath)
      .then(r => setBuildIsForgejo(r ?? false))
      .catch(() => setBuildIsForgejo(false));
  }, [buildPath]);

  useEffect(() => {
    if (!definePath) return;
    GitService.IsForgejo(definePath)
      .then(r => setDefineIsForgejo(r ?? false))
      .catch(() => setDefineIsForgejo(false));
  }, [definePath]);

  // Load PRs when PR tab is active or repo selector changes
  useEffect(() => {
    if (activeTab !== 'prs') return;
    const path = prRepo === 'build' ? buildPath : definePath;
    if (!path) return;
    setPRs([]);
    setSelectedPR(null);
    setShowCreatePR(false);
    fetchPRs(path);
  }, [activeTab, prRepo, buildPath, definePath]);

  async function fetchPRs(path?: string) {
    const repoPath = path ?? (prRepo === 'build' ? buildPath : definePath);
    if (!repoPath) return;
    setLoadingPRs(true);
    try {
      const result = await GitService.ListPRs(repoPath, 'open');
      setPRs((result as any as ForgejoPR[]) ?? []);
    } catch {
      // ignore
    } finally {
      setLoadingPRs(false);
    }
  }

  async function handleCreatePR(title: string, body: string, head: string, base: string) {
    const repoPath = prRepo === 'build' ? buildPath : definePath;
    if (!repoPath) return;
    setCreatingPR(true);
    try {
      await GitService.CreatePR(repoPath, title, body, head, base);
      setShowCreatePR(false);
      await fetchPRs();
    } catch {
      // ignore
    } finally {
      setCreatingPR(false);
    }
  }

  async function handleMergePR(number: number, style: 'merge' | 'rebase' | 'squash') {
    const repoPath = prRepo === 'build' ? buildPath : definePath;
    if (!repoPath) return;
    setMergingPR(true);
    try {
      await GitService.MergePR(repoPath, number, style);
      setSelectedPR(null);
      await fetchPRs();
    } catch {
      // ignore
    } finally {
      setMergingPR(false);
    }
  }

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

  const activeCommits = activeGraphRepoPath === definePath ? defineCommits : buildCommits;
  const activeAhead = activeGraphRepoPath === definePath ? defineAhead : buildAhead;

  // Re-fetches log + ahead/behind for a single repo at the parent level, bypassing
  // RepoSection (which doesn't expose its own refresh()) — used after actions
  // triggered from the Git Graph toolbar (e.g. undo last commit).
  async function refreshGraphRepo(repoPath: string) {
    if (!repoPath) return;
    const [log, ab] = await Promise.all([
      GitService.GetLog(repoPath, LOG_LIMIT),
      GitService.GetAheadBehind(repoPath),
    ]);
    if (repoPath === definePath) {
      setDefineCommits(log ?? []);
      setDefineAhead(ab?.ahead ?? 0);
    } else {
      setBuildCommits(log ?? []);
      setBuildAhead(ab?.ahead ?? 0);
    }
  }

  async function confirmUndo() {
    if (!activeGraphRepoPath) return;
    setUndoing(true);
    setUndoError('');
    try {
      const result = await GitService.UndoLastCommit(activeGraphRepoPath) as any;
      if (result && result.kind !== 'ok') setUndoError(result.message || 'Undo failed.');
      await refreshGraphRepo(activeGraphRepoPath);
    } catch (e: any) {
      setUndoError(String(e));
    } finally {
      setUndoing(false);
      setUndoPending(false);
    }
  }

  const buildSelectedFile = selectedRepoPath === buildPath ? selectedFile : null;
  const defineSelectedFile = selectedRepoPath === definePath ? selectedFile : null;
  const buildSelectedCommitFile = selectedCommitFile?.repoPath === buildPath
    ? { hash: selectedCommitFile.hash, path: selectedCommitFile.path } : null;
  const defineSelectedCommitFile = selectedCommitFile?.repoPath === definePath
    ? { hash: selectedCommitFile.hash, path: selectedCommitFile.path } : null;

  const diffFilePath = selectedCommitFile?.path ?? selectedFile;
  const diffStaged = selectedCommitFile ? false : selectedStaged;

  const prRepoPath = prRepo === 'build' ? buildPath : definePath;
  const prBranches = prRepo === 'build' ? buildBranches : defineBranches;
  const prCurrentBranch = prRepo === 'build' ? buildCurrentBranch : defineCurrentBranch;
  const prAhead = prRepo === 'build' ? buildAhead : defineAhead;
  const prIsForgejo = prRepo === 'build' ? buildIsForgejo : defineIsForgejo;

  // No product selected
  if (!state.organisation || !state.product) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <p className="text-sm text-foreground/40">Select a product to view source control.</p>
      </div>
    );
  }

  if (pathsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <Loader />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="shrink-0 flex items-center gap-0.5 px-3 border-b border-foreground/10">
        {([
          ['code', 'Code'],
          ['prs', 'Pull Requests'],
        ] as [GitTab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-3 py-2 text-xs border-b-2 transition-colors ${
              activeTab === id
                ? 'border-pink-500 text-foreground/80'
                : 'border-transparent text-foreground/40 hover:text-foreground/60'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Code tab */}
      {activeTab === 'code' && (
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
                    onBranchesUpdated={(b, branch, ahead) => { setBuildBranches(b); setBuildCurrentBranch(branch); setBuildAhead(ahead); }}
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
                    onBranchesUpdated={(b, branch, ahead) => { setDefineBranches(b); setDefineCurrentBranch(branch); setDefineAhead(ahead); }}
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
                      <button
                        onClick={() => setLocalOnly(v => !v)}
                        title="Show only local commits"
                        className={`p-1 rounded transition-colors ${
                          localOnly
                            ? 'bg-pink-600/30 text-pink-400'
                            : 'text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5'
                        }`}
                      >
                        <GitCommitVertical size={12} />
                      </button>
                      <button
                        onClick={() => setUndoPending(true)}
                        disabled={activeAhead === 0 || activeCommits.length === 0}
                        title={activeAhead === 0 ? 'No unpushed commit to undo' : 'Undo last commit'}
                        className="p-1 rounded transition-colors text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-foreground/40"
                      >
                        <Undo2 size={12} />
                      </button>
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
                    {undoError && (
                      <div className="shrink-0 px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400 truncate">
                        {undoError}
                      </div>
                    )}
                    <div className="flex-1 overflow-hidden">
                      <GitGraph
                        commits={activeCommits}
                        repoPath={activeGraphRepoPath || buildPath}
                        selectedHash={graphSelectedHash ?? selectedCommitFile?.hash ?? null}
                        selectedCommitFile={selectedCommitFile ? { hash: selectedCommitFile.hash, path: selectedCommitFile.path } : null}
                        showLocalOnly={localOnly}
                        onSelectCommit={(hash) => {
                          setGraphSelectedHash(hash);
                          setSelectedFile(null);
                        }}
                        onSelectCommitFile={(hash, path) => handleSelectCommitFile(activeGraphRepoPath || buildPath, hash, path)}
                      />
                    </div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}

      {/* Pull Requests tab */}
      {activeTab === 'prs' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Repo selector */}
          <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-foreground/10">
            <span className="text-[10px] text-foreground/30 uppercase tracking-wider font-semibold">Repo</span>
            <div className="flex items-center rounded overflow-hidden border border-foreground/10">
              <button
                onClick={() => setPrRepo('build')}
                className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  prRepo === 'build'
                    ? 'bg-pink-600/30 text-pink-400'
                    : 'text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5'
                }`}
              >
                Build
              </button>
              <div className="w-px h-3 bg-foreground/10" />
              <button
                onClick={() => setPrRepo('define')}
                className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  prRepo === 'define'
                    ? 'bg-pink-600/30 text-pink-400'
                    : 'text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5'
                }`}
              >
                Define
              </button>
            </div>
          </div>

          {!prIsForgejo ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2">
              <GitPullRequest size={24} className="text-foreground/15" />
              <p className="text-sm text-foreground/30">Pull requests not available for this repo.</p>
            </div>
          ) : (
            <ResizablePanelGroup direction="horizontal" className="flex-1">
              {/* Left: PR list */}
              <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
                <GitPRList
                  prs={prs}
                  selectedPR={selectedPR}
                  loading={loadingPRs}
                  onSelect={(pr) => { setSelectedPR(pr); setShowCreatePR(false); }}
                  onNewPR={() => { setShowCreatePR(true); setSelectedPR(null); }}
                  onRefresh={() => fetchPRs()}
                />
              </ResizablePanel>

              <ResizableHandle />

              {/* Right: PR detail / create / placeholder */}
              <ResizablePanel defaultSize={70}>
                {showCreatePR ? (
                  <GitPRCreate
                    repoPath={prRepoPath}
                    branches={prBranches}
                    currentBranch={prCurrentBranch}
                    aheadCount={prAhead}
                    creating={creatingPR}
                    onCreate={handleCreatePR}
                    onCancel={() => setShowCreatePR(false)}
                  />
                ) : selectedPR ? (
                  <GitPRDetail
                    pr={selectedPR}
                    repoPath={prRepoPath}
                    merging={mergingPR}
                    onMerge={handleMergePR}
                    onClose={() => setSelectedPR(null)}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-2">
                    <GitPullRequest size={24} className="text-foreground/15" />
                    <p className="text-sm text-foreground/30">Select a pull request</p>
                  </div>
                )}
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>
      )}

      <ConfirmDialog
        open={undoPending}
        onOpenChange={(open) => { if (!open) setUndoPending(false); }}
        title="Undo last commit"
        description={
          <>Undo <span className="text-foreground font-semibold">{activeCommits[0]?.subject ?? 'the last commit'}</span>? Its changes will be moved back to staged.</>
        }
        confirmLabel="Undo"
        loading={undoing}
        onConfirm={confirmUndo}
      />
    </div>
  );
}
