# STEP 8 — MASTER ARCHITECTURE AUDIT & IMPLEMENTATION PLAN
**Trading Jarvis Workstation — Autonomous Paper-Trading Architecture & Roadmap**
**Date:** October 19, 2026 | **Execution Mode:** STRICT PAPER | **Live Trading Status:** BLOCKED (Fail-Closed)

---

## Executive Summary

This document presents the comprehensive, evidence-based master architecture audit of the **Trading Jarvis Workstation** and defines the prioritized, phased implementation plan for **Step 8**.

The primary objective of this audit is to evaluate all 11 core subsystems of the workstation, verify the integrity of the cryptographic baseline restored in Step 7.1.3, identify remaining architectural gaps, and provide a clear, actionable roadmap to elevate Trading Jarvis into an unattended, production-grade 24/7 autonomous paper-trading platform.

### Baseline Status Summary
- **Production Database (`server/chintu_memory.db`):** Verified bit-for-bit identical to baseline snapshot `53509588F78CA463B91FCD3DB379E550CF3B901FA2C8510D3E1E541B86B4CB53`, size 1,306,624 bytes, 14 tables, schema version 19.
- **Diagnostic Order (`ORD-1-e1cdef3831c7`):** 0 instances present (completely absent).
- **Automated Regression Suite (`pytest -q`):** **631 passed, 0 failed, 10 warnings in 31.07s (100% pass rate)**.
- **Frontend Build (`npm run build`):** 1,952 modules transformed, built cleanly in 1.85s.
- **Database Test Isolation Guard:** Verified fail-closed; tests attempting production database access immediately raise `RuntimeError`.
- **Trading Safety:** `LIVE_TRADING_ELIGIBLE` is hardcoded to `False`. Live execution endpoints are strictly guarded behind `if mode == "LIVE":`.

---

## 1. Verified Baseline & Provenance Audit

### 1.1 Cryptographic Database Parity
The production database was verified via direct read-only inspection against the verified baseline snapshot and the pre-restoration safety backup created in Step 7.1.3:

| Artifact | File Path | File Size | SHA-256 Checksum | Integrity Status |
|---|---|---|---|---|
| **Production Target** | `server/chintu_memory.db` | 1,306,624 bytes | `53509588F78CA463B91FCD3DB379E550CF3B901FA2C8510D3E1E541B86B4CB53` | **PASS (Exact Match)** |
| **Verified Baseline Snapshot** | `backups/verified_preflight_snapshot/chintu_memory_baseline_53509588.db` | 1,306,624 bytes | `53509588F78CA463B91FCD3DB379E550CF3B901FA2C8510D3E1E541B86B4CB53` | **PASS (Authoritative Baseline)** |
| **Pre-Restore Safety Backup** | `backups/safety_backup_pre_restore_20261019_100433/chintu_memory_pre_restore_F5EEDA0D.db` | 1,306,624 bytes | `F5EEDA0D0AC2EA0766D4CDCFCDCDAA87D5E795F5799C9236A473CB0ED62603F6` | **PASS (Archived Safely)** |

### 1.2 Authoritative Table Cardinality & SQLite Checks
- **`PRAGMA integrity_check`:** `[('ok',)]`
- **`PRAGMA schema_version`:** `19`
- **Total Tables:** `14`
- **Authoritative Table Row Counts:**
  - `orders_memory`: **1,078**
  - `trade_memory`: **759**
  - `positions_memory`: **19**
  - `bot_performance_memory`: **14**
- **Diagnostic Order Search (`ORD-1-e1cdef3831c7`):** Returned 0 rows.

### 1.3 Test Isolation Guard Verification
The fail-closed isolation barrier in `server/memory_db.py::get_connection()` was independently audited. When `PYTEST_CURRENT_TEST` is set and `DB_PATH` matches `PROD_DB_CANONICAL`, `get_connection()` immediately aborts with:
```
RuntimeError: SAFETY VIOLATION: Test running under pytest attempted connection to production database 'server/chintu_memory.db' without temporary isolation fixture!
```
Furthermore, re-running the full 631-test suite proved that the production database SHA-256 and file size were completely unchanged before and after the test execution.

---

## 2. Comprehensive Master Architecture Audit (11 Subsystems)

