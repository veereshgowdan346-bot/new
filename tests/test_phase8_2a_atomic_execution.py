"""
TRADING JARVIS WORKSTATION — PHASE 8.2A TEST SUITE
Atomic Paper Execution, SQLite Transaction Consistency & Idempotent Recovery

Verifies:
  1. Atomic Commit: Orders, positions, and trades written and committed within a single SQLite transaction.
  2. Failure Rollback: Injected exceptions at any stage (AFTER_ORDER, AFTER_POSITION, DURING_TRADE)
     roll back completely, leaving zero orphan orders, zero phantom positions, and zero missing trades.
  3. External Side-Effect Isolation: WebSocket events are deferred and emitted ONLY after successful commit;
     never emitted on rollback.
  4. Safe Retry: An order that experienced rollback can be safely retried with the same clientOrderId.
  5. Idempotent Replay: Duplicate fill execution events detect existing completion, returning consistent
     success without double-counting position quantities or duplicate trade entries.
  6. Ambiguous Order Recovery: recover_ambiguous_paper_orders() safely scans and resolves interrupted
     paper orders (transitions to FILLED if trade exists, or CANCELLED if unexecuted).
  7. Concurrency Safety: Multi-threaded simultaneous paper orders execute under SQLite WAL without lock corruption.
  8. Safety Mandates: LIVE_TRADING_ELIGIBLE strictly False; production database bit-for-bit unchanged.
"""

import os
import sys
import time
import shutil
import tempfile
import unittest
import hashlib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Dict, Any, List

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server import memory_db
from server.execution_engine import (
    CentralizedExecutionEngine,
    ORDER_STATE_FILLED,
    ORDER_STATE_REJECTED,
    ORDER_STATE_CANCELLED,
    ORDER_STATE_PENDING,
    ORDER_STATE_QUARANTINED
)
from server.memory_db import (
    get_connection,
    get_open_positions,
    close_position,
    commit_paper_order_execution_atomic,
    recover_ambiguous_paper_orders
)


class BasePhase82aTestCase(unittest.TestCase):
    """Base test case providing isolated temporary SQLite database for each test."""

    def setUp(self):
        self.temp_db_fd, self.temp_db_path = tempfile.mkstemp(suffix="_phase8_2a.db")
        os.close(self.temp_db_fd)

        self.orig_db_path = memory_db.DB_PATH
        memory_db.DB_PATH = self.temp_db_path
        memory_db.init_db()

        self.engine = CentralizedExecutionEngine()
        self.engine.enforce_market_hours = False

    def tearDown(self):
        memory_db.DB_PATH = self.orig_db_path
        if os.path.exists(self.temp_db_path):
            try:
                os.unlink(self.temp_db_path)
            except Exception:
                pass


