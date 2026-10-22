import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip
} from 'recharts';
import {
  PieChart as PieChartIcon,
  Layers,
  Briefcase,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Sliders,
  DollarSign,
  TrendingUp,
  Percent,
  Info
} from 'lucide-react';

// Color palette calibrated for dark cyber-quant terminal
const PALETTE = [
  '#00f0ff', // Cyber Cyan
  '#818cf8', // Electric Indigo
  '#10b981', // Emerald
  '#f59e0b', // Amber Gold
  '#ec4899', // Pink / Fuchsia
  '#8b5cf6', // Violet
  '#06b6d4', // Teal
  '#f97316', // Orange
  '#3b82f6', // Cobalt
  '#64748b'  // Slate
];

// Robust sector categorization lookup
const SECTOR_MAP = {
  // Banking & Financial Services
  BANKNIFTY: 'Banking & Financials',
  'BANK NIFTY': 'Banking & Financials',
  HDFCBANK: 'Banking & Financials',
  ICICIBANK: 'Banking & Financials',
  SBIN: 'Banking & Financials',
  KOTAKBANK: 'Banking & Financials',
  AXISBANK: 'Banking & Financials',
  BAJFINANCE: 'Banking & Financials',
  BAJAJFINSV: 'Banking & Financials',
  INDUSINDBK: 'Banking & Financials',
  JIOFIN: 'Banking & Financials',
  FINNIFTY: 'Banking & Financials',
  'FIN NIFTY': 'Banking & Financials',
  BANKEX: 'Banking & Financials',

  // Benchmark Broad Indices
  NIFTY: 'Benchmark Indices',
  'NIFTY 50': 'Benchmark Indices',
  SENSEX: 'Benchmark Indices',
  MIDCPNIFTY: 'Benchmark Indices',
  'MIDCAP NIFTY': 'Benchmark Indices',
  'NIFTY NEXT 50': 'Benchmark Indices',

  // Energy & Petrochemicals
  RELIANCE: 'Energy & Petrochemicals',
  CRUDEOIL: 'Energy & Petrochemicals',
  NATURALGAS: 'Energy & Petrochemicals',
  ONGC: 'Energy & Petrochemicals',
  BPCL: 'Energy & Petrochemicals',
  IOC: 'Energy & Petrochemicals',
  COALINDIA: 'Energy & Petrochemicals',
  NTPC: 'Energy & Petrochemicals',
  POWERGRID: 'Energy & Petrochemicals',

  // IT & Technology
  TCS: 'IT & Technology',
  INFY: 'IT & Technology',
  WIPRO: 'IT & Technology',
  HCLTECH: 'IT & Technology',
  TECHM: 'IT & Technology',
  LTIM: 'IT & Technology',
  'NIFTY IT': 'IT & Technology',

  // Automotive & Mobility
  TATAMOTORS: 'Automotive & Mobility',
  MARUTI: 'Automotive & Mobility',
  'M&M': 'Automotive & Mobility',
  EICHERMOT: 'Automotive & Mobility',
  HEROMOTOCO: 'Automotive & Mobility',
  'BAJAJ-AUTO': 'Automotive & Mobility',
  'NIFTY AUTO': 'Automotive & Mobility',

  // Metals, Mining & Bullion
  GOLD: 'Metals & Commodities',
  SILVER: 'Metals & Commodities',
  COPPER: 'Metals & Commodities',
  ZINC: 'Metals & Commodities',
  TATASTEEL: 'Metals & Commodities',
  JSWSTEEL: 'Metals & Commodities',
  HINDALCO: 'Metals & Commodities',
  'NIFTY METAL': 'Metals & Commodities',

  // Healthcare & Pharma
  SUNPHARMA: 'Healthcare & Pharma',
  CIPLA: 'Healthcare & Pharma',
  DRREDDY: 'Healthcare & Pharma',
  DIVISLAB: 'Healthcare & Pharma',
  APOLLOHOSP: 'Healthcare & Pharma',
  'NIFTY PHARMA': 'Healthcare & Pharma',

  // FMCG & Consumer Retail
  ITC: 'FMCG & Consumer',
  BRITANNIA: 'FMCG & Consumer',
  TATACONSUM: 'FMCG & Consumer',
  TITAN: 'FMCG & Consumer',
  ASIANPAINT: 'FMCG & Consumer',
  TRENT: 'FMCG & Consumer',
  ZOMATO: 'FMCG & Consumer',
  'NIFTY FMCG': 'FMCG & Consumer',

  // Defence & Capital Goods
  BEL: 'Defence & Industrials',
  HAL: 'Defence & Industrials',
  LT: 'Defence & Industrials',
  ADANIENT: 'Defence & Industrials',
  ADANIPORTS: 'Defence & Industrials',
  ULTRACEMCO: 'Defence & Industrials',
  GRASIM: 'Defence & Industrials',

  // Currency & Forex
  USDINR: 'Currency & Forex',
  EURINR: 'Currency & Forex',
  GBPINR: 'Currency & Forex',
  JPYINR: 'Currency & Forex'
};

