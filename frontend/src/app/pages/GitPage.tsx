import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { GitBranchBar } from "../components/git/GitBranchBar";
import { GitDiffViewer } from "../components/git/GitDiffViewer";
import { GitFileList } from "../components/git/GitFileList";
import { GitGraph } from "../components/git/GitGraph";
import { GitPRList } from "../components/git/GitPRList";
import { GitPRDetail } from "../components/git/GitPRDetail";
import { GitPRCreate } from "../components/git/GitPRCreate";
import { GitSyncLog } from "../components/git/GitSyncLog";
import { GitOperationBanner } from "../components/git/GitOperationBanner";
import { GitConflictEditor } from "../components/git/GitConflictEditor";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/resizable";
import { useWorkspace } from "../stores/workspace";
import { useGitStore, gitActions, EMPTY_REPO, type GitTab } from "../stores/git";
import { Loader } from "../components/Loader";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useKeyboardShortcuts } from "../lib/keyboardShortcuts";
import { GitPullRequest, GitCommitVertical, Loader2, Undo2 } from "lucide-react";

// ─── RepoSection ────────────────────────────────────────────────────────────

function RepoSection({ repoPath }: { repoPath: string }) {
  const repo = useGitStore((s) => s.repos[repoPath]) ?? EMPTY_REPO;
  const selectedFile = useGitStore((s) =>
    s.selectedRepoPath === repoPath ? s.selectedFile : null,
  );
  const selectedStaged = useGitStore((s) => s.selectedStaged);

  // Ensure the repo entry exists, start its watcher, refresh (stale-while-revalidate)
  useEffect(() => {
    gitActions.initRepo(repoPath);
  }, [repoPath]);

  useKeyboardShortcuts(
    [
      {
        id: `git-commit-${repoPath}`,
        keys: "Ctrl+Enter",
        description: "Commit staged changes",
        group: "Source Control",
        scope: "/git",
        handler: () => {
          const r = useGitStore.getState().repos[repoPath];
          if (r?.commitMessage.trim()) void gitActions.commit(repoPath);
        },
      },
      {
        id: `git-push-${repoPath}`,
        keys: "Ctrl+Shift+P",
        description: "Push to origin",
        group: "Source Control",
        scope: "/git",
        handler: () => void gitActions.push(repoPath),
      },
      {
        id: `git-pull-${repoPath}`,
        keys: "Ctrl+Shift+U",
        description: "Pull from origin",
        group: "Source Control",
        scope: "/git",
        handler: () => void gitActions.pull(repoPath),
      },
      {
        id: `git-fetch-${repoPath}`,
        keys: "Ctrl+Shift+F",
        description: "Fetch from origin",
        group: "Source Control",
        scope: "/git",
        handler: () => void gitActions.refreshRepo(repoPath),
      },
    ],
    [repoPath],
  );

  const conflictFilePaths =
    repo.status.conflicted.length > 0
      ? repo.status.conflicted.map((f) => f.path)
      : (repo.syncResult?.conflictFiles ?? []);

  const discardDescription = repo.discardPending ? (
    repo.discardPending.length === 1 ? (
      <>
        Discard changes to{" "}
        <span className="text-foreground font-semibold">
          {repo.discardPending[0].split("/").pop()}
        </span>
        ? This cannot be undone.
      </>
    ) : (
      <>
        Discard changes to{" "}
        <span className="text-foreground font-semibold">{repo.discardPending.length} files</span>?
        This cannot be undone.
      </>
    )
  ) : (
    ""
  );

  return (
    <div className="flex flex-col">
      <ConfirmDialog
        open={repo.discardPending !== null}
        onOpenChange={(o) => {
          if (!o && !repo.discarding) gitActions.cancelDiscard(repoPath);
        }}
        title="Discard changes"
        description={discardDescription}
        confirmLabel="Discard"
        loadingLabel="Discarding…"
        loading={repo.discarding}
        onConfirm={() => void gitActions.confirmDiscard(repoPath)}
      />

      <ConfirmDialog
        open={repo.checkoutPending !== null}
        onOpenChange={(o) => {
          if (!o && !repo.checkingOut) gitActions.cancelCheckout(repoPath);
        }}
        title="Uncommitted changes"
        description={
          <>
            You have uncommitted changes. Switching to{" "}
            <span className="text-foreground font-semibold">{repo.checkoutPending}</span> may fail
            or overwrite them. Continue?
          </>
        }
        confirmLabel="Checkout anyway"
        loadingLabel="Checking out…"
        loading={repo.checkingOut}
        onConfirm={() => void gitActions.confirmCheckout(repoPath)}
      />

      {repo.error && (
        <div className="shrink-0 px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400 truncate">
          {repo.error}
        </div>
      )}

      <GitOperationBanner
        result={repo.syncResult}
        onSync={() => void gitActions.sync(repoPath)}
        onResolve={() => gitActions.openConflictEditor(repoPath)}
        onRetry={
          repo.syncResult?.kind === "network_error" || repo.syncResult?.kind === "auth_error"
            ? repo.lastSyncOp === "push"
              ? () => void gitActions.push(repoPath)
              : () => void gitActions.pull(repoPath)
            : undefined
        }
        onClearLock={() => void gitActions.clearIndexLock(repoPath)}
        onDismiss={() => gitActions.dismissSyncResult(repoPath)}
      />

      <GitBranchBar
        currentBranch={repo.currentBranch}
        branches={repo.branches}
        onCheckout={(name) => void gitActions.checkout(repoPath, name)}
        onCreateBranch={(name) => void gitActions.createBranch(repoPath, name)}
        onPush={() => void gitActions.push(repoPath)}
        onPull={() => void gitActions.pull(repoPath)}
        onRefresh={() => void gitActions.refreshRepo(repoPath)}
        pushing={repo.pushing}
        pulling={repo.pulling}
        ahead={repo.ahead}
        behind={repo.behind}
      />

      {repo.showConflictEditor && conflictFilePaths.length > 0 ? (
        <GitConflictEditor
          repoPath={repoPath}
          conflictFiles={conflictFilePaths}
          initialFile={repo.conflictEditorInitialFile ?? undefined}
          onComplete={() => gitActions.closeConflictEditor(repoPath)}
          onAbort={() => gitActions.closeConflictEditor(repoPath)}
        />
      ) : (
        <GitFileList
          status={repo.status}
          selectedFile={selectedFile}
          selectedStaged={selectedStaged}
          commitMessage={repo.commitMessage}
          committing={repo.committing}
          generatingCommitMsg={repo.generatingCommitMsg}
          ahead={repo.ahead}
          behind={repo.behind}
          isMerging={repo.isMerging}
          onSelectFile={(path, staged) => gitActions.selectFile(repoPath, path, staged)}
          onSelectConflictFile={(path) => gitActions.openConflictEditor(repoPath, path)}
          onStage={(path) => void gitActions.stage(repoPath, path)}
          onUnstage={(path) => void gitActions.unstage(repoPath, path)}
          onStageMany={(paths) => void gitActions.stageMany(repoPath, paths)}
          onUnstageMany={(paths) => void gitActions.unstageMany(repoPath, paths)}
          onDiscard={(paths) => gitActions.requestDiscard(repoPath, paths)}
          onStageAll={() => void gitActions.stageAll(repoPath)}
          onCommit={() => void gitActions.commit(repoPath)}
          onContinueMerge={() => void gitActions.continueMerge(repoPath)}
          onCommitMessageChange={(m) => gitActions.setCommitMessage(repoPath, m)}
          onGenerateCommitMessage={() => void gitActions.generateCommitMessage(repoPath)}
          onSync={() => void gitActions.sync(repoPath)}
        />
      )}

      <GitSyncLog repoPath={repoPath} />
    </div>
  );
}

