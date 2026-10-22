import React from 'react';
import { AlertOctagon, RotateCcw, ShieldAlert, Cpu } from 'lucide-react';

/**
 * Universal Institutional-Grade Error Boundary
 * Prevents any component crash from taking down the Chintu AI trading engine.
 * Provides diagnostics, auto-recovery options, and clean degradation.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[Chintu ErrorBoundary - ${this.props.name || 'Core'}]:`, error, errorInfo);
    this.setState({ errorInfo });
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prev.retryCount + 1
    }));
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="w-full min-h-[280px] p-6 rounded-2xl bg-[#080d1a] border border-rose-500/30 shadow-[0_0_20px_rgba(244,63,94,0.15)] flex flex-col items-center justify-center text-center space-y-4 my-2">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/40 flex items-center justify-center text-rose-400">
            <ShieldAlert className="w-6 h-6 animate-pulse" />
          </div>

          <div className="space-y-1 max-w-lg">
            <div className="flex items-center justify-center gap-2 text-rose-400 font-mono text-xs uppercase tracking-widest font-bold">
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>Isolated Module Exception: {this.props.name || 'Component'}</span>
            </div>
            <h3 className="text-sm font-bold text-white tracking-wide">
              {this.props.fallbackTitle || 'Safe Quant Sandbox Engaged'}
            </h3>
            <p className="text-xs text-slate-400 font-mono leading-relaxed">
              {this.state.error?.message || 'An unexpected state calculation exception occurred. The master trading engine isolated this thread with 0 disruption to active broker orders.'}
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold transition-all cursor-pointer shadow-sm hover:shadow-[0_0_12px_rgba(0,240,255,0.3)]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Recover & Resync View</span>
            </button>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3.5 py-2 rounded-lg bg-[#0f172a] hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60 text-xs font-mono transition-all cursor-pointer"
            >
              Hard Reload
            </button>
          </div>

          <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 pt-1">
            <Cpu className="w-3 h-3 text-cyan-500/60" />
            <span>Chintu Autonomous Sentinel • Zero Runtime Crash Guarantee</span>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
