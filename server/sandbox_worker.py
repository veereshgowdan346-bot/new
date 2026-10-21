"""
CHINTU AI TRADING SYSTEM - Sandboxed Strategy Subprocess Worker
Runs in an isolated Python interpreter (-I flag, zero parent credentials).
Receives JSON payload via stdin, restricts builtins, evaluates strategy, and emits JSON via stdout.
"""

import sys
import json
import math
import time

# Pure technical indicator calculations for isolated environment
def calculate_sma(series, period):
    if not series or period <= 0 or len(series) < period:
        return []
    smas = []
    current_sum = sum(series[:period])
    smas.append(current_sum / period)
    for i in range(period, len(series)):
        current_sum += series[i] - series[i - period]
        smas.append(current_sum / period)
    return smas

def calculate_ema(series, period):
    if not series or period <= 0 or len(series) < period:
        return []
    k = 2.0 / (period + 1.0)
    sma_init = sum(series[:period]) / period
    emas = [sma_init]
    for price in series[period:]:
        ema_val = (price * k) + (emas[-1] * (1.0 - k))
        emas.append(ema_val)
    return emas

def calculate_rsi(closes, period=14):
    if not closes or len(closes) <= period:
        return 50.0
    gains, losses = [], []
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

def calculate_atr(highs, lows, closes, period=14):
    if not highs or not lows or not closes or len(highs) < period + 1:
        return 0.0
    trs = []
    for i in range(1, len(highs)):
        h, l, c_prev = highs[i], lows[i], closes[i - 1]
        trs.append(max(h - l, abs(h - c_prev), abs(l - c_prev)))
    if len(trs) < period:
        return 0.0
    atr = sum(trs[:period]) / period
    for i in range(period, len(trs)):
        atr = ((atr * (period - 1)) + trs[i]) / period
    return round(atr, 2)

def calculate_macd(closes, fast=12, slow=26, signal=9):
    if not closes or len(closes) < slow + signal:
        return 0.0, 0.0, 0.0
    ema_fast = calculate_ema(closes, fast)
    ema_slow = calculate_ema(closes, slow)
    offset = slow - fast
    aligned_fast = ema_fast[offset:]
    macd_line_series = [aligned_fast[i] - ema_slow[i] for i in range(len(ema_slow))]
    signal_series = calculate_ema(macd_line_series, signal)
    if not signal_series:
        return 0.0, 0.0, 0.0
    macd_val = round(macd_line_series[-1], 2)
    sig_val = round(signal_series[-1], 2)
    hist_val = round(macd_val - sig_val, 2)
    return macd_val, sig_val, hist_val

def calculate_supertrend(highs, lows, closes, period=10, multiplier=3.0):
    if not highs or not lows or not closes or len(highs) < period + 1:
        return 1, (closes[-1] if closes else 0.0)
    trs = []
    for i in range(1, len(highs)):
        h, l, c_prev = highs[i], lows[i], closes[i - 1]
        trs.append(max(h - l, abs(h - c_prev), abs(l - c_prev)))
    atrs = []
    curr_atr = sum(trs[:period]) / period
    atrs.append(curr_atr)
    for i in range(period, len(trs)):
        curr_atr = ((curr_atr * (period - 1)) + trs[i]) / period
        atrs.append(curr_atr)
    h_slice = highs[period:]
    l_slice = lows[period:]
    c_slice = closes[period:]
    final_upper = [0.0] * len(c_slice)
    final_lower = [0.0] * len(c_slice)
    trend = [1] * len(c_slice)
    st = [0.0] * len(c_slice)
    for i in range(len(c_slice)):
        mid = (h_slice[i] + l_slice[i]) / 2.0
        basic_upper = mid + (multiplier * atrs[i])
        basic_lower = mid - (multiplier * atrs[i])
        if i == 0:
            final_upper[i] = basic_upper
            final_lower[i] = basic_lower
            st[i] = final_lower[i]
            trend[i] = 1
        else:
            prev_close = c_slice[i - 1]
            final_upper[i] = basic_upper if (basic_upper < final_upper[i - 1] or prev_close > final_upper[i - 1]) else final_upper[i - 1]
            final_lower[i] = basic_lower if (basic_lower > final_lower[i - 1] or prev_close < final_lower[i - 1]) else final_lower[i - 1]
            prev_trend = trend[i - 1]
            if prev_trend == 1 and c_slice[i] < final_lower[i - 1]:
                trend[i] = -1
            elif prev_trend == -1 and c_slice[i] > final_upper[i - 1]:
                trend[i] = 1
            else:
                trend[i] = prev_trend
            st[i] = final_lower[i] if trend[i] == 1 else final_upper[i]
    return trend[-1], round(st[-1], 2)

