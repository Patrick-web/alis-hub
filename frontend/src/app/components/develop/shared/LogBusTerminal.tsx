import { useEffect, useRef } from 'react';
import { BuildTerminal, type BuildTerminalHandle } from '../../BuildTerminal';
import type { LogBus } from '../../../lib/logBus';

/**
 * A read-only terminal bound to a LogBus. Multiple instances can mirror the
 * same bus (e.g. the Develop pane and the command palette), while producers
 * write chunks imperatively without going through React state.
 */
export function LogBusTerminal({ bus, className }: { bus: LogBus; className?: string }) {
  const termRef = useRef<BuildTerminalHandle>(null);
  const writtenRef = useRef(0);

  useEffect(() => {
    writtenRef.current = 0;
    const writeFrom = (chunks: string[]) => {
      while (writtenRef.current < chunks.length) {
        termRef.current?.write(chunks[writtenRef.current]);
        writtenRef.current++;
      }
    };
    termRef.current?.clear();
    writeFrom(bus.getSnapshot());
    return bus.subscribe(writeFrom);
  }, [bus]);

  return <BuildTerminal ref={termRef} className={className} />;
}
