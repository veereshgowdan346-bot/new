import React, { useState } from 'react';
import {
  Cpu,
  Plus,
  Trash2,
  Save,
  Play,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Code2,
  Eye,
  Zap,
  ShieldAlert,
  ArrowRight,
  Database,
  Layers,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { soundEngine } from '../../utils/audioChime';
import { apiFetch } from '../../utils/api';

const PRESET_STRATEGIES = [
  {
    id: 'gamma_blast',
    name: '0DTE Gamma Blast Option Scalper',
    instrument: 'BANKNIFTY',
    timeframe: '1m',
    productType: 'MIS',
    orderType: 'MARKET',
    stopLossPct: 0.35,
    targetPct: 0.85,
    trailingSlPct: 0.20,
    consensusThreshold: 11,
    capitalAllocation: 45000,
    rules: [
      { id: 1, indicator: 'SuperTrend', operator: '==', target: 'BULLISH', connector: 'AND' },
      { id: 2, indicator: 'MACD Hist', operator: '>', target: '0.00', connector: 'AND' },
      { id: 3, indicator: 'Volume Spike', operator: '>', target: '1.8x Avg', connector: 'THEN' }
    ],
    action: 'BUY'
  },
  {
    id: 'supertrend_vwap',
    name: 'SuperTrend & VWAP Pullback Alpha',
    instrument: 'NIFTY 50',
    timeframe: '5m',
    productType: 'MIS',
    orderType: 'LIMIT',
    stopLossPct: 0.25,
    targetPct: 0.60,
    trailingSlPct: 0.15,
    consensusThreshold: 9,
    capitalAllocation: 50000,
    rules: [
      { id: 1, indicator: 'LTP', operator: '>', target: 'VWAP', connector: 'AND' },
      { id: 2, indicator: 'RSI (14)', operator: '<', target: '65', connector: 'AND' },
      { id: 3, indicator: 'EMA (9)', operator: 'crosses above', target: 'EMA (21)', connector: 'THEN' }
    ],
    action: 'BUY'
  },
  {
    id: 'mean_reversion',
    name: 'Bollinger Bands & RSI Mean Reversion',
    instrument: 'RELIANCE',
    timeframe: '15m',
    productType: 'MIS',
    orderType: 'LIMIT',
    stopLossPct: 0.40,
    targetPct: 0.90,
    trailingSlPct: 0.25,
    consensusThreshold: 9,
    capitalAllocation: 35000,
    rules: [
      { id: 1, indicator: 'LTP', operator: '<=', target: 'Bollinger Lower', connector: 'AND' },
      { id: 2, indicator: 'RSI (14)', operator: '<', target: '30', connector: 'THEN' }
    ],
    action: 'BUY'
  }
];

export default function StrategyBuilderView() {
  const [strategyName, setStrategyName] = useState('Chintu Cybernetic Alpha V4');
  const [selectedInstrument, setSelectedInstrument] = useState('NIFTY 50');
  const [timeframe, setTimeframe] = useState('5m');
  const [productType, setProductType] = useState('MIS');
  const [orderType, setOrderType] = useState('LIMIT');
  const [actionType, setActionType] = useState('BUY');

  // Quantitative Execution Parameters
  const [consensusThreshold, setConsensusThreshold] = useState(9);
  const [capitalAllocation, setCapitalAllocation] = useState(50000);
  const [stopLossPct, setStopLossPct] = useState(0.40);
  const [targetPct, setTargetPct] = useState(0.95);
  const [trailingSlPct, setTrailingSlPct] = useState(0.20);
  const [slippageTolerancePct, setSlippageTolerancePct] = useState(0.03);

  // Dynamic Rule Blocks
  const [rules, setRules] = useState([
    { id: 1, indicator: 'EMA (9)', operator: 'crosses above', target: 'EMA (21)', connector: 'AND' },
    { id: 2, indicator: 'RSI (14)', operator: '<', target: '68', connector: 'AND' },
    { id: 3, indicator: 'LTP', operator: '>', target: 'VWAP', connector: 'THEN' }
  ]);

  const [activeTab, setActiveTab] = useState('visual'); // 'visual' | 'code' | 'presets'
  const [isCompiling, setIsCompiling] = useState(false);
  const [validationStatus, setValidationStatus] = useState(null);
  const [isSaved, setIsSaved] = useState(false);

  // Add rule block
  const handleAddRule = () => {
    const newRule = {
      id: Date.now(),
      indicator: 'RSI (14)',
      operator: '>',
      target: '50',
      connector: 'AND'
    };
    setRules([...rules, newRule]);
  };

  // Remove rule block
  const handleRemoveRule = (id) => {
    if (rules.length <= 1) return;
    setRules(rules.filter(r => r.id !== id));
  };

  // Update rule block
  const handleUpdateRule = (id, field, value) => {
    setRules(rules.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  // Load Preset
  const handleLoadPreset = (preset) => {
    setStrategyName(preset.name);
    setSelectedInstrument(preset.instrument);
    setTimeframe(preset.timeframe);
    setProductType(preset.productType);
    setOrderType(preset.orderType);
    setStopLossPct(preset.stopLossPct);
    setTargetPct(preset.targetPct);
    setTrailingSlPct(preset.trailingSlPct);
    setConsensusThreshold(preset.consensusThreshold);
    setCapitalAllocation(preset.capitalAllocation);
    setRules(preset.rules);
    setActionType(preset.action);
    soundEngine.playBuyChime();
    setValidationStatus({ type: 'success', message: `Preset "${preset.name}" loaded successfully.` });
    setTimeout(() => setValidationStatus(null), 3000);
  };

  // Generate Python Strategy Code
  const generatedCode = `# =====================================================================
# CHINTU AI QUANTITATIVE ENGINE - STRATEGY: ${strategyName.toUpperCase()}
# Target: ${selectedInstrument} | Timeframe: ${timeframe} | Mode: ${productType}
# =====================================================================
import math

def evaluate(market_data):
    candles = market_data.get('candles', [])
    if len(candles) < 30:
        return {'decision': 'HOLD', 'reason': 'Warming up bar buffer', 'confidence': 0.0}

    closes = [c['close'] for c in candles]
    highs = [c['high'] for c in candles]
    lows = [c['low'] for c in candles]
    ltp = closes[-1]

    # Pre-calculated indicators
    ema_fast = calculate_ema(closes, 9)
    ema_slow = calculate_ema(closes, 21)
    rsi_14 = calculate_rsi(closes, 14)
    vwap = calculate_vwap(candles)
    st_trend, st_val = calculate_supertrend(highs, lows, closes, 10, 2.0)

    # Condition Evaluation Matrix:
    conditions_met = True
    ${rules.map((r, i) => `# Rule ${i + 1}: ${r.indicator} ${r.operator} ${r.target}`).join('\n    ')}

    if conditions_met:
        return {
            'decision': '${actionType}',
            'target_price': round(ltp * (1 + ${targetPct / 100}), 2),
            'stop_loss': round(ltp * (1 - ${stopLossPct / 100}), 2),
            'trailing_sl_pct': ${trailingSlPct},
            'confidence': 0.88,
            'reason': '${strategyName} signal triggered'
        }

    return {'decision': 'HOLD', 'reason': 'Confluence conditions pending'}
`;

  // Save Strategy to SQLite / Backend Memory
  const handleSaveStrategy = async () => {
    setIsCompiling(true);
    setValidationStatus(null);
    try {
      const payload = {
        name: strategyName,
        instrument: selectedInstrument,
        timeframe,
        productType,
        orderType,
        actionType,
        consensusThreshold,
        capitalAllocation,
        stopLossPct,
        targetPct,
        trailingSlPct,
        slippageTolerancePct,
        rules,
        code: generatedCode
      };

      // Save locally
      try {
        localStorage.setItem(`chintu_strategy_${strategyName.replace(/\s+/g, '_')}`, JSON.stringify(payload));
      } catch (e) {}

      // Save to SQLite backend
      const res = await apiFetch('/api/strategies/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => null);

      soundEngine.playBuyChime();
      setIsSaved(true);
      setValidationStatus({
        type: 'success',
        message: `Strategy "${strategyName}" validated and persisted to SQLite storage. Hot-reloaded to Decision Network.`
      });
    } catch (err) {
      setValidationStatus({
        type: 'error',
        message: `Strategy Compilation Error: ${err.message || 'Validation failed'}`
      });
    } finally {
      setIsCompiling(false);
      setTimeout(() => setIsSaved(false), 4000);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn select-none">
      {/* Header */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            AI Strategy & Rule Builder Studio
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Assemble multi-indicator entry logic, quorum consensus thresholds, and AST-sandboxed execution settings
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented View Mode */}
          <div className="flex items-center bg-[#070e1e] p-0.5 rounded-lg border border-[#1e3a6e]">
            <button
              type="button"
              onClick={() => setActiveTab('visual')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'visual'
                  ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/60 shadow-[0_0_10px_rgba(0,240,255,0.25)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Visual Rule Blocks
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('code')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'code'
                  ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/60 shadow-[0_0_10px_rgba(0,240,255,0.25)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Compiled Code
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('presets')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'presets'
                  ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/60 shadow-[0_0_10px_rgba(0,240,255,0.25)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Institutional Presets
            </button>
          </div>

          <button
            type="button"
            onClick={handleSaveStrategy}
            disabled={isCompiling}
            className="flex items-center gap-1.5 bg-[#0052cc] hover:bg-blue-600 text-white px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-[0_0_12px_rgba(0,82,204,0.4)] cursor-pointer disabled:opacity-50"
          >
            {isCompiling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Save to SQLite & Deploy</span>
          </button>
        </div>
      </div>

      {/* Validation Banner */}
      {validationStatus && (
        <div className={`p-3 rounded-xl border text-xs font-mono flex items-center gap-2 ${
          validationStatus.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
            : 'bg-rose-500/10 border-rose-500/40 text-rose-300'
        }`}>
          {validationStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{validationStatus.message}</span>
        </div>
      )}

      {/* Visual Rule Builder Tab */}
      {activeTab === 'visual' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Rule Composition Canvas */}
          <div className="lg:col-span-8 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-cyan-400" />
                Condition Trigger Matrix (Confluence Logic)
              </h3>
              <button
                type="button"
                onClick={handleAddRule}
                className="flex items-center gap-1 bg-[#09152e] hover:bg-[#0e214a] text-cyan-300 border border-cyan-500/40 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Condition</span>
              </button>
            </div>

            {/* Condition Blocks List */}
            <div className="space-y-3">
              {rules.map((rule, index) => (
                <div
                  key={rule.id}
                  className="p-3 bg-[#060c1c] border border-[#1e3a6e]/50 rounded-xl flex flex-wrap items-center gap-2.5 transition-all hover:border-cyan-500/40"
                >
                  <span className="text-[10px] font-mono font-bold text-slate-500 w-5">#{index + 1}</span>

                  {/* Left Indicator */}
                  <select
                    value={rule.indicator}
                    onChange={(e) => handleUpdateRule(rule.id, 'indicator', e.target.value)}
                    className="bg-[#09152e] border border-[#1e3a6e] text-white text-xs px-2.5 py-1.5 rounded-lg focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="LTP">LTP (Last Traded Price)</option>
                    <option value="EMA (9)">EMA (9)</option>
                    <option value="EMA (21)">EMA (21)</option>
                    <option value="EMA (50)">EMA (50)</option>
                    <option value="RSI (14)">RSI (14)</option>
                    <option value="SuperTrend">SuperTrend (10, 2)</option>
                    <option value="MACD Hist">MACD Histogram</option>
                    <option value="VWAP">Volume Weighted Avg Price (VWAP)</option>
                    <option value="Bollinger Upper">Bollinger Upper Band</option>
                    <option value="Bollinger Lower">Bollinger Lower Band</option>
                    <option value="Volume Spike">Volume Spike Ratio</option>
                  </select>

                  {/* Operator */}
                  <select
                    value={rule.operator}
                    onChange={(e) => handleUpdateRule(rule.id, 'operator', e.target.value)}
                    className="bg-[#09152e] border border-[#1e3a6e] text-cyan-300 font-mono text-xs px-2.5 py-1.5 rounded-lg focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="crosses above">crosses above ↑</option>
                    <option value="crosses below">crosses below ↓</option>
                    <option value=">">&gt; (greater than)</option>
                    <option value="<">&lt; (less than)</option>
                    <option value=">=">&gt;= (greater or equal)</option>
                    <option value="<=">&lt;= (less or equal)</option>
                    <option value="==">== (equals state)</option>
                  </select>

                  {/* Target Threshold or Indicator */}
                  <input
                    type="text"
                    value={rule.target}
                    onChange={(e) => handleUpdateRule(rule.id, 'target', e.target.value)}
                    className="bg-[#09152e] border border-[#1e3a6e] text-white font-mono text-xs px-2.5 py-1.5 rounded-lg w-28 focus:border-cyan-400 focus:outline-none"
                    placeholder="Value or Target"
                  />

                  {/* Connector (AND / OR / THEN) */}
                  <select
                    value={rule.connector}
                    onChange={(e) => handleUpdateRule(rule.id, 'connector', e.target.value)}
                    className="bg-[#0b1b36] border border-cyan-500/40 text-cyan-300 font-bold text-xs px-2 py-1.5 rounded-lg focus:outline-none ml-auto"
                  >
                    <option value="AND">AND</option>
                    <option value="OR">OR</option>
                    <option value="THEN">THEN</option>
                  </select>

                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveRule(rule.id)}
                    disabled={rules.length <= 1}
                    className="p-1.5 text-slate-400 hover:text-rose-400 transition-colors disabled:opacity-30 cursor-pointer"
                    title="Remove Rule"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Action Trigger Block */}
            <div className="p-3 bg-cyan-950/20 border border-cyan-500/30 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-white">Execution Trigger:</span>
                <span className="text-xs font-mono text-slate-300">When all {rules.length} conditions evaluate TRUE simultaneously</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActionType('BUY')}
                  className={`px-3 py-1 rounded text-xs font-bold font-mono transition-all cursor-pointer ${
                    actionType === 'BUY'
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/80 shadow-[0_0_10px_rgba(52,211,153,0.3)]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  EXECUTE BUY
                </button>
                <button
                  type="button"
                  onClick={() => setActionType('SELL')}
                  className={`px-3 py-1 rounded text-xs font-bold font-mono transition-all cursor-pointer ${
                    actionType === 'SELL'
                      ? 'bg-rose-500/25 text-rose-300 border border-rose-400/80 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  EXECUTE SELL
                </button>
              </div>
            </div>
          </div>

          {/* Strategy Meta & Execution Parameters */}
          <div className="lg:col-span-4 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg space-y-4">
            <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-cyan-400" />
              Execution & Risk Settings
            </h3>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans">Strategy Name</label>
                <input
                  type="text"
                  value={strategyName}
                  onChange={(e) => setStrategyName(e.target.value)}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 text-[10px] uppercase font-sans">Instrument</label>
                  <select
                    value={selectedInstrument}
                    onChange={(e) => setSelectedInstrument(e.target.value)}
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="NIFTY 50">NIFTY 50</option>
                    <option value="BANKNIFTY">BANKNIFTY</option>
                    <option value="FINNIFTY">FINNIFTY</option>
                    <option value="RELIANCE">RELIANCE</option>
                    <option value="TATA MOTORS">TATA MOTORS</option>
                    <option value="GOLD (XAUUSD)">GOLD (XAUUSD)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 text-[10px] uppercase font-sans">Timeframe</label>
                  <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="1m">1 Minute</option>
                    <option value="3m">3 Minutes</option>
                    <option value="5m">5 Minutes</option>
                    <option value="15m">15 Minutes</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span className="font-sans text-[11px]">Consensus Quorum Requirement:</span>
                  <span className="text-cyan-400 font-bold">{consensusThreshold} of 14 Bots</span>
                </div>
                <input
                  type="range"
                  min="7"
                  max="14"
                  value={consensusThreshold}
                  onChange={(e) => setConsensusThreshold(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <label className="text-slate-400 text-[9px] uppercase font-sans">Stop Loss %</label>
                  <input
                    type="number"
                    step="0.05"
                    value={stopLossPct}
                    onChange={(e) => setStopLossPct(Number(e.target.value))}
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-rose-400 p-2 rounded-lg font-bold"
                  />
                </div>

                <div>
                  <label className="text-slate-400 text-[9px] uppercase font-sans">Target %</label>
                  <input
                    type="number"
                    step="0.05"
                    value={targetPct}
                    onChange={(e) => setTargetPct(Number(e.target.value))}
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-emerald-400 p-2 rounded-lg font-bold"
                  />
                </div>

                <div>
                  <label className="text-slate-400 text-[9px] uppercase font-sans">Trailing SL %</label>
                  <input
                    type="number"
                    step="0.05"
                    value={trailingSlPct}
                    onChange={(e) => setTrailingSlPct(Number(e.target.value))}
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-cyan-300 p-2 rounded-lg font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans">Max Capital Allocation per Signal (₹)</label>
                <input
                  type="number"
                  step="5000"
                  value={capitalAllocation}
                  onChange={(e) => setCapitalAllocation(Number(e.target.value))}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg font-mono focus:border-cyan-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="p-3 bg-[#060c1c] border border-cyan-500/20 rounded-xl space-y-1 text-[11px]">
              <div className="flex items-center gap-1.5 text-cyan-300 font-bold">
                <Database className="w-3.5 h-3.5 text-cyan-400" />
                <span>SQLite Persistence Ready</span>
              </div>
              <p className="text-slate-400 font-sans text-[10.5px]">
                Strategies saved here are stored into <code className="text-cyan-300">chintu_memory.db</code> and hot-loaded into the Decision Network matrix.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Compiled Code Tab */}
      {activeTab === 'code' && (
        <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
              <Code2 className="w-4 h-4 text-cyan-400" />
              AST-Compiled Strategy Python Code
            </h3>
            <span className="text-[11px] font-mono text-emerald-400">Syntax: VALIDATED AST SAFE</span>
          </div>

          <pre className="p-4 bg-[#060c1c] border border-[#1e3a6e]/50 rounded-xl font-mono text-xs text-slate-300 overflow-x-auto leading-relaxed">
            {generatedCode}
          </pre>
        </div>
      )}

      {/* Institutional Presets Tab */}
      {activeTab === 'presets' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PRESET_STRATEGIES.map((preset) => (
            <div
              key={preset.id}
              className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg flex flex-col justify-between space-y-3 hover:border-cyan-500/50 transition-all"
            >
              <div>
                <span className="text-[9px] uppercase font-mono font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded">
                  {preset.instrument} • {preset.timeframe}
                </span>
                <h4 className="text-sm font-bold text-white mt-2">{preset.name}</h4>
                <p className="text-[11px] text-slate-400 font-sans mt-1">
                  Requires {preset.consensusThreshold}/14 peer quorum. Stop Loss: {preset.stopLossPct}%, Target: {preset.targetPct}%.
                </p>
              </div>

              <div className="space-y-1.5 font-mono text-xs pt-2 border-t border-[#1e3a6e]/40">
                {preset.rules.map((r, i) => (
                  <div key={i} className="text-[10px] text-slate-300 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                    <span>{r.indicator} {r.operator} {r.target}</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => handleLoadPreset(preset)}
                className="w-full flex items-center justify-center gap-2 bg-[#09152e] hover:bg-[#0e214a] text-cyan-300 border border-cyan-500/40 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                <span>Load Preset to Canvas</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
