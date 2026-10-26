# CHINTU AI — TEST EXECUTION EVIDENCE & FORENSIC LOG
**Execution Timestamp:** 2026-10-24T15:20:00+05:30  
**Test Harness Environment:** Node.js v24.21.0 | Python 3.12.10 | Windows 11  
**Total Automated Tests:** 224  
**Total Passing:** 224 (100.0%)  
**Total Failing:** 0 (0.0%)  
**Production DB State:** 0 Active Trades | 0 Active Positions (100% Unpolluted)

---

## 1. Test Suite Summary Table

| Index | Test Suite File | Engine | Tests Run | Passed | Failed | Duration | Status |
|---|---|---|---|---|---|---|---|
| **01** | `tests/test_angel_order_adapter_and_live_readiness.ts` | Node.js TS | 24 | 24 | 0 | 450 ms | **PASS** |
| **02** | `tests/test_chintu_core_regression.ts` | Node.js TS | 25 | 25 | 0 | 461 ms | **PASS** |
| **03** | `tests/test_chintu_provider_and_integrations.ts` | Node.js TS | 20 | 20 | 0 | 380 ms | **PASS** |
| **04** | `tests/test_data_integrity_and_provenance.ts` | Node.js TS | 23 | 23 | 0 | 489 ms | **PASS** |
| **05** | `tests/test_day_trader_skill_indian_adaptation.ts` | Node.js TS | 25 | 25 | 0 | 520 ms | **PASS** |
| **06** | `tests/test_end_to_end_paper_trading_pipeline.ts` | Node.js TS | 9 | 9 | 0 | 310 ms | **PASS** |
| **07** | `tests/test_multi_user_and_connections.ts` | Node.js TS | 23 | 23 | 0 | 410 ms | **PASS** |
| **08** | `tests/test_multi_user_concurrency_and_load.ts` | Node.js TS | 5 | 5 | 0 | 440 ms | **PASS** |
| **09** | `tests/test_post_validation_security_audit.ts` | Node.js TS | 14 | 14 | 0 | 390 ms | **PASS** |
| **10** | `tests/test_real_world_multi_user_acceptance.ts` | Node.js TS | 17 | 17 | 0 | 420 ms | **PASS** |
| **11** | `tests/test_telegram_and_risk_guardrails.ts` | Node.js TS | 7 | 7 | 0 | 290 ms | **PASS** |
| **12** | `tests/test_universe_scanner_and_capital_aware_session.ts` | Node.js TS | 26 | 26 | 0 | 490 ms | **PASS** |
| **13** | `tests/test_prompt5_paper_pipeline_and_simulation.py` | Pytest | 6 | 6 | 0 | 50 ms | **PASS** |
| **TOTAL** | **13 Suites Across All Frameworks** | **Unified** | **224** | **224** | **0** | **~4.6 s** | **100% PASS** |

---

## 2. Test Execution Details by Domain

### 2.1 Live Trading Safety & Order Gate (`test_angel_order_adapter_and_live_readiness.ts`)
- **Tests Passed:** 24/24
- **Key Invariants Verified:**
  - `AngelOrderExecutionAdapter.LIVE_TRADING_ELIGIBLE === false` permanently locked.
  - `canExecuteLiveOrder()` returns `{ allowed: false, reason: 'LIVE_TRADING_PERMANENTLY_DISABLED_USE_PAPER_ENGINE' }`.
  - Calling `placeOrder()` returns `{ status: false, errorcode: 'AB1000_LIVE_TRADING_DISABLED' }`.
  - Zero live broker order packets dispatched.

### 2.2 Core Persistence & Market Data Adapter (`test_chintu_core_regression.ts`)
- **Tests Passed:** 25/25
- **Key Invariants Verified:**
  - SQLite persistence for open positions, trade records, and audit events.
  - Restart persistence verified across disconnect and reconnect cycles.
  - RFC 6238 6-digit TOTP generation matches official Angel One algorithm.
  - 51-byte SmartStream v2 binary packet parser decodes tokens, timestamps, and LTP.
  - Duplicate packets rejected by sequence number; stale ticks ($>120\text{ s}$) flagged `STALE`.

