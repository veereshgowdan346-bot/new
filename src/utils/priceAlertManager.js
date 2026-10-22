/**
 * Price Alert Manager for Chintu AI Trading System
 * Tracks user-defined price thresholds for Entry and Exit strategies,
 * evaluates real-time ticks, and triggers visual and audio notifications.
 */

import { soundEngine } from './audioChime';
import { toastEmitter } from './toastEmitter';

const STORAGE_KEY = 'chintu_user_price_alerts';

export const ALERT_TYPES = {
  ENTRY: 'ENTRY',
  EXIT: 'EXIT'
};

export const ALERT_CONDITIONS = {
  ABOVE: 'ABOVE', // Price >= Target
  BELOW: 'BELOW'  // Price <= Target
};

export const ALERT_STATUSES = {
  ACTIVE: 'ACTIVE',
  TRIGGERED: 'TRIGGERED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  DISABLED: 'DISABLED'
};

// Initial preset alerts so the user has functional alerts ready on first launch
export const DEFAULT_ALERTS = [
  {
    id: 'alt_nifty_entry',
    symbol: 'NIFTY 50',
    type: ALERT_TYPES.ENTRY,
    condition: ALERT_CONDITIONS.ABOVE,
    targetPrice: 25150.00,
    note: 'SuperTrend 15m bullish breakout confirmation',
    status: ALERT_STATUSES.ACTIVE,
    soundEnabled: true,
    createdAt: new Date().toISOString(),
    triggeredAt: null,
    triggeredPrice: null,
    breachAmount: null
  },
  {
    id: 'alt_banknifty_exit',
    symbol: 'BANK NIFTY',
    type: ALERT_TYPES.EXIT,
    condition: ALERT_CONDITIONS.BELOW,
    targetPrice: 57800.00,
    note: 'Key intraday swing support breakdown exit safeguard',
    status: ALERT_STATUSES.ACTIVE,
    soundEnabled: true,
    createdAt: new Date().toISOString(),
    triggeredAt: null,
    triggeredPrice: null,
    breachAmount: null
  },
  {
    id: 'alt_reliance_entry',
    symbol: 'RELIANCE',
    type: ALERT_TYPES.ENTRY,
    condition: ALERT_CONDITIONS.ABOVE,
    targetPrice: 2980.00,
    note: 'Institutional accumulation channel breakout',
    status: ALERT_STATUSES.ACTIVE,
    soundEnabled: true,
    createdAt: new Date().toISOString(),
    triggeredAt: null,
    triggeredPrice: null,
    breachAmount: null
  },
  {
    id: 'alt_gold_exit',
    symbol: 'GOLD',
    type: ALERT_TYPES.EXIT,
    condition: ALERT_CONDITIONS.ABOVE,
    targetPrice: 62400.00,
    note: 'Bullion resistance zone - take profit target',
    status: ALERT_STATUSES.ACTIVE,
    soundEnabled: true,
    createdAt: new Date().toISOString(),
    triggeredAt: null,
    triggeredPrice: null,
    breachAmount: null
  }
];

class PriceAlertManager {
  constructor() {
    this.alerts = this.loadAlerts();
    this.subscribers = new Set();
    this.triggeredAlertsQueue = [];
  }

