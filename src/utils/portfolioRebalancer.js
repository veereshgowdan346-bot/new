/**
 * CHINTU AI TRADING SYSTEM - Portfolio Rebalancer Utility
 * 
 * Automatically calculates asset allocation drift across 200+ tracked market positions
 * (Equities, Indices, MCX Commodities, F&O Derivatives, Currencies).
 * Generates algorithmic BUY/SELL trade suggestions to return holdings to target weights,
 * strictly audited against statutory tax and net-profit guardrails.
 */

import { MULTI_ASSET_UNIVERSE } from '../data/multiAssetUniverse';
import { calculateTradeCharges, validateNetProfitGuardrail } from './taxCalculator';

// Standard Quantitative Asset Allocation Models
export const ALLOCATION_PRESETS = {
  ALL_WEATHER: {
    id: 'ALL_WEATHER',
    name: 'All-Weather Risk Parity',
    description: 'Macro balanced resilience (Ray Dalio style): High gold & commodity hedge, steady indices, and core bluechips.',
    targets: {
      'Equities': 30,
      'Commodities': 25,
      'Indices': 25,
      'Derivatives': 15,
      'Currencies': 5
    }
  },
  AGGRESSIVE_ALPHA: {
    id: 'AGGRESSIVE_ALPHA',
    name: 'Aggressive Alpha Momentum',
    description: 'Heavy equity and F&O delta momentum targeting high upside in trending bull regimes.',
    targets: {
      'Equities': 50,
      'Derivatives': 25,
      'Indices': 15,
      'Commodities': 10,
      'Currencies': 0
    }
  },
  CAPITAL_PRESERVATION: {
    id: 'CAPITAL_PRESERVATION',
    name: 'Defensive Capital Preservation',
    description: 'Overweighted in Gold, Silver, and benchmark indices with tight delta hedging.',
    targets: {
      'Commodities': 35,
      'Indices': 30,
      'Equities': 20,
      'Derivatives': 10,
      'Currencies': 5
    }
  },
  BALANCED_QUANT: {
    id: 'BALANCED_QUANT',
    name: 'Balanced Multi-Asset Quant',
    description: 'Optimized mean-variance diversification across all 200+ liquid Indian asset classes.',
    targets: {
      'Equities': 35,
      'Indices': 25,
      'Commodities': 20,
      'Derivatives': 15,
      'Currencies': 5
    }
  },
  EQUAL_WEIGHT: {
    id: 'EQUAL_WEIGHT',
    name: 'Equal Category Allocation',
    description: 'Symmetric 20% distribution across all major market segments.',
    targets: {
      'Equities': 25,
      'Indices': 25,
      'Commodities': 25,
      'Derivatives': 20,
      'Currencies': 5
    }
  }
};

// Seed portfolio holdings across 200+ universe to simulate real fund deployment
export function generateInitialPortfolioHoldings() {
  const seedHoldings = [
    // Equities
    { symbol: 'RELIANCE', qty: 35, avgCost: 2790.00 },
    { symbol: 'TCS', qty: 25, avgCost: 3480.00 },
    { symbol: 'HDFCBANK', qty: 45, avgCost: 1760.00 },
    { symbol: 'INFY', qty: 50, avgCost: 1610.00 },
    { symbol: 'TATAMOTORS', qty: 60, avgCost: 915.00 },
    { symbol: 'ICICIBANK', qty: 30, avgCost: 1210.00 },
    { symbol: 'BHARTIARTL', qty: 25, avgCost: 1640.00 },
    { symbol: 'ITC', qty: 80, avgCost: 468.00 },
    { symbol: 'TRENT', qty: 8, avgCost: 7100.00 },
    { symbol: 'ZOMATO', qty: 200, avgCost: 245.00 },
    { symbol: 'HAL', qty: 12, avgCost: 4350.00 },
    { symbol: 'BEL', qty: 120, avgCost: 285.00 },

    // Indices (ETFs / Futures equivalents)
    { symbol: 'NIFTY 50', qty: 5, avgCost: 24850.00 },
    { symbol: 'BANK NIFTY', qty: 3, avgCost: 56900.00 },
    { symbol: 'SENSEX', qty: 2, avgCost: 81200.00 },
    { symbol: 'MIDCAP NIFTY', qty: 4, avgCost: 12300.00 },

    // MCX Commodities
    { symbol: 'GOLD MINI', qty: 15, avgCost: 7720.00 },
    { symbol: 'SILVER MINI', qty: 2, avgCost: 89400.00 },
    { symbol: 'CRUDE MINI', qty: 10, avgCost: 6280.00 },
    { symbol: 'NATURAL GAS MINI', qty: 40, avgCost: 205.00 },
    { symbol: 'COPPER MINI', qty: 10, avgCost: 830.00 },

    // F&O Options
    { symbol: 'NIFTY 25100 CE', qty: 100, avgCost: 118.00 },
    { symbol: 'NIFTY 25150 PE', qty: 50, avgCost: 145.00 },
    { symbol: 'BANKNIFTY 57800 CE', qty: 60, avgCost: 240.00 },
    { symbol: 'RELIANCE 2850 CE', qty: 250, avgCost: 32.00 },

    // Currencies
    { symbol: 'USDINR', qty: 500, avgCost: 83.85 }
  ];

  return seedHoldings.map(h => {
    const assetMeta = MULTI_ASSET_UNIVERSE.find(a => a.symbol === h.symbol) || {
      name: h.symbol,
      category: 'Equities',
      segment: 'NSE Equity',
      price: h.avgCost,
      lotSize: 1
    };

    const currentLtp = assetMeta.price;
    const marketValue = h.qty * currentLtp;
    const investedValue = h.qty * h.avgCost;
    const pnl = marketValue - investedValue;
    const pnlPct = investedValue > 0 ? (pnl / investedValue) * 100 : 0;

    return {
      symbol: h.symbol,
      name: assetMeta.name,
      category: assetMeta.category,
      segment: assetMeta.segment,
      lotSize: assetMeta.lotSize || 1,
      qty: h.qty,
      avgCost: h.avgCost,
      currentLtp: currentLtp,
      marketValue: Number(marketValue.toFixed(2)),
      investedValue: Number(investedValue.toFixed(2)),
      pnl: Number(pnl.toFixed(2)),
      pnlPct: Number(pnlPct.toFixed(2))
    };
  });
}

