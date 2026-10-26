/**
 * CHINTU AI TRADING SYSTEM — CANONICAL STATUTORY CHARGES & TAXATION ENGINE
 * 
 * Authoritative Indian Market Regulatory Schedule:
 * - SEBI / NSE / BSE / MCX / Ministry of Finance Statutory Schedules
 * - True-to-Label Exchange Transaction Charges (NSE Circular NSE/F&A/63784 w.e.f. Oct 1, 2024)
 * - Finance (No. 2) Act 2024 (STT Revision on Futures & Options w.e.f. Oct 1, 2024)
 * - Finance Act 2026 (STT on Options Sale Premium w.e.f. April 1, 2026)
 * - Section 98 of Finance (No. 2) Act 2004 (Intraday Non-Delivery STT 0.025%)
 * - Indian Stamp Act (amended w.e.f. July 1, 2020)
 * - GST Act 2017 (18% on Service Fees: Brokerage + Exchange + SEBI + IPFT)
 */

export const INSTITUTIONAL_HURDLE_ROI_PCT = 1.50; // 1.50% minimum net ROI

export const STATUTORY_SCHEDULE = {
  // Legacy recorded session rate schedule (for reconciling historical paper_trades.csv)
  LEGACY_SESSION: {
    EQUITY_INTRADAY: {
      brokerageRate: 0.0003, maxBrokerage: 20.0,
      sttBuy: 0.0, sttSell: 0.000125,
      exchangeRate: 0.0000325, ipftRate: 0.0, sebiRate: 0.000001,
      stampDutyBuy: 0.00003, stampDutySell: 0.0,
      slippageRate: 0.0005
    },
    EQUITY_DELIVERY: {
      brokerageRate: 0.0, maxBrokerage: 0.0,
      sttBuy: 0.0010, sttSell: 0.0010,
      exchangeRate: 0.0000325, ipftRate: 0.0, sebiRate: 0.000001,
      stampDutyBuy: 0.00015, stampDutySell: 0.0,
      slippageRate: 0.0
    },
    EQUITY_FUTURES: {
      brokerageRate: 0.0003, maxBrokerage: 20.0,
      sttBuy: 0.0, sttSell: 0.000125,
      exchangeRate: 0.0000325, ipftRate: 0.0, sebiRate: 0.000001,
      stampDutyBuy: 0.00003, stampDutySell: 0.0,
      slippageRate: 0.0005,
      gstIncludesSebi: false
    },
    EQUITY_OPTIONS: {
      brokerageRate: 0.0003, maxBrokerage: 20.0, isFlatBrokerage: false,
      sttBuy: 0.0, sttSell: 0.000625,
      exchangeRate: 0.0000325, ipftRate: 0.0, sebiRate: 0.000001,
      stampDutyBuy: 0.00003, stampDutySell: 0.0,
      slippageRate: 0.0010,
      gstIncludesSebi: false
    },
    COMMODITY_FUTURES: {
      brokerageRate: 0.0003, maxBrokerage: 20.0,
      sttBuy: 0.0, sttSell: 0.00010,
      exchangeRate: 0.000021, ipftRate: 0.0, sebiRate: 0.000001,
      stampDutyBuy: 0.00002, stampDutySell: 0.0,
      slippageRate: 0.0005
    },
    COMMODITY_OPTIONS: {
      brokerageRate: 0.0, maxBrokerage: 20.0, isFlatBrokerage: true,
      sttBuy: 0.0, sttSell: 0.00050,
      exchangeRate: 0.000418, ipftRate: 0.0, sebiRate: 0.000001,
      stampDutyBuy: 0.00003, stampDutySell: 0.0,
      slippageRate: 0.0010
    }
  },

  // Pre-October 1, 2024 Schedule
  PRE_OCT_2024: {
    EQUITY_INTRADAY: {
      brokerageRate: 0.0003, maxBrokerage: 20.0,
      sttBuy: 0.0, sttSell: 0.00025, // 0.025%
      exchangeRate: 0.0000325, ipftRate: 0.000001, sebiRate: 0.000001,
      stampDutyBuy: 0.00003, stampDutySell: 0.0,
      slippageRate: 0.0005
    },
    EQUITY_DELIVERY: {
      brokerageRate: 0.0, maxBrokerage: 0.0,
      sttBuy: 0.0010, sttSell: 0.0010, // 0.10%
      exchangeRate: 0.0000325, ipftRate: 0.000001, sebiRate: 0.000001,
      stampDutyBuy: 0.00015, stampDutySell: 0.0,
      slippageRate: 0.0
    },
    EQUITY_FUTURES: {
      brokerageRate: 0.0003, maxBrokerage: 20.0,
      sttBuy: 0.0, sttSell: 0.000125, // 0.0125% pre-Oct 2024
      exchangeRate: 0.000019, ipftRate: 0.000001, sebiRate: 0.000001,
      stampDutyBuy: 0.00002, stampDutySell: 0.0,
      slippageRate: 0.0005
    },
    EQUITY_OPTIONS: {
      brokerageRate: 0.0, maxBrokerage: 20.0, isFlatBrokerage: true,
      sttBuy: 0.0, sttSell: 0.000625, // 0.0625% pre-Oct 2024
      exchangeRate: 0.00050, ipftRate: 0.000005, sebiRate: 0.000001,
      stampDutyBuy: 0.00003, stampDutySell: 0.0,
      slippageRate: 0.0010
    },
    COMMODITY_FUTURES: {
      brokerageRate: 0.0003, maxBrokerage: 20.0,
      sttBuy: 0.0, sttSell: 0.00010, // 0.01% CTT
      exchangeRate: 0.000021, ipftRate: 0.000001, sebiRate: 0.000001,
      stampDutyBuy: 0.00002, stampDutySell: 0.0,
      slippageRate: 0.0005
    },
    COMMODITY_OPTIONS: {
      brokerageRate: 0.0, maxBrokerage: 20.0, isFlatBrokerage: true,
      sttBuy: 0.0, sttSell: 0.00050, // 0.05% CTT
      exchangeRate: 0.000418, ipftRate: 0.000005, sebiRate: 0.000001,
      stampDutyBuy: 0.00003, stampDutySell: 0.0,
      slippageRate: 0.0010
    }
  },

  // October 1, 2024 to March 31, 2026 Schedule
  OCT_2024_TO_MAR_2026: {
    EQUITY_INTRADAY: {
      brokerageRate: 0.0003, maxBrokerage: 20.0,
      sttBuy: 0.0, sttSell: 0.00025, // 0.025%
      exchangeRate: 0.0000297, ipftRate: 0.000001, sebiRate: 0.000001, // 0.00297% NSE True to label
      stampDutyBuy: 0.00003, stampDutySell: 0.0,
      slippageRate: 0.0005
    },
    EQUITY_DELIVERY: {
      brokerageRate: 0.0, maxBrokerage: 0.0,
      sttBuy: 0.0010, sttSell: 0.0010, // 0.10%
      exchangeRate: 0.0000297, ipftRate: 0.000001, sebiRate: 0.000001,
      stampDutyBuy: 0.00015, stampDutySell: 0.0,
      slippageRate: 0.0
    },
    EQUITY_FUTURES: {
      brokerageRate: 0.0003, maxBrokerage: 20.0,
      sttBuy: 0.0, sttSell: 0.00020, // 0.02% (Finance Act 2024)
      exchangeRate: 0.0000173, ipftRate: 0.000001, sebiRate: 0.000001, // 0.00173% NSE True to label
      stampDutyBuy: 0.00002, stampDutySell: 0.0,
      slippageRate: 0.0005
    },
    EQUITY_OPTIONS: {
      brokerageRate: 0.0, maxBrokerage: 20.0, isFlatBrokerage: true,
      sttBuy: 0.0, sttSell: 0.0010, // 0.10% (Finance Act 2024 w.e.f. Oct 1, 2024)
      exchangeRate: 0.0003503, ipftRate: 0.000005, sebiRate: 0.000001, // 0.03503% NSE True to label
      stampDutyBuy: 0.00003, stampDutySell: 0.0,
      slippageRate: 0.0010
    },
    COMMODITY_FUTURES: {
      brokerageRate: 0.0003, maxBrokerage: 20.0,
      sttBuy: 0.0, sttSell: 0.00010, // 0.01% CTT
      exchangeRate: 0.000021, ipftRate: 0.000001, sebiRate: 0.000001,
      stampDutyBuy: 0.00002, stampDutySell: 0.0,
      slippageRate: 0.0005
    },
    COMMODITY_OPTIONS: {
      brokerageRate: 0.0, maxBrokerage: 20.0, isFlatBrokerage: true,
      sttBuy: 0.0, sttSell: 0.00050, // 0.05% CTT
      exchangeRate: 0.000418, ipftRate: 0.000005, sebiRate: 0.000001,
      stampDutyBuy: 0.00003, stampDutySell: 0.0,
      slippageRate: 0.0010
    }
  },

  // April 1, 2026 Onward Schedule (Active Operational Schedule)
  POST_APR_2026: {
    EQUITY_INTRADAY: {
      brokerageRate: 0.0003, maxBrokerage: 20.0,
      sttBuy: 0.0, sttSell: 0.00025, // 0.025% Non-delivery equity
      exchangeRate: 0.0000297, ipftRate: 0.000001, sebiRate: 0.000001, // 0.00297% (₹2.97 / lakh)
      stampDutyBuy: 0.00003, stampDutySell: 0.0,
      slippageRate: 0.0005
    },
    EQUITY_DELIVERY: {
      brokerageRate: 0.0, maxBrokerage: 0.0,
      sttBuy: 0.0010, sttSell: 0.0010, // 0.10%
      exchangeRate: 0.0000297, ipftRate: 0.000001, sebiRate: 0.000001,
      stampDutyBuy: 0.00015, stampDutySell: 0.0,
      slippageRate: 0.0
    },
    EQUITY_FUTURES: {
      brokerageRate: 0.0003, maxBrokerage: 20.0,
      sttBuy: 0.0, sttSell: 0.00050, // 0.05% (Finance Bill 2026 & Budget 2026 FAQs w.e.f. April 1, 2026)
      exchangeRate: 0.0000173, ipftRate: 0.000001, sebiRate: 0.000001, // 0.00173% (₹1.73 / lakh)
      stampDutyBuy: 0.00002, stampDutySell: 0.0,
      slippageRate: 0.0005
    },
    EQUITY_OPTIONS: {
      brokerageRate: 0.0, maxBrokerage: 20.0, isFlatBrokerage: true,
      sttBuy: 0.0, sttSell: 0.00150, // 0.15% on option sale premium (w.e.f. April 1, 2026)
      exchangeRate: 0.0003503, ipftRate: 0.000005, sebiRate: 0.000001, // 0.03503% (₹35.03 / lakh on premium)
      stampDutyBuy: 0.00003, stampDutySell: 0.0,
      slippageRate: 0.0010
    },
    COMMODITY_FUTURES: {
      brokerageRate: 0.0003, maxBrokerage: 20.0,
      sttBuy: 0.0, sttSell: 0.00010, // 0.01% CTT
      exchangeRate: 0.000021, ipftRate: 0.000001, sebiRate: 0.000001,
      stampDutyBuy: 0.00002, stampDutySell: 0.0,
      slippageRate: 0.0005
    },
    COMMODITY_OPTIONS: {
      brokerageRate: 0.0, maxBrokerage: 20.0, isFlatBrokerage: true,
      sttBuy: 0.0, sttSell: 0.00050, // 0.05% CTT
      exchangeRate: 0.000418, ipftRate: 0.000005, sebiRate: 0.000001,
      stampDutyBuy: 0.00003, stampDutySell: 0.0,
      slippageRate: 0.0010
    }
  }
};

