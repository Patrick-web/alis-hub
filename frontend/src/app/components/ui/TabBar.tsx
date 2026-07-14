import { useState, type ReactNode } from "react";
import { Icon } from "@iconify/react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./context-menu";
import { cn } from "./utils";
import { MarqueeLabel } from "./MarqueeLabel";

export interface TabBarItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  statusSlot?: ReactNode;
  closeable?: boolean;
}

interface TabBarProps {
  items: TabBarItem[];
  activeId: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onCloseMultiple?: (ids: string[]) => void;
  onReorder?: (fromId: string, toId: string) => void;
  onDoubleClick?: (id: string) => void;
  variant?: "filled" | "underline";
  size?: "sm" | "md";
  className?: string;
  children?: ReactNode;
}

export function TabBar({
  items,
  activeId,
  onActivate,
  onClose,
  onCloseMultiple,
  onReorder,
  onDoubleClick,
  variant = "filled",
  size = "md",
  className,
  children,
}: TabBarProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function bulk(ids: string[]) {
    if (onCloseMultiple) onCloseMultiple(ids);
    else ids.forEach((id) => onClose(id));
  }

  const closeableIds = items
    .filter((t) => t.closeable !== false)
    .map((t) => t.id);

  const containerClass = cn(
    "shrink-0 overflow-x-auto",
    variant === "filled"
      ? cn(
          "flex items-center gap-[2px] px-[8px] border-b border-border",
          size === "sm" ? "h-[30px]" : "h-[36px]",
        )
      : "flex items-stretch border-b border-border bg-muted",
    className,
  );

  return (
    <div className={containerClass}>
      {items.map((item, index) => {
        const isActive = item.id === activeId;
        const isDragging = draggedId === item.id;
        const isDragOver = dragOverId === item.id && draggedId !== item.id;
        const closeable = item.closeable !== false;

        const closeableLeft = items
          .slice(0, index)
          .filter((t) => t.closeable !== false)
          .map((t) => t.id);
        const closeableRight = items
          .slice(index + 1)
          .filter((t) => t.closeable !== false)
          .map((t) => t.id);
        const closeableOthers = closeableIds.filter((id) => id !== item.id);

        const tabClass = cn(
          "flex items-center shrink-0 cursor-pointer transition-colors select-none group/tab font-mono text-[10px]",
          variant === "filled"
            ? cn(
                size === "sm"
                  ? "gap-[5px] px-[8px] h-[22px] rounded-[3px]"
                  : "gap-[6px] px-[8px] h-[26px] rounded-[4px]",
                isActive
                  ? "bg-card border border-border text-foreground"
                  : "text-foreground/40 hover:text-foreground/70 hover:bg-accent/30",
              )
            : cn(
                "gap-[6px] pl-[10px] pr-[4px] border-r border-border min-h-[36px]",
                isActive
                  ? "text-foreground bg-background shadow-[inset_0_-2px_0_#f881a9]"
                  : "text-foreground/40 hover:text-foreground hover:bg-foreground/[3%]",
                isDragging && "opacity-40",
                isDragOver && "border-l-2 border-l-brand",
              ),
        );

        return (
          <ContextMenu key={item.id}>
            <ContextMenuTrigger asChild>
              <div
                role="tab"
                aria-selected={isActive}
                tabIndex={0}
                onClick={() => onActivate(item.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onActivate(item.id);
                }}
                onDoubleClick={
                  onDoubleClick
                    ? () => onDoubleClick(item.id)
                    : undefined
                }
                draggable={!!onReorder}
                onDragStart={
                  onReorder ? () => setDraggedId(item.id) : undefined
                }
                onDragEnd={
                  onReorder
                    ? () => {
                        setDraggedId(null);
                        setDragOverId(null);
                      }
                    : undefined
                }
                onDragOver={
                  onReorder
                    ? (e) => {
                        e.preventDefault();
                        setDragOverId(item.id);
                      }
                    : undefined
                }
                onDragLeave={
                  onReorder ? () => setDragOverId(null) : undefined
                }
                onDrop={
                  onReorder
                    ? (e) => {
                        e.preventDefault();
                        if (draggedId && draggedId !== item.id)
                          onReorder(draggedId, item.id);
                        setDraggedId(null);
                        setDragOverId(null);
                      }
                    : undefined
                }
                className={tabClass}
              >
                {item.icon && (
                  <span className="shrink-0 flex items-center">
                    {item.icon}
                  </span>
                )}
                {typeof item.label === "string" ? (
                  <MarqueeLabel
                    text={item.label}
                    maxWidth={variant === "underline" ? 110 : 160}
                  />
                ) : (
                  item.label
                )}
                {item.statusSlot && (
                  <span className="shrink-0 flex items-center">
                    {item.statusSlot}
                  </span>
                )}
                {closeable ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose(item.id);
                    }}
                    className={cn(
                      "shrink-0 flex items-center justify-center opacity-0 group-hover/tab:opacity-100 transition-all",
                      variant === "filled"
                        ? "size-[14px] rounded-[2px] text-foreground/25 hover:text-foreground hover:bg-accent"
                        : "ml-[2px] p-[3px] rounded text-foreground/40 hover:text-brand hover:bg-brand-fill/10",
                    )}
                  >
                    <Icon
                      icon="solar:close-circle-linear"
                      className={
                        variant === "filled" ? "text-[10px]" : "text-[9px]"
                      }
                    />
                  </button>
                ) : (
                  variant === "underline" && (
                    <span className="ml-[2px] w-[15px] shrink-0" />
                  )
                )}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="min-w-[160px]">
              <ContextMenuItem
                disabled={!closeable}
                onClick={() => onClose(item.id)}
              >
                Close
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                disabled={closeableOthers.length === 0}
                onClick={() => bulk(closeableOthers)}
              >
                Close Others
              </ContextMenuItem>
              <ContextMenuItem
                disabled={closeableLeft.length === 0}
                onClick={() => bulk(closeableLeft)}
              >
                Close to the Left
              </ContextMenuItem>
              <ContextMenuItem
                disabled={closeableRight.length === 0}
                onClick={() => bulk(closeableRight)}
              >
                Close to the Right
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                disabled={closeableIds.length === 0}
                onClick={() => bulk(closeableIds)}
              >
                Close All
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
      {children}
    </div>
  );
}
