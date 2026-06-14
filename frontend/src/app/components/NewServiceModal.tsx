import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { Input } from './Input';
import { Button } from './Button';

interface NewServiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (neuronId: string) => Promise<void>;
}

// Rules derived from alis naming conventions:
//  - lowercase letters, digits, hyphens only
//  - must start with a lowercase letter
//  - must end with -v{positive-integer}  (the major version suffix)
//  - no consecutive hyphens
//  - total length 4–63 characters
const NEURON_ID_REGEX = /^[a-z][a-z0-9-]*-v[1-9][0-9]*$/;
const MAX_LEN = 63;

function validate(value: string): string | null {
  if (!value) return null;
  if (value.length > MAX_LEN) return `Must be at most ${MAX_LEN} characters.`;
  if (value.includes('--')) return 'Cannot contain consecutive hyphens.';
  if (!NEURON_ID_REGEX.test(value)) {
    if (!/^[a-z]/.test(value)) return 'Must start with a lowercase letter.';
    if (!/\-v[1-9][0-9]*$/.test(value)) return 'Must end with a version suffix like -v1 or -v2.';
    return 'Only lowercase letters, digits, and hyphens are allowed.';
  }
  return null;
}

export function NewServiceModal({ open, onOpenChange, onSubmit }: NewServiceModalProps) {
  const [neuronId, setNeuronId] = useState('');
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNeuronId('');
      setTouched(false);
      setLoading(false);
      setError(null);
    }
  }, [open]);

  const validationError = validate(neuronId);
  const isValid = neuronId.length > 0 && !validationError;

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(neuronId.trim());
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!loading) onOpenChange(o); }}>
      <DialogContent className="bg-[#2c2c2c] border border-[#464646] text-white p-0 gap-0 max-w-[420px]">
        <DialogHeader className="px-[20px] py-[14px] border-b border-[#464646]">
          <div className="flex items-center gap-[10px]">
            <Icon icon="solar:layers-minimalistic-linear" className="text-[#F881A9] text-xl" />
            <DialogTitle className="text-white font-['JetBrains_Mono',sans-serif] text-[13px] font-bold">
              New Service
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-[16px] px-[20px] py-[20px]">
          <div className="flex flex-col gap-[6px]">
            <p className="font-['JetBrains_Mono',sans-serif] text-[10px] font-bold text-[rgba(255,255,255,0.5)] uppercase">
              Service ID
            </p>
            <Input
              placeholder="e.g. payments-v1"
              value={neuronId}
              onChange={(e) => {
                setNeuronId(e.target.value);
                setTouched(true);
                setError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              disabled={loading}
              autoFocus
              className="font-['JetBrains_Mono',sans-serif]"
            />

            {touched && validationError && (
              <p className="text-[11px] text-[#ff5050] font-['JetBrains_Mono',sans-serif]">
                {validationError}
              </p>
            )}

            <div className="flex flex-col gap-[4px] mt-[4px]">
              <p className="text-[10px] text-[rgba(255,255,255,0.35)] font-['JetBrains_Mono',sans-serif]">
                Format: <span className="text-[rgba(255,255,255,0.55)]">{'{name}-v{N}'}</span> — e.g.{' '}
                <span className="text-[rgba(255,255,255,0.55)]">bookings-v1</span>,{' '}
                <span className="text-[rgba(255,255,255,0.55)]">payments-v2</span>
              </p>
              <p className="text-[10px] text-[rgba(255,255,255,0.35)] font-['JetBrains_Mono',sans-serif]">
                Lowercase letters, digits, and hyphens only · Max {MAX_LEN} chars
              </p>
            </div>
          </div>

          {error && (
            <p className="text-[11px] text-[#ff5050] font-['JetBrains_Mono',sans-serif] break-all">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="px-[20px] py-[14px] border-t border-[#464646] flex-row gap-[8px]">
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
            disabled={loading || !isValid}
            icon={loading ? <Icon icon="solar:refresh-linear" className="text-xl animate-spin" /> : undefined}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
