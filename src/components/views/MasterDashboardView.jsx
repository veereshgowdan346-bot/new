import React, { useState, useMemo } from 'react';
import {
  Play,
  Square,
  RotateCw,
  Globe,
  ArrowUpDown,
  FileText,
  Percent,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  ShieldAlert,
  PieChart,
  Columns,
  Cpu,
  Activity,
  Layers,
  BarChart2,
  Download,
  Calendar,
  ChevronDown,
  ExternalLink,
  Zap,
  Radio,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Award,
  CircleDollarSign,
  Repeat,
  Heart,
  Compass,
  Sliders,
  Flame
} from 'lucide-react';
import { topMarketsLive, marketAllocation, marketWisePerformance, capitalGrowthHistory } from '../../data/tradingData';
import MarketSentimentWidget from '../MarketSentimentWidget';
import MarketHeatmap from '../MarketHeatmap';
import { getPaperCapital, CAPITAL_DISCLAIMER } from '../../utils/capitalConfig';

export default function MasterDashboardView({
  bots = [],
  positions = [],
  tickers = [],
  allBotsRunning = false,
  onStartAllBots,
  onStopAllBots,
  onRestartBots,
  recentTrades = [],
  onSelectBot,
  onNavigateTab,
  executionMode = 'PAPER',
  isBrokerConnected = false
}) {
  const [selectedTradeFilter, setSelectedTradeFilter] = useState('ALL'); // 'ALL' | 'PROFITS' | 'LOSSES' | 'ACTIVE'
  const [selectedMarketFilter, setSelectedMarketFilter] = useState('All');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('All');
  const [selectedStrategyFilter, setSelectedStrategyFilter] = useState('All');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
  const [hoveredBot, setHoveredBot] = useState(null);
  const [showSentimentWidget, setShowSentimentWidget] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [currentSentiment, setCurrentSentiment] = useState({ score: 50, classification: 'Neutral' });
  const [bottomTab, setBottomTab] = useState('TRADES'); // 'TRADES' | 'GROWTH' | 'MARKETS'
  const [isSplitView, setIsSplitView] = useState(false);

  // 1. Authoritative metrics computed strictly from real runtime inputs (Declared FIRST to avoid TDZ)
  const totalTradesCount = recentTrades.length;
  const winningTradesCount = recentTrades.filter(t => (Number(t.netPnl ?? t.pnl) || 0) > 0).length;
  const losingTradesCount = recentTrades.filter(t => (Number(t.netPnl ?? t.pnl) || 0) <= 0).length;
  const activeTradesCount = positions.length;
  const activeMarketsCount = positions.length > 0 ? new Set(positions.map(p => p.symbol)).size : 0;
  const stocksTradedCount = recentTrades.length > 0 ? new Set(recentTrades.map(t => t.symbol)).size : 0;

  const winRatePct = totalTradesCount > 0
    ? ((winningTradesCount / totalTradesCount) * 100).toFixed(1)
    : 'N/A';

  const realizedPnl = recentTrades.reduce((sum, t) => sum + (Number(t.netPnl ?? t.pnl) || 0), 0);
  const unrealizedPnl = positions.reduce((sum, p) => sum + (Number(p.pnl) || 0), 0);
  const todayProfit = Number((realizedPnl + unrealizedPnl).toFixed(2));
  const basePaperCapital = getPaperCapital();
  const profitPct = totalTradesCount > 0 ? ((todayProfit / basePaperCapital) * 100).toFixed(2) : '0.00';

  const currentCapital = basePaperCapital + todayProfit;
  const capitalGrowthText = totalTradesCount > 0
    ? `₹${basePaperCapital.toLocaleString('en-IN')} → ₹${Math.round(currentCapital).toLocaleString('en-IN')}`
    : `₹${basePaperCapital.toLocaleString('en-IN')} (Baseline)`;
  const capitalGrowthPct = totalTradesCount > 0
    ? `${todayProfit >= 0 ? '+' : ''}${((todayProfit / basePaperCapital) * 100).toFixed(2)}%`
    : '+0.00%';

  // 2. Verified Institutional Risk Attribution Engine Metrics (Evaluated strictly AFTER todayProfit)
  const currentExposure = useMemo(() => {
    return (positions || []).reduce((sum, p) => {
      const price = Number(p.currentPrice || p.price || p.entryPrice) || 0;
      const qty = Math.abs(Number(p.qty) || 0);
      return sum + (price * qty);
    }, 0);
  }, [positions]);

  const capitalAtRisk = useMemo(() => {
    return (positions || []).reduce((sum, p) => {
      const entry = Number(p.entryPrice || p.price) || 0;
      const sl = Number(p.stopLoss) || (entry * 0.98); // 2% risk rule
      const qty = Math.abs(Number(p.qty) || 0);
      return sum + (Math.abs(entry - sl) * qty);
    }, 0);
  }, [positions]);

  const MAX_DAILY_LOSS_LIMIT = 25000; // RMS watchdog limit ₹25,000
  const remainingLossAllowance = useMemo(() => {
    const currentLoss = Math.max(0, -todayProfit);
    return Math.max(0, MAX_DAILY_LOSS_LIMIT - currentLoss);
  }, [todayProfit]);

  const riskBudgetUtilizationPct = useMemo(() => {
    const maxRiskBudget = 20000;
    if (capitalAtRisk <= 0) return '0.0';
    return Math.min(100, (capitalAtRisk / maxRiskBudget) * 100).toFixed(1);
  }, [capitalAtRisk]);

  const largestRiskContributors = useMemo(() => {
    if (!positions || positions.length === 0) return [];
    return [...positions]
      .sort((a, b) => {
        const expA = (Number(a.currentPrice || a.price || a.entryPrice) || 0) * Math.abs(Number(a.qty) || 0);
        const expB = (Number(b.currentPrice || b.price || b.entryPrice) || 0) * Math.abs(Number(b.qty) || 0);
        return expB - expA;
      })
      .slice(0, 3);
  }, [positions]);

  // Engine Control Status Items
  const engineStatus = useMemo(() => ({
    marketScanning: allBotsRunning ? 'Active' : 'Standby',
    signalAnalysis: allBotsRunning ? 'Active' : 'Standby',
    strategyVoting: allBotsRunning ? 'Active' : 'Standby',
    tradeExecution: allBotsRunning ? 'Paper' : 'Standby',
    riskManagement: 'Active',
    portfolioOptimization: allBotsRunning ? 'Active' : 'Standby'
  }), [allBotsRunning]);

  // Calculate dynamic trades list based on filters
  const filteredTrades = useMemo(() => {
    return recentTrades.filter((trade) => {
      // Status/Profit filter
      if (selectedTradeFilter === 'PROFITS' && trade.pnl <= 0) return false;
      if (selectedTradeFilter === 'LOSSES' && trade.pnl >= 0) return false;
      if (selectedTradeFilter === 'ACTIVE' && trade.status !== 'Open') return false;

      // Market filter
      if (selectedMarketFilter !== 'All' && trade.market !== selectedMarketFilter) return false;

      // Type filter
      if (selectedTypeFilter !== 'All' && trade.type !== selectedTypeFilter) return false;

      // Strategy filter
      if (selectedStrategyFilter !== 'All' && trade.strategy !== selectedStrategyFilter) return false;

      return true;
    });
  }, [recentTrades, selectedTradeFilter, selectedMarketFilter, selectedTypeFilter, selectedStrategyFilter]);

  // Handle Export to CSV
  const handleExportCSV = () => {
    const headers = ['#', 'Time', 'Symbol', 'Market', 'Type', 'Qty', 'Entry Price', 'Exit Price', 'P&L (INR)', 'P&L %', 'Strategy', 'Status', 'Duration'];
    const rows = filteredTrades.map((t, idx) => [
      idx + 1,
      t.time,
      t.symbol,
      t.market,
      t.type,
      t.qty,
      t.entryPrice,
      t.exitPrice,
      t.pnl,
      `${t.pnlPercent}%`,
      t.strategy,
      t.status,
      t.duration
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `chintu_trades_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper for 14 circular bot node coordinates around center
  const centerRadius = 145;
  const hubSize = 360;
  const centerX = hubSize / 2;
  const centerY = hubSize / 2;

  // Exact 14 bots positioning
  const botPositions = useMemo(() => {
    return bots.map((bot, index) => {
      // 14 bots evenly spaced around the circle, starting from top (index 0 at -90 deg)
      const angle = (index * (360 / 14) - 90) * (Math.PI / 180);
      const x = centerX + centerRadius * Math.cos(angle);
      const y = centerY + centerRadius * Math.sin(angle);
      return {
        ...bot,
        x,
        y,
        angleDeg: index * (360 / 14)
      };
    });
  }, [bots, centerX, centerY, centerRadius]);

  // Donut chart path helpers for Market Allocation
  const donutSize = 130;
  const donutCenter = donutSize / 2;
  const donutRadius = 48;
  const donutStrokeWidth = 16;
  const circumference = 2 * Math.PI * donutRadius;

  const dynamicAllocation = useMemo(() => {
    if (!positions || positions.length === 0) {
      return [{ name: 'Cash Buffer (Unallocated)', percent: 100, color: '#64748b' }];
    }
    const grouped = {};
    let totalVal = 0;
    positions.forEach(p => {
      const sym = p.symbol || 'Other';
      const val = (Number(p.entryPrice || 100) * Number(p.qty || 1)) + Math.abs(Number(p.pnl) || 0);
      grouped[sym] = (grouped[sym] || 0) + val;
      totalVal += val;
    });
    const colors = ['#00f0ff', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#10b981'];
    return Object.entries(grouped).map(([name, val], idx) => ({
      name,
      percent: Math.round((val / (totalVal || 1)) * 100),
      color: colors[idx % colors.length]
    }));
  }, [positions]);

  let currentOffset = 0;
  const donutSlices = dynamicAllocation.map((item) => {
    const strokeDasharray = `${(item.percent / 100) * circumference} ${circumference}`;
    const strokeDashoffset = -currentOffset;
    currentOffset += (item.percent / 100) * circumference;
    return {
      ...item,
      strokeDasharray,
      strokeDashoffset
    };
  });

    // Helper: High Density Trades Table (Full width or split)
  const renderTradesTable = () => (
    <div className="overflow-x-auto no-scrollbar">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-[#16294a] text-slate-400 text-[10.5px] font-bold uppercase tracking-wider">
            <th className="py-2.5 px-2.5">#</th>
            <th className="py-2.5 px-3">Time</th>
            <th className="py-2.5 px-3">Symbol</th>
            <th className="py-2.5 px-2.5">Market</th>
            <th className="py-2.5 px-2.5">Type</th>
            <th className="py-2.5 px-2.5 text-right">Qty</th>
            <th className="py-2.5 px-3 text-right">Entry Price</th>
            <th className="py-2.5 px-3 text-right">Exit Price</th>
            <th className="py-2.5 px-3 text-right">P&amp;L (₹)</th>
            <th className="py-2.5 px-2.5 text-right">P&amp;L %</th>
            <th className="py-2.5 px-3">Strategy</th>
            <th className="py-2.5 px-2.5 text-center">Status</th>
            <th className="py-2.5 px-2.5 text-right">Duration</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#16294a]/40 font-mono text-[11px]">
          {filteredTrades.length === 0 ? (
            <tr>
              <td colSpan={13} className="py-12 text-center text-slate-500 font-mono text-xs">
                No simulated trade executions recorded today. Start an authenticated paper trading session to evaluate live setups.
              </td>
            </tr>
          ) : (
            filteredTrades.map((trade, idx) => {
              const isProfit = trade.pnl > 0;
              const isLoss = trade.pnl < 0;
              return (
                <tr
                  key={trade.id || idx}
                  className="hover:bg-[#0c1833]/60 transition-colors group"
                >
                  <td className="py-2.5 px-2.5 text-slate-500 font-bold">{trade.id || idx + 1}</td>
                  <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">{trade.time}</td>
                  <td className="py-2.5 px-3 font-bold font-sans text-white whitespace-nowrap">
                    {trade.symbol}
                  </td>
                  <td className="py-2.5 px-2.5 text-slate-400 font-medium font-sans">{trade.market}</td>
                  <td className="py-2.5 px-2.5">
                    <span
                      className={`font-black uppercase px-2 py-0.5 rounded text-[9.5px] font-mono ${
                        trade.type === 'BUY'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                      }`}
                    >
                      {trade.type}
                    </span>
                  </td>
                  <td className="py-2.5 px-2.5 text-right text-slate-200">{trade.qty}</td>
                  <td className="py-2.5 px-3 text-right text-slate-300">
                    {Number(trade.entryPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-300">
                    {Number(trade.exitPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                  </td>
                  <td
                    className={`py-2.5 px-3 text-right font-bold ${
                      isProfit ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-slate-300'
                    }`}
                  >
                    {isProfit ? '+' : ''}
                    {Number(trade.pnl || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td
                    className={`py-2.5 px-2.5 text-right font-bold ${
                      isProfit ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-slate-300'
                    }`}
                  >
                    {isProfit ? '+' : ''}
                    {Number(trade.pnlPercent || 0).toFixed(2)}%
                  </td>
                  <td className="py-2.5 px-3 text-slate-300 font-sans whitespace-nowrap">
                    {trade.strategy}
                  </td>
                  <td className="py-2.5 px-2.5 text-center">
                    <span className="px-2 py-0.5 rounded text-[9.5px] font-sans font-medium bg-[#112347] text-slate-300">
                      {trade.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-2.5 text-right text-slate-400 font-sans">{trade.duration}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  // Helper: Capital Growth Chart Card
  const renderCapitalGrowthCard = () => (
    <div className="bg-[#060c18] border border-[#16294a]/80 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 tracking-wide">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span>Capital Growth &amp; Equity Curve</span>
          <span className="text-[10px] text-slate-400 font-normal">(Base: ₹{basePaperCapital.toLocaleString('en-IN')} • {CAPITAL_DISCLAIMER})</span>
        </h4>
        <span className={`px-2.5 py-0.5 rounded-md text-xs font-mono font-bold ${
          todayProfit > 0
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
            : todayProfit < 0
            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
            : 'bg-slate-800 text-slate-300 border border-slate-700'
        }`}>
          ₹ {Math.round(currentCapital).toLocaleString('en-IN')} <span className="text-[10.5px] ml-1">{capitalGrowthPct}</span>
        </span>
      </div>

      {/* SVG Equity Graph */}
      <div className="relative pt-2 pb-1">
        <div className="flex">
          {/* Y-Axis Labels */}
          <div className="flex flex-col justify-between text-[9px] font-mono text-slate-400 pr-2 h-44 text-right select-none">
            <span>₹ 1.5L</span>
            <span>₹ 1.25L</span>
            <span>₹ 1.0L</span>
            <span>₹ 75K</span>
            <span>₹ 50K</span>
          </div>

          {/* SVG Graph Area */}
          <div className="grow relative h-44">
            <svg viewBox="0 0 600 150" preserveAspectRatio="none" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="growthAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal gridlines */}
              <line x1="0" y1="15" x2="600" y2="15" stroke="#16294a" strokeWidth="0.8" strokeDasharray="3 3" />
              <line x1="0" y1="50" x2="600" y2="50" stroke="#16294a" strokeWidth="0.8" strokeDasharray="3 3" />
              <line x1="0" y1="85" x2="600" y2="85" stroke="#16294a" strokeWidth="0.8" strokeDasharray="3 3" />
              <line x1="0" y1="120" x2="600" y2="120" stroke="#16294a" strokeWidth="0.8" strokeDasharray="3 3" />

              {totalTradesCount === 0 ? (
                /* Flat Baseline at Initial Capital (₹1.0L = y:85) */
                <>
                  <line x1="0" y1="85" x2="600" y2="85" stroke="#00f0ff" strokeWidth="2" strokeDasharray="4 4" />
                  <circle cx="600" cy="85" r="4.5" fill="#00f0ff" stroke="#ffffff" strokeWidth="1.5" />
                </>
              ) : (
                <>
                  {/* Shaded Area Fill */}
                  <polygon
                    points="0,135 0,105 120,95 260,78 420,55 600,30 600,150 0,150"
                    fill="url(#growthAreaGrad)"
                  />
                  {/* Smooth Growth Line */}
                  <path
                    d="M 0 105 Q 120 95, 260 78 T 420 55 T 600 30"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <circle cx="600" cy="30" r="5" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
                </>
              )}
            </svg>
          </div>
        </div>

        {/* X-Axis Dates */}
        <div className="flex justify-between text-[9px] font-mono text-slate-400 pl-12 pt-2 select-none">
          <span>Session Start</span>
          <span>10:00 IST</span>
          <span>11:30 IST</span>
          <span>13:00 IST</span>
          <span>14:30 IST</span>
          <span>Current</span>
        </div>
      </div>
    </div>
  );

  // Helper: Market Wise Performance Card
  const renderMarketWiseCard = () => (
    <div className="bg-[#060c18] border border-[#16294a]/80 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-200 tracking-wide flex items-center gap-1.5">
          <BarChart2 className="w-4 h-4 text-cyan-400" />
          <span>Market Wise Performance Breakdown</span>
        </h4>
        <span className="text-[10px] font-mono text-slate-400">
          Segment Attributions
        </span>
      </div>

      {/* Performance Table */}
      <div className="space-y-2.5">
        {/* Header */}
        <div className="grid grid-cols-5 text-[9.5px] font-bold text-slate-400 uppercase tracking-wider pb-1.5 border-b border-[#16294a]">
          <span className="col-span-1">Market</span>
          <span className="text-center">Trades</span>
          <span className="text-center">Win Rate</span>
          <span className="text-right">Profit (₹)</span>
          <span className="text-right">Profit %</span>
        </div>

        {/* Dynamic Grouped Market Rows */}
        {recentTrades.length === 0 ? (
          <div className="py-8 text-center text-slate-500 font-mono text-xs">
            No trades recorded for this session. Grouped segment performance will populate as paper trades execute.
          </div>
        ) : (
          (() => {
            const groupedMap = new Map();
            recentTrades.forEach((t) => {
              const mkt = t.market || t.symbol || 'General';
              if (!groupedMap.has(mkt)) {
                groupedMap.set(mkt, { market: mkt, trades: 0, wins: 0, profit: 0 });
              }
              const entry = groupedMap.get(mkt);
              entry.trades += 1;
              const net = Number(t.netPnl ?? t.pnl) || 0;
              if (net > 0) entry.wins += 1;
              entry.profit += net;
            });
            const colors = ['#00f0ff', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];
            let cIdx = 0;
            return Array.from(groupedMap.values()).map((item) => {
              const wr = item.trades > 0 ? Math.round((item.wins / item.trades) * 100) : 0;
              const pPct = Number(((item.profit / 100000) * 100).toFixed(2));
              const color = colors[cIdx++ % colors.length];
              return (
                <div key={item.market} className="grid grid-cols-5 items-center text-xs text-slate-200 font-mono py-1.5 border-b border-[#16294a]/30">
                  <span className="col-span-1 font-sans font-bold text-slate-100 text-[11px] truncate">
                    {item.market}
                  </span>
                  <span className="text-center text-slate-400">{item.trades}</span>
                  <div className="flex flex-col items-center">
                    <span className="text-[10.5px] font-bold">{wr}%</span>
                    <div className="w-16 h-1.5 bg-[#102242] rounded-full mt-0.5 overflow-hidden">
                      <div
                        style={{ width: `${wr}%`, backgroundColor: color }}
                        className="h-full rounded-full"
                      />
                    </div>
                  </div>
                  <span className={`text-right font-bold text-[11px] ${item.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {item.profit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                  <span className={`text-right font-bold text-[11px] ${pPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {pPct >= 0 ? '+' : ''}{pPct.toFixed(2)}%
                  </span>
                </div>
              );
            });
          })()
        )}
      </div>
    </div>
  );

  
  return (
    <div className="space-y-4 select-none font-sans text-slate-100 animate-fadeIn">
      {/* =========================================================================
          EXECUTIVE OPERATIONAL TELEMETRY DECK (PHASE 3 FIRST-OPEN EXPERIENCE)
          Instant clarity on: Mode, Broker Gateway, Market Feed, P&L, Bots, Kill Switch
         ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Tile 1: Mode & Session */}
        <div className="neumorph-card p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Environment</span>
            </span>
            <span className={`text-[9.5px] px-2 py-0.5 rounded-full font-mono font-bold border ${
              executionMode === 'LIVE'
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
            }`}>
              {executionMode === 'LIVE' ? 'LIVE BROKER' : 'PAPER TRADING'}
            </span>
          </div>
          <div className="my-1">
            <div className="text-sm font-bold text-white leading-tight">
              {allBotsRunning ? 'Simulation Running' : 'Engine Standby'}
            </div>
            <div className="text-[10px] text-slate-400 font-sans mt-0.5">
              {executionMode === 'PAPER' ? 'Zero Financial Capital at Risk' : 'Broker DMA Enabled'}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-[#1e3a6e]/40 flex items-center justify-between">
            <button
              type="button"
              onClick={allBotsRunning ? onStopAllBots : onStartAllBots}
              className={`text-[10.5px] font-bold px-3 py-1 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                allBotsRunning
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                  : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 shadow-sm hover:shadow-cyan-500/20'
              }`}
            >
              {allBotsRunning ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
              <span>{allBotsRunning ? 'Pause Engine' : 'Start Paper Trading'}</span>
            </button>
            <span className="text-[9px] font-mono text-slate-400">14 Bots Ready</span>
          </div>
        </div>

        {/* Tile 2: Broker Gateway & Market Data */}
        <div className="neumorph-card p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-amber-400" />
              <span>Broker Gateway</span>
            </span>
            <span className={`text-[9.5px] px-2 py-0.5 rounded-full font-mono font-bold border ${
              isBrokerConnected
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-700/30 text-slate-400 border-slate-600/40'
            }`}>
              {isBrokerConnected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>
          <div className="my-1">
            <div className="text-sm font-bold text-white leading-tight">
              Angel One SmartAPI
            </div>
            <div className="text-[10px] text-slate-400 font-sans mt-0.5">
              {isBrokerConnected ? 'SmartStream v2 Binary Ticks Active' : 'Standby • Zero Synthetic Market Prices'}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-[#1e3a6e]/40 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onNavigateTab && onNavigateTab('connections')}
              className="text-[10.5px] font-semibold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>Connections & Vault</span>
              <span>→</span>
            </button>
            <span className="text-[9px] font-mono text-slate-400">AES-256</span>
          </div>
        </div>

        {/* Tile 3: Portfolio & Exposure */}
        <div className="neumorph-card p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
              <CircleDollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span>Portfolio P&L</span>
            </span>
            <span className="text-[9.5px] px-2 py-0.5 rounded-full font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
              ₹1.0L Base
            </span>
          </div>
          <div className="my-1">
            <div className={`text-base font-black font-mono leading-tight tabular-nums ${
              todayProfit > 0 ? 'text-emerald-400' : todayProfit < 0 ? 'text-rose-400' : 'text-slate-300'
            }`}>
              ₹ {todayProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-[11px] font-bold ml-1 opacity-80">
                {todayProfit >= 0 ? '+' : ''}{profitPct}%
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-sans mt-0.5">
              {positions.length} Open Positions • {totalTradesCount} Closed Trades
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-[#1e3a6e]/40 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onNavigateTab && onNavigateTab('orders-positions')}
              className="text-[10.5px] font-semibold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>Orders & Positions</span>
              <span>→</span>
            </button>
            <span className="text-[9px] font-mono text-slate-400">₹0 Risk Slippage</span>
          </div>
        </div>

        {/* Tile 4: Brain & Emergency Halt */}
        <div className="neumorph-card p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-violet-400" />
              <span>AI Core & Safety</span>
            </span>
            <span className="text-[9.5px] px-2 py-0.5 rounded-full font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
              RMS ARMED
            </span>
          </div>
          <div className="my-1">
            <div className="text-sm font-bold text-white leading-tight">
              14 Strategy Bots Mesh
            </div>
            <div className="text-[10px] text-slate-400 font-sans mt-0.5">
              9/14 Quorum • Institutional Safety Interlock
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-[#1e3a6e]/40 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onNavigateTab && onNavigateTab('risk-management')}
              className="text-[10.5px] font-semibold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>RMS Guardrails</span>
              <span>→</span>
            </button>
            <span className="text-[9px] font-mono text-emerald-400 font-bold">1-Click Halt Ready</span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 1: TOP 3-COLUMN HERO ROW
          Left: AI Engine Control + Market Allocation (Active Trades)
          Center: Central Bot Decision Network (14 Strategy Bots Holographic Ring)
          Right: Live Trading Status + Top Markets (Live)
         ========================================================================= */}
      {/* =========================================================================
          SECTION 1: PRIMARY DEFAULT LANDING VIEW — AI TRADING ENGINE (14 BOTS VISUALIZER)
          Centerpiece: 14 Strategy Bots Circular Quorum Consensus Ring (Primary Startup View)
          Right: Live Trading Status & Top Markets (Live)
         ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
        {/* PRIMARY LANDING VIEW: CENTRAL BOT DECISION NETWORK (14 Strategy Bots Holographic Ring) */}
        <div className="lg:col-span-7 bg-[#080e1b]/95 border border-[#16294a] rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center relative overflow-hidden shadow-[0_0_35px_rgba(0,240,255,0.12)] backdrop-blur-md">
          {/* Subtle Cybernetic Background Grid & Radial Glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-900/15 via-[#080e1b]/40 to-transparent pointer-events-none" />

          {/* Top Header Label on the Visualizer Card */}
          <div className="w-full flex items-center justify-between z-10 mb-2 px-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="text-xs font-mono font-black text-white uppercase tracking-wider">
                AI TRADING ENGINE • 14 STRATEGY BOTS QUORUM MESH
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/40">
              Primary Autonomous Core
            </span>
          </div>

          {/* Holographic Radar Constellation Container */}
          <div className="relative w-full max-w-[440px] aspect-square flex items-center justify-center my-1">
            {/* SVG Connecting Radial Neon Lines & Rings */}
            <svg
              viewBox={`0 0 ${hubSize} ${hubSize}`}
              className="absolute inset-0 w-full h-full pointer-events-none overflow-visible select-none"
            >
              <defs>
                <filter id="neonGlow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <linearGradient id="coreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.1" />
                </linearGradient>
              </defs>

              {/* Outer Orbit Guide Ring */}
              <circle
                cx={centerX}
                cy={centerY}
                r={centerRadius}
                fill="none"
                stroke="#16294a"
                strokeWidth="1"
                strokeDasharray="4 4"
                className="opacity-70"
              />

              {/* Inter-bot Peer Ring (Connecting all 14 bots to each other in a circle) */}
              <circle
                cx={centerX}
                cy={centerY}
                r={centerRadius}
                fill="none"
                stroke="rgba(0, 240, 255, 0.2)"
                strokeWidth="1.2"
              />

              {/* Connecting Radial Lines from Center Hub to each Bot */}
              {botPositions.map((b) => {
                const isHovered = hoveredBot?.id === b.id;
                return (
                  <g key={`radial-${b.id}`}>
                    <line
                      x1={centerX}
                      y1={centerY}
                      x2={b.x}
                      y2={b.y}
                      stroke={isHovered ? b.color : 'rgba(0, 240, 255, 0.35)'}
                      strokeWidth={isHovered ? 2.4 : 1.2}
                      strokeDasharray={allBotsRunning ? '3 3' : 'none'}
                      className={allBotsRunning ? 'signal-line' : ''}
                    />
                    {/* Pulsing signal dot moving outward */}
                    {allBotsRunning && (
                      <circle
                        cx={centerX + (b.x - centerX) * 0.65}
                        cy={centerY + (b.y - centerY) * 0.65}
                        r="2.5"
                        fill={b.color}
                        filter="url(#neonGlow)"
                        className="animate-ping"
                      />
                    )}
                  </g>
                );
              })}

              {/* Concentric Glow Rings around Center Hub */}
              <circle
                cx={centerX}
                cy={centerY}
                r="64"
                fill="none"
                stroke="rgba(0, 240, 255, 0.3)"
                strokeWidth="1.5"
                filter="url(#neonGlow)"
              />
              <circle
                cx={centerX}
                cy={centerY}
                r="52"
                fill="#0a1936"
                stroke="#00f0ff"
                strokeWidth="2"
                filter="url(#neonGlow)"
              />
            </svg>

            {/* Central Glowing Core: AI TRADING ENGINE */}
            <div className="absolute z-20 w-32 h-32 rounded-full bg-gradient-to-tr from-[#07132a] via-[#0d224d] to-[#0a1a3b] border-2 border-cyan-400 shadow-[0_0_30px_rgba(0,240,255,0.4)] flex flex-col items-center justify-center text-center p-2 backdrop-blur-md select-none group cursor-pointer">
              <div className="w-9 h-9 rounded-full bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.5)] mb-1">
                <Cpu className="w-5 h-5 text-cyan-400 animate-spin [animation-duration:12s]" />
              </div>
              <span className="text-[11px] font-black tracking-wider text-white uppercase drop-shadow-[0_0_8px_rgba(0,240,255,0.8)] leading-tight">
                AI TRADING
              </span>
              <span className="text-[11px] font-black tracking-wider text-cyan-300 uppercase leading-tight">
                ENGINE
              </span>
              <span className="text-[8px] font-mono text-slate-300 tracking-tight mt-0.5">
                14 STRATEGY BOTS
              </span>
            </div>

            {/* The 14 Strategy Bot Nodes surrounding the Center Core */}
            {botPositions.map((bot) => {
              const isHovered = hoveredBot?.id === bot.id;
            
return (
                <div
                  key={bot.id}
                  onClick={() => onSelectBot && onSelectBot(bot)}
                  onMouseEnter={() => setHoveredBot(bot)}
                  onMouseLeave={() => setHoveredBot(null)}
                  style={{
                    left: `${(bot.x / hubSize) * 100}%`,
                    top: `${(bot.y / hubSize) * 100}%`,
                    transform: 'translate(-50%, -50%)'
                  }}
                  className="absolute z-30 flex flex-col items-center cursor-pointer transition-all duration-200 group"
                  title={`${bot.id}. ${bot.name} - ${bot.asset} (${bot.strategy})`}
                >
                  {/* Top Badge: Bot Number (1..14) */}
                  <span
                    className="text-[9px] font-mono font-black text-white px-1.5 py-0.2 rounded-full mb-0.5 shadow-sm"
                    style={{ backgroundColor: bot.color }}
                  >
                    {bot.id}
                  </span>

                  {/* Circular Node Icon Button */}
                  <div
                    style={{
                      borderColor: bot.color,
                      boxShadow: isHovered
                        ? `0 0 16px ${bot.color}, inset 0 0 8px ${bot.color}`
                        : `0 0 8px ${bot.color}40`
                    }}
                    className={`w-9 h-9 rounded-full bg-[#070e1e] border-2 flex items-center justify-center transition-transform group-hover:scale-115 ${
                      isHovered ? 'scale-115' : ''
                    }`}
                  >
                    {/* Render customized domain icons */}
                    {bot.id === 1 && <TrendingUp className="w-4 h-4" style={{ color: bot.color }} />}
                    {bot.id === 2 && <RotateCw className="w-4 h-4" style={{ color: bot.color }} />}
                    {bot.id === 3 && <Zap className="w-4 h-4" style={{ color: bot.color }} />}
                    {bot.id === 4 && <FileText className="w-4 h-4" style={{ color: bot.color }} />}
                    {bot.id === 5 && <TrendingUp className="w-4 h-4" style={{ color: bot.color }} />}
                    {bot.id === 6 && <Layers className="w-4 h-4" style={{ color: bot.color }} />}
                    {bot.id === 7 && <Cpu className="w-4 h-4" style={{ color: bot.color }} />}
                    {bot.id === 8 && <Repeat className="w-4 h-4" style={{ color: bot.color }} />}
                    {bot.id === 9 && <Activity className="w-4 h-4" style={{ color: bot.color }} />}
                    {bot.id === 10 && <BarChart2 className="w-4 h-4" style={{ color: bot.color }} />}
                    {bot.id === 11 && <TrendingUp className="w-4 h-4" style={{ color: bot.color }} />}
                    {bot.id === 12 && <Zap className="w-4 h-4" style={{ color: bot.color }} />}
                    {bot.id === 13 && <Heart className="w-4 h-4" style={{ color: bot.color }} />}
                    {bot.id === 14 && <Globe className="w-4 h-4" style={{ color: bot.color }} />}
                  </div>

                  {/* Strategy Name beneath the node */}
                  <span
                    className={`text-[9.5px] font-bold tracking-tight mt-0.5 text-center whitespace-nowrap transition-colors ${
                      isHovered ? 'text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.8)]' : 'text-slate-300'
                    }`}
                  >
                    {bot.name}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Bottom Caption Pill */}
          <div className="mt-2 text-center z-10">
            <span className="text-[10.5px] font-mono text-cyan-400/90 font-bold tracking-wider">
              14 AUTONOMOUS BOTS • REAL-TIME 9/14 STRICT QUORUM CONSENSUS
            </span>
          </div>
        </div>

        {/* CARD C: LIVE TRADING STATUS & TOP MARKETS (Right Column: 5 cols on desktop) */}
        <div className="lg:col-span-5 bg-[#080e1b]/95 border border-[#16294a] rounded-2xl p-4 flex flex-col justify-between shadow-[0_4px_25px_rgba(0,0,0,0.6)] backdrop-blur-md">
          {/* Header */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-100 tracking-wide">
                Trading Session Status
              </h3>
              {allBotsRunning ? (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-[11px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                  <span>Paper Trading Active</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                  <span>STANDBY — NO LIVE TRADES</span>
                </div>
              )}
            </div>

            {/* 4 Quick Stat Boxes (2x2 Grid) */}
            <div className="grid grid-cols-2 gap-2 mb-3.5">
              {/* Box 1: Active Markets */}
              <div className="bg-[#0b1426] border border-[#1e3a6e]/50 rounded-xl p-2.5 flex items-center gap-2.5 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-medium">Active Markets</div>
                  <div className="text-base font-bold font-mono text-white leading-tight">{activeMarketsCount}</div>
                </div>
              </div>

              {/* Box 2: Active Trades */}
              <div className="bg-[#0b1426] border border-[#1e3a6e]/50 rounded-xl p-2.5 flex items-center gap-2.5 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400 shrink-0">
                  <ArrowUpDown className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-medium">Active Trades</div>
                  <div className="text-base font-bold font-mono text-white leading-tight">{activeTradesCount}</div>
                </div>
              </div>

              {/* Box 3: Total Trades (Today) */}
              <div className="bg-[#0b1426] border border-[#1e3a6e]/50 rounded-xl p-2.5 flex items-center gap-2.5 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-medium">Total Trades (Today)</div>
                  <div className="text-base font-bold font-mono text-white leading-tight">{totalTradesCount}</div>
                </div>
              </div>

              {/* Box 4: Win Rate */}
              <div className="bg-[#0b1426] border border-[#1e3a6e]/50 rounded-xl p-2.5 flex items-center gap-2.5 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                  <Percent className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-medium">Win Rate</div>
                  <div className="text-base font-bold font-mono text-white leading-tight">{winRatePct === 'N/A' ? 'N/A' : `${winRatePct}%`}</div>
                  <div className="text-[9px] text-slate-400 font-mono mt-0.5">{totalTradesCount === 0 ? '0 closed trades' : `${winningTradesCount}W / ${losingTradesCount}L`}</div>
                </div>
              </div>
            </div>

            {/* Highlight Banner: Today's Profit */}
            <div className="bg-[#0b1426] border border-[#1e3a6e]/60 rounded-xl p-3 flex items-center justify-between mb-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
                  <CircleDollarSign className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Today's Profit</div>
                  <div className={`text-lg font-black font-mono leading-tight ${todayProfit > 0 ? 'text-emerald-400' : todayProfit < 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                    ₹ {todayProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                    <span className="text-xs font-bold ml-0.5 opacity-90">{todayProfit >= 0 ? '+' : ''}{profitPct}%</span>
                  </div>
                </div>
              </div>

              {/* Sparkline Indicator */}
              <svg width="70" height="28" className="overflow-visible">
                <path
                  d={todayProfit >= 0 ? "M 2 20 Q 20 18, 35 14 T 68 8" : "M 2 8 Q 20 12, 35 16 T 68 22"}
                  fill="none"
                  stroke={todayProfit > 0 ? "#10b981" : todayProfit < 0 ? "#f43f5e" : "#64748b"}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>

          {/* Sub-Section: Top Markets (Live) (3x3 Grid) */}
          <div className="pt-2 border-t border-[#16294a]/80">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-200 tracking-wide flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                <span>Top Markets</span>
                <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold ${isBrokerConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/40 text-slate-400'}`}>
                  {isBrokerConnected ? 'LIVE' : 'STANDBY'}
                </span>
              </h4>
              <button
                type="button"
                onClick={() => onNavigateTab && onNavigateTab('market-watch')}
                className="text-[10px] font-semibold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer flex items-center gap-0.5"
              >
                View All →
              </button>
            </div>

            {/* 3x3 Grid of Compact Market Cards */}
            <div className="grid grid-cols-3 gap-1.5">
              {topMarketsLive.map((item) => (
                <div
                  key={item.symbol}
                  className="bg-[#091122] border border-[#16294a] rounded-lg p-1.5 flex flex-col justify-between hover:border-cyan-500/40 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9.5px] font-bold text-slate-300 tracking-tight truncate max-w-[58px]">
                      {item.symbol}
                    </span>
                    <span className={`text-[8.5px] font-mono font-bold ${item.isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {item.isPositive ? '+' : ''}{item.changePercent.toFixed(2)}%
                    </span>
                  </div>

                  <div className="flex items-end justify-between mt-1">
                    <span className="text-[10.5px] font-mono font-bold text-white leading-none">
                      {item.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>

                    {/* Mini Bar Chart Indicator */}
                    <div className="flex items-end gap-0.5 h-3">
                      {item.bars.map((bar, bIdx) => (
                        <div
                          key={bIdx}
                          style={{ height: `${(bar / 100) * 12}px` }}
                          className={`w-0.5 rounded-xs ${item.isPositive ? 'bg-emerald-400' : 'bg-rose-400'}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 1.2: AI ENGINE CONTROL PANEL (CLEANLY DOCKED RIGHT BELOW PRIMARY LANDING SECTION)
          Zero overlap, zero blocking of initial startup view
         ========================================================================= */}
      <div className="bg-[#080e1b]/95 border border-[#16294a] rounded-2xl p-4 shadow-[0_4px_25px_rgba(0,0,0,0.6)] backdrop-blur-md">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          {/* Sub-panel 1: Header + START / STOP / RESTART Buttons (4 cols) */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-[#16294a]/80 pb-3 lg:pb-0 lg:pr-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 tracking-wide">
                <Cpu className="w-4 h-4 text-cyan-400" />
                <span>AI Engine Control</span>
              </h3>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>{allBotsRunning ? 'Running' : 'Paused'}</span>
              </div>
            </div>

            {/* 3 Action Buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={onStartAllBots}
                className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 text-xs font-bold transition-all shadow-[0_0_10px_rgba(16,185,129,0.15)] cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-emerald-400" />
                <span>START</span>
              </button>

              <button
                type="button"
                onClick={onStopAllBots}
                className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-400 text-xs font-bold transition-all cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-rose-500" />
                <span>STOP</span>
              </button>

              <button
                type="button"
                onClick={onRestartBots || onStartAllBots}
                className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-bold transition-all cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
                <span>RESTART</span>
              </button>
            </div>
          </div>

          {/* Sub-panel 2: Engine Status Indicators Grid (5 cols) */}
          <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-[#16294a]/80 pb-3 lg:pb-0 lg:pr-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#060c18] border border-[#16294a]/60">
                <span className="text-[11px] text-slate-300">Market Scanning</span>
                <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold ${allBotsRunning ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700/30 text-slate-400'}`}>{engineStatus.marketScanning}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#060c18] border border-[#16294a]/60">
                <span className="text-[11px] text-slate-300">Signal Analysis</span>
                <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold ${allBotsRunning ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700/30 text-slate-400'}`}>{engineStatus.signalAnalysis}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#060c18] border border-[#16294a]/60">
                <span className="text-[11px] text-slate-300">Strategy Voting</span>
                <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold ${allBotsRunning ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700/30 text-slate-400'}`}>{engineStatus.strategyVoting}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#060c18] border border-[#16294a]/60">
                <span className="text-[11px] text-slate-300">Trade Execution</span>
                <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold ${allBotsRunning ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/30 text-slate-400'}`}>{engineStatus.tradeExecution}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#060c18] border border-[#16294a]/60">
                <span className="text-[11px] text-slate-300">Risk Management</span>
                <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-teal-500/20 text-teal-300">Active</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#060c18] border border-[#16294a]/60">
                <span className="text-[11px] text-slate-300">Portfolio Opt</span>
                <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-teal-500/20 text-teal-300">Active</span>
              </div>
            </div>
          </div>

          {/* Sub-panel 3: Market Allocation Donut & Active Trades (3 cols) */}
          <div className="lg:col-span-3 flex items-center justify-between gap-3">
            <div className="relative shrink-0 flex items-center justify-center">
              <svg width={84} height={84} className="rotate-[-90deg]">
                {donutSlices.map((slice, idx) => (
                  <circle
                    key={idx}
                    cx={42}
                    cy={42}
                    r={32}
                    fill="transparent"
                    stroke={slice.color}
                    strokeWidth={11}
                    strokeDasharray={`${(slice.percent / 100) * (2 * Math.PI * 32)} ${2 * Math.PI * 32}`}
                    strokeDashoffset={slice.strokeDashoffset}
                    className="transition-all duration-500 hover:opacity-80"
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xs font-black text-white font-mono leading-none">{activeTradesCount}</span>
                <span className="text-[8px] text-slate-400 font-medium tracking-tight mt-0.5">Active</span>
              </div>
            </div>

            <div className="space-y-1 text-[10.5px] font-medium grow pl-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Market Allocation
              </div>
              {marketAllocation.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-slate-300 text-[10px]">
                  <span className="flex items-center gap-1.5 truncate">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="truncate">{item.name}</span>
                  </span>
                  <span className="font-mono text-slate-200 font-bold ml-1">{item.percent}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 1.5: REAL-TIME MARKET SENTIMENT & DECISION ENGINE CONTEXT
         ========================================================================= */}
      <div className="flex items-center justify-between px-1 py-0.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            Decision Engine Sentiment Context
          </span>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#0d1e3d] text-cyan-300 border border-cyan-500/30">
            {currentSentiment.classification} ({currentSentiment.score}/100)
          </span>
          <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
            • Browser fetch streaming live Fear & Greed Index
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigateTab && onNavigateTab('trading-dashboard')}
            className="text-xs font-semibold flex items-center gap-1.5 py-1 px-3 rounded-lg bg-gradient-to-r from-cyan-600/30 to-blue-600/30 hover:from-cyan-600/50 hover:to-blue-600/50 text-cyan-200 border border-cyan-400/50 shadow-[0_0_12px_rgba(0,240,255,0.2)] transition-all cursor-pointer"
          >
            <TrendingUp className="w-3.5 h-3.5 text-cyan-300" />
            <span>Live Equity & Positions ↗</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHeatmap(!showHeatmap)}
            className={`text-xs font-semibold flex items-center gap-1.5 py-1 px-3 rounded-lg border transition-all cursor-pointer shadow-sm ${
              showHeatmap
                ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400 shadow-[0_0_12px_rgba(0,240,255,0.3)]'
                : 'text-cyan-400 hover:text-cyan-300 bg-[#0a1428] hover:bg-[#0e1d3a] border-[#1a3360]'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-cyan-400" />
            <span>{showHeatmap ? 'Hide Market Heatmap ▴' : 'Market Heatmap (Top 50) ▾'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSentimentWidget(!showSentimentWidget)}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 py-1 px-2.5 rounded-lg bg-[#0a1428] hover:bg-[#0e1d3a] border border-[#1a3360] transition-colors cursor-pointer shadow-sm"
          >
            <Sliders className="w-3 h-3 text-cyan-400" />
            <span>{showSentimentWidget ? 'Collapse Sentiment ▴' : 'Expand Sentiment ▾'}</span>
          </button>
        </div>
      </div>

      {showSentimentWidget && (
        <div className="animate-fadeIn">
          <MarketSentimentWidget
            compact={false}
            onSentimentChange={(data) => setCurrentSentiment(data)}
          />
        </div>
      )}

      {showHeatmap && (
        <div className="animate-fadeIn">
          <MarketHeatmap
            tickers={[]}
            onSelectAsset={(asset) => onNavigateTab && onNavigateTab('market-watch')}
          />
        </div>
      )}

      {/* =========================================================================
          SECTION 2: MIDDLE METRICS BANNER (8 KPI CARDS ROW)
         ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {/* KPI 1: Today's Profit */}
        <div className="bg-[#080e1b]/95 border border-[#16294a] rounded-xl p-3 flex items-center gap-2.5 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="overflow-hidden">
            <div className="text-[9.5px] text-slate-400 font-medium truncate">Today's Profit</div>
            <div className={`text-xs font-black font-mono truncate ${todayProfit > 0 ? 'text-emerald-400' : todayProfit < 0 ? 'text-rose-400' : 'text-slate-300'}`}>
              ₹ {todayProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[9px] font-mono font-bold text-slate-400">{todayProfit >= 0 ? '+' : ''}{profitPct}%</div>
          </div>
        </div>

        {/* KPI 2: Total Trades */}
        <div className="bg-[#080e1b]/95 border border-[#16294a] rounded-xl p-3 flex items-center gap-2.5 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Award className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[9.5px] text-slate-400 font-medium">Total Trades</div>
            <div className="text-sm font-black font-mono text-white">{totalTradesCount}</div>
          </div>
        </div>

        {/* KPI 3: Winning Trades */}
        <div className="bg-[#080e1b]/95 border border-[#16294a] rounded-xl p-3 flex items-center gap-2.5 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[9.5px] text-slate-400 font-medium">Winning Trades</div>
            <div className="text-xs font-black font-mono text-emerald-400">{winningTradesCount} ({winRatePct === 'N/A' ? 'N/A' : `${winRatePct}%`})</div>
          </div>
        </div>

        {/* KPI 4: Losing Trades */}
        <div className="bg-[#080e1b]/95 border border-[#16294a] rounded-xl p-3 flex items-center gap-2.5 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
            <XCircle className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[9.5px] text-slate-400 font-medium">Losing Trades</div>
            <div className="text-xs font-black font-mono text-rose-400">{losingTradesCount} ({winRatePct === 'N/A' ? 'N/A' : `${(100 - Number(winRatePct)).toFixed(1)}%`})</div>
          </div>
        </div>

        {/* KPI 5: Active Trades */}
        <div className="bg-[#080e1b]/95 border border-[#16294a] rounded-xl p-3 flex items-center gap-2.5 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400 shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[9.5px] text-slate-400 font-medium">Active Trades</div>
            <div className="text-sm font-black font-mono text-white">{activeTradesCount}</div>
          </div>
        </div>

        {/* KPI 6: Active Markets */}
        <div className="bg-[#080e1b]/95 border border-[#16294a] rounded-xl p-3 flex items-center gap-2.5 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[9.5px] text-slate-400 font-medium">Active Markets</div>
            <div className="text-sm font-black font-mono text-white">{activeMarketsCount}</div>
          </div>
        </div>

        {/* KPI 7: Stocks Traded */}
        <div className="bg-[#080e1b]/95 border border-[#16294a] rounded-xl p-3 flex items-center gap-2.5 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <BarChart2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[9.5px] text-slate-400 font-medium">Stocks Traded</div>
            <div className="text-sm font-black font-mono text-white">{stocksTradedCount}</div>
          </div>
        </div>

        {/* KPI 8: Capital Growth */}
        <div className="bg-[#080e1b]/95 border border-[#16294a] rounded-xl p-3 flex items-center gap-2.5 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="overflow-hidden">
            <div className="text-[9.5px] text-slate-400 font-medium truncate">Capital Growth</div>
            <div className="text-[10px] font-black font-mono text-slate-200 truncate">
              {capitalGrowthText}
            </div>
            <div className="text-[9px] font-mono font-bold text-slate-400">{capitalGrowthPct}</div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 2.5: COMPACT INSTITUTIONAL RISK ATTRIBUTION & RMS GUARDRAILS DOCK
         ========================================================================= */}
      <div className="bg-[#080e1b]/95 border border-[#16294a] rounded-2xl p-4 shadow-[0_4px_25px_rgba(0,0,0,0.6)] backdrop-blur-md space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#16294a]/80">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-mono font-black text-white uppercase tracking-wider flex items-center gap-2">
                <span>RMS Risk Attribution &amp; Capital Guardrails</span>
                <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 font-mono font-bold">
                  ARMED • 1.50% HURDLE
                </span>
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[10.5px] font-mono text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Watchdog 2.5s Cycle Active</span>
            </span>
            <span>•</span>
            <span className="text-cyan-300">Auto-Square-Off Ready</span>
          </div>
        </div>

        {/* 5-Metric Risk Attribution Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {/* Card 1: Current Market Exposure */}
          <div className="bg-[#091226] border border-[#16294a] rounded-xl p-2.5 flex flex-col justify-between">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Current Market Exposure
            </span>
            <div className="my-1">
              <div className="text-sm font-black font-mono text-white">
                ₹ {currentExposure.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[9.5px] font-mono text-slate-400 mt-0.5">
                {positions.length > 0 ? `${positions.length} Active Position(s)` : 'Flat Book (100% Cash)'}
              </div>
            </div>
            <div className="text-[9px] font-mono text-cyan-400">
              Max Cap: ₹1,00,000 Base
            </div>
          </div>

          {/* Card 2: Capital At Risk */}
          <div className="bg-[#091226] border border-[#16294a] rounded-xl p-2.5 flex flex-col justify-between">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Capital At Risk (2% Rule)
            </span>
            <div className="my-1">
              <div className={`text-sm font-black font-mono ${capitalAtRisk > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                ₹ {capitalAtRisk.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[9.5px] font-mono text-slate-400 mt-0.5">
                Hard Stop-Loss Sizing Cap
              </div>
            </div>
            <div className="text-[9px] font-mono text-emerald-400">
              {riskBudgetUtilizationPct}% Budget Utilized
            </div>
          </div>

          {/* Card 3: Risk Budget Utilization */}
          <div className="bg-[#091226] border border-[#16294a] rounded-xl p-2.5 flex flex-col justify-between">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Risk Budget Utilization
            </span>
            <div className="my-1">
              <div className="text-sm font-black font-mono text-cyan-300">
                {riskBudgetUtilizationPct}%
              </div>
              <div className="w-full h-1.5 bg-[#102242] rounded-full mt-1 overflow-hidden">
                <div
                  style={{ width: `${Math.min(100, Number(riskBudgetUtilizationPct))}%` }}
                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full"
                />
              </div>
            </div>
            <div className="text-[9px] font-mono text-slate-400">
              Max ₹20,000 Portfolio Allocation
            </div>
          </div>

          {/* Card 4: Daily Loss Limit & Allowance */}
          <div className="bg-[#091226] border border-[#16294a] rounded-xl p-2.5 flex flex-col justify-between">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Daily Loss Limit
            </span>
            <div className="my-1">
              <div className="text-sm font-black font-mono text-slate-200">
                ₹ {MAX_DAILY_LOSS_LIMIT.toLocaleString('en-IN')}
              </div>
              <div className="text-[9.5px] font-mono text-emerald-400 mt-0.5">
                Remaining: ₹ {remainingLossAllowance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="text-[9px] font-mono text-slate-400">
              Auto Square-Off at Breached
            </div>
          </div>

          {/* Card 5: Largest Risk Contributors */}
          <div className="bg-[#091226] border border-[#16294a] rounded-xl p-2.5 flex flex-col justify-between col-span-2 sm:col-span-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Largest Risk Contributors
            </span>
            <div className="my-1 overflow-hidden">
              {largestRiskContributors.length > 0 ? (
                <div className="space-y-0.5 text-[10px] font-mono truncate">
                  {largestRiskContributors.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between truncate">
                      <span className="text-white font-bold truncate max-w-[65px]">{p.symbol}</span>
                      <span className={Number(p.pnl) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {Number(p.pnl) >= 0 ? '+' : ''}₹{Number(p.pnl || 0).toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 py-1">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>100% Capital Preserved</span>
                </div>
              )}
            </div>
            <div className="text-[9px] font-mono text-slate-400">
              {positions.length} Open Exposure Node(s)
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 3: REORGANIZED UNIFIED DASHBOARD CONTAINER
          Integrated Tabs: Live Executions (13 cols full width) | Capital Growth | Market Wise Performance
          Optional side-by-side split view available on wide screens
         ========================================================================= */}
      <div className="bg-[#080e1b]/95 border border-[#16294a] rounded-2xl p-4 sm:p-5 shadow-[0_4px_25px_rgba(0,0,0,0.6)] backdrop-blur-md space-y-4">
        {/* Navigation & Tab Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#16294a]">
          {/* Left: Tab Switcher */}
          <div className="flex items-center bg-[#060c18] p-1 rounded-xl border border-[#16294a]/80">
            <button
              type="button"
              onClick={() => { setBottomTab('TRADES'); setIsSplitView(false); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                bottomTab === 'TRADES' && !isSplitView
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Live Executions &amp; History</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
                bottomTab === 'TRADES' && !isSplitView ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
              }`}>
                {filteredTrades.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => { setBottomTab('GROWTH'); setIsSplitView(false); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                bottomTab === 'GROWTH' && !isSplitView
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Capital Growth &amp; Equity Curve</span>
            </button>

            <button
              type="button"
              onClick={() => { setBottomTab('MARKETS'); setIsSplitView(false); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                bottomTab === 'MARKETS' && !isSplitView
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Market Wise Performance</span>
            </button>
          </div>

          {/* Right: Controls & View Mode Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Split View Toggle for wide displays */}
            <button
              type="button"
              onClick={() => setIsSplitView(!isSplitView)}
              className={`hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border transition-all cursor-pointer ${
                isSplitView
                  ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400 shadow-[0_0_10px_rgba(0,240,255,0.25)]'
                  : 'bg-[#091326] text-slate-400 hover:text-slate-200 border-[#16294a]'
              }`}
              title="Toggle Multi-Container Side-by-Side Split View"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>{isSplitView ? 'Split View Active' : 'Split View'}</span>
            </button>

            {(bottomTab === 'TRADES' || isSplitView) && (
              <>
                {/* Filter Tabs */}
                <div className="flex items-center bg-[#091326] p-0.5 rounded-lg border border-[#16294a]">
                  <button
                    type="button"
                    onClick={() => setSelectedTradeFilter('ALL')}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                      selectedTradeFilter === 'ALL'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All ({totalTradesCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTradeFilter('PROFITS')}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                      selectedTradeFilter === 'PROFITS'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-emerald-400'
                    }`}
                  >
                    Profits ({winningTradesCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTradeFilter('LOSSES')}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                      selectedTradeFilter === 'LOSSES'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-rose-400'
                    }`}
                  >
                    Losses ({losingTradesCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTradeFilter('ACTIVE')}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                      selectedTradeFilter === 'ACTIVE'
                        ? 'bg-cyan-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-cyan-300'
                    }`}
                  >
                    Active ({activeTradesCount})
                  </button>
                </div>

                {/* Dropdowns */}
                <select
                  value={selectedMarketFilter}
                  onChange={(e) => setSelectedMarketFilter(e.target.value)}
                  className="bg-[#091326] border border-[#16294a] rounded-lg px-2 py-1 text-xs text-slate-300 font-medium cursor-pointer focus:outline-none focus:border-cyan-400"
                >
                  <option value="All">All Markets</option>
                  <option value="NSE">NSE</option>
                  <option value="BSE">BSE</option>
                  <option value="MCX">MCX</option>
                </select>

                <select
                  value={selectedTypeFilter}
                  onChange={(e) => setSelectedTypeFilter(e.target.value)}
                  className="bg-[#091326] border border-[#16294a] rounded-lg px-2 py-1 text-xs text-slate-300 font-medium cursor-pointer focus:outline-none focus:border-cyan-400"
                >
                  <option value="All">All Types</option>
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>

                <select
                  value={selectedStrategyFilter}
                  onChange={(e) => setSelectedStrategyFilter(e.target.value)}
                  className="bg-[#091326] border border-[#16294a] rounded-lg px-2 py-1 text-xs text-slate-300 font-medium cursor-pointer focus:outline-none focus:border-cyan-400 max-w-[110px] truncate"
                >
                  <option value="All">All Strategies</option>
                  <option value="Momentum">Momentum</option>
                  <option value="Scalping">Scalping</option>
                  <option value="Mean Reversion">Mean Reversion</option>
                  <option value="News Sentiment">News Sentiment</option>
                  <option value="Swing Trading">Swing Trading</option>
                  <option value="Grid Trading">Grid Trading</option>
                  <option value="AI Prediction">AI Prediction</option>
                  <option value="Trend Following">Trend Following</option>
                  <option value="Arbitrage">Arbitrage</option>
                  <option value="Multi Market">Multi Market</option>
                </select>

                {/* Export Button */}
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="flex items-center gap-1.5 bg-[#091326] hover:bg-[#102242] border border-[#16294a] hover:border-cyan-500/50 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-semibold transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Export</span>
                </button>
              </>
            )}

            {bottomTab === 'GROWTH' && !isSplitView && (
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
                  todayProfit > 0
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : todayProfit < 0
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                }`}>
                  Capital: ₹ {Math.round(currentCapital).toLocaleString('en-IN')} ({capitalGrowthPct})
                </span>
              </div>
            )}

            {bottomTab === 'MARKETS' && !isSplitView && (
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-300 bg-[#091326] border border-[#16294a] px-2.5 py-1 rounded-lg">
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                <span>Multi-Market Indian Asset Allocation</span>
              </div>
            )}
          </div>
        </div>

        {/* Tab Content Display */}
        {isSplitView ? (
          /* Split View Container for Wide Screens */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-8 overflow-hidden">
              {renderTradesTable()}
            </div>
            <div className="lg:col-span-4 space-y-4">
              {renderCapitalGrowthCard()}
              {renderMarketWiseCard()}
            </div>
          </div>
        ) : (
          /* Tabbed Container (Default: 100% Width Clean View) */
          <div>
            {bottomTab === 'TRADES' && renderTradesTable()}
            {bottomTab === 'GROWTH' && renderCapitalGrowthCard()}
            {bottomTab === 'MARKETS' && renderMarketWiseCard()}
          </div>
        )}
      </div>
    </div>
  );
}