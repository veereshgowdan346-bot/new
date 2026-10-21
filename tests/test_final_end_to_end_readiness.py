"""
CHINTU AI TRADING SYSTEM - Final End-to-End Readiness Audit Tests
Authoritative Test Suite Verifying:
1. SmartAPI Auth Error Classification (AB1004, AB1005, AB1010, AB1012, AB2001, AG8001).
2. Safe Session Token Refresh Wrapper without Credential Exposure.
3. SmartWebSocketV2 Lifecycle, Connection Management, and Active Subscriptions.
4. 14 Canonical Bots Instrument Master Resolution, Lot Sizes, and Exchange Types.
5. Strict PAPER-Mode Enforcement, Fail-Closed Security, and Zero Live Broker Orders.
"""

import time
import pytest
from unittest.mock import MagicMock, patch
from server.angel_feed_manager import (
    InstrumentAuditor,
    AngelOneWebSocketManager,
    angel_feed_manager
)
from server.bot_registry import CANONICAL_BOT_REGISTRY
from server.instrument_master import instrument_master
from server.live_readiness_gate import evaluate_live_readiness
import server.python_stream_server as pss


@pytest.fixture(autouse=True)
def preserve_paper_environment():
    """Guarantees system remains in strict PAPER execution mode throughout tests."""
    pss.execution_mode = "PAPER"
    angel_feed_manager.execution_mode = "PAPER"
    pss.active_smart_connect["instance"] = None
    pss.market_feed_status["provider"] = "SYNTHETIC_RANDOM_WALK"
    pss.market_feed_status["is_authentic_exchange_feed"] = False
    yield
    pss.execution_mode = "PAPER"
    angel_feed_manager.execution_mode = "PAPER"
    pss.active_smart_connect["instance"] = None


class TestAuthErrorClassification:
    """Verifies classification and remediation advice for all standard Angel One SmartAPI errors."""

    def test_classify_ab1004_static_ip_mismatch(self):
        """AB1004 indicates IP whitelist mismatch or invalid API key."""
        res = AngelOneWebSocketManager.classify_auth_error("AB1004: Client Public IP mismatch")
        assert res["error_code"] == "AB1004"
        assert res["category"] == "STATIC_IP_OR_KEY_MISMATCH"
        assert res["is_fatal"] is True
        assert res["requires_totp_reauth"] is False
        assert "whitelist" in res["remediation"].lower() or "developer console" in res["remediation"].lower()

    def test_classify_ab1005_unauthorized(self):
        """AB1005 indicates unauthorized access or blocked account."""
        res = AngelOneWebSocketManager.classify_auth_error("AB1005: Access Denied")
        assert res["error_code"] == "AB1005"
        assert res["category"] == "UNAUTHORIZED_OR_BLOCKED"
        assert res["is_fatal"] is True
        assert res["requires_totp_reauth"] is True

    def test_classify_ab1010_invalid_totp_or_credentials(self):
        """AB1010 indicates invalid Client ID, PIN, or TOTP."""
        res = AngelOneWebSocketManager.classify_auth_error("AB1010: Invalid TOTP or Password")
        assert res["error_code"] == "AB1010"
        assert res["category"] == "INVALID_CREDENTIALS_OR_TOTP"
        assert res["is_fatal"] is True
        assert res["requires_totp_reauth"] is True
        assert "ntp" in res["remediation"].lower() or "totp" in res["remediation"].lower()

    def test_classify_ab1012_session_expired(self):
        """AB1012 indicates session or JWT token expiration."""
        res = AngelOneWebSocketManager.classify_auth_error("AB1012: Session Expired")
        assert res["error_code"] == "AB1012"
        assert res["category"] == "TOKEN_EXPIRED"
        assert res["is_fatal"] is False
        assert res["requires_totp_reauth"] is True

    def test_classify_ab2001_rate_limit(self):
        """AB2001 indicates request rate limiting."""
        res = AngelOneWebSocketManager.classify_auth_error("AB2001: Rate limit exceeded")
        assert res["error_code"] == "AB2001"
        assert res["category"] == "RATE_LIMIT_EXCEEDED"
        assert res["is_fatal"] is False

    def test_classify_ag8001_broker_maintenance(self):
        """AG8001 indicates backend broker maintenance or outage."""
        res = AngelOneWebSocketManager.classify_auth_error("AG8001: Broker Service Unavailable")
        assert res["error_code"] == "AG8001"
        assert res["category"] == "BROKER_SERVICE_ERROR"
        assert res["is_fatal"] is False

    def test_classify_missing_credentials(self):
        """Handles missing configuration gracefully."""
        res = AngelOneWebSocketManager.classify_auth_error("Credentials not configured in environment")
        assert res["error_code"] == "MISSING_CREDENTIALS"
        assert res["category"] == "MISSING_CONFIGURATION"
        assert res["is_fatal"] is True


