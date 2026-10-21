# CHINTU AI — PHASE 10 DATABASE DISCREPANCY & FORENSIC RESOLUTION
**Audit Date:** 2026-10-18  
**Audit Protocol:** Deep Read-Only Forensic Analysis (`file:server/chintu_memory.db?mode=ro`, `PRAGMA query_only = ON`)  
**Investigated Files:**
- Production Database: `server/chintu_memory.db`
- Baseline Backup: `backups/defect_repair_baseline/chintu_memory.db`
- Pre-Phase 2 Backup: `backups/chintu_memory_pre_phase2.db`  
**Discrepancy Investigation Status:** **RESOLVED & PROVEN | PRODUCTION PRESERVED**

---

## 1. Executive Summary & Root Cause Resolution

In Phase 9, a discrepancy was discovered: production `server/chintu_memory.db` contains 19 rows in `positions_memory`, whereas the backup file `backups/defect_repair_baseline/chintu_memory.db` contains 18 rows. Furthermore, the backup hash (`262f1c0f78abe0e00555b97fc5f7f27dfa57c345d5f22fa084c4e504ae95fe33`) differed from the production hash (`441898d996139e2f407e864b8ceba516d58044dff441e2fee44afd981570cc78`).

Phase 10 performed an exhaustive row-level, timestamp-by-timestamp forensic investigation across all databases and historical logs. The root cause has been definitively identified:

1. **Exact Row-Level Difference Identified:**
   - At timestamp `2026-10-18T11:52:12.789676`, paper entry order `ORD-1-d47568d0274e` was placed for **Bot 1** on **TCS** (`BUY 10 @ ₹3,801.14`). This created row **ID 687** (`POS_1792304532827`) in `positions_memory` with status `OPEN`.
   - At timestamp `2026-10-18T11:58:19.175116`, historical position **ID 1** (`NIFTY 50`, `Bot 1`, `50 units`) was transitioned from `OPEN` to `CLOSED`.
   - Simultaneously, positions **ID 2** and **ID 53** had their `closed_at` and `updated_at` timestamps refreshed during position reconciliation.
2. **Timing of the Backup Snapshot:**
   - The backup `backups/defect_repair_baseline/chintu_memory.db` was created at **07:14:45 IST on Oct 18, 2026**—prior to the 11:52–11:58 paper reconciliation test.
   - Consequently, the backup captured the state *before* position 687 was added and position 1 was closed.
3. **Historical Trade Immutability:**
   - In both databases, table `trade_memory` contains **exactly 759 rows**.
   - A bit-for-bit, column-by-column diff confirmed that all 759 rows are **100% identical**. The entry order `ORD-1-d47568d0274e` opened a position without closing one, so no trade record was created, leaving `trade_memory` entirely unaffected.
4. **Active Open Position Parity:**
   - In both databases, the number of active open positions is **identically 5**:
     - Baseline (07:14): IDs 1 (NIFTY), 43 (TATA MOTORS), 44 (RELIANCE), 356 (TATA MOTORS), 378 (FINNIFTY).
     - Production (11:58): IDs 43 (TATA MOTORS), 44 (RELIANCE), 356 (TATA MOTORS), 378 (FINNIFTY), 687 (TCS).
   - In both states, total open positions never exceeded the 5 concurrent positions ceiling.
5. **Auditor Confusion in Earlier Phases:**
   - In Phase 7, the auditor recorded that `backups/defect_repair_baseline` had hash `441898d9...`. That auditor incorrectly copied the hash of `server/chintu_memory.db` into the report without independently computing the SHA-256 of the backup file itself.
   - The production database was never mutated during Phases 7, 8, 9, or 10.

---

## 2. Row-Level Forensic Diff

