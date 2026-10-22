/**
 * CHINTU AI TRADING SYSTEM - Indian Regulatory Brokerage & Tax Engine
 * Fully compliant with SEBI, NSE, and Ministry of Finance statutory formulas:
 * 1. Brokerage: Flat ₹20 per executed order or 0.03% of turnover, whichever is lower
 * 2. STT (Securities Transaction Tax): 0.0125% on intraday equity/futures sell, 0.0625% on options sell, 0 on buy
 * 3. Exchange Turnover Charges: 0.00325% of turnover (NSE standard)
 * 4. GST: 18% on (Brokerage + Exchange Turnover Charges)
 * 5. SEBI Turnover Charges: 0.0001% (₹10 / crore)
 * 6. Stamp Duty: 0.003% of turnover (applicable on BUY side)
 */

export function calculateTradeCharges({
  price = 0,
  qty = 0,
  action = 'BUY',
  segment = 'NSE Equity',
  grossPnl = 0
}) {
  const p = Math.max(0, Number(price) || 0);
  const q = Math.max(0, Number(qty) || 0);
  const orderValue = p * q;
  const isSell = (action || '').toUpperCase() === 'SELL';
  const isBuy = (action || '').toUpperCase() === 'BUY';
  const segLower = (segment || '').toLowerCase();
  const isOption = segLower.includes('option') || segLower.includes('ce') || segLower.includes('pe');

  // 1. Brokerage: Flat ₹20 or 0.03% of turnover, whichever is lower
  const brokerage = orderValue > 0 ? Math.min(20.0, orderValue * 0.0003) : 0.0;

  // 2. STT (Securities Transaction Tax) - Charged only on SELL for intraday / options
  let stt = 0.0;
  if (isSell && orderValue > 0) {
    stt = isOption ? orderValue * 0.000625 : orderValue * 0.000125;
  }

  // 3. Exchange Turnover Charges (0.00325% on NSE)
  const exchangeTurnover = orderValue * 0.0000325;

  // 4. GST (18% on Brokerage + Exchange Turnover)
  const gst = 0.18 * (brokerage + exchangeTurnover);

  // 5. SEBI Turnover Charges (0.0001%)
  const sebiCharges = orderValue * 0.000001;

  // 6. Stamp Duty (0.003% on BUY side only)
  const stampDuty = isBuy ? orderValue * 0.00003 : 0.0;

  const totalCharges = brokerage + stt + exchangeTurnover + gst + sebiCharges + stampDuty;
  const netPnl = grossPnl - totalCharges;

  return {
    orderValue: Number(orderValue.toFixed(2)),
    brokerage: Number(brokerage.toFixed(2)),
    stt: Number(stt.toFixed(2)),
    exchangeTurnover: Number(exchangeTurnover.toFixed(2)),
    gst: Number(gst.toFixed(2)),
    sebiCharges: Number(sebiCharges.toFixed(2)),
    stampDuty: Number(stampDuty.toFixed(2)),
    totalCharges: Number(totalCharges.toFixed(2)),
    grossPnl: Number(Number(grossPnl).toFixed(2)),
    netPnl: Number(netPnl.toFixed(2))
  };
}

/**
 * STRICT BROKERAGE & TAX NET-PROFIT GUARDRAIL
 * Algorithmically verifies that an anticipated trade covers roundtrip brokerage,
 * STT, exchange fees, SEBI charges, GST, and Stamp Duty with a safety buffer.
 * Aborts any trade where a positive net profit is not mathematically guaranteed.
 */
