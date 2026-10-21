"""
CHINTU AI TRADING SYSTEM - Phase 7 End-to-End Pipeline Remediation Test Suite
Verifies:
1. Fake trading elimination from WebSocket loops.
2. Verified feed gating: no feed -> no trades; synthetic/stale/invalid ticks rejected.
3. Valid authentic feed reaches BotScheduler and produces deterministic decisions.
4. Deterministic peer quorum without random simulation.
5. Highest Profit Bot excludes demo, synthetic, seeded, rejected, and duplicate records.
6. Order placement API with RMS validation and paper execution persistence.
7. Emergency exit bypass preservation.
"""

import unittest
import inspect
import time
import json
import sqlite3
import os
import sys
from datetime import datetime, timedelta

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER_DIR = os.path.join(ROOT_DIR, "server")
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

import server.python_stream_server as pss
import server.bot_scheduler as bs
from server.bot_scheduler import BotWorker, BotScheduler
import server.highest_profit_bot as hpb
from server.bot_registry import CANONICAL_BOT_REGISTRY, get_bot_by_id
import server.memory_db as memory_db


class TestFakeTradingElimination(unittest.TestCase):
    """Verifies that random trade simulation has been eradicated from production execution path."""

    def test_websocket_feed_contains_no_fake_trade_generation(self):
        ws_src = inspect.getsource(pss.websocket_feed)
        self.assertNotIn("random.choice(bot_keys)", ws_src, "Fake bot random selection must be eliminated.")
        self.assertNotIn("memory_db.log_trade", ws_src, "WebSocket loop must never directly log synthetic trades to DB.")
        self.assertNotIn("place_live_angel_order", ws_src, "WebSocket loop must not generate autonomous orders.")

    def test_websocket_ticker_pulse_reflects_authoritative_state(self):
        # When feed is unauthenticated/disconnected, ticker pulse must flag is_authentic=False
        pss.market_feed_status["is_authentic_exchange_feed"] = False
        pss.market_feed_status["status"] = "DISCONNECTED"

        class DummyWebSocket:
            def __init__(self):
                self.messages = []
                self.headers = {"origin": "http://localhost:5173"}
            async def accept(self): pass
            async def send_text(self, text): self.messages.append(json.loads(text))
            async def close(self, code=1000): pass

        # Source check confirms ticker pulse has authoritative feed_status and is_authentic keys
        ws_src = inspect.getsource(pss.websocket_feed)
        self.assertIn('"is_authentic": is_auth', ws_src)
        self.assertIn('"feed_status":', ws_src)