class TestSafeSessionTokenRefresh:
    """Verifies safe token renewal via generateToken(refreshToken) without secret leaks."""

    def test_refresh_tokens_success(self):
        """Simulates successful token renewal returning sanitized status."""
        mgr = AngelOneWebSocketManager()
        mock_smart = MagicMock()
        mock_smart.generateToken.return_value = {
            "status": True,
            "message": "SUCCESS",
            "data": {
                "jwtToken": "mock_renewed_jwt_token_12345",
                "feedToken": "mock_renewed_feed_token_67890"
            }
        }

        res = mgr.refresh_session_tokens(mock_smart, "mock_refresh_token_abc")
        assert res["success"] is True
        assert res["status"] == "TOKEN_REFRESHED"
        assert res["has_jwt"] is True
        assert res["has_feed_token"] is True
        # Verify no token values leaked in response dict
        assert "mock_renewed_jwt_token_12345" not in str(res)
        assert "mock_renewed_feed_token_67890" not in str(res)
        assert mgr.is_authenticated is True
        assert mgr.feed_token == "mock_renewed_feed_token_67890"

    def test_refresh_tokens_failure(self):
        """Simulates failed token renewal and verifies structured classification."""
        mgr = AngelOneWebSocketManager()
        mock_smart = MagicMock()
        mock_smart.generateToken.return_value = {
            "status": False,
            "message": "AB1012: Token expired and cannot be refreshed",
            "errorcode": "AB1012"
        }

        res = mgr.refresh_session_tokens(mock_smart, "expired_refresh_token")
        assert res["success"] is False
        assert res["status"] == "TOKEN_REFRESH_FAILED"
        assert res["error_classification"]["error_code"] == "AB1012"

    def test_refresh_tokens_invalid_inputs(self):
        """Validates that None or empty inputs return clean failure dicts."""
        mgr = AngelOneWebSocketManager()
        assert mgr.refresh_session_tokens(None, "token")["status"] == "NO_SMARTCONNECT_INSTANCE"
        assert mgr.refresh_session_tokens(MagicMock(), "")["status"] == "INVALID_REFRESH_TOKEN"


