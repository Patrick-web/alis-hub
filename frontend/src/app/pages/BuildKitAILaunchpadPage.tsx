import { useNavigate } from "react-router";
import { Browser } from "@wailsio/runtime";
import { Icon } from "@iconify/react";
import { PageLayout } from "../components/PageLayout";
import { Button } from "../components/Button";
import { StageCard } from "../components/StageCard";

const stages = [
  {
    step: 1,
    title: "Set Up Users Service",
    subtitle: "Configure user management for your AI launchpad",
    description:
      "Deploy and configure a Users service that handles authentication and user management for your AI launchpad. This service controls who can access the launchpad and what capabilities they have.",
    icon: "solar:users-group-two-rounded-linear",
    action: "Configure in Builds",
    actionRoute: "/builds",
  },
  {
    step: 2,
    title: "Configure Domains",
    subtitle: "Set up launchpad and identity domains",
    description:
      "Register the launchpad domain and identity service domain for your organisation. These domains serve as the entry points for users and handle OAuth flows.",
    icon: "solar:server-square-linear",
    action: "Configure in Console",
    actionUrl: "https://console.alisx.com",
  },
  {
    step: 3,
    title: "Set Up Launchpad Services",
    subtitle: "Deploy and configure the launchpad infrastructure",
    description:
      "Deploy the launchpad service that provides a unified interface for users to access AI tools, agents, and workflows within your organisation.",
    icon: "solar:rocket-launch-linear",
    action: "Build & Deploy",
    actionRoute: "/builds",
  },
];

export function BuildKitAILaunchpadPage() {
  const navigate = useNavigate();

  return (
    <PageLayout
      title="AI Launchpad"
      subtitle="Configure users, domains, and launchpad services for an enterprise AI launchpad."
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
            The AI Launchpad flow guides you through setting up an enterprise AI launchpad — a
            unified entry point for your organisation's AI tools, agents, and workflows. It covers
            user management, domain configuration, and launchpad service deployment.
          </p>

          {stages.map((stage) => (
            <StageCard
              key={stage.step}
              step={stage.step}
              title={stage.title}
              subtitle={stage.subtitle}
              icon={<Icon icon={stage.icon} className="text-brand" />}
              action={
                stage.actionRoute ? (
                  <Button variant="primary" onClick={() => navigate(stage.actionRoute!)}>
                    {stage.action}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => Browser.OpenURL(stage.actionUrl!)}
                    icon={<Icon icon="solar:arrow-right-up-linear" className="text-sm" />}
                  >
                    {stage.action}
                  </Button>
                )
              }
            >
              <p className="text-[11px] text-foreground/60 leading-[1.5]">{stage.description}</p>
            </StageCard>
          ))}

          <div className="flex items-start gap-[10px] px-[14px] py-[12px] bg-brand-fill/6 border border-brand-fill/20 rounded-[4px]">
            <Icon
              icon="solar:info-circle-linear"
              className="text-brand text-[15px] shrink-0 mt-[1px]"
            />
            <p className="text-[11px] text-foreground/60 leading-[1.5]">
              Full AI Launchpad setup is guided step-by-step in the VS Code extension. Use the Alis
              Build extension in VS Code for the complete interactive workflow including service
              selection and automated configuration.
            </p>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
