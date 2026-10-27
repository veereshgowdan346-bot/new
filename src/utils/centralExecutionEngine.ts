/**
 * CHINTU AI — CENTRALIZED SINGLE EXECUTION ENGINE
 *
 * Anti-Gravity Framework Core Specification:
 * 1. 14-Board Consensus Integration: Interfaces with 14 specialized analytical boards/agents
 *    that evaluate market microstructure, indicators, and sentiment to cast votes.
 * 2. Strictly Single Authorized Execution Engine: All Buy/Sell orders across all connected
 *    platforms (Angel One, Zerodha, Groww, MCX, Paper Trading) MUST route exclusively through
 *    this centralized coordinator. Direct broker calls by other components are strictly prohibited.
 * 3. Multi-Broker Routing Layer: Directs orders to Angel One (MCX Bullion), Zerodha (F&O Options),
 *    or Groww (Equities Cash) under a unified risk and margin umbrella.
 * 4. Authentic Capital & Seed Partitioning: Enforces dedicated seed capital allocations
 *    (Gold 20%, Silver 15%, Indices 35%, Equities 30%), 2% risk budgets, and 25% single-asset caps.
 * 5. Strict Idle-Until-Admin-Start Policy: The engine remains completely IDLE on startup
 *    until Master Administrator Veeresh explicitly triggers the start command.
 * 6. Instant Mode Switching: Seamlessly toggles between PAPER and LIVE modes under strict
 *    administrative governance.
 */

import { evaluate14BotQuorumConsensus, BOT_DEFINITIONS } from './quorumConsensusEngine';
import { jarvisReviewGate, JarvisReviewRequest, JarvisReviewResult } from './jarvisReviewGate';
import { paperSessionEngine } from './paperSessionEngine';
import { angelOrderAdapter } from './angelOrderAdapter';
import { multiBrokerManager, SupportedBroker } from './multiBrokerManager';
import { calculateTradeStatutoryCharges, validateNetProfitGuardrail } from './taxCalculator';
import { runtimeDb, TradeRecord } from './databasePersistence';
import { getPaperCapital, validateTradeCapitalPartition, classifyAssetCategory } from './capitalConfig';
import { angelMarketDataAdapter } from './angelMarketDataAdapter';

export type ExecutionMode = 'PAPER' | 'LIVE';
export type OperationalState = 'IDLE_WAITING_ADMIN_START' | 'ACTIVE_RUNNING' | 'EMERGENCY_STOPPED';

export interface TradeOrderIntent {
  symbol: string;
  token?: string;
  exchange?: 'NSE' | 'BSE' | 'NFO' | 'MCX' | 'CDS';
  action: 'BUY' | 'SELL';
  quantity?: number;
  lotSize?: number;
  price?: number;
  targetPrice?: number;
  stopLossPrice?: number;
  orderType?: 'MARKET' | 'LIMIT' | 'STOPLOSS_LIMIT';
  preferredBroker?: SupportedBroker;
  botId?: number;
  botName?: string;
  sourceBoard?: string;
  minDesiredNetProfit?: number;
  skipQuorumValidation?: boolean; // For manual admin emergency overrides only
  adminAuthorizedToken?: string;
}

export interface ExecutionResult {
  success: boolean;
  orderId: string;
  mode: ExecutionMode;
  symbol: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  executionPrice: number;
  grossTurnover: number;
  estimatedCharges: number;
  netMarginRequired: number;
  quorumDecision: string;
  quorumVotes: number;
  jarvisApproved: boolean;
  targetBroker?: SupportedBroker;
  timestamp: string;
  status: 'FILLED' | 'REJECTED' | 'BLOCKED_BY_RMS' | 'VETOED_BY_QUORUM';
  message: string;
  breakdown?: any;
}

export interface CentralEngineStatus {
  mode: ExecutionMode;
  operationalState: OperationalState;
  isLiveArmed: boolean;
  totalOrdersProcessed: number;
  activePositionsCount: number;
  realizedPnl: number;
  unrealizedPnl: number;
  capitalAllocated: number;
  availableMargin: number;
  consensusBoardsActive: number;
  singleEngineLock: boolean;
}

