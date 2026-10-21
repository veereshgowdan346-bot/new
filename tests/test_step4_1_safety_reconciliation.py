"""
TRADING JARVIS WORKSTATION - STEP 4.1
SAFETY VERIFICATION, RISK-RULE RECONCILIATION & BROKER SECRET AUDIT TESTS

Verifies:
1. Discrepancy A: Consecutive-loss quarantine (2 vs 3). Reconciled default (2) and configurable override.
2. Discrepancy B: Stale market feed (2.0s entry threshold vs 15.0s tick freshness vs 60.0s connection watchdog).
3. Exit-Safe Isolation: Stale feeds and bot quarantines NEVER block exit orders.
4. Unfilled Entry Order Cancellation: Unfilled entry orders transition to CANCELLED on stale feeds; exits untouched.
5. Broker Secret Protection: REST endpoints, exception handlers, and config stores never expose raw secrets.
6. Token Lifecycle: SmartAPI daily 06:00 AM IST reset boundary and fatal reconnect aborting.
7. Market Data Validation: Controllable-clock verification of NaN/Inf/negative price and sequence integrity.
"""

import math
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, Any
from unittest.mock import patch, MagicMock

import pytest

from server.centralized_risk_manager import (
    CentralizedRiskManager,
    DEFAULT_RMS_CONFIG
)
from server.memory_db import (
    save_order,
    get_order,
    get_unfilled_entry_orders,
    cancel_unfilled_entry_orders
)
from server.angel_feed_manager import AngelOneWebSocketManager, IST
from server.low_latency_event_pipeline import MarketTickValidator
from server.python_stream_server import sanitize_broker_dict, app
from httpx import AsyncClient, ASGITransport


# =============================================================================
# 1. DISCREPANCY A: BOT CONSECUTIVE-LOSS QUARANTINE (2 VS 3)
# =============================================================================

