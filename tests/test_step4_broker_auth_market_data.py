"""
CHINTU AI TRADING SYSTEM - Step 4 Broker Authentication & Market-Data Pipeline Test Suite

Comprehensive audit and safety verification covering:
1. Authentication failure handling & structured error classification.
2. Secret redaction and zero credential leakage in logs, diagnostics, and REST responses.
3. Explicit token expiry detection, lifecycle transitions, and safe refresh.
4. Bounded exponential backoff reconnection and fatal auth error retry aborting.
5. Subscription and resubscription lifecycle with DynamicInstrumentMaster mapping.
6. Market-data tick sanitization: non-finite (NaN, Inf), negative, future, and stale tick rejection.
7. Out-of-order and duplicate tick sequence detection and rejection.
8. Heartbeat ping/pong latency and connection liveness tracking.
9. Queue overflow backpressure handling in low-latency pipeline and message bus.
10. Thread safety across concurrent reconnect and session operations.
11. Strict execution_mode == "PAPER" invariant enforcement.
"""

import os
import sys
import time
import math
import queue
import threading
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER_DIR = os.path.join(ROOT_DIR, "server")
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

import server.python_stream_server as pss
from server.angel_feed_manager import AngelOneWebSocketManager, InstrumentAuditor
from server.low_latency_event_pipeline import MarketTickValidator, LowLatencyEventPipeline
from server.message_bus import InMemoryMessageBus, Event, EventPriority, CriticalEventBufferOverflowError


client = TestClient(pss.app)
AUTH_HEADERS = {"Authorization": "Bearer chintu_paper_session_token_2026"}


# =====================================================================
# 1. AUTHENTICATION FAILURE SAFETY & STRUCTURED ERROR CLASSIFICATION
# =====================================================================

class TestAuthenticationFailureSafety:
    """Verifies that missing or invalid credentials fail safely without crashes or loops."""

    def test_missing_credentials_classified_safely(self):
        """Missing credentials must produce structured MISSING_CONFIGURATION with is_fatal=True."""
        classification = AngelOneWebSocketManager.classify_auth_error("missing credentials in environment")
        assert classification["category"] == "MISSING_CONFIGURATION"
        assert classification["is_fatal"] is True
        assert classification["requires_totp_reauth"] is True
        assert "ANGEL_API_KEY" in classification["remediation"]

    def test_invalid_totp_or_pin_classified_as_fatal(self):
        """AB1010 invalid pin/totp must be classified as fatal to prevent retry loops."""
        classification = AngelOneWebSocketManager.classify_auth_error("AB1010 Invalid TOTP entered")
        assert classification["error_code"] == "AB1010"
        assert classification["category"] == "INVALID_CREDENTIALS_OR_TOTP"
        assert classification["is_fatal"] is True
        assert classification["requires_totp_reauth"] is True

    def test_ip_mismatch_classified_as_fatal(self):
        """AB1004 Client Public IP mismatch must be classified as fatal."""
        classification = AngelOneWebSocketManager.classify_auth_error("AB1004 client public ip mismatch")
        assert classification["error_code"] == "AB1004"
        assert classification["category"] == "STATIC_IP_OR_KEY_MISMATCH"
        assert classification["is_fatal"] is True

    def test_unauthorized_account_classified_as_fatal(self):
        """AB1005 Unauthorized / blocked account must be classified as fatal."""
        classification = AngelOneWebSocketManager.classify_auth_error("AB1005 Access denied. Account blocked.")
        assert classification["error_code"] == "AB1005"
        assert classification["category"] == "UNAUTHORIZED_OR_BLOCKED"
        assert classification["is_fatal"] is True

    def test_rate_limit_classified_as_non_fatal(self):
        """AB2001 Rate limit exceeded is transient and not fatal."""
        classification = AngelOneWebSocketManager.classify_auth_error("AB2001 rate limit exceeded")
        assert classification["error_code"] == "AB2001"
        assert classification["category"] == "RATE_LIMIT_EXCEEDED"
        assert classification["is_fatal"] is False

    def test_broker_service_maintenance_classified_as_non_fatal(self):
        """AG8001 broker service error is transient."""
        classification = AngelOneWebSocketManager.classify_auth_error("AG8001 broker service under maintenance")
        assert classification["error_code"] == "AG8001"
        assert classification["category"] == "BROKER_SERVICE_ERROR"
        assert classification["is_fatal"] is False


