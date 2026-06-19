import { useCallback, useEffect, useState } from 'react';
import { GitBranchBar } from '../components/git/GitBranchBar';
import { GitDiffViewer } from '../components/git/GitDiffViewer';
import { GitFileList } from '../components/git/GitFileList';
import { GitGraph } from '../components/git/GitGraph';
import { GitSyncLog } from '../components/git/GitSyncLog';
import { GitBranch, GitCommit, GitFileDiff, GitStatus } from '../components/git/types';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../components/ui/resizable';
import { useWorkspace } from '../stores/workspace';
import * as GitService from '../../../bindings/alis-hub-v3/gitservice';
import { Loader } from '../components/Loader';

const LOG_LIMIT = 200;

type ActiveRepo = 'build' | 'define';

export function GitPage() {
  const { state } = useWorkspace();

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
      refresh();
    }
  }, [repoPath]);

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

  async function handleDiscard(path: string) {
    if (!confirm(`Discard changes to ${path}?`)) return;
    await GitService.DiscardFile(repoPath, path);
    refresh();
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
    try { await GitService.PullOrigin(repoPath); } catch (e: any) { setError(String(e)); }
    finally { setPulling(false); refresh(); }
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
        <p className="text-sm text-white/40">Select a product to view source control.</p>
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

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Repo selector bar */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-1.5 border-b border-white/10 bg-black/10">
        <button
          onClick={() => switchRepo('build')}
          className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
            activeRepo === 'build'
              ? 'bg-pink-600/30 text-pink-400 border border-pink-500/30'
              : 'text-white/40 hover:text-white/70 border border-transparent'
          }`}
        >
          Build
        </button>
        <button
          onClick={() => switchRepo('define')}
          className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
            activeRepo === 'define'
              ? 'bg-pink-600/30 text-pink-400 border border-pink-500/30'
              : 'text-white/40 hover:text-white/70 border border-transparent'
          }`}
        >
          Define
        </button>
        <span className="text-[11px] text-white/25 font-mono truncate flex-1 ml-2">{repoPath}</span>
      </div>

      {error && (
        <div className="shrink-0 px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400 truncate">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left: file list */}
          <ResizablePanel defaultSize={22} minSize={16} maxSize={40}>
            <div className="flex flex-col h-full overflow-hidden">
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
              />
              <div className="flex-1 overflow-hidden">
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
              </div>
              <GitSyncLog />
            </div>
          </ResizablePanel>

          <ResizableHandle />

          {/* Right: diff + graph stacked */}
          <ResizablePanel defaultSize={78}>
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={60} minSize={30}>
                {diffLoading ? (
                  <div className="flex items-center justify-center h-full text-white/20 text-sm">
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
                  <div className="shrink-0 px-4 py-2 border-b border-white/10 text-[11px] text-white/40 uppercase tracking-wider font-semibold">
                    Git Graph · {commits.length} commits
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
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
