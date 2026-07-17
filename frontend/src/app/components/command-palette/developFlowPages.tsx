import { useState } from 'react';
import {
  FileCodeIcon,
  GitBranchIcon,
  GitCommitIcon,
  HammerIcon,
  LaptopIcon,
  CloudIcon,
  PackageIcon,
  PlayIcon,
  RocketIcon,
  ServerIcon,
  FolderIcon,
  ShieldAlertIcon,
} from 'lucide-react';
import type { NavigateFunction } from 'react-router';
import { Loader } from '../Loader';
import {
  type CommandPaletteContext,
  type PaletteFooterAction,
  type PaletteListItem,
  type PalettePage,
  usePalettePage,
} from '../../stores/commandPalette';
import { useDevelopTabs } from '../../stores/developTabs';
import {
  useDevelopSessions,
  getSession,
  getSessionController,
  patchSession,
  type BuildSession,
  type DefineSession,
  type DeploySession,
  type PackagesSession,
  type SessionController,
} from '../../stores/developSessions';
import { useWorkspace } from '../../stores/workspace';
import { useProtectedEnvironments } from '../../stores/protectedEnvironments';
import { usePackageSessions } from '../../stores/packageSessions';
import { getLogBus } from '../../lib/logBus';
import { formatRelativeTime, formatTimestamp } from '../develop/types';
import type { TaskType } from '../../stores/notifications';
import { DefineRunView } from '../develop/shared/DefineRunView';
import { GlassView } from '../develop/shared/GlassView';
import { BuildRunView } from '../develop/shared/BuildRunView';
import { EnvRunView } from '../develop/shared/EnvRunView';
import { PackageRunStatusList } from '../develop/shared/PackageRunStatusList';
import { PACKAGE_ACTIONS } from '../develop/PackagesPane';

// ── Helpers ────────────────────────────────────────────────────────────────────

function controllerFor<K extends SessionController['kind']>(
  tabId: string,
  kind: K,
): Extract<SessionController, { kind: K }> | undefined {
  const c = getSessionController(tabId);
  return c && c.kind === kind ? (c as Extract<SessionController, { kind: K }>) : undefined;
}

function developFooter(navigate: NavigateFunction, tabId?: string): PaletteFooterAction[] {
  return [{
    label: 'Open in Develop',
    keys: '⌘↵',
    combo: { key: 'Enter', meta: true },
    onAction: (ctx) => {
      if (tabId) useDevelopTabs.getState().activateTab(tabId);
      navigate('/develop');
      ctx.close();
    },
  }];
}

/** Opens (or resumes) the tab for a flow and pushes the page matching the
 * session's current step, so palette and Develop tab stay in lockstep. */
export function openFlow(ctx: CommandPaletteContext, type: TaskType, neuron: string, navigate: NavigateFunction) {
  const tabsStore = useDevelopTabs.getState();
  const existing = tabsStore.tabs.find(t => t.type === type && t.neuron === neuron);
  let tabId: string;
  if (existing) {
    tabId = existing.id;
    tabsStore.activateTab(tabId);
  } else {
    tabId = tabsStore.openTab(type, neuron);
  }
  pushFlowPages(ctx, type, tabId, neuron, navigate);
}