  loadAlerts() {
    if (typeof window === 'undefined') return DEFAULT_ALERTS;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[PriceAlertManager] Failed to load alerts from localStorage', e);
    }
    return DEFAULT_ALERTS;
  }

  saveAlerts(alerts) {
    this.alerts = alerts;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
      } catch (e) {
        console.error('[PriceAlertManager] Failed to save alerts to localStorage', e);
      }
    }
    this.notifySubscribers();
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    callback(this.alerts);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  notifySubscribers() {
    this.subscribers.forEach((cb) => {
      try {
        cb(this.alerts);
      } catch (err) {
        console.error('[PriceAlertManager] Subscriber callback error:', err);
      }
    });
  }

  getAlerts() {
    return [...this.alerts];
  }

  addAlert(alertData) {
    const newAlert = {
      id: `alt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      symbol: (alertData.symbol || 'NIFTY 50').trim().toUpperCase(),
      type: alertData.type || ALERT_TYPES.ENTRY,
      condition: alertData.condition || ALERT_CONDITIONS.ABOVE,
      targetPrice: Number(alertData.targetPrice) || 0,
      note: alertData.note || '',
      status: ALERT_STATUSES.ACTIVE,
      soundEnabled: alertData.soundEnabled !== false,
      createdAt: new Date().toISOString(),
      triggeredAt: null,
      triggeredPrice: null,
      breachAmount: null
    };

    const next = [newAlert, ...this.alerts];
    this.saveAlerts(next);
    return newAlert;
  }

  updateAlert(id, updates) {
    const next = this.alerts.map((alt) => {
      if (alt.id === id) {
        return { ...alt, ...updates };
      }
      return alt;
    });
    this.saveAlerts(next);
  }

  deleteAlert(id) {
    const next = this.alerts.filter((alt) => alt.id !== id);
    this.saveAlerts(next);
  }

  acknowledgeAlert(id) {
    const next = this.alerts.map((alt) => {
      if (alt.id === id) {
        return { ...alt, status: ALERT_STATUSES.ACKNOWLEDGED };
      }
      return alt;
    });
    this.saveAlerts(next);
  }

  resetAlert(id) {
    const next = this.alerts.map((alt) => {
      if (alt.id === id) {
        return {
          ...alt,
          status: ALERT_STATUSES.ACTIVE,
          triggeredAt: null,
          triggeredPrice: null,
          breachAmount: null
        };
      }
      return alt;
    });
    this.saveAlerts(next);
  }

  toggleAlertEnabled(id) {
    const next = this.alerts.map((alt) => {
      if (alt.id === id) {
        const nextStatus =
          alt.status === ALERT_STATUSES.DISABLED
            ? ALERT_STATUSES.ACTIVE
            : ALERT_STATUSES.DISABLED;
        return { ...alt, status: nextStatus };
      }
      return alt;
    });
    this.saveAlerts(next);
  }

  // Force trigger for user testing & verification in UI
  testTriggerAlert(id, simulatedPrice) {
    const alert = this.alerts.find((a) => a.id === id);
    if (!alert) return;

    const triggerPrice = simulatedPrice || (alert.condition === ALERT_CONDITIONS.ABOVE ? alert.targetPrice + 2.50 : alert.targetPrice - 2.50);
    this.fireAlert(alert, triggerPrice);
  }

  fireAlert(alert, currentPrice) {
    const now = new Date();
    const breachAmount = Number((currentPrice - alert.targetPrice).toFixed(2));

    const updatedAlert = {
      ...alert,
      status: ALERT_STATUSES.TRIGGERED,
      triggeredAt: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      triggeredTimestamp: now.getTime(),
      triggeredPrice: Number(currentPrice.toFixed(2)),
      breachAmount
    };

    // Update in memory & storage
    const next = this.alerts.map((a) => (a.id === alert.id ? updatedAlert : a));
    this.saveAlerts(next);

    // Audio chime
    if (alert.soundEnabled !== false) {
      if (alert.type === ALERT_TYPES.ENTRY) {
        soundEngine.playBuyChime();
      } else {
        soundEngine.playAlertChime();
      }
    }

    // Global toast system broadcast
    toastEmitter.emit({
      type: alert.type === ALERT_TYPES.ENTRY ? 'BUY' : 'ALERT',
      action: `${alert.type} ALERT`,
      symbol: alert.symbol,
      price: Number(currentPrice.toFixed(2)),
      strategy: `Threshold: ₹${alert.targetPrice} (${alert.condition})`,
      quorum: alert.note || `${alert.type} threshold breached`,
      latency: 'Instant Tick Watcher',
      durationMs: 7000
    });

    return updatedAlert;
  }

  /**
   * Continuous real-time evaluation against a dictionary of prices.
   * priceMap: { [symbolKey]: number } e.g. { "NIFTY 50": 25152.00, "RELIANCE": 2982.50 }
   */
  evaluatePriceTicks(priceMap, onTriggered) {
    if (!priceMap || typeof priceMap !== 'object') return [];

    const newlyTriggered = [];
    const activeAlerts = this.alerts.filter((a) => a.status === ALERT_STATUSES.ACTIVE);

    // Normalize keys in priceMap for fuzzy/exact matching
    const normalizedPriceMap = {};
    Object.entries(priceMap).forEach(([sym, price]) => {
      if (typeof price === 'number' && !isNaN(price)) {
        normalizedPriceMap[sym.trim().toUpperCase()] = price;
        // Also strip spaces (e.g. NIFTY50 vs NIFTY 50)
        normalizedPriceMap[sym.replace(/\s+/g, '').toUpperCase()] = price;
      }
    });

    activeAlerts.forEach((alert) => {
      const sym = alert.symbol.trim().toUpperCase();
      const symNoSpace = sym.replace(/\s+/g, '');
      const currentPrice = normalizedPriceMap[sym] ?? normalizedPriceMap[symNoSpace];

      if (currentPrice === undefined) return;

      let hasBreached = false;
      if (alert.condition === ALERT_CONDITIONS.ABOVE && currentPrice >= alert.targetPrice) {
        hasBreached = true;
      } else if (alert.condition === ALERT_CONDITIONS.BELOW && currentPrice <= alert.targetPrice) {
        hasBreached = true;
      }

      if (hasBreached) {
        const triggered = this.fireAlert(alert, currentPrice);
        newlyTriggered.push(triggered);
        if (onTriggered) onTriggered(triggered);
      }
    });

    return newlyTriggered;
  }
}

export const priceAlertManager = new PriceAlertManager();
