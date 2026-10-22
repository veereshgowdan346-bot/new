/**
 * Global Toast Emitter for Chintu AI Trading System
 * Dispatches real-time events for trade executions, bot decisions, and system alerts.
 */

class ToastEmitter {
  constructor() {
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(toast) {
    const payload = {
      id: toast.id || `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: toast.type || toast.action || 'BUY',
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

    // Also dispatch as custom window DOM event for non-react or external handlers
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('chintu:trade-toast', { detail: payload }));
    }
  }

  // Helper method specifically for Decision Network trade execution alerts
  emitTradeExecution(trade = {}) {
    this.emit({
      action: trade.action || 'BUY',
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
      ...trade
    });
  }

  // Helper method for Emergency Stop & All-Positions Square-off alert
  emitEmergencyStop(details = {}) {
    this.emit({
      action: 'EMERGENCY_STOP',
      type: 'EMERGENCY_STOP',
      symbol: details.symbol || 'ALL ASSETS',
      price: 'SQUARE-OFF',
      qty: details.count || 0,
      botName: 'RMS CIRCUIT BREAKER',
      strategy: details.message || 'Immediate All-Positions Square-Off Activated',
      quorum: 'RMS OVERRIDE',
      consensusRate: '100%',
      executionMode: details.executionMode || 'BROKER API',
      latency: '0.8ms FASTPATH',
      durationMs: 7000,
      ...details
    });
  }
}

export const toastEmitter = new ToastEmitter();
