import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { PageLayout } from '../components/PageLayout';
import { EmptyState } from '../components/EmptyState';
import { Loader } from '../components/Loader';
import { useWorkspace } from '../stores/workspace';
import { BucketsExplorer } from '../components/tools/BucketsExplorer';
import { LogsExplorer } from '../components/tools/LogsExplorer';
import { ArtifactRegistry } from '../components/tools/ArtifactRegistry';
import { SecretManager } from '../components/tools/SecretManager';
import { SpannerExplorer } from '../components/tools/SpannerExplorer';
import { GCloudSetup } from '../components/tools/GCloudSetup';
import * as PS from '../../../bindings/alis-hub-v3/productservice';

type ToolTab = 'buckets' | 'logs' | 'artifactregistry' | 'secrets' | 'spanner';

type ProjectContext = {
  id: string;
  label: string;
  projectID: string;
  region: string;
};

const TOOLS: { id: ToolTab; label: string; subtitle: string; icon: string }[] = [
  { id: 'buckets', label: 'Buckets', subtitle: 'Cloud Storage', icon: 'solar:cloud-storage-bold' },
  { id: 'logs', label: 'Logs', subtitle: 'Cloud Logging', icon: 'solar:document-text-bold' },
  { id: 'artifactregistry', label: 'Artifact Registry', subtitle: 'Packages', icon: 'solar:archive-bold' },
  { id: 'secrets', label: 'Secret Manager', subtitle: 'Secrets', icon: 'solar:lock-keyhole-bold' },
  { id: 'spanner', label: 'Spanner', subtitle: 'Cloud Spanner', icon: 'solar:database-bold' },
];

