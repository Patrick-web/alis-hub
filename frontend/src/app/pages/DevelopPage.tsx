import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { ActionButton } from '../components/ActionButton';
import { Dropdown } from '../components/Dropdown';
import { StageCard } from '../components/StageCard';
import { Table } from '../components/Table';
import { ConfigValue } from '../components/ConfigValue';
import { useWorkspace } from '../stores/workspace';
import * as DefineService from '../../../bindings/alis-hub-v3/defineservice';
import * as SM from '../../../bindings/alis-hub-v3/servicemanager';

type ServiceTab = 'services' | 'dbd';

export function DevelopPage() {
  const { state, setNeurons, updateWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterText, setFilterText] = useState('');
  const [activeTab, setActiveTab] = useState<ServiceTab>('services');
  const [packages, setPackages] = useState<{ name: string; language: string; artifactId: string }[]>([]);
  const [, setLoadingPkgs] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const services = await SM.GetServices();
        if (services && services.length > 0) {
          setNeurons(services.map(s => ({
            id: s.id,
            name: s.name,
            type: (s as any).type ?? 2,
            state: (s as any).state ?? 1,
            latestBuild: s.latestBuild,
            envs: [],
          })));
        }
      } catch {
        // fall back to hardcoded data
      }
    };
    load();
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
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
      const m = first.match(/^(.+)-v(\d+)$/);
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
    updateWorkspace({ activeNeuronIds: [neuronName] });
    navigate(`/deployments?neuron=${encodeURIComponent(neuronName)}&stage=${stage}`);
  };

  const handleGlobalAction = (stage: string) => {
    const target = selectedNeuronNames[0] || state.neurons[0]?.name;
    if (!target) return;
    updateWorkspace({ activeNeuronIds: selectedNeuronNames });
    navigate(`/deployments?neuron=${encodeURIComponent(target)}&stage=${stage}`);
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
      <div className="border-b border-[#464646] px-[20px] py-[6px] flex items-center gap-[20px]">
        <button
          onClick={() => setActiveTab('services')}
          className={`px-[12px] py-[8px] text-[10px] font-bold uppercase font-['JetBrains_Mono',sans-serif] transition-all border-b-2 ${
            activeTab === 'services'
              ? 'text-[#f881a9] border-[#f881a9]'
              : 'text-[rgba(255,255,255,0.5)] border-transparent hover:text-white'
          }`}
        >
          Services
        </button>
        <button
          onClick={() => setActiveTab('dbd')}
          className={`px-[12px] py-[8px] text-[10px] font-bold uppercase font-['JetBrains_Mono',sans-serif] transition-all border-b-2 ${
            activeTab === 'dbd'
              ? 'text-[#f881a9] border-[#f881a9]'
              : 'text-[rgba(255,255,255,0.5)] border-transparent hover:text-white'
          }`}
        >
          Quick DBD
        </button>
      </div>

      {activeTab === 'services' && (
        <>
          <div className="border-b border-[#464646] px-[20px] py-[8px] flex items-center justify-between">
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
              <Dropdown label={`Packages${packages.length > 0 ? ` (${packages.length})` : ''}`} options={['Scan Packages', 'Manage Dependencies', 'Update All']} onSelect={(opt) => {
                if (opt === 'Scan Packages') handleScanPackages();
              }} />
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
            <div className="px-[20px] py-[8px] border-b border-[#464646] bg-[rgba(248,129,169,0.03)]">
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
        </>
      )}

      {activeTab === 'dbd' && (
        <div className="flex-1 overflow-y-auto p-[24px]">
          <div className="max-w-[900px] mx-auto">
            <p className="text-[11px] text-[rgba(255,255,255,0.5)] uppercase font-bold mb-[16px]">Quick DBD</p>
            <h2 className="text-[18px] font-bold text-white font-['JetBrains_Mono',sans-serif] mb-[16px]">
              Define-Build-Deploy
            </h2>
            <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-[1.6] mb-[24px]">
              Run a quick define on any service without navigating to the full wizard.
            </p>

            <StageCard title="Quick Define" step={1} className="mb-[16px]">
              <p className="text-[11px] text-[rgba(255,255,255,0.7)] mb-[12px]">
                Select a service and commit, then run define:
              </p>
              <div className="flex flex-wrap gap-[6px] mb-[16px]">
                {state.neurons.slice(0, 10).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => updateWorkspace({ activeNeuronIds: [n.name] })}
                    className={`px-[10px] py-[4px] rounded-[4px] text-[9px] font-bold font-['JetBrains_Mono',sans-serif] uppercase transition-all ${
                      state.activeNeuronIds[0] === n.name
                        ? 'bg-[#f881a9] text-[#6f0025]'
                        : 'bg-[#1e1e1e] border border-[#464646] text-white hover:bg-[#2c2c2c]'
                    }`}
                  >
                    {n.name}
                  </button>
                ))}
              </div>
              <Button
                variant="primary"
                className="px-[16px]"
                icon={<Icon icon="solar:alt-arrow-right-linear" className="text-base" />}
                onClick={() => {
                  const target = state.activeNeuronIds[0] || state.neurons[0]?.name;
                  if (target) navigate(`/deployments?neuron=${encodeURIComponent(target)}&stage=define`);
                }}
              >
                Open Define Wizard
              </Button>
            </StageCard>

            <StageCard title="Quick Build & Deploy" step={2}>
              <p className="text-[11px] text-[rgba(255,255,255,0.7)] mb-[12px]">
                Navigate to the full DBD wizard for the complete pipeline.
              </p>
              <div className="flex gap-[16px]">
                <ConfigValue label="Build Endpoint" value="Cloud Build (GCP)" />
                <ConfigValue label="Deploy Target" value="Cloud Run" />
                <ConfigValue label="Region" value={state.environmentGoogleRegion} />
              </div>
              <Button
                variant="secondary"
                className="mt-[12px] px-[16px]"
                icon={<Icon icon="solar:box-linear" className="text-base" />}
                onClick={() => navigate('/deployments')}
              >
                Full DBD Wizard
              </Button>
            </StageCard>
          </div>
        </div>
      )}
    </div>
  );
}
