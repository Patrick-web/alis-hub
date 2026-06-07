import { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { Icon } from '@iconify/react';
import { BuildTerminal, type BuildTerminalHandle } from './BuildTerminal';

export interface TerminalSession {
  runID: string;
  title: string;
  lang: string;
  done: boolean;
  error?: string;
}

export interface PackageTerminalPaneHandle {
  write: (runID: string, text: string) => void;
  clear: (runID: string) => void;
}

interface Props {
  sessions: TerminalSession[];
  onCloseSession: (runID: string) => void;
  onClose: () => void;
  onInput: (runID: string, data: string) => void;
  onResize: (runID: string, cols: number, rows: number) => void;
}

export const PackageTerminalPane = forwardRef<PackageTerminalPaneHandle, Props>(
  ({ sessions, onCloseSession, onClose, onInput, onResize }, ref) => {
    const [activeID, setActiveID] = useState<string>(() => sessions[0]?.runID ?? '');
    const termRefs = useRef<Map<string, BuildTerminalHandle>>(new Map());

    const effectiveActive = sessions.find(s => s.runID === activeID)
      ? activeID
      : (sessions[0]?.runID ?? '');

    useImperativeHandle(ref, () => ({
      write: (runID, text) => termRefs.current.get(runID)?.write(text),
      clear: (runID) => termRefs.current.get(runID)?.clear(),
    }));

    const statusIcon = (s: TerminalSession) => {
      if (s.error) return <Icon icon="solar:close-circle-bold" className="text-[10px] text-red-400" />;
      if (s.done) return <Icon icon="solar:check-circle-bold" className="text-[10px] text-green-400" />;
      return <span className="inline-block w-[7px] h-[7px] rounded-full bg-[#f881a9] animate-pulse" />;
    };

    return (
      <div className="flex flex-col h-full bg-[#141414] border-t border-[#464646]">
        {/* Pane header */}
        <div className="flex items-center justify-between px-[12px] border-b border-[#464646] shrink-0 h-[30px]">
          <p className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase font-bold font-['JetBrains_Mono',sans-serif]">
            Packages • {sessions.length} process{sessions.length !== 1 ? 'es' : ''}
          </p>
          <button
            onClick={onClose}
            className="w-[20px] h-[20px] flex items-center justify-center rounded-[3px] text-[rgba(255,255,255,0.3)] hover:text-white hover:bg-[#3c3c3c] transition-colors"
          >
            <Icon icon="solar:close-linear" className="text-xs" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-[2px] px-[8px] border-b border-[#464646] shrink-0 h-[30px] overflow-x-auto">
          {sessions.map(s => (
            <button
              key={s.runID}
              onClick={() => setActiveID(s.runID)}
              className={`flex items-center gap-[5px] px-[8px] h-[22px] rounded-[3px] text-[10px] font-['JetBrains_Mono',sans-serif] shrink-0 transition-colors ${
                effectiveActive === s.runID
                  ? 'bg-[#2c2c2c] text-white'
                  : 'text-[rgba(255,255,255,0.5)] hover:text-white hover:bg-[#252525]'
              }`}
            >
              {statusIcon(s)}
              <span className="max-w-[160px] truncate">{s.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onCloseSession(s.runID); }}
                className="ml-[2px] text-[rgba(255,255,255,0.3)] hover:text-white transition-colors"
              >
                <Icon icon="solar:close-linear" className="text-[9px]" />
              </button>
            </button>
          ))}
        </div>

        {/* Terminals — all mounted, only active is visible */}
        <div className="flex-1 min-h-0 relative">
          {sessions.map(s => (
            <div
              key={s.runID}
              className="absolute inset-0"
              style={{ display: effectiveActive === s.runID ? 'block' : 'none' }}
            >
              <BuildTerminal
                className="w-full h-full"
                ref={(handle) => {
                  if (handle) termRefs.current.set(s.runID, handle);
                  else termRefs.current.delete(s.runID);
                }}
                onInput={s.done ? undefined : (data) => onInput(s.runID, data)}
                onResize={(cols, rows) => onResize(s.runID, cols, rows)}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }
);

PackageTerminalPane.displayName = 'PackageTerminalPane';
