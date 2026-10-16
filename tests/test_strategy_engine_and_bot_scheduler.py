"""
CHINTU AI TRADING SYSTEM - Strategy Engine, Bot Scheduler & Highest Profit Test Suite (Phase 5)
Verifies:
1. Mathematical accuracy of indicators (SMA, EMA, RSI, ATR, SuperTrend, MACD, Bollinger, Donchian, Keltner, VWAP, Camarilla, Ichimoku).
2. Authoritative Canonical Bot Registry consistency across all 14 bots.
3. Deterministic strategy evaluation for Bots 1-11.
4. Fail-closed DATA_UNAVAILABLE enforcement on Bots 12-14 without fabricating signals.
5. Bot worker lifecycle: data authenticity, candle buffer, signal deduplication, and paper execution.
6. Highest Profit Bot qualification gate (minimum 5 verified closed trades with regulatory charges).
7. FastAPI REST endpoints for bot registry, status, evaluation, and highest-profit.
"""

import unittest
import math
import os
import sys
import tempfile
import sqlite3
from datetime import datetime

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server.bot_registry import (
    CANONICAL_BOT_REGISTRY,
    get_all_canonical_bots,
    get_bot_by_id,
    get_bot_by_name,
    validate_bot_instrument
)
from server.strategy_engine import (
    calculate_sma,
    calculate_ema,
    calculate_rsi,
    calculate_atr,
    calculate_supertrend,
    calculate_macd,
    calculate_bollinger_bands,
    calculate_donchian_channel,
    calculate_keltner_channel,
    calculate_vwap,
    calculate_camarilla_pivots,
    calculate_ichimoku,
    evaluate_strategy
)
from server.bot_scheduler import BotWorker, BotScheduler
from server.highest_profit_bot import (
    calculate_regulatory_charges,
    evaluate_bot_trade_performance,
    parse_pnl_value,
    resolve_bot_id
)
from server import memory_db


def generate_mock_candles(count: int = 60, base_price: float = 24000.0, trend: float = 5.0):
    """Generates synthetic test OHLCV candles with deterministic upward/downward movement."""
    candles = []
    price = base_price
    for i in range(count):
        price += trend
        high = price + 15.0
        low = price - 10.0
        close = price + 5.0
        candles.append({
            "timestamp": f"2026-10-16 09:{i % 60:02d}:00",
            "open": price,
            "high": high,
            "low": low,
            "close": close,
            "volume": 1000.0 + (i * 10)
        })
    return candles


