"""
TRADING JARVIS WORKSTATION — PHASE 8.3 STAGE 4.1 TEST SUITE
Controlled Data-Integrity Remediation & Regression Tests

Verifies all 4 remediation items:
  Fix A: Reject ambiguous date-less timestamps (sentinel 0.0, excluded from calibration).
  Fix B: Exclude synthetic replay, synthetic simulation, telemetry test, and malformed provenance.
  Fix C: Exact bot-ID matching eliminates substring collisions (Bot 1 vs Bot 10-14).
  Fix D: Safe no-trade fallback guarantees neutral multiplier (1.0) on zero/invalid rolling history.
"""

import os
import sys
import time
import tempfile
import unittest
import sqlite3
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

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


class BasePhase83Stage41TestCase(unittest.TestCase):
    """Provides isolated temporary SQLite database for each test, ensuring zero production mutation."""

    def setUp(self):
        self.temp_db_fd, self.temp_db_path = tempfile.mkstemp(suffix="_phase8_3_stage4_1.db")
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


class TestPhase83Stage41Remediation(BasePhase83Stage41TestCase):
    """Rigorous invariant tests for the 4 Stage 4.1 remediation fixes."""

    # -------------------------------------------------------------------------
    # Fix A: Reject ambiguous date-less timestamps
    # -------------------------------------------------------------------------
    def test_dateless_timestamps_strictly_rejected(self):
        """Fix A.1: Time-only strings (HH:MM:SS, HH:MM:SS.mmm) must return sentinel 0.0."""
        self.assertEqual(parse_trade_timestamp_epoch("12:12:37.470"), 0.0)
        self.assertEqual(parse_trade_timestamp_epoch("19:49:40.319"), 0.0)
        self.assertEqual(parse_trade_timestamp_epoch("09:15:00"), 0.0)
        self.assertEqual(parse_trade_timestamp_epoch("23:59:59.999"), 0.0)
        self.assertEqual(parse_trade_timestamp_epoch(""), 0.0)
        self.assertEqual(parse_trade_timestamp_epoch(None), 0.0)
        self.assertEqual(parse_trade_timestamp_epoch("INVALID_STRING"), 0.0)

    def test_valid_dated_timestamps_and_epoch_ranges(self):
        """Fix A.2: Valid ISO datetimes, space datetimes, and epoch numbers parse accurately."""
        # ISO with 'T'
        ts_iso = parse_trade_timestamp_epoch("2026-10-18T10:00:00")
        self.assertGreater(ts_iso, 1700000000.0)

        # Space separated
        ts_space = parse_trade_timestamp_epoch("2026-10-18 10:00:00.123")
        self.assertGreater(ts_space, 1700000000.0)

        # ISO with 'Z'
        ts_utc = parse_trade_timestamp_epoch("2026-10-18T10:00:00Z")
        self.assertGreater(ts_utc, 1700000000.0)

        # Epoch seconds (realistic trading range >= year 2000)
        self.assertEqual(parse_trade_timestamp_epoch(1729245120.0), 1729245120.0)

        # Epoch milliseconds (> 1e11) scaled to seconds
        self.assertEqual(parse_trade_timestamp_epoch(1729245120000.0), 1729245120.0)

        # Pre-2000 or negative epochs rejected
        self.assertEqual(parse_trade_timestamp_epoch(0.0), 0.0)
        self.assertEqual(parse_trade_timestamp_epoch(-1000.0), 0.0)
        self.assertEqual(parse_trade_timestamp_epoch(86400.0), 0.0)  # Day 1 in 1970

    def test_invalid_and_dateless_timestamps_never_enter_rolling_window(self):
        """Fix A.3: Date-less and invalid timestamp records are strictly excluded from rolling window."""
        # 5 trades with date-less timestamps (simulating rows 1-288)
        for i in range(5):
            self.insert_trade(
                bot="Bot 1",
                timestamp=f"12:{i+10:02d}:30.500",
                trade_id=f"DATELESS_{i}",
                action="EXIT",
                pnl="+₹500.00",
                is_positive=1
            )

        # 3 trades with valid calendar dates
        for i in range(3):
            self.insert_trade(
                bot="Bot 1",
                timestamp=f"2026-10-18T10:{i+10:02d}:00",
                trade_id=f"VALID_{i}",
                action="EXIT",
                pnl="+₹500.00",
                is_positive=1
            )

        trades = get_rolling_bot_trades("Bot 1")
        # Must contain ONLY the 3 valid dated trades; the 5 date-less records are excluded
        self.assertEqual(len(trades), 3)
        retrieved_ids = [t["trade_id"] for t in trades]
        self.assertEqual(retrieved_ids, ["VALID_2", "VALID_1", "VALID_0"])

        perf = get_rolling_bot_performance("Bot 1", min_samples=5)
        self.assertEqual(perf["total_trades"], 3)
        self.assertFalse(perf["sample_size_sufficient"])  # 3 < 5
        self.assertEqual(perf["perf_multiplier"], 1.0)  # Neutral, not boosted by the 5 dateless wins!

    # -------------------------------------------------------------------------
    # Fix B: Exclude synthetic replay and simulation provenance
    # -------------------------------------------------------------------------
    def test_synthetic_replay_and_simulation_excluded(self):
        """Fix B.1: Synthetic replays (+420, +85, +150 targets) and simulations are strictly excluded."""
        # 5 synthetic replay trades (deterministic offline bench replays)
        for i, target in enumerate([420.0, 85.0, 150.0, 120.0, 420.0]):
            self.insert_trade(
                bot="Bot 5",
                timestamp=f"2026-10-18T10:{i:02d}:00",
                trade_id=f"REPLAY_{i}",
                action="EXIT",
                pnl=f"+₹{target:.2f}",
                is_positive=1
            )

        # 3 synthetic simulation trades with explicit tag
        for i in range(3):
            self.insert_trade(
                bot="Bot 5",
                timestamp=f"2026-10-18T10:{i+10:02d}:00",
                trade_id=f"SIM_{i}",
                action="EXIT",
                pnl="+₹300.00",
                is_positive=1,
                provenance=PROVENANCE_SYNTHETIC_SIMULATION
            )

        # 5 valid authentic paper trades (distinct non-replay PnLs)
        for i in range(5):
            self.insert_trade(
                bot="Bot 5",
                timestamp=f"2026-10-18T11:{i:02d}:00",
                trade_id=f"AUTH_{i}",
                action="EXIT",
                pnl="+₹735.00",
                is_positive=1
            )

        trades = get_rolling_bot_trades("Bot 5")
        # Only the 5 authentic trades must be selected; all 8 synthetic records excluded
        self.assertEqual(len(trades), 5)
        for t in trades:
            self.assertTrue(t["trade_id"].startswith("AUTH_"))

        perf = get_rolling_bot_performance("Bot 5", min_samples=5)
        self.assertEqual(perf["total_trades"], 5)
        self.assertEqual(perf["winning_trades"], 5)
        self.assertEqual(perf["perf_multiplier"], 1.15)

    def test_unknown_and_malformed_provenance_conservative_exclusion(self):
        """Fix B.2: Explicit malformed or UNKNOWN_PROVENANCE tags cannot masquerade as authentic."""
        self.insert_trade(
            bot="Bot 1",
            timestamp="2026-10-18T10:00:00",
            trade_id="T_MALFORMED",
            provenance="CORRUPT_UNKNOWN_TAG"
        )
        self.insert_trade(
            bot="Bot 1",
            timestamp="2026-10-18T10:01:00",
            trade_id="T_EXPLICIT_UNKNOWN",
            provenance=PROVENANCE_UNKNOWN
        )
        self.insert_trade(
            bot="Bot 1",
            timestamp="2026-10-18T10:02:00",
            trade_id="T_VALID",
            pnl="+₹500.00",
            is_positive=1
        )

        trades = get_rolling_bot_trades("Bot 1")
        self.assertEqual(len(trades), 1)
        self.assertEqual(trades[0]["trade_id"], "T_VALID")

    # -------------------------------------------------------------------------
    # Fix C: Exact bot-ID matching eliminates substring collisions
    # -------------------------------------------------------------------------
    def test_exact_bot_id_matching_no_prefix_collision(self):
        """Fix C.1: Bot 1 must never match Bot 10, Bot 11, Bot 12, Bot 13, or Bot 14."""
        negative_bot_strings = [
            "Bot 10", "bot 10", "bot_10", "Bot 10: Pivot Point Reversal", "Pivot Point Reversal",
            "Bot 11", "bot 11", "bot_11", "Bot 11: Multi-Timeframe Confluence",
            "Bot 12", "bot 12", "bot_12", "Bot 12: Options Gamma Scalper", "Options Gamma Scalper",
            "Bot 13", "bot 13", "bot_13", "Order Flow Imbalance",
            "Bot 14", "bot 14", "bot_14", "Risk Neutral Delta Hedger"
        ]

        for bot_str in negative_bot_strings:
            rec = {"bot": bot_str}
            self.assertFalse(
                is_trade_for_bot(rec, 1),
                f"Collision detected: Bot 1 matched '{bot_str}'!"
            )

        # Database integration test: insert winning trades for Bot 10
        for i in range(10):
            self.insert_trade(
                bot="Bot 10",
                timestamp=f"2026-10-18T10:{i:02d}:00",
                trade_id=f"B10_{i}",
                action="EXIT",
                pnl="+₹500.00",
                is_positive=1
            )

        # Querying Bot 1 must yield 0 trades (not 10!)
        trades_b1 = get_rolling_bot_trades(1)
        self.assertEqual(len(trades_b1), 0)

        # Querying Bot 10 must yield all 10 trades
        trades_b10 = get_rolling_bot_trades(10)
        self.assertEqual(len(trades_b10), 10)

    def test_legitimate_canonical_names_and_aliases_match(self):
        """Fix C.2: Legitimate numeric IDs, canonical names, and documented aliases match correctly."""
        positive_bot1_strings = [
            "1", "Bot 1", "bot 1", "bot_1",
            "Bot 1: Scalper Bot", "Bot 1 (Scalper Bot)",
            "Scalper Bot", "bot 1 - scalper"
        ]

        for bot_str in positive_bot1_strings:
            rec = {"bot": bot_str}
            self.assertTrue(
                is_trade_for_bot(rec, 1),
                f"Legitimate alias failed to match: '{bot_str}' for Bot 1"
            )

        # String target "Scalper Bot" or "Bot 1" also matches
        self.assertTrue(is_trade_for_bot({"bot": "Bot 1"}, "Scalper Bot"))
        self.assertTrue(is_trade_for_bot({"bot": "Scalper Bot"}, "Bot 1"))

    # -------------------------------------------------------------------------
    # Fix D: Safe no-trade fallback
    # -------------------------------------------------------------------------
    def test_empty_rolling_history_returns_neutral_multiplier(self):
        """Fix D.1: Zero rolling trades guarantees neutral multiplier 1.0 (no lifetime boost)."""
        # Populate bot_performance_memory with inflated lifetime statistics (80% win rate, +50,000 PnL)
        conn = get_connection()
        try:
            cur = conn.cursor()
            cur.execute("""
                UPDATE bot_performance_memory
                SET win_rate = 80.0, total_trades = 50, winning_trades = 40, losing_trades = 10, pnl = 50000.0
                WHERE bot_id = 1
            """)
            conn.commit()
        finally:
            conn.close()

        # trade_memory has ZERO trades for Bot 1
        perf = get_rolling_bot_performance(1)
        self.assertEqual(perf["total_trades"], 0)
        self.assertEqual(perf["perf_multiplier"], 1.0)  # MUST BE NEUTRAL 1.0!
        self.assertFalse(perf["sample_size_sufficient"])
        self.assertTrue(perf["is_fallback"])

        # Legacy stats are exposed for telemetry only
        self.assertIsNotNone(perf["legacy_lifetime_performance"])
        self.assertEqual(perf["legacy_lifetime_performance"]["total_trades"], 50)
        self.assertAlmostEqual(perf["legacy_lifetime_performance"]["win_rate"], 0.80, places=2)

    def test_invalid_only_rolling_history_returns_neutral_multiplier(self):
        """Fix D.2: If all recorded trades are date-less or synthetic, multiplier remains strictly 1.0."""
        # Insert 10 date-less trades
        for i in range(10):
            self.insert_trade(
                bot="Bot 10",
                timestamp=f"12:{i+10:02d}:00",
                trade_id=f"DL_{i}",
                pnl="+₹420.00",
                is_positive=1
            )

        perf = get_rolling_bot_performance(10)
        # All 10 trades were rejected due to date-less timestamps
        self.assertEqual(perf["total_trades"], 0)
        self.assertEqual(perf["perf_multiplier"], 1.0)  # Neutral 1.0

    # -------------------------------------------------------------------------
    # Deterministic Window Selection & Anti-Lookahead
    # -------------------------------------------------------------------------
    def test_valid_rolling_history_deterministically_selects_window(self):
        """Fix A/B/C/D Integration: Valid history selects latest 20 trades deterministically."""
        for i in range(1, 26):
            self.insert_trade(
                bot="Bot 1",
                timestamp=f"2026-10-18T10:{i:02d}:00",
                trade_id=f"T_{i:02d}",
                action="EXIT",
                pnl="+₹100.00",
                is_positive=1
            )

        trades = get_rolling_bot_trades(1, window_size=20)
        self.assertEqual(len(trades), 20)
        self.assertEqual(trades[0]["trade_id"], "T_25")
        self.assertEqual(trades[-1]["trade_id"], "T_06")

    def test_anti_lookahead_behavior_intact(self):
        """Anti-lookahead cutoff excludes trades after the evaluation point."""
        self.insert_trade(bot="Bot 1", timestamp="2026-10-18T10:00:00", trade_id="T_01", pnl="+₹100.00")
        self.insert_trade(bot="Bot 1", timestamp="2026-10-18T10:10:00", trade_id="T_02", pnl="+₹100.00")
        self.insert_trade(bot="Bot 1", timestamp="2026-10-18T10:20:00", trade_id="T_03", pnl="+₹100.00")

        trades = get_rolling_bot_trades(1, before_timestamp="2026-10-18T10:15:00")
        self.assertEqual(len(trades), 2)
        retrieved_ids = [t["trade_id"] for t in trades]
        self.assertEqual(retrieved_ids, ["T_02", "T_01"])

    def test_master_brain_consensus_uses_neutral_multiplier_on_no_rolling_history(self):
        """MasterBrain evaluate_fleet_consensus uses 1.0 when bot has no rolling trades."""
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
            )
        ]

        # trade_memory is completely empty
        consensus = mb.evaluate_fleet_consensus("NIFTY 50", signals, market_regime="NEUTRAL")
        bot1_info = consensus["contributing_bots"][0]
        self.assertEqual(bot1_info["perf_multiplier"], 1.0)
        self.assertIn("rolling_performance", bot1_info)
        self.assertEqual(bot1_info["rolling_performance"]["total_trades"], 0)
        self.assertEqual(bot1_info["rolling_performance"]["perf_multiplier"], 1.0)


if __name__ == "__main__":
    unittest.main()

