import { useState } from 'react';
import { Icon } from '@iconify/react';
import { PageLayout } from '../components/PageLayout';
import { CodeBlock } from '../components/CodeBlock';
import { Button } from '../components/Button';
import { StageCard } from '../components/StageCard';
import { Browser } from '@wailsio/runtime';

type ClientId = 'gemini' | 'claude' | 'cursor' | 'opencode' | 'codex';

const MCP_SERVER_URL = 'https://mcp.alis.build';
const MCP_SERVER_NAME = 'alis-build';
const CURSOR_CLIENT_ID = '0de92454-0284-42a8-809b-ac426ab3dce5';
const OIDC_CLIENT_ID = 'cac878c2-ae88-47d4-89dc-3815ff556821';
const AUTH_URL = 'https://identity.alisx.com/authorize';
const TOKEN_URL = 'https://identity.alisx.com/token';
const REDIRECT_URI = 'http://localhost:7777/oauth/callback';
const SCOPES = ['build:read', 'build:write', 'ideas:read', 'ideas:write'];

const cursorServerConfig = {
  url: MCP_SERVER_URL,
  oauth_resource: MCP_SERVER_URL,
  auth: { CLIENT_ID: CURSOR_CLIENT_ID, scopes: SCOPES },
  startup_timeout_sec: 20,
  tool_timeout_sec: 60,
  default_tools_approval_mode: 'approve',
};

const cursorConfig = JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: cursorServerConfig } }, null, 2);
const cursorInstallLink = `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(MCP_SERVER_NAME)}&config=${encodeURIComponent(btoa(JSON.stringify(cursorServerConfig)))}`;

const opencodeConfig = JSON.stringify({
  $schema: 'https://opencode.ai/config.json',
  mcp: {
    [MCP_SERVER_NAME]: {
      type: 'remote',
      url: MCP_SERVER_URL,
      enabled: true,
      oauth: {
        enabled: true,
        clientId: OIDC_CLIENT_ID,
        authorizationUrl: AUTH_URL,
        tokenUrl: TOKEN_URL,
        redirectUri: REDIRECT_URI,
        scopes: SCOPES,
      },
    },
  },
}, null, 2);

const clients: Array<{
  id: ClientId;
  label: string;
  icon: string;
  description: string;
  configLabel: string;
  config: string;
  configLang: string;
  action?: { label: string; url?: string; deeplink?: string };
}> = [
  {
    id: 'gemini',
    label: 'Gemini CLI',
    icon: 'solar:stars-linear',
    description: 'Install the Alis Build extension for Gemini CLI. It automatically configures MCP connectivity.',
    configLabel: 'Install command',
    config: 'gemini extensions install https://github.com/alis-build/gemini-cli-extension',
    configLang: 'bash',
    action: { label: 'View extension', url: 'https://github.com/alis-build/gemini-cli-extension' },
  },
  {
    id: 'claude',
    label: 'Claude Code',
    icon: 'solar:planet-linear',
    description: 'Add the Alis Build MCP server to Claude Code by running the command below in your terminal.',
    configLabel: 'Add to Claude Code',
    config: `claude mcp add --transport http ${MCP_SERVER_URL}`,
    configLang: 'bash',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    icon: 'solar:cursor-linear',
    description: 'Use the one-click install link or add the configuration manually to your Cursor MCP settings.',
    configLabel: 'cursor.json / mcp.json',
    config: cursorConfig,
    configLang: 'json',
    action: { label: 'Install in Cursor', deeplink: cursorInstallLink },
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    icon: 'solar:code-2-linear',
    description: 'Add the following block to your OpenCode config file to connect to the Alis Build MCP server.',
    configLabel: 'opencode.json',
    config: opencodeConfig,
    configLang: 'json',
  },
  {
    id: 'codex',
    label: 'Codex',
    icon: 'solar:terminal-linear',
    description: 'Install the Alis Build plugin for Codex to get MCP connectivity and Alis Build tools.',
    configLabel: 'Plugin repository',
    config: 'https://github.com/alis-build/codex-plugin',
    configLang: 'bash',
    action: { label: 'View on GitHub', url: 'https://github.com/alis-build/codex-plugin' },
  },
];

