import { Loader } from '../components/Loader';
import { EmptyState } from '../components/EmptyState';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from '@iconify/react';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Table } from '../components/Table';
import { BuildTerminal, type BuildTerminalHandle } from '../components/BuildTerminal';
import { RightPane } from '../components/RightPane';
import { Tab } from '../components/Tab';
import { useWorkspace } from '../stores/workspace';
import * as BuildService from '../../../bindings/alis-hub-v3/buildservice';
import * as DeployService from '../../../bindings/alis-hub-v3/deployservice';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';
import { Browser } from '@wailsio/runtime';

type BuildStep = 'commits' | 'confirm' | 'running' | 'result';

interface DefineCommit {
  sha: string;
  message: string;
  author: string;
  authorEmail: string;
  timestamp: number;
}

interface BuildResult {
  operationName: string;
  version: string;
  neuronVersion: string;
  logsUrl: string;
  notes: string;
  done: boolean;
  error?: string;
}

interface VersionEntry {
  version: string;
  createTime: number;
  buildCommit: string;
  logsUrl: string;
  state: number; // 1=BUILT, 2=RETAGGED, 3=BUILDING, 4=FAILED
}

interface DeployResultState {
  operationName: string;
  version: string;
  deployments: { logsUrl: string }[];
  notes: string;
  done: boolean;
  error?: string;
}

type DeployStep = 'select-env' | 'running' | 'result';

