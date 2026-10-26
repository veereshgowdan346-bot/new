# CHINTU AI — FINAL TEST EXECUTION EVIDENCE & LOGS
**Execution Timestamp:** 2026-10-24T15:42:00+05:30  
**Test Harness Environment:** Node.js v24.21.0 | Python 3.12.10 | Windows 11  
**Total Automated Tests:** 231  
**Total Passing:** 231 (100.0%)  
**Total Failing:** 0 (0.0%)  
**Production DB State:** 0 Active Trades | 0 Active Positions (100% Unpolluted)

---

## 1. Master Test Suite Execution Summary

| Index | Test Suite File | Engine | Tests Run | Passed | Failed | Status |
|---|---|---|---|---|---|---|
| **01** | `tests/test_angel_order_adapter_and_live_readiness.ts` | Node.js TS | 24 | 24 | 0 | **PASS** |
| **02** | `tests/test_chintu_core_regression.ts` | Node.js TS | 25 | 25 | 0 | **PASS** |
| **03** | `tests/test_chintu_provider_and_integrations.ts` | Node.js TS | 20 | 20 | 0 | **PASS** |
| **04** | `tests/test_data_integrity_and_provenance.ts` | Node.js TS | 23 | 23 | 0 | **PASS** |
| **05** | `tests/test_day_trader_skill_indian_adaptation.ts` | Node.js TS | 25 | 25 | 0 | **PASS** |
| **06** | `tests/test_emergency_kill_switch_accessibility.ts` | Node.js TS | 7 | 7 | 0 | **PASS** |
| **07** | `tests/test_end_to_end_paper_trading_pipeline.ts` | Node.js TS | 9 | 9 | 0 | **PASS** |
| **08** | `tests/test_multi_user_and_connections.ts` | Node.js TS | 23 | 23 | 0 | **PASS** |
| **09** | `tests/test_multi_user_concurrency_and_load.ts` | Node.js TS | 5 | 5 | 0 | **PASS** |
| **10** | `tests/test_post_validation_security_audit.ts` | Node.js TS | 14 | 14 | 0 | **PASS** |
| **11** | `tests/test_real_world_multi_user_acceptance.ts` | Node.js TS | 17 | 17 | 0 | **PASS** |
| **12** | `tests/test_telegram_and_risk_guardrails.ts` | Node.js TS | 7 | 7 | 0 | **PASS** |
| **13** | `tests/test_universe_scanner_and_capital_aware_session.ts` | Node.js TS | 26 | 26 | 0 | **PASS** |
| **14** | `tests/test_prompt5_paper_pipeline_and_simulation.py` | Pytest | 6 | 6 | 0 | **PASS** |
| **TOTAL** | **14 Test Suites Across All Frameworks** | **Unified** | **231** | **231** | **0** | **100% PASS** |

---

## 2. Test Execution Details by Domain

### 2.1 Emergency Kill Switch Accessibility (`test_emergency_kill_switch_accessibility.ts`)
- **Tests Passed:** 7/7
- **Evidence:**
  - FAB positioned at `bottom-20 md:bottom-6 right-4 md:right-6 z-[60]`, guaranteeing clearance above the 56px mobile bottom navigation bar.
  - Confirmation modal configured at `z-[9999]` with `titlebar-no-drag` and `pointer-events-auto`.
  - Fastpath double-click (<350ms) and hold-to-fire (750ms) validated.
  - Keyboard accessibility (`Escape` to close, `Enter` to confirm) validated.
  - Toast notifications docked at `top-16 right-4`, eliminating collisions with the FAB.
  - `TopNavbar` prioritizes Kill Switch by hiding secondary PnL widgets on mobile viewports (<480px).

### 2.2 Live Trading Safety & Order Gate (`test_angel_order_adapter_and_live_readiness.ts`)
- **Tests Passed:** 24/24
- **Evidence:**
  - `AngelOrderExecutionAdapter.LIVE_TRADING_ELIGIBLE === false` permanently locked.
  - Calling `placeOrder()` returns `{ status: false, errorcode: 'AB1000_LIVE_TRADING_DISABLED' }`.
  - Zero live broker requests dispatched.

