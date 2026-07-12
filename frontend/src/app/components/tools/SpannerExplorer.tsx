import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { Loader } from "../Loader";
import { Button } from "../Button";
import { SpannerTableView } from "./SpannerTableView";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "../ui/alert-dialog";
import { SqlEditor } from "./SqlEditor";
import { TabBar } from "../ui/TabBar";
import * as GS from "../../../../bindings/alis-hub-v3/gcloudservice";
import type {
  SpannerInstance,
  SpannerDatabase,
  SpannerTable,
  SpannerQueryResult,
} from "../../../../bindings/alis-hub-v3/models";
import { useLabs } from "../../stores/labs";
import { useGCloud } from "../../stores/gcloud";

interface Props {
  projectID: string;
}

interface TableTabInfo {
  tableName: string;
  dbName: string;
}

interface PendingRWTxn {
  sessionName: string;
  transactionId: string;
  rowsAffected: number;
}

interface QueryTabState {
  sql: string;
  queryLoading: boolean;
  queryError: string | null;
  queryResult: SpannerQueryResult | null;
  dmlResult: { rowsAffected: number } | null;
  dmlMode: "partitioned" | "readwrite";
  pendingRWTxn: PendingRWTxn | null;
  txnActionLoading: "commit" | "rollback" | null;
}

const QUERY_TAB = "__query__";

const DEFAULT_QUERY_TAB_STATE: QueryTabState = {
  sql: "",
  queryLoading: false,
  queryError: null,
  queryResult: null,
  dmlResult: null,
  dmlMode: "partitioned",
  pendingRWTxn: null,
  txnActionLoading: null,
};

function shortName(n: string): string {
  return n.split("/").pop() ?? n;
}

const STATE_STYLE: Record<string, string> = {
  READY: "text-green-400 bg-green-400/10",
  CREATING: "text-warning bg-warning/10",
};

function isDestructiveSQL(sql: string) {
  return /^\s*(DELETE|UPDATE|DROP|TRUNCATE|ALTER)\b/i.test(sql);
}

function isDMLSQL(sql: string) {
  return /^\s*(DELETE|UPDATE)\b/i.test(sql);
}

function isQueryTab(id: string) {
  return id === QUERY_TAB || id.startsWith("__query_");
}

function queryTabLabel(id: string): string {
  if (id === QUERY_TAB) return "Query";
  const n = id.match(/__query_(\d+)__/)?.[1];
  return `Query ${n}`;
}

