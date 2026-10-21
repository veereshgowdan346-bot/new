"""
TRADING JARVIS WORKSTATION — STEP 6 TEST SUITE
Bot Strategy Engine & Master Brain Coordination — Safety-First Verification

Covers:
  1. BotScheduler -> CentralizedExecutionEngine Single-Gateway Integration
  2. Bypassing Prevention: All bot orders pass through Gates 0-6 (RMS, Idempotency, Quorum, Session)
  3. Quarantined Bot Entry Blocking & Emergency Exit Bypass
  4. Emergency Exits strictly exposure-reducing
  5. Master Brain 14-Bot Fleet Discovery, Signal Normalization & Validation
  6. Market Regime Multiplier Calibration (Trending vs Sideways)
  7. Empirical Performance Multiplier Feedback from Bot Performance Memory
  8. Realistic Net Profit Gate with Statutory Charges, Spread & Slippage
  9. Master Brain Execution Bridge (execute_consensus_decision)
  10. Fast-API Master Brain REST Endpoints (/api/master-brain/decision, /api/master-brain/execute)
  11. Strict PAPER Mode Broker Order Placement Mock Isolation (SmartConnect.placeOrder never called)
  12. Bit-for-Bit SQLite Production Database Immutability
"""

import os
import sys
import time
import shutil
import tempfile
import unittest
import hashlib
from datetime import datetime
from typing import Dict, Any, List
from unittest.mock import MagicMock, patch

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server import memory_db
from server.bot_registry import (
    CANONICAL_BOT_REGISTRY,
    get_all_canonical_bots,
    get_bot_by_id
)
from server.bot_scheduler import (
    BotScheduler,
    BotWorker,
    CandleBuffer,
    bot_scheduler
)
from server.master_brain import (
    MasterBrain,
    master_brain,
    ACTION_BUY,
    ACTION_SELL,
    ACTION_HOLD,
    ACTION_NO_TRADE
)
from server.execution_engine import (
    CentralizedExecutionEngine,
    execution_engine,
    ORDER_STATE_CREATED,
    ORDER_STATE_FILLED,
    ORDER_STATE_REJECTED
)
from server.centralized_risk_manager import centralized_risk_manager


class BaseStep6TestCase(unittest.TestCase):
    """
    Base test fixture providing isolated SQLite database copy to ensure
    production database (server/chintu_memory.db) is never modified.
    """
    @classmethod
    def setUpClass(cls):
        cls.real_db_path = os.path.join(PROJECT_ROOT, "server", "chintu_memory.db")
        cls.temp_dir = tempfile.mkdtemp(prefix="chintu_step6_test_")
        cls.temp_db_path = os.path.join(cls.temp_dir, "test_chintu_memory.db")
        shutil.copy2(cls.real_db_path, cls.temp_db_path)
        cls.orig_db_path = memory_db.DB_PATH
        memory_db.DB_PATH = cls.temp_db_path

    @classmethod
    def tearDownClass(cls):
        memory_db.DB_PATH = cls.orig_db_path
        shutil.rmtree(cls.temp_dir, ignore_errors=True)

    def setUp(self):
        # Reset engine and risk manager state
        self.engine = CentralizedExecutionEngine()
        self.engine.enforce_market_hours = False
        execution_engine.enforce_market_hours = False
        execution_engine.clear_idempotency_cache()
        centralized_risk_manager.config["circuit_breaker_active"] = False
        centralized_risk_manager.config["emergency_stop_active"] = False
        centralized_risk_manager.quarantined_bots.clear()
        try:
            memory_db.close_position("RELIANCE")
            memory_db.close_position("INFY")
        except Exception:
            pass


# =====================================================================
# 1. BOT SCHEDULER -> CENTRALIZED EXECUTION ENGINE INTEGRATION
# =====================================================================

