/**
 * CHINTU AI — JARVIS CONVERSATIONAL MASTER CONTROLLER TEST SUITE
 *
 * Verifies:
 * 1. Trade authorization proposal composition:
 *    - Full quantitative review (margin, target, stop, charges, net profit, feasibility).
 * 2. Bilingual summaries (English & Kannada).
 * 3. Proposal authorization workflow:
 *    - Approval grants authorization.
 *    - Single-use authorization token (cannot be replayed).
 *    - Cancellation / rejection disarms proposal cleanly.
 *    - Infeasible proposals cannot be authorized.
 * 4. Failure diagnostic explanations in English and Kannada.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { jarvisMasterController } from '../src/utils/jarvisMasterController';

describe('Jarvis Conversational Master Controller Test Suite', () => {

  test('1. Trade Authorization Proposal: Valid parameters generate full quantitative review', () => {
    const proposal = jarvisMasterController.generateTradeAuthorizationProposal({
      symbol: 'RELIANCE',
      action: 'BUY',
      price: 1194.00,
      capital: 100000,
      minDesiredNetProfit: 60.00,
      stopLossPct: 1.5,
      targetProfitPct: 3.0
    });

    assert.ok(proposal.proposalId.startsWith('prop_'));
    assert.strictEqual(proposal.status, 'PENDING_USER_AUTHORIZATION');
    assert.strictEqual(proposal.parameters.symbol, 'RELIANCE');
    assert.strictEqual(proposal.parameters.isFeasible, true);
    assert.ok(proposal.parameters.recommendedQty > 0);
    assert.ok(proposal.parameters.requiredMargin > 0);
    assert.ok(proposal.parameters.expectedNetProfit > 0);
    assert.ok(proposal.parameters.statutoryCharges > 0);
    assert.strictEqual(proposal.parameters.riskBudget, 2000); // 2% of ₹1,00,000

    // Bilingual summaries
    assert.ok(proposal.englishSummary.includes('TRADE REVIEW'));
    assert.ok(proposal.englishSummary.includes('Required Margin'));
    assert.ok(proposal.kannadaSummary.includes('ವ್ಯಾಪಾರ ವಿಮರ್ಶೆ'));
    assert.ok(proposal.kannadaSummary.includes('ಮಾರ್ಜಿನ್'));
  });

  test('2. Authorization Workflow: Explicit approval succeeds and marks proposal consumed', () => {
    const proposal = jarvisMasterController.generateTradeAuthorizationProposal({
      symbol: 'TATAMOTORS',
      action: 'BUY',
      price: 263.00,
      capital: 100000
    });

    const authRes = jarvisMasterController.authorizeTradeProposal(proposal.proposalId, 'APPROVED');
    assert.strictEqual(authRes.success, true);
    assert.strictEqual(authRes.authorized, true);
    assert.strictEqual(authRes.status, 'APPROVED');
    assert.ok(authRes.kannadaMessage.includes('ಯಶಸ್ವಿಯಾಗಿ ಅನುಮೋದಿಸಲಾಗಿದೆ'));

    // Anti-replay guard: cannot authorize a consumed proposal
    const replayRes = jarvisMasterController.authorizeTradeProposal(proposal.proposalId, 'APPROVED');
    assert.strictEqual(replayRes.success, false);
    assert.strictEqual(replayRes.status, 'ALREADY_USED');
  });

  test('3. Cancellation Workflow: User cancellation disarms proposal without committing capital', () => {
    const proposal = jarvisMasterController.generateTradeAuthorizationProposal({
      symbol: 'INFY',
      action: 'BUY',
      price: 1139.00,
      capital: 100000
    });

    const cancelRes = jarvisMasterController.authorizeTradeProposal(proposal.proposalId, 'CANCELLED');
    assert.strictEqual(cancelRes.success, true);
    assert.strictEqual(cancelRes.authorized, false);
    assert.strictEqual(cancelRes.status, 'CANCELLED');
    assert.ok(cancelRes.message.includes('cancelled by user'));
  });

  test('4. Infeasible Trade Rejection: Under-capitalized trades cannot be authorized', () => {
    // ₹1,000 capital for high priced stock RELIANCE @ ₹1,194
    const proposal = jarvisMasterController.generateTradeAuthorizationProposal({
      symbol: 'RELIANCE',
      action: 'BUY',
      price: 1194.00,
      capital: 1000
    });

    assert.strictEqual(proposal.parameters.isFeasible, false);
    assert.ok(proposal.parameters.infeasibilityReason?.includes('Infeasible with capital ₹1,000'));

    const authAttempt = jarvisMasterController.authorizeTradeProposal(proposal.proposalId, 'APPROVED');
    assert.strictEqual(authAttempt.success, false);
    assert.strictEqual(authAttempt.status, 'INFEASIBLE_TRADE');
  });

  test('5. Diagnostic Explanations: Kannada & English explanations are truthful and professional', () => {
    const enDecision = jarvisMasterController.explainDecision('RELIANCE', 'en');
    assert.ok(enDecision.includes('14-bot Master Brain quorum'));
    assert.ok(enDecision.includes('pre-trade net ROI'));

    const knDecision = jarvisMasterController.explainDecision('RELIANCE', 'kn');
    assert.ok(knDecision.includes('ಜಾರ್ವಿಸ್ ವಿಶ್ಲೇಷಣೆ'));
    assert.ok(knDecision.includes('ಒಕ್ಕೂಟವು'));

    const enFailure = jarvisMasterController.explainFailure('BROKER_AUTH_TIMEOUT', 'HTTP 504 gateway timeout', 'en');
    assert.ok(enFailure.includes('LIVE_TRADING_ELIGIBLE = false'));
    assert.ok(enFailure.includes('fail-closed'));

    const knFailure = jarvisMasterController.explainFailure('BROKER_AUTH_TIMEOUT', 'HTTP 504 gateway timeout', 'kn');
    assert.ok(knFailure.includes('ಜಾರ್ವಿಸ್ ದೋಷ ವಿವರಣೆ'));
  });
});