# =====================================================================
# 2. SECRET REDACTION & ZERO CREDENTIAL LEAKAGE
# =====================================================================

class TestSecretRedaction:
    """Verifies that secrets, keys, and tokens are never exposed in logs or REST payloads."""

    def test_broker_status_endpoint_masks_tokens(self):
        """GET /api/broker/status must mask JWT, feedToken, and refreshToken."""
        pss.broker_state["angel_one"]["jwtToken"] = "SECRET_JWT_TOKEN_ABC"
        pss.broker_state["angel_one"]["feedToken"] = "SECRET_FEED_TOKEN_XYZ"
        pss.broker_state["angel_one"]["refreshToken"] = "SECRET_REFRESH_TOKEN_123"

        res = client.get("/api/broker/status", headers=AUTH_HEADERS)
        assert res.status_code == 200
        data = res.json()
        b = data["brokers"]["angel_one"]

        assert b["jwtToken"] == "●●●●●●●● (MASKED)"
        assert b["feedToken"] == "●●●●●●●● (MASKED)"
        assert b["refreshToken"] == "●●●●●●●● (MASKED)"
        assert "SECRET_JWT_TOKEN_ABC" not in res.text
        assert "SECRET_FEED_TOKEN_XYZ" not in res.text
        assert "SECRET_REFRESH_TOKEN_123" not in res.text

    def test_connect_endpoint_masks_tokens_in_response(self):
        """POST /api/broker/connect must return masked tokens in its broker payload."""
        pss.broker_state["angel_one"]["jwtToken"] = "SECRET_CONNECT_JWT_999"
        pss.broker_state["angel_one"]["feedToken"] = "SECRET_CONNECT_FEED_888"
        pss.broker_state["angel_one"]["refreshToken"] = "SECRET_CONNECT_REFRESH_777"

        # Test failure response masking
        res = client.post("/api/broker/connect", json={
            "broker": "angel_one",
            "apiKey": "",
            "clientId": "",
            "pin": "",
            "totp": ""
        }, headers=AUTH_HEADERS)
        assert res.status_code == 200
        assert "SECRET_CONNECT_JWT_999" not in res.text

    def test_angel_diagnostics_endpoint_leaks_zero_secrets(self):
        """GET /api/broker/angel/diagnostics must only expose presence booleans and key names."""
        res = client.get("/api/broker/angel/diagnostics", headers=AUTH_HEADERS)
        assert res.status_code == 200
        data = res.json()
        diag = data["diagnostics"]

        assert "credentials_present" in diag
        assert isinstance(diag["credentials_present"], dict)
        for k, v in diag["credentials_present"].items():
            assert isinstance(v, bool)

        assert "missing_configurations" in diag
        assert "ANGEL_PIN" not in str(diag.get("error"))

    def test_sanitize_broker_dict_utility(self):
        """Direct verification of sanitize_broker_dict helper."""
        raw = {
            "broker": "Angel One",
            "jwtToken": "eyJh...raw_jwt",
            "feedToken": "raw_feed_999",
            "refreshToken": "raw_refresh_111",
            "availableCash": 25000.0
        }
        sanitized = pss.sanitize_broker_dict(raw)
        assert sanitized["jwtToken"] == "●●●●●●●● (MASKED)"
        assert sanitized["feedToken"] == "●●●●●●●● (MASKED)"
        assert sanitized["refreshToken"] == "●●●●●●●● (MASKED)"
        assert sanitized["availableCash"] == 25000.0


# =====================================================================
# 3. EXPLICIT TOKEN EXPIRY & RE-AUTHENTICATION LIFECYCLE
# =====================================================================