class TestBotSchedulerExecutionEngineIntegration(BaseStep6TestCase):
    """Verifies that all 14 bot workers route orders through CentralizedExecutionEngine."""

    def test_bot_scheduler_executes_paper_order_via_centralized_execution_engine(self):
        """Proves BotWorker._execute_paper_order invokes CentralizedExecutionEngine and fills paper order."""
        worker = BotWorker(bot_id=1)
        signal = {
            "decision": "BUY",
            "entry_price": 2900.0,
            "strategy_id": "EMA_TREND",
            "reason": "Golden Cross Alignment"
        }

        res = worker._execute_paper_order(signal, bar_timestamp=datetime.now().isoformat())
        self.assertTrue(res["success"], f"Order execution failed: {res}")
        self.assertEqual(res["status"], "COMPLETE")
        self.assertTrue(worker.paper_execution_verified)
        self.assertEqual(worker.current_position, "LONG")
        self.assertIn("execution_engine_result", res)

        # Verify order in orders_memory
        order = memory_db.get_order(res["order_id"])
        self.assertIsNotNone(order)
        self.assertEqual(order["status"], ORDER_STATE_FILLED)
        self.assertEqual(order["mode"], "PAPER")

    def test_bot_scheduler_order_blocked_by_circuit_breaker_persists_rejection(self):
        """Proves circuit breaker trips Gate 4 and persists REJECTED order in orders_memory."""
        centralized_risk_manager.config["circuit_breaker_active"] = True
        worker = BotWorker(bot_id=2)
        signal = {
            "decision": "BUY",
            "entry_price": 520.0,
            "strategy_id": "MOMENTUM_PULLBACK",
            "reason": "Test"
        }

        res = worker._execute_paper_order(signal, bar_timestamp=None)
        self.assertFalse(res["success"])
        self.assertEqual(res["status"], "REJECTED")
        self.assertIn("Circuit Breaker is TRIPPED", res["error"])

        # Verify rejection persisted
        rej_order = memory_db.get_order(res["order_id"])
        self.assertIsNotNone(rej_order)
        self.assertEqual(rej_order["status"], "REJECTED")

    def test_bot_scheduler_duplicate_order_idempotency_rejected(self):
        """Proves repeated identical orders within idempotency window are rejected by Gate 0."""
        worker = BotWorker(bot_id=3)
        signal = {
            "decision": "BUY",
            "entry_price": 1500.0,
            "strategy_id": "MEAN_REVERSION",
            "reason": "Oversold"
        }

        # Clear any existing positions
        memory_db.close_position("INFY")
        memory_db.close_position(worker.config.get("asset", "RELIANCE"))

        res1 = worker._execute_paper_order(signal, bar_timestamp=None)
        self.assertTrue(res1["success"])

        # Immediate replay within idempotency window
        res2 = worker._execute_paper_order(signal, bar_timestamp=None)
        self.assertFalse(res2["success"])
        self.assertEqual(res2["status"], "REJECTED")
        self.assertIn("Duplicate order detected", res2["error"])

    def test_bot_scheduler_emergency_exit_bypasses_quorum_and_closes_position(self):
        """Proves EXIT orders bypass quorum and reduce/close positions safely."""
        worker = BotWorker(bot_id=1)

        # Open initial position
        open_signal = {"decision": "BUY", "entry_price": 2900.0, "strategy_id": "EMA_TREND", "reason": "Entry"}
        res_open = worker._execute_paper_order(open_signal, bar_timestamp=None)
        self.assertTrue(res_open["success"])

        # Exit signal
        exit_signal = {"decision": "EXIT", "entry_price": 2950.0, "strategy_id": "EMA_TREND", "reason": "Stop Target"}
        res_exit = worker._execute_paper_order(exit_signal, bar_timestamp=None)
        self.assertTrue(res_exit["success"])
        self.assertIsNone(worker.current_position)

    def test_bot_scheduler_quarantined_bot_cannot_enter(self):
        """Proves quarantined bots are blocked from entering new orders."""
        centralized_risk_manager.quarantined_bots[4] = {"reason": "3 Consecutive Losses", "timestamp": time.time()}
        worker = BotWorker(bot_id=4)
        signal = {"decision": "BUY", "entry_price": 100.0, "strategy_id": "BREAKOUT", "reason": "Breakout"}

        res = worker._execute_paper_order(signal, bar_timestamp=None)
        self.assertFalse(res["success"])
        self.assertEqual(res["status"], "REJECTED")
        self.assertIn("QUARANTINED", res["error"])


