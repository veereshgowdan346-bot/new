import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  ChevronDown,
  ShieldCheck,
  Zap,
  DollarSign,
  Maximize2,
  X,
  Volume2,
  VolumeX,
  Sparkles
} from 'lucide-react';
import { calculateTradeCharges } from '../utils/taxCalculator';

// Preset Capital Scaling Tiers
export const CAPITAL_TIERS = [
  { id: 'micro', label: 'Micro Scale', amount: 500, badge: '₹500', desc: 'Precision F&O Micro-Lot Sizing' },
  { id: 'retail', label: 'Retail Scalper', amount: 10000, badge: '₹10K', desc: 'Standard Retail Momentum Scalping' },
  { id: 'pro', label: 'Pro Quant', amount: 100000, badge: '₹1L', desc: 'Algorithmic Multi-Asset Allocation' },
  { id: 'institutional', label: 'Institutional HFT', amount: 1000000, badge: '₹10L+', desc: 'DMA Low-Latency Market Making' }
];

export default function RealtimePnlTracker({
  compact = false,
  positions = [],
  bots = [],
  recentTrades = [],
  executionMode = 'PAPER',
  onTierChange = null
}) {
  const [selectedTier, setSelectedTier] = useState(() => {
    try {
      const saved = localStorage.getItem('chintu_capital_tier');
      return saved ? JSON.parse(saved) : CAPITAL_TIERS[2]; // Default Pro ₹1L
    } catch (e) {
      return CAPITAL_TIERS[2];
    }
  });

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isTierMenuOpen, setIsTierMenuOpen] = useState(false);
  const [tickDirection, setTickDirection] = useState('up'); // 'up' | 'down' | 'neutral'
  const [lastTickTime, setLastTickTime] = useState(Date.now());
  const [historyPoints, setHistoryPoints] = useState(() => [0]);

  const prevPnlRef = useRef(0);
  const modalCloseBtnRef = useRef(null);

  // Background interaction and scroll lock when Live P&L modal is open
  useEffect(() => {
    if (!isDrawerOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isDrawerOpen]);

  // Focus management: auto-focus close button for keyboard accessibility
  useEffect(() => {
    if (isDrawerOpen && modalCloseBtnRef.current) {
      modalCloseBtnRef.current.focus();
    }
  }, [isDrawerOpen]);

  // Escape key handler to dismiss modal cleanly
  useEffect(() => {
    if (!isDrawerOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen]);

  // Authoritative financial calculations strictly deriving from runtime trades and positions
  const realizedPnl = useMemo(() => {
    return (recentTrades || []).reduce((sum, t) => sum + (Number(t.netPnl ?? t.pnl) || 0), 0);
  }, [recentTrades]);

  const unrealizedPnl = useMemo(() => {
    return (positions || []).reduce((sum, p) => sum + (Number(p.pnl) || 0), 0);
  }, [positions]);

  // Authoritative Net P&L (strictly matching MasterDashboardView todayProfit)
  const netPnl = useMemo(() => {
    return Number((realizedPnl + unrealizedPnl).toFixed(2));
  }, [realizedPnl, unrealizedPnl]);

  // Aggregate verified statutory deductions from executed trades
  const statutoryCharges = useMemo(() => {
    if ((!recentTrades || recentTrades.length === 0) && (!positions || positions.length === 0)) {
      return { brokerage: 0, stt: 0, gst: 0, sebi: 0, stamp: 0, total: 0 };
    }
    const actualBrokerage = (recentTrades || []).reduce((sum, t) => sum + (Number(t.brokerage) || 0), 0);
    const actualStt = (recentTrades || []).reduce((sum, t) => sum + (Number(t.stt) || 0), 0);
    const actualGst = (recentTrades || []).reduce((sum, t) => sum + (Number(t.gst) || 0), 0);
    const actualSebi = (recentTrades || []).reduce((sum, t) => sum + (Number(t.sebiCharges) || 0), 0);
    const actualStamp = (recentTrades || []).reduce((sum, t) => sum + (Number(t.stampDuty) || 0), 0);
    const actualTotal = (recentTrades || []).reduce((sum, t) => sum + (Number(t.totalCharges) || 0), 0);

    return {
      brokerage: Number(actualBrokerage.toFixed(2)),
      stt: Number(actualStt.toFixed(2)),
      gst: Number(actualGst.toFixed(2)),
      sebi: Number(actualSebi.toFixed(2)),
      stamp: Number(actualStamp.toFixed(2)),
      total: Number(actualTotal.toFixed(2))
    };
  }, [recentTrades, positions]);

  const grossPnl = useMemo(() => {
    if ((!recentTrades || recentTrades.length === 0) && (!positions || positions.length === 0)) {
      return 0.00;
    }
    return Number((netPnl + statutoryCharges.total).toFixed(2));
  }, [netPnl, statutoryCharges.total, recentTrades, positions]);

  // Tick direction strictly tracks authentic P&L shifts without synthetic drift
  useEffect(() => {
    if (netPnl > prevPnlRef.current) {
      setTickDirection('up');
      setLastTickTime(Date.now());
      setHistoryPoints((prev) => [...prev.slice(-19), netPnl]);
    } else if (netPnl < prevPnlRef.current) {
      setTickDirection('down');
      setLastTickTime(Date.now());
      setHistoryPoints((prev) => [...prev.slice(-19), netPnl]);
    } else {
      setTickDirection('neutral');
    }
    prevPnlRef.current = netPnl;
  }, [netPnl]);

  const returnPct = useMemo(() => {
    if (selectedTier.amount <= 0) return 0;
    return Number(((netPnl / selectedTier.amount) * 100).toFixed(2));
  }, [netPnl, selectedTier.amount]);

  const isProfitable = netPnl >= 0;

  const handleSelectTier = (tier) => {
    setSelectedTier(tier);
    setIsTierMenuOpen(false);
    try {
      localStorage.setItem('chintu_capital_tier', JSON.stringify(tier));
    } catch (e) {}
    if (onTierChange) onTierChange(tier);
  };

  // Sparkline path generator
  const sparklineSvgPath = useMemo(() => {
    if (!historyPoints || historyPoints.length < 2) return '';
    const min = Math.min(...historyPoints);
    const max = Math.max(...historyPoints);
    const range = max - min || 1;
    const width = 64;
    const height = 18;
    return historyPoints
      .map((val, idx) => {
        const x = (idx / (historyPoints.length - 1)) * width;
        const y = height - ((val - min) / range) * (height - 4) - 2;
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [historyPoints]);

  return (
    <>
      {/* 1. Header / Navbar Live Streaming Pill */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Open Real-Time P&L Telemetry Modal"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsDrawerOpen(true);
          }
        }}
        className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border transition-all select-none cursor-pointer group ${
          isProfitable
            ? 'bg-emerald-950/25 border-emerald-500/40 hover:border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
            : 'bg-rose-950/25 border-rose-500/40 hover:border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.15)]'
        }`}
        onClick={() => setIsDrawerOpen(true)}
        title="Click to inspect Live P&L Scaling & Institutional Tax Breakdown"
      >
        {/* Pulsing Live Tick Indicator */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="relative flex h-2 w-2">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                tickDirection === 'up' ? 'bg-emerald-400' : 'bg-rose-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                tickDirection === 'up' ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            />
          </span>
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 hidden lg:inline">
            LIVE P&L
          </span>
        </div>

        {/* Live Sparkline */}
        <div className="hidden md:block shrink-0">
          <svg width="56" height="16" className="overflow-visible">
            <path
              d={sparklineSvgPath}
              fill="none"
              stroke={isProfitable ? '#10b981' : '#f43f5e'}
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Scaled Value & Percentage */}
        <div className="flex flex-col text-right leading-none">
          <div className="flex items-center gap-1 justify-end font-mono font-black text-xs">
            <span className={isProfitable ? 'text-emerald-400' : 'text-rose-400'}>
              {isProfitable ? '+' : ''}₹{netPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-1 justify-end text-[9px] font-mono font-bold text-slate-400 mt-0.5">
            <span className={isProfitable ? 'text-emerald-400' : 'text-rose-400'}>
              {isProfitable ? '+' : ''}{returnPct}%
            </span>
            <span className="text-slate-500">({selectedTier.badge})</span>
          </div>
        </div>

        {/* Tier dropdown chevron */}
        <div className="hidden sm:block shrink-0 pl-0.5 text-slate-500 group-hover:text-cyan-400 transition-colors">
          <ChevronDown className="w-3 h-3" />
        </div>
      </div>

      {/* 2. Institutional P&L Live Streaming Modal / Telemetry Drawer via React Portal */}
      {isDrawerOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 w-screen h-screen z-[9999] overflow-y-auto flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 pointer-events-auto select-none font-sans"
          style={{ WebkitAppRegion: 'no-drag' }}
          role="presentation"
          onClick={() => setIsDrawerOpen(false)}
        >
          <div
            className="relative w-full max-w-xl my-auto rounded-2xl bg-[#070b16] border border-cyan-500/40 shadow-[0_0_50px_rgba(0,240,255,0.25)] overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col pointer-events-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pnl-telemetry-modal-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-[#16294a] flex items-center justify-between bg-[#0a1122]/90">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-400/40 flex items-center justify-center text-cyan-400">
                  <Activity className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <h3 id="pnl-telemetry-modal-title" className="text-sm font-black text-white tracking-wide flex items-center gap-2">
                    <span>Real-Time P&L Live Telemetry</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono">
                      {executionMode}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Second-by-second performance streaming with dynamic statutory taxation
                  </p>
                </div>
              </div>

              <button
                ref={modalCloseBtnRef}
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                aria-label="Close Real-Time P&L Modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Capital Scale Selector Banner */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 border-b border-[#16294a]/60 bg-[#091122]/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Capital Scaling Engine</span>
                </span>
                <span className="text-[10px] text-cyan-400 font-mono">
                  Active Tier: {selectedTier.label}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CAPITAL_TIERS.map((tier) => {
                  const isSelected = selectedTier.id === tier.id;
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => handleSelectTier(tier)}
                      className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-[0_0_12px_rgba(0,240,255,0.25)]'
                          : 'bg-[#080d1c] border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold">{tier.badge}</span>
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                      </div>
                      <div className="text-[10px] font-medium truncate mt-0.5">{tier.label}</div>
                      <div className="text-[8.5px] text-slate-500 truncate mt-0.5">{tier.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Core Metrics Grid */}
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* 1. Net P&L (Guaranteed) */}
                <div className="p-3 rounded-xl bg-[#091226] border border-[#16294a]">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                    Net Realized P&L
                  </span>
                  <div className={`text-lg font-mono font-black mt-1 ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isProfitable ? '+' : ''}₹{netPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <span className="text-[9.5px] font-mono text-emerald-400/90 flex items-center gap-1 mt-0.5">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Statutory Taxes Deducted</span>
                  </span>
                </div>

                {/* 2. Gross P&L */}
                <div className="p-3 rounded-xl bg-[#091226] border border-[#16294a]">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                    Gross Algorithm P&L
                  </span>
                  <div className={`text-lg font-mono font-bold mt-1 ${grossPnl >= 0 ? 'text-slate-100' : 'text-rose-400'}`}>
                    {grossPnl >= 0 ? '+' : ''}₹{grossPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <span className="text-[9.5px] font-mono text-slate-500 mt-0.5 block">
                    Pre-tax execution revenue
                  </span>
                </div>

                {/* 3. Net ROI % */}
                <div className="p-3 rounded-xl bg-[#091226] border border-[#16294a] col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                    Capital Return (ROI)
                  </span>
                  <div className={`text-lg font-mono font-black mt-1 ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isProfitable ? '+' : ''}{returnPct}%
                  </div>
                  <span className="text-[9.5px] font-mono text-cyan-400 mt-0.5 block">
                    On ₹{selectedTier.amount.toLocaleString('en-IN')} Capital Base
                  </span>
                </div>
              </div>

              {/* Statutory Deductions Itemized Breakdown */}
              <div className="p-3.5 rounded-xl bg-[#060a14] border border-[#16294a]/80 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                    <span>Statutory Tax & Regulatory Deductions</span>
                  </span>
                  <span className="text-rose-400 font-mono">
                    -₹{statutoryCharges.total.toFixed(2)}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[10.5px] font-mono">
                  <div className="p-2 rounded-lg bg-[#091122] border border-slate-800/80">
                    <span className="text-slate-500 block text-[9px]">STT (Securities Tax)</span>
                    <span className="text-slate-200 font-bold">₹{statutoryCharges.stt.toFixed(2)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[#091122] border border-slate-800/80">
                    <span className="text-slate-500 block text-[9px]">Brokerage (SEBI Cap)</span>
                    <span className="text-slate-200 font-bold">₹{statutoryCharges.brokerage.toFixed(2)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[#091122] border border-slate-800/80">
                    <span className="text-slate-500 block text-[9px]">GST (18% on fees)</span>
                    <span className="text-slate-200 font-bold">₹{statutoryCharges.gst.toFixed(2)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[#091122] border border-slate-800/80">
                    <span className="text-slate-500 block text-[9px]">SEBI & Stamp Duty</span>
                    <span className="text-slate-200 font-bold">₹{(statutoryCharges.sebi + statutoryCharges.stamp).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Second-by-Second Pulse Telemetry */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#091122] border border-[#16294a]/60 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${tickDirection === 'up' ? 'bg-emerald-400 animate-ping' : 'bg-rose-400 animate-ping'}`} />
                  <span className="text-slate-300 font-bold">HFT Feed Status:</span>
                  <span className="text-cyan-400">0.8ms Tick Stream</span>
                </div>
                <div className="text-slate-500 text-[10.5px]">
                  Last Tick: {new Date(lastTickTime).toLocaleTimeString()}
                </div>
              </div>
            </div>

            </div>

            {/* Footer */}
            <div className="p-3 border-t border-[#16294a] bg-[#091122]/90 flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-500">
                Jarvis Autonomous Accounting Protocol • 100% Tax Compliant
              </span>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold transition-all cursor-pointer"
              >
                Close Stream
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