/**
 * Determines the date-effective regulatory period key.
 */
export function getEffectiveDateKey(tradeDate) {
  if (!tradeDate) return 'POST_APR_2026';
  if (typeof tradeDate === 'string') {
    const upper = tradeDate.toUpperCase();
    if (upper.includes('LEGACY') || upper.includes('HISTORICAL')) {
      return 'LEGACY_SESSION';
    }
    // Match standard YYYY-MM-DD date prefix directly to prevent local timezone offsets
    const match = tradeDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const ymd = `${match[1]}-${match[2]}-${match[3]}`;
      if (ymd >= '2026-04-01') return 'POST_APR_2026';
      if (ymd >= '2024-10-01') return 'OCT_2024_TO_MAR_2026';
      return 'PRE_OCT_2024';
    }
  }
  const d = tradeDate instanceof Date ? tradeDate : new Date(tradeDate);
  if (isNaN(d.getTime())) return 'POST_APR_2026';
  const isoDate = d.toISOString().slice(0, 10);
  if (isoDate >= '2026-04-01') return 'POST_APR_2026';
  if (isoDate >= '2024-10-01') return 'OCT_2024_TO_MAR_2026';
  return 'PRE_OCT_2024';
}

/**
 * Resolves segment category from raw symbol, exchange, or segment string.
 */
