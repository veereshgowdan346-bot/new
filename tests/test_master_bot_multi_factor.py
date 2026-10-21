"""
CHINTU AI TRADING SYSTEM - Smart Master Bot Multi-Factor Test Suite (Phase 4)
Deterministic tests for multi-factor ranking, configurable score weights,
switching cooldown, hysteresis threshold deltas, and NO_TRADE qualification outcomes.
"""

import unittest
import os
import sys
from datetime import datetime

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from starlette.testclient import TestClient

from server.highest_profit_bot import (
    evaluate_master_bot_multi_factor,
    switch_active_instrument,
    reassess_and_switch_master_bot,
    get_master_bot_status,
    get_master_bot_config,
    update_master_bot_config,
    master_bot_state,
    DEFAULT_MASTER_BOT_CONFIG
)
from server.python_stream_server import app


class TestSmartMasterBotMultiFactor(unittest.TestCase):
    """Tests Smart Master Bot multi-factor evaluation and safe switching."""

    def setUp(self):
        update_master_bot_config(DEFAULT_MASTER_BOT_CONFIG)
        master_bot_state["active_bot_id"] = 1
        master_bot_state["last_switch_time"] = None
        master_bot_state["switch_history"] = []

    def test_configurable_score_weights_persistence(self):
        cfg = get_master_bot_config()
        self.assertEqual(cfg["version"], "2.1.0")
        self.assertEqual(cfg["switching_cooldown_seconds"], 300.0)
        self.assertEqual(cfg["switching_threshold_delta"], 5.0)

        updated = update_master_bot_config({
            "switching_cooldown_seconds": 180.0,
            "switching_threshold_delta": 8.0,
            "min_qualification_score": 25.0
        })
        self.assertEqual(updated["switching_cooldown_seconds"], 180.0)
        self.assertEqual(updated["switching_threshold_delta"], 8.0)
        self.assertEqual(updated["min_qualification_score"], 25.0)

        saved = get_master_bot_config()
        self.assertEqual(saved["switching_cooldown_seconds"], 180.0)
        self.assertEqual(saved["switching_threshold_delta"], 8.0)

    def test_multi_factor_evaluation_structure(self):
        res = evaluate_master_bot_multi_factor()
        self.assertEqual(res["status"], "SUCCESS")
        self.assertIn("qualification_status", res)
        self.assertEqual(res["scoring_version"], "2.1.0")
        self.assertEqual(res["total_instruments_evaluated"], 14)
        self.assertEqual(res["total_eligible"], 11)
        self.assertIsNotNone(res["evaluated_at"])

        # Check factors structure on first instrument
        inst = res["instruments"][0]
        self.assertIn("factors", inst)
        self.assertIn("trend", inst["factors"])
        self.assertIn("volatility", inst["factors"])
        self.assertIn("liquidity", inst["factors"])
        self.assertIn("risk_reward", inst["factors"])
        self.assertIn("cost_drag", inst["factors"])
        self.assertIn("drawdown", inst["factors"])

    def test_no_trade_outcome_when_threshold_unmet(self):
        # Set an impossibly high min qualification score (e.g. 99.0)
        update_master_bot_config({"min_qualification_score": 99.0})
        res = evaluate_master_bot_multi_factor()
        self.assertEqual(res["qualification_status"], "NO_TRADE")
        self.assertIn("minimum qualification score threshold", res["reason"])

    def test_switching_cooldown_enforcement(self):
        # Perform initial switch
        res1 = switch_active_instrument(new_bot_id=2, reason="First switch", enforce_cooldown=False)
        self.assertTrue(res1["success"])

        # Attempt immediate second switch with enforce_cooldown=True
        res2 = switch_active_instrument(new_bot_id=3, reason="Rapid switch", enforce_cooldown=True)
        self.assertFalse(res2["success"])
        self.assertEqual(res2["status"], "COOLDOWN_ACTIVE")
        self.assertIn("remaining_cooldown_seconds", res2)
        self.assertGreater(res2["remaining_cooldown_seconds"], 0.0)

    def test_switching_threshold_delta_enforcement(self):
        # Candidate score must beat active score by at least +5.0 points
        res = switch_active_instrument(
            new_bot_id=2,
            reason="Low delta switch",
            enforce_cooldown=True,
            candidate_score=42.0,
            current_score=40.0  # Delta is only +2.0, required is +5.0
        )
        self.assertFalse(res["success"])
        self.assertEqual(res["status"], "THRESHOLD_DELTA_UNMET")
        self.assertIn("required threshold", res["error"])

    def test_reassess_and_switch_master_bot(self):
        reassess = reassess_and_switch_master_bot(enforce_cooldown=False)
        self.assertIn("switched", reassess)
        self.assertIn("evaluation", reassess)

    def test_master_bot_status_reporting(self):
        st = get_master_bot_status()
        self.assertIn("active_bot_id", st)
        self.assertIn("active_bot_name", st)
        self.assertIn("total_switches", st)
        self.assertIn("cooldown_active", st)
        self.assertIn("config", st)


class TestMasterBotAPIEndpoints(unittest.TestCase):
    """Tests FastAPI REST endpoints for Smart Master Bot."""

    AUTH_HEADERS = {"Authorization": "Bearer chintu_master_auth_permanent_veeresh"}

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_get_master_bot_config_endpoint(self):
        res = self.client.get("/api/master-bot/config")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("config", data)
        self.assertEqual(data["config"]["version"], "2.1.0")

    def test_update_master_bot_config_endpoint(self):
        payload = {"switching_cooldown_seconds": 240.0}
        res = self.client.post("/api/master-bot/config", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["config"]["switching_cooldown_seconds"], 240.0)

    def test_master_bot_endpoints_require_auth(self):
        # Without headers should return 401
        res = self.client.get("/api/master-bot/evaluation")
        self.assertEqual(res.status_code, 401)
        res_status = self.client.get("/api/master-bot/status")
        self.assertEqual(res_status.status_code, 401)

    def test_get_master_bot_evaluation_endpoint(self):
        res = self.client.get("/api/master-bot/evaluation", headers=self.AUTH_HEADERS)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "SUCCESS")
        self.assertEqual(data["total_instruments_evaluated"], 14)
        self.assertEqual(data["scoring_version"], "2.1.0")

    def test_get_master_bot_status_endpoint(self):
        res = self.client.get("/api/master-bot/status", headers=self.AUTH_HEADERS)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("active_bot_id", data)
        self.assertIn("cooldown_active", data)

    def test_post_master_bot_switch_endpoint(self):
        payload = {
            "new_bot_id": 2,
            "reason": "API Multi-factor rotation test",
            "enforce_cooldown": False
        }
        res = self.client.post("/api/master-bot/switch", json=payload, headers=self.AUTH_HEADERS)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success", False))


if __name__ == "__main__":
    unittest.main()
