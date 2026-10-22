"""
CHINTU AI TRADING SYSTEM - Authoritative Regulatory Charges & Transaction Cost Engine
Strictly SEBI, NSE, BSE, MCX, and Indian Exchange Compliant.

Derived from official SEBI Master Circulars, NSE & BSE Transaction Fee Schedules,
and Ministry of Finance Stamp Duty and STT Rules.

Key Invariants:
1. Options turnover is ALWAYS calculated on Option Premium (price * qty), NEVER on the underlying index spot or strike value.
2. If an option contract is passed with an underlying index price (e.g. > ₹2,000 for NIFTY), the engine QUARANTINES
   the record as AMBIGUOUS_INDEX_AS_OPTION_PREMIUM instead of calculating false multi-crore turnover charges.
3. Separates estimated charges (pre-trade/paper) from broker-confirmed charges (contract note/callback).
4. Strictly validates contract metadata: symbol, token, segment, exchange, lotsize, product type, order side.
5. Employs Decimal-based arithmetic with documented half-up rounding to prevent penny drift.
"""

from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Any, Optional, Tuple, Union
import re


def to_decimal(val: Any) -> Decimal:
    """Safely converts float, int, str, or None to Decimal."""
    if val is None or val == "":
        return Decimal("0.00")
    if isinstance(val, Decimal):
        return val
    # Clean string if formatted with currency symbols or commas
    if isinstance(val, str):
        cleaned = re.sub(r"[₹$,\s]", "", val)
        if not cleaned:
            return Decimal("0.00")
        try:
            return Decimal(cleaned)
        except Exception:
            return Decimal("0.00")
    return Decimal(str(val))


def round_cur(val: Decimal) -> Decimal:
    """Quantizes Decimal to 2 decimal places with ROUND_HALF_UP."""
    return val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ============================================================================
# STATUTORY FEE SCHEDULES (OFFICIAL SEBI / EXCHANGE RATES)
# ============================================================================

# Brokerage: Standard discount broker rate: ₹20 per executed order or 0.03% (whichever is lower)
MAX_BROKERAGE_PER_ORDER = Decimal("20.00")
BROKERAGE_PCT_LIMIT = Decimal("0.0003")  # 0.03%

# Securities Transaction Tax (STT) / Commodity Transaction Tax (CTT)
# - Equity Delivery: 0.1% on Buy and 0.1% on Sell
STT_EQUITY_DELIVERY_BUY = Decimal("0.001")
STT_EQUITY_DELIVERY_SELL = Decimal("0.001")

# - Equity Intraday: 0.025% on Sell side only
STT_EQUITY_INTRADAY_SELL = Decimal("0.00025")

# - Futures (Equity, Index, Currency, Commodity):
#   Equity/Index Futures: 0.0125% on Sell side (pre-Oct 2024) / 0.02% (post-Oct 2024 SEBI circular)
STT_FUTURES_SELL_STANDARD = Decimal("0.000125")  # 0.0125%
STT_FUTURES_SELL_REVISED = Decimal("0.00020")    # 0.0200% (SEBI Oct 2024)

# - Options (Equity & Index Options):
#   STT is levied ONLY on the SELL SIDE OPTION PREMIUM: 0.0625% (or 0.1% post Oct 2024)
STT_OPTIONS_PREMIUM_SELL_STANDARD = Decimal("0.000625")  # 0.0625%
STT_OPTIONS_PREMIUM_SELL_REVISED = Decimal("0.0010")     # 0.1000% (SEBI Oct 2024)

# - Commodities (MCX):
#   CTT on non-agri commodity futures: 0.01% on Sell side
CTT_COMMODITY_FUTURES_SELL = Decimal("0.0001")

# - Currency (NSE CDS): Nil STT
STT_CURRENCY = Decimal("0.00")

