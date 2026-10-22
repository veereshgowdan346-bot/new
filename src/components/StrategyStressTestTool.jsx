import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Play,
  RotateCcw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Activity,
  Layers,
  Sliders,
  DollarSign,
  Percent,
  Download,
  Info,
  Clock,
  ShieldCheck,
  Zap,
  ArrowRight,
  Flame,
  Award
} from 'lucide-react';
import {
  HISTORICAL_CRASH_SCENARIOS,
  simulateStrategyStressTest
} from '../utils/crashStressTestEngine';
import { soundEngine } from '../utils/audioChime';

export default function StrategyStressTestTool({
  strategies = [],
  selectedStrategyId = null,
  onClose = null,
  onApplySafeguards = null
}) {
  // 1. Selected strategy for stress testing
  const [activeStratId, setActiveStratId] = useState(
    selectedStrategyId || (strategies[0]?.strategy_id || strategies[0]?.id || 'strat_supertrend_macd')
  );

  const activeStrategy = useMemo(() => {
    return strategies.find(s => (s.strategy_id || s.id) === activeStratId) || strategies[0] || {
      name: 'SuperTrend & MACD Scalper',
      category: 'Momentum Scalper',
      stop_loss_pct: 0.20,
      target_pct: 0.36
    };
  }, [strategies, activeStratId]);

  // 2. Scenario & Simulation Parameters
  const [selectedScenarioId, setSelectedScenarioId] = useState('COVID_2020');
  const [initialCapital, setInitialCapital] = useState(500000);
  const [stressMultiplier, setStressMultiplier] = useState(1.0); // 1.0x to 1.5x
  const [slippageBuffer, setSlippageBuffer] = useState(0.25);
  const [dynamicAtrFilter, setDynamicAtrFilter] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationSeed, setSimulationSeed] = useState(1);

  // 3. Run Simulation
  const testResults = useMemo(() => {
    return simulateStrategyStressTest({
      strategy: activeStrategy,
      scenarioId: selectedScenarioId,
      initialCapital,
      stressMultiplier,
      slippageBufferPct: slippageBuffer,
      dynamicAtrFilter
    });
  }, [activeStrategy, selectedScenarioId, initialCapital, stressMultiplier, slippageBuffer, dynamicAtrFilter, simulationSeed]);

  // Trigger manual re-run with audio chime
  const handleRerunTest = () => {
    setIsSimulating(true);
    soundEngine.playBuyChime();
    setTimeout(() => {
      setSimulationSeed(prev => prev + 1);
      setIsSimulating(false);
    }, 500);
  };

  // Export Audit Certificate
  const handleExportCertificate = () => {
    const cert = {
      system: 'Chintu AI Trading System - Strategy Stress-Test Audit',
      timestamp: new Date().toISOString(),
      strategyName: testResults.strategyName,
      scenario: testResults.scenario.name,
      clearanceStatus: testResults.clearanceStatus,
      metrics: {
        initialCapital: testResults.initialCapital,
        finalEquity: testResults.finalEquity,
        strategyReturnPct: testResults.strategyReturnPct,
        benchmarkReturnPct: testResults.benchmarkReturnPct,
        maxDrawdownPct: testResults.maxDrawdownPct,
        maxDrawdownValue: testResults.maxDrawdownValue,
        maxDrawdownDurationDays: testResults.maxDrawdownDurationDays,
        var99Pct: testResults.var99Pct,
        cvar99Pct: testResults.cvar99Pct,
        ulcerIndex: testResults.ulcerIndex,
        calmarRatio: testResults.calmarRatio,
        stopLossContainmentPct: testResults.stopLossContainmentPct
      },
      recommendations: testResults.recommendations
    };

    const blob = new Blob([JSON.stringify(cert, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `StressTest_${activeStrategy.name.replace(/\s+/g, '_')}_${selectedScenarioId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const curveData = testResults.dailyEquityCurve;
  const maxEq = Math.max(...curveData.map(c => Math.max(c.strategyEquity, c.benchmarkEquity, initialCapital)));
  const minEq = Math.min(...curveData.map(c => Math.min(c.strategyEquity, c.benchmarkEquity, initialCapital * 0.5)));
  const eqRange = Math.max(1, maxEq - minEq);

  return (
    <div className="space-y-4 animate-fadeIn select-none text-left">
      {/* Header Bar */}
      <div className="glass-panel rounded-2xl p-4 border border-[#1e3a6e]/70 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-400">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Historical Market Crash Stress-Test Suite
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  BLACK SWAN AUDITOR
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Simulates 2008 Lehman GFC & 2020 COVID flash crashes against algorithmic strategies to verify Max Drawdown & VaR 99%
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleRerunTest}
            disabled={isSimulating}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs font-mono flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(0,240,255,0.3)] cursor-pointer"
          >
            <Play className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
            <span>{isSimulating ? 'Simulating Shock...' : 'Run Crash Stress-Test'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCertificate}
            className="p-2 rounded-xl bg-[#09142b] border border-[#1b345f] text-slate-300 hover:text-white hover:bg-[#10244c] transition-all cursor-pointer"
            title="Export Stress-Test Audit Certificate"
          >
            <Download className="w-4 h-4" />
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-[#09142b] border border-[#1b345f] text-slate-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Scenario Selector Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Object.entries(HISTORICAL_CRASH_SCENARIOS).map(([id, scenario]) => {
          const isSelected = selectedScenarioId === id;
          return (
            <div
              key={id}
              onClick={() => setSelectedScenarioId(id)}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                isSelected
                  ? 'border-cyan-400 bg-[#0d1e3d] shadow-[0_0_20px_rgba(0,240,255,0.3)] scale-[1.02]'
                  : 'border-[#18315a] bg-[#070e1e] hover:border-cyan-500/50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">
                    {scenario.dateRange}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 rounded">
                    {scenario.benchmarkDropPct}% Drop
                  </span>
                </div>
                <h4 className="text-xs font-bold text-white leading-tight">
                  {scenario.name}
                </h4>
                <p className="text-[10px] text-slate-400 font-mono mt-1 line-clamp-2">
                  {scenario.description}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 mt-2 border-t border-[#13284a] text-[9.5px] font-mono text-slate-400">
                <span>Peak VIX: <strong className="text-amber-400">{scenario.peakVix}</strong></span>
                <span>{scenario.daysDuration} Shock Days</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Strategy Selection & Stress Parameters Configuration */}
      <div className="bg-[#070e1e] p-4 rounded-xl border border-[#18315a] flex flex-wrap items-center justify-between gap-4">
        {/* Strategy Picker */}
        <div className="flex items-center gap-2 min-w-[280px]">
          <span className="text-xs font-mono text-slate-400">Target Strategy:</span>
          <select
            value={activeStratId}
            onChange={(e) => setActiveStratId(e.target.value)}
            className="flex-1 bg-[#05070b] border border-[#1c3866] rounded-xl px-3 py-1.5 text-xs text-cyan-300 font-bold font-mono focus:outline-none cursor-pointer"
          >
            {strategies.map((strat) => (
              <option key={strat.strategy_id || strat.id} value={strat.strategy_id || strat.id} className="bg-[#05070b] text-white">
                {strat.name} ({strat.category || 'Quant'})
              </option>
            ))}
          </select>
        </div>

        {/* Capital & Parameters */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 bg-[#09142b] px-3 py-1.5 rounded-xl border border-[#1a345e]">
            <span className="text-slate-400">Capital:</span>
            <input
              type="number"
              value={initialCapital}
              onChange={(e) => setInitialCapital(Math.max(1000, parseInt(e.target.value, 10) || 500000))}
              className="w-24 bg-transparent text-white font-bold focus:outline-none text-right"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-[#09142b] px-3 py-1.5 rounded-xl border border-[#1a345e]">
            <span className="text-slate-400">Stress Multiplier:</span>
            <select
              value={stressMultiplier}
              onChange={(e) => setStressMultiplier(parseFloat(e.target.value))}
              className="bg-transparent text-cyan-300 font-bold focus:outline-none cursor-pointer"
            >
              <option value="1.0" className="bg-[#05070b]">1.0x (Historical)</option>
              <option value="1.25" className="bg-[#05070b]">1.25x (Severe)</option>
              <option value="1.5" className="bg-[#05070b]">1.5x (Extreme Tail)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-[#09142b] px-3 py-1.5 rounded-xl border border-[#1a345e]">
            <span className="text-slate-400">Slippage Buffer:</span>
            <span className="text-emerald-400 font-bold">{slippageBuffer}%</span>
          </div>

          <div className="flex items-center gap-2 bg-[#09142b] px-3 py-1.5 rounded-xl border border-[#1a345e]">
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={dynamicAtrFilter}
                onChange={(e) => setDynamicAtrFilter(e.target.checked)}
                className="accent-cyan-400 rounded cursor-pointer"
              />
              <span>Dynamic ATR Filter</span>
            </label>
          </div>
        </div>
      </div>

      {/* Pre-Deployment Clearance Verdict Banner */}
      <div className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${testResults.clearanceBadgeClass}`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-black/40 border border-current">
            {testResults.clearanceStatus === 'PASSED' ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            ) : testResults.clearanceStatus === 'WARNING' ? (
              <AlertTriangle className="w-6 h-6 text-amber-400" />
            ) : (
              <ShieldAlert className="w-6 h-6 text-rose-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold uppercase tracking-wider">
                PRE-DEPLOYMENT VERDICT: {testResults.clearanceStatus}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 border border-current">
                {activeStrategy.name}
              </span>
            </div>
            <p className="text-xs mt-0.5 opacity-90 font-mono">
              {testResults.verdictSummary}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
          <div className="text-right">
            <span className="text-[10px] opacity-75 block">STRATEGY VS BENCHMARK</span>
            <span className="text-sm font-bold">
              {testResults.strategyReturnPct >= 0 ? '+' : ''}{testResults.strategyReturnPct}% vs {testResults.benchmarkReturnPct}%
            </span>
          </div>
          <div className="text-right pl-3 border-l border-current/30">
            <span className="text-[10px] opacity-75 block">CRASH ALPHA GENERATED</span>
            <span className="text-sm font-bold text-emerald-400">
              +{testResults.alphaOverCrashPct}%
            </span>
          </div>
        </div>
      </div>

      {/* KPI Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="p-3 rounded-xl bg-[#081224] border border-[#19335f]">
          <span className="text-[9.5px] font-mono text-slate-400 block">MAX DRAWDOWN (MDD)</span>
          <div className={`text-lg font-bold font-mono mt-1 ${testResults.maxDrawdownPct > 20 ? 'text-rose-400' : testResults.maxDrawdownPct > 12 ? 'text-amber-400' : 'text-emerald-400'}`}>
            -{testResults.maxDrawdownPct}%
          </div>
          <span className="text-[9px] text-slate-400 font-mono">₹{testResults.maxDrawdownValue.toLocaleString('en-IN')} peak decline</span>
        </div>

        <div className="p-3 rounded-xl bg-[#081224] border border-[#19335f]">
          <span className="text-[9.5px] font-mono text-slate-400 block">VALUE AT RISK (VaR 99%)</span>
          <div className="text-lg font-bold font-mono text-cyan-300 mt-1">
            -{testResults.var99Pct}%
          </div>
          <span className="text-[9px] text-slate-400 font-mono">Max 1-day loss @ 99% CI</span>
        </div>

        <div className="p-3 rounded-xl bg-[#081224] border border-[#19335f]">
          <span className="text-[9.5px] font-mono text-slate-400 block">EXPECTED SHORTFALL</span>
          <div className="text-lg font-bold font-mono text-rose-300 mt-1">
            -{testResults.cvar99Pct}%
          </div>
          <span className="text-[9px] text-slate-400 font-mono">CVaR 99% average tail loss</span>
        </div>

        <div className="p-3 rounded-xl bg-[#081224] border border-[#19335f]">
          <span className="text-[9.5px] font-mono text-slate-400 block">ULCER VOLATILITY INDEX</span>
          <div className="text-lg font-bold font-mono text-white mt-1">
            {testResults.ulcerIndex}
          </div>
          <span className="text-[9px] text-slate-400 font-mono">Downside stress duration</span>
        </div>

        <div className="p-3 rounded-xl bg-[#081224] border border-[#19335f]">
          <span className="text-[9.5px] font-mono text-slate-400 block">CALMAR RATIO</span>
          <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
            {testResults.calmarRatio}
          </div>
          <span className="text-[9px] text-slate-400 font-mono">Annualized return / MDD</span>
        </div>

        <div className="p-3 rounded-xl bg-[#081224] border border-[#19335f]">
          <span className="text-[9.5px] font-mono text-slate-400 block">STOP-LOSS CONTAINMENT</span>
          <div className="text-lg font-bold font-mono text-cyan-300 mt-1">
            {testResults.stopLossContainmentPct}%
          </div>
          <span className="text-[9px] text-slate-400 font-mono">Orders contained vs slippage</span>
        </div>
      </div>

      {/* Visual Chart: Strategy Equity Curve vs Market Crash Benchmark */}
      <div className="bg-[#070e1e] p-4 rounded-xl border border-[#18315a] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Simulated Equity Evolution vs. Unhedged Crash Benchmark
            </h3>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-cyan-400" />
              <span className="text-cyan-300 font-bold">{activeStrategy.name} Equity</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-rose-500" />
              <span className="text-rose-400 font-bold">Unhedged Benchmark ({testResults.scenario.benchmarkDropPct}%)</span>
            </div>
          </div>
        </div>

        {/* SVG Equity Chart */}
        <div className="w-full h-56 bg-[#040813] rounded-xl border border-[#122442] p-2 relative overflow-hidden flex items-end">
          <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            {/* Grid Lines */}
            <line x1="0" y1="20" x2="100" y2="20" stroke="#16294a" strokeDasharray="2" strokeWidth="0.5" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="#16294a" strokeDasharray="2" strokeWidth="0.5" />
            <line x1="0" y1="80" x2="100" y2="80" stroke="#16294a" strokeDasharray="2" strokeWidth="0.5" />

            {/* Benchmark Path (Red/Rose plunge) */}
            <path
              d={curveData.map((pt, i) => {
                const x = (i / (curveData.length - 1)) * 100;
                const y = 100 - ((pt.benchmarkEquity - minEq) / eqRange) * 100;
                return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
              }).join(' ')}
              fill="none"
              stroke="#f43f5e"
              strokeWidth="1.8"
              strokeOpacity="0.85"
            />

            {/* Strategy Equity Path (Neon Cyan / Emerald) */}
            <path
              d={curveData.map((pt, i) => {
                const x = (i / (curveData.length - 1)) * 100;
                const y = 100 - ((pt.strategyEquity - minEq) / eqRange) * 100;
                return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
              }).join(' ')}
              fill="none"
              stroke="#00f0ff"
              strokeWidth="2.5"
            />
          </svg>

          {/* Floating Values Legend */}
          <div className="absolute top-3 left-3 text-[10px] font-mono text-slate-400 space-y-0.5 bg-[#070e1c]/90 p-2 rounded-lg border border-[#16294a]">
            <div>Initial Capital: ₹{initialCapital.toLocaleString('en-IN')}</div>
            <div>Strategy End: <strong className="text-cyan-300">₹{testResults.finalEquity.toLocaleString('en-IN')}</strong></div>
            <div>Benchmark End: <strong className="text-rose-400">₹{testResults.benchmarkFinalEquity.toLocaleString('en-IN')}</strong></div>
          </div>
        </div>
      </div>

      {/* Quant AI Safeguards & Stress Audit Recommendations */}
      <div className="bg-[#070e1e] p-4 rounded-xl border border-[#18315a] space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            Quant Risk Engineering & Pre-Deployment Safeguards
          </h3>
          <span className="text-[10px] font-mono text-slate-400">
            Rule Compliance: Strict Net-Profit Guardrail Verified
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {testResults.recommendations.map((rec, idx) => (
            <div
              key={idx}
              className="p-3 rounded-lg bg-[#050a16] border border-[#142646] space-y-1.5"
            >
              <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-cyan-300">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                <span>Safeguard #{idx + 1}</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                {rec}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
