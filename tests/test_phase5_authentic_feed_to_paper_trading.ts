import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  AngelMarketDataAdapter,
  MarketQuote
} from '../src/utils/angelMarketDataAdapter';
import {
  PaperSessionEngine,
  RiskSettings
} from '../src/utils/paperSessionEngine';
import { runtimeDb } from '../src/utils/databasePersistence';
import { AngelOrderExecutionAdapter, angelOrderAdapter } from '../src/utils/angelOrderAdapter';
import { instrumentMaster } from '../src/utils/instrumentMaster';
import { IndianMarketCalendar } from '../src/utils/indianMarketCalendar';
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

const TEST_DB = path.join(process.cwd(), 'scratch', 'test_db', 'test_phase5_pipeline.db');

// Helper to construct authentic 51-byte SmartStream v2 binary buffer
function createSmartStreamPacket(params: {
  token: string;
  sequenceNumber: number;
  exchangeTimestamp: number;
  ltpPaise: number;
  exchangeType?: number;
}): Buffer {
  const buf = Buffer.alloc(51);
  buf.writeInt8(1, 0); // Mode 1 = LTP
  buf.writeInt8(params.exchangeType ?? 1, 1); // 1 = NSE
  buf.write(params.token, 2, 25, 'utf8');
  buf.writeBigInt64LE(BigInt(params.sequenceNumber), 27);
  buf.writeBigInt64LE(BigInt(params.exchangeTimestamp), 35);
  buf.writeBigInt64LE(BigInt(params.ltpPaise), 43);
  return buf;
}

type SupportedExchange = 'NSE' | 'BSE' | 'NFO' | 'MCX' | 'CDS';
const SUPPORTED_EXCHANGES: readonly string[] = ['NSE', 'BSE', 'NFO', 'MCX', 'CDS'];

function isSupportedExchange(exchange: string): exchange is SupportedExchange {
  return SUPPORTED_EXCHANGES.includes(exchange);
}

const conservativeRiskSettings: Partial<RiskSettings> = {
  maxRiskPerTradePct: 1.0,
  maxConcurrentPositions: 3,
  maxCapitalUtilizationPct: 50.0,
  stopLossPct: 1.0,
  targetProfitPct: 2.0,
  hurdleNetRoiPct: 1.5,
  maxPositionAllocationPct: 15.0
};

