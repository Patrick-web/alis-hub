import { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { Loader } from "../Loader";
import { Button } from "../Button";
import { EmptyState } from "../EmptyState";
import * as GS from "../../../../bindings/alis-hub-v3/gcloudservice";
import type {
  SpannerInstance,
  SpannerBackup,
} from "../../../../bindings/alis-hub-v3/models";

interface Props {
  projectID: string;
}

const STATE_STYLE: Record<string, string> = {
  READY: "text-green-400 bg-green-400/10",
  CREATING: "text-warning bg-warning/10",
};

function shortName(n: string): string {
  return n.split("/").pop() ?? n;
}

function formatBytes(s: string): string {
  const n = parseInt(s, 10);
  if (isNaN(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1_073_741_824) return `${(n / 1_048_576).toFixed(1)} MB`;
  return `${(n / 1_073_741_824).toFixed(2)} GB`;
}

function fmtRelative(iso: string): string {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

function fmtAbsolute(iso: string): string {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

export function SpannerBackupsExplorer({ projectID }: Props) {
  const [instances, setInstances] = useState<SpannerInstance[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(true);
  const [instancesError, setInstancesError] = useState<string | null>(null);
  const [selectedInstance, setSelectedInstance] =
    useState<SpannerInstance | null>(null);

  const [backups, setBackups] = useState<SpannerBackup[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupsError, setBackupsError] = useState<string | null>(null);

  useEffect(() => {
    setInstancesLoading(true);
    setInstancesError(null);
    setSelectedInstance(null);
    setBackups([]);
    GS.ListSpannerInstances(projectID)
      .then((items: SpannerInstance[]) => setInstances(items || []))
      .catch((e: unknown) => setInstancesError(String(e)))
      .finally(() => setInstancesLoading(false));
  }, [projectID]);

  function handleSelectInstance(instance: SpannerInstance) {
    setSelectedInstance(instance);
    setBackupsLoading(true);
    setBackupsError(null);
    setBackups([]);
    GS.ListSpannerBackups(instance.name)
      .then((items: SpannerBackup[]) => setBackups(items || []))
      .catch((e: unknown) => setBackupsError(String(e)))
      .finally(() => setBackupsLoading(false));
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left pane — instance list */}
      <div className="w-[220px] shrink-0 border-r border-border flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-[12px] py-[9px] border-b border-border shrink-0">
          <p className="text-[9px] font-bold uppercase text-foreground/40 font-mono">
            {instancesLoading
              ? "Loading…"
              : `${instances.length} instance${instances.length !== 1 ? "s" : ""}`}
          </p>
          <Button
            variant="ghost"
            onClick={() => GS.OpenInConsole("spanner", projectID, "")}
            icon={<Icon icon="solar:export-linear" className="text-xs" />}
            className="text-foreground/40 hover:text-foreground"
          >
            Console
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {instancesLoading ? (
            <div className="flex items-center justify-center py-[40px]">
              <Loader size={24} />
            </div>
          ) : instancesError ? (
            <div className="m-[10px] p-[8px] bg-red-900/20 border border-red-800 rounded-[4px]">
              <p className="text-[10px] text-red-400 font-mono">
                {instancesError}
              </p>
            </div>
          ) : instances.length === 0 ? (
            <div className="flex items-center justify-center py-[40px]">
              <p className="text-[10px] text-foreground/30 font-mono">
                No instances
              </p>
            </div>
          ) : (
            instances.map((instance) => {
              const isActive = selectedInstance?.name === instance.name;
              const ss =
                STATE_STYLE[instance.state] ??
                "text-foreground/30 bg-foreground/5";
              return (
                <button
                  key={instance.name}
                  onClick={() => handleSelectInstance(instance)}
                  className={`w-full flex items-center gap-[7px] px-[10px] py-[8px] transition-colors text-left border-b border-border ${
                    isActive
                      ? "bg-brand-fill/7"
                      : "hover:bg-foreground/[3%]"
                  }`}
                >
                  <Icon
                    icon="solar:server-bold"
                    className={`text-sm shrink-0 ${isActive ? "text-brand" : "text-foreground/45"}`}
                  />
                  <span
                    className={`text-[10px] font-mono flex-1 truncate ${isActive ? "text-foreground" : "text-foreground/60"}`}
                  >
                    {instance.displayName || shortName(instance.name)}
                  </span>
                  <span
                    className={`text-[7px] uppercase px-[4px] py-[1px] rounded-[2px] font-mono shrink-0 ${ss}`}
                  >
                    {instance.state || "?"}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right pane — backup table */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex items-center justify-between px-[16px] py-[9px] border-b border-border shrink-0">
          {selectedInstance ? (
            <div className="flex items-center gap-[7px]">
              <Icon
                icon="solar:server-bold"
                className="text-sm text-brand shrink-0"
              />
              <p className="text-[10px] font-mono text-foreground/70">
                {selectedInstance.displayName ||
                  shortName(selectedInstance.name)}
              </p>
              {!backupsLoading && (
                <span className="text-[8px] text-foreground/30 font-mono">
                  {backups.length} backup{backups.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          ) : (
            <p className="text-[10px] font-mono text-foreground/25">
              Select an instance
            </p>
          )}
          {selectedInstance && (
            <Button
              variant="ghost"
              onClick={() =>
                GS.OpenInConsole(
                  "spanner-backups",
                  projectID,
                  shortName(selectedInstance.name),
                )
              }
              icon={<Icon icon="solar:export-linear" className="text-xs" />}
              className="text-foreground/40 hover:text-foreground"
            >
              Console
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {!selectedInstance ? (
            <div className="flex-1 flex flex-col items-center justify-center h-full gap-[8px]">
              <Icon
                icon="solar:server-bold"
                className="text-[28px] text-foreground/8"
              />
              <p className="text-[11px] text-foreground/30 font-mono">
                Select an instance to view backups
              </p>
            </div>
          ) : backupsLoading ? (
            <div className="flex items-center justify-center py-[40px]">
              <Loader size={24} />
            </div>
          ) : backupsError ? (
            <div className="m-[16px] p-[12px] bg-red-900/20 border border-red-800 rounded-[4px]">
              <p className="text-[10px] text-red-400 font-mono">
                {backupsError}
              </p>
            </div>
          ) : backups.length === 0 ? (
            <EmptyState
              icon="solar:history-bold"
              title="No backups found"
              description="This instance has no Spanner backups"
            />
          ) : (
            <table className="w-full border-collapse text-[10px] font-mono">
              <thead>
                <tr className="bg-muted border-b border-border sticky top-0">
                  {[
                    "Backup",
                    "Database",
                    "State",
                    "Size",
                    "Created",
                    "Expires",
                    "Version Time",
                  ].map((col) => (
                    <th
                      key={col}
                      className="text-left px-[12px] py-[7px] text-foreground/50 font-bold uppercase text-[9px] whitespace-nowrap border-r border-border last:border-0"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => {
                  const ss =
                    STATE_STYLE[backup.state] ??
                    "text-foreground/30 bg-foreground/5";
                  return (
                    <tr
                      key={backup.name}
                      className="border-b border-border hover:bg-foreground/[2%]"
                    >
                      <td className="px-[12px] py-[7px] border-r border-border max-w-[200px]">
                        <span className="text-foreground/80 truncate block">
                          {shortName(backup.name)}
                        </span>
                      </td>
                      <td className="px-[12px] py-[7px] border-r border-border max-w-[160px]">
                        <span className="text-foreground/60 truncate block">
                          {shortName(backup.database)}
                        </span>
                      </td>
                      <td className="px-[12px] py-[7px] border-r border-border whitespace-nowrap">
                        <span
                          className={`text-[8px] uppercase px-[5px] py-[1px] rounded-[2px] font-mono ${ss}`}
                        >
                          {backup.state || "?"}
                        </span>
                      </td>
                      <td className="px-[12px] py-[7px] border-r border-border whitespace-nowrap text-foreground/60">
                        {formatBytes(backup.sizeBytes)}
                      </td>
                      <td className="px-[12px] py-[7px] border-r border-border whitespace-nowrap text-foreground/60">
                        {fmtRelative(backup.createTime)}
                      </td>
                      <td className="px-[12px] py-[7px] border-r border-border whitespace-nowrap text-foreground/60">
                        {fmtAbsolute(backup.expireTime)}
                      </td>
                      <td className="px-[12px] py-[7px] whitespace-nowrap text-foreground/60">
                        {fmtRelative(backup.versionTime)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
