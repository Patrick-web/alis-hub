import { useState, useEffect, useRef } from 'react';
import { Icon } from '@iconify/react';
import { Loader } from '../Loader';
import { Button } from '../Button';
import { FilterSelect } from '../FilterSelect';
import { SearchableSelect } from '../ui/searchable-select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '../ui/sheet';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '../ui/alert-dialog';
import * as GS from '../../../../bindings/alis-hub-v3/gcloudservice';
import * as PD from '../../../../bindings/alis-hub-v3/protodecodeservice';
import type { SpannerQueryResult, ProtoMessageInfo, ProtoFieldInfo } from '../../../../bindings/alis-hub-v3/models';
import { useGCloud } from '../../stores/gcloud';

interface Props {
  tableName: string;
  dbName: string;
  org: string;
  product: string;
  protoDecodeEnabled: boolean;
  onNavigateToQuery: (sql: string) => void;
}

interface ProtoDecodeView {
  col: string;
  loading: boolean;
  json: string | null;
  error: string | null;
}

interface FieldQueryState {
  col: string;
  path: string[];       // proto field names drilled so far (not including the final picked field)
  pathLabels: string[]; // breadcrumb display labels; [0] is the root message's short name
  typeStack: string[];  // message type at each breadcrumb depth; last entry is the current one
}

type WhereOp = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IS NULL' | 'IS NOT NULL';

interface WhereCondition {
  id: string;
  column: string;
  op: WhereOp;
  value: string;
}

type ContextItem =
  | { label: string; onClick: () => void; destructive?: boolean }
  | 'divider';

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextItem[];
}

const OPS: WhereOp[] = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IS NULL', 'IS NOT NULL'];
const NO_VALUE_OPS: WhereOp[] = ['IS NULL', 'IS NOT NULL'];
// Spanner GoogleSQL rejects ORDER BY on these column types.
const NON_ORDERABLE_TYPES = new Set(['PROTO', 'STRUCT', 'ARRAY', 'JSON']);
const PAGE_SIZES = [20, 50, 100, 200];

function buildQuery(
  tableName: string,
  cols: string[],
  conds: WhereCondition[],
  orderBy: string,
  orderDir: 'ASC' | 'DESC',
  pageSize: number,
  page: number,
): string {
  const select = cols.length > 0 ? cols.join(', ') : '*';
  let q = `SELECT ${select}\nFROM \`${tableName}\``;
  if (conds.length > 0) {
    const parts = conds.map((c) => {
      if (c.op === 'IS NULL') return `\`${c.column}\` IS NULL`;
      if (c.op === 'IS NOT NULL') return `\`${c.column}\` IS NOT NULL`;
      const isNum = c.value !== '' && !isNaN(Number(c.value));
      const val = isNum ? c.value : `'${c.value.replace(/'/g, "\\'")}'`;
      if (c.op === 'LIKE') return `\`${c.column}\` LIKE ${val}`;
      return `\`${c.column}\` ${c.op} ${val}`;
    });
    q += `\nWHERE ${parts.join('\n  AND ')}`;
  }
  if (orderBy) q += `\nORDER BY \`${orderBy}\` ${orderDir}`;
  q += `\nLIMIT ${pageSize} OFFSET ${page * pageSize}`;
  return q;
}

function quoted(val: string): string {
  if (val === 'NULL') return 'NULL';
  if (val.trim() !== '' && !isNaN(Number(val))) return val;
  return `'${val.replace(/'/g, "\\'")}'`;
}

function ident(name: string): string {
  return `\`${name}\``;
}

