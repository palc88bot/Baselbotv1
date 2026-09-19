import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("💥 ErrorBoundary caught an unhandled error during hydration or render:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#070b14] text-slate-100 flex items-center justify-center p-6 font-sans">
          <div className="max-w-2xl w-full bg-[#0d1527] border border-red-500/30 rounded-xl p-8 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <svg className="w-8 h-8 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h1 className="text-2xl font-bold tracking-tight">Initialization / Hydration Crash Caught</h1>
            </div>
            
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
              Basel Quantum system detected a runtime rendering or script hydration failure. This diagnostics report contains details to help resolve domain hosting environment mismatches:
            </p>

            <div className="bg-black/40 border border-slate-800 rounded-lg p-4 font-mono text-xs text-red-300 overflow-x-auto space-y-2 mb-6">
              <div className="font-bold text-slate-400">Error Message:</div>
              <div>{this.state.error?.toString()}</div>
              
              {this.state.errorInfo && (
                <>
                  <div className="font-bold text-slate-400 mt-4">Component Stack Trace:</div>
                  <pre className="whitespace-pre-wrap leading-normal text-slate-400 max-h-48 overflow-y-auto">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </>
              )}
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 space-y-2 text-xs mb-6">
              <div className="text-slate-400 font-bold uppercase tracking-wider mb-2">Environment Information</div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-slate-500 font-medium">Domain Host:</span>
                <span className="col-span-2 text-cyan-400 font-mono">{window.location.host}</span>

                <span className="text-slate-500 font-medium">Full URL:</span>
                <span className="col-span-2 text-slate-300 font-mono break-all">{window.location.href}</span>

                <span className="text-slate-500 font-medium">Ready State:</span>
                <span className="col-span-2 text-emerald-400 font-mono">{document.readyState}</span>

                <span className="text-slate-500 font-medium">Secure Context:</span>
                <span className="col-span-2 text-amber-400 font-mono">{window.isSecureContext ? 'Secure (HTTPS)' : 'Insecure'}</span>
              </div>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full sm:w-auto px-6 py-3 bg-red-500 hover:bg-red-600 transition-colors rounded-lg font-semibold text-sm shadow-lg shadow-red-500/10 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 3.562M12 7V12h3" />
              </svg>
              Force Reload & Hydrate
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
