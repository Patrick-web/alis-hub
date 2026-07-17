import { ReactNode, useState, forwardRef } from 'react';
import { Icon } from '@iconify/react';

interface SidebarNavItemProps {
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export const SidebarNavItem = forwardRef<HTMLButtonElement, SidebarNavItemProps>(
  function SidebarNavItem(
    { label, icon, active = false, onClick, onEdit, onDelete, tabIndex, onKeyDown },
    ref,
  ) {
    const [hovered, setHovered] = useState(false);
    const hasActions = Boolean(onEdit || onDelete);

    return (
      <button
        ref={ref}
        tabIndex={tabIndex}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`relative shrink-0 w-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card ${
          active ? 'bg-brand-fill/12' : 'hover:bg-foreground/5'
        }`}
      >
        <div
          className={`absolute ${
            active
              ? 'border-brand-fill border-b border-solid border-t'
              : 'border-border border-solid border-t'
          } inset-0 pointer-events-none`}
          aria-hidden="true"
        />
        <div className="flex flex-row items-center size-full">
          <div className="content-stretch flex gap-[10px] items-center p-[10px] relative w-full">
            <div className="relative shrink-0 size-[20px]">{icon}</div>
            <p className={`font-mono leading-[normal] not-italic relative shrink-0 text-[12px] whitespace-nowrap flex-1 text-left ${
              active ? 'text-brand' : 'text-foreground'
            }`}>
              {label}
            </p>
            {hasActions && hovered && (
              <div className="flex items-center gap-[4px]" onClick={(e) => e.stopPropagation()}>
                {onEdit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                    className="p-[3px] rounded hover:bg-foreground/10 text-foreground/50 hover:text-foreground transition-colors"
                  >
                    <Icon icon="solar:pen-linear" className="text-[14px]" />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-[3px] rounded hover:bg-[rgba(255,80,80,0.15)] text-foreground/50 hover:text-destructive transition-colors"
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
  },
);
