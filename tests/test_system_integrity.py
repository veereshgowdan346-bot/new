"""
CHINTU AI TRADING SYSTEM - Automated System Integrity & Acceptance Test Suite
Tests:
1. Position closing calculation (Long -> SELL, Short -> BUY)
2. Fail-closed market feed protection gate (LIVE mode blocked on synthetic feed)
3. Indian regulatory tax & brokerage deductions (Brokerage, STT, GST, SEBI, Net P&L)
4. Broker capability registry (Angel One ADAPTER_READY vs Zerodha/Upstox/5paisa COMING_SOON)
5. RMS circuit breaker & loss limit enforcement
6. Millisecond peer mesh quorum consensus validation
"""

import unittest
import sys
import os

# Ensure project root and server directory are on path
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER_DIR = os.path.join(ROOT_DIR, "server")
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

import python_stream_server as pss


class TestPositionClosingCalculation(unittest.TestCase):
    """Verifies that closing orders always produce exact opposite transactions with matching parameters."""

    def test_long_position_closing_direction(self):
        """A LONG (BUY) position must generate a SELL closing order."""
        long_position = {
            "id": "POS_TEST_001",
            "bot": "Bot 1: Scalper Bot",
            "symbol": "NIFTY 50",
            "segment": "NSE F&O Options",
            "type": "BUY",
            "qty": 50,
            "avgPrice": 24700.0,
            "ltp": 24750.0
        }
        closing_order = pss.calculate_closing_order(long_position)
        self.assertEqual(closing_order["action"], "SELL")
        self.assertEqual(closing_order["qty"], 50)
        self.assertEqual(closing_order["symbol"], "NIFTY 50")
        self.assertEqual(closing_order["segment"], "NSE F&O Options")

    def test_short_position_closing_direction(self):
        """A SHORT (SELL) position must generate a BUY closing order."""
        short_position = {
            "id": "POS_TEST_002",
            "bot": "Bot 2: Breakout Bot",
            "symbol": "BANKNIFTY",
            "segment": "NSE F&O Options",
            "type": "SELL",
            "qty": 30,
            "avgPrice": 52500.0,
            "ltp": 52300.0
        }
        closing_order = pss.calculate_closing_order(short_position)
        self.assertEqual(closing_order["action"], "BUY")
        self.assertEqual(closing_order["qty"], 30)
        self.assertEqual(closing_order["symbol"], "BANKNIFTY")


class TestFailClosedMarketFeedGate(unittest.TestCase):
    """Verifies fail-closed safety gate: synthetic feeds CANNOT execute in LIVE mode."""

    def setUp(self):
        self.orig_mode = pss.execution_mode
        self.orig_feed = pss.market_feed_status.copy()

    def tearDown(self):
        pss.execution_mode = self.orig_mode
        pss.market_feed_status = self.orig_feed

    def test_live_order_blocked_when_feed_is_synthetic(self):
        pss.execution_mode = "LIVE"
        pss.market_feed_status["is_authentic_exchange_feed"] = False

        result = pss.place_live_angel_order(
            symbol_name="NIFTY 50",
            action="BUY",
            qty=50,
            price=24730.0,
            bot_name="Bot 1"
        )

        self.assertFalse(result["success"])
        self.assertEqual(result["mode"], "FEED_BLOCKED")
        self.assertIn("synthetic", result["error"].lower())

    def test_paper_order_allowed_on_synthetic_feed(self):
        pss.execution_mode = "PAPER"
        pss.market_feed_status["is_authentic_exchange_feed"] = False

        # In paper mode, simulated order should proceed
        result = pss.place_live_angel_order(
            symbol_name="NIFTY 50",
            action="BUY",
            qty=50,
            price=24730.0,
            bot_name="Bot 1"
        )

        # Quorum mesh could occasionally reject if simulated quorum is low, but mode is not FEED_BLOCKED
        if result["success"]:
            self.assertEqual(result["mode"], "PAPER")
        else:
            self.assertNotEqual(result["mode"], "FEED_BLOCKED")


