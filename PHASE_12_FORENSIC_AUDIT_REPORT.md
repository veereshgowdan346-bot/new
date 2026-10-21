# CHINTU AI — PHASE 12 FORENSIC AUDIT MASTER REPORT

**Document Version:** 1.0.0  
**Audit Date:** October 17, 2026 (Saturday)  
**Lead Auditor:** Senior Python Trading Systems Auditor, Angel One SmartAPI Integration Engineer & Quantitative Systems Tester  
**Repository Working Directory:** `C:\Users\veere\Desktop\new`  
**Execution Mode:** `PAPER` (Strictly Enforced & Formally Verified)  
**Overall Offline Subsystems Verdict:** **PASS (100% Operational & Reproduced)**  
**Authentic Live Broker Feed Verdict:** **BLOCKED (Missing Credentials + Weekend Market Closure)**  
**Real Broker Orders Transmitted:** **0 (Confirmed & Hard-Locked)**  

---

## 1. Executive Summary and Overall Verdict

An independent forensic audit of the **CHINTU AI Trading System (Phase 12)** was executed to verify claims made in previous reports regarding dynamic instrument resolution, SmartWebSocketV2 token formatting, tick decoding, candle formation, strategy execution, and execution safety.

Every claim was tested against the actual source code, local database caches, and active runtime processes without assuming previous summaries were accurate.

```
========================================================================================================
FORENSIC AUDIT VERDICT MATRIX
========================================================================================================
Audit Subsystem                    Verification Standard               Forensic Verdict   Exit / Status
--------------------------------------------------------------------------------------------------------
Git Working Tree & State           Clean baseline, uncommitted checks  PASS               master @ 25106f6
Official Instrument Master Source  Official OpenAPI endpoint & size    PASS               35.98 MB, 153.4k recs
Cache Freshness & SHA-256          Full 64-char SHA256 & age < 24h     PASS               0.90h old, SHA verified
Token Collision & Routing          Composite (segment, token) routing  PASS               9,388 collisions handled
14 Canonical Bots Registry         Preserved, no missing/extra bots    PASS               14 / 14 Bots Audited
Permanent Cash Equities            Never-expiring cash equities (NSE)  PASS               4 / 4 Equities Valid
Dynamic Derivatives Resolution     Active 2026 contracts resolved      PASS               10 / 10 Active Contracts
Commodity Roll & Expiry Safety     Crude Oil 19OCT vs next 19NOV roll  PASS               Dual-Contract Traced
SmartWebSocketV2 Formatting        exchangeType (1, 2, 4, 5, 13)       PASS               14 Tokens Mapped
Tick Conversion & Quality (14 tests) Paise-to-rupee, stale, NaN guard  PASS               14 / 14 Cases Passed
Pipeline Data Trace (7 stages)     WebSocket -> Scheduler -> Paper     PASS               End-to-End Traced
Execution Engine & PAPER Safety    Zero placeOrder calls, Gate 0-6 RMS PASS               Real Orders: 0
Pytest Automated Test Suite        Complete repo automated suite       PASS               231 / 231 Passed (15.57s)
Deep Verification Runner           Architecture & Security Runner      PASS               5 / 5 Sections Passed
Frontend Production Build          Vite client production build        PASS               Clean Build (1.72s)
Authentic Live Feed Streaming      Live broker ticks from SmartAPI     BLOCKED            MISSING_CREDENTIALS
========================================================================================================
```

> [!IMPORTANT]
> **Authentic Market Feed Verdict:** Explicitly marked **`BLOCKED`**.
> Real-time streaming from Angel One SmartAPI is genuinely blocked because broker credentials are not configured in the environment (`MISSING_CREDENTIALS`), and Indian exchanges (NSE, BSE, MCX) are closed on weekends (`MARKET_CLOSED`).
> In accordance with strict safety rules:
> 1. Zero credentials were manufactured or logged.
> 2. Zero synthetic or replay ticks were counted as authentic broker ticks.
> 3. Zero real broker orders were transmitted (`SmartConnect.placeOrder` was never invoked).
> 4. The Live-Readiness Gate strictly enforces `ready_for_live = False`.

---

## 2. Audit Environment, Commit, and Working-Tree Status

