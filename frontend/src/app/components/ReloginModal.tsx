import { useState } from 'react';
import { Icon } from '@iconify/react';
import { Loader } from './Loader';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';

interface Props {
  onSuccess: () => void;
}

export function ReloginModal({ onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setLoading(true);
    setError(null);
    try {
      await (ProductService.Login as () => Promise<void>)();
      onSuccess();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[340px] bg-card border border-border rounded-[14px] p-[28px] flex flex-col gap-[20px] shadow-2xl">
        <div className="flex flex-col items-center gap-[10px] text-center">
          <div className="size-[48px] rounded-[12px] bg-[rgba(248,129,169,0.12)] border border-[rgba(248,129,169,0.25)] flex items-center justify-center">
            <Icon icon="solar:lock-keyhole-minimalistic-bold" className="text-brand text-[24px]" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-foreground">Session expired</p>
            <p className="text-[12px] text-foreground/50 mt-[4px] leading-relaxed">
              Your session has expired.<br />Sign in again to continue.
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-[8px] p-[10px] bg-[rgba(255,92,95,0.1)] border border-[rgba(255,92,95,0.3)] rounded-[6px]">
            <Icon icon="solar:close-circle-linear" className="text-destructive text-sm shrink-0 mt-[1px]" />
            <p className="text-[11px] text-foreground/70 leading-relaxed">{error}</p>
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="flex items-center justify-center gap-[10px] h-[42px] rounded-[8px] bg-brand hover:bg-[#f96fb9] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-[13px] font-bold text-brand-foreground"
        >
          {loading ? (
            <>
              <Loader size={16} color="#ffffff" />
              Opening browser…
            </>
          ) : (
            <>
              <Icon icon="solar:login-2-linear" className="text-base" />
              Sign in with Alis
            </>
          )}
        </button>
      </div>
    </div>
  );
}
