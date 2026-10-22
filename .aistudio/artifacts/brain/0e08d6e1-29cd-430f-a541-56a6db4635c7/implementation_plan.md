# Institutional Quantitative Strategy Engine & 14-Bot Consensus Architecture

An institutional-grade quantitative trading framework and autonomous multi-agent execution pipeline engineered directly into the Chintu AI Trading System, featuring multi-indicator confluence strategies, 9/14 bot quorum consensus, pre-trade statutory tax filtration, and dynamic Kelly Criterion capital allocation.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural parameters have been confirmed based on user feedback and will be hardcoded into the execution pipeline:

- **Confirmed Decision 1 (Quorum Consensus Gate)**: Strict 9/14 Quorum Gate enforced. When bot agreement is between 7 and 8 out of 14, the trade is rejected and recorded in the audit log as an official `Quorum Veto` to prevent borderline or low-conviction capital exposure.
- **Confirmed Decision 2 (Pre-Trade Statutory Guardrail)**: Hard Abort Policy. Every proposed trade must undergo pre-execution simulation deducting Brokerage (₹20 or 0.05%), STT (Securities Transaction Tax), Exchange Turnover Fees, SEBI turnover fees, Stamp Duty, and 18% GST. If projected net ROI after all deductions is below 1.5%, the order is automatically rejected.
- **Confirmed Decision 3 (Capital Allocation Model)**: Dynamic Half-Kelly Criterion with ATR Volatility Dampener. Position sizing dynamically calibrates to account equity (scaling from ₹500 micro accounts up to ₹5,00,000+ institutional accounts), adjusting lots, leverage, and stop-loss bands based on realized win-rate, reward-to-risk ratio, and rolling asset volatility.

---

## 1. Overview & Core Concept

- **What It Does**: Transforms the Chintu AI Trading System into a mathematically rigorous, zero-compromise quantitative execution platform. It automates technical confluence detection across 200+ liquid Indian symbols (Indices, Equities, F&O, Commodities), subjects every candidate setup to a 14-bot specialized agent quorum vote, enforces a statutory tax filter to guarantee net profitability, and executes through dual-mode DMA (Paper Simulation & Live Angel One / Zerodha / Upstox APIs).
- **Target Audience / Persona**: High-frequency algorithmic traders, quantitative prop desk engineers, and retail traders requiring institutional-grade execution protection against slippage, emotional bias, and hidden tax drag.
- **Key Value**: Guarantees that no order is executed without mathematical consensus (9/14 bots) and that no profitable-looking gross trade is wiped out by Indian exchange taxes and broker commissions.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Confluence Scanner & Strategy Vault**:
   - The user selects or monitors candidate setups across the 200+ symbol multi-asset universe.
   - Real-time indicator confluence matrices evaluate EMA Ribbon (9/21/50/200), MACD histogram, RSI dynamic bands, Bollinger Squeeze, VWAP deviation, SuperTrend (10, 3), and Camarilla H3/H4 & L3/L4 reversal levels.
2. **Circular 14-Bot Quorum Consensus Audit**:
   - Live visual radar and consensus bar graph displaying real-time votes across all 14 bots (Momentum, Mean Reversion, Scalping, Arbitrage, HFT, Sentiment, Breakout, Options Flow, AI Prediction, Swing Trading, Grid, Trend Following, Volatility Arbitrage, Liquidity Imbalance).
   - Clear visual quorum indicator showing status: `Consensus Reached (≥9/14)`, `Quorum Veto (7-8/14)`, or `No Signal (<7/14)`.
3. **Pre-Trade Tax & Brokerage Net Profit Audit**:
   - Before order placement, a live breakdown panel audits gross expected return against calculated STT, GST, SEBI, and broker costs.
   - Visual clearance badge: `NET PROFIT GUARANTEED (ROI ≥ 1.5%)` or `ORDER ABORTED: STATUTORY DRAG EXCEEDS THRESHOLD`.
4. **Dynamic Capital Scaling & Execution**:
   - Capital input selector allowing testing from ₹500 to ₹5,00,000+.
   - Kelly Criterion sizing display showing optimal lot size, max capital at risk, and stop-loss distance.
   - One-click Paper / Live DMA execution with emergency square-off and trailing stop-loss triggers.

### Visual Identity & Theme
- **Aesthetic Direction**: Ultra-clean cyber-quant terminal aesthetic over an OLED pure black canvas (`#05070B`), featuring high-contrast tabular typography, subtle glassmorphism surfaces (`bg-[#070d1d]/90` with `border border-[#16294a]`), and focused neon accents (Cyber Cyan `#00f0ff`, Emerald `#10b981`, Amber `#f59e0b`, Rose `#f43f5e`, Electric Indigo `#818cf8`).
- **Zero-Pill Discipline**:
  - No static pill badges around metadata or status text. All tags, categories, timestamps, and bot counts are styled as clean unboxed tabular text with quiet dividers (`·` or `/`).
  - Segmented controls and interactive buttons use clean rectangular tabs with active high-contrast highlight states.
