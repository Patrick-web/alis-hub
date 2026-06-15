import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { marked } from 'marked';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';
import { Loader } from '../components/Loader';
import { Button } from '../components/Button';

const LEVEL_LABEL: Record<number, string> = {
  1: 'Stable',
  2: 'Release Candidate',
  3: 'Beta',
  4: 'Alpha',
  5: 'Experimental',
};

const LEVEL_COLOR: Record<number, string> = {
  1: 'text-green-400 border-green-400/30 bg-green-400/10',
  2: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
  3: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
  4: 'text-orange-400 border-orange-400/30 bg-orange-400/10',
  5: 'text-red-400 border-red-400/30 bg-red-400/10',
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

  const go = useCallback((t: Tab) => navigate(`/codeblocks/${blockId}/${t}`), [blockId, navigate]);

  // Load block metadata + members on mount
  useEffect(() => {
    if (!blockId) return;
    setBlockLoading(true);
    Promise.all([
      (ProductService.GetCodeblock as (id: string) => Promise<Codeblock>)(blockId),
      (ProductService.GetCodeblockMembers as (id: string) => Promise<CodeblockMember[]>)(blockId).catch(() => [] as CodeblockMember[]),
    ]).then(([b, m]) => {
      setBlock(b);
      setMembers(m ?? []);
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
          <Button
            variant="secondary"
            className="w-full"
            icon={<Icon icon="solar:box-linear" />}
            onClick={() => go('instances')}
          >
            Instances
          </Button>
          <Button
            variant="primary"
            className="w-full"
            icon={<Icon icon="solar:download-linear" />}
          >
            Install Block
          </Button>
        </div>
      </div>

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
            <InstancesTab instances={instances} loading={instancesLoading} />
          )}
          {activeTab === 'help' && <HelpTab blockId={blockId} />}
        </div>
      </div>
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
}: {
  doc: string;
  agentDoc: string;
  loading: boolean;
  audience: 'user' | 'agent';
  onAudienceChange: (a: 'user' | 'agent') => void;
}) {
  const [copied, setCopied] = useState(false);
  const content = audience === 'agent' ? agentDoc : doc;
  const html = content ? (marked.parse(content) as string) : '';

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
          <div className="flex flex-col items-center justify-center py-[60px] gap-[12px]">
            <Icon icon="solar:document-text-linear" className="text-4xl text-white/20" />
            <p className="text-[13px] text-white/30">No documentation available</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Versions Tab ──────────────────────────────────────────────────────────────

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
  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader /></div>;
  }
  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-[12px]">
        <Icon icon="solar:box-linear" className="text-4xl text-white/20" />
        <p className="text-[13px] text-white/30">No versions published yet</p>
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* Version list */}
      <div className="w-[260px] shrink-0 border-r border-[#464646] overflow-auto">
        {versions.map(v => (
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
              {v.releaseLevel > 0 && (
                <span className={`text-[8px] font-bold uppercase border rounded px-[5px] py-[1px] ${LEVEL_COLOR[v.releaseLevel] ?? 'text-white/50 border-white/10 bg-white/5'}`}>
                  {LEVEL_LABEL[v.releaseLevel] ?? ''}
                </span>
              )}
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
          <div className="max-w-[700px] flex flex-col gap-[20px]">
            <div>
              <h2 className="font-['JetBrains_Mono',sans-serif] font-bold text-[16px] text-white uppercase mb-[4px]">
                {selected.versionTag}
              </h2>
              <div className="flex items-center gap-[12px] text-[11px] text-white/40">
                {selected.createTime && <span>Published {formatDate(selected.createTime)}</span>}
                {selected.releaseLevel > 0 && (
                  <span className={`text-[9px] font-bold uppercase border rounded px-[5px] py-[1px] ${LEVEL_COLOR[selected.releaseLevel] ?? ''}`}>
                    {LEVEL_LABEL[selected.releaseLevel]}
                  </span>
                )}
              </div>
            </div>

            {selected.releaseNotes && (
              <div>
                <p className="text-[10px] font-bold uppercase text-white/40 mb-[8px]">Release Notes</p>
                <div className="bg-[#2c2c2c] border border-[#464646] rounded-[4px] p-[16px]">
                  <p className="text-[13px] text-white/80 leading-[1.6]">{selected.releaseNotes}</p>
                </div>
              </div>
            )}

            {selected.files && selected.files.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase text-white/40 mb-[8px]">Files</p>
                <div className="flex flex-col gap-[4px]">
                  {selected.files.map(folder => (
                    <div key={folder.name} className="bg-[#2c2c2c] border border-[#464646] rounded-[4px] overflow-hidden">
                      <div className="flex items-center gap-[8px] px-[12px] py-[10px] border-b border-[#464646]">
                        <Icon icon="solar:folder-linear" className="text-white/50 text-sm" />
                        <span className="text-[12px] text-white font-['JetBrains_Mono',sans-serif]">{folder.name}</span>
                      </div>
                      {folder.files?.map(f => (
                        <div key={f.name} className="flex items-center gap-[8px] px-[12px] py-[8px] pl-[32px] border-b border-[#464646] last:border-0">
                          <Icon icon="solar:file-linear" className="text-white/30 text-xs" />
                          <span className="text-[11px] text-white/70 font-['JetBrains_Mono',sans-serif]">{f.name}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Instances Tab ─────────────────────────────────────────────────────────────

function InstancesTab({ instances, loading }: { instances: CodeblockInstance[]; loading: boolean }) {
  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader /></div>;
  }
  if (instances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-[12px]">
        <Icon icon="solar:box-linear" className="text-4xl text-white/20" />
        <p className="text-[13px] text-white/30">No instances found</p>
        <p className="text-[11px] text-white/20">Install this block to create an instance</p>
      </div>
    );
  }

  return (
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
                <button className="text-[10px] text-white/40 hover:text-white/70 border border-[#464646] rounded px-[10px] py-[4px] transition-colors">
                  Configure
                </button>
                <button className="text-[10px] text-red-400/70 hover:text-red-400 border border-red-400/20 rounded px-[10px] py-[4px] transition-colors">
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