class TestWebSocketLifecycleAndSubscriptions:
    """Verifies SmartWebSocketV2 connection, background threading, callbacks, and subscriptions."""

    def test_connect_websocket_missing_params(self):
        """Ensures connection fails safely if required parameters are missing."""
        mgr = AngelOneWebSocketManager()
        res = mgr.connect_websocket(auth_token="", api_key="", client_code="", feed_token="")
        assert res["status"] == "MISSING_PARAMETERS"
        assert res["is_connected"] is False

    @patch("server.angel_feed_manager.SmartWebSocketV2")
    def test_connect_websocket_wiring_and_callbacks(self, mock_sws_cls):
        """Verifies SmartWebSocketV2 instantiation, callbacks, and automatic active subscriptions."""
        mock_sws_inst = MagicMock()
        mock_sws_cls.return_value = mock_sws_inst

        mgr = AngelOneWebSocketManager()
        res = mgr.connect_websocket(
            auth_token="test_jwt",
            api_key="test_key",
            client_code="test_client",
            feed_token="test_feed",
            run_in_background=False
        )

        assert res["status"] == "CONNECTED"
        assert mgr.ws is mock_sws_inst
        mock_sws_inst.connect.assert_called_once()

        # Simulate on_open callback
        mock_sws_inst.on_open(mock_sws_inst)
        assert mgr.is_connected is True
        assert mgr.feed_status == "CONNECTED"
        assert mgr.subscription_acknowledged is True
        mock_sws_inst.subscribe.assert_called_once()

        # Simulate on_data callback with Mode 1 binary packet
        mgr.handle_binary_tick = MagicMock()
        mock_sws_inst.on_data(mock_sws_inst, {"token": "2885", "price": 2950.0})
        mgr.handle_binary_tick.assert_called_once()

        # Simulate disconnect
        disc_res = mgr.disconnect_websocket()
        assert disc_res["status"] == "DISCONNECTED"
        assert mgr.is_connected is False
        mock_sws_inst.close_connection.assert_called_once()

    def test_subscribe_active_tokens_organization(self):
        """Verifies all 14 bots are mapped to official SEBI exchangeTypes without missing contracts."""
        mgr = AngelOneWebSocketManager()
        token_list = mgr.build_token_list_for_subscription()

        # Check exchange types present
        exchange_types = {group["exchangeType"] for group in token_list}
        assert 1 in exchange_types   # NSE Cash (RELIANCE, HDFCBANK, INFY)
        assert 2 in exchange_types   # NFO Derivatives (NIFTY FUT, BANKNIFTY FUT, FINNIFTY FUT, Options)

        # Check total tokens subscribed matches 13 tradable bots (Bot 4 blocked)
        all_tokens = [tok for group in token_list for tok in group["tokens"]]
        assert len(all_tokens) == 13
        assert len(set(all_tokens)) == 13  # All distinct tokens


class TestFourteenBotForensicAudit:
    """Verifies that 13 canonical bots resolve active instruments and Bot 4 is DISCREPANCY_BLOCKED."""

    def test_all_14_bots_resolution_and_bot4_discrepancy(self):
        """Audits every canonical bot against DynamicInstrumentMaster."""
        instrument_master.ensure_loaded()
        assert len(CANONICAL_BOT_REGISTRY) == 14

        tradable_bot_ids = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
        for bot_id in tradable_bot_ids:
            bot = CANONICAL_BOT_REGISTRY[bot_id]
            audit = instrument_master.audit_bot_mapping(bot)
            assert audit["is_tradable"] is True, f"Bot {bot_id} ({bot['name']}) unexpectedly untradable: {audit}"
            assert audit["resolved_contract"] is not None, f"Bot {bot_id} ({bot['name']}) has no resolved contract"
            
            contract = audit["resolved_contract"]
            token = contract.get("token")
            assert token and len(str(token)) > 0, f"Bot {bot_id} contract missing token: {contract}"
            
            exch = contract.get("exch_seg")
            assert exch in ["NSE", "NFO", "BSE", "BFO", "MCX", "CDS"], f"Invalid exchange for Bot {bot_id}: {exch}"
            
            lotsize = int(contract.get("lotsize", 1))
            assert lotsize >= 1, f"Invalid lot size for Bot {bot_id}: {lotsize}"

        # Verify Bot 4 is DISCREPANCY_BLOCKED
        bot4_audit = instrument_master.audit_bot_mapping(CANONICAL_BOT_REGISTRY[4])
        assert bot4_audit["status"] == "DISCREPANCY_BLOCKED"
        assert bot4_audit["is_tradable"] is False
        assert bot4_audit["resolved_contract"] is None
        assert "TATAMOTORS-EQ" in bot4_audit["reason"]

    def test_permanent_cash_equities_never_expired(self):
        """Verifies the permanent cash equity bots (RELIANCE, HDFCBANK, INFY) are permanently valid."""
        cash_bot_ids = [3, 6, 7]  # RELIANCE, HDFCBANK, INFY
        for b_id in cash_bot_ids:
            bot = CANONICAL_BOT_REGISTRY[b_id]
            audit = instrument_master.audit_bot_mapping(bot)
            assert audit["status"] == "VALID_PERMANENT_EQUITY"
            assert audit["is_tradable"] is True
            assert audit["resolved_contract"]["expiry"] == ""