class TestIndicatorCalculations(unittest.TestCase):
    """Tests pure mathematical calculations of all technical indicators."""

    def test_sma_calculation(self):
        prices = [10.0, 20.0, 30.0, 40.0, 50.0]
        sma3 = calculate_sma(prices, 3)
        self.assertEqual(len(sma3), 3)
        self.assertAlmostEqual(sma3[0], 20.0)
        self.assertAlmostEqual(sma3[1], 30.0)
        self.assertAlmostEqual(sma3[2], 40.0)

    def test_ema_calculation(self):
        prices = [10.0, 11.0, 12.0, 13.0, 14.0, 15.0]
        ema3 = calculate_ema(prices, 3)
        self.assertEqual(len(ema3), 4)
        # First valid EMA is SMA of first 3 = (10+11+12)/3 = 11.0
        self.assertAlmostEqual(ema3[0], 11.0)
        # Next EMA = 13.0 * (2/4) + 11.0 * (1 - 0.5) = 6.5 + 5.5 = 12.0
        self.assertAlmostEqual(ema3[1], 12.0)

    def test_rsi_calculation_bounds(self):
        # Monotonically increasing prices -> RSI should be high (> 80)
        up_prices = [100.0 + i * 2.0 for i in range(30)]
        rsi_up = calculate_rsi(up_prices, 14)
        self.assertIsInstance(rsi_up, float)
        self.assertGreater(rsi_up, 80.0)
        self.assertLessEqual(rsi_up, 100.0)

        # Monotonically decreasing prices -> RSI should be low (< 20)
        down_prices = [200.0 - i * 2.0 for i in range(30)]
        rsi_down = calculate_rsi(down_prices, 14)
        self.assertIsInstance(rsi_down, float)
        self.assertLess(rsi_down, 20.0)
        self.assertGreaterEqual(rsi_down, 0.0)

    def test_atr_calculation(self):
        highs = [105.0 + i for i in range(25)]
        lows = [95.0 + i for i in range(25)]
        closes = [100.0 + i for i in range(25)]
        atr14 = calculate_atr(highs, lows, closes, 14)
        self.assertIsInstance(atr14, float)
        # Average True Range for 10-point bars with 1-point shifts is ~10.0
        self.assertAlmostEqual(atr14, 10.0, places=1)

    def test_bollinger_bands(self):
        prices = [100.0 + (i % 5) for i in range(30)]
        bb = calculate_bollinger_bands(prices, period=20, num_std=2.0)
        self.assertIn("upper", bb)
        self.assertIn("middle", bb)
        self.assertIn("lower", bb)
        self.assertGreater(bb["upper"], bb["middle"])
        self.assertGreater(bb["middle"], bb["lower"])
        self.assertTrue(0.0 <= bb["pct_b"] <= 1.0)

    def test_macd_calculation(self):
        prices = [100.0 + i * 1.5 for i in range(40)]
        macd_res = calculate_macd(prices, 12, 26, 9)
        self.assertIn("macd", macd_res)
        self.assertIn("signal", macd_res)
        self.assertIn("hist", macd_res)
        self.assertFalse(math.isnan(macd_res["macd"]))
        self.assertFalse(math.isnan(macd_res["signal"]))

    def test_supertrend_calculation(self):
        highs = [100.0 + i * 2.0 for i in range(30)]
        lows = [95.0 + i * 2.0 for i in range(30)]
        closes = [99.0 + i * 2.0 for i in range(30)]
        st = calculate_supertrend(highs, lows, closes, period=10, multiplier=2.0)
        self.assertIn("direction", st)
        self.assertIn("supertrend", st)
        self.assertEqual(st["direction"], "UP")

    def test_donchian_channel(self):
        highs = [50.0 + i for i in range(30)]
        lows = [40.0 + i for i in range(30)]
        dc = calculate_donchian_channel(highs, lows, 20)
        self.assertGreater(dc["upper"], dc["middle"])
        self.assertGreater(dc["middle"], dc["lower"])

    def test_keltner_channel(self):
        highs = [105.0 + i for i in range(30)]
        lows = [95.0 + i for i in range(30)]
        closes = [100.0 + i for i in range(30)]
        kc = calculate_keltner_channel(highs, lows, closes, ema_period=20, atr_period=10, multiplier=2.0)
        self.assertGreater(kc["upper"], kc["middle"])
        self.assertGreater(kc["middle"], kc["lower"])

    def test_vwap_calculation(self):
        highs = [100.0, 102.0, 104.0]
        lows = [98.0, 99.0, 101.0]
        closes = [99.0, 101.0, 103.0]
        volumes = [100.0, 200.0, 300.0]
        vwap_res = calculate_vwap(highs, lows, closes, volumes)
        self.assertIn("vwap", vwap_res)
        self.assertGreater(vwap_res["vwap"], 99.0)
        self.assertLess(vwap_res["vwap"], 104.0)

    def test_camarilla_pivots(self):
        pivots = calculate_camarilla_pivots(105.0, 95.0, 100.0)
        self.assertIn("h4", pivots)
        self.assertIn("h3", pivots)
        self.assertIn("l3", pivots)
        self.assertIn("l4", pivots)
        self.assertGreater(pivots["h4"], pivots["h3"])
        self.assertGreater(pivots["h3"], pivots["l3"])
        self.assertGreater(pivots["l3"], pivots["l4"])

    def test_ichimoku_calculation(self):
        highs = [100.0 + i for i in range(60)]
        lows = [90.0 + i for i in range(60)]
        ich = calculate_ichimoku(highs, lows)
        self.assertIn("tenkan", ich)
        self.assertIn("kijun", ich)
        self.assertIn("senkou_a", ich)
        self.assertIn("senkou_b", ich)
        self.assertGreater(ich["tenkan"], 0.0)


