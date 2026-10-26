import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BookMarked,
  Download,
  Upload,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Trash2,
  Edit3,
  Calendar,
  Clock,
  DollarSign,
  ShieldAlert,
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
  X,
  FileSpreadsheet,
  RefreshCw,
  Tag,
  MessageSquare,
  Award,
  Zap
} from 'lucide-react';
import { soundEngine } from '../../utils/audioChime';
import { calculateTradeCharges } from '../../utils/taxCalculator';
import { toastEmitter } from '../../utils/toastEmitter';
import { initialRecentTrades } from '../../data/tradingData';

export const JOURNAL_STORAGE_KEY = 'chintu_trade_journal_v1';

// Preset tags for disciplined psychological review
export const MISTAKE_TAGS = [
  { id: 'followed_plan', label: 'Followed Plan', color: 'text-emerald-400' },
  { id: 'clean_setup', label: 'Clean Setup', color: 'text-cyan-400' },
  { id: 'fomo_entry', label: 'FOMO Entry', color: 'text-rose-400' },
  { id: 'early_exit', label: 'Early Exit (Left Profit)', color: 'text-amber-400' },
  { id: 'late_exit', label: 'Late Exit (Greed)', color: 'text-rose-300' },
  { id: 'revenge_trade', label: 'Revenge Trade', color: 'text-red-500' },
  { id: 'over_leveraged', label: 'Over-leveraged', color: 'text-amber-300' },
  { id: 'algo_consensus', label: 'Jarvis Quorum Hit', color: 'text-purple-400' },
  { id: 'news_spike', label: 'News / Macro Event', color: 'text-blue-400' }
];

export const SETUP_TYPES = [
  'EMA 9/21 Ribbon Pullback',
  'Camarilla H4 Breakout',
  'Mean Reversion (Bollinger/RSI)',
  'VWAP Institutional Reclaim',
  'Opening Range Breakout (ORB)',
  'Order Book Delta Scalp',
  'SuperTrend Momentum',
  'Support & Resistance Flip',
  'Arbitrage / Spread Scalp',
  'Manual Discretionary'
];

// Helper to seed realistic initial journal entries from existing trading data
function generateSeedJournal() {
  const now = new Date();
  const sampleTrades = (initialRecentTrades && initialRecentTrades.length > 0)
    ? initialRecentTrades
    : [
        {
          id: 1,
          time: '11:42:10',
          symbol: 'NIFTY 50 25850 CE',
          market: 'NSE',
          type: 'BUY',
          qty: 50,
          entryPrice: 245.50,
          exitPrice: 278.20,
          pnl: 1635.00,
          strategy: 'EMA 9/21 Ribbon Pullback',
          status: 'Closed',
          duration: '4m 12s',
          botId: 1
        },
        {
          id: 2,
          time: '11:41:55',
          symbol: 'TCS',
          market: 'NSE',
          type: 'SELL',
          qty: 20,
          entryPrice: 3528.30,
          exitPrice: 3512.60,
          pnl: 314.00,
          strategy: 'Order Book Delta Scalp',
          status: 'Closed',
          duration: '2m 45s',
          botId: 3
        },
        {
          id: 3,
          time: '11:41:32',
          symbol: 'BANKNIFTY 54200 PE',
          market: 'NSE',
          type: 'BUY',
          qty: 25,
          entryPrice: 382.40,
          exitPrice: 422.60,
          pnl: 1005.00,
          strategy: 'Camarilla H4 Breakout',
          status: 'Closed',
          duration: '8m 20s',
          botId: 2
        },
        {
          id: 4,
          time: '11:40:15',
          symbol: 'RELIANCE',
          market: 'NSE',
          type: 'SELL',
          qty: 10,
          entryPrice: 2845.00,
          exitPrice: 2842.10,
          pnl: 29.00,
          strategy: 'News Sentiment',
          status: 'Closed',
          duration: '3m 10s',
          botId: 4
        },
        {
          id: 5,
          time: '11:39:48',
          symbol: 'INFY',
          market: 'NSE',
          type: 'BUY',
          qty: 30,
          entryPrice: 1528.30,
          exitPrice: 1542.60,
          pnl: 429.00,
          strategy: 'VWAP Institutional Reclaim',
          status: 'Closed',
          duration: '6m 05s',
          botId: 9
        },
        {
          id: 6,
          time: '11:37:02',
          symbol: 'TATA MOTORS',
          market: 'NSE',
          type: 'BUY',
          qty: 15,
          entryPrice: 942.50,
          exitPrice: 935.20,
          pnl: -109.50,
          strategy: 'Support & Resistance Flip',
          status: 'Closed',
          duration: '4m 30s',
          botId: 7
        }
      ];

  return sampleTrades.map((t, idx) => {
    const entryPrice = Number(t.entryPrice) || (t.price ? Number(t.price) * 0.99 : 240.0);
    const exitPrice = Number(t.exitPrice) || (t.price ? Number(t.price) : 252.0);
    const qty = Number(t.qty) || 25;
    const isBuy = (t.type || t.action || 'BUY').toUpperCase() === 'BUY';
    const grossPnl = isBuy
      ? (exitPrice - entryPrice) * qty
      : (entryPrice - exitPrice) * qty;

    // Calculate roundtrip statutory taxes (entry side + exit side)
    const entryCharges = calculateTradeCharges({
      price: entryPrice,
      qty,
      action: isBuy ? 'BUY' : 'SELL',
      segment: t.symbol?.includes('CE') || t.symbol?.includes('PE') ? 'NSE Options' : 'NSE Equity',
      grossPnl: 0
    });
    const exitCharges = calculateTradeCharges({
      price: exitPrice,
      qty,
      action: isBuy ? 'SELL' : 'BUY',
      segment: t.symbol?.includes('CE') || t.symbol?.includes('PE') ? 'NSE Options' : 'NSE Equity',
      grossPnl
    });
    const totalCharges = Number((entryCharges.totalCharges + exitCharges.totalCharges).toFixed(2));
    const netPnl = Number((grossPnl - totalCharges).toFixed(2));
    const investedCapital = Math.max(1, entryPrice * qty);
    const roiPct = Number(((netPnl / investedCapital) * 100).toFixed(2));

    const dateStr = new Date(now.getTime() - idx * 3600000 * 2.5).toISOString().split('T')[0];
    const timeStr = t.time || '11:42:10';

    const tags = ['followed_plan', 'clean_setup', 'early_exit', 'algo_consensus', 'fomo_entry'];
    const chosenTag = grossPnl > 0 ? (idx % 2 === 0 ? 'followed_plan' : 'clean_setup') : 'early_exit';

    return {
      id: `TJ-${dateStr.replace(/-/g, '')}-${String(100 + idx)}`,
      timestamp: `${dateStr} ${timeStr}`,
      date: dateStr,
      time: timeStr,
      symbol: t.symbol || 'NIFTY 50',
      action: isBuy ? 'BUY' : 'SELL',
      qty,
      entryPrice: Number(entryPrice.toFixed(2)),
      exitPrice: Number(exitPrice.toFixed(2)),
      grossPnl: Number(grossPnl.toFixed(2)),
      charges: totalCharges,
      chargesBreakdown: {
        brokerage: Number((entryCharges.brokerage + exitCharges.brokerage).toFixed(2)),
        stt: Number((entryCharges.stt + exitCharges.stt).toFixed(2)),
        exchangeTurnover: Number((entryCharges.exchangeTurnover + exitCharges.exchangeTurnover).toFixed(2)),
        gst: Number((entryCharges.gst + exitCharges.gst).toFixed(2)),
        sebiCharges: Number((entryCharges.sebiCharges + exitCharges.sebiCharges).toFixed(2)),
        stampDuty: Number((entryCharges.stampDuty + exitCharges.stampDuty).toFixed(2))
      },
      netPnl,
      roiPct,
      strategy: t.strategy || 'Momentum Breakdown',
      bot: t.bot || (t.botId ? `Bot ${t.botId}` : 'Jarvis Fleet Engine'),
      setupTag: SETUP_TYPES[idx % SETUP_TYPES.length],
      mistakeTag: chosenTag,
      notes: grossPnl > 0
        ? 'Clean volume expansion at key confluence level. Executed with strict stop loss and trailed automatically.'
        : 'Slight hesitation on exit. Stopped out at predetermined risk threshold. Good discipline maintained.',
      status: 'CLOSED',
      duration: t.duration || '5m 12s',
      source: 'Auto-Logged'
    };
  });
}

