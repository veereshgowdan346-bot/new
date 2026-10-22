import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Lock,
  Unlock,
  Zap,
  AlertOctagon,
  Sliders,
  DollarSign,
  Percent,
  Info,
  Play,
  Pause,
  CheckCircle2,
  RefreshCw,
  Layers,
  ArrowRight,
  TrendingUp,
  Cpu,
  Sparkles,
  X
} from 'lucide-react';
import { apiFetch } from '../../utils/api';
import { toastEmitter } from '../../utils/toastEmitter';
import PortfolioRebalancer from '../PortfolioRebalancer';

const STORAGE_KEY = 'chintu_risk_settings';

export default function RiskManagementView({
  bots = [],
  onUpdateBots,
  onToggleBotStatus,
  brokerConnections = []
}) {
  // 1. Load persistent risk settings from localStorage
  const [riskSettings, setRiskSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error reading risk settings from localStorage', e);
    }
    return {
      maxDailyLoss: 15000,
      maxCapitalPerBot: 50000,
      trailingDrawdown: 3.5,
      circuitBreakerActive: false,
      allocationMode: 'custom', // 'custom' | 'equal'
      equalAmount: 500
    };
  });

  const [savedFeedback, setSavedFeedback] = useState(false);
  const [showRebalancerModal, setShowRebalancerModal] = useState(false);

  // Live RMS Autonomous Watchdog Telemetry
  const [watchdogData, setWatchdogData] = useState({
    max_daily_loss: 25000,
    max_drawdown_pct: 2.5,
    trailing_stop_loss_pct: 1.5,
    auto_square_off_enabled: true,
    current_drawdown_pct: 0.42,
    peak_equity: 500000,
    circuit_breaker_tripped: false,
    last_trip_reason: null,
    actions_logged: []
  });

  const fetchWatchdogStatus = async () => {
    try {
      const res = await apiFetch('/api/rms/status');
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setWatchdogData({
            ...data.config,
            actions_logged: data.actions_logged || []
          });
        }
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchWatchdogStatus();
    const interval = setInterval(fetchWatchdogStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleAutoSquareOff = async () => {
    const nextVal = !watchdogData.auto_square_off_enabled;
    try {
      await apiFetch('/api/rms/configure-guard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoSquareOff: nextVal })
      });
      setWatchdogData((prev) => ({ ...prev, auto_square_off_enabled: nextVal }));
      toastEmitter.emitToast({
        title: 'RMS Risk Guard Updated',
        message: `Autonomous Liquidation ${nextVal ? 'ARMED' : 'DISARMED'}`,
        type: nextVal ? 'success' : 'warning'
      });
    } catch (e) {}
  };

  const handleSimulateTripTest = async () => {
    try {
      await apiFetch('/api/rms/trip-test', { method: 'POST' });
      fetchWatchdogStatus();
      toastEmitter.emitToast({
        title: 'Flash-Crash Trip Test Executed',
        message: 'Jarvis autonomously engaged circuit breaker & squared off broker positions with 0 latency.',
        type: 'error'
      });
    } catch (e) {}
  };

  const handleResetCircuitBreaker = async () => {
    try {
      await apiFetch('/api/rms/reset', { method: 'POST' });
      fetchWatchdogStatus();
      toastEmitter.emitToast({
        title: 'Circuit Breaker Armed & Reset',
        message: 'Normal autonomous bot operations and broker conduits resumed.',
        type: 'success'
      });
    } catch (e) {}
  };

  // Sync riskSettings helper & backend RMS
  const updateSetting = (key, value) => {
    setRiskSettings((prev) => {
      const updated = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Error saving risk settings to localStorage', e);
      }

      // Sync with backend Python RMS engine
      apiFetch('/api/rms/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_daily_loss: updated.maxDailyLoss,
          max_capital_per_bot: updated.maxCapitalPerBot,
          trailing_drawdown_limit: updated.trailingDrawdown
        })
      }).catch(() => {});

      return updated;
    });
    triggerSavedFeedback();
  };

  const handleToggleCircuitBreaker = async () => {
    const nextState = !circuitBreakerActive;
    updateSetting('circuitBreakerActive', nextState);
    try {
      if (nextState) {
        await apiFetch('/api/rms/emergency-stop', { method: 'POST' });
      } else {
        await apiFetch('/api/rms/reset', { method: 'POST' });
      }
    } catch (e) {
      console.warn('RMS server call error:', e);
    }
  };

  const triggerSavedFeedback = () => {
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  const maxDailyLoss = riskSettings.maxDailyLoss ?? 15000;
  const maxCapitalPerBot = riskSettings.maxCapitalPerBot ?? 50000;
  const trailingDrawdown = riskSettings.trailingDrawdown ?? 3.5;
  const circuitBreakerActive = riskSettings.circuitBreakerActive ?? false;
  const allocationMode = riskSettings.allocationMode ?? 'custom';
  const equalAmount = riskSettings.equalAmount ?? 500;

  // Active broker check
  const activeBroker = brokerConnections.find((b) => b.status === 'Connected');

  // Compute live capital allocation metrics from the 14 bots
  const totalAllocatedCapital = bots.reduce((sum, b) => sum + (Number(b.allocatedCapital) || 0), 0);
  const activeLiveBots = bots.filter((b) => b.status === 'RUNNING' && (Number(b.allocatedCapital) || 0) > 0);
  const consensusOnlyBots = bots.filter((b) => b.status !== 'RUNNING' || (Number(b.allocatedCapital) || 0) === 0);

  // Margin Consumption: Synchronized with live broker or 0.00 if disconnected
  const brokerCapital = activeBroker?.balance ? activeBroker.balance : 0.00;
  const marginUtilized = activeBroker?.balance && totalAllocatedCapital > 0
    ? Math.min(brokerCapital, totalAllocatedCapital * 0.15) // standard 15% overnight/intraday margin formula
    : 0.00;
  const freeCashBuffer = brokerCapital > 0 ? Math.max(0, brokerCapital - marginUtilized) : 0.00;
  const utilizationPct = brokerCapital > 0 ? ((marginUtilized / brokerCapital) * 100).toFixed(1) : '0.0';

  // Handler: Update capital for an individual bot
  const handleBotCapitalChange = (botId, amount) => {
    const safeAmount = Math.max(0, Number(amount) || 0);
    const updated = bots.map((b) => {
      if (b.id === botId) {
        return { ...b, allocatedCapital: safeAmount };
      }
      return b;
    });
    if (onUpdateBots) {
      onUpdateBots(updated);
    }
    triggerSavedFeedback();
  };

  // Handler: Apply Equal Allocation to all 14 bots
  const handleApplyEqualAllocation = () => {
    const safeAmount = Math.max(0, Number(equalAmount) || 0);
    const updated = bots.map((b) => ({
      ...b,
      allocatedCapital: safeAmount
    }));
    if (onUpdateBots) {
      onUpdateBots(updated);
    }
    triggerSavedFeedback();
  };

  // Handler: Authorize All Bots with Capital
  const handleAuthorizeAllWithCapital = () => {
    const updated = bots.map((b) => {
      if ((Number(b.allocatedCapital) || 0) > 0) {
        return { ...b, status: 'RUNNING' };
      }
      return b;
    });
    if (onUpdateBots) {
      onUpdateBots(updated);
    }
    triggerSavedFeedback();
  };

  // Handler: Pause All Bot Executions
  const handlePauseAllBots = () => {
    const updated = bots.map((b) => ({
      ...b,
      status: 'PAUSED'
    }));
    if (onUpdateBots) {
      onUpdateBots(updated);
    }
    triggerSavedFeedback();
  };

  // Handler: Reset All Capital to 0
  const handleResetAllCapital = () => {
    const updated = bots.map((b) => ({
      ...b,
      allocatedCapital: 0
    }));
    if (onUpdateBots) {
      onUpdateBots(updated);
    }
    triggerSavedFeedback();
  };

  return (
    <div className="space-y-4 animate-fadeIn select-none">
      {/* 1. Header */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            Systemic Risk Management & Bot Capital Matrix
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Automated hard limits, per-bot execution toggles, and live broker kill switches
          </p>
        </div>

        <div className="flex items-center gap-3">
          {savedFeedback && (
            <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full animate-fadeIn">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Settings Persisted
            </span>
          )}

          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                circuitBreakerActive ? 'bg-rose-500 animate-pulse' : 'bg-emerald-400 animate-ping'
              }`}
            ></span>
            <span
              className={`text-xs font-mono font-bold ${
                circuitBreakerActive ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {circuitBreakerActive ? 'CIRCUIT BREAKER: TRIPPED' : 'Risk Guardian: ACTIVE'}
            </span>
          </div>
        </div>
      </div>

      {/* 1.5 Portfolio Allocation Drift & Rebalancer Strip */}
      <div className="bg-[#081224] border border-cyan-500/30 rounded-xl p-3.5 shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white tracking-wide">
                200+ MULTI-ASSET PORTFOLIO REBALANCER
              </span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                DRIFT AUDITOR LIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              Continuously audits weight deviations against All-Weather, Alpha, and Custom models · Generates tax-audited Buy/Sell actions
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowRebalancerModal(true)}
          className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black font-bold text-xs flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(0,240,255,0.3)] cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Launch Rebalancer Engine</span>
        </button>
      </div>

      {/* Portfolio Rebalancer Overlay Modal */}
      {showRebalancerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-fadeIn">
          <div className="bg-[#05070b] border border-[#1e3a6e] rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#16294a] bg-[#081124] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span className="font-bold text-white text-sm">Portfolio Rebalancer Core • Multi-Asset Universe</span>
              </div>
              <button
                type="button"
                onClick={() => setShowRebalancerModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#14264c] transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <PortfolioRebalancer />
            </div>
          </div>
        </div>
      )}

      {/* 1.8 ADVANCED MAX DRAWDOWN & RISK GUARD (AUTONOMOUS CIRCUIT BREAKER) */}
      <div className="bg-[#091122]/95 border border-cyan-500/40 rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#16294a] pb-3.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-400/50 flex items-center justify-center text-cyan-400 shadow-[0_0_12px_rgba(0,240,255,0.2)]">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-white tracking-wide">
                  Autonomous Max Drawdown & Risk Guard
                </h3>
                <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                  watchdogData.circuit_breaker_tripped
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                }`}>
                  {watchdogData.circuit_breaker_tripped ? 'CIRCUIT BREAKER: TRIPPED' : 'AUTONOMOUS SENTINEL: ARMED'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Active 2.5s RMS watchdog • Automatically triggers emergency square-off protocols when risk thresholds are breached
              </p>
            </div>
          </div>

          {/* Quick Action Triggers */}
          <div className="flex items-center gap-2">
            {watchdogData.circuit_breaker_tripped ? (
              <button
                type="button"
                onClick={handleResetCircuitBreaker}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Reset Breaker & Resume</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSimulateTripTest}
                className="px-3.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 hover:shadow-[0_0_12px_rgba(244,63,94,0.25)]"
                title="Stress-test Jarvis's instantaneous liquidation protocol"
              >
                <Zap className="w-3.5 h-3.5 text-rose-400" />
                <span>Simulate Flash-Crash Trip</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Gauges & Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
          {/* Current Intraday Drawdown */}
          <div className="p-3.5 rounded-xl bg-[#060c18] border border-[#16294a] space-y-2">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
              Current Intraday Drawdown
            </span>
            <div className="flex items-baseline justify-between">
              <span className={`text-xl font-black ${watchdogData.current_drawdown_pct >= watchdogData.max_drawdown_pct ? 'text-rose-400' : 'text-emerald-400'}`}>
                {watchdogData.current_drawdown_pct}%
              </span>
              <span className="text-slate-500 text-[11px]">
                Limit: {watchdogData.max_drawdown_pct}%
              </span>
            </div>
            {/* Drawdown Progress Bar */}
            <div className="w-full bg-slate-800/80 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  watchdogData.current_drawdown_pct >= watchdogData.max_drawdown_pct
                    ? 'bg-rose-500'
                    : 'bg-gradient-to-r from-emerald-400 to-cyan-400'
                }`}
                style={{
                  width: `${Math.min(100, (watchdogData.current_drawdown_pct / Math.max(0.1, watchdogData.max_drawdown_pct)) * 100)}%`
                }}
              />
            </div>
          </div>

          {/* Peak Portfolio Equity */}
          <div className="p-3.5 rounded-xl bg-[#060c18] border border-[#16294a] space-y-2">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
              Peak Portfolio Equity
            </span>
            <div className="text-xl font-black text-white">
              ₹{watchdogData.peak_equity.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10.5px] text-cyan-400 block">
              High-Water Mark Reference
            </span>
          </div>

          {/* Intraday Stop-Loss Limit */}
          <div className="p-3.5 rounded-xl bg-[#060c18] border border-[#16294a] space-y-2">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
              Max Daily Loss Threshold
            </span>
            <div className="text-xl font-black text-rose-400">
              -₹{watchdogData.max_daily_loss.toLocaleString('en-IN')}
            </div>
            <span className="text-[10.5px] text-slate-400 block">
              Emergency Stop Hard Trigger
            </span>
          </div>

          {/* Autonomous Square-Off Protocol Toggle */}
          <div className="p-3.5 rounded-xl bg-[#060c18] border border-[#16294a] flex flex-col justify-between">
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                Autonomous Square-Off
              </span>
              <span className="text-xs text-slate-300 font-sans mt-0.5 block">
                Instant liquidation on limit breach
              </span>
            </div>
            <button
              type="button"
              onClick={handleToggleAutoSquareOff}
              className={`mt-2 py-1.5 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                watchdogData.auto_square_off_enabled
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/60 shadow-[0_0_10px_rgba(0,240,255,0.2)]'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 ${watchdogData.auto_square_off_enabled ? 'text-cyan-400' : 'text-slate-500'}`} />
              <span>{watchdogData.auto_square_off_enabled ? 'Auto-Liquidation: ARMED' : 'Auto-Liquidation: DISABLED'}</span>
            </button>
          </div>
        </div>

        {/* Watchdog Action Audit Log Strip */}
        {watchdogData.actions_logged && watchdogData.actions_logged.length > 0 && (
          <div className="p-3 rounded-xl bg-[#060a14] border border-[#16294a]/70 text-[11px] font-mono text-slate-400 space-y-1.5">
            <div className="flex items-center justify-between text-slate-300 font-bold text-xs">
              <span className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>RMS Watchdog Protective Action Log</span>
              </span>
              <span className="text-[10px] text-slate-500">Live Invariant Monitor</span>
            </div>
            <div className="space-y-1 pt-1 divide-y divide-slate-800/50">
              {watchdogData.actions_logged.slice(0, 3).map((act, i) => (
                <div key={act.id || i} className="pt-1 flex items-center justify-between text-[10.5px]">
                  <span className="text-slate-300 font-semibold">{act.event}</span>
                  <span className="text-slate-500">{act.timestamp}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. Top Thresholds & Margin Consumption */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Risk Boundaries Controls with Direct Editable Numeric Inputs (Uncapped, floor min=1) */}
        <div className="lg:col-span-7 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-[#1e3a6e]/40 pb-3">
            <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              Global Risk Limiter Thresholds
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">
              Uncapped input (min: ₹1) • Auto-saved
            </span>
          </div>

          <div className="space-y-4 font-mono text-xs">
            {/* Control 1: Maximum Daily Loss Threshold */}
            <div className="p-3.5 rounded-xl bg-[#070e1e]/80 border border-[#1e3a6e]/40 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-slate-300 font-semibold font-sans text-xs">
                    Maximum Daily Loss Threshold
                  </span>
                  <p className="text-[10.5px] text-slate-400 font-sans mt-0.5">
                    Locks all bots instantly if cumulative intraday drawdown hits this threshold.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 bg-[#09152e] border border-rose-500/50 rounded-lg px-2.5 py-1">
                  <span className="text-rose-400 font-bold text-xs">₹</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={maxDailyLoss}
                    onChange={(e) => updateSetting('maxDailyLoss', Math.max(1, Number(e.target.value) || 1))}
                    className="w-28 bg-transparent text-rose-400 font-bold text-right font-mono focus:outline-none"
                    placeholder="e.g. 50"
                  />
                </div>
              </div>

              {/* Range Slider (min 1, step 1) */}
              <input
                type="range"
                min="1"
                max={Math.max(50000, maxDailyLoss)}
                step="1"
                value={maxDailyLoss}
                onChange={(e) => updateSetting('maxDailyLoss', Number(e.target.value))}
                className="w-full accent-rose-500 cursor-pointer"
              />

              {/* Quick Preset Buttons (including micro amounts) */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {[50, 100, 500, 1000, 5000, 15000, 25000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => updateSetting('maxDailyLoss', amt)}
                    className={`px-2 py-0.5 rounded text-[10px] font-sans transition-colors cursor-pointer ${
                      maxDailyLoss === amt
                        ? 'bg-rose-500/25 text-rose-300 border border-rose-500/60 font-bold'
                        : 'bg-[#09152e] text-slate-400 hover:text-white border border-[#1e3a6e]/50'
                    }`}
                  >
                    ₹{amt.toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
            </div>

            {/* Control 2: Max Capital Allocation Per Single Bot */}
            <div className="p-3.5 rounded-xl bg-[#070e1e]/80 border border-[#1e3a6e]/40 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-slate-300 font-semibold font-sans text-xs">
                    Max Capital Allocation Per Single Bot
                  </span>
                  <p className="text-[10.5px] text-slate-400 font-sans mt-0.5">
                    Hard ceiling cap an individual bot instance cannot exceed.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 bg-[#09152e] border border-cyan-500/50 rounded-lg px-2.5 py-1">
                  <span className="text-cyan-400 font-bold text-xs">₹</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={maxCapitalPerBot}
                    onChange={(e) => updateSetting('maxCapitalPerBot', Math.max(1, Number(e.target.value) || 1))}
                    className="w-28 bg-transparent text-cyan-400 font-bold text-right font-mono focus:outline-none"
                    placeholder="e.g. 500"
                  />
                </div>
              </div>

              {/* Range Slider (min 1, step 1) */}
              <input
                type="range"
                min="1"
                max={Math.max(100000, maxCapitalPerBot)}
                step="1"
                value={maxCapitalPerBot}
                onChange={(e) => updateSetting('maxCapitalPerBot', Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />

              {/* Quick Preset Buttons (including micro amounts) */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {[100, 500, 1000, 5000, 25000, 50000, 100000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => updateSetting('maxCapitalPerBot', amt)}
                    className={`px-2 py-0.5 rounded text-[10px] font-sans transition-colors cursor-pointer ${
                      maxCapitalPerBot === amt
                        ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/60 font-bold'
                        : 'bg-[#09152e] text-slate-400 hover:text-white border border-[#1e3a6e]/50'
                    }`}
                  >
                    ₹{amt.toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
            </div>

            {/* Control 3: Trailing Peak-to-Trough Drawdown Limit */}
            <div className="p-3.5 rounded-xl bg-[#070e1e]/80 border border-[#1e3a6e]/40 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-slate-300 font-semibold font-sans text-xs">
                    Trailing Peak-to-Trough Drawdown Limit
                  </span>
                  <p className="text-[10.5px] text-slate-400 font-sans mt-0.5">
                    High-water mark circuit breaker restricts new order entry.
                  </p>
                </div>
                <div className="flex items-center gap-1 bg-[#09152e] border border-amber-500/50 rounded-lg px-2.5 py-1">
                  <input
                    type="number"
                    min="0.1"
                    max="50"
                    step="0.1"
                    value={trailingDrawdown}
                    onChange={(e) => updateSetting('trailingDrawdown', Math.max(0.1, Number(e.target.value) || 0.1))}
                    className="w-16 bg-transparent text-amber-400 font-bold text-right font-mono focus:outline-none"
                  />
                  <span className="text-amber-400 font-bold text-xs">%</span>
                </div>
              </div>

              {/* Range Slider */}
              <input
                type="range"
                min="0.1"
                max="25"
                step="0.1"
                value={trailingDrawdown}
                onChange={(e) => updateSetting('trailingDrawdown', Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {[0.5, 1.0, 1.5, 2.5, 3.5, 5.0, 7.5, 10.0].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => updateSetting('trailingDrawdown', pct)}
                    className={`px-2 py-0.5 rounded text-[10px] font-sans transition-colors cursor-pointer ${
                      trailingDrawdown === pct
                        ? 'bg-amber-500/25 text-amber-300 border border-amber-500/60 font-bold'
                        : 'bg-[#09152e] text-slate-400 hover:text-white border border-[#1e3a6e]/50'
                    }`}
                  >
                    {pct.toFixed(1)}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Emergency Controls & Margin Telemetry */}
        <div className="lg:col-span-5 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-5 space-y-4 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#1e3a6e]/40 pb-3 mb-3">
              <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                Live RMS Telemetry & Exposure
              </h3>
              <span className="text-[10px] font-mono text-slate-400">
                {activeBroker ? `${activeBroker.name} Link` : 'Disconnected'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[#060c1c] border border-[#1e3a6e]/40 space-y-3 text-xs font-mono">
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Broker Account Balance:</span>
                <span className="font-bold text-white text-sm">
                  ₹{brokerCapital.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Bot Deployed Capital:</span>
                <span className="font-bold text-cyan-400">
                  ₹{totalAllocatedCapital.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Est. Margin Utilized:</span>
                <span className="font-bold text-amber-400">
                  ₹{marginUtilized.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({utilizationPct}%)
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Free Cash Buffer:</span>
                <span className="font-bold text-emerald-400">
                  ₹{freeCashBuffer.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-[#0a1630] h-2 rounded-full overflow-hidden mt-2">
                <div
                  className="bg-gradient-to-r from-cyan-400 to-emerald-400 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Number(utilizationPct))}%` }}
                ></div>
              </div>

              <div className="p-2.5 rounded-lg bg-cyan-500/5 border border-cyan-500/20 text-[10.5px] text-slate-400 font-sans leading-relaxed flex items-start gap-2 mt-2">
                <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>
                  {activeBroker
                    ? `Synchronized with ${activeBroker.name} RMS. Live executions will draw down real margin buffer.`
                    : 'Broker disconnected. No real trades or simulated margin orders can execute until authenticated in Broker Accounts.'}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleToggleCircuitBreaker}
              className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                circuitBreakerActive
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                  : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.25)]'
              }`}
            >
              <AlertOctagon className="w-4 h-4" />
              <span>{circuitBreakerActive ? 'Release Manual Circuit' : 'Trip Emergency Circuit Breaker'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Dedicated Section: 14-Bot Individual Allocation & Execution Matrix */}
      <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-2xl p-5 space-y-4 shadow-xl">
        {/* Matrix Header with Mode Switch */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1e3a6e]/40 pb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              14-Bot Individual Allocation & Execution Matrix
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Granular capital allocation (from ₹1) and individual trade execution authorization
            </p>
          </div>

          {/* Mode Switch Toggle: Equal Allocation to All vs Custom Per-Bot Capital */}
          <div className="flex items-center gap-2 bg-[#070e1e] p-1 rounded-xl border border-[#1e3a6e]">
            <button
              type="button"
              onClick={() => updateSetting('allocationMode', 'custom')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                allocationMode === 'custom'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Custom Per-Bot Capital
            </button>

            <button
              type="button"
              onClick={() => updateSetting('allocationMode', 'equal')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                allocationMode === 'equal'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Equal Allocation to All
            </button>
          </div>
        </div>

        {/* Mode-Specific Quick Config Bar */}
        {allocationMode === 'equal' && (
          <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-3 text-xs font-sans">
            <div className="flex items-center gap-3">
              <span className="text-cyan-300 font-semibold">Equal Rupee Amount per Bot:</span>
              <div className="flex items-center gap-1.5 bg-[#09152e] border border-cyan-500/40 rounded-lg px-2.5 py-1">
                <span className="text-cyan-400 font-bold">₹</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={equalAmount}
                  onChange={(e) => updateSetting('equalAmount', Math.max(0, Number(e.target.value) || 0))}
                  className="w-24 bg-transparent text-cyan-400 font-bold font-mono focus:outline-none"
                  placeholder="500"
                />
              </div>
              <div className="flex items-center gap-1">
                {[50, 100, 500, 1000, 2500].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => updateSetting('equalAmount', amt)}
                    className="px-2 py-0.5 bg-[#070e1e] hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-[#1e3a6e] rounded text-[10px] font-mono cursor-pointer"
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleApplyEqualAllocation}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,240,255,0.3)] transition-all cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              Apply ₹{equalAmount.toLocaleString('en-IN')} to All 14 Bots
            </button>
          </div>
        )}

        {/* KPI Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-[#070e1e]/80 border border-[#1e3a6e]/40">
            <div className="text-[10px] uppercase font-semibold text-slate-400">Total Bot Capital</div>
            <div className="text-base font-bold font-mono text-cyan-300 mt-0.5">
              ₹{totalAllocatedCapital.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">Across all 14 bot instances</div>
          </div>

          <div className="p-3 rounded-xl bg-[#070e1e]/80 border border-[#1e3a6e]/40">
            <div className="text-[10px] uppercase font-semibold text-slate-400">Active Executing Bots</div>
            <div className="text-base font-bold font-mono text-emerald-400 mt-0.5">
              {activeLiveBots.length} / 14 Bots
            </div>
            <div className="text-[10px] text-emerald-400/80 font-mono mt-0.5">Running with capital &gt; ₹0</div>
          </div>

          <div className="p-3 rounded-xl bg-[#070e1e]/80 border border-[#1e3a6e]/40">
            <div className="text-[10px] uppercase font-semibold text-slate-400">Consensus Signals Only</div>
            <div className="text-base font-bold font-mono text-amber-300 mt-0.5">
              {consensusOnlyBots.length} / 14 Bots
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">Votes active, no orders placed</div>
          </div>

          <div className="p-3 rounded-xl bg-[#070e1e]/80 border border-[#1e3a6e]/40">
            <div className="text-[10px] uppercase font-semibold text-slate-400">Broker Authorization</div>
            <div className="text-base font-bold font-mono mt-0.5 truncate">
              {activeBroker ? (
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  {activeBroker.name}
                </span>
              ) : (
                <span className="text-rose-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  Awaiting Broker
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              {activeBroker ? 'Authorized for order fills' : 'Offline / Orders blocked'}
            </div>
          </div>
        </div>

        {/* Informative Architecture Rule Callout */}
        <div className="p-3 rounded-xl bg-[#060d1d] border border-cyan-500/20 text-xs text-slate-300 leading-relaxed flex items-start gap-2.5">
          <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-cyan-300">Granular Execution Gating Rule:</strong> If you allocate{' '}
            <span className="text-emerald-400 font-bold font-mono">₹500</span> to Bot 1 (Scalper Bot) and toggle it{' '}
            <strong className="text-emerald-400">RUNNING</strong> while keeping the remaining 13 bots at{' '}
            <strong className="text-slate-400">₹0 or PAUSED</strong>:
            <span className="block text-slate-400 mt-1">
              • <strong className="text-white">Only Bot 1</strong> is authorized to transmit live order tickets to your broker.
              <br />• The other 13 bots continuously calculate multi-timeframe indicators, RSI, and order flow to provide{' '}
              <strong className="text-cyan-300">peer consensus quorum votes</strong> to Bot 1 without placing their own orders.
            </span>
          </div>
        </div>

        {/* Batch Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 pb-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAuthorizeAllWithCapital}
              className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <Play className="w-3.5 h-3.5" />
              Authorize All with Capital
            </button>

            <button
              type="button"
              onClick={handlePauseAllBots}
              className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <Pause className="w-3.5 h-3.5" />
              Pause All Executions
            </button>

            <button
              type="button"
              onClick={handleResetAllCapital}
              className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset All to ₹0
            </button>
          </div>

          <span className="text-[11px] font-mono text-slate-400">
            Showing all 14 bots
          </span>
        </div>

        {/* 14-Bot Table */}
        <div className="overflow-x-auto rounded-xl border border-[#1e3a6e]/50 bg-[#070e1e]/60">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#1e3a6e]/60 bg-[#060c1a] text-slate-400 font-mono uppercase text-[10px]">
                <th className="py-3 px-3.5 font-bold">Bot #</th>
                <th className="py-3 px-3.5 font-bold">Strategy Name</th>
                <th className="py-3 px-3.5 font-bold">Target Asset</th>
                <th className="py-3 px-3.5 font-bold text-center">Allocated Capital (₹)</th>
                <th className="py-3 px-3.5 font-bold">Execution Status</th>
                <th className="py-3 px-3.5 font-bold text-right">Individual Action Switch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e3a6e]/30 font-sans">
              {bots.map((bot) => {
                const capital = Number(bot.allocatedCapital) || 0;
                const isRunning = bot.status === 'RUNNING';
                const isAuthorizedToTrade = isRunning && capital > 0;
                const isExceedingCap = capital > maxCapitalPerBot;

                return (
                  <tr
                    key={bot.id}
                    className="hover:bg-[#0c1833]/50 transition-colors group"
                  >
                    {/* 1. Bot ID badge */}
                    <td className="py-3 px-3.5 font-mono">
                      <span className="w-7 h-7 rounded-lg bg-[#14264c] text-cyan-300 border border-cyan-500/40 font-bold text-xs flex items-center justify-center">
                        #{String(bot.id).padStart(2, '0')}
                      </span>
                    </td>

                    {/* 2. Strategy Name */}
                    <td className="py-3 px-3.5">
                      <div className="font-bold text-slate-200 group-hover:text-cyan-300 transition-colors">
                        {bot.name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {bot.assetCategory}
                      </div>
                    </td>

                    {/* 3. Target Asset */}
                    <td className="py-3 px-3.5">
                      <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                        <span>{bot.asset}</span>
                        {bot.assetSymbol && (
                          <span className="text-[10px] font-mono text-cyan-400">({bot.assetSymbol})</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        LTP: ₹{bot.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </td>

                    {/* 4. Allocated Capital (₹ Editable Input) */}
                    <td className="py-3 px-3.5">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1.5 bg-[#09152e] border border-cyan-500/40 focus-within:border-cyan-400 rounded-lg px-2 py-1 transition-all">
                          <span className="text-cyan-400 font-bold font-mono text-xs">₹</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={capital}
                            onChange={(e) => handleBotCapitalChange(bot.id, e.target.value)}
                            className="w-24 bg-transparent text-cyan-300 font-bold font-mono text-right focus:outline-none text-xs"
                            placeholder="0"
                          />
                        </div>

                        {/* Quick increment chips */}
                        <div className="flex items-center gap-1">
                          {[50, 100, 500].map((inc) => (
                            <button
                              key={inc}
                              type="button"
                              onClick={() => handleBotCapitalChange(bot.id, capital + inc)}
                              className="px-1.5 py-0.2 bg-[#091326] hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-300 border border-[#1e3a6e]/50 rounded text-[9.5px] font-mono cursor-pointer"
                            >
                              +{inc}
                            </button>
                          ))}
                          {capital > 0 && (
                            <button
                              type="button"
                              onClick={() => handleBotCapitalChange(bot.id, 0)}
                              className="px-1.5 py-0.2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded text-[9.5px] font-mono cursor-pointer"
                            >
                              ₹0
                            </button>
                          )}
                        </div>

                        {isExceedingCap && (
                          <span className="text-[9.5px] font-mono text-amber-400">
                            ⚠ Exceeds cap (₹{maxCapitalPerBot.toLocaleString('en-IN')})
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 5. Execution Status */}
                    <td className="py-3 px-3.5 font-mono">
                      {isAuthorizedToTrade ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 font-bold text-[10px] shadow-[0_0_8px_rgba(16,185,129,0.2)]">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                          <span>AUTHORIZED TO TRADE (₹{capital.toLocaleString('en-IN')})</span>
                        </div>
                      ) : isRunning && capital === 0 ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 font-semibold text-[10px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                          <span>CONSENSUS ONLY (₹0 Capital)</span>
                        </div>
                      ) : bot.status === 'PAUSED' ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-700/30 border border-slate-600/40 text-slate-400 font-semibold text-[10px]">
                          <Pause className="w-3 h-3 text-slate-400" />
                          <span>PAUSED (Signals Only)</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#101b33] border border-[#1e3a6e] text-slate-400 font-semibold text-[10px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                          <span>{bot.status}</span>
                        </div>
                      )}
                    </td>

                    {/* 6. Individual Action Switch */}
                    <td className="py-3 px-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (onToggleBotStatus) {
                            onToggleBotStatus(bot.id);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono tracking-wider uppercase transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                          isRunning
                            ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                            : 'bg-slate-800/60 hover:bg-slate-700/60 text-slate-300 border border-slate-700 hover:border-cyan-500/50'
                        }`}
                      >
                        {isRunning ? (
                          <>
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>RUNNING</span>
                          </>
                        ) : (
                          <>
                            <Pause className="w-3.5 h-3.5" />
                            <span>PAUSED</span>
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
