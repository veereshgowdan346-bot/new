import React, { useState } from 'react';
import {
  X,
  Play,
  Pause,
  Zap,
  TrendingUp,
  Shield,
  Target,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Cpu,
  Sparkles,
  Info
} from 'lucide-react';

export default function BotDetailsModal({
  bot,
  onClose,
  onToggleBotStatus,
  onManualTrigger,
  onOpenSkills
}) {
  const [activeTab, setActiveTab] = useState('strategy');
  const [lotMultiplier, setLotMultiplier] = useState(1);
  const [toastMsg, setToastMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [triggerResult, setTriggerResult] = useState(null);

  if (!bot) return null;

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  };

  const handleTrigger = async (action) => {
    if (isSubmitting || !onManualTrigger) return;
    setIsSubmitting(true);
    setTriggerResult(null);
    const qty = (bot.lotSize || 1) * lotMultiplier;
    try {
      const res = await onManualTrigger(bot, action, qty);
      if (res && res.success) {
        const msg = res.message || `Order confirmed: ${qty}x ${bot.asset}`;
        setTriggerResult({ type: 'success', message: msg });
        showToast(msg);
      } else {
        const errMsg = (res && res.error) || 'Order placement rejected by risk gates';
        setTriggerResult({ type: 'error', message: errMsg });
        showToast(`Rejected: ${errMsg}`);
      }
    } catch (err) {
      const errMsg = err.message || 'Execution failed';
      setTriggerResult({ type: 'error', message: errMsg });
      showToast(`Error: ${errMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPositive = bot.pnlToday >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn select-none">
      <div className="relative w-full max-w-2xl bg-[#091329] border border-cyan-500/40 rounded-2xl shadow-[0_0_30px_rgba(0,240,255,0.25)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Toast Notification */}
        {toastMsg && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-cyan-500 text-slate-950 px-4 py-1.5 rounded-full text-xs font-bold shadow-lg animate-bounce">
            {toastMsg}
          </div>
        )}

        {/* Modal Header */}
        <div className="p-4 border-b border-[#1e3a6e]/50 flex items-center justify-between bg-[#060c1c]">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#162b55] text-cyan-300 border border-cyan-400/50 font-mono font-bold text-sm flex items-center justify-center">
              {bot.id}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">{bot.name}</h2>
                <span
                  className={`text-[9px] font-bold px-2 py-0.5 rounded tracking-wide border uppercase ${
                    bot.status === 'RUNNING'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-700/30 text-slate-400 border-slate-600/30'
                  }`}
                >
                  {bot.status}
                </span>
                <span className="text-[9.5px] font-mono font-bold text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                  Allocated: ₹{(Number(bot.allocatedCapital) || 0).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                <span className="text-cyan-400">{bot.asset}</span>
                {bot.assetSymbol && <span>({bot.assetSymbol})</span>}
                <span>• {bot.assetCategory}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenSkills && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSkills(bot.id);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition-all cursor-pointer shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Upgrade Skills</span>
              </button>
            )}
            <button
              onClick={() => onToggleBotStatus(bot.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                bot.status === 'RUNNING'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
              }`}
            >
              {bot.status === 'RUNNING' ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause Bot</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Resume Bot</span>
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[#0b1325] border border-[#1e3a6e] text-slate-400 hover:text-white hover:border-cyan-400 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Subnav Tabs */}
        <div className="flex border-b border-[#1e3a6e]/40 px-4 bg-[#070e20] text-xs font-semibold text-slate-400">
          <button
            onClick={() => setActiveTab('strategy')}
            className={`py-2.5 px-3 border-b-2 transition-colors ${
              activeTab === 'strategy'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Strategy & Rules
          </button>
          <button
            onClick={() => setActiveTab('peer-votes')}
            className={`py-2.5 px-3 border-b-2 transition-colors ${
              activeTab === 'peer-votes'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Peer Bot Consensus (13 Votes)
          </button>
          <button
            onClick={() => setActiveTab('manual-trigger')}
            className={`py-2.5 px-3 border-b-2 transition-colors ${
              activeTab === 'manual-trigger'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Manual Overrides & Execution
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-4 gap-2 bg-[#060c1c] border border-[#1e3a6e]/50 rounded-xl p-3 text-center">
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Live Price</div>
              <div className="text-sm font-mono font-bold text-white mt-0.5">
                ₹{bot.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className={`text-[10px] font-mono ${bot.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {bot.change >= 0 ? '+' : ''}{bot.change.toFixed(2)} ({bot.changePercent.toFixed(2)}%)
              </div>
            </div>

            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Today's P&L</div>
              <div className={`text-sm font-mono font-bold mt-0.5 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPositive ? '+' : ''}₹{bot.pnlToday.toFixed(2)}
              </div>
              <div className="text-[10px] font-mono text-emerald-400">
                (+{bot.pnlPercent}%)
              </div>
            </div>

            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Win Rate</div>
              <div className="text-sm font-mono font-bold text-cyan-400 mt-0.5">
                {bot.winRate}%
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                {bot.trades} executed
              </div>
            </div>

            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Current Bias</div>
              <div className="mt-0.5">
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                  bot.action === 'BUY' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                  bot.action === 'SELL' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' :
                  'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                }`}>
                  {bot.action}
                </span>
              </div>
              <div className="text-[10px] font-mono text-slate-400 mt-1">
                {bot.decisions.buy}B / {bot.decisions.sell}S
              </div>
            </div>
          </div>

          {/* Tab 1: Strategy & Rules */}
          {activeTab === 'strategy' && (
            <div className="space-y-3">
              <div className="bg-[#060c1c] border border-[#1e3a6e]/50 rounded-xl p-3">
                <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  Algorithm Definition & Signal Engine
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  {bot.strategy}
                </p>
                <div className="mt-2 text-xs text-slate-400 bg-[#09152e] p-2 rounded-lg border border-[#1e3a6e]/40 font-mono">
                  <strong className="text-emerald-400">Consensus Note:</strong> {bot.consensusReason}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#060c1c] border border-[#1e3a6e]/50 rounded-xl p-3 space-y-2">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-rose-400" />
                    Risk Controls & Stop Loss
                  </span>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Hard Stop Loss:</span>
                    <span className="text-rose-400 font-bold">{bot.stopLoss}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Trailing Stop:</span>
                    <span className="text-slate-200">ATR 1.5x Multiplier</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Max Drawdown Limit:</span>
                    <span className="text-amber-400">₹1,500.00 / day</span>
                  </div>
                </div>

                <div className="bg-[#060c1c] border border-[#1e3a6e]/50 rounded-xl p-3 space-y-2">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-emerald-400" />
                    Target & Profit Taking
                  </span>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Primary Target:</span>
                    <span className="text-emerald-400 font-bold">{bot.target}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Partial Exit:</span>
                    <span className="text-slate-200">50% at 1:1.5 Risk-Reward</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Standard Lot Qty:</span>
                    <span className="text-cyan-400 font-bold">{bot.lotSize} units</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Peer Bot Consensus (13 Votes) */}
          {activeTab === 'peer-votes' && (
            <div className="space-y-3">
              <div className="bg-[#060c1c] border border-[#1e3a6e]/50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                    Incoming Signals from Other 13 Network Bots
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Weights updated real-time
                  </span>
                </div>

                <div className="space-y-1.5">
                  {bot.signalsReceived && bot.signalsReceived.map((sig, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded-lg bg-[#0a1630] border border-[#1e3a6e]/40 text-xs font-mono"
                    >
                      <span className="text-slate-200 font-semibold">{sig.bot}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 text-[11px]">Confidence: {sig.conf}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            sig.vote === 'BUY'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : sig.vote === 'SELL'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          }`}
                        >
                          {sig.vote}
                        </span>
                      </div>
                    </div>
                  ))}
                  {(!bot.signalsReceived || bot.signalsReceived.length === 0) && (
                    <p className="text-xs text-slate-400 italic py-2">
                      All other bots actively streaming neutral baseline signals.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Manual Overrides & Execution */}
          {activeTab === 'manual-trigger' && (
            <div className="space-y-3">
              <div className="bg-[#060c1c] border border-[#1e3a6e]/50 rounded-xl p-3 space-y-3">
                <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                  Manual Order Placement & Emergency Overrides
                </h3>

                {(bot.status !== 'RUNNING' || (Number(bot.allocatedCapital) || 0) <= 0) && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Execution Gated:</strong> Bot is currently <span className="font-bold text-white">{bot.status}</span> with <span className="font-bold text-white font-mono">₹{Number(bot.allocatedCapital) || 0}</span> capital. Allocate capital and activate the bot in Risk Management to permit live orders.
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <label className="text-xs text-slate-300 font-medium">Quantity Multiplier:</label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 5].map((multiplier) => (
                      <button
                        key={multiplier}
                        onClick={() => setLotMultiplier(multiplier)}
                        className={`px-3 py-1 rounded text-xs font-mono font-bold transition-colors ${
                          lotMultiplier === multiplier
                            ? 'bg-cyan-500 text-slate-950 shadow-[0_0_8px_#00f0ff]'
                            : 'bg-[#0f2042] text-slate-300 hover:bg-[#162f61]'
                        }`}
                      >
                        {multiplier}x ({bot.lotSize * multiplier})
                      </button>
                    ))}
                  </div>
                </div>

                {triggerResult && (
                  <div
                    className={`p-2.5 rounded-lg text-xs flex items-start gap-2 border transition-all ${
                      triggerResult.type === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    {triggerResult.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <span>
                      <strong>{triggerResult.type === 'success' ? 'Confirmed:' : 'Rejected:'}</strong>{' '}
                      {triggerResult.message}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleTrigger('BUY')}
                    className="py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/60 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    <span>{isSubmitting ? 'Transmitting...' : 'Instant Force BUY'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleTrigger('SELL')}
                    className="py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/60 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(244,63,94,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ArrowDownRight className="w-4 h-4" />
                    <span>{isSubmitting ? 'Transmitting...' : 'Instant Force SELL'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

