import path from 'node:path';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'child_process';

const PORT = 3036;
const BASE_URL = `http://127.0.0.1:${PORT}`;

describe('CHINTU AI — POST-VALIDATION SECURITY & ORDER GATE AUDIT', () => {
  let serverProc: ChildProcess;

  before(async () => {
    const testDbPath = path.resolve('scratch/test_db/test_sec_audit.db');
    serverProc = spawn('npx', ['tsx', 'server.ts'], {
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production', CHINTU_DB_PATH: testDbPath },
      stdio: 'ignore',
      shell: true
    });

    let ready = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        const res = await fetch(`${BASE_URL}/api/diagnostics`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch (e) {}
    }

    if (!ready) {
      if (serverProc) {
        serverProc.kill();
      }
      throw new Error(`Test server failed to boot on port ${PORT}`);
    }
  });

  after(() => {
    if (serverProc) {
      try { serverProc.kill(); } catch (e) {}
    }
    setTimeout(() => process.exit(0), 150);
  });

  // --------------------------------------------------------------------------
  // 1. Target Price Security & Failing Closed on Invalid / Unprofitable Inputs
  // --------------------------------------------------------------------------
  describe('1. Target Price Audit & Fail-Closed Enforcement', () => {
    test('should approve valid order with missing targetPrice using default strategy target (+2.5%)', async () => {
      const res = await fetch(`${BASE_URL}/api/order/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: `sec_test_missing_target_${Date.now()}`,
          symbol: 'NIFTY 50 25850 CE',
          action: 'BUY',
          qty: 50,
          price: 145.00,
          bot: 'Gamma Squeeze Scalper'
        })
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.status, 'success');
      assert.equal(data.net_profit_guaranteed, true);
    });

    test('should approve valid order with null targetPrice using default strategy target', async () => {
      const res = await fetch(`${BASE_URL}/api/order/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: `sec_test_null_target_${Date.now()}`,
          symbol: 'NIFTY 50 25850 CE',
          action: 'BUY',
          qty: 50,
          price: 145.00,
          targetPrice: null,
          bot: 'Gamma Squeeze Scalper'
        })
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.status, 'success');
    });

    test('should strictly reject zero target price (targetPrice: 0) with HTTP 400', async () => {
      const res = await fetch(`${BASE_URL}/api/order/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: `sec_test_zero_target_${Date.now()}`,
          symbol: 'NIFTY 50 25850 CE',
          action: 'BUY',
          qty: 50,
          price: 145.00,
          targetPrice: 0,
          bot: 'Gamma Squeeze Scalper'
        })
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.code, 'INVALID_TARGET_PRICE_REJECTION');
    });

    test('should strictly reject negative target price (targetPrice: -50) with HTTP 400', async () => {
      const res = await fetch(`${BASE_URL}/api/order/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: `sec_test_neg_target_${Date.now()}`,
          symbol: 'NIFTY 50 25850 CE',
          action: 'BUY',
          qty: 50,
          price: 145.00,
          targetPrice: -50.00,
          bot: 'Gamma Squeeze Scalper'
        })
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.code, 'INVALID_TARGET_PRICE_REJECTION');
    });

    test('should strictly reject malformed string target price (targetPrice: "abc") with HTTP 400', async () => {
      const res = await fetch(`${BASE_URL}/api/order/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: `sec_test_malformed_target_${Date.now()}`,
          symbol: 'NIFTY 50 25850 CE',
          action: 'BUY',
          qty: 50,
          price: 145.00,
          targetPrice: 'malformed_price',
          bot: 'Gamma Squeeze Scalper'
        })
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.code, 'INVALID_TARGET_PRICE_REJECTION');
    });

    test('should strictly reject BUY target price at or below entry price (directional inversion)', async () => {
      const res = await fetch(`${BASE_URL}/api/order/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: `sec_test_inversion_buy_${Date.now()}`,
          symbol: 'NIFTY 50 25850 CE',
          action: 'BUY',
          qty: 50,
          price: 145.00,
          targetPrice: 140.00, // Below entry price on a BUY order!
          bot: 'Gamma Squeeze Scalper'
        })
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.code, 'NET_PROFIT_GUARDRAIL_VIOLATION');
      assert.match(data.message, /at or below entry price/i);
    });

    test('should strictly reject SELL target price at or above entry price (directional inversion)', async () => {
      const res = await fetch(`${BASE_URL}/api/order/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: `sec_test_inversion_sell_${Date.now()}`,
          symbol: 'NIFTY 50 25850 CE',
          action: 'SELL',
          qty: 50,
          price: 145.00,
          targetPrice: 150.00, // Above entry price on a SELL (short) order!
          bot: 'Gamma Squeeze Scalper'
        })
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.code, 'NET_PROFIT_GUARDRAIL_VIOLATION');
      assert.match(data.message, /at or above entry price/i);
    });

    test('should strictly reject tight scalp failing 1.50% net ROI hurdle (+0.14% gain)', async () => {
      const res = await fetch(`${BASE_URL}/api/order/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: `sec_test_tight_scalp_${Date.now()}`,
          symbol: 'NIFTY 50 25850 CE',
          action: 'BUY',
          qty: 50,
          price: 145.00,
          targetPrice: 145.20, // +0.14% gain fails statutory fee buffer & 1.5% hurdle
          bot: 'Ultra Scalper'
        })
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.code, 'NET_PROFIT_GUARDRAIL_VIOLATION');
      assert.match(data.message, /fails to cover roundtrip|institutional hurdle/i);
    });

    test('should approve valid target price exceeding 1.50% net ROI (+3.0% gain)', async () => {
      const res = await fetch(`${BASE_URL}/api/order/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: `sec_test_valid_target_${Date.now()}`,
          symbol: 'NIFTY 50 25850 CE',
          action: 'BUY',
          qty: 50,
          price: 145.00,
          targetPrice: 149.35, // +3.0% gain
          bot: 'Gamma Squeeze Scalper'
        })
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.status, 'success');
      assert.ok(data.order.projectedNetRoi >= 1.50);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Removal of Unsafe Manual Bypasses
  // --------------------------------------------------------------------------
  describe('2. Unsafe Bypass Removal Verification', () => {
    test('should reject unprofitable order even if client attempts bypassNetProfitGuard: true', async () => {
      const res = await fetch(`${BASE_URL}/api/order/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: `sec_test_bypass_attempt_${Date.now()}`,
          symbol: 'NIFTY 50 25850 CE',
          action: 'BUY',
          qty: 50,
          price: 145.00,
          targetPrice: 145.10, // unviable
          bypassNetProfitGuard: true // Rogue attempt to bypass net profit guard
        })
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.code, 'NET_PROFIT_GUARDRAIL_VIOLATION');
    });

    test('should reject order if provider is degraded even if client attempts bypassStaleCheck: true', async () => {
      // 1. Switch to LIVE_MARKET_DATA_PAPER (which is DEGRADED because credentials are unconfigured)
      await fetch(`${BASE_URL}/api/providers/switch-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'LIVE_MARKET_DATA_PAPER' })
      });

      // 2. Attempt order with bypassStaleCheck
      const res = await fetch(`${BASE_URL}/api/order/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: `sec_test_bypass_stale_${Date.now()}`,
          symbol: 'NIFTY 50 25850 CE',
          action: 'BUY',
          qty: 50,
          price: 145.00,
          bypassStaleCheck: true
        })
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.code, 'PROVIDER_DATA_UNAVAILABLE');

      // 3. Switch back to SIMULATED_REPLAY for subsequent safe tests
      await fetch(`${BASE_URL}/api/providers/switch-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'SIMULATED_REPLAY' })
      });
    });
  });

  // --------------------------------------------------------------------------
  // 3. Duplicate Order Idempotency Guard
  // --------------------------------------------------------------------------
  describe('3. Duplicate Order Rejection Guard', () => {
    test('should reject duplicate order submission with HTTP 409 Conflict', async () => {
      const orderId = `idempotency_audit_${Date.now()}`;
      const firstRes = await fetch(`${BASE_URL}/api/order/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          symbol: 'NIFTY 50 25850 CE',
          action: 'BUY',
          qty: 50,
          price: 145.00,
          bot: 'Gamma Squeeze Scalper'
        })
      });
      assert.equal(firstRes.status, 200);

      // Attempt duplicate submission
      const dupRes = await fetch(`${BASE_URL}/api/order/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          symbol: 'NIFTY 50 25850 CE',
          action: 'BUY',
          qty: 50,
          price: 145.00,
          bot: 'Gamma Squeeze Scalper'
        })
      });
      const dupData = await dupRes.json();
      assert.equal(dupRes.status, 409);
      assert.equal(dupData.code, 'DUPLICATE_ORDER_REJECTED');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Source of Data Labels & Fail-Closed Provider Gate
  // --------------------------------------------------------------------------
  describe('4. Source of Data & Fail-Closed Verification', () => {
    test('should accurately report SIMULATED_REPLAY and never label simulated data as live', async () => {
      const res = await fetch(`${BASE_URL}/api/providers/status`);
      const data = await res.json();
      assert.equal(data.status, 'success');
      assert.equal(data.activeMode, 'SIMULATED_REPLAY');
      assert.equal(data.marketData.isLiveConnected, false);
      assert.equal(data.marketData.feedSource, 'SIMULATED_REPLAY');
    });

    test('should accurately report DEGRADED in LIVE_MARKET_DATA_PAPER when credentials are unconfigured', async () => {
      await fetch(`${BASE_URL}/api/providers/switch-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'LIVE_MARKET_DATA_PAPER' })
      });
      const res = await fetch(`${BASE_URL}/api/providers/status`);
      const data = await res.json();
      assert.equal(data.activeMode, 'LIVE_MARKET_DATA_PAPER');
      assert.equal(data.marketData.status, 'DEGRADED');
      assert.equal(data.marketData.isLiveConnected, false);
      assert.equal(data.marketData.feedSource, 'AUTHENTIC_PAPER_REPLAY');
      assert.match(data.marketData.reason, /Angel One credentials unconfigured|Missing Angel One/i);

      // Revert back to SIMULATED_REPLAY
      await fetch(`${BASE_URL}/api/providers/switch-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'SIMULATED_REPLAY' })
      });
    });
  });
});