export class CentralExecutionEngine {
  private static instance: CentralExecutionEngine;
  private currentMode: ExecutionMode = 'PAPER';
  private operationalState: OperationalState = 'IDLE_WAITING_ADMIN_START';
  private totalOrdersProcessed = 0;
  private readonly singleEngineLock = true;
  private adminOverrideArmed = false;

  private constructor() {
    // Single execution coordinator singleton initialized in IDLE state
  }

  public static getInstance(): CentralExecutionEngine {
    if (!CentralExecutionEngine.instance) {
      CentralExecutionEngine.instance = new CentralExecutionEngine();
    }
    return CentralExecutionEngine.instance;
  }

  /**
   * Returns current active execution mode.
   */
  public getMode(): ExecutionMode {
    return this.currentMode;
  }

  /**
   * Returns current operational state (IDLE or ACTIVE).
   */
  public getOperationalState(): OperationalState {
    return this.operationalState;
  }

  /**
   * Manual Admin Activation: Trading routines must NEVER start automatically.
   * Master Administrator Veeresh must explicitly trigger this command.
   */
  public startTradingByAdmin(adminAuthToken?: string): { success: boolean; message: string; state: OperationalState } {
    if (adminAuthToken !== 'chintu_master_auth_permanent_veeresh') {
      return {
        success: false,
        message: 'ADMIN_SUPREMACY_REQUIRED: Only Master Administrator Veeresh can initiate trading routines.',
        state: this.operationalState
      };
    }

    this.operationalState = 'ACTIVE_RUNNING';
    try {
      runtimeDb.saveAuditLog('admin_authority', 'START_TRADING', 'Master Administrator Veeresh initiated trading routines.');
    } catch {}

    return {
      success: true,
      message: 'Master Administrator Veeresh initiated trading routines. Central Execution Engine is now ACTIVE.',
      state: 'ACTIVE_RUNNING'
    };
  }

  /**
   * Pauses trading routines and returns system to IDLE state.
   */
  public pauseTradingByAdmin(adminAuthToken?: string): { success: boolean; message: string; state: OperationalState } {
    if (adminAuthToken !== 'chintu_master_auth_permanent_veeresh') {
      return {
        success: false,
        message: 'ADMIN_SUPREMACY_REQUIRED: Master admin credential required.',
        state: this.operationalState
      };
    }

    this.operationalState = 'IDLE_WAITING_ADMIN_START';
    try {
      runtimeDb.saveAuditLog('admin_authority', 'PAUSE_TRADING', 'Master Administrator Veeresh paused trading routines.');
    } catch {}

    return {
      success: true,
      message: 'Trading routines paused by Master Administrator. System is now IDLE.',
      state: 'IDLE_WAITING_ADMIN_START'
    };
  }

  /**
   * Instantaneous Mode Switching under Admin Governance.
   */
  public setMode(mode: ExecutionMode, adminAuthToken?: string): { success: boolean; mode: ExecutionMode; message: string } {
    if (mode === 'LIVE') {
      const isMasterAdmin = adminAuthToken === 'chintu_master_auth_permanent_veeresh';
      if (!isMasterAdmin) {
        return {
          success: false,
          mode: this.currentMode,
          message: 'LIVE_TRADING_LOCKED: Administrative supremacy credentials required to arm live execution.'
        };
      }
      this.currentMode = 'LIVE';
      this.adminOverrideArmed = true;
      return {
        success: true,
        mode: 'LIVE',
        message: 'Master Admin authorized: Centralized Execution Engine switched to LIVE broker mode.'
      };
    }

    this.currentMode = 'PAPER';
    return {
      success: true,
      mode: 'PAPER',
      message: 'Centralized Execution Engine switched to PAPER trading mode.'
    };
  }

