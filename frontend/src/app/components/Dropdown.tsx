import { useState } from 'react';
import { Icon } from '@iconify/react';

interface DropdownProps {
  label: string;
  options?: string[];
  onSelect?: (option: string) => void;
}

export function Dropdown({ label, options = [], onSelect }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="content-stretch flex h-full items-center relative shrink-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="content-stretch flex gap-[5px] h-full items-center px-[12px] relative shrink-0 hover:bg-[rgba(255,255,255,0.05)] transition-colors border-l border-[#464646]"
      >
        <p className="font-['JetBrains_Mono',sans-serif] leading-[normal] not-italic relative shrink-0 text-[11px] text-white whitespace-nowrap">
          {label}
        </p>
        <Icon icon="solar:alt-arrow-down-linear" className="text-white text-xs opacity-50" />
      </button>
      
      {/* Settings icon as a separate block */}
      <button className="h-full border-l border-[#464646] flex items-center justify-center px-[10px] hover:bg-[rgba(255,255,255,0.05)] transition-colors">
        <Icon icon="solar:settings-linear" className="text-white text-base opacity-70" />
      </button>

      {isOpen && options.length > 0 && (
        <div className="absolute top-full right-0 mt-0 bg-[#2c2c2c] border border-[#464646] z-50 min-w-[150px] shadow-xl">
          {options.map((option, index) => (
            <button
              key={index}
              onClick={() => {
                setIsOpen(false);
                onSelect?.(option);
              }}
              className="w-full px-[12px] py-[10px] text-left text-white hover:bg-[#f881a9] hover:text-[#6f0025] transition-colors font-['JetBrains_Mono',sans-serif] text-[11px] uppercase border-b border-[#464646] last:border-b-0"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
