import { useState, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Icon } from '@iconify/react';
import { Loader } from '../Loader';
import { Button } from '../Button';
import * as GS from '../../../../bindings/alis-hub-v3/gcloudservice';
import type { LogEntry } from '../../../../bindings/alis-hub-v3/models';

interface Props {
  projectID: string;
}

const MAX_ENTRIES = 500;

const SEVERITY_STYLES: Record<string, string> = {
  ERROR: 'text-red-400 bg-red-400/10',
  CRITICAL: 'text-red-300 bg-red-300/10',
  ALERT: 'text-orange-400 bg-orange-400/10',
  EMERGENCY: 'text-red-200 bg-red-200/10',
  WARNING: 'text-yellow-400 bg-yellow-400/10',
  NOTICE: 'text-blue-400 bg-blue-400/10',
  INFO: 'text-green-400 bg-green-400/10',
  DEBUG: 'text-[rgba(255,255,255,0.3)] bg-[rgba(255,255,255,0.05)]',
  DEFAULT: 'text-[rgba(255,255,255,0.4)] bg-[rgba(255,255,255,0.05)]',
};

const RESOURCE_TYPES = [
  { label: 'All resources', value: '' },
  { label: 'Cloud Run', value: 'cloud_run_revision' },
  { label: 'Cloud Run Job', value: 'cloud_run_job' },
  { label: 'Cloud Function', value: 'cloud_function' },
  { label: 'GCS Bucket', value: 'gcs_bucket' },
  { label: 'GKE Container', value: 'k8s_container' },
  { label: 'VM Instance', value: 'gce_instance' },
];

const LOG_NAMES = [
  { label: 'All logs', value: '' },
  { label: 'stdout', value: 'stdout' },
  { label: 'stderr', value: 'stderr' },
  { label: 'requests', value: 'requests' },
  { label: 'Audit: activity', value: 'cloudaudit.googleapis.com%2Factivity' },
  { label: 'Audit: data_access', value: 'cloudaudit.googleapis.com%2Fdata_access' },
  { label: 'Audit: system_event', value: 'cloudaudit.googleapis.com%2Fsystem_event' },
];

const SEVERITY_LEVELS = [
  { label: 'All severities', value: 'DEFAULT' },
  { label: 'Debug+', value: 'DEBUG' },
  { label: 'Info+', value: 'INFO' },
  { label: 'Notice+', value: 'NOTICE' },
  { label: 'Warning+', value: 'WARNING' },
  { label: 'Error+', value: 'ERROR' },
  { label: 'Critical+', value: 'CRITICAL' },
  { label: 'Alert+', value: 'ALERT' },
  { label: 'Emergency', value: 'EMERGENCY' },
];

const TIME_RANGES = [
  { label: '5m', minutes: 5 },
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '3h', minutes: 180 },
  { label: '6h', minutes: 360 },
  { label: '24h', minutes: 1440 },
  { label: '7d', minutes: 10080 },
];

const SELECT_CLASS = "bg-[#2c2c2c] border border-[#464646] rounded-[3px] px-[6px] py-[3px] text-[9px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.6)] outline-none focus:border-[#f881a9] cursor-pointer";

function buildFilter(
  severity: string,
  minutes: number,
  text: string,
  resourceType: string,
  logName: string,
  projectID: string,
): string {
  const parts: string[] = [];
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  parts.push(`timestamp>="${since}"`);
  if (severity !== 'DEFAULT') parts.push(`severity>=${severity}`);
  if (resourceType) parts.push(`resource.type="${resourceType}"`);
  if (logName) parts.push(`logName="projects/${projectID}/logs/${logName}"`);
  if (text.trim()) parts.push(`(textPayload:"${text.trim()}" OR jsonPayload.message:"${text.trim()}")`);
  return parts.join(' ');
}

function entryMessage(entry: LogEntry): string {
  if (entry.textPayload) return entry.textPayload;
  if (entry.jsonPayload) {
    const msg = (entry.jsonPayload as Record<string, unknown>)['message'];
    if (typeof msg === 'string') return msg;
    return JSON.stringify(entry.jsonPayload);
  }
  return entry.logName ?? '';
}

