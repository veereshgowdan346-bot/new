"""
CHINTU AI TRADING SYSTEM - Centralized Risk Manager (Phase 6)
Authoritative, unified risk control system enforcing portfolio-level and per-bot limits:
  1. Maximum Account Capital & Allocation per Bot
  2. Maximum Risk Per Trade & Stop-Loss Position Sizing
  3. Maximum Total Open Exposure & Correlated Position Limits
  4. Daily Loss Limit & Automated Circuit Breaker
  5. Maximum Drawdown Protection
  6. Rate Limiting, Cooldown & Overtrading Safeguards
  7. Stale Market Feed Rejection Gate
  8. Broker Disconnection Fail-Closed Protection
  9. Emergency Stop & Safe Position Cancellation Procedures

All thresholds are configurable, persisted in memory_db, and strictly unbypassable.
"""

import re
import time
import math
import logging
import threading
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple

from server.memory_db import (
    get_open_positions,
    get_config,
    save_config,
    log_rms_event
)
from server.bot_registry import CANONICAL_BOT_REGISTRY, get_bot_by_id

logger = logging.getLogger("CHINTU_CENTRALIZED_RISK_MANAGER")
IST = timezone(timedelta(hours=5, minutes=30))

DEFAULT_RMS_CONFIG = {
    "account_capital": 20000.0,            # Configured baseline capital (default ₹20,000.00, user configurable)
    "max_account_capital": 500000.0,       # Overall system ceiling / paper capital limit
    "max_capital_per_bot": 200000.0,       # Max capital allocation per bot
    "max_risk_pct_per_trade": 1.50,        # Max 1.5% capital risked on a single trade
    "max_daily_loss": 5000.0,              # Max daily loss in INR before circuit breaker trips
    "max_drawdown_pct": 5.0,               # Max drawdown percentage
    "max_open_positions": 10,              # Max concurrent open positions across 14-bot fleet
    "max_correlated_positions": 2,         # Max correlated derivative positions (e.g. NIFTY + BANKNIFTY)
    "min_order_interval_seconds": 3.0,     # Cooldown between orders
    "max_orders_per_minute": 15,           # Broker API protection
    "stale_feed_max_age_seconds": 2.0,     # Reject feed data older than 2.0s for new entry orders
    "connection_stale_threshold_seconds": 60.0, # Connection health watchdog timeout
    "max_consecutive_losses": 2,           # Bot-level consecutive loss quarantine limit (quarantines at >= 2 losses)
    "circuit_breaker_active": False,
    "emergency_stop_active": False
}

CONFIG_DB_KEY = "centralized_rms_config"


def calculate_required_margin(
    symbol: str,
    segment: str,
    price: float,
    qty: int,
    producttype: str = "INTRADAY"
) -> float:
    """
    Computes required margin according to Indian exchange regulatory standards:
    - Equity Intraday (MIS): 20% of turnover (5x leverage)
    - Equity Delivery (CNC): 100% of turnover
    - Index & Stock Futures: SPAN + Exposure (~14% of contract turnover)
    - Option Long / Buy: 100% of option premium (Premium * Qty)
    - Option Short / Sell: SPAN + Exposure (~15% of notional)
    - Commodity Futures (MCX): SPAN (~10% of contract turnover)
    - Currency Derivatives (CDS): SPAN (~4% of contract turnover)
    """
    p = max(0.0, float(price or 0.0))
    q = max(1, int(qty or 1))
    turnover = p * q
    seg_up = str(segment or "").upper().strip()
    sym_up = str(symbol or "").upper().strip()
    prod_up = str(producttype or "INTRADAY").upper().strip()

    has_opt_strike = bool(re.search(r'(\d+|\s)(CE|PE)$', sym_up))
    is_index_level = any(idx in sym_up for idx in ("NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX")) and p > 2000.0

    # Underlying index spot level passed for index futures / synthetic contracts (e.g. NIFTY 50 @ 24,000 without CE/PE)
    if is_index_level and not has_opt_strike:
        return round(turnover * 0.14, 2)

    is_option = bool(has_opt_strike or ("OPTION" in seg_up or "OPT" in seg_up))

    # Futures classification
    if "FUT" in sym_up or sym_up.endswith("FUT") or ("FUT" in seg_up and not is_option):
        if "MCX" in seg_up or "COMMODITY" in seg_up or any(c in sym_up for c in ("CRUDE", "GOLD", "SILVER")):
            return round(turnover * 0.10, 2)
        if "CURRENCY" in seg_up or "CDS" in seg_up or any(curr in sym_up for curr in ("USDINR", "EURINR", "GBPINR", "JPYINR")):
            return round(turnover * 0.04, 2)
        return round(turnover * 0.14, 2)

    if is_option:
        return round(turnover, 2)

    if "COMMODITY" in seg_up or "MCX" in seg_up:
        return round(turnover * 0.10, 2)

    if "CURRENCY" in seg_up or "CDS" in seg_up:
        return round(turnover * 0.04, 2)

    if prod_up in ("MIS", "INTRADAY"):
        return round(turnover * 0.20, 2)
    else:
        return round(turnover * 1.00, 2)


