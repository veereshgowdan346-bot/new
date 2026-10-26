/**
 * CHINTU AI — TELEGRAM ALERTS & COOLDOWN TEST SUITE
 *
 * Verifies:
 * 1. All 9 canonical event types are handled cleanly.
 * 2. Deduplication and 60-second cooldown window prevents alert storms.
 * 3. Secret redaction (passwords, PINs, JWTs, long tokens are redacted).
 * 4. Truthful delivery tracking (records failure when offline or credentials placeholder).
 * 5. Connectivity test method.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  telegramAlertManager,
  TelegramEventType,
  TelegramAlertPayload
} from '../src/utils/telegramAlerts';

describe('Telegram Alerts & Cooldown Engine Test Suite', () => {

  const CANONICAL_EVENTS: TelegramEventType[] = [
    'BROKER_AUTH_SESSION_FAILURE',
    'MARKET_DATA_DISCONNECT_OR_STALE',
    'STRATEGY_BOT_FAILURE',
    'QUORUM_FAILURE_OR_RISK_REJECTION',
    'PAPER_ORDER_LIFECYCLE',
    'DAILY_RISK_LIMIT_OR_KILL_SWITCH',
    'LLM_PROVIDER_FAILURE',
    'BROWSER_TASK_FAILURE',
    'APP_RESTART_OR_DB_ERROR'
  ];

  test('1. Canonical Events: Handles all 9 required event types', async () => {
    for (const evt of CANONICAL_EVENTS) {
      const payload: TelegramAlertPayload = {
        eventType: evt,
        severity: evt.includes('FAILURE') || evt.includes('KILL_SWITCH') ? 'CRITICAL' : 'WARNING',
        component: 'IntegrationTester',
        summary: `Verification alert for ${evt}`,
        observedEvidence: `Evidence details for event ${evt}`,
        recommendedAction: 'Verify system logs'
      };

      const res = await telegramAlertManager.dispatchAlert(payload, { force: true });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.alertRecord.eventType, evt);
      assert.ok(res.alertRecord.summary.includes(evt));
    }
  });

  test('2. Deduplication & Cooldown: Suppresses duplicate alerts within 60s window', async () => {
    const payload: TelegramAlertPayload = {
      eventType: 'STRATEGY_BOT_FAILURE',
      severity: 'WARNING',
      component: 'Bot1_MomentumMaster',
      summary: 'EMA crossover indicator NaN detected',
      observedEvidence: 'NaN value on 5m bar',
      recommendedAction: 'Restart indicator state'
    };

    // First alert: dispatched (even if delivery fails due to placeholder token)
    const res1 = await telegramAlertManager.dispatchAlert(payload, { force: true });
    assert.strictEqual(res1.success, true);

    // Immediate second alert without force: throttled by cooldown!
    const res2 = await telegramAlertManager.dispatchAlert(payload, { force: false });
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.delivered, false);
    assert.ok(res2.alertRecord.deliveryError?.includes('COOLDOWN_ACTIVE'));
  });

  test('3. Secret Redaction: Protects PINs, passwords, and tokens from being sent in message text', async () => {
    const payload: TelegramAlertPayload = {
      eventType: 'BROKER_AUTH_SESSION_FAILURE',
      severity: 'CRITICAL',
      component: 'AngelOneAdapter',
      summary: 'Auth failed with pin: 1234 and password: SuperSecretPassword123',
      observedEvidence: 'Session token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisToken',
      recommendedAction: 'Re-authenticate locally'
    };

    const res = await telegramAlertManager.dispatchAlert(payload, { force: true });
    assert.strictEqual(res.success, true);

    // Verify secrets are scrubbed
    assert.ok(!res.alertRecord.summary.includes('1234'));
    assert.ok(!res.alertRecord.summary.includes('SuperSecretPassword123'));
    assert.ok(res.alertRecord.summary.includes('[REDACTED]'));
    assert.ok(!res.alertRecord.observedEvidence.includes('doNotLeakThisToken'));
    assert.ok(res.alertRecord.observedEvidence.includes('[REDACTED'));
  });

  test('4. Truthful Accounting: Failed deliveries recorded in failed queue without claiming success', async () => {
    telegramAlertManager.clearFailedAlerts();

    const payload: TelegramAlertPayload = {
      eventType: 'APP_RESTART_OR_DB_ERROR',
      severity: 'CRITICAL',
      component: 'DatabasePersistence',
      summary: 'Simulated connection test',
      observedEvidence: 'SQLite lock contention',
      recommendedAction: 'Inspect DB WAL file'
    };

    const res = await telegramAlertManager.dispatchAlert(payload, {
      force: true,
      botToken: 'invalid_dummy_token_123',
      chatId: 'invalid_chat_123'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.delivered, false, 'Must not claim delivery when token is invalid');
    assert.ok(res.alertRecord.deliveryError);

    // Must be recorded in failed queue
    const failedList = telegramAlertManager.getFailedAlerts();
    assert.ok(failedList.some((f) => f.id === res.alertRecord.id));
  });

  test('5. Connectivity Check: Validates token cleanly and rejects placeholder/unconfigured token', async () => {
    const testPlaceholder = await telegramAlertManager.testConnectivity('CONFIGURED_VIA_ENV');
    assert.strictEqual(testPlaceholder.ok, false);
    assert.ok(testPlaceholder.message.includes('not configured or contains placeholder'));

    const testUnconfigured = await telegramAlertManager.testConnectivity(undefined);
    assert.strictEqual(testUnconfigured.ok, false);
  });
});
