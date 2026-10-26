/**
 * CHINTU AI TRADING SYSTEM — Indian Regulatory Brokerage & Tax Engine Types
 */

export const INSTITUTIONAL_HURDLE_ROI_PCT: number;

export interface TradeChargesParams {
  price?: number;
  qty?: number;
  action?: string;
  segment?: string;
  grossPnl?: number;
}

export interface TradeChargesResult {
  orderValue: number;
  brokerage: number;
  stt: number;
  exchangeTurnover: number;
  gst: number;
  sebiCharges: number;
  stampDuty: number;
  totalCharges: number;
  grossPnl: number;
  netPnl: number;
}

export function calculateTradeCharges(params: TradeChargesParams): TradeChargesResult;

export interface NetProfitGuardrailParams {
  entryPrice?: number;
  targetPrice?: number | null;
  qty?: number;
  action?: string;
  segment?: string;
  safetyBufferPercent?: number;
  hurdleNetRoiPct?: number;
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