export function pushFlowPages(ctx: CommandPaletteContext, type: TaskType, tabId: string, neuron: string, navigate: NavigateFunction) {
  switch (type) {
    case 'define': {
      const step = getSession<DefineSession>(tabId)?.step ?? 'commits';
      if (step === 'commits') ctx.push(defineCommitsPage(tabId, neuron, navigate));
      else if (step === 'confirm') ctx.push(defineConfirmPage(tabId, neuron, navigate));
      else ctx.push(defineProgressPage(tabId, neuron, navigate));
      break;
    }
    case 'build': {
      const step = getSession<BuildSession>(tabId)?.step ?? 'commits';
      if (step === 'commits') ctx.push(buildCommitsPage(tabId, neuron, navigate));
      else if (step === 'confirm') ctx.push(buildModePage(tabId, neuron, navigate));
      else ctx.push(buildProgressPage(tabId, neuron, navigate));
      break;
    }
    case 'deploy': {
      const step = getSession<DeploySession>(tabId)?.step ?? 'loading';
      if (step === 'loading') ctx.push(deployVersionsPage(tabId, neuron, navigate));
      else if (step === 'confirm') {
        ctx.push(deployVersionsPage(tabId, neuron, navigate));
        if (getSession<DeploySession>(tabId)?.version) ctx.push(deployEnvsPage(tabId, neuron, navigate));
      } else ctx.push(deployProgressPage(tabId, neuron, navigate));
      break;
    }
    case 'packages': {
      const step = getSession<PackagesSession>(tabId)?.step ?? 'scan';
      if (step === 'scan' || step === 'select-action') ctx.push(packagesActionPage(tabId, neuron, navigate));
      else if (step === 'select-folders') ctx.push(packagesFoldersPage(tabId, neuron, navigate));
      else if (step === 'venv-setup') ctx.push(packagesVenvPage(tabId, neuron, navigate));
      else ctx.push(packagesRunningPage(tabId, neuron, navigate));
      break;
    }
    default:
      break;
  }
}

// ── Service selection ──────────────────────────────────────────────────────────

const FLOW_LABELS: Record<string, string> = {
  define: 'Define',
  build: 'Build',
  deploy: 'Deploy',
};

export function servicesPage(type: 'define' | 'build' | 'deploy', navigate: NavigateFunction): PalettePage {
  return {
    kind: 'list',
    id: `develop-${type}-services`,
    title: FLOW_LABELS[type],
    placeholder: 'Search services...',
    footerActions: developFooter(navigate),
    useItems: () => {
      const { state } = useWorkspace();
      const neurons = state.neurons ?? [];
      const items: PaletteListItem[] = neurons.map(n => {
        const name = n.name || n.id;
        return {
          id: name,
          title: name,
          icon: ServerIcon,
          keywords: [type, 'service', 'neuron'],
          onSelect: (ctx) => openFlow(ctx, type, name, navigate),
        };
      });
      return { items, empty: 'No services found.' };
    },
  };
}

export function packagesServicesPage(navigate: NavigateFunction): PalettePage {
  return {
    kind: 'list',
    id: 'develop-packages-services',
    title: 'Packages',
    placeholder: 'Select services...',
    footerActions: developFooter(navigate),
    useItems: () => {
      const { state } = useWorkspace();
      const [selected, setSelected] = useState<string[]>([]);
      const neurons = state.neurons ?? [];
      const items: PaletteListItem[] = [
        {
          id: 'packages-continue',
          title: selected.length > 0 ? `Continue · ${selected.length} service${selected.length !== 1 ? 's' : ''}` : 'Continue',
          subtitle: selected.length === 0 ? 'Select at least one service' : undefined,
          icon: PlayIcon,
          pinned: true,
          disabled: selected.length === 0,
          onSelect: (ctx) => {
            if (selected.length === 0) return;
            openFlow(ctx, 'packages', selected.join(','), navigate);
          },
        },
        ...neurons.map(n => {
          const name = n.name || n.id;
          return {
            id: name,
            title: name,
            icon: ServerIcon,
            checked: selected.includes(name),
            keywords: ['packages', 'service', 'neuron'],
            onSelect: () => {
              setSelected(prev => prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]);
            },
          };
        }),
      ];
      return { items, empty: 'No services found.' };
    },
  };
}

// ── Define flow ────────────────────────────────────────────────────────────────

function CommitSummaryHeader({ tabId }: { tabId: string }) {
  const session = useDevelopSessions(s => s.sessions[tabId]) as DefineSession | BuildSession | undefined;
  const c = session && (session.kind === 'define' || session.kind === 'build') ? session.selectedCommit : null;
  if (!c) return null;
  const branch = session?.kind === 'build' ? session.branch : null;
  return (
    <div className="border-b px-4 py-3">
      <p className="text-muted-foreground mb-1 font-mono text-[10px] font-bold uppercase">
        {branch ? `${branch} · ` : ''}{c.sha.substring(0, 7)}
      </p>
      <p className="text-foreground text-xs leading-snug">{c.message}</p>
      <p className="text-muted-foreground mt-1 text-[10px]">{c.author} · {formatTimestamp(c.timestamp)}</p>
    </div>
  );
}

