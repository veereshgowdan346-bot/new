import React, { useState } from 'react';
import { Network, Cpu, Zap, Activity, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function DecisionNetworkView({ bots, onOpenDetails }) {
  const [selectedNode, setSelectedNode] = useState(bots[0]);
  const [simulationSpeed, setSimulationSpeed] = useState('1x');

  return (
    <div className="space-y-4 animate-fadeIn select-none">
      {/* Header */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Network className="w-5 h-5 text-cyan-400" />
            AI Decision Engine • Distributed Consensus Matrix
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            14 Neural Agents executing peer-to-peer cross-asset validation before trade execution
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-mono">Consensus Rate:</span>
          <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 px-2.5 py-1 rounded-lg text-xs font-bold font-mono">
            92.8% Agreement Quorum
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: 14 Nodes Grid Visualizer */}
        <div className="lg:col-span-8 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg">
          <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            Active Consensus Node Topology (14 Nodes)
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-7 gap-2.5">
            {bots.map((b) => {
              const isSelected = selectedNode?.id === b.id;
              const actionColor =
                b.action === 'BUY'
                  ? 'border-emerald-500/60 text-emerald-400 bg-emerald-500/10'
                  : b.action === 'SELL'
                  ? 'border-rose-500/60 text-rose-400 bg-rose-500/10'
                  : 'border-amber-500/60 text-amber-400 bg-amber-500/10';

              return (
                <div
                  key={b.id}
                  onClick={() => setSelectedNode(b)}
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all text-center flex flex-col justify-between ${
                    isSelected
                      ? 'border-cyan-400 bg-[#10244c] shadow-[0_0_15px_rgba(0,240,255,0.4)] scale-105'
                      : 'border-[#1e3a6e]/60 bg-[#070e1e]/80 hover:border-cyan-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="w-4 h-4 rounded-full bg-[#162b55] text-[9px] font-mono font-bold text-cyan-300 flex items-center justify-center">
                      {b.id}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${b.action === 'BUY' ? 'bg-emerald-400 shadow-[0_0_6px_#10b981]' : b.action === 'SELL' ? 'bg-rose-500 shadow-[0_0_6px_#f43f5e]' : 'bg-amber-400'}`}></span>
                  </div>
                  <div className="text-[11px] font-bold text-white truncate">{b.name}</div>
                  <div className="text-[9px] text-slate-400 font-mono truncate">{b.asset}</div>
                  <div className="mt-1.5 pt-1 border-t border-[#1e3a6e]/40">
                    <span className={`text-[8.5px] font-black uppercase px-1 py-0.2 rounded border ${actionColor}`}>
                      {b.action}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Central AI Processor Card */}
          <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-[#071329] via-[#0d224d] to-[#071329] border border-cyan-500/50 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-400/40 shadow-[0_0_15px_rgba(0,240,255,0.4)]">
                <Cpu className="w-6 h-6 animate-spin" style={{ animationDuration: '8s' }} />
              </div>
              <div>
                <h4 className="text-sm font-black text-cyan-300 uppercase tracking-wider">
                  AI DECISION ENGINE (Central Arbiter)
                </h4>
                <p className="text-xs text-slate-300 font-sans mt-0.5">
                  Collecting 182 cross-node directional vectors every 500ms. Applying Bayesian probability weights to eliminate false breakouts.
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="text-xs font-mono text-slate-400">Total Latency:</div>
              <div className="text-sm font-mono font-bold text-emerald-400">12.4 ms</div>
            </div>
          </div>
        </div>

        {/* Right: Selected Node Consensus Profile */}
        <div className="lg:col-span-4 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#1e3a6e]/40 pb-3 mb-3">
              <div>
                <span className="text-[10px] text-cyan-400 font-mono uppercase font-bold">Node Profile</span>
                <h3 className="text-sm font-bold text-white">Bot {selectedNode?.id}: {selectedNode?.name}</h3>
              </div>
              <button
                onClick={() => onOpenDetails && onOpenDetails(selectedNode)}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold underline"
              >
                Inspect
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-2.5 rounded-lg bg-[#060c1c] border border-[#1e3a6e]/40">
                <div className="text-slate-400 text-[10px] uppercase">Associated Asset</div>
                <div className="text-white font-bold text-sm mt-0.5">{selectedNode?.asset}</div>
                <div className="text-emerald-400 text-xs mt-0.5">₹{selectedNode?.price.toLocaleString()}</div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#060c1c] border border-[#1e3a6e]/40 space-y-1">
                <div className="text-slate-400 text-[10px] uppercase">Vote Breakdown (13 Bots)</div>
                <div className="flex items-center justify-between font-bold">
                  <span className="text-emerald-400">BUY: {selectedNode?.decisions.buy}</span>
                  <span className="text-rose-400">SELL: {selectedNode?.decisions.sell}</span>
                  <span className="text-amber-400">HOLD: {selectedNode?.decisions.hold}</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#060c1c] border border-[#1e3a6e]/40 space-y-1">
                <div className="text-slate-400 text-[10px] uppercase">Strategy Rationale</div>
                <p className="text-slate-300 text-[11px] font-sans leading-tight">
                  {selectedNode?.consensusReason}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#1e3a6e]/40">
            <div className="flex justify-between items-center text-xs font-mono text-slate-400">
              <span>Node Security:</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> E2E Verified
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

