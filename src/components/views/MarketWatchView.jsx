import React, { useState, useMemo, useEffect } from 'react';
import { apiFetch } from '../../utils/api';
import {
  LineChart,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Star,
  Compass,
  Sliders,
  ShieldCheck,
  Zap,
  Activity,
  Layers,
  Sparkles,
  Flame,
  LayoutGrid,
  Table as TableIcon
} from 'lucide-react';
import MarketSentimentWidget from '../MarketSentimentWidget';
import MarketHeatmap from '../MarketHeatmap';
import { MULTI_ASSET_UNIVERSE } from '../../data/multiAssetUniverse';
import { calculateAdaptivePositionSizing, validateNetProfitGuardrail } from '../../utils/taxCalculator';
import { toastEmitter } from '../../utils/toastEmitter';

export default function MarketWatchView({
  tickers = [],
  bots = [],
  onNavigateToHeatmap
}) {
  const [viewMode, setViewMode] = useState('split'); // 'heatmap' | 'split' | 'table'
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [favorites, setFavorites] = useState(['NIFTY 50', 'BANK NIFTY', 'GOLD', 'RELIANCE']);
  const [showSentiment, setShowSentiment] = useState(true);
  const [selectedAssetForScaling, setSelectedAssetForScaling] = useState(MULTI_ASSET_UNIVERSE[0]);
  const [customCapitalInput, setCustomCapitalInput] = useState('6000');
  const [showScalingDrawer, setShowScalingDrawer] = useState(false);

  useEffect(() => {
    let isMounted = true;
    apiFetch('/api/watchlist').then((res) => {
      if (!isMounted) return;
      if (res && Array.isArray(res.favorites) && res.favorites.length > 0) {
        setFavorites(res.favorites);
      }
    }).catch(() => {});
    return () => { isMounted = false; };
  }, []);

  const toggleFav = (symbol) => {
    setFavorites((prev) => {
      const next = prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol];
      apiFetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorites: next })
      }).catch(() => {});
      return next;
    });
  };

  // Merge live tickers and bots into universe to preserve real-time sync
  const fullUniverse = useMemo(() => {
    const map = new Map();
    // 1. Add canonical multi-asset universe
    MULTI_ASSET_UNIVERSE.forEach((item) => {
      map.set(item.symbol, { ...item });
    });
    // 2. Overlay live ticker feeds if present
    (tickers || []).forEach((t) => {
      if (map.has(t.symbol)) {
        const cur = map.get(t.symbol);
        map.set(t.symbol, { ...cur, price: t.price, change: t.change, changePercent: t.changePercent });
      } else {
        map.set(t.symbol, {
          symbol: t.symbol,
          name: t.symbol,
          category: 'Indices',
          segment: 'NSE Index',
          price: t.price,
          change: t.change,
          changePercent: t.changePercent,
          high: t.price * 1.008,
          low: t.price * 0.992,
          vol: '42.8M',
          lotSize: 50,
          exchange: 'NSE'
        });
      }
    });
    return Array.from(map.values());
  }, [tickers]);

  // Filter by category and search query
  const filteredAssets = useMemo(() => {
    return fullUniverse.filter((item) => {
      const matchSearch =
        item.symbol.toLowerCase().includes(search.toLowerCase()) ||
        item.name.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;

      if (activeCategory === 'Favorites') return favorites.includes(item.symbol);
      if (activeCategory === 'All') return true;
      if (activeCategory === 'Equities') return item.category === 'Equities';
      if (activeCategory === 'Indices') return item.category === 'Indices';
      if (activeCategory === 'Commodities') return item.category === 'Commodities';
      if (activeCategory === 'Derivatives') return item.category === 'Derivatives';
      if (activeCategory === 'Currency') return item.category === 'Currency';
      if (activeCategory === 'Crypto') return item.category === 'Crypto';
      if (activeCategory === 'Macro') return item.category === 'Macro';
      return true;
    });
  }, [fullUniverse, search, activeCategory, favorites]);

  // Compute dynamic capital scaling on selected asset
  const capVal = parseFloat(customCapitalInput) || 6000;
  const adaptiveSizing = useMemo(() => {
    if (!selectedAssetForScaling) return null;
    return calculateAdaptivePositionSizing({
      capital: capVal,
      assetPrice: selectedAssetForScaling.price,
      lotSize: selectedAssetForScaling.lotSize || 1,
      segment: selectedAssetForScaling.segment || 'NSE Equity',
      maxRiskPct: 1.5
    });
  }, [selectedAssetForScaling, capVal]);

  const guardrailAudit = useMemo(() => {
    if (!selectedAssetForScaling || !adaptiveSizing) return null;
    return validateNetProfitGuardrail({
      entryPrice: selectedAssetForScaling.price,
      qty: adaptiveSizing.finalQty,
      action: 'BUY',
      segment: selectedAssetForScaling.segment || 'NSE Equity',
      safetyBufferPercent: 20
    });
  }, [selectedAssetForScaling, adaptiveSizing]);

  const handleQuickExecute = (item) => {
    setSelectedAssetForScaling(item);
    setShowScalingDrawer(true);
    toastEmitter.emitToast({
      title: `Selected ${item.symbol}`,
      message: `Scaled lot sizing loaded for ₹${capVal.toLocaleString('en-IN')}: ${item.name} (${item.segment})`,
      type: 'info'
    });
  };

  const categories = [
    { id: 'All', label: `All Universe (${fullUniverse.length})` },
    { id: 'Favorites', label: `★ Watchlist (${favorites.length})` },
    { id: 'Equities', label: 'Equities (70)' },
    { id: 'Indices', label: 'Indices (12)' },
    { id: 'Commodities', label: 'Commodities (25)' },
    { id: 'Derivatives', label: 'F&O Options (26)' },
    { id: 'Currency', label: 'Currency (13)' },
    { id: 'Crypto', label: 'Crypto & Macro (18)' }
  ];

  return (
    <div className="space-y-4 animate-fadeIn select-none">
      {/* Header */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <LineChart className="w-5 h-5 text-cyan-400" />
            Market Watch & 200+ Multi-Asset Depth Scanner
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Real-time quotes, dynamic capital sizing, and risk boundaries across 200+ active markets
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Switcher */}
          <div className="flex bg-[#070e1e] p-0.5 rounded-lg border border-[#1e3a6e] text-xs font-mono">
            <button
              type="button"
              onClick={() => setViewMode('heatmap')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all cursor-pointer ${
                viewMode === 'heatmap'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-cyan-400" />
              <span>Heatmap</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all cursor-pointer ${
                viewMode === 'split'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
              <span>Split View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5 text-cyan-400" />
              <span>Table</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowScalingDrawer(!showScalingDrawer)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
              showScalingDrawer
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.3)]'
                : 'bg-[#09152e] hover:bg-[#0e214a] border-[#1e3a6e] text-slate-300'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>Capital Sizer (₹{capVal.toLocaleString('en-IN')})</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSentiment(!showSentiment)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#09152e] hover:bg-[#0e214a] border border-[#1e3a6e] text-xs font-semibold text-cyan-300 transition-colors cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            <span>{showSentiment ? 'Hide Sentiment' : 'Market Sentiment'}</span>
          </button>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search 200+ symbols..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[#09152e] border border-[#1e3a6e] text-xs text-slate-200 pl-8 pr-3 py-1.5 rounded-lg focus:outline-none focus:border-cyan-400 w-52"
            />
          </div>
        </div>
      </div>

      {/* Real-Time Fear & Greed Market Sentiment Banner */}
      {showSentiment && <MarketSentimentWidget />}

      {/* Market Heatmap Treemap Component (Rendered in 'heatmap' or 'split' mode) */}
      {(viewMode === 'heatmap' || viewMode === 'split') && (
        <MarketHeatmap
          tickers={tickers}
          onSelectAsset={(asset) => handleQuickExecute(asset)}
        />
      )}

      {/* Dynamic Capital Scaling Interactive Tool */}
      {showScalingDrawer && selectedAssetForScaling && adaptiveSizing && guardrailAudit && (
        <div className="bg-[#081226]/95 border border-cyan-500/40 rounded-xl p-4 shadow-[0_0_20px_rgba(0,240,255,0.15)] animate-fadeIn space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1e3a6e]/50 pb-2.5">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-black uppercase text-cyan-300 tracking-wider">
                Adaptive Capital Scaling & Net-Profit Guardrail Calculator
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-mono">
                {adaptiveSizing.capitalTier}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-sans">Active Target Asset:</span>
              <span className="text-xs font-bold text-white font-mono bg-[#060c1c] px-2.5 py-1 rounded border border-[#1e3a6e]">
                {selectedAssetForScaling.symbol} (₹{selectedAssetForScaling.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })})
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Input Capital */}
            <div className="bg-[#060c1c] p-3 rounded-lg border border-[#1e3a6e]/60 space-y-1">
              <label className="text-[10px] font-sans font-semibold text-slate-400 uppercase">
                Allocated Capital (₹)
              </label>
              <div className="flex gap-1.5 items-center">
                <input
                  type="number"
                  min="100"
                  step="500"
                  value={customCapitalInput}
                  onChange={(e) => setCustomCapitalInput(e.target.value)}
                  className="w-full bg-[#09152e] border border-[#1e3a6e] text-cyan-300 font-bold font-mono text-sm px-2.5 py-1.5 rounded focus:border-cyan-400 focus:outline-none"
                />
              </div>
              <div className="flex gap-1 pt-1 text-[9px] font-mono">
                {['500', '6000', '25000', '100000'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCustomCapitalInput(preset)}
                    className="px-1.5 py-0.5 rounded bg-[#10244c] hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-[#1e3a6e]/50 cursor-pointer"
                  >
                    ₹{Number(preset).toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
            </div>

            {/* Scaled Quantity & Lots */}
            <div className="bg-[#060c1c] p-3 rounded-lg border border-[#1e3a6e]/60 space-y-1">
              <div className="text-[10px] font-sans font-semibold text-slate-400 uppercase">
                Scaled Position Size
              </div>
              <div className="text-sm font-bold text-white font-mono flex items-center justify-between">
                <span>{adaptiveSizing.finalQty} Units</span>
                <span className="text-cyan-400 text-xs font-normal">({adaptiveSizing.affordableLots} Lots)</span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono pt-1 flex justify-between">
                <span>Margin Needed:</span>
                <span className="text-slate-200 font-bold">₹{adaptiveSizing.totalMarginRequired.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* Risk Boundary (1.5%) */}
            <div className="bg-[#060c1c] p-3 rounded-lg border border-[#1e3a6e]/60 space-y-1">
              <div className="text-[10px] font-sans font-semibold text-slate-400 uppercase">
                Max Risk Boundary (1.5%)
              </div>
              <div className="text-sm font-bold text-amber-400 font-mono">
                ₹{adaptiveSizing.riskBudget.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400 font-mono pt-1 flex justify-between">
                <span>Max Stop Loss Drawdown:</span>
                <span className="text-rose-400 font-bold">₹{adaptiveSizing.maxPotentialLoss.toFixed(2)}</span>
              </div>
            </div>

            {/* Net-Profit Guardrail Invariant */}
            <div className={`p-3 rounded-lg border space-y-1 ${
              guardrailAudit.isApproved
                ? 'bg-emerald-950/20 border-emerald-500/40'
                : 'bg-rose-950/20 border-rose-500/40'
            }`}>
              <div className="text-[10px] font-sans font-semibold uppercase flex items-center justify-between">
                <span className={guardrailAudit.isApproved ? 'text-emerald-400' : 'text-rose-400'}>
                  {guardrailAudit.isApproved ? 'Guardrail Passed' : 'Net Deficit Abort'}
                </span>
                <ShieldCheck className={`w-3.5 h-3.5 ${guardrailAudit.isApproved ? 'text-emerald-400' : 'text-rose-400'}`} />
              </div>
              <div className="text-xs font-bold font-mono text-white flex justify-between">
                <span>Roundtrip Taxes:</span>
                <span className="text-amber-300">₹{guardrailAudit.roundtripCharges.toFixed(2)}</span>
              </div>
              <div className="text-[10px] font-mono text-slate-300 pt-0.5 flex justify-between">
                <span>Breakeven Delta:</span>
                <span className="text-cyan-300 font-bold">₹{guardrailAudit.breakevenDelta.toFixed(2)} ({guardrailAudit.breakevenPct}%)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Segment & Category Filter Tabs and 200+ Multi-Asset Depth Scanner Table */}
      {viewMode !== 'heatmap' && (
        <>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {categories.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-300 font-bold shadow-[0_0_10px_rgba(0,240,255,0.25)]'
                      : 'bg-[#070e1e] border border-[#1e3a6e]/50 text-slate-400 hover:text-white hover:bg-[#0c1833]'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto no-scrollbar max-h-[580px] overflow-y-auto">
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-[#070e1e] border-b border-[#1e3a6e]/60">
                  <tr className="text-[10px] font-sans text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Fav</th>
                    <th className="py-2.5 px-3">Symbol</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Exchange / Segment</th>
                    <th className="py-2.5 px-3 text-right">LTP (₹)</th>
                    <th className="py-2.5 px-3 text-right">Day Change</th>
                    <th className="py-2.5 px-3 text-right">Day High</th>
                    <th className="py-2.5 px-3 text-right">Day Low</th>
                    <th className="py-2.5 px-3 text-right">Volume</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e3a6e]/30">
                  {filteredAssets.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="py-8 text-center text-slate-500 font-sans">
                        No matching instruments found in the 200+ multi-asset universe.
                      </td>
                    </tr>
                  ) : (
                    filteredAssets.map((item) => {
                      const isUp = item.change >= 0;
                      const isFav = favorites.includes(item.symbol);
                      const isSelected = selectedAssetForScaling?.symbol === item.symbol;

                      return (
                        <tr
                          key={item.symbol}
                          onClick={() => setSelectedAssetForScaling(item)}
                          className={`hover:bg-[#0e1d3d]/70 transition-colors cursor-pointer ${
                            isSelected ? 'bg-cyan-500/10' : ''
                          }`}
                        >
                          <td className="py-2 px-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFav(item.symbol);
                              }}
                              className={`text-slate-500 hover:text-amber-400 transition-colors cursor-pointer ${
                                isFav ? 'text-amber-400' : ''
                              }`}
                            >
                              <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                            </button>
                          </td>
                          <td className="py-2 px-3 font-bold text-white tracking-wide">
                            <div>{item.symbol}</div>
                            <div className="text-[9.5px] text-slate-400 font-sans font-normal truncate max-w-[150px]">
                              {item.name}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-[10.5px]">
                            <span className="text-cyan-400/90 font-mono">{item.category}</span>
                          </td>
                          <td className="py-2 px-3 text-[10px] text-slate-400 font-sans">
                            <span className="px-1.5 py-0.5 rounded bg-[#09152e] border border-[#1e3a6e]/50 font-mono">
                              {item.exchange} • {item.segment}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-slate-100 tabular-nums">
                            ₹{item.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className={`py-2 px-3 text-right font-semibold tabular-nums ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isUp ? '+' : ''}{item.change.toFixed(2)} ({isUp ? '+' : ''}{item.changePercent.toFixed(2)}%)
                          </td>
                          <td className="py-2 px-3 text-right text-slate-300 tabular-nums">
                            ₹{item.high.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-300 tabular-nums">
                            ₹{item.low.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-400 tabular-nums">{item.vol}</td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuickExecute(item);
                              }}
                              className="bg-cyan-500/15 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold px-2.5 py-1 rounded transition-all cursor-pointer flex items-center gap-1 mx-auto"
                            >
                              <Zap className="w-3 h-3 text-cyan-400" />
                              <span>Scale</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
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