export function defineCommitsPage(tabId: string, neuron: string, navigate: NavigateFunction): PalettePage {
  return {
    kind: 'list',
    id: `define-commits-${tabId}`,
    title: neuron,
    placeholder: 'Search commits...',
    footerActions: developFooter(navigate, tabId),
    useItems: () => {
      const session = useDevelopSessions(s => s.sessions[tabId]) as DefineSession | undefined;
      const items: PaletteListItem[] = (session?.commits ?? []).map(c => ({
        id: c.sha,
        title: c.message,
        subtitle: `${c.sha.substring(0, 7)} · ${c.author}`,
        icon: GitCommitIcon,
        hint: formatRelativeTime(c.timestamp),
        onSelect: (ctx) => {
          patchSession<DefineSession>(tabId, { selectedCommit: c, step: 'confirm' });
          ctx.push(defineConfirmPage(tabId, neuron, navigate));
        },
      }));
      return { items, loading: session?.commitsLoading ?? true, empty: 'No commits found in define repo.' };
    },
  };
}

export function defineConfirmPage(tabId: string, neuron: string, navigate: NavigateFunction): PalettePage {
  return {
    kind: 'list',
    id: `define-confirm-${tabId}`,
    title: 'Confirm',
    placeholder: 'Confirm...',
    footerActions: developFooter(navigate, tabId),
    Header: () => <CommitSummaryHeader tabId={tabId} />,
    useItems: () => {
      const items: PaletteListItem[] = [
        {
          id: 'run-define',
          title: 'Run Define',
          icon: PlayIcon,
          onSelect: (ctx) => {
            controllerFor(tabId, 'define')?.runDefine();
            ctx.replace(defineProgressPage(tabId, neuron, navigate));
          },
        },
        {
          id: 'change-commit',
          title: 'Choose a different commit',
          icon: GitCommitIcon,
          onSelect: (ctx) => {
            patchSession<DefineSession>(tabId, { step: 'commits' });
            ctx.pop();
          },
        },
      ];
      return { items };
    },
  };
}

function DefineProgressView({ tabId }: { tabId: string }) {
  const session = useDevelopSessions(s => s.sessions[tabId]) as DefineSession | undefined;
  if (!session) return <CenteredLoader label="Starting..." />;
  if (session.step === 'glass') {
    return (
      <div className="flex flex-col overflow-y-auto">
        <GlassView
          defineResult={session.defineResult}
          glassResult={session.glassResult}
          glassLoading={session.glassLoading}
        />
      </div>
    );
  }
  return (
    <DefineRunView
      error={session.defineError}
      progressMsg={session.progressMsg}
      version={session.defineResult?.version}
    />
  );
}

export function defineProgressPage(tabId: string, neuron: string, navigate: NavigateFunction): PalettePage {
  return {
    kind: 'view',
    id: `define-progress-${tabId}`,
    title: neuron,
    footerActions: developFooter(navigate, tabId),
    Component: () => <DefineProgressView tabId={tabId} />,
  };
}

// ── Build flow ─────────────────────────────────────────────────────────────────

