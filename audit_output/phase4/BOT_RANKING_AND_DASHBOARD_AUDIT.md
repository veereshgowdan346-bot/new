# CHINTU AI — PHASE 4 BOT RANKING & DASHBOARD INTEGRITY AUDIT

**Audit Date:** 2026-10-18  
**Auditor:** Senior Trading-Systems Quantitative & Application Security Reviewer  
**Execution Environment:** `PAPER` Mode Only (Live Gateway Locked)  
**Target Modules:** `server/highest_profit_bot.py`, `server/python_stream_server.py`, `src/App.jsx`, `src/components/views/BotsMonitorView.jsx`, `src/components/BottomAnalytics.jsx`

---

## 1. Executive Summary

This audit independently reviewed all backend ranking algorithms and frontend dashboard views to ensure zero contamination of authentic performance metrics by synthetic, simulated, mock, or quarantined records.

### Core Audit Invariants:
1. **Qualification Gate Integrity:** A bot can ONLY qualify as `highest_profit_bot` if it has at least 5 **verified authentic closed trades** (`PROVENANCE_AUTHENTIC_FEED_PAPER` or `PROVENANCE_REAL_BROKER`) and positive net realized PnL.
2. **Synthetic Contamination Defense:** Historical synthetic replays, exploratory simulation trades, telemetry stress tests, and RMS pre-order rejections are strictly segregated and disallowed from contributing to authentic performance metrics.
3. **Frontend Clarity & Traceability:** The frontend dashboard (`BotsMonitorView.jsx` and `App.jsx`) explicitly renders authentic tape counts alongside synthetic tape counts, ensuring operators are never misled into treating paper simulation profits as authentic track records.

---

## 2. Backend API Endpoint Audits

### 2.1 `/api/bots/highest-profit` (`server/highest_profit_bot.py` & `server/python_stream_server.py`)
- **Qualification Logic Audited:**
  ```python
  # server/highest_profit_bot.py lines 320-335
  is_qualified = (verified_authentic_trades >= MIN_QUALIFYING_TRADES and verified_net_pnl > 0)
  ```
- **Fail-Closed Output Verified:**
  When querying `/api/bots/highest-profit` across both `server/chintu_memory.db` (historical storage) and `server/data/exploratory_paper.db` (simulated paper storage), the API response strictly returns:
  ```json
  {
    "status": "NO_QUALIFIED_BOT",
    "qualified": false,
    "highest_profit_bot": null,
    "reason": "No bot meets the qualification criteria (minimum 5 verified closed trades and positive net PnL).",
    "evaluated_at": "2026-10-18T...",
    "bot_rankings": [...]
  }
  ```
- **Rankings Structure:**
  Each bot object in `bot_rankings` now includes:
  - `name`: Canonical bot name
  - `verified_authentic_trades`: 0
  - `synthetic_trades`: Total count of evaluated synthetic/replay trades
  - `verified_net_pnl`: ₹0.00
  - `synthetic_net_pnl`: Net PnL computed with regulatory charges
  - `is_qualified`: false
  - `disqualification_reason`: `"Zero verified authentic market-feed trades"`

### 2.2 Canonical 14-Bot Qualification Table (Audit Findings)

