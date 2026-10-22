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

export default function MasterDashboardView({
  bots = [],
  allBotsRunning = true,
  onStartAllBots,
  onStopAllBots,
  onRestartBots,
  recentTrades = [],
  onSelectBot,
  onNavigateTab,
  executionMode = 'PAPER'
}) {
  const [selectedTradeFilter, setSelectedTradeFilter] = useState('ALL'); // 'ALL' | 'PROFITS' | 'LOSSES' | 'ACTIVE'
  const [selectedMarketFilter, setSelectedMarketFilter] = useState('All');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('All');
  const [selectedStrategyFilter, setSelectedStrategyFilter] = useState('All');
  const [selectedDate, setSelectedDate] = useState('Oct 21, 2026');
  const [hoveredBot, setHoveredBot] = useState(null);
  const [showSentimentWidget, setShowSentimentWidget] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [currentSentiment, setCurrentSentiment] = useState({ score: 68, classification: 'Greed' });

  // Engine Control Status Items
  const [engineStatus, setEngineStatus] = useState({
    marketScanning: 'Live',
    signalAnalysis: 'Live',
    strategyVoting: 'Live',
    tradeExecution: 'Live',
    riskManagement: 'Active',
    portfolioOptimization: 'Active'
  });

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

  let currentOffset = 0;
  const donutSlices = marketAllocation.map((item) => {
    const strokeDasharray = `${(item.percent / 100) * circumference} ${circumference}`;
    const strokeDashoffset = -currentOffset;
    currentOffset += (item.percent / 100) * circumference;
    return {
      ...item,
      strokeDasharray,
      strokeDashoffset
    };
  });

  return (
    <div className="space-y-4 select-none font-sans text-slate-100 animate-fadeIn">
      {/* =========================================================================
          SECTION 1: TOP 3-COLUMN HERO ROW
          Left: AI Engine Control + Market Allocation (Active Trades)
          Center: Central Bot Decision Network (14 Strategy Bots Holographic Ring)
          Right: Live Trading Status + Top Markets (Live)
         ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
        {/* CARD A: AI ENGINE CONTROL (Left Column: 3.5 cols on desktop) */}
        <div className="lg:col-span-3 bg-[#080e1b]/95 border border-[#16294a] rounded-2xl p-4 flex flex-col justify-between shadow-[0_4px_25px_rgba(0,0,0,0.6)] backdrop-blur-md">
          {/* Header */}
          <div>
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 tracking-wide">
                <span>AI Engine Control</span>
              </h3>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Running</span>
              </div>
            </div>

            {/* 3 Action Buttons */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <button
                type="button"
                onClick={onStartAllBots}
                className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 text-xs font-bold transition-all shadow-[0_0_10px_rgba(16,185,129,0.15)] cursor-pointer"
              >
                <Play className="w-3 h-3 fill-emerald-400" />
                <span>START</span>
              </button>

              <button
                type="button"
                onClick={onStopAllBots}
                className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-400 text-xs font-bold transition-all cursor-pointer"
              >
                <Square className="w-3 h-3 fill-rose-500" />
                <span>STOP</span>
              </button>

              <button
                type="button"
                onClick={onRestartBots || onStartAllBots}
                className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-bold transition-all cursor-pointer"
              >
                <RotateCw className="w-3 h-3 text-cyan-400" />
                <span>RESTART</span>
              </button>
            </div>

            {/* Engine Status Indicators List */}
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-[#0d1c38]/50 transition-colors">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="text-slate-400">⚙</span> Market Scanning
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Live
                </span>
              </div>

              <div className="flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-[#0d1c38]/50 transition-colors">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="text-slate-400">🛰</span> Signal Analysis
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Live
                </span>
              </div>

              <div className="flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-[#0d1c38]/50 transition-colors">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="text-slate-400">⚖</span> Strategy Voting
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Live
                </span>
              </div>

              <div className="flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-[#0d1c38]/50 transition-colors">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="text-slate-400">⚡</span> Trade Execution
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Live
                </span>
              </div>

              <div className="flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-[#0d1c38]/50 transition-colors">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="text-slate-400">🛡</span> Risk Management
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  Active
                </span>
              </div>

              <div className="flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-[#0d1c38]/50 transition-colors">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="text-slate-400">📊</span> Portfolio Optimization
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  Active
                </span>
              </div>

              <div
                onClick={() => setShowSentimentWidget(!showSentimentWidget)}
                className="flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-[#0d1c38]/50 transition-colors cursor-pointer group"
                title="Click to toggle Fear & Greed Sentiment widget"
              >
                <span className="flex items-center gap-2 text-slate-300 group-hover:text-cyan-300 transition-colors">
                  <Compass className="w-3.5 h-3.5 text-cyan-400 animate-spin [animation-duration:20s]" /> Market Sentiment
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 group-hover:bg-cyan-500/30">
                  {currentSentiment.classification} ({currentSentiment.score})
                </span>
              </div>
            </div>
          </div>

          {/* Sub-Section: Market Allocation (Active Trades) */}
          <div className="mt-4 pt-3.5 border-t border-[#16294a]/80">
            <h4 className="text-xs font-bold text-slate-200 tracking-wide mb-2.5">
              Market Allocation <span className="text-slate-400 font-normal">(Active Trades)</span>
            </h4>

            <div className="flex items-center justify-between gap-2">
              {/* Donut Chart with Center Text */}
              <div className="relative shrink-0 flex items-center justify-center">
                <svg width={donutSize} height={donutSize} className="rotate-[-90deg]">
                  {donutSlices.map((slice, idx) => (
                    <circle
                      key={idx}
                      cx={donutCenter}
                      cy={donutCenter}
                      r={donutRadius}
                      fill="transparent"
                      stroke={slice.color}
                      strokeWidth={donutStrokeWidth}
                      strokeDasharray={slice.strokeDasharray}
                      strokeDashoffset={slice.strokeDashoffset}
                      className="transition-all duration-500 hover:opacity-80"
                    />
                  ))}
                </svg>
                {/* Center Badge */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-base font-extrabold text-white font-mono leading-none">143</span>
                  <span className="text-[9px] text-slate-400 font-medium tracking-tight mt-0.5">Active Trades</span>
                </div>
              </div>

              {/* Legend List */}
              <div className="space-y-1 text-[11px] font-medium grow pl-1">
                {marketAllocation.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-slate-300">
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="font-mono text-slate-200 font-bold ml-1">{item.percent}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* CARD B: CENTRAL BOT DECISION NETWORK (Center Column: 5.5 cols on desktop) */}
        <div className="lg:col-span-5 bg-[#080e1b]/95 border border-[#16294a] rounded-2xl p-4 flex flex-col items-center justify-center relative overflow-hidden shadow-[0_0_35px_rgba(0,240,255,0.1)] backdrop-blur-md">
          {/* Subtle Cybernetic Background Grid & Radial Glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-900/15 via-[#080e1b]/40 to-transparent pointer-events-none" />

          {/* Holographic Radar Constellation Container */}
          <div className="relative w-full max-w-[420px] aspect-square flex items-center justify-center">
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
          <div className="mt-2 text-center">
            <span className="text-[10px] font-mono text-cyan-400/90 font-medium tracking-wider">
              14 AUTONOMOUS BOTS • REAL-TIME CONSENSUS & ARBITRATION
            </span>
          </div>
        </div>

        {/* CARD C: LIVE TRADING STATUS & TOP MARKETS (Right Column: 3.5 cols on desktop) */}
        <div className="lg:col-span-4 bg-[#080e1b]/95 border border-[#16294a] rounded-2xl p-4 flex flex-col justify-between shadow-[0_4px_25px_rgba(0,0,0,0.6)] backdrop-blur-md">
          {/* Header */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-100 tracking-wide">
                Live Trading Status
              </h3>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Live</span>
              </div>
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
                  <div className="text-base font-bold font-mono text-white leading-tight">32</div>
                </div>
              </div>

              {/* Box 2: Active Trades */}
              <div className="bg-[#0b1426] border border-[#1e3a6e]/50 rounded-xl p-2.5 flex items-center gap-2.5 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400 shrink-0">
                  <ArrowUpDown className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-medium">Active Trades</div>
                  <div className="text-base font-bold font-mono text-white leading-tight">143</div>
                </div>
              </div>

              {/* Box 3: Total Trades (Today) */}
              <div className="bg-[#0b1426] border border-[#1e3a6e]/50 rounded-xl p-2.5 flex items-center gap-2.5 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-medium">Total Trades (Today)</div>
                  <div className="text-base font-bold font-mono text-white leading-tight">267</div>
                </div>
              </div>

              {/* Box 4: Win Rate */}
              <div className="bg-[#0b1426] border border-[#1e3a6e]/50 rounded-xl p-2.5 flex items-center gap-2.5 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                  <Percent className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-medium">Win Rate</div>
                  <div className="text-base font-bold font-mono text-white leading-tight">72.6%</div>
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
                  <div className="text-lg font-black font-mono text-emerald-400 leading-tight">
                    ₹ 24,583.50 <span className="text-xs font-bold text-emerald-400/90 ml-0.5">+2.46%</span>
                  </div>
                </div>
              </div>

              {/* Emerald Upward Sparkline */}
              <svg width="70" height="28" className="overflow-visible">
                <path
                  d="M 2 22 Q 20 18, 35 12 T 68 4"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
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
                Top Markets (Live)
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
            <div className="text-xs font-black font-mono text-emerald-400 truncate">
              ₹ 24,583.50
            </div>
            <div className="text-[9px] font-mono font-bold text-emerald-400/90">+2.46%</div>
          </div>
        </div>

        {/* KPI 2: Total Trades */}
        <div className="bg-[#080e1b]/95 border border-[#16294a] rounded-xl p-3 flex items-center gap-2.5 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Award className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[9.5px] text-slate-400 font-medium">Total Trades</div>
            <div className="text-sm font-black font-mono text-white">267</div>
          </div>
        </div>

        {/* KPI 3: Winning Trades */}
        <div className="bg-[#080e1b]/95 border border-[#16294a] rounded-xl p-3 flex items-center gap-2.5 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[9.5px] text-slate-400 font-medium">Winning Trades</div>
            <div className="text-xs font-black font-mono text-emerald-400">194 (72.6%)</div>
          </div>
        </div>

        {/* KPI 4: Losing Trades */}
        <div className="bg-[#080e1b]/95 border border-[#16294a] rounded-xl p-3 flex items-center gap-2.5 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
            <XCircle className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[9.5px] text-slate-400 font-medium">Losing Trades</div>
            <div className="text-xs font-black font-mono text-rose-400">73 (27.4%)</div>
          </div>
        </div>

        {/* KPI 5: Active Trades */}
        <div className="bg-[#080e1b]/95 border border-[#16294a] rounded-xl p-3 flex items-center gap-2.5 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400 shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[9.5px] text-slate-400 font-medium">Active Trades</div>
            <div className="text-sm font-black font-mono text-white">143</div>
          </div>
        </div>

        {/* KPI 6: Active Markets */}
        <div className="bg-[#080e1b]/95 border border-[#16294a] rounded-xl p-3 flex items-center gap-2.5 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[9.5px] text-slate-400 font-medium">Active Markets</div>
            <div className="text-sm font-black font-mono text-white">32</div>
          </div>
        </div>

        {/* KPI 7: Stocks Traded */}
        <div className="bg-[#080e1b]/95 border border-[#16294a] rounded-xl p-3 flex items-center gap-2.5 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <BarChart2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[9.5px] text-slate-400 font-medium">Stocks Traded</div>
            <div className="text-sm font-black font-mono text-white">56</div>
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
              ₹1,00,000 → ₹1,24,583
            </div>
            <div className="text-[9px] font-mono font-bold text-emerald-400">+24.58%</div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 3: BOTTOM SECTION (2-COLUMN SPLIT)
          Left: Live Trade Executions & History (~70% width)
          Right: Capital Growth + Market Wise Performance (~30% width)
         ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
        {/* LEFT CONTAINER: LIVE TRADE EXECUTIONS & HISTORY (8 cols on desktop) */}
        <div className="lg:col-span-8 bg-[#080e1b]/95 border border-[#16294a] rounded-2xl p-4 shadow-[0_4px_25px_rgba(0,0,0,0.6)] backdrop-blur-md">
          {/* Header & Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3.5">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 tracking-wide">
              <FileText className="w-4 h-4 text-cyan-400" />
              Live Trade Executions & History
            </h3>

            {/* Filter Controls Row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Filter Tabs */}
              <div className="flex items-center bg-[#091326] p-0.5 rounded-lg border border-[#16294a]">
                <button
                  type="button"
                  onClick={() => setSelectedTradeFilter('ALL')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    selectedTradeFilter === 'ALL'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All (267)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTradeFilter('PROFITS')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    selectedTradeFilter === 'PROFITS'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-emerald-400'
                  }`}
                >
                  Profits (194)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTradeFilter('LOSSES')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    selectedTradeFilter === 'LOSSES'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-rose-400'
                  }`}
                >
                  Losses (73)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTradeFilter('ACTIVE')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    selectedTradeFilter === 'ACTIVE'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-cyan-300'
                  }`}
                >
                  Active (143)
                </button>
              </div>

              {/* Dropdowns */}
              <select
                value={selectedMarketFilter}
                onChange={(e) => setSelectedMarketFilter(e.target.value)}
                className="bg-[#091326] border border-[#16294a] rounded-lg px-2.5 py-1 text-xs text-slate-300 font-medium cursor-pointer focus:outline-none focus:border-cyan-400"
              >
                <option value="All">All Markets</option>
                <option value="NSE">NSE</option>
                <option value="BSE">BSE</option>
                <option value="MCX">MCX</option>
              </select>

              <select
                value={selectedTypeFilter}
                onChange={(e) => setSelectedTypeFilter(e.target.value)}
                className="bg-[#091326] border border-[#16294a] rounded-lg px-2.5 py-1 text-xs text-slate-300 font-medium cursor-pointer focus:outline-none focus:border-cyan-400"
              >
                <option value="All">All Types</option>
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>

              <select
                value={selectedStrategyFilter}
                onChange={(e) => setSelectedStrategyFilter(e.target.value)}
                className="bg-[#091326] border border-[#16294a] rounded-lg px-2.5 py-1 text-xs text-slate-300 font-medium cursor-pointer focus:outline-none focus:border-cyan-400 max-w-[110px] truncate"
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

              {/* Date Button */}
              <div className="flex items-center gap-1.5 bg-[#091326] border border-[#16294a] rounded-lg px-2.5 py-1 text-xs text-slate-300 font-medium">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{selectedDate}</span>
              </div>

              {/* Export Button */}
              <button
                type="button"
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 bg-[#091326] hover:bg-[#102242] border border-[#16294a] hover:border-cyan-500/50 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-semibold transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                <span>Export</span>
              </button>
            </div>
          </div>

          {/* High Density Table */}
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#16294a] text-slate-400 text-[10.5px] font-bold uppercase tracking-wider">
                  <th className="py-2 px-2">#</th>
                  <th className="py-2 px-2.5">Time</th>
                  <th className="py-2 px-2.5">Symbol</th>
                  <th className="py-2 px-2">Market</th>
                  <th className="py-2 px-2">Type</th>
                  <th className="py-2 px-2 text-right">Qty</th>
                  <th className="py-2 px-2.5 text-right">Entry Price</th>
                  <th className="py-2 px-2.5 text-right">Exit Price</th>
                  <th className="py-2 px-2.5 text-right">P&L (₹)</th>
                  <th className="py-2 px-2 text-right">P&L %</th>
                  <th className="py-2 px-2.5">Strategy</th>
                  <th className="py-2 px-2 text-center">Status</th>
                  <th className="py-2 px-2 text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#16294a]/40 font-mono text-[11px]">
                {filteredTrades.map((trade, idx) => {
                  const isProfit = trade.pnl > 0;
                  const isLoss = trade.pnl < 0;
                  return (
                    <tr
                      key={trade.id || idx}
                      className="hover:bg-[#0c1833]/60 transition-colors group"
                    >
                      <td className="py-2 px-2 text-slate-500 font-bold">{trade.id || idx + 1}</td>
                      <td className="py-2 px-2.5 text-slate-300 whitespace-nowrap">{trade.time}</td>
                      <td className="py-2 px-2.5 font-bold font-sans text-white whitespace-nowrap">
                        {trade.symbol}
                      </td>
                      <td className="py-2 px-2 text-slate-400 font-medium font-sans">{trade.market}</td>
                      <td className="py-2 px-2">
                        <span
                          className={`font-black uppercase px-1.5 py-0.5 rounded text-[9.5px] font-mono ${
                            trade.type === 'BUY'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          }`}
                        >
                          {trade.type}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right text-slate-200">{trade.qty}</td>
                      <td className="py-2 px-2.5 text-right text-slate-300">
                        {trade.entryPrice.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                      </td>
                      <td className="py-2 px-2.5 text-right text-slate-300">
                        {trade.exitPrice.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                      </td>
                      <td
                        className={`py-2 px-2.5 text-right font-bold ${
                          isProfit ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-slate-300'
                        }`}
                      >
                        {isProfit ? '+' : ''}
                        {trade.pnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        className={`py-2 px-2 text-right font-bold ${
                          isProfit ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-slate-300'
                        }`}
                      >
                        {isProfit ? '+' : ''}
                        {trade.pnlPercent.toFixed(2)}%
                      </td>
                      <td className="py-2 px-2.5 text-slate-300 font-sans whitespace-nowrap">
                        {trade.strategy}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span className="px-2 py-0.5 rounded text-[9.5px] font-sans font-medium bg-[#112347] text-slate-300">
                          {trade.status}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right text-slate-400 font-sans">{trade.duration}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT CONTAINER: CAPITAL GROWTH + MARKET WISE PERFORMANCE (4 cols on desktop) */}
        <div className="lg:col-span-4 space-y-3.5">
          {/* Card 1: Capital Growth (From Initial Amount) */}
          <div className="bg-[#080e1b]/95 border border-[#16294a] rounded-2xl p-4 shadow-[0_4px_25px_rgba(0,0,0,0.6)] backdrop-blur-md">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 tracking-wide">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Capital Growth <span className="text-[10px] text-slate-400 font-normal">(From Initial Amount)</span>
              </h4>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                ₹ 1,24,583 <span className="text-[10px] ml-0.5">+24.58%</span>
              </span>
            </div>

            {/* Area/Line Chart */}
            <div className="relative pt-1 pb-1">
              <div className="flex">
                {/* Y-Axis Labels */}
                <div className="flex flex-col justify-between text-[9px] font-mono text-slate-400 pr-2 h-36 text-right select-none">
                  <span>₹ 1.5L</span>
                  <span>₹ 1.0L</span>
                  <span>₹ 75K</span>
                  <span>₹ 50K</span>
                  <span>₹ 25K</span>
                </div>

                {/* SVG Graph Area */}
                <div className="grow relative h-36">
                  <svg viewBox="0 0 300 130" className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="growthAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal gridlines */}
                    <line x1="0" y1="10" x2="300" y2="10" stroke="#16294a" strokeWidth="0.8" strokeDasharray="3 3" />
                    <line x1="0" y1="40" x2="300" y2="40" stroke="#16294a" strokeWidth="0.8" strokeDasharray="3 3" />
                    <line x1="0" y1="70" x2="300" y2="70" stroke="#16294a" strokeWidth="0.8" strokeDasharray="3 3" />
                    <line x1="0" y1="100" x2="300" y2="100" stroke="#16294a" strokeWidth="0.8" strokeDasharray="3 3" />

                    {/* Shaded Area Fill */}
                    <polygon
                      points="0,110 0,90 60,82 130,65 210,48 300,24 300,120 0,120"
                      fill="url(#growthAreaGrad)"
                    />

                    {/* Smooth Growth Line */}
                    <path
                      d="M 0 90 Q 60 82, 130 65 T 210 48 T 300 24"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />

                    {/* Terminal Data Point with Glow */}
                    <circle cx="300" cy="24" r="4.5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                  </svg>
                </div>
              </div>

              {/* X-Axis Dates */}
              <div className="flex justify-between text-[9px] font-mono text-slate-400 pl-10 pt-1.5 select-none">
                <span>Oct 1</span>
                <span>Oct 5</span>
                <span>Oct 10</span>
                <span>Oct 15</span>
                <span>Oct 21</span>
              </div>
            </div>
          </div>

          {/* Card 2: Market Wise Performance */}
          <div className="bg-[#080e1b]/95 border border-[#16294a] rounded-2xl p-4 shadow-[0_4px_25px_rgba(0,0,0,0.6)] backdrop-blur-md">
            <h4 className="text-xs font-bold text-slate-200 tracking-wide mb-3 flex items-center gap-1.5">
              <BarChart2 className="w-4 h-4 text-cyan-400" />
              Market Wise Performance
            </h4>

            {/* Performance Table */}
            <div className="space-y-2.5">
              {/* Header */}
              <div className="grid grid-cols-5 text-[9.5px] font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-[#16294a]">
                <span className="col-span-1">Market</span>
                <span className="text-center">Trades</span>
                <span className="text-center">Win Rate</span>
                <span className="text-right">Profit (₹)</span>
                <span className="text-right">Profit %</span>
              </div>

              {/* Rows */}
              {marketWisePerformance.map((item) => (
                <div key={item.market} className="grid grid-cols-5 items-center text-xs text-slate-200 font-mono py-1">
                  <span className="col-span-1 font-sans font-bold text-slate-100 text-[11px] truncate">
                    {item.market}
                  </span>
                  <span className="text-center text-slate-400">{item.trades}</span>
                  <div className="flex flex-col items-center">
                    <span className="text-[10.5px] font-bold">{item.winRate}%</span>
                    <div className="w-12 h-1 bg-[#102242] rounded-full mt-0.5 overflow-hidden">
                      <div
                        style={{ width: `${item.winRate}%`, backgroundColor: item.color }}
                        className="h-full rounded-full"
                      />
                    </div>
                  </div>
                  <span className="text-right font-bold text-emerald-400 text-[11px]">
                    {item.profit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-right font-bold text-emerald-400 text-[11px]">
                    +{item.profitPercent.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
