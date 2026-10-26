import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AngelOrderExecutionAdapter,
  angelOrderAdapter,
  AngelOrderPayload
} from '../src/utils/angelOrderAdapter';
import { instrumentMaster } from '../src/utils/instrumentMaster';

describe('CHINTU AI — ANGEL ONE LIVE ORDER ADAPTER & READINESS SUITE', () => {

  // ==========================================================================
  // 1. SAFETY INVARIANTS & PRE-SUBMISSION SECURITY GATES
  // ==========================================================================
  describe('1. Safety Invariants & Approval Gates', () => {
    it('should strictly enforce LIVE_TRADING_ELIGIBLE = false as a system invariant', () => {
      assert.equal(AngelOrderExecutionAdapter.LIVE_TRADING_ELIGIBLE, false);
      const status = angelOrderAdapter.getSafetyStatus();
      assert.equal(status.liveTradingEligible, false);
      assert.equal(status.isArmed, false);
    });

    it('should fail-closed safely when live order execution is attempted', () => {
      const gate = angelOrderAdapter.canExecuteLiveOrder();
      assert.equal(gate.allowed, false);
      assert.ok(gate.reason.includes('LIVE_TRADING_DISABLED'));
    });

    it('should refuse to arm live trading when LIVE_TRADING_ELIGIBLE is false', () => {
      const armed = angelOrderAdapter.armLiveTrading('AUTHORIZE_MIN_CAPITAL_LIVE_TRIAL');
      assert.equal(armed, false, 'Cannot arm live trading while LIVE_TRADING_ELIGIBLE is False');
      assert.equal(angelOrderAdapter.getSafetyStatus().isArmed, false);
    });

    it('should disarm immediately on command', () => {
      angelOrderAdapter.disarmLiveTrading();
      assert.equal(angelOrderAdapter.getSafetyStatus().isArmed, false);
    });

    it('should safely mask credentials in telemetry', () => {
      const adapter = new AngelOrderExecutionAdapter({
        apiKey: 'SECRET_API_KEY_999',
        clientId: 'AB123456',
        jwtToken: 'MOCK_JWT_TOKEN'
      });
      const status = adapter.getSafetyStatus();
      assert.equal(status.clientMasked, 'AB***56');
      assert.ok(!JSON.stringify(status).includes('SECRET_API_KEY_999'));
      assert.ok(!JSON.stringify(status).includes('MOCK_JWT_TOKEN'));
    });

    it('should reject expired JWT access tokens (> 150 minutes)', () => {
      // Create adapter with expired token (issued 3 hours ago)
      const expiredAdapter = new AngelOrderExecutionAdapter({
        apiKey: 'KEY',
        clientId: 'CLIENT',
        jwtToken: 'EXPIRED_JWT',
        tokenIssuedAt: Date.now() - (180 * 60 * 1000)
      });
      assert.equal(expiredAdapter.isTokenExpired(), true);
      const status = expiredAdapter.getSafetyStatus();
      assert.equal(status.isJwtExpired, true);
      assert.equal(status.jwtLifetimeMinutes, 150);
    });
  });

  // ==========================================================================
  // 2. ORDER REQUEST & DYNAMIC INSTRUMENT MASTER VALIDATION
  // ==========================================================================
  describe('2. Order Request Validation Engine (SmartAPI & Instrument Master)', () => {
    const validBaseOrder: AngelOrderPayload = {
      variety: 'NORMAL',
      tradingsymbol: 'NIFTY26OCTFUT',
      symboltoken: '54321',
      transactiontype: 'BUY',
      exchange: 'NFO',
      ordertype: 'LIMIT',
      producttype: 'INTRADAY',
      duration: 'DAY',
      price: 25850.50,
      quantity: 25 // Valid lot multiple for NIFTY derivative
    };

    it('should approve a fully compliant SmartAPI order payload', () => {
      const val = angelOrderAdapter.validateOrderRequest(validBaseOrder);
      assert.equal(val.isValid, true);
      assert.ok(val.instrument);
      assert.equal(val.instrument?.lotsize, 25);
    });

    it('should reject missing or empty trading symbol', () => {
      const val = angelOrderAdapter.validateOrderRequest({
        ...validBaseOrder,
        tradingsymbol: '   '
      });
      assert.equal(val.isValid, false);
      assert.equal(val.errorCode, 'INVALID_TRADING_SYMBOL');
    });

    it('should reject missing or empty symbol token', () => {
      const val = angelOrderAdapter.validateOrderRequest({
        ...validBaseOrder,
        symboltoken: ''
      });
      assert.equal(val.isValid, false);
      assert.equal(val.errorCode, 'INVALID_SYMBOL_TOKEN');
    });

    it('should reject unsupported exchange', () => {
      const val = angelOrderAdapter.validateOrderRequest({
        ...validBaseOrder,
        exchange: 'NASDAQ' as any
      });
      assert.equal(val.isValid, false);
      assert.equal(val.errorCode, 'INVALID_EXCHANGE');
    });

    it('should reject non-positive or non-integer quantities', () => {
      const valZero = angelOrderAdapter.validateOrderRequest({
        ...validBaseOrder,
        quantity: 0
      });
      assert.equal(valZero.isValid, false);
      assert.equal(valZero.errorCode, 'INVALID_QUANTITY');

      const valFloat = angelOrderAdapter.validateOrderRequest({
        ...validBaseOrder,
        quantity: 12.5
      });
      assert.equal(valFloat.isValid, false);
      assert.equal(valFloat.errorCode, 'INVALID_QUANTITY');
    });

    it('should dynamically reject non-multiple lot sizes using verified instrument master', () => {
      // BANKNIFTY derivative has lotsize 15 in master
      const valBankNifty = angelOrderAdapter.validateOrderRequest({
        variety: 'NORMAL',
        tradingsymbol: 'BANKNIFTY26OCTFUT',
        symboltoken: '54323',
        transactiontype: 'BUY',
        exchange: 'NFO',
        ordertype: 'LIMIT',
        producttype: 'INTRADAY',
        duration: 'DAY',
        price: 54120.00,
        quantity: 23 // Invalid: not a multiple of 15
      });
      assert.equal(valBankNifty.isValid, false);
      assert.equal(valBankNifty.errorCode, 'INVALID_LOT_SIZE_MULTIPLE');

      // CRUDEOIL MCX has lotsize 100 in master
      const valCrude = angelOrderAdapter.validateOrderRequest({
        variety: 'NORMAL',
        tradingsymbol: 'CRUDEOIL26NOVFUT',
        symboltoken: '234569',
        transactiontype: 'BUY',
        exchange: 'MCX',
        ordertype: 'LIMIT',
        producttype: 'INTRADAY',
        duration: 'DAY',
        price: 6240.00,
        quantity: 50 // Invalid: not a multiple of 100
      });
      assert.equal(valCrude.isValid, false);
      assert.equal(valCrude.errorCode, 'INVALID_LOT_SIZE_MULTIPLE');
    });

    it('should dynamically approve valid lot size multiples from instrument master', () => {
      const valBankNiftyValid = angelOrderAdapter.validateOrderRequest({
        variety: 'NORMAL',
        tradingsymbol: 'BANKNIFTY26OCTFUT',
        symboltoken: '54323',
        transactiontype: 'BUY',
        exchange: 'NFO',
        ordertype: 'LIMIT',
        producttype: 'INTRADAY',
        duration: 'DAY',
        price: 54120.00,
        quantity: 30 // Valid: 2 x 15
      });
      assert.equal(valBankNiftyValid.isValid, true);
    });

    it('should reject non-tick-size limit prices on NSE (must be ₹0.05 multiple)', () => {
      const val = angelOrderAdapter.validateOrderRequest({
        ...validBaseOrder,
        price: 25850.03 // Invalid tick on NSE (must be multiple of 0.05)
      });
      assert.equal(val.isValid, false);
      assert.equal(val.errorCode, 'INVALID_TICK_SIZE_PRICE');
    });

    it('should validate order-type-specific prices strictly', () => {
      // LIMIT order cannot have trigger price
      const valLimit = angelOrderAdapter.validateOrderRequest({
        ...validBaseOrder,
        ordertype: 'LIMIT',
        price: 25850.50,
        triggerprice: 25800.00
      });
      assert.equal(valLimit.isValid, false);
      assert.equal(valLimit.errorCode, 'TRIGGER_NOT_ALLOWED');

      // STOPLOSS_LIMIT requires positive trigger price
      const valSlNoTrigger = angelOrderAdapter.validateOrderRequest({
        ...validBaseOrder,
        ordertype: 'STOPLOSS_LIMIT',
        variety: 'STOPLOSS',
        price: 25850.50,
        triggerprice: 0
      });
      assert.equal(valSlNoTrigger.isValid, false);
      assert.equal(valSlNoTrigger.errorCode, 'INVALID_TRIGGER_PRICE');
    });

    it('should reject directionally inverted stoploss trigger prices', () => {
      // BUY Stoploss: trigger price cannot be higher than limit price
      const valBuy = angelOrderAdapter.validateOrderRequest({
        ...validBaseOrder,
        transactiontype: 'BUY',
        ordertype: 'STOPLOSS_LIMIT',
        variety: 'STOPLOSS',
        price: 150.00,
        triggerprice: 155.00
      });
      assert.equal(valBuy.isValid, false);
      assert.equal(valBuy.errorCode, 'INVALID_BUY_SL');

      // SELL Stoploss: trigger price cannot be lower than limit price
      const valSell = angelOrderAdapter.validateOrderRequest({
        ...validBaseOrder,
        transactiontype: 'SELL',
        ordertype: 'STOPLOSS_LIMIT',
        variety: 'STOPLOSS',
        price: 140.00,
        triggerprice: 135.00
      });
      assert.equal(valSell.isValid, false);
      assert.equal(valSell.errorCode, 'INVALID_SELL_SL');
    });

    it('should reject exchange segment mismatches against instrument master', () => {
      const val = angelOrderAdapter.validateOrderRequest({
        ...validBaseOrder,
        exchange: 'NSE' // Token 54321 trades on NFO, not NSE
      });
      assert.equal(val.isValid, false);
      assert.equal(val.errorCode, 'EXCHANGE_SEGMENT_MISMATCH');
    });
  });

  // ==========================================================================
  // 3. RATE LIMITING WITH 50% SAFETY MARGIN
  // ==========================================================================
  describe('3. Rate Limiting Safety Margin & Throttling', () => {
    it('should enforce 5 req/s safety limit (50% below broker 10 req/s ceiling)', () => {
      const adapter = new AngelOrderExecutionAdapter();
      assert.equal(adapter.rateLimitMaxPerSec, 5);
      assert.equal(adapter.minRequestIntervalMs, 100);

      const status = adapter.getSafetyStatus();
      assert.equal(status.rateLimitMaxPerSec, 5);
      assert.equal(status.safetyMarginPct, 50);
      assert.equal(status.minRequestIntervalMs, 100);
    });

    it('should throttle rapid back-to-back requests < 100ms apart', () => {
      const adapter = new AngelOrderExecutionAdapter();
      const first = adapter.checkRateLimit();
      assert.equal(first, true);
      // Immediate second call without elapsed time must be throttled
      const second = adapter.checkRateLimit();
      assert.equal(second, false, 'Should throttle order call within 100ms window');
    });
  });

  // ==========================================================================
  // 4. IDEMPOTENCY, RECONCILIATION & COMPARISON MODELING
  // ==========================================================================
  describe('4. Idempotency, Reconciliation & Comparison Modeling', () => {
    it('should generate deterministic idempotency keys to prevent duplicate fills', () => {
      const orderA: AngelOrderPayload = {
        variety: 'NORMAL',
        tradingsymbol: 'NIFTY 50',
        symboltoken: '26000',
        transactiontype: 'BUY',
        exchange: 'NSE',
        ordertype: 'LIMIT',
        producttype: 'INTRADAY',
        duration: 'DAY',
        price: 25840.50,
        quantity: 50
      };
      const orderB: AngelOrderPayload = { ...orderA };

      const keyA = angelOrderAdapter.generateIdempotencyKey(orderA);
      const keyB = angelOrderAdapter.generateIdempotencyKey(orderB);
      assert.equal(keyA, keyB);
      assert.equal(typeof keyA, 'string');
      assert.equal(keyA.length, 64); // SHA-256 hex string
    });

    it('should detect position discrepancies between local positions and broker positions', () => {
      const local = [
        { symbol: 'NIFTY 50 25850 CE', symbolToken: '26000', qty: 50 },
        { symbol: 'BANKNIFTY 54100 CE', symbolToken: '26009', qty: 30 }
      ];
      const brokerMismatched: any[] = [
        { symboltoken: '26000', netqty: '50' },
        { symboltoken: '26009', netqty: '15' } // Broker has only 15 vs local 30
      ];

      const res = angelOrderAdapter.reconcilePositions(local, brokerMismatched);
      assert.equal(res.isMatched, false);
      assert.equal(res.discrepancies.length, 1);
      assert.ok(res.discrepancies[0].includes('Local Qty 30 vs Broker Net Qty 15'));

      const brokerMatched: any[] = [
        { symboltoken: '26000', netqty: '50' },
        { symboltoken: '26009', netqty: '30' }
      ];
      const resMatch = angelOrderAdapter.reconcilePositions(local, brokerMatched);
      assert.equal(resMatch.isMatched, true);
      assert.equal(resMatch.discrepancies.length, 0);
    });

    it('should generate transparent paper vs live comparison report without double-counting', () => {
      const report = angelOrderAdapter.generateComparisonReport({
        symbol: 'NIFTY 50 25850 CE',
        action: 'BUY',
        qty: 50,
        intendedPrice: 145.00,
        targetPrice: 152.25,
        signal: 'STRONG_BUY',
        confluenceScore: 88,
        quorumVotes: 12,
        segment: 'NSE Options'
      });

      assert.equal(report.symbol, 'NIFTY 50 25850 CE');
      assert.equal(report.strategySignal, 'STRONG_BUY');
      assert.equal(report.paperExecution.status, 'FILLED');
      assert.ok(report.paperExecution.simulatedFillPrice > report.paperExecution.intendedPrice, 'Slippage must be modeled on BUY');
      assert.ok(report.paperExecution.brokerage > 0);
      assert.ok(report.paperExecution.statutoryTaxes > 0);

      // Verify no double counting:
      // netPnl must equal grossPnl - (brokerage + statutoryTaxes + slippage)
      const expectedTotalDeduction = Number((report.paperExecution.brokerage + report.paperExecution.statutoryTaxes + report.paperExecution.slippage).toFixed(2));
      const expectedNetPnl = Number((report.paperExecution.grossPnl - expectedTotalDeduction).toFixed(2));
      assert.equal(report.paperExecution.netPnl, expectedNetPnl, 'Net P&L formula must equal Gross - (Brokerage + Taxes + Slippage)');

      assert.equal(report.liveExecutionTarget.status, 'BLOCKED_BY_SAFETY_GATE');
      assert.ok(report.liveExecutionTarget.safetyReason.includes('LIVE_TRADING_DISABLED'));
    });
  });

  // ==========================================================================
  // 5. AUTHORITATIVE VS SYNTHETIC INSTRUMENT MASTER COVERAGE
  // ==========================================================================
  describe('5. Authoritative vs Synthetic Instrument Verification', () => {
    it('should correctly classify NSE cash/index instruments as authoritative', () => {
      const nifty = instrumentMaster.getInstrumentByToken('26000', 'NSE');
      assert.ok(nifty);
      assert.equal(nifty.verifiedAuthoritative, true);
      assert.equal(nifty.lotsize, 1);
      assert.equal(nifty.tick_size, 0.05);

      const rel = instrumentMaster.getInstrumentByToken('2885', 'NSE');
      assert.ok(rel);
      assert.equal(rel.verifiedAuthoritative, true);
      assert.equal(rel.symbol, 'RELIANCE-EQ');
    });

    it('should flag MCX commodity synthetic placeholder tokens as unverified authoritative', () => {
      const gold = instrumentMaster.getInstrumentByToken('234567', 'MCX');
      assert.ok(gold);
      assert.equal(gold.verifiedAuthoritative, false, 'MCX placeholder tokens must be marked unverified');

      const stats = instrumentMaster.getStats();
      assert.ok(stats.authoritativeCount > 0);
      assert.ok(stats.syntheticCount >= 3);
    });
  });
});
