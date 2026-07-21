import { useNavigate } from "react-router";
import { Icon } from "@iconify/react";
import { PageLayout } from "../components/PageLayout";
import { Button } from "../components/Button";
import { StageCard } from "../components/StageCard";

const examples = [
  {
    title: "Define",
    description:
      "Inspect generated packages, synchronised schemas, locked commits, install commands, and developer usage examples after a Define run.",
    icon: "solar:document-text-linear",
    route: "/builds",
  },
  {
    title: "Build",
    description:
      "Review what changed during a build, which artifacts were produced, and what a developer should check next.",
    icon: "solar:hammer-linear",
    route: "/builds",
  },
  {
    title: "Deploy",
    description:
      "Understand deployed resources, environment outcomes, URLs, health signals, and follow-up actions after deployment.",
    icon: "solar:cloud-upload-linear",
    route: "/builds",
  },
];

const principles = [
  {
    title: "Transparent outcomes",
    description:
      "Glass Mode explains what the platform did instead of only reporting that an action succeeded.",
    icon: "solar:eye-linear",
  },
  {
    title: "Pinned evidence",
    description:
      "Where possible, explanations point to commits, generated artifacts, resources, registry locations, and configuration values.",
    icon: "solar:pin-linear",
  },
  {
    title: "Developer next steps",
    description:
      "The view is designed to answer what changed, why it matters, where it lives, and what to do next.",
    icon: "solar:arrow-right-linear",
  },
];

export function BuildKitGlassModePage() {
  const navigate = useNavigate();

  return (
    <PageLayout
      title="Glass Mode"
      subtitle="Understand the transparent explanation layer behind Alis Build actions and generated outputs."
      parentRoute="/buildkit"
      actions={
        <Button
          variant="secondary"
          onClick={() => navigate("/builds")}
          icon={<Icon icon="solar:eye-linear" className="text-sm" />}
        >
          Open Builds
        </Button>
      }
    >
      <div className="px-[24px] py-[20px] max-w-[900px] mx-auto w-full">
        <div className="flex flex-col gap-[16px]">
          {/* Hero */}
          <div className="p-[20px] bg-card border border-border rounded-[4px]">
            <div className="flex items-center gap-[8px] mb-[8px]">
              <Icon icon="solar:eye-linear" className="text-brand text-[16px]" />
              <span className="text-[10px] font-bold text-foreground/40 uppercase font-mono">
                Glass Mode
              </span>
            </div>
            <h2 className="text-[15px] font-bold text-foreground font-mono mb-[8px]">
              Understand what Alis Build just did
            </h2>
            <p className="text-[12px] text-foreground/65 leading-[1.6]">
              Glass Mode is a just-in-time explanation layer for Alis Build actions. It opens a
              transparent view of the generated code, artifacts, resources, commits, and follow-up
              work behind a platform operation.
            </p>
          </div>

          {/* Where to find it */}
          <StageCard
            title="Where to find it"
            icon={<Icon icon="solar:eye-scan-linear" className="text-brand" />}
          >
            <p className="text-[11px] text-foreground/60 mb-[12px] leading-[1.5]">
              Look for <strong className="text-foreground">Glass Mode</strong> buttons that appear
              after an action completes in the Builds tab. These open a detailed explanation of
              exactly what the platform did and what to do next.
            </p>
            <div className="flex items-center gap-[10px] flex-wrap">
              <div className="flex items-center gap-[6px] px-[10px] py-[5px] bg-brand-fill/12 border border-brand-fill/40 rounded-[4px]">
                <Icon icon="solar:eye-linear" className="text-brand text-[13px]" />
                <span className="text-[11px] font-bold text-brand font-mono">Glass Mode</span>
              </div>

              <Button variant="secondary" icon={<Icon icon="solar:eye-linear" />}>
                View Explanation
              </Button>
            </div>
          </StageCard>

          {/* Examples */}
          <div>
            <p className="text-[10px] font-bold text-foreground/40 uppercase font-mono mb-[10px]">
              Where Glass Mode appears
            </p>
            <div className="flex flex-col gap-[8px]">
              {examples.map((ex) => (
                <div
                  key={ex.title}
                  className="flex items-start gap-[12px] px-[14px] py-[12px] bg-card border border-border rounded-[4px]"
                >
                  <div className="size-[28px] rounded-[4px] bg-brand-fill/10 border border-brand-fill/30 flex items-center justify-center shrink-0 mt-[1px]">
                    <Icon icon={ex.icon} className="text-brand text-[14px]" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-foreground font-mono">{ex.title}</p>
                    <p className="text-[10px] text-foreground/55 leading-[1.5] mt-[2px]">
                      {ex.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Principles */}
          <div>
            <p className="text-[10px] font-bold text-foreground/40 uppercase font-mono mb-[10px]">
              Design principles
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-[8px]">
              {principles.map((p) => (
                <div key={p.title} className="p-[14px] bg-card border border-border rounded-[4px]">
                  <Icon icon={p.icon} className="text-brand text-[18px] mb-[8px]" />
                  <p className="text-[11px] font-bold text-foreground font-mono mb-[4px]">
                    {p.title}
                  </p>
                  <p className="text-[10px] text-foreground/55 leading-[1.5]">{p.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
