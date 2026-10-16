import React, { useState, useEffect } from 'react';
import { X, Radio, CheckCircle2, RefreshCw, Zap, ShieldCheck } from 'lucide-react';

export default function BrokerModal({ broker, onClose, onRefreshBroker }) {
  const [isPinging, setIsPinging] = useState(false);
  const [currentPing, setCurrentPing] = useState(broker?.ping || '14ms');

  useEffect(() => {
    if (broker?.ping) {
      setCurrentPing(broker.ping);
    }
  }, [broker?.ping]);

  if (!broker) return null;

  const handleTestPing = () => {
    setIsPinging(true);
    setTimeout(() => {
      const newPing = `${Math.floor(Math.random() * 8) + 10}ms`;
      setCurrentPing(newPing);
      setIsPinging(false);
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn select-none">
      <div className="relative w-full max-w-md bg-[#091329] border border-cyan-500/40 rounded-2xl shadow-[0_0_30px_rgba(0,240,255,0.25)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-[#070e1e] via-[#0e1d3d] to-[#070e1e] border-b border-[#1e3a6e]/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">{broker.name}</h3>
              <div className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>Connected & Authorized</span>
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

        {/* Content */}
        <div className="p-4 space-y-3 font-mono text-xs">
          <div className="bg-[#060c1c] border border-[#1e3a6e]/40 rounded-xl p-3 space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Account ID:</span>
              <span className="text-white font-bold">{broker.accountId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">WebSocket Ping:</span>
              <span className="text-emerald-400 font-bold">{currentPing}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Session Token Expires In:</span>
              <span className="text-cyan-400 font-bold">{broker.tokenExpires}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Order Routing:</span>
              <span className="text-slate-200">Direct Market Access (DMA)</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={handleTestPing}
              disabled={isPinging}
              className="py-2 px-3 rounded-xl bg-[#0e1d3d] hover:bg-[#132854] border border-[#1e3a6e] hover:border-cyan-400 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isPinging ? 'Pinging...' : 'Test Latency'}</span>
            </button>

            <button
              onClick={() => {
                alert(`New API Access Token generated and synchronized for ${broker.name}.`);
                onClose();
              }}
              className="py-2 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-xs font-semibold text-cyan-300 flex items-center justify-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Renew Token</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