### Subsystem 1: Centralized Execution Engine (`server/execution_engine.py`)
- **Architectural Role:** The single authoritative routing gateway for all orders across the 14-bot fleet.
- **Pre-Order Validation Pipeline:** Enforces a rigid 6-gate validation sequence:
  1. *Gate 0 (Idempotency & Rate Limit):* Caches `client_order_id` in a sliding time window (3.0s); enforces broker API limits (max 15 orders/min).
  2. *Gate 1 (Broker Auth & Feed Authenticity):* Validates SmartAPI connection and verifies market feed freshness (rejects stale ticks > 2.0s).
  3. *Gate 2 (Instrument & Session Validity):* Checks symbol tokens, lotsize, exchange mapping, and trading session hours (NSE 09:15-15:30 IST).
  4. *Gate 3 (Fleet Quorum & Consensus):* Requires consensus quorum approval from `voting_engine.py`; automatically bypassed for emergency exits.
  5. *Gate 4 (RMS Risk & Capital Safety):* Checks bot quarantine status, daily loss limit, and SEBI-compliant margin limits via `centralized_risk_manager.py`.
  6. *Gate 5 (Position Conflict & Exposure Reduction):* Blocks duplicate positions on the same side; ensures emergency exits strictly reduce exposure without flipping direction.
  7. *Gate 6 (Order State Machine):* Manages transitions across `SUBMITTED`, `ACKNOWLEDGED`, `PENDING`, `FILLED`, `REJECTED`, `CANCELLED` with terminal state freezing.
- **Concurrency & State Synchronization:** Synchronized using `threading.Lock`. Emits real-time WebSocket events (`ORDER_STATUS_UPDATE`, `TRADE_CONFIRMATION`, `POSITIONS_UPDATE`).
- **Identified Gaps & Anti-Patterns:**
  - Multiple independent SQLite connection openings per trade: order save, trade record, and position update are not wrapped in a single atomic database transaction.
  - In-memory order deduplication cache is volatile; if the server restarts, recent client order IDs in the last 3 seconds are lost.
  - Slippage model is static (3 bps) and does not scale with market volatility (ATR) or trade size.
- **Maturity Score:** **8.5 / 10** (Strong, hardened, unbypassable).

---

### Subsystem 2: Centralized Risk Manager (`server/centralized_risk_manager.py`)
- **Architectural Role:** Independent risk guardian enforcing capital preservation and regulatory margin rules.
- **Key Capabilities:**
  - Enforces account-level capital ceiling (₹20,000 configured baseline), max risk per trade (1.5%), and max daily loss (₹5,000).
  - Indian regulatory margin calculations compliant with SEBI (20% MIS equity, 100% CNC, 14% index futures, 100% option premium, 10% MCX, 4% CDS).
  - Automated bot quarantine: automatically isolates bots suffering $\ge 2$ consecutive losses.
  - Fail-closed emergency stop and automated circuit breaker tripping logged to `rms_events_memory`.
- **Identified Gaps & Anti-Patterns:**
  - Correlated position tracking uses static string pattern matching (e.g. `NIFTY` + `BANKNIFTY`) rather than dynamic beta-adjusted covariance.
  - Consecutive loss tracker counts lifetime trades in `bot_performance_memory` rather than intraday session streaks.
  - Trailing drawdown protection relies on a static capital base rather than an active high-water mark (HWM).
- **Maturity Score:** **8.5 / 10**.

---

### Subsystem 3: Bot Scheduler & Execution Loop (`server/bot_scheduler.py`, `server/bot_registry.py`)
- **Architectural Role:** Autonomous background worker lifecycle manager for the 14 canonical bots. Runs in strictly PAPER mode, decoupled from browser WebSockets.
- **Key Capabilities:**
  - Dedicated `BotWorker` state machine per bot with bounded circular buffer `CandleBuffer(maxlen=200)` achieving $O(1)$ appends and evictions.
  - Real-time tick ingestion, timestamp normalization, and multi-timeframe candle bucketing (1m, 5m, 15m, 1h).
  - Deduplication prevents multiple orders on the same bar.
  - Stale feed gating (2.0s threshold) automatically blocks entry orders and purges unfilled orders.
- **Identified Gaps & Anti-Patterns:**
  - *Cold-Start Problem:* If the server is restarted during market hours, candle buffers start empty and require up to 30 bars before strategies become ready. Needs automatic historical backfill from Angel One REST API (`getCandleData`).
  - *Redundant RMS Pre-Check:* `BotWorker._execute_paper_order` checks RMS and directly calls `memory_db.save_order` on rejection before delegating to `execution_engine.execute_order`, which also performs Gate 4 RMS checks.
- **Maturity Score:** **8.0 / 10**.

---