export function resolveSegmentCategory(segment = 'NSE Equity', productType = 'INTRADAY') {
  const seg = String(segment || '').toUpperCase();
  const prod = String(productType || '').toUpperCase();

  if (seg.includes('OPTION') || seg.includes(' CE') || seg.includes(' PE') || seg.endsWith('CE') || seg.endsWith('PE')) {
    if (seg.includes('MCX') || seg.includes('COMMODITY') || seg.includes('GOLD') || seg.includes('SILVER') || seg.includes('CRUDE')) {
      return 'COMMODITY_OPTIONS';
    }
    return 'EQUITY_OPTIONS';
  }
  if (seg.includes('COMMODITY') || seg.includes('MCX') || seg.includes('GOLD') || seg.includes('SILVER') || seg.includes('CRUDE')) {
    return 'COMMODITY_FUTURES';
  }
  if (seg.includes('FUTURE') || seg.includes('F&O') || seg.includes('FUT') || seg.includes('INDEX')) {
    return 'EQUITY_FUTURES';
  }
  if (prod.includes('DELIVERY') || prod.includes('CNC') || prod.includes('INVEST')) {
    return 'EQUITY_DELIVERY';
  }
  return 'EQUITY_INTRADAY';
}

/**
 * Canonical calculation of Indian trade statutory charges, taxes, and net P&L.
 */
