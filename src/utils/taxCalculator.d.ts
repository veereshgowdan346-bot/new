/**
 * CHINTU AI TRADING SYSTEM — Indian Regulatory Brokerage & Tax Engine Types
 */

export const INSTITUTIONAL_HURDLE_ROI_PCT: number;

export interface StatutoryRateSet {
  brokerageRate: number;
  maxBrokerage: number;
  isFlatBrokerage?: boolean;
  sttBuy: number;
  sttSell: number;
  exchangeRate: number;
  ipftRate: number;
  sebiRate: number;
  stampDutyBuy: number;
  stampDutySell: number;
  slippageRate: number;
}

export const STATUTORY_SCHEDULE: Record<string, Record<string, StatutoryRateSet>>;

export function getEffectiveDateKey(tradeDate?: Date | string | null): string;

export function resolveSegmentCategory(segment?: string, productType?: string): string;

export interface TradeChargesParams {
  price?: number;
  qty?: number;
  action?: string;
  segment?: string;
  productType?: string;
  grossPnl?: number;
  tradeDate?: Date | string | null;
  includeSlippage?: boolean;
}

export interface TradeChargesResult {
  orderValue: number;
  brokerage: number;
  stt: number;
  exchangeTurnover: number;
  ipft: number;
  gst: number;
  sebiCharges: number;
  stampDuty: number;
  slippage: number;
  totalCharges: number;
  grossPnl: number;
  netPnl: number;
  segmentCategory: string;
  effectiveDateKey: string;
  breakdown: {
    brokerage: number;
    stt: number;
    exchangeTurnover: number;
    ipft: number;
    gst: number;
    sebiCharges: number;
    stampDuty: number;
    slippage: number;
  };
}

export function calculateTradeCharges(params: TradeChargesParams): TradeChargesResult;

export function calculateTradeStatutoryCharges(
  price?: number,
  qty?: number,
  action?: string,
  segment?: string,
  grossPnl?: number,
  tradeDate?: Date | string | null,
  productType?: string,
  options?: { includeSlippage?: boolean }
): TradeChargesResult;

export interface NetProfitGuardrailParams {
  entryPrice?: number;
  targetPrice?: number | null;
  qty?: number;
  action?: string;
  segment?: string;
  productType?: string;
  safetyBufferPercent?: number;
  hurdleNetRoiPct?: number;
  tradeDate?: Date | string | null;
}

export interface NetProfitGuardrailResult {
  isApproved: boolean;
  rejectionReason: string | null;
  entryPrice: number;
  targetPrice: number;
  qty: number;
  orderValue: number;
  roundtripCharges: number;
  entryCharges: number;
  exitCharges: number;
  expectedGrossProfit: number;
  expectedNetProfit: number;
  expectedNetRoiPct: number;
  hurdleNetRoiPct: number;
  breakevenDelta: number;
  breakevenPct: number;
  safeThreshold: number;
  statutoryBreakdown: {
    brokerage: number;
    stt: number;
    exchangeTurnover: number;
    ipft: number;
    gst: number;
    sebiCharges: number;
    stampDuty: number;
  };
}

export function validateNetProfitGuardrail(params: NetProfitGuardrailParams): NetProfitGuardrailResult;

export interface AdaptivePositionSizingParams {
  capital?: number;
  assetPrice?: number;
  lotSize?: number;
  segment?: string;
  maxRiskPct?: number;
  stopLossDistance?: number;
}

export interface AdaptivePositionSizingResult {
  capital: number;
  affordableLots: number;
  finalQty: number;
  marginReqPerUnit: number;
  totalMarginRequired: number;
  riskBudget: number;
  maxPotentialLoss: number;
  capitalTier: string;
}

export function calculateAdaptivePositionSizing(params: AdaptivePositionSizingParams): AdaptivePositionSizingResult;

export function formatIndianCurrency(num: number | string): string;