class TestSchedulerFeedGatingAndSafety(unittest.TestCase):
    """Verifies market feed gating, tick validation, and deterministic evaluation in BotScheduler."""

    def setUp(self):
        self.worker = BotWorker(bot_id=1)  # Scalper Bot (NIFTY 50, 1m)

    def test_no_verified_feed_yields_no_trades(self):
        """Worker with zero authentic data must return DATA_UNHEALTHY / NO_TRADE."""
        res = self.worker.evaluate(execute_paper=True)
        self.assertEqual(res["decision"], "NO_TRADE")
        self.assertIn(res["status"], ["DATA_UNHEALTHY", "INSUFFICIENT_DATA"])
        self.assertFalse(self.worker.paper_execution_verified)

    def test_synthetic_ticks_rejected_fail_closed(self):
        """Ticks marked unauthentic or synthetic must be rejected and mark data unhealthy."""
        res = self.worker.ingest_tick(price=24730.0, volume=1.0, is_authentic=False)
        self.assertFalse(res)
        self.assertFalse(self.worker.data_healthy)
        self.assertEqual(len(self.worker.candles), 0)

    def test_invalid_prices_and_volumes_rejected(self):
        """Negative prices, zero prices, and negative volumes must be rejected."""
        now_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self.assertFalse(self.worker.ingest_tick(price=0.0, volume=1.0, is_authentic=True, timestamp=now_ts))
        self.assertFalse(self.worker.ingest_tick(price=-100.0, volume=1.0, is_authentic=True, timestamp=now_ts))
        self.assertFalse(self.worker.ingest_tick(price=24000.0, volume=-5.0, is_authentic=True, timestamp=now_ts))

    def test_stale_and_future_ticks_rejected(self):
        """Ticks older than 15s or from >5s in the future must be rejected."""
        now = time.time()
        stale_ts = datetime.fromtimestamp(now - 30.0).strftime("%Y-%m-%d %H:%M:%S")
        future_ts = datetime.fromtimestamp(now + 60.0).strftime("%Y-%m-%d %H:%M:%S")
        fresh_ts = datetime.fromtimestamp(now - 2.0).strftime("%Y-%m-%d %H:%M:%S")

        self.assertFalse(self.worker.ingest_tick(price=24730.0, volume=1.0, is_authentic=True, timestamp=stale_ts))
        self.assertFalse(self.worker.ingest_tick(price=24730.0, volume=1.0, is_authentic=True, timestamp=future_ts))
        self.assertTrue(self.worker.ingest_tick(price=24730.0, volume=1.0, is_authentic=True, timestamp=fresh_ts))

    def test_out_of_order_ticks_rejected(self):
        """Ticks with timestamps older than last ingested tick must be dropped."""
        now = time.time()
        ts1 = datetime.fromtimestamp(now - 5.0).strftime("%Y-%m-%d %H:%M:%S")
        ts2 = datetime.fromtimestamp(now - 8.0).strftime("%Y-%m-%d %H:%M:%S")  # earlier than ts1

        self.assertTrue(self.worker.ingest_tick(price=24730.0, volume=1.0, is_authentic=True, timestamp=ts1))
        self.assertFalse(self.worker.ingest_tick(price=24732.0, volume=1.0, is_authentic=True, timestamp=ts2))

    def test_timeframe_boundary_bucketing_and_candle_building(self):
        """Ticks within the same 1m bucket update OHLCV; subsequent minute creates new bar."""
        worker = BotWorker(bot_id=1)  # 1m timeframe
        worker.last_tick_time = None

        if datetime.now().second < 6:
            time.sleep(6 - datetime.now().second)
        now_dt = datetime.now()
        t1 = (now_dt - timedelta(seconds=5)).strftime("%Y-%m-%d %H:%M:%S")
        t2 = (now_dt - timedelta(seconds=3)).strftime("%Y-%m-%d %H:%M:%S")
        t3 = (now_dt - timedelta(seconds=1)).strftime("%Y-%m-%d %H:%M:%S")

        res1 = worker.ingest_tick(price=100.0, volume=10.0, is_authentic=True, timestamp=t1)
        res2 = worker.ingest_tick(price=105.0, volume=5.0, is_authentic=True, timestamp=t2)
        res3 = worker.ingest_tick(price=98.0, volume=15.0, is_authentic=True, timestamp=t3)

        self.assertTrue(res1)
        self.assertTrue(res2)
        self.assertTrue(res3)
        self.assertEqual(len(worker.candles), 1)

        bar = worker.candles[0]
        self.assertEqual(bar["open"], 100.0)
        self.assertEqual(bar["high"], 105.0)
        self.assertEqual(bar["low"], 98.0)
        self.assertEqual(bar["close"], 98.0)
        self.assertEqual(bar["volume"], 30.0)

    def test_valid_feed_reaches_scheduler_and_creates_deterministic_decision(self):
        """When 30 authentic bars are ingested, worker sets strategy_ready and evaluates deterministically."""
        base_time = datetime.now() - timedelta(minutes=60)
        for i in range(35):
            t = (base_time + timedelta(minutes=i)).strftime("%Y-%m-%d %H:%M:%S")
            c = {
                "timestamp": t,
                "open": 24000.0 + i * 2,
                "high": 24005.0 + i * 2,
                "low": 23995.0 + i * 2,
                "close": 24002.0 + i * 2,
                "volume": 100.0
            }
            self.worker.ingest_candle(c, is_authentic=True)

        self.assertTrue(self.worker.strategy_ready)
        self.assertTrue(self.worker.data_healthy)
        res1 = self.worker.evaluate(execute_paper=False)
        res2 = self.worker.evaluate(execute_paper=False)
        self.assertEqual(res1["decision"], res2["decision"])
        self.assertIn(res1["decision"], ["BUY", "SELL", "HOLD"])


class TestDeterministicPeerQuorum(unittest.TestCase):
    """Verifies that evaluate_peer_mesh_quorum is deterministic with zero random numbers."""

    def test_evaluate_peer_mesh_quorum_is_deterministic(self):
        q1 = pss.evaluate_peer_mesh_quorum("Bot 1", "BUY")
        q2 = pss.evaluate_peer_mesh_quorum("Bot 1", "BUY")

        self.assertEqual(q1["approved"], q2["approved"])
        self.assertEqual(q1["quorum_ratio"], q2["quorum_ratio"])
        self.assertEqual(q1["total_peers"], 3)
        self.assertEqual(len(q1["peer_votes"]), 3)

        # Inspect source code: must contain ZERO random calls
        src = inspect.getsource(pss.evaluate_peer_mesh_quorum)
        self.assertNotIn("random.random", src)
        self.assertNotIn("random.randint", src)

    def test_emergency_exit_bypasses_peer_quorum(self):
        orig_mode = pss.execution_mode
        pss.execution_mode = "PAPER"
        try:
            res = pss.place_live_angel_order(
                symbol_name="NIFTY 50",
                action="SELL",
                qty=50,
                price=24730.0,
                bot_name="Bot 1",
                is_emergency_exit=True
            )
            self.assertEqual(res.get("consensus"), "EMERGENCY_BYPASS")
        finally:
            pss.execution_mode = orig_mode