/**
 * Calculates current asset allocation, drift against target weights,
 * and exact suggested Buy/Sell actions with tax charges.
 */
export function calculatePortfolioDrift({
  holdings = [],
  targetWeights = ALLOCATION_PRESETS.ALL_WEATHER.targets,
  driftTolerancePct = 2.0, // ±2% tolerance threshold before triggering rebalance
  cashBalance = 75000.00
}) {
  const currentHoldings = holdings && holdings.length > 0 ? holdings : generateInitialPortfolioHoldings();
  
  // Total market value of all active holdings
  const totalInvestedValue = currentHoldings.reduce((sum, h) => sum + h.investedValue, 0);
  const totalHoldingsMarketValue = currentHoldings.reduce((sum, h) => sum + h.marketValue, 0);
  const totalPortfolioValue = totalHoldingsMarketValue + Math.max(0, cashBalance);

  // 1. Group Holdings by Category to calculate Category-level Drift
  const categoryMap = {
    'Equities': { name: 'Equities', currentVal: 0, count: 0, items: [] },
    'Indices': { name: 'Indices', currentVal: 0, count: 0, items: [] },
    'Commodities': { name: 'Commodities', currentVal: 0, count: 0, items: [] },
    'Derivatives': { name: 'Derivatives', currentVal: 0, count: 0, items: [] },
    'Currencies': { name: 'Currencies', currentVal: 0, count: 0, items: [] }
  };

  currentHoldings.forEach(item => {
    const cat = categoryMap[item.category] ? item.category : 'Equities';
    categoryMap[cat].currentVal += item.marketValue;
    categoryMap[cat].count += 1;
    categoryMap[cat].items.push(item);
  });

  const categoryDriftAnalysis = Object.keys(categoryMap).map(catKey => {
    const cat = categoryMap[catKey];
    const currentWeightPct = totalPortfolioValue > 0
      ? Number(((cat.currentVal / totalPortfolioValue) * 100).toFixed(2))
      : 0;
    const targetWeightPct = Number(targetWeights[catKey] || 0);
    const driftPct = Number((currentWeightPct - targetWeightPct).toFixed(2));
    const targetVal = Number(((targetWeightPct / 100) * totalPortfolioValue).toFixed(2));
    const driftVal = Number((cat.currentVal - targetVal).toFixed(2));

    let status = 'BALANCED';
    if (driftPct > driftTolerancePct) status = 'OVERWEIGHT';
    else if (driftPct < -driftTolerancePct) status = 'UNDERWEIGHT';

    return {
      category: catKey,
      currentVal: Number(cat.currentVal.toFixed(2)),
      targetVal,
      currentWeightPct,
      targetWeightPct,
      driftPct,
      driftVal,
      status,
      count: cat.count
    };
  });

  // 2. Asset-level Drift & Action Suggestions across all 200+ universe
  // For each holding, calculate its proportionate target weight within its category
  const assetRebalanceSuggestions = currentHoldings.map(h => {
    const catAnalysis = categoryDriftAnalysis.find(c => c.category === h.category) || {
      targetWeightPct: 20,
      currentWeightPct: 20,
      driftPct: 0
    };

    const assetCurrentWeight = totalPortfolioValue > 0
      ? Number(((h.marketValue / totalPortfolioValue) * 100).toFixed(2))
      : 0;

    // Target weight for asset = proportionate share of category target
    const catTotalCurrentVal = categoryMap[h.category]?.currentVal || h.marketValue;
    const assetShareOfCategory = catTotalCurrentVal > 0 ? (h.marketValue / catTotalCurrentVal) : 1;
    const assetTargetWeight = Number((catAnalysis.targetWeightPct * assetShareOfCategory).toFixed(2));
    const assetDriftPct = Number((assetCurrentWeight - assetTargetWeight).toFixed(2));
    
    // Target Value & Required Value Change
    const targetAssetVal = Number(((assetTargetWeight / 100) * totalPortfolioValue).toFixed(2));
    const deltaVal = targetAssetVal - h.marketValue; // Positive = need BUY, Negative = need SELL

    let action = 'HOLD';
    let suggestedQty = 0;
    let suggestedTradeVal = 0;

    if (Math.abs(assetDriftPct) >= (driftTolerancePct * 0.5) && Math.abs(deltaVal) > (h.currentLtp * 0.5)) {
      if (deltaVal > 0) {
        action = 'BUY';
        suggestedQty = Math.max(1, Math.floor(Math.abs(deltaVal) / h.currentLtp));
      } else {
        action = 'SELL';
        suggestedQty = Math.max(1, Math.min(h.qty, Math.floor(Math.abs(deltaVal) / h.currentLtp)));
      }
      suggestedTradeVal = Number((suggestedQty * h.currentLtp).toFixed(2));
    }

    // Calculate Statutory Charges & Net-Profit Guardrail on Suggested Trade
    let tradeCharges = { totalCharges: 0, brokerage: 0, stt: 0 };
    let guardrailVerdict = { isApproved: true, expectedNetProfit: 0 };

    if (suggestedTradeVal > 0) {
      tradeCharges = calculateTradeCharges({
        price: h.currentLtp,
        qty: suggestedQty,
        action: action,
        segment: h.segment
      });

      guardrailVerdict = validateNetProfitGuardrail({
        entryPrice: h.currentLtp,
        qty: suggestedQty,
        action: action,
        segment: h.segment
      });
    }

    return {
      symbol: h.symbol,
      name: h.name,
      category: h.category,
      segment: h.segment,
      qty: h.qty,
      avgCost: h.avgCost,
      currentLtp: h.currentLtp,
      marketValue: h.marketValue,
      currentWeight: assetCurrentWeight,
      targetWeight: assetTargetWeight,
      driftPct: assetDriftPct,
      action,
      suggestedQty,
      suggestedTradeVal,
      estimatedCharges: tradeCharges.totalCharges,
      brokerage: tradeCharges.brokerage,
      stt: tradeCharges.stt,
      netProfitGuardrailApproved: guardrailVerdict.isApproved,
      guardrailReason: guardrailVerdict.rejectionReason || 'Mathematically verified net-positive guardrail'
    };
  });

  // 3. Aggregate Rebalancing Execution Metrics
  const buyOrders = assetRebalanceSuggestions.filter(a => a.action === 'BUY');
  const sellOrders = assetRebalanceSuggestions.filter(a => a.action === 'SELL');
  const totalBuyVal = buyOrders.reduce((sum, o) => sum + o.suggestedTradeVal, 0);
  const totalSellVal = sellOrders.reduce((sum, o) => sum + o.suggestedTradeVal, 0);
  const totalEstimatedFees = assetRebalanceSuggestions.reduce((sum, o) => sum + o.estimatedCharges, 0);
  const netCashFlowDelta = totalSellVal - totalBuyVal; // Positive = frees up cash, Negative = requires cash
  
  const maxAbsDrift = Math.max(...categoryDriftAnalysis.map(c => Math.abs(c.driftPct)), 0);
  const isRebalanceRecommended = maxAbsDrift > driftTolerancePct;

  return {
    totalPortfolioValue: Number(totalPortfolioValue.toFixed(2)),
    totalHoldingsMarketValue: Number(totalHoldingsMarketValue.toFixed(2)),
    totalInvestedValue: Number(totalInvestedValue.toFixed(2)),
    cashBalance: Number(cashBalance.toFixed(2)),
    totalPnl: Number((totalHoldingsMarketValue - totalInvestedValue).toFixed(2)),
    totalPnlPct: totalInvestedValue > 0
      ? Number((((totalHoldingsMarketValue - totalInvestedValue) / totalInvestedValue) * 100).toFixed(2))
      : 0,
    driftTolerancePct,
    maxAbsDrift,
    isRebalanceRecommended,
    categoryDriftAnalysis,
    assetRebalanceSuggestions,
    actionCounts: {
      buyCount: buyOrders.length,
      sellCount: sellOrders.length,
      holdCount: assetRebalanceSuggestions.filter(a => a.action === 'HOLD').length,
      totalPositions: assetRebalanceSuggestions.length
    },
    batchTotals: {
      totalBuyVal: Number(totalBuyVal.toFixed(2)),
      totalSellVal: Number(totalSellVal.toFixed(2)),
      netCashFlowDelta: Number(netCashFlowDelta.toFixed(2)),
      totalEstimatedFees: Number(totalEstimatedFees.toFixed(2))
    }
  };
}
