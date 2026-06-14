import { ReactNode } from 'react';

interface TabProps {
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick?: () => void;
}

export function Tab({ label, icon, active = false, onClick }: TabProps) {
  return (
    <button
      onClick={onClick}
      className={`content-stretch flex gap-[8px] h-full items-center px-[12px] relative shrink-0 transition-colors border-r border-[#464646] ${
        active ? 'bg-[#f881a9]' : 'hover:bg-[rgba(255,255,255,0.05)]'
      }`}
    >
      <div className={`relative shrink-0 flex items-center justify-center ${active ? 'text-[#6f0025]' : 'text-white'}`}>
        {icon}
      </div>
      <p className={`font-['JetBrains_Mono',sans-serif] leading-[normal] not-italic relative shrink-0 text-[11px] font-bold uppercase tracking-tight whitespace-nowrap ${
        active ? 'text-[#6f0025]' : 'text-white'
      }`}>
        {label}
      </p>
    </button>
  );
}
