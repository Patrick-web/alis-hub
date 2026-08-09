import { useEffect, useRef } from "react";
import { BuildTerminal, type BuildTerminalHandle } from "../../BuildTerminal";
import type { LogBus } from "../../../lib/logBus";

/**
 * A read-only terminal bound to a LogBus. Multiple instances can mirror the
 * same bus (e.g. the Develop pane and the command palette), while producers
 * write chunks imperatively without going through React state.
 */
export function LogBusTerminal({ bus, className }: { bus: LogBus; className?: string }) {
  const termRef = useRef<BuildTerminalHandle>(null);
  const writtenRef = useRef(0);

  useEffect(() => {
    // Counted over the whole stream rather than the current array: the bus
    // trims old chunks off the front, which shifts every array index.
    writtenRef.current = 0;
    const writeFrom = (chunks: string[], replaced = false) => {
      // A replace discards what the terminal is showing, so start over rather
      // than appending the resent log underneath the stale copy.
      if (replaced) {
        termRef.current?.clear();
        writtenRef.current = 0;
      }
      const dropped = bus.dropped;
      let i = Math.max(writtenRef.current - dropped, 0);
      for (; i < chunks.length; i++) {
        termRef.current?.write(chunks[i]);
      }
      writtenRef.current = dropped + chunks.length;
    };
    termRef.current?.clear();
    writeFrom(bus.getSnapshot());
    return bus.subscribe(writeFrom);
  }, [bus]);

  return <BuildTerminal ref={termRef} className={className} />;
}
