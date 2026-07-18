import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { DatabaseIcon, FileTextIcon, BoxIcon, KeyRoundIcon, TableIcon } from "lucide-react";
import { useCommandPalette, type CommandItem } from "../../stores/commandPalette";
import { useGCloud, type ToolTab } from "../../stores/gcloud";
import * as GS from "../../../../bindings/alis-hub-v3/gcloudservice";
import type { GCloudStatus } from "../../../../bindings/alis-hub-v3/models";

const GCLOUD_TOOLS: {
  id: ToolTab;
  title: string;
  keywords: string[];
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "buckets", title: "Open Buckets", keywords: ["buckets", "storage", "gcs"], icon: BoxIcon },
  {
    id: "logs",
    title: "Open Logs",
    keywords: ["logs", "logging", "cloud logs"],
    icon: FileTextIcon,
  },
  {
    id: "artifactregistry",
    title: "Open Artifact Registry",
    keywords: ["artifacts", "registry", "docker", "gar"],
    icon: DatabaseIcon,
  },
  {
    id: "secrets",
    title: "Open Secret Manager",
    keywords: ["secrets", "secret manager", "gsm"],
    icon: KeyRoundIcon,
  },
  {
    id: "spanner",
    title: "Open Spanner",
    keywords: ["spanner", "database", "sql"],
    icon: TableIcon,
  },
];

const GCLOUD_TTL = 5 * 60 * 1000;

export function GCloudCommandsExtension() {
  const registerExtension = useCommandPalette((s) => s.registerExtension);
  const unregisterExtension = useCommandPalette((s) => s.unregisterExtension);
  const navigate = useNavigate();
  const [gcloudStatus, setGcloudStatus] = useState<GCloudStatus | null>(null);
  const lastCheckRef = { current: 0 };

  useEffect(() => {
    const now = Date.now();
    if (now - lastCheckRef.current < GCLOUD_TTL) return;
    lastCheckRef.current = now;
    GS.CheckGCloudStatus()
      .then(setGcloudStatus)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const notAuthed = !gcloudStatus?.authenticated;
    const commands: CommandItem[] = GCLOUD_TOOLS.map((tool) => ({
      id: `gcloud-${tool.id}`,
      title: tool.title,
      group: "GCloud Tools",
      groupOrder: 20,
      icon: tool.icon,
      keywords: ["gcloud", "tools", ...tool.keywords],
      badge: notAuthed ? { text: "Not authenticated", variant: "warning" as const } : undefined,
      onSelect: (ctx) => {
        if (!notAuthed) useGCloud.getState().openTool(tool.id);
        navigate("/tools");
        ctx.close();
      },
    }));
    registerExtension({ id: "gcloud-tools", commands });
    return () => unregisterExtension("gcloud-tools");
  }, [gcloudStatus, navigate, registerExtension, unregisterExtension]);

  return null;
}
