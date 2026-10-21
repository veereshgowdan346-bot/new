# CHINTU AI — PHASE 5 EXECUTION CALL-PATH & SAFETY ISOLATION AUDIT

**Audit Date:** 2026-10-18  
**Auditor:** Senior Trading Systems, Quantitative Accounting & Application Security Auditor  
**Workspace:** `C:\Users\veere\Desktop\new`  
**Execution Safety Mode:** Strictly `PAPER` (Broker Order Placement Physically Isolated)

---

## 1. Executive Summary

This independent execution-safety audit mapped and evaluated every possible code path from API endpoints, bot schedulers, and strategy modules down to broker execution. Specifically, every call site that can reach Angel One `SmartConnect.placeOrder` was audited.

### Core Audit Invariants:
1. **Zero Real Broker Orders:** No real broker order was placed or permitted during this audit.
2. **Physical Call-Path Isolation:** In `PAPER` mode, code execution branches strictly to simulated fills; broker `placeOrder` is unreachable.
3. **Fail-Closed Multi-Gate Defense:** Reaching live order execution requires passing 8 sequential gates across authentication, market feed freshness, portfolio reconciliation, risk management, and operator consent.
4. **Unknown Mode Rejection:** Any non-canonical execution mode (e.g. `None`, `""`, `"UNKNOWN"`, `"SIMULATED"`) is immediately rejected with `UNKNOWN_MODE_BLOCKED` or `ORDER_STATE_REJECTED`.

---

## 2. Comprehensive Call-Path Matrix to `SmartConnect.placeOrder`

There are exactly two physical call sites where `SmartConnect.placeOrder` exists in the server codebase:
1. `server/python_stream_server.py:1411` inside `place_live_angel_order()`
2. `server/execution_engine.py:516` inside `CentralizedExecutionEngine.execute_order()`

Below is the complete call-path table mapping every caller, entry point, preconditions, and fail-closed gates:

| # | Entry Point / Caller Module | Intermediary Function | Final Execution Call Site | Required Preconditions to Reach `placeOrder` | Safety Gates & Fail-Closed Guards |
|:---:|:---|:---|:---|:---|:---|
| **CP-01** | `POST /api/order/place` (`python_stream_server.py:3930`) | `place_live_angel_order()` (`python_stream_server.py:1165`) | `active_smart_connect["instance"].placeOrder(order_params)` (Line 1411) | 1. Valid Auth Header (`verify_request_auth`)<br>2. Valid Symbol & Qty (`qty > 0`)<br>3. `rms_state["circuit_breaker_active"] == False`<br>4. `execution_mode == "LIVE"`<br>5. Broker connected (`is_angel_live == True`)<br>6. Market feed verified authentic & fresh (<15s)<br>7. Reconciliation status `MATCHED` or `CLEAN`<br>8. Peer quorum consensus approved<br>9. Margin & Bot capital within limits | **BLOCKED IN PAPER MODE**.<br>If `execution_mode == "PAPER"`, branches at line 1408 to simulated paper fill at line 1498.<br>If `execution_mode` unknown, rejected with `UNKNOWN-MODE-BLOCKED`. |
| **CP-02** | Bot Scheduler / Strategy Engine (`server/strategy_engine.py`) | `CentralizedExecutionEngine.execute_order()` (`execution_engine.py:166`) | `smart_api.placeOrder(order_params)` (Line 516) | 1. `execution_mode == "LIVE"`<br>2. Valid spec & segment<br>3. Rate limit (<5 orders/sec)<br>4. Idempotent check (no duplicates)<br>5. RMS daily loss limit not breached<br>6. Bot max capital not exceeded<br>7. Max concurrent positions not reached<br>8. Active `smart_api` instance present | **BLOCKED IN PAPER MODE**.<br>Line 422: `if mode == "PAPER"` simulates fill with 0.03% slippage and returns `ORDER_STATE_FILLED`.<br>Line 500: `elif mode == "LIVE"` executes SmartConnect.<br>Line 556: `else` fails closed with `ORDER_STATE_REJECTED`. |
| **CP-03** | `POST /api/emergency/panic-exit` (`python_stream_server.py`) | `place_live_angel_order(is_emergency_exit=True)` | `active_smart_connect["instance"].placeOrder(order_params)` (Line 1411) | 1. Valid Auth Header<br>2. `execution_mode == "LIVE"`<br>3. Active broker session<br>4. Active authenticated connection | **BLOCKED IN PAPER MODE**.<br>In PAPER mode, executes simulated risk-reducing squareoff without calling broker. |
| **CP-04** | `POST /api/emergency/square-off` (`python_stream_server.py`) | `place_live_angel_order(is_emergency_exit=True)` | `active_smart_connect["instance"].placeOrder(order_params)` (Line 1411) | 1. Valid Auth Header<br>2. `execution_mode == "LIVE"`<br>3. Active broker session | **BLOCKED IN PAPER MODE**.<br>In PAPER mode, executes simulated squareoff. |
| **CP-05** | `POST /api/execution-mode` (`python_stream_server.py:2600`) | `evaluate_live_readiness()` (`live_readiness_gate.py:18`) | N/A (State Toggle Gate) | 1. Valid Auth Header<br>2. All 8 conditions must return `PASS`<br>3. Explicit `user_consent: True` | Fails closed if any condition fails (currently fails 6/8 conditions). `execution_mode` remains strictly `PAPER`. |

