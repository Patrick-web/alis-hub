import { useState, useCallback, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Icon } from '@iconify/react';
import { Loader } from '../Loader';
import { Button } from '../Button';
import { Tab } from '../Tab';
import { FilterSelect, type FilterSelectOption } from '../FilterSelect';
import { LogsServicesTab } from './LogsServicesTab';
import * as GS from '../../../../bindings/alis-hub-v3/gcloudservice';
import type { LogEntry, CloudRunService } from '../../../../bindings/alis-hub-v3/models';
import { useGCloud } from '../../stores/gcloud';
import { notify } from '../../lib/notify';
import { copyToClipboard } from '../../lib/clipboard';

interface Props {
  projectID: string;
}

const MAX_ENTRIES = 500;
const POLL_INTERVAL_MS = 5000;

const SEVERITY_STYLES: Record<string, string> = {
  ERROR: 'text-red-400 bg-red-400/10',
  CRITICAL: 'text-red-300 bg-red-300/10',
  ALERT: 'text-orange-400 bg-orange-400/10',
  EMERGENCY: 'text-red-200 bg-red-200/10',
  WARNING: 'text-yellow-400 bg-yellow-400/10',
  NOTICE: 'text-blue-400 bg-blue-400/10',
  INFO: 'text-green-400 bg-green-400/10',
  DEBUG: 'text-foreground/30 bg-foreground/5',
  DEFAULT: 'text-foreground/40 bg-foreground/5',
};

const RESOURCE_TYPE_OPTIONS: FilterSelectOption[] = [
  { label: 'All resources', value: '' },
  { label: 'Cloud Run', value: 'cloud_run_revision' },
  { label: 'Cloud Run Job', value: 'cloud_run_job' },
  { label: 'Cloud Function', value: 'cloud_function' },
  { label: 'GCS Bucket', value: 'gcs_bucket' },
  { label: 'GKE Container', value: 'k8s_container' },
  { label: 'VM Instance', value: 'gce_instance' },
];

const LOG_NAME_OPTIONS: FilterSelectOption[] = [
  { label: 'All logs', value: '' },
  { label: 'stdout', value: 'stdout' },
  { label: 'stderr', value: 'stderr' },
  { label: 'requests', value: 'requests' },
  { label: 'Audit: activity', value: 'cloudaudit.googleapis.com%2Factivity' },
  { label: 'Audit: data_access', value: 'cloudaudit.googleapis.com%2Fdata_access' },
  { label: 'Audit: system_event', value: 'cloudaudit.googleapis.com%2Fsystem_event' },
];