class TestCanonicalBotRegistry(unittest.TestCase):
    """Verifies single canonical registry of all 14 bots."""

    def test_all_14_bots_registered(self):
        bots = get_all_canonical_bots()
        self.assertEqual(len(bots), 14)
        for i in range(1, 15):
            self.assertIn(i, CANONICAL_BOT_REGISTRY)
            bot = get_bot_by_id(i)
            self.assertIsNotNone(bot)
            self.assertEqual(bot["id"], i)
            self.assertIn("name", bot)
            self.assertIn("asset", bot)
            self.assertIn("tradingsymbol", bot)
            self.assertIn("symboltoken", bot)
            self.assertIn("exchange", bot)
            self.assertIn("timeframe", bot)
            self.assertIn("lotsize", bot)
            self.assertIn("strategy_id", bot)
            self.assertIn("required_data", bot)
            self.assertIn("min_candles_required", bot)
            self.assertIn("risk_config", bot)

    def test_bot_instrument_validation(self):
        self.assertTrue(validate_bot_instrument(1, "NIFTY 50"))
        self.assertTrue(validate_bot_instrument(1, "NIFTY24OCTFUT"))
        self.assertFalse(validate_bot_instrument(1, "GOLD (XAUUSD)"))
        self.assertTrue(validate_bot_instrument(2, "BANKNIFTY"))
        self.assertTrue(validate_bot_instrument(8, "CRUDE OIL"))


class TestStrategyEngineEvaluation(unittest.TestCase):
    """Tests evaluation of bots using real math and fail-closed gates."""

    def test_bots_1_to_11_evaluation(self):
        candles = generate_mock_candles(60, base_price=24000.0, trend=10.0)
        for b_id in range(1, 12):
            res = evaluate_strategy(b_id, {"candles": candles})
            self.assertEqual(res["bot_id"], b_id)
            self.assertIn(res["decision"], ["BUY", "SELL", "HOLD"])
            self.assertEqual(res["status"], "DATA_READY")
            self.assertIn("indicators", res)
            self.assertIn("confidence", res)

    def test_bots_12_to_14_fail_closed_data_unavailable(self):
        candles = generate_mock_candles(60)
        for b_id in [12, 13, 14]:
            res = evaluate_strategy(b_id, {"candles": candles})
            self.assertEqual(res["bot_id"], b_id)
            self.assertEqual(res["decision"], "NO_TRADE")
            self.assertEqual(res["status"], "DATA_UNAVAILABLE")
            self.assertIn("currently unavailable", res["reason"])

    def test_insufficient_candle_data_rejected(self):
        candles = generate_mock_candles(10)  # Only 10 candles, minimum is >= 30
        res = evaluate_strategy(1, {"candles": candles})
        self.assertEqual(res["decision"], "NO_TRADE")
        self.assertEqual(res["status"], "INSUFFICIENT_DATA")

    def test_malformed_negative_prices_rejected(self):
        bad_candles = [
            {"timestamp": "2026-10-16 09:00:00", "open": -100, "high": 100, "low": 50, "close": -50, "volume": 100}
        ] * 40
        res = evaluate_strategy(1, {"candles": bad_candles})
        self.assertEqual(res["decision"], "NO_TRADE")
        self.assertEqual(res["status"], "INVALID_DATA")


