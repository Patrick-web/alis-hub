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
      <AlertDialogContent className="bg-[#2c2c2c] border border-[#464646] text-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white font-['JetBrains_Mono',sans-serif] text-[14px]">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[rgba(255,255,255,0.5)] font-['JetBrains_Mono',sans-serif] text-[12px]">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {requireText && (
          <div className="flex flex-col gap-[6px]">
            <p className="font-['JetBrains_Mono',sans-serif] text-[10px] text-[rgba(255,255,255,0.4)]">
              Type <span className="text-white">{requireText}</span> to confirm
            </p>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmed && !loading && onConfirm()}
              disabled={loading}
              autoFocus
              className="w-full bg-[#1e1e1e] border border-[#464646] rounded-[4px] px-[12px] py-[7px] text-white font-['JetBrains_Mono',sans-serif] text-[12px] focus:outline-none focus:border-[#ff5050] disabled:opacity-50 placeholder-[rgba(255,255,255,0.2)]"
              placeholder={requireText}
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel
            className="bg-transparent border border-[#464646] text-white hover:bg-[rgba(255,255,255,0.05)] font-['JetBrains_Mono',sans-serif] text-[11px] uppercase font-bold"
            disabled={loading}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-[#ff5050] hover:bg-[#ff3333] text-white border-0 font-['JetBrains_Mono',sans-serif] text-[11px] uppercase font-bold disabled:opacity-40 disabled:pointer-events-none"
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