// ─── GitPage ─────────────────────────────────────────────────────────────────

export function GitPage() {
  const organisation = useWorkspace((s) => s.state.organisation);
  const product = useWorkspace((s) => s.state.product);

  const { activeTab, buildPath, definePath, pathsLoading } = useGitStore(
    useShallow((s) => ({
      activeTab: s.activeTab,
      buildPath: s.buildPath,
      definePath: s.definePath,
      pathsLoading: s.pathsLoading,
    })),
  );

  const { selectedFile, selectedStaged, selectedCommitFile, diff, diffLoading, diffError } =
    useGitStore(
      useShallow((s) => ({
        selectedFile: s.selectedFile,
        selectedStaged: s.selectedStaged,
        selectedCommitFile: s.selectedCommitFile,
        diff: s.diff,
        diffLoading: s.diffLoading,
        diffError: s.diffError,
      })),
    );

  const { activeGraphRepoPath, graphSelectedHash, localOnly, undoPending, undoing, undoError } =
    useGitStore(
      useShallow((s) => ({
        activeGraphRepoPath: s.activeGraphRepoPath,
        graphSelectedHash: s.graphSelectedHash,
        localOnly: s.localOnly,
        undoPending: s.undoPending,
        undoing: s.undoing,
        undoError: s.undoError,
      })),
    );

  const {
    prRepo,
    prs,
    prTotal,
    prTruncated,
    loadingPRs,
    prError,
    creatingPR,
    createPRError,
    mergingPR,
    settingReady,
    selectedPR,
    showCreatePR,
    prsAvailable,
    prRepoInfo,
    prUser,
    prAuthorFilter,
    prAssigneeFilter,
  } = useGitStore(
    useShallow((s) => ({
      prRepo: s.prRepo,
      prs: s.prs,
      prTotal: s.prTotal,
      prTruncated: s.prTruncated,
      loadingPRs: s.loadingPRs,
      prError: s.prError,
      creatingPR: s.creatingPR,
      createPRError: s.createPRError,
      mergingPR: s.mergingPR,
      settingReady: s.settingReady,
      selectedPR: s.selectedPR,
      showCreatePR: s.showCreatePR,
      prsAvailable: s.prsAvailable,
      prRepoInfo: s.prRepoInfo,
      prUser: s.prUser,
      prAuthorFilter: s.prAuthorFilter,
      prAssigneeFilter: s.prAssigneeFilter,
    })),
  );

  const activeCommits = useGitStore(
    (s) =>
      (s.repos[s.activeGraphRepoPath === s.definePath ? s.definePath : s.buildPath] ?? EMPTY_REPO)
        .commits,
  );
  const activeAhead = useGitStore(
    (s) =>
      (s.repos[s.activeGraphRepoPath === s.definePath ? s.definePath : s.buildPath] ?? EMPTY_REPO)
        .ahead,
  );

  const prRepoState =
    useGitStore((s) => s.repos[s.prRepo === "build" ? s.buildPath : s.definePath]) ?? EMPTY_REPO;
  const prRepoPath = prRepo === "build" ? buildPath : definePath;

  // Fetch build/define paths when product changes
  useEffect(() => {
    void gitActions.loadPaths(organisation, product);
  }, [organisation, product]);

  const diffFilePath = selectedCommitFile?.path ?? selectedFile;
  const diffStaged = selectedCommitFile ? false : selectedStaged;

  // No product selected
  if (!organisation || !product) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <p className="text-sm text-foreground/40">Select a product to view source control.</p>
      </div>
    );
  }

  if (pathsLoading && !buildPath && !definePath) {
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
        {(
          [
            ["code", "Code"],
            ["prs", "Pull Requests"],
          ] as [GitTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => gitActions.setActiveTab(id)}
            className={`px-3 py-2 text-xs border-b-2 transition-colors ${
              activeTab === id
                ? "border-brand text-foreground/80"
                : "border-transparent text-foreground/40 hover:text-foreground/60"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Code tab */}
      {activeTab === "code" && (
        <div className="flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* Left: stacked repo sections */}
            <ResizablePanel defaultSize={22} minSize={16} maxSize={40}>
              <div className="flex flex-col h-full overflow-y-auto divide-y divide-foreground/10">
                {buildPath && <RepoSection repoPath={buildPath} />}
                {definePath && <RepoSection repoPath={definePath} />}
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
                        onClick={() => useGitStore.setState((s) => ({ localOnly: !s.localOnly }))}
                        title="Show only local commits"
                        className={`p-1 rounded transition-colors ${
                          localOnly
                            ? "bg-brand/30 text-brand"
                            : "text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5"
                        }`}
                      >
                        <GitCommitVertical size={12} />
                      </button>
                      <button
                        onClick={() => useGitStore.setState({ undoPending: true })}
                        disabled={activeAhead === 0 || activeCommits.length === 0}
                        title={
                          activeAhead === 0 ? "No unpushed commit to undo" : "Undo last commit"
                        }
                        className="p-1 rounded transition-colors text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-foreground/40"
                      >
                        <Undo2 size={12} />
                      </button>
                      <div className="flex items-center rounded overflow-hidden border border-foreground/10">
                        <button
                          onClick={() => useGitStore.setState({ activeGraphRepoPath: buildPath })}
                          className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                            activeGraphRepoPath !== definePath
                              ? "bg-brand/30 text-brand"
                              : "text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5"
                          }`}
                        >
                          Build
                        </button>
                        <div className="w-px h-3 bg-foreground/10" />
                        <button
                          onClick={() => useGitStore.setState({ activeGraphRepoPath: definePath })}
                          className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                            activeGraphRepoPath === definePath
                              ? "bg-brand/30 text-brand"
                              : "text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5"
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
                        selectedCommitFile={
                          selectedCommitFile
                            ? { hash: selectedCommitFile.hash, path: selectedCommitFile.path }
                            : null
                        }
                        showLocalOnly={localOnly}
                        onSelectCommit={(hash) => gitActions.selectGraphCommit(hash)}
                        onSelectCommitFile={(hash, path) =>
                          gitActions.selectCommitFile(activeGraphRepoPath || buildPath, hash, path)
                        }
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
      {activeTab === "prs" && (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Repo selector */}
          <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-foreground/10">
            <span className="text-[10px] text-foreground/30 uppercase tracking-wider font-semibold">
              Repo
            </span>
            <div className="flex items-center rounded overflow-hidden border border-foreground/10">
              <button
                onClick={() => gitActions.setPrRepo("build")}
                className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  prRepo === "build"
                    ? "bg-brand/30 text-brand"
                    : "text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5"
                }`}
              >
                Build
              </button>
              <div className="w-px h-3 bg-foreground/10" />
              <button
                onClick={() => gitActions.setPrRepo("define")}
                className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  prRepo === "define"
                    ? "bg-brand/30 text-brand"
                    : "text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5"
                }`}
              >
                Define
              </button>
            </div>
          </div>

          {/* Failures here used to be swallowed, so an expired session read as
              "No open PRs". The banner carries the retry and sign-in actions. */}
          <GitOperationBanner
            result={prError}
            onRetry={() => void gitActions.openPRTab()}
            onDismiss={() => gitActions.dismissPRError()}
          />

          {prsAvailable === false ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2">
              <GitPullRequest size={24} className="text-foreground/15" />
              <p className="text-sm text-foreground/30">
                Pull requests are not available for this repo.
              </p>
              <button
                onClick={() => void gitActions.openPRTab()}
                className="text-[11px] px-2.5 py-1 rounded border border-foreground/15 text-foreground/50 hover:text-foreground/80 hover:border-foreground/30 transition-colors"
              >
                Check again
              </button>
            </div>
          ) : prsAvailable === null && loadingPRs ? (
            <div className="flex-1 flex items-center justify-center text-foreground/30">
              <Loader2 size={16} className="animate-spin" />
            </div>
          ) : (
            <ResizablePanelGroup direction="horizontal" className="flex-1">
              {/* Left: PR list */}
              <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
                <GitPRList
                  prs={prs}
                  selectedPR={selectedPR}
                  loading={loadingPRs}
                  total={prTotal}
                  truncated={prTruncated}
                  currentUser={prUser}
                  authorFilter={prAuthorFilter}
                  assigneeFilter={prAssigneeFilter}
                  onChangeAuthorFilter={gitActions.setPRAuthorFilter}
                  onChangeAssigneeFilter={gitActions.setPRAssigneeFilter}
                  onSelect={(pr) => gitActions.selectPR(pr)}
                  onNewPR={() =>
                    useGitStore.setState({
                      showCreatePR: true,
                      selectedPR: null,
                      createPRError: "",
                    })
                  }
                  onRefresh={() => void gitActions.fetchPRs()}
                />
              </ResizablePanel>

              <ResizableHandle />

              {/* Right: PR detail / create / placeholder */}
              <ResizablePanel defaultSize={70}>
                {showCreatePR ? (
                  <GitPRCreate
                    repoPath={prRepoPath}
                    branches={prRepoState.branches}
                    currentBranch={prRepoState.currentBranch}
                    aheadCount={prRepoState.ahead}
                    defaultBranch={prRepoInfo?.defaultBranch ?? ""}
                    creating={creatingPR}
                    error={createPRError}
                    onCreate={(title, body, head, base) =>
                      gitActions.createPR(title, body, head, base)
                    }
                    onCancel={() =>
                      useGitStore.setState({ showCreatePR: false, createPRError: "" })
                    }
                  />
                ) : selectedPR ? (
                  <GitPRDetail
                    // Identity, not just data: a different PR is a different
                    // subject, so remounting drops the previous one's tab,
                    // selection and draft review rather than clearing them by hand.
                    key={`${prRepo}:${selectedPR.number}`}
                    pr={selectedPR}
                    org={organisation}
                    product={product}
                    repo={prRepo}
                    repoInfo={prRepoInfo}
                    currentUser={prUser}
                    merging={mergingPR}
                    settingReady={settingReady}
                    onMerge={(number, style, deleteBranch) =>
                      gitActions.mergePR(number, style, deleteBranch)
                    }
                    onSetReady={(number) => gitActions.setPRReady(number)}
                    onRefresh={() => void gitActions.fetchPRs()}
                    onClose={() => useGitStore.setState({ selectedPR: null })}
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
        onOpenChange={(open) => {
          if (!open) useGitStore.setState({ undoPending: false });
        }}
        title="Undo last commit"
        description={
          <>
            Undo{" "}
            <span className="text-foreground font-semibold">
              {activeCommits[0]?.subject ?? "the last commit"}
            </span>
            ? Its changes will be moved back to staged.
          </>
        }
        confirmLabel="Undo"
        loading={undoing}
        onConfirm={() => void gitActions.confirmUndo()}
      />
    </div>
  );
}