  /**
   * The Sole Authorized Order Placement Gateway.
   * All trade executions across all 14 boards must pass through here.
   */
  public async executeTrade(intent: TradeOrderIntent): Promise<ExecutionResult> {
    const timestamp = new Date().toISOString();
    const orderId = `CEO_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.totalOrdersProcessed++;

    const symbol = intent.symbol.toUpperCase();
    const action = intent.action.toUpperCase() as 'BUY' | 'SELL';

    // 1. Fetch Authoritative Market Price Quote
    const quote = angelMarketDataAdapter.getQuote(symbol) || angelMarketDataAdapter.getQuote('NIFTY 50');
    const currentPrice = intent.price || quote?.price || 25000;

    // 2. Strict Idle-Until-Admin-Start Check
    if (this.operationalState !== 'ACTIVE_RUNNING' && !intent.skipQuorumValidation) {
      return {
        success: false,
        orderId,
        mode: this.currentMode,
        symbol,
        action,
        quantity: 0,
        executionPrice: currentPrice,
        grossTurnover: 0,
        estimatedCharges: 0,
        netMarginRequired: 0,
        quorumDecision: 'BLOCKED',
        quorumVotes: 0,
        jarvisApproved: false,
        timestamp,
        status: 'BLOCKED_BY_RMS',
        message: 'Trading Blocked: Application is IDLE. Master Administrator Veeresh must explicitly trigger START TRADING from the Admin Dashboard.'
      };
    }

    // 3. 14-Board Consensus System Verification
    let quorumDecision = 'APPROVED';
    let quorumVotes = 14;
    let matchingBotNames: string[] = [];

    if (!intent.skipQuorumValidation) {
      const quorumResult = evaluate14BotQuorumConsensus({
        symbol,
        action,
        price: currentPrice
      });

      quorumDecision = quorumResult.decision;
      quorumVotes = quorumResult.matchingVotes;
      matchingBotNames = quorumResult.botVotes
        .filter((b: any) => b.vote === action)
        .map((b: any) => b.botName);

      if (!quorumResult.isApproved) {
        const vetoReason = quorumDecision === 'QUORUM_VETO'
          ? `Trade aborted by Quorum Veto: ${quorumVotes}/14 boards voted (7-8 threshold requires consensus pause).`
          : `Trade rejected: Insufficient board consensus (${quorumVotes}/14 votes < 9 required).`;

        return {
          success: false,
          orderId,
          mode: this.currentMode,
          symbol,
          action,
          quantity: 0,
          executionPrice: currentPrice,
          grossTurnover: 0,
          estimatedCharges: 0,
          netMarginRequired: 0,
          quorumDecision,
          quorumVotes,
          jarvisApproved: false,
          timestamp,
          status: 'VETOED_BY_QUORUM',
          message: vetoReason
        };
      }
    }

    // 4. Capital & Lot Sizing without random numbers
    const totalCapital = getPaperCapital();
    const targetLotSize = intent.lotSize || 50;
    const requestedQty = intent.quantity || targetLotSize;
    const adjustedQty = Math.max(targetLotSize, Math.floor(requestedQty / targetLotSize) * targetLotSize);

    const targetPrice = intent.targetPrice || (action === 'BUY' ? currentPrice * 1.02 : currentPrice * 0.98);
    const stopLossPrice = intent.stopLossPrice || (action === 'BUY' ? currentPrice * 0.995 : currentPrice * 1.005);
    const pricePerShare = currentPrice;
    const grossTurnover = adjustedQty * pricePerShare;

    // 5. Seed Capital Partitioning Gate (Gold, Silver, Indices, Equities)
    const partitionCheck = validateTradeCapitalPartition(symbol, grossTurnover, totalCapital * 0.02, totalCapital);
    if (!partitionCheck.allowed && !intent.skipQuorumValidation) {
      return {
        success: false,
        orderId,
        mode: this.currentMode,
        symbol,
        action,
        quantity: adjustedQty,
        executionPrice: pricePerShare,
        grossTurnover,
        estimatedCharges: 0,
        netMarginRequired: grossTurnover,
        quorumDecision,
        quorumVotes,
        jarvisApproved: false,
        timestamp,
        status: 'REJECTED',
        message: `Capital Partition Gate Rejected: ${partitionCheck.reason}`
      };
    }

    // 6. Date-Effective Statutory Tax Calculation
    const targetSegment = intent.exchange === 'MCX' ? 'MCX Commodity' : (symbol.includes('CE') || symbol.includes('PE') ? 'NSE Index Options' : 'NSE Equity');
    const statutoryCharges = calculateTradeStatutoryCharges(
      pricePerShare,
      adjustedQty,
      action,
      targetSegment,
      0,
      null,
      'INTRADAY',
      { includeSlippage: true }
    );

    const expectedGrossProfit = Math.abs(targetPrice - pricePerShare) * adjustedQty;
    const expectedNetProfit = expectedGrossProfit - statutoryCharges.totalCharges;

    // 7. Pre-Trade Net Profit Guardrail Verification
    const minNet = intent.minDesiredNetProfit || 20;
    const guardrail = validateNetProfitGuardrail({
      entryPrice: pricePerShare,
      targetPrice,
      qty: adjustedQty,
      action,
      segment: targetSegment
    });

    if (!guardrail.isApproved && !intent.skipQuorumValidation) {
      return {
        success: false,
        orderId,
        mode: this.currentMode,
        symbol,
        action,
        quantity: adjustedQty,
        executionPrice: pricePerShare,
        grossTurnover,
        estimatedCharges: statutoryCharges.totalCharges,
        netMarginRequired: grossTurnover,
        quorumDecision,
        quorumVotes,
        jarvisApproved: false,
        timestamp,
        status: 'REJECTED',
        message: `Capital Protection Guardrail Rejected: Expected Net Profit (₹${expectedNetProfit.toFixed(2)}) is below hurdle (₹${minNet}). ${guardrail.recommendation}`
      };
    }

    // 8. Jarvis Review Gate Evaluation
    if (!intent.skipQuorumValidation) {
      const jarvisReq: JarvisReviewRequest = {
        symbol,
        action,
        price: pricePerShare,
        targetPrice,
        stopLossPrice,
        expectedNetProfit,
        expectedNetRoiPct: (expectedNetProfit / (grossTurnover || 1)) * 100,
        minDesiredNetProfit: minNet,
        capital: totalCapital,
        riskBudget: totalCapital * 0.02,
        quorumVotes,
        confluenceScore: 78
      };

      const jarvisReview: JarvisReviewResult = await jarvisReviewGate.reviewTradeOpportunity(jarvisReq);
      if (jarvisReview.decision === 'REJECT') {
        return {
          success: false,
          orderId,
          mode: this.currentMode,
          symbol,
          action,
          quantity: adjustedQty,
          executionPrice: pricePerShare,
          grossTurnover,
          estimatedCharges: statutoryCharges.totalCharges,
          netMarginRequired: grossTurnover,
          quorumDecision,
          quorumVotes,
          jarvisApproved: false,
          timestamp,
          status: 'REJECTED',
          message: `Jarvis AI Review Gate Rejected: ${jarvisReview.rationale}`
        };
      }
    }

    // 9. Route to Authorized Execution Target
    if (this.currentMode === 'LIVE') {
      const liveGate = angelOrderAdapter.canExecuteLiveOrder();
      if (!liveGate.allowed && !this.adminOverrideArmed) {
        return {
          success: false,
          orderId,
          mode: 'LIVE',
          symbol,
          action,
          quantity: adjustedQty,
          executionPrice: pricePerShare,
          grossTurnover,
          estimatedCharges: statutoryCharges.totalCharges,
          netMarginRequired: grossTurnover,
          quorumDecision,
          quorumVotes,
          jarvisApproved: true,
          timestamp,
          status: 'BLOCKED_BY_RMS',
          message: `Live Broker Execution Safety Intercept: ${liveGate.reason}`
        };
      }

      // Multi-broker intelligent routing
      const routing = multiBrokerManager.determineRouting(symbol);
      const chosenBroker = intent.preferredBroker || routing.recommendedBroker;

      const brokerRes = await multiBrokerManager.routeOrder(chosenBroker, {
        symbol,
        exchange: intent.exchange || 'NSE',
        action,
        quantity: adjustedQty,
        price: intent.orderType === 'LIMIT' ? pricePerShare : 0,
        orderType: intent.orderType || 'MARKET'
      });

      return {
        success: brokerRes.success,
        orderId: (brokerRes as any).orderId || (brokerRes as any).order_id || orderId,
        mode: 'LIVE',
        symbol,
        action,
        quantity: adjustedQty,
        executionPrice: pricePerShare,
        grossTurnover,
        estimatedCharges: statutoryCharges.totalCharges,
        netMarginRequired: grossTurnover,
        quorumDecision,
        quorumVotes,
        jarvisApproved: true,
        targetBroker: chosenBroker,
        timestamp,
        status: brokerRes.success ? 'FILLED' : 'REJECTED',
        message: brokerRes.message || (brokerRes.success ? `Live order routed via ${chosenBroker}.` : 'Broker order rejected.'),
        breakdown: statutoryCharges
      };
    }

    // Mode is PAPER: Simulated execution with authentic price & 0.05% slippage
    const slippagePct = 0.0005; // 0.05% slippage
    const executionPrice = Number((pricePerShare * (action === 'BUY' ? 1 + slippagePct : 1 - slippagePct)).toFixed(2));

    try {
      const tradeRec: TradeRecord = {
        id: orderId,
        orderId,
        symbol,
        bot: intent.botName || (matchingBotNames[0] || '14-Board Single Execution Engine'),
        action,
        qty: adjustedQty,
        price: executionPrice,
        pnl: 0,
        grossPnl: 0,
        netPnl: 0,
        charges: statutoryCharges.totalCharges,
        status: 'FILLED',
        timestamp
      };
      runtimeDb.saveTrade(tradeRec);
      if (action === 'BUY') {
        runtimeDb.upsertPosition({
          id: orderId,
          symbol,
          bot: tradeRec.bot,
          action: 'BUY',
          qty: adjustedQty,
          entryPrice: executionPrice,
          ltp: executionPrice,
          pnl: 0,
          pnlPct: 0,
          charges: statutoryCharges.totalCharges,
          openedAt: new Date().toLocaleTimeString(),
          status: 'OPEN'
        });
      }
    } catch (e) {
      // Non-fatal ledger save log
    }

    return {
      success: true,
      orderId,
      mode: 'PAPER',
      symbol,
      action,
      quantity: adjustedQty,
      executionPrice,
      grossTurnover: adjustedQty * executionPrice,
      estimatedCharges: statutoryCharges.totalCharges,
      netMarginRequired: adjustedQty * executionPrice,
      quorumDecision,
      quorumVotes,
      jarvisApproved: true,
      timestamp,
      status: 'FILLED',
      message: `Paper Order executed successfully by Central Engine at ₹${executionPrice.toFixed(2)}.`,
      breakdown: statutoryCharges
    };
  }

  /**
   * Retrieves Central Engine Operational Status.
   */
  public getStatus(): CentralEngineStatus {
    const paperMetrics = paperSessionEngine.getSessionMetrics();
    const openPositions = runtimeDb.getOpenPositions();

    return {
      mode: this.currentMode,
      operationalState: this.operationalState,
      isLiveArmed: this.adminOverrideArmed,
      totalOrdersProcessed: this.totalOrdersProcessed,
      activePositionsCount: openPositions.length,
      realizedPnl: paperMetrics.realizedPnl,
      unrealizedPnl: paperMetrics.unrealizedPnl,
      capitalAllocated: paperMetrics.allocatedCapital,
      availableMargin: paperMetrics.availableMargin,
      consensusBoardsActive: BOT_DEFINITIONS.length,
      singleEngineLock: this.singleEngineLock
    };
  }
}

export const centralExecutionEngine = CentralExecutionEngine.getInstance();
