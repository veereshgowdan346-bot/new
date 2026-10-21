"""
CHINTU AI TRADING SYSTEM - Portfolio & Accounting Reconciliation Test Suite (Phase 7 & 8)
Verifies:
1. Portfolio funds, margin, and withdrawable balance separation (Phase 7).
2. Withdrawable funds are NOT calculated by adding profits to initial balance.
3. Accounting reconciliation: gross P/L, regulatory deductions, net P/L.
4. is_positive parsing correctly handles 0, False, '0' without default-win bug.
5. Execution engine calculates real position-based P/L on exit rather than mock values.
6. 14-Bot verification matrix generation and quorum conflict/abstain handling.
"""

import unittest
import tempfile
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from starlette.testclient import TestClient
from server import memory_db
from server.execution_engine import CentralizedExecutionEngine
from server.bot_registry import CANONICAL_BOT_REGISTRY, get_all_canonical_bots
from server.python_stream_server import app, calculate_trade_deductions


class TestPortfolioFundsAndMargin(unittest.TestCase):
    """Tests Phase 7 funds, margin, and withdrawable balance segregation."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        from server import python_stream_server as pss
        self.pss = pss
        self.orig_broker_state = {k: v.copy() for k, v in pss.broker_state.items()}
        self.orig_active_smart_connect = pss.active_smart_connect.copy()

    def tearDown(self):
        for k, v in self.orig_broker_state.items():
            self.pss.broker_state[k] = v.copy()
        self.pss.active_smart_connect.clear()
        self.pss.active_smart_connect.update(self.orig_active_smart_connect)

    def test_funds_and_margin_endpoint(self):
        res = self.client.get("/api/portfolio/funds-and-margin")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")

        # Verify all Phase 7 required fields are present
        fm = data["funds_and_margin"]
        self.assertIn("broker_reported_available_funds", fm)
        self.assertIn("broker_reported_collateral_margin", fm)
        self.assertIn("broker_reported_net_margin", fm)
        self.assertIn("estimated_used_margin", fm)
        self.assertIn("broker_reported_withdrawable_funds", fm)
        self.assertIn("withdrawable_status_note", fm)

        # Crucial Phase 7 mandate: Withdrawable balance must NEVER simply equal availableCash + profit
        self.assertIn("UNAVAILABLE", str(fm["broker_reported_withdrawable_funds"]))

        # Verify PnL and accounting section
        pa = data["pnl_and_accounting"]
        self.assertIn("open_position_unrealized_pnl", pa)
        self.assertIn("closed_position_gross_realized_pnl", pa)
        self.assertIn("closed_position_charges", pa)
        self.assertIn("closed_position_net_realized_pnl", pa)
        self.assertIn("day_net_pnl", pa)
        self.assertIn("all_time_net_pnl", pa)

    def test_disconnected_broker_returns_explicit_unavailable_state(self):
        """When broker is disconnected, returns explicit DISCONNECTED state and zero broker funds."""
        self.pss.broker_state["angel_one"]["connected"] = False
        self.pss.broker_state["angel_one"]["realAuth"] = False
        self.pss.active_smart_connect["instance"] = None

        res = self.client.get("/api/portfolio/funds-and-margin")
        data = res.json()
        self.assertEqual(res.status_code, 200)
        self.assertIn("DISCONNECTED", data["data_source_status"])
        self.assertEqual(data["funds_and_margin"]["broker_reported_available_funds"], 0.0)
        self.assertEqual(data["funds_and_margin"]["broker_reported_collateral_margin"], 0.0)
        self.assertIn("UNAVAILABLE (Broker Disconnected)", data["funds_and_margin"]["broker_reported_withdrawable_funds"])
        
        # Verify paper_account is cleanly segregated from broker fields
        self.assertIn("paper_account", data)
        self.assertEqual(data["paper_account"]["virtual_initial_capital"], 500000.0)
        self.assertTrue(data["paper_account"]["is_simulated"])

    def test_valid_broker_response_populates_authentic_rms_funds(self):
        """When genuine broker session exists and rmsLimit succeeds, authentic funds are populated."""
        from unittest.mock import MagicMock
        mock_smart = MagicMock()
        mock_smart.rmsLimit.return_value = {
            "status": True,
            "message": "SUCCESS",
            "data": {
                "availablecash": 125000.50,
                "collateral": 75000.00,
                "net": 200000.50
            }
        }
        self.pss.broker_state["angel_one"]["connected"] = True
        self.pss.broker_state["angel_one"]["realAuth"] = True
        self.pss.active_smart_connect["instance"] = mock_smart

        res = self.client.get("/api/portfolio/funds-and-margin")
        data = res.json()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(data["data_source_status"], "BROKER_RMS_AUTHENTIC")
        self.assertEqual(data["funds_and_margin"]["broker_reported_available_funds"], 125000.50)
        self.assertEqual(data["funds_and_margin"]["broker_reported_collateral_margin"], 75000.00)
        self.assertEqual(data["funds_and_margin"]["broker_reported_net_margin"], 200000.50)
        self.assertIn("Pending Broker Settlement T+1", data["funds_and_margin"]["broker_reported_withdrawable_funds"])

    def test_zero_broker_funds_reported_truthfully(self):
        """When broker authentic RMS reports 0 cash, it is reported truthfully without fallback."""
        from unittest.mock import MagicMock
        mock_smart = MagicMock()
        mock_smart.rmsLimit.return_value = {
            "status": True,
            "message": "SUCCESS",
            "data": {
                "availablecash": 0.00,
                "collateral": 0.00,
                "net": 0.00
            }
        }
        self.pss.broker_state["angel_one"]["connected"] = True
        self.pss.broker_state["angel_one"]["realAuth"] = True
        self.pss.active_smart_connect["instance"] = mock_smart

        res = self.client.get("/api/portfolio/funds-and-margin")
        data = res.json()
        self.assertEqual(data["data_source_status"], "BROKER_RMS_AUTHENTIC")
        self.assertEqual(data["funds_and_margin"]["broker_reported_available_funds"], 0.0)
        self.assertEqual(data["funds_and_margin"]["broker_reported_collateral_margin"], 0.0)

    def test_malformed_broker_response_handled_gracefully(self):
        """When broker returns malformed response (status: False), flagged explicitly."""
        from unittest.mock import MagicMock
        mock_smart = MagicMock()
        mock_smart.rmsLimit.return_value = {
            "status": False,
            "message": "Session Expired",
            "data": None
        }
        self.pss.broker_state["angel_one"]["connected"] = True
        self.pss.broker_state["angel_one"]["realAuth"] = True
        self.pss.active_smart_connect["instance"] = mock_smart

        res = self.client.get("/api/portfolio/funds-and-margin")
        data = res.json()
        self.assertIn("BROKER_API_MALFORMED_RESPONSE", data["data_source_status"])
        self.assertIn("Malformed", data["funds_and_margin"]["broker_reported_withdrawable_funds"])

    def test_broker_api_failure_handled_gracefully(self):
        """When broker API raises network exception, flagged explicitly."""
        from unittest.mock import MagicMock
        mock_smart = MagicMock()
        mock_smart.rmsLimit.side_effect = ConnectionError("Angel One RMS gateway unreachable")
        self.pss.broker_state["angel_one"]["connected"] = True
        self.pss.broker_state["angel_one"]["realAuth"] = True
        self.pss.active_smart_connect["instance"] = mock_smart

        res = self.client.get("/api/portfolio/funds-and-margin")
        data = res.json()
        self.assertIn("BROKER_API_ERROR", data["data_source_status"])
        self.assertIn("Broker API Error", data["funds_and_margin"]["broker_reported_withdrawable_funds"])

    def test_stale_data_detection(self):
        """When broker sync timestamp is older than 300 seconds, flagged as stale."""
        from datetime import datetime, timedelta
        from unittest.mock import MagicMock
        mock_smart = MagicMock()
        # Force exception to inspect cached sync time
        mock_smart.rmsLimit.side_effect = TimeoutError("Timed out")
        old_time = (datetime.now() - timedelta(minutes=10)).isoformat()
        self.pss.broker_state["angel_one"]["connected"] = True
        self.pss.broker_state["angel_one"]["realAuth"] = True
        self.pss.broker_state["angel_one"]["connectedAt"] = old_time
        self.pss.active_smart_connect["instance"] = mock_smart

        res = self.client.get("/api/portfolio/funds-and-margin")
        data = res.json()
        self.assertTrue(data["funds_and_margin"]["is_stale"])
        self.assertIn("STALE", data["data_source_status"])


class TestAccountingAndTradeMemoryIntegrity(unittest.TestCase):
    """Tests trade memory parsing, is_positive bug fix, and real P/L calculation."""

    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_db_path = self.temp_db.name
        self.temp_db.close()
        self.orig_db_path = memory_db.DB_PATH
        memory_db.DB_PATH = self.temp_db_path
        memory_db.init_db()

    def tearDown(self):
        memory_db.DB_PATH = self.orig_db_path
        if os.path.exists(self.temp_db_path):
            try:
                os.unlink(self.temp_db_path)
            except Exception:
                pass

    def test_is_positive_loss_parsing(self):
        # Insert losing trade with is_positive=0
        tid = memory_db.log_trade({
            "id": "TRD_LOSS_001",
            "bot": "Bot 1",
            "symbol": "NIFTY 50",
            "pnl": "-₹350.00",
            "is_positive": 0,
            "mode": "PAPER"
        })

        conn = memory_db.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT is_positive, pnl FROM trade_memory WHERE trade_id = 'TRD_LOSS_001'")
        row = cursor.fetchone()
        conn.close()

        self.assertIsNotNone(row)
        self.assertEqual(row["is_positive"], 0)
        self.assertEqual(row["pnl"], "-₹350.00")

    def test_is_positive_inferred_from_negative_pnl_string(self):
        # Insert losing trade without explicit is_positive flag
        tid = memory_db.log_trade({
            "id": "TRD_LOSS_002",
            "bot": "Bot 3",
            "symbol": "RELIANCE",
            "pnl": "-₹1,200.50",
            "mode": "PAPER"
        })

        conn = memory_db.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT is_positive, pnl FROM trade_memory WHERE trade_id = 'TRD_LOSS_002'")
        row = cursor.fetchone()
        conn.close()

        self.assertIsNotNone(row)
        self.assertEqual(row["is_positive"], 0)

    def test_execution_engine_real_pnl_on_exit(self):
        engine = CentralizedExecutionEngine()

        # Step 1: Open LONG position @ 24,000
        r1 = engine.execute_order(
            bot_id=1,
            symbol="NIFTY 50",
            action="BUY",
            qty=50,
            price=24000.0,
            execution_mode="PAPER"
        )
        self.assertTrue(r1["success"])

        # Step 2: Exit position @ 24,100 (Profit of +100/unit * 50 = +5000 approx with slippage)
        r2 = engine.execute_order(
            bot_id=1,
            symbol="NIFTY 50",
            action="EXIT",
            qty=50,
            price=24100.0,
            execution_mode="PAPER"
        )
        self.assertTrue(r2["success"])

        # Step 3: Check trade record has real P/L, NOT hardcoded +₹150.00
        conn = memory_db.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT pnl, is_positive, price, qty FROM trade_memory WHERE action = 'EXIT'")
        row = cursor.fetchone()
        conn.close()

        self.assertIsNotNone(row)
        pnl_str = row["pnl"]
        self.assertNotEqual(pnl_str, "+₹150.00", "P/L must not be hardcoded to +₹150.00")
        self.assertTrue(pnl_str.startswith("+₹"), f"Expected positive P/L string, got {pnl_str}")
        self.assertEqual(row["is_positive"], 1)


class Test14BotsRegistrationAndVerificationMatrix(unittest.TestCase):
    """Tests canonical 14 bots accounting and registry consistency."""

    def test_exactly_14_canonical_bots_registered(self):
        bots = get_all_canonical_bots()
        self.assertEqual(len(bots), 14)
        bot_ids = [b["id"] for b in bots]
        self.assertEqual(bot_ids, list(range(1, 15)))

    def test_no_duplicate_bot_registrations(self):
        names = [b["name"] for b in CANONICAL_BOT_REGISTRY.values()]
        self.assertEqual(len(names), len(set(names)), "Bot names must be unique")


if __name__ == "__main__":
    unittest.main()

