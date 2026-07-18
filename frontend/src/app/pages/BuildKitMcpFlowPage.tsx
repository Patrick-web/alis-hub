import { useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "@iconify/react";
import { PageLayout } from "../components/PageLayout";
import { CodeBlock } from "../components/CodeBlock";
import { Button } from "../components/Button";
import { StageCard } from "../components/StageCard";

type StageId = "prerequisites" | "service" | "install";
type ClientId = "claude" | "gemini" | "cursor" | "opencode" | "codex";

const stages: Array<{
  id: StageId;
  title: string;
  eyebrow: string;
  description: string;
  icon: string;
}> = [
  {
    id: "prerequisites",
    title: "Prerequisites",
    eyebrow: "Inputs",
    description: "Confirm the product and target service for your MCP server.",
    icon: "solar:checklist-linear",
  },
  {
    id: "service",
    title: "MCP Service",
    eyebrow: "Build & Deploy",
    description:
      "Install the MCP codeblock, define the service, build, and deploy to your environment.",
    icon: "solar:server-square-linear",
  },
  {
    id: "install",
    title: "Connect Agents",
    eyebrow: "Client setup",
    description: "Configure your coding agents to connect to your deployed MCP server.",
    icon: "solar:link-linear",
  },
];

const agentConfigs: Array<{
  id: ClientId;
  label: string;
  icon: string;
  configLabel: string;
  config: string;
  lang: string;
}> = [
  {
    id: "claude",
    label: "Claude Code",
    icon: "solar:planet-linear",
    configLabel: "Add to Claude Code",
    config: "claude mcp add --transport http https://{your-mcp-domain}",
    lang: "bash",
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    icon: "solar:stars-linear",
    configLabel: "Gemini CLI settings.json",
    config: JSON.stringify(
      {
        mcpServers: {
          "{your-mcp-server-name}": {
            url: "https://{your-mcp-domain}",
          },
        },
      },
      null,
      2,
    ),
    lang: "json",
  },
  {
    id: "cursor",
    label: "Cursor",
    icon: "solar:cursor-linear",
    configLabel: "cursor.json / mcp.json",
    config: JSON.stringify(
      {
        mcpServers: {
          "{your-mcp-server-name}": {
            url: "https://{your-mcp-domain}",
            startup_timeout_sec: 20,
            tool_timeout_sec: 60,
          },
        },
      },
      null,
      2,
    ),
    lang: "json",
  },
  {
    id: "opencode",
    label: "OpenCode",
    icon: "solar:code-2-linear",
    configLabel: "opencode.json",
    config: JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        mcp: {
          "{your-mcp-server-name}": {
            type: "remote",
            url: "https://{your-mcp-domain}",
            enabled: true,
          },
        },
      },
      null,
      2,
    ),
    lang: "json",
  },
  {
    id: "codex",
    label: "Codex",
    icon: "solar:terminal-linear",
    configLabel: "codex mcp config",
    config: "codex mcp add {your-mcp-server-name} https://{your-mcp-domain}",
    lang: "bash",
  },
];

