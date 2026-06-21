import { ReactNode } from 'react';

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
  return (
    <div className="w-full h-full overflow-auto bg-background">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-background">
          <tr className="border-b border-border">
            {columns.map((column, index) => (
              <th
                key={index}
                className={`p-[10px] text-left font-mono font-bold text-[12px] text-white uppercase border-r border-border last:border-r-0 ${column.headerClassName || ''}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => {
            const id = rowId(item);
            const isActive = activeRowId === id;
            return (
              <tr
                key={id}
                onClick={onRowClick ? () => onRowClick(item) : undefined}
                className={`border-b border-border transition-colors ${onRowClick ? 'cursor-pointer' : ''} ${isActive ? 'bg-[rgba(248,129,169,0.08)]' : 'hover:bg-[rgba(255,255,255,0.02)]'}`}
              >
                {columns.map((column, index) => (
                  <td
                    key={index}
                    className={`p-[10px] font-mono text-[12px] text-white border-r border-border last:border-r-0 ${column.className || ''}`}
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