export function buildCommitsPage(tabId: string, neuron: string, navigate: NavigateFunction): PalettePage {
  return {
    kind: 'list',
    id: `build-commits-${tabId}`,
    title: neuron,
    placeholder: 'Search commits...',
    footerActions: developFooter(navigate, tabId),
    useItems: () => {
      const session = useDevelopSessions(s => s.sessions[tabId]) as BuildSession | undefined;
      const items: PaletteListItem[] = [
        {
          id: 'change-branch',
          title: `Branch: ${session?.branch ?? 'master'}`,
          subtitle: 'Change branch',
          icon: GitBranchIcon,
          pinned: true,
          onSelect: (ctx) => ctx.push(buildBranchPage(tabId)),
        },
        ...(session?.commits ?? []).map(c => ({
          id: c.sha,
          title: c.message,
          subtitle: `${c.sha.substring(0, 7)} · ${c.author}`,
          icon: GitCommitIcon,
          hint: formatRelativeTime(c.timestamp),
          onSelect: (ctx: CommandPaletteContext) => {
            patchSession<BuildSession>(tabId, { selectedCommit: c, step: 'confirm' });
            ctx.push(buildModePage(tabId, neuron, navigate));
          },
        })),
      ];
      return { items, loading: session?.commitsLoading ?? true, empty: 'No commits found for this branch.' };
    },
  };
}

function buildBranchPage(tabId: string): PalettePage {
  return {
    kind: 'list',
    id: `build-branch-${tabId}`,
    title: 'Branch',
    placeholder: 'Search branches...',
    useItems: () => {
      const session = useDevelopSessions(s => s.sessions[tabId]) as BuildSession | undefined;
      const items: PaletteListItem[] = (session?.branches ?? []).map(b => ({
        id: b,
        title: b,
        icon: GitBranchIcon,
        checked: session?.branch === b,
        onSelect: (ctx) => {
          controllerFor(tabId, 'build')?.changeBranch(b);
          ctx.pop();
        },
      }));
      return { items, empty: 'No branches found.' };
    },
  };
}

export function buildModePage(tabId: string, neuron: string, navigate: NavigateFunction): PalettePage {
  return {
    kind: 'list',
    id: `build-mode-${tabId}`,
    title: 'Action',
    placeholder: 'Choose build action...',
    footerActions: developFooter(navigate, tabId),
    Header: () => <CommitSummaryHeader tabId={tabId} />,
    useItems: () => {
      const items: PaletteListItem[] = [
        {
          id: 'build-cloud',
          title: 'Cloud Build',
          icon: CloudIcon,
          onSelect: (ctx) => {
            patchSession<BuildSession>(tabId, { buildMode: 'cloud' });
            controllerFor(tabId, 'build')?.runBuild();
            ctx.replace(buildProgressPage(tabId, neuron, navigate));
          },
        },
        {
          id: 'build-local',
          title: 'Build Locally',
          icon: LaptopIcon,
          onSelect: (ctx) => {
            patchSession<BuildSession>(tabId, { buildMode: 'local' });
            controllerFor(tabId, 'build')?.runBuild();
            ctx.replace(buildProgressPage(tabId, neuron, navigate));
          },
        },
        {
          id: 'build-deploy',
          title: 'Build and Deploy',
          icon: RocketIcon,
          onSelect: (ctx) => {
            patchSession<BuildSession>(tabId, { buildMode: 'deploy' });
            ctx.push(buildDeployEnvsPage(tabId, neuron, navigate));
          },
        },
        {
          id: 'change-commit',
          title: 'Choose a different commit',
          icon: GitCommitIcon,
          onSelect: (ctx) => {
            patchSession<BuildSession>(tabId, { step: 'commits' });
            ctx.pop();
          },
        },
      ];
      return { items };
    },
  };
}

function buildDeployEnvsPage(tabId: string, neuron: string, navigate: NavigateFunction): PalettePage {
  return {
    kind: 'list',
    id: `build-deploy-envs-${tabId}`,
    title: 'Environments',
    placeholder: 'Select target environments...',
    footerActions: developFooter(navigate, tabId),
    useItems: () => {
      const session = useDevelopSessions(s => s.sessions[tabId]) as BuildSession | undefined;
      const selected = session?.selectedDeployEnvs ?? [];
      const items: PaletteListItem[] = [
        {
          id: 'run-build-deploy',
          title: `Start Build & Deploy · ${selected.length} env${selected.length !== 1 ? 's' : ''}`,
          icon: PlayIcon,
          pinned: true,
          disabled: selected.length === 0,
          onSelect: (ctx) => {
            if (selected.length === 0) return;
            controllerFor(tabId, 'build')?.runBuild();
            ctx.replace(buildProgressPage(tabId, neuron, navigate));
          },
        },
        ...(session?.deployEnvs ?? []).map(env => ({
          id: env.name,
          title: env.displayName || env.name,
          icon: ServerIcon,
          checked: selected.includes(env.name),
          onSelect: () => {
            const cur = getSession<BuildSession>(tabId)?.selectedDeployEnvs ?? [];
            patchSession<BuildSession>(tabId, {
              selectedDeployEnvs: cur.includes(env.name) ? cur.filter(e => e !== env.name) : [...cur, env.name],
            });
          },
        })),
      ];
      return { items, loading: session?.envsLoading ?? false, empty: 'No environments found.' };
    },
  };
}

