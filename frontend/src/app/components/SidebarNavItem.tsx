import { ReactNode, useState } from 'react';
import { Icon } from '@iconify/react';

interface SidebarNavItemProps {
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function SidebarNavItem({ label, icon, active = false, onClick, onEdit, onDelete }: SidebarNavItemProps) {
  const [hovered, setHovered] = useState(false);
  const hasActions = Boolean(onEdit || onDelete);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
          <p className={`font-['JetBrains_Mono',sans-serif] leading-[normal] not-italic relative shrink-0 text-[12px] whitespace-nowrap flex-1 text-left ${
            active ? 'text-[#f881a9]' : 'text-white'
          }`}>
            {label}
          </p>
          {hasActions && hovered && (
            <div className="flex items-center gap-[4px]" onClick={(e) => e.stopPropagation()}>
              {onEdit && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                  className="p-[3px] rounded hover:bg-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.5)] hover:text-white transition-colors"
                >
                  <Icon icon="solar:pen-linear" className="text-[14px]" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="p-[3px] rounded hover:bg-[rgba(255,80,80,0.15)] text-[rgba(255,255,255,0.5)] hover:text-[#ff5050] transition-colors"
                >
                  <Icon icon="solar:trash-bin-trash-linear" className="text-[14px]" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
