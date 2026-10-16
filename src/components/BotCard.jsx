import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, Zap, Sparkles } from 'lucide-react';

export default function BotCard({ bot, onOpenDetails, onQuickAction, onOpenSkills }) {
  const isPnlPositive = bot.pnlToday >= 0;
  const isPricePositive = bot.change >= 0;

  // Render SVG area sparkline formatted for spacious 4-column width
  const renderSparkline = () => {
    const data = bot.sparklineData;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const svgWidth = 240;
    const svgHeight = 44;

    const points = data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * svgWidth;
      const y = svgHeight - 6 - ((val - min) / range) * (svgHeight - 12);
      return `${x},${y}`;
    });

    const pathD = `M ${points.join(' L ')}`;
    const areaD = `M 0,${svgHeight} L ${points.join(' L ')} L ${svgWidth},${svgHeight} Z`;

    const strokeColor = bot.sparklineColor || (isPricePositive ? '#10b981' : '#f43f5e');
    const gradId = `spark-grad-${bot.id}`;

    return (
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-11 overflow-visible my-1.5 select-none"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.4" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#${gradId})`} />
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.length > 0 && (
          <circle
            cx={svgWidth}
            cy={svgHeight - 6 - ((data[data.length - 1] - min) / range) * (svgHeight - 12)}
            r="3.5"
            fill={strokeColor}
            className="animate-ping"
          />
        )}
      </svg>
    );
  };

  // Determine button styles based on action
  const getActionBtnStyle = () => {
    if (bot.action === 'BUY') {
      return 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/50 hover:border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.25)]';
    }
    if (bot.action === 'SELL') {
      return 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/50 hover:border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.25)]';
    }
    return 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/50 hover:border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.25)]';
  };

  return (
    <div
      onClick={() => onOpenDetails(bot)}
      className="bg-[#0b1325]/90 hover:bg-[#0e1933] border border-[#1e3a6e]/60 hover:border-cyan-400/60 rounded-xl p-3.5 flex flex-col justify-between transition-all duration-200 cursor-pointer group shadow-lg hover:shadow-[0_0_18px_rgba(0,240,255,0.18)] relative overflow-hidden"
    >
      {/* Top subtle highlight line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent group-hover:via-cyan-400 transition-all"></div>

      <div>
        {/* Card Header: Bot Number badge + Name + Running Badge */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-lg bg-[#162b55] text-cyan-300 border border-cyan-500/40 font-mono font-bold text-xs flex items-center justify-center shrink-0">
              {bot.id}
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-100 truncate group-hover:text-cyan-300 transition-colors">
                {bot.name}
              </h3>
              <div className="text-xs text-slate-400 font-medium truncate flex items-center gap-1.5 mt-0.5">
                <span className="text-slate-300 font-semibold">{bot.asset}</span>
                {bot.assetSymbol && (
                  <span className="text-cyan-400 font-mono text-[10px]">({bot.assetSymbol})</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end shrink-0 gap-1">
            <span
              className={`text-[9px] font-bold px-2 py-0.5 rounded tracking-wide border uppercase ${
                bot.status === 'RUNNING'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-700/30 text-slate-400 border-slate-600/30'
              }`}
            >
              {bot.status}
            </span>
            {(Number(bot.allocatedCapital) || 0) > 0 ? (
              <span className="text-[9px] font-mono font-bold text-cyan-300 bg-cyan-500/10 px-1.5 py-0.2 rounded border border-cyan-500/30">
                ₹{(Number(bot.allocatedCapital) || 0).toLocaleString('en-IN')}
              </span>
            ) : (
              <span className="text-[9px] font-mono text-slate-500">
                Consensus
              </span>
            )}
          </div>
        </div>

        {/* Live Asset Price & % Change */}
        <div className="flex items-baseline justify-between mt-1.5 px-0.5">
          <span className="text-base font-mono font-bold text-white tracking-tight">
            ₹{bot.price.toLocaleString('en-IN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </span>
          <span
            className={`text-xs font-mono font-semibold flex items-center gap-0.5 ${
              isPricePositive ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {isPricePositive ? '+' : ''}
            {bot.change.toFixed(2)} ({isPricePositive ? '+' : ''}
            {bot.changePercent.toFixed(2)}%)
          </span>
        </div>

        {/* Sparkline mini-chart */}
        <div className="w-full">{renderSparkline()}</div>

        {/* Today's P&L */}
        <div className="flex items-center justify-between py-1.5 border-t border-[#1e3a6e]/40 text-xs px-0.5">
          <span className="text-slate-400 font-medium">P&L (Today)</span>
          <div
            className={`font-mono font-bold flex items-center gap-1.5 ${
              isPnlPositive ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            <span>
              {isPnlPositive ? '+' : ''}₹
              {bot.pnlToday.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </span>
            <span className="text-[10.5px]">
              ({isPnlPositive ? '+' : ''}
              {bot.pnlPercent.toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* Decision from 13 Bots breakdown box */}
        <div className="my-2 bg-[#070e1e]/90 border border-[#1e3a6e]/50 rounded-xl p-2">
          <div className="text-[10px] font-semibold text-slate-400 tracking-wider mb-1.5 flex items-center justify-between">
            <span>Decision from 13 Bots</span>
            <span className="text-[9px] text-cyan-400 font-mono">Quorum Agreement</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-center font-mono font-bold text-[10px]">
            <div className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-lg py-1">
              BUY {bot.decisions.buy}
            </div>
            <div className="bg-rose-500/20 text-rose-400 border border-rose-500/40 rounded-lg py-1">
              SELL {bot.decisions.sell}
            </div>
            <div className="bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded-lg py-1">
              HOLD {bot.decisions.hold > 0 ? bot.decisions.hold : 0}
            </div>
          </div>
        </div>
      </div>

      {/* Big Action Button & Card Footer */}
      <div className="mt-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onQuickAction(bot);
          }}
          className={`w-full py-2 rounded-xl text-xs font-black tracking-widest uppercase transition-all mb-2 flex items-center justify-center gap-1.5 cursor-pointer ${getActionBtnStyle()}`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>{bot.action}</span>
        </button>

        <div className="flex items-center justify-between text-[10px] font-medium text-slate-400 border-t border-[#1e3a6e]/40 pt-1.5 px-0.5">
          <span>
            Win Rate: <strong className="text-slate-200 font-mono text-xs">{bot.winRate}%</strong>
          </span>

          {onOpenSkills && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenSkills(bot.id);
              }}
              className="px-1.5 py-0.5 rounded bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 hover:text-cyan-200 border border-cyan-500/40 text-[9.5px] font-mono flex items-center gap-1 transition-all cursor-pointer"
              title="Open Bot Skills & AI Upgrade Center"
            >
              <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
              <span>Skills</span>
            </button>
          )}

          <span>
            Trades: <strong className="text-slate-200 font-mono text-xs">{bot.trades}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