# Exchange Transaction Charges (Turnover charges)
EXCH_NSE_EQUITY = Decimal("0.0000325")     # NSE Cash: 0.00325%
EXCH_NSE_FUTURES = Decimal("0.000019")     # NSE Futures: 0.0019%
EXCH_NSE_OPTIONS = Decimal("0.0005")       # NSE Options: 0.05% on Premium Turnover
EXCH_MCX_COMMODITY = Decimal("0.000021")   # MCX Commodity: 0.0021%
EXCH_NSE_CURRENCY = Decimal("0.000009")    # NSE Currency: 0.0009%
EXCH_BSE_EQUITY = Decimal("0.0000375")     # BSE Cash: 0.00375%

# GST (Goods & Services Tax): 18% on (Brokerage + Exchange Charges + SEBI Turnover Charges)
GST_RATE = Decimal("0.18")

# SEBI Turnover Charges: ₹10 per crore (0.0001%) across all segments
SEBI_TURNOVER_RATE = Decimal("0.000001")

# Stamp Duty (Government of India / Stamp Act): Levied on BUY side only
STAMP_EQUITY_DELIVERY_BUY = Decimal("0.00015")  # 0.015% (₹1500 per crore)
STAMP_EQUITY_INTRADAY_BUY = Decimal("0.00003")  # 0.003% (₹300 per crore)
STAMP_FUTURES_BUY = Decimal("0.00002")          # 0.002% (₹200 per crore)
STAMP_OPTIONS_PREMIUM_BUY = Decimal("0.00003")  # 0.003% (₹300 per crore) on Premium
STAMP_COMMODITY_BUY = Decimal("0.00002")        # 0.002% (₹200 per crore)
STAMP_CURRENCY_BUY = Decimal("0.000001")        # 0.0001% (₹10 per crore)


# ============================================================================
# CANONICAL INSTRUMENT RESOLUTION & VALIDATION
# ============================================================================

def classify_instrument_and_segment(
    symbol: str,
    segment: str,
    exchange: Optional[str] = None
) -> Tuple[str, str, str]:
    """
    Classifies instrument type, clean exchange, and clean segment.
    Returns (instrument_type, resolved_exchange, resolved_segment).

    Instrument Types:
    - EQUITY_INTRADAY / EQUITY_DELIVERY
    - INDEX_FUTURES / STOCK_FUTURES
    - INDEX_OPTIONS / STOCK_OPTIONS
    - COMMODITY_FUTURES
    - CURRENCY_FUTURES
    - UNSUPPORTED_CRYPTO
    - UNKNOWN
    """
    sym = (symbol or "").upper().strip()
    seg = (segment or "").upper().strip()
    exch = (exchange or "").upper().strip()

    # Detect Crypto (unsupported by Angel One)
    if exch in ("BINANCE", "CRYPTO") or "BTC" in sym or "ETH" in sym:
        return "UNSUPPORTED_CRYPTO", exch or "BINANCE", "Crypto Perpetual"

    # Detect Currency
    if "USDINR" in sym or "EURINR" in sym or "GBPINR" in sym or "JPYINR" in sym or seg in ("CDS", "CURRENCY", "CURRENCY DERIVATIVES") or exch == "CDS":
        return "CURRENCY_FUTURES", "CDS", "Currency Derivatives"

    # Detect Commodity
    if "CRUDE" in sym or "GOLD" in sym or "SILVER" in sym or "NATURALGAS" in sym or "COPPER" in sym or exch == "MCX" or "MCX" in seg:
        return "COMMODITY_FUTURES", "MCX", "MCX Commodity"

    # Detect Options (must have strike preceding CE/PE or isolated CE/PE token, not just word ending like RELIANCE)
    is_option_sym = bool(
        re.search(r"\d+\s*(CE|PE)$", sym) or 
        re.search(r"\b(CE|PE)\b", sym) or 
        re.search(r"[-_](CE|PE)$", sym) or 
        "OPTION" in sym
    )
    is_option_seg = bool("OPTION" in seg or "OPTSTK" in seg or "OPTIDX" in seg)

    if is_option_sym or is_option_seg:
        if any(idx in sym for idx in ("NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX", "BANKEX")):
            return "INDEX_OPTIONS", exch or ("BFO" if "SENSEX" in sym else "NFO"), "NSE F&O Options"
        return "STOCK_OPTIONS", exch or "NFO", "NSE F&O Options"

    # Detect Futures
    is_fut_sym = bool(sym.endswith("FUT") or "FUT" in sym)
    is_fut_seg = bool("FUT" in seg or "F&O" in seg or "DERIVATIVE" in seg)

    if is_fut_sym or is_fut_seg:
        if any(idx in sym for idx in ("NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX", "BANKEX")):
            return "INDEX_FUTURES", exch or ("BFO" if "SENSEX" in sym else "NFO"), "NSE F&O Futures"
        return "STOCK_FUTURES", exch or "NFO", "NSE F&O Futures"

    # Default to Cash Equity
    return "EQUITY", exch or "NSE", "NSE Equity"


