import { ReactNode } from "react";

interface CardProps {
  title: string;
  children: ReactNode;
  className?: string;
}

interface CardListItemProps {
  label: string;
  value: string;
  noBorder?: boolean;
}

export function Card({ title, children, className = "" }: CardProps) {
  return (
    <div
      className={`bg-card content-stretch flex flex-col items-start overflow-clip relative shrink-0 ${className}`}
    >
      <div className="relative shrink-0 w-full">
        <div
          aria-hidden="true"
          className="absolute border-border border-b border-solid inset-0 pointer-events-none"
        />
        <div className="flex flex-row items-center justify-center size-full">
          <div className="content-stretch flex items-center justify-center px-[10px] py-[15px] relative w-full">
            <div className="flex flex-col font-['Fira_Code',sans-serif] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[16px] text-foreground uppercase whitespace-nowrap">
              <p className="leading-[normal]">{title}</p>
            </div>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

export function CardListItem({ label, value, noBorder = false }: CardListItemProps) {
  return (
    <div className="relative shrink-0 w-full">
      {!noBorder && (
        <div
          aria-hidden="true"
          className="absolute border-border border-b border-solid inset-0 pointer-events-none"
        />
      )}
      <div className="content-stretch flex flex-col font-['Fira_Code',sans-serif] gap-[3px] items-start leading-[0] not-italic p-[10px] relative w-full">
        <div className="flex flex-col justify-center relative shrink-0 text-[12px] text-foreground w-full">
          <p className="leading-[normal]">{label}</p>
        </div>
        <div className="flex flex-col justify-center relative shrink-0 text-[11px] text-foreground/80 w-full">
          <p className="leading-[normal]">{value}</p>
        </div>
      </div>
    </div>
  );
}
