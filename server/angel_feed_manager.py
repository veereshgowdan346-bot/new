"""
CHINTU AI TRADING SYSTEM - Angel One SmartAPI Feed Manager & Instrument Master
Authentic WebSocket Streaming Engine (SmartWebSocketV2), Contract Expiration Auditor,
Market Hours Gating, and Fail-Closed Feed Health Management.
"""

import os
import sys
import time
import json
import math
import struct
import threading
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple

try:
    import pyotp
except ImportError:
    pyotp = None

try:
    from SmartApi import SmartConnect
except ImportError:
    SmartConnect = None

try:
    from SmartApi.smartWebSocketV2 import SmartWebSocketV2
except ImportError:
    SmartWebSocketV2 = None


# IST Timezone Helper (+05:30)
IST = timezone(timedelta(hours=5, minutes=30))


# -----------------------------------------------------------------------------
# 1. Authoritative Instrument Master & Expiration Auditor
# -----------------------------------------------------------------------------

# Authoritative SEBI Exchange mapping for SmartWebSocketV2
# ExchangeType constants in SmartWebSocketV2:
# 1 = nse_cm (NSE Cash Equities)
# 2 = nse_fo (NSE Futures & Options)
# 3 = bse_cm (BSE Cash)
# 4 = bse_fo (BSE Derivatives / SENSEX)
# 5 = mcx_fo (MCX Commodity Futures)
# 13 = cde_fo (NSE Currency Derivatives / USDINR)

EXCHANGE_TYPE_MAP = {
    "NSE": 1,
    "NFO": 2,
    "BSE": 3,
    "BFO": 4,
    "MCX": 5,
    "CDS": 13
}


class InstrumentAuditor:
    """
    Audits trading instruments, flags expired derivatives contracts (e.g. 2024 contracts),
    validates permanent cash equities, and identifies unsupported crypto assets.
    """

    @staticmethod
    def get_market_session_state(now_dt: Optional[datetime] = None) -> Dict[str, Any]:
        """
        Determines Indian stock market (NSE/BSE/MCX) session state in IST.
        Regular hours: Monday-Friday 09:15 to 15:30 IST (Equity/F&O), 09:00 to 23:30 (MCX).
        Weekends (Saturday & Sunday) are strictly closed.
        """
        now = now_dt or datetime.now(IST)
        weekday = now.weekday()  # 0=Monday, 5=Saturday, 6=Sunday
        time_minutes = now.hour * 60 + now.minute

        is_weekend = weekday in (5, 6)
        day_name = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][weekday]

        # NSE Equity & F&O: 09:15 to 15:30 IST
        nse_open = (not is_weekend) and (9 * 60 + 15 <= time_minutes <= 15 * 60 + 30)
        # MCX Commodity: 09:00 to 23:30 IST
        mcx_open = (not is_weekend) and (9 * 60 <= time_minutes <= 23 * 60 + 30)

        if is_weekend:
            reason = f"Indian stock exchanges (NSE/BSE/MCX) are closed on {day_name}."
            status = "MARKET_CLOSED"
        elif not nse_open and not mcx_open:
            reason = f"Outside active trading hours (Current: {now.strftime('%H:%M')} IST). Active NSE hours: 09:15 - 15:30 IST."
            status = "MARKET_CLOSED"
        else:
            reason = "Exchange session is active."
            status = "MARKET_OPEN"

        return {
            "is_open": nse_open or mcx_open,
            "nse_open": nse_open,
            "mcx_open": mcx_open,
            "is_weekend": is_weekend,
            "weekday": day_name,
            "ist_time": now.strftime("%Y-%m-%d %H:%M:%S IST"),
            "status": status,
            "reason": reason
        }

    @staticmethod
    def audit_instrument(
        symbol_name: str,
        tradingsymbol: str,
        token: str,
        exchange: str,
        current_year: int = 2026
    ) -> Dict[str, Any]:
        """
        Audits an instrument to determine validity, permanent equity status, or contract expiration.
        """
        clean_ts = str(tradingsymbol or "").upper().strip()
        exch_upper = str(exchange or "").upper().strip()

        # Check for non-SEBI crypto assets
        if exch_upper in ["BINANCE", "CRYPTO"] or "BTC" in clean_ts or "ETH" in clean_ts:
            return {
                "symbol": symbol_name,
                "tradingsymbol": tradingsymbol,
                "token": token,
                "exchange": exchange,
                "is_valid": False,
                "classification": "UNSUPPORTED_BROKER_ASSET",
                "is_expired": False,
                "reason": "Cryptocurrency derivatives on Binance are not supported on SEBI-regulated Angel One SmartAPI.",
                "action_required": "Route crypto via paper simulation or dedicated crypto connector."
            }

        # Check for permanent cash equity instruments
        if clean_ts.endswith("-EQ") and exch_upper in ["NSE", "BSE"]:
            # Detect demerger symbol discrepancy (e.g. TATAMOTORS-EQ vs TMPV-EQ)
            if clean_ts == "TATAMOTORS-EQ":
                return {
                    "symbol": symbol_name,
                    "tradingsymbol": tradingsymbol,
                    "token": token,
                    "exchange": exchange,
                    "is_valid": False,
                    "classification": "DISCREPANCY_BLOCKED",
                    "is_expired": False,
                    "reason": "Configured symbol 'TATAMOTORS-EQ' is absent from official Angel One Scrip Master. Master token 3456 maps to 'TMPV-EQ'. TATAMOTORS-EQ and TMPV-EQ cannot be assumed interchangeable. Instrument is blocked for safety.",
                    "action_required": "Obtain verified trading symbol post-demerger before trading."
                }
            return {
                "symbol": symbol_name,
                "tradingsymbol": tradingsymbol,
                "token": token,
                "exchange": exchange,
                "is_valid": True,
                "classification": "PERMANENT_CASH_EQUITY",
                "is_expired": False,
                "reason": "Permanent cash equity scrip. Never expires.",
                "action_required": None
            }

        # Check for expired derivatives contracts (24OCT, 24NOV, 24DEC from 2024, etc.)
        # Year code pattern: 24, 25 in contract name when current year is 2026
        is_expired = False
        expiry_details = None

        for yr in range(20, current_year):
            yr_str = str(yr)[-2:]  # "24", "25"
            for mon in ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]:
                pat = f"{yr_str}{mon}"
                if pat in clean_ts:
                    is_expired = True
                    expiry_details = f"Expired {mon} 20{yr_str} contract"
                    break
            if is_expired:
                break

        if is_expired:
            curr_yr_str = str(current_year)[-2:]
            curr_mon_str = datetime.now().strftime("%b").upper()
            suggested = clean_ts
            for yr in range(20, current_year):
                yr_str = str(yr)[-2:]
                for mon in ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]:
                    suggested = suggested.replace(f"{yr_str}{mon}", f"{curr_yr_str}{curr_mon_str}")

            return {
                "symbol": symbol_name,
                "tradingsymbol": tradingsymbol,
                "token": token,
                "exchange": exchange,
                "is_valid": False,
                "classification": "EXPIRED_DERIVATIVE_CONTRACT",
                "is_expired": True,
                "reason": f"Contract '{tradingsymbol}' expired ({expiry_details}). Delisted from exchange.",
                "suggested_active_symbol": suggested,
                "action_required": f"Update token and contract to active {current_year} series via Angel One Scrip Master."
            }

        return {
            "symbol": symbol_name,
            "tradingsymbol": tradingsymbol,
            "token": token,
            "exchange": exchange,
            "is_valid": True,
            "classification": "ACTIVE_DERIVATIVE",
            "is_expired": False,
            "reason": "Active contract verified.",
            "action_required": None
        }

    @classmethod
    def audit_all_14_bots(cls) -> Dict[str, Any]:
        """Audits all 14 canonical bots and returns comprehensive contract status."""
        from server.bot_registry import CANONICAL_BOT_REGISTRY

        results = []
        valid_count = 0
        expired_count = 0
        unsupported_count = 0
        discrepancy_count = 0

        for b_id, bot in sorted(CANONICAL_BOT_REGISTRY.items()):
            audit = cls.audit_instrument(
                symbol_name=bot["asset"],
                tradingsymbol=bot["tradingsymbol"],
                token=bot["symboltoken"],
                exchange=bot["exchange"]
            )
            audit["bot_id"] = b_id
            audit["bot_name"] = bot["name"]
            audit["required_data"] = bot.get("required_data", "OHLCV")
            audit["data_readiness"] = bot.get("data_readiness", "READY")

            if audit["classification"] == "PERMANENT_CASH_EQUITY":
                valid_count += 1
            elif audit["classification"] == "EXPIRED_DERIVATIVE_CONTRACT":
                expired_count += 1
            elif audit["classification"] == "UNSUPPORTED_BROKER_ASSET":
                unsupported_count += 1
            elif audit["classification"] == "DISCREPANCY_BLOCKED":
                discrepancy_count += 1
            else:
                valid_count += 1

            results.append(audit)

        session = cls.get_market_session_state()

        return {
            "timestamp": datetime.now(IST).isoformat(),
            "market_session": session,
            "total_bots": len(results),
            "permanent_equities_valid": valid_count,
            "expired_derivatives_flagged": expired_count,
            "unsupported_assets": unsupported_count,
            "discrepancy_blocked_flagged": discrepancy_count,
            "bots": results
        }


