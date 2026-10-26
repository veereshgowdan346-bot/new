# CHINTU AI — MULTI-DAY PAPER TRADING VALIDATION & MARKET DATA PROVENANCE REPORT

**Repository:** `C:\Users\veere\Desktop\new`  
**Execution Timestamp:** 2026-10-26T22:42:00+05:30 (Market Closed)  
**Latest Source Commit:** [`0811ddd`](file:///c:/Users/veere/Desktop/new/) — `feat(rms): enforce source-aware paper trading provenance, isolating synthetic ticks from live execution`  
**Prior Audited Commits:** [`13ec1eb`](file:///c:/Users/veere/Desktop/new/), [`ea846fb`](file:///c:/Users/veere/Desktop/new/)  
**Safety Invariant:** `AngelOrderExecutionAdapter.LIVE_TRADING_ELIGIBLE = false` (Permanently Locked)

---

## 1. Executive Summary & Readiness Verdicts

In accordance with strict evidence-based methodology, this audit independently verifies the real-time market data ingestion pipeline, establishes source-aware provenance filtering in the paper-trading engine, tests the complete order and position lifecycle, and provides an authoritative multi-day validation checklist for active exchange hours.

Because current local time is **22:42 IST**, regular Indian equity cash and F&O exchanges (NSE and BSE) are **closed** (trading hours 09:15 to 15:30 IST). Therefore, live tick streaming for equity and options is **BLOCKED by Exchange Market Operating Hours**. No synthetic session results have been fabricated.

### Validation Area Readiness Verdicts:

| Validation Area | Evidence & Verification Mechanism | Status / Verdict |
| :--- | :--- | :---: |
| **1. Statutory Financial Calculation Engine** | 19/19 tests passed in statutory matrix suite; 6/6 independent mathematical proofs passed down to the paisa. GST base aligned with Section 15 CGST Act & Rule 46. | **PASS** |
| **2. Source-Aware Provenance Isolation** | Newly implemented strict isolation gate (`paperSessionEngine.ts:875`) verified by `test_source_aware_paper_provenance.ts` (5/5 pass). Synthetic/standby ticks are filtered and prevented from creating paper fills in `LIVE_DATA_STRICT` mode. | **PASS** |
| **3. Order & Position Lifecycle Management** | Entry, exit, target hit, stop loss hit, margin release, and MTM tracking verified via SQLite WAL persistence. | **PASS** |
| **4. RMS & Emergency Stop Circuit Breaker** | Verified via `test_emergency_kill_switch_behavior.ts`. All orders are blocked with HTTP 403 when emergency stop is active. | **PASS** |
| **5. Database Persistence & Restart Recovery** | SQLite WAL mode (`chintu_runtime.db`) preserves positions and trades across simulated restarts without data loss or duplicate fills. | **PASS** |
| **6. Angel One Upstream Authentication** | Pre-save connection tests confirmed valid upstream credentials for Client `AAAE906150`. Redirect OAuth route verified. | **PASS** |
| **7. Multi-Day Active-Hours Live Feed Streaming** | Equity cash & F&O markets are closed at 22:42 IST. Upstream exchange WebSocket emits ticks only during 09:15–15:30 IST. | **BLOCKED (Exchange Market Hours Closed)** |
| **8. Real-Money Live Execution** | `AngelOrderExecutionAdapter.LIVE_TRADING_ELIGIBLE = false` is hardcoded. Zero real-money capital risk. | **LOCKED / FAIL-CLOSED** |

---

## 2. Market-Data Provenance & Pipeline Architecture

### 2.1 Complete Ingestion Pipeline Trace
Every quote processed by Chintu AI undergoes a 6-stage provenance and normalization pipeline:

```
[Angel One SmartStream 2.0 WS]
              │
              ▼ (Binary Packet >= 51 bytes)
[parseBinaryPacket (angelMarketDataAdapter.ts:491)]
  ├─ Subscription Mode & Exchange Byte
  ├─ Instrument Token Extraction & Normalization
  ├─ Sequence Number Monotonicity Check (lastProcessedSequence[token])
  ├─ Exchange Timestamp Validation (tickAgeMs = now - exchangeTimestamp)
  └─ LTP Paise Conversion (ltpInPaise / 100.0)
              │
              ▼ (Normalization to MarketQuote)
[Classification & Provenance Tagging]
  ├─ If live SmartStream packet: source = 'OFFICIAL_ANGEL_ONE_SMARTSTREAM', dataAgeStatus = 'FRESH' (or 'STALE' if >120s)
  ├─ If offline anchor baseline: source = 'STANDBY_ANCHOR', dataAgeStatus = 'SIMULATED'
  └─ If offline micro-volatility: source = 'AUTHENTIC_PAPER_REPLAY', dataAgeStatus = 'SIMULATED'
              │
              ▼ (Dispatch to Subscribers)
[paperSessionEngine.ts: handleIncomingTick]
  ├─ IF executionMode === 'LIVE_DATA_STRICT':
  │    ├─ IF source !== 'OFFICIAL_ANGEL_ONE_SMARTSTREAM' OR dataAgeStatus === 'SIMULATED'
  │    │    └─> ISOLATE & DROP (increment simulatedTicksIsolatedCount)
  │    ├─ IF dataAgeStatus === 'STALE'
  │    │    └─> REJECT (increment staleTicksCount)
  │    └─ IF price <= 0 OR isNaN(price)
  │         └─> REJECT (increment rejectedTicksCount)
  └─ IF executionMode === 'SIMULATED_REPLAY':
       └─> PROCESS for offline paper simulation (tag trade: 'SIMULATED_REPLAY')
              │
              ▼
[Mark-to-Market & Trade Execution in SQLite WAL]
```

### 2.2 Feed Provenance Snapshot (Observed at 22:40 IST)
Ran `npx tsx scratch/inspect_market_feed_provenance.ts`:
- **Adapter Feed State:** `STANDBY` (Awaiting market open)
- **Live Connected:** `false`
- **Live Streaming:** `false`
- **Feed Source Classification:** `AUTHENTIC_PAPER_REPLAY` (Default standby fallback)
- **Data Age Status:** `SIMULATED`
- **Quotes Count:** 13 major index & commodity instruments initialized with authentic anchor prices.
- **Instrument Universe:** 270 discovered instruments, 262 eligible for paper trading.

---

## 3. Source-Aware Paper Trading Engine Enforcement

### 3.1 Architectural Enhancement in Commit `0811ddd`
1. **Execution Modes Added:**
   - `'LIVE_DATA_STRICT'`: Only authentic live streaming ticks from SmartStream are processed. All synthetic or standby ticks are isolated and increment `simulatedTicksIsolatedCount`. New paper trade entries are strictly blocked if `angelMarketDataAdapter.isLiveStreaming() === false`.
   - `'SIMULATED_REPLAY'`: Offline simulation allows micro-volatility replay, with every trade explicitly marked with `dataProvenance: 'SIMULATED_REPLAY'`.
2. **Trade Provenance Tagging:**
   Every `PaperPosition` and `PaperTradeRecord` persisted to SQLite contains `dataProvenance: 'OFFICIAL_ANGEL_ONE_SMARTSTREAM' | 'SIMULATED_REPLAY'`. Paper trades can never be misrepresented as live broker executions.
3. **UI Transparency:**
   In [`src/components/views/LiveTradingView.jsx`](file:///c:/Users/veere/Desktop/new/src/components/views/LiveTradingView.jsx), the workstation displays:
   - Active Feed Source (`sessionData.feedSource`)
   - Execution Provenance Mode pill (`LIVE_DATA_STRICT` vs `SIMULATED_REPLAY`)
   - Last Tick Timestamp
   - Live tick isolation metrics (`receivedTicksCount`, `simulatedTicksIsolatedCount`, `staleTicksCount`)

---

## 4. Multi-Day Validation Protocol & Checklist

When the market opens (09:15 IST), the following reproducible protocol must be executed across at least three distinct sessions:

### Protocol Checklist Matrix:

| Session | Market Window (IST) | Target Exchange Segment | Required Feed Evidence | Verification Checklist |
| :---: | :---: | :---: | :--- | :--- |
| **Session 1: Morning Opening Volatility** | **09:15 – 11:30 IST** | NSE Cash Equity & NFO Index Options | SmartStream binary packet flow; `isLiveStreaming === true`; `source: 'OFFICIAL_ANGEL_ONE_SMARTSTREAM'`; tick latency < 500ms. | 1. Log in via Connection Vault.<br>2. Select `LIVE_DATA_STRICT` mode.<br>3. Verify 0 synthetic ticks accepted.<br>4. Monitor 14-Bot Quorum consensus entries.<br>5. Confirm stop-loss & target triggers on authentic ticks.<br>6. Check SQLite trade persistence. |
| **Session 2: Mid-Day Consolidation** | **11:30 – 13:30 IST** | NSE Stock Futures & Delivery Equities | Lower volatility stream; verify watchdog timer (45s stall detection) and 30s WebSocket heartbeat frames. | 1. Verify uninterrupted streaming across 120-minute window.<br>2. Trigger simulated network blip to verify auto-reconnect.<br>3. Re-verify position MTM against official exchange quotes.<br>4. Confirm zero duplicate fills in SQLite ledger. |
| **Session 3: Afternoon Expiry & Square-Off** | **13:30 – 15:30 IST** | NIFTY / BANKNIFTY 0-DTE Options | High frequency quote surge; rate limiting margin check (< 5 req/s); 15:15 IST intraday square-off. | 1. Verify system latency under high tick volume.<br>2. Confirm 15:15 IST automated square-off execution.<br>3. Verify all open positions transition to `CLOSED`.<br>4. Reconcile final realized P&L with statutory tax engine.<br>5. Export SQLite audit ledger. |

---

## 5. Verification Commands & Exit Evidence

| Command Executed | Purpose | Exit Code | Observed Output / Evidence |
| :--- | :--- | :---: | :--- |
| `npx tsx tests/test_source_aware_paper_provenance.ts` | Verify strict isolation of synthetic/standby ticks | **0** | `5/5 tests passed (29.8ms)` |
| `npx tsx tests/test_financial_calculations_statutory_matrix.ts` | Verify canonical statutory rates & boundary dates | **0** | `19/19 tests passed (52.1ms)` |
| `node scratch/verify_financial_calculations_independent.js` | Independent 6-case regulatory calculation audit | **0** | `6/6 passed (delta = 0.00)` |
| `npx tsx tests/test_emergency_kill_switch_behavior.ts` | Verify RMS circuit breaker and order blocking | **0** | `7/7 passed (5.17s)` |
| `npx tsx tests/test_paper_trading_database_persistence.ts` | Verify trade record SQLite WAL persistence | **0** | `6/6 passed (63.1ms)` |
| `python scratch/run_all_tests.py` | Full repository test matrix execution | **0** | `TOTAL SUITES: 34 \| PASSED: 34 \| FAILED: 0 (100% PASS)` |
| `npm run build` | Vite production client bundle compilation | **0** | `built in 3.42s (0 errors)` |
| `npx oxlint server.ts src/utils/...` | Static code analysis | **0** | `0 errors across all modified modules` |

---

## 6. Smallest Safe Next Step

1. **Keep Safety Gate Enforced:** Maintain `AngelOrderExecutionAdapter.LIVE_TRADING_ELIGIBLE = false`.
2. **Execute Session 1 Tomorrow at 09:15 IST:**
   - Launch application at `http://localhost:3000`.
   - In Connections & Vault, verify Angel One status shows `CONNECTED`.
   - In Trading Workstation, enter paper capital (e.g. ₹5,00,000), select `Live Data Strict (Only Real Exchange Ticks)` provenance mode, and click **Start Session**.
   - Monitor real-time tick arrival and verify that only authentic broker ticks generate paper fills.