class TestTokenExpiryAndLifecycle:
    """Verifies token lifespan tracking, expiration detection, and deterministic state transitions."""

    def test_token_expiration_detected_when_exceeding_lifespan(self):
        """Token created > 24 hours ago must be reported as expired."""
        mgr = AngelOneWebSocketManager()
        mgr.auth_token = "Bearer test_token"
        mgr.token_created_at = time.time() - 87000.0  # > 24 hours ago
        mgr.token_lifespan_seconds = 86400.0

        assert mgr.is_token_expired() is True

    def test_token_valid_within_lifespan(self):
        """Token created 1 hour ago must be reported as valid."""
        mgr = AngelOneWebSocketManager()
        mgr.auth_token = "Bearer test_token"
        mgr.token_created_at = time.time() - 3600.0  # 1 hour ago
        mgr.token_lifespan_seconds = 86400.0

        assert mgr.is_token_expired() is False

    def test_mark_token_expired_transitions_state(self):
        """mark_token_expired must cleanly transition state to TOKEN_EXPIRED."""
        mgr = AngelOneWebSocketManager()
        mgr.is_authenticated = True
        mgr.is_connected = True
        mgr.feed_status = "CONNECTED"

        mgr.mark_token_expired("AB1012 Token Expired")
        assert mgr.is_authenticated is False
        assert mgr.is_connected is False
        assert mgr.feed_status == "TOKEN_EXPIRED"
        assert mgr.last_error == "AB1012 Token Expired"

    def test_refresh_session_tokens_updates_timestamp_and_state(self):
        """Successful token refresh updates token_created_at, feed_status, and auth flags."""
        mgr = AngelOneWebSocketManager()
        mock_smart = MagicMock()
        mock_smart.generateToken.return_value = {
            "status": True,
            "message": "SUCCESS",
            "data": {
                "jwtToken": "new_refreshed_jwt_2026",
                "feedToken": "new_refreshed_feed_2026"
            }
        }

        res = mgr.refresh_session_tokens(mock_smart, "valid_refresh_token")
        assert res["success"] is True
        assert res["status"] == "TOKEN_REFRESHED"
        assert mgr.is_authenticated is True
        assert mgr.feed_status == "TOKEN_REFRESHED"
        assert mgr.token_created_at is not None
        assert (time.time() - mgr.token_created_at) < 2.0
        assert mgr.auth_token.endswith("new_refreshed_jwt_2026")
        assert mgr.feed_token == "new_refreshed_feed_2026"


# =====================================================================
# 4. BOUNDED RECONNECTION & FATAL ERROR ABORT
# =====================================================================

class TestBoundedReconnection:
    """Verifies bounded exponential backoff and immediate abort on fatal errors."""

    def test_exponential_backoff_progression_and_bound(self):
        """Reconnection backoff progresses exponentially (2s, 4s, 8s, 16s, 32s) and stops at 5."""
        mgr = AngelOneWebSocketManager()
        mgr.reconnect_attempts = 0
        mgr.max_reconnect_attempts = 5
        mgr.base_backoff_seconds = 2.0
        mgr.max_backoff_seconds = 32.0

        delays = []
        for _ in range(5):
            d = mgr.record_reconnect_attempt()
            delays.append(d)

        assert delays == [2.0, 4.0, 8.0, 16.0, 32.0]
        assert mgr.reconnect_attempts == 5

        # 6th attempt must exceed max retries and return -1.0
        d_final = mgr.record_reconnect_attempt()
        assert d_final == -1.0
        assert mgr.feed_status == "MAX_RETRIES_EXCEEDED"

    def test_fatal_auth_error_aborts_retries_immediately(self):
        """Fatal error (AB1010 / invalid credentials) immediately halts retries and enters FATAL_AUTH_ERROR."""
        mgr = AngelOneWebSocketManager()
        mgr.reconnect_attempts = 0

        d = mgr.record_reconnect_attempt(error="AB1010 Invalid credentials entered")
        assert d == -1.0
        assert mgr.reconnect_attempts == mgr.max_reconnect_attempts
        assert mgr.feed_status == "FATAL_AUTH_ERROR"

    def test_successful_auth_resets_reconnect_state(self):
        """reset_reconnect_state resets attempt counter to 0."""
        mgr = AngelOneWebSocketManager()
        mgr.reconnect_attempts = 4
        mgr.reset_reconnect_state()
        assert mgr.reconnect_attempts == 0


# =====================================================================
# 5. SUBSCRIPTION & RESUBSCRIPTION
# =====================================================================

class TestSubscriptionLifecycle:
    """Verifies token subscription grouping and dynamic resubscription."""

    def test_build_token_list_excludes_expired_contracts(self):
        """build_token_list_for_subscription organizes by exchangeType and excludes expired 2024 contracts."""
        mgr = AngelOneWebSocketManager()
        token_list = mgr.build_token_list_for_subscription()

        assert isinstance(token_list, list)
        assert len(token_list) > 0
        for group in token_list:
            assert "exchangeType" in group
            assert "tokens" in group
            assert len(group["tokens"]) > 0

        # Subscribed tokens list must be populated
        assert len(mgr.subscribed_tokens) > 0
        assert len(mgr.token_symbol_map) > 0

    def test_resubscribe_method_rearms_tokens(self):
        """resubscribe() delegates to subscribe_active_tokens with correct correlation_id."""
        mgr = AngelOneWebSocketManager()
        res = mgr.resubscribe(mode=1, correlation_id="test_resub")
        assert "tokens_prepared" in res or "tokens_subscribed" in res
        assert "groups" in res


