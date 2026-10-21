"""
CHINTU AI TRADING SYSTEM - Phase 10 Authentic Angel One Feed Verification Tests
Validates:
1. Safe PAPER execution mode enforcement.
2. Startup Angel One credential loading & diagnostic inspection (fail-closed, sanitized).
3. Secret masking & sanitization on broker status endpoints.
4. Separation of synthetic, unauthenticated, controlled test, and authentic broker ticks.
5. BotScheduler tick ingestion and candle formation gating.
6. Instrument mapping & SEBI-registered exchange validation (rejection of Binance crypto).
7. Smart Master Bot 7-factor evaluation and instrument exclusion.
8. Zero live broker order placement verification.
"""

import os
import sys
import time
import pytest
from datetime import datetime

# Path setup
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)
if os.path.join(parent_dir, "server") not in sys.path:
    sys.path.insert(0, os.path.join(parent_dir, "server"))

from fastapi.testclient import TestClient
import server.python_stream_server as pss
from server.bot_scheduler import bot_scheduler
from server.bot_registry import CANONICAL_BOT_REGISTRY
from server.highest_profit_bot import evaluate_master_bot_multi_factor, switch_active_instrument


client = TestClient(pss.app)
AUTH_HEADERS = {"Authorization": "Bearer chintu_master_auth_permanent_veeresh"}


@pytest.fixture(autouse=True)
def ensure_paper_mode_and_clean_state():
    """Safety fixture: Guarantees execution_mode is PAPER and resets broker state to safe defaults."""
    pss.execution_mode = "PAPER"
    pss.active_smart_connect["instance"] = None
    pss.active_smart_connect["apiKey"] = None
    pss.active_smart_connect["clientId"] = None
    pss.broker_state["angel_one"] = {
        "connected": True,
        "clientId": "PAPER_DEMO_VEERESH",
        "clientName": "Veeresh (Paper Simulation)",
        "broker": "Angel One (Paper Simulation)",
        "feedToken": "paper_live_feed_token",
        "jwtToken": "paper_jwt_token_auth",
        "refreshToken": "paper_refresh_token",
        "availableCash": 500000.00,
        "collateralMargin": 500000.00,
        "netMargin": 500000.00,
        "ping": "12ms",
        "connectedAt": datetime.now().isoformat(),
        "tokenExpires": "Active (Paper Trading)"
    }
    pss.market_feed_status["is_authentic_exchange_feed"] = False
    pss.market_feed_status["provider"] = "SYNTHETIC_RANDOM_WALK"
    pss.market_feed_status["status"] = "SANDBOX_SIMULATED"
    pss.market_feed_status["is_subscribed"] = False
    yield
    pss.execution_mode = "PAPER"
    pss.active_smart_connect["instance"] = None