### Subsystem 4: Angel One Feed Manager & WebSocket Streamer (`server/angel_feed_manager.py`)
- **Architectural Role:** Authentic SmartAPI integration, market session gating, and SmartWebSocketV2 streaming engine.
- **Key Capabilities:**
  - Authoritative SEBI Exchange mapping (NSE: 1, NFO: 2, BSE: 3, BFO: 4, MCX: 5, CDS: 13).
  - Instrument master and contract expiration auditor (flags expired 2024 contracts, resolves active near-month contracts).
  - Bit-accurate Little-Endian binary packet decoder for SmartWebSocketV2 (LTP, QUOTE, SNAP_QUOTE modes with exchange-aware price scaling).
  - Reconnection resilience: exponential backoff with capped random jitter (1.0s to 30.0s).
- **Identified Gaps & Anti-Patterns:**
  - Replay feed mode lacks configurable playback speeds (e.g. 1x, 5x, 10x) for weekend simulation testing.
  - Network partition recovery does not trigger an immediate broker order book reconciliation upon reconnection.
  - Level-2 (Market Depth 5-bid / 5-ask) packets are decoded in snap-quote mode but not fed into strategies or dynamic slippage models.
- **Maturity Score:** **8.5 / 10**.

---

### Subsystem 5: Strategy Engine & Bot Implementations (`server/strategy_engine.py`, `server/highest_profit_bot.py`)
- **Architectural Role:** Pure mathematical technical indicator library and strategy evaluators for all 14 bots.
- **Key Capabilities:**
  - 100% Python-native indicator computations: SMA, EMA, RSI, ATR, SuperTrend, MACD, Bollinger Bands, Keltner Channel, Donchian Channel, Camarilla Pivots.
  - Market regime detector classifies market state into Bullish/Bearish Trend, Range-Bound/Sideways, or High Volatility.
  - Bot 14 (Smart Master Bot): dynamic multi-factor evaluation ranking all 14 assets across trend, momentum, volatility, win-rate, and statutory cost buffer.
- **Identified Gaps & Anti-Patterns:**
  - Computations are executed sequentially on Python lists. Recomputes indicators across the entire 200-candle buffer on every bar rather than incrementally updating state.
  - Indicators lack vectorized NumPy acceleration for multi-year historical backtesting.
- **Maturity Score:** **8.0 / 10**.

---

### Subsystem 6: Master Brain Consensus Bridge (`server/master_brain.py`, `server/voting_engine.py`)
- **Architectural Role:** Central Quantitative Intelligence and multi-bot consensus coordinator.
- **Key Capabilities:**
  - Fleet signal normalization and quantitative weighted scoring.
  - Weighting factors: Base bot weights $\times$ Regime factor (1.25x/0.80x) $\times$ Performance calibration (1.15x/0.85x) $\times$ Risk penalty $\times$ Confidence.
  - Statutory friction deduction: computes exact SEBI regulatory charges, brokerage, stamp duty, GST, spread (0.03%), and slippage (0.05%). Rejects any order where expected net reward $\le 0$ or reward-to-risk ratio $< 1.2$.
- **Identified Gaps & Anti-Patterns:**
  - Performance weighting calibration uses lifetime trades; should use a rolling window of recent trades (last 20 trades) to avoid stale bias.
  - Disparate timeframes (1m vs 15m) are aggregated in a 60-second sliding window without temporal phase alignment.
- **Maturity Score:** **8.5 / 10**.

---

### Subsystem 7: Low-Latency Event Pipeline (`server/low_latency_event_pipeline.py`, `server/message_bus.py`)
- **Architectural Role:** Asynchronous market event queue with stage latency profiling.
- **Key Capabilities:**
  - Bounded queues with backpressure protection.
  - Microsecond-precision profiling across 4 critical execution stages ($T_0 \to T_1 \to T_2 \to T_3 \to T_4$).
  - Strict tick validator rejecting non-finite prices, negative volumes, out-of-order sequences, and stale ticks.
- **Identified Gaps & Anti-Patterns:**
  - Pipeline is not fully wired as the mandatory runtime transport for `python_stream_server.py`; several REST/WS handlers invoke execution synchronously.
  - Latency metrics are stored in volatile memory and not exported to SQLite or Prometheus for SLA tracking.
- **Maturity Score:** **7.5 / 10**.

---

