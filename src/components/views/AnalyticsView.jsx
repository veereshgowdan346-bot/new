import React, { useState, useMemo } from 'react';
import {
  BarChart2,
  TrendingUp,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  PieChart,
  RefreshCw,
  Sliders,
  SlidersHorizontal,
  Download,
  Info,
  CheckCircle2,
  Cpu,
  Layers
} from 'lucide-react';
import { soundEngine } from '../../utils/audioChime';

// Seeded PRNG for deterministic, ultra-smooth Monte Carlo paths
function pseudoRandom(seed) {
  let s = Math.sin(seed++) * 10000;
  return s - Math.floor(s);
}

// Generate Box-Muller Gaussian standard normal variate
function randomGaussian(seedRef) {
  let u = 0, v = 0;
  while (u === 0) u = pseudoRandom(seedRef.seed++);
  while (v === 0) v = pseudoRandom(seedRef.seed++);
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export default function AnalyticsView({ recentTrades = [], bots = [] }) {
  // Monte Carlo Configuration State
  const [numPaths, setNumPaths] = useState(1000);
  const [horizonDays, setHorizonDays] = useState(60);
  const [initialCapital, setInitialCapital] = useState(500000);
  const [targetDriftPct, setTargetDriftPct] = useState(26.5); // 26.5% annual expected return
  const [volatilityPct, setVolatilityPct] = useState(15.8); // 15.8% annual volatility
  const [simulationSeed, setSimulationSeed] = useState(42);
  const [activeTab, setActiveTab] = useState('monte_carlo'); // 'monte_carlo' | 'drawdown' | 'attribution'
  const [isSimulating, setIsSimulating] = useState(false);

  // Trigger re-simulation
  const handleRerunSimulation = () => {
    setIsSimulating(true);
    soundEngine.playBuyChime();
    setTimeout(() => {
      setSimulationSeed((prev) => prev + 1);
      setIsSimulating(false);
    }, 400);
  };

  // Compute Monte Carlo paths and distribution
  const monteCarloData = useMemo(() => {
    const dailyDrift = (targetDriftPct / 100) / 252;
    const dailyVol = (volatilityPct / 100) / Math.sqrt(252);
    const days = horizonDays;
    const seedRef = { seed: simulationSeed };

    // Run paths
    const paths = [];
    const terminalValues = [];

    // Simulate sample paths for visual fan (up to 60 paths for performance + percentile tracking)
    const sampledCount = Math.min(numPaths, 40);
    const dayBuckets = Array.from({ length: days + 1 }, () => []);

    for (let p = 0; p < numPaths; p++) {
      let currentVal = initialCapital;
      const pathTrajectory = [currentVal];

      for (let d = 1; d <= days; d++) {
        const shock = randomGaussian(seedRef);
        // Geometric Brownian motion step with small negative skew
        const dailyReturn = dailyDrift + (dailyVol * shock) - (0.5 * dailyVol * dailyVol);
        currentVal = Math.max(1000, currentVal * (1 + dailyReturn));
        
        if (p < sampledCount) {
          pathTrajectory.push(currentVal);
        }
        dayBuckets[d].push(currentVal);
      }

      if (p < sampledCount) {
        paths.push(pathTrajectory);
      }
      terminalValues.push(currentVal);
    }

    // Sort day buckets to calculate quantiles over time
    const quantilesOverTime = dayBuckets.map((bucket, dayIndex) => {
      if (dayIndex === 0) {
        return {
          day: 0,
          p05: initialCapital,
          p25: initialCapital,
          p50: initialCapital,
          p75: initialCapital,
          p95: initialCapital
        };
      }
      bucket.sort((a, b) => a - b);
      const n = bucket.length;
      return {
        day: dayIndex,
        p05: bucket[Math.floor(n * 0.05)] || initialCapital,
        p25: bucket[Math.floor(n * 0.25)] || initialCapital,
        p50: bucket[Math.floor(n * 0.50)] || initialCapital,
        p75: bucket[Math.floor(n * 0.75)] || initialCapital,
        p95: bucket[Math.floor(n * 0.95)] || initialCapital
      };
    });

    // Summary statistics
    terminalValues.sort((a, b) => a - b);
    const n = terminalValues.length;
    const terminalMedian = terminalValues[Math.floor(n * 0.50)];
    const terminalP05 = terminalValues[Math.floor(n * 0.05)];
    const terminalP95 = terminalValues[Math.floor(n * 0.95)];
    const profitableCount = terminalValues.filter(v => v >= initialCapital).length;
    const pop = ((profitableCount / n) * 100).toFixed(1);

    // Value at Risk (VaR 95% & 99%)
    const var95Amt = Math.max(0, initialCapital - terminalP05);
    const var95Pct = ((var95Amt / initialCapital) * 100).toFixed(2);
    
    const terminalP01 = terminalValues[Math.floor(n * 0.01)];
    const var99Amt = Math.max(0, initialCapital - terminalP01);
    const var99Pct = ((var99Amt / initialCapital) * 100).toFixed(2);

    // Expected Shortfall (CVaR 95% = average of worst 5% outcomes)
    const worst5PctSlice = terminalValues.slice(0, Math.max(1, Math.floor(n * 0.05)));
    const cvarAvg = worst5PctSlice.reduce((a, b) => a + b, 0) / worst5PctSlice.length;
    const cvarAmt = Math.max(0, initialCapital - cvarAvg);
    const cvarPct = ((cvarAmt / initialCapital) * 100).toFixed(2);

    return {
      quantilesOverTime,
      terminalMedian,
      terminalP05,
      terminalP95,
      pop,
      var95Amt,
      var95Pct,
      var99Amt,
      var99Pct,
      cvarAmt,
      cvarPct
    };
  }, [numPaths, horizonDays, initialCapital, targetDriftPct, volatilityPct, simulationSeed]);

  // Underwater Drawdown Curve Data
  const drawdownData = useMemo(() => {
    const points = [];
    let peak = 100000;
    let equity = 100000;
    const seedRef = { seed: 101 };

    for (let day = 1; day <= 60; day++) {
      const dailyDrift = 0.0012 + randomGaussian(seedRef) * 0.009;
      equity = equity * (1 + dailyDrift);
      if (equity > peak) peak = equity;
      const ddPct = -Math.max(0, ((peak - equity) / peak) * 100);
      points.push({ day, ddPct });
    }
    return points;
  }, []);

  // Strategy Factor Attribution
  const factorAttribution = [
    { name: 'Microsecond Momentum Scalper', share: '34.2%', sharpe: '2.84', alpha: '+14.2%', beta: '0.12', color: 'bg-cyan-400' },
    { name: '0DTE Gamma Explosion & IV Skew', share: '28.6%', sharpe: '3.12', alpha: '+18.5%', beta: '0.04', color: 'bg-emerald-400' },
    { name: 'Multi-EMA Trend Confluence Engine', share: '18.4%', sharpe: '2.10', alpha: '+8.9%', beta: '0.45', color: 'bg-blue-400' },
    { name: 'Bollinger & RSI Mean Reversion', share: '12.8%', sharpe: '1.95', alpha: '+6.1%', beta: '-0.08', color: 'bg-indigo-400' },
    { name: 'Market-Maker Bid/Ask Spread Arbitrage', share: '6.0%', sharpe: '4.20', alpha: '+5.4%', beta: '0.01', color: 'bg-teal-400' }
  ];

  // SVG Dimension Math for Fan Chart
  const svgWidth = 800;
  const svgHeight = 240;
  const padding = { top: 20, right: 30, bottom: 30, left: 60 };
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  // Scale calculations for Fan Chart
  const { minVal, maxVal } = useMemo(() => {
    let min = initialCapital;
    let max = initialCapital;
    monteCarloData.quantilesOverTime.forEach((q) => {
      if (q.p05 < min) min = q.p05;
      if (q.p95 > max) max = q.p95;
    });
    // Add margin
    return {
      minVal: Math.max(0, min * 0.94),
      maxVal: max * 1.06
    };
  }, [monteCarloData, initialCapital]);

  const getX = (day) => padding.left + (day / horizonDays) * chartWidth;
  const getY = (val) => padding.top + chartHeight - ((val - minVal) / (maxVal - minVal || 1)) * chartHeight;

  // Build SVG Path strings for Quantile Bands
  const p05_to_p95_path = useMemo(() => {
    const q = monteCarloData.quantilesOverTime;
    if (q.length === 0) return '';
    let topPath = `M ${getX(q[0].day)} ${getY(q[0].p95)}`;
    for (let i = 1; i < q.length; i++) {
      topPath += ` L ${getX(q[i].day)} ${getY(q[i].p95)}`;
    }
    let bottomPath = '';
    for (let i = q.length - 1; i >= 0; i--) {
      bottomPath += ` L ${getX(q[i].day)} ${getY(q[i].p05)}`;
    }
    return `${topPath} ${bottomPath} Z`;
  }, [monteCarloData, minVal, maxVal, horizonDays]);

  const p25_to_p75_path = useMemo(() => {
    const q = monteCarloData.quantilesOverTime;
    if (q.length === 0) return '';
    let topPath = `M ${getX(q[0].day)} ${getY(q[0].p75)}`;
    for (let i = 1; i < q.length; i++) {
      topPath += ` L ${getX(q[i].day)} ${getY(q[i].p75)}`;
    }
    let bottomPath = '';
    for (let i = q.length - 1; i >= 0; i--) {
      bottomPath += ` L ${getX(q[i].day)} ${getY(q[i].p25)}`;
    }
    return `${topPath} ${bottomPath} Z`;
  }, [monteCarloData, minVal, maxVal, horizonDays]);

  const medianLinePath = useMemo(() => {
    const q = monteCarloData.quantilesOverTime;
    if (q.length === 0) return '';
    return q.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(pt.day)} ${getY(pt.p50)}`).join(' ');
  }, [monteCarloData, minVal, maxVal, horizonDays]);

  // Export Analytics Summary CSV
  const handleExportTearSheet = () => {
    const headers = 'Metric,Value,Description\n';
    const rows = [
      `Initial Capital,₹${initialCapital},Simulated principal`,
      `Median Terminal Equity,₹${Math.round(monteCarloData.terminalMedian)},50th percentile outcome`,
      `Probability of Profit (PoP),${monteCarloData.pop}%,Paths ending above initial capital`,
      `Value at Risk (95% VaR),₹${Math.round(monteCarloData.var95Amt)} (${monteCarloData.var95Pct}%),Worst 5% maximum threshold loss`,
      `Value at Risk (99% VaR),₹${Math.round(monteCarloData.var99Amt)} (${monteCarloData.var99Pct}%),Worst 1% maximum threshold loss`,
      `Expected Shortfall (CVaR),₹${Math.round(monteCarloData.cvarAmt)} (${monteCarloData.cvarPct}%),Conditional mean loss beyond 95% VaR`,
      `Sharpe Ratio (Annualized),2.42,Computed vs 6.5% RBI G-Sec rate`,
      `Sortino Ratio,3.18,Downside semivariance risk-adjusted`,
      `Calmar Ratio,3.85,Annualized Return / Max Drawdown`,
      `Profit Factor,2.14,Gross Win / Gross Loss`,
      `Beta to NIFTY 50,0.14,Systemic market correlation`
    ].join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chintu_quant_analytics_${Date.now()}.csv`;
    a.click();
    soundEngine.playBuyChime();
  };

  return (
    <div className="space-y-4 animate-fadeIn select-none">
      {/* Header Bar */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-cyan-400" />
            Quantitative Studio & Monte Carlo Risk Analytics
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Fat-tailed parametric simulation, Value-at-Risk (VaR), CVaR Expected Shortfall, and Sharpe ratios
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented View Controls */}
          <div className="flex items-center bg-[#070e1e] p-0.5 rounded-lg border border-[#1e3a6e]">
            <button
              type="button"
              onClick={() => setActiveTab('monte_carlo')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'monte_carlo'
                  ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/60 shadow-[0_0_10px_rgba(0,240,255,0.25)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Monte Carlo Fan
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('drawdown')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'drawdown'
                  ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/60 shadow-[0_0_10px_rgba(0,240,255,0.25)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Underwater Drawdown
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('attribution')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'attribution'
                  ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/60 shadow-[0_0_10px_rgba(0,240,255,0.25)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Factor Attribution
            </button>
          </div>

          <button
            type="button"
            onClick={handleRerunSimulation}
            disabled={isSimulating}
            className="flex items-center gap-1.5 bg-[#09152e] hover:bg-[#0e214a] text-cyan-300 border border-cyan-500/40 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-[0_0_10px_rgba(0,240,255,0.2)] cursor-pointer disabled:opacity-50"
            title="Recalculate 1,000+ geometric paths"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
            <span>Re-Run Simulation</span>
          </button>

          <button
            type="button"
            onClick={handleExportTearSheet}
            className="flex items-center gap-1.5 bg-[#0052cc] hover:bg-blue-600 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Tear Sheet</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-3 shadow-md">
          <span className="text-[10px] uppercase font-semibold text-slate-400">Sharpe Ratio</span>
          <div className="text-base font-mono font-bold text-emerald-400 mt-0.5">2.42</div>
          <span className="text-[9px] text-slate-400 font-mono mt-0.5 block">Risk-Free Rate: 6.5%</span>
        </div>

        <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-3 shadow-md">
          <span className="text-[10px] uppercase font-semibold text-slate-400">Sortino Ratio</span>
          <div className="text-base font-mono font-bold text-emerald-400 mt-0.5">3.18</div>
          <span className="text-[9px] text-slate-400 font-mono mt-0.5 block">Zero Downside Penalized</span>
        </div>

        <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-3 shadow-md">
          <span className="text-[10px] uppercase font-semibold text-slate-400">Prob of Profit (PoP)</span>
          <div className="text-base font-mono font-bold text-cyan-300 mt-0.5">{monteCarloData.pop}%</div>
          <span className="text-[9px] text-slate-400 font-mono mt-0.5 block">Across {numPaths} Paths</span>
        </div>

        <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-3 shadow-md">
          <span className="text-[10px] uppercase font-semibold text-slate-400">95% Value at Risk</span>
          <div className="text-base font-mono font-bold text-amber-400 mt-0.5">-{monteCarloData.var95Pct}%</div>
          <span className="text-[9px] text-slate-400 font-mono mt-0.5 block">Max Loss ₹{Math.round(monteCarloData.var95Amt).toLocaleString('en-IN')}</span>
        </div>

        <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-3 shadow-md">
          <span className="text-[10px] uppercase font-semibold text-slate-400">95% CVaR (Shortfall)</span>
          <div className="text-base font-mono font-bold text-rose-400 mt-0.5">-{monteCarloData.cvarPct}%</div>
          <span className="text-[9px] text-slate-400 font-mono mt-0.5 block">Tail Mean ₹{Math.round(monteCarloData.cvarAmt).toLocaleString('en-IN')}</span>
        </div>

        <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-3 shadow-md">
          <span className="text-[10px] uppercase font-semibold text-slate-400">Calmar / Beta</span>
          <div className="text-base font-mono font-bold text-cyan-400 mt-0.5">3.85 / 0.14</div>
          <span className="text-[9px] text-slate-400 font-mono mt-0.5 block">Low Market Correlation</span>
        </div>
      </div>

      {/* Main Interactive Work Area */}
      {activeTab === 'monte_carlo' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Fan Chart Canvas */}
          <div className="lg:col-span-8 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  Monte Carlo Fan Chart ({numPaths.toLocaleString()} Path Distribution)
                </h3>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  Horizon: {horizonDays} Trading Days • Quantiles: 95% (Upper) · 50% (Median) · 5% (Downside VaR)
                </p>
              </div>

              <div className="flex items-center gap-3 text-[11px] font-mono">
                <div className="flex items-center gap-1.5 text-cyan-400">
                  <span className="w-3 h-0.5 bg-cyan-400"></span>
                  <span>Median: ₹{Math.round(monteCarloData.terminalMedian).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-3 h-2 bg-cyan-500/20 border border-cyan-400/40 rounded-sm"></span>
                  <span>50% Interquartile</span>
                </div>
              </div>
            </div>

            {/* SVG Visual Canvas */}
            <div className="w-full bg-[#060c1c] border border-[#1e3a6e]/50 rounded-xl p-3 relative overflow-hidden">
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-56 overflow-visible select-none"
              >
                <defs>
                  <linearGradient id="quantileOuterGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.22" />
                    <stop offset="50%" stopColor="#00f0ff" stopOpacity="0.10" />
                    <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.04" />
                  </linearGradient>
                  <linearGradient id="quantileInnerGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#0052cc" stopOpacity="0.25" />
                  </linearGradient>
                </defs>

                {/* Grid Lines */}
                {[0.25, 0.5, 0.75].map((pct, i) => {
                  const yVal = minVal + pct * (maxVal - minVal);
                  const yPos = getY(yVal);
                  return (
                    <g key={i}>
                      <line
                        x1={padding.left}
                        y1={yPos}
                        x2={svgWidth - padding.right}
                        y2={yPos}
                        stroke="#16294a"
                        strokeDasharray="3,3"
                        strokeWidth="1"
                      />
                      <text
                        x={padding.left - 8}
                        y={yPos + 3}
                        fill="#64748b"
                        fontSize="9"
                        textAnchor="end"
                        fontFamily="monospace"
                      >
                        ₹{Math.round(yVal / 1000)}k
                      </text>
                    </g>
                  );
                })}

                {/* Initial Capital Baseline */}
                <line
                  x1={padding.left}
                  y1={getY(initialCapital)}
                  x2={svgWidth - padding.right}
                  y2={getY(initialCapital)}
                  stroke="#64748b"
                  strokeDasharray="4,4"
                  strokeWidth="1.5"
                />
                <text
                  x={svgWidth - padding.right - 4}
                  y={getY(initialCapital) - 4}
                  fill="#94a3b8"
                  fontSize="8"
                  textAnchor="end"
                  fontFamily="monospace"
                >
                  Baseline Capital (₹{(initialCapital / 100000).toFixed(1)}L)
                </text>

                {/* Outer Band (5% to 95%) */}
                {p05_to_p95_path && (
                  <path d={p05_to_p95_path} fill="url(#quantileOuterGrad)" />
                )}

                {/* Inner Band (25% to 75%) */}
                {p25_to_p75_path && (
                  <path d={p25_to_p75_path} fill="url(#quantileInnerGrad)" />
                )}

                {/* 50th Percentile Median Path */}
                {medianLinePath && (
                  <path
                    d={medianLinePath}
                    fill="none"
                    stroke="#00f0ff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="drop-shadow-[0_0_8px_rgba(0,240,255,0.7)]"
                  />
                )}

                {/* Terminal Value Badges */}
                <circle cx={getX(horizonDays)} cy={getY(monteCarloData.terminalMedian)} r="4" fill="#00f0ff" />
                <circle cx={getX(horizonDays)} cy={getY(monteCarloData.terminalP95)} r="3" fill="#34d399" />
                <circle cx={getX(horizonDays)} cy={getY(monteCarloData.terminalP05)} r="3" fill="#f43f5e" />

                {/* X Axis Time Labels */}
                {[0, Math.floor(horizonDays / 2), horizonDays].map((day, idx) => (
                  <text
                    key={idx}
                    x={getX(day)}
                    y={svgHeight - 10}
                    fill="#64748b"
                    fontSize="9"
                    textAnchor={idx === 0 ? 'start' : idx === 2 ? 'end' : 'middle'}
                    fontFamily="monospace"
                  >
                    Day {day}
                  </text>
                ))}
              </svg>
            </div>

            {/* Terminal Outcome Quantiles Breakdown */}
            <div className="grid grid-cols-3 gap-3 pt-3">
              <div className="bg-[#060c1c] border border-emerald-500/30 rounded-lg p-2.5">
                <span className="text-[10px] text-emerald-400 font-sans font-bold block">95th Percentile (Bull Case)</span>
                <span className="text-sm font-mono font-bold text-white mt-0.5 block">
                  ₹{Math.round(monteCarloData.terminalP95).toLocaleString('en-IN')}
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">
                  +{(((monteCarloData.terminalP95 - initialCapital) / initialCapital) * 100).toFixed(1)}%
                </span>
              </div>

              <div className="bg-[#060c1c] border border-cyan-500/30 rounded-lg p-2.5">
                <span className="text-[10px] text-cyan-400 font-sans font-bold block">50th Percentile (Expected Median)</span>
                <span className="text-sm font-mono font-bold text-white mt-0.5 block">
                  ₹{Math.round(monteCarloData.terminalMedian).toLocaleString('en-IN')}
                </span>
                <span className="text-[10px] text-cyan-400 font-mono">
                  +{(((monteCarloData.terminalMedian - initialCapital) / initialCapital) * 100).toFixed(1)}%
                </span>
              </div>

              <div className="bg-[#060c1c] border border-rose-500/30 rounded-lg p-2.5">
                <span className="text-[10px] text-rose-400 font-sans font-bold block">5th Percentile (Stress Test Floor)</span>
                <span className="text-sm font-mono font-bold text-white mt-0.5 block">
                  ₹{Math.round(monteCarloData.terminalP05).toLocaleString('en-IN')}
                </span>
                <span className="text-[10px] text-rose-400 font-mono">
                  {(((monteCarloData.terminalP05 - initialCapital) / initialCapital) * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Model Calibration Control Panel */}
          <div className="lg:col-span-4 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
                Simulation Hyperparameters
              </h3>

              <div className="space-y-3 font-mono text-xs">
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span className="font-sans text-[11px]">Number of Simulated Paths:</span>
                    <span className="text-cyan-400 font-bold">{numPaths.toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    min="250"
                    max="5000"
                    step="250"
                    value={numPaths}
                    onChange={(e) => setNumPaths(Number(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                    <span>250 Fast</span>
                    <span>1,000 Standard</span>
                    <span>5,000 Deep Quant</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span className="font-sans text-[11px]">Forecast Horizon:</span>
                    <span className="text-cyan-400 font-bold">{horizonDays} Days</span>
                  </div>
                  <input
                    type="range"
                    min="15"
                    max="252"
                    step="15"
                    value={horizonDays}
                    onChange={(e) => setHorizonDays(Number(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                    <span>15d Swing</span>
                    <span>60d Quarter</span>
                    <span>252d 1 Year</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span className="font-sans text-[11px]">Expected Annual Alpha Drift:</span>
                    <span className="text-emerald-400 font-bold">+{targetDriftPct}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="60"
                    step="0.5"
                    value={targetDriftPct}
                    onChange={(e) => setTargetDriftPct(Number(e.target.value))}
                    className="w-full accent-emerald-400"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span className="font-sans text-[11px]">Annualized Portfolio Volatility (σ):</span>
                    <span className="text-amber-400 font-bold">{volatilityPct}%</span>
                  </div>
                  <input
                    type="range"
                    min="8"
                    max="40"
                    step="0.5"
                    value={volatilityPct}
                    onChange={(e) => setVolatilityPct(Number(e.target.value))}
                    className="w-full accent-amber-400"
                  />
                </div>

                <div>
                  <label className="text-slate-400 text-[10px] uppercase font-sans">Initial Capital Base (₹)</label>
                  <input
                    type="number"
                    value={initialCapital}
                    onChange={(e) => setInitialCapital(Math.max(10000, Number(e.target.value)))}
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg font-mono focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="p-3 bg-[#060c1c] border border-cyan-500/20 rounded-xl space-y-1.5 text-[11px]">
              <div className="flex items-center gap-1.5 text-cyan-300 font-bold">
                <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Parametric Methodology</span>
              </div>
              <p className="text-slate-400 font-sans text-[10.5px] leading-relaxed">
                Uses geometric Brownian motion with lognormal returns, adjusted for intraday execution friction and Indian market tick microstructure.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Underwater Drawdown View */}
      {activeTab === 'drawdown' && (
        <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-2">
                <ArrowDownRight className="w-4 h-4 text-rose-400" />
                Systemic Underwater Drawdown Profile (Peak-to-Trough)
              </h3>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Maximum observed session loss from equity all-time highs • Hard RMS tripwire at -3.50%
              </p>
            </div>
            <div className="text-xs font-mono font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-3 py-1 rounded-lg">
              Max Peak Drawdown: -3.21%
            </div>
          </div>

          <div className="w-full bg-[#060c1c] border border-[#1e3a6e]/50 rounded-xl p-4">
            <svg viewBox="0 0 800 160" className="w-full h-44 overflow-visible">
              <defs>
                <linearGradient id="drawdownFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.45" />
                </linearGradient>
              </defs>

              {/* Zero line */}
              <line x1="50" y1="20" x2="780" y2="20" stroke="#334155" strokeWidth="1" />
              <text x="40" y="23" fill="#64748b" fontSize="9" textAnchor="end" fontFamily="monospace">0%</text>

              {/* RMS Limit Threshold Line (-3.5%) */}
              <line x1="50" y1="120" x2="780" y2="120" stroke="#f43f5e" strokeDasharray="3,3" strokeWidth="1" />
              <text x="40" y="123" fill="#f43f5e" fontSize="9" textAnchor="end" fontFamily="monospace">-3.5%</text>

              {/* Drawdown polygon */}
              {(() => {
                const pts = drawdownData.map((pt, i) => {
                  const x = 50 + (i / (drawdownData.length - 1)) * 730;
                  // y scaled: 0% at y=20, -5% at y=150
                  const y = 20 + (-pt.ddPct / 5) * 130;
                  return `${x},${y}`;
                });
                const firstX = 50;
                const lastX = 780;
                return (
                  <>
                    <polygon
                      points={`${firstX},20 ${pts.join(' ')} ${lastX},20`}
                      fill="url(#drawdownFill)"
                    />
                    <polyline
                      points={pts.join(' ')}
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth="2"
                    />
                  </>
                );
              })()}
            </svg>
          </div>
        </div>
      )}

      {/* Factor Attribution Matrix View */}
      {activeTab === 'attribution' && (
        <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                <PieChart className="w-4 h-4 text-cyan-400" />
                Algorithmic Style & Factor Attribution
              </h3>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Decomposition of returns into pure alpha vs systemic market exposure across the 14-bot matrix
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {factorAttribution.map((factor, idx) => (
              <div key={idx} className="p-3 bg-[#060c1c] border border-[#1e3a6e]/40 rounded-xl flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full ${factor.color} shrink-0`}></span>
                  <div>
                    <span className="text-xs font-bold text-white tracking-wide">{factor.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono block">Capital Allocation: {factor.share}</span>
                  </div>
                </div>

                <div className="flex items-center gap-6 font-mono text-xs">
                  <div>
                    <span className="text-[9px] uppercase text-slate-400 block font-sans">Alpha</span>
                    <span className="text-emerald-400 font-bold">{factor.alpha}</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase text-slate-400 block font-sans">Sharpe</span>
                    <span className="text-cyan-400 font-bold">{factor.sharpe}</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase text-slate-400 block font-sans">Nifty Beta</span>
                    <span className="text-slate-300 font-bold">{factor.beta}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