export function calculateTradeCharges({
  price = 0,
  qty = 0,
  action = 'BUY',
  segment = 'NSE Equity',
  productType = 'INTRADAY',
  grossPnl = 0,
  tradeDate = null,
  includeSlippage = false
}) {
  const p = Math.max(0, Number(price) || 0);
  const q = Math.max(0, Number(qty) || 0);
  const orderValue = Number((p * q).toFixed(2));
  const isSell = (String(action || '').toUpperCase() === 'SELL');
  const isBuy = (String(action || '').toUpperCase() === 'BUY');

  const periodKey = getEffectiveDateKey(tradeDate);
  const schedule = STATUTORY_SCHEDULE[periodKey] || STATUTORY_SCHEDULE.POST_APR_2026;
  const segCategory = resolveSegmentCategory(segment, productType);
  const rates = schedule[segCategory] || schedule.EQUITY_INTRADAY;

  // 1. Brokerage:
  // For options: flat ₹20 or min(20, 0.03% * turnover) if micro lot
  // For delivery: ₹0.00
  // For intraday/futures: min(₹20, orderValue * 0.03%)
  let brokerage = 0.0;
  if (orderValue > 0) {
    if (rates.brokerageRate === 0.0 && rates.maxBrokerage === 0.0) {
      brokerage = 0.0; // Delivery zero brokerage
    } else if (rates.isFlatBrokerage) {
      brokerage = Math.min(rates.maxBrokerage, Math.max(20.0, orderValue * 0.0003));
      // For standard options order, flat ₹20
      brokerage = rates.maxBrokerage;
    } else {
      brokerage = Math.min(rates.maxBrokerage, orderValue * rates.brokerageRate);
    }
  }

  // 2. STT / CTT (Securities / Commodities Transaction Tax):
  // Intraday equity: 0.025% on SELL only
  // Delivery equity: 0.10% on BUY and 0.10% on SELL
  // Equity Futures: 0.05% on SELL only post-Apr 2026 (0.02% Oct 2024 - Mar 2026, 0.0125% pre-Oct 2024)
  // Equity Options: 0.15% on SELL premium (0.10% Oct 2024 - Mar 2026, 0.0625% pre-Oct 2024)
  // Commodity Futures: 0.01% on SELL only
  // Commodity Options: 0.05% on SELL premium
  let stt = 0.0;
  if (orderValue > 0) {
    if (isSell) {
      stt = orderValue * (rates.sttSell || 0.0);
    } else if (isBuy) {
      stt = orderValue * (rates.sttBuy || 0.0);
    }
  }

  // 3. Exchange Turnover Charges:
  const exchangeTurnover = orderValue * (rates.exchangeRate || 0.0);

  // 4. IPFT (Investor Protection Fund Trust):
  const ipft = orderValue * (rates.ipftRate || 0.0);

  // 5. SEBI Turnover Charges:
  const sebiCharges = orderValue * (rates.sebiRate || 0.000001);

  // 6. Stamp Duty (Payable ONLY on BUY side):
  const stampDuty = isBuy ? orderValue * (rates.stampDutyBuy || 0.0) : 0.0;

  // 7. GST (18% strictly on service fees: Brokerage + Exchange Turnover + IPFT + SEBI):
  // NOTE: STT/CTT and Stamp Duty are Government taxes, NOT services, so GST is NOT levied on them.
  const serviceFees = rates.gstIncludesSebi === false
    ? (brokerage + exchangeTurnover)
    : (brokerage + exchangeTurnover + ipft + sebiCharges);
  const gst = 0.18 * serviceFees;

  // 8. Execution Slippage:
  const slippage = includeSlippage ? orderValue * (rates.slippageRate || 0.0) : 0.0;

  const round2 = (val) => Math.round((Number(val || 0) + Number.EPSILON) * 100) / 100;

  // Statutory roundings to 2 decimal places using IEEE-754 epsilon protection
  const brk = round2(brokerage);
  const s = round2(stt);
  const ex = round2(exchangeTurnover);
  const ip = round2(ipft);
  const sebi = round2(sebiCharges);
  const stmp = round2(stampDuty);
  const g = round2(gst);
  const slip = round2(slippage);

  const totalCharges = round2(brk + s + ex + ip + sebi + stmp + g + slip);
  const netPnl = Math.round(((Number(grossPnl) || 0) - totalCharges) * 100) / 100;

  return {
    orderValue,
    brokerage: brk,
    stt: s,
    exchangeTurnover: ex,
    ipft: ip,
    gst: g,
    sebiCharges: sebi,
    stampDuty: stmp,
    slippage: slip,
    totalCharges,
    grossPnl: Number(Number(grossPnl || 0).toFixed(2)),
    netPnl,
    segmentCategory: segCategory,
    effectiveDateKey: periodKey,
    breakdown: {
      brokerage: brk,
      stt: s,
      exchangeTurnover: ex,
      ipft: ip,
      gst: g,
      sebiCharges: sebi,
      stampDuty: stmp,
      slippage: slip
    }
  };
}