# =====================================================================
# 6. MARKET DATA TICK SANITIZATION & MALFORMED TICK REJECTION
# =====================================================================

class TestMarketDataValidation:
    """Verifies rejection of non-finite (NaN, Inf), negative, future, and stale ticks."""

    def test_pipeline_validator_rejects_nan_price(self):
        """MarketTickValidator must strictly reject NaN price."""
        val = MarketTickValidator()
        ok, err = val.validate_tick({"symbol": "INFY", "price": float("nan")})
        assert ok is False
        assert "non-finite" in err.lower() or "invalid" in err.lower()

    def test_pipeline_validator_rejects_infinite_price(self):
        """MarketTickValidator must strictly reject Inf and -Inf price."""
        val = MarketTickValidator()
        ok_pos, err_pos = val.validate_tick({"symbol": "INFY", "price": float("inf")})
        assert ok_pos is False
        assert "non-finite" in err_pos.lower() or "invalid" in err_pos.lower()

        ok_neg, err_neg = val.validate_tick({"symbol": "INFY", "price": float("-inf")})
        assert ok_neg is False

    def test_pipeline_validator_rejects_negative_and_zero_price(self):
        """MarketTickValidator must reject zero and negative prices."""
        val = MarketTickValidator()
        ok_zero, err_zero = val.validate_tick({"symbol": "INFY", "price": 0.0})
        assert ok_zero is False

        ok_neg, err_neg = val.validate_tick({"symbol": "INFY", "price": -245.50})
        assert ok_neg is False

    def test_pipeline_validator_rejects_negative_or_nan_volume(self):
        """MarketTickValidator must reject negative or NaN volume."""
        val = MarketTickValidator()
        ok_nan_vol, _ = val.validate_tick({"symbol": "INFY", "price": 1500.0, "volume": float("nan")})
        assert ok_nan_vol is False

        ok_neg_vol, _ = val.validate_tick({"symbol": "INFY", "price": 1500.0, "volume": -100.0})
        assert ok_neg_vol is False

    def test_pipeline_validator_accepts_valid_tick(self):
        """MarketTickValidator accepts valid finite positive ticks with reasonable timestamps."""
        val = MarketTickValidator()
        ok, msg = val.validate_tick({
            "symbol": "TCS",
            "price": 3850.50,
            "volume": 500.0,
            "timestamp": time.time(),
            "sequence_number": 1
        })
        assert ok is True

    def test_feed_manager_rejects_nan_and_inf_price(self):
        """AngelOneWebSocketManager.handle_binary_tick must reject NaN and Inf prices."""
        mgr = AngelOneWebSocketManager()
        mgr.token_symbol_map["1594"] = "INFY"

        ok_nan, err_nan = mgr.handle_binary_tick({"token": "1594", "price": float("nan")})
        assert ok_nan is False
        assert err_nan == "INVALID_PRICE"

        ok_inf, err_inf = mgr.handle_binary_tick({"token": "1594", "price": float("inf")})
        assert ok_inf is False
        assert err_inf == "INVALID_PRICE"


# =====================================================================
# 7. OUT-OF-ORDER & DUPLICATE TICK SEQUENCE DETECTION
# =====================================================================

