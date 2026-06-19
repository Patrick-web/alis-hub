import { Events } from '@wailsio/runtime';
import { ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function GitSyncLog() {
  const [lines, setLines] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const off = Events.On('git:scm:log', (ev: any) => {
      const line: string = typeof ev === 'string' ? ev : (ev?.data ?? String(ev));
      setLines(prev => {
        const next = [...prev, line];
        return next.length > 200 ? next.slice(-200) : next;
      });
      setOpen(true);
    });
    return () => { off(); };
  }, []);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, open]);

  if (lines.length === 0) return null;

  return (
    <div className="border-t border-white/10 shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-white/50 hover:text-white/80 transition-colors"
      >
        <Terminal size={11} />
        <span>Git Output</span>
        <div className="flex-1" />
        {open ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
      </button>

      {open && (
        <div className="max-h-[120px] overflow-y-auto bg-black/30 px-3 py-2 font-mono text-[11px] text-white/60">
          {lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all leading-snug">{line}</div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