export function SpannerTableView({ tableName, dbName, org, product, protoDecodeEnabled, onNavigateToQuery }: Props) {
  const [columns, setColumns] = useState<string[]>([]);
  const [whereConditions, setWhereConditions] = useState<WhereCondition[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [orderBy, setOrderBy] = useState('');
  const [orderDir, setOrderDir] = useState<'ASC' | 'DESC'>('ASC');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const [showColPicker, setShowColPicker] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);

  const [result, setResult] = useState<SpannerQueryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Destructive confirmation (for context menu actions)
  const [pendingDestructive, setPendingDestructive] = useState<{ sql: string; action: () => void } | null>(null);

  // Row detail panel
  const [selectedRow, setSelectedRow] = useState<string[] | null>(null);

  // Proto decode (Labs feature) — per-column chosen message type, and the decoded-JSON view
  const [protoColumnTypes, setProtoColumnTypes] = useState<Record<string, string>>({});
  const [tfColumnProtoTypes, setTfColumnProtoTypes] = useState<Record<string, string | undefined>>({});
  const [protoTypeOptions, setProtoTypeOptions] = useState<ProtoMessageInfo[]>([]);
  const [protoTypesLoading, setProtoTypesLoading] = useState(false);
  const [protoTypesError, setProtoTypesError] = useState<string | null>(null);
  const [protoDecodeView, setProtoDecodeView] = useState<ProtoDecodeView | null>(null);

  // Query-by-proto-field drill-down (native PROTO<> columns only — Spanner supports
  // dot-path field access in SQL for these, not for plain BYTES columns)
  const [fieldQuery, setFieldQuery] = useState<FieldQueryState | null>(null);
  const [fieldQueryFields, setFieldQueryFields] = useState<ProtoFieldInfo[]>([]);
  const [fieldQueryLoading, setFieldQueryLoading] = useState(false);
  const [fieldQueryError, setFieldQueryError] = useState<string | null>(null);
  const [fieldQueryPicked, setFieldQueryPicked] = useState<ProtoFieldInfo | null>(null);
  const [fieldQueryOp, setFieldQueryOp] = useState<WhereOp>('=');
  const [fieldQueryValue, setFieldQueryValue] = useState('');

  // Close column picker on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) {
        setShowColPicker(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return;
    function onDown(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setContextMenu(null);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  function runQuery(opts: {
    p?: number;
    cols?: string[];
    conds?: WhereCondition[];
    ob?: string;
    od?: 'ASC' | 'DESC';
    ps?: number;
  } = {}) {
    const p   = opts.p    ?? page;
    const cls = opts.cols ?? selectedColumns;
    const cds = opts.conds ?? whereConditions;
    const ob  = opts.ob   ?? orderBy;
    const od  = opts.od   ?? orderDir;
    const ps  = opts.ps   ?? pageSize;
    const q   = buildQuery(tableName, cls, cds, ob, od, ps, p);
    setLoading(true);
    setError(null);
    GS.ExecuteSpannerQuery(dbName, q)
      .then((r: SpannerQueryResult | null) => {
        setResult(r);
        if (r?.columns?.length) {
          setColumns((prev) => (prev.length ? prev : r.columns));
        }
        // Native Spanner PROTO columns declare their message type on the wire —
        // pre-fill the decode picker so the user doesn't have to guess it.
        if (r?.columns?.length && r.columnProtoTypes?.length) {
          setProtoColumnTypes((prev) => {
            const next = { ...prev };
            r.columns.forEach((col, i) => {
              const protoType = r.columnProtoTypes[i];
              if (protoType && !next[col]) next[col] = protoType;
            });
            return next;
          });
        }
      })
      .catch((e: unknown) => { if (useGCloud.getState().handleError(e)) return; setError(String(e)); })
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { runQuery(); }, []);

  function loadProtoTypes() {
    if (!protoDecodeEnabled || !org) return;
    setProtoTypesLoading(true);
    setProtoTypesError(null);
    PD.ListProtoMessageTypes(org)
      .then((types: ProtoMessageInfo[] | null) => setProtoTypeOptions(types ?? []))
      .catch((e: unknown) => setProtoTypesError(String(e)))
      .finally(() => setProtoTypesLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadProtoTypes(); }, [protoDecodeEnabled, org]);

  function loadSpannerSchemaTypes() {
    if (!protoDecodeEnabled || !org || !product || !tableName) return;
    PD.GetSpannerColumnProtoTypes(org, product, tableName)
      .then((cols: Record<string, string | undefined> | null) => {
        if (!cols) return;
        setTfColumnProtoTypes(cols);
        // spanner.tf is the authoritative, always-available source (it also covers
        // columns Spanner exposes as plain BYTES) — prefer it over native metadata,
        // but never clobber a manual override the user already made.
        setProtoColumnTypes((prev) => {
          const next = { ...prev };
          Object.entries(cols).forEach(([col, protoType]) => {
            if (protoType) next[col] = protoType;
          });
          return next;
        });
      })
      .catch(() => { /* no spanner.tf mapping available — fall back to native metadata / manual pick */ });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSpannerSchemaTypes(); }, [protoDecodeEnabled, org, product, tableName]);

  function rebuildProtoIndex() {
    if (!org) return;
    setProtoTypesLoading(true);
    setProtoTypesError(null);
    Promise.all([
      PD.RefreshProtoIndex(org),
      product ? PD.RefreshSpannerSchemaIndex(org, product) : Promise.resolve(),
    ])
      .then(() => { loadProtoTypes(); loadSpannerSchemaTypes(); })
      .catch((e: unknown) => { setProtoTypesError(String(e)); setProtoTypesLoading(false); });
  }

  function openProtoDecodedView(col: string, cellValue: string) {
    const messageType = protoColumnTypes[col];
    if (!messageType) return;
    setProtoDecodeView({ col, loading: true, json: null, error: null });
    PD.DecodeProtoBytes(org, cellValue, messageType)
      .then((json: string) => setProtoDecodeView({ col, loading: false, json, error: null }))
      .catch((e: unknown) => setProtoDecodeView({ col, loading: false, json: null, error: String(e) }));
  }

  function loadFieldsFor(messageType: string) {
    setFieldQueryLoading(true);
    setFieldQueryError(null);
    setFieldQueryFields([]);
    setFieldQueryPicked(null);
    PD.GetMessageFields(org, messageType)
      .then((fields: ProtoFieldInfo[] | null) => setFieldQueryFields(fields ?? []))
      .catch((e: unknown) => setFieldQueryError(String(e)))
      .finally(() => setFieldQueryLoading(false));
  }

  function openFieldQuery(col: string, messageType: string) {
    setContextMenu(null);
    setFieldQuery({ col, path: [], pathLabels: [messageType.split('.').pop() ?? messageType], typeStack: [messageType] });
    loadFieldsFor(messageType);
  }

  function drillIntoField(field: ProtoFieldInfo) {
    if (!fieldQuery || field.kind !== 'message' || field.repeated || field.isMap) return;
    setFieldQuery({
      ...fieldQuery,
      path: [...fieldQuery.path, field.name],
      pathLabels: [...fieldQuery.pathLabels, field.name],
      typeStack: [...fieldQuery.typeStack, field.typeName],
    });
    loadFieldsFor(field.typeName);
  }

  function goBackTo(index: number) {
    if (!fieldQuery) return;
    const newPath = fieldQuery.path.slice(0, index);
    const newLabels = fieldQuery.pathLabels.slice(0, index + 1);
    const newTypeStack = fieldQuery.typeStack.slice(0, index + 1);
    setFieldQuery({ ...fieldQuery, path: newPath, pathLabels: newLabels, typeStack: newTypeStack });
    loadFieldsFor(newTypeStack[newTypeStack.length - 1]);
  }

  function pickField(field: ProtoFieldInfo) {
    if (field.repeated || field.isMap) return;
    if (field.kind === 'message') {
      drillIntoField(field);
      return;
    }
    setFieldQueryPicked(field);
    setFieldQueryOp('=');
    setFieldQueryValue('');
  }

  function runFieldQuery() {
    if (!fieldQuery || !fieldQueryPicked) return;
    const fieldPath = [...fieldQuery.path, fieldQueryPicked.name].join('.');
    const expr = `${ident(fieldQuery.col)}.${fieldPath}`;
    const t = ident(tableName);
    const sql = NO_VALUE_OPS.includes(fieldQueryOp)
      ? `SELECT *\nFROM ${t}\nWHERE ${expr} ${fieldQueryOp}\nLIMIT 50`
      : `SELECT *\nFROM ${t}\nWHERE ${expr} ${fieldQueryOp} ${quoted(fieldQueryValue)}\nLIMIT 50`;
    setFieldQuery(null);
    onNavigateToQuery(sql);
  }

  function isOrderableColumn(col: string): boolean {
    const idx = result?.columns.indexOf(col) ?? -1;
    if (idx < 0) return true;
    const type = result?.columnTypes?.[idx];
    return !type || !NON_ORDERABLE_TYPES.has(type);
  }

  function sortByColumn(col: string) {
    if (!isOrderableColumn(col)) return;
    const newDir: 'ASC' | 'DESC' = orderBy === col && orderDir === 'ASC' ? 'DESC' : 'ASC';
    setOrderBy(col);
    setOrderDir(newDir);
    setPage(0);
    runQuery({ ob: col, od: newDir, p: 0 });
  }

  function applyFilters() {
    setPage(0);
    runQuery({ p: 0 });
  }

  function changePage(newPage: number) {
    setPage(newPage);
    runQuery({ p: newPage });
  }

  function addCondition() {
    setWhereConditions((prev) => [
      ...prev,
      { id: crypto.randomUUID(), column: columns[0] ?? '', op: '=', value: '' },
    ]);
  }

  function updateCondition(id: string, patch: Partial<WhereCondition>) {
    setWhereConditions((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeCondition(id: string) {
    setWhereConditions((prev) => prev.filter((c) => c.id !== id));
  }

  function toggleColumn(col: string) {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col],
    );
  }

  function openContextMenu(e: React.MouseEvent, items: ContextItem[]) {
    e.preventDefault();
    const menuWidth = 260;
    const menuHeight = 240;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight);
    setContextMenu({ x, y, items });
  }

  function navigate(sql: string) {
    setContextMenu(null);
    onNavigateToQuery(sql);
  }

  function navigateDestructive(sql: string) {
    setContextMenu(null);
    setPendingDestructive({ sql, action: () => onNavigateToQuery(sql) });
  }

  function buildColumnMenu(col: string): ContextItem[] {
    const t = ident(tableName);
    const c = ident(col);
    return [
      { label: `SELECT ${c} FROM ${t}`, onClick: () => navigate(`SELECT ${c}\nFROM ${t}\nLIMIT 50`) },
      { label: `SELECT DISTINCT ${c}`, onClick: () => navigate(`SELECT DISTINCT ${c}\nFROM ${t}\nLIMIT 50`) },
      { label: `COUNT(*) GROUP BY ${c}`, onClick: () => navigate(`SELECT ${c}, COUNT(*) AS count\nFROM ${t}\nGROUP BY ${c}\nORDER BY count DESC\nLIMIT 50`) },
      { label: `ORDER BY ${c} ASC`, onClick: () => navigate(`SELECT *\nFROM ${t}\nORDER BY ${c} ASC\nLIMIT 50`) },
      'divider',
      { label: `DELETE WHERE ${c} = ?`, destructive: true, onClick: () => navigateDestructive(`DELETE FROM ${t}\nWHERE ${c} = ?`) },
      { label: `UPDATE SET ${c} = ? WHERE ...`, destructive: true, onClick: () => navigateDestructive(`UPDATE ${t}\nSET ${c} = ?\nWHERE ...`) },
    ];
  }

  function buildCellMenu(col: string, val: string): ContextItem[] {
    const t = ident(tableName);
    const c = ident(col);
    const v = quoted(val);
    const items: ContextItem[] = [];

    // Only native Spanner PROTO<> columns support dot-path field access in SQL —
    // plain BYTES columns (even ones we've mapped to a proto type for decoding) have
    // no structure Spanner's query engine can see.
    const colIdx = result?.columns.indexOf(col) ?? -1;
    const isNativeProtoColumn = colIdx >= 0 && result?.columnTypes?.[colIdx] === 'PROTO';
    const messageType = protoColumnTypes[col];
    if (protoDecodeEnabled && isNativeProtoColumn && messageType) {
      items.push(
        { label: 'Query by field…', onClick: () => openFieldQuery(col, messageType) },
        'divider',
      );
    }

    items.push(
      { label: `SELECT WHERE ${col} = ${val}`, onClick: () => navigate(`SELECT *\nFROM ${t}\nWHERE ${c} = ${v}\nLIMIT 50`) },
      { label: `SELECT WHERE ${col} != ${val}`, onClick: () => navigate(`SELECT *\nFROM ${t}\nWHERE ${c} != ${v}\nLIMIT 50`) },
      { label: `SELECT WHERE ${col} IS NULL`, onClick: () => navigate(`SELECT *\nFROM ${t}\nWHERE ${c} IS NULL\nLIMIT 50`) },
      'divider',
      { label: `DELETE WHERE ${col} = ${val}`, destructive: true, onClick: () => navigateDestructive(`DELETE FROM ${t}\nWHERE ${c} = ${v}`) },
      { label: `UPDATE SET ? WHERE ${col} = ${val}`, destructive: true, onClick: () => navigateDestructive(`UPDATE ${t}\nSET ? = ?\nWHERE ${c} = ${v}`) },
      'divider',
      { label: 'Copy value', onClick: () => { setContextMenu(null); navigator.clipboard.writeText(val); } },
    );
    return items;
  }

  function copyRowAsJSON(row: string[]) {
    const obj = Object.fromEntries(columns.map((c, i) => [c, row[i]]));
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
  }

  function copyRowAsCSV(row: string[]) {
    const header = `"${columns.join('","')}"`;
    const values = `"${row.map((v) => v.replace(/"/g, '""')).join('","')}"`;
    navigator.clipboard.writeText(`${header}\n${values}`);
  }

  const hasNext = (result?.rows?.length ?? 0) >= pageSize;
  const hasPrev = page > 0;
  const generatedSql = buildQuery(tableName, selectedColumns, whereConditions, orderBy, orderDir, pageSize, page);

  const orderByOptions = [
    { label: '—', value: '' },
    ...columns.map((c) => ({ label: c, value: c })),
  ];
  const pageSizeOptions = PAGE_SIZES.map((n) => ({ label: String(n), value: String(n) }));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Builder bar ── */}
      <div className="border-b border-border px-[14px] py-[10px] shrink-0 space-y-[8px] bg-background">

        {/* Row 1: SELECT cols + WHERE conditions */}
        <div className="flex items-start gap-[10px]">
          {/* Column picker */}
          <div className="relative shrink-0" ref={colPickerRef}>
            <button
              onClick={() => setShowColPicker((v) => !v)}
              className="flex items-center gap-[5px] h-[26px] px-[8px] bg-muted border border-border rounded-[3px] text-[10px] font-mono text-foreground hover:border-brand-fill/50 transition-colors"
            >
              <Icon icon="solar:filter-table-linear" className="text-[11px] text-brand" />
              <span>
                {selectedColumns.length === 0
                  ? 'All columns'
                  : `${selectedColumns.length} col${selectedColumns.length > 1 ? 's' : ''}`}
              </span>
              <Icon icon={showColPicker ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'} className="text-[9px] text-foreground/35" />
            </button>

            {showColPicker && (
              <div className="absolute z-20 top-[calc(100%+4px)] left-0 bg-muted border border-border rounded-[4px] shadow-xl min-w-[160px]">
                <div className="flex items-center justify-between px-[10px] py-[6px] border-b border-border">
                  <span className="text-[8px] uppercase text-foreground/30 font-mono font-bold">Columns</span>
                  <button
                    onClick={() => setSelectedColumns([])}
                    className="text-[8px] text-foreground/35 hover:text-brand font-mono transition-colors"
                  >
                    All
                  </button>
                </div>
                <div className="max-h-[220px] overflow-y-auto">
                  {columns.map((col) => {
                    const checked = selectedColumns.includes(col);
                    return (
                      <button
                        key={col}
                        onClick={() => toggleColumn(col)}
                        className="w-full flex items-center gap-[8px] px-[10px] py-[5px] hover:bg-foreground/[4%] text-left"
                      >
                        <div className={`w-[11px] h-[11px] border rounded-[2px] flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-brand-fill border-brand-fill' : 'border-border'}`}>
                          {checked && <Icon icon="solar:check-read-linear" className="text-[7px] text-foreground" />}
                        </div>
                        <span className="text-[10px] font-mono text-foreground/70 truncate">{col}</span>
                      </button>
                    );
                  })}
                  {columns.length === 0 && (
                    <p className="text-[9px] text-foreground/30 font-mono px-[10px] py-[8px]">
                      Run a query first
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {protoDecodeEnabled && (
            <button
              onClick={rebuildProtoIndex}
              disabled={protoTypesLoading}
              title="Recompile proto types from the define repo"
              className="flex items-center gap-[5px] h-[26px] px-[8px] bg-muted border border-border rounded-[3px] text-[10px] font-mono text-foreground/60 hover:text-foreground hover:border-brand-fill/50 transition-colors disabled:opacity-40 shrink-0"
            >
              <Icon icon="solar:refresh-linear" className={`text-[11px] ${protoTypesLoading ? 'animate-spin' : ''}`} />
              <span>Rebuild proto index</span>
            </button>
          )}

          {/* WHERE filters */}
          <div className="flex-1 flex flex-col gap-[5px] min-w-0">
            {whereConditions.map((cond) => (
              <div key={cond.id} className="flex items-center gap-[5px]">
                <Icon icon="solar:filter-linear" className="text-[10px] text-foreground/25 shrink-0" />
                <SearchableSelect
                  value={cond.column}
                  options={columns.length > 0 ? columns : [cond.column]}
                  onChange={(val) => updateCondition(cond.id, { column: val })}
                  className="max-w-[130px]"
                />
                <SearchableSelect
                  value={cond.op}
                  options={[...OPS]}
                  onChange={(val) => updateCondition(cond.id, { op: val as WhereOp })}
                />
                {!NO_VALUE_OPS.includes(cond.op) && (
                  <input
                    value={cond.value}
                    onChange={(e) => updateCondition(cond.id, { value: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
                    placeholder="value"
                    className="bg-muted border border-border text-foreground text-[10px] font-mono px-[6px] h-[24px] rounded-[3px] focus:outline-none focus:border-brand-fill/40 w-[120px]"
                  />
                )}
                <button
                  onClick={() => removeCondition(cond.id)}
                  className="text-foreground/20 hover:text-brand transition-colors shrink-0"
                >
                  <Icon icon="solar:close-circle-linear" className="text-sm" />
                </button>
              </div>
            ))}
            <button
              onClick={addCondition}
              className="flex items-center gap-[4px] text-[9px] text-foreground/30 hover:text-foreground/65 font-mono transition-colors w-fit"
            >
              <Icon icon="solar:add-circle-linear" className="text-[11px]" />
              Add filter
            </button>
          </div>
        </div>

        {/* Row 2: ORDER BY + LIMIT + Run */}
        <div className="flex items-center gap-[10px] flex-wrap">
          <div className="flex items-center gap-[5px]">
            <span className="text-[8px] uppercase text-foreground/35 font-mono font-bold">Order</span>
            <FilterSelect
              value={orderBy}
              options={orderByOptions}
              onChange={(val) => { setOrderBy(val); runQuery({ ob: val }); }}
            />
            {orderBy && (
              <button
                onClick={() => { const d = orderDir === 'ASC' ? 'DESC' : 'ASC'; setOrderDir(d); runQuery({ od: d }); }}
                className="flex items-center gap-[3px] h-[24px] px-[6px] bg-card border border-border rounded-[3px] text-[9px] font-mono text-foreground hover:border-brand-fill/40 transition-colors"
              >
                <Icon
                  icon={orderDir === 'ASC' ? 'solar:sort-from-bottom-to-top-linear' : 'solar:sort-from-top-to-bottom-linear'}
                  className="text-xs"
                />
                {orderDir}
              </button>
            )}
          </div>

          <div className="flex items-center gap-[5px]">
            <span className="text-[8px] uppercase text-foreground/35 font-mono font-bold">Limit</span>
            <FilterSelect
              value={String(pageSize)}
              options={pageSizeOptions}
              onChange={(val) => { setPageSize(Number(val)); setPage(0); runQuery({ ps: Number(val), p: 0 }); }}
            />
          </div>

          <Button
            variant="primary"
            onClick={applyFilters}
            disabled={loading}
            icon={loading
              ? <Icon icon="solar:refresh-linear" className="text-xs animate-spin" />
              : <Icon icon="solar:play-linear" className="text-xs" />
            }
          >
            {loading ? 'Running…' : 'Run'}
          </Button>

          <details className="ml-auto group">
            <summary className="text-[8px] uppercase text-foreground/25 font-mono cursor-pointer hover:text-foreground/50 transition-colors list-none flex items-center gap-[4px]">
              <Icon icon="solar:code-square-linear" className="text-[11px]" />
              SQL
            </summary>
            <div className="absolute z-10 right-[14px] mt-[4px] max-w-[500px] bg-background border border-border rounded-[4px] p-[10px] shadow-xl">
              <pre className="text-[9px] font-mono text-foreground/65 whitespace-pre-wrap break-all">
                {generatedSql}
              </pre>
            </div>
          </details>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mx-[14px] mt-[10px] p-[10px] bg-red-900/20 border border-red-800 rounded-[4px] shrink-0">
          <p className="text-[10px] text-red-400 font-mono whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {/* ── Data grid ── */}
      <div className="flex-1 overflow-auto relative">
        {loading ? (
          <div className="flex items-center justify-center h-full"><Loader size={28} /></div>
        ) : result && result.columns.length > 0 ? (
          <table className="w-full border-collapse text-[10px] font-mono">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted border-b border-border">
                {result.columns.map((col, colIdx) => {
                  const colType = result.columnTypes?.[colIdx];
                  const isDecodable = colType === 'BYTES' || colType === 'PROTO' || !!tfColumnProtoTypes[col];
                  const orderable = isOrderableColumn(col);
                  return (
                    <th
                      key={col}
                      className="text-left px-[12px] py-[7px] text-foreground/50 font-bold text-[9px] whitespace-nowrap border-r border-border last:border-0 hover:bg-foreground/[3%] transition-colors select-none"
                      onContextMenu={(e) => openContextMenu(e, buildColumnMenu(col))}
                    >
                      <div
                        className={`flex items-center gap-[5px] uppercase ${orderable ? 'cursor-pointer' : 'cursor-default'}`}
                        onClick={() => sortByColumn(col)}
                        title={orderable ? undefined : `${colType} columns can't be sorted`}
                      >
                        {col}
                        {orderable && (
                          <Icon
                            icon={
                              orderBy === col
                                ? (orderDir === 'ASC' ? 'solar:sort-from-bottom-to-top-linear' : 'solar:sort-from-top-to-bottom-linear')
                                : 'solar:sort-linear'
                            }
                            className={`text-[9px] transition-colors ${orderBy === col ? 'text-brand' : 'text-foreground/15'}`}
                          />
                        )}
                      </div>
                      {protoDecodeEnabled && isDecodable && (
                        <div className="mt-[4px] normal-case" onClick={(e) => e.stopPropagation()}>
                          <SearchableSelect
                            value={protoColumnTypes[col] ?? ''}
                            options={protoTypeOptions.map((t) => ({ label: t.fullName, value: t.fullName }))}
                            onChange={(val) => setProtoColumnTypes((prev) => ({ ...prev, [col]: val }))}
                            placeholder="Decode as…"
                            loading={protoTypesLoading}
                            emptyLabel={protoTypesError ?? 'No message types'}
                            className="max-w-[130px] font-normal normal-case"
                          />
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border hover:bg-foreground/[2%] transition-colors cursor-pointer"
                  onClick={() => setSelectedRow(row)}
                >
                  {row.map((cell, j) => {
                    const col = result.columns[j];
                    const messageType = protoDecodeEnabled ? protoColumnTypes[col] : undefined;
                    return (
                      <td
                        key={j}
                        title={cell === 'NULL' ? '' : cell}
                        className="px-[12px] py-[6px] border-r border-border last:border-0 max-w-[240px]"
                        onContextMenu={(e) => openContextMenu(e, buildCellMenu(col, cell))}
                      >
                        {cell === 'NULL' ? (
                          <span className="text-foreground/20 italic">NULL</span>
                        ) : messageType ? (
                          <Button
                            variant="ghost"
                            icon={<Icon icon="solar:code-2-linear"  />}
                            onClick={(e) => { e.stopPropagation(); openProtoDecodedView(col, cell); }}
                            className="!h-[18px] !px-[6px] !py-0 justify-start max-w-full"
                          >
                            View JSON
                          </Button>
                        ) : (
                          <span className="text-foreground/72 truncate block">{cell}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : !loading && !error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[10px] text-foreground/30 font-mono">No rows</p>
          </div>
        ) : null}
      </div>

      {/* ── Pagination ── */}
      {result && !loading && result.columns.length > 0 && (
        <div className="flex items-center justify-between px-[14px] py-[7px] border-t border-border shrink-0 bg-background">
          <p className="text-[9px] text-foreground/30 font-mono">
            {result.rows.length} row{result.rows.length !== 1 ? 's' : ''}
            {page > 0 && ` · offset ${page * pageSize}`}
          </p>
          <div className="flex items-center gap-[6px]">
            <button
              onClick={() => changePage(page - 1)}
              disabled={!hasPrev}
              className="flex items-center gap-[3px] h-[22px] px-[8px] text-[9px] font-mono border border-border rounded-[3px] text-foreground disabled:opacity-30 hover:enabled:border-foreground/30 transition-colors disabled:cursor-not-allowed"
            >
              <Icon icon="solar:alt-arrow-left-linear" className="text-xs" />
              Prev
            </button>
            <span className="text-[9px] text-foreground/35 font-mono">
              p{page + 1}
            </span>
            <button
              onClick={() => changePage(page + 1)}
              disabled={!hasNext}
              className="flex items-center gap-[3px] h-[22px] px-[8px] text-[9px] font-mono border border-border rounded-[3px] text-foreground disabled:opacity-30 hover:enabled:border-foreground/30 transition-colors disabled:cursor-not-allowed"
            >
              Next
              <Icon icon="solar:alt-arrow-right-linear" className="text-xs" />
            </button>
          </div>
        </div>
      )}

      {/* ── Context menu ── */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 9999 }}
          className="bg-background border border-border rounded-[3px] shadow-[0_8px_24px_rgba(0,0,0,0.65)] min-w-[240px] py-[4px]"
        >
          {contextMenu.items.map((item, i) =>
            item === 'divider' ? (
              <div key={i} className="my-[2px] border-t border-border" />
            ) : (
              <button
                key={i}
                onClick={item.onClick}
                className={`w-full text-left px-[12px] py-[6px] text-[9px] font-mono uppercase transition-colors ${
                  item.destructive
                    ? 'text-red-400 hover:bg-red-600 hover:text-foreground'
                    : 'text-foreground/60 hover:bg-foreground/[6%] hover:text-foreground'
                }`}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      )}

      {/* ── Destructive context menu confirmation ── */}
      <AlertDialog open={!!pendingDestructive} onOpenChange={(open) => { if (!open) setPendingDestructive(null); }}>
        <AlertDialogContent className="text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-mono text-sm">
              Destructive statement
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/50 text-[10px] font-mono">
              This will prefill a destructive SQL statement in the Query tab. Review carefully before running.
              <pre className="mt-[10px] text-[9px] text-red-400 bg-background border border-border p-[8px] rounded-[3px] overflow-x-auto whitespace-pre-wrap break-all">
                {pendingDestructive?.sql}
              </pre>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-muted border-border text-foreground hover:bg-card font-mono text-[10px]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-foreground font-mono text-[10px]"
              onClick={() => { pendingDestructive?.action(); setPendingDestructive(null); }}
            >
              Open in Query tab
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Row detail panel ── */}
      <Sheet open={!!selectedRow} onOpenChange={(open) => { if (!open) setSelectedRow(null); }}>
        <SheetContent
          side="right"
          className="w-[360px] bg-background border-l border-border p-0 flex flex-col gap-0 text-foreground"
        >
          <SheetHeader className="px-[16px] py-[12px] border-b border-border">
            <SheetTitle className="text-[11px] text-foreground font-mono uppercase tracking-wider">
              Row · {tableName}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {selectedRow && columns.map((col, i) => (
              <div key={col} className="flex items-start gap-[8px] px-[14px] py-[8px] border-b border-border last:border-0 group">
                <span className="text-[8px] uppercase text-foreground/30 font-mono shrink-0 w-[100px] pt-[2px] truncate">
                  {col}
                </span>
                <span className={`text-[10px] font-mono flex-1 break-all ${selectedRow[i] === 'NULL' ? 'text-foreground/20 italic' : 'text-foreground/85'}`}>
                  {selectedRow[i]}
                </span>
                <button
                  onClick={() => navigator.clipboard.writeText(selectedRow[i])}
                  title="Copy value"
                  className="opacity-0 group-hover:opacity-100 shrink-0 p-[2px] text-foreground/30 hover:text-foreground transition-all"
                >
                  <Icon icon="solar:copy-linear" className="text-[11px]" />
                </button>
              </div>
            ))}
          </div>

          <div className="px-[14px] py-[10px] border-t border-border flex gap-[8px]">
            <button
              onClick={() => selectedRow && copyRowAsJSON(selectedRow)}
              className="flex items-center gap-[5px] px-[10px] py-[5px] bg-muted border border-border rounded-[3px] text-[9px] font-mono text-foreground/60 hover:text-foreground hover:border-foreground/30 transition-colors uppercase"
            >
              <Icon icon="solar:code-2-linear" className="text-[11px]" />
              Copy JSON
            </button>
            <button
              onClick={() => selectedRow && copyRowAsCSV(selectedRow)}
              className="flex items-center gap-[5px] px-[10px] py-[5px] bg-muted border border-border rounded-[3px] text-[9px] font-mono text-foreground/60 hover:text-foreground hover:border-foreground/30 transition-colors uppercase"
            >
              <Icon icon="solar:document-text-linear" className="text-[11px]" />
              Copy CSV
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Proto decode panel (Labs) ── */}
      <Sheet open={!!protoDecodeView} onOpenChange={(open) => { if (!open) setProtoDecodeView(null); }}>
        <SheetContent
          side="right"
          className="w-[420px] bg-background border-l border-border p-0 flex flex-col gap-0 text-foreground"
        >
          <SheetHeader className="px-[16px] py-[12px] border-b border-border">
            <SheetTitle className="text-[11px] text-foreground font-mono uppercase tracking-wider">
              {protoDecodeView?.col} · {protoColumnTypes[protoDecodeView?.col ?? '']}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-[14px]">
            {protoDecodeView?.loading ? (
              <div className="flex items-center justify-center h-full"><Loader size={24} /></div>
            ) : protoDecodeView?.error ? (
              <p className="text-[10px] text-red-400 font-mono whitespace-pre-wrap">{protoDecodeView.error}</p>
            ) : (
              <>
                <p className="text-[9px] text-foreground/30 font-mono mb-[8px]">
                  Decoded speculatively using the chosen message type — verify the fields look sane.
                </p>
                <pre className="text-[10px] text-foreground/85 font-mono whitespace-pre-wrap break-all">
                  {protoDecodeView?.json}
                </pre>
              </>
            )}
          </div>

          {protoDecodeView?.json && (
            <div className="px-[14px] py-[10px] border-t border-border">
              <button
                onClick={() => protoDecodeView.json && navigator.clipboard.writeText(protoDecodeView.json)}
                className="flex items-center gap-[5px] px-[10px] py-[5px] bg-muted border border-border rounded-[3px] text-[9px] font-mono text-foreground/60 hover:text-foreground hover:border-foreground/30 transition-colors uppercase"
              >
                <Icon icon="solar:copy-linear" className="text-[11px]" />
                Copy JSON
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Query by proto field (Labs) ── */}
      <Sheet open={!!fieldQuery} onOpenChange={(open) => { if (!open) { setFieldQuery(null); setFieldQueryPicked(null); } }}>
        <SheetContent
          side="right"
          className="w-[400px] bg-background border-l border-border p-0 flex flex-col gap-0 text-foreground"
        >
          <SheetHeader className="px-[16px] py-[12px] border-b border-border">
            <SheetTitle className="text-[11px] text-foreground font-mono uppercase tracking-wider">
              Query by field · {fieldQuery?.col}
            </SheetTitle>
            {fieldQuery && (
              <div className="flex items-center flex-wrap gap-[3px] pt-[4px]">
                {fieldQuery.pathLabels.map((label, i) => (
                  <span key={i} className="flex items-center gap-[3px]">
                    {i > 0 && <Icon icon="solar:alt-arrow-right-linear" className="text-[8px] text-foreground/25" />}
                    <button
                      onClick={() => goBackTo(i)}
                      disabled={i === fieldQuery.pathLabels.length - 1}
                      className="text-[9px] font-mono text-foreground/50 hover:text-brand disabled:text-foreground disabled:hover:text-foreground transition-colors"
                    >
                      {label}
                    </button>
                  </span>
                ))}
              </div>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {fieldQueryLoading ? (
              <div className="flex items-center justify-center h-full"><Loader size={24} /></div>
            ) : fieldQueryError ? (
              <p className="p-[14px] text-[10px] text-red-400 font-mono whitespace-pre-wrap">{fieldQueryError}</p>
            ) : fieldQueryPicked ? (
              <div className="p-[14px] flex flex-col gap-[10px]">
                <button
                  onClick={() => setFieldQueryPicked(null)}
                  className="flex items-center gap-[4px] text-[9px] font-mono text-foreground/40 hover:text-foreground transition-colors w-fit"
                >
                  <Icon icon="solar:alt-arrow-left-linear" className="text-[9px]" />
                  Back to fields
                </button>

                <p className="text-[10px] font-mono text-foreground/70 break-all">
                  {[...(fieldQuery?.path ?? []), fieldQueryPicked.name].join('.')}
                </p>

                <div className="flex items-center gap-[6px]">
                  <span className="text-[8px] uppercase text-foreground/35 font-mono font-bold shrink-0">Op</span>
                  <SearchableSelect
                    value={fieldQueryOp}
                    options={[...OPS]}
                    onChange={(val) => setFieldQueryOp(val as WhereOp)}
                    className="flex-1"
                  />
                </div>

                {!NO_VALUE_OPS.includes(fieldQueryOp) && (
                  <div className="flex items-center gap-[6px]">
                    <span className="text-[8px] uppercase text-foreground/35 font-mono font-bold shrink-0">Value</span>
                    {fieldQueryPicked.kind === 'enum' ? (
                      <SearchableSelect
                        value={fieldQueryValue}
                        options={fieldQueryPicked.enumValues ?? []}
                        onChange={setFieldQueryValue}
                        className="flex-1"
                      />
                    ) : fieldQueryPicked.scalarType === 'bool' ? (
                      <SearchableSelect
                        value={fieldQueryValue}
                        options={['true', 'false']}
                        onChange={setFieldQueryValue}
                        className="flex-1"
                      />
                    ) : (
                      <input
                        type={fieldQueryPicked.scalarType === 'int' || fieldQueryPicked.scalarType === 'float' ? 'number' : 'text'}
                        value={fieldQueryValue}
                        onChange={(e) => setFieldQueryValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') runFieldQuery(); }}
                        placeholder="value"
                        className="flex-1 bg-muted border border-border text-foreground text-[10px] font-mono px-[8px] h-[26px] rounded-[3px] focus:outline-none focus:border-brand-fill/40"
                      />
                    )}
                  </div>
                )}

                <Button variant="primary" onClick={runFieldQuery} icon={<Icon icon="solar:play-linear" className="text-xs" />}>
                  Run query
                </Button>
              </div>
            ) : fieldQueryFields.length === 0 ? (
              <p className="p-[14px] text-[10px] text-foreground/30 font-mono">No fields</p>
            ) : (
              <div className="py-[4px]">
                {fieldQueryFields.map((field) => {
                  const disabled = field.repeated || field.isMap;
                  const kindLabel = field.isMap ? 'map' : field.repeated ? `repeated ${field.kind}` : (field.kind === 'scalar' ? field.scalarType : field.kind);
                  return (
                    <button
                      key={field.name}
                      onClick={() => pickField(field)}
                      disabled={disabled}
                      title={disabled ? "Repeated/map fields aren't supported yet" : undefined}
                      className="w-full flex items-center justify-between gap-[8px] px-[14px] py-[7px] hover:bg-foreground/[4%] disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed text-left transition-colors"
                    >
                      <span className="flex items-center gap-[6px] min-w-0">
                        <Icon
                          icon={field.kind === 'message' ? 'solar:folder-linear' : field.kind === 'enum' ? 'solar:list-linear' : 'solar:hashtag-linear'}
                          className="text-[11px] text-foreground/35 shrink-0"
                        />
                        <span className="text-[10px] font-mono text-foreground/80 truncate">{field.name}</span>
                      </span>
                      <span className="flex items-center gap-[4px] shrink-0">
                        <span className="text-[8px] uppercase text-foreground/30 font-mono">{kindLabel}</span>
                        {field.kind === 'message' && !disabled && (
                          <Icon icon="solar:alt-arrow-right-linear" className="text-[9px] text-foreground/25" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
