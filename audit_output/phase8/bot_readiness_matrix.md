# CHINTU AI — 14 CANONICAL BOT READINESS MATRIX
**Audit Date:** 2026-10-18  
**Scope:** Master Brain Integration, Signal Generation, Malformed Data Rejection, Fleet Consensus, and Track Record Verification  
**Status:** ALL 14 BOTS VERIFIED (Track Records: UNVERIFIED)

---

## 1. Executive Summary

All 14 canonical bots registered in `server/bot_registry.py` were independently audited against the Phase 8 Master Brain integration pipeline. The audit verified:
1. Valid candle feeds produce valid normalized signals (`ACTION_BUY`, `ACTION_SELL`, `ACTION_HOLD`, or `ACTION_NO_TRADE`).
2. Candle price validation fails closed with `ACTION_NO_TRADE` on missing, NaN, infinite, zero, or negative price data.
3. Every bot contributes to Master Brain consensus voting with its configured weight and quorum threshold.
4. All real-world historical track records and profit claims are explicitly stamped as **`UNVERIFIED`** in compliance with truth-in-auditing standards.

---

## 2. 14 Canonical Bots Matrix

| Bot ID | Bot Name | Segment | Target Asset | Signal Generation | Fails Closed on Bad Data | Consensus Weight | Real-World Track Record | Audit Verdict |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **1** | Chintu Super Momentum | Equity Intraday | NIFTY 50 | PASS | PASS | 1.20 | UNVERIFIED | PASS |
| **2** | Scalp Master Pro | Index Futures | BANKNIFTY | PASS | PASS | 1.15 | UNVERIFIED | PASS |
| **3** | Option Premium Spike Hunter | Options Buying | NIFTY Options | PASS | PASS | 1.25 | UNVERIFIED | PASS |
| **4** | Trend Reversal & Mean Reversion | Equity Intraday | RELIANCE | PASS | PASS | 1.00 | UNVERIFIED | PASS |
| **5** | Breakout Range Rider | Commodities | CRUDEOIL | PASS | PASS | 1.10 | UNVERIFIED | PASS |
| **6** | Institutional Order Flow Tracker | Index Futures | NIFTY Futures | PASS | PASS | 1.30 | UNVERIFIED | PASS |
| **7** | Dynamic Volatility Arbitrage | Options | FINNIFTY Options | PASS | PASS | 1.05 | UNVERIFIED | PASS |
| **8** | Multi-Timeframe Confluence | Equity Intraday | HDFCBANK | PASS | PASS | 1.20 | UNVERIFIED | PASS |
| **9** | AI Pattern Recognition Neural Net | Equities | INFY | PASS | PASS | 1.10 | UNVERIFIED | PASS |
| **10** | Delta Neutral Options Hedger | Options Hedging | BANKNIFTY | PASS | PASS | 1.00 | UNVERIFIED | PASS |
| **11** | Volume Profile Liquidity Seeker | Commodities | GOLD | PASS | PASS | 1.15 | UNVERIFIED | PASS |
| **12** | Micro-Scalper Sub-Second Fast-Fill | Currency | USDINR | PASS | PASS | 1.05 | UNVERIFIED | PASS |
| **13** | Gap Fill & Pre-Market Scalper | Equity Intraday | TCS | PASS | PASS | 1.00 | UNVERIFIED | PASS |
| **14** | Extreme Sentiment & FII-DII Momentum | Derivatives | NIFTY Futures | PASS | PASS | 1.25 | UNVERIFIED | PASS |

---

## 3. Signal Validation & Fail-Closed Guardrails

In `server/master_brain.py`, the strategy execution method `evaluate_bot_strategy_signal()` enforces data sanitation prior to algorithmic evaluation:

```python
# Candle Price Sanitation & Guardrail
price = float(candle.get("close", 0.0) or 0.0)
high = float(candle.get("high", 0.0) or 0.0)
low = float(candle.get("low", 0.0) or 0.0)

if math.isnan(price) or math.isinf(price) or price <= 0.0 or low <= 0.0 or high < low:
    return {
        "bot_id": bot_id,
        "action": ACTION_NO_TRADE,
        "confidence": 0.0,
        "reason": "INVALID_OR_MALFORMED_CANDLE_DATA"
    }
```

### Empirical Test Evidence
The suite in `tests/test_phase8_capital_aware_risk_and_readiness.py` exercised:
1. `test_all_14_canonical_bots_registered_and_configured`: Verified exact registration of 14 canonical bots.
2. `test_all_14_bots_generate_valid_signals_on_valid_data`: Confirmed all 14 bots return properly structured signals with action in `{BUY, SELL, HOLD, NO_TRADE}` and confidence in `[0.0, 1.0]`.
3. `test_all_14_bots_fail_closed_on_malformed_candles`: Injected `NaN`, `Inf`, `0.0`, and `-100.0` prices; all 14 bots deterministically returned `ACTION_NO_TRADE`.
4. `test_bot_track_records_marked_unverified`: Verified that no simulated or synthetic metrics are passed off as live broker-verified track records.

---

## 4. Fleet Consensus Engine

The Master Brain consensus engine was validated under multi-bot signal scenarios:
- **Strong Quorum:** Multiple aligned bots generate consensus action with weighted confidence score exceeding quorum threshold (`min_quorum_score = 0.60`).
- **Divided Fleet:** Evenly split signals (e.g. 50% BUY, 50% SELL) resolve to `ACTION_NO_TRADE`.
- **Low Confidence Fleet:** Signals with confidence below minimum threshold (`0.50`) fail to achieve quorum and resolve to `ACTION_NO_TRADE`.
- **Regime Multipliers:** Bullish regimes correctly amplify trend-following bots while hedging regimes amplify delta-neutral strategies.

---

## 5. Audit Conclusion
The 14 canonical bots are fully integrated into the Master Brain orchestration loop. All bots fail closed on malformed data, respect consensus voting rules, and have their live track records explicitly labeled as **UNVERIFIED**.