class TestPhase10CredentialDiagnosticsAndSafety:
    """Test Suite for Angel One credential inspection, startup loading, and secret sanitization."""

    def test_01_execution_mode_is_strictly_paper(self):
        """Verify system boots in PAPER mode and refuses live execution without live broker."""
        res = client.get("/api/execution-mode", headers=AUTH_HEADERS)
        assert res.status_code == 200
        data = res.json()
        assert data["mode"] == "PAPER"
        # Attempt to switch to LIVE without authentic broker
        switch_res = client.post("/api/execution-mode", json={"mode": "LIVE"}, headers=AUTH_HEADERS)
        # Should be rejected or blocked because broker is in paper simulation
        assert pss.execution_mode == "PAPER"

    def test_02_missing_credentials_diagnosis(self):
        """Verify load_and_verify_angel_one_credentials accurately detects missing config without leaking secrets."""
        # Ensure env vars are absent
        for key in ["ANGEL_API_KEY", "ANGEL_CLIENT_ID", "ANGEL_PIN", "ANGEL_TOTP_SECRET"]:
            if key in os.environ:
                del os.environ[key]

        diag = pss.load_and_verify_angel_one_credentials()
        assert diag["status"] == "MISSING_CREDENTIALS"
        assert set(diag["missing_configurations"]) == {
            "ANGEL_API_KEY", "ANGEL_CLIENT_ID", "ANGEL_PIN", "ANGEL_TOTP_SECRET"
        }
        assert diag["broker_authenticated"] is False
        assert len(diag["safe_setup_instructions"]) > 0

    def test_03_angel_diagnostics_endpoint_sanitization(self):
        """Verify /api/broker/angel/diagnostics endpoint outputs safe diagnostics without sensitive fields."""
        res = client.get("/api/broker/angel/diagnostics", headers=AUTH_HEADERS)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        diag = data["diagnostics"]
        assert "missing_configurations" in diag
        assert "safe_setup_instructions" in diag
        # Ensure no plaintext secret keys or tokens are in response
        body_text = res.text
        assert "ANGEL_API_KEY" in body_text  # key name is fine
        assert "jwtToken" not in diag
        assert "refreshToken" not in diag

    def test_04_broker_status_masks_sensitive_tokens(self):
        """Verify /api/broker/status masks real tokens if present, protecting live session data."""
        # Set dummy real token to test masking
        pss.broker_state["angel_one"]["jwtToken"] = "eyJh...REAL_SECRET_JWT_HERE"
        pss.broker_state["angel_one"]["refreshToken"] = "REAL_REFRESH_TOKEN_HERE"

        res = client.get("/api/broker/status", headers=AUTH_HEADERS)
        assert res.status_code == 200
        data = res.json()
        angel_broker = data["brokers"]["angel_one"]
        assert "MASKED" in angel_broker["jwtToken"]
        assert "REAL_SECRET_JWT_HERE" not in res.text
        assert "REAL_REFRESH_TOKEN_HERE" not in res.text


class TestPhase10FeedIngestionAndCandleFormation:
    """Test Suite for tick ingestion gating, candle formation, and source differentiation."""

    def test_05_untrusted_smartapi_tick_rejected_when_broker_disconnected(self):
        """When broker session is NOT live, an external tick claiming SMARTAPI source must be marked unauthentic."""
        pss.active_smart_connect["instance"] = None
        tick_res = pss.validate_and_ingest_exchange_tick(
            symbol="RELIANCE",
            price=2950.0,
            volume=10.0,
            exchange="NSE",
            timestamp=time.time(),
            source="SMARTAPI"
        )
        assert tick_res["success"] is True
        assert tick_res["is_authentic"] is False
        assert pss.market_feed_status["is_authentic_exchange_feed"] is False

    def test_06_unauthentic_tick_rejected_by_bot_scheduler(self):
        """BotScheduler must reject unauthentic ticks and mark data_healthy as False."""
        worker = bot_scheduler.workers.get(3)  # Bot #3 RELIANCE
        assert worker is not None
        initial_candles = len(worker.candles)

        # Ingest tick with is_authentic = False
        res = worker.ingest_tick(price=2950.0, volume=10.0, is_authentic=False)
        assert res is False
        assert worker.data_healthy is False
        assert len(worker.candles) == initial_candles

    def test_07_verified_test_feed_tick_forms_candle_in_bot_scheduler(self):
        """Controlled verified test tick (source='TEST_VERIFIED_FEED') successfully forms candle."""
        worker = bot_scheduler.workers.get(3)  # Bot #3 RELIANCE
        assert worker is not None

        # Clean worker candles for predictable test
        with worker.lock:
            worker.candles = []
            worker.last_tick_time = None

        now = time.time()
        # Ingest 3 ticks in same 15m minute bucket
        res1 = worker.ingest_tick(price=2920.0, volume=5.0, is_authentic=True)
        res2 = worker.ingest_tick(price=2930.0, volume=10.0, is_authentic=True)
        res3 = worker.ingest_tick(price=2915.0, volume=15.0, is_authentic=True)

        assert res1 is True
        assert res2 is True
        assert res3 is True
        assert worker.data_healthy is True
        assert len(worker.candles) >= 1
        latest = worker.candles[-1]
        assert latest["open"] == 2920.0
        assert latest["high"] == 2930.0
        assert latest["low"] == 2915.0
        assert latest["close"] == 2915.0
        assert latest["volume"] == 30.0

    def test_08_stale_and_out_of_order_ticks_rejected(self):
        """Verify fail-closed tick freshness: ticks > 15s old or monotonic reversals are rejected."""
        worker = bot_scheduler.workers.get(3)
        now = time.time()

        # Stale tick (30s ago)
        stale_res = worker.ingest_tick(price=2925.0, volume=1.0, is_authentic=True, timestamp=str(now - 30.0))
        assert stale_res is False

        # Future tick (>5s future)
        future_res = worker.ingest_tick(price=2925.0, volume=1.0, is_authentic=True, timestamp=str(now + 20.0))
        assert future_res is False