# =====================================================================
# 2. MASTER BRAIN FLEET DISCOVERY & SIGNAL NORMALIZATION
# =====================================================================

class TestMasterBrainFleetCoordination(BaseStep6TestCase):
    """Verifies Master Brain orchestration across all 14 canonical bots."""

    def test_fleet_discovery_discovers_all_14_canonical_bots(self):
        bots = get_all_canonical_bots()
        self.assertEqual(len(bots), 14)
        for b_id in range(1, 15):
            meta = get_bot_by_id(b_id)
            self.assertIsNotNone(meta)
            self.assertIn("name", meta)
            self.assertIn("asset", meta)
            self.assertIn("segment", meta)

    def test_signal_normalization_and_validation(self):
        mb = MasterBrain()
        # Valid normalization
        norm = mb.normalize_signal(
            bot_id=1,
            symbol="RELIANCE",
            action="BUY",
            confidence=0.85,
            entry=2900.0,
            stop_loss=2850.0,
            target=3000.0,
            risk_estimate=0.15,
            reason="Trend confirmation"
        )
        self.assertEqual(norm["bot_id"], 1)
        self.assertEqual(norm["action"], "BUY")
        self.assertEqual(norm["confidence"], 0.85)

        valid, reason = mb.validate_signal(norm)
        self.assertTrue(valid)

        # Invalid bot_id
        invalid_bot = dict(norm, bot_id=99)
        valid2, reason2 = mb.validate_signal(invalid_bot)
        self.assertFalse(valid2)
        self.assertIn("canonical registry", reason2)

    def test_market_regime_weighting_multipliers(self):
        """Proves trending regime boosts trend-following bots and reduces mean-reversion bots."""
        mb = MasterBrain()
        sig_trend = mb.normalize_signal(1, "RELIANCE", "BUY", 0.70, 2900.0, 2850.0, 3000.0)
        sig_meanrev = mb.normalize_signal(3, "INFY", "BUY", 0.70, 1500.0, 1480.0, 1540.0)

        # Trending Bull regime
        dec_trend = mb.evaluate_fleet_consensus("RELIANCE", [sig_trend, sig_meanrev], market_regime="TRENDING_BULL")
        contribs = {c["bot_id"]: c["effective_weight"] for c in dec_trend["contributing_bots"]}
        # Bot 1 (Trend) gets 1.25x boost; Bot 3 (Mean Reversion) gets 0.80x penalty
        self.assertGreater(contribs[1], contribs[3])

    def test_empirical_performance_multiplier_integration(self):
        """Proves bots with high verified win rate and positive PnL receive weight boost."""
        mb = MasterBrain()
        # Update Bot 1 performance to >60% win rate
        memory_db.update_bot_performance(1, {"win_rate": 0.75, "pnl": 5000.0})
        # Update Bot 2 performance to <40% win rate and negative PnL
        memory_db.update_bot_performance(2, {"win_rate": 0.30, "pnl": -2500.0})

        sig1 = mb.normalize_signal(1, "NIFTY 50", "BUY", 0.70, 24500.0, 24400.0, 24700.0)
        sig2 = mb.normalize_signal(2, "NIFTY 50", "BUY", 0.70, 24500.0, 24400.0, 24700.0)

        dec = mb.evaluate_fleet_consensus("NIFTY 50", [sig1, sig2], market_regime="NEUTRAL")
        contribs = {c["bot_id"]: c["effective_weight"] for c in dec["contributing_bots"]}
        self.assertGreater(contribs[1], contribs[2])

    def test_realistic_net_profit_statutory_charges_and_slippage(self):
        """Proves statutory charges, spread, and slippage are deducted from gross reward."""
        mb = MasterBrain()
        analysis = mb.calculate_realistic_net_profit(
            symbol="RELIANCE",
            action="BUY",
            entry=2900.0,
            target=2950.0,
            stop_loss=2875.0,
            qty=10,
            segment="NSE Equity"
        )
        self.assertGreater(analysis["statutory_fees"], 0.0)
        self.assertGreater(analysis["slippage_cost"], 0.0)
        self.assertGreater(analysis["spread_cost"], 0.0)
        self.assertLess(analysis["net_reward"], analysis["gross_reward"])

    def test_unprofitable_or_sub_rr_decision_fails_closed(self):
        """Signals with insufficient reward-to-risk (<1.2) fail closed with NO_TRADE."""
        mb = MasterBrain()
        # Tiny target: target only 1 rupee above entry (gross ₹10), but friction > ₹10
        sig_tiny = mb.normalize_signal(1, "RELIANCE", "BUY", 0.90, 2900.0, 2800.0, 2901.0)
        dec = mb.evaluate_fleet_consensus("RELIANCE", [sig_tiny])
        self.assertEqual(dec["decision"], ACTION_NO_TRADE)
        self.assertIn("Net profit edge check failed", dec["decision_reason"])

    def test_low_conviction_consensus_fails_closed(self):
        """Signals below min_confidence_threshold or min_quorum_score fail closed as NO_TRADE."""
        mb = MasterBrain()
        # Low confidence signal (0.35 < 0.55 threshold)
        sig_low = mb.normalize_signal(1, "RELIANCE", "BUY", 0.35, 2900.0, 2800.0, 3100.0)
        dec = mb.evaluate_fleet_consensus("RELIANCE", [sig_low])
        self.assertEqual(dec["decision"], ACTION_NO_TRADE)
        self.assertEqual(len(dec["rejected_signals"]), 1)
        self.assertIn("confidence", dec["rejected_signals"][0]["reason"])

    def test_empirical_performance_multiplier_minimum_sample_size(self):
        """Bots with fewer than 5 trades do not receive multiplier boost, preventing small-sample noise."""
        mb = MasterBrain()
        # Bot 4 has high win rate but only 2 trades (small sample)
        memory_db.update_bot_performance(4, {"win_rate": 100.0, "pnl": 500.0, "total_trades": 2})
        sig = mb.normalize_signal(4, "RELIANCE", "BUY", 0.70, 2900.0, 2800.0, 3100.0)
        dec = mb.evaluate_fleet_consensus("RELIANCE", [sig], market_regime="NEUTRAL")
        contrib = dec["contributing_bots"][0]
        # Base weight is 1.0, confidence 0.7, risk penalty ~0.88 -> without 1.15x boost, effective weight < 0.70
        # If 1.15x had been applied, effective_weight would be ~0.7084. With 1.0x, effective_weight is ~0.616
        self.assertLess(contrib["effective_weight"], 0.65)


