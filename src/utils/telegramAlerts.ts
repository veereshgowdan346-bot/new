/**
 * CHINTU AI — TELEGRAM MONITORING & INSTITUTIONAL ALERT MANAGER
 *
 * Implements secure, testable Telegram alert delivery with:
 * 1. 9 Canonical Alert Event Categories:
 *    - Broker authentication or session failures
 *    - Market-data disconnection, stale quotes, reconnect events
 *    - Strategy and bot failures
 *    - Master Brain quorum failures and risk rejections
 *    - Paper-order creation, cancellation, closure, execution errors
 *    - Daily risk-limit breaches and emergency-stop activation
 *    - Gemini / LLM provider failures
 *    - Chromium / browser task failures
 *    - Unexpected application restarts and database errors
 * 2. Deduplication and Cooldown Windows (prevents alert storms).
 * 3. Secret Redaction (never sends API keys, PINs, or TOTP secrets).
 * 4. Truthful Delivery Tracking (records local failures when offline; exposes to Jarvis & Dashboard).
 */

export type TelegramAlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type TelegramEventType =
  | 'BROKER_AUTH_SESSION_FAILURE'
  | 'MARKET_DATA_DISCONNECT_OR_STALE'
  | 'STRATEGY_BOT_FAILURE'
  | 'QUORUM_FAILURE_OR_RISK_REJECTION'
  | 'PAPER_ORDER_LIFECYCLE'
  | 'DAILY_RISK_LIMIT_OR_KILL_SWITCH'
  | 'LLM_PROVIDER_FAILURE'
  | 'BROWSER_TASK_FAILURE'
  | 'APP_RESTART_OR_DB_ERROR';

export interface TelegramAlertPayload {
  eventType: TelegramEventType;
  severity: TelegramAlertSeverity;
  component: string;
  summary: string;
  observedEvidence: string;
  recommendedAction: string;
  metadata?: Record<string, any>;
  force?: boolean;
}

export interface TelegramAlertRecord {
  id: string;
  timestamp: string;
  eventType: TelegramEventType;
  severity: TelegramAlertSeverity;
  component: string;
  summary: string;
  observedEvidence: string;
  recommendedAction: string;
  delivered: boolean;
  deliveryError?: string;
  attemptCount: number;
}

export class TelegramAlertManager {
  private static instance: TelegramAlertManager;
  private alertHistory: TelegramAlertRecord[] = [];
  private failedAlertsQueue: TelegramAlertRecord[] = [];
  private lastAlertTimestamps: Map<string, number> = new Map();
  private readonly cooldownMs: number = 60000; // 60s cooldown per event + component signature

  public static getInstance(): TelegramAlertManager {
    if (!TelegramAlertManager.instance) {
      TelegramAlertManager.instance = new TelegramAlertManager();
    }
    return TelegramAlertManager.instance;
  }

