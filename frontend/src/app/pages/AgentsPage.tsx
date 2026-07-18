import { PageLayout } from "../components/PageLayout";
import { StageCard } from "../components/StageCard";
import { Button } from "../components/Button";
import { Icon } from "@iconify/react";

export function AgentsPage() {
  return (
    <PageLayout
      title="Agent Launchpad"
      subtitle="Manage agents, MCP servers, and client interfaces"
      parentRoute="/"
    >
      <div className="p-[24px] max-w-[1000px] mx-auto">
        <p className="text-[11px] text-foreground/50 uppercase font-bold mb-[16px]">Registry</p>
        <h2 className="text-[18px] font-bold text-foreground font-mono mb-[24px]">
          Agent Management Hub
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
          <StageCard
            title="Initialize Launchpad"
            subtitle="Set up the agent launchpad infrastructure"
            icon={<Icon icon="solar:rocket-linear" className="text-xl text-brand" />}
            action={
              <Button variant="primary" className="px-[16px]">
                Init
              </Button>
            }
          >
            <p className="text-[11px] text-foreground/60 leading-[1.5]">
              Provisions the necessary infrastructure for hosting and managing AI agents, including
              identity services and runtime environments.
            </p>
          </StageCard>

          <StageCard
            title="Register Agent"
            subtitle="Add an AI agent to the registry"
            icon={
              <Icon icon="solar:users-group-two-rounded-linear" className="text-xl text-brand" />
            }
            action={
              <Button variant="secondary" className="px-[16px]">
                Register
              </Button>
            }
          >
            <p className="text-[11px] text-foreground/60 leading-[1.5]">
              Register a new AI agent with your workspace. Agents can be configured with custom
              tools, MCP servers, and enterprise integrations.
            </p>
          </StageCard>

          <StageCard
            title="MCP Server"
            subtitle="Model Context Protocol servers"
            icon={<Icon icon="solar:server-square-linear" className="text-xl text-brand" />}
            action={
              <Button variant="secondary" className="px-[16px]">
                Register
              </Button>
            }
          >
            <p className="text-[11px] text-foreground/60 leading-[1.5]">
              Register MCP servers that expose tools and resources to coding agents like Claude
              Code, Codex CLI, and Gemini CLI.
            </p>
          </StageCard>

          <StageCard
            title="Client Interfaces"
            subtitle="Configure agent access points"
            icon={<Icon icon="solar:plug-circle-linear" className="text-xl text-brand" />}
            action={
              <Button variant="secondary" className="px-[16px]">
                Configure
              </Button>
            }
          >
            <p className="text-[11px] text-foreground/60 leading-[1.5]">
              Set up client interfaces for agents, including OAuth connectors, API keys for Claude
              Code, Codex, Gemini CLI, and OpenCode.
            </p>
          </StageCard>
        </div>
      </div>
    </PageLayout>
  );
}
