/**
 * CHINTU AI + JARVIS — UNIFIED INTELLIGENT TRADING ENGINE VERIFICATION SUITE
 *
 * Verifies:
 * 1. Master Brain 14-Bot Quorum Consensus Engine (>= 9/14 Quorum rule).
 * 2. Jarvis Review Gate (Data Freshness, Profit Hurdle, Quorum, Risk Scenarios).
 * 3. Capital-Aware Paper Engine:
 *    - Rejection of infeasible trades under small capital (₹1,000) within 2% risk.
 *    - Rejection when expected net profit < user's minimum desired net profit (₹60).
 *    - Acceptance and execution when conditions and hurdles are satisfied.
 * 4. Asynchronous News & Sentiment decoupling (no tick blocking).
 * 5. Architectural lock: LIVE_TRADING_ELIGIBLE = false.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { jarvisReviewGate } from '../src/utils/jarvisReviewGate';
import { paperSessionEngine } from '../src/utils/paperSessionEngine';
import { evaluate14BotQuorumConsensus, BOT_DEFINITIONS } from '../src/utils/quorumConsensusEngine';
import { AngelOrderExecutionAdapter } from '../src/utils/angelOrderAdapter';
import { IndianNewsMonitor } from '../src/utils/indianNewsAndAlerts';
import { analyzeHeadlineSentiment } from '../src/utils/newsSentimentAnalyzer';

describe('Unified Chintu AI + Jarvis Trading Engine Suite', () => {

  test('1. Architecture Security Lock: LIVE_TRADING_ELIGIBLE is permanently false', () => {
    assert.strictEqual(
      AngelOrderExecutionAdapter.LIVE_TRADING_ELIGIBLE,
      false,
      'LIVE_TRADING_ELIGIBLE must be permanently locked to false'
    );
    const adapter = new AngelOrderExecutionAdapter();
    const gate = adapter.canExecuteLiveOrder();
    assert.strictEqual(gate.allowed, false);
    assert.ok(gate.reason.includes('LIVE_TRADING_DISABLED'));
  });

  test('2. 14 Canonical Strategy Bots Preservation & Quorum Consensus Rules', () => {
    assert.strictEqual(BOT_DEFINITIONS.length, 14, 'All 14 canonical bots must be registered');
    
    // Test 14-bot consensus evaluator
    const quorumResult = evaluate14BotQuorumConsensus({
      symbol: 'RELIANCE',
      action: 'BUY',
      price: 1194.00
    });

    assert.ok(typeof quorumResult.matchingVotes === 'number');
    assert.strictEqual(quorumResult.totalBots, 14);
    assert.ok(quorumResult.botVotes.length === 14);

    // Rule: if matchingVotes >= 9 => APPROVED; if 7-8 => QUORUM_VETO; <= 6 => INSUFFICIENT_CONSENSUS
    if (quorumResult.matchingVotes >= 9) {
      assert.strictEqual(quorumResult.isApproved, true);
      assert.strictEqual(quorumResult.decision, 'APPROVED');
    } else if (quorumResult.matchingVotes >= 7) {
      assert.strictEqual(quorumResult.isApproved, false);
      assert.strictEqual(quorumResult.decision, 'QUORUM_VETO');
    } else {
      assert.strictEqual(quorumResult.isApproved, false);
      assert.strictEqual(quorumResult.decision, 'INSUFFICIENT_CONSENSUS');
    }
  });

  test('3. Jarvis Review Gate: Stale market data (> 120s) triggers NEEDS_MORE_DATA', async () => {
    const staleTimestamp = Date.now() - 150000; // 2.5 minutes ago
    const result = await jarvisReviewGate.reviewTradeOpportunity({
      symbol: 'RELIANCE',
      action: 'BUY',
      price: 1194.00,
      targetPrice: 1229.82,
      stopLossPrice: 1176.09,
      expectedNetProfit: 150.00,
      expectedNetRoiPct: 2.85,
      minDesiredNetProfit: 60.00,
      capital: 100000,
      riskBudget: 2000,
      quorumVotes: 10,
      confluenceScore: 88,
      marketDataTimestamp: staleTimestamp
    });

    assert.strictEqual(result.decision, 'NEEDS_MORE_DATA');
    assert.ok(result.rationale.includes('stale'));
  });

  test('4. Jarvis Review Gate: Quorum failure (< 9) triggers REJECT', async () => {
    const result = await jarvisReviewGate.reviewTradeOpportunity({
      symbol: 'TATAMOTORS',
      action: 'BUY',
      price: 263.00,
      targetPrice: 270.89,
      stopLossPrice: 259.05,
      expectedNetProfit: 120.00,
      expectedNetRoiPct: 2.5,
      minDesiredNetProfit: 60.00,
      capital: 100000,
      riskBudget: 2000,
      quorumVotes: 7, // Quorum veto!
      confluenceScore: 72,
      marketDataTimestamp: Date.now()
    });

    assert.strictEqual(result.decision, 'REJECT');
    assert.ok(result.rationale.includes('Master Brain quorum consensus failed'));
  });

  test('5. Jarvis Review Gate: Net profit below minDesiredNetProfit triggers REJECT', async () => {
    const result = await jarvisReviewGate.reviewTradeOpportunity({
      symbol: 'INFY',
      action: 'BUY',
      price: 1139.00,
      targetPrice: 1173.17,
      stopLossPrice: 1121.91,
      expectedNetProfit: 35.50, // Below user threshold ₹60!
      expectedNetRoiPct: 1.60,
      minDesiredNetProfit: 60.00,
      capital: 100000,
      riskBudget: 2000,
      quorumVotes: 11,
      confluenceScore: 92,
      marketDataTimestamp: Date.now()
    });

    assert.strictEqual(result.decision, 'REJECT');
    assert.ok(result.rationale.includes('below the user-configured minimum target threshold'));
  });

  test('6. Jarvis Review Gate: Fully compliant opportunity triggers APPROVE with bounded loss scenario', async () => {
    const result = await jarvisReviewGate.reviewTradeOpportunity({
      symbol: 'RELIANCE',
      action: 'BUY',
      price: 1194.00,
      targetPrice: 1229.82,
      stopLossPrice: 1176.09,
      expectedNetProfit: 185.20,
      expectedNetRoiPct: 2.80,
      minDesiredNetProfit: 60.00,
      capital: 100000,
      riskBudget: 2000,
      quorumVotes: 11,
      confluenceScore: 93,
      marketDataTimestamp: Date.now()
    });

    assert.strictEqual(result.decision, 'APPROVE');
    assert.ok(result.expectedNetProfitRange.min > 150);
    assert.ok(result.expectedNetProfitRange.max < 220);
    assert.ok(result.lossScenario.includes('Stop-Loss at ₹1176.09'));
    assert.ok(result.lossScenario.includes('risk budget ₹2000.00'));
    assert.ok(result.majorUncertainties.length > 0);
  });

  test('7. Capital-Aware Paper Trading: Infeasible trade on ₹1,000 capital is rejected without forcing leverage', async () => {
    // With capital = ₹1,000:
    // 2% risk budget = ₹20.
    // RELIANCE is ₹1,194. 1 share stop loss 1.5% = ₹17.91.
    // 25% max position cap on ₹1,000 = ₹250.
    // 1 share margin = ₹298.50 > ₹250 cap.
    const res = await paperSessionEngine.evaluateSingleOpportunity('RELIANCE', 1000, 60, 10);
    assert.strictEqual(res.eligible, false);
    assert.ok(res.reason.includes('Infeasible with capital ₹1,000'));
  });

  test('8. Capital-Aware Paper Trading: Feasible trade on ₹100,000 capital passes evaluation', async () => {
    const res = await paperSessionEngine.evaluateSingleOpportunity('RELIANCE', 100000, 60, 10);
    assert.strictEqual(res.eligible, true);
    assert.ok(res.opportunity);
    assert.ok(res.opportunity.projectedNetProfit >= 60);
    assert.strictEqual(res.jarvisReview?.decision, 'APPROVE');
  });

  test('9. News Sentiment & Research Worker: Fully Decoupled & Non-Blocking', () => {
    const monitor = IndianNewsMonitor.getInstance();
    const t0 = performance.now();
    const news = monitor.getNewsForTickers(['RELIANCE-EQ', 'TCS-EQ']);
    const t1 = performance.now();

    assert.ok(news.items.length > 0);
    assert.ok(t1 - t0 < 10, 'News cache lookup must be < 10ms (non-blocking)');

    const sentiment = analyzeHeadlineSentiment('Reliance Retail expands network with record revenue and profit jumps');
    assert.ok(sentiment.classification.includes('BULLISH'));
    assert.ok(sentiment.confidence > 50);
    assert.ok(sentiment.score > 0);
  });
});

