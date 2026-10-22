import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Flame,
  TrendingUp,
  TrendingDown,
  Layers,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  Sparkles,
  Info,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Search
} from 'lucide-react';
import { MULTI_ASSET_UNIVERSE } from '../data/multiAssetUniverse';

/**
 * Safe Volume string parser: converts strings like '62.4M', '840K', '1.4B' to numeric values.
 */
export function parseVolumeToNumber(volStr) {
  if (typeof volStr === 'number') return Math.max(1, volStr);
  if (!volStr || typeof volStr !== 'string') return 100000;
  const s = volStr.toUpperCase().trim();
  const num = parseFloat(s.replace(/[^0-9.]/g, '')) || 1;
  if (s.includes('T')) return num * 1_000_000_000_000;
  if (s.includes('B')) return num * 1_000_000_000;
  if (s.includes('M')) return num * 1_000_000;
  if (s.includes('K')) return num * 1_000;
  return num;
}

/**
 * Squarified Treemap Layout Generator (Bruls, Huizing, van Wijk algorithm)
 * Generates balanced aspect ratio rectangles for top items.
 */
function squarifyTreemap(items, x, y, width, height) {
  if (!items || items.length === 0 || width <= 0 || height <= 0) return [];
  if (items.length === 1) {
    return [{ ...items[0], x, y, w: width, h: height }];
  }

  const totalValue = items.reduce((sum, item) => sum + (item.weight || 1), 0);
  if (totalValue <= 0) return [];

  const results = [];
  const normalizedItems = items.map((item) => ({
    ...item,
    area: ((item.weight || 1) / totalValue) * (width * height)
  }));

  function layoutRow(row, sideLength, isHorizontal, originX, originY) {
    const rowArea = row.reduce((sum, item) => sum + item.area, 0);
    const rowThickness = rowArea / sideLength;
    let offset = 0;

    row.forEach((item) => {
      const itemLength = item.area / rowThickness;
      if (isHorizontal) {
        results.push({
          ...item,
          x: originX + offset,
          y: originY,
          w: itemLength,
          h: rowThickness
        });
      } else {
        results.push({
          ...item,
          x: originX,
          y: originY + offset,
          w: rowThickness,
          h: itemLength
        });
      }
      offset += itemLength;
    });

    return rowThickness;
  }

  function worstAspect(row, sideLength) {
    if (row.length === 0) return Infinity;
    const rowArea = row.reduce((sum, item) => sum + item.area, 0);
    if (rowArea <= 0 || sideLength <= 0) return Infinity;
    const sideSq = sideLength * sideLength;
    const rowAreaSq = rowArea * rowArea;

    let maxAspect = 0;
    for (let i = 0; i < row.length; i++) {
      const a = row[i].area;
      if (a <= 0) continue;
      const aspect = Math.max((sideSq * a) / rowAreaSq, rowAreaSq / (sideSq * a));
      if (aspect > maxAspect) maxAspect = aspect;
    }
    return maxAspect;
  }

  let remaining = [...normalizedItems];
  let curX = x;
  let curY = y;
  let curW = width;
  let curH = height;

  while (remaining.length > 0) {
    const isHorizontal = curW <= curH; // layout along shorter side
    const sideLength = isHorizontal ? curW : curH;

    let currentRow = [remaining[0]];
    let currentWorst = worstAspect(currentRow, sideLength);
    let nextIdx = 1;

    while (nextIdx < remaining.length) {
      const proposedRow = [...currentRow, remaining[nextIdx]];
      const proposedWorst = worstAspect(proposedRow, sideLength);
      if (proposedWorst <= currentWorst) {
        currentRow = proposedRow;
        currentWorst = proposedWorst;
        nextIdx++;
      } else {
        break;
      }
    }

    const thickness = layoutRow(currentRow, sideLength, isHorizontal, curX, curY);

    if (isHorizontal) {
      curY += thickness;
      curH = Math.max(0, curH - thickness);
    } else {
      curX += thickness;
      curW = Math.max(0, curW - thickness);
    }

    remaining = remaining.slice(currentRow.length);
  }

  return results;
}

