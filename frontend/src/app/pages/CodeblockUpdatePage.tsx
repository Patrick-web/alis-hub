import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { Icon } from "@iconify/react";
import { Button } from "../components/Button";
import { Loader } from "../components/Loader";
import { FilterSelect } from "../components/FilterSelect";
import { SearchableSelect } from "../components/ui/searchable-select";
import * as ProductService from "../../../bindings/alis-hub-v3/productservice";
import * as models from "../../../bindings/alis-hub-v3/models";
import { extToLang } from "../components/CodeFileViewerModal";
import { DiffFile, DiffModeEnum, DiffView } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view-pure.css";

interface InstallOrg {
  name: string;
  displayName: string;
}
interface InstallProduct {
  name: string;
  displayName: string;
}
interface InstallNeuron {
  name: string;
  displayName: string;
  package: string;
}

type Step = "source" | "review" | "publish";
type FileStatus = "added" | "modified" | "removed" | "unchanged";
type Category = "build" | "infra" | "proto";

interface DiffEntry {
  category: Category;
  path: string;
  status: FileStatus;
  oldContent: string;
  newContent: string;
}

const CATEGORY_LABEL: Record<Category, string> = { build: "Build", infra: "Infra", proto: "Proto" };

const RELEASE_LEVELS = [
  { label: "EXPERIMENTAL", value: 3 },
  { label: "ALPHA", value: 6 },
  { label: "BETA", value: 9 },
  { label: "RC", value: 12 },
  { label: "GA", value: 99 },
];

const STATUS_LABEL: Record<FileStatus, string> = {
  added: "Added",
  modified: "Modified",
  removed: "Removed",
  unchanged: "Unchanged",
};
const STATUS_COLOR: Record<FileStatus, string> = {
  added: "text-green-400 bg-green-400/10",
  modified: "text-yellow-400 bg-yellow-400/10",
  removed: "text-red-400 bg-red-400/10",
  unchanged: "text-foreground/30 bg-foreground/5",
};

const labelClass = "text-[10px] font-bold uppercase text-foreground/40 mb-[4px]";
const textareaClass =
  "bg-background border border-border rounded-[4px] p-[10px] text-foreground text-[12px] font-mono outline-none focus:border-brand-fill resize-none w-full transition-colors";

function buildDiff(
  baseline: models.CodeblockFolder[],
  newContent: models.NeuronFileContents,
): DiffEntry[] {
  const oldByCategory: Record<Category, Map<string, string>> = {
    build: new Map(),
    infra: new Map(),
    proto: new Map(),
  };
  for (const folder of baseline) {
    const key = folder.name.toLowerCase() as Category;
    if (key in oldByCategory) {
      for (const f of folder.files) oldByCategory[key].set(f.name, f.content);
    }
  }
  const newByCategory: Record<Category, Map<string, string>> = {
    build: new Map((newContent.buildFiles ?? []).map((f) => [f.name, f.content])),
    infra: new Map((newContent.infraFiles ?? []).map((f) => [f.name, f.content])),
    proto: new Map((newContent.protoFiles ?? []).map((f) => [f.name, f.content])),
  };

  const entries: DiffEntry[] = [];
  (["build", "infra", "proto"] as const).forEach((category) => {
    const oldMap = oldByCategory[category];
    const newMap = newByCategory[category];
    const allPaths = new Set([...oldMap.keys(), ...newMap.keys()]);
    for (const path of allPaths) {
      const oldContent = oldMap.get(path);
      const newContentForPath = newMap.get(path);
      let status: FileStatus;
      if (oldContent === undefined) status = "added";
      else if (newContentForPath === undefined) status = "removed";
      else if (oldContent !== newContentForPath) status = "modified";
      else status = "unchanged";
      entries.push({
        category,
        path,
        status,
        oldContent: oldContent ?? "",
        newContent: newContentForPath ?? "",
      });
    }
  });
  return entries;
}