class TestBotSchedulerAndWorker(unittest.TestCase):
    """Tests autonomous background worker lifecycle and deduplication."""

    def setUp(self):
        self.worker = BotWorker(1)

    def test_synthetic_data_rejected(self):
        synthetic_candle = {
            "timestamp": "2026-10-16 09:30:00",
            "open": 24500.0,
            "high": 24550.0,
            "low": 24480.0,
            "close": 24520.0,
            "volume": 1000,
            "is_synthetic": True
        }
        res = self.worker.ingest_candle(synthetic_candle, is_authentic=False)
        self.assertFalse(res)
        self.assertFalse(self.worker.data_healthy)

    def test_authentic_candles_ingestion_and_strategy_readiness(self):
        candles = generate_mock_candles(35)
        for c in candles:
            success = self.worker.ingest_candle(c, is_authentic=True)
            self.assertTrue(success)

        self.assertTrue(self.worker.data_healthy)
        self.assertTrue(self.worker.strategy_ready)
        self.assertEqual(len(self.worker.candles), 35)

    def test_signal_deduplication(self):
        candles = generate_mock_candles(40, trend=15.0)
        for c in candles:
            self.worker.ingest_candle(c, is_authentic=True)

        # First evaluation generates signal
        first_eval = self.worker.evaluate(execute_paper=True)
        self.assertIn(first_eval["decision"], ["BUY", "SELL", "HOLD"])

        if first_eval["decision"] in ["BUY", "SELL"]:
            # Second evaluation on same bar timestamp should be suppressed
            second_eval = self.worker.evaluate(execute_paper=True)
            self.assertEqual(second_eval["decision"], "NO_TRADE")
            self.assertEqual(second_eval["status"], "DUPLICATE_SUPPRESSED")

    def test_paper_execution_verification(self):
        candles = generate_mock_candles(40, trend=20.0)
        for c in candles:
            self.worker.ingest_candle(c, is_authentic=True)

        res = self.worker.evaluate(execute_paper=True)
        status = self.worker.get_status()
        self.assertTrue(status["registered"])
        self.assertTrue(status["data_healthy"])
        self.assertTrue(status["strategy_ready"])
        if res.get("decision") in ["BUY", "SELL"]:
            self.assertTrue(status["paper_execution_verified"])

    def test_scheduler_lifecycle(self):
        scheduler = BotScheduler()
        self.assertFalse(scheduler.is_running())
        scheduler.start()
        self.assertTrue(scheduler.is_running())
        statuses = scheduler.get_all_statuses()
        self.assertEqual(len(statuses), 14)
        for s in statuses:
            self.assertTrue(s["registered"])
            self.assertTrue(s["worker_running"])
        scheduler.stop()
        self.assertFalse(scheduler.is_running())


class TestHighestProfitBotSelector(unittest.TestCase):
    """Tests data-backed highest profit bot qualification and charge calculations."""

    def test_regulatory_charges_calculation(self):
        # 1 lot of NIFTY futures (~₹12,00,000 turnover round trip)
        charges_fut = calculate_regulatory_charges("NSE F&O Options", 1200000.0)
        self.assertGreater(charges_fut, 50.0)
        self.assertLess(charges_fut, 2500.0)

        # Equity turnover (~₹1,00,000)
        charges_eq = calculate_regulatory_charges("NSE Equity", 100000.0)
        self.assertGreater(charges_eq, 10.0)

    def test_pnl_string_parsing(self):
        self.assertEqual(parse_pnl_value("+₹1,245.50"), 1245.50)
        self.assertEqual(parse_pnl_value("-₹350.00"), -350.00)
        self.assertEqual(parse_pnl_value("₹500.00", is_positive=0), -500.00)
        self.assertEqual(parse_pnl_value(120.0), 120.0)

    def test_resolve_bot_id(self):
        self.assertEqual(resolve_bot_id("Scalper Bot"), 1)
        self.assertEqual(resolve_bot_id("Bot 1"), 1)
        self.assertEqual(resolve_bot_id("1"), 1)
        self.assertEqual(resolve_bot_id("EMA Trend Bot"), 2)
        self.assertEqual(resolve_bot_id("Unknown XYZ"), None)


