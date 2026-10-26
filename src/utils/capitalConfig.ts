/**
 * Chintu AI - Institutional Unified Paper Capital Configuration
 * Provides a single source of truth for simulated paper capital across all views.
 * Reconciles MasterDashboardView (previously ₹1,00,000) and TradingDashboard (previously ₹2,50,000).
 * Explicitly labels simulated paper capital to prevent any confusion with real broker funds.
 */

export const DEFAULT_PAPER_CAPITAL = 100000; // ₹1,00,000 Base Paper Capital
export const CAPITAL_DISCLAIMER = 'SIMULATED PAPER CAPITAL — NOT REAL BROKER FUNDS';

export function getPaperCapital(): number {
  if (typeof window === 'undefined') return DEFAULT_PAPER_CAPITAL;
  try {
    const saved = localStorage.getItem('chintu_paper_capital');
    if (saved) {
      const parsed = Number(saved);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch (e) {
    // Fallback on error
  }
  return DEFAULT_PAPER_CAPITAL;
}

export function setPaperCapital(amount: number): void {
  if (typeof window === 'undefined') return;
  try {
    if (amount > 0) {
      localStorage.setItem('chintu_paper_capital', amount.toString());
      window.dispatchEvent(new Event('chintu_capital_updated'));
    }
  } catch (e) {
    // Fallback on error
  }
}

