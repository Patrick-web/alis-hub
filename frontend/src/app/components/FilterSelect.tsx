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
        className={`flex items-center justify-between gap-[6px] border transition-colors font-mono w-full ${
          isLg
            ? `px-[12px] py-[8px] rounded-[4px] text-[12px] ${
                disabled
                  ? 'bg-background border-border text-foreground/20 cursor-not-allowed'
                  : open
                  ? 'bg-card border-brand-fill text-foreground'
                  : 'bg-card border-border text-foreground hover:border-foreground/30'
              }`
            : `px-[8px] py-[3px] rounded-[3px] text-[9px] uppercase whitespace-nowrap ${
                disabled
                  ? 'bg-background border-border text-foreground/20 cursor-not-allowed'
                  : open
                  ? 'bg-card border-brand-fill text-foreground'
                  : 'bg-card border-border text-foreground/60 hover:border-foreground/30 hover:text-foreground'
              }`
        }`}
      >
        <span className={isPlaceholder ? 'text-foreground/30' : ''}>{displayLabel || placeholder}</span>
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
        <div className={`absolute top-full left-0 bg-background border border-border z-50 min-w-full shadow-[0_8px_24px_rgba(0,0,0,0.5)] max-h-[240px] overflow-y-auto ${isLg ? 'mt-[2px] rounded-[4px]' : 'mt-[3px] rounded-[3px]'}`}>
          {loading ? (
            <div className={`px-[10px] py-[8px] text-foreground/30 font-mono ${isLg ? 'text-[12px]' : 'text-[9px] uppercase'}`}>
              Loading…
            </div>
          ) : options.length === 0 ? (
            <div className={`px-[10px] py-[8px] text-foreground/30 font-mono ${isLg ? 'text-[12px]' : 'text-[9px] uppercase'}`}>
              {emptyLabel}
            </div>
          ) : (
            options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full text-left border-b border-border last:border-0 font-mono transition-colors ${
                  isLg ? 'px-[12px] py-[8px] text-[12px]' : 'px-[10px] py-[6px] text-[9px] uppercase'
                } ${
                  opt.value === value
                    ? 'text-brand bg-brand-fill/8'
                    : 'text-foreground/55 hover:bg-brand-fill hover:text-brand-foreground'
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