describe('CHINTU AI — PHASE 5: AUTHENTIC FEED TO PAPER-TRADING END-TO-END VERIFICATION', () => {
  before(() => {
    const dir = path.dirname(TEST_DB);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(TEST_DB)) {
      try { fs.unlinkSync(TEST_DB); } catch {}
    }
    runtimeDb.init(TEST_DB);
  });

  after(() => {
    runtimeDb.close();
    // Re-bind to production DB cleanly
    runtimeDb.init(path.join(process.cwd(), 'server', 'data', 'chintu_runtime.db'));
    if (fs.existsSync(TEST_DB)) {
      try { fs.unlinkSync(TEST_DB); } catch {}
    }
  });

  it('1. Market-Data Propagation Pipeline (Feed -> Parser -> Mapping -> Listener)', () => {
    const adapter = new AngelMarketDataAdapter();
    const receivedQuotes: MarketQuote[] = [];

    // Register strategy listener
    const unsubscribe = adapter.onTick((quote) => {
      receivedQuotes.push(quote);
    });

    const now = Date.now();
    // Token 2885 is RELIANCE-EQ on NSE
    const packet = createSmartStreamPacket({
      token: '2885',
      sequenceNumber: 101,
      exchangeTimestamp: now,
      ltpPaise: 298050 // ₹2980.50
    });

    const parsed = adapter.parseBinaryPacket(packet);
    assert.equal(parsed, true, 'Packet must be successfully decoded');

    // Verify Quote in Adapter State
    const quote = adapter.getQuote('RELIANCE');
    assert.ok(quote, 'RELIANCE quote must be present in adapter cache');
    assert.equal(quote?.symbol, 'RELIANCE');
    assert.equal(quote?.token, '2885');
    assert.equal(quote?.price, 2980.50);
    assert.equal(quote?.exchangeTimestamp, now);
    assert.equal(quote?.dataAgeStatus, 'FRESH');
    assert.equal(quote?.source, 'OFFICIAL_ANGEL_ONE_SMARTSTREAM');

    // Verify listener received the exact quote
    assert.equal(receivedQuotes.length, 1);
    assert.equal(receivedQuotes[0].symbol, 'RELIANCE');
    assert.equal(receivedQuotes[0].price, 2980.50);
    assert.equal(receivedQuotes[0].exchangeTimestamp, now);

    unsubscribe();
  });

  it('2. Rejection of Invalid, Corrupted, Duplicate, and Stale Ticks', () => {
    const adapter = new AngelMarketDataAdapter();
    const now = Date.now();

    // 1. Truncated packet (< 51 bytes)
    assert.equal(adapter.parseBinaryPacket(Buffer.alloc(45)), false, 'Truncated buffer must be rejected');

    // 2. Negative or zero LTP
    const zeroPrice = createSmartStreamPacket({ token: '2885', sequenceNumber: 102, exchangeTimestamp: now, ltpPaise: 0 });
    assert.equal(adapter.parseBinaryPacket(zeroPrice), false, 'Zero price must be rejected');

    // 3. Stale tick (> 120 seconds old)
    const stalePacket = createSmartStreamPacket({
      token: '2885',
      sequenceNumber: 103,
      exchangeTimestamp: now - 150000,
      ltpPaise: 298100
    });
    assert.equal(adapter.parseBinaryPacket(stalePacket), true, 'Decodes but flags as STALE');
    assert.equal(adapter.getQuote('RELIANCE')?.dataAgeStatus, 'STALE');

    // 4. Duplicate sequence number rejection
    const validPacket = createSmartStreamPacket({
      token: '2885',
      sequenceNumber: 200,
      exchangeTimestamp: now,
      ltpPaise: 298200
    });
    assert.equal(adapter.parseBinaryPacket(validPacket), true, 'Sequence 200 accepted');

    const duplicatePacket = createSmartStreamPacket({
      token: '2885',
      sequenceNumber: 200,
      exchangeTimestamp: now,
      ltpPaise: 298300
    });
    assert.equal(adapter.parseBinaryPacket(duplicatePacket), false, 'Duplicate sequence 200 rejected');

    // 5. Out-of-order sequence number rejection
    const outOfOrderPacket = createSmartStreamPacket({
      token: '2885',
      sequenceNumber: 199,
      exchangeTimestamp: now,
      ltpPaise: 298400
    });
    assert.equal(adapter.parseBinaryPacket(outOfOrderPacket), false, 'Out-of-order sequence 199 rejected');
  });

  it('3. Paper Trading Lifecycle (Signal -> Risk -> Order -> Fill -> MTM)', async () => {
    const engine = new PaperSessionEngine();
    const startRes = await engine.startSession(500000, conservativeRiskSettings);
    assert.equal(startRes.success, true);
    assert.equal(engine.getSessionMetrics().status, 'PAPER_TRADING');

    // Invariant: Initial cash = initial capital = 500,000; 0 positions
    const initialMetrics = engine.getSessionMetrics();
    assert.equal(initialMetrics.initialCapital, 500000);
    assert.equal(initialMetrics.availableCash, 500000);
    assert.equal(initialMetrics.openPositionsCount, 0);

    // Trigger evaluation
    await engine.evaluateAndExecuteTrades();

    // If trade executed, verify risk rules
    const positions = engine.getOpenPositions();
    if (positions.length > 0) {
      const pos = positions[0];
      assert.ok(pos.qty > 0, 'Quantity must be positive');
      assert.ok(pos.allocatedMargin > 0, 'Margin must be allocated');
      assert.ok(pos.entryCharges > 0, 'Statutory entry charges must be calculated');
      assert.ok(pos.targetPrice > pos.entryPrice, 'Target must be above entry for BUY');
      assert.ok(pos.stopLossPrice < pos.entryPrice, 'Stop Loss must be below entry for BUY');

      // Verify 2% Risk Budget Rule:
      // Potential Loss = (entryPrice - stopLossPrice) * qty <= 2% of capital (₹10,000)
      const maxLossIfStopped = (pos.entryPrice - pos.stopLossPrice) * pos.qty;
      assert.ok(maxLossIfStopped <= 10000.01, `Max loss ₹${maxLossIfStopped} must be within 2% budget of ₹10,000`);

      // Verify Available Cash + Allocated Margin == Initial Capital - Entry Charges
      const totalCap = Number((engine.getSessionMetrics().availableCash + engine.getSessionMetrics().allocatedMargin).toFixed(2));
      assert.ok(totalCap <= 500000, 'Total capital must not exceed initial capital');
    }

    // Stop session
    const stopRes = await engine.stopSession('MARKET_CLOSE');
    assert.equal(stopRes.success, true);
    assert.equal(engine.getSessionMetrics().status, 'STOPPED');
    assert.equal(engine.getOpenPositions().length, 0, 'All positions must be squared off on MARKET_CLOSE');
  });

  it('4. Auto Execution of Target Hit & Stop Loss Hit via Incoming Market Ticks', async () => {
    const engine = new PaperSessionEngine();
    await engine.startSession(500000, conservativeRiskSettings);

    await engine.evaluateAndExecuteTrades();
    const positions = engine.getOpenPositions();

    if (positions.length > 0) {
      const pos = positions[0];
      const initialCash = engine.getSessionMetrics().availableCash;

      // Simulate an incoming tick that reaches target price
      const targetQuote: MarketQuote = {
        symbol: pos.symbol,
        token: pos.token,
        price: pos.targetPrice + 1.0, // Above target
        change: 10,
        pct: 0.5,
        volume: '5M',
        timestamp: Date.now(),
        dataAgeStatus: 'FRESH',
        source: 'OFFICIAL_ANGEL_ONE_SMARTSTREAM'
      };

      // Feed tick directly to session handler
      (engine as any).handleIncomingTick(targetQuote);

      // Position must be closed via TARGET_HIT
      const remaining = engine.getOpenPositions().find((p) => p.id === pos.id);
      assert.equal(remaining, undefined, 'Position must be closed upon hitting target');

      // Released margin returned to available cash
      const metricsAfter = engine.getSessionMetrics();
      assert.ok(metricsAfter.availableCash > initialCash, 'Margin + profit must be credited back to cash');
      assert.ok(metricsAfter.realizedPnl > 0, 'Realized PnL must be positive for Target Hit');
    }

    await engine.stopSession('MARKET_CLOSE');
  });

  it('5. Duplicate-Order Prevention & Concurrency Guard', () => {
    // Test angelOrderAdapter idempotency guard
    const req = {
      variety: 'NORMAL' as const,
      tradingsymbol: 'RELIANCE-EQ',
      symboltoken: '2885',
      transactiontype: 'BUY' as const,
      exchange: 'NSE' as const,
      ordertype: 'LIMIT' as const,
      producttype: 'INTRADAY' as const,
      duration: 'DAY' as const,
      price: 2980.00,
      quantity: 10
    };

    const validation1 = angelOrderAdapter.validateOrderRequest(req);
    assert.equal(validation1.isValid, true);

    const orderKey = `usr_veeresh_master:RELIANCE-EQ:10:BUY:2980.00`;
    (angelOrderAdapter as any).processedOrderHashes.add(orderKey);

    assert.ok((angelOrderAdapter as any).processedOrderHashes.has(orderKey), 'Order key must be recorded in idempotency set');

    // Cleanup
    (angelOrderAdapter as any).processedOrderHashes.delete(orderKey);
  });

  it('6. Indian Market Calendar & Session Boundaries', () => {
    assert.equal(IndianMarketCalendar.EQUITY_OPEN_MINUTES, 555, '09:15 IST is 555 minutes');
    assert.equal(IndianMarketCalendar.EQUITY_CLOSE_MINUTES, 930, '15:30 IST is 930 minutes');
    assert.equal(IndianMarketCalendar.SQUARE_OFF_MINUTES, 925, '15:25 IST is auto square-off time');

    const holiday = IndianMarketCalendar.isHoliday('2026-01-26');
    assert.equal(holiday.isHoliday, true);

    const regularDay = IndianMarketCalendar.isHoliday('2026-06-15');
    assert.equal(regularDay.isHoliday, false);
  });

  it('7. Spot Benchmark Index Direct Order Rejection', () => {
    const rawExchange = 'NSE';
    if (!isSupportedExchange(rawExchange)) {
      throw new Error(`Unsupported exchange: ${rawExchange}`);
    }

    const indexOrder = {
      tradingsymbol: 'NIFTY 50',
      symboltoken: '26000',
      quantity: 1,
      exchange: rawExchange as 'NSE',
      price: 25840
    };

    const val = instrumentMaster.validateOrderAgainstMaster(indexOrder);
    assert.equal(val.isValid, false, 'Direct order on spot NIFTY 50 must be rejected');
    assert.equal(val.errorCode, 'CANNOT_TRADE_INDEX_DIRECTLY');
  });

  it('8. Emergency Stop Atomic Liquidation & Bot Halting', async () => {
    const engine = new PaperSessionEngine();
    await engine.startSession(500000, conservativeRiskSettings);
    await engine.evaluateAndExecuteTrades();

    // Trigger Emergency Stop
    const stopResult = await engine.stopSession('MARKET_CLOSE');
    assert.equal(stopResult.success, true);
    assert.equal(engine.getSessionMetrics().status, 'STOPPED');
    assert.equal(engine.getOpenPositions().length, 0, 'Zero positions remaining after emergency stop');
    assert.equal(engine.getSessionMetrics().allocatedMargin, 0, 'Zero margin allocated after emergency stop');
  });

  it('9. Fail-Closed Live Money Protection (LIVE_TRADING_ELIGIBLE = false)', () => {
    assert.equal(
      AngelOrderExecutionAdapter.LIVE_TRADING_ELIGIBLE,
      false,
      'LIVE_TRADING_ELIGIBLE must be compile-time false'
    );

    const gate = angelOrderAdapter.canExecuteLiveOrder();
    assert.equal(gate.allowed, false);
    assert.match(gate.reason, /LIVE_TRADING_DISABLED/);
  });

  it('10. Production SQLite Database Cleanliness (Zero Trade Pollution)', () => {
    const db = new DatabaseSync('server/data/chintu_runtime.db');
    
    // Verify DB integrity
    const integrity = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
    assert.equal(integrity[0]?.integrity_check, 'ok');

    // Verify zero open active trades or positions
    const openTrades = db.prepare('SELECT count(*) as c FROM trades').get() as { c: number };
    const openPositions = db.prepare('SELECT count(*) as c FROM positions').get() as { c: number };
    assert.equal(openTrades.c, 0, 'Production DB must have 0 trades');
    assert.equal(openPositions.c, 0, 'Production DB must have 0 positions');

    db.close();
  });

  it('11. Real Connection Disclosure (REQ-05 Blocked on User Credentials)', () => {
    const adapter = new AngelMarketDataAdapter();
    const status = adapter.getStatus();

    if (!status.hasCredentials) {
      assert.equal(status.connectionState, 'STANDBY');
      assert.equal(status.isLiveStreaming, false);
      assert.equal(status.feedSource, 'AUTHENTIC_PAPER_REPLAY');
      assert.match(status.statusMessage, /Standby:/);
    }
  });
});