class TestHighestProfitQualificationGate(unittest.TestCase):
    """Tests strict qualification gate (minimum 5 verified closed trades) in isolated DB."""

    def setUp(self):
        self.temp_db_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_db_path = self.temp_db_file.name
        self.temp_db_file.close()

        # Initialize schema in isolated temp DB
        conn = sqlite3.connect(self.temp_db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("""
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
        conn.commit()
        conn.close()

        # Monkeypatch memory_db.get_connection
        self._orig_get_conn = memory_db.get_connection

        def mock_conn():
            c = sqlite3.connect(self.temp_db_path)
            c.row_factory = sqlite3.Row
            return c

        import server.highest_profit_bot as hpb
        hpb.get_connection = mock_conn

    def tearDown(self):
        import server.highest_profit_bot as hpb
        hpb.get_connection = self._orig_get_conn
        if os.path.exists(self.temp_db_path):
            try:
                os.unlink(self.temp_db_path)
            except Exception:
                pass

    def test_insufficient_trades_yields_no_qualified_bot(self):
        # Insert only 3 trades for Bot 1 (below minimum 5)
        conn = sqlite3.connect(self.temp_db_path)
        for i in range(3):
            conn.execute("""
            INSERT INTO trade_memory (trade_id, bot, symbol, segment, action, qty, price, pnl, is_positive, mode)
            VALUES (?, 'Scalper Bot', 'NIFTY 50', 'NSE Equity', 'BUY', 50, 24000.0, '+₹1,500.00', 1, 'PAPER')
            """, (f"TRD_{i}",))
        conn.commit()
        conn.close()

        res = evaluate_bot_trade_performance()
        self.assertEqual(res["status"], "NO_QUALIFIED_BOT")
        self.assertFalse(res["qualified"])
        self.assertIsNone(res["highest_profit_bot"])
        self.assertIn("minimum 5 verified closed trades", res["reason"])

    def test_sufficient_profitable_trades_qualifies_winner(self):
        # Insert 6 profitable trades for Bot 1 (meets >= 5 threshold)
        conn = sqlite3.connect(self.temp_db_path)
        for i in range(6):
            conn.execute("""
            INSERT INTO trade_memory (trade_id, bot, symbol, segment, action, qty, price, pnl, is_positive, mode)
            VALUES (?, 'Scalper Bot', 'NIFTY 50', 'NSE Equity', 'BUY', 50, 24000.0, '+₹2,500.00', 1, 'PAPER')
            """, (f"TRD_QUAL_{i}",))
        conn.commit()
        conn.close()

        res = evaluate_bot_trade_performance()
        self.assertEqual(res["status"], "QUALIFIED")
        self.assertTrue(res["qualified"])
        self.assertIsNotNone(res["highest_profit_bot"])
        top = res["highest_profit_bot"]
        self.assertEqual(top["bot_id"], 1)
        self.assertEqual(top["bot_name"], "Scalper Bot")
        self.assertEqual(top["total_trades"], 6)
        self.assertEqual(top["winning_trades"], 6)
        self.assertGreater(top["net_pnl"], 0.0)


class TestFastAPIBotEndpoints(unittest.TestCase):
    """Tests FastAPI REST endpoints for bot registry, status, evaluation, and highest profit."""

    @classmethod
    def setUpClass(cls):
        from starlette.testclient import TestClient
        from server.python_stream_server import app
        cls.client = TestClient(app)

    def test_get_bot_registry_endpoint(self):
        response = self.client.get("/api/bots/registry")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(len(data["bots"]), 14)
        self.assertEqual(data["bots"][0]["name"], "Scalper Bot")

    def test_get_bot_status_endpoint(self):
        response = self.client.get("/api/bots/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(len(data["bots"]), 14)
        for b in data["bots"]:
            self.assertTrue(b["registered"])

    def test_post_evaluate_endpoint(self):
        response = self.client.post("/api/bots/evaluate", json={"bot_id": 1, "execute_paper": False})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("evaluation", data)
        self.assertEqual(data["evaluation"]["bot_id"], 1)

    def test_get_highest_profit_endpoint(self):
        response = self.client.get("/api/bots/highest-profit")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn(data["status"], ["QUALIFIED", "NO_QUALIFIED_BOT"])
        self.assertIn("bot_rankings", data)


if __name__ == "__main__":
    unittest.main()

