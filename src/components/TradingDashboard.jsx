import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Layers,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  RefreshCw,
  PlusCircle,
  Square,
  AlertOctagon,
  Clock,
  Sparkles,
  Zap,
  CheckCircle2,
  Filter,
  Search,
  DollarSign,
  Maximize2,
  History,
  Download,
  ChevronLeft,
  ChevronRight,
  Calendar,
  FileSpreadsheet,
  Bell,
  BellRing,
  Sliders,
  Play,
  Trash2
} from 'lucide-react';
import { soundEngine } from '../utils/audioChime';
import MarketSentimentRadialGauge from './MarketSentimentRadialGauge';
import AssetAllocation from './AssetAllocation';
import PriceAlertBanner from './PriceAlertBanner';
import PriceAlertModal from './PriceAlertModal';
import {
  priceAlertManager,
  ALERT_STATUSES,
  ALERT_TYPES,
  ALERT_CONDITIONS
} from '../utils/priceAlertManager';
import { calculateDynamicKellyPositionSize } from '../utils/kellyPositionSizer';
import { evaluate14BotQuorumConsensus, QUORUM_DECISION_TYPES } from '../utils/quorumConsensusEngine';
import { validateNetProfitGuardrail, calculateTradeCharges, INSTITUTIONAL_HURDLE_ROI_PCT } from '../utils/taxCalculator';

// Initial Intraday Equity Curve (Mock Indian Market 09:15 - 15:30)
const generateInitialEquityData = () => {
  const times = [
    '09:15', '09:30', '09:45', '10:00', '10:15', '10:30', '10:45', '11:00',
    '11:15', '11:30', '11:45', '12:00', '12:15', '12:30', '12:45', '13:00',
    '13:15', '13:30', '13:45', '14:00', '14:15', '14:30', '14:45', '15:00', '15:15'
  ];

  const baseCapital = getPaperCapital();
  let currentEquity = baseCapital;
  let benchmarkVal = baseCapital;

  return times.map((time, idx) => {
    // Generate realistic simulated paper progression based on unified paper capital
    const drift = Math.sin(idx * 0.4) * 200 + 400;
    const noise = (Math.random() - 0.38) * 300;
    const change = Math.round(drift + noise);
    currentEquity += change;

    // Benchmark comparison (e.g. NIFTY 50 passive hold)
    benchmarkVal += Math.round((Math.random() - 0.48) * 300 + 150);

    const netPnl = currentEquity - baseCapital;
    const pnlPct = Number(((netPnl / baseCapital) * 100).toFixed(2));

    return {
      time,
      equity: currentEquity,
      benchmark: benchmarkVal,
      netPnl,
      pnlPct,
      drawdown: Number((Math.min(0, (Math.random() * -0.6) - 0.1)).toFixed(2))
    };
  });
};

// Initial Intraday Trade Signal markers mapped directly onto the timeline
export const initialIntradayTradeSignals = [
  { id: 'sig_1', time: '09:30', fullTime: '09:30:10 AM', symbol: 'NIFTY 50 25800 CE', action: 'BUY', qty: 50, price: 110.00, bot: 'Gamma Squeeze Scalper (Bot #4)', quorum: '11/14' },
  { id: 'sig_2', time: '09:45', fullTime: '09:42:15 AM', symbol: 'RELIANCE', action: 'BUY', qty: 30, price: 2940.00, bot: 'Institutional Equities Rider (Bot #7)', quorum: '12/14' },
  { id: 'sig_3', time: '10:15', fullTime: '10:14:02 AM', symbol: 'NIFTY 50 25750 PE', action: 'SELL', qty: 50, price: 84.00, bot: 'Alpha Trend Scalper (Bot #1)', quorum: '10/14' },
  { id: 'sig_4', time: '11:00', fullTime: '11:02:50 AM', symbol: 'MIDCPNIFTY 13200 CE', action: 'BUY', qty: 50, price: 142.00, bot: 'Midcap Momentum Alpha (Bot #11)', quorum: '12/14' },
  { id: 'sig_5', time: '11:45', fullTime: '11:48:33 AM', symbol: 'TATAMOTORS', action: 'BUY', qty: 40, price: 978.00, bot: 'Auto Sector Leader (Bot #9)', quorum: '11/14' },
  { id: 'sig_6', time: '13:00', fullTime: '12:55:10 PM', symbol: 'TCS', action: 'SELL', qty: 20, price: 3540.00, bot: 'Ultra Scalper (Bot #3)', quorum: '10/14' },
  { id: 'sig_7', time: '13:15', fullTime: '13:20:18 PM', symbol: 'CRUDEOIL 15NOV FUT', action: 'SELL', qty: 100, price: 6280.00, bot: 'Crude Momentum Tracker (Bot #6)', quorum: '9/14' },
  { id: 'sig_8', time: '14:00', fullTime: '13:58:22 PM', symbol: 'RELIANCE', action: 'BUY', qty: 25, price: 2950.00, bot: 'Institutional Equities Rider (Bot #7)', quorum: '11/14' },
  { id: 'sig_9', time: '14:30', fullTime: '14:28:12 PM', symbol: 'NIFTY 50 25800 CE', action: 'BUY', qty: 50, price: 124.50, bot: 'Gamma Squeeze Scalper (Bot #4)', quorum: '13/14' }
];

// Initial default positions fallback
const defaultFallbackPositions = [
  {
    id: 'pos_1',
    symbol: 'NIFTY 50 25850 CE',
    bot: 'Gamma Squeeze Scalper (Bot #4)',
    action: 'BUY',
    qty: 50,
    entryPrice: 138.50,
    ltp: 147.20,
    pnl: 435.00,
    pnlPct: 6.28,
    segment: 'Index Options (NSE)',
    target: 165.00,
    stopLoss: 125.00,
    openedAt: '10:14:22 AM'
  },
  {
    id: 'pos_2',
    symbol: 'BANKNIFTY 54200 PE',
    bot: 'BankNifty Breakout Hunter (Bot #2)',
    action: 'BUY',
    qty: 30,
    entryPrice: 382.40,
    ltp: 412.80,
    pnl: 912.00,
    pnlPct: 7.95,
    segment: 'Index Options (NSE)',
    target: 460.00,
    stopLoss: 350.00,
    openedAt: '11:05:40 AM'
  },
  {
    id: 'pos_3',
    symbol: 'RELIANCE',
    bot: 'Institutional Equities Rider (Bot #7)',
    action: 'BUY',
    qty: 25,
    entryPrice: 2965.00,
    ltp: 2984.50,
    pnl: 487.50,
    pnlPct: 0.66,
    segment: 'Cash Equity (NSE)',
    target: 3050.00,
    stopLoss: 2930.00,
    openedAt: '09:45:10 AM'
  },
  {
    id: 'pos_4',
    symbol: 'GOLD 05DEC 78500 CE',
    bot: 'Bullion Macro Scalper (Bot #5)',
    action: 'BUY',
    qty: 10,
    entryPrice: 620.00,
    ltp: 648.50,
    pnl: 285.00,
    pnlPct: 4.60,
    segment: 'Commodities (MCX)',
    target: 710.00,
    stopLoss: 580.00,
    openedAt: '12:20:15 PM'
  }
];

