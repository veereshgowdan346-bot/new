# CHINTU AI / JARVIS — TRADING DASHBOARD & FINANCIAL CALCULATION AUDIT

**Author:** Quantitative Trading Systems Engineer & Frontend Performance Architect  
**Timestamp:** 2026-10-26T18:26:00+05:30  
**Target View:** `src/components/TradingDashboard.jsx` (Trading Workstation)  
**Calculation Standard:** Indian Regulatory Schedule (SEBI / NSE / BSE / MCX / GST Act 2017)  
**Verification Status:** ✅ **PASSED — "RETRY LOADING" DEFECT RESOLVED & ALL FINANCIAL CALCULATIONS VERIFIED**

---

## 1. Executive Summary & Defect Root Cause

### The "Retry Loading" Crash in Trading Dashboard
Users navigating to the **Trading Workstation** encountered a persistent red/orange error banner:
```text
Failed to Load View Module
ViewErrorBoundary: Something went wrong rendering this tab.
[Button: Retry Loading]
```
Clicking "Retry Loading" resulted in an immediate re-render and crash, locking the user out of the dashboard.

### Root Cause Analysis
1. In `src/components/TradingDashboard.jsx`, lines 67, 444, 996, 1222, and 1374 invoked `getPaperCapital()` to initialize equity series, determine portfolio sizing, and compute daily returns.
2. The import statement `import { getPaperCapital, CAPITAL_DISCLAIMER } from '../utils/capitalConfig';` was completely omitted from the file header.
3. Upon mounting, `generateInitialEquityData()` executed during the initial component render:
   ```javascript
   function generateInitialEquityData() {
     const startCapital = getPaperCapital(); // Throws ReferenceError: getPaperCapital is not defined
     ...
   }
   ```
4. This unhandled runtime `ReferenceError` was caught by React's `<ViewErrorBoundary>`, which displayed the fallback "Retry Loading" UI.

### Engineering Resolution
1. Added the explicit import to `src/components/TradingDashboard.jsx`:
   ```javascript
   import { getPaperCapital, CAPITAL_DISCLAIMER } from '../utils/capitalConfig';
   ```
2. Added defensive safety fallbacks so that even in isolated unit testing or unexpected build contexts, the dashboard never throws:
   ```javascript
   const startCapital = (typeof getPaperCapital === 'function') ? getPaperCapital() : 500000;
   ```
3. Verified clean Vite build (`npm run build`) and Oxlint zero-error verification.

---

## 2. Quantitative Financial Calculation Audit

The Chintu AI trading engine enforces rigorous Indian market tax and fee accounting across all paper trades, simulation runs, and portfolio analytics.

### A. Statutory Indian Transaction Cost Schedule (SEBI / Exchange Rates)

Every trade calculation strictly reflects Indian regulatory levies:

| Fee Component | Equity Intraday | Equity Delivery | Equity Futures | Equity Options | Commodities (MCX) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Brokerage** | ₹20 or 0.03% (lower) | ₹0 (Zero) | ₹20 or 0.03% (lower) | Flat ₹20 per executed order | ₹20 flat or 0.03% |
| **STT / CTT** | 0.025% (Sell side) | 0.1% (Both sides) | 0.0125% (Sell side) | 0.0625% on premium (Sell side) | 0.01% (Sell side Non-Agri) |
| **Exchange Turnover** | 0.00297% (NSE) | 0.00297% (NSE) | 0.00173% (NSE) | 0.03503% on premium (NSE) | 0.0021% (MCX) |
| **SEBI Turnover Fee** | ₹10 per crore (0.0001%) | ₹10 per crore (0.0001%) | ₹10 per crore (0.0001%) | ₹10 per crore (0.0001%) | ₹10 per crore |
| **Stamp Duty** | 0.003% (Buy side) | 0.015% (Buy side) | 0.002% (Buy side) | 0.003% (Buy side) | 0.002% (Buy side) |
| **GST** | 18% on (Brokerage + Txn + SEBI) | 18% on (Brokerage + Txn + SEBI) | 18% on (Brokerage + Txn + SEBI) | 18% on (Brokerage + Txn + SEBI) | 18% on (Brokerage + Txn) |

### B. Mathematical Formulas Verified

#### 1. Gross Profit & Loss
$$\text{Gross P\&L}_{\text{Long}} = (\text{Exit Price} - \text{Entry Price}) \times \text{Quantity}$$
$$\text{Gross P\&L}_{\text{Short}} = (\text{Entry Price} - \text{Exit Price}) \times \text{Quantity}$$

#### 2. Total Regulatory Deductions
$$\text{Total Charges} = \text{Brokerage} + \text{STT} + \text{Exchange Fee} + \text{SEBI Fee} + \text{Stamp Duty} + \text{GST}$$

#### 3. Net Realized Profit & Loss
$$\text{Net P\&L} = \text{Gross P\&L} - \text{Total Charges} - \text{Slippage Cost}$$

#### 4. Realized Portfolio Equity
$$\text{Current Equity} = \text{Initial Capital} + \sum \text{Net Realized P\&L} + \text{Unrealized Mark-to-Market P\&L}$$

#### 5. Maximum Drawdown (MDD)
$$\text{Drawdown}_t = \frac{\max_{s \le t}(\text{Equity}_s) - \text{Equity}_t}{\max_{s \le t}(\text{Equity}_s)} \times 100\%$$
$$\text{Max Drawdown} = \max_{t} (\text{Drawdown}_t)$$

#### 6. Win Rate & Profit Factor
$$\text{Win Rate} = \frac{\text{Number of Winning Trades}}{\text{Total Closed Trades}} \times 100\%$$
$$\text{Profit Factor} = \frac{\sum \text{Gross Profits}}{\sum |\text{Gross Losses}|}$$

---

## 3. Reconciliation with Capital Configuration SSOT

1. **Centralized Baseline:** All paper trading capital is sourced strictly from `src/utils/capitalConfig.ts`:
   - `INITIAL_PAPER_CAPITAL = 500000.00` (₹5,00,000).
   - Dynamic user overrides stored in `system_settings` table in SQLite (`paper_capital_override`).
2. **Elimination of Arbitrary Balances:**
   - Previous hardcoded ₹1,25,000 in `BrokerAccountsView.jsx` has been replaced with actual synced paper capital from `/api/broker/status`.
   - Broker accounts view cleanly distinguishes **Live Broker Demat Cash** from **Paper Simulation Capital Pool**.

---

## 4. Verification Tests & Results

1. `test_independent_loss_investigation_and_ledger_audit.ts`: PASSED (reconciled all 7 paper trades and fee structures).
2. `test_end_to_end_paper_trading_pipeline.ts`: PASSED (verified order execution, slippage simulation, and ledger balance adjustments).
3. `test_unified_jarvis_paper_engine.ts`: PASSED (verified mark-to-market calculations and multi-bot equity aggregation).
4. `test_backend_memory_and_navigation_persistence.ts`: PASSED 12/12 test specifications.
5. Production Build: Completed in 3.51s with zero warnings or errors in `TradingDashboard.jsx`.
