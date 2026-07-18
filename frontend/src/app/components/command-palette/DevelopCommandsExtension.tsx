import { useEffect } from "react";
import { useNavigate } from "react-router";
import { HistoryIcon } from "lucide-react";
import { useDevelopTabs } from "../../stores/developTabs";
import { useCommandPalette, type CommandItem } from "../../stores/commandPalette";
import { getSession, useDevelopSessions } from "../../stores/developSessions";
import {
  FLOW_ROOT_META,
  packagesServicesPage,
  pushFlowPages,
  servicesPage,
} from "./developFlowPages";
import type { TaskType } from "../../stores/notifications";

const TYPE_LABELS: Record<TaskType, string> = {
  define: "Define",
  build: "Build",
  deploy: "Deploy",
  packages: "Packages",
  workflow: "Workflow",
};

function sessionStepLabel(tabId: string): string | undefined {
  const session = getSession(tabId);
  if (!session) return undefined;
  switch (session.step) {
    case "commits":
      return "Selecting commit";
    case "confirm":
      return "Confirming";
    case "loading":
      return "Loading";
    case "scan":
      return "Scanning";
    case "select-action":
      return "Selecting action";
    case "select-folders":
      return "Selecting folders";
    case "venv-setup":
      return "Venv setup";
    case "preparing":
      return "Starting";
    case "running":
      return "Running";
    case "glass":
    case "result":
      return "Finished";
    default:
      return undefined;
  }
}

export function DevelopCommandsExtension() {
  const { tabs } = useDevelopTabs();
  const { registerExtension, unregisterExtension } = useCommandPalette();
  const navigate = useNavigate();

  // Re-register when any flow moves to a different step so the resume
  // subtitles stay accurate (string selector avoids re-renders on other
  // session changes like progress messages or log-driven patches).
  const stepsKey = useDevelopSessions((s) =>
    tabs.map((t) => s.sessions[t.id]?.step ?? "").join(","),
  );

  useEffect(() => {
    // Root entry points — one per develop action; each opens a sub-page flow.
    const rootCommands: CommandItem[] = FLOW_ROOT_META.map(({ type, label, icon }) => ({
      id: `develop-${type}`,
      title: label,
      subtitle: type === "packages" ? "Select services" : "Select a service",
      group: "Develop",
      groupOrder: 10,
      icon,
      keywords: [type, "develop", "service", "neuron"],
      onSelect: (ctx) => {
        if (type === "packages") ctx.push(packagesServicesPage(navigate));
        else ctx.push(servicesPage(type, navigate));
      },
    }));

    // Resume entries — one per open Develop tab, jumping straight to the
    // page matching the flow's current step.
    const resumeCommands: CommandItem[] = tabs
      .filter((t) => t.type !== "workflow")
      .map((tab) => ({
        id: `develop-resume-${tab.id}`,
        title: `${TYPE_LABELS[tab.type]} · ${tab.neuron}`,
        subtitle: sessionStepLabel(tab.id),
        group: "Resume",
        groupOrder: -1,
        icon: HistoryIcon,
        keywords: ["resume", "continue", tab.type, tab.neuron],
        onSelect: (ctx) => {
          useDevelopTabs.getState().activateTab(tab.id);
          pushFlowPages(ctx, tab.type, tab.id, tab.neuron, navigate);
        },
      }));

    registerExtension({ id: "develop-actions", commands: [...resumeCommands, ...rootCommands] });
    return () => unregisterExtension("develop-actions");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, stepsKey, navigate, registerExtension, unregisterExtension]);

  return null;
}
