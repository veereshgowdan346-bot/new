import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTradeCharges,
  validateNetProfitGuardrail
} from '../src/utils/taxCalculator';

describe('CHINTU AI — AUTHORITATIVE INDIAN REGULATORY FINANCIAL CALCULATIONS AUDIT', () => {

  // ==========================================================================
  // 1. NSE INTRADAY EQUITY (NON-DELIVERY) RATE VERIFICATION
  // ==========================================================================
  describe('1. NSE Intraday Equity Non-Delivery Rates', () => {
    it('should charge exactly 0.025% STT on intraday equity SELL and 0% on BUY', () => {
      // User specified test case: ₹152,000 turnover
      const sellLeg = calculateTradeCharges({
        price: 1520,
        qty: 100,
        action: 'SELL',
        segment: 'NSE Equity',
        productType: 'INTRADAY',
        tradeDate: '2026-10-26',
        includeSlippage: false
      });

      assert.equal(sellLeg.orderValue, 152000.00);
      // Official rate: 0.025% of 152000 = 38.00 (NOT 19.00)
      assert.equal(sellLeg.stt, 38.00, 'STT on intraday equity sell must be 0.025% = ₹38.00');
      // NSE True-to-label transaction charge w.e.f. Oct 1, 2024: 0.00297% = 4.5144 -> 4.51 (NOT 0.00325% = 4.94)
      assert.equal(sellLeg.exchangeTurnover, 4.51, 'NSE cash transaction charge must be 0.00297% = ₹4.51');
      assert.equal(sellLeg.ipft, 0.15, 'IPFT charge = ₹0.15');
      assert.equal(sellLeg.sebiCharges, 0.15, 'SEBI charge = ₹0.15');
      assert.equal(sellLeg.stampDuty, 0.00, 'Stamp duty is 0 on SELL');
      assert.equal(sellLeg.brokerage, 20.00, 'Brokerage is capped at flat ₹20.00');
      // GST: 18% on (20.00 + 4.51 + 0.15 + 0.15 = 24.81) = 4.4658 -> 4.47
      assert.equal(sellLeg.gst, 4.47, 'GST must be 18% on service fees = ₹4.47');
      // Total charges excluding slippage: 20 + 38 + 4.51 + 0.15 + 0.15 + 0 + 4.47 = 67.28
      assert.equal(sellLeg.totalCharges, 67.28, 'Total exit statutory charges must equal ₹67.28');

      // Buy Leg
      const buyLeg = calculateTradeCharges({
        price: 1500,
        qty: 100,
        action: 'BUY',
        segment: 'NSE Equity',
        productType: 'INTRADAY',
        tradeDate: '2026-10-26',
        includeSlippage: false
      });

      assert.equal(buyLeg.orderValue, 150000.00);
      assert.equal(buyLeg.stt, 0.00, 'STT must be 0 on intraday BUY');
      assert.equal(buyLeg.exchangeTurnover, 4.46, 'Exchange turnover = ₹4.46');
      assert.equal(buyLeg.stampDuty, 4.50, 'Stamp duty on BUY = 0.003% = ₹4.50');
      assert.equal(buyLeg.totalCharges, 33.72, 'Total entry statutory charges must equal ₹33.72');
    });
  });

  // ==========================================================================
  // 2. NIFTY OPTIONS DATE-EFFECTIVE STT REVISIONS
  // ==========================================================================
  describe('2. Equity Options Date-Effective STT & True-To-Label Schedules', () => {
    const premiumTurnover = 7500.00; // 50 qty @ ₹150

    it('should charge 0.15% STT on option sale premium for trades from 1 April 2026 onward', () => {
      const optPost2026 = calculateTradeCharges({
        price: 150,
        qty: 50,
        action: 'SELL',
        segment: 'NFO Options',
        tradeDate: '2026-10-26',
        includeSlippage: false
      });

      assert.equal(optPost2026.orderValue, premiumTurnover);
      // Post April 1, 2026: 0.15% of 7500 = 11.25 (NOT 4.69)
      assert.equal(optPost2026.stt, 11.25, 'Post-2026 Options STT must be 0.15% = ₹11.25');
      // True-to-label NSE options charge: 0.03503% of 7500 = 2.62725 -> 2.63
      assert.equal(optPost2026.exchangeTurnover, 2.63, 'NSE Options exchange fee must be 0.03503% = ₹2.63');
      assert.equal(optPost2026.ipft, 0.04, 'IPFT fee = ₹0.04');
      assert.equal(optPost2026.sebiCharges, 0.01, 'SEBI charge = ₹0.01');
      assert.equal(optPost2026.stampDuty, 0.00, 'Stamp duty is 0 on SELL');
      assert.equal(optPost2026.brokerage, 20.00, 'Brokerage = ₹20.00');
      // GST: 18% on (20.00 + 2.63 + 0.04 + 0.01 = 22.68) = 4.0824 -> 4.08
      assert.equal(optPost2026.gst, 4.08, 'GST = ₹4.08');
      assert.equal(optPost2026.totalCharges, 38.01, 'Total statutory charges = ₹38.01');
    });

    it('should charge 0.10% STT on option sale premium between 1 Oct 2024 and 31 Mar 2026', () => {
      const optMidPeriod = calculateTradeCharges({
        price: 150,
        qty: 50,
        action: 'SELL',
        segment: 'NFO Options',
        tradeDate: '2025-05-15',
        includeSlippage: false
      });

      // Oct 1, 2024 to Mar 31, 2026: 0.10% of 7500 = 7.50
      assert.equal(optMidPeriod.stt, 7.50, 'Mid-period Options STT must be 0.10% = ₹7.50');
      assert.equal(optMidPeriod.exchangeTurnover, 2.63, 'NSE Options exchange fee = ₹2.63');
    });

    it('should charge 0.0625% STT on option sale premium prior to 1 Oct 2024', () => {
      const optPreOct = calculateTradeCharges({
        price: 150,
        qty: 50,
        action: 'SELL',
        segment: 'NFO Options',
        tradeDate: '2024-08-01',
        includeSlippage: false
      });

      // Pre-Oct 1, 2024: 0.0625% of 7500 = 4.6875 -> 4.69
      assert.equal(optPreOct.stt, 4.69, 'Pre-Oct 2024 Options STT must be 0.0625% = ₹4.69');
      // Pre-Oct 2024 NSE options exchange charge: 0.05% of 7500 = 3.75
      assert.equal(optPreOct.exchangeTurnover, 3.75, 'Pre-Oct 2024 NSE options exchange fee = 0.05% = ₹3.75');
    });
  });

  // ==========================================================================
  // 3. EQUITY DELIVERY (CNC) VERIFICATION
  // ==========================================================================
  describe('3. Equity Delivery (Cash CNC) Schedule', () => {
    it('should charge 0.10% STT on both BUY and SELL sides with zero brokerage', () => {
      const buyDelivery = calculateTradeCharges({
        price: 2500,
        qty: 100,
        action: 'BUY',
        segment: 'NSE Equity',
        productType: 'DELIVERY',
        tradeDate: '2026-10-26'
      });

      assert.equal(buyDelivery.orderValue, 250000.00);
      assert.equal(buyDelivery.brokerage, 0.00, 'Discount brokerage must be ₹0 on delivery');
      assert.equal(buyDelivery.stt, 250.00, 'Delivery STT on BUY = 0.10% = ₹250.00');
      assert.equal(buyDelivery.stampDuty, 37.50, 'Delivery Stamp Duty on BUY = 0.015% = ₹37.50');

      const sellDelivery = calculateTradeCharges({
        price: 2600,
        qty: 100,
        action: 'SELL',
        segment: 'NSE Equity',
        productType: 'DELIVERY',
        tradeDate: '2026-10-26'
      });

      assert.equal(sellDelivery.orderValue, 260000.00);
      assert.equal(sellDelivery.brokerage, 0.00, 'Discount brokerage must be ₹0 on delivery');
      assert.equal(sellDelivery.stt, 260.00, 'Delivery STT on SELL = 0.10% = ₹260.00');
      assert.equal(sellDelivery.stampDuty, 0.00, 'Stamp duty on SELL = ₹0.00');
    });
  });

  // ==========================================================================
  // 4. EQUITY FUTURES (NFO) DATE-EFFECTIVE STT REVISIONS
  // ==========================================================================
  describe('4. Equity Futures (NFO) Date-Effective Schedule', () => {
    it('should charge 0.05% STT on futures SELL for trades from 1 April 2026 onward (Finance Act 2026)', () => {
      // Test exact boundary date: 1 April 2026
      const boundaryPost2026 = calculateTradeCharges({
        price: 24100,
        qty: 50,
        action: 'SELL',
        segment: 'NSE Futures',
        tradeDate: '2026-04-01',
        includeSlippage: false
      });

      const orderVal = 24100 * 50; // 1,205,000.00
      assert.equal(boundaryPost2026.orderValue, orderVal);
      // 0.05% of 1,205,000 = 602.50 (NOT 241.00)
      assert.equal(boundaryPost2026.stt, 602.50, 'Post-April 2026 Futures STT on SELL must be 0.05% = ₹602.50');
      // True-to-label NSE futures fee: 0.00173% of 1,205,000 = 20.8465 -> 20.85
      assert.equal(boundaryPost2026.exchangeTurnover, 20.85, 'NSE Futures exchange fee = 0.00173% = ₹20.85');
      assert.equal(boundaryPost2026.ipft, 1.21, 'IPFT fee = 0.0001% = ₹1.21');
      assert.equal(boundaryPost2026.sebiCharges, 1.21, 'SEBI charge = 0.0001% = ₹1.21');
      assert.equal(boundaryPost2026.stampDuty, 0.00, 'Stamp duty on SELL = ₹0.00');
      assert.equal(boundaryPost2026.brokerage, 20.00, 'Brokerage = ₹20.00');
      // GST: 18% on (20.00 + 20.85 + 1.21 + 1.21 = 43.27) = 7.7886 -> 7.79
      assert.equal(boundaryPost2026.gst, 7.79, 'GST = ₹7.79');
      assert.equal(boundaryPost2026.totalCharges, 653.56, 'Total statutory exit charges = ₹653.56');

      // Test active operational date: 26 October 2026
      const activePost2026 = calculateTradeCharges({
        price: 24100,
        qty: 50,
        action: 'SELL',
        segment: 'NSE Futures',
        tradeDate: '2026-10-26',
        includeSlippage: false
      });
      assert.equal(activePost2026.stt, 602.50, 'Active 2026 trade must charge 0.05% = ₹602.50');
    });

    it('should charge 0.02% STT on futures SELL on 31 March 2026 (boundary date prior to 1 April 2026)', () => {
      const boundaryPre2026 = calculateTradeCharges({
        price: 24100,
        qty: 50,
        action: 'SELL',
        segment: 'NSE Futures',
        tradeDate: '2026-03-31',
        includeSlippage: false
      });

      assert.equal(boundaryPre2026.orderValue, 1205000.00);
      // 0.02% of 1,205,000 = 241.00
      assert.equal(boundaryPre2026.stt, 241.00, 'Mid-period Futures STT on SELL must be 0.02% = ₹241.00');
      assert.equal(boundaryPre2026.exchangeTurnover, 20.85);
      assert.equal(boundaryPre2026.totalCharges, 292.06, 'Total mid-period charges = ₹292.06');
    });

    it('should charge 0.0125% STT on futures SELL prior to 1 October 2024', () => {
      const preOct2024 = calculateTradeCharges({
        price: 24100,
        qty: 50,
        action: 'SELL',
        segment: 'NSE Futures',
        tradeDate: '2024-09-30',
        includeSlippage: false
      });

      assert.equal(preOct2024.orderValue, 1205000.00);
      // 0.0125% of 1,205,000 = 150.625 -> 150.63
      assert.equal(preOct2024.stt, 150.63, 'Pre-Oct 2024 Futures STT on SELL must be 0.0125% = ₹150.63');
    });
  });

  // ==========================================================================
  // 5. MCX COMMODITY SCHEDULE (FUTURES & OPTIONS)
  // ==========================================================================
  describe('5. MCX Commodity Derivatives Schedule', () => {
    it('should charge 0.01% CTT on commodity futures sell and 0.0021% exchange fee', () => {
      const mcxGoldFut = calculateTradeCharges({
        price: 75000,
        qty: 1,
        action: 'SELL',
        segment: 'MCX Gold Futures',
        tradeDate: '2026-10-26',
        includeSlippage: false
      });

      assert.equal(mcxGoldFut.orderValue, 75000.00);
      // 0.01% of 75000 = 7.50
      assert.equal(mcxGoldFut.stt, 7.50, 'MCX CTT on Futures SELL = 0.01% = ₹7.50');
      // 0.0021% of 75000 = 1.575 -> 1.58
      assert.equal(mcxGoldFut.exchangeTurnover, 1.58, 'MCX Futures exchange fee = 0.0021% = ₹1.58');
    });

    it('should charge 0.05% CTT on commodity options sell and 0.0418% exchange fee', () => {
      const mcxOpt = calculateTradeCharges({
        price: 500,
        qty: 10,
        action: 'SELL',
        segment: 'MCX Crude Oil Option',
        tradeDate: '2026-10-26',
        includeSlippage: false
      });

      assert.equal(mcxOpt.orderValue, 5000.00);
      // 0.05% of 5000 = 2.50
      assert.equal(mcxOpt.stt, 2.50, 'MCX CTT on Options SELL = 0.05% = ₹2.50');
      // 0.0418% of 5000 = 2.09
      assert.equal(mcxOpt.exchangeTurnover, 2.09, 'MCX Options exchange fee = 0.0418% = ₹2.09');
    });
  });

  // ==========================================================================
  // 6. GST TAXABLE BASE PURITY & NO DOUBLE COUNTING
  // ==========================================================================
  describe('6. GST Taxable Base Purity Invariant', () => {
    it('must strictly exclude STT/CTT and Stamp Duty from the 18% GST taxable base', () => {
      const res = calculateTradeCharges({
        price: 2000,
        qty: 50,
        action: 'SELL',
        segment: 'NSE Equity',
        productType: 'INTRADAY',
        tradeDate: '2026-10-26',
        includeSlippage: false
      });

      // Order value = 100,000
      // Brokerage = 20.00
      // STT = 25.00
      // Exchange = 2.97
      // IPFT = 0.10
      // SEBI = 0.10
      // Service base for GST = 20.00 + 2.97 + 0.10 + 0.10 = 23.17
      // 18% of 23.17 = 4.1706 -> 4.17
      assert.equal(res.gst, 4.17, 'GST must be strictly 18% of service fees (₹23.17)');

      // If STT (₹25) were incorrectly included in GST base:
      // (23.17 + 25.00) * 0.18 = 8.67
      assert.notEqual(res.gst, 8.67, 'GST must NEVER be charged on STT');
    });
  });

  // ==========================================================================
  // 7. PRE-TRADE INSTITUTIONAL NET-PROFIT GUARDRAIL
  // ==========================================================================
  describe('7. Pre-Trade Institutional Net-Profit Guardrail (1.50% Hurdle)', () => {
    it('should reject trades where expected net gain fails to cover roundtrip charges + 1.50% hurdle', () => {
      const guard = validateNetProfitGuardrail({
        entryPrice: 1500,
        targetPrice: 1510, // 0.67% target move
        qty: 100,
        action: 'BUY',
        segment: 'NSE Equity',
        tradeDate: '2026-10-26'
      });

      assert.equal(guard.isApproved, false, 'Sub-hurdle trade must be rejected');
      assert.match(guard.rejectionReason || '', /Hard Abort/);
      assert.ok(guard.expectedNetRoiPct < 1.50, 'Net ROI is below 1.50%');
    });

    it('should approve trades where expected price target satisfies all statutory deductions and hurdle', () => {
      const guard = validateNetProfitGuardrail({
        entryPrice: 1500,
        targetPrice: 1550, // 3.33% target move
        qty: 100,
        action: 'BUY',
        segment: 'NSE Equity',
        tradeDate: '2026-10-26'
      });

      assert.equal(guard.isApproved, true, 'Viable trade meeting hurdle must be approved');
      assert.equal(guard.rejectionReason, null);
      assert.ok(guard.expectedNetRoiPct >= 1.50, 'Net ROI meets hurdle');
      assert.ok(guard.expectedNetProfit > 0, 'Net profit is positive');
    });
  });

  // ==========================================================================
  // 8. HAND-CALCULATED ROUNDTRIP RECONCILIATION
  // ==========================================================================
  describe('8. Hand-Calculated Roundtrip Reconciliation Matrix', () => {
    it('should reconcile HDFCBANK Intraday (100 shares @ ₹1,500 Buy, ₹1,520 Sell) with exact delta = 0', () => {
      const entry = calculateTradeCharges({
        price: 1500,
        qty: 100,
        action: 'BUY',
        segment: 'NSE Equity',
        tradeDate: '2026-10-26',
        includeSlippage: false
      });
      const exit = calculateTradeCharges({
        price: 1520,
        qty: 100,
        action: 'SELL',
        segment: 'NSE Equity',
        tradeDate: '2026-10-26',
        includeSlippage: false
      });

      const roundtripFees = Math.round((entry.totalCharges + exit.totalCharges) * 100) / 100;
      const grossPnl = 2000.00;
      const netPnl = Math.round((grossPnl - roundtripFees) * 100) / 100;

      // Entry: 33.72, Exit: 67.28 -> Total: 101.00
      assert.equal(entry.totalCharges, 33.72);
      assert.equal(exit.totalCharges, 67.28);
      assert.equal(roundtripFees, 101.00);
      assert.equal(netPnl, 1899.00);
    });

    it('should reconcile NIFTY Futures Intraday (50 qty @ ₹24,000 Buy, ₹24,100 Sell) post-April 2026 with exact delta = 0', () => {
      const entry = calculateTradeCharges({
        price: 24000,
        qty: 50,
        action: 'BUY',
        segment: 'NSE Futures',
        tradeDate: '2026-04-01',
        includeSlippage: false
      });
      const exit = calculateTradeCharges({
        price: 24100,
        qty: 50,
        action: 'SELL',
        segment: 'NSE Futures',
        tradeDate: '2026-04-01',
        includeSlippage: false
      });

      const roundtripFees = Math.round((entry.totalCharges + exit.totalCharges) * 100) / 100;
      const grossPnl = 5000.00;
      const netPnl = Math.round((grossPnl - roundtripFees) * 100) / 100;

      // Entry: 74.93, Exit: 653.56 -> Total: 728.49
      assert.equal(entry.orderValue, 1200000.00);
      assert.equal(entry.brokerage, 20.00);
      assert.equal(entry.stt, 0.00, 'Entry STT must be 0 on BUY');
      assert.equal(entry.exchangeTurnover, 20.76);
      assert.equal(entry.ipft, 1.20);
      assert.equal(entry.sebiCharges, 1.20);
      assert.equal(entry.stampDuty, 24.00, 'Stamp duty on BUY = 0.002% = ₹24.00');
      assert.equal(entry.gst, 7.77);
      assert.equal(entry.totalCharges, 74.93, 'Entry charges must equal ₹74.93');

      assert.equal(exit.orderValue, 1205000.00);
      assert.equal(exit.brokerage, 20.00);
      assert.equal(exit.stt, 602.50, 'Exit STT must be 0.05% of 1,205,000 = ₹602.50');
      assert.equal(exit.exchangeTurnover, 20.85);
      assert.equal(exit.ipft, 1.21);
      assert.equal(exit.sebiCharges, 1.21);
      assert.equal(exit.stampDuty, 0.00);
      assert.equal(exit.gst, 7.79);
      assert.equal(exit.totalCharges, 653.56, 'Exit charges must equal ₹653.56');

      assert.equal(roundtripFees, 728.49, 'Roundtrip charges must equal ₹728.49');
      assert.equal(netPnl, 4271.51, 'Net P&L must equal ₹4,271.51');
    });

    it('should reconcile NIFTY Options Intraday (50 qty @ ₹120 Buy, ₹150 Sell) post-April 2026 with exact delta = 0', () => {
      const entry = calculateTradeCharges({
        price: 120,
        qty: 50,
        action: 'BUY',
        segment: 'NFO Options',
        tradeDate: '2026-04-01',
        includeSlippage: false
      });
      const exit = calculateTradeCharges({
        price: 150,
        qty: 50,
        action: 'SELL',
        segment: 'NFO Options',
        tradeDate: '2026-04-01',
        includeSlippage: false
      });

      const roundtripFees = Math.round((entry.totalCharges + exit.totalCharges) * 100) / 100;
      const grossPnl = 1500.00;
      const netPnl = Math.round((grossPnl - roundtripFees) * 100) / 100;

      // Entry: 26.30, Exit: 38.01 -> Total: 64.31
      assert.equal(entry.orderValue, 6000.00);
      assert.equal(entry.brokerage, 20.00, 'Options brokerage is flat ₹20.00 per order');
      assert.equal(entry.stt, 0.00);
      assert.equal(entry.exchangeTurnover, 2.10);
      assert.equal(entry.ipft, 0.03);
      assert.equal(entry.sebiCharges, 0.01);
      assert.equal(entry.stampDuty, 0.18);
      assert.equal(entry.gst, 3.98);
      assert.equal(entry.totalCharges, 26.30);

      assert.equal(exit.orderValue, 7500.00);
      assert.equal(exit.brokerage, 20.00, 'Options brokerage is flat ₹20.00 per order');
      assert.equal(exit.stt, 11.25, 'Options STT 0.15% on sell premium = ₹11.25');
      assert.equal(exit.exchangeTurnover, 2.63);
      assert.equal(exit.ipft, 0.04);
      assert.equal(exit.sebiCharges, 0.01);
      assert.equal(exit.stampDuty, 0.00);
      assert.equal(exit.gst, 4.08);
      assert.equal(exit.totalCharges, 38.01);

      assert.equal(roundtripFees, 64.31, 'Roundtrip options charges must equal ₹64.31');
      assert.equal(netPnl, 1435.69, 'Net options P&L must equal ₹1,435.69');
    });

    it('should reconcile NIFTY Futures Intraday on 31 March 2026 (50 qty @ ₹24,000 Buy, ₹24,100 Sell) with exact delta = 0', () => {
      const entry = calculateTradeCharges({
        price: 24000,
        qty: 50,
        action: 'BUY',
        segment: 'NSE Futures',
        tradeDate: '2026-03-31',
        includeSlippage: false
      });
      const exit = calculateTradeCharges({
        price: 24100,
        qty: 50,
        action: 'SELL',
        segment: 'NSE Futures',
        tradeDate: '2026-03-31',
        includeSlippage: false
      });

      const roundtripFees = Math.round((entry.totalCharges + exit.totalCharges) * 100) / 100;
      const grossPnl = 5000.00;
      const netPnl = Math.round((grossPnl - roundtripFees) * 100) / 100;

      // Entry: 74.93, Exit: 292.06 -> Total: 366.99
      assert.equal(entry.totalCharges, 74.93);
      assert.equal(exit.stt, 241.00, 'Mid-period STT on 31 March 2026 = 0.02% = ₹241.00');
      assert.equal(exit.totalCharges, 292.06);
      assert.equal(roundtripFees, 366.99);
      assert.equal(netPnl, 4633.01);
    });

    it('should reconcile Delivery Equity (100 shares @ ₹2,500 Buy, ₹2,600 Sell) with exact delta = 0', () => {
      const entry = calculateTradeCharges({
        price: 2500,
        qty: 100,
        action: 'BUY',
        segment: 'NSE Equity',
        productType: 'DELIVERY',
        tradeDate: '2026-10-26',
        includeSlippage: false
      });
      const exit = calculateTradeCharges({
        price: 2600,
        qty: 100,
        action: 'SELL',
        segment: 'NSE Equity',
        productType: 'DELIVERY',
        tradeDate: '2026-10-26',
        includeSlippage: false
      });

      const roundtripFees = Math.round((entry.totalCharges + exit.totalCharges) * 100) / 100;
      const grossPnl = 10000.00;
      const netPnl = Math.round((grossPnl - roundtripFees) * 100) / 100;

      // Entry: 296.86, Exit: 269.72 -> Total: 566.58
      assert.equal(entry.brokerage, 0.00);
      assert.equal(entry.stt, 250.00, '0.10% on BUY = ₹250.00');
      assert.equal(entry.stampDuty, 37.50, '0.015% on BUY = ₹37.50');
      assert.equal(entry.totalCharges, 296.86);

      assert.equal(exit.brokerage, 0.00);
      assert.equal(exit.stt, 260.00, '0.10% on SELL = ₹260.00');
      assert.equal(exit.stampDuty, 0.00);
      assert.equal(exit.totalCharges, 269.72);

      assert.equal(roundtripFees, 566.58);
      assert.equal(netPnl, 9433.42);
    });

    it('should reconcile MCX Commodity Futures (1 lot @ ₹75,000 Buy, ₹75,500 Sell) with exact delta = 0', () => {
      const entry = calculateTradeCharges({
        price: 75000,
        qty: 1,
        action: 'BUY',
        segment: 'MCX Gold Futures',
        tradeDate: '2026-10-26',
        includeSlippage: false
      });
      const exit = calculateTradeCharges({
        price: 75500,
        qty: 1,
        action: 'SELL',
        segment: 'MCX Gold Futures',
        tradeDate: '2026-10-26',
        includeSlippage: false
      });

      const roundtripFees = Math.round((entry.totalCharges + exit.totalCharges) * 100) / 100;
      const grossPnl = 500.00;
      const netPnl = Math.round((grossPnl - roundtripFees) * 100) / 100;

      // Entry: 27.15, Exit: 33.21 -> Total: 60.36
      assert.equal(entry.brokerage, 20.00);
      assert.equal(entry.stt, 0.00);
      assert.equal(entry.exchangeTurnover, 1.58, 'MCX Futures exchange fee = 0.0021% = ₹1.58');
      assert.equal(entry.stampDuty, 1.50, 'MCX stamp duty = 0.002% = ₹1.50');
      assert.equal(entry.totalCharges, 27.15);

      assert.equal(exit.brokerage, 20.00);
      assert.equal(exit.stt, 7.55, 'MCX CTT = 0.01% = ₹7.55');
      assert.equal(exit.exchangeTurnover, 1.59);
      assert.equal(exit.totalCharges, 33.21);

      assert.equal(roundtripFees, 60.36);
      assert.equal(netPnl, 439.64);
    });
  });
});

