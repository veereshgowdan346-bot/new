import React from 'react';
import { X, Bell, Zap, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';

export default function NotificationsModal({ isOpen, onClose, notifications = [], onClearAll }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn select-none">
      <div className="relative w-full max-w-md my-auto bg-[#091329] border border-cyan-500/40 rounded-2xl shadow-[0_0_35px_rgba(0,240,255,0.25)] overflow-hidden flex flex-col max-h-[calc(100vh-2rem)]">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-[#070e1e] via-[#0e1d3d] to-[#070e1e] border-b border-[#1e3a6e]/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Bell className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">AI Alerts & Signal Feed</h3>
              <div className="text-[10px] text-cyan-400 font-mono">
                {notifications.length} real-time system events
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#0b1325] border border-[#1e3a6e] text-slate-400 hover:text-white hover:border-cyan-400 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="p-4 space-y-2.5 overflow-y-auto flex-1">
          {notifications.map((item) => (
            <div
              key={item.id}
              className="p-3 rounded-xl bg-[#060c1c] border border-[#1e3a6e]/40 hover:border-cyan-500/40 transition-colors flex items-start gap-3"
            >
              <div className="mt-0.5">
                {item.type === 'buy' && (
                  <span className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xs font-bold font-mono">
                    B
                  </span>
                )}
                {item.type === 'sell' && (
                  <span className="w-6 h-6 rounded-md bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center text-xs font-bold font-mono">
                    S
                  </span>
                )}
                {item.type === 'alert' && (
                  <span className="w-6 h-6 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center text-xs font-bold font-mono">
                    !
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white truncate">{item.title}</h4>
                  <span className="text-[9.5px] font-mono text-slate-400">{item.time}</span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-tight font-sans">
                  {item.message}
                </p>
              </div>
            </div>
          ))}

          {notifications.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-xs">
              No new alerts. All systems running nominal.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#060c1c] border-t border-[#1e3a6e]/40 flex justify-end">
          <button
            onClick={onClearAll}
            className="text-xs font-semibold text-slate-400 hover:text-cyan-300 transition-colors px-3 py-1"
          >
            Clear All Alerts
          </button>
        </div>
      </div>
    </div>
  );
}

