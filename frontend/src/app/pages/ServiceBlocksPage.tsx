import { useState, useEffect, useCallback, useMemo } from "react";
import { Icon } from "@iconify/react";
import { useParams, useNavigate } from "react-router";
import { Loader } from "../components/Loader";
import { Button } from "../components/Button";
import { FilterInput } from "../components/FilterInput";
import { ApprovalGateDialog, useApprovalGate } from "../components/ApprovalGate";
import { notify } from "../lib/notify";
import { useWorkspace } from "../stores/workspace";
import * as ProductService from "../../../bindings/alis-hub-v3/productservice";
import type { BlockInstallInfo, BlockCatalogInfo } from "../../../bindings/alis-hub-v3/models";

/**
 * Code blocks for one service.
 *
 * The app's existing blocks pages work on a different axis: the catalog lists
 * every block, and the details page answers "which services have this block?".
 * Neither answers "what is installed in *this* service, and what could be" —
 * which is the question you have while working on a service.
 *
 * `alis blocks list <pkg>` answers it in one call, and is the only source for
 * several things the Console API does not return at all:
 *
 *   - upgradeAvailable / latestVersion per install, so an available upgrade is
 *     visible without fetching every version and comparing by hand;
 *   - the block/* gitBranch an install was committed to, which is what a
 *     deferred merge folds into main;
 *   - agenticInstallOnly and deprecated on catalog entries, which decide
 *     whether an install action may be offered at all.
 */

/**
 * Neuron id -> package id, mirroring cliwrap.NeuronToPackageID in Go:
 * "dummy-v1" in voyage/zz becomes "voyage.zz.dummy.v1". Multi-segment paths
 * work the same way ("internal-api-v2" -> "internal.api.v2").
 */
function packageIdFor(org: string, product: string, neuronId: string): string {
  if (!org || !product || !neuronId) return "";
  return `${org}.${product}.${neuronId.split("-").join(".")}`;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <span className="text-[9px] text-foreground/25 font-mono uppercase tracking-[0.12em]">
      {children}
    </span>
  );
}

function ReleaseBadge({ level }: { level: string }) {
  if (!level) return null;
  const tone =
    level === "GA"
      ? "text-brand border-brand-fill/30"
      : level === "RC" || level === "BETA"
        ? "text-amber-400 border-amber-400/30"
        : "text-foreground/40 border-border";
  return (
    <span className={`text-[8px] font-mono px-[5px] py-[1px] border ${tone} uppercase`}>
      {level}
    </span>
  );
}

function InstalledRow({
  block,
  busy,
  onUpgrade,
  onUninstall,
  onMerge,
}: {
  block: BlockInstallInfo;
  busy: boolean;
  onUpgrade: () => void;
  onUninstall: () => void;
  onMerge: () => void;
}) {
  return (
    <div className="flex items-center gap-[12px] px-[16px] py-[11px] border-b border-border last:border-b-0 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[7px]">
          <span className="text-[11px] text-foreground font-mono truncate">
            {block.displayName || block.blockId}
          </span>
          {block.upgradeAvailable && (
            <span className="text-[8px] font-mono px-[5px] py-[1px] border border-brand-fill/30 text-brand uppercase">
              upgrade
            </span>
          )}
        </div>
        <div className="flex items-center gap-[10px] mt-[3px]">
          <span className="text-[10px] text-foreground/40 font-mono">
            {block.installedVersion || "—"}
            {block.upgradeAvailable && block.latestVersion ? ` → ${block.latestVersion}` : ""}
          </span>
          {block.state && (
            <span className="text-[9px] text-foreground/30 font-mono">{block.state}</span>
          )}
          {/* The branch an install was committed to; a deferred merge folds
              this into main in both the build and define repos. */}
          {block.gitBranch && (
            <span className="text-[9px] text-foreground/25 font-mono truncate">
              {block.gitBranch}
            </span>
          )}
        </div>
        {/* The instance ref is what every mutating command needs when a block
            is installed more than once into the same service. */}
        <span className="text-[9px] text-foreground/20 font-mono">{block.instance}</span>
      </div>

      <div className="flex items-center gap-[6px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {block.gitBranch && (
          <Button variant="ghost" disabled={busy} onClick={onMerge} className="text-[10px]">
            Merge
          </Button>
        )}
        {block.upgradeAvailable && (
          <Button variant="secondary" disabled={busy} onClick={onUpgrade} className="text-[10px]">
            Upgrade
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={onUninstall} className="text-[10px]">
          Uninstall
        </Button>
      </div>
    </div>
  );
}