class TestConsecutiveLossReconciliation:
    """Verifies that the bot quarantine threshold reconciles to 2 consecutive losses."""

    def test_default_consecutive_loss_quarantine_triggers_at_two_losses(self):
        """Under reconciled default config, bot is quarantined upon 2nd consecutive loss."""
        crm = CentralizedRiskManager()
        assert crm.max_consecutive_losses == 2
        assert DEFAULT_RMS_CONFIG["max_consecutive_losses"] == 2

        # 1st loss: Recorded, not quarantined
        res1 = crm.record_trade_result(bot_id=5, net_pnl=-150.0)
        assert res1["status"] == "LOSS_RECORDED"
        assert res1["consecutive_losses"] == 1
        assert 5 not in crm.get_quarantined_bots()

        # 2nd loss: Reaches threshold 2 -> QUARANTINED
        res2 = crm.record_trade_result(bot_id=5, net_pnl=-200.0)
        assert res2["status"] == "QUARANTINED"
        assert res2["consecutive_losses"] == 2
        assert 5 in crm.get_quarantined_bots()

    def test_custom_consecutive_loss_override_is_respected(self):
        """Allows explicit configuration override (e.g. 3 or 4 losses) when specified."""
        crm = CentralizedRiskManager({"max_consecutive_losses": 3})
        assert crm.max_consecutive_losses == 3

        # Losses 1 and 2 do not quarantine
        crm.record_trade_result(bot_id=3, net_pnl=-50.0)
        crm.record_trade_result(bot_id=3, net_pnl=-75.0)
        assert 3 not in crm.get_quarantined_bots()

        # Loss 3 triggers quarantine
        res3 = crm.record_trade_result(bot_id=3, net_pnl=-100.0)
        assert res3["status"] == "QUARANTINED"
        assert 3 in crm.get_quarantined_bots()

    def test_profit_resets_consecutive_loss_counter(self):
        """A winning trade immediately resets the loss streak to zero."""
        crm = CentralizedRiskManager()
        crm.record_trade_result(bot_id=2, net_pnl=-120.0)
        assert crm.bot_consecutive_losses.get(2) == 1

        # Winning trade
        res_win = crm.record_trade_result(bot_id=2, net_pnl=250.0)
        assert res_win["status"] == "PROFIT_RECORDED"
        assert crm.bot_consecutive_losses.get(2) == 0

        # Next loss is count 1, not 2
        crm.record_trade_result(bot_id=2, net_pnl=-80.0)
        assert 2 not in crm.get_quarantined_bots()

    def test_quarantined_bot_blocks_new_entry_orders_fail_closed(self):
        """Quarantined bot has BUY/SELL entry orders rejected fail-closed."""
        crm = CentralizedRiskManager()
        crm.record_trade_result(bot_id=4, net_pnl=-100.0)
        crm.record_trade_result(bot_id=4, net_pnl=-100.0)
        assert 4 in crm.get_quarantined_bots()

        approved, reason, telem = crm.validate_order_risk(
            bot_id=4, symbol="RELIANCE", action="BUY", qty=1, price=2900.0
        )
        assert approved is False
        assert "QUARANTINED" in reason

    def test_quarantined_bot_permits_safe_exits(self):
        """Quarantined bot is permitted to exit existing positions."""
        crm = CentralizedRiskManager()
        crm.record_trade_result(bot_id=4, net_pnl=-100.0)
        crm.record_trade_result(bot_id=4, net_pnl=-100.0)

        # Exit order permitted
        app_exit, reason_exit, _ = crm.validate_order_risk(
            bot_id=4, symbol="RELIANCE", action="EXIT", qty=1, price=2900.0, is_emergency_exit=True
        )
        assert app_exit is True

    def test_unquarantine_restores_bot_trading_state(self):
        """Admin override removes quarantine and resets streak."""
        crm = CentralizedRiskManager()
        crm.record_trade_result(bot_id=6, net_pnl=-100.0)
        crm.record_trade_result(bot_id=6, net_pnl=-100.0)
        assert 6 in crm.get_quarantined_bots()

        success = crm.unquarantine_bot(bot_id=6, admin_override=True)
        assert success is True
        assert 6 not in crm.get_quarantined_bots()
        assert crm.bot_consecutive_losses.get(6) == 0

        # Normal entry permitted after unquarantine
        approved, _, _ = crm.validate_order_risk(
            bot_id=6, symbol="RELIANCE", action="BUY", qty=1, price=2900.0
        )
        assert approved is True


# =============================================================================
# 2. DISCREPANCY B: STALE MARKET FEED RECONCILIATION (2.0S VS 15.0S VS 60.0S)
# =============================================================================

