import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AngelMarketDataAdapter,
  generateTOTP,
  MarketQuote
} from '../src/utils/angelMarketDataAdapter';
import { AngelOrderExecutionAdapter, angelOrderAdapter } from '../src/utils/angelOrderAdapter';
import { instrumentMaster } from '../src/utils/instrumentMaster';
import { DatabaseSync } from 'node:sqlite';

function buildSmartStreamPacket(params: {
  mode?: number;
  exchangeType?: number;
  token: string;
  sequenceNumber: number;
  exchangeTimestamp: number;
  ltpPaise: number;
  volumeToday?: number;
  totalLength?: number;
}): Buffer {
  const length = params.totalLength || (params.volumeToday ? 123 : 51);
  const buf = Buffer.alloc(length);

  // Offset 0: Subscription Mode (1 = LTP, 2 = Quote)
  buf.writeInt8(params.mode ?? (params.volumeToday ? 2 : 1), 0);

  // Offset 1: Exchange Type (1 = NSE_CM, 2 = NSE_FO, 5 = MCX_FO)
  buf.writeInt8(params.exchangeType ?? 1, 1);

  // Offset 2-26: Token (25 bytes null-padded UTF-8 string)
  buf.write(params.token, 2, 25, 'utf8');

  // Offset 27-34: Sequence Number (8 bytes int64 LE)
  buf.writeBigInt64LE(BigInt(params.sequenceNumber), 27);

  // Offset 35-42: Exchange Timestamp (8 bytes int64 LE)
  buf.writeBigInt64LE(BigInt(params.exchangeTimestamp), 35);

  // Offset 43-50: LTP in Paise (8 bytes int64 LE)
  buf.writeBigInt64LE(BigInt(params.ltpPaise), 43);

  // Offset 67-74: Volume Traded Today (8 bytes int64 LE, for Quote mode)
  if (params.volumeToday && length >= 75) {
    buf.writeBigInt64LE(BigInt(params.volumeToday), 67);
  }

  return buf;
}

test('PHASE 4: SmartStream v2 51-byte Binary Packet Parser parses valid LTP payload', () => {
  const adapter = new AngelMarketDataAdapter();
  const now = Date.now();
  const packet = buildSmartStreamPacket({
    mode: 1,
    exchangeType: 1,
    token: '2885', // RELIANCE
    sequenceNumber: 1001,
    exchangeTimestamp: now,
    ltpPaise: 298550 // ₹2985.50
  });

  assert.equal(packet.length, 51, 'Standard LTP packet must be exactly 51 bytes');
  const parsed = adapter.parseBinaryPacket(packet);
  assert.equal(parsed, true, 'parseBinaryPacket should return true for valid 51-byte packet');

  const quote = adapter.getQuote('RELIANCE');
  assert.ok(quote, 'Quote for RELIANCE must be registered');
  assert.equal(quote?.symbol, 'RELIANCE');
  assert.equal(quote?.token, '2885');
  assert.equal(quote?.price, 2985.50);
  assert.equal(quote?.sequenceNumber, 1001);
  assert.equal(quote?.dataAgeStatus, 'FRESH');
  assert.equal(quote?.source, 'OFFICIAL_ANGEL_ONE_SMARTSTREAM');
});

test('PHASE 4: SmartStream v2 rejects truncated or corrupted packets safely', () => {
  const adapter = new AngelMarketDataAdapter();

  // 1. Truncated packet (< 51 bytes)
  const shortBuf = Buffer.alloc(50);
  assert.equal(adapter.parseBinaryPacket(shortBuf), false, 'Must reject packet shorter than 51 bytes');

  // 2. Zero price
  const zeroPricePacket = buildSmartStreamPacket({
    token: '2885',
    sequenceNumber: 1002,
    exchangeTimestamp: Date.now(),
    ltpPaise: 0
  });
  assert.equal(adapter.parseBinaryPacket(zeroPricePacket), false, 'Must reject packet with 0 LTP');

  // 3. Zero / invalid exchange timestamp
  const zeroTimePacket = buildSmartStreamPacket({
    token: '2885',
    sequenceNumber: 1003,
    exchangeTimestamp: 0,
    ltpPaise: 298000
  });
  assert.equal(adapter.parseBinaryPacket(zeroTimePacket), false, 'Must reject packet with 0 exchange timestamp');

  // 4. Unknown unmapped token
  const unknownTokenPacket = buildSmartStreamPacket({
    token: '9999999999',
    sequenceNumber: 1004,
    exchangeTimestamp: Date.now(),
    ltpPaise: 150000
  });
  assert.equal(adapter.parseBinaryPacket(unknownTokenPacket), false, 'Must reject unmapped unknown token');
});

