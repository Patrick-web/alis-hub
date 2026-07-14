import { useRef, useState, useLayoutEffect } from "react";
import { cn } from "./utils";

interface MarqueeLabelProps {
  text: string;
  maxWidth: number;
  className?: string;
  onDoubleClick?: (e: React.MouseEvent) => void;
}

export function MarqueeLabel({
  text,
  maxWidth,
  className,
  onDoubleClick,
}: MarqueeLabelProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  const [hovered, setHovered] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const inner = textRef.current;
    if (!container || !inner) return;
    setOverflow(Math.max(0, inner.scrollWidth - container.clientWidth));
  }, [text, maxWidth]);

  const animating = hovered && overflow > 0;
  const durationMs = Math.max(1200, overflow * 24);

  return (
    <span
      ref={containerRef}
      className={cn("overflow-hidden whitespace-nowrap min-w-0", className)}
      style={{ maxWidth }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={onDoubleClick}
    >
      <span
        ref={textRef}
        className="inline-block whitespace-nowrap will-change-transform"
        style={
          animating
            ? {
                animation: `marquee-scroll ${durationMs}ms linear infinite alternate`,
                ["--marquee-distance" as string]: `-${overflow}px`,
              }
            : undefined
        }
      >
        {text}
      </span>
    </span>
  );
}
