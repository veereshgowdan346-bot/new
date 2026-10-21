# TRADING JARVIS — OPERATOR PAPER MODE RUNBOOK

**Target Mode:** PAPER Mode (Strict Fail-Closed Simulation)  
**Applicability:** Local Workstation & Development Server  
**Engine Version:** 2.2.0  
**Protected Database:** `server/chintu_memory.db` (Read-Only)  

---

## 1. System Prerequisites

Before launching Trading Jarvis, verify your runtime environment meets these requirements:

- **Python**: Version `3.10` or higher (`python --version`)
- **Node.js**: Version `18.0` or higher (`node --version`)
- **Package Manager**: `npm` version `9.0` or higher (`npm --version`)
- **Operating System**: Windows 10/11 (PowerShell) or Linux/macOS (bash/zsh)
- **Local Ports**:
  - `8000`: FastAPI Backend Stream Server
  - `5173`: Vite Frontend Development Server

---

## 2. Safe Dependency Setup

All required dependencies are specified in `package.json` for frontend and in the Python virtual environment:

### Frontend Dependencies
```powershell
# From project root (c:\Users\veere\Desktop\new)
npm install
```

### Python Dependencies
Verify your Python environment has the necessary packages installed:
```powershell
python -c "import fastapi, uvicorn, pydantic, httpx, sqlite3; print('Core dependencies OK')"
```

---

## 3. Environment Configuration

Trading Jarvis is configured via environment variables.

### Creating your `.env` file
Copy the provided template to `.env`:
```powershell
Copy-Item .env.example .env
```

### Configuration Variables Reference
Open `.env` in your editor and configure the parameters:

| Variable Name | Required? | Default in PAPER Mode | Description |
| :--- | :---: | :---: | :--- |
| `CHINTU_EXECUTION_MODE` | **Yes** | `PAPER` | **Must remain `PAPER`**. Live execution is hard-blocked. |
| `CHINTU_AUTH_TOKEN` | Optional | `chintu_master_auth_permanent_veeresh` | Custom Bearer token for API authentication. |
| `CHINTU_ALLOWED_ORIGINS` | Optional | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated list of allowed CORS origins. |
| `ANGEL_API_KEY` | Optional in PAPER | *(Blank)* | Angel One OpenAPI key (only needed for live exchange feed). |
| `ANGEL_CLIENT_ID` | Optional in PAPER | *(Blank)* | Angel One Client ID. |
| `ANGEL_PIN` | Optional in PAPER | *(Blank)* | Angel One Login PIN. |
| `ANGEL_TOTP_SECRET` | Optional in PAPER | *(Blank)* | Base32 TOTP secret for automated 2FA login. |
| `CHINTU_TELEGRAM_BOT_TOKEN`| Optional | *(Blank)* | Telegram Bot token for real-time notifications. |
| `CHINTU_TELEGRAM_CHAT_ID` | Optional | *(Blank)* | Telegram Chat ID for trade alert dispatch. |

> [!IMPORTANT]
> **Never commit your `.env` file to Git.** It is excluded in `.gitignore`.  
> Live credentials are NOT required for PAPER simulation or strategy research.

---

## 4. Starting the Application

Launch backend and frontend in separate terminals:

### Terminal 1 — Start the Python Backend
```powershell
python server/python_stream_server.py
```
*Expected Console Output:*
```
[State Recovery]: Restored open positions from SQLite positions_memory.
[Angel One Config Audit]: Operating in safe PAPER mode.
================================================================================
CHINTU AI — STARTUP PREFLIGHT SYSTEM AUDIT
Mode: PAPER | Real Broker Orders: DISABLED
================================================================================
[Starting Chintu AI Backend Server on http://127.0.0.1:8000]
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

### Terminal 2 — Start the React/Vite Frontend
```powershell
npm run dev
```
*Expected Console Output:*
```
  VITE v8.3.4  ready in 250 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

Open your browser to `http://localhost:5173` to access the Trading Jarvis dashboard.

---

## 5. Checking Service Health & Connectivity

Use your browser, curl, or PowerShell to verify that services are healthy:

### 1. Basic Health Check
```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```
*Response:*
```json
{
  "status": "online",
  "system_state": "DEGRADED",
  "engine": "Chintu AI Trading Core",
  "executionMode": "PAPER",
  "live_trading_eligible": false
}
```
> [!NOTE]
> `system_state: "DEGRADED"` is normal when broker credentials are not configured or exchange feeds are offline outside market hours. The paper engine remains fully functional.

### 2. Startup Preflight Audit (Credential-Free)
```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/system/startup-preflight
```
Inspects all 7 operational dimensions without leaking any secrets.

### 3. System Diagnostics
```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/diagnostics
```
Returns active memory summary, consensus threshold, and circuit breaker status.

---

## 6. Confirming Simulated Order Execution

Trading Jarvis provides end-to-end simulation guarantees so that orders are never routed to a real broker account:

1. **Safety Gate Invariant**: `CentralizedExecutionEngine` and `place_live_angel_order` verify `execution_mode == "PAPER"`.
2. **Order Identifiers**: Simulated orders are assigned unique IDs (e.g., `ORD-...` or `SIM-...`).
3. **Realistic Fills**: Fills include volatility-aware slippage calculated from ATR, and apply full Indian regulatory charges (STT, exchange turnover fees, SEBI charges, stamp duty, 18% GST).
4. **Transaction Atomicity**: Paper order fills commit atomically across `orders_memory`, `positions_memory`, and `trade_memory` within a single SQLite transaction.
5. **Rejection Safeguards**: Duplicate orders within the idempotency window, overfills, and orders on terminated states are rejected automatically.

---

## 7. Understanding Bot States on the Dashboard

The dashboard monitors all 14 canonical bots. Here is how to interpret their statuses:

| Status Display | Meaning | Action / Operator Guidance |
| :--- | :--- | :--- |
| **`RUNNING`** | Worker thread is active and monitoring market ticks. | Normal operation for active cash equities (Bots 3, 6, 7). |
| **`PAUSED`** | Bot execution has been manually paused by operator. | Click **Resume Bot** in Bot Details modal to unpause. |
| **`DISCREPANCY_BLOCKED`** | Bot 4 corporate demerger symbol mismatch. | Do not trade until resolving `TATAMOTORS-EQ` vs `TMPV-EQ`. |
| **`DATA_UNAVAILABLE`** | Bots 12 and 13 require Level 2 Greeks / Level 3 depth. | Awaiting specialized options or order flow feed integration. |
| **`EXPIRED CONTRACT`** | Bots 1, 2, 5, 8, 9, 10, 11 configured with 2024 futures. | Fails closed safely. Awaiting active 2026 series update. |

---

## 8. Graceful Service Shutdown

To stop the system cleanly without leaving background threads or locks:

1. **Backend Server**: Press `Ctrl+C` in Terminal 1.
   - The FastAPI `lifespan` shutdown handler will cancel all background tasks.
   - `BotScheduler` worker threads will join and terminate cleanly.
   - `SnapshotService` scheduler task will cancel cleanly.
2. **Frontend Server**: Press `Ctrl+C` in Terminal 2.

---

## 9. Running Regression Tests

To run the full test suite and confirm that all safety invariants remain intact:

```powershell
# Run full suite (892 tests)
pytest -q

# Run focused Prompt 6 security and lifecycle tests (20 tests)
pytest -q tests/test_prompt6_security_and_startup.py

# Run simulation harness and pipeline tests (51 tests)
pytest -q tests/test_prompt5_paper_pipeline_and_simulation.py
```

All tests execute against isolated temporary SQLite databases or mock objects and **never write to the production database**.

---

## 10. Troubleshooting Common Issues

### Issue A: `Failed to fetch` on Frontend
- **Cause**: Backend server is not running on port 8000.
- **Fix**: Verify Terminal 1 is running `python server/python_stream_server.py` without errors.

### Issue B: `401 Unauthorized` on API Calls
- **Cause**: Missing Bearer authorization token on sensitive endpoints.
- **Fix**: The frontend handles this automatically. For custom curl/scripts, pass:
  `-H "Authorization: Bearer chintu_master_auth_permanent_veeresh"`

### Issue C: Emergency Stop Active / Orders Rejected
- **Cause**: RMS circuit breaker or emergency stop has been tripped.
- **Fix**: Reset the circuit breaker from the UI or via authorized POST:
  ```powershell
  Invoke-RestMethod -Uri http://127.0.0.1:8000/api/rms/reset `
    -Method Post `
    -Headers @{ Authorization = "Bearer chintu_master_auth_permanent_veeresh" }
  ```

---

## 11. Database Backup & Disaster Recovery

The system includes an automated, online SQLite snapshot service (`server/snapshot_service.py`):

- **Automated Schedule**: Runs daily at `23:55 IST` without interrupting active trading.
- **Retention**: Retains the last 7 daily snapshots in `backups/`.
- **Manual Trigger**: Create an immediate snapshot via authenticated POST:
  ```powershell
  Invoke-RestMethod -Uri http://127.0.0.1:8000/api/system/snapshots/create `
    -Method Post `
    -Headers @{ Authorization = "Bearer chintu_master_auth_permanent_veeresh" }
  ```
- **Integrity Validation**: Each snapshot executes `PRAGMA integrity_check` before being finalized.
- **Restoration Policy**: Never overwrite `server/chintu_memory.db` while the server is running. To restore, shut down the server, back up the existing database, copy the verified snapshot, and verify SHA-256 before restart.

---

## 12. Blocked Features & Prerequisites for Live Trading

The following features remain blocked by design until explicit configuration is provided:

1. **Live Broker Order Execution**:
   - `is_live_trading_eligible() == False`.
   - Requires all 8 preflight conditions to pass, including valid Angel One credentials, authentic tick feed, reconciliation match, and explicit user consent.
2. **Derivative Bots (Bots 1, 2, 5, 8, 9, 10, 11)**:
   - Configured with expired 2024 derivative contracts.
   - Require syncing active 2026 near-month contract tokens from the Angel One OpenAPI Scrip Master.
3. **Tata Motors Bot 4**:
   - Blocked by corporate demerger discrepancy (`TATAMOTORS-EQ` vs `TMPV-EQ`).
   - Requires operator decision on the intended entity.
4. **Options Greeks & Order Flow (Bots 12 & 13)**:
   - Require Level 2 Option Chain Greeks and Level 3 20-depth footprint delta feeds.

