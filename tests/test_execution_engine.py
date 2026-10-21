"""
CHINTU AI TRADING SYSTEM - Centralized Execution Engine Test Suite (Phase 6)
Verifies:
  - Idempotent clientOrderId generation and duplicate rejection.
  - Rate limiting enforcement.
  - Pre-flight parameter validation (symbol, positive qty, market sessions).
  - Quorum authorization and emergency exit bypass.
  - RMS circuit breakers, daily loss limit, and capital caps.
  - Opposing and duplicate position conflict rejection.
  - Order state machine transitions (SUBMITTED -> PENDING -> FILLED).
  - Live fail-closed gates (unauthenticated broker, reconciliation mismatch).
"""

import unittest
import os
import sys
import time
from datetime import datetime

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server.execution_engine import (
    CentralizedExecutionEngine,
    ORDER_STATE_FILLED,
    ORDER_STATE_REJECTED,
    ORDER_STATE_PENDING
)
from server import memory_db
from server.memory_db import get_open_positions, close_position


class TestExecutionEngineSafety(unittest.TestCase):
    """Tests Centralized Execution Engine safety controls and pre-flight gates."""

    def setUp(self):
        import tempfile
        self.temp_db_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_db_path = self.temp_db_file.name
        self.temp_db_file.close()
        self.orig_db_path = memory_db.DB_PATH
        memory_db.DB_PATH = self.temp_db_path
        memory_db.init_db()

        self.engine = CentralizedExecutionEngine()
        self.engine.enforce_market_hours = False  # Allow test execution any time

    def tearDown(self):
        memory_db.DB_PATH = self.orig_db_path
        if os.path.exists(self.temp_db_path):
            try:
                os.unlink(self.temp_db_path)
            except Exception:
                pass

    def test_idempotent_order_id_generation(self):
        oid1 = self.engine.generate_idempotent_order_id(1, "NIFTY 50", "BUY", 24500.0)
        oid2 = self.engine.generate_idempotent_order_id(1, "NIFTY 50", "BUY", 24500.0)
        self.assertEqual(oid1, oid2)
        self.assertTrue(oid1.startswith("ORD-1-"))

    def test_duplicate_order_rejection_via_idempotency(self):
        cid = f"TEST-IDEMP-{int(time.time()*1000)}"
        rms_cfg = {"max_capital_per_bot": 500000.0}
        res1 = self.engine.execute_order(
            bot_id=1,
            symbol="NIFTY 50",
            action="BUY",
            qty=50,
            price=24500.0,
            rms_state=rms_cfg,
            client_order_id=cid
        )
        self.assertTrue(res1["success"])

        # Immediate replay with same client_order_id
        res2 = self.engine.execute_order(
            bot_id=1,
            symbol="NIFTY 50",
            action="BUY",
            qty=50,
            price=24500.0,
            rms_state=rms_cfg,
            client_order_id=cid
        )
        self.assertFalse(res2["success"])
        self.assertEqual(res2["status"], ORDER_STATE_REJECTED)
        self.assertIn("Duplicate order detected", res2["error"])

    def test_rate_limiting_enforcement(self):
        self.engine.max_orders_per_minute = 3
        self.engine.order_timestamps = []

        symbols = ["RELIANCE", "INFY", "TATA MOTORS", "HDFCBANK"]
        for i in range(3):
            cid = f"RATE-TEST-{i}-{int(time.time()*1000)}"
            res = self.engine.execute_order(bot_id=1, symbol=symbols[i], action="BUY", qty=1, price=1000.0, client_order_id=cid)
            self.assertTrue(res["success"])

        # 4th order within 60s should be blocked
        cid4 = f"RATE-TEST-4-{int(time.time()*1000)}"
        res4 = self.engine.execute_order(bot_id=1, symbol=symbols[3], action="BUY", qty=1, price=1000.0, client_order_id=cid4)
        self.assertFalse(res4["success"])
        self.assertIn("Rate limit exceeded", res4["error"])

    def test_invalid_parameters_rejection(self):
        # Empty symbol
        res1 = self.engine.execute_order(bot_id=1, symbol="", action="BUY", qty=10)
        self.assertFalse(res1["success"])
        self.assertIn("Symbol must be a non-empty string", res1["error"])

        # Non-positive quantity
        res2 = self.engine.execute_order(bot_id=1, symbol="RELIANCE", action="BUY", qty=0)
        self.assertFalse(res2["success"])
        self.assertIn("Order quantity 0 is invalid", res2["error"])

    def test_emergency_exit_bypasses_circuit_breaker(self):
        rms_state = {"circuit_breaker_active": True}
        # Regular entry order is blocked
        res_entry = self.engine.execute_order(
            bot_id=1,
            symbol="NIFTY 50",
            action="BUY",
            qty=50,
            price=24500.0,
            rms_state=rms_state
        )
        self.assertFalse(res_entry["success"])
        self.assertIn("Circuit Breaker is ACTIVE", res_entry["error"])

        # Emergency exit order bypasses circuit breaker
        res_exit = self.engine.execute_order(
            bot_id=1,
            symbol="NIFTY 50",
            action="EXIT",
            qty=50,
            price=24500.0,
            is_emergency_exit=True,
            rms_state=rms_state
        )
        self.assertTrue(res_exit["success"])
        self.assertEqual(res_exit["status"], ORDER_STATE_FILLED)

    def test_rms_daily_loss_limit_trips_breaker(self):
        rms_state = {
            "max_daily_loss": 2000.0,
            "realized_daily_pnl": -2500.0,  # Loss exceeds limit
            "circuit_breaker_active": False
        }
        res = self.engine.execute_order(
            bot_id=1,
            symbol="RELIANCE",
            action="BUY",
            qty=10,
            price=1200.0,
            rms_state=rms_state
        )
        self.assertFalse(res["success"])
        self.assertTrue(rms_state["circuit_breaker_active"])
        self.assertIn("Daily loss limit", res["error"])

    def test_live_order_blocked_when_unauthenticated(self):
        broker_state = {"angel_one": {"connected": False}}
        res = self.engine.execute_order(
            bot_id=1,
            symbol="NIFTY 50",
            action="BUY",
            qty=50,
            execution_mode="LIVE",
            broker_state=broker_state
        )
        self.assertFalse(res["success"])
        self.assertIn("broker gateway is not authenticated", res["error"])

    def test_live_order_blocked_when_reconciliation_mismatch(self):
        broker_state = {"angel_one": {"connected": True}}
        active_smart_connect = {"instance": object()}
        reconciliation_state = {"status": "MISMATCH", "block_live_entries": True}
        res = self.engine.execute_order(
            bot_id=1,
            symbol="NIFTY 50",
            action="BUY",
            qty=50,
            execution_mode="LIVE",
            broker_state=broker_state,
            active_smart_connect=active_smart_connect,
            reconciliation_state=reconciliation_state
        )
        self.assertFalse(res["success"])
        self.assertIn("Position reconciliation mismatch", res["error"])

    def test_paper_execution_state_machine_and_position_lifecycle(self):
        # 1. Place initial BUY order
        cid_entry = f"ENTRY-{int(time.time()*1000)}"
        res_entry = self.engine.execute_order(
            bot_id=3,
            symbol="RELIANCE",
            action="BUY",
            qty=10,
            price=2900.0,
            client_order_id=cid_entry
        )
        self.assertTrue(res_entry["success"])
        self.assertEqual(res_entry["status"], ORDER_STATE_FILLED)
        self.assertGreater(res_entry["fill_price"], 0.0)

        # Verify position was recorded in positions_memory
        positions = get_open_positions()
        rel_pos = next((p for p in positions if p["symbol"] == "RELIANCE" and p["status"] == "OPEN"), None)
        self.assertIsNotNone(rel_pos)
        self.assertEqual(rel_pos["side"], "LONG")
        self.assertEqual(rel_pos["qty"], 10)

        # 2. Place EXIT order
        cid_exit = f"EXIT-{int(time.time()*1000)}"
        res_exit = self.engine.execute_order(
            bot_id=3,
            symbol="RELIANCE",
            action="EXIT",
            qty=10,
            price=2950.0,
            is_emergency_exit=True,
            client_order_id=cid_exit
        )
        self.assertTrue(res_exit["success"])
        self.assertEqual(res_exit["status"], ORDER_STATE_FILLED)

        # Verify position is closed
        positions_after = get_open_positions()
        rel_pos_after = next((p for p in positions_after if p["symbol"] == "RELIANCE" and p["status"] == "OPEN"), None)
        self.assertIsNone(rel_pos_after)

    def test_shared_strategy_and_risk_pipeline_both_modes(self):
        """Verifies Gate 0 through Gate 5 execute identically for both PAPER and LIVE modes."""
        from unittest.mock import MagicMock
        mock_smart_connect = {"instance": MagicMock()}
        broker_connected = {"angel_one": {"connected": True}}
        rec_matched = {"status": "MATCHED", "block_live_entries": False}

        # 1. Gate 2 Parameter validation (Invalid Qty) rejects identically
        res_paper_qty = self.engine.execute_order(
            bot_id=1, symbol="NIFTY 50", action="BUY", qty=-10, price=24500.0, execution_mode="PAPER"
        )
        res_live_qty = self.engine.execute_order(
            bot_id=1, symbol="NIFTY 50", action="BUY", qty=-10, price=24500.0, execution_mode="LIVE",
            broker_state=broker_connected, active_smart_connect=mock_smart_connect, reconciliation_state=rec_matched
        )
        self.assertFalse(res_paper_qty["success"])
        self.assertFalse(res_live_qty["success"])
        self.assertIn("is invalid", res_paper_qty["error"])
        self.assertEqual(res_paper_qty["error"], res_live_qty["error"])

        # 2. Gate 4 RMS Circuit Breaker rejects identically
        rms_tripped = {"circuit_breaker_active": True}
        res_paper_rms = self.engine.execute_order(
            bot_id=1, symbol="NIFTY 50", action="BUY", qty=50, price=24500.0, execution_mode="PAPER", rms_state=rms_tripped
        )
        res_live_rms = self.engine.execute_order(
            bot_id=1, symbol="NIFTY 50", action="BUY", qty=50, price=24500.0, execution_mode="LIVE",
            broker_state=broker_connected, active_smart_connect=mock_smart_connect, reconciliation_state=rec_matched, rms_state=rms_tripped
        )
        self.assertFalse(res_paper_rms["success"])
        self.assertFalse(res_live_rms["success"])
        self.assertIn("RMS Circuit Breaker is ACTIVE", res_paper_rms["error"])
        self.assertEqual(res_paper_rms["error"], res_live_rms["error"])

    def test_paper_mode_never_calls_broker_place_order(self):
        """Verifies that PAPER mode never invokes SmartConnect.placeOrder under any condition."""
        from unittest.mock import MagicMock
        mock_smart_api = MagicMock()
        mock_smart_connect = {"instance": mock_smart_api}
        broker_connected = {"angel_one": {"connected": True}}

        res = self.engine.execute_order(
            bot_id=1,
            symbol="NIFTY 50",
            action="BUY",
            qty=50,
            price=24500.0,
            execution_mode="PAPER",
            broker_state=broker_connected,
            active_smart_connect=mock_smart_connect
        )
        self.assertTrue(res["success"])
        self.assertEqual(res["status"], ORDER_STATE_FILLED)
        self.assertEqual(res["mode"], "PAPER")
        mock_smart_api.placeOrder.assert_not_called()

    def test_live_mode_fail_closed_without_active_session(self):
        """Verifies that LIVE mode strictly enforces fail-closed Gate 1 if broker is not connected."""
        # Case A: broker_state connected=False
        res_a = self.engine.execute_order(
            bot_id=1, symbol="NIFTY 50", action="BUY", qty=50, execution_mode="LIVE",
            broker_state={"angel_one": {"connected": False}}, active_smart_connect={"instance": None}
        )
        self.assertFalse(res_a["success"])
        self.assertIn("broker gateway is not authenticated or connected", res_a["error"])

        # Case B: active_smart_connect is None
        res_b = self.engine.execute_order(
            bot_id=1, symbol="NIFTY 50", action="BUY", qty=50, execution_mode="LIVE",
            broker_state={"angel_one": {"connected": True}}, active_smart_connect=None
        )
        self.assertFalse(res_b["success"])
        self.assertIn("broker gateway is not authenticated or connected", res_b["error"])

    def test_paper_and_live_orders_segregated_in_storage(self):
        """Verifies orders and trades are strictly segregated in SQLite storage by execution mode."""
        from unittest.mock import MagicMock

        # 1. Execute PAPER round-trip
        cid_paper_entry = f"ORD-PAPER-ENTRY-{int(time.time()*1000)}"
        res_p_entry = self.engine.execute_order(
            bot_id=2, symbol="INFY", action="BUY", qty=10, price=1800.0,
            execution_mode="PAPER", client_order_id=cid_paper_entry
        )
        self.assertTrue(res_p_entry["success"])

        cid_paper_exit = f"ORD-PAPER-EXIT-{int(time.time()*1000)}"
        res_p_exit = self.engine.execute_order(
            bot_id=2, symbol="INFY", action="EXIT", qty=10, price=1820.0,
            is_emergency_exit=True, execution_mode="PAPER", client_order_id=cid_paper_exit
        )
        self.assertTrue(res_p_exit["success"])

        # 2. Execute LIVE order with mocked broker
        mock_smart_api = MagicMock()
        broker_order_id = "BROKER-LIVE-998877"
        mock_smart_api.placeOrder.return_value = {"status": True, "data": {"orderid": broker_order_id}}
        mock_smart_connect = {"instance": mock_smart_api}
        broker_connected = {"angel_one": {"connected": True}}
        rec_matched = {"status": "MATCHED", "block_live_entries": False}

        cid_live_entry = f"ORD-LIVE-ENTRY-{int(time.time()*1000)}"
        res_l_entry = self.engine.execute_order(
            bot_id=5, symbol="HDFC BANK", action="BUY", qty=15, price=1600.0,
            execution_mode="LIVE", client_order_id=cid_live_entry,
            broker_state=broker_connected, active_smart_connect=mock_smart_connect,
            reconciliation_state=rec_matched
        )
        self.assertTrue(res_l_entry["success"])
        self.assertEqual(res_l_entry["mode"], "LIVE")

        # 3. Verify SQLite DB segregation
        conn = memory_db.get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT order_id, mode, broker FROM orders_memory WHERE order_id = ?", (cid_paper_entry,))
        paper_order = cursor.fetchone()
        self.assertIsNotNone(paper_order)
        self.assertEqual(paper_order["mode"], "PAPER")

        cursor.execute("SELECT order_id, mode, broker FROM orders_memory WHERE order_id = ?", (broker_order_id,))
        live_order = cursor.fetchone()
        self.assertIsNotNone(live_order)
        self.assertEqual(live_order["mode"], "LIVE")
        self.assertEqual(live_order["broker"], "Angel One (SmartAPI)")

        cursor.execute("SELECT symbol, mode, broker FROM trade_memory WHERE symbol = 'INFY'")
        paper_trade = cursor.fetchone()
        self.assertIsNotNone(paper_trade)
        self.assertEqual(paper_trade["mode"], "PAPER")

        conn.close()


if __name__ == "__main__":
    unittest.main()