class TestPhase82aAtomicExecution(BasePhase82aTestCase):
    """Tests atomic paper execution, transaction rollback, and side-effect isolation."""

    def test_paper_order_atomic_commit_success(self):
        """Proves order, position, and trade commit together in a single transaction."""
        received_events = []
        self.engine.register_order_listener(lambda e: received_events.append(e))
        self.engine.register_position_listener(lambda e: received_events.append(e))

        cid = f"ATOMIC-BUY-{int(time.time()*1000)}"
        res = self.engine.execute_order(
            bot_id=1,
            symbol="RELIANCE",
            action="BUY",
            qty=10,
            price=2900.0,
            bot_name="Trend Master",
            execution_mode="PAPER",
            client_order_id=cid
        )
        self.assertTrue(res["success"])
        self.assertEqual(res["status"], ORDER_STATE_FILLED)
        self.assertEqual(res["filled_qty"], 10)

        # Verify DB records across all 3 tables
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM orders_memory WHERE order_id = ?", (cid,))
            order_row = cursor.fetchone()
            self.assertIsNotNone(order_row)
            self.assertEqual(order_row["status"], ORDER_STATE_FILLED)
            self.assertEqual(order_row["filled_qty"], 10)

            cursor.execute("SELECT * FROM positions_memory WHERE symbol = 'RELIANCE' AND status = 'OPEN'")
            pos_row = cursor.fetchone()
            self.assertIsNotNone(pos_row)
            self.assertEqual(pos_row["qty"], 10)
            self.assertEqual(pos_row["side"], "LONG")

            cursor.execute("SELECT * FROM trade_memory WHERE order_id = ?", (cid,))
            trade_row = cursor.fetchone()
            self.assertIsNotNone(trade_row)
            self.assertEqual(trade_row["qty"], 10)
            self.assertEqual(trade_row["symbol"], "RELIANCE")
        finally:
            conn.close()

        # Verify WebSocket events were emitted after commit
        event_types = [e.get("type") for e in received_events]
        self.assertIn("ORDER_STATUS_UPDATE", event_types)
        self.assertIn("POSITIONS_UPDATE", event_types)
        self.assertIn("TRADE_CONFIRMATION", event_types)

    def test_atomic_rollback_on_injected_failure_after_order(self):
        """Proves failure AFTER_ORDER rolls back completely: 0 orders, 0 positions, 0 trades, 0 events."""
        received_events = []
        self.engine.register_order_listener(lambda e: received_events.append(e))
        self.engine.register_position_listener(lambda e: received_events.append(e))

        cid = f"FAIL-ORDER-{int(time.time()*1000)}"
        self.engine._test_failure_injection_point = "AFTER_ORDER"

        res = self.engine.execute_order(
            bot_id=1,
            symbol="INFY",
            action="BUY",
            qty=5,
            price=1500.0,
            bot_name="Trend Master",
            execution_mode="PAPER",
            client_order_id=cid
        )
        self.assertFalse(res["success"])
        self.assertEqual(res["status"], ORDER_STATE_REJECTED)
        self.assertIn("Atomic execution commit failed", res["error"])

        # Verify DB is completely clean (zero partial writes)
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) as count FROM orders_memory WHERE order_id = ?", (cid,))
            self.assertEqual(cursor.fetchone()["count"], 0)

            cursor.execute("SELECT COUNT(*) as count FROM positions_memory WHERE symbol = 'INFY' AND status = 'OPEN'")
            self.assertEqual(cursor.fetchone()["count"], 0)

            cursor.execute("SELECT COUNT(*) as count FROM trade_memory WHERE order_id = ?", (cid,))
            self.assertEqual(cursor.fetchone()["count"], 0)
        finally:
            conn.close()

        # Zero WebSocket events emitted because transaction rolled back
        self.assertEqual(len(received_events), 0)

    def test_atomic_rollback_on_injected_failure_after_position(self):
        """Proves failure AFTER_POSITION rolls back order and position cleanly."""
        cid = f"FAIL-POS-{int(time.time()*1000)}"
        self.engine._test_failure_injection_point = "AFTER_POSITION"

        res = self.engine.execute_order(
            bot_id=2,
            symbol="TCS",
            action="BUY",
            qty=8,
            price=3800.0,
            bot_name="Scalper Pro",
            execution_mode="PAPER",
            client_order_id=cid
        )
        self.assertFalse(res["success"])
        self.assertEqual(res["status"], ORDER_STATE_REJECTED)

        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) as count FROM orders_memory WHERE order_id = ?", (cid,))
            self.assertEqual(cursor.fetchone()["count"], 0)

            cursor.execute("SELECT COUNT(*) as count FROM positions_memory WHERE symbol = 'TCS' AND status = 'OPEN'")
            self.assertEqual(cursor.fetchone()["count"], 0)

            cursor.execute("SELECT COUNT(*) as count FROM trade_memory WHERE order_id = ?", (cid,))
            self.assertEqual(cursor.fetchone()["count"], 0)
        finally:
            conn.close()

    def test_atomic_rollback_on_injected_failure_during_trade(self):
        """Proves failure DURING_TRADE rolls back order and position without orphan records."""
        cid = f"FAIL-TRD-{int(time.time()*1000)}"
        self.engine._test_failure_injection_point = "DURING_TRADE"

        res = self.engine.execute_order(
            bot_id=3,
            symbol="HDFCBANK",
            action="BUY",
            qty=12,
            price=1650.0,
            bot_name="Momentum Rider",
            execution_mode="PAPER",
            client_order_id=cid
        )
        self.assertFalse(res["success"])

        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) as count FROM orders_memory WHERE order_id = ?", (cid,))
            self.assertEqual(cursor.fetchone()["count"], 0)

            cursor.execute("SELECT COUNT(*) as count FROM positions_memory WHERE symbol = 'HDFCBANK' AND status = 'OPEN'")
            self.assertEqual(cursor.fetchone()["count"], 0)

            cursor.execute("SELECT COUNT(*) as count FROM trade_memory WHERE order_id = ?", (cid,))
            self.assertEqual(cursor.fetchone()["count"], 0)
        finally:
            conn.close()

    def test_safe_retry_after_rollback_succeeds(self):
        """Proves that after a rolled-back attempt, retrying with the same clientOrderId succeeds."""
        cid = f"RETRY-ORD-{int(time.time()*1000)}"
        self.engine._test_failure_injection_point = "AFTER_POSITION"

        # Attempt 1: Fails and rolls back cleanly
        res1 = self.engine.execute_order(
            bot_id=1,
            symbol="RELIANCE",
            action="BUY",
            qty=4,
            price=2910.0,
            bot_name="Trend Master",
            execution_mode="PAPER",
            client_order_id=cid
        )
        self.assertFalse(res1["success"])

        # Attempt 2: Clear failure injection and retry with exact same cid
        self.engine._test_failure_injection_point = None
        res2 = self.engine.execute_order(
            bot_id=1,
            symbol="RELIANCE",
            action="BUY",
            qty=4,
            price=2910.0,
            bot_name="Trend Master",
            execution_mode="PAPER",
            client_order_id=cid
        )
        self.assertTrue(res2["success"])
        self.assertEqual(res2["status"], ORDER_STATE_FILLED)

        # Verify DB now contains the committed order, position, and trade
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) as count FROM orders_memory WHERE order_id = ?", (cid,))
            self.assertEqual(cursor.fetchone()["count"], 1)

            cursor.execute("SELECT COUNT(*) as count FROM positions_memory WHERE symbol = 'RELIANCE' AND status = 'OPEN'")
            self.assertEqual(cursor.fetchone()["count"], 1)

            cursor.execute("SELECT COUNT(*) as count FROM trade_memory WHERE order_id = ?", (cid,))
            self.assertEqual(cursor.fetchone()["count"], 1)
        finally:
            conn.close()


