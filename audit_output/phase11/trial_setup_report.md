# CHINTU AI — PHASE 11 SAFE PAPER-TRADING TRIAL SETUP REPORT
**Audit Date:** 2026-10-18  
**Audit Protocol:** Safe Paper-Trading Trial Preparation & Operational Control Verification  
**Trial Data Store:** `server/data/paper_trial_store.db` (Completely Isolated)  
**Production Database:** `server/chintu_memory.db` (100% Preserved & Untouched)  
**Execution Mode:** STRICT PAPER MODE ONLY (`LIVE_TRADING_ELIGIBLE: BLOCKED`)  
**Status:** TRIAL PIPELINE SETUP READY | FEED DISCONNECTED (WAITING FOR OPERATOR CONFIG)

---

## 1. Executive Summary

Phase 11 prepared the Chintu AI trading system for a controlled, authentic-feed paper trading trial without altering production data or enabling live broker execution.

### Key Setup Deliverables Completed:
1. **Isolated Trial Data Store:** Implemented `server/paper_trial_manager.py` with an isolated SQLite database (`server/data/paper_trial_store.db`), ensuring production trade history and positions remain 100% untouched.
2. **Crash & Restart Resilience:** If the server reboots during an active trial session, the interrupted session is cleanly transitioned to `ABORTED_ON_RESTART`. No continuous run-time or ticks are ever fabricated across restarts.
3. **Angel One Connection Protocol:** Verified WebSocket lifecycle, official Little-Endian binary packet decoding (`SmartWebSocketV2`), SEBI exchange mapping, bounded exponential backoff (2s to 32s), and strict tick freshness validation (rejecting future ticks $> 5\text{s}$ and stale ticks $> 15\text{s}$).
4. **Authentic Feed Status (Truth-In-Auditing):** The current feed status is officially reported as **`DISCONNECTED`**. Credentials (`ANGEL_API_KEY`, `ANGEL_CLIENT_ID`, `ANGEL_PIN`, `ANGEL_TOTP_SECRET`) are not present in the test sandbox environment. In accordance with strict rules, the feed is **never** reported as connected until an actual authenticated session is established and genuine incoming ticks are observed.
5. **Operational Safety Invariants:** `execution_mode` is locked to `PAPER`. Real broker order dispatch (`SmartConnect.placeOrder`) is disabled and unreachable. Emergency stop functions as an immediate kill switch, blocking new entries while permitting risk-reducing exits.
6. **Trial Progress Baseline:** Active completed eligible trial days stand at **`0 / 14 Days`**. Release gates remain strictly **`BLOCKED`**.

---

## 2. Angel One Connection & Feed Lifecycle Audit

```
[ Operator Configures .env ]
              |
              v
[ AngelOneWebSocketManager.initialize_from_env() ]
              |
              +---> If Credentials Missing:
              |     Report "MISSING_CREDENTIALS" -> Fail Closed -> Status = DISCONNECTED
              |
              +---> If Credentials Present:
                    Generate TOTP -> Authenticate SmartAPI -> Fetch JWT & Feed Token
                                  |
                                  v
                    [ SmartWebSocketV2 Connection to smartapisocket.angelone.in ]
                                  |
                                  +---> Little-Endian Binary Packet Arrival
                                  |     - LTP Mode (43 bytes)
                                  |     - Quote Mode (123 bytes)
                                  |     - Snap Quote Mode (379 bytes)
                                  |
                                  v
                    [ Freshness & Numeric Bounds Gate ]
                    - If age > 15.0s: Flag STALE_TICK -> Reject
                    - If timestamp > now + 5.0s: Flag FUTURE_TIMESTAMP -> Reject
                    - If price <= 0 or NaN: Reject
                    - If valid: Mark is_authentic=True -> Ingest to BotScheduler
```

### Connection Prerequisite Diagnostic Matrix

| Prerequisite | Environment Variable | Current Presence | Actionable Remediation if Missing |
| :--- | :--- | :---: | :--- |
| **API Key** | `ANGEL_API_KEY` | NOT CONFIGURED | Generate SmartAPI App Key from `smartapi.angelbroking.com` |
| **Client ID** | `ANGEL_CLIENT_ID` | NOT CONFIGURED | Provide Angel One trading account client code (e.g. `V123456`) |
| **Account PIN** | `ANGEL_PIN` | NOT CONFIGURED | Set 4-digit Angel One trading MPIN |
| **TOTP Secret** | `ANGEL_TOTP_SECRET` | NOT CONFIGURED | Enable 2FA in Angel One Security Settings & copy 32-character base32 secret |

---