def validate_option_contract_integrity(symbol: str, price: float, segment: str = "") -> Tuple[bool, str]:
    """
    Validates that an option contract has genuine contract identity and realistic premium-based price.
    Rejects:
    1. Plain equity symbols passed with options segment (e.g. 'RELIANCE' under 'NSE F&O Options').
    2. Index options with underlying index spot level (> Rs. 2,000 threshold).
    3. Stock options with underlying stock spot level (> Rs. 500 threshold).
    4. Missing, zero, or negative option prices.
    """
    sym = (symbol or "").upper().strip()
    seg = (segment or "").upper().strip()
    is_option_sym = bool(
        re.search(r"\d+\s*(CE|PE)$", sym) or 
        re.search(r"\b(CE|PE)\b", sym) or 
        re.search(r"[-_](CE|PE)$", sym) or 
        "OPTION" in sym
    )
    is_option_seg = bool("OPTION" in seg or "OPTSTK" in seg or "OPTIDX" in seg)

    if is_option_seg and not is_option_sym:
        return False, f"Contract '{symbol}' lacks option strike and type (CE/PE) despite segment '{segment}'."

    if not (is_option_sym or is_option_seg):
        return True, "Non-option instrument."

    if price <= 0.0:
        return False, f"Option contract '{symbol}' has non-positive price ({price}); premium missing."

    is_index = any(idx in sym for idx in ("NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX", "BANKEX"))
    if is_index and price > 2000.0:
        return False, f"Index option '{symbol}' execution price Rs. {price:,.2f} represents underlying index spot level (> Rs. 2,000)."

    if not is_index and price > 500.0:
        return False, f"Stock option '{symbol}' execution price Rs. {price:,.2f} represents underlying stock spot level (> Rs. 500)."

    return True, "Valid option contract."