function BuildProgressView({ tabId }: { tabId: string }) {
  const session = useDevelopSessions(s => s.sessions[tabId]) as BuildSession | undefined;
  if (!session) return <CenteredLoader label="Starting..." />;
  const step = session.step === 'result' ? 'result' : 'running';
  if (session.buildPhase === 'deploy') {
    return (
      <div className="flex h-[380px] flex-col">
        <EnvRunView
          runs={session.deployRuns}
          activeEnv={session.activeRunEnv}
          onSelectEnv={(env) => patchSession<BuildSession>(tabId, { activeRunEnv: env })}
          step={step}
          busFor={(env) => getLogBus(tabId, env)}
        />
      </div>
    );
  }
  return (
    <div className="flex h-[380px] flex-col">
      <BuildRunView
        step={step}
        progressMsg={session.progressMsg}
        buildResult={session.buildResult}
        bus={getLogBus(tabId, 'build')}
      />
    </div>
  );
}

export function buildProgressPage(tabId: string, neuron: string, navigate: NavigateFunction): PalettePage {
  return {
    kind: 'view',
    id: `build-progress-${tabId}`,
    title: neuron,
    footerActions: developFooter(navigate, tabId),
    Component: () => <BuildProgressView tabId={tabId} />,
  };
}

// ── Deploy flow ────────────────────────────────────────────────────────────────

function DeployErrorHeader({ tabId }: { tabId: string }) {
  const session = useDevelopSessions(s => s.sessions[tabId]) as DeploySession | undefined;
  if (!session?.deployError) return null;
  return (
    <div className="border-b px-4 py-3">
      <p className="text-destructive mb-0.5 text-[10px] font-bold">Failed to load deploy info</p>
      <p className="text-muted-foreground text-[10px] leading-relaxed break-words">{session.deployError}</p>
    </div>
  );
}

export function deployVersionsPage(tabId: string, neuron: string, navigate: NavigateFunction): PalettePage {
  return {
    kind: 'list',
    id: `deploy-versions-${tabId}`,
    title: neuron,
    placeholder: 'Select build version...',
    footerActions: developFooter(navigate, tabId),
    Header: () => <DeployErrorHeader tabId={tabId} />,
    useItems: () => {
      const session = useDevelopSessions(s => s.sessions[tabId]) as DeploySession | undefined;
      const items: PaletteListItem[] = (session?.versions ?? []).map(v => ({
        id: v.name,
        title: v.version,
        icon: RocketIcon,
        checked: session?.version === v.version,
        hint: v.createTime > 0 ? formatRelativeTime(v.createTime) : undefined,
        onSelect: (ctx) => {
          patchSession<DeploySession>(tabId, { version: v.version });
          ctx.push(deployEnvsPage(tabId, neuron, navigate));
        },
      }));
      return { items, loading: (session?.step ?? 'loading') === 'loading', empty: 'No built versions found.' };
    },
  };
}