### 2.3 Data Integrity & Provenance (`test_data_integrity_and_provenance.ts`)
- **Tests Passed:** 23/23
- **Evidence:**
  - Clean initial state guarantees 0 open positions, 0 closed trades, empty `initialRecentTrades = []`.
  - Standby status strictly enforced on all initial bots.
  - All 10 Data Provenance Invariants verified (idempotent upsert, mathematical distinction between gross and net PnL, win/loss definition).

### 2.4 Day Trader Indian Adaptation & Time Machine (`test_day_trader_skill_indian_adaptation.ts`)
- **Tests Passed:** 25/25
- **Evidence:**
  - 75 5-minute bars per Indian session (09:15 to 15:30 IST).
  - 10,000-replay Monte Carlo simulation testing stop before target within every bar.
  - Empirical break-even verdicts calculated against R-multiples.
  - Indian market calendar awareness (holidays, session cutoffs at 15:25 IST).

### 2.5 Regulatory Pipeline & Statutory Charges (`test_prompt5_paper_pipeline_and_simulation.py`)
- **Tests Passed:** 6/6
- **Evidence:**
  - Initial capital invariant: ₹5,00,000 starting capital.
  - Intraday drawdown limit: 2.5% (₹12,500). Max daily loss: ₹25,000.
  - Statutory formulas: Brokerage (min ₹20 or 0.03%), STT (0.0625% options sell), GST (18%), Exchange (0.00325%), SEBI (₹10/crore), Stamp Duty (0.003% buy).
  - Pre-trade statutory net profit hurdle: 1.50% minimum net ROI.

---

## 3. Production Database Zero-Pollution Verification

```sql
-- Executed against server/data/chintu_runtime.db
SELECT COUNT(*) FROM positions;             -- Output: 0
SELECT COUNT(*) FROM trades;                -- Output: 0
SELECT COUNT(*) FROM trades_test_archive;   -- Output: 271
SELECT COUNT(*) FROM positions_test_archive;-- Output: 259
SELECT COUNT(*) FROM users;                 -- Output: 120
SELECT COUNT(*) FROM user_connections;      -- Output: 135
SELECT COUNT(*) FROM user_audit_log;        -- Output: 287
SELECT COUNT(*) FROM rms_events;            -- Output: 23
SELECT COUNT(*) FROM chat_messages;         -- Output: 10
PRAGMA integrity_check;                     -- Output: ok
```

---

## 4. Production Build & Static Analysis Logs

### 4.1 Vite Production Build Log
```
> new@0.0.0 build
> vite build

vite v8.3.4 building client environment for production...
transforming...
✓ 2909 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                               3.11 kB │ gzip:   1.28 kB
dist/assets/index-Bx4UuHE0.css              140.35 kB │ gzip:  18.21 kB
dist/assets/rolldown-runtime-XKyaHtl9.js      0.72 kB │ gzip:   0.42 kB
dist/assets/vendor-icons-DR1HPKKr.js         41.58 kB │ gzip:  14.03 kB
dist/assets/vendor-graphics-Fm_DYoqm.js     199.46 kB │ gzip:  46.77 kB
dist/assets/vendor-react-bGs5ihhk.js        214.02 kB │ gzip:  66.98 kB
dist/assets/index-Di3iVz6q.js             1,440.76 kB │ gzip: 348.86 kB
✓ built in 3.33s
```

### 4.2 Oxlint Log
```
> new@0.0.0 lint
> oxlint

Found 659 warnings and 0 errors.
Finished in 360ms on 103 files with 104 rules using 8 threads.
Exit Code: 0
```

---

## 5. Live Server Probes (Port 3088)

```json
// GET /api/dashboard/stats
{
  "totalTrades": 0,
  "winningTrades": 0,
  "losingTrades": 0,
  "activeTrades": 0,
  "todayProfit": 0,
  "activeMarkets": 0,
  "marketDataStatus": "STANDBY",
  "paperTradingStatus": "NOT_STARTED",
  "isLiveTradingEligible": false
}

// GET /api/pnl
{
  "grossPnl": 0,
  "netPnl": 0,
  "charges": 0,
  "mode": "PAPER"
}
```

---

*Final test evidence certified by QA Lead on 2026-10-24.*

