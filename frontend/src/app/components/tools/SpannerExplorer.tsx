import { useState, useEffect, useRef } from 'react';
import { Icon } from '@iconify/react';
import { Loader } from '../Loader';
import { Button } from '../Button';
import { SpannerTableView } from './SpannerTableView';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '../ui/alert-dialog';
import * as GS from '../../../../bindings/alis-hub-v3/gcloudservice';
import type { SpannerInstance, SpannerDatabase, SpannerTable, SpannerQueryResult } from '../../../../bindings/alis-hub-v3/models';

interface Props {
  projectID: string;
}

interface TableTabInfo {
  tableName: string;
  dbName: string;
}

const QUERY_TAB = '__query__';

function shortName(n: string): string {
  return n.split('/').pop() ?? n;
}

const STATE_STYLE: Record<string, string> = {
  READY: 'text-green-400 bg-green-400/10',
  CREATING: 'text-[#FAC800] bg-[#FAC800]/10',
};

function isDestructiveSQL(sql: string) {
  return /^\s*(DELETE|UPDATE|DROP|TRUNCATE|ALTER)\b/i.test(sql);
}

function isDMLSQL(sql: string) {
  return /^\s*(DELETE|UPDATE)\b/i.test(sql);
}

export function SpannerExplorer({ projectID }: Props) {
  // ── Left pane ──────────────────────────────────────────────────────────────
  const [instances, setInstances] = useState<SpannerInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedInstance, setExpandedInstance] = useState<string | null>(null);
  const [databases, setDatabases] = useState<Record<string, SpannerDatabase[]>>({});
  const [dbLoading, setDbLoading] = useState<Record<string, boolean>>({});

  const [expandedDatabase, setExpandedDatabase] = useState<string | null>(null);
  const [tables, setTables] = useState<Record<string, SpannerTable[]>>({});
  const [tableLoading, setTableLoading] = useState<Record<string, boolean>>({});
  const [tableFilter, setTableFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);
    GS.ListSpannerInstances(projectID)
      .then((items: SpannerInstance[]) => setInstances(items || []))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectID]);

  function toggleInstance(instance: SpannerInstance) {
    if (expandedInstance === instance.name) { setExpandedInstance(null); return; }
    setExpandedInstance(instance.name);
    if (!databases[instance.name]) {
      setDbLoading((v) => ({ ...v, [instance.name]: true }));
      GS.ListSpannerDatabases(instance.name)
        .then((dbs: SpannerDatabase[]) => setDatabases((v) => ({ ...v, [instance.name]: dbs || [] })))
        .catch(() => setDatabases((v) => ({ ...v, [instance.name]: [] })))
        .finally(() => setDbLoading((v) => ({ ...v, [instance.name]: false })));
    }
  }

  function toggleDatabase(db: SpannerDatabase) {
    setSelectedDatabase(db.name);
    if (expandedDatabase === db.name) { setExpandedDatabase(null); return; }
    setExpandedDatabase(db.name);
    if (!tables[db.name]) {
      setTableLoading((v) => ({ ...v, [db.name]: true }));
      GS.ListSpannerTables(db.name)
        .then((ts: SpannerTable[]) => setTables((v) => ({ ...v, [db.name]: ts || [] })))
        .catch(() => setTables((v) => ({ ...v, [db.name]: [] })))
        .finally(() => setTableLoading((v) => ({ ...v, [db.name]: false })));
    }
  }

  // ── Tab system ─────────────────────────────────────────────────────────────
  const [tabs, setTabs] = useState<string[]>([QUERY_TAB]);
  const [activeTab, setActiveTab] = useState<string>(QUERY_TAB);
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set([QUERY_TAB]));
  const [tableTabs, setTableTabs] = useState<Record<string, TableTabInfo>>({});

  function activateTab(tabId: string) {
    setActiveTab(tabId);
    setMountedTabs((prev) => new Set([...prev, tabId]));
  }

  function openTableTab(tableName: string, dbName: string) {
    const id = `${dbName}::${tableName}`;
    if (!tabs.includes(id)) {
      setTabs((prev) => [...prev, id]);
      setTableTabs((prev) => ({ ...prev, [id]: { tableName, dbName } }));
    }
    activateTab(id);
  }

  function closeTab(tabId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setTabs((prev) => {
      const next = prev.filter((t) => t !== tabId);
      if (activeTab === tabId) {
        const idx = prev.indexOf(tabId);
        const fallback = next[Math.max(0, idx - 1)] ?? QUERY_TAB;
        setActiveTab(fallback);
      }
      return next;
    });
    setMountedTabs((prev) => { const s = new Set(prev); s.delete(tabId); return s; });
    setTableTabs((prev) => { const n = { ...prev }; delete n[tabId]; return n; });
  }

  // ── Query panel state ──────────────────────────────────────────────────────
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null);
  const [sql, setSql] = useState('');
  const [queryResult, setQueryResult] = useState<SpannerQueryResult | null>(null);
  const [dmlResult, setDmlResult] = useState<{ rowsAffected: number } | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [destructiveQueryPending, setDestructiveQueryPending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleRunQuery() {
    if (!selectedDatabase || !sql.trim()) return;
    if (isDestructiveSQL(sql.trim())) {
      setDestructiveQueryPending(true);
      return;
    }
    executeQuery();
  }

  function executeQuery() {
    if (!selectedDatabase) return;
    const sqlTrimmed = sql.trim();
    setQueryLoading(true);
    setQueryResult(null);
    setDmlResult(null);
    setQueryError(null);

    if (isDMLSQL(sqlTrimmed)) {
      GS.ExecuteSpannerDML(selectedDatabase, sqlTrimmed)
        .then((r) => setDmlResult({ rowsAffected: Number(r?.rowsAffected ?? 0) }))
        .catch((e: unknown) => setQueryError(String(e)))
        .finally(() => setQueryLoading(false));
    } else if (isDestructiveSQL(sqlTrimmed)) {
      setQueryError('DDL statements (DROP, TRUNCATE, ALTER) are not supported via this tool.');
      setQueryLoading(false);
    } else {
      GS.ExecuteSpannerQuery(selectedDatabase, sqlTrimmed)
        .then((r: SpannerQueryResult | null) => setQueryResult(r))
        .catch((e: unknown) => setQueryError(String(e)))
        .finally(() => setQueryLoading(false));
    }
  }

  function handleNavigateToQuery(navSql: string, dbName: string) {
    setSql(navSql);
    setSelectedDatabase(dbName);
    setActiveTab(QUERY_TAB);
    setMountedTabs((prev) => new Set([...prev, QUERY_TAB]));
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left tree pane ──────────────────────────────────────────────── */}
      <div className="w-[220px] shrink-0 border-r border-[#464646] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-[12px] py-[9px] border-b border-[#464646] shrink-0">
          <p className="text-[9px] font-bold uppercase text-[rgba(255,255,255,0.4)] font-['JetBrains_Mono',sans-serif]">
            {instances.length} instance{instances.length !== 1 ? 's' : ''}
          </p>
          <Button
            variant="ghost"
            onClick={() => GS.OpenInConsole('spanner', projectID, '')}
            icon={<Icon icon="solar:export-linear" className="text-xs" />}
            className="text-[rgba(255,255,255,0.4)] hover:text-white"
          >
            Console
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-[40px]"><Loader size={24} /></div>
          ) : error ? (
            <div className="m-[10px] p-[8px] bg-red-900/20 border border-red-800 rounded-[4px]">
              <p className="text-[10px] text-red-400 font-['JetBrains_Mono',sans-serif]">{error}</p>
            </div>
          ) : instances.length === 0 ? (
            <div className="flex items-center justify-center py-[40px]">
              <p className="text-[10px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif]">No instances</p>
            </div>
          ) : (
            instances.map((instance) => {
              const expanded = expandedInstance === instance.name;
              const dbs = databases[instance.name] ?? [];
              const loadingDbs = dbLoading[instance.name] ?? false;
              const ss = STATE_STYLE[instance.state] ?? 'text-[rgba(255,255,255,0.3)] bg-[rgba(255,255,255,0.05)]';

              return (
                <div key={instance.name} className="border-b border-[#2a2a2a]">
                  <button
                    onClick={() => toggleInstance(instance)}
                    className="w-full flex items-center gap-[7px] px-[10px] py-[8px] hover:bg-[rgba(255,255,255,0.03)] transition-colors text-left"
                  >
                    <Icon icon={expanded ? 'solar:alt-arrow-down-linear' : 'solar:alt-arrow-right-linear'} className="text-[10px] text-[rgba(255,255,255,0.3)] shrink-0" />
                    <Icon icon="solar:server-bold" className="text-sm text-[rgba(255,255,255,0.45)] shrink-0" />
                    <span className="text-[10px] font-['JetBrains_Mono',sans-serif] text-white flex-1 truncate">
                      {instance.displayName || shortName(instance.name)}
                    </span>
                    <span className={`text-[7px] uppercase px-[4px] py-[1px] rounded-[2px] font-['JetBrains_Mono',sans-serif] shrink-0 ${ss}`}>
                      {instance.state || '?'}
                    </span>
                  </button>

                  {expanded && (
                    <div className="bg-[#1a1a1a]">
                      {loadingDbs ? (
                        <div className="flex items-center justify-center py-[14px]"><Loader size={16} /></div>
                      ) : dbs.length === 0 ? (
                        <p className="text-[9px] text-[rgba(255,255,255,0.2)] font-['JetBrains_Mono',sans-serif] pl-[28px] py-[8px]">No databases</p>
                      ) : (
                        dbs.map((db) => {
                          const dbExpanded = expandedDatabase === db.name;
                          const dbSelected = selectedDatabase === db.name;
                          const dbTables = tables[db.name] ?? [];
                          const loadingTables = tableLoading[db.name] ?? false;
                          const ds = STATE_STYLE[db.state] ?? 'text-[rgba(255,255,255,0.3)] bg-[rgba(255,255,255,0.05)]';
                          const filteredTables = tableFilter
                            ? dbTables.filter((t) => t.name.toLowerCase().includes(tableFilter.toLowerCase()))
                            : dbTables;

                          return (
                            <div key={db.name} className="border-t border-[#252525]">
                              <button
                                onClick={() => toggleDatabase(db)}
                                className={`w-full flex items-center gap-[7px] pl-[24px] pr-[10px] py-[7px] transition-colors text-left ${dbSelected ? 'bg-[rgba(248,129,169,0.07)]' : 'hover:bg-[rgba(255,255,255,0.02)]'}`}
                              >
                                <Icon icon={dbExpanded ? 'solar:alt-arrow-down-linear' : 'solar:alt-arrow-right-linear'} className="text-[9px] text-[rgba(255,255,255,0.2)] shrink-0" />
                                <Icon icon="solar:database-bold" className={`text-xs shrink-0 ${dbSelected ? 'text-[#f881a9]' : 'text-[rgba(255,255,255,0.3)]'}`} />
                                <span className={`text-[10px] font-['JetBrains_Mono',sans-serif] flex-1 truncate ${dbSelected ? 'text-white' : 'text-[rgba(255,255,255,0.6)]'}`}>
                                  {shortName(db.name)}
                                </span>
                                <span className={`text-[7px] uppercase px-[3px] py-[1px] rounded-[2px] font-['JetBrains_Mono',sans-serif] shrink-0 ${ds}`}>
                                  {db.state || '?'}
                                </span>
                              </button>

                              {dbExpanded && (
                                <div className="bg-[#181818] px-[10px] py-[6px]">
                                  {loadingTables ? (
                                    <div className="flex items-center justify-center py-[10px]"><Loader size={12} /></div>
                                  ) : (
                                    <>
                                      {dbTables.length > 3 && (
                                        <input
                                          value={tableFilter}
                                          onChange={(e) => setTableFilter(e.target.value)}
                                          placeholder="Filter tables…"
                                          className="w-full px-[8px] py-[3px] bg-[#141414] border border-[#363636] rounded-[3px] text-[9px] font-['JetBrains_Mono',sans-serif] text-white placeholder-[rgba(255,255,255,0.2)] focus:outline-none focus:border-[rgba(255,255,255,0.25)] mb-[4px]"
                                        />
                                      )}
                                      {filteredTables.length === 0 ? (
                                        <p className="text-[9px] text-[rgba(255,255,255,0.2)] font-['JetBrains_Mono',sans-serif] py-[4px]">
                                          {dbTables.length === 0 ? 'No tables' : 'No match'}
                                        </p>
                                      ) : (
                                        filteredTables.map((table) => {
                                          const tabId = `${db.name}::${table.name}`;
                                          const isOpen = tabs.includes(tabId);
                                          const isActive = activeTab === tabId;
                                          return (
                                            <button
                                              key={table.name}
                                              onClick={() => openTableTab(table.name, db.name)}
                                              className={`w-full flex items-center gap-[7px] px-[4px] py-[4px] rounded-[2px] transition-colors text-left group ${isActive ? 'bg-[rgba(248,129,169,0.1)]' : 'hover:bg-[rgba(255,255,255,0.03)]'}`}
                                            >
                                              <Icon
                                                icon="hugeicons:table"
                                                className={`text-xs shrink-0 transition-colors ${isActive ? 'text-[#f881a9]' : isOpen ? 'text-[rgba(248,129,169,0.5)]' : 'text-[rgba(255,255,255,0.3)]'}`}
                                              />
                                              <span className={`text-[9px] font-['JetBrains_Mono',sans-serif] flex-1 truncate transition-colors ${isActive ? 'text-white' : isOpen ? 'text-[rgba(255,255,255,0.7)]' : 'text-[rgba(255,255,255,0.5)] group-hover:text-white'}`}>
                                                {table.name}
                                              </span>
                                              {isOpen && !isActive && (
                                                <Icon icon="solar:circle-bold" className="text-[6px] text-[rgba(248,129,169,0.5)] shrink-0" />
                                              )}
                                            </button>
                                          );
                                        })
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right pane with tabs ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Tab bar */}
        <div className="flex items-stretch border-b border-[#464646] shrink-0 overflow-x-auto bg-[#1a1a1a]">
          <div
            onClick={() => activateTab(QUERY_TAB)}
            className={`flex items-center gap-[6px] px-[12px] py-0 text-[10px] font-['JetBrains_Mono',sans-serif] shrink-0 border-r border-[#2a2a2a] cursor-pointer transition-colors select-none ${
              activeTab === QUERY_TAB
                ? 'text-white bg-[#1e1e1e] shadow-[inset_0_-2px_0_#f881a9]'
                : 'text-[rgba(255,255,255,0.4)] hover:text-white hover:bg-[rgba(255,255,255,0.03)]'
            }`}
            style={{ minHeight: 36 }}
          >
            <Icon icon="solar:code-square-linear" className="text-xs shrink-0" />
            <span>Query</span>
          </div>

          {tabs.filter((t) => t !== QUERY_TAB).map((tabId) => {
            const info = tableTabs[tabId];
            if (!info) return null;
            const isActive = activeTab === tabId;
            return (
              <div
                key={tabId}
                onClick={() => activateTab(tabId)}
                className={`flex items-center gap-[6px] pl-[10px] pr-[4px] text-[10px] font-['JetBrains_Mono',sans-serif] shrink-0 border-r border-[#2a2a2a] cursor-pointer transition-colors select-none group ${
                  isActive
                    ? 'text-white bg-[#1e1e1e] shadow-[inset_0_-2px_0_#f881a9]'
                    : 'text-[rgba(255,255,255,0.4)] hover:text-white hover:bg-[rgba(255,255,255,0.03)]'
                }`}
                style={{ minHeight: 36 }}
              >
                <Icon icon="hugeicons:table" className={`text-xs shrink-0 ${isActive ? 'text-[#f881a9]' : ''}`} />
                <span className="max-w-[110px] truncate">{info.tableName}</span>
                <span
                  onClick={(e) => closeTab(tabId, e)}
                  role="button"
                  className="ml-[2px] p-[3px] rounded text-[rgba(255,255,255,0.15)] hover:text-[#f881a9] hover:bg-[rgba(248,129,169,0.1)] transition-colors shrink-0"
                >
                  <Icon icon="solar:close-linear" className="text-[9px]" />
                </span>
              </div>
            );
          })}
        </div>

        {/* Tab content (lazy-mount, keep alive) */}
        <div className="flex-1 overflow-hidden relative">

          {/* Query tab */}
          <div className={`absolute inset-0 flex flex-col overflow-hidden ${activeTab === QUERY_TAB ? '' : 'hidden'}`}>
            {mountedTabs.has(QUERY_TAB) && (
              <>
                {!selectedDatabase ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-[8px]">
                    <Icon icon="solar:database-linear" className="text-[28px] text-[rgba(255,255,255,0.08)]" />
                    <p className="text-[11px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif]">
                      Select a database to run queries
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-[16px] py-[10px] border-b border-[#464646] shrink-0">
                      <div className="flex items-center gap-[7px]">
                        <Icon icon="solar:database-bold" className="text-sm text-[#f881a9]" />
                        <p className="text-[10px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.7)]">
                          {shortName(selectedDatabase)}
                        </p>
                      </div>
                      <p className="text-[9px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif]">
                        ⌘↩ to run
                      </p>
                    </div>

                    <div className="px-[16px] pt-[12px] pb-[8px] border-b border-[#464646] shrink-0">
                      <textarea
                        ref={textareaRef}
                        value={sql}
                        onChange={(e) => setSql(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                            e.preventDefault();
                            handleRunQuery();
                          }
                        }}
                        placeholder="SELECT * FROM MyTable LIMIT 20"
                        rows={6}
                        className="w-full bg-[#151515] border border-[#464646] rounded-[4px] px-[12px] py-[8px] text-[11px] font-['JetBrains_Mono',sans-serif] text-white placeholder-[rgba(255,255,255,0.2)] resize-none focus:outline-none focus:border-[rgba(248,129,169,0.4)]"
                      />
                      <div className="flex items-center justify-end mt-[8px]">
                        <Button
                          variant="primary"
                          onClick={handleRunQuery}
                          disabled={queryLoading || !sql.trim()}
                          icon={queryLoading
                            ? <Icon icon="solar:refresh-linear" className="text-xs animate-spin" />
                            : <Icon icon="solar:play-linear" className="text-xs" />
                          }
                        >
                          {queryLoading ? 'Running…' : 'Run Query'}
                        </Button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-auto">
                      {queryError && (
                        <div className="m-[14px] p-[10px] bg-red-900/20 border border-red-800 rounded-[4px]">
                          <p className="text-[10px] text-red-400 font-['JetBrains_Mono',sans-serif] whitespace-pre-wrap">{queryError}</p>
                        </div>
                      )}
                      {dmlResult && (
                        <div className="m-[14px] p-[10px] bg-green-900/20 border border-green-800 rounded-[4px] flex items-center gap-[8px]">
                          <Icon icon="solar:check-circle-bold" className="text-green-400 text-sm shrink-0" />
                          <p className="text-[10px] text-green-400 font-['JetBrains_Mono',sans-serif]">
                            {dmlResult.rowsAffected} row{dmlResult.rowsAffected !== 1 ? 's' : ''} affected
                          </p>
                        </div>
                      )}
                      {queryResult && queryResult.columns.length === 0 && (
                        <div className="flex items-center justify-center py-[40px]">
                          <p className="text-[10px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif]">No results</p>
                        </div>
                      )}
                      {queryResult && queryResult.columns.length > 0 && (
                        <>
                          <div className="px-[14px] py-[8px] border-b border-[#2a2a2a]">
                            <p className="text-[9px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif] uppercase font-bold">
                              {queryResult.rows.length} row{queryResult.rows.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                          <table className="w-full border-collapse text-[10px] font-['JetBrains_Mono',sans-serif]">
                            <thead>
                              <tr className="bg-[#1a1a1a] border-b border-[#464646]">
                                {queryResult.columns.map((col) => (
                                  <th key={col} className="text-left px-[12px] py-[7px] text-[rgba(255,255,255,0.5)] font-bold uppercase text-[9px] whitespace-nowrap border-r border-[#2a2a2a] last:border-0">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {queryResult.rows.map((row, i) => (
                                <tr key={i} className="border-b border-[#252525] hover:bg-[rgba(255,255,255,0.02)]">
                                  {row.map((cell, j) => (
                                    <td key={j} className="px-[12px] py-[6px] border-r border-[#252525] last:border-0 max-w-[280px]">
                                      {cell === 'NULL'
                                        ? <span className="text-[rgba(255,255,255,0.2)] italic">NULL</span>
                                        : <span className="text-[rgba(255,255,255,0.72)] truncate block">{cell}</span>
                                      }
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Table tabs */}
          {tabs.filter((t) => t !== QUERY_TAB).map((tabId) => {
            const info = tableTabs[tabId];
            if (!info) return null;
            return (
              <div
                key={tabId}
                className={`absolute inset-0 overflow-hidden ${activeTab === tabId ? '' : 'hidden'}`}
              >
                {mountedTabs.has(tabId) && (
                  <SpannerTableView
                    tableName={info.tableName}
                    dbName={info.dbName}
                    onNavigateToQuery={(navSql) => handleNavigateToQuery(navSql, info.dbName)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Destructive query confirmation */}
      <AlertDialog open={destructiveQueryPending} onOpenChange={(open) => { if (!open) setDestructiveQueryPending(false); }}>
        <AlertDialogContent className="bg-[#1e1e1e] border border-[#464646] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white font-['JetBrains_Mono',sans-serif] text-sm">
              Destructive statement
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[rgba(255,255,255,0.5)] text-[10px] font-['JetBrains_Mono',sans-serif]">
              This will permanently modify or destroy data. This cannot be undone.
              <pre className="mt-[10px] text-[9px] text-red-400 bg-[#0d0d0d] border border-[#363636] p-[8px] rounded-[3px] overflow-x-auto whitespace-pre-wrap break-all">
                {sql.trim()}
              </pre>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#252525] border-[#464646] text-white hover:bg-[#2c2c2c] font-['JetBrains_Mono',sans-serif] text-[10px]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white font-['JetBrains_Mono',sans-serif] text-[10px]"
              onClick={() => { setDestructiveQueryPending(false); executeQuery(); }}
            >
              Execute
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