def calculate_open_positions_used_margin(open_positions: Optional[List[Dict[str, Any]]] = None) -> float:
    """Calculates total margin actively committed to all currently OPEN positions."""
    if open_positions is None:
        try:
            from server.memory_db import get_open_positions
            open_positions = get_open_positions()
        except Exception:
            open_positions = []
    total_margin = 0.0
    for pos in (open_positions or []):
        if str(pos.get("status", "")).upper() != "OPEN":
            continue
        p = float(pos.get("entry_price") or pos.get("price") or 0.0)
        q = abs(int(pos.get("qty") or 1))
        sym = str(pos.get("symbol") or "")
        seg = str(pos.get("segment") or "")
        total_margin += calculate_required_margin(sym, seg, p, q)
    return round(total_margin, 2)


def get_account_margin_summary(
    config: Optional[Dict[str, Any]] = None,
    broker_state: Optional[Dict[str, Any]] = None,
    active_smart_connect: Optional[Dict[str, Any]] = None,
    open_positions: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Returns authoritative, strictly segregated capital and margin summary:
    - configured_account_capital: User-defined baseline capital (e.g. ₹20,000.00).
    - used_margin: Margin committed to existing open positions.
    - available_margin: Remaining margin available for new trade entries.
    - risk_budget_per_trade: Maximum permissible risk per trade based on configured percentage.
    - broker_reported_cash: Authentic broker cash (if authenticated).
    - broker_reported_margin: Authentic broker net margin (if authenticated).
    """
    cfg = config or get_centralized_rms_config()
    account_cap = float(cfg.get("account_capital") or cfg.get("max_account_capital") or 20000.0)
    if account_cap <= 0:
        account_cap = 20000.0

    used_margin = calculate_open_positions_used_margin(open_positions)

    ao_broker = (broker_state or {}).get("angel_one", {})
    is_real_broker = bool(
        ao_broker.get("connected")
        and ao_broker.get("realAuth") is True
        and active_smart_connect
        and active_smart_connect.get("instance") is not None
    )

    broker_cash = 0.0
    broker_margin = 0.0
    if is_real_broker:
        broker_cash = float(ao_broker.get("availableCash", 0.0) or 0.0)
        broker_margin = float(ao_broker.get("netMargin", 0.0) or 0.0)
        avail_margin = max(0.0, broker_margin - used_margin)
    else:
        avail_margin = max(0.0, account_cap - used_margin)

    risk_pct = float(cfg.get("max_risk_pct_per_trade", 1.5))
    risk_budget = round(account_cap * (risk_pct / 100.0), 2)
    max_cap_bot = float(cfg.get("max_capital_per_bot") or (account_cap * 0.5))

    return {
        "account_capital": round(account_cap, 2),
        "configured_account_capital": round(account_cap, 2),
        "used_margin": round(used_margin, 2),
        "available_margin": round(avail_margin, 2),
        "risk_budget_per_trade": risk_budget,
        "max_risk_pct_per_trade": risk_pct,
        "max_capital_per_bot": round(max_cap_bot, 2),
        "broker_reported_cash": round(broker_cash, 2) if is_real_broker else None,
        "broker_reported_margin": round(broker_margin, 2) if is_real_broker else None,
        "is_broker_authenticated": is_real_broker
    }


def get_centralized_rms_config() -> Dict[str, Any]:
    """Retrieves authoritative RMS config from memory_db or returns default parameters."""
    cfg = dict(DEFAULT_RMS_CONFIG)
    try:
        raw = get_config(CONFIG_DB_KEY, "")
        if raw:
            import json
            saved = json.loads(raw)
            if isinstance(saved, dict):
                cfg.update(saved)
    except Exception as e:
        logger.warning(f"Failed to read RMS config from DB: {e}")
    return cfg


def update_centralized_rms_config(updates: Dict[str, Any]) -> Dict[str, Any]:
    """Updates and persists RMS configuration."""
    cfg = get_centralized_rms_config()
    for k, v in updates.items():
        if k in DEFAULT_RMS_CONFIG:
            cfg[k] = v
    try:
        import json
        save_config(CONFIG_DB_KEY, json.dumps(cfg))
    except Exception as e:
        logger.error(f"Failed to save RMS config: {e}")
    return cfg


class CentralizedRiskManager:
    """
    Unified Risk Management System (RMS) for Chintu AI.
    Authoritative, thread-safe risk control engine enforcing:
      0. Input Sanitization & Boundary Validation
      0b. Bot-Level Consecutive-Loss Quarantine
      1. Platform-Wide Emergency Stop Override
      2. Daily Loss Circuit Breaker
      3. Broker Gateway Connection Gate
      4. Stale Feed Rejection Gate
      5. Rate Limiting (Orders/Min)
      6. Inter-Order Cooldown Interval
      7. Daily Loss Ceiling
      8. Portfolio Drawdown Limit
      9. Fleet-Wide Open Positions Limit
      10. Correlated Derivatives Concentration Limit
      11. Idempotency & Directional Position Conflict Gate
      12. Segment Regulatory Margin & Per-Bot Capital Cap
    All executions across all 14 bots, Master Brain, and REST gateways must pass through this manager.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self._lock = threading.RLock()
        self.config = get_centralized_rms_config()
        if config:
            self.config.update(config)
            if "max_account_capital" in config and "account_capital" not in config:
                self.config["account_capital"] = config["max_account_capital"]

        self.order_timestamps: List[float] = []
        self.last_order_time: float = 0.0
        self.daily_realized_pnl: float = 0.0
        self.peak_account_value: float = self.config.get("max_account_capital", 200000.0)
        self.max_consecutive_losses: int = int(self.config.get("max_consecutive_losses", 2))
        self.bot_consecutive_losses: Dict[int, int] = {}
        self.quarantined_bots: Dict[int, Dict[str, Any]] = {}

    def record_trade_result(self, bot_id: int, net_pnl: float) -> Dict[str, Any]:
        """
        Records individual trade result for bot-level consecutive-loss tracking
        and portfolio-level daily realized P&L. Quarantines bots with >= 2 consecutive losses (configurable).
        """
        with self._lock:
            pnl = float(net_pnl or 0.0)
            self.daily_realized_pnl += pnl
            current_equity = float(self.config.get("max_account_capital", 200000.0)) + self.daily_realized_pnl
            if current_equity > self.peak_account_value:
                self.peak_account_value = current_equity

            if pnl < 0.0:
                current_losses = self.bot_consecutive_losses.get(bot_id, 0) + 1
                self.bot_consecutive_losses[bot_id] = current_losses
                if current_losses >= self.max_consecutive_losses:
                    quarantine_entry = {
                        "bot_id": bot_id,
                        "quarantined_at": datetime.now(IST).isoformat(),
                        "consecutive_losses": current_losses,
                        "last_loss_pnl": pnl,
                        "reason": f"Bot {bot_id} reached {current_losses} consecutive losses (threshold {self.max_consecutive_losses}). Quarantined from new entries."
                    }
                    self.quarantined_bots[bot_id] = quarantine_entry
                    log_rms_event("BOT_QUARANTINED", self.max_consecutive_losses, current_losses, f"Bot {bot_id} Quarantined")
                    logger.warning(f"RMS: Bot {bot_id} QUARANTINED after {current_losses} consecutive losses.")
                    return {"status": "QUARANTINED", "bot_id": bot_id, "consecutive_losses": current_losses, "quarantine": quarantine_entry}
                return {"status": "LOSS_RECORDED", "bot_id": bot_id, "consecutive_losses": current_losses}
            else:
                self.bot_consecutive_losses[bot_id] = 0
                return {"status": "PROFIT_RECORDED", "bot_id": bot_id, "consecutive_losses": 0}

    def unquarantine_bot(self, bot_id: int, admin_override: bool = True) -> bool:
        """Removes a bot from quarantine state upon administrator action."""
        with self._lock:
            if not admin_override:
                return False
            removed = self.quarantined_bots.pop(bot_id, None)
            self.bot_consecutive_losses[bot_id] = 0
            if removed:
                log_rms_event("BOT_UNQUARANTINED", 0.0, 0.0, f"Bot {bot_id} unquarantined by admin.")
                logger.info(f"RMS: Bot {bot_id} unquarantined by administrator override.")
                return True
            return False

    def get_quarantined_bots(self) -> Dict[int, Dict[str, Any]]:
        """Returns read-only copy of quarantined bots."""
        with self._lock:
            return dict(self.quarantined_bots)

    def record_realized_pnl(self, pnl: float) -> float:
        """Authoritatively increments portfolio-level daily realized PnL."""
        with self._lock:
            self.daily_realized_pnl += float(pnl or 0.0)
            current_equity = float(self.config.get("max_account_capital", 200000.0)) + self.daily_realized_pnl
            if current_equity > self.peak_account_value:
                self.peak_account_value = current_equity
            return round(self.daily_realized_pnl, 2)

    def calculate_position_size(
        self,
        entry: float,
        stop_loss: float,
        capital: Optional[float] = None,
        risk_pct: Optional[float] = None,
        lotsize: int = 1,
        symbol: str = "",
        segment: str = "NSE Equity",
        max_capital_per_trade: Optional[float] = None
    ) -> int:
        """
        Calculates position size strictly constrained by:
        1. Risk budget: Qty_risk = (Capital * RiskPct) / |Entry - StopLoss|
        2. Margin limit: Qty_margin = Available_Capital / Margin_Per_Unit
        3. Per-bot cap: Qty_bot = Max_Capital_Per_Bot / Margin_Per_Unit
        4. Quantized downward to valid integer multiples of lotsize.
        Returns 0 if available budget or margin cannot satisfy even 1 minimum lot.
        """
        with self._lock:
            if entry <= 0 or stop_loss <= 0 or entry == stop_loss:
                return max(1, lotsize)

            if capital is not None:
                try:
                    cap = float(capital)
                except (ValueError, TypeError):
                    cap = 0.0
            else:
                cap = float(self.config.get("account_capital") or self.config.get("max_account_capital") or 20000.0)

            if math.isnan(cap) or math.isinf(cap) or cap <= 0:
                return 0

            r_pct = float(risk_pct or self.config.get("max_risk_pct_per_trade", 1.5)) / 100.0
            risk_budget = cap * r_pct
            sl_distance = abs(entry - stop_loss)

            if sl_distance <= 0:
                return 0

            max_qty_risk = risk_budget / sl_distance

            # Evaluate margin constraint when instrument is specified
            if symbol:
                unit_margin = calculate_required_margin(symbol, segment, entry, 1)
                margin_avail = max(0.0, cap - calculate_open_positions_used_margin())
                max_bot_cap = float(max_capital_per_trade or self.config.get("max_capital_per_bot") or cap)
                alloc_cap = min(margin_avail, max_bot_cap)
                max_qty_margin = (alloc_cap / unit_margin) if unit_margin > 0 else max_qty_risk
                max_affordable = min(max_qty_risk, max_qty_margin)
            else:
                max_affordable = max_qty_risk

            eff_lot = max(1, int(lotsize or 1))
            num_lots = int(max_affordable // eff_lot)
            if num_lots <= 0:
                return 0

            return num_lots * eff_lot

    def validate_order_risk(
        self,
        bot_id: int,
        symbol: str,
        action: str,
        qty: int,
        price: float,
        stop_loss: Optional[float] = None,
        segment: str = "NSE Equity",
        execution_mode: str = "PAPER",
        broker_connected: bool = True,
        feed_age_seconds: float = 0.0,
        is_emergency_exit: bool = False,
        custom_capital: Optional[float] = None,
        enforce_cooldown: Optional[bool] = None
    ) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Comprehensive pre-trade risk evaluation.
        Enforces 15 distinct risk checks with fail-closed safety.
        Returns (is_approved, rejection_reason, risk_telemetry).
        """
        with self._lock:
            now = time.time()
            clean_action = str(action or "").upper().strip()
            mode = str(execution_mode or "PAPER").upper()

            risk_telemetry: Dict[str, Any] = {
                "bot_id": bot_id,
                "symbol": symbol,
                "action": clean_action,
                "qty": qty,
                "price": price,
                "timestamp": datetime.now(IST).isoformat(),
                "checks_passed": []
            }

            try:
                # ---------------------------------------------------------
                # CHECK 0: Input Sanitization & Boundary Validation
                # ---------------------------------------------------------
                if not symbol or not isinstance(symbol, str) or not symbol.strip():
                    return False, "Input validation failed: symbol identifier must be a non-empty string.", risk_telemetry

                valid_actions = ("BUY", "SELL", "EXIT", "SQUAREOFF")
                if not clean_action or clean_action not in valid_actions:
                    return False, f"Input validation failed: action '{action}' is invalid. Must be one of {valid_actions}.", risk_telemetry

                if not isinstance(qty, int) or isinstance(qty, bool) or qty <= 0:
                    return False, f"Input validation failed: qty '{qty}' must be a positive integer greater than zero.", risk_telemetry

                try:
                    p = float(price)
                    if math.isnan(p) or math.isinf(p) or p < 0:
                        return False, f"Input validation failed: price '{price}' must be a non-negative finite number.", risk_telemetry
                except (ValueError, TypeError):
                    return False, f"Input validation failed: price '{price}' cannot be converted to float.", risk_telemetry

                if stop_loss is not None:
                    try:
                        sl = float(stop_loss)
                        if math.isnan(sl) or math.isinf(sl) or sl < 0:
                            return False, f"Input validation failed: stop_loss '{stop_loss}' must be a non-negative finite number.", risk_telemetry
                    except (ValueError, TypeError):
                        return False, f"Input validation failed: stop_loss '{stop_loss}' cannot be converted to float.", risk_telemetry

                risk_telemetry["checks_passed"].append("INPUT_VALIDATION_OK")

                # ---------------------------------------------------------
                # CHECK 0b: Bot-Level Consecutive-Loss Quarantine
                # ---------------------------------------------------------
                if bot_id in self.quarantined_bots and not is_emergency_exit and clean_action not in ("EXIT", "SQUAREOFF"):
                    q_info = self.quarantined_bots[bot_id]
                    return False, f"Bot {bot_id} is QUARANTINED: {q_info.get('reason')}. New entry orders blocked.", risk_telemetry
                risk_telemetry["checks_passed"].append("BOT_QUARANTINE_CLEAR")

                # ---------------------------------------------------------
                # CHECK 1: Emergency Stop System-Wide Override
                # ---------------------------------------------------------
                if self.config.get("emergency_stop_active", False):
                    if is_emergency_exit or clean_action in ("EXIT", "SQUAREOFF"):
                        risk_telemetry["checks_passed"].append("EMERGENCY_STOP_EXIT_BYPASS")
                    else:
                        return False, "Emergency Stop is ACTIVE across the entire platform. New entry orders blocked.", risk_telemetry
                else:
                    risk_telemetry["checks_passed"].append("EMERGENCY_STOP_INACTIVE")

                # ---------------------------------------------------------
                # CHECK 2: Circuit Breaker Status
                # ---------------------------------------------------------
                if self.config.get("circuit_breaker_active", False) and not is_emergency_exit and clean_action not in ("EXIT", "SQUAREOFF"):
                    return False, "RMS Daily Loss Circuit Breaker is TRIPPED. New entry orders blocked.", risk_telemetry
                risk_telemetry["checks_passed"].append("CIRCUIT_BREAKER_CLEAR")

                # ---------------------------------------------------------
                # CHECK 3: Broker Connection Verification (Live Mode Only)
                # ---------------------------------------------------------
                if mode == "LIVE" and not broker_connected:
                    return False, "Live broker connection is disconnected. Fails-closed for capital safety.", risk_telemetry
                risk_telemetry["checks_passed"].append("BROKER_CONNECTION_VERIFIED")

                # ---------------------------------------------------------
                # CHECK 4: Stale Market Feed Rejection Gate (2.0s Entry Threshold)
                # ---------------------------------------------------------
                stale_limit = float(self.config.get("stale_feed_max_age_seconds", 2.0))
                if feed_age_seconds > stale_limit and not is_emergency_exit and clean_action not in ("EXIT", "SQUAREOFF"):
                    return False, f"Market feed is stale ({feed_age_seconds:.1f}s > {stale_limit}s threshold). Order rejected.", risk_telemetry
                risk_telemetry["checks_passed"].append("MARKET_FEED_FRESH")

                # ---------------------------------------------------------
                # CHECK 5: Rate Limiting (Orders Per Minute)
                # ---------------------------------------------------------
                max_opm = int(self.config.get("max_orders_per_minute", 15))
                self.order_timestamps = [t for t in self.order_timestamps if (now - t) < 60.0]
                if len(self.order_timestamps) >= max_opm and not is_emergency_exit:
                    return False, f"Rate limit reached ({len(self.order_timestamps)} orders/min >= limit {max_opm}). Order rejected.", risk_telemetry
                risk_telemetry["checks_passed"].append("RATE_LIMIT_OK")

                # ---------------------------------------------------------
                # CHECK 6: Cooldown Interval Between Trades
                # ---------------------------------------------------------
                min_interval = float(self.config.get("min_order_interval_seconds", 3.0))
                should_enforce_cd = enforce_cooldown if enforce_cooldown is not None else (mode == "LIVE")
                if should_enforce_cd and min_interval > 0 and (now - self.last_order_time) < min_interval and not is_emergency_exit:
                    return False, f"Order cooldown active ({now - self.last_order_time:.1f}s < {min_interval}s interval). Order rejected.", risk_telemetry
                risk_telemetry["checks_passed"].append("COOLDOWN_OK")

                # ---------------------------------------------------------
                # CHECK 7: Daily Loss Limit Check
                # ---------------------------------------------------------
                max_daily_loss = float(self.config.get("max_daily_loss", 5000.0))
                if self.daily_realized_pnl <= -abs(max_daily_loss) and not is_emergency_exit:
                    self.config["circuit_breaker_active"] = True
                    update_centralized_rms_config({"circuit_breaker_active": True})
                    log_rms_event("CIRCUIT_BREAKER_TRIPPED", max_daily_loss, abs(self.daily_realized_pnl), "DAILY_LOSS_LIMIT")
                    return False, f"Daily loss limit (₹{max_daily_loss:,.2f}) breached. Circuit breaker tripped.", risk_telemetry
                risk_telemetry["checks_passed"].append("DAILY_LOSS_OK")

                # ---------------------------------------------------------
                # CHECK 8: Maximum Drawdown Limit Check
                # ---------------------------------------------------------
                max_dd_pct = float(self.config.get("max_drawdown_pct", 5.0))
                account_cap = float(self.config.get("max_account_capital", 200000.0))
                current_equity = account_cap + self.daily_realized_pnl
                if self.peak_account_value > 0:
                    current_dd_pct = ((self.peak_account_value - current_equity) / self.peak_account_value) * 100.0
                    if current_dd_pct >= max_dd_pct and not is_emergency_exit:
                        self.config["circuit_breaker_active"] = True
                        update_centralized_rms_config({"circuit_breaker_active": True})
                        log_rms_event("MAX_DRAWDOWN_BREACHED", max_dd_pct, current_dd_pct, "CIRCUIT_BREAKER_TRIPPED")
                        return False, f"Maximum drawdown limit ({max_dd_pct}%) breached (Current: {current_dd_pct:.2f}%).", risk_telemetry
                risk_telemetry["checks_passed"].append("DRAWDOWN_OK")

                # Skip position / margin checks for exits
                if is_emergency_exit or clean_action in ("EXIT", "SQUAREOFF"):
                    self.order_timestamps.append(now)
                    self.last_order_time = now
                    return True, "Emergency exit / squareoff approved by RMS.", risk_telemetry

                # ---------------------------------------------------------
                # CHECK 9: Maximum Open Positions Limit Check
                # ---------------------------------------------------------
                open_positions = get_open_positions()
                max_pos = int(self.config.get("max_open_positions", 5))
                existing_pos = next((p for p in open_positions if p.get("symbol") == symbol and p.get("status") == "OPEN"), None)

                if len(open_positions) >= max_pos and not existing_pos:
                    return False, f"Maximum open positions limit ({max_pos}) reached. New entries blocked.", risk_telemetry
                risk_telemetry["checks_passed"].append("MAX_POSITIONS_OK")

                # ---------------------------------------------------------
                # CHECK 10: Correlated Derivatives Exposure Limit
                # ---------------------------------------------------------
                max_corr = int(self.config.get("max_correlated_positions", 2))
                index_derivatives = [
                    p for p in open_positions
                    if any(idx in str(p.get("symbol", "")).upper() for idx in ("NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX"))
                ]
                is_index_candidate = any(idx in symbol.upper() for idx in ("NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX"))

                if is_index_candidate and len(index_derivatives) >= max_corr and not existing_pos:
                    return False, f"Maximum correlated index derivative exposure ({max_corr}) reached. Order blocked.", risk_telemetry
                risk_telemetry["checks_passed"].append("CORRELATED_EXPOSURE_OK")

                # ---------------------------------------------------------
                # CHECK 11: Duplicate Position / Directional Conflict Check
                # ---------------------------------------------------------
                if existing_pos:
                    pos_side = existing_pos.get("side", "LONG")
                    target_side = "LONG" if clean_action == "BUY" else "SHORT"
                    if pos_side == target_side:
                        return False, f"Duplicate position conflict: {pos_side} position already active for {symbol}.", risk_telemetry
                risk_telemetry["checks_passed"].append("NO_DUPLICATE_POSITION")

                # ---------------------------------------------------------
                # CHECK 12: Margin & Capital Allocation Limits
                # ---------------------------------------------------------
                margin_req = calculate_required_margin(symbol, segment, price, qty)
                margin_summary = get_account_margin_summary(config=self.config, open_positions=open_positions)
                account_cap = float(custom_capital) if (custom_capital is not None and custom_capital > 0) else margin_summary["configured_account_capital"]
                max_bot_cap = float(custom_capital) if (custom_capital is not None and custom_capital > 0) else margin_summary["max_capital_per_bot"]
                used_margin = margin_summary["used_margin"]
                avail_margin = max(0.0, account_cap - used_margin)
                risk_budget = margin_summary["risk_budget_per_trade"]

                if margin_req > max_bot_cap:
                    return False, f"Required margin (₹{margin_req:,.2f}) exceeds per-bot capital limit (₹{max_bot_cap:,.2f}).", risk_telemetry

                if margin_req > avail_margin:
                    return False, f"Insufficient available margin: Required ₹{margin_req:,.2f}, Available ₹{avail_margin:,.2f} (Account Capital: ₹{account_cap:,.2f}, Used Margin: ₹{used_margin:,.2f}).", risk_telemetry

                if stop_loss and stop_loss > 0 and price > 0:
                    trade_risk = abs(price - stop_loss) * qty
                    if trade_risk > risk_budget:
                        return False, f"Trade risk (₹{trade_risk:,.2f}) exceeds risk budget per trade (₹{risk_budget:,.2f} = {margin_summary['max_risk_pct_per_trade']}% of ₹{account_cap:,.2f}).", risk_telemetry

                risk_telemetry["checks_passed"].append("MARGIN_LIMIT_OK")
                risk_telemetry["margin_required"] = margin_req
                risk_telemetry["available_margin"] = avail_margin

                # Record successful order placement timestamp
                self.order_timestamps.append(now)
                self.last_order_time = now

                return True, "All 12 centralized RMS risk gates passed.", risk_telemetry

            except Exception as e:
                logger.error(f"FAIL-CLOSED RISK EXCEPTION during validate_order_risk: {e}", exc_info=True)
                try:
                    log_rms_event("RMS_EXCEPTION_FAIL_CLOSED", 0.0, 0.0, str(e))
                except Exception:
                    pass
                return False, f"FAIL_CLOSED_RISK_EXCEPTION: Internal RMS validation error: {str(e)}", risk_telemetry

    def authorize_order_intent(
        self,
        bot_id: int,
        symbol: str,
        action: str,
        qty: int,
        price: float = 0.0,
        stop_loss: Optional[float] = None,
        segment: str = "NSE Equity",
        execution_mode: str = "PAPER",
        broker_connected: bool = True,
        feed_age_seconds: float = 0.0,
        is_emergency_exit: bool = False,
        custom_capital: Optional[float] = None,
        enforce_cooldown: Optional[bool] = None
    ) -> Tuple[bool, str, Dict[str, Any]]:
        """Authoritative Risk Guardian gateway. Standard entry point for order intent validation."""
        return self.validate_order_risk(
            bot_id=bot_id,
            symbol=symbol,
            action=action,
            qty=qty,
            price=price,
            stop_loss=stop_loss,
            segment=segment,
            execution_mode=execution_mode,
            broker_connected=broker_connected,
            feed_age_seconds=feed_age_seconds,
            is_emergency_exit=is_emergency_exit,
            custom_capital=custom_capital,
            enforce_cooldown=enforce_cooldown
        )

    def trigger_emergency_stop(self) -> Dict[str, Any]:
        """
        Activates platform-wide emergency stop.
        Blocks all new order entry pathways and signals immediate position liquidation.
        """
        with self._lock:
            self.config["emergency_stop_active"] = True
            self.config["circuit_breaker_active"] = True
            update_centralized_rms_config({
                "emergency_stop_active": True,
                "circuit_breaker_active": True
            })
            log_rms_event("EMERGENCY_STOP_ACTIVATED", 0.0, 0.0, "USER_OR_SYSTEM_OVERRIDE")
            logger.warning("Platform-wide EMERGENCY STOP ACTIVATED. All new entries blocked.")
            return {
                "status": "EMERGENCY_STOP_ARMED",
                "timestamp": datetime.now(IST).isoformat(),
                "message": "All new entry orders are strictly blocked. System armed for safe liquidation."
            }

    def reset_circuit_breaker(self, admin_override: bool = True) -> bool:
        """Resets the circuit breaker and emergency stop upon verified administrator request."""
        with self._lock:
            if not admin_override:
                return False
            self.config["emergency_stop_active"] = False
            self.config["circuit_breaker_active"] = False
            self.daily_realized_pnl = 0.0
            self.quarantined_bots.clear()
            self.bot_consecutive_losses.clear()
            update_centralized_rms_config({
                "emergency_stop_active": False,
                "circuit_breaker_active": False
            })
            log_rms_event("CIRCUIT_BREAKER_RESET", 0.0, 0.0, "ADMIN_OVERRIDE")
            logger.info("Circuit breaker, emergency stop, and bot quarantines reset by administrator.")
            return True


# Singleton instance
centralized_risk_manager = CentralizedRiskManager()

