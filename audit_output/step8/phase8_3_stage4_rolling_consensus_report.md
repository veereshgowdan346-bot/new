# PHASE 8.3 STAGE 4 — ROLLING CONSENSUS CALIBRATION REPORT

**Author**: Senior Quantitative Trading Systems Engineer & Algorithmic Safety Architect  
**Date**: 2026-10-19  
**Status**: COMPLETE / VERIFIED / SIGNED-OFF  
**Environment**: PAPER TRADING ONLY (`LIVE_TRADING_ELIGIBLE = False`)  

---

## 1. Executive Summary & Verification Sign-Off

Phase 8.3 Stage 4 has successfully transitioned the fleet consensus mechanism in `server/master_brain.py` from lifetime trade-count performance metrics to an authoritative, deterministic rolling window of the most recent 20 eligible completed trades extracted directly from SQLite `trade_memory`.

### Invariant & Safety Attestations
1. **Paper-Only Invariant**: `LIVE_TRADING_ELIGIBLE` remains strictly `False` (`is_live_trading_eligible() -> False`).
2. **Zero Broker Side-Effects**: No live broker order placement, modification, or cancellation endpoints were invoked.
3. **Database Immutability**: Production SQLite database `server/chintu_memory.db` was accessed strictly in read-only mode for historical schema inspection and remains bit-for-bit identical to its pre-flight baseline:
   - **SHA-256**: `53509588F78CA463B91FCD3DB379E550CF3B901FA2C8510D3E1E541B86B4CB53`
   - **Byte Size**: `1,306,624 bytes`
   - **SQLite Integrity**: `('ok',)`
4. **Test Suite Isolation**: All 16 newly implemented Stage 4 unit and invariant tests execute against isolated temporary SQLite databases with automated teardown and zero persistent side effects.
5. **Regression Verification**:
   - Stage 4 Dedicated Suite: **16 passed in 3.83s** (0 failed, 0 skipped)
   - Phase 8 Full Regression Suites: **171 passed in 13.23s** (0 failed, 0 skipped)
   - Full Repository Test Suite: **736 passed in 42.27s** (0 failed, 0 skipped)

---

## 2. Core Architecture & Design Implementation

### 2.1 The Problem with Lifetime Trade Aggregates
Previously, `MasterBrain.evaluate_fleet_consensus()` queried `bot_performance_memory` via `get_bot_performance(bot_id)`. Because `bot_performance_memory` tracks cumulative lifetime metrics (often hundreds of historical trades dating back to offline calibration and early testing), it suffered from two key limitations:
1. **Regime Inertia**: Bots that had exceptional historical performance in earlier market regimes could maintain high performance multipliers (1.15) even if their last 20 trades during the current regime were consistently losing.
2. **Slow Recovery**: Bots that adapted successfully after an underperforming period were penalized by lifetime trade dilution.

### 2.2 Rolling 20-Trade Calibration Window Architecture
Stage 4 replaces cumulative lifetime calibration with a dynamic, deterministic rolling window:

```
[ trade_memory (SQLite) ]
         │
         ▼
[ Domain Filtering ] ─── Exclude RMS pre-order rejections, initial position entries, mock brokers, stress tests
         │
         ▼
[ Anti-Lookahead Gate ] ─── Filter trades where timestamp <= signal evaluation cutoff
         │
         ▼
[ Deterministic Sort ] ─── Sort DESC by (epoch, rowid, trade_id)
         │
         ▼
[ Trade Deduplication ] ─── Retain authoritative latest record for duplicate trade_ids
         │
         ▼
[ Window Capping ] ─── Slice latest 20 trades (configurable: rolling_window_size=20)
         │
         ▼
[ Performance Math ] ─── Total trades, wins (PnL > 0), losses (PnL < 0), breakevens (PnL == 0)
         │
         ▼
[ Multiplier Calibration ]
         ├── Total < 5 trades ──► Neutral Multiplier: 1.0 (Sample size gated)
         ├── Win Rate >= 60% & PnL > 0 ──► Multiplier: 1.15 (High performance boost)
         ├── Win Rate < 40% & PnL < 0 ──► Multiplier: 0.85 (Underperformance penalty)
         └── Otherwise ──► Neutral Multiplier: 1.0 (Neutral calibration)
         │
         ▼
[ MasterBrain Telemetry ] ─── Attach rolling_performance block to each contributing_bot
```

### 2.3 Mathematical Specifications

#### A. Trade Outcome Semantics
- **Win**: $\text{PnL} > 0.00$ ($\text{is\_positive} \in \{1, \text{True}\}$ and numeric value $> 0$).
- **Loss**: $\text{PnL} < 0.00$ ($\text{is\_positive} \in \{0, \text{False}\}$ and numeric value $< 0$).
- **Breakeven (Scratch Trade)**: $\text{PnL} == 0.00$.
- **Win Rate Calculation**:
  $$\text{win\_rate} = \frac{\text{winning\_trades}}{N}$$
  where $N = \text{total\_trades} \le 20$. Breakeven trades increment the denominator $N$ without incrementing the numerator, correctly penalizing capital lockup.

