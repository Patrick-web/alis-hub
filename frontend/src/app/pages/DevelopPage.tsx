import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { ActionButton } from '../components/ActionButton';
import { Dropdown } from '../components/Dropdown';
import { Table } from '../components/Table';
import { useWorkspace } from '../stores/workspace';
import * as DefineService from '../../../bindings/alis-hub-v3/defineservice';
import * as BuildService from '../../../bindings/alis-hub-v3/buildservice';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';
import { Browser } from '@wailsio/runtime';
import { BuildTerminal, type BuildTerminalHandle } from '../components/BuildTerminal';

type DefineStep = 'commits' | 'confirm' | 'running' | 'glass';
type BuildStep = 'commits' | 'confirm' | 'running' | 'result';
type BuildMode = 'cloud' | 'local' | 'deploy';

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

export function DevelopPage() {
  const { state, setNeurons, updateWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterText, setFilterText] = useState('');
  const [packages, setPackages] = useState<{ name: string; language: string; artifactId: string }[]>([]);
  const [, setLoadingPkgs] = useState(false);

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
    setBuildNeuron(null); // close build pane if open
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

    if (buildMode === 'local') {
      const neuronResource = `organisations/${state.organisation}/products/${state.product}/neurons/${buildNeuron}`;
      setBuildStep('running');
      setBuildProgressMsg('Building locally...');
      try {
        const result = await BuildService.StartLocalBuild(neuronResource, selectedBuildCommit.sha);
        setLocalBuildId(result.buildId);
      } catch (e: any) {
        setBuildStep('result');
        setBuildResult({ operationName: '', version: '', neuronVersion: '', logsUrl: '', notes: '', done: true, error: e?.message || 'Failed to start local build' } as BuildResult);
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

    const neuronResource = `organisations/${state.organisation}/products/${state.product}/neurons/${buildNeuron}`;
    setBuildStep('running');
    setBuildProgressMsg('Starting Build...');
    try {
      const result = await BuildService.RunBuild(neuronResource, selectedBuildCommit.sha);
      setBuildResult(result as BuildResult);
    } catch (e: any) {
      setBuildProgressMsg(`Failed: ${e?.message || e}`);
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
        }
        if (chunk?.done) {
          clearInterval(interval);
          setBuildStep('result');
          setBuildResult({
            operationName: '',
            version: '',
            neuronVersion: '',
            logsUrl: '',
            notes: '',
            done: true,
            error: chunk.error || undefined,
          } as BuildResult);
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
    try {
      const result = await DefineService.RunDefine(neuronResource, selectedCommit.sha, '');
      setDefineResult(result as DefineResult);
    } catch (e: any) {
      setProgressMsg(`Failed: ${e?.message || e}`);
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

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    setSelectedIds(prev =>
      prev.length === state.neurons.length ? [] : state.neurons.map(n => n.id)
    );
  };

  const filteredNeurons = state.neurons.filter(n =>
    n.name.toLowerCase().includes(filterText.toLowerCase())
  );

  const selectedNeuronNames = selectedIds
    .map(id => state.neurons.find(n => n.id === id))
    .filter(Boolean)
    .map(n => n!.name);

  const handleScanPackages = async () => {
    if (selectedNeuronNames.length === 0) return;
    setLoadingPkgs(true);
    try {
      const first = selectedNeuronNames[0];
      const m = first.match(/^(.+)-(v\d+)$/);
      const neuronId = m ? m[1] : first;
      const version = m ? m[2] : 'v1';
      const result = await DefineService.ScanNeuronPackages(
        state.organisation, state.product, neuronId, version
      );
      setPackages(result);
    } catch {
      setPackages([]);
    } finally {
      setLoadingPkgs(false);
    }
  };

  const handleNeuronAction = (neuronName: string, stage: string) => {
    if (stage === 'define') {
      openDefinePane(neuronName);
    } else if (stage === 'build') {
      openBuildPane(neuronName);
    } else {
      updateWorkspace({ activeNeuronIds: [neuronName] });
      navigate(`/deployments?neuron=${encodeURIComponent(neuronName)}&stage=${stage}`);
    }
  };

  const handleGlobalAction = (stage: string) => {
    const target = selectedNeuronNames[0] || state.neurons[0]?.name;
    if (!target) return;
    if (stage === 'define') {
      openDefinePane(target);
    } else if (stage === 'build') {
      openBuildPane(target);
    } else {
      updateWorkspace({ activeNeuronIds: selectedNeuronNames });
      navigate(`/deployments?neuron=${encodeURIComponent(target)}&stage=${stage}`);
    }
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const columns = [
    {
      header: 'NEURON',
      render: (item: typeof state.neurons[0]) => (
        <div className="flex items-center gap-[8px]">
          <div className={`size-[8px] rounded-full ${item.state === 1 ? 'bg-[#34C759]' : item.state === 4 ? 'bg-[#FAC800]' : 'bg-[#FF5C5F]'}`} />
          <span>{item.name}</span>
        </div>
      ),
      className: 'w-[200px]',
    },
    {
      header: 'TYPE',
      render: (item: typeof state.neurons[0]) => (
        <span className="text-[rgba(255,255,255,0.5)]">{item.type === 2 ? 'SERVICE' : 'RESOURCE'}</span>
      ),
      className: 'w-[100px]',
    },
    {
      header: 'LATEST BUILD',
      render: (item: typeof state.neurons[0]) => item.latestBuild,
      className: 'w-[120px]',
    },
    {
      header: 'Actions',
      render: (item: typeof state.neurons[0]) => (
        <div className="flex gap-[5px]">
          <ActionButton onClick={() => handleNeuronAction(item.name, 'define')}>Define</ActionButton>
          <ActionButton onClick={() => handleNeuronAction(item.name, 'build')}>Build</ActionButton>
          <ActionButton onClick={() => handleNeuronAction(item.name, 'deploy')}>Deploy</ActionButton>
        </div>
      ),
      className: 'min-w-[280px]',
    },
  ];

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#1e1e1e]">
      {/* Toolbar */}
      <div className="border-b border-[#464646] px-[20px] py-[8px] flex items-center justify-between shrink-0">
        <div className="flex items-center h-[34px]">
          <div className="bg-[#2c2c2c] border border-[#464646] px-[12px] h-full flex items-center justify-center border-r-0 rounded-l-[4px]">
            <p className="text-[12px] text-white">/</p>
          </div>
          <Input
            placeholder="Filter..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-[200px] border-l-0 rounded-l-none h-full"
            containerClassName="h-full"
          />
        </div>

        <div className="flex items-center gap-[10px]">
          <Button
            variant="secondary"
            className="px-[12px] py-[6px] h-[34px] uppercase text-[10px] font-bold"
            icon={<Icon icon="solar:document-text-linear" className="text-base" />}
            onClick={() => handleGlobalAction('define')}
          >
            DEFINE
          </Button>
          <Button
            variant="secondary"
            className="px-[12px] py-[6px] h-[34px] uppercase text-[10px] font-bold"
            icon={<Icon icon="solar:code-linear" className="text-base" />}
            onClick={() => handleGlobalAction('build')}
          >
            BUILD
          </Button>
          <Button
            variant="secondary"
            className="px-[12px] py-[6px] h-[34px] uppercase text-[10px] font-bold"
            icon={<Icon icon="solar:cloud-upload-linear" className="text-base" />}
            onClick={() => handleGlobalAction('deploy')}
          >
            DEPLOY
          </Button>
          <Dropdown
            label={`Packages${packages.length > 0 ? ` (${packages.length})` : ''}`}
            options={['Scan Packages', 'Manage Dependencies', 'Update All']}
            onSelect={(opt) => { if (opt === 'Scan Packages') handleScanPackages(); }}
          />
          <Button
            variant="primary"
            icon={<Icon icon="solar:add-circle-linear" className="text-xl" />}
            className="h-[34px] uppercase text-[10px] font-bold"
            onClick={() => navigate('/deployments?stage=quickstart')}
          >
            New Neuron
          </Button>
        </div>
      </div>

      {packages.length > 0 && (
        <div className="px-[20px] py-[8px] border-b border-[#464646] bg-[rgba(248,129,169,0.03)] shrink-0">
          <p className="text-[9px] text-[rgba(255,255,255,0.5)] uppercase font-bold mb-[4px]">
            Discovered Packages ({selectedNeuronNames[0] || 'N/A'})
          </p>
          <div className="flex gap-[6px] flex-wrap">
            {packages.map((p, i) => (
              <span key={i} className="px-[8px] py-[2px] bg-[#2c2c2c] border border-[#464646] rounded-[3px] text-[9px] text-white font-['JetBrains_Mono',sans-serif]">
                {p.language}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Main content: table + optional define pane */}
      <div className="flex-1 overflow-hidden flex">
        {/* Services table */}
        <div className="flex-1 overflow-hidden">
          <Table
            columns={columns}
            data={filteredNeurons}
            rowId={(n) => n.id}
            selectedIds={selectedIds}
            onSelectRow={toggleSelect}
            onSelectAll={toggleAll}
          />
        </div>

        {/* Define pane */}
        {defineNeuron && (
          <div className="w-[380px] border-l border-[#464646] flex flex-col overflow-hidden shrink-0">
            {/* Pane header */}
            <div className="px-[16px] py-[12px] border-b border-[#464646] flex items-center justify-between shrink-0">
              <div>
                <p className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase font-bold font-['JetBrains_Mono',sans-serif]">Define</p>
                <p className="text-[13px] font-bold text-white font-['JetBrains_Mono',sans-serif]">{defineNeuron}</p>
              </div>
              <button
                onClick={() => setDefineNeuron(null)}
                className="size-[28px] flex items-center justify-center rounded-[4px] hover:bg-[#2c2c2c] text-[rgba(255,255,255,0.4)] hover:text-white transition-colors"
              >
                <Icon icon="solar:close-linear" className="text-base" />
              </button>
            </div>

            {/* Step: commits */}
            {defineStep === 'commits' && (
              <div className="flex-1 overflow-y-auto">
                {commitsLoading ? (
                  <div className="flex items-center gap-[10px] px-[16px] py-[20px]">
                    <Icon icon="solar:spinner-linear" className="text-[#f881a9] animate-spin text-base" />
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
                        className="text-left px-[16px] py-[12px] border-b border-[#2c2c2c] hover:bg-[#2c2c2c] transition-colors group"
                      >
                        <div className="flex items-center gap-[8px] mb-[3px]">
                          <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[#f881a9]">
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

                <div className="bg-[#2c2c2c] border border-[#3a3a3a] rounded-[8px] p-[16px] mb-[20px]">
                  <p className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase font-bold font-['JetBrains_Mono',sans-serif] mb-[10px]">
                    Selected Commit
                  </p>
                  <p className="text-[11px] text-white leading-[1.5] mb-[10px]">{selectedCommit.message}</p>
                  <div className="flex items-center gap-[8px] mb-[4px]">
                    <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[#f881a9]">
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
                    <Icon icon="solar:spinner-linear" className="text-[#f881a9] text-2xl animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-[12px] font-bold text-white mb-[6px]">Running Define</p>
                    <p className="text-[10px] text-[rgba(255,255,255,0.5)] leading-[1.5] max-w-[280px] text-center">
                      {progressMsg}
                    </p>
                  </div>
                  {defineResult?.version && (
                    <div className="bg-[#2c2c2c] border border-[#3a3a3a] rounded-[6px] px-[12px] py-[6px]">
                      <span className="text-[9px] font-bold font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.5)]">
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
                  <div className="px-[16px] py-[16px] border-b border-[#2c2c2c]">
                    <div className="flex items-start gap-[8px] p-[10px] bg-[rgba(255,92,95,0.1)] border border-[rgba(255,92,95,0.3)] rounded-[6px]">
                      <Icon icon="solar:close-circle-linear" className="text-[#FF5C5F] text-sm shrink-0 mt-[1px]" />
                      <p className="text-[10px] text-[rgba(255,255,255,0.7)] leading-relaxed">{defineResult.error}</p>
                    </div>
                  </div>
                )}

                {/* Success header */}
                {!defineResult?.error && (
                  <div className="px-[16px] py-[14px] border-b border-[#2c2c2c] bg-[rgba(52,199,89,0.05)]">
                    <div className="flex items-center gap-[8px] mb-[4px]">
                      <Icon icon="solar:check-circle-linear" className="text-[#34C759] text-base" />
                      <p className="text-[11px] font-bold text-white">Define Complete</p>
                    </div>
                    {defineResult?.version && (
                      <p className="text-[9px] text-[rgba(255,255,255,0.4)] font-['JetBrains_Mono',sans-serif]">
                        {defineResult.definition} · v{defineResult.version}
                      </p>
                    )}
                  </div>
                )}

                {/* Glass loading */}
                {glassLoading && (
                  <div className="flex items-center gap-[10px] px-[16px] py-[16px]">
                    <Icon icon="solar:spinner-linear" className="text-[#f881a9] animate-spin text-sm" />
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
                          <span className="text-[9px] uppercase font-bold font-['JetBrains_Mono',sans-serif] px-[6px] py-[2px] rounded bg-[#2c2c2c] border border-[#464646] text-[rgba(255,255,255,0.5)]">
                            {glassResult.definition.version}
                          </span>
                        )}
                        {glassResult.definition.releaseType && (
                          <span className="text-[9px] uppercase font-bold font-['JetBrains_Mono',sans-serif] px-[6px] py-[2px] rounded bg-[rgba(248,129,169,0.1)] border border-[rgba(248,129,169,0.3)] text-[#f881a9]">
                            {glassResult.definition.releaseType}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Artifacts vertical list */}
                    {glassResult.artifacts && glassResult.artifacts.length > 0 && (
                      <div>
                        <p className="text-[9px] uppercase font-bold text-[rgba(255,255,255,0.3)] mb-[10px] font-['JetBrains_Mono',sans-serif]">
                          Artifacts ({glassResult.artifacts.length})
                        </p>
                        <div className="flex flex-col gap-[2px]">
                          {glassResult.artifacts.map((a, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-[10px] px-[10px] py-[9px] rounded-[6px] bg-[#232323] border border-[#2c2c2c] group"
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
                              <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-white flex-1 min-w-0 truncate">
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
                                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[rgba(255,255,255,0.4)] hover:text-[#f881a9]"
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
                <div className="px-[16px] py-[12px] border-t border-[#2c2c2c] mt-[8px]">
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
          </div>
        )}

        {/* Build pane */}
        {buildNeuron && (
          <div className="w-[380px] border-l border-[#464646] flex flex-col overflow-hidden shrink-0">
            {/* Pane header */}
            <div className="px-[16px] py-[12px] border-b border-[#464646] flex items-center justify-between shrink-0">
              <div>
                <p className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase font-bold font-['JetBrains_Mono',sans-serif]">Build</p>
                <p className="text-[13px] font-bold text-white font-['JetBrains_Mono',sans-serif]">{buildNeuron}</p>
              </div>
              <button
                onClick={() => setBuildNeuron(null)}
                className="size-[28px] flex items-center justify-center rounded-[4px] hover:bg-[#2c2c2c] text-[rgba(255,255,255,0.4)] hover:text-white transition-colors"
              >
                <Icon icon="solar:close-linear" className="text-base" />
              </button>
            </div>

            {/* Step: commits */}
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
                      {buildBranches.map((b) => (
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
                      <Icon icon="solar:spinner-linear" className="text-[#f881a9] animate-spin text-base" />
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
                <div className="bg-[#2c2c2c] border border-[#3a3a3a] rounded-[8px] p-[14px] mb-[20px]">
                  <p className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase font-bold font-['JetBrains_Mono',sans-serif] mb-[8px]">
                    {buildBranch} · {selectedBuildCommit.sha.substring(0, 7)}
                  </p>
                  <p className="text-[11px] text-white leading-[1.5] mb-[8px]">{selectedBuildCommit.message}</p>
                  <p className="text-[9px] text-[rgba(255,255,255,0.4)]">
                    {selectedBuildCommit.author} · {formatTimestamp(selectedBuildCommit.timestamp)}
                  </p>
                </div>

                {/* Build mode selector */}
                <p className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase font-bold font-['JetBrains_Mono',sans-serif] mb-[8px]">
                  Action
                </p>
                <div className="flex flex-col gap-[2px] mb-[20px]">
                  {([
                    { mode: 'cloud' as BuildMode, icon: 'solar:cloud-bolt-linear', label: 'Cloud Build', soon: false },
                    { mode: 'local' as BuildMode, icon: 'solar:laptop-linear', label: 'Build Locally', soon: false },
                    { mode: 'deploy' as BuildMode, icon: 'solar:rocket-2-linear', label: 'Build and Deploy', soon: true },
                  ]).map(({ mode, icon, label, soon }) => (
                    <button
                      key={mode}
                      onClick={() => setBuildMode(mode)}
                      className={`flex items-center gap-[10px] px-[12px] py-[10px] rounded-[6px] border transition-colors text-left ${
                        buildMode === mode
                          ? 'bg-[rgba(248,129,169,0.08)] border-[rgba(248,129,169,0.35)] text-white'
                          : 'bg-[#1e1e1e] border-[#2c2c2c] text-[rgba(255,255,255,0.5)] hover:border-[#3a3a3a] hover:text-[rgba(255,255,255,0.7)]'
                      }`}
                    >
                      <span className={`size-[6px] rounded-full shrink-0 ${buildMode === mode ? 'bg-[#f881a9]' : 'bg-[#3a3a3a]'}`} />
                      <Icon icon={icon} className="text-sm shrink-0" />
                      <span className="text-[11px] font-medium flex-1">{label}</span>
                      {soon && (
                        <span className="text-[8px] font-bold uppercase font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.25)] border border-[#2c2c2c] rounded px-[4px] py-[1px]">
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
                  <div className="shrink-0 flex items-center gap-[10px] px-[14px] py-[10px] border-b border-[#2c2c2c]">
                    <Icon icon="solar:spinner-linear" className="text-[#f881a9] animate-spin shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-white leading-tight">Running Build</p>
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
                    buildResult?.stub ? 'bg-[rgba(255,159,10,0.05)]'
                    : buildResult?.error ? 'bg-[rgba(255,92,95,0.05)]'
                    : 'bg-[rgba(52,199,89,0.05)]'
                  }`}>
                    {buildResult?.stub ? (
                      <div className="flex items-center gap-[8px]">
                        <Icon icon="solar:clock-circle-linear" className="text-[#ff9f0a] text-sm shrink-0" />
                        <p className="text-[10px] font-bold text-[rgba(255,255,255,0.7)] leading-tight">
                          Build and Deploy — Coming Soon
                        </p>
                      </div>
                    ) : buildResult?.error ? (
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

                {/* Terminal — fills remaining space, persists across running→result */}
                <BuildTerminal ref={termRef} className="flex-1 min-h-0" />

                {/* Footer: run again */}
                {buildStep === 'result' && (
                  <div className="shrink-0 px-[14px] py-[10px] border-t border-[#2c2c2c]">
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
          </div>
        )}
      </div>
    </div>
  );
}
