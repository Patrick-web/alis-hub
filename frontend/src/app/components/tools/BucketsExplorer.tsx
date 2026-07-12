import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { Loader } from '../Loader';
import { Button } from '../Button';
import { FilePreview, detectKind, b64ToText, kindIcon } from '../FilePreview';
import * as GS from '../../../../bindings/alis-hub-v3/gcloudservice';
import type { GCSBucket, GCSObject, GCSObjectMetadata } from '../../../../bindings/alis-hub-v3/models';
import { useGCloud } from '../../stores/gcloud';

interface Props {
  projectID: string;
}

function formatBytes(sizeStr: string): string {
  const n = parseInt(sizeStr, 10);
  if (isNaN(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function shortName(fullName: string, prefix: string): string {
  return fullName.slice(prefix.length);
}

function folderLabel(prefix: string, parentPrefix: string): string {
  const rel = prefix.slice(parentPrefix.length);
  return rel.replace(/\/$/, '');
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

// ── Mini preview ──────────────────────────────────────────────────────────────

interface MiniPreviewProps {
  contentType: string;
  content: string | null;
  loading: boolean;
  error: string | null;
  onExpand: () => void;
}

function MiniPreview({ contentType, content, loading, error, onExpand }: MiniPreviewProps) {
  const kind = detectKind(contentType);
  const dataURL = content ? `data:${contentType};base64,${content}` : '';

  return (
    <div
      className="relative h-[160px] bg-background cursor-pointer group overflow-hidden border-b border-border"
      onClick={onExpand}
    >
      {loading ? (
        <div className="flex items-center justify-center h-full">
          <Loader size={20} />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-full gap-[6px] px-[12px]">
          <Icon icon="solar:file-broken-linear" className="text-2xl text-foreground/15" />
          <p className="text-[8px] text-foreground/30 font-mono text-center leading-tight">{error}</p>
        </div>
      ) : kind === 'image' && content ? (
        <img src={dataURL} alt="" className="w-full h-full object-contain" />
      ) : kind === 'pdf' && content ? (
        <iframe
          src={dataURL}
          title="pdf-mini"
          className="border-0 pointer-events-none origin-top-left"
          style={{ width: '200%', height: '200%', transform: 'scale(0.5)' }}
        />
      ) : kind === 'video' && content ? (
        <video src={dataURL} className="w-full h-full object-contain pointer-events-none" />
      ) : kind === 'audio' ? (
        <div className="flex items-center justify-center h-full">
          <Icon icon="solar:music-note-2-linear" className="text-4xl text-foreground/15" />
        </div>
      ) : kind === 'text' && content ? (
        <pre className="absolute inset-0 p-[8px] text-[7px] text-foreground/40 font-mono leading-[1.4] overflow-hidden whitespace-pre-wrap break-all pointer-events-none">
          {b64ToText(content).slice(0, 800)}
        </pre>
      ) : (
        <div className="flex items-center justify-center h-full">
          <Icon icon={kindIcon(kind)} className="text-4xl text-foreground/10" />
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-[5px] bg-black/70 rounded-[4px] px-[10px] py-[5px]">
          <Icon icon="solar:maximize-square-2-linear" className="text-xs text-foreground" />
          <span className="text-[9px] text-foreground font-mono">Expand</span>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BucketsExplorer({ projectID }: Props) {
  const [buckets, setBuckets] = useState<GCSBucket[]>([]);
  const [bucketsLoading, setBucketsLoading] = useState(true);
  const [bucketsError, setBucketsError] = useState<string | null>(null);

  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [prefix, setPrefix] = useState('');
  const [prefixStack, setPrefixStack] = useState<string[]>([]);

  const [objects, setObjects] = useState<GCSObject[]>([]);
  const [prefixes, setPrefixes] = useState<string[]>([]);
  const [objectsLoading, setObjectsLoading] = useState(false);
  const [objectsError, setObjectsError] = useState<string | null>(null);

  const [selectedObject, setSelectedObject] = useState<GCSObject | null>(null);
  const [objectMeta, setObjectMeta] = useState<GCSObjectMetadata | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  // Content is fetched once when a file is selected; shared by mini preview + modal
  const [objectContent, setObjectContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    setBucketsLoading(true);
    setBucketsError(null);
    GS.ListBuckets(projectID)
      .then(setBuckets)
      .catch((e: unknown) => { if (useGCloud.getState().handleError(e)) return; setBucketsError(String(e)); })
      .finally(() => setBucketsLoading(false));
  }, [projectID]);

  useEffect(() => {
    if (!selectedBucket) return;
    setObjectsLoading(true);
    setObjectsError(null);
    GS.ListObjects(selectedBucket, prefix, '')
      .then((res) => {
        setObjects(res.items ?? []);
        setPrefixes(res.prefixes ?? []);
      })
      .catch((e: unknown) => { if (useGCloud.getState().handleError(e)) return; setObjectsError(String(e)); })
      .finally(() => setObjectsLoading(false));
  }, [selectedBucket, prefix]);

  useEffect(() => {
    if (!selectedObject || !selectedBucket) {
      setObjectMeta(null);
      setObjectContent(null);
      return;
    }
    // Load metadata
    setMetaLoading(true);
    setMetaError(null);
    GS.GetObjectMetadata(selectedBucket, selectedObject.name)
      .then(setObjectMeta)
      .catch((e: unknown) => { if (useGCloud.getState().handleError(e)) return; setMetaError(String(e)); })
      .finally(() => setMetaLoading(false));

    // Load content eagerly for the mini preview (skip unsupported types)
    const ct = selectedObject.contentType || 'application/octet-stream';
    if (detectKind(ct) === 'unsupported') {
      setObjectContent(null);
      setContentLoading(false);
      setContentError(null);
      return;
    }
    setObjectContent(null);
    setContentLoading(true);
    setContentError(null);
    GS.GetObjectContent(selectedBucket, selectedObject.name)
      .then(setObjectContent)
      .catch((e: unknown) => { if (useGCloud.getState().handleError(e)) return; setContentError(String(e)); })
      .finally(() => setContentLoading(false));
  }, [selectedObject, selectedBucket]);

  function selectBucket(name: string) {
    setSelectedBucket(name);
    setPrefix('');
    setPrefixStack([]);
    setObjects([]);
    setPrefixes([]);
    setSelectedObject(null);
  }

  function enterFolder(folderPrefix: string) {
    setPrefixStack((s) => [...s, prefix]);
    setPrefix(folderPrefix);
    setSelectedObject(null);
  }

  function goUp() {
    const stack = [...prefixStack];
    const prev = stack.pop() ?? '';
    setPrefixStack(stack);
    setPrefix(prev);
    setSelectedObject(null);
  }

  function breadcrumbs(): { label: string; prefix: string }[] {
    const crumbs = [{ label: selectedBucket ?? '', prefix: '' }];
    let built = '';
    for (const segment of prefixStack.concat(prefix ? [prefix] : [])) {
      const part = segment.slice(built.length).replace(/\/$/, '');
      built = segment;
      if (part) crumbs.push({ label: part, prefix: built });
    }
    return crumbs;
  }

  const selectedContentType = selectedObject?.contentType || objectMeta?.contentType || 'application/octet-stream';

  return (
    <div className="flex h-full">
      {/* Bucket list */}
      <div className="w-[220px] shrink-0 border-r border-border flex flex-col">
        <div className="flex items-center justify-between px-[12px] py-[10px] border-b border-border">
          <p className="text-[9px] font-bold uppercase text-foreground/40 font-mono">Buckets</p>
          <button
            onClick={() => {
              setBucketsLoading(true);
              GS.ListBuckets(projectID).then(setBuckets).catch((e: unknown) => { if (useGCloud.getState().handleError(e)) return; setBucketsError(String(e)); }).finally(() => setBucketsLoading(false));
            }}
            className="text-foreground/40 hover:text-foreground transition-colors"
          >
            <Icon icon="solar:refresh-linear" className="text-sm" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {bucketsLoading ? (
            <div className="flex items-center justify-center py-8"><Loader size={24} /></div>
          ) : bucketsError ? (
            <div className="p-[12px]">
              <p className="text-[10px] text-red-400 font-mono">{bucketsError}</p>
            </div>
          ) : buckets.length === 0 ? (
            <p className="text-[10px] text-foreground/30 p-[12px]">No buckets found</p>
          ) : (
            buckets.map((b) => (
              <button
                key={b.name}
                onClick={() => selectBucket(b.name)}
                className={`w-full flex items-center gap-[8px] px-[12px] py-[8px] text-left transition-colors ${
                  selectedBucket === b.name
                    ? 'bg-brand-fill/10 border-r-2 border-r-brand-fill'
                    : 'hover:bg-foreground/[3%]'
                }`}
              >
                <Icon icon="solar:folder-bold" className={`text-base shrink-0 ${selectedBucket === b.name ? 'text-brand' : 'text-foreground/40'}`} />
                <span className={`text-[10px] font-mono truncate ${selectedBucket === b.name ? 'text-foreground' : 'text-foreground/60'}`}>
                  {b.name}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Object browser */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-[16px] py-[10px] border-b border-border gap-[8px] shrink-0">
          <div className="flex items-center gap-[4px] flex-1 min-w-0">
            {selectedBucket ? (
              breadcrumbs().map((crumb, i) => (
                <div key={i} className="flex items-center gap-[4px]">
                  {i > 0 && <Icon icon="solar:alt-arrow-right-linear" className="text-xs text-foreground/30" />}
                  <button
                    onClick={() => {
                      if (i === 0) { setPrefix(''); setPrefixStack([]); }
                      else {
                        const stack = prefixStack.slice(0, i);
                        setPrefixStack(stack);
                        setPrefix(i < breadcrumbs().length - 1 ? crumb.prefix : prefix);
                      }
                      setSelectedObject(null);
                    }}
                    className={`text-[10px] font-mono hover:text-foreground transition-colors truncate max-w-[120px] ${
                      i === breadcrumbs().length - 1 ? 'text-foreground' : 'text-foreground/50'
                    }`}
                  >
                    {crumb.label}
                  </button>
                </div>
              ))
            ) : (
              <p className="text-[10px] text-foreground/30 font-mono">Select a bucket</p>
            )}
          </div>
          {selectedBucket && (
            <Button
              variant="ghost"
              onClick={() => GS.OpenInConsole('storage', projectID, selectedBucket)}
              icon={<Icon icon="solar:export-linear" className="text-xs" />}
              className="shrink-0 text-foreground/50 hover:text-foreground"
            >
              Open in Console
            </Button>
          )}
        </div>

        {/* Content row: object list + info panel */}
        <div className="flex flex-1 overflow-hidden">
          {/* Object list */}
          <div className="flex-1 overflow-y-auto min-w-0">
            {!selectedBucket ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Icon icon="solar:cloud-storage-linear" className="text-4xl text-foreground/10 mb-[8px]" />
                  <p className="text-[11px] text-foreground/30 font-mono">Select a bucket to browse</p>
                </div>
              </div>
            ) : objectsLoading ? (
              <div className="flex items-center justify-center py-16"><Loader size={32} /></div>
            ) : objectsError ? (
              <div className="flex items-center justify-center p-[24px]">
                <div className="text-center">
                  <p className="text-[11px] text-red-400 font-mono mb-[8px]">{objectsError}</p>
                  <Button variant="secondary" onClick={() => {
                    setObjectsLoading(true);
                    GS.ListObjects(selectedBucket, prefix, '').then((res) => { setObjects(res.items ?? []); setPrefixes(res.prefixes ?? []); }).catch((e: unknown) => { if (useGCloud.getState().handleError(e)) return; setObjectsError(String(e)); }).finally(() => setObjectsLoading(false));
                  }}>Retry</Button>
                </div>
              </div>
            ) : (
              <>
                {prefix && (
                  <button onClick={goUp} className="w-full flex items-center gap-[10px] px-[16px] py-[8px] hover:bg-foreground/[3%] border-b border-border transition-colors">
                    <Icon icon="solar:arrow-left-linear" className="text-sm text-foreground/30" />
                    <span className="text-[10px] text-foreground/40 font-mono">..</span>
                  </button>
                )}
                {prefixes.map((p) => (
                  <button
                    key={p}
                    onClick={() => enterFolder(p)}
                    className="w-full flex items-center gap-[10px] px-[16px] py-[8px] hover:bg-foreground/[3%] border-b border-border transition-colors"
                  >
                    <Icon icon="solar:folder-linear" className="text-sm text-foreground/40 shrink-0" />
                    <span className="text-[10px] text-foreground/70 font-mono flex-1 text-left truncate">
                      {folderLabel(p, prefix)}
                    </span>
                  </button>
                ))}
                {objects.map((obj) => (
                  <button
                    key={obj.name}
                    onClick={() => setSelectedObject((prev) => prev?.name === obj.name ? null : obj)}
                    onDoubleClick={() => { setSelectedObject(obj); setShowPreview(true); }}
                    className={`w-full flex items-center gap-[10px] px-[16px] py-[8px] border-b border-border transition-colors text-left ${
                      selectedObject?.name === obj.name
                        ? 'bg-brand-fill/8 border-r-2 border-r-brand-fill'
                        : 'hover:bg-foreground/[3%]'
                    }`}
                  >
                    <Icon icon="solar:file-linear" className={`text-sm shrink-0 ${selectedObject?.name === obj.name ? 'text-brand' : 'text-foreground/30'}`} />
                    <span className={`text-[10px] font-mono flex-1 truncate ${selectedObject?.name === obj.name ? 'text-foreground' : 'text-foreground/70'}`}>
                      {shortName(obj.name, prefix)}
                    </span>
                    <span className="text-[9px] text-foreground/30 font-mono shrink-0">
                      {formatBytes(obj.size)}
                    </span>
                    <span className="text-[9px] text-foreground/20 font-mono shrink-0 hidden lg:block">
                      {obj.updated ? new Date(obj.updated).toLocaleDateString() : ''}
                    </span>
                  </button>
                ))}
                {prefixes.length === 0 && objects.length === 0 && (
                  <div className="flex items-center justify-center py-[48px]">
                    <p className="text-[10px] text-foreground/20 font-mono">Empty folder</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* File info panel */}
          {selectedObject && (
            <div className="w-[260px] shrink-0 border-l border-border flex flex-col">
              {/* Panel header */}
              <div className="flex items-center justify-between px-[12px] py-[10px] border-b border-border shrink-0">
                <p className="text-[9px] font-bold uppercase text-foreground/40 font-mono">File Info</p>
                <div className="flex items-center gap-[8px]">
                  <button
                    onClick={() => GS.OpenInConsole('storage-object', projectID, `${selectedBucket}/${selectedObject.name}`)}
                    className="text-foreground/30 hover:text-foreground transition-colors"
                    title="Open in Google Cloud Console"
                  >
                    <Icon icon="solar:export-linear" className="text-sm" />
                  </button>
                  <button
                    onClick={() => setSelectedObject(null)}
                    className="text-foreground/30 hover:text-foreground transition-colors"
                  >
                    <Icon icon="solar:close-square-linear" className="text-sm" />
                  </button>
                </div>
              </div>

              {/* Mini preview */}
              <MiniPreview
                contentType={selectedContentType}
                content={objectContent}
                loading={contentLoading}
                error={contentError}
                onExpand={() => setShowPreview(true)}
              />

              {/* Metadata */}
              <div className="flex-1 overflow-y-auto">
                {metaLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader size={20} /></div>
                ) : metaError ? (
                  <p className="text-[10px] text-red-400 font-mono p-[12px]">{metaError}</p>
                ) : objectMeta ? (
                  <div className="flex flex-col">
                    <MetaRow label="Name" value={shortName(objectMeta.name, prefix)} mono />
                    <MetaRow label="Bucket" value={objectMeta.bucket} mono />
                    <MetaRow label="Size" value={formatBytes(objectMeta.size)} />
                    <MetaRow label="Content Type" value={objectMeta.contentType || '—'} mono />
                    <MetaRow label="Storage Class" value={objectMeta.storageClass || '—'} />
                    <MetaRow label="Created" value={fmtDate(objectMeta.timeCreated)} />
                    <MetaRow label="Updated" value={fmtDate(objectMeta.updated)} />
                    <MetaRow label="Generation" value={objectMeta.generation || '—'} mono />
                    <MetaRow label="MD5 Hash" value={objectMeta.md5Hash || '—'} mono truncate />
                    <MetaRow label="CRC32C" value={objectMeta.crc32c || '—'} mono />
                    <MetaRow label="ETag" value={objectMeta.etag || '—'} mono truncate />
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full preview modal */}
      {showPreview && selectedObject && selectedBucket && (
        <FilePreview
          bucket={selectedBucket}
          objectName={selectedObject.name}
          contentType={selectedContentType}
          onClose={() => setShowPreview(false)}
          preloadedContent={objectContent}
          preloadedLoading={contentLoading}
          preloadedError={contentError}
        />
      )}
    </div>
  );
}

interface MetaRowProps {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}

function MetaRow({ label, value, mono, truncate }: MetaRowProps) {
  return (
    <div className="flex flex-col gap-[2px] px-[12px] py-[8px] border-b border-border">
      <p className="text-[8px] font-bold uppercase text-foreground/30 font-mono">{label}</p>
      <p
        className={`text-[10px] text-foreground/80 break-all ${mono ? "font-mono" : ''} ${truncate ? 'line-clamp-2' : ''}`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}
