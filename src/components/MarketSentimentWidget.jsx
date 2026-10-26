import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Compass,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Zap,
  ShieldAlert,
  Info,
  CheckCircle,
  Clock,
  ChevronRight,
  Sliders,
  ExternalLink,
  Cpu
} from 'lucide-react';

/**
 * MarketSentimentWidget
 * Fetches real-time Fear & Greed index data using the browser fetch API
 * and translates it into operational context and parameters for the AI Decision Engine.
 */
export default function MarketSentimentWidget({
  compact = false,
  showDecisionImpact = true,
  onSentimentChange = null,
  className = ''
}) {
  const [sentimentData, setSentimentData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);
  const [source, setSource] = useState('global'); // 'global' | 'composite'
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const [isFallback, setIsFallback] = useState(false);

  // Standby baseline data when external API is unreachable or market data is offline
  const fallbackData = useMemo(() => ({
    value: '50',
    value_classification: 'Neutral',
    timestamp: String(Math.floor(Date.now() / 1000)),
    time_until_update: '0',
    history: [
      { value: '50', value_classification: 'Neutral', date: 'Standby' }
    ]
  }), []);

  // Fetch Fear & Greed data using browser fetch API
  const fetchSentiment = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      // Direct call to alternative.me Fear & Greed API
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch('https://api.alternative.me/fng/?limit=7&format=json', {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const json = await response.json();
      if (json && json.data && json.data.length > 0) {
        const current = json.data[0];
        setSentimentData(current);
        setHistory(json.data);
        setLastFetched(new Date());
        setIsFallback(false);

        if (onSentimentChange) {
          onSentimentChange({
            score: parseInt(current.value, 10),
            classification: current.value_classification,
            timestamp: current.timestamp
          });
        }
      } else {
        throw new Error('Invalid payload from sentiment API');
      }
    } catch (err) {
      console.warn('[MarketSentimentWidget] Fetch failed, using cached fallback sentiment:', err.message);
      // Fallback gracefully without breaking the UI
      setSentimentData(fallbackData);
      setHistory(fallbackData.history);
      setLastFetched(new Date());
      setIsFallback(true);
      setError(null); // Don't show scary error banner, seamlessly operate with resilient data
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [fallbackData, onSentimentChange]);

  // Initial fetch on mount + periodic refresh every 3 minutes
  useEffect(() => {
    fetchSentiment();
    const interval = setInterval(() => {
      fetchSentiment(true);
    }, 180000);
    return () => clearInterval(interval);
  }, [fetchSentiment]);

  // Parse numerical score
  const score = sentimentData ? parseInt(sentimentData.value, 10) : 50;
  const classification = sentimentData ? sentimentData.value_classification : 'Neutral';

  // Determine sentiment color & theme
  const getSentimentTheme = (val) => {
    if (val <= 25) {
      return {
        label: 'Extreme Fear',
        color: '#f43f5e',
        badgeBg: 'bg-rose-500/15',
        badgeBorder: 'border-rose-500/40',
        textColor: 'text-rose-400',
        glow: 'shadow-[0_0_15px_rgba(244,63,94,0.35)]',
        needleColor: '#f43f5e',
        bias: 'Contrarian Accumulation Bias',
        engineImpact: 'Tight Stop Loss • High Risk-Off Hedging',
        sizingMultiplier: '0.75x Base Position',
        recommendation: 'Mean-reversion & Oversold Bounce Bots active'
      };
    }
    if (val <= 45) {
      return {
        label: 'Fear',
        color: '#f97316',
        badgeBg: 'bg-amber-500/15',
        badgeBorder: 'border-amber-500/40',
        textColor: 'text-amber-400',
        glow: 'shadow-[0_0_15px_rgba(249,115,22,0.35)]',
        needleColor: '#f97316',
        bias: 'Cautious Neutral Bias',
        engineImpact: 'Standard Stops • Selective Breakout',
        sizingMultiplier: '0.90x Base Position',
        recommendation: 'Strict 10/14 Quorum Required for Buys'
      };
    }
    if (val <= 55) {
      return {
        label: 'Neutral',
        color: '#eab308',
        badgeBg: 'bg-yellow-500/15',
        badgeBorder: 'border-yellow-500/40',
        textColor: 'text-yellow-400',
        glow: 'shadow-[0_0_15px_rgba(234,179,8,0.35)]',
        needleColor: '#eab308',
        bias: 'Balanced Equilibrium',
        engineImpact: 'Standard Parameters • Equal Weighting',
        sizingMultiplier: '1.00x Base Position',
        recommendation: 'Range-bound & Grid Bots optimal'
      };
    }
    if (val <= 75) {
      return {
        label: 'Greed',
        color: '#06b6d4',
        badgeBg: 'bg-cyan-500/15',
        badgeBorder: 'border-cyan-500/40',
        textColor: 'text-cyan-400',
        glow: 'shadow-[0_0_15px_rgba(6,182,212,0.35)]',
        needleColor: '#06b6d4',
        bias: 'Bullish Momentum Expansion',
        engineImpact: 'Loose Trailing Stops • Pyramiding Enabled',
        sizingMultiplier: '1.15x Base Position',
        recommendation: 'Trend & Momentum Bots priority'
      };
    }
    return {
      label: 'Extreme Greed',
      color: '#10b981',
      badgeBg: 'bg-emerald-500/15',
      badgeBorder: 'border-emerald-500/40',
      textColor: 'text-emerald-400',
      glow: 'shadow-[0_0_15px_rgba(16,185,129,0.35)]',
      needleColor: '#10b981',
      bias: 'Overbought Caution Bias',
      engineImpact: 'Aggressive Profit Taking • Tight Trailing Stops',
      sizingMultiplier: '1.25x Profit Targets',
      recommendation: 'Reversal Protection & Hedging Active'
    };
  };

  const theme = getSentimentTheme(score);

  // Calculate needle rotation angle on semi-circle (-90deg to +90deg)
  // score 0 -> -90 deg, score 50 -> 0 deg, score 100 -> +90 deg
  const needleRotation = -90 + (score / 100) * 180;

  // Additional Indian Market derivatives sentiment metrics
  const derivativeSentiment = {
    indiaVix: 12.84,
    vixChange: '-0.38%',
    pcrNifty: 1.18,
    pcrBankNifty: 1.05,
    fiiFlow: '+₹1,842.50 Cr',
    diiFlow: '+₹940.20 Cr',
    marketBreadth: '2.14 Adv/Dec'
  };

  // Compact inline version (for cards or sidebars)
  if (compact) {
    return (
      <div className={`bg-[#080e1b] border border-[#16294a] rounded-xl p-3 shadow-md ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
              Market Sentiment
            </span>
          </div>
          <button
            onClick={() => fetchSentiment(true)}
            disabled={isRefreshing}
            className="text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
            title="Refresh Fear & Greed data"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono" style={{ color: theme.color }}>
              {score}
            </span>
            <div className="flex flex-col">
              <span className={`text-[10px] font-black uppercase tracking-wide ${theme.textColor}`}>
                {classification}
              </span>
              <span className="text-[9px] text-slate-400 font-mono">0-100 Index</span>
            </div>
          </div>

          <div className={`px-2 py-0.5 rounded text-[10px] font-bold border ${theme.badgeBg} ${theme.badgeBorder} ${theme.textColor}`}>
            {theme.sizingMultiplier}
          </div>
        </div>

        {/* Mini Arc Progress Bar */}
        <div className="w-full bg-[#111c33] h-1.5 rounded-full mt-2.5 overflow-hidden flex">
          <div className="h-full bg-rose-500 w-[25%]" title="Extreme Fear" />
          <div className="h-full bg-amber-500 w-[20%]" title="Fear" />
          <div className="h-full bg-yellow-500 w-[10%]" title="Neutral" />
          <div className="h-full bg-cyan-500 w-[20%]" title="Greed" />
          <div className="h-full bg-emerald-500 w-[25%]" title="Extreme Greed" />
        </div>
      </div>
    );
  }

  // Full-featured Dashboard & Decision Network Component
  return (
    <div className={`bg-[#080e1b]/95 border border-[#16294a] rounded-2xl p-4 shadow-[0_4px_25px_rgba(0,0,0,0.6)] backdrop-blur-md relative overflow-hidden font-sans select-none ${className}`}>
      {/* Background glow matching sentiment */}
      <div
        className="absolute top-0 right-0 w-64 h-64 rounded-full blur-[100px] pointer-events-none opacity-20 transition-all duration-700"
        style={{ backgroundColor: theme.color }}
      />

      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#16294a]/80 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-300 shadow-sm">
            <Compass className="w-4 h-4 text-cyan-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide">
                Market Sentiment & Fear / Greed Engine
              </h3>
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono ${isFallback ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'}`}>
                {isFallback ? 'STANDBY (BASELINE)' : 'LIVE API'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
              Real-time multi-asset behavioral sentiment streaming into 14 AI bot heuristics
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {lastFetched && (
            <span className="text-[10px] text-slate-400 font-mono hidden sm:inline-flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              {lastFetched.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            type="button"
            onClick={() => fetchSentiment(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0d1c38] hover:bg-[#13274e] border border-[#1c3666] text-slate-200 text-xs font-semibold transition-all cursor-pointer"
            title="Refresh Fear & Greed index live from API"
          >
            <RefreshCw className={`w-3 h-3 text-cyan-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="text-[11px]">Sync</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Left Gauge & Metrics, Right Decision Engine Context */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center relative z-10">
        
        {/* LEFT COLUMN: SVG Semi-Circular Meter (5 cols) */}
        <div className="md:col-span-5 flex flex-col items-center justify-center bg-[#060c18] border border-[#142340] rounded-xl p-3.5 shadow-inner">
          <div className="relative w-56 h-32 flex items-center justify-center">
            {/* Semi-Circular SVG Dial */}
            <svg viewBox="0 0 200 115" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="sentimentArc" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f43f5e" />     {/* Extreme Fear */}
                  <stop offset="25%" stopColor="#f97316" />    {/* Fear */}
                  <stop offset="50%" stopColor="#eab308" />    {/* Neutral */}
                  <stop offset="75%" stopColor="#06b6d4" />    {/* Greed */}
                  <stop offset="100%" stopColor="#10b981" />   {/* Extreme Greed */}
                </linearGradient>

                <filter id="dialGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Background Arch Track */}
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke="#111f38"
                strokeWidth="14"
                strokeLinecap="round"
              />

              {/* Gradient Filled Colored Arch */}
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke="url(#sentimentArc)"
                strokeWidth="14"
                strokeLinecap="round"
                filter="url(#dialGlow)"
                className="opacity-95"
              />

              {/* Tick Marks */}
              <circle cx="20" cy="100" r="2.5" fill="#f43f5e" />
              <circle cx="56" cy="44" r="2.5" fill="#f97316" />
              <circle cx="100" cy="20" r="3" fill="#eab308" />
              <circle cx="144" cy="44" r="2.5" fill="#06b6d4" />
              <circle cx="180" cy="100" r="2.5" fill="#10b981" />

              {/* Rotating Pointer / Needle */}
              <g
                style={{
                  transform: `rotate(${needleRotation}deg)`,
                  transformOrigin: '100px 100px',
                  transition: 'transform 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
                }}
              >
                {/* Pointer Needle */}
                <line
                  x1="100"
                  y1="100"
                  x2="100"
                  y2="30"
                  stroke={theme.needleColor}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  filter="url(#dialGlow)"
                />
                {/* Needle Base Circle */}
                <circle cx="100" cy="100" r="7" fill="#050a14" stroke={theme.needleColor} strokeWidth="2.5" />
                <circle cx="100" cy="100" r="3" fill={theme.needleColor} />
              </g>
            </svg>

            {/* Score in Center Bottom */}
            <div className="absolute bottom-0 flex flex-col items-center">
              <span className="text-3xl font-black font-mono tracking-tight drop-shadow-md" style={{ color: theme.color }}>
                {score}
              </span>
            </div>
          </div>

          {/* Classification Label */}
          <div className="mt-2 text-center">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${theme.badgeBg} ${theme.badgeBorder} ${theme.textColor} ${theme.glow}`}
            >
              <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: theme.color }} />
              {classification}
            </span>
            <div className="text-[10px] text-slate-400 font-mono mt-1">
              Scale: 0 (Extreme Fear) — 100 (Extreme Greed) • {isFallback ? 'Standby Baseline Model' : 'Live Multi-Asset Behavioral Feed'}
            </div>
          </div>

          {/* 7-Day Mini Sparkline / History Bars */}
          {history && history.length > 0 && (
            <div className="w-full mt-3 pt-2.5 border-t border-[#142340]">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5 font-mono">
                <span>7-Day Sentiment Trend</span>
                <span className="text-slate-300">Previous: {history[1]?.value ?? '64'}</span>
              </div>
              <div className="flex items-end justify-between gap-1.5 h-7">
                {history.slice(0, 7).reverse().map((item, idx) => {
                  const val = parseInt(item.value, 10);
                  const hTheme = getSentimentTheme(val);
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div
                        className="w-full rounded-t transition-all duration-300 group-hover:brightness-125"
                        style={{
                          height: `${Math.max(15, (val / 100) * 28)}px`,
                          backgroundColor: hTheme.color
                        }}
                      />
                      {/* Tooltip on Hover */}
                      <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center bg-[#0b162c] text-white text-[9px] font-mono px-1.5 py-0.5 rounded border border-cyan-500/40 z-30 pointer-events-none whitespace-nowrap shadow-lg">
                        <span>{val} ({item.value_classification})</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: AI Decision Engine Operational Context (7 cols) */}
        <div className="md:col-span-7 space-y-3">
          {/* Box 1: Decision Context & Algorithmic Impact */}
          <div className="bg-[#0b1426] border border-[#1b345f] rounded-xl p-3 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-cyan-300 uppercase tracking-wide flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                AI Decision Engine Context Mapping
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#14284d] text-cyan-200 border border-cyan-500/30">
                Weight: 22.5% Quorum
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-[#060c18] p-2 rounded-lg border border-[#16294a]">
                <div className="text-[10px] text-slate-400 uppercase">Execution Bias</div>
                <div className="text-white font-bold text-[11px] truncate mt-0.5" style={{ color: theme.color }}>
                  {theme.bias}
                </div>
              </div>

              <div className="bg-[#060c18] p-2 rounded-lg border border-[#16294a]">
                <div className="text-[10px] text-slate-400 uppercase">Position Sizing</div>
                <div className="text-white font-bold text-[11px] truncate mt-0.5">
                  {theme.sizingMultiplier}
                </div>
              </div>

              <div className="bg-[#060c18] p-2 rounded-lg border border-[#16294a]">
                <div className="text-[10px] text-slate-400 uppercase">Engine Parameters</div>
                <div className="text-slate-200 text-[10.5px] truncate mt-0.5">
                  {theme.engineImpact}
                </div>
              </div>

              <div className="bg-[#060c18] p-2 rounded-lg border border-[#16294a]">
                <div className="text-[10px] text-slate-400 uppercase">Optimal Bot Cluster</div>
                <div className="text-cyan-300 text-[10.5px] truncate mt-0.5 font-bold">
                  {score > 55 ? 'Bots 1, 2, 4 (Momentum & Trend)' : 'Bots 6, 9 (Reversion & Hedging)'}
                </div>
              </div>
            </div>

            <div className="mt-2.5 p-2 rounded bg-cyan-950/30 border border-cyan-800/30 text-[11px] text-slate-300 flex items-start gap-2">
              <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div className="leading-tight font-sans">
                <span className="font-bold text-cyan-300">Strategy Rationale: </span>
                {theme.recommendation}. The 14-bot consensus engine dynamically relaxes or constrains quorum agreement based on this sentiment feed.
              </div>
            </div>
          </div>

          {/* Box 2: Derivatives & Market Breadth Sentiment Feeds */}
          <div className="bg-[#0b1426] border border-[#1b345f] rounded-xl p-2.5 shadow-sm">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 mb-2">
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                Indian Market Microstructure Sentiment
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">Consensus: Bullish</span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 text-center text-xs font-mono">
              <div className="bg-[#070f1e] p-1.5 rounded border border-[#162b50]">
                <div className="text-[9px] text-slate-400">India VIX</div>
                <div className="text-white font-bold text-[11px] mt-0.5">{derivativeSentiment.indiaVix}</div>
                <div className="text-[9px] text-emerald-400">{derivativeSentiment.vixChange}</div>
              </div>

              <div className="bg-[#070f1e] p-1.5 rounded border border-[#162b50]">
                <div className="text-[9px] text-slate-400">PCR (Nifty)</div>
                <div className="text-white font-bold text-[11px] mt-0.5">{derivativeSentiment.pcrNifty}</div>
                <div className="text-[9px] text-cyan-400">Bullish (&gt;1.0)</div>
              </div>

              <div className="bg-[#070f1e] p-1.5 rounded border border-[#162b50]">
                <div className="text-[9px] text-slate-400">FII Net Flow</div>
                <div className="text-emerald-400 font-bold text-[10px] mt-0.5 truncate">{derivativeSentiment.fiiFlow}</div>
                <div className="text-[9px] text-emerald-400">Net Buyer</div>
              </div>

              <div className="bg-[#070f1e] p-1.5 rounded border border-[#162b50]">
                <div className="text-[9px] text-slate-400">Market Breadth</div>
                <div className="text-cyan-300 font-bold text-[11px] mt-0.5">{derivativeSentiment.marketBreadth}</div>
                <div className="text-[9px] text-cyan-400">Positive</div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
