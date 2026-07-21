import { ReactNode } from "react";

interface StageCardProps {
  step?: number;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function StageCard({
  step,
  title,
  subtitle,
  icon,
  children,
  action,
  className = "",
}: StageCardProps) {
  return (
    <div className={`bg-card border border-border rounded-[4px] ${className}`}>
      <div className="flex items-start justify-between p-[16px] border-b border-border">
        <div className="flex items-center gap-[12px]">
          {step && (
            <div className="size-[24px] rounded-full bg-brand-fill/15 border border-brand-fill flex items-center justify-center shrink-0">
              <span className="text-[11px] font-bold text-brand font-mono">{step}</span>
            </div>
          )}
          {icon && <div className="text-foreground shrink-0">{icon}</div>}
          <div>
            <h3 className="font-mono font-bold text-[12px] text-foreground uppercase">{title}</h3>
            {subtitle && <p className="text-[10px] text-foreground/50 mt-[2px]">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="shrink-0 ml-[12px]">{action}</div>}
      </div>
      <div className="p-[16px]">{children}</div>
    </div>
  );
}
