import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { Loader } from './Loader';
import * as GS from '../../../bindings/alis-hub-v3/gcloudservice';

export type PreviewKind = 'image' | 'pdf' | 'text' | 'video' | 'audio' | 'unsupported';

export function detectKind(ct: string): PreviewKind {
  if (ct.startsWith('image/')) return 'image';
  if (ct === 'application/pdf') return 'pdf';
  if (ct.startsWith('video/')) return 'video';
  if (ct.startsWith('audio/')) return 'audio';
  if (
    ct.startsWith('text/') ||
    ct === 'application/json' ||
    ct === 'application/xml' ||
    ct === 'application/javascript' ||
    ct === 'application/x-yaml' ||
    ct === 'application/yaml'
  ) return 'text';
  return 'unsupported';
}

export function b64ToText(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function kindIcon(kind: PreviewKind): string {
  switch (kind) {
    case 'image': return 'solar:gallery-linear';
    case 'pdf': return 'solar:document-text-linear';
    case 'video': return 'solar:videocamera-linear';
    case 'audio': return 'solar:music-note-linear';
    case 'text': return 'solar:code-linear';
    default: return 'solar:file-linear';
  }
}

interface Props {
  bucket: string;
  objectName: string;
  contentType: string;
  onClose: () => void;
  /** Pass preloaded state from parent to skip the fetch inside the modal. */
  preloadedContent?: string | null;
  preloadedLoading?: boolean;
  preloadedError?: string | null;
}

export function FilePreview({
  bucket,
  objectName,
  contentType,
  onClose,
  preloadedContent,
  preloadedLoading,
  preloadedError,
}: Props) {
  const hasPreload = preloadedContent !== undefined;

  const [ownContent, setOwnContent] = useState<string | null>(null);
  const [ownLoading, setOwnLoading] = useState(!hasPreload);
  const [ownError, setOwnError] = useState<string | null>(null);

  const kind = detectKind(contentType);
  const filename = objectName.split('/').pop() ?? objectName;

  useEffect(() => {
    if (hasPreload) return;
    if (kind === 'unsupported') { setOwnLoading(false); return; }
    setOwnLoading(true);
    setOwnError(null);
    GS.GetObjectContent(bucket, objectName)
      .then(setOwnContent)
      .catch((e: unknown) => setOwnError(String(e)))
      .finally(() => setOwnLoading(false));
  }, [bucket, objectName, kind, hasPreload]);

  const content = hasPreload ? preloadedContent ?? null : ownContent;
  const loading = hasPreload ? (preloadedLoading ?? false) : ownLoading;
  const error = hasPreload ? (preloadedError ?? null) : ownError;
  const dataURL = content ? `data:${contentType};base64,${content}` : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex flex-col bg-muted border border-border rounded-[6px] shadow-2xl w-[90vw] max-w-[1100px] h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-[16px] py-[12px] border-b border-border shrink-0">
          <div className="flex items-center gap-[10px] min-w-0">
            <Icon icon={kindIcon(kind)} className="text-base text-[rgba(255,255,255,0.4)] shrink-0" />
            <span className="text-[11px] text-white font-mono truncate">{filename}</span>
            <span className="text-[9px] text-[rgba(255,255,255,0.3)] font-mono shrink-0">{contentType}</span>
          </div>
          <button
            onClick={onClose}
            className="text-[rgba(255,255,255,0.4)] hover:text-white transition-colors shrink-0 ml-[16px]"
          >
            <Icon icon="solar:close-circle-linear" className="text-lg" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex items-center justify-center p-[24px]">
          {loading ? (
            <div className="flex flex-col items-center gap-[12px]">
              <Loader size={32} />
              <p className="text-[10px] text-[rgba(255,255,255,0.3)] font-mono">Loading preview…</p>
            </div>
          ) : error ? (
            <div className="text-center max-w-[360px]">
              <Icon icon="solar:cloud-cross-linear" className="text-4xl text-[rgba(255,255,255,0.1)] mb-[12px]" />
              <p className="text-[11px] text-red-400 font-mono">{error}</p>
            </div>
          ) : kind === 'unsupported' ? (
            <div className="text-center">
              <Icon icon="solar:file-linear" className="text-4xl text-[rgba(255,255,255,0.1)] mb-[12px]" />
              <p className="text-[11px] text-[rgba(255,255,255,0.4)] font-mono">No preview available for {contentType}</p>
            </div>
          ) : kind === 'image' ? (
            <img src={dataURL} alt={filename} className="max-w-full max-h-full object-contain rounded-[3px]" />
          ) : kind === 'pdf' ? (
            <iframe src={dataURL} title={filename} className="w-full h-full rounded-[3px] border-0" />
          ) : kind === 'video' ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={dataURL} controls className="max-w-full max-h-full rounded-[3px]" />
          ) : kind === 'audio' ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio src={dataURL} controls className="w-full max-w-[480px]" />
          ) : kind === 'text' && content ? (
            <pre className="w-full h-full overflow-auto text-[11px] text-[rgba(255,255,255,0.8)] font-mono leading-relaxed whitespace-pre-wrap break-all">
              {b64ToText(content)}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}
