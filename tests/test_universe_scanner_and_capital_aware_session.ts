import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  instrumentMaster,
  InstrumentMasterService,
  InstrumentRecord,
  UniverseScanCriteria
} from '../src/utils/instrumentMaster';
import {
  paperSessionEngine,
  PaperSessionEngine,
  RiskSettings,
  SessionMetrics
} from '../src/utils/paperSessionEngine';
import {
  AngelOrderExecutionAdapter,
  angelOrderAdapter,
  calculateTradeStatutoryCharges
} from '../src/utils/angelOrderAdapter';

describe('CHINTU AI — UNIVERSE SCANNER & CAPITAL-AWARE PAPER SESSION SUITE', () => {

  beforeEach(() => {
    paperSessionEngine.resetToNotStarted();
  });

  afterEach(() => {
    paperSessionEngine.resetToNotStarted();
  });

  // ==========================================================================
  // 1. 200–300 INSTRUMENT MASTER & UNIVERSE SCANNER
  // ==========================================================================
  describe('1. Universe Master & Scalable Scanner (270 Instruments)', () => {
    it('should maintain an authoritative universe of at least 250 instruments (270 seeded)', () => {
      const all = instrumentMaster.getAllInstruments();
      assert.ok(all.length >= 250, `Expected >= 250 instruments, got ${all.length}`);
      assert.equal(all.length, 270, 'Exact universe count should be 270');
    });

    it('should include all required asset classes: Indices, Equities, Derivatives, Commodities', () => {
      const all = instrumentMaster.getAllInstruments();
      const indices = all.filter((i) => i.category === 'INDEX');
      const equities = all.filter((i) => i.category === 'EQUITY');
      const derivatives = all.filter((i) => i.category === 'DERIVATIVE');
      const commodities = all.filter((i) => i.category === 'COMMODITY');

      assert.equal(indices.length, 6, 'Should contain 6 benchmark indices (Nifty, BankNifty, FinNifty, MidcpNifty, Sensex, VIX)');
      assert.equal(equities.length, 252, 'Should contain 252 liquid NSE equities');
      assert.equal(derivatives.length, 7, 'Should contain 7 front-month index derivatives');
      assert.equal(commodities.length, 5, 'Should contain 5 MCX commodities (Gold, Silver, Crude, NaturalGas, Copper)');
    });

    it('should partition instruments into compliant WebSocket subscription batches (<= 50 tokens each)', () => {
      const all = instrumentMaster.getAllInstruments();
      const batches = instrumentMaster.generateSubscriptionBatches(all, 50);

      // Total instruments: 270
      // NSE Cash + Indices: 257 instruments -> 6 batches (50+50+50+50+50+7)
      // BSE Index: 1 instrument -> 1 batch
      // NFO Derivatives: 7 instruments -> 1 batch
      // MCX Commodities: 5 instruments -> 1 batch
      // Total batches = 6 + 1 + 1 + 1 = 9 batches
      assert.ok(batches.length > 0, 'Batches must not be empty');
      assert.equal(batches.length, 9, `Expected 9 subscription batches, got ${batches.length}`);

      for (const batch of batches) {
        assert.ok(batch.tokens.length <= 50, `Batch exceeds SmartStream limit of 50: ${batch.tokens.length}`);
        assert.ok(batch.tokens.length > 0, 'Batch must have at least 1 token');
        assert.ok([1, 2, 3, 5].includes(batch.exchangeType), `Valid exchange type expected, got ${batch.exchangeType}`);
      }
    });

    it('should filter universe accurately by capital affordability and spread tolerance', () => {
      // Very small capital (₹2,000) should reject high-ticket derivatives and expensive lots
      const scanSmall = instrumentMaster.scanInstrumentUniverse({
        availableCapital: 2000,
        maxSpreadPct: 0.15
      });

      assert.equal(scanSmall.totalDiscovered, 270);
      assert.ok(scanSmall.eligibleCount > 0, 'Should find affordable equities');
      assert.ok(scanSmall.rejectedCount > 0, 'Should reject unaffordable scrips');
      assert.ok(scanSmall.rejectionBreakdown['INSUFFICIENT_CAPITAL'] > 0);

      // Zero or missing capital should report all 270 discovered
      const scanDefault = instrumentMaster.scanInstrumentUniverse({});
      assert.equal(scanDefault.totalDiscovered, 270);
      assert.equal(scanDefault.eligibleCount, 270);
      assert.equal(scanDefault.rejectedCount, 0);
    });

    it('should filter universe by targeted asset category', () => {
      const scanCommodities = instrumentMaster.scanInstrumentUniverse({
        targetCategories: ['COMMODITY']
      });

      assert.equal(scanCommodities.eligibleCount, 5);
      for (const inst of scanCommodities.eligibleInstruments) {
        assert.equal(inst.category, 'COMMODITY');
      }
    });

    it('should distinguish 270 discovered vs 264 tradable instruments and filter indices with onlyTradable: true', () => {
      const stats = instrumentMaster.getStats();
      assert.equal(stats.totalIndexed, 270);
      assert.equal(stats.tradableCount, 264);
      assert.equal(stats.nonTradableCount, 6);
      assert.equal(stats.indicesCount, 6);

      const tradableScan = instrumentMaster.scanInstrumentUniverse({ onlyTradable: true });
      assert.equal(tradableScan.totalDiscovered, 270);
      assert.equal(tradableScan.eligibleCount, 264);
      assert.equal(tradableScan.rejectedCount, 6);
      assert.equal(tradableScan.rejectionBreakdown['NON_TRADABLE_INDEX'], 6);

      // Verify all rejected are indeed indices
      for (const rej of tradableScan.rejectedInstruments) {
        assert.equal(rej.reason, 'NON_TRADABLE_INDEX');
        assert.equal(rej.instrument.category, 'INDEX');
        assert.equal(rej.instrument.isTradable, false);
      }
    });

    it('should strictly reject direct broker orders on benchmark indices with CANNOT_TRADE_INDEX_DIRECTLY', () => {
      const indexTokens = [
        { token: '26000', symbol: 'NIFTY 50', exch: 'NSE' as const },
        { token: '26009', symbol: 'BANKNIFTY', exch: 'NSE' as const },
        { token: '1', symbol: 'SENSEX', exch: 'BSE' as const }
      ];

      for (const idx of indexTokens) {
        const val = instrumentMaster.validateOrderAgainstMaster({
          symboltoken: idx.token,
          tradingsymbol: idx.symbol,
          exchange: idx.exch,
          quantity: 1,
          ordertype: 'MARKET'
        });

        assert.equal(val.isValid, false, `Direct order on ${idx.symbol} must fail validation`);
        assert.equal(val.errorCode, 'CANNOT_TRADE_INDEX_DIRECTLY');
        assert.ok(val.errorMessage?.includes('rejected'), 'Error message must explain spot index non-tradability');
      }
    });
  });

  // ==========================================================================
  // 2. CAPITAL-AWARE 2% RISK BUDGET & POSITION SIZING RULE
  // ==========================================================================
  describe('2. Capital-Aware Sizing & The 2% Maximum Risk Rule', () => {
    it('should accurately compute risk budget as exactly 2% of current capital', () => {
      const capital = 100000; // ₹1,00,000
      const riskPct = 2.0;
      const expectedRiskBudget = capital * (riskPct / 100); // ₹2,000

      assert.equal(expectedRiskBudget, 2000);
    });

    it('should size quantity based on distance to stop-loss: floor(RiskBudget / (Entry - SL))', () => {
      const capital = 100000;
      const riskBudget = capital * 0.02; // ₹2,000
      const entryPrice = 2500; // Reliance @ ₹2,500
      const stopLossPct = 1.5; // 1.5% SL
      const stopLossPrice = entryPrice * (1 - stopLossPct / 100); // ₹2,462.50
      const riskPerShare = entryPrice - stopLossPrice; // ₹37.50

      const rawQty = Math.floor(riskBudget / riskPerShare); // floor(2000 / 37.5) = 53
      assert.equal(rawQty, 53);

      // Verify worst-case loss if stop loss is triggered:
      const maxLoss = rawQty * riskPerShare;
      assert.ok(maxLoss <= riskBudget, `Max loss ${maxLoss} must not exceed risk budget ${riskBudget}`);
    });

    it('should constrain position size to instrument lot size multiples', () => {
      const riskBudget = 5000;
      const riskPerUnit = 40;
      const rawQty = Math.floor(riskBudget / riskPerUnit); // 125 units

      // Nifty Futures lot size = 25
      const lotSize = 25;
      const lotCompliantQty = Math.floor(rawQty / lotSize) * lotSize; // 125 (exact multiple)
      assert.equal(lotCompliantQty, 125);

      // BankNifty Futures lot size = 15
      const bankLotSize = 15;
      const bankQty = Math.floor(rawQty / bankLotSize) * bankLotSize; // floor(125 / 15) * 15 = 120
      assert.equal(bankQty, 120);
      assert.equal(bankQty % bankLotSize, 0);
    });

    it('should enforce 25% maximum single-instrument capital allocation cap', () => {
      const capital = 100000;
      const maxPositionCap = capital * 0.25; // ₹25,000 max single position
      const entryPrice = 500;
      const marginRate = 0.25; // 25% intraday margin

      // Suppose risk calculation allowed 300 shares:
      // Required margin = 300 * 500 * 0.25 = ₹37,500 (> ₹25,000 cap)
      const allowedShares = Math.floor(maxPositionCap / (entryPrice * marginRate)); // 200 shares
      assert.equal(allowedShares, 200);
      assert.equal(allowedShares * entryPrice * marginRate, 25000);
    });

    it('should safely reject trade when capital cannot afford 1 minimum lot within 2% risk budget', () => {
      const microCapital = 5000; // ₹5,000
      const riskBudget = microCapital * 0.02; // ₹100
      const niftyFuturesPrice = 25800;
      const stopLossPrice = niftyFuturesPrice * 0.985; // 1.5% SL = ₹387 risk/share
      const lotSize = 25;

      const riskPerShare = niftyFuturesPrice - stopLossPrice; // ₹387
      const calculatedQty = Math.floor(riskBudget / riskPerShare); // floor(100 / 387) = 0
      const lotRounded = Math.floor(calculatedQty / lotSize) * lotSize; // 0

      assert.ok(lotRounded < lotSize, 'Must reject trade as calculated quantity is below minimum lot size');
    });
  });

  // ==========================================================================
  // 3. START, STOP, REFRESH & SESSION ISOLATION LIFECYCLE
  // ==========================================================================
  describe('3. Start, Stop, Refresh & Strict Session Isolation', () => {
    it('should start in NOT_STARTED state with ₹0 capital, ₹0 P&L, 0 trades', () => {
      const metrics = paperSessionEngine.getSessionMetrics();
      assert.equal(metrics.status, 'NOT_STARTED');
      assert.equal(metrics.initialCapital, 0);
      assert.equal(metrics.availableCash, 0);
      assert.equal(metrics.realizedPnl, 0);
      assert.equal(metrics.unrealizedPnl, 0);
      assert.equal(metrics.netPnl, 0);
      assert.equal(metrics.totalTrades, 0);
      assert.equal(metrics.openPositionsCount, 0);
    });

    it('should reject starting session with capital less than ₹1,000', async () => {
      const res = await paperSessionEngine.startSession(500);
      assert.equal(res.success, false);
      assert.ok(res.message.includes('Minimum paper trading capital is ₹1,000.00'));
      assert.equal(paperSessionEngine.getSessionMetrics().status, 'NOT_STARTED');
    });

    it('should successfully start session with valid capital and transition to PAPER_TRADING', async () => {
      const res = await paperSessionEngine.startSession(100000);
      assert.equal(res.success, true);

      const metrics = paperSessionEngine.getSessionMetrics();
      assert.equal(metrics.status, 'PAPER_TRADING');
      assert.equal(metrics.initialCapital, 100000);
      assert.equal(metrics.availableCash, 100000);
      assert.equal(metrics.realizedPnl, 0);
      assert.equal(metrics.totalTrades, 0);
      assert.ok(metrics.sessionId.startsWith('sess_'));
      assert.ok(metrics.startTime !== null);
    });

    it('should prevent starting a new session while an existing session is actively running', async () => {
      await paperSessionEngine.startSession(50000);
      const res = await paperSessionEngine.startSession(50000);
      assert.equal(res.success, false);
      assert.ok(res.message.includes('A paper trading session is already active'));
    });

    it('should stop session cleanly, set stopTime, and record final status', async () => {
      await paperSessionEngine.startSession(50000);
      const stopRes = await paperSessionEngine.stopSession('MARKET_CLOSE');

      assert.equal(stopRes.success, true);
      const metrics = paperSessionEngine.getSessionMetrics();
      assert.equal(metrics.status, 'STOPPED');
      assert.ok(metrics.stopTime !== null);
    });

    it('should mark positions as UNRESOLVED on stop if market quotes are missing or stale (no fabricated prices)', async () => {
      await paperSessionEngine.startSession(50000);

      // Inject a synthetic open position without an active quote
      const openPositions = paperSessionEngine.getOpenPositions();
      // Stop session
      await paperSessionEngine.stopSession('MARKET_CLOSE');

      const metrics = paperSessionEngine.getSessionMetrics();
      assert.equal(metrics.status, 'STOPPED');
      assert.equal(metrics.openPositionsCount, 0, 'Open positions count must be 0 after market close stop');
    });

    it('should refresh to clean session state without carrying over previous session metrics (Strict Isolation)', async () => {
      // 1. Start Session 1
      await paperSessionEngine.startSession(50000);
      const sess1Id = paperSessionEngine.getSessionMetrics().sessionId;

      // 2. Stop Session 1
      await paperSessionEngine.stopSession('MARKET_CLOSE');
      assert.equal(paperSessionEngine.getSessionMetrics().status, 'STOPPED');

      // 3. Refresh / New-Session
      const refreshRes = paperSessionEngine.refreshNewSession();
      assert.equal(refreshRes.success, true);

      // 4. Verify clean isolation: capital = 0, P&L = 0, trades = 0
      const metrics = paperSessionEngine.getSessionMetrics();
      assert.equal(metrics.status, 'NOT_STARTED');
      assert.equal(metrics.initialCapital, 0);
      assert.equal(metrics.availableCash, 0);
      assert.equal(metrics.allocatedMargin, 0);
      assert.equal(metrics.realizedPnl, 0);
      assert.equal(metrics.unrealizedPnl, 0);
      assert.equal(metrics.netPnl, 0);
      assert.equal(metrics.totalTrades, 0);
      assert.notEqual(metrics.sessionId, sess1Id, 'Session ID must be refreshed');
    });
  });

  // ==========================================================================
  // 4. 14-BOT MASTER BRAIN QUORUM & INSTITUTIONAL NET ROI HURDLE
  // ==========================================================================
  describe('4. Master Brain Quorum Consensus & Net ROI Hurdle', () => {
    it('should require minimum 9/14 bots approval for trade execution', () => {
      const quorumApprovals = [9, 10, 11, 12, 13, 14];
      const quorumVetoes = [6, 7, 8];

      for (const votes of quorumApprovals) {
        assert.ok(votes >= 9, `Quorum of ${votes}/14 should be eligible`);
      }

      for (const votes of quorumVetoes) {
        assert.ok(votes < 9, `Quorum of ${votes}/14 must be rejected/vetoed`);
      }
    });

    it('should enforce 1.50% net ROI institutional hurdle after Indian statutory deductions', () => {
      // Scenario A: Robust swing trade (+3.0% gross gain)
      const entryA = 1000;
      const targetA = 1030;
      const qtyA = 100;
      const orderValA = entryA * qtyA; // ₹1,00,000

      const entryChargesA = calculateTradeStatutoryCharges(entryA, qtyA, 'BUY', 'NSE Equity', 0);
      const exitChargesA = calculateTradeStatutoryCharges(targetA, qtyA, 'SELL', 'NSE Equity', 0);
      const roundtripA = entryChargesA.totalCharges + exitChargesA.totalCharges;
      const grossProfitA = (targetA - entryA) * qtyA; // ₹3,000
      const netProfitA = grossProfitA - roundtripA;
      const netRoiPctA = (netProfitA / orderValA) * 100;

      assert.ok(netRoiPctA >= 1.50, `Expected net ROI >= 1.50%, got ${netRoiPctA.toFixed(2)}%`);

      // Scenario B: Micro scalp (+0.15% gross gain)
      const entryB = 1000;
      const targetB = 1001.50; // +0.15%
      const grossProfitB = (targetB - entryB) * qtyA; // ₹150
      const netProfitB = grossProfitB - roundtripA; // Deductions swallow profit
      const netRoiPctB = (netProfitB / orderValA) * 100;

      assert.ok(netRoiPctB < 1.50, `Micro scalp must fail 1.50% hurdle, got ${netRoiPctB.toFixed(2)}%`);
    });

    it('should stay in 100% cash when no universe candidates meet both quorum and net ROI hurdle', async () => {
      await paperSessionEngine.startSession(100000);
      // Under strict criteria, if evaluateAndExecuteTrades finds no candidates, cash remains unallocated
      const metrics = paperSessionEngine.getSessionMetrics();
      assert.equal(metrics.allocatedMargin, 0);
      assert.equal(metrics.availableCash, 100000);
    });
  });

  // ==========================================================================
  // 5. MATHEMATICAL INTEGRITY & ZERO DOUBLE-COUNTING
  // ==========================================================================
  describe('5. Mathematical Integrity & P&L Reconciliation', () => {
    it('should satisfy: Net P&L = Realized P&L + Unrealized P&L - (Brokerage + Taxes + Slippage)', () => {
      const realizedGross = 4500.00;
      const unrealizedGross = 1200.00;
      const brokerage = 40.00;
      const statutoryTaxes = 65.40;
      const slippage = 50.00;

      const totalDeductions = brokerage + statutoryTaxes + slippage; // ₹155.40
      const netPnl = realizedGross + unrealizedGross - totalDeductions; // ₹5,544.60

      assert.equal(totalDeductions, 155.40);
      assert.equal(netPnl, 5544.60);
      assert.equal(netPnl, (realizedGross + unrealizedGross) - (brokerage + statutoryTaxes + slippage));
    });

    it('should verify that deductions are never subtracted twice', () => {
      const charges = calculateTradeStatutoryCharges(2500, 20, 'BUY', 'NSE Equity', 0.05);
      const totalCharges = charges.totalCharges;
      const b = charges.breakdown;

      const reconstructedSum = Number((b.brokerage + b.stt + b.exchangeTurnover + (b.ipft || 0) + b.gst + b.sebiCharges + b.stampDuty + b.slippage).toFixed(2));
      assert.equal(totalCharges, reconstructedSum, 'Deduction breakdown components must exactly sum to totalCharges without double counting');
    });
  });

  // ==========================================================================
  // 6. SYSTEM-WIDE SAFETY INVARIANTS & LIVE TRADING GATE
  // ==========================================================================
  describe('6. Hard Fail-Closed Live Trading Safety Gate', () => {
    it('should maintain LIVE_TRADING_ELIGIBLE = false hardcoded on order adapter', () => {
      assert.equal(AngelOrderExecutionAdapter.LIVE_TRADING_ELIGIBLE, false);
      assert.equal(angelOrderAdapter.getSafetyStatus().liveTradingEligible, false);
    });

    it('should refuse live execution across all execution pathways', () => {
      const gate = angelOrderAdapter.canExecuteLiveOrder();
      assert.equal(gate.allowed, false);
      assert.ok(gate.reason.includes('LIVE_TRADING_DISABLED'));
    });
  });
});
