"""
CHINTU AI TRADING SYSTEM - Emergency Exit & Risk Management Integrity Test Suite
Phase 1 Requirements:
1. Quorum rejection during emergency exit (Bypass verification)
2. RMS active during emergency exit (Exit allowed, entry blocked)
3. Invalid or excessive exit quantities
4. Duplicate square-off requests (In-flight locking)
5. Broker rejection, timeout, and failure handling (Position retention)
6. Multiple positions where only some exits succeed (Partial failure reporting)
"""

import unittest
import asyncio
import sys
import os

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER_DIR = os.path.join(ROOT_DIR, "server")
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

import python_stream_server as pss


class FakeBroker:
    """Mock broker simulating Angel One SmartConnect interface in safe isolation."""
    def __init__(self, should_fail=False, error_msg="Exchange Network Timeout", fail_symbols=None):
        self.should_fail = should_fail
        self.error_msg = error_msg
        self.fail_symbols = fail_symbols or []
        self.placed_orders = []

    def placeOrder(self, order_params):
        symbol = order_params.get("tradingsymbol", "")
        if self.should_fail or symbol in self.fail_symbols or any(f in symbol for f in self.fail_symbols):
            raise Exception(self.error_msg)
        self.placed_orders.append(order_params)
        return {
            "status": True,
            "message": "SUCCESS",
            "data": {"orderid": f"FAKE_AO_{len(self.placed_orders)}"}
        }


