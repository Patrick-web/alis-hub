import { ReactNode } from 'react';

interface SidebarNavItemProps {
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick?: () => void;
}

export function SidebarNavItem({ label, icon, active = false, onClick }: SidebarNavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`relative shrink-0 w-full transition-colors ${
        active ? 'bg-[rgba(248,129,169,0.12)]' : 'hover:bg-[rgba(255,255,255,0.05)]'
      }`}
    >
      <div 
        className={`absolute ${
          active 
            ? 'border-[#f881a9] border-b border-solid border-t' 
            : 'border-[#464646] border-solid border-t'
        } inset-0 pointer-events-none`}
        aria-hidden="true"
      />
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[10px] items-center p-[10px] relative w-full">
          <div className="relative shrink-0 size-[20px]">{icon}</div>
          <p className={`font-['JetBrains_Mono',sans-serif] leading-[normal] not-italic relative shrink-0 text-[12px] whitespace-nowrap ${
            active ? 'text-[#f881a9]' : 'text-white'
          }`}>
            {label}
          </p>
        </div>
      </div>
    </button>
  );
}