class TestStartupPreflightAndFeedAuthenticity:
    """Verifies startup preflight reporting and market data authenticity gating."""

    def test_startup_preflight_reports_all_7_dimensions_zero_secrets(self):
        """Validates that startup preflight reports all 7 dimensions without exposing secrets."""
        from server.startup_preflight import run_startup_preflight
        report = run_startup_preflight()

        # 1. Configuration
        assert "configuration_status" in report
        assert "missing_configuration_names" in report["configuration_status"]
        assert isinstance(report["configuration_status"]["missing_configuration_names"], list)

        # 2. Authentication
        assert "authentication_status" in report
        assert report["authentication_status"]["is_authenticated"] is False

        # 3. WebSocket
        assert "websocket_status" in report
        assert report["websocket_status"]["is_connected"] is False

        # 4. Authentic Tick
        assert "authentic_tick_status" in report
        assert report["authentic_tick_status"]["authentic_ticks_count"] == 0

        # 5. Per-Bot Readiness
        assert "per_bot_instrument_readiness" in report
        bots_data = report["per_bot_instrument_readiness"]
        assert bots_data["total_canonical_bots"] == 14
        assert bots_data["tradable_bots_count"] == 13
        assert bots_data["blocked_bots_count"] == 1
        assert 4 in bots_data["discrepancy_blocked_bots"]

        # 6. PAPER Execution
        assert "paper_execution_status" in report
        assert report["paper_execution_status"]["is_paper"] is True
        assert report["paper_execution_status"]["real_broker_orders_disabled"] is True

        # 7. LIVE Readiness Blockers
        assert "live_readiness_blockers" in report
        assert report["live_readiness_blockers"]["ready_for_live"] is False
        assert len(report["live_readiness_blockers"]["failed_conditions"]) > 0

    def test_websocket_connection_not_mistaken_for_valid_market_data(self):
        """Verifies connected WebSocket alone fails authenticity check if authentic ticks count is 0."""
        # Simulate active WebSocket connection and subscription with zero authentic ticks
        pss.broker_state["angel_one"]["connected"] = True
        pss.active_smart_connect["instance"] = MagicMock()
        pss.market_feed_status["provider"] = "ANGEL_ONE_SMARTAPI"
        pss.market_feed_status["is_subscribed"] = True
        pss.market_feed_status["last_tick_time"] = time.time()
        angel_feed_manager.authentic_ticks_count = 0

        eval_res = pss.evaluate_server_market_feed_state()
        assert eval_res["authentic"] is False
        assert eval_res["reason"] in ("ZERO_AUTHENTIC_TICKS", "MARKET_CLOSED")


class TestFailClosedSecurityAndZeroBrokerOrder:
    """Verifies that under no circumstances can real broker orders be submitted."""

    def test_execution_mode_is_strictly_paper(self):
        """Verifies application state guarantees PAPER mode."""
        assert pss.execution_mode == "PAPER"
        assert angel_feed_manager.execution_mode == "PAPER"

    def test_live_readiness_gate_rejects_transition(self):
        """Evaluates Live-Readiness Gate and confirms it blocks transition."""
        readiness = evaluate_live_readiness(
            broker_state=pss.broker_state,
            active_smart_connect=pss.active_smart_connect,
            market_feed_evaluator_fn=pss.evaluate_server_market_feed_state,
            rms_state=pss.rms_state,
            reconciliation_state=pss.reconciliation_state,
            user_consent_provided=False
        )
        assert readiness["ready_for_live"] is False
        assert readiness["failed_count"] > 0
        assert len(readiness["failed_conditions"]) > 0

    def test_smartconnect_place_order_is_never_called(self):
        """Verifies that in PAPER mode, place_live_angel_order uses paper simulation only."""
        with patch("server.python_stream_server.SmartConnect") as mock_sc:
            mock_inst = MagicMock()
            mock_sc.return_value = mock_inst

            # Trigger paper order execution
            result = pss.place_live_angel_order(
                symbol_name="RELIANCE",
                action="BUY",
                qty=1,
                price=2950.0,
                bot_name="Bot 3 - High-Frequency Alpha Scalper"
            )

            assert result["success"] is True
            assert result["mode"] == "PAPER"
            # Verify SmartConnect.placeOrder was NEVER invoked
            mock_inst.placeOrder.assert_not_called()
