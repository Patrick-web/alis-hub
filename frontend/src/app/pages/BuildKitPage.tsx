import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Browser } from '@wailsio/runtime';
import { Icon } from '@iconify/react';
import { useWorkspace } from '../stores/workspace';
import * as BuildKitService from '../../../bindings/alis-hub-v3/buildkitservice';

const flows = [
  {
    title: 'Build Custom APIs',
    description: 'Master the core Alis Build workflow to define, build, and deploy your own APIs.',
    route: 'custom-apis',
    status: 'GA',
  },
  {
    title: 'Manage your Agent',
    description: 'Create a new custom Agent using ADK and deploy to Google Cloud.',
    route: 'agent',
    status: 'Beta',
  },
  {
    title: 'Develop an Agent Tool',
    description: "Extend your Agent's functionality with custom capabilities and logic.",
    route: 'agent-tool',
    status: 'Beta',
  },
  {
    title: 'Agentic Launchpad',
    description: 'Register and manage your agents, MCPs, and client interfaces.',
    route: 'launchpad',
    status: 'Preview',
  },
  {
    title: 'Reporting Exchange',
    description: 'Master the reporting workflow to initialise, template, and manage your reports.',
    route: 'reporting',
    status: 'Preview',
  },
  {
    title: 'AI Launchpad',
    description: 'Configure users, domains, and launchpad services for an enterprise AI launchpad.',
    route: 'ai-launchpad',
    status: 'Beta',
  },
  {
    title: 'Gemini Enterprise',
    description: 'Configure Gemini Enterprise access, subscriptions, workforce federation, and data connectors.',
    route: 'gemini-enterprise',
    status: 'Beta',
  },
  {
    title: 'MCP',
    description: 'Build and deploy robust MCP servers for coding agents.',
    route: 'mcp',
    status: 'Beta',
  },
  {
    title: 'Skills',
    description: 'Build and deploy a Skills service for reusable Alis Build guidance and codeblock knowledge.',
    route: 'skills',
    status: 'Beta',
  },
  {
    title: 'Files Connector',
    description: 'Connect external file systems and storage providers to Alis Build.',
    route: 'files-connector',
    status: 'Private Preview',
  },
  {
    title: 'Identity',
    description: 'Manage identity, access, and application integrations for agent and enterprise workflows.',
    route: 'identity',
    status: 'Beta',
  },
];

const STATUS_LABELS: Record<number, string> = { 0: 'Unknown', 1: 'New', 2: 'Active', 3: 'Completed' };
const STATUS_COLORS: Record<number, string> = {
  0: 'text-[rgba(255,255,255,0.4)] border-[#555]',
  1: 'text-[#FAC800] border-[#FAC800]',
  2: 'text-[#34C759] border-[#34C759]',
  3: 'text-[rgba(255,255,255,0.4)] border-[#555]',
};

function productResourceToLandingZoneUrl(resource: string): string {
  // resource: organisations/{org}/products/{product}
  const parts = resource.split('/');
  if (parts.length >= 4) {
    return `https://console.alisx.com/build/landing-zone/${parts[1]}/${parts[3]}/overview`;
  }
  return 'https://console.alisx.com';
}

function productResourceToLabel(resource: string): string {
  const parts = resource.split('/');
  if (parts.length >= 4) return `${parts[1]} / ${parts[3]}`;
  return resource;
}

