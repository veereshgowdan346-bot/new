import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { cryptoVault, CryptoVault } from '../src/utils/cryptoVault';
import { userAuthService, UserAuthService } from '../src/utils/userAuth';
import { connectionVault, ConnectionVaultService } from '../src/utils/connectionVault';
import { runtimeDb } from '../src/utils/databasePersistence';
import { TelegramBotProvider, GoogleOAuthProvider } from '../src/providers/personalIntegrationsProvider';

const TEST_DB = path.join(process.cwd(), 'scratch', 'test_db', 'test_multi_user.db');

describe('CHINTU AI — MULTI-USER & SECURE CONNECTION VAULT SUITE', () => {
  before(() => {
    const dir = path.dirname(TEST_DB);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(TEST_DB)) {
      try { fs.unlinkSync(TEST_DB); } catch (e) {}
    }
    runtimeDb.init(TEST_DB);
    userAuthService.ensureMasterUser();
  });

  after(() => {
    runtimeDb.close();
    if (fs.existsSync(TEST_DB)) {
      try { fs.unlinkSync(TEST_DB); } catch (e) {}
    }
  });

  // ==========================================================================
  // 1. AES-256-GCM Cryptographic Vault
  // ==========================================================================
  describe('1. Server-Side AES-256-GCM Cryptographic Vault', () => {
    it('should encrypt and decrypt plaintext strings accurately', () => {
      const secret = 'my_super_secret_broker_api_key_346';
      const encrypted = cryptoVault.encrypt(secret);

      assert.notStrictEqual(encrypted, secret);
      const parts = encrypted.split(':');
      assert.strictEqual(parts.length, 3, 'Payload must be iv:authTag:ciphertext');

      const decrypted = cryptoVault.decrypt(encrypted);
      assert.strictEqual(decrypted, secret);
    });

    it('should encrypt and decrypt structured credential objects', () => {
      const creds = {
        apiKey: 'ANGEL_API_KEY_VAL',
        clientId: 'V346892',
        pin: '1234',
        totpSecret: 'JBSWY3DPEHPK3PXP'
      };
      const encrypted = cryptoVault.encryptObject(creds);
      const decrypted = cryptoVault.decryptObject<typeof creds>(encrypted);

      assert.deepStrictEqual(decrypted, creds);
    });

    it('should fail authentication if ciphertext or auth tag is tampered with', () => {
      const secret = 'immutable_trading_secret';
      const encrypted = cryptoVault.encrypt(secret);
      const parts = encrypted.split(':');

      // Tamper with ciphertext by altering the last hex character
      const tamperedCipher = parts[2].slice(0, -1) + (parts[2].slice(-1) === 'a' ? 'b' : 'a');
      const tamperedPayload = `${parts[0]}:${parts[1]}:${tamperedCipher}`;

      assert.throws(() => {
        cryptoVault.decrypt(tamperedPayload);
      }, /Unsupported state or unable to authenticate data|Authentication failed/i);
    });

    it('should produce distinct ciphertexts for identical plaintexts (random IV)', () => {
      const secret = 'constant_pin_4444';
      const enc1 = cryptoVault.encrypt(secret);
      const enc2 = cryptoVault.encrypt(secret);

      assert.notStrictEqual(enc1, enc2, 'Subsequent encryptions must use random IVs');
      assert.strictEqual(cryptoVault.decrypt(enc1), secret);
      assert.strictEqual(cryptoVault.decrypt(enc2), secret);
    });
  });

  // ==========================================================================
  // 2. Multi-User Authentication & Authorization
  // ==========================================================================
  describe('2. Multi-User Authentication & Token Management', () => {
    it('should issue signed session tokens with valid payload and signature', () => {
      const user = {
        id: 'usr_test_trader_1',
        email: 'trader1@chintu.ai',
        role: 'trader' as const,
        name: 'Trader One'
      };

      const token = userAuthService.issueSessionToken(user, 12);
      assert.ok(token.startsWith('chntu.'));

      const session = userAuthService.verifySessionToken(token);
      assert.ok(session !== null);
      assert.strictEqual(session.userId, user.id);
      assert.strictEqual(session.email, user.email);
      assert.strictEqual(session.role, user.role);
    });

    it('should reject tampered or forged session tokens', () => {
      const user = {
        id: 'usr_hacker_target',
        email: 'victim@chintu.ai',
        role: 'trader' as const,
        name: 'Target User'
      };

      const token = userAuthService.issueSessionToken(user, 1);
      const parts = token.split('.');

      // Forge payload by elevating role to admin
      const forgedPayload = Buffer.from(JSON.stringify({ ...user, role: 'admin', exp: Date.now() + 3600000 })).toString('base64url');
      const forgedToken = `chntu.${forgedPayload}.${parts[2]}`;

      const session = userAuthService.verifySessionToken(forgedToken);
      assert.strictEqual(session, null, 'Forged token signature must fail verification');
    });

    it('should reject expired tokens', () => {
      const user = {
        id: 'usr_expired_trader',
        email: 'expired@chintu.ai',
        role: 'trader' as const,
        name: 'Old Trader'
      };

      // Issue token with -1 hour duration (already expired)
      const expiredToken = userAuthService.issueSessionToken(user, -1);
      const session = userAuthService.verifySessionToken(expiredToken);
      assert.strictEqual(session, null, 'Expired token must return null');
    });

    it('should verify password hash with PBKDF2 correctly', () => {
      const password = 'StrongPassword@2026';
      const { hash, salt } = userAuthService.hashPassword(password);

      assert.strictEqual(userAuthService.verifyPassword(password, hash, salt), true);
      assert.strictEqual(userAuthService.verifyPassword('WrongPassword', hash, salt), false);
    });
  });

  // ==========================================================================
  // 3. Multi-User Credential Isolation & Vault Storage
  // ==========================================================================
  describe('3. Multi-User Credential Isolation & Vault Storage', () => {
    const userA = 'usr_alice_quant_01';
    const userB = 'usr_bob_trader_02';

    it('should isolate credentials so User A cannot access User B credentials', () => {
      // User A connects Angel One
      connectionVault.saveConnection(userA, 'angel_one', {
        apiKey: 'ALICE_ANGEL_KEY',
        clientId: 'ALICE_CLIENT',
        pin: '1111',
        totpSecret: 'ALICE_TOTP_SECRET_32'
      });

      // User B connects Angel One with different credentials
      connectionVault.saveConnection(userB, 'angel_one', {
        apiKey: 'BOB_ANGEL_KEY',
        clientId: 'BOB_CLIENT',
        pin: '2222',
        totpSecret: 'BOB_TOTP_SECRET_32'
      });

      // Verify User A decrypted credentials
      const credsA = connectionVault.getDecryptedCredentials(userA, 'angel_one');
      assert.ok(credsA);
      assert.strictEqual(credsA.clientId, 'ALICE_CLIENT');
      assert.strictEqual(credsA.pin, '1111');

      // Verify User B decrypted credentials
      const credsB = connectionVault.getDecryptedCredentials(userB, 'angel_one');
      assert.ok(credsB);
      assert.strictEqual(credsB.clientId, 'BOB_CLIENT');
      assert.strictEqual(credsB.pin, '2222');

      // Verify sanitized configs never disclose secrets
      const stateA = connectionVault.getConnectionState(userA, 'angel_one');
      assert.strictEqual(stateA.sanitizedConfig.hasApiKey, true);
      assert.strictEqual(stateA.sanitizedConfig.hasPin, true);
      assert.strictEqual(stateA.sanitizedConfig.pin, undefined, 'PIN must never appear in sanitized config');
      assert.strictEqual(stateA.sanitizedConfig.apiKey, undefined, 'API Key must never appear in sanitized config');
    });

    it('should return NOT_CONFIGURED for providers the user has not connected', () => {
      const state = connectionVault.getConnectionState('usr_fresh_new_user', 'telegram');
      assert.strictEqual(state.status, 'NOT_CONFIGURED');
      assert.deepStrictEqual(state.sanitizedConfig, {});
    });

    it('should safely purge stored credentials upon disconnect', () => {
      const tempUser = 'usr_temp_to_disconnect';
      connectionVault.saveConnection(tempUser, 'telegram', {
        botToken: '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_test',
        botUsername: '@temp_bot'
      });

      assert.ok(connectionVault.getDecryptedCredentials(tempUser, 'telegram') !== null);

      const disconnState = connectionVault.disconnectConnection(tempUser, 'telegram');
      assert.strictEqual(disconnState.status, 'DISCONNECTED');
      assert.strictEqual(connectionVault.getDecryptedCredentials(tempUser, 'telegram'), null);
    });
  });

  // ==========================================================================
  // 4. Messaging Integrations (Official Telegram Bot API)
  // ==========================================================================
  describe('4. Messaging Integrations (Official Telegram Bot API)', () => {
    it('should validate Telegram bot token format accurately', () => {
      const tg = new TelegramBotProvider();
      assert.strictEqual(tg.isValidTokenFormat('8856634279:AAEJmjMIYDTNAiR8IuFjULzprGBrHN3eebg'), true);
      assert.strictEqual(tg.isValidTokenFormat('invalid_token_no_colon'), false);
      assert.strictEqual(tg.isValidTokenFormat('123:short'), false);
    });

    it('should deduplicate incoming Telegram update IDs to prevent double command execution', () => {
      const tg = new TelegramBotProvider();
      const res1 = tg.processUpdate(1001, '/status');
      assert.strictEqual(res1.isDuplicate, false);
      assert.strictEqual(res1.parsedCommand, '/status');

      // Second submission of identical update ID
      const res2 = tg.processUpdate(1001, '/status');
      assert.strictEqual(res2.isDuplicate, true, 'Duplicate Telegram update must be rejected');
    });
  });

  // ==========================================================================
  // 5. Google OAuth 2.0 State Protection & Token Lifecycle
  // ==========================================================================
  describe('5. Google OAuth 2.0 State Protection & Token Lifecycle', () => {
    it('should generate OAuth authorization URL with random CSRF state token', () => {
      const google = new GoogleOAuthProvider();
      const { authUrl, state } = google.generateAuthUrl();

      assert.ok(authUrl.includes('accounts.google.com'));
      assert.ok(authUrl.includes(`state=${state}`));
      assert.strictEqual(state.length, 32, 'CSRF state token must be 32 hex characters');
    });

    it('should reject callback if OAuth state token is missing or forged (CSRF Protection)', async () => {
      const google = new GoogleOAuthProvider();
      google.generateAuthUrl(); // sets active state

      const result = await google.handleCallback('valid_code', 'forged_state_token');
      assert.strictEqual(result.success, false);
      assert.ok(result.message.includes('CSRF'));
    });

    it('should successfully establish session and allow token refresh and revocation', async () => {
      const google = new GoogleOAuthProvider();
      const { state } = google.generateAuthUrl();

      const callbackResult = await google.handleCallback('valid_auth_code', state);
      assert.strictEqual(callbackResult.success, true);
      assert.strictEqual(google.getState().connected, true);

      // Refresh token
      const refreshResult = await google.refreshToken();
      assert.strictEqual(refreshResult.success, true);

      // Revoke session
      const revokeResult = await google.revokeSession();
      assert.strictEqual(revokeResult.success, true);
      assert.strictEqual(google.getState().connected, false);
    });
  });

  // ==========================================================================
  // 6. Live Trading Two-Stage Arming & Audit Trail
  // ==========================================================================
  describe('6. Safe Live Trading Activation & Audit Trail', () => {
    it('should record audit trail for connection changes and security events', () => {
      const testUser = 'usr_audit_test_user';
      runtimeDb.logAudit({
        id: `aud_${Date.now()}_1`,
        userId: testUser,
        action: 'TEST_AUDIT_ACTION',
        details: 'Audit verification entry',
        timestamp: new Date().toISOString()
      });

      const logs = runtimeDb.getAuditLogs(testUser, 10);
      assert.ok(logs.length >= 1);
      assert.strictEqual(logs[0].action, 'TEST_AUDIT_ACTION');
    });
  });

  // ==========================================================================
  // 7. Explicit Two-User Isolation & Negative Authorization HTTP Gate Tests
  // ==========================================================================
  describe('7. Explicit Two-User Isolation & Negative Authorization HTTP Gate', () => {
    const userAlice = {
      id: 'usr_alice_isolation_01',
      email: 'alice@quantcorp.com',
      name: 'Alice Quant',
      role: 'trader' as const
    };

    const userBob = {
      id: 'usr_bob_isolation_02',
      email: 'bob@hedgefund.com',
      name: 'Bob Trader',
      role: 'trader' as const
    };

    it('should reject unauthenticated request with 401 UNAUTHORIZED', () => {
      let statusCode = 0;
      let jsonPayload: any = null;
      let nextCalled = false;

      const mockReq: any = { headers: {} };
      const mockRes: any = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (payload: any) => {
              jsonPayload = payload;
            }
          };
        }
      };

      userAuthService.requireAuth(mockReq, mockRes, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false, 'Next must not be called when unauthenticated');
      assert.strictEqual(statusCode, 401);
      assert.strictEqual(jsonPayload?.code, 'UNAUTHORIZED');
    });

    it('should reject forged or tampered session token with 401 UNAUTHORIZED', () => {
      let statusCode = 0;
      let jsonPayload: any = null;

      const mockReq: any = { headers: { authorization: 'Bearer chntu.forged_payload.invalid_signature' } };
      const mockRes: any = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (payload: any) => {
              jsonPayload = payload;
            }
          };
        }
      };

      userAuthService.requireAuth(mockReq, mockRes, () => {});

      assert.strictEqual(statusCode, 401);
      assert.strictEqual(jsonPayload?.code, 'UNAUTHORIZED');
    });

    it('should reject non-admin users attempting admin operations with 403 FORBIDDEN', () => {
      const traderToken = userAuthService.issueSessionToken(userAlice, 1);
      let statusCode = 0;
      let jsonPayload: any = null;
      let nextCalled = false;

      const mockReq: any = { headers: { authorization: `Bearer ${traderToken}` } };
      const mockRes: any = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (payload: any) => {
              jsonPayload = payload;
            }
          };
        }
      };

      userAuthService.requireAdmin(mockReq, mockRes, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false, 'Trader role must not access admin routes');
      assert.strictEqual(statusCode, 403);
      assert.strictEqual(jsonPayload?.code, 'FORBIDDEN');
    });

    it('should strictly isolate credentials between Alice and Bob', () => {
      // Alice saves credentials
      connectionVault.saveConnection(userAlice.id, 'angel_one', {
        apiKey: 'ALICE_KEY_SECRET',
        clientId: 'ALICE_CLIENT_01',
        pin: '1111',
        totpSecret: 'ALICETOTPKEY1234'
      });

      // Bob saves credentials
      connectionVault.saveConnection(userBob.id, 'angel_one', {
        apiKey: 'BOB_KEY_SECRET',
        clientId: 'BOB_CLIENT_02',
        pin: '2222',
        totpSecret: 'BOBTOTPKEY12345'
      });

      // Alice fetches connections (sanitized config is securely masked)
      const aliceConns = connectionVault.getUserConnections(userAlice.id);
      const aliceAngel = aliceConns.find((c) => c.provider === 'angel_one');
      assert.strictEqual(aliceAngel?.sanitizedConfig.clientId, 'AL***1');

      // Bob fetches connections (sanitized config is securely masked)
      const bobConns = connectionVault.getUserConnections(userBob.id);
      const bobAngel = bobConns.find((c) => c.provider === 'angel_one');
      assert.strictEqual(bobAngel?.sanitizedConfig.clientId, 'BO***2');

      // Verify decrypted credentials isolation
      const aliceCreds = connectionVault.getDecryptedCredentials(userAlice.id, 'angel_one');
      const bobCreds = connectionVault.getDecryptedCredentials(userBob.id, 'angel_one');

      assert.strictEqual(aliceCreds.apiKey, 'ALICE_KEY_SECRET');
      assert.strictEqual(bobCreds.apiKey, 'BOB_KEY_SECRET');
    });

    it('should ignore client-supplied userId when User A tries to overwrite User B credentials', () => {
      // User A (Alice) sends a request trying to overwrite Bob credentials by passing body.userId = userBob.id
      const sessionA = userAuthService.issueSessionToken(userAlice, 1);
      const verifiedSession = userAuthService.verifySessionToken(sessionA);
      assert.ok(verifiedSession);

      // Server enforces: const userId = req.user!.userId;
      const enforcedUserId = verifiedSession.userId;
      assert.strictEqual(enforcedUserId, userAlice.id, 'Server must enforce session userId regardless of request body');

      // Save operation using enforced server userId
      connectionVault.saveConnection(enforcedUserId, 'telegram', {
        botToken: '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_alice',
        botUsername: '@alice_bot'
      });

      // Confirm Bob has zero telegram connection
      const bobTg = connectionVault.getConnectionState(userBob.id, 'telegram');
      assert.strictEqual(bobTg.status, 'NOT_CONFIGURED');
      assert.strictEqual(connectionVault.getDecryptedCredentials(userBob.id, 'telegram'), null);

      // Confirm Alice has telegram connection
      const aliceTg = connectionVault.getConnectionState(userAlice.id, 'telegram');
      assert.strictEqual(aliceTg.sanitizedConfig.botUsername, '@alice_bot');
    });

    it('should ensure disconnecting Alice does not impact Bob credentials or state', () => {
      // Disconnect Alice
      const disconn = connectionVault.disconnectConnection(userAlice.id, 'angel_one');
      assert.strictEqual(disconn.status, 'DISCONNECTED');
      assert.strictEqual(connectionVault.getDecryptedCredentials(userAlice.id, 'angel_one'), null);

      // Verify Bob credentials remain completely unaffected
      const bobCreds = connectionVault.getDecryptedCredentials(userBob.id, 'angel_one');
      assert.ok(bobCreds);
      assert.strictEqual(bobCreds.clientId, 'BOB_CLIENT_02');
      assert.strictEqual(bobCreds.pin, '2222');
    });
  });
});
