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

interface EnvFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initialDisplayName?: string;
  onSubmit: (displayName: string, envType: number) => Promise<void>;
}

const ENV_TYPES = [
  { value: 1, label: 'Development', icon: 'solar:code-linear' },
  { value: 2, label: 'Staging', icon: 'solar:cloud-linear' },
  { value: 3, label: 'Production', icon: 'solar:earth-linear' },
];

export function EnvFormSheet({ open, onOpenChange, mode, initialDisplayName = '', onSubmit }: EnvFormSheetProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [envType, setEnvType] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDisplayName(initialDisplayName);
      setError(null);
      setLoading(false);
    }
  }, [open, initialDisplayName]);

  const handleSubmit = async () => {
    if (!displayName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(displayName.trim(), envType);
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
            <Icon icon="solar:server-square-cloud-linear" className="text-[#F881A9] text-xl" />
            <SheetTitle className="text-white font-['JetBrains_Mono',sans-serif] text-[13px] font-bold">
              {mode === 'create' ? 'New Environment' : 'Edit Environment'}
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-[16px] px-[20px] py-[20px] flex-1">
          <div className="flex flex-col gap-[6px]">
            <p className="font-['JetBrains_Mono',sans-serif] text-[10px] font-bold text-[rgba(255,255,255,0.5)] uppercase">
              Display Name
            </p>
            <Input
              placeholder="e.g. Production"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={loading}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          {mode === 'create' && (
            <div className="flex flex-col gap-[6px]">
              <p className="font-['JetBrains_Mono',sans-serif] text-[10px] font-bold text-[rgba(255,255,255,0.5)] uppercase">
                Type
              </p>
              <div className="flex flex-col gap-[4px]">
                {ENV_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setEnvType(t.value)}
                    disabled={loading}
                    className={`flex items-center gap-[10px] px-[12px] py-[8px] rounded-[4px] border transition-colors text-left ${
                      envType === t.value
                        ? 'border-[#F881A9] bg-[rgba(248,129,169,0.08)]'
                        : 'border-[#464646] hover:bg-[rgba(255,255,255,0.04)]'
                    }`}
                  >
                    <Icon
                      icon={t.icon}
                      className={`text-xl ${envType === t.value ? 'text-[#F881A9]' : 'text-[rgba(255,255,255,0.5)]'}`}
                    />
                    <span className={`font-['JetBrains_Mono',sans-serif] text-[12px] ${
                      envType === t.value ? 'text-[#F881A9]' : 'text-white'
                    }`}>
                      {t.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

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
            disabled={loading || !displayName.trim()}
            icon={loading ? <Icon icon="solar:refresh-linear" className="text-xl animate-spin" /> : undefined}
          >
            {mode === 'create' ? 'Create' : 'Save'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