- **Typography & Layout**:
  - Monospace tabular figures (`font-mono`) for all prices, P&L, lot sizes, taxes, and vote counts to eliminate visual layout shifts.
  - Responsive multi-column layout optimized for wide desktop displays (1440px+) and fluid mobile viewports.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Modular Indicator Confluence Engine vs Static Rule Table**
  - *Chosen Approach*: A pure mathematical utility (`indicatorEngine.js`) calculating true exponential moving averages, standard deviation bands, RSI relative strength, and Camarilla pivot formulas on live and historical candle data.
  - *Why*: Allows true algorithmic confluence scoring (0–100 score) instead of hardcoded pseudo-random alerts.
  - *Alternative Considered*: Static indicator triggers; rejected because it fails to capture volatility shifts and multi-timeframe confluence.
- **Decision 2: Strict 9/14 Bot Quorum Consensus with Quorum Veto Logging**
  - *Chosen Approach*: The 14 bots compute their votes based on distinct quantitative criteria (e.g. Scalper evaluates order book bid/ask imbalance, Sentiment evaluates news score, Mean Reversion evaluates Bollinger %B, etc.). If $\text{votes} \ge 9$, order is passed; if $7 \le \text{votes} \le 8$, flagged as `Quorum Veto`.
  - *Why*: Eliminates false breakouts and whipsaws during choppy sideways market regimes.
- **Decision 3: Pre-Trade Hard Abort at 1.5% Net ROI Floor**
  - *Chosen Approach*: Incorporates statutory Indian trading taxes (STT on turnover, GST on broker charges, SEBI turnover fees, stamp duty). Any setup yielding $< 1.5\%$ net gain after all overheads is aborted before broker API dispatch.
  - *Why*: Retail and algorithmic traders frequently suffer from "profitable gross trades with negative net P&L" due to option turnover STT and flat brokerage fees on small lot sizes.
- **Decision 4: Half-Kelly Formula with ATR Volatility Dampener**
  - *Chosen Approach*: Fractional Kelly sizing $f^* = 0.5 \times \frac{b \cdot p - q}{b} \times \frac{\text{Target Volatility}}{\text{ATR Volatility}}$, capped at 5% maximum equity risk per position.
  - *Why*: Prevents catastrophic drawdown on micro-accounts (₹500–₹6,00,000) while maximizing compounding for large portfolios.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                 CHINTU AI QUANT ENGINE                                  │
├───────────────────────────────┬───────────────────────────────────┬─────────────────────┤
│   Multi-Asset Data Feeds      │     Quantitative Strategies       │   14-Bot Quorum     │
│   • 200+ Symbols (NSE/MCX)   │     • EMA Ribbon (9/21/50/200)    │   • 14 Specialist   │
│   • Multi-Asset Universe      │     • MACD Histogram & Signal     │     AI Agents       │
│   • Live WebSocket / Ticks    │     • Dynamic RSI Overbought/Sold │   • Live Vote Mesh  │
│   • Order Book L2 Depth       │     • Bollinger Squeeze & %B      │   • Strict 9/14     │
│   • News Sentiment Telemetry  │     • VWAP Trend & SuperTrend     │     Consensus Gate  │
│                               │     • Camarilla/Fibonacci Pivots  │   • Quorum Veto Log │
└───────────────┬───────────────┴─────────────────┬─────────────────┴──────────┬──────────┘
                │                                 │                            │
                ▼                                 ▼                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           PRE-TRADE STATUTORY TAX GUARD                                 │
│   • Brokerage: ₹20 / 0.05% flat cap               • SEBI Turnover Charges (0.0001%)     │
│   • STT: 0.1% Equity / 0.0625% Option Sell        • Stamp Duty: 0.015% Delivery / 0.003%│
│   • GST: 18% on (Brokerage + Exchange Fees)       • Exchange Turnover: NSE 0.00325%     │
│   ──► NET PROFITABILITY CHECK: Projected Gross Move - Total Deductions ≥ 1.5% Net ROI   │
│   ──► IF NET ROI < 1.5% ──► HARD ABORT & REJECT ORDER (Execution Halted)                │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                     DYNAMIC CAPITAL ALLOCATION & EXECUTION ENGINE                       │
│   • Half-Kelly Criterion Sizing Engine ($f^*$) with ATR Volatility Dampener             │
│   • Micro-to-Institutional Sizing Brackets (₹500 / ₹6,000 / ₹5,00,000+)                 │
│   • Execution Conduit: Paper Trading Simulator OR Live Broker DMA (Angel/Zerodha/Upstox)│
│   • Trailing Stop-Loss Daemon & Dynamic Trailing Stop Bracket                           │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                            UNIFIED PRESENTATION LAYER                                   │
│   • TradingDashboard (Active Positions, Recharts NAV, Donut AssetAllocation)           │
│   • DecisionMeshHub (14-Bot Interactive Quorum Matrix & Signal Feed)                    │
│   • StrategyStressTestTool & Backtest Engine (Confluence Validation)                    │
│   • Error Boundary Architecture across all 17 Views (Zero Hook Crashes)                 │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Component & Integration Plan