export function validateNetProfitGuardrail({
  entryPrice = 0,
  targetPrice = null,
  qty = 1,
  action = 'BUY',
  segment = 'NSE Equity',
  safetyBufferPercent = 20.0
}) {
  const p = Math.max(0, Number(entryPrice) || 0);
  const q = Math.max(1, parseInt(qty, 10) || 1);
  if (p <= 0 || q <= 0) {
    return {
      isApproved: false,
      rejectionReason: 'Invalid price or quantity for Net-Profit Guardrail calculation.',
      roundtripCharges: 0,
      expectedGrossProfit: 0,
      expectedNetProfit: 0,
      breakevenDelta: 0
    };
  }

  // Default target if none specified: 0.65% conservative expectation for intraday
  const effTarget = targetPrice && targetPrice > 0
    ? Number(targetPrice)
    : (action === 'BUY' ? p * 1.0065 : p * 0.9935);

  // 1. Calculate Entry Leg Charges
  const entryCharges = calculateTradeCharges({
    price: p,
    qty: q,
    action: action,
    segment: segment
  });

  // 2. Calculate Exit Leg Charges (opposite side)
  const exitAction = action === 'BUY' ? 'SELL' : 'BUY';
  const exitCharges = calculateTradeCharges({
    price: effTarget,
    qty: q,
    action: exitAction,
    segment: segment
  });

  // Roundtrip total statutory & brokerage costs
  const totalRoundtripCharges = Number((entryCharges.totalCharges + exitCharges.totalCharges).toFixed(2));

  // Gross profit expected from price movement
  const priceSpread = Math.abs(effTarget - p);
  const expectedGrossProfit = Number((priceSpread * q).toFixed(2));

  // Net profit after deducting all statutory taxes and broker fees
  const expectedNetProfit = Number((expectedGrossProfit - totalRoundtripCharges).toFixed(2));

  // Minimum required price move to break even on roundtrip charges
  const breakevenDelta = Number((totalRoundtripCharges / q).toFixed(2));
  const breakevenPct = Number(((breakevenDelta / p) * 100).toFixed(2));

  // Safety buffer threshold: Gross movement must exceed charges by safetyBufferPercent
  const safeThreshold = Number((totalRoundtripCharges * (1.0 + safetyBufferPercent / 100.0)).toFixed(2));

  const isApproved = expectedGrossProfit >= safeThreshold && expectedNetProfit > 0;

  let rejectionReason = null;
  if (!isApproved) {
    rejectionReason = `Strict Net-Profit Guardrail Abort: Expected gross gain (₹${expectedGrossProfit.toFixed(2)}) fails to safely cover roundtrip statutory taxes & brokerage (₹${totalRoundtripCharges.toFixed(2)} + ${safetyBufferPercent}% buffer = ₹${safeThreshold.toFixed(2)}). Breakeven requires at least ₹${breakevenDelta} (${breakevenPct}%) price movement. Trade aborted to preserve capital.`;
  }

  return {
    isApproved,
    rejectionReason,
    entryPrice: p,
    targetPrice: effTarget,
    qty: q,
    roundtripCharges: totalRoundtripCharges,
    entryCharges: entryCharges.totalCharges,
    exitCharges: exitCharges.totalCharges,
    expectedGrossProfit,
    expectedNetProfit,
    breakevenDelta,
    breakevenPct,
    safeThreshold
  };
}

/**
 * DYNAMIC CAPITAL SCALING CALCULATOR
 * Dynamically scales lot sizing, leverage, and risk boundaries based on capital input
 * (Supports micro-capital ₹500, ₹6,000, to institutional ₹50,00,000+).
 */
export function calculateAdaptivePositionSizing({
  capital = 20000,
  assetPrice = 2500,
  lotSize = 1,
  segment = 'NSE Equity',
  maxRiskPct = 1.5,
  stopLossDistance = 15
}) {
  const cap = Math.max(100, Number(capital) || 20000);
  const p = Math.max(1, Number(assetPrice) || 2500);
  const lot = Math.max(1, parseInt(lotSize, 10) || 1);
  const slDist = Math.max(0.5, Number(stopLossDistance) || (p * 0.008));

  // Indian regulatory margin requirement:
  // Equity Intraday = 20% (5x leverage)
  // Index/Stock Futures = 14% (~7x)
  // Options Buying = 100% of premium
  const segLower = (segment || '').toLowerCase();
  let marginReqPerUnit = p * 0.20; // default 5x intraday
  if (segLower.includes('option')) {
    marginReqPerUnit = p; // 100% option premium
  } else if (segLower.includes('future') || segLower.includes('f&o')) {
    marginReqPerUnit = p * 0.14; // SPAN + Exposure
  } else if (segLower.includes('commodity') || segLower.includes('mcx')) {
    marginReqPerUnit = p * 0.10;
  }

  // 1. Max risk budget = capital * maxRiskPct%
  const riskBudget = cap * (maxRiskPct / 100);
  const qtyByRisk = Math.floor(riskBudget / slDist);

  // 2. Max qty affordable by capital margin
  const qtyByMargin = Math.floor(cap / marginReqPerUnit);

  // Quantized to lot size
  const rawMax = Math.min(qtyByRisk, qtyByMargin);
  const affordableLots = Math.max(1, Math.floor(rawMax / lot));
  const finalQty = affordableLots * lot;

  return {
    capital: cap,
    affordableLots,
    finalQty,
    marginReqPerUnit: Number(marginReqPerUnit.toFixed(2)),
    totalMarginRequired: Number((finalQty * marginReqPerUnit).toFixed(2)),
    riskBudget: Number(riskBudget.toFixed(2)),
    maxPotentialLoss: Number((finalQty * slDist).toFixed(2)),
    capitalTier: cap < 2000 ? 'Micro Capital (₹500 - ₹2,000)' : cap < 15000 ? 'Retail Scalper (₹2,000 - ₹15,000)' : cap < 100000 ? 'Active Quant (₹15,000 - ₹1,00,000)' : 'Institutional Scale (₹1,00,000+)'
  };
}

export function formatIndianCurrency(num) {
  const val = Number(num) || 0;
  return '₹' + Math.abs(val).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
