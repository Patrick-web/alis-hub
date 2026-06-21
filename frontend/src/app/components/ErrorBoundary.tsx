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
      <div className="h-screen w-full bg-background flex flex-col items-center justify-center px-[32px]">
        <div className="w-full max-w-[480px] flex flex-col gap-[20px]">
          <div className="flex items-center gap-[10px]">
            <Icon icon="solar:close-circle-bold" className="text-destructive text-[22px] shrink-0" />
            <h1 className="text-[15px] font-bold text-white font-mono">
              Something went wrong
            </h1>
          </div>

          <p className="text-[12px] text-[rgba(255,255,255,0.45)] font-mono leading-relaxed">
            {error.message || 'An unexpected error occurred.'}
          </p>

          <div className="flex items-center gap-[10px]">
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-[6px] px-[12px] py-[7px] rounded-[6px] bg-card border border-border text-white text-[11px] font-mono hover:border-border transition-colors"
            >
              <Icon icon="solar:refresh-linear" className="text-[13px]" />
              Reload app
            </button>
            <button
              onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
              className="text-[11px] text-[rgba(255,255,255,0.3)] hover:text-white font-mono transition-colors"
            >
              {showDetails ? 'Hide' : 'Show'} details
            </button>
          </div>

          {showDetails && (
            <pre className="bg-background border border-border rounded-[6px] p-[12px] text-[10px] text-[rgba(255,255,255,0.5)] font-mono overflow-auto max-h-[220px] whitespace-pre-wrap break-all">
              {error.stack}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
