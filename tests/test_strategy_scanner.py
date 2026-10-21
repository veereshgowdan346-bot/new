"""
CHINTU AI TRADING SYSTEM - Strategy Scanner & Sybil Quorum Detection Test Suite
Verifies data dependency analysis, look-ahead detection, transaction drag sensitivity,
correlation clustering, and anti-sybil voting quorum alerts.
"""

import pytest
import time
import server.memory_db as memory_db
from server.strategy_scanner import StrategyScannerService


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    memory_db.init_db()


class TestStrategyScanner:
    """Tests the quantitative strategy scanner service."""

    def test_scan_all_canonical_strategies(self):
        """Verifies scanning all 14 canonical strategies in the library."""
        report = StrategyScannerService.scan_all_strategies()
        assert report["status"] == "success"
        assert report["total_strategies"] >= 14
        assert report["summary"]["healthy"] >= 10
        # Bot 12/13/14 have specialized data dependency warnings
        assert report["summary"]["warning"] >= 3

        # Check bot compatibility matrix
        matrix = report["bot_compatibility_matrix"]
        assert len(matrix) == 14
        for b_id in range(1, 15):
            assert b_id in matrix
            assert isinstance(matrix[b_id], list)

    def test_scan_strategy_friction_drag_analysis(self):
        """Verifies transaction drag calculation under Indian regulatory cost model."""
        strat = {
            "id": "strat_test_drag",
            "name": "Micro Scalp 1m",
            "timeframe": "1m",
            "category": "Scalper",
            "stop_loss_pct": 0.10,
            "target_pct": 0.15,  # very narrow target: friction drag will eat significant portion
            "indicators": ["SuperTrend"]
        }
        res = StrategyScannerService.scan_strategy(strat)
        metrics = res["friction_metrics"]
        assert metrics["estimated_drag_pct"] > 0.0
        assert metrics["friction_ratio_pct"] > 25.0
        assert any(w["type"] == "TRANSACTION_DRAG" for w in res["warnings"])

    def test_sybil_quorum_inflation_detection(self):
        """
        Verifies that when two structurally identical strategies are allocated to
        voting bots, a Sybil Quorum Inflation warning is generated.
        """
        ts = int(time.time() * 1000)
        s1_id = f"strat_clone_a_{ts}"
        s2_id = f"strat_clone_b_{ts}"

        # Create two identical strategies
        memory_db.create_strategy({
            "id": s1_id,
            "name": "Sybil Test Strategy A",
            "category": "Momentum Scalper",
            "timeframe": "1m",
            "indicators": ["SuperTrend", "MACD"],
            "supported_instruments": ["NIFTY 50"],
            "status": "Approved"
        })
        memory_db.create_strategy({
            "id": s2_id,
            "name": "Sybil Test Strategy B",
            "category": "Momentum Scalper",
            "timeframe": "1m",
            "indicators": ["SuperTrend", "MACD"],
            "supported_instruments": ["NIFTY 50"],
            "status": "Approved"
        })

        # Allocate both to Bot 8 and Bot 9
        memory_db.publish_strategy_to_bots(s1_id, "v1.0.0", [8])
        memory_db.publish_strategy_to_bots(s2_id, "v1.0.0", [9])

        # Run scanner
        report = StrategyScannerService.scan_all_strategies()

        # Should detect correlation cluster and Sybil risk between s1 and s2
        sybil_found = any(
            s1_id in r.get("strategy_ids", []) and s2_id in r.get("strategy_ids", [])
            for r in report["sybil_quorum_risks"]
        )
        assert sybil_found is True

        # Clean up: revert Bot 8 and 9 back to canonical
        memory_db.publish_strategy_to_bots("strat_canonical_8", "v1.0.0", [8])
        memory_db.publish_strategy_to_bots("strat_canonical_9", "v1.0.0", [9])