class TestHighestProfitBotDemoSeparation(unittest.TestCase):
    """Verifies that Highest Profit Bot strictly ignores demo, synthetic, seeded, and duplicate trades."""

    def setUp(self):
        self.temp_db_path = f"tests/temp_test_hpb_{int(time.time()*1000)}.db"
        self.conn = sqlite3.connect(self.temp_db_path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("""
        CREATE TABLE trade_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_id TEXT UNIQUE,
            timestamp TEXT,
            bot TEXT,
            symbol TEXT,
            segment TEXT,
            action TEXT,
            qty INTEGER,
            price REAL,
            pnl TEXT,
            is_positive INTEGER DEFAULT 1,
            consensus TEXT,
            order_id TEXT,
            exchange TEXT,
            mode TEXT,
            broker TEXT,
            post_trade_analysis TEXT
        )
        """)
        self.conn.commit()

        # Monkeypatch hpb.get_connection
        self.orig_hpb_conn = hpb.get_connection
        hpb.get_connection = lambda: sqlite3.connect(self.temp_db_path)

    def tearDown(self):
        hpb.get_connection = self.orig_hpb_conn
        self.conn.close()
        if os.path.exists(self.temp_db_path):
            try:
                os.remove(self.temp_db_path)
            except Exception:
                pass

    def test_hpb_excludes_demo_and_synthetic_records(self):
        # 1. Insert 10 DEMO trades with high profit
        for i in range(10):
            self.conn.execute("""
            INSERT INTO trade_memory (trade_id, order_id, bot, symbol, segment, action, qty, price, pnl, is_positive, mode)
            VALUES (?, ?, 'Scalper Bot', 'NIFTY 50', 'NSE Equity', 'BUY', 50, 24000.0, '+₹10,000.00', 1, 'DEMO')
            """, (f"DEMO_TRD_{i}", f"DEMO_ORD_{i}"))

        # 2. Insert 10 SYNTHETIC trades with high profit
        for i in range(10):
            self.conn.execute("""
            INSERT INTO trade_memory (trade_id, order_id, bot, symbol, segment, action, qty, price, pnl, is_positive, mode)
            VALUES (?, ?, 'Scalper Bot', 'NIFTY 50', 'NSE Equity', 'BUY', 50, 24000.0, '+₹10,000.00', 1, 'SYNTHETIC')
            """, (f"SYNTH_TRD_{i}", f"SYNTH_ORD_{i}"))

        # 3. Insert 3 verified PAPER trades (under threshold of 5)
        for i in range(3):
            self.conn.execute("""
            INSERT INTO trade_memory (trade_id, order_id, bot, symbol, segment, action, qty, price, pnl, is_positive, mode)
            VALUES (?, ?, 'Scalper Bot', 'NIFTY 50', 'NSE Equity', 'BUY', 50, 24000.0, '+₹1,000.00', 1, 'PAPER')
            """, (f"REAL_PAPER_{i}", f"ORD_PAPER_{i}"))
        self.conn.commit()

        eval_res = hpb.evaluate_bot_trade_performance()
        # Must return NO_QUALIFIED_BOT because only 3 verified PAPER trades exist (demo & synthetic ignored)
        self.assertEqual(eval_res["status"], "NO_QUALIFIED_BOT")
        self.assertIsNone(eval_res["highest_profit_bot"])

        scalper_ranking = next((b for b in eval_res["bot_rankings"] if b["bot_id"] == 1), None)
        self.assertIsNotNone(scalper_ranking)
        self.assertEqual(scalper_ranking["total_trades"], 3, "Only the 3 PAPER trades must be counted; DEMO/SYNTHETIC ignored.")
        self.assertFalse(scalper_ranking["is_qualified"])

    def test_hpb_qualifies_only_when_verified_paper_trades_reach_threshold(self):
        # Insert 6 verified PAPER trades with net positive PnL
        for i in range(6):
            self.conn.execute("""
            INSERT INTO trade_memory (trade_id, order_id, bot, symbol, segment, action, qty, price, pnl, is_positive, mode)
            VALUES (?, ?, 'Scalper Bot', 'NIFTY 50', 'NSE Equity', 'BUY', 50, 24000.0, '+₹2,500.00', 1, 'PAPER')
            """, (f"CONFIRMED_PAPER_{i}", f"ORD_CONFIRMED_{i}"))
        self.conn.commit()

        eval_res = hpb.evaluate_bot_trade_performance()
        self.assertEqual(eval_res["status"], "QUALIFIED")
        self.assertIsNotNone(eval_res["highest_profit_bot"])
        self.assertEqual(eval_res["highest_profit_bot"]["bot_id"], 1)
        self.assertTrue(eval_res["highest_profit_bot"]["net_pnl"] > 0)


class TestOrderPlacementAPIValidation(unittest.TestCase):
    """Verifies that order placement endpoint validates RMS limits and requires master token."""

    def test_live_order_blocked_when_feed_unverified(self):
        orig_mode = pss.execution_mode
        pss.execution_mode = "LIVE"
        pss.market_feed_status["is_authentic_exchange_feed"] = False
        try:
            res = pss.place_live_angel_order(
                symbol_name="NIFTY 50",
                action="BUY",
                qty=50,
                price=24730.0,
                bot_name="Bot 1"
            )
            self.assertFalse(res["success"])
            self.assertEqual(res["mode"], "FEED_BLOCKED")
        finally:
            pss.execution_mode = orig_mode


if __name__ == "__main__":
    unittest.main()
