/**
 * CHINTU AI TRADING SYSTEM - 14-Bot Millisecond Quorum Decision Network Engine
 * Strict Institutional Rule:
 * 1. 9/14 Quorum Consensus: A BUY, SELL, or HOLD order must only be triggered
 *    when at least 9 out of 14 specialized AI bots reach mathematical agreement.
 * 2. 7 to 8 Bot Votes: Strict Gate -> Hard abort and log as official "Quorum Veto".
 * 3. <= 6 Bot Votes: Abort as "Insufficient Consensus".
 */

import { evaluate14BotQuorumConsensus, BOT_DEFINITIONS, QUORUM_DECISION_TYPES } from './quorumConsensusEngine';

export { evaluate14BotQuorumConsensus, BOT_DEFINITIONS, QUORUM_DECISION_TYPES };

export const QUANT_BOT_REGISTRY = BOT_DEFINITIONS.map((b) => ({
  id: b.id,
  name: b.name,
  asset: b.asset,
  segment: b.segment,
  lotSize: b.lotSize,
  strategy: b.strategyDescription,
  domain: b.domain,
  weight: b.weight
}));

/**
 * Executes 14-bot consensus verification before order placement with strict 9/14 Quorum.
 * @param {number|string} botIdentifier - Bot ID (1-14) or Bot name
 * @param {string} proposedAction - 'BUY' or 'SELL'
 * @param {object} marketState - Current live ticker prices, trend signals
 * @param {Array} candles - Historical candlestick series
 * @returns {object} Handshake resolution { approved, isQuorumMet, decision, approvalCount, totalBots, ... }
 */
export function evaluatePeerPermissionHandshake(botIdentifier, proposedAction = 'BUY', marketState = {}, candles = []) {
  const bot = QUANT_BOT_REGISTRY.find(
    (b) => b.id === Number(botIdentifier) || b.name.toLowerCase() === String(botIdentifier).toLowerCase()
  ) || QUANT_BOT_REGISTRY[0];

  const quorumResult = evaluate14BotQuorumConsensus({
    symbol: bot.asset,
    action: proposedAction,
    price: marketState[bot.asset]?.price || 25000,
    candles,
    customMarketState: marketState
  });

  return {
    originBotId: bot.id,
    originBotName: bot.name,
    targetAsset: bot.asset,
    action: proposedAction.toUpperCase(),
    approved: quorumResult.isApproved,
    quorumReached: quorumResult.isApproved,
    decision: quorumResult.decision,
    isQuorumVeto: quorumResult.decision === QUORUM_DECISION_TYPES.QUORUM_VETO,
    decisionMessage: quorumResult.decisionMessage,
    approvalCount: quorumResult.matchingVotes,
    totalPeers: 14,
    totalBots: 14,
    quorumPercentage: `${quorumResult.consensusPercentage}%`,
    consensusLabel: `${quorumResult.matchingVotes}/14 Quorum`,
    peerDetails: quorumResult.botVotes,
    confluence: quorumResult.confluence,
    auditTimestamp: quorumResult.auditTimestamp
  };
}
