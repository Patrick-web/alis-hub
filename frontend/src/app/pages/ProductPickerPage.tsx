import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { Events } from "@wailsio/runtime";
import { useNavigate } from "react-router";
import { useWorkspace } from "../stores/workspace";
import { useLabs } from "../stores/labs";
import { getDefaultRoute } from "../stores/tabSettings";
import * as ProductService from "../../../bindings/alis-hub-v3/productservice";
import type { SyncReposResult } from "../../../bindings/alis-hub-v3/models";
import { Loader } from "../components/Loader";
import { BuildTerminal, type BuildTerminalHandle } from "../components/BuildTerminal";

function isAuthError(e: unknown): boolean {
  const s = String(e);
  return (
    s.includes("invalid_grant") ||
    s.includes("refresh token has expired") ||
    s.includes("console token expired")
  );
}

type ProductSummary = {
  name: string;
  displayName: string;
  state: number;
};

function StateIndicator({ state }: { state: number }) {
  if (state === 1) {
    return (
      <span className="flex items-center gap-[4px]">
        <span className="size-[6px] rounded-full bg-success shrink-0" />
        <span className="text-[10px] font-mono text-success">Active</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-[4px]">
      <span className="size-[6px] rounded-full bg-foreground/30 shrink-0" />
      <span className="text-[10px] font-mono text-foreground/30">Inactive</span>
    </span>
  );
}

export function ProductPickerPage() {
  const { state, setProduct, setPhase } = useWorkspace();
  const labsState = useLabs((s) => s.state);
  const navigate = useNavigate();
  const org = state.selectedOrg!;
  const orgId = org.name.replace("organisations/", "");

  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [cloneStatus, setCloneStatus] = useState<Record<string, boolean>>({});
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingProduct, setPendingProduct] = useState<ProductSummary | null>(null);

  const termRef = useRef<BuildTerminalHandle>(null);

  useEffect(() => {
    const off = Events.On("sync:log", (ev: any) => {
      termRef.current?.write(String(ev.data ?? ""));
    });
    return () => off();
  }, []);

  const load = () => {
    setLoading(true);
    setError(null);
    (ProductService.ListProducts as (org: string) => Promise<ProductSummary[]>)(orgId)
      .then((result) => setProducts(result ?? []))
      .catch((e: unknown) => {
        if (isAuthError(e)) {
          setPhase("login");
          return;
        }
        setError(String(e));
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [orgId]);

  useEffect(() => {
    if (!products.length) return;
    setCloneStatus({});
    products.forEach((p) => {
      const productId = p.name.split("/products/")[1] ?? p.name;
      (
        ProductService.CheckProductCloneStatus as (org: string, product: string) => Promise<boolean>
      )(orgId, productId).then((ok) => setCloneStatus((prev) => ({ ...prev, [p.name]: ok })));
    });
  }, [products]);

  const filtered = products.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.displayName.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
  });

  const handleCardClick = (p: ProductSummary) => {
    if (syncState === "syncing") return;
    if (cloneStatus[p.name]) {
      const productId = p.name.split("/products/")[1] ?? p.name;
      setProduct(orgId, org.displayName, productId, p.displayName);
      navigate(getDefaultRoute(labsState.workflowsEnabled));
      return;
    }
    setExpandedProduct((prev) => (prev === p.name ? null : p.name));
    if (expandedProduct !== p.name) {
      setSyncState("idle");
      setSyncError(null);
    }
  };

  const handleClone = async (p: ProductSummary) => {
    const productId = p.name.split("/products/")[1] ?? p.name;
    setSyncState("syncing");
    setSyncError(null);
    setPendingProduct(p);
    termRef.current?.clear();
    try {
      const result = await (
        ProductService.SyncRepos as (
          org: string,
          product: string,
        ) => Promise<SyncReposResult | null>
      )(orgId, productId);
      if (result?.error) {
        setSyncState("error");
        setSyncError(result.error);
        return;
      }
    } catch (e) {
      setSyncState("error");
      setSyncError(String(e));
      return;
    }
    setSyncState("done");
    setProduct(orgId, org.displayName, productId, p.displayName);
    navigate(getDefaultRoute(labsState.workflowsEnabled));
  };

  const handleOpenWithoutClone = (p: ProductSummary) => {
    const productId = p.name.split("/products/")[1] ?? p.name;
    setExpandedProduct(null);
    setSyncState("idle");
    setSyncError(null);
    setProduct(orgId, org.displayName, productId, p.displayName);
    navigate(getDefaultRoute(labsState.workflowsEnabled));
  };

  const handleCancelExpand = () => {
    setExpandedProduct(null);
    setSyncState("idle");
    setSyncError(null);
    setPendingProduct(null);
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-background">
      {/* Back + header */}
      <div className="px-[24px] pt-[24px] pb-[16px] shrink-0">
        <button
          onClick={() => setPhase("picking-org")}
          className="flex items-center gap-[6px] text-foreground/40 hover:text-foreground transition-colors mb-[16px] text-[11px]"
        >
          <Icon icon="solar:alt-arrow-left-linear" className="text-sm" />
          All landing zones
        </button>

        <div className="flex items-center gap-[12px]">
          {org.logo ? (
            <img
              src={org.logo}
              alt={org.displayName}
              className="size-[40px] rounded-[10px] object-cover shrink-0 border border-foreground/8"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="size-[40px] rounded-[10px] bg-brand-fill/12 border border-brand-fill/20 flex items-center justify-center shrink-0">
              <span className="text-[16px] font-bold text-brand">
                {org.displayName[0]?.toUpperCase() ?? "?"}
              </span>
            </div>
          )}
          <div>
            <h1 className="text-[20px] font-bold text-foreground">{org.displayName}</h1>
            <p className="text-[11px] font-mono text-foreground/30">{orgId}</p>
          </div>
        </div>

        <p className="text-[12px] text-foreground/40 mt-[12px]">
          Select a product to open its workspace
        </p>
      </div>

      {/* Search */}
      <div className="px-[24px] pb-[14px] shrink-0 flex items-center gap-[10px]">
        <div className="flex-1 flex items-center gap-[8px] bg-card border border-border rounded-[8px] px-[12px] h-[34px]">
          <Icon icon="solar:magnifer-linear" className="text-foreground/30 text-sm shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="flex-1 bg-transparent text-[12px] text-foreground outline-none placeholder:text-foreground/25"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-foreground/30 hover:text-foreground"
            >
              <Icon icon="solar:close-circle-linear" className="text-sm" />
            </button>
          )}
        </div>
        {!loading && (
          <button
            onClick={load}
            className="text-foreground/40 hover:text-foreground transition-colors"
            title="Refresh"
          >
            <Icon icon="solar:refresh-linear" className="text-base" />
          </button>
        )}
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-auto px-[24px] pb-[24px]">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="p-[16px] bg-[rgba(255,92,95,0.1)] border border-[rgba(255,92,95,0.3)] rounded-[8px] max-w-[400px]">
              <div className="flex items-center gap-[8px] mb-[8px]">
                <Icon icon="solar:close-circle-linear" className="text-destructive text-lg" />
                <p className="text-[12px] font-bold text-foreground">Failed to load</p>
              </div>
              <p className="text-[11px] text-foreground/60">{error}</p>
              <button onClick={load} className="mt-[10px] text-[10px] text-brand hover:underline">
                Try again
              </button>
            </div>
          </div>
        )}

        {!loading && !error && (
          <div className="flex flex-col gap-[4px]">
            {filtered.map((p) => {
              const productId = p.name.split("/products/")[1] ?? p.name;
              const isCloned = cloneStatus[p.name] === true;
              const isExpanded = expandedProduct === p.name;
              const isSyncing = syncState === "syncing" && pendingProduct?.name === p.name;
              const isDisabled = syncState === "syncing" && !isSyncing;

              return (
                <div
                  key={p.name}
                  className={`rounded-[8px] border transition-colors overflow-hidden ${
                    isExpanded ? "border-brand-fill" : "border-border"
                  }`}
                >
                  {/* Card header row */}
                  <button
                    onClick={() => handleCardClick(p)}
                    disabled={isDisabled}
                    className={`w-full flex items-center gap-[14px] px-[14px] py-[12px] bg-card text-left group transition-colors
                      ${isDisabled ? "opacity-60 cursor-not-allowed" : "hover:bg-muted"}
                    `}
                  >
                    <div className="size-[32px] rounded-[7px] bg-brand-fill/8 border border-brand-fill/15 flex items-center justify-center shrink-0">
                      <Icon icon="solar:box-linear" className="text-brand text-base" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-[13px] font-semibold transition-colors truncate ${isExpanded ? "text-brand" : "text-foreground group-hover:text-brand"}`}
                      >
                        {p.displayName}
                      </p>
                      <p className="text-[10px] font-mono text-foreground/30 mt-[1px]">
                        {isSyncing ? "Syncing repositories…" : productId}
                      </p>
                    </div>
                    <div className="flex items-center gap-[8px] shrink-0">
                      {isCloned && (
                        <span className="flex items-center gap-[3px] px-[6px] py-[2px] rounded-[4px] bg-[rgba(52,199,89,0.1)] border border-[rgba(52,199,89,0.25)]">
                          <Icon
                            icon="solar:check-circle-bold"
                            className="text-success text-[9px]"
                          />
                          <span className="text-[9px] font-mono text-success font-medium">
                            Cloned
                          </span>
                        </span>
                      )}
                      <StateIndicator state={p.state} />
                      {isSyncing ? (
                        <Loader size={16} />
                      ) : isCloned ? (
                        <Icon
                          icon="solar:alt-arrow-right-linear"
                          className="text-foreground/20 group-hover:text-brand text-base transition-colors"
                        />
                      ) : (
                        <Icon
                          icon={
                            isExpanded ? "solar:alt-arrow-up-linear" : "solar:alt-arrow-down-linear"
                          }
                          className={`text-base transition-colors ${isExpanded ? "text-brand" : "text-foreground/20 group-hover:text-brand"}`}
                        />
                      )}
                    </div>
                  </button>

                  {/* Expanded section */}
                  {isExpanded && (
                    <div className="border-t border-border bg-muted">
                      {syncState === "idle" && (
                        <div className="px-[16px] py-[14px] flex items-center justify-between gap-[12px]">
                          <p className="text-[12px] text-foreground/50">
                            Clone repositories to your local machine?
                          </p>
                          <div className="flex items-center gap-[8px] shrink-0">
                            <button
                              onClick={() => handleOpenWithoutClone(p)}
                              className="text-[11px] text-foreground/40 hover:text-foreground transition-colors"
                            >
                              Open without cloning
                            </button>
                            <button
                              onClick={() => handleClone(p)}
                              className="px-[10px] py-[5px] rounded-[5px] bg-brand-fill text-[11px] font-semibold text-brand-foreground hover:bg-[#f96bb0] transition-colors"
                            >
                              Clone &amp; open
                            </button>
                          </div>
                        </div>
                      )}

                      {syncState === "syncing" && isSyncing && (
                        <div className="flex flex-col">
                          <div className="flex items-center gap-[8px] px-[14px] py-[10px] border-b border-border">
                            <span className="w-[6px] h-[6px] rounded-full bg-brand-fill animate-pulse shrink-0" />
                            <p className="text-[9px] font-bold text-foreground/40 uppercase font-mono tracking-wider">
                              Syncing repos…
                            </p>
                          </div>
                          <BuildTerminal ref={termRef} className="h-[200px]" />
                        </div>
                      )}

                      {syncState === "error" && pendingProduct?.name === p.name && (
                        <div className="px-[16px] py-[14px]">
                          <p className="text-[11px] text-foreground/60 mb-[10px]">
                            Failed to sync: {syncError}
                          </p>
                          <div className="flex items-center gap-[10px]">
                            <button
                              onClick={() => {
                                setSyncState("idle");
                                setSyncError(null);
                              }}
                              className="text-[11px] text-brand hover:underline"
                            >
                              Try again
                            </button>
                            <button
                              onClick={() => handleOpenWithoutClone(p)}
                              className="text-[11px] text-foreground/40 hover:text-foreground transition-colors"
                            >
                              Open without cloning
                            </button>
                            <button
                              onClick={handleCancelExpand}
                              className="text-[11px] text-foreground/25 hover:text-foreground transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {filtered.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center pt-[60px] gap-[8px]">
                <Icon icon="solar:box-linear" className="text-foreground/15 text-4xl" />
                <p className="text-[12px] text-foreground/30">
                  {search ? "No matching products" : "No products found"}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
