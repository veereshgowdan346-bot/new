# CHINTU AI — OPERATOR TRIAL START CHECKLIST
**Trial Target:** 14-Day Authentic-Feed Paper-Trading Operational Trial  
**Execution Environment:** Isolated Paper Trial Store (`server/data/paper_trial_store.db`)  
**Safety Protocol:** Strict PAPER Mode Only (`LIVE_TRADING_ELIGIBLE: BLOCKED`)  
**Target Release Gate:** Completion of 14 Authentic-Feed Trading Sessions ($\ge 100$ Paper Trades, Post-Friction Net Profit Factor $\ge 1.50$, Max Drawdown $\le 10.0\%$)

---

## 1. Operator Pre-Flight Configuration Checklist

Before initiating Day 1 of the paper-trading trial, the system operator must complete and verify the following steps:

### Step 1: Environment Credentials Configuration
Create or update `.env` in the repository root (protected by `.gitignore`):

```bash
# Angel One SmartAPI Credentials (Required for Authentic Feed)
ANGEL_API_KEY=your_smartapi_app_key_here
ANGEL_CLIENT_ID=your_angel_one_client_code_here
ANGEL_PIN=your_4_digit_mpin_here
ANGEL_TOTP_SECRET=your_32_character_base32_totp_secret_here
```

> [!WARNING]
> Never commit `.env` or paste credentials into Git, logs, or chat reports. The `.gitignore` file is configured to exclude all `.env` files.

---

### Step 2: Market Calendar & Trading Hours Window
Indian exchange trading hours (IST, UTC+05:30):

| Market Segment | Trading Days | Operating Hours (IST) | Session Eligibility |
| :--- | :--- | :---: | :---: |
| **NSE Equity & F&O** | Monday to Friday | 09:15 to 15:30 | **Eligible for 14-Day Trial** |
| **MCX Commodity** | Monday to Friday | 09:00 to 23:30 | **Eligible for 14-Day Trial** |
| **Weekends & Exchange Holidays** | Saturday, Sunday & Holidays | **CLOSED** | **DISQUALIFIED (Marked SKIPPED)** |

> [!IMPORTANT]
> A valid trial day requires at least **4 hours** of continuous active connection during official market hours and either $\ge 1$ executed paper trade or $\ge 1,000$ authentic exchange ticks.

---

### Step 3: Broker Authentication Verification
Execute the pre-flight broker diagnostic check:

```bash
curl -H "Authorization: Bearer chintu_master_auth_permanent_veeresh" http://127.0.0.1:8000/api/broker/angel/diagnostics
```

**Expected Passing Response:**
```json
{
  "status": "AUTHENTICATED",
  "diagnostics": {
    "broker_authenticated": true,
    "credentials_present": {
      "apiKey": true,
      "clientId": true,
      "pin": true,
      "totpSecret": true
    },
    "missing_configurations": []
  }
}
```

---

### Step 4: Authentic WebSocket Feed Live Verification
Verify that the WebSocket streaming manager connects and receives live binary exchange ticks:

```bash
curl -H "Authorization: Bearer chintu_master_auth_permanent_veeresh" http://127.0.0.1:8000/api/market-feed/status
```

**Checklist Items:**
- [ ] `feed.status` reports `"CONNECTED"` (not `"DISCONNECTED"`).
- [ ] `feed.is_authentic_exchange_feed` reports `true`.
- [ ] `feed.authentic_ticks_count` is incrementing.
- [ ] `feed.last_tick_time` reflects a timestamp within the last 5.0 seconds.

---

### Step 5: Activating a Daily Trial Session
At the start of the trading session (e.g. 09:15 IST), initiate the daily paper session:

```python
# Programmatic or API initiation:
from server.paper_trial_manager import paper_trial_manager
session_id = paper_trial_manager.start_session(is_authentic_feed=True, notes="Day 1 Live Authentic Paper Session")
```

**Checklist Items:**
- [ ] A new session record is created in `server/data/paper_trial_store.db`.
- [ ] `production` database `server/chintu_memory.db` remains 100% untouched.
- [ ] `session_date` records current date (`YYYY-MM-DD`).
- [ ] Status is set to `"ACTIVE"`.

---

### Step 6: Verify Safety Boundary & Emergency Stop
Ensure paper execution mode is locked and the kill switch is operational:

```bash
# 1. Verify execution mode is PAPER
curl -H "Authorization: Bearer chintu_master_auth_permanent_veeresh" http://127.0.0.1:8000/api/execution-mode
# Expected: {"mode": "PAPER", "ready_for_live": false}

# 2. Verify emergency stop is ready
curl -X POST -H "Authorization: Bearer chintu_master_auth_permanent_veeresh" http://127.0.0.1:8000/api/rms/emergency-stop
# Expected: {"status": "success", "emergency_stop_active": true}
```

---

### Step 7: Session Closure & Eligibility Awarding
At market close (15:30 IST), conclude the daily session:

```python
summary = paper_trial_manager.end_session(session_id)
print(summary)
# Expected: {"session_id": "...", "status": "COMPLETED", "duration_hours": 6.25, "is_eligible_day": true}
```

**Checklist Items:**
- [ ] Session ran for $\ge 4.0$ continuous hours.
- [ ] No mid-session crashes or restarts occurred (restarts flag `ABORTED_ON_RESTART`).
- [ ] `is_eligible_day` evaluates to `true`.
- [ ] Completed eligible trial days increments by +1.

---

### Step 8: Monitor 14-Day Trial Progress
Check cumulative trial progress at any time:

```bash
curl -H "Authorization: Bearer chintu_master_auth_permanent_veeresh" http://127.0.0.1:8000/api/paper-trial/status
```

**Required Gate Hurdles for Future Live Release Consideration:**
- [ ] **Completed Days:** 14 / 14 distinct calendar trading days (`is_eligible_day = 1`).
- [ ] **Verified Paper Trades:** $\ge 100$ completed closed trades.
- [ ] **Post-Friction Profit Factor:** $\ge 1.50$ (Net Wins / Net Losses after all statutory taxes and brokerage).
- [ ] **Maximum Drawdown:** $\le 10.0\%$ over the entire trial.
- [ ] **Reconciliation Drift:** 0 position mismatches between local book and broker reports.
- [ ] **Operator Consent:** Formal cryptographic/digital operator signature.

---

## 2. Mandatory Disclaimers

> [!CAUTION]
> **NO LIVE BROKER ORDERS**  
> Throughout the entire 14-day trial, the system operates exclusively in PAPER mode. Real broker order routing (`SmartConnect.placeOrder`) remains strictly disabled.

> [!WARNING]
> **TRIAL CANNOT BE EXPEDITED OR FABRICATED**  
> Synthetic market ticks, offline simulations, or multi-threaded backtests do **NOT** count toward the 14-day authentic trial requirement. Every eligible session must be earned over active live market hours on Indian exchanges.

