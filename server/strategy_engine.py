"""
CHINTU AI TRADING SYSTEM - Quantitative Strategy & Indicator Engine (Phase 5)
Pure mathematical indicator calculations and deterministic strategy evaluators for all 14 bots.
Zero synthetic random values. Zero third-party library dependencies (pure Python math).
"""

import math
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

try:
    from server.bot_registry import CANONICAL_BOT_REGISTRY, get_bot_by_id, validate_bot_instrument
except ImportError:
    from bot_registry import CANONICAL_BOT_REGISTRY, get_bot_by_id, validate_bot_instrument


# ============================================================================
# 1. PURE MATHEMATICAL TECHNICAL INDICATORS
# ============================================================================

def calculate_sma(series: List[float], period: int) -> List[float]:
    """Calculates Simple Moving Average over a price series."""
    if not series or period <= 0 or len(series) < period:
        return []
    smas = []
    current_sum = sum(series[:period])
    smas.append(current_sum / period)
    for i in range(period, len(series)):
        current_sum += series[i] - series[i - period]
        smas.append(current_sum / period)
    return smas


def calculate_ema(series: List[float], period: int) -> List[float]:
    """
    Calculates Exponential Moving Average (EMA).
    Multiplier k = 2 / (period + 1)
    Initial seed is SMA of first 'period' elements.
    """
    if not series or period <= 0 or len(series) < period:
        return []
    k = 2.0 / (period + 1.0)
    sma_init = sum(series[:period]) / period
    emas = [sma_init]
    for price in series[period:]:
        ema_val = (price * k) + (emas[-1] * (1.0 - k))
        emas.append(ema_val)
    return emas


def calculate_rsi(closes: List[float], period: int = 14) -> float:
    """
    Calculates Wilder's Smoothed Relative Strength Index (RSI).
    Returns value between 0.0 and 100.0.
    """
    if not closes or len(closes) <= period:
        return 50.0

    gains = []
    losses = []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        if diff >= 0:
            gains.append(diff)
            losses.append(0.0)
        else:
            gains.append(0.0)
            losses.append(abs(diff))

    if len(gains) < period:
        return 50.0

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    for i in range(period, len(gains)):
        avg_gain = ((avg_gain * (period - 1)) + gains[i]) / period
        avg_loss = ((avg_loss * (period - 1)) + losses[i]) / period

    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100.0 - (100.0 / (1.0 + rs)), 2)


def calculate_atr(highs: List[float], lows: List[float], closes: List[float], period: int = 14) -> float:
    """
    Calculates Average True Range (ATR).
    True Range = max(high - low, abs(high - prev_close), abs(low - prev_close))
    """
    if not highs or not lows or not closes or len(highs) < period + 1:
        return 0.0

    trs = []
    for i in range(1, len(highs)):
        h = highs[i]
        l = lows[i]
        c_prev = closes[i - 1]
        tr = max(h - l, abs(h - c_prev), abs(l - c_prev))
        trs.append(tr)

    if len(trs) < period:
        return 0.0

    atr = sum(trs[:period]) / period
    for i in range(period, len(trs)):
        atr = ((atr * (period - 1)) + trs[i]) / period
    return round(atr, 2)


def calculate_adx(
    highs: List[float],
    lows: List[float],
    closes: List[float],
    period: int = 14
) -> Dict[str, float]:
    """
    Calculates Wilder's Average Directional Index (ADX), +DI, and -DI.
    Pure mathematical implementation with zero external dependencies.
    """
    if len(highs) < period * 2 or len(lows) < period * 2 or len(closes) < period * 2:
        return {"adx": 0.0, "plus_di": 0.0, "minus_di": 0.0}

    tr_list = []
    plus_dm_list = []
    minus_dm_list = []

    for i in range(1, len(highs)):
        h = highs[i]
        l = lows[i]
        prev_h = highs[i - 1]
        prev_l = lows[i - 1]
        prev_c = closes[i - 1]

        tr = max(h - l, abs(h - prev_c), abs(l - prev_c))
        tr_list.append(tr)

        up_move = h - prev_h
        down_move = prev_l - l

        if up_move > down_move and up_move > 0:
            plus_dm_list.append(up_move)
        else:
            plus_dm_list.append(0.0)

        if down_move > up_move and down_move > 0:
            minus_dm_list.append(down_move)
        else:
            minus_dm_list.append(0.0)

    if len(tr_list) < period:
        return {"adx": 0.0, "plus_di": 0.0, "minus_di": 0.0}

    # Initial Wilder's smoothing
    smooth_tr = sum(tr_list[:period])
    smooth_plus_dm = sum(plus_dm_list[:period])
    smooth_minus_dm = sum(minus_dm_list[:period])

    dx_list = []
    for i in range(period, len(tr_list)):
        smooth_tr = smooth_tr - (smooth_tr / period) + tr_list[i]
        smooth_plus_dm = smooth_plus_dm - (smooth_plus_dm / period) + plus_dm_list[i]
        smooth_minus_dm = smooth_minus_dm - (smooth_minus_dm / period) + minus_dm_list[i]

        plus_di = (smooth_plus_dm / smooth_tr * 100.0) if smooth_tr > 0 else 0.0
        minus_di = (smooth_minus_dm / smooth_tr * 100.0) if smooth_tr > 0 else 0.0

        di_sum = plus_di + minus_di
        dx = (abs(plus_di - minus_di) / di_sum * 100.0) if di_sum > 0 else 0.0
        dx_list.append(dx)

    if len(dx_list) < period:
        latest_plus_di = (smooth_plus_dm / smooth_tr * 100.0) if smooth_tr > 0 else 0.0
        latest_minus_di = (smooth_minus_dm / smooth_tr * 100.0) if smooth_tr > 0 else 0.0
        first_adx = sum(dx_list) / len(dx_list) if dx_list else 0.0
        return {"adx": round(first_adx, 2), "plus_di": round(latest_plus_di, 2), "minus_di": round(latest_minus_di, 2)}

    adx = sum(dx_list[:period]) / period
    for i in range(period, len(dx_list)):
        adx = ((adx * (period - 1)) + dx_list[i]) / period

    latest_plus_di = (smooth_plus_dm / smooth_tr * 100.0) if smooth_tr > 0 else 0.0
    latest_minus_di = (smooth_minus_dm / smooth_tr * 100.0) if smooth_tr > 0 else 0.0

    return {
        "adx": round(adx, 2),
        "plus_di": round(latest_plus_di, 2),
        "minus_di": round(latest_minus_di, 2)
    }


def calculate_supertrend(
    highs: List[float],
    lows: List[float],
    closes: List[float],
    period: int = 10,
    multiplier: float = 3.0
) -> Dict[str, Any]:
    """
    Calculates SuperTrend indicator.
    Returns: {"direction": "UP" | "DOWN", "supertrend": float, "atr": float}
    """
    if len(highs) < period + 1:
        return {"direction": "UP", "supertrend": closes[-1] if closes else 0.0, "atr": 0.0}

    atr = calculate_atr(highs, lows, closes, period)
    if atr == 0.0:
        return {"direction": "UP", "supertrend": closes[-1], "atr": 0.0}

    # Calculate bands for recent candle
    hl2 = (highs[-1] + lows[-1]) / 2.0
    basic_upper = hl2 + (multiplier * atr)
    basic_lower = hl2 - (multiplier * atr)

    curr_close = closes[-1]
    prev_close = closes[-2]

    # Approximate direction based on close relation to bands
    if curr_close > basic_lower and prev_close <= basic_lower:
        direction = "UP"
        val = basic_lower
    elif curr_close < basic_upper and prev_close >= basic_upper:
        direction = "DOWN"
        val = basic_upper
    else:
        direction = "UP" if curr_close >= basic_lower else "DOWN"
        val = basic_lower if direction == "UP" else basic_upper

    return {
        "direction": direction,
        "supertrend": round(val, 2),
        "upper_band": round(basic_upper, 2),
        "lower_band": round(basic_lower, 2),
        "atr": atr
    }


def calculate_macd(
    closes: List[float],
    fast: int = 12,
    slow: int = 26,
    signal: int = 9
) -> Dict[str, float]:
    """
    Calculates Moving Average Convergence Divergence (MACD).
    MACD line = Fast EMA - Slow EMA
    Signal line = EMA(MACD line, signal)
    Histogram = MACD line - Signal line
    """
    if len(closes) < slow + signal:
        return {"macd": 0.0, "signal": 0.0, "hist": 0.0}

    fast_emas = calculate_ema(closes, fast)
    slow_emas = calculate_ema(closes, slow)

    # Align lengths
    offset = len(fast_emas) - len(slow_emas)
    macd_line = [fast_emas[offset + i] - slow_emas[i] for i in range(len(slow_emas))]

    if len(macd_line) < signal:
        return {"macd": macd_line[-1], "signal": 0.0, "hist": macd_line[-1]}

    sig_emas = calculate_ema(macd_line, signal)
    latest_macd = macd_line[-1]
    latest_sig = sig_emas[-1]
    hist = latest_macd - latest_sig

    return {
        "macd": round(latest_macd, 3),
        "signal": round(latest_sig, 3),
        "hist": round(hist, 3)
    }


def calculate_bollinger_bands(
    closes: List[float],
    period: int = 20,
    num_std: float = 2.0
) -> Dict[str, float]:
    """
    Calculates Bollinger Bands.
    Returns: {"middle": float, "upper": float, "lower": float, "pct_b": float, "bandwidth": float}
    """
    if len(closes) < period:
        last = closes[-1] if closes else 0.0
        return {"middle": last, "upper": last, "lower": last, "pct_b": 0.5, "bandwidth": 0.0}

    sub = closes[-period:]
    middle = sum(sub) / period
    variance = sum((x - middle) ** 2 for x in sub) / period
    std_dev = math.sqrt(variance)

    upper = middle + (num_std * std_dev)
    lower = middle - (num_std * std_dev)
    bw = (upper - lower) / middle if middle != 0 else 0.0

    last_close = closes[-1]
    pct_b = (last_close - lower) / (upper - lower) if (upper - lower) != 0 else 0.5

    return {
        "middle": round(middle, 2),
        "upper": round(upper, 2),
        "lower": round(lower, 2),
        "pct_b": round(pct_b, 4),
        "bandwidth": round(bw, 4)
    }


def calculate_donchian_channel(
    highs: List[float],
    lows: List[float],
    period: int = 20
) -> Dict[str, float]:
    """
    Calculates Donchian Channel over high/low series.
    Upper = max(highs[-period:]), Lower = min(lows[-period:]), Middle = (Upper + Lower) / 2
    """
    if len(highs) < period or len(lows) < period:
        h = max(highs) if highs else 0.0
        l = min(lows) if lows else 0.0
        return {"upper": h, "lower": l, "middle": (h + l) / 2.0}

    sub_h = highs[-period:]
    sub_l = lows[-period:]
    upper = max(sub_h)
    lower = min(sub_l)
    middle = (upper + lower) / 2.0
    return {
        "upper": round(upper, 2),
        "lower": round(lower, 2),
        "middle": round(middle, 2)
    }