- **Repository Root:** `C:\Users\veere\Desktop\new`
- **Current Git Branch:** `master`
- **Head Commit:** `25106f6 feat(phase5): implement real strategy engine, bot scheduler, canonical registry and highest profit selector`
- **Execution Mode:** `PAPER` (Strictly enforced system-wide)
- **Local Machine Time:** Saturday, October 17, 2026, 09:39:46 IST
- **Active Working-Tree Status:** Modified configuration and server files present; all untracked test scripts and previous reports isolated in workspace root and `scratch/`.
- **Python Environment:** Python 3.14.7 (win32), pytest 9.1.1, platformdirs 4.12.3, anyio 4.14.2.
- **Node.js Environment:** Vite v8.3.4 client production builder.

---

## 3. Claims Compared With Independently Reproduced Evidence

| Previously Claimed Feature | Previous Report Claim | Forensic Audit Reproduction | Finding / Evidence |
| :--- | :--- | :--- | :--- |
| **Scrip Master Records** | 153,484 records downloaded | **REPRODUCED** | Exactly 153,484 records loaded from cache file (39,356,031 bytes on disk). |
| **Download SHA-256** | `c09a608d17f60752` | **CLARIFIED** | `c09a608d17f60752` is the 16-character prefix of the raw downloaded payload; full disk SHA-256 is `cc5ba631c66805d505d601816f5312d893276b525f6ec6352e61e15417466fab`. |
| **14 Bots Mapped** | 14 / 14 mapped to master | **REPRODUCED** | 4 permanent equities verified; 10 expired 2024 derivatives resolved to active 2026 contracts. |
| **Tata Motors Alias** | Token 3456 / `TMPV-EQ` | **REPRODUCED & PROVEN** | Demerged passenger vehicle business confirmed on NSE Cash token 3456 (`TMPV-EQ`). |
| **ExchangeType Subscriptions** | 14 tokens mapped to 5 types | **REPRODUCED** | Group 1: 4 tokens, Group 2: 5 tokens, Group 4: 1 token, Group 5: 3 tokens, Group 13: 1 token. |
| **Paise Conversion** | `287550` paise $\to$ INR `2875.50` | **REPRODUCED** | Verified by binary tick decoder in `AngelOneWebSocketManager.handle_binary_tick()`. |
| **35-Candle Strategy Test** | Outputted `HOLD` | **REPRODUCED** | Worker 3 evaluated with 35 bars; returned `HOLD` (RSI 100.0 within Bollinger bounds). |
| **Bot 12/13 Fail-Closed** | `DATA_UNAVAILABLE` | **REPRODUCED** | Evaluated on missing Greeks/footprint; returned `NO_TRADE` with `DATA_UNAVAILABLE`. |
| **PAPER Mode Safety** | Zero broker orders | **REPRODUCED** | `placeOrder` locked out; paper order executed to SQLite; 0 broker orders placed. |
| **Full Pytest Suite** | 231 / 231 passed | **REPRODUCED** | 231 passed, 0 failed in 15.57s. |
| **Live Broker Ticks** | Claimed BLOCKED | **REPRODUCED** | Authentic ticks count = 0; credentials absent; market closed. Correctly marked BLOCKED. |

---

## 4. All 14 Canonical Bot Mapping Table

