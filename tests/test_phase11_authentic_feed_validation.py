"""
CHINTU AI TRADING SYSTEM - Phase 11 Authentic Angel One Feed Validation Tests
Verifies:
1. Safe credential loading & MISSING_CREDENTIALS diagnostic handling.
2. Market calendar & weekend session gating (MARKET_CLOSED).
3. Contract expiration auditing (differentiating permanent cash equities from expired 2024 derivatives).
4. Unsupported broker assets rejection (Binance crypto).
5. SmartWebSocketV2 subscription token grouping by official exchangeType.
6. Binary tick parsing, paise-to-rupee conversion, and BotScheduler fanout.
7. Tick freshness validation (stale-tick and future-tick rejection).
8. Numeric price bounds & unknown token rejection.
9. Strict isolation of AUTHENTIC_SMARTAPI vs SYNTHETIC / REPLAY / TEST data.
10. Strict PAPER-mode enforcement and zero live broker order placement.
"""

import time
import pytest
from datetime import datetime
from server.angel_feed_manager import (
    InstrumentAuditor,
    AngelOneWebSocketManager,
    angel_feed_manager
)
from server.bot_scheduler import bot_scheduler
import server.python_stream_server as pss


@pytest.fixture(autouse=True)
def preserve_paper_state():
    """Ensures execution_mode remains PAPER and resets feed manager counters."""
    pss.execution_mode = "PAPER"
    pss.active_smart_connect["instance"] = None
    angel_feed_manager.ticks_received = 0
    angel_feed_manager.ticks_rejected = 0
    angel_feed_manager.feed_status = "DISCONNECTED"
    angel_feed_manager.provider = "SYNTHETIC_RANDOM_WALK"
    yield
    pss.execution_mode = "PAPER"
    pss.active_smart_connect["instance"] = None