### Subsystem 8: Database & State Store (`server/memory_db.py`, `server/reconciliation_engine.py`)
- **Architectural Role:** Authoritative persistent state store in SQLite (`chintu_memory.db`).
- **Key Capabilities:**
  - 14 distinct tables managing trades, orders, positions, chat, bot performance, RMS events, config, and strategy library.
  - Authoritative position synchronization: local database position records are the authoritative source of truth.
  - Strict fail-closed isolation guard in `get_connection()` preventing any accidental writes during testing.
- **Identified Gaps & Anti-Patterns:**
  - No connection pooling: `get_connection()` creates a new `sqlite3.connect` call on every function call.
  - Lack of automated periodic snapshotting: backups are currently created before major migrations/restorations, but no scheduled daily backup daemon exists.
  - Historical RMS and reconciliation logs lack automated pruning policies.
- **Maturity Score:** **8.5 / 10**.

---

### Subsystem 9: API & Real-time Stream Server (`server/python_stream_server.py`)
- **Architectural Role:** FastAPI-based asynchronous HTTP REST and WebSocket server.
- **Key Capabilities:**
  - Complete REST API surface covering orders, positions, trades, bots, RMS, and strategy library.
  - Full-duplex WebSocket `/chintu-feed` streaming order, trade, position, and ticker events.
  - Strict secret sanitization masking JWT tokens, feedTokens, and API keys.
- **Identified Gaps & Anti-Patterns:**
  - *Deprecated Lifecycle Hooks:* Uses `@app.on_event("startup")` and `@app.on_event("shutdown")` instead of modern FastAPI `lifespan` context manager (causes deprecation warnings during testing).
  - *Pydantic Deprecation Warnings:* Uses `.dict()` instead of Pydantic v2 `.model_dump()`.
  - *Monolithic Architecture:* Single file is over 5,300 lines long, combining route handlers, WebSocket managers, Telegram bot listeners, WhatsApp clients, and background pollers into a single file.
- **Maturity Score:** **8.0 / 10**.

---

### Subsystem 10: Frontend React/Vite Trading Workstation (`src/`)
- **Architectural Role:** Modern React 18 + Vite trading GUI workstation.
- **Key Capabilities:**
  - 17 dedicated views providing real-time visibility into bot states, consensus mesh, risk controls, and strategy builder.
  - Real-time WebSocket connection to `/chintu-feed` with audio/voice feedback.
  - Compiles cleanly in Vite (1,952 modules, 0 syntax/type errors).
- **Identified Gaps & Anti-Patterns:**
  - *Large Bundle Warning:* `dist/assets/index-D0v2Iq5U.js` is 911 kB (> 500 kB chunk threshold). Needs code-splitting with `React.lazy()` and `Suspense`.
  - *Client-Side Trade Gating:* `src/App.jsx` lines 298-319 contain frontend gating logic that ignores incoming WebSocket trade confirmations. The frontend should faithfully mirror the authoritative backend state rather than applying independent business rules.
- **Maturity Score:** **8.0 / 10**.

---

### Subsystem 11: Security, Credentials & Live Trading Readiness Gate (`server/live_readiness_gate.py`)
- **Architectural Role:** Ultimate safety barrier separating PAPER simulation from real broker order routing.
- **Key Capabilities:**
  - 8 mandatory pre-flight release conditions:
    1. `AUTHENTIC_BROKER_AUTH`
    2. `AUTHENTIC_MARKET_FEED`
    3. `RECONCILIATION_MATCH`
    4. `RMS_CIRCUIT_BREAKER_ARMED`
    5. `MAJORITY_VOTING_CONFIGURED`
    6. `SMART_MASTER_BOT_QUALIFIED`
    7. `HEALTHY_BOT_SUBSYSTEMS`
    8. `EXPLICIT_USER_CONSENT`
  - Hard fail-closed enforcement: `is_live_trading_eligible()` is strictly locked to `False`.
  - Sensitive credential sanitization preventing token leakage.
- **Identified Gaps & Anti-Patterns:**
  - Credentials in SQLite `system_config` table are stored in plaintext. Encrypting stored secrets at rest using AES-GCM would provide defense-in-depth.
- **Maturity Score:** **9.0 / 10**.

---

## 3. Gap Identification & Prioritization Matrix

The audit findings are synthesized into the following prioritized gap matrix:

