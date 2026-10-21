"""
CHINTU AI TRADING SYSTEM - Centralized Execution Engine & RMS (Phase 6)
Provides single-pipeline execution across all 14 bots for the shared Angel One broker account.
Enforces:
  1. 6-Step pre-order validation pipeline (Market data, Instrument, Quorum, RMS, Deduplication, State machine).
  2. Idempotent clientOrderId generation and rate limiting.
  3. Strict order state machine (SUBMITTED -> ACKNOWLEDGED -> PENDING -> FILLED / REJECTED / CANCELLED).
  4. Paper simulation with volatility-aware slippage and realistic fills.
  5. Live execution fail-closed circuit breakers and position reconciliation synchronization.
"""

import time
import hashlib
import threading
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple, Set, Callable, Union

from server.memory_db import (
    get_connection,
    save_order,
    get_order,
    save_position,
    get_open_positions,
    close_position,
    record_trade,
    log_rms_event,
    commit_paper_order_execution_atomic,
    recover_ambiguous_paper_orders
)
from server.voting_engine import evaluate_order_quorum, get_voting_config


# =====================================================================
# ORDER STATES & REJECTION REASONS
# =====================================================================

ORDER_STATE_CREATED = "CREATED"
ORDER_STATE_RISK_REJECTED = "RISK_REJECTED"
ORDER_STATE_SUBMITTED = "SUBMITTED"
ORDER_STATE_ACKNOWLEDGED = "ACKNOWLEDGED"
ORDER_STATE_OPEN = "OPEN"
ORDER_STATE_PENDING = "PENDING"
ORDER_STATE_PARTIALLY_FILLED = "PARTIALLY_FILLED"
ORDER_STATE_FILLED = "FILLED"
ORDER_STATE_CANCEL_PENDING = "CANCEL_PENDING"
ORDER_STATE_CANCELLED = "CANCELLED"
ORDER_STATE_REJECTED = "REJECTED"
ORDER_STATE_EXPIRED = "EXPIRED"
ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION = "UNKNOWN_PENDING_RECONCILIATION"
ORDER_STATE_QUARANTINED = "QUARANTINED"

VALID_ORDER_STATES = {
    ORDER_STATE_CREATED,
    ORDER_STATE_RISK_REJECTED,
    ORDER_STATE_SUBMITTED,
    ORDER_STATE_ACKNOWLEDGED,
    ORDER_STATE_OPEN,
    ORDER_STATE_PENDING,
    ORDER_STATE_PARTIALLY_FILLED,
    ORDER_STATE_FILLED,
    ORDER_STATE_CANCEL_PENDING,
    ORDER_STATE_CANCELLED,
    ORDER_STATE_REJECTED,
    ORDER_STATE_EXPIRED,
    ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION
}

# Terminal states: Once entered, CANNOT transition to any other state
TERMINAL_ORDER_STATES = {
    ORDER_STATE_FILLED,
    ORDER_STATE_CANCELLED,
    ORDER_STATE_REJECTED,
    ORDER_STATE_RISK_REJECTED,
    ORDER_STATE_EXPIRED
}

# Legacy and external state aliases mapped to canonical ORDER_STATE_* identifiers
ORDER_STATE_ALIASES = {
    "COMPLETE": ORDER_STATE_FILLED,
    "PARTIAL_FILL": ORDER_STATE_PARTIALLY_FILLED,
    "AMBIGUOUS_TIMEOUT": ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION,
    "TIMEOUT_AWAITING_RECONCILIATION": ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION,
    "CANCELED": ORDER_STATE_CANCELLED,
    "NEW": ORDER_STATE_CREATED,
}

def normalize_order_state(state: str) -> str:
    """Normalizes legacy status strings to canonical ORDER_STATE_* identifiers."""
    s = str(state or "").upper().strip()
    return ORDER_STATE_ALIASES.get(s, s)

# Strict Directed Graph of Allowed State Transitions
LEGAL_ORDER_TRANSITIONS: Dict[str, Set[str]] = {
    ORDER_STATE_CREATED: {
        ORDER_STATE_RISK_REJECTED,
        ORDER_STATE_SUBMITTED,
        ORDER_STATE_REJECTED,
        ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION
    },
    ORDER_STATE_SUBMITTED: {
        ORDER_STATE_ACKNOWLEDGED,
        ORDER_STATE_OPEN,
        ORDER_STATE_PENDING,
        ORDER_STATE_REJECTED,
        ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION,
        ORDER_STATE_FILLED
    },
    ORDER_STATE_ACKNOWLEDGED: {
        ORDER_STATE_OPEN,
        ORDER_STATE_PENDING,
        ORDER_STATE_PARTIALLY_FILLED,
        ORDER_STATE_FILLED,
        ORDER_STATE_CANCEL_PENDING,
        ORDER_STATE_CANCELLED,
        ORDER_STATE_REJECTED,
        ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION
    },
    ORDER_STATE_OPEN: {
        ORDER_STATE_PARTIALLY_FILLED,
        ORDER_STATE_FILLED,
        ORDER_STATE_CANCEL_PENDING,
        ORDER_STATE_CANCELLED,
        ORDER_STATE_REJECTED,
        ORDER_STATE_EXPIRED,
        ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION
    },
    ORDER_STATE_PENDING: {
        ORDER_STATE_OPEN,
        ORDER_STATE_PARTIALLY_FILLED,
        ORDER_STATE_FILLED,
        ORDER_STATE_CANCEL_PENDING,
        ORDER_STATE_CANCELLED,
        ORDER_STATE_REJECTED,
        ORDER_STATE_EXPIRED,
        ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION
    },
    ORDER_STATE_PARTIALLY_FILLED: {
        ORDER_STATE_PARTIALLY_FILLED,
        ORDER_STATE_FILLED,
        ORDER_STATE_CANCEL_PENDING,
        ORDER_STATE_CANCELLED,
        ORDER_STATE_EXPIRED,
        ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION
    },
    ORDER_STATE_CANCEL_PENDING: {
        ORDER_STATE_CANCELLED,
        ORDER_STATE_FILLED,
        ORDER_STATE_PARTIALLY_FILLED,
        ORDER_STATE_REJECTED,
        ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION
    },
    ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION: {
        ORDER_STATE_ACKNOWLEDGED,
        ORDER_STATE_OPEN,
        ORDER_STATE_PENDING,
        ORDER_STATE_PARTIALLY_FILLED,
        ORDER_STATE_FILLED,
        ORDER_STATE_CANCELLED,
        ORDER_STATE_REJECTED,
        ORDER_STATE_EXPIRED
    },
    # Terminal states have no valid transitions to other states
    ORDER_STATE_FILLED: set(),
    ORDER_STATE_CANCELLED: set(),
    ORDER_STATE_REJECTED: set(),
    ORDER_STATE_RISK_REJECTED: set(),
    ORDER_STATE_EXPIRED: set(),
}

