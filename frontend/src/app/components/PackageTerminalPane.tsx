import { useState, useRef, forwardRef, useImperativeHandle } from "react";
import { Icon } from "@iconify/react";
import { BuildTerminal, type BuildTerminalHandle } from "./BuildTerminal";
import { TabBar } from "./ui/TabBar";

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
    const [activeID, setActiveID] = useState<string>(
      () => sessions[0]?.runID ?? "",
    );
    const termRefs = useRef<Map<string, BuildTerminalHandle>>(new Map());

    const effectiveActive = sessions.find((s) => s.runID === activeID)
      ? activeID
      : (sessions[0]?.runID ?? "");

    useImperativeHandle(ref, () => ({
      write: (runID, text) => termRefs.current.get(runID)?.write(text),
      clear: (runID) => termRefs.current.get(runID)?.clear(),
    }));

    const statusIcon = (s: TerminalSession) => {
      if (s.error)
        return (
          <Icon
            icon="solar:close-circle-bold"
            className="text-[10px] text-red-400"
          />
        );
      if (s.done)
        return (
          <Icon
            icon="solar:check-circle-bold"
            className="text-[10px] text-green-400"
          />
        );
      return (
        <span className="inline-block w-[7px] h-[7px] rounded-full bg-brand-fill animate-pulse" />
      );
    };

    return (
      <div className="flex flex-col h-full bg-background border-t border-border">
        {/* Pane header */}
        <div className="flex items-center justify-between px-[12px] border-b border-border shrink-0 h-[30px]">
          <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono">
            Packages • {sessions.length} process
            {sessions.length !== 1 ? "es" : ""}
          </p>
          <button
            onClick={onClose}
            className="w-[20px] h-[20px] flex items-center justify-center rounded-[3px] text-foreground/30 hover:text-foreground hover:bg-accent transition-colors"
          >
            <Icon icon="solar:close-circle-linear" className="text-xs" />
          </button>
        </div>

        {/* Tab bar */}
        <TabBar
          items={sessions.map((s) => ({
            id: s.runID,
            label: s.title,
            statusSlot: statusIcon(s),
          }))}
          activeId={effectiveActive}
          onActivate={setActiveID}
          onClose={onCloseSession}
          onCloseMultiple={(ids) => ids.forEach((id) => onCloseSession(id))}
          variant="filled"
          size="sm"
        />

        {/* Terminals — all mounted, only active is visible */}
        <div className="flex-1 min-h-0 relative">
          {sessions.map((s) => (
            <div
              key={s.runID}
              className="absolute inset-0"
              style={{
                display: effectiveActive === s.runID ? "block" : "none",
              }}
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
  },
);

PackageTerminalPane.displayName = "PackageTerminalPane";