class TestPhase1EmergencyExitAndRMS(unittest.TestCase):

    def setUp(self):
        import tempfile
        self.temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_db_path = self.temp_db.name
        self.temp_db.close()
        import memory_db
        from server import memory_db as server_memory_db
        self.orig_db_path = memory_db.DB_PATH
        memory_db.DB_PATH = self.temp_db_path
        server_memory_db.DB_PATH = self.temp_db_path
        pss.memory_db.DB_PATH = self.temp_db_path
        memory_db.init_db()

        # Save original states
        self.orig_mode = pss.execution_mode
        self.orig_rms = pss.rms_state.copy()
        self.orig_feed = pss.market_feed_status.copy()
        self.orig_positions = pss.active_positions.copy()
        self.orig_broker_state = pss.broker_state["angel_one"].copy()
        self.orig_active_smart_connect = pss.active_smart_connect.copy()
        self.orig_in_flight = pss.in_flight_exits.copy()

        pss.active_positions.clear()
        pss.in_flight_exits.clear()

    def tearDown(self):
        # Restore original states
        pss.execution_mode = self.orig_mode
        pss.rms_state = self.orig_rms
        pss.market_feed_status = self.orig_feed
        pss.active_positions = self.orig_positions
        pss.broker_state["angel_one"] = self.orig_broker_state
        pss.active_smart_connect = self.orig_active_smart_connect
        pss.in_flight_exits = self.orig_in_flight

        import memory_db
        from server import memory_db as server_memory_db
        memory_db.DB_PATH = self.orig_db_path
        server_memory_db.DB_PATH = self.orig_db_path
        pss.memory_db.DB_PATH = self.orig_db_path
        if os.path.exists(self.temp_db_path):
            try:
                os.unlink(self.temp_db_path)
            except Exception:
                pass

    def test_quorum_bypassed_for_emergency_exit(self):
        """Emergency exit orders must NEVER be vetoed by peer mesh quorum."""
        # Force peer quorum to always fail
        orig_evaluate = pss.evaluate_peer_mesh_quorum
        pss.evaluate_peer_mesh_quorum = lambda bot, action: {
            "approved": False,
            "approvals": 0,
            "total_peers": 3,
            "quorum_ratio": "0/3",
            "peer_votes": []
        }
        try:
            # 1. Normal entry must be VETOED by quorum
            entry_res = pss.place_live_angel_order(
                symbol_name="NIFTY 50",
                action="BUY",
                qty=50,
                price=24700.0,
                bot_name="Bot 1",
                is_emergency_exit=False
            )
            self.assertFalse(entry_res["success"])
            self.assertEqual(entry_res["mode"], "QUORUM_DENIED")

            # 2. Emergency exit must BYPASS quorum and succeed
            exit_res = pss.place_live_angel_order(
                symbol_name="NIFTY 50",
                action="SELL",
                qty=50,
                price=24700.0,
                bot_name="Bot 1",
                is_emergency_exit=True
            )
            self.assertTrue(exit_res["success"])
            self.assertEqual(exit_res["mode"], "PAPER")
            self.assertEqual(exit_res["consensus"], "EMERGENCY_BYPASS")
        finally:
            pss.evaluate_peer_mesh_quorum = orig_evaluate

    def test_rms_circuit_breaker_permits_emergency_exit(self):
        """When RMS circuit breaker is ACTIVE, new entries are blocked, but exits are permitted."""
        pss.rms_state["circuit_breaker_active"] = True

        # 1. New entry order must be blocked by RMS
        entry_res = pss.place_live_angel_order(
            symbol_name="NIFTY 50",
            action="BUY",
            qty=50,
            price=24700.0,
            bot_name="Bot 1",
            is_emergency_exit=False
        )
        self.assertFalse(entry_res["success"])
        self.assertEqual(entry_res["mode"], "RMS_BLOCKED")

        # 2. Emergency exit order must be permitted
        exit_res = pss.place_live_angel_order(
            symbol_name="NIFTY 50",
            action="SELL",
            qty=50,
            price=24700.0,
            bot_name="Bot 1",
            is_emergency_exit=True
        )
        self.assertTrue(exit_res["success"])
        self.assertEqual(exit_res["mode"], "PAPER")

    def test_invalid_and_excessive_exit_quantities(self):
        """calculate_closing_order must strictly reject non-positive and excessive exit quantities."""
        position = {
            "id": "POS_TEST_100",
            "bot": "Bot 1: Scalper Bot",
            "symbol": "NIFTY 50",
            "segment": "NSE F&O Options",
            "type": "BUY",
            "qty": 50,
            "avgPrice": 24700.0,
            "ltp": 24750.0
        }

        # Quantity 0 -> must raise ValueError
        with self.assertRaises(ValueError) as ctx:
            pss.calculate_closing_order(position, requested_qty=0)
        self.assertIn("positive integer", str(ctx.exception).lower())

        # Negative quantity -> must raise ValueError
        with self.assertRaises(ValueError) as ctx:
            pss.calculate_closing_order(position, requested_qty=-10)
        self.assertIn("positive integer", str(ctx.exception).lower())

        # Excessive quantity (75 > 50) -> must raise ValueError
        with self.assertRaises(ValueError) as ctx:
            pss.calculate_closing_order(position, requested_qty=75)
        self.assertIn("exceeds open position quantity", str(ctx.exception).lower())

        # Valid partial quantity (25 <= 50) -> must succeed with qty 25
        valid_partial = pss.calculate_closing_order(position, requested_qty=25)
        self.assertEqual(valid_partial["qty"], 25)
        self.assertEqual(valid_partial["action"], "SELL")

    def test_duplicate_square_off_prevention(self):
        """A square-off request for an in-flight position must be rejected as duplicate."""
        pos_id = "POS_DUPLICATE_TEST"
        pss.active_positions[pos_id] = {
            "id": pos_id,
            "bot": "Bot 1: Scalper Bot",
            "symbol": "NIFTY 50",
            "segment": "NSE F&O Options",
            "type": "BUY",
            "qty": 50,
            "avgPrice": 24700.0,
            "ltp": 24750.0
        }

        # Simulate that this position is currently in flight
        pss.in_flight_exits.add(pos_id)

        payload = pss.SquareOffPayload(positionId=pos_id)
        res = asyncio.run(pss.square_off_position(payload))

        self.assertEqual(res["status"], "error")
        self.assertIn("already in flight", res["message"].lower())
        # Position must not be deleted
        self.assertIn(pos_id, pss.active_positions)

    def test_broker_rejection_preserves_position(self):
        """When broker rejects an exit, the position MUST be preserved in active book."""
        pss.execution_mode = "LIVE"
        pss.broker_state["angel_one"]["connected"] = True
        fake_broker = FakeBroker(should_fail=True, error_msg="Exchange Order Limit Exceeded")
        pss.active_smart_connect["instance"] = fake_broker

        pos_id = "POS_REJECT_TEST"
        pss.active_positions[pos_id] = {
            "id": pos_id,
            "bot": "Bot 1: Scalper Bot",
            "symbol": "NIFTY 50",
            "segment": "NSE F&O Options",
            "type": "BUY",
            "qty": 50,
            "avgPrice": 24700.0,
            "ltp": 24750.0
        }

        payload = pss.SquareOffPayload(positionId=pos_id)
        res = asyncio.run(pss.square_off_position(payload))

        self.assertEqual(res["status"], "error")
        self.assertIn("rejected", res["message"].lower())
        # CRUCIAL: Position MUST still exist in active_positions!
        self.assertIn(pos_id, pss.active_positions)
        self.assertEqual(pss.active_positions[pos_id]["qty"], 50)

    def test_square_off_all_handles_partial_failures(self):
        """Square-Off All must report per-instrument outcomes and keep failed positions open."""
        pss.execution_mode = "LIVE"
        pss.broker_state["angel_one"]["connected"] = True

        # Fake broker fails only on RELIANCE, succeeds on NIFTY
        fake_broker = FakeBroker(should_fail=False, fail_symbols=["RELIANCE"])
        pss.active_smart_connect["instance"] = fake_broker

        pos_1 = "POS_NIFTY_OK"
        pos_2 = "POS_RELIANCE_FAIL"

        pss.active_positions[pos_1] = {
            "id": pos_1,
            "bot": "Bot 1: Scalper Bot",
            "symbol": "NIFTY 50",
            "segment": "NSE F&O Options",
            "type": "BUY",
            "qty": 50,
            "avgPrice": 24700.0,
            "ltp": 24750.0
        }
        pss.active_positions[pos_2] = {
            "id": pos_2,
            "bot": "Bot 3: RSI Reversal Bot",
            "symbol": "RELIANCE",
            "segment": "NSE Equity",
            "type": "BUY",
            "qty": 100,
            "avgPrice": 2900.0,
            "ltp": 2950.0
        }

        res = asyncio.run(pss.square_off_all_positions())

        self.assertEqual(res["status"], "partial_success")
        self.assertEqual(res["squared_count"], 1)
        self.assertEqual(res["failed_count"], 1)

        # Successful position must be removed
        self.assertNotIn(pos_1, pss.active_positions)
        # Failed position MUST remain in active_positions
        self.assertIn(pos_2, pss.active_positions)
        self.assertEqual(pss.active_positions[pos_2]["qty"], 100)


if __name__ == "__main__":
    unittest.main()

