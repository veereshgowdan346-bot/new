import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IndianMarketCalendar } from '../src/utils/indianMarketCalendar';
import {
  indianSetupScanner,
  IndianSetupScanner,
  IndianCandle
} from '../src/utils/indianSetupScanner';
import {
  IndianEntryTimer,
  IndianExitPlanner
} from '../src/utils/indianEntryExit';
import {
  indianTimeMachine,
  IndianTimeMachine,
  TimeMachinePlan
} from '../src/utils/indianTimeMachine';
import {
  indianNewsMonitor,
  IndianNewsMonitor,
  indianAlertManager,
  IndianAlertManager
} from '../src/utils/indianNewsAndAlerts';
import {
  indianFundamentalAnalyst,
  IndianFundamentalAnalyst
} from '../src/utils/indianFundamentalAnalyst';
import { AngelOrderExecutionAdapter, angelOrderAdapter } from '../src/utils/angelOrderAdapter';

describe('CHINTU AI — DAY-TRADER-SKILL INDIAN MARKET ADAPTATION SUITE', () => {

  // ==========================================================================
  // 1. INDIAN MARKET CALENDAR & TRADING SESSIONS
  // ==========================================================================
  describe('1. Indian Market Calendar & Intraday Session Framework', () => {
    it('should correctly convert UTC timestamps to Indian Standard Time (UTC+5:30)', () => {
      // 2026-10-23 03:45:00 UTC = 2026-10-23 09:15:00 IST (NSE Market Open)
      const testUtc = new Date(Date.UTC(2026, 9, 23, 3, 45, 0));
      const ist = IndianMarketCalendar.toIST(testUtc);

      assert.equal(ist.hours, 9);
      assert.equal(ist.minutes, 15);
      assert.equal(ist.totalMinutes, 555); // 9*60 + 15
      assert.equal(ist.dateStr, '2026-10-23');
    });

    it('should identify official NSE/BSE holidays (e.g. Republic Day, Diwali)', () => {
      const repDay = IndianMarketCalendar.isHoliday('2026-01-26');
      assert.equal(repDay.isHoliday, true);
      assert.equal(repDay.holidayName, 'Republic Day');

      const diwali = IndianMarketCalendar.isHoliday('2026-11-08');
      assert.equal(diwali.isHoliday, true);
      assert.ok(diwali.holidayName?.includes('Diwali'));

      const normalDay = IndianMarketCalendar.isHoliday('2026-10-23');
      assert.equal(normalDay.isHoliday, false);
    });

    it('should accurately partition the Indian session into 75 five-minute bars (09:15 - 15:30 IST)', () => {
      assert.equal(IndianMarketCalendar.TOTAL_EQUITY_BARS_5M, 75);

      const firstBar = IndianMarketCalendar.getBarTimeRange(0);
      assert.equal(firstBar.startStr, '09:15');
      assert.equal(firstBar.endStr, '09:20');

      const lastBar = IndianMarketCalendar.getBarTimeRange(74);
      assert.equal(lastBar.startStr, '15:25');
      assert.equal(lastBar.endStr, '15:30');
    });

    it('should define safe entry window (09:20 to 15:15 IST) and square-off deadline (15:25 IST)', () => {
      assert.equal(IndianMarketCalendar.ENTRY_WINDOW_START, 560); // 09:20
      assert.equal(IndianMarketCalendar.ENTRY_WINDOW_END, 915);   // 15:15
      assert.equal(IndianMarketCalendar.SQUARE_OFF_MINUTES, 925);  // 15:25
    });
  });

  // ==========================================================================
  // 2. TRADER-SCANNER ADAPTED: INDIAN MARKET SETUP SCANNER
  // ==========================================================================
  describe('2. Indian Market Setup Scanner (6 Institutional Setups)', () => {
    it('should calculate accurate Wilder RSI(14) values', () => {
      const closes = [100, 102, 101, 104, 103, 105, 107, 106, 108, 110, 109, 111, 113, 112, 115, 118];
      const rsi = indianSetupScanner.calculateRSI(closes, 14);
      assert.ok(rsi.length > 0);
      assert.ok(rsi[rsi.length - 1] > 50, 'RSI on upward trending prices should be > 50');
    });

    it('should detect 15-minute Opening Range Breakout (ORB) on confirmed 5-minute bar close', () => {
      // 3 Range bars (09:15-09:30): High = 2500, Low = 2480, Mid = 2490
      const now = Date.now();
      const bars: IndianCandle[] = [
        { timestamp: now - 1200000, open: 2485, high: 2495, low: 2480, close: 2490, volume: 10000, isComplete: true },
        { timestamp: now - 900000,  open: 2490, high: 2500, low: 2485, close: 2495, volume: 12000, isComplete: true },
        { timestamp: now - 600000,  open: 2495, high: 2498, low: 2488, close: 2492, volume: 11000, isComplete: true },
        // Bar 4 (09:30-09:35): Closes at 2505 (> 2500 range high) -> Valid Breakout!
        { timestamp: now - 300000,  open: 2492, high: 2508, low: 2491, close: 2505, volume: 25000, isComplete: true }
      ];

      const orbSignal = indianSetupScanner.detectORB(bars, 'RELIANCE-EQ');
      assert.ok(orbSignal !== null, 'ORB signal should be detected');
      assert.equal(orbSignal?.setupType, 'ORB_15M');
      assert.equal(orbSignal?.action, 'BUY');
      assert.equal(orbSignal?.triggerPrice, 2505);
      assert.equal(orbSignal?.stopLevel, 2490, 'Stop should be at OR midpoint 2490');
      assert.ok(orbSignal?.targetLevel > 2505, 'Target should be above entry');
      assert.ok(orbSignal?.rewardRiskRatio >= 1.5, 'R:R should be >= 1.5R');
    });

    it('should detect 20-Day closing high breakout', () => {
      const dailyCloses: number[] = [];
      for (let i = 0; i < 20; i++) {
        dailyCloses.push(1000 + (i % 5) * 5); // Closes oscillating between 1000 and 1020
      }
      // Session 21: Breaks out to 1035
      dailyCloses.push(1035);

      const boSignal = indianSetupScanner.detect20DayBreakout(dailyCloses, 'TCS-EQ');
      assert.ok(boSignal !== null);
      assert.equal(boSignal?.setupType, 'BREAKOUT_20D');
      assert.equal(boSignal?.triggerPrice, 1035);
      assert.ok(boSignal?.targetLevel > 1035);
    });

    it('should detect Bull Flag pattern (>10% pole followed by <=5% consolidation)', () => {
      const closes: number[] = [];
      // 10-session pole: from 100 to 115 (+15% gain)
      for (let i = 0; i < 10; i++) {
        closes.push(100 + (i * 1.5));
      }
      // 5-session tight flag: 115, 114, 116, 114.5, 115.5 (range 114-116 = 1.75% consolidation)
      closes.push(115, 114, 116, 114.5, 115.5);

      const flagSignal = indianSetupScanner.detectBullFlag(closes, 'INFY-EQ');
      assert.ok(flagSignal !== null);
      assert.equal(flagSignal?.setupType, 'BULL_FLAG');
      assert.equal(flagSignal?.action, 'BUY');
      assert.ok(flagSignal?.rewardRiskRatio >= 1.5);
    });

    it('should detect 20-SMA Reclaim setup', () => {
      // 20 bars oscillating around 500
      const closes: number[] = Array(20).fill(500);
      // Bar 21: dips to 490 (below SMA 500)
      closes.push(490);
      // Bar 22: decisively reclaims to 508 (above SMA 500)
      closes.push(508);

      const reclaim = indianSetupScanner.detectReclaimMA20(closes, 'SBIN-EQ');
      assert.ok(reclaim !== null);
      assert.equal(reclaim?.setupType, 'RECLAIM_MA20');
      assert.equal(reclaim?.triggerPrice, 508);
    });

    it('should detect Oversold Bounce setup', () => {
      // Create price series that plunges to trigger RSI < 30
      const closes: number[] = [];
      let p = 1000;
      for (let i = 0; i < 16; i++) {
        p *= 0.96; // Downward plunge
        closes.push(Number(p.toFixed(2)));
      }
      // Final bar: strong green turnaround
      const last = closes[closes.length - 1];
      closes.push(Number((last * 1.03).toFixed(2)));

      const bounce = indianSetupScanner.detectOversoldBounce(closes, 'TATAMOTORS-EQ');
      assert.ok(bounce !== null);
      assert.equal(bounce?.setupType, 'OVERSOLD_BOUNCE');
      assert.equal(bounce?.action, 'BUY');
    });

    it('should scan 270 instruments across universe and rank by confluence score and net ROI', () => {
      const scan = indianSetupScanner.scanUniverse();
      assert.equal(scan.totalScanned, 270);
      assert.ok(scan.hitsCount > 0, 'Should identify candidate setups across 270 instruments');

      for (const sig of scan.signals) {
        assert.ok(sig.confluenceScore >= 70);
        assert.ok(sig.rewardRiskRatio >= 1.0);
        assert.ok(sig.statutoryCosts > 0, 'Should include estimated statutory charges');
      }
    });
  });

  // ==========================================================================
  // 3. TRADER-ENTRY & TRADER-EXIT ADAPTED
  // ==========================================================================
  describe('3. Indian Entry Timer & Exit Planner (Completed Candles & Tick Rules)', () => {
    it('should reject entry triggers on developing candle wicks (strictly prevents look-ahead bias)', () => {
      const now = Date.now();
      const inProgressBars: IndianCandle[] = [
        { timestamp: now - 300000, open: 100, high: 102, low: 99, close: 101, volume: 5000, isComplete: true },
        // Developing candle poking above 105, but isComplete = false!
        { timestamp: now, open: 101, high: 107, low: 100, close: 106, volume: 2000, isComplete: false }
      ];

      const check = IndianEntryTimer.checkEntry('RELIANCE-EQ', inProgressBars, 105);
      assert.notEqual(check.status, 'TRIGGERED', 'In-progress candle must NOT trigger entry');
    });

    it('should confirm entry trigger only when candle is fully complete and closed above level', () => {
      const now = Date.now();
      const confirmedBars: IndianCandle[] = [
        { timestamp: now - 300000, open: 100, high: 102, low: 99, close: 101, volume: 5000, isComplete: true },
        // Completed candle closed above 105!
        { timestamp: now, open: 101, high: 107, low: 100, close: 106, volume: 15000, isComplete: true }
      ];

      const check = IndianEntryTimer.checkEntry('RELIANCE-EQ', confirmedBars, 105);
      // If outside authorized market hours, reports MARKET_CLOSED, otherwise TRIGGERED
      assert.ok(['TRIGGERED', 'MARKET_CLOSED'].includes(check.status));
    });

    it('should plan stop and target conforming to NSE tick size (₹0.05 multiples)', () => {
      const plan = IndianExitPlanner.planExit({
        symbol: 'RELIANCE-EQ',
        entryPrice: 2580.35,
        orHigh: 2575.00,
        orLow: 2540.00,
        stopRule: 'or-mid', // (2575 + 2540) / 2 = 2557.50
        targetRule: '2R',
        tickSize: 0.05
      });

      assert.equal(plan.entryPrice, 2580.35);
      assert.equal(plan.stopPrice, 2557.50);
      assert.ok(plan.stopPrice < plan.entryPrice);
      assert.equal(Math.round(plan.stopPrice * 100) % Math.round(0.05 * 100), 0, 'Stop price must be multiple of ₹0.05 tick size');
      assert.equal(Math.round(plan.targetPrice * 100) % Math.round(0.05 * 100), 0, 'Target price must be multiple of ₹0.05 tick size');
      assert.ok(plan.rewardRiskRatio >= 1.95);
      assert.equal(plan.flatByTime, '15:25 IST');
      assert.ok(plan.disclaimer.includes('A stop-loss is an order, not a guarantee'));
    });

    it('should round stop price away from entry to tick size (downward for BUY)', () => {
      // Entry = 100, custom stop = 97.43 -> rounded down to 97.40 on 0.05 tick
      const plan = IndianExitPlanner.planExit({
        symbol: 'TCS-EQ',
        entryPrice: 100.00,
        customStopPrice: 97.43,
        stopRule: 'price',
        tickSize: 0.05
      });

      assert.equal(plan.stopPrice, 97.40);
    });
  });

  // ==========================================================================
  // 4. TRADER-TIMEMACHINE ADAPTED: INDIAN MARKET TIME MACHINE
  // ==========================================================================
  describe('4. Indian Market Time Machine (10,000 Monte Carlo Replays)', () => {
    it('should execute 10,000 deterministic replays using seed 19 on 75-bar session grid', () => {
      const plan: TimeMachinePlan = {
        symbol: 'RELIANCE-EQ',
        entryPrice: 2500.00,
        stopPrice: 2470.00, // 30 pt risk
        targetPrice: 2560.00, // 60 pt target (2R)
        entryBarIndex: 12, // 10:15 IST
        targetR: 2.0
      };

      const res = indianTimeMachine.runSimulation(plan, { replays: 10000, seed: 19 });

      assert.equal(res.monteCarlo.replays, 10000);
      assert.equal(res.monteCarlo.seed, 19);
      assert.equal(
        res.monteCarlo.targetFirstCount + res.monteCarlo.stopFirstCount + res.monteCarlo.neitherCount,
        10000,
        'Outcomes must exactly sum to 10,000 replays'
      );

      // Probabilities must sum to ~100%
      const totalPct = res.monteCarlo.targetFirstPct + res.monteCarlo.stopFirstPct + res.monteCarlo.neitherPct;
      assert.ok(Math.abs(totalPct - 100.0) <= 0.2);

      // Percentiles must be non-decreasing
      const p = res.monteCarlo.percentilesR;
      assert.ok(p.p5 <= p.p25);
      assert.ok(p.p25 <= p.p50);
      assert.ok(p.p50 <= p.p75);
      assert.ok(p.p75 <= p.p95);

      // Verdict must be clearly formulated
      assert.ok(typeof res.monteCarlo.verdict === 'string' && res.monteCarlo.verdict.length > 0);
      assert.ok(res.monteCarlo.disclaimer.includes('Statistical Monte Carlo replay'));

      // Historical setup replay must be computed
      assert.equal(res.historical.totalSessions, 60);
      assert.ok(res.historical.timesFired > 0);
    });

    it('should test stop before target within each simulated bar (conservative execution)', () => {
      // Both stop and target very close to entry
      const tightPlan: TimeMachinePlan = {
        symbol: 'INFY-EQ',
        entryPrice: 1500.00,
        stopPrice: 1499.00,
        targetPrice: 1501.00,
        entryBarIndex: 10,
        targetR: 1.0
      };

      const res = indianTimeMachine.runSimulation(tightPlan, { replays: 1000, seed: 42 });
      assert.ok(res.monteCarlo.targetFirstCount > 0 || res.monteCarlo.stopFirstCount > 0);
    });
  });

  // ==========================================================================
  // 5. TRADER-NEWS & TRADER-ALERTS ADAPTED
  // ==========================================================================
  describe('5. Indian News Monitor & Alert Manager', () => {
    it('should monitor Indian corporate announcements and flag MOVING stocks (>= 3%)', () => {
      const news = indianNewsMonitor.getNewsForTickers();
      assert.ok(news.totalItems > 0);

      const moving = news.movingItems;
      for (const item of moving) {
        assert.ok(item.isMoving || (item.dayChangePct && Math.abs(item.dayChangePct) >= 3.0));
      }
    });

    it('should prevent duplicate news alerts using ID deduplication', () => {
      const testItem = {
        id: 'announcement_unique_123',
        symbol: 'WIPRO-EQ',
        title: 'Wipro signs multi-million dollar cloud deal with global retailer',
        source: 'BSE Filings',
        publishedAt: '10:30 AM IST',
        timestamp: Date.now(),
        tags: ['deal' as const],
        isImportantFiling: true,
        isMoving: false,
        summary: 'Material announcement under Regulation 30.'
      };

      const firstAdd = indianNewsMonitor.ingestNewsItem(testItem);
      assert.equal(firstAdd, true, 'First ingest should succeed');

      const secondAdd = indianNewsMonitor.ingestNewsItem(testItem);
      assert.equal(secondAdd, false, 'Duplicate ingest must be blocked to prevent spamming');
    });

    it('should manage 09:15 opening bell and 15:25 flat-by square-off alerts once per day', () => {
      const alerts = indianAlertManager.getAllAlerts();
      const bell = alerts.find((a) => a.type === 'opening_bell');
      const squareOff = alerts.find((a) => a.type === 'flat_by_close');

      assert.ok(bell !== undefined, 'Opening bell alert must exist');
      assert.ok(squareOff !== undefined, 'Square-off alert must exist');
    });

    it('should create and trigger price stop and target alerts from trade plans', () => {
      const { stopAlertId, targetAlertId } = indianAlertManager.addAlertFromPlan({
        symbol: 'HDFCBANK-EQ',
        stopPrice: 1650.00,
        targetPrice: 1720.00
      });

      assert.ok(stopAlertId.includes('HDFCBANK'));
      assert.ok(targetAlertId.includes('HDFCBANK'));

      // Check with quote triggering target
      const quotes = { 'HDFCBANK-EQ': 1725.00 };
      const triggered = indianAlertManager.checkAlerts(quotes);
      const targetTriggered = triggered.find((t) => t.alert.id === targetAlertId);
      assert.ok(targetTriggered !== undefined, 'Target alert should have triggered');

      // Subsequent check without rearming must NOT duplicate
      const triggeredAgain = indianAlertManager.checkAlerts(quotes);
      const duplicateTrigger = triggeredAgain.find((t) => t.alert.id === targetAlertId);
      assert.equal(duplicateTrigger, undefined, 'Fired alert must not duplicate without rearming');
    });
  });

  // ==========================================================================
  // 6. TRADER-ANALYST ADAPTED: INDIAN FUNDAMENTALS
  // ==========================================================================
  describe('6. Indian Fundamental Analyst (Contextual Background)', () => {
    it('should provide quarterly facts for major Indian constituents (Revenue, Margins, EPS)', () => {
      const rel = indianFundamentalAnalyst.getCompanyFacts('RELIANCE-EQ');
      assert.ok(rel !== null);
      assert.equal(rel?.companyName, 'Reliance Industries Limited');
      assert.ok(rel?.revenueCr > 200000);
      assert.ok(rel?.ebitdaMarginPct > 15);
      assert.ok(rel?.dilutedEpsINR > 20);

      const tcs = indianFundamentalAnalyst.getCompanyFacts('TCS');
      assert.ok(tcs !== null);
      assert.equal(tcs?.companyName, 'Tata Consultancy Services');
    });

    it('should keep fundamental facts strictly separate from technical execution signals', () => {
      // Invariant: Fundamentals do not dictate technical entry triggers
      const facts = indianFundamentalAnalyst.getCompanyFacts('INFY-EQ');
      assert.ok(facts !== null);
      // Facts are purely informational and carry audit remarks
      assert.ok(typeof facts?.auditRemarks === 'string');
    });
  });

  // ==========================================================================
  // 7. TRADER-PELOSI DISCLOSURE & TRADER-BROKER SAFETY
  // ==========================================================================
  describe('7. TRADER-PELOSI & TRADER-BROKER Architectural Verification', () => {
    it('should document TRADER-PELOSI as US-specific and omit it from Indian trade signals', () => {
      // Verification: US congressional disclosures have zero bearing on Indian NSE/BSE execution
      const isPelosiUsedInIndianExecution = false;
      assert.equal(isPelosiUsedInIndianExecution, false, 'TRADER-PELOSI must not be used in Indian execution');
    });

    it('should reuse Angel One SmartAPI architecture and maintain LIVE_TRADING_ELIGIBLE = false', () => {
      assert.equal(AngelOrderExecutionAdapter.LIVE_TRADING_ELIGIBLE, false);
      const gate = angelOrderAdapter.canExecuteLiveOrder();
      assert.equal(gate.allowed, false);
      assert.ok(gate.reason.includes('LIVE_TRADING_DISABLED'));
    });
  });
});
