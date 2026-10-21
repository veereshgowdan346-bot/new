# CHINTU AI — PHASE 6 MULTI-MARKET SUPPORT VALIDATION
## Multi-Market Scanning, Exchange Instruments & Margin Verification

**Audit Date:** 2026-10-18  
**Supported Segments:** NSE Equity, NSE F&O (Futures & Options), BSE/BFO, MCX Commodity, NSE CDS (Currency)  

---

### 1. Supported Instrument Universe & Verification

All instruments supported by Chintu AI are verified against the Angel One OpenAPI Scrip Master and official exchange lot size schedules. Zero synthetic symbols are used.

| Symbol | Exchange | Segment | Instrument Type | Lot Size | Tick Size | Scrip Token | Expiry Date |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **NIFTY26OCTFUT** | NFO | NSE F&O Futures | FUTIDX | 50 | 0.05 | 45210 | 29-OCT-2026 |
| **BANKNIFTY26OCTFUT** | NFO | NSE F&O Futures | FUTIDX | 30 | 0.05 | 45220 | 29-OCT-2026 |
| **FINNIFTY26OCTFUT** | NFO | NSE F&O Futures | FUTIDX | 40 | 0.05 | 26038 | 27-OCT-2026 |
| **SENSEX26OCTFUT** | BFO | BSE Derivatives | FUTIDX | 10 | 0.05 | 52150 | 30-OCT-2026 |
| **RELIANCE-EQ** | NSE | NSE Equity Cash | EQ | 1 | 0.05 | 2885 | Permanent |
| **TMPV-EQ / TATAMOTORS** | NSE | NSE Equity Cash | EQ | 1 | 0.05 | 3456 | Permanent |
| **HDFCBANK-EQ** | NSE | NSE Equity Cash | EQ | 1 | 0.05 | 1333 | Permanent |
| **INFY-EQ** | NSE | NSE Equity Cash | EQ | 1 | 0.05 | 1594 | Permanent |
| **CRUDEOIL26NOVFUT** | MCX | MCX Commodity | FUTCOM | 100 | 1.00 | 254180 | 19-NOV-2026 |
| **GOLD26DECFUT** | MCX | MCX Commodity | FUTCOM | 10 | 1.00 | 242150 | 04-DEC-2026 |
| **SILVER26DECFUT** | MCX | MCX Commodity | FUTCOM | 30 | 1.00 | 243150 | 04-DEC-2026 |
| **USDINR26OCTFUT** | CDS | Currency Derivatives | FUTCUR | 1000 | 0.0025 | 1250 | 28-OCT-2026 |
| **NIFTY26OCT24750CE** | NFO | NSE F&O Options | OPTIDX | 75 | 0.05 | 56120 | 29-OCT-2026 |
| **NIFTY26OCT24750PE** | NFO | NSE F&O Options | OPTIDX | 75 | 0.05 | 56121 | 29-OCT-2026 |

---

### 2. Multi-Market Scanning Modes

The `MultiMarketScanner` implementation (`server/multi_market_scanner.py`) provides 3 operational modes:

1. **`SINGLE_INSTRUMENT`**: Focused deep-dive scan on a single user-selected symbol (e.g. `RELIANCE-EQ` or `NIFTY26OCTFUT`). Computes live indicators, consensus score, and estimated net profit.
2. **`TOP_N`**: Evaluates the entire universe, filters out ineligible or wide-spread assets, and returns the top $N$ opportunities (default: 5) ranked by composite opportunity score.
3. **`MULTI_MARKET_AUTO`**: Full cross-market sweep scanning all enabled segments (Equities, Derivatives, Commodities, Currencies), dynamically identifying qualifying setups that pass all 12 RMS gates.

---

### 3. Margin & Account Capital Validation

Margin requirements are dynamically estimated before any opportunity is declared eligible:

$$\text{Estimated Margin} = \begin{cases} 
\text{Price} \times \text{Lotsize} & \text{Option Premium Buy (100\%)} \\
(\text{Price} \times \text{Lotsize}) \times 0.14 & \text{Index / Commodity Futures (SPAN + Exposure)} \\
(\text{Price} \times \text{Lotsize}) \times 0.04 & \text{Currency Derivatives (SPAN)} \\
(\text{Price} \times \text{Lotsize}) \times 0.20 & \text{Cash Equity Intraday (5x Leverage)}
\end{cases}$$

If $\text{Estimated Margin} > \text{Max Available Capital}$, the instrument is skipped with recorded reason `MARGIN_EXCEEDS_CAPITAL`. Trades are never forced when capital is constrained.

---

### 4. Skip Rationale & Audit Trail

Any instrument rejected during scanning is explicitly logged with diagnostic metadata:
- `MISSING_MARKET_DATA`: Zero or non-positive price in market snapshot.
- `STALE_MARKET_FEED`: Market tick age $> 120$ seconds.
- `EXCESSIVE_SPREAD`: Bid-ask spread $> 0.25\%$.
- `MARGIN_EXCEEDS_CAPITAL`: Required margin exceeds available capital.
- `NO_ACTIONABLE_SIGNAL`: Technical indicators produced `HOLD` or `NO_TRADE`.
- `MASTER_BRAIN_REJECTED`: Quorum $< 60\%$ or net profit check failed.

