import { useNavigate } from 'react-router';
import { Browser } from '@wailsio/runtime';
import { Icon } from '@iconify/react';
import { PageLayout } from '../components/PageLayout';
import { Button } from '../components/Button';
import { StageCard } from '../components/StageCard';

const REGISTER_AGENT_URL = 'https://console.alisx.com/manage/agents/register';

export function BuildKitLaunchpadPage() {
  const navigate = useNavigate();

  return (
    <PageLayout
      title="Agentic Launchpad"
      subtitle="Register, Manage, and Publish"
      parentRoute="/buildkit"
    >
      <div className="px-[24px] py-[20px] max-w-[900px] mx-auto w-full">
        <div className="flex flex-col gap-[16px]">
          <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-[1.6]">
            The Agentic Launchpad is your central hub for managing the lifecycle of your agents, MCPs, and client
            interfaces. Register your tools to make them available to your team, and publish your agents to the
            enterprise.
          </p>

          {/* Initialise Launchpad */}
          <StageCard
            title="Don't have a launchpad?"
            icon={<Icon icon="solar:rocket-launch-linear" className="text-brand" />}
            action={
              <Button variant="secondary" onClick={() => navigate('/agents')}>
                Initialise
              </Button>
            }
          >
            <p className="text-[11px] text-[rgba(255,255,255,0.6)] leading-[1.5]">
              Get started by setting up your Launchpad. This one-time initialization scaffolds the necessary
              environment to build, manage, and deploy your agents. Creates your dedicated Agentic Launchpad
              environment.
            </p>
          </StageCard>

          {/* Agent Registry */}
          <StageCard
            title="Agent Registry"
            icon={<Icon icon="solar:users-group-two-rounded-linear" className="text-brand" />}
          >
            <p className="text-[11px] text-[rgba(255,255,255,0.6)] mb-[16px] leading-[1.5]">
              Register your agents to make them discoverable and usable by the rest of your team. Highlight their
              unique tools and capabilities.
            </p>
            <div className="flex items-center justify-between py-[10px] border-t border-border">
              <div className="flex items-center gap-[10px]">
                <Icon icon="solar:robot-linear" className="text-[rgba(255,255,255,0.4)] text-[16px]" />
                <div>
                  <p className="text-[11px] font-bold text-white">Register Agent</p>
                  <p className="text-[10px] text-[rgba(255,255,255,0.5)]">Submit your agent to the team registry</p>
                </div>
              </div>
              <Button variant="primary" onClick={() => Browser.OpenURL(REGISTER_AGENT_URL)}>
                Register Agent
              </Button>
            </div>
          </StageCard>

          {/* MCP Registry */}
          <StageCard
            title="MCP Registry"
            icon={<Icon icon="solar:server-square-linear" className="text-brand" />}
          >
            <p className="text-[11px] text-[rgba(255,255,255,0.6)] mb-[16px] leading-[1.5]">
              Register Model Context Protocol (MCP) servers to extend the capabilities of your agents.
            </p>
            <div className="flex items-center justify-between py-[10px] border-t border-border">
              <div className="flex items-center gap-[10px]">
                <Icon icon="solar:server-minimalistic-linear" className="text-[rgba(255,255,255,0.4)] text-[16px]" />
                <div>
                  <p className="text-[11px] font-bold text-white">Register MCP</p>
                  <p className="text-[10px] text-[rgba(255,255,255,0.5)]">Add new MCPs to your ecosystem</p>
                </div>
              </div>
              <Button variant="secondary" disabled>
                Coming Soon
              </Button>
            </div>
          </StageCard>

          {/* Client Interfaces */}
          <StageCard
            title="Client Interfaces"
            icon={<Icon icon="solar:monitor-smartphone-linear" className="text-brand" />}
          >
            <p className="text-[11px] text-[rgba(255,255,255,0.6)] mb-[16px] leading-[1.5]">
              Register custom client interfaces that allow users to interact with multiple agents seamlessly.
            </p>
            <div className="flex items-center justify-between py-[10px] border-t border-border">
              <div className="flex items-center gap-[10px]">
                <Icon icon="solar:monitor-linear" className="text-[rgba(255,255,255,0.4)] text-[16px]" />
                <div>
                  <p className="text-[11px] font-bold text-white">Register Interface</p>
                  <p className="text-[10px] text-[rgba(255,255,255,0.5)]">Connect new front-end experiences</p>
                </div>
              </div>
              <Button variant="secondary" disabled>
                Coming Soon
              </Button>
            </div>
          </StageCard>
        </div>
      </div>
    </PageLayout>
  );
}