export function LogsExplorer({ projectID }: Props) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [capped, setCapped] = useState(false);

  const [severity, setSeverity] = useState('DEFAULT');
  const [timeRange, setTimeRange] = useState(60);
  const [searchText, setSearchText] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [logName, setLogName] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 10,
  });

  const load = useCallback((append = false) => {
    const filter = buildFilter(severity, timeRange, searchText, resourceType, logName, projectID);
    setLoading(true);
    setError(null);
    GS.ListLogEntries(projectID, filter, append ? nextPageToken : '')
      .then((page) => {
        const incoming = page.entries ?? [];
        setEntries((prev) => {
          if (!append) return incoming;
          const combined = [...prev, ...incoming];
          if (combined.length > MAX_ENTRIES) {
            setCapped(true);
            return combined.slice(-MAX_ENTRIES);
          }
          return combined;
        });
        setNextPageToken(page.nextPageToken ?? '');
        setHasLoaded(true);
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectID, severity, timeRange, searchText, resourceType, logName, nextPageToken]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-[8px] px-[16px] py-[10px] border-b border-[#464646] flex-wrap">
        <select value={resourceType} onChange={(e) => setResourceType(e.target.value)} className={SELECT_CLASS}>
          {RESOURCE_TYPES.map(({ label, value }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <div className="w-px h-[20px] bg-[#464646]" />

        <select value={logName} onChange={(e) => setLogName(e.target.value)} className={SELECT_CLASS}>
          {LOG_NAMES.map(({ label, value }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <div className="w-px h-[20px] bg-[#464646]" />

        <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={SELECT_CLASS}>
          {SEVERITY_LEVELS.map(({ label, value }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <div className="w-px h-[20px] bg-[#464646]" />

        <select value={timeRange} onChange={(e) => setTimeRange(Number(e.target.value))} className={SELECT_CLASS}>
          {TIME_RANGES.map(({ label, minutes }) => (
            <option key={label} value={minutes}>{label}</option>
          ))}
        </select>

        <div className="w-px h-[20px] bg-[#464646]" />

        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          placeholder="Search logs..."
          className="bg-[#2c2c2c] border border-[#464646] rounded-[3px] px-[8px] py-[3px] text-[10px] text-white placeholder-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif] outline-none focus:border-[#f881a9] w-[180px]"
        />

        <Button
          variant="primary"
          onClick={() => { setCapped(false); load(false); }}
          disabled={loading}
          icon={<Icon icon="solar:magnifer-linear" className="text-xs" />}
        >
          Fetch
        </Button>

        <div className="flex-1" />

        <Button
          variant="ghost"
          onClick={() => GS.OpenInConsole('logs', projectID, '')}
          icon={<Icon icon="solar:export-linear" className="text-xs" />}
          className="text-[rgba(255,255,255,0.5)] hover:text-white"
        >
          Open in Console
        </Button>
      </div>

      {/* Log list */}
      <div ref={parentRef} className="flex-1 overflow-y-auto relative font-['JetBrains_Mono',sans-serif]">
        {/* Empty / initial states */}
        {entries.length === 0 && !error && (
          <>
            {!hasLoaded && !loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-[8px]">
                <Icon icon="solar:document-text-linear" className="text-4xl text-[rgba(255,255,255,0.1)]" />
                <p className="text-[11px] text-[rgba(255,255,255,0.3)]">Click Fetch to load logs</p>
              </div>
            )}
            {loading && (
              <div className="flex items-center justify-center py-[48px]"><Loader size={32} /></div>
            )}
            {hasLoaded && !loading && (
              <div className="flex items-center justify-center py-[48px]">
                <p className="text-[10px] text-[rgba(255,255,255,0.3)]">No log entries found</p>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="m-[16px] p-[12px] bg-red-900/20 border border-red-800 rounded-[4px]">
            <p className="text-[10px] text-red-400">{error}</p>
          </div>
        )}

        {/* Cap notice */}
        {capped && (
          <div className="px-[16px] py-[6px] bg-[#2a2200] border-b border-[#464600]">
            <p className="text-[9px] text-yellow-500/70 font-['JetBrains_Mono',sans-serif]">
              Showing most recent {MAX_ENTRIES} entries — oldest dropped to preserve performance
            </p>
          </div>
        )}

        {/* Virtual list */}
        {entries.length > 0 && (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualItems.map((virtualRow) => {
              const entry = entries[virtualRow.index];
              const id = entry.insertId || String(virtualRow.index);
              const sev = entry.severity || 'DEFAULT';
              const isExpanded = expandedId === id;
              const msg = entryMessage(entry);
              const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '';

              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : id)}
                    className="w-full flex items-start gap-[10px] px-[16px] py-[6px] border-b border-[#2a2a2a] hover:bg-[rgba(255,255,255,0.02)] transition-colors text-left"
                  >
                    <span className="text-[9px] text-[rgba(255,255,255,0.3)] shrink-0 mt-[1px] w-[70px]">{ts}</span>
                    <span className={`text-[8px] uppercase px-[5px] py-[1px] rounded-[2px] shrink-0 ${SEVERITY_STYLES[sev] ?? SEVERITY_STYLES['DEFAULT']}`}>
                      {sev.slice(0, 4)}
                    </span>
                    <span className="text-[10px] text-[rgba(255,255,255,0.7)] truncate flex-1">{msg}</span>
                    <Icon
                      icon={isExpanded ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
                      className="text-xs text-[rgba(255,255,255,0.2)] shrink-0"
                    />
                  </button>
                  {isExpanded && (
                    <div className="bg-[#1a1a1a] border-b border-[#464646] px-[16px] py-[12px]">
                      <pre className="text-[9px] text-[rgba(255,255,255,0.6)] whitespace-pre-wrap break-all leading-[1.6]">
                        {JSON.stringify(entry, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Load more */}
        {entries.length > 0 && nextPageToken && (
          <div className="flex justify-center py-[16px]">
            <Button variant="secondary" onClick={() => load(true)} disabled={loading}>
              {loading ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