# =====================================================================
# 3. MASTER BRAIN EXECUTION BRIDGE
# =====================================================================

class TestMasterBrainExecutionBridge(BaseStep6TestCase):
    """Verifies that Master Brain executes approved consensus decisions strictly via CentralizedExecutionEngine."""

    def test_execute_consensus_decision_success_in_paper_mode(self):
        mb = MasterBrain()
        # Craft winning decision
        decision = {
            "decision": "BUY",
            "symbol": "RELIANCE",
            "consensus_score": 0.85,
            "market_regime": "TRENDING_BULL",
            "contributing_bots": [
                {"bot_id": 1, "bot_name": "Test Scalper", "action": "BUY", "effective_weight": 1.25, "entry": 2900.0}
            ],
            "profit_analysis": {
                "is_profitable": True,
                "net_reward": 500.0,
                "net_risk": 200.0,
                "net_reward_to_risk": 2.5
            },
            "decision_reason": "High confidence trend consensus"
        }

        # Clear existing position
        memory_db.close_position("RELIANCE")

        res = mb.execute_consensus_decision(decision, execution_mode="PAPER")
        self.assertTrue(res["success"], f"Execution bridge failed: {res}")
        self.assertEqual(res["status"], ORDER_STATE_FILLED)
        self.assertEqual(res["action"], "BUY")
        self.assertIn("execution_engine_result", res)

    def test_execute_consensus_decision_rejects_no_trade(self):
        mb = MasterBrain()
        decision = {
            "decision": "NO_TRADE",
            "symbol": "RELIANCE",
            "decision_reason": "Fleet divided"
        }
        res = mb.execute_consensus_decision(decision, execution_mode="PAPER")
        self.assertFalse(res["success"])
        self.assertEqual(res["status"], "REJECTED")
        self.assertIn("not executable", res["error"])

    def test_execute_consensus_decision_rejects_unprofitable_decision(self):
        mb = MasterBrain()
        decision = {
            "decision": "BUY",
            "symbol": "RELIANCE",
            "profit_analysis": {"is_profitable": False},
            "decision_reason": "Net edge negative"
        }
        res = mb.execute_consensus_decision(decision, execution_mode="PAPER")
        self.assertFalse(res["success"])
        self.assertIn("Net profit edge gate not satisfied", res["error"])

    def test_execute_consensus_decision_quarantined_bot_rejected(self):
        """Proves if the chosen contributing bot is quarantined, Gate 4 rejects the order."""
        centralized_risk_manager.quarantined_bots[1] = {"reason": "Consecutive Loss Quarantine", "timestamp": time.time()}
        mb = MasterBrain()
        decision = {
            "decision": "BUY",
            "symbol": "RELIANCE",
            "profit_analysis": {"is_profitable": True},
            "contributing_bots": [{"bot_id": 1, "bot_name": "Nifty Trend Master", "action": "BUY", "effective_weight": 1.5, "entry": 2900.0}],
            "decision_reason": "High consensus"
        }
        res = mb.execute_consensus_decision(decision, execution_mode="PAPER")
        self.assertFalse(res["success"])
        self.assertEqual(res["status"], ORDER_STATE_REJECTED)
        self.assertIn("QUARANTINED", res["execution_engine_result"]["error"])

    def test_execute_consensus_decision_circuit_breaker_rejected(self):
        """Proves if RMS circuit breaker is tripped, consensus entry is rejected."""
        centralized_risk_manager.config["circuit_breaker_active"] = True
        mb = MasterBrain()
        decision = {
            "decision": "BUY",
            "symbol": "RELIANCE",
            "profit_analysis": {"is_profitable": True},
            "contributing_bots": [{"bot_id": 1, "bot_name": "Nifty Trend Master", "action": "BUY", "effective_weight": 1.5, "entry": 2900.0}],
            "decision_reason": "High consensus"
        }
        res = mb.execute_consensus_decision(decision, execution_mode="PAPER")
        self.assertFalse(res["success"])
        self.assertEqual(res["status"], ORDER_STATE_REJECTED)
        self.assertIn("Circuit Breaker is ACTIVE / TRIPPED", res["execution_engine_result"]["error"])

    def test_execute_consensus_decision_duplicate_idempotency_rejected(self):
        """Proves duplicate client_order_id is rejected by Gate 0 idempotency."""
        mb = MasterBrain()
        decision = {
            "decision": "BUY",
            "symbol": "RELIANCE",
            "profit_analysis": {"is_profitable": True},
            "contributing_bots": [{"bot_id": 1, "bot_name": "Nifty Trend Master", "action": "BUY", "effective_weight": 1.5, "entry": 2900.0}],
            "decision_reason": "High consensus"
        }
        cid = f"TEST-MB-IDEMP-{int(time.time()*1000)}"
        memory_db.close_position("RELIANCE")

        res1 = mb.execute_consensus_decision(decision, execution_mode="PAPER", client_order_id=cid)
        self.assertTrue(res1["success"])

        # Second submission with same client_order_id within window
        res2 = mb.execute_consensus_decision(decision, execution_mode="PAPER", client_order_id=cid)
        self.assertFalse(res2["success"])
        self.assertEqual(res2["status"], ORDER_STATE_REJECTED)
        self.assertIn("Duplicate order detected", res2["execution_engine_result"]["error"])

    def test_execute_consensus_decision_max_positions_limit_rejected(self):
        """Proves Gate 5 blocks new consensus entry when max open positions limit is reached."""
        mb = MasterBrain()
        decision = {
            "decision": "BUY",
            "symbol": "NEW_ASSET",
            "profit_analysis": {"is_profitable": True},
            "contributing_bots": [{"bot_id": 1, "bot_name": "Nifty Trend Master", "action": "BUY", "effective_weight": 1.5, "entry": 100.0}],
            "decision_reason": "High consensus"
        }

        # Set max_open_positions to 0 to simulate full position book
        orig_max = execution_engine.max_open_positions
        execution_engine.max_open_positions = 0
        centralized_risk_manager.config["max_open_positions"] = 0
        try:
            res = mb.execute_consensus_decision(decision, execution_mode="PAPER")
            self.assertFalse(res["success"])
            self.assertEqual(res["status"], ORDER_STATE_REJECTED)
            self.assertIn("Max concurrent open positions", res["execution_engine_result"]["error"])
        finally:
            execution_engine.max_open_positions = orig_max
            centralized_risk_manager.config["max_open_positions"] = orig_max


