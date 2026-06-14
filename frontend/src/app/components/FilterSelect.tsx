import { useState, useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';

export interface FilterSelectOption {
  label: string;
  value: string;
}

interface FilterSelectProps {
  value: string;
  options: FilterSelectOption[];
  onChange: (value: string) => void;
  loading?: boolean;
  disabled?: boolean;
  emptyLabel?: string;
}

export function FilterSelect({
  value,
  options,
  onChange,
  loading,
  disabled,
  emptyLabel = 'No options',
}: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`flex items-center gap-[5px] px-[8px] py-[3px] border rounded-[3px] text-[9px] uppercase font-['JetBrains_Mono',sans-serif] transition-colors whitespace-nowrap ${
          disabled
            ? 'bg-[#232323] border-[#363636] text-[rgba(255,255,255,0.2)] cursor-not-allowed'
            : open
            ? 'bg-[#2c2c2c] border-[#f881a9] text-white'
            : 'bg-[#2c2c2c] border-[#464646] text-[rgba(255,255,255,0.6)] hover:border-[rgba(255,255,255,0.3)] hover:text-white'
        }`}
      >
        <span>{selected?.label ?? value}</span>
        {loading ? (
          <Icon icon="solar:refresh-linear" className="text-[8px] animate-spin opacity-50" />
        ) : (
          <Icon
            icon="solar:alt-arrow-down-linear"
            className={`text-[8px] opacity-50 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-[3px] bg-[#1e1e1e] border border-[#464646] rounded-[3px] z-50 min-w-full shadow-[0_8px_24px_rgba(0,0,0,0.5)] max-h-[240px] overflow-y-auto">
          {loading ? (
            <div className="px-[10px] py-[8px] text-[9px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif] uppercase">
              Loading…
            </div>
          ) : options.length === 0 ? (
            <div className="px-[10px] py-[8px] text-[9px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif] uppercase">
              {emptyLabel}
            </div>
          ) : (
            options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full text-left px-[10px] py-[6px] text-[9px] uppercase font-['JetBrains_Mono',sans-serif] transition-colors border-b border-[#2a2a2a] last:border-0 ${
                  opt.value === value
                    ? 'text-[#f881a9] bg-[rgba(248,129,169,0.08)]'
                    : 'text-[rgba(255,255,255,0.55)] hover:bg-[#f881a9] hover:text-[#6f0025]'
                }`}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
