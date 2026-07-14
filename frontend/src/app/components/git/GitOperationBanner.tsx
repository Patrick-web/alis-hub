import { useState } from 'react';
import { Icon } from '@iconify/react';
import * as ProductService from '../../../../bindings/alis-hub-v3/productservice';

interface GitSyncResult {
  kind: string;
  message: string;
  conflictFiles?: string[];
}

interface Props {
  result: GitSyncResult | null;
  onPull?: () => void;
  onPush?: () => void;
  onSync?: () => void;
  onResolve?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
}

const CONFIG: Record<string, {
  icon: string;
  iconClass: string;
  bg: string;
  border: string;
  text: string;
  label: string;
  getActionLabel?: (result: GitSyncResult) => string;
}> = {
  up_to_date: {
    icon: 'solar:check-circle-bold',
    iconClass: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    text: 'text-blue-400',
    label: 'Already up to date.',
  },
  push_rejected: {
    icon: 'solar:alt-arrow-up-linear',
    iconClass: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    text: 'text-amber-400',
    label: 'Remote has changes you don\'t have locally. Pull first, then push.',
  },
  pull_conflict: {
    icon: 'solar:danger-triangle-linear',
    iconClass: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    text: 'text-amber-400',
    label: '',
    getActionLabel: (r) =>
      `Merge conflicts in ${r.conflictFiles?.length ?? 0} file${r.conflictFiles?.length === 1 ? '' : 's'}. Resolve them to complete the pull.`,
  },
  uncommitted_changes: {
    icon: 'solar:file-corrupted-linear',
    iconClass: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    text: 'text-amber-400',
    label: 'You have local changes that would be overwritten. Commit or stash them first.',
  },
  network_error: {
    icon: 'solar:wifi-router-minimalistic-linear',
    iconClass: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    text: 'text-red-400',
    label: 'Could not reach the remote repository. Check your network connection.',
  },
  auth_error: {
    icon: 'solar:lock-keyhole-linear',
    iconClass: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    text: 'text-red-400',
    label: 'Authentication failed. Your session may have expired.',
  },
  other_error: {
    icon: 'solar:info-circle-linear',
    iconClass: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    text: 'text-red-400',
    label: '',
  },
};

export function GitOperationBanner({ result, onPull, onPush, onSync, onResolve, onRetry, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  if (!result || result.kind === 'ok') return null;

  async function handleSignIn() {
    setSigningIn(true);
    setSignInError(null);
    try {
      await (ProductService.Login as () => Promise<void>)();
      // Re-authenticated: retry the operation that hit the auth error if the
      // caller gave us one, otherwise just clear the banner.
      if (onRetry) onRetry();
      else onDismiss?.();
    } catch (e) {
      setSignInError(String(e));
    } finally {
      setSigningIn(false);
    }
  }

  const cfg = CONFIG[result.kind] ?? CONFIG.other_error;
  const label = cfg.getActionLabel ? cfg.getActionLabel(result) : (cfg.label || result.message);

  const actionBtn = (() => {
    switch (result.kind) {
      case 'up_to_date':
        return onDismiss ? (
          <button onClick={onDismiss} className="text-[10px] px-[8px] py-[2px] rounded-[3px] border border-blue-400/30 hover:border-blue-400/60 text-blue-400 transition-colors">
            Dismiss
          </button>
        ) : null;
      case 'push_rejected':
        return onSync ? (
          <button onClick={onSync} className="text-[10px] px-[8px] py-[2px] rounded-[3px] border border-amber-400/30 hover:border-amber-400/60 text-amber-400 transition-colors">
            Pull and Push
          </button>
        ) : null;
      case 'pull_conflict':
        return onResolve ? (
          <button onClick={onResolve} className="text-[10px] px-[8px] py-[2px] rounded-[3px] border border-amber-400/30 hover:border-amber-400/60 text-amber-400 transition-colors">
            Resolve Conflicts
          </button>
        ) : null;
      case 'network_error':
        return onRetry ? (
          <button onClick={onRetry} className="text-[10px] px-[8px] py-[2px] rounded-[3px] border border-red-400/30 hover:border-red-400/60 text-red-400 transition-colors">
            Retry
          </button>
        ) : null;
      case 'auth_error':
        return (
          <button
            onClick={handleSignIn}
            disabled={signingIn}
            className="text-[10px] px-[8px] py-[2px] rounded-[3px] border border-red-400/30 hover:border-red-400/60 text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {signingIn ? 'Signing in…' : 'Sign In'}
          </button>
        );
      case 'other_error':
        return result.message.length > 80 ? (
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-[10px] px-[8px] py-[2px] rounded-[3px] border border-red-400/30 hover:border-red-400/60 text-red-400 transition-colors"
          >
            {expanded ? 'Less' : 'Details'}
          </button>
        ) : null;
      default:
        return null;
    }
  })();

  const displayMessage = result.kind === 'auth_error' && signInError
    ? `Sign-in failed: ${signInError}`
    : result.kind === 'other_error'
    ? (expanded ? result.message : result.message.slice(0, 120) + (result.message.length > 120 ? '…' : ''))
    : label;

  return (
    <div className={`shrink-0 px-3 py-1.5 ${cfg.bg} border-b ${cfg.border} flex items-start gap-2`}>
      <Icon icon={cfg.icon} className={`${cfg.iconClass} text-sm shrink-0 mt-[1px]`} />
      <span className={`text-xs ${cfg.text} flex-1 leading-[1.5] ${result.kind === 'other_error' ? 'font-mono whitespace-pre-wrap break-all' : ''}`}>
        {displayMessage}
      </span>
      <div className="shrink-0 flex items-center gap-1.5">
        {actionBtn}
        <button
          onClick={onDismiss}
          className={`text-[10px] ${cfg.text} opacity-40 hover:opacity-70 transition-opacity`}
          aria-label="Dismiss"
        >
          <Icon icon="solar:close-circle-linear" className="text-sm" />
        </button>
      </div>
    </div>
  );
}
