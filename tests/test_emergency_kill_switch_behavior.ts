import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const PORT = 3055;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const TEST_DB = path.resolve('scratch/test_db/test_kill_switch_behavior.db');

describe('CHINTU AI — EMERGENCY KILL SWITCH BEHAVIORAL & RMS INTERLOCK SUITE', () => {
  let serverProcess: ChildProcess;

  before(async () => {
    const dir = path.dirname(TEST_DB);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(TEST_DB)) {
      try { fs.unlinkSync(TEST_DB); } catch (e) {}
    }

    serverProcess = spawn('npx', ['tsx', 'server.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'test',
        CHINTU_DB_PATH: TEST_DB
      },
      shell: true,
      stdio: 'ignore'
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
    assert.equal(ready, true, `Server failed to start on port ${PORT}`);
  });

  after(() => {
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch (e) {}
    }
    if (fs.existsSync(TEST_DB)) {
      try { fs.unlinkSync(TEST_DB); } catch (e) {}
    }
    setTimeout(() => process.exit(0), 150);
  });

  it('should verify initial RMS status is armed and inactive', async () => {
    const res = await fetch(`${BASE_URL}/api/rms/status`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'success');
    assert.equal(data.config.emergency_stop_active, false);
    assert.equal(data.config.circuit_breaker_active, false);
  });

  it('should allow valid paper order placement that meets the 1.50% net ROI hurdle in normal armed state', async () => {
    const res = await fetch(`${BASE_URL}/api/order/place`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: 'NIFTY 50',
        action: 'BUY',
        qty: 50,
        price: 25000.0,
        targetPrice: 25600.0, // +2.4% gain (exceeds 1.50% hurdle)
        segment: 'NSE Equity',
        executionMode: 'PAPER'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'success');
    assert.ok(data.order);
    assert.equal(data.order.symbol, 'NIFTY 50');
  });

  it('should engage Emergency Stop and report accurate simulation-only liquidation message', async () => {
    const res = await fetch(`${BASE_URL}/api/emergency-stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'TEST_HARNESS',
        executionMode: 'PAPER'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'success');
    assert.equal(data.emergency_stop_active, true);
    assert.equal(data.circuit_breaker_active, true);
    // Must NOT falsely claim live broker orders were sent/squared off
    assert.match(data.message, /simulation engine/i);
    assert.match(data.message, /Live trading is disabled/i);
  });

  it('should verify /api/rms/status reports circuit breaker engaged', async () => {
    const res = await fetch(`${BASE_URL}/api/rms/status`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.config.emergency_stop_active, true);
    assert.equal(data.config.circuit_breaker_active, true);
  });

  it('should strictly reject new order placement with HTTP 403 while Emergency Stop is engaged', async () => {
    const res = await fetch(`${BASE_URL}/api/order/place`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: 'BANK NIFTY',
        action: 'BUY',
        qty: 30,
        price: 54000.0,
        targetPrice: 55500.0,
        segment: 'NSE Equity',
        executionMode: 'PAPER'
      })
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.status, 'error');
    assert.equal(data.code, 'RMS_CIRCUIT_BREAKER_ACTIVE');
    assert.match(data.message, /Kill Switch is engaged/);
  });

  it('should strictly reject starting new paper session while Emergency Stop is engaged', async () => {
    const res = await fetch(`${BASE_URL}/api/paper/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        capital: 100000
      })
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.status, 'error');
    assert.equal(data.code, 'RMS_CIRCUIT_BREAKER_ACTIVE');
  });

  it('should successfully reset circuit breaker and resume normal operations', async () => {
    const resetRes = await fetch(`${BASE_URL}/api/rms/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    assert.equal(resetRes.status, 200);
    const resetData = await resetRes.json();
    assert.equal(resetData.status, 'success');

    const statusRes = await fetch(`${BASE_URL}/api/rms/status`);
    const statusData = await statusRes.json();
    assert.equal(statusData.config.emergency_stop_active, false);
    assert.equal(statusData.config.circuit_breaker_active, false);

    // Order placement succeeds again
    const orderRes = await fetch(`${BASE_URL}/api/order/place`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: 'TCS',
        action: 'BUY',
        qty: 20,
        price: 3500.0,
        targetPrice: 3600.0,
        segment: 'NSE Equity',
        executionMode: 'PAPER'
      })
    });
    assert.equal(orderRes.status, 200);
    const orderData = await orderRes.json();
    assert.equal(orderData.status, 'success');
  });
});