class TestPhase82aIdempotencyAndRecovery(BasePhase82aTestCase):
    """Tests idempotent fill replay and ambiguous order state recovery."""

    def test_duplicate_fill_event_replay_idempotency(self):
        """Proves replaying an already-filled execution does not duplicate trades or double-modify positions."""
        cid = f"IDEMP-FILL-{int(time.time()*1000)}"
        res1 = self.engine.execute_order(
            bot_id=4,
            symbol="TATA MOTORS",
            action="BUY",
            qty=20,
            price=950.0,
            bot_name="Breakout Master",
            execution_mode="PAPER",
            client_order_id=cid
        )
        self.assertTrue(res1["success"])

        # Directly invoke commit_paper_order_execution_atomic as an event replay
        order_rec = {
            "order_id": cid,
            "client_order_id": cid,
            "bot": "Breakout Master",
            "symbol": "TATA MOTORS",
            "action": "BUY",
            "qty": 20,
            "filled_qty": 20,
            "price": 950.0,
            "avg_price": 950.0,
            "status": "FILLED",
            "mode": "PAPER"
        }
        trade_rec = {
            "trade_id": f"TRD-{cid}",
            "order_id": cid,
            "bot": "Breakout Master",
            "symbol": "TATA MOTORS",
            "action": "BUY",
            "qty": 20,
            "price": 950.0,
            "mode": "PAPER"
        }
        pos_rec = {
            "position_id": f"POS-TATA MOTORS-{cid}",
            "pos_key": "Breakout Master_TATA MOTORS",
            "bot": "Breakout Master",
            "symbol": "TATA MOTORS",
            "side": "LONG",
            "qty": 20,
            "avg_price": 950.0,
            "status": "OPEN",
            "mode": "PAPER"
        }

        replay_res = commit_paper_order_execution_atomic(
            order_record=order_rec,
            trade_record=trade_rec,
            position_action="OPEN",
            position_record=pos_rec
        )
        self.assertTrue(replay_res["success"])
        self.assertTrue(replay_res.get("idempotent_replay"))

        # Verify DB counts: exactly 1 order, 1 position with qty=20 (not 40), 1 trade
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) as count FROM orders_memory WHERE order_id = ?", (cid,))
            self.assertEqual(cursor.fetchone()["count"], 1)

            cursor.execute("SELECT qty FROM positions_memory WHERE symbol = 'TATA MOTORS' AND status = 'OPEN'")
            pos = cursor.fetchone()
            self.assertEqual(pos["qty"], 20)

            cursor.execute("SELECT COUNT(*) as count FROM trade_memory WHERE order_id = ?", (cid,))
            self.assertEqual(cursor.fetchone()["count"], 1)
        finally:
            conn.close()

    def test_ambiguous_interrupted_order_recovery(self):
        """Proves recover_ambiguous_paper_orders resolves unexecuted and half-completed orders."""
        conn = get_connection()
        try:
            cursor = conn.cursor()
            # Scenario A: Interrupted order with NO trade (crash during submission)
            cursor.execute("""
            INSERT INTO orders_memory (
                order_id, client_order_id, bot, symbol, segment, action, qty, filled_qty,
                price, avg_price, ordertype, producttype, variety, exchange, status,
                mode, broker, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "ORD-INTERRUPTED-NO-TRADE", "ORD-INTERRUPTED-NO-TRADE", "Bot 1", "INFY", "NSE Equity",
                "BUY", 10, 0, 1500.0, 1500.0, "MARKET", "INTRADAY", "NORMAL", "NSE", "PENDING",
                "PAPER", "Paper Simulator", datetime.now().isoformat(), datetime.now().isoformat()
            ))

            # Scenario B: Interrupted order WITH trade recorded (crash before order status was updated)
            cursor.execute("""
            INSERT INTO orders_memory (
                order_id, client_order_id, bot, symbol, segment, action, qty, filled_qty,
                price, avg_price, ordertype, producttype, variety, exchange, status,
                mode, broker, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "ORD-INTERRUPTED-WITH-TRADE", "ORD-INTERRUPTED-WITH-TRADE", "Bot 2", "TCS", "NSE Equity",
                "BUY", 5, 0, 3850.0, 3850.0, "MARKET", "INTRADAY", "NORMAL", "NSE", "UNKNOWN_PENDING_RECONCILIATION",
                "PAPER", "Paper Simulator", datetime.now().isoformat(), datetime.now().isoformat()
            ))

            cursor.execute("""
            INSERT INTO trade_memory (
                trade_id, timestamp, bot, symbol, segment, action, qty, price, pnl, is_positive, order_id, mode, broker
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "TRD-ORD-INTERRUPTED-WITH-TRADE", datetime.now().isoformat(), "Bot 2", "TCS", "NSE Equity",
                "BUY", 5, 3850.0, "+₹0.00", 1, "ORD-INTERRUPTED-WITH-TRADE", "PAPER", "Paper Simulator"
            ))
            conn.commit()
        finally:
            conn.close()

        # Run recovery
        rec_res = recover_ambiguous_paper_orders()
        self.assertTrue(rec_res["success"])
        self.assertEqual(rec_res["recovered_count"], 2)

        # Verify Scenario A transitioned to CANCELLED
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT status, rejection_reason FROM orders_memory WHERE order_id = 'ORD-INTERRUPTED-NO-TRADE'")
            row_a = cursor.fetchone()
            self.assertEqual(row_a["status"], ORDER_STATE_CANCELLED)
            self.assertEqual(row_a["rejection_reason"], "RECOVERY_RESOLVED_UNFILLED")

            # Verify Scenario B transitioned to FILLED
            cursor.execute("SELECT status, filled_qty FROM orders_memory WHERE order_id = 'ORD-INTERRUPTED-WITH-TRADE'")
            row_b = cursor.fetchone()
            self.assertEqual(row_b["status"], ORDER_STATE_FILLED)
            self.assertEqual(row_b["filled_qty"], 5)
        finally:
            conn.close()

    def test_idempotent_replay_with_conflicting_payload_returns_authoritative_committed_values(self):
        """Proves duplicate execution events return authoritative DB state rather than echoing conflicting arguments."""
        cid = f"REPLAY-CONF-{int(time.time()*1000)}"
        res1 = self.engine.execute_order(
            bot_id=1,
            symbol="INFY",
            action="BUY",
            qty=10,
            price=1500.0,
            bot_name="Trend Master",
            execution_mode="PAPER",
            client_order_id=cid
        )
        self.assertTrue(res1["success"])
        self.assertEqual(res1["status"], ORDER_STATE_FILLED)
        initial_fill_price = res1["fill_price"]
        self.assertEqual(res1["filled_qty"], 10)

        # Clear in-memory rate limiter / duplicate check to simulate network replay reaching execution engine
        self.engine.recent_client_order_ids.pop(cid, None)

        # Submit conflicting payload with the same client_order_id (e.g. qty=999, price=99999.0)
        res2 = self.engine.execute_order(
            bot_id=1,
            symbol="INFY",
            action="BUY",
            qty=999,
            price=99999.0,
            bot_name="Trend Master",
            execution_mode="PAPER",
            client_order_id=cid
        )
        self.assertTrue(res2["success"])
        self.assertTrue(res2.get("idempotent_replay"))
        self.assertEqual(res2["status"], ORDER_STATE_FILLED)
        # MUST return authoritative committed values, NOT conflicting caller arguments
        self.assertEqual(res2["filled_qty"], 10)
        self.assertEqual(res2["fill_price"], initial_fill_price)

        # Verify DB remained completely uncorrupted
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT qty, filled_qty, avg_price FROM orders_memory WHERE order_id = ?", (cid,))
            order_row = cursor.fetchone()
            self.assertEqual(order_row["qty"], 10)
            self.assertEqual(order_row["filled_qty"], 10)
            self.assertEqual(order_row["avg_price"], initial_fill_price)

            cursor.execute("SELECT COUNT(*) as count FROM trade_memory WHERE order_id = ?", (cid,))
            self.assertEqual(cursor.fetchone()["count"], 1)

            cursor.execute("SELECT qty FROM positions_memory WHERE symbol = 'INFY' AND status = 'OPEN'")
            pos_row = cursor.fetchone()
            self.assertEqual(pos_row["qty"], 10)
        finally:
            conn.close()

    def test_recovery_quarantines_ambiguous_order_when_related_position_exists(self):
        """Proves ambiguous order without matching trade is fail-closed quarantined if a related position exists."""
        oid = "ORD-AMBIGUOUS-POS-EXISTS"
        bot_name = "Breakout Bot"
        symbol = "RELIANCE"
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO orders_memory (
                order_id, client_order_id, bot, symbol, segment, action, qty, filled_qty,
                price, avg_price, ordertype, producttype, variety, exchange, status,
                mode, broker, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                oid, oid, bot_name, symbol, "NSE Equity",
                "BUY", 25, 0, 2900.0, 2900.0, "MARKET", "INTRADAY", "NORMAL", "NSE", "PENDING",
                "PAPER", "Paper Simulator", datetime.now().isoformat(), datetime.now().isoformat()
            ))

            cursor.execute("""
            INSERT INTO positions_memory (
                position_id, pos_key, bot, symbol, segment, side, qty, avg_price,
                ltp, pnl, unrealized_pnl, mode, broker, status, reconciled_with_broker,
                broker_qty, opened_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', 0, 0, ?, ?)
            """, (
                f"POS-{symbol}-{oid}", f"{bot_name}_{symbol}", bot_name, symbol, "NSE Equity",
                "LONG", 25, 2900.0, 2900.0, "+₹0.00", 0.0, "PAPER", "Paper Simulator",
                datetime.now().isoformat(), datetime.now().isoformat()
            ))
            conn.commit()
        finally:
            conn.close()

        rec_res = recover_ambiguous_paper_orders()
        self.assertTrue(rec_res["success"])
        self.assertEqual(rec_res["quarantined_count"], 1)
        self.assertEqual(rec_res["recovered_count"], 0)

        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT status, rejection_reason FROM orders_memory WHERE order_id = ?", (oid,))
            order_row = cursor.fetchone()
            self.assertEqual(order_row["status"], ORDER_STATE_QUARANTINED)
            self.assertEqual(order_row["rejection_reason"], "RECOVERY_AMBIGUOUS_POSITION_EXISTS")
        finally:
            conn.close()

    def test_recovery_fails_closed_on_inconsistent_trade_data(self):
        """Proves order recovery quarantines rather than blindly fills when trade data is inconsistent."""
        oid = "ORD-INCONSISTENT-TRADE"
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO orders_memory (
                order_id, client_order_id, bot, symbol, segment, action, qty, filled_qty,
                price, avg_price, ordertype, producttype, variety, exchange, status,
                mode, broker, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                oid, oid, "Trend Bot", "HDFCBANK", "NSE Equity",
                "BUY", 50, 0, 1600.0, 1600.0, "MARKET", "INTRADAY", "NORMAL", "NSE", "SUBMITTED",
                "PAPER", "Paper Simulator", datetime.now().isoformat(), datetime.now().isoformat()
            ))

            # Insert trade with quantity mismatch (10 vs 50)
            cursor.execute("""
            INSERT INTO trade_memory (
                trade_id, timestamp, bot, symbol, segment, action, qty, price, pnl, is_positive, order_id, mode, broker
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                f"TRD-{oid}", datetime.now().isoformat(), "Trend Bot", "HDFCBANK", "NSE Equity",
                "BUY", 10, 1600.0, "+₹0.00", 1, oid, "PAPER", "Paper Simulator"
            ))
            conn.commit()
        finally:
            conn.close()

        rec_res = recover_ambiguous_paper_orders()
        self.assertTrue(rec_res["success"])
        self.assertEqual(rec_res["quarantined_count"], 1)
        self.assertEqual(rec_res["recovered_count"], 0)

        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT status, rejection_reason FROM orders_memory WHERE order_id = ?", (oid,))
            order_row = cursor.fetchone()
            self.assertEqual(order_row["status"], ORDER_STATE_QUARANTINED)
            self.assertEqual(order_row["rejection_reason"], "RECOVERY_TRADE_INCONSISTENCY")
        finally:
            conn.close()

    def test_recovery_resolves_proven_unfilled_order_safely(self):
        """Proves order with no trade and no related position safely transitions to CANCELLED."""
        oid = "ORD-CLEAN-UNFILLED"
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO orders_memory (
                order_id, client_order_id, bot, symbol, segment, action, qty, filled_qty,
                price, avg_price, ordertype, producttype, variety, exchange, status,
                mode, broker, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                oid, oid, "Clean Bot", "WIPRO", "NSE Equity",
                "BUY", 30, 0, 480.0, 480.0, "MARKET", "INTRADAY", "NORMAL", "NSE", "PENDING",
                "PAPER", "Paper Simulator", datetime.now().isoformat(), datetime.now().isoformat()
            ))
            conn.commit()
        finally:
            conn.close()

        rec_res = recover_ambiguous_paper_orders()
        self.assertTrue(rec_res["success"])
        self.assertEqual(rec_res["recovered_count"], 1)
        self.assertEqual(rec_res["quarantined_count"], 0)

        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT status, rejection_reason FROM orders_memory WHERE order_id = ?", (oid,))
            order_row = cursor.fetchone()
            self.assertEqual(order_row["status"], ORDER_STATE_CANCELLED)
            self.assertEqual(order_row["rejection_reason"], "RECOVERY_RESOLVED_UNFILLED")
        finally:
            conn.close()

    def test_recovery_idempotency_on_repeated_runs(self):
        """Proves repeated recovery runs are idempotent and do not corrupt terminal or quarantined orders."""
        conn = get_connection()
        try:
            cursor = conn.cursor()
            # Order 1: Unfilled -> should become CANCELLED
            cursor.execute("""
            INSERT INTO orders_memory (
                order_id, client_order_id, bot, symbol, segment, action, qty, filled_qty,
                price, avg_price, ordertype, producttype, variety, exchange, status,
                mode, broker, created_at, updated_at
            ) VALUES ('IDEMP-ORD-1', 'IDEMP-ORD-1', 'Bot A', 'CIPLA', 'NSE Equity',
                      'BUY', 15, 0, 1400.0, 1400.0, 'MARKET', 'INTRADAY', 'NORMAL', 'NSE', 'PENDING',
                      'PAPER', 'Paper Simulator', datetime('now'), datetime('now'))
            """)

            # Order 2: Consistent trade -> should become FILLED
            cursor.execute("""
            INSERT INTO orders_memory (
                order_id, client_order_id, bot, symbol, segment, action, qty, filled_qty,
                price, avg_price, ordertype, producttype, variety, exchange, status,
                mode, broker, created_at, updated_at
            ) VALUES ('IDEMP-ORD-2', 'IDEMP-ORD-2', 'Bot B', 'SUNPHARMA', 'NSE Equity',
                      'BUY', 10, 0, 1700.0, 1700.0, 'MARKET', 'INTRADAY', 'NORMAL', 'NSE', 'ACKNOWLEDGED',
                      'PAPER', 'Paper Simulator', datetime('now'), datetime('now'))
            """)
            cursor.execute("""
            INSERT INTO trade_memory (
                trade_id, timestamp, bot, symbol, segment, action, qty, price, pnl, is_positive, order_id, mode, broker
            ) VALUES ('TRD-IDEMP-ORD-2', datetime('now'), 'Bot B', 'SUNPHARMA', 'NSE Equity',
                      'BUY', 10, 1700.0, '+₹0.00', 1, 'IDEMP-ORD-2', 'PAPER', 'Paper Simulator')
            """)

            # Order 3: Position exists -> should become QUARANTINED
            cursor.execute("""
            INSERT INTO orders_memory (
                order_id, client_order_id, bot, symbol, segment, action, qty, filled_qty,
                price, avg_price, ordertype, producttype, variety, exchange, status,
                mode, broker, created_at, updated_at
            ) VALUES ('IDEMP-ORD-3', 'IDEMP-ORD-3', 'Bot C', 'AXISBANK', 'NSE Equity',
                      'BUY', 20, 0, 1150.0, 1150.0, 'MARKET', 'INTRADAY', 'NORMAL', 'NSE', 'CREATED',
                      'PAPER', 'Paper Simulator', datetime('now'), datetime('now'))
            """)
            cursor.execute("""
            INSERT INTO positions_memory (
                position_id, pos_key, bot, symbol, segment, side, qty, avg_price,
                ltp, pnl, unrealized_pnl, mode, broker, status, reconciled_with_broker,
                broker_qty, opened_at, updated_at
            ) VALUES ('POS-AXISBANK-IDEMP', 'Bot C_AXISBANK', 'Bot C', 'AXISBANK', 'NSE Equity',
                      'LONG', 20, 1150.0, 1150.0, '+₹0.00', 0.0, 'PAPER', 'Paper Simulator', 'OPEN', 0, 0,
                      datetime('now'), datetime('now'))
            """)
            conn.commit()
        finally:
            conn.close()

        # Run 1: Resolves all 3 ambiguous orders
        res1 = recover_ambiguous_paper_orders()
        self.assertTrue(res1["success"])
        self.assertEqual(res1["scanned_count"], 3)
        self.assertEqual(res1["recovered_count"], 2)  # 1 Cancelled, 1 Filled
        self.assertEqual(res1["quarantined_count"], 1)

        # Run 2: Immediately re-run -> zero ambiguous orders to process
        res2 = recover_ambiguous_paper_orders()
        self.assertTrue(res2["success"])
        self.assertEqual(res2["scanned_count"], 0)
        self.assertEqual(res2["recovered_count"], 0)
        self.assertEqual(res2["quarantined_count"], 0)

        # Run 3: Idempotent stability check
        res3 = recover_ambiguous_paper_orders()
        self.assertEqual(res3["scanned_count"], 0)

        # Verify DB states preserved
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT status FROM orders_memory WHERE order_id = 'IDEMP-ORD-1'")
            self.assertEqual(cursor.fetchone()["status"], ORDER_STATE_CANCELLED)

            cursor.execute("SELECT status FROM orders_memory WHERE order_id = 'IDEMP-ORD-2'")
            self.assertEqual(cursor.fetchone()["status"], ORDER_STATE_FILLED)

            cursor.execute("SELECT status FROM orders_memory WHERE order_id = 'IDEMP-ORD-3'")
            self.assertEqual(cursor.fetchone()["status"], ORDER_STATE_QUARANTINED)
        finally:
            conn.close()

    def test_recovery_rollback_on_injected_failure(self):
        """Proves simulated failure during recovery triggers full transaction rollback."""
        oid = "ORD-RECOVER-ROLLBACK"
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO orders_memory (
                order_id, client_order_id, bot, symbol, segment, action, qty, filled_qty,
                price, avg_price, ordertype, producttype, variety, exchange, status,
                mode, broker, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                oid, oid, "Rollback Bot", "MARUTI", "NSE Equity",
                "BUY", 5, 0, 12500.0, 12500.0, "MARKET", "INTRADAY", "NORMAL", "NSE", "PENDING",
                "PAPER", "Paper Simulator", datetime.now().isoformat(), datetime.now().isoformat()
            ))
            conn.commit()
        finally:
            conn.close()

        with self.assertRaises(RuntimeError):
            recover_ambiguous_paper_orders(failure_injection_point="DURING_RECOVERY")

        # Verify DB: status must still be PENDING (transaction was rolled back)
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT status FROM orders_memory WHERE order_id = ?", (oid,))
            self.assertEqual(cursor.fetchone()["status"], ORDER_STATE_PENDING)
        finally:
            conn.close()


