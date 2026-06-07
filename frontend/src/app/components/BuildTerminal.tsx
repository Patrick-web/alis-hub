import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface BuildTerminalHandle {
  write: (text: string) => void;
  clear: () => void;
}

export const BuildTerminal = forwardRef<BuildTerminalHandle, { className?: string }>(
  ({ className }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);

    useEffect(() => {
      if (!containerRef.current) return;

      const term = new Terminal({
        theme: {
          background: '#141414',
          foreground: '#d4d4d4',
          cursor: '#f881a9',
          selectionBackground: 'rgba(248,129,169,0.25)',
          black: '#1a1a1a',
          brightBlack: '#555',
        },
        fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
        fontSize: 11,
        lineHeight: 1.4,
        cursorBlink: false,
        disableStdin: true,
        scrollback: 10000,
        convertEol: true,
      });

      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      requestAnimationFrame(() => fit.fit());

      termRef.current = term;
      fitRef.current = fit;

      const observer = new ResizeObserver(() => {
        requestAnimationFrame(() => fitRef.current?.fit());
      });
      observer.observe(containerRef.current);

      return () => {
        observer.disconnect();
        term.dispose();
        termRef.current = null;
        fitRef.current = null;
      };
    }, []);

    useImperativeHandle(ref, () => ({
      write: (text: string) => termRef.current?.write(text),
      clear: () => termRef.current?.clear(),
    }));

    return <div ref={containerRef} className={className} style={{ overflow: 'hidden' }} />;
  }
);

BuildTerminal.displayName = 'BuildTerminal';