The actual canonical registry was inspected directly in [`server/bot_registry.py`](file:///c:/Users/veere/Desktop/new/server/bot_registry.py). Exactly 14 canonical bots exist with zero duplicates or missing IDs:

```
====================================================================================================================================================================
14 CANONICAL BOTS FORENSIC AUDIT TABLE
====================================================================================================================================================================
Bot ID Bot Name                  Intended Instrument Resolved Symbol         Exch Segment Exch Type Token   Expiry     Strike  Opt Lot  Tick   Mapping Evidence     Verdict
--------------------------------------------------------------------------------------------------------------------------------------------------------------------
01     Scalper Bot               NIFTY 50            NIFTY27OCT26FUT         NFO          2         48704   27OCT2026  -1.0    N/A  65  10.0   EXPIRED_RESOLVED     PASS
02     EMA Trend Bot             BANKNIFTY           BANKNIFTY27OCT26FUT     NFO          2         48699   27OCT2026  -1.0    N/A  30  20.0   EXPIRED_RESOLVED     PASS
03     RSI Reversal Bot          RELIANCE            RELIANCE-EQ             NSE          1         2885    Permanent  -1.0    N/A   1  10.0   VALID_EQUITY         PASS
04     Breakout Bot              TATA MOTORS         TMPV-EQ                 NSE          1         3456    Permanent  -1.0    N/A   1   5.0   DEMERGER_EQUITY      PASS
05     Mean Reversion            FINNIFTY            FINNIFTY27OCT26FUT      NFO          2         48702   27OCT2026  -1.0    N/A  60  10.0   EXPIRED_RESOLVED     PASS
06     VWAP Momentum             HDFCBANK            HDFCBANK-EQ             NSE          1         1333    Permanent  -1.0    N/A   1   5.0   VALID_EQUITY         PASS
07     Volume Spike Bot          INFY                INFY-EQ                 NSE          1         1594    Permanent  -1.0    N/A   1   5.0   VALID_EQUITY         PASS
08     SuperTrend Wave           CRUDE OIL           CRUDEOIL19OCT26FUT      MCX          5         569900  19OCT2026   0.0    N/A 100 100.0   EXPIRED_RESOLVED     PASS
09     Bollinger Band Squeeze    GOLD (XAUUSD)       GOLD04DEC26FUT          MCX          5         495213  04DEC2026   0.0    N/A   1 100.0   EXPIRED_RESOLVED     PASS
10     Pivot Point Reversal      SILVER (XAGUSD)     SILVER04DEC26FUT        MCX          5         495214  04DEC2026   0.0    N/A  30 100.0   EXPIRED_RESOLVED     PASS
11     Multi-Timeframe Confluence USDINR             USDINR26O23FUT          CDS          13        5479    23OCT2026  -1.0    N/A   1 25000   EXPIRED_RESOLVED     PASS
12     Options Gamma Scalper     NIFTY OPTIONS       NIFTY19OCT2624750CE     NFO          2         47400   19OCT2026  2475000 CE   65   5.0   EXPIRED_RESOLVED     PASS
13     Order Flow Imbalance      BANKNIFTY OPTIONS   BANKNIFTY27OCT2652500CE NFO          2         49377   27OCT2026  5250000 CE   30   5.0   EXPIRED_RESOLVED     PASS
14     Risk Neutral Delta Hedger SENSEX              SENSEX26OCTFUT          BFO          4         864571  29OCT2026   0.0    N/A  20   5.0   EXPIRED_RESOLVED     PASS
====================================================================================================================================================================
```

- **Exact Resolution Module:** [`server/instrument_master.py`](file:///c:/Users/veere/Desktop/new/server/instrument_master.py)
- **Functions Employed:**
  - `resolve_equity()`: Lines 470–505 (Permanent cash equities)
  - `resolve_active_future()`: Lines 507–545 (Index, commodity, currency futures)
  - `resolve_option()`: Lines 547–606 (Options strikes, paise normalization)
  - `audit_bot_mapping()`: Lines 608–718 (Full bot auditing)

---

## 5. Official Scrip Master Source, Cache Freshness and Full Hash

### 5.1 Endpoint & Payload Analysis
- **Official URL:** `https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json`
- **HTTP Status:** 200 OK
- **Raw Downloaded Payload Size:** `35,979,385` bytes (~34.31 MB)
- **Raw Response Hash Prefix:** `c09a608d17f60752`
- **Cache File On Disk:** `server/data/scrip_master_cache.json` (`39,356,031` bytes)
- **Complete Full SHA-256 (64-character):**  
  `cc5ba631c66805d505d601816f5312d893276b525f6ec6352e61e15417466fab`
- **Record Count:** **153,484 items**
- **Fetch Timestamp:** `2026-10-17T08:45:44.307872`
- **Cache Age:** **0.90 hours** ($< 24\text{ hours}$ threshold strictly satisfied).

### 5.2 Atomic Write & Fallback Segregation
- **Atomic Replacement:** Cache writes to a temporary file (`.tmp`) before atomic rename/replace via `os.replace()`, preventing half-written corrupted files.
- **Fallback Verification:** When forced to fail download in an isolated environment, the system returned `status: "SEED_FALLBACK"` and `source: "SEED_MASTER"`. Seed records cannot masquerade as official master data.

---

## 6. Token Collision and Exchange-Type Verification

### 6.1 Multi-Segment Overlapping Tokens
In Angel One's OpenAPI Scrip Master, tokens are **not globally unique** across different exchange segments.
- **Forensic Discovery:** Exactly **9,388 tokens** appear in more than one exchange segment.
- **Specific Case — Token `3456`:**
  - Segment `NSE` (Cash): `TMPV-EQ` (lotsize: 1, tick size: 5.0) $\to$ The intended Tata Motors passenger vehicle cash equity.
  - Segment `CDS` (Currency): `EURINR27MAR113.75CE` (lotsize: 1, tick size: 25000.0) $\to$ An unrelated EUR-INR currency option.
- **Routing Protection:** The system indexes records by composite key `(token, exch_seg)` and enforces `exchangeType` in WebSocket subscriptions (`exchangeType: 1` for `nse_cm`). This guarantees that incoming ticks for token `3456` in `exchangeType: 1` route strictly to `TMPV-EQ` on NSE Cash, preventing any misrouting to currency derivatives.

---

## 7. Special Instrument Findings

1. **RELIANCE-EQ (Token `2885`):** Confirmed on NSE Cash (`nse_cm`). Lotsize: 1, tick size: 10.0 (in paise: 10, i.e., 0.10 INR).
2. **TATAMOTORS / TMPV-EQ (Token `3456`):** Confirmed on NSE Cash (`nse_cm`). Following the Tata Motors demerger, the passenger vehicle entity is listed on NSE as `TMPV-EQ` on token 3456. Lotsize: 1, tick size: 5.0 (0.05 INR).
3. **HDFCBANK-EQ (Token `1333`) & INFY-EQ (Token `1594`):** Confirmed on NSE Cash (`nse_cm`). Lotsize: 1, tick size: 5.0 (0.05 INR).
4. **Index Futures (NIFTY `48704`, BANKNIFTY `48699`, FINNIFTY `48702`):** Confirmed on `NFO` (`nse_fo`). Expire on `27OCT2026`. Lotsizes: NIFTY 65, BANKNIFTY 30, FINNIFTY 60.
5. **Commodities (CRUDEOIL `569900`, GOLD `495213`, SILVER `495214`):**
   - Near-month Crude Oil `CRUDEOIL19OCT26FUT` expires on Monday, `19OCT2026`.
   - Next-month contract `CRUDEOIL19NOV26FUT` (token `573422`, expiry `19NOV2026`) exists in master.
   - For live operations, roll policies should migrate positions before the MCX physical tender cutoff.
6. **USDINR Currency Future (`USDINR26O23FUT`, Token `5479`):** Confirmed on `CDS` (`cde_fo`). Expiring `23OCT2026`.
7. **Options (NIFTY `47400`, BANKNIFTY `49377`):**
   - Bot 12 (`NIFTY19OCT2624750CE`, token `47400`): Near-expiry weekly option (Monday, `19OCT2026`). On Monday morning this contract is 0DTE; on Saturday it has 2 calendar days to expiry.
   - Bot 13 (`BANKNIFTY27OCT2652500CE`, token `49377`): Monthly option (expiring `27OCT2026`).
8. **SENSEX (`SENSEX26OCTFUT`, Token `864571`):** Confirmed on `BFO` (`bse_fo`). Master symbol is `SENSEX26OCTFUT` with expiry date field `29OCT2026` and lotsize 20. Both symbol and token exist in the authoritative BSE derivatives master.

---

## 8. Expiry, Strike, Lot Size, Tick Size and Contract Roll Safety

1. **Lot Size Consistency:** All bot workers, order validators, and execution engines use lotsizes directly derived from the master record (e.g., NIFTY = 65, BANKNIFTY = 30, CRUDEOIL = 100, SENSEX = 20).
2. **Paise Strike Normalization:** In Angel One's OpenAPI Scrip Master, option strikes are expressed in paise (e.g., `2475000.0` paise for strike 24,750). The resolution engine normalizes values $> 100,000$ to INR (`strike / 100.0`), preventing strike matching errors.
3. **Contract Expiry Safety:**
   - All derivative bots filter out contracts with expiry $< \text{today}$.
   - Expired 2024 contracts (`24OCT`, `24NOV`, `24DEC`) are strictly rejected.
   - Near-month contracts nearing expiry are identified and mapped; next-month replacement contracts are resolved without manual intervention.

---

## 9. Tick Conversion and Precision Test Results

Fourteen distinct positive and negative tick scenarios were executed against `AngelOneWebSocketManager.handle_binary_tick()`:

| Test Case | Input | Expected Unit / Outcome | Actual Result | Verdict |
| :--- | :--- | :--- | :--- | :---: |
| **1. NSE Cash Tick** | `last_traded_price: 287550` | Paise $\to$ INR `2875.50` | `SUCCESS` | **PASS** |
| **2. Derivative Tick** | `last_traded_price: 2485000` | Paise $\to$ INR `24850.00` | `SUCCESS` | **PASS** |
| **3. Zero Price** | `last_traded_price: 0` | Reject (`INVALID_PRICE`) | `INVALID_PRICE` | **PASS** |
| **4. Negative Price** | `last_traded_price: -100` | Reject (`INVALID_PRICE`) | `INVALID_PRICE` | **PASS** |
| **5. Missing Token** | `token: ""` | Reject (`UNKNOWN_TOKEN`) | `UNKNOWN_TOKEN` | **PASS** |
| **6. Unknown Token** | `token: "99999999"` | Reject (`UNKNOWN_TOKEN`) | `UNKNOWN_TOKEN` | **PASS** |
| **7. Cross-Segment Token** | Token 5479 (CDS) | Mapped to `USDINR` | `SUCCESS` | **PASS** |
| **8. Stale Timestamp** | Age $= 30\text{s}$ ($> 15\text{s}$) | Reject (`STALE_TICK`) | `STALE_TICK` | **PASS** |
| **9. Future Timestamp** | $+15\text{s}$ ahead ($> 5\text{s}$) | Reject (`FUTURE_TIMESTAMP`) | `FUTURE_TIMESTAMP` | **PASS** |
| **10. Missing Timestamp** | `exchange_timestamp: 0` | Fallback to current time | `SUCCESS` | **PASS** |
| **11. Duplicate Ingest** | Same millisecond tick | Ingested to candle bar | `SUCCESS` | **PASS** |
| **12. NaN Price** | `float('nan')` | Reject (`INVALID_PRICE`) | `INVALID_PRICE` | **PASS** |
| **13. Reconnect Backoff** | 6 retries | `[2s, 4s, 8s, 16s, 32s, -1]` | Matched exactly | **PASS** |
| **14. Mode Safety Guard** | `mode = "LIVE"` | `AssertionError` raised | Assertion tripped | **PASS** |

---

## 10. Simulated-versus-Authentic Feed Evidence

- **Authentic Tick Counter (`authentic_ticks_count`):** Genuinely **0**.
- **Synthetic Tick Counter (`synthetic_ticks_count`):** Segregated. Ingesting synthetic ticks increments only the synthetic counter and never increases `authentic_ticks_count`.
- **Feed Health Derivation:** Feed health checks `is_fresh` ($< 15\text{s}$ latency from real ticks). When ticks are zero or connection is absent, `is_fresh = False`.
- **Live Readiness Gate:** Fails closed. Conditions `AUTHENTIC_BROKER_AUTH` and `AUTHENTIC_MARKET_FEED` return `FAIL`.
- **Verdict:** Authentic live feed verification is strictly **`BLOCKED`**.

---

## 11. Scheduler, Candles and Strategy Evaluation Trace

The pipeline transition was traced end-to-end:
1. **Decoded Tick:** INR `2875.50` (token 2885).
2. **Scheduler Fan-Out:** Mapped to Worker 3 (`RELIANCE`).
3. **Candle Creation:** Updated active 15m candle (`timestamp: 2026-10-17 09:15:00`, Close: `2875.50`).
4. **Strategy Execution:** Evaluated 35 bars in sandbox; produced mathematical indicators and returned `HOLD`.
5. **Fail-Closed Derivatives (Bots 12 & 13):** Bots 12 and 13 fail closed and output `DATA_UNAVAILABLE` / `NO_TRADE` when Greeks/footprint feeds are absent.

---

## 12. Central Execution Engine and PAPER Safety

- **Single Execution Gateway:** All orders pass through `CentralizedExecutionEngine.execute_order()`.
- **Gates Enforced:**
  - **Gate 0:** Idempotency window ($5\text{s}$) & rate limit ($15$ orders/min).
  - **Gate 1:** Broker connection check (in LIVE mode).
  - **Gate 2:** Market session gate.
  - **Gate 3:** Majority approval voting gate (emergency exit bypasses).
  - **Gate 4:** RMS daily loss limit ($INR -2000$) & max capital check.
  - **Gate 5:** Concurrent open position limit ($5$) & duplicate position conflict check.
  - **Gate 6:** Paper fill simulation with realistic slippage ($0.03\%$).
- **Direct Broker Calls:** Source code inspection confirmed **zero** direct calls to `smart_api.placeOrder` outside the gated live block, which is locked out in PAPER mode.
- **Real Orders Placed:** **0**.

---

## 13. Test Commands, Actual Results, Exit Codes and Skips

| Test Suite / Runner | Command | Exit Code | Pass Count | Fail Count | Execution Time |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Full Automated Pytest Suite** | `python -m pytest` | **0** | **231** | **0** | 15.57s |
| **Phase 12 Dedicated Tests** | `python -m pytest tests/test_phase12_instrument_master_and_feed.py` | **0** | **12** | **0** | 2.74s |
| **Forensic Audit Runner** | `python scratch/phase12_forensic_audit.py` | **0** | **All Sections** | **0** | 3.20s |
| **Deep Verification Runner** | `python scratch/deep_verification_runner.py` | **0** | **5 Sections** | **0** | 1.10s |
| **Runtime Verifier** | `python scratch/phase12_runtime_verifier.py` | **0** | **Evidence JSON**| **0** | 1.50s |
| **Frontend Production Build** | `npm run build` | **0** | **Clean Build** | **0** | 1.72s |

---

## 14. Findings Ranked by Severity

### Critical (0 Findings)
*None.* Zero security leaks, zero real orders placed, zero mode bypasses.

### High (0 Findings)
*None.* No expired contracts eligible for trading; no broken execution gates.

### Medium (2 Findings)
1. **Multi-Segment Token Overlaps in OpenAPI Master:** 9,388 tokens exist across multiple exchange segments (e.g. token 3456 in NSE and CDS). While composite routing `(token, exchangeType)` prevents misrouting in `angel_feed_manager.py`, lookups in `DynamicInstrumentMaster` without explicit `exch_seg` could resolve the wrong segment.
   - *Status:* Mitigated via composite tuple indexing `(token, exch_seg)`.
2. **Crude Oil Near-Month Expiry Tender Window:** Near-month `CRUDEOIL19OCT26FUT` expires on Monday, `19OCT2026`. Next-month contract `19NOV2026` is available in master.
   - *Status:* Intraday trading supported until Monday expiry; roll logic should roll to `19NOV2026` for multi-day holding.

### Low (1 Finding)
1. **Windows `os.makedirs` Path Handling:** Passing a relative path without directory component to `DynamicInstrumentMaster(cache_file="test.json")` caused `os.makedirs("", exist_ok=True)` to raise `FileNotFoundError` on Windows.
   - *Remediation:* Guard `os.path.dirname()` with `if dirname:` before invoking `os.makedirs()`.

---

## 15. Exact Files and Functions Requiring Fixes

1. **`server/instrument_master.py` — Line 326 (`download_and_update`):**
   ```python
   # Current:
   os.makedirs(os.path.dirname(self.cache_file), exist_ok=True)
   
   # Recommended patch:
   cache_dir = os.path.dirname(self.cache_file)
   if cache_dir:
       os.makedirs(cache_dir, exist_ok=True)
   ```
2. **`server/instrument_master.py` — Line 446 (`_index_records`):**
   Ensure composite tuple indexing `(tok, exch_seg)` is always checked first when resolving instruments with duplicate tokens across segments.

---

## 16. Recommended Next Steps

1. **Maintain Strict PAPER Execution:** System is fully functional, safe, and robust in paper trading mode.
2. **Live Feed Unblocking Procedure:**
   - Supply authentic Angel One credentials in `.env` (`ANGEL_API_KEY`, `ANGEL_CLIENT_ID`, `ANGEL_PIN`, `ANGEL_TOTP_SECRET`).
   - Run feed verification during active exchange market hours (Monday–Friday, 09:15–15:30 IST).
   - Confirm receipt of genuine broker ticks matching the 14 dynamically resolved tokens.
3. **Roll Logic Refinement:** Automate contract roll 2 trading days before expiry for MCX commodities.

---

## 17. Explicitly Blocked Checks and Evidence Needed to Unblock

| Blocked Check | Exact Blocker Reason | Evidence Required to Unblock |
| :--- | :--- | :--- |
| **1. Broker SmartAPI Authentication** | Credentials absent (`MISSING_CREDENTIALS`) | Valid `ANGEL_API_KEY`, `ANGEL_CLIENT_ID`, `ANGEL_PIN`, `ANGEL_TOTP_SECRET` in `.env`. |
| **2. Authentic Exchange Ticks** | Exchanges closed (Saturday `MARKET_CLOSED`) | Live trading session (Mon–Fri, 09:15–15:30 IST) with authentic ticks decoded by `handle_binary_tick()`. |
| **3. Live Readiness Gate Unlock** | Fails pre-flight conditions (6/8 failed) | Active authenticated session, fresh live feed, position reconciliation match, and explicit user consent. |
| **4. Live Order Transmission** | Hard-locked in PAPER mode by design | Explicit user consent and full pre-flight readiness gate pass (do not unlock during audit). |