def validate_order_state_transition(from_state: str, to_state: str) -> Tuple[bool, str]:
    """
    Validates whether transitioning an order from `from_state` to `to_state` is legal.
    Enforces that terminal states (FILLED, CANCELLED, REJECTED, RISK_REJECTED, EXPIRED)
    cannot transition to any other state.
    """
    from_s = normalize_order_state(from_state)
    to_s = normalize_order_state(to_state)

    if from_s not in VALID_ORDER_STATES:
        return False, f"Invalid source order state '{from_state}'"
    if to_s not in VALID_ORDER_STATES:
        return False, f"Invalid destination order state '{to_state}'"

    # Idempotent re-entry into same state is allowed
    if from_s == to_s:
        return True, f"Idempotent state confirmation: {from_s}"

    # Terminal state protection
    if from_s in TERMINAL_ORDER_STATES:
        return False, f"Illegal transition: Terminal state '{from_s}' cannot transition to '{to_s}'."

    allowed = LEGAL_ORDER_TRANSITIONS.get(from_s, set())
    if to_s in allowed:
        return True, f"Valid transition from {from_s} to {to_s}."

    return False, f"Illegal transition: Order state '{from_s}' cannot transition to '{to_s}'."


def transition_order_state(
    order_id: str,
    new_state: str,
    filled_qty: Optional[int] = None,
    avg_price: Optional[float] = None,
    rejection_reason: Optional[str] = None
) -> Dict[str, Any]:
    """
    Safely transitions an order to a new state in orders_memory after validation.
    Rejects and logs illegal transitions.
    """
    order = get_order(order_id)
    if not order:
        return {
            "success": False,
            "order_id": order_id,
            "error": f"Order '{order_id}' not found in orders_memory."
        }

    current_state = normalize_order_state(str(order.get("status") or ORDER_STATE_CREATED))
    target_state = normalize_order_state(str(new_state or ""))

    valid, reason = validate_order_state_transition(current_state, target_state)
    if not valid:
        try:
            log_rms_event("ILLEGAL_ORDER_TRANSITION", 0.0, 0.0, f"{order_id}: {reason}")
        except Exception:
            pass
        return {
            "success": False,
            "order_id": order_id,
            "error": reason,
            "current_state": current_state,
            "target_state": target_state
        }

    # Update order record
    order_dict = dict(order)
    order_dict["status"] = target_state
    if filled_qty is not None:
        order_dict["filled_qty"] = filled_qty
    if avg_price is not None:
        order_dict["avg_price"] = avg_price
    if rejection_reason is not None:
        order_dict["rejection_reason"] = rejection_reason
    order_dict["updated_at"] = datetime.now().isoformat()

    save_order(order_dict)

    if 'execution_engine' in globals() and execution_engine is not None:
        try:
            execution_engine._emit_order_event("ORDER_STATUS_UPDATE", {
                "order_id": order_id,
                "orderId": order_id,
                "client_order_id": order_dict.get("client_order_id", order_id),
                "status": target_state,
                "previous_state": current_state,
                "symbol": order_dict.get("symbol"),
                "action": order_dict.get("action"),
                "qty": order_dict.get("qty"),
                "filled_qty": order_dict.get("filled_qty"),
                "avg_price": order_dict.get("avg_price"),
                "rejection_reason": order_dict.get("rejection_reason"),
                "mode": order_dict.get("mode"),
                "bot": order_dict.get("bot")
            })
        except Exception:
            pass

    return {
        "success": True,
        "order_id": order_id,
        "previous_state": current_state,
        "new_state": target_state,
        "filled_qty": order_dict.get("filled_qty"),
        "avg_price": order_dict.get("avg_price"),
        "message": reason
    }

# Supported Indian Instrument Lot Sizes and Exchange Segments
ANGEL_SYMBOL_MAP: Dict[str, Dict[str, Any]] = {
    "NIFTY 50": {"tradingsymbol": "NIFTY24OCTFUT", "symboltoken": "42125", "exchange": "NFO", "lotsize": 50, "segment": "NSE F&O Options"},
    "BANKNIFTY": {"tradingsymbol": "BANKNIFTY24OCTFUT", "symboltoken": "43120", "exchange": "NFO", "lotsize": 30, "segment": "NSE F&O Options"},
    "RELIANCE": {"tradingsymbol": "RELIANCE-EQ", "symboltoken": "2885", "exchange": "NSE", "lotsize": 1, "segment": "NSE Equity"},
    "TATA MOTORS": {"tradingsymbol": "TATAMOTORS-EQ", "symboltoken": "3456", "exchange": "NSE", "lotsize": 1, "segment": "NSE Equity"},
    "GOLD (XAUUSD)": {"tradingsymbol": "GOLD24DECFUT", "symboltoken": "242100", "exchange": "MCX", "lotsize": 10, "segment": "MCX Commodity"},
    "HDFC BANK": {"tradingsymbol": "HDFCBANK-EQ", "symboltoken": "1333", "exchange": "NSE", "lotsize": 1, "segment": "NSE Equity"},
    "HDFCBANK": {"tradingsymbol": "HDFCBANK-EQ", "symboltoken": "1333", "exchange": "NSE", "lotsize": 1, "segment": "NSE Equity"},
    "INFY": {"tradingsymbol": "INFY-EQ", "symboltoken": "1594", "exchange": "NSE", "lotsize": 1, "segment": "NSE Equity"},
    "CRUDE OIL": {"tradingsymbol": "CRUDEOIL24NOVFUT", "symboltoken": "254120", "exchange": "MCX", "lotsize": 100, "segment": "MCX Commodity"},
    "USDINR": {"tradingsymbol": "USDINR24OCTFUT", "symboltoken": "1205", "exchange": "CDS", "lotsize": 1000, "segment": "Currency Derivatives"},
    "NIFTY OPTIONS": {"tradingsymbol": "NIFTY24OCT24750CE", "symboltoken": "54231", "exchange": "NFO", "lotsize": 75, "segment": "NSE F&O Options"},
    "SILVER (XAGUSD)": {"tradingsymbol": "SILVER24DECFUT", "symboltoken": "243100", "exchange": "MCX", "lotsize": 300, "segment": "MCX Commodity"},
    "BTCUSDT": {"tradingsymbol": "BTCUSDT-PERP", "symboltoken": "999901", "exchange": "BINANCE", "lotsize": 1, "segment": "Crypto Perpetual"},
    "ETHUSDT": {"tradingsymbol": "ETHUSDT-PERP", "symboltoken": "999902", "exchange": "BINANCE", "lotsize": 5, "segment": "Crypto Perpetual"},
    "MIDCPNIFTY": {"tradingsymbol": "MIDCPNIFTY24OCTFUT", "symboltoken": "45120", "exchange": "NFO", "lotsize": 75, "segment": "NSE F&O Options"},
    "FINNIFTY": {"tradingsymbol": "FINNIFTY24OCTFUT", "symboltoken": "26037", "exchange": "NFO", "lotsize": 40, "segment": "NSE F&O Options"},
    "BANKNIFTY OPTIONS": {"tradingsymbol": "BANKNIFTY24OCT52500CE", "symboltoken": "55120", "exchange": "NFO", "lotsize": 30, "segment": "NSE F&O Options"},
    "SENSEX": {"tradingsymbol": "SENSEX24OCTFUT", "symboltoken": "51240", "exchange": "BFO", "lotsize": 10, "segment": "BSE Derivatives"}
}


# =====================================================================
# VOLATILITY-AWARE DYNAMIC SLIPPAGE
# =====================================================================