# =====================================================================
# 4. FASTAPI MASTER BRAIN REST API ENDPOINTS
# =====================================================================

class TestPythonStreamServerMasterBrainAPI(BaseStep6TestCase):
    """Verifies FastAPI Master Brain REST endpoints."""

    def test_master_brain_decision_api_live_candle_lookup(self):
        from fastapi.testclient import TestClient
        from server.python_stream_server import app
        client = TestClient(app)
        auth_headers = {"Authorization": "Bearer chintu_master_auth_permanent_veeresh"}

        # Feed 35 live candles into Bot 1 worker
        worker = bot_scheduler.workers[1]
        for i in range(35):
            worker.candles.append({
                "open": 24500.0,
                "high": 24520.0,
                "low": 24480.0,
                "close": 24510.0 + (i * 2.0),
                "volume": 50000.0,
                "timestamp": datetime.now().isoformat()
            })

        response = client.post("/api/master-brain/decision", json={"symbol": "NIFTY 50"}, headers=auth_headers)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("decision", data)
        self.assertIn("consensus_score", data["decision"])

    def test_master_brain_execute_api_in_paper_mode(self):
        from fastapi.testclient import TestClient
        from server.python_stream_server import app
        client = TestClient(app)
        auth_headers = {"Authorization": "Bearer chintu_master_auth_permanent_veeresh"}

        valid_decision = {
            "decision": "BUY",
            "symbol": "RELIANCE",
            "contributing_bots": [
                {"bot_id": 1, "bot_name": "Test Scalper", "action": "BUY", "effective_weight": 1.0, "entry": 2900.0}
            ],
            "profit_analysis": {"is_profitable": True, "net_reward": 300.0, "net_risk": 150.0, "net_reward_to_risk": 2.0},
            "decision_reason": "Approved by consensus"
        }

        memory_db.close_position("RELIANCE")

        response = client.post("/api/master-brain/execute", json={
            "decision": valid_decision,
            "execution_mode": "PAPER"
        }, headers=auth_headers)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertTrue(data["result"]["success"])

    def test_master_brain_execute_api_rejects_live_mode(self):
        from fastapi.testclient import TestClient
        from server.python_stream_server import app
        client = TestClient(app)
        auth_headers = {"Authorization": "Bearer chintu_master_auth_permanent_veeresh"}

        response = client.post("/api/master-brain/execute", json={
            "decision": {"decision": "BUY", "symbol": "RELIANCE"},
            "execution_mode": "LIVE"
        }, headers=auth_headers)
        self.assertEqual(response.status_code, 403)
        self.assertIn("Only PAPER mode is authorized", response.json()["detail"])

    def test_master_brain_execute_api_unauthorized_rejected(self):
        """Proves missing or invalid authentication token is rejected with 401 Unauthorized."""
        from fastapi.testclient import TestClient
        from server.python_stream_server import app
        client = TestClient(app)

        response = client.post("/api/master-brain/execute", json={
            "decision": {"decision": "BUY", "symbol": "RELIANCE"},
            "execution_mode": "PAPER"
        })
        self.assertEqual(response.status_code, 401)
        self.assertIn("Authentication required", response.json()["detail"])

    def test_master_brain_execute_api_duplicate_idempotency_rejected(self):
        """Proves duplicate client_order_id via API is rejected by Gate 0 idempotency."""
        from fastapi.testclient import TestClient
        from server.python_stream_server import app
        client = TestClient(app)
        auth_headers = {"Authorization": "Bearer chintu_master_auth_permanent_veeresh"}

        valid_decision = {
            "decision": "BUY",
            "symbol": "RELIANCE",
            "contributing_bots": [
                {"bot_id": 1, "bot_name": "Test Scalper", "action": "BUY", "effective_weight": 1.0, "entry": 2900.0}
            ],
            "profit_analysis": {"is_profitable": True, "net_reward": 300.0, "net_risk": 150.0, "net_reward_to_risk": 2.0},
            "decision_reason": "Approved by consensus"
        }
        cid = f"API-IDEMP-{int(time.time()*1000)}"
        memory_db.close_position("RELIANCE")

        # First call succeeds
        res1 = client.post("/api/master-brain/execute", json={
            "decision": valid_decision,
            "execution_mode": "PAPER",
            "client_order_id": cid
        }, headers=auth_headers)
        self.assertEqual(res1.status_code, 200)
        self.assertTrue(res1.json()["result"]["success"])

        # Second call with same client_order_id rejected by Gate 0
        res2 = client.post("/api/master-brain/execute", json={
            "decision": valid_decision,
            "execution_mode": "PAPER",
            "client_order_id": cid
        }, headers=auth_headers)
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.json()["status"], "rejected")
        self.assertFalse(res2.json()["result"]["success"])
        self.assertIn("Duplicate order detected", res2.json()["result"]["execution_engine_result"]["error"])


