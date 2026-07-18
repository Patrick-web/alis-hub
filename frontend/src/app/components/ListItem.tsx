import { ReactNode } from "react";
import { Icon } from "@iconify/react";

interface ListItemProps {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
}

export function ListItem({ label, icon, onClick }: ListItemProps) {
  return (
    <button
      onClick={onClick}
      className="relative shrink-0 w-full hover:bg-foreground/5 transition-colors"
    >
      <div
        aria-hidden="true"
        className="absolute border-border border-b border-solid inset-0 pointer-events-none"
      />
      <div className="flex flex-row items-center justify-between size-full">
        <div className="content-stretch flex gap-[10px] items-center p-[10px] relative">
          <div className="relative shrink-0 size-[15px] flex items-center justify-center">
            {icon}
          </div>
          <div className="flex flex-col font-['Fira_Code',sans-serif] justify-center leading-[0] not-italic relative shrink-0 text-[11px] text-foreground whitespace-nowrap">
            <p className="leading-[normal]">{label}</p>
          </div>
        </div>
        <div className="pr-[10px]">
          <Icon icon="solar:alt-arrow-right-linear" className="text-foreground text-sm" />
        </div>
      </div>
    </button>
  );
}
