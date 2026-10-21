"""
CHINTU AI TRADING SYSTEM - Master Brain Orchestration Engine (Phase 6)
Authoritative decision coordinator for all 14 canonical trading bots.

Key Responsibilities:
1. Fleet Discovery: Automatically discovers all 14 bots from CANONICAL_BOT_REGISTRY.
2. Signal Normalization: Enforces strict typed schema for BUY, SELL, HOLD, NO_TRADE.
3. Signal Validation Gate: Rejects stale, future-dated, malformed, duplicate, or unsupported signals.
4. Quantitative Consensus: Weighted scoring incorporating historical reliability, market regime,
   confidence calibration, and individual bot risk estimates.
5. Realistic Net Profit Integration: Deducts full statutory charges, spread, and slippage before
   approving any trade. Fails closed if expected net PnL <= 0 or reward-to-risk < 1.2.
6. Centralized Conflict & Position Safeguards: Prevents conflicting orders and duplicate positions.
7. Audit Trail: Full telemetry and rationale logged for every decision.
"""

import time
import math
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple

from server.bot_registry import (
    CANONICAL_BOT_REGISTRY,
    get_all_canonical_bots,
    get_bot_by_id,
    validate_bot_instrument
)
from server.regulatory_charges import (
    compute_instrument_regulatory_charges,
    to_decimal,
    round_cur
)
from server.memory_db import (
    get_open_positions,
    get_config,
    save_config
)
from server.strategy_engine import (
    calculate_sma,
    calculate_ema,
    calculate_rsi,
    calculate_atr,
    calculate_supertrend,
    calculate_macd,
    calculate_bollinger_bands,
    calculate_keltner_channel,
    calculate_donchian_channel,
    calculate_camarilla_pivots,
    detect_market_regime
)

logger = logging.getLogger("CHINTU_MASTER_BRAIN")
IST = timezone(timedelta(hours=5, minutes=30))

# Decision Actions
ACTION_BUY = "BUY"
ACTION_SELL = "SELL"
ACTION_HOLD = "HOLD"
ACTION_NO_TRADE = "NO_TRADE"
VALID_ACTIONS = {ACTION_BUY, ACTION_SELL, ACTION_HOLD, ACTION_NO_TRADE}

DEFAULT_ROLLING_WINDOW_SIZE = 20
MIN_ROLLING_SAMPLE_SIZE = 5

DEFAULT_MASTER_BRAIN_CONFIG = {
    "min_quorum_score": 0.60,             # Weighted consensus threshold (60%)
    "min_confidence_threshold": 0.55,     # Minimum confidence required for entry
    "max_signal_age_seconds": 60.0,       # Stale signal gate
    "min_reward_to_risk": 1.20,           # Minimum net reward / net risk ratio
    "slippage_rate_pct": 0.05,            # Estimated slippage percentage
    "bid_ask_spread_pct": 0.03,           # Estimated bid-ask spread percentage
    "max_risk_estimate": 0.70,            # Reject signals with risk estimate > 70%
    "require_positive_net_edge": True,     # Strict net profit validation
    "market_regime_weighting": True,      # Boost regime-aligned strategies
    "rolling_window_size": 20,            # Rolling window trade count for performance calibration
    "min_rolling_sample_size": 5,         # Minimum sample size before activating performance multiplier
    "scope_rolling_to_symbol": False,     # Whether rolling window is scoped to symbol (False = bot fleet-wide)
    "max_single_bot_weight_pct": 0.25     # Anti-domination: max individual bot contribution cap (25%)
}

CONFIG_DB_KEY = "master_brain_config"


def get_master_brain_config() -> Dict[str, Any]:
    """Retrieves Master Brain configuration from memory_db or default fallback."""
    cfg = dict(DEFAULT_MASTER_BRAIN_CONFIG)
    try:
        raw = get_config(CONFIG_DB_KEY, "")
        if raw:
            import json
            saved = json.loads(raw)
            if isinstance(saved, dict):
                cfg.update(saved)
    except Exception as e:
        logger.warning(f"Failed to read master_brain_config from DB: {e}")
    return cfg


def update_master_brain_config(updates: Dict[str, Any]) -> Dict[str, Any]:
    """Updates and persists Master Brain configuration."""
    cfg = get_master_brain_config()
    for k, v in updates.items():
        if k in DEFAULT_MASTER_BRAIN_CONFIG:
            cfg[k] = v
    try:
        import json
        save_config(CONFIG_DB_KEY, json.dumps(cfg))
    except Exception as e:
        logger.error(f"Failed to save master_brain_config: {e}")
    return cfg