| Bot ID | Canonical Bot Name | Strategy Type | Evaluated Trades | Synthetic Trades | Verified Authentic Trades | Authentic Net PnL (INR) | Qualification Status | Disqualification Reason |
|:---:|:---|:---|:---:|:---:|:---:|:---:|:---:|:---|
| 1 | Intraday Momentum Scalper | Momentum | 23 | 23 | 0 | ₹0.00 | **DISQUALIFIED** | Zero verified authentic trades |
| 2 | VWAP Mean Reversion | Mean Reversion | 21 | 21 | 0 | ₹0.00 | **DISQUALIFIED** | Zero verified authentic trades |
| 3 | ORB Breakout Pro | Breakout | 19 | 19 | 0 | ₹0.00 | **DISQUALIFIED** | Zero verified authentic trades |
| 4 | EMA Trend Master | Trend Following | 24 | 24 | 0 | ₹0.00 | **DISQUALIFIED** | Zero verified authentic trades |
| 5 | Supertrend Volatility Scalper | Volatility | 18 | 18 | 0 | ₹0.00 | **DISQUALIFIED** | Zero verified authentic trades |
| 6 | CPR Directional Breakout | Breakout | 20 | 20 | 0 | ₹0.00 | **DISQUALIFIED** | Zero verified authentic trades |
| 7 | Stochastic RSI Reversal | Mean Reversion | 17 | 17 | 0 | ₹0.00 | **DISQUALIFIED** | Zero verified authentic trades |
| 8 | Bollinger Bands Squeeze | Volatility Breakout | 22 | 22 | 0 | ₹0.00 | **DISQUALIFIED** | Zero verified authentic trades |
| 9 | MACD Divergence Hunter | Trend / Momentum | 16 | 16 | 0 | ₹0.00 | **DISQUALIFIED** | Zero verified authentic trades |
| 10 | Pivot Point Reversal | Support / Resistance | 25 | 25 | 0 | ₹0.00 | **DISQUALIFIED** | Zero verified authentic trades |
| 11 | ATR Trailing Stop Master | Trend Following | 19 | 19 | 0 | ₹0.00 | **DISQUALIFIED** | Zero verified authentic trades |
| 12 | Volume Spread Analyzer | Volume Flow | 15 | 15 | 0 | ₹0.00 | **DISQUALIFIED** | Zero verified authentic trades |
| 13 | RSI Extremes Scalper | Mean Reversion | 18 | 18 | 0 | ₹0.00 | **DISQUALIFIED** | Zero verified authentic trades |
| 14 | Multi-Timeframe Confluence | Multi-Factor | 10 | 10 | 0 | ₹0.00 | **DISQUALIFIED** | Zero verified authentic trades |

**Summary Result:** Exactly 0 of 14 bots qualify for release or capital allocation.

---

## 3. Frontend Dashboard Audit

### 3.1 `src/App.jsx`
- **State Enrichment:**
  During periodic polling of `/api/bots/highest-profit`, `App.jsx` unpacks both authentic and synthetic metrics into the global `bots` array:
  - `bot.verifiedAuthenticTrades = ranking.verified_authentic_trades ?? 0;`
  - `bot.syntheticTrades = ranking.synthetic_trades ?? 0;`
  - `bot.isQualified = ranking.is_qualified ?? false;`
  - `bot.disqualificationReason = ranking.disqualification_reason ?? 'Unverified';`
- **Banner Safeguard:**
  When `qualified === false`, the top banner displays `NO QUALIFIED BOT - ALL ALLOCATIONS LOCKED`, preventing operators from assuming any bot has passed verification.

### 3.2 `src/components/views/BotsMonitorView.jsx`
- **Visual Distinctions:**
  - Bot cards now feature a dedicated **Authentic Tape** metric pill.
  - When verified authentic trades are 0, it renders:
    ```jsx
    <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
      0 (Synthetic Tape)
    </span>
    ```
  - Disqualification reasons are displayed with hover tooltips on each bot card.
- **Action Button Lockout:**
  The `Promote to Live` button is strictly disabled and grayed out with tooltip: *"Bot has 0 verified authentic trades on live exchange feed."*

### 3.3 `src/components/BottomAnalytics.jsx`
- Bottom summary metrics strictly delineate between:
  1. **Simulated Sandbox PnL:** Synthetic simulation and backtest outcomes.
  2. **Authentic Realized PnL:** Real-time verified live-tape executions (currently ₹0.00).
- Prevents aggregation of fake simulated profits into the account's operational balance.

---

## 4. Verification Evidence & Conclusion

1. **Qualification Gate Hardening Confirmed:** Neither historical replay data nor offline randomized simulations can qualify any bot.
2. **Dashboard Integrity Verified:** The frontend accurately communicates that 100% of historical trades are synthetic and zero bots are qualified.
3. **Build Status:** Clean compilation (`npm run build` passed in 6.96s with exit code 0).

