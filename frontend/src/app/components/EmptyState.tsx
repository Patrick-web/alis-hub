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
        <Icon icon={icon} className="text-5xl text-[rgba(255,255,255,0.12)]" />
      )}
      <p className="text-[13px] text-[rgba(255,255,255,0.3)] font-['JetBrains_Mono',sans-serif]">
        {title}
      </p>
      {description && (
        <p className="text-[11px] text-[rgba(255,255,255,0.2)] font-['JetBrains_Mono',sans-serif]">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-[4px] px-[14px] py-[6px] text-[11px] font-bold uppercase font-['JetBrains_Mono',sans-serif] text-[#F881A9] border border-[rgba(248,129,169,0.3)] rounded-[4px] hover:bg-[rgba(248,129,169,0.08)] transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
