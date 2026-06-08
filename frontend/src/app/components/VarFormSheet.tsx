import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from './ui/sheet';
import { Input } from './Input';
import { Button } from './Button';

interface VarFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initialLabel?: string;
  initialValue?: string;
  onSubmit: (label: string, value: string) => Promise<void>;
}

export function VarFormSheet({
  open,
  onOpenChange,
  mode,
  initialLabel = '',
  initialValue = '',
  onSubmit,
}: VarFormSheetProps) {
  const [label, setLabel] = useState(initialLabel);
  const [value, setValue] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLabel(initialLabel);
      setValue(initialValue);
      setError(null);
      setLoading(false);
    }
  }, [open, initialLabel, initialValue]);

  const handleSubmit = async () => {
    if (!label.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(label.trim(), value);
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="bg-[#2c2c2c] border-l border-[#464646] text-white w-[380px] sm:max-w-[380px] flex flex-col p-0"
      >
        <SheetHeader className="px-[20px] py-[14px] border-b border-[#464646]">
          <div className="flex items-center gap-[10px]">
            <Icon icon="solar:code-square-linear" className="text-[#F881A9] text-xl" />
            <SheetTitle className="text-white font-['JetBrains_Mono',sans-serif] text-[13px] font-bold">
              {mode === 'create' ? 'New Variable' : 'Edit Variable'}
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-[16px] px-[20px] py-[20px] flex-1">
          <div className="flex flex-col gap-[6px]">
            <p className="font-['JetBrains_Mono',sans-serif] text-[10px] font-bold text-[rgba(255,255,255,0.5)] uppercase">
              Label
            </p>
            <Input
              placeholder="VARIABLE_NAME"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={loading || mode === 'edit'}
              className="font-['JetBrains_Mono',sans-serif] text-[12px]"
            />
          </div>

          <div className="flex flex-col gap-[6px]">
            <p className="font-['JetBrains_Mono',sans-serif] text-[10px] font-bold text-[rgba(255,255,255,0.5)] uppercase">
              Value
            </p>
            <textarea
              placeholder="value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={loading}
              rows={6}
              className="w-full bg-[#1e1e1e] border border-[#464646] rounded-[4px] px-[12px] py-[8px] text-white font-['JetBrains_Mono',sans-serif] text-[12px] resize-none focus:outline-none focus:border-[#F881A9] disabled:opacity-50 placeholder-[rgba(255,255,255,0.3)]"
            />
          </div>

          {error && (
            <p className="text-[11px] text-[#ff5050] font-['JetBrains_Mono',sans-serif] break-all">
              {error}
            </p>
          )}
        </div>

        <SheetFooter className="px-[20px] py-[14px] border-t border-[#464646] flex-row gap-[8px]">
          <Button
            variant="secondary"
            className="flex-1 h-[34px] text-[11px] font-bold uppercase"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1 h-[34px] text-[11px] font-bold uppercase"
            onClick={handleSubmit}
            disabled={loading || !label.trim()}
            icon={loading ? <Icon icon="solar:refresh-linear" className="text-xl animate-spin" /> : undefined}
          >
            {mode === 'create' ? 'Create' : 'Save'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
