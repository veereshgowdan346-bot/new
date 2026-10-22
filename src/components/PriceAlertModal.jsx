import React, { useState, useMemo } from 'react';
import {
  X,
  Bell,
  PlusCircle,
  Trash2,
  RotateCcw,
  Volume2,
  VolumeX,
  Zap,
  AlertTriangle,
  Play,
  CheckCircle2,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Sliders,
  Sparkles
} from 'lucide-react';
import {
  ALERT_TYPES,
  ALERT_CONDITIONS,
  ALERT_STATUSES
} from '../utils/priceAlertManager';

const POPULAR_ASSETS = [
  'NIFTY 50',
  'BANK NIFTY',
  'FIN NIFTY',
  'SENSEX',
  'RELIANCE',
  'TCS',
  'INFY',
  'HDFCBANK',
  'TATAMOTORS',
  'GOLD',
  'SILVER',
  'CRUDEOIL'
];

export default function PriceAlertModal({
  isOpen,
  onClose,
  alerts = [],
  onAddAlert,
  onDeleteAlert,
  onResetAlert,
  onToggleAlert,
  onTestTrigger,
  livePrices = {},
  availablePositions = []
}) {
  // Tabs: 'LIST' or 'CREATE'
  const [activeTab, setActiveTab] = useState('LIST');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Form State for creating a new alert
  const [symbol, setSymbol] = useState('NIFTY 50');
  const [alertType, setAlertType] = useState(ALERT_TYPES.ENTRY);
  const [condition, setCondition] = useState(ALERT_CONDITIONS.ABOVE);
  const [targetPrice, setTargetPrice] = useState('25150.00');
  const [note, setNote] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [formError, setFormError] = useState('');

  // Get current price of selected symbol
  const currentSymbolPrice = useMemo(() => {
    if (!symbol) return null;
    const clean = symbol.trim().toUpperCase();
    const cleanNoSpace = clean.replace(/\s+/g, '');
    return livePrices[clean] ?? livePrices[cleanNoSpace] ?? null;
  }, [symbol, livePrices]);

  // Handle symbol selection change
  const handleSelectSymbol = (sym) => {
    setSymbol(sym);
    const clean = sym.trim().toUpperCase();
    const cleanNoSpace = clean.replace(/\s+/g, '');
    const price = livePrices[clean] ?? livePrices[cleanNoSpace];
    if (price && typeof price === 'number') {
      // Suggest target based on alert type
      const suggested =
        alertType === ALERT_TYPES.ENTRY
          ? (price * 1.003).toFixed(2)
          : (price * 0.995).toFixed(2);
      setTargetPrice(suggested);
    }
  };

  // Quick percentage offset helper
  const handleApplyOffset = (pct) => {
    const base = currentSymbolPrice || Number(targetPrice) || 25000;
    const computed = (base * (1 + pct / 100)).toFixed(2);
    setTargetPrice(computed);
    if (pct > 0) {
      setCondition(ALERT_CONDITIONS.ABOVE);
    } else {
      setCondition(ALERT_CONDITIONS.BELOW);
    }
  };

  // Submit new alert
  const handleSubmitNewAlert = (e) => {
    e.preventDefault();
    setFormError('');

    const priceNum = parseFloat(targetPrice);
    if (!symbol.trim()) {
      setFormError('Please select or enter an asset symbol.');
      return;
    }
    if (isNaN(priceNum) || priceNum <= 0) {
      setFormError('Please enter a valid target price greater than 0.');
      return;
    }

    onAddAlert({
      symbol: symbol.trim().toUpperCase(),
      type: alertType,
      condition,
      targetPrice: priceNum,
      note: note.trim() || `${alertType} triggered at ₹${priceNum} (${condition})`,
      soundEnabled
    });

    // Reset and return to list
    setNote('');
    setActiveTab('LIST');
  };

  // Filtered alerts list
  const filteredAlerts = useMemo(() => {
    return alerts.filter((alt) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesSym = alt.symbol.toLowerCase().includes(q);
        const matchesNote = (alt.note || '').toLowerCase().includes(q);
        if (!matchesSym && !matchesNote) return false;
      }
      if (statusFilter === 'ACTIVE' && alt.status !== ALERT_STATUSES.ACTIVE) return false;
      if (statusFilter === 'TRIGGERED' && alt.status !== ALERT_STATUSES.TRIGGERED) return false;
      if (statusFilter === 'ENTRY' && alt.type !== ALERT_TYPES.ENTRY) return false;
      if (statusFilter === 'EXIT' && alt.type !== ALERT_TYPES.EXIT) return false;
      return true;
    });
  }, [alerts, searchQuery, statusFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-[#070d1d] border border-cyan-500/40 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Modal Header */}
        <div className="p-4 border-b border-[#16294a] flex items-center justify-between bg-gradient-to-r from-[#070d1d] via-[#09152e] to-[#070d1d]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.3)]">
              <Bell className="w-4 h-4 animate-bounce" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Real-Time Price Alerts & Threshold Engine
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  LIVE TICK SURVEILLANCE
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-sans">
                Set autonomous entry & exit price tripwires with instant audio-visual dispatch.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-Header Tabs & Quick Stats */}
        <div className="px-4 py-2.5 bg-[#050914] border-b border-[#16294a]/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-mono">
            <button
              onClick={() => setActiveTab('LIST')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'LIST'
                  ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_rgba(0,240,255,0.4)]'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white border border-slate-700'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Configured Alerts ({alerts.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('CREATE')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'CREATE'
                  ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_rgba(0,240,255,0.4)]'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white border border-slate-700'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+ New Alert Rule</span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {alerts.filter((a) => a.status === ALERT_STATUSES.ACTIVE).length} Active Watchers
            </span>
            <span>•</span>
            <span className="text-amber-400">
              {alerts.filter((a) => a.status === ALERT_STATUSES.TRIGGERED).length} Triggered
            </span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[calc(90vh-140px)]">
          {activeTab === 'CREATE' ? (
            /* CREATE ALERT FORM */
            <form onSubmit={handleSubmitNewAlert} className="space-y-4">
              {/* Asset Selection */}
              <div>
                <label className="text-xs font-mono font-semibold text-slate-300 block mb-1.5">
                  1. Target Instrument / Asset Symbol:
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {POPULAR_ASSETS.map((ast) => (
                    <button
                      key={ast}
                      type="button"
                      onClick={() => handleSelectSymbol(ast)}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono transition-all cursor-pointer border ${
                        symbol === ast
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 font-bold shadow-[0_0_8px_rgba(0,240,255,0.25)]'
                          : 'bg-slate-800/60 text-slate-400 border-slate-700/80 hover:text-slate-200'
                      }`}
                    >
                      {ast}
                    </button>
                  ))}
                </div>

                {/* Open Positions Quick Buttons */}
                {availablePositions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 mb-2">
                    <span className="text-[10px] font-mono text-slate-500 uppercase mr-1">From Positions:</span>
                    {availablePositions.map((pos) => (
                      <button
                        key={pos.id || pos.symbol}
                        type="button"
                        onClick={() => handleSelectSymbol(pos.symbol)}
                        className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-300 border border-blue-500/30 hover:bg-blue-500/20 cursor-pointer"
                      >
                        {pos.symbol} (LTP: ₹{pos.ltp})
                      </button>
                    ))}
                  </div>
                )}

                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g. NIFTY 50 25850 CE, RELIANCE, TCS"
                  className="w-full bg-[#050914] border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* Live Price Reference Bar */}
              <div className="p-3 bg-[#0a1428] rounded-xl border border-cyan-500/20 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Current Market Price ({symbol}):</span>
                <span className="font-bold text-sm text-cyan-300">
                  {currentSymbolPrice
                    ? `₹${Number(currentSymbolPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                    : 'Awaiting Live Feed (Simulated Watch)'}
                </span>
              </div>

              {/* Threshold Type & Condition */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Alert Type: ENTRY vs EXIT */}
                <div>
                  <label className="text-xs font-mono font-semibold text-slate-300 block mb-1.5">
                    2. Alert Purpose / Strategy Type:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAlertType(ALERT_TYPES.ENTRY);
                        setCondition(ALERT_CONDITIONS.ABOVE);
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-mono font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                        alertType === ALERT_TYPES.ENTRY
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                          : 'bg-slate-800/60 text-slate-400 border-slate-700'
                      }`}
                    >
                      <Zap className="w-4 h-4 text-emerald-400" />
                      <span>ENTRY THRESHOLD</span>
                      <span className="text-[9.5px] font-normal opacity-80">Buy Breakout / Dip Entry</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAlertType(ALERT_TYPES.EXIT);
                        setCondition(ALERT_CONDITIONS.BELOW);
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-mono font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                        alertType === ALERT_TYPES.EXIT
                          ? 'bg-rose-500/20 text-rose-300 border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                          : 'bg-slate-800/60 text-slate-400 border-slate-700'
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      <span>EXIT THRESHOLD</span>
                      <span className="text-[9.5px] font-normal opacity-80">Take Profit / Stop Loss</span>
                    </button>
                  </div>
                </div>

                {/* Condition: ABOVE vs BELOW */}
                <div>
                  <label className="text-xs font-mono font-semibold text-slate-300 block mb-1.5">
                    3. Trigger Breach Direction:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCondition(ALERT_CONDITIONS.ABOVE)}
                      className={`p-2.5 rounded-xl border text-xs font-mono font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                        condition === ALERT_CONDITIONS.ABOVE
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-[0_0_10px_rgba(0,240,255,0.3)]'
                          : 'bg-slate-800/60 text-slate-400 border-slate-700'
                      }`}
                    >
                      <ArrowUpRight className="w-4 h-4 text-cyan-400" />
                      <span>PRICE &gt;= TARGET</span>
                      <span className="text-[9.5px] font-normal opacity-80">Rise or Breakout</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCondition(ALERT_CONDITIONS.BELOW)}
                      className={`p-2.5 rounded-xl border text-xs font-mono font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                        condition === ALERT_CONDITIONS.BELOW
                          ? 'bg-amber-500/20 text-amber-300 border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                          : 'bg-slate-800/60 text-slate-400 border-slate-700'
                      }`}
                    >
                      <ArrowDownRight className="w-4 h-4 text-amber-400" />
                      <span>PRICE &lt;= TARGET</span>
                      <span className="text-[9.5px] font-normal opacity-80">Drop or Breakdown</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Target Price Input with Offset Shortcuts */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-mono font-semibold text-slate-300">
                    4. Target Price Threshold (₹):
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono text-slate-500">Quick Offsets:</span>
                    {[-1.0, -0.5, -0.2, 0.2, 0.5, 1.0].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => handleApplyOffset(pct)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer ${
                          pct > 0
                            ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/20'
                            : 'bg-rose-950/40 text-rose-300 border-rose-500/40 hover:bg-rose-500/20'
                        }`}
                      >
                        {pct > 0 ? `+${pct}%` : `${pct}%`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-base font-bold">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.05"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    placeholder="Enter target price..."
                    className="w-full bg-[#050914] border border-slate-700 rounded-xl pl-8 pr-4 py-2.5 text-base text-slate-100 font-mono font-bold focus:outline-none focus:border-cyan-400"
                    required
                  />
                </div>
              </div>

              {/* Strategy Note & Sound Toggle */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div className="sm:col-span-2">
                  <label className="text-xs font-mono font-semibold text-slate-300 block mb-1.5">
                    5. Strategy Rule Note (Optional):
                  </label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. 15m breakout entry, take profit, trailing stop"
                    className="w-full bg-[#050914] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-sans focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={`w-full py-2 px-3 rounded-xl border text-xs font-mono font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      soundEnabled
                        ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                        : 'bg-slate-800 text-slate-500 border-slate-700'
                    }`}
                  >
                    {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4" />}
                    <span>{soundEnabled ? 'Audio Chime ON' : 'Audio Muted'}</span>
                  </button>
                </div>
              </div>

              {formError && (
                <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300 font-mono">
                  {formError}
                </div>
              )}

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('LIST')}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-[0_0_15px_rgba(0,240,255,0.4)] flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Activate Alert Tripwire</span>
                </button>
              </div>
            </form>
          ) : (
            /* CONFIGURED ALERTS LIST */
            <div className="space-y-3">
              {/* Filter & Search Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#16294a]/60">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search asset, note..."
                    className="pl-8 pr-3 py-1 bg-[#050914] border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 w-44"
                  />
                </div>

                <div className="flex items-center gap-1 bg-[#050914] p-0.5 rounded-lg border border-slate-800 text-[11px] font-mono">
                  {['ALL', 'ACTIVE', 'TRIGGERED', 'ENTRY', 'EXIT'].map((filterKey) => (
                    <button
                      key={filterKey}
                      onClick={() => setStatusFilter(filterKey)}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        statusFilter === filterKey
                          ? 'bg-cyan-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {filterKey}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alerts List Table / Cards */}
              {filteredAlerts.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-300">No Price Alerts Found</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Create an alert rule to monitor price movements and trigger visual notifications.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('CREATE')}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition-all cursor-pointer"
                  >
                    + Add Price Alert
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAlerts.map((alt) => {
                    const isEntry = alt.type === ALERT_TYPES.ENTRY;
                    const isTriggered = alt.status === ALERT_STATUSES.TRIGGERED;
                    const isActive = alt.status === ALERT_STATUSES.ACTIVE;
                    const isAbove = alt.condition === ALERT_CONDITIONS.ABOVE;

                    // Compute live distance
                    const clean = alt.symbol.trim().toUpperCase();
                    const cleanNoSpace = clean.replace(/\s+/g, '');
                    const currentPrice = livePrices[clean] ?? livePrices[cleanNoSpace];
                    const dist = currentPrice ? currentPrice - alt.targetPrice : null;
                    const distPct = currentPrice && alt.targetPrice ? ((dist / alt.targetPrice) * 100).toFixed(2) : null;

                    return (
                      <div
                        key={alt.id}
                        className={`p-3 rounded-xl border transition-all ${
                          isTriggered
                            ? isEntry
                              ? 'bg-emerald-950/30 border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                              : 'bg-rose-950/30 border-rose-500/60 shadow-[0_0_15px_rgba(244,63,94,0.25)]'
                            : isActive
                            ? 'bg-[#081226]/80 border-[#16294a] hover:border-slate-700'
                            : 'bg-slate-900/40 border-slate-800 opacity-60'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          {/* Symbol & Tags */}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-100 font-sans text-sm">
                                {alt.symbol}
                              </span>
                              <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold uppercase border ${
                                isEntry
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              }`}>
                                {alt.type}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-1.5 py-0.2 rounded border border-slate-700">
                                {isAbove ? '>= ' : '<= '}₹{Number(alt.targetPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                              {isTriggered && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                                  TRIGGERED
                                </span>
                              )}
                            </div>

                            {alt.note && (
                              <p className="text-xs text-slate-400 mt-0.5 font-sans">
                                {alt.note}
                              </p>
                            )}

                            {/* Proximity / Distance to Target */}
                            {currentPrice && (
                              <div className="mt-1 flex items-center gap-2 text-[11px] font-mono text-slate-300">
                                <span className="text-slate-400">Live: ₹{Number(currentPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                <span>•</span>
                                <span className={dist >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                  {dist >= 0 ? '+' : ''}₹{dist.toFixed(2)} ({distPct}%) away
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                            {/* Test Trigger Button (instantly verifies alert visually) */}
                            <button
                              onClick={() => onTestTrigger && onTestTrigger(alt.id)}
                              className="px-2 py-1 rounded-lg text-[10.5px] font-mono font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 flex items-center gap-1 cursor-pointer"
                              title="Test trigger this alert immediately to verify visual banner and chime"
                            >
                              <Play className="w-3 h-3 text-cyan-400" />
                              <span>Test Trigger</span>
                            </button>

                            {/* Reset / Re-arm if triggered */}
                            {isTriggered && (
                              <button
                                onClick={() => onResetAlert && onResetAlert(alt.id)}
                                className="px-2 py-1 rounded-lg text-[10.5px] font-mono font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 cursor-pointer"
                                title="Re-arm alert"
                              >
                                <RotateCcw className="w-3 h-3 text-cyan-400" />
                                <span>Re-arm</span>
                              </button>
                            )}

                            {/* Enable/Disable Toggle */}
                            <button
                              onClick={() => onToggleAlert && onToggleAlert(alt.id)}
                              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                alt.status === ALERT_STATUSES.DISABLED
                                  ? 'bg-slate-800 text-slate-500 border-slate-700'
                                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              }`}
                              title={alt.status === ALERT_STATUSES.DISABLED ? 'Enable Alert' : 'Disable Alert'}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete Alert */}
                            <button
                              onClick={() => onDeleteAlert && onDeleteAlert(alt.id)}
                              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all cursor-pointer"
                              title="Delete Alert"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-[#050914] border-t border-[#16294a] flex items-center justify-between text-xs font-mono text-slate-400">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            Alert evaluation cycle: Real-time on every WebSocket price tick
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
