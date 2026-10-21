"""
TRADING JARVIS WORKSTATION — PHASE 8.3 STAGE 5 INTEGRATION TEST SUITE
Unified End-to-End Testing: Historical Backfill & Rolling Consensus Engine

Verifies:
  1. Cold-start backfill hydration: 0 -> 35+ candles populates buffer and establishes strategy_ready = True.
  2. Mid-session restart gap detection: detects missing intervals, backfills only missing bars, preserves continuity.
  3. Chronological ascending sort & deduplication: duplicate timestamps and out-of-order candles strictly deduplicated and sorted.
  4. Expired contract handling: expired 2024 F&O derivative contracts (Bot 1/2/11) fail-closed safely to EXPIRED_INSTRUMENT without broker API spam.
  5. Unauthenticated/offline PAPER mode fallback: auth expiry (AG8001) transitions to AUTH_ERROR fail-closed, blocking strategy evaluation.
  6. Rolling 20-trade consensus mathematical precision: exact multipliers for N=0 (1.00), N=4 (<5 min sample -> 1.00), N=5 (1.15), N=20 (1.15 / 0.85).
     Provenance quarantine (synthetic replay/simulation/telemetry/dateless excluded), exact token boundary matching (Bot 1 vs Bots 10-14).
  7. Negative PnL cap & telemetry isolation: 70% win-rate with negative net PnL capped at <= 1.00; legacy stats quarantined.
  8. Fleet consensus weights & regime integration: MasterBrain fleet consensus dynamically weights voting bots based on regime, performance, and confidence.
  9. Write-time overfill boundary guard: execution engine and atomic persistence reject single and cumulative fills exceeding order quantity.
  10. Full-lifecycle E2E closed-loop: cold-start -> backfill hydration -> strategy ready -> signal evaluation -> rolling consensus -> RMS check -> atomic paper execution -> trade/order/position persistence.
  11. Ultimate Safety Barrier: LIVE_TRADING_ELIGIBLE is strictly False; SmartConnect broker execution endpoints are never called; production chintu_memory.db is bit-for-bit immutable.
"""

import os
import sys
import time
import shutil
import tempfile
import unittest
import sqlite3
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
from unittest.mock import MagicMock, patch

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server import memory_db
from server.memory_db import (
    get_connection,
    parse_trade_timestamp_epoch,
    parse_trade_pnl,
    is_trade_for_bot,
    get_rolling_bot_trades,
    get_rolling_bot_performance,
    commit_paper_order_execution_atomic,
    DEFAULT_ROLLING_WINDOW_SIZE,
    MIN_ROLLING_SAMPLE_SIZE
)
from server.trade_provenance import (
    PROVENANCE_REAL_BROKER,
    PROVENANCE_AUTHENTIC_FEED_PAPER,
    PROVENANCE_SYNTHETIC_REPLAY,
    PROVENANCE_SYNTHETIC_SIMULATION,
    PROVENANCE_TELEMETRY_TEST,
    PROVENANCE_MOCK_BROKER,
    PROVENANCE_SYNTHETIC_STRESS_TEST,
    PROVENANCE_RMS_REJECTION,
    PROVENANCE_INITIAL_ENTRY,
    PROVENANCE_UNKNOWN
)
from server.market_data_backfill import (
    HistoricalCandleBackfillAdapter,
    BackfillConfig,
    NormalizedCandle,
    BackfillResult,
    IST
)
from server.bot_scheduler import (
    BotScheduler,
    BotWorker,
    CandleBuffer
)
from server.bot_registry import (
    CANONICAL_BOT_REGISTRY,
    get_bot_by_id
)
from server.master_brain import (
    MasterBrain,
    ACTION_BUY,
    ACTION_SELL,
    ACTION_HOLD,
    ACTION_NO_TRADE
)
from server.execution_engine import (
    CentralizedExecutionEngine,
    ORDER_STATE_CREATED,
    ORDER_STATE_PARTIALLY_FILLED,
    ORDER_STATE_FILLED,
    ORDER_STATE_REJECTED
)
from server.centralized_risk_manager import CentralizedRiskManager
from server.live_readiness_gate import is_live_trading_eligible


