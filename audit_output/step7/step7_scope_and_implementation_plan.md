# TRADING JARVIS WORKSTATION — STEP 7
## MILESTONE SCOPE DEFINITION, ARCHITECTURAL GAP ANALYSIS & IMPLEMENTATION PLAN

**Document Version:** 1.0.0-STEP7-PLAN  
**Date:** 2026-10-19  
**Author:** Senior Quantitative Trading Risk Engineer, Execution Reliability Architect & Platform Auditor  
**Operating System:** Windows 11 Build 26300 (AMD64)  
**Execution Mode:** `PAPER` (Strictly Enforced) | `LIVE_TRADING_ELIGIBLE: BLOCKED`  
**Production Database Status:** `server/chintu_memory.db` (1,306,624 bytes, SHA-256 `53509588F78CA463B91FCD3DB379E550CF3B901FA2C8510D3E1E541B86B4CB53`, Unchanged Baseline)  
**Baseline Test Suite Status:** **613 passed, 0 failed, 10 warnings in 28.13s** (0 Regressions across entire platform)  
**Frontend Production Build:** Vite build succeeded in 1.93s (1,952 modules transformed, zero errors)  
**Plan Status:** **PLANNING ONLY — IMPLEMENTATION NOT STARTED (AWAITING USER AUTHORIZATION)**  

---

## 1. EVIDENCE FOR DOCUMENTED NEXT MILESTONE & SCOPE DISAMBIGUATION

A thorough forensic search across the repository documentation reveals two distinct documented references to "Step 7":

### 1.1 Documented Milestone Definitions

```
+----------------------------------------------------------------------------------------------------------------------+
| SOURCE DOCUMENT                          | SECTION / LINE  | DOCUMENTED SCOPE TITLE & DESCRIPTION                    |
+------------------------------------------+-----------------+---------------------------------------------------------+
| audit_output/step5/                      | Line 320        | "WebSocket Feed Resilience & Order Event Stream (Step 7)"|
| step5_order_lifecycle_execution_         | Section 8       | - Live broker order event webhooks and socket streaming |
| reconciliation_report.md                 |                 | - Real-time order lifecycle state transition broadcasts |
|                                          |                 | - Real-time client synchronization without UI polling   |
+------------------------------------------+-----------------+---------------------------------------------------------+
| audit_output/step1/                      | Line 230        | "[ Step 7: End-to-End Stress Testing & Performance      |
| master_audit_and_baseline.md             | Section F       |   Benchmark ]"                                          |
|                                          |                 | - Run full regression suite under concurrent simulated  |
|                                          |                 |   market load                                           |
|                                          |                 | - Validate <50ms audio chime latency and <800ms AI      |
|                                          |                 |   response latency                                      |
+------------------------------------------+-----------------+---------------------------------------------------------+
```

### 1.2 Architectural Evolution & Natural Synthesis
Throughout Steps 2 through 6.1, the Trading Jarvis workstation prioritized execution reliability, single-gateway risk controls, broker reconciliation, and multi-bot consensus coordination over speculative or external features. 

Examining the actual runtime state of the workstation demonstrates that **Definition A (WebSocket Feed Resilience & Order Event Stream)** and **Definition B (Stress Testing & Performance Benchmark)** are complementary halves of the same operational domain: **Real-Time Streaming Reliability, Event Synchronization & Concurrency Hardening**.

Neither definition introduces speculative trading logic or live broker risks. Together, they resolve the final major operational reliability gaps between the Python backend engine and the React frontend before any release evaluation.

---

## 2. CURRENT ARCHITECTURE & VERIFIED GAPS

### 2.1 Current System State
- **Single-Gateway Execution (Step 5, 6, 6.1):** All 14 bot workers in `BotScheduler` and `MasterBrain` route orders exclusively through `CentralizedExecutionEngine.execute_order(...)`.
- **Pre-Trade Gate Enforcement:** All 7 gates (idempotency, market hours, parameter validation, feed freshness, circuit breakers, quarantine, and exposure limits) are enforced.
- **Terminal State Persistence:** Pre-trade rejections and paper fills are saved directly to `orders_memory`, `positions_memory`, and `trade_memory` in SQLite.
- **Regression Foundation:** 613 tests pass cleanly in 28.13s with zero failures.

