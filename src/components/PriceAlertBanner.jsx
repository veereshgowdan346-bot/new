import React, { useState } from 'react';
import {
  Bell,
  AlertTriangle,
  Zap,
  Check,
  RotateCcw,
  X,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  ChevronRight,
  Sliders,
  CheckCircle2,
  Volume2
} from 'lucide-react';
import { ALERT_TYPES } from '../utils/priceAlertManager';

export default function PriceAlertBanner({
  triggeredAlerts = [],
  onAcknowledge,
  onReset,
  onOpenManageModal,
  onExecuteOrder
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!triggeredAlerts || triggeredAlerts.length === 0) {
    return null;
  }

  // Ensure current index is within bounds
  const activeIndex = Math.min(currentIndex, triggeredAlerts.length - 1);
  const alert = triggeredAlerts[activeIndex];
  if (!alert) return null;

  const isEntry = alert.type === ALERT_TYPES.ENTRY;
  const isAbove = alert.condition === 'ABOVE';

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 shadow-2xl transition-all duration-300 animate-slide-in-top ${
      isEntry
        ? 'bg-gradient-to-r from-[#041d1a]/95 via-[#072421]/90 to-[#041d1a]/95 border-emerald-400/50 shadow-[0_0_25px_rgba(16,185,129,0.25)]'
        : 'bg-gradient-to-r from-[#22070e]/95 via-[#2b0a13]/90 to-[#22070e]/95 border-rose-500/50 shadow-[0_0_25px_rgba(244,63,94,0.25)]'
    }`}>
      {/* Background glowing radar scanline */}
      <div className={`absolute -right-20 -top-20 w-60 h-60 rounded-full blur-3xl pointer-events-none ${
        isEntry ? 'bg-emerald-500/15' : 'bg-rose-500/15'
      }`} />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left Side: Alert Symbol, Status Tag, and Detail */}
        <div className="flex items-start gap-3.5">
          {/* Animated Alarm Icon */}
          <div className={`relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border shadow-lg ${
            isEntry
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/60 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
              : 'bg-rose-500/20 text-rose-300 border-rose-400/60 shadow-[0_0_15px_rgba(244,63,94,0.4)]'
          }`}>
            <span className={`absolute inset-0 rounded-xl animate-ping opacity-40 ${
              isEntry ? 'bg-emerald-400' : 'bg-rose-400'
            }`} />
            {isEntry ? <Zap className="w-5 h-5 relative z-10 animate-pulse" /> : <AlertTriangle className="w-5 h-5 relative z-10 animate-pulse" />}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase border flex items-center gap-1 ${
                isEntry
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50'
                  : 'bg-rose-500/20 text-rose-300 border-rose-400/50'
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
                {isEntry ? 'ENTRY THRESHOLD BREACHED' : 'EXIT THRESHOLD BREACHED'}
              </span>

              <span className="text-xs font-mono text-slate-400">
                Triggered at {alert.triggeredAt || 'Just now'}
              </span>

              {triggeredAlerts.length > 1 && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                  {activeIndex + 1} of {triggeredAlerts.length}
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-baseline gap-2.5">
              <h3 className="text-base font-bold text-white tracking-wide">
                {alert.symbol}
              </h3>
              <div className="flex items-center gap-1 text-sm font-mono font-bold">
                <span className="text-slate-300">Live:</span>
                <span className={isEntry ? 'text-emerald-300' : 'text-rose-300'}>
                  ₹{Number(alert.triggeredPrice || alert.targetPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="text-xs font-mono text-slate-400 flex items-center gap-1">
                <span>(Target: ₹{Number(alert.targetPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })} |</span>
                <span className={alert.breachAmount >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {alert.breachAmount >= 0 ? '+' : ''}₹{alert.breachAmount ?? 0}
                </span>
                <span>{isAbove ? '>= ' : '<= '}condition)</span>
              </div>
            </div>

            {alert.note && (
              <p className="text-xs text-slate-300 mt-1 flex items-center gap-1 font-sans">
                <span className="text-cyan-400 font-mono font-semibold">Strategy Rule:</span>
                <span>{alert.note}</span>
              </p>
            )}
          </div>
        </div>

        {/* Right Side: Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-700/50">
          {/* 1-Click Order Execution directly from the alert */}
          <button
            onClick={() => onExecuteOrder && onExecuteOrder(alert)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 shadow-lg transition-all cursor-pointer ${
              isEntry
                ? 'bg-emerald-600 hover:bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                : 'bg-rose-600 hover:bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.4)]'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{isEntry ? '1-Click Buy Entry' : '1-Click Square Off'}</span>
          </button>

          {/* Reset / Re-arm threshold */}
          <button
            onClick={() => onReset && onReset(alert.id)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 transition-all cursor-pointer"
            title="Reset alert threshold to monitor again"
          >
            <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Re-arm</span>
          </button>

          {/* Acknowledge / Dismiss */}
          <button
            onClick={() => onAcknowledge && onAcknowledge(alert.id)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 transition-all cursor-pointer"
            title="Acknowledge and dismiss visual alert"
          >
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>Dismiss</span>
          </button>

          {/* Alert Configuration Drawer link */}
          <button
            onClick={onOpenManageModal}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1 transition-all cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">All Alerts</span>
          </button>

          {/* Next alert pagination if multiple triggered */}
          {triggeredAlerts.length > 1 && (
            <button
              onClick={() => setCurrentIndex((prev) => (prev + 1) % triggeredAlerts.length)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
              title="Next triggered alert"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
