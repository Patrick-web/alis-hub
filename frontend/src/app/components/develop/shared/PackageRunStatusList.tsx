import { Icon } from '@iconify/react';
import type { TerminalSession } from '../../PackageTerminalPane';

/** Status list of running package script sessions. */
export function PackageRunStatusList({ sessions, footerText }: { sessions: TerminalSession[]; footerText?: string }) {
  return (
    <div className="flex-1 overflow-y-auto px-[16px] py-[16px]">
      <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono mb-[12px]">
        Running · {sessions.filter(s => !s.done).length} active
      </p>
      <div className="flex flex-col gap-[6px] mb-[16px]">
        {sessions.map(s => (
          <div key={s.runID} className="flex items-center gap-[8px] px-[10px] py-[8px] bg-background border border-border rounded-[6px]">
            {s.error ? (
              <Icon icon="solar:close-circle-bold" className="text-red-400 text-sm shrink-0" />
            ) : s.done ? (
              <Icon icon="solar:check-circle-bold" className="text-green-400 text-sm shrink-0" />
            ) : (
              <span className="w-[8px] h-[8px] rounded-full bg-brand-fill animate-pulse shrink-0" />
            )}
            <span className="text-[10px] text-foreground font-mono flex-1 truncate min-w-0">{s.title}</span>
            <span className="text-[9px] text-foreground/30 shrink-0 uppercase">{s.lang}</span>
          </div>
        ))}
      </div>
      {footerText && <p className="text-[9px] text-foreground/30 text-center">{footerText}</p>}
    </div>
  );
}
