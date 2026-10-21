"""
CHINTU AI TRADING SYSTEM - Autonomous Bot Scheduler & Worker Architecture (Phase 5)
Server-side background worker lifecycle manager for all 14 canonical bots.
Runs independently of browser/client WebSockets in strictly PAPER mode.
Enforces:
- Feed authenticity (rejects synthetic / unauthenticated ticks)
- Candle history buffer maintenance per bot instrument
- Strategy readiness and deterministic evaluation
- Duplicate signal suppression per bar
- Risk checks and safe paper order execution
- Separate statuses: registered, worker_running, data_healthy, strategy_ready, paper_execution_verified
"""

import time
import threading
import logging
from typing import Dict, Any, List, Optional, Union
from datetime import datetime, timedelta
import math
from collections import deque
import copy

from server.bot_registry import CANONICAL_BOT_REGISTRY, get_bot_by_id, get_all_canonical_bots
from server.strategy_engine import evaluate_strategy
from server import memory_db
from server.market_data_backfill import (
    HistoricalCandleBackfillAdapter,
    BackfillConfig,
    BackfillResult,
    IST
)

try:
    from server.angel_feed_manager import InstrumentAuditor
except ImportError:
    InstrumentAuditor = None

logger = logging.getLogger("BotScheduler")
MAX_CANDLE_BUFFER = 200
TICK_FRESHNESS_TIMEOUT_SECONDS = 15.0


class CandleBuffer(list):
    """
    Bounded, high-performance circular buffer for OHLCV candles backed by collections.deque.
    Inherits from list to preserve 100% compatibility with sequence operations, isinstance(cb, list),
    JSON serialization, slicing, and external consumers while achieving O(1) constant-time appends
    and oldest-element eviction.
    """
    def __init__(self, iterable=None, maxlen: int = MAX_CANDLE_BUFFER):
        super().__init__()
        self.maxlen = int(maxlen) if maxlen is not None else MAX_CANDLE_BUFFER
        self._deque: deque = deque(iterable or [], maxlen=self.maxlen)

    def append(self, item: Any) -> None:
        """Appends item in O(1) time. Evicts oldest item automatically if maxlen is reached."""
        self._deque.append(item)

    def extend(self, iterable) -> None:
        """Extends buffer in O(K) time, retaining up to maxlen most recent items."""
        self._deque.extend(iterable)

    def pop(self, index: int = -1) -> Any:
        """
        Pops item at index.
        index=0 executes O(1) popleft().
        index=-1 executes O(1) pop().
        """
        if index == 0:
            return self._deque.popleft()
        elif index == -1 or index == len(self._deque) - 1:
            return self._deque.pop()
        else:
            val = self._deque[index]
            del self._deque[index]
            return val

    def popleft(self) -> Any:
        """Direct O(1) eviction of the oldest candle."""
        return self._deque.popleft()

    def clear(self) -> None:
        self._deque.clear()

    def __len__(self) -> int:
        return len(self._deque)

    def __iter__(self):
        return iter(self._deque)

    def __getitem__(self, index):
        if isinstance(index, slice):
            return list(self._deque)[index]
        return self._deque[index]

    def __setitem__(self, index, value):
        self._deque[index] = value

    def __delitem__(self, index):
        del self._deque[index]

    def __bool__(self) -> bool:
        return bool(self._deque)

    def __contains__(self, item) -> bool:
        return item in self._deque

    def __repr__(self) -> str:
        return f"CandleBuffer({list(self._deque)}, maxlen={self.maxlen})"

    def __eq__(self, other) -> bool:
        if isinstance(other, CandleBuffer):
            return list(self._deque) == list(other._deque)
        if isinstance(other, (list, deque)):
            return list(self._deque) == list(other)
        return False

    def copy(self) -> 'CandleBuffer':
        return CandleBuffer(self._deque, maxlen=self.maxlen)

    def __copy__(self) -> 'CandleBuffer':
        return CandleBuffer(self._deque, maxlen=self.maxlen)

    def __deepcopy__(self, memo) -> 'CandleBuffer':
        return CandleBuffer(copy.deepcopy(list(self._deque), memo), maxlen=self.maxlen)

    def to_list(self) -> List[Any]:
        return list(self._deque)


