import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { getPaperCapital, DEFAULT_PAPER_CAPITAL, CAPITAL_DISCLAIMER } from '../src/utils/capitalConfig';
import { AngelOrderExecutionAdapter } from '../src/utils/angelOrderAdapter';
import { angelMarketDataAdapter } from '../src/utils/angelMarketDataAdapter';
import { connectionVault } from '../src/utils/connectionVault';
import { runtimeDb } from '../src/utils/databasePersistence';
import { paperSessionEngine } from '../src/utils/paperSessionEngine';
import { validateNetProfitGuardrail } from '../src/utils/taxCalculator';

const TEST_DB = path.resolve('server/data/test_audit_repairs.db');

test('Setup and teardown', { concurrency: false }, async (t) => {
  t.before(() => {
    if (fs.existsSync(TEST_DB)) {
      try { fs.unlinkSync(TEST_DB); } catch (e) {}
    }
    runtimeDb.init(TEST_DB);
  });

  t.after(() => {
    runtimeDb.close();
    if (fs.existsSync(TEST_DB)) {
      try { fs.unlinkSync(TEST_DB); } catch (e) {}
    }
  });

  await t.test('1. Capital Configuration & Honesty Disclaimer', () => {
    assert.strictEqual(DEFAULT_PAPER_CAPITAL, 100000, 'Default paper capital must be ₹1,00,000');
    assert.strictEqual(getPaperCapital(), 100000, 'getPaperCapital() must return default paper capital when unconfigured');
    assert.ok(CAPITAL_DISCLAIMER.includes('SIMULATED PAPER CAPITAL'), 'CAPITAL_DISCLAIMER must explicitly label simulated paper funds');
    assert.ok(CAPITAL_DISCLAIMER.includes('NOT REAL BROKER FUNDS'), 'CAPITAL_DISCLAIMER must declare funds are not real broker capital');
  });

  await t.test('2. Permanent Codebase Live Trading Lock Invariant', () => {
    assert.strictEqual(AngelOrderExecutionAdapter.LIVE_TRADING_ELIGIBLE, false, 'LIVE_TRADING_ELIGIBLE must be permanently false');
    
    const adapter = new AngelOrderExecutionAdapter();
    const safety = adapter.canExecuteLiveOrder();
    assert.strictEqual(safety.allowed, false, 'canExecuteLiveOrder() must return allowed=false');
    assert.ok(safety.reason.includes('LIVE_TRADING_DISABLED') || safety.reason.includes('LIVE_TRADING_ELIGIBLE is False'), 'Safety rejection reason must cite invariant lock');
    
    // Attempt arming
    const armed = adapter.armLiveTrading('AUTHORIZE_MIN_CAPITAL_LIVE_TRIAL');
    assert.strictEqual(armed, false, 'armLiveTrading must fail-close because LIVE_TRADING_ELIGIBLE is false');
  });

  await t.test('3. BSE SENSEX Token Canonical Mapping', () => {
    const quoteSensex = angelMarketDataAdapter.getQuote('SENSEX');
    assert.ok(quoteSensex, 'SENSEX quote must exist');
    assert.strictEqual(quoteSensex?.symbol, 'SENSEX');
    assert.strictEqual(quoteSensex?.token, '1');
    assert.strictEqual(quoteSensex?.price, 82341.20);
    assert.strictEqual(quoteSensex?.source, 'STANDBY_ANCHOR');
  });

  await t.test('4. Connection Vault Non-Destructive Credential Merging & Granular Statuses', () => {
    const testUserId = `test_user_${Date.now()}`;
    const initialCreds = {
      apiKey: 'TEST_API_KEY_INITIAL',
      clientId: 'TEST_CLIENT_INITIAL',
      pin: '1234',
      totpSecret: 'JBSWY3DPEHPK3PXP'
    };

    // 1. Initial save with all essential fields
    connectionVault.saveConnection(testUserId, 'angel_one', initialCreds);
    const connState1 = connectionVault.getConnectionState(testUserId, 'angel_one');
    assert.ok(connState1, 'Connection state must exist');
    assert.strictEqual(connState1.status, 'SAVED', 'Initial saved connection must have status SAVED');

    const decrypted1 = connectionVault.getDecryptedCredentials(testUserId, 'angel_one') as any;
    assert.strictEqual(decrypted1?.clientId, 'TEST_CLIENT_INITIAL');
    assert.strictEqual(decrypted1?.apiKey, 'TEST_API_KEY_INITIAL');
    assert.strictEqual(decrypted1?.pin, '1234');
    assert.strictEqual(decrypted1?.totpSecret, 'JBSWY3DPEHPK3PXP');

    // 2. Partial save (e.g. user re-saves without typing PIN again or with masked PIN)
    connectionVault.saveConnection(testUserId, 'angel_one', {
      apiKey: 'TEST_API_KEY_UPDATED'
    });
    
    const decrypted2 = connectionVault.getDecryptedCredentials(testUserId, 'angel_one') as any;
    assert.strictEqual(decrypted2?.apiKey, 'TEST_API_KEY_UPDATED', 'Updated field must be saved');
    assert.strictEqual(decrypted2?.clientId, 'TEST_CLIENT_INITIAL', 'Pre-existing client ID must be preserved');
    assert.strictEqual(decrypted2?.pin, '1234', 'Pre-existing PIN must be preserved');
    assert.strictEqual(decrypted2?.totpSecret, 'JBSWY3DPEHPK3PXP', 'Pre-existing TOTP secret must be preserved');

    // Clean up
    connectionVault.disconnectConnection(testUserId, 'angel_one');
  });

  await t.test('5. Light Mode CSS Tokens Integrity', () => {
    const cssPath = path.resolve('src/index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');
    
    assert.ok(cssContent.includes('SYSTEMIC LIGHT MODE REPAIR'), 'index.css must include systemic light mode repair block');
    assert.ok(cssContent.includes('background-image: none !important;'), 'index.css must strip background-image on gradients in light mode');
    assert.ok(cssContent.includes('.recharts-default-tooltip'), 'index.css must style Recharts tooltips in light mode');
  });

  await t.test('6. Fail-Closed API Execution-Mode Route', () => {
    const serverPath = path.resolve('server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf-8');
    
    assert.ok(serverContent.includes("LIVE_TRADING_LOCKED"), 'server.ts must contain LIVE_TRADING_LOCKED error code');
    assert.ok(serverContent.includes("if (mode === 'LIVE')"), 'server.ts must guard against mode === LIVE');
  });

  await t.test('7. Paper Session Engine Stop Union Typing & Reset Isolation', async () => {
    // Verified production exit policies: 'MARKET_CLOSE' | 'LEAVE_OPEN'
    const res = await paperSessionEngine.stopSession('MARKET_CLOSE');
    assert.ok(res.success, 'stopSession with MARKET_CLOSE must succeed');
    
    paperSessionEngine.resetToNotStarted();
    const metrics = paperSessionEngine.getSessionMetrics();
    assert.strictEqual(metrics.status, 'NOT_STARTED', 'Engine must be reset to NOT_STARTED');
  });

  await t.test('8. Tax Calculator validateNetProfitGuardrail Numeric targetPrice Typing', () => {
    // Numeric targetPrice parameter must be accepted and calculated
    const hurdle = validateNetProfitGuardrail({
      entryPrice: 2500,
      targetPrice: 2575, // +3.0% target price as number
      qty: 10,
      action: 'BUY',
      segment: 'NSE Equity',
      hurdleNetRoiPct: 1.50
    });
    
    assert.strictEqual(hurdle.isApproved, true, 'Hurdle must approve profitable target spread');
    assert.strictEqual(hurdle.targetPrice, 2575, 'Target price must be preserved as number');
    assert.ok(hurdle.expectedNetRoiPct > 1.50, 'Projected Net ROI must exceed 1.50% hurdle');
  });

  await t.test('9. Database Persistence TradeRecord Required Timestamp Contract', () => {
    const tradeId = `test_trd_${Date.now()}`;
    const isoTimestamp = new Date().toISOString();
    
    runtimeDb.saveTrade({
      id: tradeId,
      orderId: `ord_${tradeId}`,
      symbol: 'RELIANCE',
      bot: 'Alpha Trend DMA',
      action: 'BUY',
      qty: 25,
      price: 2980.50,
      pnl: 0,
      charges: 45.20,
      status: 'FILLED',
      timestamp: isoTimestamp
    });

    const stored = runtimeDb.getRecentTrades(10).find((t) => t.id === tradeId);
    assert.ok(stored, 'Saved trade must be retrievable from database');
    assert.strictEqual(stored.symbol, 'RELIANCE');
    assert.strictEqual(stored.timestamp, isoTimestamp, 'Timestamp must match ISO-8601 string');
  });
});
