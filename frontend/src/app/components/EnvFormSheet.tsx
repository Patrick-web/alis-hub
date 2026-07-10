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
  onSubmit: (displayName: string, envType: number, region: string) => Promise<void>;
}

const ENV_TYPES = [
  { value: 1, label: 'Development', icon: 'solar:code-linear' },
  { value: 2, label: 'Staging', icon: 'solar:cloud-linear' },
  { value: 3, label: 'Production', icon: 'solar:earth-linear' },
];

const GCP_REGIONS = [
  'africa-south1',
  'asia-east1',
  'asia-east2',
  'asia-northeast1',
  'asia-northeast2',
  'asia-northeast3',
  'asia-south1',
  'asia-south2',
  'asia-southeast1',
  'asia-southeast2',
  'australia-southeast1',
  'australia-southeast2',
  'europe-central2',
  'europe-north1',
  'europe-southwest1',
  'europe-west1',
  'europe-west2',
  'europe-west3',
  'europe-west4',
  'europe-west6',
  'europe-west8',
  'europe-west9',
  'europe-west10',
  'europe-west12',
  'me-central1',
  'me-central2',
  'me-west1',
  'northamerica-northeast1',
  'northamerica-northeast2',
  'southamerica-east1',
  'southamerica-west1',
  'us-central1',
  'us-east1',
  'us-east4',
  'us-east5',
  'us-south1',
  'us-west1',
  'us-west2',
  'us-west3',
  'us-west4',
];

export function EnvFormSheet({ open, onOpenChange, mode, initialDisplayName = '', onSubmit }: EnvFormSheetProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [envType, setEnvType] = useState(1);
  const [region, setRegion] = useState('europe-west3');
  const [regionFilter, setRegionFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDisplayName(initialDisplayName);
      setRegionFilter('');
      setError(null);
      setLoading(false);
    }
  }, [open, initialDisplayName]);

  const filteredRegions = GCP_REGIONS.filter(r => r.includes(regionFilter.toLowerCase()));

  const handleSubmit = async () => {
    if (!displayName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(displayName.trim(), envType, region);
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
        className="bg-card border-l border-border text-foreground w-[380px] sm:max-w-[380px] flex flex-col p-0"
      >
        <SheetHeader className="px-[20px] py-[14px] border-b border-border">
          <div className="flex items-center gap-[10px]">
            <Icon icon="solar:server-square-cloud-linear" className="text-brand text-xl" />
            <SheetTitle className="text-foreground font-mono text-[13px] font-bold">
              {mode === 'create' ? 'New Environment' : 'Edit Environment'}
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-[16px] px-[20px] py-[20px] flex-1 overflow-y-auto">
          {/* Display Name */}
          <div className="flex flex-col gap-[6px]">
            <p className="font-mono text-[10px] font-bold text-foreground/50 uppercase">
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
            <>
              {/* Type */}
              <div className="flex flex-col gap-[6px]">
                <p className="font-mono text-[10px] font-bold text-foreground/50 uppercase">
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
                          ? 'border-brand-fill bg-brand-fill/8'
                          : 'border-border hover:bg-foreground/[4%]'
                      }`}
                    >
                      <Icon
                        icon={t.icon}
                        className={`text-xl ${envType === t.value ? 'text-brand' : 'text-foreground/50'}`}
                      />
                      <span className={`font-mono text-[12px] ${envType === t.value ? 'text-brand' : 'text-foreground'}`}>
                        {t.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Region */}
              <div className="flex flex-col gap-[6px]">
                <p className="font-mono text-[10px] font-bold text-foreground/50 uppercase">
                  Region
                </p>
                <Input
                  placeholder="Filter regions..."
                  value={regionFilter}
                  onChange={(e) => setRegionFilter(e.target.value)}
                  disabled={loading}
                  className="font-mono text-[12px]"
                />
                <div className="flex flex-col gap-[2px] max-h-[180px] overflow-y-auto border border-border rounded-[4px]">
                  {filteredRegions.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRegion(r)}
                      disabled={loading}
                      className={`flex items-center justify-between px-[12px] py-[6px] text-left transition-colors ${
                        region === r
                          ? 'bg-brand-fill/12 text-brand'
                          : 'text-foreground/70 hover:bg-foreground/[4%]'
                      }`}
                    >
                      <span className="font-mono text-[11px]">{r}</span>
                      {region === r && <Icon icon="solar:check-circle-linear" className="text-brand text-[14px] shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {error && (
            <p className="text-[11px] text-destructive font-mono break-all">
              {error}
            </p>
          )}
        </div>

        <SheetFooter className="px-[20px] py-[14px] border-t border-border flex-row gap-[8px]">
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