  /**
   * Dispatches a structured, deduped alert to Telegram.
   */
  public async dispatchAlert(
    payload: TelegramAlertPayload,
    options?: { force?: boolean; botToken?: string; chatId?: string }
  ): Promise<{ success: boolean; delivered: boolean; alertRecord: TelegramAlertRecord; cooldownActive?: boolean }> {
    const alertId = `tlg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const now = Date.now();
    const signature = `${payload.eventType}_${payload.component}`;

    // 1. DEDUPLICATION & COOLDOWN GUARD
    const lastSent = this.lastAlertTimestamps.get(signature) || 0;
    if (!options?.force && now - lastSent < this.cooldownMs) {
      const skippedRecord: TelegramAlertRecord = {
        id: alertId,
        timestamp: new Date().toISOString(),
        eventType: payload.eventType,
        severity: payload.severity,
        component: payload.component,
        summary: payload.summary,
        observedEvidence: payload.observedEvidence,
        recommendedAction: payload.recommendedAction,
        delivered: false,
        deliveryError: `COOLDOWN_ACTIVE: Alert throttled (cooldown ${this.cooldownMs / 1000}s active for ${signature})`,
        attemptCount: 0
      };
      this.alertHistory.unshift(skippedRecord);
      return { success: true, delivered: false, cooldownActive: true, alertRecord: skippedRecord };
    }
    this.lastAlertTimestamps.set(signature, now);

    // 2. SANITIZE & REDACT SECRETS
    const sanitizedEvidence = this.redactSensitiveData(payload.observedEvidence);
    const sanitizedSummary = this.redactSensitiveData(payload.summary);

    // 3. COMPOSE TELEGRAM MESSAGE FORMAT
    const icon = payload.severity === 'CRITICAL' ? '🚨' : payload.severity === 'WARNING' ? '⚠️' : 'ℹ️';
    const messageText =
      `${icon} *CHINTU AI QUANT ALERT* [${payload.severity}]\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• *Event*: \`${payload.eventType}\`\n` +
      `• *Component*: \`${payload.component}\`\n` +
      `• *Summary*: ${sanitizedSummary}\n` +
      `• *Evidence*: ${sanitizedEvidence}\n` +
      `• *Action*: ${payload.recommendedAction}\n` +
      `• *Time*: ${new Date().toLocaleTimeString('en-IN')} IST`;

    // 4. ATTEMPT TELEGRAM NETWORK DELIVERY
    const botToken = options?.botToken || process.env.CHINTU_TELEGRAM_BOT_TOKEN;
    const chatId = options?.chatId || process.env.CHINTU_TELEGRAM_CHAT_ID;

    let delivered = false;
    let deliveryError: string | undefined;

    if (botToken && chatId && !botToken.includes('***') && botToken !== 'CONFIGURED_VIA_ENV') {
      try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: messageText,
            parse_mode: 'Markdown'
          })
        });

        const data: any = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          delivered = true;
          this.lastAlertTimestamps.set(signature, now);
        } else {
          deliveryError = `Telegram API Error: ${data.description || res.statusText}`;
        }
      } catch (err: any) {
        deliveryError = `Network Error: ${err.message}`;
      }
    } else {
      deliveryError = 'Telegram bot token or chat ID unconfigured or placeholder.';
    }

    // 5. RECORD RESULT (Truthful Accounting)
    const alertRecord: TelegramAlertRecord = {
      id: alertId,
      timestamp: new Date().toISOString(),
      eventType: payload.eventType,
      severity: payload.severity,
      component: payload.component,
      summary: sanitizedSummary,
      observedEvidence: sanitizedEvidence,
      recommendedAction: payload.recommendedAction,
      delivered,
      deliveryError,
      attemptCount: 1
    };

    this.alertHistory.unshift(alertRecord);
    if (this.alertHistory.length > 200) this.alertHistory.pop();

    if (!delivered) {
      this.failedAlertsQueue.unshift(alertRecord);
      if (this.failedAlertsQueue.length > 50) this.failedAlertsQueue.pop();
    }

    return {
      success: true,
      delivered,
      alertRecord
    };
  }

  /**
   * Verifies Telegram bot connectivity using the official getMe endpoint.
   */
  public async testConnectivity(botToken?: string): Promise<{ ok: boolean; message: string; botInfo?: any }> {
    const token = botToken || process.env.CHINTU_TELEGRAM_BOT_TOKEN;
    if (!token || token.includes('***') || token === 'CONFIGURED_VIA_ENV') {
      return {
        ok: false,
        message: 'Telegram bot token is not configured or contains placeholder string.'
      };
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data: any = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        return {
          ok: true,
          message: `Telegram Bot @${data.result.username} successfully connected.`,
          botInfo: data.result
        };
      }
      return {
        ok: false,
        message: `Telegram getMe failed: ${data.description || res.statusText}`
      };
    } catch (err: any) {
      return {
        ok: false,
        message: `Network failure connecting to Telegram: ${err.message}`
      };
    }
  }

  public getRecentAlerts(limit: number = 20): TelegramAlertRecord[] {
    return this.alertHistory.slice(0, limit);
  }

  public getFailedAlerts(): TelegramAlertRecord[] {
    return [...this.failedAlertsQueue];
  }

  public clearFailedAlerts(): void {
    this.failedAlertsQueue = [];
  }

  /**
   * Redacts passwords, API keys, PINs, and TOTP secrets from message prose.
   */
  private redactSensitiveData(text: string): string {
    if (!text) return '';
    return text
      .replace(/ey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_.-]{4,}/g, '[REDACTED_JWT]')
      .replace(/\btoken\s*[:=]\s*\S+/gi, 'token: [REDACTED_TOKEN]')
      .replace(/\b[A-Za-z0-9]{32,}\b/g, '[REDACTED_SECRET]')
      .replace(/\bpin\s*[:=]\s*\d{4,6}/gi, 'PIN: [REDACTED]')
      .replace(/\bpassword\s*[:=]\s*\S+/gi, 'Password: [REDACTED]')
      .replace(/\btotp\s*[:=]\s*\S+/gi, 'TOTP: [REDACTED]')
      .replace(/\bjwtToken\s*[:=]\s*\S+/gi, 'JWT: [REDACTED]');
  }
}

export const telegramAlertManager = TelegramAlertManager.getInstance();
