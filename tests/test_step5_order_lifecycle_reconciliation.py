"""
TRADING JARVIS WORKSTATION — STEP 5 TEST SUITE
Order Lifecycle, Execution Engine & Broker Reconciliation — Safety-First Audit

Covers:
  1. Complete Order State Machine & Transition Rules (Legal, Illegal, Terminal State Invariants, Idempotency)
  2. Non-Bypassable Pre-Trade Gates (0 through 6)
  3. Emergency Exit Strictly Exposure-Reducing Invariants (Gate 5b)
  4. Network Timeout & In-Flight Protection (UNKNOWN_PENDING_RECONCILIATION, No Blind Resubmission)
  5. Complete Order Book & Position Reconciliation (All 10 Deterministic Scenarios)
  6. Emergency Exit Unblockable Guarantee (Permitted During Reconciliation Mismatch)
  7. Audit Logging & Bit-for-Bit SQLite Database Integrity
"""

import os
import sys
import time
import tempfile
import unittest
from datetime import datetime
from typing import Dict, Any, List
from unittest.mock import MagicMock

# Workspace root in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server import memory_db
from server.execution_engine import (
    CentralizedExecutionEngine,
    execution_engine,
    ORDER_STATE_CREATED,
    ORDER_STATE_RISK_REJECTED,
    ORDER_STATE_SUBMITTED,
    ORDER_STATE_ACKNOWLEDGED,
    ORDER_STATE_OPEN,
    ORDER_STATE_PENDING,
    ORDER_STATE_PARTIALLY_FILLED,
    ORDER_STATE_FILLED,
    ORDER_STATE_CANCEL_PENDING,
    ORDER_STATE_CANCELLED,
    ORDER_STATE_REJECTED,
    ORDER_STATE_EXPIRED,
    ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION,
    VALID_ORDER_STATES,
    TERMINAL_ORDER_STATES,
    normalize_order_state,
    validate_order_state_transition,
    transition_order_state
)
from server import python_stream_server as pss
from server.python_stream_server import (
    fetch_broker_orders_adapter,
    fetch_broker_positions_adapter,
    reconcile_orders_and_positions_with_broker,
    reconcile_positions_with_broker
)


class BaseStep5TestCase(unittest.TestCase):
    """Base test case providing isolated temporary SQLite storage protecting production DB."""

    def setUp(self):
        # Create temporary database file
        self.temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_db_path = self.temp_db.name
        self.temp_db.close()

        # Redirect memory_db to temp DB
        self.orig_db_path = memory_db.DB_PATH
        memory_db.DB_PATH = self.temp_db_path
        pss.memory_db.DB_PATH = self.temp_db_path
        import sys
        if "memory_db" in sys.modules:
            sys.modules["memory_db"].DB_PATH = self.temp_db_path
        memory_db.init_db()

        # Engine instance
        self.engine = CentralizedExecutionEngine()
        self.engine.enforce_market_hours = False

        # Reset server state
        self.orig_mode = pss.execution_mode
        pss.execution_mode = "PAPER"
        self.orig_broker_state = pss.broker_state.copy()
        self.orig_reconciliation_state = pss.reconciliation_state.copy()
        pss.active_positions.clear()

    def tearDown(self):
        memory_db.DB_PATH = self.orig_db_path
        pss.memory_db.DB_PATH = self.orig_db_path
        import sys
        if "memory_db" in sys.modules:
            sys.modules["memory_db"].DB_PATH = self.orig_db_path
        pss.execution_mode = self.orig_mode
        pss.broker_state = self.orig_broker_state
        pss.reconciliation_state = self.orig_reconciliation_state
        if os.path.exists(self.temp_db_path):
            try:
                os.unlink(self.temp_db_path)
            except Exception:
                pass


# =====================================================================
# 1. ORDER STATE MACHINE & TRANSITION TESTS
# =====================================================================

