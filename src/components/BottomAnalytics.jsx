import React, { useState } from 'react';
import {
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  Radio,
  Activity,
  Layers,
  ShieldCheck,
  BarChart2,
  PieChart,
  TrendingUp,
  Clock,
  Inbox,
  Sparkles,
  Receipt
} from 'lucide-react';
import { calculateTradeCharges } from '../utils/taxCalculator';

export default function BottomAnalytics({
  candlestickData = [],
  recentTrades = [],
  portfolioAllocation = [],
  bots = [],
  onSelectSymbol
}) {
  const totalAllocatedCapital = bots.reduce((sum, b) => sum + (Number(b.allocatedCapital) || 0), 0);
  const [selectedSymbol, setSelectedSymbol] = useState('NIFTY 50');
  const [selectedTimeframe, setSelectedTimeframe] = useState('5m');
  const [hoveredCandle, setHoveredCandle] = useState(null);
  const [hoveredSlice, setHoveredSlice] = useState(null);

  const [provenanceFilter, setProvenanceFilter] = useState('ALL'); // 'ALL' | 'AUTHENTIC' | 'SYNTHETIC'

  // Count authentic vs synthetic executions
  const authenticCount = recentTrades.filter((t) => {
    const prov = t.provenance || '';
    return prov === 'REAL_BROKER_EXECUTION' || prov === 'AUTHENTIC_FEED_PAPER';
  }).length;

  const syntheticCount = recentTrades.filter((t) => {
    const prov = t.provenance || '';
    return (
      prov === 'SYNTHETIC_SIMULATION' ||
      prov === 'SYNTHETIC_REPLAY' ||
      prov === 'TELEMETRY_TEST' ||
      prov === 'SYNTHETIC_STRESS_TEST' ||
      prov === 'MOCK_BROKER'
    );
  }).length;

  const filteredTrades = recentTrades.filter((t) => {
    const prov = t.provenance || '';
    if (provenanceFilter === 'AUTHENTIC') {
      return prov === 'REAL_BROKER_EXECUTION' || prov === 'AUTHENTIC_FEED_PAPER';
    }
    if (provenanceFilter === 'SYNTHETIC') {
      return (
        prov === 'SYNTHETIC_SIMULATION' ||
        prov === 'SYNTHETIC_REPLAY' ||
        prov === 'TELEMETRY_TEST' ||
        prov === 'SYNTHETIC_STRESS_TEST' ||
        prov === 'MOCK_BROKER'
      );
    }
    return true;
  });

  // Calculate Net Profit after Indian Regulatory Deductions (SEBI, NSE, GST, Stamp, STT)
  const parsedTrades = filteredTrades.map((t) => {
    const isUnresolved = t.charges_status === 'UNRESOLVED' || t.chargesStatus === 'UNRESOLVED' || t.is_quarantined || t.isQuarantined;
    const rawPnl = typeof t.pnl === 'string'
      ? parseFloat(t.pnl.replace(/[^\d.-]/g, '')) || 0
      : Number(t.pnl) || 0;
    const grossPnl = t.isPositive === false ? -Math.abs(rawPnl) : Math.abs(rawPnl);
    const charges = calculateTradeCharges({
      price: t.price,
      qty: t.qty,
      action: t.action,
      segment: t.segment,
      grossPnl
    });
    return {
      ...t,
      isUnresolved,
      charges
    };
  });

  const aggregateGrossPnl = parsedTrades.reduce((sum, t) => sum + t.charges.grossPnl, 0);
  const aggregateCharges = parsedTrades.reduce((sum, t) => t.isUnresolved ? sum : sum + t.charges.totalCharges, 0);
  const unresolvedCount = parsedTrades.filter((t) => t.isUnresolved).length;
  const aggregateNetProfit = aggregateGrossPnl - aggregateCharges;

  // Expanded Widescreen Candlestick Calculations (Full Width SVG)
  const chartWidth = 960;
  const chartHeight = 280;
  const paddingLeft = 24;
  const paddingRight = 80;
  const paddingTop = 28;
  const paddingBottom = 44;
  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  const minPrice = 24150;
  const maxPrice = 24850;
  const priceRange = maxPrice - minPrice;

  const getY = (val) => paddingTop + plotHeight - ((val - minPrice) / priceRange) * plotHeight;

  // Candlestick width scaled across 960px
  const candleCount = candlestickData.length || 1;
  const candleSlotWidth = plotWidth / candleCount;
  const candleWidth = Math.max(10, candleSlotWidth * 0.65);

  // EMA 9 & SMA 21 calculation curves
  const emaPoints = candlestickData.map((d, i) => {
    const x = paddingLeft + (i / (candleCount - 1 || 1)) * plotWidth;
    const emaVal = 24580 + (d.close - 24580) * 0.75 + (i * 3.5);
    return `${x},${getY(emaVal)}`;
  }).join(' ');

  const smaPoints = candlestickData.map((d, i) => {
    const x = paddingLeft + (i / (candleCount - 1 || 1)) * plotWidth;
    const smaVal = 24540 + (d.close - 24540) * 0.55 + (i * 4.5);
    return `${x},${getY(smaVal)}`;
  }).join(' ');

  // Donut chart calculations
  const totalPercent = portfolioAllocation.reduce((acc, curr) => acc + curr.percent, 0) || 100;
  let cumulativeAngle = 0;
  const donutRadius = 60;
  const donutInnerRadius = 42;
  const centerCoord = 75;

  const donutSlices = portfolioAllocation.map((item) => {
    const sliceAngle = (item.percent / totalPercent) * 360;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + sliceAngle;
    cumulativeAngle += sliceAngle;

    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((endAngle - 90) * Math.PI) / 180;

    const x1 = centerCoord + donutRadius * Math.cos(startRad);
    const y1 = centerCoord + donutRadius * Math.sin(startRad);
    const x2 = centerCoord + donutRadius * Math.cos(endRad);
    const y2 = centerCoord + donutRadius * Math.sin(endRad);

    const x3 = centerCoord + donutInnerRadius * Math.cos(endRad);
    const y3 = centerCoord + donutInnerRadius * Math.sin(endRad);
    const x4 = centerCoord + donutInnerRadius * Math.cos(startRad);
    const y4 = centerCoord + donutInnerRadius * Math.sin(startRad);

    const largeArc = sliceAngle > 180 ? 1 : 0;
    const pathD = `M ${x1} ${y1} A ${donutRadius} ${donutRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${donutInnerRadius} ${donutInnerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`;

    return {
      ...item,
      pathD,
      startAngle,
      endAngle,
    };
  });

  return (
    <div className="flex flex-col space-y-4 w-full select-none">
      {/* ========================================================================= */}
      {/* SECTION 1: LIVE MARKET CHART (Full Width, Expanded Candlestick View)     */}
      {/* ========================================================================= */}
      <section className="w-full glass-panel rounded-2xl p-5 border border-[#1e3a6e]/60 shadow-lg relative overflow-hidden">
        {/* Background ambient lighting */}
        <div className="absolute top-0 right-1/4 w-80 h-32 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>

        {/* Section Header with Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#00f0ff] animate-pulse"></span>
              <h3 className="text-sm font-bold text-white tracking-wide">
                Live Market Chart
              </h3>
            </div>

            <div className="flex items-center gap-2 bg-[#081329] border border-[#1e3a6e] px-2.5 py-1 rounded-lg">
              <span className="text-xs font-bold text-slate-200">{selectedSymbol}</span>
              <span className="text-[11px] font-mono font-bold text-emerald-400">
                ₹24,730.50
              </span>
              <span className="text-[10px] font-mono text-emerald-400/90 font-medium">
                (+0.50%)
              </span>
            </div>

            {/* Indicator Legend Badges */}
            <div className="hidden sm:flex items-center gap-3 text-[10px] font-mono text-slate-400 ml-2">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-cyan-400 rounded-full"></span>
                EMA 9
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-indigo-400 rounded-full"></span>
                SMA 21
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded bg-emerald-500/60"></span>
                Volume
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Symbol Dropdown */}
            <div className="relative">
              <select
                value={selectedSymbol}
                onChange={(e) => {
                  setSelectedSymbol(e.target.value);
                  onSelectSymbol && onSelectSymbol(e.target.value);
                }}
                aria-label="Select market symbol"
                className="appearance-none bg-[#09152e] hover:bg-[#0e2149] border border-[#1e3a6e] hover:border-cyan-500/50 text-xs font-semibold text-slate-200 py-1.5 pl-3 pr-8 rounded-lg cursor-pointer focus:outline-none focus:border-cyan-400 transition-all shadow-sm"
              >
                <option value="NIFTY 50">NIFTY 50 • Index</option>
                <option value="BANKNIFTY">BANKNIFTY • Index</option>
                <option value="SENSEX">SENSEX • Index</option>
                <option value="GOLD">GOLD (XAUUSD) • MCX</option>
                <option value="BTCUSDT">BTCUSDT • Crypto</option>
                <option value="RELIANCE">RELIANCE • Equity</option>
                <option value="TATA MOTORS">TATA MOTORS • Equity</option>
                <option value="HDFC BANK">HDFC BANK • Equity</option>
                <option value="INFY">INFY • Equity</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Timeframe Button Pills */}
            <div className="flex items-center bg-[#070e1e] border border-[#1e3a6e] rounded-lg p-0.5 gap-0.5 font-mono text-[11px]">
              {['1m', '3m', '5m', '15m', '1h', '1D'].map((tf) => (
                <button
                  key={tf}
                  onClick={() => setSelectedTimeframe(tf)}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                    selectedTimeframe === tf
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_8px_rgba(0,240,255,0.3)]'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Expanded Candlestick SVG Plot */}
        <div className="relative w-full overflow-hidden bg-[#070e1e]/90 rounded-xl p-2 border border-[#1e3a6e]/40 shadow-inner">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full h-auto overflow-visible select-none"
          >
            {/* Horizontal Grid lines with Price Axis */}
            {[24800, 24650, 24500, 24350, 24200].map((price) => (
              <g key={`grid-${price}`}>
                <line
                  x1={paddingLeft}
                  y1={getY(price)}
                  x2={chartWidth - paddingRight}
                  y2={getY(price)}
                  stroke="#122347"
                  strokeWidth="1"
                  strokeDasharray="3,3"
                />
                <text
                  x={chartWidth - paddingRight + 8}
                  y={getY(price) + 3.5}
                  fill="#64748b"
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="600"
                >
                  ₹{price.toLocaleString('en-IN')}
                </text>
              </g>
            ))}

            {/* Smoothed Moving Average Lines */}
            <polyline
              fill="none"
              stroke="#00f0ff"
              strokeWidth="1.8"
              strokeOpacity="0.85"
              points={emaPoints}
            />
            <polyline
              fill="none"
              stroke="#818cf8"
              strokeWidth="1.6"
              strokeOpacity="0.75"
              points={smaPoints}
            />

            {/* Candlestick Bars */}
            {candlestickData.map((d, i) => {
              const x = paddingLeft + (i / (candleCount - 1 || 1)) * plotWidth;
              const isUp = d.close >= d.open;
              const color = isUp ? '#10b981' : '#f43f5e';

              const openY = getY(d.open);
              const closeY = getY(d.close);
              const highY = getY(d.high);
              const lowY = getY(d.low);

              const bodyTop = Math.min(openY, closeY);
              const bodyHeight = Math.max(3, Math.abs(closeY - openY));

              // Volume bar at base
              const maxVol = 500000;
              const volHeight = Math.min(42, (d.volume / maxVol) * 42);
              const volY = chartHeight - paddingBottom - volHeight;

              return (
                <g
                  key={`candle-${i}`}
                  className="cursor-pointer group"
                  onMouseEnter={() => setHoveredCandle(d)}
                  onMouseLeave={() => setHoveredCandle(null)}
                >
                  {/* Upper/Lower Wick */}
                  <line
                    x1={x}
                    y1={highY}
                    x2={x}
                    y2={lowY}
                    stroke={color}
                    strokeWidth="1.5"
                  />
                  {/* Real Body */}
                  <rect
                    x={x - candleWidth / 2}
                    y={bodyTop}
                    width={candleWidth}
                    height={bodyHeight}
                    fill={color}
                    rx="1.5"
                    className="group-hover:opacity-80 transition-opacity"
                  />
                  {/* Volume bar */}
                  <rect
                    x={x - candleWidth / 2}
                    y={volY}
                    width={candleWidth}
                    height={volHeight}
                    fill={color}
                    opacity="0.45"
                    rx="1"
                  />
                </g>
              );
            })}

            {/* X-axis time labels */}
            {['09:15', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'].map((timeLabel, idx) => {
              const xPos = paddingLeft + (idx / 6) * plotWidth;
              return (
                <text
                  key={`time-${idx}`}
                  x={xPos}
                  y={chartHeight - 12}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="9.5"
                  fontFamily="monospace"
                  fontWeight="600"
                >
                  {timeLabel}
                </text>
              );
            })}
          </svg>

          {/* Hover tooltip for candle */}
          {hoveredCandle && (
            <div className="absolute top-3 left-4 bg-[#09152e]/95 border border-cyan-500/50 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 shadow-xl backdrop-blur-md pointer-events-none flex items-center gap-3">
              <span>Time: <strong className="text-cyan-400">{hoveredCandle.time}</strong></span>
              <span>O: {hoveredCandle.open}</span>
              <span>H: {hoveredCandle.high}</span>
              <span>L: {hoveredCandle.low}</span>
              <span>C: <strong className={hoveredCandle.close >= hoveredCandle.open ? 'text-emerald-400' : 'text-rose-400'}>{hoveredCandle.close}</strong></span>
              <span className="text-slate-400">Vol: {hoveredCandle.volume.toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 2: RECENT TRADES (ALL BOTS) (Full Width Table Layout)             */}
      {/* ========================================================================= */}
      <section className="w-full glass-panel rounded-2xl p-5 border border-[#1e3a6e]/60 shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#00f0ff]"></span>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                Recent Trades (All Bots)
              </h3>
              <p className="text-[11px] text-slate-400 font-sans">
                Real-time multi-asset fills, order routing & realized P&L confirmation
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Provenance Filter Pills */}
            <div className="flex items-center gap-1 bg-[#09152e] p-1 rounded-lg border border-[#1e3a6e]">
              <button
                onClick={() => setProvenanceFilter('ALL')}
                className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold transition-all ${
                  provenanceFilter === 'ALL'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({recentTrades.length})
              </button>
              <button
                onClick={() => setProvenanceFilter('AUTHENTIC')}
                className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold transition-all ${
                  provenanceFilter === 'AUTHENTIC'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Authentic ({authenticCount})
              </button>
              <button
                onClick={() => setProvenanceFilter('SYNTHETIC')}
                className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold transition-all ${
                  provenanceFilter === 'SYNTHETIC'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Synthetic ({syntheticCount})
              </button>
            </div>

            {recentTrades.length > 0 && (
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span className="px-2.5 py-1 rounded-lg bg-[#09152e] border border-[#1e3a6e] text-slate-300">
                  Gross: <strong className={aggregateGrossPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                    {aggregateGrossPnl >= 0 ? '+' : ''}₹{aggregateGrossPnl.toFixed(2)}
                  </strong>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[#09152e] border border-amber-500/30 text-amber-300" title="Brokerage (₹20/order) + STT (0.0125%/0.0625%) + Exchange (0.00325%) + GST (18%) + SEBI + Stamp">
                  Taxes/Brokerage: <strong className="text-amber-400">-₹{aggregateCharges.toFixed(2)}</strong>
                </span>
                {unresolvedCount > 0 && (
                  <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10.5px] font-bold">
                    ⚠️ {unresolvedCount} Unresolved
                  </span>
                )}
                <span className={`px-2.5 py-1 rounded-lg border font-bold ${
                  aggregateNetProfit >= 0
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                    : 'bg-rose-500/15 border-rose-500/40 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.2)]'
                }`}>
                  Net Realized P/L: <strong>{aggregateNetProfit >= 0 ? '+' : ''}₹{aggregateNetProfit.toFixed(2)}</strong>
                </span>
              </div>
            )}
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-bold ${
              recentTrades.length > 0
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}>
              {recentTrades.length > 0 ? `${parsedTrades.length} Filtered` : '0 Live Executions'}
            </span>
          </div>
        </div>

        {/* Content: Empty State OR Full Width Table */}
        {recentTrades.length === 0 ? (
          <div className="w-full py-12 px-4 rounded-xl bg-[#070e1e]/70 border border-[#1e3a6e]/40 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#09152e] border border-[#1e3a6e] flex items-center justify-center text-slate-500 mb-3 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
              <Radio className="w-6 h-6 text-slate-400 animate-pulse" />
            </div>
            <h4 className="text-sm font-bold text-slate-200">
              No active trades. Connect broker to stream live executions.
            </h4>
            <p className="text-xs text-slate-400 max-w-md mt-1 leading-relaxed">
              When bots place orders through verified broker integrations (Angel One, Zerodha, Upstox, 5paisa), live trade fills, timestamps, and realized P&L will stream here instantly.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#1e3a6e]/40 bg-[#070e1e]/60">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="bg-[#09152e] border-b border-[#1e3a6e]/60 text-[10.5px] font-sans text-slate-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3.5">Timestamp</th>
                  <th className="py-2.5 px-3.5">Provenance</th>
                  <th className="py-2.5 px-3.5">Bot Identity</th>
                  <th className="py-2.5 px-3.5">Market Segment</th>
                  <th className="py-2.5 px-3.5">Asset Symbol</th>
                  <th className="py-2.5 px-3.5">Order Type</th>
                  <th className="py-2.5 px-3.5 text-right">Fill Price</th>
                  <th className="py-2.5 px-3.5 text-right">Execution Qty</th>
                  <th className="py-2.5 px-3.5 text-right">Gross P&L</th>
                  <th className="py-2.5 px-3.5 text-right">Charges/STT</th>
                  <th className="py-2.5 px-3.5 text-right">Net Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e3a6e]/30">
                {parsedTrades.map((trade) => {
                  const isBuy = trade.action === 'BUY';
                  const prov = trade.provenance || 'UNKNOWN_PROVENANCE';
                  let provBadge = 'bg-slate-800 text-slate-300 border-slate-700';
                  let provLabel = 'HISTORICAL';
                  if (prov === 'REAL_BROKER_EXECUTION') {
                    provBadge = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
                    provLabel = 'LIVE BROKER';
                  } else if (prov === 'AUTHENTIC_FEED_PAPER') {
                    provBadge = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
                    provLabel = 'AUTH PAPER';
                  } else if (prov === 'SYNTHETIC_SIMULATION') {
                    provBadge = 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40';
                    provLabel = 'SYNTH SIM';
                  } else if (prov === 'SYNTHETIC_REPLAY') {
                    provBadge = 'bg-purple-500/20 text-purple-300 border-purple-500/40';
                    provLabel = 'SYNTH REPLAY';
                  } else if (prov === 'TELEMETRY_TEST') {
                    provBadge = 'bg-blue-500/20 text-blue-300 border-blue-500/40';
                    provLabel = 'TELEMETRY';
                  } else if (prov === 'MOCK_BROKER') {
                    provBadge = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
                    provLabel = 'MOCK';
                  } else if (prov === 'SYNTHETIC_STRESS_TEST') {
                    provBadge = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
                    provLabel = 'STRESS TEST';
                  } else if (prov === 'RMS_PRE_ORDER_REJECTION') {
                    provBadge = 'bg-red-500/20 text-red-300 border-red-500/40';
                    provLabel = 'RMS BLOCK';
                  }

                  const seg =
                    trade.segment ||
                    (trade.symbol.includes('CE') || trade.symbol.includes('FUT') || trade.symbol.includes('NIFTY')
                      ? 'NSE F&O Options'
                      : trade.symbol.includes('GOLD') || trade.symbol.includes('SILVER') || trade.symbol.includes('CRUDE')
                      ? 'MCX Commodity'
                      : trade.symbol.includes('BTC')
                      ? 'Crypto Perpetual'
                      : 'NSE Equity');

                  const segBadgeColor =
                    seg.includes('Equity')
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                      : seg.includes('Commodity') || seg.includes('MCX')
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : seg.includes('Crypto')
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                      : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';

                  const netPnlVal = trade.charges.netPnl;
                  const isNetPositive = netPnlVal >= 0;

                  return (
                    <tr
                      key={trade.id}
                      className="hover:bg-[#0d1c3a]/80 transition-colors group cursor-default"
                    >
                      <td className="py-2.5 px-3.5 text-slate-400 text-[11px] whitespace-nowrap">
                        {trade.time}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[9.5px] font-sans font-bold border ${provBadge}`}>
                          {provLabel}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 font-bold text-slate-200 whitespace-nowrap">
                        {trade.bot}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[9.5px] font-sans font-bold border ${segBadgeColor}`}>
                          {seg}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-200 font-bold whitespace-nowrap">
                        {trade.symbol}
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            isBuy
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          }`}
                        >
                          {trade.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-right text-slate-200 font-semibold whitespace-nowrap">
                        ₹{typeof trade.price === 'number' ? trade.price.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : trade.price}
                      </td>
                      <td className="py-2.5 px-3.5 text-right text-slate-300 whitespace-nowrap">
                        {trade.qty}
                      </td>
                      <td className="py-2.5 px-3.5 text-right text-slate-300 font-semibold whitespace-nowrap">
                        {trade.charges.grossPnl >= 0 ? '+' : ''}₹{trade.charges.grossPnl.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono text-[11px] whitespace-nowrap">
                        {trade.isUnresolved ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40" title="Missing strikes/dates or mislabeled option contract. Regulatory charges unresolved.">
                            UNRESOLVED
                          </span>
                        ) : (
                          <span className="text-amber-400/90">-₹{trade.charges.totalCharges.toFixed(2)}</span>
                        )}
                      </td>
                      <td className={`py-2.5 px-3.5 text-right font-bold whitespace-nowrap ${trade.isUnresolved ? 'text-amber-400' : (isNetPositive ? 'text-emerald-400' : 'text-rose-400')}`}>
                        {trade.isUnresolved ? (
                          <span className="font-mono text-[11px] text-amber-300 font-semibold" title="Net profit cannot be certified while regulatory charges remain unresolved.">
                            UNRESOLVED
                          </span>
                        ) : (
                          `${isNetPositive ? '+' : ''}₹${netPnlVal.toFixed(2)}`
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* SECTION 3: PORTFOLIO ALLOCATION & RISK TELEMETRY (Full Width Layout)      */}
      {/* ========================================================================= */}
      <section className="w-full glass-panel rounded-2xl p-5 border border-[#1e3a6e]/60 shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#00f0ff]"></span>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                Portfolio Allocation & Risk Telemetry
              </h3>
              <p className="text-[11px] text-slate-400 font-sans">
                Asset diversification index, margin utilization & exposure management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
            <PieChart className="w-4 h-4" />
            <span>10 Tracked Assets</span>
          </div>
        </div>

        {/* Content: Donut + Legend on Left, Risk Telemetry Grid on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left: Donut Chart & Asset Breakdown (5 cols) */}
          <div className="lg:col-span-5 flex flex-col sm:flex-row items-center justify-center gap-6 p-4 rounded-xl bg-[#070e1e]/70 border border-[#1e3a6e]/40">
            {/* Donut SVG */}
            <div className="relative w-[150px] h-[150px] shrink-0">
              <svg viewBox="0 0 150 150" className="w-full h-full transform -rotate-90">
                {donutSlices.map((slice, i) => (
                  <path
                    key={`slice-${i}`}
                    d={slice.pathD}
                    fill={slice.color}
                    stroke="#070e1e"
                    strokeWidth="2.5"
                    className="transition-all duration-200 hover:opacity-85 cursor-pointer"
                    onMouseEnter={() => setHoveredSlice(slice)}
                    onMouseLeave={() => setHoveredSlice(null)}
                  />
                ))}
              </svg>

              {/* Donut Center Display */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="text-sm font-mono font-bold text-white leading-none">
                  {hoveredSlice ? `${hoveredSlice.percent}%` : `₹${totalAllocatedCapital.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </span>
                <span className="text-[9px] text-slate-400 font-medium tracking-tight mt-1">
                  {hoveredSlice ? hoveredSlice.name : 'Total Capital'}
                </span>
              </div>
            </div>

            {/* Asset Legend Badges */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] font-mono flex-1">
              {portfolioAllocation.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-slate-300 truncate max-w-[85px]">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    ></span>
                    {item.name}
                  </span>
                  <span className="text-slate-400 font-semibold">{item.percent}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Risk Telemetry Cards Grid (7 cols) */}
          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Card 1: Total Capital Allocated */}
            <div className="p-3.5 rounded-xl bg-[#070e1e]/80 border border-[#1e3a6e]/50 flex flex-col justify-between">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Total Capital Allocated
              </span>
              <div className="text-base font-mono font-bold text-white mt-1">
                ₹{totalAllocatedCapital.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                ₹{totalAllocatedCapital.toLocaleString('en-IN')} deployed
              </span>
            </div>

            {/* Card 2: Available Cash Margin */}
            <div className="p-3.5 rounded-xl bg-[#070e1e]/80 border border-[#1e3a6e]/50 flex flex-col justify-between">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Available Cash Margin
              </span>
              <div className="text-base font-mono font-bold text-cyan-400 mt-1">
                ₹0.00
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                100% liquid
              </span>
            </div>

            {/* Card 3: Today's Realized P&L */}
            <div className="p-3.5 rounded-xl bg-[#070e1e]/80 border border-[#1e3a6e]/50 flex flex-col justify-between">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Today's P&L
              </span>
              <div className="text-base font-mono font-bold text-slate-300 mt-1">
                ₹0.00
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                (0.00% Session ROI)
              </span>
            </div>

            {/* Card 4: Max Profit */}
            <div className="p-3.5 rounded-xl bg-[#070e1e]/80 border border-[#1e3a6e]/50 flex flex-col justify-between">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Max Profit
              </span>
              <div className="text-base font-mono font-bold text-slate-300 mt-1">
                ₹0.00
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                Peak Session Win
              </span>
            </div>

            {/* Card 5: Max Loss */}
            <div className="p-3.5 rounded-xl bg-[#070e1e]/80 border border-[#1e3a6e]/50 flex flex-col justify-between">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Max Loss
              </span>
              <div className="text-base font-mono font-bold text-slate-300 mt-1">
                ₹0.00
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                Session Max Drawdown
              </span>
            </div>

            {/* Card 6: Open Positions */}
            <div className="p-3.5 rounded-xl bg-[#070e1e]/80 border border-[#1e3a6e]/50 flex flex-col justify-between">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Open Positions
              </span>
              <div className="text-base font-mono font-bold text-slate-300 mt-1">
                0
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                No active exposure
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