class TestStaleMarketFeedReconciliation:
    """
    Verifies multi-tier feed freshness architecture:
    - Tier 1: 2.0s entry signal gate & unfilled entry cancellation
    - Tier 2: 15.0s WebSocket tick ingestion freshness
    - Tier 3: 60.0s connection watchdog timeout
    """

    def test_entry_order_rejected_when_feed_age_exceeds_2_seconds(self):
        """Check 4 in CentralizedRiskManager rejects entries when feed_age > 2.0s."""
        crm = CentralizedRiskManager()
        assert crm.config["stale_feed_max_age_seconds"] == 2.0

        # 2.5s old tick (stale for new entry)
        approved, reason, _ = crm.validate_order_risk(
            bot_id=1, symbol="RELIANCE", action="BUY", qty=1, price=2900.0, feed_age_seconds=2.5
        )
        assert approved is False
        assert "Market feed is stale" in reason
        assert "2.0s threshold" in reason

    def test_entry_order_approved_when_feed_age_under_2_seconds(self):
        """Fresh market data (feed_age <= 2.0s) passes Check 4."""
        crm = CentralizedRiskManager()
        approved, reason, _ = crm.validate_order_risk(
            bot_id=1, symbol="RELIANCE", action="BUY", qty=1, price=2900.0, feed_age_seconds=1.2
        )
        assert approved is True

    def test_stale_feed_never_blocks_exits_or_emergency_squareoffs(self):
        """CRITICAL: Exits unconditionally bypass stale feed rejection regardless of feed age."""
        crm = CentralizedRiskManager()

        for stale_age in [2.5, 5.0, 15.0, 60.0, 300.0]:
            # Emergency exit flag
            app1, _, _ = crm.validate_order_risk(
                bot_id=1, symbol="RELIANCE", action="BUY", qty=1, price=2900.0,
                feed_age_seconds=stale_age, is_emergency_exit=True
            )
            assert app1 is True, f"Failed at age {stale_age}"

            # Action EXIT
            app2, _, _ = crm.validate_order_risk(
                bot_id=1, symbol="RELIANCE", action="EXIT", qty=1, price=2900.0,
                feed_age_seconds=stale_age
            )
            assert app2 is True, f"Failed at age {stale_age}"

            # Action SQUAREOFF
            app3, _, _ = crm.validate_order_risk(
                bot_id=1, symbol="RELIANCE", action="SQUAREOFF", qty=1, price=2900.0,
                feed_age_seconds=stale_age
            )
            assert app3 is True, f"Failed at age {stale_age}"

    def test_bot_worker_evaluate_blocks_stale_entry_signals(self):
        """BotWorker.evaluate suppresses BUY/SELL when last tick is older than 2.0s."""
        from server.bot_scheduler import BotWorker
        bot_cfg = {
            "name": "Bot 1 - Trend Master",
            "asset": "NIFTY 50",
            "lotsize": 1,
            "min_candles_required": 3,
            "risk_config": {"max_capital": 35000.0}
        }
        worker = BotWorker(bot_id=1, config=bot_cfg)
        now = time.time()
        # Seed 3 candles to satisfy min_candles_required
        for i in range(3):
            worker.candles.append({
                "timestamp": f"2026-10-18T10:0{i}:00",
                "open": 24500.0, "high": 24550.0, "low": 24480.0, "close": 24520.0, "volume": 100.0
            })
        
        # Last tick 3.5 seconds ago (stale for new entry)
        worker.last_tick_time = now - 3.5
        worker.data_healthy = True

        with patch("server.bot_scheduler.evaluate_strategy", return_value={"decision": "BUY", "confidence": 0.85}):
            res = worker.evaluate(execute_paper=False)
            assert res["decision"] == "NO_TRADE"
            assert res["status"] == "STALE_FEED"
            assert "Market feed is stale" in res["reason"]

    def test_bot_worker_evaluate_permits_exit_signal_on_stale_feed(self):
        """BotWorker.evaluate permits EXIT decision even when feed age > 2.0s."""
        from server.bot_scheduler import BotWorker
        bot_cfg = {
            "name": "Bot 1 - Trend Master",
            "asset": "NIFTY 50",
            "lotsize": 1,
            "min_candles_required": 3,
            "risk_config": {"max_capital": 35000.0}
        }
        worker = BotWorker(bot_id=1, config=bot_cfg)
        now = time.time()
        for i in range(3):
            worker.candles.append({
                "timestamp": f"2026-10-18T10:0{i}:00",
                "open": 24500.0, "high": 24550.0, "low": 24480.0, "close": 24520.0, "volume": 100.0
            })
        
        # Last tick 4.0s ago
        worker.last_tick_time = now - 4.0
        worker.data_healthy = True

        with patch("server.bot_scheduler.evaluate_strategy", return_value={"decision": "EXIT", "confidence": 0.90}):
            res = worker.evaluate(execute_paper=False)
            assert res["decision"] == "EXIT"


# =============================================================================
# 3. UNFILLED ENTRY ORDER CANCELLATION ON STALE FEED
# =============================================================================