export function deployEnvsPage(tabId: string, neuron: string, navigate: NavigateFunction): PalettePage {
  return {
    kind: 'list',
    id: `deploy-envs-${tabId}`,
    title: 'Environments',
    placeholder: 'Select target environments...',
    footerActions: developFooter(navigate, tabId),
    useItems: () => {
      const session = useDevelopSessions(s => s.sessions[tabId]) as DeploySession | undefined;
      const { isProtected } = useProtectedEnvironments();
      const selected = session?.selectedEnvs ?? [];
      const planOnly = session?.planOnly ?? false;
      const items: PaletteListItem[] = [
        {
          id: 'run-deploy',
          title: `${planOnly ? 'Run Plan' : 'Run Deploy'} · ${selected.length} env${selected.length !== 1 ? 's' : ''}`,
          icon: PlayIcon,
          pinned: true,
          disabled: selected.length === 0 || !session?.version,
          onSelect: (ctx) => {
            const current = getSession<DeploySession>(tabId);
            if (!current || current.selectedEnvs.length === 0 || !current.version) return;
            const protectedLabels = current.envs
              .filter(e => current.selectedEnvs.includes(e.name) && isProtected(e.name))
              .map(e => e.displayName || e.name);
            if (protectedLabels.length > 0) {
              ctx.push(deployProtectedPage(tabId, neuron, protectedLabels, navigate));
              return;
            }
            controllerFor(tabId, 'deploy')?.runDeployNow();
            ctx.replace(deployProgressPage(tabId, neuron, navigate));
          },
        },
        ...(session?.envs ?? []).map(env => {
          const isSelected = selected.includes(env.name);
          const isCurrent = env.currentVersion === session?.version;
          return {
            id: env.name,
            title: env.displayName || env.name,
            subtitle: isProtected(env.name) ? 'Protected' : undefined,
            icon: ServerIcon,
            checked: isSelected,
            hint: env.currentVersion
              ? (isCurrent ? `${env.currentVersion} ✓` : `${env.currentVersion} → ${session?.version || '?'}`)
              : 'not deployed',
            onSelect: () => {
              const cur = getSession<DeploySession>(tabId)?.selectedEnvs ?? [];
              patchSession<DeploySession>(tabId, {
                selectedEnvs: cur.includes(env.name) ? cur.filter(e => e !== env.name) : [...cur, env.name],
              });
            },
          };
        }),
        {
          id: 'toggle-plan-only',
          title: 'Plan only',
          subtitle: 'terraform plan, no apply',
          checked: planOnly,
          keywords: ['plan', 'terraform'],
          onSelect: () => patchSession<DeploySession>(tabId, { planOnly: !getSession<DeploySession>(tabId)?.planOnly }),
        },
        {
          id: 'toggle-beta',
          title: 'Beta',
          subtitle: 'sets ALIS_BETA_VERSION',
          checked: session?.beta ?? false,
          keywords: ['beta'],
          onSelect: () => patchSession<DeploySession>(tabId, { beta: !getSession<DeploySession>(tabId)?.beta }),
        },
      ];
      return { items, loading: (session?.step ?? 'loading') === 'loading', empty: 'No environments found.' };
    },
  };
}

function DeployProtectedConfirm({ tabId, neuron, labels, navigate }: {
  tabId: string;
  neuron: string;
  labels: string[];
  navigate: NavigateFunction;
}) {
  const ctx = usePalettePage();
  const [text, setText] = useState('');
  const requireText = `Deploy to ${labels.join(', ')}`;
  const matches = text === requireText;

  function confirm() {
    if (!matches) return;
    controllerFor(tabId, 'deploy')?.runDeployNow();
    ctx.replace(deployProgressPage(tabId, neuron, navigate));
  }

  return (
    <div className="flex flex-col gap-3 p-5">
      <div className="flex items-start gap-2.5">
        <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <div>
          <p className="text-sm font-medium">Protected Environment</p>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            {labels.join(', ')} {labels.length > 1 ? 'are' : 'is'} protected. Type the phrase below to confirm this deploy.
          </p>
        </div>
      </div>
      <p className="bg-accent text-accent-foreground rounded px-2 py-1.5 font-mono text-xs">{requireText}</p>
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') confirm(); }}
        placeholder="Type to confirm..."
        className="border-border bg-transparent placeholder:text-muted-foreground rounded-md border px-3 py-2 text-sm outline-none"
      />
      <button
        disabled={!matches}
        onClick={confirm}
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-40"
      >
        Run Deploy
      </button>
    </div>
  );
}

