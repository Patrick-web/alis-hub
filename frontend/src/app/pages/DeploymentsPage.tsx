import { Loader } from '../components/Loader';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { Icon } from '@iconify/react';
import { PageLayout } from '../components/PageLayout';
import { StageCard } from '../components/StageCard';
import { CodeBlock } from '../components/CodeBlock';
import { Button } from '../components/Button';
import { ConfigValue } from '../components/ConfigValue';
import { BuildTerminal, type BuildTerminalHandle } from '../components/BuildTerminal';
import { useWorkspace } from '../stores/workspace';
import * as DefineService from '../../../bindings/alis-hub-v3/defineservice';
import * as DeployService from '../../../bindings/alis-hub-v3/deployservice';

type StageId = 'overview' | 'quickstart' | 'define' | 'build' | 'deploy' | 'playground';

const stages: { id: StageId; label: string; eyebrow: string }[] = [
  { id: 'overview', label: 'Overview', eyebrow: 'DBD' },
  { id: 'quickstart', label: 'Quick Start', eyebrow: 'Setup' },
  { id: 'define', label: 'Define', eyebrow: 'API contract' },
  { id: 'build', label: 'Build', eyebrow: 'Implementation' },
  { id: 'deploy', label: 'Deploy', eyebrow: 'Infrastructure' },
  { id: 'playground', label: 'Playground', eyebrow: 'Validation' },
];

