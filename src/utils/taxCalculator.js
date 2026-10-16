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

export function formatIndianCurrency(num) {
  const val = Number(num) || 0;
  return '₹' + Math.abs(val).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

