"""
TRADING JARVIS WORKSTATION — PHASE 8.3 STAGE 4 TEST SUITE
Rolling Consensus Calibration & Invariant Tests

Verifies:
  1. Window size capping: Only latest 20 completed trades are included when >20 exist.
  2. Deterministic tie-breaking: Identical timestamps ordered by rowid / trade_id descending.
  3. Anti-lookahead cutoff: 'before_timestamp' excludes subsequent trades from consensus.
  4. Win / Loss / Breakeven semantics: PnL > 0 is win, PnL < 0 is loss, PnL == 0 is breakeven (counts in denominator, not numerator).
  5. Sample size gate: <5 rolling trades retains neutral multiplier (1.0).
  6. High performance multiplier: >=5 trades, win rate >=60%, PnL > 0 activates 1.15 multiplier.
  7. Underperformance penalty: >=5 trades, win rate <40%, PnL < 0 activates 0.85 multiplier.
  8. Neutral calibration: >=5 trades with 40%-60% win rate or contradictory PnL activates 1.0 multiplier.
  9. RMS pre-order exclusion: RMS blocked / capital exceeded records excluded from rolling window.
  10. Initial entry exclusion: Open entry orders (pnl == 0.00, BUY/SELL) excluded from rolling window.
  11. Trade deduplication: Duplicate trade_id records deduplicated to authoritative latest record.
  12. MasterBrain integration & telemetry: Fleet consensus attaches rolling_performance and applies perf_multiplier to effective weights.
  13. Bot identifier matching: Numeric, canonical name, and prefix string variants all match target bot.
  14. Symbol scoped filtering: Scoping to specific symbol filters correctly when requested.
  15. Backward-compatible fallback: When 0 trades in trade_memory, falls back to bot_performance_memory.
  16. Custom rolling window configuration: Configured rolling_window_size and min_rolling_sample_size honored.
"""

import os
import sys
import time
import tempfile
import unittest
import sqlite3
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List

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
    DEFAULT_ROLLING_WINDOW_SIZE,
    MIN_ROLLING_SAMPLE_SIZE
)
from server.master_brain import (
    MasterBrain,
    ACTION_BUY,
    ACTION_SELL,
    ACTION_HOLD,
    ACTION_NO_TRADE
)


class BasePhase83Stage4TestCase(unittest.TestCase):
    """Provides isolated temporary SQLite database for each test, ensuring zero production mutation."""

    def setUp(self):
        self.temp_db_fd, self.temp_db_path = tempfile.mkstemp(suffix="_phase8_3_stage4.db")
        os.close(self.temp_db_fd)

        self.orig_db_path = memory_db.DB_PATH
        memory_db.DB_PATH = self.temp_db_path
        memory_db.init_db()

    def tearDown(self):
        memory_db.DB_PATH = self.orig_db_path
        if os.path.exists(self.temp_db_path):
            try:
                os.unlink(self.temp_db_path)
            except Exception:
                pass

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
        """Helper to insert a test trade row into isolated trade_memory."""
        conn = get_connection()
        try:
            cur = conn.cursor()
            tid = trade_id or f"TRD_{time.time_ns()}"
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


