import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icon } from '@iconify/react';
import { codeToHtml } from 'shiki';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Loader } from '../components/Loader';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';
import * as models from '../../../bindings/alis-hub-v3/models';

interface FileEntry {
  name: string;
  content: string;
}

const RELEASE_LEVELS = [
  { label: 'EXPERIMENTAL', value: 3 },
  { label: 'ALPHA', value: 6 },
  { label: 'BETA', value: 9 },
  { label: 'RC', value: 12 },
  { label: 'GA', value: 99 },
];

const labelClass = 'text-[10px] font-bold uppercase text-white/40 mb-[2px]';
const textareaClass = "bg-[#1e1e1e] border border-[#464646] rounded-[4px] p-[10px] text-white text-[12px] font-['JetBrains_Mono',sans-serif] outline-none focus:border-[#f881a9] resize-none w-full transition-colors";
const selectClass = "bg-[#1e1e1e] border border-[#464646] rounded-[4px] px-[10px] py-[8px] text-white text-[12px] outline-none focus:border-[#f881a9] w-full transition-colors appearance-none";

export function CodeblockContributePage() {
  const navigate = useNavigate();
  const { id: blockId } = useParams<{ id: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sidebar fields
  const [versionTag, setVersionTag] = useState('');
  const [releaseLevel, setReleaseLevel] = useState(3);
  const [releaseNotes, setReleaseNotes] = useState('');

  // Uploaded files organised by folder
  const [protoFiles, setProtoFiles] = useState<FileEntry[]>([]);
  const [infraFiles, setInfraFiles] = useState<FileEntry[]>([]);
  const [buildFiles, setBuildFiles] = useState<FileEntry[]>([]);
  const hasFiles = protoFiles.length > 0 || infraFiles.length > 0 || buildFiles.length > 0;

  // File tree UI
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['Proto', 'Infra', 'Build']));
  const [openFile, setOpenFile] = useState<FileEntry | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleFolder(name: string) {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function readFolderFiles(files: File[]) {
    const proto: FileEntry[] = [], infra: FileEntry[] = [], build: FileEntry[] = [];
    await Promise.all(files.map(file => new Promise<void>(resolve => {
      // webkitRelativePath = "rootfolder/proto/service.proto"
      const parts = file.webkitRelativePath.split('/');
      const bucket = parts[1]?.toLowerCase();
      // name = path relative to the bucket subfolder, e.g. "service.proto" or "subdir/file.proto"
      const name = parts.slice(2).join('/') || parts[1] || file.name;
      const reader = new FileReader();
      reader.onload = () => {
        const entry: FileEntry = { name, content: reader.result as string };
        if (bucket === 'proto') proto.push(entry);
        else if (bucket === 'infra') infra.push(entry);
        else if (bucket === 'build') build.push(entry);
        resolve();
      };
      reader.onerror = () => resolve();
      reader.readAsText(file);
    })));
    setProtoFiles(proto);
    setInfraFiles(infra);
    setBuildFiles(build);
    setError(null);
  }

  function handleFolderSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) readFolderFiles(files);
    // Reset input so the same folder can be re-selected
    e.target.value = '';
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const items = Array.from(e.dataTransfer.items);
    const entry = items[0]?.webkitGetAsEntry?.();
    if (!entry?.isDirectory) {
      setError('Please drop a folder, not individual files.');
      return;
    }
    const files = await readEntriesRecursive(entry as FileSystemDirectoryEntry);
    readFolderFiles(files);
  }

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      const toItems = (files: FileEntry[]) =>
        files.map(f => models.CodeblockFileItem.createFrom({ name: f.name, content: f.content }));

      const params = models.ContributeBlockParams.createFrom({
        blockId: blockId ?? '',
        versionTag,
        releaseNotes,
        releaseLevel,
        protoFiles: toItems(protoFiles),
        infraFiles: toItems(infraFiles),
        buildFiles: toItems(buildFiles),
      });

      await (ProductService.ContributeBlock as (p: typeof params) => Promise<string>)(params);
      navigate(`/codeblocks/${blockId}/versions`);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const folders = [
    { name: 'Proto', files: protoFiles },
    { name: 'Infra', files: infraFiles },
    { name: 'Build', files: buildFiles },
  ].filter(f => f.files.length > 0);

  return (
    <div className="flex-1 overflow-hidden flex flex-row bg-[#1e1e1e]">
      {/* Hidden folder input */}
      <input
        ref={fileInputRef}
        type="file"
        // @ts-ignore — webkitdirectory is non-standard but universally supported
        webkitdirectory=""
        multiple
        className="hidden"
        onChange={handleFolderSelect}
      />

      {/* Sidebar */}
      <div className="w-[280px] shrink-0 flex flex-col border-r border-[#464646]">
        <button
          onClick={() => navigate(`/codeblocks/${blockId}/versions`)}
          className="flex items-center gap-[8px] px-[16px] py-[12px] text-[11px] text-white/50 hover:text-white/80 border-b border-[#464646] transition-colors"
        >
          <Icon icon="solar:arrow-left-linear" />
          Versions
        </button>

        <div className="flex-1 overflow-auto p-[16px] flex flex-col gap-[16px]">
          <div>
            <p className={labelClass}>Version Tag</p>
            <Input
              placeholder="e.g. v1.0.0-experimental1"
              className="w-full"
              value={versionTag}
              onChange={e => setVersionTag((e.target as HTMLInputElement).value)}
            />
            <p className="text-[10px] text-white/30 mt-[6px]">Semantic version identifier</p>
          </div>

          <div>
            <p className={labelClass}>Release Level</p>
            <select
              className={selectClass}
              value={releaseLevel}
              onChange={e => setReleaseLevel(Number(e.target.value))}
            >
              {RELEASE_LEVELS.map(l => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>

          <div>
            <p className={labelClass}>Release Notes</p>
            <textarea
              className={`${textareaClass} h-[100px]`}
              placeholder="Describe what changed in this version"
              value={releaseNotes}
              onChange={e => setReleaseNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="p-[10px] border-t border-[#464646] flex flex-col gap-[8px]">
          {error && (
            <div className="text-[11px] text-[#ff6b6b] bg-[rgba(255,107,107,0.08)] border border-[rgba(255,107,107,0.2)] rounded-[4px] p-[10px]">
              {error}
            </div>
          )}
          <Button variant="secondary" className="w-full" onClick={() => navigate(`/codeblocks/${blockId}/versions`)} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="w-full"
            icon={<Icon icon={loading ? 'solar:spinner-linear' : 'solar:upload-linear'} className={loading ? 'animate-spin' : ''} />}
            onClick={handleSubmit}
            disabled={loading || !hasFiles}
          >
            {loading ? 'Publishing...' : 'Publish Version'}
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!hasFiles ? (
          // Drop zone
          <div
            className={`flex-1 flex flex-col items-center justify-center gap-[16px] m-[24px] border-2 border-dashed rounded-[8px] cursor-pointer transition-colors ${
              isDragging ? 'border-[#f881a9] bg-[rgba(248,129,169,0.04)]' : 'border-[#464646] hover:border-[#666] hover:bg-white/[0.02]'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Icon icon="solar:folder-open-linear" className="text-white/20 text-[48px]" />
            <div className="text-center">
              <p className="text-[14px] text-white/60 mb-[6px]">Drop a folder here or click to browse</p>
              <p className="text-[11px] text-white/30">Folder should contain <span className="font-['JetBrains_Mono',sans-serif]">proto/</span>, <span className="font-['JetBrains_Mono',sans-serif]">infra/</span>, <span className="font-['JetBrains_Mono',sans-serif]">build/</span> subdirectories</p>
            </div>
          </div>
        ) : (
          // File tree
          <div className="flex-1 overflow-auto p-[24px] flex flex-col gap-[16px]">
            {/* Replace folder button */}
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase text-white/40">
                {protoFiles.length + infraFiles.length + buildFiles.length} files loaded
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-[6px] text-[11px] text-white/40 hover:text-white/70 transition-colors"
              >
                <Icon icon="solar:refresh-linear" className="text-xs" />
                Replace folder
              </button>
            </div>

            <div className="flex flex-col gap-[4px]">
              {folders.map(folder => {
                const isExpanded = expandedFolders.has(folder.name);
                return (
                  <div key={folder.name} className="bg-[#2c2c2c] border border-[#464646] rounded-[4px] overflow-hidden">
                    <button
                      onClick={() => toggleFolder(folder.name)}
                      className="w-full flex items-center gap-[8px] px-[12px] py-[10px] border-b border-[#464646] hover:bg-white/[0.03] transition-colors text-left"
                    >
                      <Icon
                        icon={isExpanded ? 'solar:alt-arrow-down-linear' : 'solar:alt-arrow-right-linear'}
                        className="text-white/40 text-xs shrink-0"
                      />
                      <Icon icon="solar:folder-linear" className="text-white/50 text-sm shrink-0" />
                      <span className="text-[12px] text-white font-['JetBrains_Mono',sans-serif]">{folder.name}</span>
                      <span className="ml-auto text-[10px] text-white/30">{folder.files.length}</span>
                    </button>
                    {isExpanded && folder.files.map(f => (
                      <button
                        key={f.name}
                        onClick={() => setOpenFile(f)}
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

      {/* File viewer modal */}
      {openFile && <FileViewerModal file={openFile} onClose={() => setOpenFile(null)} />}
    </div>
  );
}

// ── File Viewer Modal ──────────────────────────────────────────────────────────

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

function FileViewerModal({ file, onClose }: { file: FileEntry; onClose: () => void }) {
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function readEntriesRecursive(dir: FileSystemDirectoryEntry): Promise<File[]> {
  return new Promise(resolve => {
    const reader = dir.createReader();
    const allFiles: File[] = [];
    function readBatch() {
      reader.readEntries(async entries => {
        if (entries.length === 0) { resolve(allFiles); return; }
        for (const entry of entries) {
          if (entry.isFile) {
            await new Promise<void>(res => (entry as FileSystemFileEntry).file(f => {
              // Preserve relative path via webkitRelativePath-like fullPath
              Object.defineProperty(f, 'webkitRelativePath', { value: entry.fullPath.slice(1) });
              allFiles.push(f);
              res();
            }));
          } else if (entry.isDirectory) {
            const sub = await readEntriesRecursive(entry as FileSystemDirectoryEntry);
            allFiles.push(...sub);
          }
        }
        readBatch();
      });
    }
    readBatch();
  });
}