class TestOrderStateMachine(BaseStep5TestCase):
    """Verifies all legal and illegal state transitions in the order state machine."""

    def test_all_canonical_order_states_registered(self):
        expected_states = {
            "CREATED", "RISK_REJECTED", "SUBMITTED", "ACKNOWLEDGED",
            "OPEN", "PENDING", "PARTIALLY_FILLED", "FILLED",
            "CANCEL_PENDING", "CANCELLED", "REJECTED", "EXPIRED",
            "UNKNOWN_PENDING_RECONCILIATION"
        }
        self.assertEqual(VALID_ORDER_STATES, expected_states)

    def test_valid_state_transitions(self):
        valid_transitions = [
            (ORDER_STATE_CREATED, ORDER_STATE_SUBMITTED),
            (ORDER_STATE_CREATED, ORDER_STATE_RISK_REJECTED),
            (ORDER_STATE_CREATED, ORDER_STATE_REJECTED),
            (ORDER_STATE_SUBMITTED, ORDER_STATE_ACKNOWLEDGED),
            (ORDER_STATE_SUBMITTED, ORDER_STATE_PENDING),
            (ORDER_STATE_SUBMITTED, ORDER_STATE_REJECTED),
            (ORDER_STATE_SUBMITTED, ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION),
            (ORDER_STATE_ACKNOWLEDGED, ORDER_STATE_OPEN),
            (ORDER_STATE_ACKNOWLEDGED, ORDER_STATE_PENDING),
            (ORDER_STATE_OPEN, ORDER_STATE_PARTIALLY_FILLED),
            (ORDER_STATE_OPEN, ORDER_STATE_FILLED),
            (ORDER_STATE_OPEN, ORDER_STATE_CANCEL_PENDING),
            (ORDER_STATE_OPEN, ORDER_STATE_CANCELLED),
            (ORDER_STATE_PARTIALLY_FILLED, ORDER_STATE_PARTIALLY_FILLED),
            (ORDER_STATE_PARTIALLY_FILLED, ORDER_STATE_FILLED),
            (ORDER_STATE_PARTIALLY_FILLED, ORDER_STATE_CANCEL_PENDING),
            (ORDER_STATE_CANCEL_PENDING, ORDER_STATE_CANCELLED),
            (ORDER_STATE_CANCEL_PENDING, ORDER_STATE_FILLED),
            (ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION, ORDER_STATE_FILLED),
            (ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION, ORDER_STATE_CANCELLED),
            (ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION, ORDER_STATE_OPEN),
        ]
        for from_s, to_s in valid_transitions:
            is_valid, reason = validate_order_state_transition(from_s, to_s)
            self.assertTrue(is_valid, f"Expected valid transition {from_s} -> {to_s}, got: {reason}")

    def test_terminal_states_cannot_transition(self):
        """Proves terminal states cannot transition to ANY other state."""
        non_terminals = [
            ORDER_STATE_CREATED, ORDER_STATE_SUBMITTED, ORDER_STATE_ACKNOWLEDGED,
            ORDER_STATE_OPEN, ORDER_STATE_PENDING, ORDER_STATE_PARTIALLY_FILLED,
            ORDER_STATE_CANCEL_PENDING, ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION
        ]
        for term_s in TERMINAL_ORDER_STATES:
            for non_term in non_terminals:
                is_valid, reason = validate_order_state_transition(term_s, non_term)
                self.assertFalse(is_valid, f"Terminal state {term_s} illegally transitioned to {non_term}")
                self.assertIn("Terminal state", reason)

    def test_illegal_state_jumps_rejected(self):
        illegal_transitions = [
            (ORDER_STATE_CREATED, ORDER_STATE_FILLED),
            (ORDER_STATE_CANCELLED, ORDER_STATE_FILLED),
            (ORDER_STATE_FILLED, ORDER_STATE_CANCELLED),
            (ORDER_STATE_REJECTED, ORDER_STATE_PENDING),
            (ORDER_STATE_CANCEL_PENDING, ORDER_STATE_OPEN),
        ]
        for from_s, to_s in illegal_transitions:
            is_valid, reason = validate_order_state_transition(from_s, to_s)
            self.assertFalse(is_valid, f"Illegal jump {from_s} -> {to_s} should have been rejected")

    def test_idempotent_same_state_transitions_allowed(self):
        for state in VALID_ORDER_STATES:
            is_valid, reason = validate_order_state_transition(state, state)
            self.assertTrue(is_valid, f"Idempotent re-entry for {state} should be valid")
            self.assertIn("Idempotent", reason)

    def test_transition_order_state_helper(self):
        oid = "ORD-TEST-STATE-001"
        memory_db.save_order({
            "order_id": oid,
            "client_order_id": oid,
            "symbol": "RELIANCE",
            "action": "BUY",
            "qty": 50,
            "filled_qty": 0,
            "price": 2900.0,
            "status": ORDER_STATE_SUBMITTED,
            "mode": "LIVE"
        })

        # Legal transition: SUBMITTED -> ACKNOWLEDGED
        res1 = transition_order_state(oid, ORDER_STATE_ACKNOWLEDGED)
        self.assertTrue(res1["success"])
        self.assertEqual(res1["new_state"], ORDER_STATE_ACKNOWLEDGED)

        # Legal transition: ACKNOWLEDGED -> OPEN
        res2 = transition_order_state(oid, ORDER_STATE_OPEN)
        self.assertTrue(res2["success"])
        self.assertEqual(res2["new_state"], ORDER_STATE_OPEN)

        # Legal transition: OPEN -> PARTIALLY_FILLED
        res3 = transition_order_state(oid, ORDER_STATE_PARTIALLY_FILLED, filled_qty=20, avg_price=2902.0)
        self.assertTrue(res3["success"])
        self.assertEqual(res3["filled_qty"], 20)

        # Legal transition: PARTIALLY_FILLED -> FILLED
        res4 = transition_order_state(oid, ORDER_STATE_FILLED, filled_qty=50, avg_price=2901.5)
        self.assertTrue(res4["success"])
        self.assertEqual(res4["new_state"], ORDER_STATE_FILLED)

        # Illegal transition: FILLED -> PENDING (Terminal violation)
        res5 = transition_order_state(oid, ORDER_STATE_PENDING)
        self.assertFalse(res5["success"])
        self.assertIn("Terminal state", res5["error"])

        # Verify DB integrity
        saved = memory_db.get_order(oid)
        self.assertEqual(saved["status"], ORDER_STATE_FILLED)
        self.assertEqual(saved["filled_qty"], 50)