function AvailableRow({
  block,
  busy,
  onInstall,
}: {
  block: BlockCatalogInfo;
  busy: boolean;
  onInstall: () => void;
}) {
  // Two flags decide whether an install action may be offered at all. Neither
  // is returned by the Console API, so the existing catalog cannot honour them.
  const blocked = block.agenticInstallOnly || block.deprecated;
  const reason = block.deprecated
    ? "Deprecated — not available for new installs"
    : "Agent-only install — this block expects an agent-driven flow";

  return (
    <div className="flex items-center gap-[12px] px-[16px] py-[11px] border-b border-border last:border-b-0 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[7px]">
          <span
            className={`text-[11px] font-mono truncate ${
              block.deprecated ? "text-foreground/35 line-through" : "text-foreground"
            }`}
          >
            {block.displayName || block.blockId}
          </span>
          <ReleaseBadge level={block.releaseLevel} />
          {block.agenticInstallOnly && (
            <span className="text-[8px] font-mono px-[5px] py-[1px] border border-border text-foreground/35 uppercase">
              agent only
            </span>
          )}
        </div>
        <p className="text-[10px] text-foreground/40 font-mono mt-[3px] truncate">
          {block.tagline}
        </p>
      </div>

      <span className="text-[9px] text-foreground/25 font-mono shrink-0">
        {block.latestVersion}
      </span>

      <div className="shrink-0">
        {blocked ? (
          <span className="text-[9px] text-foreground/30 font-mono" title={reason}>
            unavailable
          </span>
        ) : (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={onInstall}
            className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Install
          </Button>
        )}
      </div>
    </div>
  );
}

