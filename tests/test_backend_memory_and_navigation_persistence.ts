import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeDb } from '../src/utils/databasePersistence';
import { connectionVault } from '../src/utils/connectionVault';
import { toastEmitter } from '../src/utils/toastEmitter';
import { soundEngine } from '../src/utils/audioChime';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('=== CHINTU AI — PERSISTENT BACKEND MEMORY & NAVIGATION AUDIT ===\n');
  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      const res = fn();
      if (res && typeof res.then === 'function') {
        return res
          .then(() => {
            console.log(`  [PASS] ${name}`);
            passed++;
          })
          .catch((err: any) => {
            console.error(`  [FAIL] ${name}:`, err.message);
            throw err;
          });
      }
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  // TEST 1: Database Initialization and Schema Integrity
  await test('1. SQLite WAL mode and system_settings table initialization', () => {
    runtimeDb.init();
    const db = runtimeDb.getDb();
    assert(db !== null, 'Database connection should not be null');

    const pragma = db.prepare('PRAGMA journal_mode').get() as any;
    assert.strictEqual(pragma.journal_mode.toLowerCase(), 'wal', 'Journal mode must be WAL');

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    const tableNames = tables.map((t) => t.name);
    assert(tableNames.includes('system_settings'), 'system_settings table must exist');
    assert(tableNames.includes('user_connections'), 'user_connections table must exist');
    assert(tableNames.includes('bots'), 'bots table must exist');
    assert(tableNames.includes('trades'), 'trades table must exist');
    assert(tableNames.includes('positions'), 'positions table must exist');
  });

  // TEST 2: System Settings Persistence Across Simulated Restarts
  await test('2. System settings persistence across simulated app restart', () => {
    const testConfig = {
      simulationEnabled: true,
      tickInterval: 1500,
      soundAlerts: true,
      wsUrl: '/chintu-feed',
      restUrl: '/api',
      telegramAlertsEnabled: true,
      telegramRemoteControl: false,
      telegramChatId: '987654321',
      testMarker: 'PERMANENT_MEMORY_VERIFIED'
    };

    runtimeDb.setSetting('system_settings', testConfig);
    const retrieved = runtimeDb.getSetting<typeof testConfig>('system_settings');
    assert(retrieved !== null, 'Retrieved settings should not be null');
    assert.strictEqual(retrieved.tickInterval, 1500);
    assert.strictEqual(retrieved.testMarker, 'PERMANENT_MEMORY_VERIFIED');
    assert.strictEqual(retrieved.telegramChatId, '987654321');

    // Simulate database re-initialization
    runtimeDb.init();
    const afterReload = runtimeDb.getSetting<typeof testConfig>('system_settings');
    assert.strictEqual(afterReload?.testMarker, 'PERMANENT_MEMORY_VERIFIED');
  });

  // TEST 3: RMS Guard Configuration Persistence
  await test('3. RMS Guard configuration persistence in SQLite', () => {
    const rmsPayload = {
      max_daily_loss: 35000,
      max_intraday_drawdown_pct: 3.5,
      trailing_stop_loss_pct: 2.0,
      auto_square_off_enabled: true,
      peak_equity: 550000,
      current_drawdown_pct: 0.85,
      circuit_breaker_tripped: false
    };

    runtimeDb.setSetting('rms_config', rmsPayload);
    const storedRms = runtimeDb.getSetting<typeof rmsPayload>('rms_config');
    assert(storedRms !== null, 'Stored RMS config should not be null');
    assert.strictEqual(storedRms.max_daily_loss, 35000);
    assert.strictEqual(storedRms.max_intraday_drawdown_pct, 3.5);
    assert.strictEqual(storedRms.auto_square_off_enabled, true);
  });

  // TEST 4: Watchlist Favorites Persistence
  await test('4. Watchlist favorites persistence across navigation', () => {
    const customWatchlist = ['NIFTY 50', 'BANK NIFTY', 'GOLD', 'RELIANCE', 'TATAMOTORS', 'HDFCBANK'];
    runtimeDb.setSetting('watchlist', customWatchlist);

    const savedWatchlist = runtimeDb.getSetting<string[]>('watchlist');
    assert(Array.isArray(savedWatchlist), 'Watchlist should be an array');
    assert.strictEqual(savedWatchlist.length, 6);
    assert(savedWatchlist.includes('TATAMOTORS'));
  });

  // TEST 5: Bot Configuration & Capital Allocation Persistence
  await test('5. Canonical bot configuration & capital allocation persistence', () => {
    runtimeDb.upsertBot({
      id: 1,
      name: 'Alpha Trend Scalper',
      asset: 'NIFTY 50 (F&O)',
      price: 25840.50,
      allocatedCapital: 85000,
      pnlToday: 1250.50,
      winRate: 68.5,
      trades: 12,
      status: 'RUNNING',
      worker_running: true
    });

    const bots = runtimeDb.getBots();
    const bot1 = bots.find((b) => b.id === 1);
    assert(bot1 !== undefined, 'Bot 1 must exist');
    assert.strictEqual(bot1.allocatedCapital, 85000, 'Allocated capital must be updated in SQLite');
    assert.strictEqual(bot1.status, 'RUNNING');
    assert.strictEqual(bot1.worker_running, true);
  });

  // TEST 6: Connection Vault Non-Destructive Credential Merging
  await test('6. Connection Vault non-destructive credential merging', () => {
    const testUser = 'usr_test_persistence_audit';
    const initialCreds = {
      apiKey: 'TEST_API_KEY_ORIGINAL',
      clientId: 'V998877',
      pin: '1234',
      totpSecret: 'JBSWY3DPEHPK3PXP'
    };

    // Save initial
    connectionVault.saveConnection(testUser, 'angel_one', initialCreds);
    let decrypted = connectionVault.getDecryptedCredentials<typeof initialCreds>(testUser, 'angel_one');
    assert(decrypted !== null, 'Decrypted credentials must exist');
    assert.strictEqual(decrypted.apiKey, 'TEST_API_KEY_ORIGINAL');
    assert.strictEqual(decrypted.clientId, 'V998877');
    assert.strictEqual(decrypted.pin, '1234');
    assert.strictEqual(decrypted.totpSecret, 'JBSWY3DPEHPK3PXP');

    // Partial update: user only updates PIN, leaving other fields blank
    connectionVault.saveConnection(testUser, 'angel_one', {
      apiKey: '',
      clientId: '',
      pin: '9876',
      totpSecret: ''
    });

    decrypted = connectionVault.getDecryptedCredentials<typeof initialCreds>(testUser, 'angel_one');
    assert(decrypted !== null);
    assert.strictEqual(decrypted.apiKey, 'TEST_API_KEY_ORIGINAL', 'API Key should NOT be wiped out by empty string');
    assert.strictEqual(decrypted.clientId, 'V998877', 'Client ID should NOT be wiped out');
    assert.strictEqual(decrypted.pin, '9876', 'PIN should be updated to 9876');
    assert.strictEqual(decrypted.totpSecret, 'JBSWY3DPEHPK3PXP', 'TOTP Secret should be preserved');

    // Mask protection: bullet masks and asterisks must be ignored
    connectionVault.saveConnection(testUser, 'angel_one', {
      apiKey: '••••••••••••',
      clientId: 'V9***7',
      pin: '••••',
      totpSecret: '***'
    });

    decrypted = connectionVault.getDecryptedCredentials<typeof initialCreds>(testUser, 'angel_one');
    assert(decrypted !== null);
    assert.strictEqual(decrypted.apiKey, 'TEST_API_KEY_ORIGINAL', 'Masked API Key must not overwrite real key');
    assert.strictEqual(decrypted.clientId, 'V998877', 'Masked Client ID must not overwrite real ID');
    assert.strictEqual(decrypted.pin, '9876', 'Masked PIN must not overwrite real PIN');
    assert.strictEqual(decrypted.totpSecret, 'JBSWY3DPEHPK3PXP', 'Masked TOTP secret must not overwrite real secret');
  });

  // TEST 7: Pre-Save Test Connection with Stored Credentials
  await test('7. Pre-save test connection seamlessly reuses stored decrypted credentials', async () => {
    const testUser = 'usr_test_persistence_audit';
    // When user returns to tab and clicks Test Connection, empty strings in form must merge with stored credentials
    const testResult = await connectionVault.testConnection(testUser, 'angel_one', {
      apiKey: '',
      clientId: '',
      pin: '',
      totpSecret: ''
    });

    // Should NOT fail with missing credentials validation error
    assert.notStrictEqual(
      testResult.message,
      'No credentials configured for angel_one. Please provide required fields first.',
      'Must recognize stored credentials'
    );
    assert.notStrictEqual(
      testResult.message,
      'Missing one or more required Angel One fields: API Key, Client Code, PIN, TOTP Secret.',
      'Must merge stored credentials rather than evaluating empty strings'
    );
  });

  // TEST 8: Sanitized Exposure & Hydration Integrity
  await test('8. Sanitized connection exposure correctly masks secrets for client hydration', () => {
    const testUser = 'usr_test_persistence_audit';
    const state = connectionVault.getConnectionState(testUser, 'angel_one');

    assert.strictEqual(state.status, 'SAVED');
    assert.strictEqual(state.sanitizedConfig.hasApiKey, true);
    assert.strictEqual(state.sanitizedConfig.hasPin, true);
    assert.strictEqual(state.sanitizedConfig.hasTotpSecret, true);
    assert(typeof state.sanitizedConfig.clientId === 'string');
    assert(state.sanitizedConfig.clientId.includes('***'), 'Client ID should be masked');
    assert(!('apiKey' in state.sanitizedConfig), 'Plaintext API Key must never be in sanitized config');
    assert(!('pin' in state.sanitizedConfig), 'Plaintext PIN must never be in sanitized config');
    assert(!('totpSecret' in state.sanitizedConfig), 'Plaintext TOTP Secret must never be in sanitized config');
  });

  // TEST 9: Decoupled UI Notifications and Audio Engine
  await test('9. UI notification emitter and sound engine methods are infallible and decoupled', () => {
    // Verify toastEmitter methods
    assert.doesNotThrow(() => {
      toastEmitter.emitToast({
        title: 'Audit Test',
        message: 'Decoupled toast emission check',
        type: 'success'
      });
      toastEmitter.emit({
        title: 'Legacy Emit',
        message: 'Backward compatible check'
      });
    }, 'toastEmitter methods must execute without exception');

    // Verify soundEngine methods
    assert.doesNotThrow(() => {
      soundEngine.playSuccessChime();
      soundEngine.playVetoChime();
      soundEngine.playAlertChime();
      soundEngine.playBuyChime();
      soundEngine.playSellChime();
    }, 'soundEngine chimes must execute safely in all environments');
  });

  // TEST 10: Cleanup of audit test user without touching production user
  await test('10. Clean up test user records preserving master production records', () => {
    connectionVault.disconnectConnection('usr_test_persistence_audit', 'angel_one');
    const masterRecord = runtimeDb.getConnection('usr_veeresh_master', 'angel_one');
    // Ensure production user was not touched
    assert(masterRecord !== null, 'Master production record must be preserved');
    assert.strictEqual(masterRecord.userId, 'usr_veeresh_master');
  });

  // TEST 11: SQLite Integrity Check & PRAGMA Verification
  await test('11. Database integrity check and PRAGMA validation', () => {
    const integrity = runtimeDb.verifyIntegrity();
    assert.strictEqual(integrity.ok, true, 'Database integrity must be ok');
    assert(integrity.tableCounts.bots >= 14, 'Must have at least 14 bots persisted');
    assert(typeof integrity.tableCounts.system_settings === 'number', 'system_settings count must be a number');
    assert(typeof integrity.tableCounts.user_connections === 'number', 'user_connections count must be a number');
  });

  // TEST 12: Database Backup Generation
  await test('12. Database backup creation and validation', () => {
    const backupResult = runtimeDb.backupDatabase();
    assert.strictEqual(backupResult.success, true, 'Backup generation must succeed');
    assert(backupResult.backupPath && backupResult.backupPath.endsWith('.db'), 'Backup path must be a .db file');
  });
  console.log(`\nAll ${passed}/${total} test specifications PASSED! (100% SUCCESS RATE)\n`);
}

runTests().catch((e) => {
  console.error('\nTest Suite Failed:', e);
  process.exit(1);
});

