import { type ReactNode } from 'react';
import { Icon } from '@iconify/react';

interface RightPaneProps {
  label: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}

export function RightPane({ label, title, onClose, children, width = 'w-[380px]' }: RightPaneProps) {
  return (
    <div className={`${width} border-l border-[#464646] flex flex-col overflow-hidden shrink-0`}>
      {/* Header */}
      <div className="px-[16px] py-[12px] border-b border-[#464646] flex items-center justify-between shrink-0">
        <div>
          <p className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase font-bold font-['JetBrains_Mono',sans-serif]">
            {label}
          </p>
          <p className="text-[13px] font-bold text-white font-['JetBrains_Mono',sans-serif]">{title}</p>
        </div>
        <button
          onClick={onClose}
          className="w-[24px] h-[24px] flex items-center justify-center rounded-[3px] text-[rgba(255,255,255,0.4)] hover:text-white hover:bg-[#3c3c3c] transition-colors"
        >
          <Icon icon="solar:close-linear" className="text-sm" />
        </button>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {children}
      </div>
    </div>
  );
}
