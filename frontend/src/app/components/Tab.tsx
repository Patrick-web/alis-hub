import { ReactNode, forwardRef } from "react";

interface TabProps {
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick?: () => void;
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export const Tab = forwardRef<HTMLButtonElement, TabProps>(function Tab(
  { label, icon, active = false, onClick, tabIndex, onKeyDown },
  ref,
) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      className={`content-stretch flex gap-[8px] h-full items-center px-[12px] relative shrink-0 transition-colors border-r border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
        active ? "bg-brand-fill" : "hover:bg-foreground/5"
      }`}
    >
      <div
        className={`relative shrink-0 flex items-center justify-center ${active ? "text-brand-foreground" : "text-foreground"}`}
      >
        {icon}
      </div>
      <p
        className={`font-mono leading-[normal] not-italic relative shrink-0 text-[11px] font-bold uppercase tracking-tight whitespace-nowrap ${
          active ? "text-brand-foreground" : "text-foreground"
        }`}
      >
        {label}
      </p>
    </button>
  );
});
