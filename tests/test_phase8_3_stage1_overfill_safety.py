"""
TRADING JARVIS WORKSTATION — PHASE 8.3 STAGE 1 TEST SUITE
Runtime Overfill Safety Hardening & Quantity Boundary Invariant Tests

Verifies:
  1. Single-fill overfill: requested 100, proposed fill 150 rejected before persistent side effects.
  2. Cumulative overfill: fills 60 + 50 against requested 100 rejected; database state identical before and after.
  3. Exact completion: fills 40 + 60 against requested 100 transitions status to FILLED only when exact quantity reached.
  4. Valid partial fill: 40 of 100 remains PARTIALLY_FILLED with exact partial position and VWAP.
  5. Duplicate fill replay: duplicate trade_id returns authoritative committed data with zero double-counting.
  6. Invalid zero/negative quantities: rejected cleanly before persistence.
  7. Missing or inconsistent authoritative order quantity: derives authoritative quantity from persisted DB state; cross-order trade_id collision rejected.
  8. Transaction rollback: atomic rollback on rejection or failure leaves zero orphan order, trade, or position records.
  9. Serialized competing fills: sequential competing fills cannot exceed order quantity.
  10. Recovery quarantine integrity: anomalous historical overfilled states fail closed to QUARANTINED in recovery.
  11. Already FILLED order rejection: order already in FILLED state rejects subsequent new fill payloads.
"""

import os
import sys
import time
import tempfile
import unittest
import sqlite3
from typing import Dict, Any

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server import memory_db
from server.execution_engine import (
    CentralizedExecutionEngine,
    ORDER_STATE_CREATED,
    ORDER_STATE_SUBMITTED,
    ORDER_STATE_PARTIALLY_FILLED,
    ORDER_STATE_FILLED,
    ORDER_STATE_REJECTED,
    ORDER_STATE_QUARANTINED
)
from server.memory_db import (
    get_connection,
    commit_paper_order_execution_atomic,
    recover_ambiguous_paper_orders
)


class BasePhase83Stage1TestCase(unittest.TestCase):
    """Provides isolated temporary SQLite database for each test, ensuring zero mutation of production DB."""

    def setUp(self):
        self.temp_db_fd, self.temp_db_path = tempfile.mkstemp(suffix="_phase8_3_stage1.db")
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

    def get_db_snapshot(self) -> Dict[str, Any]:
        """Captures complete contents of orders_memory, trade_memory, and positions_memory."""
        conn = get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM orders_memory ORDER BY order_id")
            orders = [dict(r) for r in cur.fetchall()]
            cur.execute("SELECT * FROM trade_memory ORDER BY trade_id")
            trades = [dict(r) for r in cur.fetchall()]
            cur.execute("SELECT * FROM positions_memory ORDER BY position_id")
            positions = [dict(r) for r in cur.fetchall()]
            return {"orders": orders, "trades": trades, "positions": positions}
        finally:
            conn.close()