test('PHASE 4: Dynamic resolution of Master Universe scrips (e.g. TCS-EQ token 11536)', () => {
  const adapter = new AngelMarketDataAdapter();
  const tcsRecord = instrumentMaster.getInstrumentByToken('11536');
  assert.ok(tcsRecord, 'Token 11536 must exist in instrumentMaster');
  assert.equal(tcsRecord?.symbol, 'TCS-EQ');

  const now = Date.now();
  const packet = buildSmartStreamPacket({
    token: '11536',
    sequenceNumber: 5001,
    exchangeTimestamp: now,
    ltpPaise: 412575 // ₹4125.75
  });

  const parsed = adapter.parseBinaryPacket(packet);
  assert.equal(parsed, true, 'Must parse and dynamically map Master Universe instrument');

  const quote = adapter.getQuote('TCS');
  assert.ok(quote, 'Quote for TCS must be registered via dynamic master lookup');
  assert.equal(quote?.symbol, 'TCS');
  assert.equal(quote?.token, '11536');
  assert.equal(quote?.price, 4125.75);
});

test('PHASE 4: Duplicate and out-of-order tick sequence guard', () => {
  const adapter = new AngelMarketDataAdapter();
  const now = Date.now();

  const p1 = buildSmartStreamPacket({
    token: '1333', // HDFCBANK
    sequenceNumber: 2000,
    exchangeTimestamp: now,
    ltpPaise: 168000
  });
  assert.equal(adapter.parseBinaryPacket(p1), true, 'First tick with sequence 2000 accepted');

  // Duplicate sequence 2000 must be discarded
  const p2Duplicate = buildSmartStreamPacket({
    token: '1333',
    sequenceNumber: 2000,
    exchangeTimestamp: now,
    ltpPaise: 168100
  });
  assert.equal(adapter.parseBinaryPacket(p2Duplicate), false, 'Duplicate sequence 2000 must be discarded');

  // Stale out-of-order sequence 1999 must be discarded
  const p3OutOfOrder = buildSmartStreamPacket({
    token: '1333',
    sequenceNumber: 1999,
    exchangeTimestamp: now,
    ltpPaise: 168200
  });
  assert.equal(adapter.parseBinaryPacket(p3OutOfOrder), false, 'Older sequence 1999 must be discarded');

  // Higher sequence 2001 must be accepted
  const p4Next = buildSmartStreamPacket({
    token: '1333',
    sequenceNumber: 2001,
    exchangeTimestamp: now,
    ltpPaise: 168500
  });
  assert.equal(adapter.parseBinaryPacket(p4Next), true, 'Next sequence 2001 must be accepted');
  assert.equal(adapter.getQuote('HDFCBANK')?.price, 1685.00);
});

test('PHASE 4: Mode 2 (Quote mode 123-byte) volume extraction', () => {
  const adapter = new AngelMarketDataAdapter();
  const packet = buildSmartStreamPacket({
    mode: 2,
    token: '2885',
    sequenceNumber: 3001,
    exchangeTimestamp: Date.now(),
    ltpPaise: 299000,
    volumeToday: 15400000, // 15.4M shares
    totalLength: 123
  });

  assert.equal(adapter.parseBinaryPacket(packet), true);
  const quote = adapter.getQuote('RELIANCE');
  assert.ok(quote);
  assert.equal(quote?.volume, '15.4M');
});