/**
 * Universal interface for statutory calculations across server, adapters, and engines.
 */
export function calculateTradeStatutoryCharges(
  price = 0,
  qty = 0,
  action = 'BUY',
  segment = 'NSE Equity',
  grossPnl = 0,
  tradeDate = null,
  productType = 'INTRADAY',
  options = {}
) {
  const includeSlippage = options.includeSlippage !== undefined ? Boolean(options.includeSlippage) : true;
  return calculateTradeCharges({
    price,
    qty,
    action,
    segment,
    productType,
    grossPnl,
    tradeDate,
    includeSlippage
  });
}

/**
 * Pre-trade Institutional Net-Profit Guardrail.
 * Verifies that an order's expected price movement guarantees covering roundtrip statutory charges
 * with a mandatory institutional net ROI hurdle (default 1.50%).
 */
export function validateNetProfitGuardrail({
  entryPrice = 0,
  targetPrice = null,
  qty = 1,
  action = 'BUY',
  segment = 'NSE Equity',
  productType = 'INTRADAY',
  safetyBufferPercent = 20.0,
  hurdleNetRoiPct = INSTITUTIONAL_HURDLE_ROI_PCT,
  tradeDate = null
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
      expectedNetRoiPct: 0,
      breakevenDelta: 0
    };
  }

  const orderValue = Number((p * q).toFixed(2));
  const isBuy = String(action || '').toUpperCase() === 'BUY';
  const effTarget = targetPrice && targetPrice > 0
    ? Number(targetPrice)
    : (isBuy ? p * 1.025 : p * 0.975);

  // 1. Calculate Entry Leg
  const entryCharges = calculateTradeCharges({
    price: p,
    qty: q,
    action: action,
    segment: segment,
    productType: productType,
    tradeDate: tradeDate,
    includeSlippage: false
  });

  // 2. Calculate Exit Leg (Opposite side)
  const exitAction = isBuy ? 'SELL' : 'BUY';
  const exitCharges = calculateTradeCharges({
    price: effTarget,
    qty: q,
    action: exitAction,
    segment: segment,
    productType: productType,
    tradeDate: tradeDate,
    includeSlippage: false
  });

  const totalRoundtripCharges = Math.round((entryCharges.totalCharges + exitCharges.totalCharges) * 100) / 100;
  const priceSpread = Math.abs(effTarget - p);
  const expectedGrossProfit = Math.round((priceSpread * q) * 100) / 100;
  const expectedNetProfit = Math.round((expectedGrossProfit - totalRoundtripCharges) * 100) / 100;

  const expectedNetRoiPct = orderValue > 0
    ? Math.round(((expectedNetProfit / orderValue) * 100) * 100) / 100
    : 0;

  const breakevenDelta = Math.round((totalRoundtripCharges / q) * 100) / 100;
  const breakevenPct = Math.round(((breakevenDelta / p) * 100) * 100) / 100;
  const safeThreshold = Math.round((totalRoundtripCharges * (1.0 + safetyBufferPercent / 100.0)) * 100) / 100;

  const meetsHurdle = expectedNetRoiPct >= hurdleNetRoiPct;
  const isProfitable = expectedNetProfit > 0 && expectedGrossProfit >= safeThreshold;
  const isApproved = isProfitable && meetsHurdle;

  let rejectionReason = null;
  if (!isApproved) {
    if (!meetsHurdle && expectedNetProfit > 0) {
      rejectionReason = `Hard Abort (Net ROI Hurdle): Projected net ROI of ${expectedNetRoiPct}% is below the mandatory ${hurdleNetRoiPct}% institutional hurdle. Expected Net: ₹${expectedNetProfit.toFixed(2)} on ₹${orderValue.toLocaleString()} order value. Order rejected to enforce net profitability standards.`;
    } else {
      rejectionReason = `Hard Abort (Statutory Overhead): Expected gross gain (₹${expectedGrossProfit.toFixed(2)}) fails to safely cover roundtrip taxes & brokerage (₹${totalRoundtripCharges.toFixed(2)} + ${safetyBufferPercent}% buffer = ₹${safeThreshold.toFixed(2)}). Breakeven requires at least ₹${breakevenDelta} (${breakevenPct}%) move. Order rejected to preserve capital.`;
    }
  }

  return {
    isApproved,
    rejectionReason,
    entryPrice: p,
    targetPrice: effTarget,
    qty: q,
    orderValue,
    roundtripCharges: totalRoundtripCharges,
    entryCharges: entryCharges.totalCharges,
    exitCharges: exitCharges.totalCharges,
    expectedGrossProfit,
    expectedNetProfit,
    expectedNetRoiPct,
    hurdleNetRoiPct,
    breakevenDelta,
    breakevenPct,
    safeThreshold,
    statutoryBreakdown: {
      brokerage: Math.round((entryCharges.brokerage + exitCharges.brokerage) * 100) / 100,
      stt: Math.round((entryCharges.stt + exitCharges.stt) * 100) / 100,
      exchangeTurnover: Math.round((entryCharges.exchangeTurnover + exitCharges.exchangeTurnover) * 100) / 100,
      ipft: Math.round((entryCharges.ipft + exitCharges.ipft) * 100) / 100,
      gst: Math.round((entryCharges.gst + exitCharges.gst) * 100) / 100,
      sebiCharges: Math.round((entryCharges.sebiCharges + exitCharges.sebiCharges) * 100) / 100,
      stampDuty: Math.round((entryCharges.stampDuty + exitCharges.stampDuty) * 100) / 100
    }
  };
}

