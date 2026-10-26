import React, { useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  Lock,
  Cpu,
  Zap,
  Check
} from 'lucide-react';

export default function ConnectionLifecycleModal({
  isOpen,
  onClose,
  provider,
  mode = 'save', // 'save' | 'test' | 'disconnect'
  status = 'in_progress', // 'in_progress' | 'success' | 'failed'
  steps = [],
  readBackVerified = false,
  errorMessage = null,
  successDetails = null,
  verifiedCapabilities = [],
  onRetry,
  onSaveVerified
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && status !== 'in_progress') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, status, onClose]);

  if (!isOpen) return null;

  const providerNames = {
    angel_one: 'Angel One SmartAPI',
    telegram: 'Telegram Bot API',
    google: 'Google Gemini / OAuth',
    ollama: 'Ollama Local Runtime'
  };

  const titlePrefix =
    mode === 'save'
      ? 'Persistent Vault Storage'
      : mode === 'test'
      ? 'Live Upstream Verification'
      : 'Disconnect & Purge';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md transition-opacity duration-300">
      <div
        className="relative w-full max-w-lg bg-[#0F172A] border border-slate-700/80 rounded-2xl shadow-2xl p-6 sm:p-8 text-slate-100 overflow-hidden"
        style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)' }}
        role="dialog"
        aria-modal="true"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              {mode === 'test' ? <Zap className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                {titlePrefix}
              </h2>
              <p className="text-xs text-slate-400">
                {providerNames[provider] || provider}
              </p>
            </div>
          </div>
          {status !== 'in_progress' && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Central Visual Indicator */}
        <div className="flex flex-col items-center justify-center py-6">
          {status === 'in_progress' && (
            <div className="relative flex items-center justify-center w-20 h-20 mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-cyan-500/20 animate-pulse" />
              <div className="w-16 h-16 rounded-full border-4 border-cyan-400 border-t-transparent animate-spin" />
              <Cpu className="w-7 h-7 text-cyan-400 absolute" />
            </div>
          )}

          {status === 'success' && (
            <div className="relative flex items-center justify-center w-20 h-20 mb-4 animate-in zoom-in-75 duration-300">
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-10 h-10" />
              </div>
            </div>
          )}

          {status === 'failed' && (
            <div className="relative flex items-center justify-center w-20 h-20 mb-4 animate-in zoom-in-75 duration-300">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 border-2 border-rose-500 flex items-center justify-center text-rose-400">
                <AlertCircle className="w-10 h-10" />
              </div>
            </div>
          )}

          <div className="text-center px-4">
            <h3 className="text-base font-semibold text-white mb-1">
              {status === 'in_progress' && (mode === 'save' ? 'Persisting Credentials to SQLite...' : 'Verifying Upstream Connection...')}
              {status === 'success' && (mode === 'save' ? 'Credentials Securely Saved & Verified' : 'Upstream Handshake Verified')}
              {status === 'failed' && (mode === 'save' ? 'Credential Persistence Failed' : 'Connection Verification Failed')}
            </h3>
            <p className="text-xs text-slate-300 max-w-sm">
              {status === 'in_progress' && 'Executing multi-stage validation and AES-256-GCM envelope encryption.'}
              {status === 'success' && (successDetails?.message || 'Transaction committed safely. Read-back verification passed.')}
              {status === 'failed' && (errorMessage || 'An error occurred during execution.')}
            </p>
          </div>
        </div>

        {/* Verified Capabilities (if in test success mode) */}
        {status === 'success' && mode === 'test' && verifiedCapabilities && verifiedCapabilities.length > 0 && (
          <div className="bg-emerald-950/30 rounded-xl p-3.5 border border-emerald-500/30 mb-4">
            <div className="text-[11px] font-bold tracking-wider text-emerald-400 uppercase mb-2 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              <span>Verified Capabilities</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-emerald-200">
              {verifiedCapabilities.map((cap, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span>{cap}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Staged Checklist Progress */}
        {steps && steps.length > 0 && (
          <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800 space-y-2.5 mb-5">
            <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-2">
              Operation Pipeline
            </div>
            {steps.map((step, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  {step.status === 'completed' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                  {step.status === 'active' && (
                    <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                  )}
                  {step.status === 'failed' && (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  {step.status === 'pending' && (
                    <div className="w-4 h-4 rounded-full border border-slate-600 shrink-0" />
                  )}
                  <span
                    className={`font-medium ${
                      step.status === 'completed'
                        ? 'text-slate-200'
                        : step.status === 'active'
                        ? 'text-cyan-300 font-semibold'
                        : step.status === 'failed'
                        ? 'text-rose-300'
                        : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {step.detail && (
                  <span className="text-[11px] text-slate-400 font-mono">
                    {step.detail}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Durable Persistence Read-Back Badge */}
        {readBackVerified && (
          <div className="mb-5 flex items-center justify-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>DURABLE READ-BACK VERIFIED • AES-256-GCM SQLITE PERSISTED</span>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          {status === 'failed' && onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          )}

          {status === 'success' && mode === 'test' && onSaveVerified && (
            <button
              onClick={() => {
                onClose();
                onSaveVerified(provider);
              }}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Save Verified Connection</span>
            </button>
          )}

          {status !== 'in_progress' ? (
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition shadow-lg shadow-cyan-600/20 cursor-pointer"
            >
              Done
            </button>
          ) : (
            <div className="text-xs text-slate-500 italic">
              Please wait while transaction completes...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
