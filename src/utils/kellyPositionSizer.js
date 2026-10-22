/**
 * CHINTU AI TRADING SYSTEM - Dynamic Kelly Criterion Position Sizer
 * Mathematical Formulation:
 * f* = fractionalKelly * ((p * b - q) / b) * (targetVolatility / currentATRVolatility)
 *
 * Parameters:
 * - p: Win probability (e.g. 0.68 for 68% win rate)
 * - q: Loss probability (1 - p)
 * - b: Win / Loss payoff ratio (Average Win / Average Loss, e.g. 1.8)
 * - fractionalKelly: 0.5 (Half-Kelly standard for institutional risk aversion)
 * - Volatility Dampener: Scales position size down when ATR volatility surges,
 *   preserving capital during regime shifts.
 *
 * Scales seamlessly from micro accounts (₹500 - ₹6,000) to institutional tiers (₹50,00,000+).
 */

export const CAPITAL_TIERS = {
  MICRO: 'Micro Capital (₹500 - ₹2,000)',
  RETAIL: 'Retail Scalper (₹2,000 - ₹15,000)',
  QUANT: 'Active Quant (₹15,000 - ₹1,00,000)',
  INSTITUTIONAL: 'Institutional Scale (₹1,00,000+)'
};

/**
 * Calculates optimal position size and leverage using Dynamic Half-Kelly Criterion.
 * @param {object} params
 * @param {number} params.capital - Total available portfolio capital in INR (e.g. 500, 6000, 250000)
 * @param {number} params.assetPrice - Current asset price
 * @param {number} params.lotSize - Minimum contract lot size (e.g. 50 for Nifty, 30 for BankNifty, 1 for Equities)
 * @param {string} params.segment - 'NSE Equity', 'NSE F&O Options', 'NSE F&O Futures', 'MCX Commodity'
 * @param {number} params.winRate - Historical bot/system win rate (0.0 to 1.0, default 0.68)
 * @param {number} params.winLossRatio - Payoff ratio (Avg Win / Avg Loss, default 1.75)
 * @param {number} params.currentATR - Current asset ATR volatility in INR
 * @param {number} params.targetVolatility - Baseline expected volatility in INR
 * @param {number} params.stopLossPoints - Stop-loss distance in INR points
 */
export function calculateDynamicKellyPositionSize({
  capital = 25000,
  assetPrice = 2500,
  lotSize = 1,
  segment = 'NSE Equity',
  winRate = 0.68,
  winLossRatio = 1.75,
  currentATR = null,
  targetVolatility = null,
  stopLossPoints = null
}) {
  const cap = Math.max(100, Number(capital) || 25000);
  const price = Math.max(0.5, Number(assetPrice) || 2500);
  const lot = Math.max(1, parseInt(lotSize, 10) || 1);

  // Default ATR and Stop Loss if not supplied
  const baseATR = currentATR && currentATR > 0 ? Number(currentATR) : (price * 0.012);
  const baseTargetVol = targetVolatility && targetVolatility > 0 ? Number(targetVolatility) : (price * 0.010);
  const slDist = stopLossPoints && stopLossPoints > 0 ? Number(stopLossPoints) : Math.max(baseATR * 1.5, price * 0.008);

  // 1. Raw Kelly Criterion: f = (p * b - q) / b
  const p = Math.max(0.1, Math.min(0.95, Number(winRate) || 0.68));
  const b = Math.max(0.5, Number(winLossRatio) || 1.75);
  const q = 1 - p;
  const rawKellyFraction = (p * b - q) / b;

  // 2. Institutional Half-Kelly safety multiplier
  const halfKelly = Math.max(0.01, rawKellyFraction * 0.5);

  // 3. Volatility Dampener: scales position down during extreme volatility spikes
  // If ATR > targetVolatility, dampener < 1.0 (shrinks size); if calm, caps at 1.25
  const volatilityDampener = Math.min(1.25, Math.max(0.4, baseTargetVol / baseATR));

  // 4. Adjusted Kelly Fraction (clamped between 1% and 25% portfolio risk)
  const adjustedKellyFraction = Math.max(0.01, Math.min(0.25, halfKelly * volatilityDampener));

  // 5. Margin Requirement per unit by Indian SEBI/NSE Segment rules:
  // - Equity Intraday: 20% margin (5x leverage)
  // - Futures / F&O: 14% margin (~7x leverage)
  // - Options Buying: 100% of premium
  // - Commodities: 10% margin (~10x leverage)
  const segLower = (segment || '').toLowerCase();
  let marginPerUnit = price * 0.20;
  let maxAllowableLeverage = '5x Intraday';

  if (segLower.includes('option')) {
    marginPerUnit = price; // 100% premium paid
    maxAllowableLeverage = '1x Non-Leveraged Premium';
  } else if (segLower.includes('future') || segLower.includes('f&o')) {
    marginPerUnit = price * 0.14;
    maxAllowableLeverage = '7.1x SPAN+Exposure';
  } else if (segLower.includes('commodity') || segLower.includes('mcx')) {
    marginPerUnit = price * 0.10;
    maxAllowableLeverage = '10x MCX Margin';
  }

  // 6. Max risk allocation in INR
  const maxRiskCapital = cap * adjustedKellyFraction;

  // Quantity determined by risk budget vs Stop Loss
  const qtyByRisk = Math.floor(maxRiskCapital / slDist);

  // Quantity determined by available margin capital
  const qtyByMargin = Math.floor(cap / marginPerUnit);

  // Final quantity constrained by risk, margin, and lot quantization
  const rawUnits = Math.min(qtyByRisk, qtyByMargin);
  const calculatedLots = Math.floor(rawUnits / lot);

  // For micro accounts (₹500 - ₹2,000), ensure at least 1 lot if affordable
  let finalLots = calculatedLots;
  if (finalLots <= 0 && cap >= marginPerUnit * lot) {
    finalLots = 1;
  }
  finalLots = Math.max(1, finalLots);

  const finalQty = finalLots * lot;
  const totalMarginRequired = Number((finalQty * marginPerUnit).toFixed(2));
  const maxPotentialLoss = Number((finalQty * slDist).toFixed(2));
  const positionValue = Number((finalQty * price).toFixed(2));

  // Capital tier classification
  let capitalTier = CAPITAL_TIERS.INSTITUTIONAL;
  if (cap < 2000) capitalTier = CAPITAL_TIERS.MICRO;
  else if (cap < 15000) capitalTier = CAPITAL_TIERS.RETAIL;
  else if (cap < 100000) capitalTier = CAPITAL_TIERS.QUANT;

  return {
    capital: cap,
    capitalTier,
    assetPrice: price,
    lotSize: lot,
    segment,
    winRate: Number((p * 100).toFixed(1)),
    winLossRatio: b,
    rawKellyFraction: Number((rawKellyFraction * 100).toFixed(2)),
    adjustedKellyFraction: Number((adjustedKellyFraction * 100).toFixed(2)),
    volatilityDampener: Number(volatilityDampener.toFixed(2)),
    recommendedLots: finalLots,
    finalQty,
    marginPerUnit: Number(marginPerUnit.toFixed(2)),
    totalMarginRequired,
    positionValue,
    maxRiskCapital: Number(maxRiskCapital.toFixed(2)),
    stopLossPoints: Number(slDist.toFixed(2)),
    maxPotentialLoss,
    maxAllowableLeverage,
    isMicroScalable: cap < 6000
  };
}
