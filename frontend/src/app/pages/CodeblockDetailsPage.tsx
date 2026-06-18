import React, { useState, useEffect, useCallback, useRef } from 'react';
import { codeToHtml } from 'shiki';
import { useParams, useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { marked } from 'marked';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
import { Events } from '@wailsio/runtime';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';
import * as GitService from '../../../bindings/alis-hub-v3/gitservice';
import { Loader } from '../components/Loader';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { FilterSelect } from '../components/FilterSelect';
import { BuildTerminal, type BuildTerminalHandle } from '../components/BuildTerminal';

const LEVEL_LABEL: Record<number, string> = {
  1: 'Experimental',
  2: 'Alpha',
  3: 'Beta',
  4: 'Release Candidate',
  5: 'Stable',
};

const LEVEL_COLOR: Record<number, string> = {
  1: 'text-red-400 border-red-400/30 bg-red-400/10',
  2: 'text-orange-400 border-orange-400/30 bg-orange-400/10',
  3: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
  4: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
  5: 'text-green-400 border-green-400/30 bg-green-400/10',
};

const STATE_LABEL: Record<number, string> = { 1: 'Pending', 2: 'Deploying', 3: 'Active', 4: 'Error' };
const STATE_COLOR: Record<number, string> = {
  1: 'text-yellow-400 bg-yellow-400/10',
  2: 'text-blue-400 bg-blue-400/10',
  3: 'text-green-400 bg-green-400/10',
  4: 'text-red-400 bg-red-400/10',
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
  files: Array<{ name: string; files: Array<{ name: string; content: string }> }>;
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

// ── Install wizard types ──────────────────────────────────────────────────────

interface InstallOrg { name: string; displayName: string; }
interface InstallProduct { name: string; displayName: string; }
interface InstallNeuron { name: string; displayName: string; package: string; }
interface BlockPlan { name: string; displayName: string; }

interface ConflictHunk {
  index: number;
  before: string[];
  current: string[];
  incoming: string[];
  after: string[];
}

interface ConflictFileContent {
  path: string;
  hunks: ConflictHunk[];
}

const TABS = ['documentation', 'versions', 'instances', 'help'] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  documentation: 'Documentation',
  versions: 'Versions',
  instances: 'Instances',
  help: 'Help',
};

function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function shortBlockId(blockVersion: string): string {
  const parts = blockVersion.split('/');
  return parts[parts.length - 1] || blockVersion;
}

export function CodeblockDetailsPage() {
  const { id, tab } = useParams<{ id: string; tab?: string }>();
  const navigate = useNavigate();
  const activeTab: Tab = (TABS.includes(tab as Tab) ? tab : 'documentation') as Tab;

  const [block, setBlock] = useState<Codeblock | null>(null);
  const [members, setMembers] = useState<CodeblockMember[]>([]);
  const [blockLoading, setBlockLoading] = useState(true);
  const [myAccountID, setMyAccountID] = useState('');

  const [versions, setVersions] = useState<CodeblockVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<CodeblockVersion | null>(null);

  const [doc, setDoc] = useState('');
  const [agentDoc, setAgentDoc] = useState('');
  const [docAudience, setDocAudience] = useState<'user' | 'agent'>('user');
  const [docLoading, setDocLoading] = useState(false);

  const [instances, setInstances] = useState<CodeblockInstance[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(false);

  const blockId = id ?? '';

  // Install Block wizard state
  const [installOpen, setInstallOpen] = useState(false);

  const go = useCallback((t: Tab) => navigate(`/codeblocks/${blockId}/${t}`), [blockId, navigate]);

  // Load block metadata + members + caller account on mount
  useEffect(() => {
    if (!blockId) return;
    setBlockLoading(true);
    Promise.all([
      (ProductService.GetCodeblock as (id: string) => Promise<Codeblock>)(blockId),
      (ProductService.GetCodeblockMembers as (id: string) => Promise<CodeblockMember[]>)(blockId).catch(() => [] as CodeblockMember[]),
      (ProductService.GetMyPrimaryAccountID as () => Promise<string>)().catch(() => ''),
    ]).then(([b, m, accountID]) => {
      setBlock(b);
      setMembers(m ?? []);
      setMyAccountID(accountID ?? '');
    }).catch(console.error).finally(() => setBlockLoading(false));
  }, [blockId]);

  // Lazy load versions
  useEffect(() => {
    if (activeTab !== 'versions' || versions.length > 0) return;
    setVersionsLoading(true);
    (ProductService.ListCodeblockVersions as (id: string) => Promise<CodeblockVersion[]>)(blockId)
      .then(v => {
        const list = v ?? [];
        setVersions(list);
        if (list.length > 0) setSelectedVersion(list[0]);
      })
      .catch(console.error)
      .finally(() => setVersionsLoading(false));
  }, [activeTab, blockId, versions.length]);

  // Lazy load documentation
  useEffect(() => {
    if (activeTab !== 'documentation' || doc !== '') return;
    setDocLoading(true);
    // Get versions first to find the latest version name
    (ProductService.ListCodeblockVersions as (id: string) => Promise<CodeblockVersion[]>)(blockId)
      .then(vList => {
        const list = vList ?? [];
        if (!selectedVersion && list.length > 0) setSelectedVersion(list[0]);
        const versionName = list[0]?.name;
        if (!versionName) return;
        return Promise.all([
          (ProductService.GetCodeblockDoc as (v: string, a: string) => Promise<string>)(versionName, 'user'),
          (ProductService.GetCodeblockDoc as (v: string, a: string) => Promise<string>)(versionName, 'agent'),
        ]).then(([u, a]) => {
          setDoc(u ?? '');
          setAgentDoc(a ?? '');
        });
      })
      .catch(console.error)
      .finally(() => setDocLoading(false));
  }, [activeTab, blockId, doc, selectedVersion]);

  // Lazy load instances
  useEffect(() => {
    if (activeTab !== 'instances' || instances.length > 0) return;
    setInstancesLoading(true);
    (ProductService.ListCodeblockInstances as (id: string) => Promise<CodeblockInstance[]>)(blockId)
      .then(v => setInstances(v ?? []))
      .catch(console.error)
      .finally(() => setInstancesLoading(false));
  }, [activeTab, blockId, instances.length]);

  const publisherLabel = block?.publisher
    ? block.publisher.replace('accounts/', '')
    : 'Alis Exchange';

  const isOwner = Boolean(myAccountID && block?.publisher === myAccountID);

  return (
    <div className="flex-1 overflow-hidden flex flex-row bg-[#1e1e1e]">
      {/* Sidebar */}
      <div className="w-[280px] shrink-0 flex flex-col border-r border-[#464646]">
        {/* Back */}
        <button
          onClick={() => navigate('/codeblocks')}
          className="flex items-center gap-[8px] px-[16px] py-[12px] text-[11px] text-white/50 hover:text-white/80 border-b border-[#464646] transition-colors"
        >
          <Icon icon="solar:arrow-left-linear" />
          All Blocks
        </button>

        <div className="flex-1 overflow-auto p-[16px] flex flex-col gap-[16px]">
          {blockLoading ? (
            <div className="flex items-center justify-center py-[40px]"><Loader /></div>
          ) : block ? (
            <>
              {/* Title + badge */}
              <div>
                <h1 className="font-['JetBrains_Mono',sans-serif] font-bold text-[15px] text-white uppercase leading-[1.3] mb-[8px]">
                  {block.displayName}
                </h1>
                {block.releaseLevel > 0 && (
                  <span className={`text-[9px] font-bold uppercase border rounded px-[6px] py-[2px] ${LEVEL_COLOR[block.releaseLevel] ?? 'text-white/50 border-white/10 bg-white/5'}`}>
                    {LEVEL_LABEL[block.releaseLevel] ?? 'Unknown'}
                  </span>
                )}
              </div>

              <p className="text-[12px] text-white/60 leading-[1.5]">
                {block.headline || block.description}
              </p>

              {/* Meta */}
              <div className="bg-white/3 border border-[#464646] rounded-[4px] overflow-hidden text-[11px]">
                {block.latestVersion && (
                  <div className="px-[12px] py-[10px] border-b border-[#464646]">
                    <p className="text-white/40 uppercase text-[9px] font-bold mb-[2px]">Latest Version</p>
                    <p className="text-white font-['JetBrains_Mono',sans-serif]">{block.latestVersion}</p>
                  </div>
                )}
                <div className="px-[12px] py-[10px] border-b border-[#464646]">
                  <p className="text-white/40 uppercase text-[9px] font-bold mb-[2px]">Publisher</p>
                  <p className="text-white font-['JetBrains_Mono',sans-serif] truncate">{publisherLabel}</p>
                </div>
                <div className="px-[12px] py-[10px]">
                  <p className="text-white/40 uppercase text-[9px] font-bold mb-[2px]">Installs</p>
                  <p className="text-white font-['JetBrains_Mono',sans-serif]">{block.installCount ?? 0}</p>
                </div>
              </div>

              {/* Members */}
              {members.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase text-white/40 mb-[10px]">Members</p>
                  <div className="flex -space-x-2">
                    {members.map(m => (
                      <img
                        key={m.name}
                        src={m.photoUrl}
                        alt={m.displayName}
                        title={m.displayName}
                        className="size-[32px] rounded-full border-2 border-[#1e1e1e] object-cover bg-[#2c2c2c]"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* CTA */}
        <div className="p-[10px] border-t border-[#464646] flex flex-col gap-[8px]">
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
            </>
          ) : (
            <Button
              variant="secondary"
              className="w-full"
              icon={<Icon icon="solar:box-linear" />}
              onClick={() => go('instances')}
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
          onDone={() => { setInstallOpen(false); setInstances([]); go('instances'); }}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center border-b border-[#464646] shrink-0">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => go(t)}
              className={`px-[24px] py-[12px] text-[11px] font-bold uppercase tracking-wider transition-all relative ${
                activeTab === t ? 'text-[#f881a9]' : 'text-white/40 hover:text-white/70'
              }`}
            >
              {TAB_LABEL[t]}
              {activeTab === t && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#f881a9]" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'documentation' && (
            <DocumentationTab
              doc={doc}
              agentDoc={agentDoc}
              loading={docLoading}
              audience={docAudience}
              onAudienceChange={setDocAudience}
            />
          )}
          {activeTab === 'versions' && (
            <VersionsTab
              versions={versions}
              loading={versionsLoading}
              selected={selectedVersion}
              onSelect={setSelectedVersion}
            />
          )}
          {activeTab === 'instances' && (
            <InstancesTab
              instances={instances}
              loading={instancesLoading}
              blockId={blockId}
              onRefresh={() => setInstances([])}
            />
          )}
          {activeTab === 'help' && <HelpTab blockId={blockId} />}
        </div>
      </div>
    </div>
  );
}

// ── Install Block Wizard ──────────────────────────────────────────────────────

type InstallStep = 'location' | 'plan' | 'configure' | 'installing' | 'merge' | 'done';
type MergePhase = 'ready' | 'merging' | 'conflicts' | 'done';

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
  const [step, setStep] = useState<InstallStep>('location');
  const [error, setError] = useState('');

  // Location step
  const [orgs, setOrgs] = useState<InstallOrg[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [products, setProducts] = useState<InstallProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [neurons, setNeurons] = useState<InstallNeuron[]>([]);
  const [neuronsLoading, setNeuronsLoading] = useState(false);
  const [selectedNeuron, setSelectedNeuron] = useState<InstallNeuron | null>(null);

  // Plan step
  const [plans, setPlans] = useState<BlockPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<BlockPlan | null>(null);

  // Configure step
  const [versions, setVersions] = useState<CodeblockVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [buildFolder, setBuildFolder] = useState('./');
  const [selectedVersion, setSelectedVersion] = useState('');

  // Merge step
  const [mergePhase, setMergePhase] = useState<MergePhase>('ready');
  const [branchName, setBranchName] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [defineRepoPath, setDefineRepoPath] = useState('');
  const [conflictFiles, setConflictFiles] = useState<string[]>([]);
  const [selectedConflictFile, setSelectedConflictFile] = useState('');
  const [conflictContent, setConflictContent] = useState<ConflictFileContent | null>(null);
  // hunkResolutions[file][hunkIdx] = resolved lines | null (unresolved)
  const [hunkResolutions, setHunkResolutions] = useState<Record<string, (string[] | null)[]>>({});
  const [resolvedFiles, setResolvedFiles] = useState<Set<string>>(new Set());
  const [mergeError, setMergeError] = useState('');
  const mergeTermRef = useRef<BuildTerminalHandle>(null);

  // Load orgs on mount
  useEffect(() => {
    setOrgsLoading(true);
    (ProductService.ListInstallOrgs as () => Promise<InstallOrg[]>)()
      .then(list => setOrgs(list ?? []))
      .catch(e => setError(String(e)))
      .finally(() => setOrgsLoading(false));
  }, []);

  // Load products when org selected
  useEffect(() => {
    if (!selectedOrg) return;
    setSelectedProduct('');
    setSelectedNeuron(null);
    setNeurons([]);
    setProductsLoading(true);
    const orgId = selectedOrg.replace('organisations/', '');
    (ProductService.ListProducts as (org: string) => Promise<InstallProduct[]>)(orgId)
      .then(list => setProducts(list ?? []))
      .catch(e => setError(String(e)))
      .finally(() => setProductsLoading(false));
  }, [selectedOrg]);

  // Load neurons when product selected
  useEffect(() => {
    if (!selectedOrg || !selectedProduct) return;
    setSelectedNeuron(null);
    setNeuronsLoading(true);
    const orgId = selectedOrg.replace('organisations/', '');
    const productId = selectedProduct.replace(/.*\/products\//, '');
    (ProductService.ListInstallNeurons as (org: string, product: string) => Promise<InstallNeuron[]>)(orgId, productId)
      .then(list => setNeurons(list ?? []))
      .catch(e => setError(String(e)))
      .finally(() => setNeuronsLoading(false));
  }, [selectedOrg, selectedProduct]);

  function goToPlan() {
    if (!selectedNeuron) return;
    setError('');
    setPlansLoading(true);
    setStep('plan');
    (ProductService.ListBlockPlans as (id: string) => Promise<BlockPlan[]>)(blockId)
      .then(list => {
        const l = list ?? [];
        setPlans(l);
        if (l.length === 1) setSelectedPlan(l[0]);
      })
      .catch(e => setError(String(e)))
      .finally(() => setPlansLoading(false));
  }

  function goToConfigure() {
    if (!selectedPlan) return;
    setError('');
    setVersionsLoading(true);
    setStep('configure');
    (ProductService.ListCodeblockVersions as (id: string) => Promise<CodeblockVersion[]>)(blockId)
      .then(list => {
        const l = list ?? [];
        setVersions(l);
        if (l.length > 0) setSelectedVersion(l[0].name);
      })
      .catch(e => setError(String(e)))
      .finally(() => setVersionsLoading(false));
  }

  function doInstall() {
    if (!selectedNeuron || !selectedPlan) return;
    setError('');
    setStep('installing');
    const params = {
      blockId,
      package: selectedNeuron.package,
      planName: selectedPlan.name,
      buildFolder: buildFolder || './',
      blockVersion: selectedVersion,
    };
    (ProductService.DoInstallBlock as (p: typeof params) => Promise<{ instanceName: string; branchName: string; repoPath: string; defineRepoPath: string }>)(params)
      .then(r => {
        setBranchName(r?.branchName ?? '');
        setRepoPath(r?.repoPath ?? '');
        setDefineRepoPath(r?.defineRepoPath ?? '');
        setMergePhase('ready');
        setStep('merge');
      })
      .catch(e => { setError(String(e)); setStep('configure'); });
  }

  // runMerge performs a local git merge on `path`. If `isLast` is false, a successful
  // merge automatically continues into the define repo. Pass `path` explicitly so that
  // closures inside async .then() callbacks use the correct repo, not stale state.
  function runMerge(path: string, isLast: boolean) {
    mergeTermRef.current?.clear();
    const off = Events.On('git:log', (ev: any) => mergeTermRef.current?.write(typeof ev === 'string' ? ev : ev?.data ?? String(ev)));
    (GitService.StartLocalMerge as (rp: string, bn: string) => Promise<{ hasConflicts: boolean; conflictFiles: string[]; errorMessage: string }>)(path, branchName)
      .then(r => {
        off();
        if (r.errorMessage) { setMergeError(r.errorMessage); setMergePhase('ready'); return; }
        if (r.hasConflicts && r.conflictFiles?.length > 0) {
          const files = r.conflictFiles;
          setConflictFiles(files);
          setHunkResolutions({});
          setResolvedFiles(new Set());
          setSelectedConflictFile(files[0]);
          setMergePhase('conflicts');
          loadConflictFile(files[0], path);
        } else if (!isLast) {
          // Build repo merged; continue to define repo.
          setRepoPath(defineRepoPath);
          runMerge(defineRepoPath, true);
        } else {
          setMergePhase('done');
        }
      })
      .catch(e => { off(); setMergeError(String(e)); setMergePhase('ready'); });
  }

  function startMerge() {
    setMergePhase('merging');
    setMergeError('');
    // isLast = true when there is no define repo, or when repoPath is already the define repo.
    const isLast = !defineRepoPath || repoPath === defineRepoPath;
    runMerge(repoPath, isLast);
  }

  // loadConflictFile accepts an optional explicit repo path to avoid stale closure captures
  // when called from inside async runMerge callbacks.
  function loadConflictFile(filePath: string, rp?: string) {
    const effectivePath = rp ?? repoPath;
    setSelectedConflictFile(filePath);
    setConflictContent(null);
    (GitService.GetConflictContent as (rp: string, fp: string) => Promise<ConflictFileContent>)(effectivePath, filePath)
      .then(content => {
        setConflictContent(content);
        // Init hunk resolutions for this file if not already set.
        setHunkResolutions(prev => {
          if (prev[filePath]) return prev;
          return { ...prev, [filePath]: Array(content.hunks.length).fill(null) };
        });
      })
      .catch(e => setMergeError(String(e)));
  }

  function resolveHunk(filePath: string, hunkIdx: number, lines: string[] | null) {
    setHunkResolutions(prev => {
      const fileResolutions = [...(prev[filePath] ?? [])];
      fileResolutions[hunkIdx] = lines;
      return { ...prev, [filePath]: fileResolutions };
    });
  }

  function acceptAllCurrent() {
    if (!conflictContent) return;
    const lines = conflictContent.hunks.map((_, i) => i);
    lines.forEach(i => resolveHunk(selectedConflictFile, i, conflictContent.hunks[i].current));
  }

  function acceptAllIncoming() {
    if (!conflictContent) return;
    conflictContent.hunks.forEach((h, i) => resolveHunk(selectedConflictFile, i, h.incoming));
  }

  function saveResolvedFile(filePath: string) {
    const resolutions = hunkResolutions[filePath];
    if (!resolutions?.every(r => r !== null)) return;
    // Send each hunk's resolved lines as a joined string; backend replaces markers in-place.
    const hunkStrings = resolutions.map(r => (r ?? []).join('\n'));
    (GitService.SaveConflictResolution as (rp: string, fp: string, res: string[]) => Promise<void>)(repoPath, filePath, hunkStrings)
      .then(() => setResolvedFiles(prev => new Set([...prev, filePath])))
      .catch(e => setMergeError(String(e)));
  }

  function completeMerge() {
    (GitService.CompleteMerge as (rp: string) => Promise<void>)(repoPath)
      .then(() => {
        // If we just completed the build repo and the define repo still needs merging, continue.
        if (defineRepoPath && repoPath !== defineRepoPath) {
          setRepoPath(defineRepoPath);
          setConflictFiles([]);
          setHunkResolutions({});
          setResolvedFiles(new Set());
          setMergePhase('merging');
          runMerge(defineRepoPath, true);
        } else {
          setMergePhase('done');
        }
      })
      .catch(e => setMergeError(String(e)));
  }

  function abortMerge() {
    (GitService.AbortMerge as (rp: string) => Promise<void>)(repoPath)
      .then(() => { setMergePhase('ready'); setConflictFiles([]); setHunkResolutions({}); setResolvedFiles(new Set()); setMergeError(''); })
      .catch(e => setMergeError(String(e)));
  }

  const isConflicts = step === 'merge' && mergePhase === 'conflicts';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`bg-[#1e1e1e] border border-[#464646] rounded-[8px] flex flex-col shadow-2xl transition-all duration-200 ${isConflicts ? 'w-[900px] max-h-[90vh]' : 'w-[520px] max-h-[80vh]'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-[24px] py-[18px] border-b border-[#464646] shrink-0">
          <div>
            <h2 className="font-['JetBrains_Mono',sans-serif] font-bold text-[13px] text-white uppercase">
              Install Block
            </h2>
            <p className="text-[11px] text-white/40 mt-[2px]">{blockDisplayName}</p>
          </div>
          {step !== 'installing' && !(step === 'merge' && mergePhase === 'merging') && (
            <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors p-[4px]">
              <Icon icon="solar:close-circle-linear" className="text-lg" />
            </button>
          )}
        </div>

        {/* Step indicator */}
        <div className="flex items-center px-[24px] py-[12px] border-b border-[#464646] shrink-0">
          {(['location', 'plan', 'configure', 'merge'] as InstallStep[]).map((s, i) => {
            const labels: Record<string, string> = { location: '1. Location', plan: '2. Plan', configure: '3. Configure', merge: '4. Merge' };
            const stepOrder: InstallStep[] = ['location', 'plan', 'configure', 'installing', 'merge', 'done'];
            const currentIdx = stepOrder.indexOf(step);
            const thisIdx = stepOrder.indexOf(s);
            const active = step === s || (s === 'merge' && step === 'installing');
            const done = currentIdx > thisIdx && !(s === 'merge' && step === 'installing');
            return (
              <div key={s} className="flex items-center gap-[8px]">
                {i > 0 && <div className={`w-[24px] h-[1px] ${done ? 'bg-[#f881a9]' : 'bg-white/20'}`} />}
                <span className={`text-[10px] font-bold uppercase ${active ? 'text-[#f881a9]' : done ? 'text-white/60' : 'text-white/25'}`}>
                  {labels[s]}
                </span>
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-[24px]">
          {error && (
            <div className="mb-[16px] p-[12px] bg-red-500/10 border border-red-500/30 rounded-[4px] text-[12px] text-red-400">
              {error}
            </div>
          )}

          {step === 'location' && (
            <div className="flex flex-col gap-[16px]">
              <p className="text-[12px] text-white/50">Select where to install this block.</p>

              <div>
                <label className="block text-[10px] font-bold uppercase text-white/40 mb-[6px]">Landing Zone</label>
                <FilterSelect
                  size="lg"
                  value={selectedOrg}
                  onChange={setSelectedOrg}
                  loading={orgsLoading}
                  placeholder="Select organisation…"
                  emptyLabel="No organisations"
                  options={orgs.map(o => ({ value: o.name, label: o.displayName || o.name.replace('organisations/', '') }))}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-white/40 mb-[6px]">Product</label>
                <FilterSelect
                  size="lg"
                  value={selectedProduct}
                  onChange={setSelectedProduct}
                  loading={productsLoading}
                  disabled={!selectedOrg}
                  placeholder="Select product…"
                  emptyLabel="No products"
                  options={products.map(p => ({ value: p.name, label: p.displayName || p.name }))}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-white/40 mb-[6px]">Neuron</label>
                <FilterSelect
                  size="lg"
                  value={selectedNeuron?.name ?? ''}
                  onChange={v => setSelectedNeuron(neurons.find(n => n.name === v) ?? null)}
                  loading={neuronsLoading}
                  disabled={!selectedProduct}
                  placeholder="Select neuron…"
                  emptyLabel="No neurons"
                  options={neurons.map(n => ({ value: n.name, label: n.displayName }))}
                />
                {selectedNeuron && (
                  <p className="mt-[6px] text-[10px] font-['JetBrains_Mono',sans-serif] text-white/30">{selectedNeuron.package}</p>
                )}
              </div>
            </div>
          )}

          {step === 'plan' && (
            <div className="flex flex-col gap-[12px]">
              <p className="text-[12px] text-white/50">Select an entitlement plan.</p>
              {plansLoading ? (
                <div className="flex items-center justify-center py-[40px]"><Loader /></div>
              ) : plans.length === 0 ? (
                <p className="text-[12px] text-white/40">No plans available.</p>
              ) : (
                plans.map(plan => (
                  <button
                    key={plan.name}
                    onClick={() => setSelectedPlan(plan)}
                    className={`w-full text-left p-[16px] border rounded-[4px] transition-all ${
                      selectedPlan?.name === plan.name
                        ? 'border-[#f881a9] bg-[#f881a9]/5'
                        : 'border-[#464646] bg-white/3 hover:border-white/30'
                    }`}
                  >
                    <p className="font-['JetBrains_Mono',sans-serif] text-[12px] font-bold text-white">
                      {plan.displayName || plan.name.split('/').pop()}
                    </p>
                    <p className="text-[10px] text-white/30 mt-[2px] font-['JetBrains_Mono',sans-serif]">{plan.name}</p>
                  </button>
                ))
              )}
            </div>
          )}

          {step === 'configure' && (
            <div className="flex flex-col gap-[16px]">
              <p className="text-[12px] text-white/50">Configure the installation.</p>

              <div>
                <label className="block text-[10px] font-bold uppercase text-white/40 mb-[6px]">Build Folder</label>
                <input
                  type="text"
                  value={buildFolder}
                  onChange={e => setBuildFolder(e.target.value)}
                  className="w-full bg-[#2c2c2c] border border-[#464646] rounded-[4px] px-[12px] py-[8px] text-[12px] text-white font-['JetBrains_Mono',sans-serif] focus:outline-none focus:border-[#f881a9] transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-white/40 mb-[6px]">Block Version</label>
                <FilterSelect
                  size="lg"
                  value={selectedVersion}
                  onChange={setSelectedVersion}
                  loading={versionsLoading}
                  placeholder="Latest"
                  options={[
                    { value: '', label: 'Latest' },
                    ...versions.map(v => ({ value: v.name, label: v.versionTag })),
                  ]}
                />
              </div>

              <div className="p-[12px] bg-white/3 border border-[#464646] rounded-[4px] text-[11px] text-white/50">
                <p className="font-bold text-white/30 uppercase text-[9px] mb-[6px]">Summary</p>
                <p>Block: <span className="text-white/70 font-['JetBrains_Mono',sans-serif]">{blockId}</span></p>
                <p>Package: <span className="text-white/70 font-['JetBrains_Mono',sans-serif]">{selectedNeuron?.package}</span></p>
                <p>Plan: <span className="text-white/70 font-['JetBrains_Mono',sans-serif]">{selectedPlan?.displayName || selectedPlan?.name}</span></p>
              </div>
            </div>
          )}

          {step === 'installing' && (
            <div className="flex flex-col items-center justify-center py-[40px] gap-[16px]">
              <Loader />
              <p className="text-[13px] text-white/60">Installing block…</p>
              <p className="text-[11px] text-white/30">This may take a few minutes.</p>
            </div>
          )}

          {step === 'merge' && <MergeStepContent
            mergePhase={mergePhase}
            branchName={branchName}
            repoPath={repoPath}
            conflictFiles={conflictFiles}
            selectedConflictFile={selectedConflictFile}
            conflictContent={conflictContent}
            hunkResolutions={hunkResolutions}
            resolvedFiles={resolvedFiles}
            mergeError={mergeError}
            termRef={mergeTermRef}
            onLoadFile={loadConflictFile}
            onResolveHunk={resolveHunk}
            onAcceptAllCurrent={acceptAllCurrent}
            onAcceptAllIncoming={acceptAllIncoming}
            onSaveFile={saveResolvedFile}
          />}

          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-[40px] gap-[16px]">
              <Icon icon="solar:check-circle-bold" className="text-5xl text-green-400" />
              <p className="text-[14px] font-bold text-white">Block Installed</p>
              <p className="text-[12px] text-white/50 text-center">
                The block has been installed and merged into <span className="text-white/80 font-['JetBrains_Mono',sans-serif]">{selectedNeuron?.package}</span>.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-[8px] px-[24px] py-[16px] border-t border-[#464646] shrink-0">
          {step === 'location' && (
            <>
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button variant="primary" onClick={goToPlan} disabled={!selectedNeuron}>
                Select Plan
              </Button>
            </>
          )}
          {step === 'plan' && (
            <>
              <Button variant="secondary" onClick={() => setStep('location')}>Back</Button>
              <Button variant="primary" onClick={goToConfigure} disabled={!selectedPlan || plansLoading}>
                Configure
              </Button>
            </>
          )}
          {step === 'configure' && (
            <>
              <Button variant="secondary" onClick={() => setStep('plan')}>Back</Button>
              <Button variant="primary" onClick={doInstall} disabled={versionsLoading}>
                <Icon icon="solar:download-linear" className="mr-1" />
                Install
              </Button>
            </>
          )}
          {step === 'merge' && mergePhase === 'ready' && (
            <>
              <Button variant="secondary" onClick={() => setStep('done')}>Skip</Button>
              <Button variant="primary" onClick={startMerge} disabled={!repoPath}>
                <Icon icon="solar:code-square-linear" className="mr-1" />
                Start Merge
              </Button>
            </>
          )}
          {step === 'merge' && mergePhase === 'merging' && (
            <Button variant="primary" disabled>
              <span className="mr-2"><Loader size={14} /></span>Merging…
            </Button>
          )}
          {step === 'merge' && mergePhase === 'conflicts' && (
            <>
              <Button variant="secondary" onClick={abortMerge} className="text-red-400 border-red-400/30 hover:border-red-400/60">
                Abort Merge
              </Button>
              <Button variant="primary" onClick={completeMerge} disabled={resolvedFiles.size < conflictFiles.length}>
                <Icon icon="solar:check-circle-linear" className="mr-1" />
                Complete Merge
              </Button>
            </>
          )}
          {step === 'merge' && mergePhase === 'done' && (
            <Button variant="primary" onClick={() => setStep('done')}>
              Continue
            </Button>
          )}
          {step === 'done' && (
            <Button variant="primary" onClick={onDone}>View Instances</Button>
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
  conflictFiles,
  selectedConflictFile,
  conflictContent,
  hunkResolutions,
  resolvedFiles,
  mergeError,
  termRef,
  onLoadFile,
  onResolveHunk,
  onAcceptAllCurrent,
  onAcceptAllIncoming,
  onSaveFile,
}: {
  mergePhase: MergePhase;
  branchName: string;
  repoPath: string;
  conflictFiles: string[];
  selectedConflictFile: string;
  conflictContent: ConflictFileContent | null;
  hunkResolutions: Record<string, (string[] | null)[]>;
  resolvedFiles: Set<string>;
  mergeError: string;
  termRef: React.RefObject<BuildTerminalHandle>;
  onLoadFile: (fp: string) => void;
  onResolveHunk: (fp: string, idx: number, lines: string[] | null) => void;
  onAcceptAllCurrent: () => void;
  onAcceptAllIncoming: () => void;
  onSaveFile: (fp: string) => void;
}) {
  if (mergePhase === 'ready') {
    return (
      <div className="flex flex-col gap-[16px]">
        <p className="text-[12px] text-white/50">
          The installation created a branch in your local build repo. Merge it into master to complete the setup.
        </p>
        <div className="p-[12px] bg-white/3 border border-[#464646] rounded-[4px] text-[11px] text-white/50 flex flex-col gap-[6px]">
          <div className="flex items-center gap-[8px]">
            <Icon icon="solar:git-branch-linear" className="text-[#f881a9] text-sm shrink-0" />
            <span className="font-['JetBrains_Mono',sans-serif] text-white/80">{branchName || '(branch name unknown)'}</span>
          </div>
          <div className="flex items-center gap-[8px]">
            <Icon icon="solar:folder-linear" className="text-white/30 text-sm shrink-0" />
            <span className="font-['JetBrains_Mono',sans-serif] text-white/40 text-[10px] break-all">{repoPath || '(repo path unknown)'}</span>
          </div>
        </div>
        {mergeError && (
          <div className="p-[10px] bg-red-500/10 border border-red-500/30 rounded-[4px] text-[11px] text-red-400 font-['JetBrains_Mono',sans-serif] whitespace-pre-wrap">
            {mergeError}
          </div>
        )}
        <p className="text-[11px] text-white/30">
          This will run: <span className="font-['JetBrains_Mono',sans-serif]">git fetch --all --prune → checkout master → pull → merge origin/{branchName || '…'}</span>
        </p>
      </div>
    );
  }

  if (mergePhase === 'merging') {
    return (
      <div className="flex flex-col gap-[10px] h-full">
        <div className="flex items-center gap-[8px]">
          <span className="inline-block w-[6px] h-[6px] rounded-full bg-[#f881a9] animate-pulse" />
          <p className="text-[11px] text-white/50">Running git operations…</p>
        </div>
        <div className="flex-1 rounded-[4px] overflow-hidden" style={{ minHeight: 240 }}>
          <BuildTerminal ref={termRef} className="h-full" />
        </div>
      </div>
    );
  }

  if (mergePhase === 'done') {
    return (
      <div className="flex flex-col items-center justify-center py-[40px] gap-[16px]">
        <Icon icon="solar:check-circle-bold" className="text-5xl text-green-400" />
        <p className="text-[14px] font-bold text-white">Branch Merged</p>
        <p className="text-[12px] text-white/50 text-center">
          <span className="font-['JetBrains_Mono',sans-serif] text-white/80">{branchName}</span> has been merged into master.
        </p>
      </div>
    );
  }

  // conflicts phase — two-panel layout
  const fileResolutions = hunkResolutions[selectedConflictFile] ?? [];
  const allHunksResolved = conflictContent !== null && fileResolutions.length === conflictContent.hunks.length && fileResolutions.every(r => r !== null);
  const isFileSaved = resolvedFiles.has(selectedConflictFile);

  return (
    <div className="flex h-full overflow-hidden" style={{ minHeight: 420 }}>
      {/* Left panel — file list */}
      <div className="w-[180px] shrink-0 border-r border-[#464646] flex flex-col overflow-hidden">
        <div className="px-[12px] py-[10px] border-b border-[#464646] shrink-0">
          <p className="text-[9px] font-bold uppercase text-white/30 tracking-wider">
            Conflicts ({conflictFiles.length} files)
          </p>
        </div>
        <div className="flex-1 overflow-auto py-[4px]">
          {conflictFiles.map(fp => {
            const saved = resolvedFiles.has(fp);
            const resolutions = hunkResolutions[fp] ?? [];
            const unresolvedCount = resolutions.filter(r => r === null).length;
            const isActive = fp === selectedConflictFile;
            const fileName = fp.split('/').pop() ?? fp;
            return (
              <button
                key={fp}
                onClick={() => onLoadFile(fp)}
                className={`w-full flex items-center gap-[6px] px-[12px] py-[7px] text-left transition-colors ${isActive ? 'bg-white/8 text-white' : 'text-white/60 hover:bg-white/4 hover:text-white/80'}`}
              >
                {saved ? (
                  <Icon icon="solar:check-circle-bold" className="text-green-400 text-xs shrink-0" />
                ) : (
                  <span className="w-[16px] h-[16px] shrink-0 flex items-center justify-center rounded-full bg-red-500/20 text-red-400 text-[9px] font-bold leading-none">
                    {unresolvedCount > 0 ? unresolvedCount : '!'}
                  </span>
                )}
                <span className="text-[11px] font-['JetBrains_Mono',sans-serif] truncate">{fileName}</span>
              </button>
            );
          })}
        </div>
        {mergeError && (
          <div className="p-[8px] border-t border-[#464646] text-[10px] text-red-400 font-['JetBrains_Mono',sans-serif]">
            {mergeError}
          </div>
        )}
      </div>

      {/* Right panel — conflict editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-[12px] py-[8px] border-b border-[#464646] shrink-0 gap-[8px]">
          <span className="text-[10px] font-['JetBrains_Mono',sans-serif] text-white/40 truncate">{selectedConflictFile}</span>
          <div className="flex items-center gap-[6px] shrink-0">
            <button
              onClick={onAcceptAllCurrent}
              className="text-[10px] px-[8px] py-[3px] rounded-[3px] bg-green-900/30 text-green-300 hover:bg-green-900/50 transition-colors border border-green-700/30"
            >
              Accept All Current
            </button>
            <button
              onClick={onAcceptAllIncoming}
              className="text-[10px] px-[8px] py-[3px] rounded-[3px] bg-blue-900/30 text-blue-300 hover:bg-blue-900/50 transition-colors border border-blue-700/30"
            >
              Accept All Incoming
            </button>
            {allHunksResolved && !isFileSaved && (
              <button
                onClick={() => onSaveFile(selectedConflictFile)}
                className="text-[10px] px-[8px] py-[3px] rounded-[3px] bg-[#f881a9]/20 text-[#f881a9] hover:bg-[#f881a9]/30 transition-colors border border-[#f881a9]/30"
              >
                Save File
              </button>
            )}
            {isFileSaved && (
              <span className="text-[10px] text-green-400 flex items-center gap-[4px]">
                <Icon icon="solar:check-circle-bold" className="text-xs" /> Saved
              </span>
            )}
          </div>
        </div>

        {/* File content */}
        <div className="flex-1 overflow-auto font-['JetBrains_Mono',sans-serif] text-[11px]">
          {!conflictContent ? (
            <div className="flex items-center justify-center h-full text-white/30"><Loader size={20} /></div>
          ) : (
            <ConflictEditor
              content={conflictContent}
              branchName={branchName}
              resolutions={fileResolutions}
              onResolve={(idx, lines) => onResolveHunk(selectedConflictFile, idx, lines)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Conflict Editor ────────────────────────────────────────────────────────────

function ConflictEditor({
  content,
  branchName,
  resolutions,
  onResolve,
}: {
  content: ConflictFileContent;
  branchName: string;
  resolutions: (string[] | null)[];
  onResolve: (hunkIdx: number, lines: string[] | null) => void;
}) {
  const parts: React.ReactNode[] = [];

  content.hunks.forEach((hunk, hunkIdx) => {
    const resolved = resolutions[hunkIdx];

    // Before context
    if (hunk.before.length > 0) {
      parts.push(
        <div key={`before-${hunkIdx}`}>
          {hunk.before.map((line, i) => (
            <div key={i} className="px-[12px] py-[1px] text-white/50 leading-[1.6]">{line || ' '}</div>
          ))}
        </div>
      );
    }

    if (resolved !== null) {
      // Show resolved state with undo option
      parts.push(
        <div key={`resolved-${hunkIdx}`} className="border-l-2 border-white/20 my-[2px]">
          <div className="flex items-center gap-[8px] px-[12px] py-[4px] bg-white/5">
            <Icon icon="solar:check-circle-bold" className="text-green-400 text-xs" />
            <span className="text-[10px] text-white/40">Resolved</span>
            <button
              onClick={() => onResolve(hunkIdx, null)}
              className="text-[10px] text-white/30 hover:text-white/60 transition-colors ml-auto"
            >
              Undo
            </button>
          </div>
          {resolved.map((line, i) => (
            <div key={i} className="px-[12px] py-[1px] text-white/70 leading-[1.6]">{line || ' '}</div>
          ))}
        </div>
      );
    } else {
      // Show conflict hunk with action buttons
      parts.push(
        <div key={`hunk-${hunkIdx}`} className="my-[2px]">
          {/* Action bar */}
          <div className="flex items-center gap-[6px] px-[12px] py-[5px] bg-[#1a1a1a] border-y border-[#464646]">
            <button
              onClick={() => onResolve(hunkIdx, hunk.current)}
              className="text-[10px] px-[8px] py-[2px] rounded-[3px] bg-green-900/40 text-green-300 hover:bg-green-900/60 transition-colors border border-green-700/30"
            >
              Accept Current Change
            </button>
            <button
              onClick={() => onResolve(hunkIdx, hunk.incoming)}
              className="text-[10px] px-[8px] py-[2px] rounded-[3px] bg-blue-900/40 text-blue-300 hover:bg-blue-900/60 transition-colors border border-blue-700/30"
            >
              Accept Incoming Change
            </button>
            <button
              onClick={() => onResolve(hunkIdx, [...hunk.current, ...hunk.incoming])}
              className="text-[10px] px-[8px] py-[2px] rounded-[3px] bg-white/5 text-white/50 hover:bg-white/10 transition-colors border border-white/15"
            >
              Accept Both
            </button>
          </div>

          {/* Current change (HEAD) — green */}
          <div className="bg-green-950/30 border-l-[3px] border-green-500">
            <div className="flex items-center gap-[6px] px-[12px] py-[3px] bg-green-900/20">
              <Icon icon="solar:arrow-up-linear" className="text-green-400 text-xs" />
              <span className="text-[10px] text-green-400 font-bold">Current Change (HEAD)</span>
            </div>
            {hunk.current.map((line, i) => (
              <div key={i} className="px-[12px] py-[1px] text-green-100/80 leading-[1.6]">{line || ' '}</div>
            ))}
          </div>

          {/* Divider */}
          <div className="flex items-center px-[12px] py-[2px] bg-[#2a2a2a]">
            <div className="flex-1 h-[1px] bg-white/10" />
            <span className="px-[8px] text-[9px] text-white/20 uppercase tracking-widest">=======</span>
            <div className="flex-1 h-[1px] bg-white/10" />
          </div>

          {/* Incoming change (branch) — blue */}
          <div className="bg-blue-950/30 border-l-[3px] border-blue-500">
            <div className="flex items-center gap-[6px] px-[12px] py-[3px] bg-blue-900/20">
              <Icon icon="solar:arrow-down-linear" className="text-blue-400 text-xs" />
              <span className="text-[10px] text-blue-400 font-bold">Incoming Change ({branchName})</span>
            </div>
            {hunk.incoming.map((line, i) => (
              <div key={i} className="px-[12px] py-[1px] text-blue-100/80 leading-[1.6]">{line || ' '}</div>
            ))}
          </div>
        </div>
      );
    }

    // After context (only for last hunk, show trailing lines)
    if (hunkIdx === content.hunks.length - 1 && hunk.after.length > 0) {
      parts.push(
        <div key={`after-${hunkIdx}`}>
          {hunk.after.map((line, i) => (
            <div key={i} className="px-[12px] py-[1px] text-white/50 leading-[1.6]">{line || ' '}</div>
          ))}
        </div>
      );
    }
  });

  return <div className="py-[4px]">{parts}</div>;
}

// ── Documentation Tab ─────────────────────────────────────────────────────────

function DocumentationTab({
  doc,
  agentDoc,
  loading,
  audience,
  onAudienceChange,
}: {
  doc: string;
  agentDoc: string;
  loading: boolean;
  audience: 'user' | 'agent';
  onAudienceChange: (a: 'user' | 'agent') => void;
}) {
  const [copied, setCopied] = useState(false);
  const proseRef = useRef<HTMLDivElement>(null);
  const content = audience === 'agent' ? agentDoc : doc;
  const html = content ? (marked.parse(content) as string) : '';

  useEffect(() => {
    if (!proseRef.current || !html) return;
    const nodes = proseRef.current.querySelectorAll<HTMLElement>('pre code.language-mermaid');
    if (nodes.length === 0) return;
    nodes.forEach((codeEl, i) => {
      const pre = codeEl.parentElement;
      if (!pre) return;
      const code = codeEl.textContent ?? '';
      const id = `mermaid-${Date.now()}-${i}`;
      const wrapper = document.createElement('div');
      wrapper.className = 'mermaid-diagram';
      wrapper.style.cssText = 'margin: 16px 0; display: flex; justify-content: center;';
      pre.replaceWith(wrapper);
      mermaid.parse(code)
        .then(() => mermaid.render(id, code))
        .then(({ svg }) => { wrapper.innerHTML = svg; })
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
      <div className="flex items-center gap-[2px] px-[20px] pt-[12px] pb-0 border-b border-[#464646] shrink-0">
        {(['user', 'agent'] as const).map(a => (
          <button
            key={a}
            onClick={() => onAudienceChange(a)}
            className={`px-[14px] py-[8px] text-[10px] font-bold uppercase relative transition-all ${
              audience === a ? 'text-[#f881a9]' : 'text-white/40 hover:text-white/70'
            }`}
          >
            {a === 'user' ? 'User Facing' : 'Agent Facing'}
            {audience === a && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#f881a9]" />}
          </button>
        ))}
        <div className="flex-1" />
        {audience === 'agent' && content && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-[6px] px-[12px] py-[6px] mb-[6px] text-[10px] font-bold uppercase rounded border transition-all"
            style={copied
              ? { color: '#4ade80', borderColor: 'rgba(74,222,128,0.3)', background: 'rgba(74,222,128,0.08)' }
              : { color: 'rgba(255,255,255,0.4)', borderColor: '#464646', background: 'transparent' }
            }
          >
            <Icon icon={copied ? 'solar:check-circle-linear' : 'solar:copy-linear'} className="text-sm" />
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-[32px]">
        {loading ? (
          <div className="flex items-center justify-center py-[60px]"><Loader /></div>
        ) : html ? (
          <div
            ref={proseRef}
            className="prose prose-invert prose-sm max-w-none break-words
              text-[13px] leading-[1.7] text-[rgba(255,255,255,0.75)]
              [&_h1]:font-['JetBrains_Mono',sans-serif] [&_h1]:text-[16px] [&_h1]:font-bold [&_h1]:uppercase [&_h1]:text-white [&_h1]:mb-[12px]
              [&_h2]:font-['JetBrains_Mono',sans-serif] [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:uppercase [&_h2]:text-white [&_h2]:mb-[8px]
              [&_h3]:font-['JetBrains_Mono',sans-serif] [&_h3]:text-[12px] [&_h3]:font-bold [&_h3]:text-white [&_h3]:mb-[6px]
              [&_h4]:text-[12px] [&_h4]:font-semibold [&_h4]:text-white [&_h4]:mb-[4px]
              [&_h5]:text-[11px] [&_h5]:font-semibold [&_h5]:text-white/80 [&_h5]:mb-[4px]
              [&_h6]:text-[11px] [&_h6]:font-medium [&_h6]:text-white/60 [&_h6]:mb-[4px]
              [&_p]:text-[rgba(255,255,255,0.7)] [&_p]:mb-[10px]
              [&_code]:text-[#f881a9] [&_code]:bg-white/5 [&_code]:px-[4px] [&_code]:py-[1px] [&_code]:rounded [&_code]:text-[11px]
              [&_pre]:bg-[#2c2c2c] [&_pre]:border [&_pre]:border-[#464646] [&_pre]:rounded-[4px] [&_pre]:text-[11px] [&_pre]:p-[12px] [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words
              [&_pre_code]:bg-transparent [&_pre_code]:text-[rgba(255,255,255,0.8)] [&_pre_code]:p-0
              [&_a]:text-[#f881a9] [&_a]:no-underline hover:[&_a]:underline
              [&_strong]:text-white
              [&_li]:text-[rgba(255,255,255,0.7)] [&_li]:mb-[4px]
              [&_ul]:mb-[10px] [&_ol]:mb-[10px]
              [&_hr]:border-[#464646] [&_hr]:my-[20px]"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <EmptyState icon="solar:document-text-linear" title="No documentation available" />
        )}
      </div>
    </div>
  );
}

// ── Versions Tab ──────────────────────────────────────────────────────────────

const VERSION_FILTERS = [
  { label: 'Stable', level: 5 },
  { label: 'RC', level: 4 },
  { label: 'Beta', level: 3 },
  { label: 'Alpha', level: 2 },
  { label: 'Experimental', level: 1 },
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
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [openFile, setOpenFile] = useState<{ name: string; content: string } | null>(null);

  useEffect(() => {
    if (!selected) return;
    setDetail(null);
    setExpandedFolders(new Set());
    setDetailLoading(true);
    (ProductService.GetCodeblockVersion as (name: string) => Promise<CodeblockVersion>)(selected.name)
      .then(full => {
        setDetail(full);
        setExpandedFolders(new Set(full.files?.map(f => f.name) ?? []));
      })
      .catch(() => setDetail(selected))
      .finally(() => setDetailLoading(false));
  }, [selected?.name]);

  function toggleFolder(name: string) {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader /></div>;
  }

  if (versions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState icon="solar:box-minimalistic-linear" title="No versions published yet" />
      </div>
    );
  }

  const filtered = filter === null ? versions : versions.filter(v => v.releaseLevel === filter);
  const displayDetail = detail ?? (detailLoading ? null : selected);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Filter bar */}
      <div className="flex items-center gap-[8px] px-[16px] py-[10px] border-b border-[#464646] shrink-0 flex-wrap">
        <span className="text-[11px] text-white/40 mr-[4px]">Filters:</span>
        {VERSION_FILTERS.map(f => (
          <button
            key={f.level}
            onClick={() => setFilter(filter === f.level ? null : f.level)}
            className={`text-[10px] font-bold uppercase border rounded-full px-[10px] py-[3px] transition-colors ${
              filter === f.level
                ? LEVEL_COLOR[f.level]
                : 'text-white/40 border-white/20 hover:border-white/40'
            }`}
          >
            {f.label}
          </button>
        ))}
        {filter !== null && (
          <button
            onClick={() => setFilter(null)}
            className="text-[10px] font-bold uppercase border rounded-full px-[10px] py-[3px] text-white/60 border-white/30 hover:border-white/50 ml-[4px]"
          >
            Show all
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Version list */}
        <div className="w-[260px] shrink-0 border-r border-[#464646] overflow-auto">
          {filtered.length === 0 && (
            <p className="text-[12px] text-white/30 p-[16px]">No versions match this filter</p>
          )}
          {filtered.map(v => (
            <button
              key={v.name}
              onClick={() => onSelect(v)}
              className={`w-full text-left px-[16px] py-[14px] border-b border-[#464646] transition-colors ${
                selected?.name === v.name ? 'bg-white/5' : 'hover:bg-white/3'
              }`}
            >
              <div className="flex items-center justify-between mb-[4px]">
                <span className="font-['JetBrains_Mono',sans-serif] text-[12px] text-white font-bold">
                  {v.versionTag}
                </span>
                <span className={`text-[8px] font-bold uppercase border rounded px-[5px] py-[1px] ${
                  v.releaseLevel > 0
                    ? (LEVEL_COLOR[v.releaseLevel] ?? 'text-white/50 border-white/10 bg-white/5')
                    : 'text-white/30 border-white/10 bg-white/5'
                }`}>
                  {v.releaseLevel > 0 ? (LEVEL_LABEL[v.releaseLevel] ?? '') : 'Not Specified'}
                </span>
              </div>
              {v.createTime && (
                <p className="text-[10px] text-white/40">{formatDate(v.createTime)}</p>
              )}
            </button>
          ))}
        </div>

        {/* Version detail */}
        {selected && (
          <div className="flex-1 overflow-auto p-[24px]">
            {detailLoading ? (
              <div className="flex items-center justify-center h-[120px]"><Loader /></div>
            ) : displayDetail && (
              <div className="max-w-[700px] flex flex-col gap-[20px]">
                <div>
                  <h2 className="font-['JetBrains_Mono',sans-serif] font-bold text-[16px] text-white uppercase mb-[4px]">
                    {displayDetail.versionTag}
                  </h2>
                  <div className="flex items-center gap-[12px] text-[11px] text-white/40">
                    {displayDetail.createTime && <span>Published {formatDate(displayDetail.createTime)}</span>}
                    <span className={`text-[9px] font-bold uppercase border rounded px-[5px] py-[1px] ${
                      displayDetail.releaseLevel > 0
                        ? (LEVEL_COLOR[displayDetail.releaseLevel] ?? 'text-white/50 border-white/10 bg-white/5')
                        : 'text-white/30 border-white/10 bg-white/5'
                    }`}>
                      {displayDetail.releaseLevel > 0 ? LEVEL_LABEL[displayDetail.releaseLevel] : 'Not Specified'}
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase text-white/40 mb-[8px]">Release Notes</p>
                  <div className="bg-[#2c2c2c] border border-[#464646] rounded-[4px] p-[16px]">
                    {displayDetail.releaseNotes ? (
                      <p className="text-[13px] text-white/80 leading-[1.6]">{displayDetail.releaseNotes}</p>
                    ) : (
                      <p className="text-[13px] text-white/30 italic">No release notes written.</p>
                    )}
                  </div>
                </div>

                {displayDetail.files && displayDetail.files.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase text-white/40 mb-[8px]">Files</p>
                    <div className="flex flex-col gap-[4px]">
                      {displayDetail.files.map(folder => {
                        const isExpanded = expandedFolders.has(folder.name);
                        return (
                          <div key={folder.name} className="bg-[#2c2c2c] border border-[#464646] rounded-[4px] overflow-hidden">
                            <button
                              onClick={() => toggleFolder(folder.name)}
                              className="w-full flex items-center gap-[8px] px-[12px] py-[10px] border-b border-[#464646] hover:bg-white/3 transition-colors text-left"
                            >
                              <Icon
                                icon={isExpanded ? 'solar:alt-arrow-down-linear' : 'solar:alt-arrow-right-linear'}
                                className="text-white/40 text-xs shrink-0"
                              />
                              <Icon icon="solar:folder-linear" className="text-white/50 text-sm shrink-0" />
                              <span className="text-[12px] text-white font-['JetBrains_Mono',sans-serif]">{folder.name}</span>
                            </button>
                            {isExpanded && folder.files?.map(f => (
                              <button
                                key={f.name}
                                onClick={() => setOpenFile({ name: f.name, content: f.content ?? '' })}
                                className="w-full flex items-center gap-[8px] px-[12px] py-[8px] pl-[36px] border-b border-[#464646] last:border-0 hover:bg-white/5 transition-colors text-left group"
                              >
                                <Icon icon="solar:file-linear" className="text-white/30 text-xs shrink-0 group-hover:text-white/50" />
                                <span className="text-[11px] text-white/70 font-['JetBrains_Mono',sans-serif] group-hover:text-white/90">{f.name}</span>
                                <Icon icon="solar:alt-arrow-right-linear" className="text-white/20 text-xs ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
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

// ── File Viewer Modal ─────────────────────────────────────────────────────────

function extToLang(filename: string): string {
  const name = filename.split('/').pop() ?? filename;
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (name === 'Dockerfile' || name.startsWith('Dockerfile.')) return 'dockerfile';
  if (name === 'Makefile' || name === 'makefile') return 'makefile';
  if (name === 'go.mod' || name === 'go.sum') return 'go';
  const map: Record<string, string> = {
    go: 'go', proto: 'protobuf', tf: 'hcl', hcl: 'hcl',
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    json: 'json', yaml: 'yaml', yml: 'yaml', sh: 'bash',
    md: 'markdown', py: 'python', rs: 'rust', sql: 'sql',
    toml: 'toml', xml: 'xml', html: 'html', css: 'css',
  };
  return map[ext] ?? 'text';
}

function FileViewerModal({ file, onClose }: { file: { name: string; content: string }; onClose: () => void }) {
  const [html, setHtml] = useState<string>('');
  const [hlLoading, setHlLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const lang = extToLang(file.name);
    codeToHtml(file.content || ' ', { lang, theme: 'github-dark' })
      .then(result => { if (!cancelled) { setHtml(result); setHlLoading(false); } })
      .catch(() => {
        if (!cancelled) {
          codeToHtml(file.content || ' ', { lang: 'text', theme: 'github-dark' })
            .then(r => { if (!cancelled) { setHtml(r); setHlLoading(false); } })
            .catch(() => { if (!cancelled) setHlLoading(false); });
        }
      });
    return () => { cancelled = true; };
  }, [file.name, file.content]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const shortName = file.name.split('/').pop() ?? file.name;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#1a1a1a]/95 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-[20px] py-[12px] border-b border-[#464646] shrink-0">
        <div className="flex items-center gap-[10px]">
          <Icon icon="solar:file-code-linear" className="text-white/50 text-base" />
          <span className="font-['JetBrains_Mono',sans-serif] text-[13px] text-white">{shortName}</span>
          {shortName !== file.name && (
            <span className="text-[11px] text-white/30 font-['JetBrains_Mono',sans-serif]">{file.name}</span>
          )}
          <span className="text-[10px] font-bold uppercase text-white/30 border border-white/15 rounded px-[6px] py-[1px]">
            {extToLang(file.name)}
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-[6px] text-[11px] text-white/50 hover:text-white/80 transition-colors border border-white/15 hover:border-white/30 rounded px-[10px] py-[4px]"
        >
          <Icon icon="solar:close-linear" className="text-xs" />
          Close
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {hlLoading ? (
          <div className="flex items-center justify-center h-full"><Loader /></div>
        ) : html ? (
          <div
            className="shiki-container p-[24px] text-[12px] leading-[1.6] font-['JetBrains_Mono',sans-serif] min-h-full"
            dangerouslySetInnerHTML={{ __html: html }}
            style={{ '--shiki-dark-bg': '#1a1a1a' } as React.CSSProperties}
          />
        ) : (
          <pre className="p-[24px] text-[12px] text-white/70 font-['JetBrains_Mono',sans-serif] whitespace-pre-wrap leading-[1.6]">
            {file.content}
          </pre>
        )}
      </div>
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
  const [uninstallTarget, setUninstallTarget] = useState<CodeblockInstance | null>(null);
  const [configureTarget, setConfigureTarget] = useState<CodeblockInstance | null>(null);

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader /></div>;
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
          {instances.map(inst => (
            <div key={inst.name} className="bg-[#2c2c2c] border border-[#464646] rounded-[4px] p-[16px]">
              <div className="flex items-start justify-between mb-[12px]">
                <div>
                  <div className="flex items-center gap-[10px] mb-[4px]">
                    <span className="font-['JetBrains_Mono',sans-serif] font-bold text-[13px] text-white">
                      {inst.shortId}
                    </span>
                    {inst.state > 0 && (
                      <span className={`text-[9px] font-bold uppercase rounded px-[6px] py-[2px] ${STATE_COLOR[inst.state] ?? 'text-white/50 bg-white/5'}`}>
                        {STATE_LABEL[inst.state] ?? 'Unknown'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/50 font-['JetBrains_Mono',sans-serif]">{inst.package}</p>
                </div>
                <div className="flex items-center gap-[8px]">
                  <button
                    onClick={() => setConfigureTarget(inst)}
                    className="text-[10px] text-white/40 hover:text-white/70 border border-[#464646] rounded px-[10px] py-[4px] transition-colors"
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
                    <p className="text-white/30 uppercase text-[9px] font-bold mb-[2px]">Version</p>
                    <p className="text-white/70 font-['JetBrains_Mono',sans-serif]">{shortBlockId(inst.blockVersion)}</p>
                  </div>
                )}
                {inst.createTime && (
                  <div>
                    <p className="text-white/30 uppercase text-[9px] font-bold mb-[2px]">Installed</p>
                    <p className="text-white/70">{formatDate(inst.createTime)}</p>
                  </div>
                )}
                {inst.entitlement && (
                  <div className="col-span-2">
                    <p className="text-white/30 uppercase text-[9px] font-bold mb-[2px]">Entitlement</p>
                    <p className="text-white/50 font-['JetBrains_Mono',sans-serif] text-[10px] truncate">{inst.entitlement}</p>
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
          onDone={() => { setUninstallTarget(null); onRefresh(); }}
        />
      )}

      {configureTarget && (
        <ConfigureModal
          instance={configureTarget}
          blockId={blockId}
          onClose={() => setConfigureTarget(null)}
          onDone={() => { setConfigureTarget(null); onRefresh(); }}
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
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function doUninstall() {
    setLoading(true);
    setError('');
    (ProductService.UninstallCodeblockInstance as (name: string) => Promise<void>)(inst.name)
      .then(onDone)
      .catch(e => { setError(String(e)); setLoading(false); });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1e1e1e] border border-[#464646] rounded-[8px] flex flex-col shadow-2xl w-[480px]">
        <div className="flex items-center gap-[12px] px-[24px] py-[18px] border-b border-[#464646]">
          <Icon icon="solar:trash-bin-minimalistic-linear" className="text-red-400 text-lg" />
          <div>
            <h2 className="font-['JetBrains_Mono',sans-serif] font-bold text-[13px] text-white uppercase">
              Uninstall Instance
            </h2>
            <p className="text-[11px] text-white/40 mt-[2px]">
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

          <div className="bg-white/3 border border-[#464646] rounded-[4px] text-[11px] overflow-hidden">
            {[
              { label: 'Instance', value: inst.name },
              { label: 'State', value: STATE_LABEL[inst.state] ?? 'Unknown', color: STATE_COLOR[inst.state] },
              { label: 'Package', value: inst.package },
              { label: 'Block Version', value: inst.blockVersion },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex gap-[12px] px-[12px] py-[8px] border-b border-[#464646] last:border-0">
                <span className="text-white/30 w-[90px] shrink-0">{label}</span>
                {color ? (
                  <span className={`text-[9px] font-bold uppercase rounded px-[6px] py-[1px] self-center ${color}`}>{value}</span>
                ) : (
                  <span className="text-white/70 font-['JetBrains_Mono',sans-serif] break-all">{value}</span>
                )}
              </div>
            ))}
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-white/40 mb-[6px]">
              Type <span className="text-white/70 font-['JetBrains_Mono',sans-serif]">{inst.shortId}</span> to confirm
            </label>
            <input
              type="text"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder={inst.shortId}
              disabled={loading}
              className="w-full bg-[#2c2c2c] border border-[#464646] rounded-[4px] px-[12px] py-[8px] text-[12px] text-white font-['JetBrains_Mono',sans-serif] focus:outline-none focus:border-red-400/50 transition-colors disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-[8px] px-[24px] py-[16px] border-t border-[#464646]">
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            variant="primary"
            onClick={doUninstall}
            disabled={confirm !== inst.shortId || loading}
            className="bg-red-500/20 border-red-500/40 text-red-300 hover:bg-red-500/30 hover:border-red-500/60"
          >
            {loading ? <><Loader size={14} /><span className="ml-2">Uninstalling…</span></> : 'Uninstall'}
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
  const [selectedVersion, setSelectedVersion] = useState(inst.blockVersion ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (ProductService.ListCodeblockVersions as (id: string) => Promise<CodeblockVersion[]>)(blockId)
      .then(list => {
        const l = list ?? [];
        setVersions(l);
        if (!selectedVersion && l.length > 0) setSelectedVersion(l[0].name);
      })
      .catch(e => setError(String(e)))
      .finally(() => setVersionsLoading(false));
  }, [blockId]);

  function doUpgrade() {
    if (!selectedVersion) return;
    setLoading(true);
    setError('');
    (ProductService.UpgradeCodeblockInstance as (name: string, version: string) => Promise<void>)(inst.name, selectedVersion)
      .then(onDone)
      .catch(e => { setError(String(e)); setLoading(false); });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1e1e1e] border border-[#464646] rounded-[8px] flex flex-col shadow-2xl w-[480px]">
        <div className="flex items-center justify-between px-[24px] py-[18px] border-b border-[#464646]">
          <div>
            <h2 className="font-['JetBrains_Mono',sans-serif] font-bold text-[13px] text-white uppercase">
              Configure Installation
            </h2>
            <p className="text-[11px] text-white/40 mt-[2px] font-['JetBrains_Mono',sans-serif]">{inst.name}</p>
          </div>
          {!loading && (
            <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors p-[4px]">
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
            <label className="block text-[10px] font-bold uppercase text-white/40 mb-[6px]">Block Version</label>
            <FilterSelect
              size="lg"
              value={selectedVersion}
              onChange={setSelectedVersion}
              loading={versionsLoading}
              placeholder="Select version…"
              options={versions.map(v => ({ value: v.name, label: v.versionTag }))}
            />
            {selectedVersion && selectedVersion === inst.blockVersion && (
              <p className="mt-[6px] text-[10px] text-white/30">This is the currently installed version.</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-[8px] px-[24px] py-[16px] border-t border-[#464646]">
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            variant="primary"
            onClick={doUpgrade}
            disabled={!selectedVersion || versionsLoading || loading}
          >
            {loading ? <><Loader size={14} /><span className="ml-2">Upgrading…</span></> : 'Upgrade'}
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
          <h2 className="font-['JetBrains_Mono',sans-serif] font-bold text-[14px] text-white uppercase mb-[8px]">
            Get Help
          </h2>
          <p className="text-[12px] text-white/60 leading-[1.6]">
            Have questions about this block or need support? Use the links below to get in touch or report an issue.
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

function HelpLink({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <button className="flex items-center gap-[16px] bg-[#2c2c2c] border border-[#464646] rounded-[4px] p-[16px] text-left hover:border-white/30 transition-colors group w-full">
      <Icon icon={icon} className="text-xl text-white/40 group-hover:text-white/70 shrink-0 transition-colors" />
      <div className="flex-1">
        <p className="text-[12px] text-white font-bold mb-[2px]">{title}</p>
        <p className="text-[11px] text-white/40">{desc}</p>
      </div>
      <Icon icon="solar:arrow-right-linear" className="text-white/20 group-hover:text-white/50 transition-colors" />
    </button>
  );
}