class TestPhase83Stage1OverfillSafety(BasePhase83Stage1TestCase):
    """Rigorous invariant tests for runtime overfill safety hardening."""

    def test_single_fill_overfill_rejected(self):
        """1. Single fill proposing 150 against requested 100 must be rejected with zero DB mutation."""
        cid = f"ORD_SINGLE_OVERFILL_{int(time.time()*1000)}"

        # Initial empty DB state
        initial_snap = self.get_db_snapshot()
        self.assertEqual(len(initial_snap["orders"]), 0)
        self.assertEqual(len(initial_snap["trades"]), 0)
        self.assertEqual(len(initial_snap["positions"]), 0)

        # Execution engine attempt
        res = self.engine.execute_order(
            bot_id=1,
            symbol="RELIANCE",
            action="BUY",
            qty=100,
            price=2500.0,
            fill_qty=150,
            client_order_id=cid
        )
        self.assertFalse(res["success"])
        self.assertEqual(res["status"], ORDER_STATE_REJECTED)
        self.assertIn("Overfill rejected", res["error"])

        # Direct atomic persistence call attempt
        order_rec = {
            "order_id": cid,
            "bot": "Bot 1",
            "symbol": "RELIANCE",
            "action": "BUY",
            "qty": 100,
            "price": 2500.0,
            "mode": "PAPER"
        }
        trade_rec = {
            "trade_id": f"TRD-{cid}",
            "order_id": cid,
            "qty": 150,
            "price": 2500.0
        }
        with self.assertRaises(ValueError) as ctx:
            commit_paper_order_execution_atomic(
                order_record=order_rec,
                trade_record=trade_rec,
                position_action="OPEN"
            )
        self.assertIn("Overfill rejected", str(ctx.exception))

        # DB state must be 100% identical to initial empty state
        post_snap = self.get_db_snapshot()
        self.assertEqual(initial_snap, post_snap)

    def test_cumulative_multi_fill_overfill_rejected_preserves_state(self):
        """2. Fills 60 + 50 against requested 100: Fill 1 succeeds, Fill 2 rejected, DB state before/after Fill 2 identical."""
        cid = f"ORD_CUM_OVERFILL_{int(time.time()*1000)}"

        # Fill 1: 60 of 100 (Valid partial fill)
        order_rec = {
            "order_id": cid,
            "client_order_id": cid,
            "bot": "Bot 1",
            "symbol": "TCS",
            "action": "BUY",
            "qty": 100,
            "filled_qty": 60,
            "price": 3500.0,
            "mode": "PAPER"
        }
        trade_rec_1 = {
            "trade_id": f"TRD-1-{cid}",
            "order_id": cid,
            "qty": 60,
            "price": 3500.0
        }
        pos_rec_1 = {
            "position_id": f"POS-TCS-{cid}",
            "pos_key": "Bot 1_TCS",
            "bot": "Bot 1",
            "symbol": "TCS",
            "side": "LONG",
            "qty": 60,
            "avg_price": 3500.0,
            "is_incremental": True
        }

        res1 = commit_paper_order_execution_atomic(
            order_record=order_rec,
            trade_record=trade_rec_1,
            position_action="OPEN",
            position_record=pos_rec_1
        )
        self.assertTrue(res1["success"])
        self.assertEqual(res1["status"], ORDER_STATE_PARTIALLY_FILLED)
        self.assertEqual(res1["filled_qty"], 60)

        # Snapshot state after Fill 1
        snap_after_fill1 = self.get_db_snapshot()
        self.assertEqual(len(snap_after_fill1["orders"]), 1)
        self.assertEqual(snap_after_fill1["orders"][0]["status"], "PARTIALLY_FILLED")
        self.assertEqual(snap_after_fill1["orders"][0]["filled_qty"], 60)
        self.assertEqual(len(snap_after_fill1["trades"]), 1)
        self.assertEqual(snap_after_fill1["trades"][0]["qty"], 60)
        self.assertEqual(len(snap_after_fill1["positions"]), 1)
        self.assertEqual(snap_after_fill1["positions"][0]["qty"], 60)

        # Fill 2: 50 of 100 (Cumulative = 60 + 50 = 110 > 100 -> OVERFILL)
        trade_rec_2 = {
            "trade_id": f"TRD-2-{cid}",
            "order_id": cid,
            "qty": 50,
            "price": 3510.0
        }
        with self.assertRaises(ValueError) as ctx:
            commit_paper_order_execution_atomic(
                order_record=order_rec,
                trade_record=trade_rec_2,
                position_action="OPEN"
            )
        self.assertIn("Overfill rejected", str(ctx.exception))
        self.assertIn("110", str(ctx.exception))

        # DB snapshot after rejected Fill 2 must be 100% IDENTICAL to snap_after_fill1
        snap_after_fill2 = self.get_db_snapshot()
        self.assertEqual(snap_after_fill1, snap_after_fill2)

    def test_exact_completion_transitions_to_filled(self):
        """3. Fills 40 + 60 against requested 100 transitions to FILLED only upon exact completion with accurate VWAP."""
        cid = f"ORD_EXACT_COMPLETION_{int(time.time()*1000)}"

        order_rec = {
            "order_id": cid,
            "client_order_id": cid,
            "bot": "Bot 1",
            "symbol": "INFY",
            "action": "BUY",
            "qty": 100,
            "price": 1800.0,
            "mode": "PAPER"
        }

        # Fill 1: 40 @ 1800.0
        trade_1 = {"trade_id": f"TRD-1-{cid}", "order_id": cid, "qty": 40, "price": 1800.0}
        pos_1 = {"position_id": f"POS-INFY-{cid}", "pos_key": "Bot 1_INFY", "bot": "Bot 1", "symbol": "INFY", "side": "LONG", "qty": 40, "avg_price": 1800.0, "is_incremental": True}
        res1 = commit_paper_order_execution_atomic(
            order_record=order_rec, trade_record=trade_1, position_action="OPEN", position_record=pos_1
        )
        self.assertTrue(res1["success"])
        self.assertEqual(res1["status"], ORDER_STATE_PARTIALLY_FILLED)
        self.assertEqual(res1["filled_qty"], 40)
        self.assertEqual(res1["avg_price"], 1800.0)

        # Fill 2: 60 @ 1850.0 (Exact 40 + 60 = 100)
        # Expected VWAP: ((40 * 1800) + (60 * 1850)) / 100 = (72000 + 111000) / 100 = 1830.00
        trade_2 = {"trade_id": f"TRD-2-{cid}", "order_id": cid, "qty": 60, "price": 1850.0}
        pos_2 = {"position_id": f"POS-INFY-{cid}", "pos_key": "Bot 1_INFY", "bot": "Bot 1", "symbol": "INFY", "side": "LONG", "qty": 60, "avg_price": 1850.0, "is_incremental": True}
        res2 = commit_paper_order_execution_atomic(
            order_record=order_rec, trade_record=trade_2, position_action="OPEN", position_record=pos_2
        )
        self.assertTrue(res2["success"])
        self.assertEqual(res2["status"], ORDER_STATE_FILLED)
        self.assertEqual(res2["filled_qty"], 100)
        self.assertEqual(res2["avg_price"], 1830.0)

        # Verify DB final state
        snap = self.get_db_snapshot()
        self.assertEqual(snap["orders"][0]["status"], "FILLED")
        self.assertEqual(snap["orders"][0]["filled_qty"], 100)
        self.assertEqual(snap["orders"][0]["avg_price"], 1830.0)
        self.assertEqual(len(snap["trades"]), 2)
        self.assertEqual(snap["positions"][0]["qty"], 100)
        self.assertEqual(snap["positions"][0]["avg_price"], 1830.0)

    def test_valid_partial_fill_remains_partially_filled(self):
        """4. Partial fill of 40 against requested 100 remains PARTIALLY_FILLED."""
        cid = f"ORD_PARTIAL_{int(time.time()*1000)}"
        order_rec = {
            "order_id": cid,
            "bot": "Bot 1",
            "symbol": "HDFCBANK",
            "action": "BUY",
            "qty": 100,
            "price": 1600.0,
            "mode": "PAPER"
        }
        trade = {"trade_id": f"TRD-{cid}", "order_id": cid, "qty": 40, "price": 1600.0}
        pos = {"position_id": f"POS-HDFCBANK-{cid}", "pos_key": "Bot 1_HDFCBANK", "bot": "Bot 1", "symbol": "HDFCBANK", "side": "LONG", "qty": 40, "avg_price": 1600.0}

        res = commit_paper_order_execution_atomic(
            order_record=order_rec, trade_record=trade, position_action="OPEN", position_record=pos
        )
        self.assertTrue(res["success"])
        self.assertEqual(res["status"], ORDER_STATE_PARTIALLY_FILLED)
        self.assertEqual(res["filled_qty"], 40)

        snap = self.get_db_snapshot()
        self.assertEqual(snap["orders"][0]["status"], "PARTIALLY_FILLED")
        self.assertEqual(snap["orders"][0]["filled_qty"], 40)

    def test_duplicate_fill_replay_no_double_counting(self):
        """5. Replaying an identical fill payload returns authoritative data without double-counting."""
        cid = f"ORD_IDEM_REPLAY_{int(time.time()*1000)}"
        order_rec = {
            "order_id": cid,
            "bot": "Bot 1",
            "symbol": "RELIANCE",
            "action": "BUY",
            "qty": 100,
            "price": 2500.0,
            "mode": "PAPER"
        }
        trade = {"trade_id": f"TRD-EXACT-1-{cid}", "order_id": cid, "qty": 40, "price": 2500.0}
        pos = {"position_id": f"POS-RELIANCE-{cid}", "pos_key": "Bot 1_RELIANCE", "bot": "Bot 1", "symbol": "RELIANCE", "side": "LONG", "qty": 40, "avg_price": 2500.0}

        # First commit
        res1 = commit_paper_order_execution_atomic(order_record=order_rec, trade_record=trade, position_action="OPEN", position_record=pos)
        self.assertTrue(res1["success"])
        self.assertFalse(res1.get("idempotent_replay", False))
        self.assertEqual(res1["filled_qty"], 40)

        snap1 = self.get_db_snapshot()

        # Replay commit with conflicting payload price & qty, but same trade_id
        conflicting_trade = {"trade_id": f"TRD-EXACT-1-{cid}", "order_id": cid, "qty": 999, "price": 9999.0}
        res2 = commit_paper_order_execution_atomic(order_record=order_rec, trade_record=conflicting_trade, position_action="OPEN", position_record=pos)
        self.assertTrue(res2["success"])
        self.assertTrue(res2["idempotent_replay"])
        # Must return authoritative committed values (40 @ 2500), not conflicting payload
        self.assertEqual(res2["filled_qty"], 40)
        self.assertEqual(res2["avg_price"], 2500.0)

        # Database state after replay must be 100% identical to snap1
        snap2 = self.get_db_snapshot()
        self.assertEqual(snap1, snap2)

    def test_invalid_zero_and_negative_quantities_rejected(self):
        """6. Invalid zero, negative, or boolean quantities are rejected before persistent side effects."""
        cid = f"ORD_INVALID_QTY_{int(time.time()*1000)}"

        # 6a. Zero order quantity
        with self.assertRaises(ValueError) as ctx:
            commit_paper_order_execution_atomic(
                order_record={"order_id": cid, "qty": 0, "symbol": "RELIANCE", "action": "BUY"},
                trade_record={"trade_id": f"TRD-{cid}", "qty": 10, "price": 2500.0},
                position_action="OPEN"
            )
        self.assertIn("must be > 0", str(ctx.exception))

        # 6b. Negative order quantity
        with self.assertRaises(ValueError) as ctx:
            commit_paper_order_execution_atomic(
                order_record={"order_id": cid, "qty": -50, "symbol": "RELIANCE", "action": "BUY"},
                trade_record={"trade_id": f"TRD-{cid}", "qty": 10, "price": 2500.0},
                position_action="OPEN"
            )
        self.assertIn("must be > 0", str(ctx.exception))

        # 6c. Zero fill quantity
        with self.assertRaises(ValueError) as ctx:
            commit_paper_order_execution_atomic(
                order_record={"order_id": cid, "qty": 100, "symbol": "RELIANCE", "action": "BUY"},
                trade_record={"trade_id": f"TRD-{cid}", "qty": 0, "price": 2500.0},
                position_action="OPEN"
            )
        self.assertIn("must be > 0", str(ctx.exception))

        # 6d. Negative fill quantity
        with self.assertRaises(ValueError) as ctx:
            commit_paper_order_execution_atomic(
                order_record={"order_id": cid, "qty": 100, "symbol": "RELIANCE", "action": "BUY"},
                trade_record={"trade_id": f"TRD-{cid}", "qty": -10, "price": 2500.0},
                position_action="OPEN"
            )
        self.assertIn("must be > 0", str(ctx.exception))

        # 6e. Boolean quantity (True / False)
        with self.assertRaises(ValueError) as ctx:
            commit_paper_order_execution_atomic(
                order_record={"order_id": cid, "qty": True, "symbol": "RELIANCE", "action": "BUY"},
                trade_record={"trade_id": f"TRD-{cid}", "qty": 10, "price": 2500.0},
                position_action="OPEN"
            )
        self.assertIn("boolean", str(ctx.exception).lower())

        # DB must have zero records
        snap = self.get_db_snapshot()
        self.assertEqual(len(snap["orders"]), 0)
        self.assertEqual(len(snap["trades"]), 0)

    def test_missing_or_inconsistent_authoritative_order_quantity(self):
        """7. Derives authoritative quantity from persisted DB state; cross-order trade_id collision rejected."""
        cid = f"ORD_AUTH_DERIVE_{int(time.time()*1000)}"

        # Pre-seed an order in orders_memory with qty = 50
        memory_db.save_order({
            "order_id": cid,
            "client_order_id": cid,
            "bot": "Bot 1",
            "symbol": "SBIN",
            "action": "BUY",
            "qty": 50,
            "filled_qty": 0,
            "price": 800.0,
            "avg_price": 800.0,
            "status": "PENDING",
            "mode": "PAPER"
        })

        # Proposed fill: 60 (order_record claims qty=100, but authoritative DB qty=50)
        order_rec = {"order_id": cid, "qty": 100, "symbol": "SBIN", "action": "BUY"}
        trade_rec = {"trade_id": f"TRD-{cid}", "order_id": cid, "qty": 60, "price": 800.0}

        # Must reject because 60 > 50 (authoritative persisted qty)
        with self.assertRaises(ValueError) as ctx:
            commit_paper_order_execution_atomic(
                order_record=order_rec, trade_record=trade_rec, position_action="OPEN"
            )
        self.assertIn("Overfill rejected", str(ctx.exception))
        self.assertIn("50", str(ctx.exception))

        # 7b. Cross-order trade_id collision check
        other_cid = f"ORD_OTHER_{int(time.time()*1000)}"
        # Commit a trade for other_cid
        commit_paper_order_execution_atomic(
            order_record={"order_id": other_cid, "qty": 20, "symbol": "SBIN", "action": "BUY"},
            trade_record={"trade_id": "SHARED_TRADE_ID", "order_id": other_cid, "qty": 20, "price": 800.0},
            position_action="OPEN"
        )

        # Attempt to use SHARED_TRADE_ID for cid
        with self.assertRaises(ValueError) as ctx_collision:
            commit_paper_order_execution_atomic(
                order_record={"order_id": cid, "qty": 50, "symbol": "SBIN", "action": "BUY"},
                trade_record={"trade_id": "SHARED_TRADE_ID", "order_id": cid, "qty": 20, "price": 800.0},
                position_action="OPEN"
            )
        self.assertIn("Inconsistent fill identity", str(ctx_collision.exception))

    def test_transaction_rollback_on_injected_failure(self):
        """8. Injected write failure leaves zero partial or orphan records in any table."""
        cid = f"ORD_FAIL_INJECT_{int(time.time()*1000)}"
        order_rec = {"order_id": cid, "qty": 50, "symbol": "WIPRO", "action": "BUY", "price": 500.0}
        trade_rec = {"trade_id": f"TRD-{cid}", "order_id": cid, "qty": 50, "price": 500.0}
        pos_rec = {"position_id": f"POS-WIPRO-{cid}", "pos_key": "Bot 1_WIPRO", "bot": "Bot 1", "symbol": "WIPRO", "side": "LONG", "qty": 50, "avg_price": 500.0}

        with self.assertRaises(RuntimeError):
            commit_paper_order_execution_atomic(
                order_record=order_rec,
                trade_record=trade_rec,
                position_action="OPEN",
                position_record=pos_rec,
                failure_injection_point="AFTER_ORDER"
            )

        snap = self.get_db_snapshot()
        self.assertEqual(len(snap["orders"]), 0)
        self.assertEqual(len(snap["trades"]), 0)
        self.assertEqual(len(snap["positions"]), 0)

    def test_serialized_competing_fills_prevent_overfill(self):
        """9. Serialized competing fills of 60 + 60 against requested 100: first succeeds, second is rejected."""
        cid = f"ORD_COMPETING_{int(time.time()*1000)}"
        order_rec = {"order_id": cid, "qty": 100, "symbol": "AXISBANK", "action": "BUY", "price": 1100.0}

        # Fill A: 60
        trade_a = {"trade_id": f"TRD-A-{cid}", "order_id": cid, "qty": 60, "price": 1100.0}
        pos_a = {"position_id": f"POS-AXISBANK-{cid}", "pos_key": "Bot 1_AXISBANK", "bot": "Bot 1", "symbol": "AXISBANK", "side": "LONG", "qty": 60, "avg_price": 1100.0, "is_incremental": True}
        res_a = commit_paper_order_execution_atomic(
            order_record=order_rec, trade_record=trade_a, position_action="OPEN", position_record=pos_a
        )
        self.assertTrue(res_a["success"])
        self.assertEqual(res_a["status"], ORDER_STATE_PARTIALLY_FILLED)
        self.assertEqual(res_a["filled_qty"], 60)

        # Competing Fill B: 60 (Cumulative = 60 + 60 = 120 > 100 -> OVERFILL)
        trade_b = {"trade_id": f"TRD-B-{cid}", "order_id": cid, "qty": 60, "price": 1105.0}
        with self.assertRaises(ValueError) as ctx:
            commit_paper_order_execution_atomic(
                order_record=order_rec, trade_record=trade_b, position_action="OPEN"
            )
        self.assertIn("Overfill rejected", str(ctx.exception))

        # Assert final DB state: exactly 1 trade, position is 60, order is PARTIALLY_FILLED with 60
        snap = self.get_db_snapshot()
        self.assertEqual(len(snap["trades"]), 1)
        self.assertEqual(snap["trades"][0]["trade_id"], f"TRD-A-{cid}")
        self.assertEqual(snap["orders"][0]["status"], "PARTIALLY_FILLED")
        self.assertEqual(snap["orders"][0]["filled_qty"], 60)
        self.assertEqual(snap["positions"][0]["qty"], 60)

    def test_existing_recovery_quarantine_behavior_remains_intact(self):
        """10. Existing recovery quarantine for trade inconsistency (total_t_qty > o_qty) remains intact."""
        cid = f"ORD_HIST_ANOMALY_{int(time.time()*1000)}"
        now = time.strftime("%Y-%m-%d %H:%M:%S")

        # Directly insert an anomalous historical state: order qty 100, but trades sum to 140
        memory_db.save_order({
            "order_id": cid,
            "client_order_id": cid,
            "bot": "Bot 1",
            "symbol": "NIFTY 50",
            "action": "BUY",
            "qty": 100,
            "filled_qty": 0,
            "price": 24000.0,
            "avg_price": 24000.0,
            "status": "PENDING",
            "mode": "PAPER"
        })
        conn = get_connection()
        try:
            with conn:
                conn.cursor().execute("""
                    INSERT INTO trade_memory (trade_id, order_id, bot, symbol, qty, price, timestamp)
                    VALUES ('TRD-HIST-1', ?, 'Bot 1', 'NIFTY 50', 150, 24000.0, ?)
                """, (cid, now))
        finally:
            conn.close()

        # Run recovery
        summary = recover_ambiguous_paper_orders()
        self.assertGreater(summary["quarantined_count"], 0)

        # Verify order transitioned to QUARANTINED with RECOVERY_TRADE_INCONSISTENCY
        conn = get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT status, rejection_reason FROM orders_memory WHERE order_id = ?", (cid,))
            row = cur.fetchone()
            self.assertEqual(row["status"], "QUARANTINED")
            self.assertEqual(row["rejection_reason"], "RECOVERY_TRADE_INCONSISTENCY")
        finally:
            conn.close()

    def test_already_filled_order_rejects_subsequent_new_fill(self):
        """11. An order in FILLED status rejects subsequent new fills before any persistent side effects."""
        cid = f"ORD_FILLED_TERMINAL_{int(time.time()*1000)}"

        # Complete order to FILLED (qty 50 @ 100.0)
        res1 = commit_paper_order_execution_atomic(
            order_record={"order_id": cid, "qty": 50, "symbol": "TATA MOTORS", "action": "BUY"},
            trade_record={"trade_id": f"TRD-FULL-{cid}", "order_id": cid, "qty": 50, "price": 100.0},
            position_action="OPEN"
        )
        self.assertTrue(res1["success"])
        self.assertEqual(res1["status"], ORDER_STATE_FILLED)

        snap1 = self.get_db_snapshot()

        # New fill attempted on already FILLED order
        with self.assertRaises(ValueError) as ctx:
            commit_paper_order_execution_atomic(
                order_record={"order_id": cid, "qty": 50, "symbol": "TATA MOTORS", "action": "BUY"},
                trade_record={"trade_id": f"TRD-ILLEGAL-NEW-{cid}", "order_id": cid, "qty": 5, "price": 105.0},
                position_action="OPEN"
            )
        self.assertIn("already FILLED", str(ctx.exception))

        # DB snapshot remains identical
        snap2 = self.get_db_snapshot()
        self.assertEqual(snap1, snap2)


if __name__ == "__main__":
    unittest.main()