class TestPhase82aConcurrencyAndLocking(BasePhase82aTestCase):
    """Tests multi-threaded paper order execution under SQLite WAL concurrency."""

    def test_concurrency_safety_under_simultaneous_paper_orders(self):
        """Proves 10 simultaneous paper orders across different symbols commit without SQLite lock errors."""
        symbols = [
            "RELIANCE", "INFY", "TCS", "HDFCBANK", "TATA MOTORS",
            "NIFTY 50", "BANKNIFTY", "GOLD (XAUUSD)", "CRUDE OIL", "USDINR"
        ]

        def submit_paper_order(idx: int, sym: str) -> Dict[str, Any]:
            cid = f"CONC-ORD-{idx}-{int(time.time()*1000)}"
            return self.engine.execute_order(
                bot_id=1,
                symbol=sym,
                action="BUY",
                qty=1,
                price=100.0,
                bot_name="Trend Master",
                execution_mode="PAPER",
                client_order_id=cid
            )

        results = []
        with ThreadPoolExecutor(max_workers=8) as executor:
            futures = [executor.submit(submit_paper_order, i, s) for i, s in enumerate(symbols)]
            for f in futures:
                results.append(f.result())

        for idx, res in enumerate(results):
            self.assertTrue(
                res["success"],
                f"Order {idx} ({symbols[idx]}) failed: {res.get('error')}"
            )
            self.assertEqual(res["status"], ORDER_STATE_FILLED)

        # Verify all 10 orders and trades are committed in DB
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) as count FROM orders_memory WHERE order_id LIKE 'CONC-ORD-%'")
            self.assertEqual(cursor.fetchone()["count"], 10)

            cursor.execute("SELECT COUNT(*) as count FROM trade_memory WHERE order_id LIKE 'CONC-ORD-%'")
            self.assertEqual(cursor.fetchone()["count"], 10)
        finally:
            conn.close()