// Historical completed trades dataset for pagination & audit
const defaultCompletedTrades = [
  { id: 'TRD_10482', time: '14:28:12', symbol: 'NIFTY 50 25800 CE', market: 'NSE F&O', action: 'BUY', qty: 50, entryPrice: 124.50, exitPrice: 148.20, pnl: 1185.00, pnlPercent: 19.04, strategy: 'Gamma Squeeze Scalper', bot: 'Bot #4', status: 'Closed', duration: '6m 14s' },
  { id: 'TRD_10481', time: '14:15:40', symbol: 'BANKNIFTY 54000 PE', market: 'NSE F&O', action: 'BUY', qty: 30, entryPrice: 310.20, exitPrice: 342.80, pnl: 978.00, pnlPercent: 10.51, strategy: 'BankNifty Breakout Hunter', bot: 'Bot #2', status: 'Closed', duration: '11m 02s' },
  { id: 'TRD_10480', time: '13:58:22', symbol: 'RELIANCE', market: 'NSE Cash', action: 'BUY', qty: 25, entryPrice: 2950.00, exitPrice: 2974.50, pnl: 612.50, pnlPercent: 0.83, strategy: 'Institutional Equities Rider', bot: 'Bot #7', status: 'Closed', duration: '28m 45s' },
  { id: 'TRD_10479', time: '13:42:05', symbol: 'GOLD 05DEC CE', market: 'MCX', action: 'BUY', qty: 10, entryPrice: 580.00, exitPrice: 615.00, pnl: 350.00, pnlPercent: 6.03, strategy: 'Bullion Macro Scalper', bot: 'Bot #5', status: 'Closed', duration: '14m 20s' },
  { id: 'TRD_10478', time: '13:20:18', symbol: 'CRUDEOIL 15NOV FUT', market: 'MCX', action: 'SELL', qty: 100, entryPrice: 6280.00, exitPrice: 6245.00, pnl: 3500.00, pnlPercent: 0.56, strategy: 'Crude Momentum Tracker', bot: 'Bot #6', status: 'Closed', duration: '8m 55s' },
  { id: 'TRD_10477', time: '12:55:10', symbol: 'TCS', market: 'NSE Cash', action: 'SELL', qty: 20, entryPrice: 3540.00, exitPrice: 3522.00, pnl: 360.00, pnlPercent: 0.51, strategy: 'Ultra Scalper', bot: 'Bot #3', status: 'Closed', duration: '4m 10s' },
  { id: 'TRD_10476', time: '12:34:45', symbol: 'FINNIFTY 24150 CE', market: 'NSE F&O', action: 'BUY', qty: 40, entryPrice: 95.00, exitPrice: 88.50, pnl: -260.00, pnlPercent: -6.84, strategy: 'Mean Reversion Pro', bot: 'Bot #1', status: 'Closed', duration: '7m 18s' },
  { id: 'TRD_10475', time: '12:12:08', symbol: 'HDFCBANK', market: 'NSE Cash', action: 'BUY', qty: 30, entryPrice: 1672.00, exitPrice: 1686.50, pnl: 435.00, pnlPercent: 0.87, strategy: 'Banking Titan Arbitrage', bot: 'Bot #8', status: 'Closed', duration: '35m 12s' },
  { id: 'TRD_10474', time: '11:48:33', symbol: 'TATAMOTORS', market: 'NSE Cash', action: 'BUY', qty: 40, entryPrice: 978.00, exitPrice: 991.20, pnl: 528.00, pnlPercent: 1.35, strategy: 'Auto Sector Leader', bot: 'Bot #9', status: 'Closed', duration: '19m 40s' },
  { id: 'TRD_10473', time: '11:25:14', symbol: 'INFY', market: 'NSE Cash', action: 'BUY', qty: 25, entryPrice: 1875.00, exitPrice: 1892.00, pnl: 425.00, pnlPercent: 0.91, strategy: 'IT Trend Rider', bot: 'Bot #10', status: 'Closed', duration: '22m 15s' },
  { id: 'TRD_10472', time: '11:02:50', symbol: 'MIDCPNIFTY 13200 CE', market: 'NSE F&O', action: 'BUY', qty: 50, entryPrice: 142.00, exitPrice: 158.40, pnl: 820.00, pnlPercent: 11.55, strategy: 'Midcap Momentum Alpha', bot: 'Bot #11', status: 'Closed', duration: '12m 30s' },
  { id: 'TRD_10471', time: '10:45:19', symbol: 'USDINR 28OCT FUT', market: 'Currency', action: 'BUY', qty: 100, entryPrice: 84.08, exitPrice: 84.14, pnl: 600.00, pnlPercent: 0.07, strategy: 'Currency FX Arbitrage', bot: 'Bot #12', status: 'Closed', duration: '45m 10s' },
  { id: 'TRD_10470', time: '10:28:44', symbol: 'SILVER 05DEC MCX', market: 'MCX', action: 'BUY', qty: 5, entryPrice: 91800.00, exitPrice: 92350.00, pnl: 2750.00, pnlPercent: 0.60, strategy: 'Silver Spike Catcher', bot: 'Bot #13', status: 'Closed', duration: '16m 05s' },
  { id: 'TRD_10469', time: '10:14:02', symbol: 'NIFTY 50 25750 PE', market: 'NSE F&O', action: 'SELL', qty: 50, entryPrice: 84.00, exitPrice: 62.50, pnl: 1075.00, pnlPercent: 25.60, strategy: 'Alpha Trend Scalper', bot: 'Bot #1', status: 'Closed', duration: '9m 50s' },
  { id: 'TRD_10468', time: '09:58:30', symbol: 'BANKNIFTY 53900 CE', market: 'NSE F&O', action: 'BUY', qty: 30, entryPrice: 285.00, exitPrice: 268.00, pnl: -510.00, pnlPercent: -5.96, strategy: 'BankNifty Breakout Hunter', bot: 'Bot #2', status: 'Closed', duration: '5m 45s' },
  { id: 'TRD_10467', time: '09:42:15', symbol: 'RELIANCE', market: 'NSE Cash', action: 'BUY', qty: 30, entryPrice: 2940.00, exitPrice: 2962.00, pnl: 660.00, pnlPercent: 0.75, strategy: 'Institutional Equities Rider', bot: 'Bot #7', status: 'Closed', duration: '31m 20s' },
  { id: 'TRD_10466', time: '09:30:10', symbol: 'NIFTY 50 25800 CE', market: 'NSE F&O', action: 'BUY', qty: 50, entryPrice: 110.00, exitPrice: 126.50, pnl: 825.00, pnlPercent: 15.00, strategy: 'Gamma Squeeze Scalper', bot: 'Bot #4', status: 'Closed', duration: '8m 10s' },
  { id: 'TRD_10465', time: '09:20:05', symbol: 'FINNIFTY 24100 PE', market: 'NSE F&O', action: 'SELL', qty: 40, entryPrice: 72.00, exitPrice: 56.00, pnl: 640.00, pnlPercent: 22.22, strategy: 'Mean Reversion Pro', bot: 'Bot #1', status: 'Closed', duration: '6m 40s' }
];

