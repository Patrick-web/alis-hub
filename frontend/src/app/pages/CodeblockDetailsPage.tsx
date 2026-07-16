import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { Icon } from "@iconify/react";
import { marked } from "marked";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
});
import * as ProductService from "../../../bindings/alis-hub-v3/productservice";
import * as GitService from "../../../bindings/alis-hub-v3/gitservice";
import { Loader } from "../components/Loader";
import { EmptyState } from "../components/EmptyState";
import { Button } from "../components/Button";
import { FilterSelect } from "../components/FilterSelect";
import { SearchableSelect } from "../components/ui/searchable-select";
import { FileViewerModal } from "../components/CodeFileViewerModal";

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

const STATE_LABEL: Record<number, string> = {
  1: "Pending",
  2: "Deploying",
  3: "Active",
  4: "Error",
};
const STATE_COLOR: Record<number, string> = {
  1: "text-yellow-400 bg-yellow-400/10",
  2: "text-blue-400 bg-blue-400/10",
  3: "text-green-400 bg-green-400/10",
  4: "text-red-400 bg-red-400/10",
};

interface Codeblock {
  name: string;
  displayName: string;
  releaseLevel: number;
  publisher: string;
  latestVersion: string;
  headline: string;
  description: string;
  bannerUrl: string;
  installCount: number;
}

interface CodeblockVersion {
  name: string;
  versionTag: string;
  releaseLevel: number;
  createTime: string;
  updateTime: string;
  releaseNotes: string;
  files: Array<{
    name: string;
    files: Array<{ name: string; content: string }>;
  }>;
}

interface CodeblockInstance {
  name: string;
  shortId: string;
  package: string;
  state: number;
  block: string;
  blockVersion: string;
  createTime: string;
  updateTime: string;
  entitlement: string;
}

interface CodeblockMember {
  name: string;
  displayName: string;
  photoUrl: string;
}

interface BlockAccessMember {
  member: string;
  displayName: string;
  email: string;
  photoUrl: string;
  role: string;
  roleLabel: string;
}

interface BlockAccessData {
  members: BlockAccessMember[];
}

// ── Install wizard types ──────────────────────────────────────────────────────

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
interface BlockPlan {
  name: string;
  displayName: string;
}

const TABS = [
  "documentation",
  "versions",
  "instances",
  "help",
  "settings",
  "access",
] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  documentation: "Documentation",
  versions: "Versions",
  instances: "Instances",
  help: "Help",
  settings: "Settings",
  access: "Access",
};

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function shortBlockId(blockVersion: string): string {
  const parts = blockVersion.split("/");
  return parts[parts.length - 1] || blockVersion;
}