export function BuildKitMcpFlowPage() {
  const navigate = useNavigate();
  const [selectedStage, setSelectedStage] = useState<StageId>("prerequisites");
  const [activeClient, setActiveClient] = useState<ClientId>("claude");

  const selectedAgentConfig = agentConfigs.find((c) => c.id === activeClient) ?? agentConfigs[0]!;

  return (
    <PageLayout
      title="MCP"
      subtitle="Build and deploy robust MCP servers for coding agents."
      parentRoute="/buildkit"
      actions={
        <div className="flex items-center gap-[6px]">
          <Button
            variant="secondary"
            onClick={() => navigate("/builds")}
            icon={<Icon icon="solar:hammer-linear" className="text-sm" />}
          >
            Build
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate("/builds")}
            icon={<Icon icon="solar:cloud-upload-linear" className="text-sm" />}
          >
            Deploy
          </Button>
        </div>
      }
    >
      <div className="px-[24px] py-[20px] max-w-[900px] mx-auto w-full">
        <div className="flex flex-col gap-[16px]">
          <p className="text-[12px] text-foreground/70 leading-[1.6]">
            Build and deploy your own Model Context Protocol (MCP) server on Alis Build. MCP servers
            expose tools and resources to coding agents like Claude Code, Gemini CLI, and Cursor,
            enabling them to interact with your product's APIs and data.
          </p>

          {/* Stage nav */}
          <div className="flex items-stretch gap-0 border border-border rounded-[4px] overflow-hidden">
            {stages.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setSelectedStage(s.id)}
                className={`flex-1 flex flex-col items-start px-[14px] py-[10px] transition-all border-r last:border-r-0 border-border ${
                  selectedStage === s.id ? "bg-brand-fill/8" : "bg-card hover:bg-accent"
                }`}
              >
                <div className="flex items-center gap-[6px] mb-[2px]">
                  <div
                    className={`size-[16px] rounded-full border flex items-center justify-center shrink-0 ${
                      selectedStage === s.id
                        ? "bg-brand-fill/20 border-brand-fill"
                        : "border-border"
                    }`}
                  >
                    <span
                      className={`text-[8px] font-bold font-mono ${selectedStage === s.id ? "text-brand" : "text-foreground/40"}`}
                    >
                      {i + 1}
                    </span>
                  </div>
                  <span
                    className={`text-[9px] font-bold uppercase font-mono ${selectedStage === s.id ? "text-brand" : "text-foreground/35"}`}
                  >
                    {s.eyebrow}
                  </span>
                </div>
                <span
                  className={`text-[11px] font-bold font-mono ${selectedStage === s.id ? "text-foreground" : "text-foreground/60"}`}
                >
                  {s.title}
                </span>
              </button>
            ))}
          </div>

          {/* Stage content */}
          {selectedStage === "prerequisites" && (
            <StageCard
              step={1}
              title="Prerequisites"
              subtitle="Confirm the product and target service for your MCP server"
              icon={<Icon icon="solar:checklist-linear" className="text-brand" />}
            >
              <p className="text-[11px] text-foreground/60 mb-[12px] leading-[1.5]">
                Before building your MCP server, confirm the following:
              </p>
              <div className="flex flex-col gap-[8px]">
                {[
                  "You have an active product selected in the workspace",
                  "You have (or will create) a service to host the MCP server logic",
                  "The service follows the Alis Build MCP codeblock pattern",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-[8px]">
                    <Icon
                      icon="solar:point-on-map-linear"
                      className="text-brand text-[12px] shrink-0 mt-[2px]"
                    />
                    <span className="text-[11px] text-foreground/60">{item}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-[10px] mt-[14px]">
                <Button
                  variant="primary"
                  onClick={() => setSelectedStage("service")}
                  icon={<Icon icon="solar:alt-arrow-right-linear" className="text-sm" />}
                  iconPosition="trailing"
                >
                  Continue to Service Setup
                </Button>
              </div>
            </StageCard>
          )}

          {selectedStage === "service" && (
            <StageCard
              step={2}
              title="MCP Service"
              subtitle="Install the codeblock, define, build, and deploy"
              icon={<Icon icon="solar:server-square-linear" className="text-brand" />}
            >
              <p className="text-[11px] text-foreground/60 mb-[12px] leading-[1.5]">
                Install the MCP codeblock into your service, then use the standard Alis Build
                workflow to define, build, and deploy it to your environment.
              </p>
              <div className="flex flex-col gap-[8px] mb-[14px]">
                {[
                  {
                    label: "Install MCP codeblock",
                    desc: "Add the MCP codeblock to your service via the VS Code extension.",
                  },
                  {
                    label: "Define your tools",
                    desc: "Register the tools and resources your MCP server will expose.",
                  },
                  {
                    label: "Build & Deploy",
                    desc: "Build the service image and deploy it to your cloud environment.",
                  },
                ].map((item, i) => (
                  <div key={item.label} className="flex gap-[10px]">
                    <div className="size-[20px] rounded-full bg-brand-fill/15 border border-brand-fill flex items-center justify-center shrink-0 mt-[1px]">
                      <span className="text-[9px] font-bold text-brand font-mono">{i + 1}</span>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-foreground">{item.label}</p>
                      <p className="text-[10px] text-foreground/50">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-[8px]">
                <Button
                  variant="primary"
                  onClick={() => navigate("/builds")}
                  icon={<Icon icon="solar:hammer-linear" className="text-sm" />}
                >
                  Build & Deploy
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setSelectedStage("install")}
                  icon={<Icon icon="solar:alt-arrow-right-linear" className="text-sm" />}
                  iconPosition="trailing"
                >
                  Next: Connect Agents
                </Button>
              </div>
            </StageCard>
          )}

          {selectedStage === "install" && (
            <StageCard
              step={3}
              title="Connect Agents"
              subtitle="Configure your coding agents to use your MCP server"
              icon={<Icon icon="solar:link-linear" className="text-brand" />}
            >
              <p className="text-[11px] text-foreground/60 mb-[14px] leading-[1.5]">
                Once deployed, connect your coding agents to your MCP server. Replace{" "}
                <span className="text-foreground font-mono">{"{your-mcp-domain}"}</span> with your
                actual service domain.
              </p>
              <div className="flex items-center gap-[6px] flex-wrap mb-[12px]">
                {agentConfigs.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveClient(c.id)}
                    className={`flex items-center gap-[6px] px-[10px] py-[5px] rounded-[4px] border text-[11px] font-mono font-bold transition-all ${
                      activeClient === c.id
                        ? "bg-brand-fill/10 border-brand-fill/50 text-brand"
                        : "bg-muted border-border text-foreground/60 hover:border-foreground/30"
                    }`}
                  >
                    <Icon icon={c.icon} className="text-[12px]" />
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] font-bold text-foreground/40 uppercase font-mono mb-[6px]">
                {selectedAgentConfig.configLabel}
              </p>
              <CodeBlock code={selectedAgentConfig.config} language={selectedAgentConfig.lang} />
            </StageCard>
          )}

          <div className="flex items-start gap-[10px] px-[14px] py-[12px] bg-brand-fill/6 border border-brand-fill/20 rounded-[4px]">
            <Icon
              icon="solar:info-circle-linear"
              className="text-brand text-[15px] shrink-0 mt-[1px]"
            />
            <p className="text-[11px] text-foreground/60 leading-[1.5]">
              To connect to the hosted{" "}
              <span className="text-foreground font-mono">Alis Build MCP Server</span> (instead of
              your own), see the shortcut on the Build Kit home page.
            </p>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