### 2.2 Verified Architectural Gaps

```
 +-----------------------------------------------------------------------------------------------------+
 |                                         VERIFIED GAPS IN WORKSTATION                                |
 +-----------------------------------------------------------------------------------------------------+
 |                                                                                                     |
 |  [GAP 1: Position Book Split-Brain]                                                                 |
 |  python_stream_server.py maintains an in-memory dictionary `active_positions`.                      |
 |  It is populated from SQLite `positions_memory` on server startup.                                   |
 |  HOWEVER, when `CentralizedExecutionEngine` fills or closes positions during autonomous bot runtime, |
 |  it updates SQLite `positions_memory`, but DOES NOT update `active_positions` in stream server.     |
 |  --> Impact: /api/positions and WebSocket POSITIONS_UPDATE broadcast stale data to the UI.          |
 |                                                                                                     |
 |  [GAP 2: Missing Real-Time Order Lifecycle Event Broadcast]                                         |
 |  When `CentralizedExecutionEngine` transitions order state (CREATED -> SUBMITTED -> PENDING ->      |
 |  FILLED / REJECTED), no WebSocket event is emitted to connected frontend clients.                   |
 |  --> Impact: UI Live Trading terminal never receives instantaneous fill/reject events for bots;     |
 |      UI only learns of changes via periodic polling.                                                |
 |                                                                                                     |
 |  [GAP 3: WebSocket Feed Disconnection & Reconnection Resilience]                                    |
 |  `SmartWebSocketV2` in `server/angel_feed_manager.py` handles authentic ticks, but lacks a formal    |
 |  automated test verifying state recovery, exponential reconnect backoff, and subscription           |
 |  re-establishment when the network connection drops mid-session.                                    |
 |  --> Impact: Risk of unrecovered feed state or silent stale-tick accumulation on dropouts.          |
 |                                                                                                     |
 |  [GAP 4: Concurrency & High-Throughput Burst Stress Validation]                                     |
 |  The platform has not been benchmarked under high burst loads (e.g., 50-100 ticks/second fanning out |
 |  to all 14 bot workers simultaneously while orders are being placed and reconciled).               |
 |  --> Impact: Unverified race conditions in shared CandleBuffer locks or SQLite write serialization.  |
 |                                                                                                     |
 +-----------------------------------------------------------------------------------------------------+
```

---

## 3. PROPOSED STEP 7 OBJECTIVES & ACCEPTANCE CRITERIA

### 3.1 Core Objectives

1. **Unify Position State & Eliminate Split-Brain:**
   - Establish `memory_db.get_open_positions()` as the authoritative single source of truth for all position queries.
   - Synchronize `python_stream_server.py:active_positions` in real-time upon every fill and square-off executed by `CentralizedExecutionEngine`.
2. **Authoritative Order Lifecycle WebSocket Streaming:**
   - Implement real-time WebSocket event emission (`ORDER_STATUS_UPDATE` and `TRADE_CONFIRMATION`) directly from `CentralizedExecutionEngine` state transitions.
   - Ensure the React UI receives immediate notification of autonomous bot order placement, fill, and pre-trade risk rejections.
3. **Feed Resilience & Connection Recovery Hardening:**
   - Audit and harden `SmartWebSocketV2` reconnection handling in `angel_feed_manager.py`: exponential backoff (1s, 2s, 4s, 8s, max 30s), automatic resubscription to active tokens, and fail-closed state tagging during disconnects.
4. **End-to-End Multi-Bot Concurrency & Latency Stress Testing:**
   - Execute deterministic stress tests simulating 100 ticks/sec across all 14 bots.
   - Measure and enforce latency bounds: tick-to-signal $< 10\text{ms}$, signal-to-order $< 15\text{ms}$, order-to-fill $< 20\text{ms}$.
   - Prove zero deadlocks, zero SQLite `database is locked` concurrency errors, and bounded memory consumption.

### 3.2 Measurable Acceptance Criteria