def calculate_keltner_channel(
    highs: List[float],
    lows: List[float],
    closes: List[float],
    ema_period: int = 20,
    atr_period: int = 10,
    multiplier: float = 1.5
) -> Dict[str, float]:
    """
    Calculates Keltner Channel: EMA(closes) +/- multiplier * ATR.
    """
    if len(closes) < ema_period:
        c = closes[-1] if closes else 0.0
        return {"middle": c, "upper": c, "lower": c}

    emas = calculate_ema(closes, ema_period)
    atr = calculate_atr(highs, lows, closes, atr_period)
    middle = emas[-1]
    upper = middle + (multiplier * atr)
    lower = middle - (multiplier * atr)
    return {
        "middle": round(middle, 2),
        "upper": round(upper, 2),
        "lower": round(lower, 2),
        "atr": round(atr, 2)
    }


def calculate_vwap(
    highs: List[float],
    lows: List[float],
    closes: List[float],
    volumes: List[float]
) -> Dict[str, float]:
    """
    Calculates Volume Weighted Average Price (VWAP) and standard deviation bands.
    """
    if not closes or not volumes or len(closes) != len(volumes):
        c = closes[-1] if closes else 0.0
        return {"vwap": c, "upper_1sigma": c, "lower_1sigma": c, "stdev": 0.0}

    cum_pv = 0.0
    cum_vol = 0.0
    for h, l, c, v in zip(highs, lows, closes, volumes):
        tp = (h + l + c) / 3.0
        cum_pv += tp * v
        cum_vol += v

    if cum_vol == 0:
        return {"vwap": closes[-1], "upper_1sigma": closes[-1], "lower_1sigma": closes[-1], "stdev": 0.0}

    vwap = cum_pv / cum_vol
    # Calculate volume-weighted variance
    var_sum = sum(v * (((h + l + c) / 3.0) - vwap) ** 2 for h, l, c, v in zip(highs, lows, closes, volumes))
    stdev = math.sqrt(var_sum / cum_vol)

    return {
        "vwap": round(vwap, 2),
        "upper_1sigma": round(vwap + stdev, 2),
        "lower_1sigma": round(vwap - stdev, 2),
        "stdev": round(stdev, 2)
    }


def calculate_camarilla_pivots(high: float, low: float, close: float) -> Dict[str, float]:
    """
    Calculates Camarilla Floor Trader Pivots from previous period High, Low, Close.
    H4/L4: Breakout levels
    H3/L3: Reversal bounds
    """
    r = high - low
    h4 = close + (r * 1.1 / 2.0)
    h3 = close + (r * 1.1 / 4.0)
    l3 = close - (r * 1.1 / 4.0)
    l4 = close - (r * 1.1 / 2.0)
    return {
        "h4": round(h4, 2),
        "h3": round(h3, 2),
        "l3": round(l3, 2),
        "l4": round(l4, 2),
        "pivot": round((high + low + close) / 3.0, 2)
    }


def calculate_ichimoku(
    highs: List[float],
    lows: List[float],
    tenkan_period: int = 9,
    kijun_period: int = 26,
    senkou_b_period: int = 52
) -> Dict[str, float]:
    """
    Calculates Ichimoku Kinko Hyo components: Tenkan-sen, Kijun-sen, Senkou Span A/B.
    """
    if len(highs) < senkou_b_period:
        return {"tenkan": 0.0, "kijun": 0.0, "senkou_a": 0.0, "senkou_b": 0.0}

    tenkan = (max(highs[-tenkan_period:]) + min(lows[-tenkan_period:])) / 2.0
    kijun = (max(highs[-kijun_period:]) + min(lows[-kijun_period:])) / 2.0
    senkou_a = (tenkan + kijun) / 2.0
    senkou_b = (max(highs[-senkou_b_period:]) + min(lows[-senkou_b_period:])) / 2.0

    return {
        "tenkan": round(tenkan, 3),
        "kijun": round(kijun, 3),
        "senkou_a": round(senkou_a, 3),
        "senkou_b": round(senkou_b, 3)
    }


# ============================================================================
# 2. DETERMINISTIC STRATEGY EVALUATOR FOR 14 BOTS
# ============================================================================

STRATEGY_ENGINE_VERSION = "2.3.0"


