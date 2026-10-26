import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { providerManager } from '../src/providers/providerManager';
import {
  GoogleOAuthProvider,
  TelegramBotProvider
} from '../src/providers/personalIntegrationsProvider';
import { MockMarketDataProvider, SimulatedReplayProvider, HistoricalReplayProvider } from '../src/providers/marketDataProvider';

describe('CHINTU AI QUANT — PROVIDER ARCHITECTURE & PERSONAL INTEGRATIONS SUITE', () => {

  after(() => {
    providerManager.stopAll();
  });

  // ==========================================================================
  // 1. PROVIDER MODES & ARCHITECTURAL TRANSITIONS
  // ==========================================================================
  describe('1. Provider Modes & Dynamic State Transitions', () => {
    it('should support all 5 mandatory mode labels', () => {
      const validModes = [
        'MOCK_TEST',
        'HISTORICAL_REPLAY',
        'SIMULATED_REPLAY',
        'LIVE_MARKET_DATA_PAPER',
        'PERSONAL_ACCOUNT_CONNECTED'
      ];

      validModes.forEach((mode: any) => {
        const res = providerManager.setMode(mode);
        assert.equal(res.success, true);
        assert.equal(providerManager.getMode(), mode);
      });
    });

    it('should report correct diagnostics and data freshness in SIMULATED_REPLAY mode', () => {
      providerManager.setMode('SIMULATED_REPLAY');
      const diag = providerManager.getDiagnostics();

      assert.equal(diag.activeMode, 'SIMULATED_REPLAY');
      assert.equal(diag.marketData.mode, 'SIMULATED_REPLAY');
      assert.equal(diag.marketData.status, 'CONNECTED');
      assert.equal(diag.marketData.isDataFresh, true);
      assert.ok(diag.marketData.quotesCount >= 7);
      assert.equal(diag.marketData.isLiveConnected, false, 'Simulated replay must NEVER be labeled as live connected');
    });

    it('should playback historical bars deterministically in HISTORICAL_REPLAY mode', () => {
      providerManager.setMode('HISTORICAL_REPLAY');
      const histProvider = providerManager.getHistoricalProvider();
      histProvider.start();

      const tick1 = histProvider.playbackNext();
      assert.ok(tick1);
      assert.equal(tick1?.symbol, 'NIFTY 50');
      assert.equal(tick1?.source, 'HISTORICAL_REPLAY');

      const tick2 = histProvider.playbackNext();
      assert.ok(tick2);
      assert.equal(tick2?.source, 'HISTORICAL_REPLAY');
    });

    it('should fail-closed safely in LIVE_MARKET_DATA_PAPER when credentials are missing', async () => {
      providerManager.setMode('LIVE_MARKET_DATA_PAPER');
      const liveProvider = providerManager.getLiveAngelProvider();
      await liveProvider.start();

      const state = liveProvider.getState();
      assert.equal(state.isLiveConnected, false);
      assert.equal(state.status, 'DEGRADED');
      assert.ok(state.reason?.includes('credentials unconfigured'));
    });

    it('should require fresh verified live ticks before enabling live paper trading', () => {
      providerManager.setMode('LIVE_MARKET_DATA_PAPER');
      const liveProvider = providerManager.getLiveAngelProvider();
      const state = liveProvider.getState();
      assert.equal(state.canTrade, false, 'Cannot trade in LIVE_MARKET_DATA_PAPER without verified fresh live ticks');
      assert.equal(state.isLiveStreaming, false);
    });

    it('should enforce source truthfulness and never report simulated data as live', () => {
      providerManager.setMode('SIMULATED_REPLAY');
      const diag = providerManager.getDiagnostics();
      assert.equal(diag.marketData.isLiveConnected, false);
      assert.notEqual(diag.marketData.feedSource, 'OFFICIAL_ANGEL_ONE_SMARTSTREAM');
    });
  });

  // ==========================================================================
  // 2. PRE-TRADE ELIGIBILITY & DISCONNECTION PROTECTION
  // ==========================================================================
  describe('2. Trade Execution Safety & Feed Degradation Guards', () => {
    it('should permit trade execution when active provider is connected and data is fresh', () => {
      providerManager.setMode('MOCK_TEST');
      const mock = providerManager.getMockProvider();
      mock.start();
      mock.injectQuote('NIFTY 50', 25000);

      const check = providerManager.canTrade();
      assert.equal(check.canTrade, true);
      assert.equal(check.reason, undefined);
    });

    it('should block trade execution when feed is disconnected or in error', () => {
      providerManager.setMode('MOCK_TEST');
      const mock = providerManager.getMockProvider();
      mock.simulateDisconnect('Simulated Socket ECONNRESET');

      const check = providerManager.canTrade();
      assert.equal(check.canTrade, false);
      assert.ok(check.reason?.includes('Simulated Socket ECONNRESET'));
    });

    it('should block trade execution when quotes are stale (>120s old)', () => {
      providerManager.setMode('MOCK_TEST');
      const mock = providerManager.getMockProvider();
      mock.start();
      mock.simulateStaleData(300); // 300 seconds old

      const check = providerManager.canTrade();
      assert.equal(check.canTrade, false);
      assert.ok(check.reason?.includes('Market feed stale'));
    });
  });

  // ==========================================================================
  // 3. GOOGLE OAUTH 2.0 INTEGRATION PROVIDER
  // ==========================================================================
  describe('3. Google OAuth 2.0 Integration & Session Management', () => {
    let googleProvider: GoogleOAuthProvider;

    before(() => {
      googleProvider = new GoogleOAuthProvider();
    });

    it('should generate official OAuth 2.0 auth URL with CSRF state token and least-privilege scopes', () => {
      const { authUrl, state } = googleProvider.generateAuthUrl();
      assert.ok(authUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth'));
      assert.ok(authUrl.includes('scope=openid%20email%20profile'));
      assert.ok(authUrl.includes(`state=${state}`));
      assert.equal(state.length, 32);
    });

    it('should reject callback when CSRF state token is forged or mismatched', async () => {
      googleProvider.generateAuthUrl(); // sets active state
      const result = await googleProvider.handleCallback('valid_code', 'forged_state_token');
      assert.equal(result.success, false);
      assert.ok(result.message.includes('CSRF attack detected'));
    });

    it('should successfully establish session on valid callback and report masked email', async () => {
      const { state } = googleProvider.generateAuthUrl();
      const result = await googleProvider.handleCallback('auth_code_123', state);
      assert.equal(result.success, true);
      assert.ok(result.user);
      assert.equal(result.user.emailMasked, 'v***6@gmail.com');

      const status = googleProvider.getState();
      assert.equal(status.connected, true);
      assert.equal(status.emailMasked, 'v***6@gmail.com');
      assert.deepEqual(status.scopes, ['openid', 'email', 'profile']);
    });

    it('should refresh expired access tokens seamlessly', async () => {
      const refreshResult = await googleProvider.refreshToken();
      assert.equal(refreshResult.success, true);
      assert.ok(refreshResult.newExpiry! > Date.now());
    });

    it('should revoke token and unlink session cleanly', async () => {
      const revokeResult = await googleProvider.revokeSession();
      assert.equal(revokeResult.success, true);

      const status = googleProvider.getState();
      assert.equal(status.connected, false);
      assert.equal(status.emailMasked, 'UNAUTHENTICATED');
    });
  });

  // ==========================================================================
  // 4. VERIFIED REMOVAL OF DEPRECATED CHANNELS (PURE 3-PROVIDER ARCHITECTURE)
  // ==========================================================================
  describe('4. Verified Deprecation & Removal of WhatsApp (Pure 3-Provider Architecture)', () => {
    it('should only support angel_one, telegram, and google in providerManager and connectionVault', () => {
      const diag = providerManager.getDiagnostics();
      // Ensure only telegram and google exist in integrations
      assert.ok('telegram' in diag.integrations);
      assert.ok('google' in diag.integrations);
      assert.equal('whatsapp' in diag.integrations, false, 'whatsapp must NOT exist in provider integrations');
    });

    it('should ensure providerManager does not expose whatsapp provider instance', () => {
      assert.equal((providerManager as any).whatsapp, undefined);
    });
  });

  // ==========================================================================
  // 5. TELEGRAM BOT API INTEGRATION PROVIDER
  // ==========================================================================
  describe('5. Telegram Dedicated Bot API & Idempotency Controls', () => {
    let telegramProvider: TelegramBotProvider;
    const mockToken = '8856634279:AAEJmjMIYDTNAiR8IuFjULzprGBrHN3eebg';

    before(() => {
      telegramProvider = new TelegramBotProvider({ botToken: mockToken });
    });

    it('should validate official BotFather token syntax', () => {
      assert.equal(telegramProvider.isValidTokenFormat(mockToken), true);
      assert.equal(telegramProvider.isValidTokenFormat('invalid_token'), false);
    });

    it('should safely mask Telegram bot tokens in telemetry', () => {
      const state = telegramProvider.getState();
      assert.equal(state.connected, true);
      assert.ok(state.maskedToken.includes('***'));
      assert.ok(!JSON.stringify(state).includes('AAEJmjMIYDTNAiR8IuFjULzprGBrHN3eebg'));
    });

    it('should prevent duplicate webhook updates through update_id deduplication', () => {
      const updateId = 987654321;
      const first = telegramProvider.processUpdate(updateId, '/status');
      assert.equal(first.isDuplicate, false);
      assert.equal(first.parsedCommand, '/status');

      // Duplicate submission of same updateId
      const second = telegramProvider.processUpdate(updateId, '/status');
      assert.equal(second.isDuplicate, true, 'Duplicate update must be recognized');
      assert.equal(second.parsedCommand, undefined);
    });

    it('should deliver messages safely to sandbox channels without real external transmission', async () => {
      const result = await telegramProvider.sendMessage('6912523089', 'Test Signal Notification');
      assert.equal(result.success, true);
      assert.ok(result.messageId > 0);
    });
  });
});

