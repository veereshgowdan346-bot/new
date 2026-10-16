import React, { useState } from 'react';
import {
  Bot,
  Play,
  Pause,
  Filter,
  ArrowUpDown,
  Search,
  CheckCircle2,
  TrendingUp,
  Zap,
  SlidersHorizontal
} from 'lucide-react';

export default function BotsMonitorView({
  bots,
  onToggleBotStatus,
  onOpenDetails,
  onStartAllBots,
  onStopAllBots,
  executionMode = 'PAPER',
  onToggleExecutionMode
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [sortBy, setSortBy] = useState('id');

  const filteredBots = bots
    .filter((b) => {
      const matchSearch =
        b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.asset.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCat =
        filterCategory === 'ALL' ||
        (filterCategory === 'INDICES' && (b.asset.includes('NIFTY') || b.asset.includes('SENSEX'))) ||
        (filterCategory === 'EQUITIES' && ['RELIANCE', 'TATA MOTORS', 'HDFC BANK', 'INFY', 'ITC'].some((s) => b.asset.includes(s))) ||
        (filterCategory === 'COMMODITIES' && (b.asset.includes('GOLD') || b.asset.includes('SILVER') || b.asset.includes('CRUDE')));
      return matchSearch && matchCat;
    })
    .sort((a, b) => {
      if (sortBy === 'pnl') return b.pnlToday - a.pnlToday;
      if (sortBy === 'winrate') return b.winRate - a.winRate;
      if (sortBy === 'trades') return b.trades - a.trades;
      return a.id - b.id;
    });

  return (
    <div className="space-y-4 animate-fadeIn select-none">
      {/* Top Controls Bar */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-cyan-400" />
            Bots Fleet Monitor & Orchestration
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            14 Multi-Asset Automated Autonomous Algorithms Under Central AI Consensus
          </p>
        </div>

        {/* Search, Filter, Sort */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search bot or asset..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#09152e] border border-[#1e3a6e] text-xs text-slate-200 pl-8 pr-3 py-1.5 rounded-lg focus:outline-none focus:border-cyan-400 w-44"
            />
          </div>

          {/* Category Filter */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-[#09152e] border border-[#1e3a6e] text-xs text-slate-200 px-3 py-1.5 rounded-lg focus:outline-none focus:border-cyan-400"
          >
            <option value="ALL">All Categories</option>
            <option value="INDICES">Indices</option>
            <option value="EQUITIES">Equities</option>
            <option value="COMMODITIES">Commodities</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-[#09152e] border border-[#1e3a6e] text-xs text-slate-200 px-3 py-1.5 rounded-lg focus:outline-none focus:border-cyan-400"
          >
            <option value="id">Default (Bot 1-14)</option>
            <option value="pnl">Highest Today's P&L</option>
            <option value="winrate">Highest Win Rate</option>
            <option value="trades">Most Trades</option>
          </select>

          <button
            onClick={onStartAllBots}
            className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Start All</span>
          </button>

          <button
            onClick={onStopAllBots}
            className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Pause className="w-3.5 h-3.5" />
            <span>Stop All</span>
          </button>

          {/* Segmented Mode Selector */}
          <div className="flex items-center bg-[#070e1e] p-0.5 rounded-lg border border-[#1e3a6e]/70">
            <button
              type="button"
              onClick={() => onToggleExecutionMode && onToggleExecutionMode('PAPER')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer ${
                executionMode === 'PAPER'
                  ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/60 shadow-[0_0_10px_rgba(0,240,255,0.3)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>📝 PAPER MODE</span>
            </button>
            <button
              type="button"
              onClick={() => onToggleExecutionMode && onToggleExecutionMode('LIVE')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer ${
                executionMode === 'LIVE'
                  ? 'bg-gradient-to-r from-rose-600/30 to-red-600/40 text-rose-300 border border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.4)] animate-pulse'
                  : 'text-slate-400 hover:text-rose-300'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${executionMode === 'LIVE' ? 'bg-rose-400 animate-ping' : 'bg-slate-500'}`} />
              <span>🔴 LIVE MODE</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bots Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filteredBots.map((bot) => {
          const isPnlPositive = bot.pnlToday >= 0;
          return (
            <div
              key={bot.id}
              onClick={() => onOpenDetails(bot)}
              className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 hover:border-cyan-400/60 rounded-xl p-3.5 cursor-pointer group transition-all duration-200 shadow-md hover:shadow-[0_0_15px_rgba(0,240,255,0.18)]"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-[#162b55] text-cyan-300 border border-cyan-500/40 font-mono font-bold text-xs flex items-center justify-center">
                    {bot.id}
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
                      {bot.name}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {bot.asset}
                    </span>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleBotStatus(bot.id);
                  }}
                  className={`text-[9.5px] font-bold px-2 py-0.5 rounded border uppercase flex items-center gap-1 ${
                    bot.status === 'RUNNING'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                      : 'bg-slate-700/30 text-slate-400 border-slate-600/30 hover:bg-slate-700/40'
                  }`}
                >
                  {bot.status === 'RUNNING' ? <Play className="w-2.5 h-2.5 fill-current" /> : <Pause className="w-2.5 h-2.5" />}
                  <span>{bot.status}</span>
                </button>
              </div>

              {/* Price & PnL */}
              <div className="bg-[#060c1c] border border-[#1e3a6e]/40 rounded-lg p-2.5 my-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-slate-400">Live Price</span>
                  <span className="text-sm font-mono font-bold text-white">
                    ₹{bot.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-1 pt-1 border-t border-[#1e3a6e]/30">
                  <span className="text-xs text-slate-400">Today's P&L</span>
                  <span className={`text-xs font-mono font-bold ${isPnlPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isPnlPositive ? '+' : ''}₹{bot.pnlToday.toFixed(2)} ({isPnlPositive ? '+' : ''}{bot.pnlPercent}%)
                  </span>
                </div>
              </div>

              {/* Consensus & Stats */}
              <div className="space-y-1.5 text-[11px] font-mono">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400 font-sans">Signals Consensus:</span>
                  <div className="flex items-center gap-1 text-[9.5px] font-bold">
                    <span className="bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded">BUY {bot.decisions.buy}</span>
                    <span className="bg-rose-500/20 text-rose-400 px-1.5 py-0.2 rounded">SELL {bot.decisions.sell}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400 font-sans">Performance:</span>
                  <span>
                    Win Rate <strong className="text-cyan-400">{bot.winRate}%</strong> ({bot.trades} tr.)
                  </span>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-3 pt-2 border-t border-[#1e3a6e]/40 flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-mono">
                  Standard: {bot.lotSize} qty
                </span>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                  bot.action === 'BUY' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' :
                  bot.action === 'SELL' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' :
                  'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                }`}>
                  Current Bias: {bot.action}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

