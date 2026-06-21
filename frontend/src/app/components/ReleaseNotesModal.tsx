import { useEffect, useState } from 'react';
import { marked } from 'marked';
import { Browser } from '@wailsio/runtime';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface ReleaseNotesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  releaseUrl: string;
}

export function ReleaseNotesModal({
  open,
  onOpenChange,
  currentVersion,
  latestVersion,
  releaseNotes,
  releaseUrl,
}: ReleaseNotesModalProps) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    const result = marked.parse(releaseNotes || '');
    if (result instanceof Promise) {
      result.then(setHtml);
    } else {
      setHtml(result);
    }
  }, [releaseNotes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="text-foreground max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-foreground font-mono text-[13px] font-bold">
            Release Notes
          </DialogTitle>
          <p className="text-foreground/50 font-mono text-[11px]">
            v{currentVersion} → v{latestVersion}
          </p>
        </DialogHeader>
        <div
          className="flex-1 overflow-y-auto prose prose-invert prose-sm max-w-none font-mono text-[12px] text-foreground/80 [&_h1]:text-[14px] [&_h2]:text-[13px] [&_h3]:text-[12px] [&_code]:bg-background [&_code]:px-1 [&_code]:rounded [&_ul]:pl-4 [&_li]:my-0.5 [&_img]:w-full [&_img]:rounded-lg [&_img]:mb-4"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <div className="pt-3 border-t border-border">
          <button
            onClick={() => Browser.OpenURL(releaseUrl)}
            className="text-[11px] font-mono text-foreground/50 hover:text-foreground transition-colors uppercase tracking-wide"
          >
            Open on GitHub →
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