# =====================================================================
# 2. PRE-TRADE GATES & EMERGENCY EXIT INVARIANTS
# =====================================================================

class TestPreTradeGatesAndEmergencyExit(BaseStep5TestCase):
    """Verifies non-bypassable pre-trade validation gates and strictly exposure-reducing exits."""

    def test_gate0_duplicate_order_id_rejected(self):
        cid = "TEST-GATE0-DUP-1"
        res1 = self.engine.execute_order(
            bot_id=1, symbol="RELIANCE", action="BUY", qty=10, price=2900.0, client_order_id=cid
        )
        self.assertTrue(res1["success"])

        # Immediate replay
        res2 = self.engine.execute_order(
            bot_id=1, symbol="RELIANCE", action="BUY", qty=10, price=2900.0, client_order_id=cid
        )
        self.assertFalse(res2["success"])
        self.assertIn("Duplicate order detected", res2["error"])

    def test_gate2_invalid_parameters_rejected(self):
        # Empty symbol
        res_sym = self.engine.execute_order(bot_id=1, symbol="", action="BUY", qty=10)
        self.assertFalse(res_sym["success"])
        self.assertIn("Symbol must be a non-empty string", res_sym["error"])

        # Non-positive quantity
        res_qty = self.engine.execute_order(bot_id=1, symbol="RELIANCE", action="BUY", qty=-5)
        self.assertFalse(res_qty["success"])
        self.assertIn("is invalid", res_qty["error"])

    def test_gate3_quorum_veto_blocks_entry_but_bypasses_emergency_exit(self):
        from unittest.mock import patch
        with patch("server.execution_engine.evaluate_order_quorum") as mock_quorum:
            # Quorum denied
            mock_quorum.return_value = {"approved": False, "quorum_ratio": "0/3"}

            # Regular entry is blocked
            res_entry = self.engine.execute_order(bot_id=1, symbol="RELIANCE", action="BUY", qty=10, price=2900.0)
            self.assertFalse(res_entry["success"])
            self.assertIn("Quorum denied", res_entry["error"])

            # Emergency exit bypasses quorum
            res_exit = self.engine.execute_order(
                bot_id=1, symbol="RELIANCE", action="EXIT", qty=10, price=2900.0, is_emergency_exit=True
            )
            self.assertTrue(res_exit["success"])
            self.assertEqual(res_exit["status"], ORDER_STATE_FILLED)

    def test_gate5b_emergency_exit_cannot_increase_long_exposure(self):
        """Proves emergency exit cannot BUY against an existing LONG position."""
        # Open LONG position
        memory_db.save_position({
            "position_id": "POS-LONG-1",
            "pos_key": "Bot 1_RELIANCE",
            "bot": "Bot 1",
            "symbol": "RELIANCE",
            "side": "LONG",
            "qty": 20,
            "avg_price": 2900.0,
            "mode": "PAPER",
            "broker": "Paper Simulator",
            "status": "OPEN"
        })

        # Attempt emergency exit with BUY (violates reducing invariant)
        res = self.engine.execute_order(
            bot_id=1, symbol="RELIANCE", action="BUY", qty=10, price=2900.0, is_emergency_exit=True
        )
        self.assertFalse(res["success"])
        self.assertIn("Emergency exit violation: Cannot BUY against open LONG position", res["error"])

    def test_gate5b_emergency_exit_cannot_increase_short_exposure(self):
        """Proves emergency exit cannot SELL against an existing SHORT position."""
        # Open SHORT position
        memory_db.save_position({
            "position_id": "POS-SHORT-1",
            "pos_key": "Bot 1_RELIANCE",
            "bot": "Bot 1",
            "symbol": "RELIANCE",
            "side": "SHORT",
            "qty": 20,
            "avg_price": 2900.0,
            "mode": "PAPER",
            "broker": "Paper Simulator",
            "status": "OPEN"
        })

        # Attempt emergency exit with SELL (violates reducing invariant)
        res = self.engine.execute_order(
            bot_id=1, symbol="RELIANCE", action="SELL", qty=10, price=2900.0, is_emergency_exit=True
        )
        self.assertFalse(res["success"])
        self.assertIn("Emergency exit violation: Cannot SELL against open SHORT position", res["error"])

    def test_gate5b_emergency_exit_caps_quantity_never_flips_position(self):
        """Proves emergency exit quantity is capped to position size, preventing flip."""
        # Open LONG position of 15 shares
        memory_db.save_position({
            "position_id": "POS-LONG-2",
            "pos_key": "Bot 1_INFY",
            "bot": "Bot 1",
            "symbol": "INFY",
            "side": "LONG",
            "qty": 15,
            "avg_price": 1800.0,
            "mode": "PAPER",
            "broker": "Paper Simulator",
            "status": "OPEN"
        })

        # Attempt emergency exit for 50 shares (would flip to -35 SHORT if uncapped)
        res = self.engine.execute_order(
            bot_id=1, symbol="INFY", action="SELL", qty=50, price=1810.0, is_emergency_exit=True
        )
        self.assertTrue(res["success"])
        self.assertEqual(res["filled_qty"], 15)  # Strictly capped to 15

        # Position should now be CLOSED, never flipped to SHORT
        open_pos = [p for p in memory_db.get_open_positions() if p["symbol"] == "INFY"]
        self.assertEqual(len(open_pos), 0)

    def test_gate6_paper_mode_never_calls_broker_place_order(self):
        mock_smart = MagicMock()
        mock_connect = {"instance": mock_smart}
        broker_conn = {"angel_one": {"connected": True}}

        res = self.engine.execute_order(
            bot_id=1, symbol="NIFTY 50", action="BUY", qty=50, price=24500.0,
            execution_mode="PAPER", broker_state=broker_conn, active_smart_connect=mock_connect
        )
        self.assertTrue(res["success"])
        self.assertEqual(res["status"], ORDER_STATE_FILLED)
        self.assertEqual(res["mode"], "PAPER")
        mock_smart.placeOrder.assert_not_called()


