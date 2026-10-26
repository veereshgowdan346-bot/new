import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { runtimeDb } from '../src/utils/databasePersistence';

const TEST_PORT = 3042;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const TEST_DB = path.join(process.cwd(), 'scratch', 'test_db', 'test_concurrency.db');

describe('CHINTU AI — MULTI-USER PERFORMANCE, CONCURRENCY & LATENCY SUITE', () => {
  let serverProcess: ChildProcess;
  const userSpecs = [
    { name: 'Alice Quant', email: `alice_load_${Date.now()}@chintu.ai`, token: '', id: '' },
    { name: 'Bob HFT', email: `bob_load_${Date.now()}@chintu.ai`, token: '', id: '' },
    { name: 'Charlie Options', email: `charlie_load_${Date.now()}@chintu.ai`, token: '', id: '' },
    { name: 'Diana Macro', email: `diana_load_${Date.now()}@chintu.ai`, token: '', id: '' },
    { name: 'Eve Scalper', email: `eve_load_${Date.now()}@chintu.ai`, token: '', id: '' },
    { name: 'Frank Arbitrage', email: `frank_load_${Date.now()}@chintu.ai`, token: '', id: '' }
  ];

  before(async () => {
    const dir = path.dirname(TEST_DB);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(TEST_DB)) {
      try { fs.unlinkSync(TEST_DB); } catch (e) {}
    }
    runtimeDb.init(TEST_DB);

    // Spawn server process on TEST_PORT
    serverProcess = spawn('npx', ['tsx', 'server.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        NODE_ENV: 'test',
        CHINTU_DB_PATH: TEST_DB
      },
      shell: true,
      stdio: 'ignore'
    });

    // Wait for server to be ready via /api/diagnostics
    const maxRetries = 40;
    let ready = false;
    for (let i = 0; i < maxRetries; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        const res = await fetch(`${BASE_URL}/api/diagnostics`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch (e) {}
    }
    assert.equal(ready, true, `Server failed to start on port ${TEST_PORT}`);

    // Register 6 concurrent users and save Telegram connection for each
    for (const u of userSpecs) {
      const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: u.email,
          password: 'Password@2026_LoadTest',
          name: u.name
        })
      });
      const regData: any = await regRes.json();
      assert.equal(regData.status, 'success', `Registration failed for ${u.name}`);
      u.token = regData.token;
      u.id = regData.user.id;

      // Save user-isolated Telegram connection
      const saveRes = await fetch(`${BASE_URL}/api/connections/save`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${u.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'telegram',
          credentials: {
            bot_token: `8856634279:AAEJmjMI_${u.id}_secret`,
            chat_id: `chat_${u.id}_999`,
            bot_username: `${u.id.slice(0, 10)}_bot`
          }
        })
      });
      const saveData: any = await saveRes.json();
      assert.equal(saveData.status, 'success', `Connection save failed for ${u.name}`);
    }
  });

  after(() => {
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch (e) {}
    }
    runtimeDb.close();
    if (fs.existsSync(TEST_DB)) {
      try { fs.unlinkSync(TEST_DB); } catch (e) {}
    }
  });

  // ==========================================================================
  // 1. CONCURRENT AUTHENTICATED USER BURST (6 SIMULTANEOUS USERS)
  // ==========================================================================
  describe('1. 6 Concurrent Users Simultaneous Read/Write Burst', () => {
    it('should handle simultaneous requests across 6 users without locking or contention', async () => {
      const endpoints = [
        '/api/connections/status',
        '/api/positions',
        '/api/pnl',
        '/api/diagnostics'
      ];

      // Fire 6 users * 4 endpoints = 24 simultaneous HTTP requests
      const startAll = performance.now();
      const promises = userSpecs.flatMap((u) =>
        endpoints.map(async (ep) => {
          const t0 = performance.now();
          const res = await fetch(`${BASE_URL}${ep}`, {
            headers: {
              Authorization: `Bearer ${u.token}`
            }
          });
          const t1 = performance.now();
          const data: any = await res.json();
          return {
            user: u.id,
            endpoint: ep,
            status: res.status,
            latencyMs: t1 - t0,
            data
          };
        })
      );

      const results = await Promise.all(promises);
      const totalElapsed = performance.now() - startAll;

      // Assert all 24 requests returned 200 OK
      for (const r of results) {
        assert.equal(r.status, 200, `Endpoint ${r.endpoint} for ${r.user} returned ${r.status}`);
      }

      // Assert response times are within production thresholds
      const maxLatency = Math.max(...results.map((r) => r.latencyMs));
      const avgLatency = results.reduce((acc, r) => acc + r.latencyMs, 0) / results.length;

      console.log(`[CONCURRENCY METRICS] 24 concurrent requests completed in ${totalElapsed.toFixed(2)}ms (Avg: ${avgLatency.toFixed(2)}ms, Max: ${maxLatency.toFixed(2)}ms)`);
      assert.ok(avgLatency < 350, `Average latency (${avgLatency.toFixed(2)}ms) must be < 350ms under concurrent burst`);
      assert.ok(maxLatency < 750, `Max latency (${maxLatency.toFixed(2)}ms) must be < 750ms for computed data`);
    });

    it('should maintain strict user credential isolation under concurrent access', async () => {
      // All 6 users query their connection status at the exact same instant
      const requests = userSpecs.map(async (u) => {
        const res = await fetch(`${BASE_URL}/api/connections/status`, {
          headers: {
            Authorization: `Bearer ${u.token}`
          }
        });
        const data: any = await res.json();
        return { user: u, data };
      });

      const responses = await Promise.all(requests);

      for (const resp of responses) {
        assert.equal(resp.data.status, 'success');
        const tgConn = resp.data.connections.find((c: any) => c.provider === 'telegram');
        assert.ok(tgConn, `Telegram connection missing for user ${resp.user.id}`);
        assert.ok(
          tgConn.sanitizedConfig.bot_username?.includes(resp.user.id.slice(0, 10)) ||
          tgConn.sanitizedConfig.botUsername?.includes(resp.user.id.slice(0, 10)),
          `User ${resp.user.id} saw leaked connection data`
        );
        // Secrets must be masked or absent
        assert.equal(tgConn.sanitizedConfig.bot_token.includes('***'), true);
      }
    });
  });

  // ==========================================================================
  // 2. CONCURRENT DATABASE WRITES & SQLITE TRANSACTION INTEGRITY
  // ==========================================================================
  describe('2. Concurrent Database Writes & SQLite WAL Mode Invariant', () => {
    it('should execute concurrent Telegram commands without SQLite database lock errors', async () => {
      const commands = [
        { cmd: '/status', expectedInReply: 'CHINTU AI QUANT STATUS' },
        { cmd: '/pnl', expectedInReply: 'DAILY P&L AUDIT' },
        { cmd: '/quorum', expectedInReply: 'QUORUM' },
        { cmd: '/positions', expectedInReply: 'OPEN POSITIONS AUDIT' },
        { cmd: '/heal', expectedInReply: 'SELF-HEALING SENTINEL' },
        { cmd: '/scan', expectedInReply: 'MULTI-ASSET PRE-MARKET MACRO SCAN' }
      ];

      const commandPromises = userSpecs.map(async (u, idx) => {
        const testCmd = commands[idx % commands.length];
        const t0 = performance.now();
        const res = await fetch(`${BASE_URL}/api/telegram/command`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${u.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ command: testCmd.cmd })
        });
        const t1 = performance.now();
        const data: any = await res.json();
        return {
          user: u.id,
          command: testCmd.cmd,
          status: res.status,
          latencyMs: t1 - t0,
          reply: data.reply
        };
      });

      const cmdResults = await Promise.all(commandPromises);

      for (const r of cmdResults) {
        assert.equal(r.status, 200, `Command ${r.command} failed with status ${r.status}`);
        assert.ok(r.reply, `Empty reply for command ${r.command}`);
        assert.ok(r.latencyMs < 200, `Command latency ${r.latencyMs.toFixed(2)}ms should be < 200ms`);
      }
    });

    it('should verify WAL mode is active on runtime SQLite database', () => {
      const db = runtimeDb.getDb();
      assert.ok(db, 'Database not initialized');
      const stmt = db.prepare('PRAGMA journal_mode;');
      const row: any = stmt.get();
      assert.ok(row, 'Failed to query PRAGMA journal_mode');
      const mode = Object.values(row)[0];
      assert.equal(String(mode).toLowerCase(), 'wal', `SQLite journal_mode must be WAL, but got ${mode}`);
    });
  });

  // ==========================================================================
  // 3. TELEGRAM SEND-TEST WORKFLOW UNDER CONCURRENCY
  // ==========================================================================
  describe('3. Telegram Send-Test Endpoint Validation', () => {
    it('should process concurrent POST /api/telegram/send-test safely', async () => {
      const testPromises = userSpecs.slice(0, 3).map(async (u) => {
        const res = await fetch(`${BASE_URL}/api/telegram/send-test`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${u.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `Concurrent load test alert for ${u.id}`
          })
        });
        const data: any = await res.json();
        return { user: u.id, status: res.status, data };
      });

      const sendResults = await Promise.all(testPromises);
      for (const sr of sendResults) {
        assert.equal(sr.status, 200);
        assert.equal(sr.data.status, 'success');
        assert.equal(sr.data.ok, true);
        assert.ok(sr.data.messageId !== undefined);
      }
    });
  });
});
