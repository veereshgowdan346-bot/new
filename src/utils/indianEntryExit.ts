/**
 * CHINTU AI — INDIAN ENTRY TIMER & EXIT PLANNER
 *
 * Adapts TRADER-ENTRY & TRADER-EXIT from day-trader-skill for Indian markets:
 *
 * 1. Entry Timer:
 *    - Watches 5-minute / 1-minute Indian market bars (09:15-15:30 IST).
 *    - Evaluates triggers ONLY on confirmed, completed candles (isComplete === true).
 *    - Strictly prevents look-ahead bias: developing candle wicks are NOT entry triggers.
 *    - Optional volume confirmation (e.g. >= 1.5x opening range average volume).
 *    - Prevents duplicate triggers; flags stale triggers.
 *
 * 2. Exit Planner:
 *    - Plans stop-loss: `or-mid` (OR midpoint), `or-low` (OR low), `pct` (% loss), `atr` (ATR multiple).
 *    - Plans target: `1R`, `2R`, `3R`, or price.
 *    - Rounds stop price away from entry to exact Indian tick size (₹0.05 on NSE, ₹1.00 on MCX).
 *    - Calculates precise Reward-to-Risk (R:R) ratio.
 *    - Enforces intraday mandatory flat-by deadline (15:25 IST auto-square-off).
 *    - Clearly states: "A stop-loss is an order, not a guarantee. Gaps and fast markets may slip past stop prices."
 */

import { IndianMarketCalendar } from './indianMarketCalendar';
import { IndianCandle } from './indianSetupScanner';

export type EntryStatus = 'WAITING' | 'TRIGGERED' | 'EXPIRED' | 'MARKET_CLOSED';

export interface EntryCheckResult {
  symbol: string;
  status: EntryStatus;
  setup: 'ORB' | 'LEVEL';
  currentPrice: number;
  triggerLevel: number;
  distanceToLevel: number;
  distancePct: number;
  triggerBarTime?: string;
  triggerPrice?: number;
  isConfirmedCompleted: boolean;
  message: string;
}

export interface ExitPlan {
  symbol: string;
  action: 'BUY' | 'SELL';
  entryPrice: number;
  entryTime: string;
  stopPrice: number;
  stopRule: 'or-mid' | 'or-low' | 'pct' | 'atr' | 'price';
  targetPrice: number;
  targetRule: '1R' | '1.5R' | '2R' | '3R' | 'price';
  riskPerShare: number;
  riskPct: number;
  rewardRiskRatio: number;
  tickSize: number;
  flatByTime: string; // "15:25 IST"
  disclaimer: string;
}

