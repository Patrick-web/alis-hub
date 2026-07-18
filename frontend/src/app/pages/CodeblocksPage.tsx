import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Icon } from "@iconify/react";
import { FilterInput } from "../components/FilterInput";
import { Toolbar } from "../components/Toolbar";
import { EmptyState } from "../components/EmptyState";
import * as ProductService from "../../../bindings/alis-hub-v3/productservice";
import { Loader } from "../components/Loader";

const RELEASE_LEVELS = [
  "All",
  "Stable",
  "Release Candidate",
  "Beta",
  "Alpha",
  "Experimental",
] as const;
type ReleaseFilter = (typeof RELEASE_LEVELS)[number];

const LEVEL_LABEL: Record<number, string> = {
  1: "Experimental",
  2: "Alpha",
  3: "Beta",
  4: "Release Candidate",
  5: "Stable",
};

const LEVEL_COLOR: Record<number, string> = {
  1: "text-red-400 border-red-400/30 bg-red-400/10",
  2: "text-orange-400 border-orange-400/30 bg-orange-400/10",
  3: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
  4: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  5: "text-green-400 border-green-400/30 bg-green-400/10",
};

const DEFAULT_BANNER =
  "https://static.vecteezy.com/system/resources/previews/020/398/136/non_2x/abstract-background-banner-with-dark-red-and-black-gradations-vector.jpg";

interface Codeblock {
  name: string;
  displayName: string;
  releaseLevel: number;
  publisher: string;
  publisherDisplayName: string;
  latestVersion: string;
  headline: string;
  description: string;
  bannerUrl: string;
  installCount: number;
}

function blockId(name: string): string {
  return name.replace("blocks/", "");
}

export function CodeblocksPage({ view = "all" }: { view?: "all" | "mine" }) {
  const navigate = useNavigate();
  const [blocks, setBlocks] = useState<Codeblock[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState("");
  const [activeFilter, setActiveFilter] = useState<ReleaseFilter>("All");

  useEffect(() => {
    setBlocks([]);
    setLoading(true);
    const fetch =
      view === "mine"
        ? (ProductService.ListMyCodeblocks as () => Promise<Codeblock[]>)()
        : (ProductService.ListCodeblocks as () => Promise<Codeblock[]>)();
    fetch
      .then((data) => setBlocks(data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [view]);

  const filtered = blocks.filter((cb) => {
    if (activeFilter !== "All") {
      const level = Object.entries(LEVEL_LABEL).find(([, v]) => v === activeFilter)?.[0];
      if (level && cb.releaseLevel !== Number(level)) return false;
    }
    if (filterText) {
      const q = filterText.toLowerCase();
      return (
        cb.displayName.toLowerCase().includes(q) ||
        cb.headline.toLowerCase().includes(q) ||
        cb.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-background">
      {/* Toolbar */}
      <Toolbar className="justify-between">
        <FilterInput
          placeholder="Search blocks..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          width="w-[300px]"
        />
      </Toolbar>

      {/* Filter tabs */}
      <div className="border-b border-border flex items-center px-[20px] gap-[4px]">
        {RELEASE_LEVELS.map((level) => (
          <button
            key={level}
            onClick={() => setActiveFilter(level)}
            className={`px-[14px] py-[10px] text-[11px] font-bold uppercase transition-all relative ${
              activeFilter === level ? "text-brand" : "text-foreground opacity-40 hover:opacity-70"
            }`}
          >
            {level}
            {activeFilter === level && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-fill" />
            )}
          </button>
        ))}
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-auto p-[20px]">
        {loading ? (
          <div className="flex items-center justify-center h-[200px]">
            <Loader />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="solar:code-square-linear"
            title={
              filterText || activeFilter !== "All"
                ? "No blocks match your filters"
                : "No blocks found"
            }
            className="h-[200px] py-0"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[20px] max-w-[1400px]">
            {filtered.map((cb) => (
              <div
                key={cb.name}
                onClick={() => navigate(`/codeblocks/${blockId(cb.name)}`)}
                className="bg-card border border-border rounded-[4px] cursor-pointer hover:border-brand-fill transition-all group overflow-hidden"
              >
                {/* Banner */}
                <div className="h-[140px] overflow-hidden relative">
                  <img
                    src={cb.bannerUrl || DEFAULT_BANNER}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = DEFAULT_BANNER;
                    }}
                  />
                  <div className="absolute top-[10px] right-[10px]">
                    <Icon
                      icon="solar:info-circle-linear"
                      className="text-foreground opacity-70 text-base"
                    />
                  </div>
                </div>

                {/* Card body */}
                <div className="p-[16px]">
                  <div className="flex items-start justify-between mb-[8px]">
                    <h3 className="font-mono font-bold text-[13px] text-foreground uppercase tracking-wider leading-[1.2] flex-1 pr-2">
                      {cb.displayName}
                    </h3>
                    {cb.releaseLevel > 0 && (
                      <span
                        className={`text-[8px] font-bold uppercase border rounded px-[6px] py-[2px] shrink-0 ${LEVEL_COLOR[cb.releaseLevel] ?? "text-foreground/50 border-foreground/10 bg-foreground/5"}`}
                      >
                        {LEVEL_LABEL[cb.releaseLevel] ?? "Unknown"}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-foreground/60 mb-[12px] leading-[1.4] h-[34px] overflow-hidden">
                    {cb.headline || cb.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-foreground/40 font-mono truncate">
                      {cb.publisherDisplayName || cb.publisher || "Alis Exchange"}
                    </p>
                    <div className="flex items-center gap-[5px]">
                      <Icon
                        icon="solar:download-linear"
                        className="text-foreground opacity-40 text-xs"
                      />
                      <p className="text-[10px] text-foreground/60 font-bold">{cb.installCount}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