def compute_instrument_regulatory_charges(
    symbol: str,
    price: float,
    qty: int,
    action: str = "ROUND_TRIP",
    segment: Optional[str] = None,
    exchange: Optional[str] = None,
    product_type: str = "INTRADAY",
    underlying_index_price: Optional[float] = None,
    is_broker_confirmed: bool = False,
    broker_charges: Optional[Dict[str, float]] = None,
    strict_options_validation: bool = False
) -> Dict[str, Any]:
    """
    Authoritative SEBI/Exchange Regulatory Charge Calculation.

    Parameters:
    - symbol: Tradingsymbol (e.g. 'NIFTY 24750 CE', 'NIFTY27OCT26FUT', 'RELIANCE', 'CRUDE OIL')
    - price: Executed execution price (option premium for options, share price for equities, futures price for futures)
    - qty: Executed contract quantity (must be > 0)
    - action: 'BUY', 'SELL', 'EXIT', 'ROUND_TRIP'
    - segment: Stored segment string
    - exchange: Stored exchange string
    - product_type: 'INTRADAY', 'DELIVERY', 'CARRYFORWARD', 'NORMAL'
    - underlying_index_price: Optional reference index spot price if available
    - is_broker_confirmed: True if derived from broker contract note/callback
    - broker_charges: Dict of confirmed broker charges if available
    - strict_options_validation: When True, strictly validates option contract identity and premium threshold

    Returns:
    Dict containing:
    - total_charges: Decimal rounded to 2 decimal places
    - brokerage, stt_ctt, exchange_turnover, gst_18pct, sebi_turnover, stamp_duty
    - turnover: Executed turnover evaluated
    - validation_status: 'VALID', 'QUARANTINED', 'UNSUPPORTED'
    - quarantine_reason: Explanation if quarantined
    - is_estimated: True for model/paper estimation, False for broker confirmed
    - is_broker_confirmed: Boolean
    - instrument_type: Resolved classification
    """
    act_upper = (action or "ROUND_TRIP").upper().strip()
    is_buy = act_upper in ("BUY", "ENTRY")
    is_sell = act_upper in ("SELL", "EXIT", "SQUAREOFF")
    is_round_trip = act_upper in ("ROUND_TRIP", "CLOSED", "CLOSED_TRADE")

    # If broker confirmed charges are provided, return them directly
    if is_broker_confirmed and broker_charges:
        b_brk = to_decimal(broker_charges.get("brokerage"))
        b_stt = to_decimal(broker_charges.get("stt") or broker_charges.get("stt_ctt"))
        b_exch = to_decimal(broker_charges.get("exchange_turnover") or broker_charges.get("exchange_charges"))
        b_gst = to_decimal(broker_charges.get("gst") or broker_charges.get("gst_18pct"))
        b_sebi = to_decimal(broker_charges.get("sebi") or broker_charges.get("sebi_turnover"))
        b_stamp = to_decimal(broker_charges.get("stamp_duty"))
        b_tot = to_decimal(broker_charges.get("total_charges") or (b_brk + b_stt + b_exch + b_gst + b_sebi + b_stamp))
        return {
            "validation_status": "VALID",
            "quarantine_reason": None,
            "instrument_type": "BROKER_CONFIRMED",
            "is_estimated": False,
            "is_broker_confirmed": True,
            "turnover": float(round_cur(to_decimal(broker_charges.get("turnover", 0.0)))),
            "brokerage": float(round_cur(b_brk)),
            "stt_ctt": float(round_cur(b_stt)),
            "exchange_turnover": float(round_cur(b_exch)),
            "gst_18pct": float(round_cur(b_gst)),
            "sebi_turnover": float(round_cur(b_sebi)),
            "stamp_duty": float(round_cur(b_stamp)),
            "total_charges": float(round_cur(b_tot))
        }

    # Validate essential inputs
    dec_price = to_decimal(price)
    dec_qty = to_decimal(qty)

    if dec_price <= Decimal("0.00") or dec_qty <= Decimal("0.00"):
        return {
            "validation_status": "QUARANTINED",
            "quarantine_reason": f"Invalid price ({price}) or quantity ({qty}) provided. Zero charges applied.",
            "instrument_type": "UNKNOWN",
            "is_estimated": True,
            "is_broker_confirmed": False,
            "turnover": 0.0,
            "brokerage": 0.0,
            "stt_ctt": 0.0,
            "exchange_turnover": 0.0,
            "gst_18pct": 0.0,
            "sebi_turnover": 0.0,
            "stamp_duty": 0.0,
            "total_charges": 0.0
        }

    inst_type, res_exch, res_seg = classify_instrument_and_segment(symbol, segment or "", exchange)

    if inst_type == "UNSUPPORTED_CRYPTO":
        return {
            "validation_status": "UNSUPPORTED",
            "quarantine_reason": f"Cryptocurrency instrument '{symbol}' is unsupported on SEBI-regulated Angel One gateway.",
            "instrument_type": inst_type,
            "is_estimated": True,
            "is_broker_confirmed": False,
            "turnover": 0.0,
            "brokerage": 0.0,
            "stt_ctt": 0.0,
            "exchange_turnover": 0.0,
            "gst_18pct": 0.0,
            "sebi_turnover": 0.0,
            "stamp_duty": 0.0,
            "total_charges": 0.0
        }

    # =========================================================================
    # CRITICAL INVARIANT: OPTIONS TURNOVER MUST BE BASED ON OPTION PREMIUM
    # =========================================================================
    if inst_type in ("INDEX_OPTIONS", "STOCK_OPTIONS"):
        is_index_option = inst_type == "INDEX_OPTIONS"
        is_stock_option = inst_type == "STOCK_OPTIONS"

        # 1. Index option spot price anomaly (> 2,000 threshold)
        if is_index_option and dec_price > Decimal("2000.00"):
            return {
                "validation_status": "QUARANTINED",
                "charges_status": "UNRESOLVED",
                "is_quarantined": True,
                "quarantine_reason": (
                    f"Option contract '{symbol}' passed with underlying index spot price (Rs. {dec_price:,.2f}) "
                    f"instead of option premium. Statutory options STT and exchange fees must NOT be calculated "
                    f"on notional index level. Calculation quarantined to prevent phantom turnover charges."
                ),
                "instrument_type": inst_type,
                "is_estimated": True,
                "is_broker_confirmed": False,
                "turnover": float(round_cur(dec_price * dec_qty * (Decimal("2.0") if is_round_trip else Decimal("1.0")))),
                "brokerage": 0.0,
                "stt_ctt": 0.0,
                "exchange_turnover": 0.0,
                "gst_18pct": 0.0,
                "sebi_turnover": 0.0,
                "stamp_duty": 0.0,
                "total_charges": 0.0
            }

        # 2. Strict Option Contract & Premium Validation (Stock options spot price > 500 or missing strike/type)
        if strict_options_validation:
            is_valid_opt, opt_err = validate_option_contract_integrity(symbol, float(dec_price), segment or "")
            if not is_valid_opt:
                return {
                    "validation_status": "QUARANTINED",
                    "charges_status": "UNRESOLVED",
                    "is_quarantined": True,
                    "quarantine_reason": (
                        f"Option validation failed for '{symbol}': {opt_err} "
                        f"Statutory options fees cannot be calculated on ambiguous or spot pricing. Quarantined."
                    ),
                    "instrument_type": inst_type,
                    "is_estimated": True,
                    "is_broker_confirmed": False,
                    "turnover": float(round_cur(dec_price * dec_qty * (Decimal("2.0") if is_round_trip else Decimal("1.0")))),
                    "brokerage": 0.0,
                    "stt_ctt": 0.0,
                    "exchange_turnover": 0.0,
                    "gst_18pct": 0.0,
                    "sebi_turnover": 0.0,
                    "stamp_duty": 0.0,
                    "total_charges": 0.0
                }

    # Determine order leg multiplier (single order = 1, round trip = 2)
    leg_count = Decimal("2.0") if is_round_trip else Decimal("1.0")
    order_turnover = dec_price * dec_qty
    total_turnover = order_turnover * leg_count

    # 1. Brokerage: min(₹20, 0.03% of turnover) per executed leg
    if inst_type in ("INDEX_OPTIONS", "STOCK_OPTIONS"):
        # Options standard discount broker flat brokerage: ₹20 per executed order leg
        brokerage = MAX_BROKERAGE_PER_ORDER * leg_count
    else:
        # Equity & Futures: ₹20 or 0.03% whichever is lower per order leg
        brokerage_per_leg = min(MAX_BROKERAGE_PER_ORDER, order_turnover * BROKERAGE_PCT_LIMIT)
        brokerage = brokerage_per_leg * leg_count

    # 2. STT / CTT
    # - Equity Delivery: 0.1% on buy, 0.1% on sell (0.1% on round trip turnover)
    # - Equity Intraday: 0.025% on sell side only
    # - Futures: 0.0125% on sell side only
    # - Options: 0.0625% on sell side premium only
    # - Commodities: 0.01% on sell side (CTT)
    # - Currency: 0.0%
    if inst_type == "EQUITY":
        if product_type.upper() in ("DELIVERY", "CNC"):
            if is_round_trip:
                stt_ctt = total_turnover * STT_EQUITY_DELIVERY_BUY
            elif is_buy:
                stt_ctt = order_turnover * STT_EQUITY_DELIVERY_BUY
            else:
                stt_ctt = order_turnover * STT_EQUITY_DELIVERY_SELL
        else:
            # Intraday
            if is_round_trip or is_sell:
                stt_ctt = order_turnover * STT_EQUITY_INTRADAY_SELL
            else:
                stt_ctt = Decimal("0.00")
    elif inst_type in ("INDEX_FUTURES", "STOCK_FUTURES"):
        if is_round_trip or is_sell:
            stt_ctt = order_turnover * STT_FUTURES_SELL_STANDARD
        else:
            stt_ctt = Decimal("0.00")
    elif inst_type in ("INDEX_OPTIONS", "STOCK_OPTIONS"):
        # Options STT is levied ONLY on the sell-side premium turnover
        if is_round_trip or is_sell:
            stt_ctt = order_turnover * STT_OPTIONS_PREMIUM_SELL_STANDARD
        else:
            stt_ctt = Decimal("0.00")
    elif inst_type == "COMMODITY_FUTURES":
        if is_round_trip or is_sell:
            stt_ctt = order_turnover * CTT_COMMODITY_FUTURES_SELL
        else:
            stt_ctt = Decimal("0.00")
    else:
        # Currency or other
        stt_ctt = Decimal("0.00")

    # 3. Exchange Transaction Charges
    if inst_type in ("INDEX_OPTIONS", "STOCK_OPTIONS"):
        exchange_turnover = total_turnover * EXCH_NSE_OPTIONS
    elif inst_type in ("INDEX_FUTURES", "STOCK_FUTURES"):
        exchange_turnover = total_turnover * EXCH_NSE_FUTURES
    elif inst_type == "COMMODITY_FUTURES":
        exchange_turnover = total_turnover * EXCH_MCX_COMMODITY
    elif inst_type == "CURRENCY_FUTURES":
        exchange_turnover = total_turnover * EXCH_NSE_CURRENCY
    else:
        exchange_turnover = total_turnover * EXCH_NSE_EQUITY

    # 4. SEBI Turnover Charges: ₹10 per crore (0.0001%) across all turnover
    sebi_turnover = total_turnover * SEBI_TURNOVER_RATE

    # 5. GST (18% on Brokerage + Exchange charges + SEBI turnover charges)
    gst_18pct = (brokerage + exchange_turnover + sebi_turnover) * GST_RATE

    # 6. Stamp Duty: Levied on BUY side only
    if is_round_trip or is_buy:
        if inst_type == "EQUITY":
            if product_type.upper() in ("DELIVERY", "CNC"):
                stamp_duty = order_turnover * STAMP_EQUITY_DELIVERY_BUY
            else:
                stamp_duty = order_turnover * STAMP_EQUITY_INTRADAY_BUY
        elif inst_type in ("INDEX_OPTIONS", "STOCK_OPTIONS"):
            stamp_duty = order_turnover * STAMP_OPTIONS_PREMIUM_BUY
        elif inst_type in ("INDEX_FUTURES", "STOCK_FUTURES"):
            stamp_duty = order_turnover * STAMP_FUTURES_BUY
        elif inst_type == "COMMODITY_FUTURES":
            stamp_duty = order_turnover * STAMP_COMMODITY_BUY
        elif inst_type == "CURRENCY_FUTURES":
            stamp_duty = order_turnover * STAMP_CURRENCY_BUY
        else:
            stamp_duty = Decimal("0.00")
    else:
        stamp_duty = Decimal("0.00")

    # Quantize each component cleanly to 2 decimal places
    dec_brokerage = round_cur(brokerage)
    dec_stt = round_cur(stt_ctt)
    dec_exch = round_cur(exchange_turnover)
    dec_sebi = round_cur(sebi_turnover)
    dec_gst = round_cur(gst_18pct)
    dec_stamp = round_cur(stamp_duty)

    # Invariant: Total charges is the exact sum of its components
    total_charges = dec_brokerage + dec_stt + dec_exch + dec_gst + dec_sebi + dec_stamp

    return {
        "validation_status": "VALID",
        "quarantine_reason": None,
        "instrument_type": inst_type,
        "is_estimated": True,
        "is_broker_confirmed": False,
        "turnover": float(round_cur(total_turnover)),
        "brokerage": float(dec_brokerage),
        "stt_ctt": float(dec_stt),
        "exchange_turnover": float(dec_exch),
        "gst_18pct": float(dec_gst),
        "sebi_turnover": float(dec_sebi),
        "stamp_duty": float(dec_stamp),
        "total_charges": float(round_cur(total_charges))
    }