/**
 * Identify Sector from symbol string
 */
function getSectorFromSymbol(symbol = '') {
  const upper = symbol.toUpperCase().trim();
  for (const [key, sector] of Object.entries(SECTOR_MAP)) {
    if (upper.includes(key)) {
      return sector;
    }
  }
  return 'Diversified Equities';
}

/**
 * Identify Asset Class from position segment or symbol
 */
function getAssetClassFromPosition(pos = {}) {
  const seg = (pos.segment || '').toUpperCase();
  const sym = (pos.symbol || '').toUpperCase();

  if (seg.includes('OPTION') || sym.includes(' CE') || sym.includes(' PE') || sym.endsWith('CE') || sym.endsWith('PE')) {
    return 'Index & Stock Options';
  }
  if (seg.includes('COMMODIT') || seg.includes('MCX') || sym.includes('GOLD') || sym.includes('CRUDE') || sym.includes('SILVER')) {
    return 'Commodities & MCX';
  }
  if (seg.includes('CURRENCY') || sym.includes('USDINR') || sym.includes('EURINR') || sym.includes('GBPINR')) {
    return 'Currency Derivatives';
  }
  if (seg.includes('FUTUR') || sym.includes(' FUT') || sym.endsWith('FUT')) {
    return 'Futures Contracts';
  }
  if (seg.includes('CASH') || seg.includes('EQUITY') || seg.includes('NSE') || seg.includes('BSE')) {
    return 'Cash Equities';
  }
  return 'Equities & Derivatives';
}

/**
 * Custom High-Density Quant Tooltip
 */
