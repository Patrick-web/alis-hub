import { useState } from "react";
import { Browser } from "@wailsio/runtime";
import { Icon } from "@iconify/react";
import { PageLayout } from "../components/PageLayout";
import { CodeBlock } from "../components/CodeBlock";
import { Button } from "../components/Button";
import { StageCard } from "../components/StageCard";

type ClientId = "gemini" | "claude" | "cursor" | "opencode" | "codex";

const geminiCliExtensionUrl = "https://github.com/alis-build/gemini-cli-extension";
const cursorPluginUrl = "https://github.com/alis-build/cursor-plugin";
const claudePluginUrl = "https://github.com/alis-build/claude-plugin";
const codexPluginUrl = "https://github.com/alis-build/codex-plugin";

const clients: Array<{
  id: ClientId;
  label: string;
  icon: string;
  description: string;
  installLabel: string;
  installCode: string;
  installLang: string;
  actionLabel?: string;
  actionUrl?: string;
  note?: string;
}> = [
  {
    id: "gemini",
    label: "Gemini CLI",
    icon: "solar:stars-linear",
    description:
      "Install the Alis Build extension for Gemini CLI to enable Alis Build MCP tools, skills, and agent workflows directly in your terminal.",
    installLabel: "Install command",
    installCode: `gemini extensions install ${geminiCliExtensionUrl}`,
    installLang: "bash",
    actionLabel: "View on GitHub",
    actionUrl: geminiCliExtensionUrl,
  },
  {
    id: "claude",
    label: "Claude Code",
    icon: "solar:planet-linear",
    description:
      "Install the Alis Build plugin for Claude Code to add Alis Build MCP tools, skills, and guided workflows to your Claude sessions.",
    installLabel: "Plugin repository",
    installCode: claudePluginUrl,
    installLang: "bash",
    actionLabel: "View on GitHub",
    actionUrl: claudePluginUrl,
  },
  {
    id: "cursor",
    label: "Cursor",
    icon: "solar:cursor-linear",
    description:
      "Add the Alis Build plugin to Cursor to bring Alis Build MCP tools and skills into your AI-powered editor sessions.",
    installLabel: "Install via Cursor command palette",
    installCode: `/add-plugin ${cursorPluginUrl}`,
    installLang: "bash",
    actionLabel: "View on GitHub",
    actionUrl: cursorPluginUrl,
  },
  {
    id: "opencode",
    label: "OpenCode",
    icon: "solar:code-2-linear",
    description:
      "Configure Alis Build MCP for OpenCode using the JSON config below. Add this to your OpenCode configuration file.",
    installLabel: "opencode.json config",
    installCode: JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        mcp: {
          "alis-build": {
            type: "remote",
            url: "https://mcp.alis.build",
            enabled: true,
            oauth: {
              enabled: true,
              clientId: "cac878c2-ae88-47d4-89dc-3815ff556821",
              authorizationUrl: "https://identity.alisx.com/authorize",
              tokenUrl: "https://identity.alisx.com/token",
              redirectUri: "http://localhost:7777/oauth/callback",
              scopes: ["build:read", "build:write", "ideas:read", "ideas:write"],
            },
          },
        },
      },
      null,
      2,
    ),
    installLang: "json",
  },
  {
    id: "codex",
    label: "Codex",
    icon: "solar:terminal-linear",
    description:
      "Install the Alis Build plugin for Codex to enable Alis Build MCP tools and agent workflows in your Codex sessions.",
    installLabel: "Plugin repository",
    installCode: codexPluginUrl,
    installLang: "bash",
    actionLabel: "View on GitHub",
    actionUrl: codexPluginUrl,
  },
];

export function BuildKitPluginsPage() {
  const [activeClient, setActiveClient] = useState<ClientId>("gemini");
  const selected = clients.find((c) => c.id === activeClient) ?? clients[0]!;

  return (
    <PageLayout
      title="Alis Build Plugins"
      subtitle="Install integrations for developer tools that support Alis Build Agent, MCP tools, and skills."
      parentRoute="/buildkit"
    >
      <div className="px-[24px] py-[20px] max-w-[900px] mx-auto w-full">
        <div className="flex flex-col gap-[16px]">
          <p className="text-[12px] text-foreground/70 leading-[1.6]">
            Alis Build plugins bring the full power of Alis Build — MCP tools, skills, and guided
            workflows — directly into your preferred AI coding tool. Select your tool below to get
            started.
          </p>

          {/* Tool picker */}
          <div className="flex items-center gap-[6px] flex-wrap">
            {clients.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveClient(c.id)}
                className={`flex items-center gap-[6px] px-[10px] py-[6px] rounded-[4px] border text-[11px] font-mono font-bold transition-all ${
                  activeClient === c.id
                    ? "bg-brand-fill/10 border-brand-fill/50 text-brand"
                    : "bg-card border-border text-foreground/60 hover:border-foreground/30"
                }`}
              >
                <Icon icon={c.icon} className="text-[13px]" />
                {c.label}
              </button>
            ))}
          </div>

          {/* Selected client card */}
          <StageCard
            title={selected.label}
            icon={<Icon icon={selected.icon} className="text-brand" />}
            action={
              selected.actionUrl ? (
                <Button
                  variant="secondary"
                  onClick={() => Browser.OpenURL(selected.actionUrl!)}
                  icon={<Icon icon="solar:arrow-right-up-linear" className="text-sm" />}
                >
                  {selected.actionLabel}
                </Button>
              ) : undefined
            }
          >
            <p className="text-[11px] text-foreground/60 mb-[14px] leading-[1.5]">
              {selected.description}
            </p>
            <p className="text-[10px] font-bold text-foreground/40 uppercase font-mono mb-[6px]">
              {selected.installLabel}
            </p>
            <CodeBlock code={selected.installCode} language={selected.installLang} />
          </StageCard>

          {/* MCP connection note */}
          <div className="flex items-start gap-[10px] px-[14px] py-[12px] bg-brand-fill/6 border border-brand-fill/20 rounded-[4px]">
            <Icon
              icon="solar:info-circle-linear"
              className="text-brand text-[15px] shrink-0 mt-[1px]"
            />
            <p className="text-[11px] text-foreground/60 leading-[1.5]">
              All plugins connect to the hosted{" "}
              <span className="text-foreground font-mono">https://mcp.alis.build</span> MCP server.
              See the <strong>Alis Build MCP Server</strong> shortcut on the Build Kit home page for
              full connection details.
            </p>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
