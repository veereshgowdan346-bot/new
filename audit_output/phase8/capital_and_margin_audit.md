# CHINTU AI — PHASE 8 CAPITAL & MARGIN AUDIT REPORT
**Audit Date:** 2026-10-18  
**Scope:** Capital-Aware Risk Limits, Margin Verification, Dual-Constraint Position Sizing, and Pre-Order Gate Validation  
**Execution Environment:** Isolated Test Fixture / Production Database Read-Only  
**Status:** VERIFIED & HARDENED

---

## 1. Executive Summary

In Phase 8, the centralized risk management and execution engines were audited and strictly aligned with realistic capital constraints. Previously, Phase 7 relaxed default limits (₹200,000 per bot, ₹500,000 per account, and 10 open positions) to facilitate integration tests. In Phase 8, strict capital-aware risk safety has been restored:

1. **Default Account Capital:** Re-anchored to the user's authentic configured capital baseline (**₹20,000.00**).
2. **Account Capital Segregation:** Strict separation between configured account capital, available funds, available margin, and stop-loss risk budget.
3. **Pre-Order Margin Check:** Gate 4 deterministically rejects orders requiring margin exceeding available funds/capital (e.g. NIFTY futures requiring ₹171,500 margin against a ₹20,000 account are rejected with `MARGIN_EXCEEDS_CAPITAL`).
4. **Dual-Constraint Position Sizing:** Position sizing enforces both risk-based budgeting (default 1% per trade = ₹200) and available margin budgeting, quantizing strictly downward to instrument lotsizes and returning `0` if unable to afford a single lot.
5. **Symbol Collision Fix:** Resolved symbol suffix collision where equity stocks ending in "CE" (such as `RELIANCE`) were falsely identified as options and charged 100% option premium turnover.
6. **Zero/Negative Capital Safety:** Sizing engine fails closed with `0` quantity on zero, negative, or `NaN` capital inputs.

---

## 2. Capital & Risk Allocation Architecture

```
+--------------------------------------------------------------------------------+
|                         USER CONFIGURED CAPITAL: ₹20,000                       |
+---------------------------------------+----------------------------------------+
                                        |
                 +----------------------+----------------------+
                 |                                             |
                 v                                             v
+---------------------------------+           +---------------------------------+
|      AVAILABLE MARGIN GATES     |           |     PER-TRADE RISK BUDGET       |
|  - Max per-trade margin: ₹10,000|           |  - Max risk per trade: 1.0%     |
|  - Max open positions: 5        |           |    (₹200 on ₹20,000 capital)    |
|  - Max aggregate margin: ₹20,000|           |  - Sizing = min(Margin, Risk)   |
+---------------------------------+           +---------------------------------+
                 |                                             |
                 +----------------------+----------------------+
                                        |
                                        v
                    +---------------------------------------+
                    |       LOTSIZE QUANTIZATION GATE       |
                    |  - Rounded down to lotsize multiple   |
                    |  - If affordable lots < 1: Return 0   |
                    +---------------------------------------+
```

### Key Parameter Baselines

| Parameter | Configured Value | Enforcement Gate | Verification Status |
| :--- | :--- | :--- | :--- |
| **Account Capital Baseline** | ₹20,000.00 | RMS Config / DB | PASS |
| **Max Allocation Per Bot** | ₹10,000.00 (50%) | Gate 5 Allocation Check | PASS |
| **Max Allocation Per Trade** | ₹10,000.00 (50%) | Gate 4 Margin Check | PASS |
| **Max Open Positions** | 5 concurrent | Gate 7 Fleet Limit | PASS |
| **Max Risk Per Trade** | 1.0% (₹200.00) | Position Sizing Engine | PASS |
| **Min Reward-to-Risk** | 1.20 | Gate 8 Expectancy Check | PASS |
| **Max Daily Loss** | ₹2,000.00 (10%) | Circuit Breaker | PASS |
| **Max Drawdown** | ₹4,000.00 (20%) | Circuit Breaker | PASS |

---

## 3. Position Sizing & Lot Size Quantization

The position sizing algorithm in `server/centralized_risk_manager.py` implements dual-constraint sizing:

$$\text{Risk Quantity} = \left\lfloor \frac{\text{Capital} \times \text{Risk Pct}}{|\text{Entry} - \text{Stop Loss}| \times \text{Lot Size}} \right\rfloor \times \text{Lot Size}$$

$$\text{Margin Quantity} = \left\lfloor \frac{\text{Max Trade Allocation}}{\text{Margin Per Unit} \times \text{Lot Size}} \right\rfloor \times \text{Lot Size}$$

$$\text{Final Sized Quantity} = \min(\text{Risk Quantity}, \text{Margin Quantity})$$

### Empirical Verification Test Cases

| Scenario | Capital | Instrument | Entry | SL | Required Margin / Unit | Sized Qty | Result & Rationale |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **NIFTY Futures at ₹20k** | ₹20,000 | NIFTY24OCTFUT (Lot 50) | 24,500 | 24,350 | ₹3,430 (14%) | 0 | Margin for 1 lot = ₹171,500 > ₹20,000 capital. Sizing returns 0. |
| **RELIANCE Equity at ₹20k** | ₹20,000 | RELIANCE (Lot 1) | 2,900 | 2,850 | ₹580 (20% intraday) | 4 | Risk budget ₹200 / ₹50 risk = 4 shares. Margin ₹2,320 <= ₹10,000. Sized: 4. |
| **NIFTY Call Option at ₹20k** | ₹20,000 | NIFTY24OCT24500CE (Lot 75) | 120 | 90 | ₹120 (100% premium) | 0 | 1 lot risk = 75 * 30 = ₹2,250 > ₹200 risk budget. Sizing returns 0. |
| **Zero Capital Input** | ₹0.00 | RELIANCE (Lot 1) | 2,900 | 2,850 | ₹580 | 0 | Fails closed on zero capital. |
| **Negative Capital Input** | -₹5,000 | RELIANCE (Lot 1) | 2,900 | 2,850 | ₹580 | 0 | Fails closed on negative capital. |
| **NaN Capital Input** | NaN | RELIANCE (Lot 1) | 2,900 | 2,850 | ₹580 | 0 | Fails closed on NaN capital. |

---

## 4. Margin Engine Repair: Option Symbol Disambiguation

### Defect Identified
The margin calculation function previously inspected symbols using:
```python
if sym_up.endswith("CE") or sym_up.endswith("PE"):
    # Treated as Option: 100% turnover premium
```
Because the cash equity symbol `RELIANCE` ends with the English letters `CE`, the equity was mistakenly classified as an Option. A single share at ₹2,900 was treated as requiring ₹2,900 cash turnover instead of the 20% intraday equity margin (₹580).

### Remediation Applied
In `server/centralized_risk_manager.py`:
```python
# Disambiguate options by checking for strike/digit followed by CE or PE
is_option_contract = bool(re.search(r'(\d+|\s)(CE|PE)$', sym_up)) or ("OPTION" in seg_upper)
```
This regex requires digits or whitespace immediately preceding `CE` or `PE`, correctly classifying option contracts like `NIFTY24OCT24500CE` while keeping cash equities like `RELIANCE` correctly classified under equity intraday rules.

---

## 5. Pre-Order RMS Rejection Verification

All pre-order validation gates were verified in `tests/test_phase8_capital_aware_risk_and_readiness.py`:
- `test_unaffordable_nifty_future_rejected_at_20k_capital`: Passed. Order rejected with `MARGIN_EXCEEDS_CAPITAL`.
- `test_affordable_equity_passes_all_pre_trade_gates`: Passed. Order approved with status `APPROVED`.
- `test_max_open_positions_enforced`: Passed. 6th concurrent position rejected with `MAX_OPEN_POSITIONS_REACHED`.
- `test_existing_positions_preservation_without_mutation`: Passed. Existing 5 database positions are preserved read-only without tampering.

---

## 6. Audit Conclusion
The capital-aware risk safety mechanisms are fully hardened and operate deterministically:
- Capital default is restored to ₹20,000.
- Sizing strictly respects capital constraints and lot sizes.
- Unaffordable instruments fail closed.
- Production database remains pristine.

