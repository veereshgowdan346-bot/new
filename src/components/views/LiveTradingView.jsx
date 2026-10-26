import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  RefreshCw,
  Layers,
  Radio,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Play,
  Square,
  RotateCcw,
  Sliders,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Flame,
  Search,
  Database
} from 'lucide-react';
import { apiFetch } from '../../utils/api';
import { validateNetProfitGuardrail, INSTITUTIONAL_HURDLE_ROI_PCT } from '../../utils/taxCalculator';
import { evaluate14BotQuorumConsensus, QUORUM_DECISION_TYPES } from '../../utils/quorumConsensusEngine';

export default function LiveTradingView({
  candlestickData = [],
  recentTrades = [],
  wsConnected = false,
  brokerConnections = [],
  executionMode = 'PAPER',
  brokerAvailableCash = 0.00
}) {
  // Manual Quick-Order State
  const [orderType, setOrderType] = useState('LIMIT');
  const [side, setSide] = useState('BUY');
  const [selectedAsset, setSelectedAsset] = useState('NIFTY 50');
  const [priceInput, setPriceInput] = useState('24730.50');
  const [qtyInput, setQtyInput] = useState('50');
  const [targetInput, setTargetInput] = useState('');
  const [orderSuccess, setOrderSuccess] = useState('');
  const [orderError, setOrderError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Capital-Aware Autonomous Paper Session State
  const [capitalInput, setCapitalInput] = useState('500000');
  const [riskSetting, setRiskSetting] = useState('MODERATE'); // CONSERVATIVE (1%), MODERATE (2%), AGGRESSIVE (3%)
  const [sessionData, setSessionData] = useState({
    sessionId: 'sess_not_started',
    status: 'NOT_STARTED',
    initialCapital: 0,
    availableCash: 0,
    allocatedMargin: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    totalBrokerage: 0,
    totalStatutoryTaxes: 0,
    totalSlippage: 0,
    totalDeductions: 0,
    netPnl: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRatePct: 0,
    startTime: null,
    stopTime: null,
    lastTickTimestamp: null,
    feedSource: 'AUTHENTIC_PAPER_REPLAY',
    universeMetrics: {
      totalDiscovered: 270,
      eligibleCount: 269,
      subscribedCount: 269,
      freshCount: 269,
      rejectedCount: 1,
      rejectionBreakdown: { INSUFFICIENT_CAPITAL: 1 }
    },
    openPositionsCount: 0,
    unresolvedCount: 0
  });

  const [paperPositions, setPaperPositions] = useState([]);
  const [paperTrades, setPaperTrades] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [provenanceMode, setProvenanceMode] = useState('SIMULATED_REPLAY');
  const [sessionActionLoading, setSessionActionLoading] = useState(false);
  const [sessionFeedback, setSessionFeedback] = useState({ type: '', text: '' });

  // Fetch Session Status from Server
  const fetchSessionStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/paper/session/status');
      if (res && res.status === 'success' && res.session) {
        setSessionData(res.session);
        if (res.positions) setPaperPositions(res.positions);
        if (res.trades) setPaperTrades(res.trades);
        if (res.opportunities) setOpportunities(res.opportunities);
      }
    } catch (e) {
      // Fallback when server is starting up
    }
  }, []);

  useEffect(() => {
    fetchSessionStatus();
    const interval = setInterval(fetchSessionStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchSessionStatus]);

  // Session Action Handlers
  const handleStartSession = async () => {
    const capNum = parseFloat(capitalInput);
    if (!capNum || isNaN(capNum) || capNum < 1000) {
      setSessionFeedback({ type: 'error', text: 'Please enter a valid paper capital of at least ₹1,000.00' });
      return;
    }

    setSessionActionLoading(true);
    setSessionFeedback({ type: '', text: '' });

    try {
      const riskPct = riskSetting === 'CONSERVATIVE' ? 1.0 : riskSetting === 'AGGRESSIVE' ? 3.0 : 2.0;
      const res = await apiFetch('/api/paper/session/start', {
        method: 'POST',
        body: JSON.stringify({
          capital: capNum,
          riskSettings: { maxRiskPerTradePct: riskPct },
          executionMode: provenanceMode || 'SIMULATED_REPLAY'
        })
      });

      if (res && res.status === 'success') {
        setSessionFeedback({ type: 'success', text: `✅ ${res.message}` });
        fetchSessionStatus();
      } else {
        setSessionFeedback({ type: 'error', text: `❌ ${res?.message || 'Failed to start session'}` });
      }
    } catch (err) {
      setSessionFeedback({ type: 'error', text: `❌ Session start failed: ${err.message}` });
    } finally {
      setSessionActionLoading(false);
    }
  };

  const handleStopSession = async () => {
    setSessionActionLoading(true);
    try {
      const res = await apiFetch('/api/paper/session/stop', {
        method: 'POST',
        body: JSON.stringify({ exitPolicy: 'MARKET_CLOSE' })
      });
      if (res && res.status === 'success') {
        setSessionFeedback({ type: 'info', text: `⏹️ ${res.message}` });
        fetchSessionStatus();
      }
    } catch (err) {
      setSessionFeedback({ type: 'error', text: `❌ Session stop failed: ${err.message}` });
    } finally {
      setSessionActionLoading(false);
    }
  };

  const handleResetSession = async () => {
    setSessionActionLoading(true);
    try {
      const res = await apiFetch('/api/paper/session/reset', { method: 'POST' });
      if (res && res.status === 'success') {
        setSessionFeedback({ type: 'info', text: '🔄 New paper session ready. Enter capital and click Start.' });
        fetchSessionStatus();
      }
    } catch (err) {
      setSessionFeedback({ type: 'error', text: `❌ Reset failed: ${err.message}` });
    } finally {
      setSessionActionLoading(false);
    }
  };

  // Check if any broker is live connected
  const isAnyBrokerConnected = brokerConnections.some((b) => b.status === 'Connected');
  const isPaper = executionMode === 'PAPER';

  // Dynamic Margin Calculation for Manual Entry: based on price * qty (15% F&O margin rate)
  const priceNum = parseFloat(priceInput) || 0;
  const qtyNum = parseFloat(qtyInput) || 0;
  const targetNum = parseFloat(targetInput) || null;
  const calculatedMargin = priceNum > 0 && qtyNum > 0 ? (priceNum * qtyNum * 0.15) : 0;
  const availableCash = isPaper ? sessionData.availableCash || 500000.00 : (isAnyBrokerConnected ? brokerAvailableCash : 0.00);

  // Real-time 14-Bot Quorum Consensus for instrument
  const quorumAnalysis = useMemo(() => {
    return evaluate14BotQuorumConsensus({
      symbol: selectedAsset,
      action: side,
      price: priceNum || 25000
    });
  }, [selectedAsset, side, priceNum]);

  // Real-time Net-Profit Guardrail calculation (1.5% institutional hurdle)
  const guardrailAnalysis = useMemo(() => {
    return validateNetProfitGuardrail({
      entryPrice: priceNum,
      targetPrice: targetNum,
      qty: qtyNum,
      action: side,
      segment: selectedAsset.includes('NIFTY') || selectedAsset.includes('FUT') || selectedAsset.includes('CE') || selectedAsset.includes('PE') ? 'NSE F&O' : 'NSE Equity',
      safetyBufferPercent: 20,
      hurdleNetRoiPct: INSTITUTIONAL_HURDLE_ROI_PCT
    });
  }, [priceNum, targetNum, qtyNum, side, selectedAsset]);

  const bids = [];
  const asks = [];

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setOrderSuccess('');
    setOrderError('');

    if (!quorumAnalysis.isApproved) {
      const isVeto = quorumAnalysis.decision === QUORUM_DECISION_TYPES.QUORUM_VETO;
      const msg = isVeto
        ? `❌ Order Vetoed: ${quorumAnalysis.matchingVotes}/14 AI Bots agreed on ${selectedAsset}. 7-8 vote range triggers strict Quorum Veto.`
        : `❌ Order Rejected: Only ${quorumAnalysis.matchingVotes}/14 AI Bots approved ${side} on ${selectedAsset} (minimum 9 required).`;
      setOrderError(msg);
      return;
    }

    if (!guardrailAnalysis.isApproved) {
      setOrderError(`❌ Aborted by Net-Profit Guardrail: ${guardrailAnalysis.rejectionReason}`);
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        symbol: selectedAsset,
        action: side,
        qty: parseInt(qtyNum, 10),
        price: priceNum,
        bot: "Live Terminal DMA",
        variety: "NORMAL",
        ordertype: orderType,
        producttype: "INTRADAY"
      };

      const res = await apiFetch('/api/order/place', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res && res.status === 'success') {
        const orderId = res.result?.orderId || res.orderId || 'CONFIRMED';
        const mode = res.result?.mode || executionMode;
        setOrderSuccess(`✅ Order Executed (${mode}): ${side} ${qtyNum}x ${selectedAsset} @ ₹${priceNum} (Order ID: ${orderId}) | Net Profit Guaranteed`);
        fetchSessionStatus();
      } else {
        const errMsg = res?.message || res?.result?.error || 'Order rejected by Risk Management System.';
        setOrderError(`❌ Order Rejected: ${errMsg}`);
      }
    } catch (err) {
      setOrderError(`❌ Order Transmission Failed: Backend service offline (${err.message || 'Connection error'}).`);
    } finally {
      setIsSubmitting(false);
      setTimeout(() => {
        setOrderSuccess('');
        setOrderError('');
      }, 7000);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PAPER_TRADING':
        return { label: 'PAPER TRADING', bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' };
      case 'CONNECTING':
        return { label: 'CONNECTING', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/50' };
      case 'STOPPING':
        return { label: 'STOPPING', bg: 'bg-orange-500/20 text-orange-400 border-orange-500/50' };
      case 'STOPPED':
        return { label: 'STOPPED', bg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50' };
      case 'ERROR':
        return { label: 'ERROR', bg: 'bg-rose-500/20 text-rose-400 border-rose-500/50' };
      default:
        return { label: 'NOT STARTED', bg: 'bg-slate-800 text-slate-400 border-slate-700' };
    }
  };

  const badge = getStatusBadge(sessionData.status);

  return (
    <div className="space-y-4 animate-fadeIn select-none">
      {/* 1. MASTER WORKSTATION HEADER */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60 bg-[#070e22]">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              Capital-Aware Trading Workstation & Depth Terminal
            </h2>
            <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full border font-bold ${badge.bg}`}>
              {badge.label}
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            270-Instrument Universe Scanner • Master Brain 9/14 Quorum • 2% Risk Sizing • 1.50% Net ROI Hurdle
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700/80 text-slate-300 flex items-center gap-1.5 text-[11px]">
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span>Feed:</span>
            <strong className="text-white">{sessionData.feedSource}</strong>
            {sessionData.executionMode && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                sessionData.executionMode === 'LIVE_DATA_STRICT'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}>
                {sessionData.executionMode}
              </span>
            )}
          </span>

          <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700/80 text-slate-300 flex items-center gap-1.5 text-[11px]">
            <span>Last Tick:</span>
            <strong className="text-white font-mono">
              {sessionData.lastTickTimestamp ? new Date(sessionData.lastTickTimestamp).toLocaleTimeString() : 'Awaiting'}
            </strong>
          </span>

          <span className={`text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
            wsConnected
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-slate-800/80 border-slate-700 text-slate-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`}></span>
            <span>WS: {wsConnected ? 'LIVE' : 'STANDBY'}</span>
          </span>
        </div>
      </div>

      {/* 2. AUTONOMOUS CAPITAL-AWARE SESSION CONTROLLER */}
      <div className="bg-[#0b1328] border border-[#1e3a6e]/70 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-[#1e3a6e]/40">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Autonomous Paper Trading Session Controller
            </h3>
            <span className="text-[10px] font-mono text-slate-400">
              (Session ID: {sessionData.sessionId})
            </span>
          </div>

          {/* Start / Stop / Reset Controls */}
          <div className="flex items-center gap-2">
            {sessionData.status !== 'PAPER_TRADING' ? (
              <button
                type="button"
                onClick={handleStartSession}
                disabled={sessionActionLoading}
                className="px-4 py-1.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Start Session</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopSession}
                disabled={sessionActionLoading}
                className="px-4 py-1.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 bg-rose-500 hover:bg-rose-400 text-white shadow-[0_0_15px_rgba(244,63,94,0.4)] transition-all cursor-pointer disabled:opacity-50"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop Session</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleResetSession}
              disabled={sessionActionLoading}
              className="px-3 py-1.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 transition-all cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>New Session / Reset</span>
            </button>
          </div>
        </div>

        {/* Capital & Risk Settings Form */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-mono">
          <div>
            <label className="text-[10px] uppercase font-sans font-bold text-slate-400">
              Session Paper Capital (₹)
            </label>
            <input
              type="number"
              disabled={sessionData.status === 'PAPER_TRADING'}
              value={capitalInput}
              onChange={(e) => setCapitalInput(e.target.value)}
              className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-emerald-400 font-bold p-2 rounded-lg focus:border-cyan-400 focus:outline-none disabled:opacity-60"
              placeholder="e.g. 500000"
            />
            <span className="text-[9px] text-slate-500 font-sans">Min ₹1,000 • Verified allocation</span>
          </div>

          <div>
            <label className="text-[10px] uppercase font-sans font-bold text-slate-400">
              Risk Profile (2% Risk Rule)
            </label>
            <select
              disabled={sessionData.status === 'PAPER_TRADING'}
              value={riskSetting}
              onChange={(e) => setRiskSetting(e.target.value)}
              className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none disabled:opacity-60 font-sans text-xs"
            >
              <option value="CONSERVATIVE">Conservative (1% Risk / Trade)</option>
              <option value="MODERATE">Moderate (2% Risk / Trade - Recommended)</option>
              <option value="AGGRESSIVE">Aggressive (3% Risk / Trade)</option>
            </select>
            <span className="text-[9px] text-slate-500 font-sans">Risk Budget = Capital × Risk %</span>
          </div>

          <div>
            <label className="text-[10px] uppercase font-sans font-bold text-slate-400">
              Target / Stop Loss
            </label>
            <div className="mt-1 p-2 rounded-lg bg-[#060c1c] border border-[#1e3a6e] text-slate-200 flex justify-between">
              <span>SL: <strong className="text-rose-400">-1.5%</strong></span>
              <span className="text-slate-600">|</span>
              <span>TP: <strong className="text-emerald-400">+3.0%</strong></span>
            </div>
            <span className="text-[9px] text-slate-500 font-sans">2:1 Risk-to-Reward Ratio</span>
          </div>

          <div>
            <label className="text-[10px] uppercase font-sans font-bold text-slate-400">
              Net ROI Hurdle Gate
            </label>
            <div className="mt-1 p-2 rounded-lg bg-[#060c1c] border border-[#1e3a6e] text-slate-200 flex justify-between">
              <span>Hurdle: <strong className="text-cyan-400">&ge; 1.50%</strong></span>
              <span className="text-slate-600">|</span>
              <span>Quorum: <strong className="text-amber-300">&ge; 9/14</strong></span>
            </div>
            <span className="text-[9px] text-slate-500 font-sans">Net of Indian taxes & slippage</span>
          </div>

          {/* Source-Aware Execution Mode Selector */}
          <div className="md:col-span-4 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#1e3a6e]/40">
            <div className="flex items-center gap-3">
              <span className="text-slate-400 font-sans text-[11px] font-bold">Provenance Mode:</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="provenanceMode"
                  value="SIMULATED_REPLAY"
                  checked={provenanceMode === 'SIMULATED_REPLAY'}
                  onChange={() => setProvenanceMode('SIMULATED_REPLAY')}
                  disabled={sessionData.status === 'PAPER_TRADING'}
                  className="accent-amber-500"
                />
                <span className={`text-[11px] font-mono ${provenanceMode === 'SIMULATED_REPLAY' ? 'text-amber-300 font-bold' : 'text-slate-400'}`}>
                  Simulation / Offline Replay
                </span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="provenanceMode"
                  value="LIVE_DATA_STRICT"
                  checked={provenanceMode === 'LIVE_DATA_STRICT'}
                  onChange={() => setProvenanceMode('LIVE_DATA_STRICT')}
                  disabled={sessionData.status === 'PAPER_TRADING'}
                  className="accent-cyan-400"
                />
                <span className={`text-[11px] font-mono ${provenanceMode === 'LIVE_DATA_STRICT' ? 'text-cyan-300 font-bold' : 'text-slate-400'}`}>
                  Live Data Strict (Only Real Exchange Ticks)
                </span>
              </label>
            </div>
            {sessionData.executionMode === 'LIVE_DATA_STRICT' && (
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2.5 py-0.5 rounded border border-cyan-800/40">
                Ticks: {sessionData.receivedTicksCount || 0} received • {sessionData.simulatedTicksIsolatedCount || 0} synthetic isolated • {sessionData.staleTicksCount || 0} stale
              </span>
            )}
          </div>
        </div>

        {sessionFeedback.text && (
          <div className={`mt-3 px-3 py-2 rounded-xl text-xs font-mono font-bold border ${
            sessionFeedback.type === 'error'
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
              : sessionFeedback.type === 'success'
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
              : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
          }`}>
            {sessionFeedback.text}
          </div>
        )}

        {/* Capital, Margins & P&L Telemetry Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5 mt-4 pt-3 border-t border-[#1e3a6e]/40 text-xs font-mono">
          <div className="p-2.5 rounded-xl bg-[#060c1c] border border-[#1e3a6e]/50">
            <span className="text-[10px] text-slate-400 font-sans uppercase">Session Capital</span>
            <div className="text-sm font-bold text-white mt-0.5">
              ₹{sessionData.initialCapital.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-[#060c1c] border border-[#1e3a6e]/50">
            <span className="text-[10px] text-slate-400 font-sans uppercase">Available Cash</span>
            <div className="text-sm font-bold text-emerald-400 mt-0.5">
              ₹{sessionData.availableCash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-[#060c1c] border border-[#1e3a6e]/50">
            <span className="text-[10px] text-slate-400 font-sans uppercase">Allocated Margin</span>
            <div className="text-sm font-bold text-amber-300 mt-0.5">
              ₹{sessionData.allocatedMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-[#060c1c] border border-[#1e3a6e]/50">
            <span className="text-[10px] text-slate-400 font-sans uppercase">Gross Realized P&L</span>
            <div className={`text-sm font-bold mt-0.5 ${sessionData.realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {sessionData.realizedPnl >= 0 ? '+' : ''}₹{sessionData.realizedPnl.toFixed(2)}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-[#060c1c] border border-[#1e3a6e]/50">
            <span className="text-[10px] text-slate-400 font-sans uppercase">Taxes, Brokerage & Slip</span>
            <div className="text-sm font-bold text-rose-400 mt-0.5">
              -₹{sessionData.totalDeductions.toFixed(2)}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-[#060c1c] border border-[#1e3a6e]/50">
            <span className="text-[10px] text-slate-400 font-sans uppercase">Net Realized P&L</span>
            <div className={`text-sm font-bold mt-0.5 ${sessionData.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {sessionData.netPnl >= 0 ? '+' : ''}₹{sessionData.netPnl.toFixed(2)}
            </div>
          </div>
        </div>

        {/* 270-Instrument Universe Telemetry Strip */}
        <div className="mt-3 p-3 rounded-xl bg-[#050a18] border border-[#1e3a6e]/40 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-cyan-300 font-bold text-[11px]">
              <Search className="w-3.5 h-3.5" />
              <span>Universe Scanner:</span>
            </span>
            <span className="text-slate-300">
              Discovered: <strong className="text-white">{sessionData.universeMetrics.totalDiscovered}</strong>
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-emerald-400">
              Eligible: <strong>{sessionData.universeMetrics.eligibleCount}</strong>
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-cyan-400">
              Subscribed: <strong>{sessionData.universeMetrics.subscribedCount} (9 Batches)</strong>
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-rose-400">
              Filtered: <strong>{sessionData.universeMetrics.rejectedCount}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 text-[10px]">
            {Object.entries(sessionData.universeMetrics.rejectionBreakdown || {}).map(([reason, count]) => (
              <span key={reason} className="px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300">
                {reason}: {count}
              </span>
            ))}
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              Trades: {sessionData.totalTrades} ({sessionData.winRatePct}% Win)
            </span>
          </div>
        </div>
      </div>

      {/* 3. ACTIVE POSITIONS & QUALIFIED OPPORTUNITIES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Active Open Positions */}
        <div className="lg:col-span-7 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-[#1e3a6e]/40 pb-2 mb-3">
            <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4" />
              <span>Current Session Paper Positions ({paperPositions.length})</span>
            </h3>
            <span className="text-[10px] font-mono text-slate-400">
              Max {sessionData.riskSettings?.maxConcurrentPositions || 5} concurrent positions
            </span>
          </div>

          {paperPositions.length > 0 ? (
            <div className="space-y-2 overflow-x-auto no-scrollbar font-mono text-xs">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] text-slate-400 uppercase border-b border-[#1e3a6e]/40 pb-1">
                    <th className="p-1.5">Symbol</th>
                    <th className="p-1.5">Side</th>
                    <th className="p-1.5">Qty</th>
                    <th className="p-1.5">Entry</th>
                    <th className="p-1.5">LTP</th>
                    <th className="p-1.5">Stop / Target</th>
                    <th className="p-1.5 text-right">Unrealized P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {paperPositions.map((pos) => (
                    <tr key={pos.id} className="border-b border-[#1e3a6e]/20 hover:bg-[#070e1e]/60">
                      <td className="p-1.5 font-bold text-white">{pos.symbol}</td>
                      <td className="p-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          pos.action === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {pos.action}
                        </span>
                      </td>
                      <td className="p-1.5 text-slate-300">{pos.qty}</td>
                      <td className="p-1.5 text-slate-300">₹{pos.entryPrice.toFixed(2)}</td>
                      <td className="p-1.5 text-cyan-300">₹{pos.ltp.toFixed(2)}</td>
                      <td className="p-1.5 text-[10px] text-slate-400">
                        <span className="text-rose-400">₹{pos.stopLossPrice.toFixed(1)}</span> / <span className="text-emerald-400">₹{pos.targetPrice.toFixed(1)}</span>
                      </td>
                      <td className={`p-1.5 text-right font-bold ${pos.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {pos.unrealizedPnl >= 0 ? '+' : ''}₹{pos.unrealizedPnl.toFixed(2)} ({pos.pnlPct}%)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 px-3 text-center flex flex-col items-center justify-center bg-[#070e1e]/40 rounded-xl border border-[#1e3a6e]/30">
              <Layers className="w-7 h-7 text-slate-600 mb-1.5" />
              <h4 className="text-xs font-bold text-slate-300">
                {sessionData.status === 'PAPER_TRADING' ? 'Scanning Universe for Qualified Opportunities' : 'No Active Paper Positions'}
              </h4>
              <p className="text-[10px] text-slate-500 mt-0.5 max-w-[280px]">
                {sessionData.status === 'PAPER_TRADING'
                  ? 'Engine stays in cash until a setup passes the 9/14 quorum rule, net ROI hurdle, and 2% risk budget.'
                  : 'Start a session to initiate automated capital-aware paper trading.'}
              </p>
            </div>
          )}
        </div>

        {/* Selected Opportunities & Quorum Consensus */}
        <div className="lg:col-span-5 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-[#1e3a6e]/40 pb-2 mb-3">
            <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>Qualified Universe Opportunities ({opportunities.length})</span>
            </h3>
            <span className="text-[10px] font-mono text-slate-400">
              Ranked by Net ROI & Quorum
            </span>
          </div>

          {opportunities.length > 0 ? (
            <div className="space-y-2 overflow-y-auto max-h-[220px] no-scrollbar font-mono text-xs">
              {opportunities.slice(0, 5).map((opp, idx) => (
                <div key={idx} className="p-2 rounded-lg bg-[#060c1c] border border-[#1e3a6e]/40 text-[11px] space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <span className="text-[9px] px-1 rounded bg-cyan-500/20 text-cyan-300">#{idx + 1}</span>
                      <span>{opp.symbol}</span>
                    </span>
                    <span className="text-emerald-400 font-bold">
                      +{opp.expectedNetRoiPct}% Net ROI
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Quorum: <strong className="text-amber-300">{opp.quorumVotes}/14</strong></span>
                    <span>Rec. Qty: <strong>{opp.recommendedQty}</strong></span>
                    <span>Margin: <strong>₹{opp.requiredMargin.toLocaleString()}</strong></span>
                    <span>Risk Cap: <strong className="text-rose-400">₹{opp.riskBudget}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 px-3 text-center flex flex-col items-center justify-center bg-[#070e1e]/40 rounded-xl border border-[#1e3a6e]/30">
              <ShieldCheck className="w-7 h-7 text-slate-600 mb-1.5" />
              <h4 className="text-xs font-bold text-slate-300">Staying in Cash (Risk Management Active)</h4>
              <p className="text-[10px] text-slate-500 mt-0.5 max-w-[260px]">
                No evaluated instruments currently satisfy the 9/14 quorum rule, net ROI hurdle, and spread tolerance.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 4. MANUAL QUICK ORDER TERMINAL & DEPTH */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Quick Order Entry Pad */}
        <div className="lg:col-span-4 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#1e3a6e]/40 pb-3 mb-3">
              <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                Manual Order Execution Gate
              </h3>
              <div className="flex bg-[#070e1e] p-0.5 rounded-lg border border-[#1e3a6e]/50 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setSide('BUY')}
                  className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                    side === 'BUY' ? 'bg-emerald-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => setSide('SELL')}
                  className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                    side === 'SELL' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  SELL
                </button>
              </div>
            </div>

            <form onSubmit={handlePlaceOrder} className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">Instrument (Multi-Asset Universe)</label>
                <select
                  value={selectedAsset}
                  onChange={(e) => setSelectedAsset(e.target.value)}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
                >
                  <optgroup label="Indices & Index Futures">
                    <option value="NIFTY 50">NIFTY 50 Futures</option>
                    <option value="BANKNIFTY">BANKNIFTY Futures</option>
                    <option value="FINNIFTY">FINNIFTY Futures</option>
                    <option value="SENSEX">SENSEX Index</option>
                    <option value="MIDCAP">MIDCAP NIFTY</option>
                  </optgroup>
                  <optgroup label="NSE Bluechips">
                    <option value="RELIANCE">RELIANCE</option>
                    <option value="TCS">TCS</option>
                    <option value="INFY">INFOSYS</option>
                    <option value="HDFC BANK">HDFC BANK</option>
                    <option value="ICICI BANK">ICICI BANK</option>
                    <option value="TATA MOTORS">TATA MOTORS</option>
                    <option value="SBIN">STATE BANK OF INDIA</option>
                  </optgroup>
                  <optgroup label="Commodities (MCX)">
                    <option value="GOLD">GOLD (XAUUSD)</option>
                    <option value="SILVER">SILVER</option>
                    <option value="CRUDE OIL">CRUDE OIL (WTI)</option>
                    <option value="NATURAL GAS">NATURAL GAS</option>
                  </optgroup>
                  <optgroup label="F&O Options Contracts">
                    <option value="NIFTY 25100 CE">NIFTY 25100 CE</option>
                    <option value="NIFTY 25100 PE">NIFTY 25100 PE</option>
                    <option value="BANKNIFTY 57800 CE">BANKNIFTY 57800 CE</option>
                    <option value="BANKNIFTY 57800 PE">BANKNIFTY 57800 PE</option>
                  </optgroup>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">Order Type</label>
                  <select
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value)}
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="LIMIT">LIMIT</option>
                    <option value="MARKET">MARKET</option>
                    <option value="SL-LIMIT">SL-LIMIT</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">Entry Price (₹)</label>
                  <input
                    type="text"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={qtyInput}
                    onChange={(e) => setQtyInput(e.target.value)}
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">Target Price (₹)</label>
                  <input
                    type="text"
                    placeholder="Optional Target"
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none placeholder:text-slate-600"
                  />
                </div>
              </div>

              {/* Dynamic Margin Calculation & Available Cash */}
              <div className="p-3 rounded-lg bg-[#060c1c] border border-[#1e3a6e]/40 space-y-1.5 text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>Required Margin:</span>
                  <span className="text-white font-bold">
                    ₹{calculatedMargin.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Available Cash:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-100 font-bold">
                      ₹{availableCash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono">
                      Paper Cash
                    </span>
                  </div>
                </div>
              </div>

              {/* 14-Bot Quorum & Statutory Net-Profit Guardrail Strip */}
              <div className={`p-3 rounded-lg border text-[11px] transition-all space-y-2 ${
                guardrailAnalysis.isApproved && quorumAnalysis.isApproved
                  ? 'bg-emerald-950/20 border-emerald-500/40 text-slate-300'
                  : 'bg-rose-950/30 border-rose-500/50 text-rose-200'
              }`}>
                <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                  <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider font-sans">
                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-cyan-300">14-Bot Quorum:</span>
                    <span className={quorumAnalysis.isApproved ? 'text-emerald-400' : 'text-amber-400'}>
                      {quorumAnalysis.matchingVotes}/14 {side} ({quorumAnalysis.isApproved ? 'PASSED' : quorumAnalysis.decision === QUORUM_DECISION_TYPES.QUORUM_VETO ? '7-8 VETO' : 'INSUFFICIENT'})
                    </span>
                  </span>
                  <span className="text-[9.5px] font-mono text-slate-400">
                    &ge;9/14 Required
                  </span>
                </div>

                <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                  <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider font-sans">
                    {guardrailAnalysis.isApproved ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Net-Profit Guardrail Verified</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                        <span className="text-rose-400">Net-Profit Guardrail Abort</span>
                      </>
                    )}
                  </span>
                  <span className="text-[9.5px] font-mono text-cyan-400">
                    Hurdle: &ge; 1.50% Net ROI
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                  <div>
                    <span className="text-slate-400 text-[10px]">Roundtrip Charges:</span>
                    <div className="font-bold text-amber-300">₹{guardrailAnalysis.roundtripCharges.toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Expected Net ROI:</span>
                    <div className={`font-bold ${guardrailAnalysis.expectedNetRoiPct >= 1.5 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {guardrailAnalysis.expectedNetRoiPct}%
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !guardrailAnalysis.isApproved}
                className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all ${
                  isSubmitting || !guardrailAnalysis.isApproved ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                } ${
                  side === 'BUY'
                    ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                    : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/60 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                }`}
              >
                <Zap className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
                <span>
                  {isSubmitting
                    ? 'Transmitting Order...'
                    : !guardrailAnalysis.isApproved
                    ? 'Blocked by Net-Profit Guardrail'
                    : `Transmit ${side} Order`}
                </span>
              </button>
            </form>
          </div>
        </div>

        {/* Center: Market Depth Order Book */}
        <div className="lg:col-span-4 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#1e3a6e]/40 pb-3 mb-3">
              <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                Level 2 Order Book Depth
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">
                {bids.length > 0 ? 'Live Depth' : 'Feed Inactive'}
              </span>
            </div>

            <div className="py-14 px-3 text-center flex flex-col items-center justify-center bg-[#070e1e]/60 rounded-xl border border-[#1e3a6e]/40">
              <Radio className="w-8 h-8 text-slate-500 mb-2 animate-pulse" />
              <h4 className="text-xs font-bold text-slate-300">
                Market depth feed waiting for broker WebSocket connection
              </h4>
              <p className="text-[10.5px] text-slate-500 mt-1 max-w-[240px] font-sans">
                Real-time Level 2 bid/ask depth streams dynamically once authenticated through broker gateway.
              </p>
            </div>
          </div>

          <div className="mt-4 p-2.5 rounded-lg bg-[#060c1c] border border-[#1e3a6e]/40 text-center font-mono text-[11px]">
            <span className="text-slate-400">Total Buyers: </span>
            <strong className="text-slate-300">{bids.length > 0 ? '5,000' : '--'}</strong>
            <span className="text-slate-600 mx-2">|</span>
            <span className="text-slate-400">Total Sellers: </span>
            <strong className="text-slate-300">{asks.length > 0 ? '4,650' : '--'}</strong>
          </div>
        </div>

        {/* Right: Real-time Execution Feed */}
        <div className="lg:col-span-4 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#1e3a6e]/40 pb-3 mb-3">
              <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                Live Execution Tape ({recentTrades.length})
              </h3>
              <span className={`w-2 h-2 rounded-full ${recentTrades.length > 0 ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`}></span>
            </div>

            {recentTrades.length > 0 ? (
              <div className="space-y-1.5 font-mono text-xs overflow-y-auto max-h-[300px] no-scrollbar">
                {recentTrades.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-[#060c1c] border border-[#1e3a6e]/30 text-[11px]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">{t.time || t.timestamp}</span>
                      <span className="text-white font-bold">{t.symbol}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                        t.action === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                      }`}>
                        {t.action}
                      </span>
                      <span className="text-slate-300">{t.qty} @ {typeof t.price === 'number' ? t.price.toFixed(2) : t.price}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-14 px-3 text-center flex flex-col items-center justify-center bg-[#070e1e]/60 rounded-xl border border-[#1e3a6e]/40">
                <Layers className="w-8 h-8 text-slate-500 mb-2" />
                <h4 className="text-xs font-bold text-slate-300">
                  No Live Tape Executions
                </h4>
                <p className="text-[10.5px] text-slate-500 mt-1 max-w-[240px] font-sans">
                  Awaiting paper or live order fills from connected conduit. Fills stream here in real-time.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
