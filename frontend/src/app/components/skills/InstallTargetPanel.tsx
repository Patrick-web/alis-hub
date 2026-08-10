import { useCallback, useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { RightPane } from "../RightPane";
import { Button } from "../Button";
import { Loader } from "../Loader";
import { useWorkspace, type Organisation } from "../../stores/workspace";
import * as ProductService from "../../../../bindings/alis-hub-v3/productservice";
import type { SkillInstallTarget } from "../../../../bindings/alis-hub-v3/models";
import { targetLabel, type InstallTarget } from "./target";

/**
 * Picks where a skill gets installed.
 *
 * The CLI takes the project folder from the working directory it is run in and
 * offers no flag that names one, so the app has to choose a folder before it
 * can install anything. The two scopes it supports are user (the harness config
 * dir) and project (whatever folder it is handed), which is what this panel
 * lets the user pick between.
 *
 * Landing zones group the list rather than being targets themselves: an
 * organisation owns no repo of its own, only one build repo per product.
 */

function orgId(org: Organisation): string {
  return org.name.replace("organisations/", "");
}

function ScopeRow({
  selected,
  onSelect,
}: {
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-[14px] py-[10px] border-b border-border transition-colors ${
        selected ? "bg-brand-fill/10" : "hover:bg-accent"
      }`}
    >
      <div className="flex items-center gap-[8px]">
        <Icon
          icon={selected ? "solar:record-circle-bold" : "solar:record-circle-linear"}
          className={`text-[13px] shrink-0 ${selected ? "text-brand" : "text-foreground/25"}`}
        />
        <div className="min-w-0">
          <div className="text-[11px] font-mono text-foreground">User scope</div>
          <div className="text-[9px] font-mono text-foreground/40 truncate">
            ~/.claude/skills — available in every project
          </div>
        </div>
      </div>
    </button>
  );
}

function TargetRow({
  target,
  selected,
  onSelect,
}: {
  target: SkillInstallTarget;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={!target.cloned}
      title={
        target.cloned
          ? target.dir
          : "Not cloned to this machine — open it from Landing Zones to clone it first"
      }
      className={`w-full text-left pl-[30px] pr-[14px] py-[8px] transition-colors ${
        selected ? "bg-brand-fill/10" : "enabled:hover:bg-accent"
      } disabled:opacity-35 disabled:cursor-not-allowed`}
    >
      <div className="flex items-center gap-[8px]">
        <Icon
          icon={selected ? "solar:record-circle-bold" : "solar:record-circle-linear"}
          className={`text-[13px] shrink-0 ${selected ? "text-brand" : "text-foreground/25"}`}
        />
        <span className="text-[11px] font-mono text-foreground truncate flex-1">
          {target.displayName}
        </span>
        {!target.cloned && (
          <span className="text-[8px] font-mono uppercase tracking-[0.08em] text-foreground/35 shrink-0">
            not cloned
          </span>
        )}
      </div>
    </button>
  );
}

function ZoneSection({
  org,
  expanded,
  onToggle,
  selected,
  onSelect,
}: {
  org: Organisation;
  expanded: boolean;
  onToggle: () => void;
  selected: InstallTarget;
  onSelect: (t: SkillInstallTarget) => void;
}) {
  const id = orgId(org);
  const [targets, setTargets] = useState<SkillInstallTarget[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Products load on expand rather than up front: listing them costs a call per
  // organisation, and most of the list is never opened.
  useEffect(() => {
    if (!expanded || targets || loading) return;
    setLoading(true);
    setError("");
    ProductService.ListSkillInstallTargets(id)
      .then((found) => setTargets(found ?? []))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [expanded, targets, loading, id]);

  return (
    <div className="border-b border-border">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-[8px] px-[14px] py-[9px] hover:bg-accent transition-colors text-left"
      >
        <Icon
          icon={expanded ? "solar:alt-arrow-down-linear" : "solar:alt-arrow-right-linear"}
          className="text-[12px] text-foreground/40 shrink-0"
        />
        <span className="text-[11px] font-mono text-foreground truncate flex-1">
          {org.displayName || id}
        </span>
        {targets && (
          <span className="text-[9px] font-mono text-foreground/30 shrink-0">{targets.length}</span>
        )}
      </button>

      {expanded && (
        <div className="pb-[4px]">
          {loading && (
            <div className="flex justify-center py-[12px]">
              <Loader size={18} />
            </div>
          )}
          {error && (
            <div className="px-[30px] py-[8px] text-[10px] font-mono text-destructive">{error}</div>
          )}
          {targets?.length === 0 && !loading && (
            <div className="px-[30px] py-[8px] text-[10px] font-mono text-foreground/30">
              No products
            </div>
          )}
          {targets?.map((t) => (
            <TargetRow
              key={t.dir}
              target={t}
              selected={selected?.dir === t.dir}
              onSelect={() => onSelect(t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function InstallTargetPanel({
  skillId,
  busy,
  onInstall,
  onClose,
}: {
  skillId: string;
  busy: boolean;
  onInstall: (target: InstallTarget) => void;
  onClose: () => void;
}) {
  const { state } = useWorkspace();
  const [zones, setZones] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(state.organisation || null);
  // Undefined means nothing picked yet; null is a deliberate choice of user
  // scope, so the two cannot share a value.
  const [target, setTarget] = useState<InstallTarget | undefined>(undefined);

  useEffect(() => {
    setLoading(true);
    ProductService.ListLandingZones()
      .then((data) => setZones([...(data?.own ?? []), ...(data?.shared ?? [])]))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Default to the product already being worked in. The Skills page is also
  // reachable standalone, where there is no product — user scope then.
  useEffect(() => {
    if (target !== undefined) return;
    if (!state.organisation || !state.product) {
      setTarget(null);
      return;
    }
    ProductService.ListSkillInstallTargets(state.organisation)
      .then((found) => {
        const match = (found ?? []).find((t) => t.product === state.product && t.cloned);
        setTarget(match ?? null);
      })
      .catch(() => setTarget(null));
  }, [state.organisation, state.product, target]);

  const select = useCallback((t: SkillInstallTarget) => setTarget(t), []);

  const chosen: InstallTarget = target ?? null;

  return (
    <RightPane
      label="INSTALL INTO"
      title={skillId}
      onClose={onClose}
      width="w-[340px]"
      footer={
        <Button
          variant="primary"
          disabled={busy || target === undefined}
          onClick={() => onInstall(chosen)}
          className="w-full"
        >
          {busy ? "Installing…" : `Install into ${targetLabel(chosen)}`}
        </Button>
      }
    >
      <div className="flex-1 overflow-y-auto min-h-0">
        <ScopeRow selected={target === null} onSelect={() => setTarget(null)} />

        <div className="px-[14px] pt-[12px] pb-[6px]">
          <span className="text-[9px] text-foreground/25 font-mono uppercase tracking-[0.12em]">
            LANDING ZONES
          </span>
        </div>

        {loading && (
          <div className="flex justify-center py-[20px]">
            <Loader size={22} />
          </div>
        )}
        {error && (
          <div className="px-[14px] py-[8px] text-[10px] font-mono text-destructive">{error}</div>
        )}

        {zones.map((org) => (
          <ZoneSection
            key={org.name}
            org={org}
            expanded={expanded === orgId(org)}
            onToggle={() => setExpanded(expanded === orgId(org) ? null : orgId(org))}
            selected={chosen}
            onSelect={select}
          />
        ))}
      </div>

      {chosen && (
        <div className="shrink-0 border-t border-border px-[14px] py-[8px]">
          <div className="text-[9px] font-mono text-foreground/30 break-all">
            {chosen.dir}/.claude/skills/{skillId}
          </div>
        </div>
      )}
    </RightPane>
  );
}