function deployProtectedPage(tabId: string, neuron: string, labels: string[], navigate: NavigateFunction): PalettePage {
  return {
    kind: 'view',
    id: `deploy-protected-${tabId}`,
    title: 'Confirm',
    Component: () => <DeployProtectedConfirm tabId={tabId} neuron={neuron} labels={labels} navigate={navigate} />,
  };
}

function DeployProgressView({ tabId }: { tabId: string }) {
  const session = useDevelopSessions(s => s.sessions[tabId]) as DeploySession | undefined;
  if (!session) return <CenteredLoader label="Starting..." />;
  return (
    <div className="flex h-[380px] flex-col">
      <EnvRunView
        runs={session.envRuns}
        activeEnv={session.activeRunEnv}
        onSelectEnv={(env) => patchSession<DeploySession>(tabId, { activeRunEnv: env })}
        step={session.step === 'result' ? 'result' : 'running'}
        busFor={(env) => getLogBus(tabId, env)}
        planOnly={session.planOnly}
        fallbackVersion={session.version}
      />
    </div>
  );
}

export function deployProgressPage(tabId: string, neuron: string, navigate: NavigateFunction): PalettePage {
  return {
    kind: 'view',
    id: `deploy-progress-${tabId}`,
    title: neuron,
    footerActions: developFooter(navigate, tabId),
    Component: () => <DeployProgressView tabId={tabId} />,
  };
}

// ── Packages flow ──────────────────────────────────────────────────────────────

async function startPackages(ctx: CommandPaletteContext, tabId: string, neuron: string, navigate: NavigateFunction) {
  const controller = controllerFor(tabId, 'packages');
  if (!controller) return;
  await controller.runPackages();
  const step = getSession<PackagesSession>(tabId)?.step;
  if (step === 'venv-setup') ctx.push(packagesVenvPage(tabId, neuron, navigate));
  else ctx.replace(packagesRunningPage(tabId, neuron, navigate));
}

function PackagesErrorHeader({ tabId }: { tabId: string }) {
  const session = useDevelopSessions(s => s.sessions[tabId]) as PackagesSession | undefined;
  if (!session?.error) return null;
  return (
    <div className="border-b px-4 py-3">
      <p className="text-destructive text-[10px] leading-relaxed break-words">{session.error}</p>
    </div>
  );
}

export function packagesActionPage(tabId: string, neuron: string, navigate: NavigateFunction): PalettePage {
  return {
    kind: 'list',
    id: `packages-action-${tabId}`,
    title: 'Action',
    placeholder: 'Choose package action...',
    footerActions: developFooter(navigate, tabId),
    Header: () => <PackagesErrorHeader tabId={tabId} />,
    useItems: () => {
      const session = useDevelopSessions(s => s.sessions[tabId]) as PackagesSession | undefined;
      const items: PaletteListItem[] = PACKAGE_ACTIONS.map(({ value, label, desc }) => ({
        id: value,
        title: label,
        subtitle: desc,
        icon: PackageIcon,
        checked: session?.action === value,
        onSelect: (ctx) => {
          patchSession<PackagesSession>(tabId, { action: value });
          const scripts = getSession<PackagesSession>(tabId)?.scripts ?? [];
          if (scripts.length === 0) return;
          if (scripts.length === 1) {
            startPackages(ctx, tabId, neuron, navigate);
          } else {
            patchSession<PackagesSession>(tabId, { step: 'select-folders' });
            ctx.push(packagesFoldersPage(tabId, neuron, navigate));
          }
        },
      }));
      return {
        items,
        loading: (session?.step ?? 'scan') === 'scan',
        empty: 'No package scripts available.',
      };
    },
  };
}

