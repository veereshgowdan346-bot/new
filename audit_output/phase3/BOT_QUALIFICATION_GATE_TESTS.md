# CHINTU AI — BOT QUALIFICATION GATE TEST EVIDENCE

**Date:** 2026-10-18  
**Module Audited:** `server/highest_profit_bot.py`  
**Test Module:** `tests/test_phase3_verification_and_gate.py`  
**Gate Status:** **`LOCKED / NO QUALIFIED BOT`**

---

## 1. Production Database Qualification Evaluation

Command Executed:
```python
from server.highest_profit_bot import get_highest_profit_bot
res = get_highest_profit_bot()
```

### Response Received:
```json
{
  "status": "NO_QUALIFIED_BOT",
  "qualified": false,
  "reason": "No bot meets the qualification criteria (minimum 5 verified closed trades and positive net PnL).",
  "min_qualifying_trades": 5,
  "total_trades_analyzed": 759,
  "highest_profit_bot": null,
  "evaluated_at": "2026-10-18T10:40:28.188448"
}
```

### Per-Bot Ranking & Disqualification Audit on Historical Database:

| Bot ID | Bot Name | Asset | Total Closed | Clean Tape | Quarantined | Synthetic Replays | Authentic Trades | Disqualification Reason |
|---|---|---|---|---|---|---|---|---|
| **1** | Scalper Bot | NIFTY 50 | 213 | 209 | 0 | 209 | **0** | Insufficient clean trades (0/5 authentic required; 209 synthetic excluded) |
| **2** | EMA Trend Bot | NIFTY 50 | 3 | 0 | 3 | 0 | **0** | Insufficient clean trades (0/5 authentic required; 3 quarantined excluded) |
| **3** | RSI Reversal Bot | BANKNIFTY | 25 | 25 | 0 | 25 | **0** | Insufficient clean trades (0/5 authentic required; 25 synthetic excluded) |
| **4** | Breakout Bot | RELIANCE | 40 | 0 | 40 | 34 | **0** | Insufficient clean trades (0/5 authentic required; 34 synthetic, 40 quarantined excluded) |
| **5** | Mean Reversion | HDFCBANK | 20 | 0 | 20 | 17 | **0** | Insufficient clean trades (0/5 authentic required; 17 synthetic, 20 quarantined excluded) |
| **6** | VWAP Momentum | INFY | 15 | 0 | 15 | 13 | **0** | Insufficient clean trades (0/5 authentic required; 13 synthetic, 15 quarantined excluded) |
| **7** | Volume Spike Bot | TCS | 10 | 0 | 10 | 8 | **0** | Insufficient clean trades (0/5 authentic required; 8 synthetic, 10 quarantined excluded) |
| **8** | SuperTrend Wave | CRUDEOIL | 8 | 0 | 8 | 7 | **0** | Insufficient clean trades (0/5 authentic required; 7 synthetic, 8 quarantined excluded) |
| **9** | Bollinger Band Squeeze | GOLD | 6 | 0 | 6 | 5 | **0** | Insufficient clean trades (0/5 authentic required; 5 synthetic, 6 quarantined excluded) |
| **10** | Pivot Point Reversal | SILVER | 5 | 5 | 0 | 5 | **0** | Insufficient clean trades (0/5 authentic required; 5 synthetic excluded) |
| **11** | Multi-Timeframe Confluence | NIFTY 50 | 3 | 3 | 0 | 3 | **0** | Insufficient clean trades (0/5 authentic required; 3 synthetic excluded) |
| **12** | Options Gamma Scalper | NIFTY Options | 0 | 0 | 0 | 0 | **0** | No trade history recorded |
| **13** | Order Flow Imbalance | BANKNIFTY Futures | 0 | 0 | 0 | 0 | **0** | No trade history recorded |
| **14** | Risk Neutral Delta Hedger | NIFTY Portfolio | 0 | 0 | 0 | 0 | **0** | No trade history recorded |

**Audit Conclusion:** Exactly **0 of 14 bots qualify**. Synthetic replays no longer slip past the qualification gate.

---

## 2. Exploratory Dataset Qualification Evaluation

Command Executed:
```python
res = get_highest_profit_bot(db_path='server/data/exploratory_paper.db')
```

### Response Received:
```json
{
  "status": "NO_QUALIFIED_BOT",
  "qualified": false,
  "reason": "No bot meets the qualification criteria (minimum 5 verified closed trades and positive net PnL).",
  "min_qualifying_trades": 5,
  "total_trades_analyzed": 65,
  "highest_profit_bot": null
}
```

### Evaluation Breakdown:
- Total trades analyzed: 65
- Provenance: `SYNTHETIC_SIMULATION` (all 65 trades)
- Verified authentic trades: 0 for all 14 bots
- Synthetic trades: 65
- Qualified bots: **0 of 14**

---

## 3. Automated Test Evidence from `test_phase3_verification_and_gate.py`

| Test Name | Assertion Tested | Result |
|---|---|---|
| `test_unconfirmed_real_broker_fails_closed` | Ensures unconfirmed `REAL_BROKER_EXECUTION` claims fail closed to `MOCK_BROKER` or `UNKNOWN_PROVENANCE` | **PASSED** |
| `test_script_simulation_classified_as_synthetic_simulation` | Confirms `EXP_ORD` and randomized slippage records are classified as `SYNTHETIC_SIMULATION` | **PASSED** |
| `test_production_database_returns_no_qualified_bot` | Asserts `get_highest_profit_bot()` returns `status: NO_QUALIFIED_BOT` on `server/chintu_memory.db` | **PASSED** |
| `test_exploratory_database_returns_no_qualified_bot` | Asserts `get_highest_profit_bot()` returns `status: NO_QUALIFIED_BOT` on `server/data/exploratory_paper.db` | **PASSED** |
| `test_bot_qualifies_only_with_authentic_trades` | Tests that Bot 1 with 10 synthetic replays fails to qualify; Bot 2 with 4 authentic trades fails; Bot 2 with 6 authentic trades qualifies | **PASSED** |
| `test_angel_one_feed_credentials_and_market_state` | Verifies safe inspection of feed status and market state without credential leakage | **PASSED** |