export function CodeblockDetailsPage() {
  const { id, tab } = useParams<{ id: string; tab?: string }>();
  const navigate = useNavigate();
  const activeTab: Tab = (
    TABS.includes(tab as Tab) ? tab : "documentation"
  ) as Tab;

  const [block, setBlock] = useState<Codeblock | null>(null);
  const [members, setMembers] = useState<CodeblockMember[]>([]);
  const [blockLoading, setBlockLoading] = useState(true);
  const [myAccountID, setMyAccountID] = useState("");

  const [versions, setVersions] = useState<CodeblockVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsLoaded, setVersionsLoaded] = useState(false);
  const [selectedVersion, setSelectedVersion] =
    useState<CodeblockVersion | null>(null);

  const [doc, setDoc] = useState("");
  const [agentDoc, setAgentDoc] = useState("");
  const [docAudience, setDocAudience] = useState<"user" | "agent">("user");
  const [docLoading, setDocLoading] = useState(
    () => activeTab === "documentation",
  );

  const [instances, setInstances] = useState<CodeblockInstance[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const [instancesLoaded, setInstancesLoaded] = useState(false);

  const [plans, setPlans] = useState<BlockPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);

  const [accessData, setAccessData] = useState<BlockAccessData | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const blockId = id ?? "";

  // Install Block wizard state
  const [installOpen, setInstallOpen] = useState(false);

  const go = useCallback(
    (t: Tab) => navigate(`/codeblocks/${blockId}/${t}`),
    [blockId, navigate],
  );

  // Load block metadata + members + caller account on mount
  useEffect(() => {
    if (!blockId) return;
    setBlockLoading(true);
    Promise.all([
      (ProductService.GetCodeblock as (id: string) => Promise<Codeblock>)(
        blockId,
      ),
      (
        ProductService.GetCodeblockMembers as (
          id: string,
        ) => Promise<CodeblockMember[]>
      )(blockId).catch(() => [] as CodeblockMember[]),
      (ProductService.GetMyPrimaryAccountID as () => Promise<string>)().catch(
        () => "",
      ),
    ])
      .then(([b, m, accountID]) => {
        setBlock(b);
        setMembers(m ?? []);
        setMyAccountID(accountID ?? "");
      })
      .catch(console.error)
      .finally(() => setBlockLoading(false));
  }, [blockId]);

  // Lazy load versions (also needed for settings tab counts)
  useEffect(() => {
    if (
      (activeTab !== "versions" && activeTab !== "settings") ||
      versions.length > 0
    )
      return;
    setVersionsLoading(true);
    (
      ProductService.ListCodeblockVersions as (
        id: string,
      ) => Promise<CodeblockVersion[]>
    )(blockId)
      .then((v) => {
        const list = v ?? [];
        setVersions(list);
        if (list.length > 0) setSelectedVersion(list[0]);
      })
      .catch(console.error)
      .finally(() => {
        setVersionsLoading(false);
        setVersionsLoaded(true);
      });
  }, [activeTab, blockId, versions.length]);

  // Lazy load documentation
  useEffect(() => {
    if (activeTab !== "documentation" || doc !== "") return;
    setDocLoading(true);
    // Get versions first to find the latest version name
    (
      ProductService.ListCodeblockVersions as (
        id: string,
      ) => Promise<CodeblockVersion[]>
    )(blockId)
      .then((vList) => {
        const list = vList ?? [];
        if (!selectedVersion && list.length > 0) setSelectedVersion(list[0]);
        const versionName = list[0]?.name;
        if (!versionName) return;
        return Promise.all([
          (
            ProductService.GetCodeblockDoc as (
              v: string,
              a: string,
            ) => Promise<string>
          )(versionName, "user"),
          (
            ProductService.GetCodeblockDoc as (
              v: string,
              a: string,
            ) => Promise<string>
          )(versionName, "agent"),
        ]).then(([u, a]) => {
          setDoc(u ?? "");
          setAgentDoc(a ?? "");
        });
      })
      .catch(console.error)
      .finally(() => setDocLoading(false));
  }, [activeTab, blockId, doc, selectedVersion]);

  // Lazy load instances (also needed for settings tab counts)
  useEffect(() => {
    if (
      (activeTab !== "instances" && activeTab !== "settings") ||
      instances.length > 0
    )
      return;
    setInstancesLoading(true);
    (
      ProductService.ListCodeblockInstances as (
        id: string,
      ) => Promise<CodeblockInstance[]>
    )(blockId)
      .then((v) => setInstances(v ?? []))
      .catch(console.error)
      .finally(() => {
        setInstancesLoading(false);
        setInstancesLoaded(true);
      });
  }, [activeTab, blockId, instances.length]);

  // Lazy load plans for settings tab
  useEffect(() => {
    if (activeTab !== "settings" || plans.length > 0) return;
    setPlansLoading(true);
    (ProductService.ListBlockPlans as (id: string) => Promise<BlockPlan[]>)(
      blockId,
    )
      .then((v) => setPlans(v ?? []))
      .catch(console.error)
      .finally(() => setPlansLoading(false));
  }, [activeTab, blockId, plans.length]);

  // Lazy load access data for access tab
  useEffect(() => {
    if (activeTab !== "access" || accessData !== null) return;
    setAccessLoading(true);
    setAccessError(null);
    (
      ProductService.GetBlockAccessData as (
        id: string,
      ) => Promise<BlockAccessData>
    )(blockId)
      .then((d) => setAccessData(d ?? { members: [] }))
      .catch((e) => setAccessError(String(e)))
      .finally(() => setAccessLoading(false));
  }, [activeTab, blockId, accessData]);

  const publisherLabel = block?.publisher
    ? block.publisher.replace("accounts/", "")
    : "Alis Exchange";

  const isOwner = Boolean(myAccountID && block?.publisher === myAccountID);

  return (
    <div className="flex-1 overflow-hidden flex flex-row bg-background">
      {/* Sidebar */}
      <div className="w-[280px] shrink-0 flex flex-col border-r border-border">
        {/* Back */}
        <button
          onClick={() => navigate("/codeblocks")}
          className="flex items-center gap-[8px] px-[16px] py-[12px] text-[11px] text-foreground/50 hover:text-foreground/80 border-b border-border transition-colors"
        >
          <Icon icon="solar:arrow-left-linear" />
          All Blocks
        </button>

        <div className="flex-1 overflow-auto p-[16px] flex flex-col gap-[16px]">
          {blockLoading ? (
            <div className="flex items-center justify-center py-[40px]">
              <Loader />
            </div>
          ) : block ? (
            <>
              {/* Title + badge */}
              <div>
                <h1 className="font-mono font-bold text-[15px] text-foreground uppercase leading-[1.3] mb-[8px]">
                  {block.displayName}
                </h1>
                {block.releaseLevel > 0 && (
                  <span
                    className={`text-[9px] font-bold uppercase border rounded px-[6px] py-[2px] ${LEVEL_COLOR[block.releaseLevel] ?? "text-foreground/50 border-foreground/10 bg-foreground/5"}`}
                  >
                    {LEVEL_LABEL[block.releaseLevel] ?? "Unknown"}
                  </span>
                )}
              </div>

              <p className="text-[12px] text-foreground/60 leading-[1.5]">
                {block.headline || block.description}
              </p>

              {/* Meta */}
              <div className="bg-foreground/3 border border-border rounded-[4px] overflow-hidden text-[11px]">
                {block.latestVersion && (
                  <div className="px-[12px] py-[10px] border-b border-border">
                    <p className="text-foreground/40 uppercase text-[9px] font-bold mb-[2px]">
                      Latest Version
                    </p>
                    <p className="text-foreground font-mono">
                      {block.latestVersion}
                    </p>
                  </div>
                )}
                <div className="px-[12px] py-[10px] border-b border-border">
                  <p className="text-foreground/40 uppercase text-[9px] font-bold mb-[2px]">
                    Publisher
                  </p>
                  <p className="text-foreground font-mono truncate">
                    {publisherLabel}
                  </p>
                </div>
                <div className="px-[12px] py-[10px]">
                  <p className="text-foreground/40 uppercase text-[9px] font-bold mb-[2px]">
                    Installs
                  </p>
                  <p className="text-foreground font-mono">
                    {block.installCount ?? 0}
                  </p>
                </div>
              </div>

              {/* Members */}
              {members.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase text-foreground/40 mb-[10px]">
                    Members
                  </p>
                  <div className="flex -space-x-2">
                    {members.map((m) => (
                      <img
                        key={m.name}
                        src={m.photoUrl}
                        alt={m.displayName}
                        title={m.displayName}
                        className="size-[32px] rounded-full border-2 border-border object-cover bg-card"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* CTA */}
        <div className="p-[10px] border-t border-border flex flex-col gap-[8px]">
          {isOwner ? (
            <>
              <Button
                variant="secondary"
                className="w-full"
                icon={<Icon icon="solar:pen-linear" />}
                onClick={() => navigate(`/codeblocks/${blockId}/edit`)}
              >
                Edit Block
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                icon={<Icon icon="solar:upload-linear" />}
                onClick={() => navigate(`/codeblocks/${blockId}/contribute`)}
              >
                Contribute Version
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                icon={<Icon icon="solar:refresh-linear" />}
                onClick={() => navigate(`/codeblocks/${blockId}/update`)}
              >
                Update
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              className="w-full"
              icon={<Icon icon="solar:box-linear" />}
              onClick={() => go("instances")}
            >
              Instances
            </Button>
          )}
          <Button
            variant="primary"
            className="w-full"
            icon={<Icon icon="solar:download-linear" />}
            onClick={() => setInstallOpen(true)}
          >
            Install Block
          </Button>
        </div>
      </div>

      {installOpen && (
        <InstallBlockWizard
          blockId={blockId}
          blockDisplayName={block?.displayName ?? blockId}
          onClose={() => setInstallOpen(false)}
          onDone={() => {
            setInstallOpen(false);
            setInstancesLoaded(false);
            setInstances([]);
            go("instances");
          }}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center border-b border-border shrink-0">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => go(t)}
              className={`px-[24px] py-[12px] text-[11px] font-bold uppercase tracking-wider transition-all relative ${
                activeTab === t
                  ? "text-brand"
                  : "text-foreground/40 hover:text-foreground/70"
              }`}
            >
              {TAB_LABEL[t]}
              {activeTab === t && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-fill" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "documentation" && (
            <DocumentationTab
              doc={doc}
              agentDoc={agentDoc}
              loading={docLoading}
              audience={docAudience}
              onAudienceChange={setDocAudience}
              versionCreateTime={selectedVersion?.createTime}
            />
          )}
          {activeTab === "versions" && (
            <VersionsTab
              versions={versions}
              loading={versionsLoading || !versionsLoaded}
              selected={selectedVersion}
              onSelect={setSelectedVersion}
            />
          )}
          {activeTab === "instances" && (
            <InstancesTab
              instances={instances}
              loading={instancesLoading || !instancesLoaded}
              blockId={blockId}
              onRefresh={() => {
                setInstancesLoaded(false);
                setInstances([]);
              }}
            />
          )}
          {activeTab === "help" && <HelpTab blockId={blockId} />}
          {activeTab === "settings" && (
            <SettingsTab
              blockId={blockId}
              block={block}
              versions={versions}
              instances={instances}
              plans={plans}
              plansLoading={plansLoading}
              onNavigate={go}
            />
          )}
          {activeTab === "access" && (
            <AccessTab
              blockId={blockId}
              data={accessData}
              loading={accessLoading || (accessData === null && !accessError)}
              error={accessError}
              isOwner={isOwner}
              onRefresh={() => setAccessData(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Install Block Wizard ──────────────────────────────────────────────────────

type InstallStep =
  "location" | "plan" | "configure" | "installing" | "merge" | "done";
type MergePhase = "ready" | "merging" | "done";

function InstallBlockWizard({
  blockId,
  blockDisplayName,
  onClose,
  onDone,
}: {
  blockId: string;
  blockDisplayName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<InstallStep>("location");
  const [error, setError] = useState("");

  // Location step
  const [orgs, setOrgs] = useState<InstallOrg[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [products, setProducts] = useState<InstallProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [neurons, setNeurons] = useState<InstallNeuron[]>([]);
  const [neuronsLoading, setNeuronsLoading] = useState(false);
  const [selectedNeuron, setSelectedNeuron] = useState<InstallNeuron | null>(
    null,
  );

  // Plan step
  const [plans, setPlans] = useState<BlockPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<BlockPlan | null>(null);

  // Configure step
  const [versions, setVersions] = useState<CodeblockVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [buildFolder, setBuildFolder] = useState("./");
  const [selectedVersion, setSelectedVersion] = useState("");

  // Merge step
  const [mergePhase, setMergePhase] = useState<MergePhase>("ready");
  const [instanceName, setInstanceName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [mergeError, setMergeError] = useState("");
  const [mergeResult, setMergeResult] = useState<{
    branch: string;
    buildCommitSha: string;
    defineCommitSha: string;
  } | null>(null);
  // Other long-lived branches on the build repo besides "master" — the merge RPC
  // always targets master, so if any of these exist we warn the user that this repo
  // won't be updated by auto-merge.
  const [otherBuildBranches, setOtherBuildBranches] = useState<string[]>([]);

  // Load orgs on mount
  useEffect(() => {
    setOrgsLoading(true);
    (ProductService.ListInstallOrgs as () => Promise<InstallOrg[]>)()
      .then((list) => setOrgs(list ?? []))
      .catch((e) => setError(String(e)))
      .finally(() => setOrgsLoading(false));
  }, []);

  // Load products when org selected
  useEffect(() => {
    if (!selectedOrg) return;
    setSelectedProduct("");
    setSelectedNeuron(null);
    setNeurons([]);
    setProductsLoading(true);
    const orgId = selectedOrg.replace("organisations/", "");
    (ProductService.ListProducts as (org: string) => Promise<InstallProduct[]>)(
      orgId,
    )
      .then((list) => setProducts(list ?? []))
      .catch((e) => setError(String(e)))
      .finally(() => setProductsLoading(false));
  }, [selectedOrg]);

  // Load neurons when product selected
  useEffect(() => {
    if (!selectedOrg || !selectedProduct) return;
    setSelectedNeuron(null);
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
      .catch((e) => setError(String(e)))
      .finally(() => setNeuronsLoading(false));
  }, [selectedOrg, selectedProduct]);

  function goToPlan() {
    if (!selectedNeuron) return;
    setError("");
    setPlansLoading(true);
    setStep("plan");
    (ProductService.ListBlockPlans as (id: string) => Promise<BlockPlan[]>)(
      blockId,
    )
      .then((list) => {
        const l = list ?? [];
        setPlans(l);
        if (l.length === 1) setSelectedPlan(l[0]);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setPlansLoading(false));
  }

  function goToConfigure() {
    if (!selectedPlan) return;
    setError("");
    setVersionsLoading(true);
    setStep("configure");
    (
      ProductService.ListCodeblockVersions as (
        id: string,
      ) => Promise<CodeblockVersion[]>
    )(blockId)
      .then((list) => {
        const l = list ?? [];
        setVersions(l);
        if (l.length > 0) setSelectedVersion(l[0].name);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setVersionsLoading(false));
  }

  function doInstall() {
    if (!selectedNeuron || !selectedPlan) return;
    setError("");
    setStep("installing");
    const params = {
      blockId,
      package: selectedNeuron.package,
      planName: selectedPlan.name,
      buildFolder: buildFolder || "./",
      blockVersion: selectedVersion,
    };
    (
      ProductService.DoInstallBlock as (p: typeof params) => Promise<{
        instanceName: string;
        branchName: string;
        repoPath: string;
        defineRepoPath: string;
      }>
    )(params)
      .then((r) => {
        setInstanceName(r?.instanceName ?? "");
        setBranchName(r?.branchName ?? "");
        setRepoPath(r?.repoPath ?? "");
        setMergePhase("ready");
        setStep("merge");

        // Auto-merge always targets "master" on both repos (it's a fixed backend
        // behaviour, not a client choice — see startMerge). If the build repo has
        // other long-lived branches, warn the user that this won't update them.
        const buildRepoPath = r?.repoPath ?? "";
        if (buildRepoPath) {
          (
            GitService.GetBranches as (
              p: string,
            ) => Promise<{ name: string; isRemote: boolean }[]>
          )(buildRepoPath)
            .then((branches) => {
              const remote = (branches ?? [])
                .filter((b) => b.isRemote)
                .map((b) => b.name.replace(/^origin\//, ""))
                .filter((v, i, a) => a.indexOf(v) === i);
              setOtherBuildBranches(remote.filter((b) => b !== "master"));
            })
            .catch(() => {});
        }
      })
      .catch((e) => {
        setError(String(e));
        setStep("configure");
      });
  }

  // startMerge calls the Blocks backend's instance-scoped MergeBlockBranch RPC, which
  // merges the branch InstallBlock created into "master" on both the build and define
  // repos in a single server-side operation (no local git/PR steps involved).
  function startMerge() {
    setMergePhase("merging");
    setMergeError("");
    setMergeResult(null);
    (
      ProductService.MergeBlockInstance as (name: string) => Promise<{
        branch: string;
        buildCommitSha: string;
        defineCommitSha: string;
      }>
    )(instanceName)
      .then((r) => {
        setMergeResult(r);
        setMergePhase("done");
      })
      .catch((e) => {
        setMergeError(String(e));
        setMergePhase("ready");
      });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-[8px] flex flex-col shadow-2xl transition-all duration-200 w-[520px] max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-[24px] py-[18px] border-b border-border shrink-0">
          <div>
            <h2 className="font-mono font-bold text-[13px] text-foreground uppercase">
              Install Block
            </h2>
            <p className="text-[11px] text-foreground/40 mt-[2px]">
              {blockDisplayName}
            </p>
          </div>
          {step !== "installing" &&
            !(step === "merge" && mergePhase === "merging") && (
              <button
                onClick={onClose}
                className="text-foreground/40 hover:text-foreground/80 transition-colors p-[4px]"
              >
                <Icon icon="solar:close-circle-linear" className="text-lg" />
              </button>
            )}
        </div>

        {/* Step indicator */}
        <div className="flex items-center px-[24px] py-[12px] border-b border-border shrink-0">
          {(["location", "plan", "configure", "merge"] as InstallStep[]).map(
            (s, i) => {
              const labels: Record<string, string> = {
                location: "1. Location",
                plan: "2. Plan",
                configure: "3. Configure",
                merge: "4. Merge",
              };
              const stepOrder: InstallStep[] = [
                "location",
                "plan",
                "configure",
                "installing",
                "merge",
                "done",
              ];
              const currentIdx = stepOrder.indexOf(step);
              const thisIdx = stepOrder.indexOf(s);
              const active =
                step === s || (s === "merge" && step === "installing");
              const done =
                currentIdx > thisIdx &&
                !(s === "merge" && step === "installing");
              return (
                <div key={s} className="flex items-center gap-[8px]">
                  {i > 0 && (
                    <div
                      className={`w-[24px] h-[1px] ${done ? "bg-brand-fill" : "bg-foreground/20"}`}
                    />
                  )}
                  <span
                    className={`text-[10px] font-bold uppercase ${active ? "text-brand" : done ? "text-foreground/60" : "text-foreground/25"}`}
                  >
                    {labels[s]}
                  </span>
                </div>
              );
            },
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-[24px]">
          {error && (
            <div className="mb-[16px] p-[12px] bg-red-500/10 border border-red-500/30 rounded-[4px] text-[12px] text-red-400">
              {error}
            </div>
          )}

          {step === "location" && (
            <div className="flex flex-col gap-[16px]">
              <p className="text-[12px] text-foreground/50">
                Select where to install this block.
              </p>

              <div>
                <label className="block text-[10px] font-bold uppercase text-foreground/40 mb-[6px]">
                  Landing Zone
                </label>
                <SearchableSelect
                  className="w-full"
                  value={selectedOrg}
                  onChange={setSelectedOrg}
                  loading={orgsLoading}
                  placeholder="Select organisation…"
                  emptyLabel="No organisations"
                  options={orgs.map((o) => ({
                    value: o.name,
                    label:
                      o.displayName || o.name.replace("organisations/", ""),
                  }))}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-foreground/40 mb-[6px]">
                  Product
                </label>
                <SearchableSelect
                  className="w-full"
                  value={selectedProduct}
                  onChange={setSelectedProduct}
                  loading={productsLoading}
                  disabled={!selectedOrg}
                  placeholder="Select product…"
                  emptyLabel="No products"
                  options={products.map((p) => ({
                    value: p.name,
                    label: p.displayName || p.name,
                  }))}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-foreground/40 mb-[6px]">
                  Neuron
                </label>
                <SearchableSelect
                  className="w-full"
                  value={selectedNeuron?.name ?? ""}
                  onChange={(v) =>
                    setSelectedNeuron(neurons.find((n) => n.name === v) ?? null)
                  }
                  loading={neuronsLoading}
                  disabled={!selectedProduct}
                  placeholder="Select neuron…"
                  emptyLabel="No neurons"
                  options={neurons.map((n) => ({
                    value: n.name,
                    label: n.displayName,
                  }))}
                />
                {selectedNeuron && (
                  <p className="mt-[6px] text-[10px] font-mono text-foreground/30">
                    {selectedNeuron.package}
                  </p>
                )}
              </div>
            </div>
          )}

          {step === "plan" && (
            <div className="flex flex-col gap-[12px]">
              <p className="text-[12px] text-foreground/50">
                Select an entitlement plan.
              </p>
              {plansLoading ? (
                <div className="flex items-center justify-center py-[40px]">
                  <Loader />
                </div>
              ) : plans.length === 0 ? (
                <p className="text-[12px] text-foreground/40">
                  No plans available.
                </p>
              ) : (
                plans.map((plan) => (
                  <button
                    key={plan.name}
                    onClick={() => setSelectedPlan(plan)}
                    className={`w-full text-left p-[16px] border rounded-[4px] transition-all ${
                      selectedPlan?.name === plan.name
                        ? "border-brand-fill bg-brand-fill/5"
                        : "border-border bg-foreground/3 hover:border-foreground/30"
                    }`}
                  >
                    <p className="font-mono text-[12px] font-bold text-foreground">
                      {plan.displayName || plan.name.split("/").pop()}
                    </p>
                    <p className="text-[10px] text-foreground/30 mt-[2px] font-mono">
                      {plan.name}
                    </p>
                  </button>
                ))
              )}
            </div>
          )}

          {step === "configure" && (
            <div className="flex flex-col gap-[16px]">
              <p className="text-[12px] text-foreground/50">
                Configure the installation.
              </p>

              <div>
                <label className="block text-[10px] font-bold uppercase text-foreground/40 mb-[6px]">
                  Build Folder
                </label>
                <input
                  type="text"
                  value={buildFolder}
                  onChange={(e) => setBuildFolder(e.target.value)}
                  className="w-full bg-card border border-border rounded-[4px] px-[12px] py-[8px] text-[12px] text-foreground font-mono focus:outline-none focus:border-brand-fill transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-foreground/40 mb-[6px]">
                  Block Version
                </label>
                <FilterSelect
                  size="lg"
                  value={selectedVersion}
                  onChange={setSelectedVersion}
                  loading={versionsLoading}
                  placeholder="Latest"
                  options={[
                    { value: "", label: "Latest" },
                    ...versions.map((v) => ({
                      value: v.name,
                      label: v.versionTag,
                    })),
                  ]}
                />
              </div>

              <div className="p-[12px] bg-foreground/3 border border-border rounded-[4px] text-[11px] text-foreground/50">
                <p className="font-bold text-foreground/30 uppercase text-[9px] mb-[6px]">
                  Summary
                </p>
                <p>
                  Block:{" "}
                  <span className="text-foreground/70 font-mono">
                    {blockId}
                  </span>
                </p>
                <p>
                  Package:{" "}
                  <span className="text-foreground/70 font-mono">
                    {selectedNeuron?.package}
                  </span>
                </p>
                <p>
                  Plan:{" "}
                  <span className="text-foreground/70 font-mono">
                    {selectedPlan?.displayName || selectedPlan?.name}
                  </span>
                </p>
              </div>
            </div>
          )}

          {step === "installing" && (
            <div className="flex flex-col items-center justify-center py-[40px] gap-[16px]">
              <Loader />
              <p className="text-[13px] text-foreground/60">
                Installing block…
              </p>
              <p className="text-[11px] text-foreground/30">
                This may take a few minutes.
              </p>
            </div>
          )}

          {step === "merge" && (
            <MergeStepContent
              mergePhase={mergePhase}
              branchName={branchName}
              repoPath={repoPath}
              mergeError={mergeError}
              mergeResult={mergeResult}
              otherBuildBranches={otherBuildBranches}
            />
          )}

          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-[40px] gap-[16px]">
              <Icon
                icon="solar:check-circle-bold"
                className="text-5xl text-green-400"
              />
              <p className="text-[14px] font-bold text-foreground">
                Block Installed
              </p>
              <p className="text-[12px] text-foreground/50 text-center">
                The block has been installed and merged into{" "}
                <span className="text-foreground/80 font-mono">
                  {selectedNeuron?.package}
                </span>
                .
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-[8px] px-[24px] py-[16px] border-t border-border shrink-0">
          {step === "location" && (
            <>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={goToPlan}
                disabled={!selectedNeuron}
              >
                Select Plan
              </Button>
            </>
          )}
          {step === "plan" && (
            <>
              <Button variant="secondary" onClick={() => setStep("location")}>
                Back
              </Button>
              <Button
                variant="primary"
                onClick={goToConfigure}
                disabled={!selectedPlan || plansLoading}
              >
                Configure
              </Button>
            </>
          )}
          {step === "configure" && (
            <>
              <Button variant="secondary" onClick={() => setStep("plan")}>
                Back
              </Button>
              <Button
                variant="primary"
                onClick={doInstall}
                disabled={versionsLoading}
                icon={<Icon icon="solar:download-linear" />}
              >
                Install
              </Button>
            </>
          )}
          {step === "merge" && mergePhase === "ready" && (
            <>
              <Button variant="secondary" onClick={() => setStep("done")}>
                Skip
              </Button>
              <Button
                variant="primary"
                onClick={startMerge}
                disabled={!instanceName}
                icon={<Icon icon="solar:code-square-linear" />}
              >
                Start Merge
              </Button>
            </>
          )}
          {step === "merge" && mergePhase === "merging" && (
            <Button variant="primary" disabled icon={<Loader size={14} />}>
              Merging…
            </Button>
          )}
          {step === "merge" && mergePhase === "done" && (
            <Button variant="primary" onClick={() => setStep("done")}>
              Continue
            </Button>
          )}
          {step === "done" && (
            <Button variant="primary" onClick={onDone}>
              View Instances
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Merge Step Content ────────────────────────────────────────────────────────

function MergeStepContent({
  mergePhase,
  branchName,
  repoPath,
  mergeError,
  mergeResult,
  otherBuildBranches,
}: {
  mergePhase: MergePhase;
  branchName: string;
  repoPath: string;
  mergeError: string;
  mergeResult: {
    branch: string;
    buildCommitSha: string;
    defineCommitSha: string;
  } | null;
  otherBuildBranches: string[];
}) {
  if (mergePhase === "ready") {
    return (
      <div className="flex flex-col gap-[16px]">
        <p className="text-[12px] text-foreground/50">
          The installation created a branch on the remote repo. Merge it into
          master to complete the setup.
        </p>
        <div className="p-[12px] bg-foreground/3 border border-border rounded-[4px] text-[11px] text-foreground/50 flex flex-col gap-[6px]">
          <div className="flex items-center gap-[8px]">
            <Icon
              icon="solar:git-branch-linear"
              className="text-brand text-sm shrink-0"
            />
            <span className="font-mono text-foreground/80">
              {branchName || "(branch name unknown)"}
            </span>
          </div>
          <div className="flex items-center gap-[8px]">
            <Icon
              icon="solar:folder-linear"
              className="text-foreground/30 text-sm shrink-0"
            />
            <span className="font-mono text-foreground/40 text-[10px] break-all">
              {repoPath || "(repo path unknown)"}
            </span>
          </div>
        </div>
        {otherBuildBranches.length > 0 && (
          <div className="p-[10px] bg-yellow-500/10 border border-yellow-500/30 rounded-[4px] text-[11px] text-yellow-500 flex flex-col gap-[4px]">
            <span className="font-bold">Heads up</span>
            <span className="text-yellow-500/80">
              Auto-merge always targets{" "}
              <span className="font-mono">master</span> on the build repo.
              This repo also has{" "}
              {otherBuildBranches.map((b) => (
                <span key={b} className="font-mono">
                  {b}{" "}
                </span>
              ))}
              — merge master into those manually afterward if needed.
            </span>
          </div>
        )}
        {mergeError && (
          <div className="p-[10px] bg-red-500/10 border border-red-500/30 rounded-[4px] text-[11px] text-red-400 font-mono whitespace-pre-wrap">
            {mergeError}
          </div>
        )}
        <p className="text-[11px] text-foreground/30">
          This merges{" "}
          <span className="font-mono">{branchName || "…"}</span> into{" "}
          <span className="font-mono">master</span> on both the build and
          define repos via the Blocks backend — no local git required.
        </p>
      </div>
    );
  }

  if (mergePhase === "merging") {
    return (
      <div className="flex flex-col items-center justify-center py-[40px] gap-[16px]">
        <Loader />
        <p className="text-[13px] text-foreground/60">Merging…</p>
        <p className="text-[11px] text-foreground/30">
          This can take a moment.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-[40px] gap-[16px]">
      <Icon icon="solar:check-circle-bold" className="text-5xl text-green-400" />
      <p className="text-[14px] font-bold text-foreground">Branch Merged</p>
      <p className="text-[12px] text-foreground/50 text-center">
        <span className="font-mono text-foreground/80">{branchName}</span> has
        been merged into {mergeResult?.branch || "master"}.
      </p>
      {(mergeResult?.buildCommitSha || mergeResult?.defineCommitSha) && (
        <div className="text-[10px] font-mono text-foreground/30 flex flex-col gap-[2px] items-center">
          {mergeResult.buildCommitSha && (
            <span>build {mergeResult.buildCommitSha.slice(0, 12)}</span>
          )}
          {mergeResult.defineCommitSha && (
            <span>define {mergeResult.defineCommitSha.slice(0, 12)}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Documentation Tab ─────────────────────────────────────────────────────────

function DocumentationTab({
  doc,
  agentDoc,
  loading,
  audience,
  onAudienceChange,
  versionCreateTime,
}: {
  doc: string;
  agentDoc: string;
  loading: boolean;
  audience: "user" | "agent";
  onAudienceChange: (a: "user" | "agent") => void;
  versionCreateTime?: string;
}) {
  const [copied, setCopied] = useState(false);
  const proseRef = useRef<HTMLDivElement>(null);
  const content = audience === "agent" ? agentDoc : doc;
  const html = content ? (marked.parse(content) as string) : "";
  const versionTs = versionCreateTime
    ? new Date(versionCreateTime).getTime()
    : NaN;
  const isGenerating =
    !isNaN(versionTs) && Date.now() - versionTs < 15 * 60 * 1000;

  useEffect(() => {
    if (!proseRef.current || !html) return;
    const nodes = proseRef.current.querySelectorAll<HTMLElement>(
      "pre code.language-mermaid",
    );
    if (nodes.length === 0) return;
    nodes.forEach((codeEl, i) => {
      const pre = codeEl.parentElement;
      if (!pre) return;
      const code = codeEl.textContent ?? "";
      const id = `mermaid-${Date.now()}-${i}`;
      const wrapper = document.createElement("div");
      wrapper.className = "mermaid-diagram";
      wrapper.style.cssText =
        "margin: 16px 0; display: flex; justify-content: center;";
      pre.replaceWith(wrapper);
      mermaid
        .parse(code)
        .then(() => mermaid.render(id, code))
        .then(({ svg }) => {
          wrapper.innerHTML = svg;
        })
        .catch(() => {
          document.getElementById(`d${id}`)?.remove();
          document.getElementById(id)?.remove();
          wrapper.replaceWith(pre);
        });
    });
  }, [html]);

  function handleCopy() {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sub-tabs */}
      <div className="flex items-center gap-[2px] px-[20px] pt-[12px] pb-0 border-b border-border shrink-0">
        {(["user", "agent"] as const).map((a) => (
          <button
            key={a}
            onClick={() => onAudienceChange(a)}
            className={`px-[14px] py-[8px] text-[10px] font-bold uppercase relative transition-all ${
              audience === a
                ? "text-brand"
                : "text-foreground/40 hover:text-foreground/70"
            }`}
          >
            {a === "user" ? "User Facing" : "Agent Facing"}
            {audience === a && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-fill" />
            )}
          </button>
        ))}
        <div className="flex-1" />
        {audience === "agent" && content && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-[6px] px-[12px] py-[6px] mb-[6px] text-[10px] font-bold uppercase rounded border transition-all"
            style={
              copied
                ? {
                    color: "#4ade80",
                    borderColor: "rgba(74,222,128,0.3)",
                    background: "rgba(74,222,128,0.08)",
                  }
                : {
                    color: "rgba(255,255,255,0.4)",
                    borderColor: "#464646",
                    background: "transparent",
                  }
            }
          >
            <Icon
              icon={copied ? "solar:check-circle-linear" : "solar:copy-linear"}
              className="text-sm"
            />
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-[32px]">
        {loading ? (
          <div className="flex items-center justify-center py-[60px]">
            <Loader />
          </div>
        ) : html ? (
          <div
            ref={proseRef}
            className="prose prose-invert prose-sm max-w-none break-words
              text-[13px] leading-[1.7] text-foreground/75
              [&_h1]:font-mono [&_h1]:text-[16px] [&_h1]:font-bold [&_h1]:uppercase [&_h1]:text-foreground [&_h1]:mb-[12px]
              [&_h2]:font-mono [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:uppercase [&_h2]:text-foreground [&_h2]:mb-[8px]
              [&_h3]:font-mono [&_h3]:text-[12px] [&_h3]:font-bold [&_h3]:text-foreground [&_h3]:mb-[6px]
              [&_h4]:text-[12px] [&_h4]:font-semibold [&_h4]:text-foreground [&_h4]:mb-[4px]
              [&_h5]:text-[11px] [&_h5]:font-semibold [&_h5]:text-foreground/80 [&_h5]:mb-[4px]
              [&_h6]:text-[11px] [&_h6]:font-medium [&_h6]:text-foreground/60 [&_h6]:mb-[4px]
              [&_p]:text-foreground/70 [&_p]:mb-[10px]
              [&_code]:text-brand [&_code]:bg-foreground/5 [&_code]:px-[4px] [&_code]:py-[1px] [&_code]:rounded [&_code]:text-[11px]
              [&_pre]:bg-card [&_pre]:border [&_pre]:border-border [&_pre]:rounded-[4px] [&_pre]:text-[11px] [&_pre]:p-[12px] [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words
              [&_pre_code]:bg-transparent [&_pre_code]:text-foreground/80 [&_pre_code]:p-0
              [&_a]:text-brand [&_a]:no-underline hover:[&_a]:underline
              [&_strong]:text-foreground
              [&_li]:text-foreground/70 [&_li]:mb-[4px]
              [&_ul]:mb-[10px] [&_ol]:mb-[10px]
              [&_hr]:border-border [&_hr]:my-[20px]"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : isGenerating ? (
          <div className="flex flex-col items-center justify-center py-[60px] gap-[16px]">
            <div className="w-[48px] h-[48px] rounded-full bg-foreground/5 flex items-center justify-center">
              <Icon
                icon="solar:document-add-linear"
                className="text-[24px] text-foreground/30"
              />
            </div>
            <div className="text-center">
              <p className="text-foreground/60 text-[13px] font-medium">
                Generating documentation
              </p>
              <p className="text-foreground/30 text-[11px] mt-[4px]">
                This may take a few minutes after publishing
              </p>
            </div>
          </div>
        ) : (
          <EmptyState
            icon="solar:document-text-linear"
            title="No documentation available"
          />
        )}
      </div>
    </div>
  );
}

// ── Versions Tab ──────────────────────────────────────────────────────────────

const VERSION_FILTERS = [
  { label: "Stable", level: 5 },
  { label: "RC", level: 4 },
  { label: "Beta", level: 3 },
  { label: "Alpha", level: 2 },
  { label: "Experimental", level: 1 },
] as const;

function VersionsTab({
  versions,
  loading,
  selected,
  onSelect,
}: {
  versions: CodeblockVersion[];
  loading: boolean;
  selected: CodeblockVersion | null;
  onSelect: (v: CodeblockVersion) => void;
}) {
  const [filter, setFilter] = useState<number | null>(null);
  const [detail, setDetail] = useState<CodeblockVersion | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [openFile, setOpenFile] = useState<{
    name: string;
    content: string;
  } | null>(null);

  useEffect(() => {
    if (!selected) return;
    setDetail(null);
    setExpandedFolders(new Set());
    setDetailLoading(true);
    (
      ProductService.GetCodeblockVersion as (
        name: string,
      ) => Promise<CodeblockVersion>
    )(selected.name)
      .then((full) => {
        setDetail(full);
        setExpandedFolders(new Set(full.files?.map((f) => f.name) ?? []));
      })
      .catch(() => setDetail(selected))
      .finally(() => setDetailLoading(false));
  }, [selected?.name]);

  function toggleFolder(name: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState
          icon="solar:box-minimalistic-linear"
          title="No versions published yet"
        />
      </div>
    );
  }

  const filtered =
    filter === null
      ? versions
      : versions.filter((v) => v.releaseLevel === filter);
  const displayDetail = detail ?? (detailLoading ? null : selected);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Filter bar */}
      <div className="flex items-center gap-[8px] px-[16px] py-[10px] border-b border-border shrink-0 flex-wrap">
        <span className="text-[11px] text-foreground/40 mr-[4px]">
          Filters:
        </span>
        {VERSION_FILTERS.map((f) => (
          <button
            key={f.level}
            onClick={() => setFilter(filter === f.level ? null : f.level)}
            className={`text-[10px] font-bold uppercase border rounded-full px-[10px] py-[3px] transition-colors ${
              filter === f.level
                ? LEVEL_COLOR[f.level]
                : "text-foreground/40 border-foreground/20 hover:border-foreground/40"
            }`}
          >
            {f.label}
          </button>
        ))}
        {filter !== null && (
          <button
            onClick={() => setFilter(null)}
            className="text-[10px] font-bold uppercase border rounded-full px-[10px] py-[3px] text-foreground/60 border-foreground/30 hover:border-foreground/50 ml-[4px]"
          >
            Show all
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Version list */}
        <div className="w-[260px] shrink-0 border-r border-border overflow-auto">
          {filtered.length === 0 && (
            <p className="text-[12px] text-foreground/30 p-[16px]">
              No versions match this filter
            </p>
          )}
          {filtered.map((v) => (
            <button
              key={v.name}
              onClick={() => onSelect(v)}
              className={`w-full text-left px-[16px] py-[14px] border-b border-border transition-colors ${
                selected?.name === v.name
                  ? "bg-foreground/5"
                  : "hover:bg-foreground/3"
              }`}
            >
              <div className="flex items-center justify-between mb-[4px]">
                <span className="font-mono text-[12px] text-foreground font-bold">
                  {v.versionTag}
                </span>
                <span
                  className={`text-[8px] font-bold uppercase border rounded px-[5px] py-[1px] ${
                    v.releaseLevel > 0
                      ? (LEVEL_COLOR[v.releaseLevel] ??
                        "text-foreground/50 border-foreground/10 bg-foreground/5")
                      : "text-foreground/30 border-foreground/10 bg-foreground/5"
                  }`}
                >
                  {v.releaseLevel > 0
                    ? (LEVEL_LABEL[v.releaseLevel] ?? "")
                    : "Not Specified"}
                </span>
              </div>
              {v.createTime && (
                <p className="text-[10px] text-foreground/40">
                  {formatDate(v.createTime)}
                </p>
              )}
            </button>
          ))}
        </div>

        {/* Version detail */}
        {selected && (
          <div className="flex-1 overflow-auto p-[24px]">
            {detailLoading ? (
              <div className="flex items-center justify-center h-[120px]">
                <Loader />
              </div>
            ) : (
              displayDetail && (
                <div className="max-w-[700px] flex flex-col gap-[20px]">
                  <div>
                    <h2 className="font-mono font-bold text-[16px] text-foreground uppercase mb-[4px]">
                      {displayDetail.versionTag}
                    </h2>
                    <div className="flex items-center gap-[12px] text-[11px] text-foreground/40">
                      {displayDetail.createTime && (
                        <span>
                          Published {formatDate(displayDetail.createTime)}
                        </span>
                      )}
                      <span
                        className={`text-[9px] font-bold uppercase border rounded px-[5px] py-[1px] ${
                          displayDetail.releaseLevel > 0
                            ? (LEVEL_COLOR[displayDetail.releaseLevel] ??
                              "text-foreground/50 border-foreground/10 bg-foreground/5")
                            : "text-foreground/30 border-foreground/10 bg-foreground/5"
                        }`}
                      >
                        {displayDetail.releaseLevel > 0
                          ? LEVEL_LABEL[displayDetail.releaseLevel]
                          : "Not Specified"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase text-foreground/40 mb-[8px]">
                      Release Notes
                    </p>
                    <div className="bg-card border border-border rounded-[4px] p-[16px]">
                      {displayDetail.releaseNotes ? (
                        <p className="text-[13px] text-foreground/80 leading-[1.6]">
                          {displayDetail.releaseNotes}
                        </p>
                      ) : (
                        <p className="text-[13px] text-foreground/30 italic">
                          No release notes written.
                        </p>
                      )}
                    </div>
                  </div>

                  {displayDetail.files && displayDetail.files.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase text-foreground/40 mb-[8px]">
                        Files
                      </p>
                      <div className="flex flex-col gap-[4px]">
                        {displayDetail.files.map((folder) => {
                          const isExpanded = expandedFolders.has(folder.name);
                          return (
                            <div
                              key={folder.name}
                              className="bg-card border border-border rounded-[4px] overflow-hidden"
                            >
                              <button
                                onClick={() => toggleFolder(folder.name)}
                                className="w-full flex items-center gap-[8px] px-[12px] py-[10px] border-b border-border hover:bg-foreground/3 transition-colors text-left"
                              >
                                <Icon
                                  icon={
                                    isExpanded
                                      ? "solar:alt-arrow-down-linear"
                                      : "solar:alt-arrow-right-linear"
                                  }
                                  className="text-foreground/40 text-xs shrink-0"
                                />
                                <Icon
                                  icon="solar:folder-linear"
                                  className="text-foreground/50 text-sm shrink-0"
                                />
                                <span className="text-[12px] text-foreground font-mono">
                                  {folder.name}
                                </span>
                              </button>
                              {isExpanded &&
                                folder.files?.map((f) => (
                                  <button
                                    key={f.name}
                                    onClick={() =>
                                      setOpenFile({
                                        name: f.name,
                                        content: f.content ?? "",
                                      })
                                    }
                                    className="w-full flex items-center gap-[8px] px-[12px] py-[8px] pl-[36px] border-b border-border last:border-0 hover:bg-foreground/5 transition-colors text-left group"
                                  >
                                    <Icon
                                      icon="solar:file-linear"
                                      className="text-foreground/30 text-xs shrink-0 group-hover:text-foreground/50"
                                    />
                                    <span className="text-[11px] text-foreground/70 font-mono group-hover:text-foreground/90">
                                      {f.name}
                                    </span>
                                    <Icon
                                      icon="solar:alt-arrow-right-linear"
                                      className="text-foreground/20 text-xs ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                    />
                                  </button>
                                ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        )}
      </div>

      {openFile && (
        <FileViewerModal file={openFile} onClose={() => setOpenFile(null)} />
      )}
    </div>
  );
}

// ── Instances Tab ─────────────────────────────────────────────────────────────

function InstancesTab({
  instances,
  loading,
  blockId,
  onRefresh,
}: {
  instances: CodeblockInstance[];
  loading: boolean;
  blockId: string;
  onRefresh: () => void;
}) {
  const [uninstallTarget, setUninstallTarget] =
    useState<CodeblockInstance | null>(null);
  const [configureTarget, setConfigureTarget] =
    useState<CodeblockInstance | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader />
      </div>
    );
  }
  if (instances.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState
          icon="solar:layers-minimalistic-linear"
          title="No instances found"
          description="Install this block to create an instance"
        />
      </div>
    );
  }

  return (
    <>
      <div className="h-full overflow-auto p-[20px]">
        <div className="flex flex-col gap-[12px] max-w-[900px]">
          {instances.map((inst) => (
            <div
              key={inst.name}
              className="bg-card border border-border rounded-[4px] p-[16px]"
            >
              <div className="flex items-start justify-between mb-[12px]">
                <div>
                  <div className="flex items-center gap-[10px] mb-[4px]">
                    <span className="font-mono font-bold text-[13px] text-foreground">
                      {inst.shortId}
                    </span>
                    {inst.state > 0 && (
                      <span
                        className={`text-[9px] font-bold uppercase rounded px-[6px] py-[2px] ${STATE_COLOR[inst.state] ?? "text-foreground/50 bg-foreground/5"}`}
                      >
                        {STATE_LABEL[inst.state] ?? "Unknown"}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-foreground/50 font-mono">
                    {inst.package}
                  </p>
                </div>
                <div className="flex items-center gap-[8px]">
                  <button
                    onClick={() => setConfigureTarget(inst)}
                    className="text-[10px] text-foreground/40 hover:text-foreground/70 border border-border rounded px-[10px] py-[4px] transition-colors"
                  >
                    Configure
                  </button>
                  <button
                    onClick={() => setUninstallTarget(inst)}
                    className="text-[10px] text-red-400/70 hover:text-red-400 border border-red-400/20 rounded px-[10px] py-[4px] transition-colors"
                  >
                    Uninstall
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-[12px] text-[11px]">
                {inst.blockVersion && (
                  <div>
                    <p className="text-foreground/30 uppercase text-[9px] font-bold mb-[2px]">
                      Version
                    </p>
                    <p className="text-foreground/70 font-mono">
                      {shortBlockId(inst.blockVersion)}
                    </p>
                  </div>
                )}
                {inst.createTime && (
                  <div>
                    <p className="text-foreground/30 uppercase text-[9px] font-bold mb-[2px]">
                      Installed
                    </p>
                    <p className="text-foreground/70">
                      {formatDate(inst.createTime)}
                    </p>
                  </div>
                )}
                {inst.entitlement && (
                  <div className="col-span-2">
                    <p className="text-foreground/30 uppercase text-[9px] font-bold mb-[2px]">
                      Entitlement
                    </p>
                    <p className="text-foreground/50 font-mono text-[10px] truncate">
                      {inst.entitlement}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {uninstallTarget && (
        <UninstallModal
          instance={uninstallTarget}
          onClose={() => setUninstallTarget(null)}
          onDone={() => {
            setUninstallTarget(null);
            onRefresh();
          }}
        />
      )}

      {configureTarget && (
        <ConfigureModal
          instance={configureTarget}
          blockId={blockId}
          onClose={() => setConfigureTarget(null)}
          onDone={() => {
            setConfigureTarget(null);
            onRefresh();
          }}
        />
      )}
    </>
  );
}

// ── Uninstall Modal ───────────────────────────────────────────────────────────

function UninstallModal({
  instance: inst,
  onClose,
  onDone,
}: {
  instance: CodeblockInstance;
  onClose: () => void;
  onDone: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function doUninstall() {
    setLoading(true);
    setError("");
    (
      ProductService.UninstallCodeblockInstance as (
        name: string,
      ) => Promise<void>
    )(inst.name)
      .then(onDone)
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-[8px] flex flex-col shadow-2xl w-[480px]">
        <div className="flex items-center gap-[12px] px-[24px] py-[18px] border-b border-border">
          <Icon
            icon="solar:trash-bin-minimalistic-linear"
            className="text-red-400 text-lg"
          />
          <div>
            <h2 className="font-mono font-bold text-[13px] text-foreground uppercase">
              Uninstall Instance
            </h2>
            <p className="text-[11px] text-foreground/40 mt-[2px]">
              Configuration is preserved for potential reinstallation.
            </p>
          </div>
        </div>

        <div className="p-[24px] flex flex-col gap-[16px]">
          {error && (
            <div className="p-[10px] bg-red-500/10 border border-red-500/30 rounded-[4px] text-[12px] text-red-400">
              {error}
            </div>
          )}

          <div className="bg-foreground/3 border border-border rounded-[4px] text-[11px] overflow-hidden">
            {[
              { label: "Instance", value: inst.name },
              {
                label: "State",
                value: STATE_LABEL[inst.state] ?? "Unknown",
                color: STATE_COLOR[inst.state],
              },
              { label: "Package", value: inst.package },
              { label: "Block Version", value: inst.blockVersion },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="flex gap-[12px] px-[12px] py-[8px] border-b border-border last:border-0"
              >
                <span className="text-foreground/30 w-[90px] shrink-0">
                  {label}
                </span>
                {color ? (
                  <span
                    className={`text-[9px] font-bold uppercase rounded px-[6px] py-[1px] self-center ${color}`}
                  >
                    {value}
                  </span>
                ) : (
                  <span className="text-foreground/70 font-mono break-all">
                    {value}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-foreground/40 mb-[6px]">
              Type{" "}
              <span className="text-foreground/70 font-mono">
                {inst.shortId}
              </span>{" "}
              to confirm
            </label>
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={inst.shortId}
              disabled={loading}
              className="w-full bg-card border border-border rounded-[4px] px-[12px] py-[8px] text-[12px] text-foreground font-mono focus:outline-none focus:border-red-400/50 transition-colors disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-[8px] px-[24px] py-[16px] border-t border-border">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={doUninstall}
            disabled={confirm !== inst.shortId || loading}
            className="bg-red-500/20 border-red-500/40 text-red-300 hover:bg-red-500/30 hover:border-red-500/60"
            icon={loading ? <Loader size={14} /> : undefined}
          >
            {loading ? "Uninstalling…" : "Uninstall"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Configure (Upgrade) Modal ─────────────────────────────────────────────────

function ConfigureModal({
  instance: inst,
  blockId,
  onClose,
  onDone,
}: {
  instance: CodeblockInstance;
  blockId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [versions, setVersions] = useState<CodeblockVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState(
    inst.blockVersion ?? "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (
      ProductService.ListCodeblockVersions as (
        id: string,
      ) => Promise<CodeblockVersion[]>
    )(blockId)
      .then((list) => {
        const l = list ?? [];
        setVersions(l);
        if (!selectedVersion && l.length > 0) setSelectedVersion(l[0].name);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setVersionsLoading(false));
  }, [blockId]);

  function doUpgrade() {
    if (!selectedVersion) return;
    setLoading(true);
    setError("");
    (
      ProductService.UpgradeCodeblockInstance as (
        name: string,
        version: string,
      ) => Promise<void>
    )(inst.name, selectedVersion)
      .then(onDone)
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-[8px] flex flex-col shadow-2xl w-[480px]">
        <div className="flex items-center justify-between px-[24px] py-[18px] border-b border-border">
          <div>
            <h2 className="font-mono font-bold text-[13px] text-foreground uppercase">
              Configure Installation
            </h2>
            <p className="text-[11px] text-foreground/40 mt-[2px] font-mono">
              {inst.name}
            </p>
          </div>
          {!loading && (
            <button
              onClick={onClose}
              className="text-foreground/40 hover:text-foreground/80 transition-colors p-[4px]"
            >
              <Icon icon="solar:close-circle-linear" className="text-lg" />
            </button>
          )}
        </div>

        <div className="p-[24px] flex flex-col gap-[16px]">
          {error && (
            <div className="p-[10px] bg-red-500/10 border border-red-500/30 rounded-[4px] text-[12px] text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold uppercase text-foreground/40 mb-[6px]">
              Block Version
            </label>
            <FilterSelect
              size="lg"
              value={selectedVersion}
              onChange={setSelectedVersion}
              loading={versionsLoading}
              placeholder="Select version…"
              options={versions.map((v) => ({
                value: v.name,
                label: v.versionTag,
              }))}
            />
            {selectedVersion && selectedVersion === inst.blockVersion && (
              <p className="mt-[6px] text-[10px] text-foreground/30">
                This is the currently installed version.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-[8px] px-[24px] py-[16px] border-t border-border">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={doUpgrade}
            disabled={!selectedVersion || versionsLoading || loading}
            icon={loading ? <Loader size={14} /> : undefined}
          >
            {loading ? "Upgrading…" : "Upgrade"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Help Tab ──────────────────────────────────────────────────────────────────

function HelpTab({ blockId }: { blockId: string }) {
  return (
    <div className="h-full overflow-auto p-[32px]">
      <div className="max-w-[600px] flex flex-col gap-[24px]">
        <div>
          <h2 className="font-mono font-bold text-[14px] text-foreground uppercase mb-[8px]">
            Get Help
          </h2>
          <p className="text-[12px] text-foreground/60 leading-[1.6]">
            Have questions about this block or need support? Use the links below
            to get in touch or report an issue.
          </p>
        </div>

        <div className="flex flex-col gap-[8px]">
          <HelpLink
            icon="solar:chat-line-linear"
            title="Share Feedback"
            desc="Send feedback to the block maintainers"
          />
          <HelpLink
            icon="solar:bug-linear"
            title="Report an Issue"
            desc="Create a bug report or feature request"
          />
          <HelpLink
            icon="solar:document-text-linear"
            title="View Documentation"
            desc={`Documentation for blocks/${blockId}`}
          />
        </div>
      </div>
    </div>
  );
}

function HelpLink({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <button className="flex items-center gap-[16px] bg-card border border-border rounded-[4px] p-[16px] text-left hover:border-foreground/30 transition-colors group w-full">
      <Icon
        icon={icon}
        className="text-xl text-foreground/40 group-hover:text-foreground/70 shrink-0 transition-colors"
      />
      <div className="flex-1">
        <p className="text-[12px] text-foreground font-bold mb-[2px]">
          {title}
        </p>
        <p className="text-[11px] text-foreground/40">{desc}</p>
      </div>
      <Icon
        icon="solar:arrow-right-linear"
        className="text-foreground/20 group-hover:text-foreground/50 transition-colors"
      />
    </button>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab({
  blockId,
  block,
  versions,
  instances,
  plans,
  plansLoading,
  onNavigate,
}: {
  blockId: string;
  block: Codeblock | null;
  versions: CodeblockVersion[];
  instances: CodeblockInstance[];
  plans: BlockPlan[];
  plansLoading: boolean;
  onNavigate: (tab: Tab) => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="flex-1 overflow-y-auto p-[32px] flex flex-col gap-[32px]">
      {/* Resources */}
      <section>
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-foreground/40 mb-[16px]">
          Resources
        </h2>
        <div className="grid grid-cols-3 gap-[16px]">
          {[
            {
              label: "Block Versions",
              count: versions.length,
              tab: "versions" as Tab,
            },
            { label: "Entitlements", count: 0, tab: null },
            {
              label: "Instances",
              count: instances.length,
              tab: "instances" as Tab,
            },
          ].map(({ label, count, tab }) => (
            <button
              key={label}
              onClick={() => tab && onNavigate(tab)}
              disabled={!tab}
              className="bg-card border border-border rounded-[8px] p-[20px] text-left hover:border-foreground/30 transition-colors disabled:cursor-default disabled:hover:border-border group"
            >
              <p className="text-[11px] text-foreground/40 mb-[8px]">{label}</p>
              <div className="flex items-center justify-between">
                <span className="text-[28px] font-bold text-foreground font-mono">
                  {count}
                </span>
                {tab && (
                  <Icon
                    icon="solar:arrow-right-linear"
                    className="text-foreground/20 group-hover:text-foreground/50 transition-colors"
                  />
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Plans */}
      <section>
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-foreground/40 mb-[4px]">
          Plans
        </h2>
        <p className="text-[11px] text-foreground/30 mb-[16px]">
          Configure Plans as usage models for the block. At least one Plan must
          be configured before sharing the block.
        </p>
        {plansLoading ? (
          <div className="flex items-center gap-[8px] text-[11px] text-foreground/40">
            <Loader size={14} />
            <span>Loading plans…</span>
          </div>
        ) : plans.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-[8px] p-[24px] text-center">
            <p className="text-[12px] text-foreground/30">
              No plans configured.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-[12px]">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className="bg-card border border-border rounded-[8px] p-[20px]"
              >
                <p className="text-[13px] font-bold text-foreground mb-[4px]">
                  {plan.displayName || plan.name}
                </p>
                <p className="text-[11px] text-foreground/40 font-mono break-all">
                  {plan.name}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Manage */}
      <section>
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-foreground/40 mb-[16px]">
          Manage
        </h2>
        <div className="bg-card border border-red-500/20 rounded-[8px] p-[20px] flex items-center justify-between">
          <div>
            <p className="text-[12px] font-bold text-red-400 mb-[2px]">
              Delete Block
            </p>
            <p className="text-[11px] text-foreground/30">
              Permanently delete this block and all associated data. This action
              cannot be undone.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => setDeleteOpen(true)}
            className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500/60 shrink-0 ml-[24px]"
            icon={
              <Icon
                icon="solar:trash-bin-minimalistic-linear"
                className="mr-[6px]"
              />
            }
          >
            Delete Block
          </Button>
        </div>
      </section>

      {deleteOpen && (
        <DeleteBlockModal
          blockId={blockId}
          block={block}
          onClose={() => setDeleteOpen(false)}
          onDone={() => navigate("/codeblocks")}
        />
      )}
    </div>
  );
}

// ── Delete Block Modal ────────────────────────────────────────────────────────

function DeleteBlockModal({
  blockId,
  block,
  onClose,
  onDone,
}: {
  blockId: string;
  block: Codeblock | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function doDelete() {
    setLoading(true);
    setError("");
    (ProductService.DeleteCodeblock as (id: string) => Promise<void>)(blockId)
      .then(onDone)
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-[8px] flex flex-col shadow-2xl w-[480px]">
        <div className="flex items-center gap-[12px] px-[24px] py-[18px] border-b border-border">
          <Icon
            icon="solar:trash-bin-minimalistic-linear"
            className="text-red-400 text-lg"
          />
          <div>
            <h2 className="font-mono font-bold text-[13px] text-foreground uppercase">
              Delete Block
            </h2>
            <p className="text-[11px] text-foreground/40 mt-[2px]">
              This action is permanent and cannot be undone.
            </p>
          </div>
        </div>

        <div className="p-[24px] flex flex-col gap-[16px]">
          {error && (
            <div className="p-[10px] bg-red-500/10 border border-red-500/30 rounded-[4px] text-[12px] text-red-400">
              {error}
            </div>
          )}

          <div className="bg-foreground/3 border border-border rounded-[4px] text-[11px] overflow-hidden">
            {[
              { label: "Block ID", value: blockId },
              { label: "Display Name", value: block?.displayName ?? "—" },
              { label: "Resource", value: `blocks/${blockId}` },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex gap-[12px] px-[12px] py-[8px] border-b border-border last:border-0"
              >
                <span className="text-foreground/30 w-[90px] shrink-0">
                  {label}
                </span>
                <span className="text-foreground/70 font-mono break-all">
                  {value}
                </span>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-foreground/40 mb-[6px]">
              Type{" "}
              <span className="text-foreground/70 font-mono normal-case">
                {blockId}
              </span>{" "}
              to confirm
            </label>
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={blockId}
              disabled={loading}
              className="w-full bg-card border border-border rounded-[4px] px-[12px] py-[8px] text-[12px] text-foreground font-mono focus:outline-none focus:border-red-400/50 transition-colors disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-[8px] px-[24px] py-[16px] border-t border-border">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={doDelete}
            disabled={
              confirm.toLowerCase() !== blockId.toLowerCase() || loading
            }
            className="bg-red-500/20 border-red-500/40 text-red-300 hover:bg-red-500/30 hover:border-red-500/60"
            icon={loading ? <Loader size={14} /> : undefined}
          >
            {loading ? "Deleting…" : "Delete Block"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Access Tab ────────────────────────────────────────────────────────────────

interface BlockRole {
  name: string;
  title: string;
}

function AccessRoleBadge({ roleLabel }: { roleLabel: string }) {
  switch (roleLabel) {
    case "Admin":
      return (
        <span className="inline-flex items-center gap-[4px] px-[8px] py-[2px] rounded-[4px] bg-[rgba(10,132,255,0.12)] border border-[rgba(10,132,255,0.25)]">
          <Icon
            icon="solar:shield-keyhole-linear"
            className="text-info text-[10px]"
          />
          <span className="text-[10px] font-bold font-mono text-info">
            Admin
          </span>
        </span>
      );
    case "Contributor":
      return (
        <span className="inline-flex items-center gap-[4px] px-[8px] py-[2px] rounded-[4px] bg-[rgba(52,199,89,0.12)] border border-[rgba(52,199,89,0.25)]">
          <Icon icon="solar:users-group-rounded-linear" className="text-success text-[10px]" />
          <span className="text-[10px] font-bold font-mono text-success">
            Contributor
          </span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-[4px] px-[8px] py-[2px] rounded-[4px] bg-foreground/[6%] border border-foreground/10">
          <Icon
            icon="solar:key-linear"
            className="text-foreground/40 text-[10px]"
          />
          <span className="text-[10px] font-bold font-mono text-foreground/40">
            {roleLabel || "Unknown"}
          </span>
        </span>
      );
  }
}

function MemberAvatar({ name, photoUrl }: { name: string; photoUrl: string }) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className="size-[32px] rounded-full object-cover shrink-0 border border-foreground/10"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="size-[32px] rounded-full bg-brand-fill/20 border border-brand-fill/30 flex items-center justify-center shrink-0">
      <span className="text-[11px] font-bold text-brand">
        {initials || "?"}
      </span>
    </div>
  );
}

interface AccountUser {
  name: string;
  displayName: string;
  email: string;
  photoUrl: string;
}

function AccessTab({
  blockId,
  data,
  loading,
  error,
  isOwner,
  onRefresh,
}: {
  blockId: string;
  data: BlockAccessData | null;
  loading: boolean;
  error: string | null;
  isOwner: boolean;
  onRefresh: () => void;
}) {
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [accountUsers, setAccountUsers] = useState<AccountUser[]>([]);
  const [blockRoles, setBlockRoles] = useState<BlockRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AccountUser | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [addRole, setAddRole] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");

  // Role change for existing members
  const [changingRoleMember, setChangingRoleMember] =
    useState<BlockAccessMember | null>(null);
  const [changeRole, setChangeRole] = useState("");
  const [changeRoleLoading, setChangeRoleLoading] = useState(false);
  const [changeRoleError, setChangeRoleError] = useState("");

  function fetchRoles(onError?: (e: string) => void) {
    if (blockRoles.length > 0) return;
    setRolesLoading(true);
    (
      ProductService.ListBlockRoles as (blockId: string) => Promise<BlockRole[]>
    )(blockId)
      .then((list) => {
        const roles = list ?? [];
        setBlockRoles(roles);
        if (roles.length > 0 && !addRole)
          setAddRole(roles[roles.length - 1].name);
      })
      .catch((e) => (onError ?? setAddError)(String(e)))
      .finally(() => setRolesLoading(false));
  }

  function openAddModal() {
    setAddOpen(true);
    setSelectedUser(null);
    setUserSearch("");
    setAddError("");
    fetchRoles(setAddError);
    if (accountUsers.length === 0) {
      setUsersLoading(true);
      (ProductService.ListAccountUsers as () => Promise<AccountUser[]>)()
        .then((list) => setAccountUsers(list ?? []))
        .catch((e) => setAddError(String(e)))
        .finally(() => setUsersLoading(false));
    }
  }

  function openChangeRoleModal(m: BlockAccessMember) {
    setChangingRoleMember(m);
    setChangeRole(m.role);
    setChangeRoleError("");
    fetchRoles(setChangeRoleError);
  }

  function doChangeRole() {
    if (
      !changingRoleMember ||
      !changeRole ||
      changeRole === changingRoleMember.role
    )
      return;
    setChangeRoleLoading(true);
    setChangeRoleError("");
    // Remove from old role then add to new role
    (
      ProductService.UpdateBlockAccess as (
        blockId: string,
        role: string,
        member: string,
        grant: boolean,
      ) => Promise<void>
    )(blockId, changingRoleMember.role, changingRoleMember.member, false)
      .then(() =>
        (
          ProductService.UpdateBlockAccess as (
            blockId: string,
            role: string,
            member: string,
            grant: boolean,
          ) => Promise<void>
        )(blockId, changeRole, changingRoleMember.member, true),
      )
      .then(() => {
        setChangingRoleMember(null);
        setChangeRoleLoading(false);
        onRefresh();
      })
      .catch((e) => {
        setChangeRoleError(String(e));
        setChangeRoleLoading(false);
      });
  }

  function removeMember(member: BlockAccessMember) {
    setRemovingMember(member.member);
    setRemoveError("");
    (
      ProductService.UpdateBlockAccess as (
        blockId: string,
        role: string,
        member: string,
        grant: boolean,
      ) => Promise<void>
    )(blockId, member.role, member.member, false)
      .then(() => {
        setRemovingMember(null);
        onRefresh();
      })
      .catch((e) => {
        setRemoveError(String(e));
        setRemovingMember(null);
      });
  }

  function doAddMember() {
    if (!selectedUser) return;
    // "users/abc123" → "user:abc123" (IAM member format)
    const memberStr = "user:" + selectedUser.name.replace(/^users\//, "");
    setAddLoading(true);
    setAddError("");
    (
      ProductService.UpdateBlockAccess as (
        blockId: string,
        role: string,
        member: string,
        grant: boolean,
      ) => Promise<void>
    )(blockId, addRole, memberStr, true)
      .then(() => {
        setAddOpen(false);
        setAddLoading(false);
        onRefresh();
      })
      .catch((e) => {
        setAddError(String(e));
        setAddLoading(false);
      });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="p-[16px] bg-red-500/10 border border-red-500/30 rounded-[6px] max-w-[400px]">
          <div className="flex items-center gap-[8px] mb-[8px]">
            <Icon
              icon="solar:close-circle-linear"
              className="text-red-400 text-lg"
            />
            <p className="text-[12px] font-bold text-foreground">
              Failed to load access data
            </p>
          </div>
          <p className="text-[11px] text-foreground/60">{error}</p>
          <button
            onClick={onRefresh}
            className="mt-[10px] text-[10px] text-brand hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const members = data?.members ?? [];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-[20px] py-[10px] border-b border-border shrink-0">
        <div className="flex items-center gap-[8px]">
          <button
            onClick={onRefresh}
            className="flex items-center gap-[4px] px-[8px] h-[28px] text-foreground/40 hover:text-foreground/70 transition-colors text-[10px] rounded border border-transparent hover:border-border"
            title="Refresh"
          >
            <Icon icon="solar:refresh-linear" className="text-sm" />
          </button>
          <span className="text-[10px] text-foreground/30 font-mono">
            {members.length} {members.length === 1 ? "member" : "members"}
          </span>
        </div>
        {isOwner && (
          <Button
            variant="primary"
            onClick={openAddModal}
            icon={<Icon icon="solar:user-plus-linear" className="mr-[6px]" />}
          >
            Add Member
          </Button>
        )}
      </div>

      {/* Member list */}
      <div className="flex-1 overflow-auto">
        {removeError && (
          <div className="mx-[20px] mt-[12px] p-[10px] bg-red-500/10 border border-red-500/30 rounded-[4px] text-[11px] text-red-400">
            {removeError}
          </div>
        )}

        {members.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-[10px] pt-[60px]">
            <Icon
              icon="solar:users-group-rounded-linear"
              className="text-foreground/20 text-4xl"
            />
            <p className="text-[12px] text-foreground/30">
              No members with explicit access
            </p>
          </div>
        ) : (
          <div className="px-[20px] py-[12px] flex flex-col gap-[4px]">
            {members.map((m, i) => (
              <div
                key={`${m.member}-${i}`}
                className="flex items-center gap-[12px] px-[16px] py-[12px] bg-card border border-border rounded-[4px] hover:border-foreground/20 transition-colors group"
              >
                <MemberAvatar name={m.displayName} photoUrl={m.photoUrl} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-foreground leading-tight truncate">
                    {m.displayName || m.member}
                  </p>
                  {m.email && (
                    <p className="text-[10px] font-mono text-foreground/40 truncate">
                      {m.email}
                    </p>
                  )}
                  {!m.email && m.displayName !== m.member && (
                    <p className="text-[10px] font-mono text-foreground/30 truncate">
                      {m.member}
                    </p>
                  )}
                </div>
                {isOwner ? (
                  <button
                    onClick={() => openChangeRoleModal(m)}
                    className="opacity-60 group-hover:opacity-100 transition-opacity hover:scale-105"
                    title="Change role"
                  >
                    <AccessRoleBadge roleLabel={m.roleLabel} />
                  </button>
                ) : (
                  <AccessRoleBadge roleLabel={m.roleLabel} />
                )}
                {isOwner && (
                  <button
                    onClick={() => removeMember(m)}
                    disabled={removingMember === m.member}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-foreground/30 hover:text-red-400 disabled:opacity-50 p-[4px] rounded"
                    title="Remove member"
                  >
                    {removingMember === m.member ? (
                      <Loader size={14} />
                    ) : (
                      <Icon
                        icon="solar:trash-bin-minimalistic-linear"
                        className="text-sm"
                      />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Member Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-[8px] flex flex-col shadow-2xl w-[480px] max-h-[80vh]">
            <div className="flex items-center justify-between px-[24px] py-[18px] border-b border-border shrink-0">
              <div>
                <h2 className="font-mono font-bold text-[13px] text-foreground uppercase">
                  Add Member
                </h2>
                <p className="text-[11px] text-foreground/40 mt-[2px]">
                  Grant access to this block
                </p>
              </div>
              <button
                onClick={() => setAddOpen(false)}
                className="text-foreground/40 hover:text-foreground/80 transition-colors p-[4px]"
              >
                <Icon icon="solar:close-circle-linear" className="text-lg" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-[24px] flex flex-col gap-[16px]">
              {addError && (
                <div className="p-[10px] bg-red-500/10 border border-red-500/30 rounded-[4px] text-[12px] text-red-400">
                  {addError}
                </div>
              )}

              {/* User picker */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-foreground/40 mb-[6px]">
                  User
                </label>
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  disabled={addLoading}
                  className="w-full bg-card border border-border rounded-[4px] px-[12px] py-[8px] text-[12px] text-foreground focus:outline-none focus:border-brand-fill transition-colors disabled:opacity-50 placeholder:text-foreground/20 mb-[6px]"
                />
                <div className="border border-border rounded-[4px] overflow-hidden max-h-[200px] overflow-y-auto">
                  {usersLoading ? (
                    <div className="flex items-center justify-center py-[20px]">
                      <Loader size={16} />
                    </div>
                  ) : accountUsers.filter((u) => {
                      const q = userSearch.toLowerCase();
                      return (
                        !q ||
                        u.displayName.toLowerCase().includes(q) ||
                        u.email.toLowerCase().includes(q)
                      );
                    }).length === 0 ? (
                    <div className="py-[12px] px-[12px] text-[11px] text-foreground/30 text-center">
                      {accountUsers.length === 0
                        ? "No users found"
                        : "No matches"}
                    </div>
                  ) : (
                    accountUsers
                      .filter((u) => {
                        const q = userSearch.toLowerCase();
                        return (
                          !q ||
                          u.displayName.toLowerCase().includes(q) ||
                          u.email.toLowerCase().includes(q)
                        );
                      })
                      .map((u) => (
                        <button
                          key={u.name}
                          onClick={() => setSelectedUser(u)}
                          disabled={addLoading}
                          className={`w-full flex items-center gap-[10px] px-[12px] py-[10px] border-b border-border last:border-0 text-left transition-colors ${
                            selectedUser?.name === u.name
                              ? "bg-brand-fill/8"
                              : "hover:bg-foreground/[3%]"
                          }`}
                        >
                          <MemberAvatar
                            name={u.displayName}
                            photoUrl={u.photoUrl}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] text-foreground font-semibold truncate">
                              {u.displayName}
                            </p>
                            <p className="text-[10px] text-foreground/40 font-mono truncate">
                              {u.email}
                            </p>
                          </div>
                          {selectedUser?.name === u.name && (
                            <Icon
                              icon="solar:check-circle-bold"
                              className="text-brand text-base shrink-0"
                            />
                          )}
                        </button>
                      ))
                  )}
                </div>
              </div>

              {/* Role picker */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-foreground/40 mb-[6px]">
                  Role
                </label>
                {rolesLoading ? (
                  <div className="flex items-center justify-center py-[16px]">
                    <Loader size={16} />
                  </div>
                ) : (
                  <div className="flex flex-col gap-[6px]">
                    {blockRoles.map((r) => (
                      <button
                        key={r.name}
                        onClick={() => setAddRole(r.name)}
                        disabled={addLoading}
                        className={`flex items-center gap-[10px] px-[12px] py-[10px] border rounded-[4px] text-left transition-all disabled:opacity-50 ${
                          addRole === r.name
                            ? "border-brand-fill bg-brand-fill/6"
                            : "border-border bg-foreground/2 hover:border-foreground/30"
                        }`}
                      >
                        <div
                          className={`w-[14px] h-[14px] rounded-full border-2 flex items-center justify-center shrink-0 ${
                            addRole === r.name
                              ? "border-brand-fill"
                              : "border-foreground/30"
                          }`}
                        >
                          {addRole === r.name && (
                            <div className="w-[6px] h-[6px] rounded-full bg-brand-fill" />
                          )}
                        </div>
                        <AccessRoleBadge roleLabel={r.title} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-[8px] px-[24px] py-[16px] border-t border-border shrink-0">
              <Button
                variant="secondary"
                onClick={() => setAddOpen(false)}
                disabled={addLoading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={doAddMember}
                disabled={!selectedUser || !addRole || addLoading}
                icon={addLoading ? <Loader size={14} /> : undefined}
              >
                {addLoading ? "Adding…" : "Add Member"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Change Role Modal */}
      {changingRoleMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-[8px] flex flex-col shadow-2xl w-[400px]">
            <div className="flex items-center justify-between px-[24px] py-[18px] border-b border-border">
              <div>
                <h2 className="font-mono font-bold text-[13px] text-foreground uppercase">
                  Change Role
                </h2>
                <p className="text-[11px] text-foreground/40 mt-[2px]">
                  {changingRoleMember.displayName || changingRoleMember.member}
                </p>
              </div>
              <button
                onClick={() => setChangingRoleMember(null)}
                className="text-foreground/40 hover:text-foreground/80 transition-colors p-[4px]"
              >
                <Icon icon="solar:close-circle-linear" className="text-lg" />
              </button>
            </div>

            <div className="p-[24px] flex flex-col gap-[12px]">
              {changeRoleError && (
                <div className="p-[10px] bg-red-500/10 border border-red-500/30 rounded-[4px] text-[12px] text-red-400">
                  {changeRoleError}
                </div>
              )}
              {rolesLoading ? (
                <div className="flex items-center justify-center py-[16px]">
                  <Loader size={16} />
                </div>
              ) : (
                <div className="flex flex-col gap-[6px]">
                  {blockRoles.map((r) => (
                    <button
                      key={r.name}
                      onClick={() => setChangeRole(r.name)}
                      disabled={changeRoleLoading}
                      className={`flex items-center gap-[10px] px-[12px] py-[10px] border rounded-[4px] text-left transition-all disabled:opacity-50 ${
                        changeRole === r.name
                          ? "border-brand-fill bg-brand-fill/6"
                          : "border-border bg-foreground/2 hover:border-foreground/30"
                      }`}
                    >
                      <div
                        className={`w-[14px] h-[14px] rounded-full border-2 flex items-center justify-center shrink-0 ${
                          changeRole === r.name
                            ? "border-brand-fill"
                            : "border-foreground/30"
                        }`}
                      >
                        {changeRole === r.name && (
                          <div className="w-[6px] h-[6px] rounded-full bg-brand-fill" />
                        )}
                      </div>
                      <AccessRoleBadge roleLabel={r.title} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-[8px] px-[24px] py-[16px] border-t border-border">
              <Button
                variant="secondary"
                onClick={() => setChangingRoleMember(null)}
                disabled={changeRoleLoading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={doChangeRole}
                disabled={
                  !changeRole ||
                  changeRole === changingRoleMember.role ||
                  changeRoleLoading
                }
                icon={changeRoleLoading ? <Loader size={14} /> : undefined}
              >
                {changeRoleLoading ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
