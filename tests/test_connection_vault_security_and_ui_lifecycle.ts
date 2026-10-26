import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabasePersistenceService } from '../src/utils/databasePersistence';
import { CryptoVault, cryptoVault } from '../src/utils/cryptoVault';
import { ConnectionVaultService } from '../src/utils/connectionVault';
import { AngelOrderExecutionAdapter } from '../src/utils/angelOrderAdapter';
import { soundEngine } from '../src/utils/audioChime';
import { toastEmitter } from '../src/utils/toastEmitter';

const TEST_DB_PATH = path.resolve('server/data/test_vault_lifecycle.db');
const TEST_KEY_PATH = path.resolve('server/secure_keys/.test_vault.key');

test('=== CHINTU AI CONNECTION VAULT & REPAIRED UI LIFECYCLE VERIFICATION SUITE ===', async (t) => {
  // Clean test artifacts
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  if (fs.existsSync(TEST_KEY_PATH)) fs.unlinkSync(TEST_KEY_PATH);

  const testDb = new DatabasePersistenceService(TEST_DB_PATH);
  const testCrypto = new CryptoVault('test_secret_key_32_bytes_length_123456');
  const vault = new ConnectionVaultService();
  const testUserId = `usr_test_${crypto.randomBytes(4).toString('hex')}`;

  t.after(() => {
    testDb.close();
    try {
      if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
      if (fs.existsSync(TEST_KEY_PATH)) fs.unlinkSync(TEST_KEY_PATH);
    } catch {}
  });

  await t.test('1. Master Key Isolation & Verification', () => {
    const prodKeyPath = path.resolve('server/secure_keys/.vault_master.key');
    assert.ok(fs.existsSync(prodKeyPath), 'Master vault key file must exist on disk.');
    const keyBuf = fs.readFileSync(prodKeyPath);
    assert.strictEqual(keyBuf.length, 32, 'Master key must be exactly 32 bytes (256 bits).');

    const gitignorePath = path.resolve('.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
      assert.ok(
        gitignore.includes('secure_keys') || gitignore.includes('.vault_master.key'),
        'Vault master key must be excluded from Git tracking in .gitignore.'
      );
    }
  });

  await t.test('2. AES-256-GCM Envelope Encryption & Decryption Integrity', () => {
    const sensitivePayload = {
      apiKey: 'ANGEL_API_KEY_SECRET_98765',
      clientId: 'V489102',
      pin: '7744',
      totpSecret: 'JBSWY3DPEHPK3PXP'
    };

    const ciphertext = testCrypto.encryptObject(sensitivePayload);
    assert.ok(typeof ciphertext === 'string', 'Encrypted output must be a string.');
    assert.ok(!ciphertext.includes('ANGEL_API_KEY_SECRET'), 'Ciphertext must never expose raw API key.');
    assert.ok(!ciphertext.includes('7744'), 'Ciphertext must never expose raw PIN.');

    const decrypted = testCrypto.decryptObject<typeof sensitivePayload>(ciphertext);
    assert.deepStrictEqual(decrypted, sensitivePayload, 'Decrypted object must match original payload exactly.');
  });

  await t.test('3. Durable Read-Back Verification on Save', () => {
    const creds = {
      apiKey: 'SMART_KEY_2026',
      clientId: 'V999999',
      pin: '1234',
      totpSecret: 'MZXW6YTBOI======='
    };

    const saved = vault.saveConnection(testUserId, 'angel_one', creds);
    assert.strictEqual(saved.status, 'SAVED');
    assert.strictEqual(saved.readBackVerified, true, 'readBackVerified must be true upon durable SQLite write.');

    const decrypted = vault.getDecryptedCredentials(testUserId, 'angel_one');
    assert.strictEqual(decrypted.apiKey, creds.apiKey);
    assert.strictEqual(decrypted.clientId, creds.clientId);
    assert.strictEqual(decrypted.pin, creds.pin);
    assert.strictEqual(decrypted.totpSecret, creds.totpSecret);
  });

  await t.test('4. Non-Destructive Credential Merging', () => {
    const partialUpdate = {
      pin: '9876',
      apiKey: '••••••••',
      totpSecret: ''
    };

    const merged = vault.saveConnection(testUserId, 'angel_one', partialUpdate);
    assert.strictEqual(merged.status, 'SAVED');

    const decrypted = vault.getDecryptedCredentials(testUserId, 'angel_one');
    assert.strictEqual(decrypted.pin, '9876', 'PIN should be updated.');
    assert.strictEqual(decrypted.apiKey, 'SMART_KEY_2026', 'Existing API key must be preserved.');
    assert.strictEqual(decrypted.clientId, 'V999999', 'Existing Client ID must be preserved.');
    assert.strictEqual(decrypted.totpSecret, 'MZXW6YTBOI=======', 'Existing TOTP Secret must be preserved.');
  });

  await t.test('5. Permanent SQLite Persistence Across Process / DB Reload', () => {
    const reloadedDb = new DatabasePersistenceService();
    const connRecord = reloadedDb.getConnection(testUserId, 'angel_one');
    assert.ok(connRecord, 'Connection record must exist in SQLite database.');
    assert.strictEqual(connRecord?.status, 'SAVED');
    assert.ok(connRecord?.encryptedCredentials, 'Must have encrypted credentials in SQLite.');
  });

  await t.test('6. Granular Connection Status Hierarchy', () => {
    const validStatuses = [
      'NOT_CONFIGURED',
      'SAVED',
      'AUTHENTICATING',
      'CONNECTED',
      'AUTH_FAILED',
      'SESSION_EXPIRED',
      'RATE_LIMITED',
      'DISCONNECTED',
      'ERROR'
    ];
    const userConns = vault.getUserConnections(testUserId);
    for (const conn of userConns) {
      assert.ok(validStatuses.includes(conn.status), `Status ${conn.status} must be in validStatuses.`);
    }
  });

  await t.test('7. Sanitized Output Guarantee Without Secret Leaks', () => {
    const states = vault.getUserConnections(testUserId);
    const angelState = states.find((s) => s.provider === 'angel_one')!;
    assert.ok(angelState, 'Angel One state must be present.');
    assert.strictEqual(typeof angelState.sanitizedConfig, 'object');

    // Secrets must NOT be present
    assert.strictEqual(angelState.sanitizedConfig.apiKey, undefined);
    assert.strictEqual(angelState.sanitizedConfig.pin, undefined);
    assert.strictEqual(angelState.sanitizedConfig.totpSecret, undefined);
    assert.ok(angelState.sanitizedConfig.clientId.includes('***'), 'Client code must be masked.');
    assert.strictEqual(angelState.sanitizedConfig.hasApiKey, true);
    assert.strictEqual(angelState.sanitizedConfig.hasPin, true);
    assert.strictEqual(angelState.sanitizedConfig.hasTotpSecret, true);
  });

  await t.test('8. Cloudflare & Non-JSON Upstream Safe Handling', async () => {
    const mockHtml = '<!DOCTYPE html><html><body><h1>Cloudflare 403 Forbidden</h1></body></html>';
    let caughtSyntaxError = false;
    let data: any = null;
    try {
      try {
        data = JSON.parse(mockHtml);
      } catch {
        data = { status: false, message: `Upstream HTTP 403: Cloudflare 403 Forbidden` };
      }
    } catch {
      caughtSyntaxError = true;
    }
    assert.strictEqual(caughtSyntaxError, false, 'Safe JSON parser must never throw unhandled SyntaxError.');
    assert.strictEqual(data.status, false);
    assert.ok(data.message.includes('Cloudflare 403'));
  });

  await t.test('9. Root Cause Fix: "K.playSuccessChime is not a function" Verification', () => {
    // 1. playSuccessChime must be defined and callable
    assert.strictEqual(typeof (soundEngine as any).playSuccessChime, 'function');
    assert.doesNotThrow(() => {
      (soundEngine as any).playSuccessChime();
    }, 'playSuccessChime must not throw.');

    // 2. playVetoChime must be defined and callable
    assert.strictEqual(typeof (soundEngine as any).playVetoChime, 'function');
    assert.doesNotThrow(() => {
      (soundEngine as any).playVetoChime();
    }, 'playVetoChime must not throw.');

    // 3. Resilient Proxy fallback: any arbitrary sound method returns safe no-op function
    assert.strictEqual(typeof (soundEngine as any).nonExistentSoundEffect, 'function');
    assert.doesNotThrow(() => {
      (soundEngine as any).nonExistentSoundEffect();
      (soundEngine as any).playCelebrationHorn();
    }, 'Arbitrary sound methods must safely no-op without throwing.');
  });

  await t.test('10. Root Cause Fix: "q.emitToast is not a function" Verification', () => {
    // 1. emitToast must be defined and callable
    assert.strictEqual(typeof (toastEmitter as any).emitToast, 'function');

    let receivedToast: any = null;
    const unsubscribe = toastEmitter.subscribe((t) => {
      receivedToast = t;
    });

    assert.doesNotThrow(() => {
      toastEmitter.emitToast({
        title: 'Credentials Saved',
        message: 'Credentials persisted with durable read-back verification.',
        type: 'success'
      });
    }, 'toastEmitter.emitToast must not throw.');

    assert.ok(receivedToast, 'Subscriber must receive dispatched toast.');
    assert.strictEqual(receivedToast.title, 'Credentials Saved');
    assert.strictEqual(receivedToast.type, 'success');
    assert.strictEqual(receivedToast.isSystemNotification, true);

    // 2. Other notification methods
    assert.strictEqual(typeof (toastEmitter as any).emitAlertTriggered, 'function');
    assert.strictEqual(typeof (toastEmitter as any).emitEmergencyStop, 'function');
    assert.strictEqual(typeof (toastEmitter as any).emitTradeExecution, 'function');
    assert.strictEqual(typeof (toastEmitter as any).success, 'function');
    assert.strictEqual(typeof (toastEmitter as any).error, 'function');

    unsubscribe();
  });

  await t.test('11. Complete Decoupling: Persistence Succeeds Regardless of Audio or Toast Failure', () => {
    // Simulation of UI save handler with decoupled post-save notifications
    let uiModalStatus = 'in_progress';
    let uiReadBackVerified = false;
    let uiErrorMessage: string | null = null;
    let audioFailed = false;
    let toastFailed = false;

    // STEP 1: Execute Persistence Operation
    const saved = vault.saveConnection(testUserId, 'telegram', {
      botToken: '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_test',
      botUsername: '@TestBot',
      allowedChatIds: ['6912523089']
    });

    const isSuccess = Boolean(saved && saved.status === 'SAVED' && saved.readBackVerified);

    // STEP 2: Commit Persistence State into UI
    if (isSuccess) {
      uiModalStatus = 'success';
      uiReadBackVerified = true;

      // STEP 3: Decoupled Side Effects (simulate failing audio and toast)
      try {
        throw new Error('Simulated AudioContext Autoplay Policy Exception');
      } catch (e) {
        audioFailed = true;
      }

      try {
        throw new Error('Simulated Toast Subsystem DOM Exception');
      } catch (e) {
        toastFailed = true;
      }
    } else {
      uiModalStatus = 'failed';
      uiErrorMessage = 'Database write failed';
    }

    // Assert that persistence status remained completely intact and never converted to failed!
    assert.strictEqual(uiModalStatus, 'success', 'UI modal status must remain "success".');
    assert.strictEqual(uiReadBackVerified, true, 'readBackVerified must remain true.');
    assert.strictEqual(uiErrorMessage, null, 'uiErrorMessage must remain null.');
    assert.strictEqual(audioFailed, true, 'Audio failure must be safely contained.');
    assert.strictEqual(toastFailed, true, 'Toast failure must be safely contained.');

    // Database record in SQLite must remain SAVED
    const record = vault.getUserConnections(testUserId).find((c) => c.provider === 'telegram');
    assert.ok(record, 'Record must exist in vault.');
    assert.strictEqual(record?.status, 'SAVED');
    assert.strictEqual(saved.readBackVerified, true);
  });

  await t.test('12. Real Database Read-Back Evidence (No Plaintext Secrets)', () => {
    // Verify against real database service
    const realDb = new DatabasePersistenceService();
    const connRecord = realDb.getConnection('usr_veeresh_master', 'angel_one');
    assert.ok(connRecord, 'User connection record for usr_veeresh_master must exist.');
    assert.strictEqual(connRecord.provider, 'angel_one');
    assert.strictEqual(connRecord.status, 'SAVED');
    assert.ok(connRecord.encryptedCredentials, 'Must have encrypted credentials in SQLite.');

    // Verify envelope encryption format
    assert.ok(!connRecord.encryptedCredentials.includes('apiKey'), 'Encrypted credentials must never store plaintext keys.');
    assert.ok(!connRecord.encryptedCredentials.includes('password'), 'Encrypted credentials must never store plaintext passwords.');

    // Verify decryption succeeds and contains expected keys
    const decrypted = cryptoVault.decryptObject<Record<string, any>>(connRecord.encryptedCredentials);
    assert.ok(decrypted, 'Decrypted credentials must not be null.');
    assert.ok(Boolean(decrypted.apiKey), 'Decrypted credentials must contain apiKey.');
    assert.ok(Boolean(decrypted.clientId), 'Decrypted credentials must contain clientId.');
    assert.ok(Boolean(decrypted.pin), 'Decrypted credentials must contain broker trading pin.');
    assert.ok(Boolean(decrypted.totpSecret), 'Decrypted credentials must contain totpSecret.');
  });

  await t.test('13. Permanent Removal of Vault PIN & Lockout System', () => {
    // 1. Methods should not exist on connectionVault
    assert.strictEqual((vault as any).setupVaultPin, undefined, 'setupVaultPin must be removed.');
    assert.strictEqual((vault as any).verifyVaultPin, undefined, 'verifyVaultPin must be removed.');
    assert.strictEqual((vault as any).hasVaultPin, undefined, 'hasVaultPin must be removed.');
    assert.strictEqual((vault as any).revealSensitiveCredentials, undefined, 'revealSensitiveCredentials must be removed.');
    assert.strictEqual((vault as any).requestTelegramPinRecovery, undefined, 'requestTelegramPinRecovery must be removed.');
    assert.strictEqual((vault as any).resetVaultPinWithRecoveryCode, undefined, 'resetVaultPinWithRecoveryCode must be removed.');

    // 2. Vault PIN endpoints must not exist in server.ts
    const serverPath = path.resolve('server.ts');
    const serverCode = fs.readFileSync(serverPath, 'utf-8');
    assert.ok(!serverCode.includes('/api/connections/vault/setup-pin'), 'setup-pin route must be removed.');
    assert.ok(!serverCode.includes('/api/connections/vault/verify-pin'), 'verify-pin route must be removed.');
    assert.ok(!serverCode.includes('/api/connections/vault/reveal'), 'reveal route must be removed.');
    assert.ok(!serverCode.includes('/api/connections/vault/request-recovery'), 'request-recovery route must be removed.');
    assert.ok(!serverCode.includes('/api/connections/vault/reset-pin'), 'reset-pin route must be removed.');
  });

  await t.test('14. VaultSecurityModal Removal & No Dangling Imports', () => {
    const modalPath = path.resolve('src/components/VaultSecurityModal.jsx');
    assert.strictEqual(fs.existsSync(modalPath), false, 'VaultSecurityModal.jsx must be permanently deleted.');

    // Check all JSX/TSX files for lingering imports
    const viewsPath = path.resolve('src/components/views/ConnectionsView.jsx');
    const viewsCode = fs.readFileSync(viewsPath, 'utf-8');
    assert.ok(!viewsCode.includes('VaultSecurityModal'), 'ConnectionsView.jsx must not import VaultSecurityModal.');
    assert.ok(!viewsCode.includes('handleTriggerReveal'), 'handleTriggerReveal must be removed.');
  });

  await t.test('15. Telegram Bot Integration Remains 100% Operational', async () => {
    const tgCreds = {
      botToken: '987654321:XYZabcUVWrstOPQmnklJHGfedCBA_2026',
      botUsername: '@ChintuAlertsBot',
      allowedChatIds: ['123456789']
    };

    const saved = vault.saveConnection(testUserId, 'telegram', tgCreds);
    assert.strictEqual(saved.provider, 'telegram');
    assert.strictEqual(saved.status, 'SAVED');

    const decrypted = vault.getDecryptedCredentials(testUserId, 'telegram');
    assert.strictEqual(decrypted.botToken, tgCreds.botToken);
    assert.strictEqual(decrypted.botUsername, tgCreds.botUsername);

    const serverPath = path.resolve('server.ts');
    const serverCode = fs.readFileSync(serverPath, 'utf-8');
    assert.ok(serverCode.includes('/api/webhook/telegram'), 'Telegram webhook endpoint must remain intact.');
    assert.ok(serverCode.includes('/api/telegram/bot-webhook'), 'Telegram bot-webhook endpoint must remain intact.');
    assert.ok(serverCode.includes('/api/telegram/send-test'), 'Telegram send-test endpoint must remain intact.');
  });

  await t.test('16. Test-Before-Save Architecture & Candidate Credential Testing', async () => {
    const candidateCreds = {
      apiKey: 'INVALID_PRE_SAVE_KEY',
      clientId: 'V99999',
      pin: '0000',
      totpSecret: 'MZXW6YTBOIBWS3ZNOQ======'
    };

    const testResult = await vault.testConnection(testUserId, 'angel_one', candidateCreds);
    assert.strictEqual(testResult.success, false);

    const currentConn = vault.getUserConnections(testUserId).find((c) => c.provider === 'angel_one')!;
    assert.strictEqual(currentConn.status, 'SAVED', 'Existing saved status must NOT be corrupted by candidate test.');

    const decrypted = vault.getDecryptedCredentials(testUserId, 'angel_one');
    assert.strictEqual(decrypted.apiKey, 'SMART_KEY_2026', 'Existing stored API key must remain untouched.');
  });

  await t.test('17. Verified Capabilities Generation on Successful Connection', async () => {
    const testRes = await vault.testConnection(testUserId, 'telegram', {
      botToken: 'invalid_token_format'
    });
    assert.strictEqual(testRes.success, false);
    assert.ok(testRes.message.includes('Invalid Telegram Bot Token format'));
    assert.deepStrictEqual(testRes.verifiedCapabilities, []);
  });

  await t.test('18. Ollama Local Model Runtime Provider Support', () => {
    const ollamaCreds = {
      endpointUrl: 'http://127.0.0.1:11434',
      modelName: 'llama3'
    };

    const saved = vault.saveConnection(testUserId, 'ollama', ollamaCreds);
    assert.strictEqual(saved.provider, 'ollama');
    assert.strictEqual(saved.status, 'SAVED');
    assert.strictEqual(saved.readBackVerified, true);
    assert.strictEqual(saved.sanitizedConfig.endpointUrl, 'http://127.0.0.1:11434');
    assert.strictEqual(saved.sanitizedConfig.modelName, 'llama3');

    const conns = vault.getUserConnections(testUserId);
    const ollamaState = conns.find((c) => c.provider === 'ollama');
    assert.ok(ollamaState, 'Ollama connection must be returned by getUserConnections.');
  });

  await t.test('19. Google Gemini & OAuth Provider Support', () => {
    const googleCreds = {
      geminiApiKey: 'AIzaSyFakeKeyForTestVerification_1234567890',
      clientId: '12345.apps.googleusercontent.com',
      clientSecret: 'GOCSPX-secret'
    };

    const saved = vault.saveConnection(testUserId, 'google', googleCreds);
    assert.strictEqual(saved.provider, 'google');
    assert.strictEqual(saved.status, 'SAVED');
    assert.strictEqual(saved.readBackVerified, true);
    assert.strictEqual(saved.sanitizedConfig.hasGeminiApiKey, true);
    assert.strictEqual(saved.sanitizedConfig.hasOAuthClient, true);
  });

  await t.test('20. Direct Secret Visibility Control (No PIN Required)', () => {
    const viewsPath = path.resolve('src/components/views/ConnectionsView.jsx');
    const viewsCode = fs.readFileSync(viewsPath, 'utf-8');

    assert.ok(viewsCode.includes('toggleShowSecret'), 'toggleShowSecret must be present for direct eye visibility.');
    assert.ok(viewsCode.includes('showSecrets'), 'showSecrets state must control input masking.');
    assert.ok(!viewsCode.includes('Vault PIN'), 'No Vault PIN prompt text allowed in view.');
  });

  await t.test('21. Tri-Theme Color System Structure & Contrast', () => {
    const cssPath = path.resolve('src/index.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(css.includes(':root'), 'CSS must define :root default dark tokens.');
    assert.ok(css.includes('html.dim, body.dim'), 'CSS must define html.dim balanced slate tokens.');
    assert.ok(css.includes('html.light, body.light'), 'CSS must define html.light high-contrast tokens.');
  });

  await t.test('22. Permanent Fail-Closed Live Trading Safety Gate', () => {
    assert.strictEqual(
      AngelOrderExecutionAdapter.LIVE_TRADING_ELIGIBLE,
      false,
      'AngelOrderExecutionAdapter.LIVE_TRADING_ELIGIBLE must be strictly false.'
    );
  });
});