| Gap ID | Subsystem | Description | Priority | Target Outcome |
|---|---|---|---|---|
| **GAP-01** | Execution Engine & DB | Multiple SQLite connection openings per trade without atomic transaction wrapping. | **P1 (High)** | Single atomic transaction context for order execution, trade recording, and position updates. |
| **GAP-02** | Bot Scheduler | Cold-start candle buffer starvation on mid-day server restart. | **P1 (High)** | Automatic historical candle backfill via Angel One REST API (`getCandleData`). |
| **GAP-03** | API & Fast-API Lifecycle | Deprecated `@app.on_event("startup"/"shutdown")` and Pydantic v1 `.dict()` calls. | **P2 (Medium)** | Upgrade to modern FastAPI `lifespan` handler and `model_dump()`, clearing all 10 warnings. |
| **GAP-04** | Master Brain | Consensus performance weighting uses lifetime trade counts rather than rolling window. | **P2 (Medium)** | Implement rolling 20-trade evaluation window for performance calibration multipliers. |
| **GAP-05** | Execution Engine | Static 3 bps slippage does not scale with market volatility. | **P2 (Medium)** | Volatility-aware slippage model scaling with ATR and trade size. |
| **GAP-06** | Frontend Workstation | Single 911 kB JavaScript bundle exceeds 500 kB chunk threshold. | **P2 (Medium)** | Apply React code-splitting (`React.lazy` / `Suspense`) across the 17 view components. |
| **GAP-07** | Database State Store | Lack of automated scheduled daily SQLite snapshotting. | **P2 (Medium)** | Scheduled background backup service utilizing SQLite online backup API (`conn.backup`). |
| **GAP-08** | API Server Architecture | Monolithic 5,300-line `python_stream_server.py`. | **P3 (Low)** | Modularize endpoints into dedicated FastAPI routers (`server/routers/`). |
| **GAP-09** | Security | Unencrypted broker credentials at rest in SQLite. | **P3 (Low)** | AES-GCM encryption for stored API tokens and secrets. |

---

## 4. Prioritized Step 8 Implementation Plan

### Target Outcome
Solidify Trading Jarvis as a production-grade, unshakeable, 24/7 autonomous paper-trading workstation with zero data leakage, clean FastAPI lifespans, atomic database transactions, automatic candle backfill, and an optimized modular architecture.

```
+---------------------------------------------------------------------------------------------------+
|                                  STEP 8 IMPLEMENTATION PHASES                                     |
+---------------------------------------------------------------------------------------------------+
|  Phase 8.1: API Lifespan Modernization & Pydantic V2 Clean-up (Zero Warnings, Modern Lifespan)   |
|  Phase 8.2: Execution Engine Atomic Transactions & Volatility-Aware Slippage                      |
|  Phase 8.3: Bot Scheduler Historical Backfill & Rolling Consensus Calibration                     |
|  Phase 8.4: Frontend Chunk Optimization, Server-Authoritative UI & Automated Snapshots           |
+---------------------------------------------------------------------------------------------------+
```

---

### Phase 8.1: API Lifespan Modernization & Deprecation Clean-up
- **Objective:** Eliminate all 10 deprecation warnings from pytest, modernizing FastAPI lifecycle handlers to `lifespan` context managers and migrating Pydantic v1 `.dict()` to `.model_dump()`.
- **Components Modified:**
  - `server/python_stream_server.py`
  - `tests/test_strategy_library.py`
  - `tests/test_voting_engine.py`
- **Technical Design:**
  1. Replace `@app.on_event("startup")` and `@app.on_event("shutdown")` with an `asynccontextmanager` lifespan handler:
     ```python
     @asynccontextmanager
     async def lifespan(app: FastAPI):
         # Startup logic: init DB, credentials, background tasks, BotScheduler
         yield
         # Shutdown logic: stop BotScheduler, flush buffers
     ```
  2. Replace all instances of `payload.dict()` with `payload.model_dump()` in API route handlers.
- **Acceptance Criteria:**
  - `pytest -q` completes with **0 failures and 0 deprecation warnings**.
  - All background workers and bot schedulers start and terminate cleanly via the lifespan context.
- **Rollback Plan:** Revert `python_stream_server.py` lifecycle definitions to previous event handlers.

---

### Phase 8.2: Execution Engine Atomic Transactions & Volatility-Aware Slippage
- **Objective:** Eliminate connection churn and ensure atomic database updates for every trade; replace static 3 bps slippage with volatility-scaled slippage.
- **Components Modified:**
  - `server/execution_engine.py`
  - `server/memory_db.py`