#### B. Calibration Thresholds
Let $N$ be the number of eligible trades in the rolling window ($N \le 20$):
- If $N < 5$:
  $$\text{perf\_multiplier} = 1.00 \quad \text{(Gated by insufficient sample size)}$$
- If $N \ge 5$:
  $$\text{perf\_multiplier} = \begin{cases} 
  1.15 & \text{if } \text{win\_rate} \ge 0.60 \text{ and } \text{rolling\_pnl} > 0.00 \\ 
  0.85 & \text{if } \text{win\_rate} < 0.40 \text{ and } \text{rolling\_pnl} < 0.00 \\ 
  1.00 & \text{otherwise} 
  \end{cases}$$

#### C. Effective Weight Formula
The calibrated multiplier is applied directly to each bot's normalized signal weight:
$$\text{eff\_weight} = \text{round}(\text{base\_weight} \times \text{regime\_factor} \times \text{perf\_multiplier} \times \text{risk\_penalty} \times \text{confidence}, 4)$$
where $\text{risk\_penalty} = \max(0.40, 1.0 - (\text{risk\_est} \times 0.60))$.

---

## 3. Implementation Details & File Modifications

### 3.1 `server/memory_db.py`
The following core functions were integrated into `server/memory_db.py`:

1. `parse_trade_timestamp_epoch(ts: Any) -> float`:
   - Robustly converts ISO datetimes, space-delimited datetimes, time-only strings (`HH:MM:SS.mmm`), datetime objects, and epoch timestamps into exact float epoch seconds. Tested against all 759 rows in production storage with 100% parse success.
2. `parse_trade_pnl(record: Dict[str, Any]) -> Tuple[float, str]`:
   - Cleans currency symbols (`₹`, `$`, `,`, `+`, minus variants `\u2212`, `\u2013`, `\u2014`).
   - Reconciles explicit `is_positive` flags with raw PnL numbers.
   - Categorizes outcomes deterministically into `"WIN"`, `"LOSS"`, or `"BREAKEVEN"`.
3. `is_trade_for_bot(record: Dict[str, Any], target_bot: Any) -> bool`:
   - Robustly matches bot records across integer IDs (`1`), string integers (`"1"`), canonical bot names (`"Scalper Bot"`), and prefixed formats (`"Bot 1: Scalper Bot"`).
4. `get_rolling_bot_trades(...) -> List[Dict[str, Any]]`:
   - Queries `trade_memory`.
   - Filters out domain non-trades: `PROVENANCE_RMS_REJECTION`, `PROVENANCE_INITIAL_ENTRY`, `PROVENANCE_MOCK_BROKER`, and `PROVENANCE_SYNTHETIC_STRESS_TEST`.
   - Enforces anti-lookahead: trades with `epoch > cutoff_epoch` are excluded.
   - Deterministically sorts by `(epoch DESC, id DESC, trade_id DESC)`.
   - Deduplicates identical `trade_id` records, keeping the latest authoritative record.
   - Caps the window at `window_size` (default: 20).
5. `get_rolling_bot_performance(...) -> Dict[str, Any]`:
   - Computes rolling metrics: `total_trades`, `winning_trades`, `losing_trades`, `breakeven_trades`, `win_rate`, `win_rate_pct`, `pnl`, `sample_size_sufficient`, `perf_multiplier`, and `trades`.
   - Implements backward-compatible fallback to `get_bot_performance(bot_id)` if 0 trades exist in `trade_memory`.

### 3.2 `server/master_brain.py`
1. Added configuration keys to `DEFAULT_MASTER_BRAIN_CONFIG`:
   ```python
   DEFAULT_ROLLING_WINDOW_SIZE = 20
   MIN_ROLLING_SAMPLE_SIZE = 5

   DEFAULT_MASTER_BRAIN_CONFIG = {
       ...
       "rolling_window_size": 20,
       "min_rolling_sample_size": 5,
       "scope_rolling_to_symbol": False
   }
   ```
2. Added `MasterBrain.get_rolling_bot_performance(self, bot_id, before_timestamp=None, symbol=None)`.
3. In `MasterBrain.evaluate_fleet_consensus`:
   - Replaced static `get_bot_performance` with `self.get_rolling_bot_performance(bot_id, before_timestamp=sig_ts, symbol=scope_sym)`.
   - Added `perf_multiplier` and structured `rolling_performance` telemetry to each entry in `contributing_bots`:
     ```json
     {
       "bot_id": 1,
       "bot_name": "Scalper Bot",
       "action": "BUY",
       "effective_weight": 0.9715,
       "perf_multiplier": 1.15,
       "rolling_performance": {
         "total_trades": 10,
         "winning_trades": 10,
         "losing_trades": 0,
         "breakeven_trades": 0,
         "win_rate": 1.0,
         "win_rate_pct": 100.0,
         "pnl": 5000.0,
         "sample_size_sufficient": true,
         "perf_multiplier": 1.15,
         "window_size": 20,
         "is_fallback": false
       }
     }
     ```

