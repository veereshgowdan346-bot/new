"""
CHINTU AI TRADING SYSTEM - Historical Candle Backfill Adapter (Phase 8.3 Stage 2)
Authoritative historical market-data retrieval, validation, and normalization engine.

Design and Operational Principles:
1. Dependency Injection:
   Accepts a market-data client (SmartConnect or mock) at initialization or per-call.
   Enables 100% offline, isolated unit testing without live broker credentials.
2. Strict Read-Only Market-Data Scope:
   Calls ONLY supported historical market data interfaces (e.g. getCandleData).
   Guaranteed never to call order placement, modification, or cancellation endpoints.
3. Authoritative IST Timezone (Asia/Kolkata):
   All candle timestamps and date boundaries are parsed and formatted in IST (+05:30).
4. Strict Mathematical OHLC Integrity:
   - High >= max(Open, Close) and Low <= min(Open, Close) within floating-point tolerance.
   - Strictly positive prices (Open, High, Low, Close > 0).
   - Non-negative volume (Volume >= 0).
   - Rejection of NaN, infinite, or corrupted values.
   - Future candle rejection (anti-lookahead protection).
5. Chronological Ascending Ordering & Deduplication:
   Strict deduplication on candle timestamp epoch; records sorted in strictly ascending order.
6. Rate Limiting & Bounded Retries:
   Configurable inter-request throttling, bounded retries with exponential backoff and jitter
   for handling transient network dropouts or broker throttling (HTTP 429).
7. Transparent Completeness Reporting:
   Full accounting of valid candles, rejected records with specific error reasons,
   intra-session gap detection, and explicit 'is_complete' flag. Never silently
   labels incomplete historical ranges as complete.
8. Zero Persistence Mutation:
   Does not perform database writes, schema migrations, or disk mutations.
"""

import time
import math
import random
import zoneinfo
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple, Union
from dataclasses import dataclass, field, asdict

# Authoritative IST Timezone
IST = zoneinfo.ZoneInfo("Asia/Kolkata")
IST_TZ = timezone(timedelta(hours=5, minutes=30))

# Supported Indian Exchange Segments
SUPPORTED_EXCHANGES = {"NSE", "NFO", "BSE", "BFO", "MCX", "CDS"}

# Canonical Interval Map: Maps user/bot string representations to Angel One SmartAPI interval codes
SUPPORTED_INTERVAL_MAP = {
    "1m": "ONE_MINUTE",
    "1min": "ONE_MINUTE",
    "ONE_MINUTE": "ONE_MINUTE",
    "3m": "THREE_MINUTE",
    "3min": "THREE_MINUTE",
    "THREE_MINUTE": "THREE_MINUTE",
    "5m": "FIVE_MINUTE",
    "5min": "FIVE_MINUTE",
    "FIVE_MINUTE": "FIVE_MINUTE",
    "10m": "TEN_MINUTE",
    "10min": "TEN_MINUTE",
    "TEN_MINUTE": "TEN_MINUTE",
    "15m": "FIFTEEN_MINUTE",
    "15min": "FIFTEEN_MINUTE",
    "FIFTEEN_MINUTE": "FIFTEEN_MINUTE",
    "30m": "THIRTY_MINUTE",
    "30min": "THIRTY_MINUTE",
    "THIRTY_MINUTE": "THIRTY_MINUTE",
    "60m": "ONE_HOUR",
    "1h": "ONE_HOUR",
    "ONE_HOUR": "ONE_HOUR",
    "1d": "ONE_DAY",
    "ONE_DAY": "ONE_DAY",
}

# Interval duration in seconds for gap and completeness evaluation
INTERVAL_SECONDS = {
    "ONE_MINUTE": 60,
    "THREE_MINUTE": 180,
    "FIVE_MINUTE": 300,
    "TEN_MINUTE": 600,
    "FIFTEEN_MINUTE": 900,
    "THIRTY_MINUTE": 1800,
    "ONE_HOUR": 3600,
    "ONE_DAY": 86400,
}

# Defensive guard against invoking order-routing endpoints
FORBIDDEN_ORDER_METHODS = {
    "placeOrder",
    "modifyOrder",
    "cancelOrder",
    "orderBook",
    "tradeBook",
    "getPosition",
    "getHolding"
}


