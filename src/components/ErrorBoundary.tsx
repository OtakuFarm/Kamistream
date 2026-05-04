import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-heading font-black text-white mb-2">Something went wrong</h2>
        <p className="text-[13px] text-[var(--text3)] mb-6 max-w-sm">
          {this.state.error?.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
          className="flex items-center gap-2 bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-5 py-2.5 rounded-xl text-[13px] font-bold hover:brightness-110 transition-all"
        >
          <RefreshCw className="w-4 h-4" /> Try Again
        </button>
      </div>
    );
  }
}

// Lightweight section-level error boundary
export function SafeSection({ children, name }: { children: ReactNode; name?: string }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl text-center text-[12px] text-[var(--text3)]">
          {name ? `${name} failed to load.` : 'This section failed to load.'} <button onClick={() => window.location.reload()} className="text-[var(--pink)] underline">Reload</button>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