| ID | Criterion | Verification Target |
| :---: | :--- | :--- |
| **AC-7.1** | **Zero Split-Brain in Positions** | Opening or closing a position via `CentralizedExecutionEngine` immediately reflects in `GET /api/positions` and the next WebSocket `POSITIONS_UPDATE` with identical position IDs and quantities. |
| **AC-7.2** | **Real-Time Order State Streaming** | Every order fill, partial fill, cancellation, and gate rejection in `CentralizedExecutionEngine` emits an `ORDER_STATUS_UPDATE` payload to connected WebSocket clients within $< 50\text{ms}$. |
| **AC-7.3** | **Trade Confirmation Broadcast** | Bot paper fills trigger `TRADE_CONFIRMATION` events matching the schema expected by `src/App.jsx` (bot name, symbol, action, price, qty, net PnL, charges). |
| **AC-7.4** | **Reconnection Resilience** | Simulating WebSocket network disconnect causes the feed manager to enter `RECONNECTING`, trigger exponential backoff, resubscribe tokens upon reconnect, and restore `AUTHENTIC` status without manual intervention. |
| **AC-7.5** | **Burst Concurrency Under Load** | Ingesting 500 burst ticks across 14 bots simultaneously produces 0 unhandled exceptions, 0 SQLite lock errors, and completes with 100% thread safety. |
| **AC-7.6** | **Latency Threshold Compliance** | Median end-to-end pipeline latency remains $< 25\text{ms}$, and P99 latency remains $< 100\text{ms}$ under load. |
| **AC-7.7** | **Zero Database Drift** | `server/chintu_memory.db` SHA-256 hash remains bit-for-bit identical to baseline (`53509588F78CA463B91FCD3DB379E550CF3B901FA2C8510D3E1E541B86B4CB53`). |
| **AC-7.8** | **Zero Regressions** | 100% of existing 613 regression tests pass with 0 failures. |

---

## 4. FILES & MODULES LIKELY TO BE AFFECTED

```
+---------------------------------------+-------------------------------------------------------------+
| FILE PATH                             | PROPOSED NATURE OF MODIFICATION                             |
+---------------------------------------+-------------------------------------------------------------+
| server/execution_engine.py            | Add order event callback/listener hook to dispatch          |
|                                       | ORDER_STATUS_UPDATE and TRADE_CONFIRMATION upon fill/reject.|
| server/python_stream_server.py        | Wire execution engine event callback to connected_websockets|
|                                       | Broadcast real-time position updates from authoritative DB. |
| server/angel_feed_manager.py          | Harden reconnect backoff, resubscription recovery, and feed |
|                                       | state broadcast upon disconnection.                         |
| server/low_latency_event_pipeline.py  | Integrate latency profiling into burst stress testing.      |
| tests/test_step7_feed_resilience_and_ | New dedicated test suite verifying WebSocket streaming,     |
|   stress.py                           | position sync, reconnection resilience, and concurrency.    |
+---------------------------------------+-------------------------------------------------------------+
```

---

## 5. REQUIRED TESTS, FAILURE SCENARIOS & ROLLBACK STRATEGY

### 5.1 Required Test Cases (Dedicated Step 7 Suite)
1. `test_execution_engine_broadcasts_order_fill_event`: Verifies WebSocket subscribers receive `ORDER_STATUS_UPDATE` and `TRADE_CONFIRMATION` on paper order fill.
2. `test_execution_engine_broadcasts_order_rejection_event`: Verifies pre-trade gate rejections emit `ORDER_STATUS_UPDATE` with status `REJECTED` and specific rejection reason.
3. `test_position_synchronization_single_source_of_truth`: Verifies opening/closing positions via execution engine immediately updates `GET /api/positions` and `active_positions`.
4. `test_websocket_feed_reconnection_backoff_and_resubscription`: Simulates broker WebSocket transport disconnect, asserts exponential backoff intervals, and verifies successful token resubscription.
5. `test_concurrent_multi_bot_burst_tick_load`: Ingests 500 burst ticks across 14 bots concurrently using thread pool; verifies thread safety, zero SQLite locking exceptions, and valid candle formation.
6. `test_pipeline_latency_benchmarks_under_load`: Validates median and P99 latency percentiles against `StageLatencyTracker`.
7. `test_client_disconnect_handling`: Verifies dropped WebSocket clients are cleaned from `connected_websockets` without memory leaks or broadcast crashes.
8. `test_paper_mode_broker_isolation_under_stress`: Proves `SmartConnect.placeOrder` is never invoked even under heavy concurrent load.
9. `test_production_db_immutability`: Asserts bit-for-bit preservation of `server/chintu_memory.db` SHA-256 hash.

