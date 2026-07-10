import { useState } from 'react';
import { Icon } from '@iconify/react';
import { Loader } from '../components/Loader';
import { useWorkspace } from '../stores/workspace';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';

export function LoginPage() {
  const { setPhase } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await (ProductService.Login as () => Promise<void>)();
      setPhase('hub');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-background gap-[32px]">
      {/* Logo / wordmark */}
      <div className="flex flex-col items-center gap-[8px]">
        <div className="size-[56px] rounded-[14px] bg-brand-fill/12 border border-brand-fill/25 flex items-center justify-center">
          <Icon icon="solar:cloud-bold" className="text-brand text-[28px]" />
        </div>
        <p className="text-[22px] font-bold text-foreground tracking-tight">AlisHub</p>
        <p className="text-[13px] text-foreground/40">Sign in to access your landing zones</p>
      </div>

      {/* Sign-in card */}
      <div className="w-[320px] bg-card border border-border rounded-[12px] p-[24px] flex flex-col gap-[16px]">
        {error && (
          <div className="flex items-start gap-[8px] p-[10px] bg-[rgba(255,92,95,0.1)] border border-[rgba(255,92,95,0.3)] rounded-[6px]">
            <Icon icon="solar:close-circle-linear" className="text-destructive text-sm shrink-0 mt-[1px]" />
            <p className="text-[11px] text-foreground/70 leading-relaxed">{error}</p>
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="flex items-center justify-center gap-[10px] h-[42px] rounded-[8px] bg-brand-fill hover:bg-[#f96fb9] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-[13px] font-bold text-brand-foreground"
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

        <p className="text-[10px] text-foreground/30 text-center leading-relaxed">
          A browser window will open for authentication.
          <br />
          Return here once you've signed in.
        </p>
      </div>
    </div>
  );
}
