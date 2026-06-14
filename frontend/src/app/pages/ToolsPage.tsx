import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { PageLayout } from '../components/PageLayout';
import { Loader } from '../components/Loader';
import { useWorkspace } from '../stores/workspace';
import { BucketsExplorer } from '../components/tools/BucketsExplorer';
import { LogsExplorer } from '../components/tools/LogsExplorer';
import { ArtifactRegistry } from '../components/tools/ArtifactRegistry';
import { SecretManager } from '../components/tools/SecretManager';
import { GCloudSetup } from '../components/tools/GCloudSetup';
import * as PS from '../../../bindings/alis-hub-v3/productservice';

type ToolTab = 'buckets' | 'logs' | 'artifactregistry' | 'secrets';

const TOOLS: { id: ToolTab; label: string; subtitle: string; icon: string }[] = [
  { id: 'buckets', label: 'Buckets', subtitle: 'Cloud Storage', icon: 'solar:cloud-storage-bold' },
  { id: 'logs', label: 'Logs', subtitle: 'Cloud Logging', icon: 'solar:document-text-bold' },
  { id: 'artifactregistry', label: 'Artifact Registry', subtitle: 'Packages', icon: 'solar:archive-bold' },
  { id: 'secrets', label: 'Secret Manager', subtitle: 'Secrets', icon: 'solar:lock-keyhole-bold' },
];

export function ToolsPage() {
  const { state } = useWorkspace();
  const [activeTab, setActiveTab] = useState<ToolTab>('buckets');
  const [projectID, setProjectID] = useState('');
  const [region, setRegion] = useState('');
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [gcloudReady, setGcloudReady] = useState(false);

  const loadOverview = useCallback(() => {
    if (!state.organisation || !state.product) return;
    setOverviewLoading(true);
    setOverviewError(null);
    PS.GetProductOverview(state.organisation, state.product)
      .then((overview) => {
        setProjectID(overview?.googleProject?.id ?? '');
        setRegion(overview?.googleProject?.region ?? '');
      })
      .catch((e: unknown) => setOverviewError(String(e)))
      .finally(() => setOverviewLoading(false));
  }, [state.organisation, state.product]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  function handleGCloudReady() {
    setGcloudReady(true);
  }

  return (
    <PageLayout
      title="GCloud Tools"
      subtitle="Cloud Storage, Logging, Artifact Registry & Secret Manager"
      parentRoute="/"
    >
      <div className="flex h-full">
        {/* Sidebar — only shown when gcloud is ready */}
        {gcloudReady && (
          <div className="w-[200px] border-r border-[#464646] shrink-0 p-[16px] flex flex-col gap-[4px]">
            <div className="flex flex-col gap-[4px] flex-1">
              {TOOLS.map((tool) => {
                const isActive = activeTab === tool.id;
                return (
                  <button
                    key={tool.id}
                    onClick={() => setActiveTab(tool.id)}
                    className={`flex items-center gap-[10px] px-[12px] py-[8px] rounded-[4px] text-left transition-all ${
                      isActive
                        ? 'bg-[rgba(248,129,169,0.1)] border border-[#f881a9]'
                        : 'hover:bg-[rgba(255,255,255,0.03)] border border-transparent'
                    }`}
                  >
                    <Icon
                      icon={tool.icon}
                      className={`text-lg shrink-0 ${isActive ? 'text-[#f881a9]' : 'text-white opacity-50'}`}
                    />
                    <div className="flex flex-col min-w-0">
                      <p className={`text-[10px] font-bold uppercase font-['JetBrains_Mono',sans-serif] truncate ${isActive ? 'text-white' : 'text-[rgba(255,255,255,0.5)]'}`}>
                        {tool.label}
                      </p>
                      <p className="text-[8px] text-[rgba(255,255,255,0.3)] uppercase">{tool.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Back to setup */}
            <button
              onClick={() => setGcloudReady(false)}
              className="flex items-center gap-[6px] px-[12px] py-[6px] rounded-[4px] text-left hover:bg-[rgba(255,255,255,0.03)] border border-transparent transition-all mt-[8px]"
            >
              <Icon icon="solar:settings-linear" className="text-sm text-[rgba(255,255,255,0.2)]" />
              <span className="text-[9px] text-[rgba(255,255,255,0.3)] uppercase font-['JetBrains_Mono',sans-serif]">Setup</span>
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-w-0">
          {/* Setup gate — shown until gcloud is installed + authenticated */}
          {!gcloudReady ? (
            <GCloudSetup onReady={handleGCloudReady} />
          ) : overviewLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader size={32} />
            </div>
          ) : overviewError ? (
            <div className="flex-1 flex items-center justify-center p-[24px]">
              <div className="text-center max-w-[320px]">
                <Icon icon="solar:cloud-cross-linear" className="text-4xl text-[rgba(255,255,255,0.1)] mb-[8px]" />
                <p className="text-[11px] text-[rgba(255,255,255,0.5)] font-['JetBrains_Mono',sans-serif]">{overviewError}</p>
              </div>
            </div>
          ) : !projectID ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[11px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif]">
                No GCP project linked to this product
              </p>
            </div>
          ) : (
            <>
              {activeTab === 'buckets' && <BucketsExplorer projectID={projectID} />}
              {activeTab === 'logs' && <LogsExplorer projectID={projectID} />}
              {activeTab === 'artifactregistry' && <ArtifactRegistry projectID={projectID} region={region} />}
              {activeTab === 'secrets' && <SecretManager projectID={projectID} />}
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
