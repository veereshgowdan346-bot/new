"""
CHINTU AI TRADING SYSTEM - Idempotency Boundary Stability Test Suite (Phase 8.3 Stage 3.1)
Verifies:
  1. Sliding elapsed-time window prevents tumbling 5-second boundary rollover defects.
  2. Same order parameters within idempotency_window_seconds return identical client order IDs.
  3. Orders separated by >= idempotency_window_seconds return distinct client order IDs.
  4. Parameter sensitivity: distinct bot, symbol, action, or price yield distinct client order IDs.
  5. Thread-safe concurrent order ID generation under multi-threaded execution.
  6. BotWorker._execute_paper_order duplicate order rejection is 100% deterministic (repeated 20x).
  7. Explicit client_order_id in signal payload is strictly respected.
  8. Safety Mandates: LIVE_TRADING_ELIGIBLE strictly False; chintu_memory.db bit-for-bit unchanged.
"""

import os
import sys
import time
import shutil
import hashlib
import tempfile
import threading
import unittest
from datetime import datetime

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server.execution_engine import CentralizedExecutionEngine, execution_engine
from server.bot_scheduler import BotWorker
from server import memory_db
from server.centralized_risk_manager import centralized_risk_manager
from server.live_readiness_gate import is_live_trading_eligible