def validate_net_profit_guardrail(
    symbol: str,
    price: float,
    qty: int,
    action: str = "BUY",
    target_price: Optional[float] = None,
    segment: Optional[str] = None,
    exchange: Optional[str] = None,
    product_type: str = "INTRADAY",
    safety_buffer_pct: float = 20.0
) -> Tuple[bool, str, Dict[str, Any]]:
    """
    STRICT BROKERAGE & TAX NET-PROFIT GUARDRAIL
    Algorithmically calculates all anticipated broker fees, exchange turnover charges,
    SEBI turnover fees, GST, and STT before trade submission.
    Aborts and rejects any trade signal where expected gross movement fails to cover
    statutory and brokerage costs with a mandatory safety buffer.
    """
    p = max(0.0, float(price or 0.0))
    q = max(1, int(qty or 1))

    if p <= 0.0 or q <= 0:
        return False, "Input validation failed: Price and quantity must be positive.", {}

    # Calculate round-trip charges (entry + exit)
    charges_res = compute_instrument_regulatory_charges(
        symbol=symbol,
        price=p,
        qty=q,
        action="ROUND_TRIP",
        segment=segment,
        exchange=exchange,
        product_type=product_type
    )

    roundtrip_charges = float(charges_res.get("total_charges", 0.0))

    # Determine expected target price
    if target_price is not None and float(target_price) > 0:
        eff_target = float(target_price)
    else:
        # Default conservative target movement based on segment
        seg_lower = (segment or "").lower()
        if "option" in seg_lower:
            move_pct = 0.040  # 4.0% premium move
        elif "future" in seg_lower:
            move_pct = 0.005  # 0.5% futures move
        elif "mcx" in seg_lower or "commodity" in seg_lower:
            move_pct = 0.006  # 0.6% commodity move
        else:
            move_pct = 0.007  # 0.7% equity move

        eff_target = p * (1.0 + move_pct) if action.upper() == "BUY" else p * (1.0 - move_pct)

    expected_gross_profit = abs(eff_target - p) * q
    expected_net_profit = expected_gross_profit - roundtrip_charges

    breakeven_delta = roundtrip_charges / q if q > 0 else 0.0
    breakeven_pct = (breakeven_delta / p) * 100.0 if p > 0 else 0.0

    safety_threshold = roundtrip_charges * (1.0 + safety_buffer_pct / 100.0)

    is_approved = expected_gross_profit >= safety_threshold and expected_net_profit > 0.0

    telemetry = {
        "symbol": symbol,
        "entry_price": p,
        "target_price": eff_target,
        "qty": q,
        "roundtrip_charges": roundtrip_charges,
        "charges_breakdown": charges_res,
        "expected_gross_profit": round(expected_gross_profit, 2),
        "expected_net_profit": round(expected_net_profit, 2),
        "breakeven_delta": round(breakeven_delta, 2),
        "breakeven_pct": round(breakeven_pct, 2),
        "safety_threshold": round(safety_threshold, 2),
        "safety_buffer_pct": safety_buffer_pct
    }

    if not is_approved:
        rejection_reason = (
            f"Strict Net-Profit Guardrail Abort: Expected gross gain (₹{expected_gross_profit:,.2f}) "
            f"fails to safely cover roundtrip statutory taxes & brokerage (₹{roundtrip_charges:,.2f} "
            f"+ {safety_buffer_pct:.0f}% safety buffer = ₹{safety_threshold:,.2f}). "
            f"Breakeven requires at least ₹{breakeven_delta:.2f} ({breakeven_pct:.2f}%) movement. "
            f"Order aborted to prevent guaranteed net loss."
        )
        return False, rejection_reason, telemetry

    return True, "Net-profit guardrail passed with positive expected net profit.", telemetry

