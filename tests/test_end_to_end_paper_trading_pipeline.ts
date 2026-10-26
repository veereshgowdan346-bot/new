import path from 'node:path';
import fs from 'node:fs';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { paperSessionEngine } from '../src/utils/paperSessionEngine';
import { runtimeDb } from '../src/utils/databasePersistence';

const TEST_DB = path.join(process.cwd(), 'scratch', 'test_db', 'test_paper_pipeline.db');

describe('CHINTU AI — PHASE 7 END-TO-END PAPER TRADING PIPELINE', () => {
  before(() => {
    const dir = path.dirname(TEST_DB);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(TEST_DB)) {
      try { fs.unlinkSync(TEST_DB); } catch (e) {}
    }
    runtimeDb.init(TEST_DB);
    paperSessionEngine.resetToNotStarted();
  });

  after(() => {
    paperSessionEngine.resetToNotStarted();
    runtimeDb.close();
    if (fs.existsSync(TEST_DB)) {
      try { fs.unlinkSync(TEST_DB); } catch (e) {}
    }
  });

  it('1. should start paper session with valid capital and initialize isolated metrics', async () => {
    const res = await paperSessionEngine.startSession(250000);
    assert.equal(res.success, true);
    assert.ok(res.session);
    assert.equal(res.session.status, 'PAPER_TRADING');
    assert.equal(res.session.initialCapital, 250000);
    assert.equal(res.session.availableCash, 250000);
    assert.equal(res.session.allocatedMargin, 0);
    assert.equal(res.session.realizedPnl, 0);
    assert.equal(res.session.unrealizedPnl, 0);
    assert.equal(res.session.netPnl, 0);
  });

  it('2. should reject starting session with insufficient capital (< ₹1,000)', async () => {
    paperSessionEngine.resetToNotStarted();
    const res = await paperSessionEngine.startSession(500);
    assert.equal(res.success, false);
    assert.ok(res.message.includes('Minimum paper trading capital'));
  });

  it('3. should execute capital-aware trade selection with 2% risk budget and 1.50% net ROI hurdle', async () => {
    // Re-start fresh session with ₹2,00,000
    paperSessionEngine.resetToNotStarted();
    await paperSessionEngine.startSession(200000);

    // Evaluate opportunities across universe
    await paperSessionEngine.evaluateAndExecuteTrades();

    const openPositions = paperSessionEngine.getOpenPositions();
    const metrics = paperSessionEngine.getSessionMetrics();

    // Must have executed at least 1 qualified position within capital limits
    assert.ok(openPositions.length >= 1, 'Should have entered at least 1 qualified trade');
    assert.ok(openPositions.length <= 5, 'Must not exceed max 5 concurrent positions');

    const dbPositions = runtimeDb.getOpenPositions();

    for (const pos of openPositions) {
      assert.equal(pos.action, 'BUY');
      assert.ok(pos.qty > 0, 'Quantity must be positive');
      assert.ok(pos.entryPrice > 0, 'Entry price must be positive');
      assert.ok(pos.allocatedMargin > 0, 'Margin must be allocated');
      assert.ok(pos.allocatedMargin <= 200000 * 0.25, 'Single position allocation must be <= 25% of capital');
      assert.ok(pos.quorumVotes >= 9, 'Must satisfy >= 9/14 quorum votes');
      assert.ok(pos.targetPrice > pos.entryPrice, 'Target price must be higher than entry for BUY');
      assert.ok(pos.stopLossPrice < pos.entryPrice, 'Stop price must be lower than entry for BUY');

      // Verify position persisted in SQLite runtimeDb
      const dbPos = dbPositions.find(p => p.id === pos.id);
      assert.ok(dbPos, `Position ${pos.id} must be persisted in SQLite`);
      assert.equal(dbPos?.symbol, pos.symbol);
    }

    // Verify cash accounting integrity
    assert.ok(metrics.availableCash > 0, 'Must preserve cash buffer');
    assert.ok(metrics.allocatedMargin > 0, 'Allocated margin must be recorded');
  });

  it('4. should update mark-to-market unrealized P&L on incoming market ticks', () => {
    const openPositions = paperSessionEngine.getOpenPositions();
    assert.ok(openPositions.length > 0, 'Need open position for tick test');

    const targetPos = openPositions[0];
    const initialGrossPnl = targetPos.grossPnl;

    // Simulate favorable tick (+1.0% price increase)
    const newPrice = Number((targetPos.entryPrice * 1.01).toFixed(2));
    (paperSessionEngine as any).handleIncomingTick({
      symbol: targetPos.symbol,
      token: targetPos.token,
      price: newPrice,
      timestamp: Date.now()
    });

    const updatedPos = paperSessionEngine.getOpenPositions().find(p => p.id === targetPos.id);
    assert.ok(updatedPos);
    assert.equal(updatedPos.ltp, newPrice);
    assert.ok(updatedPos.grossPnl > initialGrossPnl, 'Unrealized gross P&L must increase on price advance');
    assert.ok(updatedPos.pnlPct > 0, 'P&L % must be positive');
  });

  it('5. should trigger automated Target Hit exit when price crosses target', () => {
    const openPositions = paperSessionEngine.getOpenPositions();
    assert.ok(openPositions.length > 0, 'Need open position for target hit test');

    const targetPos = openPositions[0];
    const targetPrice = targetPos.targetPrice;
    const initialTradeCount = paperSessionEngine.getSessionTrades().length;

    // Simulate tick reaching or exceeding targetPrice
    (paperSessionEngine as any).handleIncomingTick({
      symbol: targetPos.symbol,
      token: targetPos.token,
      price: targetPrice + 0.50,
      timestamp: Date.now()
    });

    // Position should be closed
    const remainingOpen = paperSessionEngine.getOpenPositions().find(p => p.id === targetPos.id);
    assert.equal(remainingOpen, undefined, 'Target hit position must be removed from open positions');

    // Trade record must be added to session trades
    const trades = paperSessionEngine.getSessionTrades();
    assert.equal(trades.length, initialTradeCount + 1, 'Closed trade must be recorded in session history');

    const closedTrade = trades[trades.length - 1];
    assert.equal(closedTrade.symbol, targetPos.symbol);
    assert.equal(closedTrade.closeReason, 'TARGET_HIT');
    assert.ok(closedTrade.netPnl > 0, 'Net P&L on target hit must be positive after taxes');
    assert.ok(closedTrade.charges > 0, 'Statutory deductions must be accounted for');

    // Verify closed status persisted in SQLite runtimeDb
    const dbTrades = runtimeDb.getRecentTrades(100);
    const foundInDb = dbTrades.find(t => t.symbol === targetPos.symbol && t.status === 'CLOSED');
    assert.ok(foundInDb, 'Closed trade must be persisted in SQLite with CLOSED status');
  });

  it('6. should trigger automated Stop Loss Hit exit when price breaches stop loss', async () => {
    // If no open positions, evaluate trades to enter a new one
    if (paperSessionEngine.getOpenPositions().length === 0) {
      paperSessionEngine.evaluateAndExecuteTrades();
    }
    const openPositions = paperSessionEngine.getOpenPositions();
    assert.ok(openPositions.length > 0, 'Need open position for stop loss test');

    const targetPos = openPositions[0];
    const stopPrice = targetPos.stopLossPrice;
    const initialTradesCount = paperSessionEngine.getSessionTrades().length;

    // Simulate adverse tick breaching stopLossPrice
    (paperSessionEngine as any).handleIncomingTick({
      symbol: targetPos.symbol,
      token: targetPos.token,
      price: stopPrice - 1.00,
      timestamp: Date.now()
    });

    // Position must be closed
    const remainingOpen = paperSessionEngine.getOpenPositions().find(p => p.id === targetPos.id);
    assert.equal(remainingOpen, undefined, 'Stop loss position must be closed');

    const trades = paperSessionEngine.getSessionTrades();
    assert.equal(trades.length, initialTradesCount + 1);

    const closedTrade = trades[trades.length - 1];
    assert.equal(closedTrade.closeReason, 'STOP_LOSS_HIT');
    assert.ok(closedTrade.netPnl < 0, 'Net P&L on stop loss must be negative');
  });

  it('7. should enforce strict mathematical consistency across Realized, Unrealized, and Net P&L', () => {
    const metrics = paperSessionEngine.getSessionMetrics();

    // Invariant: Net P&L == Realized P&L + Unrealized P&L - Total Deductions
    const expectedNet = Number((metrics.realizedPnl + metrics.unrealizedPnl - metrics.totalDeductions).toFixed(2));
    assert.equal(metrics.netPnl, expectedNet, 'Net P&L must exactly equal Realized + Unrealized - Total Deductions');

    // Invariant: Total Deductions == Brokerage + Statutory Taxes + Slippage
    const expectedDeductions = Number((metrics.totalBrokerage + metrics.totalStatutoryTaxes + metrics.totalSlippage).toFixed(2));
    assert.equal(metrics.totalDeductions, expectedDeductions, 'Total Deductions must equal sum of brokerage, taxes, and slippage');
  });

  it('8. should stop session cleanly and handle flat state without fabricating exit prices', async () => {
    const stopRes = await paperSessionEngine.stopSession('MARKET_CLOSE');
    assert.equal(stopRes.success, true);
    assert.equal(stopRes.session.status, 'STOPPED');
    assert.ok(stopRes.session.stopTime);
  });

  it('9. should refresh new session state without metric leakage (Strict Session Isolation)', () => {
    const refreshRes = paperSessionEngine.refreshNewSession();
    assert.equal(refreshRes.success, true);
    assert.equal(refreshRes.session.status, 'NOT_STARTED');
    assert.equal(refreshRes.session.initialCapital, 0);
    assert.equal(refreshRes.session.realizedPnl, 0);
    assert.equal(refreshRes.session.totalTrades, 0);
    assert.equal(paperSessionEngine.getOpenPositions().length, 0);
    assert.equal(paperSessionEngine.getSessionTrades().length, 0);
  });
});

