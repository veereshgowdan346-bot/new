"""
CHINTU AI TRADING SYSTEM - Quantitative Strategy & Indicator Engine (Phase 5)
Pure mathematical indicator calculations and deterministic strategy evaluators for all 14 bots.
Zero synthetic random values. Zero third-party library dependencies (pure Python math).
"""

import math
try:
    from server.bot_registry import CANONICAL_BOT_REGISTRY, get_bot_by_id
except ImportError:
    from bot_registry import CANONICAL_BOT_REGISTRY, get_bot_by_id


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

def evaluate_bot_strategy(bot_id: int, market_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deterministically evaluates strategy logic for a given bot using real candle arrays.
    Returns:
    {
        "bot_id": int,
        "bot_name": str,
        "strategy_id": str,
        "decision": "BUY" | "SELL" | "HOLD" | "NO_TRADE",
        "reason": str,
        "indicators": Dict[str, Any],
        "confidence": float,
        "status": "DATA_READY" | "INSUFFICIENT_DATA" | "DATA_UNAVAILABLE" | "INVALID_DATA"
    }
    """
    bot = get_bot_by_id(bot_id)
    if not bot:
        return {
            "bot_id": bot_id,
            "bot_name": f"Unknown Bot #{bot_id}",
            "strategy_id": "UNKNOWN",
            "decision": "NO_TRADE",
            "reason": f"Bot ID {bot_id} not registered in canonical registry.",
            "indicators": {},
            "confidence": 0.0,
            "status": "INVALID_DATA"
        }

    # 1. Advanced strategies requiring unavailable data dependencies
    # (Options Greeks, Order book footprint, Multi-index beta covariance)
    if bot["data_readiness"] == "DATA_UNAVAILABLE":
        req = bot["required_data"]
        # Check if caller supplied genuine specialized data
        if req == "OPTION_CHAIN_L2" and not market_data.get("option_greeks"):
            return {
                "bot_id": bot_id,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "NO_TRADE",
                "reason": f"Strategy '{bot['strategy_name']}' requires live L2 option chain Greeks feed, which is currently unavailable.",
                "indicators": {},
                "confidence": 0.0,
                "status": "DATA_UNAVAILABLE"
            }
        elif req == "L3_FOOTPRINT_TICK" and not market_data.get("footprint_depth"):
            return {
                "bot_id": bot_id,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "NO_TRADE",
                "reason": f"Strategy '{bot['strategy_name']}' requires L3 order book footprint delta depth, which is currently unavailable.",
                "indicators": {},
                "confidence": 0.0,
                "status": "DATA_UNAVAILABLE"
            }
        elif req == "MULTI_INDEX_BETA" and not market_data.get("multi_index_beta"):
            return {
                "bot_id": bot_id,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "NO_TRADE",
                "reason": f"Strategy '{bot['strategy_name']}' requires real-time multi-index beta covariance matrix, which is currently unavailable.",
                "indicators": {},
                "confidence": 0.0,
                "status": "DATA_UNAVAILABLE"
            }

    # 2. Extract and validate OHLCV candle arrays
    candles = market_data.get("candles", [])
    min_required = bot["min_candles_required"]

    if not isinstance(candles, list) or len(candles) < min_required:
        return {
            "bot_id": bot_id,
            "bot_name": bot["name"],
            "strategy_id": bot["strategy_id"],
            "decision": "NO_TRADE",
            "reason": f"Insufficient candle data: received {len(candles) if isinstance(candles, list) else 0} candles, minimum {min_required} required.",
            "indicators": {},
            "confidence": 0.0,
            "status": "INSUFFICIENT_DATA"
        }

    # Extract price vectors
    try:
        highs = [float(c["high"]) for c in candles]
        lows = [float(c["low"]) for c in candles]
        closes = [float(c["close"]) for c in candles]
        volumes = [float(c.get("volume", 1.0)) for c in candles]
    except (KeyError, ValueError, TypeError) as err:
        return {
            "bot_id": bot_id,
            "bot_name": bot["name"],
            "strategy_id": bot["strategy_id"],
            "decision": "NO_TRADE",
            "reason": f"Invalid candle format or non-numeric price data: {str(err)}",
            "indicators": {},
            "confidence": 0.0,
            "status": "INVALID_DATA"
        }

    # Validate physical price boundaries
    if any(p <= 0 for p in closes):
        return {
            "bot_id": bot_id,
            "bot_name": bot["name"],
            "strategy_id": bot["strategy_id"],
            "decision": "NO_TRADE",
            "reason": "Malformed market data: candle closes contain non-positive values.",
            "indicators": {},
            "confidence": 0.0,
            "status": "INVALID_DATA"
        }

    curr_close = closes[-1]
    curr_high = highs[-1]
    curr_low = lows[-1]

    # ========================================================================
    # STRATEGY 1: Scalper Bot (SuperTrend 10,2 + MACD Histogram)
    # ========================================================================
    if bot_id == 1:
        st = calculate_supertrend(highs, lows, closes, period=10, multiplier=2.0)
        macd = calculate_macd(closes, fast=12, slow=26, signal=9)

        indicators = {"supertrend": st["supertrend"], "direction": st["direction"], "macd_hist": macd["hist"]}
        if st["direction"] == "UP" and macd["hist"] > 0:
            return {
                "bot_id": 1,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "BUY",
                "reason": f"SuperTrend is bullish ({st['supertrend']}) and MACD histogram is expanding (+{macd['hist']}).",
                "indicators": indicators,
                "confidence": 0.84,
                "status": "DATA_READY"
            }
        elif st["direction"] == "DOWN" and macd["hist"] < 0:
            return {
                "bot_id": 1,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "SELL",
                "reason": f"SuperTrend is bearish ({st['supertrend']}) and MACD histogram is negative ({macd['hist']}).",
                "indicators": indicators,
                "confidence": 0.84,
                "status": "DATA_READY"
            }
        return {
            "bot_id": 1,
            "bot_name": bot["name"],
            "strategy_id": bot["strategy_id"],
            "decision": "HOLD",
            "reason": f"SuperTrend direction ({st['direction']}) disagrees with MACD histogram ({macd['hist']}).",
            "indicators": indicators,
            "confidence": 0.50,
            "status": "DATA_READY"
        }

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
            return {
                "bot_id": 2,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "BUY",
                "reason": f"Triple EMA bullish stack confirmed: EMA9 ({ema9:.1f}) > EMA21 ({ema21:.1f}) > EMA55 ({ema55:.1f}).",
                "indicators": indicators,
                "confidence": 0.88,
                "status": "DATA_READY"
            }
        elif ema9 < ema21 < ema55 and curr_close < ema9:
            return {
                "bot_id": 2,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "SELL",
                "reason": f"Triple EMA bearish stack confirmed: EMA9 ({ema9:.1f}) < EMA21 ({ema21:.1f}) < EMA55 ({ema55:.1f}).",
                "indicators": indicators,
                "confidence": 0.88,
                "status": "DATA_READY"
            }
        return {
            "bot_id": 2,
            "bot_name": bot["name"],
            "strategy_id": bot["strategy_id"],
            "decision": "HOLD",
            "reason": f"EMAs in neutral consolidation (EMA9: {ema9:.1f}, EMA21: {ema21:.1f}, EMA55: {ema55:.1f}).",
            "indicators": indicators,
            "confidence": 0.50,
            "status": "DATA_READY"
        }

    # ========================================================================
    # STRATEGY 3: RSI Reversal Bot (RSI 14 + Bollinger Band %B)
    # ========================================================================
    elif bot_id == 3:
        rsi = calculate_rsi(closes, 14)
        bb = calculate_bollinger_bands(closes, 20, 2.0)

        indicators = {"rsi": rsi, "upper_bb": bb["upper"], "lower_bb": bb["lower"], "pct_b": bb["pct_b"]}
        if rsi <= 30.0 and curr_close <= bb["lower"]:
            return {
                "bot_id": 3,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "BUY",
                "reason": f"RSI oversold ({rsi} <= 30.0) at lower Bollinger Band ({bb['lower']}).",
                "indicators": indicators,
                "confidence": 0.82,
                "status": "DATA_READY"
            }
        elif rsi >= 70.0 and curr_close >= bb["upper"]:
            return {
                "bot_id": 3,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "SELL",
                "reason": f"RSI overbought ({rsi} >= 70.0) at upper Bollinger Band ({bb['upper']}).",
                "indicators": indicators,
                "confidence": 0.82,
                "status": "DATA_READY"
            }
        return {
            "bot_id": 3,
            "bot_name": bot["name"],
            "strategy_id": bot["strategy_id"],
            "decision": "HOLD",
            "reason": f"RSI is neutral ({rsi}) within Bollinger bounds ({bb['lower']} - {bb['upper']}).",
            "indicators": indicators,
            "confidence": 0.50,
            "status": "DATA_READY"
        }

    # ========================================================================
    # STRATEGY 4: Breakout Bot (Donchian Channel 20 + Volume Expansion)
    # ========================================================================
    elif bot_id == 4:
        dc = calculate_donchian_channel(highs[:-1], lows[:-1], 20)
        avg_vol = sum(volumes[-20:-1]) / 19.0 if len(volumes) >= 20 else volumes[-1]
        curr_vol = volumes[-1]

        indicators = {"donchian_upper": dc["upper"], "donchian_lower": dc["lower"], "volume_ratio": round(curr_vol / avg_vol, 2) if avg_vol > 0 else 1.0}
        if curr_high > dc["upper"] and curr_vol >= avg_vol * 1.2:
            return {
                "bot_id": 4,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "BUY",
                "reason": f"Donchian 20-period breakout above {dc['upper']} with volume {indicators['volume_ratio']}x average.",
                "indicators": indicators,
                "confidence": 0.86,
                "status": "DATA_READY"
            }
        elif curr_low < dc["lower"] and curr_vol >= avg_vol * 1.2:
            return {
                "bot_id": 4,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "SELL",
                "reason": f"Donchian 20-period breakdown below {dc['lower']} with volume {indicators['volume_ratio']}x average.",
                "indicators": indicators,
                "confidence": 0.86,
                "status": "DATA_READY"
            }
        return {
            "bot_id": 4,
            "bot_name": bot["name"],
            "strategy_id": bot["strategy_id"],
            "decision": "HOLD",
            "reason": f"Price within Donchian channel ({dc['lower']} - {dc['upper']}).",
            "indicators": indicators,
            "confidence": 0.50,
            "status": "DATA_READY"
        }

    # ========================================================================
    # STRATEGY 5: Mean Reversion (Keltner Channel 20, 1.5 ATR)
    # ========================================================================
    elif bot_id == 5:
        kc = calculate_keltner_channel(highs, lows, closes, ema_period=20, atr_period=10, multiplier=1.5)
        indicators = {"keltner_upper": kc["upper"], "keltner_lower": kc["lower"], "middle": kc["middle"]}
        if curr_close <= kc["lower"]:
            return {
                "bot_id": 5,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "BUY",
                "reason": f"Price ({curr_close}) extended below Keltner lower band ({kc['lower']}); statistical reversion expected.",
                "indicators": indicators,
                "confidence": 0.79,
                "status": "DATA_READY"
            }
        elif curr_close >= kc["upper"]:
            return {
                "bot_id": 5,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "SELL",
                "reason": f"Price ({curr_close}) extended above Keltner upper band ({kc['upper']}); mean reversion expected.",
                "indicators": indicators,
                "confidence": 0.79,
                "status": "DATA_READY"
            }
        return {
            "bot_id": 5,
            "bot_name": bot["name"],
            "strategy_id": bot["strategy_id"],
            "decision": "HOLD",
            "reason": f"Price inside Keltner channel ({kc['lower']} - {kc['upper']}).",
            "indicators": indicators,
            "confidence": 0.50,
            "status": "DATA_READY"
        }

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
            return {
                "bot_id": 6,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "BUY",
                "reason": f"Institutional VWAP bounce: close {curr_close} holding above session VWAP {vwap}.",
                "indicators": indicators,
                "confidence": 0.81,
                "status": "DATA_READY"
            }
        elif curr_close < vwap and curr_close >= lower_1s and closes[-2] >= vwap:
            return {
                "bot_id": 6,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "SELL",
                "reason": f"Institutional VWAP rejection: close {curr_close} breaking below session VWAP {vwap}.",
                "indicators": indicators,
                "confidence": 0.81,
                "status": "DATA_READY"
            }
        return {
            "bot_id": 6,
            "bot_name": bot["name"],
            "strategy_id": bot["strategy_id"],
            "decision": "HOLD",
            "reason": f"Price tracking normal VWAP distribution band ({lower_1s} - {upper_1s}).",
            "indicators": indicators,
            "confidence": 0.50,
            "status": "DATA_READY"
        }

    # ========================================================================
    # STRATEGY 7: Volume Spike Bot (VSA Absorption)
    # ========================================================================
    elif bot_id == 7:
        vol_sma = sum(volumes[-20:-1]) / 19.0 if len(volumes) >= 20 else volumes[-1]
        curr_vol = volumes[-1]
        spread = curr_high - curr_low
        avg_spread = sum(highs[i] - lows[i] for i in range(-20, -1)) / 19.0 if len(highs) >= 20 else spread

        indicators = {"volume_ratio": round(curr_vol / vol_sma, 2) if vol_sma > 0 else 1.0, "spread_ratio": round(spread / avg_spread, 2) if avg_spread > 0 else 1.0}
        is_high_volume = curr_vol >= vol_sma * 1.8
        is_wide_spread = spread >= avg_spread * 1.3

        if is_high_volume and is_wide_spread and curr_close > (curr_low + spread * 0.6):
            return {
                "bot_id": 7,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "BUY",
                "reason": f"VSA Absorption: High volume ({indicators['volume_ratio']}x) stopping candle closing near highs.",
                "indicators": indicators,
                "confidence": 0.83,
                "status": "DATA_READY"
            }
        elif is_high_volume and is_wide_spread and curr_close < (curr_low + spread * 0.4):
            return {
                "bot_id": 7,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "SELL",
                "reason": f"VSA Climax Distribution: Ultra-high volume ({indicators['volume_ratio']}x) closing near lows.",
                "indicators": indicators,
                "confidence": 0.83,
                "status": "DATA_READY"
            }
        return {
            "bot_id": 7,
            "bot_name": bot["name"],
            "strategy_id": bot["strategy_id"],
            "decision": "HOLD",
            "reason": f"Volume ({indicators['volume_ratio']}x) and spread ({indicators['spread_ratio']}x) within normal limits.",
            "indicators": indicators,
            "confidence": 0.50,
            "status": "DATA_READY"
        }

    # ========================================================================
    # STRATEGY 8: SuperTrend Wave (Dual SuperTrend 7,3 + 14,2)
    # ========================================================================
    elif bot_id == 8:
        st_fast = calculate_supertrend(highs, lows, closes, period=7, multiplier=3.0)
        st_slow = calculate_supertrend(highs, lows, closes, period=14, multiplier=2.0)

        indicators = {"fast_dir": st_fast["direction"], "slow_dir": st_slow["direction"], "fast_val": st_fast["supertrend"], "slow_val": st_slow["supertrend"]}
        if st_fast["direction"] == "UP" and st_slow["direction"] == "UP":
            return {
                "bot_id": 8,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "BUY",
                "reason": f"Dual SuperTrend bullish confluence: Fast ST(7,3) and Slow ST(14,2) both signaling UP.",
                "indicators": indicators,
                "confidence": 0.87,
                "status": "DATA_READY"
            }
        elif st_fast["direction"] == "DOWN" and st_slow["direction"] == "DOWN":
            return {
                "bot_id": 8,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "SELL",
                "reason": f"Dual SuperTrend bearish confluence: Fast ST(7,3) and Slow ST(14,2) both signaling DOWN.",
                "indicators": indicators,
                "confidence": 0.87,
                "status": "DATA_READY"
            }
        return {
            "bot_id": 8,
            "bot_name": bot["name"],
            "strategy_id": bot["strategy_id"],
            "decision": "HOLD",
            "reason": f"Dual SuperTrend divergence: Fast ({st_fast['direction']}) vs Slow ({st_slow['direction']}).",
            "indicators": indicators,
            "confidence": 0.50,
            "status": "DATA_READY"
        }

    # ========================================================================
    # STRATEGY 9: Bollinger Band Squeeze (Bollinger + Keltner)
    # ========================================================================
    elif bot_id == 9:
        bb = calculate_bollinger_bands(closes, 20, 2.0)
        kc = calculate_keltner_channel(highs, lows, closes, 20, 10, 1.5)

        is_squeeze = bb["upper"] <= kc["upper"] and bb["lower"] >= kc["lower"]
        indicators = {"squeeze_active": is_squeeze, "bandwidth": bb["bandwidth"], "upper_bb": bb["upper"], "lower_bb": bb["lower"]}

        if not is_squeeze and curr_close > bb["upper"] and closes[-2] <= bb["upper"]:
            return {
                "bot_id": 9,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "BUY",
                "reason": f"Volatility Squeeze release upward: Close {curr_close} breaking above upper BB {bb['upper']}.",
                "indicators": indicators,
                "confidence": 0.85,
                "status": "DATA_READY"
            }
        elif not is_squeeze and curr_close < bb["lower"] and closes[-2] >= bb["lower"]:
            return {
                "bot_id": 9,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "SELL",
                "reason": f"Volatility Squeeze release downward: Close {curr_close} breaking below lower BB {bb['lower']}.",
                "indicators": indicators,
                "confidence": 0.85,
                "status": "DATA_READY"
            }
        return {
            "bot_id": 9,
            "bot_name": bot["name"],
            "strategy_id": bot["strategy_id"],
            "decision": "HOLD",
            "reason": f"Volatility Squeeze {'active inside Keltner channel' if is_squeeze else 'awaiting directional expansion'}.",
            "indicators": indicators,
            "confidence": 0.50,
            "status": "DATA_READY"
        }

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
            return {
                "bot_id": 10,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "BUY",
                "reason": f"Camarilla L3 reversal bounce: Low {curr_low} tested L3 ({cam['l3']}) and closed above.",
                "indicators": indicators,
                "confidence": 0.80,
                "status": "DATA_READY"
            }
        elif curr_high >= cam["h3"] and curr_close < cam["h3"]:
            return {
                "bot_id": 10,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "SELL",
                "reason": f"Camarilla H3 reversal rejection: High {curr_high} tested H3 ({cam['h3']}) and closed below.",
                "indicators": indicators,
                "confidence": 0.80,
                "status": "DATA_READY"
            }
        return {
            "bot_id": 10,
            "bot_name": bot["name"],
            "strategy_id": bot["strategy_id"],
            "decision": "HOLD",
            "reason": f"Price within Camarilla L3 ({cam['l3']}) and H3 ({cam['h3']}) boundaries.",
            "indicators": indicators,
            "confidence": 0.50,
            "status": "DATA_READY"
        }

    # ========================================================================
    # STRATEGY 11: Multi-Timeframe Confluence (Ichimoku Cloud)
    # ========================================================================
    elif bot_id == 11:
        ichi = calculate_ichimoku(highs, lows, 9, 26, 52)
        indicators = {"tenkan": ichi["tenkan"], "kijun": ichi["kijun"], "senkou_a": ichi["senkou_a"], "senkou_b": ichi["senkou_b"]}
        cloud_top = max(ichi["senkou_a"], ichi["senkou_b"])
        cloud_bottom = min(ichi["senkou_a"], ichi["senkou_b"])

        if curr_close > cloud_top and ichi["tenkan"] > ichi["kijun"]:
            return {
                "bot_id": 11,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "BUY",
                "reason": f"Ichimoku bullish breakout: Close {curr_close} above Kumo Cloud ({cloud_top}) and Tenkan > Kijun.",
                "indicators": indicators,
                "confidence": 0.86,
                "status": "DATA_READY"
            }
        elif curr_close < cloud_bottom and ichi["tenkan"] < ichi["kijun"]:
            return {
                "bot_id": 11,
                "bot_name": bot["name"],
                "strategy_id": bot["strategy_id"],
                "decision": "SELL",
                "reason": f"Ichimoku bearish breakdown: Close {curr_close} below Kumo Cloud ({cloud_bottom}) and Tenkan < Kijun.",
                "indicators": indicators,
                "confidence": 0.86,
                "status": "DATA_READY"
            }
        return {
            "bot_id": 11,
            "bot_name": bot["name"],
            "strategy_id": bot["strategy_id"],
            "decision": "HOLD",
            "reason": f"Price inside or consolidating around Ichimoku Cloud ({cloud_bottom} - {cloud_top}).",
            "indicators": indicators,
            "confidence": 0.50,
            "status": "DATA_READY"
        }

    # Fallback for any unhandled bot
    return {
        "bot_id": bot_id,
        "bot_name": bot["name"],
        "strategy_id": bot["strategy_id"],
        "decision": "NO_TRADE",
        "reason": f"No active strategy handler for bot ID {bot_id}.",
        "indicators": {},
        "confidence": 0.0,
        "status": "INVALID_DATA"
    }


# Convenient alias
evaluate_strategy = evaluate_bot_strategy
