import React, { useState } from 'react';
import { LineChart, Search, ArrowUpRight, ArrowDownRight, TrendingUp, Star } from 'lucide-react';

export default function MarketWatchView({ tickers, bots }) {
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState(['NIFTY 50', 'BANKNIFTY', 'GOLD (XAUUSD)']);

  const toggleFav = (symbol) => {
    if (favorites.includes(symbol)) {
      setFavorites(favorites.filter((s) => s !== symbol));
    } else {
      setFavorites([...favorites, symbol]);
    }
  };

  const marketList = [
    ...tickers.map(t => ({
      symbol: t.symbol,
      price: t.price,
      change: t.change,
      changePercent: t.changePercent,
      high: t.price * 1.008,
      low: t.price * 0.992,
      vol: '42.8M',
      type: 'Index'
    })),
    ...bots.map(b => ({
      symbol: b.asset,
      price: b.price,
      change: b.change,
      changePercent: b.changePercent,
      high: b.price * 1.012,
      low: b.price * 0.988,
      vol: '18.4M',
      type: b.assetCategory
    }))
  ].filter((item, idx, self) => idx === self.findIndex((t) => t.symbol === item.symbol));

  const filtered = marketList.filter(m => m.symbol.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4 animate-fadeIn select-none">
      {/* Header */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <LineChart className="w-5 h-5 text-cyan-400" />
            Market Watch & Multi-Asset Depth Scanner
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Streaming live quotes across NSE, BSE, MCX, Forex and Crypto
          </p>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search instrument..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-[#09152e] border border-[#1e3a6e] text-xs text-slate-200 pl-8 pr-3 py-1.5 rounded-lg focus:outline-none focus:border-cyan-400 w-52"
          />
        </div>
      </div>

      {/* Market Watch Table */}
      <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#1e3a6e]/50 bg-[#070e1e] text-[10px] font-sans text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-3">Fav</th>
                <th className="py-2.5 px-3">Symbol</th>
                <th className="py-2.5 px-3">Segment</th>
                <th className="py-2.5 px-3 text-right">LTP (₹)</th>
                <th className="py-2.5 px-3 text-right">Change</th>
                <th className="py-2.5 px-3 text-right">Day High</th>
                <th className="py-2.5 px-3 text-right">Day Low</th>
                <th className="py-2.5 px-3 text-right">Volume</th>
                <th className="py-2.5 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e3a6e]/30">
              {filtered.map((item) => {
                const isUp = item.change >= 0;
                const isFav = favorites.includes(item.symbol);
                return (
                  <tr key={item.symbol} className="hover:bg-[#0e1d3d]/70 transition-colors">
                    <td className="py-2 px-3">
                      <button
                        onClick={() => toggleFav(item.symbol)}
                        className={`text-slate-500 hover:text-amber-400 transition-colors ${
                          isFav ? 'text-amber-400' : ''
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                      </button>
                    </td>
                    <td className="py-2 px-3 font-bold text-white tracking-wide">
                      {item.symbol}
                    </td>
                    <td className="py-2 px-3 text-[11px] text-slate-400 font-sans">
                      {item.type}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-slate-100">
                      {item.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className={`py-2 px-3 text-right font-semibold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isUp ? '+' : ''}{item.change.toFixed(2)} ({isUp ? '+' : ''}{item.changePercent.toFixed(2)}%)
                    </td>
                    <td className="py-2 px-3 text-right text-slate-300">
                      {item.high.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-300">
                      {item.low.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400">{item.vol}</td>
                    <td className="py-2 px-3 text-center">
                      <button
                        onClick={() => alert(`Direct trade ticket opened for ${item.symbol}`)}
                        className="bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold px-2 py-0.5 rounded transition-colors"
                      >
                        Trade
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