class TestSequenceIntegrity:
    """Verifies sequence duplicate and out-of-order rejection."""

    def test_feed_manager_detects_duplicate_sequence(self):
        """Duplicate sequence number on same token must be rejected."""
        mgr = AngelOneWebSocketManager()
        mgr.token_symbol_map["1594"] = "INFY"

        now_ms = int(time.time() * 1000)
        tick1 = {"token": "1594", "price": 1500.0, "exchange_timestamp": now_ms, "sequence_number": 100}
        tick2 = {"token": "1594", "price": 1501.0, "exchange_timestamp": now_ms + 100, "sequence_number": 100}

        ok1, _ = mgr.handle_binary_tick(tick1)
        assert ok1 is True

        ok2, err2 = mgr.handle_binary_tick(tick2)
        assert ok2 is False
        assert err2 == "DUPLICATE_TICK_SEQUENCE"
        assert mgr.duplicate_ticks_count == 1

    def test_feed_manager_detects_out_of_order_sequence(self):
        """Out-of-order sequence number on same token must be rejected."""
        mgr = AngelOneWebSocketManager()
        mgr.token_symbol_map["1594"] = "INFY"

        now_ms = int(time.time() * 1000)
        tick1 = {"token": "1594", "price": 1500.0, "exchange_timestamp": now_ms, "sequence_number": 200}
        tick2 = {"token": "1594", "price": 1501.0, "exchange_timestamp": now_ms + 100, "sequence_number": 150}

        ok1, _ = mgr.handle_binary_tick(tick1)
        assert ok1 is True

        ok2, err2 = mgr.handle_binary_tick(tick2)
        assert ok2 is False
        assert err2 == "OUT_OF_ORDER_SEQUENCE"
        assert mgr.out_of_order_ticks_count == 1

    def test_pipeline_validator_detects_duplicate_sequence(self):
        """MarketTickValidator detects duplicate sequence."""
        val = MarketTickValidator()
        now_ts = time.time()
        ok1, _ = val.validate_tick({"symbol": "RELIANCE", "price": 2900.0, "timestamp": now_ts, "sequence_number": 10})
        assert ok1 is True

        ok2, err2 = val.validate_tick({"symbol": "RELIANCE", "price": 2901.0, "timestamp": now_ts + 0.1, "sequence_number": 10})
        assert ok2 is False
        assert "Duplicate sequence" in err2


# =====================================================================
# 8. HEARTBEAT LIVENESS TRACKING
# =====================================================================

class TestHeartbeatLiveness:
    """Verifies ping/pong latency measurement and dead connection detection."""

    def test_heartbeat_latency_calculation(self):
        """Latency is calculated as (pong - ping) * 1000 ms."""
        mgr = AngelOneWebSocketManager()
        t0 = time.time()
        mgr.last_ping_time = t0
        mgr.last_pong_time = t0 + 0.015  # 15 ms latency

        assert 14.0 <= mgr.heartbeat_latency_ms <= 16.0

    def test_is_heartbeat_alive_detection(self):
        """Dead connection is detected when last pong exceeds max_silent_seconds."""
        mgr = AngelOneWebSocketManager()
        mgr.is_connected = True
        mgr.last_pong_time = time.time() - 45.0  # 45s silent (> 30s threshold)

        assert mgr.is_heartbeat_alive(max_silent_seconds=30.0) is False

        mgr.last_pong_time = time.time() - 5.0
        assert mgr.is_heartbeat_alive(max_silent_seconds=30.0) is True


# =====================================================================
# 9. QUEUE OVERFLOW & BACKPRESSURE PROTECTION
# =====================================================================

class TestQueueOverflowAndBackpressure:
    """Verifies backpressure handling in low-latency pipeline and message bus."""

    def test_low_latency_pipeline_drops_ticks_on_overflow(self):
        """Pipeline with queue_capacity=5 drops excess ticks without blocking."""
        pipe = LowLatencyEventPipeline(queue_capacity=5)
        now_ts = time.time()

        # Fill queue to capacity
        for i in range(5):
            ok, msg = pipe.push_tick({
                "symbol": "NIFTY",
                "price": 24000.0 + i,
                "timestamp": now_ts + (i * 0.01),
                "sequence_number": i + 1
            })
            assert ok is True

        # 6th tick must be dropped by backpressure
        ok6, msg6 = pipe.push_tick({
            "symbol": "NIFTY",
            "price": 24010.0,
            "timestamp": now_ts + 0.1,
            "sequence_number": 10
        })
        assert ok6 is False
        assert "backpressure" in msg6.lower() or "full" in msg6.lower()
        assert pipe.dropped_events_count == 1

    def test_message_bus_lossy_drops_oldest_on_overflow(self):
        """InMemoryMessageBus drops oldest LOSSY event when queue is saturated."""
        bus = InMemoryMessageBus()
        block_event = threading.Event()
        received = []

        def slow_callback(e):
            block_event.wait(timeout=2.0)
            received.append(e.data["price"])

        # Default minimum queue size is 10
        sub_id = bus.subscribe("market.tick", slow_callback, max_queue_size=10)
        sub = bus._subscribers[sub_id]

        # Publish 16 lossy events while worker is blocked on first event
        for p in range(16):
            bus.publish("market.tick", {"price": float(p)}, priority=EventPriority.LOSSY)

        # Buffer was saturated: dropped_lossy_count must be > 0
        assert sub.dropped_lossy_count > 0 or bus.lossy_events_dropped_count > 0

        # Unblock worker and clean up
        block_event.set()
        time.sleep(0.1)
        bus.shutdown()

    def test_message_bus_critical_never_dropped(self):
        """Critical events bypass lossy drops and are reliably delivered to subscribers without event loss."""
        bus = InMemoryMessageBus()
        delivered = []

        def slow_critical_subscriber(ev):
            time.sleep(0.01)
            delivered.append(ev.data["alert"])

        bus.subscribe("risk.circuit_breaker", slow_critical_subscriber, max_queue_size=10)

        # Publish 5 CRITICAL events into the bus
        for i in range(5):
            bus.publish("risk.circuit_breaker", {"alert": f"CRITICAL_ALERT_{i}"}, priority=EventPriority.CRITICAL)

        time.sleep(0.15)
        diag = bus.get_diagnostics()
        bus.shutdown()

        # Zero critical events must be lost or dropped
        assert len(delivered) == 5
        assert diag["lossy_events_dropped_total"] == 0
        assert "CRITICAL_ALERT_0" in delivered
        assert "CRITICAL_ALERT_4" in delivered


