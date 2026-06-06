import { useState } from 'react';
import { Icon } from '@iconify/react';
import { PageLayout } from '../components/PageLayout';
import { StageCard } from '../components/StageCard';
import { CodeBlock } from '../components/CodeBlock';
import { Button } from '../components/Button';
import { ConfigValue } from '../components/ConfigValue';
import { Input } from '../components/Input';

type ToolTab = 'identity' | 'mcp';

export function ToolsPage() {
  const [activeTab, setActiveTab] = useState<ToolTab>('identity');
  const [identityDomain, setIdentityDomain] = useState('');
  const [mcpDomain, setMcpDomain] = useState('');

  return (
    <PageLayout
      title="Developer Tools"
      subtitle="Identity service and MCP server configuration"
      parentRoute="/"
    >
      <div className="flex h-full">
        <div className="w-[200px] border-r border-[#464646] shrink-0 p-[16px]">
          <div className="flex flex-col gap-[4px]">
            <button
              onClick={() => setActiveTab('identity')}
              className={`flex items-center gap-[10px] px-[12px] py-[8px] rounded-[4px] text-left transition-all ${
                activeTab === 'identity'
                  ? 'bg-[rgba(248,129,169,0.1)] border border-[#f881a9]'
                  : 'hover:bg-[rgba(255,255,255,0.03)] border border-transparent'
              }`}
            >
              <Icon icon="solar:shield-check-linear" className={`text-lg ${activeTab === 'identity' ? 'text-[#f881a9]' : 'text-white opacity-50'}`} />
              <div className="flex flex-col">
                <p className={`text-[10px] font-bold uppercase font-['JetBrains_Mono',sans-serif] ${activeTab === 'identity' ? 'text-white' : 'text-[rgba(255,255,255,0.5)]'}`}>
                  Identity
                </p>
                <p className="text-[8px] text-[rgba(255,255,255,0.3)] uppercase">OAuth & OIDC</p>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('mcp')}
              className={`flex items-center gap-[10px] px-[12px] py-[8px] rounded-[4px] text-left transition-all ${
                activeTab === 'mcp'
                  ? 'bg-[rgba(248,129,169,0.1)] border border-[#f881a9]'
                  : 'hover:bg-[rgba(255,255,255,0.03)] border border-transparent'
              }`}
            >
              <Icon icon="solar:server-square-linear" className={`text-lg ${activeTab === 'mcp' ? 'text-[#f881a9]' : 'text-white opacity-50'}`} />
              <div className="flex flex-col">
                <p className={`text-[10px] font-bold uppercase font-['JetBrains_Mono',sans-serif] ${activeTab === 'mcp' ? 'text-white' : 'text-[rgba(255,255,255,0.5)]'}`}>
                  MCP Server
                </p>
                <p className="text-[8px] text-[rgba(255,255,255,0.3)] uppercase">Agent tools</p>
              </div>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'identity' && (
            <div className="p-[24px] max-w-[900px] mx-auto">
              <p className="text-[11px] text-[rgba(255,255,255,0.5)] uppercase font-bold mb-[16px]">
                IDENTITY SERVICE
              </p>
              <h2 className="text-[18px] font-bold text-white font-['JetBrains_Mono',sans-serif] mb-[8px]">
                OIDC Identity Provider
              </h2>
              <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-[1.5] mb-[24px]">
                Configure OAuth 2.0 / OpenID Connect identity service with Google
                and Microsoft login providers.
              </p>

              <StageCard title="Prerequisites" step={1} className="mb-[16px]">
                <div className="grid grid-cols-2 gap-[12px] mb-[16px]">
                  <div className="flex flex-col gap-[4px]">
                    <label className="text-[9px] text-[rgba(255,255,255,0.5)] uppercase font-bold font-['JetBrains_Mono',sans-serif]">
                      Cookie Domain
                    </label>
                    <Input
                      placeholder="auth.example.com"
                      value={identityDomain}
                      onChange={(e) => setIdentityDomain(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <ConfigValue label="Service URL" value="https://identity.example.com" copyable />
                </div>
              </StageCard>

              <StageCard title="OAuth Configuration" step={2} className="mb-[16px]">
                <p className="text-[11px] text-[rgba(255,255,255,0.7)] mb-[12px]">
                  Configure your OAuth 2.0 providers:
                </p>

                <div className="grid grid-cols-2 gap-[12px]">
                  <div className="bg-[#1e1e1e] border border-[#464646] rounded-[4px] p-[12px]">
                    <div className="flex items-center gap-[8px] mb-[8px]">
                      <Icon icon="solar:google-linear" className="text-lg text-white" />
                      <p className="text-[10px] font-bold text-white uppercase font-['JetBrains_Mono',sans-serif]">Google</p>
                    </div>
                    <ConfigValue label="Redirect URI" value="https://identity.example.com/auth/google/callback" copyable />
                  </div>

                  <div className="bg-[#1e1e1e] border border-[#464646] rounded-[4px] p-[12px]">
                    <div className="flex items-center gap-[8px] mb-[8px]">
                      <Icon icon="solar:code-linear" className="text-lg text-white" />
                      <p className="text-[10px] font-bold text-white uppercase font-['JetBrains_Mono',sans-serif]">Microsoft</p>
                    </div>
                    <ConfigValue label="Redirect URI" value="https://identity.example.com/auth/microsoft/callback" copyable />
                  </div>
                </div>
              </StageCard>

              <StageCard title="Connectors" step={3}>
                <p className="text-[11px] text-[rgba(255,255,255,0.7)] mb-[12px]">
                  Define connectors for application access:
                </p>
                <CodeBlock
                  title="connectors.yaml"
                  language="yaml"
                  code={`connectors:
  - name: ideate
    client_id: ideate-client
    redirect_uris:
      - "https://ideate.example.com/auth/callback"
  - name: launchpad
    client_id: launchpad-client
    redirect_uris:
      - "https://launchpad.example.com/auth/callback"`}
                />
                <div className="flex gap-[8px] mt-[12px]">
                  <Button variant="primary" className="px-[16px]">
                    Generate Config
                  </Button>
                  <Button variant="secondary" className="px-[16px]">
                    Build & Deploy
                  </Button>
                </div>
              </StageCard>
            </div>
          )}

          {activeTab === 'mcp' && (
            <div className="p-[24px] max-w-[900px] mx-auto">
              <p className="text-[11px] text-[rgba(255,255,255,0.5)] uppercase font-bold mb-[16px]">
                MCP SERVER
              </p>
              <h2 className="text-[18px] font-bold text-white font-['JetBrains_Mono',sans-serif] mb-[8px]">
                Model Context Protocol
              </h2>
              <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-[1.5] mb-[24px]">
                Set up an MCP server that exposes tools to AI coding agents
                (Claude Code, Codex CLI, Gemini CLI, OpenCode).
              </p>

              <StageCard title="Prerequisites" step={1} className="mb-[16px]">
                <div className="grid grid-cols-2 gap-[12px]">
                  <div className="flex flex-col gap-[4px]">
                    <label className="text-[9px] text-[rgba(255,255,255,0.5)] uppercase font-bold font-['JetBrains_Mono',sans-serif]">
                      MCP Domain
                    </label>
                    <Input
                      placeholder="mcp.example.com"
                      value={mcpDomain}
                      onChange={(e) => setMcpDomain(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <ConfigValue label="MCP URL" value={`https://${mcpDomain || 'mcp.example.com'}/mcp`} copyable />
                </div>
              </StageCard>

              <StageCard title="Connect Coding Agents" step={2} className="mb-[16px]">
                <div className="grid grid-cols-2 gap-[12px]">
                  <div className="bg-[#1e1e1e] border border-[#464646] rounded-[4px] p-[12px]">
                    <p className="text-[10px] font-bold text-white uppercase font-['JetBrains_Mono',sans-serif] mb-[6px]">Claude Code</p>
                    <CodeBlock
                      language="json"
                      code={`"mcpServers": {
  "my-service": {
    "command": "npx",
    "args": ["@my-service/mcp"],
    "url": "https://${mcpDomain || 'mcp.example.com'}/mcp"
  }
}`}
                    />
                  </div>
                  <div className="bg-[#1e1e1e] border border-[#464646] rounded-[4px] p-[12px]">
                    <p className="text-[10px] font-bold text-white uppercase font-['JetBrains_Mono',sans-serif] mb-[6px]">OpenCode</p>
                    <CodeBlock
                      language="json"
                      code={`"mcpServers": {
  "my-service": {
    "type": "url",
    "url": "https://${mcpDomain || 'mcp.example.com'}/mcp"
  }
}`}
                    />
                  </div>
                </div>
                <Button variant="primary" className="mt-[16px] px-[16px]">
                  Build & Deploy MCP Server
                </Button>
              </StageCard>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