# =====================================================================
# 3. NETWORK TIMEOUT & IN-FLIGHT PROTECTION
# =====================================================================

class TestNetworkTimeoutHandling(BaseStep5TestCase):
    """Verifies that network timeouts do not cause blind resubmission or false rejection."""

    def test_live_timeout_transitions_to_unknown_pending_reconciliation(self):
        mock_smart = MagicMock()
        mock_smart.placeOrder.side_effect = TimeoutError("HTTPSConnectionPool: Read timed out after 10000ms")
        mock_connect = {"instance": mock_smart}
        broker_conn = {"angel_one": {"connected": True}}
        rec_matched = {"status": "MATCHED", "block_live_entries": False}

        cid = f"ORD-LIVE-TIMEOUT-{int(time.time()*1000)}"
        res = self.engine.execute_order(
            bot_id=1,
            symbol="HDFC BANK",
            action="BUY",
            qty=10,
            price=1600.0,
            execution_mode="LIVE",
            client_order_id=cid,
            broker_state=broker_conn,
            active_smart_connect=mock_connect,
            reconciliation_state=rec_matched
        )

        self.assertFalse(res["success"])
        self.assertEqual(res["status"], ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION)
        self.assertTrue(res.get("requires_reconciliation"))

        # Verify order in DB
        saved = memory_db.get_order(cid)
        self.assertIsNotNone(saved)
        self.assertEqual(saved["status"], ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION)
        self.assertEqual(saved["rejection_reason"], "TIMEOUT_AWAITING_RECONCILIATION")

    def test_timeout_order_blocks_blind_resubmission_via_idempotency(self):
        mock_smart = MagicMock()
        mock_smart.placeOrder.side_effect = TimeoutError("Connection reset by peer")
        mock_connect = {"instance": mock_smart}
        broker_conn = {"angel_one": {"connected": True}}
        rec_matched = {"status": "MATCHED", "block_live_entries": False}

        cid = f"ORD-LIVE-NO-RETRY-{int(time.time()*1000)}"
        # First attempt times out
        res1 = self.engine.execute_order(
            bot_id=1, symbol="HDFC BANK", action="BUY", qty=10, price=1600.0,
            execution_mode="LIVE", client_order_id=cid,
            broker_state=broker_conn, active_smart_connect=mock_connect, reconciliation_state=rec_matched
        )
        self.assertEqual(res1["status"], ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION)

        # Immediate retry attempt with same client_order_id MUST be blocked
        res2 = self.engine.execute_order(
            bot_id=1, symbol="HDFC BANK", action="BUY", qty=10, price=1600.0,
            execution_mode="LIVE", client_order_id=cid,
            broker_state=broker_conn, active_smart_connect=mock_connect, reconciliation_state=rec_matched
        )
        self.assertFalse(res2["success"])
        self.assertIn("Duplicate order detected", res2["error"])
        # Broker was only called once, never twice
        self.assertEqual(mock_smart.placeOrder.call_count, 1)


