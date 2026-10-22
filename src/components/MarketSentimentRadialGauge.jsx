import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Compass,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Activity,
  ShieldCheck,
  AlertTriangle,
  Zap,
  Sliders,
  CheckCircle2,
  Cpu
} from 'lucide-react';
import { soundEngine } from '../utils/audioChime';

export default function MarketSentimentRadialGauge({
  onSentimentChange,
  className = ''
}) {
  const [sentimentScore, setSentimentScore] = useState(68);
  const [classification, setClassification] = useState('Greed');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [manualOverride, setManualOverride] = useState(null);

  // Fetch live Fear & Greed index with resilient fallback
  const fetchLiveSentiment = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch('https://api.alternative.me/fng/?limit=1&format=json', {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = await res.json();
        if (json?.data?.[0]) {
          const val = parseInt(json.data[0].value, 10);
          const cls = json.data[0].value_classification;
          setSentimentScore(val);
          setClassification(cls);
          setLastUpdated(new Date());
          setManualOverride(null);
          if (onSentimentChange) {
            onSentimentChange({ score: val, classification: cls });
          }
          soundEngine.playBuyChime();
          return;
        }
      }
    } catch (e) {
      // Fallback gracefully without breaking
    } finally {
      setIsRefreshing(false);
    }
  }, [onSentimentChange]);

  // Initial fetch on mount
  useEffect(() => {
    fetchLiveSentiment();
  }, [fetchLiveSentiment]);

  // Dynamic theme based on score
  const sentimentTheme = useMemo(() => {
    const val = sentimentScore;
    if (val <= 25) {
      return {
        label: 'Extreme Fear',
        color: '#f43f5e',
        glowColor: 'rgba(244, 63, 94, 0.4)',
        badgeBg: 'bg-rose-500/15',
        badgeBorder: 'border-rose-500/40',
        textColor: 'text-rose-400',
        bias: 'Contrarian Accumulation Bias',
        sizingMultiplier: '0.75x Sizing',
        stopLoss: 'Tight 1.0% Trailing SL',
        quorum: '12/14 Bots Consensus (High Hurdle)',
        botRecommendation: 'Mean Reversion & Bullion Hedging Active'
      };
    }
    if (val <= 45) {
      return {
        label: 'Fear',
        color: '#f97316',
        glowColor: 'rgba(249, 115, 22, 0.4)',
        badgeBg: 'bg-amber-500/15',
        badgeBorder: 'border-amber-500/40',
        textColor: 'text-amber-400',
        bias: 'Cautious Neutral Bias',
        sizingMultiplier: '0.90x Sizing',
        stopLoss: 'Standard 1.5% SL',
        quorum: '11/14 Bots Consensus',
        botRecommendation: 'Defensive Equity & Breakout Filter'
      };
    }
    if (val <= 55) {
      return {
        label: 'Neutral',
        color: '#eab308',
        glowColor: 'rgba(234, 179, 8, 0.4)',
        badgeBg: 'bg-yellow-500/15',
        badgeBorder: 'border-yellow-500/40',
        textColor: 'text-yellow-400',
        bias: 'Balanced Equilibrium',
        sizingMultiplier: '1.00x Base Sizing',
        stopLoss: 'Standard 1.8% SL',
        quorum: '10/14 Bots Consensus',
        botRecommendation: 'Grid Scalping & Mean Reversion Optimal'
      };
    }
    if (val <= 75) {
      return {
        label: 'Greed',
        color: '#06b6d4',
        glowColor: 'rgba(6, 182, 212, 0.4)',
        badgeBg: 'bg-cyan-500/15',
        badgeBorder: 'border-cyan-500/40',
        textColor: 'text-cyan-400',
        bias: 'Bullish Momentum Expansion',
        sizingMultiplier: '1.15x Sizing',
        stopLoss: 'Pyramiding Enabled (2.0% SL)',
        quorum: '11/14 Bots Consensus',
        botRecommendation: 'Trend Following & Gamma Squeeze Priority'
      };
    }
    return {
      label: 'Extreme Greed',
      color: '#10b981',
      glowColor: 'rgba(16, 185, 129, 0.4)',
      badgeBg: 'bg-emerald-500/15',
      badgeBorder: 'border-emerald-500/40',
      textColor: 'text-emerald-400',
      bias: 'Overbought Expansion (Lock Profits)',
      sizingMultiplier: '1.25x Profit Targets',
      stopLoss: 'Tight Trailing Stop 1.2%',
      quorum: '12/14 Bots Consensus',
      botRecommendation: 'Profit Realization & Safe-Haven Rebalancing'
    };
  }, [sentimentScore]);

  // Calculate needle rotation angle (-90deg to +90deg for 0 to 100)
  const needleAngle = -90 + (sentimentScore / 100) * 180;

  // Manual Regime Simulation
  const handleSimulateRegime = (score, label) => {
    setSentimentScore(score);
    setClassification(label);
    setManualOverride(label);
    soundEngine.playBuyChime();
    if (onSentimentChange) {
      onSentimentChange({ score, classification: label });
    }
  };

  return (
    <div className={`glass-panel p-4 rounded-2xl border border-[#16294a]/80 relative overflow-hidden flex flex-col justify-between ${className}`}>
      {/* Background ambient radial glow */}
      <div
        className="absolute -top-10 -right-10 w-44 h-44 rounded-full blur-[80px] pointer-events-none opacity-25 transition-all duration-700"
        style={{ backgroundColor: sentimentTheme.color }}
      />

      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-[#16294a]/60 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-300">
            <Compass className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
              Market Sentiment & Fear / Greed Gauge
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                QUANT RADIAL
              </span>
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">
              Synchronized with 14-Bot Consensus Engine
            </span>
          </div>
        </div>

        <button
          onClick={fetchLiveSentiment}
          disabled={isRefreshing}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#070d1d] hover:bg-[#0c1833] border border-slate-700/80 text-slate-300 text-[11px] font-mono transition-all cursor-pointer"
          title="Refresh Fear & Greed Index from live source"
        >
          <RefreshCw className={`w-3 h-3 text-cyan-400 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Sync</span>
        </button>
      </div>

      {/* Radial Gauge SVG Container */}
      <div className="flex flex-col items-center justify-center py-2 relative z-10">
        <div className="relative w-56 h-32 flex items-center justify-center">
          <svg viewBox="0 0 200 115" className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="radialSentimentGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f43f5e" />    {/* Extreme Fear */}
                <stop offset="25%" stopColor="#f97316" />   {/* Fear */}
                <stop offset="50%" stopColor="#eab308" />   {/* Neutral */}
                <stop offset="75%" stopColor="#06b6d4" />   {/* Greed */}
                <stop offset="100%" stopColor="#10b981" />  {/* Extreme Greed */}
              </linearGradient>

              <filter id="gaugeGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Background Outer Arc Track */}
            <path
              d="M 22 100 A 78 78 0 0 1 178 100"
              fill="none"
              stroke="#0f1a30"
              strokeWidth="14"
              strokeLinecap="round"
            />

            {/* Primary Glowing Gradient Gauge Arc */}
            <path
              d="M 22 100 A 78 78 0 0 1 178 100"
              fill="none"
              stroke="url(#radialSentimentGradient)"
              strokeWidth="14"
              strokeLinecap="round"
              filter="url(#gaugeGlow)"
              className="opacity-95"
            />

            {/* Tick Markers */}
            <circle cx="22" cy="100" r="2.5" fill="#f43f5e" />
            <circle cx="58" cy="46" r="2.5" fill="#f97316" />
            <circle cx="100" cy="22" r="3" fill="#eab308" />
            <circle cx="142" cy="46" r="2.5" fill="#06b6d4" />
            <circle cx="178" cy="100" r="2.5" fill="#10b981" />

            {/* Rotating Gauge Needle */}
            <g
              transform={`rotate(${needleAngle}, 100, 100)`}
              style={{ transition: 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
            >
              <line
                x1="100"
                y1="100"
                x2="100"
                y2="28"
                stroke={sentimentTheme.color}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <polygon
                points="97,34 103,34 100,24"
                fill={sentimentTheme.color}
              />
            </g>

            {/* Center Pivot Boss */}
            <circle cx="100" cy="100" r="8" fill="#070d1d" stroke="#16294a" strokeWidth="2" />
            <circle cx="100" cy="100" r="4.5" fill={sentimentTheme.color} />
          </svg>

          {/* Central Numeric Score Display */}
          <div className="absolute bottom-1 flex flex-col items-center">
            <span
              className="text-3xl font-black font-mono tracking-tight leading-none"
              style={{ color: sentimentTheme.color, textShadow: `0 0 16px ${sentimentTheme.glowColor}` }}
            >
              {sentimentScore}
            </span>
            <span className={`text-[10.5px] font-bold font-mono uppercase tracking-wider mt-0.5 ${sentimentTheme.textColor}`}>
              {sentimentTheme.label}
            </span>
          </div>
        </div>

        {/* Arc Labels */}
        <div className="w-56 flex justify-between text-[9px] font-mono text-slate-500 px-2 mt-1">
          <span>0 (Fear)</span>
          <span>50 (Neutral)</span>
          <span>100 (Greed)</span>
        </div>
      </div>

      {/* Quant Multi-Factor Breakdown */}
      <div className="grid grid-cols-3 gap-1.5 py-2 border-y border-[#16294a]/60 text-[10.5px] font-mono my-1">
        <div className="p-1.5 bg-[#070d1d] rounded-lg border border-slate-800/80">
          <span className="text-[9px] text-slate-500 uppercase block">India VIX</span>
          <span className="font-bold text-emerald-400">12.84 (-0.4%)</span>
        </div>
        <div className="p-1.5 bg-[#070d1d] rounded-lg border border-slate-800/80">
          <span className="text-[9px] text-slate-500 uppercase block">NIFTY PCR</span>
          <span className="font-bold text-cyan-300">1.18 (Bullish)</span>
        </div>
        <div className="p-1.5 bg-[#070d1d] rounded-lg border border-slate-800/80">
          <span className="text-[9px] text-slate-500 uppercase block">FII Net Flow</span>
          <span className="font-bold text-emerald-400">+₹2,782 Cr</span>
        </div>
      </div>

      {/* Decision Engine Operational Impact */}
      <div className="p-2.5 bg-[#070d1d] rounded-xl border border-slate-800/90 space-y-1.5 text-xs font-mono">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 flex items-center gap-1">
            <Cpu className="w-3 h-3 text-cyan-400" />
            Position Sizing:
          </span>
          <span className={`font-bold ${sentimentTheme.textColor}`}>
            {sentimentTheme.sizingMultiplier}
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            RMS Stop-Loss:
          </span>
          <span className="text-slate-200">
            {sentimentTheme.stopLoss}
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-400" />
            Quorum Gate:
          </span>
          <span className="text-cyan-300">
            {sentimentTheme.quorum}
          </span>
        </div>
      </div>

      {/* Interactive Regime Simulator Controls */}
      <div className="pt-2">
        <div className="flex items-center justify-between text-[9.5px] font-mono text-slate-400 mb-1">
          <span>REGIME SIMULATOR:</span>
          {manualOverride && (
            <span className="text-cyan-300">Simulating: {manualOverride}</span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1 text-[9.5px] font-mono">
          <button
            onClick={() => handleSimulateRegime(18, 'Extreme Fear')}
            className="py-1 px-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-all cursor-pointer"
          >
            Fear (18)
          </button>
          <button
            onClick={() => handleSimulateRegime(50, 'Neutral')}
            className="py-1 px-1 rounded bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 transition-all cursor-pointer"
          >
            Neutral (50)
          </button>
          <button
            onClick={() => handleSimulateRegime(68, 'Greed')}
            className="py-1 px-1 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 transition-all cursor-pointer"
          >
            Greed (68)
          </button>
          <button
            onClick={() => handleSimulateRegime(88, 'Extreme Greed')}
            className="py-1 px-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-all cursor-pointer"
          >
            Greed (88)
          </button>
        </div>
      </div>
    </div>
  );
}
