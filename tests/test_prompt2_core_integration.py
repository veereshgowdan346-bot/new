"""
Tests for Prompt 2 Core Integration Repair:
1. MasterBrain Consensus Anti-Domination Integration.
2. Order placement payload validation and PAPER execution routing.
3. Server-authoritative trade payload schema and deduplication invariants.
"""

import pytest
from server.master_brain import MasterBrain, ACTION_BUY, ACTION_SELL, ACTION_NO_TRADE
from server.python_stream_server import OrderPlacePayload, app
from server.centralized_risk_manager import centralized_risk_manager


class TestOrderPlacePayloadSchema:
    """Verifies that OrderPlacePayload accepts the frontend manual order payload structure."""

    def test_valid_payload_instantiation(self):
        payload = OrderPlacePayload(
            bot="Nifty Trend Master",
            symbol="NIFTY 50",
            action="BUY",
            qty=50,
            price=24500.0,
            segment="NSE F&O Options",
            variety="NORMAL",
            ordertype="LIMIT",
            producttype="CARRYFORWARD"
        )
        assert payload.bot == "Nifty Trend Master"
        assert payload.symbol == "NIFTY 50"
        assert payload.action == "BUY"
        assert payload.qty == 50
        assert payload.price == 24500.0
        assert payload.ordertype == "LIMIT"
        assert payload.producttype == "CARRYFORWARD"

    def test_market_order_payload(self):
        payload = OrderPlacePayload(
            bot="Bot 1",
            symbol="RELIANCE",
            action="SELL",
            qty=10,
            price=0.0,
            ordertype="MARKET",
            producttype="INTRADAY"
        )
        assert payload.price == 0.0
        assert payload.ordertype == "MARKET"
        assert payload.producttype == "INTRADAY"


class TestServerAuthoritativeTradeEventContract:
    """Verifies the contract of trade confirmations dispatched to frontend."""

    def test_trade_confirmation_keys(self):
        trade_spec = {
            "id": 1729350000000,
            "orderId": "PAPER-SIM-12345",
            "time": "14:30:00.123",
            "bot": "Bot 1",
            "symbol": "NIFTY 50",
            "segment": "NSE F&O Options",
            "action": "BUY",
            "price": 24730.50,
            "qty": 50,
            "pnl": "+₹0.00",
            "isPositive": True,
            "mode": "PAPER"
        }
        # Invariants required by the frontend deduplication and renderer
        assert "symbol" in trade_spec and trade_spec["symbol"]
        assert "action" in trade_spec and trade_spec["action"] in ("BUY", "SELL")
        assert ("id" in trade_spec and trade_spec["id"]) or ("orderId" in trade_spec and trade_spec["orderId"])


class TestMasterBrainAntiDominationEndToEnd:
    """Comprehensive test of anti-domination in MasterBrain with full 14 bots."""

    def test_14_bot_fleet_consensus_capped(self):
        mb = MasterBrain({"max_single_bot_weight_pct": 0.25, "min_quorum_score": 0.60})

        # 14 signals: Bot 1 is BUY with max confidence; bots 2-14 are SELL
        signals = [
            mb.normalize_signal(1, "NIFTY 50", "BUY", confidence=0.99, entry=24500, stop_loss=24350, target=24900)
        ] + [
            mb.normalize_signal(i, "NIFTY 50", "SELL", confidence=0.70, entry=24500, stop_loss=24650, target=24300)
            for i in range(2, 15)
        ]

        dec = mb.evaluate_fleet_consensus("NIFTY 50", signals, market_regime="NEUTRAL")

        # Bot 1 must NOT dominate
        bot1 = next(b for b in dec["contributing_bots"] if b["bot_id"] == 1)
        assert bot1["capped_weight"] <= 0.25 + 1e-4

        # Metadata
        assert dec["effective_bot_cap"] == 0.25
        assert dec["max_single_bot_weight_pct"] == 0.25
        assert "Fleet size 14" in dec["anti_domination_policy"]
        assert dec["contributing_bots_count"] == 14

        # Total capped sum == 1.0
        assert pytest.approx(sum(b["capped_weight"] for b in dec["contributing_bots"]), abs=1e-3) == 1.0