---

## 3. Detailed Gate Logic Analysis

```
                        [ INCOMING ORDER REQUEST ]
                                    |
                                    v
                        +-----------------------+
                        | 1. Request Auth Check |
                        +-----------------------+
                                    |
                         [Pass]     |      [Fail: 401 Unauthorized]
                                    v
                        +-----------------------+
                        | 2. Parameter Sanity   |
                        +-----------------------+
                                    |
                         [Pass]     |      [Fail: VALIDATION_FAILED]
                                    v
                        +-----------------------+
                        | 3. Execution Mode?    |
                        +-----------------------+
                           /        |        \
                          /         |         \
                    "PAPER"      "LIVE"     UNKNOWN
                      /             |             \
                     /              |              \
                    v               v               v
           +---------------+ +---------------+ +------------------------+
           | SIMULATED     | | 8-Point Gate  | | FAIL CLOSED:           |
           | PAPER FILL    | | Readiness     | | UNKNOWN_MODE_BLOCKED   |
           | 0.03% SLIPPAGE| +---------------+ +------------------------+
           +---------------+        |
                            [Pass]  |  [Fail: Blocked]
                                    v
                             +-------------+
                             | Broker Live |
                             | placeOrder  |
                             +-------------+
```

### 3.1 Server-Side Gate Inviolability
The frontend dashboard cannot independently authorize live execution.
1. The frontend toggle invokes `POST /api/execution-mode`.
2. Even if an attacker or malfunctioning frontend sends `{"mode": "LIVE", "user_consent": true}`, the server invokes `evaluate_live_readiness()`.
3. If any single condition (e.g. broker authentication, market feed freshness, position reconciliation, bot qualification) fails, the server rejects the request with HTTP error response and preserves `execution_mode = "PAPER"`.
4. Passing arbitrary payload parameters such as `{"mode": "LIVE"}` to `/api/order/place` cannot override the server-side `execution_mode` setting.

---

## 4. Automated Proofs & Test Evidence

All 12 automated isolation tests in [`tests/test_phase5_execution_safety_and_forensics.py`](file:///c:/Users/veere/Desktop/new/tests/test_phase5_execution_safety_and_forensics.py) passed cleanly:

- `test_paper_mode_cannot_reach_broker_place_order`: **PASSED** (Spy verified `mock_smart.placeOrder` was called 0 times)
- `test_execution_engine_paper_mode_never_calls_broker`: **PASSED** (Spy verified 0 broker invocations)
- `test_missing_or_invalid_consent_blocks_live`: **PASSED** (Condition 8 fails closed)
- `test_missing_credentials_and_unauthenticated_session_blocks_live`: **PASSED** (Condition 1 & 2 fail closed)
- `test_stale_ticks_and_disconnected_feed_blocks_live`: **PASSED** (Rejects order with `FEED_BLOCKED`)
- `test_failed_reconciliation_blocks_live`: **PASSED** (Rejects order with `RECONCILIATION_BLOCKED`)
- `test_unknown_execution_modes_fail_closed_stream_server`: **PASSED** (Rejects with `UNKNOWN_MODE_BLOCKED`)
- `test_unknown_execution_modes_fail_closed_execution_engine`: **PASSED** (Rejects with `ORDER_STATE_REJECTED`)
- `test_set_execution_mode_endpoint_rejects_unknown_mode`: **PASSED** (Rejects bad modes via REST API)
- `test_frontend_controls_cannot_bypass_server_gate`: **PASSED** (Rejects live toggle when readiness unmet)

**Audit Verdict:** `PAPER_EXECUTION_SAFETY: PASS`. Real broker order routing is physically isolated and fail-closed.

