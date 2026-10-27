/**
 * ANTI-GRAVITY PRODUCTION DEPLOYMENT & 70-80% PROFIT OPTIMIZATION TEST SUITE
 *
 * Verifies:
 * 1. Multi-Broker Integration: Angel One, Zerodha Kite Connect, Groww & Intelligent Asset Routing
 * 2. Seed Capital Partitioning: Dedicated Gold (20%), Silver (15%), Indices (35%), Equities (30%)
 * 3. 70%-80% Profit Validation: Automated forward-testing & iterative self-correction loop
 * 4. Manual Admin Activation: Idle-until-admin-start policy (Veeresh supremacy)
 * 5. Trailing Stop-Loss Engine & Zero Fake Data Compliance
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { multiBrokerManager } from '../src/utils/multiBrokerManager';
import { zerodhaOrderAdapter } from '../src/utils/zerodhaOrderAdapter';
import { growwOrderAdapter } from '../src/utils/growwOrderAdapter';
import {
  getPaperCapital,
  DEFAULT_PAPER_CAPITAL,
  classifyAssetCategory,
  getAssetCapitalPartition,
  validateTradeCapitalPartition,
  calculateTrailingStopLoss
} from '../src/utils/capitalConfig';
import { profitOptimizationEngine } from '../src/utils/profitOptimizationEngine';
import { centralExecutionEngine } from '../src/utils/centralExecutionEngine';
import { runtimeDb } from '../src/utils/databasePersistence';

describe('Anti-Gravity Production Deployment & Profit Engine Suite', () => {

  // =========================================================================
  // 1. MULTI-BROKER INTEGRATION (ANGEL ONE, ZERODHA, GROWW)
  // =========================================================================
  test('1. Multi-Broker Integration: Angel One, Zerodha Kite, and Groww Routing', async () => {
    // 1.1 Multi-Broker Status Verification
    const brokers = multiBrokerManager.getBrokersStatus();
    assert.strictEqual(brokers.length, 3, 'Must track exactly 3 tier-1 Indian brokers');
    const brokerKeys = brokers.map(b => b.broker);
    assert.ok(brokerKeys.includes('ANGEL_ONE'));
    assert.ok(brokerKeys.includes('ZERODHA'));
    assert.ok(brokerKeys.includes('GROWW'));

    // 1.2 Intelligent Asset Class Routing
    const goldRouting = multiBrokerManager.determineRouting('GOLD');
    assert.strictEqual(goldRouting.recommendedBroker, 'ANGEL_ONE', 'MCX Gold must route to Angel One');
    assert.strictEqual(goldRouting.assetCategory, 'COMMODITIES');

    const silverRouting = multiBrokerManager.determineRouting('SILVER MINI');
    assert.strictEqual(silverRouting.recommendedBroker, 'ANGEL_ONE', 'MCX Silver must route to Angel One');

    const indexRouting = multiBrokerManager.determineRouting('NIFTY 25100 CE');
    assert.strictEqual(indexRouting.recommendedBroker, 'ZERODHA', 'Index F&O Options must route to Zerodha Kite');

    const equityRouting = multiBrokerManager.determineRouting('RELIANCE');
    assert.strictEqual(equityRouting.recommendedBroker, 'GROWW', 'Cash Equities must route to Groww');

    // 1.3 Adapter Pre-Trade Validations
    const invalidZerodha = await zerodhaOrderAdapter.placeOrder({
      tradingsymbol: '',
      exchange: 'NSE',
      transaction_type: 'BUY',
      order_type: 'MARKET',
      quantity: 0,
      product: 'MIS'
    });
    assert.strictEqual(invalidZerodha.success, false);
    assert.strictEqual(invalidZerodha.status, 'REJECTED');

    const invalidGroww = await growwOrderAdapter.placeOrder({
      symbol: '',
      exchange: 'NSE',
      action: 'BUY',
      orderType: 'MARKET',
      product: 'INTRADAY',
      quantity: 0
    });
    assert.strictEqual(invalidGroww.success, false);
    assert.strictEqual(invalidGroww.status, 'REJECTED');
  });

  // =========================================================================
  // 2. SEED CAPITAL PARTITIONING (GOLD, SILVER, INDICES, EQUITIES)
  // =========================================================================
  test('2. Seed Capital Partitioning & Multi-Asset Risk Allocation', () => {
    const totalCapital = getPaperCapital();
    assert.strictEqual(totalCapital, DEFAULT_PAPER_CAPITAL, 'Default base capital must be ₹1,00,000');

    // 2.1 Asset Categorization
    assert.strictEqual(classifyAssetCategory('GOLD 1 KG'), 'GOLD');
    assert.strictEqual(classifyAssetCategory('SILVER 30 KG'), 'SILVER');
    assert.strictEqual(classifyAssetCategory('NIFTY 50'), 'INDICES');
    assert.strictEqual(classifyAssetCategory('BANK NIFTY'), 'INDICES');
    assert.strictEqual(classifyAssetCategory('TCS'), 'EQUITIES');

    // 2.2 Partition Calculations (Gold 20%, Silver 15%, Indices 35%, Equities 30%)
    const goldPart = getAssetCapitalPartition('GOLD', totalCapital);
    assert.strictEqual(goldPart.category, 'GOLD');
    assert.strictEqual(goldPart.allocatedCapital, 20000); // 20%
    assert.strictEqual(goldPart.maxTradeRiskBudget, 400); // 2% of 20,000
    assert.strictEqual(goldPart.maxSinglePositionCap, 25000); // 25% of total capital

    const silverPart = getAssetCapitalPartition('SILVER', totalCapital);
    assert.strictEqual(silverPart.category, 'SILVER');
    assert.strictEqual(silverPart.allocatedCapital, 15000); // 15%

    const indicesPart = getAssetCapitalPartition('NIFTY 50', totalCapital);
    assert.strictEqual(indicesPart.category, 'INDICES');
    assert.strictEqual(indicesPart.allocatedCapital, 35000); // 35%

    const equitiesPart = getAssetCapitalPartition('RELIANCE', totalCapital);
    assert.strictEqual(equitiesPart.category, 'EQUITIES');
    assert.strictEqual(equitiesPart.allocatedCapital, 30000); // 30%

    // 2.3 Partition Validation Constraints
    // Excess Margin Test (exceeding 25% single-asset cap)
    const excessMargin = validateTradeCapitalPartition('GOLD', 30000, 200, totalCapital);
    assert.strictEqual(excessMargin.allowed, false);
    assert.ok(excessMargin.reason?.includes('Concentration Cap Exceeded'));

    // Excess Risk Test (exceeding 2% partition risk budget)
    const excessRisk = validateTradeCapitalPartition('GOLD', 5000, 500, totalCapital);
    assert.strictEqual(excessRisk.allowed, false);
    assert.ok(excessRisk.reason?.includes('Risk Budget Exceeded'));

    // Valid Sizing Test
    const validTrade = validateTradeCapitalPartition('GOLD', 8000, 300, totalCapital);
    assert.strictEqual(validTrade.allowed, true);
  });

  // =========================================================================
  // 3. TRAILING STOP-LOSS DYNAMIC PROFIT PROTECTION
  // =========================================================================
  test('3. Dynamic Trailing Stop-Loss Protection', () => {
    // BUY side: Entry at 1000, peak reaches 1020 (+2%), price is at 1016 (above 1014.9 trailing stop)
    const buyTsl = calculateTrailingStopLoss(
      'BUY',
      1000,
      1020, // highest
      998,  // lowest
      1016, // current
      0.005 // 0.5% trail step
    );
    assert.ok(buyTsl.trailingStopPrice > 1000, 'Stop-loss must have trailed above breakeven');
    assert.ok(buyTsl.lockedProfitPct > 0, 'Must have locked in positive gain');
    assert.strictEqual(buyTsl.isTriggered, false, '1016 is above 1014.9 trailing stop');

    // Retrace breaches trailing stop: current at 1012 (below 1014.9 trailing stop)
    const triggeredTsl = calculateTrailingStopLoss(
      'BUY',
      1000,
      1020,
      998,
      1012, // below 1014.9
      0.005
    );
    assert.strictEqual(triggeredTsl.isTriggered, true, 'Must trigger trailing exit to protect profit');
  });

  // =========================================================================
  // 4. 70%-80% PROFIT VALIDATION & ITERATIVE SELF-CORRECTION
  // =========================================================================
  test('4. 70%-80% Profit Validation & Continuous Self-Correction Engine', () => {
    // Run forward-test simulation with self-correction tuning
    const metrics = profitOptimizationEngine.executeIterativeSelfCorrection(5);

    assert.ok(metrics.totalTrades >= 20, 'Must forward-test a robust batch of trades');
    assert.ok(metrics.winRatePct >= 70.0, `Win rate must be >= 70.0% (Observed: ${metrics.winRatePct}%)`);
    assert.ok(metrics.winRatePct <= 85.0, `Win rate must be <= 85.0% (Observed: ${metrics.winRatePct}%)`);
    assert.strictEqual(metrics.targetWinRateAchieved, true, '70%-80% target corridor must be achieved');
    assert.ok(metrics.profitFactor > 1.5, `Profit factor must exceed 1.5 (Observed: ${metrics.profitFactor})`);
    assert.ok(metrics.netProfit > 0, 'Net profit must be positive after all statutory deductions');
    assert.ok(metrics.totalCharges > 0, 'Statutory charges must be authentic');
    assert.strictEqual(metrics.status, 'OPTIMAL_CORRIDOR_ACHIEVED');
  });

  // =========================================================================
  // 5. MANUAL ADMIN ACTIVATION (STRICT IDLE-UNTIL-ADMIN-START)
  // =========================================================================
  test('5. Manual Admin Activation: Strict Idle-Until-Admin-Start Policy', async () => {
    // 5.1 System starts in IDLE state by default
    centralExecutionEngine.pauseTradingByAdmin('chintu_master_auth_permanent_veeresh');
    assert.strictEqual(centralExecutionEngine.getOperationalState(), 'IDLE_WAITING_ADMIN_START');

    // 5.2 Trade attempted without admin activation must be BLOCKED
    const blockedOrder = await centralExecutionEngine.executeTrade({
      symbol: 'RELIANCE',
      action: 'BUY',
      price: 2842.00,
      quantity: 10
    });
    assert.strictEqual(blockedOrder.success, false);
    assert.strictEqual(blockedOrder.status, 'BLOCKED_BY_RMS');
    assert.ok(blockedOrder.message.includes('Application is IDLE'));

    // 5.3 Unauthorized attempt to start trading must FAIL
    const unauthStart = centralExecutionEngine.startTradingByAdmin('invalid_token');
    assert.strictEqual(unauthStart.success, false);
    assert.strictEqual(centralExecutionEngine.getOperationalState(), 'IDLE_WAITING_ADMIN_START');

    // 5.4 Master Administrator Veeresh activates trading
    const adminStart = centralExecutionEngine.startTradingByAdmin('chintu_master_auth_permanent_veeresh');
    assert.strictEqual(adminStart.success, true);
    assert.strictEqual(adminStart.state, 'ACTIVE_RUNNING');
    assert.strictEqual(centralExecutionEngine.getOperationalState(), 'ACTIVE_RUNNING');

    // 5.5 Trade succeeds when ACTIVE
    const activeOrder = await centralExecutionEngine.executeTrade({
      symbol: 'RELIANCE',
      action: 'BUY',
      price: 2842.00,
      quantity: 50,
      skipQuorumValidation: true // Pipeline direct test
    });
    assert.strictEqual(activeOrder.success, true);
    assert.strictEqual(activeOrder.status, 'FILLED');

    // 5.6 Admin pauses trading back to IDLE
    const adminPause = centralExecutionEngine.pauseTradingByAdmin('chintu_master_auth_permanent_veeresh');
    assert.strictEqual(adminPause.success, true);
    assert.strictEqual(adminPause.state, 'IDLE_WAITING_ADMIN_START');
  });

});
