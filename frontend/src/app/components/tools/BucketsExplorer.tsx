import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { Loader } from '../Loader';
import { Button } from '../Button';
import * as GS from '../../../../bindings/alis-hub-v3/gcloudservice';
import type { GCSBucket, GCSObject } from '../../../../bindings/alis-hub-v3/models';

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

  useEffect(() => {
    setBucketsLoading(true);
    setBucketsError(null);
    GS.ListBuckets(projectID)
      .then(setBuckets)
      .catch((e: unknown) => setBucketsError(String(e)))
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
      .catch((e: unknown) => setObjectsError(String(e)))
      .finally(() => setObjectsLoading(false));
  }, [selectedBucket, prefix]);

  function selectBucket(name: string) {
    setSelectedBucket(name);
    setPrefix('');
    setPrefixStack([]);
    setObjects([]);
    setPrefixes([]);
  }

  function enterFolder(folderPrefix: string) {
    setPrefixStack((s) => [...s, prefix]);
    setPrefix(folderPrefix);
  }

  function goUp() {
    const stack = [...prefixStack];
    const prev = stack.pop() ?? '';
    setPrefixStack(stack);
    setPrefix(prev);
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

  return (
    <div className="flex h-full">
      {/* Bucket list */}
      <div className="w-[220px] shrink-0 border-r border-[#464646] flex flex-col">
        <div className="flex items-center justify-between px-[12px] py-[10px] border-b border-[#464646]">
          <p className="text-[9px] font-bold uppercase text-[rgba(255,255,255,0.4)] font-['JetBrains_Mono',sans-serif]">Buckets</p>
          <button
            onClick={() => {
              setBucketsLoading(true);
              GS.ListBuckets(projectID).then(setBuckets).catch((e: unknown) => setBucketsError(String(e))).finally(() => setBucketsLoading(false));
            }}
            className="text-[rgba(255,255,255,0.4)] hover:text-white transition-colors"
          >
            <Icon icon="solar:refresh-linear" className="text-sm" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {bucketsLoading ? (
            <div className="flex items-center justify-center py-8"><Loader size={24} /></div>
          ) : bucketsError ? (
            <div className="p-[12px]">
              <p className="text-[10px] text-red-400 font-['JetBrains_Mono',sans-serif]">{bucketsError}</p>
            </div>
          ) : buckets.length === 0 ? (
            <p className="text-[10px] text-[rgba(255,255,255,0.3)] p-[12px]">No buckets found</p>
          ) : (
            buckets.map((b) => (
              <button
                key={b.name}
                onClick={() => selectBucket(b.name)}
                className={`w-full flex items-center gap-[8px] px-[12px] py-[8px] text-left transition-colors ${
                  selectedBucket === b.name
                    ? 'bg-[rgba(248,129,169,0.1)] border-r-2 border-r-[#f881a9]'
                    : 'hover:bg-[rgba(255,255,255,0.03)]'
                }`}
              >
                <Icon icon="solar:folder-bold" className={`text-base shrink-0 ${selectedBucket === b.name ? 'text-[#f881a9]' : 'text-[rgba(255,255,255,0.4)]'}`} />
                <span className={`text-[10px] font-['JetBrains_Mono',sans-serif] truncate ${selectedBucket === b.name ? 'text-white' : 'text-[rgba(255,255,255,0.6)]'}`}>
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
        <div className="flex items-center justify-between px-[16px] py-[10px] border-b border-[#464646] gap-[8px]">
          <div className="flex items-center gap-[4px] flex-1 min-w-0">
            {selectedBucket ? (
              breadcrumbs().map((crumb, i) => (
                <div key={i} className="flex items-center gap-[4px]">
                  {i > 0 && <Icon icon="solar:alt-arrow-right-linear" className="text-xs text-[rgba(255,255,255,0.3)]" />}
                  <button
                    onClick={() => {
                      if (i === 0) { setPrefix(''); setPrefixStack([]); }
                      else {
                        const stack = prefixStack.slice(0, i);
                        const newPrefix = i < breadcrumbs().length - 1 ? crumb.prefix : prefix;
                        setPrefixStack(stack);
                        setPrefix(i < breadcrumbs().length - 1 ? crumb.prefix : prefix);
                        void newPrefix;
                      }
                    }}
                    className={`text-[10px] font-['JetBrains_Mono',sans-serif] hover:text-white transition-colors truncate max-w-[120px] ${
                      i === breadcrumbs().length - 1 ? 'text-white' : 'text-[rgba(255,255,255,0.5)]'
                    }`}
                  >
                    {crumb.label}
                  </button>
                </div>
              ))
            ) : (
              <p className="text-[10px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif]">Select a bucket</p>
            )}
          </div>
          {selectedBucket && (
            <Button
              variant="ghost"
              onClick={() => GS.OpenInConsole('storage', projectID, selectedBucket)}
              icon={<Icon icon="solar:export-linear" className="text-xs" />}
              className="shrink-0 text-[rgba(255,255,255,0.5)] hover:text-white"
            >
              Open in Console
            </Button>
          )}
        </div>

        {/* Content */}
        {!selectedBucket ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Icon icon="solar:cloud-storage-linear" className="text-4xl text-[rgba(255,255,255,0.1)] mb-[8px]" />
              <p className="text-[11px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif]">Select a bucket to browse</p>
            </div>
          </div>
        ) : objectsLoading ? (
          <div className="flex-1 flex items-center justify-center"><Loader size={32} /></div>
        ) : objectsError ? (
          <div className="flex-1 flex items-center justify-center p-[24px]">
            <div className="text-center">
              <p className="text-[11px] text-red-400 font-['JetBrains_Mono',sans-serif] mb-[8px]">{objectsError}</p>
              <Button variant="secondary" onClick={() => {
                setObjectsLoading(true);
                GS.ListObjects(selectedBucket, prefix, '').then((res) => { setObjects(res.items ?? []); setPrefixes(res.prefixes ?? []); }).catch((e: unknown) => setObjectsError(String(e))).finally(() => setObjectsLoading(false));
              }}>Retry</Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {prefix && (
              <button onClick={goUp} className="w-full flex items-center gap-[10px] px-[16px] py-[8px] hover:bg-[rgba(255,255,255,0.03)] border-b border-[#2a2a2a] transition-colors group">
                <Icon icon="solar:arrow-left-linear" className="text-sm text-[rgba(255,255,255,0.3)]" />
                <span className="text-[10px] text-[rgba(255,255,255,0.4)] font-['JetBrains_Mono',sans-serif]">..</span>
              </button>
            )}
            {prefixes.map((p) => (
              <button
                key={p}
                onClick={() => enterFolder(p)}
                className="w-full flex items-center gap-[10px] px-[16px] py-[8px] hover:bg-[rgba(255,255,255,0.03)] border-b border-[#2a2a2a] transition-colors"
              >
                <Icon icon="solar:folder-linear" className="text-sm text-[rgba(255,255,255,0.4)] shrink-0" />
                <span className="text-[10px] text-[rgba(255,255,255,0.7)] font-['JetBrains_Mono',sans-serif] flex-1 text-left truncate">
                  {folderLabel(p, prefix)}
                </span>
              </button>
            ))}
            {objects.map((obj) => (
              <div key={obj.name} className="flex items-center gap-[10px] px-[16px] py-[8px] border-b border-[#2a2a2a]">
                <Icon icon="solar:file-linear" className="text-sm text-[rgba(255,255,255,0.3)] shrink-0" />
                <span className="text-[10px] text-[rgba(255,255,255,0.7)] font-['JetBrains_Mono',sans-serif] flex-1 truncate">
                  {shortName(obj.name, prefix)}
                </span>
                <span className="text-[9px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif] shrink-0">
                  {formatBytes(obj.size)}
                </span>
                <span className="text-[9px] text-[rgba(255,255,255,0.2)] font-['JetBrains_Mono',sans-serif] shrink-0 hidden lg:block">
                  {obj.updated ? new Date(obj.updated).toLocaleDateString() : ''}
                </span>
              </div>
            ))}
            {prefixes.length === 0 && objects.length === 0 && (
              <div className="flex items-center justify-center py-[48px]">
                <p className="text-[10px] text-[rgba(255,255,255,0.2)] font-['JetBrains_Mono',sans-serif]">Empty folder</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
