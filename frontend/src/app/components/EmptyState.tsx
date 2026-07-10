import { Icon } from '@iconify/react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-[10px] py-[60px] ${className ?? ''}`}>
      {icon && (
        <Icon icon={icon} className="text-5xl text-foreground/12" />
      )}
      <p className="text-[13px] text-foreground/30 font-mono">
        {title}
      </p>
      {description && (
        <p className="text-[11px] text-foreground/20 font-mono">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-[4px] px-[14px] py-[6px] text-[11px] font-bold uppercase font-mono text-brand border border-brand-fill/30 rounded-[4px] hover:bg-brand-fill/8 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