class TestPhase83Stage4RollingConsensus(BasePhase83Stage4TestCase):
    """Core invariant and calibration tests for rolling consensus."""

    def test_window_size_capping_to_20_trades(self):
        """1. Only latest 20 completed trades are included when >20 exist."""
        # Insert 30 completed trades for Bot 1 with increasing timestamps
        for i in range(1, 31):
            ts = f"2026-10-18T10:{i:02d}:00"
            self.insert_trade(
                bot="Bot 1",
                action="EXIT",
                pnl="+₹100.00",
                is_positive=1,
                timestamp=ts,
                trade_id=f"TRD_{i:03d}",
                order_id=f"ORD_{i:03d}"
            )

        trades = get_rolling_bot_trades("Bot 1", window_size=20)
        self.assertEqual(len(trades), 20)

        # Must be trades 11 through 30 (the latest 20)
        retrieved_ids = [t["trade_id"] for t in trades]
        expected_ids = [f"TRD_{i:03d}" for i in range(30, 10, -1)]
        self.assertEqual(retrieved_ids, expected_ids)

        perf = get_rolling_bot_performance("Bot 1", window_size=20)
        self.assertEqual(perf["total_trades"], 20)
        self.assertEqual(perf["winning_trades"], 20)
        self.assertEqual(perf["win_rate"], 1.0)
        self.assertEqual(perf["sample_size_sufficient"], True)

    def test_deterministic_tie_breaking_identical_timestamps(self):
        """2. Identical timestamps must be deterministically ordered by rowid / trade_id descending."""
        ts = "2026-10-18T12:00:00"
        # Insert 5 trades at the exact same second
        r1 = self.insert_trade(bot="Bot 1", timestamp=ts, trade_id="TRD_A", order_id="ORD_A", pnl="+₹50.00")
        r2 = self.insert_trade(bot="Bot 1", timestamp=ts, trade_id="TRD_B", order_id="ORD_B", pnl="+₹60.00")
        r3 = self.insert_trade(bot="Bot 1", timestamp=ts, trade_id="TRD_C", order_id="ORD_C", pnl="+₹70.00")
        r4 = self.insert_trade(bot="Bot 1", timestamp=ts, trade_id="TRD_D", order_id="ORD_D", pnl="+₹80.00")
        r5 = self.insert_trade(bot="Bot 1", timestamp=ts, trade_id="TRD_E", order_id="ORD_E", pnl="+₹90.00")

        trades_run1 = get_rolling_bot_trades("Bot 1", window_size=10)
        trades_run2 = get_rolling_bot_trades("Bot 1", window_size=10)

        order1 = [t["trade_id"] for t in trades_run1]
        order2 = [t["trade_id"] for t in trades_run2]

        self.assertEqual(order1, order2)
        # Because rowid autoincrements, latest rowid comes first
        self.assertEqual(order1, ["TRD_E", "TRD_D", "TRD_C", "TRD_B", "TRD_A"])

    def test_anti_lookahead_before_timestamp_cutoff(self):
        """3. 'before_timestamp' strictly excludes trades occurring after the cutoff."""
        self.insert_trade(bot="Bot 1", timestamp="2026-10-18T10:00:00", trade_id="T_1000", pnl="+₹100.00")
        self.insert_trade(bot="Bot 1", timestamp="2026-10-18T10:05:00", trade_id="T_1005", pnl="+₹100.00")
        self.insert_trade(bot="Bot 1", timestamp="2026-10-18T10:10:00", trade_id="T_1010", pnl="+₹100.00")
        self.insert_trade(bot="Bot 1", timestamp="2026-10-18T10:15:00", trade_id="T_1015", pnl="+₹100.00")
        self.insert_trade(bot="Bot 1", timestamp="2026-10-18T10:20:00", trade_id="T_1020", pnl="+₹100.00")

        # Cutoff at 10:12:00 -> should only see 10:00, 10:05, 10:10
        trades = get_rolling_bot_trades("Bot 1", before_timestamp="2026-10-18T10:12:00")
        retrieved_ids = [t["trade_id"] for t in trades]
        self.assertEqual(retrieved_ids, ["T_1010", "T_1005", "T_1000"])

        # Anti-lookahead in performance calculation
        perf = get_rolling_bot_performance("Bot 1", before_timestamp="2026-10-18T10:12:00")
        self.assertEqual(perf["total_trades"], 3)
        self.assertFalse(perf["sample_size_sufficient"])  # 3 < 5
        self.assertEqual(perf["perf_multiplier"], 1.0)

    def test_win_loss_breakeven_pnl_classification(self):
        """4. PnL > 0 is win, PnL < 0 is loss, PnL == 0 is breakeven (counts in denominator only)."""
        # 5 wins (+₹500 each)
        for i in range(5):
            self.insert_trade(
                bot="Bot 1",
                timestamp=f"2026-10-18T09:{i+10:02d}:00",
                trade_id=f"WIN_{i}",
                action="EXIT",
                pnl="+₹500.00",
                is_positive=1
            )
        # 5 breakevens (₹0.00 each)
        for i in range(5):
            self.insert_trade(
                bot="Bot 1",
                timestamp=f"2026-10-18T09:{i+20:02d}:00",
                trade_id=f"BE_{i}",
                action="EXIT",
                pnl="₹0.00",
                is_positive=1
            )

        perf = get_rolling_bot_performance("Bot 1", window_size=20)
        self.assertEqual(perf["total_trades"], 10)
        self.assertEqual(perf["winning_trades"], 5)
        self.assertEqual(perf["losing_trades"], 0)
        self.assertEqual(perf["breakeven_trades"], 5)
        # Win rate must be 5 / 10 = 50.0%, NOT 5 / 5 = 100%!
        self.assertAlmostEqual(perf["win_rate"], 0.50, places=4)
        self.assertAlmostEqual(perf["win_rate_pct"], 50.0, places=2)
        # Because win rate 50% is < 60%, multiplier remains neutral 1.0
        self.assertEqual(perf["perf_multiplier"], 1.0)

    def test_sample_size_gate_under_5_trades_stays_neutral(self):
        """5. Fewer than 5 rolling trades retains neutral multiplier 1.0 regardless of win rate."""
        # 4 wins out of 4 (100% win rate, positive PnL)
        for i in range(4):
            self.insert_trade(
                bot="Bot 1",
                timestamp=f"2026-10-18T11:{i:02d}:00",
                trade_id=f"PERF_{i}",
                action="EXIT",
                pnl="+₹2,000.00",
                is_positive=1
            )

        perf = get_rolling_bot_performance("Bot 1", min_samples=5)
        self.assertEqual(perf["total_trades"], 4)
        self.assertFalse(perf["sample_size_sufficient"])
        self.assertEqual(perf["perf_multiplier"], 1.0)  # Gated: neutral 1.0

        # Now add 1 more win to reach sample size 5
        self.insert_trade(
            bot="Bot 1",
            timestamp="2026-10-18T11:05:00",
            trade_id="PERF_4",
            action="EXIT",
            pnl="+₹2,000.00",
            is_positive=1
        )
        perf5 = get_rolling_bot_performance("Bot 1", min_samples=5)
        self.assertEqual(perf5["total_trades"], 5)
        self.assertTrue(perf5["sample_size_sufficient"])
        self.assertEqual(perf5["perf_multiplier"], 1.15)  # Now unlocked!

    def test_high_performance_multiplier_activation(self):
        """6. Sample size >= 5, win rate >= 60%, total PnL > 0 activates 1.15 multiplier."""
        # 14 wins (+₹500), 6 losses (-₹200) -> 20 trades, win rate = 70%, PnL = +5800
        for i in range(14):
            self.insert_trade(
                bot="Bot 1",
                timestamp=f"2026-10-18T10:{i:02d}:00",
                trade_id=f"W_{i}",
                action="EXIT",
                pnl="+₹500.00",
                is_positive=1
            )
        for i in range(6):
            self.insert_trade(
                bot="Bot 1",
                timestamp=f"2026-10-18T10:{i+15:02d}:00",
                trade_id=f"L_{i}",
                action="EXIT",
                pnl="-₹200.00",
                is_positive=0
            )

        perf = get_rolling_bot_performance("Bot 1", window_size=20)
        self.assertEqual(perf["total_trades"], 20)
        self.assertEqual(perf["winning_trades"], 14)
        self.assertEqual(perf["losing_trades"], 6)
        self.assertAlmostEqual(perf["win_rate"], 0.70, places=4)
        self.assertGreater(perf["pnl"], 0)
        self.assertEqual(perf["perf_multiplier"], 1.15)

    def test_underperformance_penalty_multiplier_activation(self):
        """7. Sample size >= 5, win rate < 40%, total PnL < 0 activates 0.85 multiplier."""
        # 6 wins (+₹200), 14 losses (-₹500) -> 20 trades, win rate = 30%, PnL = -5800
        for i in range(6):
            self.insert_trade(
                bot="Bot 1",
                timestamp=f"2026-10-18T10:{i:02d}:00",
                trade_id=f"W_{i}",
                action="EXIT",
                pnl="+₹200.00",
                is_positive=1
            )
        for i in range(14):
            self.insert_trade(
                bot="Bot 1",
                timestamp=f"2026-10-18T10:{i+10:02d}:00",
                trade_id=f"L_{i}",
                action="EXIT",
                pnl="-₹500.00",
                is_positive=0
            )

        perf = get_rolling_bot_performance("Bot 1", window_size=20)
        self.assertEqual(perf["total_trades"], 20)
        self.assertEqual(perf["winning_trades"], 6)
        self.assertEqual(perf["losing_trades"], 14)
        self.assertAlmostEqual(perf["win_rate"], 0.30, places=4)
        self.assertLess(perf["pnl"], 0)
        self.assertEqual(perf["perf_multiplier"], 0.85)

    def test_neutral_calibration_mixed_or_breakeven(self):
        """8. Neutral conditions (40%-60% win rate or contradictory PnL) produce 1.0 multiplier."""
        # Scenario A: 50% win rate (10 wins, 10 losses)
        for i in range(10):
            self.insert_trade(bot="Bot 2", timestamp=f"2026-10-18T10:{i:02d}:00", trade_id=f"A_W_{i}", action="EXIT", pnl="+₹500.00", is_positive=1)
        for i in range(10):
            self.insert_trade(bot="Bot 2", timestamp=f"2026-10-18T10:{i+15:02d}:00", trade_id=f"A_L_{i}", action="EXIT", pnl="-₹400.00", is_positive=0)

        perfA = get_rolling_bot_performance("Bot 2")
        self.assertAlmostEqual(perfA["win_rate"], 0.50, places=4)
        self.assertEqual(perfA["perf_multiplier"], 1.0)

        # Scenario B: High win rate (70%) but negative net PnL (huge catastrophic losses)
        for i in range(14):
            self.insert_trade(bot="Bot 3", timestamp=f"2026-10-18T10:{i:02d}:00", trade_id=f"B_W_{i}", action="EXIT", pnl="+₹100.00", is_positive=1)
        for i in range(6):
            self.insert_trade(bot="Bot 3", timestamp=f"2026-10-18T10:{i+15:02d}:00", trade_id=f"B_L_{i}", action="EXIT", pnl="-₹500.00", is_positive=0)

        perfB = get_rolling_bot_performance("Bot 3")
        self.assertAlmostEqual(perfB["win_rate"], 0.70, places=4)
        self.assertLess(perfB["pnl"], 0)  # PnL = 1400 - 3000 = -1600
        self.assertEqual(perfB["perf_multiplier"], 1.0)  # Gated: cannot boost if net PnL is negative!

        # Scenario C: Low win rate (30%) but positive net PnL (skewed payoff / fat tails)
        for i in range(6):
            self.insert_trade(bot="Bot 4", timestamp=f"2026-10-18T10:{i:02d}:00", trade_id=f"C_W_{i}", action="EXIT", pnl="+₹1,000.00", is_positive=1)
        for i in range(14):
            self.insert_trade(bot="Bot 4", timestamp=f"2026-10-18T10:{i+10:02d}:00", trade_id=f"C_L_{i}", action="EXIT", pnl="-₹100.00", is_positive=0)

        perfC = get_rolling_bot_performance("Bot 4")
        self.assertAlmostEqual(perfC["win_rate"], 0.30, places=4)
        self.assertGreater(perfC["pnl"], 0)  # PnL = 6000 - 1400 = +4600
        self.assertEqual(perfC["perf_multiplier"], 1.0)  # Gated: cannot penalize if net PnL is positive!

    def test_exclusion_of_rms_pre_order_rejections(self):
        """9. RMS pre-order rejections must be strictly excluded from rolling window."""
        # 5 valid closed trades
        for i in range(5):
            self.insert_trade(
                bot="Bot 1",
                timestamp=f"2026-10-18T10:{i:02d}:00",
                trade_id=f"V_{i}",
                action="EXIT",
                pnl="+₹300.00",
                is_positive=1
            )

        # 5 RMS rejections
        for i in range(5):
            self.insert_trade(
                bot="Bot 1",
                timestamp=f"2026-10-18T10:{i+10:02d}:00",
                trade_id=f"RMS_T_{i}",
                order_id=f"RMS-REJECTED-{i}",
                mode="RMS_BLOCKED",
                broker="RMS Guard Engine",
                action="BUY",
                pnl="₹0.00",
                is_positive=0
            )

        trades = get_rolling_bot_trades("Bot 1")
        self.assertEqual(len(trades), 5)
        for t in trades:
            self.assertFalse(str(t.get("order_id", "")).startswith("RMS-"))
            self.assertNotEqual(t.get("mode"), "RMS_BLOCKED")

    def test_exclusion_of_initial_position_entries(self):
        """10. Initial entry orders (BUY/SELL with 0.00 PnL) must be excluded from completed trade window."""
        # 5 completed exits
        for i in range(5):
            self.insert_trade(
                bot="Bot 1",
                timestamp=f"2026-10-18T10:{i:02d}:00",
                trade_id=f"EXIT_{i}",
                action="EXIT",
                pnl="+₹450.00",
                is_positive=1
            )

        # 5 open position entries
        for i in range(5):
            self.insert_trade(
                bot="Bot 1",
                timestamp=f"2026-10-18T10:{i+10:02d}:00",
                trade_id=f"ENTRY_{i}",
                action="BUY",
                pnl="₹0.00",
                is_positive=1
            )

        trades = get_rolling_bot_trades("Bot 1")
        self.assertEqual(len(trades), 5)
        for t in trades:
            self.assertEqual(t["action"], "EXIT")

    def test_deduplication_of_duplicate_trade_ids(self):
        """11. Duplicate trade_id records are deduplicated, keeping the latest authoritative record."""
        # Recreate trade_memory without UNIQUE constraint to simulate unconstrained or legacy multi-fill tables
        conn = get_connection()
        try:
            conn.execute("DROP TABLE trade_memory")
            conn.execute("""
                CREATE TABLE trade_memory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    bot TEXT, symbol TEXT, action TEXT, pnl TEXT, is_positive INTEGER,
                    timestamp TEXT, trade_id TEXT, order_id TEXT, mode TEXT, broker TEXT,
                    qty INTEGER, price REAL, post_trade_analysis TEXT, provenance TEXT
                )
            """)
            conn.commit()
        finally:
            conn.close()

        # Insert initial record for TRD_100
        self.insert_trade(
            bot="Bot 1",
            timestamp="2026-10-18T10:00:00",
            trade_id="TRD_100",
            pnl="+₹200.00",
            is_positive=1
        )
        # Insert subsequent duplicate for TRD_100 with higher PnL and later timestamp
        self.insert_trade(
            bot="Bot 1",
            timestamp="2026-10-18T10:05:00",
            trade_id="TRD_100",
            pnl="+₹350.00",
            is_positive=1
        )

        trades = get_rolling_bot_trades("Bot 1")
        self.assertEqual(len(trades), 1)
        self.assertEqual(trades[0]["trade_id"], "TRD_100")
        self.assertEqual(trades[0]["timestamp"], "2026-10-18T10:05:00")
        pnl_val, _ = parse_trade_pnl(trades[0])
        self.assertEqual(pnl_val, 350.0)

    def test_master_brain_fleet_consensus_integration_and_telemetry(self):
        """12. MasterBrain fleet consensus attaches rolling_performance and applies perf_multiplier to effective weights."""
        # Bot 1: Strong recent performance (10 wins, 0 losses -> 1.15 multiplier)
        for i in range(10):
            self.insert_trade(
                bot="Bot 1",
                timestamp=f"2026-10-18T09:{i+10:02d}:00",
                trade_id=f"B1_W_{i}",
                action="EXIT",
                pnl="+₹500.00",
                is_positive=1
            )

        # Bot 2: Poor recent performance (1 win, 9 losses -> 0.85 multiplier)
        for i in range(1):
            self.insert_trade(
                bot="Bot 2",
                timestamp=f"2026-10-18T09:{i+10:02d}:00",
                trade_id=f"B2_W_{i}",
                action="EXIT",
                pnl="+₹100.00",
                is_positive=1
            )
        for i in range(9):
            self.insert_trade(
                bot="Bot 2",
                timestamp=f"2026-10-18T09:{i+20:02d}:00",
                trade_id=f"B2_L_{i}",
                action="EXIT",
                pnl="-₹400.00",
                is_positive=0
            )

        mb = MasterBrain({"min_quorum_score": 0.50, "market_regime_weighting": False})

        signals = [
            mb.normalize_signal(
                bot_id=1,
                symbol="NIFTY 50",
                action="BUY",
                confidence=0.80,
                entry=24500,
                stop_loss=24400,
                target=24800,
                risk_estimate=0.20
            ),
            mb.normalize_signal(
                bot_id=2,
                symbol="NIFTY 50",
                action="BUY",
                confidence=0.80,
                entry=24500,
                stop_loss=24400,
                target=24800,
                risk_estimate=0.20
            )
        ]

        consensus = mb.evaluate_fleet_consensus(
            symbol="NIFTY 50",
            signals=signals,
            market_regime="NEUTRAL"
        )

        self.assertEqual(consensus["decision"], ACTION_BUY)
        self.assertEqual(len(consensus["contributing_bots"]), 2)

        bot1_info = next(b for b in consensus["contributing_bots"] if b["bot_id"] == 1)
        bot2_info = next(b for b in consensus["contributing_bots"] if b["bot_id"] == 2)

        # Verify telemetry structure
        self.assertIn("rolling_performance", bot1_info)
        self.assertIn("rolling_performance", bot2_info)

        self.assertEqual(bot1_info["perf_multiplier"], 1.15)
        self.assertEqual(bot1_info["rolling_performance"]["total_trades"], 10)
        self.assertEqual(bot1_info["rolling_performance"]["win_rate"], 1.0)
        self.assertTrue(bot1_info["rolling_performance"]["sample_size_sufficient"])

        self.assertEqual(bot2_info["perf_multiplier"], 0.85)
        self.assertEqual(bot2_info["rolling_performance"]["total_trades"], 10)
        self.assertEqual(bot2_info["rolling_performance"]["win_rate"], 0.10)
        self.assertTrue(bot2_info["rolling_performance"]["sample_size_sufficient"])

        # Effective weight: Bot 1 should have noticeably higher weight than Bot 2 due to perf_multiplier and base_weight
        # (Bot 1 base_weight=1.2, Bot 2 base_weight=1.15, confidence=0.80, risk_estimate=0.20, regime_factor=1.0)
        self.assertGreater(bot1_info["effective_weight"], bot2_info["effective_weight"])
        ratio = bot1_info["effective_weight"] / bot2_info["effective_weight"]
        expected_ratio = (1.20 * 1.15) / (1.15 * 0.85)
        self.assertAlmostEqual(ratio, expected_ratio, places=2)

    def test_bot_identifier_variants(self):
        """13. Matches bot trades across numeric IDs, canonical names, and prefixed formats."""
        variants = [
            ("1", "TRD_NUMERIC"),
            ("Bot 1", "TRD_BOT_NUM"),
            ("bot_1", "TRD_UNDERSCORE"),
            ("Scalper Bot", "TRD_CANONICAL_NAME"),
            ("Bot 1: Scalper Bot", "TRD_PREFIXED")
        ]

        for i, (bot_str, tid) in enumerate(variants):
            self.insert_trade(
                bot=bot_str,
                timestamp=f"2026-10-18T10:{i+10:02d}:00",
                trade_id=tid,
                action="EXIT",
                pnl="+₹100.00",
                is_positive=1
            )

        trades = get_rolling_bot_trades(1, window_size=10)
        retrieved_ids = {t["trade_id"] for t in trades}
        for _, tid in variants:
            self.assertIn(tid, retrieved_ids)

    def test_symbol_scoped_filtering(self):
        """14. Scopes rolling trades to symbol when requested."""
        self.insert_trade(bot="Bot 1", symbol="NIFTY 50", trade_id="T_NIFTY", action="EXIT", pnl="+₹500.00")
        self.insert_trade(bot="Bot 1", symbol="BANKNIFTY", trade_id="T_BANK", action="EXIT", pnl="+₹600.00")

        nifty_trades = get_rolling_bot_trades("Bot 1", symbol="NIFTY 50")
        self.assertEqual(len(nifty_trades), 1)
        self.assertEqual(nifty_trades[0]["symbol"], "NIFTY 50")

        bank_trades = get_rolling_bot_trades("Bot 1", symbol="BANKNIFTY")
        self.assertEqual(len(bank_trades), 1)
        self.assertEqual(bank_trades[0]["symbol"], "BANKNIFTY")

    def test_backward_compatible_fallback(self):
        """15. Falls back to bot_performance_memory when 0 trades exist in trade_memory."""
        # Isolated DB has empty trade_memory
        # Update bot_performance_memory for Bot 1 directly
        conn = get_connection()
        try:
            cur = conn.cursor()
            cur.execute("""
                UPDATE bot_performance_memory
                SET win_rate = 75.0, total_trades = 20, winning_trades = 15, losing_trades = 5, pnl = 15000.0
                WHERE bot_id = 1
            """)
            conn.commit()
        finally:
            conn.close()

        perf = get_rolling_bot_performance(1)
        self.assertTrue(perf["is_fallback"])
        self.assertEqual(perf["total_trades"], 0)
        self.assertEqual(perf["perf_multiplier"], 1.0)  # Fix D: neutral 1.0 on zero rolling trades
        self.assertIsNotNone(perf["legacy_lifetime_performance"])
        self.assertEqual(perf["legacy_lifetime_performance"]["total_trades"], 20)
        self.assertAlmostEqual(perf["legacy_lifetime_performance"]["win_rate"], 0.75, places=2)

    def test_custom_rolling_window_configuration(self):
        """16. Configured rolling_window_size and min_rolling_sample_size are strictly honored."""
        # Insert 15 trades
        for i in range(15):
            self.insert_trade(
                bot="Bot 1",
                timestamp=f"2026-10-18T10:{i:02d}:00",
                trade_id=f"CW_{i}",
                action="EXIT",
                pnl="+₹100.00",
                is_positive=1
            )

        # Custom window size of 10
        perf_win10 = get_rolling_bot_performance("Bot 1", window_size=10)
        self.assertEqual(perf_win10["total_trades"], 10)
        self.assertEqual(perf_win10["window_size"], 10)

        # Custom min_samples of 12 -> 10 < 12, so sample_size_sufficient is False
        perf_min12 = get_rolling_bot_performance("Bot 1", window_size=10, min_samples=12)
        self.assertFalse(perf_min12["sample_size_sufficient"])
        self.assertEqual(perf_min12["perf_multiplier"], 1.0)


if __name__ == "__main__":
    unittest.main()
