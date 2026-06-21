import { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from './ui/alert-dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  requireText?: string;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  loading = false,
  onConfirm,
  requireText,
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (open) setInputValue('');
  }, [open]);

  const confirmed = !requireText || inputValue === requireText;

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o && !loading) onOpenChange(false); }}>
      <AlertDialogContent className="bg-card border border-border text-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white font-mono text-[14px]">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[rgba(255,255,255,0.5)] font-mono text-[12px]">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {requireText && (
          <div className="flex flex-col gap-[6px]">
            <p className="font-mono text-[10px] text-[rgba(255,255,255,0.4)]">
              Type <span className="text-white">{requireText}</span> to confirm
            </p>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmed && !loading && onConfirm()}
              disabled={loading}
              autoFocus
              className="w-full bg-background border border-border rounded-[4px] px-[12px] py-[7px] text-white font-mono text-[12px] focus:outline-none focus:border-destructive disabled:opacity-50 placeholder-[rgba(255,255,255,0.2)]"
              placeholder={requireText}
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel
            className="bg-transparent border border-border text-white hover:bg-[rgba(255,255,255,0.05)] font-mono text-[11px] uppercase font-bold"
            disabled={loading}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive text-white border-0 font-mono text-[11px] uppercase font-bold disabled:opacity-40 disabled:pointer-events-none"
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
            disabled={loading || !confirmed}
          >
            {loading ? 'Deleting…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