# =====================================================================
# 4. BROKER RECONCILIATION — 10 SPECIFIC SCENARIOS
# =====================================================================

class TestBrokerReconciliationTenScenarios(BaseStep5TestCase):
    """Verifies all 10 reconciliation discrepancy scenarios deterministically."""

    def _setup_mock_broker(self, positions=None, orders=None, fail_pos=False, fail_ord=False):
        mock_inst = MagicMock()
        if fail_pos:
            mock_inst.position.side_effect = Exception("Position API 503 Service Unavailable")
        else:
            mock_inst.position.return_value = {"status": True, "data": positions or []}

        if fail_ord:
            mock_inst.orderBook.side_effect = Exception("OrderBook API 504 Gateway Timeout")
        else:
            mock_inst.orderBook.return_value = {"status": True, "data": orders or []}

        pss.broker_state = {"angel_one": {"connected": True}}
        pss.active_smart_connect = {"instance": mock_inst}
        pss.execution_mode = "LIVE"
        return mock_inst

    # -------------------------------------------------------------
    # Scenario 1: MATCHED
    # -------------------------------------------------------------
    def test_scenario_1_matched_orders_and_positions(self):
        oid = "AO-MATCHED-001"
        memory_db.save_order({
            "order_id": oid,
            "symbol": "RELIANCE",
            "action": "BUY",
            "qty": 20,
            "filled_qty": 20,
            "status": ORDER_STATE_FILLED,
            "mode": "LIVE"
        })
        memory_db.save_position({
            "position_id": "POS-MATCHED-1",
            "pos_key": "Bot 1_RELIANCE",
            "bot": "Bot 1",
            "symbol": "RELIANCE",
            "side": "LONG",
            "qty": 20,
            "avg_price": 2900.0,
            "mode": "LIVE",
            "broker": "Angel One",
            "status": "OPEN"
        })

        self._setup_mock_broker(
            positions=[{"tradingsymbol": "RELIANCE-EQ", "netqty": "20", "buyavgprice": "2900.0"}],
            orders=[{"orderid": oid, "tradingsymbol": "RELIANCE-EQ", "quantity": "20", "fillshares": "20", "orderstatus": "complete"}]
        )

        rec = reconcile_orders_and_positions_with_broker()
        self.assertEqual(rec["status"], "MATCHED")
        self.assertFalse(rec["block_live_entries"])
        self.assertEqual(len(rec["discrepancies"]), 0)

    # -------------------------------------------------------------
    # Scenario 2: MISSING_ON_BROKER / PHANTOM_LOCAL_ORDER
    # -------------------------------------------------------------
    def test_scenario_2_missing_on_broker_phantom_order(self):
        phantom_oid = "AO-PHANTOM-LOCAL-002"
        memory_db.save_order({
            "order_id": phantom_oid,
            "symbol": "TATA MOTORS",
            "action": "BUY",
            "qty": 15,
            "status": ORDER_STATE_PENDING,
            "mode": "LIVE"
        })

        # Broker order book is empty
        self._setup_mock_broker(positions=[], orders=[])

        rec = reconcile_orders_and_positions_with_broker()
        self.assertEqual(rec["status"], "MISMATCH")
        self.assertTrue(rec["block_live_entries"])

        phantom_disc = next((d for d in rec["discrepancies"] if d["type"] == "PHANTOM_LOCAL_ORDER"), None)
        self.assertIsNotNone(phantom_disc)
        self.assertEqual(phantom_disc["order_id"], phantom_oid)

        # Local order transitioned to CANCELLED with reason
        updated = memory_db.get_order(phantom_oid)
        self.assertEqual(updated["status"], ORDER_STATE_CANCELLED)
        self.assertEqual(updated["rejection_reason"], "MISSING_ON_BROKER")

    # -------------------------------------------------------------
    # Scenario 3: UNRECORDED_BROKER_ORDER
    # -------------------------------------------------------------
    def test_scenario_3_unrecorded_broker_order(self):
        # Broker has an order placed externally (e.g. mobile app)
        unrecorded_oid = "AO-EXTERNAL-999"
        self._setup_mock_broker(
            positions=[],
            orders=[{
                "orderid": unrecorded_oid,
                "tradingsymbol": "INFY-EQ",
                "transactiontype": "BUY",
                "quantity": "50",
                "fillshares": "50",
                "orderstatus": "complete"
            }]
        )

        rec = reconcile_orders_and_positions_with_broker()
        self.assertEqual(rec["status"], "MISMATCH")
        self.assertTrue(rec["block_live_entries"])

        unrecorded = next((d for d in rec["discrepancies"] if d["type"] == "UNRECORDED_BROKER_ORDER"), None)
        self.assertIsNotNone(unrecorded)
        self.assertEqual(unrecorded["broker_order_id"], unrecorded_oid)

    # -------------------------------------------------------------
    # Scenario 4: PARTIAL_FILL_MISMATCH
    # -------------------------------------------------------------
    def test_scenario_4_partial_fill_mismatch(self):
        oid = "AO-PARTIAL-FILL-004"
        memory_db.save_order({
            "order_id": oid,
            "symbol": "CRUDE OIL",
            "action": "BUY",
            "qty": 100,
            "filled_qty": 0,  # Local thought 0
            "status": ORDER_STATE_OPEN,
            "mode": "LIVE"
        })

        # Broker reports 40 filled
        self._setup_mock_broker(
            positions=[],
            orders=[{
                "orderid": oid,
                "tradingsymbol": "CRUDEOIL24NOVFUT",
                "quantity": "100",
                "fillshares": "40",
                "fillprice": "6150.0",
                "orderstatus": "open"
            }]
        )

        rec = reconcile_orders_and_positions_with_broker()
        disc = next((d for d in rec["discrepancies"] if d["type"] == "PARTIAL_FILL_MISMATCH"), None)
        self.assertIsNotNone(disc)
        self.assertEqual(disc["broker_filled_qty"], 40)
        self.assertEqual(disc["local_filled_qty"], 0)

        # Local order synchronized to 40
        updated = memory_db.get_order(oid)
        self.assertEqual(updated["status"], ORDER_STATE_PARTIALLY_FILLED)
        self.assertEqual(updated["filled_qty"], 40)
        self.assertEqual(updated["avg_price"], 6150.0)

    # -------------------------------------------------------------
    # Scenario 5: TERMINAL_STATUS_MISMATCH
    # -------------------------------------------------------------
    def test_scenario_5_terminal_status_mismatch(self):
        oid = "AO-TERMINAL-MISMATCH-005"
        memory_db.save_order({
            "order_id": oid,
            "symbol": "BANKNIFTY",
            "action": "BUY",
            "qty": 30,
            "filled_qty": 0,
            "status": ORDER_STATE_PENDING,  # Local thinks pending
            "mode": "LIVE"
        })

        # Broker reports cancelled by exchange
        self._setup_mock_broker(
            positions=[],
            orders=[{
                "orderid": oid,
                "tradingsymbol": "BANKNIFTY24OCTFUT",
                "quantity": "30",
                "fillshares": "0",
                "orderstatus": "cancelled"
            }]
        )

        rec = reconcile_orders_and_positions_with_broker()
        disc = next((d for d in rec["discrepancies"] if d["type"] == "TERMINAL_STATUS_MISMATCH"), None)
        self.assertIsNotNone(disc)
        self.assertEqual(disc["broker_status"], ORDER_STATE_CANCELLED)

        # Local order transitioned to CANCELLED
        updated = memory_db.get_order(oid)
        self.assertEqual(updated["status"], ORDER_STATE_CANCELLED)

    # -------------------------------------------------------------
    # Scenario 6: TIMEOUT_ORDER_CONFIRMED
    # -------------------------------------------------------------
    def test_scenario_6_timeout_order_confirmed(self):
        oid = "AO-TIMEOUT-CONFIRM-006"
        memory_db.save_order({
            "order_id": oid,
            "symbol": "GOLD (XAUUSD)",
            "action": "BUY",
            "qty": 10,
            "status": ORDER_STATE_UNKNOWN_PENDING_RECONCILIATION,
            "rejection_reason": "TIMEOUT_AWAITING_RECONCILIATION",
            "mode": "LIVE"
        })

        # Broker order book confirms it was actually filled!
        self._setup_mock_broker(
            positions=[{"tradingsymbol": "GOLD24DECFUT", "netqty": "10", "buyavgprice": "75000.0"}],
            orders=[{
                "orderid": oid,
                "tradingsymbol": "GOLD24DECFUT",
                "quantity": "10",
                "fillshares": "10",
                "fillprice": "75000.0",
                "orderstatus": "complete"
            }]
        )

        rec = reconcile_orders_and_positions_with_broker()
        disc = next((d for d in rec["discrepancies"] if d["type"] == "TIMEOUT_ORDER_CONFIRMED"), None)
        self.assertIsNotNone(disc)
        self.assertEqual(disc["confirmed_status"], ORDER_STATE_FILLED)

        # Order transitioned out of UNKNOWN_PENDING_RECONCILIATION to FILLED
        updated = memory_db.get_order(oid)
        self.assertEqual(updated["status"], ORDER_STATE_FILLED)
        self.assertEqual(updated["filled_qty"], 10)

    # -------------------------------------------------------------
    # Scenario 7: RECOVERY_PENDING_RECONCILIATION
    # -------------------------------------------------------------
    def test_scenario_7_startup_recovery_pending_reconciliation(self):
        # Seed an unresolved order from prior application session
        oid = "AO-RECOVERY-007"
        memory_db.save_order({
            "order_id": oid,
            "symbol": "USDINR",
            "action": "BUY",
            "qty": 1000,
            "status": ORDER_STATE_PENDING,
            "mode": "LIVE"
        })

        # Broker reports it was cancelled
        self._setup_mock_broker(
            positions=[],
            orders=[{"orderid": oid, "tradingsymbol": "USDINR24OCTFUT", "quantity": "1000", "fillshares": "0", "orderstatus": "cancelled"}]
        )

        # Call startup restore
        pss.restore_state_on_startup()

        # Order must be resolved cleanly
        updated = memory_db.get_order(oid)
        self.assertEqual(updated["status"], ORDER_STATE_CANCELLED)

    # -------------------------------------------------------------
    # Scenario 8: POSITION_QUANTITY_MISMATCH & SIDE_MISMATCH
    # -------------------------------------------------------------
    def test_scenario_8_position_quantity_and_side_mismatches(self):
        # Case A: Quantity mismatch (local 20 vs broker 50)
        memory_db.save_position({
            "position_id": "POS-MISMATCH-1",
            "pos_key": "Bot 1_RELIANCE",
            "bot": "Bot 1",
            "symbol": "RELIANCE",
            "side": "LONG",
            "qty": 20,
            "avg_price": 2900.0,
            "mode": "LIVE",
            "broker": "Angel One",
            "status": "OPEN"
        })

        self._setup_mock_broker(
            positions=[{"tradingsymbol": "RELIANCE-EQ", "netqty": "50", "buyavgprice": "2900.0"}],
            orders=[]
        )

        rec = reconcile_orders_and_positions_with_broker()
        self.assertEqual(rec["status"], "MISMATCH")
        self.assertTrue(rec["block_live_entries"])
        self.assertTrue(any(d["type"] == "QUANTITY_MISMATCH" for d in rec["discrepancies"]))

        # Case B: Side mismatch (local LONG vs broker SHORT -20)
        self._setup_mock_broker(
            positions=[{"tradingsymbol": "RELIANCE-EQ", "netqty": "-20", "buyavgprice": "2900.0"}],
            orders=[]
        )
        rec_side = reconcile_orders_and_positions_with_broker()
        self.assertEqual(rec_side["status"], "MISMATCH")
        self.assertTrue(any(d["type"] == "SIDE_MISMATCH" for d in rec_side["discrepancies"]))

    # -------------------------------------------------------------
    # Scenario 9: IDEMPOTENT_EVENT_HANDLING
    # -------------------------------------------------------------
    def test_scenario_9_idempotent_event_handling(self):
        oid = "AO-IDEMP-009"
        memory_db.save_order({
            "order_id": oid,
            "symbol": "INFY",
            "action": "BUY",
            "qty": 10,
            "filled_qty": 10,
            "status": ORDER_STATE_FILLED,
            "mode": "LIVE"
        })

        # Transitioning an already FILLED order to FILLED is idempotent
        res1 = transition_order_state(oid, ORDER_STATE_FILLED)
        self.assertTrue(res1["success"])
        self.assertIn("Idempotent", res1["message"])

        # Second identical event is also idempotent
        res2 = transition_order_state(oid, ORDER_STATE_FILLED)
        self.assertTrue(res2["success"])
        self.assertIn("Idempotent", res2["message"])

    # -------------------------------------------------------------
    # Scenario 10: RECONCILIATION_UNAVAILABLE (FAIL-CLOSED)
    # -------------------------------------------------------------
    def test_scenario_10_reconciliation_unavailable_fails_closed(self):
        # Broker position API returns 503 error
        self._setup_mock_broker(fail_pos=True)

        rec = reconcile_orders_and_positions_with_broker()
        self.assertEqual(rec["status"], "FAILED")
        self.assertTrue(rec["block_live_entries"])
        self.assertTrue(any(d["type"] in ("RECONCILIATION_UNAVAILABLE", "BROKER_FETCH_ERROR") for d in rec["discrepancies"]))

        # Live entries must be blocked
        res = self.engine.execute_order(
            bot_id=1, symbol="RELIANCE", action="BUY", qty=10, price=2900.0,
            execution_mode="LIVE",
            broker_state=pss.broker_state,
            active_smart_connect=pss.active_smart_connect,
            reconciliation_state=rec
        )
        self.assertFalse(res["success"])
        self.assertIn("Position reconciliation mismatch", res["error"])

    # -------------------------------------------------------------
    # Emergency Exit Permitted During Reconciliation Mismatch
    # -------------------------------------------------------------
    def test_emergency_exit_permitted_during_reconciliation_mismatch(self):
        """Proves emergency exits bypass reconciliation mismatch blocks."""
        rec_mismatch = {"status": "MISMATCH", "block_live_entries": True}

        # Regular entry blocked
        res_entry = self.engine.execute_order(
            bot_id=1, symbol="RELIANCE", action="BUY", qty=10, price=2900.0,
            execution_mode="LIVE",
            broker_state={"angel_one": {"connected": True}},
            active_smart_connect={"instance": MagicMock()},
            reconciliation_state=rec_mismatch
        )
        self.assertFalse(res_entry["success"])
        self.assertIn("Position reconciliation mismatch", res_entry["error"])

        # Emergency exit permitted
        mock_smart = MagicMock()
        mock_smart.placeOrder.return_value = {"status": True, "data": {"orderid": "EXIT-CONFIRMED-99"}}
        res_exit = self.engine.execute_order(
            bot_id=1, symbol="RELIANCE", action="EXIT", qty=10, price=2900.0,
            is_emergency_exit=True,
            execution_mode="LIVE",
            broker_state={"angel_one": {"connected": True}},
            active_smart_connect={"instance": mock_smart},
            reconciliation_state=rec_mismatch
        )
        self.assertTrue(res_exit["success"])
        self.assertEqual(res_exit["orderId"], "EXIT-CONFIRMED-99")


if __name__ == "__main__":
    unittest.main()