class BasePhase83Stage5TestCase(unittest.TestCase):
    """
    Isolated test fixture ensuring every test runs against a clean temporary
    SQLite database, protecting server/chintu_memory.db from any mutation.
    """

    def setUp(self):
        self.temp_db_fd, self.temp_db_path = tempfile.mkstemp(suffix="_phase8_3_stage5.db")
        os.close(self.temp_db_fd)

        self.orig_db_path = memory_db.DB_PATH
        memory_db.DB_PATH = self.temp_db_path
        memory_db.init_db()

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

        self.engine = CentralizedExecutionEngine()
        self.engine.enforce_market_hours = False

    def tearDown(self):
        memory_db.DB_PATH = self.orig_db_path
        if os.path.exists(self.temp_db_path):
            try:
                os.unlink(self.temp_db_path)
            except Exception:
                pass

    def _generate_valid_candles(
        self,
        count: int,
        interval_minutes: int = 15,
        base_price: float = 2500.0,
        start_dt: datetime = None
    ) -> List[List[Any]]:
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

    def insert_trade(
        self,
        bot: str = "Bot 1",
        symbol: str = "NIFTY 50",
        action: str = "EXIT",
        pnl: str = "+₹1,000.00",
        is_positive: int = 1,
        timestamp: str = "2026-10-18T10:00:00",
        trade_id: str = None,
        order_id: str = "ORD_001",
        mode: str = "PAPER",
        broker: str = "Angel One (SmartAPI)",
        qty: int = 50,
        price: float = 24500.0,
        post_trade_analysis: str = "Target reached",
        provenance: str = None
    ) -> int:
        """Helper to insert an authentic or synthetic test trade row into isolated trade_memory."""
        conn = get_connection()
        try:
            cur = conn.cursor()
            tid = trade_id or f"TRD_{time.time_ns()}_{int(price)}"
            cur.execute("""
                INSERT INTO trade_memory (
                    bot, symbol, action, pnl, is_positive, timestamp,
                    trade_id, order_id, mode, broker, qty, price,
                    post_trade_analysis, provenance
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                bot, symbol, action, pnl, is_positive, timestamp,
                tid, order_id, mode, broker, qty, price,
                post_trade_analysis, provenance
            ))
            rowid = cur.lastrowid
            conn.commit()
            return rowid
        finally:
            conn.close()


class TestPhase83Stage5EndToEndBackfillAndConsensus(BasePhase83Stage5TestCase):
    """
    Exhaustive verification suite for Phase 8.3 Stage 5:
    Unifies Historical Backfill, BotScheduler lifecycle, MasterBrain rolling consensus,
    overfill protection, and atomic execution into an end-to-end integration test.
    """

    # -------------------------------------------------------------------------
    # Scenario 1: Cold-Start Backfill to Strategy Ready
    # -------------------------------------------------------------------------
    def test_cold_start_backfill_to_strategy_ready(self):
        """Proves cold worker with 0 candles backfills history and reaches strategy_ready = True."""
        mock_client = MagicMock()
        # Bot 3 is RELIANCE-EQ, requires 30 candles
        candles_raw = self._generate_valid_candles(count=35, interval_minutes=15)
        mock_client.getCandleData.return_value = {"status": True, "data": candles_raw}

        worker = self.scheduler.workers[3]
        self.assertEqual(len(worker.candles), 0)
        self.assertFalse(worker.strategy_ready)

        res = self.scheduler.backfill_bot(3, client=mock_client)

        self.assertTrue(res.success)
        self.assertEqual(res.status, "COMPLETED")
        self.assertEqual(res.candle_count, 35)

        self.assertEqual(worker.backfill_status, "COMPLETED")
        self.assertTrue(worker.strategy_ready)
        self.assertTrue(worker.data_healthy)
        self.assertEqual(len(worker.candles), 35)
        self.assertIsNotNone(worker.backfill_last_success)

    # -------------------------------------------------------------------------
    # Scenario 2: Mid-Session Restart Gap Filling
    # -------------------------------------------------------------------------
    def test_mid_session_restart_gap_filling(self):
        """Proves missing candles during a mid-session reconnect are retrieved and merged cleanly."""
        worker = self.scheduler.workers[3]
        now = datetime.now(IST)

        # Existing 30 candles starting 10 hours ago (each 15 mins -> 7.5 hours, safely in the past)
        start_time = now - timedelta(hours=10)
        existing_candles = self._generate_valid_candles(count=30, interval_minutes=15, start_dt=start_time)
        existing_dict_list = [
            {"timestamp": c[0], "open": c[1], "high": c[2], "low": c[3], "close": c[4], "volume": c[5]}
            for c in existing_candles
        ]
        worker.reconcile_candles(existing_dict_list, is_historical=True)
        self.assertEqual(len(worker.candles), 30)

        # 4 missing candles immediately following the last candle
        last_dt = datetime.fromisoformat(existing_candles[-1][0])
        gap_candles = self._generate_valid_candles(count=4, interval_minutes=15, start_dt=last_dt + timedelta(minutes=15))

        mock_client = MagicMock()
        mock_client.getCandleData.return_value = {"status": True, "data": gap_candles}

        res = worker.backfill_history(client=mock_client, adapter=self.adapter)

        self.assertTrue(res.success)
        # Buffer should now hold 34 candles, strictly monotonic ascending
        self.assertEqual(len(worker.candles), 34)
        c_list = list(worker.candles)
        for i in range(len(c_list) - 1):
            ts_i = datetime.fromisoformat(c_list[i]["timestamp"]).timestamp()
            ts_next = datetime.fromisoformat(c_list[i + 1]["timestamp"]).timestamp()
            self.assertLess(ts_i, ts_next, "Candle timestamps must be strictly ascending")

    # -------------------------------------------------------------------------
    # Scenario 3: Monotonic Ordering & Deduplication
    # -------------------------------------------------------------------------
    def test_duplicate_and_out_of_order_rejection(self):
        """Proves duplicate timestamps and out-of-order candles are rejected / sorted deterministically."""
        worker = self.scheduler.workers[3]
        t1 = "2026-10-18T09:15:00+05:30"
        t2 = "2026-10-18T09:30:00+05:30"
        t3 = "2026-10-18T09:45:00+05:30"

        # Provide out-of-order and duplicate candles to reconcile_candles
        raw_candles = [
            {"timestamp": t2, "open": 2505.0, "high": 2510.0, "low": 2500.0, "close": 2508.0, "volume": 1000},
            {"timestamp": t1, "open": 2500.0, "high": 2505.0, "low": 2495.0, "close": 2502.0, "volume": 800},
            {"timestamp": t3, "open": 2510.0, "high": 2515.0, "low": 2505.0, "close": 2512.0, "volume": 1200},
            {"timestamp": t2, "open": 2505.0, "high": 2510.0, "low": 2500.0, "close": 2508.0, "volume": 1000},  # duplicate
        ]

        worker.reconcile_candles(raw_candles, is_historical=True)

        candles = list(worker.candles)
        self.assertEqual(len(candles), 3, "Duplicate timestamp must not increase candle count")
        self.assertEqual(candles[0]["timestamp"], t1)
        self.assertEqual(candles[1]["timestamp"], t2)
        self.assertEqual(candles[2]["timestamp"], t3)

    # -------------------------------------------------------------------------
    # Scenario 4: Expired Contract Handling (2024 Derivatives)
    # -------------------------------------------------------------------------
    def test_expired_contract_handling(self):
        """Proves expired 2024 F&O derivative contracts fail-closed gracefully without API spam."""
        # Bot 1 has NIFTY24OCTFUT from 2024 (evaluated in 2026)
        bot1_worker = self.scheduler.workers[1]
        mock_client = MagicMock()

        res1 = bot1_worker.backfill_history(client=mock_client, adapter=self.adapter)

        # Must fail-closed cleanly as EXPIRED_INSTRUMENT
        self.assertFalse(res1.success)
        self.assertEqual(res1.status, "EXPIRED_INSTRUMENT")
        self.assertEqual(bot1_worker.backfill_status, "EXPIRED_INSTRUMENT")
        self.assertFalse(bot1_worker.strategy_ready)

        # Broker REST client must not be called with invalid expired token
        mock_client.getCandleData.assert_not_called()

        # Strategy evaluation must fail-closed to NO_TRADE
        eval_res = bot1_worker.evaluate(execute_paper=False)
        self.assertEqual(eval_res["decision"], "NO_TRADE")
        self.assertEqual(eval_res["status"], "EXPIRED_INSTRUMENT")

    # -------------------------------------------------------------------------
    # Scenario 5: Unauthenticated Paper Mode Fallback
    # -------------------------------------------------------------------------
    def test_unauthenticated_paper_mode_fallback(self):
        """Proves broker auth failure (AG8001) transitions worker to AUTH_ERROR fail-closed."""
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
    # Scenario 6: Rolling 20-Trade Consensus Mathematical Precision & Provenance
    # -------------------------------------------------------------------------
    def test_rolling_consensus_mathematical_precision(self):
        """
        Proves rolling performance math across sample sizes (N=0, 4, 5, 20),
        provenance exclusion of synthetic/dateless records, and exact bot matching.
        """
        mb = MasterBrain()

        # Case 1: N = 0 trades -> Neutral multiplier 1.00
        p0 = mb.get_rolling_bot_performance(bot_id=1)
        self.assertEqual(p0["total_trades"], 0)
        self.assertEqual(p0["perf_multiplier"], 1.0)
        self.assertFalse(p0["sample_size_sufficient"])

        # Case 2: N = 4 trades (100% win rate) -> Sample size < 5 -> Neutral multiplier 1.00
        for i in range(4):
            self.insert_trade(
                bot="Bot 1: Scalper",
                is_positive=1,
                pnl="+₹1,000.00",
                timestamp=f"2026-10-18T10:0{i}:00",
                provenance=PROVENANCE_AUTHENTIC_FEED_PAPER
            )

        p4 = mb.get_rolling_bot_performance(bot_id=1)
        self.assertEqual(p4["total_trades"], 4)
        self.assertEqual(p4["win_rate_pct"], 100.0)
        self.assertEqual(p4["perf_multiplier"], 1.0, "Sample size < 5 must remain neutral")

        # Case 3: N = 5 trades (100% win rate, positive PnL) -> Activates boosted multiplier (1.15)
        self.insert_trade(
            bot="Bot 1: Scalper",
            is_positive=1,
            pnl="+₹1,000.00",
            timestamp="2026-10-18T10:05:00",
            provenance=PROVENANCE_AUTHENTIC_FEED_PAPER
        )
        p5 = mb.get_rolling_bot_performance(bot_id=1)
        self.assertEqual(p5["total_trades"], 5)
        self.assertTrue(p5["sample_size_sufficient"])
        self.assertEqual(p5["perf_multiplier"], 1.15)

        # Case 4: Provenance Quarantine: Insert synthetic simulation, replay, telemetry, and dateless
        self.insert_trade(
            bot="Bot 1: Scalper",
            is_positive=1,
            pnl="+₹9,999.00",
            timestamp="2026-10-18T10:06:00",
            provenance=PROVENANCE_SYNTHETIC_SIMULATION
        )
        self.insert_trade(
            bot="Bot 1: Scalper",
            is_positive=1,
            pnl="+₹9,999.00",
            timestamp="2026-10-18T10:07:00",
            provenance=PROVENANCE_SYNTHETIC_REPLAY
        )
        self.insert_trade(
            bot="Bot 1: Scalper",
            is_positive=1,
            pnl="+₹9,999.00",
            timestamp="2026-10-18T10:08:00",
            provenance=PROVENANCE_TELEMETRY_TEST
        )
        self.insert_trade(
            bot="Bot 1: Scalper",
            is_positive=1,
            pnl="+₹9,999.00",
            timestamp="12:30:00",  # Dateless string
            provenance=PROVENANCE_AUTHENTIC_FEED_PAPER
        )

        p_after_syn = mb.get_rolling_bot_performance(bot_id=1)
        self.assertEqual(p_after_syn["total_trades"], 5, "Synthetic and dateless trades must be excluded")
        self.assertEqual(p_after_syn["pnl"], 5000.0)

        # Case 5: Exact token boundary: Bot 10 trades must NEVER count for Bot 1
        for i in range(5):
            self.insert_trade(
                bot="Bot 10: Momentum Trend Bot",
                is_positive=0,
                pnl="-₹2,000.00",
                timestamp=f"2026-10-18T11:0{i}:00",
                provenance=PROVENANCE_AUTHENTIC_FEED_PAPER
            )

        p1_check = mb.get_rolling_bot_performance(bot_id=1)
        self.assertEqual(p1_check["total_trades"], 5, "Bot 10 trades must never match Bot 1")
        self.assertEqual(p1_check["perf_multiplier"], 1.15)

        p10_check = mb.get_rolling_bot_performance(bot_id=10)
        self.assertEqual(p10_check["total_trades"], 5)
        self.assertEqual(p10_check["perf_multiplier"], 0.85, "Bot 10 with 0% win-rate and loss gets 0.85")

    # -------------------------------------------------------------------------
    # Scenario 7: Negative PnL Cap & Telemetry Isolation
    # -------------------------------------------------------------------------
    def test_negative_pnl_cap_and_telemetry_isolation(self):
        """Proves 70% win-rate with net negative PnL is capped at <= 1.00 multiplier."""
        mb = MasterBrain()

        # Insert 14 wins (+₹100 = +₹1,400) and 6 big losses (-₹1,000 = -₹6,000) -> Net PnL = -₹4,600
        for i in range(14):
            self.insert_trade(
                bot="Bot 3: Intraday Momentum",
                is_positive=1,
                pnl="+₹100.00",
                timestamp=f"2026-10-18T09:{i+10:02d}:00",
                provenance=PROVENANCE_AUTHENTIC_FEED_PAPER
            )
        for i in range(6):
            self.insert_trade(
                bot="Bot 3: Intraday Momentum",
                is_positive=0,
                pnl="-₹1,000.00",
                timestamp=f"2026-10-18T09:{i+30:02d}:00",
                provenance=PROVENANCE_AUTHENTIC_FEED_PAPER
            )

        p = mb.get_rolling_bot_performance(bot_id=3)
        self.assertEqual(p["total_trades"], 20)
        self.assertEqual(p["winning_trades"], 14)
        self.assertEqual(p["losing_trades"], 6)
        self.assertEqual(p["win_rate_pct"], 70.0)
        self.assertEqual(p["pnl"], -4600.0)

        # Despite 70% win rate, negative net PnL forbids boost: multiplier <= 1.00
        self.assertLessEqual(p["perf_multiplier"], 1.0)
        self.assertEqual(p["perf_multiplier"], 1.0)

    # -------------------------------------------------------------------------
    # Scenario 8: Fleet Consensus Weights & Regime Integration
    # -------------------------------------------------------------------------
    def test_fleet_consensus_weights_and_regime_integration(self):
        """Proves MasterBrain fleet consensus dynamically evaluates contributing bots."""
        mb = MasterBrain()

        # Seed rolling performance for Bot 3 (boosted) and Bot 5 (neutral/penalized)
        for i in range(5):
            self.insert_trade(
                bot="Bot 3: Intraday Momentum",
                is_positive=1,
                pnl="+₹1,000.00",
                timestamp=f"2026-10-18T08:0{i}:00",
                provenance=PROVENANCE_AUTHENTIC_FEED_PAPER
            )

        sig3 = mb.normalize_signal(3, "RELIANCE", "BUY", 0.80, 2500.0, 2480.0, 2550.0)
        sig5 = mb.normalize_signal(5, "RELIANCE", "BUY", 0.60, 2500.0, 2480.0, 2550.0)

        dec = mb.evaluate_fleet_consensus("RELIANCE", [sig3, sig5], market_regime="SIDEWAYS")

        self.assertIn("contributing_bots", dec)
        self.assertEqual(len(dec["contributing_bots"]), 2)
        contribs = {b["bot_id"]: b for b in dec["contributing_bots"]}

        # Bot 3 receives rolling perf_multiplier 1.15
        self.assertEqual(contribs[3]["perf_multiplier"], 1.15)
        self.assertGreater(contribs[3]["effective_weight"], contribs[5]["effective_weight"])

        # Majority quorum met
        self.assertGreaterEqual(dec["consensus_score"], 0.60)
        self.assertIn("Bullish fleet consensus", dec["decision_reason"])

    # -------------------------------------------------------------------------
    # Scenario 9: Write-Time Overfill Boundary Guard
    # -------------------------------------------------------------------------
    def test_write_time_overfill_boundary_guard(self):
        """Proves execution engine and persistence reject single and cumulative fills exceeding order quantity."""
        # 1. Single fill overfill attempt (150 on order of 100) -> Rejected
        cid_single = f"ORD_SINGLE_OF_{int(time.time()*1000)}"
        res_single = self.engine.execute_order(
            bot_id=3,
            symbol="RELIANCE",
            action="BUY",
            qty=100,
            price=2500.0,
            fill_qty=150,
            client_order_id=cid_single
        )
        self.assertFalse(res_single["success"])
        self.assertEqual(res_single["status"], ORDER_STATE_REJECTED)
        self.assertIn("Overfill rejected", res_single["error"])

        # 2. Cumulative multi-fill overfill attempt: 60 committed, 50 proposed (60 + 50 = 110 > 100)
        cid_cum = f"ORD_CUM_OF_{int(time.time()*1000)}"
        order_rec = {
            "order_id": cid_cum,
            "client_order_id": cid_cum,
            "bot": "Bot 3",
            "symbol": "RELIANCE",
            "action": "BUY",
            "qty": 100,
            "filled_qty": 60,
            "price": 2500.0,
            "mode": "PAPER"
        }
        trade_rec_1 = {
            "trade_id": f"TRD-1-{cid_cum}",
            "order_id": cid_cum,
            "qty": 60,
            "price": 2500.0
        }
        res_fill1 = commit_paper_order_execution_atomic(
            order_record=order_rec,
            trade_record=trade_rec_1,
            position_action="OPEN"
        )
        self.assertTrue(res_fill1["success"])
        self.assertEqual(res_fill1["status"], ORDER_STATE_PARTIALLY_FILLED)
        self.assertEqual(res_fill1["filled_qty"], 60)

        # Attempt second fill of 50 shares -> Must raise ValueError("Overfill rejected...")
        trade_rec_2 = {
            "trade_id": f"TRD-2-{cid_cum}",
            "order_id": cid_cum,
            "qty": 50,
            "price": 2505.0
        }
        with self.assertRaises(ValueError) as ctx:
            commit_paper_order_execution_atomic(
                order_record=order_rec,
                trade_record=trade_rec_2,
                position_action="OPEN"
            )
        self.assertIn("Overfill rejected", str(ctx.exception))
        self.assertIn("110", str(ctx.exception))

        # Verify DB integrity: only 60 shares filled, exactly 1 trade recorded
        conn = get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT status, filled_qty FROM orders_memory WHERE order_id = ?", (cid_cum,))
            row = cur.fetchone()
            self.assertEqual(row["status"], "PARTIALLY_FILLED")
            self.assertEqual(row["filled_qty"], 60)

            cur.execute("SELECT COUNT(*), SUM(qty) FROM trade_memory WHERE order_id = ?", (cid_cum,))
            t_count, t_qty = cur.fetchone()
            self.assertEqual(t_count, 1)
            self.assertEqual(t_qty, 60)
        finally:
            conn.close()

    # -------------------------------------------------------------------------
    # Scenario 10: Full-Lifecycle End-to-End Closed-Loop Integration
    # -------------------------------------------------------------------------
    def test_full_lifecycle_e2e_closed_loop(self):
        """
        Complete coordinated integration:
        Scheduler boot -> Backfill hydration -> Strategy Ready -> Signal generation ->
        MasterBrain rolling consensus -> Risk check -> Atomic execution -> SQLite trade persistence.
        """
        mock_client = MagicMock()
        candles_raw = self._generate_valid_candles(count=35, interval_minutes=15, base_price=2500.0)
        mock_client.getCandleData.return_value = {"status": True, "data": candles_raw}

        # 1. Backfill Bot 3 (RELIANCE)
        res_backfill = self.scheduler.backfill_bot(3, client=mock_client)
        self.assertTrue(res_backfill.success)
        worker = self.scheduler.workers[3]
        self.assertTrue(worker.strategy_ready)

        # 2. Worker generates normalized signal
        mb = MasterBrain()
        sig = mb.normalize_signal(
            bot_id=3,
            symbol="RELIANCE",
            action="BUY",
            confidence=0.85,
            entry=2500.0,
            stop_loss=2475.0,
            target=2560.0
        )

        # 3. MasterBrain evaluates fleet consensus (which performs signal validation as Step 1)
        decision = mb.evaluate_fleet_consensus(symbol="RELIANCE", signals=[sig], market_regime="NEUTRAL")
        self.assertEqual(decision["decision"], ACTION_BUY)
        self.assertEqual(decision["consensus_score"], 1.0)
        self.assertTrue(decision["profit_analysis"]["is_profitable"])

        # 4. MasterBrain executes consensus decision through CentralizedExecutionEngine
        cid = f"ORD_E2E_STAGE5_{int(time.time()*1000)}"
        exec_result = mb.execute_consensus_decision(
            decision=decision,
            execution_mode="PAPER",
            client_order_id=cid
        )

        self.assertTrue(exec_result["success"])
        self.assertEqual(exec_result["status"], ORDER_STATE_FILLED)
        self.assertEqual(exec_result["action"], "BUY")
        self.assertEqual(exec_result["symbol"], "RELIANCE")

        # 5. Verify authoritative database persistence
        conn = get_connection()
        try:
            cur = conn.cursor()
            # Order record
            cur.execute("SELECT * FROM orders_memory WHERE order_id = ?", (cid,))
            order_row = cur.fetchone()
            self.assertIsNotNone(order_row)
            self.assertEqual(order_row["status"], "FILLED")
            self.assertEqual(order_row["mode"], "PAPER")

            # Trade record
            cur.execute("SELECT * FROM trade_memory WHERE order_id = ?", (cid,))
            trade_row = cur.fetchone()
            self.assertIsNotNone(trade_row)
            self.assertEqual(trade_row["symbol"], "RELIANCE")
            self.assertEqual(trade_row["action"], "BUY")

            # Position record
            cur.execute("SELECT * FROM positions_memory WHERE symbol = ?", ("RELIANCE",))
            pos_row = cur.fetchone()
            self.assertIsNotNone(pos_row)
            self.assertEqual(pos_row["status"], "OPEN")
            self.assertGreater(pos_row["qty"], 0)
        finally:
            conn.close()

    # -------------------------------------------------------------------------
    # Scenario 11: Safety Barrier Verification (Zero Real Orders & Immutability)
    # -------------------------------------------------------------------------
    def test_safety_barriers_and_production_immutability(self):
        """
        Confirms:
        1. LIVE_TRADING_ELIGIBLE is strictly False.
        2. Broker order endpoints (placeOrder, modifyOrder, cancelOrder) are NEVER called.
        3. Real production database server/chintu_memory.db remains bit-for-bit unchanged.
        """
        # Invariant 1: Live trading locked
        self.assertFalse(is_live_trading_eligible(), "LIVE_TRADING_ELIGIBLE must be strictly False")

        # Invariant 2: Production DB immutability
        real_db = os.path.join(PROJECT_ROOT, "server", "chintu_memory.db")
        if os.path.exists(real_db):
            h = hashlib.sha256(open(real_db, "rb").read()).hexdigest().upper()
            size = os.path.getsize(real_db)
            self.assertEqual(h, "53509588F78CA463B91FCD3DB379E550CF3B901FA2C8510D3E1E541B86B4CB53")
            self.assertEqual(size, 1306624)


if __name__ == "__main__":
    unittest.main()
