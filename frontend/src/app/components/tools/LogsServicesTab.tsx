import { useState, useMemo } from "react";
import { Icon } from "@iconify/react";
import { Loader } from "../Loader";
import { EmptyState } from "../EmptyState";
import type { CloudRunService } from "../../../../bindings/alis-hub-v3/models";

interface Props {
  services: CloudRunService[];
  loading: boolean;
  error: string | null;
  selectedService: string;
  onSelectService: (serviceName: string) => void;
  onViewAll: () => void;
}

export function LogsServicesTab({
  services,
  loading,
  error,
  selectedService,
  onSelectService,
  onViewAll,
}: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? services.filter((s) => s.serviceName.toLowerCase().includes(q)) : services;
  }, [services, search]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-[8px] px-[16px] py-[10px] border-b border-border shrink-0">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search services..."
          className="bg-card border border-border rounded-[3px] px-[8px] py-[3px] text-[10px] text-foreground placeholder:text-foreground/30 font-mono outline-none focus:border-brand-fill w-[220px]"
        />
        <div className="flex-1" />
        {!loading && !error && (
          <p className="text-[10px] text-foreground/30 font-mono">
            {filtered.length} of {services.length} services
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* View all logs — always available regardless of search */}
        <button
          onClick={onViewAll}
          className="w-full flex items-center gap-[10px] px-[16px] py-[10px] border-b border-border hover:bg-foreground/[2%] transition-colors text-left"
        >
          <Icon icon="solar:global-linear" className="text-sm text-foreground/40 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-mono text-foreground">View all logs</p>
            <p className="text-[9px] font-mono text-foreground/30">No service filter</p>
          </div>
          <Icon
            icon="solar:alt-arrow-right-linear"
            className="text-xs text-foreground/20 shrink-0"
          />
        </button>

        {loading && (
          <div className="flex items-center justify-center py-[48px]">
            <Loader size={32} />
          </div>
        )}

        {!loading && error && (
          <div className="m-[16px] p-[12px] bg-red-900/20 border border-red-800 rounded-[4px]">
            <p className="text-[10px] text-red-400">{error}</p>
          </div>
        )}

        {!loading && !error && services.length === 0 && (
          <EmptyState
            icon="solar:server-minimalistic-linear"
            title="No Cloud Run services found"
            description="This project has no deployed Cloud Run services"
            action={{ label: "View all logs", onClick: onViewAll }}
          />
        )}

        {!loading && !error && services.length > 0 && filtered.length === 0 && (
          <p className="text-[10px] text-foreground/30 font-mono px-[16px] py-[24px] text-center">
            No services match "{search}"
          </p>
        )}

        {!loading &&
          !error &&
          filtered.map((s) => {
            const isActive = s.serviceName === selectedService;
            return (
              <button
                key={s.name || s.serviceName}
                onClick={() => onSelectService(s.serviceName)}
                className={`w-full flex items-center gap-[10px] px-[16px] py-[10px] border-b border-border hover:bg-foreground/[2%] transition-colors text-left ${
                  isActive ? "bg-brand-fill/12 border-l-2 border-l-brand" : ""
                }`}
              >
                <Icon
                  icon="solar:server-minimalistic-linear"
                  className="text-sm text-foreground/40 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-mono text-foreground truncate">{s.serviceName}</p>
                </div>
                <span className="text-[9px] font-mono text-foreground/40 uppercase shrink-0">
                  {s.region}
                </span>
                <Icon
                  icon="solar:alt-arrow-right-linear"
                  className="text-xs text-foreground/20 shrink-0"
                />
              </button>
            );
          })}
      </div>
    </div>
  );
}
