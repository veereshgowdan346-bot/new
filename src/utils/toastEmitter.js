/**
 * Global Toast Emitter for Chintu AI Trading System
 * Dispatches real-time events for system notifications, trade executions,
 * bot decisions, and RMS circuit breaker alerts.
 */

class ToastEmitter {
  constructor() {
    this.listeners = new Set();
  }

  /**
   * Subscribe a listener callback to toast events.
   * @param {(toast: Record<string, any>) => void} listener
   * @returns {() => void} unsubscribe function
   */
  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Core broadcast dispatcher. Dispatches to all active subscribers
   * and dispatches a CustomEvent on window for cross-framework interoperability.
   */
  emit(toast) {
    if (!toast) return;

    const payload = {
      id: toast.id || `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: toast.type || toast.action || 'info',
      time: toast.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      durationMs: toast.durationMs || 5000,
      ...toast
    };

    this.listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (err) {
        console.error('[ToastEmitter] Listener error:', err);
      }
    });

    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('chintu:trade-toast', { detail: payload }));
      } catch {
        // Safe in restricted or test environments
      }
    }
  }

  /**
   * Primary method for standard system notifications (success, error, info, warning).
   * Used by Views, Modals, Forms, and Health Monitors across the application.
   *
   * @param {{ title?: string; message?: string; type?: 'success'|'error'|'warning'|'info'; durationMs?: number; [key: string]: any } | string} toast
   */
  emitToast(toast = {}) {
    if (typeof toast === 'string') {
      toast = { message: toast, title: 'Notification', type: 'info' };
    }
    this.emit({
      id: toast.id || `sys_toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: toast.title || 'System Notification',
      message: toast.message || '',
      type: (toast.type || 'info').toLowerCase(),
      durationMs: toast.durationMs || 5000,
      isSystemNotification: true,
      ...toast
    });
  }

  /**
   * Helper method specifically for Decision Network trade execution alerts.
   */
  emitTradeExecution(trade = {}) {
    this.emit({
      id: trade.id || `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action: trade.action || 'BUY',
      type: (trade.action || 'BUY').toUpperCase(),
      symbol: trade.symbol || 'NIFTY 50',
      price: trade.price || 25146.30,
      qty: trade.qty || 50,
      botId: trade.botId || 1,
      botName: trade.botName || 'Scalper Bot',
      strategy: trade.strategy || 'Micro Momentum Scalp (SuperTrend + MACD)',
      consensusRate: trade.consensusRate || '92.8%',
      quorum: trade.quorum || '12/14 Approved',
      executionMode: trade.executionMode || 'PAPER',
      latency: trade.latency || '2.1ms IPC',
      durationMs: trade.durationMs || 5000,
      ...trade
    });
  }

  /**
   * Helper method for Emergency Stop & All-Positions Square-off alert.
   */
  emitEmergencyStop(details = {}) {
    this.emit({
      id: details.id || `kill_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action: 'EMERGENCY_STOP',
      type: 'EMERGENCY_STOP',
      title: details.title || 'RMS CIRCUIT BREAKER ENGAGED',
      message: details.message || 'Immediate All-Positions Square-Off Activated',
      symbol: details.symbol || 'ALL ASSETS',
      price: 'SQUARE-OFF',
      qty: details.count || 0,
      botName: 'RMS CIRCUIT BREAKER',
      strategy: details.message || 'Autonomous Liquidation Executed',
      quorum: 'RMS OVERRIDE',
      consensusRate: '100%',
      executionMode: details.executionMode || 'BROKER API',
      latency: '0.8ms FASTPATH',
      durationMs: details.durationMs || 7000,
      ...details
    });
  }

  /**
   * Helper method for technical indicator and Decision Network veto/trigger alerts.
   */
  emitAlertTriggered(alert = {}) {
    this.emit({
      id: alert.id || `alert_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action: 'ALERT_TRIGGERED',
      type: alert.type || 'warning',
      title: alert.title || 'Decision Mesh Alert',
      message: alert.message || alert.rationale || 'Condition triggered across market scanner.',
      symbol: alert.symbol || 'NIFTY 50',
      durationMs: alert.durationMs || 5500,
      ...alert
    });
  }

  // Shorthand convenience methods
  success(title, message, durationMs = 5000) {
    this.emitToast({ title, message, type: 'success', durationMs });
  }

  error(title, message, durationMs = 6000) {
    this.emitToast({ title, message, type: 'error', durationMs });
  }

  warning(title, message, durationMs = 5000) {
    this.emitToast({ title, message, type: 'warning', durationMs });
  }

  info(title, message, durationMs = 4000) {
    this.emitToast({ title, message, type: 'info', durationMs });
  }
}

export const toastEmitter = new ToastEmitter();
