import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, Zap, Sparkles, ShieldCheck, Activity } from 'lucide-react';

export default function BotCard({ bot, onOpenDetails, onQuickAction, onOpenSkills }) {
  const isPnlPositive = bot.pnlToday >= 0;
  const isPricePositive = bot.change >= 0;
  const isBuy = bot.action === 'BUY';
  const isSell = bot.action === 'SELL';

  // Render SVG Micro-Candlestick Sparkline with Candlestick Bodies & Wicks
  const renderMicroCandlesticks = () => {
    const data = bot.sparklineData || [24600, 24620, 24650, 24680, 24700, 24730];
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const svgWidth = 240;
    const svgHeight = 44;
    const count = data.length;
    const step = svgWidth / count;

    // Generate simulated OHLC from the price points
    const candles = data.map((close, i) => {
      const prev = i > 0 ? data[i - 1] : close * 0.999;
      const open = prev;
      const spread = Math.abs(close - open) * 0.4 || 1.5;
      const high = Math.max(open, close) + spread;
      const low = Math.min(open, close) - spread;
      const isBullish = close >= open;

      const normY = (val) => svgHeight - 6 - ((val - min) / range) * (svgHeight - 14);

      return {
        x: i * step + step * 0.2,
        w: Math.max(step * 0.6, 5),
        openY: normY(open),
        closeY: normY(close),
        highY: normY(high),
        lowY: normY(low),
        isBullish,
        color: isBullish ? '#10b981' : '#f43f5e'
      };
    });

    const points = data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * svgWidth;
      const y = svgHeight - 6 - ((val - min) / range) * (svgHeight - 12);
      return `${x},${y}`;
    });

    const pathD = `M ${points.join(' L ')}`;
    const areaD = `M 0,${svgHeight} L ${points.join(' L ')} L ${svgWidth},${svgHeight} Z`;
    const strokeColor = isBuy ? '#10b981' : isSell ? '#f43f5e' : '#00f0ff';
    const gradId = `spark-grad-${bot.id}`;

    return (
      <div className="relative w-full h-11 my-1.5">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-11 overflow-visible select-none"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaD} fill={`url(#${gradId})`} />

          {/* Trend baseline */}
          <path
            d={pathD}
            fill="none"
            stroke={strokeColor}
            strokeWidth="1.2"
            strokeDasharray="2 2"
            opacity="0.4"
          />

          {/* Micro Candlesticks: Wicks + Bodies */}
          {candles.map((c, i) => (
            <g key={i}>
              {/* Wick */}
              <line
                x1={c.x + c.w / 2}
                y1={c.highY}
                x2={c.x + c.w / 2}
                y2={c.lowY}
                stroke={c.color}
                strokeWidth="1.2"
              />
              {/* Body */}
              <rect
                x={c.x}
                y={Math.min(c.openY, c.closeY)}
                width={c.w}
                height={Math.max(Math.abs(c.closeY - c.openY), 2.5)}
                fill={c.color}
                rx="1"
              />
            </g>
          ))}

          {/* Live Tick Pulse Circle */}
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
      </div>
    );
  };

  // Determine button styles based on action
  const getActionBtnStyle = () => {
    if (bot.action === 'BUY') {
      return 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/60 shadow-[0_0_14px_rgba(16,185,129,0.3)] font-bold';
    }
    if (bot.action === 'SELL') {
      return 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/60 shadow-[0_0_14px_rgba(244,63,94,0.3)] font-bold';
    }
    return 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/60 shadow-[0_0_14px_rgba(245,158,11,0.3)] font-bold';
  };

  const cardGlowClass = isBuy
    ? 'border-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.25)] ring-1 ring-emerald-500/30 glow-buy-execution'
    : isSell
    ? 'border-rose-500/60 shadow-[0_0_20px_rgba(244,63,94,0.25)] ring-1 ring-rose-500/30 pulse-stop-loss'
    : 'border-[#1e3a6e]/60 hover:border-cyan-400/60';

  return (
    <div
      data-testid={`bot-card-${bot.id}`}
      onClick={() => onOpenDetails(bot)}
      className={`bg-[#0b1325]/95 hover:bg-[#0e1933] rounded-xl p-3.5 flex flex-col justify-between transition-all duration-200 cursor-pointer group shadow-lg relative overflow-hidden border ${cardGlowClass}`}
    >
      {/* Top subtle highlight line */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent ${isBuy ? 'via-emerald-400' : isSell ? 'via-rose-400' : 'via-cyan-400'} to-transparent transition-all`}></div>

      <div>
        {/* Card Header: Bot Number badge + Name + Running Badge */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-lg bg-[#162b55] text-cyan-300 border border-cyan-500/40 font-mono font-bold text-xs flex items-center justify-center shrink-0">
              {bot.id < 10 ? `0${bot.id}` : bot.id}
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-100 truncate group-hover:text-cyan-300 transition-colors">
                {bot.name}
              </h3>
              <div className="text-xs text-slate-400 font-medium truncate flex items-center gap-1.5 mt-0.5">
                <span className="text-slate-300 font-semibold">{bot.asset}</span>
                {bot.assetCategory && (
                  <span className="text-cyan-400/80 font-mono text-[9.5px]">({bot.assetCategory})</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end shrink-0 gap-1">
            <span
              className={`text-[9px] font-bold px-2 py-0.5 rounded tracking-wide border uppercase flex items-center gap-1 ${
                bot.status === 'RUNNING'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-700/30 text-slate-400 border-slate-600/30'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              {bot.status}
            </span>
            <span className="text-[8.5px] font-mono font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-1 rounded flex items-center gap-0.5">
              <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
              <span>RMS SAFE</span>
            </span>
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

        {/* Micro-candlestick Sparkline */}
        <div className="w-full">{renderMicroCandlesticks()}</div>

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
              BUY {bot.decisions?.buy || 11}
            </div>
            <div className="bg-rose-500/20 text-rose-400 border border-rose-500/40 rounded-lg py-1">
              SELL {bot.decisions?.sell || 2}
            </div>
            <div className="bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded-lg py-1">
              HOLD {bot.decisions?.hold || 0}
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
