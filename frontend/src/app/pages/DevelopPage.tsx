import { Loader } from '../components/Loader';
import { EmptyState } from '../components/EmptyState';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from '@iconify/react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { RightPane } from '../components/RightPane';
import type { TerminalSession } from '../components/PackageTerminalPane';
import { useWorkspace } from '../stores/workspace';
import { useNotifications } from '../stores/notifications';
import { usePackageSessions } from '../stores/packageSessions';
import * as DefineService from '../../../bindings/alis-hub-v3/defineservice';
import * as BuildService from '../../../bindings/alis-hub-v3/buildservice';
import * as DeployService from '../../../bindings/alis-hub-v3/deployservice';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';
import * as PackageService from '../../../bindings/alis-hub-v3/packageservice';
import { Browser } from '@wailsio/runtime';
import { BuildTerminal, type BuildTerminalHandle } from '../components/BuildTerminal';
import { notify } from '../lib/notify';
import { systemNotify } from '../lib/systemNotify';

type DefineStep = 'commits' | 'confirm' | 'running' | 'glass';
type BuildStep = 'commits' | 'confirm' | 'running' | 'result';
type BuildMode = 'cloud' | 'local' | 'deploy';
type DeployStep = 'loading' | 'confirm' | 'running' | 'result';
type PackagesStep = 'scan' | 'select-action' | 'select-folders' | 'venv-setup' | 'preparing' | 'running';

interface PackageScript {
  name: string;
  title: string;
  workDir: string;
  lang: string;
  install: string;
  upgrade: string;
  upgradeDefined: string;
  add: string;
}

interface DeployEnv {
  name: string;
  displayName: string;
  currentVersion: string; // version currently deployed in this env for this neuron
}

interface DefineCommit {
  sha: string;
  message: string;
  author: string;
  authorEmail: string;
  timestamp: number;
}

interface GlassArtifact {
  type: string;
  state: number;
  notes: string;
  locationUri: string;
  extra: string;
}

interface GlassResult {
  title: string;
  summary: string;
  definition: { name: string; version: string; commit: string; releaseType: string };
  artifacts: GlassArtifact[];
}

interface DefineResult {
  operationName: string;
  definition: string;
  version: string;
  notes: string;
  definitionArtifacts: string[];
  done: boolean;
  error?: string;
}

interface BuildResult {
  operationName: string;
  version: string;
  neuronVersion: string;
  logsUrl: string;
  notes: string;
  done: boolean;
  error?: string;
  stub?: boolean;
}

