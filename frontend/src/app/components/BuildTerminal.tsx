import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface BuildTerminalHandle {
  write: (text: string) => void;
  clear: () => void;
}

interface BuildTerminalProps {
  className?: string;
  onInput?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

export const BuildTerminal = forwardRef<BuildTerminalHandle, BuildTerminalProps>(
  ({ className, onInput, onResize }, ref) => {
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
        cursorBlink: true,
        disableStdin: !onInput,
        scrollback: 10000,
        convertEol: true,
      });

      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      requestAnimationFrame(() => fit.fit());

      termRef.current = term;
      fitRef.current = fit;

      if (onInput) {
        term.onData(onInput);
      }

      const observer = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          fitRef.current?.fit();
          if (onResize && termRef.current) {
            onResize(termRef.current.cols, termRef.current.rows);
          }
        });
      });
      observer.observe(containerRef.current);

      if (onResize) {
        term.onResize(({ cols, rows }) => onResize(cols, rows));
      }

      return () => {
        observer.disconnect();
        term.dispose();
        termRef.current = null;
        fitRef.current = null;
      };
    // onInput and onResize are callbacks — intentionally excluded to avoid
    // re-mounting the terminal on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
      write: (text: string) => termRef.current?.write(text),
      clear: () => termRef.current?.clear(),
    }));

    return <div ref={containerRef} className={className} style={{ overflow: 'hidden' }} />;
  }
);

BuildTerminal.displayName = 'BuildTerminal';
