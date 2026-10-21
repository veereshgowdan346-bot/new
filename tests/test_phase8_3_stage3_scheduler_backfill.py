"""
CHINTU AI TRADING SYSTEM - BotScheduler Historical Backfill Integration Test Suite (Phase 8.3 Stage 3)
Verifies:
  1. Cold start with valid mocked historical data establishing strategy readiness.
  2. Insufficient historical candles fail-closed blocking strategy evaluation.
  3. Backfill failure and authentication expiry fail-closed behavior.
  4. Mid-session reconnect gap detection and reconciliation.
  5. Weekends and market closures exclusion from missing candle calculations.
  6. Duplicate and out-of-order candle handling with strict chronological ascending sorting.
  7. Conflicting historical versus streaming candle data resolution.
  8. In-progress versus finalized candle handling.
  9. Bounded rate limiting and retry behavior.
  10. Idempotent repeated backfill.
  11. Strategy evaluation remains blocked until readiness is established (including expired instruments).
  12. Proof that broker order endpoints (placeOrder, modifyOrder, cancelOrder) are NEVER called.
  13. Safety Mandates: LIVE_TRADING_ELIGIBLE strictly False; chintu_memory.db bit-for-bit unchanged.
"""

import os
import sys
import time
import math
import hashlib
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server.bot_scheduler import BotScheduler, BotWorker, CandleBuffer
from server.market_data_backfill import HistoricalCandleBackfillAdapter, BackfillConfig, IST
from server.live_readiness_gate import is_live_trading_eligible