## 3. Isolated Paper-Trading Trial Architecture

To ensure zero risk of production database corruption or accidental historical record alteration, all paper-trial telemetry is routed to a physically isolated database:

### Data Segregation Invariants

| Attribute | Production Store (`server/chintu_memory.db`) | Isolated Trial Store (`server/data/paper_trial_store.db`) |
| :--- | :--- | :--- |
| **File Path** | `c:\Users\veere\Desktop\new\server\chintu_memory.db` | `c:\Users\veere\Desktop\new\server\data\paper_trial_store.db` |
| **Role** | Historical production database (759 trades, 19 positions) | Dedicated 14-day authentic paper-trading trial repository |
| **Mutation Policy** | **STRICTLY READ-ONLY (ZERO MUTATIONS)** | Read/Write for active paper trial sessions |
| **Tables Maintained** | `trade_memory`, `positions_memory`, `orders_memory`, etc. | `trial_sessions`, `trial_orders`, `trial_trades` |
| **Data Separation** | 100% Isolated from trial data | 100% Isolated from production database |

### Isolated Trial Schema
1. **`trial_sessions`**: Tracks session start/end timestamps, date (`YYYY-MM-DD`), status (`ACTIVE`, `COMPLETED`, `SKIPPED`, `ABORTED_ON_RESTART`), feed health (`AUTHENTIC`, `DISCONNECTED`, `STALE`), ticks received, trades executed, gross P&L, statutory charges, net P&L, and eligibility toward the 14-day requirement (`is_eligible_day = 1`).
2. **`trial_orders`**: Records every paper order with `order_id` unique constraint, bot name, symbol, signal price, fill price, slippage, and charges.
3. **`trial_trades`**: Records closed paper trades with entry/exit timestamps, gross P&L, transaction fees, and net P&L.

---

## 4. Current Trial Status Report (Truth-in-Auditing Baseline)

The trial status query endpoint (`GET /api/paper-trial/status`) returns the authoritative trial baseline:

```json
{
  "trial_phase": "PHASE_11_SAFE_PAPER_TRIAL_SETUP",
  "execution_mode": "PAPER",
  "live_trading_eligible": false,
  "feed_status": "DISCONNECTED",
  "feed_provider": "NONE (DISCONNECTED)",
  "authentic_ticks_received": 0,
  "last_tick_timestamp": null,
  "completed_eligible_trial_days": 0,
  "target_trial_days": 14,
  "trial_days_remaining": 14,
  "trial_progress_pct": 0.0,
  "verified_paper_trades_count": 0,
  "net_pnl_after_costs": 0.0,
  "profit_factor": null,
  "max_drawdown_pct": null,
  "unmet_release_requirements": [
    "14 consecutive authentic-feed trial days uncompleted (Current: 0/14)",
    "Angel One SmartAPI broker connection is DISCONNECTED",
    "Zero authentic market ticks received from live exchange feed",
    "Minimum 100 verified authentic paper trades required (Current: 0/100)",
    "Explicit operator risk acknowledgement signature pending"
  ],
  "isolated_db_path": "server/data/paper_trial_store.db",
  "production_db_status": "UNTOUCHED & PRESERVED"
}
```

---

## 5. Operational Controls & Safety Invariants

1. **PAPER Mode Execution Boundary:** Verified that `CentralizedExecutionEngine` processes all orders through simulated fills. Broker `placeOrder` is unreachable.
2. **Emergency Stop (RMS Kill Switch):** Invoking `CentralizedRiskManager.trigger_emergency_stop()` sets `emergency_stop_active = True`. Pre-order Gate 1 blocks all new entries immediately, while permitting risk-reducing emergency exits (`is_emergency_exit = True`).
3. **Feed Disconnection Fail-Closed:** If market ticks are stale ($> 5.0\text{s}$ old) or the feed disconnects, strategies emit `ACTION_NO_TRADE` and the execution engine rejects new orders with `FEED_DISCONNECTED` or `STALE_FEED`.
4. **Documented Friction:** Every paper fill accounts for 3 bps slippage (`fill_price = price * 1.0003` for BUY, `0.9997` for SELL) and statutory regulatory charges (STT, exchange turnover fees, SEBI charges, stamp duty, 18% GST, brokerage).
5. **No Profitability Claims:** All simulated results are documented as theoretical estimates, never as verified live profits.

---

## 6. Audit Verdict
**TRIAL SETUP VERIFIED & ARMED IN PAPER MODE.**  
The isolated paper-trial pipeline is operational, tested, and protects the production database. The system is standing by in **DISCONNECTED** status awaiting operator credential configuration before the first trial session can begin.

