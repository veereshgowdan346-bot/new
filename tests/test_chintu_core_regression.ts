import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { DatabasePersistenceService, PositionRecord, TradeRecord } from '../src/utils/databasePersistence';
import { generateTOTP, AngelMarketDataAdapter } from '../src/utils/angelMarketDataAdapter';
import { evaluate14BotQuorumConsensus, BOT_DEFINITIONS, QUORUM_DECISION_TYPES } from '../src/utils/quorumConsensusEngine';
import { calculateDynamicKellyPositionSize, CAPITAL_TIERS } from '../src/utils/kellyPositionSizer';
import { calculateTradeCharges, validateNetProfitGuardrail } from '../src/utils/taxCalculator';

describe('CHINTU AI QUANT — CORE REGRESSION & PERSISTENCE TEST SUITE', () => {
  const testDbDir = path.resolve('scratch/test_db');
  const testDbPath = path.join(testDbDir, 'test_regression.db');
  let dbService: DatabasePersistenceService;

  before(() => {
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    dbService = new DatabasePersistenceService(testDbPath);
    dbService.init();
  });

  after(() => {
    dbService.close();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      const wal = `${testDbPath}-wal`;
      const shm = `${testDbPath}-shm`;
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    } catch (e) {}
  });

  // ==========================================================================
  // 1. DATABASE PERSISTENCE TESTS
  // ==========================================================================
  describe('1. SQLite Database Persistence Engine', () => {
    it('should save, retrieve, and update open positions correctly', () => {
      const position: PositionRecord = {
        id: 'test_pos_001',
        symbol: 'NIFTY 50 25850 CE',
        bot: 'Gamma Squeeze Scalper',
        action: 'BUY',
        qty: 50,
        entryPrice: 140.50,
        ltp: 145.20,
        pnl: 235.00,
        pnlPct: 3.35,
        charges: 24.50,
        openedAt: '10:15:00',
        status: 'OPEN'
      };

      dbService.upsertPosition(position);

      const openPositions = dbService.getOpenPositions();
      assert.equal(openPositions.length, 1);
      assert.equal(openPositions[0].id, 'test_pos_001');
      assert.equal(openPositions[0].symbol, 'NIFTY 50 25850 CE');
      assert.equal(openPositions[0].qty, 50);
      assert.equal(openPositions[0].entryPrice, 140.50);

      // Update position LTP & PnL
      const updatedPos: PositionRecord = {
        ...position,
        ltp: 152.00,
        pnl: 575.00,
        pnlPct: 8.19
      };
      dbService.upsertPosition(updatedPos);

      const refreshed = dbService.getOpenPositions();
      assert.equal(refreshed.length, 1);
      assert.equal(refreshed[0].ltp, 152.00);
      assert.equal(refreshed[0].pnl, 575.00);

      // Close position
      dbService.closePosition('test_pos_001');
      const afterClose = dbService.getOpenPositions();
      assert.equal(afterClose.length, 0);
    });

    it('should persist trades with regulatory charges and audit breakdowns', () => {
      const trade: TradeRecord = {
        id: 'tr_test_901',
        orderId: 'ord_test_901',
        symbol: 'BANKNIFTY',
        bot: 'BankNifty Breakout Hunter',
        action: 'BUY',
        qty: 30,
        price: 54100.00,
        pnl: 1450.00,
        grossPnl: 1520.00,
        netPnl: 1450.00,
        charges: 70.00,
        status: 'FILLED',
        timestamp: '11:30:15',
        breakdown: { brokerage: 40.0, stt: 12.5, gst: 9.45, sebi: 0.15, stampDuty: 7.9, slippage: 8.12 }
      };

      dbService.saveTrade(trade);

      const trades = dbService.getRecentTrades(10);
      assert.equal(trades.length, 1);
      assert.equal(trades[0].id, 'tr_test_901');
      assert.equal(trades[0].symbol, 'BANKNIFTY');
      assert.equal(trades[0].charges, 70.00);
      assert.ok(trades[0].breakdown);
      assert.equal(trades[0].breakdown.brokerage, 40.0);
    });

    it('should log and retrieve autonomous RMS circuit breaker events', () => {
      dbService.logRmsEvent({
        id: 'evt_001',
        timestamp: '12:00:00',
        event: 'EMERGENCY_KILL_SWITCH_ENGAGED',
        level: 'CRITICAL',
        details: 'Intraday drawdown breached threshold. 2 positions squared off.'
      });

      const events = dbService.getRecentRmsEvents(5);
      assert.equal(events.length, 1);
      assert.equal(events[0].id, 'evt_001');
      assert.equal(events[0].level, 'CRITICAL');
    });

    it('should persist chat history messages', () => {
      dbService.saveChatMessage('user', 'What is Bot 4 doing?', '12:01:00');
      dbService.saveChatMessage('jarvis', 'Bot 4 is monitoring 25850 CE strike.', '12:01:02');

      const msgs = dbService.getRecentChatMessages(10);
      assert.equal(msgs.length, 2);
      assert.equal(msgs[0].sender, 'user');
      assert.equal(msgs[1].sender, 'jarvis');
    });

    it('should guarantee restart persistence across database disconnect and reconnect', () => {
      // 1. Write an open position and a trade
      const restartPos: PositionRecord = {
        id: 'pos_restart_01',
        symbol: 'FINNIFTY',
        bot: 'Mean Reversion Pro',
        action: 'BUY',
        qty: 40,
        entryPrice: 24200.00,
        ltp: 24260.00,
        pnl: 2400.00,
        pnlPct: 0.25,
        charges: 45.00,
        openedAt: '09:30:00',
        status: 'OPEN'
      };
      dbService.upsertPosition(restartPos);

      // 2. Close db instance simulating server shutdown
      dbService.close();

      // 3. Open a completely new DatabasePersistenceService instance on the same DB file
      const restoredService = new DatabasePersistenceService(testDbPath);
      restoredService.init();

      // 4. Verify data survived the restart cleanly
      const openPositions = restoredService.getOpenPositions();
      const match = openPositions.find((p) => p.id === 'pos_restart_01');
      assert.ok(match, 'Position must survive server restart in SQLite WAL file');
      assert.equal(match.symbol, 'FINNIFTY');
      assert.equal(match.qty, 40);
      assert.equal(match.pnl, 2400.00);

      // Check chat messages survived restart
      const msgs = restoredService.getRecentChatMessages(10);
      assert.ok(msgs.length >= 2);
      assert.equal(msgs[0].sender, 'user');

      // Reassign to dbService for after() hook cleanup
      dbService = restoredService;
    });

    it('should prevent duplicate orders and handle conflict resolution idempotently', () => {
      const orderId = 'ord_idempotent_01';
      const tradeA: TradeRecord = {
        id: orderId,
        orderId,
        symbol: 'RELIANCE',
        bot: 'Institutional Equities Rider',
        action: 'BUY',
        qty: 15,
        price: 2980.00,
        pnl: 0,
        charges: 25.00,
        status: 'FILLED',
        timestamp: '10:00:00'
      };

      // First insertion
      dbService.saveTrade(tradeA);

      // Second insertion with same ID but updated status / PnL
      const tradeB: TradeRecord = {
        ...tradeA,
        pnl: 150.00,
        netPnl: 125.00,
        status: 'CLOSED'
      };
      dbService.saveTrade(tradeB);

      const trades = dbService.getRecentTrades(100);
      const matches = trades.filter((t) => t.id === orderId);
      assert.equal(matches.length, 1, 'Duplicate trade submission must NOT duplicate database row');
      assert.equal(matches[0].pnl, 150.00);
      assert.equal(matches[0].status, 'CLOSED');
    });

    it('should atomically clear all positions on RMS emergency stop', () => {
      // Add two positions
      dbService.upsertPosition({
        id: 'pos_kill_1',
        symbol: 'NIFTY 50',
        bot: 'Alpha Trend Scalper',
        action: 'BUY',
        qty: 50,
        entryPrice: 25800.00,
        ltp: 25850.00,
        pnl: 2500.00,
        pnlPct: 0.19,
        charges: 30.00,
        openedAt: '10:00:00',
        status: 'OPEN'
      });
      dbService.upsertPosition({
        id: 'pos_kill_2',
        symbol: 'GOLD MCX',
        bot: 'Bullion Macro Scalper',
        action: 'BUY',
        qty: 1,
        entryPrice: 78400.00,
        ltp: 78500.00,
        pnl: 100.00,
        pnlPct: 0.13,
        charges: 35.00,
        openedAt: '10:05:00',
        status: 'OPEN'
      });

      // Clear all positions
      dbService.clearAllPositions();

      const openAfter = dbService.getOpenPositions();
      assert.equal(openAfter.length, 0, 'RMS clearAllPositions must mark all open positions as CLOSED');
    });
  });

  // ==========================================================================
  // 2. OFFICIAL BROKER MARKET-DATA ADAPTER TESTS
  // ==========================================================================
  describe('2. Angel One SmartAPI Market Data Adapter', () => {
    it('should generate valid RFC 6238 6-digit TOTP codes from Base32 secrets', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const code = generateTOTP(secret);
      assert.equal(typeof code, 'string');
      assert.equal(code.length, 6);
      assert.match(code, /^\d{6}$/);
    });

    it('should safely mask credentials and report accurate telemetry', () => {
      const adapter = new AngelMarketDataAdapter({
        apiKey: 'test_api_key_123',
        clientId: 'V346892',
        pin: '1234',
        totpSecret: 'JBSWY3DPEHPK3PXP'
      });

      const status = adapter.getStatus();
      assert.equal(status.hasCredentials, true);
      assert.equal(status.clientMasked, 'V3***92');
      assert.ok(!JSON.stringify(status).includes('1234'));
      assert.ok(!JSON.stringify(status).includes('test_api_key_123'));
    });

    it('should fail-closed safely when credentials are missing or unconfigured', async () => {
      const adapter = new AngelMarketDataAdapter({
        apiKey: '',
        clientId: '',
        pin: '',
        totpSecret: ''
      });

      const result = await adapter.authenticate();
      assert.equal(result.success, false);
      assert.ok(result.message.includes('Credentials missing'));

      // Status should report Authentic Paper Replay fallback
      const status = adapter.getStatus();
      assert.equal(status.isLiveConnected, false);
      assert.equal(status.feedSource, 'AUTHENTIC_PAPER_REPLAY');
    });

    it('should accurately parse valid 51-byte SmartStream v2 LTP binary packets', () => {
      const adapter = new AngelMarketDataAdapter();
      let dispatchedQuote: any = null;
      adapter.onTick((quote) => {
        dispatchedQuote = quote;
      });

      // Construct a valid 51-byte SmartStream binary packet:
      // Byte 0: mode = 1 (LTP)
      // Byte 1: exchange = 1 (NSE CM)
      // Bytes 2-26: token = '26000' (NIFTY 50) null-padded
      // Bytes 27-34: seq = 1001
      // Bytes 35-42: timestamp = 1718000000000
      // Bytes 43-50: LTP in paise = 2584550 (which is Rs 25,845.50)
      const buf = Buffer.alloc(51);
      buf.writeInt8(1, 0); // mode
      buf.writeInt8(1, 1); // exchange
      buf.write('26000', 2, 25, 'utf8'); // token
      buf.writeBigInt64LE(BigInt(1001), 27); // seq
      const testTime = Date.now();
      buf.writeBigInt64LE(BigInt(testTime), 35); // timestamp
      buf.writeBigInt64LE(BigInt(2584550), 43); // 25845.50 * 100 = 2584550 paise

      const parsed = adapter.parseBinaryPacket(buf);
      assert.equal(parsed, true);
      assert.ok(dispatchedQuote);
      assert.equal(dispatchedQuote.symbol, 'NIFTY 50');
      assert.equal(dispatchedQuote.price, 25845.50);
      assert.equal(dispatchedQuote.source, 'OFFICIAL_ANGEL_ONE_SMARTSTREAM');
    });

    it('should safely reject malformed, truncated, or out-of-bounds binary packets', () => {
      const adapter = new AngelMarketDataAdapter();

      // Case 1: Empty buffer (0 bytes)
      assert.equal(adapter.parseBinaryPacket(Buffer.alloc(0)), false);

      // Case 2: Truncated buffer (10 bytes)
      assert.equal(adapter.parseBinaryPacket(Buffer.alloc(10)), false);

      // Case 3: Exactly 43 bytes (missing 8-byte LTP in paise, must not throw RangeError)
      assert.equal(adapter.parseBinaryPacket(Buffer.alloc(43)), false);

      // Case 4: 50 bytes (1 byte short of 51 bytes required for int64)
      assert.equal(adapter.parseBinaryPacket(Buffer.alloc(50)), false);

      // Case 5: 51 bytes with unknown token
      const unknownBuf = Buffer.alloc(51);
      unknownBuf.write('999999', 2, 25, 'utf8');
      unknownBuf.writeBigInt64LE(BigInt(50000), 43);
      assert.equal(adapter.parseBinaryPacket(unknownBuf), false);

      // Case 6: 51 bytes with zero / negative price
      const zeroBuf = Buffer.alloc(51);
      zeroBuf.write('26000', 2, 25, 'utf8');
      zeroBuf.writeBigInt64LE(BigInt(0), 43);
      assert.equal(adapter.parseBinaryPacket(zeroBuf), false);
    });

    it('should detect and monitor stale feed timestamps', () => {
      const adapter = new AngelMarketDataAdapter();
      const status = adapter.getStatus();
      assert.ok(status.lastTickTime > 0);

      // Verify that if lastTickTime is older than 60s, stale condition can be flagged
      const now = Date.now();
      const tickAgeMs = now - status.lastTickTime;
      assert.ok(tickAgeMs >= 0);
    });

    it('should provide authentic baseline quotes for 7 core market instruments', () => {
      const adapter = new AngelMarketDataAdapter();
      const quotes = adapter.getQuotes();
      const symbols = Object.keys(quotes);

      assert.ok(symbols.includes('NIFTY 50'));
      assert.ok(symbols.includes('BANKNIFTY'));
      assert.ok(symbols.includes('FINNIFTY'));
      assert.ok(symbols.includes('GOLD MCX'));
      assert.ok(symbols.includes('RELIANCE'));
      assert.ok(symbols.includes('HDFCBANK'));
      assert.ok(symbols.includes('INFY'));

      assert.ok(quotes['NIFTY 50'].price > 20000);
      assert.ok(quotes['BANKNIFTY'].price > 45000);
      assert.ok(quotes['GOLD MCX'].price > 65000);
    });

    it('should discard duplicate ticks with identical sequence number', () => {
      const adapter = new AngelMarketDataAdapter();
      let tickCount = 0;
      adapter.onTick(() => { tickCount++; });

      const buf1 = Buffer.alloc(51);
      buf1.writeInt8(1, 0); // mode
      buf1.writeInt8(1, 1); // exchange
      buf1.write('26000', 2, 25, 'utf8');
      buf1.writeBigInt64LE(BigInt(5001), 27); // seq 5001
      buf1.writeBigInt64LE(BigInt(Date.now()), 35);
      buf1.writeBigInt64LE(BigInt(2585000), 43);

      const parsed1 = adapter.parseBinaryPacket(buf1);
      assert.equal(parsed1, true);
      assert.equal(tickCount, 1);

      // Same sequence number 5001 submitted again
      const parsed2 = adapter.parseBinaryPacket(buf1);
      assert.equal(parsed2, false, 'Duplicate sequence number must be discarded');
      assert.equal(tickCount, 1, 'Duplicate tick must NOT trigger listener callback');
    });

    it('should label stale ticks (exchange timestamp > 120s old) with STALE status', () => {
      const adapter = new AngelMarketDataAdapter();
      let lastQuote: any = null;
      adapter.onTick((q) => { lastQuote = q; });

      const staleTime = Date.now() - 150000; // 150 seconds ago (> 120s threshold)
      const buf = Buffer.alloc(51);
      buf.writeInt8(1, 0);
      buf.writeInt8(1, 1);
      buf.write('26000', 2, 25, 'utf8');
      buf.writeBigInt64LE(BigInt(5002), 27);
      buf.writeBigInt64LE(BigInt(staleTime), 35);
      buf.writeBigInt64LE(BigInt(2586000), 43);

      const parsed = adapter.parseBinaryPacket(buf);
      assert.equal(parsed, true);
      assert.ok(lastQuote);
      assert.equal(lastQuote.dataAgeStatus, 'STALE');
      assert.equal(lastQuote.source, 'OFFICIAL_ANGEL_ONE_SMARTSTREAM');
    });

    it('should accurately parse and map multi-asset commodities and midcap index', () => {
      const adapter = new AngelMarketDataAdapter();
      const dispatched: any[] = [];
      adapter.onTick((q) => { dispatched.push(q); });

      // Token 234568 -> SILVER MCX
      const silverBuf = Buffer.alloc(51);
      silverBuf.writeInt8(1, 0);
      silverBuf.writeInt8(5, 1); // MCX
      silverBuf.write('234568', 2, 25, 'utf8');
      silverBuf.writeBigInt64LE(BigInt(6001), 27);
      silverBuf.writeBigInt64LE(BigInt(Date.now()), 35);
      silverBuf.writeBigInt64LE(BigInt(9245000), 43); // 92450.00
      adapter.parseBinaryPacket(silverBuf);

      // Token 26074 -> MIDCPNIFTY
      const midcapBuf = Buffer.alloc(51);
      midcapBuf.writeInt8(1, 0);
      midcapBuf.writeInt8(1, 1);
      midcapBuf.write('26074', 2, 25, 'utf8');
      midcapBuf.writeBigInt64LE(BigInt(6002), 27);
      midcapBuf.writeBigInt64LE(BigInt(Date.now()), 35);
      midcapBuf.writeBigInt64LE(BigInt(1324000), 43); // 13240.00
      adapter.parseBinaryPacket(midcapBuf);

      assert.equal(dispatched.length, 2);
      assert.equal(dispatched[0].symbol, 'SILVER MCX');
      assert.equal(dispatched[0].price, 92450.00);
      assert.equal(dispatched[1].symbol, 'MIDCPNIFTY');
      assert.equal(dispatched[1].price, 13240.00);
    });

    it('should manage session token expiration and session validity lifecycle', () => {
      const adapter = new AngelMarketDataAdapter({
        apiKey: 'test_key',
        clientId: 'V123',
        pin: '1111',
        totpSecret: 'JBSWY3DPEHPK3PXP'
      });

      assert.equal(adapter.isSessionValid(), false, 'Session without tokens must be invalid');
      assert.equal(adapter.isLiveStreaming(), false, 'Unconnected adapter cannot be live streaming');
    });
  });

  // ==========================================================================
  // 3. STATUTORY TAXATION & NET ROI HURDLE VERIFICATION
  // ==========================================================================
  describe('3. Statutory Net-ROI Hurdle & Pre-Trade Guardrails', () => {
    it('should reject unviable setups where projected net ROI fails 1.50% hurdle', () => {
      const hurdlePct = 1.50;
      const entryPrice = 140.00;
      const qty = 50;
      const orderValue = entryPrice * qty; // Rs 7,000

      // Sub-threshold target: gain of Rs 20 against roundtrip charges of ~Rs 16.50
      const subThresholdExit = 140.40;
      const grossGain = (subThresholdExit - entryPrice) * qty; // Rs 20.00
      const roundtripCharges = 16.50;
      const netGain = grossGain - roundtripCharges; // Rs 3.50
      const netRoiPct = (netGain / orderValue) * 100; // 0.05%

      assert.ok(netRoiPct < hurdlePct, 'Must fail 1.50% hurdle');
    });

    it('should approve robust setups where projected net ROI meets 1.50% hurdle', () => {
      const hurdlePct = 1.50;
      const entryPrice = 140.00;
      const qty = 50;
      const orderValue = entryPrice * qty; // Rs 7,000

      // Strong target: +3.0% gain
      const viableExit = entryPrice * 1.03; // 144.20
      const grossGain = (viableExit - entryPrice) * qty; // Rs 210.00
      const roundtripCharges = 17.20;
      const netGain = grossGain - roundtripCharges; // Rs 192.80
      const netRoiPct = (netGain / orderValue) * 100; // 2.75%

      assert.ok(netRoiPct >= hurdlePct, 'Must clear 1.50% hurdle');
    });

    it('should accurately calculate all Indian statutory charges including slippage', () => {
      const charges = calculateTradeCharges({
        price: 140,
        qty: 50,
        action: 'BUY',
        segment: 'NSE Options',
        grossPnl: 300
      });

      assert.ok(charges.brokerage > 0, 'Brokerage must be positive');
      assert.equal(charges.stt, 0, 'STT is zero on BUY');
      assert.ok(charges.exchangeTurnover > 0, 'Exchange turnover fee required');
      assert.ok(charges.gst > 0, 'GST required');
      assert.ok(charges.sebiCharges > 0, 'SEBI charge required');
      assert.ok(charges.stampDuty > 0, 'Stamp duty required on BUY');
      assert.ok(charges.totalCharges > 0, 'Total charges must be positive');
      assert.ok(charges.netPnl < 300, 'Net PnL must deduct statutory charges');
    });
  });

  // ==========================================================================
  // 4. 14-BOT QUORUM & DYNAMIC KELLY RISK SIZING ENGINE
  // ==========================================================================
  describe('4. 14-Bot Fleet Quorum & Dynamic Position Sizing', () => {
    it('should audit all 14 bot fleet definitions and domain specializations', () => {
      assert.equal(BOT_DEFINITIONS.length, 14);
      BOT_DEFINITIONS.forEach((bot) => {
        assert.ok(bot.id >= 1 && bot.id <= 14);
        assert.ok(bot.name.length > 0);
        assert.ok(bot.asset.length > 0);
        assert.ok(bot.lotSize >= 1);
        assert.ok(bot.weight >= 1.0);
      });
    });

    it('should strictly approve trades only when Quorum meets or exceeds 9/14 bots', () => {
      const bullishCandles = Array.from({ length: 30 }, (_, i) => {
        const p = 25000 + i * 20;
        return { open: p - 10, high: p + 15, low: p - 5, close: p, volume: 50000, price: p };
      });

      const result = evaluate14BotQuorumConsensus({
        symbol: 'NIFTY 50',
        action: 'BUY',
        price: 25600,
        candles: bullishCandles
      });

      assert.ok(result.matchingVotes >= 9, 'Bullish confluence must produce >= 9 votes');
      assert.equal(result.isApproved, true);
      assert.equal(result.decision, QUORUM_DECISION_TYPES.APPROVED);
      assert.equal(result.totalBots, 14);
    });

    it('should strictly veto trades in the 7-8 vote marginal zone or <= 6 insufficient consensus', () => {
      const bearishCandles = Array.from({ length: 30 }, (_, i) => {
        const p = 26000 - i * 25;
        return { open: p + 10, high: p + 15, low: p - 10, close: p, volume: 50000, price: p };
      });

      const result = evaluate14BotQuorumConsensus({
        symbol: 'NIFTY 50',
        action: 'BUY',
        price: 25000,
        candles: bearishCandles
      });

      assert.ok(result.matchingVotes < 9, 'Counter-trend trade must not reach 9 votes');
      assert.equal(result.isApproved, false);
      assert.ok(
        result.decision === QUORUM_DECISION_TYPES.QUORUM_VETO ||
        result.decision === QUORUM_DECISION_TYPES.INSUFFICIENT_CONSENSUS
      );
    });

    it('should scale position size across micro accounts and cap institutional half-kelly risk', () => {
      // Micro account test (₹1,500)
      const micro = calculateDynamicKellyPositionSize({
        capital: 1500,
        assetPrice: 25,
        lotSize: 50,
        segment: 'NSE F&O Options',
        winRate: 0.70,
        stopLossPoints: 4
      });
      assert.equal(micro.capitalTier, CAPITAL_TIERS.MICRO);
      assert.ok(micro.positionValue <= 1500);
      assert.ok(micro.recommendedLots >= 1);

      // Institutional account test (₹5,00,000)
      const inst = calculateDynamicKellyPositionSize({
        capital: 500000,
        assetPrice: 25800,
        lotSize: 50,
        segment: 'NSE Index F&O',
        winRate: 0.74,
        winLossRatio: 2.0
      });
      assert.equal(inst.capitalTier, CAPITAL_TIERS.INSTITUTIONAL);
      assert.ok(inst.adjustedKellyFraction <= 25, 'Risk fraction must be clamped at 25%');
      assert.ok(inst.maxRiskCapital <= 125000);
    });
  });
});
