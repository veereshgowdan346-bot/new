import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Zap,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  Volume2,
  VolumeX,
  Cpu,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck
} from 'lucide-react';
import { toastEmitter } from '../utils/toastEmitter';
import { soundEngine } from '../utils/audioChime';

/**
 * ToastNotificationItem
 * Renders either a Decision Network trade execution alert or a high-tech system notification card.
 */
function ToastNotificationItem({
  toast,
  onDismiss,
  onNavigateTab,
  onSelectBot,
  soundMuted
}) {
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);
  const remainingTimeRef = useRef(toast.durationMs || 5000);

  const duration = toast.durationMs || 5000;
  const isEmergency = (toast.action || '').toUpperCase() === 'EMERGENCY_STOP' || (toast.type || '').toUpperCase() === 'EMERGENCY_STOP';
  const isSystemNotification = Boolean(toast.isSystemNotification || (toast.title && toast.message));
  const isBuy = !isEmergency && (toast.action || 'BUY').toUpperCase() === 'BUY';
  const toastType = (toast.type || 'info').toLowerCase();

  // Handle countdown & auto-dismiss
  useEffect(() => {
    if (isPaused) return;

    const intervalStep = 25; // 25ms tick for smooth progress bar
    timerRef.current = setInterval(() => {
      remainingTimeRef.current -= intervalStep;
      const pct = Math.max(0, (remainingTimeRef.current / duration) * 100);
      setProgress(pct);

      if (remainingTimeRef.current <= 0) {
        clearInterval(timerRef.current);
        onDismiss(toast.id);
      }
    }, intervalStep);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, duration, toast.id, onDismiss]);

  const handleMouseEnter = () => setIsPaused(true);
  const handleMouseLeave = () => setIsPaused(false);

  // Render System Notification (from emitToast)
  if (isSystemNotification) {
    const isSuccess = toastType === 'success';
    const isError = toastType === 'error';
    const isWarning = toastType === 'warning';

    const borderColor = isSuccess
      ? 'border-emerald-500/50 hover:border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.25)]'
      : isError
      ? 'border-rose-500/50 hover:border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.25)]'
      : isWarning
      ? 'border-amber-500/50 hover:border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
      : 'border-cyan-500/50 hover:border-cyan-400 shadow-[0_0_20px_rgba(0,240,255,0.25)]';

    const accentGradient = isSuccess
      ? 'from-emerald-400 via-teal-300 to-cyan-400'
      : isError
      ? 'from-rose-500 via-red-600 to-amber-600'
      : isWarning
      ? 'from-amber-400 via-orange-500 to-rose-500'
      : 'from-cyan-400 via-sky-400 to-blue-500';

    const IconComponent = isSuccess
      ? CheckCircle2
      : isError
      ? AlertCircle
      : isWarning
      ? AlertTriangle
      : ShieldCheck;

    const iconColor = isSuccess
      ? 'text-emerald-400'
      : isError
      ? 'text-rose-400'
      : isWarning
      ? 'text-amber-400'
      : 'text-cyan-400';

    const categoryBadge = isSuccess
      ? 'VERIFIED'
      : isError
      ? 'SYSTEM ERROR'
      : isWarning
      ? 'WARNING'
      : 'SYSTEM ALERT';

    const badgeStyle = isSuccess
      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
      : isError
      ? 'bg-rose-950/60 text-rose-300 border-rose-800/60'
      : isWarning
      ? 'bg-amber-950/60 text-amber-300 border-amber-800/60'
      : 'bg-cyan-950/60 text-cyan-300 border-cyan-800/60';

    return (
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`relative w-full max-w-[370px] bg-[#060b17]/95 border rounded-xl overflow-hidden backdrop-blur-md transition-all duration-300 pointer-events-auto select-none group animate-slideInRight ${borderColor}`}
      >
        {/* Top Gradient Accent */}
        <div className={`h-1 w-full bg-gradient-to-r ${accentGradient}`} />

        <div className="p-3 space-y-2">
          {/* Header Row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${badgeStyle}`}>
                {categoryBadge}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono text-slate-400">
                {toast.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#142340] transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Content Row */}
          <div className="flex items-start gap-2.5 bg-[#091325]/90 border border-[#16294d] rounded-lg p-2.5">
            <div className="mt-0.5 shrink-0">
              <IconComponent className={`w-4 h-4 ${iconColor}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-white tracking-tight">{toast.title || 'Notification'}</div>
              {toast.message && (
                <div className="text-[11px] text-slate-300 mt-0.5 leading-relaxed break-words">{toast.message}</div>
              )}
            </div>
          </div>
        </div>

        {/* Shrinking Progress Bar */}
        <div className="h-0.5 w-full bg-[#111f38] overflow-hidden">
          <div
            className={`h-full transition-all linear ${
              isSuccess ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' : isError ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' : 'bg-cyan-400 shadow-[0_0_8px_#00f0ff]'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  // Render Trade Execution Notification (Decision Network)
  const formattedPrice = typeof toast.price === 'number'
    ? toast.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : toast.price;

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative w-full max-w-[370px] bg-[#060b17]/95 border rounded-xl overflow-hidden backdrop-blur-md transition-all duration-300 pointer-events-auto select-none group animate-slideInRight ${
        isEmergency
          ? 'border-red-500/80 hover:border-red-400 shadow-[0_0_35px_rgba(239,68,68,0.45)] ring-1 ring-red-500/40'
          : isBuy
          ? 'border-cyan-500/50 hover:border-cyan-400 shadow-[0_0_20px_rgba(0,240,255,0.25)]'
          : 'border-rose-500/50 hover:border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.25)]'
      }`}
    >
      {/* Top Holographic Neon Gradient Accent */}
      <div
        className={`h-1 w-full bg-gradient-to-r ${
          isEmergency
            ? 'from-red-600 via-rose-500 to-amber-500 animate-pulse'
            : isBuy
            ? 'from-cyan-400 via-teal-300 to-emerald-400'
            : 'from-amber-400 via-rose-500 to-rose-600'
        }`}
      />

      <div className="p-3.5 space-y-2.5">
        {/* Row 1: Header Badge + Quorum + Dismiss */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isEmergency ? 'bg-red-400' : isBuy ? 'bg-cyan-400' : 'bg-rose-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isEmergency ? 'bg-red-500' : isBuy ? 'bg-cyan-400' : 'bg-rose-500'
                }`}
              />
            </span>

            <span className={`text-[10px] font-black tracking-widest uppercase font-mono ${
              isEmergency ? 'text-red-400 animate-pulse' : 'text-cyan-300'
            }`}>
              {isEmergency ? 'RMS CIRCUIT BREAKER' : 'DECISION NETWORK'}
            </span>

            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${
              isEmergency
                ? 'bg-red-950/80 text-red-300 border-red-700/80'
                : 'bg-cyan-950/60 text-cyan-300 border-cyan-800/60'
            }`}>
              {toast.quorum || (isEmergency ? 'RMS OVERRIDE' : '12/14 Quorum')}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono text-slate-400">
              {toast.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#142340] transition-colors cursor-pointer"
              title="Dismiss Alert"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Row 2: Trade Action, Symbol, Price & Mode */}
        <div className="flex items-center justify-between gap-2 bg-[#091325]/90 border border-[#16294d] rounded-lg p-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`px-2 py-1 rounded text-[11px] font-black uppercase font-mono tracking-wider flex items-center gap-1 border shrink-0 ${
                isEmergency
                  ? 'bg-red-500/25 text-red-200 border-red-500/70 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                  : isBuy
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
              }`}
            >
              {isEmergency ? (
                <Zap className="w-3.5 h-3.5 text-red-300 animate-bounce" />
              ) : isBuy ? (
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-300" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 text-rose-300" />
              )}
              <span>{isEmergency ? 'KILL SWITCH' : (toast.action || 'BUY')}</span>
            </div>

            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                <span className="truncate">{toast.symbol || 'NIFTY 50'}</span>
                <span className="text-[10px] font-mono text-slate-400 font-normal">
                  x{toast.qty || 50}
                </span>
              </div>
              <div className="text-[11px] font-mono font-bold text-cyan-300">
                ₹{formattedPrice}
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span
              className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                (toast.executionMode || 'PAPER') === 'LIVE'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                  : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
              }`}
            >
              {toast.executionMode || 'PAPER'}
            </span>
            <div className="text-[9px] font-mono text-slate-400 mt-1">
              {toast.latency || '2.1ms IPC'}
            </div>
          </div>
        </div>

        {/* Row 3: Strategy & Bot Rationale */}
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-300">
          <div className="truncate flex items-center gap-1 max-w-[240px]">
            <Cpu className="w-3 h-3 text-cyan-400 shrink-0" />
            <span className="text-cyan-200 font-semibold truncate">
              {toast.botName ? `${toast.botName}` : `Bot #${toast.botId || 1}`}
            </span>
            <span className="text-slate-400 truncate hidden sm:inline">
              • {toast.strategy || 'Momentum Breakout'}
            </span>
          </div>

          <span className="text-emerald-400 font-bold shrink-0">
            {toast.consensusRate || '92.8%'} Match
          </span>
        </div>

        {/* Row 4: Quick Action Buttons */}
        <div className="flex items-center justify-between pt-1 gap-2 border-t border-[#142340]/80">
          <button
            type="button"
            onClick={() => {
              if (onNavigateTab) onNavigateTab('orders-positions');
              onDismiss(toast.id);
            }}
            className="text-[10px] font-semibold text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span>View Orders & Positions</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </button>

          {toast.botId && onSelectBot && (
            <button
              type="button"
              onClick={() => {
                onSelectBot(toast.botId);
                onDismiss(toast.id);
              }}
              className="text-[10px] font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              Bot Telemetry
            </button>
          )}
        </div>
      </div>

      {/* Bottom Shrinking Progress Bar */}
      <div className="h-0.5 w-full bg-[#111f38] overflow-hidden">
        <div
          className={`h-full transition-all linear ${
            isBuy ? 'bg-cyan-400 shadow-[0_0_8px_#00f0ff]' : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

/**
 * ToastNotificationSystem
 * Renders the floating stack of live neon cyan trade alerts and system notifications.
 */
export default function ToastNotificationSystem({
  onNavigateTab,
  onSelectBot
}) {
  const [toasts, setToasts] = useState([]);
  const [soundMuted, setSoundMuted] = useState(false);

  // Subscribe to toast events
  useEffect(() => {
    const unsubscribe = toastEmitter.subscribe((newToast) => {
      setToasts((prev) => {
        const existing = prev.filter((t) => t.id !== newToast.id);
        return [newToast, ...existing.slice(0, 3)];
      });

      // Play audio chime if not muted
      if (!soundMuted) {
        try {
          if (newToast.isSystemNotification) {
            const t = (newToast.type || 'info').toLowerCase();
            if (t === 'success') {
              soundEngine.playSuccessChime();
            } else if (t === 'error') {
              soundEngine.playVetoChime();
            }
          } else {
            if ((newToast.action || 'BUY').toUpperCase() === 'BUY') {
              soundEngine.playBuyChime();
            } else {
              soundEngine.playSellChime();
            }
          }
        } catch {
          // Ignore audio playback constraints
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [soundMuted]);

  const handleDismiss = useCallback((toastId) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  }, []);

  const handleClearAll = () => {
    setToasts([]);
  };

  if (toasts.length === 0) return null;

  return (
    <aside
      aria-label="Real-time Trade Execution Alerts"
      className="fixed top-16 right-4 z-40 flex flex-col items-end gap-2.5 max-w-[360px] w-full pointer-events-none"
    >
      {/* Multi-Toast Top Bar (when > 1 toast) */}
      {toasts.length > 1 && (
        <div className="pointer-events-auto flex items-center justify-between gap-3 px-3 py-1 rounded-lg bg-[#060c18]/90 border border-cyan-500/30 text-[10px] font-mono text-cyan-300 shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>{toasts.length} Active System Alerts</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSoundMuted(!soundMuted)}
              className="text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
              title={soundMuted ? 'Unmute alerts' : 'Mute alerts'}
            >
              {soundMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer underline"
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* Render Stack of Toasts */}
      <div className="flex flex-col gap-2.5 w-full items-end">
        {toasts.map((toast) => (
          <ToastNotificationItem
            key={toast.id}
            toast={toast}
            onDismiss={handleDismiss}
            onNavigateTab={onNavigateTab}
            onSelectBot={onSelectBot}
            soundMuted={soundMuted}
          />
        ))}
      </div>
    </aside>
  );
}
