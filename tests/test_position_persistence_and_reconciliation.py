"""
CHINTU AI TRADING SYSTEM - Phase 3 Position Persistence & Broker Reconciliation Test Suite
Verifies:
1. Restart persistence: Open positions in SQLite restored to active_positions upon reboot.
2. Empty local DB with non-empty broker positions: Detects UNRECORDED_BROKER_POSITION, flags MISMATCH, blocks live orders.
3. Broker/local position mismatch: Quantity and side mismatches flagged with MISMATCH.
4. Partial fills & rejected orders: orders_memory transitions to PARTIAL_FILL and REJECTED.
5. Timeouts and duplicate order events: Timeout marks AMBIGUOUS_TIMEOUT, duplicate handled idempotently.
6. Database write failures: Handled safely without crashing the server.
7. Failed reconciliation blocking new live entries while permitting emergency exits.
8. Square-off using verified quantity and closing records in SQLite.
9. REST reconciliation endpoints and authorization protection.
"""

import unittest
import sys
import os
import time
import tempfile
import sqlite3
from datetime import datetime
from typing import Dict, Any, List

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER_DIR = os.path.join(ROOT_DIR, "server")
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

from fastapi.testclient import TestClient
import python_stream_server as pss
import memory_db


class FakeSmartConnect:
    """Safe test double for SmartConnect broker instance with position & order support."""
    def __init__(self, positions_data=None, should_fail_position=False, should_fail_order=False, order_error_msg="Exchange timeout"):
        self.positions_data = positions_data if positions_data is not None else []
        self.should_fail_position = should_fail_position
        self.should_fail_order = should_fail_order
        self.order_error_msg = order_error_msg
        self.placed_orders: List[Dict[str, Any]] = []

    def position(self):
        if self.should_fail_position:
            raise Exception("Broker network timeout querying position")
        return {
            "status": True,
            "message": "SUCCESS",
            "errorcode": "",
            "data": self.positions_data
        }

    def placeOrder(self, order_params):
        if self.should_fail_order:
            raise Exception(self.order_error_msg)
        self.placed_orders.append(order_params)
        return {
            "status": True,
            "message": "SUCCESS",
            "data": {"orderid": f"TEST_AO_ORD_{len(self.placed_orders)}"}
        }


