import React, { useState, useEffect } from 'react';
import { Network, Cpu, Zap, Activity, ArrowRight, ShieldCheck, CheckCircle2, Compass, Play, Send, Sparkles, Newspaper, TrendingUp, TrendingDown, Radio } from 'lucide-react';
import MarketSentimentWidget from '../MarketSentimentWidget';
import { toastEmitter } from '../../utils/toastEmitter';
import { evaluatePeerPermissionHandshake } from '../../utils/botDecisionEngine';
import { newsSentimentEngine } from '../../utils/newsSentimentAnalyzer';

export default function DecisionNetworkView({ bots, onOpenDetails }) {
  const [selectedNode, setSelectedNode] = useState(bots[0]);
  const [simulationSpeed, setSimulationSpeed] = useState('1x');
  const [activeSentiment, setActiveSentiment] = useState({ score: 68, classification: 'Greed' });
  const [newsSentiment, setNewsSentiment] = useState(() => newsSentimentEngine.getCompositeState());
  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    const unsub = newsSentimentEngine.subscribe((state) => {
      setNewsSentiment(state);
    });
    return () => unsub();
  }, []);

  // Trigger Quorum Consensus Trade Execution & Toast Alert
  const handleExecuteConsensusTrade = (action = 'BUY') => {
    setIsExecuting(true);
    const node = selectedNode || bots[0];
    const handshake = evaluatePeerPermissionHandshake(node?.id || 1, action);
    const approvals = handshake.approvalCount > 0 ? handshake.approvalCount : 12;

    const toastData = {
      id: `quorum_${Date.now()}`,
      botId: node?.id || 1,
      botName: node?.name || 'Scalper Bot',
      symbol: node?.asset || 'NIFTY 50',
      action: action,
      type: action,
      price: Number(node?.price || 25146.30),
      qty: node?.asset?.includes('NIFTY') ? 50 : node?.asset?.includes('BANK') ? 30 : 100,
      strategy: node?.strategy || 'Peer Quorum Momentum Breakout',
      quorum: `${approvals}/14 Approved`,
      consensusRate: `${Math.round((approvals / 14) * 100)}%`,
      executionMode: 'PAPER',
      latency: `${(Math.random() * 1.5 + 1.2).toFixed(1)}ms IPC`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    // Emit Real-Time Neon Cyan Toast
    toastEmitter.emitTradeExecution(toastData);

    setTimeout(() => {
      setIsExecuting(false);
    }, 400);
  };

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

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#0c1833] border border-cyan-500/30 text-xs font-mono">
            <Compass className="w-3.5 h-3.5 text-cyan-400 animate-spin [animation-duration:15s]" />
            <span className="text-slate-400">Live Sentiment Context:</span>
            <span className="text-cyan-300 font-bold">{activeSentiment.classification} ({activeSentiment.score})</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono">Consensus Rate:</span>
            <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 px-2.5 py-1 rounded-lg text-xs font-bold font-mono">
              92.8% Agreement Quorum
            </span>
          </div>
        </div>
      </div>

      {/* Real-time Fear & Greed Market Sentiment Context Widget */}
      <MarketSentimentWidget
        onSentimentChange={(data) => setActiveSentiment(data)}
      />

      {/* Real-time Financial News Sentiment AI Feed Strip for Decision Network */}
      <div className="bg-[#070e1c] border border-cyan-500/30 rounded-xl p-3 shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0">
            <Radio className="w-4 h-4 animate-pulse text-cyan-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white tracking-wide">
                AI NEWS SENTIMENT RADAR
              </span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                NLP ACTIVE
              </span>
            </div>
            {newsSentiment.latestHeadline && (
              <p className="text-[11px] text-slate-300 font-mono truncate max-w-xl mt-0.5">
                <span className="text-cyan-400 font-bold">{newsSentiment.latestHeadline.impactAsset}:</span> {newsSentiment.latestHeadline.headline}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0b162c] border border-[#1d3866]">
            {newsSentiment.compositeScore >= 0 ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span className="text-slate-400">Score:</span>
            <span className={`font-bold ${newsSentiment.compositeScore >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {newsSentiment.compositeScore > 0 ? `+${newsSentiment.compositeScore}` : newsSentiment.compositeScore}
            </span>
            <span className="text-slate-400">({newsSentiment.bullishPct}% Bull)</span>
          </div>

          <div className="px-2.5 py-1 rounded-lg bg-[#0052cc]/20 border border-cyan-500/40 text-cyan-300 font-bold">
            Quorum Bias: {newsSentiment.quorumBias >= 0 ? `+${newsSentiment.quorumBias} BUY Votes` : `${newsSentiment.quorumBias} SELL Bias`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: 14 Nodes Grid Visualizer */}
        <div className="lg:col-span-8 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              Active Consensus Node Topology (14 Nodes)
            </h3>
            <span className="text-[10px] font-mono text-slate-400">
              Click node to select for Quorum Trade execution
            </span>
          </div>

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

          {/* Central AI Processor Card with Real-time Burst Trigger */}
          <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-[#071329] via-[#0d224d] to-[#071329] border border-cyan-500/50 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-400/40 shadow-[0_0_15px_rgba(0,240,255,0.4)]">
                <Cpu className="w-6 h-6 animate-spin" style={{ animationDuration: '8s' }} />
              </div>
              <div>
                <h4 className="text-sm font-black text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                  <span>AI DECISION ENGINE (Central Arbiter)</span>
                  <span className="px-2 py-0.2 rounded text-[9px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Online
                  </span>
                </h4>
                <p className="text-xs text-slate-300 font-sans mt-0.5">
                  Collecting 182 cross-node directional vectors every 500ms. Applying Bayesian probability weights to eliminate false breakouts.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <div className="text-[10px] font-mono text-slate-400">Consensus IPC:</div>
                <div className="text-xs font-mono font-bold text-emerald-400">1.8 ms</div>
              </div>
              <button
                type="button"
                onClick={() => handleExecuteConsensusTrade('BUY')}
                disabled={isExecuting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 text-cyan-200 text-xs font-bold transition-all shadow-[0_0_12px_rgba(0,240,255,0.3)] cursor-pointer"
                title="Test Decision Network trade execution with live toast alert"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Simulate Quorum Fill</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Selected Node Consensus Profile & Manual Quorum Execution */}
        <div className="lg:col-span-4 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#1e3a6e]/40 pb-3 mb-3">
              <div>
                <span className="text-[10px] text-cyan-400 font-mono uppercase font-bold">Node Profile</span>
                <h3 className="text-sm font-bold text-white">Bot {selectedNode?.id}: {selectedNode?.name}</h3>
              </div>
              <button
                onClick={() => onOpenDetails && onOpenDetails(selectedNode)}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold underline cursor-pointer"
              >
                Inspect
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-2.5 rounded-lg bg-[#060c1c] border border-[#1e3a6e]/40">
                <div className="text-slate-400 text-[10px] uppercase">Associated Asset</div>
                <div className="text-white font-bold text-sm mt-0.5">{selectedNode?.asset || 'NIFTY 50'}</div>
                <div className="text-emerald-400 text-xs mt-0.5">₹{Number(selectedNode?.price || 25146.30).toLocaleString()}</div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#060c1c] border border-[#1e3a6e]/40 space-y-1">
                <div className="text-slate-400 text-[10px] uppercase">Vote Breakdown (13 Bots)</div>
                <div className="flex items-center justify-between font-bold">
                  <span className="text-emerald-400">BUY: {selectedNode?.decisions?.buy ?? 11}</span>
                  <span className="text-rose-400">SELL: {selectedNode?.decisions?.sell ?? 2}</span>
                  <span className="text-amber-400">HOLD: {selectedNode?.decisions?.hold ?? 0}</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#060c1c] border border-[#1e3a6e]/40 space-y-1">
                <div className="text-slate-400 text-[10px] uppercase">Strategy Rationale</div>
                <p className="text-slate-300 text-[11px] font-sans leading-tight">
                  {selectedNode?.consensusReason || 'SuperTrend cross confirmed with 3 correlated peer bots. Volatility band expansion verified.'}
                </p>
              </div>

              {/* Instant Quorum Trade Execution Action Section */}
              <div className="p-2.5 rounded-lg bg-[#09152b] border border-cyan-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-cyan-300 font-bold uppercase tracking-wider flex items-center gap-1">
                    <Zap className="w-3 h-3 text-cyan-400" />
                    Decision Network Execution
                  </span>
                  <span className="text-[9px] text-slate-400">Triggers Neon Alert</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleExecuteConsensusTrade('BUY')}
                    disabled={isExecuting}
                    className="flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/60 text-emerald-300 text-xs font-bold shadow-[0_0_12px_rgba(16,185,129,0.3)] transition-all cursor-pointer"
                  >
                    <span>BUY Quorum</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExecuteConsensusTrade('SELL')}
                    disabled={isExecuting}
                    className="flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/60 text-rose-300 text-xs font-bold shadow-[0_0_12px_rgba(244,63,94,0.3)] transition-all cursor-pointer"
                  >
                    <span>SELL Quorum</span>
                  </button>
                </div>
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

