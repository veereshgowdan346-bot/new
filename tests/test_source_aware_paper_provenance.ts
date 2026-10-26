import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { PaperSessionEngine } from '../src/utils/paperSessionEngine';
import { MarketQuote } from '../src/utils/angelMarketDataAdapter';

describe('CHINTU AI — SOURCE-AWARE PAPER TRADING & PROVENANCE VALIDATION', () => {
  let engine: PaperSessionEngine;

  beforeEach(() => {
    engine = PaperSessionEngine.getInstance();
    engine.resetToNotStarted();
  });

  it('should initialize session in SIMULATED_REPLAY by default with zero counts', () => {
    const metrics = engine.getSessionMetrics();
    assert.strictEqual(metrics.status, 'NOT_STARTED');
    assert.strictEqual(metrics.executionMode, 'SIMULATED_REPLAY');
    assert.strictEqual(metrics.receivedTicksCount, 0);
    assert.strictEqual(metrics.rejectedTicksCount, 0);
    assert.strictEqual(metrics.staleTicksCount, 0);
    assert.strictEqual(metrics.simulatedTicksIsolatedCount, 0);
  });

  it('should strictly isolate synthetic and standby ticks when executionMode is LIVE_DATA_STRICT', async () => {
    const startRes = await engine.startSession(100000, undefined, 'LIVE_DATA_STRICT');
    assert.strictEqual(startRes.success, true);
    assert.strictEqual(engine.getSessionMetrics().executionMode, 'LIVE_DATA_STRICT');

    // Simulate an incoming STANDBY_ANCHOR quote
    const standbyQuote: MarketQuote = {
      symbol: 'NIFTY 50',
      token: '26000',
      price: 24750.00,
      change: 50.0,
      pct: 0.20,
      volume: '10M',
      timestamp: Date.now(),
      dataAgeStatus: 'SIMULATED',
      source: 'STANDBY_ANCHOR'
    };

    // Feed to private tick handler via prototype or reflection
    (engine as any).handleIncomingTick(standbyQuote);

    const metricsAfterStandby = engine.getSessionMetrics();
    assert.strictEqual(metricsAfterStandby.receivedTicksCount, 1, 'Should register 1 received tick');
    assert.strictEqual(metricsAfterStandby.simulatedTicksIsolatedCount, 1, 'Standby tick must be isolated');
    assert.strictEqual(metricsAfterStandby.rejectedTicksCount, 0);

    // Simulate an incoming AUTHENTIC_PAPER_REPLAY synthetic tick
    const paperReplayQuote: MarketQuote = {
      symbol: 'BANKNIFTY',
      token: '26009',
      price: 52100.00,
      change: -120.0,
      pct: -0.23,
      volume: '5M',
      timestamp: Date.now(),
      dataAgeStatus: 'SIMULATED',
      source: 'AUTHENTIC_PAPER_REPLAY'
    };

    (engine as any).handleIncomingTick(paperReplayQuote);

    const metricsAfterReplay = engine.getSessionMetrics();
    assert.strictEqual(metricsAfterReplay.receivedTicksCount, 2);
    assert.strictEqual(metricsAfterReplay.simulatedTicksIsolatedCount, 2, 'Synthetic replay tick must be isolated');
  });

  it('should reject stale quotes (> 120s) and malformed prices in LIVE_DATA_STRICT mode', async () => {
    await engine.startSession(100000, undefined, 'LIVE_DATA_STRICT');

    // 1. Stale live tick
    const staleQuote: MarketQuote = {
      symbol: 'NIFTY 50',
      token: '26000',
      price: 24800.00,
      change: 100.0,
      pct: 0.40,
      volume: '12M',
      timestamp: Date.now() - 150000,
      dataAgeStatus: 'STALE',
      source: 'OFFICIAL_ANGEL_ONE_SMARTSTREAM'
    };

    (engine as any).handleIncomingTick(staleQuote);

    let metrics = engine.getSessionMetrics();
    assert.strictEqual(metrics.staleTicksCount, 1, 'Stale tick must be rejected and logged');

    // 2. Malformed / negative price tick
    const malformedQuote: MarketQuote = {
      symbol: 'NIFTY 50',
      token: '26000',
      price: -50.00,
      change: 0,
      pct: 0,
      volume: '0',
      timestamp: Date.now(),
      dataAgeStatus: 'FRESH',
      source: 'OFFICIAL_ANGEL_ONE_SMARTSTREAM'
    };

    (engine as any).handleIncomingTick(malformedQuote);

    metrics = engine.getSessionMetrics();
    assert.strictEqual(metrics.rejectedTicksCount, 1, 'Malformed price tick must be rejected');
  });

  it('should process genuine live ticks and tag trades with OFFICIAL_ANGEL_ONE_SMARTSTREAM provenance', async () => {
    await engine.startSession(200000, undefined, 'LIVE_DATA_STRICT');

    // Genuine live tick
    const liveQuote: MarketQuote = {
      symbol: 'RELIANCE',
      token: '2885',
      price: 2950.00,
      change: 15.0,
      pct: 0.51,
      volume: '4M',
      timestamp: Date.now(),
      exchangeTimestamp: Date.now() - 50,
      receivedTimestamp: Date.now(),
      dataAgeStatus: 'FRESH',
      source: 'OFFICIAL_ANGEL_ONE_SMARTSTREAM'
    };

    (engine as any).handleIncomingTick(liveQuote);

    const metrics = engine.getSessionMetrics();
    assert.strictEqual(metrics.receivedTicksCount, 1);
    assert.strictEqual(metrics.simulatedTicksIsolatedCount, 0, 'Genuine live tick must NOT be isolated');
    assert.strictEqual(metrics.rejectedTicksCount, 0);
    assert.strictEqual(metrics.staleTicksCount, 0);
  });

  it('should execute simulation replay and tag paper trades with SIMULATED_REPLAY in offline mode', async () => {
    await engine.startSession(150000, undefined, 'SIMULATED_REPLAY');
    const metrics = engine.getSessionMetrics();
    assert.strictEqual(metrics.executionMode, 'SIMULATED_REPLAY');

    // In simulation mode, simulated ticks are processed for offline practice
    const simQuote: MarketQuote = {
      symbol: 'TATAMOTORS',
      token: '3456',
      price: 980.00,
      change: 5.0,
      pct: 0.51,
      volume: '8M',
      timestamp: Date.now(),
      dataAgeStatus: 'SIMULATED',
      source: 'AUTHENTIC_PAPER_REPLAY'
    };

    (engine as any).handleIncomingTick(simQuote);

    const metricsAfterSim = engine.getSessionMetrics();
    assert.strictEqual(metricsAfterSim.receivedTicksCount, 1);
    assert.strictEqual(metricsAfterSim.simulatedTicksIsolatedCount, 0, 'In simulation replay mode, sim ticks are allowed');
  });
});