export function ServiceBlocksPage() {
  const { neuronId = "" } = useParams();
  const navigate = useNavigate();
  const { state } = useWorkspace();

  const [installed, setInstalled] = useState<BlockInstallInfo[]>([]);
  const [available, setAvailable] = useState<BlockCatalogInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  const pkg = useMemo(
    () => packageIdFor(state.organisation, state.product, neuronId),
    [state.organisation, state.product, neuronId],
  );

  const load = useCallback(async () => {
    if (!pkg) return;
    setLoading(true);
    setError("");
    try {
      const overview = await ProductService.ListServiceBlocks(pkg);
      setInstalled(overview?.installed ?? []);
      setAvailable(overview?.available ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [pkg]);

  useEffect(() => {
    void load();
  }, [load]);

  // Uninstall is destructive, so the default automation tier stops it and asks.
  const gate = useApprovalGate(() => {
    notify.success("Block uninstalled");
    void load();
  });

  const uninstall = useCallback(
    (block: BlockInstallInfo) => {
      void gate.run(
        (approval) => ProductService.UninstallBlockInstanceCLI(block.instance, approval),
        `Uninstall ${block.displayName || block.blockId} from ${neuronId}`,
      );
    },
    [gate, neuronId],
  );

  const upgrade = useCallback(
    async (block: BlockInstallInfo) => {
      setBusy(true);
      setError("");
      try {
        // noMerge is false: the CLI folds the block branch into main in both
        // local repos, which is the behaviour someone clicking "Upgrade" in a
        // desktop app expects. Merge stays available separately for installs
        // whose branch was left outstanding.
        await ProductService.UpgradeBlockInstanceCLI(block.instance, block.latestVersion, false);
        notify.success(`Upgraded ${block.blockId} to ${block.latestVersion}`);
        await load();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const merge = useCallback(
    async (block: BlockInstallInfo) => {
      setBusy(true);
      setError("");
      try {
        await ProductService.MergeBlockInstanceCLI(block.instance);
        notify.success(`Merged ${block.gitBranch}`);
        await load();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const install = useCallback(
    async (block: BlockCatalogInfo) => {
      setBusy(true);
      setError("");
      try {
        await ProductService.InstallBlockCLI({
          blockId: block.blockId,
          package: pkg,
          version: "",
          buildFolder: "",
          noMerge: false,
        });
        notify.success(`Installed ${block.blockId}`);
        await load();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [pkg, load],
  );

  const q = filter.toLowerCase();
  const shownInstalled = installed.filter(
    (b) => !q || b.blockId.toLowerCase().includes(q) || b.displayName?.toLowerCase().includes(q),
  );
  const shownAvailable = available.filter(
    (b) => !q || b.blockId.toLowerCase().includes(q) || b.displayName?.toLowerCase().includes(q),
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-[12px] px-[20px] py-[14px] border-b border-border shrink-0">
        <button
          onClick={() => navigate("/services")}
          className="text-foreground/35 hover:text-foreground transition-colors"
          title="Back to services"
        >
          <Icon icon="solar:alt-arrow-left-linear" className="text-[16px]" />
        </button>
        <Icon icon="solar:box-linear" className="text-brand text-[18px]" />
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] text-foreground font-mono truncate">{neuronId}</span>
          <span className="text-[10px] text-foreground/40 font-mono truncate">
            {pkg || "no service context"}
          </span>
        </div>
        <div className="flex-1" />
        <FilterInput
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter blocks"
        />
        <Button variant="secondary" onClick={() => void load()} className="text-[10px]">
          Refresh
        </Button>
      </div>

      {(error || gate.error) && (
        <div className="px-[20px] py-[8px] text-[10px] text-red-400 font-mono border-b border-border shrink-0">
          {error || gate.error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-[20px] py-[16px] min-h-0">
        {loading ? (
          <div className="flex justify-center py-[40px]">
            <Loader size={28} />
          </div>
        ) : !pkg ? (
          <div className="text-[10px] text-foreground/35 font-mono text-center py-[30px]">
            Select an organisation and product first
          </div>
        ) : (
          <>
            <div className="mb-[18px]">
              <div className="mb-[6px]">
                <SectionLabel>{`INSTALLED (${shownInstalled.length})`}</SectionLabel>
              </div>
              <div className="border border-border bg-card">
                {shownInstalled.length === 0 ? (
                  <div className="px-[16px] py-[14px] text-[10px] text-foreground/30 font-mono">
                    No blocks installed in this service
                  </div>
                ) : (
                  shownInstalled.map((b) => (
                    <InstalledRow
                      key={b.instance || b.blockId}
                      block={b}
                      busy={busy || gate.busy}
                      onUpgrade={() => void upgrade(b)}
                      onUninstall={() => uninstall(b)}
                      onMerge={() => void merge(b)}
                    />
                  ))
                )}
              </div>
            </div>

            <div>
              <div className="mb-[6px]">
                <SectionLabel>{`AVAILABLE (${shownAvailable.length})`}</SectionLabel>
              </div>
              <div className="border border-border bg-card">
                {shownAvailable.length === 0 ? (
                  <div className="px-[16px] py-[14px] text-[10px] text-foreground/30 font-mono">
                    Nothing else to install
                  </div>
                ) : (
                  shownAvailable.map((b) => (
                    <AvailableRow
                      key={b.blockId}
                      block={b}
                      busy={busy || gate.busy}
                      onInstall={() => void install(b)}
                    />
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <ApprovalGateDialog {...gate.dialogProps} />
    </div>
  );
}
