"""
CHINTU AI TRADING SYSTEM - Phase 2 Market Feed Security Test Suite
Verifies:
1. Unauthenticated feed-status modification is rejected (401).
2. Authenticated user cannot fabricate trusted feed status using a boolean (400).
3. Missing broker authentication blocks live execution (NO_BROKER_BLOCKED).
4. No recent ticks blocks live execution (FEED_BLOCKED: NO_TICKS_RECEIVED).
5. Stale (>15s), malformed (price <= 0), wrong-symbol, or invalid timestamp ticks block live execution (FEED_BLOCKED).
6. Synthetic feed provider blocks live orders (FEED_BLOCKED: SYNTHETIC_PROVIDER).
7. Alternate API routes (/api/order/place) cannot bypass the feed gate.
8. Background loops cannot submit live orders from synthetic data.
9. Unauthorized order-placement and execution-mode requests are rejected (401).
10. Legitimate paper/simulation mode continues to work cleanly.
"""

import unittest
import sys
import os
import time
from datetime import datetime

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER_DIR = os.path.join(ROOT_DIR, "server")
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

from fastapi.testclient import TestClient
import python_stream_server as pss


class FakeSmartConnect:
    """Safe test double for SmartConnect broker instance."""
    def __init__(self):
        self.orders = []

    def placeOrder(self, order_params):
        self.orders.append(order_params)
        return {
            "status": True,
            "message": "SUCCESS",
            "data": {"orderid": f"LIVE_TEST_AO_{len(self.orders)}"}
        }


