import React, { useState } from 'react';
import { Cpu, CheckCircle2, ChevronDown, Filter, Zap, ArrowUpRight, ShieldCheck, Activity, BarChart2 } from 'lucide-react';

export default function DecisionMeshHub({
  bots,
  allBotsRunning,
  selectedCategory,
  setSelectedCategory,
  onSelectBot,
  executionMode = 'PAPER',
  brokerAvailableCash = 0.00,
  isBrokerConnected = false
}) {
  const [hoveredBotId, setHoveredBotId] = useState(null);

  // SVG dimensions for a wide, spacious node bus
  const nodeCount = 14;
  const width = 840;
  const height = 125;
  const hubX = width / 2;
  const hubY = 96;

  // Generate x coordinates for the 14 nodes across spacious width
  const nodes = bots.map((bot, index) => {
    const padding = 28;
    const availableWidth = width - padding * 2;
    const x = padding + (index * (availableWidth / (nodeCount - 1)));
    const arcOffset = Math.sin((index / (nodeCount - 1)) * Math.PI) * 14;
    const y = 22 - arcOffset;
    return {
      ...bot,
      x,
      y,
      index: index + 1
    };
  });

  // Calculate dynamic metrics from bots
  const totalAllocatedCapital = bots.reduce((acc, b) => acc + (Number(b.allocatedCapital) || 0), 0);
  const runningBots = bots.filter((b) => b.status === 'RUNNING');
  const liveExecutingBots = bots.filter((b) => b.status === 'RUNNING' && (Number(b.allocatedCapital) || 0) > 0);
  const totalPnl = bots.reduce((acc, b) => acc + (b.pnlToday || 0), 0);
  const totalTradesCount = bots.reduce((acc, b) => acc + (b.trades || 0), 0);
  const avgWinRate = totalTradesCount > 0
    ? Math.round(bots.reduce((acc, b) => acc + (b.winRate || 0), 0) / bots.length)
    : 0;

  return (
    <div className="space-y-3.5 select-none">
      {/* 1. Spacious Dedicated Container for the Bot Decision Network Visualizer */}
      <div className="glass-panel rounded-2xl p-5 border border-[#1e3a6e]/60 shadow-[0_4px_25px_rgba(0,0,0,0.6)] relative overflow-hidden">
        {/* Background ambient glow */}
        <div className="absolute top-0 left-1/4 w-96 h-36 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute top-0 right-1/4 w-96 h-36 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Top Header & Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2 tracking-wide">
              <span className={`w-2.5 h-2.5 rounded-full ${allBotsRunning ? 'bg-cyan-400 shadow-[0_0_8px_#00f0ff]' : 'bg-amber-400 shadow-[0_0_8px_#f59e0b]'}`}></span>
              Bot Decision Network <span className="text-cyan-400 font-semibold">(14 Bots Configured)</span>
            </h2>

            {/* Legend */}
            <div className="hidden md:flex items-center gap-3.5 text-[11px] font-medium text-slate-300 ml-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]"></span>
                Buy Signal
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_6px_#f43f5e]"></span>
                Sell Signal
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]"></span>
                Hold
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rotate-45 bg-cyan-400 shadow-[0_0_6px_#00f0ff]"></span>
                Connected
              </span>
            </div>
          </div>

          {/* Filter Dropdown */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                aria-label="Filter assets"
                className="appearance-none bg-[#0e1b38] hover:bg-[#122349] border border-[#1e3a6e] hover:border-cyan-500/50 text-xs font-semibold text-slate-200 py-1.5 pl-3 pr-8 rounded-lg cursor-pointer focus:outline-none focus:border-cyan-400 transition-all shadow-sm"
              >
                <option value="All">All Assets</option>
                <option value="Indices">Indices</option>
                <option value="Equities">Equities</option>
                <option value="Commodities">Commodities</option>
                <option value="Derivatives">Derivatives</option>
                <option value="Crypto">Crypto & FX</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Spacious Central SVG Visual Mesh Hub */}
        <div className="relative flex flex-col items-center justify-center pt-2 pb-1">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full max-w-[800px] h-auto overflow-visible select-none"
          >
            <defs>
              <linearGradient id="lineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.4" />
              </linearGradient>

              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Connecting Curved Lines from each of the 14 nodes to central AI Engine */}
            {nodes.map((node) => {
              const cp1x = node.x;
              const cp1y = node.y + 42;
              const cp2x = hubX + (node.x - hubX) * 0.35;
              const cp2y = hubY - 20;

              const isHighlighted = hoveredBotId === node.id;
              const strokeColor =
                !allBotsRunning
                  ? 'rgba(100, 116, 139, 0.4)'
                  : node.action === 'BUY'
                  ? '#10b981'
                  : node.action === 'SELL'
                  ? '#f43f5e'
                  : '#f59e0b';

              return (
                <g key={`path-${node.id}`}>
                  <path
                    d={`M ${node.x} ${node.y + 12} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${hubX} ${hubY - 18}`}
                    fill="none"
                    stroke={isHighlighted ? '#00f0ff' : 'rgba(0, 240, 255, 0.25)'}
                    strokeWidth={isHighlighted ? 2.5 : 1.2}
                    className="transition-all duration-300"
                  />
                  {/* Flowing animated dash pulse if running */}
                  {allBotsRunning && (
                    <path
                      d={`M ${node.x} ${node.y + 12} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${hubX} ${hubY - 18}`}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={1.8}
                      className="signal-line opacity-75"
                    />
                  )}
                </g>
              );
            })}

            {/* 14 Circular Bot Nodes */}
            {nodes.map((node) => {
              const isHovered = hoveredBotId === node.id;
              const actionColor =
                !allBotsRunning
                  ? '#475569'
                  : node.action === 'BUY'
                  ? '#10b981'
                  : node.action === 'SELL'
                  ? '#f43f5e'
                  : '#f59e0b';

              return (
                <g
                  key={`node-${node.id}`}
                  className="cursor-pointer group"
                  onMouseEnter={() => setHoveredBotId(node.id)}
                  onMouseLeave={() => setHoveredBotId(null)}
                  onClick={() => onSelectBot && onSelectBot(node)}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isHovered ? 14 : 11.5}
                    fill="#08142c"
                    stroke={actionColor}
                    strokeWidth={isHovered ? 2.5 : 1.8}
                    className="transition-all duration-200"
                    filter="url(#glow)"
                  />
                  <text
                    x={node.x}
                    y={node.y + 3.8}
                    textAnchor="middle"
                    fill={allBotsRunning ? "#ffffff" : "#94a3b8"}
                    fontSize={isHovered ? "11" : "9.5"}
                    fontWeight="700"
                    fontFamily="monospace"
                  >
                    {node.index}
                  </text>
                </g>
              );
            })}

            {/* Central Hub Base Node Anchor */}
            <circle
              cx={hubX}
              cy={hubY - 18}
              r={5.5}
              fill={allBotsRunning ? "#00f0ff" : "#64748b"}
              filter="url(#glow)"
              className={allBotsRunning ? "animate-pulse" : ""}
            />
          </svg>

          {/* Central AI Decision Engine Card Box */}
          <div className="relative -mt-6 bg-gradient-to-r from-[#091733]/95 via-[#0d224d]/95 to-[#091733]/95 border border-cyan-500/50 rounded-xl px-6 py-2.5 shadow-[0_0_25px_rgba(0,240,255,0.25)] flex items-center gap-3.5 backdrop-blur-md">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.5)]">
              <Cpu className={`w-5 h-5 ${allBotsRunning ? 'animate-spin' : 'text-slate-400'}`} style={{ animationDuration: '10s' }} />
            </div>
            <div>
              <div className="text-xs font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-200 to-blue-400 uppercase drop-shadow-[0_0_8px_rgba(0,240,255,0.5)]">
                AI DECISION ENGINE
              </div>
              <div className="text-[10px] font-medium text-slate-300 leading-tight">
                All Bots Share Analysis • Real-time Consensus
              </div>
              <div className="text-[9.5px] text-cyan-400 font-mono">
                {allBotsRunning ? 'Active Consensus Processing • 11/13 Quorum Scanning' : 'LIVE PAPER TRADING ACTIVE'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Separate, Well-Padded Cards for the 5 Core Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Metric 1: System Status */}
        <div className="glass-panel rounded-xl p-4 border border-[#1e3a6e]/50 flex flex-col justify-between shadow-md hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>System Status</span>
            <ShieldCheck className={`w-4 h-4 ${executionMode === 'LIVE' ? 'text-rose-400' : 'text-cyan-400'}`} />
          </div>
          <div className="mt-2.5">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${executionMode === 'LIVE' ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e] animate-ping' : 'bg-cyan-400 shadow-[0_0_8px_#00f0ff] animate-pulse'}`}></span>
              <span className={`text-sm font-bold truncate ${executionMode === 'LIVE' ? 'text-rose-400' : 'text-cyan-300'}`}>
                {executionMode === 'LIVE' ? 'LIVE REAL TRADING ACTIVE' : 'LIVE PAPER TRADING ACTIVE'}
              </span>
            </div>
            <div className="text-xs text-slate-400 font-mono mt-1">
              {executionMode === 'LIVE'
                ? (isBrokerConnected ? 'Angel One SmartAPI Bridge • Armed' : 'Broker Disconnected (Authenticate)')
                : '14/14 Bots Online • 11/13 Quorum'}
            </div>
          </div>
        </div>

        {/* Metric 2: Total Portfolio */}
        <div className="glass-panel rounded-xl p-4 border border-[#1e3a6e]/50 flex flex-col justify-between shadow-md hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Portfolio</span>
            <span className={`font-bold font-mono text-[10px] px-1.5 py-0.5 rounded border ${
              executionMode === 'LIVE'
                ? (isBrokerConnected ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'bg-rose-500/15 text-rose-300 border-rose-500/40')
                : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
            }`}>
              {executionMode === 'LIVE' ? (isBrokerConnected ? 'REAL' : 'OFFLINE') : 'VIRTUAL'}
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-lg font-mono font-bold text-slate-100 leading-none">
              {executionMode === 'LIVE'
                ? (isBrokerConnected ? `₹${(Number(brokerAvailableCash) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹0.00')
                : '₹5,00,000.00'}
            </div>
            <div className="text-xs text-slate-400 font-mono mt-1">
              {executionMode === 'LIVE'
                ? (isBrokerConnected ? 'Verified Broker Capital' : '₹0.00 (Connect Broker in Accounts)')
                : 'Paper Capital (₹4,90,000 Allocated)'}
            </div>
          </div>
        </div>

        {/* Metric 3: Today's P&L */}
        <div className="glass-panel rounded-xl p-4 border border-[#1e3a6e]/50 flex flex-col justify-between shadow-md hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Today's P&L</span>
            <ArrowUpRight className={`w-4 h-4 ${totalPnl > 0 ? 'text-emerald-400' : totalPnl < 0 ? 'text-rose-400' : 'text-slate-400'}`} />
          </div>
          <div className="mt-2.5">
            <div className={`text-lg font-mono font-bold leading-none ${totalPnl > 0 ? 'text-emerald-400' : totalPnl < 0 ? 'text-rose-400' : 'text-slate-300'}`}>
              {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toFixed(2)}
            </div>
            <div className="text-xs text-slate-400 font-mono mt-1">
              ({totalPnl >= 0 ? '+' : ''}0.00% Session ROI)
            </div>
          </div>
        </div>

        {/* Metric 4: Total Trades */}
        <div className="glass-panel rounded-xl p-4 border border-[#1e3a6e]/50 flex flex-col justify-between shadow-md hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Trades</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2.5">
            <div className="text-lg font-mono font-bold text-white leading-none">
              {totalTradesCount}
            </div>
            <div className="text-xs text-slate-400 font-mono mt-1">
              Executed Today
            </div>
          </div>
        </div>

        {/* Metric 5: Success Rate */}
        <div className="glass-panel rounded-xl p-4 border border-[#1e3a6e]/50 flex flex-col justify-between shadow-md hover:border-cyan-500/40 transition-all col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Success Rate</span>
            <BarChart2 className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2.5">
            <div className="text-lg font-mono font-bold text-slate-200 leading-none">
              {avgWinRate}%
            </div>
            <div className="text-xs text-slate-400 font-mono mt-1">
              {totalTradesCount > 0 ? 'Verified Accuracy' : 'No Closed Trades'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
