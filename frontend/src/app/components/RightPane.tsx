import { type ReactNode } from "react";
import { Icon } from "@iconify/react";

interface RightPaneProps {
  label: string;
  title?: string;
  onClose?: () => void;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  width?: string;
}

export function RightPane({
  label,
  title,
  onClose,
  actions,
  footer,
  children,
  width = "w-[380px]",
}: RightPaneProps) {
  return (
    <div
      className={`${width} border-l border-border flex flex-col overflow-hidden shrink-0`}
    >
      {/* Header */}
      <div className="px-[16px] py-[12px] border-b border-border flex items-center justify-between shrink-0">
        {title ? (
          <div>
            <p className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase font-bold font-mono">
              {label}
            </p>
            <p className="text-[13px] font-bold text-white font-mono">
              {title}
            </p>
          </div>
        ) : (
          <p className="font-mono font-bold text-[11px] text-white uppercase opacity-70">
            {label}
          </p>
        )}
        <div className="flex items-center gap-[15px]">
          {actions}
          {onClose && (
            <button
              onClick={onClose}
              className="w-[24px] h-[24px] flex items-center justify-center rounded-[3px] text-[rgba(255,255,255,0.4)] hover:text-white hover:bg-accent transition-colors"
            >
              <Icon icon="solar:close-circle-linear" className="text-sm" />
            </button>
          )}
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {children}
      </div>
      {/* Footer */}
      {footer && (
        <div className="shrink-0 border-t border-border px-[16px] py-[12px]">
          {footer}
        </div>
      )}
    </div>
  );
}
