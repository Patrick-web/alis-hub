import { Icon } from "@iconify/react";
import { PageLayout } from "../components/PageLayout";
import { StageCard } from "../components/StageCard";
import { useWorkspace } from "../stores/workspace";

const steps = [
  {
    title: "Create a repository",
    description:
      "Use your organisation Forgejo instance to create private repositories for product code, prototypes, templates, and internal tools.",
    icon: "solar:folder-add-linear",
  },
  {
    title: "Clone with HTTPS",
    description:
      "Use the repository HTTPS URL from Forgejo to clone source code into your local Alis Build workspace.",
    icon: "solar:download-linear",
  },
  {
    title: "Push normal Git changes",
    description:
      "Work locally with Git as usual: branch, commit, push, review, and merge through your organisation-owned forge.",
    icon: "solar:upload-linear",
  },
];

export function BuildKitPrivateGitPage() {
  const { state } = useWorkspace();
  const org = state.organisation || "{org}";
  const product = state.product || "{product}";

  const defineRepo = `~/alis.build/${org}/define`;
  const buildRepo = `~/alis.build/${org}/build/${product}`;

  return (
    <PageLayout
      title="Private Git"
      subtitle="Managed Forgejo for private source control in your Alis Build organisation."
      parentRoute="/buildkit"
    >
      <div className="px-[24px] py-[20px] max-w-[900px] mx-auto w-full">
        <div className="flex flex-col gap-[16px]">
          <p className="text-[12px] text-foreground/70 leading-[1.6]">
            Alis Build Private Git is a managed Forgejo installation inside your Alis Build
            organisation. It is designed for secure, backed-up, organisation-owned Git hosting
            without sending private source code to a shared public forge.
          </p>

          {/* Managed private git card */}
          <StageCard
            title="Managed Private Git"
            icon={<Icon icon="solar:shield-check-linear" className="text-brand" />}
          >
            <div className="flex items-start gap-[12px]">
              <div className="size-[32px] rounded-[4px] bg-brand-fill/10 border border-brand-fill/20 flex items-center justify-center shrink-0">
                <Icon icon="solar:code-square-linear" className="text-brand text-[16px]" />
              </div>
              <div>
                <p className="text-[12px] font-bold text-foreground font-mono mb-[4px]">
                  Private Git for your organisation
                </p>
                <p className="text-[11px] text-foreground/60 leading-[1.5]">
                  Your Forgejo instance lives at{" "}
                  <span className="text-foreground font-mono">git.{org}.alis.build</span>. Access it
                  through your browser to create repositories, manage teams, and review pull
                  requests.
                </p>
              </div>
            </div>
          </StageCard>

          {/* Workspace repos */}
          <StageCard
            title="Workspace Repositories"
            icon={<Icon icon="solar:folder-path-connect-linear" className="text-brand" />}
          >
            <p className="text-[11px] text-foreground/60 mb-[14px] leading-[1.5]">
              Your local Alis Build workspace syncs two key repositories for the active product.
            </p>
            <div className="flex flex-col gap-[10px]">
              <div className="px-[14px] py-[12px] bg-muted border border-border rounded-[4px]">
                <p className="text-[10px] font-bold text-foreground/40 uppercase font-mono mb-[4px]">
                  Define repo
                </p>
                <p className="text-[10px] text-foreground/50 mb-[6px]">
                  Stores the protocol buffer definitions for the organisation.
                </p>
                <div className="flex items-center gap-[8px]">
                  <Icon
                    icon="solar:folder-linear"
                    className="text-foreground/35 text-[13px] shrink-0"
                  />
                  <span className="text-[11px] text-foreground font-mono">{defineRepo}</span>
                </div>
              </div>
              <div className="px-[14px] py-[12px] bg-muted border border-border rounded-[4px]">
                <p className="text-[10px] font-bold text-foreground/40 uppercase font-mono mb-[4px]">
                  Product repo
                </p>
                <p className="text-[10px] text-foreground/50 mb-[6px]">
                  Stores the generated services and business logic for the selected product.
                </p>
                <div className="flex items-center gap-[8px]">
                  <Icon
                    icon="solar:folder-linear"
                    className="text-foreground/35 text-[13px] shrink-0"
                  />
                  <span className="text-[11px] text-foreground font-mono">{buildRepo}</span>
                </div>
              </div>
            </div>
          </StageCard>

          {/* Getting started */}
          <div>
            <p className="text-[10px] font-bold text-foreground/40 uppercase font-mono mb-[10px]">
              Getting started
            </p>
            <div className="flex flex-col gap-[8px]">
              {steps.map((step, i) => (
                <div
                  key={step.title}
                  className="flex items-start gap-[12px] px-[14px] py-[12px] bg-card border border-border rounded-[4px]"
                >
                  <div className="size-[22px] rounded-full bg-brand-fill/15 border border-brand-fill flex items-center justify-center shrink-0 mt-[1px]">
                    <span className="text-[9px] font-bold text-brand font-mono">{i + 1}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-[8px] mb-[2px]">
                      <Icon icon={step.icon} className="text-brand text-[13px]" />
                      <p className="text-[11px] font-bold text-foreground font-mono">
                        {step.title}
                      </p>
                    </div>
                    <p className="text-[10px] text-foreground/55 leading-[1.5]">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
