import React, { useState, useEffect } from 'react';
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
  SlidersHorizontal,
  BrainCircuit,
  Radar,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Coins,
  Scale
} from 'lucide-react';
import { apiFetch } from '../../utils/api';

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

  // Master Brain State
  const [masterDecision, setMasterDecision] = useState({
    decision: 'NO_TRADE',
    symbol: 'NIFTY 50',
    consensus_score: 0.0,
    market_regime: 'RANGING',
    contributing_bots_count: 14,
    decision_reason: 'Awaiting market event or consensus evaluation',
    profit_analysis: {
      is_profitable: false,
      net_reward: 0.0,
      total_friction: 48.50,
      net_reward_to_risk: 0.0
    }
  });
  const [isEvaluatingBrain, setIsEvaluatingBrain] = useState(false);

  // Multi-Market Scanner State
  const [scannerMode, setScannerMode] = useState('TOP_N');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState(null);

  // Centralized RMS & Emergency Stop State
  const [emergencyStopActive, setEmergencyStopActive] = useState(false);
  const [rmsMessage, setRmsMessage] = useState('');

  // Fetch Master Brain Status on Load
  useEffect(() => {
    let isMounted = true;
    async function loadStatus() {
      try {
        const brainRes = await apiFetch('/api/master-brain/status');
        if (isMounted && brainRes && brainRes.recent_decisions?.length > 0) {
          setMasterDecision(brainRes.recent_decisions[brainRes.recent_decisions.length - 1]);
        }
        const rmsRes = await apiFetch('/api/rms/status');
        if (isMounted && rmsRes && rmsRes.config) {
          setEmergencyStopActive(Boolean(rmsRes.config.emergency_stop_active || rmsRes.config.circuit_breaker_active));
        }
      } catch (err) {
        // Fallback gracefully if backend is offline
      }
    }
    loadStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  // Evaluate Master Brain Consensus on Demand
  const handleEvaluateMasterBrain = async (symbol = 'NIFTY 50') => {
    setIsEvaluatingBrain(true);
    try {
      const res = await apiFetch('/api/master-brain/decision', {
        method: 'POST',
        body: JSON.stringify({
          symbol: symbol,
          market_regime: 'TRENDING_BULL'
        })
      });
      if (res && res.status === 'success' && res.decision) {
        setMasterDecision(res.decision);
      }
    } catch (err) {
      console.warn('Master Brain evaluation fallback:', err);
    } finally {
      setIsEvaluatingBrain(false);
    }
  };

  // Trigger Multi-Market Opportunity Scan
  const handleTriggerMarketScan = async () => {
    setIsScanning(true);
    try {
      const res = await apiFetch('/api/scanner/scan', {
        method: 'POST',
        body: JSON.stringify({
          mode: scannerMode,
          market_regime: 'TRENDING_BULL'
        })
      });
      if (res && res.status === 'success' && res.scan_results) {
        setScanResults(res.scan_results);
      }
    } catch (err) {
      console.warn('Market scan error:', err);
    } finally {
      setIsScanning(false);
    }
  };

  // Emergency Stop Handler
  const handleTriggerEmergencyStop = async () => {
    if (!window.confirm('⚠️ ATTENTION COMMANDER: Activate Platform-Wide EMERGENCY STOP? This will immediately halt all 14 bots and block all entry orders.')) {
      return;
    }
    try {
      const res = await apiFetch('/api/rms/emergency-stop', { method: 'POST' });
      if (res && res.status === 'success') {
        setEmergencyStopActive(true);
        setRmsMessage('🚨 EMERGENCY STOP ACTIVATED. All new entries blocked.');
      }
    } catch (err) {
      setEmergencyStopActive(true);
      setRmsMessage('🚨 Emergency stop armed locally.');
    }
  };

  // Reset Circuit Breaker Handler
  const handleResetCircuitBreaker = async () => {
    try {
      const res = await apiFetch('/api/rms/reset-circuit-breaker', { method: 'POST' });
      if (res && res.status === 'success') {
        setEmergencyStopActive(false);
        setRmsMessage('✅ Circuit breaker reset. Normal paper operations resumed.');
        setTimeout(() => setRmsMessage(''), 4000);
      }
    } catch (err) {
      setEmergencyStopActive(false);
    }
  };

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
      {/* Emergency Stop Banner if Active */}
      {emergencyStopActive && (
        <div className="bg-rose-950/80 border-2 border-rose-500 rounded-xl p-3 flex items-center justify-between shadow-[0_0_20px_rgba(244,63,94,0.3)] animate-pulse">
          <div className="flex items-center gap-2.5 text-rose-300">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <span className="font-bold text-sm">
              {rmsMessage || 'RMS CIRCUIT BREAKER ACTIVE — ALL NEW ENTRY ORDERS STRICTLY BLOCKED'}
            </span>
          </div>
          <button
            onClick={handleResetCircuitBreaker}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            Reset Circuit Breaker (Admin)
          </button>
        </div>
      )}

      {/* Top Controls Bar */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-cyan-400" />
            Bots Fleet Monitor & Master Brain Orchestration
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            14 Multi-Asset Autonomous Algorithms Synchronized Under Central Master Brain Consensus
          </p>
        </div>

        {/* Search, Filter, Sort, Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search bot or asset..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#09152e] border border-[#1e3a6e] text-xs text-slate-200 pl-8 pr-3 py-1.5 rounded-lg focus:outline-none focus:border-cyan-400 w-40"
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
            className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/50 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Start All</span>
          </button>

          <button
            onClick={onStopAllBots}
            className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/50 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Pause className="w-3.5 h-3.5" />
            <span>Stop All</span>
          </button>

          {/* Emergency Stop Button */}
          <button
            onClick={handleTriggerEmergencyStop}
            className="bg-red-600/30 hover:bg-red-600/50 text-red-300 border border-red-500 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-[0_0_10px_rgba(239,68,68,0.25)]"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span>STOP RMS</span>
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

      {/* MASTER BRAIN ORCHESTRATION BANNER */}
      <div className="glass-panel rounded-2xl p-4 border border-cyan-500/40 bg-gradient-to-r from-[#0a1835]/90 to-[#07132a]/90 shadow-[0_0_20px_rgba(0,240,255,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1e3a6e]/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300">
              <BrainCircuit className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white font-mono">
                  Master Brain Quantitative Consensus
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-700/50">
                  {masterDecision.market_regime || 'TRENDING_BULL'} REGIME
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {masterDecision.decision_reason || 'Harmonized multi-bot mathematical evaluation with statutory cost friction.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleEvaluateMasterBrain('NIFTY 50')}
              disabled={isEvaluatingBrain}
              className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isEvaluatingBrain ? 'animate-spin' : ''}`} />
              <span>{isEvaluatingBrain ? 'Evaluating Fleet...' : 'Evaluate Fleet Consensus'}</span>
            </button>
          </div>
        </div>

        {/* Master Brain Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-3 pt-1">
          <div className="bg-[#060c1d] p-2.5 rounded-xl border border-[#1e3a6e]/50">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Consensus Action</span>
            <span className={`text-sm font-bold font-mono ${
              masterDecision.decision === 'BUY' ? 'text-emerald-400' :
              masterDecision.decision === 'SELL' ? 'text-rose-400' : 'text-amber-400'
            }`}>
              {masterDecision.decision || 'NO_TRADE'}
            </span>
          </div>

          <div className="bg-[#060c1d] p-2.5 rounded-xl border border-[#1e3a6e]/50">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Quorum Score</span>
            <span className="text-sm font-bold font-mono text-cyan-300">
              {((masterDecision.consensus_score || 0) * 100).toFixed(1)}%
            </span>
          </div>

          <div className="bg-[#060c1d] p-2.5 rounded-xl border border-[#1e3a6e]/50">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Est. Net Reward</span>
            <span className="text-sm font-bold font-mono text-emerald-400">
              ₹{(masterDecision.profit_analysis?.net_reward || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="bg-[#060c1d] p-2.5 rounded-xl border border-[#1e3a6e]/50">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Total Friction Drag</span>
            <span className="text-sm font-bold font-mono text-amber-300">
              ₹{(masterDecision.profit_analysis?.total_friction || 48.50).toFixed(2)}
            </span>
          </div>

          <div className="bg-[#060c1d] p-2.5 rounded-xl border border-[#1e3a6e]/50">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Net Reward/Risk</span>
            <span className="text-sm font-bold font-mono text-cyan-300">
              {(masterDecision.profit_analysis?.net_reward_to_risk || 0).toFixed(2)}x
            </span>
          </div>

          <div className="bg-[#060c1d] p-2.5 rounded-xl border border-[#1e3a6e]/50">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Contributing Bots</span>
            <span className="text-sm font-bold font-mono text-white">
              {masterDecision.contributing_bots_count || 14} / 14 Fleet
            </span>
          </div>
        </div>
      </div>

      {/* MULTI-MARKET OPPORTUNITY SCANNER PANEL */}
      <div className="glass-panel rounded-2xl p-4 border border-[#1e3a6e]/60 bg-[#09152e]/60">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1e3a6e]/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/20 border border-purple-400/40 text-purple-300">
              <Radar className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Multi-Market Opportunity Scanner
              </h3>
              <p className="text-xs text-slate-400">
                Scans NSE Equity, NSE F&O, MCX Commodities & Currency derivatives with realistic Indian transaction friction.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={scannerMode}
              onChange={(e) => setScannerMode(e.target.value)}
              className="bg-[#060c1d] border border-[#1e3a6e] text-xs text-slate-200 px-3 py-1.5 rounded-lg focus:outline-none focus:border-purple-400 font-mono"
            >
              <option value="TOP_N">TOP_N (Top 5 Opportunities)</option>
              <option value="SINGLE_INSTRUMENT">SINGLE_INSTRUMENT (Focused Deep Dive)</option>
              <option value="MULTI_MARKET_AUTO">MULTI_MARKET_AUTO (Full Universe Scan)</option>
            </select>

            <button
              onClick={handleTriggerMarketScan}
              disabled={isScanning}
              className="bg-purple-500/25 hover:bg-purple-500/35 text-purple-300 border border-purple-500/50 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'Scanning Markets...' : 'Run Opportunity Scan'}</span>
            </button>
          </div>
        </div>

        {/* Scan Results Display */}
        {scanResults && scanResults.opportunities?.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-xs text-slate-400 font-mono flex items-center justify-between">
              <span>Scanned {scanResults.total_scanned} instruments in {scanResults.scan_latency_ms}ms ({scanResults.eligible_opportunities_count} eligible)</span>
              <span>Mode: {scanResults.scan_mode}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
              {scanResults.opportunities.map((opp, idx) => (
                <div key={idx} className="bg-[#060c1d] border border-[#1e3a6e]/50 hover:border-purple-400/50 rounded-xl p-3 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white">{opp.name || opp.symbol}</span>
                      <span className="text-[10px] text-slate-400 block font-mono">{opp.segment}</span>
                    </div>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-700/50">
                      Score: {opp.opportunity_score}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-[#1e3a6e]/30 text-[10px] font-mono">
                    <div>
                      <span className="text-slate-400 block">LTP</span>
                      <span className="text-white font-bold">₹{opp.current_price?.toLocaleString('en-IN')}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Net Reward</span>
                      <span className="text-emerald-400 font-bold">+₹{opp.net_reward?.toFixed(1)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Spread</span>
                      <span className="text-cyan-400">{opp.spread_pct?.toFixed(3)}%</span>
                    </div>
                  </div>

                  <div className="mt-2 pt-1 flex items-center justify-between">
                    <span className="text-[9.5px] text-slate-400 font-mono">Margin: ₹{opp.estimated_margin?.toLocaleString('en-IN')}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                      opp.decision === 'BUY' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' :
                      opp.decision === 'SELL' ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' :
                      'bg-slate-700/30 text-slate-400 border-slate-600/30'
                    }`}>
                      {opp.decision}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bots Grid (All 14 Canonical Bots) */}
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

                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400 font-sans">Authentic Tape:</span>
                  <span className={bot.verifiedAuthenticTrades > 0 ? "text-emerald-400 font-bold" : "text-amber-400/90 font-mono text-[10px]"}>
                    {bot.verifiedAuthenticTrades > 0 ? `${bot.verifiedAuthenticTrades} verified` : "0 (Synthetic Tape)"}
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