function formatRelativeTime(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function DevelopPage() {
  const { state, setNeurons } = useWorkspace();
  const { addNotification, updateNotification, focusTaskId, setFocusTaskId, state: notifState } = useNotifications();
  const { sessions: packageSessions, addSessions, setTaskId: setPackagesTaskId } = usePackageSessions();

  // Task notification IDs — kept in refs so effects can reference without re-running
  const buildTaskIdRef = useRef<string | null>(null);
  const deployTaskIdRef = useRef<string | null>(null);
  const defineTaskIdRef = useRef<string | null>(null);

  // Log buffer refs for replay on navigate-back
  const buildLogBufferRef = useRef<string[]>([]);
  const deployLogBufferRef = useRef<string[]>([]);
  // Define pane state
  const [defineNeuron, setDefineNeuron] = useState<string | null>(null);
  const [defineStep, setDefineStep] = useState<DefineStep>('commits');
  const [commits, setCommits] = useState<DefineCommit[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<DefineCommit | null>(null);
  const [defineResult, setDefineResult] = useState<DefineResult | null>(null);
  const [progressMsg, setProgressMsg] = useState('Starting...');
  const [glassResult, setGlassResult] = useState<GlassResult | null>(null);
  const [glassLoading, setGlassLoading] = useState(false);

  // Build pane state
  const [buildNeuron, setBuildNeuron] = useState<string | null>(null);
  const [buildStep, setBuildStep] = useState<BuildStep>('commits');
  const [buildCommits, setBuildCommits] = useState<DefineCommit[]>([]);
  const [buildCommitsLoading, setBuildCommitsLoading] = useState(false);
  const [selectedBuildCommit, setSelectedBuildCommit] = useState<DefineCommit | null>(null);
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null);
  const [buildProgressMsg, setBuildProgressMsg] = useState('Starting...');
  const termRef = useRef<BuildTerminalHandle>(null);
  const logOffsetRef = useRef<number>(0);
  const [buildBranch, setBuildBranch] = useState('master');
  const [buildBranches, setBuildBranches] = useState<string[]>(['master']);
  const [buildMode, setBuildMode] = useState<BuildMode>('cloud');
  const [localBuildId, setLocalBuildId] = useState<string | null>(null);
  const [neuronFilter, setNeuronFilter] = useState('');
  const [selectedNeurons, setSelectedNeurons] = useState<Set<string>>(new Set());

  // Deploy pane state
  const [deployNeuron, setDeployNeuron] = useState<string | null>(null);
  const [deployStep, setDeployStep] = useState<DeployStep>('loading');
  const [deployEnvs, setDeployEnvs] = useState<DeployEnv[]>([]);
  const [selectedDeployEnvs, setSelectedDeployEnvs] = useState<string[]>([]);
  const [deployVersions, setDeployVersions] = useState<{ version: string; createTime: number }[]>([]);
  const [deployVersion, setDeployVersion] = useState('');
  const [deployPlanOnly, setDeployPlanOnly] = useState(false);
  const [deployBeta, setDeployBeta] = useState(false);
  const [deployResult, setDeployResult] = useState<{
    operationName: string; version: string; deployments: { logsUrl: string }[];
    notes: string; done: boolean; error?: string;
  } | null>(null);
  const [deployProgressMsg, setDeployProgressMsg] = useState('Starting...');
  const deployTermRef = useRef<BuildTerminalHandle>(null);
  const deployLogOffsetRef = useRef<number>(0);

  // Packages pane state
  const [packagesNeuron, setPackagesNeuron] = useState<string | null>(null);
  const [packagesStep, setPackagesStep] = useState<PackagesStep>('scan');
  const [packagesAction, setPackagesAction] = useState<'upgrade_defined' | 'upgrade' | 'install' | 'add'>('upgrade_defined');
  const [packageScripts, setPackageScripts] = useState<PackageScript[]>([]);
  const [selectedScripts, setSelectedScripts] = useState<Set<string>>(new Set());
  const [packagesError, setPackagesError] = useState('');

  useEffect(() => {
    if (!state.organisation || !state.product) return;
    const load = async () => {
      try {
        const overview = await ProductService.GetServicesOverview(state.organisation, state.product);
        if (overview && overview.neurons && overview.neurons.length > 0) {
          setNeurons(overview.neurons.map(n => ({
            id: n.id,
            name: n.id,
            type: 2,
            state: n.state,
            latestBuild: n.version,
            envs: [],
          })));
        }
      } catch {
        // fall back to workspace neurons
      }
    };
    load();
  }, [state.organisation, state.product]);

  // Restore the correct pane when navigating back via a status strip chip
  useEffect(() => {
    if (!focusTaskId) return;
    const n = notifState.notifications.find(notif => notif.id === focusTaskId);
    setFocusTaskId(null);
    if (!n?.task) return;
    const { type, neuronId, step, meta } = n.task;

    if (type === 'build') {
      setBuildNeuron(neuronId);
      setBuildStep(step as BuildStep);
      buildTaskIdRef.current = focusTaskId;
      buildLogBufferRef.current = [...n.task.logBuffer];
      if (step === 'running' && meta.operationName) {
        setBuildResult({ operationName: meta.operationName as string, version: '', neuronVersion: '', logsUrl: (meta.logsUrl as string) || '', notes: '', done: false });
      }
    } else if (type === 'deploy') {
      setDeployNeuron(neuronId);
      setDeployStep(step as DeployStep);
      deployTaskIdRef.current = focusTaskId;
      deployLogBufferRef.current = [...n.task.logBuffer];
      if (step === 'running' && meta.operationName) {
        setDeployResult({ operationName: meta.operationName as string, version: (meta.version as string) || '', deployments: meta.logsUrl ? [{ logsUrl: meta.logsUrl as string }] : [], notes: '', done: false });
      }
    } else if (type === 'define') {
      setDefineNeuron(neuronId);
      setDefineStep(step as DefineStep);
      defineTaskIdRef.current = focusTaskId;
      if (step === 'running' && meta.operationName) {
        setDefineResult({ operationName: meta.operationName as string, definition: '', version: '', notes: '', definitionArtifacts: [], done: false });
      }
    } else if (type === 'packages') {
      setPackagesNeuron(neuronId);
      setPackagesStep('running');
      packagesTaskIdRef.current = focusTaskId;
    }
  }, [focusTaskId]);

  const parseNeuron = (name: string) => {
    // Dot notation from alis API: "bookings.v2" → { id: 'bookings', version: 'v2' }
    const mDot = name.match(/^(.+)\.(v\d+)$/);
    if (mDot) return { id: mDot[1], version: mDot[2] };
    // Hyphen notation: "bookings-v1" → { id: 'bookings', version: 'v1' }
    const mHyphen = name.match(/^(.+)-(v\d+)$/);
    if (mHyphen) return { id: mHyphen[1], version: mHyphen[2] };
    return { id: name, version: 'v1' };
  };

  const openDefinePane = useCallback(async (neuronName: string) => {
    setBuildNeuron(null);
    setDeployNeuron(null);
    setDefineNeuron(neuronName);
    setDefineStep('commits');
    setCommits([]);
    setSelectedCommit(null);
    setDefineResult(null);
    setGlassResult(null);
    setProgressMsg('Loading commits...');
    setCommitsLoading(true);
    const parsed = parseNeuron(neuronName);
    try {
      const result = await DefineService.GetDefineCommits(
        state.organisation, state.product, parsed.id, parsed.version, 30
      );
      setCommits(result as DefineCommit[]);
    } catch {
      setCommits([]);
    } finally {
      setCommitsLoading(false);
    }
  }, [state.organisation, state.product]);

  const openBuildPane = useCallback(async (neuronName: string) => {
    setDefineNeuron(null);
    setDeployNeuron(null);
    setBuildNeuron(neuronName);
    setBuildStep('commits');
    setBuildCommits([]);
    setSelectedBuildCommit(null);
    setBuildResult(null);
    setBuildProgressMsg('Loading commits...');
    setBuildMode('cloud');
    setBuildBranch('master');
    setLocalBuildId(null);
    logOffsetRef.current = 0;
    setBuildCommitsLoading(true);
    const parsed = parseNeuron(neuronName);
    // Load branches and commits in parallel
    const [, commits] = await Promise.allSettled([
      BuildService.GetBuildBranches(state.organisation, state.product).then(
        (b) => { if (b && b.length > 0) setBuildBranches(b as string[]); }
      ),
      BuildService.GetBuildCommits(
        state.organisation, state.product, parsed.id, parsed.version, 'master', 30
      ),
    ]);
    setBuildCommitsLoading(false);
    if (commits.status === 'fulfilled' && commits.value) {
      setBuildCommits(commits.value as DefineCommit[]);
    } else {
      setBuildCommits([]);
    }
  }, [state.organisation, state.product]);

  const handleRunBuild = async () => {
    if (!buildNeuron || !selectedBuildCommit) return;
    const neuronResource = `organisations/${state.organisation}/products/${state.product}/neurons/${buildNeuron}`;
    buildLogBufferRef.current = [];

    if (buildMode === 'local') {
      setBuildStep('running');
      setBuildProgressMsg('Building locally...');
      const taskId = addNotification({
        severity: 'info', source: 'build', title: 'Local build started', body: buildNeuron, persistent: true,
        task: { type: 'build', status: 'running', neuronId: buildNeuron, step: 'running', startedAt: Date.now(), logBuffer: [], meta: { mode: 'local' } },
      });
      buildTaskIdRef.current = taskId;
      try {
        const result = await BuildService.StartLocalBuild(neuronResource, selectedBuildCommit.sha);
        if (result) setLocalBuildId(result.buildId);
      } catch (e: any) {
        setBuildStep('result');
        setBuildResult({ operationName: '', version: '', neuronVersion: '', logsUrl: '', notes: '', done: true, error: e?.message || 'Failed to start local build' } as BuildResult);
        updateNotification(taskId, { severity: 'error', title: 'Local build failed', task: { status: 'error', step: 'result' } });
        buildTaskIdRef.current = null;
      }
      return;
    }

    if (buildMode === 'deploy') {
      setBuildStep('running');
      setBuildProgressMsg('Building and deploying...');
      setTimeout(() => {
        termRef.current?.write('\x1b[33m[deploy]\x1b[0m  Coming soon — not yet implemented.\r\n');
        setBuildStep('result');
        setBuildResult({ operationName: '', version: '', neuronVersion: '', logsUrl: '', notes: '', done: true, stub: true } as BuildResult);
      }, 200);
      return;
    }

    setBuildStep('running');
    setBuildProgressMsg('Starting Build...');
    const taskId = addNotification({
      severity: 'info', source: 'build', title: 'Build started', body: buildNeuron, persistent: true,
      task: { type: 'build', status: 'running', neuronId: buildNeuron, step: 'running', startedAt: Date.now(), logBuffer: [], meta: {} },
    });
    buildTaskIdRef.current = taskId;
    try {
      const result = await BuildService.RunBuild(neuronResource, selectedBuildCommit.sha);
      setBuildResult(result as BuildResult);
      updateNotification(taskId, {
        task: { meta: { operationName: (result as BuildResult).operationName, logsUrl: (result as BuildResult).logsUrl } },
      });
    } catch (e: any) {
      setBuildProgressMsg(`Failed: ${e?.message || e}`);
      updateNotification(taskId, { severity: 'error', title: 'Build failed', task: { status: 'error' } });
      buildTaskIdRef.current = null;
    }
  };

  const handleBranchChange = useCallback(async (branch: string) => {
    if (!buildNeuron) return;
    setBuildBranch(branch);
    setSelectedBuildCommit(null);
    setBuildCommitsLoading(true);
    setBuildCommits([]);
    const parsed = parseNeuron(buildNeuron);
    try {
      const result = await BuildService.GetBuildCommits(
        state.organisation, state.product, parsed.id, parsed.version, branch, 30
      );
      setBuildCommits(result as DefineCommit[]);
    } catch {
      setBuildCommits([]);
    } finally {
      setBuildCommitsLoading(false);
    }
  }, [buildNeuron, state.organisation, state.product]);

  const openDeployPane = useCallback(async (neuronName: string) => {
    setDefineNeuron(null);
    setBuildNeuron(null);
    setDeployNeuron(neuronName);
    setDeployStep('loading');
    setDeployEnvs([]);
    setDeployVersions([]);
    setSelectedDeployEnvs([]);
    setDeployVersion('');
    setDeployResult(null);
    deployLogOffsetRef.current = 0;
    const neuronResource = `organisations/${state.organisation}/products/${state.product}/neurons/${neuronName}`;
    try {
      const [overview, versions] = await Promise.all([
        ProductService.GetServicesOverview(state.organisation, state.product),
        DeployService.ListNeuronVersions(neuronResource),
      ]);
      // Version list (already sorted newest-first by server)
      const builtVersions = (versions ?? []).filter(v => v !== null).map(v => ({
        version: v!.version,
        createTime: v!.createTime,
      }));
      setDeployVersions(builtVersions);
      // Pre-select the latest version
      if (builtVersions.length > 0) setDeployVersion(builtVersions[0].version);
      // Build enriched environment list with current deployment status per env
      const envs: DeployEnv[] = (overview?.environments ?? []).map(env => {
        const dep = env.deployments?.find(d => d.neuronId === neuronName);
        return { name: env.name, displayName: env.displayName, currentVersion: dep?.version ?? '' };
      });
      setDeployEnvs(envs);
      // Pre-select the active environment
      if (state.activeEnvName) {
        const active = envs.find(e => e.name === state.activeEnvName);
        if (active) setSelectedDeployEnvs([active.name]);
      }
    } catch {
      setDeployEnvs([]);
    } finally {
      setDeployStep('confirm');
    }
  }, [state.organisation, state.product, state.activeEnvName]);

  const handleRunDeploy = async () => {
    if (!deployNeuron || selectedDeployEnvs.length === 0 || !deployVersion) return;
    const neuronResource = `organisations/${state.organisation}/products/${state.product}/neurons/${deployNeuron}`;
    setDeployStep('running');
    setDeployProgressMsg('Starting Deploy...');
    deployTermRef.current?.clear();
    deployLogOffsetRef.current = 0;
    deployLogBufferRef.current = [];
    const taskId = addNotification({
      severity: 'info', source: 'deploy', title: 'Deploy started', body: deployNeuron, persistent: true,
      task: { type: 'deploy', status: 'running', neuronId: deployNeuron, step: 'running', startedAt: Date.now(), logBuffer: [], meta: {} },
    });
    deployTaskIdRef.current = taskId;
    try {
      const result = await DeployService.RunDeploy(neuronResource, deployVersion, selectedDeployEnvs, deployPlanOnly, deployBeta);
      setDeployResult(result as any);
      updateNotification(taskId, {
        task: { meta: { operationName: (result as any).operationName, version: (result as any).version, logsUrl: (result as any).deployments?.[0]?.logsUrl || '' } },
      });
    } catch (e: any) {
      setDeployProgressMsg(`Failed: ${e?.message || e}`);
      setDeployStep('result');
      setDeployResult({ operationName: '', version: '', deployments: [], notes: '', done: true, error: e?.message || 'Deploy failed' });
      updateNotification(taskId, { severity: 'error', title: 'Deploy failed', task: { status: 'error', step: 'result' } });
      deployTaskIdRef.current = null;
    }
  };

  // Poll deploy operation
  useEffect(() => {
    if (!deployResult || deployResult.done || deployStep !== 'running') return;
    const interval = setInterval(async () => {
      try {
        const result = await DeployService.PollDeployOperation(deployResult.operationName);
        setDeployResult(result as any);
        if (result?.done) {
          clearInterval(interval);
          setDeployStep('result');
          if (deployTaskIdRef.current) {
            const doneId = deployTaskIdRef.current;
            deployTaskIdRef.current = null;
            if (result.error) {
              updateNotification(doneId, { severity: 'error', title: 'Deploy failed', task: { status: 'error', step: 'result' } });
            } else {
              updateNotification(doneId, {
                severity: 'success', title: 'Deploy complete', task: { status: 'done', step: 'result' },
                actions: [{ label: 'Open in Develop', variant: 'primary', onClick: () => setFocusTaskId(doneId) }],
              });
            }
          }
        } else if (result?.notes) {
          setDeployProgressMsg(result.notes);
        }
      } catch {
        clearInterval(interval);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [deployResult?.operationName, deployResult?.done, deployStep]);

  // Stream deploy logs into the terminal
  useEffect(() => {
    const logsUrl = deployResult?.deployments?.[0]?.logsUrl;
    if (!logsUrl) return;

    const fetchLogs = async () => {
      try {
        const chunk = await DeployService.FetchDeployLogs(logsUrl, deployLogOffsetRef.current);
        if (chunk?.content) {
          deployTermRef.current?.write(chunk.content);
          deployLogOffsetRef.current = chunk.nextOffset;
          deployLogBufferRef.current.push(chunk.content);
          if (deployTaskIdRef.current) {
            updateNotification(deployTaskIdRef.current, { task: { logBuffer: [...deployLogBufferRef.current] } });
          }
        }
      } catch {}
    };

    if (deployResult?.done) {
      fetchLogs();
      return;
    }

    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [deployResult?.deployments?.[0]?.logsUrl, deployResult?.done]);

  // Poll build operation
  useEffect(() => {
    if (!buildResult || buildResult.done || buildStep !== 'running') return;
    const interval = setInterval(async () => {
      try {
        const neuronResource = `organisations/${state.organisation}/products/${state.product}/neurons/${buildNeuron}`;
        const result = await BuildService.PollBuildOperation(buildResult.operationName, neuronResource);
        setBuildResult(result as BuildResult);
        if (result?.done) {
          clearInterval(interval);
          setBuildStep('result');
          if (!result.error && buildNeuron) {
            const version = result.neuronVersion || result.version;
            const body = version ? `${buildNeuron} · ${version}` : buildNeuron;
            if (buildTaskIdRef.current) {
              updateNotification(buildTaskIdRef.current, {
                severity: 'success', title: 'Build complete', body,
                task: { status: 'done', step: 'result' },
                actions: [{ label: 'Deploy', variant: 'primary', onClick: () => openDeployPane(buildNeuron) }],
              });
              buildTaskIdRef.current = null;
            }
            notify.success('Build complete', {
              description: body,
              action: { label: 'Deploy', onClick: () => openDeployPane(buildNeuron) },
            });
            systemNotify('Build complete', body);
          } else if (buildTaskIdRef.current) {
            updateNotification(buildTaskIdRef.current, { severity: 'error', title: 'Build failed', task: { status: 'error', step: 'result' } });
            buildTaskIdRef.current = null;
          }
        } else if (result?.notes) {
          setBuildProgressMsg(result.notes);
        }
      } catch {
        clearInterval(interval);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [buildResult?.operationName, buildResult?.done, buildStep, buildNeuron]);

  // Stream build logs into the terminal
  useEffect(() => {
    if (!buildResult?.logsUrl) return;

    const fetchLogs = async () => {
      try {
        const chunk = await BuildService.FetchBuildLogs(buildResult.logsUrl, logOffsetRef.current);
        if (chunk?.content) {
          termRef.current?.write(chunk.content);
          logOffsetRef.current = chunk.nextOffset;
          buildLogBufferRef.current.push(chunk.content);
          if (buildTaskIdRef.current) {
            updateNotification(buildTaskIdRef.current, { task: { logBuffer: [...buildLogBufferRef.current] } });
          }
        }
      } catch {}
    };

    if (buildResult.done) {
      // One final drain when the build completes
      fetchLogs();
      return;
    }

    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [buildResult?.logsUrl, buildResult?.done]);

  // Poll local Docker build output
  useEffect(() => {
    if (!localBuildId || buildStep !== 'running') return;
    let offset = 0;
    const interval = setInterval(async () => {
      try {
        const chunk = await BuildService.PollLocalBuild(localBuildId, offset);
        if (chunk?.content) {
          termRef.current?.write(chunk.content);
          offset = chunk.nextOffset;
          buildLogBufferRef.current.push(chunk.content);
          if (buildTaskIdRef.current) {
            updateNotification(buildTaskIdRef.current, { task: { logBuffer: [...buildLogBufferRef.current] } });
          }
        }
        if (chunk?.done) {
          clearInterval(interval);
          setBuildStep('result');
          setBuildResult({
            operationName: '', version: '', neuronVersion: '', logsUrl: '', notes: '', done: true, error: chunk.error || undefined,
          } as BuildResult);
          if (!chunk.error && buildNeuron) {
            if (buildTaskIdRef.current) {
              updateNotification(buildTaskIdRef.current, {
                severity: 'success', title: 'Local build complete',
                task: { status: 'done', step: 'result' },
                actions: [{ label: 'Deploy', variant: 'primary', onClick: () => openDeployPane(buildNeuron) }],
              });
              buildTaskIdRef.current = null;
            }
            notify.success('Local build complete', {
              description: buildNeuron,
              action: { label: 'Deploy', onClick: () => openDeployPane(buildNeuron) },
            });
            systemNotify('Local build complete', buildNeuron);
          } else if (buildTaskIdRef.current) {
            updateNotification(buildTaskIdRef.current, { severity: 'error', title: 'Local build failed', task: { status: 'error', step: 'result' } });
            buildTaskIdRef.current = null;
          }
        }
      } catch {
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [localBuildId, buildStep]);

  const handleRunDefine = async () => {
    if (!defineNeuron || !selectedCommit) return;
    const neuronResource = `organisations/${state.organisation}/products/${state.product}/neurons/${defineNeuron}`;
    setDefineStep('running');
    setProgressMsg('Starting Define...');
    const taskId = addNotification({
      severity: 'info', source: 'define', title: 'Define started', body: defineNeuron, persistent: true,
      task: { type: 'define', status: 'running', neuronId: defineNeuron, step: 'running', startedAt: Date.now(), logBuffer: [], meta: {} },
    });
    defineTaskIdRef.current = taskId;
    try {
      const result = await DefineService.RunDefine(neuronResource, selectedCommit.sha, '');
      setDefineResult(result as DefineResult);
      updateNotification(taskId, { task: { meta: { operationName: (result as DefineResult).operationName } } });
    } catch (e: any) {
      setProgressMsg(`Failed: ${e?.message || e}`);
      updateNotification(taskId, { severity: 'error', title: 'Define failed', task: { status: 'error' } });
      defineTaskIdRef.current = null;
    }
  };

  // Poll define operation
  useEffect(() => {
    if (!defineResult || defineResult.done || defineStep !== 'running') return;
    const neuronResource = defineNeuron
      ? `organisations/${state.organisation}/products/${state.product}/neurons/${defineNeuron}`
      : '';
    const interval = setInterval(async () => {
      try {
        const result = await DefineService.PollDefineOperation(defineResult.operationName);
        setDefineResult(result as DefineResult);
        if (result?.done) {
          clearInterval(interval);
          if (!result.error) {
            setDefineStep('glass');
            setGlassLoading(true);
            setProgressMsg('Define complete — loading Glass...');
            if (defineTaskIdRef.current) {
              const doneId = defineTaskIdRef.current;
              updateNotification(doneId, {
                severity: 'success', title: 'Define complete', task: { status: 'done', step: 'glass' },
                actions: [{ label: 'Open in Develop', variant: 'primary', onClick: () => setFocusTaskId(doneId) }],
              });
              defineTaskIdRef.current = null;
            }
            try {
              const glass = await DefineService.ExplainDefine(
                result.definition,
                result.definitionArtifacts ?? [],
                neuronResource
              );
              setGlassResult(glass as GlassResult);
            } catch {
              // glass not available
            } finally {
              setGlassLoading(false);
            }
          } else {
            setProgressMsg(`Define failed: ${result.error}`);
            if (defineTaskIdRef.current) {
              updateNotification(defineTaskIdRef.current, { severity: 'error', title: 'Define failed', task: { status: 'error', step: 'running' } });
              defineTaskIdRef.current = null;
            }
          }
        } else if (result?.notes) {
          setProgressMsg(result.notes);
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [defineResult?.operationName, defineResult?.done, defineStep]);

  const openPackagesPane = useCallback(async (neuronNames: string[]) => {
    if (neuronNames.length === 0) return;
    setDefineNeuron(null);
    setBuildNeuron(null);
    setDeployNeuron(null);
    setPackagesNeuron(neuronNames.length === 1 ? neuronNames[0] : `${neuronNames.length} neurons`);
    setPackagesStep('scan');
    setPackageScripts([]);
    setSelectedScripts(new Set());
    setPackagesError('');
    try {
      const allScripts: PackageScript[] = [];
      for (const neuronName of neuronNames) {
        const parsed = parseNeuron(neuronName);
        const scripts = await PackageService.PreparePackageScripts(
          state.organisation, state.product, parsed.id, parsed.version
        );
        allScripts.push(...(scripts as PackageScript[]));
      }
      setPackageScripts(allScripts);
      setSelectedScripts(new Set(allScripts.map(s => s.workDir)));
      setPackagesStep('select-action');
    } catch (e: unknown) {
      setPackagesError(e instanceof Error ? e.message : String(e));
      setPackagesStep('select-action');
    }
  }, [state.organisation, state.product]);

  // doRunScripts starts the selected scripts as terminal sessions, optionally
  // prepending a venv session. Mirrors extension's Promise.all — all fire concurrently.
  const doRunScripts = async (withVenv: boolean) => {
    const scriptsToRun = packageScripts.filter(s => selectedScripts.has(s.workDir));
    if (scriptsToRun.length === 0 && !withVenv) return;
    setPackagesStep('preparing');
    const newSessions: TerminalSession[] = [];

    if (withVenv) {
      const venvRunID = `pkg-venv-${Date.now()}`;
      try {
        await PackageService.StartVenvSetup(venvRunID, state.organisation, state.product);
        newSessions.push({ runID: venvRunID, title: '.venv setup', lang: 'python', done: false });
      } catch { /* continue even if venv start fails */ }
    }

    for (const script of scriptsToRun) {
      const cmd = packagesAction === 'upgrade_defined' ? script.upgradeDefined
        : packagesAction === 'upgrade' ? script.upgrade
        : packagesAction === 'install' ? script.install
        : script.add;
      if (!cmd) continue;
      const runID = `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const title = script.name || script.workDir.split('/').slice(-2).join('/');
      try {
        await PackageService.StartPackageScript(runID, cmd, script.workDir);
        newSessions.push({ runID, title, lang: script.lang, done: false });
      } catch { /* skip scripts that fail to start */ }
    }

    if (newSessions.length > 0) {
      addSessions(newSessions);
      setPackagesStep('running');
      const neuronLabel = packagesNeuron || 'packages';
      const taskId = addNotification({
        severity: 'info', source: 'packages', title: 'Packages running', body: neuronLabel, persistent: true,
        task: {
          type: 'packages', status: 'running', neuronId: neuronLabel, step: 'running',
          startedAt: Date.now(), logBuffer: [], meta: { sessionIds: newSessions.map(s => s.runID) },
        },
      });
      setPackagesTaskId(taskId);
    } else {
      setPackagesError('Failed to start any package scripts');
      setPackagesStep('select-folders');
    }
  };

  const handleRunPackages = async () => {
    const scriptsToRun = packageScripts.filter(s => selectedScripts.has(s.workDir));
    if (scriptsToRun.length === 0) return;
    const hasPython = scriptsToRun.some(s => s.lang === 'python');
    if (hasPython) {
      const venvExists = await PackageService.CheckVenvExists(state.organisation, state.product);
      if (!venvExists) {
        setPackagesStep('venv-setup');
        return;
      }
    }
    await doRunScripts(false);
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const visibleNeurons = state.neurons.filter(n =>
    !neuronFilter || (n.name || n.id).toLowerCase().includes(neuronFilter.toLowerCase())
  );
  const allVisibleSelected = visibleNeurons.length > 0 && visibleNeurons.every(n => selectedNeurons.has(n.name || n.id));
  const someVisibleSelected = visibleNeurons.some(n => selectedNeurons.has(n.name || n.id));

  const toggleNeuron = (name: string) => setSelectedNeurons(prev => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedNeurons(prev => {
        const next = new Set(prev);
        visibleNeurons.forEach(n => next.delete(n.name || n.id));
        return next;
      });
    } else {
      setSelectedNeurons(prev => {
        const next = new Set(prev);
        visibleNeurons.forEach(n => next.add(n.name || n.id));
        return next;
      });
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-background">
      {/* Page header */}
      <div className="px-[20px] py-[6px] border-b border-border flex items-center justify-between">
        <p className="font-mono font-bold text-[10px] text-[rgba(255,255,255,0.5)] uppercase">
          SERVICES
        </p>
      </div>

      {/* Filter toolbar */}
      <div className="border-b border-border px-[20px] py-[8px] flex items-center gap-[8px] shrink-0">
        <div className="flex items-center h-[34px]">
          <div className="bg-card border border-border px-[12px] h-full flex items-center justify-center border-r-0 rounded-l-[4px]">
            <p className="text-[12px] text-white">/</p>
          </div>
          <Input
            placeholder="Filter services..."
            value={neuronFilter}
            onChange={(e) => setNeuronFilter(e.target.value)}
            className="w-[260px] border-l-0 rounded-l-none h-full"
            containerClassName="h-full"
          />
        </div>
        <div className="ml-auto">
          {selectedNeurons.size > 0 && (
            <button
              onClick={() => { openPackagesPane(Array.from(selectedNeurons)); setSelectedNeurons(new Set()); }}
              className="flex items-center gap-[6px] px-[12px] h-[34px] bg-[rgba(248,129,169,0.1)] border border-[rgba(248,129,169,0.3)] rounded-[4px] text-brand hover:bg-[rgba(248,129,169,0.15)] transition-colors text-[11px] font-bold font-mono uppercase"
            >
              <Icon icon="solar:box-linear" className="text-base" />
              Packages · {selectedNeurons.size}
            </button>
          )}
        </div>
      </div>

      {/* Main content: services table + optional right pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Services table — left side */}
        <div className="flex-1 overflow-y-auto">
              {state.neurons.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <EmptyState icon="solar:server-minimalistic-linear" title="No services found" />
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10 bg-background">
                    <tr className="border-b border-border">
                      <th className="px-[16px] py-[8px] w-[40px]">
                        <button
                          onClick={toggleAllVisible}
                          className={`size-[14px] rounded-[3px] border flex items-center justify-center transition-colors ${
                            allVisibleSelected
                              ? 'bg-brand border-brand'
                              : someVisibleSelected
                                ? 'border-brand bg-[rgba(248,129,169,0.15)]'
                                : 'border-border hover:border-[rgba(248,129,169,0.5)]'
                          }`}
                        >
                          {allVisibleSelected && <Icon icon="solar:check-linear" className="text-black text-[8px]" />}
                          {someVisibleSelected && !allVisibleSelected && <span className="block w-[6px] h-[2px] bg-brand rounded-full" />}
                        </button>
                      </th>
                      <th className="text-left px-[20px] py-[8px]">
                        <span className="text-[10px] font-bold font-mono text-[rgba(255,255,255,0.4)] uppercase">Service</span>
                      </th>
                      <th className="text-left px-[16px] py-[8px] w-[100px]">
                        <span className="text-[10px] font-bold font-mono text-[rgba(255,255,255,0.4)] uppercase">Version</span>
                      </th>
                      <th className="text-left px-[16px] py-[8px] w-[260px]">
                        <span className="text-[10px] font-bold font-mono text-[rgba(255,255,255,0.4)] uppercase">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleNeurons.map(neuron => {
                      const name = neuron.name || neuron.id;
                      const isSelected = selectedNeurons.has(name);
                      return (
                        <tr
                          key={name}
                          className={`border-b border-border transition-colors ${isSelected ? 'bg-[rgba(248,129,169,0.04)]' : 'hover:bg-[rgba(255,255,255,0.02)]'}`}
                        >
                          <td className="px-[16px] py-[10px]">
                            <button
                              onClick={() => toggleNeuron(name)}
                              className={`size-[14px] rounded-[3px] border flex items-center justify-center transition-colors ${
                                isSelected
                                  ? 'bg-brand border-brand'
                                  : 'border-border hover:border-[rgba(248,129,169,0.5)]'
                              }`}
                            >
                              {isSelected && <Icon icon="solar:check-linear" className="text-black text-[8px]" />}
                            </button>
                          </td>
                          <td className="px-[20px] py-[10px]">
                            <div className="flex items-center gap-[8px]">
                              <div className={`size-[7px] rounded-full shrink-0 ${neuron.state === 1 ? 'bg-success' : neuron.state === 4 ? 'bg-warning' : 'bg-destructive'}`} />
                              <span className="text-[12px] font-bold font-mono text-white">{name}</span>
                            </div>
                          </td>
                          <td className="px-[16px] py-[10px]">
                            {neuron.latestBuild ? (
                              <span className="text-[10px] font-mono text-[rgba(255,255,255,0.4)] bg-card border border-border px-[6px] py-[2px]">
                                {neuron.latestBuild}
                              </span>
                            ) : (
                              <span className="text-[10px] text-[rgba(255,255,255,0.2)]">—</span>
                            )}
                          </td>
                          <td className="px-[16px] py-[10px]">
                            <div className="flex items-center gap-[6px]">
                              <Button
                                variant="secondary"
                                className="px-[10px] py-[5px] h-[28px] uppercase text-[9px] font-bold"
                                icon={<Icon icon="solar:document-text-linear" className="text-sm" />}
                                onClick={() => openDefinePane(name)}
                              >
                                Define
                              </Button>
                              <Button
                                variant="secondary"
                                className="px-[10px] py-[5px] h-[28px] uppercase text-[9px] font-bold"
                                icon={<Icon icon="solar:code-linear" className="text-sm" />}
                                onClick={() => openBuildPane(name)}
                              >
                                Build
                              </Button>
                              <Button
                                variant="secondary"
                                className="px-[10px] py-[5px] h-[28px] uppercase text-[9px] font-bold"
                                icon={<Icon icon="solar:cloud-upload-linear" className="text-sm" />}
                                onClick={() => openDeployPane(name)}
                              >
                                Deploy
                              </Button>
                              <Button
                                variant="secondary"
                                className="px-[10px] py-[5px] h-[28px] uppercase text-[9px] font-bold"
                                icon={<Icon icon="solar:box-linear" className="text-sm" />}
                                onClick={() => openPackagesPane([name])}
                              >
                                Packages
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
        </div>

        {/* Define pane */}
        {defineNeuron && (
          <RightPane label="Define" title={defineNeuron} onClose={() => setDefineNeuron(null)}>

            {/* Step: commits */}
            {defineStep === 'commits' && (
              <div className="flex-1 overflow-y-auto">
                {commitsLoading ? (
                  <div className="flex items-center gap-[10px] px-[16px] py-[20px]">
                    <Loader size={20} />
                    <span className="text-[11px] text-[rgba(255,255,255,0.5)]">Loading commits...</span>
                  </div>
                ) : commits.length === 0 ? (
                  <div className="px-[16px] py-[20px]">
                    <p className="text-[11px] text-[rgba(255,255,255,0.4)]">No commits found in define repo.</p>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {commits.map((c) => (
                      <button
                        key={c.sha}
                        onClick={() => { setSelectedCommit(c); setDefineStep('confirm'); }}
                        className="text-left px-[16px] py-[12px] border-b border-border hover:bg-card transition-colors group"
                      >
                        <div className="flex items-center gap-[8px] mb-[3px]">
                          <span className="text-[10px] font-bold font-mono text-brand">
                            {c.sha.substring(0, 7)}
                          </span>
                          <span className="text-[10px] text-white leading-tight">{c.message}</span>
                        </div>
                        <p className="text-[9px] text-[rgba(255,255,255,0.35)]">
                          {c.author} · {formatTimestamp(c.timestamp)}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step: confirm */}
            {defineStep === 'confirm' && selectedCommit && (
              <div className="flex-1 overflow-y-auto px-[16px] py-[20px]">
                <button
                  onClick={() => setDefineStep('commits')}
                  className="flex items-center gap-[6px] text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white mb-[20px] transition-colors"
                >
                  <Icon icon="solar:alt-arrow-left-linear" className="text-sm" />
                  Back to commits
                </button>

                <div className="bg-card border border-border rounded-[8px] p-[16px] mb-[20px]">
                  <p className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase font-bold font-mono mb-[10px]">
                    Selected Commit
                  </p>
                  <p className="text-[11px] text-white leading-[1.5] mb-[10px]">{selectedCommit.message}</p>
                  <div className="flex items-center gap-[8px] mb-[4px]">
                    <span className="text-[10px] font-bold font-mono text-brand">
                      {selectedCommit.sha.substring(0, 12)}
                    </span>
                  </div>
                  <p className="text-[9px] text-[rgba(255,255,255,0.4)]">
                    {selectedCommit.author} · {formatTimestamp(selectedCommit.timestamp)}
                  </p>
                </div>

                <Button
                  variant="primary"
                  className="w-full justify-center py-[10px]"
                  onClick={handleRunDefine}
                >
                  Run Define
                </Button>
              </div>
            )}

            {/* Step: running */}
            {defineStep === 'running' && (
              <div className="flex-1 overflow-y-auto px-[16px] py-[24px]">
                <div className="flex flex-col items-center gap-[16px]">
                  <div className="size-[48px] rounded-full bg-[rgba(248,129,169,0.1)] border border-[rgba(248,129,169,0.3)] flex items-center justify-center">
                    <Loader size={20} />
                  </div>
                  <div className="text-center">
                    <p className="text-[12px] font-bold text-white mb-[6px]">Running Define</p>
                    <p className="text-[10px] text-[rgba(255,255,255,0.5)] leading-[1.5] max-w-[280px] text-center">
                      {progressMsg}
                    </p>
                  </div>
                  {defineResult?.version && (
                    <div className="bg-card border border-border rounded-[6px] px-[12px] py-[6px]">
                      <span className="text-[9px] font-bold font-mono text-[rgba(255,255,255,0.5)]">
                        v{defineResult.version}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step: glass */}
            {defineStep === 'glass' && (
              <div className="flex-1 overflow-y-auto">
                {/* Error state */}
                {defineResult?.error && (
                  <div className="px-[16px] py-[16px] border-b border-border">
                    <div className="flex items-start gap-[8px] p-[10px] bg-[rgba(255,92,95,0.1)] border border-[rgba(255,92,95,0.3)] rounded-[6px]">
                      <Icon icon="solar:close-circle-linear" className="text-destructive text-sm shrink-0 mt-[1px]" />
                      <p className="text-[10px] text-[rgba(255,255,255,0.7)] leading-relaxed">{defineResult.error}</p>
                    </div>
                  </div>
                )}

                {/* Success header */}
                {!defineResult?.error && (
                  <div className="px-[16px] py-[14px] border-b border-border bg-[rgba(52,199,89,0.05)]">
                    <div className="flex items-center gap-[8px] mb-[4px]">
                      <Icon icon="solar:check-circle-linear" className="text-success text-base" />
                      <p className="text-[11px] font-bold text-white">Define Complete</p>
                    </div>
                    {defineResult?.version && (
                      <p className="text-[9px] text-[rgba(255,255,255,0.4)] font-mono">
                        {defineResult.definition} · v{defineResult.version}
                      </p>
                    )}
                  </div>
                )}

                {/* Glass loading */}
                {glassLoading && (
                  <div className="flex items-center gap-[10px] px-[16px] py-[16px]">
                    <Loader size={20} />
                    <span className="text-[10px] text-[rgba(255,255,255,0.4)]">Loading Glass...</span>
                  </div>
                )}

                {/* Glass result */}
                {!glassLoading && glassResult && (
                  <div className="px-[16px] py-[16px]">
                    {glassResult.title && (
                      <p className="text-[13px] font-bold text-white mb-[6px]">{glassResult.title}</p>
                    )}
                    {glassResult.summary && (
                      <p className="text-[11px] text-[rgba(255,255,255,0.55)] leading-[1.6] mb-[16px]">{glassResult.summary}</p>
                    )}

                    {/* Definition meta badges */}
                    {(glassResult.definition?.version || glassResult.definition?.releaseType) && (
                      <div className="flex gap-[6px] mb-[16px]">
                        {glassResult.definition.version && (
                          <span className="text-[9px] uppercase font-bold font-mono px-[6px] py-[2px] rounded bg-card border border-border text-[rgba(255,255,255,0.5)]">
                            {glassResult.definition.version}
                          </span>
                        )}
                        {glassResult.definition.releaseType && (
                          <span className="text-[9px] uppercase font-bold font-mono px-[6px] py-[2px] rounded bg-[rgba(248,129,169,0.1)] border border-[rgba(248,129,169,0.3)] text-brand">
                            {glassResult.definition.releaseType}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Artifacts vertical list */}
                    {glassResult.artifacts && glassResult.artifacts.length > 0 && (
                      <div>
                        <p className="text-[9px] uppercase font-bold text-[rgba(255,255,255,0.3)] mb-[10px] font-mono">
                          Artifacts ({glassResult.artifacts.length})
                        </p>
                        <div className="flex flex-col gap-[2px]">
                          {glassResult.artifacts.map((a, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-[10px] px-[10px] py-[9px] rounded-[6px] bg-background border border-border group"
                            >
                              {/* State dot */}
                              <span
                                className="size-[6px] rounded-full shrink-0"
                                style={{
                                  backgroundColor:
                                    a.state === 3 ? '#34C759'  // READY
                                    : a.state === 4 ? '#FF5C5F' // FAILED
                                    : a.state === 2 ? '#ff9500' // GENERATING
                                    : '#7a7a7a',                 // QUEUED/UNSPECIFIED
                                }}
                              />
                              {/* Artifact type */}
                              <span className="text-[10px] font-bold font-mono text-white flex-1 min-w-0 truncate">
                                {a.type}
                              </span>
                              {/* Extra (package name/import path) */}
                              {a.extra && (
                                <span className="text-[9px] text-[rgba(255,255,255,0.35)] max-w-[100px] truncate shrink-0">
                                  {a.extra}
                                </span>
                              )}
                              {/* Clickable link */}
                              {a.locationUri && (
                                <button
                                  onClick={() => Browser.OpenURL(a.locationUri)}
                                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[rgba(255,255,255,0.4)] hover:text-brand"
                                  title={a.locationUri}
                                >
                                  <Icon icon="solar:arrow-right-up-linear" className="text-sm" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* No glass data fallback */}
                    {(!glassResult.artifacts || glassResult.artifacts.length === 0) && !glassResult.title && (
                      <p className="text-[10px] text-[rgba(255,255,255,0.3)]">No Glass data available.</p>
                    )}
                  </div>
                )}

                {/* Glass not available (no result after loading) */}
                {!glassLoading && !glassResult && !defineResult?.error && (
                  <div className="px-[16px] py-[12px]">
                    <p className="text-[10px] text-[rgba(255,255,255,0.3)]">Glass data not available for this definition.</p>
                  </div>
                )}

                {/* Start over */}
                <div className="px-[16px] py-[12px] border-t border-border mt-[8px]">
                  <button
                    onClick={() => openDefinePane(defineNeuron!)}
                    className="text-[10px] text-[rgba(255,255,255,0.35)] hover:text-white transition-colors flex items-center gap-[6px]"
                  >
                    <Icon icon="solar:refresh-linear" className="text-sm" />
                    Run Define again
                  </button>
                </div>
              </div>
            )}
          </RightPane>
        )}

        {/* Deploy pane */}
        {deployNeuron && (
          <RightPane label="Deploy" title={deployNeuron} onClose={() => setDeployNeuron(null)} width="w-[400px]">
            {/* Step: loading */}
            {deployStep === 'loading' && (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-[12px]">
                  <Loader size={20} />
                  <p className="text-[11px] text-[rgba(255,255,255,0.4)]">Loading deployment info...</p>
                </div>
              </div>
            )}

            {/* Step: confirm — version picker + environment selection + options */}
            {deployStep === 'confirm' && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto">

                  {/* Version section */}
                  <div className="border-b border-border">
                    <div className="px-[16px] pt-[14px] pb-[8px]">
                      <p className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase font-bold font-mono">
                        Build Version
                      </p>
                    </div>
                    {deployVersions.length === 0 ? (
                      <div className="px-[16px] pb-[12px]">
                        <p className="text-[11px] text-[rgba(255,255,255,0.3)]">No built versions found.</p>
                      </div>
                    ) : (
                      <div className="max-h-[160px] overflow-y-auto">
                        {deployVersions.map((v) => {
                          const selected = deployVersion === v.version;
                          const ago = v.createTime > 0
                            ? formatRelativeTime(v.createTime)
                            : '';
                          return (
                            <button
                              key={v.version}
                              onClick={() => setDeployVersion(v.version)}
                              className={`w-full text-left px-[16px] py-[9px] border-b border-border flex items-center gap-[10px] transition-colors ${
                                selected ? 'bg-[rgba(248,129,169,0.08)]' : 'hover:bg-[rgba(255,255,255,0.02)]'
                              }`}
                            >
                              <span className={`size-[14px] rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                                selected ? 'bg-brand border-brand' : 'border-border'
                              }`}>
                                {selected && <Icon icon="solar:check-linear" className="text-brand-foreground text-[9px]" />}
                              </span>
                              <span className={`text-[12px] font-bold font-mono ${selected ? 'text-brand' : 'text-white'}`}>
                                {v.version}
                              </span>
                              {ago && (
                                <span className="ml-auto text-[9px] text-[rgba(255,255,255,0.3)] shrink-0">{ago}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Environments section */}
                  <div className="px-[16px] pt-[12px] pb-[4px]">
                    <p className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase font-bold font-mono mb-[8px]">
                      Target Environments
                    </p>
                  </div>
                  {deployEnvs.length === 0 ? (
                    <div className="px-[16px] pb-[12px]">
                      <p className="text-[11px] text-[rgba(255,255,255,0.3)]">No environments found.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      {deployEnvs.map((env) => {
                        const selected = selectedDeployEnvs.includes(env.name);
                        const isCurrent = env.currentVersion === deployVersion;
                        const hasDeployment = !!env.currentVersion;
                        return (
                          <button
                            key={env.name}
                            onClick={() => setSelectedDeployEnvs(prev =>
                              selected ? prev.filter(e => e !== env.name) : [...prev, env.name]
                            )}
                            className={`text-left px-[16px] py-[11px] border-b border-border transition-colors flex items-center gap-[10px] ${
                              selected ? 'bg-[rgba(248,129,169,0.05)]' : 'hover:bg-[rgba(255,255,255,0.02)]'
                            }`}
                          >
                            {/* Checkbox */}
                            <span className={`size-[14px] rounded-[3px] border flex items-center justify-center shrink-0 transition-colors ${
                              selected ? 'bg-brand border-brand' : 'border-border'
                            }`}>
                              {selected && <Icon icon="solar:check-linear" className="text-brand-foreground text-[9px]" />}
                            </span>

                            {/* Env name */}
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-medium text-white leading-tight">
                                {env.displayName || env.name}
                              </p>
                            </div>

                            {/* Current deployment status */}
                            {hasDeployment ? (
                              isCurrent ? (
                                <span className="text-[9px] font-bold font-mono text-success shrink-0">
                                  {env.currentVersion} ✓
                                </span>
                              ) : (
                                <div className="flex items-center gap-[4px] shrink-0">
                                  <span className="text-[9px] font-mono text-[rgba(255,255,255,0.3)] line-through">
                                    {env.currentVersion}
                                  </span>
                                  <Icon icon="solar:alt-arrow-right-linear" className="text-[rgba(255,255,255,0.25)] text-[10px]" />
                                  <span className="text-[9px] font-bold font-mono text-brand">
                                    {deployVersion || '?'}
                                  </span>
                                </div>
                              )
                            ) : (
                              <span className="text-[9px] text-[rgba(255,255,255,0.25)] shrink-0">not deployed</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Options */}
                  <div className="px-[16px] pt-[14px] pb-[16px] border-t border-border mt-[4px]">
                    <p className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase font-bold font-mono mb-[10px]">
                      Options
                    </p>
                    <div className="flex flex-col gap-[8px]">
                      <label className="flex items-center gap-[8px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={deployPlanOnly}
                          onChange={(e) => setDeployPlanOnly(e.target.checked)}
                          className="accent-brand"
                        />
                        <div>
                          <span className="text-[10px] text-[rgba(255,255,255,0.7)]">Plan only</span>
                          <span className="text-[9px] text-[rgba(255,255,255,0.3)] ml-[6px]">terraform plan, no apply</span>
                        </div>
                      </label>
                      <label className="flex items-center gap-[8px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={deployBeta}
                          onChange={(e) => setDeployBeta(e.target.checked)}
                          className="accent-brand"
                        />
                        <div>
                          <span className="text-[10px] text-[rgba(255,255,255,0.7)]">Beta</span>
                          <span className="text-[9px] text-[rgba(255,255,255,0.3)] ml-[6px]">sets ALIS_BETA_VERSION</span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="shrink-0 px-[14px] py-[10px] border-t border-border">
                  <Button
                    variant="primary"
                    className="w-full justify-center py-[10px]"
                    disabled={!deployVersion || selectedDeployEnvs.length === 0}
                    onClick={handleRunDeploy}
                  >
                    {deployPlanOnly ? 'Run Plan' : 'Run Deploy'} · {selectedDeployEnvs.length} env{selectedDeployEnvs.length !== 1 ? 's' : ''}
                  </Button>
                </div>
              </div>
            )}

            {/* Steps: running + result share the terminal */}
            {(deployStep === 'running' || deployStep === 'result') && (
              <div className="flex-1 flex flex-col min-h-0">

                {/* Running header */}
                {deployStep === 'running' && (
                  <div className="shrink-0 flex items-center gap-[10px] px-[14px] py-[10px] border-b border-border">
                    <Loader size={20} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-white leading-tight">
                        {deployPlanOnly ? 'Planning' : 'Deploying'} · {deployVersion}
                      </p>
                      <p className="text-[9px] text-[rgba(255,255,255,0.4)] truncate leading-tight mt-[1px]">{deployProgressMsg}</p>
                    </div>
                  </div>
                )}

                {/* Result header */}
                {deployStep === 'result' && (
                  <div className={`shrink-0 px-[14px] py-[10px] border-b border-border ${
                    deployResult?.error ? 'bg-[rgba(255,92,95,0.05)]' : 'bg-[rgba(52,199,89,0.05)]'
                  }`}>
                    {deployResult?.error ? (
                      <div className="flex items-start gap-[8px]">
                        <Icon icon="solar:close-circle-linear" className="text-destructive text-sm shrink-0 mt-[1px]" />
                        <p className="text-[10px] text-[rgba(255,255,255,0.7)] leading-relaxed">{deployResult.error}</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-[8px]">
                        <Icon icon="solar:check-circle-linear" className="text-success text-sm shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-white leading-tight">
                            {deployPlanOnly ? 'Plan Complete' : 'Deploy Complete'}
                          </p>
                          {(deployResult?.version || deployVersion) && (
                            <p className="text-[9px] text-[rgba(255,255,255,0.4)] font-mono truncate leading-tight mt-[1px]">
                              {deployResult?.version || deployVersion}
                            </p>
                          )}
                        </div>
                        {deployResult?.deployments?.[0]?.logsUrl && (
                          <button
                            onClick={() => Browser.OpenURL(deployResult!.deployments[0].logsUrl)}
                            className="ml-auto shrink-0 text-[rgba(255,255,255,0.3)] hover:text-brand transition-colors"
                            title="Open in browser"
                          >
                            <Icon icon="solar:arrow-right-up-linear" className="text-sm" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Terminal */}
                <BuildTerminal ref={deployTermRef} className="flex-1 min-h-0" />

                {/* Footer: run again */}
                {deployStep === 'result' && (
                  <div className="shrink-0 px-[14px] py-[10px] border-t border-border">
                    <button
                      onClick={() => openDeployPane(deployNeuron!)}
                      className="text-[10px] text-[rgba(255,255,255,0.35)] hover:text-white transition-colors flex items-center gap-[6px]"
                    >
                      <Icon icon="solar:refresh-linear" className="text-sm" />
                      Run Deploy again
                    </button>
                  </div>
                )}
              </div>
            )}
          </RightPane>
        )}

        {/* Build pane */}
        {buildNeuron && (
          <RightPane label="Build" title={buildNeuron} onClose={() => setBuildNeuron(null)}>

            {/* Step: commits */}
            {buildStep === 'commits' && (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Branch selector */}
                <div className="shrink-0 flex items-center gap-[8px] px-[14px] py-[9px] border-b border-border">
                  <Icon icon="solar:branch-linear" className="text-[rgba(255,255,255,0.35)] text-sm shrink-0" />
                  <div className="relative flex-1 min-w-0">
                    <select
                      value={buildBranch}
                      onChange={(e) => handleBranchChange(e.target.value)}
                      className="w-full appearance-none bg-transparent text-[10px] text-white font-mono outline-none cursor-pointer pr-[16px]"
                    >
                      {buildBranches.map((b) => (
                        <option key={b} value={b} className="bg-background text-white">{b}</option>
                      ))}
                    </select>
                    <Icon icon="solar:alt-arrow-down-linear" className="absolute right-0 top-1/2 -translate-y-1/2 text-[rgba(255,255,255,0.35)] text-xs pointer-events-none" />
                  </div>
                </div>

                {/* Commit list */}
                <div className="flex-1 overflow-y-auto">
                  {buildCommitsLoading ? (
                    <div className="flex items-center gap-[10px] px-[16px] py-[20px]">
                      <Loader size={20} />
                      <span className="text-[11px] text-[rgba(255,255,255,0.5)]">Loading commits...</span>
                    </div>
                  ) : buildCommits.length === 0 ? (
                    <div className="px-[16px] py-[20px]">
                      <p className="text-[11px] text-[rgba(255,255,255,0.4)]">No commits found for this branch.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      {buildCommits.map((c) => (
                        <button
                          key={c.sha}
                          onClick={() => { setSelectedBuildCommit(c); setBuildStep('confirm'); }}
                          className="text-left px-[16px] py-[12px] border-b border-border hover:bg-card transition-colors"
                        >
                          <div className="flex items-center gap-[8px] mb-[3px]">
                            <span className="text-[10px] font-bold font-mono text-brand">
                              {c.sha.substring(0, 7)}
                            </span>
                            <span className="text-[10px] text-white leading-tight truncate">{c.message}</span>
                          </div>
                          <p className="text-[9px] text-[rgba(255,255,255,0.35)]">
                            {c.author} · {formatTimestamp(c.timestamp)}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step: confirm */}
            {buildStep === 'confirm' && selectedBuildCommit && (
              <div className="flex-1 overflow-y-auto px-[16px] py-[20px]">
                <button
                  onClick={() => setBuildStep('commits')}
                  className="flex items-center gap-[6px] text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white mb-[20px] transition-colors"
                >
                  <Icon icon="solar:alt-arrow-left-linear" className="text-sm" />
                  Back to commits
                </button>

                {/* Selected commit */}
                <div className="bg-card border border-border rounded-[8px] p-[14px] mb-[20px]">
                  <p className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase font-bold font-mono mb-[8px]">
                    {buildBranch} · {selectedBuildCommit.sha.substring(0, 7)}
                  </p>
                  <p className="text-[11px] text-white leading-[1.5] mb-[8px]">{selectedBuildCommit.message}</p>
                  <p className="text-[9px] text-[rgba(255,255,255,0.4)]">
                    {selectedBuildCommit.author} · {formatTimestamp(selectedBuildCommit.timestamp)}
                  </p>
                </div>

                {/* Build mode selector */}
                <p className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase font-bold font-mono mb-[8px]">
                  Action
                </p>
                <div className="flex flex-col gap-[2px] mb-[20px]">
                  {([
                    { mode: 'cloud' as BuildMode, icon: 'solar:cloud-bolt-linear', label: 'Cloud Build', soon: false },
                    { mode: 'local' as BuildMode, icon: 'solar:laptop-linear', label: 'Build Locally', soon: false },
                    { mode: 'deploy' as BuildMode, icon: 'solar:rocket-2-linear', label: 'Build and Deploy', soon: false },
                  ]).map(({ mode, icon, label, soon }) => (
                    <button
                      key={mode}
                      onClick={() => setBuildMode(mode)}
                      className={`flex items-center gap-[10px] px-[12px] py-[10px] rounded-[6px] border transition-colors text-left ${
                        buildMode === mode
                          ? 'bg-[rgba(248,129,169,0.08)] border-[rgba(248,129,169,0.35)] text-white'
                          : 'bg-background border-border text-[rgba(255,255,255,0.5)] hover:border-border hover:text-[rgba(255,255,255,0.7)]'
                      }`}
                    >
                      <span className={`size-[6px] rounded-full shrink-0 ${buildMode === mode ? 'bg-brand' : 'bg-accent'}`} />
                      <Icon icon={icon} className="text-sm shrink-0" />
                      <span className="text-[11px] font-medium flex-1">{label}</span>
                      {soon && (
                        <span className="text-[8px] font-bold uppercase font-mono text-[rgba(255,255,255,0.25)] border border-border rounded px-[4px] py-[1px]">
                          soon
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <Button
                  variant="primary"
                  className="w-full justify-center py-[10px]"
                  onClick={handleRunBuild}
                >
                  {buildMode === 'cloud' ? 'Run Cloud Build' : buildMode === 'local' ? 'Build Locally' : 'Build and Deploy'}
                </Button>
              </div>
            )}

            {/* Steps: running + result share the terminal so logs persist */}
            {(buildStep === 'running' || buildStep === 'result') && (
              <div className="flex-1 flex flex-col min-h-0">

                {/* Running header */}
                {buildStep === 'running' && (
                  <div className="shrink-0 flex items-center gap-[10px] px-[14px] py-[10px] border-b border-border">
                    <Loader size={20} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-white leading-tight">Running Build</p>
                      <p className="text-[9px] text-[rgba(255,255,255,0.4)] truncate leading-tight mt-[1px]">{buildProgressMsg}</p>
                    </div>
                    {buildResult?.version && (
                      <span className="text-[9px] font-bold font-mono text-[rgba(255,255,255,0.35)] shrink-0">
                        {buildResult.version}
                      </span>
                    )}
                  </div>
                )}

                {/* Result header */}
                {buildStep === 'result' && (
                  <div className={`shrink-0 px-[14px] py-[10px] border-b border-border ${
                    buildResult?.stub ? 'bg-[rgba(255,159,10,0.05)]'
                    : buildResult?.error ? 'bg-[rgba(255,92,95,0.05)]'
                    : 'bg-[rgba(52,199,89,0.05)]'
                  }`}>
                    {buildResult?.stub ? (
                      <div className="flex items-center gap-[8px]">
                        <Icon icon="solar:clock-circle-linear" className="text-warning text-sm shrink-0" />
                        <p className="text-[10px] font-bold text-[rgba(255,255,255,0.7)] leading-tight">
                          Build and Deploy — Coming Soon
                        </p>
                      </div>
                    ) : buildResult?.error ? (
                      <div className="flex items-start gap-[8px]">
                        <Icon icon="solar:close-circle-linear" className="text-destructive text-sm shrink-0 mt-[1px]" />
                        <p className="text-[10px] text-[rgba(255,255,255,0.7)] leading-relaxed">{buildResult.error}</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-[8px]">
                        <Icon icon="solar:check-circle-linear" className="text-success text-sm shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-white leading-tight">Build Complete</p>
                          {(buildResult?.neuronVersion || buildResult?.version) && (
                            <p className="text-[9px] text-[rgba(255,255,255,0.4)] font-mono truncate leading-tight mt-[1px]">
                              {buildResult.neuronVersion || buildResult.version}
                            </p>
                          )}
                        </div>
                        {buildResult?.logsUrl && (
                          <button
                            onClick={() => Browser.OpenURL(buildResult!.logsUrl)}
                            className="ml-auto shrink-0 text-[rgba(255,255,255,0.3)] hover:text-brand transition-colors"
                            title="Open in browser"
                          >
                            <Icon icon="solar:arrow-right-up-linear" className="text-sm" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Terminal — fills remaining space, persists across running→result */}
                <BuildTerminal ref={termRef} className="flex-1 min-h-0" />

                {/* Footer: run again */}
                {buildStep === 'result' && (
                  <div className="shrink-0 px-[14px] py-[10px] border-t border-border">
                    <button
                      onClick={() => openBuildPane(buildNeuron!)}
                      className="text-[10px] text-[rgba(255,255,255,0.35)] hover:text-white transition-colors flex items-center gap-[6px]"
                    >
                      <Icon icon="solar:refresh-linear" className="text-sm" />
                      Run Build again
                    </button>
                  </div>
                )}
              </div>
            )}
          </RightPane>
        )}

        {/* Packages pane */}
        {packagesNeuron && (
          <RightPane label="Packages" title={packagesNeuron} onClose={() => { setPackagesNeuron(null); setSelectedNeurons(new Set()); }}>
            {/* Step: scan */}
            {packagesStep === 'scan' && (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-[12px]">
                  <Loader size={20} />
                  <p className="text-[11px] text-[rgba(255,255,255,0.4)]">Scanning packages...</p>
                </div>
              </div>
            )}

            {/* Step: select-action */}
            {packagesStep === 'select-action' && (
              <div className="flex-1 overflow-y-auto px-[16px] py-[16px]">
                {packagesError && (
                  <div className="flex items-start gap-[8px] p-[10px] bg-[rgba(255,92,95,0.1)] border border-[rgba(255,92,95,0.3)] rounded-[6px] mb-[16px]">
                    <Icon icon="solar:danger-triangle-linear" className="text-destructive text-sm shrink-0 mt-[1px]" />
                    <p className="text-[10px] text-[rgba(255,255,255,0.7)] leading-relaxed">{packagesError}</p>
                  </div>
                )}
                <p className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase font-bold font-mono mb-[10px]">
                  Action
                </p>
                <div className="flex flex-col gap-[2px] mb-[20px]">
                  {([
                    { value: 'upgrade_defined', label: 'Upgrade Defined', desc: 'Upgrade packages generated by Define' },
                    { value: 'upgrade', label: 'Upgrade All', desc: 'Upgrade all specified packages' },
                    { value: 'install', label: 'Install', desc: 'Install all relevant packages' },
                    { value: 'add', label: 'Add', desc: 'Add packages from your Define steps' },
                  ] as const).map(({ value, label, desc }) => (
                    <button
                      key={value}
                      onClick={() => setPackagesAction(value)}
                      className={`flex items-center gap-[10px] px-[12px] py-[10px] rounded-[6px] border transition-colors text-left ${
                        packagesAction === value
                          ? 'bg-[rgba(248,129,169,0.08)] border-[rgba(248,129,169,0.35)] text-white'
                          : 'bg-background border-border text-[rgba(255,255,255,0.5)] hover:border-border hover:text-[rgba(255,255,255,0.7)]'
                      }`}
                    >
                      <span className={`size-[6px] rounded-full shrink-0 ${packagesAction === value ? 'bg-brand' : 'bg-accent'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium">{label}</p>
                        <p className="text-[9px] text-[rgba(255,255,255,0.35)] leading-snug mt-[1px]">{desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <Button
                  variant="primary"
                  className="w-full justify-center py-[10px]"
                  disabled={packageScripts.length === 0}
                  onClick={() => packageScripts.length === 1 ? handleRunPackages() : setPackagesStep('select-folders')}
                >
                  {packageScripts.length === 1 ? 'Run' : 'Next →'}
                </Button>
                {packageScripts.length === 0 && !packagesError && (
                  <p className="text-[10px] text-[rgba(255,255,255,0.3)] text-center mt-[12px]">No package scripts available</p>
                )}
              </div>
            )}

            {/* Step: select-folders */}
            {packagesStep === 'select-folders' && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto">
                  <div className="px-[16px] pt-[14px] pb-[8px]">
                    <button
                      onClick={() => setPackagesStep('select-action')}
                      className="flex items-center gap-[6px] text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white mb-[12px] transition-colors"
                    >
                      <Icon icon="solar:alt-arrow-left-linear" className="text-sm" />
                      Back
                    </button>
                    <p className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase font-bold font-mono">
                      Select Folders
                    </p>
                  </div>
                  <div className="flex flex-col">
                    {packageScripts.map((s) => {
                      const checked = selectedScripts.has(s.workDir);
                      return (
                        <button
                          key={s.workDir}
                          onClick={() => setSelectedScripts(prev => {
                            const next = new Set(prev);
                            if (next.has(s.workDir)) next.delete(s.workDir);
                            else next.add(s.workDir);
                            return next;
                          })}
                          className={`text-left px-[16px] py-[10px] border-b border-border flex items-center gap-[10px] transition-colors ${
                            checked ? 'bg-[rgba(248,129,169,0.04)]' : 'hover:bg-[rgba(255,255,255,0.02)]'
                          }`}
                        >
                          <span className={`size-[14px] rounded-[3px] border flex items-center justify-center shrink-0 transition-colors ${
                            checked ? 'bg-brand border-brand' : 'border-border'
                          }`}>
                            {checked && <Icon icon="solar:check-linear" className="text-brand-foreground text-[9px]" />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium text-white truncate">
                              {s.name || s.workDir.split('/').slice(-2).join('/')}
                            </p>
                            <p className="text-[9px] text-[rgba(255,255,255,0.35)] font-mono uppercase leading-snug mt-[1px]">
                              {s.lang}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="shrink-0 px-[14px] py-[10px] border-t border-border">
                  <Button
                    variant="primary"
                    className="w-full justify-center py-[10px]"
                    disabled={selectedScripts.size === 0}
                    onClick={handleRunPackages}
                  >
                    Run · {selectedScripts.size} folder{selectedScripts.size !== 1 ? 's' : ''}
                  </Button>
                </div>
              </div>
            )}

            {/* Step: venv-setup */}
            {packagesStep === 'venv-setup' && (
              <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-[16px] py-[16px]">
                <div className="flex items-start gap-[10px] p-[12px] bg-[rgba(248,129,169,0.08)] border border-[rgba(248,129,169,0.25)] rounded-[6px] mb-[20px]">
                  <Icon icon="solar:info-circle-linear" className="text-brand text-base shrink-0 mt-[1px]" />
                  <div>
                    <p className="text-[11px] font-medium text-white leading-snug">Python virtual environment not found</p>
                    <p className="text-[10px] text-[rgba(255,255,255,0.5)] leading-relaxed mt-[4px]">
                      A <code className="font-mono text-brand">.venv</code> is required at the product build root before running Python package scripts.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-[8px]">
                  <Button
                    variant="primary"
                    className="w-full justify-center py-[10px]"
                    onClick={() => doRunScripts(true)}
                  >
                    Create .venv &amp; Run
                  </Button>
                  <button
                    onClick={() => doRunScripts(false)}
                    className="w-full py-[9px] text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white transition-colors font-mono uppercase"
                  >
                    Skip &amp; Run Anyway
                  </button>
                  <button
                    onClick={() => setPackagesStep('select-folders')}
                    className="w-full py-[9px] text-[10px] text-[rgba(255,255,255,0.3)] hover:text-white transition-colors font-mono"
                  >
                    ← Back
                  </button>
                </div>
              </div>
            )}

            {/* Step: preparing */}
            {packagesStep === 'preparing' && (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-[12px]">
                  <Loader size={20} />
                  <p className="text-[11px] text-[rgba(255,255,255,0.4)]">Starting scripts...</p>
                </div>
              </div>
            )}

            {/* Step: running */}
            {packagesStep === 'running' && (
              <div className="flex-1 overflow-y-auto px-[16px] py-[16px]">
                <p className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase font-bold font-mono mb-[12px]">
                  Running · {packageSessions.filter(s => !s.done).length} active
                </p>
                <div className="flex flex-col gap-[6px] mb-[16px]">
                  {packageSessions.map(s => (
                    <div key={s.runID} className="flex items-center gap-[8px] px-[10px] py-[8px] bg-background border border-border rounded-[6px]">
                      {s.error ? (
                        <Icon icon="solar:close-circle-bold" className="text-red-400 text-sm shrink-0" />
                      ) : s.done ? (
                        <Icon icon="solar:check-circle-bold" className="text-green-400 text-sm shrink-0" />
                      ) : (
                        <span className="w-[8px] h-[8px] rounded-full bg-brand animate-pulse shrink-0" />
                      )}
                      <span className="text-[10px] text-white font-mono flex-1 truncate min-w-0">
                        {s.title}
                      </span>
                      <span className="text-[9px] text-[rgba(255,255,255,0.3)] shrink-0 uppercase">{s.lang}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[9px] text-[rgba(255,255,255,0.3)] text-center">
                  Output in the terminal pane ↓
                </p>
              </div>
            )}
          </RightPane>
        )}
      </div>
    </div>
  );
}
