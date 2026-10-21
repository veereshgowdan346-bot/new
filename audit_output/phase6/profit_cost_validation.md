# CHINTU AI — PHASE 6 REALISTIC PROFIT & COST VALIDATION
## Statutory Charges, Turnover Rules, Bid-Ask Spread & Slippage Friction

**Audit Date:** 2026-10-18  
**Regulatory Framework:** SEBI Master Circulars, NSE / BSE Transaction Schedules, Ministry of Finance Stamp Duty & STT Rules  

---

### 1. Regulatory Fee Schedule Breakdown

All transaction costs in Chintu AI are computed using Python `Decimal` arithmetic with `ROUND_HALF_UP` quantizing to avoid penny rounding drift. 

| Fee Component | Statutory Base Rate | Round-Trip Treatment | Indian Market Authority Source |
| :--- | :--- | :--- | :--- |
| **Brokerage** | Flat ₹20 per order leg or 0.03% (whichever is lower) | Levied on Buy and Sell legs (Max ₹40 round trip) | Discount Broker Standard (Angel One) |
| **STT / CTT (Equity Intraday)** | 0.025% | Levied on **Sell side only** | Finance Act / CBDT Rules |
| **STT (Index/Stock Futures)** | 0.0125% (pre-Oct 2024) / 0.020% (revised) | Levied on **Sell side only** | SEBI Master Circular on Derivatives |
| **STT (Options Premium)** | 0.0625% (or 0.10% revised) | Levied on **Sell side Option Premium only** | SEBI Circular SEBI/HO/MRD/DoP2 |
| **CTT (MCX Commodity Futures)** | 0.010% | Levied on **Sell side only** | Ministry of Finance Commodity Tax |
| **Exchange Turnover Charges** | NSE Equity: 0.00325%<br>NSE Futures: 0.00190%<br>NSE Options: 0.050% (on Premium)<br>MCX: 0.00210%<br>NSE Currency: 0.00090% | Levied on total turnover (Buy + Sell legs) | NSE & BSE Circulars |
| **SEBI Turnover Charges** | ₹10 per crore (0.00010%) | Levied across all round-trip turnover | SEBI Circular CIR/MRD/DP/18/2007 |
| **GST (Goods & Services Tax)** | 18.0% | Levied on (Brokerage + Exchange Fees + SEBI Fees) | GST Council / CBIC Schedule |
| **Stamp Duty** | Equity Intraday: 0.003%<br>Futures: 0.002%<br>Options Premium: 0.003%<br>Commodity: 0.002%<br>Currency: 0.0001% | Levied on **Buy side only** | Indian Stamp Act (Amended 2020) |

---

### 2. Option Premium Turnover & Quarantine Rule

> [!IMPORTANT]
> **Strict Options Turnover Invariant:**
> Options turnover is ALWAYS calculated on Option Premium ($\text{Price} \times \text{Qty}$), NEVER on the underlying index spot or strike value.
>
> If an option contract is submitted with an underlying index price (e.g. $> ₹2,000$ for NIFTY 50), the regulatory charge engine automatically **QUARANTINES** the record as `AMBIGUOUS_INDEX_AS_OPTION_PREMIUM` to prevent false multi-crore phantom turnover calculations.

---

### 3. Market Friction: Spread & Slippage Deduction

Before any trade is approved by the Master Brain, realistic execution drag is deducted from expected gross reward:

$$\text{Gross Reward} = |\text{Target} - \text{Entry}| \times \text{Qty}$$
$$\text{Gross Risk} = |\text{Entry} - \text{StopLoss}| \times \text{Qty}$$
$$\text{Market Friction} = \text{Statutory Fees} + (\text{Turnover} \times \text{SpreadPct}) + (\text{Turnover} \times \text{SlippagePct})$$
$$\text{Net Reward} = \text{Gross Reward} - \text{Market Friction}$$
$$\text{Net Risk} = \text{Gross Risk} + \text{Market Friction}$$
$$\text{Net Reward-to-Risk Ratio} = \frac{\text{Net Reward}}{\text{Net Risk}}$$

---

### 4. Trade Rejection Invariants

1. **Negative Net Edge Rejection:** If $\text{Net Reward} \le 0.00$, the trade is vetoed with reason `NEGATIVE_OR_INSUFFICIENT_NET_PROFIT`. Gross profit is NEVER reported as net profit.
2. **Minimum Reward-to-Risk Gate:** If $\text{Net Reward-to-Risk} < 1.20$, the setup is rejected to prevent trades where transaction drag disproportionately damages account expectancy.
3. **Quarantine Fail-Closed:** If any component cannot be derived or instrument metadata is quarantined, the trade is rejected.

