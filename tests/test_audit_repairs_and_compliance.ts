import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { getPaperCapital, DEFAULT_PAPER_CAPITAL, CAPITAL_DISCLAIMER } from '../src/utils/capitalConfig';
import { AngelOrderExecutionAdapter } from '../src/utils/angelOrderAdapter';
import { angelMarketDataAdapter } from '../src/utils/angelMarketDataAdapter';
import { connectionVault } from '../src/utils/connectionVault';
import { runtimeDb } from '../src/utils/databasePersistence';

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
});