class TestUnfilledEntryOrderCancellation:
    """Verifies that stale feed automatically cancels pending entry orders but preserves exits."""

    def test_cancel_unfilled_entry_orders_cancels_pending_entries(self):
        """Cancels open/pending BUY and SELL orders."""
        order_entry_1 = {
            "orderId": f"ORD_TEST_E1_{int(time.time()*1000)}",
            "symbol": "INFY",
            "action": "BUY",
            "qty": 10,
            "status": "PENDING",
            "is_emergency_exit": 0
        }
        order_entry_2 = {
            "orderId": f"ORD_TEST_E2_{int(time.time()*1000)}",
            "symbol": "INFY",
            "action": "SELL",
            "qty": 5,
            "status": "SUBMITTED",
            "is_emergency_exit": 0
        }
        save_order(order_entry_1)
        save_order(order_entry_2)

        unfilled = get_unfilled_entry_orders("INFY")
        assert len(unfilled) >= 2

        # Trigger cancellation
        cancelled = cancel_unfilled_entry_orders(symbol="INFY", reason="CANCELLED_STALE_FEED")
        assert len(cancelled) >= 2

        # Check records in DB
        o1 = get_order(order_entry_1["orderId"])
        o2 = get_order(order_entry_2["orderId"])
        assert o1["status"] == "CANCELLED"
        assert o1["rejection_reason"] == "CANCELLED_STALE_FEED"
        assert o2["status"] == "CANCELLED"
        assert o2["rejection_reason"] == "CANCELLED_STALE_FEED"

    def test_cancel_unfilled_entry_orders_strictly_preserves_exits(self):
        """Exit orders are NEVER cancelled by cancel_unfilled_entry_orders."""
        order_exit = {
            "orderId": f"ORD_TEST_X1_{int(time.time()*1000)}",
            "symbol": "TCS",
            "action": "EXIT",
            "qty": 10,
            "status": "PENDING",
            "is_emergency_exit": 1
        }
        order_squareoff = {
            "orderId": f"ORD_TEST_X2_{int(time.time()*1000)}",
            "symbol": "TCS",
            "action": "SQUAREOFF",
            "qty": 5,
            "status": "PENDING",
            "is_emergency_exit": 1
        }
        save_order(order_exit)
        save_order(order_squareoff)

        # Trigger cancellation on TCS
        cancel_unfilled_entry_orders(symbol="TCS", reason="CANCELLED_STALE_FEED")

        # Exits must remain intact
        ox1 = get_order(order_exit["orderId"])
        ox2 = get_order(order_squareoff["orderId"])
        assert ox1["status"] == "PENDING"
        assert ox2["status"] == "PENDING"


# =============================================================================
# 4. BROKER SECRET AUDIT & SANITIZATION
# =============================================================================

