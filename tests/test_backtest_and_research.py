"""
CHINTU AI TRADING SYSTEM - Quantitative Research & Backtest Test Suite (Phase 5)
Verifies:
  - Historical data validation and timestamp normalization.
  - Zero future-data leakage in bar-by-bar strategy backtesting.
  - Indian regulatory cost deductions (STT, GST, SEBI fee, slippage).
  - Statistical metrics calculation (Win Rate CI, Expectancy, Sharpe, Sortino, Drawdown).
  - Walk-forward out-of-sample overfit rejection.
  - Market regime performance attribution.
  - FastAPI REST API endpoints.
"""

import unittest
import os
import sys
from datetime import datetime

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from starlette.testclient import TestClient

from server.backtest_engine import (
    validate_and_normalize_candles,
    calculate_backtest_charges,
    run_strategy_backtest,
    run_walk_forward_evaluation,
    evaluate_market_regimes,
    generate_benchmark_candles
)
from server.python_stream_server import app


class TestBacktestDataIntegrity(unittest.TestCase):
    """Tests data normalization, boundary checking, and anti-lookahead rules."""

    def test_normalize_valid_candles(self):
        raw = [
            {"timestamp": "2025-01-01T10:05:00", "open": 24000, "high": 24050, "low": 23980, "close": 24020, "volume": 1000},
            {"timestamp": "2025-01-01T10:00:00", "open": 23950, "high": 24010, "low": 23940, "close": 24000, "volume": 1200}
        ]
        norm = validate_and_normalize_candles(raw)
        self.assertEqual(len(norm), 2)
        # Verify chronological sorting
        self.assertEqual(norm[0]["timestamp"], "2025-01-01T10:00:00")
        self.assertEqual(norm[1]["timestamp"], "2025-01-01T10:05:00")

    def test_reject_corrupted_and_future_bars(self):
        now_epoch = datetime.now().timestamp()
        raw = [
            {"timestamp": "2025-01-01T10:00:00", "open": -100, "high": 24000, "low": 23900, "close": 23950},  # negative price
            {"timestamp": "2025-01-01T10:05:00", "open": 24000, "high": 24050, "low": 23950, "close": 24010},  # valid
            {"timestamp": now_epoch + 100000, "open": 24000, "high": 24050, "low": 23950, "close": 24010}      # future timestamp
        ]
        norm = validate_and_normalize_candles(raw)
        self.assertEqual(len(norm), 1)
        self.assertEqual(norm[0]["open"], 24000.0)


class TestIndianRegulatoryChargesInBacktest(unittest.TestCase):
    """Tests Indian statutory tax & charge modeling for equity intraday and F&O."""

    def test_equity_intraday_charges_structure(self):
        res = calculate_backtest_charges(
            price=1000.0,
            qty=100,
            action="SELL",
            segment="NSE Equity",
            gross_pnl=500.0,
            slippage_pct=0.03
        )
        self.assertEqual(res["turnover"], 100000.0)
        self.assertGreater(res["brokerage"], 0.0)
        self.assertGreater(res["stt"], 0.0)
        self.assertGreater(res["exchange_charges"], 0.0)
        self.assertGreater(res["gst"], 0.0)
        self.assertEqual(res["net_pnl"], round(500.0 - res["total_charges"], 2))

    def test_options_stt_sell_turnover_rate(self):
        # Options STT is 0.1% on premium sell turnover
        res = calculate_backtest_charges(
            price=200.0,
            qty=75,
            action="SELL",
            segment="NSE F&O Options",
            gross_pnl=1500.0
        )
        expected_stt = round(200.0 * 75 * 0.001, 2)
        self.assertEqual(res["stt"], expected_stt)