- **Technical Design:**
  1. Add an atomic execution transaction helper in `memory_db.py` using SQLite `BEGIN IMMEDIATE TRANSACTION`:
     ```python
     def record_executed_trade_atomic(order_record, trade_record, position_record, action_type):
         # Performs order update, trade logging, and position open/close within a single transaction
     ```
  2. Volatility-aware slippage formula:
     $$\text{Slippage} = \max\left(0.0002, \, \min\left(0.0025, \, \frac{0.1 \times \text{ATR}_{14}}{\text{Price}}\right)\right)$$
     Applies higher slippage during volatile market periods and tighter slippage during calm regimes.
  3. Hydrate in-memory order timestamps and client order IDs from SQLite `orders_memory` on startup.
- **Acceptance Criteria:**
  - An executed order atomically writes order, trade, and position records in a single database commit.
  - Paper trade execution reflects ATR-proportional slippage.
- **Rollback Plan:** Restore previous sequential `save_order` / `record_trade` / `save_position` calls in `execution_engine.py`.

---

### Phase 8.3: Bot Scheduler Historical Backfill & Rolling Consensus Calibration
- **Objective:** Eliminate the cold-start candle starvation on server reboot and refine Master Brain consensus weighting to use a rolling window of recent trades.
- **Components Modified:**
  - `server/bot_scheduler.py`
  - `server/angel_feed_manager.py`
  - `server/master_brain.py`
- **Technical Design:**
  1. Add `backfill_historical_candles(bot_id, days=5)` to `BotWorker`:
     - Calls Angel One REST `smart_api.getCandleData(...)` when credentials are authenticated.
     - In mock/paper mode without active broker, falls back to seeding from local synthetic or historical cache.
     - Ensures bots immediately reach `strategy_ready = True` on boot.
  2. Modify `MasterBrain._evaluate_consensus`:
     - Query the last 20 completed trades for each bot from `trade_memory`:
       ```sql
       SELECT is_positive, pnl FROM trade_memory WHERE bot = ? ORDER BY id DESC LIMIT 20
       ```
     - Calculate rolling win-rate and rolling net PnL over the last 20 trades for dynamic weighting (1.15x / 0.85x).
- **Acceptance Criteria:**
  - Bot scheduler workers achieve `strategy_ready` within 2 seconds of boot.
  - Master Brain consensus weights dynamically adapt to recent bot form rather than lifetime bias.
- **Rollback Plan:** Revert bot worker initialization and restore lifetime trade performance queries.

---

### Phase 8.4: Frontend Chunk Optimization, Server-Authoritative UI & Automated Snapshots
- **Objective:** Optimize frontend bundle size below 500 kB via React code-splitting, ensure 100% server-authoritative UI updates, and establish automated scheduled database snapshots.
- **Components Modified:**
  - `src/App.jsx`
  - `src/components/views/*`
  - `server/python_stream_server.py`
- **Technical Design:**
  1. Code-split all 17 view components in `src/App.jsx` using `React.lazy(() => import('./components/views/...'))` wrapped in a `<Suspense>` fallback.
  2. Remove client-side trade filtering in `src/App.jsx` lines 298-319; render all confirmed trades dispatched by the server directly.
  3. Implement background daily snapshot worker in `python_stream_server.py`:
     - Executes at 23:55 IST daily using SQLite `conn.backup()` to `backups/automated_daily/chintu_memory_YYYYMMDD.db`.
     - Retains the last 30 daily snapshots, pruning older backups.
- **Acceptance Criteria:**
  - `npm run build` generates main bundle chunk $< 350\text{ kB}$ (resolving Vite chunk warning).
  - UI accurately reflects all trades recorded in SQLite without client-side suppression.
  - Daily database snapshot verified with byte-for-byte integrity check.
- **Rollback Plan:** Restore static view imports in `App.jsx` and disable background snapshot worker.

---

## 5. Non-Goals & Explicit Out-of-Scope Items
The following items are explicitly **out of scope** for Step 8:
- ❌ **Live Trading Execution:** Live trading remains strictly locked (`LIVE_TRADING_ELIGIBLE = False`). Zero real broker order placements.
- ❌ **Database Reseeding or Schema Migrations:** No altering of production database tables, columns, or historical records.
- ❌ **New Strategy Inventions:** No creating speculative new trading bots beyond the canonical 14.
- ❌ **External Cloud Dependencies:** The system remains completely self-contained on local Windows localhost without third-party cloud database requirements.

---

## 6. Audit Certification & Next Steps

This audit certifies that the Trading Jarvis Workstation baseline is cryptographically verified, fully stable (631 passed tests, clean Vite build), and protected by fail-closed safety barriers.

Upon user authorization, implementation of Step 8 will proceed in strict accordance with the phased plan detailed above, starting with **Phase 8.1**.