export default function MarketHeatmap({
  tickers = [],
  onSelectAsset = null,
  embedded = false
}) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [performanceFilter, setPerformanceFilter] = useState('All'); // 'All' | 'Gainers' | 'Losers'
  const [hoveredAsset, setHoveredAsset] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [livePulseKey, setLivePulseKey] = useState(0);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 960, height: 520 });

  // Update container dimensions responsively
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const w = Math.max(340, rect.width);
        const h = isFullscreen ? Math.max(500, window.innerHeight - 180) : Math.min(620, Math.max(440, w * 0.52));
        setDimensions({ width: w, height: h });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    window.addEventListener('resize', updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [isFullscreen]);

  // Periodic pulse effect mimicking real-time market ticks
  useEffect(() => {
    const interval = setInterval(() => {
      setLivePulseKey((k) => (k + 1) % 1000);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Compute Top 50 Assets by Volume from Multi-Asset Universe + Live Tickers
  const top50Assets = useMemo(() => {
    const map = new Map();

    // Ingest all multi-asset instruments
    MULTI_ASSET_UNIVERSE.forEach((item) => {
      const volNum = parseVolumeToNumber(item.vol);
      map.set(item.symbol, {
        ...item,
        weight: volNum,
        rawVolume: volNum
      });
    });

    // Overlay live tickers if active
    (tickers || []).forEach((t) => {
      if (map.has(t.symbol)) {
        const cur = map.get(t.symbol);
        map.set(t.symbol, {
          ...cur,
          price: t.price,
          change: t.change,
          changePercent: t.changePercent
        });
      }
    });

    // Sort strictly by volume in descending order and select top 50
    const allSorted = Array.from(map.values()).sort((a, b) => b.weight - a.weight);
    return allSorted.slice(0, 50);
  }, [tickers]);

  // Filter top 50 by category and performance
  const filteredAssets = useMemo(() => {
    return top50Assets.filter((asset) => {
      // Category filter
      if (selectedCategory === 'Equities' && asset.category !== 'Equities') return false;
      if (selectedCategory === 'Indices' && asset.category !== 'Indices') return false;
      if (selectedCategory === 'Commodities' && asset.category !== 'Commodities') return false;
      if (selectedCategory === 'Derivatives' && asset.category !== 'Derivatives') return false;

      // Performance filter
      if (performanceFilter === 'Gainers' && asset.changePercent < 0) return false;
      if (performanceFilter === 'Losers' && asset.changePercent > 0) return false;

      return true;
    });
  }, [top50Assets, selectedCategory, performanceFilter]);

  // Generate squarified treemap cells
  const treemapCells = useMemo(() => {
    return squarifyTreemap(filteredAssets, 0, 0, dimensions.width, dimensions.height);
  }, [filteredAssets, dimensions.width, dimensions.height]);

  // Summary statistics for top 50
  const summaryStats = useMemo(() => {
    if (top50Assets.length === 0) return { gainers: 0, losers: 0, topGainer: null, avgChange: 0 };
    let g = 0;
    let l = 0;
    let sumChange = 0;
    let topG = top50Assets[0];

    top50Assets.forEach((a) => {
      if (a.changePercent >= 0) g++;
      else l++;
      sumChange += a.changePercent;
      if (a.changePercent > (topG?.changePercent ?? -Infinity)) {
        topG = a;
      }
    });

    return {
      gainers: g,
      losers: l,
      topGainer: topG,
      avgChange: Number((sumChange / top50Assets.length).toFixed(2))
    };
  }, [top50Assets]);

  // Dynamic cyan-to-emerald gradient styling based on price change percentage
  const getCellTheme = (changePct) => {
    const pct = Number(changePct) || 0;
    if (pct >= 2.0) {
      return {
        bg: 'bg-gradient-to-br from-[#00f0ff]/30 via-[#00f5a0]/35 to-[#10b981]/45',
        border: 'border-emerald-400/80 shadow-[inset_0_0_15px_rgba(16,185,129,0.3)]',
        textColor: 'text-emerald-200',
        badgeColor: 'bg-emerald-500/30 text-emerald-300 border-emerald-400/50',
        isStrong: true
      };
    }
    if (pct >= 0.8) {
      return {
        bg: 'bg-gradient-to-br from-[#083344]/90 via-[#0a453f]/90 to-[#064e3b]/90',
        border: 'border-cyan-400/60 shadow-[inset_0_0_10px_rgba(6,182,212,0.2)]',
        textColor: 'text-cyan-200',
        badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40',
        isStrong: false
      };
    }
    if (pct > 0.0) {
      return {
        bg: 'bg-gradient-to-br from-[#091f2c]/90 via-[#0a2e2d]/90 to-[#083329]/90',
        border: 'border-cyan-500/35',
        textColor: 'text-cyan-100',
        badgeColor: 'bg-cyan-900/40 text-cyan-300 border-cyan-600/30',
        isStrong: false
      };
    }
    if (pct === 0.0) {
      return {
        bg: 'bg-[#0a1324]/90',
        border: 'border-slate-700/50',
        textColor: 'text-slate-300',
        badgeColor: 'bg-slate-800 text-slate-400 border-slate-700',
        isStrong: false
      };
    }
    if (pct > -1.0) {
      return {
        bg: 'bg-gradient-to-br from-[#1a0f1b]/90 via-[#230d19]/90 to-[#2c0d1b]/90',
        border: 'border-rose-900/50',
        textColor: 'text-rose-200/90',
        badgeColor: 'bg-rose-950/40 text-rose-300 border-rose-800/40',
        isStrong: false
      };
    }
    // Severe drop < -1.0%
    return {
      bg: 'bg-gradient-to-br from-[#2a0e1e]/95 via-[#380e22]/95 to-[#450a22]/95',
      border: 'border-rose-600/70 shadow-[inset_0_0_12px_rgba(244,63,94,0.25)]',
      textColor: 'text-rose-200',
      badgeColor: 'bg-rose-500/25 text-rose-300 border-rose-500/50',
      isStrong: true
    };
  };

  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  return (
    <div
      className={`glass-panel rounded-2xl border border-[#16294a]/80 shadow-2xl overflow-hidden select-none animate-fadeIn ${
        isFullscreen ? 'fixed inset-4 z-50 bg-[#05070b]/98 p-5 backdrop-blur-2xl' : 'p-4'
      }`}
    >
      {/* 1. Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-[#16294a]/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/30 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.3)]">
            <Flame className="w-4 h-4 text-cyan-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-white uppercase tracking-wider">
                Market Heatmap • Top 50 by Volume
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-400/30 font-mono font-bold">
                Treemap
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Live proportional volume weight & cyan-to-emerald momentum gradient
            </p>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Segment Filter */}
          <div className="flex bg-[#070e1e] p-0.5 rounded-lg border border-[#16294a] text-[11px] font-mono">
            {['All', 'Equities', 'Indices', 'Commodities', 'Derivatives'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-cyan-500/25 text-cyan-200 font-bold border border-cyan-400/50 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Performance Filter */}
          <div className="flex bg-[#070e1e] p-0.5 rounded-lg border border-[#16294a] text-[11px] font-mono">
            {['All', 'Gainers', 'Losers'].map((pf) => (
              <button
                key={pf}
                type="button"
                onClick={() => setPerformanceFilter(pf)}
                className={`px-2 py-1 rounded transition-all cursor-pointer ${
                  performanceFilter === pf
                    ? pf === 'Gainers'
                      ? 'bg-emerald-500/25 text-emerald-300 font-bold border border-emerald-400/40'
                      : pf === 'Losers'
                      ? 'bg-rose-500/25 text-rose-300 font-bold border border-rose-400/40'
                      : 'bg-cyan-500/25 text-cyan-200 font-bold border border-cyan-400/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {pf}
              </button>
            ))}
          </div>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg bg-[#070e1e] border border-[#16294a] text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Expand Treemap Heatmap'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 2. Top Summary KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3 text-xs font-mono">
        <div className="bg-[#070e1e]/90 p-2.5 rounded-xl border border-[#16294a]/60 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 uppercase font-sans">Market Breadth:</span>
          <div className="flex items-center gap-1.5 font-bold">
            <span className="text-emerald-400">{summaryStats.gainers} Adv</span>
            <span className="text-slate-600">/</span>
            <span className="text-rose-400">{summaryStats.losers} Dec</span>
          </div>
        </div>

        <div className="bg-[#070e1e]/90 p-2.5 rounded-xl border border-[#16294a]/60 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 uppercase font-sans">Top Gainer:</span>
          <div className="flex items-center gap-1 text-emerald-300 font-bold truncate">
            <span className="truncate">{summaryStats.topGainer?.symbol || 'NIFTY'}</span>
            <span className="text-[10px] font-mono">(+{summaryStats.topGainer?.changePercent.toFixed(2)}%)</span>
          </div>
        </div>

        <div className="bg-[#070e1e]/90 p-2.5 rounded-xl border border-[#16294a]/60 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 uppercase font-sans">Mean 50-Asset Return:</span>
          <span className={`font-bold ${summaryStats.avgChange >= 0 ? 'text-cyan-300' : 'text-rose-400'}`}>
            {summaryStats.avgChange >= 0 ? '+' : ''}{summaryStats.avgChange}%
          </span>
        </div>

        <div className="bg-[#070e1e]/90 p-2.5 rounded-xl border border-[#16294a]/60 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 uppercase font-sans">Gradient Theme:</span>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#00f0ff]" />
            <span className="text-[10px] text-cyan-300 font-bold">Cyan</span>
            <span className="text-slate-500">→</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
            <span className="text-[10px] text-emerald-300 font-bold">Emerald</span>
          </div>
        </div>
      </div>

      {/* 3. Squarified Treemap Visualization Container */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredAsset(null)}
        className="relative bg-[#04060a] rounded-xl border border-[#16294a]/80 overflow-hidden shadow-inner cursor-crosshair"
        style={{ width: '100%', height: `${dimensions.height}px` }}
      >
        {treemapCells.map((cell) => {
          const theme = getCellTheme(cell.changePercent);
          const isUp = cell.changePercent >= 0;
          const isHovered = hoveredAsset?.symbol === cell.symbol;

          // Compute font sizing based on rectangle geometry
          const isCompact = cell.w < 65 || cell.h < 45;
          const isMicro = cell.w < 48 || cell.h < 34;

          return (
            <div
              key={cell.symbol}
              onClick={() => onSelectAsset && onSelectAsset(cell)}
              onMouseEnter={() => setHoveredAsset(cell)}
              className={`absolute p-1.5 flex flex-col justify-between transition-all duration-300 overflow-hidden border ${
                theme.bg
              } ${theme.border} ${
                isHovered
                  ? 'z-20 ring-2 ring-cyan-400 scale-[1.015] shadow-[0_0_20px_rgba(0,240,255,0.4)]'
                  : 'hover:brightness-110'
              }`}
              style={{
                left: `${cell.x}px`,
                top: `${cell.y}px`,
                width: `${cell.w}px`,
                height: `${cell.h}px`,
                boxSizing: 'border-box'
              }}
            >
              {/* Tile Header: Symbol & Tag */}
              <div className="flex items-start justify-between gap-1 overflow-hidden">
                <span
                  className={`font-mono font-bold tracking-tight truncate ${
                    isMicro ? 'text-[9px]' : isCompact ? 'text-[10px]' : 'text-xs'
                  } ${isHovered ? 'text-white' : theme.textColor}`}
                >
                  {cell.symbol}
                </span>

                {!isCompact && cell.w > 75 && (
                  <span className={`text-[8.5px] px-1 py-0.2 rounded font-mono font-semibold truncate ${theme.badgeColor}`}>
                    {isUp ? '+' : ''}{cell.changePercent.toFixed(1)}%
                  </span>
                )}
              </div>

              {/* Tile Middle: Price & Percentage */}
              {!isMicro && (
                <div className="flex flex-col my-auto overflow-hidden">
                  <span
                    className={`font-mono font-bold tabular-nums truncate ${
                      isCompact ? 'text-[9.5px]' : 'text-xs'
                    } ${isHovered ? 'text-cyan-200' : 'text-slate-100'}`}
                  >
                    ₹{cell.price > 1000 ? Math.round(cell.price).toLocaleString('en-IN') : cell.price.toFixed(2)}
                  </span>

                  {isCompact && (
                    <span className={`text-[9px] font-mono font-semibold ${isUp ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {isUp ? '+' : ''}{cell.changePercent.toFixed(2)}%
                    </span>
                  )}
                </div>
              )}

              {/* Tile Footer: Volume Bar Indicator */}
              {!isCompact && cell.h > 60 && (
                <div className="flex items-center justify-between text-[8.5px] font-mono text-slate-400 pt-0.5 border-t border-white/10">
                  <span className="truncate">{cell.category}</span>
                  <span className="text-cyan-300/80 font-bold truncate">Vol: {cell.vol}</span>
                </div>
              )}
            </div>
          );
        })}

        {/* 4. Interactive Floating Tooltip */}
        {hoveredAsset && (
          <div
            className="absolute z-30 pointer-events-none bg-[#070e1e]/98 border border-cyan-400/60 rounded-xl p-3 shadow-[0_0_25px_rgba(0,0,0,0.9)] backdrop-blur-xl font-mono text-xs text-slate-100 space-y-1.5 min-w-[210px] animate-fadeIn"
            style={{
              left: `${Math.min(dimensions.width - 230, Math.max(10, mousePos.x + 15))}px`,
              top: `${Math.min(dimensions.height - 180, Math.max(10, mousePos.y + 15))}px`
            }}
          >
            <div className="flex items-center justify-between border-b border-[#16294a]/80 pb-1.5">
              <div>
                <span className="font-bold text-sm text-white tracking-wide">{hoveredAsset.symbol}</span>
                <div className="text-[10px] text-slate-400 font-sans truncate max-w-[140px]">
                  {hoveredAsset.name}
                </div>
              </div>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                  hoveredAsset.changePercent >= 0
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}
              >
                {hoveredAsset.changePercent >= 0 ? '+' : ''}{hoveredAsset.changePercent.toFixed(2)}%
              </span>
            </div>

            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Current LTP:</span>
                <span className="font-bold text-white tabular-nums">
                  ₹{hoveredAsset.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Day Change:</span>
                <span className={`font-bold tabular-nums ${hoveredAsset.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {hoveredAsset.change >= 0 ? '+' : ''}₹{hoveredAsset.change.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Day High / Low:</span>
                <span className="font-sans text-slate-200 tabular-nums">
                  ₹{hoveredAsset.high.toFixed(0)} / ₹{hoveredAsset.low.toFixed(0)}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">24h Volume:</span>
                <span className="text-cyan-300 font-bold">{hoveredAsset.vol}</span>
              </div>
              <div className="flex justify-between text-slate-300 pt-1 border-t border-white/10 text-[10px]">
                <span className="text-slate-400">Segment:</span>
                <span className="text-slate-300">{hoveredAsset.segment}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Footer Legend & Scale Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 mt-2 border-t border-[#16294a]/60 text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <span>Performance Spectrum:</span>
          <div className="flex items-center gap-1">
            <span className="px-1.5 py-0.5 rounded text-[9.5px] bg-[#3a0d1e] text-rose-300 border border-rose-600/50">&lt; -1.0%</span>
            <span className="px-1.5 py-0.5 rounded text-[9.5px] bg-[#1e0d16] text-rose-300/80 border border-rose-900/40">-0.5%</span>
            <span className="px-1.5 py-0.5 rounded text-[9.5px] bg-[#0a1324] text-slate-400 border border-slate-700/50">0.0%</span>
            <span className="px-1.5 py-0.5 rounded text-[9.5px] bg-gradient-to-r from-[#091f2c] to-[#0a453f] text-cyan-200 border border-cyan-500/40">+0.8%</span>
            <span className="px-1.5 py-0.5 rounded text-[9.5px] bg-gradient-to-r from-cyan-500/30 to-emerald-500/40 text-emerald-200 border border-emerald-400/80">&gt; +2.0%</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] text-cyan-400/90 font-sans">
          <Sparkles className="w-3 h-3 text-cyan-400" />
          <span>Cell dimensions reflect proportional trading volume weight across the top 50 active assets</span>
        </div>
      </div>
    </div>
  );
}
