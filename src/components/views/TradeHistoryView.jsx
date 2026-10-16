import React, { useState } from 'react';
import { History, Download, Search, Filter } from 'lucide-react';

export default function TradeHistoryView({ recentTrades }) {
  const [filterAction, setFilterAction] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Real live trade history (from recentTrades stream)
  const allHistory = recentTrades || [];

  const filtered = allHistory.filter((t) => {
    const matchAction = filterAction === 'ALL' || t.action === filterAction;
    const matchSearch =
      t.symbol?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.bot?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchAction && matchSearch;
  });

  const exportCSV = () => {
    const headers = 'Time,Bot,Symbol,Action,Price,Qty,PnL\n';
    const rows = filtered
      .map((r) => `${r.time},${r.bot},${r.symbol},${r.action},${r.price},${r.qty},"${r.pnl}"`)
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chintu_trade_history_${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4 animate-fadeIn select-none">
      {/* Header */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-cyan-400" />
            Consolidated Trade Execution Audit Trail
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Full compliance logs, order IDs, fill prices, and realized broker fees
          </p>
        </div>

        <button
          onClick={exportCSV}
          className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/50 px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-[0_0_12px_rgba(0,240,255,0.3)] flex items-center gap-1.5"
        >
          <Download className="w-4 h-4" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Filter and Table */}
      <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl overflow-hidden shadow-lg p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search trades..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#060c1c] border border-[#1e3a6e] text-xs text-slate-200 pl-8 pr-3 py-1.5 rounded-lg focus:outline-none focus:border-cyan-400 w-48"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono">Action:</span>
            {['ALL', 'BUY', 'SELL'].map((act) => (
              <button
                key={act}
                onClick={() => setFilterAction(act)}
                className={`px-2.5 py-1 rounded text-[11px] font-bold font-mono transition-colors ${
                  filterAction === act
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-[#060c1c] text-slate-400 hover:text-white border border-[#1e3a6e]'
                }`}
              >
                {act}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#1e3a6e]/50 bg-[#070e1e] text-[10px] font-sans text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Bot</th>
                <th className="py-2.5 px-3">Symbol</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3 text-right">Fill Price (₹)</th>
                <th className="py-2.5 px-3 text-right">Quantity</th>
                <th className="py-2.5 px-3 text-right">Realized P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e3a6e]/30">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-[#0e1d3d]/70 transition-colors">
                  <td className="py-2 px-3 text-slate-400">{t.time}</td>
                  <td className="py-2 px-3 font-bold text-white">{t.bot}</td>
                  <td className="py-2 px-3 text-slate-200 font-semibold">{t.symbol}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                        t.action === 'BUY'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                      }`}
                    >
                      {t.action}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right text-slate-200">
                    {t.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-400">{t.qty}</td>
                  <td className="py-2 px-3 text-right font-bold text-emerald-400">{t.pnl}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center py-10 text-slate-400 font-sans text-xs">
                    No active trades recorded. Connect a broker to stream live trade executions.
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

