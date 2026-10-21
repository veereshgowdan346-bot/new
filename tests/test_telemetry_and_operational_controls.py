"""
CHINTU AI TRADING SYSTEM - Latency Telemetry & Operational Controls Test Suite (Phase 9)
Verifies:
  - Millisecond latency recording across pipeline stages.
  - Percentile calculations (p50, p95, p99, min, max, mean).
  - Emergency square-off all positions bypassing quorum.
  - Platform-wide pause and resume trading controls.
  - FastAPI REST API endpoints for telemetry and operational commands.
"""

import unittest
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from starlette.testclient import TestClient

from server.telemetry_engine import LatencyTelemetryEngine
from server.memory_db import save_position, get_open_positions, close_position
from server.python_stream_server import app


class TestLatencyTelemetryCalculations(unittest.TestCase):
    """Tests latency metric calculations and ring-buffer operations."""

    def setUp(self):
        self.engine = LatencyTelemetryEngine(max_samples=100)

    def test_percentiles_calculation(self):
        # Record 100 deterministic values: 1.0 to 100.0 ms
        for val in range(1, 101):
            self.engine.record_latency("tick_to_signal_ms", float(val))

        stats = self.engine.calculate_percentiles("tick_to_signal_ms")
        self.assertEqual(stats["count"], 100)
        self.assertEqual(stats["min_ms"], 1.0)
        self.assertEqual(stats["max_ms"], 100.0)
        self.assertEqual(stats["p50_ms"], 50.0)
        self.assertEqual(stats["p95_ms"], 95.0)
        self.assertEqual(stats["p99_ms"], 99.0)
        self.assertEqual(stats["mean_ms"], 50.5)

    def test_empty_stage_returns_zeroes(self):
        stats = self.engine.calculate_percentiles("unrecorded_stage")
        self.assertEqual(stats["count"], 0)
        self.assertEqual(stats["p50_ms"], 0.0)


class TestOperationalControls(unittest.TestCase):
    """Tests pause/resume and emergency square-off all positions."""

    def setUp(self):
        import tempfile
        from server import memory_db
        self.temp_db_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_db_path = self.temp_db_file.name
        self.temp_db_file.close()
        self.orig_db_path = memory_db.DB_PATH
        memory_db.DB_PATH = self.temp_db_path
        memory_db.init_db()

        self.engine = LatencyTelemetryEngine()

    def tearDown(self):
        from server import memory_db
        memory_db.DB_PATH = self.orig_db_path
        if os.path.exists(self.temp_db_path):
            try:
                os.unlink(self.temp_db_path)
            except Exception:
                pass

    def test_pause_and_resume_controls(self):
        res_pause = self.engine.pause_trading(reason="Test drill pause")
        self.assertTrue(res_pause["trading_paused"])
        self.assertTrue(self.engine.trading_paused)
        self.assertEqual(res_pause["reason"], "Test drill pause")

        res_resume = self.engine.resume_trading()
        self.assertFalse(res_resume["trading_paused"])
        self.assertFalse(self.engine.trading_paused)

    def test_emergency_square_off_all_positions(self):
        # Open 2 test positions
        save_position({
            "position_id": "POS-TEST-1",
            "pos_key": "Bot 1_TEST_TELE_1",
            "bot": "Bot 1",
            "symbol": "TEST_TELE_1",
            "side": "LONG",
            "qty": 10,
            "avg_price": 500.0,
            "status": "OPEN",
            "mode": "PAPER"
        })
        save_position({
            "position_id": "POS-TEST-2",
            "pos_key": "Bot 2_TEST_TELE_2",
            "bot": "Bot 2",
            "symbol": "TEST_TELE_2",
            "side": "SHORT",
            "qty": 20,
            "avg_price": 1000.0,
            "status": "OPEN",
            "mode": "PAPER"
        })

        # Verify they are open
        open_pos = [p for p in get_open_positions() if p["symbol"] in ("TEST_TELE_1", "TEST_TELE_2")]
        self.assertEqual(len(open_pos), 2)

        # Trigger emergency square-off
        res = self.engine.emergency_square_off_all_positions(reason="Integration Test Square-off")
        self.assertEqual(res["status"], "success")
        self.assertGreaterEqual(res["closed_positions_count"], 2)

        # Verify they are now closed
        open_pos_after = [p for p in get_open_positions() if p["symbol"] in ("TEST_TELE_1", "TEST_TELE_2")]
        self.assertEqual(len(open_pos_after), 0)


class TestTelemetryAPIEndpoints(unittest.TestCase):
    """Tests FastAPI REST endpoints for latency telemetry and operational controls."""

    AUTH_HEADERS = {"Authorization": "Bearer chintu_master_auth_permanent_veeresh"}

    @classmethod
    def setUpClass(cls):
        import tempfile
        from server import memory_db
        cls.temp_db_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        cls.temp_db_path = cls.temp_db_file.name
        cls.temp_db_file.close()
        cls.orig_db_path = memory_db.DB_PATH
        memory_db.DB_PATH = cls.temp_db_path
        memory_db.init_db()

        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        from server import memory_db
        memory_db.DB_PATH = cls.orig_db_path
        if os.path.exists(cls.temp_db_path):
            try:
                os.unlink(cls.temp_db_path)
            except Exception:
                pass

    def test_get_latency_telemetry_endpoint(self):
        res = self.client.get("/api/telemetry/latency")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("stages", data)
        self.assertIn("tick_to_signal_ms", data["stages"])

    def test_record_latency_endpoint(self):
        payload = {"stage": "tick_to_signal_ms", "duration_ms": 14.5}
        res = self.client.post("/api/telemetry/record", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["duration_ms"], 14.5)

    def test_operational_pause_and_resume_endpoints(self):
        res_pause = self.client.post("/api/operational/pause-trading", headers=self.AUTH_HEADERS)
        self.assertEqual(res_pause.status_code, 200)
        self.assertTrue(res_pause.json()["trading_paused"])

        res_resume = self.client.post("/api/operational/resume-trading", headers=self.AUTH_HEADERS)
        self.assertEqual(res_resume.status_code, 200)
        self.assertFalse(res_resume.json()["trading_paused"])

    def test_operational_emergency_square_off_endpoint(self):
        payload = {"reason": "API automated test emergency square-off"}
        res = self.client.post("/api/operational/emergency-square-off", json=payload, headers=self.AUTH_HEADERS)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "success")


if __name__ == "__main__":
    unittest.main()