export function ToolsPage() {
  const { state } = useWorkspace();
  const [activeTab, setActiveTab] = useState<ToolTab>('buckets');
  const [gcloudReady, setGcloudReady] = useState(false);

  const [contexts, setContexts] = useState<ProjectContext[]>([]);
  const [selectedCtx, setSelectedCtx] = useState<ProjectContext | null>(null);
  const [contextsLoading, setContextsLoading] = useState(true);
  const [contextsError, setContextsError] = useState<string | null>(null);

  const loadContexts = useCallback(() => {
    if (!state.organisation || !state.product) return;
    setContextsLoading(true);
    setContextsError(null);

    Promise.all([
      PS.GetProductOverview(state.organisation, state.product),
      PS.ListEnvironments(state.organisation, state.product),
      PS.GetOrganisationProject(state.organisation),
    ])
      .then(([overview, envs, orgProject]) => {
        const list: ProjectContext[] = [];
        if (orgProject?.id) {
          list.push({
            id: 'org',
            label: 'Org',
            projectID: orgProject.id,
            region: orgProject.region ?? '',
          });
        }
        if (overview?.googleProject?.id) {
          list.push({
            id: 'product',
            label: 'Product',
            projectID: overview.googleProject.id,
            region: overview.googleProject.region ?? '',
          });
        }
        for (const env of envs ?? []) {
          if (env.gcpProject?.id) {
            list.push({
              id: env.name,
              label: env.displayName || env.name?.split('/').pop() || env.name,
              projectID: env.gcpProject.id,
              region: env.gcpProject.region ?? '',
            });
          }
        }
        setContexts(list);
        setSelectedCtx((prev) => {
          if (prev) {
            const still = list.find((c) => c.id === prev.id);
            return still ?? list[0] ?? null;
          }
          return list[0] ?? null;
        });
      })
      .catch((e: unknown) => setContextsError(String(e)))
      .finally(() => setContextsLoading(false));
  }, [state.organisation, state.product]);

  useEffect(() => {
    loadContexts();
  }, [loadContexts]);

  // Auto-select the active environment's GCP project when env picker changes
  useEffect(() => {
    if (!state.activeEnvName || contexts.length === 0) return;
    const match = contexts.find(c => c.id === state.activeEnvName);
    if (match) setSelectedCtx(match);
  }, [state.activeEnvName, contexts]);

  const projectID = selectedCtx?.projectID ?? '';
  const region = selectedCtx?.region ?? '';

  return (
    <PageLayout
      title="GCloud Tools"
      subtitle="Cloud Storage, Logging, Artifact Registry & Secret Manager"
      parentRoute="/"
    >
      <div className="flex h-full">
        {gcloudReady && (
          <div className="w-[200px] border-r border-border shrink-0 flex flex-col">
            {/* Project context selector */}
            <div className="px-[12px] py-[10px] border-b border-border">
              <p className="text-[8px] font-bold uppercase text-[rgba(255,255,255,0.3)] font-mono mb-[6px]">Project</p>
              {contextsLoading ? (
                <div className="flex items-center gap-[6px]">
                  <Loader size={12} />
                  <span className="text-[9px] text-[rgba(255,255,255,0.3)] font-mono">Loading...</span>
                </div>
              ) : contextsError ? (
                <p className="text-[9px] text-red-400 font-mono">{contextsError}</p>
              ) : contexts.length === 0 ? (
                <p className="text-[9px] text-[rgba(255,255,255,0.3)] font-mono">No projects found</p>
              ) : (
                <div className="flex flex-col gap-[2px]">
                  {contexts.map((ctx) => {
                    const isActive = selectedCtx?.id === ctx.id;
                    const icon = ctx.id === 'org'
                      ? 'solar:buildings-linear'
                      : ctx.id === 'product'
                        ? 'solar:box-linear'
                        : 'solar:server-minimalistic-linear';
                    return (
                      <button
                        key={ctx.id}
                        onClick={() => setSelectedCtx(ctx)}
                        className={`flex items-center gap-[6px] px-[8px] py-[5px] rounded-[3px] text-left transition-all ${
                          isActive
                            ? 'bg-[rgba(248,129,169,0.12)] border border-brand'
                            : 'hover:bg-[rgba(255,255,255,0.04)] border border-transparent'
                        }`}
                      >
                        <Icon
                          icon={icon}
                          className={`text-xs shrink-0 ${isActive ? 'text-brand' : 'text-[rgba(255,255,255,0.3)]'}`}
                        />
                        <span className={`text-[10px] font-mono truncate ${isActive ? 'text-white' : 'text-[rgba(255,255,255,0.5)]'}`}>
                          {ctx.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tool list */}
            <div className="flex flex-col gap-[4px] flex-1 p-[12px]">
              {TOOLS.map((tool) => {
                const isActive = activeTab === tool.id;
                return (
                  <button
                    key={tool.id}
                    onClick={() => setActiveTab(tool.id)}
                    className={`flex items-center gap-[10px] px-[12px] py-[8px] rounded-[4px] text-left transition-all ${
                      isActive
                        ? 'bg-[rgba(248,129,169,0.1)] border border-brand'
                        : 'hover:bg-[rgba(255,255,255,0.03)] border border-transparent'
                    }`}
                  >
                    <Icon
                      icon={tool.icon}
                      className={`text-lg shrink-0 ${isActive ? 'text-brand' : 'text-white opacity-50'}`}
                    />
                    <div className="flex flex-col min-w-0">
                      <p className={`text-[10px] font-bold uppercase font-mono truncate ${isActive ? 'text-white' : 'text-[rgba(255,255,255,0.5)]'}`}>
                        {tool.label}
                      </p>
                      <p className="text-[8px] text-[rgba(255,255,255,0.3)] uppercase">{tool.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Back to setup */}
            <div className="px-[12px] pb-[12px]">
              <button
                onClick={() => setGcloudReady(false)}
                className="flex items-center gap-[6px] px-[12px] py-[6px] rounded-[4px] text-left hover:bg-[rgba(255,255,255,0.03)] border border-transparent transition-all w-full"
              >
                <Icon icon="solar:settings-linear" className="text-sm text-[rgba(255,255,255,0.2)]" />
                <span className="text-[9px] text-[rgba(255,255,255,0.3)] uppercase font-mono">Setup</span>
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-w-0">
          {!gcloudReady ? (
            <GCloudSetup onReady={handleGCloudReady} />
          ) : contextsLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader size={32} />
            </div>
          ) : contextsError ? (
            <div className="flex-1 flex items-center justify-center p-[24px]">
              <div className="text-center max-w-[320px]">
                <Icon icon="solar:cloud-cross-linear" className="text-4xl text-[rgba(255,255,255,0.1)] mb-[8px]" />
                <p className="text-[11px] text-[rgba(255,255,255,0.5)] font-mono">{contextsError}</p>
              </div>
            </div>
          ) : !projectID ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon="solar:cloud-cross-linear"
                title="No GCP project linked to this product"
                description="Link a GCP project in the product settings to use cloud tools"
              />
            </div>
          ) : (
            <>
              {activeTab === 'buckets' && <BucketsExplorer projectID={projectID} />}
              {activeTab === 'logs' && <LogsExplorer projectID={projectID} />}
              {activeTab === 'artifactregistry' && <ArtifactRegistry projectID={projectID} region={region} />}
              {activeTab === 'secrets' && <SecretManager projectID={projectID} />}
              {activeTab === 'spanner' && <SpannerExplorer projectID={projectID} />}
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );

  function handleGCloudReady() {
    setGcloudReady(true);
  }
}