function formatRelativeTime(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDate(unixSeconds: number): string {
  if (!unixSeconds) return '—';
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function parseNeuron(name: string) {
  const mDot = name.match(/^(.+)\.(v\d+)$/);
  if (mDot) return { id: mDot[1], version: mDot[2] };
  const mHyphen = name.match(/^(.+)-(v\d+)$/);
  if (mHyphen) return { id: mHyphen[1], version: mHyphen[2] };
  return { id: name, version: 'v1' };
}

function buildGCSRUrl(remoteUri: string, sha: string): string | null {
  const m = remoteUri.match(/source\.developers\.google\.com\/p\/([^/]+)\/r\/([^/]+)/);
  if (!m) return null;
  return `https://source.cloud.google.com/${m[1]}/${m[2]}/+/${sha}`;
}

export function BuildsPage() {
  const { state, setNeurons, setActiveNeurons } = useWorkspace();

  // Derive selected neuron from workspace (sidebar controls selection)
  const activeNeuron = state.activeNeuronIds[0] ?? '';

  // Versions table
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');

  // Build flow state (right panel)
  const [buildStep, setBuildStep] = useState<BuildStep | null>(null);
  const [buildBranch, setBuildBranch] = useState('master');
  const [buildBranches, setBuildBranches] = useState<string[]>(['master']);
  const [buildCommits, setBuildCommits] = useState<DefineCommit[]>([]);
  const [buildCommitsLoading, setBuildCommitsLoading] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<DefineCommit | null>(null);
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null);
  const [buildProgressMsg, setBuildProgressMsg] = useState('Starting...');

  const termRef = useRef<BuildTerminalHandle>(null);
  const logOffsetRef = useRef<number>(0);

  // Inline log viewer state
  const [logsContent, setLogsContent] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  // Deployed environments per version (keyed by "neuronId::version")
  const [deployedEnvsMap, setDeployedEnvsMap] = useState<Map<string, string[]>>(new Map());

  // Changelog between versions
  const [changelogCommits, setChangelogCommits] = useState<DefineCommit[]>([]);
  const [changelogLoading, setChangelogLoading] = useState(false);

  // Detail pane tab
  const [detailTab, setDetailTab] = useState<'details' | 'logs' | 'commits'>('details');

  // Repo remote URI for GCSR links (product-level)
  const [repoRemoteUri, setRepoRemoteUri] = useState<string | null>(null);

  // Deploy flow state (right panel)
  const [deployStep, setDeployStep] = useState<DeployStep | null>(null);
  const [deploySelectedEnvs, setDeploySelectedEnvs] = useState<string[]>([]);
  const [deployResult, setDeployResult] = useState<DeployResultState | null>(null);
  const [deployProgressMsg, setDeployProgressMsg] = useState('Starting...');
  const deployTermRef = useRef<BuildTerminalHandle>(null);
  const deployLogOffsetRef = useRef<number>(0);

  // Load neurons and build deployed-envs map
  useEffect(() => {
    if (!state.organisation || !state.product) return;
    ProductService.GetServicesOverview(state.organisation, state.product)
      .then((overview) => {
        if (state.neurons.length === 0 && overview?.neurons?.length) {
          const loaded = overview.neurons.map(n => ({
            id: n.id, name: n.id, type: 2, state: n.state, latestBuild: n.version, envs: [],
          }));
          setNeurons(loaded);
          if (!state.activeNeuronIds.length) setActiveNeurons([loaded[0].name]);
        } else if (!state.activeNeuronIds.length && state.neurons.length > 0) {
          setActiveNeurons([state.neurons[0].name]);
        }
        // Build version → env display name map
        const map = new Map<string, string[]>();
        for (const env of (overview?.environments ?? [])) {
          for (const dep of (env.deployments ?? [])) {
            const key = `${dep.neuronId}::${dep.version}`;
            const existing = map.get(key) ?? [];
            if (!existing.includes(env.displayName)) existing.push(env.displayName);
            map.set(key, existing);
          }
        }
        setDeployedEnvsMap(map);
      })
      .catch(() => {});
  }, [state.organisation, state.product, state.neurons.length]);

  // Load repo remote URI for GCSR links (once per product)
  useEffect(() => {
    if (!state.organisation || !state.product) return;
    setRepoRemoteUri(null);
    ProductService.GetProductOverview(state.organisation, state.product)
      .then((overview) => setRepoRemoteUri(overview?.gitRepo?.remoteUri ?? ''))
      .catch(() => setRepoRemoteUri(''));
  }, [state.organisation, state.product]);

  // Load versions and reset build state whenever active neuron changes
  useEffect(() => {
    setBuildStep(null);
    setBuildResult(null);
    setSelectedCommit(null);
    setBuildCommits([]);
    setActiveVersionId(null);
    logOffsetRef.current = 0;
    setDeployStep(null);
    setDeployResult(null);
    setDeploySelectedEnvs([]);
    deployLogOffsetRef.current = 0;
    setLogsContent(null);
    setLogsError(null);
    setChangelogCommits([]);
    setChangelogLoading(false);
    setDetailTab('details');

    if (!activeNeuron || !state.organisation || !state.product) return;
    const neuronResource = `organisations/${state.organisation}/products/${state.product}/neurons/${activeNeuron}`;
    setVersionsLoading(true);
    setVersions([]);
    DeployService.ListNeuronVersions(neuronResource)
      .then((res) => {
        const vs = (res ?? [])
          .filter(v => v !== null)
          .map(v => ({ version: v!.version, createTime: v!.createTime, buildCommit: v!.buildCommit, logsUrl: v!.logsUrl, state: v!.state ?? 0 }));
        setVersions(vs);
      })
      .catch(() => setVersions([]))
      .finally(() => setVersionsLoading(false));
  }, [activeNeuron, state.organisation, state.product]);

  const openBuildFlow = useCallback(async () => {
    if (!activeNeuron || !state.organisation || !state.product) return;
    setBuildStep('commits');
    setBuildCommits([]);
    setSelectedCommit(null);
    setBuildResult(null);
    setBuildBranch('master');
    logOffsetRef.current = 0;
    const parsed = parseNeuron(activeNeuron);
    setBuildCommitsLoading(true);
    const [, commitsResult] = await Promise.allSettled([
      BuildService.GetBuildBranches(state.organisation, state.product).then(
        b => { if (b?.length) setBuildBranches(b as string[]); }
      ),
      BuildService.GetBuildCommits(
        state.organisation, state.product, parsed.id, parsed.version, 'master', 30
      ),
    ]);
    setBuildCommitsLoading(false);
    if (commitsResult.status === 'fulfilled' && commitsResult.value) {
      setBuildCommits(commitsResult.value as DefineCommit[]);
    }
  }, [activeNeuron, state.organisation, state.product]);

  const handleBranchChange = useCallback(async (branch: string) => {
    if (!activeNeuron) return;
    setBuildBranch(branch);
    setSelectedCommit(null);
    setBuildCommitsLoading(true);
    setBuildCommits([]);
    const parsed = parseNeuron(activeNeuron);
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
  }, [activeNeuron, state.organisation, state.product]);

  const handleRunBuild = async () => {
    if (!activeNeuron || !selectedCommit) return;
    const neuronResource = `organisations/${state.organisation}/products/${state.product}/neurons/${activeNeuron}`;
    setBuildStep('running');
    setBuildProgressMsg('Starting Build...');
    termRef.current?.clear();
    logOffsetRef.current = 0;
    try {
      const result = await BuildService.RunBuild(neuronResource, selectedCommit.sha);
      setBuildResult(result as BuildResult);
    } catch (e: any) {
      setBuildProgressMsg(`Failed: ${e?.message ?? e}`);
      setBuildStep('result');
      setBuildResult({ operationName: '', version: '', neuronVersion: '', logsUrl: '', notes: '', done: true, error: e?.message ?? 'Failed to start build' });
    }
  };

  const openDeployFlow = useCallback(() => {
    setBuildStep(null);
    setBuildResult(null);
    setDeployStep('select-env');
    setDeploySelectedEnvs([]);
    setDeployResult(null);
    deployLogOffsetRef.current = 0;
  }, []);

  const handleRunDeploy = async () => {
    if (!activeNeuron || !activeVersionId || deploySelectedEnvs.length === 0) return;
    const neuronResource = `organisations/${state.organisation}/products/${state.product}/neurons/${activeNeuron}`;
    setDeployStep('running');
    setDeployProgressMsg('Starting...');
    deployTermRef.current?.clear();
    deployLogOffsetRef.current = 0;
    try {
      const result = await DeployService.RunDeploy(neuronResource, activeVersionId, deploySelectedEnvs, false, false);
      setDeployResult(result as DeployResultState);
    } catch (e: any) {
      setDeployStep('result');
      setDeployResult({ operationName: '', version: '', deployments: [], notes: '', done: true, error: e?.message ?? 'Failed to start deploy' });
    }
  };

  // Poll deploy operation
  useEffect(() => {
    if (!deployResult || deployResult.done || deployStep !== 'running') return;
    const interval = setInterval(async () => {
      try {
        const result = await DeployService.PollDeployOperation(deployResult.operationName);
        setDeployResult(result as DeployResultState);
        if (result?.done) {
          clearInterval(interval);
          setDeployStep('result');
        } else if (result?.notes) {
          setDeployProgressMsg(result.notes);
        }
      } catch {
        clearInterval(interval);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [deployResult?.operationName, deployResult?.done, deployStep]);

  // Stream deploy logs
  useEffect(() => {
    if (!deployResult?.deployments?.[0]?.logsUrl) return;
    const logsUrl = deployResult.deployments[0].logsUrl;
    const fetchLogs = async () => {
      try {
        const chunk = await DeployService.FetchDeployLogs(logsUrl, deployLogOffsetRef.current);
        if (chunk?.content) {
          deployTermRef.current?.write(chunk.content);
          deployLogOffsetRef.current = chunk.nextOffset;
        }
      } catch {}
    };
    if (deployResult.done) {
      fetchLogs();
      return;
    }
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [deployResult?.deployments?.[0]?.logsUrl, deployResult?.done]);

  // Poll build operation
  useEffect(() => {
    if (!buildResult || buildResult.done || buildStep !== 'running') return;
    const neuronResource = `organisations/${state.organisation}/products/${state.product}/neurons/${activeNeuron}`;
    const interval = setInterval(async () => {
      try {
        const result = await BuildService.PollBuildOperation(buildResult.operationName, neuronResource);
        setBuildResult(result as BuildResult);
        if (result?.done) {
          clearInterval(interval);
          setBuildStep('result');
          // Refresh versions after build completes
          DeployService.ListNeuronVersions(neuronResource)
            .then(res => {
              const vs = (res ?? []).filter(v => v !== null).map(v => ({ version: v!.version, createTime: v!.createTime, buildCommit: v!.buildCommit, logsUrl: v!.logsUrl, state: v!.state ?? 0 }));
              setVersions(vs);
            })
            .catch(() => {});
        } else if (result?.notes) {
          setBuildProgressMsg(result.notes);
        }
      } catch {
        clearInterval(interval);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [buildResult?.operationName, buildResult?.done, buildStep, activeNeuron, state.organisation, state.product]);

  // Stream build logs
  useEffect(() => {
    if (!buildResult?.logsUrl) return;
    const fetchLogs = async () => {
      try {
        const chunk = await BuildService.FetchBuildLogs(buildResult.logsUrl, logOffsetRef.current);
        if (chunk?.content) {
          termRef.current?.write(chunk.content);
          logOffsetRef.current = chunk.nextOffset;
        }
      } catch {}
    };
    if (buildResult.done) {
      fetchLogs();
      return;
    }
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [buildResult?.logsUrl, buildResult?.done]);

  // Load changelog when a version is selected
  useEffect(() => {
    setChangelogCommits([]);
    if (!activeVersionId || !activeNeuron || !state.organisation || !state.product) return;

    const selectedIdx = versions.findIndex(v => v.version === activeVersionId);
    if (selectedIdx < 0) return;
    const selectedVer = versions[selectedIdx];
    const prevVer = versions[selectedIdx + 1];

    const parsed = parseNeuron(activeNeuron);
    setChangelogLoading(true);

    BuildService.GetBuildCommits(state.organisation, state.product, parsed.id, parsed.version, 'master', 50)
      .then((raw) => {
        const all = (raw ?? []) as DefineCommit[];
        if (!all.length) return;

        const selIdx = all.findIndex(c => c.sha === selectedVer.buildCommit);
        const prevIdx = prevVer ? all.findIndex(c => c.sha === prevVer.buildCommit) : -1;

        if (selIdx >= 0 && prevIdx > selIdx) {
          setChangelogCommits(all.slice(selIdx, prevIdx));
        } else if (selIdx >= 0) {
          // prevVer SHA not in list — fall back to timestamps
          const ts = all.filter(c =>
            c.timestamp <= selectedVer.createTime && (!prevVer || c.timestamp > prevVer.createTime)
          );
          setChangelogCommits(ts.length > 0 ? ts : all.slice(selIdx, selIdx + 5));
        } else {
          // selected SHA not in list either — use timestamps
          setChangelogCommits(all.filter(c =>
            c.timestamp <= selectedVer.createTime && (!prevVer || c.timestamp > prevVer.createTime)
          ));
        }
      })
      .catch(() => {})
      .finally(() => setChangelogLoading(false));
  }, [activeVersionId, activeNeuron, state.organisation, state.product]);

  // Auto-fetch build logs when the logs tab is opened
  useEffect(() => {
    if (detailTab !== 'logs' || !activeVersionId) return;
    const ver = versions.find(v => v.version === activeVersionId);
    if (!ver?.logsUrl || logsContent !== null || logsLoading) return;
    setLogsLoading(true);
    setLogsError(null);
    BuildService.FetchBuildLogs(ver.logsUrl, 0)
      .then((result: any) => {
        const text = result?.content ?? '';
        setLogsContent(text.trim() || null);
        if (!text.trim()) setLogsError('Logs are no longer available for this build.');
      })
      .catch((e: any) => {
        const msg: string = e?.message ?? String(e) ?? '';
        setLogsError(msg.includes('HTTP 5') ? 'Logs are no longer available for this build.' : msg || 'Failed to load logs');
      })
      .finally(() => setLogsLoading(false));
  }, [detailTab, activeVersionId]);

  const filteredVersions = versions.filter(v =>
    v.version.toLowerCase().includes(filterText.toLowerCase())
  );

  const isLatest = (v: VersionEntry) => versions[0]?.version === v.version;

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const deployedEnvsForVersion = (version: string): string[] =>
    deployedEnvsMap.get(`${activeNeuron}::${version}`) ?? [];

  function versionStateBadge(state: number) {
    if (state === 2) return <span className="ml-[6px] px-[4px] py-[1px] bg-[rgba(56,189,248,0.1)] border border-[rgba(56,189,248,0.3)] rounded-[2px] text-[8px] font-bold font-['JetBrains_Mono',sans-serif] text-[#38bdf8] uppercase">RETAGGED</span>;
    if (state === 3) return <span className="ml-[6px] px-[4px] py-[1px] bg-[rgba(251,191,36,0.1)] border border-[rgba(251,191,36,0.3)] rounded-[2px] text-[8px] font-bold font-['JetBrains_Mono',sans-serif] text-[#fbbf24] uppercase">BUILDING</span>;
    if (state === 4) return <span className="ml-[6px] px-[4px] py-[1px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded-[2px] text-[8px] font-bold font-['JetBrains_Mono',sans-serif] text-[#ef4444] uppercase">FAILED</span>;
    return null;
  }

  const columns = [
    {
      header: 'VERSION',
      render: (item: VersionEntry) => (
        <span className="flex items-center">
          <span className={`font-['JetBrains_Mono',sans-serif] font-bold text-[12px] ${activeVersionId === item.version ? 'text-[#F881A9]' : 'text-white'}`}>
            {item.version}
          </span>
          {versionStateBadge(item.state)}
        </span>
      ),
      className: 'w-[160px]',
    },
    {
      header: 'COMMIT',
      render: (item: VersionEntry) => (
        <span className="font-['JetBrains_Mono',sans-serif] text-[11px] text-[rgba(255,255,255,0.45)]">
          {item.buildCommit ? item.buildCommit.substring(0, 7) : '—'}
        </span>
      ),
      className: 'w-[80px]',
    },
    {
      header: 'DATE',
      render: (item: VersionEntry) => (
        <span className="opacity-70 text-[11px]">{formatDate(item.createTime)}</span>
      ),
      className: 'w-[160px]',
    },
    {
      header: 'ENVS',
      render: (item: VersionEntry) => {
        const envs = deployedEnvsForVersion(item.version);
        return envs.length > 0 ? (
          <div className="flex flex-wrap gap-[3px]">
            {envs.map(name => (
              <span key={name} className="px-[4px] py-[1px] bg-[rgba(52,199,89,0.1)] border border-[rgba(52,199,89,0.2)] rounded-[2px] text-[8px] font-bold font-['JetBrains_Mono',sans-serif] text-[#34C759] uppercase">
                {name.split(' ')[0]}
              </span>
            ))}
          </div>
        ) : <span className="text-[9px] text-[rgba(255,255,255,0.15)]">—</span>;
      },
      className: 'w-[100px]',
    },
    {
      header: '',
      render: (item: VersionEntry) => (
        <span className="text-[9px] text-[rgba(255,255,255,0.3)]">
          {item.createTime > 0 ? formatRelativeTime(item.createTime) : ''}
          {isLatest(item) && <span className="ml-[6px] text-[#F881A9]">LATEST</span>}
        </span>
      ),
      className: 'w-[110px] text-right',
    },
  ];

  const selectedVersion = activeVersionId
    ? versions.find(v => v.version === activeVersionId)
    : null;

  const canDeploy = Boolean(activeVersionId) && (selectedVersion?.state === 1 || selectedVersion?.state === 2);

  return (
    <div className="flex-1 overflow-hidden flex flex-row bg-[#1e1e1e]">
      {/* Left Section: Toolbar and Table */}
      <div className="flex-1 flex flex-col border-r border-[#464646] overflow-hidden">
        {/* Toolbar */}
        <div className="border-b border-[#464646] px-[20px] py-[8px] flex items-center justify-between">
          <div className="flex items-center h-[34px]">
            <div className="bg-[#2c2c2c] border border-[#464646] px-[12px] h-full flex items-center justify-center border-r-0 rounded-l-[4px]">
              <p className="text-[12px] text-white">/</p>
            </div>
            <Input
              placeholder="Filter..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-[150px] border-l-0 rounded-l-none h-full"
              containerClassName="h-full"
            />
          </div>

          <div className="flex items-center gap-[10px]">
            <Button
              variant="secondary"
              className="px-[12px] py-[6px] h-[34px] uppercase text-[10px] font-bold"
              icon={<Icon icon="solar:restart-linear" className="text-base" />}
              disabled={!canDeploy}
              onClick={openDeployFlow}
            >
              {selectedVersion && isLatest(selectedVersion) ? 'REDEPLOY' : 'REVERT'}
            </Button>
            <Button
              variant="secondary"
              className="px-[12px] py-[6px] h-[34px] uppercase text-[10px] font-bold"
              icon={<Icon icon="solar:box-linear" className="text-base" />}
              disabled={!activeNeuron}
              onClick={openBuildFlow}
            >
              BUILD
            </Button>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-hidden">
          {versionsLoading ? (
            <div className="flex items-center justify-center h-full gap-[10px]">
              <Loader size={20} />
              <span className="text-[11px] text-[rgba(255,255,255,0.5)]">Loading versions...</span>
            </div>
          ) : !activeNeuron ? (
            <div className="px-[20px] py-[20px]">
              <p className="text-[11px] text-[rgba(255,255,255,0.3)]">Select a neuron to view its build history.</p>
            </div>
          ) : filteredVersions.length === 0 && !versionsLoading ? (
            <EmptyState
              icon="solar:box-minimalistic-linear"
              title={filterText ? 'No versions match the filter' : 'No versions found'}
              description={filterText ? undefined : 'Click BUILD to create the first one'}
            />
          ) : (
            <Table
              columns={columns}
              data={filteredVersions}
              rowId={(v) => v.version}
              onRowClick={(v) => {
                setActiveVersionId(v.version === activeVersionId ? null : v.version);
                setLogsContent(null);
                setLogsError(null);
                setDetailTab('details');
              }}
              activeRowId={activeVersionId ?? undefined}
            />
          )}
        </div>
      </div>

      {/* Right Section: Build flow / Logs Panel — only shown when a version is selected or a flow is active */}
      {(activeVersionId !== null || buildStep !== null || deployStep !== null) && <RightPane
        label={
          deployStep === 'select-env' ? 'SELECT ENVIRONMENTS' :
          deployStep === 'running' || deployStep === 'result' ? 'DEPLOY LOGS' :
          buildStep === null ? 'DETAILS' :
          buildStep === 'commits' ? 'SELECT COMMIT' :
          buildStep === 'confirm' ? 'CONFIRM BUILD' :
          'BUILD LOGS'
        }
        onClose={
          buildStep !== null || deployStep !== null
            ? () => { setBuildStep(null); setBuildResult(null); setDeployStep(null); setDeployResult(null); }
            : undefined
        }
        actions={
          buildResult?.logsUrl && deployStep === null ? (
            <button
              onClick={() => Browser.OpenURL(buildResult!.logsUrl)}
              title="Open logs in browser"
              className="w-[24px] h-[24px] flex items-center justify-center rounded-[3px] text-[rgba(255,255,255,0.4)] hover:text-white hover:bg-[#3c3c3c] transition-colors"
            >
              <Icon icon="solar:arrow-right-up-linear" className="text-sm" />
            </button>
          ) : undefined
        }
        width="w-[450px]"
        footer={buildStep === null && deployStep === null && selectedVersion ? (
          <div className="flex flex-col gap-[8px]">
            <Button variant="primary" className="w-full justify-center py-[10px]" onClick={openDeployFlow}>
              {isLatest(selectedVersion) ? 'Redeploy' : 'Revert to this version'}
            </Button>
            <Button variant="secondary" className="w-full justify-center py-[10px]" onClick={openBuildFlow}>
              Build Newer Version
            </Button>
            {repoRemoteUri && selectedVersion.buildCommit && (() => {
              const idx = versions.findIndex(v => v.version === selectedVersion.version);
              const prev = versions[idx + 1];
              const commitUrl = buildGCSRUrl(repoRemoteUri, selectedVersion.buildCommit);
              const compareUrl = prev?.buildCommit
                ? buildGCSRUrl(repoRemoteUri, `${prev.buildCommit}..${selectedVersion.buildCommit}`)
                : null;
              if (!commitUrl) return null;
              return (
                <div className="flex gap-[8px]">
                  <button
                    onClick={() => Browser.OpenURL(commitUrl)}
                    className="flex-1 flex items-center justify-center gap-[5px] py-[7px] text-[10px] text-[rgba(255,255,255,0.35)] hover:text-white border border-[#3a3a3a] hover:border-[#555] rounded-[4px] transition-colors"
                  >
                    <Icon icon="solar:code-square-linear" className="text-sm" />
                    View commit
                    <Icon icon="solar:arrow-right-up-linear" className="text-[10px]" />
                  </button>
                  {compareUrl && (
                    <button
                      onClick={() => Browser.OpenURL(compareUrl!)}
                      className="flex-1 flex items-center justify-center gap-[5px] py-[7px] text-[10px] text-[rgba(255,255,255,0.35)] hover:text-white border border-[#3a3a3a] hover:border-[#555] rounded-[4px] transition-colors"
                    >
                      <Icon icon="solar:graph-new-up-linear" className="text-sm" />
                      View changes
                      <Icon icon="solar:arrow-right-up-linear" className="text-[10px]" />
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        ) : undefined}
      >

        {/* Content: idle */}
        {buildStep === null && deployStep === null && (
          <div className="flex-1 flex flex-col min-h-0">
            {selectedVersion ? (
              <>
                {/* Tab bar */}
                <div className="flex h-[36px] border-b border-[#464646] shrink-0">
                  <Tab
                    label="Details"
                    icon={<Icon icon="solar:info-circle-linear" className="text-sm" />}
                    active={detailTab === 'details'}
                    onClick={() => setDetailTab('details')}
                  />
                  <Tab
                    label="Logs"
                    icon={<Icon icon="solar:document-text-linear" className="text-sm" />}
                    active={detailTab === 'logs'}
                    onClick={() => setDetailTab('logs')}
                  />
                  <Tab
                    label="Commits"
                    icon={<Icon icon="solar:history-linear" className="text-sm" />}
                    active={detailTab === 'commits'}
                    onClick={() => setDetailTab('commits')}
                  />
                </div>

                {/* Details tab */}
                {detailTab === 'details' && (
                  <div className="flex-1 overflow-y-auto px-[16px] py-[16px]">
                    <div className="flex flex-col gap-[14px]">
                      <div>
                        <p className="text-[9px] text-[rgba(255,255,255,0.35)] uppercase font-bold font-['JetBrains_Mono',sans-serif] mb-[3px]">Version</p>
                        <p className="font-['JetBrains_Mono',sans-serif] font-bold text-[13px] text-white">{selectedVersion.version}</p>
                      </div>
                      {selectedVersion.createTime > 0 && (
                        <div>
                          <p className="text-[9px] text-[rgba(255,255,255,0.35)] uppercase font-bold font-['JetBrains_Mono',sans-serif] mb-[3px]">Built</p>
                          <p className="text-[11px] text-[rgba(255,255,255,0.5)]">{formatDate(selectedVersion.createTime)} · {formatRelativeTime(selectedVersion.createTime)}</p>
                        </div>
                      )}
                      {selectedVersion.buildCommit && (
                        <div>
                          <p className="text-[9px] text-[rgba(255,255,255,0.35)] uppercase font-bold font-['JetBrains_Mono',sans-serif] mb-[3px]">Commit</p>
                          <p className="font-['JetBrains_Mono',sans-serif] text-[11px] text-[rgba(255,255,255,0.5)]">{selectedVersion.buildCommit.substring(0, 12)}</p>
                        </div>
                      )}
                      {selectedVersion.buildCommit && (() => {
                        const msg = changelogCommits.find(c => c.sha === selectedVersion.buildCommit)?.message;
                        if (changelogLoading) return (
                          <div>
                            <p className="text-[9px] text-[rgba(255,255,255,0.35)] uppercase font-bold font-['JetBrains_Mono',sans-serif] mb-[3px]">Commit Message</p>
                            <p className="text-[11px] text-[rgba(255,255,255,0.25)] italic">Loading...</p>
                          </div>
                        );
                        if (!msg) return null;
                        return (
                          <div>
                            <p className="text-[9px] text-[rgba(255,255,255,0.35)] uppercase font-bold font-['JetBrains_Mono',sans-serif] mb-[3px]">Commit Message</p>
                            <p className="text-[11px] text-[rgba(255,255,255,0.5)] leading-[1.5]">{msg}</p>
                          </div>
                        );
                      })()}
                      {(() => {
                        const envNames = deployedEnvsForVersion(selectedVersion.version);
                        return envNames.length > 0 ? (
                          <div>
                            <p className="text-[9px] text-[rgba(255,255,255,0.35)] uppercase font-bold font-['JetBrains_Mono',sans-serif] mb-[6px]">Deployed In</p>
                            <div className="flex flex-wrap gap-[4px]">
                              {envNames.map(name => (
                                <span key={name} className="px-[6px] py-[2px] bg-[rgba(52,199,89,0.1)] border border-[rgba(52,199,89,0.25)] rounded-[3px] text-[9px] font-bold font-['JetBrains_Mono',sans-serif] text-[#34C759]">
                                  {name}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </div>
                )}

                {/* Logs tab */}
                {detailTab === 'logs' && (
                  <div className="flex-1 overflow-y-auto">
                    {!selectedVersion.logsUrl ? (
                      <div className="flex flex-col items-center justify-center h-full gap-[8px] opacity-30">
                        <Icon icon="solar:document-text-linear" className="text-white text-[24px]" />
                        <p className="text-[11px] text-white">No logs for this build</p>
                      </div>
                    ) : logsLoading ? (
                      <div className="flex items-center gap-[10px] px-[16px] py-[20px]">
                        <Loader size={20} />
                        <span className="text-[11px] text-[rgba(255,255,255,0.5)]">Loading logs...</span>
                      </div>
                    ) : logsError ? (
                      <p className="text-[10px] text-[rgba(255,92,95,0.8)] px-[16px] py-[20px]">{logsError}</p>
                    ) : logsContent !== null ? (
                      <pre className="p-[12px] text-[10px] leading-[1.6] text-[rgba(255,255,255,0.75)] font-['JetBrains_Mono',sans-serif] whitespace-pre-wrap break-words">
                        {logsContent || '(no log output)'}
                      </pre>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full gap-[8px] opacity-30">
                        <Icon icon="solar:document-text-linear" className="text-white text-[24px]" />
                        <p className="text-[11px] text-white">No log output</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Commits tab */}
                {detailTab === 'commits' && (
                  <div className="flex-1 overflow-y-auto">
                    {changelogLoading ? (
                      <div className="flex items-center gap-[10px] px-[16px] py-[20px]">
                        <Loader size={20} />
                        <span className="text-[11px] text-[rgba(255,255,255,0.3)]">Loading commits...</span>
                      </div>
                    ) : changelogCommits.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full gap-[8px] opacity-30">
                        <Icon icon="solar:history-linear" className="text-white text-[24px]" />
                        <p className="text-[11px] text-white">No changelog available</p>
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        <p className="px-[16px] pt-[12px] pb-[8px] text-[9px] text-[rgba(255,255,255,0.3)] uppercase font-bold font-['JetBrains_Mono',sans-serif]">
                          {changelogCommits.length} commit{changelogCommits.length !== 1 ? 's' : ''} since {versions[versions.findIndex(v => v.version === activeVersionId) + 1]?.version ?? 'start'}
                        </p>
                        {changelogCommits.map(c => (
                          <div key={c.sha} className="flex items-start gap-[8px] px-[16px] py-[8px] border-b border-[#2c2c2c] last:border-b-0 hover:bg-[#252525]">
                            <span className="font-['JetBrains_Mono',sans-serif] text-[10px] font-bold text-[#f881a9] shrink-0 mt-[1px]">
                              {c.sha.substring(0, 7)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] text-white leading-tight">{c.message}</p>
                              <p className="text-[9px] text-[rgba(255,255,255,0.35)] mt-[2px]">
                                {c.author} · {formatRelativeTime(c.timestamp)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-[12px] opacity-30 pb-[40px]">
                <Icon icon="solar:box-linear" className="text-white text-[32px]" />
                <p className="text-[11px] text-white">
                  {activeNeuron ? 'Select a version or click BUILD' : 'Select a neuron to get started'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Content: commits picker */}
        {buildStep === 'commits' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Branch selector */}
            <div className="shrink-0 flex items-center gap-[8px] px-[14px] py-[9px] border-b border-[#2c2c2c]">
              <Icon icon="solar:branch-linear" className="text-[rgba(255,255,255,0.35)] text-sm shrink-0" />
              <div className="relative flex-1 min-w-0">
                <select
                  value={buildBranch}
                  onChange={(e) => handleBranchChange(e.target.value)}
                  className="w-full appearance-none bg-transparent text-[10px] text-white font-['JetBrains_Mono',sans-serif] outline-none cursor-pointer pr-[16px]"
                >
                  {buildBranches.map(b => (
                    <option key={b} value={b} className="bg-[#1e1e1e] text-white">{b}</option>
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
                  {buildCommits.map(c => (
                    <button
                      key={c.sha}
                      onClick={() => { setSelectedCommit(c); setBuildStep('confirm'); }}
                      className="text-left px-[16px] py-[12px] border-b border-[#2c2c2c] hover:bg-[#2c2c2c] transition-colors"
                    >
                      <div className="flex items-center gap-[8px] mb-[3px]">
                        <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[#f881a9]">
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

        {/* Content: confirm */}
        {buildStep === 'confirm' && selectedCommit && (
          <div className="flex-1 overflow-y-auto px-[16px] py-[20px]">
            <button
              onClick={() => setBuildStep('commits')}
              className="flex items-center gap-[6px] text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white mb-[20px] transition-colors"
            >
              <Icon icon="solar:alt-arrow-left-linear" className="text-sm" />
              Back to commits
            </button>

            <div className="bg-[#2c2c2c] border border-[#3a3a3a] rounded-[8px] p-[14px] mb-[20px]">
              <p className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase font-bold font-['JetBrains_Mono',sans-serif] mb-[8px]">
                {buildBranch} · {selectedCommit.sha.substring(0, 7)}
              </p>
              <p className="text-[11px] text-white leading-[1.5] mb-[8px]">{selectedCommit.message}</p>
              <p className="text-[9px] text-[rgba(255,255,255,0.4)]">
                {selectedCommit.author} · {formatTimestamp(selectedCommit.timestamp)}
              </p>
            </div>

            <Button
              variant="primary"
              className="w-full justify-center py-[10px]"
              onClick={handleRunBuild}
            >
              Run Cloud Build
            </Button>
          </div>
        )}

        {/* Deploy: environment picker */}
        {deployStep === 'select-env' && (
          <div className="flex-1 overflow-y-auto">
            <div className="px-[16px] py-[16px]">
              <p className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase font-bold font-['JetBrains_Mono',sans-serif] mb-[4px]">
                Version
              </p>
              <p className="font-['JetBrains_Mono',sans-serif] font-bold text-[16px] text-[#F881A9] mb-[20px]">
                {activeVersionId}
              </p>
              <p className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase font-bold font-['JetBrains_Mono',sans-serif] mb-[10px]">
                Environments
              </p>
              {state.loadedEnvs.length === 0 ? (
                <p className="text-[11px] text-[rgba(255,255,255,0.3)] mb-[20px]">No environments loaded.</p>
              ) : (
                <div className="flex flex-col gap-[6px] mb-[20px]">
                  {state.loadedEnvs.map(env => {
                    const selected = deploySelectedEnvs.includes(env.name);
                    return (
                      <button
                        key={env.name}
                        onClick={() => setDeploySelectedEnvs(prev =>
                          selected ? prev.filter(n => n !== env.name) : [...prev, env.name]
                        )}
                        className={`flex items-center gap-[10px] px-[12px] py-[10px] rounded-[6px] border text-left transition-colors ${
                          selected
                            ? 'bg-[rgba(248,129,169,0.1)] border-[rgba(248,129,169,0.4)]'
                            : 'bg-[#2c2c2c] border-[#3a3a3a] hover:border-[#555]'
                        }`}
                      >
                        <div className={`size-[14px] rounded-[3px] border flex items-center justify-center shrink-0 ${
                          selected ? 'bg-[#F881A9] border-[#F881A9]' : 'border-[#555]'
                        }`}>
                          {selected && <Icon icon="solar:check-linear" className="text-black text-[10px]" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-white truncate">{env.displayName}</p>
                          <p className="text-[9px] text-[rgba(255,255,255,0.4)] font-['JetBrains_Mono',sans-serif] truncate">{env.name.split('/').pop()}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <Button
                variant="primary"
                className="w-full justify-center py-[10px]"
                disabled={deploySelectedEnvs.length === 0}
                onClick={handleRunDeploy}
              >
                {selectedVersion && isLatest(selectedVersion) ? 'Redeploy' : 'Revert'} · {deploySelectedEnvs.length} env{deploySelectedEnvs.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        )}

        {/* Deploy: running + result terminal */}
        {(deployStep === 'running' || deployStep === 'result') && (
          <div className="flex-1 flex flex-col min-h-0">
            {deployStep === 'running' && (
              <div className="shrink-0 flex items-center gap-[10px] px-[14px] py-[10px] border-b border-[#2c2c2c]">
                <Loader size={20} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-white leading-tight">Deploying · {activeVersionId}</p>
                  <p className="text-[9px] text-[rgba(255,255,255,0.4)] truncate leading-tight mt-[1px]">{deployProgressMsg}</p>
                </div>
              </div>
            )}
            {deployStep === 'result' && (
              <div className={`shrink-0 px-[14px] py-[10px] border-b border-[#2c2c2c] ${
                deployResult?.error ? 'bg-[rgba(255,92,95,0.05)]' : 'bg-[rgba(52,199,89,0.05)]'
              }`}>
                {deployResult?.error ? (
                  <div className="flex items-start gap-[8px]">
                    <Icon icon="solar:close-circle-linear" className="text-[#FF5C5F] text-sm shrink-0 mt-[1px]" />
                    <p className="text-[10px] text-[rgba(255,255,255,0.7)] leading-relaxed">{deployResult.error}</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-[8px]">
                    <Icon icon="solar:check-circle-linear" className="text-[#34C759] text-sm shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-white leading-tight">Deploy Complete</p>
                      {deployResult?.version && (
                        <p className="text-[9px] text-[rgba(255,255,255,0.4)] font-['JetBrains_Mono',sans-serif] truncate leading-tight mt-[1px]">
                          {deployResult.version}
                        </p>
                      )}
                    </div>
                    {deployResult?.deployments?.[0]?.logsUrl && (
                      <button
                        onClick={() => Browser.OpenURL(deployResult!.deployments[0].logsUrl)}
                        className="ml-auto shrink-0 text-[rgba(255,255,255,0.3)] hover:text-[#f881a9] transition-colors"
                        title="Open in browser"
                      >
                        <Icon icon="solar:arrow-right-up-linear" className="text-sm" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            <BuildTerminal ref={deployTermRef} className="flex-1 min-h-0" />
            {deployStep === 'result' && (
              <div className="shrink-0 px-[14px] py-[10px] border-t border-[#2c2c2c]">
                <button
                  onClick={openDeployFlow}
                  className="text-[10px] text-[rgba(255,255,255,0.35)] hover:text-white transition-colors flex items-center gap-[6px]"
                >
                  <Icon icon="solar:refresh-linear" className="text-sm" />
                  Deploy again
                </button>
              </div>
            )}
          </div>
        )}

        {/* Content: running + result (shared terminal) */}
        {(buildStep === 'running' || buildStep === 'result') && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Running header */}
            {buildStep === 'running' && (
              <div className="shrink-0 flex items-center gap-[10px] px-[14px] py-[10px] border-b border-[#2c2c2c]">
                <Loader size={20} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-white leading-tight">Running Build · {activeNeuron}</p>
                  <p className="text-[9px] text-[rgba(255,255,255,0.4)] truncate leading-tight mt-[1px]">{buildProgressMsg}</p>
                </div>
                {buildResult?.version && (
                  <span className="text-[9px] font-bold font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.35)] shrink-0">
                    {buildResult.version}
                  </span>
                )}
              </div>
            )}

            {/* Result header */}
            {buildStep === 'result' && (
              <div className={`shrink-0 px-[14px] py-[10px] border-b border-[#2c2c2c] ${
                buildResult?.error ? 'bg-[rgba(255,92,95,0.05)]' : 'bg-[rgba(52,199,89,0.05)]'
              }`}>
                {buildResult?.error ? (
                  <div className="flex items-start gap-[8px]">
                    <Icon icon="solar:close-circle-linear" className="text-[#FF5C5F] text-sm shrink-0 mt-[1px]" />
                    <p className="text-[10px] text-[rgba(255,255,255,0.7)] leading-relaxed">{buildResult.error}</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-[8px]">
                    <Icon icon="solar:check-circle-linear" className="text-[#34C759] text-sm shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-white leading-tight">Build Complete</p>
                      {(buildResult?.neuronVersion || buildResult?.version) && (
                        <p className="text-[9px] text-[rgba(255,255,255,0.4)] font-['JetBrains_Mono',sans-serif] truncate leading-tight mt-[1px]">
                          {buildResult.neuronVersion || buildResult.version}
                        </p>
                      )}
                    </div>
                    {buildResult?.logsUrl && (
                      <button
                        onClick={() => Browser.OpenURL(buildResult!.logsUrl)}
                        className="ml-auto shrink-0 text-[rgba(255,255,255,0.3)] hover:text-[#f881a9] transition-colors"
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
            <BuildTerminal ref={termRef} className="flex-1 min-h-0" />

            {/* Footer: build again */}
            {buildStep === 'result' && (
              <div className="shrink-0 px-[14px] py-[10px] border-t border-[#2c2c2c]">
                <button
                  onClick={openBuildFlow}
                  className="text-[10px] text-[rgba(255,255,255,0.35)] hover:text-white transition-colors flex items-center gap-[6px]"
                >
                  <Icon icon="solar:refresh-linear" className="text-sm" />
                  Build again
                </button>
              </div>
            )}
          </div>
        )}
      </RightPane>}
    </div>
  );
}
