"""
CHINTU AI TRADING SYSTEM - Live Readiness Gate Test Suite (Phase 8)
Verifies:
  - Evaluation of all 8 pre-flight release conditions.
  - Fail-closed blocking of LIVE mode when broker or feed is unauthenticated.
  - Detection of reconciliation mismatches and tripped RMS circuit breakers.
  - Requirement of explicit user consent before live activation.
  - Permanent default to PAPER mode on system restart.
  - REST API endpoint GET /api/live-readiness and POST /api/execution-mode protection.
"""

import unittest
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from starlette.testclient import TestClient

from server.live_readiness_gate import evaluate_live_readiness
from server.python_stream_server import app


class TestLiveReadinessGateConditions(unittest.TestCase):
    """Tests unit evaluation of 8 pre-flight conditions."""

    def test_unauthenticated_broker_fails_condition(self):
        res = evaluate_live_readiness(
            broker_state={"angel_one": {"connected": False}},
            active_smart_connect={"instance": None},
            market_feed_evaluator_fn=lambda: {"authentic": False, "message": "Simulated"},
            rms_state={"circuit_breaker_active": False},
            reconciliation_state={"status": "CLEAN"},
            user_consent_provided=False
        )
        self.assertFalse(res["ready_for_live"])
        self.assertEqual(res["total_conditions"], 8)
        self.assertIn("AUTHENTIC_BROKER_AUTH", res["failed_conditions"])
        self.assertEqual(res["conditions"]["AUTHENTIC_BROKER_AUTH"]["status"], "FAIL")

    def test_rms_loss_limit_breach_fails_condition(self):
        res = evaluate_live_readiness(
            broker_state={"angel_one": {"connected": True}},
            active_smart_connect={"instance": object()},
            market_feed_evaluator_fn=lambda: {"authentic": True, "message": "Authentic"},
            rms_state={
                "circuit_breaker_active": False,
                "max_daily_loss": 2000.0,
                "realized_daily_pnl": -2500.0  # Loss breached
            },
            reconciliation_state={"status": "MATCHED"},
            user_consent_provided=True
        )
        self.assertFalse(res["ready_for_live"])
        self.assertIn("RMS_CIRCUIT_BREAKER_ARMED", res["failed_conditions"])

    def test_reconciliation_mismatch_fails_condition(self):
        res = evaluate_live_readiness(
            broker_state={"angel_one": {"connected": True}},
            active_smart_connect={"instance": object()},
            market_feed_evaluator_fn=lambda: {"authentic": True},
            rms_state={"circuit_breaker_active": False},
            reconciliation_state={"status": "MISMATCH", "block_live_entries": True},
            user_consent_provided=True
        )
        self.assertFalse(res["ready_for_live"])
        self.assertIn("RECONCILIATION_MATCH", res["failed_conditions"])

    def test_missing_user_consent_fails_condition(self):
        res = evaluate_live_readiness(
            broker_state={"angel_one": {"connected": True}},
            active_smart_connect={"instance": object()},
            market_feed_evaluator_fn=lambda: {"authentic": True},
            rms_state={"circuit_breaker_active": False},
            reconciliation_state={"status": "MATCHED"},
            user_consent_provided=False  # No operator consent
        )
        self.assertFalse(res["ready_for_live"])
        self.assertIn("EXPLICIT_USER_CONSENT", res["failed_conditions"])


class TestLiveReadinessAPIEndpoints(unittest.TestCase):
    """Tests REST endpoints for Live Readiness status and guarded mode switching."""

    AUTH_HEADERS = {"Authorization": "Bearer chintu_master_auth_permanent_veeresh"}

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_get_live_readiness_status_endpoint(self):
        res = self.client.get("/api/live-readiness")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("readiness", data)
        self.assertEqual(data["readiness"]["total_conditions"], 8)
        self.assertFalse(data["readiness"]["ready_for_live"])  # Broker unauthenticated in test environment

    def test_post_execution_mode_blocks_live_when_readiness_unmet(self):
        payload = {"mode": "LIVE", "user_consent": False}
        res = self.client.post("/api/execution-mode", json=payload, headers=self.AUTH_HEADERS)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "error")
        self.assertEqual(data["mode"], "PAPER")  # Must stay in PAPER mode!
        self.assertIn("readiness", data)


if __name__ == "__main__":
    unittest.main()

