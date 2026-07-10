import { useState, useEffect, useMemo } from "react";
import { Icon } from "@iconify/react";
import { Input } from "../components/Input";
import { EmptyState } from "../components/EmptyState";
import { useWorkspace } from "../stores/workspace";
import * as ProductService from "../../../bindings/alis-hub-v3/productservice";
import { Loader } from "../components/Loader";
import { NewServiceModal } from "../components/NewServiceModal";
import { Button } from "../components/Button";

type NeuronItem = { id: string; version: string; state: number };
type DeploymentItem = {
  neuronId: string;
  version: string;
  state: number;
  logsUrl: string;
};
type EnvDeployments = {
  name: string;
  displayName: string;
  deployments: DeploymentItem[];
};
type ServicesOverview = {
  neurons: NeuronItem[];
  environments: EnvDeployments[];
};

function DeployBadge({ state }: { state: number }) {
  switch (state) {
    case 1:
      return (
        <div className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-[4px] bg-[rgba(52,199,89,0.12)] border border-[rgba(52,199,89,0.25)]">
          <Icon
            icon="solar:check-circle-linear"
            className="text-success text-[11px]"
          />
          <span className="text-[10px] font-bold font-mono text-success">
            Running
          </span>
        </div>
      );
    case 2:
      return (
        <div className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-[4px] bg-[rgba(10,132,255,0.12)] border border-[rgba(10,132,255,0.25)]">
          <Icon
            icon="solar:cloud-upload-linear"
            className="text-info text-[11px]"
          />
          <span className="text-[10px] font-bold font-mono text-info">
            Deploying
          </span>
        </div>
      );
    case 3:
      return (
        <div className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-[4px] bg-[rgba(255,92,95,0.12)] border border-[rgba(255,92,95,0.25)]">
          <Icon
            icon="solar:close-circle-linear"
            className="text-destructive text-[11px]"
          />
          <span className="text-[10px] font-bold font-mono text-destructive">
            Deploy failed
          </span>
        </div>
      );
    case 4:
    case 5:
    case 7:
    case 9:
      return (
        <div className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-[4px] bg-[rgba(255,214,10,0.12)] border border-[rgba(255,214,10,0.25)]">
          <Icon
            icon="solar:refresh-linear"
            className="text-warning text-[11px]"
          />
          <span className="text-[10px] font-bold font-mono text-warning">
            Planning
          </span>
        </div>
      );
    case 6:
    case 8:
      return (
        <div className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-[4px] bg-[rgba(255,92,95,0.12)] border border-[rgba(255,92,95,0.25)]">
          <Icon
            icon="solar:close-circle-linear"
            className="text-destructive text-[11px]"
          />
          <span className="text-[10px] font-bold font-mono text-destructive">
            Plan failed
          </span>
        </div>
      );
    case 10:
      return (
        <div className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-[4px] bg-[rgba(255,159,10,0.12)] border border-[rgba(255,159,10,0.25)]">
          <Icon
            icon="solar:trash-bin-2-linear"
            className="text-warning text-[11px]"
          />
          <span className="text-[10px] font-bold font-mono text-warning">
            Destroying
          </span>
        </div>
      );
    case 11:
      return (
        <div className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-[4px] bg-[rgba(255,92,95,0.12)] border border-[rgba(255,92,95,0.25)]">
          <Icon
            icon="solar:close-circle-linear"
            className="text-destructive text-[11px]"
          />
          <span className="text-[10px] font-bold font-mono text-destructive">
            Destroy failed
          </span>
        </div>
      );
    case 12:
      return (
        <div className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-[4px] bg-foreground/[6%] border border-foreground/10">
          <span className="text-[10px] font-bold font-mono text-foreground/40">
            Destroyed
          </span>
        </div>
      );
    default:
      return <span className="text-[10px] text-foreground/25">—</span>;
  }
}

function EnvCell({
  neuronVersion,
  dep,
}: {
  neuronVersion: string;
  dep?: DeploymentItem;
}) {
  if (!dep) {
    return (
      <div className="flex flex-col items-start gap-[4px]">
        <span className="text-[10px] text-foreground/25">—</span>
      </div>
    );
  }

  const isBehind = dep.version !== neuronVersion;

  return (
    <div className="flex flex-col items-start gap-[5px]">
      <div className="flex items-center gap-[5px]">
        <span className="text-[11px] font-mono text-foreground/70">
          v{dep.version}
        </span>
        {isBehind && (
          <span
            className="size-[6px] rounded-full bg-warning shrink-0"
            title="Behind latest"
          />
        )}
      </div>
      <DeployBadge state={dep.state} />
    </div>
  );
}

