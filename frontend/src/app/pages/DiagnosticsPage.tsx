import { useState, useEffect, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Loader } from "../components/Loader";
import { Button } from "../components/Button";
import * as CLI from "../../../bindings/alis-hub-v3/cliservice";
import type { Diagnostics } from "../../../bindings/alis-hub-v3/models";

/**
 * Local environment diagnostics, from `alis doctor`.
 *
 * This is a read-only local snapshot — nothing is uploaded. It surfaces two
 * settings that explain behaviour users otherwise experience as unexplained
 * failures:
 *
 *   - the automation tier, which decides which commands stop and ask for
 *     approval before running;
 *   - safe mode, which restricts platform commands to an allowlist of
 *     organisations.
 */

function SectionLabel({ children }: { children: string }) {
  return (
    <span className="text-[9px] text-foreground/25 font-mono uppercase tracking-[0.12em]">
      {children}
    </span>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  const color =
    tone === "good" ? "text-brand" : tone === "warn" ? "text-amber-400" : "text-foreground/80";
  return (
    <div className="flex items-center gap-[12px] px-[16px] py-[8px] border-b border-border last:border-b-0">
      <span className="text-[9px] text-foreground/30 font-mono uppercase tracking-[0.1em] shrink-0 w-[150px]">
        {label}
      </span>
      <span className={`text-[11px] font-mono flex-1 truncate min-w-0 ${color}`}>
        {value || "—"}
      </span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-[18px]">
      <div className="mb-[6px]">
        <SectionLabel>{title}</SectionLabel>
      </div>
      <div className="border border-border bg-card">{children}</div>
    </div>
  );
}

/** Explains what a tier actually changes, rather than just naming it. */
function tierExplanation(tier: string): string {
  switch (tier) {
    case "manual":
      return "Mutating and destructive commands both stop for approval";
    case "autonomous":
      return "Nothing stops for approval except production deploys";
    case "balanced":
    default:
      return "Destructive commands stop for approval; production deploys always do";
  }
}

export function DiagnosticsPage() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await CLI.Doctor());
    } catch (e) {
      setError(String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-[12px] px-[20px] py-[14px] border-b border-border shrink-0">
        <Icon icon="solar:health-linear" className="text-brand text-[20px]" />
        <div className="flex flex-col">
          <span className="text-[13px] text-foreground font-mono">Diagnostics</span>
          <span className="text-[10px] text-foreground/40 font-mono">
            Local environment snapshot — nothing is uploaded
          </span>
        </div>
        <div className="flex-1" />
        <Button variant="secondary" onClick={() => void load()} className="text-[10px]">
          Refresh
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-[20px] py-[16px] min-h-0">
        {loading ? (
          <div className="flex justify-center py-[40px]">
            <Loader size={28} />
          </div>
        ) : error ? (
          <div className="text-[10px] text-red-400 font-mono">{error}</div>
        ) : !data ? null : (
          <>
            <Card title="CLI">
              <Row label="Version" value={data.cliVersion} />
              <Row
                label="Authenticated"
                value={data.authorized ? "yes" : "no — run alis login"}
                tone={data.authorized ? "good" : "warn"}
              />
              <Row label="Build account" value={data.buildAccount} />
              <Row label="Snapshot taken" value={data.createdAt} />
            </Card>

            <Card title="Approvals">
              <Row label="Automation tier" value={data.automationTier} />
              <Row label="Effect" value={tierExplanation(data.automationTier)} />
              <Row
                label="Safe mode"
                value={data.safeModeEnabled ? "enabled" : "off"}
                tone={data.safeModeEnabled ? "warn" : undefined}
              />
              {data.safeModeEnabled && (
                <Row
                  label="Allowed orgs"
                  value={(data.safeModeOrganisations ?? []).join(", ")}
                />
              )}
            </Card>

            <Card title="Host">
              <Row label="OS" value={`${data.os} ${data.arch}`} />
              <Row label="Shell" value={data.shell} />
              <Row label="Terminal" value={data.terminal} />
            </Card>

            {(data.components ?? []).length > 0 && (
              <Card title="Components">
                {(data.components ?? []).map((c, i) => (
                  <Row
                    key={i}
                    label={c.name}
                    value={c.detected ? c.version || "detected" : "not detected"}
                    tone={c.detected ? "good" : undefined}
                  />
                ))}
              </Card>
            )}

            {(data.setup ?? []).length > 0 && (
              <Card title="Setup">
                {(data.setup ?? []).map((s, i) => (
                  <Row
                    key={i}
                    label={s.name}
                    value={s.installed ? s.detail || "installed" : s.detail || "not installed"}
                    tone={s.installed ? "good" : "warn"}
                  />
                ))}
              </Card>
            )}

            {data.detectedBinaries && Object.keys(data.detectedBinaries).length > 0 && (
              <Card title="Agent harnesses on PATH">
                {Object.entries(data.detectedBinaries).map(([name, path]) => (
                  <Row
                    key={name}
                    label={name}
                    value={path ?? ""}
                    tone={path ? "good" : undefined}
                  />
                ))}
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