### 5.2 Failure Scenarios & Mitigations
- **Scenario A: Client Disconnect During Broadcast:** A client closes the socket while an order event is being emitted.  
  *Mitigation:* Catch `WebSocketDisconnect` and general socket exceptions; remove dead socket gracefully without halting broadcast to other clients.
- **Scenario B: SQLite Concurrency Under Multi-Bot Burst:** Multiple bot workers attempt simultaneous writes to SQLite during high volatility.  
  *Mitigation:* SQLite write operations are already serialized within `CentralizedExecutionEngine` lock, and tests run against isolated in-memory or temporary databases with WAL mode enabled.
- **Scenario C: Memory Leak from Unbounded Latency Buffers:** Prolonged streaming accumulates unbounded tick timestamps.  
  *Mitigation:* Ring buffers in `StageLatencyTracker` and `LatencyTelemetryEngine` are strictly capped (max 500-1000 samples).

### 5.3 Rollback Strategy
- All test fixtures use `BaseStep7TestCase` with isolated temporary copies of SQLite (`tempfile.mkdtemp`), guaranteeing zero touches to `server/chintu_memory.db`.
- Modifications to `server/execution_engine.py` and `server/python_stream_server.py` are strictly additive (event callbacks and synchronization hooks) and can be rolled back via Git checkout with zero database migrations or structural disruptions.

---

## 6. DATABASE AND BROKER SAFETY BOUNDARIES

1. **Production Database Boundary:**
   - `server/chintu_memory.db` must remain completely read-only.
   - SHA-256 checksum `53509588F78CA463B91FCD3DB379E550CF3B901FA2C8510D3E1E541B86B4CB53` and file size `1,306,624` bytes must be checked before and after all test runs.
   - All stress testing and mock trading must occur on temporary, isolated SQLite instances.
2. **Broker Safety Boundary:**
   - Execution mode must remain strictly `PAPER`.
   - `LIVE_TRADING_ELIGIBLE` must remain strictly blocked (`False`).
   - Mocks and spies must guard `SmartConnect.placeOrder`, `cancelOrder`, `modifyOrder`. Real broker order endpoints must never be called.

---

## 7. DEPENDENCIES, UNCERTAINTIES & UNRESOLVED RISKS

1. **Broker Off-Market WebSocket Availability:** Real SmartAPI WebSocket feeds are only active during market hours (09:15–15:30 IST). Testing outside market hours requires deterministic mock socket servers or tick replay feeds.
2. **Windows Proactor Event Loop Characteristics:** On Windows 11, `asyncio` uses the `ProactorEventLoop`. WebSocket concurrency tests must ensure proper thread-safe event loop scheduling when invoking async broadcast methods from synchronous worker threads (`asyncio.run_coroutine_threadsafe`).

---

## 8. FORMAL RECOMMENDATION & USER DECISION GATE

### Options Available to the User

| Option | Milestone Scope Description | Recommendation |
| :---: | :--- | :---: |
| **Option A (Recommended)** | **WebSocket Feed Resilience, Order Event Streaming & Concurrency Stress Testing:**<br>Harden the real-time order lifecycle broadcast, eliminate position book split-brain, audit feed reconnect recovery, and validate 14-bot concurrent burst load. | **READY FOR IMPLEMENTATION** (Natural continuation of Step 5 & 6) |
| **Option B** | **End-to-End Stress Testing & Performance Benchmark Only:**<br>Focus exclusively on load testing, latency benchmarking, and process priority without modifying WebSocket order event streams. | **READY FOR IMPLEMENTATION** |
| **Option C** | **Alternative User Scope:**<br>User specifies an alternative or customized scope for Step 7. | **BLOCKED PENDING USER INSTRUCTION** |

**Recommendation:** **Option A is strongly recommended.** It directly resolves the verified runtime split-brain between the engine and the UI, establishes real-time order lifecycle observability, and certifies system stability under high-concurrency burst loads, fulfilling the core objectives of both documented Step 7 definitions.

> [!IMPORTANT]
> **Implementation Status: STOPPED.**  
> Per instructions, no code or test changes have been made for Step 7. Awaiting your explicit authorization and selection of Step 7 scope before proceeding.