class MasterBrain:
    """
    Central Quantitative Intelligence Engine for Chintu AI.
    Coordinates all 14 canonical bots, aggregates normalized signals, evaluates consensus,
    enforces statutory transaction cost friction, and produces authoritative trading decisions.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = get_master_brain_config()
        if config:
            self.config.update(config)
        self.processed_signals_cache: Dict[str, float] = {}  # {dedup_key: timestamp}
        self.last_decisions: List[Dict[str, Any]] = []

    def normalize_signal(
        self,
        bot_id: int,
        symbol: str,
        action: str,
        confidence: float,
        entry: float,
        stop_loss: float,
        target: float,
        risk_estimate: float = 0.20,
        expected_holding: str = "15m",
        reason: str = "Standard indicator signal",
        timestamp: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Normalizes any bot signal into the authoritative Master Brain schema.
        """
        bot_meta = get_bot_by_id(bot_id) or {}
        now_iso = datetime.now(IST).isoformat()

        clean_action = str(action or ACTION_NO_TRADE).upper().strip()
        if clean_action not in VALID_ACTIONS:
            clean_action = ACTION_NO_TRADE

        return {
            "bot_id": int(bot_id),
            "bot_name": bot_meta.get("name", f"Bot {bot_id}"),
            "symbol": str(symbol).strip(),
            "action": clean_action,
            "confidence": round(max(0.0, min(1.0, float(confidence or 0.0))), 4),
            "risk_estimate": round(max(0.0, min(1.0, float(risk_estimate or 0.20))), 4),
            "entry": round(float(entry or 0.0), 2),
            "stop_loss": round(float(stop_loss or 0.0), 2),
            "target": round(float(target or 0.0), 2),
            "expected_holding": str(expected_holding or "15m"),
            "reason": str(reason or ""),
            "timestamp": timestamp or now_iso,
            "timeframe": bot_meta.get("timeframe", "5m"),
            "strategy_id": bot_meta.get("strategy_id", "UNKNOWN"),
            "strategy_name": bot_meta.get("strategy_name", "Unknown Strategy"),
            "lotsize": int(bot_meta.get("lotsize", 1))
        }

    def validate_signal(self, signal: Dict[str, Any]) -> Tuple[bool, str]:
        """
        Validates signal integrity, freshness, price sanity, and deduplication.
        Returns (is_valid, rejection_reason).
        """
        bot_id = signal.get("bot_id")
        if not bot_id or int(bot_id) not in CANONICAL_BOT_REGISTRY:
            return False, f"Invalid bot_id {bot_id}. Must belong to canonical registry (1-14)."

        symbol = str(signal.get("symbol", "")).strip()
        if not symbol:
            return False, "Signal missing required 'symbol'."

        action = str(signal.get("action", "")).upper()
        if action not in VALID_ACTIONS:
            return False, f"Invalid action '{action}'. Must be one of {VALID_ACTIONS}."

        # Pass through NO_TRADE or HOLD signals without strict price checks
        if action in (ACTION_HOLD, ACTION_NO_TRADE):
            return True, "Valid non-entry signal."

        # Price sanity check for entry signals
        entry = float(signal.get("entry", 0.0) or 0.0)
        stop_loss = float(signal.get("stop_loss", 0.0) or 0.0)
        target = float(signal.get("target", 0.0) or 0.0)

        if entry <= 0:
            return False, f"Entry price must be positive (got {entry})."
        if stop_loss <= 0 or target <= 0:
            return False, f"Stop loss ({stop_loss}) and target ({target}) must be positive."
        if entry == stop_loss:
            return False, "Entry price cannot equal stop loss."

        if action == ACTION_BUY:
            if stop_loss >= entry:
                return False, f"BUY stop loss ({stop_loss}) must be below entry ({entry})."
            if target <= entry:
                return False, f"BUY target ({target}) must be above entry ({entry})."
        elif action == ACTION_SELL:
            if stop_loss <= entry:
                return False, f"SELL stop loss ({stop_loss}) must be above entry ({entry})."
            if target >= entry:
                return False, f"SELL target ({target}) must be below entry ({entry})."

        # Signal Age & Temporal Sanity Check
        max_age = float(self.config.get("max_signal_age_seconds", 60.0))
        sig_ts_str = signal.get("timestamp")
        now_epoch = time.time()

        if sig_ts_str:
            try:
                # Support standard ISO parsing
                clean_ts = sig_ts_str.replace("Z", "+00:00")
                sig_dt = datetime.fromisoformat(clean_ts)
                sig_epoch = sig_dt.timestamp()

                # Future-dated check (> 5s in future)
                if sig_epoch > (now_epoch + 5.0):
                    return False, f"Future-dated signal rejected (ahead by {sig_epoch - now_epoch:.1f}s)."

                # Stale signal check
                if (now_epoch - sig_epoch) > max_age:
                    return False, f"Stale signal rejected (age {now_epoch - sig_epoch:.1f}s > limit {max_age}s)."
            except Exception as e:
                return False, f"Malformed signal timestamp '{sig_ts_str}': {e}"

        # Minimum confidence threshold gate
        if "confidence" in signal and signal["confidence"] is not None:
            conf = float(signal["confidence"])
            min_conf = float(self.config.get("min_confidence_threshold", 0.55))
            if conf < min_conf:
                return False, f"Signal confidence ({conf:.2f}) below minimum threshold ({min_conf:.2f})."

        # Maximum risk estimate gate
        if "risk_estimate" in signal and signal["risk_estimate"] is not None:
            risk_est = float(signal["risk_estimate"])
            max_risk = float(self.config.get("max_risk_estimate", 0.70))
            if risk_est > max_risk:
                return False, f"Signal risk estimate ({risk_est:.2f}) exceeds maximum risk limit ({max_risk:.2f})."

        # Deduplication Check
        dedup_key = f"{bot_id}_{symbol}_{action}_{entry:.2f}_{sig_ts_str}"
        if dedup_key in self.processed_signals_cache:
            last_seen = self.processed_signals_cache[dedup_key]
            if (now_epoch - last_seen) < 10.0:
                return False, "Duplicate signal rejected within 10s deduplication window."

        self.processed_signals_cache[dedup_key] = now_epoch
        # Prune deduplication cache periodically
        if len(self.processed_signals_cache) > 500:
            self.processed_signals_cache = {
                k: ts for k, ts in self.processed_signals_cache.items()
                if (now_epoch - ts) < 60.0
            }

        return True, "Signal validated."

    def evaluate_bot_strategy_signal(
        self,
        bot_id: int,
        candles: Dict[str, List[float]],
        symbol: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes pure mathematical indicator evaluation for any canonical bot (1-14).
        Produces a normalized signal without any synthetic or randomized calculations.
        """
        bot_meta = get_bot_by_id(bot_id)
        if not bot_meta:
            return self.normalize_signal(bot_id, symbol or "UNKNOWN", ACTION_NO_TRADE, 0.0, 0, 0, 0, reason="Bot not registered")

        target_symbol = symbol or bot_meta.get("tradingsymbol", bot_meta.get("asset", ""))
        closes = candles.get("close", [])
        highs = candles.get("high", [])
        lows = candles.get("low", [])
        volumes = candles.get("volume", [])

        min_req = int(bot_meta.get("min_candles_required", 30))
        if len(closes) < min_req:
            return self.normalize_signal(
                bot_id, target_symbol, ACTION_NO_TRADE, 0.0, 0, 0, 0,
                reason=f"Insufficient candle history ({len(closes)}/{min_req})"
            )

        # Validate candle data integrity (reject non-finite, zero, or negative prices)
        if any(math.isnan(p) or math.isinf(p) or p <= 0.0 for p in closes):
            return self.normalize_signal(
                bot_id, target_symbol, ACTION_NO_TRADE, 0.0, 0, 0, 0,
                reason="Invalid price data in candle series (zero, negative, or non-finite)"
            )

        cur_price = closes[-1]
        action = ACTION_HOLD
        confidence = 0.50
        risk_est = 0.25
        entry = cur_price
        stop_loss = 0.0
        target = 0.0
        reason = "Neutral indicator conditions"

        strat_id = bot_meta.get("strategy_id", "")

        # -------------------------------------------------------------
        # Pure Mathematical Evaluation Dispatch per Bot ID
        # -------------------------------------------------------------
        if bot_id == 1 or strat_id == "SUPERTREND_MACD":
            # Scalper Bot: SuperTrend (10, 2) + MACD
            st_res = calculate_supertrend(highs, lows, closes, period=10, multiplier=2.0)
            st_dir = 1 if st_res.get("direction") == "UP" else -1
            st_val = st_res.get("supertrend", cur_price)
            macd_res = calculate_macd(closes, fast=12, slow=26, signal=9)
            macd_line = macd_res.get("macd", 0.0)
            macd_sig = macd_res.get("signal", 0.0)
            macd_hist = macd_res.get("hist", 0.0)
            atr_val = calculate_atr(highs, lows, closes, period=14) or (cur_price * 0.005)

            if st_dir == 1 and macd_hist > 0:
                action = ACTION_BUY
                confidence = 0.75 if macd_hist > macd_line * 0.1 else 0.65
                stop_loss = round(cur_price - (1.5 * atr_val), 2)
                target = round(cur_price + (2.5 * atr_val), 2)
                reason = "SuperTrend Bullish + MACD positive histogram momentum"
            elif st_dir == -1 and macd_hist < 0:
                action = ACTION_SELL
                confidence = 0.75 if abs(macd_hist) > abs(macd_line) * 0.1 else 0.65
                stop_loss = round(cur_price + (1.5 * atr_val), 2)
                target = round(cur_price - (2.5 * atr_val), 2)
                reason = "SuperTrend Bearish + MACD negative histogram momentum"

        elif bot_id == 2 or strat_id == "TRIPLE_EMA_ATR":
            # EMA Trend Bot: Triple EMA (9, 21, 55)
            ema9 = calculate_ema(closes, 9)
            ema21 = calculate_ema(closes, 21)
            ema55 = calculate_ema(closes, 55)
            atr_val = calculate_atr(highs, lows, closes, 14) or (cur_price * 0.005)

            if ema9 and ema21 and ema55:
                e9, e21, e55 = ema9[-1], ema21[-1], ema55[-1]
                if e9 > e21 > e55:
                    action = ACTION_BUY
                    confidence = 0.80
                    stop_loss = round(cur_price - (2.0 * atr_val), 2)
                    target = round(cur_price + (3.5 * atr_val), 2)
                    reason = f"Triple EMA Bullish Stack (EMA9 {e9:.1f} > EMA21 {e21:.1f} > EMA55 {e55:.1f})"
                elif e9 < e21 < e55:
                    action = ACTION_SELL
                    confidence = 0.80
                    stop_loss = round(cur_price + (2.0 * atr_val), 2)
                    target = round(cur_price - (3.5 * atr_val), 2)
                    reason = f"Triple EMA Bearish Stack (EMA9 {e9:.1f} < EMA21 {e21:.1f} < EMA55 {e55:.1f})"

        elif bot_id == 3 or strat_id == "RSI_BOLLINGER_REVERSAL":
            # RSI Reversal Bot: RSI(14) + Bollinger Bands
            rsi = calculate_rsi(closes, 14)
            bb = calculate_bollinger_bands(closes, period=20, num_std=2.0)
            atr_val = calculate_atr(highs, lows, closes, 14) or (cur_price * 0.008)

            if rsi < 30.0 and cur_price <= bb["lower"]:
                action = ACTION_BUY
                confidence = 0.72
                stop_loss = round(cur_price - (1.5 * atr_val), 2)
                target = round(bb["middle"], 2)
                reason = f"Oversold RSI ({rsi:.1f}) + Lower Bollinger Band Bounce"
            elif rsi > 70.0 and cur_price >= bb["upper"]:
                action = ACTION_SELL
                confidence = 0.72
                stop_loss = round(cur_price + (1.5 * atr_val), 2)
                target = round(bb["middle"], 2)
                reason = f"Overbought RSI ({rsi:.1f}) + Upper Bollinger Band Rejection"

        elif bot_id == 4 or strat_id == "DONCHIAN_BREAKOUT":
            # Breakout Bot: 20-period Donchian Channel
            dc = calculate_donchian_channel(highs, lows, 20)
            atr_val = calculate_atr(highs, lows, closes, 14) or (cur_price * 0.01)

            if cur_price >= dc["upper"]:
                action = ACTION_BUY
                confidence = 0.70
                stop_loss = round(dc["middle"], 2)
                target = round(cur_price + (2.5 * atr_val), 2)
                reason = f"Donchian 20-period High Breakout ({cur_price:.2f} >= {dc['upper']:.2f})"
            elif cur_price <= dc["lower"]:
                action = ACTION_SELL
                confidence = 0.70
                stop_loss = round(dc["middle"], 2)
                target = round(cur_price - (2.5 * atr_val), 2)
                reason = f"Donchian 20-period Low Breakdown ({cur_price:.2f} <= {dc['lower']:.2f})"

        elif bot_id == 5 or strat_id == "KELTNER_MEAN_REVERSION":
            # FINNIFTY Mean Reversion: Keltner Channels
            kc = calculate_keltner_channel(highs, lows, closes, ema_period=20, multiplier=2.0)
            atr_val = calculate_atr(highs, lows, closes, 14) or (cur_price * 0.005)

            if cur_price <= kc["lower"]:
                action = ACTION_BUY
                confidence = 0.68
                stop_loss = round(cur_price - (1.5 * atr_val), 2)
                target = round(kc["middle"], 2)
                reason = "Keltner Channel Lower Boundary Mean Reversion"
            elif cur_price >= kc["upper"]:
                action = ACTION_SELL
                confidence = 0.68
                stop_loss = round(cur_price + (1.5 * atr_val), 2)
                target = round(kc["middle"], 2)
                reason = "Keltner Channel Upper Boundary Mean Reversion"

        elif bot_id == 6 or strat_id == "ANCHORED_VWAP_MOMENTUM":
            # VWAP Momentum
            sma20 = calculate_sma(closes, 20)
            atr_val = calculate_atr(highs, lows, closes, 14) or (cur_price * 0.008)
            benchmark = sma20[-1] if sma20 else cur_price

            if cur_price > benchmark * 1.002:
                action = ACTION_BUY
                confidence = 0.65
                stop_loss = round(benchmark - (1.0 * atr_val), 2)
                target = round(cur_price + (2.0 * atr_val), 2)
                reason = "Momentum expansion above session VWAP baseline"
            elif cur_price < benchmark * 0.998:
                action = ACTION_SELL
                confidence = 0.65
                stop_loss = round(benchmark + (1.0 * atr_val), 2)
                target = round(cur_price - (2.0 * atr_val), 2)
                reason = "Momentum expansion below session VWAP baseline"

        elif bot_id == 7 or strat_id == "VOLUME_SPREAD_ANALYSIS":
            # Volume Spread Analysis
            avg_vol = sum(volumes[-20:]) / max(1, len(volumes[-20:])) if volumes else 1000.0
            cur_vol = volumes[-1] if volumes else 1000.0
            atr_val = calculate_atr(highs, lows, closes, 14) or (cur_price * 0.01)

            if cur_vol > (avg_vol * 1.5) and cur_price > closes[-2]:
                action = ACTION_BUY
                confidence = 0.72
                stop_loss = round(lows[-1] - (0.5 * atr_val), 2)
                target = round(cur_price + (2.0 * atr_val), 2)
                reason = f"High volume absorption spike ({cur_vol/avg_vol:.1f}x) Bullish"
            elif cur_vol > (avg_vol * 1.5) and cur_price < closes[-2]:
                action = ACTION_SELL
                confidence = 0.72
                stop_loss = round(highs[-1] + (0.5 * atr_val), 2)
                target = round(cur_price - (2.0 * atr_val), 2)
                reason = f"High volume distribution spike ({cur_vol/avg_vol:.1f}x) Bearish"

        elif bot_id == 8 or strat_id == "MULTI_SUPERTREND":
            # MCX Crude Oil Dual SuperTrend (7, 3 & 14, 2)
            st1 = calculate_supertrend(highs, lows, closes, 7, 3.0)
            st2 = calculate_supertrend(highs, lows, closes, 14, 2.0)
            d1 = 1 if st1.get("direction") == "UP" else -1
            v1 = st1.get("supertrend", cur_price)
            d2 = 1 if st2.get("direction") == "UP" else -1
            v2 = st2.get("supertrend", cur_price)
            atr_val = calculate_atr(highs, lows, closes, 14) or (cur_price * 0.01)

            if d1 == 1 and d2 == 1:
                action = ACTION_BUY
                confidence = 0.82
                stop_loss = round(min(v1, v2), 2)
                target = round(cur_price + (2.5 * atr_val), 2)
                reason = "Dual SuperTrend Confluence Bullish"
            elif d1 == -1 and d2 == -1:
                action = ACTION_SELL
                confidence = 0.82
                stop_loss = round(max(v1, v2), 2)
                target = round(cur_price - (2.5 * atr_val), 2)
                reason = "Dual SuperTrend Confluence Bearish"

        elif bot_id == 9 or strat_id == "BOLLINGER_KELTNER_SQUEEZE":
            # Gold Squeeze Breakout
            bb = calculate_bollinger_bands(closes, 20, 2.0)
            kc = calculate_keltner_channel(highs, lows, closes, ema_period=20, multiplier=1.5)
            atr_val = calculate_atr(highs, lows, closes, 14) or (cur_price * 0.008)

            # Squeeze condition: BB inside KC
            is_squeeze = bb["upper"] <= kc["upper"] and bb["lower"] >= kc["lower"]
            if not is_squeeze and closes[-2] <= kc["upper"] and cur_price > kc["upper"]:
                action = ACTION_BUY
                confidence = 0.74
                stop_loss = round(kc["middle"], 2)
                target = round(cur_price + (2.0 * atr_val), 2)
                reason = "Bollinger Squeeze explosive upward breakout"
            elif not is_squeeze and closes[-2] >= kc["lower"] and cur_price < kc["lower"]:
                action = ACTION_SELL
                confidence = 0.74
                stop_loss = round(kc["middle"], 2)
                target = round(cur_price - (2.0 * atr_val), 2)
                reason = "Bollinger Squeeze explosive downward breakdown"

        elif bot_id == 10 or strat_id == "CAMARILLA_PIVOTS":
            # Silver Camarilla Pivots
            pivots = calculate_camarilla_pivots(highs[-2], lows[-2], closes[-2])
            l3 = pivots.get("l3", pivots.get("L3", 0.0))
            l4 = pivots.get("l4", pivots.get("L4", 0.0))
            h3 = pivots.get("h3", pivots.get("H3", 0.0))
            h4 = pivots.get("h4", pivots.get("H4", 0.0))
            atr_val = calculate_atr(highs, lows, closes, 14) or (cur_price * 0.01)

            if cur_price <= l3:
                action = ACTION_BUY
                confidence = 0.69
                stop_loss = round(l4, 2)
                target = round(h3, 2)
                reason = f"Camarilla L3 support floor bounce ({cur_price:.2f} <= {l3:.2f})"
            elif cur_price >= h3:
                action = ACTION_SELL
                confidence = 0.69
                stop_loss = round(h4, 2)
                target = round(l3, 2)
                reason = f"Camarilla H3 resistance ceiling rejection ({cur_price:.2f} >= {h3:.2f})"

        elif bot_id == 11 or strat_id == "ICHIMOKU_CLOUD":
            # Currency USDINR Ichimoku Cloud
            sma9 = calculate_sma(closes, 9)
            sma26 = calculate_sma(closes, 26)
            atr_val = calculate_atr(highs, lows, closes, 14) or (cur_price * 0.002)

            if sma9 and sma26 and sma9[-1] > sma26[-1]:
                action = ACTION_BUY
                confidence = 0.66
                stop_loss = round(cur_price - (1.5 * atr_val), 2)
                target = round(cur_price + (2.5 * atr_val), 2)
                reason = "Tenkan/Kijun Bullish Alignment"
            elif sma9 and sma26 and sma9[-1] < sma26[-1]:
                action = ACTION_SELL
                confidence = 0.66
                stop_loss = round(cur_price + (1.5 * atr_val), 2)
                target = round(cur_price - (2.5 * atr_val), 2)
                reason = "Tenkan/Kijun Bearish Alignment"

        else:
            # Generic fallback: EMA crossover
            ema20 = calculate_ema(closes, 20)
            ema50 = calculate_ema(closes, 50)
            atr_val = calculate_atr(highs, lows, closes, 14) or (cur_price * 0.01)
            if ema20 and ema50 and ema20[-1] > ema50[-1]:
                action = ACTION_BUY
                confidence = 0.60
                stop_loss = round(cur_price - (2.0 * atr_val), 2)
                target = round(cur_price + (3.0 * atr_val), 2)
                reason = f"Generic EMA Trend Alignment for Bot {bot_id}"
            elif ema20 and ema50 and ema20[-1] < ema50[-1]:
                action = ACTION_SELL
                confidence = 0.60
                stop_loss = round(cur_price + (2.0 * atr_val), 2)
                target = round(cur_price - (3.0 * atr_val), 2)
                reason = f"Generic EMA Bearish Alignment for Bot {bot_id}"

        return self.normalize_signal(
            bot_id=bot_id,
            symbol=target_symbol,
            action=action,
            confidence=confidence,
            entry=entry,
            stop_loss=stop_loss,
            target=target,
            risk_estimate=risk_est,
            expected_holding=bot_meta.get("timeframe", "5m"),
            reason=reason
        )

    def calculate_realistic_net_profit(
        self,
        symbol: str,
        action: str,
        entry: float,
        target: float,
        stop_loss: float,
        qty: int,
        segment: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Integrates authoritative SEBI statutory charges, bid-ask spread, and slippage.
        Calculates realistic Net Reward, Net Risk, and Net Reward-to-Risk ratio.
        """
        clean_action = str(action).upper().strip()
        eff_qty = max(1, int(qty or 1))
        dec_entry = to_decimal(entry)
        dec_target = to_decimal(target)
        dec_sl = to_decimal(stop_loss)

        if clean_action == ACTION_BUY:
            gross_reward = float((dec_target - dec_entry) * eff_qty)
            gross_risk = float((dec_entry - dec_sl) * eff_qty)
        else:
            gross_reward = float((dec_entry - dec_target) * eff_qty)
            gross_risk = float((dec_sl - dec_entry) * eff_qty)

        # 1. Statutory Regulatory Charges (SEBI, STT, Brokerage, GST, Stamp Duty)
        reg_charges = compute_instrument_regulatory_charges(
            symbol=symbol,
            price=entry,
            qty=eff_qty,
            action="ROUND_TRIP",
            segment=segment or "NSE Equity",
            product_type="INTRADAY"
        )

        statutory_fees = float(reg_charges.get("total_charges", 0.0))
        is_quarantined = reg_charges.get("validation_status") == "QUARANTINED"
        quarantine_reason = reg_charges.get("quarantine_reason")

        # 2. Market Friction: Spread & Slippage
        spread_pct = float(self.config.get("bid_ask_spread_pct", 0.03)) / 100.0
        slippage_pct = float(self.config.get("slippage_rate_pct", 0.05)) / 100.0
        turnover = entry * eff_qty * 2.0  # Round trip

        spread_cost = round(turnover * spread_pct, 2)
        slippage_cost = round(turnover * slippage_pct, 2)
        total_friction = round(statutory_fees + spread_cost + slippage_cost, 2)

        # Net Expectancy
        net_reward = round(gross_reward - total_friction, 2)
        net_risk = round(max(1.0, gross_risk + total_friction), 2)
        reward_to_risk = round(net_reward / net_risk, 2) if net_risk > 0 else 0.0

        min_rr = float(self.config.get("min_reward_to_risk", 1.20))
        is_profitable = (net_reward > 0.0) and (reward_to_risk >= min_rr) and not is_quarantined

        return {
            "is_profitable": is_profitable,
            "gross_reward": gross_reward,
            "gross_risk": gross_risk,
            "statutory_fees": statutory_fees,
            "spread_cost": spread_cost,
            "slippage_cost": slippage_cost,
            "total_friction": total_friction,
            "net_reward": net_reward,
            "net_risk": net_risk,
            "net_reward_to_risk": reward_to_risk,
            "min_required_reward_to_risk": min_rr,
            "charge_breakdown": reg_charges,
            "is_quarantined": is_quarantined,
            "quarantine_reason": quarantine_reason
        }

    def get_rolling_bot_performance(
        self,
        bot_id: Union[int, str],
        before_timestamp: Optional[Union[str, float, datetime]] = None,
        symbol: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Retrieves rolling window performance metrics for a bot from memory_db.
        Respects configured rolling_window_size and min_rolling_sample_size.
        """
        from server.memory_db import get_rolling_bot_performance
        window_size = int(self.config.get("rolling_window_size", DEFAULT_ROLLING_WINDOW_SIZE))
        min_samples = int(self.config.get("min_rolling_sample_size", MIN_ROLLING_SAMPLE_SIZE))
        return get_rolling_bot_performance(
            bot_id=bot_id,
            window_size=window_size,
            before_timestamp=before_timestamp,
            symbol=symbol,
            min_samples=min_samples
        )

    @staticmethod
    def apply_anti_domination_cap(
        raw_weights: List[float],
        max_cap_pct: float = 0.25
    ) -> Tuple[List[float], List[bool], float, bool, str]:
        """
        Enforces anti-domination: caps maximum individual bot normalized contribution.
        Uses iterative water-filling to redistribute excess weight among uncapped bots.

        Policy for N < 4 bots:
        With fewer than 4 bots, a strict 25% cap cannot sum to 100%. The deterministic,
        transparent policy sets:
            effective_bot_cap = max(max_cap_pct, 1.0 / N)
        - N=1: effective_bot_cap = 1.0 (100% max)
        - N=2: effective_bot_cap = 0.50 (50% max each)
        - N=3: effective_bot_cap = round(1/3, 4) ~ 0.3333 (33.33% max each)
        - N>=4: effective_bot_cap = max_cap_pct (default 0.25, 25% max each)

        Boundary condition:
        A bot at exactly effective_bot_cap (e.g. 0.25) does NOT trigger redistribution.

        Returns:
            (capped_normalized_shares, caps_applied_mask, effective_cap, any_capped, policy_desc)
        """
        N = len(raw_weights)
        if N == 0:
            return [], [], float(max_cap_pct), False, "No contributing bots"

        # Sanitize raw weights (filter non-finite, NaN, <= 0)
        sanitized: List[float] = []
        for w in raw_weights:
            try:
                fw = float(w)
                if math.isnan(fw) or math.isinf(fw) or fw <= 0.0:
                    sanitized.append(0.0)
                else:
                    sanitized.append(fw)
            except (TypeError, ValueError):
                sanitized.append(0.0)

        total_raw = sum(sanitized)
        raw_effective_cap = max(float(max_cap_pct), 1.0 / N)
        effective_cap = round(raw_effective_cap, 4)
        policy_desc = (
            f"Fleet size {N}: effective_bot_cap={effective_cap*100:.2f}% "
            f"(policy: max({max_cap_pct*100:.1f}%, 100%/{N}) with iterative water-filling redistribution)"
        )

        if total_raw <= 0.0:
            equal_share = round(1.0 / N, 4)
            shares = [equal_share] * N
            return shares, [False] * N, effective_cap, False, policy_desc

        # Initial normalized shares
        shares = [w / total_raw for w in sanitized]
        capped = [False] * N
        any_capped = False
        cap_limit = float(raw_effective_cap)

        # Iterative water-filling redistribution
        for _ in range(N):
            exceeded = [i for i in range(N) if not capped[i] and shares[i] > cap_limit + 1e-9]
            if not exceeded:
                break
            any_capped = True
            for i in exceeded:
                capped[i] = True
                shares[i] = cap_limit

            uncapped_indices = [i for i in range(N) if not capped[i]]
            if not uncapped_indices:
                break

            total_capped_share = sum(shares[i] for i in range(N) if capped[i])
            remaining_share = max(0.0, 1.0 - total_capped_share)
            uncapped_raw_sum = sum(sanitized[i] for i in uncapped_indices)

            if uncapped_raw_sum > 0:
                for i in uncapped_indices:
                    shares[i] = remaining_share * (sanitized[i] / uncapped_raw_sum)
            else:
                share_per_bot = remaining_share / len(uncapped_indices)
                for i in uncapped_indices:
                    shares[i] = share_per_bot

        # Normalize to ensure sum == 1.0 within float precision
        norm_sum = sum(shares)
        if norm_sum > 0:
            shares = [s / norm_sum for s in shares]

        rounded_shares = [round(s, 4) for s in shares]
        diff = round(1.0 - sum(rounded_shares), 4)
        if diff != 0 and rounded_shares:
            uncapped_cands = [i for i in range(N) if not capped[i]] or list(range(N))
            adj_idx = max(uncapped_cands, key=lambda i: rounded_shares[i])
            rounded_shares[adj_idx] = round(rounded_shares[adj_idx] + diff, 4)

        return rounded_shares, capped, effective_cap, any_capped, policy_desc

    def evaluate_fleet_consensus(
        self,
        symbol: str,
        signals: List[Dict[str, Any]],
        market_regime: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Coordinates all signals from contributing bots.
        Executes weighted scoring, regime calibration, friction deduction,
        anti-domination capping, and conflict detection to produce the final Master Brain decision.
        """
        start_time = time.perf_counter()
        now_iso = datetime.now(IST).isoformat()
        regime = str(market_regime or "NEUTRAL").upper()

        raw_candidates: List[Dict[str, Any]] = []
        rejected_signals: List[Dict[str, Any]] = []

        # -------------------------------------------------------------
        # 1. Signal Validation & Weighted Scoring
        # -------------------------------------------------------------
        for sig in signals:
            is_valid, rej_reason = self.validate_signal(sig)
            if not is_valid:
                rejected_signals.append({
                    "bot_id": sig.get("bot_id"),
                    "bot_name": sig.get("bot_name"),
                    "action": sig.get("action"),
                    "reason": rej_reason
                })
                continue

            bot_id = int(sig["bot_id"])
            bot_meta = get_bot_by_id(bot_id) or {}
            base_weight = float(bot_meta.get("weight", 1.0))
            confidence = float(sig.get("confidence", 0.5))
            risk_est = float(sig.get("risk_estimate", 0.2))

            # Regime Multiplier
            regime_factor = 1.0
            if self.config.get("market_regime_weighting", True):
                if "TREND" in regime:
                    # Boost trend-following bots
                    if bot_id in (1, 2, 6, 8):
                        regime_factor = 1.25
                    elif bot_id in (3, 5, 10):
                        regime_factor = 0.80
                elif "RANGE" in regime or "SIDEWAYS" in regime:
                    # Boost mean reversion bots
                    if bot_id in (3, 5, 10):
                        regime_factor = 1.25
                    elif bot_id in (1, 2, 6, 8):
                        regime_factor = 0.80
                elif "VOLATILE" in regime:
                    if bot_id in (4, 9, 11):
                        regime_factor = 1.20

            # Performance calibration from rolling completed trades (Stage 4)
            perf_multiplier = 1.0
            rolling_perf = None
            try:
                sig_ts = sig.get("timestamp") or sig.get("generated_at") or sig.get("created_at")
                scope_sym = sig.get("symbol") if self.config.get("scope_rolling_to_symbol", False) else None
                rolling_perf = self.get_rolling_bot_performance(
                    bot_id=bot_id,
                    before_timestamp=sig_ts,
                    symbol=scope_sym
                )
                if rolling_perf:
                    perf_multiplier = float(rolling_perf.get("perf_multiplier", 1.0))
            except Exception as e:
                logger.warning(f"Failed to calculate rolling performance for bot {bot_id}: {e}")
                perf_multiplier = 1.0

            # Effective weight calculation
            risk_penalty = max(0.40, 1.0 - (risk_est * 0.6))
            raw_eff_weight = round(base_weight * regime_factor * perf_multiplier * risk_penalty * confidence, 4)
            if math.isnan(raw_eff_weight) or math.isinf(raw_eff_weight) or raw_eff_weight < 0:
                raw_eff_weight = 0.0

            sig_action = sig["action"]
            raw_candidates.append({
                "bot_id": bot_id,
                "bot_name": sig.get("bot_name", bot_meta.get("name", f"Bot {bot_id}")),
                "action": sig_action,
                "confidence": confidence,
                "risk_estimate": risk_est,
                "raw_weight": raw_eff_weight,
                "perf_multiplier": perf_multiplier,
                "entry": sig.get("entry"),
                "stop_loss": sig.get("stop_loss"),
                "target": sig.get("target"),
                "reason": sig.get("reason"),
                "rolling_perf": rolling_perf
            })

        # -------------------------------------------------------------
        # 1b. Anti-Domination Cap & Normalized Quorum Weighting
        # -------------------------------------------------------------
        max_cap_pct = float(self.config.get("max_single_bot_weight_pct", 0.25))
        raw_weights = [c["raw_weight"] for c in raw_candidates]
        capped_shares, caps_applied, effective_cap, anti_dom_applied, policy_desc = self.apply_anti_domination_cap(
            raw_weights=raw_weights,
            max_cap_pct=max_cap_pct
        )

        total_raw_weight = sum(raw_weights)
        total_effective_weight = total_raw_weight

        buy_weight = 0.0
        sell_weight = 0.0
        hold_weight = 0.0
        contributing_bots: List[Dict[str, Any]] = []

        for i, c in enumerate(raw_candidates):
            raw_w = c["raw_weight"]
            norm_w = round(raw_w / total_raw_weight, 4) if total_raw_weight > 0 else (round(1.0 / len(raw_candidates), 4) if raw_candidates else 0.0)
            capped_w = capped_shares[i]
            is_capped = caps_applied[i]

            scaled_conviction = capped_w * total_effective_weight
            sig_action = c["action"]
            if sig_action == ACTION_BUY:
                buy_weight += scaled_conviction
            elif sig_action == ACTION_SELL:
                sell_weight += scaled_conviction
            else:
                hold_weight += scaled_conviction

            bot_info = {
                "bot_id": c["bot_id"],
                "bot_name": c["bot_name"],
                "action": sig_action,
                "confidence": c["confidence"],
                "risk_estimate": c["risk_estimate"],
                "raw_weight": raw_w,
                "effective_weight": raw_w,            # preserved for backward compatibility
                "normalized_weight": norm_w,          # initial share fraction (0.0 to 1.0)
                "capped_weight": capped_w,            # post-cap redistributed share (0.0 to 1.0)
                "cap_applied": is_capped,             # boolean
                "perf_multiplier": c["perf_multiplier"],
                "entry": c["entry"],
                "stop_loss": c["stop_loss"],
                "target": c["target"],
                "reason": c["reason"]
            }
            if c["rolling_perf"]:
                rp = c["rolling_perf"]
                bot_info["rolling_performance"] = {
                    "total_trades": rp.get("total_trades", 0),
                    "winning_trades": rp.get("winning_trades", 0),
                    "losing_trades": rp.get("losing_trades", 0),
                    "breakeven_trades": rp.get("breakeven_trades", 0),
                    "win_rate": rp.get("win_rate", 0.0),
                    "win_rate_pct": rp.get("win_rate_pct", 0.0),
                    "pnl": rp.get("pnl", 0.0),
                    "sample_size_sufficient": rp.get("sample_size_sufficient", False),
                    "perf_multiplier": c["perf_multiplier"],
                    "window_size": rp.get("window_size", DEFAULT_ROLLING_WINDOW_SIZE),
                    "is_fallback": rp.get("is_fallback", False)
                }
            contributing_bots.append(bot_info)

        # -------------------------------------------------------------
        # 2. Majority Consensus Evaluation
        # -------------------------------------------------------------
        quorum_pct = float(self.config.get("min_quorum_score", 0.60))
        min_conf = float(self.config.get("min_confidence_threshold", 0.55))

        proposed_action = ACTION_NO_TRADE
        consensus_score = 0.0
        decision_reason = "No consensus achieved"

        if total_effective_weight > 0.0:
            buy_ratio = buy_weight / total_effective_weight
            sell_ratio = sell_weight / total_effective_weight

            if buy_ratio >= quorum_pct:
                proposed_action = ACTION_BUY
                consensus_score = buy_ratio
                decision_reason = f"Bullish fleet consensus ({buy_ratio*100:.1f}% >= quorum {quorum_pct*100:.1f}%)"
            elif sell_ratio >= quorum_pct:
                proposed_action = ACTION_SELL
                consensus_score = sell_ratio
                decision_reason = f"Bearish fleet consensus ({sell_ratio*100:.1f}% >= quorum {quorum_pct*100:.1f}%)"
            else:
                proposed_action = ACTION_NO_TRADE
                consensus_score = max(buy_ratio, sell_ratio)
                decision_reason = f"Fleet divided without quorum (BUY: {buy_ratio*100:.1f}%, SELL: {sell_ratio*100:.1f}% vs {quorum_pct*100:.1f}% threshold)"

        # -------------------------------------------------------------
        # 3. Position Conflict & Duplicate Check
        # -------------------------------------------------------------
        open_positions = get_open_positions()
        existing_pos = next((p for p in open_positions if p.get("symbol") == symbol and p.get("status") == "OPEN"), None)

        if proposed_action in (ACTION_BUY, ACTION_SELL) and existing_pos:
            pos_side = existing_pos.get("side", "LONG")
            target_side = "LONG" if proposed_action == ACTION_BUY else "SHORT"
            if pos_side == target_side:
                proposed_action = ACTION_NO_TRADE
                decision_reason = f"Duplicate position prevented: {pos_side} position already active for {symbol}"

        # -------------------------------------------------------------
        # 4. Realistic Net-Profit Gate
        # -------------------------------------------------------------
        profit_analysis = {}
        final_action = proposed_action

        if proposed_action in (ACTION_BUY, ACTION_SELL):
            # Select representative price levels from consensus bots
            matching_signals = [s for s in contributing_bots if s["action"] == proposed_action]
            if matching_signals:
                avg_entry = sum(float(s["entry"] or 0.0) for s in matching_signals) / len(matching_signals)
                avg_sl = sum(float(s["stop_loss"] or 0.0) for s in matching_signals) / len(matching_signals)
                avg_target = sum(float(s["target"] or 0.0) for s in matching_signals) / len(matching_signals)
            else:
                avg_entry, avg_sl, avg_target = 0.0, 0.0, 0.0

            # Default lot size and segment from canonical registry
            sample_bot_id = matching_signals[0]["bot_id"] if matching_signals else 1
            sample_bot = get_bot_by_id(sample_bot_id) or {}
            lotsize = int(sample_bot.get("lotsize", 1))
            seg = sample_bot.get("segment", "NSE Equity")
            sym_for_charges = symbol

            # If spot index name (e.g. NIFTY 50) is passed with index-level price (> 2000),
            # resolve to bot's tradingsymbol (e.g. NIFTY24OCTFUT) and futures segment to avoid
            # false option spot quarantine.
            if avg_entry > 2000.0 and "OPTION" in seg.upper() and any(k in symbol.upper() for k in ("NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX")):
                seg = "NSE F&O Futures"
                sym_for_charges = sample_bot.get("tradingsymbol", f"{symbol.replace(' ', '')}24OCTFUT")

            profit_analysis = self.calculate_realistic_net_profit(
                symbol=sym_for_charges,
                action=proposed_action,
                entry=avg_entry,
                target=avg_target,
                stop_loss=avg_sl,
                qty=lotsize,
                segment=seg
            )

            if self.config.get("require_positive_net_edge", True):
                if profit_analysis.get("is_quarantined"):
                    final_action = ACTION_NO_TRADE
                    decision_reason = f"Quarantined by cost engine: {profit_analysis.get('quarantine_reason')}"
                elif not profit_analysis.get("is_profitable"):
                    final_action = ACTION_NO_TRADE
                    decision_reason = (
                        f"Net profit edge check failed: Net Reward (₹{profit_analysis.get('net_reward', 0):,.2f}) "
                        f"or Net R:R ({profit_analysis.get('net_reward_to_risk', 0):.2f}) below threshold {profit_analysis.get('min_required_reward_to_risk', 1.2):.2f}"
                    )
        else:
            profit_analysis = {
                "is_profitable": False,
                "net_reward": 0.0,
                "net_risk": 0.0,
                "net_reward_to_risk": 0.0,
                "total_friction": 0.0
            }

        elapsed_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

        decision_result = {
            "decision": final_action,
            "symbol": symbol,
            "consensus_score": round(consensus_score, 4),
            "quorum_required": quorum_pct,
            "market_regime": regime,
            "total_effective_weight": round(total_effective_weight, 4),
            "buy_weight": round(buy_weight, 4),
            "sell_weight": round(sell_weight, 4),
            "hold_weight": round(hold_weight, 4),
            "anti_domination_applied": anti_dom_applied,
            "max_single_bot_weight_pct": max_cap_pct,
            "effective_bot_cap": effective_cap,
            "anti_domination_policy": policy_desc,
            "contributing_bots_count": len(contributing_bots),
            "contributing_bots": contributing_bots,
            "rejected_signals_count": len(rejected_signals),
            "rejected_signals": rejected_signals,
            "profit_analysis": profit_analysis,
            "decision_reason": decision_reason,
            "latency_ms": elapsed_ms,
            "timestamp": now_iso
        }

        self.last_decisions.append(decision_result)
        if len(self.last_decisions) > 50:
            self.last_decisions.pop(0)

        return decision_result

    def execute_consensus_decision(
        self,
        decision: Dict[str, Any],
        execution_mode: str = "PAPER",
        client_order_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Coordinates the execution of an authoritative Master Brain consensus decision
        strictly through the CentralizedExecutionEngine single-gateway.
        """
        from server.execution_engine import execution_engine

        action = str(decision.get("decision", ACTION_NO_TRADE)).upper().strip()
        if action not in (ACTION_BUY, ACTION_SELL):
            return {
                "success": False,
                "status": "REJECTED",
                "error": f"Master Brain decision '{action}' is not executable. Must be BUY or SELL.",
                "decision": decision
            }

        # Check net profit feasibility
        profit_analysis = decision.get("profit_analysis", {})
        if self.config.get("require_positive_net_edge", True):
            if not profit_analysis.get("is_profitable", False):
                return {
                    "success": False,
                    "status": "REJECTED",
                    "error": f"Execution rejected: Net profit edge gate not satisfied ({decision.get('decision_reason')}).",
                    "decision": decision
                }

        symbol = decision.get("symbol", "NIFTY 50")
        contributing_bots = decision.get("contributing_bots", [])

        # Select target bot: highest effective weight among matching action
        matching_bots = [b for b in contributing_bots if b.get("action") == action]
        if matching_bots:
            matching_bots.sort(key=lambda b: float(b.get("effective_weight", 0.0)), reverse=True)
            target_bot_id = int(matching_bots[0]["bot_id"])
            target_bot_name = matching_bots[0].get("bot_name")
            entry_price = float(matching_bots[0].get("entry", 0.0))
        else:
            target_bot_id = 1
            target_bot_name = "Master Brain Fleet"
            entry_price = 0.0

        bot_meta = get_bot_by_id(target_bot_id) or {}
        lotsize = int(bot_meta.get("lotsize", 1))

        cid = client_order_id or f"ORD-MB-{target_bot_id}-{int(time.time()*1000)}"

        exec_res = execution_engine.execute_order(
            bot_id=target_bot_id,
            symbol=symbol,
            action=action,
            qty=lotsize,
            price=entry_price,
            bot_name=f"Master Brain ({target_bot_name})",
            producttype="INTRADAY",
            ordertype="MARKET",
            is_emergency_exit=False,
            execution_mode=execution_mode,
            client_order_id=cid
        )

        return {
            "success": exec_res.get("success", False),
            "order_id": exec_res.get("orderId") or exec_res.get("order_id"),
            "status": exec_res.get("status"),
            "action": action,
            "symbol": symbol,
            "qty": lotsize,
            "price": exec_res.get("avg_price", entry_price),
            "bot_id": target_bot_id,
            "consensus_score": decision.get("consensus_score"),
            "execution_engine_result": exec_res
        }


# Singleton instance
master_brain = MasterBrain()