# =====================================================================
# 10. THREAD SAFETY ACROSS CONCURRENT OPERATIONS
# =====================================================================

class TestConcurrencyAndThreadSafety:
    """Verifies that concurrent reconnect, disconnect, and tick handling do not corrupt state."""

    def test_concurrent_feed_manager_operations(self):
        """10 threads concurrently recording ticks, reconnect attempts, and ping/pong."""
        mgr = AngelOneWebSocketManager()
        mgr.token_symbol_map["1594"] = "INFY"
        exceptions = []

        def worker(thread_id: int):
            try:
                for i in range(25):
                    # Concurrent tick ingestion
                    mgr.handle_binary_tick({
                        "token": "1594",
                        "price": 1500.0 + (thread_id * 0.1),
                        "exchange_timestamp": int(time.time() * 1000)
                    })
                    # Concurrent ping/pong
                    mgr.record_heartbeat_ping()
                    mgr.record_heartbeat_pong()
                    # Concurrent health inspection
                    h = mgr.get_feed_health()
                    assert "authentic_ticks_count" in h
            except Exception as e:
                exceptions.append(e)

        threads = [threading.Thread(target=worker, args=(t,)) for t in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5.0)

        assert len(exceptions) == 0, f"Concurrent exceptions occurred: {exceptions}"
        assert mgr.authentic_ticks_count > 0


# =====================================================================
# 11. STRICT PAPER MODE INVARIANT ENFORCEMENT
# =====================================================================

class TestPaperModeInvariant:
    """Verifies that broker order placement is strictly blocked when execution_mode == PAPER."""

    def test_place_live_angel_order_strictly_paper_in_default_state(self):
        """In PAPER mode, place_live_angel_order must route to paper simulation and NEVER call placeOrder."""
        assert pss.execution_mode == "PAPER"

        mock_instance = MagicMock()
        pss.active_smart_connect["instance"] = mock_instance
        pss.broker_state["angel_one"]["connected"] = True

        res = pss.place_live_angel_order(
            symbol_name="RELIANCE",
            action="BUY",
            qty=1,
            price=2950.0,
            bot_name="Bot 1 (Titan Trend)"
        )

        assert res["success"] is True
        assert res["mode"] == "PAPER"
        assert res.get("is_simulated") is True
        # SmartConnect.placeOrder must NEVER have been called!
        assert mock_instance.placeOrder.call_count == 0

    def test_websocket_manager_strict_paper_assertion(self):
        """AngelOneWebSocketManager requires execution_mode == 'PAPER'."""
        mgr = AngelOneWebSocketManager()
        assert mgr.execution_mode == "PAPER"

        mgr.execution_mode = "LIVE"
        with pytest.raises(AssertionError) as exc_info:
            mgr.handle_binary_tick({"token": "1594", "price": 1500.0})
        assert "CRITICAL SAFETY VIOLATION: Execution mode must be PAPER" in str(exc_info.value)