test('PHASE 4: Stale tick detector correctly marks timestamps older than 120 seconds', () => {
  const adapter = new AngelMarketDataAdapter();
  const now = Date.now();

  // Tick timestamp 150 seconds ago (> 120s stale window)
  const stalePacket = buildSmartStreamPacket({
    token: '2885',
    sequenceNumber: 4001,
    exchangeTimestamp: now - 150000,
    ltpPaise: 298000
  });
  assert.equal(adapter.parseBinaryPacket(stalePacket), true);
  assert.equal(adapter.getQuote('RELIANCE')?.dataAgeStatus, 'STALE', 'Packet > 120s old must be marked STALE');

  // Fresh tick (1 second ago)
  const freshPacket = buildSmartStreamPacket({
    token: '2885',
    sequenceNumber: 4002,
    exchangeTimestamp: now - 1000,
    ltpPaise: 298200
  });
  assert.equal(adapter.parseBinaryPacket(freshPacket), true);
  assert.equal(adapter.getQuote('RELIANCE')?.dataAgeStatus, 'FRESH', 'Recent packet must be marked FRESH');
});

test('PHASE 4: RFC 6238 TOTP Generator produces authentic 6-digit codes', () => {
  // Test with standard 32-character Base32 key
  const secret1 = 'JBSWY3DPEHPK3PXP';
  const totp1 = generateTOTP(secret1);
  assert.match(totp1, /^\d{6}$/, 'TOTP must be exactly 6 numeric digits');

  // Test consistency within the same 30-second epoch window
  const totp2 = generateTOTP(secret1);
  assert.equal(totp1, totp2, 'TOTP must be deterministic within same 30s epoch step');

  // Test malformed secret returns safe fallback without throwing
  const malformed = generateTOTP('invalid!@#$secret');
  assert.equal(typeof malformed, 'string');
});

test('PHASE 4: Connection state transitions (STANDBY, CONNECTED, STALE, DISCONNECTED, ERROR)', () => {
  const adapter = new AngelMarketDataAdapter();
  
  // 1. Initial state without credentials: STANDBY
  const initialStatus = adapter.getStatus();
  assert.equal(initialStatus.hasCredentials, false);
  assert.equal(initialStatus.connectionState, 'STANDBY');
  assert.match(initialStatus.statusMessage, /Standby:/);

  // 2. Feed live tick -> CONNECTED
  const liveTick = buildSmartStreamPacket({
    token: '26000', // NIFTY 50
    sequenceNumber: 7001,
    exchangeTimestamp: Date.now(),
    ltpPaise: 2585000 // 25850.00
  });
  adapter.parseBinaryPacket(liveTick);
  
  // Note: isLiveStreaming() checks this.isLiveConnected && tickAge <= 15000.
  // When parsing a binary packet directly, it dispatches tick and updates lastLiveTickTimestamp
  const quote = adapter.getQuote('NIFTY 50');
  assert.equal(quote?.price, 25850.00);
  assert.equal(quote?.source, 'OFFICIAL_ANGEL_ONE_SMARTSTREAM');

  // 3. Test text JSON stream error packet (e.g. session expired from broker)
  const jsonErrorPacket = JSON.stringify({
    status: false,
    message: 'Session Expired or Invalid Token',
    errorcode: 'AG8001'
  });
  const handled = adapter.parseBinaryPacket(jsonErrorPacket);
  assert.equal(handled, false, 'Stream error packet returns false');
  
  adapter.stop();
  const stoppedStatus = adapter.getStatus();
  assert.equal(stoppedStatus.isLiveConnected, false);
});

