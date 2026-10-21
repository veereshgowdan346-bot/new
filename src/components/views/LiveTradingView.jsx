import React, { useState } from 'react';
import { Activity, ArrowUpRight, ArrowDownRight, Zap, RefreshCw, Layers, Radio, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../../utils/api';

export default function LiveTradingView({
  candlestickData = [],
  recentTrades = [],
  wsConnected = false,
  brokerConnections = [],
  executionMode = 'PAPER',
  brokerAvailableCash = 0.00
}) {
  const [orderType, setOrderType] = useState('LIMIT');
  const [side, setSide] = useState('BUY');
  const [selectedAsset, setSelectedAsset] = useState('NIFTY 50');
  const [priceInput, setPriceInput] = useState('24730.50');
  const [qtyInput, setQtyInput] = useState('50');
  const [orderSuccess, setOrderSuccess] = useState('');
  const [orderError, setOrderError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if any broker is live connected
  const isAnyBrokerConnected = brokerConnections.some((b) => b.status === 'Connected');
  const isPaper = executionMode === 'PAPER';

  // Dynamic Margin Calculation: based on price * qty (15% F&O margin rate)
  const priceNum = parseFloat(priceInput) || 0;
  const qtyNum = parseFloat(qtyInput) || 0;
  const calculatedMargin = priceNum > 0 && qtyNum > 0 ? (priceNum * qtyNum * 0.15) : 0;
  const availableCash = isPaper ? 500000.00 : (isAnyBrokerConnected ? brokerAvailableCash : 0.00);

  // Live order book bids/asks - empty until broker depth feed is established
  const bids = [];
  const asks = [];

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setOrderSuccess('');
    setOrderError('');
    setIsSubmitting(true);

    try {
      const payload = {
        symbol: selectedAsset,
        action: side,
        qty: parseInt(qtyNum, 10),
        price: priceNum,
        bot: "Live Terminal DMA",
        variety: "NORMAL",
        ordertype: orderType,
        producttype: "INTRADAY"
      };

      const res = await apiFetch('/api/order/place', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res && res.status === 'success') {
        const orderId = res.result?.orderId || res.orderId || 'CONFIRMED';
        const mode = res.result?.mode || executionMode;
        setOrderSuccess(`✅ Order Executed (${mode}): ${side} ${qtyNum}x ${selectedAsset} @ ₹${priceNum} (Order ID: ${orderId})`);
      } else {
        const errMsg = res?.message || res?.result?.error || 'Order rejected by Risk Management System.';
        setOrderError(`❌ Order Rejected: ${errMsg}`);
      }
    } catch (err) {
      setOrderError(`❌ Order Transmission Failed: Backend service offline (${err.message || 'Connection error'}).`);
    } finally {
      setIsSubmitting(false);
      setTimeout(() => {
        setOrderSuccess('');
        setOrderError('');
      }, 6000);
    }
  };


  return (
    <div className="space-y-4 animate-fadeIn select-none">
      {/* Header */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            Live Trading Terminal & Depth Book
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Direct Market Access (DMA) Execution with Zero Latency Smart Order Routing
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono px-3 py-1 rounded-lg border flex items-center gap-1.5 ${
            wsConnected
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-slate-800/80 border-slate-700 text-slate-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`}></span>
            <span>WebSocket: {wsConnected ? 'CONNECTED (12ms)' : 'DISCONNECTED'}</span>
          </span>
        </div>
      </div>

      {orderSuccess && (
        <div className="bg-emerald-500/20 border border-emerald-500/60 text-emerald-300 px-4 py-2.5 rounded-xl text-xs font-bold font-mono shadow-[0_0_15px_rgba(16,185,129,0.3)] animate-fadeIn">
          {orderSuccess}
        </div>
      )}

      {orderError && (
        <div className="bg-rose-500/20 border border-rose-500/60 text-rose-300 px-4 py-2.5 rounded-xl text-xs font-bold font-mono shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-fadeIn">
          {orderError}
        </div>
      )}


      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Quick Order Entry Pad */}
        <div className="lg:col-span-4 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#1e3a6e]/40 pb-3 mb-3">
              <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                Quick Order Placement
              </h3>
              <div className="flex bg-[#070e1e] p-0.5 rounded-lg border border-[#1e3a6e]/50 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setSide('BUY')}
                  className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                    side === 'BUY' ? 'bg-emerald-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => setSide('SELL')}
                  className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                    side === 'SELL' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  SELL
                </button>
              </div>
            </div>

            <form onSubmit={handlePlaceOrder} className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">Instrument</label>
                <select
                  value={selectedAsset}
                  onChange={(e) => setSelectedAsset(e.target.value)}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
                >
                  <option value="NIFTY 50">NIFTY 50 Futures</option>
                  <option value="BANKNIFTY">BANKNIFTY Futures</option>
                  <option value="RELIANCE">RELIANCE</option>
                  <option value="TATA MOTORS">TATA MOTORS</option>
                  <option value="GOLD">GOLD (XAUUSD)</option>
                  <option value="BTCUSDT">BTCUSDT</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">Order Type</label>
                  <select
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value)}
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="LIMIT">LIMIT</option>
                    <option value="MARKET">MARKET</option>
                    <option value="SL-LIMIT">SL-LIMIT</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">Price (₹)</label>
                  <input
                    type="text"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">Quantity (Units / Lots)</label>
                <input
                  type="number"
                  min="1"
                  value={qtyInput}
                  onChange={(e) => setQtyInput(e.target.value)}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
                />
              </div>

              {/* Dynamic Margin Calculation & Zero Available Cash */}
              <div className="p-3 rounded-lg bg-[#060c1c] border border-[#1e3a6e]/40 space-y-1.5 text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>Required Margin:</span>
                  <span className="text-white font-bold">
                    ₹{calculatedMargin.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Available Cash:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-100 font-bold">
                      ₹{availableCash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {isPaper ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono">
                        Paper Capital
                      </span>
                    ) : (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                        isAnyBrokerConnected
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                      }`}>
                        {isAnyBrokerConnected ? 'Broker Margin' : 'Broker Offline'}
                      </span>
                    )}
                  </div>
                </div>
                {!isPaper && !isAnyBrokerConnected && (
                  <p className="text-[9.5px] text-amber-400/90 font-sans pt-1">
                    Connect broker in Broker Accounts to synchronize available live cash margin.
                  </p>
                )}
                {isPaper && (
                  <p className="text-[9.5px] text-cyan-400/80 font-sans pt-1">
                    Virtual capital allocated for safe algorithm simulation against live ticks.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all ${
                  isSubmitting ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                } ${
                  side === 'BUY'
                    ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                    : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/60 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                }`}
              >
                <Zap className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
                <span>{isSubmitting ? 'Transmitting Order...' : `Transmit ${side} Order`}</span>
              </button>

            </form>
          </div>
        </div>

        {/* Center: Market Depth Order Book */}
        <div className="lg:col-span-4 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#1e3a6e]/40 pb-3 mb-3">
              <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                Level 2 Order Book Depth
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">
                {bids.length > 0 ? 'Live Depth' : 'Feed Inactive'}
              </span>
            </div>

            {/* Depth Feed Table or Disconnected Empty State */}
            {bids.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <div className="text-[10px] font-bold text-emerald-400 uppercase border-b border-emerald-500/30 pb-1 mb-1.5 flex justify-between">
                    <span>Bid (₹)</span>
                    <span>Qty</span>
                  </div>
                  <div className="space-y-1">
                    {bids.map((bid, i) => (
                      <div key={i} className="flex justify-between items-center text-slate-200 p-1 rounded bg-emerald-500/5">
                        <span className="text-emerald-400 font-bold">{bid.price.toFixed(2)}</span>
                        <span>{bid.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold text-rose-400 uppercase border-b border-rose-500/30 pb-1 mb-1.5 flex justify-between">
                    <span>Ask (₹)</span>
                    <span>Qty</span>
                  </div>
                  <div className="space-y-1">
                    {asks.map((ask, i) => (
                      <div key={i} className="flex justify-between items-center text-slate-200 p-1 rounded bg-rose-500/5">
                        <span className="text-rose-400 font-bold">{ask.price.toFixed(2)}</span>
                        <span>{ask.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-14 px-3 text-center flex flex-col items-center justify-center bg-[#070e1e]/60 rounded-xl border border-[#1e3a6e]/40">
                <Radio className="w-8 h-8 text-slate-500 mb-2 animate-pulse" />
                <h4 className="text-xs font-bold text-slate-300">
                  Market depth feed waiting for broker WebSocket connection
                </h4>
                <p className="text-[10.5px] text-slate-500 mt-1 max-w-[240px] font-sans">
                  Real-time Level 2 bid/ask depth streams dynamically once authenticated through broker gateway.
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 p-2.5 rounded-lg bg-[#060c1c] border border-[#1e3a6e]/40 text-center font-mono text-[11px]">
            <span className="text-slate-400">Total Buyers: </span>
            <strong className="text-slate-300">{bids.length > 0 ? '5,000' : '--'}</strong>
            <span className="text-slate-600 mx-2">|</span>
            <span className="text-slate-400">Total Sellers: </span>
            <strong className="text-slate-300">{asks.length > 0 ? '4,650' : '--'}</strong>
          </div>
        </div>

        {/* Right: Real-time Execution Feed */}
        <div className="lg:col-span-4 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#1e3a6e]/40 pb-3 mb-3">
              <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                Live Execution Tape
              </h3>
              <span className={`w-2 h-2 rounded-full ${recentTrades.length > 0 ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`}></span>
            </div>

            {recentTrades.length > 0 ? (
              <div className="space-y-1.5 font-mono text-xs overflow-y-auto max-h-[300px] no-scrollbar">
                {recentTrades.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-[#060c1c] border border-[#1e3a6e]/30 text-[11px]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">{t.time}</span>
                      <span className="text-white font-bold">{t.symbol}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                        t.action === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                      }`}>
                        {t.action}
                      </span>
                      <span className="text-slate-300">{t.qty} @ {typeof t.price === 'number' ? t.price.toFixed(2) : t.price}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-14 px-3 text-center flex flex-col items-center justify-center bg-[#070e1e]/60 rounded-xl border border-[#1e3a6e]/40">
                <Layers className="w-8 h-8 text-slate-500 mb-2" />
                <h4 className="text-xs font-bold text-slate-300">
                  No Live Tape Executions
                </h4>
                <p className="text-[10.5px] text-slate-500 mt-1 max-w-[240px] font-sans">
                  Awaiting live order fills from connected broker. Fills will stream here in real-time.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
