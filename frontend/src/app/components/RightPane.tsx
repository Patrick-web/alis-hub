import { type ReactNode, useState, useRef, useCallback, useEffect } from "react";
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

function parseWidthPx(widthClass: string): number {
  const m = widthClass.match(/w-\[(\d+)px\]/);
  return m ? parseInt(m[1], 10) : 380;
}

const MIN_WIDTH = 280;
const MAX_WIDTH = 1200;

export function RightPane({
  label,
  title,
  onClose,
  actions,
  footer,
  children,
  width = "w-[380px]",
}: RightPaneProps) {
  const defaultWidth = parseWidthPx(width);
  const [paneWidth, setPaneWidth] = useState(defaultWidth);
  const [expanded, setExpanded] = useState(false);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = paneWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [paneWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startX.current - e.clientX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
      setPaneWidth(next);
      if (expanded) setExpanded(false);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [expanded]);

  const toggleExpand = () => {
    if (expanded) {
      setPaneWidth(defaultWidth);
      setExpanded(false);
    } else {
      setPaneWidth(Math.min(MAX_WIDTH, window.innerWidth * 0.65));
      setExpanded(true);
    }
  };

  return (
    <div
      className="border-l border-border flex flex-col overflow-hidden shrink-0 relative"
      style={{ width: paneWidth }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute left-0 top-0 bottom-0 w-[4px] cursor-col-resize z-10 group"
      >
        <div className="absolute inset-y-0 left-0 w-[1px] bg-border group-hover:bg-brand/50 transition-colors" />
      </div>

      {/* Header */}
      <div className="px-[16px] py-[12px] border-b border-border flex items-center justify-between shrink-0">
        {title ? (
          <div className="min-w-0 flex-1 mr-[8px]">
            <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono">
              {label}
            </p>
            <p className="text-[13px] font-bold text-foreground font-mono truncate">
              {title}
            </p>
          </div>
        ) : (
          <p className="font-mono font-bold text-[11px] text-foreground uppercase opacity-70 flex-1 mr-[8px]">
            {label}
          </p>
        )}
        <div className="flex items-center gap-[8px] shrink-0">
          {actions}
          <button
            onClick={toggleExpand}
            title={expanded ? "Collapse pane" : "Expand pane"}
            className="w-[24px] h-[24px] flex items-center justify-center rounded-[3px] text-foreground/40 hover:text-foreground hover:bg-accent transition-colors"
          >
            <Icon
              icon={expanded ? "solar:minimize-square-linear" : "solar:maximize-square-linear"}
              className="text-sm"
            />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="w-[24px] h-[24px] flex items-center justify-center rounded-[3px] text-foreground/40 hover:text-foreground hover:bg-accent transition-colors"
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
