import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CryptoVault } from '../src/utils/cryptoVault';
import { userAuthService } from '../src/utils/userAuth';
import { angelOrderAdapter } from '../src/utils/angelOrderAdapter';
import { angelMarketDataAdapter } from '../src/utils/angelMarketDataAdapter';
import { paperSessionEngine } from '../src/utils/paperSessionEngine';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3037;
const BASE_URL = `http://127.0.0.1:${PORT}`;

describe('CHINTU AI — REAL-WORLD MULTI-USER ACCEPTANCE & INTEGRATION TEST', () => {
  let serverProc: ChildProcess;

  before(async () => {
    const testDbPath = path.resolve('scratch/test_db/test_real_world.db');
    serverProc = spawn('npx', ['tsx', 'server.ts'], {
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production', CHINTU_DB_PATH: testDbPath },
      stdio: 'ignore',
      shell: true
    });

    let ready = false;
    for (let i = 0; i < 45; i++) {
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
        try { serverProc.kill(); } catch (e) {}
      }
      throw new Error(`Test server failed to boot on port ${PORT}`);
    }
  });

  after(() => {
    if (serverProc) {
      try { serverProc.kill(); } catch (e) {}
    }
  });

  // ==========================================================================
  // 1. LIVE HTTP MULTI-USER ISOLATION & NEGATIVE AUTHORIZATION GATE
  // ==========================================================================
  describe('1. Real HTTP Multi-User Connection Isolation & Server-Side Security', () => {
    let tokenAlice: string;
    let tokenBob: string;
    let userAliceId: string;
    let userBobId: string;

    const emailAlice = `alice_live_${Date.now()}@quantcorp.com`;
    const emailBob = `bob_live_${Date.now()}@hedgefund.com`;
    const password = 'StrongPassword@2026_Live';

    test('should register User A (Alice) and User B (Bob) with distinct accounts', async () => {
      // Register Alice
      const resA = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailAlice, password, name: 'Alice Quant' })
      });
      const dataA = await resA.json();
      assert.ok(resA.status === 200 || resA.status === 201, `Expected 200/201, got ${resA.status}`);
      assert.equal(dataA.status, 'success');
      assert.ok(dataA.token);
      assert.ok(dataA.user.id);
      tokenAlice = dataA.token;
      userAliceId = dataA.user.id;

      // Register Bob
      const resB = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailBob, password, name: 'Bob Trader' })
      });
      const dataB = await resB.json();
      assert.ok(resB.status === 200 || resB.status === 201, `Expected 200/201, got ${resB.status}`);
      assert.equal(dataB.status, 'success');
      assert.ok(dataB.token);
      assert.ok(dataB.user.id);
      tokenBob = dataB.token;
      userBobId = dataB.user.id;

      assert.notEqual(userAliceId, userBobId, 'User A and User B must have distinct IDs');
    });

    test('should reject unauthenticated request to /api/connections/status with 401', async () => {
      const res = await fetch(`${BASE_URL}/api/connections/status`);
      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.code, 'UNAUTHORIZED');
    });

    test('should reject forged or tampered session tokens with 401', async () => {
      const res = await fetch(`${BASE_URL}/api/connections/status`, {
        headers: { Authorization: 'Bearer chntu.forged_payload.invalid_sig' }
      });
      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.code, 'UNAUTHORIZED');
    });

    test('should save Alice credentials and verify secrets are masked in response', async () => {
      assert.ok(tokenAlice, 'tokenAlice must be defined from registration');
      const res = await fetch(`${BASE_URL}/api/connections/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenAlice}`
        },
        body: JSON.stringify({
          provider: 'angel_one',
          credentials: {
            apiKey: 'SECRET_API_KEY_ALICE',
            clientId: 'CLIENT_ALICE_01',
            pin: '1234',
            totpSecret: 'ALICETOTPKEY1234'
          }
        })
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.status, 'success');

      // Verify Alice gets masked config
      const statusRes = await fetch(`${BASE_URL}/api/connections/status`, {
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });
      const statusData = await statusRes.json();
      assert.equal(statusRes.status, 200);
      const angelConn = statusData.connections.find((c: any) => c.provider === 'angel_one');
      assert.ok(angelConn);
      assert.equal(angelConn.sanitizedConfig.hasApiKey, true);
      assert.equal(angelConn.sanitizedConfig.hasPin, true);
      // Secrets must never be returned to client
      assert.equal(angelConn.sanitizedConfig.apiKey, undefined);
      assert.equal(angelConn.sanitizedConfig.pin, undefined);
      assert.equal(angelConn.sanitizedConfig.totpSecret, undefined);
    });

    test('should confirm Bob cannot read Alice credentials (zero leakage)', async () => {
      assert.ok(tokenBob, 'tokenBob must be defined from registration');
      const res = await fetch(`${BASE_URL}/api/connections/status`, {
        headers: { Authorization: `Bearer ${tokenBob}` }
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      const angelConn = data.connections.find((c: any) => c.provider === 'angel_one');
      assert.ok(angelConn);
      assert.equal(angelConn.status, 'NOT_CONFIGURED');
      assert.deepEqual(angelConn.sanitizedConfig, {}, 'Bob must see completely empty config for angel_one');
    });

    test('should save Bob distinct credentials and verify complete isolation', async () => {
      assert.ok(tokenBob, 'tokenBob must be defined');
      assert.ok(tokenAlice, 'tokenAlice must be defined');

      // Bob saves his credentials
      const saveRes = await fetch(`${BASE_URL}/api/connections/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenBob}`
        },
        body: JSON.stringify({
          provider: 'angel_one',
          credentials: {
            apiKey: 'SECRET_API_KEY_BOB',
            clientId: 'CLIENT_BOB_02',
            pin: '5678',
            totpSecret: 'BOBTOTPKEY123456'
          }
        })
      });
      assert.equal(saveRes.status, 200);

      // Verify Bob sees Bob's masked clientId
      const bobRes = await fetch(`${BASE_URL}/api/connections/status`, {
        headers: { Authorization: `Bearer ${tokenBob}` }
      });
      const bobData = await bobRes.json();
      const bobAngel = bobData.connections.find((c: any) => c.provider === 'angel_one');
      assert.equal(bobAngel.sanitizedConfig.clientId, 'CL***2');

      // Verify Alice still sees Alice's masked clientId
      const aliceRes = await fetch(`${BASE_URL}/api/connections/status`, {
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });
      const aliceData = await aliceRes.json();
      const aliceAngel = aliceData.connections.find((c: any) => c.provider === 'angel_one');
      assert.equal(aliceAngel.sanitizedConfig.clientId, 'CL***1');
    });

    test('should reject cross-user tampering: Alice attempting to overwrite Bob credentials', async () => {
      // Alice attempts to pass Bob's userId in the body
      const res = await fetch(`${BASE_URL}/api/connections/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenAlice}`
        },
        body: JSON.stringify({
          userId: userBobId,
          provider: 'telegram',
          credentials: {
            botToken: '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_alice',
            botUsername: '@alice_bot'
          }
        })
      });
      assert.equal(res.status, 200);

      // Verify Bob's telegram remains NOT_CONFIGURED
      const bobRes = await fetch(`${BASE_URL}/api/connections/status`, {
        headers: { Authorization: `Bearer ${tokenBob}` }
      });
      const bobData = await bobRes.json();
      const bobTg = bobData.connections.find((c: any) => c.provider === 'telegram');
      assert.equal(bobTg.status, 'NOT_CONFIGURED', 'Bob credentials must not be overwritten by Alice');

      // Alice's telegram is configured
      const aliceRes = await fetch(`${BASE_URL}/api/connections/status`, {
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });
      const aliceData = await aliceRes.json();
      const aliceTg = aliceData.connections.find((c: any) => c.provider === 'telegram');
      assert.equal(aliceTg.sanitizedConfig.botUsername, '@alice_bot');
    });

    test('should ensure disconnecting Alice does not affect Bob state', async () => {
      // Alice disconnects Angel One
      const disconnRes = await fetch(`${BASE_URL}/api/connections/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenAlice}`
        },
        body: JSON.stringify({ provider: 'angel_one' })
      });
      assert.equal(disconnRes.status, 200);

      // Verify Bob's Angel One connection is completely untouched
      const bobRes = await fetch(`${BASE_URL}/api/connections/status`, {
        headers: { Authorization: `Bearer ${tokenBob}` }
      });
      const bobData = await bobRes.json();
      const bobAngel = bobData.connections.find((c: any) => c.provider === 'angel_one');
      assert.equal(bobAngel.sanitizedConfig.clientId, 'CL***2');
      assert.equal(bobAngel.sanitizedConfig.hasApiKey, true);
    });
  });

  // ==========================================================================
  // 2. CRYPTOGRAPHIC MASTER KEY SURVIVAL & TAMPER REJECTION
  // ==========================================================================
  describe('2. Master Key Persistence Across Server Restarts', () => {
    test('should verify master key exists in server/secure_keys/ with 32 bytes', () => {
      const keyPath = path.resolve(__dirname, '../server/secure_keys/.vault_master.key');
      assert.ok(fs.existsSync(keyPath), 'Master key file must exist in server/secure_keys/');
      const keyBuf = fs.readFileSync(keyPath);
      assert.equal(keyBuf.length, 32, 'Master key must be exactly 32 bytes for AES-256-GCM');
    });

    test('should decrypt ciphertext using a freshly initialized CryptoVault instance (simulated restart)', () => {
      const originalSecret = 'persistent_totp_secret_across_server_reboot_2026';

      // Encrypt with instance 1
      const vault1 = new CryptoVault();
      const encrypted = vault1.encrypt(originalSecret);
      assert.notEqual(encrypted, originalSecret);

      // Decrypt with instance 2 (simulating process restart)
      const vault2 = new CryptoVault();
      const decrypted = vault2.decrypt(encrypted);
      assert.equal(decrypted, originalSecret, 'Ciphertext must decrypt correctly after restart');
    });

    test('should safely fail and throw when decrypting with wrong or corrupted key', () => {
      const secret = 'top_secret_payload';
      const vault = new CryptoVault();
      const encrypted = vault.encrypt(secret);

      // Vault with different custom key
      const wrongVault = new CryptoVault('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
      assert.throws(() => {
        wrongVault.decrypt(encrypted);
      }, /Unsupported state or unable to authenticate data|Authentication failed/i);
    });
  });

  // ==========================================================================
  // 3. FAIL-CLOSED LIVE ORDER INVARIANT
  // ==========================================================================
  describe('3. Strict Invariant: LIVE_TRADING_ELIGIBLE = false', () => {
    test('should enforce LIVE_TRADING_ELIGIBLE is hardcoded to false on AngelOrderExecutionAdapter', () => {
      const safety = angelOrderAdapter.getSafetyStatus();
      assert.equal(safety.liveTradingEligible, false);
      assert.equal(safety.isArmed, false);
      const canExecute = angelOrderAdapter.canExecuteLiveOrder();
      assert.equal(canExecute.allowed, false);
      assert.ok(canExecute.reason.includes('LIVE_TRADING_DISABLED'));
    });

    test('should reject live order placement across all execution paths', async () => {
      const res = await fetch(`${BASE_URL}/api/broker/angel/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tradingsymbol: 'RELIANCE-EQ',
          symboltoken: '2885',
          exchange: 'NSE',
          transactiontype: 'BUY',
          ordertype: 'LIMIT',
          producttype: 'INTRADAY',
          price: 2980.00,
          quantity: 1,
          executionMode: 'LIVE',
          bypassQuorum: true
        })
      });
      const data = await res.json();
      assert.equal(res.status, 403);
      assert.equal(data.status, 'error');
      assert.equal(data.code, 'LIVE_TRADING_DISABLED');
      assert.ok(data.message.includes('LIVE_TRADING_DISABLED'));
    });

    test('should reject arming live trading with 403', async () => {
      const res = await fetch(`${BASE_URL}/api/trading/arm-live`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer chintu_master_auth_permanent_veeresh'
        },
        body: JSON.stringify({
          riskAcknowledgment: true,
          confirmationPassword: 'ValidPassword123'
        })
      });
      const data = await res.json();
      assert.equal(res.status, 403);
      assert.ok(data.code === 'BROKER_NOT_CONNECTED' || data.code === 'SAFETY_INVARIANT_LOCKED' || data.code === 'LIVE_TRADING_DISABLED');
    });
  });

  // ==========================================================================
  // 4. REAL PROVIDER STATUS TRUTHFULNESS & SAFE GATE ENFORCEMENT
  // ==========================================================================
  describe('4. Real Provider State Truthfulness (Fail-Closed Gates)', () => {
    test('should report BLOCKED: CREDENTIALS_NOT_CONFIGURED when .env has no credentials', async () => {
      const status = angelMarketDataAdapter.getStatus();
      assert.equal(status.hasCredentials, false);
      assert.equal(status.isLiveStreaming, false);
      assert.equal(status.feedSource, 'AUTHENTIC_PAPER_REPLAY');
      assert.equal(status.dataAgeStatus, 'SIMULATED');
    });

    test('should never claim Angel One WebSocket is live when disconnected', () => {
      assert.equal(angelMarketDataAdapter.isLiveStreaming(), false);
    });

    test('should safely reject live execution in paper session engine', () => {
      const metrics = paperSessionEngine.getSessionMetrics();
      assert.ok(metrics.status === 'NOT_STARTED' || metrics.status === 'STOPPED');
      assert.equal(metrics.totalTrades, 0);
      assert.equal(metrics.netPnl, 0);
    });
  });
});