export function BuildKitMcpServerPage() {
  const [activeClient, setActiveClient] = useState<ClientId>('gemini');
  const selected = clients.find((c) => c.id === activeClient) ?? clients[0]!;

  return (
    <PageLayout
      title="Alis Build MCP Server"
      subtitle="Connect coding agents directly to the hosted Alis Build MCP server and review available tools."
      parentRoute="/buildkit"
      actions={
        <Button variant="secondary" onClick={() => Browser.OpenURL(MCP_SERVER_URL)}>
          <Icon icon="solar:arrow-right-up-linear" className="text-sm mr-[4px]" />
          Open MCP Server
        </Button>
      }
    >
      <div className="px-[24px] py-[20px] max-w-[900px] mx-auto w-full">
        <div className="flex flex-col gap-[16px]">
          <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-[1.6]">
            The Alis Build MCP server exposes platform tools — build specs, codeblocks, skills, definitions — directly
            to any coding agent that supports the Model Context Protocol. Select your tool to see the connection config.
          </p>

          {/* Server URL */}
          <div className="flex items-center gap-[10px] px-[14px] py-[10px] bg-[#2c2c2c] border border-[#464646] rounded-[4px]">
            <Icon icon="solar:server-linear" className="text-[#f881a9] text-[15px] shrink-0" />
            <span className="text-[11px] text-[rgba(255,255,255,0.5)] font-['JetBrains_Mono',sans-serif]">MCP Server URL</span>
            <span className="text-[11px] text-white font-['JetBrains_Mono',sans-serif] font-bold">{MCP_SERVER_URL}</span>
          </div>

          {/* Tool picker */}
          <div className="flex items-center gap-[6px] flex-wrap">
            {clients.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveClient(c.id)}
                className={`flex items-center gap-[6px] px-[10px] py-[6px] rounded-[4px] border text-[11px] font-['JetBrains_Mono',sans-serif] font-bold transition-all ${
                  activeClient === c.id
                    ? 'bg-[rgba(248,129,169,0.1)] border-[rgba(248,129,169,0.5)] text-[#f881a9]'
                    : 'bg-[#2c2c2c] border-[#464646] text-[rgba(255,255,255,0.6)] hover:border-[rgba(255,255,255,0.3)]'
                }`}
              >
                <Icon icon={c.icon} className="text-[13px]" />
                {c.label}
              </button>
            ))}
          </div>

          {/* Selected client config */}
          <StageCard
            title={selected.label}
            icon={<Icon icon={selected.icon} className="text-[#f881a9]" />}
            action={
              selected.action ? (
                selected.action.deeplink ? (
                  <Button variant="primary" onClick={() => Browser.OpenURL(selected.action!.deeplink!)}>
                    <Icon icon="solar:cursor-linear" className="text-sm mr-[4px]" />
                    {selected.action.label}
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => Browser.OpenURL(selected.action!.url!)}>
                    <Icon icon="solar:arrow-right-up-linear" className="text-sm mr-[4px]" />
                    {selected.action.label}
                  </Button>
                )
              ) : undefined
            }
          >
            <p className="text-[11px] text-[rgba(255,255,255,0.6)] mb-[14px] leading-[1.5]">
              {selected.description}
            </p>
            <p className="text-[10px] font-bold text-[rgba(255,255,255,0.4)] uppercase font-['JetBrains_Mono',sans-serif] mb-[6px]">
              {selected.configLabel}
            </p>
            <CodeBlock code={selected.config} language={selected.configLang} />
          </StageCard>
        </div>
      </div>
    </PageLayout>
  );
}