function CustomAllocationTooltip({ active, payload, totalExposure }) {
  if (active && payload && payload.length > 0) {
    const data = payload[0].payload;
    const pct = totalExposure > 0 ? ((data.value / totalExposure) * 100).toFixed(1) : '0.0';
    return (
      <div className="bg-[#070d1d]/95 backdrop-blur-md border border-[#16294a] rounded-xl p-3 shadow-2xl min-w-[200px] text-xs font-mono z-50">
        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-800">
          <div className="flex items-center gap-1.5 font-bold text-slate-100">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block shrink-0"
              style={{ backgroundColor: data.color }}
            />
            <span className="truncate max-w-[140px]">{data.name}</span>
          </div>
          <span className="text-cyan-400 font-bold">{pct}%</span>
        </div>

        <div className="pt-2 space-y-1.5 text-[11px]">
          <div className="flex justify-between items-center text-slate-400">
            <span>Capital Exposure:</span>
            <span className="font-bold text-slate-100">
              ₹{Number(data.value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="flex justify-between items-center text-slate-400">
            <span>Positions:</span>
            <span className="text-slate-200">{data.count} active</span>
          </div>

          <div className="flex justify-between items-center text-slate-400">
            <span>Unrealized P&L:</span>
            <span className={`font-bold flex items-center ${data.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {data.pnl >= 0 ? '+' : ''}₹{Number(data.pnl || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {data.symbols && data.symbols.length > 0 && (
            <div className="pt-1.5 border-t border-slate-800/80">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Top Holdings:</span>
              <div className="flex flex-wrap gap-1">
                {data.symbols.slice(0, 3).map((sym, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 font-mono"
                  >
                    {sym}
                  </span>
                ))}
                {data.symbols.length > 3 && (
                  <span className="text-[10px] text-slate-500">+{data.symbols.length - 3} more</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
}

export default function AssetAllocation({
  positions = [],
  totalCapital = 250000,
  className = ''
}) {
  // View mode: 'ASSET_CLASS' or 'SECTOR'
  const [viewMode, setViewMode] = useState('ASSET_CLASS');
  // Capital scope: 'HOLDINGS' (only open positions) or 'TOTAL_CAPITAL' (includes cash buffer)
  const [includeCash, setIncludeCash] = useState(false);
  // Hovered slice for center readout highlight
  const [hoveredSlice, setHoveredSlice] = useState(null);

  // Compute breakdown dynamically in real-time based on live positions
  const { chartData, totalExposure, maxConcentration, cashReserve, activeCount } = useMemo(() => {
    const list = Array.isArray(positions) ? positions : [];
    const groups = {};

    let totalExp = 0;
    let totalPnl = 0;

    list.forEach((pos) => {
      // Exposure calculation: qty * (ltp || entryPrice)
      const price = Number(pos.ltp || pos.entryPrice || 0);
      const qty = Math.abs(Number(pos.qty || 1));
      const exposure = price * qty;
      const pnl = Number(pos.pnl || 0);

      const category = viewMode === 'SECTOR'
        ? getSectorFromSymbol(pos.symbol)
        : getAssetClassFromPosition(pos);

      totalExp += exposure;
      totalPnl += pnl;

      if (!groups[category]) {
        groups[category] = {
          name: category,
          value: 0,
          count: 0,
          pnl: 0,
          symbols: []
        };
      }

      groups[category].value += exposure;
      groups[category].count += 1;
      groups[category].pnl += pnl;
      if (!groups[category].symbols.includes(pos.symbol)) {
        groups[category].symbols.push(pos.symbol);
      }
    });

    // Unallocated cash margin
    const cash = Math.max(0, totalCapital - totalExp);

    // Convert to sorted array
    let items = Object.values(groups).sort((a, b) => b.value - a.value);

    // If including cash buffer and cash > 0
    if (includeCash && cash > 0) {
      items.push({
        name: 'Cash Margin Reserve',
        value: cash,
        count: 0,
        pnl: 0,
        symbols: ['UNALLOCATED CASH'],
        isCash: true
      });
    }

    // Assign consistent palette colors
    items = items.map((item, idx) => ({
      ...item,
      color: item.isCash ? '#475569' : PALETTE[idx % PALETTE.length]
    }));

    const effectiveTotal = includeCash ? Math.max(totalCapital, totalExp) : (totalExp || 1);

    // Find top concentration
    const topItem = items.length > 0 ? items[0] : null;
    const topPct = topItem && effectiveTotal > 0 ? ((topItem.value / effectiveTotal) * 100).toFixed(1) : 0;

    return {
      chartData: items,
      totalExposure: totalExp,
      cashReserve: cash,
      activeCount: list.length,
      maxConcentration: topItem ? { name: topItem.name, pct: topItem.pct || topPct, value: topItem.value } : null
    };
  }, [positions, viewMode, includeCash, totalCapital]);

  const effectiveTotal = includeCash ? Math.max(totalCapital, totalExposure) : (totalExposure || 1);

  // Active display readout for center of donut
  const centerDisplay = useMemo(() => {
    if (hoveredSlice) {
      const pct = effectiveTotal > 0 ? ((hoveredSlice.value / effectiveTotal) * 100).toFixed(1) : '0.0';
      return {
        label: hoveredSlice.name,
        value: `₹${Math.round(hoveredSlice.value).toLocaleString('en-IN')}`,
        sub: `${pct}% of allocation`,
        color: hoveredSlice.color
      };
    }
    return {
      label: includeCash ? 'TOTAL CAPITAL' : 'ACTIVE EXPOSURE',
      value: `₹${Math.round(includeCash ? totalCapital : totalExposure).toLocaleString('en-IN')}`,
      sub: `${activeCount} active position${activeCount === 1 ? '' : 's'}`,
      color: '#00f0ff'
    };
  }, [hoveredSlice, includeCash, totalCapital, totalExposure, activeCount, effectiveTotal]);

  return (
    <div className={`glass-panel p-4 rounded-2xl border border-[#16294a]/80 flex flex-col justify-between ${className}`}>
      {/* Top Header & Interactive Segmented Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#16294a]/60">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
            <PieChartIcon className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-100">Asset & Sector Allocation</h2>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Real-time live streaming" />
            </div>
            <p className="text-[11px] font-mono text-slate-400">
              Live quantitative exposure distribution & sector concentration
            </p>
          </div>
        </div>

        {/* View Mode & Capital Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Dimension Selector: Asset Class vs Sector */}
          <div className="flex items-center bg-[#070d1d] p-0.5 rounded-lg border border-slate-800 text-[11px] font-mono">
            <button
              type="button"
              onClick={() => setViewMode('ASSET_CLASS')}
              className={`px-2.5 py-1 rounded transition-colors font-semibold ${
                viewMode === 'ASSET_CLASS'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              Asset Class
            </button>
            <button
              type="button"
              onClick={() => setViewMode('SECTOR')}
              className={`px-2.5 py-1 rounded transition-colors font-semibold ${
                viewMode === 'SECTOR'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              Sector
            </button>
          </div>

          {/* Cash Buffer Toggle */}
          <button
            type="button"
            onClick={() => setIncludeCash((prev) => !prev)}
            title="Toggle unallocated cash reserve margin in chart"
            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors border ${
              includeCash
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                : 'bg-[#070d1d] text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-300'
            }`}
          >
            {includeCash ? 'With Cash Buffer' : 'Holdings Only'}
          </button>
        </div>
      </div>

      {/* Main Content Area: Donut Chart on Left, Detailed Quant Breakdown on Right */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center py-3">
        {/* Donut Chart with Center Metric Readout (5 Cols) */}
        <div className="md:col-span-5 relative flex items-center justify-center min-h-[220px]">
          {chartData.length > 0 && totalExposure > 0 ? (
            <>
              <div className="w-full h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      content={<CustomAllocationTooltip totalExposure={effectiveTotal} />}
                    />
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={86}
                      paddingAngle={3}
                      stroke="#070d1d"
                      strokeWidth={2}
                      onMouseEnter={(_, index) => setHoveredSlice(chartData[index])}
                      onMouseLeave={() => setHoveredSlice(null)}
                      animationDuration={700}
                    >
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color}
                          opacity={
                            hoveredSlice && hoveredSlice.name !== entry.name ? 0.45 : 1
                          }
                          className="transition-opacity duration-200 cursor-pointer"
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Absolute Center Readout Inside the Donut */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center p-2">
                <span className="text-[9px] uppercase tracking-wider font-mono text-slate-400 font-semibold truncate max-w-[110px]">
                  {centerDisplay.label}
                </span>
                <span
                  className="text-sm font-bold font-mono tracking-tight mt-0.5 truncate max-w-[125px]"
                  style={{ color: centerDisplay.color }}
                >
                  {centerDisplay.value}
                </span>
                <span className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[110px]">
                  {centerDisplay.sub}
                </span>
              </div>
            </>
          ) : (
            /* Empty / Idle State */
            <div className="flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-800 rounded-xl w-full">
              <Briefcase className="w-8 h-8 text-slate-600 mb-2" />
              <span className="text-xs font-mono text-slate-300 font-bold">No Active Holdings</span>
              <span className="text-[11px] text-slate-500 font-mono mt-1">
                Portfolio is currently 100% in liquid cash reserves
              </span>
            </div>
          )}
        </div>

        {/* Detailed Quant Breakdown & Concentration Matrix (7 Cols) */}
        <div className="md:col-span-7 space-y-2.5">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-[#070d1d] border border-slate-800 text-[11px] font-mono">
            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Total Exposure</span>
              <span className="font-bold text-slate-200 mt-0.5 block truncate">
                ₹{Math.round(totalExposure).toLocaleString('en-IN')}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Top Category</span>
              <span className="font-bold text-cyan-300 mt-0.5 block truncate">
                {maxConcentration ? `${maxConcentration.pct}%` : '0%'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Margin Deployed</span>
              <span className="font-bold text-emerald-400 mt-0.5 block truncate">
                {totalCapital > 0 ? `${((totalExposure / totalCapital) * 100).toFixed(1)}%` : '0%'}
              </span>
            </div>
          </div>

          {/* Allocation Categories List */}
          <div className="space-y-1.5 max-h-[170px] overflow-y-auto pr-1 custom-scrollbar">
            {chartData.map((item, idx) => {
              const pct = effectiveTotal > 0 ? ((item.value / effectiveTotal) * 100).toFixed(1) : '0.0';
              const isHovered = hoveredSlice && hoveredSlice.name === item.name;

              return (
                <div
                  key={idx}
                  onMouseEnter={() => setHoveredSlice(item)}
                  onMouseLeave={() => setHoveredSlice(null)}
                  className={`p-2 rounded-lg border transition-all duration-150 cursor-pointer ${
                    isHovered
                      ? 'bg-slate-800/80 border-cyan-500/50 scale-[1.01]'
                      : 'bg-[#050b18]/60 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-semibold text-slate-200 truncate">
                        {item.name}
                      </span>
                      {item.count > 0 && (
                        <span className="text-[10px] text-slate-500 font-mono shrink-0">
                          ({item.count})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {item.pnl !== undefined && !item.isCash && (
                        <span className={`text-[11px] font-bold ${item.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {item.pnl >= 0 ? '+' : ''}₹{Math.round(item.pnl).toLocaleString('en-IN')}
                        </span>
                      )}
                      <span className="text-slate-100 font-bold min-w-[70px] text-right">
                        ₹{Math.round(item.value).toLocaleString('en-IN')}
                      </span>
                      <span className="text-cyan-400 font-bold min-w-[42px] text-right">
                        {pct}%
                      </span>
                    </div>
                  </div>

                  {/* Horizontal Allocation Progress Bar */}
                  <div className="w-full bg-slate-900 rounded-full h-1 mt-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.max(2, Number(pct)))}%`,
                        backgroundColor: item.color
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Status & Risk Concentration Warning */}
      <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-400 pt-2 border-t border-[#16294a]/40 gap-2">
        <div className="flex items-center gap-2">
          {maxConcentration && Number(maxConcentration.pct) > 40 ? (
            <span className="text-amber-400 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              Concentration Alert: {maxConcentration.name} exceeds 40% threshold ({maxConcentration.pct}%)
            </span>
          ) : (
            <span className="text-emerald-400 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 shrink-0" />
              Diversification Index: Optimal Multi-Sector Spread
            </span>
          )}
        </div>

        <div className="text-slate-500">
          Cash Reserve: <span className="text-slate-300 font-bold">₹{Math.round(cashReserve).toLocaleString('en-IN')}</span>
        </div>
      </div>
    </div>
  );
}
