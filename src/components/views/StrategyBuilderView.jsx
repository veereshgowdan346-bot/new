import React, { useState } from 'react';
import { Cpu, Plus, Save, Play, Sliders, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function StrategyBuilderView() {
  const [strategyName, setStrategyName] = useState('Chintu Cybernetic Alpha V4');
  const [consensusThreshold, setConsensusThreshold] = useState(9);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [emaFast, setEmaFast] = useState(9);
  const [emaSlow, setEmaSlow] = useState(21);
  const [stopLossPct, setStopLossPct] = useState(0.75);
  const [targetPct, setTargetPct] = useState(1.80);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="space-y-4 animate-fadeIn select-none">
      {/* Header */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            AI Strategy & Consensus Logic Builder
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Configure algorithmic rules, consensus thresholds, and neural weights
          </p>
        </div>

        <button
          onClick={handleSave}
          className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/50 px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-[0_0_12px_rgba(0,240,255,0.3)] flex items-center gap-1.5"
        >
          <Save className="w-4 h-4" />
          <span>Save & Deploy to Bots</span>
        </button>
      </div>

      {savedSuccess && (
        <div className="bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 p-3 rounded-xl text-xs font-bold font-mono animate-bounce">
          Strategy parameters compiled and hot-reloaded to all 14 bots across broker streams!
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Strategy Meta & Consensus */}
        <div className="lg:col-span-6 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 space-y-4 shadow-lg">
          <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-cyan-400" />
            Core Consensus Parameters
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

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span className="font-sans">Minimum Bot Consensus Quorum:</span>
                <span className="text-cyan-400 font-bold">{consensusThreshold} of 13 Bots ({Math.round((consensusThreshold / 13) * 100)}%)</span>
              </div>
              <input
                type="range"
                min="7"
                max="13"
                value={consensusThreshold}
                onChange={(e) => setConsensusThreshold(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
              <p className="text-[10px] text-slate-400 font-sans mt-0.5">
                Orders will only fire if at least {consensusThreshold} out of the 13 peer bots concur on directional bias.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans">Fast EMA Period</label>
                <input
                  type="number"
                  value={emaFast}
                  onChange={(e) => setEmaFast(Number(e.target.value))}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg"
                />
              </div>

              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans">Slow EMA Period</label>
                <input
                  type="number"
                  value={emaSlow}
                  onChange={(e) => setEmaSlow(Number(e.target.value))}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-400 text-[10px] uppercase font-sans">RSI Lookback Period</label>
              <input
                type="number"
                value={rsiPeriod}
                onChange={(e) => setRsiPeriod(Number(e.target.value))}
                className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Risk / Reward & Execution Filters */}
        <div className="lg:col-span-6 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 space-y-4 shadow-lg flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-emerald-400" />
              Dynamic Risk Management Bounds
            </h3>

            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans">Default Stop Loss (%)</label>
                <input
                  type="number"
                  step="0.05"
                  value={stopLossPct}
                  onChange={(e) => setStopLossPct(Number(e.target.value))}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-rose-400 font-bold p-2 rounded-lg"
                />
              </div>

              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans">Default Take Profit (%)</label>
                <input
                  type="number"
                  step="0.05"
                  value={targetPct}
                  onChange={(e) => setTargetPct(Number(e.target.value))}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-emerald-400 font-bold p-2 rounded-lg"
                />
              </div>
            </div>

            <div className="bg-[#060c1c] border border-[#1e3a6e]/40 rounded-xl p-3 space-y-2 text-xs">
              <div className="text-[10px] font-semibold text-slate-400 uppercase">Live Pipeline Protections</div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>FinBERT Real-time News Sentiment Gating (&gt; 0.65 threshold)</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Slippage guard: Auto-cancel if market moves &gt; 0.15% before fill</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Trailing Stop: Auto-lock 50% profit when position crosses 1:1.5 RR</span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs font-mono text-cyan-300">
            Calculated Risk-to-Reward Ratio: 1 : {(targetPct / stopLossPct).toFixed(2)} (High Alpha Expectancy)
          </div>
        </div>
      </div>
    </div>
  );
}