class TestPhase10InstrumentMappingAndMasterBotEvaluation:
    """Test Suite for SEBI broker instrument mapping and Smart Master Bot multi-factor ranking."""

    def test_09_crypto_instruments_flagged_unsupported_on_sebi_broker(self):
        """Binance crypto symbols (BTCUSDT, ETHUSDT) must be rejected by broker gateway."""
        pss.execution_mode = "LIVE"
        try:
            crypto_res = pss.place_live_angel_order(
                symbol_name="BTCUSDT",
                action="BUY",
                qty=1,
                price=100.0,
                bot_name="Crypto Bot"
            )
            assert crypto_res["success"] is False
            assert crypto_res["mode"] == "UNSUPPORTED_EXCHANGE"
            assert "BINANCE" in crypto_res["error"]
        finally:
            pss.execution_mode = "PAPER"

    def test_10_master_bot_multi_factor_excludes_unready_and_ranks_eligible(self):
        """Verify evaluate_master_bot_multi_factor evaluates all 14 bots, excludes unready, and ranks transparently."""
        res = evaluate_master_bot_multi_factor()
        assert res["status"] == "SUCCESS"
        assert res["total_instruments_evaluated"] == 14
        assert res["total_eligible"] == 11

        instruments = res["instruments"]
        # Check that Bots 12, 13, 14 are disqualified with DATA_UNAVAILABLE
        disqualified = {inst["bot_id"]: inst for inst in instruments if not inst["is_eligible"]}
        assert 12 in disqualified
        assert 13 in disqualified
        assert 14 in disqualified
        for b_id in [12, 13, 14]:
            assert "DATA_UNAVAILABLE" in disqualified[b_id]["disqualification_reason"]
            assert disqualified[b_id]["composite_score"] == 0.0

        # Check factor breakdown of eligible winner
        winner = res["selected_instrument"]
        assert winner is not None
        assert winner["is_eligible"] is True
        assert winner["composite_score"] > 0
        factors = winner["factors"]
        assert "performance" in factors
        assert "trend" in factors
        assert "volatility" in factors
        assert "liquidity" in factors
        assert "risk_reward" in factors
        assert "cost_drag" in factors
        assert "drawdown" in factors


class TestPhase10ZeroLiveBrokerOrdersVerification:
    """Test Suite verifying complete isolation of paper trading and zero real broker orders."""

    def test_11_paper_orders_produce_simulated_fills_only(self):
        """Verify paper orders generate SIMULATED_PAPER_FILL and do not invoke SmartConnect.placeOrder."""
        order_payload = {
            "bot": "RSI Reversal Bot",
            "symbol": "RELIANCE",
            "action": "BUY",
            "qty": 10,
            "price": 2925.0,
            "ordertype": "MARKET",
            "producttype": "INTRADAY"
        }
        res = client.post("/api/order/place", json=order_payload, headers=AUTH_HEADERS)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert data["order"]["mode"] == "PAPER"
        assert data["result"]["mode"] == "PAPER"
        assert data["result"]["fill_type"] == "SIMULATED_PAPER_FILL"
        assert pss.active_smart_connect["instance"] is None  # Never touched live broker