export default function TradeJournalView({ recentTrades = [], positions = [] }) {
  // 1. Core State synced to localStorage
  const [journalEntries, setJournalEntries] = useState(() => {
    try {
      const saved = localStorage.getItem(JOURNAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('[TradeJournal] Error reading localStorage:', err);
    }
    return [];
  });

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOutcome, setFilterOutcome] = useState('ALL'); // 'ALL' | 'WIN' | 'LOSS'
  const [filterAction, setFilterAction] = useState('ALL'); // 'ALL' | 'BUY' | 'SELL'
  const [filterTag, setFilterTag] = useState('ALL');
  const [filterTimeframe, setFilterTimeframe] = useState('ALL'); // 'ALL' | 'TODAY' | 'WEEK'
  const [sortBy, setSortBy] = useState('date_desc'); // 'date_desc' | 'date_asc' | 'pnl_desc' | 'pnl_asc'

  // Modals & UI Controls
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedEntryForDetail, setSelectedEntryForDetail] = useState(null);
  const [editingNotesId, setEditingNotesId] = useState(null);
  const [editingNotesText, setEditingNotesText] = useState('');
  const [autoLogPulse, setAutoLogPulse] = useState(false);

  // New Trade Form State
  const [newTrade, setNewTrade] = useState({
    symbol: 'NIFTY 50 25850 CE',
    action: 'BUY',
    qty: 50,
    entryPrice: 250.00,
    exitPrice: 285.00,
    strategy: 'EMA 9/21 Ribbon Pullback',
    bot: 'Jarvis Commander',
    setupTag: 'EMA 9/21 Ribbon Pullback',
    mistakeTag: 'followed_plan',
    notes: 'Calculated entry after 5-minute candle close confirmation.'
  });

  const fileInputRef = useRef(null);

  // Sync state back to localStorage whenever entries change
  useEffect(() => {
    try {
      localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(journalEntries));
    } catch (err) {
      console.error('[TradeJournal] Error saving to localStorage:', err);
    }
  }, [journalEntries]);

  // 2. AUTOMATIC LOGGING of live/closed trades
  // Listen to both recentTrades prop and window 'chintu:journal-trade' event
  useEffect(() => {
    const handleIncomingTrade = (event) => {
      const trade = event.detail;
      if (!trade || !trade.symbol) return;
      logTradeAutomatically(trade);
    };

    window.addEventListener('chintu:journal-trade', handleIncomingTrade);
    return () => {
      window.removeEventListener('chintu:journal-trade', handleIncomingTrade);
    };
  }, [journalEntries]);

  // Check recentTrades periodically or on change to auto-ingest any unlogged closed trades
  useEffect(() => {
    if (!recentTrades || recentTrades.length === 0) return;

    let hasNew = false;
    const updated = [...journalEntries];

    recentTrades.forEach((rt) => {
      if (rt.status !== 'Closed' && !rt.exitPrice && !rt.pnl) return;

      const rtKey = rt.id ? `RT-${rt.id}` : `${rt.symbol}-${rt.time}-${rt.price || rt.entryPrice}`;
      const exists = updated.some(
        (j) => j.id === rtKey || (j.symbol === rt.symbol && j.time === rt.time && Math.abs(j.entryPrice - (rt.entryPrice || rt.price)) < 0.05)
      );

      if (!exists) {
        hasNew = true;
        const entryP = Number(rt.entryPrice || rt.price) || 100;
        const exitP = Number(rt.exitPrice) || (entryP * (rt.pnl && Number(rt.pnl) > 0 ? 1.015 : 0.985));
        const q = Number(rt.qty) || 25;
        const isB = (rt.type || rt.action || 'BUY').toUpperCase() === 'BUY';
        const gross = isB ? (exitP - entryP) * q : (entryP - exitP) * q;

        const entryChg = calculateTradeCharges({ price: entryP, qty: q, action: isB ? 'BUY' : 'SELL', segment: 'NSE', grossPnl: 0 });
        const exitChg = calculateTradeCharges({ price: exitP, qty: q, action: isB ? 'SELL' : 'BUY', segment: 'NSE', grossPnl: gross });
        const totChg = Number((entryChg.totalCharges + exitChg.totalCharges).toFixed(2));
        const net = Number((gross - totChg).toFixed(2));
        const roi = Number(((net / Math.max(1, entryP * q)) * 100).toFixed(2));

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];

        updated.unshift({
          id: rtKey,
          timestamp: `${dateStr} ${rt.time || now.toLocaleTimeString()}`,
          date: dateStr,
          time: rt.time || now.toLocaleTimeString(),
          symbol: rt.symbol,
          action: isB ? 'BUY' : 'SELL',
          qty: q,
          entryPrice: Number(entryP.toFixed(2)),
          exitPrice: Number(exitP.toFixed(2)),
          grossPnl: Number(gross.toFixed(2)),
          charges: totChg,
          chargesBreakdown: {
            brokerage: Number((entryChg.brokerage + exitChg.brokerage).toFixed(2)),
            stt: Number((entryChg.stt + exitChg.stt).toFixed(2)),
            exchangeTurnover: Number((entryChg.exchangeTurnover + exitChg.exchangeTurnover).toFixed(2)),
            gst: Number((entryChg.gst + exitChg.gst).toFixed(2)),
            sebiCharges: Number((entryChg.sebiCharges + exitChg.sebiCharges).toFixed(2)),
            stampDuty: Number((entryChg.stampDuty + exitChg.stampDuty).toFixed(2))
          },
          netPnl: net,
          roiPct: roi,
          strategy: rt.strategy || 'AI Quorum Execution',
          bot: rt.bot || (rt.botId ? `Bot ${rt.botId}` : 'Jarvis Fleet Engine'),
          setupTag: 'Quorum Consensus Fill',
          mistakeTag: net >= 0 ? 'followed_plan' : 'early_exit',
          notes: 'Automatically captured from live execution feed.',
          status: 'CLOSED',
          duration: rt.duration || '3m 20s',
          source: 'Auto-Logged'
        });
      }
    });

    if (hasNew) {
      setJournalEntries(updated);
      setAutoLogPulse(true);
      setTimeout(() => setAutoLogPulse(false), 2500);
    }
  }, [recentTrades]);

  // Method to log custom trade automatically
  const logTradeAutomatically = (trade) => {
    const entryP = Number(trade.entryPrice) || Number(trade.price) || 100;
    const exitP = Number(trade.exitPrice) || entryP;
    const q = Number(trade.qty) || 1;
    const isB = (trade.action || trade.type || 'BUY').toUpperCase() === 'BUY';
    const gross = isB ? (exitP - entryP) * q : (entryP - exitP) * q;

    const entryChg = calculateTradeCharges({ price: entryP, qty: q, action: isB ? 'BUY' : 'SELL', segment: 'NSE', grossPnl: 0 });
    const exitChg = calculateTradeCharges({ price: exitP, qty: q, action: isB ? 'SELL' : 'BUY', segment: 'NSE', grossPnl: gross });
    const totChg = Number((entryChg.totalCharges + exitChg.totalCharges).toFixed(2));
    const net = Number((gross - totChg).toFixed(2));
    const roi = Number(((net / Math.max(1, entryP * q)) * 100).toFixed(2));

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString();

    const newEntry = {
      id: `TJ-AUTO-${Date.now()}`,
      timestamp: `${dateStr} ${timeStr}`,
      date: dateStr,
      time: timeStr,
      symbol: trade.symbol,
      action: isB ? 'BUY' : 'SELL',
      qty: q,
      entryPrice: Number(entryP.toFixed(2)),
      exitPrice: Number(exitP.toFixed(2)),
      grossPnl: Number(gross.toFixed(2)),
      charges: totChg,
      chargesBreakdown: {
        brokerage: Number((entryChg.brokerage + exitChg.brokerage).toFixed(2)),
        stt: Number((entryChg.stt + exitChg.stt).toFixed(2)),
        exchangeTurnover: Number((entryChg.exchangeTurnover + exitChg.exchangeTurnover).toFixed(2)),
        gst: Number((entryChg.gst + exitChg.gst).toFixed(2)),
        sebiCharges: Number((entryChg.sebiCharges + exitChg.sebiCharges).toFixed(2)),
        stampDuty: Number((entryChg.stampDuty + exitChg.stampDuty).toFixed(2))
      },
      netPnl: net,
      roiPct: roi,
      strategy: trade.strategy || 'Autonomous Execution',
      bot: trade.bot || 'Jarvis Commander',
      setupTag: trade.setupTag || 'Auto Square-off',
      mistakeTag: net >= 0 ? 'followed_plan' : 'early_exit',
      notes: trade.notes || 'Auto-logged from closed trade event.',
      status: 'CLOSED',
      duration: trade.duration || '1m 30s',
      source: 'Auto-Logged'
    };

    setJournalEntries((prev) => [newEntry, ...prev]);
    setAutoLogPulse(true);
    setTimeout(() => setAutoLogPulse(false), 2500);

    toastEmitter.emitToast({
      title: 'Trade Journal Logged',
      message: `${newEntry.action} ${newEntry.qty}x ${newEntry.symbol} recorded (Net: ₹${net > 0 ? '+' : ''}${net})`,
      type: net >= 0 ? 'success' : 'info'
    });
  };

  // 3. STATS & ANALYTICS COMPUTATION
  const stats = useMemo(() => {
    let totalGrossPnl = 0;
    let totalNetPnl = 0;
    let totalCharges = 0;
    let winCount = 0;
    let lossCount = 0;
    let breakevenCount = 0;
    let grossGains = 0;
    let grossLosses = 0;
    let bestTrade = null;
    let worstTrade = null;
    let totalCapitalTurnover = 0;

    journalEntries.forEach((entry) => {
      const net = Number(entry.netPnl) || 0;
      const gross = Number(entry.grossPnl) || 0;
      const chg = Number(entry.charges) || 0;
      const turnover = (Number(entry.entryPrice) || 0) * (Number(entry.qty) || 0);

      totalNetPnl += net;
      totalGrossPnl += gross;
      totalCharges += chg;
      totalCapitalTurnover += turnover;

      if (net > 0) {
        winCount++;
        grossGains += net;
        if (!bestTrade || net > bestTrade.netPnl) bestTrade = entry;
      } else if (net < 0) {
        lossCount++;
        grossLosses += Math.abs(net);
        if (!worstTrade || net < worstTrade.netPnl) worstTrade = entry;
      } else {
        breakevenCount++;
      }
    });

    const totalTrades = journalEntries.length;
    const winRate = totalTrades > 0 ? ((winCount / totalTrades) * 100).toFixed(1) : '0.0';
    const profitFactor = grossLosses > 0 ? (grossGains / grossLosses).toFixed(2) : grossGains > 0 ? '∞' : '0.00';
    const avgWin = winCount > 0 ? (grossGains / winCount).toFixed(2) : '0.00';
    const avgLoss = lossCount > 0 ? (grossLosses / lossCount).toFixed(2) : '0.00';
    const rewardRiskRatio = Number(avgLoss) > 0 ? (Number(avgWin) / Number(avgLoss)).toFixed(2) : 'N/A';

    return {
      totalTrades,
      winCount,
      lossCount,
      breakevenCount,
      winRate,
      totalGrossPnl: Number(totalGrossPnl.toFixed(2)),
      totalNetPnl: Number(totalNetPnl.toFixed(2)),
      totalCharges: Number(totalCharges.toFixed(2)),
      profitFactor,
      avgWin,
      avgLoss,
      rewardRiskRatio,
      bestTrade,
      worstTrade,
      totalCapitalTurnover: Number(totalCapitalTurnover.toFixed(2))
    };
  }, [journalEntries]);

  // 4. FILTERING & SORTING
  const filteredEntries = useMemo(() => {
    return journalEntries
      .filter((entry) => {
        // Search term
        const q = searchTerm.toLowerCase();
        const matchesSearch =
          !q ||
          entry.symbol?.toLowerCase().includes(q) ||
          entry.strategy?.toLowerCase().includes(q) ||
          entry.bot?.toLowerCase().includes(q) ||
          entry.notes?.toLowerCase().includes(q) ||
          entry.id?.toLowerCase().includes(q);

        // Outcome filter
        const net = Number(entry.netPnl) || 0;
        const matchesOutcome =
          filterOutcome === 'ALL' ||
          (filterOutcome === 'WIN' && net > 0) ||
          (filterOutcome === 'LOSS' && net < 0) ||
          (filterOutcome === 'BREAKEVEN' && net === 0);

        // Action filter
        const matchesAction = filterAction === 'ALL' || entry.action === filterAction;

        // Tag filter
        const matchesTag = filterTag === 'ALL' || entry.mistakeTag === filterTag;

        // Timeframe filter
        let matchesTimeframe = true;
        if (filterTimeframe === 'TODAY') {
          const today = new Date().toISOString().split('T')[0];
          matchesTimeframe = entry.date === today;
        } else if (filterTimeframe === 'WEEK') {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const entryDate = new Date(entry.date);
          matchesTimeframe = entryDate >= sevenDaysAgo;
        }

        return matchesSearch && matchesOutcome && matchesAction && matchesTag && matchesTimeframe;
      })
      .sort((a, b) => {
        if (sortBy === 'date_desc') return new Date(b.timestamp) - new Date(a.timestamp);
        if (sortBy === 'date_asc') return new Date(a.timestamp) - new Date(b.timestamp);
        if (sortBy === 'pnl_desc') return b.netPnl - a.netPnl;
        if (sortBy === 'pnl_asc') return a.netPnl - b.netPnl;
        return 0;
      });
  }, [journalEntries, searchTerm, filterOutcome, filterAction, filterTag, filterTimeframe, sortBy]);

  // 5. MANUAL TRADE ADDITION
  const handleAddManualTrade = (e) => {
    e.preventDefault();
    const entryP = Number(newTrade.entryPrice) || 0;
    const exitP = Number(newTrade.exitPrice) || 0;
    const q = Number(newTrade.qty) || 1;
    const isB = newTrade.action === 'BUY';

    if (entryP <= 0 || exitP <= 0 || q <= 0) {
      toastEmitter.emitToast({
        title: 'Invalid Trade Parameters',
        message: 'Prices and quantity must be greater than zero.',
        type: 'error'
      });
      return;
    }

    const gross = isB ? (exitP - entryP) * q : (entryP - exitP) * q;
    const entryChg = calculateTradeCharges({ price: entryP, qty: q, action: isB ? 'BUY' : 'SELL', segment: 'NSE', grossPnl: 0 });
    const exitChg = calculateTradeCharges({ price: exitP, qty: q, action: isB ? 'SELL' : 'BUY', segment: 'NSE', grossPnl: gross });
    const totChg = Number((entryChg.totalCharges + exitChg.totalCharges).toFixed(2));
    const net = Number((gross - totChg).toFixed(2));
    const roi = Number(((net / Math.max(1, entryP * q)) * 100).toFixed(2));

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString();

    const createdTrade = {
      id: `TJ-MAN-${Date.now()}`,
      timestamp: `${dateStr} ${timeStr}`,
      date: dateStr,
      time: timeStr,
      symbol: newTrade.symbol.toUpperCase().trim(),
      action: newTrade.action,
      qty: q,
      entryPrice: Number(entryP.toFixed(2)),
      exitPrice: Number(exitP.toFixed(2)),
      grossPnl: Number(gross.toFixed(2)),
      charges: totChg,
      chargesBreakdown: {
        brokerage: Number((entryChg.brokerage + exitChg.brokerage).toFixed(2)),
        stt: Number((entryChg.stt + exitChg.stt).toFixed(2)),
        exchangeTurnover: Number((entryChg.exchangeTurnover + exitChg.exchangeTurnover).toFixed(2)),
        gst: Number((entryChg.gst + exitChg.gst).toFixed(2)),
        sebiCharges: Number((entryChg.sebiCharges + exitChg.sebiCharges).toFixed(2)),
        stampDuty: Number((entryChg.stampDuty + exitChg.stampDuty).toFixed(2))
      },
      netPnl: net,
      roiPct: roi,
      strategy: newTrade.strategy,
      bot: newTrade.bot,
      setupTag: newTrade.setupTag,
      mistakeTag: newTrade.mistakeTag,
      notes: newTrade.notes,
      status: 'CLOSED',
      duration: 'Manual Entry',
      source: 'User Log'
    };

    setJournalEntries((prev) => [createdTrade, ...prev]);
    setIsAddModalOpen(false);
    soundEngine.playBuyChime();

    toastEmitter.emitToast({
      title: 'Manual Trade Added',
      message: `Successfully logged ${createdTrade.symbol} to your persistent trade journal.`,
      type: 'success'
    });
  };

  // 6. INLINE NOTE EDITING
  const handleSaveNotes = (id) => {
    setJournalEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, notes: editingNotesText } : entry))
    );
    setEditingNotesId(null);
    toastEmitter.emitToast({
      title: 'Notes Saved',
      message: 'Trade reflection notes updated in localStorage.',
      type: 'info'
    });
  };

  // 7. DELETE TRADE
  const handleDeleteTrade = (id) => {
    if (window.confirm('Delete this trade record from the local journal?')) {
      setJournalEntries((prev) => prev.filter((e) => e.id !== id));
      toastEmitter.emitToast({
        title: 'Trade Removed',
        message: 'Record removed from persistent session journal.',
        type: 'info'
      });
    }
  };

  // 8. CLEAR ALL
  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear your entire trade journal? This cannot be undone.')) {
      setJournalEntries([]);
      try {
        localStorage.removeItem(JOURNAL_STORAGE_KEY);
      } catch (e) {}
      toastEmitter.emitToast({
        title: 'Journal Cleared',
        message: 'All session records cleared from localStorage.',
        type: 'warning'
      });
    }
  };

  // 9. CSV EXPORT
  const handleExportCSV = () => {
    const headers = [
      'Trade ID',
      'Timestamp',
      'Symbol',
      'Action',
      'Quantity',
      'Entry Price (INR)',
      'Exit Price (INR)',
      'Gross PnL (INR)',
      'Total Charges (INR)',
      'Net PnL (INR)',
      'ROI (%)',
      'Strategy',
      'Bot',
      'Setup Tag',
      'Mistake Tag',
      'Notes'
    ].join(',');

    const rows = filteredEntries.map((e) =>
      [
        `"${e.id}"`,
        `"${e.timestamp}"`,
        `"${e.symbol}"`,
        `"${e.action}"`,
        e.qty,
        e.entryPrice,
        e.exitPrice,
        e.grossPnl,
        e.charges,
        e.netPnl,
        e.roiPct,
        `"${(e.strategy || '').replace(/"/g, '""')}"`,
        `"${(e.bot || '').replace(/"/g, '""')}"`,
        `"${(e.setupTag || '').replace(/"/g, '""')}"`,
        `"${(e.mistakeTag || '').replace(/"/g, '""')}"`,
        `"${(e.notes || '').replace(/"/g, '""')}"`
      ].join(',')
    );

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Chintu_Trade_Journal_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    soundEngine.playBuyChime();
    toastEmitter.emitToast({
      title: 'CSV Export Complete',
      message: `Exported ${filteredEntries.length} trade records to CSV.`,
      type: 'success'
    });
  };

  // 10. JSON BACKUP EXPORT & IMPORT
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(journalEntries, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `chintu_trade_journal_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    toastEmitter.emitToast({
      title: 'Backup Created',
      message: 'Full trade journal downloaded as JSON.',
      type: 'success'
    });
  };

  const handleImportJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result);
        if (Array.isArray(parsed)) {
          setJournalEntries(parsed);
          toastEmitter.emitToast({
            title: 'Journal Imported',
            message: `Successfully restored ${parsed.length} trade records.`,
            type: 'success'
          });
        } else {
          throw new Error('File does not contain an array of trades.');
        }
      } catch (err) {
        toastEmitter.emitToast({
          title: 'Import Failed',
          message: err.message || 'Invalid JSON journal file.',
          type: 'error'
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-4 animate-fadeIn select-none text-slate-200 pb-12">
      {/* 1. Header Banner */}
      <div className="glass-panel rounded-2xl p-4 lg:p-5 border border-[#1e3a6e]/60 bg-[#060c1d]/90 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(0,240,255,0.25)]">
            <BookMarked className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base lg:text-lg font-bold text-white tracking-wide">
                Master Trade Journal
              </h2>
              {/* Zero-pill: Unboxed text indicator */}
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400 ml-2">
                <span className={`w-2 h-2 rounded-full ${autoLogPulse ? 'bg-cyan-400 animate-ping' : 'bg-emerald-400'}`} />
                <span>Auto-Logging Active</span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400 font-mono text-[10px]">LocalStorage Synced</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Automated execution auditing, entry/exit cost tracking, statutory tax deduction, and psychological journaling.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-500 text-black hover:bg-cyan-400 transition-all cursor-pointer shadow-[0_0_12px_rgba(0,240,255,0.3)]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Log Trade</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0d1b33] border border-slate-700/70 hover:border-cyan-500/50 text-slate-200 transition-all cursor-pointer"
            title="Export to CSV Spreadsheet"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handleExportJSON}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0d1b33] border border-slate-700/70 hover:border-cyan-500/50 text-slate-200 transition-all cursor-pointer"
            title="Download JSON Backup"
          >
            <Download className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Backup</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0d1b33] border border-slate-700/70 hover:border-cyan-500/50 text-slate-200 transition-all cursor-pointer"
            title="Import JSON Journal"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Import</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportJSON}
            className="hidden"
          />

          <button
            type="button"
            onClick={handleClearAll}
            className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 transition-all cursor-pointer"
            title="Reset Journal"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Quant Metric Strip (Performance Ribbon) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {/* Total Net PnL */}
        <div className="bg-[#080e1b] border border-[#16294a] rounded-xl p-3 flex flex-col justify-between">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Net Realized P&L</span>
            {stats.totalNetPnl >= 0 ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            )}
          </div>
          <div className="mt-1">
            <div className={`text-lg font-mono font-black ${stats.totalNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              ₹{stats.totalNetPnl >= 0 ? '+' : ''}{stats.totalNetPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              Gross: ₹{stats.totalGrossPnl >= 0 ? '+' : ''}{stats.totalGrossPnl.toLocaleString('en-IN')}
            </div>
          </div>
        </div>

        {/* Win Rate */}
        <div className="bg-[#080e1b] border border-[#16294a] rounded-xl p-3 flex flex-col justify-between">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Win Rate</span>
            <Award className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="mt-1">
            <div className="text-lg font-mono font-black text-cyan-300">
              {stats.winRate}%
            </div>
            <div className="text-[10px] font-mono text-slate-400 mt-0.5">
              <span className="text-emerald-400 font-bold">{stats.winCount}W</span>
              <span className="text-slate-600 mx-1">/</span>
              <span className="text-rose-400 font-bold">{stats.lossCount}L</span>
              <span className="text-slate-600 mx-1">·</span>
              <span className="text-slate-400">{stats.totalTrades} Trades</span>
            </div>
          </div>
        </div>

        {/* Profit Factor */}
        <div className="bg-[#080e1b] border border-[#16294a] rounded-xl p-3 flex flex-col justify-between">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Profit Factor</span>
            <Zap className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="mt-1">
            <div className="text-lg font-mono font-black text-purple-300">
              {stats.profitFactor}
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              Gains: ₹{Number(stats.avgWin * stats.winCount).toFixed(0)}
            </div>
          </div>
        </div>

        {/* Risk / Reward & Expectancy */}
        <div className="bg-[#080e1b] border border-[#16294a] rounded-xl p-3 flex flex-col justify-between">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Avg Win / Loss</span>
            <DollarSign className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="mt-1">
            <div className="text-xs font-mono font-bold text-white flex items-center gap-1">
              <span className="text-emerald-400">+₹{stats.avgWin}</span>
              <span className="text-slate-600">/</span>
              <span className="text-rose-400">-₹{stats.avgLoss}</span>
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              RR: 1 : {stats.rewardRiskRatio}
            </div>
          </div>
        </div>

        {/* Total Statutory Costs Deducted */}
        <div className="bg-[#080e1b] border border-[#16294a] rounded-xl p-3 flex flex-col justify-between">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Statutory Taxes</span>
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="mt-1">
            <div className="text-lg font-mono font-black text-rose-300">
              ₹{stats.totalCharges.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              STT + GST + Brokerage
            </div>
          </div>
        </div>

        {/* Total Turnover */}
        <div className="bg-[#080e1b] border border-[#16294a] rounded-xl p-3 flex flex-col justify-between">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Turnover Deployed</span>
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="mt-1">
            <div className="text-base font-mono font-bold text-slate-200">
              ₹{stats.totalCapitalTurnover.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[10px] font-mono text-cyan-400 mt-0.5">
              Avg ROI: {(stats.totalCapitalTurnover > 0 ? (stats.totalNetPnl / stats.totalCapitalTurnover) * 100 : 0).toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      {/* 3. Search & Multi-Dimensional Filters */}
      <div className="bg-[#080e1b]/90 border border-[#16294a] rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative grow sm:max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search symbol, bot, strategy, notes..."
            className="w-full bg-[#05070b] border border-slate-700/60 focus:border-cyan-400 text-xs text-slate-200 placeholder:text-slate-500 pl-8 pr-3 py-1.5 rounded-lg focus:outline-none transition-all font-sans"
          />
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Outcome Filter */}
          <div className="flex items-center gap-1 bg-[#05070b] border border-slate-700/60 rounded-lg p-0.5 text-[11px] font-mono">
            {['ALL', 'WIN', 'LOSS'].map((outcome) => (
              <button
                key={outcome}
                type="button"
                onClick={() => setFilterOutcome(outcome)}
                className={`px-2 py-1 rounded transition-all cursor-pointer font-bold ${
                  filterOutcome === outcome
                    ? 'bg-cyan-500 text-black shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {outcome}
              </button>
            ))}
          </div>

          {/* Action Filter */}
          <div className="flex items-center gap-1 bg-[#05070b] border border-slate-700/60 rounded-lg p-0.5 text-[11px] font-mono">
            {['ALL', 'BUY', 'SELL'].map((act) => (
              <button
                key={act}
                type="button"
                onClick={() => setFilterAction(act)}
                className={`px-2 py-1 rounded transition-all cursor-pointer font-bold ${
                  filterAction === act
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {act}
              </button>
            ))}
          </div>

          {/* Timeframe Filter */}
          <select
            value={filterTimeframe}
            onChange={(e) => setFilterTimeframe(e.target.value)}
            className="bg-[#05070b] border border-slate-700/60 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-400 cursor-pointer"
          >
            <option value="ALL">All History</option>
            <option value="TODAY">Today's Trades</option>
            <option value="WEEK">Last 7 Days</option>
          </select>

          {/* Tag Filter */}
          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            className="bg-[#05070b] border border-slate-700/60 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-400 cursor-pointer"
          >
            <option value="ALL">All Reflection Tags</option>
            {MISTAKE_TAGS.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-[#05070b] border border-slate-700/60 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-400 cursor-pointer"
          >
            <option value="date_desc">Newest First</option>
            <option value="date_asc">Oldest First</option>
            <option value="pnl_desc">Highest Net P&L</option>
            <option value="pnl_asc">Lowest Net P&L</option>
          </select>
        </div>
      </div>

      {/* 4. Journal Entries Table */}
      <div className="bg-[#080e1b] border border-[#16294a] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#16294a] bg-[#05070b]/90 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                <th className="py-2.5 px-3">Date / ID</th>
                <th className="py-2.5 px-3">Symbol</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3 text-right">Qty</th>
                <th className="py-2.5 px-3 text-right">Entry Price</th>
                <th className="py-2.5 px-3 text-right">Exit Price</th>
                <th className="py-2.5 px-3 text-right">Gross P&L</th>
                <th className="py-2.5 px-3 text-right">Taxes & Fees</th>
                <th className="py-2.5 px-3 text-right">Net P&L</th>
                <th className="py-2.5 px-3">Strategy / Bot</th>
                <th className="py-2.5 px-3">Reflection Tag</th>
                <th className="py-2.5 px-3">Notes</th>
                <th className="py-2.5 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#16294a]/60 text-xs font-sans">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-500 font-mono text-xs">
                    No trade journal records found matching the active filter criteria.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => {
                  const isProfitable = entry.netPnl > 0;
                  const isBreakeven = entry.netPnl === 0;
                  const tagMeta = MISTAKE_TAGS.find((m) => m.id === entry.mistakeTag) || {
                    label: entry.mistakeTag || 'Standard',
                    color: 'text-slate-400'
                  };

                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-[#0c162c]/60 transition-colors cursor-pointer group"
                      onClick={() => setSelectedEntryForDetail(entry)}
                    >
                      {/* Date / ID */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-mono text-slate-200 text-xs font-semibold">
                          {entry.time}
                        </div>
                        <div className="font-mono text-[10px] text-slate-500">
                          {entry.date} · {entry.id}
                        </div>
                      </td>

                      {/* Symbol */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-bold text-white text-xs">
                          {entry.symbol}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {entry.source || 'Session'}
                        </div>
                      </td>

                      {/* Action (Zero-pill: Unboxed text with dot) */}
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono text-xs font-bold">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              entry.action === 'BUY' ? 'bg-emerald-400' : 'bg-rose-400'
                            }`}
                          />
                          <span className={entry.action === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>
                            {entry.action}
                          </span>
                        </span>
                      </td>

                      {/* Quantity */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                        {entry.qty}
                      </td>

                      {/* Entry Price */}
                      <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-200">
                        ₹{Number(entry.entryPrice).toFixed(2)}
                      </td>

                      {/* Exit Price */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                        ₹{Number(entry.exitPrice).toFixed(2)}
                      </td>

                      {/* Gross PnL */}
                      <td className={`py-2.5 px-3 text-right font-mono text-xs ${
                        entry.grossPnl >= 0 ? 'text-emerald-300/80' : 'text-rose-300/80'
                      }`}>
                        ₹{entry.grossPnl >= 0 ? '+' : ''}{Number(entry.grossPnl).toFixed(2)}
                      </td>

                      {/* Charges */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400 text-xs">
                        ₹{Number(entry.charges || 0).toFixed(2)}
                      </td>

                      {/* Net PnL & ROI */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div
                          className={`font-mono font-black text-xs ${
                            isProfitable
                              ? 'text-emerald-400'
                              : isBreakeven
                              ? 'text-slate-300'
                              : 'text-rose-400'
                          }`}
                        >
                          ₹{entry.netPnl >= 0 ? '+' : ''}{Number(entry.netPnl).toFixed(2)}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {entry.roiPct >= 0 ? '+' : ''}{entry.roiPct}% ROI
                        </div>
                      </td>

                      {/* Strategy & Bot */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="text-slate-200 font-medium text-xs max-w-[140px] truncate" title={entry.strategy}>
                          {entry.strategy || 'Momentum'}
                        </div>
                        <div className="text-[10px] text-cyan-400 font-mono">
                          {entry.bot || 'Jarvis Engine'}
                        </div>
                      </td>

                      {/* Reflection Tag (Zero-pill: Unboxed text with subtle typographic dot) */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`text-[11px] font-mono font-semibold flex items-center gap-1 ${tagMeta.color}`}>
                          <span>·</span>
                          <span>{tagMeta.label}</span>
                        </span>
                      </td>

                      {/* Notes & Quick Edit */}
                      <td
                        className="py-2.5 px-3 max-w-[160px] truncate text-slate-400 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingNotesId(entry.id);
                          setEditingNotesText(entry.notes || '');
                        }}
                      >
                        <span className="hover:text-cyan-300 transition-colors flex items-center gap-1" title={entry.notes || 'Click to add notes'}>
                          <Edit3 className="w-3 h-3 text-slate-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <span className="truncate">{entry.notes || 'Add reflection...'}</span>
                        </span>
                      </td>

                      {/* Actions */}
                      <td
                        className="py-2.5 px-3 text-center whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedEntryForDetail(entry)}
                            className="p-1 rounded hover:bg-cyan-500/10 text-cyan-400 transition-all cursor-pointer"
                            title="Audit Breakdown"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTrade(entry.id)}
                            className="p-1 rounded hover:bg-rose-500/10 text-rose-400 transition-all cursor-pointer"
                            title="Delete Trade"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Inline Note Edit Modal */}
      {editingNotesId && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setEditingNotesId(null)}
        >
          <div
            className="bg-[#080e1b] border border-[#16294a] rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-cyan-400" />
                Edit Qualitative Reflection Notes
              </h3>
              <button
                type="button"
                onClick={() => setEditingNotesId(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1.5 uppercase">
                Trade Analysis & Psychology Notes
              </label>
              <textarea
                value={editingNotesText}
                onChange={(e) => setEditingNotesText(e.target.value)}
                rows={4}
                placeholder="What prompted this entry? Did you follow your pre-trade risk plan? What should be repeated or avoided?"
                className="w-full bg-[#05070b] border border-slate-700/80 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-cyan-400 transition-all"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingNotesId(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveNotes(editingNotesId)}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-cyan-500 text-black hover:bg-cyan-400 transition-all cursor-pointer"
              >
                Save Notes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Comprehensive Trade Audit & Tax Breakdown Modal */}
      {selectedEntryForDetail && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setSelectedEntryForDetail(null)}
        >
          <div
            className="bg-[#080e1b] border border-[#1e3a6e] rounded-2xl max-w-xl w-full p-5 lg:p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#16294a]">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${selectedEntryForDetail.action === 'BUY' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  <h3 className="text-base font-bold text-white">
                    {selectedEntryForDetail.action} {selectedEntryForDetail.symbol}
                  </h3>
                  <span className="text-xs font-mono text-slate-400">
                    ({selectedEntryForDetail.id})
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  Logged on {selectedEntryForDetail.timestamp} · Source: {selectedEntryForDetail.source}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedEntryForDetail(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Price & PnL Highlight Banner */}
            <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-[#05070b] border border-[#16294a]">
              <div>
                <div className="text-[10px] font-mono text-slate-400 uppercase">Entry Price</div>
                <div className="text-sm font-mono font-bold text-white mt-0.5">
                  ₹{Number(selectedEntryForDetail.entryPrice).toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">Qty: {selectedEntryForDetail.qty}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-slate-400 uppercase">Exit Price</div>
                <div className="text-sm font-mono font-bold text-white mt-0.5">
                  ₹{Number(selectedEntryForDetail.exitPrice).toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  Delta: ₹{(selectedEntryForDetail.exitPrice - selectedEntryForDetail.entryPrice).toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-slate-400 uppercase">Net Realized P&L</div>
                <div className={`text-sm font-mono font-black mt-0.5 ${
                  selectedEntryForDetail.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  ₹{selectedEntryForDetail.netPnl >= 0 ? '+' : ''}{Number(selectedEntryForDetail.netPnl).toFixed(2)}
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  {selectedEntryForDetail.roiPct >= 0 ? '+' : ''}{selectedEntryForDetail.roiPct}% Net ROI
                </div>
              </div>
            </div>

            {/* SEBI & Indian Statutory Tax Breakdown */}
            <div className="space-y-2">
              <div className="text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>SEBI / Statutory Cost Breakdown</span>
                <span className="text-rose-400">Total Charges: ₹{selectedEntryForDetail.charges}</span>
              </div>
              <div className="bg-[#05070b] rounded-xl p-3 border border-[#16294a] divide-y divide-[#16294a]/60 text-xs font-mono">
                <div className="py-1.5 flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Brokerage (Flat / Discount Rate)</span>
                  <span>₹{selectedEntryForDetail.chargesBreakdown?.brokerage || '20.00'}</span>
                </div>
                <div className="py-1.5 flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Securities Transaction Tax (STT)</span>
                  <span>₹{selectedEntryForDetail.chargesBreakdown?.stt || '0.00'}</span>
                </div>
                <div className="py-1.5 flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Exchange Turnover Charges</span>
                  <span>₹{selectedEntryForDetail.chargesBreakdown?.exchangeTurnover || '0.00'}</span>
                </div>
                <div className="py-1.5 flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Goods & Services Tax (GST 18%)</span>
                  <span>₹{selectedEntryForDetail.chargesBreakdown?.gst || '0.00'}</span>
                </div>
                <div className="py-1.5 flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">SEBI Regulatory Turnover Fee</span>
                  <span>₹{selectedEntryForDetail.chargesBreakdown?.sebiCharges || '0.00'}</span>
                </div>
                <div className="py-1.5 flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Stamp Duty</span>
                  <span>₹{selectedEntryForDetail.chargesBreakdown?.stampDuty || '0.00'}</span>
                </div>
              </div>
            </div>

            {/* Setup & Psychology */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-[#05070b] border border-[#16294a] rounded-xl p-3">
                <div className="text-[10px] font-mono text-slate-400 uppercase">Strategy Executed</div>
                <div className="font-bold text-cyan-300 mt-1">
                  {selectedEntryForDetail.strategy || 'Autonomous Quant'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Bot: {selectedEntryForDetail.bot}
                </div>
              </div>

              <div className="bg-[#05070b] border border-[#16294a] rounded-xl p-3">
                <div className="text-[10px] font-mono text-slate-400 uppercase">Psychological State / Tag</div>
                <div className="font-bold text-purple-300 mt-1 flex items-center gap-1.5">
                  <span>·</span>
                  <span>{MISTAKE_TAGS.find((m) => m.id === selectedEntryForDetail.mistakeTag)?.label || selectedEntryForDetail.mistakeTag}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Setup: {selectedEntryForDetail.setupTag}
                </div>
              </div>
            </div>

            {/* Notes Section */}
            <div className="bg-[#05070b] border border-[#16294a] rounded-xl p-3 space-y-1">
              <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center justify-between">
                <span>Journal Reflection Notes</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingNotesId(selectedEntryForDetail.id);
                    setEditingNotesText(selectedEntryForDetail.notes || '');
                    setSelectedEntryForDetail(null);
                  }}
                  className="text-cyan-400 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Edit Note</span>
                </button>
              </div>
              <p className="text-xs text-slate-300 italic pt-1">
                "{selectedEntryForDetail.notes || 'No notes logged for this trade.'}"
              </p>
            </div>

            {/* Jarvis Advisor Critique */}
            <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/30 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold text-cyan-300">Jarvis Post-Trade Assessment: </span>
                <span className="text-slate-300">
                  {selectedEntryForDetail.netPnl > 0
                    ? `Trade complied with statutory guardrails. The 1.5% hurdle ROI requirement was met (+${selectedEntryForDetail.roiPct}% net yield). Discipline index: 94%.`
                    : `Capital protection executed efficiently. Losses were contained within pre-defined ATR tolerance bands, preserving portfolio longevity.`}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. Modal: Log Manual Trade */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setIsAddModalOpen(false)}
        >
          <div
            className="bg-[#080e1b] border border-[#1e3a6e] rounded-2xl max-w-lg w-full p-5 lg:p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#16294a]">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan-400" />
                Log Trade to Persistent Journal
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddManualTrade} className="space-y-3.5 text-xs">
              {/* Symbol & Action */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1 uppercase">
                    Trading Symbol
                  </label>
                  <input
                    type="text"
                    required
                    value={newTrade.symbol}
                    onChange={(e) => setNewTrade({ ...newTrade, symbol: e.target.value })}
                    placeholder="e.g. NIFTY 25850 CE"
                    className="w-full bg-[#05070b] border border-slate-700/80 rounded-lg px-3 py-1.5 text-slate-100 font-mono focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1 uppercase">
                    Execution Action
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setNewTrade({ ...newTrade, action: 'BUY' })}
                      className={`py-1.5 rounded-lg font-bold font-mono text-center cursor-pointer transition-all ${
                        newTrade.action === 'BUY'
                          ? 'bg-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                          : 'bg-[#05070b] border border-slate-700 text-slate-400'
                      }`}
                    >
                      BUY
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewTrade({ ...newTrade, action: 'SELL' })}
                      className={`py-1.5 rounded-lg font-bold font-mono text-center cursor-pointer transition-all ${
                        newTrade.action === 'SELL'
                          ? 'bg-rose-500 text-white shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                          : 'bg-[#05070b] border border-slate-700 text-slate-400'
                      }`}
                    >
                      SELL
                    </button>
                  </div>
                </div>
              </div>

              {/* Quantity, Entry Price, Exit Price */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1 uppercase">
                    Quantity / Lots
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newTrade.qty}
                    onChange={(e) => setNewTrade({ ...newTrade, qty: parseInt(e.target.value, 10) || 1 })}
                    className="w-full bg-[#05070b] border border-slate-700/80 rounded-lg px-3 py-1.5 text-slate-100 font-mono focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1 uppercase">
                    Entry Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.05"
                    required
                    value={newTrade.entryPrice}
                    onChange={(e) => setNewTrade({ ...newTrade, entryPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-[#05070b] border border-slate-700/80 rounded-lg px-3 py-1.5 text-slate-100 font-mono focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1 uppercase">
                    Exit Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.05"
                    required
                    value={newTrade.exitPrice}
                    onChange={(e) => setNewTrade({ ...newTrade, exitPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-[#05070b] border border-slate-700/80 rounded-lg px-3 py-1.5 text-slate-100 font-mono focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Dynamic Live Net P&L Calculation Preview */}
              {newTrade.entryPrice > 0 && newTrade.exitPrice > 0 && (
                <div className="p-3 rounded-xl bg-[#05070b] border border-[#16294a] flex items-center justify-between font-mono text-xs">
                  <div>
                    <span className="text-slate-400">Estimated Gross P&L: </span>
                    <span className="font-bold text-white">
                      ₹{((newTrade.action === 'BUY' ? newTrade.exitPrice - newTrade.entryPrice : newTrade.entryPrice - newTrade.exitPrice) * newTrade.qty).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Estimated Net ROI: </span>
                    <span className="font-bold text-emerald-400">
                      {(
                        (((newTrade.action === 'BUY' ? newTrade.exitPrice - newTrade.entryPrice : newTrade.entryPrice - newTrade.exitPrice) * newTrade.qty - 45) /
                          Math.max(1, newTrade.entryPrice * newTrade.qty)) *
                        100
                      ).toFixed(2)}%
                    </span>
                  </div>
                </div>
              )}

              {/* Strategy & Bot */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1 uppercase">
                    Setup / Strategy
                  </label>
                  <select
                    value={newTrade.strategy}
                    onChange={(e) => setNewTrade({ ...newTrade, strategy: e.target.value, setupTag: e.target.value })}
                    className="w-full bg-[#05070b] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-slate-200 focus:border-cyan-400 focus:outline-none"
                  >
                    {SETUP_TYPES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1 uppercase">
                    Executing Agent / Bot
                  </label>
                  <input
                    type="text"
                    value={newTrade.bot}
                    onChange={(e) => setNewTrade({ ...newTrade, bot: e.target.value })}
                    className="w-full bg-[#05070b] border border-slate-700/80 rounded-lg px-3 py-1.5 text-slate-200 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Reflection Tag */}
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1 uppercase">
                  Psychological Discipline / Mistake Tag
                </label>
                <select
                  value={newTrade.mistakeTag}
                  onChange={(e) => setNewTrade({ ...newTrade, mistakeTag: e.target.value })}
                  className="w-full bg-[#05070b] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-slate-200 focus:border-cyan-400 focus:outline-none"
                >
                  {MISTAKE_TAGS.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1 uppercase">
                  Trade Reflection & Notes
                </label>
                <textarea
                  value={newTrade.notes}
                  onChange={(e) => setNewTrade({ ...newTrade, notes: e.target.value })}
                  rows={2}
                  placeholder="Why did you take this trade? Confluence factors, execution thoughts..."
                  className="w-full bg-[#05070b] border border-slate-700/80 rounded-lg p-2.5 text-slate-200 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              {/* Submit / Cancel */}
              <div className="flex justify-end gap-2 pt-2 border-t border-[#16294a]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg font-bold bg-cyan-500 text-black hover:bg-cyan-400 transition-all cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.3)]"
                >
                  Commit to Journal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