# -----------------------------------------------------------------------------
# 2. Authentic Angel One WebSocket Streaming Manager (SmartWebSocketV2)
# -----------------------------------------------------------------------------

class AngelOneWebSocketManager:
    """
    Manages authentic WebSocket streaming using the official SmartWebSocketV2 SDK.
    Enforces sanitized logging, strict freshness verification, fail-closed feed safety,
    bounded backoff reconnection, and clean separation between authentic, synthetic, and test ticks.
    """

    def __init__(self):
        # Thread-safety re-entrant lock
        self._lock: threading.RLock = threading.RLock()

        self.ws: Optional[Any] = None
        self.ws_thread: Optional[Any] = None
        self.is_connected: bool = False
        self.is_authenticated: bool = False
        self.auth_token: Optional[str] = None
        self.api_key: Optional[str] = None
        self.client_code: Optional[str] = None
        self.feed_token: Optional[str] = None
        self.last_tick_time: Optional[float] = None
        self.last_packet_time: Optional[float] = None

        # Token lifecycle tracking
        self.token_created_at: Optional[float] = None
        self.token_lifespan_seconds: float = 86400.0  # 24 hours standard SmartAPI session
        
        # Phase 12 & 14 segregated tick counters
        self.authentic_ticks_count: int = 0
        self.synthetic_ticks_count: int = 0
        self.replay_ticks_count: int = 0
        self.test_ticks_count: int = 0
        self.stale_ticks_count: int = 0
        self.ticks_rejected: int = 0

        # Sequence and ordering tracking
        self.token_last_sequence: Dict[str, int] = {}
        self.token_last_timestamp: Dict[str, float] = {}
        self.duplicate_ticks_count: int = 0
        self.out_of_order_ticks_count: int = 0

        # Heartbeat & subscription monitoring
        self.last_ping_time: Optional[float] = None
        self.last_pong_time: Optional[float] = None
        self.subscription_acknowledged: bool = False

        # Backoff reconnection state
        self.reconnect_attempts: int = 0
        self.max_reconnect_attempts: int = 5
        self.base_backoff_seconds: float = 2.0
        self.max_backoff_seconds: float = 32.0

        # Safety execution mode
        self.execution_mode: str = "PAPER"

        self.feed_status: str = "DISCONNECTED"
        self.provider: str = "SYNTHETIC_RANDOM_WALK"
        self.subscribed_tokens: List[str] = []
        self.token_symbol_map: Dict[str, str] = {}
        self.token_meta_map: Dict[str, Dict[str, Any]] = {}
        self.last_error: Optional[str] = None

    @property
    def ticks_received(self) -> int:
        """Backward-compatible alias for authentic ticks received."""
        with self._lock:
            return self.authentic_ticks_count

    @ticks_received.setter
    def ticks_received(self, val: int) -> None:
        with self._lock:
            self.authentic_ticks_count = val

    def get_next_backoff_delay(self, jitter: bool = False, max_jitter: float = 0.5) -> float:
        """Calculates bounded exponential backoff delay (2s, 4s, 8s, 16s, 32s) with optional bounded jitter."""
        with self._lock:
            if self.reconnect_attempts >= self.max_reconnect_attempts:
                return -1.0  # Max retries exceeded
            delay = min(self.base_backoff_seconds * (2 ** self.reconnect_attempts), self.max_backoff_seconds)
            if jitter:
                import random
                delay = min(delay + random.uniform(0.05, max_jitter), self.max_backoff_seconds)
            return round(delay, 2)

    def record_reconnect_attempt(self, error: Any = None, jitter: bool = False) -> float:
        """
        Increments attempt count and returns backoff delay.
        If error is classified as fatal, immediately halts retries and enters FATAL_AUTH_ERROR state.
        If max attempts reached, enters MAX_RETRIES_EXCEEDED state.
        Transitions feed_status to RECONNECTING when a reconnection attempt is scheduled.
        """
        with self._lock:
            if error is not None:
                classification = self.classify_auth_error(error)
                if classification.get("is_fatal"):
                    self.reconnect_attempts = self.max_reconnect_attempts
                    self.feed_status = "FATAL_AUTH_ERROR"
                    self.last_error = classification.get("human_description", str(error)[:120])
                    return -1.0

            delay = self.get_next_backoff_delay(jitter=jitter)
            if delay > 0:
                self.reconnect_attempts += 1
                self.feed_status = "RECONNECTING"
            else:
                self.feed_status = "MAX_RETRIES_EXCEEDED"
            return delay

    def reset_reconnect_state(self) -> None:
        """Resets reconnection attempt count on successful authentication."""
        with self._lock:
            self.reconnect_attempts = 0

    def is_token_expired(self) -> bool:
        """
        Explicitly determines if the active session token has expired or is absent.
        Enforces both maximum lifespan (24h) and Angel One's daily 06:00 AM IST reset boundary.
        """
        with self._lock:
            if not self.auth_token:
                return True
            if not self.token_created_at:
                return False
            now = time.time()
            if (now - self.token_created_at) >= self.token_lifespan_seconds:
                return True

            # Angel One SmartAPI daily session reset at 06:00 AM IST
            token_dt = datetime.fromtimestamp(self.token_created_at, tz=IST)
            now_dt = datetime.fromtimestamp(now, tz=IST)
            today_reset = now_dt.replace(hour=6, minute=0, second=0, microsecond=0)
            if now_dt >= today_reset and token_dt < today_reset:
                return True

            return False

    def mark_token_expired(self, reason: str = "SESSION_EXPIRED") -> None:
        """Explicitly transitions connection and authentication state to TOKEN_EXPIRED."""
        with self._lock:
            self.is_authenticated = False
            self.is_connected = False
            self.feed_status = "TOKEN_EXPIRED"
            self.last_error = reason

    def is_heartbeat_alive(self, max_silent_seconds: float = 30.0) -> bool:
        """Checks whether the WebSocket connection is actively receiving ping/pong responses."""
        with self._lock:
            if not self.is_connected:
                return False
            now = time.time()
            if self.last_pong_time:
                return (now - self.last_pong_time) <= max_silent_seconds
            if self.last_ping_time:
                return (now - self.last_ping_time) <= max_silent_seconds
            return True

    def resubscribe(self, mode: int = 1, correlation_id: str = "chintu_resub") -> Dict[str, Any]:
        """
        Explicitly re-arms subscriptions for all active bot instruments on the active WebSocket connection.
        Safe to call following reconnection or dynamic instrument master reload.
        """
        with self._lock:
            return self.subscribe_active_tokens(mode=mode, correlation_id=correlation_id)

    def record_synthetic_tick(self, count_or_data: Any = 1) -> None:
        """Records synthetic simulation tick."""
        cnt = count_or_data if isinstance(count_or_data, int) else 1
        self.synthetic_ticks_count += cnt

    def record_replay_tick(self, count_or_data: Any = 1) -> None:
        """Records tick generated during market data historical replay."""
        cnt = count_or_data if isinstance(count_or_data, int) else 1
        self.replay_ticks_count += cnt

    def record_test_tick(self, count_or_data: Any = 1) -> None:
        """Records tick generated during unit or integration testing."""
        cnt = count_or_data if isinstance(count_or_data, int) else 1
        self.test_ticks_count += cnt

    def record_heartbeat_ping(self) -> None:
        """Records outgoing heartbeat ping timestamp."""
        self.last_ping_time = time.time()

    def record_heartbeat_pong(self) -> None:
        """Records incoming heartbeat pong timestamp."""
        self.last_pong_time = time.time()

    @property
    def heartbeat_latency_ms(self) -> float:
        """Calculates round-trip heartbeat latency in milliseconds."""
        if self.last_ping_time and self.last_pong_time and self.last_pong_time >= self.last_ping_time:
            return round((self.last_pong_time - self.last_ping_time) * 1000.0, 2)
        return 0.0

    def record_subscription_ack(self, status: Any = True) -> None:
        """Records subscription acknowledgment status from SmartWebSocketV2."""
        if isinstance(status, dict):
            self.subscription_acknowledged = bool(status.get("status") in (True, "SUCCESS", 1))
        else:
            self.subscription_acknowledged = bool(status)

    def initialize_from_env(self) -> Dict[str, Any]:
        """
        Securely loads Angel One credentials from supported sources (env / .env / sqlite).
        Never logs secrets. Returns sanitized status dict.
        """
        from server.python_stream_server import load_and_verify_angel_one_credentials
        diag = load_and_verify_angel_one_credentials()
        return diag

    def get_credential_status(self) -> Dict[str, Any]:
        """Returns sanitized status of Angel One credentials without exposing secrets."""
        diag = self.initialize_from_env()
        present = diag.get("credentials_present", {})
        return {
            "status": diag.get("status", "UNKNOWN"),
            "has_api_key": bool(present.get("ANGEL_API_KEY", False)),
            "has_client_id": bool(present.get("ANGEL_CLIENT_ID", False)),
            "has_pin": bool(present.get("ANGEL_PIN", False)),
            "has_totp_secret": bool(present.get("ANGEL_TOTP_SECRET", False)),
            "missing_configurations": diag.get("missing_configurations", []),
            "sources_inspected": diag.get("sources_inspected", [])
        }

    def build_token_list_for_subscription(self) -> List[Dict[str, Any]]:
        """
        Assembles token lists organized by exchangeType for SmartWebSocketV2.subscribe().
        Uses DynamicInstrumentMaster to resolve active contracts for all 14 bots.
        Guarantees that expired 2024 contracts are never subscribed.
        """
        from server.bot_registry import CANONICAL_BOT_REGISTRY
        from server.instrument_master import instrument_master

        with self._lock:
            instrument_master.ensure_loaded()
            self.token_symbol_map.clear()
            self.token_meta_map.clear()

            exchange_groups: Dict[int, List[str]] = {
                1: [],   # nse_cm
                2: [],   # nse_fo
                3: [],   # bse_cm
                4: [],   # bse_fo
                5: [],   # mcx_fo
                13: []   # cde_fo
            }

            for b_id, bot in CANONICAL_BOT_REGISTRY.items():
                audit = instrument_master.audit_bot_mapping(bot)
                resolved = audit.get("resolved_contract")
                if not resolved or not audit.get("is_tradable"):
                    continue

                token = str(resolved.get("token") or "").strip()
                exch_seg = str(resolved.get("exch_seg") or "").upper().strip()
                symbol = resolved.get("symbol") or bot["asset"]

                etype = EXCHANGE_TYPE_MAP.get(exch_seg)
                if not etype or not token:
                    continue

                if token not in exchange_groups[etype]:
                    exchange_groups[etype].append(token)

                self.token_symbol_map[token] = bot["asset"]
                self.token_meta_map[token] = {
                    "bot_id": b_id,
                    "asset": bot["asset"],
                    "symbol": symbol,
                    "exchange": exch_seg,
                    "exchange_type": etype,
                    "lotsize": resolved.get("lotsize", 1),
                    "is_derivative": audit.get("status") == "EXPIRED_CONTRACT_RESOLVED"
                }

            token_list = [
                {"exchangeType": etype, "tokens": tokens}
                for etype, tokens in sorted(exchange_groups.items())
                if len(tokens) > 0
            ]
            self.subscribed_tokens = [tok for group in token_list for tok in group["tokens"]]
            return token_list

    def decode_binary_packet(self, binary_data: bytes) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Authoritative SmartWebSocketV2 binary packet decoder.
        Decodes authentic Little-Endian binary stream packets according to official Angel One specifications:
        Offset 0: subscription_mode (B, 1 byte)
        Offset 1: exchange_type (B, 1 byte)
        Offset 2..27: token (25 bytes null-terminated ASCII)
        Offset 27..35: sequence_number (q, int64)
        Offset 35..43: exchange_timestamp (q, int64 ms)
        Offset 43..51: last_traded_price (q, int64)
        Mode 2 (QUOTE) / Mode 3 (SNAP_QUOTE):
        Offset 51..59: last_traded_quantity (q)
        Offset 59..67: average_traded_price (q)
        Offset 67..75: volume_trade_for_the_day (q)
        Offset 75..83: total_buy_quantity (d)
        Offset 83..91: total_sell_quantity (d)
        Offset 91..99: open_price_of_the_day (q)
        Offset 99..107: high_price_of_the_day (q)
        Offset 107..115: low_price_of_the_day (q)
        Offset 115..123: closed_price (q)
        Mode 3 (SNAP_QUOTE):
        Offset 123..131: last_traded_timestamp (q)
        Offset 131..139: open_interest (q)
        Offset 139..147: open_interest_change_percentage (q)

        Applies exchange-aware price scaling:
        - ExchangeType 13 (CDS / Currency Derivatives): If raw price >= 100,000, scales by 10,000,000.0 (10^7). Otherwise scales by 100.0.
        - NSE/BSE/NFO/BFO/MCX: Scales by 100.0 (paise to INR).
        """
        if not isinstance(binary_data, (bytes, bytearray)):
            return False, "INVALID_BINARY_TYPE", None

        if len(binary_data) < 51:
            self.ticks_rejected += 1
            return False, f"TRUNCATED_PACKET_LENGTH: {len(binary_data)} bytes (minimum 51 required)", None

        try:
            sub_mode = struct.unpack("<B", binary_data[0:1])[0]
            exch_type = struct.unpack("<B", binary_data[1:2])[0]

            # Parse token (25 bytes null-terminated)
            raw_token = binary_data[2:27]
            token = ""
            for b in raw_token:
                if b == 0:
                    break
                token += chr(b)
            token = token.strip()

            seq_num = struct.unpack("<q", binary_data[27:35])[0]
            exch_ts_ms = struct.unpack("<q", binary_data[35:43])[0]
            raw_ltp = struct.unpack("<q", binary_data[43:51])[0]

            # Exchange-aware price scaling
            if exch_type == 13:  # CDS Currency Derivatives
                if abs(raw_ltp) >= 100000:
                    scaled_price = round(float(raw_ltp) / 10000000.0, 4)
                else:
                    scaled_price = round(float(raw_ltp) / 100.0, 4)
            else:
                scaled_price = round(float(raw_ltp) / 100.0, 2)

            mode_names = {1: "LTP", 2: "QUOTE", 3: "SNAP_QUOTE"}
            exch_names = {1: "NSE_CM", 2: "NSE_FO", 3: "BSE_CM", 4: "BSE_FO", 5: "MCX_FO", 13: "CDS"}

            parsed = {
                "subscription_mode": sub_mode,
                "mode_name": mode_names.get(sub_mode, f"MODE_{sub_mode}"),
                "exchange_type": exch_type,
                "exchange_segment": exch_names.get(exch_type, f"EXCH_{exch_type}"),
                "token": token,
                "sequence_number": seq_num,
                "exchange_timestamp": exch_ts_ms,
                "last_traded_price_raw": raw_ltp,
                "last_traded_price": scaled_price,
                "price": scaled_price,
                "packet_length": len(binary_data)
            }

            # Quote mode fields
            if sub_mode in [2, 3] and len(binary_data) >= 123:
                parsed["last_traded_quantity"] = struct.unpack("<q", binary_data[51:59])[0]
                avg_raw = struct.unpack("<q", binary_data[59:67])[0]
                parsed["average_traded_price"] = round(float(avg_raw) / 100.0, 2)
                vol_raw = struct.unpack("<q", binary_data[67:75])[0]
                parsed["volume_trade_for_the_day"] = vol_raw
                parsed["volume_traded_today"] = vol_raw
                parsed["total_buy_quantity"] = struct.unpack("<d", binary_data[75:83])[0]
                parsed["total_sell_quantity"] = struct.unpack("<d", binary_data[83:91])[0]
                o_raw = struct.unpack("<q", binary_data[91:99])[0]
                h_raw = struct.unpack("<q", binary_data[99:107])[0]
                l_raw = struct.unpack("<q", binary_data[107:115])[0]
                c_raw = struct.unpack("<q", binary_data[115:123])[0]
                parsed["open_price_of_the_day"] = round(float(o_raw) / 100.0, 2)
                parsed["open"] = parsed["open_price_of_the_day"]
                parsed["high_price_of_the_day"] = round(float(h_raw) / 100.0, 2)
                parsed["high"] = parsed["high_price_of_the_day"]
                parsed["low_price_of_the_day"] = round(float(l_raw) / 100.0, 2)
                parsed["low"] = parsed["low_price_of_the_day"]
                parsed["closed_price"] = round(float(c_raw) / 100.0, 2)
                parsed["close"] = parsed["closed_price"]

            # Snap Quote mode fields
            if sub_mode == 3 and len(binary_data) >= 379:
                parsed["last_traded_timestamp"] = struct.unpack("<q", binary_data[123:131])[0]
                parsed["open_interest"] = struct.unpack("<q", binary_data[131:139])[0]
                try:
                    oi_chg = struct.unpack("<d", binary_data[139:147])[0]
                except Exception:
                    oi_chg = float(struct.unpack("<q", binary_data[139:147])[0])
                parsed["open_interest_change_percentage"] = round(float(oi_chg), 2)

            return True, "SUCCESS", parsed
        except Exception as e:
            self.ticks_rejected += 1
            return False, f"BINARY_DECODE_EXCEPTION: {str(e)}", None

    def handle_binary_packet(self, binary_data: bytes) -> Tuple[bool, str]:
        """
        Decodes and ingests authentic binary packet directly from SmartWebSocketV2.
        Enforces binary format validation, price scaling, freshness checks, and PAPER routing.
        """
        ok, msg, parsed = self.decode_binary_packet(binary_data)
        if not ok or not parsed:
            self.ticks_rejected += 1
            return False, f"PACKET_DECODE_FAILED: {msg}"

        return self.handle_binary_tick(parsed)

    def handle_binary_tick(self, parsed_data: Any) -> Tuple[bool, str]:
        """
        Ingests parsed binary tick or raw binary packet from SmartWebSocketV2.
        Validates freshness, maps token to symbol, rejects non-finite, out-of-order, or duplicate ticks,
        and fans out to BotScheduler.
        Strictly enforces PAPER execution mode.
        """
        # Strict PAPER mode invariant
        assert self.execution_mode == "PAPER", "CRITICAL SAFETY VIOLATION: Execution mode must be PAPER"

        if isinstance(parsed_data, (bytes, bytearray)):
            return self.handle_binary_packet(parsed_data)

        if not isinstance(parsed_data, dict):
            with self._lock:
                self.ticks_rejected += 1
            return False, "INVALID_DATA_TYPE"

        now = time.time()
        token = str(parsed_data.get("token") or "").strip()
        last_price_raw = parsed_data.get("last_traded_price", 0)
        exch_ts_ms = parsed_data.get("exchange_timestamp", 0)
        exch_type = parsed_data.get("exchange_type", 1)

        # Apply price scaling: use pre-scaled price if present, else apply exchange-aware scale
        if "price" in parsed_data and parsed_data["price"] is not None:
            try:
                price = float(parsed_data["price"])
            except (ValueError, TypeError):
                with self._lock:
                    self.ticks_rejected += 1
                return False, "INVALID_PRICE"
        else:
            try:
                if exch_type == 13:
                    if abs(last_price_raw) >= 100000:
                        price = round(float(last_price_raw) / 10000000.0, 4)
                    else:
                        price = round(float(last_price_raw) / 100.0, 4)
                else:
                    price = float(last_price_raw) / 100.0 if last_price_raw > 0 else 0.0
            except (ValueError, TypeError):
                with self._lock:
                    self.ticks_rejected += 1
                return False, "INVALID_PRICE"

        if not math.isfinite(price) or price <= 0:
            with self._lock:
                self.ticks_rejected += 1
            return False, "INVALID_PRICE"

        # Validate volume
        raw_vol = parsed_data.get("last_traded_quantity", 1)
        try:
            vol = float(raw_vol) if raw_vol is not None else 1.0
            if not math.isfinite(vol) or vol < 0:
                vol = 1.0
        except (ValueError, TypeError):
            vol = 1.0

        # Check timestamp freshness & finiteness
        try:
            numeric_ts = float(exch_ts_ms)
            if not math.isfinite(numeric_ts):
                with self._lock:
                    self.ticks_rejected += 1
                return False, "INVALID_TIMESTAMP"
            tick_time = (numeric_ts / 1000.0) if numeric_ts > 0 else now
        except (ValueError, TypeError):
            tick_time = now

        if tick_time > now + 5.0:
            with self._lock:
                self.ticks_rejected += 1
            return False, "FUTURE_TIMESTAMP"

        if (now - tick_time) > 15.0:
            with self._lock:
                self.ticks_rejected += 1
                self.stale_ticks_count += 1
            return False, "STALE_TICK"

        with self._lock:
            # Map token to symbol
            sym = self.token_symbol_map.get(token)
            if not sym:
                self.ticks_rejected += 1
                return False, "UNKNOWN_TOKEN"

            # Check sequence numbers: detect duplicates and out-of-order delivery
            seq = parsed_data.get("sequence_number")
            if seq is not None and isinstance(seq, int) and seq > 0:
                last_seq = self.token_last_sequence.get(token)
                if last_seq is not None:
                    if seq == last_seq:
                        self.ticks_rejected += 1
                        self.duplicate_ticks_count += 1
                        return False, "DUPLICATE_TICK_SEQUENCE"
                    elif seq < last_seq:
                        self.ticks_rejected += 1
                        self.out_of_order_ticks_count += 1
                        return False, "OUT_OF_ORDER_SEQUENCE"
                self.token_last_sequence[token] = seq

            # Check exchange timestamp monotonicity per token
            if numeric_ts > 0:
                last_ts = self.token_last_timestamp.get(token, 0.0)
                if tick_time < (last_ts - 1.0):
                    self.ticks_rejected += 1
                    self.out_of_order_ticks_count += 1
                    return False, "OUT_OF_ORDER_TIMESTAMP"
                self.token_last_timestamp[token] = tick_time

        # Ingest authentic tick to BotScheduler
        try:
            from server.bot_scheduler import bot_scheduler
            iso_ts = datetime.fromtimestamp(tick_time, tz=IST).strftime("%Y-%m-%d %H:%M:%S")
            bot_scheduler.ingest_tick(
                symbol=sym,
                price=price,
                volume=vol,
                is_authentic=True,
                timestamp=iso_ts
            )
            with self._lock:
                self.authentic_ticks_count += 1
                self.last_tick_time = now
                self.feed_status = "AUTHENTIC_SMARTAPI"
            return True, "SUCCESS"
        except Exception as e:
            with self._lock:
                self.ticks_rejected += 1
            return False, f"INGEST_ERROR: {str(e)}"

    def get_feed_health(self) -> Dict[str, Any]:
        """Returns comprehensive feed health status with zero exposed secrets."""
        with self._lock:
            now = time.time()
            is_fresh = False
            latency_s = None

            last_t = self.last_tick_time or getattr(self, "last_packet_time", None)
            if last_t:
                age_s = now - last_t
                latency_s = round(age_s, 2)
                is_fresh = age_s <= 15.0

            is_hb_healthy = True
            if self.is_connected and self.last_pong_time:
                is_hb_healthy = (now - self.last_pong_time) <= 30.0

            session = InstrumentAuditor.get_market_session_state()

            current_status = self.feed_status
            if self.is_connected and last_t and not is_fresh:
                current_status = "STALE_FEED"

            token_age = round(now - self.token_created_at, 2) if self.token_created_at else None

            return {
                "status": current_status,
                "feed_status": current_status,
                "is_stale": not is_fresh if last_t else False,
                "provider": self.provider,
                "is_connected": self.is_connected,
                "is_authenticated": self.is_authenticated,
                "execution_mode": self.execution_mode,
                "is_fresh": is_fresh,
                "latency_seconds": latency_s,
                "last_tick_timestamp": datetime.fromtimestamp(self.last_tick_time, tz=IST).isoformat() if self.last_tick_time else None,
                "authentic_ticks_count": self.authentic_ticks_count,
                "synthetic_ticks_count": self.synthetic_ticks_count,
                "replay_ticks_count": self.replay_ticks_count,
                "test_ticks_count": self.test_ticks_count,
                "stale_ticks_count": self.stale_ticks_count,
                "ticks_received_count": self.authentic_ticks_count,
                "ticks_rejected_count": self.ticks_rejected,
                "duplicate_ticks_count": self.duplicate_ticks_count,
                "out_of_order_ticks_count": self.out_of_order_ticks_count,
                "reconnect_attempts": self.reconnect_attempts,
                "is_token_expired": self.is_token_expired(),
                "token_age_seconds": token_age,
                "subscribed_tokens_count": len(self.subscribed_tokens),
                "subscribed_tokens": list(self.subscribed_tokens),
                "subscription_acknowledged": self.subscription_acknowledged,
                "heartbeat_healthy": is_hb_healthy,
                "last_ping_timestamp": datetime.fromtimestamp(self.last_ping_time, tz=IST).isoformat() if self.last_ping_time else None,
                "last_pong_timestamp": datetime.fromtimestamp(self.last_pong_time, tz=IST).isoformat() if self.last_pong_time else None,
                "market_session": session,
                "last_error": self.last_error
            }

    @staticmethod
    def classify_auth_error(error_info: Any) -> Dict[str, Any]:
        """
        Classifies Angel One SmartAPI error codes and messages into actionable categories.
        Guarantees zero leakage of credentials, PINs, or tokens.
        """
        err_str = str(error_info or "").strip()
        code = ""
        import re
        match = re.search(r'\b(AB\d{4}|AG\d{4})\b', err_str, re.IGNORECASE)
        if match:
            code = match.group(1).upper()
        elif isinstance(error_info, dict) and "errorcode" in error_info:
            code = str(error_info["errorcode"]).upper()

        if code == "AB1004" or "ip mismatch" in err_str.lower() or "client public ip" in err_str.lower():
            return {
                "error_code": "AB1004",
                "category": "STATIC_IP_OR_KEY_MISMATCH",
                "human_description": "Invalid API key or Client Public IP mismatch with registered IP on SmartAPI Developer Console.",
                "remediation": "Check that the API key is correct and that either your current public IP is whitelisted on smartapi.angelbroking.com or Static IP binding is disabled for this key.",
                "is_fatal": True,
                "requires_totp_reauth": False
            }
        elif code == "AB1005" or "unauthorized" in err_str.lower() or "access denied" in err_str.lower():
            return {
                "error_code": "AB1005",
                "category": "UNAUTHORIZED_OR_BLOCKED",
                "human_description": "Unauthorized request or account blocked.",
                "remediation": "Verify account active status with Angel One support and ensure trading permissions are enabled.",
                "is_fatal": True,
                "requires_totp_reauth": True
            }
        elif code == "AB1010" or "invalid totp" in err_str.lower() or "invalid pin" in err_str.lower() or "login failed" in err_str.lower():
            return {
                "error_code": "AB1010",
                "category": "INVALID_CREDENTIALS_OR_TOTP",
                "human_description": "Authentication failure: Client ID, PIN, or TOTP secret is incorrect.",
                "remediation": "Re-verify ANGEL_CLIENT_ID, ANGEL_PIN, and ANGEL_TOTP_SECRET. Ensure system clock is synced with NTP for valid TOTP generation.",
                "is_fatal": True,
                "requires_totp_reauth": True
            }
        elif code == "AB1012" or "token expired" in err_str.lower() or "session expired" in err_str.lower():
            return {
                "error_code": "AB1012",
                "category": "TOKEN_EXPIRED",
                "human_description": "JWT Access Token or Session Token has expired.",
                "remediation": "Refresh tokens via generateToken(refreshToken) or perform fresh login with TOTP.",
                "is_fatal": False,
                "requires_totp_reauth": True
            }
        elif code == "AB2001" or "rate limit" in err_str.lower():
            return {
                "error_code": "AB2001",
                "category": "RATE_LIMIT_EXCEEDED",
                "human_description": "SmartAPI request rate limit exceeded.",
                "remediation": "Back off request frequency and wait for the rate limit window to reset.",
                "is_fatal": False,
                "requires_totp_reauth": False
            }
        elif code == "AG8001" or "broker service" in err_str.lower() or "internal error" in err_str.lower():
            return {
                "error_code": "AG8001",
                "category": "BROKER_SERVICE_ERROR",
                "human_description": "Angel One backend service error or scheduled maintenance.",
                "remediation": "Retry after backoff delay. Check Angel One developer portal for scheduled maintenance.",
                "is_fatal": False,
                "requires_totp_reauth": False
            }
        elif "missing" in err_str.lower() or "not configured" in err_str.lower():
            return {
                "error_code": "MISSING_CREDENTIALS",
                "category": "MISSING_CONFIGURATION",
                "human_description": "One or more required SmartAPI credentials are not configured in environment.",
                "remediation": "Set ANGEL_API_KEY, ANGEL_CLIENT_ID, ANGEL_PIN, and ANGEL_TOTP_SECRET securely.",
                "is_fatal": True,
                "requires_totp_reauth": True
            }
        else:
            return {
                "error_code": code or "UNKNOWN_ERROR",
                "category": "GENERIC_ERROR",
                "human_description": f"Encountered SmartAPI error: {err_str[:120]}",
                "remediation": "Inspect sanitized application logs and check network connectivity.",
                "is_fatal": False,
                "requires_totp_reauth": False
            }

    def refresh_session_tokens(self, smart_connect: Any, refresh_token: str) -> Dict[str, Any]:
        """
        Safely renews SmartAPI JWT accessToken and feedToken using refreshToken without requiring TOTP.
        Guarantees zero secret exposure in logs and return values.
        """
        if not smart_connect:
            return {
                "success": False,
                "status": "NO_SMARTCONNECT_INSTANCE",
                "error": "SmartConnect instance is None"
            }
        if not refresh_token or not isinstance(refresh_token, str):
            return {
                "success": False,
                "status": "INVALID_REFRESH_TOKEN",
                "error": "Refresh token must be a non-empty string"
            }

        with self._lock:
            try:
                resp = smart_connect.generateToken(refresh_token)
                if isinstance(resp, dict) and resp.get("status") is True:
                    data = resp.get("data") or {}
                    new_jwt = data.get("jwtToken")
                    new_feed = data.get("feedToken")
                    if new_jwt:
                        self.auth_token = "Bearer " + new_jwt if not new_jwt.startswith("Bearer ") else new_jwt
                    if new_feed:
                        self.feed_token = new_feed
                    self.is_authenticated = True
                    self.token_created_at = time.time()
                    self.feed_status = "TOKEN_REFRESHED"

                    # Synchronize server broker_state if imported
                    try:
                        import server.python_stream_server as pss
                        if "angel_one" in pss.broker_state:
                            if new_jwt:
                                pss.broker_state["angel_one"]["jwtToken"] = new_jwt
                            if new_feed:
                                pss.broker_state["angel_one"]["feedToken"] = new_feed
                            pss.broker_state["angel_one"]["connected"] = True
                    except Exception:
                        pass

                    return {
                        "success": True,
                        "status": "TOKEN_REFRESHED",
                        "has_jwt": bool(new_jwt),
                        "has_feed_token": bool(new_feed),
                        "timestamp": datetime.now(IST).isoformat()
                    }
                else:
                    err_msg = resp.get("message", "Token refresh returned status False") if isinstance(resp, dict) else "Unknown response"
                    err_code = resp.get("errorcode", "") if isinstance(resp, dict) else ""
                    classification = self.classify_auth_error(f"{err_code} {err_msg}")
                    self.last_error = classification["human_description"]
                    return {
                        "success": False,
                        "status": "TOKEN_REFRESH_FAILED",
                        "error_classification": classification
                    }
            except Exception as e:
                classification = self.classify_auth_error(str(e))
                self.last_error = classification["human_description"]
                return {
                    "success": False,
                    "status": "EXCEPTION",
                    "error_classification": classification
                }

    def connect_websocket(
        self,
        auth_token: str,
        api_key: str,
        client_code: str,
        feed_token: str,
        correlation_id: str = "chintu_paper_stream",
        mode: int = 1,
        run_in_background: bool = True
    ) -> Dict[str, Any]:
        """
        Establishes authentic WebSocket connection using SmartWebSocketV2.
        Enforces:
        - Strict execution_mode == 'PAPER' invariant
        - Background thread isolation to avoid blocking event loops
        - Automatic subscription to all 14 bot instruments via DynamicInstrumentMaster
        - Thread-safe concurrency synchronization
        - Zero secret exposure
        """
        assert self.execution_mode == "PAPER", "CRITICAL SAFETY VIOLATION: Execution mode must be PAPER"

        with self._lock:
            if not SmartWebSocketV2:
                self.last_error = "SmartWebSocketV2 SDK not available in environment"
                return {"status": "SDK_UNAVAILABLE", "is_connected": False, "error": self.last_error}

            if not all([auth_token, api_key, client_code, feed_token]):
                self.last_error = "Missing required WebSocket connection parameters"
                return {"status": "MISSING_PARAMETERS", "is_connected": False, "error": self.last_error}

            self.auth_token = auth_token
            self.api_key = api_key
            self.client_code = client_code
            self.feed_token = feed_token
            self.token_created_at = time.time()

            # Disconnect existing connection if open
            if self.ws:
                self.disconnect_websocket()

            try:
                bearer_token = auth_token if auth_token.startswith("Bearer ") else f"Bearer {auth_token}"

                sws = SmartWebSocketV2(
                    auth_token=bearer_token,
                    api_key=api_key,
                    client_code=client_code,
                    feed_token=feed_token,
                    max_retry_attempt=self.max_reconnect_attempts
                )

                # Wire callbacks
                def on_open_handler(wsapp):
                    with self._lock:
                        self.is_connected = True
                        self.feed_status = "CONNECTED"
                        self.provider = "AUTHENTIC_SMARTAPI"
                        self.reset_reconnect_state()
                        token_list = self.build_token_list_for_subscription()
                    if token_list and hasattr(sws, "subscribe"):
                        try:
                            sws.subscribe(correlation_id=correlation_id, mode=mode, token_list=token_list)
                            with self._lock:
                                self.subscription_acknowledged = True
                        except Exception as sub_err:
                            with self._lock:
                                self.last_error = f"Subscription error: {str(sub_err)[:100]}"

                def on_data_handler(wsapp, data):
                    with self._lock:
                        self.last_packet_time = time.time()
                    self.handle_binary_tick(data)

                def on_error_handler(wsapp, error):
                    err_text = str(error)
                    with self._lock:
                        self.last_error = err_text[:120]
                        self.is_connected = False
                        classification = self.classify_auth_error(error)
                        if classification.get("is_fatal"):
                            self.feed_status = "FATAL_AUTH_ERROR"
                            self.reconnect_attempts = self.max_reconnect_attempts
                        else:
                            self.record_reconnect_attempt(error)

                def on_close_handler(wsapp):
                    with self._lock:
                        self.is_connected = False
                        self.feed_status = "DISCONNECTED"

                sws.on_open = on_open_handler
                sws.on_data = on_data_handler
                sws.on_error = on_error_handler
                sws.on_close = on_close_handler

                self.ws = sws

                if run_in_background:
                    t = threading.Thread(target=sws.connect, daemon=True, name="AngelWebSocketThread")
                    self.ws_thread = t
                    t.start()
                    return {
                        "status": "CONNECTING_BACKGROUND",
                        "is_connected": False,
                        "provider": "AUTHENTIC_SMARTAPI",
                        "execution_mode": "PAPER"
                    }
                else:
                    sws.connect()
                    return {
                        "status": "CONNECTED",
                        "is_connected": self.is_connected,
                        "provider": "AUTHENTIC_SMARTAPI",
                        "execution_mode": "PAPER"
                    }

            except Exception as e:
                classification = self.classify_auth_error(str(e))
                self.last_error = classification["human_description"]
                self.is_connected = False
                self.feed_status = "CONNECTION_FAILED"
                return {
                    "status": "CONNECTION_FAILED",
                    "is_connected": False,
                    "error_classification": classification
                }

    def disconnect_websocket(self) -> Dict[str, Any]:
        """Safely shuts down authentic WebSocket connection and resets connection flags."""
        with self._lock:
            if self.ws:
                try:
                    if hasattr(self.ws, "close_connection"):
                        self.ws.close_connection()
                except Exception as e:
                    self.last_error = f"Close exception: {str(e)[:100]}"
                self.ws = None

            self.is_connected = False
            self.feed_status = "DISCONNECTED"
            self.subscription_acknowledged = False
            self.ws_thread = None
            return {"status": "DISCONNECTED", "is_connected": False}

    def subscribe_active_tokens(self, mode: int = 1, correlation_id: str = "chintu_sub") -> Dict[str, Any]:
        """
        Subscribes all 14 active bot instruments to SmartWebSocketV2.
        Organizes tokens by official exchangeType (1=NSE, 2=NFO, 3=BSE, 4=BFO, 5=MCX, 13=CDS).
        """
        with self._lock:
            token_list = self.build_token_list_for_subscription()
            total_tokens = sum(len(group.get("tokens", [])) for group in token_list)

            if self.ws and self.is_connected and hasattr(self.ws, "subscribe"):
                try:
                    self.ws.subscribe(correlation_id=correlation_id, mode=mode, token_list=token_list)
                    self.subscription_acknowledged = True
                    return {
                        "success": True,
                        "status": "SUBSCRIBED",
                        "tokens_subscribed": total_tokens,
                        "groups": token_list
                    }
                except Exception as e:
                    self.last_error = f"Subscribe call failed: {str(e)[:100]}"
                    return {
                        "success": False,
                        "status": "SUBSCRIBE_FAILED",
                        "error": self.last_error
                    }

            return {
                "success": False,
                "status": "NOT_CONNECTED",
                "tokens_prepared": total_tokens,
                "groups": token_list
            }


# Global singleton instance
angel_feed_manager = AngelOneWebSocketManager()