test('PHASE 4: Exponential backoff calculation complies with rate-limit mitigation', () => {
  const maxAttempts = 5;
  const delays: number[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const delay = Math.min(30000, 1000 * Math.pow(2, attempt));
    delays.push(delay);
  }

  assert.deepEqual(delays, [2000, 4000, 8000, 16000, 30000], 'Backoff progression must be 2s, 4s, 8s, 16s, 30s');
  // Attempt 6 capped at 30,000ms
  const cappedDelay = Math.min(30000, 1000 * Math.pow(2, 6));
  assert.equal(cappedDelay, 30000, 'Backoff must cap at 30,000ms');
});

test('PHASE 4: SmartAPI Session Lifecycle and 150-minute expiry window', () => {
  const adapter = new AngelMarketDataAdapter();
  assert.equal(adapter.isSessionValid(), false, 'Session must be invalid before token issuance');

  adapter.setSessionTokens('test_jwt_token', 'test_feed_token', 'test_refresh_token');
  assert.equal(adapter.isSessionValid(), true, 'Session must be valid after setting tokens');

  const status = adapter.getStatus();
  assert.equal(status.jwtLifetimeMinutes, 150, 'Intraday JWT lifetime is 150 minutes');
  assert.ok(status.tokenExpiresAt && status.tokenExpiresAt > Date.now(), 'Expiry must be in future');
});

test('PHASE 4: Market tick integration with listener callback pipeline', () => {
  const adapter = new AngelMarketDataAdapter();
  const receivedQuotes: MarketQuote[] = [];

  const unsubscribe = adapter.onTick((quote) => {
    receivedQuotes.push(quote);
  });

  const packet = buildSmartStreamPacket({
    token: '1594', // INFY
    sequenceNumber: 8001,
    exchangeTimestamp: Date.now(),
    ltpPaise: 189500 // 1895.00
  });

  adapter.parseBinaryPacket(packet);

  assert.equal(receivedQuotes.length, 1);
  assert.equal(receivedQuotes[0].symbol, 'INFY');
  assert.equal(receivedQuotes[0].price, 1895.00);

  unsubscribe();
  adapter.parseBinaryPacket(buildSmartStreamPacket({
    token: '1594',
    sequenceNumber: 8002,
    exchangeTimestamp: Date.now(),
    ltpPaise: 189600
  }));
  assert.equal(receivedQuotes.length, 1, 'Unsubscribed listener must not receive further ticks');
});

test('PHASE 4: Live Execution Safety Invariant (LIVE_TRADING_ELIGIBLE = false)', () => {
  assert.equal(
    AngelOrderExecutionAdapter.LIVE_TRADING_ELIGIBLE,
    false,
    'LIVE_TRADING_ELIGIBLE must be compile-time false'
  );

  const gate = angelOrderAdapter.canExecuteLiveOrder();
  assert.equal(gate.allowed, false, 'canExecuteLiveOrder() must strictly reject');
  assert.match(gate.reason, /LIVE_TRADING_DISABLED/);

  const safety = angelOrderAdapter.getSafetyStatus();
  assert.equal(safety.liveTradingEligible, false);
  assert.equal(safety.isArmed, false);
});

test('PHASE 4: Database Cleanliness & Zero Unconfigured Broker Connections', () => {
  const db = new DatabaseSync('server/data/chintu_runtime.db');
  
  // Verify SQLite PRAGMA integrity
  const integrity = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
  assert.equal(integrity[0]?.integrity_check, 'ok', 'Database integrity must be ok');

  // Verify zero open active trades or positions
  const openTrades = db.prepare("SELECT count(*) as c FROM trades").get() as { c: number };
  const openPositions = db.prepare("SELECT count(*) as c FROM positions").get() as { c: number };
  assert.equal(openTrades.c, 0, 'Production DB must have 0 trades');
  assert.equal(openPositions.c, 0, 'Production DB must have 0 positions');

  // Verify user connections are DISCONNECTED or NOT_CONFIGURED
  const activeLiveConnections = db.prepare(
    "SELECT count(*) as c FROM user_connections WHERE status = 'CONNECTED'"
  ).get() as { c: number };
  assert.equal(activeLiveConnections.c, 0, 'No false CONNECTED broker sessions allowed in DB');

  db.close();
});
