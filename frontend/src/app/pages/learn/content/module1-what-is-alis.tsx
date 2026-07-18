import { LearningModule } from "../types";
import { AlisOsDiagram } from "../diagrams/AlisOsDiagram";

export const module1: LearningModule = {
  id: "module1",
  title: "What is Alis?",
  subtitle: "The platform and its mental model",
  icon: "solar:home-2-linear",
  steps: [
    {
      id: "m1-s0",
      title: "Alis is an operating system for cloud APIs",
      body: (
        <div className="flex flex-col gap-[12px]">
          <p className="text-[12px] text-foreground/70 leading-[1.7]">
            Alis (pronounced like "Alice") is a development platform that wraps Google Cloud
            Platform and gRPC into a single, opinionated workflow. Instead of manually creating GCP
            projects, configuring Cloud Run, setting up IAM roles, and wiring up API gateways, Alis
            handles all of that for you — consistently and repeatably.
          </p>
          <p className="text-[12px] text-foreground/70 leading-[1.7]">
            The core idea is{" "}
            <span className="text-foreground font-bold">contract-first API development</span>: you
            define your service using Protocol Buffers, and Alis manages everything needed to get
            that service running on GCP.
          </p>
          <p className="text-[12px] text-foreground/70 leading-[1.7]">
            Think of Alis as the difference between manually assembling a PC from parts versus using
            a well-engineered workstation — you still write the code that matters, but the
            infrastructure scaffolding is handled for you.
          </p>
        </div>
      ),
    },
    {
      id: "m1-s1",
      title: "Organisations, Products, and Neurons",
      body: (
        <div className="flex flex-col gap-[12px]">
          <p className="text-[12px] text-foreground/70 leading-[1.7]">
            Alis organises everything into a three-level hierarchy:
          </p>
          <div className="flex flex-col gap-[8px]">
            {[
              {
                term: "Organisation",
                def: "The top-level owner — typically a company or team. Maps to a GCP billing account and organisation node.",
                example: "acme-os",
              },
              {
                term: "Product",
                def: "A logical grouping of related services. Each product gets its own dedicated GCP project, giving it isolated billing, IAM, and networking.",
                example: "payments-os",
              },
              {
                term: "Neuron",
                def: "A single deployable microservice — one gRPC/REST API. Neurons live inside a product and are the unit of build and deploy.",
                example: "users-v1",
              },
            ].map(({ term, def, example }) => (
              <div
                key={term}
                className="px-[14px] py-[12px] bg-muted border border-border rounded-[4px]"
              >
                <p className="text-[11px] font-bold text-brand font-mono mb-[4px]">{term}</p>
                <p className="text-[11px] text-foreground/60 leading-[1.5] mb-[6px]">{def}</p>
                <span className="text-[10px] font-mono text-foreground/35 bg-background px-[6px] py-[2px] rounded">
                  e.g. {example}
                </span>
              </div>
            ))}
          </div>
        </div>
      ),
      diagram: <AlisOsDiagram />,
    },
    {
      id: "m1-s2",
      title: "Environments",
      body: (
        <div className="flex flex-col gap-[12px]">
          <p className="text-[12px] text-foreground/70 leading-[1.7]">
            Each product has multiple <span className="text-foreground">environments</span> —
            isolated deployment targets that map directly to GCP resources. The three standard
            environments are:
          </p>
          <div className="flex flex-col gap-[6px]">
            {[
              {
                name: "production",
                colour: "#34C759",
                desc: "Live traffic. Highest-permission IAM. Cloud Run min-instances set for always-on.",
              },
              {
                name: "staging",
                colour: "#FAC800",
                desc: "Pre-production testing. Mirrors production config but isolated data.",
              },
              {
                name: "development",
                colour: "#5AC8FA",
                desc: "Local iteration. Can scale to zero. Used for Alis build + quick iteration loops.",
              },
            ].map(({ name, colour, desc }) => (
              <div
                key={name}
                className="flex items-start gap-[12px] px-[12px] py-[10px] bg-muted border border-border rounded-[4px]"
              >
                <div
                  className="size-[8px] rounded-full mt-[4px] shrink-0"
                  style={{ backgroundColor: colour }}
                />
                <div>
                  <p className="text-[11px] font-bold text-foreground font-mono mb-[2px]">{name}</p>
                  <p className="text-[11px] text-foreground/50 leading-[1.4]">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-foreground/45 leading-[1.5]">
            When you select an environment in the top-right dropdown, all build and deploy commands
            in the hub target that environment's GCP resources.
          </p>
        </div>
      ),
    },
    {
      id: "m1-s3",
      title: "The Alis CLI",
      body: (
        <div className="flex flex-col gap-[12px]">
          <p className="text-[12px] text-foreground/70 leading-[1.7]">
            You interact with Alis primarily through its CLI tool and this hub app. The three core
            commands map to the three phases every service goes through:
          </p>
          <div className="flex flex-col gap-[6px]">
            {[
              {
                cmd: "Alis define",
                desc: "Registers a new service contract (proto file) and generates code stubs.",
              },
              {
                cmd: "Alis build",
                desc: "Compiles your implementation and pushes a Docker image to Artifact Registry via Cloud Build.",
              },
              {
                cmd: "Alis deploy",
                desc: "Provisions or updates GCP resources (Cloud Run, Endpoints, IAM) for the built image.",
              },
            ].map(({ cmd, desc }) => (
              <div
                key={cmd}
                className="px-[12px] py-[10px] bg-background border border-border rounded-[4px]"
              >
                <p className="text-[12px] font-bold text-brand font-mono mb-[4px]">{cmd}</p>
                <p className="text-[11px] text-foreground/55 leading-[1.4]">{desc}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-foreground/40 leading-[1.5]">
            The following modules walk through each of these in detail, showing exactly what happens
            at every step.
          </p>
        </div>
      ),
    },
  ],
};
