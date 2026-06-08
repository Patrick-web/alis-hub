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
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
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
        <AlertDialogFooter>
          <AlertDialogCancel
            className="bg-transparent border border-[#464646] text-white hover:bg-[rgba(255,255,255,0.05)] font-['JetBrains_Mono',sans-serif] text-[11px] uppercase font-bold"
            disabled={loading}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-[#ff5050] hover:bg-[#ff3333] text-white border-0 font-['JetBrains_Mono',sans-serif] text-[11px] uppercase font-bold"
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
            disabled={loading}
          >
            {loading ? 'Deleting…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