export function DeploymentsPage() {
  const { state } = useWorkspace();
  const [overview, setOverview] = useState<ServicesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [newServiceOpen, setNewServiceOpen] = useState(false);

  const refresh = () => {
    setLoading(true);
    setError(null);
    ProductService.GetServicesOverview(state.organisation, state.product)
      .then((result: any) => setOverview(result))
      .catch((err: any) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, [state.organisation, state.product]);

  const handleCreateService = async (neuronId: string) => {
    await ProductService.CreateNeuron(
      state.organisation,
      state.product,
      neuronId,
    );
    refresh();
  };

  const filtered = useMemo(() => {
    if (!overview) return [];
    const q = filter.toLowerCase();
    return q
      ? overview.neurons.filter((n) => n.id.toLowerCase().includes(q))
      : overview.neurons;
  }, [overview, filter]);

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-background">
      {/* Page header */}
      <div className="px-[20px] py-[6px] border-b border-border flex items-center justify-between shrink-0">
        <p className="font-mono font-bold text-[10px] text-foreground/50 uppercase">
          Deployments
        </p>
        {overview && (
          <p className="text-[10px] text-foreground/30 font-mono">
            {overview.neurons.length} services · {overview.environments.length}{" "}
            environments
          </p>
        )}
      </div>

      {/* Toolbar */}
      <div className="border-b border-border px-[20px] py-[8px] flex items-center justify-between gap-[8px] shrink-0">
        <Button
          onClick={() => setNewServiceOpen(true)}
          icon={<Icon icon="solar:add-circle-linear" />}
        >
          New Service
        </Button>
        <div className="flex items-center h-[34px]">
          <div className="bg-card border border-border px-[12px] h-full flex items-center justify-center border-r-0 rounded-l-[4px]">
            <p className="text-[12px] text-foreground">/</p>
          </div>
          <Input
            placeholder="Filter services..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-[260px] border-l-0 rounded-l-none h-full"
            containerClassName="h-full"
          />
        </div>

        <Button
          onClick={refresh}
          disabled={!loading}
          variant="secondary"
          icon={
            <Icon
              icon="solar:refresh-linear"
              className={`text-base ${loading ? "animate-spin" : ""}`}
            />
          }
        >
          Refresh
        </Button>
      </div>

      <NewServiceModal
        open={newServiceOpen}
        onOpenChange={setNewServiceOpen}
        onSubmit={handleCreateService}
      />

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
                <Icon
                  icon="solar:close-circle-linear"
                  className="text-destructive text-lg"
                />
                <p className="text-[12px] font-bold text-foreground">
                  Failed to load
                </p>
              </div>
              <p className="text-[11px] text-foreground/60">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && overview && (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b border-border">
                <th className="text-left px-[20px] py-[8px] w-[220px]">
                  <span className="text-[10px] font-bold font-mono text-foreground/40 uppercase">
                    Service
                  </span>
                </th>
                <th className="text-left px-[16px] py-[8px] w-[120px]">
                  <span className="text-[10px] font-bold font-mono text-foreground/40 uppercase">
                    Latest
                  </span>
                </th>
                {overview.environments.map((env) => {
                  const isActive = env.name === state.activeEnvName;
                  return (
                    <th
                      key={env.name}
                      className={`text-left px-[16px] py-[8px] min-w-[180px] ${isActive ? "border-b-2 border-brand-fill" : ""}`}
                    >
                      <span
                        className={`text-[10px] font-bold font-mono uppercase ${isActive ? "text-brand" : "text-foreground/40"}`}
                      >
                        {env.displayName}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map((neuron) => (
                <tr
                  key={neuron.id}
                  className="border-b border-border hover:bg-foreground/[2%] transition-colors"
                >
                  <td className="px-[20px] py-[12px]">
                    <span className="text-[12px] font-bold font-mono text-foreground">
                      {neuron.id}
                    </span>
                  </td>
                  <td className="px-[16px] py-[12px]">
                    <span className="text-[11px] font-mono text-foreground/50">
                      v{neuron.version}
                    </span>
                  </td>
                  {overview.environments.map((env) => {
                    const dep = env.deployments.find(
                      (d) => d.neuronId === neuron.id,
                    );
                    const isActive = env.name === state.activeEnvName;
                    return (
                      <td
                        key={env.name}
                        className={`px-[16px] py-[12px] ${isActive ? "bg-[rgba(248,129,169,0.03)]" : ""}`}
                      >
                        <EnvCell neuronVersion={neuron.version} dep={dep} />
                      </td>
                    );
                  })}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={2 + (overview.environments.length || 0)}>
                    <EmptyState
                      icon="solar:server-minimalistic-linear"
                      title={
                        filter
                          ? `No services match "${filter}"`
                          : "No services found"
                      }
                      className="py-[32px]"
                    />
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