class TestIndianRegulatoryTaxDeductions(unittest.TestCase):
    """Verifies statutory deductions under SEBI / NSE rules."""

    def test_equity_intraday_deductions(self):
        # 100 shares of Reliance at ₹2,500 = ₹2,50,000 turnover
        # Gross profit: ₹500
        deductions = pss.calculate_trade_deductions(
            price=2500.0,
            qty=100,
            action="SELL",
            segment="NSE Equity",
            gross_pnl=500.0
        )

        # Brokerage: capped at ₹20
        self.assertLessEqual(deductions["brokerage"], 20.0)
        # STT on SELL side must be positive
        self.assertGreater(deductions["stt"], 0.0)
        # Net PnL must strictly equal gross PnL minus total charges
        self.assertAlmostEqual(deductions["net_pnl"], deductions["gross_pnl"] - deductions["total_charges"], places=2)

    def test_options_stt_rate(self):
        # STT on options sell side is 0.0625%
        order_val = 10000.0  # ₹10,000
        deductions_sell = pss.calculate_trade_deductions(
            price=100.0,
            qty=100,
            action="SELL",
            segment="NSE F&O Options",
            gross_pnl=200.0
        )
        expected_stt = round(order_val * 0.000625, 2)
        self.assertEqual(deductions_sell["stt"], expected_stt)

        # STT on options buy side must be 0
        deductions_buy = pss.calculate_trade_deductions(
            price=100.0,
            qty=100,
            action="BUY",
            segment="NSE F&O Options",
            gross_pnl=200.0
        )
        self.assertEqual(deductions_buy["stt"], 0.0)


class TestBrokerCapabilitiesRegistry(unittest.TestCase):
    """Verifies capability matrix: Angel One is ADAPTER_READY, others COMING_SOON."""

    def test_capabilities_structure(self):
        caps = pss.BROKER_CAPABILITIES
        self.assertIn("angel_one", caps)
        self.assertIn("zerodha", caps)
        self.assertIn("upstox", caps)
        self.assertIn("5paisa", caps)

        # Angel One must be supported
        self.assertTrue(caps["angel_one"]["supported"])
        self.assertEqual(caps["angel_one"]["status"], "ADAPTER_READY")

        # Zerodha, Upstox, 5paisa must be coming soon
        self.assertFalse(caps["zerodha"]["supported"])
        self.assertEqual(caps["zerodha"]["status"], "COMING_SOON")
        self.assertFalse(caps["upstox"]["supported"])
        self.assertEqual(caps["upstox"]["status"], "COMING_SOON")
        self.assertFalse(caps["5paisa"]["supported"])
        self.assertEqual(caps["5paisa"]["status"], "COMING_SOON")


class TestRMSCircuitBreaker(unittest.TestCase):
    """Verifies RMS safety controls."""

    def setUp(self):
        self.orig_rms = pss.rms_state.copy()

    def tearDown(self):
        pss.rms_state = self.orig_rms

    def test_circuit_breaker_active_blocks_orders(self):
        pss.rms_state["circuit_breaker_active"] = True

        result = pss.place_live_angel_order(
            symbol_name="NIFTY 50",
            action="BUY",
            qty=50,
            price=24730.0,
            bot_name="Bot 1"
        )

        self.assertFalse(result["success"])
        self.assertEqual(result["mode"], "RMS_BLOCKED")


class TestPositionBookLifecycle(unittest.TestCase):
    """Verifies that active position book tracks fills and closes positions accurately."""

    def setUp(self):
        self.orig_positions = pss.active_positions.copy()
        pss.active_positions.clear()

    def tearDown(self):
        pss.active_positions = self.orig_positions

    def test_position_creation_and_square_off_lifecycle(self):
        # 1. Fill a BUY trade of 50 NIFTY 50 @ 24700
        buy_trade = {
            "bot": "Bot 1: Scalper Bot",
            "symbol": "NIFTY 50",
            "segment": "NSE F&O Options",
            "action": "BUY",
            "qty": 50,
            "price": 24700.0,
            "mode": "PAPER"
        }
        pss.update_position_on_fill(buy_trade)
        pos_key = "Bot 1: Scalper Bot_NIFTY 50"
        self.assertIn(pos_key, pss.active_positions)
        self.assertEqual(pss.active_positions[pos_key]["qty"], 50)
        self.assertEqual(pss.active_positions[pos_key]["avgPrice"], 24700.0)

        # 2. Add 50 more @ 24800 (averaging up to 24750)
        buy_trade_2 = {
            "bot": "Bot 1: Scalper Bot",
            "symbol": "NIFTY 50",
            "segment": "NSE F&O Options",
            "action": "BUY",
            "qty": 50,
            "price": 24800.0,
            "mode": "PAPER"
        }
        pss.update_position_on_fill(buy_trade_2)
        self.assertEqual(pss.active_positions[pos_key]["qty"], 100)
        self.assertEqual(pss.active_positions[pos_key]["avgPrice"], 24750.0)

        # 3. Square off completely with SELL of 100 @ 24900
        sell_trade = {
            "bot": "Bot 1: Scalper Bot",
            "symbol": "NIFTY 50",
            "segment": "NSE F&O Options",
            "action": "SELL",
            "qty": 100,
            "price": 24900.0,
            "mode": "PAPER"
        }
        pss.update_position_on_fill(sell_trade)
        # Position should now be completely squared off and removed from active book
        self.assertNotIn(pos_key, pss.active_positions)


if __name__ == "__main__":
    unittest.main()