class TestPhase83Stage3SchedulerBackfill(unittest.TestCase):
    """Exhaustive unit test suite for BotScheduler historical backfill integration."""

    def setUp(self):
        self.fast_config = BackfillConfig(
            min_request_interval_seconds=0.0,
            max_retries=2,
            initial_backoff_seconds=0.01,
            backoff_multiplier=1.0,
            enable_jitter=False,
            clock_tolerance_seconds=60.0
        )
        self.adapter = HistoricalCandleBackfillAdapter(config=self.fast_config)
        self.scheduler = BotScheduler()
        self.scheduler.set_backfill_adapter(self.adapter)

    def _generate_valid_candles(self, count: int, interval_minutes: int = 15, base_price: float = 2500.0, start_dt: datetime = None) -> list:
        """Helper to generate count valid historical candle rows in SmartAPI format."""
        start = start_dt or (datetime.now(IST) - timedelta(minutes=count * interval_minutes))
        rows = []
        for i in range(count):
            dt = start + timedelta(minutes=i * interval_minutes)
            p = base_price + (i * 0.5)
            rows.append([
                dt.strftime("%Y-%m-%dT%H:%M:00+05:30"),
                round(p, 2),
                round(p + 5.0, 2),
                round(p - 3.0, 2),
                round(p + 2.0, 2),
                1000 + (i * 50)
            ])
        return rows

    # -------------------------------------------------------------------------
    # 1. Cold Start with Valid Mocked Historical Data
    # -------------------------------------------------------------------------
    def test_cold_start_with_valid_mocked_historical_data(self):
        """Tests cold start backfill populating buffer and establishing strategy readiness."""
        mock_client = MagicMock()
        # Bot 3 is RELIANCE-EQ, requiring 30 candles
        candles_raw = self._generate_valid_candles(count=35, interval_minutes=15)
        mock_client.getCandleData.return_value = {"status": True, "data": candles_raw}

        res = self.scheduler.backfill_bot(3, client=mock_client)

        self.assertTrue(res.success)
        self.assertEqual(res.status, "COMPLETED")
        self.assertEqual(res.candle_count, 35)

        worker = self.scheduler.workers[3]
        self.assertEqual(worker.backfill_status, "COMPLETED")
        self.assertTrue(worker.strategy_ready)
        self.assertTrue(worker.data_healthy)
        self.assertEqual(len(worker.candles), 35)
        self.assertIsNotNone(worker.backfill_last_success)

        status = worker.get_status()
        self.assertEqual(status["strategy_health"], "READY")
        self.assertEqual(status["backfill_status"], "COMPLETED")

    # -------------------------------------------------------------------------
    # 2. Insufficient Historical Candles
    # -------------------------------------------------------------------------
    def test_insufficient_historical_candles_blocks_strategy_readiness(self):
        """Tests that receiving fewer candles than min_candles_required blocks strategy readiness."""
        mock_client = MagicMock()
        # Bot 3 requires 30 candles; return only 12
        candles_raw = self._generate_valid_candles(count=12, interval_minutes=15)
        mock_client.getCandleData.return_value = {"status": True, "data": candles_raw}

        res = self.scheduler.backfill_bot(3, client=mock_client)

        self.assertTrue(res.success)
        worker = self.scheduler.workers[3]
        self.assertEqual(worker.backfill_status, "INSUFFICIENT_DATA")
        self.assertFalse(worker.strategy_ready)
        self.assertIn("Insufficient history", worker.backfill_diagnostic)

        # Strategy evaluation must fail-closed
        eval_res = worker.evaluate(execute_paper=False)
        self.assertEqual(eval_res["decision"], "NO_TRADE")
        self.assertEqual(eval_res["status"], "INSUFFICIENT_DATA")

    # -------------------------------------------------------------------------
    # 3. Backfill Failure and Authentication Expiry
    # -------------------------------------------------------------------------
    def test_backfill_failure_and_authentication_expiry(self):
        """Tests fail-closed behavior on broker authentication error (AG8001)."""
        mock_client = MagicMock()
        mock_client.getCandleData.return_value = {
            "status": False,
            "message": "Invalid Token",
            "errorcode": "AG8001",
            "data": None
        }

        res = self.scheduler.backfill_bot(3, client=mock_client)

        self.assertFalse(res.success)
        self.assertEqual(res.status, "AUTH_ERROR")

        worker = self.scheduler.workers[3]
        self.assertEqual(worker.backfill_status, "AUTH_ERROR")
        self.assertFalse(worker.strategy_ready)

        eval_res = worker.evaluate(execute_paper=False)
        self.assertEqual(eval_res["decision"], "NO_TRADE")

    # -------------------------------------------------------------------------
    # 4. Mid-Session Reconnect and Missing Intervals
    # -------------------------------------------------------------------------
    def test_mid_session_reconnect_and_missing_intervals(self):
        """Tests gap detection after a mid-session reconnect and backfilling the missing range."""
        worker = self.scheduler.workers[3]
        # Pre-seed buffer with 30 candles from 10 hours ago
        start_time = datetime.now(IST) - timedelta(hours=10)
        initial_candles = self._generate_valid_candles(count=30, interval_minutes=15, start_dt=start_time)
        worker.reconcile_candles([
            {"timestamp": c[0], "open": c[1], "high": c[2], "low": c[3], "close": c[4], "volume": c[5]}
            for c in initial_candles
        ])
        initial_len = len(worker.candles)
        self.assertEqual(initial_len, 30)

        # Reconnect: 5 missing candles arrived
        last_dt = datetime.fromisoformat(initial_candles[-1][0])
        missing_candles = self._generate_valid_candles(count=5, interval_minutes=15, start_dt=last_dt + timedelta(minutes=15))

        mock_client = MagicMock()
        mock_client.getCandleData.return_value = {"status": True, "data": missing_candles}

        res = worker.backfill_history(adapter=self.adapter, client=mock_client)
        self.assertTrue(res.success)
        # Buffer should now hold 35 candles
        self.assertEqual(len(worker.candles), 35)
        self.assertTrue(worker.strategy_ready)

    # -------------------------------------------------------------------------
    # 5. Weekends and Market Closures Excluded from Missing Candles
    # -------------------------------------------------------------------------
    def test_weekends_and_market_closures_exclude_missing_candles(self):
        """Tests that reconcile_gaps avoids triggering unnecessary queries during market closure."""
        mock_client = MagicMock()
        # Mock InstrumentAuditor to report market closed (e.g. Sunday)
        with patch("server.angel_feed_manager.InstrumentAuditor.get_market_session_state") as mock_session:
            mock_session.return_value = {"is_open": False, "status": "MARKET_CLOSED", "reason": "Weekend"}

            worker = self.scheduler.workers[3]
            # Seed worker with some candles
            candles_raw = self._generate_valid_candles(count=30, interval_minutes=15)
            worker.reconcile_candles([
                {"timestamp": c[0], "open": c[1], "high": c[2], "low": c[3], "close": c[4], "volume": c[5]}
                for c in candles_raw
            ])

            gap_results = self.scheduler.reconcile_gaps(client=mock_client)
            # Bot 3 should be None (no backfill triggered because market is closed)
            self.assertIsNone(gap_results.get(3))
            mock_client.getCandleData.assert_not_called()

    # -------------------------------------------------------------------------
    # 6. Duplicate and Out-of-Order Candles
    # -------------------------------------------------------------------------
    def test_duplicate_and_out_of_order_candles_reconciliation(self):
        """Tests that out-of-order candles are sorted ascending and duplicate timestamps deduplicated."""
        worker = self.scheduler.workers[3]

        c1 = {"timestamp": "2026-04-01T09:30:00+05:30", "open": 2500, "high": 2510, "low": 2490, "close": 2505, "volume": 100}
        c2 = {"timestamp": "2026-04-01T09:15:00+05:30", "open": 2490, "high": 2500, "low": 2485, "close": 2495, "volume": 100}
        c3 = {"timestamp": "2026-04-01T09:20:00+05:30", "open": 2495, "high": 2505, "low": 2490, "close": 2500, "volume": 100}
        c1_dup = {"timestamp": "2026-04-01T09:30:00+05:30", "open": 2500, "high": 2512, "low": 2490, "close": 2508, "volume": 120}

        # Ingest in shuffled order with duplicate
        worker.reconcile_candles([c1, c2, c3, c1_dup])

        self.assertEqual(len(worker.candles), 3)
        timestamps = [c["timestamp"] for c in worker.candles]
        self.assertEqual(timestamps, [
            "2026-04-01T09:15:00+05:30",
            "2026-04-01T09:20:00+05:30",
            "2026-04-01T09:30:00+05:30"
        ])
        # The duplicate at 09:30 should take the authoritative updated close (2508)
        self.assertEqual(worker.candles[-1]["close"], 2508.0)

    # -------------------------------------------------------------------------
    # 7. Conflicting Historical versus Streaming Candle Data
    # -------------------------------------------------------------------------
    def test_conflicting_historical_vs_streaming_candle_data(self):
        """Tests that authoritative finalized historical candle overrides in-progress streaming candle."""
        worker = self.scheduler.workers[3]

        # Streaming tick created a bar at 09:30 with preliminary close 2500.0
        streaming_bar = {
            "timestamp": "2026-04-01 09:30:00",
            "open": 2495.0,
            "high": 2502.0,
            "low": 2490.0,
            "close": 2500.0,
            "volume": 500
        }
        worker.ingest_candle(streaming_bar, is_authentic=True)
        self.assertEqual(worker.candles[-1]["close"], 2500.0)

        # Later, historical backfill arrives with authoritative finalized bar
        finalized_hist_bar = {
            "timestamp": "2026-04-01 09:30:00",
            "open": 2495.0,
            "high": 2508.0,
            "low": 2490.0,
            "close": 2506.50,
            "volume": 1250
        }
        worker.reconcile_candles([finalized_hist_bar], is_historical=True)

        # Finalized values must overwrite the preliminary streaming values
        self.assertEqual(worker.candles[-1]["close"], 2506.50)
        self.assertEqual(worker.candles[-1]["high"], 2508.0)
        self.assertEqual(worker.candles[-1]["volume"], 1250.0)

    # -------------------------------------------------------------------------
    # 8. In-Progress versus Finalized Candle Handling
    # -------------------------------------------------------------------------
    def test_in_progress_vs_finalized_candle_handling(self):
        """Tests that subsequent streaming ticks update the active in-progress bar correctly."""
        worker = self.scheduler.workers[3]

        # Seed 30 finalized historical bars
        hist_candles = self._generate_valid_candles(count=30, interval_minutes=15)
        worker.reconcile_candles([
            {"timestamp": c[0], "open": c[1], "high": c[2], "low": c[3], "close": c[4], "volume": c[5]}
            for c in hist_candles
        ])
        self.assertEqual(len(worker.candles), 30)

        # Active streaming tick arrives for a new bar
        now_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        worker.ingest_tick(price=2600.0, volume=10.0, is_authentic=True, timestamp=now_ts)

        self.assertEqual(len(worker.candles), 31)
        self.assertEqual(worker.candles[-1]["close"], 2600.0)

        # Next tick updates the same active bar's high and close
        worker.ingest_tick(price=2615.0, volume=15.0, is_authentic=True, timestamp=now_ts)
        self.assertEqual(len(worker.candles), 31)  # Length unchanged
        self.assertEqual(worker.candles[-1]["high"], 2615.0)
        self.assertEqual(worker.candles[-1]["close"], 2615.0)

    # -------------------------------------------------------------------------
    # 9. Bounded Rate Limiting and Retry Behavior
    # -------------------------------------------------------------------------
    def test_bounded_rate_limiting_and_retry_behavior(self):
        """Tests that throttled calls back off exponentially and succeed within bounded limits."""
        mock_client = MagicMock()
        candles_raw = self._generate_valid_candles(count=35, interval_minutes=15)

        # Simulate 429 throttling on first call, recovery on second
        mock_client.getCandleData.side_effect = [
            {"status": False, "message": "Too Many Requests", "errorcode": "AG429"},
            {"status": True, "data": candles_raw}
        ]

        res = self.scheduler.backfill_bot(3, client=mock_client)
        self.assertTrue(res.success)
        self.assertEqual(res.retries_attempted, 1)
        self.assertEqual(mock_client.getCandleData.call_count, 2)
        self.assertEqual(self.scheduler.workers[3].backfill_status, "COMPLETED")

    # -------------------------------------------------------------------------
    # 10. Idempotent Repeated Backfill
    # -------------------------------------------------------------------------
    def test_idempotent_repeated_backfill(self):
        """Tests that executing backfill multiple times with identical data produces identical state."""
        mock_client = MagicMock()
        candles_raw = self._generate_valid_candles(count=35, interval_minutes=15)
        mock_client.getCandleData.return_value = {"status": True, "data": candles_raw}

        # Run 1
        res1 = self.scheduler.backfill_bot(3, client=mock_client)
        worker = self.scheduler.workers[3]
        len1 = len(worker.candles)
        candles1 = [dict(c) for c in worker.candles]

        # Run 2
        res2 = self.scheduler.backfill_bot(3, client=mock_client)
        len2 = len(worker.candles)
        candles2 = [dict(c) for c in worker.candles]

        self.assertEqual(len1, len2)
        self.assertEqual(candles1, candles2)
        self.assertEqual(res1.candle_count, res2.candle_count)

    # -------------------------------------------------------------------------
    # 11. Strategy Evaluation Blocked Until Readiness (and Expired Instruments)
    # -------------------------------------------------------------------------
    def test_strategy_evaluation_blocked_until_readiness(self):
        """Tests that workers fail-closed on evaluation before readiness or with expired instruments."""
        # Case A: Before backfill, strategy_ready is False -> NO_TRADE
        clean_worker = BotWorker(3)
        self.assertFalse(clean_worker.strategy_ready)
        eval_res = clean_worker.evaluate(execute_paper=False)
        self.assertEqual(eval_res["decision"], "NO_TRADE")
        self.assertIn(eval_res["status"], ["DATA_UNHEALTHY", "INSUFFICIENT_DATA"])

        # Case B: Expired instrument (Bot 1 has NIFTY24OCTFUT from 2024, evaluated in 2026)
        bot1_worker = self.scheduler.workers[1]
        res1 = bot1_worker.backfill_history(adapter=self.adapter)
        self.assertFalse(res1.success)
        self.assertEqual(res1.status, "EXPIRED_INSTRUMENT")
        self.assertEqual(bot1_worker.backfill_status, "EXPIRED_INSTRUMENT")
        self.assertFalse(bot1_worker.strategy_ready)

        eval_expired = bot1_worker.evaluate(execute_paper=False)
        self.assertEqual(eval_expired["decision"], "NO_TRADE")
        self.assertEqual(eval_expired["status"], "EXPIRED_INSTRUMENT")

    # -------------------------------------------------------------------------
    # 12. Proof That Broker Order Endpoints Are Never Invoked
    # -------------------------------------------------------------------------
    def test_proof_no_broker_order_endpoints_invoked(self):
        """
        Defensive safety verification: proves that backfill and scheduler
        integration NEVER invoke order placement or modification endpoints.
        """
        mock_broker = MagicMock()
        candles_raw = self._generate_valid_candles(count=35, interval_minutes=15)
        mock_broker.getCandleData.return_value = {"status": True, "data": candles_raw}

        # Run backfill_all
        self.scheduler.backfill_all(client=mock_broker)
        # Run reconcile_gaps
        self.scheduler.reconcile_gaps(client=mock_broker)
        # Run evaluate_all (with paper execution enabled)
        self.scheduler.evaluate_all(execute_paper=True)

        # Assert zero order endpoints were called on the market data client
        mock_broker.placeOrder.assert_not_called()
        mock_broker.modifyOrder.assert_not_called()
        mock_broker.cancelOrder.assert_not_called()
        mock_broker.orderBook.assert_not_called()
        mock_broker.tradeBook.assert_not_called()
        mock_broker.getPosition.assert_not_called()
        mock_broker.getHolding.assert_not_called()

    # -------------------------------------------------------------------------
    # 13. Safety Mandates & DB Isolation
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

        self.assertEqual(actual_size, expected_size, f"DB size altered: expected {expected_size}, got {actual_size}")
        self.assertEqual(actual_hash, expected_hash, f"DB hash altered: expected {expected_hash}, got {actual_hash}")


if __name__ == "__main__":
    unittest.main()