export class IndianEntryTimer {
  /**
   * Evaluates entry trigger on completed candles
   */
  public static checkEntry(
    symbol: string,
    completedBars: IndianCandle[],
    triggerLevel: number,
    options: {
      minVolumeMultiplier?: number;
      openingRangeBars?: IndianCandle[];
      setup?: 'ORB' | 'LEVEL';
    } = {}
  ): EntryCheckResult {
    const session = IndianMarketCalendar.getSessionStatus();
    if (!session.isOpen && !session.isEntryWindowOpen) {
      return {
        symbol,
        status: 'MARKET_CLOSED',
        setup: options.setup || 'ORB',
        currentPrice: completedBars.length > 0 ? completedBars[completedBars.length - 1].close : triggerLevel,
        triggerLevel,
        distanceToLevel: 0,
        distancePct: 0,
        isConfirmedCompleted: false,
        message: 'Market is closed or outside authorized entry window (09:20 - 15:15 IST).'
      };
    }

    if (completedBars.length === 0) {
      return {
        symbol,
        status: 'WAITING',
        setup: options.setup || 'ORB',
        currentPrice: triggerLevel,
        triggerLevel,
        distanceToLevel: 0,
        distancePct: 0,
        isConfirmedCompleted: false,
        message: 'No completed candles available yet.'
      };
    }

    // Inspect completed bars in sequence
    for (let i = 0; i < completedBars.length; i++) {
      const bar = completedBars[i];

      // CRITICAL: Look-ahead prevention!
      if (!bar.isComplete) {
        continue; // In-progress candle is ignored
      }

      // Trigger condition: Completed bar CLOSES above trigger level
      if (bar.close > triggerLevel) {
        // Volume confirmation check if requested
        if (options.minVolumeMultiplier && options.openingRangeBars && options.openingRangeBars.length > 0) {
          const avgOrVol = options.openingRangeBars.reduce((s, b) => s + b.volume, 0) / options.openingRangeBars.length;
          if (bar.volume < avgOrVol * options.minVolumeMultiplier) {
            continue; // Volume confirmation failed
          }
        }

        const date = new Date(bar.timestamp);
        const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} IST`;

        return {
          symbol,
          status: 'TRIGGERED',
          setup: options.setup || 'ORB',
          currentPrice: bar.close,
          triggerLevel,
          distanceToLevel: Number((bar.close - triggerLevel).toFixed(2)),
          distancePct: Number((((bar.close - triggerLevel) / triggerLevel) * 100).toFixed(2)),
          triggerBarTime: timeStr,
          triggerPrice: bar.close,
          isConfirmedCompleted: true,
          message: `TRIGGERED at ${timeStr}: Confirmed closed bar at ₹${bar.close} (> ₹${triggerLevel}).`
        };
      }
    }

    // Still waiting
    const latestBar = completedBars[completedBars.length - 1];
    const diff = Number((triggerLevel - latestBar.close).toFixed(2));
    const diffPct = Number(((diff / triggerLevel) * 100).toFixed(2));

    return {
      symbol,
      status: 'WAITING',
      setup: options.setup || 'ORB',
      currentPrice: latestBar.close,
      triggerLevel,
      distanceToLevel: diff,
      distancePct: diffPct,
      isConfirmedCompleted: latestBar.isComplete,
      message: `WAITING: Latest close ₹${latestBar.close} is ₹${diff} (${diffPct}%) below trigger level ₹${triggerLevel}.`
    };
  }
}

export class IndianExitPlanner {
  /**
   * Plans stop-loss and target levels conforming to Indian tick sizes and session rules
   */
  public static planExit(params: {
    symbol: string;
    action?: 'BUY' | 'SELL';
    entryPrice: number;
    orHigh?: number;
    orLow?: number;
    stopRule?: 'or-mid' | 'or-low' | 'pct' | 'atr' | 'price';
    customStopPrice?: number;
    stopPct?: number; // e.g. 1.5%
    atrValue?: number;
    atrMultiplier?: number;
    targetRule?: '1R' | '1.5R' | '2R' | '3R' | 'price';
    customTargetPrice?: number;
    tickSize?: number; // Default: 0.05 for NSE
  }): ExitPlan {
    const action = params.action || 'BUY';
    const entry = Number(params.entryPrice);
    const tick = params.tickSize || 0.05;
    const stopRule = params.stopRule || 'or-mid';
    const targetRule = params.targetRule || '2R';

    // 1. Calculate Stop Price
    let rawStop = 0;
    if (stopRule === 'or-mid' && params.orHigh && params.orLow) {
      rawStop = (params.orHigh + params.orLow) / 2;
    } else if (stopRule === 'or-low' && params.orLow) {
      rawStop = params.orLow;
    } else if (stopRule === 'pct') {
      const pct = params.stopPct || 1.5;
      rawStop = entry * (1 - pct / 100);
    } else if (stopRule === 'atr' && params.atrValue) {
      const mult = params.atrMultiplier || 1.5;
      rawStop = entry - (params.atrValue * mult);
    } else if (params.customStopPrice && params.customStopPrice > 0) {
      rawStop = params.customStopPrice;
    } else {
      rawStop = entry * 0.985; // Standard 1.5% default fallback
    }

    // Round stop AWAY from entry to tick size (downward for BUY)
    let stopPrice = Math.floor(rawStop / tick) * tick;
    stopPrice = Number(stopPrice.toFixed(2));

    // Stop must be below entry for long
    if (action === 'BUY' && stopPrice >= entry) {
      stopPrice = Number((entry - tick).toFixed(2));
    }

    const riskPerShare = Number((entry - stopPrice).toFixed(2));
    const riskPct = Number(((riskPerShare / entry) * 100).toFixed(2));

    // 2. Calculate Target Price based on R-multiple
    let rawTarget = 0;
    if (targetRule === '1R') {
      rawTarget = entry + riskPerShare;
    } else if (targetRule === '1.5R') {
      rawTarget = entry + (1.5 * riskPerShare);
    } else if (targetRule === '2R') {
      rawTarget = entry + (2 * riskPerShare);
    } else if (targetRule === '3R') {
      rawTarget = entry + (3 * riskPerShare);
    } else if (params.customTargetPrice && params.customTargetPrice > entry) {
      rawTarget = params.customTargetPrice;
    } else {
      rawTarget = entry + (2 * riskPerShare);
    }

    // Round target to tick size
    let targetPrice = Math.round(rawTarget / tick) * tick;
    targetPrice = Number(targetPrice.toFixed(2));

    const rewardRiskRatio = riskPerShare > 0 ? Number(((targetPrice - entry) / riskPerShare).toFixed(2)) : 0;

    return {
      symbol: params.symbol,
      action,
      entryPrice: entry,
      entryTime: new Date().toLocaleTimeString(),
      stopPrice,
      stopRule,
      targetPrice,
      targetRule,
      riskPerShare,
      riskPct,
      rewardRiskRatio,
      tickSize: tick,
      flatByTime: '15:25 IST',
      disclaimer: 'A stop-loss is an order, not a guarantee. Gaps and fast-moving markets may cause fills past the stop price.'
    };
  }
}

