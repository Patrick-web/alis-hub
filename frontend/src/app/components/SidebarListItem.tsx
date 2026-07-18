import { ReactNode, useState, forwardRef } from "react";

export interface SidebarListItemProps {
  label: string;
  icon?: ReactNode;
  active?: boolean;
  subtitle?: string;
  badge?: ReactNode;
  rightElement?: ReactNode;
  onClick?: () => void;
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  disabled?: boolean;
  indent?: boolean;
  className?: string;
}

export const SidebarListItem = forwardRef<HTMLButtonElement, SidebarListItemProps>(
  function SidebarListItem(
    {
      label,
      icon,
      active = false,
      subtitle,
      badge,
      rightElement,
      onClick,
      tabIndex,
      onKeyDown,
      disabled = false,
      indent = false,
      className = "",
    },
    ref,
  ) {
    const [hovered, setHovered] = useState(false);

    return (
      <button
        ref={ref}
        tabIndex={tabIndex}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        disabled={disabled}
        className={`relative shrink-0 w-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card disabled:opacity-40 disabled:cursor-not-allowed ${
          active ? "bg-brand-fill/12" : "hover:bg-foreground/5"
        } ${className}`}
      >
        <div
          className={`absolute ${
            active
              ? "border-brand-fill border-b border-solid border-t"
              : "border-border border-solid border-t"
          } inset-0 pointer-events-none`}
          aria-hidden="true"
        />
        <div className="flex flex-row items-center size-full">
          <div
            className={`content-stretch flex gap-[10px] items-start p-[10px] relative w-full ${indent ? "pl-[30px]" : ""}`}
          >
            {icon && (
              <div
                className={`relative shrink-0 size-[20px] ${
                  active ? "text-brand" : "text-foreground"
                }`}
              >
                {icon}
              </div>
            )}
            <div className=" min-w-0">
              <p
                className={`font-mono leading-[normal] not-italic relative text-[12px] whitespace-nowrap ${
                  active ? "text-brand" : "text-foreground"
                }`}
              >
                {label}
              </p>
              {subtitle && (
                <p className="text-[10px] text-foreground/35 font-mono mt-[2px] truncate">
                  {subtitle}
                </p>
              )}
            </div>
            {badge && !hovered && (
              <div className="shrink-0">{badge}</div>
            )}
            {rightElement && hovered && (
              <div
                className="flex items-center gap-[4px] shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                {rightElement}
              </div>
            )}
          </div>
        </div>
      </button>
    );
  },
);
