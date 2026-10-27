/**
 * Chintu AI - Institutional Unified Paper Capital & Multi-Asset Partition Configuration
 *
 * Anti-Gravity Framework Specification:
 * - Single source of truth for capital configuration across all views.
 * - Seed Capital Partitioning: Enforces dedicated capital partitions prior to trade execution:
 *   * GOLD (MCX Bullion): 20% dedicated partition
 *   * SILVER (MCX Bullion): 15% dedicated partition
 *   * INDICES (NIFTY, BANKNIFTY, SENSEX): 35% dedicated partition
 *   * EQUITIES (Bluechip & High-Beta): 30% dedicated partition
 * - Rigorous Risk Controls: Maximum 2% risk budget per trade, 25% single-asset exposure limit.
 * - Trailing Stop-Loss Engine: Dynamically trails stop-loss upward to lock in profits.
 * - Explicit labels to prevent confusion with real broker funds.
 */

export const DEFAULT_PAPER_CAPITAL = 100000; // ₹1,00,000 Base Paper Capital
export const CAPITAL_DISCLAIMER = 'SIMULATED PAPER CAPITAL — NOT REAL BROKER FUNDS';

export type AssetCategory = 'GOLD' | 'SILVER' | 'INDICES' | 'EQUITIES';

export interface CapitalPartitionAllocation {
  gold: number;      // 20%
  silver: number;    // 15%
  indices: number;   // 35%
  equities: number;  // 30%
}

export const DEFAULT_PARTITION_RATIOS: CapitalPartitionAllocation = {
  gold: 0.20,
  silver: 0.15,
  indices: 0.35,
  equities: 0.30
};

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

/**
 * Categorizes any symbol into its respective multi-asset class.
 */
export function classifyAssetCategory(symbol: string): AssetCategory {
  const sym = symbol.toUpperCase();
  if (sym.includes('GOLD')) return 'GOLD';
  if (sym.includes('SILVER')) return 'SILVER';
  if (sym.includes('NIFTY') || sym.includes('BANKNIFTY') || sym.includes('SENSEX') || sym.includes('FINNIFTY') || /(?:^|\s|-|_)(?:CE|PE)(?:$|\s|-|_)/.test(sym)) {
    return 'INDICES';
  }
  return 'EQUITIES';
}

/**
 * Calculates seed capital partitions and maximum allowable trade sizing.
 */
export function getAssetCapitalPartition(symbol: string, totalCapital = getPaperCapital()): {
  category: AssetCategory;
  partitionRatio: number;
  allocatedCapital: number;
  maxTradeRiskBudget: number;      // 2% of allocated partition
  maxSinglePositionCap: number;    // 25% of total capital
} {
  const category = classifyAssetCategory(symbol);
  let ratio = DEFAULT_PARTITION_RATIOS.equities;

  if (category === 'GOLD') ratio = DEFAULT_PARTITION_RATIOS.gold;
  else if (category === 'SILVER') ratio = DEFAULT_PARTITION_RATIOS.silver;
  else if (category === 'INDICES') ratio = DEFAULT_PARTITION_RATIOS.indices;

  const allocatedCapital = Number((totalCapital * ratio).toFixed(2));
  const maxTradeRiskBudget = Number((allocatedCapital * 0.02).toFixed(2)); // 2% risk budget
  const maxSinglePositionCap = Number((totalCapital * 0.25).toFixed(2));   // 25% exposure cap

  return {
    category,
    partitionRatio: ratio,
    allocatedCapital,
    maxTradeRiskBudget,
    maxSinglePositionCap
  };
}

/**
 * Validates whether a proposed trade complies with seed capital partitions and risk bounds.
 */
export function validateTradeCapitalPartition(
  symbol: string,
  requestedMargin: number,
  tradeRiskAmount: number,
  totalCapital = getPaperCapital()
): { allowed: boolean; reason?: string; partitionInfo: any } {
  const partition = getAssetCapitalPartition(symbol, totalCapital);

  // 1. Single-Asset 25% Concentration Cap
  if (requestedMargin > partition.maxSinglePositionCap) {
    return {
      allowed: false,
      reason: `Concentration Cap Exceeded: Requested margin ₹${requestedMargin.toFixed(2)} exceeds 25% single-asset cap of ₹${partition.maxSinglePositionCap.toFixed(2)}.`,
      partitionInfo: partition
    };
  }

  // 2. Risk Budget 2% Limit
  if (tradeRiskAmount > partition.maxTradeRiskBudget) {
    return {
      allowed: false,
      reason: `Risk Budget Exceeded: Trade risk ₹${tradeRiskAmount.toFixed(2)} exceeds 2% partition risk budget of ₹${partition.maxTradeRiskBudget.toFixed(2)}.`,
      partitionInfo: partition
    };
  }

  // 3. Partition Capital Ceiling
  if (requestedMargin > partition.allocatedCapital) {
    return {
      allowed: false,
      reason: `Seed Partition Exceeded: Requested margin ₹${requestedMargin.toFixed(2)} exceeds total ${partition.category} partition of ₹${partition.allocatedCapital.toFixed(2)}.`,
      partitionInfo: partition
    };
  }

  return {
    allowed: true,
    partitionInfo: partition
  };
}

/**
 * Trailing Stop-Loss Calculator to protect and lock in 70%-80% target profits.
 */
export function calculateTrailingStopLoss(
  action: 'BUY' | 'SELL',
  entryPrice: number,
  highestPriceSinceEntry: number,
  lowestPriceSinceEntry: number,
  currentPrice: number,
  trailStepPct = 0.005 // 0.5% trail step
): { trailingStopPrice: number; lockedProfitPct: number; isTriggered: boolean } {
  if (action === 'BUY') {
    const profitDelta = highestPriceSinceEntry - entryPrice;
    let trailingStopPrice = entryPrice * 0.995; // initial stop

    if (profitDelta > 0) {
      // Trail stop upward behind peak price
      const dynamicStop = highestPriceSinceEntry * (1 - trailStepPct);
      trailingStopPrice = Math.max(trailingStopPrice, dynamicStop);
    }

    const lockedProfitPct = ((trailingStopPrice - entryPrice) / entryPrice) * 100;
    const isTriggered = currentPrice <= trailingStopPrice;

    return {
      trailingStopPrice: Number(trailingStopPrice.toFixed(2)),
      lockedProfitPct: Number(lockedProfitPct.toFixed(2)),
      isTriggered
    };
  } else {
    const profitDelta = entryPrice - lowestPriceSinceEntry;
    let trailingStopPrice = entryPrice * 1.005; // initial stop

    if (profitDelta > 0) {
      const dynamicStop = lowestPriceSinceEntry * (1 + trailStepPct);
      trailingStopPrice = Math.min(trailingStopPrice, dynamicStop);
    }

    const lockedProfitPct = ((entryPrice - trailingStopPrice) / entryPrice) * 100;
    const isTriggered = currentPrice >= trailingStopPrice;

    return {
      trailingStopPrice: Number(trailingStopPrice.toFixed(2)),
      lockedProfitPct: Number(lockedProfitPct.toFixed(2)),
      isTriggered
    };
  }
}
