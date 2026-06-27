import { Events } from '@wailsio/runtime';
import { ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  repoPath: string;
}

export function GitSyncLog({ repoPath }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLines([]);
    setOpen(false);
  }, [repoPath]);

  useEffect(() => {
    const off = Events.On('git:scm:log', (ev: any) => {
      const payload = typeof ev === 'string' ? { repoPath: '', line: ev } : (ev?.data ?? ev);
      const evRepoPath: string = payload?.repoPath ?? '';
      const line: string = payload?.line ?? String(ev);
      if (evRepoPath && evRepoPath !== repoPath) return;
      setLines(prev => {
        const next = [...prev, line];
        return next.length > 200 ? next.slice(-200) : next;
      });
      setOpen(true);
    });
    return () => { off(); };
  }, [repoPath]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, open]);

  if (lines.length === 0) return null;

  return (
    <div className="border-t border-foreground/10 shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-foreground/50 hover:text-foreground/80 transition-colors"
      >
        <Terminal size={11} />
        <span>Git Output</span>
        <div className="flex-1" />
        {open ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
      </button>

      {open && (
        <div className="max-h-[120px] overflow-y-auto bg-black/30 px-3 py-2 font-mono text-[11px] text-foreground/60">
          {lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all leading-snug">{line}</div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
