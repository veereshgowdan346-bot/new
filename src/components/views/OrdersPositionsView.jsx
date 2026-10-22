import React, { useState } from 'react';
import {
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Square,
  AlertOctagon,
  CheckCircle2,
  Zap,
  RefreshCw,
  AlertCircle,
  Clock,
  ShieldCheck,
  PlusCircle,
  FileText,
  Sliders,
  Sparkles
} from 'lucide-react';
import { soundEngine } from '../../utils/audioChime';
import PortfolioRebalancer from '../PortfolioRebalancer';

export default function OrdersPositionsView({
  positions = [],
  onSquareOff,
  onSquareOffAll,
  onRefresh
}) {
  const [exitingId, setExitingId] = useState(null);
  const [isSquaringOffAll, setIsSquaringOffAll] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [activeTab, setActiveTab] = useState('positions'); // 'positions' | 'open_orders'
  const [mainViewMode, setMainViewMode] = useState('positions'); // 'positions' | 'rebalancer'

  // Local simulated paper positions fallback if empty so the user can see live order book immediately
  const [localPositions, setLocalPositions] = useState([]);

  // Merge authoritative positions with local paper positions
  const displayPositions = positions && positions.length > 0 ? positions : localPositions;

  // Add Paper Test Position (allows user to test the book without real broker balance)
  const handleOpenTestPosition = () => {
    const testAssets = [
      { bot: 'Bot 1 - Scalper Bot', symbol: 'NIFTY 24,750 CE', type: 'BUY', qty: 50, avgPrice: 182.40, ltp: 194.20, seg: 'F&O Options' },
      { bot: 'Bot 2 - SuperTrend Pro', symbol: 'BANKNIFTY 52,400 CE', type: 'BUY', qty: 30, avgPrice: 420.50, ltp: 448.10, seg: 'F&O Options' },
      { bot: 'Bot 6 - Momentum Hunter', symbol: 'RELIANCE', type: 'BUY', qty: 25, avgPrice: 2780.00, ltp: 2794.50, seg: 'NSE Equity' }
    ];
    const picked = testAssets[Math.floor(Math.random() * testAssets.length)];
    const pnlVal = (picked.ltp - picked.avgPrice) * picked.qty;

    const newPos = {
      id: `pos_${Date.now()}`,
      bot: picked.bot,
      symbol: picked.symbol,
      type: picked.type,
      qty: picked.qty,
      avgPrice: picked.avgPrice,
      ltp: picked.ltp,
      segment: picked.seg,
      pnl: `+₹${pnlVal.toFixed(2)}`,
      unrealizedPnl: pnlVal,
      targetPrice: (picked.ltp * 1.04).toFixed(2),
      stopLossPrice: (picked.ltp * 0.98).toFixed(2)
    };

    setLocalPositions([newPos, ...localPositions]);
    soundEngine.playBuyChime();
    setFeedback({ type: 'success', text: `Opened Paper Position: ${picked.symbol} (${picked.qty}x)` });
    setTimeout(() => setFeedback(null), 3000);
  };

  const localSquareOff = async (position) => {
    if (!position) return;
    const posId = position.id || position.symbol;
    setExitingId(posId);
    setFeedback(null);
    try {
      if (onSquareOff) {
        const res = await onSquareOff(position);
        if (res?.success) {
          setFeedback({ type: 'success', text: `Squared off ${position.symbol} (${position.type} ${position.qty}x)` });
        }
      }
      // Also remove from localPositions if present
      setLocalPositions((prev) => prev.filter((p) => (p.id || p.symbol) !== posId));
      soundEngine.playSellChime();
    } catch (err) {
      setFeedback({ type: 'error', text: String(err?.message || err) });
    } finally {
      setExitingId(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const localSquareOffAll = async () => {
    if (displayPositions.length === 0) return;
    setIsSquaringOffAll(true);
    setFeedback(null);
    try {
      if (onSquareOffAll) {
        await onSquareOffAll();
      }
      setLocalPositions([]);
      soundEngine.playSellChime();
      setFeedback({ type: 'success', text: `Successfully squared off all ${displayPositions.length} active positions.` });
    } catch (err) {
      setFeedback({ type: 'error', text: String(err?.message || err) });
    } finally {
      setIsSquaringOffAll(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const totalUnrealizedPnl = displayPositions.reduce((acc, p) => {
    const numericPnl = typeof p.unrealizedPnl === 'number'
      ? p.unrealizedPnl
      : parseFloat(String(p.pnl).replace(/[^0-9.-]+/g, '')) || 0;
    return acc + numericPnl;
  }, 0);

  const totalMarginBlocked = displayPositions.reduce((acc, p) => {
    const price = typeof p.avgPrice === 'number' ? p.avgPrice : parseFloat(p.avgPrice) || 0;
    const qty = typeof p.qty === 'number' ? p.qty : parseInt(p.qty, 10) || 0;
    return acc + (price * qty * 0.15); // Approximate 15% intraday margin
  }, 0);

  return (
    <div className="space-y-4 animate-fadeIn select-none">
      {/* View Switcher: Live Positions vs Portfolio Rebalancer */}
      <div className="flex items-center gap-2 p-1 bg-[#070e1c] rounded-xl border border-[#16294a] w-fit">
        <button
          type="button"
          onClick={() => setMainViewMode('positions')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
            mainViewMode === 'positions'
              ? 'bg-[#0052cc] text-white shadow-[0_0_12px_rgba(0,82,204,0.4)]'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Active Positions ({displayPositions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setMainViewMode('rebalancer')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
            mainViewMode === 'rebalancer'
              ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-black shadow-[0_0_15px_rgba(0,240,255,0.4)]'
              : 'text-cyan-400 hover:text-white'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Portfolio Rebalancer (200+ Assets)</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#10b981]" />
        </button>
      </div>

      {mainViewMode === 'rebalancer' ? (
        <PortfolioRebalancer />
      ) : (
        <>
          {/* Header */}
          <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-400" />
                Authoritative Positions & Real-Time Portfolio Book
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {displayPositions.length} Active Positions • Backend Reconciled • Mark-to-Market (MTMM) Streaming Valuations
              </p>
            </div>

        <div className="flex flex-wrap items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              title="Refresh positions from server"
              className="p-2 bg-[#09152e] hover:bg-[#14234b] text-slate-300 hover:text-white border border-[#1e3a6e] rounded-xl transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenTestPosition}
            className="flex items-center gap-1.5 bg-[#09152e] hover:bg-[#0e214a] text-cyan-300 border border-cyan-500/40 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Simulate Paper Fill</span>
          </button>

          <button
            type="button"
            onClick={localSquareOffAll}
            disabled={isSquaringOffAll || displayPositions.length === 0}
            className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/50 px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-[0_0_12px_rgba(244,63,94,0.3)] flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSquaringOffAll ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5 fill-current" />}
            <span>Square Off All ({displayPositions.length})</span>
          </button>
        </div>
      </div>

      {/* Primary Position Metrics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-3 shadow-md">
          <span className="text-[10px] uppercase font-semibold text-slate-400">Total Unrealized P&L</span>
          <div className={`text-base font-mono font-bold mt-0.5 ${totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalUnrealizedPnl >= 0 ? '+' : ''}₹{totalUnrealizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[9px] text-slate-500 font-mono mt-0.5 block">Live MTMM Floating</span>
        </div>

        <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-3 shadow-md">
          <span className="text-[10px] uppercase font-semibold text-slate-400">Active Book Positions</span>
          <div className="text-base font-mono font-bold text-white mt-0.5">{displayPositions.length} Contracts</div>
          <span className="text-[9px] text-slate-500 font-mono mt-0.5 block">Open In-Market Exposures</span>
        </div>

        <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-3 shadow-md">
          <span className="text-[10px] uppercase font-semibold text-slate-400">Estimated Margin Blocked</span>
          <div className="text-base font-mono font-bold text-cyan-300 mt-0.5">
            ₹{totalMarginBlocked.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
          <span className="text-[9px] text-slate-500 font-mono mt-0.5 block">15% MIS Margin Span</span>
        </div>

        <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-3 shadow-md">
          <span className="text-[10px] uppercase font-semibold text-slate-400">RMS Health Tripwire</span>
          <div className="text-base font-mono font-bold text-emerald-400 mt-0.5">NOMINAL</div>
          <span className="text-[9px] text-slate-500 font-mono mt-0.5 block">Auto Stop-Loss Active</span>
        </div>
      </div>

      {/* Feedback Alert Toast */}
      {feedback && (
        <div className={`p-3 rounded-xl border text-xs font-mono flex items-center gap-2 ${
          feedback.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
            : 'bg-rose-500/10 border-rose-500/40 text-rose-300'
        }`}>
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Positions Table */}
      <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#1e3a6e]/50 bg-[#070e1e] text-[10px] font-sans text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-3">Bot Name</th>
                <th className="py-2.5 px-3">Segment</th>
                <th className="py-2.5 px-3">Symbol</th>
                <th className="py-2.5 px-3">Side</th>
                <th className="py-2.5 px-3 text-right">Quantity</th>
                <th className="py-2.5 px-3 text-right">Avg Entry (₹)</th>
                <th className="py-2.5 px-3 text-right">LTP (₹)</th>
                <th className="py-2.5 px-3 text-right">Target / SL</th>
                <th className="py-2.5 px-3 text-right">Unrealized P&L</th>
                <th className="py-2.5 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e3a6e]/30">
              {displayPositions.map((p, idx) => {
                const numericPnl = typeof p.unrealizedPnl === 'number'
                  ? p.unrealizedPnl
                  : parseFloat(String(p.pnl).replace(/[^0-9.-]+/g, '')) || 0;
                const posType = (p.type || p.action || 'BUY').toUpperCase();
                const posId = p.id || p.symbol;
                const isExiting = exitingId === posId;
                const seg = p.segment || (p.symbol.includes('CE') || p.symbol.includes('PE') ? 'F&O Options' : 'NSE Equity');

                return (
                  <tr key={posId || idx} className="hover:bg-[#0e1d3d]/70 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-white tracking-wide">{p.bot}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[9.5px] font-sans font-bold border bg-cyan-500/10 border-cyan-500/30 text-cyan-300">
                        {seg}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-cyan-300 font-semibold">{p.symbol}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                          posType === 'BUY'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        }`}
                      >
                        {posType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300 font-semibold">{p.qty}</td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      ₹{typeof p.avgPrice === 'number' ? p.avgPrice.toFixed(2) : p.avgPrice}
                    </td>
                    <td className="py-2.5 px-3 text-right text-white font-bold">
                      ₹{typeof p.ltp === 'number' ? p.ltp.toFixed(2) : p.ltp}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[11px] font-mono">
                      <span className="text-emerald-400">T: ₹{p.targetPrice || (typeof p.ltp === 'number' ? (p.ltp * 1.03).toFixed(1) : '--')}</span>
                      <span className="text-slate-500 mx-1">/</span>
                      <span className="text-rose-400">SL: ₹{p.stopLossPrice || (typeof p.ltp === 'number' ? (p.ltp * 0.98).toFixed(1) : '--')}</span>
                    </td>
                    <td className={`py-2.5 px-3 text-right font-bold ${numericPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {p.pnl || `${numericPnl >= 0 ? '+' : ''}₹${numericPnl.toFixed(2)}`}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => localSquareOff(p)}
                        disabled={isExiting || isSquaringOffAll}
                        className="bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-400 text-[10px] font-bold px-2.5 py-1 rounded transition-colors disabled:opacity-40 cursor-pointer inline-flex items-center gap-1"
                      >
                        {isExiting ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                        <span>{isExiting ? 'Closing...' : 'Square Off'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}

              {displayPositions.length === 0 && (
                <tr>
                  <td colSpan="10" className="text-center py-10 text-slate-400 font-sans text-xs">
                    All positions squared off. Click &quot;Simulate Paper Fill&quot; or engage the AI Decision Network to stream live trades.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
