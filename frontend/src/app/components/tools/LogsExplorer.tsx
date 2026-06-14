import { useState, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { Loader } from '../Loader';
import { Button } from '../Button';
import * as GS from '../../../../bindings/alis-hub-v3/gcloudservice';
import type { LogEntry } from '../../../../bindings/alis-hub-v3/models';

interface Props {
  projectID: string;
}

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

const TIME_RANGES = [
  { label: '15m', minutes: 15 },
  { label: '1h', minutes: 60 },
  { label: '6h', minutes: 360 },
  { label: '24h', minutes: 1440 },
];

function buildFilter(severity: string, minutes: number, text: string): string {
  const parts: string[] = [];
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  parts.push(`timestamp>="${since}"`);
  if (severity !== 'DEFAULT') parts.push(`severity>=${severity}`);
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

  const [severity, setSeverity] = useState('DEFAULT');
  const [timeRange, setTimeRange] = useState(60);
  const [searchText, setSearchText] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback((append = false) => {
    const filter = buildFilter(severity, timeRange, searchText);
    setLoading(true);
    setError(null);
    GS.ListLogEntries(projectID, filter, append ? nextPageToken : '')
      .then((page) => {
        setEntries((prev) => append ? [...prev, ...(page.entries ?? [])] : (page.entries ?? []));
        setNextPageToken(page.nextPageToken ?? '');
        setHasLoaded(true);
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectID, severity, timeRange, searchText, nextPageToken]);

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-[8px] px-[16px] py-[10px] border-b border-[#464646] flex-wrap">
        {/* Severity */}
        <div className="flex items-center gap-[4px]">
          {['DEFAULT', 'INFO', 'WARNING', 'ERROR'].map((s) => (
            <button
              key={s}
              onClick={() => setSeverity(s)}
              className={`px-[8px] py-[3px] rounded-[3px] text-[9px] uppercase font-['JetBrains_Mono',sans-serif] transition-colors ${
                severity === s
                  ? 'bg-[#f881a9] text-[#6f0025]'
                  : 'bg-[#2c2c2c] border border-[#464646] text-[rgba(255,255,255,0.5)] hover:text-white'
              }`}
            >
              {s === 'DEFAULT' ? 'All' : s}
            </button>
          ))}
        </div>

        <div className="w-px h-[20px] bg-[#464646]" />

        {/* Time range */}
        <div className="flex items-center gap-[4px]">
          {TIME_RANGES.map(({ label, minutes }) => (
            <button
              key={label}
              onClick={() => setTimeRange(minutes)}
              className={`px-[8px] py-[3px] rounded-[3px] text-[9px] uppercase font-['JetBrains_Mono',sans-serif] transition-colors ${
                timeRange === minutes
                  ? 'bg-[#f881a9] text-[#6f0025]'
                  : 'bg-[#2c2c2c] border border-[#464646] text-[rgba(255,255,255,0.5)] hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="w-px h-[20px] bg-[#464646]" />

        {/* Search */}
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
          onClick={() => load(false)}
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

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto font-['JetBrains_Mono',sans-serif]">
        {!hasLoaded && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-[8px]">
            <Icon icon="solar:document-text-linear" className="text-4xl text-[rgba(255,255,255,0.1)]" />
            <p className="text-[11px] text-[rgba(255,255,255,0.3)]">Click Fetch to load logs</p>
          </div>
        )}

        {loading && entries.length === 0 && (
          <div className="flex items-center justify-center py-[48px]"><Loader size={32} /></div>
        )}

        {error && (
          <div className="m-[16px] p-[12px] bg-red-900/20 border border-red-800 rounded-[4px]">
            <p className="text-[10px] text-red-400">{error}</p>
          </div>
        )}

        {entries.map((entry, i) => {
          const id = entry.insertId || String(i);
          const sev = entry.severity || 'DEFAULT';
          const isExpanded = expandedId === id;
          const msg = entryMessage(entry);
          const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '';

          return (
            <div key={id}>
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

        {entries.length > 0 && nextPageToken && (
          <div className="flex justify-center py-[16px]">
            <Button variant="secondary" onClick={() => load(true)} disabled={loading}>
              {loading ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}

        {hasLoaded && !loading && entries.length === 0 && !error && (
          <div className="flex items-center justify-center py-[48px]">
            <p className="text-[10px] text-[rgba(255,255,255,0.3)]">No log entries found</p>
          </div>
        )}
      </div>
    </div>
  );
}