def calculate_bollinger_bands(closes, period=20, std_dev=2.0):
    if not closes or len(closes) < period:
        c = closes[-1] if closes else 0.0
        return c, c, c
    smas = calculate_sma(closes, period)
    middle = smas[-1]
    window = closes[-period:]
    variance = sum((x - middle) ** 2 for x in window) / period
    stdev = math.sqrt(variance)
    upper = round(middle + (std_dev * stdev), 2)
    lower = round(middle - (std_dev * stdev), 2)
    return upper, round(middle, 2), lower

def calculate_vwap(highs, lows, closes, volumes):
    if not highs or not lows or not closes or not volumes or len(closes) != len(volumes):
        return closes[-1] if closes else 0.0
    cum_pv = 0.0
    cum_v = 0.0
    for i in range(len(closes)):
        typical_price = (highs[i] + lows[i] + closes[i]) / 3.0
        cum_pv += typical_price * volumes[i]
        cum_v += volumes[i]
    return round(cum_pv / cum_v, 2) if cum_v > 0 else round(closes[-1], 2)


SAFE_BUILTINS = {
    "abs": abs, "min": min, "max": max, "sum": sum, "round": round,
    "len": len, "range": range, "float": float, "int": int, "str": str,
    "bool": bool, "list": list, "dict": dict, "tuple": tuple, "set": set,
    "isinstance": isinstance, "enumerate": enumerate, "zip": zip,
    "math": math
}


def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input:
            print(json.dumps({"success": False, "error": "No input payload received on stdin."}))
            return

        payload = json.loads(raw_input)
        code = payload.get("code", "")
        market_data = payload.get("market_data", {})

        sandbox_globals = dict(SAFE_BUILTINS)
        sandbox_globals.update({
            "calculate_sma": calculate_sma,
            "calculate_ema": calculate_ema,
            "calculate_rsi": calculate_rsi,
            "calculate_macd": calculate_macd,
            "calculate_supertrend": calculate_supertrend,
            "calculate_bollinger_bands": calculate_bollinger_bands,
            "calculate_atr": calculate_atr,
            "calculate_vwap": calculate_vwap,
            "math": math
        })

        local_vars = {}
        compiled = compile(code, "<sandboxed_strategy>", "exec")
        exec(compiled, sandbox_globals, local_vars)

        eval_func = local_vars.get("evaluate")
        if not eval_func and "Strategy" in local_vars:
            strat_inst = local_vars["Strategy"]()
            eval_func = getattr(strat_inst, "evaluate", None)

        if not eval_func or not callable(eval_func):
            print(json.dumps({"success": False, "error": "Callable 'evaluate' not found in strategy code."}))
            return

        result = eval_func(market_data)
        if not isinstance(result, dict):
            print(json.dumps({"success": False, "error": f"evaluate() returned {type(result).__name__}, expected dict."}))
            return

        decision = str(result.get("decision", "")).upper()
        if decision not in ["BUY", "SELL", "HOLD", "EXIT", "NO_TRADE"]:
            print(json.dumps({"success": False, "error": f"Invalid decision '{decision}'. Must be BUY, SELL, HOLD, EXIT, or NO_TRADE."}))
            return

        print(json.dumps({
            "success": True,
            "result": {
                "decision": decision,
                "reason": str(result.get("reason", "")),
                "indicators": result.get("indicators", {}),
                "confidence": float(result.get("confidence", 0.5)),
                "invalidation_rules": result.get("invalidation_rules")
            }
        }))

    except Exception as e:
        print(json.dumps({"success": False, "error": f"{type(e).__name__}: {str(e)}"}))


if __name__ == "__main__":
    main()