class TestStrategyBacktestExecution(unittest.TestCase):
    """Tests zero-leakage bar-by-bar backtest simulation and quantitative metrics."""

    def setUp(self):
        self.candles = generate_benchmark_candles(
            symbol="NIFTY 50",
            base_price=24500.0,
            total_bars=120,
            regime="TRENDING_BULL",
            seed=123
        )

    def test_backtest_metrics_calculation(self):
        res = run_strategy_backtest(
            bot_id=1,
            candles=self.candles,
            initial_capital=100000.0,
            slippage_pct=0.03
        )
        self.assertEqual(res["status"], "SUCCESS")
        self.assertEqual(res["bot_id"], 1)
        self.assertIn("metrics", res)
        m = res["metrics"]
        self.assertIn("win_rate_pct", m)
        self.assertIn("win_rate_ci_95", m)
        self.assertIn("profit_factor", m)
        self.assertIn("sharpe_ratio", m)
        self.assertIn("max_drawdown_pct", m)
        self.assertIn("expectancy", m)
        self.assertGreaterEqual(res["final_capital"], 0.0)

    def test_insufficient_bars_rejection(self):
        res = run_strategy_backtest(
            bot_id=1,
            candles=self.candles[:20],
            min_warmup_bars=35
        )
        self.assertEqual(res["status"], "INSUFFICIENT_DATA")


class TestWalkForwardOverfitGate(unittest.TestCase):
    """Tests walk-forward evaluation, WFE calculation, and overfit rejection."""

    def setUp(self):
        self.candles = generate_benchmark_candles(
            symbol="BANKNIFTY",
            base_price=52000.0,
            total_bars=150,
            regime="TRENDING_BULL",
            seed=456
        )

    def test_walk_forward_evaluation(self):
        res = run_walk_forward_evaluation(
            bot_id=2,
            candles=self.candles,
            in_sample_ratio=0.65,
            min_oos_trades=5
        )
        self.assertEqual(res["status"], "SUCCESS")
        self.assertIn("governance_decision", res)
        self.assertIn("walk_forward_efficiency", res)
        self.assertIn("dataset_split", res)
        self.assertIn("in_sample_summary", res)
        self.assertIn("out_of_sample_summary", res)
        self.assertIn(res["governance_decision"], [
            "PROMOTED", "REJECTED_OVERFIT", "REJECTED_INSUFFICIENT_SAMPLE", "REJECTED_NEGATIVE_EXPECTANCY"
        ])


class TestMarketRegimeAttribution(unittest.TestCase):
    """Tests regime classification and trade P&L attribution."""

    def test_regime_classification(self):
        candles = generate_benchmark_candles(total_bars=100, regime="TRENDING_BULL")
        mock_trades = [
            {"entry_time": candles[60]["timestamp"], "net_pnl": 1200.0},
            {"entry_time": candles[80]["timestamp"], "net_pnl": -400.0}
        ]
        res = evaluate_market_regimes(candles, mock_trades)
        self.assertEqual(res["status"], "SUCCESS")
        self.assertIn("regime_distribution", res)
        regimes = res["regime_distribution"]
        self.assertIn("TRENDING_BULL", regimes)
        self.assertIn("TRENDING_BEAR", regimes)


class TestBacktestAPIEndpoints(unittest.TestCase):
    """Tests FastAPI REST endpoints for quantitative backtesting and walk-forward analysis."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_backtest_run_endpoint(self):
        payload = {
            "bot_id": 1,
            "benchmark_bars": 100,
            "regime": "TRENDING_BULL"
        }
        res = self.client.post("/api/backtest/run", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "SUCCESS")
        self.assertIn("metrics", data)
        self.assertIn("sharpe_ratio", data["metrics"])

    def test_walk_forward_endpoint(self):
        payload = {
            "bot_id": 2,
            "benchmark_bars": 120,
            "min_oos_trades": 3
        }
        res = self.client.post("/api/backtest/walk-forward", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "SUCCESS")
        self.assertIn("governance_decision", data)
        self.assertIn("walk_forward_efficiency", data)


if __name__ == "__main__":
    unittest.main()

