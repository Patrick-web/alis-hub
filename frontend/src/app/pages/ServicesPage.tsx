import { useState, useEffect, useMemo } from 'react';
import { Icon } from '@iconify/react';
import { Input } from '../components/Input';
import { useWorkspace } from '../stores/workspace';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';
import { Loader } from '../components/Loader';

type NeuronItem = { id: string; version: string; state: number };
type DeploymentItem = { neuronId: string; version: string; state: number; logsUrl: string };
type EnvDeployments = { name: string; displayName: string; deployments: DeploymentItem[] };
type ServicesOverview = { neurons: NeuronItem[]; environments: EnvDeployments[] };

function DeployBadge({ state }: { state: number }) {
  switch (state) {
    case 1:
      return (
        <div className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-[4px] bg-[rgba(52,199,89,0.12)] border border-[rgba(52,199,89,0.25)]">
          <Icon icon="solar:check-circle-linear" className="text-[#34C759] text-[11px]" />
          <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[#34C759]">Running</span>
        </div>
      );
    case 2:
      return (
        <div className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-[4px] bg-[rgba(10,132,255,0.12)] border border-[rgba(10,132,255,0.25)]">
          <Icon icon="solar:cloud-upload-linear" className="text-[#0A84FF] text-[11px]" />
          <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[#0A84FF]">Deploying</span>
        </div>
      );
    case 3:
      return (
        <div className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-[4px] bg-[rgba(255,92,95,0.12)] border border-[rgba(255,92,95,0.25)]">
          <Icon icon="solar:close-circle-linear" className="text-[#FF5C5F] text-[11px]" />
          <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[#FF5C5F]">Deploy failed</span>
        </div>
      );
    case 4:
    case 5:
    case 7:
    case 9:
      return (
        <div className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-[4px] bg-[rgba(255,214,10,0.12)] border border-[rgba(255,214,10,0.25)]">
          <Icon icon="solar:refresh-linear" className="text-[#FFD60A] text-[11px]" />
          <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[#FFD60A]">Planning</span>
        </div>
      );
    case 6:
    case 8:
      return (
        <div className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-[4px] bg-[rgba(255,92,95,0.12)] border border-[rgba(255,92,95,0.25)]">
          <Icon icon="solar:close-circle-linear" className="text-[#FF5C5F] text-[11px]" />
          <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[#FF5C5F]">Plan failed</span>
        </div>
      );
    case 10:
      return (
        <div className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-[4px] bg-[rgba(255,159,10,0.12)] border border-[rgba(255,159,10,0.25)]">
          <Icon icon="solar:trash-bin-2-linear" className="text-[#FF9F0A] text-[11px]" />
          <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[#FF9F0A]">Destroying</span>
        </div>
      );
    case 11:
      return (
        <div className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-[4px] bg-[rgba(255,92,95,0.12)] border border-[rgba(255,92,95,0.25)]">
          <Icon icon="solar:close-circle-linear" className="text-[#FF5C5F] text-[11px]" />
          <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[#FF5C5F]">Destroy failed</span>
        </div>
      );
    case 12:
      return (
        <div className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-[4px] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)]">
          <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.4)]">Destroyed</span>
        </div>
      );
    default:
      return <span className="text-[10px] text-[rgba(255,255,255,0.25)]">—</span>;
  }
}

function EnvCell({ neuronVersion, dep }: { neuronVersion: string; dep?: DeploymentItem }) {
  if (!dep) {
    return (
      <div className="flex flex-col items-start gap-[4px]">
        <span className="text-[10px] text-[rgba(255,255,255,0.25)]">—</span>
      </div>
    );
  }

  const isBehind = dep.version !== neuronVersion;

  return (
    <div className="flex flex-col items-start gap-[5px]">
      <div className="flex items-center gap-[5px]">
        <span className="text-[11px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.7)]">
          v{dep.version}
        </span>
        {isBehind && (
          <span className="size-[6px] rounded-full bg-[#FF9F0A] shrink-0" title="Behind latest" />
        )}
      </div>
      <DeployBadge state={dep.state} />
    </div>
  );
}

export function ServicesPage() {
  const { state } = useWorkspace();
  const [overview, setOverview] = useState<ServicesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);
    ProductService.GetServicesOverview(state.organisation, state.product)
      .then((result: any) => {
        setOverview(result);
      })
      .catch((err: any) => {
        setError(String(err));
      })
      .finally(() => setLoading(false));
  }, [state.organisation, state.product]);

  const filtered = useMemo(() => {
    if (!overview) return [];
    const q = filter.toLowerCase();
    return q ? overview.neurons.filter(n => n.id.toLowerCase().includes(q)) : overview.neurons;
  }, [overview, filter]);

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#1e1e1e]">
      {/* Page header */}
      <div className="px-[20px] py-[6px] border-b border-[#464646] flex items-center justify-between shrink-0">
        <p className="font-['JetBrains_Mono',sans-serif] font-bold text-[10px] text-[rgba(255,255,255,0.5)] uppercase">
          Services
        </p>
        {overview && (
          <p className="text-[10px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif]">
            {overview.neurons.length} services · {overview.environments.length} environments
          </p>
        )}
      </div>

      {/* Toolbar */}
      <div className="border-b border-[#464646] px-[20px] py-[8px] flex items-center gap-[8px] shrink-0">
        <div className="flex items-center h-[34px]">
          <div className="bg-[#2c2c2c] border border-[#464646] px-[12px] h-full flex items-center justify-center border-r-0 rounded-l-[4px]">
            <p className="text-[12px] text-white">/</p>
          </div>
          <Input
            placeholder="Filter services..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-[260px] border-l-0 rounded-l-none h-full"
            containerClassName="h-full"
          />
        </div>
        {!loading && !error && (
          <button
            onClick={() => {
              setLoading(true);
              ProductService.GetServicesOverview(state.organisation, state.product)
                .then((r: any) => setOverview(r))
                .catch((e: any) => setError(String(e)))
                .finally(() => setLoading(false));
            }}
            className="flex items-center gap-[4px] px-[8px] h-[34px] text-[rgba(255,255,255,0.5)] hover:text-white transition-colors text-[10px]"
            title="Refresh"
          >
            <Icon icon="solar:refresh-linear" className="text-base" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="p-[16px] bg-[rgba(255,92,95,0.1)] border border-[rgba(255,92,95,0.3)] rounded-[6px] max-w-[400px]">
              <div className="flex items-center gap-[8px] mb-[8px]">
                <Icon icon="solar:close-circle-linear" className="text-[#FF5C5F] text-lg" />
                <p className="text-[12px] font-bold text-white">Failed to load</p>
              </div>
              <p className="text-[11px] text-[rgba(255,255,255,0.6)]">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && overview && (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-[#1e1e1e]">
              <tr className="border-b border-[#464646]">
                <th className="text-left px-[20px] py-[8px] w-[220px]">
                  <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.4)] uppercase">
                    Service
                  </span>
                </th>
                <th className="text-left px-[16px] py-[8px] w-[120px]">
                  <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.4)] uppercase">
                    Latest
                  </span>
                </th>
                {overview.environments.map(env => (
                  <th key={env.name} className="text-left px-[16px] py-[8px] min-w-[180px]">
                    <span className="text-[10px] font-bold font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.4)] uppercase">
                      {env.displayName}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(neuron => (
                <tr
                  key={neuron.id}
                  className="border-b border-[#2e2e2e] hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                >
                  <td className="px-[20px] py-[12px]">
                    <span className="text-[12px] font-bold font-['JetBrains_Mono',sans-serif] text-white">
                      {neuron.id}
                    </span>
                  </td>
                  <td className="px-[16px] py-[12px]">
                    <span className="text-[11px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.5)]">
                      v{neuron.version}
                    </span>
                  </td>
                  {overview.environments.map(env => {
                    const dep = env.deployments.find(d => d.neuronId === neuron.id);
                    return (
                      <td key={env.name} className="px-[16px] py-[12px]">
                        <EnvCell neuronVersion={neuron.version} dep={dep} />
                      </td>
                    );
                  })}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={2 + (overview.environments.length || 0)}
                    className="px-[20px] py-[32px] text-center"
                  >
                    <span className="text-[12px] text-[rgba(255,255,255,0.3)]">
                      No services match "{filter}"
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
