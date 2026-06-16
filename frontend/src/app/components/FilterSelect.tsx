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
  placeholder?: string;
  /** 'sm' (default) = compact filter bar style; 'lg' = full-width form style */
  size?: 'sm' | 'lg';
}

export function FilterSelect({
  value,
  options,
  onChange,
  loading,
  disabled,
  emptyLabel = 'No options',
  placeholder,
  size = 'sm',
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
  const displayLabel = selected?.label ?? (value ? value : placeholder ?? '');
  const isPlaceholder = !selected && !value;

  const isLg = size === 'lg';

  return (
    <div ref={ref} className={`relative ${isLg ? 'w-full' : 'shrink-0'}`}>
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`flex items-center justify-between gap-[6px] border transition-colors font-['JetBrains_Mono',sans-serif] w-full ${
          isLg
            ? `px-[12px] py-[8px] rounded-[4px] text-[12px] ${
                disabled
                  ? 'bg-[#232323] border-[#363636] text-white/20 cursor-not-allowed'
                  : open
                  ? 'bg-[#2c2c2c] border-[#f881a9] text-white'
                  : 'bg-[#2c2c2c] border-[#464646] text-white hover:border-white/30'
              }`
            : `px-[8px] py-[3px] rounded-[3px] text-[9px] uppercase whitespace-nowrap ${
                disabled
                  ? 'bg-[#232323] border-[#363636] text-white/20 cursor-not-allowed'
                  : open
                  ? 'bg-[#2c2c2c] border-[#f881a9] text-white'
                  : 'bg-[#2c2c2c] border-[#464646] text-white/60 hover:border-white/30 hover:text-white'
              }`
        }`}
      >
        <span className={isPlaceholder ? 'text-white/30' : ''}>{displayLabel || placeholder}</span>
        {loading ? (
          <Icon icon="solar:refresh-linear" className={`${isLg ? 'text-[11px]' : 'text-[8px]'} animate-spin opacity-50`} />
        ) : (
          <Icon
            icon="solar:alt-arrow-down-linear"
            className={`${isLg ? 'text-[11px]' : 'text-[8px]'} opacity-50 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {open && (
        <div className={`absolute top-full left-0 bg-[#1e1e1e] border border-[#464646] z-50 min-w-full shadow-[0_8px_24px_rgba(0,0,0,0.5)] max-h-[240px] overflow-y-auto ${isLg ? 'mt-[2px] rounded-[4px]' : 'mt-[3px] rounded-[3px]'}`}>
          {loading ? (
            <div className={`px-[10px] py-[8px] text-white/30 font-['JetBrains_Mono',sans-serif] ${isLg ? 'text-[12px]' : 'text-[9px] uppercase'}`}>
              Loading…
            </div>
          ) : options.length === 0 ? (
            <div className={`px-[10px] py-[8px] text-white/30 font-['JetBrains_Mono',sans-serif] ${isLg ? 'text-[12px]' : 'text-[9px] uppercase'}`}>
              {emptyLabel}
            </div>
          ) : (
            options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full text-left border-b border-[#2a2a2a] last:border-0 font-['JetBrains_Mono',sans-serif] transition-colors ${
                  isLg ? 'px-[12px] py-[8px] text-[12px]' : 'px-[10px] py-[6px] text-[9px] uppercase'
                } ${
                  opt.value === value
                    ? 'text-[#f881a9] bg-[rgba(248,129,169,0.08)]'
                    : 'text-white/55 hover:bg-[#f881a9] hover:text-[#6f0025]'
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
