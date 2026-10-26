import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { angelOrderAdapter, AngelOrderExecutionAdapter } from '../src/utils/angelOrderAdapter';
import { paperSessionEngine } from '../src/utils/paperSessionEngine';
import { angelMarketDataAdapter } from '../src/utils/angelMarketDataAdapter';
import { instrumentMaster } from '../src/utils/instrumentMaster';
import { calculateTradeCharges, validateNetProfitGuardrail } from '../src/utils/taxCalculator';
import { evaluate14BotQuorumConsensus, QUORUM_DECISION_TYPES } from '../src/utils/quorumConsensusEngine';
import {
  isInstitutionalQuantQuery,
  buildQuantHedgeFundPrompt,
  autoDetectProvider,
  getDefaultModelForProvider
} from '../src/services/geminiService';

describe('CHINTU AI — FINAL MASTER INTEGRATION, SAFETY & WORKFLOW VERIFICATION SUITE', () => {

  describe('1. Safety Core & Fail-Closed Invariants', () => {
    it('should enforce compile-time lock AngelOrderExecutionAdapter.LIVE_TRADING_ELIGIBLE = false', () => {
      assert.strictEqual(
        AngelOrderExecutionAdapter.LIVE_TRADING_ELIGIBLE,
        false,
        'LIVE_TRADING_ELIGIBLE must strictly be false'
      );
    });

    it('should strictly reject live broker order placement via canExecuteLiveOrder()', () => {
      const gate = angelOrderAdapter.canExecuteLiveOrder();
      assert.strictEqual(gate.allowed, false);
      assert.ok(gate.reason.includes('LIVE_TRADING_DISABLED'));
    });

    it('should report correct fail-closed safety status from adapter', () => {
      const safety = angelOrderAdapter.getSafetyStatus();
      assert.strictEqual(safety.liveTradingEligible, false);
      assert.strictEqual(safety.isArmed, false);
      assert.strictEqual(safety.rateLimitMaxPerSec, 5);
      assert.strictEqual(safety.safetyMarginPct, 50);
    });
  });

  describe('2. Statutory Deductions & Net-Profit Hurdle Engine', () => {
    it('should accurately calculate Indian statutory taxes (STT, GST, Exchange, SEBI, Stamp Duty)', () => {
      const charges = calculateTradeCharges({
        price: 25000,
        qty: 50,
        action: 'BUY',
        segment: 'NSE Options',
        grossPnl: 1000
      });
      assert.ok(charges.totalCharges > 0);
      assert.ok(charges.brokerage <= 40.0);
      assert.ok(charges.gst > 0);
      assert.ok(charges.sebiCharges > 0);
      assert.ok(charges.stampDuty > 0);
      assert.ok(charges.exchangeTurnover > 0);
    });

    it('should enforce institutional 1.50% net ROI hurdle before approving order fills', () => {
      const approved = validateNetProfitGuardrail({
        entryPrice: 25000,
        targetPrice: 25600, // +2.4% gain
        qty: 50,
        action: 'BUY',
        segment: 'NSE Options',
        safetyBufferPercent: 20,
        hurdleNetRoiPct: 1.50
      });
      assert.strictEqual(approved.isApproved, true);
      assert.ok(approved.expectedNetRoiPct >= 1.50);

      const rejected = validateNetProfitGuardrail({
        entryPrice: 25000,
        targetPrice: 25020, // +0.08% gain (insufficient to cover taxes)
        qty: 50,
        action: 'BUY',
        segment: 'NSE Options',
        safetyBufferPercent: 20,
        hurdleNetRoiPct: 1.50
      });
      assert.strictEqual(rejected.isApproved, false);
      assert.ok(rejected.rejectionReason?.includes('Hard Abort'));
    });
  });

  describe('3. 14-Bot Consensus Quorum Engine (9/14 Strict Rule)', () => {
    it('should require minimum 9 out of 14 bot approvals for consensus', () => {
      const result = evaluate14BotQuorumConsensus({
        symbol: 'NIFTY 50',
        action: 'BUY',
        price: 24750
      });
      assert.ok(result.totalBots === 14);
      assert.ok(typeof result.matchingVotes === 'number');
      assert.ok(typeof result.isApproved === 'boolean');
      if (result.matchingVotes >= 9) {
        assert.strictEqual(result.isApproved, true);
      } else {
        assert.strictEqual(result.isApproved, false);
      }
    });

    it('should identify strict quorum veto when matching votes fall in 7-8 range', () => {
      const result = evaluate14BotQuorumConsensus({
        symbol: 'RELIANCE',
        action: 'BUY',
        price: 2980
      });
      if (result.matchingVotes >= 7 && result.matchingVotes <= 8) {
        assert.strictEqual(result.decision, QUORUM_DECISION_TYPES.QUORUM_VETO);
        assert.strictEqual(result.isApproved, false);
      }
    });
  });

  describe('4. Autonomous Paper Session Engine Lifecycle', () => {
    it('should initialize a fresh capital-aware session with ₹5,00,000 cash', async () => {
      paperSessionEngine.refreshNewSession();
      const startRes = await paperSessionEngine.startSession(500000, { maxRiskPerTradePct: 2.0 });
      assert.strictEqual(startRes.success, true);
      const metrics = paperSessionEngine.getSessionMetrics();
      assert.strictEqual(metrics.status, 'PAPER_TRADING');
      assert.strictEqual(metrics.initialCapital, 500000);
      assert.strictEqual(metrics.availableCash, 500000);
      assert.strictEqual(metrics.allocatedMargin, 0);
    });

    it('should evaluate trades without throwing runtime exceptions', () => {
      assert.doesNotThrow(() => {
        paperSessionEngine.evaluateAndExecuteTrades();
      });
    });

    it('should release all allocated margin on session teardown without capital leaks', async () => {
      const stopRes = await paperSessionEngine.stopSession('MARKET_CLOSE');
      assert.strictEqual(stopRes.success, true);
      const metrics = paperSessionEngine.getSessionMetrics();
      assert.strictEqual(metrics.status, 'STOPPED');
      assert.strictEqual(metrics.allocatedMargin, 0, 'Allocated margin must be 0 on teardown');
    });
  });

  describe('5. AI Provider Router & Natural Persona Engine', () => {
    it('should auto-detect provider prefixes accurately', () => {
      assert.strictEqual(autoDetectProvider('AIzaSyD_test123'), 'gemini');
      assert.strictEqual(autoDetectProvider('gsk_groqKey123'), 'groq');
      assert.strictEqual(autoDetectProvider('sk-ant-api03-claude'), 'anthropic');
      assert.strictEqual(autoDetectProvider('sk-proj-openaiKey'), 'openai');
    });

    it('should return correct default models for providers', () => {
      assert.strictEqual(getDefaultModelForProvider('gemini'), 'gemini-2.0-flash');
      assert.strictEqual(getDefaultModelForProvider('deepseek'), 'deepseek-chat');
      assert.strictEqual(getDefaultModelForProvider('groq'), 'llama-3.3-70b-versatile');
      assert.strictEqual(getDefaultModelForProvider('openai'), 'gpt-4o-mini');
    });

    it('should distinguish casual greetings from institutional quant queries', () => {
      assert.strictEqual(isInstitutionalQuantQuery('hi'), false);
      assert.strictEqual(isInstitutionalQuantQuery('how are you'), false);
      assert.strictEqual(isInstitutionalQuantQuery('tell me a joke'), false);
      assert.strictEqual(isInstitutionalQuantQuery('what is the weather today'), false);

      assert.strictEqual(isInstitutionalQuantQuery('what is the NIFTY 50 price'), true);
      assert.strictEqual(isInstitutionalQuantQuery('check stop-loss on reliance'), true);
      assert.strictEqual(isInstitutionalQuantQuery('are all 14 bots running'), true);
      assert.strictEqual(isInstitutionalQuantQuery('what is our P&L today'), true);
      assert.strictEqual(isInstitutionalQuantQuery('show me RSI and MACD for banknifty'), true);
    });

    it('should generate bilingual Kannada prompt when requested', () => {
      const knPrompt = buildQuantHedgeFundPrompt({
        userMessage: 'ಇವತ್ತು ನಿಫ್ಟಿ ಮಾರುಕಟ್ಟೆ ಹೇಗೆ ಇದೆ?',
        language: 'kn-IN'
      });
      assert.ok(knPrompt.includes('ಕನ್ನಡ'));
      assert.ok(knPrompt.includes('CHINTU JARVIS CORE'));
    });
  });

  describe('6. Authentic Market Feed Binary Packet & Token Mapper', () => {
    it('should parse official Angel One 51-byte binary packet', () => {
      const buf = Buffer.alloc(51);
      buf.writeInt8(1, 0); // subscription mode 1 (LTP)
      buf.writeInt8(1, 1); // exchange NSE (1)
      buf.write('26000\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0', 2, 'utf-8');
      buf.writeBigInt64LE(1001n, 27); // sequence number
      buf.writeBigInt64LE(1729850000000n, 35); // timestamp
      buf.writeBigInt64LE(2485050n, 43); // LTP in paise (24850.50)

      const success = angelMarketDataAdapter.parseBinaryPacket(buf);
      assert.strictEqual(success, true);

      const quote = angelMarketDataAdapter.getQuote('NIFTY 50');
      assert.ok(quote !== null);
      assert.strictEqual(quote?.price, 24850.50);
      assert.strictEqual(quote?.source, 'OFFICIAL_ANGEL_ONE_SMARTSTREAM');
    });

    it('should resolve instruments from master universe of 270 symbols', () => {
      const nifty = instrumentMaster.getInstrumentByToken('26000');
      assert.ok(nifty !== undefined);
      assert.strictEqual(nifty?.symbol, 'NIFTY 50');
      assert.strictEqual(nifty?.exch_seg, 'NSE');

      const stats = instrumentMaster.getStats();
      assert.strictEqual(stats.totalIndexed, 270);
      assert.strictEqual(stats.tradableCount, 264);
    });
  });
});