class BotWorker:
    """
    Dedicated background worker state machine for an individual trading bot.
    Maintains candle buffer, signal deduplication, and execution state.
    """

    def __init__(self, bot_id: int, config: Optional[Dict[str, Any]] = None):
        self.bot_id = bot_id
        self.config = config if config is not None else CANONICAL_BOT_REGISTRY.get(bot_id, {})
        self.lock = threading.Lock()

        # Lifecycle & Health Indicators
        self.registered = True
        self.worker_running = False
        self.data_healthy = False
        self.strategy_ready = False
        self.paper_execution_verified = False

        # Candle & Market Data State (Bounded circular buffer, maxlen=200)
        self._candles: CandleBuffer = CandleBuffer(maxlen=MAX_CANDLE_BUFFER)
        self.last_tick_time: Optional[float] = None
        self.last_tick_price: Optional[float] = None

        # Signal & Deduplication State
        self.last_bar_timestamp: Optional[str] = None
        self.last_decision: Optional[str] = None
        self.last_signal: Optional[Dict[str, Any]] = None
        self.last_evaluation_time: Optional[str] = None

        # Position Tracking
        self.current_position: Optional[str] = None

        # Backfill Lifecycle & Diagnostic State
        self.backfill_status: str = "NOT_STARTED"
        self.backfill_diagnostic: Optional[str] = None
        self.backfill_last_attempt: Optional[str] = None
        self.backfill_last_success: Optional[str] = None

        # Metrics
        self.total_signals_generated = 0
        self.total_orders_executed = 0
        self.errors_count = 0

    @property
    def candles(self) -> CandleBuffer:
        return self._candles

    @candles.setter
    def candles(self, val):
        if isinstance(val, CandleBuffer):
            self._candles = val
        else:
            self._candles = CandleBuffer(val or [], maxlen=MAX_CANDLE_BUFFER)

    def ingest_candle(self, candle: Dict[str, Any], is_authentic: bool = True, is_replay: bool = False) -> bool:
        """
        Ingests a verified OHLCV bar into the worker's buffer.
        Rejects synthetic or unauthentic bars.
        """
        # Reject synthetic or fake market data
        if not is_authentic or candle.get("is_synthetic") or candle.get("synthetic"):
            with self.lock:
                self.data_healthy = False
            logger.warning(f"Bot #{self.bot_id} rejected unauthentic or synthetic candle.")
            return False

        # Validate required candle schema
        for f in ["timestamp", "open", "high", "low", "close"]:
            if f not in candle:
                logger.warning(f"Bot #{self.bot_id} candle missing required field '{f}'.")
                return False

        try:
            o = float(candle["open"])
            h = float(candle["high"])
            l = float(candle["low"])
            c = float(candle["close"])
            v = float(candle.get("volume", 1.0))
            if o <= 0 or h <= 0 or l <= 0 or c <= 0 or l > h:
                return False
        except (ValueError, TypeError):
            return False

        clean_candle = {
            "timestamp": str(candle["timestamp"]),
            "open": o,
            "high": h,
            "low": l,
            "close": c,
            "volume": v
        }

        with self.lock:
            # Check if this candle updates the latest bar or is a new bar
            if self.candles and self.candles[-1]["timestamp"] == clean_candle["timestamp"]:
                self.candles[-1] = clean_candle
            else:
                self.candles.append(clean_candle)

            if is_replay:
                try:
                    clean_ts = str(clean_candle["timestamp"]).replace("T", " ")
                    if "." in clean_ts:
                        clean_ts = clean_ts.split(".")[0]
                    c_dt = datetime.strptime(clean_ts, "%Y-%m-%d %H:%M:%S")
                    self.last_tick_time = c_dt.timestamp()
                except Exception:
                    self.last_tick_time = time.time()
            else:
                self.last_tick_time = time.time()
            self.last_tick_price = c
            self.data_healthy = True

            # Update strategy readiness
            if self.config.get("data_readiness") == "DATA_UNAVAILABLE":
                self.strategy_ready = False
            else:
                min_req = self.config.get("min_candles_required", 30)
                self.strategy_ready = len(self.candles) >= min_req

        return True

    def ingest_tick(self, price: float, volume: float = 1.0, is_authentic: bool = True, timestamp: Optional[str] = None, is_replay: bool = False) -> bool:
        """
        Ingests a verified market tick and updates or creates the active candle bar.
        Enforces:
        - Authenticity (rejects synthetic / unauthenticated ticks)
        - Price > 0 and volume >= 0
        - Freshness: rejects ticks older than TICK_FRESHNESS_TIMEOUT_SECONDS (15s) or from future (>5s)
        - Monotonic ordering: rejects out-of-order ticks
        - Timeframe boundary bucketing ("1m", "3m", "5m", "15m")
        """
        if not is_authentic:
            with self.lock:
                self.data_healthy = False
            return False

        try:
            p = float(price)
            v = float(volume)
            if p <= 0 or math.isnan(p) or math.isinf(p) or v < 0 or math.isnan(v):
                return False
        except (ValueError, TypeError):
            return False

        now_epoch = time.time()
        
        # Parse timestamp if supplied
        if timestamp:
            try:
                clean_ts = str(timestamp).replace("T", " ")
                if "." in clean_ts:
                    clean_ts = clean_ts.split(".")[0]
                dt = datetime.strptime(clean_ts, "%Y-%m-%d %H:%M:%S")
                tick_epoch = dt.timestamp()
            except Exception:
                try:
                    tick_epoch = float(timestamp)
                    dt = datetime.fromtimestamp(tick_epoch)
                except Exception:
                    dt = datetime.now()
                    tick_epoch = now_epoch
        else:
            dt = datetime.now()
            tick_epoch = now_epoch

        # Freshness and boundary validation
        if not is_replay and tick_epoch > now_epoch + 5.0:
            return False
        if not is_replay and (now_epoch - tick_epoch) > TICK_FRESHNESS_TIMEOUT_SECONDS:
            with self.lock:
                self.data_healthy = False
            return False

        with self.lock:
            # Monotonicity check
            if self.last_tick_time and tick_epoch < self.last_tick_time:
                return False

            # Timeframe boundary bucketing
            tf_str = str(self.config.get("timeframe", "1m")).lower()
            mins = 1
            if tf_str.endswith("m"):
                try:
                    mins = int(tf_str[:-1])
                except Exception:
                    mins = 1
            elif tf_str.endswith("h"):
                try:
                    mins = int(tf_str[:-1]) * 60
                except Exception:
                    mins = 60

            bucket_min = dt.minute - (dt.minute % mins) if mins > 0 else dt.minute
            bucket_str = dt.strftime(f"%Y-%m-%d %H:{bucket_min:02d}:00")

            if self.candles and self.candles[-1]["timestamp"] == bucket_str:
                cur = self.candles[-1]
                cur["high"] = max(cur["high"], p)
                cur["low"] = min(cur["low"], p)
                cur["close"] = p
                cur["volume"] += v
                self.last_tick_time = tick_epoch
                self.last_tick_price = p
                self.data_healthy = True
                return True

        candle_payload = {
            "timestamp": bucket_str,
            "open": p,
            "high": p,
            "low": p,
            "close": p,
            "volume": v
        }
        res = self.ingest_candle(candle_payload, is_authentic=True, is_replay=is_replay)

        if res:
            with self.lock:
                self.last_tick_time = tick_epoch
                self.last_tick_price = p
        return res



    def reconcile_candles(self, new_candles: List[Dict[str, Any]], is_historical: bool = True) -> int:
        """
        Reconciles incoming candles with existing candle buffer deterministically:
        - Normalizes timestamps to string format.
        - Resolves collisions: authoritative finalized incoming candle updates/replaces matching timestamp.
        - Maintains strict chronological ascending order.
        - Evicts oldest items if length exceeds maxlen (200).
        - Returns count of newly added unique candles.
        """
        if not new_candles:
            return 0

        added_or_updated = 0
        with self.lock:
            # Map existing candles by timestamp
            existing_map: Dict[str, Dict[str, Any]] = {c["timestamp"]: c for c in self.candles}

            for c in new_candles:
                if not isinstance(c, dict):
                    continue
                if not all(k in c for k in ("timestamp", "open", "high", "low", "close")):
                    continue
                try:
                    o = float(c["open"])
                    h = float(c["high"])
                    l = float(c["low"])
                    cl = float(c["close"])
                    v = float(c.get("volume", 0.0))
                    if o <= 0 or h <= 0 or l <= 0 or cl <= 0 or l > h:
                        continue
                except (ValueError, TypeError):
                    continue

                ts_key = str(c["timestamp"])
                clean_candle = {
                    "timestamp": ts_key,
                    "open": round(o, 2),
                    "high": round(h, 2),
                    "low": round(l, 2),
                    "close": round(cl, 2),
                    "volume": round(v, 2)
                }

                # Authoritative finalized candle replaces matching timestamp
                existing_map[ts_key] = clean_candle
                added_or_updated += 1

            # Chronological ascending sort
            def _parse_ts(ts: str) -> float:
                try:
                    if "T" in ts:
                        return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
                    return datetime.strptime(ts, "%Y-%m-%d %H:%M:%S").timestamp()
                except Exception:
                    try:
                        return float(ts)
                    except Exception:
                        return 0.0

            sorted_candles = sorted(existing_map.values(), key=lambda x: _parse_ts(x["timestamp"]))

            # Bounded to MAX_CANDLE_BUFFER
            if len(sorted_candles) > MAX_CANDLE_BUFFER:
                sorted_candles = sorted_candles[-MAX_CANDLE_BUFFER:]

            self.candles = CandleBuffer(sorted_candles, maxlen=MAX_CANDLE_BUFFER)

            # Update health and readiness
            if self.candles:
                latest_candle = self.candles[-1]
                latest_epoch = _parse_ts(latest_candle["timestamp"])
                if latest_epoch > 0:
                    self.last_tick_time = latest_epoch
                else:
                    self.last_tick_time = time.time()
                self.last_tick_price = latest_candle["close"]
                self.data_healthy = True

            min_req = self.config.get("min_candles_required", 30)
            if self.config.get("data_readiness") == "DATA_UNAVAILABLE":
                self.strategy_ready = False
            else:
                self.strategy_ready = len(self.candles) >= min_req

        return added_or_updated

    def backfill_history(
        self,
        adapter: Optional[HistoricalCandleBackfillAdapter] = None,
        from_date: Optional[Union[datetime, str]] = None,
        to_date: Optional[Union[datetime, str]] = None,
        client: Optional[Any] = None
    ) -> BackfillResult:
        """
        Executes bounded, rate-limited historical candle backfill for this bot's instrument.
        Validates instrument eligibility, reconciles returned candles with buffer,
        and establishes fail-closed strategy readiness.
        """
        now_ist = datetime.now(IST)
        now_iso = now_ist.isoformat()
        self.backfill_last_attempt = now_iso

        # 1. Check if strategy requires unavailable data
        if self.config.get("data_readiness") == "DATA_UNAVAILABLE":
            self.backfill_status = "SKIPPED"
            self.backfill_diagnostic = f"Strategy data dependency ({self.config.get('required_data')}) is unavailable."
            with self.lock:
                self.strategy_ready = False
            return BackfillResult(
                success=True,
                status="SKIPPED",
                candles=[],
                candle_count=0,
                rejected_count=0,
                rejected_records=[],
                is_complete=False,
                expected_candle_count=0,
                exchange=self.config.get("exchange", "NSE"),
                symbol_token=str(self.config.get("symboltoken", "")),
                interval=self.config.get("timeframe", "1m"),
                from_date=str(from_date or now_iso),
                to_date=str(to_date or now_iso),
                error=self.backfill_diagnostic
            )

        # 2. Check instrument validity and contract expiration
        tradingsymbol = self.config.get("tradingsymbol", "")
        token = str(self.config.get("symboltoken", ""))
        exchange = self.config.get("exchange", "NSE")
        asset_name = self.config.get("asset", "")

        if InstrumentAuditor is not None:
            audit = InstrumentAuditor.audit_instrument(
                symbol_name=asset_name,
                tradingsymbol=tradingsymbol,
                token=token,
                exchange=exchange
            )
            if not audit.get("is_valid", True) or audit.get("is_expired", False):
                reason = audit.get("reason", "Instrument is invalid or expired.")
                self.backfill_status = "EXPIRED_INSTRUMENT"
                self.backfill_diagnostic = reason
                with self.lock:
                    self.strategy_ready = False
                    self.data_healthy = False
                return BackfillResult(
                    success=False,
                    status="EXPIRED_INSTRUMENT",
                    candles=[],
                    candle_count=0,
                    rejected_count=0,
                    rejected_records=[],
                    is_complete=False,
                    expected_candle_count=0,
                    exchange=exchange,
                    symbol_token=token,
                    interval=self.config.get("timeframe", "1m"),
                    from_date=str(from_date or now_iso),
                    to_date=str(to_date or now_iso),
                    error=reason
                )

        # 3. Determine timeframe and target count
        min_req = self.config.get("min_candles_required", 30)
        timeframe = self.config.get("timeframe", "1m")
        target_count = min(max(min_req, 30), MAX_CANDLE_BUFFER)

        # 4. Determine date boundaries if not provided
        if not to_date:
            to_dt = now_ist
            to_date_str = to_dt.strftime("%Y-%m-%d %H:%M")
        else:
            to_date_str = to_date.strftime("%Y-%m-%d %H:%M") if isinstance(to_date, datetime) else str(to_date)
            to_dt = now_ist

        if not from_date:
            tf_mins = 1
            tf_clean = str(timeframe).lower()
            if tf_clean.endswith("m"):
                try:
                    tf_mins = int(tf_clean[:-1])
                except Exception:
                    tf_mins = 1
            elif tf_clean.endswith("h"):
                try:
                    tf_mins = int(tf_clean[:-1]) * 60
                except Exception:
                    tf_mins = 60

            mins_needed = tf_mins * target_count
            days_needed = math.ceil(mins_needed / 375.0) + 3
            from_dt = to_dt - timedelta(days=days_needed)
            from_date_str = from_dt.strftime("%Y-%m-%d %H:%M")
        else:
            from_date_str = from_date.strftime("%Y-%m-%d %H:%M") if isinstance(from_date, datetime) else str(from_date)

        # 5. Execute backfill using adapter
        active_adapter = adapter or HistoricalCandleBackfillAdapter()
        if client is not None:
            active_adapter.set_client(client)

        result = active_adapter.fetch_historical_candles(
            exchange=exchange,
            symbol_token=token,
            interval=timeframe,
            from_date=from_date_str,
            to_date=to_date_str,
            expected_count=target_count
        )

        # 6. Reconcile and establish fail-closed readiness
        if result.success and result.candles:
            self.reconcile_candles(result.candles, is_historical=True)
            with self.lock:
                current_count = len(self.candles)
                if current_count >= min_req:
                    self.backfill_status = "COMPLETED"
                    self.backfill_diagnostic = f"Successfully loaded {result.candle_count} historical candles. Buffer: {current_count}/{min_req}."
                    self.backfill_last_success = datetime.now(IST).isoformat()
                    self.strategy_ready = True
                else:
                    self.backfill_status = "INSUFFICIENT_DATA"
                    self.backfill_diagnostic = f"Insufficient history: buffer has {current_count}/{min_req} required bars."
                    self.strategy_ready = False
        else:
            self.backfill_status = result.status if result.status != "COMPLETED" else "FAILED"
            self.backfill_diagnostic = result.error or "Failed to backfill historical candles."
            with self.lock:
                min_req = self.config.get("min_candles_required", 30)
                if len(self.candles) < min_req:
                    self.strategy_ready = False

        return result

    def check_health(self, is_replay: bool = False) -> bool:
        """Checks if market data is recent and authentic."""
        with self.lock:
            if not self.last_tick_time:
                self.data_healthy = False
                return False
            if is_replay:
                self.data_healthy = True
                return True
            is_fresh = (time.time() - self.last_tick_time) <= TICK_FRESHNESS_TIMEOUT_SECONDS
            self.data_healthy = is_fresh
            return is_fresh

    def evaluate(self, execute_paper: bool = True) -> Dict[str, Any]:
        """
        Evaluates strategy rules deterministically.
        Suppresses duplicate signals on the same bar.
        Executes paper trades if signal is BUY/SELL.
        """
        with self.lock:
            self.last_evaluation_time = datetime.now().isoformat()

            # 1. Advanced strategies requiring unavailable data dependencies
            if self.config.get("data_readiness") == "DATA_UNAVAILABLE":
                return {
                    "bot_id": self.bot_id,
                    "bot_name": self.config.get("name"),
                    "decision": "NO_TRADE",
                    "reason": f"Strategy data dependency ({self.config.get('required_data')}) is currently unavailable.",
                    "status": "DATA_UNAVAILABLE"
                }

            # 1b. Expired or invalid instrument gate
            if getattr(self, "backfill_status", None) == "EXPIRED_INSTRUMENT":
                return {
                    "bot_id": self.bot_id,
                    "bot_name": self.config.get("name"),
                    "decision": "NO_TRADE",
                    "reason": self.backfill_diagnostic or "Instrument is invalid or expired.",
                    "status": "EXPIRED_INSTRUMENT"
                }

            # 2. Check data health
            if not self.data_healthy and len(self.candles) == 0:
                return {
                    "bot_id": self.bot_id,
                    "bot_name": self.config.get("name"),
                    "decision": "NO_TRADE",
                    "reason": "Market data unhealthy, stale, or synthetic.",
                    "status": "DATA_UNHEALTHY"
                }

            # 3. Check candle buffer size
            min_req = self.config.get("min_candles_required", 30)
            if len(self.candles) < min_req:
                return {
                    "bot_id": self.bot_id,
                    "bot_name": self.config.get("name"),
                    "decision": "NO_TRADE",
                    "reason": f"Insufficient candle buffer: {len(self.candles)}/{min_req} bars.",
                    "status": "INSUFFICIENT_DATA"
                }

            # Clone candle buffer under lock
            candles_copy = list(self.candles)
            active_pos = self.current_position

        # 4. Evaluate strategy mathematically
        result = evaluate_strategy(self.bot_id, {"candles": candles_copy, "position_side": active_pos})
        decision = result.get("decision", "HOLD")

        # 5. Duplicate signal suppression
        current_bar_ts = candles_copy[-1]["timestamp"] if candles_copy else None

        if decision in ["BUY", "SELL", "EXIT"]:
            # Stale-feed entry gating (2.0s threshold) and unfilled entry cancellation
            if decision in ["BUY", "SELL"] and self.last_tick_time is not None:
                feed_age = time.time() - self.last_tick_time
                if feed_age > 2.0 and not getattr(self, "is_replay", False):
                    # Cancel any unfilled entry orders for this asset
                    try:
                        memory_db.cancel_unfilled_entry_orders(symbol=self.config.get("asset"), reason="CANCELLED_STALE_FEED")
                    except Exception:
                        pass
                    return {
                        "bot_id": self.bot_id,
                        "bot_name": self.config.get("name"),
                        "decision": "NO_TRADE",
                        "reason": f"Market feed is stale ({feed_age:.1f}s > 2.0s threshold). New entry blocked.",
                        "status": "STALE_FEED"
                    }

            if self.last_bar_timestamp == current_bar_ts and self.last_decision == decision:
                return {
                    "bot_id": self.bot_id,
                    "bot_name": self.config.get("name"),
                    "decision": "NO_TRADE",
                    "reason": f"Duplicate signal suppressed: already triggered {decision} on bar {current_bar_ts}.",
                    "status": "DUPLICATE_SUPPRESSED",
                    "indicators": result.get("indicators", {}),
                    "confidence": result.get("confidence", 0.0)
                }

            # Update deduplication state
            with self.lock:
                self.last_bar_timestamp = current_bar_ts
                self.last_decision = decision
                self.last_signal = result
                self.total_signals_generated += 1

            # 6. Execute paper trade if requested
            if execute_paper:
                exec_result = self._execute_paper_order(result, current_bar_ts)
                result["paper_execution"] = exec_result

        else:
            with self.lock:
                self.last_decision = decision
                self.last_signal = result

        return result

    def _execute_paper_order(self, signal: Dict[str, Any], bar_timestamp: Optional[str]) -> Dict[str, Any]:
        """
        Executes paper trade strictly through durable persistence.
        Writes to orders_memory, trade_memory, and positions_memory.
        """
        bot_name = self.config.get("name", f"Bot {self.bot_id}")
        asset = self.config.get("asset", "NIFTY 50")
        segment = self.config.get("segment", "NSE Equity")
        action = signal.get("decision", "BUY")
        entry_price = float(signal.get("entry_price") or self.last_tick_price or 100.0)
        lotsize = int(self.config.get("lotsize", 1))

        # Risk check: capital allocation
        risk_cfg = self.config.get("risk_config", {})
        max_capital = risk_cfg.get("max_capital", 35000.0)
        order_value = entry_price * lotsize

        if order_value > max_capital and max_capital > 0:
            # Adjust lotsize to fit max_capital safely
            adjusted_qty = max(1, int(max_capital / entry_price))
            lotsize = adjusted_qty

        from server.execution_engine import execution_engine
        cid = signal.get("client_order_id") or signal.get("clientOrderId") or execution_engine.generate_idempotent_order_id(self.bot_id, asset, action, entry_price)
        order_id = cid
        trade_id = f"TRD_PAPER_{int(time.time() * 1000)}_{self.bot_id}"
        now_ts = datetime.now().isoformat()

        # Gate 0 Idempotency Check: Reject immediate duplicate orders before RMS
        now_sec = time.time()
        if cid in execution_engine.recent_client_order_ids:
            last_ts = execution_engine.recent_client_order_ids[cid]
            if (now_sec - last_ts) < execution_engine.idempotency_window_seconds:
                err_msg = f"Duplicate order detected with clientOrderId '{cid}' within {execution_engine.idempotency_window_seconds}s."
                logger.warning(f"[Gate 0 Reject] Bot {self.bot_id} paper order rejected: {err_msg}")
                return {
                    "success": False,
                    "order_id": order_id,
                    "status": "REJECTED",
                    "error": err_msg
                }

        # Authoritative RMS Pre-Trade Risk Gate
        from server.centralized_risk_manager import centralized_risk_manager
        is_exit = action in ("EXIT", "SQUAREOFF")
        stop_loss_val = None
        if signal.get("stop_loss") is not None:
            try:
                stop_loss_val = float(signal.get("stop_loss"))
            except (ValueError, TypeError):
                stop_loss_val = None

        is_replay_mode = getattr(self, "is_replay", False)
        feed_age_now = 0.0 if is_replay_mode else ((time.time() - self.last_tick_time) if self.last_tick_time else 0.0)
        approved, reject_reason, risk_telem = centralized_risk_manager.validate_order_risk(
            bot_id=self.bot_id,
            symbol=asset,
            action=action,
            qty=lotsize,
            price=entry_price,
            stop_loss=stop_loss_val,
            segment=segment,
            execution_mode="PAPER",
            broker_connected=True,
            feed_age_seconds=feed_age_now,
            is_emergency_exit=is_exit
        )

        if not approved:
            logger.warning(f"[RMS Reject] Bot {self.bot_id} paper order rejected: {reject_reason}")
            try:
                memory_db.save_order({
                    "orderId": order_id,
                    "clientOrderId": order_id,
                    "bot": bot_name,
                    "symbol": asset,
                    "segment": segment,
                    "action": action,
                    "qty": lotsize,
                    "filled_qty": 0,
                    "price": entry_price,
                    "avg_price": 0.0,
                    "ordertype": "MARKET",
                    "producttype": "INTRADAY",
                    "variety": "NORMAL",
                    "exchange": self.config.get("exchange", "NSE"),
                    "status": "REJECTED",
                    "rejection_reason": reject_reason,
                    "is_emergency_exit": 1 if is_exit else 0,
                    "mode": "PAPER",
                    "timestamp": now_ts,
                    "created_at": now_ts,
                    "bar_timestamp": bar_timestamp,
                    "risk_telemetry": risk_telem
                })
            except Exception as e:
                logger.error(f"Failed to persist rejected paper order: {e}")
            return {
                "success": False,
                "order_id": order_id,
                "status": "REJECTED",
                "error": reject_reason,
                "risk_telemetry": risk_telem
            }

        # Route strictly through CentralizedExecutionEngine single-gateway
        exec_res = execution_engine.execute_order(
            bot_id=self.bot_id,
            symbol=asset,
            action=action,
            qty=lotsize,
            price=entry_price,
            bot_name=bot_name,
            producttype="INTRADAY",
            ordertype="MARKET",
            is_emergency_exit=is_exit,
            execution_mode="PAPER",
            client_order_id=cid
        )

        if not exec_res.get("success"):
            logger.warning(f"[ExecutionEngine Reject] Bot {self.bot_id} paper order rejected: {exec_res.get('error')}")
            return {
                "success": False,
                "order_id": exec_res.get("orderId") or order_id,
                "status": "REJECTED",
                "error": exec_res.get("error"),
                "risk_telemetry": risk_telem,
                "execution_engine_result": exec_res
            }

        with self.lock:
            self.paper_execution_verified = True
            self.total_orders_executed += 1
            if action == "BUY":
                self.current_position = "LONG"
            elif action == "SELL":
                self.current_position = "SHORT"
            elif action == "EXIT":
                self.current_position = None

        return {
            "success": True,
            "order_id": exec_res.get("orderId") or order_id,
            "trade_id": exec_res.get("tradeId", trade_id),
            "action": action,
            "qty": lotsize,
            "price": exec_res.get("avg_price", entry_price),
            "mode": "PAPER",
            "bot_id": self.bot_id,
            "status": "COMPLETE",
            "execution_engine_result": exec_res
        }

    def get_status(self) -> Dict[str, Any]:
        """Returns comprehensive status dictionary for this bot worker."""
        with self.lock:
            bot_health = "HEALTHY" if self.worker_running else "STOPPED"
            if self.config.get("data_readiness") == "DATA_UNAVAILABLE":
                data_health = "DATA_UNAVAILABLE"
                strategy_health = "DATA_UNAVAILABLE"
            else:
                data_health = "HEALTHY" if self.data_healthy else "STALE_OR_MISSING"
                strategy_health = "READY" if self.strategy_ready else "WARMING_UP"

            execution_status = "ACTIVE_PAPER" if (self.paper_execution_verified or self.worker_running) else "IDLE"

            return {
                "bot_id": self.bot_id,
                "bot_name": self.config.get("name"),
                "asset": self.config.get("asset"),
                "strategy_id": self.config.get("strategy_id"),
                "strategy_name": self.config.get("strategy_name"),
                "registered": self.registered,
                "worker_running": self.worker_running,
                "data_healthy": self.data_healthy,
                "strategy_ready": self.strategy_ready,
                "paper_execution_verified": self.paper_execution_verified,
                "bot_health": bot_health,
                "data_health": data_health,
                "strategy_health": strategy_health,
                "execution_status": execution_status,
                "current_position": self.current_position,
                "candle_count": len(self.candles),
                "min_candles_required": self.config.get("min_candles_required", 30),
                "data_readiness": self.config.get("data_readiness", "READY"),
                "backfill_status": getattr(self, "backfill_status", "NOT_STARTED"),
                "backfill_diagnostic": getattr(self, "backfill_diagnostic", None),
                "backfill_last_attempt": getattr(self, "backfill_last_attempt", None),
                "backfill_last_success": getattr(self, "backfill_last_success", None),
                "last_decision": self.last_decision,
                "last_bar_timestamp": self.last_bar_timestamp,
                "last_evaluation_time": self.last_evaluation_time,
                "total_signals_generated": self.total_signals_generated,
                "total_orders_executed": self.total_orders_executed
            }