export default function TradingDashboard({
  positions = [],
  onSquareOff,
  onSquareOffAll,
  bots = [],
  recentTrades = [],
  executionMode = 'PAPER',
  onNavigateTab,
  tickers = []
}) {
  // Equity Data & Live Stream
  const [equityData, setEquityData] = useState(generateInitialEquityData);
  const [timeframe, setTimeframe] = useState('1D'); // '1D', '1W', '1M', 'YTD'
  const [showBenchmark, setShowBenchmark] = useState(true);
  const [isLiveStreaming, setIsLiveStreaming] = useState(true);
  const [feedback, setFeedback] = useState(null);

  // Executed Buy / Sell Trade Signal Markers mapped to timeline
  const [tradeSignals, setTradeSignals] = useState(initialIntradayTradeSignals);
  const [showTradeMarkers, setShowTradeMarkers] = useState(true);
  const [signalFilter, setSignalFilter] = useState('ALL'); // 'ALL' | 'BUY' | 'SELL'

  // Augmented Equity Data merging trade signal executions directly into chart timeline coordinates
  const augmentedEquityData = useMemo(() => {
    return equityData.map((point) => {
      const pointHourMin = (point.time || '').slice(0, 5);
      const matchingSignals = tradeSignals.filter((s) => {
        if (signalFilter !== 'ALL' && s.action !== signalFilter) return false;
        const sHourMin = (s.time || '').slice(0, 5);
        return sHourMin === pointHourMin;
      });

      const primarySignal = matchingSignals.length > 0 ? matchingSignals[matchingSignals.length - 1] : null;

      return {
        ...point,
        tradeSignal: primarySignal,
        tradeSignals: matchingSignals
      };
    });
  }, [equityData, tradeSignals, signalFilter]);

  // Price Alerts State
  const [alerts, setAlerts] = useState(() => priceAlertManager.getAlerts());
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [alertPrefilledSymbol, setAlertPrefilledSymbol] = useState(null);

  // Subscribe to real-time alert updates from priceAlertManager
  useEffect(() => {
    const unsubscribe = priceAlertManager.subscribe((updated) => {
      setAlerts(updated);
    });
    return unsubscribe;
  }, []);

  // Local positions copy to allow interactive testing & additions
  const [localPositions, setLocalPositions] = useState(() => {
    return positions && positions.length > 0 ? positions : defaultFallbackPositions;
  });

  // Sync when prop positions update
  useEffect(() => {
    if (positions && positions.length > 0) {
      setLocalPositions(positions);
    }
  }, [positions]);

  // Filters & Search for Active Positions
  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [exitingId, setExitingId] = useState(null);

  // Trade History Pagination & Filters
  const [tradePage, setTradePage] = useState(1);
  const [tradePageSize, setTradePageSize] = useState(10);
  const [tradeSearchQuery, setTradeSearchQuery] = useState('');
  const [tradeOutcomeFilter, setTradeOutcomeFilter] = useState('ALL'); // 'ALL' | 'WIN' | 'LOSS'
  const [tradeSideFilter, setTradeSideFilter] = useState('ALL'); // 'ALL' | 'BUY' | 'SELL'

  // Combined full completed trade history (live closed trades + historical audit book)
  const allCompletedTrades = useMemo(() => {
    const liveClosedTrades = (recentTrades || []).map((t, idx) => ({
      id: t.id || t.orderId || `TRD_LIVE_${idx}`,
      time: t.time || new Date().toLocaleTimeString(),
      symbol: t.symbol || 'NIFTY 50',
      market: t.market || t.segment || 'NSE F&O',
      action: t.action || t.type || 'BUY',
      qty: t.qty || 50,
      entryPrice: Number(t.entryPrice || t.price || 0),
      exitPrice: Number(t.exitPrice || (t.entryPrice ? t.entryPrice * 1.01 : t.price || 0)),
      pnl: Number(t.pnl || 0),
      pnlPercent: Number(t.pnlPercent || 0),
      strategy: t.strategy || t.bot || 'Decision Network Quorum',
      bot: t.bot || 'Bot Fleet',
      status: t.status || 'Closed',
      duration: t.duration || '4m 30s'
    }));

    const combined = [...liveClosedTrades, ...defaultCompletedTrades];
    const seen = new Set();
    return combined.filter((tr) => {
      const key = tr.id || `${tr.time}-${tr.symbol}-${tr.entryPrice}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [recentTrades]);

  // Filtered completed trades
  const filteredTradeHistory = useMemo(() => {
    return allCompletedTrades.filter((t) => {
      if (tradeSearchQuery) {
        const q = tradeSearchQuery.toLowerCase();
        const matchesSym = t.symbol?.toLowerCase().includes(q);
        const matchesBot = t.bot?.toLowerCase().includes(q) || t.strategy?.toLowerCase().includes(q);
        const matchesId = t.id?.toLowerCase().includes(q);
        if (!matchesSym && !matchesBot && !matchesId) return false;
      }
      if (tradeOutcomeFilter === 'WIN' && Number(t.pnl || 0) <= 0) return false;
      if (tradeOutcomeFilter === 'LOSS' && Number(t.pnl || 0) >= 0) return false;
      if (tradeSideFilter !== 'ALL') {
        const side = (t.action || t.type || '').toUpperCase();
        if (side !== tradeSideFilter) return false;
      }
      return true;
    });
  }, [allCompletedTrades, tradeSearchQuery, tradeOutcomeFilter, tradeSideFilter]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setTradePage(1);
  }, [tradeSearchQuery, tradeOutcomeFilter, tradeSideFilter, tradePageSize]);

  // Paginated trade slice
  const totalTradePages = Math.max(1, Math.ceil(filteredTradeHistory.length / tradePageSize));
  const paginatedTrades = useMemo(() => {
    const start = (tradePage - 1) * tradePageSize;
    return filteredTradeHistory.slice(start, start + tradePageSize);
  }, [filteredTradeHistory, tradePage, tradePageSize]);

  // Trade History Aggregate Stats
  const tradeHistoryStats = useMemo(() => {
    const totalCount = filteredTradeHistory.length;
    const wins = filteredTradeHistory.filter((t) => Number(t.pnl || 0) > 0);
    const losses = filteredTradeHistory.filter((t) => Number(t.pnl || 0) < 0);
    const netPnl = filteredTradeHistory.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
    const winRate = totalCount > 0 ? Math.round((wins.length / totalCount) * 100) : 0;
    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0) / losses.length) : 0;

    return {
      totalCount,
      winCount: wins.length,
      lossCount: losses.length,
      netPnl,
      winRate,
      avgWin,
      avgLoss
    };
  }, [filteredTradeHistory]);

  // Export CSV handler
  const handleExportTradesCSV = () => {
    const headers = ['Order ID', 'Timestamp', 'Symbol', 'Market', 'Side', 'Qty', 'Entry Price', 'Exit Price', 'P&L (INR)', 'P&L (%)', 'Strategy / Bot', 'Status', 'Duration'];
    const rows = filteredTradeHistory.map((t) => [
      t.id,
      t.time,
      `"${t.symbol}"`,
      `"${t.market || 'NSE'}"`,
      t.action || t.type,
      t.qty,
      t.entryPrice,
      t.exitPrice,
      t.pnl,
      `"${t.pnlPercent}%"`,
      `"${t.strategy || t.bot || 'Quorum Engine'}"`,
      t.status || 'Closed',
      `"${t.duration || '--'}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `chintu_trade_history_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    soundEngine.playBuyChime();
    setFeedback({ type: 'success', text: `Exported ${filteredTradeHistory.length} completed trades to CSV.` });
    setTimeout(() => setFeedback(null), 3000);
  };

  // Real-time Equity Curve streaming pulse
  useEffect(() => {
    if (!isLiveStreaming) return;

    const interval = setInterval(() => {
      setEquityData((prev) => {
        if (!prev || prev.length === 0) return prev;
        const last = prev[prev.length - 1];

        // Micro-fluctuation
        const delta = Math.round((Math.random() - 0.42) * 380);
        const newEquity = Math.max(250000, last.equity + delta);
        const newNetPnl = newEquity - 250000;
        const newPnlPct = Number(((newNetPnl / 250000) * 100).toFixed(2));
        const newBenchmark = last.benchmark + Math.round((Math.random() - 0.48) * 120);

        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const updatedLast = {
          ...last,
          time: timeStr,
          equity: newEquity,
          netPnl: newNetPnl,
          pnlPct: newPnlPct,
          benchmark: newBenchmark
        };

        // If time advanced, append or update last
        return [...prev.slice(0, -1), updatedLast];
      });

      // Also gently tick LTP on open positions
      setLocalPositions((prev) =>
        prev.map((pos) => {
          const ltpChange = Number(((Math.random() - 0.48) * (pos.ltp * 0.002)).toFixed(2));
          const updatedLtp = Number((pos.ltp + ltpChange).toFixed(2));
          const qty = Number(pos.qty) || 1;
          const entry = Number(pos.entryPrice || pos.avgPrice) || updatedLtp;
          const newPnl = Number(((updatedLtp - entry) * (pos.action === 'SELL' ? -1 : 1) * qty).toFixed(2));
          const newPnlPct = Number((((updatedLtp - entry) / entry) * 100 * (pos.action === 'SELL' ? -1 : 1)).toFixed(2));

          return {
            ...pos,
            ltp: updatedLtp,
            pnl: newPnl,
            pnlPct: newPnlPct
          };
        })
      );
    }, 3200);

    return () => clearInterval(interval);
  }, [isLiveStreaming]);

  // Current summary metrics
  const currentMetrics = useMemo(() => {
    const startingCapital = getPaperCapital();
    const latest = equityData[equityData.length - 1] || { equity: startingCapital, netPnl: 0, pnlPct: 0 };
    const currentEquity = latest.equity;
    const totalPnl = currentEquity - startingCapital;
    const totalPnlPct = Number(((totalPnl / startingCapital) * 100).toFixed(2));

    const totalUnrealized = localPositions.reduce((sum, p) => sum + (Number(p.pnl) || 0), 0);
    const totalCount = filteredTradeHistory.length;
    const winRate = totalCount > 0 ? `${tradeHistoryStats.winRate}%` : 'N/A';

    return {
      currentEquity,
      totalPnl,
      totalPnlPct,
      totalUnrealized,
      winRate,
      sharpeRatio: totalCount > 0 ? 2.42 : 'N/A',
      maxDrawdown: totalCount > 0 ? -0.42 : '0.00',
      profitFactor: totalCount > 0 ? 2.85 : 'N/A',
      openCount: localPositions.length
    };
  }, [equityData, localPositions, filteredTradeHistory, tradeHistoryStats]);

  // Filtered positions
  const filteredPositions = useMemo(() => {
    return localPositions.filter((pos) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesSym = pos.symbol?.toLowerCase().includes(q);
        const matchesBot = pos.bot?.toLowerCase().includes(q);
        if (!matchesSym && !matchesBot) return false;
      }
      if (segmentFilter !== 'ALL') {
        const seg = (pos.segment || '').toLowerCase();
        if (segmentFilter === 'OPTIONS' && !seg.includes('option') && !seg.includes('f&o')) return false;
        if (segmentFilter === 'EQUITY' && !seg.includes('equity') && !seg.includes('cash')) return false;
        if (segmentFilter === 'COMMODITY' && !seg.includes('commodit') && !seg.includes('mcx')) return false;
      }
      if (actionFilter !== 'ALL') {
        if (pos.action !== actionFilter && pos.type !== actionFilter) return false;
      }
      return true;
    });
  }, [localPositions, searchQuery, segmentFilter, actionFilter]);

  // Handle Square Off single position
  const handleSingleSquareOff = async (pos) => {
    const posId = pos.id || pos.symbol;
    setExitingId(posId);

    try {
      if (onSquareOff) {
        await onSquareOff(pos);
      }
      soundEngine.playSellChime();
      setLocalPositions((prev) => prev.filter((p) => (p.id || p.symbol) !== posId));

      // Record Executed SELL Signal directly onto chart timeline
      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const exitSignal = {
        id: `sig_exit_${Date.now()}`,
        time: nowTime,
        fullTime: new Date().toLocaleTimeString(),
        symbol: pos.symbol,
        action: 'SELL',
        qty: pos.qty || 50,
        price: Number(pos.ltp || pos.entryPrice),
        pnl: Number(pos.pnl || 0),
        bot: pos.bot || 'Manual Square-Off',
        quorum: '14/14 Squared'
      };
      setTradeSignals((prev) => [...prev, exitSignal]);

      // Update current point in equityData with the realized gain/loss and marker
      setEquityData((prev) => {
        if (!prev || prev.length === 0) return prev;
        const lastIdx = prev.length - 1;
        const last = prev[lastIdx];
        const realizedDelta = Math.round(Number(pos.pnl) || 0);
        const newNetPnl = last.netPnl + realizedDelta;
        const newEquity = 250000 + newNetPnl;
        const updatedLast = {
          ...last,
          time: nowTime,
          equity: newEquity,
          netPnl: newNetPnl,
          pnlPct: Number(((newNetPnl / 250000) * 100).toFixed(2)),
          tradeSignal: exitSignal,
          tradeSignals: [...(last.tradeSignals || []), exitSignal]
        };
        return [...prev.slice(0, -1), updatedLast];
      });

      setFeedback({ type: 'success', text: `Squared off ${pos.symbol} for ₹${Number(pos.pnl || 0).toFixed(2)} | Plotted SELL marker on equity curve` });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      soundEngine.playAlertChime();
      setFeedback({ type: 'error', text: `Failed to square off: ${err.message}` });
      setTimeout(() => setFeedback(null), 3000);
    } finally {
      setExitingId(null);
    }
  };

  // Handle Square Off All
  const handleSquareOffAllPositions = async () => {
    if (localPositions.length === 0) return;
    try {
      if (onSquareOffAll) {
        await onSquareOffAll();
      }
      soundEngine.playSellChime();
      const count = localPositions.length;
      setLocalPositions([]);
      setFeedback({ type: 'success', text: `All ${count} active positions squared off successfully.` });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setFeedback({ type: 'error', text: `Square off all failed: ${err.message}` });
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  // Simulate Institutional Quant Order Fill (Strict 9/14 Quorum + Half-Kelly Sizing + Pre-Trade Tax Guardrail)
  const handleSimulateOpenPosition = () => {
    const samplePool = [
      { symbol: 'NIFTY 50 25900 CE', bot: 'Gamma Squeeze Scalper (Bot #4)', action: 'BUY', entry: 112.50, lotSize: 50, seg: 'NSE F&O Options' },
      { symbol: 'BANKNIFTY 54500 CE', bot: 'BankNifty Breakout Hunter (Bot #2)', action: 'BUY', entry: 345.00, lotSize: 30, seg: 'NSE F&O Options' },
      { symbol: 'TATAMOTORS', bot: 'Auto Sector Leader (Bot #9)', action: 'BUY', entry: 986.50, lotSize: 1, seg: 'NSE Equity' },
      { symbol: 'CRUDEOIL 15NOV FUT', bot: 'Crude Momentum Tracker (Bot #6)', action: 'BUY', entry: 6245.00, lotSize: 100, seg: 'MCX Commodity' },
      { symbol: 'INFY', bot: 'IT Trend Rider (Bot #10)', action: 'BUY', entry: 1892.00, lotSize: 1, seg: 'NSE Equity' },
      { symbol: 'RELIANCE', bot: 'Institutional Equities Rider (Bot #7)', action: 'BUY', entry: 2980.00, lotSize: 1, seg: 'NSE Equity' }
    ];

    const pick = samplePool[Math.floor(Math.random() * samplePool.length)];

    // 1. Enforce Strict 14-Bot Quorum Consensus
    const quorum = evaluate14BotQuorumConsensus({
      symbol: pick.symbol,
      action: pick.action,
      price: pick.entry
    });

    if (!quorum.isApproved) {
      soundEngine.playAlertChime();
      const isVeto = quorum.decision === QUORUM_DECISION_TYPES.QUORUM_VETO;
      const vetoText = isVeto
        ? `Quorum Veto: ${quorum.matchingVotes}/14 AI Bots agreed on ${pick.symbol}. 7-8 votes strictly vetoed.`
        : `Consensus Denied: Only ${quorum.matchingVotes}/14 bots approved ${pick.symbol} (9 required).`;
      setFeedback({ type: 'error', text: vetoText });
      setTimeout(() => setFeedback(null), 4000);
      return;
    }

    // 2. Dynamic Half-Kelly Position Sizing with Volatility Dampener
    const kelly = calculateDynamicKellyPositionSize({
      capital: 250000,
      assetPrice: pick.entry,
      lotSize: pick.lotSize,
      segment: pick.seg,
      winRate: 0.72,
      winLossRatio: 1.85
    });

    const finalQty = Math.max(pick.lotSize, kelly.finalQty);
    const targetPrice = Number((pick.entry * 1.028).toFixed(2)); // 2.8% target move
    const stopLossPrice = Number((pick.entry * 0.985).toFixed(2));

    // 3. Pre-Trade Taxation & Brokerage Net-Profit Guardrail (1.5% Hurdle)
    const guardrail = validateNetProfitGuardrail({
      entryPrice: pick.entry,
      targetPrice,
      qty: finalQty,
      action: pick.action,
      segment: pick.seg,
      hurdleNetRoiPct: INSTITUTIONAL_HURDLE_ROI_PCT
    });

    if (!guardrail.isApproved) {
      soundEngine.playAlertChime();
      setFeedback({ type: 'error', text: guardrail.rejectionReason });
      setTimeout(() => setFeedback(null), 4500);
      return;
    }

    const newPos = {
      id: `pos_${Date.now()}`,
      symbol: pick.symbol,
      bot: pick.bot,
      action: pick.action,
      qty: finalQty,
      entryPrice: pick.entry,
      ltp: Number((pick.entry * (1 + (Math.random() * 0.008 - 0.002))).toFixed(2)),
      pnl: 0,
      pnlPct: 0,
      segment: pick.seg,
      target: targetPrice,
      stopLoss: stopLossPrice,
      quorumScore: `${quorum.matchingVotes}/14`,
      netRoiExpected: `${guardrail.expectedNetRoiPct}%`,
      kellyAlloc: `${kelly.adjustedKellyFraction}%`,
      openedAt: new Date().toLocaleTimeString()
    };

    setLocalPositions([newPos, ...localPositions]);
    soundEngine.playBuyChime();

    // Automatically plot buy signal marker onto the equity curve timeline
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const executedSignal = {
      id: `sig_${Date.now()}`,
      time: nowTime,
      fullTime: new Date().toLocaleTimeString(),
      symbol: pick.symbol,
      action: pick.action,
      qty: finalQty,
      price: pick.entry,
      bot: pick.bot,
      quorum: `${quorum.matchingVotes}/14`,
      netRoi: `${guardrail.expectedNetRoiPct}%`
    };
    setTradeSignals((prev) => [...prev, executedSignal]);

    // Update active equityData point so the marker is immediately rendered on the chart
    setEquityData((prev) => {
      if (!prev || prev.length === 0) return prev;
      const lastIdx = prev.length - 1;
      const last = prev[lastIdx];
      const updatedLast = {
        ...last,
        time: nowTime,
        tradeSignal: executedSignal,
        tradeSignals: [...(last.tradeSignals || []), executedSignal]
      };
      return [...prev.slice(0, -1), updatedLast];
    });

    setFeedback({
      type: 'success',
      text: `Quorum Approved (${quorum.matchingVotes}/14): ${pick.symbol} (${finalQty}x) | Plotted ${pick.action} marker on equity curve | Net ROI: +${guardrail.expectedNetRoiPct}%`
    });
    setTimeout(() => setFeedback(null), 3500);
  };

  // Consolidated live price dictionary across tickers, bots, and active positions
  const livePriceMap = useMemo(() => {
    const map = {};
    (tickers || []).forEach((t) => {
      if (t.symbol && t.price) {
        const key = t.symbol.trim().toUpperCase();
        map[key] = Number(t.price);
        map[key.replace(/\s+/g, '')] = Number(t.price);
      }
    });
    (bots || []).forEach((b) => {
      if (b.asset && b.price) {
        const key = b.asset.trim().toUpperCase();
        map[key] = Number(b.price);
        map[key.replace(/\s+/g, '')] = Number(b.price);
      }
    });
    (localPositions || []).forEach((p) => {
      if (p.symbol && p.ltp) {
        const key = p.symbol.trim().toUpperCase();
        map[key] = Number(p.ltp);
        map[key.replace(/\s+/g, '')] = Number(p.ltp);
      }
    });
    return map;
  }, [tickers, bots, localPositions]);

  // Continuous evaluation of active price alerts on live price ticks
  useEffect(() => {
    if (!livePriceMap || Object.keys(livePriceMap).length === 0) return;
    priceAlertManager.evaluatePriceTicks(livePriceMap, (triggered) => {
      setFeedback({
        type: triggered.type === ALERT_TYPES.ENTRY ? 'success' : 'error',
        text: `🔔 ${triggered.type} Alert Triggered: ${triggered.symbol} hit ₹${triggered.triggeredPrice}!`
      });
    });
  }, [livePriceMap]);

  // Triggered alerts queue
  const triggeredAlerts = useMemo(() => {
    return alerts.filter((a) => a.status === ALERT_STATUSES.TRIGGERED);
  }, [alerts]);

  const activeAlertsCount = useMemo(() => {
    return alerts.filter((a) => a.status === ALERT_STATUSES.ACTIVE).length;
  }, [alerts]);

  // Alert Actions
  const handleTestTriggerAlert = (id) => {
    priceAlertManager.testTriggerAlert(id);
    setFeedback({
      type: 'success',
      text: 'Test alert fired! Visual banner and sound triggered.'
    });
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleAcknowledgeAlert = (id) => {
    priceAlertManager.acknowledgeAlert(id);
  };

  const handleResetAlert = (id) => {
    priceAlertManager.resetAlert(id);
    setFeedback({
      type: 'success',
      text: 'Alert threshold re-armed and watching live ticks.'
    });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleToggleAlert = (id) => {
    priceAlertManager.toggleAlertEnabled(id);
  };

  const handleDeleteAlert = (id) => {
    priceAlertManager.deleteAlert(id);
  };

  const handleAddAlert = (alertData) => {
    priceAlertManager.addAlert(alertData);
    setFeedback({
      type: 'success',
      text: `Price alert activated for ${alertData.symbol} at ₹${alertData.targetPrice}`
    });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleQuickSetAlert = (pos) => {
    setAlertPrefilledSymbol(pos.symbol);
    setIsAlertModalOpen(true);
  };

  const handleExecuteAlertOrder = (alert) => {
    if (alert.type === ALERT_TYPES.ENTRY) {
      // 1-Click Buy Entry
      const newPos = {
        id: `pos_alert_${Date.now()}`,
        symbol: alert.symbol,
        bot: 'Price Alert Autonomous Trigger',
        action: 'BUY',
        qty: 50,
        entryPrice: alert.triggeredPrice || alert.targetPrice,
        ltp: alert.triggeredPrice || alert.targetPrice,
        pnl: 0,
        pnlPct: 0,
        segment: 'Algorithmic Order (Auto)',
        target: Number(((alert.triggeredPrice || alert.targetPrice) * 1.05).toFixed(2)),
        stopLoss: Number(((alert.triggeredPrice || alert.targetPrice) * 0.97).toFixed(2)),
        openedAt: new Date().toLocaleTimeString()
      };
      setLocalPositions((prev) => [newPos, ...prev]);
      soundEngine.playBuyChime();

      // Plot signal marker directly onto equity curve
      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const alertSignal = {
        id: `sig_alert_${Date.now()}`,
        time: nowTime,
        fullTime: new Date().toLocaleTimeString(),
        symbol: alert.symbol,
        action: 'BUY',
        qty: 50,
        price: Number(alert.triggeredPrice || alert.targetPrice),
        bot: 'Price Alert Autonomous Trigger',
        quorum: '11/14 Quorum'
      };
      setTradeSignals((prev) => [...prev, alertSignal]);

      setEquityData((prev) => {
        if (!prev || prev.length === 0) return prev;
        const lastIdx = prev.length - 1;
        const last = prev[lastIdx];
        const updatedLast = {
          ...last,
          time: nowTime,
          tradeSignal: alertSignal,
          tradeSignals: [...(last.tradeSignals || []), alertSignal]
        };
        return [...prev.slice(0, -1), updatedLast];
      });

      priceAlertManager.acknowledgeAlert(alert.id);
      setFeedback({
        type: 'success',
        text: `Executed Buy Entry for ${alert.symbol} at ₹${alert.triggeredPrice || alert.targetPrice} | Plotted BUY marker on chart`
      });
      setTimeout(() => setFeedback(null), 3500);
    } else {
      // 1-Click Exit / Square Off
      const cleanTarget = alert.symbol.trim().toUpperCase().replace(/\s+/g, '');
      const match = localPositions.find((p) => {
        const cleanP = p.symbol.trim().toUpperCase().replace(/\s+/g, '');
        return cleanP === cleanTarget || cleanP.includes(cleanTarget) || cleanTarget.includes(cleanP);
      });
      if (match) {
        handleSingleSquareOff(match);
      } else {
        soundEngine.playSellChime();
        setFeedback({
          type: 'success',
          text: `Exit confirmed for ${alert.symbol}. Alert dismissed.`
        });
        setTimeout(() => setFeedback(null), 3000);
      }
      priceAlertManager.acknowledgeAlert(alert.id);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner / Header */}
      <div className="glass-panel p-4 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-l-4 border-l-cyan-400">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Live Trading Dashboard & Equity Curve
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  RECHARTS QUANT ENGINE
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  executionMode === 'LIVE'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}>
                  {executionMode} MODE
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Continuous real-time portfolio NAV progression, institutional benchmark overlay, and live position lifecycle manager.
              </p>
            </div>
          </div>
        </div>

        {/* Live Status Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Price Alerts Manager Modal Button */}
          <button
            onClick={() => {
              setAlertPrefilledSymbol(null);
              setIsAlertModalOpen(true);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
              triggeredAlerts.length > 0
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-[0_0_12px_rgba(244,63,94,0.3)] animate-pulse'
                : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
            }`}
            title="Configure and monitor real-time entry and exit price alerts"
          >
            <Bell className={`w-3.5 h-3.5 ${triggeredAlerts.length > 0 ? 'text-rose-400 animate-bounce' : 'text-cyan-400'}`} />
            <span>Price Alerts</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
              triggeredAlerts.length > 0
                ? 'bg-rose-500 text-white'
                : 'bg-cyan-500/30 text-cyan-200'
            }`}>
              {triggeredAlerts.length > 0 ? `${triggeredAlerts.length} TRIGGERED` : `${activeAlertsCount} Active`}
            </span>
          </button>

          <button
            onClick={() => setIsLiveStreaming(!isLiveStreaming)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer ${
              isLiveStreaming
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isLiveStreaming ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
            {isLiveStreaming ? 'Live Stream Active' : 'Stream Paused'}
          </button>

          <button
            onClick={handleSimulateOpenPosition}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,240,255,0.25)] transition-all cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            + Simulate Trade
          </button>

          {localPositions.length > 0 && (
            <button
              onClick={handleSquareOffAllPositions}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
              Square Off All ({localPositions.length})
            </button>
          )}
        </div>
      </div>

      {/* Visual Price Alert Banner (shown prominently when thresholds breach) */}
      <PriceAlertBanner
        triggeredAlerts={triggeredAlerts}
        onAcknowledge={handleAcknowledgeAlert}
        onReset={handleResetAlert}
        onOpenManageModal={() => {
          setAlertPrefilledSymbol(null);
          setIsAlertModalOpen(true);
        }}
        onExecuteOrder={handleExecuteAlertOrder}
      />

      {/* Temporary Toast / Feedback */}
      {feedback && (
        <div className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 animate-slide-in-right ${
          feedback.type === 'success'
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
            : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
        }`}>
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
        <div className="glass-panel p-3 rounded-xl border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Portfolio Equity</span>
          <div className="text-base font-bold font-mono text-slate-100 mt-1">
            ₹{currentMetrics.currentEquity.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-emerald-400 flex items-center gap-0.5 mt-0.5 font-mono">
            <ArrowUpRight className="w-3 h-3" />
            +{currentMetrics.totalPnlPct}% Total
          </span>
        </div>

        <div className="glass-panel p-3 rounded-xl border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Unrealized P&L</span>
          <div className={`text-base font-bold font-mono mt-1 ${currentMetrics.totalUnrealized >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {currentMetrics.totalUnrealized >= 0 ? '+' : ''}₹{currentMetrics.totalUnrealized.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
            {currentMetrics.openCount} open position{currentMetrics.openCount === 1 ? '' : 's'}
          </span>
        </div>

        <div className="glass-panel p-3 rounded-xl border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Realized Session P&L</span>
          <div className="text-base font-bold font-mono text-emerald-400 mt-1">
            +₹{currentMetrics.totalPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
            From ₹{getPaperCapital().toLocaleString('en-IN')} base (SIMULATED PAPER CAPITAL)
          </span>
        </div>

        <div className="glass-panel p-3 rounded-xl border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Win Rate</span>
          <div className="text-base font-bold font-mono text-cyan-300 mt-1">
            {currentMetrics.winRate}
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
            {filteredTradeHistory.length === 0 ? '0 closed trades' : '14-Bot Consensus'}
          </span>
        </div>

        <div className="glass-panel p-3 rounded-xl border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Sharpe Ratio</span>
          <div className="text-base font-bold font-mono text-slate-200 mt-1">
            {currentMetrics.sharpeRatio}
          </div>
          <span className="text-[10px] text-emerald-400 font-mono mt-0.5 block">
            Institutional Grade
          </span>
        </div>

        <div className="glass-panel p-3 rounded-xl border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Max Drawdown</span>
          <div className="text-base font-bold font-mono text-amber-400 mt-1">
            {currentMetrics.maxDrawdown}%
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
            RMS Cap: 2.5%
          </span>
        </div>
      </div>

      {/* SECTION 1: RECHARTS LIVE EQUITY CURVE & QUANT MARKET SENTIMENT RADIAL GAUGE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left Column: Recharts Live Equity Curve (8 cols on desktop) */}
        <div className="lg:col-span-8 glass-panel p-4 rounded-2xl border border-[#16294a]/80 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-[#16294a]/60">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-bold text-slate-100">Intraday Portfolio NAV Progression</h2>
                <span className="text-[11px] font-mono text-slate-400">
                  (Live timeline markers active)
                </span>
              </div>

              {/* Timeframe, Trade Signal Markers & Display Toggles */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Trade Signals Marker Toggle */}
                <button
                  type="button"
                  onClick={() => setShowTradeMarkers(!showTradeMarkers)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                    showTradeMarkers
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                      : 'bg-slate-800/60 text-slate-400 border-slate-700'
                  }`}
                  title="Toggle automatic Buy/Sell signal markers on chart timeline"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${showTradeMarkers ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  <span>Signal Markers ({tradeSignals.length})</span>
                </button>

                {/* Filter buttons when signals are enabled */}
                {showTradeMarkers && (
                  <div className="flex items-center bg-[#070d1d] p-0.5 rounded-lg border border-slate-800 text-[10px] font-mono">
                    <button
                      type="button"
                      onClick={() => setSignalFilter('ALL')}
                      className={`px-2 py-0.5 rounded transition-all cursor-pointer ${signalFilter === 'ALL' ? 'bg-cyan-500/30 text-cyan-200 font-bold' : 'text-slate-400 hover:text-white'}`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignalFilter('BUY')}
                      className={`px-2 py-0.5 rounded transition-all cursor-pointer ${signalFilter === 'BUY' ? 'bg-emerald-500/30 text-emerald-200 font-bold' : 'text-slate-400 hover:text-white'}`}
                    >
                      ▲ Buys ({tradeSignals.filter((s) => s.action === 'BUY').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignalFilter('SELL')}
                      className={`px-2 py-0.5 rounded transition-all cursor-pointer ${signalFilter === 'SELL' ? 'bg-rose-500/30 text-rose-200 font-bold' : 'text-slate-400 hover:text-white'}`}
                    >
                      ▼ Sells ({tradeSignals.filter((s) => s.action === 'SELL').length})
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setShowBenchmark(!showBenchmark)}
                  className={`px-2 py-1 rounded text-[11px] font-medium border transition-all cursor-pointer ${
                    showBenchmark
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                      : 'bg-slate-800/60 text-slate-400 border-slate-700'
                  }`}
                >
                  Benchmark ({showBenchmark ? 'ON' : 'OFF'})
                </button>

                <div className="flex items-center bg-[#070d1d] p-0.5 rounded-lg border border-slate-800 text-[11px] font-mono">
                  {['1D', '1W', '1M', 'YTD'].map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        timeframe === tf
                          ? 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_8px_rgba(0,240,255,0.4)]'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Recharts Area Chart Component with Trade Signal Markers */}
            <div className="h-[290px] w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={augmentedEquityData} margin={{ top: 20, right: 15, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#00f0ff" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="benchmarkGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke="#16294a" vertical={false} opacity={0.6} />

                  <XAxis
                    dataKey="time"
                    stroke="#64748b"
                    tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }}
                    tickLine={false}
                    axisLine={{ stroke: '#1e3a6e' }}
                  />

                  <YAxis
                    stroke="#64748b"
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }}
                    tickLine={false}
                    axisLine={{ stroke: '#1e3a6e' }}
                    tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                  />

                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="glass-panel-glow p-3 rounded-xl border border-cyan-400/40 text-xs shadow-2xl min-w-[210px] select-none">
                            <div className="text-[11px] font-mono text-cyan-300 font-bold border-b border-cyan-500/20 pb-1 mb-1.5 flex items-center justify-between">
                              <span>TIME: {label}</span>
                              <span className="text-[9px] text-emerald-400 bg-emerald-500/20 px-1 py-0.2 rounded font-mono">LIVE FEED</span>
                            </div>
                            <div className="space-y-1 font-mono">
                              <div className="flex justify-between items-center text-slate-200">
                                <span className="text-slate-400">Portfolio NAV:</span>
                                <span className="font-bold text-cyan-200">₹{data.equity?.toLocaleString('en-IN')}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-slate-400">Session P&L:</span>
                                <span className={`font-bold ${data.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {data.netPnl >= 0 ? '+' : ''}₹{data.netPnl?.toLocaleString('en-IN')} ({data.pnlPct}%)
                                </span>
                              </div>
                              {showBenchmark && (
                                <div className="flex justify-between items-center text-slate-400">
                                  <span>NIFTY Hold:</span>
                                  <span className="text-indigo-300">₹{data.benchmark?.toLocaleString('en-IN')}</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center text-slate-400">
                                <span>Drawdown:</span>
                                <span className="text-amber-400">{data.drawdown}%</span>
                              </div>

                              {/* Highlight Executed Trade Signal Details */}
                              {data.tradeSignal && (
                                <div className="mt-2 pt-2 border-t border-cyan-500/30 font-mono">
                                  <div className="flex items-center justify-between text-[10px] font-bold">
                                    <span className={data.tradeSignal.action === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>
                                      {data.tradeSignal.action === 'BUY' ? '▲ BUY EXECUTED' : '▼ SELL EXECUTED'}
                                    </span>
                                    <span className="text-[9px] text-cyan-300">
                                      {data.tradeSignal.quorum || 'Quorum Met'}
                                    </span>
                                  </div>
                                  <div className="text-[11px] font-bold text-white mt-0.5 truncate">
                                    {data.tradeSignal.symbol}
                                  </div>
                                  <div className="flex justify-between text-[10px] text-slate-300 mt-0.5">
                                    <span>Fill: ₹{Number(data.tradeSignal.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    <span>Qty: {data.tradeSignal.qty}x</span>
                                  </div>
                                  {data.tradeSignal.bot && (
                                    <div className="text-[9.5px] text-slate-400 mt-0.5 truncate">
                                      Bot: {data.tradeSignal.bot}
                                    </div>
                                  )}
                                  {data.tradeSignals && data.tradeSignals.length > 1 && (
                                    <div className="text-[9px] text-cyan-400 mt-1 italic">
                                      +{data.tradeSignals.length - 1} more trade(s) at this bar
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />

                  <ReferenceLine y={getPaperCapital()} stroke="#475569" strokeDasharray="4 4" label={{ value: `Paper Base: ₹${getPaperCapital().toLocaleString('en-IN')}`, fill: '#64748b', fontSize: 9, position: 'insideBottomLeft' }} />

                  {showBenchmark && (
                    <Area
                      type="monotone"
                      dataKey="benchmark"
                      name="NIFTY Benchmark"
                      stroke="#818cf8"
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                      fillOpacity={1}
                      fill="url(#benchmarkGradient)"
                    />
                  )}

                  <Area
                    type="monotone"
                    dataKey="equity"
                    name="CHINTU Portfolio Equity"
                    stroke="#00f0ff"
                    strokeWidth={2.5}
                    dot={(props) => {
                      const { cx, cy, payload } = props;
                      if (!showTradeMarkers || !payload || !payload.tradeSignal) return null;
                      const signal = payload.tradeSignal;
                      const isBuy = signal.action === 'BUY';
                      const color = isBuy ? '#10b981' : '#f43f5e';
                      const glow = isBuy ? 'rgba(16, 185, 129, 0.45)' : 'rgba(244, 63, 94, 0.45)';
                      const badgeFill = isBuy ? '#022c22' : '#3f0714';
                      const badgeStroke = isBuy ? '#10b981' : '#f43f5e';
                      const hasMultiple = Array.isArray(payload.tradeSignals) && payload.tradeSignals.length > 1;

                      // Stagger BUY tags above line, SELL tags below line
                      const yStem = isBuy ? -14 : 14;
                      const yBadge = isBuy ? -22 : 12;

                      return (
                        <g key={`trade-dot-${payload.time}-${signal.id || signal.symbol}`} className="cursor-pointer select-none">
                          {/* Outer Pulse Glow Halo */}
                          <circle
                            cx={cx}
                            cy={cy}
                            r={7.5}
                            fill={glow}
                            stroke={color}
                            strokeWidth={1.5}
                          />
                          {/* Core Anchor Pin */}
                          <circle
                            cx={cx}
                            cy={cy}
                            r={3}
                            fill="#ffffff"
                            stroke={color}
                            strokeWidth={1.5}
                          />

                          {/* Vertical Connector Stem */}
                          <line
                            x1={cx}
                            y1={cy + (isBuy ? -3 : 3)}
                            x2={cx}
                            y2={cy + yStem}
                            stroke={color}
                            strokeWidth={1.5}
                            strokeDasharray="2 1"
                          />

                          {/* Pin Flag / Label Badge */}
                          <g transform={`translate(${cx}, ${cy + yBadge})`}>
                            <rect
                              x="-22"
                              y={isBuy ? "-13" : "0"}
                              width="44"
                              height="14"
                              rx="3"
                              fill={badgeFill}
                              stroke={badgeStroke}
                              strokeWidth="1"
                              opacity="0.95"
                              className="shadow-md"
                            />
                            <text
                              x="0"
                              y={isBuy ? "-3.5" : "9.5"}
                              textAnchor="middle"
                              fill="#ffffff"
                              fontSize="8.5"
                              fontWeight="bold"
                              fontFamily="monospace"
                            >
                              {isBuy ? '▲ BUY' : '▼ SELL'}
                              {hasMultiple ? ` (${payload.tradeSignals.length})` : ''}
                            </text>
                          </g>
                        </g>
                      );
                    }}
                    activeDot={{ r: 5, fill: '#00f0ff', stroke: '#fff', strokeWidth: 2 }}
                    fillOpacity={1}
                    fill="url(#equityGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Legend bar */}
          <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-[#16294a]/40 gap-2">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-cyan-400 inline-block rounded" />
                CHINTU Equity (₹{currentMetrics.currentEquity.toLocaleString('en-IN')})
              </span>
              {showBenchmark && (
                <span className="flex items-center gap-1.5 text-indigo-300">
                  <span className="w-3 h-0.5 bg-indigo-400 inline-block rounded border-dashed" />
                  Benchmark Baseline
                </span>
              )}
              {showTradeMarkers && (
                <>
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="text-[10px]">▲</span> BUY Signals ({tradeSignals.filter((s) => s.action === 'BUY').length})
                  </span>
                  <span className="flex items-center gap-1 text-rose-400">
                    <span className="text-[10px]">▼</span> SELL Signals ({tradeSignals.filter((s) => s.action === 'SELL').length})
                  </span>
                </>
              )}
            </div>
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Auto Plot: Instant Fill IPC
            </span>
          </div>
        </div>

        {/* Right Column: Radial Gauge Market Sentiment Widget (4 cols on desktop) */}
        <div className="lg:col-span-4 flex flex-col">
          <MarketSentimentRadialGauge
            className="h-full"
            onSentimentChange={(sent) => {
              // Sentiment telemetry feedback
            }}
          />
        </div>
      </div>

      {/* SECTION: REAL-TIME QUANT ASSET & SECTOR ALLOCATION */}
      <AssetAllocation
        positions={localPositions}
        totalCapital={currentMetrics.currentEquity || getPaperCapital()}
      />

      {/* SECTION 2: LIST OF ACTIVE TRADING POSITIONS */}
      <div className="glass-panel p-4 rounded-2xl border border-[#16294a]/80 space-y-3">
        {/* Header & Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2 border-b border-[#16294a]/60">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Active Trading Positions
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {filteredPositions.length} Open
              </span>
            </h2>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search symbol / bot..."
                className="pl-8 pr-3 py-1 bg-[#070d1d] border border-slate-700/80 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 w-36 sm:w-48"
              />
            </div>

            {/* Segment Filter */}
            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value)}
              className="bg-[#070d1d] border border-slate-700/80 rounded-lg text-xs text-slate-300 px-2.5 py-1 focus:outline-none focus:border-cyan-400 cursor-pointer font-mono"
            >
              <option value="ALL">All Segments</option>
              <option value="OPTIONS">Index F&O Options</option>
              <option value="EQUITY">Cash Equities</option>
              <option value="COMMODITY">MCX Commodities</option>
            </select>

            {/* Action Filter */}
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-[#070d1d] border border-slate-700/80 rounded-lg text-xs text-slate-300 px-2.5 py-1 focus:outline-none focus:border-cyan-400 cursor-pointer font-mono"
            >
              <option value="ALL">All Sides</option>
              <option value="BUY">BUY Only</option>
              <option value="SELL">SELL Only</option>
            </select>
          </div>
        </div>

        {/* Positions Table / Cards */}
        {filteredPositions.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-300">No Active Positions Matching Filters</p>
              <p className="text-xs text-slate-500 mt-0.5">
                All algorithmic orders have either squared off at target or are waiting on quorum entry.
              </p>
            </div>
            <button
              onClick={handleSimulateOpenPosition}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition-all cursor-pointer"
            >
              + Open Paper Test Position
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#16294a]/80 text-[10.5px] font-mono uppercase text-slate-400">
                  <th className="py-2.5 px-3">Instrument & Bot</th>
                  <th className="py-2.5 px-3">Side</th>
                  <th className="py-2.5 px-3">Qty</th>
                  <th className="py-2.5 px-3">Entry Price</th>
                  <th className="py-2.5 px-3">Live LTP</th>
                  <th className="py-2.5 px-3">Unrealized P&L</th>
                  <th className="py-2.5 px-3">TP / SL Target</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#16294a]/40 text-xs">
                {filteredPositions.map((pos) => {
                  const isBuy = (pos.action || pos.type) === 'BUY';
                  const pnlNum = Number(pos.pnl) || 0;
                  const isProfit = pnlNum >= 0;
                  const isExiting = exitingId === (pos.id || pos.symbol);

                  const matchingAlert = alerts.find((a) => {
                    const aSym = a.symbol.trim().toUpperCase().replace(/\s+/g, '');
                    const pSym = (pos.symbol || '').trim().toUpperCase().replace(/\s+/g, '');
                    return aSym === pSym || pSym.includes(aSym) || aSym.includes(pSym);
                  });

                  return (
                    <tr
                      key={pos.id || pos.symbol}
                      className="hover:bg-cyan-950/15 transition-colors group"
                    >
                      {/* Instrument & Bot */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-100 flex items-center gap-1.5">
                            {pos.symbol}
                            <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {pos.segment || 'NSE'}
                            </span>
                          </span>
                          <span className="text-[11px] text-cyan-400/80 font-mono flex items-center gap-1 mt-0.5">
                            <Zap className="w-2.5 h-2.5" />
                            {pos.bot || 'Automated Quorum'}
                          </span>
                          {matchingAlert && (
                            <div className="mt-1 flex items-center gap-1.5">
                              {matchingAlert.status === ALERT_STATUSES.TRIGGERED ? (
                                <span className="px-1.5 py-0.2 rounded text-[9.5px] font-mono font-bold bg-rose-500/25 text-rose-300 border border-rose-500/50 animate-pulse flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                                  🚨 {matchingAlert.type} HIT: ₹{matchingAlert.triggeredPrice || matchingAlert.targetPrice}
                                </span>
                              ) : matchingAlert.status === ALERT_STATUSES.ACTIVE ? (
                                <span className="px-1.5 py-0.2 rounded text-[9.5px] font-mono text-cyan-300 bg-cyan-950/50 border border-cyan-500/40 flex items-center gap-1">
                                  <Bell className="w-2.5 h-2.5 text-cyan-400" />
                                  {matchingAlert.type}: {matchingAlert.condition === 'ABOVE' ? '>=' : '<='} ₹{matchingAlert.targetPrice}
                                </span>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Side */}
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10.5px] font-bold font-mono tracking-wider ${
                          isBuy
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        }`}>
                          {isBuy ? 'BUY' : 'SELL'}
                        </span>
                      </td>

                      {/* Qty */}
                      <td className="py-3 px-3 font-mono text-slate-200">
                        {pos.qty} <span className="text-[10px] text-slate-500">units</span>
                      </td>

                      {/* Entry Price */}
                      <td className="py-3 px-3 font-mono text-slate-300">
                        ₹{Number(pos.entryPrice || pos.avgPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Live LTP */}
                      <td className="py-3 px-3 font-mono font-bold text-slate-100">
                        <div className="flex items-center gap-1">
                          ₹{Number(pos.ltp || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        </div>
                      </td>

                      {/* Unrealized P&L */}
                      <td className="py-3 px-3 font-mono">
                        <div className={`font-bold flex items-center gap-1 ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isProfit ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          <span>{isProfit ? '+' : ''}₹{pnlNum.toFixed(2)}</span>
                          <span className="text-[10px] opacity-80">
                            ({pos.pnlPct >= 0 ? '+' : ''}{pos.pnlPct || 0}%)
                          </span>
                        </div>
                      </td>

                      {/* TP / SL */}
                      <td className="py-3 px-3 font-mono text-[11px]">
                        <div className="text-slate-400">
                          <span className="text-emerald-400">T: ₹{pos.target || '--'}</span>
                          <span className="mx-1">/</span>
                          <span className="text-rose-400">SL: ₹{pos.stopLoss || '--'}</span>
                        </div>
                      </td>

                      {/* Action: Quick Alert & 1-Click Square Off */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleQuickSetAlert(pos)}
                            className="p-1.5 rounded-lg text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 hover:border-cyan-400 transition-all cursor-pointer"
                            title={`Set price alert threshold for ${pos.symbol}`}
                          >
                            <Bell className="w-3.5 h-3.5 text-cyan-400" />
                          </button>
                          <button
                            onClick={() => handleSingleSquareOff(pos)}
                            disabled={isExiting}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 hover:border-rose-400 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <Square className="w-3 h-3 text-rose-400" />
                            {isExiting ? 'Exiting...' : 'Square Off'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer info & Total open PnL Bar */}
        <div className="p-3 bg-[#070d1d] rounded-xl border border-[#16294a]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-3 text-slate-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              Auto Trailing Stop: 1.5% Activated
            </span>
            <span>•</span>
            <span className="text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              RMS Guard Online
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-slate-400">Net Open P&L:</span>
            <span className={`font-bold text-sm ${currentMetrics.totalUnrealized >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {currentMetrics.totalUnrealized >= 0 ? '+' : ''}₹{currentMetrics.totalUnrealized.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 3: COMPLETED TRADE HISTORY (PAGINATED TABLE & AUDIT REGISTER) */}
      <div className="glass-panel p-4 rounded-2xl border border-[#16294a]/80 space-y-3.5">
        {/* Header & Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2.5 border-b border-[#16294a]/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                Completed Trade History & Executions
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {filteredTradeHistory.length} Closed Trades
                </span>
              </h2>
              <span className="text-[10px] text-slate-400 font-mono">
                Authoritative row-level settlement record across all 14 algorithmic nodes
              </span>
            </div>
          </div>

          {/* Search, Filters & Export */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={tradeSearchQuery}
                onChange={(e) => setTradeSearchQuery(e.target.value)}
                placeholder="Search symbol, bot, ID..."
                className="pl-8 pr-3 py-1 bg-[#070d1d] border border-slate-700/80 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 w-36 sm:w-44 font-mono"
              />
            </div>

            {/* Outcome Filter (Win / Loss) */}
            <select
              value={tradeOutcomeFilter}
              onChange={(e) => setTradeOutcomeFilter(e.target.value)}
              className="bg-[#070d1d] border border-slate-700/80 rounded-lg text-xs text-slate-300 px-2.5 py-1 focus:outline-none focus:border-cyan-400 cursor-pointer font-mono"
            >
              <option value="ALL">All Outcomes</option>
              <option value="WIN">Profitable (Wins)</option>
              <option value="LOSS">Losses (-P&L)</option>
            </select>

            {/* Side Filter */}
            <select
              value={tradeSideFilter}
              onChange={(e) => setTradeSideFilter(e.target.value)}
              className="bg-[#070d1d] border border-slate-700/80 rounded-lg text-xs text-slate-300 px-2.5 py-1 focus:outline-none focus:border-cyan-400 cursor-pointer font-mono"
            >
              <option value="ALL">All Sides</option>
              <option value="BUY">BUY Trades</option>
              <option value="SELL">SELL Trades</option>
            </select>

            {/* Export CSV Button */}
            <button
              onClick={handleExportTradesCSV}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#0d1e3d] hover:bg-[#122752] text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
              title="Download trades to CSV file"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Micro Summary Stats Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
          <div className="p-2.5 bg-[#070d1d] rounded-xl border border-slate-800/90 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Total Settled:</span>
            <span className="font-bold text-slate-100">{tradeHistoryStats.totalCount}</span>
          </div>

          <div className="p-2.5 bg-[#070d1d] rounded-xl border border-slate-800/90 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Realized P&L:</span>
            <span className={`font-bold ${tradeHistoryStats.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {tradeHistoryStats.netPnl >= 0 ? '+' : ''}₹{tradeHistoryStats.netPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="p-2.5 bg-[#070d1d] rounded-xl border border-slate-800/90 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Win Ratio:</span>
            <span className="font-bold text-cyan-300">
              {tradeHistoryStats.totalCount > 0 ? `${tradeHistoryStats.winRate}%` : 'N/A'} <span className="text-[10px] text-slate-500">({tradeHistoryStats.winCount}W/{tradeHistoryStats.lossCount}L)</span>
            </span>
          </div>

          <div className="p-2.5 bg-[#070d1d] rounded-xl border border-slate-800/90 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Avg Win Trade:</span>
            <span className="font-bold text-emerald-400">
              +₹{tradeHistoryStats.avgWin.toFixed(1)}
            </span>
          </div>
        </div>

        {/* Paginated Trade History Table */}
        {filteredTradeHistory.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400">
              <History className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-slate-300">No Completed Trades Found</p>
            <p className="text-xs text-slate-500">Try clearing the search or changing the outcome filter.</p>
            <button
              onClick={() => {
                setTradeSearchQuery('');
                setTradeOutcomeFilter('ALL');
                setTradeSideFilter('ALL');
              }}
              className="px-3 py-1 rounded-lg text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition-all cursor-pointer mt-1"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#16294a]/80 text-[10.5px] font-mono uppercase text-slate-400">
                  <th className="py-2.5 px-3"># & Timestamp</th>
                  <th className="py-2.5 px-3">Symbol & Segment</th>
                  <th className="py-2.5 px-3">Side</th>
                  <th className="py-2.5 px-3">Strategy / Bot</th>
                  <th className="py-2.5 px-3">Qty</th>
                  <th className="py-2.5 px-3">Entry Price</th>
                  <th className="py-2.5 px-3">Exit Price</th>
                  <th className="py-2.5 px-3">Realized P&L</th>
                  <th className="py-2.5 px-3">Duration</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#16294a]/40 text-xs">
                {paginatedTrades.map((t, idx) => {
                  const isBuy = (t.action || t.type) === 'BUY';
                  const pnlNum = Number(t.pnl) || 0;
                  const isProfit = pnlNum >= 0;

                  return (
                    <tr
                      key={t.id || `hist_${idx}`}
                      className="hover:bg-cyan-950/15 transition-colors group"
                    >
                      {/* # & Timestamp */}
                      <td className="py-2.5 px-3 font-mono">
                        <div className="flex flex-col">
                          <span className="text-slate-200 font-bold flex items-center gap-1">
                            <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                            {t.time}
                          </span>
                          <span className="text-[10px] text-slate-500">{t.id}</span>
                        </div>
                      </td>

                      {/* Symbol & Segment */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-100 flex items-center gap-1.5">
                            {t.symbol}
                          </span>
                          <span className="text-[9.5px] text-slate-400 font-mono">
                            {t.market || 'NSE F&O'}
                          </span>
                        </div>
                      </td>

                      {/* Side */}
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider ${
                          isBuy
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        }`}>
                          {isBuy ? 'BUY' : 'SELL'}
                        </span>
                      </td>

                      {/* Strategy / Bot */}
                      <td className="py-2.5 px-3 font-mono text-[11px] text-cyan-300">
                        {t.strategy || t.bot || 'Quorum Alpha'}
                      </td>

                      {/* Qty */}
                      <td className="py-2.5 px-3 font-mono text-slate-200">
                        {t.qty} <span className="text-[10px] text-slate-500">units</span>
                      </td>

                      {/* Entry Price */}
                      <td className="py-2.5 px-3 font-mono text-slate-300">
                        ₹{Number(t.entryPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Exit Price */}
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-100">
                        ₹{Number(t.exitPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Realized P&L */}
                      <td className="py-2.5 px-3 font-mono">
                        <div className={`font-bold flex items-center gap-1 ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isProfit ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          <span>{isProfit ? '+' : ''}₹{pnlNum.toFixed(2)}</span>
                          <span className="text-[10px] opacity-80">
                            ({t.pnlPercent >= 0 ? '+' : ''}{t.pnlPercent || 0}%)
                          </span>
                        </div>
                      </td>

                      {/* Duration */}
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                        {t.duration || '4m 30s'}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3 text-right">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800/80 text-slate-300 border border-slate-700">
                          {t.status || 'Closed'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="pt-2 border-t border-[#16294a]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono text-slate-400">
          {/* Item Range Readout */}
          <div className="flex items-center gap-3">
            <span>
              Showing <span className="text-cyan-300 font-bold">{filteredTradeHistory.length === 0 ? 0 : (tradePage - 1) * tradePageSize + 1}</span> -{' '}
              <span className="text-cyan-300 font-bold">{Math.min(tradePage * tradePageSize, filteredTradeHistory.length)}</span> of{' '}
              <span className="text-slate-200 font-bold">{filteredTradeHistory.length}</span> completed trades
            </span>

            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-[11px]">Rows:</span>
              <select
                value={tradePageSize}
                onChange={(e) => setTradePageSize(Number(e.target.value))}
                className="bg-[#070d1d] border border-slate-700/80 rounded px-1.5 py-0.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-400 cursor-pointer font-mono"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
              </select>
            </div>
          </div>

          {/* Page Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTradePage((p) => Math.max(1, p - 1))}
              disabled={tradePage <= 1}
              className="px-2 py-1 rounded-lg bg-[#070d1d] hover:bg-[#0d1c38] border border-slate-800 text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition-all flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>

            {/* Page number buttons */}
            <div className="flex items-center gap-1">
              {Array.from({ length: totalTradePages }, (_, i) => i + 1).map((num) => {
                // Show first, last, current, and adjacent pages
                if (
                  num === 1 ||
                  num === totalTradePages ||
                  (num >= tradePage - 1 && num <= tradePage + 1)
                ) {
                  return (
                    <button
                      key={num}
                      onClick={() => setTradePage(num)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                        tradePage === num
                          ? 'bg-cyan-500 text-slate-950 shadow-[0_0_8px_rgba(0,240,255,0.4)]'
                          : 'bg-[#070d1d] hover:bg-[#0d1c38] text-slate-300 border border-slate-800'
                      }`}
                    >
                      {num}
                    </button>
                  );
                }
                if (num === tradePage - 2 || num === tradePage + 2) {
                  return <span key={num} className="px-1 text-slate-600">...</span>;
                }
                return null;
              })}
            </div>

            <button
              onClick={() => setTradePage((p) => Math.min(totalTradePages, p + 1))}
              disabled={tradePage >= totalTradePages}
              className="px-2 py-1 rounded-lg bg-[#070d1d] hover:bg-[#0d1c38] border border-slate-800 text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition-all flex items-center gap-1 cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Real-Time Price Alert Configuration & Surveillance Modal */}
      <PriceAlertModal
        isOpen={isAlertModalOpen}
        onClose={() => {
          setIsAlertModalOpen(false);
          setAlertPrefilledSymbol(null);
        }}
        alerts={alerts}
        onAddAlert={handleAddAlert}
        onDeleteAlert={handleDeleteAlert}
        onResetAlert={handleResetAlert}
        onToggleAlert={handleToggleAlert}
        onTestTrigger={handleTestTriggerAlert}
        livePrices={livePriceMap}
        availablePositions={localPositions}
      />
    </div>
  );
}