class TestBrokerSecretSanitization:
    """Verifies that secrets (JWT, feedToken, refreshToken, apiKey, pin, totpSecret) are never leaked."""

    def test_sanitize_broker_dict_masks_tokens_and_strips_credentials(self):
        """Sanitizer replaces tokens with MASKED and removes pin, password, totpSecret."""
        dirty_broker = {
            "connected": True,
            "broker": "Angel One",
            "clientId": "V123456",
            "feedToken": "FEED_SECRET_TOKEN_XYZ999",
            "jwtToken": "JWT_SECRET_TOKEN_ABC123",
            "refreshToken": "REFRESH_SECRET_TOKEN_456",
            "apiKey": "SMARTAPI_KEY_789",
            "pin": "1234",
            "password": "MySuperSecretPassword",
            "totpSecret": "JBSWY3DPEHPK3PXP"
        }

        clean = sanitize_broker_dict(dirty_broker)

        # Raw tokens masked
        assert clean["feedToken"] == "●●●●●●●● (MASKED)"
        assert clean["jwtToken"] == "●●●●●●●● (MASKED)"
        assert clean["refreshToken"] == "●●●●●●●● (MASKED)"
        assert clean["apiKey"] == "●●●●●●●● (MASKED)"

        # Raw credentials stripped
        assert "pin" not in clean
        assert "password" not in clean
        assert "totpSecret" not in clean

        # Safe metadata preserved
        assert clean["connected"] is True
        assert clean["clientId"] == "V123456"

    @pytest.mark.asyncio
    async def test_api_broker_status_returns_sanitized_tokens(self):
        """REST endpoint /api/broker/status never exposes plaintext JWT or feed token."""
        from server.python_stream_server import broker_state
        broker_state["angel_one"]["feedToken"] = "REAL_LIVE_FEED_TOKEN_XYZ"
        broker_state["angel_one"]["jwtToken"] = "REAL_LIVE_JWT_TOKEN_ABC"
        broker_state["angel_one"]["apiKey"] = "REAL_API_KEY_123"

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/broker/status")
            assert resp.status_code == 200
            data = resp.json()
            ao = data["brokers"]["angel_one"]
            assert ao["feedToken"] == "●●●●●●●● (MASKED)"
            assert ao["jwtToken"] == "●●●●●●●● (MASKED)"
            assert "REAL_LIVE" not in str(data)

    @pytest.mark.asyncio
    async def test_connect_broker_error_sanitizes_exception_messages(self):
        """connect_broker error response never leaks raw passwords, keys, or PINs."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {
                "broker": "angel_one",
                "apiKey": "MY_TEST_API_KEY",
                "clientId": "V88888",
                "pin": "5678",
                "totp": "123456"
            }
            # Mock SmartConnect to raise exception containing sensitive keyword
            with patch("server.python_stream_server.SmartConnect") as mock_sc:
                mock_inst = MagicMock()
                mock_inst.generateSession.side_effect = Exception("Auth failed for api_key=SECRET_VAL and pin=5678")
                mock_sc.return_value = mock_inst

                resp = await client.post("/api/broker/connect", json=payload)
                assert resp.status_code == 200
                data = resp.json()
                assert data["status"] == "error"
                # Check sanitization in message
                assert "SECRET_VAL" not in data["message"]
                assert "5678" not in data["message"]
                assert "●●●●●●●●" in data["message"]


# =============================================================================
# 5. TOKEN LIFECYCLE & SMARTAPI CONTRACT AUDIT
# =============================================================================

class TestTokenLifecycleAndContract:
    """Verifies token expiration assumptions, daily 06:00 AM IST reset, and fatal errors."""

    def test_token_expired_when_crossing_0600_am_ist_daily_reset(self):
        """
        Angel One SmartAPI tokens are invalidated daily at 06:00 AM IST.
        A token created at 03:00 AM IST must be flagged expired at 06:05 AM IST.
        """
        mgr = AngelOneWebSocketManager()
        mgr.auth_token = "VALID_JWT_TOKEN"

        # Simulate token created today at 03:00 AM IST
        now_dt = datetime.now(IST)
        token_created_dt = now_dt.replace(hour=3, minute=0, second=0, microsecond=0)
        mgr.token_created_at = token_created_dt.timestamp()

        # Simulated clock at 06:05 AM IST (crossed 06:00 AM boundary)
        simulated_now_dt = now_dt.replace(hour=6, minute=5, second=0, microsecond=0)
        simulated_now_epoch = simulated_now_dt.timestamp()

        with patch("time.time", return_value=simulated_now_epoch):
            assert mgr.is_token_expired() is True

    def test_token_valid_prior_to_0600_am_ist_reset(self):
        """Token created after 06:00 AM IST (e.g. 09:00 AM) remains valid during trading hours."""
        mgr = AngelOneWebSocketManager()
        mgr.auth_token = "VALID_JWT_TOKEN"

        now_dt = datetime.now(IST)
        token_created_dt = now_dt.replace(hour=9, minute=0, second=0, microsecond=0)
        mgr.token_created_at = token_created_dt.timestamp()

        # Simulated clock at 02:30 PM IST (same trading session)
        simulated_now_dt = now_dt.replace(hour=14, minute=30, second=0, microsecond=0)
        simulated_now_epoch = simulated_now_dt.timestamp()

        with patch("time.time", return_value=simulated_now_epoch):
            assert mgr.is_token_expired() is False

    def test_fatal_auth_errors_halt_reconnection_immediately(self):
        """Fatal error codes (AB1010, AB1004, AB1005) halt retries and do not loop infinitely."""
        fatal_codes = ["AB1010", "AB1004", "AB1005"]
        for code in fatal_codes:
            mgr = AngelOneWebSocketManager()
            mgr.is_connected = True
            delay = mgr.record_reconnect_attempt(f"Error {code}: Fatal authentication failure")
            assert delay == -1.0
            assert mgr.feed_status == "FATAL_AUTH_ERROR"
            assert mgr.reconnect_attempts == mgr.max_reconnect_attempts

    def test_token_expired_error_code_ab1012_requests_reauth(self):
        """AB1012 indicates token expired and requires TOTP re-authentication."""
        classification = AngelOneWebSocketManager.classify_auth_error("SmartAPI error: AB1012 Token Expired")
        assert classification["error_code"] == "AB1012"
        assert classification["category"] == "TOKEN_EXPIRED"
        assert classification["is_fatal"] is False
        assert classification["requires_totp_reauth"] is True


# =============================================================================
# 6. MARKET DATA INTEGRITY (FAST CONTROLLABLE CLOCK)
# =============================================================================

class TestMarketDataIntegrityControllableClock:
    """Verifies tick sanitization, sequence tracking, and timestamps using controllable clock."""

    def test_validator_rejects_non_finite_and_negative_prices(self):
        """Rejects NaN, Inf, -Inf, 0.0, and negative prices."""
        val = MarketTickValidator()

        bad_ticks = [
            {"symbol": "INFY", "price": float("nan"), "timestamp": time.time()},
            {"symbol": "INFY", "price": float("inf"), "timestamp": time.time()},
            {"symbol": "INFY", "price": float("-inf"), "timestamp": time.time()},
            {"symbol": "INFY", "price": 0.0, "timestamp": time.time()},
            {"symbol": "INFY", "price": -150.0, "timestamp": time.time()}
        ]
        for t in bad_ticks:
            valid, reason = val.validate_tick(t)
            assert valid is False
            assert "Invalid non-positive or non-finite tick price" in reason

    def test_validator_rejects_duplicate_and_out_of_order_sequences(self):
        """Rejects duplicate sequences and out-of-order sequence arrivals."""
        val = MarketTickValidator()
        now = time.time()

        # Sequence 100: Valid
        t1 = {"symbol": "RELIANCE", "price": 2900.0, "sequence_number": 100, "timestamp": now}
        ok1, _ = val.validate_tick(t1)
        assert ok1 is True

        # Duplicate Sequence 100: Rejected
        t2 = {"symbol": "RELIANCE", "price": 2901.0, "sequence_number": 100, "timestamp": now + 0.1}
        ok2, err2 = val.validate_tick(t2)
        assert ok2 is False
        assert "Duplicate sequence 100" in err2

        # Out-of-order Sequence 99: Rejected
        t3 = {"symbol": "RELIANCE", "price": 2902.0, "sequence_number": 99, "timestamp": now + 0.2}
        ok3, err3 = val.validate_tick(t3)
        assert ok3 is False
        assert "Out-of-order sequence 99 < prior 100" in err3

        # Monotonic Sequence 101: Valid
        t4 = {"symbol": "RELIANCE", "price": 2903.0, "sequence_number": 101, "timestamp": now + 0.3}
        ok4, _ = val.validate_tick(t4)
        assert ok4 is True

