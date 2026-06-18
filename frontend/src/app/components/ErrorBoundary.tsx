import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Icon } from '@iconify/react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, showDetails: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    const { error, showDetails } = this.state;

    if (!error) return this.props.children;

    return (
      <div className="h-screen w-full bg-[#1e1e1e] flex flex-col items-center justify-center px-[32px]">
        <div className="w-full max-w-[480px] flex flex-col gap-[20px]">
          <div className="flex items-center gap-[10px]">
            <Icon icon="solar:close-circle-bold" className="text-[#ff5c5f] text-[22px] shrink-0" />
            <h1 className="text-[15px] font-bold text-white font-['JetBrains_Mono',sans-serif]">
              Something went wrong
            </h1>
          </div>

          <p className="text-[12px] text-[rgba(255,255,255,0.45)] font-['JetBrains_Mono',sans-serif] leading-relaxed">
            {error.message || 'An unexpected error occurred.'}
          </p>

          <div className="flex items-center gap-[10px]">
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-[6px] px-[12px] py-[7px] rounded-[6px] bg-[#2c2c2c] border border-[#464646] text-white text-[11px] font-['JetBrains_Mono',sans-serif] hover:border-[#646464] transition-colors"
            >
              <Icon icon="solar:refresh-linear" className="text-[13px]" />
              Reload app
            </button>
            <button
              onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
              className="text-[11px] text-[rgba(255,255,255,0.3)] hover:text-white font-['JetBrains_Mono',sans-serif] transition-colors"
            >
              {showDetails ? 'Hide' : 'Show'} details
            </button>
          </div>

          {showDetails && (
            <pre className="bg-[#141414] border border-[#3a3a3a] rounded-[6px] p-[12px] text-[10px] text-[rgba(255,255,255,0.5)] font-['JetBrains_Mono',sans-serif] overflow-auto max-h-[220px] whitespace-pre-wrap break-all">
              {error.stack}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
