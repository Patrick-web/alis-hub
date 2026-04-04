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
  selectedIds?: string[];
  onSelectRow?: (id: string) => void;
  onSelectAll?: () => void;
}

export function Table<T>({ 
  columns, 
  data, 
  rowId, 
  selectedIds = [], 
  onSelectRow, 
  onSelectAll 
}: TableProps<T>) {
  const isAllSelected = data.length > 0 && selectedIds.length === data.length;

  return (
    <div className="w-full h-full overflow-auto bg-[#1e1e1e]">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-[#1e1e1e]">
          <tr className="border-b border-[#464646]">
            <th className="w-[40px] p-[10px] border-r border-[#464646] text-center">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={onSelectAll}
                className="size-[15px] cursor-pointer accent-[#f881a9]"
              />
            </th>
            {columns.map((column, index) => (
              <th
                key={index}
                className={`p-[10px] text-left font-['JetBrains_Mono',sans-serif] font-bold text-[12px] text-white uppercase border-r border-[#464646] last:border-r-0 ${column.headerClassName || ''}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => {
            const id = rowId(item);
            const isSelected = selectedIds.includes(id);
            return (
              <tr 
                key={id} 
                className={`border-b border-[#464646] hover:bg-[rgba(255,255,255,0.02)] transition-colors ${isSelected ? 'bg-[rgba(248,129,169,0.05)]' : ''}`}
                onClick={() => onSelectRow?.(id)}
              >
                <td className="w-[40px] p-[10px] border-r border-[#464646] text-center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onSelectRow?.(id)}
                    className="size-[15px] cursor-pointer accent-[#f881a9]"
                  />
                </td>
                {columns.map((column, index) => (
                  <td
                    key={index}
                    className={`p-[10px] font-['JetBrains_Mono',sans-serif] text-[12px] text-white border-r border-[#464646] last:border-r-0 ${column.className || ''}`}
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