---

## 4. Test Suite Verification Matrix

The dedicated test suite `tests/test_phase8_3_stage4_rolling_consensus.py` implements 16 comprehensive invariant tests:

| Test Case Name | Objective / Invariant Asserted | Status |
| :--- | :--- | :---: |
| `test_window_size_capping_to_20_trades` | Verifies only latest 20 trades are selected when 30 eligible trades exist | **PASS** |
| `test_deterministic_tie_breaking_identical_timestamps` | Verifies identical timestamps order deterministically by rowid / trade_id DESC | **PASS** |
| `test_anti_lookahead_before_timestamp_cutoff` | Verifies cutoff timestamp excludes future trades from consensus | **PASS** |
| `test_win_loss_breakeven_pnl_classification` | Verifies PnL > 0 is win, PnL < 0 is loss, PnL == 0 is breakeven (denominator only) | **PASS** |
| `test_sample_size_gate_under_5_trades_stays_neutral` | Verifies <5 trades maintains neutral 1.0 multiplier regardless of win rate | **PASS** |
| `test_high_performance_multiplier_activation` | Verifies >=5 trades, win rate >=60%, PnL > 0 activates 1.15 multiplier | **PASS** |
| `test_underperformance_penalty_multiplier_activation` | Verifies >=5 trades, win rate <40%, PnL < 0 activates 0.85 multiplier | **PASS** |
| `test_neutral_calibration_mixed_or_breakeven` | Verifies 40%-60% win rate or contradictory PnL retains neutral 1.0 multiplier | **PASS** |
| `test_exclusion_of_rms_pre_order_rejections` | Verifies RMS blocked / capital exceeded records excluded from rolling window | **PASS** |
| `test_exclusion_of_initial_position_entries` | Verifies open entry orders (pnl == 0.00, BUY/SELL) excluded from rolling window | **PASS** |
| `test_deduplication_of_duplicate_trade_ids` | Verifies duplicate trade_id records deduplicated to authoritative latest record | **PASS** |
| `test_master_brain_fleet_consensus_integration_and_telemetry` | Verifies MasterBrain attaches rolling telemetry and scales effective weights | **PASS** |
| `test_bot_identifier_variants` | Verifies numeric, string, canonical name, and prefix string variants match bot | **PASS** |
| `test_symbol_scoped_filtering` | Verifies scoping to specific symbol filters correctly when requested | **PASS** |
| `test_backward_compatible_fallback` | Verifies fallback to bot_performance_memory when 0 trades exist in trade_memory | **PASS** |
| `test_custom_rolling_window_configuration` | Verifies custom rolling_window_size and min_rolling_sample_size honored | **PASS** |

---

## 5. System Regression Summary

```
========================================================================================
Test Execution Summary
========================================================================================
1. Stage 4 Dedicated Suite:
   pytest tests/test_phase8_3_stage4_rolling_consensus.py -v
   Result: 16 passed in 3.83s (0 failed, 0 skipped)

2. Phase 8 Full Milestone Regression:
   pytest tests/test_phase8*.py tests/test_idempotency_boundary_stability.py
   Result: 171 passed in 13.23s (0 failed, 0 skipped)

3. Full Repository Test Suite:
   pytest -q
   Result: 736 passed in 42.27s (0 failed, 0 skipped)
========================================================================================
```

---

## 6. Authoritative Production DB Verification

```
Algorithm       Hash                                                               Path
---------       ----                                                               ----
SHA256          53509588F78CA463B91FCD3DB379E550CF3B901FA2C8510D3E1E541B86B4CB53    server/chintu_memory.db
File Size:      1,306,624 bytes
Integrity:      PRAGMA integrity_check -> ('ok',)
Mode:           PAPER ONLY (LIVE_TRADING_ELIGIBLE = False)
```

---

## 7. Sign-Off & Phase 8.3 Completion

Phase 8.3 Stages 1 through 4 are now 100% complete and fully verified:
- **Stage 1**: Runtime Overfill Safety Hardening (Signed-off)
- **Stage 2**: Historical Candle Backfill Adapter (Signed-off)
- **Stage 3**: BotScheduler Backfill Integration (Signed-off)
- **Stage 3.1**: Idempotency Boundary Stability Fix (Signed-off)
- **Stage 4**: Rolling Consensus Calibration (Signed-off)

The codebase is clean, robust, deterministic, and fully compliant with all architectural safety boundaries.