export function packagesFoldersPage(tabId: string, neuron: string, navigate: NavigateFunction): PalettePage {
  return {
    kind: 'list',
    id: `packages-folders-${tabId}`,
    title: 'Folders',
    placeholder: 'Select folders...',
    footerActions: developFooter(navigate, tabId),
    useItems: () => {
      const session = useDevelopSessions(s => s.sessions[tabId]) as PackagesSession | undefined;
      const selected = session?.selectedScripts ?? [];
      const items: PaletteListItem[] = [
        {
          id: 'run-packages',
          title: `Run · ${selected.length} folder${selected.length !== 1 ? 's' : ''}`,
          icon: PlayIcon,
          pinned: true,
          disabled: selected.length === 0,
          onSelect: (ctx) => {
            if (selected.length === 0) return;
            startPackages(ctx, tabId, neuron, navigate);
          },
        },
        ...(session?.scripts ?? []).map(s => ({
          id: s.workDir,
          title: s.name || s.workDir.split('/').slice(-2).join('/'),
          subtitle: s.lang.toUpperCase(),
          icon: FolderIcon,
          checked: selected.includes(s.workDir),
          onSelect: () => {
            const cur = getSession<PackagesSession>(tabId)?.selectedScripts ?? [];
            patchSession<PackagesSession>(tabId, {
              selectedScripts: cur.includes(s.workDir) ? cur.filter(w => w !== s.workDir) : [...cur, s.workDir],
            });
          },
        })),
      ];
      return { items, empty: 'No package scripts available.' };
    },
  };
}

function VenvHeader() {
  return (
    <div className="border-b px-4 py-3">
      <p className="text-foreground text-xs font-medium">Python virtual environment not found</p>
      <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
        A <code className="text-brand font-mono">.venv</code> is required before running Python package scripts.
      </p>
    </div>
  );
}

export function packagesVenvPage(tabId: string, neuron: string, navigate: NavigateFunction): PalettePage {
  return {
    kind: 'list',
    id: `packages-venv-${tabId}`,
    title: 'Setup',
    placeholder: 'Choose...',
    footerActions: developFooter(navigate, tabId),
    Header: VenvHeader,
    useItems: () => {
      const items: PaletteListItem[] = [
        {
          id: 'venv-create',
          title: 'Create .venv & Run',
          icon: PlayIcon,
          onSelect: (ctx) => {
            controllerFor(tabId, 'packages')?.runScripts(true);
            ctx.replace(packagesRunningPage(tabId, neuron, navigate));
          },
        },
        {
          id: 'venv-skip',
          title: 'Skip & Run Anyway',
          icon: PlayIcon,
          onSelect: (ctx) => {
            controllerFor(tabId, 'packages')?.runScripts(false);
            ctx.replace(packagesRunningPage(tabId, neuron, navigate));
          },
        },
      ];
      return { items };
    },
  };
}

function PackagesRunningView({ tabId }: { tabId: string }) {
  const session = useDevelopSessions(s => s.sessions[tabId]) as PackagesSession | undefined;
  const { sessions: packageSessions } = usePackageSessions();
  if (!session || session.step === 'preparing') return <CenteredLoader label="Starting scripts..." />;
  return (
    <div className="flex flex-col overflow-y-auto">
      <PackageRunStatusList sessions={packageSessions} footerText="Output shows in the Develop terminal pane" />
    </div>
  );
}

export function packagesRunningPage(tabId: string, neuron: string, navigate: NavigateFunction): PalettePage {
  return {
    kind: 'view',
    id: `packages-running-${tabId}`,
    title: neuron,
    footerActions: developFooter(navigate, tabId),
    Component: () => <PackagesRunningView tabId={tabId} />,
  };
}

// ── Small shared bits ──────────────────────────────────────────────────────────

function CenteredLoader({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-12">
      <div className="flex flex-col items-center gap-3">
        <Loader size={20} />
        <p className="text-muted-foreground text-xs">{label}</p>
      </div>
    </div>
  );
}

export const FLOW_ROOT_META = [
  { type: 'define' as const, label: 'Define', icon: FileCodeIcon },
  { type: 'build' as const, label: 'Build', icon: HammerIcon },
  { type: 'deploy' as const, label: 'Deploy', icon: RocketIcon },
  { type: 'packages' as const, label: 'Packages', icon: PackageIcon },
];