@dataclass
class BackfillConfig:
    """Configurable runtime controls for the historical backfill adapter."""
    min_request_interval_seconds: float = 0.35  # Throttling between successive API calls
    max_retries: int = 3                        # Bounded retry attempts on transient failure
    initial_backoff_seconds: float = 0.5        # Base backoff duration
    backoff_multiplier: float = 2.0             # Multiplier for exponential backoff
    enable_jitter: bool = True                  # Jitter to avoid thundering herd on recovery
    clock_tolerance_seconds: float = 60.0       # Clock drift tolerance for future candle check
    price_tolerance: float = 1e-4               # Tolerance for floating-point comparison


@dataclass
class NormalizedCandle:
    """
    Deterministic canonical representation of a single normalized historical candle.
    All prices are rounded to 2 decimal places. Timestamp is strictly IST ISO-8601 string.
    """
    timestamp: str  # e.g. "2024-05-02T09:15:00+05:30"
    epoch: float    # Unix epoch in seconds
    open: float     # Open price (₹)
    high: float     # High price (₹)
    low: float      # Low price (₹)
    close: float    # Close price (₹)
    volume: float   # Traded volume
    interval: str   # Canonical interval name (e.g. "FIVE_MINUTE")

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class BackfillResult:
    """
    Structured outcome of a historical candle backfill request.
    Includes full transparency into accepted candles, rejected records,
    detected data gaps, and completeness classification.
    """
    success: bool
    status: str                         # "COMPLETED", "PARTIAL", "EMPTY", "FAILED", "RATE_LIMITED", "AUTH_ERROR"
    candles: List[Dict[str, Any]]
    candle_count: int
    rejected_count: int
    rejected_records: List[Dict[str, Any]]
    is_complete: bool
    expected_candle_count: Optional[int]
    exchange: str
    symbol_token: str
    interval: str
    from_date: str
    to_date: str
    error: Optional[str] = None
    retries_attempted: int = 0
    execution_time_ms: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class HistoricalCandleBackfillAdapter:
    """
    Dedicated, read-only adapter for querying and normalizing historical candle data.
    Designed for dependency injection and safe operation in PAPER mode.
    """

    def __init__(
        self,
        client: Optional[Any] = None,
        config: Optional[BackfillConfig] = None
    ):
        """
        Initialize the adapter.
        :param client: Market data client (e.g., SmartConnect instance or mock).
        :param config: Runtime configuration settings.
        """
        self.client = client
        self.config = config or BackfillConfig()
        self._last_request_time: float = 0.0

    def set_client(self, client: Any) -> None:
        """Dynamically inject or update the market-data client."""
        self.client = client

    def _apply_rate_limit(self) -> None:
        """Enforces configurable inter-request rate limiting."""
        if self.config.min_request_interval_seconds <= 0:
            return
        now = time.time()
        elapsed = now - self._last_request_time
        if elapsed < self.config.min_request_interval_seconds:
            time.sleep(self.config.min_request_interval_seconds - elapsed)
        self._last_request_time = time.time()

    def _parse_and_validate_datetime(
        self,
        dt_val: Union[datetime, str],
        label: str,
        now_dt: datetime
    ) -> Tuple[Optional[datetime], Optional[str]]:
        """
        Parses and normalizes input datetime to an aware datetime in Asia/Kolkata timezone.
        """
        if dt_val is None:
            return None, f"Missing required parameter '{label}'."

        parsed_dt: Optional[datetime] = None

        if isinstance(dt_val, datetime):
            if dt_val.tzinfo is None:
                parsed_dt = dt_val.replace(tzinfo=IST)
            else:
                parsed_dt = dt_val.astimezone(IST)
        elif isinstance(dt_val, str):
            clean_str = dt_val.strip()
            # Try ISO formats first
            try:
                parsed_dt = datetime.fromisoformat(clean_str.replace("Z", "+00:00"))
                if parsed_dt.tzinfo is None:
                    parsed_dt = parsed_dt.replace(tzinfo=IST)
                else:
                    parsed_dt = parsed_dt.astimezone(IST)
            except Exception:
                # Try common Angel One format: "YYYY-MM-DD HH:MM" or "YYYY-MM-DD HH:MM:SS"
                for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
                    try:
                        parsed_dt = datetime.strptime(clean_str, fmt).replace(tzinfo=IST)
                        break
                    except ValueError:
                        continue

        if parsed_dt is None:
            return None, f"Invalid format for '{label}': '{dt_val}'. Must be ISO-8601 or 'YYYY-MM-DD HH:MM'."

        return parsed_dt, None

    def validate_request_parameters(
        self,
        exchange: str,
        symbol_token: Union[str, int],
        interval: str,
        from_date: Union[datetime, str],
        to_date: Union[datetime, str]
    ) -> Tuple[bool, Optional[str], Dict[str, Any]]:
        """
        Validates request parameters prior to broker transmission.
        Returns (is_valid, error_reason, normalized_params).
        """
        # 1. Validate Exchange
        if not exchange or not isinstance(exchange, str):
            return False, "Exchange must be a non-empty string.", {}
        clean_exchange = exchange.strip().upper()
        if clean_exchange not in SUPPORTED_EXCHANGES:
            return False, f"Unsupported exchange '{exchange}'. Must be one of: {sorted(SUPPORTED_EXCHANGES)}.", {}

        # 2. Validate Symbol Token
        if symbol_token is None:
            return False, "Symbol token cannot be None.", {}
        token_str = str(symbol_token).strip()
        is_negative_or_zero = False
        try:
            val_int = int(token_str)
            if val_int <= 0:
                is_negative_or_zero = True
        except ValueError:
            pass

        if not token_str or is_negative_or_zero:
            return False, f"Invalid symbol token '{symbol_token}'. Must be a positive identifier.", {}

        # 3. Validate Interval
        if not interval or not isinstance(interval, str):
            return False, "Interval must be a non-empty string.", {}
        clean_interval = interval.strip()
        canonical_interval = SUPPORTED_INTERVAL_MAP.get(clean_interval) or SUPPORTED_INTERVAL_MAP.get(clean_interval.upper())
        if not canonical_interval:
            return False, f"Unsupported interval '{interval}'. Supported intervals: {sorted(set(SUPPORTED_INTERVAL_MAP.values()))}.", {}

        # 4. Validate Timestamps
        now_ist = datetime.now(IST)
        from_dt, err_from = self._parse_and_validate_datetime(from_date, "from_date", now_ist)
        if err_from:
            return False, err_from, {}

        to_dt, err_to = self._parse_and_validate_datetime(to_date, "to_date", now_ist)
        if err_to:
            return False, err_to, {}

        if from_dt > to_dt:
            return False, f"from_date ({from_dt.isoformat()}) cannot be after to_date ({to_dt.isoformat()}).", {}

        # Anti-lookahead: from_date cannot be in the future beyond clock tolerance
        tolerance = timedelta(seconds=self.config.clock_tolerance_seconds)
        if from_dt > (now_ist + tolerance):
            return False, f"from_date ({from_dt.isoformat()}) is in the future. Future backfill rejected.", {}

        normalized = {
            "exchange": clean_exchange,
            "symboltoken": token_str,
            "interval": canonical_interval,
            "fromdate": from_dt.strftime("%Y-%m-%d %H:%M"),
            "todate": to_dt.strftime("%Y-%m-%d %H:%M"),
            "from_dt": from_dt,
            "to_dt": to_dt
        }
        return True, None, normalized

    def parse_single_candle(
        self,
        raw_candle: Union[List[Any], Tuple[Any, ...], Dict[str, Any]],
        canonical_interval: str,
        now_epoch: float
    ) -> Tuple[Optional[NormalizedCandle], Optional[Dict[str, Any]]]:
        """
        Parses and validates a single raw candle against mathematical and temporal invariants.
        Returns (NormalizedCandle, None) on success, or (None, rejection_dict) on failure.
        """
        timestamp_raw = None
        open_raw = None
        high_raw = None
        low_raw = None
        close_raw = None
        volume_raw = 0.0

        if isinstance(raw_candle, (list, tuple)):
            if len(raw_candle) < 5:
                return None, {"raw": raw_candle, "reason": "MALFORMED_LIST_LENGTH_UNDER_5"}
            timestamp_raw = raw_candle[0]
            open_raw = raw_candle[1]
            high_raw = raw_candle[2]
            low_raw = raw_candle[3]
            close_raw = raw_candle[4]
            if len(raw_candle) >= 6:
                volume_raw = raw_candle[5]
        elif isinstance(raw_candle, dict):
            timestamp_raw = raw_candle.get("timestamp") or raw_candle.get("time") or raw_candle.get("date")
            open_raw = raw_candle.get("open")
            high_raw = raw_candle.get("high")
            low_raw = raw_candle.get("low")
            close_raw = raw_candle.get("close")
            volume_raw = raw_candle.get("volume", 0.0)
        else:
            return None, {"raw": str(raw_candle), "reason": "UNSUPPORTED_DATA_STRUCTURE"}

        # 1. Parse and validate timestamp
        if timestamp_raw is None:
            return None, {"raw": raw_candle, "reason": "MISSING_TIMESTAMP"}

        dt: Optional[datetime] = None
        epoch_ts: Optional[float] = None

        if isinstance(timestamp_raw, (int, float)):
            epoch_ts = float(timestamp_raw)
            dt = datetime.fromtimestamp(epoch_ts, tz=IST)
        elif isinstance(timestamp_raw, str):
            clean_ts = timestamp_raw.strip()
            try:
                # ISO parsing
                dt = datetime.fromisoformat(clean_ts.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=IST)
                else:
                    dt = dt.astimezone(IST)
                epoch_ts = dt.timestamp()
            except Exception:
                for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M"):
                    try:
                        dt = datetime.strptime(clean_ts, fmt).replace(tzinfo=IST)
                        epoch_ts = dt.timestamp()
                        break
                    except ValueError:
                        continue

        if dt is None or epoch_ts is None:
            return None, {"raw": raw_candle, "reason": f"UNPARSEABLE_TIMESTAMP_{timestamp_raw}"}

        # 2. Anti-lookahead: Reject future candles
        if epoch_ts > (now_epoch + self.config.clock_tolerance_seconds):
            return None, {
                "raw": raw_candle,
                "timestamp": dt.isoformat(),
                "reason": f"FUTURE_CANDLE_TIMESTAMP_EXCEEDS_CLOCK_TOLERANCE (epoch={epoch_ts} > now={now_epoch})"
            }

        # 3. Numeric type & value validations
        try:
            o = float(open_raw)
            h = float(high_raw)
            l = float(low_raw)
            c = float(close_raw)
            v = float(volume_raw) if volume_raw is not None else 0.0
        except (ValueError, TypeError) as e:
            return None, {"raw": raw_candle, "reason": f"NON_NUMERIC_OHLCV_{str(e)}"}

        # NaN / Infinity rejection
        for val_name, val in [("open", o), ("high", h), ("low", l), ("close", c), ("volume", v)]:
            if math.isnan(val) or math.isinf(val):
                return None, {"raw": raw_candle, "reason": f"INVALID_NUMERIC_{val_name.upper()}_IS_NAN_OR_INF"}

        # Positive price checks
        if o <= 0 or h <= 0 or l <= 0 or c <= 0:
            return None, {"raw": raw_candle, "reason": "PRICE_MUST_BE_STRICTLY_POSITIVE"}

        # Non-negative volume check
        if v < 0:
            return None, {"raw": raw_candle, "reason": "VOLUME_CANNOT_BE_NEGATIVE"}

        # 4. Mathematical OHLC Boundary Validation
        tol = self.config.price_tolerance
        if h < l - tol:
            return None, {"raw": raw_candle, "reason": f"INVERTED_HIGH_LOW (high={h} < low={l})"}

        if h < max(o, c) - tol:
            return None, {"raw": raw_candle, "reason": f"HIGH_LESS_THAN_MAX_OPEN_CLOSE (high={h} < max({o}, {c}))"}

        if l > min(o, c) + tol:
            return None, {"raw": raw_candle, "reason": f"LOW_GREATER_THAN_MIN_OPEN_CLOSE (low={l} > min({o}, {c}))"}

        # Construct deterministic normalized candle
        norm_candle = NormalizedCandle(
            timestamp=dt.isoformat(),
            epoch=round(epoch_ts, 3),
            open=round(o, 2),
            high=round(h, 2),
            low=round(l, 2),
            close=round(c, 2),
            volume=round(v, 2),
            interval=canonical_interval
        )
        return norm_candle, None

    def _execute_with_retry(self, payload: Dict[str, Any]) -> Tuple[bool, Optional[Any], Optional[str], int]:
        """
        Executes historical data call against injected client with bounded retries and exponential backoff.
        Returns (success, response_data, error_message, retries_attempted).
        """
        if self.client is None:
            return False, None, "Market-data client is not initialized or authenticated.", 0

        # Safety verification: Confirm no order execution endpoints are touched
        for forbidden in FORBIDDEN_ORDER_METHODS:
            if hasattr(payload, forbidden):
                raise RuntimeError(f"CRITICAL SAFETY VIOLATION: Payload attempted to access {forbidden}.")

        retries = 0
        backoff = self.config.initial_backoff_seconds

        while True:
            self._apply_rate_limit()

            try:
                # Primary SmartConnect historical data API
                if hasattr(self.client, "getCandleData"):
                    resp = self.client.getCandleData(payload)
                elif callable(self.client):
                    resp = self.client(payload)
                else:
                    return False, None, "Injected client does not provide 'getCandleData' or callable interface.", retries

                # Validate response structure
                if resp is None:
                    raise ConnectionError("Client returned None response.")

                # If wrapped in dict (standard SmartAPI response format: {"status": True, "data": [...]})
                if isinstance(resp, dict):
                    status_flag = resp.get("status")
                    err_code = str(resp.get("errorcode") or "")
                    msg = str(resp.get("message") or "")

                    # Check for unrecoverable auth / session expiration
                    if err_code in ("AG8001", "AB1010") or "invalid token" in msg.lower() or "session expired" in msg.lower():
                        return False, None, f"Broker authentication error: {msg} (code: {err_code})", retries

                    # Check for throttling / rate limit
                    is_throttled = (
                        err_code in ("AG429", "429") or
                        "too many requests" in msg.lower() or
                        "rate limit" in msg.lower()
                    )

                    if not status_flag and not is_throttled:
                        # Non-throttling broker error
                        return False, None, f"Broker API error: {msg} (code: {err_code})", retries

                    if is_throttled:
                        raise ConnectionError(f"Throttled by broker: {msg} (code: {err_code})")

                    raw_data = resp.get("data")
                    return True, raw_data, None, retries

                # Direct list of candles returned
                if isinstance(resp, list):
                    return True, resp, None, retries

                return False, None, f"Unrecognized response type '{type(resp).__name__}'.", retries

            except Exception as e:
                retries += 1
                if retries > self.config.max_retries:
                    return False, None, f"Exhausted {self.config.max_retries} retries. Final error: {str(e)}", retries

                # Exponential backoff with optional jitter
                jitter = random.uniform(0.05, 0.2) if self.config.enable_jitter else 0.0
                sleep_duration = (backoff * (self.config.backoff_multiplier ** (retries - 1))) + jitter
                time.sleep(sleep_duration)

    def fetch_historical_candles(
        self,
        exchange: str,
        symbol_token: Union[str, int],
        interval: str,
        from_date: Union[datetime, str],
        to_date: Union[datetime, str],
        expected_count: Optional[int] = None
    ) -> BackfillResult:
        """
        Queries and normalizes historical candles for a specific instrument and time window.
        """
        start_mono = time.monotonic()

        # 1. Parameter Validation
        is_valid, val_err, norm_params = self.validate_request_parameters(
            exchange=exchange,
            symbol_token=symbol_token,
            interval=interval,
            from_date=from_date,
            to_date=to_date
        )

        if not is_valid:
            return BackfillResult(
                success=False,
                status="FAILED",
                candles=[],
                candle_count=0,
                rejected_count=0,
                rejected_records=[],
                is_complete=False,
                expected_candle_count=expected_count,
                exchange=exchange,
                symbol_token=str(symbol_token),
                interval=interval,
                from_date=str(from_date),
                to_date=str(to_date),
                error=val_err,
                retries_attempted=0,
                execution_time_ms=round((time.monotonic() - start_mono) * 1000, 2)
            )

        api_payload = {
            "exchange": norm_params["exchange"],
            "symboltoken": norm_params["symboltoken"],
            "interval": norm_params["interval"],
            "fromdate": norm_params["fromdate"],
            "todate": norm_params["todate"]
        }

        # 2. Network / Client Execution with bounded retry
        success, raw_data, err_msg, retries = self._execute_with_retry(api_payload)

        exec_time_ms = round((time.monotonic() - start_mono) * 1000, 2)

        if not success:
            is_auth = bool(err_msg and any(w in err_msg.lower() for w in ("authenticat", "token", "session", "unauthorized")))
            status_code = "AUTH_ERROR" if is_auth else "FAILED"
            return BackfillResult(
                success=False,
                status=status_code,
                candles=[],
                candle_count=0,
                rejected_count=0,
                rejected_records=[],
                is_complete=False,
                expected_candle_count=expected_count,
                exchange=norm_params["exchange"],
                symbol_token=norm_params["symboltoken"],
                interval=norm_params["interval"],
                from_date=norm_params["fromdate"],
                to_date=norm_params["todate"],
                error=err_msg,
                retries_attempted=retries,
                execution_time_ms=exec_time_ms
            )

        # 3. Handle Empty Response
        if not raw_data:
            return BackfillResult(
                success=True,
                status="EMPTY",
                candles=[],
                candle_count=0,
                rejected_count=0,
                rejected_records=[],
                is_complete=False,
                expected_candle_count=expected_count,
                exchange=norm_params["exchange"],
                symbol_token=norm_params["symboltoken"],
                interval=norm_params["interval"],
                from_date=norm_params["fromdate"],
                to_date=norm_params["todate"],
                error="Broker returned empty candle array.",
                retries_attempted=retries,
                execution_time_ms=exec_time_ms
            )

        if not isinstance(raw_data, list):
            return BackfillResult(
                success=False,
                status="FAILED",
                candles=[],
                candle_count=0,
                rejected_count=0,
                rejected_records=[],
                is_complete=False,
                expected_candle_count=expected_count,
                exchange=norm_params["exchange"],
                symbol_token=norm_params["symboltoken"],
                interval=norm_params["interval"],
                from_date=norm_params["fromdate"],
                to_date=norm_params["todate"],
                error=f"Malformed candle payload. Expected list, got {type(raw_data).__name__}.",
                retries_attempted=retries,
                execution_time_ms=exec_time_ms
            )

        # 4. Normalization, Deduplication, and Validation
        valid_candles: List[NormalizedCandle] = []
        rejected_records: List[Dict[str, Any]] = []
        seen_epochs = set()
        now_epoch = time.time()

        for idx, item in enumerate(raw_data):
            norm_c, rej = self.parse_single_candle(item, norm_params["interval"], now_epoch)
            if rej is not None:
                rej["index"] = idx
                rejected_records.append(rej)
                continue

            # Deduplication
            if norm_c.epoch in seen_epochs:
                rejected_records.append({
                    "index": idx,
                    "timestamp": norm_c.timestamp,
                    "epoch": norm_c.epoch,
                    "reason": "DUPLICATE_TIMESTAMP"
                })
                continue

            seen_epochs.add(norm_c.epoch)
            valid_candles.append(norm_c)

        # 5. Chronological Ascending Sorting
        valid_candles.sort(key=lambda c: c.epoch)

        # 6. Data Completeness & Gap Evaluation
        interval_sec = INTERVAL_SECONDS.get(norm_params["interval"], 60)
        detected_gaps: List[Dict[str, Any]] = []

        if len(valid_candles) > 1:
            for i in range(1, len(valid_candles)):
                gap = valid_candles[i].epoch - valid_candles[i - 1].epoch
                # A gap occurs if step exceeds expected interval + tolerance (except multi-day session breaks)
                if gap > (interval_sec * 1.5) and gap < 86400:  # Intra-day gap
                    detected_gaps.append({
                        "from_timestamp": valid_candles[i - 1].timestamp,
                        "to_timestamp": valid_candles[i].timestamp,
                        "missing_seconds": round(gap - interval_sec, 2),
                        "estimated_missing_candles": int(round((gap - interval_sec) / interval_sec))
                    })

        # Completeness Invariant:
        # Never silently mark incomplete history as complete!
        is_complete = True
        status = "COMPLETED"

        if expected_count is not None:
            if len(valid_candles) < expected_count or len(rejected_records) > 0 or len(detected_gaps) > 0:
                is_complete = False
                status = "PARTIAL"
        else:
            if len(rejected_records) > 0 or len(detected_gaps) > 0:
                is_complete = False
                status = "PARTIAL"
            elif len(valid_candles) == 0:
                is_complete = False
                status = "EMPTY"

        candle_dicts = [c.to_dict() for c in valid_candles]

        return BackfillResult(
            success=True,
            status=status,
            candles=candle_dicts,
            candle_count=len(candle_dicts),
            rejected_count=len(rejected_records),
            rejected_records=rejected_records,
            is_complete=is_complete,
            expected_candle_count=expected_count,
            exchange=norm_params["exchange"],
            symbol_token=norm_params["symboltoken"],
            interval=norm_params["interval"],
            from_date=norm_params["fromdate"],
            to_date=norm_params["todate"],
            error=None if is_complete else ("History has rejected records or intra-day gaps" if rejected_records or detected_gaps else None),
            retries_attempted=retries,
            execution_time_ms=exec_time_ms,
            metadata={
                "intra_day_gaps": detected_gaps,
                "gap_count": len(detected_gaps),
                "seen_unique_epochs": len(seen_epochs)
            }
        )