class TestPhase3PositionPersistenceAndReconciliation(unittest.TestCase):

    def setUp(self):
        # 1. Create an isolated temporary SQLite database for test execution
        self.temp_db_fd, self.temp_db_path = tempfile.mkstemp(suffix=".db")
        os.close(self.temp_db_fd)
        self.orig_db_path = memory_db.DB_PATH
        memory_db.DB_PATH = self.temp_db_path
        memory_db.init_db()

        # 2. Save original server states
        self.orig_mode = pss.execution_mode
        self.orig_active_positions = pss.active_positions.copy()
        self.orig_reconciliation_state = pss.reconciliation_state.copy()
        self.orig_broker_state = {k: v.copy() for k, v in pss.broker_state.items()}
        self.orig_active_smart_connect = pss.active_smart_connect.copy()
        self.orig_in_flight_exits = pss.in_flight_exits.copy()
        self.orig_feed_status = pss.market_feed_status.copy()
        self.orig_rms = pss.rms_state.copy()

        # 3. Clear transient in-memory structures
        pss.active_positions.clear()
        pss.in_flight_exits.clear()

        # 4. Mock peer mesh quorum so tests focus exclusively on reconciliation & persistence
        self.orig_evaluate_quorum = pss.evaluate_peer_mesh_quorum
        pss.evaluate_peer_mesh_quorum = lambda bot, action: {
            "approved": True,
            "approvals": 3,
            "total_peers": 3,
            "quorum_ratio": "3/3",
            "peer_votes": ["Peer 1: Approved", "Peer 2: Approved", "Peer 3: Approved"]
        }

        # 5. Set up FastAPI TestClient and permanent auth header
        self.client = TestClient(pss.app)
        self.auth_headers = {"Authorization": "Bearer chintu_master_auth_permanent_veeresh"}

    def tearDown(self):
        # Restore server states
        pss.execution_mode = self.orig_mode
        pss.active_positions.clear()
        pss.active_positions.update(self.orig_active_positions)
        pss.reconciliation_state.clear()
        pss.reconciliation_state.update(self.orig_reconciliation_state)
        for k, v in self.orig_broker_state.items():
            pss.broker_state[k] = v.copy()
        pss.active_smart_connect.clear()
        pss.active_smart_connect.update(self.orig_active_smart_connect)
        pss.in_flight_exits.clear()
        pss.in_flight_exits.update(self.orig_in_flight_exits)
        pss.market_feed_status.clear()
        pss.market_feed_status.update(self.orig_feed_status)
        pss.rms_state.clear()
        pss.rms_state.update(self.orig_rms)
        pss.evaluate_peer_mesh_quorum = self.orig_evaluate_quorum

        # Restore SQLite DB path and cleanup temp database
        memory_db.DB_PATH = self.orig_db_path
        try:
            if os.path.exists(self.temp_db_path):
                os.remove(self.temp_db_path)
        except Exception:
            pass

    def _setup_live_broker_and_feed(self, mock_broker: FakeSmartConnect):
        """Helper to establish an authenticated live Angel One connection and valid tick feed."""
        pss.broker_state["angel_one"] = {
            "connected": True,
            "clientId": "TEST_CLIENT",
            "clientName": "Test Trader",
            "broker": "Angel One (SmartAPI)",
            "feedToken": "FEED_TOKEN_123",
            "jwtToken": "JWT_TOKEN_123",
            "refreshToken": "REFRESH_123",
            "availableCash": 50000.0,
            "collateralMargin": 0.0,
            "netMargin": 50000.0,
            "ping": "12ms",
            "connectedAt": datetime.now().isoformat(),
            "tokenExpires": "23h 59m",
            "realAuth": True
        }
        pss.active_smart_connect["instance"] = mock_broker
        pss.active_smart_connect["apiKey"] = "TEST_API_KEY"
        pss.active_smart_connect["clientId"] = "TEST_CLIENT"

        # Valid market feed state
        pss.market_feed_status["provider"] = "ANGEL_ONE_SMARTAPI"
        pss.market_feed_status["is_authentic_exchange_feed"] = True
        pss.market_feed_status["is_subscribed"] = True
        pss.market_feed_status["last_tick_time"] = time.time()
        pss.market_feed_status["last_valid_tick_time"] = time.time()
        pss.market_feed_status["ticks_received_count"] = 100
        pss.market_feed_status["active_symbol"] = "NIFTY 50"
        pss.market_feed_status["symbol_ticks"] = {
            "NIFTY 50": {
                "price": 24730.50,
                "timestamp": time.time()
            }
        }
        pss.market_feed_status["last_tick"] = {
            "price": 24730.50,
            "symbol": "NIFTY 50",
            "timestamp": datetime.now().isoformat()
        }


    # -------------------------------------------------------------
    # 1. Restart persistence
    # -------------------------------------------------------------
    def test_01_restart_persistence_restores_active_positions(self):
        """
        Open positions stored in SQLite positions_memory must be restored
        into active_positions upon reboot. Closed positions must NOT be restored.
        """
        # Save two OPEN positions and one CLOSED position into SQLite
        pos_open_1 = {
            "id": "POS_NIFTY_101",
            "bot": "Bot 1: Scalper Bot",
            "symbol": "NIFTY 50",
            "segment": "NSE F&O Options",
            "type": "BUY",
            "qty": 50,
            "avgPrice": 24700.0,
            "mode": "PAPER",
            "broker": "SmartAPI"
        }
        pos_open_2 = {
            "id": "POS_BANKNIFTY_102",
            "bot": "Bot 2: Breakout Bot",
            "symbol": "BANKNIFTY",
            "segment": "NSE F&O Options",
            "type": "SELL",
            "qty": 30,
            "avgPrice": 52400.0,
            "mode": "PAPER",
            "broker": "SmartAPI"
        }
        memory_db.save_position(pos_open_1)
        memory_db.save_position(pos_open_2)

        # Insert a closed position
        pos_closed = {
            "id": "POS_RELIANCE_103",
            "bot": "Bot 3: Mean Reversion",
            "symbol": "RELIANCE",
            "segment": "NSE Equity",
            "type": "BUY",
            "qty": 100,
            "avgPrice": 2500.0,
            "mode": "PAPER",
            "broker": "SmartAPI"
        }
        memory_db.save_position(pos_closed)
        memory_db.close_position("POS_RELIANCE_103")

        # Verify active_positions is currently empty
        pss.active_positions.clear()
        self.assertEqual(len(pss.active_positions), 0)

        # Call restore_state_on_startup
        pss.restore_state_on_startup()

        # Active positions must have exactly the 2 open positions
        self.assertEqual(len(pss.active_positions), 2)
        self.assertIn("Bot 1: Scalper Bot_NIFTY 50", pss.active_positions)
        self.assertIn("Bot 2: Breakout Bot_BANKNIFTY", pss.active_positions)

        restored_1 = pss.active_positions["Bot 1: Scalper Bot_NIFTY 50"]
        self.assertEqual(restored_1["id"], "POS_NIFTY_101")
        self.assertEqual(restored_1["qty"], 50)
        self.assertEqual(restored_1["type"], "BUY")
        self.assertEqual(restored_1["avgPrice"], 24700.0)

        restored_2 = pss.active_positions["Bot 2: Breakout Bot_BANKNIFTY"]
        self.assertEqual(restored_2["id"], "POS_BANKNIFTY_102")
        self.assertEqual(restored_2["qty"], 30)
        self.assertEqual(restored_2["type"], "SELL")

        # Closed position must NOT be in active_positions
        self.assertNotIn("Bot 3: Mean Reversion_RELIANCE", pss.active_positions)

    # -------------------------------------------------------------
    # 2. Empty local DB with non-empty broker positions
    # -------------------------------------------------------------
    def test_02_empty_local_db_with_broker_positions_detects_mismatch_and_blocks_live(self):
        """
        Never infer 0 broker positions merely because local DB is empty.
        If local DB has 0 positions but broker has positions, flag UNRECORDED_BROKER_POSITION,
        mark MISMATCH, and block live entries.
        """
        pss.execution_mode = "LIVE"
        mock_broker = FakeSmartConnect(positions_data=[
            {
                "tradingsymbol": "NIFTY24OCTFUT",
                "symbolname": "NIFTY 50",
                "netqty": "50",
                "buyavgprice": "24710.0",
                "exchange": "NFO",
                "pnl": "+₹500.00"
            }
        ])
        self._setup_live_broker_and_feed(mock_broker)

        # Local database has 0 open positions
        self.assertEqual(len(memory_db.get_open_positions()), 0)

        # Run reconciliation
        rec_state = pss.reconcile_positions_with_broker()

        # Must flag MISMATCH and block live entries
        self.assertEqual(rec_state["status"], "MISMATCH")
        self.assertTrue(rec_state["block_live_entries"])

        disc_types = [d["type"] for d in rec_state["discrepancies"]]
        self.assertIn("UNRECORDED_BROKER_POSITION", disc_types)

        # Verify audit log in SQLite
        latest_log = memory_db.get_latest_reconciliation_log()
        self.assertIsNotNone(latest_log)
        self.assertEqual(latest_log["status"], "MISMATCH")
        self.assertEqual(latest_log["broker_positions_count"], 1)
        self.assertEqual(latest_log["local_positions_count"], 0)
        self.assertIn("BLOCK_LIVE_ENTRIES", latest_log["action_taken"])

    # -------------------------------------------------------------
    # 3. Broker/local position mismatch (Quantity & Side)
    # -------------------------------------------------------------
    def test_03_broker_local_position_quantity_and_side_mismatches(self):
        """
        Detects QUANTITY_MISMATCH and SIDE_MISMATCH when broker and local positions disagree,
        as well as PHANTOM_LOCAL_POSITION when local DB has positions not at broker.
        """
        pss.execution_mode = "LIVE"

        # Case 3A: Quantity mismatch (local has 50, broker reports 100)
        pos_local = {
            "id": "POS_NIFTY_QTY_TEST",
            "bot": "Bot 1: Scalper Bot",
            "symbol": "NIFTY 50",
            "segment": "NSE F&O Options",
            "type": "BUY",
            "qty": 50,
            "avgPrice": 24700.0,
            "mode": "LIVE",
            "broker": "SmartAPI"
        }
        memory_db.save_position(pos_local)

        mock_broker_qty = FakeSmartConnect(positions_data=[
            {
                "tradingsymbol": "NIFTY 50",
                "netqty": "100",
                "buyavgprice": "24700.0",
                "exchange": "NSE"
            }
        ])
        self._setup_live_broker_and_feed(mock_broker_qty)

        rec_state = pss.reconcile_positions_with_broker()
        self.assertEqual(rec_state["status"], "MISMATCH")
        self.assertTrue(rec_state["block_live_entries"])
        self.assertTrue(any(d["type"] == "QUANTITY_MISMATCH" for d in rec_state["discrepancies"]))

        # Case 3B: Side mismatch (local has BUY, broker reports SELL -50)
        mock_broker_side = FakeSmartConnect(positions_data=[
            {
                "tradingsymbol": "NIFTY 50",
                "netqty": "-50",
                "buyavgprice": "24700.0",
                "exchange": "NSE"
            }
        ])
        self._setup_live_broker_and_feed(mock_broker_side)

        rec_state_side = pss.reconcile_positions_with_broker()
        self.assertEqual(rec_state_side["status"], "MISMATCH")
        self.assertTrue(any(d["type"] == "SIDE_MISMATCH" for d in rec_state_side["discrepancies"]))

        # Case 3C: Phantom local position (broker has 0 positions, local has 50)
        mock_broker_empty = FakeSmartConnect(positions_data=[])
        self._setup_live_broker_and_feed(mock_broker_empty)

        rec_state_phantom = pss.reconcile_positions_with_broker()
        self.assertEqual(rec_state_phantom["status"], "MISMATCH")
        self.assertTrue(any(d["type"] == "PHANTOM_LOCAL_POSITION" for d in rec_state_phantom["discrepancies"]))

    # -------------------------------------------------------------
    # 4. Partial fills & rejected orders lifecycle
    # -------------------------------------------------------------
    def test_04_partial_fills_and_rejected_orders_lifecycle(self):
        """
        Durable orders_memory tracks order lifecycle including PARTIAL_FILL
        and REJECTED states with rejection reasons.
        """
        # Save initial order as NEW
        order_spec = {
            "order_id": "ORD_TEST_LIFECYCLE_1",
            "bot": "Bot 1: Scalper Bot",
            "symbol": "NIFTY 50",
            "action": "BUY",
            "qty": 100,
            "filled_qty": 0,
            "price": 24700.0,
            "status": "PENDING",
            "mode": "PAPER"
        }
        memory_db.save_order(order_spec)

        order_record = memory_db.get_order("ORD_TEST_LIFECYCLE_1")
        self.assertIsNotNone(order_record)
        self.assertEqual(order_record["status"], "PENDING")
        self.assertEqual(order_record["filled_qty"], 0)

        # Transition to PARTIAL_FILL (40 / 100 filled)
        order_spec["status"] = "PARTIAL_FILL"
        order_spec["filled_qty"] = 40
        order_spec["avg_price"] = 24705.0
        memory_db.save_order(order_spec)

        updated_record = memory_db.get_order("ORD_TEST_LIFECYCLE_1")
        self.assertEqual(updated_record["status"], "PARTIAL_FILL")
        self.assertEqual(updated_record["filled_qty"], 40)
        self.assertEqual(updated_record["avg_price"], 24705.0)

        # Save a REJECTED order with specific reason
        rejected_order = {
            "order_id": "ORD_TEST_REJECTED_2",
            "bot": "Bot 2: Breakout Bot",
            "symbol": "BANKNIFTY",
            "action": "SELL",
            "qty": 30,
            "filled_qty": 0,
            "price": 52400.0,
            "status": "REJECTED",
            "rejection_reason": "Exchange Margin Exhausted: Insufficient RMS Limit",
            "mode": "LIVE"
        }
        memory_db.save_order(rejected_order)

        rej_record = memory_db.get_order("ORD_TEST_REJECTED_2")
        self.assertIsNotNone(rej_record)
        self.assertEqual(rej_record["status"], "REJECTED")
        self.assertIn("Insufficient RMS Limit", rej_record["rejection_reason"])

    # -------------------------------------------------------------
    # 5. Timeouts and duplicate order events
    # -------------------------------------------------------------
    def test_05_timeouts_and_duplicate_order_events(self):
        """
        Network timeouts during live order placement persist an AMBIGUOUS_TIMEOUT
        order record. Duplicate order events update records idempotently without crashing.
        """
        pss.execution_mode = "LIVE"
        timeout_broker = FakeSmartConnect(should_fail_order=True, order_error_msg="Connection timed out after 5000ms")
        self._setup_live_broker_and_feed(timeout_broker)

        # Set reconciliation to MATCHED so it doesn't block order placement
        pss.reconciliation_state["status"] = "MATCHED"
        pss.reconciliation_state["block_live_entries"] = False
        pss.rms_state["max_capital_per_bot"] = 2000000.0

        res = pss.place_live_angel_order(

            symbol_name="NIFTY 50",
            action="BUY",
            qty=50,
            price=24730.0,
            bot_name="Bot 1: Scalper Bot"
        )
        self.assertFalse(res["success"])
        self.assertEqual(res.get("status"), "AMBIGUOUS_TIMEOUT")

        # Verify persistent record in SQLite
        order_id = res.get("orderId")
        self.assertIsNotNone(order_id)
        saved_order = memory_db.get_order(order_id)
        self.assertIsNotNone(saved_order)
        self.assertEqual(saved_order["status"], "AMBIGUOUS_TIMEOUT")
        self.assertIn("timed out", saved_order["rejection_reason"])

        # Test duplicate order insertion idempotency
        dup_order = {
            "order_id": "DUP_ID_001",
            "bot": "Bot 1",
            "symbol": "NIFTY 50",
            "qty": 50,
            "status": "PENDING"
        }
        memory_db.save_order(dup_order)

        # Save duplicate with updated status
        dup_order["status"] = "COMPLETE"
        dup_order["filled_qty"] = 50
        # Should not raise SQLite UNIQUE constraint error
        ret_id = memory_db.save_order(dup_order)
        self.assertEqual(ret_id, "DUP_ID_001")

        dup_record = memory_db.get_order("DUP_ID_001")
        self.assertEqual(dup_record["status"], "COMPLETE")
        self.assertEqual(dup_record["filled_qty"], 50)

    # -------------------------------------------------------------
    # 6. Database write failures handled safely
    # -------------------------------------------------------------
    def test_06_database_write_failures_handled_safely(self):
        """
        Database write exceptions (e.g. SQLite disk I/O or lock failures) must be
        caught gracefully without crashing the server or interrupting trading flows.
        """
        # Save position initially
        pos = {
            "id": "POS_SAFE_DB_1",
            "bot": "Bot 1: Scalper Bot",
            "symbol": "NIFTY 50",
            "type": "BUY",
            "qty": 50,
            "avgPrice": 24700.0,
            "mode": "PAPER"
        }
        memory_db.save_position(pos)

        # Monkeypatch memory_db.save_position to raise OperationalError
        orig_save = memory_db.save_position
        try:
            def faulty_save(p):
                raise sqlite3.OperationalError("disk I/O error or database is locked")
            memory_db.save_position = faulty_save

            # update_position_on_fill must handle the exception gracefully without raising
            trade_spec = {
                "id": 99999,
                "bot": "Bot 1: Scalper Bot",
                "symbol": "NIFTY 50",
                "action": "BUY",
                "qty": 50,
                "price": 24730.0,
                "mode": "PAPER"
            }
            # Should not raise exception
            pss.update_position_on_fill(trade_spec)
        finally:
            memory_db.save_position = orig_save

    # -------------------------------------------------------------
    # 7. Failed reconciliation blocking new live entries while permitting emergency exits
    # -------------------------------------------------------------
    def test_07_failed_reconciliation_blocks_new_live_entries_permits_emergency_exits(self):
        """
        When reconciliation fails or reports MISMATCH, new live entry orders
        must be blocked, while emergency exits MUST pass through to reduce market risk.
        """
        pss.execution_mode = "LIVE"
        mock_broker = FakeSmartConnect()
        self._setup_live_broker_and_feed(mock_broker)

        # Set reconciliation state to MISMATCH and blocking
        pss.reconciliation_state["status"] = "MISMATCH"
        pss.reconciliation_state["block_live_entries"] = True
        pss.reconciliation_state["discrepancies"] = [{"type": "DISCREPANCY_TEST", "message": "Discrepancy"}]

        # 7A: Live new entry order MUST be blocked
        entry_result = pss.place_live_angel_order(
            symbol_name="NIFTY 50",
            action="BUY",
            qty=50,
            price=24730.0,
            bot_name="Bot 1: Scalper Bot",
            is_emergency_exit=False
        )
        self.assertFalse(entry_result["success"])
        self.assertEqual(entry_result.get("status"), "RECONCILIATION_BLOCKED")
        self.assertIn("Reconciliation gate active", entry_result.get("error", ""))


        # 7B: Emergency exit order MUST bypass the reconciliation block
        exit_result = pss.place_live_angel_order(
            symbol_name="NIFTY 50",
            action="SELL",
            qty=50,
            price=24730.0,
            bot_name="Bot 1: Scalper Bot",
            is_emergency_exit=True
        )
        self.assertTrue(exit_result["success"])
        self.assertEqual(exit_result.get("status"), "COMPLETE")
        self.assertEqual(len(mock_broker.placed_orders), 1)

    # -------------------------------------------------------------
    # 8. Square-off using verified quantity and closing in SQLite
    # -------------------------------------------------------------
    def test_08_square_off_using_reconciled_quantity_closes_in_db(self):
        """
        Square-off calculates the correct opposite order based on verified position quantity,
        dispatches order, and upon confirmed fill marks the position as CLOSED in SQLite.
        """
        pss.execution_mode = "PAPER"

        # Establish open position in SQLite and in memory
        pos_id = "POS_SQO_VERIFY_1"
        pos_data = {
            "id": pos_id,
            "bot": "Bot 1: Scalper Bot",
            "symbol": "NIFTY 50",
            "segment": "NSE F&O Options",
            "type": "BUY",
            "qty": 50,
            "avgPrice": 24700.0,
            "ltp": 24750.0,
            "mode": "PAPER",
            "broker": "SmartAPI"
        }
        memory_db.save_position(pos_data)

        # Restore into active_positions
        pos_key = "Bot 1: Scalper Bot_NIFTY 50"
        pss.active_positions[pos_key] = pos_data.copy()

        # Verify position is open in SQLite
        open_pos_before = memory_db.get_open_positions()
        self.assertEqual(len(open_pos_before), 1)

        # Call square-off via API
        response = self.client.post(
            "/api/positions/square-off",
            json={"positionId": pos_id, "symbol": "NIFTY 50"},
            headers=self.auth_headers
        )
        self.assertEqual(response.status_code, 200)
        res_data = response.json()
        self.assertEqual(res_data["status"], "success")

        # Active positions must no longer contain this position
        self.assertNotIn(pos_key, pss.active_positions)

        # SQLite positions_memory must now have 0 open positions
        open_pos_after = memory_db.get_open_positions()
        self.assertEqual(len(open_pos_after), 0)

        # Trade must be recorded in trade_memory
        recent_trades = memory_db.get_recent_trades(limit=5)
        self.assertTrue(len(recent_trades) >= 1)
        sqo_trade = recent_trades[0]
        self.assertEqual(sqo_trade["action"], "SELL")
        self.assertEqual(sqo_trade["qty"], 50)

    # -------------------------------------------------------------
    # 9. REST reconciliation endpoints and authorization protection
    # -------------------------------------------------------------
    def test_09_reconciliation_api_endpoints_and_auth(self):
        """
        Verifies that /api/reconciliation/reconcile requires authorization,
        and /api/reconciliation/status, /api/memory/positions, /api/memory/orders,
        and /api/memory/reconciliation-log return valid structures.
        """
        # 9A: Unauthenticated trigger must be rejected with 401
        res_unauth = self.client.post("/api/reconciliation/reconcile")
        self.assertEqual(res_unauth.status_code, 401)

        # 9B: Authenticated trigger returns 200 and triggers reconciliation
        res_auth = self.client.post("/api/reconciliation/reconcile", headers=self.auth_headers)
        self.assertEqual(res_auth.status_code, 200)
        data = res_auth.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("reconciliation", data)

        # 9C: GET /api/reconciliation/status returns current state
        res_status = self.client.get("/api/reconciliation/status")
        self.assertEqual(res_status.status_code, 200)
        status_data = res_status.json()
        self.assertEqual(status_data["status"], "success")
        self.assertIn("reconciliation", status_data)

        # 9D: GET /api/memory/positions returns list
        res_pos = self.client.get("/api/memory/positions")
        self.assertEqual(res_pos.status_code, 200)
        self.assertIn("positions", res_pos.json())

        # 9E: GET /api/memory/orders returns list
        res_ord = self.client.get("/api/memory/orders")
        self.assertEqual(res_ord.status_code, 200)
        self.assertIn("orders", res_ord.json())

        # 9F: GET /api/memory/reconciliation-log returns logs
        res_logs = self.client.get("/api/memory/reconciliation-log")
        self.assertEqual(res_logs.status_code, 200)
        self.assertIn("logs", res_logs.json())


if __name__ == "__main__":
    unittest.main()