### 2.3 Data Integrity & Provenance (`test_data_integrity_and_provenance.ts`)
- **Tests Passed:** 23/23
- **Key Invariants Verified:**
  - Section 1: Clean initial state guarantees 0 positions, 0 closed trades, empty `initialRecentTrades = []`, empty `marketWisePerformance = []`.
  - Section 2: Permanent fail-closed live trading.
  - Section 3: Dynamic ₹0.00 gross/net PnL calculation when unstarted.
  - Section 4: Market feed standby gating.
  - Section 5: All 10 Data Provenance Invariants verified (idempotent upsert, mathematical distinction between gross and net PnL, win/loss definition).

### 2.4 Day Trader Indian Adaptation & Time Machine (`test_day_trader_skill_indian_adaptation.ts`)
- **Tests Passed:** 25/25
- **Key Invariants Verified:**
  - 75 5-minute bars per Indian session (09:15 to 15:30 IST).
  - 10,000-replay Monte Carlo simulation testing stop before target within every bar.
  - Empirical break-even verdicts calculated against R-multiples.
  - Indian market calendar awareness (holidays, session cutoffs at 15:25 IST).

### 2.5 Multi-User Concurrency & Connection Vault (`test_multi_user_and_connections.ts` & `test_multi_user_concurrency_and_load.ts`)
- **Tests Passed:** 28/28 (23 + 5)
- **Key Invariants Verified:**
  - User session isolation; user connection vault encrypts credentials with AES-256-GCM.
  - Concurrent writes do not corrupt database or produce race conditions.
  - Automatic session timeout and token expiration handling.

### 2.6 Security Audit & Telegram Guardrails (`test_post_validation_security_audit.ts` & `test_telegram_and_risk_guardrails.ts`)
- **Tests Passed:** 21/21 (14 + 7)
- **Key Invariants Verified:**
  - Telegram bot commands authenticated against authorized Chat ID.
  - Dangerous commands (`/buy`, `/sell`) cannot bypass RMS circuit breakers.
  - Token and API key redaction in logging and API responses.

### 2.7 Indian Regulatory Statutory Pipeline (`test_prompt5_paper_pipeline_and_simulation.py`)
- **Tests Passed:** 6/6
- **Key Invariants Verified:**
  - Initial capital invariant: ₹5,00,000 starting capital.
  - Intraday drawdown limit: 2.5% (₹12,500). Max daily loss: ₹25,000.
  - Statutory formulas: Brokerage (min ₹20 or 0.03%), STT (0.0625% options sell), GST (18%), Exchange (0.00325%), SEBI (₹10/crore), Stamp Duty (0.003% buy).
  - Pre-trade statutory net profit hurdle: 1.50% minimum net ROI.

---

## 3. Production Database Purity Audit

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

## 4. Live Server Endpoint Health Checks (Port 3088)

Probed via HTTP against running server:

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

// GET /api/memory/trades
{
  "trades": [],
  "total_trades": 0
}
```

---

## 5. Build & Lint Verification Logs

### 5.1 Vite Production Build Log
```
> new@0.0.0 build
> vite build

vite v8.3.4 building client environment for production...
transforming...
✓ 2909 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                               3.11 kB │ gzip:   1.29 kB
dist/assets/index-Bv5KS_6V.css              140.04 kB │ gzip:  18.16 kB
dist/assets/rolldown-runtime-XKyaHtl9.js      0.72 kB │ gzip:   0.42 kB
dist/assets/vendor-icons-DR1HPKKr.js         41.58 kB │ gzip:  14.03 kB
dist/assets/vendor-graphics-Fm_DYoqm.js     199.46 kB │ gzip:  46.77 kB
dist/assets/vendor-react-bGs5ihhk.js        214.02 kB │ gzip:  66.98 kB
dist/assets/index-DySyVVul.js             1,440.46 kB │ gzip: 348.79 kB
✓ built in 3.26s
```

### 5.2 Oxlint Log
```
> new@0.0.0 lint
> oxlint

Found 659 warnings and 0 errors.
Finished in 386ms on 103 files with 104 rules using 8 threads.
Exit Code: 0
```

---

## 6. Secret Scan Audit Log
- **Total unmasked production secrets found:** **0**
- All connection vault credentials secured with AES-256-GCM.
- Scanned across all TypeScript, JavaScript, Python, JSON, and Markdown files.

---

*Evidence report certified by QA Automation Lead on 2026-10-24.*

