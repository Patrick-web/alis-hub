import { useState } from 'react';
import { Icon } from '@iconify/react';

interface DropdownProps {
  label: string;
  options?: string[];
  onSelect?: (option: string) => void;
  onSettingsClick?: () => void;
  loading?: boolean;
  error?: string | null;
}

export function Dropdown({ label, options = [], onSelect, onSettingsClick, loading, error }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="content-stretch flex h-full items-center relative shrink-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="content-stretch flex gap-[5px] h-full items-center px-[12px] relative shrink-0 hover:bg-[rgba(255,255,255,0.05)] transition-colors border-l border-border"
      >
        <p className="font-mono leading-[normal] not-italic relative shrink-0 text-[11px] text-white whitespace-nowrap">
          {label}
        </p>
        <Icon icon="solar:alt-arrow-down-linear" className="text-white text-xs opacity-50" />
      </button>

      {/* Settings icon as a separate block */}
      <button onClick={onSettingsClick} className="h-full border-l border-border flex items-center justify-center px-[10px] hover:bg-[rgba(255,255,255,0.05)] transition-colors">
        <Icon icon="solar:settings-linear" className="text-white text-base opacity-70" />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-0 bg-card border border-border z-50 min-w-[150px] shadow-xl">
          {loading ? (
            <div className="px-[12px] py-[10px] text-[11px] text-[rgba(255,255,255,0.4)] font-mono">Loading…</div>
          ) : error ? (
            <div className="px-[12px] py-[10px] text-[11px] text-destructive font-mono max-w-[260px] leading-[1.5]">Session expired — sign in again via your profile.</div>
          ) : options.length === 0 ? (
            <div className="px-[12px] py-[10px] text-[11px] text-[rgba(255,255,255,0.4)] font-mono">No environments</div>
          ) : (
            options.map((option, index) => (
              <button
                key={index}
                onClick={() => {
                  setIsOpen(false);
                  onSelect?.(option);
                }}
                className="w-full px-[12px] py-[10px] text-left text-white hover:bg-brand hover:text-brand-foreground transition-colors font-mono text-[11px] uppercase border-b border-border last:border-b-0"
              >
                {option}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
