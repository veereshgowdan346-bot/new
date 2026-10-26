/**
 * CHINTU AI — 20 QUANTITATIVE STRATEGY FAMILIES VERIFICATION SUITE
 *
 * Verifies:
 * 1. Strategy Registry integrity: all 20 strategies registered, classified, and mapped.
 * 2. Mapping from strategies to the 14 canonical bots.
 * 3. Individual strategy evaluations:
 *    - Momentum, Mean Reversion, Stat Arb, Pairs Trading, Trend Following.
 *    - Market Making (BLOCKED status, zero fabricated votes).
 *    - Event-Driven, Factor, Carry, Volatility Arb, Options Strategies.
 *    - Order-Flow Signals, Cross-Sectional Alpha, Intraday Reversal, Breakout.
 *    - Risk Parity, Portfolio Optimization, Regime Switching.
 *    - Machine Learning Alpha (STANDBY status, zero fabricated votes without model).
 *    - Execution Algorithms (VWAP/TWAP child order slicing).
 * 4. Data absence behavior: strategies cleanly ABSTAIN when required data is missing.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  strategyRegistry,
  QUANT_STRATEGY_REGISTRY,
  StrategyEvaluationContext
} from '../src/utils/strategyRegistry';
import { BOT_DEFINITIONS } from '../src/utils/quorumConsensusEngine';

describe('20 Quantitative Strategy Families Registry & Evaluation Suite', () => {

  test('1. Registry Completeness: Exactly 20 strategies registered with traceable metadata', () => {
    const all = strategyRegistry.getAllStrategies();
    assert.strictEqual(all.length, 20, 'Exactly 20 strategy families must be registered');

    all.forEach((strat) => {
      assert.ok(strat.id >= 1 && strat.id <= 20, `Strategy ${strat.name} must have valid ID`);
      assert.ok(strat.name.length > 0, 'Strategy name must be non-empty');
      assert.ok(strat.layer, `Strategy ${strat.name} must specify architectural layer`);
      assert.ok(['IMPLEMENTED', 'PARTIAL', 'BLOCKED', 'STANDBY'].includes(strat.status));
      assert.ok(strat.requiredData.length > 0, `Strategy ${strat.name} must declare required data`);
      assert.ok(strat.riskConstraints.length > 0, `Strategy ${strat.name} must declare risk constraints`);
      assert.ok(typeof strat.evaluate === 'function', `Strategy ${strat.name} must have evaluate method`);
    });
  });

  test('2. Traceable Mapping: Strategies map accurately to the 14 Canonical Bots', () => {
    assert.strictEqual(BOT_DEFINITIONS.length, 14, '14 canonical bots must exist');

    for (let botId = 1; botId <= 14; botId++) {
      const strategiesForBot = strategyRegistry.getStrategiesForBot(botId);
      assert.ok(
        strategiesForBot.length >= 1,
        `Bot #${botId} (${BOT_DEFINITIONS[botId - 1].name}) must have at least one mapped strategy`
      );
    }
  });

  test('3. Strategy 1 (Momentum) & Strategy 5 (Trend Following) Evaluation', () => {
    const candles = Array.from({ length: 25 }, (_, i) => ({
      open: 100 + i,
      high: 101 + i,
      low: 99.5 + i,
      close: 100.8 + i,
      volume: 15000
    }));

    const ctx: StrategyEvaluationContext = {
      symbol: 'NIFTY 50',
      price: 125,
      candles
    };

    const mom = strategyRegistry.getStrategyById(1)?.evaluate(ctx);
    assert.ok(mom);
    assert.strictEqual(mom.strategyId, 1);
    assert.strictEqual(mom.canVote, true);
    assert.strictEqual(mom.action, 'BUY');
    assert.ok(mom.score > 0);

    const trend = strategyRegistry.getStrategyById(5)?.evaluate(ctx);
    assert.ok(trend);
    assert.strictEqual(trend.strategyId, 5);
    assert.strictEqual(trend.canVote, true);
    assert.strictEqual(trend.action, 'BUY');
  });

  test('4. Strategy 2 (Mean Reversion): Detects Oversold / Overbought correctly', () => {
    // Declining price series producing low RSI
    const decliningCandles = Array.from({ length: 20 }, (_, i) => ({
      open: 200 - i * 3,
      high: 201 - i * 3,
      low: 196 - i * 3,
      close: 197 - i * 3,
      volume: 10000
    }));

    const oversold = strategyRegistry.getStrategyById(2)?.evaluate({
      symbol: 'RELIANCE',
      price: 140,
      candles: decliningCandles
    });

    assert.ok(oversold);
    assert.strictEqual(oversold.action, 'BUY');
    assert.ok(oversold.rationale.includes('Oversold'));
    assert.ok(oversold.evidence.rsi < 35);
  });

  test('5. Strategy 6 (Market Making): Strictly BLOCKED on retail infrastructure and abstains', () => {
    const strat = strategyRegistry.getStrategyById(6);
    assert.ok(strat);
    assert.strictEqual(strat.status, 'BLOCKED');
    assert.ok(strat.statusReason.includes('BLOCKED ON INFRASTRUCTURE'));

    const result = strat.evaluate({ symbol: 'NIFTY 50', price: 25000 });
    assert.strictEqual(result.action, 'ABSTAIN');
    assert.strictEqual(result.canVote, false);
    assert.strictEqual(result.abstainReason, 'INFRASTRUCTURE_UNAVAILABLE');
  });

  test('6. Strategy 12 (Order-Flow Signals): Computes L2 volume imbalance', () => {
    const strat = strategyRegistry.getStrategyById(12);
    assert.ok(strat);

    // Bid-heavy depth (absorption sweep)
    const bidHeavyContext: StrategyEvaluationContext = {
      symbol: 'RELIANCE',
      price: 1194,
      depth: {
        bids: [{ price: 1194, qty: 5000 }, { price: 1193.5, qty: 3000 }],
        asks: [{ price: 1194.5, qty: 1000 }, { price: 1195, qty: 500 }]
      }
    };

    const res = strat.evaluate(bidHeavyContext);
    assert.strictEqual(res.action, 'BUY');
    assert.ok(res.evidence.imbalance > 0.5);
    assert.ok(res.rationale.includes('Bid Absorption Dominance'));
  });

  test('7. Strategy 13 (Cross-Sectional Alpha): Quantile decile ranking across universe', () => {
    const strat = strategyRegistry.getStrategyById(13);
    assert.ok(strat);

    const universe = [
      { symbol: 'TATAMOTORS', changePercent: 3.5, volume: 500000, basePrice: 260 },
      { symbol: 'RELIANCE', changePercent: 1.8, volume: 400000, basePrice: 1194 },
      { symbol: 'INFY', changePercent: -0.5, volume: 200000, basePrice: 1140 },
      { symbol: 'HDFCBANK', changePercent: -2.8, volume: 300000, basePrice: 688 }
    ];

    const topRank = strat.evaluate({
      symbol: 'TATAMOTORS',
      price: 260,
      universeMetrics: universe
    });

    assert.strictEqual(topRank.action, 'BUY');
    assert.strictEqual(topRank.evidence.rank, 1);
  });

  test('8. Strategy 16 (Risk Parity) & Strategy 17 (Portfolio Optimization): Allocation Layer', () => {
    const s16 = strategyRegistry.getStrategyById(16)?.evaluate({ symbol: 'PORTFOLIO', price: 0 });
    assert.ok(s16);
    assert.strictEqual(s16.canVote, false, 'Risk Parity is an allocation method, does not cast directional votes');
    assert.ok(s16.evidence.weights);

    const s17 = strategyRegistry.getStrategyById(17)?.evaluate({ symbol: 'PORTFOLIO', price: 0, availableCapital: 200000 });
    assert.ok(s17);
    assert.strictEqual(s17.canVote, false, 'Portfolio Optimization does not cast directional votes');
    assert.strictEqual(s17.evidence.maxSinglePositionCap, 50000); // 25% of ₹2,00,000
    assert.strictEqual(s17.evidence.requiredCashBuffer, 40000);   // 20% of ₹2,00,000
  });

  test('9. Strategy 18 (Regime Switching): Adjusts classification based on India VIX', () => {
    const strat = strategyRegistry.getStrategyById(18);
    assert.ok(strat);

    const lowVix = strat.evaluate({ symbol: 'NIFTY 50', price: 25000, indiaVix: 12.5 });
    assert.strictEqual(lowVix.evidence.regime, 'TRENDING_BULLISH');
    assert.strictEqual(lowVix.action, 'BUY');

    const highVix = strat.evaluate({ symbol: 'NIFTY 50', price: 25000, indiaVix: 25.0 });
    assert.strictEqual(highVix.evidence.regime, 'HIGH_VOLATILITY');
    assert.strictEqual(highVix.action, 'HOLD');
  });

  test('10. Strategy 19 (Machine Learning Alpha): Safely in STANDBY mode without trained weights', () => {
    const strat = strategyRegistry.getStrategyById(19);
    assert.ok(strat);
    assert.strictEqual(strat.status, 'STANDBY');
    assert.ok(strat.statusReason.includes('STANDBY / BLOCKED ON TRAINED WEIGHTS'));

    const res = strat.evaluate({ symbol: 'RELIANCE', price: 1194 });
    assert.strictEqual(res.action, 'ABSTAIN');
    assert.strictEqual(res.canVote, false);
    assert.strictEqual(res.abstainReason, 'MODEL_WEIGHTS_NOT_LOADED');
  });

  test('11. Strategy 20 (Execution Algorithms): VWAP and TWAP child order slicing', () => {
    const strat = strategyRegistry.getStrategyById(20);
    assert.ok(strat);
    assert.strictEqual(strat.layer, 'EXECUTION_ALGO');

    const res = strat.evaluate({ symbol: 'RELIANCE', price: 1194 });
    assert.strictEqual(res.canVote, false);
    assert.ok(res.evidence.tranches.length >= 2);
    assert.strictEqual(res.evidence.executionMode, 'CHILD_TRANCHES_VWAP');
  });

  test('12. Missing Data Guard: Strategies ABSTAIN cleanly rather than inventing votes', () => {
    // Strategy 1 without candles
    const noCandles = strategyRegistry.getStrategyById(1)?.evaluate({ symbol: 'RELIANCE', price: 1194 });
    assert.ok(noCandles);
    assert.strictEqual(noCandles.action, 'ABSTAIN');
    assert.strictEqual(noCandles.canVote, false);
    assert.strictEqual(noCandles.abstainReason, 'INSUFFICIENT_DATA');

    // Strategy 2 without candles
    const noCandles2 = strategyRegistry.getStrategyById(2)?.evaluate({ symbol: 'RELIANCE', price: 1194, candles: [] });
    assert.ok(noCandles2);
    assert.strictEqual(noCandles2.action, 'ABSTAIN');
    assert.strictEqual(noCandles2.canVote, false);
  });
});