class TestPhase82aSafetyMandates(BasePhase82aTestCase):
    """Verifies live-trading blocks and production database immutability."""

    def test_live_trading_eligible_strictly_false(self):
        """Verifies live trading eligibility remains blocked across all configurations."""
        from server.live_readiness_gate import is_live_trading_eligible
        self.assertFalse(is_live_trading_eligible(), "LIVE_TRADING_ELIGIBLE must strictly remain False.")

    def test_production_database_bit_for_bit_immutability(self):
        """Verifies server/chintu_memory.db hash and size remain identical to verified baseline."""
        prod_db = os.path.join(PROJECT_ROOT, "server", "chintu_memory.db")
        expected_hash = "53509588F78CA463B91FCD3DB379E550CF3B901FA2C8510D3E1E541B86B4CB53"
        expected_size = 1306624

        h = hashlib.sha256()
        with open(prod_db, "rb") as f:
            while chunk := f.read(65536):
                h.update(chunk)
        actual_hash = h.hexdigest().upper()
        actual_size = os.path.getsize(prod_db)

        self.assertEqual(actual_hash, expected_hash, "Production database SHA-256 hash must be untouched.")
        self.assertEqual(actual_size, expected_size, "Production database file size must be untouched.")


if __name__ == "__main__":
    unittest.main()