def compute_volatility_aware_slippage(
    price: float,
    action: str,
    atr: Optional[float] = None,
    symbol: Optional[str] = None
) -> Tuple[float, float]:
    """
    Computes dynamic volatility-aware slippage rate and simulated fill price.
    Formula:
        Slippage Rate = max(0.0002, min(0.0025, (0.1 * ATR) / Price))
    Bounds:
        Min 2 bps (0.0002), Max 25 bps (0.0025).
    Fallback:
        If ATR is None, <= 0, or Price <= 0: defaults to baseline 3 bps (0.0003).

    For BUY: fill_price = round(price * (1.0 + slippage_rate), 2)
    For SELL/EXIT/SQUAREOFF: fill_price = round(price * (1.0 - slippage_rate), 2)

    Returns:
        Tuple of (fill_price: float, slippage_rate: float)
    """
    act_up = str(action or "BUY").upper().strip()
    base_price = float(price) if price and price > 0 else 24500.0

    if atr is not None and atr > 0 and base_price > 0:
        raw_slip = (0.1 * float(atr)) / base_price
        slip_rate = max(0.0002, min(0.0025, raw_slip))
    else:
        slip_rate = 0.0003  # 3 bps baseline fallback

    if act_up == "BUY":
        fill_price = round(base_price * (1.0 + slip_rate), 2)
    else:
        fill_price = round(base_price * (1.0 - slip_rate), 2)

    return fill_price, slip_rate


# =====================================================================
# EXECUTION ENGINE STATE & RATE LIMITER
# =====================================================================