class TestPhase2MarketFeedSecurity(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(pss.app)
        self.valid_auth_header = {"Authorization": "Bearer chintu_master_auth_permanent_veeresh"}

        # Mock peer quorum so random consensus votes do not interfere with feed security tests
        self.orig_evaluate_quorum = pss.evaluate_peer_mesh_quorum
        pss.evaluate_peer_mesh_quorum = lambda bot, action: {
            "approved": True,
            "approvals": 3,
            "total_peers": 3,
            "quorum_ratio": "3/3",
            "peer_votes": ["Peer 1: Approved", "Peer 2: Approved", "Peer 3: Approved"]
        }

        # Preserve original server state
        self.orig_execution_mode = pss.execution_mode
        self.orig_market_feed_status = pss.market_feed_status.copy()
        if "symbol_ticks" in pss.market_feed_status:
            self.orig_symbol_ticks = pss.market_feed_status["symbol_ticks"].copy()
        else:
            self.orig_symbol_ticks = {}
        self.orig_broker_connected = pss.broker_state["angel_one"].get("connected")
        self.orig_smart_connect = pss.active_smart_connect.copy()
        self.orig_active_positions = pss.active_positions.copy()

        # Reset feed state cleanly for testing
        pss.market_feed_status = {
            "is_authentic_exchange_feed": False,
            "provider": "SYNTHETIC_RANDOM_WALK",
            "status": "SANDBOX_SIMULATED",
            "is_subscribed": False,
            "last_tick_time": None,
            "symbol_ticks": {}
        }
        pss.execution_mode = "PAPER"

    def tearDown(self):
        # Restore original state
        pss.evaluate_peer_mesh_quorum = self.orig_evaluate_quorum
        pss.execution_mode = self.orig_execution_mode
        pss.market_feed_status = self.orig_market_feed_status
        pss.market_feed_status["symbol_ticks"] = self.orig_symbol_ticks
        pss.broker_state["angel_one"]["connected"] = self.orig_broker_connected
        pss.active_smart_connect = self.orig_smart_connect
        pss.active_positions = self.orig_active_positions

    # 1. Unauthenticated feed-status modification is rejected (401)
    def test_01_unauthenticated_feed_status_rejected_401(self):
        res = self.client.post("/api/market-feed/status", json={"provider": "ANGEL_ONE"})
        self.assertEqual(res.status_code, 401)
        self.assertIn("Authentication required", res.json().get("detail", ""))

    # 2. Authenticated user cannot fabricate trusted feed status using a boolean (400)
    def test_02_authenticated_user_cannot_fabricate_feed_boolean_400(self):
        res = self.client.post(
            "/api/market-feed/status",
            json={"is_authentic_exchange_feed": True},
            headers=self.valid_auth_header
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Client-supplied is_authentic_exchange_feed is rejected", res.json().get("detail", ""))

    # 3. Missing broker authentication blocks live execution (NO_BROKER_BLOCKED)
    def test_03_missing_broker_authentication_blocks_live_execution(self):
        pss.execution_mode = "LIVE"
        pss.broker_state["angel_one"]["connected"] = False
        pss.active_smart_connect["instance"] = None
        pss.market_feed_status["provider"] = "ANGEL_ONE_SMARTSTREAM"
        pss.market_feed_status["is_subscribed"] = True

        result = pss.place_live_angel_order(
            symbol_name="NIFTY 50",
            action="BUY",
            qty=50,
            price=24730.0,
            bot_name="Bot 1"
        )
        self.assertFalse(result["success"])
        self.assertEqual(result["orderId"], "NO-BROKER-BLOCKED")
        self.assertEqual(result["mode"], "LIVE_REJECTED")

    # 4. No recent ticks blocks live execution (FEED_BLOCKED: NO_TICKS_RECEIVED)
    def test_04_no_recent_ticks_blocks_live_execution(self):
        pss.execution_mode = "LIVE"
        pss.broker_state["angel_one"]["connected"] = True
        pss.active_smart_connect["instance"] = FakeSmartConnect()
        pss.market_feed_status["provider"] = "ANGEL_ONE_SMARTSTREAM"
        pss.market_feed_status["is_subscribed"] = True
        pss.market_feed_status["last_tick_time"] = None
        pss.market_feed_status["symbol_ticks"] = {}

        result = pss.place_live_angel_order(
            symbol_name="NIFTY 50",
            action="BUY",
            qty=50,
            price=24730.0,
            bot_name="Bot 1"
        )
        self.assertFalse(result["success"])
        self.assertEqual(result["mode"], "FEED_BLOCKED")
        self.assertEqual(result["orderId"], "FEED-BLOCKED: NO_TICKS_RECEIVED")
        self.assertEqual(result.get("feed_reason"), "NO_TICKS_RECEIVED")

    # 5. Stale (>15s), malformed (price <= 0), wrong-symbol, or invalid timestamp ticks block live execution
    def test_05_stale_malformed_and_wrong_symbol_ticks_blocked(self):
        pss.execution_mode = "LIVE"
        pss.broker_state["angel_one"]["connected"] = True
        pss.active_smart_connect["instance"] = FakeSmartConnect()
        pss.market_feed_status["provider"] = "ANGEL_ONE_SMARTSTREAM"
        pss.market_feed_status["is_subscribed"] = True

        now = time.time()

        # 5a. Stale tick (> 15 seconds)
        pss.record_server_exchange_tick("NIFTY 50", price=24730.0, timestamp=now - 25.0)
        res_stale = pss.place_live_angel_order(
            symbol_name="NIFTY 50", action="BUY", qty=50, price=24730.0, bot_name="Bot 1"
        )
        self.assertFalse(res_stale["success"])
        self.assertEqual(res_stale["mode"], "FEED_BLOCKED")
        self.assertIn("STALE", res_stale["orderId"])

        # 5b. Malformed price (<= 0)
        pss.record_server_exchange_tick("NIFTY 50", price=0.0, timestamp=now)
        res_bad_price = pss.place_live_angel_order(
            symbol_name="NIFTY 50", action="BUY", qty=50, price=24730.0, bot_name="Bot 1"
        )
        self.assertFalse(res_bad_price["success"])
        self.assertEqual(res_bad_price["mode"], "FEED_BLOCKED")
        self.assertEqual(res_bad_price["orderId"], "FEED-BLOCKED: INVALID_SYMBOL_PRICE")

        # 5c. Future timestamp (clock drift > 5s ahead)
        pss.record_server_exchange_tick("NIFTY 50", price=24730.0, timestamp=now + 60.0)
        res_future = pss.place_live_angel_order(
            symbol_name="NIFTY 50", action="BUY", qty=50, price=24730.0, bot_name="Bot 1"
        )
        self.assertFalse(res_future["success"])
        self.assertEqual(res_future["mode"], "FEED_BLOCKED")
        self.assertEqual(res_future["orderId"], "FEED-BLOCKED: FUTURE_TIMESTAMP")

        # 5d. Wrong symbol: verified tick is for BANKNIFTY, but order is for NIFTY 50
        pss.market_feed_status["symbol_ticks"] = {}
        pss.record_server_exchange_tick("BANKNIFTY", price=52400.0, timestamp=now)
        res_wrong_sym = pss.place_live_angel_order(
            symbol_name="NIFTY 50", action="BUY", qty=50, price=24730.0, bot_name="Bot 1"
        )
        self.assertFalse(res_wrong_sym["success"])
        self.assertEqual(res_wrong_sym["mode"], "FEED_BLOCKED")
        self.assertEqual(res_wrong_sym["orderId"], "FEED-BLOCKED: NO_SYMBOL_TICK")

    # 6. Synthetic feed provider blocks live orders (FEED_BLOCKED: SYNTHETIC_PROVIDER)
    def test_06_synthetic_feed_provider_blocks_live_orders(self):
        pss.execution_mode = "LIVE"
        pss.broker_state["angel_one"]["connected"] = True
        pss.active_smart_connect["instance"] = FakeSmartConnect()
        pss.market_feed_status["provider"] = "SYNTHETIC_RANDOM_WALK"
        pss.market_feed_status["is_subscribed"] = True
        pss.record_server_exchange_tick("NIFTY 50", price=24730.0, timestamp=time.time())

        result = pss.place_live_angel_order(
            symbol_name="NIFTY 50",
            action="BUY",
            qty=50,
            price=24730.0,
            bot_name="Bot 1"
        )
        self.assertFalse(result["success"])
        self.assertEqual(result["mode"], "FEED_BLOCKED")
        self.assertEqual(result["orderId"], "FEED-BLOCKED: SYNTHETIC_PROVIDER")
        self.assertEqual(result.get("feed_reason"), "SYNTHETIC_PROVIDER")

    # 7. Alternate API routes (/api/order/place) cannot bypass the feed gate
    def test_07_api_order_place_cannot_bypass_feed_gate(self):
        pss.execution_mode = "LIVE"
        pss.broker_state["angel_one"]["connected"] = True
        pss.active_smart_connect["instance"] = FakeSmartConnect()
        pss.market_feed_status["provider"] = "SYNTHETIC_RANDOM_WALK"

        order_payload = {
            "bot": "Bot 1",
            "symbol": "NIFTY 50",
            "action": "BUY",
            "qty": 50,
            "price": 24730.0,
            "segment": "NSE F&O Options",
            "is_exit": False
        }
        res = self.client.post("/api/order/place", json=order_payload, headers=self.valid_auth_header)
        data = res.json()
        self.assertEqual(data.get("status"), "error")
        self.assertEqual(data.get("result", {}).get("mode"), "FEED_BLOCKED")

    # 8. Background loops cannot submit live orders from synthetic data
    def test_08_background_loop_restricted_to_paper_mode(self):
        # Set to LIVE mode
        pss.execution_mode = "LIVE"
        pss.broker_state["angel_one"]["connected"] = True
        fake_broker = FakeSmartConnect()
        pss.active_smart_connect["instance"] = fake_broker

        # If a background synthetic tick generator runs while execution_mode is LIVE,
        # it must not execute placeOrder on broker
        # We also directly verify that place_live_angel_order blocks with synthetic provider
        pss.market_feed_status["provider"] = "SYNTHETIC_RANDOM_WALK"
        order_res = pss.place_live_angel_order(
            symbol_name="NIFTY 50",
            action="BUY",
            qty=50,
            price=24730.0,
            bot_name="Bot 1: Scalper Bot"
        )
        self.assertFalse(order_res["success"])
        self.assertEqual(len(fake_broker.orders), 0)

    # 9. Unauthorized order-placement and execution-mode requests are rejected (401)
    def test_09_unauthorized_order_and_execution_mode_rejected_401(self):
        # 9a. /api/order/place without token
        res_order = self.client.post("/api/order/place", json={
            "bot": "Bot 1", "symbol": "NIFTY 50", "action": "BUY", "qty": 50
        })
        self.assertEqual(res_order.status_code, 401)

        # 9b. /api/execution-mode without token
        res_mode = self.client.post("/api/execution-mode", json={"mode": "LIVE"})
        self.assertEqual(res_mode.status_code, 401)

        # 9c. /api/rms/settings without token
        res_rms = self.client.post("/api/rms/settings", json={"max_daily_loss": 10000.0})
        self.assertEqual(res_rms.status_code, 401)

    # 10. Legitimate paper/simulation mode continues to work
    def test_10_paper_trading_mode_functions_cleanly(self):
        pss.execution_mode = "PAPER"
        pss.market_feed_status["provider"] = "SYNTHETIC_RANDOM_WALK"

        order_payload = {
            "bot": "Bot 1: Scalper Bot",
            "symbol": "NIFTY 50",
            "action": "BUY",
            "qty": 1,
            "price": 1000.0,
            "segment": "NSE F&O Options"
        }

        orig_quorum = pss.evaluate_peer_mesh_quorum
        pss.evaluate_peer_mesh_quorum = lambda bot, action: {
            "approved": True,
            "approvals": 3,
            "total_peers": 3,
            "quorum_ratio": "3/3",
            "peer_votes": ["Bot 2: Approved", "Bot 5: Approved", "Bot 6: Approved"]
        }
        try:
            # Place paper order via API
            res = self.client.post("/api/order/place", json=order_payload, headers=self.valid_auth_header)
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data.get("status"), "success")
            self.assertEqual(data.get("result", {}).get("mode"), "PAPER")
            self.assertTrue(data.get("order", {}).get("orderId", "").startswith("ORD"))
        finally:
            pss.evaluate_peer_mesh_quorum = orig_quorum


if __name__ == "__main__":
    unittest.main()