export function DeploymentsPage() {
  const { state } = useWorkspace();
  const [searchParams] = useSearchParams();
  const [activeStage, setActiveStage] = useState<StageId>(() => {
    const stage = searchParams.get('stage') as StageId | null;
    if (stage && stages.some(s => s.id === stage)) return stage;
    return 'overview';
  });
  const preselectedNeuron = searchParams.get('neuron') || '';
  const [selectedNeuron, setSelectedNeuron] = useState<string>(preselectedNeuron);
  const [, setSelectedVersion] = useState('v1');
  const [defineUpdated, setDefineUpdated] = useState(false);
  // Deploy stage state
  const [selectedEnvs, setSelectedEnvs] = useState<string[]>([]);
  const [deployVersion, setDeployVersion] = useState('');
  const [planOnly, setPlanOnly] = useState(false);
  const [betaDeploy, setBetaDeploy] = useState(false);
  const [deployResult, setDeployResult] = useState<{
    operationName: string; version: string; deployments: { logsUrl: string }[];
    notes: string; done: boolean; error?: string;
  } | null>(null);
  const [deployLoading, setDeployLoading] = useState(false);
  const [deployStatusMessage, setDeployStatusMessage] = useState('');
  const deployTermRef = useRef<BuildTerminalHandle>(null);
  const [defineCommitted, setDefineCommitted] = useState(false);
  const [commits, setCommits] = useState<{ sha: string; message: string; author: string }[]>([]);
  const [selectedCommit, setSelectedCommit] = useState('');
  const [loading, setLoading] = useState(false);
  const [glassLoading, setGlassLoading] = useState(false);
  const [glassResult, setGlassResult] = useState<{
    title: string;
    summary: string;
    definition: { name: string; version: string; commit: string; releaseType: string };
    artifacts: { type: string; state: number; notes: string; locationUri: string; extra: string }[];
  } | null>(null);
  const [defineResult, setDefineResult] = useState<{
    operationName: string;
    definition: string;
    version: string;
    notes: string;
    definitionArtifacts: string[];
    done: boolean;
    error?: string;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const currentStageIndex = stages.findIndex((s) => s.id === activeStage);

  const parseNeuron = (name: string) => {
    const match = name.match(/^(.+?)-(v\d+)$/);
    if (match) return { id: match[1], version: match[2] };
    return { id: name, version: 'v1' };
  };

  const loadGlass = useCallback(async (definition: string, artifacts: string[], neuron: string) => {
    if (!neuron) return;
    setGlassLoading(true);
    setGlassResult(null);
    try {
      const result = await DefineService.ExplainDefine(definition, artifacts, neuron);
      setGlassResult(result as any);
    } catch {
      // non-fatal — Glass only works post-define
    } finally {
      setGlassLoading(false);
    }
  }, []);

  const handleNeuronSelect = (name: string) => {
    setSelectedNeuron(name);
    const parsed = parseNeuron(name);
    setSelectedVersion(parsed.version);
    setSelectedCommit('');
    setCommits([]);
    setDefineResult(null);
    setGlassResult(null);
    setStatusMessage('');
  };

  const loadCommitsFor = useCallback(async (neuron: string) => {
    if (!neuron) return;
    setLoading(true);
    const msg = `Loading commits for ${neuron}...`;
    setStatusMessage(msg);
    try {
      const parsed = parseNeuron(neuron);
      setStatusMessage(`Calling GetDefineCommits(org=${state.organisation}, product=${state.product}, id=${parsed.id}, version=${parsed.version})`);
      const result = await DefineService.GetDefineCommits(
        state.organisation,
        state.product,
        parsed.id,
        parsed.version,
        20
      );
      setCommits(result);
      setStatusMessage(`Loaded ${result.length} commits successfully`);
    } catch (err: any) {
      const errMsg = `Failed: ${err?.message || err || 'unknown error'}`;
      setStatusMessage(errMsg);
    } finally {
      setLoading(false);
    }
  }, [state.organisation, state.product]);

  const loadCommits = useCallback(async () => {
    if (!selectedNeuron) return;
    await loadCommitsFor(selectedNeuron);
  }, [selectedNeuron, loadCommitsFor]);

  const handleRunDefine = async () => {
    if (!selectedNeuron || !selectedCommit) return;
    setLoading(true);
    setStatusMessage('Starting Define operation...');
    setDefineResult(null);
    try {
      const parsed = parseNeuron(selectedNeuron);
      const resourceName = `organisations/${state.organisation}/products/${state.product}/neurons/${parsed.id}-${parsed.version}`;
      const result = await DefineService.RunDefine(resourceName, selectedCommit, '');
      setDefineResult(result as any);
      setStatusMessage('Define started. Polling for completion...');
    } catch (err: any) {
      setStatusMessage(`Define failed: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRunDeploy = async () => {
    if (!selectedNeuron || selectedEnvs.length === 0) return;
    const parsed = parseNeuron(selectedNeuron);
    const neuronResource = `organisations/${state.organisation}/products/${state.product}/neurons/${parsed.id}-${parsed.version}`;
    setDeployLoading(true);
    setDeployStatusMessage('Starting Deploy operation...');
    setDeployResult(null);
    deployTermRef.current?.clear();
    try {
      const result = await DeployService.RunDeploy(neuronResource, deployVersion, selectedEnvs, planOnly, betaDeploy);
      setDeployResult(result as any);
      setDeployStatusMessage('Deploy started. Polling for completion...');
    } catch (err: any) {
      setDeployStatusMessage(`Deploy failed: ${err.message || err}`);
    } finally {
      setDeployLoading(false);
    }
  };

  const handleStageClick = (id: StageId) => {
    setActiveStage(id);
  };

  useEffect(() => {
    if (preselectedNeuron && activeStage === 'define') {
      setSelectedNeuron(preselectedNeuron);
      loadCommitsFor(preselectedNeuron);
    }
  }, [preselectedNeuron, activeStage]);


  useEffect(() => {
    if (!deployResult || deployResult.done) return;
    const interval = setInterval(async () => {
      try {
        const result = await DeployService.PollDeployOperation(deployResult.operationName);
        setDeployResult(result as any);
        if (result?.notes) setDeployStatusMessage(result.notes);
        if (result?.done) {
          setDeployStatusMessage(result.error ? 'Deploy failed.' : 'Deploy complete.');
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [deployResult?.operationName, deployResult?.done]);

  useEffect(() => {
    const logsUrl = deployResult?.deployments?.[0]?.logsUrl;
    if (!logsUrl) return;
    let offset = 0;
    const interval = setInterval(async () => {
      try {
        const chunk = await DeployService.FetchDeployLogs(logsUrl, offset);
        if (chunk?.content) {
          deployTermRef.current?.write(chunk.content);
          offset = chunk.nextOffset;
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [deployResult?.deployments?.[0]?.logsUrl]);

  useEffect(() => {
    if (!defineResult || defineResult.done) return;
    const neuronName = selectedNeuron
      ? (() => { const p = parseNeuron(selectedNeuron); return `organisations/${state.organisation}/products/${state.product}/neurons/${p.id}-${p.version}`; })()
      : '';
    const interval = setInterval(async () => {
      try {
        const result = await DefineService.PollDefineOperation(defineResult.operationName);
        setDefineResult(result as any);
        if (result?.done) {
          if (!result.error && result.definition && neuronName) {
            setStatusMessage('Define complete — loading Glass...');
            loadGlass(result.definition, result.definitionArtifacts ?? [], neuronName);
          } else {
            setStatusMessage(result.error ? 'Define failed.' : 'Define completed.');
          }
          clearInterval(interval);
        } else if (result?.notes) {
          setStatusMessage(result.notes);
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [defineResult?.operationName, defineResult?.done]);

  return (
    <PageLayout
      title="Define-Build-Deploy"
      subtitle="Build and deploy microservices"
      parentRoute="/"
    >
      <div className="flex flex-1 h-full overflow-hidden">
        <div className="w-[240px] border-r border-[#464646] shrink-0 overflow-y-auto p-[16px]">
          <div className="flex flex-col gap-[4px]">
            {stages.map((stage, i) => {
              const isActive = activeStage === stage.id;
              const isComplete = currentStageIndex > i;
              return (
                <button
                  key={stage.id}
                  onClick={() => handleStageClick(stage.id)}
                  className={`flex items-center gap-[10px] px-[12px] py-[8px] rounded-[4px] text-left transition-all ${
                    isActive
                      ? 'bg-[rgba(248,129,169,0.1)] border border-[#f881a9]'
                      : 'hover:bg-[rgba(255,255,255,0.03)] border border-transparent'
                  }`}
                >
                  <div
                    className={`size-[20px] rounded-full flex items-center justify-center shrink-0 ${
                      isComplete
                        ? 'bg-[#f881a9]'
                        : isActive
                          ? 'bg-[rgba(248,129,169,0.2)] border border-[#f881a9]'
                          : 'bg-[#2c2c2c] border border-[#464646]'
                    }`}
                  >
                    {isComplete ? (
                      <Icon icon="solar:check-linear" className="text-[10px] text-[#6f0025]" />
                    ) : (
                      <span
                        className={`text-[9px] font-bold font-['JetBrains_Mono',sans-serif] ${
                          isActive ? 'text-[#f881a9]' : 'text-[rgba(255,255,255,0.4)]'
                        }`}
                      >
                        {i + 1}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <p
                      className={`text-[10px] font-bold uppercase font-['JetBrains_Mono',sans-serif] ${
                        isActive ? 'text-white' : 'text-[rgba(255,255,255,0.5)]'
                      }`}
                    >
                      {stage.label}
                    </p>
                    <p className="text-[8px] text-[rgba(255,255,255,0.3)] uppercase">{stage.eyebrow}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeStage === 'overview' && (
            <div className="p-[24px] max-w-[900px] mx-auto">
              <p className="text-[11px] text-[rgba(255,255,255,0.5)] uppercase font-bold mb-[16px]">DBD</p>
              <h2 className="text-[22px] font-bold text-white font-['JetBrains_Mono',sans-serif] mb-[16px]">
                Define-Build-Deploy Pipeline
              </h2>
              <p className="text-[13px] text-[rgba(255,255,255,0.7)] leading-[1.6] mb-[32px]">
                The DBD pipeline is the core engineering workflow on the Alis platform.
                It guides you through creating protobuf definitions, implementing Go business logic,
                and deploying to Google Cloud Run.
              </p>

              <div className="flex items-center justify-center gap-[20px] mb-[32px] p-[24px] bg-[#2c2c2c] border border-[#464646] rounded-[8px]">
                <div className="flex flex-col items-center gap-[8px]">
                  <div className="size-[48px] rounded-full bg-[rgba(248,129,169,0.15)] border border-[#f881a9] flex items-center justify-center">
                    <Icon icon="solar:document-text-linear" className="text-[#f881a9] text-2xl" />
                  </div>
                  <p className="text-[10px] font-bold uppercase font-['JetBrains_Mono',sans-serif] text-white">Define</p>
                  <p className="text-[9px] text-[rgba(255,255,255,0.5)] text-center">Protobuf API<br />contracts</p>
                </div>
                <Icon icon="solar:alt-arrow-right-linear" className="text-[#f881a9] text-xl" />
                <div className="flex flex-col items-center gap-[8px]">
                  <div className="size-[48px] rounded-full bg-[rgba(248,129,169,0.15)] border border-[#f881a9] flex items-center justify-center">
                    <Icon icon="solar:code-linear" className="text-[#f881a9] text-2xl" />
                  </div>
                  <p className="text-[10px] font-bold uppercase font-['JetBrains_Mono',sans-serif] text-white">Build</p>
                  <p className="text-[9px] text-[rgba(255,255,255,0.5)] text-center">Go business<br />logic</p>
                </div>
                <Icon icon="solar:alt-arrow-right-linear" className="text-[#f881a9] text-xl" />
                <div className="flex flex-col items-center gap-[8px]">
                  <div className="size-[48px] rounded-full bg-[rgba(248,129,169,0.15)] border border-[#f881a9] flex items-center justify-center">
                    <Icon icon="solar:cloud-upload-linear" className="text-[#f881a9] text-2xl" />
                  </div>
                  <p className="text-[10px] font-bold uppercase font-['JetBrains_Mono',sans-serif] text-white">Deploy</p>
                  <p className="text-[9px] text-[rgba(255,255,255,0.5)] text-center">Cloud Run<br />infrastructure</p>
                </div>
              </div>

              <Button
                variant="primary"
                className="px-[24px] py-[10px]"
                onClick={() => setActiveStage('quickstart')}
              >
                Get Started
              </Button>
            </div>
          )}

          {activeStage === 'quickstart' && (
            <div className="p-[24px] max-w-[900px] mx-auto">
              <p className="text-[11px] text-[rgba(255,255,255,0.5)] uppercase font-bold mb-[16px]">Setup</p>
              <h2 className="text-[18px] font-bold text-white font-['JetBrains_Mono',sans-serif] mb-[16px]">
                Select a Neuron
              </h2>
              <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-[1.5] mb-[24px]">
                Choose a microservice (neuron) to work with.
              </p>

              <StageCard title="Target Service" step={1} className="mb-[16px]">
                <div className="flex flex-wrap gap-[8px]">
                  {state.neurons.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleNeuronSelect(n.name)}
                      className={`px-[12px] py-[6px] rounded-[4px] text-[10px] font-bold font-['JetBrains_Mono',sans-serif] uppercase transition-all ${
                        selectedNeuron === n.name
                          ? 'bg-[#f881a9] text-[#6f0025]'
                          : 'bg-[#1e1e1e] border border-[#464646] text-white hover:bg-[#2c2c2c]'
                      }`}
                    >
                      {n.name}
                    </button>
                  ))}
                </div>
              </StageCard>

              <div className="flex justify-between mt-[24px]">
                <Button variant="ghost" onClick={() => setActiveStage('overview')}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  className="px-[20px]"
                  disabled={!selectedNeuron}
                  onClick={async () => {
                    await loadCommitsFor(selectedNeuron);
                    setActiveStage('define');
                  }}
                >
                  Next: Define
                </Button>
              </div>
            </div>
          )}

          {activeStage === 'define' && (
            <div className="p-[24px] max-w-[900px] mx-auto">
              <p className="text-[11px] text-[rgba(255,255,255,0.5)] uppercase font-bold mb-[16px]">API contract</p>
              <h2 className="text-[18px] font-bold text-white font-['JetBrains_Mono',sans-serif] mb-[16px]">
                Define Protobuf API
              </h2>
              <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-[1.5] mb-[24px]">
                Select a commit from the define repository and run the Define step.
                The backend compiles protos and generates language artifacts.
              </p>

              {selectedNeuron && (
                <div className="mb-[16px]"><ConfigValue label="Selected Neuron" value={selectedNeuron} /></div>
              )}

              <StageCard title="Select Commit" step={1} className="mb-[16px]">
                {loading && commits.length === 0 ? (
                  <div className="flex items-center gap-[8px]">
                    <Loader size={20} />
                    <span className="text-[11px] text-[rgba(255,255,255,0.7)]">Loading commits...</span>
                  </div>
                ) : commits.length === 0 ? (
                  <div>
                    <p className="text-[11px] text-[rgba(255,255,255,0.5)] mb-[8px]">
                      {statusMessage ? statusMessage : (selectedNeuron ? 'No commits found. Click refresh.' : 'Select a neuron first.')}
                    </p>
                    <Button variant="secondary" className="px-[12px]" onClick={loadCommits} disabled={!selectedNeuron}>
                      <Icon icon="solar:refresh-linear" className="text-base mr-[4px]" />
                      Refresh
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-[4px] max-h-[300px] overflow-y-auto">
                    {commits.map((c) => (
                      <button
                        key={c.sha}
                        onClick={() => setSelectedCommit(c.sha)}
                        className={`text-left px-[12px] py-[8px] rounded-[4px] text-[10px] font-['JetBrains_Mono',sans-serif] transition-all ${
                          selectedCommit === c.sha
                            ? 'bg-[rgba(248,129,169,0.1)] border border-[#f881a9]'
                            : 'hover:bg-[rgba(255,255,255,0.03)] border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-[8px]">
                          <span className="text-[#f881a9] font-bold">{c.sha.substring(0, 7)}</span>
                          <span className="text-white">{c.message}</span>
                        </div>
                        <p className="text-[rgba(255,255,255,0.4)] mt-[2px]">{c.author}</p>
                      </button>
                    ))}
                  </div>
                )}
              </StageCard>

              <StageCard title="Run Define" step={2}>
                <div className="flex items-center gap-[8px] mb-[8px]">
                  <input
                    type="checkbox"
                    id="defineUpdated"
                    checked={defineUpdated}
                    onChange={(e) => setDefineUpdated(e.target.checked)}
                    className="accent-[#f881a9]"
                  />
                  <label htmlFor="defineUpdated" className="text-[10px] text-[rgba(255,255,255,0.7)] cursor-pointer">
                    I have reviewed the proto files
                  </label>
                </div>
                <div className="flex items-center gap-[8px] mb-[12px]">
                  <input
                    type="checkbox"
                    id="defineCommitted"
                    checked={defineCommitted}
                    onChange={(e) => setDefineCommitted(e.target.checked)}
                    className="accent-[#f881a9]"
                  />
                  <label htmlFor="defineCommitted" className="text-[10px] text-[rgba(255,255,255,0.7)] cursor-pointer">
                    The selected commit is the correct definition
                  </label>
                </div>

                <Button
                  variant="primary"
                  className="px-[16px]"
                  disabled={!(defineUpdated && defineCommitted && selectedCommit) || loading}
                  onClick={handleRunDefine}
                >
                  {loading ? 'Running...' : 'Run Define'}
                </Button>
              </StageCard>

              {statusMessage && (
                <div className="mt-[16px] p-[12px] bg-[#2c2c2c] border border-[#464646] rounded-[4px]">
                  <div className="flex items-center gap-[8px]">
                    <Loader size={20} />
                    <p className="text-[11px] text-[rgba(255,255,255,0.8)]">{statusMessage}</p>
                  </div>
                </div>
              )}

              {defineResult?.done && !defineResult?.error && (
                <div className="mt-[16px] p-[12px] bg-[rgba(52,199,89,0.1)] border border-[#34C759] rounded-[4px]">
                  <div className="flex items-center gap-[8px]">
                    <Icon icon="solar:check-circle-linear" className="text-[#34C759] text-lg" />
                    <div>
                      <p className="text-[11px] text-white font-bold">Define Complete</p>
                      {defineResult.definition && (
                        <p className="text-[10px] text-[rgba(255,255,255,0.7)]">
                          Definition: {defineResult.definition} · Version: {defineResult.version}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {defineResult?.error && (
                <div className="mt-[16px] p-[12px] bg-[rgba(255,92,95,0.1)] border border-[#FF5C5F] rounded-[4px]">
                  <div className="flex items-center gap-[8px]">
                    <Icon icon="solar:close-circle-linear" className="text-[#FF5C5F] text-lg" />
                    <p className="text-[11px] text-white">{defineResult.error}</p>
                  </div>
                </div>
              )}

              {/* Glass panel — shown after define completes */}
              {(glassLoading || glassResult) && (
                <StageCard title="Glass" step={3} className="mt-[16px]">
                  {glassLoading ? (
                    <div className="flex items-center gap-[8px]">
                      <Loader size={20} />
                      <span className="text-[11px] text-[rgba(255,255,255,0.5)]">Loading Glass...</span>
                    </div>
                  ) : glassResult && (
                    <div>
                      {glassResult.title && (
                        <p className="text-[12px] font-bold text-white mb-[4px]">{glassResult.title}</p>
                      )}
                      {glassResult.summary && (
                        <p className="text-[11px] text-[rgba(255,255,255,0.6)] leading-[1.5] mb-[12px]">{glassResult.summary}</p>
                      )}
                      {glassResult.definition?.version && (
                        <div className="flex gap-[8px] mb-[12px]">
                          <span className="text-[9px] uppercase font-bold font-['JetBrains_Mono',sans-serif] px-[6px] py-[2px] rounded bg-[#2c2c2c] border border-[#464646] text-[rgba(255,255,255,0.5)]">
                            {glassResult.definition.version}
                          </span>
                          {glassResult.definition.releaseType && (
                            <span className="text-[9px] uppercase font-bold font-['JetBrains_Mono',sans-serif] px-[6px] py-[2px] rounded bg-[rgba(248,129,169,0.1)] border border-[rgba(248,129,169,0.3)] text-[#f881a9]">
                              {glassResult.definition.releaseType}
                            </span>
                          )}
                        </div>
                      )}
                      {glassResult.artifacts && glassResult.artifacts.length > 0 && (
                        <div>
                          <p className="text-[9px] uppercase font-bold text-[rgba(255,255,255,0.4)] mb-[8px] font-['JetBrains_Mono',sans-serif]">
                            Artifacts
                          </p>
                          <div className="flex flex-wrap gap-[6px]">
                            {glassResult.artifacts.map((a, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-[4px] px-[8px] py-[4px] rounded bg-[#2c2c2c] border border-[#464646]"
                                title={a.locationUri || a.notes || a.type}
                              >
                                <span className="size-[6px] rounded-full shrink-0"
                                  style={{ backgroundColor: a.state === 1 ? '#34C759' : a.state === 0 ? '#f881a9' : '#ff9500' }}
                                />
                                <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-white">{a.type}</span>
                                {a.extra && (
                                  <span className="text-[9px] text-[rgba(255,255,255,0.4)] max-w-[120px] truncate">{a.extra}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </StageCard>
              )}

              <div className="flex justify-between mt-[24px]">
                <Button variant="ghost" onClick={() => setActiveStage('quickstart')}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  className="px-[20px]"
                  disabled={!defineResult?.done || !!defineResult?.error}
                  onClick={() => setActiveStage('build')}
                >
                  Next: Build
                </Button>
              </div>
            </div>
          )}

          {activeStage === 'build' && (
            <div className="p-[24px] max-w-[900px] mx-auto">
              <p className="text-[11px] text-[rgba(255,255,255,0.5)] uppercase font-bold mb-[16px]">Implementation</p>
              <h2 className="text-[18px] font-bold text-white font-['JetBrains_Mono',sans-serif] mb-[16px]">
                Build Go Service
              </h2>
              <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-[1.5] mb-[24px]">
                Implement the business logic in Go. The generated protobuf code provides the
                server skeleton.
              </p>

              <StageCard title="Implement the Service" step={1} className="mb-[16px]">
                <p className="text-[11px] text-[rgba(255,255,255,0.7)] mb-[12px]">
                  Implement the gRPC service handlers:
                </p>
                <CodeBlock
                  title="service.go"
                  language="go"
                  code={`func (s *myServer) GetResource(
  ctx context.Context,
  req *pb.GetResourceRequest,
) (*pb.Resource, error) {
  if err := validateRequest(req); err != nil {
    return nil, err
  }
  resource, err := s.db.GetResource(ctx, req.GetName())
  if err != nil {
    return nil, status.Error(codes.NotFound, "resource not found")
  }
  return resource, nil
}`}
                />
                <Button variant="primary" className="mt-[12px] px-[16px]">
                  Run Build
                </Button>
              </StageCard>

              <div className="flex justify-between mt-[24px]">
                <Button variant="ghost" onClick={() => setActiveStage('define')}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  className="px-[20px]"
                  onClick={() => setActiveStage('deploy')}
                >
                  Next: Deploy
                </Button>
              </div>
            </div>
          )}

          {activeStage === 'deploy' && (
            <div className="p-[24px] max-w-[900px] mx-auto">
              <p className="text-[11px] text-[rgba(255,255,255,0.5)] uppercase font-bold mb-[16px]">Infrastructure</p>
              <h2 className="text-[18px] font-bold text-white font-['JetBrains_Mono',sans-serif] mb-[16px]">
                Deploy to Cloud Run
              </h2>
              <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-[1.5] mb-[24px]">
                Select target environments, specify the neuron version, and deploy.
              </p>

              {selectedNeuron && (
                <div className="mb-[16px]"><ConfigValue label="Target Neuron" value={selectedNeuron} /></div>
              )}

              <StageCard title="Select Environments" step={1} className="mb-[16px]">
                {state.loadedEnvs.length === 0 && !state.envsError ? (
                  <div className="flex items-center gap-[8px]">
                    <Loader size={20} />
                    <span className="text-[11px] text-[rgba(255,255,255,0.7)]">Loading environments...</span>
                  </div>
                ) : state.envsError ? (
                  <p className="text-[11px] text-[rgba(255,255,255,0.5)]">{state.envsError}</p>
                ) : (
                  <div className="flex flex-wrap gap-[8px]">
                    {state.loadedEnvs.map((env) => (
                      <button
                        key={env.name}
                        onClick={() => setSelectedEnvs(prev =>
                          prev.includes(env.name) ? prev.filter(e => e !== env.name) : [...prev, env.name]
                        )}
                        className={`px-[12px] py-[6px] rounded-[4px] text-[10px] font-bold font-['JetBrains_Mono',sans-serif] uppercase transition-all ${
                          selectedEnvs.includes(env.name)
                            ? 'bg-[#f881a9] text-[#6f0025]'
                            : 'bg-[#1e1e1e] border border-[#464646] text-white hover:bg-[#2c2c2c]'
                        }`}
                      >
                        {env.displayName || env.name}
                      </button>
                    ))}
                  </div>
                )}
              </StageCard>

              <StageCard title="Version & Options" step={2} className="mb-[16px]">
                <div className="flex flex-col gap-[10px]">
                  <div>
                    <label className="text-[9px] uppercase font-bold text-[rgba(255,255,255,0.4)] font-['JetBrains_Mono',sans-serif] block mb-[4px]">
                      Neuron Version
                    </label>
                    <input
                      type="text"
                      value={deployVersion}
                      onChange={(e) => setDeployVersion(e.target.value)}
                      placeholder="e.g. 1.0.42"
                      className="bg-[#1e1e1e] border border-[#464646] rounded-[4px] px-[10px] py-[6px] text-[11px] text-white font-['JetBrains_Mono',sans-serif] w-[200px] focus:outline-none focus:border-[#f881a9]"
                    />
                  </div>
                  <div className="flex items-center gap-[16px]">
                    <label className="flex items-center gap-[6px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={planOnly}
                        onChange={(e) => setPlanOnly(e.target.checked)}
                        className="accent-[#f881a9]"
                      />
                      <span className="text-[10px] text-[rgba(255,255,255,0.7)]">Plan only (dry run)</span>
                    </label>
                    <label className="flex items-center gap-[6px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={betaDeploy}
                        onChange={(e) => setBetaDeploy(e.target.checked)}
                        className="accent-[#f881a9]"
                      />
                      <span className="text-[10px] text-[rgba(255,255,255,0.7)]">Beta</span>
                    </label>
                  </div>
                </div>
              </StageCard>

              <StageCard title="Run Deploy" step={3} className="mb-[16px]">
                <Button
                  variant="primary"
                  className="px-[16px]"
                  disabled={selectedEnvs.length === 0 || !deployVersion || deployLoading || (!!deployResult && !deployResult.done)}
                  onClick={handleRunDeploy}
                >
                  {deployLoading ? 'Starting...' : (deployResult && !deployResult.done) ? 'Deploying...' : 'Run Deploy'}
                </Button>
              </StageCard>

              {deployStatusMessage && (
                <div className="mb-[16px] p-[12px] bg-[#2c2c2c] border border-[#464646] rounded-[4px]">
                  <div className="flex items-center gap-[8px]">
                    {deployResult && !deployResult.done && (
                      <Loader size={20} />
                    )}
                    <p className="text-[11px] text-[rgba(255,255,255,0.8)]">{deployStatusMessage}</p>
                  </div>
                </div>
              )}

              {deployResult?.done && !deployResult?.error && (
                <div className="mb-[16px] p-[12px] bg-[rgba(52,199,89,0.1)] border border-[#34C759] rounded-[4px]">
                  <div className="flex items-center gap-[8px]">
                    <Icon icon="solar:check-circle-linear" className="text-[#34C759] text-lg" />
                    <p className="text-[11px] text-white font-bold">
                      Deploy Complete{deployResult.version ? ` · ${deployResult.version}` : ''}
                    </p>
                  </div>
                </div>
              )}

              {deployResult?.error && (
                <div className="mb-[16px] p-[12px] bg-[rgba(255,92,95,0.1)] border border-[#FF5C5F] rounded-[4px]">
                  <div className="flex items-center gap-[8px]">
                    <Icon icon="solar:close-circle-linear" className="text-[#FF5C5F] text-lg" />
                    <p className="text-[11px] text-white">{deployResult.error}</p>
                  </div>
                </div>
              )}

              {deployResult?.deployments?.[0]?.logsUrl && (
                <div className="mb-[16px] rounded-[4px] overflow-hidden border border-[#464646]">
                  <div className="px-[16px] py-[8px] bg-[#2c2c2c] border-b border-[#464646] flex items-center justify-between">
                    <p className="text-[9px] font-bold uppercase font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.5)]">
                      Deploy Logs
                    </p>
                    <a
                      href={deployResult.deployments[0].logsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[9px] text-[#f881a9] hover:underline font-['JetBrains_Mono',sans-serif]"
                    >
                      Open in browser
                    </a>
                  </div>
                  <BuildTerminal ref={deployTermRef} className="h-[300px]" />
                </div>
              )}

              <div className="flex justify-between mt-[24px]">
                <Button variant="ghost" onClick={() => setActiveStage('build')}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  className="px-[20px]"
                  disabled={!deployResult?.done || !!deployResult?.error}
                  onClick={() => setActiveStage('playground')}
                >
                  Next: Playground
                </Button>
              </div>
            </div>
          )}

          {activeStage === 'playground' && (
            <div className="p-[24px] max-w-[900px] mx-auto">
              <p className="text-[11px] text-[rgba(255,255,255,0.5)] uppercase font-bold mb-[16px]">Validation</p>
              <h2 className="text-[18px] font-bold text-white font-['JetBrains_Mono',sans-serif] mb-[16px]">
                Test Your Service
              </h2>
              <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-[1.5] mb-[24px]">
                Run generated tests to validate your service.
              </p>

              <StageCard title="Run Tests" step={1}>
                <CodeBlock
                  title="main_test.go"
                  language="go"
                  code={`func TestGetResource(t *testing.T) {
  srv := newTestServer()
  defer srv.Close()
  resp, err := srv.Client().GetResource(ctx, &pb.GetResourceRequest{
    Name: "resources/test-123",
  })
  require.NoError(t, err)
  require.NotNil(t, resp)
}`}
                />
                <Button variant="primary" className="mt-[12px] px-[16px]">
                  Open Playground
                </Button>
              </StageCard>

              <div className="flex justify-between mt-[24px]">
                <Button variant="ghost" onClick={() => setActiveStage('deploy')}>
                  Back
                </Button>
                <Button variant="secondary" className="px-[20px]" onClick={() => setActiveStage('overview')}>
                  Start Over
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
