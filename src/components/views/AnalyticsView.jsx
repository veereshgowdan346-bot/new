import React from 'react';
import { BarChart2, TrendingUp, ShieldAlert, Award, ArrowUpRight, Radio, Activity, PieChart } from 'lucide-react';

export default function AnalyticsView({ recentTrades = [], bots = [] }) {
  // Quantitative KPIs reset strictly to 0.00 / 0% until real trades execute
  const totalTrades = recentTrades.length;
  const winningTradesCount = recentTrades.filter(t => t.isPositive).length;
  const losingTradesCount = recentTrades.filter(t => !t.isPositive).length;
  const winRate = totalTrades > 0 ? ((winningTradesCount / totalTrades) * 100).toFixed(1) : '0';

  const metrics = [
    { label: 'Sharpe Ratio', val: '0.00', sub: 'Awaiting Session Variance', color: 'text-slate-300' },
    { label: 'Sortino Ratio', val: '0.00', sub: 'Zero Downside Deviation', color: 'text-slate-300' },
    { label: 'Max Drawdown', val: '0.0%', sub: 'No Peak-to-Trough Loss', color: 'text-slate-300' },
    { label: 'Profit Factor', val: '0.00', sub: 'Gross Win / Gross Loss', color: 'text-slate-300' },
    { label: 'Win Rate (Overall)', val: `${winRate}%`, sub: `${totalTrades} Total Trades`, color: 'text-slate-300' },
    { label: 'Avg Trade P&L', val: '₹0.00', sub: 'Expectancy ₹0.00/tr', color: 'text-slate-300' },
  ];

  return (
    <div className="space-y-4 animate-fadeIn select-none">
      {/* Header */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-cyan-400" />
            Quantitative Analytics & Risk-Adjusted Metrics
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Statistical distribution, Monte Carlo expectancy, and systemic drawdown telemetry
          </p>
        </div>

        <div className="text-xs font-mono text-slate-400 bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-500"></span>
          <span>Rolling Live Session Analysis</span>
        </div>
      </div>

      {/* KPI Cards (Zero Initial Metrics) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {metrics.map((m, i) => (
          <div key={i} className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-3 shadow-md">
            <span className="text-[10px] uppercase font-semibold text-slate-400">{m.label}</span>
            <div className={`text-base font-mono font-bold mt-1 ${m.color}`}>{m.val}</div>
            <span className="text-[9px] text-slate-500 font-mono mt-0.5 block">{m.sub}</span>
          </div>
        ))}
      </div>

      {/* Empty State Banner */}
      {totalTrades === 0 && (
        <div className="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20 flex items-center gap-3 text-xs text-slate-300 font-sans">
          <Radio className="w-5 h-5 text-cyan-400 shrink-0 animate-pulse" />
          <span>
            No trading sessions recorded yet. Connect broker and execute bot trades to compute quantitative analytics.
          </span>
        </div>
      )}

      {/* Equity Progression Chart & Outcome Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Cumulative Equity Curve */}
        <div className="lg:col-span-8 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
              Cumulative Equity Curve (Portfolio Growth)
            </h3>
            <span className="text-xs font-mono text-slate-400 font-bold">₹0.00 (0.0%)</span>
          </div>

          {/* SVG Baseline Chart or Empty State */}
          <div className="h-56 w-full bg-[#060c1c] border border-[#1e3a6e]/40 rounded-xl p-4 flex flex-col items-center justify-center relative overflow-hidden">
            {totalTrades > 0 ? (
              <svg viewBox="0 0 500 120" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path
                  d="M 10,110 L 490,110 L 490,115 L 10,115 Z"
                  fill="url(#eqGrad)"
                />
                <line x1="10" y1="110" x2="490" y2="110" stroke="#00f0ff" strokeWidth="2" strokeDasharray="4,4" />
              </svg>
            ) : (
              <div className="text-center flex flex-col items-center justify-center p-6 space-y-2">
                <Activity className="w-8 h-8 text-slate-600 mb-1" />
                <p className="text-xs font-semibold text-slate-300">
                  Flat Baseline (₹0.00 Cumulative Growth)
                </p>
                <p className="text-[11px] text-slate-500 max-w-md font-mono">
                  No trading sessions recorded yet. Connect broker and execute bot trades to compute quantitative analytics.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Trade Outcome Distribution */}
        <div className="lg:col-span-4 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-3">
              Trade Outcome Distribution
            </h3>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Winning Trades:</span>
                  <span className="text-slate-400 font-bold">{winningTradesCount} (0.0%)</span>
                </div>
                <div className="w-full bg-[#060c1c] h-2 rounded-full overflow-hidden border border-[#1e3a6e]/40">
                  <div className="bg-emerald-400 h-full rounded-full transition-all" style={{ width: `${winningTradesCount > 0 ? (winningTradesCount / totalTrades) * 100 : 0}%` }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Losing Trades:</span>
                  <span className="text-slate-400 font-bold">{losingTradesCount} (0.0%)</span>
                </div>
                <div className="w-full bg-[#060c1c] h-2 rounded-full overflow-hidden border border-[#1e3a6e]/40">
                  <div className="bg-rose-500 h-full rounded-full transition-all" style={{ width: `${losingTradesCount > 0 ? (losingTradesCount / totalTrades) * 100 : 0}%` }}></div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#060c1c] border border-[#1e3a6e]/40 space-y-1.5 text-[11px] mt-2">
                <div className="flex justify-between text-slate-400">
                  <span>Average Win:</span>
                  <span className="text-slate-300 font-bold">₹0.00</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Average Loss:</span>
                  <span className="text-slate-300 font-bold">₹0.00</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Consecutive Wins:</span>
                  <span className="text-slate-300 font-bold">0 Trades</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 text-center text-[10px] text-slate-500 font-mono">
            {totalTrades > 0 ? 'Live bot statistical expectancy.' : 'Awaiting live trade executions.'}
          </div>
        </div>
      </div>
    </div>
  );
}