# =====================================================================
# 5. STRICT PAPER BROKER ISOLATION & DATABASE INTEGRITY
# =====================================================================

class TestStep6SafetyAndDatabaseImmutability(unittest.TestCase):
    """Verifies that no real broker orders are placed and production database is untouched."""

    def test_paper_mode_mock_broker_isolation(self):
        """Proves SmartConnect.placeOrder is NEVER called by bot workers or Master Brain."""
        from server.python_stream_server import active_smart_connect
        mock_smart = MagicMock()
        orig_inst = active_smart_connect.get("instance")
        active_smart_connect["instance"] = mock_smart
        try:
            # 1. Execute via BotWorker
            worker = BotWorker(bot_id=1)
            sig = {"decision": "BUY", "entry_price": 2900.0, "strategy_id": "EMA", "reason": "Test"}
            worker._execute_paper_order(sig, None)

            # 2. Execute via Master Brain
            mb = MasterBrain()
            dec = {
                "decision": "BUY",
                "symbol": "RELIANCE",
                "profit_analysis": {"is_profitable": True},
                "contributing_bots": [{"bot_id": 1, "action": "BUY", "effective_weight": 1.0, "entry": 2900.0}]
            }
            mb.execute_consensus_decision(dec, execution_mode="PAPER")

            # Assert mock broker was never touched
            mock_smart.placeOrder.assert_not_called()
            mock_smart.cancelOrder.assert_not_called()
            mock_smart.modifyOrder.assert_not_called()
        finally:
            active_smart_connect["instance"] = orig_inst

    def test_production_db_remains_unmodified_and_clean(self):
        """Verifies server/chintu_memory.db hash matches forensically verified baseline."""
        prod_db = os.path.join(PROJECT_ROOT, "server", "chintu_memory.db")
        self.assertTrue(os.path.exists(prod_db))

        with open(prod_db, "rb") as f:
            current_hash = hashlib.sha256(f.read()).hexdigest().upper()

        expected_hash = "53509588F78CA463B91FCD3DB379E550CF3B901FA2C8510D3E1E541B86B4CB53"
        self.assertEqual(
            current_hash,
            expected_hash,
            f"Production database hash changed unexpectedly! Expected {expected_hash}, got {current_hash}"
        )


if __name__ == "__main__":
    unittest.main()