class TestPhase11AuthenticFeedValidation:
    """Test suite for Phase 11 authentic feed auditing, gating, and binary ingestion."""

    def test_01_credentials_missing_clean_rejection(self):
        """Verifies missing credentials returns MISSING_CREDENTIALS without exceptions or secret leaks."""
        diag = angel_feed_manager.initialize_from_env()
        assert diag["status"] == "MISSING_CREDENTIALS"
        assert set(diag["missing_configurations"]) == {
            "ANGEL_API_KEY", "ANGEL_CLIENT_ID", "ANGEL_PIN", "ANGEL_TOTP_SECRET"
        }
        assert diag["broker_authenticated"] is False
        assert pss.execution_mode == "PAPER"

    def test_02_market_session_closed_on_weekend(self):
        """Verifies market session evaluator flags weekend dates as MARKET_CLOSED."""
        from datetime import datetime, timezone, timedelta
        IST = timezone(timedelta(hours=5, minutes=30))

        # Test with a known Saturday date (e.g. 2026-10-17 10:30 IST)
        sat_dt = datetime(2026, 10, 17, 10, 30, tzinfo=IST)
        res = InstrumentAuditor.get_market_session_state(sat_dt)
        assert res["is_open"] is False
        assert res["is_weekend"] is True
        assert res["status"] == "MARKET_CLOSED"
        assert "closed on Saturday" in res["reason"]

        # Test with a known trading Wednesday at 10:30 IST
        wed_dt = datetime(2026, 10, 14, 10, 30, tzinfo=IST)
        res_open = InstrumentAuditor.get_market_session_state(wed_dt)
        assert res_open["is_open"] is True
        assert res_open["status"] == "MARKET_OPEN"

    def test_03_contract_expiration_auditor_flags_2024_derivatives(self):
        """Verifies that 2024 derivatives contracts are flagged as expired while permanent equities are valid."""
        audit = InstrumentAuditor.audit_all_14_bots()
        assert audit["total_bots"] == 14
        assert audit["permanent_equities_valid"] == 3
        assert audit["expired_derivatives_flagged"] == 10
        assert audit["discrepancy_blocked_flagged"] == 1

        # Check permanent cash equities
        bot3 = next(b for b in audit["bots"] if b["bot_id"] == 3)  # RELIANCE
        assert bot3["classification"] == "PERMANENT_CASH_EQUITY"
        assert bot3["is_valid"] is True
        assert bot3["is_expired"] is False

        # Check Bot 4 discrepancy blocking (TATAMOTORS-EQ not in Scrip Master)
        bot4 = next(b for b in audit["bots"] if b["bot_id"] == 4)  # TATA MOTORS
        assert bot4["classification"] == "DISCREPANCY_BLOCKED"
        assert bot4["is_valid"] is False

        bot6 = next(b for b in audit["bots"] if b["bot_id"] == 6)  # HDFCBANK
        assert bot6["classification"] == "PERMANENT_CASH_EQUITY"

        bot7 = next(b for b in audit["bots"] if b["bot_id"] == 7)  # INFY
        assert bot7["classification"] == "PERMANENT_CASH_EQUITY"

        # Check expired 2024 derivative (Bot 1 NIFTY24OCTFUT)
        bot1 = next(b for b in audit["bots"] if b["bot_id"] == 1)
        assert bot1["classification"] == "EXPIRED_DERIVATIVE_CONTRACT"
        assert bot1["is_expired"] is True
        assert "expired" in bot1["reason"].lower()

    def test_04_crypto_assets_rejected_by_sebi_auditor(self):
        """Verifies Binance crypto symbols are classified as UNSUPPORTED_BROKER_ASSET."""
        res_btc = InstrumentAuditor.audit_instrument("BTCUSDT", "BTCUSDT-PERP", "999901", "BINANCE")
        assert res_btc["is_valid"] is False
        assert res_btc["classification"] == "UNSUPPORTED_BROKER_ASSET"
        assert "Binance" in res_btc["reason"]

    def test_05_smartwebsocketv2_token_list_grouping(self):
        """Verifies tokens are grouped into correct official exchangeType integer keys."""
        token_list = angel_feed_manager.build_token_list_for_subscription()
        assert len(token_list) >= 4  # NSE Cash (1), NFO (2), BFO (4), MCX (5), CDS (13)

        exchange_types = {item["exchangeType"] for item in token_list}
        assert 1 in exchange_types   # NSE Cash
        assert 2 in exchange_types   # NSE F&O
        assert 5 in exchange_types   # MCX
        assert 13 in exchange_types  # CDS

        # Token map has all 13 tradable bots (Bot 4 blocked due to discrepancy)
        assert len(angel_feed_manager.token_symbol_map) == 13
        assert angel_feed_manager.token_symbol_map.get("2885") == "RELIANCE"
        assert "3456" not in angel_feed_manager.token_symbol_map

    def test_06_binary_tick_paise_conversion_and_ingestion(self):
        """Verifies binary tick parsing converts paise to rupees and fans out to BotScheduler."""
        angel_feed_manager.build_token_list_for_subscription()
        worker = bot_scheduler.workers.get(3)  # Bot 3 RELIANCE
        assert worker is not None

        # Clean candles
        with worker.lock:
            worker.candles = []
            worker.last_tick_time = None

        now_ms = int(time.time() * 1000)
        # 293500 paise = 2935.00 INR
        packet = {
            "token": "2885",
            "last_traded_price": 293500,
            "exchange_timestamp": now_ms,
            "last_traded_quantity": 25
        }
        ok, reason = angel_feed_manager.handle_binary_tick(packet)
        assert ok is True
        assert reason == "SUCCESS"
        assert angel_feed_manager.ticks_received == 1
        assert angel_feed_manager.feed_status == "AUTHENTIC_SMARTAPI"

        # Verify candle formed
        assert len(worker.candles) >= 1
        latest = worker.candles[-1]
        assert latest["close"] == 2935.00
        assert worker.data_healthy is True

    def test_07_binary_tick_stale_and_future_rejection(self):
        """Verifies ticks > 15s old or in future are rejected by the feed manager."""
        angel_feed_manager.build_token_list_for_subscription()

        # Stale tick (25 seconds ago)
        stale_ms = int((time.time() - 25.0) * 1000)
        ok, reason = angel_feed_manager.handle_binary_tick({
            "token": "2885",
            "last_traded_price": 293500,
            "exchange_timestamp": stale_ms
        })
        assert ok is False
        assert reason == "STALE_TICK"

        # Future tick (15 seconds in future)
        future_ms = int((time.time() + 15.0) * 1000)
        ok, reason = angel_feed_manager.handle_binary_tick({
            "token": "2885",
            "last_traded_price": 293500,
            "exchange_timestamp": future_ms
        })
        assert ok is False
        assert reason == "FUTURE_TIMESTAMP"

    def test_08_binary_tick_invalid_price_and_unknown_token_rejection(self):
        """Verifies ticks with zero/negative price or unknown tokens are rejected."""
        angel_feed_manager.build_token_list_for_subscription()

        # Bad price
        ok, reason = angel_feed_manager.handle_binary_tick({
            "token": "2885",
            "last_traded_price": 0,
            "exchange_timestamp": int(time.time() * 1000)
        })
        assert ok is False
        assert reason == "INVALID_PRICE"

        # Unknown token
        ok, reason = angel_feed_manager.handle_binary_tick({
            "token": "UNKNOWN_99999",
            "last_traded_price": 293500,
            "exchange_timestamp": int(time.time() * 1000)
        })
        assert ok is False
        assert reason == "UNKNOWN_TOKEN"

    def test_09_synthetic_and_test_ticks_never_marked_authentic_smartapi(self):
        """Verifies that synthetic data provider cannot be classified as AUTHENTIC_SMARTAPI."""
        health = angel_feed_manager.get_feed_health()
        assert health["provider"] != "AUTHENTIC_SMARTAPI"
        assert health["is_authenticated"] is False

    def test_10_execution_mode_remains_strictly_paper_during_feed_reception(self):
        """Verifies receiving ticks never enables LIVE mode or calls SmartConnect.placeOrder."""
        angel_feed_manager.build_token_list_for_subscription()
        packet = {
            "token": "2885",
            "last_traded_price": 293500,
            "exchange_timestamp": int(time.time() * 1000),
            "last_traded_quantity": 10
        }
        angel_feed_manager.handle_binary_tick(packet)

        assert pss.execution_mode == "PAPER"
        assert pss.active_smart_connect["instance"] is None

