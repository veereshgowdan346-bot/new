import React, { useState, useEffect, useMemo } from 'react';
import {
  Network,
  Cpu,
  Zap,
  Activity,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Compass,
  Play,
  Send,
  Sparkles,
  Newspaper,
  TrendingUp,
  TrendingDown,
  Radio,
  Scale,
  Receipt,
  FileCheck
} from 'lucide-react';
import MarketSentimentWidget from '../MarketSentimentWidget';
import { toastEmitter } from '../../utils/toastEmitter';
import { evaluate14BotQuorumConsensus, BOT_DEFINITIONS, QUORUM_DECISION_TYPES } from '../../utils/quorumConsensusEngine';
import { newsSentimentEngine } from '../../utils/newsSentimentAnalyzer';
import { validateNetProfitGuardrail, calculateTradeCharges, INSTITUTIONAL_HURDLE_ROI_PCT, formatIndianCurrency } from '../../utils/taxCalculator';

export default function DecisionNetworkView({ bots = [], onOpenDetails }) {
  const [selectedBotId, setSelectedBotId] = useState(1);
  const [activeSentiment, setActiveSentiment] = useState({ score: 68, classification: 'Greed' });
  const [newsSentiment, setNewsSentiment] = useState(() => newsSentimentEngine.getCompositeState());
  const [isExecuting, setIsExecuting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  useEffect(() => {
    const unsub = newsSentimentEngine.subscribe((state) => {
      setNewsSentiment(state);
    });
    return () => unsub();
  }, []);

  const selectedBot = useMemo(() => {
    return BOT_DEFINITIONS.find((b) => b.id === selectedBotId) || BOT_DEFINITIONS[0];
  }, [selectedBotId]);

  // Real-time 14-Bot Quorum Consensus Evaluation for selected asset
  const quorumEvaluation = useMemo(() => {
    return evaluate14BotQuorumConsensus({
      symbol: selectedBot.asset,
      action: 'BUY',
      price: 25146.30,
      orderBookDepth: {
        bids: [{ price: 25145, qty: 1500 }, { price: 25144, qty: 2200 }],
        asks: [{ price: 25148, qty: 1100 }, { price: 25149, qty: 1800 }]
      }
    });
  }, [selectedBot]);

  // Mandatory Pre-Trade Taxation & Brokerage Guardrail Audit
  const guardrailAudit = useMemo(() => {
    const price = 25146.30;
    const qty = selectedBot.lotSize || 50;
    return validateNetProfitGuardrail({
      entryPrice: price,
      targetPrice: price * 1.025, // 2.5% projected move
      qty,
      action: 'BUY',
      segment: selectedBot.segment,
      hurdleNetRoiPct: INSTITUTIONAL_HURDLE_ROI_PCT
    });
  }, [selectedBot]);

  // Trigger Quorum Consensus Trade Execution & Toast Alert
  const handleExecuteConsensusTrade = (action = 'BUY') => {
    setIsExecuting(true);
    setStatusMessage(null);

    // Re-evaluate specifically for the requested action
    const evalResult = evaluate14BotQuorumConsensus({
      symbol: selectedBot.asset,
      action: action,
      price: 25146.30
    });

    const guardrail = validateNetProfitGuardrail({
      entryPrice: 25146.30,
      targetPrice: action === 'BUY' ? 25146.30 * 1.025 : 25146.30 * 0.975,
      qty: selectedBot.lotSize || 50,
      action: action,
      segment: selectedBot.segment
    });

    // Check Quorum Gate
    if (!evalResult.isApproved) {
      const isVeto = evalResult.decision === QUORUM_DECISION_TYPES.QUORUM_VETO;
      const msg = isVeto
        ? `Quorum Veto: ${evalResult.matchingVotes}/14 AI Bots agreed with ${action}. 7-8 votes strictly vetoed.`
        : `Consensus Denied: Only ${evalResult.matchingVotes}/14 bots approved ${action} (9 required).`;

      setStatusMessage({ type: 'error', text: msg });
      toastEmitter.emitAlertTriggered({
        id: `veto_${Date.now()}`,
        symbol: selectedBot.asset,
        type: 'QUORUM_VETO',
        triggeredPrice: 25146.30,
        condition: '7-8 Bot Veto'
      });
      setIsExecuting(false);
      return;
    }

    // Check Pre-Trade Net Profit Guardrail
    if (!guardrail.isApproved) {
      setStatusMessage({ type: 'error', text: guardrail.rejectionReason });
      setIsExecuting(false);
      return;
    }

    // Quorum & Net-Profit Guardrail Passed!
    const toastData = {
      id: `quorum_${Date.now()}`,
      botId: selectedBot.id,
      botName: selectedBot.name,
      symbol: selectedBot.asset,
      action: action,
      type: action,
      price: 25146.30,
      qty: selectedBot.lotSize || 50,
      strategy: selectedBot.strategyDescription,
      quorum: `${evalResult.matchingVotes}/14 Approved (Pass Gate Met)`,
      consensusRate: `${evalResult.consensusPercentage}%`,
      executionMode: 'PAPER',
      netRoi: `${guardrail.expectedNetRoiPct}% Net ROI`,
      latency: `${(Math.random() * 1.2 + 0.8).toFixed(1)}ms IPC`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    toastEmitter.emitTradeExecution(toastData);
    setStatusMessage({
      type: 'success',
      text: `Order Approved: ${action} ${selectedBot.asset} with ${evalResult.matchingVotes}/14 Quorum. Net ROI: +${guardrail.expectedNetRoiPct}% after statutory deductions.`
    });

    setTimeout(() => {
      setIsExecuting(false);
    }, 400);
  };

  const dominantDirection = quorumEvaluation.voteCounts.buy >= quorumEvaluation.voteCounts.sell ? 'BUY' : 'SELL';
  const dominantVotes = Math.max(quorumEvaluation.voteCounts.buy, quorumEvaluation.voteCounts.sell);
  const isQuorumPassed = dominantVotes >= 9;
  const isQuorumVeto = dominantVotes >= 7 && dominantVotes <= 8;

  return (
    <div className="space-y-4 animate-fadeIn select-none font-sans">
      {/* Header */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60 bg-[#05070b]">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Network className="w-5 h-5 text-cyan-400" />
            AI Decision Engine · 14-Bot Autonomous Quorum Matrix
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Strict 9/14 Quorum Consensus · 7-8 Veto Gate · Mandatory 1.5% Pre-Trade Net ROI Guardrail
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#0c1833] border border-cyan-500/30 text-xs font-mono">
            <Compass className="w-3.5 h-3.5 text-cyan-400 animate-spin [animation-duration:15s]" />
            <span className="text-slate-400">Sentiment Context:</span>
            <span className="text-cyan-300 font-bold">{activeSentiment.classification} ({activeSentiment.score})</span>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-400">Quorum Gate:</span>
            <span className={`font-bold ${isQuorumPassed ? 'text-emerald-400' : isQuorumVeto ? 'text-amber-400' : 'text-rose-400'}`}>
              {dominantVotes}/14 {dominantDirection} ({isQuorumPassed ? 'APPROVED' : isQuorumVeto ? 'QUORUM VETO' : 'INSUFFICIENT'})
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
              <span className="text-[10px] font-mono text-emerald-400">
                NLP ACTIVE · COMPOSITE SCORE {newsSentiment.compositeScore}
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

      {statusMessage && (
        <div className={`p-3 rounded-xl border text-xs font-mono flex items-center gap-2 ${statusMessage.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-rose-500/10 border-rose-500/40 text-rose-300'}`}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: 14 Nodes Grid Visualizer */}
        <div className="lg:col-span-8 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              14-Bot Consensus Topology (Select Bot to Inspect Strategy)
            </h3>
            <span className="text-[10px] font-mono text-slate-400">
              9/14 Quorum Required
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-7 gap-2.5">
            {quorumEvaluation.botVotes.map((b) => {
              const isSelected = selectedBotId === b.botId;
              const actionColor =
                b.vote === 'BUY'
                  ? 'border-emerald-500/60 text-emerald-400 bg-emerald-500/10'
                  : b.vote === 'SELL'
                  ? 'border-rose-500/60 text-rose-400 bg-rose-500/10'
                  : 'border-amber-500/60 text-amber-400 bg-amber-500/10';

              return (
                <div
                  key={b.botId}
                  onClick={() => setSelectedBotId(b.botId)}
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all text-center flex flex-col justify-between ${
                    isSelected
                      ? 'border-cyan-400 bg-[#10244c] shadow-[0_0_15px_rgba(0,240,255,0.4)] scale-105'
                      : 'border-[#1e3a6e]/60 bg-[#070e1e]/80 hover:border-cyan-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="w-4 h-4 rounded-full bg-[#162b55] text-[9px] font-mono font-bold text-cyan-300 flex items-center justify-center">
                      {b.botId}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${b.vote === 'BUY' ? 'bg-emerald-400 shadow-[0_0_6px_#10b981]' : b.vote === 'SELL' ? 'bg-rose-500 shadow-[0_0_6px_#f43f5e]' : 'bg-amber-400'}`}></span>
                  </div>
                  <div className="text-[11px] font-bold text-white truncate">{b.botName}</div>
                  <div className="text-[9px] text-slate-400 font-mono truncate">{b.asset}</div>
                  <div className="mt-1.5 pt-1 border-t border-[#1e3a6e]/40">
                    <span className={`text-[8.5px] font-black uppercase px-1 py-0.2 rounded border ${actionColor}`}>
                      {b.vote}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Central AI Processor Card with Real-time Multi-Indicator Confluence */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-[#071329] via-[#0d224d] to-[#071329] border border-cyan-500/50 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-400/40 shadow-[0_0_15px_rgba(0,240,255,0.4)]">
                <Cpu className="w-6 h-6 animate-spin" style={{ animationDuration: '8s' }} />
              </div>
              <div>
                <h4 className="text-sm font-black text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                  <span>CENTRAL QUORUM ARBITER</span>
                  <span className={`text-[9px] font-mono font-bold ${isQuorumPassed ? 'text-emerald-400' : isQuorumVeto ? 'text-amber-400' : 'text-rose-400'}`}>
                    {isQuorumPassed ? 'Quorum Met (>=9)' : isQuorumVeto ? 'Quorum Veto (7-8)' : 'Consensus Incomplete'}
                  </span>
                </h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  Multi-indicator confluence score: <span className="font-mono text-cyan-400 font-bold">{quorumEvaluation.confluence?.confluenceScore}%</span> across EMA stack, SuperTrend, MACD, RSI, and VWAP.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right font-mono">
                <div className="text-[10px] text-slate-400">Consensus IPC:</div>
                <div className="text-xs font-bold text-emerald-400">1.4 ms</div>
              </div>
              <button
                type="button"
                onClick={() => handleExecuteConsensusTrade('BUY')}
                disabled={isExecuting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 text-cyan-200 text-xs font-bold transition-all shadow-[0_0_12px_rgba(0,240,255,0.3)] cursor-pointer font-mono"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Simulate 9/14 Fill</span>
              </button>
            </div>
          </div>

          {/* Technical Indicator Confluence Detail Matrix */}
          <div className="p-3.5 rounded-xl bg-[#060c1c] border border-[#1e3a6e]/50 space-y-2 font-mono text-xs">
            <div className="flex items-center justify-between text-slate-400 uppercase tracking-wider text-[10px]">
              <span>Quantitative Confluence Indicators (Live Math)</span>
              <span className="text-cyan-400 font-bold">Confidence: {quorumEvaluation.confluence?.confidence}%</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="p-2 rounded-lg bg-[#0b162c] border border-[#16294a]">
                <div className="text-slate-400 text-[10px]">EMA 9 / 21 / 50 Stack</div>
                <div className="text-white font-bold mt-0.5">
                  {quorumEvaluation.confluence?.indicators?.ema?.ema9 > quorumEvaluation.confluence?.indicators?.ema?.ema21 ? 'Golden Stack' : 'Death Stack'}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[#0b162c] border border-[#16294a]">
                <div className="text-slate-400 text-[10px]">RSI (14) Dynamic</div>
                <div className="text-white font-bold mt-0.5">
                  {quorumEvaluation.confluence?.indicators?.rsi?.rsi} ({quorumEvaluation.confluence?.indicators?.rsi?.state})
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[#0b162c] border border-[#16294a]">
                <div className="text-slate-400 text-[10px]">SuperTrend (10, 3)</div>
                <div className="text-emerald-400 font-bold mt-0.5">
                  {quorumEvaluation.confluence?.indicators?.supertrend?.trend}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[#0b162c] border border-[#16294a]">
                <div className="text-slate-400 text-[10px]">VWAP Anchor</div>
                <div className="text-cyan-300 font-bold mt-0.5">
                  ₹{quorumEvaluation.confluence?.indicators?.vwap?.vwap}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Selected Node Consensus Profile & Statutory Pre-Trade Tax Audit */}
        <div className="lg:col-span-4 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between border-b border-[#1e3a6e]/40 pb-2.5 mb-3">
              <div>
                <span className="text-[10px] text-cyan-400 font-mono uppercase font-bold">Node Profile</span>
                <h3 className="text-sm font-bold text-white">Bot #{selectedBot.id}: {selectedBot.name}</h3>
              </div>
              <button
                onClick={() => onOpenDetails && onOpenDetails(selectedBot)}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold underline cursor-pointer"
              >
                Inspect
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-2.5 rounded-lg bg-[#060c1c] border border-[#1e3a6e]/40">
                <div className="text-slate-400 text-[10px] uppercase">Asset & Strategy</div>
                <div className="text-white font-bold text-sm mt-0.5">{selectedBot.asset}</div>
                <div className="text-slate-300 text-[11px] font-sans mt-1 leading-tight">{selectedBot.strategyDescription}</div>
              </div>

              {/* 14-Bot Vote Tally */}
              <div className="p-2.5 rounded-lg bg-[#060c1c] border border-[#1e3a6e]/40 space-y-1">
                <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase">
                  <span>Vote Tally (14 Bots)</span>
                  <span className={isQuorumPassed ? 'text-emerald-400 font-bold' : isQuorumVeto ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                    {dominantVotes}/14 Consensus
                  </span>
                </div>
                <div className="flex items-center justify-between font-bold">
                  <span className="text-emerald-400">BUY: {quorumEvaluation.voteCounts.buy}</span>
                  <span className="text-rose-400">SELL: {quorumEvaluation.voteCounts.sell}</span>
                  <span className="text-amber-400">HOLD: {quorumEvaluation.voteCounts.hold}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Threshold: 9 required to pass · 7-8 triggers Quorum Veto
                </div>
              </div>

              {/* Statutory Tax & Brokerage Net-Profit Audit */}
              <div className="p-2.5 rounded-lg bg-[#060c1c] border border-cyan-500/30 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-cyan-300 font-bold uppercase tracking-wider flex items-center gap-1">
                    <Receipt className="w-3.5 h-3.5 text-cyan-400" />
                    Statutory Tax & ROI Audit
                  </span>
                  <span className={`text-[10px] font-bold ${guardrailAudit.isApproved ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {guardrailAudit.expectedNetRoiPct}% Net ROI
                  </span>
                </div>

                <div className="text-[10.5px] text-slate-300 space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Roundtrip Charges:</span>
                    <span className="text-slate-200">₹{guardrailAudit.roundtripCharges.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Expected Net Gain:</span>
                    <span className="text-emerald-400 font-bold">₹{guardrailAudit.expectedNetProfit.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Institutional Hurdle:</span>
                    <span className="text-cyan-300">&ge; 1.50% Net ROI</span>
                  </div>
                </div>
              </div>

              {/* Instant Execution Buttons */}
              <div className="p-2.5 rounded-lg bg-[#09152b] border border-cyan-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-cyan-300 font-bold uppercase tracking-wider flex items-center gap-1">
                    <Zap className="w-3 h-3 text-cyan-400" />
                    Quorum Order Trigger
                  </span>
                  <span className="text-[9px] text-slate-400">Enforces 9/14 + Tax Guard</span>
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

          <div className="pt-2 border-t border-[#1e3a6e]/40">
            <div className="flex justify-between items-center text-xs font-mono text-slate-400">
              <span>Execution Gate:</span>
              <span className={`font-bold flex items-center gap-1 ${isQuorumPassed ? 'text-emerald-400' : 'text-amber-400'}`}>
                <CheckCircle2 className="w-3.5 h-3.5" /> {isQuorumPassed ? '9/14 Quorum Armed' : 'Quorum Pending'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
