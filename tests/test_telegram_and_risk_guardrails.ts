import path from 'node:path';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import { userAuthService } from '../src/utils/userAuth';

const PORT = 3048;
const BASE_URL = `http://127.0.0.1:${PORT}`;

describe('CHINTU AI — TELEGRAM COMMANDS & RISK GUARDRAILS REGRESSION SUITE', () => {
  let serverProcess: ChildProcess;
  let testUserToken = '';

  before(async () => {
    testUserToken = userAuthService.issueSessionToken({
      id: 'usr_tg_risk_guard',
      email: 'tg_risk@chintu.ai',
      name: 'Telegram Risk Sentinel',
      role: 'trader'
    });

    serverProcess = spawn('npx', ['tsx', 'server.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'test',
        CHINTU_DB_PATH: path.resolve('scratch/test_db/test_telegram.db')
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
  });

  // ==========================================================================
  // 1. INCOMING COMMAND EXECUTION & FORMATTING
  // ==========================================================================
  describe('1. Telegram Command Directory & Output Formatting', () => {
    it('should return live diagnostics on /status', async () => {
      const res = await fetch(`${BASE_URL}/api/telegram/command`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command: '/status' })
      });
      const data: any = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.status, 'success');
      assert.ok(data.reply.includes('CHINTU AI QUANT STATUS'));
      assert.ok(data.reply.includes('9/14 Strict Required'));
    });

    it('should return open positions audit on /positions', async () => {
      const res = await fetch(`${BASE_URL}/api/telegram/command`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command: '/positions' })
      });
      const data: any = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.status, 'success');
      assert.ok(data.reply.includes('OPEN POSITIONS AUDIT'));
    });

    it('should return gross/net P&L with statutory tax breakdown on /pnl', async () => {
      const res = await fetch(`${BASE_URL}/api/telegram/command`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command: '/pnl' })
      });
      const data: any = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.status, 'success');
      assert.ok(data.reply.includes('DAILY P&L AUDIT'));
      assert.ok(data.reply.includes('Statutory Taxes'));
    });

    it('should list all available commands with clear syntax on /help', async () => {
      const res = await fetch(`${BASE_URL}/api/telegram/command`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command: '/help' })
      });
      const data: any = await res.json();
      assert.equal(res.status, 200);
      assert.ok(data.reply.includes('/status'));
      assert.ok(data.reply.includes('/positions'));
      assert.ok(data.reply.includes('/stop'));
      assert.ok(data.reply.includes('/resume'));
    });
  });

  // ==========================================================================
  // 2. DANGEROUS COMMAND RISK GATES & EMERGENCY KILL SWITCH
  // ==========================================================================
  describe('2. Dangerous Command Risk Gates & Emergency Kill Switch', () => {
    it('should engage emergency stop and pause all bot workers on /stop', async () => {
      const res = await fetch(`${BASE_URL}/api/telegram/command`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command: '/stop' })
      });
      const data: any = await res.json();
      assert.equal(res.status, 200);
      assert.ok(data.reply.includes('EMERGENCY STOP EXECUTED'));
      assert.ok(data.reply.includes('RMS Breaker*: ACTIVATED'));
    });

    it('should strictly reject /buy orders while RMS emergency stop is active', async () => {
      const res = await fetch(`${BASE_URL}/api/telegram/command`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command: '/buy NIFTY 50 50' })
      });
      const data: any = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.status, 'rejected');
      assert.ok(data.reply.includes('RMS CIRCUIT BREAKER ENGAGED'));
      assert.ok(data.reply.includes('Send /resume to clear breaker'));
    });

    it('should clear RMS circuit breaker and re-arm bot workers on /resume', async () => {
      const res = await fetch(`${BASE_URL}/api/telegram/command`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command: '/resume' })
      });
      const data: any = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.status, 'success');
      assert.ok(data.reply.includes('SYSTEM RESUMED VIA TELEGRAM'));
      assert.ok(data.reply.includes('RMS Breaker*: CLEARED'));
    });
  });
});