export function BuildKitPage() {
  const navigate = useNavigate();
  const { state } = useWorkspace();
  const orgID = state.organisation;
  const productID = state.product;

  const [specs, setSpecs] = useState<any[]>([]);
  const [specsLoading, setSpecsLoading] = useState(true);
  const [specsError, setSpecsError] = useState<string | null>(null);
  const [selectedSpecName, setSelectedSpecName] = useState<string>('');

  useEffect(() => {
    setSpecsLoading(true);
    setSpecsError(null);
    BuildKitService.ListBuildSpecs()
      .then((items: any[]) => {
        setSpecs(items || []);
        if (items && items.length > 0) {
          // Default to first active spec, or just first
          const active = items.find((s: any) => s.status === 2);
          setSelectedSpecName((active || items[0]).name);
        }
      })
      .catch((err: any) => setSpecsError(String(err)))
      .finally(() => setSpecsLoading(false));
  }, []);

  const selectedSpec = specs.find((s: any) => s.name === selectedSpecName) ?? null;

  const shortcuts: Array<{ title: string; description: string; url?: string; route?: string }> = [
    {
      title: 'Build Specifications',
      description: 'Navigate to your set of build specs',
      url: 'https://console.alisx.com/build/specifications',
    },
    {
      title: 'CodeBlocks',
      description: 'Where Innovation Meets Code',
      url: 'https://console.alisx.com/build/blocks/overview',
    },
    {
      title: 'Your Landing Zone',
      description: 'Navigate to your product landing zone',
      url: `https://console.alisx.com/build/landing-zone/${orgID}/${productID}/overview`,
    },
    {
      title: 'Alis Build Plugins',
      description: 'Install the Alis Build plugin for your coding agent.',
      route: '/buildkit/plugins',
    },
    {
      title: 'Private Git',
      description: 'Access managed private Git repositories for your organisation.',
      route: '/buildkit/private-git',
    },
    {
      title: 'Alis Build Agent',
      description: 'Open the Alis Build AI agent for guided development.',
      url: 'https://agent.alis.build',
    },
    {
      title: 'Alis Build MCP Server',
      description: 'Connect your coding agents to the Alis Build MCP server.',
      route: '/buildkit/mcp-server',
    },
    {
      title: 'Alis Build Skills',
      description: 'Browse the Alis Build skills registry on GitHub.',
      url: 'https://github.com/alis-build/skills',
    },
    {
      title: 'Glass Mode',
      description: 'Understand what Alis Build just did with pinned, transparent outcomes.',
      route: '/buildkit/glass-mode',
    },
  ];

  return (
    <div className="flex-1 overflow-auto bg-[#1e1e1e]">
      <div className="max-w-[1100px] mx-auto px-[24px] py-[24px]">
        {/* Banner */}
        <div className="mb-[32px] p-[24px] bg-gradient-to-r from-[#2c2c2c] to-[#252525] border border-[#464646] rounded-[4px]">
          <h1 className="text-[22px] font-bold text-white font-['JetBrains_Mono',sans-serif] mb-[6px]">
            Alis Build Kit
          </h1>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)]">
            Accelerate your development on the AlisX Platform
          </p>
        </div>

        {/* Build Specification Panel */}
        <div className="mb-[40px]">
          <div className="flex items-center justify-between mb-[4px]">
            <h2 className="text-[11px] font-bold text-white uppercase font-['JetBrains_Mono',sans-serif]">
              Build Specification
            </h2>
            {specs.length > 0 && (
              <select
                value={selectedSpecName}
                onChange={(e) => setSelectedSpecName(e.target.value)}
                className="bg-[#2c2c2c] border border-[#464646] text-white text-[11px] font-['JetBrains_Mono',sans-serif] px-[8px] py-[4px] rounded-[4px] focus:outline-none focus:border-[rgba(248,129,169,0.5)] cursor-pointer hover:border-[rgba(255,255,255,0.3)] transition-colors max-w-[280px]"
              >
                {specs.map((s: any) => (
                  <option key={s.name} value={s.name}>
                    {s.displayName || s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="text-[11px] text-[rgba(255,255,255,0.45)] mb-[12px]">
            Your active build specification
          </p>
          <div className="border-b border-[#464646] mb-[16px]" />

          {specsLoading && (
            <div className="flex items-center gap-[8px] text-[11px] text-[rgba(255,255,255,0.4)] py-[20px]">
              <Icon icon="solar:refresh-linear" className="text-[14px] animate-spin" />
              Loading build specifications...
            </div>
          )}

          {specsError && (
            <div className="flex items-center gap-[8px] text-[11px] text-[#FF5C5F] py-[12px] px-[14px] bg-[rgba(255,92,95,0.06)] border border-[rgba(255,92,95,0.2)] rounded-[4px]">
              <Icon icon="solar:danger-circle-linear" className="text-[14px] shrink-0" />
              {specsError}
            </div>
          )}

          {!specsLoading && !specsError && specs.length === 0 && (
            <div className="text-[11px] text-[rgba(255,255,255,0.4)] py-[20px]">
              No build specifications found.
            </div>
          )}

          {!specsLoading && !specsError && selectedSpec && (
            <div className="bg-[#2c2c2c] border border-[#464646] rounded-[4px] overflow-hidden">
              {/* Spec header */}
              <div className="flex items-center justify-between px-[20px] py-[16px] border-b border-[#464646]">
                <div className="flex items-center gap-[12px]">
                  <Icon icon="solar:document-text-linear" className="text-[#f881a9] text-[18px] shrink-0" />
                  <div>
                    <p className="text-[13px] font-bold text-white font-['JetBrains_Mono',sans-serif]">
                      {selectedSpec.displayName || selectedSpec.name}
                    </p>
                    <p className="text-[10px] text-[rgba(255,255,255,0.4)] font-['JetBrains_Mono',sans-serif] mt-[2px]">
                      {selectedSpec.name}
                    </p>
                  </div>
                </div>
                <span className={`text-[9px] font-bold font-['JetBrains_Mono',sans-serif] px-[6px] py-[2px] border rounded-[2px] uppercase shrink-0 ${STATUS_COLORS[selectedSpec.status] ?? STATUS_COLORS[0]}`}>
                  {STATUS_LABELS[selectedSpec.status] ?? 'Unknown'}
                </span>
              </div>

              {/* Summary */}
              {selectedSpec.summary && (
                <div className="px-[20px] py-[14px] border-b border-[#464646]">
                  <p className="text-[10px] font-bold text-[rgba(255,255,255,0.4)] uppercase font-['JetBrains_Mono',sans-serif] mb-[6px]">
                    Summary
                  </p>
                  <p className="text-[12px] text-[rgba(255,255,255,0.75)] leading-[1.6]">
                    {selectedSpec.summary}
                  </p>
                </div>
              )}

              {/* Products */}
              {selectedSpec.products && selectedSpec.products.length > 0 && (
                <div className="px-[20px] py-[14px]">
                  <p className="text-[10px] font-bold text-[rgba(255,255,255,0.4)] uppercase font-['JetBrains_Mono',sans-serif] mb-[10px]">
                    Products ({selectedSpec.products.length})
                  </p>
                  <div className="flex flex-col gap-[6px]">
                    {selectedSpec.products.map((product: string) => (
                      <button
                        key={product}
                        onClick={() => Browser.OpenURL(productResourceToLandingZoneUrl(product))}
                        className="flex items-center justify-between px-[12px] py-[8px] bg-[#252525] border border-[#464646] rounded-[4px] hover:border-[rgba(248,129,169,0.4)] hover:bg-[#2a2a2a] transition-all group text-left"
                      >
                        <div className="flex items-center gap-[8px]">
                          <Icon icon="solar:box-linear" className="text-[rgba(255,255,255,0.35)] text-[13px] shrink-0" />
                          <span className="text-[11px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.7)] group-hover:text-white transition-colors">
                            {productResourceToLabel(product)}
                          </span>
                        </div>
                        <Icon icon="solar:arrow-right-up-linear" className="text-[rgba(255,255,255,0.25)] text-[12px] shrink-0 group-hover:text-[#f881a9] transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Flows */}
        <div className="mb-[16px]">
          <div className="flex items-baseline gap-[8px] mb-[4px]">
            <h2 className="text-[11px] font-bold text-white uppercase font-['JetBrains_Mono',sans-serif]">
              Flows
            </h2>
          </div>
          <p className="text-[11px] text-[rgba(255,255,255,0.45)] mb-[12px]">
            Select a workflow to start building
          </p>
          <div className="border-b border-[#464646] mb-[16px]" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[12px] mb-[40px]">
          {flows.map((flow) => (
            <button
              key={flow.route}
              onClick={() => navigate(`/buildkit/${flow.route}`)}
              className="text-left p-[16px] bg-[#2c2c2c] border border-[#464646] rounded-[4px] hover:border-[rgba(248,129,169,0.5)] hover:bg-[#303030] transition-all group"
            >
              <div className="flex items-start justify-between mb-[10px]">
                <h3 className="text-[11px] font-bold text-white font-['JetBrains_Mono',sans-serif] uppercase leading-tight group-hover:text-[#f881a9] transition-colors">
                  {flow.title}
                </h3>
                <span className="text-[7px] font-bold font-['JetBrains_Mono',sans-serif] px-[4px] py-[1px] border border-[#464646] text-[rgba(255,255,255,0.4)] rounded-[2px] shrink-0 ml-[8px] uppercase">
                  {flow.status}
                </span>
              </div>
              <div className="border-b border-[#464646] mb-[10px]" />
              <p className="text-[11px] text-[rgba(255,255,255,0.55)] leading-[1.5]">{flow.description}</p>
            </button>
          ))}
        </div>

        {/* Shortcuts */}
        <div className="mb-[16px]">
          <h2 className="text-[11px] font-bold text-white uppercase font-['JetBrains_Mono',sans-serif] mb-[4px]">
            Shortcuts
          </h2>
          <p className="text-[11px] text-[rgba(255,255,255,0.45)] mb-[12px]">
            Quick access to Alis Build related components
          </p>
          <div className="border-b border-[#464646] mb-[16px]" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[12px]">
          {shortcuts.map((s) => (
            <button
              key={s.title}
              onClick={() => s.route ? navigate(s.route) : Browser.OpenURL(s.url!)}
              className="text-left p-[16px] bg-[#2c2c2c] border border-[#464646] rounded-[4px] hover:border-[rgba(248,129,169,0.5)] hover:bg-[#303030] transition-all group"
            >
              <div className="flex items-start justify-between mb-[10px]">
                <h3 className="text-[11px] font-bold text-white font-['JetBrains_Mono',sans-serif] uppercase leading-tight group-hover:text-[#f881a9] transition-colors">
                  {s.title}
                </h3>
                <Icon
                  icon={s.url ? 'solar:arrow-right-up-linear' : 'solar:alt-arrow-right-linear'}
                  className="text-[rgba(255,255,255,0.35)] text-sm shrink-0 ml-[8px] group-hover:text-[#f881a9] transition-colors"
                />
              </div>
              <div className="border-b border-[#464646] mb-[10px]" />
              <p className="text-[11px] text-[rgba(255,255,255,0.55)] leading-[1.5]">{s.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