def build_strategy_signal(
    bot: Dict[str, Any],
    decision: str,
    reason: str,
    indicators: Dict[str, Any],
    confidence: float,
    status: str,
    curr_close: Optional[float] = None,
    candles: Optional[List[Dict[str, Any]]] = None,
    position_side: Optional[str] = None,
    invalidation_rules: Optional[Dict[str, Any]] = None,
    strategy_version: str = STRATEGY_ENGINE_VERSION,
    strategy_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Constructs a standardized, strictly validated signal dictionary for any bot.
    Includes strategy version, signal and data timestamps, directional tags,
    warm-up status, invalidation boundaries, and exit rules.
    """
    bot_id = bot.get("id", 0)
    bot_name = bot.get("name", f"Bot {bot_id}")
    strategy_id = strategy_id or bot.get("strategy_id", "UNKNOWN")

    # Indicator warm-up status
    min_req = bot.get("min_candles_required", 30)
    candle_count = len(candles) if isinstance(candles, list) else 0
    warmup_status = {
        "required_candles": min_req,
        "current_candles": candle_count,
        "is_warmed_up": candle_count >= min_req
    }

    # Signal & input data timestamps
    signal_timestamp = datetime.now().isoformat()
    data_timestamp = None
    if candles and len(candles) > 0 and isinstance(candles[-1], dict):
        data_timestamp = str(candles[-1].get("timestamp"))

    # Compute risk-based invalidation levels
    risk_cfg = bot.get("risk_config", {})
    stop_loss_pct = float(risk_cfg.get("stop_loss_pct", 1.0))
    target_pct = float(risk_cfg.get("target_pct", 1.5))

    calculated_sl = None
    calculated_tp = None
    if curr_close and curr_close > 0:
        if decision == "BUY":
            calculated_sl = round(curr_close * (1.0 - stop_loss_pct / 100.0), 2)
            calculated_tp = round(curr_close * (1.0 + target_pct / 100.0), 2)
        elif decision == "SELL":
            calculated_sl = round(curr_close * (1.0 + stop_loss_pct / 100.0), 2)
            calculated_tp = round(curr_close * (1.0 - target_pct / 100.0), 2)

    # Reconcile position exits and reversal rules
    final_decision = decision
    direction = "NONE"

    if status == "DATA_UNAVAILABLE":
        direction = "DATA_UNAVAILABLE"
        final_decision = "NO_TRADE"
    elif status != "DATA_READY":
        direction = "NONE"
        final_decision = "NO_TRADE"
    else:
        # Check active position exits
        if position_side == "LONG":
            if decision == "SELL":
                final_decision = "EXIT"
                direction = "EXIT"
                reason = f"Exit LONG position: Reversal signal triggered ({reason})"
            elif curr_close and calculated_sl and curr_close <= calculated_sl:
                final_decision = "EXIT"
                direction = "EXIT"
                reason = f"Exit LONG position: Stop loss breached (Close {curr_close} <= {calculated_sl})"
            elif decision == "BUY":
                direction = "LONG"
                final_decision = "BUY"
            else:
                direction = "HOLD"
                final_decision = "HOLD"
        elif position_side == "SHORT":
            if decision == "BUY":
                final_decision = "EXIT"
                direction = "EXIT"
                reason = f"Exit SHORT position: Reversal signal triggered ({reason})"
            elif curr_close and calculated_sl and curr_close >= calculated_sl:
                final_decision = "EXIT"
                direction = "EXIT"
                reason = f"Exit SHORT position: Stop loss breached (Close {curr_close} >= {calculated_sl})"
            elif decision == "SELL":
                direction = "SHORT"
                final_decision = "SELL"
            else:
                direction = "HOLD"
                final_decision = "HOLD"
        else:
            if decision == "BUY":
                direction = "LONG"
            elif decision == "SELL":
                direction = "SHORT"
            elif decision == "HOLD":
                direction = "HOLD"
            elif decision == "EXIT":
                direction = "EXIT"

    # Assemble invalidation rules
    if not invalidation_rules:
        if final_decision == "BUY":
            invalidation_rules = {
                "stop_loss_price": calculated_sl,
                "target_price": calculated_tp,
                "invalidation_level": calculated_sl,
                "condition": f"Close below {calculated_sl} or reversal"
            }
        elif final_decision == "SELL":
            invalidation_rules = {
                "stop_loss_price": calculated_sl,
                "target_price": calculated_tp,
                "invalidation_level": calculated_sl,
                "condition": f"Close above {calculated_sl} or reversal"
            }
        else:
            invalidation_rules = {
                "stop_loss_price": None,
                "target_price": None,
                "invalidation_level": None,
                "condition": "N/A - Neutral or No Trade"
            }

    return {
        "bot_id": bot_id,
        "bot_name": bot_name,
        "strategy_id": strategy_id,
        "strategy_version": strategy_version,
        "decision": final_decision,
        "direction": direction,
        "reason": reason,
        "indicators": indicators,
        "confidence": confidence,
        "status": status,
        "signal_timestamp": signal_timestamp,
        "data_timestamp": data_timestamp,
        "warmup_status": warmup_status,
        "invalidation_rules": invalidation_rules,
        "entry_price": curr_close if final_decision in ["BUY", "SELL"] else None
    }


def execute_custom_strategy(bot_id: int, alloc: Dict[str, Any], market_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Safely executes a custom strategy allocated from the shared Strategy Library.
    Enforces AST security, sandboxing, and immutable version tracking.
    """
    try:
        from server.strategy_validator import StrategyValidator
        raw_source = alloc.get("raw_source", "")
        if not raw_source:
            return None

        # Ensure only Approved or Published strategies can generate signals
        strat_status = alloc.get("strategy_status", "Draft")
        if strat_status not in ["Approved", "Published"]:
            bot = get_bot_by_id(bot_id)
            return build_strategy_signal(
                bot=bot,
                decision="NO_TRADE",
                reason=f"Assigned strategy '{alloc.get('strategy_name')}' is in '{strat_status}' status. Only Approved/Published strategies can trade.",
                indicators={},
                confidence=0.0,
                status="UNAPPROVED_STRATEGY",
                strategy_version=alloc.get("version", "v1.0.0"),
                strategy_id=alloc.get("strategy_id", bot.get("strategy_id"))
            )

        # Execute sandboxed evaluation
        success, msg, output = StrategyValidator._dry_run_python_strategy(raw_source)
        if success and output and isinstance(output, dict):
            bot = get_bot_by_id(bot_id)
            candles = market_data.get("candles", [])
            curr_close = candles[-1]["close"] if candles and len(candles) > 0 and isinstance(candles[-1], dict) else None
            return build_strategy_signal(
                bot=bot,
                decision=output.get("decision", "HOLD"),
                reason=output.get("reason", f"Signal from assigned strategy '{alloc.get('strategy_name', '')}'"),
                indicators=output.get("indicators", {}),
                confidence=float(output.get("confidence", 0.8)),
                status="DATA_READY",
                curr_close=curr_close,
                candles=candles,
                position_side=market_data.get("position_side"),
                invalidation_rules=output.get("invalidation_rules"),
                strategy_version=alloc.get("version", "v1.0.0"),
                strategy_id=alloc.get("strategy_id", bot.get("strategy_id"))
            )
    except Exception:
        pass
    return None


def evaluate_bot_strategy(bot_id: int, market_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deterministically evaluates strategy logic for a given bot using real candle arrays.
    Enforces authentic data gates, indicator warm-up thresholds, invalidation boundaries,
    and distinct health statuses.
    """
    bot = get_bot_by_id(bot_id)
    if not bot:
        return build_strategy_signal(
            bot={"id": bot_id, "name": f"Unknown Bot #{bot_id}", "strategy_id": "UNKNOWN"},
            decision="NO_TRADE",
            reason=f"Bot ID {bot_id} not registered in canonical registry.",
            indicators={},
            confidence=0.0,
            status="INVALID_DATA"
        )

    # 1. Reject mismatched instrument data when symbol is provided
    symbol = market_data.get("symbol") or market_data.get("tradingsymbol") or market_data.get("asset")
    if symbol and not validate_bot_instrument(bot_id, str(symbol)):
        return build_strategy_signal(
            bot=bot,
            decision="NO_TRADE",
            reason=f"Instrument mismatch: proposed symbol '{symbol}' is not valid for bot '{bot['name']}' ({bot['asset']} / {bot['tradingsymbol']}).",
            indicators={},
            confidence=0.0,
            status="INVALID_DATA"
        )

    # 1b. Check if an active custom approved strategy is allocated to this bot from the shared library
    try:
        from server.memory_db import get_bot_strategy
        alloc = get_bot_strategy(bot_id)
        if alloc and not alloc.get("strategy_id", "").startswith("strat_canonical_"):
            custom_res = execute_custom_strategy(bot_id, alloc, market_data)
            if custom_res:
                return custom_res
    except Exception:
        pass

    # 2. Advanced strategies requiring specialized data dependencies
    # (Options Greeks, Order book footprint, Multi-index beta covariance)
    if bot["data_readiness"] == "DATA_UNAVAILABLE":
        req = bot["required_data"]

        # Bot 12: Options Gamma Scalper
        if req == "OPTION_CHAIN_L2":
            greeks = market_data.get("option_greeks")
            if not greeks or not isinstance(greeks, dict):
                return build_strategy_signal(
                    bot=bot,
                    decision="NO_TRADE",
                    reason=f"Strategy '{bot['strategy_name']}' requires live L2 option chain Greeks feed, which is currently unavailable.",
                    indicators={},
                    confidence=0.0,
                    status="DATA_UNAVAILABLE"
                )
            net_gamma = float(greeks.get("net_gamma_accel", 0.0))
            delta_exp = float(greeks.get("delta_expansion", 0.0))
            indicators = {
                "net_gamma_accel": net_gamma,
                "delta_expansion": delta_exp,
                "call_gamma": greeks.get("call_gamma", 0.0),
                "put_gamma": greeks.get("put_gamma", 0.0)
            }
            if net_gamma >= 0.05 and delta_exp > 0.0:
                dec = "BUY"
                rsn = f"Option gamma burst detected: net gamma acceleration (+{net_gamma}) with call delta expansion (+{delta_exp})."
                conf = 0.85
            elif net_gamma <= -0.05 and delta_exp < 0.0:
                dec = "SELL"
                rsn = f"Option gamma breakdown detected: net gamma acceleration ({net_gamma}) with put delta expansion ({delta_exp})."
                conf = 0.85
            else:
                dec = "HOLD"
                rsn = f"Delta-neutral equilibrium: net gamma acceleration ({net_gamma}) within neutral bounds."
                conf = 0.50
            return build_strategy_signal(
                bot=bot,
                decision=dec,
                reason=rsn,
                indicators=indicators,
                confidence=conf,
                status="DATA_READY",
                position_side=market_data.get("position_side")
            )

        # Bot 13: Order Flow Imbalance
        elif req == "L3_FOOTPRINT_TICK":
            footprint = market_data.get("footprint_depth")
            if not footprint or not isinstance(footprint, dict):
                return build_strategy_signal(
                    bot=bot,
                    decision="NO_TRADE",
                    reason=f"Strategy '{bot['strategy_name']}' requires L3 order book footprint delta depth, which is currently unavailable.",
                    indicators={},
                    confidence=0.0,
                    status="DATA_UNAVAILABLE"
                )
            delta_ratio = float(footprint.get("delta_imbalance_ratio", 1.0))
            sweep_vol = float(footprint.get("sweep_volume", 0.0))
            indicators = {"delta_imbalance_ratio": delta_ratio, "sweep_volume": sweep_vol}
            if delta_ratio >= 3.0:
                dec = "BUY"
                rsn = f"Aggressive order flow absorption sweep: buyer delta imbalance {delta_ratio}x (>3.0x threshold)."
                conf = 0.88
            elif delta_ratio <= -3.0 or (0.0 < delta_ratio <= 0.33):
                dec = "SELL"
                rsn = f"Aggressive order flow distribution sweep: seller delta imbalance ({delta_ratio}x)."
                conf = 0.88
            else:
                dec = "HOLD"
                rsn = f"Order book footprint in balance: delta imbalance {delta_ratio}x within neutral absorption limits."
                conf = 0.50
            return build_strategy_signal(
                bot=bot,
                decision=dec,
                reason=rsn,
                indicators=indicators,
                confidence=conf,
                status="DATA_READY",
                position_side=market_data.get("position_side")
            )

        # Bot 14: Risk Neutral Delta Hedger
        elif req == "MULTI_INDEX_BETA":
            beta_data = market_data.get("multi_index_beta")
            if not beta_data or not isinstance(beta_data, dict):
                return build_strategy_signal(
                    bot=bot,
                    decision="NO_TRADE",
                    reason=f"Strategy '{bot['strategy_name']}' requires real-time multi-index beta covariance matrix, which is currently unavailable.",
                    indicators={},
                    confidence=0.0,
                    status="DATA_UNAVAILABLE"
                )
            port_beta = float(beta_data.get("portfolio_beta", 1.0))
            vol_spike = float(beta_data.get("volatility_spike", 1.0))
            indicators = {"portfolio_beta": port_beta, "volatility_spike": vol_spike}
            if port_beta > 1.2 and vol_spike >= 1.2:
                dec = "SELL"
                rsn = f"Beta-neutral hedge triggered: portfolio beta elevated ({port_beta}) during volatility spike ({vol_spike}x)."
                conf = 0.84
            elif port_beta < 0.8:
                dec = "BUY"
                rsn = f"Beta rebalancing triggered: portfolio beta depressed ({port_beta}); increasing benchmark exposure."
                conf = 0.84
            else:
                dec = "HOLD"
                rsn = f"Portfolio beta neutral ({port_beta}) and benchmark volatility steady ({vol_spike}x)."
                conf = 0.50
            return build_strategy_signal(
                bot=bot,
                decision=dec,
                reason=rsn,
                indicators=indicators,
                confidence=conf,
                status="DATA_READY",
                position_side=market_data.get("position_side")
            )

    # 3. Extract and validate OHLCV candle arrays for Bots 1 to 11
    candles = market_data.get("candles", [])
    min_required = bot["min_candles_required"]

    if not isinstance(candles, list) or len(candles) < min_required:
        return build_strategy_signal(
            bot=bot,
            decision="NO_TRADE",
            reason=f"Insufficient candle data: received {len(candles) if isinstance(candles, list) else 0} candles, minimum {min_required} required.",
            indicators={},
            confidence=0.0,
            status="INSUFFICIENT_DATA",
            candles=candles if isinstance(candles, list) else []
        )

    # Extract price vectors
    try:
        highs = [float(c["high"]) for c in candles]
        lows = [float(c["low"]) for c in candles]
        closes = [float(c["close"]) for c in candles]
        volumes = [float(c.get("volume", 1.0)) for c in candles]
    except (KeyError, ValueError, TypeError) as err:
        return build_strategy_signal(
            bot=bot,
            decision="NO_TRADE",
            reason=f"Invalid candle format or non-numeric price data: {str(err)}",
            indicators={},
            confidence=0.0,
            status="INVALID_DATA",
            candles=candles
        )

    # Validate physical price boundaries
    if any(p <= 0 for p in closes):
        return build_strategy_signal(
            bot=bot,
            decision="NO_TRADE",
            reason="Malformed market data: candle closes contain non-positive values.",
            indicators={},
            confidence=0.0,
            status="INVALID_DATA",
            candles=candles
        )

    curr_close = closes[-1]
    curr_high = highs[-1]
    curr_low = lows[-1]
    pos_side = market_data.get("position_side")

    # ========================================================================
    # STRATEGY 1: Scalper Bot (SuperTrend 10,2 + MACD Histogram)
    # ========================================================================
    if bot_id == 1:
        st = calculate_supertrend(highs, lows, closes, period=10, multiplier=2.0)
        macd = calculate_macd(closes, fast=12, slow=26, signal=9)
        indicators = {"supertrend": st["supertrend"], "direction": st["direction"], "macd_hist": macd["hist"]}

        if st["direction"] == "UP" and macd["hist"] > 0:
            dec = "BUY"
            rsn = f"SuperTrend is bullish ({st['supertrend']}) and MACD histogram is expanding (+{macd['hist']})."
            conf = 0.84
        elif st["direction"] == "DOWN" and macd["hist"] < 0:
            dec = "SELL"
            rsn = f"SuperTrend is bearish ({st['supertrend']}) and MACD histogram is negative ({macd['hist']})."
            conf = 0.84
        else:
            dec = "HOLD"
            rsn = f"SuperTrend direction ({st['direction']}) disagrees with MACD histogram ({macd['hist']})."
            conf = 0.50

        return build_strategy_signal(bot, dec, rsn, indicators, conf, "DATA_READY", curr_close, candles, pos_side)

    # ========================================================================
    # STRATEGY 2: EMA Trend Bot (Triple EMA 9/21/55 + ATR Stop)
    # ========================================================================
    elif bot_id == 2:
        ema9 = calculate_ema(closes, 9)[-1]
        ema21 = calculate_ema(closes, 21)[-1]
        ema55 = calculate_ema(closes, 55)[-1]
        atr = calculate_atr(highs, lows, closes, 14)
        indicators = {"ema9": round(ema9, 2), "ema21": round(ema21, 2), "ema55": round(ema55, 2), "atr": atr}

        if ema9 > ema21 > ema55 and curr_close > ema9:
            dec = "BUY"
            rsn = f"Triple EMA bullish stack confirmed: EMA9 ({ema9:.1f}) > EMA21 ({ema21:.1f}) > EMA55 ({ema55:.1f})."
            conf = 0.88
        elif ema9 < ema21 < ema55 and curr_close < ema9:
            dec = "SELL"
            rsn = f"Triple EMA bearish stack confirmed: EMA9 ({ema9:.1f}) < EMA21 ({ema21:.1f}) < EMA55 ({ema55:.1f})."
            conf = 0.88
        else:
            dec = "HOLD"
            rsn = f"EMAs in neutral consolidation (EMA9: {ema9:.1f}, EMA21: {ema21:.1f}, EMA55: {ema55:.1f})."
            conf = 0.50

        return build_strategy_signal(bot, dec, rsn, indicators, conf, "DATA_READY", curr_close, candles, pos_side)

    # ========================================================================
    # STRATEGY 3: RSI Reversal Bot (RSI 14 + Bollinger Band %B)
    # ========================================================================
    elif bot_id == 3:
        rsi = calculate_rsi(closes, 14)
        bb = calculate_bollinger_bands(closes, 20, 2.0)
        indicators = {"rsi": rsi, "upper_bb": bb["upper"], "lower_bb": bb["lower"], "pct_b": bb["pct_b"]}

        if rsi <= 30.0 and curr_close <= bb["lower"]:
            dec = "BUY"
            rsn = f"RSI oversold ({rsi} <= 30.0) at lower Bollinger Band ({bb['lower']})."
            conf = 0.82
        elif rsi >= 70.0 and curr_close >= bb["upper"]:
            dec = "SELL"
            rsn = f"RSI overbought ({rsi} >= 70.0) at upper Bollinger Band ({bb['upper']})."
            conf = 0.82
        else:
            dec = "HOLD"
            rsn = f"RSI is neutral ({rsi}) within Bollinger bounds ({bb['lower']} - {bb['upper']})."
            conf = 0.50

        return build_strategy_signal(bot, dec, rsn, indicators, conf, "DATA_READY", curr_close, candles, pos_side)

    # ========================================================================
    # STRATEGY 4: Breakout Bot (Donchian Channel 20 + Volume Expansion)
    # ========================================================================
    elif bot_id == 4:
        dc = calculate_donchian_channel(highs[:-1], lows[:-1], 20)
        avg_vol = sum(volumes[-20:-1]) / 19.0 if len(volumes) >= 20 else volumes[-1]
        curr_vol = volumes[-1]
        vol_ratio = round(curr_vol / avg_vol, 2) if avg_vol > 0 else 1.0
        indicators = {"donchian_upper": dc["upper"], "donchian_lower": dc["lower"], "volume_ratio": vol_ratio}

        if curr_high > dc["upper"] and curr_vol >= avg_vol * 1.2:
            dec = "BUY"
            rsn = f"Donchian 20-period breakout above {dc['upper']} with volume {vol_ratio}x average."
            conf = 0.86
        elif curr_low < dc["lower"] and curr_vol >= avg_vol * 1.2:
            dec = "SELL"
            rsn = f"Donchian 20-period breakdown below {dc['lower']} with volume {vol_ratio}x average."
            conf = 0.86
        else:
            dec = "HOLD"
            rsn = f"Price within Donchian channel ({dc['lower']} - {dc['upper']})."
            conf = 0.50

        return build_strategy_signal(bot, dec, rsn, indicators, conf, "DATA_READY", curr_close, candles, pos_side)

    # ========================================================================
    # STRATEGY 5: Mean Reversion (Keltner Channel 20, 1.5 ATR)
    # ========================================================================
    elif bot_id == 5:
        kc = calculate_keltner_channel(highs, lows, closes, ema_period=20, atr_period=10, multiplier=1.5)
        indicators = {"keltner_upper": kc["upper"], "keltner_lower": kc["lower"], "middle": kc["middle"]}

        if curr_close <= kc["lower"]:
            dec = "BUY"
            rsn = f"Price ({curr_close}) extended below Keltner lower band ({kc['lower']}); statistical reversion expected."
            conf = 0.79
        elif curr_close >= kc["upper"]:
            dec = "SELL"
            rsn = f"Price ({curr_close}) extended above Keltner upper band ({kc['upper']}); mean reversion expected."
            conf = 0.79
        else:
            dec = "HOLD"
            rsn = f"Price inside Keltner channel ({kc['lower']} - {kc['upper']})."
            conf = 0.50

        return build_strategy_signal(bot, dec, rsn, indicators, conf, "DATA_READY", curr_close, candles, pos_side)

    # ========================================================================
    # STRATEGY 6: VWAP Momentum (Anchored Session VWAP)
    # ========================================================================
    elif bot_id == 6:
        vwap_res = calculate_vwap(highs, lows, closes, volumes)
        vwap = vwap_res["vwap"]
        upper_1s = vwap_res["upper_1sigma"]
        lower_1s = vwap_res["lower_1sigma"]
        indicators = {"vwap": vwap, "upper_1sigma": upper_1s, "lower_1sigma": lower_1s}

        if curr_close > vwap and curr_close <= upper_1s and closes[-2] <= vwap:
            dec = "BUY"
            rsn = f"Institutional VWAP bounce: close {curr_close} holding above session VWAP {vwap}."
            conf = 0.81
        elif curr_close < vwap and curr_close >= lower_1s and closes[-2] >= vwap:
            dec = "SELL"
            rsn = f"Institutional VWAP rejection: close {curr_close} breaking below session VWAP {vwap}."
            conf = 0.81
        else:
            dec = "HOLD"
            rsn = f"Price tracking normal VWAP distribution band ({lower_1s} - {upper_1s})."
            conf = 0.50

        return build_strategy_signal(bot, dec, rsn, indicators, conf, "DATA_READY", curr_close, candles, pos_side)

    # ========================================================================
    # STRATEGY 7: Volume Spike Bot (VSA Absorption)
    # ========================================================================
    elif bot_id == 7:
        vol_sma = sum(volumes[-20:-1]) / 19.0 if len(volumes) >= 20 else volumes[-1]
        curr_vol = volumes[-1]
        spread = curr_high - curr_low
        avg_spread = sum(highs[i] - lows[i] for i in range(-20, -1)) / 19.0 if len(highs) >= 20 else spread
        vol_ratio = round(curr_vol / vol_sma, 2) if vol_sma > 0 else 1.0
        spread_ratio = round(spread / avg_spread, 2) if avg_spread > 0 else 1.0
        indicators = {"volume_ratio": vol_ratio, "spread_ratio": spread_ratio}

        is_high_volume = curr_vol >= vol_sma * 1.8
        is_wide_spread = spread >= avg_spread * 1.3

        if is_high_volume and is_wide_spread and curr_close > (curr_low + spread * 0.6):
            dec = "BUY"
            rsn = f"VSA Absorption: High volume ({vol_ratio}x) stopping candle closing near highs."
            conf = 0.83
        elif is_high_volume and is_wide_spread and curr_close < (curr_low + spread * 0.4):
            dec = "SELL"
            rsn = f"VSA Climax Distribution: Ultra-high volume ({vol_ratio}x) closing near lows."
            conf = 0.83
        else:
            dec = "HOLD"
            rsn = f"Volume ({vol_ratio}x) and spread ({spread_ratio}x) within normal limits."
            conf = 0.50

        return build_strategy_signal(bot, dec, rsn, indicators, conf, "DATA_READY", curr_close, candles, pos_side)

    # ========================================================================
    # STRATEGY 8: SuperTrend Wave (Dual SuperTrend 7,3 + 14,2)
    # ========================================================================
    elif bot_id == 8:
        st_fast = calculate_supertrend(highs, lows, closes, period=7, multiplier=3.0)
        st_slow = calculate_supertrend(highs, lows, closes, period=14, multiplier=2.0)
        indicators = {
            "fast_dir": st_fast["direction"],
            "slow_dir": st_slow["direction"],
            "fast_val": st_fast["supertrend"],
            "slow_val": st_slow["supertrend"]
        }

        if st_fast["direction"] == "UP" and st_slow["direction"] == "UP":
            dec = "BUY"
            rsn = f"Dual SuperTrend bullish confluence: Fast ST(7,3) and Slow ST(14,2) both signaling UP."
            conf = 0.87
        elif st_fast["direction"] == "DOWN" and st_slow["direction"] == "DOWN":
            dec = "SELL"
            rsn = f"Dual SuperTrend bearish confluence: Fast ST(7,3) and Slow ST(14,2) both signaling DOWN."
            conf = 0.87
        else:
            dec = "HOLD"
            rsn = f"Dual SuperTrend divergence: Fast ({st_fast['direction']}) vs Slow ({st_slow['direction']})."
            conf = 0.50

        return build_strategy_signal(bot, dec, rsn, indicators, conf, "DATA_READY", curr_close, candles, pos_side)

    # ========================================================================
    # STRATEGY 9: Bollinger Band Squeeze (Bollinger + Keltner)
    # ========================================================================
    elif bot_id == 9:
        bb = calculate_bollinger_bands(closes, 20, 2.0)
        kc = calculate_keltner_channel(highs, lows, closes, 20, 10, 1.5)
        is_squeeze = bb["upper"] <= kc["upper"] and bb["lower"] >= kc["lower"]
        indicators = {"squeeze_active": is_squeeze, "bandwidth": bb["bandwidth"], "upper_bb": bb["upper"], "lower_bb": bb["lower"]}

        if not is_squeeze and curr_close > bb["upper"] and closes[-2] <= bb["upper"]:
            dec = "BUY"
            rsn = f"Volatility Squeeze release upward: Close {curr_close} breaking above upper BB {bb['upper']}."
            conf = 0.85
        elif not is_squeeze and curr_close < bb["lower"] and closes[-2] >= bb["lower"]:
            dec = "SELL"
            rsn = f"Volatility Squeeze release downward: Close {curr_close} breaking below lower BB {bb['lower']}."
            conf = 0.85
        else:
            dec = "HOLD"
            rsn = f"Volatility Squeeze {'active inside Keltner channel' if is_squeeze else 'awaiting directional expansion'}."
            conf = 0.50

        return build_strategy_signal(bot, dec, rsn, indicators, conf, "DATA_READY", curr_close, candles, pos_side)

    # ========================================================================
    # STRATEGY 10: Pivot Point Reversal (Camarilla H3/L3)
    # ========================================================================
    elif bot_id == 10:
        prev_h = max(highs[-30:-1])
        prev_l = min(lows[-30:-1])
        prev_c = closes[-2]
        cam = calculate_camarilla_pivots(prev_h, prev_l, prev_c)
        indicators = {"l3": cam["l3"], "h3": cam["h3"], "l4": cam["l4"], "h4": cam["h4"]}

        if curr_low <= cam["l3"] and curr_close > cam["l3"]:
            dec = "BUY"
            rsn = f"Camarilla L3 reversal bounce: Low {curr_low} tested L3 ({cam['l3']}) and closed above."
            conf = 0.80
        elif curr_high >= cam["h3"] and curr_close < cam["h3"]:
            dec = "SELL"
            rsn = f"Camarilla H3 reversal rejection: High {curr_high} tested H3 ({cam['h3']}) and closed below."
            conf = 0.80
        else:
            dec = "HOLD"
            rsn = f"Price within Camarilla L3 ({cam['l3']}) and H3 ({cam['h3']}) boundaries."
            conf = 0.50

        return build_strategy_signal(bot, dec, rsn, indicators, conf, "DATA_READY", curr_close, candles, pos_side)

    # ========================================================================
    # STRATEGY 11: Multi-Timeframe Confluence (Ichimoku Cloud)
    # ========================================================================
    elif bot_id == 11:
        ichi = calculate_ichimoku(highs, lows, 9, 26, 52)
        indicators = {"tenkan": ichi["tenkan"], "kijun": ichi["kijun"], "senkou_a": ichi["senkou_a"], "senkou_b": ichi["senkou_b"]}
        cloud_top = max(ichi["senkou_a"], ichi["senkou_b"])
        cloud_bottom = min(ichi["senkou_a"], ichi["senkou_b"])

        if curr_close > cloud_top and ichi["tenkan"] > ichi["kijun"]:
            dec = "BUY"
            rsn = f"Ichimoku bullish breakout: Close {curr_close} above Kumo Cloud ({cloud_top}) and Tenkan > Kijun."
            conf = 0.86
        elif curr_close < cloud_bottom and ichi["tenkan"] < ichi["kijun"]:
            dec = "SELL"
            rsn = f"Ichimoku bearish breakdown: Close {curr_close} below Kumo Cloud ({cloud_bottom}) and Tenkan < Kijun."
            conf = 0.86
        else:
            dec = "HOLD"
            rsn = f"Price inside or consolidating around Ichimoku Cloud ({cloud_bottom} - {cloud_top})."
            conf = 0.50

        return build_strategy_signal(bot, dec, rsn, indicators, conf, "DATA_READY", curr_close, candles, pos_side)

    # Fallback for any unhandled bot
    return build_strategy_signal(
        bot=bot,
        decision="NO_TRADE",
        reason=f"No active strategy handler for bot ID {bot_id}.",
        indicators={},
        confidence=0.0,
        status="INVALID_DATA"
    )


# ========================================================================
# CONVENIENCE WRAPPER & ALIASES
# ========================================================================

def evaluate_strategy(
    bot_id: int,
    market_data_or_candles: Any,
    position_side: Optional[str] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Flexible wrapper accepting either a market_data dict or raw candle list.
    """
    if isinstance(market_data_or_candles, list):
        payload = {
            "candles": market_data_or_candles,
            "position_side": position_side,
            **kwargs
        }
        return evaluate_bot_strategy(bot_id, payload)
    elif isinstance(market_data_or_candles, dict):
        d = dict(market_data_or_candles)
        if position_side and "position_side" not in d:
            d["position_side"] = position_side
        return evaluate_bot_strategy(bot_id, d)
    else:
        return evaluate_bot_strategy(bot_id, {"candles": []})


evaluate_strategy_signal = evaluate_strategy
CURRENT_STRATEGY_VERSION = STRATEGY_ENGINE_VERSION


# ============================================================================
# 3. PHASE 14 CANDIDATE STRATEGIES & BOT COMPATIBILITY MATRIX
# ============================================================================

def evaluate_ema_adx_trend(
    candles: List[Dict[str, Any]],
    fast_period: int = 9,
    slow_period: int = 21,
    baseline_period: int = 55,
    adx_period: int = 14,
    adx_threshold: float = 25.0
) -> Dict[str, Any]:
    """
    Candidate Strategy 1: EMA Trend-Following with ADX Trend-Strength Filtering.
    Enforces:
    - Triple EMA stack (Fast > Slow > Baseline)
    - ADX >= adx_threshold (filters out choppy range-bound markets)
    - +DI / -DI directional dominance
    - Validates strictly against historical candles without lookahead bias
    """
    min_required = max(baseline_period + 5, adx_period * 2 + 5)
    if not isinstance(candles, list) or len(candles) < min_required:
        return {
            "strategy_id": "CANDIDATE_EMA_ADX_TREND",
            "decision": "NO_TRADE",
            "reason": f"Insufficient candles: {len(candles) if isinstance(candles, list) else 0} provided, {min_required} required.",
            "status": "INSUFFICIENT_DATA",
            "indicators": {},
            "confidence": 0.0
        }

    try:
        highs = [float(c["high"]) for c in candles]
        lows = [float(c["low"]) for c in candles]
        closes = [float(c["close"]) for c in candles]
    except (KeyError, ValueError, TypeError) as err:
        return {
            "strategy_id": "CANDIDATE_EMA_ADX_TREND",
            "decision": "NO_TRADE",
            "reason": f"Malformed candle data: {err}",
            "status": "INVALID_DATA",
            "indicators": {},
            "confidence": 0.0
        }

    ema_fast = calculate_ema(closes, fast_period)[-1]
    ema_slow = calculate_ema(closes, slow_period)[-1]
    ema_base = calculate_ema(closes, baseline_period)[-1]
    adx_res = calculate_adx(highs, lows, closes, adx_period)
    atr = calculate_atr(highs, lows, closes, 14)

    adx_val = adx_res["adx"]
    plus_di = adx_res["plus_di"]
    minus_di = adx_res["minus_di"]
    curr_close = closes[-1]

    indicators = {
        "ema_fast": round(ema_fast, 2),
        "ema_slow": round(ema_slow, 2),
        "ema_base": round(ema_base, 2),
        "adx": adx_val,
        "plus_di": plus_di,
        "minus_di": minus_di,
        "atr": atr
    }

    if adx_val < adx_threshold:
        return {
            "strategy_id": "CANDIDATE_EMA_ADX_TREND",
            "decision": "HOLD",
            "reason": f"ADX trend strength insufficient ({adx_val} < {adx_threshold}); market in consolidation chop.",
            "status": "DATA_READY",
            "indicators": indicators,
            "confidence": 0.40,
            "invalidation_rules": {"condition": f"ADX below {adx_threshold}"}
        }

    if ema_fast > ema_slow > ema_base and curr_close > ema_fast and plus_di > minus_di:
        sl = round(curr_close - (2.0 * atr), 2)
        tp = round(curr_close + (3.0 * atr), 2)
        return {
            "strategy_id": "CANDIDATE_EMA_ADX_TREND",
            "decision": "BUY",
            "direction": "LONG",
            "reason": f"Bullish EMA stack ({ema_fast:.1f} > {ema_slow:.1f} > {ema_base:.1f}) confirmed by ADX {adx_val} (+DI {plus_di:.1f} > -DI {minus_di:.1f}).",
            "status": "DATA_READY",
            "indicators": indicators,
            "confidence": 0.86,
            "stop_loss": sl,
            "take_profit": tp,
            "invalidation_rules": {
                "stop_loss_price": sl,
                "target_price": tp,
                "invalidation_level": sl,
                "condition": f"Close below trailing stop {sl} or ADX drops below {adx_threshold}"
            }
        }
    elif ema_fast < ema_slow < ema_base and curr_close < ema_fast and minus_di > plus_di:
        sl = round(curr_close + (2.0 * atr), 2)
        tp = round(curr_close - (3.0 * atr), 2)
        return {
            "strategy_id": "CANDIDATE_EMA_ADX_TREND",
            "decision": "SELL",
            "direction": "SHORT",
            "reason": f"Bearish EMA stack ({ema_fast:.1f} < {ema_slow:.1f} < {ema_base:.1f}) confirmed by ADX {adx_val} (-DI {minus_di:.1f} > +DI {plus_di:.1f}).",
            "status": "DATA_READY",
            "indicators": indicators,
            "confidence": 0.86,
            "stop_loss": sl,
            "take_profit": tp,
            "invalidation_rules": {
                "stop_loss_price": sl,
                "target_price": tp,
                "invalidation_level": sl,
                "condition": f"Close above trailing stop {sl} or ADX drops below {adx_threshold}"
            }
        }

    return {
        "strategy_id": "CANDIDATE_EMA_ADX_TREND",
        "decision": "HOLD",
        "reason": f"EMAs neutral or DI direction diverges from EMA slope (ADX: {adx_val}, Fast: {ema_fast:.1f}, Slow: {ema_slow:.1f}).",
        "status": "DATA_READY",
        "indicators": indicators,
        "confidence": 0.50
    }


def evaluate_breakout_volatility(
    candles: List[Dict[str, Any]],
    lookback: int = 20,
    vol_multiplier: float = 1.5,
    atr_period: int = 14
) -> Dict[str, Any]:
    """
    Candidate Strategy 2: Breakout with Volume Expansion & Volatility Confirmation.
    Prevents look-ahead bias by calculating Donchian channel strictly from completed previous candles (highs[:-1], lows[:-1]).
    """
    if not isinstance(candles, list) or len(candles) < lookback + 5:
        return {
            "strategy_id": "CANDIDATE_BREAKOUT_VOLATILITY",
            "decision": "NO_TRADE",
            "reason": f"Insufficient candles: {len(candles) if isinstance(candles, list) else 0} provided, {lookback + 5} required.",
            "status": "INSUFFICIENT_DATA",
            "indicators": {},
            "confidence": 0.0
        }

    try:
        highs = [float(c["high"]) for c in candles]
        lows = [float(c["low"]) for c in candles]
        closes = [float(c["close"]) for c in candles]
        volumes = [float(c.get("volume", 1.0)) for c in candles]
    except (KeyError, ValueError, TypeError) as err:
        return {
            "strategy_id": "CANDIDATE_BREAKOUT_VOLATILITY",
            "decision": "NO_TRADE",
            "reason": f"Malformed candle data: {err}",
            "status": "INVALID_DATA",
            "indicators": {},
            "confidence": 0.0
        }

    # Donchian channel on prior completed candles (no lookahead bias)
    prior_highs = highs[-(lookback + 1):-1]
    prior_lows = lows[-(lookback + 1):-1]
    prior_vols = volumes[-(lookback + 1):-1]

    channel_upper = max(prior_highs)
    channel_lower = min(prior_lows)
    avg_vol = sum(prior_vols) / len(prior_vols) if prior_vols else 1.0

    curr_close = closes[-1]
    curr_high = highs[-1]
    curr_low = lows[-1]
    curr_vol = volumes[-1]

    atr = calculate_atr(highs, lows, closes, atr_period)
    vol_ratio = round(curr_vol / avg_vol, 2) if avg_vol > 0 else 1.0

    indicators = {
        "channel_upper": round(channel_upper, 2),
        "channel_lower": round(channel_lower, 2),
        "volume_ratio": vol_ratio,
        "avg_volume": round(avg_vol, 1),
        "current_volume": round(curr_vol, 1),
        "atr": atr
    }

    is_volume_confirmed = curr_vol >= avg_vol * vol_multiplier

    if curr_high > channel_upper and is_volume_confirmed:
        sl = round(channel_upper - (1.5 * atr), 2)
        tp = round(channel_upper + (2.5 * atr), 2)
        return {
            "strategy_id": "CANDIDATE_BREAKOUT_VOLATILITY",
            "decision": "BUY",
            "direction": "LONG",
            "reason": f"Donchian breakout above {channel_upper} with volume surge {vol_ratio}x (>= {vol_multiplier}x threshold).",
            "status": "DATA_READY",
            "indicators": indicators,
            "confidence": 0.85,
            "stop_loss": sl,
            "take_profit": tp,
            "invalidation_rules": {
                "stop_loss_price": sl,
                "target_price": tp,
                "invalidation_level": channel_upper,
                "condition": f"Price drops back inside breakout channel boundary {channel_upper}"
            }
        }
    elif curr_low < channel_lower and is_volume_confirmed:
        sl = round(channel_lower + (1.5 * atr), 2)
        tp = round(channel_lower - (2.5 * atr), 2)
        return {
            "strategy_id": "CANDIDATE_BREAKOUT_VOLATILITY",
            "decision": "SELL",
            "direction": "SHORT",
            "reason": f"Donchian breakdown below {channel_lower} with volume surge {vol_ratio}x (>= {vol_multiplier}x threshold).",
            "status": "DATA_READY",
            "indicators": indicators,
            "confidence": 0.85,
            "stop_loss": sl,
            "take_profit": tp,
            "invalidation_rules": {
                "stop_loss_price": sl,
                "target_price": tp,
                "invalidation_level": channel_lower,
                "condition": f"Price rises back inside breakdown channel boundary {channel_lower}"
            }
        }

    return {
        "strategy_id": "CANDIDATE_BREAKOUT_VOLATILITY",
        "decision": "HOLD",
        "reason": f"Price within channel ({channel_lower} - {channel_upper}) or volume expansion ({vol_ratio}x) below {vol_multiplier}x threshold.",
        "status": "DATA_READY",
        "indicators": indicators,
        "confidence": 0.50
    }


def evaluate_vwap_rsi(
    candles: List[Dict[str, Any]],
    rsi_period: int = 14,
    rsi_bullish_min: float = 50.0,
    rsi_bullish_max: float = 70.0,
    rsi_bearish_max: float = 50.0,
    rsi_bearish_min: float = 30.0
) -> Dict[str, Any]:
    """
    Candidate Strategy 3: Intraday VWAP + RSI Momentum Confirmation.
    Rejects entering when RSI is already overbought (>70) or oversold (<30) to prevent exhaustion entries.
    """
    if not isinstance(candles, list) or len(candles) < rsi_period + 5:
        return {
            "strategy_id": "CANDIDATE_VWAP_RSI",
            "decision": "NO_TRADE",
            "reason": f"Insufficient candles: {len(candles) if isinstance(candles, list) else 0} provided, {rsi_period + 5} required.",
            "status": "INSUFFICIENT_DATA",
            "indicators": {},
            "confidence": 0.0
        }

    try:
        highs = [float(c["high"]) for c in candles]
        lows = [float(c["low"]) for c in candles]
        closes = [float(c["close"]) for c in candles]
        volumes = [float(c.get("volume", 1.0)) for c in candles]
    except (KeyError, ValueError, TypeError) as err:
        return {
            "strategy_id": "CANDIDATE_VWAP_RSI",
            "decision": "NO_TRADE",
            "reason": f"Malformed candle data: {err}",
            "status": "INVALID_DATA",
            "indicators": {},
            "confidence": 0.0
        }

    vwap_res = calculate_vwap(highs, lows, closes, volumes)
    rsi = calculate_rsi(closes, rsi_period)
    atr = calculate_atr(highs, lows, closes, 14)

    vwap = vwap_res["vwap"]
    curr_close = closes[-1]
    prev_close = closes[-2]

    indicators = {
        "vwap": vwap,
        "rsi": rsi,
        "upper_1sigma": vwap_res["upper_1sigma"],
        "lower_1sigma": vwap_res["lower_1sigma"],
        "atr": atr
    }

    if curr_close > vwap and prev_close <= vwap and rsi_bullish_min <= rsi < rsi_bullish_max:
        sl = round(vwap - (1.0 * atr), 2)
        tp = round(curr_close + (2.0 * atr), 2)
        return {
            "strategy_id": "CANDIDATE_VWAP_RSI",
            "decision": "BUY",
            "direction": "LONG",
            "reason": f"Bullish VWAP cross above session VWAP {vwap} with confirming RSI momentum {rsi} (range {rsi_bullish_min}-{rsi_bullish_max}).",
            "status": "DATA_READY",
            "indicators": indicators,
            "confidence": 0.82,
            "stop_loss": sl,
            "take_profit": tp,
            "invalidation_rules": {
                "stop_loss_price": sl,
                "target_price": tp,
                "invalidation_level": vwap,
                "condition": f"Close below session VWAP {vwap}"
            }
        }
    elif curr_close < vwap and prev_close >= vwap and rsi_bearish_min < rsi <= rsi_bearish_max:
        sl = round(vwap + (1.0 * atr), 2)
        tp = round(curr_close - (2.0 * atr), 2)
        return {
            "strategy_id": "CANDIDATE_VWAP_RSI",
            "decision": "SELL",
            "direction": "SHORT",
            "reason": f"Bearish VWAP breakdown below session VWAP {vwap} with confirming RSI momentum {rsi} (range {rsi_bearish_min}-{rsi_bearish_max}).",
            "status": "DATA_READY",
            "indicators": indicators,
            "confidence": 0.82,
            "stop_loss": sl,
            "take_profit": tp,
            "invalidation_rules": {
                "stop_loss_price": sl,
                "target_price": tp,
                "invalidation_level": vwap,
                "condition": f"Close above session VWAP {vwap}"
            }
        }

    return {
        "strategy_id": "CANDIDATE_VWAP_RSI",
        "decision": "HOLD",
        "reason": f"Price near VWAP {vwap} without active crossover or RSI ({rsi}) outside entry trigger windows.",
        "status": "DATA_READY",
        "indicators": indicators,
        "confidence": 0.50
    }


def evaluate_mean_reversion_adaptive(
    candles: List[Dict[str, Any]],
    bb_period: int = 20,
    bb_std: float = 2.0,
    rsi_period: int = 14,
    adx_period: int = 14,
    adx_trend_cutoff: float = 25.0
) -> Dict[str, Any]:
    """
    Candidate Strategy 4: Mean Reversion with Adaptive Trend Invalidation Guard.
    SAFETY INVARIANT:
    - If ADX >= adx_trend_cutoff, market is deemed trending.
      Mean reversion is AUTOMATICALLY DISABLED (returns NO_TRADE / ABSTAIN).
      Counter-trend entries into strong trends are prohibited.
    - If ADX < adx_trend_cutoff (ranging regime):
      Evaluates statistical bounce from outer Bollinger Band with RSI extreme.
    """
    min_required = max(bb_period + 5, adx_period * 2 + 5)
    if not isinstance(candles, list) or len(candles) < min_required:
        return {
            "strategy_id": "CANDIDATE_MEAN_REVERSION_ADAPTIVE",
            "decision": "NO_TRADE",
            "reason": f"Insufficient candles: {len(candles) if isinstance(candles, list) else 0} provided, {min_required} required.",
            "status": "INSUFFICIENT_DATA",
            "indicators": {},
            "confidence": 0.0
        }

    try:
        highs = [float(c["high"]) for c in candles]
        lows = [float(c["low"]) for c in candles]
        closes = [float(c["close"]) for c in candles]
    except (KeyError, ValueError, TypeError) as err:
        return {
            "strategy_id": "CANDIDATE_MEAN_REVERSION_ADAPTIVE",
            "decision": "NO_TRADE",
            "reason": f"Malformed candle data: {err}",
            "status": "INVALID_DATA",
            "indicators": {},
            "confidence": 0.0
        }

    adx_res = calculate_adx(highs, lows, closes, adx_period)
    adx_val = adx_res["adx"]
    bb = calculate_bollinger_bands(closes, bb_period, bb_std)
    rsi = calculate_rsi(closes, rsi_period)
    atr = calculate_atr(highs, lows, closes, 14)
    curr_close = closes[-1]

    indicators = {
        "adx": adx_val,
        "upper_bb": bb["upper"],
        "middle_bb": bb["middle"],
        "lower_bb": bb["lower"],
        "pct_b": bb["pct_b"],
        "rsi": rsi,
        "atr": atr
    }

    # ADAPTIVE TREND INVALIDATION GUARD
    if adx_val >= adx_trend_cutoff:
        return {
            "strategy_id": "CANDIDATE_MEAN_REVERSION_ADAPTIVE",
            "decision": "NO_TRADE",
            "reason": f"Mean reversion disabled: Strong trend detected (ADX {adx_val} >= {adx_trend_cutoff}). Counter-trend entries blocked.",
            "status": "TREND_INVALIDATED",
            "is_trend_disabled": True,
            "indicators": indicators,
            "confidence": 0.0,
            "invalidation_rules": {"condition": f"ADX {adx_val} >= {adx_trend_cutoff}"}
        }

    # In ranging market, evaluate outer band bounce
    if curr_close <= bb["lower"] and rsi <= 32.0:
        sl = round(curr_close - (1.5 * atr), 2)
        tp = round(bb["middle"], 2)
        return {
            "strategy_id": "CANDIDATE_MEAN_REVERSION_ADAPTIVE",
            "decision": "BUY",
            "direction": "LONG",
            "reason": f"Statistical mean reversion bounce: Close {curr_close} at lower band {bb['lower']} with RSI {rsi} in ranging regime (ADX {adx_val}).",
            "status": "DATA_READY",
            "indicators": indicators,
            "confidence": 0.81,
            "stop_loss": sl,
            "take_profit": tp,
            "invalidation_rules": {
                "stop_loss_price": sl,
                "target_price": tp,
                "invalidation_level": sl,
                "condition": f"Close below stop loss {sl} or ADX surges above {adx_trend_cutoff}"
            }
        }
    elif curr_close >= bb["upper"] and rsi >= 68.0:
        sl = round(curr_close + (1.5 * atr), 2)
        tp = round(bb["middle"], 2)
        return {
            "strategy_id": "CANDIDATE_MEAN_REVERSION_ADAPTIVE",
            "decision": "SELL",
            "direction": "SHORT",
            "reason": f"Statistical mean reversion pullback: Close {curr_close} at upper band {bb['upper']} with RSI {rsi} in ranging regime (ADX {adx_val}).",
            "status": "DATA_READY",
            "indicators": indicators,
            "confidence": 0.81,
            "stop_loss": sl,
            "take_profit": tp,
            "invalidation_rules": {
                "stop_loss_price": sl,
                "target_price": tp,
                "invalidation_level": sl,
                "condition": f"Close above stop loss {sl} or ADX surges above {adx_trend_cutoff}"
            }
        }

    return {
        "strategy_id": "CANDIDATE_MEAN_REVERSION_ADAPTIVE",
        "decision": "HOLD",
        "reason": f"Ranging market (ADX {adx_val}), but price ({curr_close}) is inside neutral Bollinger bands ({bb['lower']} - {bb['upper']}).",
        "status": "DATA_READY",
        "indicators": indicators,
        "confidence": 0.50
    }


def detect_market_regime(
    candles: List[Dict[str, Any]],
    adx_period: int = 14,
    atr_period: int = 14,
    ema_period: int = 50
) -> Dict[str, Any]:
    """
    Candidate Strategy 5: Market Regime Classifier.
    Classifies market into:
    - TRENDING_BULLISH: ADX >= 25, +DI > -DI, Price > 50 EMA
    - TRENDING_BEARISH: ADX >= 25, -DI > +DI, Price < 50 EMA
    - HIGH_VOLATILITY: ATR >= 1.8x average ATR or Bandwidth >= 0.08
    - RANGING_CONSOLIDATION: ADX < 20, narrow bandwidth
    Recommends compatible and incompatible strategy families.
    """
    min_required = max(ema_period + 5, adx_period * 2 + 5)
    if not isinstance(candles, list) or len(candles) < min_required:
        return {
            "regime": "UNKNOWN",
            "reason": f"Insufficient candles for regime classification ({len(candles) if isinstance(candles, list) else 0}/{min_required}).",
            "compatible_strategies": [],
            "incompatible_strategies": []
        }

    try:
        highs = [float(c["high"]) for c in candles]
        lows = [float(c["low"]) for c in candles]
        closes = [float(c["close"]) for c in candles]
    except Exception as err:
        return {"regime": "UNKNOWN", "reason": f"Malformed data: {err}", "compatible_strategies": [], "incompatible_strategies": []}

    adx_res = calculate_adx(highs, lows, closes, adx_period)
    adx_val = adx_res["adx"]
    plus_di = adx_res["plus_di"]
    minus_di = adx_res["minus_di"]

    atr = calculate_atr(highs, lows, closes, atr_period)
    past_atrs = [calculate_atr(highs[:i], lows[:i], closes[:i], atr_period) for i in range(len(closes) - 10, len(closes)) if i > atr_period + 1]
    avg_atr = sum(past_atrs) / len(past_atrs) if past_atrs else atr

    bb = calculate_bollinger_bands(closes, 20, 2.0)
    ema50 = calculate_ema(closes, ema_period)[-1]
    curr_close = closes[-1]

    metrics = {
        "adx": adx_val,
        "plus_di": plus_di,
        "minus_di": minus_di,
        "atr": atr,
        "avg_atr": round(avg_atr, 2),
        "bandwidth": bb["bandwidth"],
        "ema50": round(ema50, 2),
        "close": curr_close
    }

    # Classification logic
    if atr >= avg_atr * 1.8 or bb["bandwidth"] >= 0.08:
        regime = "HIGH_VOLATILITY"
        compat = ["BOLLINGER_SQUEEZE", "BREAKOUT_VOLATILITY", "DUAL_SUPERTREND"]
        incompat = ["MEAN_REVERSION_ADAPTIVE", "GRID_TRADING"]
        desc = f"High volatility expansion: ATR {atr} is 1.8x average ({avg_atr:.1f}), bandwidth {bb['bandwidth']:.3f}."
    elif adx_val >= 25.0 and plus_di > minus_di and curr_close > ema50:
        regime = "TRENDING_BULLISH"
        compat = ["EMA_ADX_TREND", "BREAKOUT_VOLATILITY", "VWAP_RSI", "TRIPLE_EMA"]
        incompat = ["MEAN_REVERSION_ADAPTIVE"]
        desc = f"Strong bullish trend: ADX {adx_val} (+DI {plus_di:.1f} > -DI {minus_di:.1f}) and close {curr_close} above 50 EMA {ema50:.1f}."
    elif adx_val >= 25.0 and minus_di > plus_di and curr_close < ema50:
        regime = "TRENDING_BEARISH"
        compat = ["EMA_ADX_TREND", "BREAKOUT_VOLATILITY", "VWAP_RSI", "TRIPLE_EMA"]
        incompat = ["MEAN_REVERSION_ADAPTIVE"]
        desc = f"Strong bearish trend: ADX {adx_val} (-DI {minus_di:.1f} > +DI {plus_di:.1f}) and close {curr_close} below 50 EMA {ema50:.1f}."
    else:
        regime = "RANGING_CONSOLIDATION"
        compat = ["MEAN_REVERSION_ADAPTIVE", "RSI_BOLLINGER", "CAMARILLA_PIVOTS"]
        incompat = ["BREAKOUT_VOLATILITY", "EMA_ADX_TREND"]
        desc = f"Range-bound consolidation: ADX {adx_val} below trend threshold 25.0 with low bandwidth {bb['bandwidth']:.3f}."

    return {
        "regime": regime,
        "description": desc,
        "metrics": metrics,
        "compatible_strategies": compat,
        "incompatible_strategies": incompat
    }


# ============================================================================
# 4. 14-BOT CANONICAL STRATEGY COMPATIBILITY MATRIX
# ============================================================================

BOT_STRATEGY_COMPATIBILITY_MATRIX: Dict[int, Dict[str, Any]] = {
    1: {
        "bot_id": 1,
        "bot_name": "Scalper Bot",
        "asset": "NIFTY 50",
        "segment": "NSE F&O Options",
        "instrument_type": "INDEX_FUTURES",
        "compatible_strategies": ["SCALPER_SUPERTREND", "EMA_ADX_TREND", "BREAKOUT_VOLATILITY", "REGIME_FILTER"],
        "incompatible_strategies": ["OPTIONS_GAMMA_SCALPER", "L3_FOOTPRINT"],
        "min_timeframe": "1m",
        "max_leverage": 5.0,
        "lot_size": 65
    },
    2: {
        "bot_id": 2,
        "bot_name": "EMA Trend Bot",
        "asset": "BANKNIFTY",
        "segment": "NSE F&O Options",
        "instrument_type": "INDEX_FUTURES",
        "compatible_strategies": ["TRIPLE_EMA", "EMA_ADX_TREND", "REGIME_FILTER"],
        "incompatible_strategies": ["MEAN_REVERSION_ADAPTIVE", "OPTIONS_GAMMA_SCALPER"],
        "min_timeframe": "3m",
        "max_leverage": 5.0,
        "lot_size": 30
    },
    3: {
        "bot_id": 3,
        "bot_name": "RSI Reversal Bot",
        "asset": "RELIANCE",
        "segment": "NSE Equity",
        "instrument_type": "CASH_EQUITY",
        "compatible_strategies": ["RSI_BOLLINGER", "MEAN_REVERSION_ADAPTIVE", "VWAP_RSI"],
        "incompatible_strategies": ["OPTIONS_GAMMA_SCALPER", "MULTI_INDEX_BETA"],
        "min_timeframe": "5m",
        "max_leverage": 1.0,
        "lot_size": 1
    },
    4: {
        "bot_id": 4,
        "bot_name": "Breakout Bot",
        "asset": "TATA MOTORS",
        "segment": "NSE Equity",
        "instrument_type": "CASH_EQUITY",
        "compatible_strategies": ["DONCHIAN_BREAKOUT", "BREAKOUT_VOLATILITY", "EMA_ADX_TREND"],
        "incompatible_strategies": ["MEAN_REVERSION_ADAPTIVE", "OPTIONS_GAMMA_SCALPER"],
        "min_timeframe": "5m",
        "max_leverage": 1.0,
        "lot_size": 1
    },
    5: {
        "bot_id": 5,
        "bot_name": "Mean Reversion",
        "asset": "FINNIFTY",
        "segment": "NSE F&O Options",
        "instrument_type": "INDEX_FUTURES",
        "compatible_strategies": ["KELTNER_MEAN_REVERSION", "MEAN_REVERSION_ADAPTIVE", "VWAP_RSI"],
        "incompatible_strategies": ["OPTIONS_GAMMA_SCALPER", "L3_FOOTPRINT"],
        "min_timeframe": "5m",
        "max_leverage": 5.0,
        "lot_size": 60
    },
    6: {
        "bot_id": 6,
        "bot_name": "VWAP Momentum",
        "asset": "HDFCBANK",
        "segment": "NSE Equity",
        "instrument_type": "CASH_EQUITY",
        "compatible_strategies": ["VWAP_MOMENTUM", "VWAP_RSI", "EMA_ADX_TREND"],
        "incompatible_strategies": ["OPTIONS_GAMMA_SCALPER", "MULTI_INDEX_BETA"],
        "min_timeframe": "5m",
        "max_leverage": 1.0,
        "lot_size": 1
    },
    7: {
        "bot_id": 7,
        "bot_name": "Volume Spike Bot",
        "asset": "INFY",
        "segment": "NSE Equity",
        "instrument_type": "CASH_EQUITY",
        "compatible_strategies": ["VSA_ABSORPTION", "BREAKOUT_VOLATILITY"],
        "incompatible_strategies": ["OPTIONS_GAMMA_SCALPER", "L3_FOOTPRINT"],
        "min_timeframe": "15m",
        "max_leverage": 1.0,
        "lot_size": 1
    },
    8: {
        "bot_id": 8,
        "bot_name": "SuperTrend Wave",
        "asset": "CRUDE OIL",
        "segment": "MCX Commodities",
        "instrument_type": "COMMODITY_FUTURES",
        "compatible_strategies": ["DUAL_SUPERTREND", "EMA_ADX_TREND", "BREAKOUT_VOLATILITY"],
        "incompatible_strategies": ["VWAP_RSI", "OPTIONS_GAMMA_SCALPER"],
        "min_timeframe": "15m",
        "max_leverage": 2.0,
        "lot_size": 100
    },
    9: {
        "bot_id": 9,
        "bot_name": "Bollinger Band Squeeze",
        "asset": "GOLD (XAUUSD)",
        "segment": "MCX Commodities",
        "instrument_type": "COMMODITY_FUTURES",
        "compatible_strategies": ["BOLLINGER_SQUEEZE", "BREAKOUT_VOLATILITY", "REGIME_FILTER"],
        "incompatible_strategies": ["OPTIONS_GAMMA_SCALPER", "VWAP_RSI"],
        "min_timeframe": "15m",
        "max_leverage": 2.0,
        "lot_size": 1
    },
    10: {
        "bot_id": 10,
        "bot_name": "Pivot Point Reversal",
        "asset": "SILVER (XAGUSD)",
        "segment": "MCX Commodities",
        "instrument_type": "COMMODITY_FUTURES",
        "compatible_strategies": ["CAMARILLA_PIVOTS", "MEAN_REVERSION_ADAPTIVE"],
        "incompatible_strategies": ["OPTIONS_GAMMA_SCALPER", "L3_FOOTPRINT"],
        "min_timeframe": "15m",
        "max_leverage": 2.0,
        "lot_size": 1
    },
    11: {
        "bot_id": 11,
        "bot_name": "Multi-Timeframe Alpha",
        "asset": "USDINR",
        "segment": "Currency Derivatives",
        "instrument_type": "CURRENCY_FUTURES",
        "compatible_strategies": ["ICHIMOKU_CLOUD", "EMA_ADX_TREND", "REGIME_FILTER"],
        "incompatible_strategies": ["OPTIONS_GAMMA_SCALPER", "VSA_ABSORPTION"],
        "min_timeframe": "15m",
        "max_leverage": 4.0,
        "lot_size": 1000
    },
    12: {
        "bot_id": 12,
        "bot_name": "Iron Condor Bot",
        "asset": "NIFTY OPTIONS",
        "segment": "NSE F&O Options",
        "instrument_type": "INDEX_OPTIONS",
        "compatible_strategies": ["GAMMA_SCALPER", "VOLATILITY_EXPANSION"],
        "incompatible_strategies": ["CASH_EQUITY_SCALPER", "DONCHIAN_BREAKOUT"],
        "min_timeframe": "3m",
        "max_leverage": 1.0,
        "lot_size": 65
    },
    13: {
        "bot_id": 13,
        "bot_name": "Grid Trading Bot",
        "asset": "BANKNIFTY OPT",
        "segment": "NSE F&O Options",
        "instrument_type": "INDEX_OPTIONS",
        "compatible_strategies": ["ORDER_FLOW_IMBALANCE", "L3_FOOTPRINT"],
        "incompatible_strategies": ["CASH_EQUITY_SCALPER", "DONCHIAN_BREAKOUT"],
        "min_timeframe": "1m",
        "max_leverage": 1.0,
        "lot_size": 30
    },
    14: {
        "bot_id": 14,
        "bot_name": "Smart Master Bot",
        "asset": "SENSEX",
        "segment": "BSE Derivatives",
        "instrument_type": "MULTI_ASSET_DERIVATIVE",
        "compatible_strategies": ["MULTI_INDEX_BETA", "REGIME_FILTER", "EMA_ADX_TREND", "BREAKOUT_VOLATILITY"],
        "incompatible_strategies": [],
        "min_timeframe": "5m",
        "max_leverage": 3.0,
        "lot_size": 10
    }
}


def validate_bot_strategy_compatibility(bot_id: int, strategy_id: str) -> Tuple[bool, str]:
    """
    Validates whether a proposed strategy is compatible with a given bot's instrument type and market segment.
    """
    matrix = BOT_STRATEGY_COMPATIBILITY_MATRIX.get(bot_id)
    if not matrix:
        return False, f"Bot ID {bot_id} not registered in compatibility matrix."

    strat_clean = str(strategy_id).upper().strip()

    # Check explicit incompatibility
    for incomp in matrix["incompatible_strategies"]:
        if incomp in strat_clean or strat_clean in incomp:
            return False, f"Incompatible: Strategy '{strategy_id}' is prohibited for Bot #{bot_id} ({matrix['bot_name']}) due to instrument restrictions ({matrix['instrument_type']})."

    # Check explicit compatibility
    for comp in matrix["compatible_strategies"]:
        if comp in strat_clean or strat_clean in comp:
            return True, f"Strategy '{strategy_id}' is compatible with Bot #{bot_id} ({matrix['bot_name']})."

    # Default conservative rule for custom strategies: require appropriate asset classification
    inst_type = matrix["instrument_type"]
    if "OPTION" in strat_clean and "OPTIONS" not in inst_type:
        return False, f"Options strategy prohibited on non-options bot #{bot_id} ({matrix['bot_name']})."

    return True, f"Strategy '{strategy_id}' permitted under generic parameters for Bot #{bot_id}."


# ============================================================================
# 5. MULTI-METRIC STRATEGY RANKING (PHASE 14)
# ============================================================================

def calculate_multi_metric_ranking(
    candidates: List[Dict[str, Any]],
    current_regime: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Computes deterministic multi-metric ranking across candidate strategies.
    Metrics evaluated:
      1. Net Expectancy after realistic statutory charges and slippage:
         E = (WinRate * AvgWin) - (LossRate * AvgLoss) - TotalFriction
      2. Maximum Drawdown Penalty:
         Penalizes deep drawdown relative to risk budget.
      3. Profit Factor:
         Ratio of gross profits to gross losses (capped at 10.0 for robust scale).
      4. Sample Size Confidence:
         Penalizes insufficient trade history (sqrt(min(N, 30) / 30)).
      5. Slippage Sensitivity:
         Measures percentage reduction in net edge under adverse execution friction.
      6. Market Regime Compatibility:
         Multiplicative factor (1.25x boost for compatible, 0.40x penalty for incompatible).
    """
    ranked_results = []

    for c in candidates:
        strat_id = str(c.get("strategy_id", c.get("id", "UNKNOWN")))
        strat_name = str(c.get("strategy_name", c.get("name", strat_id)))
        
        # 1. Sample Size & Win Rate
        sample_size = int(c.get("sample_size", c.get("trades_count", 0)))
        raw_win_rate = float(c.get("win_rate", 0.0))
        win_rate = raw_win_rate / 100.0 if raw_win_rate > 1.0 else max(0.0, min(1.0, raw_win_rate))
        loss_rate = 1.0 - win_rate

        avg_win = float(c.get("avg_win", 0.0))
        avg_loss = abs(float(c.get("avg_loss", 0.0)))

        # Transaction cost & slippage friction
        statutory_cost = float(c.get("cost_per_trade", 40.0))
        slippage_drag_pct = float(c.get("slippage_drag_pct", 0.0005))  # 0.05% baseline
        slippage_cost = avg_win * slippage_drag_pct
        total_friction = statutory_cost + slippage_cost

        # Net Expectancy
        gross_expectancy = (win_rate * avg_win) - (loss_rate * avg_loss)
        net_expectancy = round(gross_expectancy - total_friction, 2)

        # 2. Profit Factor
        if "profit_factor" in c and c["profit_factor"] is not None:
            profit_factor = float(c["profit_factor"])
        else:
            total_gains = win_rate * avg_win * max(1, sample_size)
            total_losses = loss_rate * avg_loss * max(1, sample_size)
            if total_losses > 0:
                profit_factor = round(total_gains / total_losses, 2)
            else:
                profit_factor = 10.0 if total_gains > 0 else 0.0
        profit_factor = min(10.0, max(0.0, profit_factor))

        # 3. Maximum Drawdown
        max_dd_pct = float(c.get("max_drawdown_pct", 0.0))
        # Drawdown score: 100 for 0% DD, drops linearly to 0 at 33.3% DD
        dd_score = max(0.0, 100.0 - (max_dd_pct * 3.0))

        # 4. Sample Size Confidence
        # Scaled by square root of trades up to 30 trades
        sample_confidence = round(min(1.0, math.sqrt(sample_size / 30.0)), 2) if sample_size >= 5 else round((sample_size / 30.0) * 0.5, 2)

        # 5. Slippage Sensitivity
        # Measured as slippage cost relative to gross edge
        if abs(gross_expectancy) > 0.01:
            slippage_impact_pct = round((slippage_cost / abs(gross_expectancy)) * 100.0, 2)
        else:
            slippage_impact_pct = 100.0
        slippage_resilience_score = max(0.0, min(100.0, 100.0 - slippage_impact_pct))

        # 6. Market Regime Compatibility
        compat_regimes = [str(r).upper() for r in (c.get("compatible_regimes") or [])]
        incompat_regimes = [str(r).upper() for r in (c.get("incompatible_regimes") or [])]
        
        regime_factor = 1.0
        regime_status = "NEUTRAL"
        if current_regime:
            cur_reg_upper = str(current_regime).upper()
            if any(cur_reg_upper in r or r in cur_reg_upper for r in compat_regimes):
                regime_factor = 1.25
                regime_status = "BOOSTED_COMPATIBLE"
            elif any(cur_reg_upper in r or r in cur_reg_upper for r in incompat_regimes):
                regime_factor = 0.40
                regime_status = "PENALIZED_INCOMPATIBLE"

        # Composite Score Calculation (0.0 - 100.0)
        # Normalized Expectancy Score (0 at <= 0, 100 at expectancy >= 1000)
        norm_expectancy_score = max(0.0, min(100.0, (net_expectancy / 1000.0) * 100.0)) if net_expectancy > 0 else 0.0
        norm_pf_score = min(100.0, (profit_factor / 3.0) * 100.0)

        base_score = (
            (norm_expectancy_score * 0.30) +
            (norm_pf_score * 0.20) +
            (dd_score * 0.20) +
            (sample_confidence * 100.0 * 0.15) +
            (slippage_resilience_score * 0.15)
        )

        final_composite_score = round(min(100.0, max(0.0, base_score * regime_factor)), 2)

        ranked_results.append({
            "strategy_id": strat_id,
            "strategy_name": strat_name,
            "sample_size": sample_size,
            "win_rate_pct": round(win_rate * 100.0, 2),
            "net_expectancy": net_expectancy,
            "profit_factor": profit_factor,
            "max_drawdown_pct": max_dd_pct,
            "drawdown_score": round(dd_score, 2),
            "sample_confidence": sample_confidence,
            "slippage_impact_pct": slippage_impact_pct,
            "slippage_resilience_score": round(slippage_resilience_score, 2),
            "regime_status": regime_status,
            "regime_multiplier": regime_factor,
            "base_score": round(base_score, 2),
            "composite_score": final_composite_score
        })

    # Sort descending by composite score
    ranked_results.sort(key=lambda x: x["composite_score"], reverse=True)
    for rank_idx, item in enumerate(ranked_results, 1):
        item["rank"] = rank_idx

    return ranked_results




