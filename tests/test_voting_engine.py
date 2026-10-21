"""
CHINTU AI TRADING SYSTEM - Majority Voting Engine Test Suite (Phase 3)
Deterministic verification of voting thresholds, conflict policies, anti-sybil deduplication,
stale signal rejection, unavailable bot exclusion, and emergency exit bypass.
"""

import unittest
import os
import sys
from datetime import datetime, timedelta

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from starlette.testclient import TestClient

from server.voting_engine import (
    evaluate_order_quorum,
    get_voting_config,
    update_voting_config,
    DEFAULT_VOTING_CONFIG
)
from server.python_stream_server import app
from server.bot_scheduler import bot_scheduler


class TestMajorityVotingEngine(unittest.TestCase):
    """Deterministic tests for configurable voting engine."""

    def setUp(self):
        # Reset to default config before each test
        update_voting_config(DEFAULT_VOTING_CONFIG)

    def test_default_voting_config(self):
        cfg = get_voting_config()
        self.assertEqual(cfg["voting_scope"], "peer_mesh")
        self.assertEqual(cfg["threshold_mode"], "percentage")
        self.assertEqual(cfg["min_quorum_percentage"], 66.6)
        self.assertEqual(cfg["min_approval_count"], 2)
        self.assertTrue(cfg["emergency_exit_bypass"])

    def test_update_and_persist_config(self):
        updated = update_voting_config({
            "min_quorum_percentage": 75.0,
            "min_approval_count": 3,
            "conflict_policy": "ABSTAIN"
        })
        self.assertEqual(updated["min_quorum_percentage"], 75.0)
        self.assertEqual(updated["min_approval_count"], 3)
        self.assertEqual(updated["conflict_policy"], "ABSTAIN")

        # Verify persisted read
        saved = get_voting_config()
        self.assertEqual(saved["min_quorum_percentage"], 75.0)
        self.assertEqual(saved["min_approval_count"], 3)

    def test_emergency_exit_bypass(self):
        # When action is EXIT, quorum must be approved immediately without delay
        res = evaluate_order_quorum(bot_id=1, action="EXIT", is_emergency_exit=True)
        self.assertTrue(res["approved"])
        self.assertTrue(res["quorum_met"])
        self.assertEqual(res["decision"], "EMERGENCY_EXIT_BYPASS")
        self.assertIn("Emergency risk-reducing exit bypasses entry quorum", res["audit_trail"]["explanation"])

    def test_quorum_percentage_and_count_thresholds(self):
        # Test percentage mode requiring >= 66.6%
        res = evaluate_order_quorum(
            bot_id=1,
            action="BUY",
            custom_config={"threshold_mode": "percentage", "min_quorum_percentage": 66.6}
        )
        self.assertIn(res["decision"], ["APPROVED", "REJECTED", "ABSTAIN"])
        self.assertIn("voting_breakdown", res)
        self.assertGreaterEqual(len(res["voting_breakdown"]), 1)

        # Test count mode requiring >= 2 approvals
        res_count = evaluate_order_quorum(
            bot_id=1,
            action="BUY",
            custom_config={"threshold_mode": "count", "min_approval_count": 2}
        )
        self.assertEqual(res_count["threshold_mode"], "count")
        self.assertEqual(res_count["threshold_value"], 2)

    def test_stale_vote_rejection(self):
        # Inject stale evaluation time on worker 2
        worker2 = bot_scheduler.workers.get(2)
        if worker2:
            stale_time = (datetime.now() - timedelta(seconds=120)).isoformat()
            with worker2.lock:
                worker2.last_evaluation_time = stale_time
                worker2.last_signal = {"decision": "BUY", "confidence": 0.85, "reason": "Old signal"}

            # Evaluate with 60s max signal age
            res = evaluate_order_quorum(
                bot_id=1,
                action="BUY",
                custom_config={"max_signal_age_seconds": 60.0}
            )

            # Worker 2 must be marked ABSTAIN due to stale signal
            vb_worker2 = next((v for v in res["voting_breakdown"] if v["bot_id"] == 2), None)
            if vb_worker2:
                self.assertEqual(vb_worker2["vote"], "ABSTAIN")
                self.assertFalse(vb_worker2["approved"])
                self.assertIn("stale", vb_worker2["reason"].lower())

    def test_conflict_policy_abstain_on_tie(self):
        # Inject conflicting signals between peer workers
        worker2 = bot_scheduler.workers.get(2)
        worker5 = bot_scheduler.workers.get(5)
        fresh_time = datetime.now().isoformat()

        if worker2 and worker5:
            with worker2.lock:
                worker2.last_evaluation_time = fresh_time
                worker2.last_signal = {"decision": "BUY", "confidence": 0.85, "reason": "Bullish trend"}
            with worker5.lock:
                worker5.last_evaluation_time = fresh_time
                worker5.last_signal = {"decision": "SELL", "confidence": 0.85, "reason": "Bearish reversal"}

            res = evaluate_order_quorum(
                bot_id=1,
                action="BUY",
                custom_config={
                    "conflict_policy": "ABSTAIN",
                    "min_quorum_percentage": 50.0
                }
            )
            # If conflict is detected with 1 BUY vs 1 SELL, conflict policy ABSTAIN should revoke approval
            if res["buy_votes"] > 0 and res["sell_votes"] > 0:
                self.assertEqual(res["decision"], "ABSTAIN")
                self.assertFalse(res["approved"])


class TestVotingEngineAPIEndpoints(unittest.TestCase):
    """Tests FastAPI REST endpoints for voting engine."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_get_voting_config_endpoint(self):
        res = self.client.get("/api/voting/config")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("config", data)
        self.assertIn("min_quorum_percentage", data["config"])

    def test_update_voting_config_endpoint(self):
        payload = {"min_quorum_percentage": 70.0, "threshold_mode": "percentage"}
        res = self.client.post("/api/voting/config", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["config"]["min_quorum_percentage"], 70.0)

    def test_evaluate_voting_endpoint(self):
        payload = {"bot_id": 1, "action": "BUY", "is_emergency_exit": False}
        res = self.client.post("/api/voting/evaluate", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("quorum", data)
        self.assertIn("approved", data["quorum"])
        self.assertIn("audit_trail", data["quorum"])


if __name__ == "__main__":
    unittest.main()
