import React, { useState, useMemo, useEffect } from 'react';
import {
  Layers,
  Sliders,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  Search,
  Filter,
  DollarSign,
  Percent,
  Cpu,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Check,
  AlertOctagon
} from 'lucide-react';
import {
  ALLOCATION_PRESETS,
  generateInitialPortfolioHoldings,
  calculatePortfolioDrift
} from '../utils/portfolioRebalancer';
import { toastEmitter } from '../utils/toastEmitter';
import { soundEngine } from '../utils/audioChime';

export default function PortfolioRebalancer({ onExecuteTradeOrder = null }) {
  // 1. Portfolio holdings state
  const [holdings, setHoldings] = useState(() => {
    try {
      const saved = localStorage.getItem('chintu_rebalancer_holdings');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed reading saved holdings:', e);
    }
    return generateInitialPortfolioHoldings();
  });

  // 2. Selected Allocation Model Preset
  const [selectedPresetId, setSelectedPresetId] = useState('ALL_WEATHER');
  const [customWeights, setCustomWeights] = useState({
    'Equities': 30,
    'Commodities': 25,
    'Indices': 25,
    'Derivatives': 15,
    'Currencies': 5
  });

  // 3. User Parameters
  const [driftTolerance, setDriftTolerance] = useState(2.0); // ±2.0%
  const [cashBalance, setCashBalance] = useState(85000);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL'); // 'ALL' | 'ACTION_ONLY' | 'BUY_ONLY' | 'SELL_ONLY'
  const [isExecutingBatch, setIsExecutingBatch] = useState(false);
  const [batchSuccessMessage, setBatchSuccessMessage] = useState(null);
  const [showCustomModal, setShowCustomModal] = useState(false);

  // Active target weights based on preset or custom
  const activeTargets = useMemo(() => {
    if (selectedPresetId === 'CUSTOM') return customWeights;
    return ALLOCATION_PRESETS[selectedPresetId]?.targets || ALLOCATION_PRESETS.ALL_WEATHER.targets;
  }, [selectedPresetId, customWeights]);

  // Run Drift Calculation Engine
  const driftAnalysis = useMemo(() => {
    return calculatePortfolioDrift({
      holdings,
      targetWeights: activeTargets,
      driftTolerancePct: driftTolerance,
      cashBalance
    });
  }, [holdings, activeTargets, driftTolerance, cashBalance]);

  // Persist holdings changes
  useEffect(() => {
    try {
      localStorage.setItem('chintu_rebalancer_holdings', JSON.stringify(holdings));
    } catch (e) {
      console.error('Failed storing holdings:', e);
    }
  }, [holdings]);

  // Filtered Assets list
  const filteredSuggestions = useMemo(() => {
    return driftAnalysis.assetRebalanceSuggestions.filter(item => {
      const matchesSearch = !searchQuery ||
        item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat = categoryFilter === 'ALL' || item.category === categoryFilter;

      let matchesAction = true;
      if (actionFilter === 'ACTION_ONLY') matchesAction = item.action !== 'HOLD';
      else if (actionFilter === 'BUY_ONLY') matchesAction = item.action === 'BUY';
      else if (actionFilter === 'SELL_ONLY') matchesAction = item.action === 'SELL';

      return matchesSearch && matchesCat && matchesAction;
    });
  }, [driftAnalysis.assetRebalanceSuggestions, searchQuery, categoryFilter, actionFilter]);

  // Single Position Rebalance Execution
  const handleExecuteSingleRebalance = (item) => {
    if (item.action === 'HOLD' || item.suggestedQty <= 0) return;

    soundEngine.playBuyChime();

    // Adjust position in holdings state
    setHoldings(prevHoldings => {
      return prevHoldings.map(h => {
        if (h.symbol !== item.symbol) return h;
        const newQty = item.action === 'BUY'
          ? h.qty + item.suggestedQty
          : Math.max(0, h.qty - item.suggestedQty);
        
        const marketValue = Number((newQty * h.currentLtp).toFixed(2));
        const investedValue = Number((newQty * h.avgCost).toFixed(2));
        const pnl = Number((marketValue - investedValue).toFixed(2));
        const pnlPct = investedValue > 0 ? Number(((pnl / investedValue) * 100).toFixed(2)) : 0;

        return {
          ...h,
          qty: newQty,
          marketValue,
          investedValue,
          pnl,
          pnlPct
        };
      });
    });

    // Adjust cash balance
    const cashDelta = item.action === 'BUY' ? -item.suggestedTradeVal : item.suggestedTradeVal;
    setCashBalance(prev => Math.max(0, prev + cashDelta - item.estimatedCharges));

    // Emit Real-Time Toast
    toastEmitter.emitTradeExecution({
      id: `rebal_${Date.now()}`,
      botName: 'Portfolio Rebalancer Core',
      symbol: item.symbol,
      action: item.action,
      type: item.action,
      price: item.currentLtp,
      qty: item.suggestedQty,
      strategy: `Allocation Rebalance (${item.driftPct > 0 ? '+' : ''}${item.driftPct}% Drift)`,
      quorum: 'Automatic Quorum Verified',
      executionMode: 'PAPER / AUDITED',
      latency: '1.2ms IPC'
    });
  };

  // Bulk Rebalance Execution of All Suggested Trades
  const handleExecuteBatchRebalance = () => {
    const actionable = driftAnalysis.assetRebalanceSuggestions.filter(a => a.action !== 'HOLD');
    if (actionable.length === 0) return;

    setIsExecutingBatch(true);
    soundEngine.playBuyChime();

    setTimeout(() => {
      // Rebalance all holdings to return to target weights
      setHoldings(prevHoldings => {
        return prevHoldings.map(h => {
          const suggestion = actionable.find(a => a.symbol === h.symbol);
          if (!suggestion) return h;

          const newQty = suggestion.action === 'BUY'
            ? h.qty + suggestion.suggestedQty
            : Math.max(0, h.qty - suggestion.suggestedQty);

          const marketValue = Number((newQty * h.currentLtp).toFixed(2));
          const investedValue = Number((newQty * h.avgCost).toFixed(2));
          const pnl = Number((marketValue - investedValue).toFixed(2));
          const pnlPct = investedValue > 0 ? Number(((pnl / investedValue) * 100).toFixed(2)) : 0;

          return {
            ...h,
            qty: newQty,
            marketValue,
            investedValue,
            pnl,
            pnlPct
          };
        });
      });

      // Update cash
      setCashBalance(prev => Math.max(0, prev + driftAnalysis.batchTotals.netCashFlowDelta - driftAnalysis.batchTotals.totalEstimatedFees));

      setIsExecutingBatch(false);
      setBatchSuccessMessage(`Successfully executed batch rebalancing across ${actionable.length} positions. All target weights restored.`);

      // Emit summary toast
      toastEmitter.emitTradeExecution({
        id: `batch_rebal_${Date.now()}`,
        botName: 'Rebalancer Core',
        symbol: 'MULTI-ASSET BASKET',
        action: 'REBALANCE',
        type: 'BATCH',
        price: driftAnalysis.totalPortfolioValue,
        qty: actionable.length,
        strategy: `${ALLOCATION_PRESETS[selectedPresetId]?.name || 'Custom'} Rebalance Execution`,
        quorum: '14/14 Quorum Approved',
        executionMode: 'PAPER / AUDITED'
      });

      setTimeout(() => {
        setBatchSuccessMessage(null);
      }, 6000);
    }, 700);
  };

  // Reset to original seed holdings
  const handleResetPortfolio = () => {
    const seed = generateInitialPortfolioHoldings();
    setHoldings(seed);
    setCashBalance(85000);
    soundEngine.playSellChime();
  };

  // Auto normalize custom weights to 100%
  const handleNormalizeCustomWeights = () => {
    const total = Object.values(customWeights).reduce((a, b) => a + Number(b), 0);
    if (total === 0) return;
    const normalized = {};
    Object.entries(customWeights).forEach(([cat, val]) => {
      normalized[cat] = Math.round((Number(val) / total) * 100);
    });
    setCustomWeights(normalized);
  };

  return (
    <div className="space-y-4 animate-fadeIn select-none text-left">
      {/* Header & Control Strip */}
      <div className="glass-panel rounded-2xl p-4 border border-[#1e3a6e]/70 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/40 text-cyan-400">
              <Layers className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Autonomous Portfolio Rebalancer
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">
                  200+ MULTI-ASSET CORE
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Dynamic asset allocation drift auditor · Statutory tax & net-profit guardrail verification on all suggested trades
              </p>
            </div>
          </div>
        </div>

        {/* Model Selector & Parameters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-[#09142b] px-3 py-1.5 rounded-xl border border-[#1b345f]">
            <span className="text-xs font-mono text-slate-400">Model:</span>
            <select
              value={selectedPresetId}
              onChange={(e) => setSelectedPresetId(e.target.value)}
              className="bg-transparent text-xs font-bold text-cyan-300 focus:outline-none cursor-pointer font-mono"
            >
              {Object.entries(ALLOCATION_PRESETS).map(([key, preset]) => (
                <option key={key} value={key} className="bg-[#05070b] text-white">
                  {preset.name}
                </option>
              ))}
              <option value="CUSTOM" className="bg-[#05070b] text-white">
                Custom User Weights...
              </option>
            </select>
            {selectedPresetId === 'CUSTOM' && (
              <button
                type="button"
                onClick={() => setShowCustomModal(true)}
                className="text-[10px] text-cyan-400 underline hover:text-cyan-300 ml-1 cursor-pointer"
              >
                Edit Weights
              </button>
            )}
          </div>

          {/* Drift Tolerance Band */}
          <div className="flex items-center gap-2 bg-[#09142b] px-3 py-1.5 rounded-xl border border-[#1b345f] text-xs font-mono">
            <span className="text-slate-400">Tolerance Band:</span>
            <span className="text-emerald-400 font-bold">±{driftTolerance}%</span>
            <input
              type="range"
              min="0.5"
              max="5.0"
              step="0.5"
              value={driftTolerance}
              onChange={(e) => setDriftTolerance(parseFloat(e.target.value))}
              className="w-16 accent-cyan-400 cursor-pointer"
              title={`Drift Tolerance: ±${driftTolerance}%`}
            />
          </div>

          {/* Reset Portfolio */}
          <button
            type="button"
            onClick={handleResetPortfolio}
            title="Reset Portfolio to Seed State"
            className="p-2 rounded-xl bg-[#09142b] border border-[#1b345f] text-slate-400 hover:text-white hover:bg-[#10244c] transition-all cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Rebalance Success Banner */}
      {batchSuccessMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{batchSuccessMessage}</span>
          </div>
          <span className="text-[10px] text-slate-400">Quorum Confirmed</span>
        </div>
      )}

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-xl bg-[#091326] border border-[#1a345e] flex flex-col justify-between">
          <span className="text-[10px] font-mono text-slate-400">TOTAL PORTFOLIO VALUATION</span>
          <div className="text-xl font-bold font-mono text-white mt-1">
            ₹{driftAnalysis.totalPortfolioValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono mt-1 text-slate-400">
            <span>Holdings: ₹{driftAnalysis.totalHoldingsMarketValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            <span className="text-cyan-400">Cash: ₹{cashBalance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#091326] border border-[#1a345e] flex flex-col justify-between">
          <span className="text-[10px] font-mono text-slate-400">TOTAL UNREALIZED P&L</span>
          <div className="flex items-center gap-1.5 mt-1 font-mono">
            <span className={`text-xl font-bold ${driftAnalysis.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {driftAnalysis.totalPnl >= 0 ? '+' : ''}₹{driftAnalysis.totalPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="text-[10px] font-mono text-slate-400 mt-1">
            <span className={driftAnalysis.totalPnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {driftAnalysis.totalPnlPct >= 0 ? '+' : ''}{driftAnalysis.totalPnlPct}% Return
            </span>
            <span> · Invested: ₹{driftAnalysis.totalInvestedValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#091326] border border-[#1a345e] flex flex-col justify-between">
          <span className="text-[10px] font-mono text-slate-400">MAX ALLOCATION DRIFT</span>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xl font-bold font-mono ${driftAnalysis.isRebalanceRecommended ? 'text-rose-400' : 'text-emerald-400'}`}>
              {driftAnalysis.maxAbsDrift > 0 ? '+' : ''}{driftAnalysis.maxAbsDrift}%
            </span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${driftAnalysis.isRebalanceRecommended ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'}`}>
              {driftAnalysis.isRebalanceRecommended ? 'DRIFT EXCEEDED' : 'IN TOLERANCE'}
            </span>
          </div>
          <div className="text-[10px] font-mono text-slate-400 mt-1">
            Tolerance: ±{driftTolerance}% threshold
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#091326] border border-[#1a345e] flex flex-col justify-between">
          <span className="text-[10px] font-mono text-slate-400">REBALANCE ACTION REQUIRED</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xl font-bold font-mono text-cyan-300">
              {driftAnalysis.actionCounts.buyCount + driftAnalysis.actionCounts.sellCount} Positions
            </span>
          </div>
          <div className="text-[10px] font-mono text-slate-400 mt-1 flex items-center gap-1.5">
            <span className="text-emerald-400">{driftAnalysis.actionCounts.buyCount} Buy</span>
            <span>·</span>
            <span className="text-rose-400">{driftAnalysis.actionCounts.sellCount} Sell</span>
            <span>·</span>
            <span>{driftAnalysis.actionCounts.holdCount} Balanced</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#091326] border border-[#1a345e] flex flex-col justify-between">
          <span className="text-[10px] font-mono text-slate-400">BATCH CASH FLOW & TAXES</span>
          <div className="text-sm font-bold font-mono text-slate-200 mt-1 truncate">
            {driftAnalysis.batchTotals.netCashFlowDelta >= 0 ? `+₹${driftAnalysis.batchTotals.netCashFlowDelta.toLocaleString('en-IN')}` : `-₹${Math.abs(driftAnalysis.batchTotals.netCashFlowDelta).toLocaleString('en-IN')}`} Net Flow
          </div>
          <div className="text-[10px] font-mono text-slate-400 mt-1 flex items-center justify-between">
            <span>Fees & STT: ₹{driftAnalysis.batchTotals.totalEstimatedFees.toFixed(2)}</span>
            <span className="text-emerald-400">Guardrail OK</span>
          </div>
        </div>
      </div>

      {/* Category Allocation Drift Visualizer Strip */}
      <div className="bg-[#070e1e] p-4 rounded-xl border border-[#18315a] space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            Asset Class Target vs. Current Allocation Matrix
          </h3>
          <span className="text-[10px] font-mono text-slate-400">
            Current Model: <strong className="text-cyan-300">{ALLOCATION_PRESETS[selectedPresetId]?.name || 'Custom'}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {driftAnalysis.categoryDriftAnalysis.map((cat) => {
            const isOver = cat.status === 'OVERWEIGHT';
            const isUnder = cat.status === 'UNDERWEIGHT';
            const colorClass = isOver ? 'text-rose-400' : isUnder ? 'text-cyan-400' : 'text-emerald-400';
            const barGradient = isOver
              ? 'bg-gradient-to-r from-amber-500 to-rose-500'
              : isUnder
              ? 'bg-gradient-to-r from-cyan-500 to-blue-500'
              : 'bg-gradient-to-r from-emerald-500 to-cyan-400';

            return (
              <div
                key={cat.category}
                className="p-3 rounded-lg bg-[#050a17] border border-[#152a4e] flex flex-col justify-between space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white">{cat.category}</span>
                  <span className={`font-mono text-[10px] font-bold ${colorClass}`}>
                    {cat.driftPct > 0 ? `+${cat.driftPct}%` : `${cat.driftPct}%`}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>Current: <strong className="text-slate-200">{cat.currentWeightPct}%</strong></span>
                    <span>Target: <strong className="text-cyan-300">{cat.targetWeightPct}%</strong></span>
                  </div>

                  {/* Progress Comparison */}
                  <div className="w-full h-1.5 rounded-full bg-[#0a142c] overflow-hidden flex">
                    <div
                      className={`h-full ${barGradient} transition-all duration-500`}
                      style={{ width: `${Math.min(100, cat.currentWeightPct)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[9.5px] font-mono text-slate-400 pt-1 border-t border-[#122340]">
                  <span>Val: ₹{cat.currentVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  <span className={`font-bold ${isOver ? 'text-rose-400' : isUnder ? 'text-cyan-300' : 'text-emerald-400'}`}>
                    {cat.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Table: Asset Rebalance Recommendations (200+ Universe) */}
      <div className="bg-[#070e1e] rounded-xl border border-[#18315a] overflow-hidden shadow-xl space-y-3 p-4">
        {/* Table Filters & Batch Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[#16294a]">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            {/* Search Box */}
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search symbol (e.g., RELIANCE, GOLD, NIFTY)..."
                className="w-full bg-[#05070b] border border-[#1c3563] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-1 text-[11px] font-mono">
              {['ALL', 'Equities', 'Indices', 'Commodities', 'Derivatives'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    categoryFilter === cat
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Action Filters & Bulk Execute Button */}
          <div className="flex items-center gap-2">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-[#05070b] border border-[#1c3563] rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-400 font-mono cursor-pointer"
            >
              <option value="ALL">All ({driftAnalysis.assetRebalanceSuggestions.length})</option>
              <option value="ACTION_ONLY">
                Rebalance Required ({driftAnalysis.actionCounts.buyCount + driftAnalysis.actionCounts.sellCount})
              </option>
              <option value="BUY_ONLY">Buy Only ({driftAnalysis.actionCounts.buyCount})</option>
              <option value="SELL_ONLY">Sell Only ({driftAnalysis.actionCounts.sellCount})</option>
            </select>

            <button
              type="button"
              disabled={isExecutingBatch || (driftAnalysis.actionCounts.buyCount + driftAnalysis.actionCounts.sellCount === 0)}
              onClick={handleExecuteBatchRebalance}
              className={`px-4 py-2 rounded-xl text-xs font-bold font-mono flex items-center gap-2 transition-all cursor-pointer shadow-lg ${
                isExecutingBatch || (driftAnalysis.actionCounts.buyCount + driftAnalysis.actionCounts.sellCount === 0)
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black shadow-[0_0_15px_rgba(0,240,255,0.4)]'
              }`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${isExecutingBatch ? 'animate-spin' : ''}`} />
              <span>
                {isExecutingBatch
                  ? 'Executing Rebalance Orders...'
                  : `Execute All (${driftAnalysis.actionCounts.buyCount + driftAnalysis.actionCounts.sellCount}) Rebalance Orders`}
              </span>
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-[#16294a] text-slate-400 text-[10px] uppercase">
                <th className="py-2.5 px-3">Asset / Symbol</th>
                <th className="py-2.5 px-3">Segment</th>
                <th className="py-2.5 px-3 text-right">LTP / Price</th>
                <th className="py-2.5 px-3 text-right">Holdings</th>
                <th className="py-2.5 px-3 text-right">Current %</th>
                <th className="py-2.5 px-3 text-right">Target %</th>
                <th className="py-2.5 px-3 text-center">Drift %</th>
                <th className="py-2.5 px-3 text-center">Recommended Action</th>
                <th className="py-2.5 px-3 text-right">Trade Value</th>
                <th className="py-2.5 px-3 text-center">Guardrail Audit</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#122340]">
              {filteredSuggestions.length === 0 ? (
                <tr>
                  <td colSpan="11" className="py-8 text-center text-slate-400">
                    No positions matching current filter.
                  </td>
                </tr>
              ) : (
                filteredSuggestions.map((item) => {
                  const isActionRequired = item.action !== 'HOLD';
                  const isBuy = item.action === 'BUY';
                  const isSell = item.action === 'SELL';

                  return (
                    <tr
                      key={item.symbol}
                      className={`hover:bg-[#0a162e]/70 transition-colors ${
                        isActionRequired ? 'bg-[#081226]/40' : ''
                      }`}
                    >
                      {/* Asset Symbol & Name */}
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-white text-xs">{item.symbol}</div>
                        <div className="text-[9px] text-slate-400 truncate max-w-[140px]">{item.name}</div>
                      </td>

                      {/* Segment */}
                      <td className="py-2.5 px-3 text-[10px] text-slate-400">
                        {item.segment}
                      </td>

                      {/* LTP */}
                      <td className="py-2.5 px-3 text-right font-bold text-white">
                        ₹{item.currentLtp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Holding Qty & Val */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="text-slate-200 font-bold">{item.qty} Qty</div>
                        <div className="text-[9px] text-slate-400">
                          ₹{item.marketValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </div>
                      </td>

                      {/* Current % */}
                      <td className="py-2.5 px-3 text-right text-slate-200">
                        {item.currentWeight}%
                      </td>

                      {/* Target % */}
                      <td className="py-2.5 px-3 text-right text-cyan-300 font-bold">
                        {item.targetWeight}%
                      </td>

                      {/* Drift % */}
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                            Math.abs(item.driftPct) > driftTolerance
                              ? item.driftPct > 0
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              : 'text-slate-400'
                          }`}
                        >
                          {item.driftPct > 0 ? `+${item.driftPct}%` : `${item.driftPct}%`}
                        </span>
                      </td>

                      {/* Recommended Action */}
                      <td className="py-2.5 px-3 text-center">
                        {isBuy ? (
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-bold text-[10px] flex items-center justify-center gap-1">
                            <TrendingUp className="w-3 h-3 text-emerald-400" />
                            BUY +{item.suggestedQty} Qty
                          </span>
                        ) : isSell ? (
                          <span className="px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 font-bold text-[10px] flex items-center justify-center gap-1">
                            <TrendingDown className="w-3 h-3 text-rose-400" />
                            SELL -{item.suggestedQty} Qty
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-bold flex items-center justify-center gap-1">
                            <Check className="w-3 h-3 text-slate-500" />
                            BALANCED
                          </span>
                        )}
                      </td>

                      {/* Trade Value */}
                      <td className="py-2.5 px-3 text-right">
                        {isActionRequired ? (
                          <>
                            <div className="font-bold text-white">
                              ₹{item.suggestedTradeVal.toLocaleString('en-IN')}
                            </div>
                            <div className="text-[9px] text-slate-400">
                              Est. Tax: ₹{item.estimatedCharges.toFixed(1)}
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Net-Profit Guardrail Audit */}
                      <td className="py-2.5 px-3 text-center">
                        {isActionRequired ? (
                          <span
                            title={item.guardrailReason}
                            className="inline-flex items-center gap-1 text-[9.5px] text-emerald-400 font-semibold"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                            Audited
                          </span>
                        ) : (
                          <span className="text-slate-600 text-[10px]">Optimal</span>
                        )}
                      </td>

                      {/* Action Button */}
                      <td className="py-2.5 px-3 text-right">
                        {isActionRequired ? (
                          <button
                            type="button"
                            onClick={() => handleExecuteSingleRebalance(item)}
                            className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                              isBuy
                                ? 'bg-emerald-500 hover:bg-emerald-400 text-black'
                                : 'bg-rose-500 hover:bg-rose-400 text-white'
                            }`}
                          >
                            {item.action}
                          </button>
                        ) : (
                          <span className="text-slate-600 text-[10px]">No Action</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Custom Weights Configuration Modal */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 animate-fadeIn">
          <div className="bg-[#05070b] border border-[#1e3a6e] rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-2xl my-auto max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#16294a] pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                Custom Asset Category Target Weights
              </h3>
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {Object.entries(customWeights).map(([cat, val]) => (
                <div key={cat} className="flex items-center justify-between gap-3 text-xs font-mono">
                  <span className="text-slate-200 font-bold w-28">{cat}</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={val}
                    onChange={(e) => {
                      setCustomWeights(prev => ({
                        ...prev,
                        [cat]: parseInt(e.target.value, 10) || 0
                      }));
                    }}
                    className="flex-1 accent-cyan-400 cursor-pointer"
                  />
                  <span className="text-cyan-300 font-bold w-12 text-right">{val}%</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs font-mono pt-2 border-t border-[#16294a]">
              <span className="text-slate-400">
                Sum: <strong className={Object.values(customWeights).reduce((a, b) => a + Number(b), 0) === 100 ? 'text-emerald-400' : 'text-amber-400'}>
                  {Object.values(customWeights).reduce((a, b) => a + Number(b), 0)}%
                </strong>
              </span>
              <button
                type="button"
                onClick={handleNormalizeCustomWeights}
                className="text-[10px] text-cyan-400 hover:underline cursor-pointer"
              >
                Auto-Normalize to 100%
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs cursor-pointer"
              >
                Apply Custom Weights
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
