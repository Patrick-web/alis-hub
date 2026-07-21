import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

interface Column<T> {
  header: string;
  render: (item: T) => ReactNode;
  className?: string;
  headerClassName?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowId: (item: T) => string;
  onRowClick?: (item: T) => void;
  activeRowId?: string;
}

export function Table<T>({ columns, data, rowId, onRowClick, activeRowId }: TableProps<T>) {
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const [focusIndex, setFocusIndex] = useState(-1);

  useEffect(() => {
    setFocusIndex(-1);
  }, [data.length]);

  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent, item: T, idx: number) => {
      const n = data.length;
      let next = idx;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        next = Math.min(idx + 1, n - 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        next = Math.max(idx - 1, 0);
      } else if (e.key === "Home") {
        e.preventDefault();
        next = 0;
      } else if (e.key === "End") {
        e.preventDefault();
        next = n - 1;
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onRowClick?.(item);
        return;
      } else {
        return;
      }
      setFocusIndex(next);
      const targetId = rowId(data[next]);
      rowRefs.current.get(targetId)?.focus();
    },
    [data, rowId, onRowClick],
  );

  return (
    <div className="w-full h-full overflow-auto bg-background">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-background">
          <tr className="border-b border-border">
            {columns.map((column, index) => (
              <th
                key={index}
                className={`p-[10px] text-left font-mono font-bold text-[12px] text-foreground uppercase border-r border-border last:border-r-0 ${column.headerClassName || ""}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, i) => {
            const id = rowId(item);
            const isActive = activeRowId === id;
            const isFocused = focusIndex === i;
            return (
              <tr
                key={id}
                ref={(el) => {
                  if (el) rowRefs.current.set(id, el);
                  else rowRefs.current.delete(id);
                }}
                tabIndex={0}
                role="row"
                aria-selected={isActive}
                onClick={onRowClick ? () => onRowClick(item) : undefined}
                onKeyDown={(e) => handleRowKeyDown(e, item, i)}
                onFocus={() => setFocusIndex(i)}
                className={`border-b border-border transition-colors ${
                  onRowClick ? "cursor-pointer" : ""
                } ${isActive ? "bg-brand-fill/8" : "hover:bg-foreground/[2%]"} ${
                  isFocused ? "ring-1 ring-inset ring-ring" : ""
                }`}
              >
                {columns.map((column, j) => (
                  <td
                    key={j}
                    className={`p-[10px] font-mono text-[12px] text-foreground border-r border-border last:border-r-0 ${column.className || ""}`}
                  >
                    {column.render(item)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