class TestIdempotencyBoundaryStability(unittest.TestCase):
    """Exhaustive tests for deterministic client order ID generation and Gate 0 idempotency."""

    @classmethod
    def setUpClass(cls):
        cls.real_db_path = os.path.join(PROJECT_ROOT, "server", "chintu_memory.db")
        cls.temp_dir = tempfile.mkdtemp(prefix="chintu_idemp_stability_")
        cls.temp_db_path = os.path.join(cls.temp_dir, "test_chintu_memory.db")
        shutil.copy2(cls.real_db_path, cls.temp_db_path)
        cls.orig_db_path = memory_db.DB_PATH
        memory_db.DB_PATH = cls.temp_db_path

    @classmethod
    def tearDownClass(cls):
        memory_db.DB_PATH = cls.orig_db_path
        shutil.rmtree(cls.temp_dir, ignore_errors=True)

    def setUp(self):
        self.engine = CentralizedExecutionEngine()
        self.engine.enforce_market_hours = False
        execution_engine.enforce_market_hours = False
        execution_engine.clear_idempotency_cache()
        centralized_risk_manager.config["circuit_breaker_active"] = False
        centralized_risk_manager.config["emergency_stop_active"] = False
        centralized_risk_manager.quarantined_bots.clear()
        centralized_risk_manager.order_timestamps.clear()
        try:
            memory_db.close_position("RELIANCE")
            memory_db.close_position("INFY")
        except Exception:
            pass

    # -------------------------------------------------------------------------
    # 1. Sliding Window Across 5.0s Boundaries
    # -------------------------------------------------------------------------
    def test_sliding_window_across_5s_boundaries(self):
        """Proves orders spanning 5-second tumbling boundaries receive identical CIDs within window."""
        e = self.engine
        # Call 1 at 4.99s, Call 2 at 5.01s (spans the 5.0s integer division boundary)
        cid_499 = e.generate_idempotent_order_id(1, "NIFTY 50", "BUY", 24500.0, timestamp=4.99)
        cid_501 = e.generate_idempotent_order_id(1, "NIFTY 50", "BUY", 24500.0, timestamp=5.01)
        self.assertEqual(cid_499, cid_501, "CID must remain identical across 5.0s boundary.")

        # Another span across 10.0s boundary: Call at 9.99s and 10.01s
        cid_999 = e.generate_idempotent_order_id(1, "NIFTY 50", "BUY", 24500.0, timestamp=9.99)
        cid_1001 = e.generate_idempotent_order_id(1, "NIFTY 50", "BUY", 24500.0, timestamp=10.01)
        self.assertEqual(cid_499, cid_999)
        self.assertEqual(cid_999, cid_1001)

    # -------------------------------------------------------------------------
    # 2. Window Expiration Generates New CID
    # -------------------------------------------------------------------------
    def test_window_expiration_generates_new_cid(self):
        """Proves orders separated by >= idempotency_window_seconds receive new CIDs."""
        e = self.engine
        cid_start = e.generate_idempotent_order_id(1, "NIFTY 50", "BUY", 24500.0, timestamp=100.0)
        # Call 10.5 seconds later (past 10.0s window)
        cid_later = e.generate_idempotent_order_id(1, "NIFTY 50", "BUY", 24500.0, timestamp=110.5)
        self.assertNotEqual(cid_start, cid_later, "CID must roll over after idempotency_window_seconds.")

    # -------------------------------------------------------------------------
    # 3. Parametric Sensitivity
    # -------------------------------------------------------------------------
    def test_parameter_sensitivity(self):
        """Proves differing bot, symbol, action, or price produce distinct CIDs."""
        e = self.engine
        t = 50.0
        base = e.generate_idempotent_order_id(1, "NIFTY 50", "BUY", 24500.0, timestamp=t)
        diff_bot = e.generate_idempotent_order_id(2, "NIFTY 50", "BUY", 24500.0, timestamp=t)
        diff_sym = e.generate_idempotent_order_id(1, "BANKNIFTY", "BUY", 24500.0, timestamp=t)
        diff_act = e.generate_idempotent_order_id(1, "NIFTY 50", "SELL", 24500.0, timestamp=t)
        diff_price = e.generate_idempotent_order_id(1, "NIFTY 50", "BUY", 24550.0, timestamp=t)

        all_cids = {base, diff_bot, diff_sym, diff_act, diff_price}
        self.assertEqual(len(all_cids), 5, "All differing parameter sets must produce unique CIDs.")

    # -------------------------------------------------------------------------
    # 4. Multi-Threaded Concurrency
    # -------------------------------------------------------------------------
    def test_concurrent_order_id_generation(self):
        """Proves thread-safety when generating order IDs concurrently."""
        e = self.engine
        results = []
        errors = []

        def worker_task(bot_id, ts):
            try:
                cid = e.generate_idempotent_order_id(bot_id, "RELIANCE", "BUY", 2900.0, timestamp=ts)
                results.append((bot_id, cid))
            except Exception as exc:
                errors.append(exc)

        threads = []
        for i in range(20):
            b_id = (i % 3) + 1
            t = threading.Thread(target=worker_task, args=(b_id, 100.0 + (i * 0.1)))
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        self.assertEqual(len(errors), 0, f"Encountered thread errors: {errors}")
        self.assertEqual(len(results), 20)

    # -------------------------------------------------------------------------
    # 5. Deterministic Duplicate Rejection in BotWorker (20 Iterations)
    # -------------------------------------------------------------------------
    def test_bot_scheduler_duplicate_order_deterministic_rejection(self):
        """
        Executes duplicate order pair 20 times in sequence.
        Proves 100% of second calls are caught by Gate 0 as duplicate orders.
        """
        worker = BotWorker(bot_id=3)
        signal = {
            "decision": "BUY",
            "entry_price": 1500.0,
            "strategy_id": "MEAN_REVERSION",
            "reason": "Oversold"
        }

        for iteration in range(20):
            # Clean position, idempotency cache, and RMS rate limit before each iteration
            execution_engine.clear_idempotency_cache()
            centralized_risk_manager.order_timestamps.clear()
            memory_db.close_position("RELIANCE")

            # First order: must succeed
            res1 = worker._execute_paper_order(signal, bar_timestamp=None)
            self.assertTrue(res1["success"], f"Iteration {iteration}: res1 failed: {res1}")
            self.assertEqual(res1["status"], "COMPLETE")

            # Immediate duplicate replay: must be caught by Gate 0
            res2 = worker._execute_paper_order(signal, bar_timestamp=None)
            self.assertFalse(res2["success"], f"Iteration {iteration}: res2 was not rejected: {res2}")
            self.assertEqual(res2["status"], "REJECTED")
            self.assertIn(
                "Duplicate order detected",
                res2["error"],
                f"Iteration {iteration}: Expected Gate 0 duplicate error, got: {res2['error']}"
            )

    # -------------------------------------------------------------------------
    # 6. Explicit client_order_id in Signal Payload
    # -------------------------------------------------------------------------
    def test_explicit_client_order_id_in_signal_payload(self):
        """Proves explicit client_order_id provided in signal is honored."""
        worker = BotWorker(bot_id=3)
        memory_db.close_position("RELIANCE")
        execution_engine.clear_idempotency_cache()

        custom_cid = f"CUSTOM-CLIENT-ID-{int(time.time()*1000)}"
        signal = {
            "decision": "BUY",
            "entry_price": 1500.0,
            "strategy_id": "MEAN_REVERSION",
            "client_order_id": custom_cid
        }

        res = worker._execute_paper_order(signal, bar_timestamp=None)
        self.assertTrue(res["success"])
        self.assertEqual(res["order_id"], custom_cid)

    # -------------------------------------------------------------------------
    # 7. Safety Mandates & DB Isolation
    # -------------------------------------------------------------------------
    def test_safety_mandates_and_db_immutability(self):
        """Verifies that LIVE_TRADING_ELIGIBLE is strictly False and DB is untouched."""
        self.assertFalse(is_live_trading_eligible(), "LIVE_TRADING_ELIGIBLE must strictly remain False.")

        db_path = os.path.join(PROJECT_ROOT, "server", "chintu_memory.db")
        self.assertTrue(os.path.exists(db_path))

        expected_hash = "53509588F78CA463B91FCD3DB379E550CF3B901FA2C8510D3E1E541B86B4CB53"
        expected_size = 1306624

        actual_size = os.path.getsize(db_path)
        with open(db_path, "rb") as f:
            actual_hash = hashlib.sha256(f.read()).hexdigest().upper()

        self.assertEqual(actual_size, expected_size)
        self.assertEqual(actual_hash, expected_hash)


if __name__ == "__main__":
    unittest.main()