class BotScheduler:
    """
    Singleton scheduler coordinating workers for all 14 bots.
    Provides background evaluation loop, market data fan-out, and telemetry.
    """

    def __init__(self):
        self.workers: Dict[int, BotWorker] = {
            b_id: BotWorker(b_id) for b_id in CANONICAL_BOT_REGISTRY
        }
        self.backfill_adapter: HistoricalCandleBackfillAdapter = HistoricalCandleBackfillAdapter()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._is_running = False
        self._lock = threading.Lock()

    def start(self):
        """Starts background worker threads and evaluation loop."""
        with self._lock:
            if self._is_running:
                return
            self._stop_event.clear()
            for w in self.workers.values():
                w.worker_running = True
            self._is_running = True
            self._thread = threading.Thread(target=self._run_loop, name="BotSchedulerThread", daemon=True)
            self._thread.start()
            logger.info("BotScheduler started with 14 canonical bot workers.")

    def stop(self):
        """Gracefully halts background evaluation loop."""
        with self._lock:
            if not self._is_running:
                return
            self._stop_event.set()
            self._is_running = False
            for w in self.workers.values():
                w.worker_running = False

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3.0)
        logger.info("BotScheduler halted gracefully.")

    def is_running(self) -> bool:
        return self._is_running

    def ingest_tick(self, symbol: str, price: float, volume: float = 1.0, is_authentic: bool = True, timestamp: Optional[str] = None, is_replay: bool = False):
        """Fans out incoming market tick to matching bot workers."""
        clean_sym = symbol.upper().replace(" ", "")
        for w in self.workers.values():
            bot_asset = w.config.get("asset", "").upper().replace(" ", "")
            bot_tsym = w.config.get("tradingsymbol", "").upper()
            if bot_asset in clean_sym or clean_sym in bot_asset or bot_tsym in clean_sym:
                w.ingest_tick(price, volume, is_authentic, timestamp, is_replay=is_replay)

    def ingest_candle(self, bot_id: int, candle: Dict[str, Any], is_authentic: bool = True, is_replay: bool = False) -> bool:
        """Directly feeds candle bar to specific bot worker."""
        worker = self.workers.get(bot_id)
        if worker:
            return worker.ingest_candle(candle, is_authentic, is_replay=is_replay)
        return False

    def evaluate_bot(self, bot_id: int, execute_paper: bool = True) -> Dict[str, Any]:
        """Evaluates a single bot on demand."""
        worker = self.workers.get(bot_id)
        if not worker:
            return {
                "bot_id": bot_id,
                "decision": "NO_TRADE",
                "reason": f"Bot #{bot_id} not registered in canonical registry.",
                "status": "UNREGISTERED"
            }
        return worker.evaluate(execute_paper=execute_paper)

    def evaluate_all(self, execute_paper: bool = True) -> Dict[int, Dict[str, Any]]:
        """Evaluates all 14 bots sequentially."""
        results = {}
        for b_id, worker in self.workers.items():
            results[b_id] = worker.evaluate(execute_paper=execute_paper)
        return results

    def get_bot_status(self, bot_id: int) -> Optional[Dict[str, Any]]:
        """Returns status of a specific bot worker."""
        worker = self.workers.get(bot_id)
        return worker.get_status() if worker else None

    def get_all_statuses(self) -> List[Dict[str, Any]]:
        """Returns ordered status list for all 14 bots."""
        return [w.get_status() for w in self.workers.values()]

    def set_market_data_client(self, client: Any) -> None:
        """Injects market data client into scheduler backfill adapter."""
        with self._lock:
            self.backfill_adapter.set_client(client)

    def set_backfill_adapter(self, adapter: HistoricalCandleBackfillAdapter) -> None:
        """Injects custom HistoricalCandleBackfillAdapter."""
        with self._lock:
            self.backfill_adapter = adapter

    def backfill_bot(
        self,
        bot_id: int,
        from_date: Optional[Union[datetime, str]] = None,
        to_date: Optional[Union[datetime, str]] = None,
        client: Optional[Any] = None
    ) -> BackfillResult:
        """Backfills historical candles for an individual bot worker."""
        worker = self.workers.get(bot_id)
        if not worker:
            return BackfillResult(
                success=False,
                status="UNREGISTERED",
                candles=[],
                candle_count=0,
                rejected_count=0,
                rejected_records=[],
                is_complete=False,
                expected_candle_count=0,
                exchange="NSE",
                symbol_token="",
                interval="1m",
                from_date="",
                to_date="",
                error=f"Bot #{bot_id} is not registered in canonical registry."
            )
        return worker.backfill_history(
            adapter=self.backfill_adapter,
            from_date=from_date,
            to_date=to_date,
            client=client
        )

    def backfill_all(
        self,
        client: Optional[Any] = None,
        from_date: Optional[Union[datetime, str]] = None,
        to_date: Optional[Union[datetime, str]] = None
    ) -> Dict[int, BackfillResult]:
        """
        Executes rate-limited backfill for all 14 canonical bot workers.
        Returns mapping of bot_id to BackfillResult.
        """
        results = {}
        for b_id, worker in self.workers.items():
            results[b_id] = worker.backfill_history(
                adapter=self.backfill_adapter,
                from_date=from_date,
                to_date=to_date,
                client=client
            )
        return results

    def reconcile_gaps(self, client: Optional[Any] = None) -> Dict[int, Optional[BackfillResult]]:
        """
        Detects missing history between the latest candle in each bot's buffer and current time,
        skipping legitimate exchange closures (weekends and off-hours), and backfills missing ranges.
        """
        now_dt = datetime.now(IST)
        session = None
        if InstrumentAuditor is not None:
            session = InstrumentAuditor.get_market_session_state(now_dt)

        is_market_active = session.get("is_open", False) if session else True
        if not is_market_active:
            # Exchange session is closed (weekend, holiday, or off-hours); no missing trading candles
            return {b_id: None for b_id in self.workers}

        results = {}
        for b_id, worker in self.workers.items():
            with worker.lock:
                if not worker.candles:
                    needs_backfill = True
                    last_ts = None
                else:
                    last_candle = worker.candles[-1]
                    last_ts = last_candle.get("timestamp")
                    tf = worker.config.get("timeframe", "1m")
                    tf_sec = 60
                    if tf.endswith("m"):
                        try:
                            tf_sec = int(tf[:-1]) * 60
                        except Exception:
                            tf_sec = 60
                    elif tf.endswith("h"):
                        try:
                            tf_sec = int(tf[:-1]) * 3600
                        except Exception:
                            tf_sec = 3600

                    try:
                        clean_ts = str(last_ts).replace("Z", "+00:00")
                        c_dt = datetime.fromisoformat(clean_ts) if "T" in clean_ts else datetime.strptime(clean_ts, "%Y-%m-%d %H:%M:%S").replace(tzinfo=IST)
                        elapsed_sec = (now_dt - c_dt).total_seconds()
                    except Exception:
                        elapsed_sec = 0

                    is_market_active = session.get("is_open", False) if session else True
                    needs_backfill = is_market_active and (elapsed_sec > tf_sec * 2)

            if needs_backfill:
                results[b_id] = worker.backfill_history(
                    adapter=self.backfill_adapter,
                    from_date=last_ts,
                    to_date=now_dt.strftime("%Y-%m-%d %H:%M"),
                    client=client
                )
            else:
                results[b_id] = None

        return results

    def get_status(self) -> Dict[str, Any]:
        """Returns overall scheduler status and health."""
        return {
            "running": self.is_running(),
            "total_workers": len(self.workers),
            "workers": self.get_all_statuses(),
            "backfill_ready_count": sum(1 for w in self.workers.values() if getattr(w, "backfill_status", "") == "COMPLETED")
        }


    def _run_loop(self):
        """Periodic background evaluation loop."""
        while not self._stop_event.is_set():
            try:
                for w in self.workers.values():
                    if self._stop_event.is_set():
                        break
                    # Periodic evaluation if strategy is ready
                    if w.strategy_ready and w.data_healthy:
                        w.evaluate(execute_paper=True)
            except Exception as e:
                logger.error(f"Exception in BotScheduler run loop: {e}")

            # Sleep 1 second before next evaluation cycle
            self._stop_event.wait(1.0)


# Global singleton instance
bot_scheduler = BotScheduler()
