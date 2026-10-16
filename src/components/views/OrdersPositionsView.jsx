import React, { useState } from 'react';
import { Layers, ArrowUpRight, ArrowDownRight, Square, AlertOctagon, CheckCircle2, Zap } from 'lucide-react';

export default function OrdersPositionsView({ positions, onSquareOff, onSquareOffAll }) {
  const localSquareOff = (id) => {
    if (onSquareOff) onSquareOff(id);
  };

  const localSquareOffAll = () => {
    if (confirm('Are you sure you want to square off all active positions immediately?')) {
      if (onSquareOffAll) onSquareOffAll();
    }
  };

  const totalUnrealizedPnl = (positions || []).reduce((acc, p) => {
    const numericPnl = parseFloat(String(p.pnl).replace(/[^0-9.-]+/g, '')) || 0;
    return acc + numericPnl;
  }, 0);

  return (
    <div className="space-y-4 animate-fadeIn select-none">
      {/* Header */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            Live Positions & Real-Time Order Portfolio
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            {(positions || []).length} Active Positions • WebSocket Trade Confirmations & Real-time MTMM Mark-to-Market
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-[#09152e] border border-cyan-500/40 rounded-xl px-3 py-1 text-right font-mono">
            <span className="text-[9px] uppercase font-semibold text-slate-400 block">Total Unrealized P&L</span>
            <span className={`text-xs font-bold ${totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalUnrealizedPnl >= 0 ? '+' : ''}₹{totalUnrealizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <button
            onClick={localSquareOffAll}
            className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/50 px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-[0_0_12px_rgba(244,63,94,0.3)] flex items-center gap-1.5 cursor-pointer"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Square Off All ({(positions || []).length})</span>
          </button>
        </div>
      </div>

      {/* Positions Table */}
      <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#1e3a6e]/50 bg-[#070e1e] text-[10px] font-sans text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-3">Bot Name</th>
                <th className="py-2.5 px-3">Segment</th>
                <th className="py-2.5 px-3">Instrument</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3 text-right">Fill Qty</th>
                <th className="py-2.5 px-3 text-right">Avg Entry (₹)</th>
                <th className="py-2.5 px-3 text-right">Current LTP (₹)</th>
                <th className="py-2.5 px-3 text-right">Realized / MTMM P&L</th>
                <th className="py-2.5 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e3a6e]/30">
              {(positions || []).map((p) => {
                const seg = p.segment || (p.symbol.includes('CE') || p.symbol.includes('FUT') || p.symbol.includes('NIFTY') ? 'NSE F&O Options' : p.symbol.includes('GOLD') || p.symbol.includes('SILVER') || p.symbol.includes('CRUDE') ? 'MCX Commodity' : p.symbol.includes('BTC') ? 'Crypto' : 'NSE Equity');
                const segBadgeColor =
                  seg.includes('Equity')
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                    : seg.includes('Commodity') || seg.includes('MCX')
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : seg.includes('Crypto')
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                    : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';

                return (
                  <tr key={p.id} className="hover:bg-[#0e1d3d]/70 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-white tracking-wide">{p.bot}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[9.5px] font-sans font-bold border ${segBadgeColor}`}>
                        {seg}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-cyan-300 font-semibold">{p.symbol}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                          p.type === 'BUY'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        }`}
                      >
                        {p.type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300 font-semibold">{p.qty}</td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      ₹{typeof p.avgPrice === 'number' ? p.avgPrice.toFixed(2) : p.avgPrice}
                    </td>
                    <td className="py-2.5 px-3 text-right text-white font-bold">
                      ₹{typeof p.ltp === 'number' ? p.ltp.toFixed(2) : p.ltp}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-400">{p.pnl}</td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => localSquareOff(p.id)}
                        className="bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-400 text-[10px] font-bold px-2 py-0.5 rounded transition-colors cursor-pointer"
                      >
                        Exit
                      </button>
                    </td>
                  </tr>
                );
              })}
              {(!positions || positions.length === 0) && (
                <tr>
                  <td colSpan="9" className="text-center py-8 text-slate-400 font-sans text-xs">
                    All positions squared off. Awaiting new automated signals from AI Decision Engine.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