/**
 * Adaptive Position Sizing using segment-specific margins and stop-loss risk budgeting.
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

  const segCategory = resolveSegmentCategory(segment);
  let marginReqPerUnit = p * 0.20; // 5x intraday standard
  if (segCategory === 'EQUITY_OPTIONS' || segCategory === 'COMMODITY_OPTIONS') {
    marginReqPerUnit = p; // 100% premium for option buyers
  } else if (segCategory === 'EQUITY_FUTURES') {
    marginReqPerUnit = p * 0.14; // ~14% SPAN + Exposure
  } else if (segCategory === 'COMMODITY_FUTURES') {
    marginReqPerUnit = p * 0.10;
  } else if (segCategory === 'EQUITY_DELIVERY') {
    marginReqPerUnit = p; // 100% upfront delivery
  }

  const riskBudget = cap * (maxRiskPct / 100);
  const qtyByRisk = Math.floor(riskBudget / slDist);
  const qtyByMargin = Math.floor(cap / marginReqPerUnit);

  const rawMax = Math.min(qtyByRisk, qtyByMargin);
  const affordableLots = Math.max(1, Math.floor(rawMax / lot));
  const finalQty = affordableLots * lot;

  return {
    capital: cap,
    affordableLots,
    finalQty,
    marginReqPerUnit: Math.round(marginReqPerUnit * 100) / 100,
    totalMarginRequired: Math.round((finalQty * marginReqPerUnit) * 100) / 100,
    riskBudget: Math.round(riskBudget * 100) / 100,
    maxPotentialLoss: Math.round((finalQty * slDist) * 100) / 100,
    capitalTier: cap < 2000 ? 'Micro Capital (₹500 - ₹2,000)' : cap < 15000 ? 'Retail Scalper (₹2,000 - ₹15,000)' : cap < 100000 ? 'Active Quant (₹15,000 - ₹1,00,000)' : 'Institutional Scale (₹1,00,000+)'
  };
}

/**
 * Formats numbers into standard Indian numbering system (Lakhs / Crores).
 */
export function formatIndianCurrency(num) {
  const val = Number(num) || 0;
  return '₹' + Math.abs(val).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