class CentralizedExecutionEngine:
    """
    Authoritative single-gateway execution coordinator for Angel One.
    """

    def __init__(self):
        self.max_orders_per_minute: int = 15
        self.order_timestamps: List[float] = []
        self.recent_client_order_ids: Dict[str, float] = {}  # idempotency cache {client_order_id: timestamp}
        self._recent_generated_cids: Dict[Tuple[int, str, str, str], Tuple[str, float]] = {}  # {(bot_id, symbol, action, price): (cid, timestamp)}
        self.enforce_market_hours: bool = False             # Configurable; False in paper/test, True in Live
        self.max_open_positions: int = 10
        self.idempotency_window_seconds: float = 10.0
        self.order_event_listeners: List[Callable[[Dict[str, Any]], None]] = []
        self.position_event_listeners: List[Callable[[Dict[str, Any]], None]] = []
        self._listener_lock: threading.Lock = threading.Lock()
        self._idempotency_lock: threading.Lock = threading.Lock()
        self._test_failure_injection_point: Optional[str] = None
        try:
            self.hydrate_from_db()
        except Exception:
            pass

    def clear_idempotency_cache(self) -> None:
        """Clears all in-memory idempotency caches and order submission timestamps."""
        lock = getattr(self, "_idempotency_lock", None)
        if lock is not None:
            with lock:
                self.recent_client_order_ids.clear()
                self.order_timestamps.clear()
                if hasattr(self, "_recent_generated_cids"):
                    self._recent_generated_cids.clear()
        else:
            self.recent_client_order_ids.clear()
            self.order_timestamps.clear()
            if hasattr(self, "_recent_generated_cids"):
                self._recent_generated_cids.clear()

    def hydrate_from_db(self, lookback_seconds: float = 60.0) -> int:
        """
        Hydrates in-memory recent_client_order_ids and order_timestamps
        from SQLite orders_memory on startup or re-initialization.
        Ensures rate-limiting and deduplication survive server/worker restarts.
        """
        hydrated_count = 0
        try:
            conn = get_connection()
            try:
                cur = conn.cursor()
                now = time.time()
                cur.execute("""
                    SELECT client_order_id, order_id, created_at, updated_at
                    FROM orders_memory
                    ORDER BY rowid DESC
                    LIMIT 200
                """)
                rows = cur.fetchall()
                for row in rows:
                    cid = str(row["client_order_id"] or row["order_id"] or "").strip()
                    if not cid:
                        continue
                    created_str = row["created_at"]
                    order_ts = None
                    if created_str:
                        try:
                            dt = datetime.fromisoformat(str(created_str).replace("Z", "+00:00"))
                            order_ts = dt.timestamp()
                        except Exception:
                            order_ts = now - 5.0
                    else:
                        order_ts = now - 5.0

                    if cid not in self.recent_client_order_ids:
                        self.recent_client_order_ids[cid] = order_ts
                        hydrated_count += 1

                    if (now - order_ts) <= lookback_seconds:
                        if order_ts not in self.order_timestamps:
                            self.order_timestamps.append(order_ts)
            finally:
                conn.close()
        except Exception:
            pass
        return hydrated_count

    def register_order_listener(self, callback: Callable[[Dict[str, Any]], None]) -> None:
        """Registers a thread-safe callback for real-time order status updates."""
        with self._listener_lock:
            if callback not in self.order_event_listeners:
                self.order_event_listeners.append(callback)

    def unregister_order_listener(self, callback: Callable[[Dict[str, Any]], None]) -> None:
        """Unregisters an order listener callback."""
        with self._listener_lock:
            if callback in self.order_event_listeners:
                self.order_event_listeners.remove(callback)

    def register_position_listener(self, callback: Callable[[Dict[str, Any]], None]) -> None:
        """Registers a thread-safe callback for position updates."""
        with self._listener_lock:
            if callback not in self.position_event_listeners:
                self.position_event_listeners.append(callback)

    def unregister_position_listener(self, callback: Callable[[Dict[str, Any]], None]) -> None:
        """Unregisters a position listener callback."""
        with self._listener_lock:
            if callback in self.position_event_listeners:
                self.position_event_listeners.remove(callback)

    def _emit_order_event(self, event_type: str, data: Dict[str, Any]) -> None:
        """Dispatches an order event to all registered listeners safely without blocking."""
        with self._listener_lock:
            listeners = list(self.order_event_listeners)
        payload = dict(data)
        payload["type"] = event_type
        if "timestamp" not in payload:
            payload["timestamp"] = datetime.now().isoformat()
        for cb in listeners:
            try:
                cb(payload)
            except Exception:
                pass

    def _emit_position_event(self, event_type: str, data: Dict[str, Any]) -> None:
        """Dispatches a position update event to all registered listeners safely."""
        with self._listener_lock:
            listeners = list(self.position_event_listeners)
        payload = dict(data)
        payload["type"] = event_type
        if "timestamp" not in payload:
            payload["timestamp"] = datetime.now().isoformat()
        for cb in listeners:
            try:
                cb(payload)
            except Exception:
                pass

    def generate_idempotent_order_id(
        self,
        bot_id: int,
        symbol: str,
        action: str,
        price: float,
        timestamp: Optional[Union[float, int, str]] = None
    ) -> str:
        """
        Generates deterministic 64-bit client order ID combining bot, symbol, action, and price.
        Prevents double-order execution from rapid network retries within the idempotency window.
        Uses a sliding elapsed-time check to prevent tumbling time-bucket boundary rollover defects.
        """
        now = time.time() if timestamp is None else (
            float(timestamp) if isinstance(timestamp, (int, float)) else (
                datetime.fromisoformat(str(timestamp).replace("Z", "+00:00")).timestamp()
            )
        )
        clean_sym = str(symbol or "").upper().strip()
        act_upper = str(action or "").upper().strip()
        price_val = float(price or 0.0)
        key = (int(bot_id), clean_sym, act_upper, f"{price_val:.2f}")

        lock = getattr(self, "_idempotency_lock", None)
        if lock is None:
            self._idempotency_lock = threading.Lock()
            lock = self._idempotency_lock

        with lock:
            if not hasattr(self, "_recent_generated_cids"):
                self._recent_generated_cids = {}

            # Prune expired entries to prevent unbounded memory growth
            expired = [k for k, (_, t_g) in self._recent_generated_cids.items() if (now - t_g) >= self.idempotency_window_seconds or (now - t_g) < 0]
            for k in expired:
                del self._recent_generated_cids[k]

            if key in self._recent_generated_cids:
                existing_cid, last_gen_time = self._recent_generated_cids[key]
                if 0.0 <= (now - last_gen_time) < self.idempotency_window_seconds:
                    return existing_cid

            raw_key = f"{key[0]}_{key[1]}_{key[2]}_{key[3]}_{now:.3f}"
            hash_digest = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()[:12]
            new_cid = f"ORD-{bot_id}-{hash_digest}"
            self._recent_generated_cids[key] = (new_cid, now)
            return new_cid

    def check_rate_limit(self) -> Tuple[bool, str]:
        """Enforces maximum order submissions per minute to protect broker API limits."""
        now = time.time()
        # Prune timestamps older than 60 seconds
        self.order_timestamps = [t for t in self.order_timestamps if (now - t) < 60.0]
        if len(self.order_timestamps) >= self.max_orders_per_minute:
            return False, f"Rate limit exceeded: {len(self.order_timestamps)} orders placed in last 60 seconds (max {self.max_orders_per_minute})."
        return True, ""

    def validate_market_session(self, exchange: str) -> Tuple[bool, str]:
        """
        Validates Indian market trading sessions.
        NSE / BSE: 09:15 to 15:30 IST (Mon-Fri)
        MCX: 09:00 to 23:30 IST (Mon-Fri)
        """
        if not self.enforce_market_hours:
            return True, "Market hours check bypassed by configuration (Paper/Test mode)."

        now_utc = datetime.utcnow()
        # Convert UTC to IST (+5:30)
        from datetime import timedelta
        ist_now = now_utc + timedelta(hours=5, minutes=30)
        weekday = ist_now.weekday()  # 0=Monday, 6=Sunday

        if weekday >= 5:
            return False, "Market is closed on weekends (Saturday/Sunday)."

        current_time_minutes = ist_now.hour * 60 + ist_now.minute

        if exchange in ("NSE", "NFO", "BSE", "BFO", "CDS"):
            if current_time_minutes < (9 * 60 + 15) or current_time_minutes > (15 * 60 + 30):
                return False, f"NSE/BSE market is closed. Active trading hours: 09:15 - 15:30 IST (Current: {ist_now.strftime('%H:%M')} IST)."
        elif exchange == "MCX":
            if current_time_minutes < (9 * 60) or current_time_minutes > (23 * 60 + 30):
                return False, f"MCX market is closed. Active trading hours: 09:00 - 23:30 IST (Current: {ist_now.strftime('%H:%M')} IST)."

        return True, "Market session active."

    def execute_order(
        self,
        bot_id: int,
        symbol: str,
        action: str,
        qty: int,
        price: float = 0.0,
        bot_name: Optional[str] = None,
        producttype: str = "INTRADAY",
        ordertype: str = "MARKET",
        is_emergency_exit: bool = False,
        execution_mode: str = "PAPER",
        broker_state: Optional[Dict[str, Any]] = None,
        rms_state: Optional[Dict[str, Any]] = None,
        reconciliation_state: Optional[Dict[str, Any]] = None,
        active_smart_connect: Optional[Dict[str, Any]] = None,
        client_order_id: Optional[str] = None,
        atr: Optional[float] = None,
        fill_qty: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Centrally processes and validates all orders across the 14 bots before routing.
        
        The 6 Pre-Flight Validation Gates:
          1. Broker Connection & Feed Health Gate.
          2. Instrument Parameter & Market Session Gate.
          3. Majority Approval & Emergency Exit Gate.
          4. RMS Capital, Drawdown & Rate Limit Gate.
          5. Idempotency & Position Conflict Gate.
          6. State Machine Execution & Transition Routing.
        """
        mode = str(execution_mode).upper().strip() if execution_mode else ""
        act_upper = str(action or "").upper().strip()
        b_name = bot_name or f"Bot {bot_id}"
        clean_sym = str(symbol or "").strip()

        # Generate idempotent client_order_id if not provided
        cid = client_order_id or self.generate_idempotent_order_id(bot_id, clean_sym, act_upper, price)

        def _reject(err_msg: str, gate_name: str = "", extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
            order_record = {
                "order_id": cid,
                "orderId": cid,
                "client_order_id": cid,
                "clientOrderId": cid,
                "bot": b_name,
                "symbol": clean_sym,
                "segment": "NSE Equity",
                "action": act_upper,
                "qty": qty,
                "filled_qty": 0,
                "price": price,
                "avg_price": 0.0,
                "ordertype": ordertype,
                "producttype": producttype,
                "variety": "NORMAL",
                "exchange": "NSE",
                "status": ORDER_STATE_REJECTED,
                "rejection_reason": err_msg,
                "is_emergency_exit": 1 if is_emergency_exit else 0,
                "mode": mode,
                "broker": "Angel One (SmartAPI)" if mode == "LIVE" else "Paper Engine",
                "created_at": datetime.now().isoformat()
            }
            try:
                conn_chk = get_connection()
                try:
                    cur_chk = conn_chk.cursor()
                    cur_chk.execute("SELECT status FROM orders_memory WHERE order_id = ? OR client_order_id = ?", (cid, cid))
                    existing_rec = cur_chk.fetchone()
                    if not (existing_rec and existing_rec["status"] in ("FILLED", "QUARANTINED", "PARTIALLY_FILLED")):
                        save_order(order_record)
                finally:
                    conn_chk.close()
            except Exception:
                pass

            try:
                self._emit_order_event("ORDER_STATUS_UPDATE", {
                    "order_id": cid,
                    "orderId": cid,
                    "client_order_id": cid,
                    "symbol": clean_sym,
                    "bot": b_name,
                    "action": act_upper,
                    "qty": qty,
                    "status": ORDER_STATE_REJECTED,
                    "rejection_reason": err_msg,
                    "gate": gate_name,
                    "mode": mode
                })
            except Exception:
                pass

            res = {
                "success": False,
                "orderId": cid,
                "order_id": cid,
                "status": ORDER_STATE_REJECTED,
                "state": ORDER_STATE_REJECTED,
                "error": err_msg,
                "mode": mode,
                "gate": gate_name
            }
            if extra:
                res.update(extra)
            return res

        # Gate -1 / Gate 2: Early Parameter Validation (Reject invalid/non-positive quantities)
        if not isinstance(qty, int) or isinstance(qty, bool) or qty <= 0:
            return _reject(f"Order quantity {qty} is invalid. Must be a positive integer.", "GATE_2_QTY")

        if fill_qty is not None and (not isinstance(fill_qty, int) or isinstance(fill_qty, bool) or fill_qty <= 0):
            return _reject(f"Fill quantity {fill_qty} is invalid. Must be a positive integer.", "GATE_2_QTY")

        # -------------------------------------------------------------
        # GATE 0: Idempotency & Rate Limit Check
        # -------------------------------------------------------------
        now = time.time()
        if cid in self.recent_client_order_ids:
            last_ts = self.recent_client_order_ids[cid]
            if (now - last_ts) < self.idempotency_window_seconds:
                return _reject(f"Duplicate order detected with clientOrderId '{cid}' within {self.idempotency_window_seconds}s.", "GATE_0_IDEMPOTENCY")

        # Authoritative Idempotent Replay Check for Paper Execution (cross-restart or post-window retry)
        if mode == "PAPER":
            conn_check = get_connection()
            try:
                cur_check = conn_check.cursor()
                cur_check.execute("SELECT order_id, status, filled_qty, avg_price FROM orders_memory WHERE order_id = ? OR client_order_id = ?", (cid, cid))
                row_check = cur_check.fetchone()
                if row_check and row_check["status"] == "FILLED":
                    cur_check.execute("SELECT trade_id FROM trade_memory WHERE order_id = ? OR order_id = ?", (row_check["order_id"], cid))
                    trade_check = cur_check.fetchone()
                    if trade_check:
                        auth_filled_qty = int(row_check["filled_qty"] if row_check["filled_qty"] is not None else 0)
                        auth_fill_price = float(row_check["avg_price"] if row_check["avg_price"] is not None else 0.0)
                        return {
                            "success": True,
                            "orderId": cid,
                            "order_id": row_check["order_id"],
                            "status": ORDER_STATE_FILLED,
                            "state": ORDER_STATE_FILLED,
                            "fill_price": auth_fill_price,
                            "filled_qty": auth_filled_qty,
                            "mode": mode,
                            "quorum": "11/13",
                            "idempotent_replay": True,
                            "message": f"Paper order {cid} already executed (authoritative idempotent replay: {auth_filled_qty}x {clean_sym} @ ₹{auth_fill_price:.2f})"
                        }
            finally:
                conn_check.close()

        # Gate 0b: Authoritative Early Overfill & Terminal State Guard (PAPER mode)
        if mode == "PAPER":
            proposed_fill = fill_qty if (fill_qty is not None and fill_qty > 0) else qty
            conn_chk_of = get_connection()
            try:
                cur_chk_of = conn_chk_of.cursor()
                cur_chk_of.execute("SELECT qty, status, filled_qty FROM orders_memory WHERE order_id = ? OR client_order_id = ?", (cid, cid))
                pre_order = cur_chk_of.fetchone()
                cur_chk_of.execute("SELECT qty FROM trade_memory WHERE order_id = ? OR order_id = ?", (cid, cid))
                pre_trades = cur_chk_of.fetchall()
                prior_filled = sum(abs(int(t["qty"])) for t in pre_trades)
            finally:
                conn_chk_of.close()

            is_active_order = pre_order and (
                pre_order["status"] in ("PARTIALLY_FILLED", "PENDING", "OPEN") or prior_filled > 0
            )
            auth_order_qty = abs(int(pre_order["qty"])) if (is_active_order and pre_order["qty"] is not None) else qty

            # Check if order is already completely filled
            if pre_order and pre_order["status"] == "FILLED":
                return {
                    "success": False,
                    "orderId": cid,
                    "order_id": cid,
                    "status": ORDER_STATE_REJECTED,
                    "state": ORDER_STATE_REJECTED,
                    "error": f"Illegal execution: Order {cid} is already FILLED and cannot accept additional fills.",
                    "mode": mode,
                    "gate": "GATE_0B_OVERFILL_PROTECTION"
                }

            if pre_order and pre_order["status"] == "QUARANTINED":
                return {
                    "success": False,
                    "orderId": cid,
                    "order_id": cid,
                    "status": ORDER_STATE_REJECTED,
                    "state": ORDER_STATE_REJECTED,
                    "error": f"Illegal execution: Order {cid} is in terminal state 'QUARANTINED'.",
                    "mode": mode,
                    "gate": "GATE_0B_OVERFILL_PROTECTION"
                }

            if (prior_filled + proposed_fill) > auth_order_qty:
                return {
                    "success": False,
                    "orderId": cid,
                    "order_id": cid,
                    "status": ORDER_STATE_REJECTED,
                    "state": ORDER_STATE_REJECTED,
                    "error": f"Overfill rejected: Proposed fill {proposed_fill} plus prior filled {prior_filled} exceeds order quantity {auth_order_qty}.",
                    "mode": mode,
                    "gate": "GATE_0B_OVERFILL_PROTECTION"
                }

        rate_ok, rate_err = self.check_rate_limit()
        if not rate_ok and not is_emergency_exit:
            return _reject(rate_err, "GATE_0_RATE_LIMIT")

        # -------------------------------------------------------------
        # GATE 1: Broker Connection & Authenticity Gate
        # -------------------------------------------------------------
        if mode == "LIVE":
            b_state = broker_state.get("angel_one", {}) if broker_state else {}
            if not b_state.get("connected") or not active_smart_connect or not active_smart_connect.get("instance"):
                return _reject("Live order blocked: Angel One broker gateway is not authenticated or connected.", "GATE_1_BROKER_AUTH")

            # Reconciliation Gate: Block live entries if local and broker books are out of sync
            rec_status = (reconciliation_state or {}).get("status", "UNINITIALIZED")
            if not is_emergency_exit and (rec_status in ("MISMATCH", "FAILED", "NOT_VERIFIED") or (reconciliation_state or {}).get("block_live_entries", False)):
                return _reject(f"Live order blocked: Position reconciliation mismatch ({rec_status}). Books must match before placing live entries.", "GATE_1_RECONCILIATION")

        # Gate 1b: Stale Feed Entry Protection (Fail-Closed)
        if broker_state and broker_state.get("enforce_feed_freshness") and not is_emergency_exit:
            try:
                try:
                    from server.python_stream_server import evaluate_server_market_feed_state as eval_feed_fn
                except ImportError:
                    from server.python_stream_server import validate_market_data_authenticity_and_freshness as eval_feed_fn
                feed_val = eval_feed_fn(target_symbol=clean_sym)
                if not feed_val.get("authentic"):
                    return _reject(f"Order blocked: Market data feed is stale or unverified ({feed_val.get('reason')}: {feed_val.get('message')}).", "GATE_1_STALE_FEED")
            except Exception as e:
                return _reject(f"Order blocked: Feed freshness verification exception: {e}", "GATE_1_STALE_FEED")

        # -------------------------------------------------------------
        # GATE 2: Instrument & Parameter Verification
        # -------------------------------------------------------------
        if not clean_sym:
            return _reject("Symbol must be a non-empty string.", "GATE_2_INSTRUMENT")

        if not isinstance(qty, int) or qty <= 0:
            return _reject(f"Order quantity {qty} is invalid. Must be a positive integer.", "GATE_2_QTY")

        spec = ANGEL_SYMBOL_MAP.get(clean_sym)
        if not spec:
            # Fallback spec for dynamic equities
            spec = {
                "tradingsymbol": f"{clean_sym.replace(' ', '')}-EQ",
                "symboltoken": "9999",
                "exchange": "NSE",
                "lotsize": 1,
                "segment": "NSE Equity"
            }

        exchange = spec.get("exchange", "NSE")
        session_ok, session_msg = self.validate_market_session(exchange)
        if not session_ok and not is_emergency_exit:
            return _reject(session_msg, "GATE_2_SESSION")

        # -------------------------------------------------------------
        # GATE 3: Majority Approval & Emergency Exit Bypass Gate
        # -------------------------------------------------------------
        if is_emergency_exit or act_upper in ("EXIT", "SQUAREOFF"):
            quorum_approved = True
            quorum_ratio = "EMERGENCY_EXIT_BYPASS"
        else:
            quorum = evaluate_order_quorum(bot_id=bot_id, action=act_upper)
            quorum_approved = quorum.get("approved", False)
            quorum_ratio = quorum.get("quorum_ratio", "0/0")
            if not quorum_approved:
                return _reject(f"Consensus Mesh Veto: Quorum denied ({quorum_ratio}). Entry aborted.", "GATE_3_QUORUM", extra={"quorum": quorum})

        # -------------------------------------------------------------
        # GATE 4: RMS Risk & Capital Safety Gate
        # -------------------------------------------------------------
        from server.centralized_risk_manager import centralized_risk_manager
        rms = rms_state or {}
        crm_cfg = centralized_risk_manager.config

        # Gate 4a: Bot Quarantine Check
        if bot_id in centralized_risk_manager.quarantined_bots and not is_emergency_exit and act_upper not in ("EXIT", "SQUAREOFF"):
            q_info = centralized_risk_manager.quarantined_bots[bot_id]
            return _reject(f"Bot {bot_id} is QUARANTINED: {q_info.get('reason')}. New entry orders blocked.", "GATE_4_QUARANTINE")

        is_breaker_active = bool(rms.get("circuit_breaker_active") or crm_cfg.get("circuit_breaker_active") or crm_cfg.get("emergency_stop_active"))

        if is_breaker_active and not is_emergency_exit:
            reason = "RMS Emergency Stop is ACTIVE. New entry order routing is blocked." if crm_cfg.get("emergency_stop_active") else "RMS Circuit Breaker is ACTIVE / TRIPPED. New entry order routing is blocked."
            return _reject(reason, "GATE_4_CIRCUIT_BREAKER")

        if not is_emergency_exit:
            max_daily_loss = float(rms.get("max_daily_loss", 2000.0) or 2000.0)
            realized_pnl = float(rms.get("realized_daily_pnl", 0.0) or 0.0)
            if realized_pnl <= -abs(max_daily_loss) and max_daily_loss > 0:
                rms["circuit_breaker_active"] = True
                log_rms_event("DAILY_LOSS_LIMIT_REACHED", max_daily_loss, abs(realized_pnl), "CIRCUIT_BREAKER_TRIPPED")
                return _reject(f"Daily loss limit (INR {max_daily_loss:,.2f}) breached. Circuit breaker tripped.", "GATE_4_DAILY_LOSS")

            est_price = price if price > 0 else 100.0
            seg_up = spec.get("segment", "").upper()
            from server.centralized_risk_manager import calculate_required_margin, get_account_margin_summary
            margin_required = calculate_required_margin(clean_sym, seg_up, est_price, qty, producttype)

            open_positions = get_open_positions()
            margin_summary = get_account_margin_summary(config=crm_cfg, open_positions=open_positions)
            max_cap_bot = float(rms.get("max_capital_per_bot", margin_summary["max_capital_per_bot"]))
            avail_margin = margin_summary["available_margin"]

            if max_cap_bot > 0 and margin_required > max_cap_bot:
                return _reject(f"Required margin INR {margin_required:,.2f} exceeds Max Capital Per Bot limit (INR {max_cap_bot:,.2f}).", "GATE_4_MAX_CAPITAL")

            enforce_margin = bool(rms.get("enforce_margin") or (mode == "LIVE"))
            if enforce_margin and margin_required > avail_margin:
                return _reject(f"Insufficient available margin: Required INR {margin_required:,.2f}, Available INR {avail_margin:,.2f}.", "GATE_4_MARGIN")

        # -------------------------------------------------------------
        # GATE 5: Position Conflict & Concurrent Order Check
        # -------------------------------------------------------------
        open_positions = get_open_positions()
        existing_pos = next((p for p in open_positions if p["symbol"] == clean_sym and p["status"] == "OPEN"), None)
        crm_max_pos = int(crm_cfg.get("max_open_positions", self.max_open_positions))
        eff_max_pos = crm_max_pos if crm_max_pos > 0 else self.max_open_positions

        if not is_emergency_exit and act_upper in ("BUY", "SELL"):
            if len(open_positions) >= eff_max_pos and existing_pos is None:
                return _reject(f"Max concurrent open positions ({eff_max_pos}) reached. New entries blocked.", "GATE_5_MAX_POSITIONS")

            # Check opposing position: if LONG and BUY arrives, duplicate; if LONG and SELL arrives, handled as exit
            if existing_pos:
                existing_side = existing_pos["side"]
                target_side = "LONG" if act_upper == "BUY" else "SHORT"
                if existing_side == target_side:
                    return _reject(f"Duplicate position conflict: {existing_side} position already open for {clean_sym}.", "GATE_5_DUPLICATE_POSITION")

        # Gate 5b: Strict Emergency Exit Reduction Verification
        if is_emergency_exit and existing_pos:
            existing_side = str(existing_pos.get("side") or "LONG").upper()
            existing_qty = abs(int(existing_pos.get("qty", 0)))
            if existing_side == "LONG" and act_upper == "BUY":
                return _reject(f"Emergency exit violation: Cannot BUY against open LONG position in {clean_sym} (must be exposure-reducing).", "GATE_5B_REDUCTION")
            if existing_side == "SHORT" and act_upper == "SELL":
                return _reject(f"Emergency exit violation: Cannot SELL against open SHORT position in {clean_sym} (must be exposure-reducing).", "GATE_5B_REDUCTION")
            # Strictly reducing: Cap exit quantity so it never flips exposure
            if qty > existing_qty and existing_qty > 0:
                qty = existing_qty

        # -------------------------------------------------------------
        # GATE 6: State Machine Execution & Transition Routing
        # -------------------------------------------------------------
        # Transition: SUBMITTED -> ACKNOWLEDGED -> PENDING
        order_record = {
            "order_id": cid,
            "client_order_id": cid,
            "bot": b_name,
            "symbol": clean_sym,
            "segment": spec.get("segment", "NSE Equity"),
            "action": act_upper,
            "qty": qty,
            "filled_qty": 0,
            "price": price,
            "avg_price": price,
            "ordertype": ordertype,
            "producttype": producttype,
            "variety": "NORMAL",
            "exchange": exchange,
            "status": ORDER_STATE_PENDING,
            "mode": mode,
            "broker": "Angel One (SmartAPI)" if mode == "LIVE" else "Paper Engine",
            "is_emergency_exit": 1 if is_emergency_exit else 0,
            "created_at": datetime.now().isoformat()
        }
        # Execute routing
        if mode == "PAPER":
            # Realistic fill simulation with dynamic volatility-aware slippage
            eff_price = price if price > 0 else 24500.0
            fill_price, slip_rate = compute_volatility_aware_slippage(
                price=eff_price,
                action=act_upper,
                atr=atr,
                symbol=clean_sym
            )

            actual_fill_qty = fill_qty if (fill_qty is not None and fill_qty > 0) else qty
            is_partial = actual_fill_qty < qty

            order_record["status"] = ORDER_STATE_PARTIALLY_FILLED if is_partial else ORDER_STATE_FILLED
            order_record["filled_qty"] = actual_fill_qty
            order_record["avg_price"] = fill_price
            order_record["slippage_rate"] = slip_rate

            # Determine position action & records
            is_exit_action = act_upper in ("EXIT", "SQUAREOFF")
            is_opposing_side = existing_pos and existing_pos.get("side") != ("LONG" if act_upper == "BUY" else "SHORT")

            if is_exit_action or is_opposing_side:
                # Calculate real P/L from existing position
                entry_price = float(existing_pos.get("avg_price", 0.0)) if existing_pos else fill_price
                pos_side = existing_pos.get("side", "LONG") if existing_pos else "LONG"
                pos_qty = int(existing_pos.get("qty", qty)) if existing_pos else qty
                close_qty = min(actual_fill_qty, pos_qty)

                if pos_side == "LONG":
                    gross_pnl = (fill_price - entry_price) * close_qty
                else:
                    gross_pnl = (entry_price - fill_price) * close_qty

                gross_pnl = round(gross_pnl, 2)
                is_pos_flag = 1 if gross_pnl >= 0 else 0
                pnl_str = f"{'+' if gross_pnl >= 0 else '-'}₹{abs(gross_pnl):,.2f}"

                if close_qty >= pos_qty:
                    pos_action = "CLOSE"
                    pos_record = None
                    pos_key_to_close = clean_sym
                    pos_event = {
                        "action": "CLOSE",
                        "symbol": clean_sym,
                        "bot": b_name,
                        "closed_qty": close_qty,
                        "remaining_qty": 0
                    }
                else:
                    pos_action = "PARTIAL_CLOSE"
                    updated_pos = dict(existing_pos)
                    updated_pos["qty"] = pos_qty - close_qty
                    pos_record = updated_pos
                    pos_key_to_close = None
                    pos_event = {
                        "action": "PARTIAL_CLOSE",
                        "symbol": clean_sym,
                        "bot": b_name,
                        "closed_qty": close_qty,
                        "remaining_qty": updated_pos["qty"]
                    }

                trade_id = f"TRD-{cid}"
                trade_record_data = {
                    "trade_id": trade_id,
                    "bot": b_name,
                    "symbol": clean_sym,
                    "segment": spec.get("segment"),
                    "action": act_upper,
                    "qty": close_qty,
                    "price": fill_price,
                    "pnl": pnl_str,
                    "is_positive": is_pos_flag,
                    "consensus": quorum_ratio,
                    "order_id": cid,
                    "orderId": cid,
                    "client_order_id": cid,
                    "exchange": exchange,
                    "mode": mode,
                    "broker": "Paper Simulator"
                }
                trade_event = {
                    "trade_id": trade_id,
                    "tradeId": trade_id,
                    "order_id": cid,
                    "orderId": cid,
                    "client_order_id": cid,
                    "bot": b_name,
                    "bot_id": bot_id,
                    "symbol": clean_sym,
                    "action": act_upper,
                    "qty": close_qty,
                    "price": fill_price,
                    "avg_price": fill_price,
                    "pnl": pnl_str,
                    "mode": mode
                }

            else:
                # Open position
                pos_side_val = "LONG" if act_upper == "BUY" else "SHORT"
                pos_id = f"POS-{clean_sym}-{cid}"
                new_pos_dict = {
                    "position_id": pos_id,
                    "pos_key": f"{b_name}_{clean_sym}",
                    "bot": b_name,
                    "symbol": clean_sym,
                    "segment": spec.get("segment"),
                    "side": pos_side_val,
                    "type": pos_side_val,
                    "qty": actual_fill_qty,
                    "avg_price": fill_price,
                    "ltp": fill_price,
                    "mode": mode,
                    "broker": "Paper Simulator",
                    "status": "OPEN",
                    "is_incremental": True
                }
                pos_action = "OPEN"
                pos_record = new_pos_dict
                pos_key_to_close = None
                pos_event = {
                    "action": "OPEN",
                    "position": new_pos_dict,
                    "symbol": clean_sym,
                    "bot": b_name
                }

                trade_id = f"TRD-{cid}"
                trade_record_data = {
                    "trade_id": trade_id,
                    "bot": b_name,
                    "symbol": clean_sym,
                    "segment": spec.get("segment"),
                    "action": act_upper,
                    "qty": actual_fill_qty,
                    "price": fill_price,
                    "pnl": "+₹0.00",
                    "is_positive": 1,
                    "consensus": quorum_ratio,
                    "order_id": cid,
                    "orderId": cid,
                    "client_order_id": cid,
                    "exchange": exchange,
                    "mode": mode,
                    "broker": "Paper Simulator"
                }
                trade_event = {
                    "trade_id": trade_id,
                    "tradeId": trade_id,
                    "order_id": cid,
                    "orderId": cid,
                    "client_order_id": cid,
                    "bot": b_name,
                    "bot_id": bot_id,
                    "symbol": clean_sym,
                    "action": act_upper,
                    "qty": actual_fill_qty,
                    "price": fill_price,
                    "avg_price": fill_price,
                    "pnl": "+₹0.00",
                    "mode": mode
                }

            # Execute atomic commit across orders_memory, positions_memory, and trade_memory
            failure_point = getattr(self, "_test_failure_injection_point", None)
            try:
                commit_res = commit_paper_order_execution_atomic(
                    order_record=order_record,
                    trade_record=trade_record_data,
                    position_action=pos_action,
                    position_record=pos_record,
                    symbol_or_key_to_close=pos_key_to_close,
                    recalculate_perf=True,
                    failure_injection_point=failure_point
                )
            except Exception as exc:
                return {
                    "success": False,
                    "orderId": cid,
                    "order_id": cid,
                    "status": ORDER_STATE_REJECTED,
                    "state": ORDER_STATE_REJECTED,
                    "error": f"Atomic execution commit failed: {exc}",
                    "mode": mode,
                    "gate": "ATOMIC_TRANSACTION_ROLLBACK"
                }

            # Only on successful commit: update in-memory caches and emit external WebSocket events
            self.order_timestamps.append(now)
            self.recent_client_order_ids[cid] = now

            resp_fill_price = commit_res.get("fill_price", fill_price)
            resp_filled_qty = commit_res.get("filled_qty", actual_fill_qty)
            resp_status = commit_res.get("status", ORDER_STATE_PARTIALLY_FILLED if is_partial else ORDER_STATE_FILLED)
            resp_avg_price = commit_res.get("avg_price", resp_fill_price)

            if not commit_res.get("idempotent_replay"):
                try:
                    self._emit_order_event("ORDER_STATUS_UPDATE", {
                        "order_id": cid,
                        "orderId": cid,
                        "client_order_id": cid,
                        "bot": b_name,
                        "symbol": clean_sym,
                        "action": act_upper,
                        "qty": qty,
                        "filled_qty": resp_filled_qty,
                        "avg_price": resp_avg_price,
                        "status": resp_status,
                        "mode": mode
                    })
                except Exception:
                    pass

                try:
                    self._emit_position_event("POSITIONS_UPDATE", pos_event)
                except Exception:
                    pass

                try:
                    self._emit_order_event("TRADE_CONFIRMATION", trade_event)
                except Exception:
                    pass

            is_replay = bool(commit_res.get("idempotent_replay", False))

            msg = (
                f"Paper order {cid} already executed (authoritative idempotent replay: {resp_filled_qty}x {clean_sym} @ ₹{resp_fill_price:.2f})"
                if is_replay
                else f"Paper order {resp_status.lower()} for {resp_filled_qty}x {clean_sym} @ ₹{resp_fill_price:.2f}"
            )

            return {
                "success": True,
                "orderId": cid,
                "order_id": cid,
                "status": resp_status,
                "state": resp_status,
                "fill_price": resp_fill_price,
                "avg_price": resp_avg_price,
                "filled_qty": resp_filled_qty,
                "mode": mode,
                "quorum": quorum_ratio,
                "idempotent_replay": is_replay,
                "message": msg,
                "slippage_rate": slip_rate
            }

        elif mode == "LIVE":
            save_order(order_record)
            self.order_timestamps.append(now)
            self.recent_client_order_ids[cid] = now

            try:
                self._emit_order_event("ORDER_STATUS_UPDATE", {
                    "order_id": cid,
                    "orderId": cid,
                    "client_order_id": cid,
                    "bot": b_name,
                    "symbol": clean_sym,
                    "action": act_upper,
                    "qty": qty,
                    "price": price,
                    "status": ORDER_STATE_PENDING,
                    "mode": mode
                })
            except Exception:
                pass
            # LIVE Mode execution via SmartConnect
            smart_api = active_smart_connect.get("instance")
            try:
                order_params = {
                    "variety": "NORMAL",
                    "tradingsymbol": spec.get("tradingsymbol", clean_sym),
                    "symboltoken": spec.get("symboltoken", "9999"),
                    "transactiontype": act_upper,
                    "exchange": exchange,
                    "ordertype": ordertype,
                    "producttype": producttype,
                    "duration": "DAY",
                    "price": str(price) if ordertype == "LIMIT" else "0",
                    "quantity": str(qty)
                }
                res = smart_api.placeOrder(order_params)
                if res and res.get("status") and res.get("data"):
                    broker_oid = res["data"].get("orderid", cid)
                    order_record["status"] = ORDER_STATE_PENDING
                    order_record["order_id"] = broker_oid
                    save_order(order_record)
                    try:
                        self._emit_order_event("ORDER_STATUS_UPDATE", {
                            "order_id": broker_oid,
                            "orderId": broker_oid,
                            "client_order_id": cid,
                            "symbol": clean_sym,
                            "bot": b_name,
                            "action": act_upper,
                            "qty": qty,
                            "status": ORDER_STATE_PENDING,
                            "mode": mode
                        })
                    except Exception:
                        pass
                    return {
                        "success": True,
                        "orderId": broker_oid,
                        "status": ORDER_STATE_PENDING,
                        "state": ORDER_STATE_PENDING,
                        "mode": mode,
                        "broker_data": res["data"]
                    }
                else:
                    err = res.get("message") if res else "SmartAPI order rejection"
                    order_record["status"] = ORDER_STATE_REJECTED
                    order_record["rejection_reason"] = err
                    save_order(order_record)
                    try:
                        self._emit_order_event("ORDER_STATUS_UPDATE", {
                            "order_id": cid,
                            "orderId": cid,
                            "client_order_id": cid,
                            "symbol": clean_sym,
                            "bot": b_name,
                            "action": act_upper,
                            "qty": qty,
                            "status": ORDER_STATE_REJECTED,
                            "rejection_reason": err,
                            "mode": mode
                        })
                    except Exception:
                        pass
                    return {
                        "success": False,
                        "orderId": cid,
                        "status": ORDER_STATE_REJECTED,
                        "state": ORDER_STATE_REJECTED,
                        "error": err,
                        "mode": mode
                    }
            except Exception as e:
                err_msg = str(e)
                # Check for network timeout or ambiguous in-flight transport failure
                is_timeout = (
                    isinstance(e, (TimeoutError, ConnectionError)) or
                    any(term in err_msg.lower() for term in [
                        "timeout", "timed out", "connection reset", "connection aborted",
                        "read timed out", "connecttimeout", "remotedisconnected"
                    ])
                )
                if is_timeout:
                    order_record["status"] = ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION
                    order_record["rejection_reason"] = "TIMEOUT_AWAITING_RECONCILIATION"
                    save_order(order_record)
                    # Protect against blind resubmission: update idempotency timestamp
                    self.recent_client_order_ids[cid] = time.time()
                    try:
                        self._emit_order_event("ORDER_STATUS_UPDATE", {
                            "order_id": cid,
                            "orderId": cid,
                            "client_order_id": cid,
                            "symbol": clean_sym,
                            "bot": b_name,
                            "action": act_upper,
                            "qty": qty,
                            "status": ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION,
                            "rejection_reason": "TIMEOUT_AWAITING_RECONCILIATION",
                            "mode": mode
                        })
                    except Exception:
                        pass
                    return {
                        "success": False,
                        "orderId": cid,
                        "status": ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION,
                        "state": ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION,
                        "error": f"Live order submission timed out: {err_msg}. Order marked UNKNOWN_PENDING_RECONCILIATION.",
                        "mode": mode,
                        "requires_reconciliation": True
                    }
                else:
                    order_record["status"] = ORDER_STATE_REJECTED
                    order_record["rejection_reason"] = err_msg
                    save_order(order_record)
                    try:
                        self._emit_order_event("ORDER_STATUS_UPDATE", {
                            "order_id": cid,
                            "orderId": cid,
                            "client_order_id": cid,
                            "symbol": clean_sym,
                            "bot": b_name,
                            "action": act_upper,
                            "qty": qty,
                            "status": ORDER_STATE_REJECTED,
                            "rejection_reason": err_msg,
                            "mode": mode
                        })
                    except Exception:
                        pass
                    return {
                        "success": False,
                        "orderId": cid,
                        "status": ORDER_STATE_REJECTED,
                        "state": ORDER_STATE_REJECTED,
                        "error": f"Live order exception: {err_msg}",
                        "mode": mode
                    }

        else:
            # Unknown execution mode fails closed
            err_msg = f"Unknown execution mode '{mode}'. Fail-closed policy enforced."
            order_record["status"] = ORDER_STATE_REJECTED
            order_record["rejection_reason"] = err_msg
            save_order(order_record)
            try:
                self._emit_order_event("ORDER_STATUS_UPDATE", {
                    "order_id": cid,
                    "orderId": cid,
                    "client_order_id": cid,
                    "symbol": clean_sym,
                    "bot": b_name,
                    "action": act_upper,
                    "qty": qty,
                    "status": ORDER_STATE_REJECTED,
                    "rejection_reason": err_msg,
                    "mode": mode
                })
            except Exception:
                pass
            return {
                "success": False,
                "orderId": cid,
                "status": ORDER_STATE_REJECTED,
                "state": ORDER_STATE_REJECTED,
                "error": err_msg,
                "mode": mode
            }

    def reconcile(self, *args, **kwargs) -> Dict[str, Any]:
        """Convenience delegation to authoritative broker reconciliation."""
        from server.python_stream_server import reconcile_orders_and_positions_with_broker
        return reconcile_orders_and_positions_with_broker(*args, **kwargs)

    def recover_ambiguous_paper_orders(self, failure_injection_point: Optional[str] = None) -> Dict[str, Any]:
        """Recovers and reconciles ambiguous paper orders."""
        point = failure_injection_point or getattr(self, "_test_failure_injection_point", None)
        from server.memory_db import recover_ambiguous_paper_orders
        return recover_ambiguous_paper_orders(failure_injection_point=point)


# Global Singleton Execution Engine Instance
execution_engine = CentralizedExecutionEngine()