export function CodeblockUpdatePage() {
  const navigate = useNavigate();
  const { id: blockId } = useParams<{ id: string }>();

  const [step, setStep] = useState<Step>("source");

  // Step 1: source picker
  const [orgs, setOrgs] = useState<InstallOrg[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [orgsError, setOrgsError] = useState<string | null>(null);
  const [orgsLoadAttempt, setOrgsLoadAttempt] = useState(0);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [products, setProducts] = useState<InstallProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [neurons, setNeurons] = useState<InstallNeuron[]>([]);
  const [neuronsLoading, setNeuronsLoading] = useState(false);
  const [selectedNeuron, setSelectedNeuron] = useState<InstallNeuron | null>(null);
  const [scannedFiles, setScannedFiles] = useState<models.ScannedNeuronFile[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Step 2: review/diff
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [hasBaseline, setHasBaseline] = useState(false);
  const [diffEntries, setDiffEntries] = useState<DiffEntry[]>([]);
  const [fileContents, setFileContents] = useState<models.NeuronFileContents | null>(null);
  const [openDiffEntry, setOpenDiffEntry] = useState<DiffEntry | null>(null);

  // Step 3: publish
  const [versionTag, setVersionTag] = useState("");
  const [releaseLevel, setReleaseLevel] = useState(3);
  const [releaseNotes, setReleaseNotes] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    if (orgs.length > 0) return;
    setOrgsLoading(true);
    setOrgsError(null);
    (ProductService.ListInstallOrgs as () => Promise<InstallOrg[]>)()
      .then((list) => setOrgs(list ?? []))
      .catch((e) => setOrgsError(String(e)))
      .finally(() => setOrgsLoading(false));
  }, [orgsLoadAttempt]);

  useEffect(() => {
    if (!selectedOrg) return;
    setSelectedProduct("");
    setSelectedNeuron(null);
    setNeurons([]);
    setScannedFiles([]);
    setScanError(null);
    setProductsLoading(true);
    const orgId = selectedOrg.replace("organisations/", "");
    (ProductService.ListProducts as (org: string) => Promise<InstallProduct[]>)(orgId)
      .then((list) => setProducts(list ?? []))
      .catch((e) => setScanError(String(e)))
      .finally(() => setProductsLoading(false));
  }, [selectedOrg]);

  useEffect(() => {
    if (!selectedOrg || !selectedProduct) return;
    setSelectedNeuron(null);
    setScannedFiles([]);
    setScanError(null);
    setNeuronsLoading(true);
    const orgId = selectedOrg.replace("organisations/", "");
    const productId = selectedProduct.replace(/.*\/products\//, "");
    (
      ProductService.ListInstallNeurons as (
        org: string,
        product: string,
      ) => Promise<InstallNeuron[]>
    )(orgId, productId)
      .then((list) => setNeurons(list ?? []))
      .catch((e) => setScanError(String(e)))
      .finally(() => setNeuronsLoading(false));
  }, [selectedOrg, selectedProduct]);

  useEffect(() => {
    if (!selectedNeuron) return;
    setScanLoading(true);
    setScanError(null);
    setScannedFiles([]);
    (ProductService.ScanNeuronFiles as (pkg: string) => Promise<models.NeuronScanResult | null>)(
      selectedNeuron.package,
    )
      .then((result) => {
        if (!result) return;
        if (result.error) setScanError(result.error);
        else setScannedFiles(result.files ?? []);
      })
      .catch((e) => setScanError(String(e)))
      .finally(() => setScanLoading(false));
  }, [selectedNeuron]);

  // Fetch baseline + new content when entering the review step
  useEffect(() => {
    if (step !== "review" || !blockId || !selectedNeuron) return;
    setReviewLoading(true);
    setReviewError(null);
    Promise.all([
      (ProductService.ListCodeblockVersions as (id: string) => Promise<models.CodeblockVersion[]>)(
        blockId,
      ).catch(() => [] as models.CodeblockVersion[]),
      (
        ProductService.ReadNeuronFileContents as (
          pkg: string,
          files: models.ScannedNeuronFile[],
        ) => Promise<models.NeuronFileContents | null>
      )(selectedNeuron.package, scannedFiles),
    ])
      .then(([versions, contents]) => {
        const latest = versions[0];
        const baseline = latest?.files ?? [];
        const contentResult = contents ?? new models.NeuronFileContents();
        setFileContents(contentResult);
        if (baseline.length > 0) {
          setHasBaseline(true);
          setDiffEntries(buildDiff(baseline, contentResult));
        } else {
          setHasBaseline(false);
          setDiffEntries([]);
        }
      })
      .catch((e) => setReviewError(String(e)))
      .finally(() => setReviewLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, blockId]);

  async function handlePublish() {
    if (!blockId || !fileContents) return;
    setPublishError(null);
    setPublishing(true);
    try {
      const params = models.ContributeBlockParams.createFrom({
        blockId,
        versionTag,
        releaseNotes,
        releaseLevel,
        buildFiles: fileContents.buildFiles ?? [],
        infraFiles: fileContents.infraFiles ?? [],
        protoFiles: fileContents.protoFiles ?? [],
      });
      await (ProductService.ContributeBlock as (p: typeof params) => Promise<string>)(params);
      navigate(`/codeblocks/${blockId}/versions`);
    } catch (e) {
      setPublishError(String(e));
    } finally {
      setPublishing(false);
    }
  }

  const selectedFileCount = scannedFiles.filter((f) => f.selected).length;
  const canReview = !!selectedNeuron && !scanLoading && selectedFileCount > 0;
  const statusCounts = useMemo(() => {
    const counts: Record<FileStatus, number> = { added: 0, modified: 0, removed: 0, unchanged: 0 };
    for (const e of diffEntries) counts[e.status]++;
    return counts;
  }, [diffEntries]);

  return (
    <div className="flex-1 overflow-hidden flex flex-row bg-background">
      {/* Sidebar */}
      <div className="w-[280px] shrink-0 flex flex-col border-r border-border">
        <button
          onClick={() => navigate(`/codeblocks/${blockId}/versions`)}
          className="flex items-center gap-[8px] px-[16px] py-[12px] text-[11px] text-foreground/50 hover:text-foreground/80 border-b border-border transition-colors"
        >
          <Icon icon="solar:arrow-left-linear" />
          Versions
        </button>

        <div className="flex-1 overflow-auto p-[16px] flex flex-col gap-[20px]">
          <div>
            <p className="text-[11px] font-bold text-foreground mb-[12px]">Update Block</p>
            <div className="flex flex-col gap-[8px]">
              <StepIndicator
                index={1}
                label="Pick Source"
                active={step === "source"}
                done={step === "review" || step === "publish"}
              />
              <StepIndicator
                index={2}
                label="Review Changes"
                active={step === "review"}
                done={step === "publish"}
              />
              <StepIndicator
                index={3}
                label="Publish Version"
                active={step === "publish"}
                done={false}
              />
            </div>
          </div>

          {selectedNeuron && (
            <div className="bg-card border border-border rounded-[4px] p-[12px]">
              <p className={labelClass}>Source</p>
              <p className="text-[10px] text-foreground/60 font-mono break-all">
                {selectedNeuron.package}
              </p>
              <p className="text-[10px] text-foreground/30 mt-[4px]">
                {selectedFileCount} file(s) selected
              </p>
            </div>
          )}

          {step !== "source" && (
            <div className="bg-card border border-border rounded-[4px] p-[12px]">
              <p className={labelClass}>Baseline</p>
              <p className="text-[10px] text-foreground/60">
                {reviewLoading
                  ? "Checking…"
                  : hasBaseline
                    ? "Previous version content available — diff shown"
                    : "No previous content on record — full replace"}
              </p>
            </div>
          )}
        </div>

        {step === "publish" && (
          <div className="p-[10px] border-t border-border flex flex-col gap-[8px]">
            <div className="mb-[4px]">
              <p className={labelClass}>Version Tag</p>
              <input
                className="bg-background border border-border rounded-[4px] px-[10px] py-[6px] text-foreground text-[12px] font-mono outline-none focus:border-brand-fill w-full transition-colors"
                placeholder="e.g. v1.2.0-beta1"
                value={versionTag}
                onChange={(e) => setVersionTag(e.target.value)}
              />
            </div>
            <div className="mb-[4px]">
              <p className={labelClass}>Release Level</p>
              <SearchableSelect
                value={String(releaseLevel)}
                options={RELEASE_LEVELS.map((l) => ({ label: l.label, value: String(l.value) }))}
                onChange={(v) => setReleaseLevel(Number(v))}
                className="w-full"
              />
            </div>
            <div className="mb-[8px]">
              <p className={labelClass}>Release Notes</p>
              <textarea
                className={`${textareaClass} h-[80px]`}
                placeholder="Describe what changed in this version"
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
              />
            </div>
            {publishError && (
              <div className="text-[11px] text-destructive bg-[rgba(255,107,107,0.08)] border border-[rgba(255,107,107,0.2)] rounded-[4px] p-[10px]">
                {publishError}
              </div>
            )}
            <Button
              variant="primary"
              className="w-full"
              icon={
                <Icon
                  icon={publishing ? "solar:spinner-linear" : "solar:upload-linear"}
                  className={publishing ? "animate-spin" : ""}
                />
              }
              onClick={handlePublish}
              disabled={publishing}
            >
              {publishing ? "Publishing…" : "Publish Version"}
            </Button>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {step === "source" && (
          <SourceStep
            orgs={orgs}
            orgsLoading={orgsLoading}
            orgsError={orgsError}
            onRetryOrgs={() => setOrgsLoadAttempt((n) => n + 1)}
            products={products}
            productsLoading={productsLoading}
            neurons={neurons}
            neuronsLoading={neuronsLoading}
            selectedOrg={selectedOrg}
            setSelectedOrg={setSelectedOrg}
            selectedProduct={selectedProduct}
            setSelectedProduct={setSelectedProduct}
            selectedNeuron={selectedNeuron}
            setSelectedNeuron={setSelectedNeuron}
            scannedFiles={scannedFiles}
            setScannedFiles={setScannedFiles}
            scanLoading={scanLoading}
            scanError={scanError}
            canReview={canReview}
            onReview={() => setStep("review")}
          />
        )}
        {step === "review" && (
          <ReviewStep
            loading={reviewLoading}
            error={reviewError}
            hasBaseline={hasBaseline}
            diffEntries={diffEntries}
            statusCounts={statusCounts}
            scannedFiles={scannedFiles}
            onOpenDiff={setOpenDiffEntry}
            onContinue={() => setStep("publish")}
          />
        )}
        {step === "publish" && (
          <div className="flex-1 overflow-auto p-[24px]">
            <p className="text-[13px] font-bold text-foreground mb-[4px]">Ready to Publish</p>
            <p className="text-[11px] text-foreground/40 mb-[20px]">
              {hasBaseline
                ? `${statusCounts.added} added · ${statusCounts.modified} modified · ${statusCounts.removed} removed · ${statusCounts.unchanged} unchanged`
                : `${selectedFileCount} file(s) will be published as a full snapshot`}
            </p>
            <p className="text-[11px] text-foreground/40">
              Fill in the release details in the sidebar, then click Publish Version.
            </p>
          </div>
        )}
      </div>

      {openDiffEntry && <DiffModal entry={openDiffEntry} onClose={() => setOpenDiffEntry(null)} />}
    </div>
  );
}

// ── Step Indicator ─────────────────────────────────────────────────────────────

function StepIndicator({
  index,
  label,
  active,
  done,
}: {
  index: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-[10px] ${active ? "opacity-100" : done ? "opacity-60" : "opacity-30"}`}
    >
      <div
        className={`w-[20px] h-[20px] rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
          done
            ? "bg-brand-fill/20 text-brand"
            : active
              ? "bg-brand-fill text-brand-foreground"
              : "bg-foreground/10 text-brand-foreground/40"
        }`}
      >
        {done ? <Icon icon="solar:check-circle-bold" className="text-xs" /> : index}
      </div>
      <span
        className={`text-[11px] ${active ? "text-foreground font-bold" : "text-foreground/60"}`}
      >
        {label}
      </span>
    </div>
  );
}

// ── Step 1: Source Picker ───────────────────────────────────────────────────────

function SourceStep({
  orgs,
  orgsLoading,
  orgsError,
  onRetryOrgs,
  products,
  productsLoading,
  neurons,
  neuronsLoading,
  selectedOrg,
  setSelectedOrg,
  selectedProduct,
  setSelectedProduct,
  selectedNeuron,
  setSelectedNeuron,
  scannedFiles,
  setScannedFiles,
  scanLoading,
  scanError,
  canReview,
  onReview,
}: {
  orgs: InstallOrg[];
  orgsLoading: boolean;
  orgsError: string | null;
  onRetryOrgs: () => void;
  products: InstallProduct[];
  productsLoading: boolean;
  neurons: InstallNeuron[];
  neuronsLoading: boolean;
  selectedOrg: string;
  setSelectedOrg: (v: string) => void;
  selectedProduct: string;
  setSelectedProduct: (v: string) => void;
  selectedNeuron: InstallNeuron | null;
  setSelectedNeuron: (n: InstallNeuron | null) => void;
  scannedFiles: models.ScannedNeuronFile[];
  setScannedFiles: (fn: (prev: models.ScannedNeuronFile[]) => models.ScannedNeuronFile[]) => void;
  scanLoading: boolean;
  scanError: string | null;
  canReview: boolean;
  onReview: () => void;
}) {
  const selectedFileCount = scannedFiles.filter((f) => f.selected).length;

  function toggleFile(idx: number) {
    setScannedFiles((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, selected: !f.selected } : f)),
    );
  }
  function selectAllFiles(selected: boolean) {
    setScannedFiles((prev) => prev.map((f) => ({ ...f, selected })));
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-[24px] py-[16px] border-b border-border flex items-center justify-between">
        <div>
          <p className="text-[13px] font-bold text-foreground">Pick a Source</p>
          <p className="text-[11px] text-foreground/40 mt-[2px]">
            Select the local neuron checkout to publish files from
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Icon icon="solar:alt-arrow-right-linear" />}
          onClick={onReview}
          disabled={!canReview}
        >
          Review Changes
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-[24px] flex flex-col gap-[20px] max-w-[800px]">
        <div className="grid grid-cols-3 gap-[12px]">
          <div>
            <p className={labelClass}>Organisation</p>
            <FilterSelect
              size="sm"
              value={selectedOrg}
              onChange={setSelectedOrg}
              loading={orgsLoading}
              placeholder="Select org…"
              emptyLabel="No organisations"
              options={orgs.map((o) => ({
                value: o.name,
                label: o.displayName || o.name.replace("organisations/", ""),
              }))}
            />
            {orgsError && (
              <button
                onClick={onRetryOrgs}
                className="mt-[4px] text-[10px] text-destructive hover:underline"
              >
                Failed to load — retry
              </button>
            )}
          </div>
          <div>
            <p className={labelClass}>Product</p>
            <FilterSelect
              size="sm"
              value={selectedProduct}
              onChange={setSelectedProduct}
              loading={productsLoading}
              disabled={!selectedOrg}
              placeholder="Select product…"
              emptyLabel="No products"
              options={products.map((p) => ({ value: p.name, label: p.displayName || p.name }))}
            />
          </div>
          <div>
            <p className={labelClass}>Neuron</p>
            <FilterSelect
              size="sm"
              value={selectedNeuron?.name ?? ""}
              onChange={(v) => setSelectedNeuron(neurons.find((n) => n.name === v) ?? null)}
              loading={neuronsLoading}
              disabled={!selectedProduct}
              placeholder="Select neuron…"
              emptyLabel="No neurons"
              options={neurons.map((n) => ({ value: n.name, label: n.displayName }))}
            />
          </div>
        </div>

        {!selectedNeuron ? (
          <p className="text-[12px] text-foreground/40">Select a neuron to scan its local files.</p>
        ) : scanLoading ? (
          <div className="flex items-center gap-[10px] py-[20px]">
            <Loader />
            <span className="text-[12px] text-foreground/40">Scanning neuron files…</span>
          </div>
        ) : scanError ? (
          <div className="text-[12px] text-destructive bg-[rgba(255,107,107,0.06)] border border-[rgba(255,107,107,0.2)] rounded-[4px] p-[12px]">
            {scanError}
          </div>
        ) : scannedFiles.length === 0 ? (
          <p className="text-[12px] text-foreground/40">No files found in this neuron.</p>
        ) : (
          <>
            <div className="flex items-center gap-[12px]">
              <button
                onClick={() => selectAllFiles(true)}
                className="text-[10px] font-bold uppercase text-foreground/50 hover:text-foreground/80 tracking-wider transition-colors"
              >
                Select All
              </button>
              <span className="text-foreground/20">·</span>
              <button
                onClick={() => selectAllFiles(false)}
                className="text-[10px] font-bold uppercase text-foreground/50 hover:text-foreground/80 tracking-wider transition-colors"
              >
                Deselect All
              </button>
              <span className="ml-auto text-[10px] text-foreground/30">
                {selectedFileCount} / {scannedFiles.length} selected
              </span>
            </div>

            {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => {
              const catFiles = scannedFiles
                .map((f, idx) => ({ ...f, idx }))
                .filter((f) => f.category === cat);
              if (catFiles.length === 0) return null;
              return (
                <div key={cat}>
                  <p className="text-[10px] font-bold uppercase text-foreground/40 mb-[8px] tracking-wider">
                    {CATEGORY_LABEL[cat]}
                  </p>
                  <div className="border border-border rounded-[4px] overflow-hidden">
                    {catFiles.map((file, i) => (
                      <label
                        key={file.idx}
                        className={`flex items-center gap-[10px] px-[12px] py-[8px] cursor-pointer hover:bg-foreground/[3%] transition-colors ${i > 0 ? "border-t border-border" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={file.selected}
                          onChange={() => toggleFile(file.idx)}
                          className="accent-brand shrink-0"
                        />
                        <Icon
                          icon="solar:file-code-linear"
                          className="text-foreground/30 shrink-0 text-sm"
                        />
                        <span
                          className={`text-[11px] font-mono truncate ${file.selected ? "text-foreground/80" : "text-foreground/30"}`}
                        >
                          {file.path}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ── Step 2: Review / Diff ───────────────────────────────────────────────────────

function ReviewStep({
  loading,
  error,
  hasBaseline,
  diffEntries,
  statusCounts,
  scannedFiles,
  onOpenDiff,
  onContinue,
}: {
  loading: boolean;
  error: string | null;
  hasBaseline: boolean;
  diffEntries: DiffEntry[];
  statusCounts: Record<FileStatus, number>;
  scannedFiles: models.ScannedNeuronFile[];
  onOpenDiff: (entry: DiffEntry) => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-[24px] py-[16px] border-b border-border flex items-center justify-between">
        <div>
          <p className="text-[13px] font-bold text-foreground">Review Changes</p>
          <p className="text-[11px] text-foreground/40 mt-[2px]">
            {hasBaseline
              ? "Compared against the current published version"
              : "No previous file content on record for this block"}
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Icon icon="solar:alt-arrow-right-linear" />}
          onClick={onContinue}
          disabled={loading}
        >
          Continue to Publish
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-[24px]">
        {loading ? (
          <div className="flex items-center justify-center h-[120px]">
            <Loader />
          </div>
        ) : error ? (
          <div className="text-[12px] text-destructive bg-[rgba(255,107,107,0.06)] border border-[rgba(255,107,107,0.2)] rounded-[4px] p-[12px]">
            {error}
          </div>
        ) : !hasBaseline ? (
          <div className="flex flex-col gap-[16px] max-w-[800px]">
            <div className="text-[12px] text-foreground/60 bg-foreground/[3%] border border-border rounded-[4px] p-[12px]">
              No previous file content on record for this block — this Update will publish a full
              snapshot of the selected files.
            </div>
            {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => {
              const files = scannedFiles.filter((f) => f.selected && f.category === cat);
              if (files.length === 0) return null;
              return (
                <div key={cat}>
                  <p className="text-[10px] font-bold uppercase text-foreground/40 mb-[8px] tracking-wider">
                    {CATEGORY_LABEL[cat]}
                  </p>
                  <div className="border border-border rounded-[4px] overflow-hidden">
                    {files.map((f, i) => (
                      <div
                        key={f.path}
                        className={`px-[12px] py-[8px] text-[11px] font-mono text-foreground/70 ${i > 0 ? "border-t border-border" : ""}`}
                      >
                        {f.path}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-[16px] max-w-[800px]">
            <div className="flex items-center gap-[12px] text-[11px]">
              <span className="text-green-400">{statusCounts.added} added</span>
              <span className="text-yellow-400">{statusCounts.modified} modified</span>
              <span className="text-red-400">{statusCounts.removed} removed</span>
              <span className="text-foreground/30">{statusCounts.unchanged} unchanged</span>
            </div>
            {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => {
              const entries = diffEntries.filter((e) => e.category === cat);
              if (entries.length === 0) return null;
              return (
                <div key={cat}>
                  <p className="text-[10px] font-bold uppercase text-foreground/40 mb-[8px] tracking-wider">
                    {CATEGORY_LABEL[cat]}
                  </p>
                  <div className="border border-border rounded-[4px] overflow-hidden">
                    {entries.map((e, i) => (
                      <button
                        key={e.path}
                        onClick={() => e.status !== "unchanged" && onOpenDiff(e)}
                        disabled={e.status === "unchanged"}
                        className={`w-full flex items-center gap-[10px] px-[12px] py-[8px] text-left transition-colors ${i > 0 ? "border-t border-border" : ""} ${e.status === "unchanged" ? "cursor-default" : "hover:bg-foreground/[3%] cursor-pointer"}`}
                      >
                        <span
                          className={`text-[9px] font-bold uppercase rounded px-[6px] py-[2px] shrink-0 ${STATUS_COLOR[e.status]}`}
                        >
                          {STATUS_LABEL[e.status]}
                        </span>
                        <span className="text-[11px] font-mono truncate text-foreground/70">
                          {e.path}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Diff Modal ───────────────────────────────────────────────────────────────

function DiffModal({ entry, onClose }: { entry: DiffEntry; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const diffFile = useMemo(() => {
    const lang = extToLang(entry.path);
    const file = DiffFile.createInstance({
      oldFile: { fileName: entry.path, fileLang: lang, content: entry.oldContent },
      newFile: { fileName: entry.path, fileLang: lang, content: entry.newContent },
    });
    file.init();
    file.buildUnifiedDiffLines();
    return file;
  }, [entry]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-muted/95 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between px-[20px] py-[12px] border-b border-border shrink-0">
        <div className="flex items-center gap-[10px]">
          <Icon icon="solar:file-code-linear" className="text-foreground/50 text-base" />
          <span className="font-mono text-[13px] text-foreground">{entry.path}</span>
          <span
            className={`text-[9px] font-bold uppercase rounded px-[6px] py-[2px] ${STATUS_COLOR[entry.status]}`}
          >
            {STATUS_LABEL[entry.status]}
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-[6px] text-[11px] text-foreground/50 hover:text-foreground/80 transition-colors border border-foreground/15 hover:border-foreground/30 rounded px-[10px] py-[4px]"
        >
          <Icon icon="solar:close-circle-linear" className="text-xs" />
          Close
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <DiffView
          diffFile={diffFile}
          diffViewTheme="dark"
          diffViewMode={DiffModeEnum.Unified}
          diffViewHighlight
          diffViewFontSize={11}
        />
      </div>
    </div>
  );
}
