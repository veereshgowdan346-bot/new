import React, { useState, useEffect } from 'react';
import { TrendingUp, Calendar, CheckCircle2, Flame, RefreshCw, ShieldCheck, Database } from 'lucide-react';
import { apiFetch } from '../../utils/api';

export default function PerformanceView({ recentTrades = [] }) {
  const [auditMode, setAuditMode] = useState('LIVE'); // Strictly 'LIVE' by default
  const [heatmapData, setHeatmapData] = useState({
    monthName: 'October',
    year: 2026,
    days: [],
    mtdProfit: 0.0,
    greenDays: 0,
    redDays: 0,
    greenRatio: 0.0,
    winStreak: 0,
    totalTrades: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Fetch verified daily trading totals strictly from SQLite trade_memory for the active mode
  const fetchDailyPnl = async (modeToFetch = auditMode) => {
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/memory/daily-pnl?year=2026&month=10&mode=${modeToFetch}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.days)) {
          setHeatmapData(data);
          setIsLoading(false);
          return;
        }
      }
    } catch (e) {
      console.warn('Daily PnL fetch warning:', e);
    }

    // Safe zero-baseline fallback for October 2026 if offline (Zero mock profits)
    const days = [];
    const now = new Date();
    const today = now.getDate();
    for (let d = 1; d <= 31; d++) {
      const dt = new Date(2026, 9, d); // Month 9 = Oct
      const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
      days.push({
        date: d,
        pnl: isWeekend ? 'Weekend' : '₹0.00',
        isNeutral: true,
        isWeekend,
        isToday: d === today && now.getMonth() === 9,
        trades: 0,
      });
    }

    setHeatmapData({
      monthName: 'October',
      year: 2026,
      days,
      mtdProfit: 0.0,
      greenDays: 0,
      redDays: 0,
      greenRatio: 0.0,
      winStreak: 0,
      totalTrades: 0,
    });
    setIsLoading(false);
  };

  useEffect(() => {
    fetchDailyPnl(auditMode);
  }, [recentTrades.length, auditMode]);

  return (
    <div className="space-y-4 animate-fadeIn select-none">
      {/* Header */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            Performance Matrix & Monthly P&L Heatmap
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Strict verified session P&L computed directly from SQLite trade memory (Zero mock data)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented Calendar Audit Mode Filter */}
          <div className="flex items-center bg-[#070e1e] p-0.5 rounded-lg border border-[#1e3a6e] shadow-sm">
            <button
              type="button"
              onClick={() => setAuditMode('LIVE')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition-all cursor-pointer ${
                auditMode === 'LIVE'
                  ? 'bg-gradient-to-r from-rose-600/30 to-red-600/40 text-rose-300 border border-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Strict verified Live trades only (Zero paper trades)"
            >
              🔴 LIVE TRADES ONLY
            </button>
            <button
              type="button"
              onClick={() => setAuditMode('PAPER')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition-all cursor-pointer ${
                auditMode === 'PAPER'
                  ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/70 shadow-[0_0_10px_rgba(0,240,255,0.3)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Separate Paper trading simulation log"
            >
              📝 PAPER AUDIT LOG
            </button>
          </div>

          <button
            type="button"
            onClick={() => fetchDailyPnl(auditMode)}
            className="p-1.5 rounded-lg bg-[#0b1325] border border-[#1e3a6e] text-slate-300 hover:text-cyan-300 transition-colors cursor-pointer"
            title="Refresh verified fills from database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <span className="flex items-center gap-1.5 text-xs text-amber-400 font-bold bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-lg">
            <Flame className="w-4 h-4 text-amber-400" />
            Win Streak: {heatmapData.winStreak} {heatmapData.winStreak === 1 ? 'Day' : 'Days'}
          </span>
        </div>
      </div>

      {/* Verified Data Integrity Badge */}
      <div className="px-3.5 py-2 rounded-xl bg-[#071324] border border-cyan-500/30 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2 text-cyan-300">
          <Database className="w-4 h-4 text-cyan-400" />
          <span>SQLite Database Source: <strong className="text-white">chintu_memory.db → trade_memory (mode='{auditMode}')</strong></span>
        </div>
        <span className="text-[11px] text-emerald-400 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          Zero Mock Figures Enforced (Paper Segregated)
        </span>
      </div>

      {/* Monthly Heatmap Calendar */}
      <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-400" />
            {heatmapData.monthName} {heatmapData.year} Sessions — <span className={auditMode === 'LIVE' ? "text-rose-400 font-mono" : "text-cyan-400 font-mono"}>
              {auditMode === 'LIVE' ? '🔴 STRICT LIVE CAPITAL AUDIT' : '📝 VIRTUAL PAPER LOGS'}
            </span>
          </h3>
          <span className={`text-xs font-mono font-bold ${heatmapData.mtdProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            MTD Profit: {heatmapData.mtdProfit >= 0 ? '+' : ''}₹{heatmapData.mtdProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ({heatmapData.greenRatio}% Green Days)
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
          {heatmapData.days.map((day) => {
            const hasTrades = (day.trades || 0) > 0;
            const bgClass = day.isWeekend
              ? 'bg-[#060c1c]/40 border-slate-800/80 text-slate-600'
              : !hasTrades
              ? 'bg-[#081226]/80 border-[#1e3a6e]/40 text-slate-400'
              : day.isGreen
              ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
              : 'bg-rose-500/15 border-rose-500/50 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.2)]';

            return (
              <div
                key={day.date}
                className={`p-3 rounded-xl border flex flex-col justify-between min-h-[75px] transition-all ${bgClass} ${
                  day.isToday ? 'ring-2 ring-cyan-400 shadow-[0_0_15px_rgba(0,240,255,0.4)]' : ''
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-slate-300">Oct {day.date}</span>
                  {day.isToday && (
                    <span className="text-[9px] font-bold bg-cyan-400 text-slate-950 px-1 rounded uppercase">
                      Today
                    </span>
                  )}
                </div>

                <div className="flex items-end justify-between mt-2 font-mono">
                  <span className="text-[9.5px] text-slate-500">
                    {hasTrades ? `${day.trades} tr` : ''}
                  </span>
                  <div className={`text-xs font-bold text-right ${hasTrades ? (day.isGreen ? 'text-emerald-400' : 'text-rose-400') : 'text-slate-400'}`}>
                    {day.pnl}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