export function SpannerExplorer({ projectID }: Props) {
  const { isSuggestionEnabled } = useLabs();
  const rwTxnLabsEnabled = isSuggestionEnabled("spanner-rw-transaction");

  // Ref tracking all open RW sessions so we can rollback on unmount
  const openRWTxnsRef = useRef<Map<string, PendingRWTxn>>(new Map());

  useEffect(() => {
    return () => {
      openRWTxnsRef.current.forEach((txn) => {
        GS.RollbackSpannerTransaction(txn.sessionName, txn.transactionId).catch(() => {});
      });
    };
  }, []);

  // ── Left pane ──────────────────────────────────────────────────────────────
  const [instances, setInstances] = useState<SpannerInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedInstance, setExpandedInstance] = useState<string | null>(null);
  const [databases, setDatabases] = useState<Record<string, SpannerDatabase[]>>(
    {},
  );
  const [dbLoading, setDbLoading] = useState<Record<string, boolean>>({});

  const [expandedDatabase, setExpandedDatabase] = useState<string | null>(null);
  const [tables, setTables] = useState<Record<string, SpannerTable[]>>({});
  const [tableLoading, setTableLoading] = useState<Record<string, boolean>>({});
  const [tableFilter, setTableFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(null);
    GS.ListSpannerInstances(projectID)
      .then((items: SpannerInstance[]) => setInstances(items || []))
      .catch((e: unknown) => { if (useGCloud.getState().handleError(e)) return; setError(String(e)); })
      .finally(() => setLoading(false));
  }, [projectID]);

  function toggleInstance(instance: SpannerInstance) {
    if (expandedInstance === instance.name) {
      setExpandedInstance(null);
      return;
    }
    setExpandedInstance(instance.name);
    if (!databases[instance.name]) {
      setDbLoading((v) => ({ ...v, [instance.name]: true }));
      GS.ListSpannerDatabases(instance.name)
        .then((dbs: SpannerDatabase[]) =>
          setDatabases((v) => ({ ...v, [instance.name]: dbs || [] })),
        )
        .catch(() => setDatabases((v) => ({ ...v, [instance.name]: [] })))
        .finally(() => setDbLoading((v) => ({ ...v, [instance.name]: false })));
    }
  }

  function toggleDatabase(db: SpannerDatabase) {
    setSelectedDatabase(db.name);
    if (expandedDatabase === db.name) {
      setExpandedDatabase(null);
      return;
    }
    setExpandedDatabase(db.name);
    if (!tables[db.name]) {
      setTableLoading((v) => ({ ...v, [db.name]: true }));
      GS.ListSpannerTables(db.name)
        .then((ts: SpannerTable[]) =>
          setTables((v) => ({ ...v, [db.name]: ts || [] })),
        )
        .catch(() => setTables((v) => ({ ...v, [db.name]: [] })))
        .finally(() => setTableLoading((v) => ({ ...v, [db.name]: false })));
    }
  }

  // ── Tab system ─────────────────────────────────────────────────────────────
  const [tabs, setTabs] = useState<string[]>([QUERY_TAB]);
  const [activeTab, setActiveTab] = useState<string>(QUERY_TAB);
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(
    new Set([QUERY_TAB]),
  );
  const [tableTabs, setTableTabs] = useState<Record<string, TableTabInfo>>({});
  const [queryTabCounter, setQueryTabCounter] = useState(2);
  const [queryTabNames, setQueryTabNames] = useState<Record<string, string>>(
    {},
  );
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

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

  function addQueryTab() {
    const id = `__query_${queryTabCounter}__`;
    setQueryTabCounter((c) => c + 1);
    setTabs((prev) => [...prev, id]);
    setQueryTabStates((prev) => ({
      ...prev,
      [id]: { ...DEFAULT_QUERY_TAB_STATE },
    }));
    activateTab(id);
  }

  function startRename(tabId: string) {
    const current = queryTabNames[tabId] ?? queryTabLabel(tabId);
    setEditingTabId(tabId);
    setEditingName(current);
  }

  function commitRename(tabId: string) {
    const trimmed = editingName.trim();
    if (trimmed) setQueryTabNames((prev) => ({ ...prev, [tabId]: trimmed }));
    setEditingTabId(null);
    setEditingName("");
  }

  function removeTab(tabId: string) {
    if (isQueryTab(tabId) && tabs.filter(isQueryTab).length <= 1) return;
    if (editingTabId === tabId) {
      setEditingTabId(null);
      setEditingName("");
    }
    const txn = openRWTxnsRef.current.get(tabId);
    if (txn) {
      GS.RollbackSpannerTransaction(txn.sessionName, txn.transactionId).catch(() => {});
      openRWTxnsRef.current.delete(tabId);
    }
    setTabs((prev) => {
      const next = prev.filter((t) => t !== tabId);
      if (activeTab === tabId) {
        const idx = prev.indexOf(tabId);
        setActiveTab(next[Math.max(0, idx - 1)] ?? QUERY_TAB);
      }
      return next;
    });
    setMountedTabs((prev) => {
      const s = new Set(prev);
      s.delete(tabId);
      return s;
    });
    if (isQueryTab(tabId)) {
      setQueryTabStates((prev) => {
        const n = { ...prev };
        delete n[tabId];
        return n;
      });
      setQueryTabNames((prev) => {
        const n = { ...prev };
        delete n[tabId];
        return n;
      });
    } else {
      setTableTabs((prev) => {
        const n = { ...prev };
        delete n[tabId];
        return n;
      });
    }
  }

  function removeMultipleTabs(ids: string[]) {
    const removeSet = new Set(ids);
    // Always keep at least one query tab
    const qInRemove = ids.filter(isQueryTab);
    const qOutsideRemove = tabs.filter((t) => isQueryTab(t) && !removeSet.has(t));
    if (qOutsideRemove.length === 0 && qInRemove.length > 0)
      removeSet.delete(qInRemove[0]);

    removeSet.forEach((tabId) => {
      const txn = openRWTxnsRef.current.get(tabId);
      if (txn) {
        GS.RollbackSpannerTransaction(txn.sessionName, txn.transactionId).catch(() => {});
        openRWTxnsRef.current.delete(tabId);
      }
    });

    const toRemove = tabs.filter((t) => removeSet.has(t));
    const qRemove = toRemove.filter(isQueryTab);
    const tRemove = toRemove.filter((t) => !isQueryTab(t));

    setTabs((prev) => prev.filter((t) => !removeSet.has(t)));
    setMountedTabs((prev) => {
      const s = new Set(prev);
      toRemove.forEach((t) => s.delete(t));
      return s;
    });
    if (qRemove.length > 0) {
      setQueryTabStates((prev) => {
        const n = { ...prev };
        qRemove.forEach((t) => delete n[t]);
        return n;
      });
      setQueryTabNames((prev) => {
        const n = { ...prev };
        qRemove.forEach((t) => delete n[t]);
        return n;
      });
    }
    if (tRemove.length > 0) {
      setTableTabs((prev) => {
        const n = { ...prev };
        tRemove.forEach((t) => delete n[t]);
        return n;
      });
    }
    if (removeSet.has(activeTab)) {
      const remaining = tabs.filter((t) => !removeSet.has(t));
      setActiveTab(remaining[0] ?? QUERY_TAB);
    }
    if (editingTabId && removeSet.has(editingTabId)) {
      setEditingTabId(null);
      setEditingName("");
    }
  }

  function handleReorder(fromId: string, toId: string) {
    setTabs((prev) => {
      const without = prev.filter((t) => t !== fromId);
      const at = without.indexOf(toId);
      if (at === -1) return prev;
      const result = [...without];
      result.splice(at, 0, fromId);
      return result;
    });
  }

  // ── Query panel state ──────────────────────────────────────────────────────
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null);
  const [queryTabStates, setQueryTabStates] = useState<
    Record<string, QueryTabState>
  >({
    [QUERY_TAB]: { ...DEFAULT_QUERY_TAB_STATE },
  });
  const [destructivePendingTab, setDestructivePendingTab] = useState<
    string | null
  >(null);
  const [queryPanelHeight, setQueryPanelHeight] = useState(200);

  function updateTabQuery(tabId: string, update: Partial<QueryTabState>) {
    setQueryTabStates((prev) => ({
      ...prev,
      [tabId]: { ...(prev[tabId] ?? DEFAULT_QUERY_TAB_STATE), ...update },
    }));
  }

  function handleRunQuery(tabId: string) {
    if (!selectedDatabase) return;
    const tabSql = (queryTabStates[tabId]?.sql ?? "").trim();
    if (!tabSql) return;
    if (isDestructiveSQL(tabSql)) {
      setDestructivePendingTab(tabId);
      return;
    }
    executeQuery(tabId);
  }

  function executeQuery(tabId: string) {
    if (!selectedDatabase) return;
    const tabState = queryTabStates[tabId] ?? DEFAULT_QUERY_TAB_STATE;
    const sqlTrimmed = tabState.sql.trim();

    // Rollback any stale open transaction before starting a new query
    const staleTxn = openRWTxnsRef.current.get(tabId);
    if (staleTxn) {
      GS.RollbackSpannerTransaction(staleTxn.sessionName, staleTxn.transactionId).catch(() => {});
      openRWTxnsRef.current.delete(tabId);
    }

    updateTabQuery(tabId, {
      queryLoading: true,
      queryResult: null,
      dmlResult: null,
      pendingRWTxn: null,
      queryError: null,
    });

    if (isDMLSQL(sqlTrimmed) && rwTxnLabsEnabled && tabState.dmlMode === "readwrite") {
      GS.BeginSpannerReadWriteTxn(selectedDatabase, sqlTrimmed)
        .then((r) => {
          if (!r) return;
          const txn: PendingRWTxn = {
            sessionName: r.sessionName,
            transactionId: r.transactionId,
            rowsAffected: Number(r.rowsAffected ?? 0),
          };
          openRWTxnsRef.current.set(tabId, txn);
          updateTabQuery(tabId, { pendingRWTxn: txn });
        })
        .catch((e: unknown) => { if (useGCloud.getState().handleError(e)) return; updateTabQuery(tabId, { queryError: String(e) }); })
        .finally(() => updateTabQuery(tabId, { queryLoading: false }));
    } else if (isDMLSQL(sqlTrimmed)) {
      GS.ExecuteSpannerDML(selectedDatabase, sqlTrimmed)
        .then((r) =>
          updateTabQuery(tabId, {
            dmlResult: { rowsAffected: Number(r?.rowsAffected ?? 0) },
          }),
        )
        .catch((e: unknown) => { if (useGCloud.getState().handleError(e)) return; updateTabQuery(tabId, { queryError: String(e) }); })
        .finally(() => updateTabQuery(tabId, { queryLoading: false }));
    } else if (isDestructiveSQL(sqlTrimmed)) {
      updateTabQuery(tabId, {
        queryError:
          "DDL statements (DROP, TRUNCATE, ALTER) are not supported via this tool.",
        queryLoading: false,
      });
    } else {
      GS.ExecuteSpannerQuery(selectedDatabase, sqlTrimmed)
        .then((r: SpannerQueryResult | null) =>
          updateTabQuery(tabId, { queryResult: r }),
        )
        .catch((e: unknown) => { if (useGCloud.getState().handleError(e)) return; updateTabQuery(tabId, { queryError: String(e) }); })
        .finally(() => updateTabQuery(tabId, { queryLoading: false }));
    }
  }

  function commitTransaction(tabId: string) {
    const txn = queryTabStates[tabId]?.pendingRWTxn;
    if (!txn) return;
    updateTabQuery(tabId, { txnActionLoading: "commit" });
    GS.CommitSpannerTransaction(txn.sessionName, txn.transactionId)
      .then(() => {
        openRWTxnsRef.current.delete(tabId);
        updateTabQuery(tabId, {
          pendingRWTxn: null,
          dmlResult: { rowsAffected: txn.rowsAffected },
        });
      })
      .catch((e: unknown) => { if (useGCloud.getState().handleError(e)) return; updateTabQuery(tabId, { queryError: String(e) }); })
      .finally(() => updateTabQuery(tabId, { txnActionLoading: null }));
  }

  function rollbackTransaction(tabId: string) {
    const txn = queryTabStates[tabId]?.pendingRWTxn;
    if (!txn) return;
    updateTabQuery(tabId, { txnActionLoading: "rollback" });
    GS.RollbackSpannerTransaction(txn.sessionName, txn.transactionId)
      .then(() => {
        openRWTxnsRef.current.delete(tabId);
        updateTabQuery(tabId, { pendingRWTxn: null, dmlResult: null });
      })
      .catch((e: unknown) => { if (useGCloud.getState().handleError(e)) return; updateTabQuery(tabId, { queryError: String(e) }); })
      .finally(() => updateTabQuery(tabId, { txnActionLoading: null }));
  }

  function handleNavigateToQuery(navSql: string, dbName: string) {
    updateTabQuery(QUERY_TAB, { sql: navSql });
    setSelectedDatabase(dbName);
    activateTab(QUERY_TAB);
  }

  function handleResizerMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = queryPanelHeight;
    function onMove(ev: MouseEvent) {
      setQueryPanelHeight(
        Math.max(80, Math.min(600, startHeight + ev.clientY - startY)),
      );
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left tree pane ──────────────────────────────────────────────── */}
      <div className="w-[220px] shrink-0 border-r border-border flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-[12px] py-[9px] border-b border-border shrink-0">
          <p className="text-[9px] font-bold uppercase text-foreground/40 font-mono">
            {instances.length} instance{instances.length !== 1 ? "s" : ""}
          </p>
          <Button
            variant="ghost"
            onClick={() => GS.OpenInConsole("spanner", projectID, "")}
            icon={<Icon icon="solar:export-linear" className="text-xs" />}
            className="text-foreground/40 hover:text-foreground"
          >
            Console
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-[40px]">
              <Loader size={24} />
            </div>
          ) : error ? (
            <div className="m-[10px] p-[8px] bg-red-900/20 border border-red-800 rounded-[4px]">
              <p className="text-[10px] text-red-400 font-mono">
                {error}
              </p>
            </div>
          ) : instances.length === 0 ? (
            <div className="flex items-center justify-center py-[40px]">
              <p className="text-[10px] text-foreground/30 font-mono">
                No instances
              </p>
            </div>
          ) : (
            instances.map((instance) => {
              const expanded = expandedInstance === instance.name;
              const dbs = databases[instance.name] ?? [];
              const loadingDbs = dbLoading[instance.name] ?? false;
              const ss =
                STATE_STYLE[instance.state] ??
                "text-foreground/30 bg-foreground/5";

              return (
                <div key={instance.name} className="border-b border-border">
                  <button
                    onClick={() => toggleInstance(instance)}
                    className="w-full flex items-center gap-[7px] px-[10px] py-[8px] hover:bg-foreground/[3%] transition-colors text-left"
                  >
                    <Icon
                      icon={
                        expanded
                          ? "solar:alt-arrow-down-linear"
                          : "solar:alt-arrow-right-linear"
                      }
                      className="text-[10px] text-foreground/30 shrink-0"
                    />
                    <Icon
                      icon="solar:server-bold"
                      className="text-sm text-foreground/45 shrink-0"
                    />
                    <span className="text-[10px] font-mono text-foreground flex-1 truncate">
                      {instance.displayName || shortName(instance.name)}
                    </span>
                    <span
                      className={`text-[7px] uppercase px-[4px] py-[1px] rounded-[2px] font-mono shrink-0 ${ss}`}
                    >
                      {instance.state || "?"}
                    </span>
                  </button>

                  {expanded && (
                    <div className="bg-muted">
                      {loadingDbs ? (
                        <div className="flex items-center justify-center py-[14px]">
                          <Loader size={16} />
                        </div>
                      ) : dbs.length === 0 ? (
                        <p className="text-[9px] text-foreground/20 font-mono pl-[28px] py-[8px]">
                          No databases
                        </p>
                      ) : (
                        dbs.map((db) => {
                          const dbExpanded = expandedDatabase === db.name;
                          const dbSelected = selectedDatabase === db.name;
                          const dbTables = tables[db.name] ?? [];
                          const loadingTables = tableLoading[db.name] ?? false;
                          const ds =
                            STATE_STYLE[db.state] ??
                            "text-foreground/30 bg-foreground/5";
                          const filteredTables = tableFilter
                            ? dbTables.filter((t) =>
                                t.name
                                  .toLowerCase()
                                  .includes(tableFilter.toLowerCase()),
                              )
                            : dbTables;

                          return (
                            <div
                              key={db.name}
                              className="border-t border-border"
                            >
                              <button
                                onClick={() => toggleDatabase(db)}
                                className={`w-full flex items-center gap-[7px] pl-[24px] pr-[10px] py-[7px] transition-colors text-left ${dbSelected ? "bg-brand-fill/7" : "hover:bg-foreground/[2%]"}`}
                              >
                                <Icon
                                  icon={
                                    dbExpanded
                                      ? "solar:alt-arrow-down-linear"
                                      : "solar:alt-arrow-right-linear"
                                  }
                                  className="text-[9px] text-foreground/20 shrink-0"
                                />
                                <Icon
                                  icon="solar:database-bold"
                                  className={`text-xs shrink-0 ${dbSelected ? "text-brand" : "text-foreground/30"}`}
                                />
                                <span
                                  className={`text-[10px] font-mono flex-1 truncate ${dbSelected ? "text-foreground" : "text-foreground/60"}`}
                                >
                                  {shortName(db.name)}
                                </span>
                                <span
                                  className={`text-[7px] uppercase px-[3px] py-[1px] rounded-[2px] font-mono shrink-0 ${ds}`}
                                >
                                  {db.state || "?"}
                                </span>
                              </button>

                              {dbExpanded && (
                                <div className="bg-background px-[10px] py-[6px]">
                                  {loadingTables ? (
                                    <div className="flex items-center justify-center py-[10px]">
                                      <Loader size={12} />
                                    </div>
                                  ) : (
                                    <>
                                      {dbTables.length > 3 && (
                                        <input
                                          value={tableFilter}
                                          onChange={(e) =>
                                            setTableFilter(e.target.value)
                                          }
                                          placeholder="Filter tables…"
                                          className="w-full px-[8px] py-[3px] bg-background border border-border rounded-[3px] text-[9px] font-mono text-foreground placeholder:text-foreground/20 focus:outline-none focus:border-foreground/25 mb-[4px]"
                                        />
                                      )}
                                      {filteredTables.length === 0 ? (
                                        <p className="text-[9px] text-foreground/20 font-mono py-[4px]">
                                          {dbTables.length === 0
                                            ? "No tables"
                                            : "No match"}
                                        </p>
                                      ) : (
                                        filteredTables.map((table) => {
                                          const tabId = `${db.name}::${table.name}`;
                                          const isOpen = tabs.includes(tabId);
                                          const isActive = activeTab === tabId;
                                          return (
                                            <button
                                              key={table.name}
                                              onClick={() =>
                                                openTableTab(
                                                  table.name,
                                                  db.name,
                                                )
                                              }
                                              className={`w-full flex items-center gap-[7px] px-[4px] py-[4px] rounded-[2px] transition-colors text-left group ${isActive ? "bg-brand-fill/10" : "hover:bg-foreground/[3%]"}`}
                                            >
                                              <Icon
                                                icon="hugeicons:table"
                                                className={`text-xs shrink-0 transition-colors ${isActive ? "text-brand" : isOpen ? "text-brand-fill/50" : "text-foreground/30"}`}
                                              />
                                              <span
                                                className={`text-[9px] font-mono flex-1 truncate transition-colors ${isActive ? "text-foreground" : isOpen ? "text-foreground/70" : "text-foreground/50 group-hover:text-foreground"}`}
                                              >
                                                {table.name}
                                              </span>
                                              {isOpen && !isActive && (
                                                <Icon
                                                  icon="solar:circle-bold"
                                                  className="text-[6px] text-brand-fill/50 shrink-0"
                                                />
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
        <TabBar
          items={tabs.map((tabId) => {
            const isQTab = isQueryTab(tabId);
            const label = isQTab
              ? (queryTabNames[tabId] ?? queryTabLabel(tabId))
              : (tableTabs[tabId]?.tableName ?? tabId);
            const isActive = activeTab === tabId;
            return {
              id: tabId,
              icon: (
                <Icon
                  icon={isQTab ? "solar:code-square-linear" : "hugeicons:table"}
                  className={`text-xs shrink-0 ${isActive && !isQTab ? "text-brand" : ""}`}
                />
              ),
              label: isQTab && editingTabId === tabId ? (
                <input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => commitRename(tabId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitRename(tabId);
                    }
                    if (e.key === "Escape") {
                      setEditingTabId(null);
                      setEditingName("");
                    }
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  className="w-[90px] bg-transparent outline-none text-foreground text-[10px] font-mono border-b border-brand-fill/60"
                />
              ) : (
                <span
                  className="max-w-[110px] truncate"
                  onDoubleClick={
                    isQTab
                      ? (e) => {
                          e.stopPropagation();
                          startRename(tabId);
                        }
                      : undefined
                  }
                >
                  {label}
                </span>
              ),
              closeable: !isQTab || tabs.filter(isQueryTab).length > 1,
            };
          })}
          activeId={activeTab}
          onActivate={activateTab}
          onClose={removeTab}
          onCloseMultiple={removeMultipleTabs}
          onReorder={handleReorder}
          variant="underline"
          size="md"
        >
          <button
            onClick={addQueryTab}
            className="flex items-center justify-center w-[32px] shrink-0 border-l border-border text-foreground/50 hover:text-foreground hover:bg-foreground/[6%] transition-colors self-stretch"
            title="New query tab"
          >
            <Icon
              icon="solar:add-square-bold-duotone"
              className="text-[16px]"
            />
          </button>
        </TabBar>

        {/* Tab content (lazy-mount, keep alive) */}
        <div className="flex-1 overflow-hidden relative">
          {/* Query tabs */}
          {tabs.filter(isQueryTab).map((tabId) => {
            const tabQuery = queryTabStates[tabId] ?? DEFAULT_QUERY_TAB_STATE;
            const {
              sql,
              queryLoading,
              queryError,
              queryResult,
              dmlResult,
              dmlMode,
              pendingRWTxn,
              txnActionLoading,
            } = tabQuery;
            const showModeToggle = rwTxnLabsEnabled && isDMLSQL(sql);
            return (
              <div
                key={tabId}
                className={`absolute inset-0 flex flex-col overflow-hidden ${activeTab === tabId ? "" : "hidden"}`}
              >
                {mountedTabs.has(tabId) && (
                  <>
                    {!selectedDatabase ? (
                      <div className="flex-1 flex flex-col items-center justify-center gap-[8px]">
                        <Icon
                          icon="solar:database-linear"
                          className="text-[28px] text-foreground/8"
                        />
                        <p className="text-[11px] text-foreground/30 font-mono">
                          Select a database to run queries
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between px-[16px] py-[10px] border-b border-border shrink-0">
                          <div className="flex items-center gap-[7px]">
                            <Icon
                              icon="solar:database-bold"
                              className="text-sm text-brand"
                            />
                            <p className="text-[10px] font-mono text-foreground/70">
                              {shortName(selectedDatabase)}
                            </p>
                          </div>
                          <div className="flex items-center gap-[10px]">
                            {showModeToggle && (
                              <div className="flex items-center rounded-[4px] border border-border overflow-hidden text-[9px] font-mono">
                                <button
                                  onClick={() => updateTabQuery(tabId, { dmlMode: "partitioned" })}
                                  className={`px-[7px] py-[3px] transition-colors ${dmlMode === "partitioned" ? "bg-foreground/10 text-foreground" : "text-foreground/40 hover:text-foreground/70"}`}
                                >
                                  Partitioned
                                </button>
                                <button
                                  onClick={() => updateTabQuery(tabId, { dmlMode: "readwrite" })}
                                  className={`px-[7px] py-[3px] border-l border-border transition-colors ${dmlMode === "readwrite" ? "bg-brand-fill/12 text-brand" : "text-foreground/40 hover:text-foreground/70"}`}
                                >
                                  Read-Write
                                </button>
                              </div>
                            )}
                            <p className="text-[9px] text-foreground/30 font-mono">
                              ⌘↩ to run
                            </p>
                          </div>
                        </div>

                        <div
                          className="flex flex-col shrink-0"
                          style={{ height: queryPanelHeight }}
                        >
                          <div className="px-[16px] pt-[12px] pb-[8px] flex-1 min-h-0 flex flex-col">
                            <div className="flex-1 min-h-0 border border-border rounded-[4px] overflow-hidden focus-within:border-brand-fill/40 transition-colors">
                              <SqlEditor
                                value={sql}
                                onChange={(val) =>
                                  updateTabQuery(tabId, { sql: val })
                                }
                                onRun={() => handleRunQuery(tabId)}
                                placeholder="SELECT * FROM MyTable LIMIT 20"
                              />
                            </div>
                            <div className="flex items-center justify-end mt-[8px] shrink-0">
                              <Button
                                variant="primary"
                                onClick={() => handleRunQuery(tabId)}
                                disabled={queryLoading || !sql.trim()}
                                icon={
                                  queryLoading ? (
                                    <Icon
                                      icon="solar:refresh-linear"
                                      className="text-xs animate-spin"
                                    />
                                  ) : (
                                    <Icon
                                      icon="solar:play-linear"
                                      className="text-xs"
                                    />
                                  )
                                }
                              >
                                {queryLoading ? "Running…" : "Run Query"}
                              </Button>
                            </div>
                          </div>
                          <div
                            onMouseDown={handleResizerMouseDown}
                            className="h-[4px] cursor-row-resize shrink-0 border-t border-border hover:bg-brand-fill/30 transition-colors"
                          />
                        </div>

                        <div className="flex-1 overflow-auto">
                          {queryError && (
                            <div className="m-[14px] p-[10px] bg-red-900/20 border border-red-800 rounded-[4px]">
                              <p className="text-[10px] text-red-400 font-mono whitespace-pre-wrap">
                                {queryError}
                              </p>
                            </div>
                          )}
                          {pendingRWTxn && (
                            <div className="m-[14px] p-[12px] bg-yellow-900/20 border border-yellow-700/50 rounded-[4px]">
                              <div className="flex items-center gap-[8px] mb-[10px]">
                                <Icon
                                  icon="solar:clock-circle-bold"
                                  className="text-yellow-400 text-sm shrink-0"
                                />
                                <p className="text-[10px] text-yellow-400 font-mono flex-1">
                                  {pendingRWTxn.rowsAffected} row{pendingRWTxn.rowsAffected !== 1 ? "s" : ""} staged — transaction is open
                                </p>
                              </div>
                              <div className="flex items-center gap-[6px]">
                                <button
                                  onClick={() => rollbackTransaction(tabId)}
                                  disabled={txnActionLoading !== null}
                                  className="flex items-center gap-[5px] px-[10px] py-[4px] rounded-[3px] border border-border text-[10px] font-mono text-foreground/70 hover:text-foreground hover:bg-foreground/[6%] transition-colors disabled:opacity-40"
                                >
                                  {txnActionLoading === "rollback" ? (
                                    <Icon icon="solar:refresh-linear" className="text-xs animate-spin" />
                                  ) : (
                                    <Icon icon="solar:close-circle-linear" className="text-xs" />
                                  )}
                                  Rollback
                                </button>
                                <button
                                  onClick={() => commitTransaction(tabId)}
                                  disabled={txnActionLoading !== null}
                                  className="flex items-center gap-[5px] px-[10px] py-[4px] rounded-[3px] bg-green-700/30 border border-green-700/50 text-[10px] font-mono text-green-400 hover:bg-green-700/50 transition-colors disabled:opacity-40"
                                >
                                  {txnActionLoading === "commit" ? (
                                    <Icon icon="solar:refresh-linear" className="text-xs animate-spin" />
                                  ) : (
                                    <Icon icon="solar:check-circle-linear" className="text-xs" />
                                  )}
                                  Commit
                                </button>
                              </div>
                            </div>
                          )}
                          {dmlResult && (
                            <div className="m-[14px] p-[10px] bg-green-900/20 border border-green-800 rounded-[4px] flex items-center gap-[8px]">
                              <Icon
                                icon="solar:check-circle-bold"
                                className="text-green-400 text-sm shrink-0"
                              />
                              <p className="text-[10px] text-green-400 font-mono">
                                {dmlResult.rowsAffected} row
                                {dmlResult.rowsAffected !== 1 ? "s" : ""}{" "}
                                affected
                              </p>
                            </div>
                          )}
                          {queryResult && queryResult.columns.length === 0 && (
                            <div className="flex items-center justify-center py-[40px]">
                              <p className="text-[10px] text-foreground/30 font-mono">
                                No results
                              </p>
                            </div>
                          )}
                          {queryResult && queryResult.columns.length > 0 && (
                            <>
                              <div className="px-[14px] py-[8px] border-b border-border">
                                <p className="text-[9px] text-foreground/30 font-mono uppercase font-bold">
                                  {queryResult.rows.length} row
                                  {queryResult.rows.length !== 1 ? "s" : ""}
                                </p>
                              </div>
                              <table className="w-full border-collapse text-[10px] font-mono">
                                <thead>
                                  <tr className="bg-muted border-b border-border">
                                    {queryResult.columns.map((col) => (
                                      <th
                                        key={col}
                                        className="text-left px-[12px] py-[7px] text-foreground/50 font-bold uppercase text-[9px] whitespace-nowrap border-r border-border last:border-0"
                                      >
                                        {col}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {queryResult.rows.map((row, i) => (
                                    <tr
                                      key={i}
                                      className="border-b border-border hover:bg-foreground/[2%]"
                                    >
                                      {row.map((cell, j) => (
                                        <td
                                          key={j}
                                          className="px-[12px] py-[6px] border-r border-border last:border-0 max-w-[280px]"
                                        >
                                          {cell === "NULL" ? (
                                            <span className="text-foreground/20 italic">
                                              NULL
                                            </span>
                                          ) : (
                                            <span className="text-foreground/72 truncate block">
                                              {cell}
                                            </span>
                                          )}
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
            );
          })}

          {/* Table tabs */}
          {tabs
            .filter((t) => !isQueryTab(t))
            .map((tabId) => {
              const info = tableTabs[tabId];
              if (!info) return null;
              return (
                <div
                  key={tabId}
                  className={`absolute inset-0 overflow-hidden ${activeTab === tabId ? "" : "hidden"}`}
                >
                  {mountedTabs.has(tabId) && (
                    <SpannerTableView
                      tableName={info.tableName}
                      dbName={info.dbName}
                      onNavigateToQuery={(navSql) =>
                        handleNavigateToQuery(navSql, info.dbName)
                      }
                    />
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* Destructive query confirmation */}
      <AlertDialog
        open={destructivePendingTab !== null}
        onOpenChange={(open) => {
          if (!open) setDestructivePendingTab(null);
        }}
      >
        <AlertDialogContent className="text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-mono text-sm">
              Destructive statement
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/50 text-[10px] font-mono">
              This will permanently modify or destroy data. This cannot be
              undone.
              <pre className="mt-[10px] text-[9px] text-red-400 bg-background border border-border p-[8px] rounded-[3px] overflow-x-auto whitespace-pre-wrap break-all">
                {(
                  queryTabStates[destructivePendingTab ?? ""]?.sql ?? ""
                ).trim()}
              </pre>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-muted border-border text-foreground hover:bg-card font-mono text-[10px]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-foreground font-mono text-[10px]"
              onClick={() => {
                const tabId = destructivePendingTab!;
                setDestructivePendingTab(null);
                executeQuery(tabId);
              }}
            >
              Execute
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