1. **`src/utils/indicatorEngine.js`** *(Advanced Technical Indicators)*:
   - Comprehensive mathematical routines:
     - `calculateEMA(prices, period)`: Accurate exponential moving average.
     - `calculateMACD(prices, fast=12, slow=26, signal=9)`: MACD line, signal line, and histogram.
     - `calculateRSI(prices, period=14)`: Relative Strength Index with smoothed gain/loss.
     - `calculateBollingerBands(prices, period=20, stdDev=2)`: Upper, lower, bandwidth, and squeeze indicator.
     - `calculateVWAP(candles)`: Volume Weighted Average Price with standard deviation bands.
     - `calculateSuperTrend(candles, period=10, multiplier=3)`: Trend direction, ATR, and dynamic trailing line.
     - `calculateCamarillaPivots(high, low, close)`: Key resistance (H3, H4, H5) and support (L3, L4, L5) levels for mean reversion and breakout.
     - `evaluateConfluenceScore(symbol, candleData)`: Confluence evaluator combining all indicators into a unified score (0–100) and actionable signal (`STRONG_BUY`, `BUY`, `NEUTRAL`, `SELL`, `STRONG_SELL`).

2. **`src/utils/quorumConsensusEngine.js`** *(14-Bot Autonomous Consensus)*:
   - Evaluates real-time signals from all 14 bots:
     1. Momentum Master (Bot #1)
     2. BankNifty Breakout Hunter (Bot #2)
     3. Ultra Scalper (Bot #3)
     4. Gamma Squeeze Scalper (Bot #4)
     5. Bullion Macro Scalper (Bot #5)
     6. Crude Momentum Tracker (Bot #6)
     7. Institutional Equities Rider (Bot #7)
     8. Banking Titan Arbitrage (Bot #8)
     9. Auto Sector Leader (Bot #9)
     10. IT Trend Rider (Bot #10)
     11. Midcap Momentum Alpha (Bot #11)
     12. Currency FX Arbitrage (Bot #12)
     13. Silver Spike Catcher (Bot #13)
     14. Delta Neutral Hedger (Bot #14)
   - Evaluates live vote count against the strict 9/14 threshold:
     - $\ge 9$: **CONSENSUS_TRIGGERED** (Execution approved).
     - $7 - 8$: **QUORUM_VETO** (Strictly rejected with diagnostic telemetry).
     - $\le 6$: **INSUFFICIENT_CONSENSUS** (Neutral hold).

3. **`src/utils/taxCalculator.js`** *(Statutory Net Profit Guardrail)*:
   - Exhaustive Indian market statutory formulas:
     - Brokerage: `Math.min(20, turnover * 0.0005)`
     - STT: Options (0.0625% on sell), Equity Delivery (0.1% buy & sell), Intraday (0.025% sell)
     - Exchange Turnover: NSE (0.00325%), BSE (0.00375%), MCX (0.0021%)
     - SEBI Turnover Fee: ₹10 per crore (0.0001%)
     - Stamp Duty: 0.003% intraday / 0.002% options
     - GST: 18% on (Brokerage + Exchange Fees + SEBI Fees)
   - Validation method `validateNetProfitGuardrail(tradeParams)`:
     - Calculates projected gross profit from entry to target.
     - Deducts all statutory roundtrip charges.
     - Aborts if projected net ROI $< 1.5\%$ or if net profit $\le 0$.

4. **`src/utils/kellyPositionSizer.js`** *(Dynamic Capital Scaling)*:
   - Half-Kelly sizing algorithm factoring win-rate, profit-loss ratio, and asset ATR.
   - Micro-account support: adjusts fractional lot sizes or recommends liquid micro-derivatives/equities for ₹500–₹6,000 balances, while enforcing risk caps on large portfolios.

5. **`src/components/views/DecisionMeshHub.jsx` & Dashboard Integration**:
   - Updates the Decision Mesh Hub to render the real-time 14-bot consensus voting matrix, live vote breakdown, quorum threshold meter (highlighting the 9/14 pass line and 7-8 veto zone), and pre-trade tax audit badge.
   - Enforces React 19 safe state initialization and Error Boundary wrappers across all 17 sidebar views.

---

## 5. Verification & Acceptance Criteria

- **Compilation & Linting**: Zero syntax errors via `compile_applet` and zero unresolved lint warnings on new modules.
- **Confluence Strategy Validation**: Verification of indicator calculations across multi-asset samples.
- **Quorum Enforcement**: Automated test confirming orders with 7-8 bot votes trigger an official `Quorum Veto` rejection, and only orders with $\ge 9$ votes advance to execution.
- **Tax Filter Accuracy**: Automated test verifying that any trade with projected net ROI $< 1.5\%$ is rejected with exact breakdown of STT, GST, and broker charges.
- **Capital Scaling**: Position calculation verifies accurate sizing for accounts from ₹500 up to ₹5,00,000+.
