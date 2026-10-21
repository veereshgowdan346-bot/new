# PHASE 8.3 STAGE 3.1 — IDEMPOTENCY BOUNDARY STABILITY REPORT

**Status**: COMPLETED & VERIFIED  
**Mode**: STRICT PAPER-ONLY (`LIVE_TRADING_ELIGIBLE = False`)  
**Scope**: Stage 3.1 Idempotency Boundary Stability Fix  
**Date**: October 19, 2026  

---

## 1. Executive Summary

During the Phase 8.3 Stage 3 audit, an intermittent boundary rollover failure was identified in `execution_engine.generate_idempotent_order_id()` and the related Step 6 idempotency test (`test_bot_scheduler_duplicate_order_idempotency_rejected`). 

Stage 3.1 has resolved this issue at its architectural root cause by replacing tumbling fixed-interval time bucketing with an authoritative sliding elapsed-time window, and by adding explicit client order ID passthrough in `BotWorker._execute_paper_order()`.

### Key Verification Metrics:
- **Dedicated Stability Tests**: 7 / 7 passed in 3.69s ([`tests/test_idempotency_boundary_stability.py`](file:///c:/Users/veere/Desktop/new/tests/test_idempotency_boundary_stability.py)).
- **Step 6 Coordination Tests**: 27 / 27 passed in 4.30s ([`tests/test_step6_bot_strategy_engine_master_brain.py`](file:///c:/Users/veere/Desktop/new/tests/test_step6_bot_strategy_engine_master_brain.py)).
- **Focused Phase 8 Suites**: 148 / 148 passed in 7.03s.
- **Full Test Suite**: **720 passed, 0 failed** in 37.61s across all 36 test files in the repository.
- **Production Database**: [`server/chintu_memory.db`](file:///c:/Users/veere/Desktop/new/server/chintu_memory.db) is bit-for-bit identical to baseline (`53509588F78CA463B91FCD3DB379E550CF3B901FA2C8510D3E1E541B86B4CB53`, size `1,306,624 bytes`, integrity `ok`).
- **Live Trading Safety**: `is_live_trading_eligible()` remains `False`; zero real broker endpoints called.
- **Scope Boundary**: [`server/master_brain.py`](file:///c:/Users/veere/Desktop/new/server/master_brain.py) is untouched; Stage 4 remains unstarted.

---

## 2. Root Cause Analysis

### A. The Tumbling Window Flaw
Prior to this fix, [`execution_engine.generate_idempotent_order_id()`](file:///c:/Users/veere/Desktop/new/server/execution_engine.py#L484-L493) computed client order IDs using integer division:
```python
time_bucket = int(time.time() / 5.0)  # 5-second idempotency window
raw_key = f"{bot_id}_{symbol}_{action}_{price:.2f}_{time_bucket}"
hash_digest = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()[:12]
return f"ORD-{bot_id}-{hash_digest}"
```

This tumbling-window implementation suffered from a fundamental boundary flaw:
1. If Call 1 occurred at wall-clock time $t = 4.999\text{s}$, `time_bucket` was $0$.
2. If Call 2 (an immediate network retry or test replay 2 milliseconds later) occurred at $t = 5.001\text{s}$, `time_bucket` rolled over to $1$.
3. As a result, Call 2 received a distinct `client_order_id`.
4. Gate 0 looked up the new `client_order_id` in `recent_client_order_ids`, found no entry, and allowed Call 2 to pass Gate 0.
5. Downstream Gate 5 / RMS then blocked the duplicate with `Duplicate position conflict: LONG position already active for RELIANCE`.
6. While downstream RMS safely prevented duplicate order fills in production, the failure was misattributed to RMS rather than Gate 0, and unit tests expecting Gate 0 `"Duplicate order detected"` intermittently failed whenever executions crossed a 5.0-second boundary.

### B. Intended Contract vs Implementation Detail
- **Intended Contract**: `CentralizedExecutionEngine` defines a sliding window (`self.idempotency_window_seconds = 10.0`), asserting that any identical order intent within 10 seconds must be deduplicated by Gate 0.
- **Implementation Detail**: The `int(time.time() / 5.0)` was a heuristic intended to make client order IDs deterministic within 5 seconds, but it inadvertently shortened the protection window to 1ms at bucket edges.
- **Legitimate Orders**: Legitimate repeated orders from bot strategies occur on closed candle boundaries ($t \ge 60\text{s} \gg 10\text{s}$) or have differing symbols, actions, or prices. They are never confused with rapid duplicates.

---

## 3. Exact Code Changes

### 1. `server/execution_engine.py`
- Added thread-safe sliding-window generation cache `_recent_generated_cids: Dict[Tuple[int, str, str, str], Tuple[str, float]]` guarded by `_idempotency_lock`.
- Added `clear_idempotency_cache()` to safely reset in-memory caches between test fixtures or on system reinitialization.
- Replaced tumbling `int(time.time() / 5.0)` in `generate_idempotent_order_id()`:
  - Accepts optional `timestamp: Optional[Union[float, int, str]] = None` for deterministic test control.
  - Normalizes parameters: `(int(bot_id), str(symbol).upper().strip(), str(action).upper().strip(), f"{float(price):.2f}")`.
  - Prunes expired cache records older than `idempotency_window_seconds`.
  - If a matching order was generated within `idempotency_window_seconds`, returns the active `client_order_id`.
  - If new or expired, generates a fresh `client_order_id` and records the generation timestamp.

```python
    def generate_idempotent_order_id(
        self,
        bot_id: int,
        symbol: str,
        action: str,
        price: float,
        timestamp: Optional[Union[float, int, str]] = None
    ) -> str:
        now = time.time() if timestamp is None else (
            float(timestamp) if isinstance(timestamp, (int, float)) else (
                datetime.fromisoformat(str(timestamp).replace("Z", "+00:00")).timestamp()
            )
        )
        clean_sym = str(symbol or "").upper().strip()
        act_upper = str(action or "").upper().strip()
        price_val = float(price or 0.0)
        key = (int(bot_id), clean_sym, act_upper, f"{price_val:.2f}")

        lock = getattr(self, "_idempotency_lock", None)
        if lock is None:
            self._idempotency_lock = threading.Lock()
            lock = self._idempotency_lock

        with lock:
            if not hasattr(self, "_recent_generated_cids"):
                self._recent_generated_cids = {}

            # Prune expired entries to prevent unbounded memory growth
            expired = [k for k, (_, t_g) in self._recent_generated_cids.items() if (now - t_g) >= self.idempotency_window_seconds or (now - t_g) < 0]
            for k in expired:
                del self._recent_generated_cids[k]

            if key in self._recent_generated_cids:
                existing_cid, last_gen_time = self._recent_generated_cids[key]
                if 0.0 <= (now - last_gen_time) < self.idempotency_window_seconds:
                    return existing_cid

            raw_key = f"{key[0]}_{key[1]}_{key[2]}_{key[3]}_{now:.3f}"
            hash_digest = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()[:12]
            new_cid = f"ORD-{bot_id}-{hash_digest}"
            self._recent_generated_cids[key] = (new_cid, now)
            return new_cid
```

### 2. `server/bot_scheduler.py`
In `BotWorker._execute_paper_order()`, enabled explicit client order ID passthrough from signal payloads:
```python
cid = signal.get("client_order_id") or signal.get("clientOrderId") or execution_engine.generate_idempotent_order_id(self.bot_id, asset, action, entry_price)
```

### 3. `tests/test_step6_bot_strategy_engine_master_brain.py`
In `BaseStep6TestCase.setUp()`, replaced separate dictionary clears with `execution_engine.clear_idempotency_cache()`, ensuring full isolation between tests.

### 4. `tests/test_idempotency_boundary_stability.py`
Created 7 new dedicated tests to prove stability and determinism:
1. `test_sliding_window_across_5s_boundaries`: Confirms identical CID across $t = 4.99\text{s}$, $5.01\text{s}$, $9.99\text{s}$, $10.01\text{s}$.
2. `test_window_expiration_generates_new_cid`: Confirms distinct CID after 10.5s.
3. `test_parameter_sensitivity`: Confirms unique CIDs for differing bot, symbol, action, or price.
4. `test_concurrent_order_id_generation`: Confirms multi-threaded thread safety.
5. `test_bot_scheduler_duplicate_order_deterministic_rejection`: Repeats duplicate order submission across 20 iterations; asserts 100% of second calls are caught by Gate 0 without tripping position conflicts.
6. `test_explicit_client_order_id_in_signal_payload`: Confirms caller-supplied client order IDs are honored.
7. `test_safety_mandates_and_db_immutability`: Confirms database hash and size immutability.

---

## 4. Test Execution & Verification Results

All tests were directly executed during this session:

| Test Suite / Command | Total Items | Passed | Failed | Duration | Result |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `pytest tests/test_idempotency_boundary_stability.py -v` | 7 | 7 | 0 | 3.69s | **PASS** |
| `pytest tests/test_step6_bot_strategy_engine_master_brain.py -v` | 27 | 27 | 0 | 4.30s | **PASS** |
| `pytest tests/test_phase8_3_stage1* tests/test_phase8_3_stage2* tests/test_phase8_3_stage3* tests/test_execution_engine.py -q` | 48 | 48 | 0 | 3.27s | **PASS** |
| `pytest (Get-ChildItem tests/test_phase8*.py) -q` | 148 | 148 | 0 | 7.03s | **PASS** |
| `pytest -q` (Full Repository Test Suite) | **720** | **720** | **0** | **37.61s** | **PASS** |

---

## 5. Production Database & Live Trading Safety

| Audit Item | Baseline Requirement | Verified State | Status |
| :--- | :--- | :--- | :---: |
| **Database SHA-256** | `53509588F78CA463B91FCD3DB379E550CF3B901FA2C8510D3E1E541B86B4CB53` | `53509588F78CA463B91FCD3DB379E550CF3B901FA2C8510D3E1E541B86B4CB53` | **PASS** |
| **Database Size** | `1,306,624 bytes` | `1,306,624 bytes` | **PASS** |
| **SQLite Integrity** | `PRAGMA integrity_check == ok` | `ok` (read-only URI mode) | **PASS** |
| **Live Trading Gate** | `is_live_trading_eligible() == False` | `False` | **PASS** |
| **Broker Order Placement** | Zero live broker endpoints called | 0 calls made | **PASS** |
| **Stage 4 Scope Guard** | `server/master_brain.py` untouched | `git diff` empty (0 diffs) | **PASS** |

---

## 6. Conclusion & Recommendation

The 5-second tumbling window boundary rollover issue has been eliminated. Client order ID generation is deterministic, thread-safe, and sliding-window accurate. All 720 tests across the codebase pass cleanly without flakiness or sleeps.

Stage 3 and Stage 3.1 are fully verified and complete. The system is ready for **Phase 8.3 Stage 4 (Rolling Consensus Calibration & MasterBrain Integration)** upon user authorization.

