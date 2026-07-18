import { Browser } from "@wailsio/runtime";
import { Icon } from "@iconify/react";
import { PageLayout } from "../components/PageLayout";
import { Button } from "../components/Button";
import { StageCard } from "../components/StageCard";

export function BuildKitReportingPage() {
  return (
    <PageLayout
      title="Reporting Exchange"
      subtitle="Master the reporting workflow to initialise, template, and manage your reports."
      parentRoute="/buildkit"
      actions={
        <div className="flex items-center gap-[6px]">
          <Button
            variant="secondary"
            onClick={() => Browser.OpenURL("https://console.alisx.com")}
            icon={<Icon icon="solar:rocket-launch-linear" className="text-sm" />}
          >
            Initialise
          </Button>
          <Button
            variant="secondary"
            onClick={() => Browser.OpenURL("https://console.alisx.com")}
            icon={<Icon icon="solar:document-linear" className="text-sm" />}
          >
            Template
          </Button>
        </div>
      }
    >
      <div className="px-[24px] py-[20px] max-w-[900px] mx-auto w-full">
        <div className="flex flex-col gap-[16px]">
          <p className="text-[12px] text-foreground/70 leading-[1.6]">
            The Reporting Exchange flow streamlines the process of creating and managing reports.
            Use the tools below to initialise your reporting environment, generate templates, and
            leverage AI for advanced tasks.
          </p>

          {/* Step 1: Initialise */}
          <StageCard
            step={1}
            title="Initialise Reporting"
            subtitle="Set up the reporting foundation in your project"
            action={
              <Button
                variant="primary"
                onClick={() => Browser.OpenURL("https://console.alisx.com")}
              >
                Initialise
              </Button>
            }
          >
            <p className="text-[11px] text-foreground/60 leading-[1.5]">
              Set up the reporting foundation in your project. This step runs the custom
              initialisation logic for the reporting codeblock. Click Initialise to run the
              reporting initialisation.
            </p>
          </StageCard>

          {/* Step 2: Generate Template */}
          <StageCard
            step={2}
            title="Generate Report Template"
            subtitle="Create a new report template to structure your data"
            action={
              <Button
                variant="secondary"
                onClick={() => Browser.OpenURL("https://console.alisx.com")}
              >
                Generate Template
              </Button>
            }
          >
            <p className="text-[11px] text-foreground/60 leading-[1.5]">
              Create a new report template to structure your data. Click Generate Template to
              scaffold a new report template ready for customisation.
            </p>
          </StageCard>

          {/* Step 3: Reporting Assistant */}
          <StageCard
            step={3}
            title="Reporting Assistant"
            subtitle="Use AI to handle advanced reporting tasks"
            action={
              <Button
                variant="primary"
                onClick={() => Browser.OpenURL("https://console.alisx.com")}
                icon={<Icon icon="solar:stars-linear" className="text-sm" />}
              >
                Open Assistant
              </Button>
            }
          >
            <p className="text-[11px] text-foreground/60 mb-[12px] leading-[1.5]">
              Use the AI Assistant to perform advanced reporting tasks, including:
            </p>
            <div className="flex flex-col gap-[6px]">
              {[
                "Updating a table on an existing report",
                "Generating dummy data for an existing report template",
                "Generating a template .proto definition from a PDF",
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
          </StageCard>
        </div>
      </div>
    </PageLayout>
  );
}