```
========================================================================================================================
ROW ID  SYMBOL         BOT           QTY   STATUS (BASE)  STATUS (PROD)  OPENED AT                     CLOSED AT (PROD)
========================================================================================================================
ID 1    NIFTY 50       Bot 1          50   OPEN           CLOSED         2026-10-17T18:21:11.640678    2026-10-18T11:58:19.175116
ID 2    BANKNIFTY      Bot 2          25   CLOSED         CLOSED         2026-10-17T18:21:11.593229    2026-10-18T11:58:19.175116 (Timestamp refreshed)
ID 43   TATA MOTORS    Breakout Bot   40   OPEN           OPEN           2026-10-17T18:21:11.593229    None (IDENTICAL)
ID 44   RELIANCE       RSI Reversal   10   OPEN           OPEN           2026-10-17T18:21:11.593229    None (IDENTICAL)
ID 53   FINNIFTY       Bot 5          40   CLOSED         CLOSED         2026-10-17T18:21:11.593229    2026-10-18T11:58:19.175116 (Timestamp refreshed)
ID 135  RELIANCE       Bot 3          10   CLOSED         CLOSED         2026-10-17T18:21:11.593229    2026-10-17T18:21:11.593229 (IDENTICAL)
ID 136  RELIANCE       Bot 1           1   CLOSED         CLOSED         2026-10-17T18:21:11.593229    2026-10-17T18:21:11.593229 (IDENTICAL)
ID 141  INFY           Bot 1           1   CLOSED         CLOSED         2026-10-17T18:21:11.593229    2026-10-17T18:21:11.593229 (IDENTICAL)
ID 156  TATA MOTORS    Bot 1           1   CLOSED         CLOSED         2026-10-17T18:21:11.593229    2026-10-17T18:21:11.593229 (IDENTICAL)
ID 168  TEST_TELE_1    Bot 1          10   CLOSED         CLOSED         2026-10-17T18:21:11.593229    2026-10-17T18:21:11.593229 (IDENTICAL)
ID 169  TEST_TELE_2    Bot 2          20   CLOSED         CLOSED         2026-10-17T18:21:11.593229    2026-10-17T18:21:11.593229 (IDENTICAL)
ID 356  TATA MOTORS    Bot 4          10   OPEN           OPEN           2026-10-17T18:21:11.593229    None (IDENTICAL)
ID 376  NIFTY OPTIONS  Bot 12         75   CLOSED         CLOSED         2026-10-17T18:21:11.593229    2026-10-17T18:21:11.593229 (IDENTICAL)
ID 377  CRUDE OIL      Bot 8         100   CLOSED         CLOSED         2026-10-17T18:21:11.593229    2026-10-17T18:21:11.593229 (IDENTICAL)
ID 378  FINNIFTY       Bot 5          60   OPEN           OPEN           2026-10-17T18:21:11.593229    None (IDENTICAL)
ID 383  HDFCBANK       Bot 6         100   CLOSED         CLOSED         2026-10-17T18:21:11.593229    2026-10-17T18:21:11.593229 (IDENTICAL)
ID 385  USDINR         Bot 11       1000   CLOSED         CLOSED         2026-10-17T18:21:11.593229    2026-10-17T18:21:11.593229 (IDENTICAL)
ID 387  BANKNIFTY      Bot 2           1   CLOSED         CLOSED         2026-10-17T18:21:11.593229    2026-10-17T18:21:11.593229 (IDENTICAL)
ID 687  TCS            Bot 1          10   [NOT IN BASE]  OPEN           2026-10-18T11:52:12.827442    None [EXTRA ROW IN PRODUCTION]
========================================================================================================================
```

---

## 3. Order Trail Corroboration

The creation of Position ID 687 in `positions_memory` corresponds exactly to Order ID 1748 in `orders_memory`:

```json
{
  "id": 1748,
  "order_id": "ORD-1-d47568d0274e",
  "client_order_id": "ORD-1-d47568d0274e",
  "bot": "Bot 1",
  "symbol": "TCS",
  "action": "BUY",
  "qty": 10,
  "price": 3801.14,
  "ordertype": "MARKET",
  "producttype": "INTRADAY",
  "status": "FILLED",
  "mode": "PAPER",
  "broker": "Paper Simulator",
  "created_at": "2026-10-18T11:52:12.789676"
}
```

This confirms beyond doubt that the additional row was produced by a legitimate, deterministic paper order simulation on Oct 18 at 11:52 IST.

---

## 4. Cryptographic Database Hash Register

| Database File | File Size (Bytes) | SHA-256 Digest | State Description |
| :--- | :---: | :--- | :--- |
| **`server/chintu_memory.db`** | **1,306,624** | `441898d996139e2f407e864b8ceba516d58044dff441e2fee44afd981570cc78` | **Authentic Production Database (Post-11:58 IST state). Immutable throughout Phases 7–10.** |
| **`backups/defect_repair_baseline/chintu_memory.db`** | **1,306,624** | `262f1c0f78abe0e00555b97fc5f7f27dfa57c345d5f22fa084c4e504ae95fe33` | **Pre-Phase 2 Baseline Backup (Created 07:14 IST Oct 18). Preserved without mutation.** |
| **`backups/chintu_memory_pre_phase2.db`** | **1,306,624** | `262f1c0f78abe0e00555b97fc5f7f27dfa57c345d5f22fa084c4e504ae95fe33` | **Bit-for-bit identical to defect_repair_baseline.** |

---

## 5. Non-Destructive Invariant Compliance

- [x] **No Database Overwrite:** The baseline backup was strictly preserved and never copied over `server/chintu_memory.db`.
- [x] **Zero Production Tampering:** `server/chintu_memory.db` maintained SHA-256 `441898d996139e2f407e864b8ceba516d58044dff441e2fee44afd981570cc78` through all operations.
- [x] **Trade Immutability:** All 759 `trade_memory` records remain completely identical.
- [x] **Audit Integrity:** The historical timeline and exact order-level events causing the row count variance have been completely accounted for and evidenced.

---

## 6. Audit Verdict
**DISCREPANCY RESOLVED & ACCOUNTED FOR.**  
The 19-row production database is the authoritative current operational database. The 18-row backup is an earlier 07:14 IST snapshot. Both databases share 100% identical trade history (759 rows) and 5 active open positions.