const SEVERITY_OPTIONS: FilterSelectOption[] = [
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

const TIME_OPTIONS: FilterSelectOption[] = [
  { label: '5m', value: '5' },
  { label: '15m', value: '15' },
  { label: '30m', value: '30' },
  { label: '1h', value: '60' },
  { label: '3h', value: '180' },
  { label: '6h', value: '360' },
  { label: '24h', value: '1440' },
  { label: '7d', value: '10080' },
];

function buildFilter(
  since: string,
  inclusive: boolean,
  severity: string,
  text: string,
  resourceType: string,
  cloudRunService: string,
  logName: string,
  projectID: string,
): string {
  const parts: string[] = [`timestamp${inclusive ? '>=' : '>'}"${since}"`];
  if (severity !== 'DEFAULT') parts.push(`severity>=${severity}`);
  // Cloud Run service implies resource type — takes precedence over the resource dropdown
  if (cloudRunService) {
    parts.push(`resource.type="cloud_run_revision"`);
    parts.push(`resource.labels.service_name="${cloudRunService}"`);
  } else if (resourceType) {
    parts.push(`resource.type="${resourceType}"`);
  }
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
  const [tab, setTab] = useState<'services' | 'filters'>('services');

  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [capped, setCapped] = useState(false);

  const [severity, setSeverity] = useState('DEFAULT');
  const [timeRange, setTimeRange] = useState('1440');
  const [searchText, setSearchText] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [cloudRunService, setCloudRunService] = useState('');
  const [logName, setLogName] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [isStreaming, setIsStreaming] = useState(false);
  const latestTimestampRef = useRef<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const pageFilterRef = useRef<string>('');

  // Cloud Run services list
  const [crServices, setCrServices] = useState<FilterSelectOption[]>([]);
  const [crServiceList, setCrServiceList] = useState<CloudRunService[]>([]);
  const [crLoading, setCrLoading] = useState(false);
  const [crError, setCrError] = useState<string | null>(null);

  useEffect(() => {
    setCrLoading(true);
    setCrError(null);
    GS.ListCloudRunServices(projectID)
      .then((svcs) => {
        const opts: FilterSelectOption[] = [{ label: 'All services', value: '' }];
        for (const s of svcs) {
          if (s.serviceName) opts.push({ label: s.serviceName, value: s.serviceName });
        }
        setCrServices(opts);
        setCrServiceList(svcs.filter((s) => s.serviceName));
      })
      .catch((e: unknown) => {
        if (useGCloud.getState().handleError(e)) return;
        setCrServices([{ label: 'All services', value: '' }]);
        setCrServiceList([]);
        setCrError(String(e));
      })
      .finally(() => setCrLoading(false));
  }, [projectID]);

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 10,
  });

  const load = useCallback((append = false, serviceOverride?: string) => {
    let filter: string;
    if (append && pageFilterRef.current) {
      // Cloud Logging requires the filter on a page_token request to be byte-identical
      // to the one that produced that token, so reuse the exact filter from page 1
      // rather than rebuilding it (which would shift the `since` timestamp).
      filter = pageFilterRef.current;
    } else {
      const svc = serviceOverride ?? cloudRunService;
      const since = new Date(Date.now() - Number(timeRange) * 60 * 1000).toISOString();
      filter = buildFilter(since, true, severity, searchText, resourceType, svc, logName, projectID);
      pageFilterRef.current = filter;
    }
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
      .catch((e: unknown) => { if (useGCloud.getState().handleError(e)) return; setError(String(e)); })
      .finally(() => setLoading(false));
  }, [projectID, severity, timeRange, searchText, resourceType, cloudRunService, logName, nextPageToken]);

  const pollStream = useCallback(() => {
    if (!latestTimestampRef.current) return;
    const filter = buildFilter(latestTimestampRef.current, false, severity, searchText, resourceType, cloudRunService, logName, projectID);
    GS.ListLogEntries(projectID, filter, '')
      .then((page) => {
        setError(null);
        const incoming = (page.entries ?? []).filter((e) => !seenIdsRef.current.has(e.insertId ?? ''));
        if (incoming.length === 0) return;
        setEntries((prev) => {
          const combined = [...incoming, ...prev];
          const result = combined.length > MAX_ENTRIES ? combined.slice(0, MAX_ENTRIES) : combined;
          if (combined.length > MAX_ENTRIES) setCapped(true);
          seenIdsRef.current = new Set(result.map((e) => e.insertId ?? ''));
          return result;
        });
        latestTimestampRef.current = incoming[0].timestamp || latestTimestampRef.current;
      })
      .catch((e: unknown) => { if (useGCloud.getState().handleError(e)) return; setError(String(e)); });
  }, [projectID, severity, searchText, resourceType, cloudRunService, logName]);

  const pollStreamRef = useRef(pollStream);
  useEffect(() => { pollStreamRef.current = pollStream; }, [pollStream]);

  useEffect(() => {
    if (!isStreaming) return;
    pollStreamRef.current();
    const id = setInterval(() => pollStreamRef.current(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isStreaming]);

  const isFirstFilterRender = useRef(true);
  useEffect(() => {
    if (isFirstFilterRender.current) { isFirstFilterRender.current = false; return; }
    setIsStreaming(false);
  }, [severity, timeRange, searchText, resourceType, cloudRunService, logName]);

  const toggleStreaming = useCallback(() => {
    setIsStreaming((prev) => {
      const next = !prev;
      if (next) {
        latestTimestampRef.current = entries[0]?.timestamp ?? new Date().toISOString();
        seenIdsRef.current = new Set(entries.map((e) => e.insertId ?? ''));
      }
      return next;
    });
  }, [entries]);

  const handleSelectService = useCallback((serviceName: string) => {
    setCloudRunService(serviceName);
    setCapped(false);
    setExpandedId(null);
    setTab('filters');
    load(false, serviceName);
  }, [load]);

  const handleViewAllLogs = useCallback(() => {
    setCloudRunService('');
    setCapped(false);
    setExpandedId(null);
    setTab('filters');
    load(false, '');
  }, [load]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="flex flex-col h-full">
      {/* Tab header */}
      <div className="flex h-[36px] border-b border-border shrink-0">
        <Tab
          label="Services"
          icon={<Icon icon="solar:server-minimalistic-linear" className="text-sm" />}
          active={tab === 'services'}
          onClick={() => setTab('services')}
        />
        <Tab
          label="Filters"
          icon={<Icon icon="solar:tuning-2-linear" className="text-sm" />}
          active={tab === 'filters'}
          onClick={() => setTab('filters')}
        />
      </div>

      {tab === 'services' && (
        <LogsServicesTab
          services={crServiceList}
          loading={crLoading}
          error={crError}
          selectedService={cloudRunService}
          onSelectService={handleSelectService}
          onViewAll={handleViewAllLogs}
        />
      )}

      {tab === 'filters' && (
      <>
      {/* Filter bar */}
      <div className="flex items-center gap-[8px] px-[16px] py-[10px] border-b border-border flex-wrap">
        <FilterSelect
          value={cloudRunService}
          options={crServices}
          onChange={setCloudRunService}
          loading={crLoading}
          emptyLabel="No services found"
        />

        {/* Resource type — disabled when a specific CR service is selected */}
        <FilterSelect
          value={cloudRunService ? 'cloud_run_revision' : resourceType}
          options={RESOURCE_TYPE_OPTIONS}
          onChange={setResourceType}
          disabled={!!cloudRunService}
        />

        <div className="w-px h-[20px] bg-border" />

        <FilterSelect value={logName} options={LOG_NAME_OPTIONS} onChange={setLogName} />
        <FilterSelect value={severity} options={SEVERITY_OPTIONS} onChange={setSeverity} />
        <FilterSelect value={timeRange} options={TIME_OPTIONS} onChange={setTimeRange} />

        <div className="w-px h-[20px] bg-border" />

        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          placeholder="Search logs..."
          className="bg-card border border-border rounded-[3px] px-[8px] py-[3px] text-[10px] text-foreground placeholder:text-foreground/30 font-mono outline-none focus:border-brand-fill w-[180px]"
        />

        <Button
          variant="primary"
          onClick={() => { setCapped(false); load(false); }}
          disabled={loading || isStreaming}
          icon={<Icon icon="solar:magnifer-linear" className="text-xs" />}
        >
          Fetch
        </Button>

        <Button
          variant={isStreaming ? 'primary' : 'secondary'}
          onClick={toggleStreaming}
          icon={<Icon icon={isStreaming ? 'solar:pause-circle-linear' : 'solar:play-circle-linear'} className="text-xs" />}
        >
          {isStreaming ? 'Streaming' : 'Live'}
        </Button>

        <div className="flex-1" />

        <Button
          variant="ghost"
          onClick={() => GS.OpenInConsole('logs', projectID, '')}
          icon={<Icon icon="solar:export-linear" className="text-xs" />}
          className="text-foreground/50 hover:text-foreground"
        >
          Open in Console
        </Button>
      </div>

      {/* Log list */}
      <div ref={parentRef} className="flex-1 overflow-y-auto relative font-mono">
        {entries.length === 0 && !error && (
          <>
            {!hasLoaded && !loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-[8px]">
                <Icon icon="solar:document-text-linear" className="text-4xl text-foreground/10" />
                <p className="text-[11px] text-foreground/30">Click Fetch to load logs</p>
              </div>
            )}
            {loading && (
              <div className="flex items-center justify-center py-[48px]"><Loader size={32} /></div>
            )}
            {hasLoaded && !loading && (
              <div className="flex items-center justify-center py-[48px]">
                <p className="text-[10px] text-foreground/30">No log entries found</p>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="m-[16px] p-[12px] bg-red-900/20 border border-red-800 rounded-[4px]">
            <p className="text-[10px] text-red-400">{error}</p>
          </div>
        )}

        {capped && (
          <div className="px-[16px] py-[6px] bg-[#2a2200] border-b border-[#464600]">
            <p className="text-[9px] text-yellow-500/70">
              Showing most recent {MAX_ENTRIES} entries — oldest dropped to preserve performance
            </p>
          </div>
        )}

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
                    className="w-full flex items-start gap-[10px] px-[16px] py-[6px] border-b border-border hover:bg-foreground/[2%] transition-colors text-left"
                  >
                    <span className="text-[9px] text-foreground/30 shrink-0 mt-[1px] w-[70px]">{ts}</span>
                    <span className={`text-[8px] uppercase px-[5px] py-[1px] rounded-[2px] shrink-0 ${SEVERITY_STYLES[sev] ?? SEVERITY_STYLES['DEFAULT']}`}>
                      {sev.slice(0, 4)}
                    </span>
                    <span className="text-[10px] text-foreground/70 truncate flex-1">{msg}</span>
                    <Icon
                      icon={isExpanded ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
                      className="text-xs text-foreground/20 shrink-0"
                    />
                  </button>
                  {isExpanded && (
                    <div className="bg-muted border-b border-border px-[16px] py-[12px] relative">
                      <button
                        onClick={() => {
                          copyToClipboard(JSON.stringify(entry, null, 2))
                            .then(() => notify.success('Log entry copied to clipboard'))
                            .catch(() => notify.error('Failed to copy log entry'));
                        }}
                        title="Copy log entry"
                        className="absolute top-[8px] right-[8px] flex items-center gap-[4px] px-[8px] py-[3px] rounded-[3px] bg-background border border-border text-[9px] font-mono text-foreground/50 hover:text-foreground hover:border-foreground/30 transition-colors"
                      >
                        <Icon icon="solar:copy-linear" className="text-[11px]" />
                        Copy
                      </button>
                      <pre className="text-[9px] text-foreground/60 whitespace-pre-wrap break-all leading-[1.6] pr-[60px]">
                        {JSON.stringify(entry, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {entries.length > 0 && nextPageToken && (
          <div className="flex justify-center py-[16px]">
            <Button variant="secondary" onClick={() => load(true)} disabled={loading || isStreaming}>
              {loading ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
